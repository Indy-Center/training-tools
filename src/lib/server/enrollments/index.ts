import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	CLOSED_ENROLLMENT_STATUSES,
	enrollmentsTable,
	type Enrollment
} from '$lib/db/schema/enrollments';
import type { CourseCode } from '$lib/courses';
import type { NotificationPreference } from '$lib/db/schema/enrollments';
import { resolveJiraConfig, JiraError } from '$lib/server/jira/client';
import {
	commentOnIssue,
	createEnrollmentIssue,
	transitionIssueToStatus,
	WITHDRAWN_STATUS
} from '$lib/server/jira/enrollment';

export { reconcileEnrollments, type EnrollmentReconcileResult } from './reconcile';

/**
 * Stop retrying a push after this many failures.
 *
 * A malformed payload or a revoked token would otherwise be retried every 15
 * minutes forever. Past the cap the row stops being picked up and becomes a
 * findable record with `jiraSyncError` set, which is a problem a human fixes.
 */
export const MAX_JIRA_SYNC_ATTEMPTS = 5;

export type NewEnrollment = {
	cid: string;
	course: CourseCode;
	submittedName: string;
	submittedRating?: string | null;
	availability: string;
	notificationPreference: NotificationPreference;
};

/**
 * The enrollment a controller currently has in flight, if any.
 *
 * "Open" means it has not reached an end state — completed, rejected or
 * withdrawn. You train one course at a time, so this is what stops a second
 * submission and what the page shows instead of an empty form. A rejected
 * request frees them to submit a different one.
 *
 * The status list is three values, so this stays well inside D1's 100-parameter
 * limit — unlike the roster, where a CID list would not have.
 */
export async function getOpenEnrollment(db: Database, cid: string): Promise<Enrollment | null> {
	const enrollment = await db.query.enrollmentsTable.findFirst({
		where: and(
			eq(enrollmentsTable.cid, cid),
			isNull(enrollmentsTable.withdrawnAt),
			notInArray(enrollmentsTable.status, [...CLOSED_ENROLLMENT_STATUSES])
		),
		orderBy: desc(enrollmentsTable.createdAt)
	});

	return enrollment ?? null;
}

export type SubmitResult = {
	enrollment: Enrollment;
	/** False when Jira could not be reached. The submission still succeeded. */
	filed: boolean;
};

/**
 * Record an enrollment, then try to file it in Jira.
 *
 * The insert commits before Jira is contacted, and a failed push is recorded on
 * the row rather than thrown. That ordering is the whole point of the design:
 * the student's request is ours the moment they submit it, and getting it onto
 * the staff board is our problem to retry, not theirs to redo.
 *
 * One attempt, no inline retry loop — making someone wait on a service that is
 * already unhappy helps nobody when the cron will pick it up within 15 minutes.
 *
 * See .ai/decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md
 */
export async function submitEnrollment(
	db: Database,
	env: Partial<Env> | undefined,
	input: NewEnrollment
): Promise<SubmitResult> {
	const now = new Date();

	const [enrollment] = await db
		.insert(enrollmentsTable)
		.values({
			id: crypto.randomUUID(),
			cid: input.cid,
			course: input.course,
			// Waitlist is the TRK workflow's initial status, so submitting really
			// does put them in the queue.
			status: 'waitlist',
			availability: input.availability,
			notificationPreference: input.notificationPreference,
			submittedName: input.submittedName,
			submittedRating: input.submittedRating ?? null,
			createdAt: now,
			updatedAt: now
		})
		.returning();

	const filed = await fileWithJira(db, env, enrollment);

	return { enrollment, filed };
}

/**
 * Push one enrollment to Jira and record the outcome.
 *
 * Shared by the submit path and the cron reconcile so there is exactly one
 * version of "what filing an enrollment means". Never throws — the outcome is
 * the return value, because both callers want to carry on either way.
 */
export async function fileWithJira(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment
): Promise<boolean> {
	const config = resolveJiraConfig(env);

	if (!config) {
		await recordFailure(db, enrollment.id, 'Jira is not configured (missing url, email or token)');
		console.warn('[training-tools] jira not configured; enrollment saved unfiled', enrollment.id);
		return false;
	}

	try {
		const issue = await createEnrollmentIssue(config, enrollment);

		// The guard on jiraIssueKey makes this a no-op if something else filed the
		// row first, so a duplicate needs two concurrent writers rather than one
		// slow response.
		await db
			.update(enrollmentsTable)
			.set({
				jiraIssueKey: issue.key,
				jiraSyncedAt: new Date(),
				jiraSyncError: null,
				updatedAt: new Date()
			})
			.where(and(eq(enrollmentsTable.id, enrollment.id), isNull(enrollmentsTable.jiraIssueKey)));

		return true;
	} catch (err) {
		const message = err instanceof JiraError ? err.message : String(err);
		await recordFailure(db, enrollment.id, message);
		console.error('[training-tools] jira enrollment push failed', enrollment.id, message);
		return false;
	}
}

async function recordFailure(db: Database, id: string, error: string): Promise<void> {
	const current = await db.query.enrollmentsTable.findFirst({
		where: eq(enrollmentsTable.id, id)
	});

	await db
		.update(enrollmentsTable)
		.set({
			jiraSyncError: error.slice(0, 1000),
			jiraSyncAttempts: (current?.jiraSyncAttempts ?? 0) + 1,
			updatedAt: new Date()
		})
		.where(eq(enrollmentsTable.id, id));
}

/**
 * Withdraw an open enrollment.
 *
 * Scoped by CID as well as id so a guessed id cannot withdraw someone else's
 * request.
 *
 * Moves the Jira issue to `Withdrawn` **and** comments on it. The status is
 * what gets it off the staff's active board; the comment is what says a student
 * did this themselves rather than staff removing them, which `Removed` would
 * otherwise be confused with.
 *
 * Neither failing fails the withdrawal, and they are guarded separately so a
 * refused transition still leaves the explanatory comment. The D1 row is the
 * record we own and it is already committed by that point.
 */
export async function withdrawEnrollment(
	db: Database,
	env: Partial<Env> | undefined,
	id: string,
	cid: string
): Promise<boolean> {
	const now = new Date();

	const [withdrawn] = await db
		.update(enrollmentsTable)
		.set({ withdrawnAt: now, status: 'withdrawn', updatedAt: now })
		.where(
			and(
				eq(enrollmentsTable.id, id),
				eq(enrollmentsTable.cid, cid),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		.returning();

	if (!withdrawn) return false;

	const config = resolveJiraConfig(env);
	if (config && withdrawn.jiraIssueKey) {
		// The comment goes first: if only one of the two lands, an explanation on
		// an open issue is more use to staff than a silent status change.
		try {
			await commentOnIssue(
				config,
				withdrawn.jiraIssueKey,
				`${withdrawn.submittedName} withdrew this request through training.flyindycenter.com.`
			);
		} catch (err) {
			console.error('[training-tools] jira withdrawal comment failed', id, err);
		}

		try {
			await transitionIssueToStatus(config, withdrawn.jiraIssueKey, WITHDRAWN_STATUS);
		} catch (err) {
			console.error('[training-tools] jira withdrawal transition failed', id, err);
		}
	}

	return true;
}

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	enrollmentsTable,
	ROSTER_REMOVABLE_STATUSES,
	type Enrollment,
	type RosterRemovableStatus
} from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { syncStateTable } from '$lib/db/schema/sync-state';
import type { Teacher } from '$lib/db/schema/teachers';
import { isDueForRemoval, restoreByFor } from '$lib/roster-removal';
import { isAssignedTo } from '$lib/teachers';
import { JiraError, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { commentOnIssue, transitionIssueToStatus } from '$lib/server/jira/enrollment';
import {
	NEEDS_CATP_STATUS,
	RATING_EXAM_STATUS,
	REMOVED_STATUS,
	toFacilityDate
} from '$lib/server/jira/progress';
import { notify, notifyDirect, type DirectNotice } from '$lib/server/notify';
import { listTeachers } from '$lib/server/teachers';
import {
	rosterRemovalExaminerMessage,
	rosterRemovalNotice,
	rosterRemovalStudentMessage,
	rosterRemovalSummaryNotice,
	rosterRemovalTeacherMessage,
	type NoticeRequest
} from './notices';
import { syncEnrollmentIssue } from './status-sync';

/**
 * The `roster removals` job: requests whose student left the home roster come
 * off, and come back if the student returns within the restore window.
 *
 * Keyed on where the card and the roster are now, like the certification and
 * announcement passes, never on what caused the change. Every write to a card
 * goes to Jira first and is read back through `applyIssueMove()`, so nothing is
 * set here that Jira refused. Every query goes per row or over a whole table,
 * never an `IN (...)` over the roster (D1's 100-parameter limit).
 *
 * The rule for what is due is `$lib/roster-removal.ts`. See
 * decisions/0037-roster-removal-and-restore.md
 */

/** TRK's name for each stage a removal takes a request from: the card comment says it. */
export const TRK_STAGE_NAMES: Record<RosterRemovableStatus, string> = {
	waitlist: 'Waitlist',
	'in-training': 'In Training',
	'rating-exam': RATING_EXAM_STATUS,
	'needs-catp': NEEDS_CATP_STATUS
};

/**
 * `sync_state` key, written when the job first finishes. Until then a pass is
 * the **first run**: a request whose student left more than 30 days ago is
 * removed and closed at once, with one summary for the training admins and no
 * DMs, rather than opening a window that has already ended.
 */
export const FIRST_RUN_DONE_KEY = 'roster-removals-first-run';

/** How many removals one pass attempts. A busy month has a handful. */
const BATCH_SIZE = 25;

export type RosterRemovalResult = {
	/** True until a pass has finished with nothing left due. */
	firstRun: boolean;
	/** Requests due for removal this pass. */
	due: number;
	/** Of those, removed: card moved and read back, or an unfiled row stamped. */
	removed: number;
	/** Of those removed, closed in the same pass (first run only). */
	closed: number;
	/** Left for the next pass: Jira refused, or could not be reached. */
	refused: number;
	/** Due, but past this pass's batch: left for the next pass. */
	deferred: number;
};

/**
 * One pass of the job. Run by the cron after the status sweep and before the
 * announcements, and after a Jira webhook delivery.
 *
 * The spec's order, each step a function the next ticket inserts:
 *
 * 1. finish restores the board made (05),
 * 2. close windows the board ended (05),
 * 3. restore (05),
 * 4. expire (06),
 * 5. remove — `removeDepartedStudents()`, below.
 *
 * Restores and expiry go first so a student back on the last day is restored,
 * not expired, and a request is never removed and restored in the same pass.
 */
export async function processRosterRemovals(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<RosterRemovalResult> {
	const firstRun = !(await hasFinishedOnce(db));

	// Steps 1–4 go here, in that order.

	const removal = await removeDepartedStudents(db, env, now, firstRun);

	// Finished means nothing due was left behind, so a card Jira refused, or one
	// past the first pass's batch, is still closed at once when it goes through.
	if (firstRun && removal.refused === 0 && removal.deferred === 0) await markFinished(db, now);

	return { firstRun, ...removal };
}

async function hasFinishedOnce(db: Database): Promise<boolean> {
	const row = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, FIRST_RUN_DONE_KEY)
	});
	return row !== undefined;
}

async function markFinished(db: Database, now: Date): Promise<void> {
	await db
		.insert(syncStateTable)
		.values({ key: FIRST_RUN_DONE_KEY, cursorAt: now })
		.onConflictDoNothing();
}

/** The comment a removed card gets. Both dates are facility days. */
export function removalComment(
	leftHomeAt: Date,
	stage: RosterRemovableStatus,
	restoreBy: Date
): string {
	return `Left the ZID home roster on ${toFacilityDate(leftHomeAt)}. Removed automatically; restored to ${TRK_STAGE_NAMES[stage]} if back on the home roster by ${toFacilityDate(restoreBy)}.`;
}

type Person = {
	cid: string;
	firstName: string;
	lastName: string;
	discordId: string | null;
	leftHomeAt: Date | null;
};

/**
 * Remove every request that `isDueForRemoval()` says is due.
 *
 * A filed request: comment, move to Removed, read back (the row becomes
 * `removed` as for any move), then stamp the restore columns. Refused, or not
 * read back as `removed`: the row is left as it was and the next pass tries
 * again; the comment may then be posted twice. An unfiled one is stamped and
 * set to `removed` here, and the reconcile never files it.
 */
async function removeDepartedStudents(
	db: Database,
	env: Partial<Env> | undefined,
	now: Date,
	firstRun: boolean
): Promise<Omit<RosterRemovalResult, 'firstRun'>> {
	const candidates = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...ROSTER_REMOVABLE_STATUSES]),
				isNull(enrollmentsTable.withdrawnAt),
				isNull(enrollmentsTable.rosterRemovedAt),
				isNull(enrollmentsTable.restoreClosedAt),
				isNull(enrollmentsTable.keptInLineAt)
			)
		)
		.orderBy(asc(enrollmentsTable.createdAt));

	const nothing = { due: 0, removed: 0, closed: 0, refused: 0, deferred: 0 };
	if (candidates.length === 0) return nothing;

	// The whole mirror, removed members included: a student who left VATUSA
	// keeps their row, and it is what dates their leaving.
	const people = new Map<string, Person>(
		(
			await db
				.select({
					cid: rosterMembersTable.cid,
					firstName: rosterMembersTable.firstName,
					lastName: rosterMembersTable.lastName,
					discordId: rosterMembersTable.discordId,
					leftHomeAt: rosterMembersTable.leftHomeAt
				})
				.from(rosterMembersTable)
		).map((person) => [person.cid, person])
	);

	const due = candidates.filter((request) =>
		isDueForRemoval(request, people.get(request.cid) ?? null, now)
	);
	if (due.length === 0) return nothing;

	const config = resolveJiraConfig(env);
	const teachers = await listTeachers(db);
	const base = env?.JIRA_BASE_URL?.trim().replace(/\/$/, '');
	const summary: (NoticeRequest & { was: string; leftHomeOn: string })[] = [];
	let removed = 0;
	let refused = 0;

	const batch = due.slice(0, BATCH_SIZE);

	for (const request of batch) {
		const member = people.get(request.cid)!;
		const leftHomeAt = member.leftHomeAt!;
		const restoreBy = restoreByFor(leftHomeAt);
		const stage = request.status as RosterRemovableStatus;
		// The first run's old departures: their window ended before this existed.
		const closeNow = firstRun && restoreBy.getTime() < now.getTime();

		if (request.jiraIssueKey) {
			const moved =
				config && (await moveToRemoved(db, env, config, request, leftHomeAt, stage, restoreBy));
			if (!moved) {
				refused += 1;
				continue;
			}
		}

		const [stamped] = await db
			.update(enrollmentsTable)
			.set({
				...(request.jiraIssueKey ? {} : { status: 'removed' as const }),
				rosterRemovedAt: now,
				rosterRemovedFrom: stage,
				leftHomeAt,
				restoreBy,
				...(closeNow ? { restoreClosedAt: now, restoreClosedReason: 'expired' as const } : {}),
				updatedAt: now
			})
			.where(
				and(
					eq(enrollmentsTable.id, request.id),
					isNull(enrollmentsTable.rosterRemovedAt),
					request.jiraIssueKey
						? eq(enrollmentsTable.status, 'removed')
						: isNull(enrollmentsTable.jiraIssueKey)
				)
			)
			.returning({ id: enrollmentsTable.id });
		if (!stamped) continue;

		removed += 1;

		const described: NoticeRequest = {
			name: `${member.firstName} ${member.lastName}`.trim() || request.submittedName,
			cid: request.cid,
			course: request.course,
			teacher: request.teacher,
			examiner: request.reInstructor,
			issueKey: request.jiraIssueKey,
			issueUrl: base && request.jiraIssueKey ? `${base}/browse/${request.jiraIssueKey}` : null
		};

		if (closeNow) {
			summary.push({ ...described, was: stage, leftHomeOn: toFacilityDate(leftHomeAt) });
		} else {
			await announceRemoval(env, request, described, member, people, teachers, {
				leftHomeAt,
				restoreBy
			});
		}
	}

	if (summary.length > 0) await notify(env, rosterRemovalSummaryNotice(summary));

	return {
		due: due.length,
		removed,
		closed: summary.length,
		refused,
		deferred: due.length - batch.length
	};
}

/**
 * Comment, move to Removed, and read the card back. True once the row reads
 * `removed`; false, having logged why, for anything else.
 */
async function moveToRemoved(
	db: Database,
	env: Partial<Env> | undefined,
	config: JiraConfig,
	request: Enrollment,
	leftHomeAt: Date,
	stage: RosterRemovableStatus,
	restoreBy: Date
): Promise<boolean> {
	const issueKey = request.jiraIssueKey!;

	try {
		await commentOnIssue(config, issueKey, removalComment(leftHomeAt, stage, restoreBy));
		await transitionIssueToStatus(config, issueKey, REMOVED_STATUS);
	} catch (err) {
		console.error(
			'[training-tools] roster removal refused',
			issueKey,
			err instanceof JiraError ? err.message : err
		);
		return false;
	}

	// The `Removed` date is stamped by the read-back, as for any move to Removed.
	try {
		await syncEnrollmentIssue(db, env, issueKey);
	} catch (err) {
		console.error('[training-tools] roster removal: could not read back', issueKey, err);
		return false;
	}

	const read = await db.query.enrollmentsTable.findFirst({
		columns: { status: true },
		where: eq(enrollmentsTable.id, request.id)
	});
	if (read?.status !== 'removed') {
		console.warn('[training-tools] roster removal: card not read back as Removed', issueKey);
		return false;
	}
	return true;
}

/**
 * Tell the training admins, and privately: the student (unless they chose
 * email), the teacher if the request was at In Training, and the examiner if
 * one had claimed it. Discord ids come from the roster mirror; anyone with
 * none is skipped, and the admins' notice says who.
 */
async function announceRemoval(
	env: Partial<Env> | undefined,
	request: Enrollment,
	described: NoticeRequest,
	member: Person,
	people: Map<string, Person>,
	teachers: Teacher[],
	dates: { leftHomeAt: Date; restoreBy: Date }
): Promise<void> {
	const restoreBy = toFacilityDate(dates.restoreBy);
	const untold: string[] = [];

	const tell = async (who: string, discordId: string | null, message: DirectNotice) => {
		if (!discordId) {
			untold.push(`${who} (no Discord ID)`);
			return;
		}
		if ((await notifyDirect(env, discordId, message)) === 'failed') {
			untold.push(`${who} (message refused)`);
		}
	};

	// The teacher or examiner a card names, by initials: an active teacher first.
	const discordIdOf = (initials: string) => {
		const matches = teachers.filter((teacher) => isAssignedTo(initials, teacher));
		const teacher = matches.find((t) => t.removedAt === null) ?? matches[0];
		return teacher ? (people.get(teacher.cid)?.discordId ?? null) : null;
	};

	if (request.notificationPreference === 'email') {
		untold.push('the student (chose email)');
	} else {
		await tell(
			'the student',
			member.discordId,
			rosterRemovalStudentMessage({ course: request.course, restoreBy })
		);
	}

	const about = { name: described.name, course: request.course, restoreBy };
	if (request.status === 'in-training' && request.teacher) {
		await tell(
			`teacher ${request.teacher}`,
			discordIdOf(request.teacher),
			rosterRemovalTeacherMessage(about)
		);
	}
	if (request.reInstructor) {
		await tell(
			`examiner ${request.reInstructor}`,
			discordIdOf(request.reInstructor),
			rosterRemovalExaminerMessage(about)
		);
	}

	await notify(
		env,
		rosterRemovalNotice({
			...described,
			was: request.status,
			leftHomeOn: toFacilityDate(dates.leftHomeAt),
			restoreBy,
			untold
		})
	);
}

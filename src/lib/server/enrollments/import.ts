import { and, asc, desc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { boardProblemsNotice, type BoardProblem } from '$lib/server/jira/notices';
import { resolveStatusUpdate } from '$lib/server/jira/status';
import { notify } from '$lib/server/notify';
import { issueUrl, resolveJiraConfig } from '$lib/server/jira/client';
import { listBoardIssues } from '$lib/server/jira/issues';
import { parseBoardIssue, type BoardEnrollment } from '$lib/server/jira/board-issue';
import { isInRestoreWindow } from '$lib/roster-removal';
import { importLeftUnlinkedNotice } from './notices';
import { applyIssueMove } from './status-sync';

/**
 * Brings TRK issues filed by hand on the board into `enrollments`.
 *
 * The form files most requests, but staff also create Student Enrollment issues
 * directly — the whole backlog was moved onto the board that way on 2026-09-05,
 * before this app existed. Without a row those students are invisible here: no
 * waitlist position on `/`, missing from `/waitlist`, and free to submit a second
 * request for a course they are already queued for.
 *
 * This is the only code that **creates** rows from Jira. The status sweep and
 * the webhook only update rows that already exist, and stay that way.
 *
 * Every run reads the whole board, not a window: an issue filed by hand months
 * ago and never touched since is exactly what this is for, and a cursor would
 * have walked straight past it. TRK is a few dozen issues, so this is one page.
 *
 * ## Not creating a second row for an issue the form filed
 *
 * The form commits its row, files the issue, *then* writes the key back. An
 * issue caught between those last two steps looks hand-filed. So before
 * inserting, the import looks for an unfiled row with the same CID and course
 * and **adopts** it — writing the key onto it — instead. The form's own
 * write-back is guarded on a null key, so it then does nothing. The same
 * adoption catches an issue the form filed whose write-back failed outright,
 * which would otherwise be filed a second time by the reconcile.
 *
 * Anything still racing after that hits the unique index on `jira_issue_key`,
 * and the insert does nothing.
 *
 * ## A request the roster removals job took off before it was filed
 *
 * In its restore window, it is adopted like any other, and the window closes
 * `moved-on-board`: the card's stage stands, and nobody is told. Once the
 * window has closed it is never adopted, and no row is created either: the
 * card stays unlinked, and the training admins are told once per card (marked
 * in `sync_state`). See decisions/0037-roster-removal-and-restore.md
 */

export type ImportResult = {
	/** Issues Jira returned. */
	read: number;
	/** New rows created for hand-filed issues. */
	imported: number;
	/** Unfiled rows of ours that turned out to already have an issue. */
	adopted: number;
	/**
	 * Issues with no row that could not become one: logged individually, or,
	 * for a card left unlinked after a roster removal, told to the admins once.
	 */
	skipped: number;
	/** False when the page cap was hit; the rest are picked up on a later run. */
	complete: boolean;
	skippedReason?: 'jira-not-configured';
};

export async function importBoardIssues(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<ImportResult> {
	const config = resolveJiraConfig(env);
	if (!config) {
		return {
			read: 0,
			imported: 0,
			adopted: 0,
			skipped: 0,
			complete: true,
			skippedReason: 'jira-not-configured'
		};
	}

	const { issues, complete } = await listBoardIssues(config);

	// Every key we already hold, compared in memory. One unparameterised query,
	// rather than `NOT IN (...)` over the board's keys, which D1's 100-parameter
	// limit would break once TRK passes a hundred issues.
	const known = new Set(
		(
			await db
				.select({ key: enrollmentsTable.jiraIssueKey })
				.from(enrollmentsTable)
				.where(isNotNull(enrollmentsTable.jiraIssueKey))
		).map((row) => row.key)
	);

	const result: ImportResult = {
		read: issues.length,
		imported: 0,
		adopted: 0,
		skipped: 0,
		complete
	};

	// Everything on the board the app cannot read, for the tech team.
	const problems: BoardProblem[] = [];

	for (const issue of issues) {
		if (known.has(issue.key)) {
			// A card we hold can still be sitting in a status we do not know — a
			// status renamed on the board. The sweep ignores it; say so here, where
			// the whole board is read every run.
			const resolution = resolveStatusUpdate(issue);
			if (resolution.action === 'unknown-status') {
				problems.push({
					issueKey: issue.key,
					reason: 'unknown-status',
					detail: resolution.statusName
				});
			}
			continue;
		}

		const parsed = parseBoardIssue(issue);
		if (!parsed.ok) {
			// Left alone, and said so every run: it is something staff can fix on
			// the issue, and a silent skip would never get fixed.
			console.warn(
				'[training-tools] TRK issue not imported',
				JSON.stringify({ issue: issue.key, reason: parsed.reason })
			);
			problems.push({
				issueKey: issue.key,
				reason: parsed.reason,
				detail:
					parsed.reason === 'unknown-status'
						? (issue.fields?.status?.name ?? null)
						: parsed.reason === 'unknown-course'
							? (issue.fields?.[JIRA_FIELDS.course]?.value ?? null)
							: null
			});
			result.skipped += 1;
			continue;
		}

		if (await adoptUnfiledRow(db, parsed.enrollment, now)) {
			// The row predates the issue, so its status is still our `waitlist`.
			// Bring it up to what the board says, through the one writer. Catching
			// up is not a move anyone has just made, so it is not dated.
			await applyIssueMove(db, issue, parsed.enrollment.updatedAt, now);
			result.adopted += 1;
			continue;
		}

		const closed = await closedAfterRemoval(db, parsed.enrollment);
		if (closed) {
			// The student's request closed while they were off the home roster.
			// Left unlinked rather than brought back as a new request.
			await reportLeftUnlinked(db, env, parsed.enrollment, closed, now).catch((err) =>
				console.error('[training-tools] left-unlinked notice failed', err)
			);
			result.skipped += 1;
			continue;
		}

		if (await insertImportedRow(db, parsed.enrollment, now)) result.imported += 1;
	}

	await reportBoardProblems(db, env, problems, now).catch((err) =>
		console.error('[training-tools] board problems notice failed', err)
	);

	return result;
}

/** `sync_state` key: the set of board problems the tech team was last told about. */
const BOARD_PROBLEMS_KEY = 'jira-board-problems-notified';

/**
 * Tell the tech team what on the board the app cannot read — once per distinct
 * set, not every ten minutes, the way the teacher-dropdown check does. A
 * notice that could not be sent is retried next run; a board that comes clean
 * forgets what was sent, so the same problem returning is news again.
 */
async function reportBoardProblems(
	db: Database,
	env: Partial<Env> | undefined,
	problems: BoardProblem[],
	now: Date
): Promise<void> {
	const last = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, BOARD_PROBLEMS_KEY)
	});

	const signature =
		problems.length === 0
			? null
			: JSON.stringify(
					problems
						.map((problem) => [problem.issueKey, problem.reason, problem.detail])
						.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
				);

	if ((last?.value ?? null) === signature) return;

	if (signature !== null) {
		const notice = boardProblemsNotice(problems, env?.JIRA_BASE_URL);
		if (!notice || (await notify(env, notice)) !== 'sent') return;
	}

	await db
		.insert(syncStateTable)
		.values({ key: BOARD_PROBLEMS_KEY, cursorAt: now, value: signature })
		.onConflictDoUpdate({ target: syncStateTable.key, set: { cursorAt: now, value: signature } });
}

/** Write the issue's key onto our unfiled row for the same request, if there is one. */
async function adoptUnfiledRow(
	db: Database,
	enrollment: BoardEnrollment,
	now: Date
): Promise<boolean> {
	const candidate = await db.query.enrollmentsTable.findFirst({
		where: and(
			eq(enrollmentsTable.cid, enrollment.cid),
			eq(enrollmentsTable.course, enrollment.course),
			isNull(enrollmentsTable.jiraIssueKey),
			isNull(enrollmentsTable.withdrawnAt),
			// Never one whose restore window has closed: that request is over.
			or(isNull(enrollmentsTable.rosterRemovedAt), isNull(enrollmentsTable.restoreClosedAt))
		),
		orderBy: asc(enrollmentsTable.createdAt)
	});
	if (!candidate) return false;

	// A request the roster removals job took off before it was filed, still in
	// its window: staff filing a card for it is a move on the board, so the
	// window closes and the card's stage stands. Nobody is told.
	const closesWindow = isInRestoreWindow(candidate)
		? { restoreClosedAt: now, restoreClosedReason: 'moved-on-board' as const, updatedAt: now }
		: {};

	// Guarded on a null key, like the form's own write-back: whichever of the two
	// lands first wins, and the other changes nothing.
	const adopted = await db
		.update(enrollmentsTable)
		.set({
			jiraIssueKey: enrollment.issueKey,
			jiraSyncedAt: now,
			jiraSyncError: null,
			...closesWindow
		})
		.where(and(eq(enrollmentsTable.id, candidate.id), isNull(enrollmentsTable.jiraIssueKey)))
		.returning({ id: enrollmentsTable.id });

	return adopted.length > 0;
}

/**
 * The student's latest request for the course, when it is one the roster
 * removals job took off before it was filed and whose window has since closed.
 * Only the latest: once they have had another request for the course, an old
 * closed one no longer stands in the way of a card.
 */
async function closedAfterRemoval(
	db: Database,
	enrollment: BoardEnrollment
): Promise<Enrollment | undefined> {
	const latest = await db.query.enrollmentsTable.findFirst({
		where: and(
			eq(enrollmentsTable.cid, enrollment.cid),
			eq(enrollmentsTable.course, enrollment.course)
		),
		orderBy: desc(enrollmentsTable.createdAt)
	});
	if (!latest || latest.jiraIssueKey) return undefined;
	return latest.rosterRemovedAt && latest.restoreClosedAt ? latest : undefined;
}

/** `sync_state` key prefix: a card the training admins were told was left unlinked. */
const LEFT_UNLINKED_PREFIX = 'import-left-unlinked:';

/**
 * Tell the training admins once per card that it was left unlinked. A notice
 * that could not be sent is retried next run.
 */
async function reportLeftUnlinked(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: BoardEnrollment,
	request: Enrollment,
	now: Date
): Promise<void> {
	const key = `${LEFT_UNLINKED_PREFIX}${enrollment.issueKey}`;
	const told = await db.query.syncStateTable.findFirst({ where: eq(syncStateTable.key, key) });
	if (told) return;

	const notice = importLeftUnlinkedNotice({
		name: request.submittedName,
		cid: enrollment.cid,
		course: enrollment.course,
		teacher: null,
		examiner: null,
		issueKey: enrollment.issueKey,
		issueUrl: issueUrl(env?.JIRA_BASE_URL, enrollment.issueKey)
	});
	if ((await notify(env, notice)) !== 'sent') return;

	await db
		.insert(syncStateTable)
		.values({ key, cursorAt: now, value: null })
		.onConflictDoNothing({ target: syncStateTable.key });
}

async function insertImportedRow(
	db: Database,
	enrollment: BoardEnrollment,
	now: Date
): Promise<boolean> {
	const inserted = await db
		.insert(enrollmentsTable)
		.values({
			id: crypto.randomUUID(),
			cid: enrollment.cid,
			course: enrollment.course,
			status: enrollment.status,
			teacher: enrollment.teacher,
			reInstructor: enrollment.reInstructor,
			availability: enrollment.availability,
			vatusaAssignedOn: enrollment.vatusaAssignedOn,
			vatusaCompletedOn: enrollment.vatusaCompletedOn,
			notificationPreference: enrollment.notificationPreference,
			submittedName: enrollment.name,
			jiraIssueKey: enrollment.issueKey,
			jiraSyncedAt: now,
			jiraStatusSyncedAt: now,
			jiraUpdatedAt: enrollment.updatedAt,
			// Queue order is by `createdAt`, and for these that is `Waitlisted`.
			createdAt: enrollment.waitlistedAt,
			updatedAt: now,
			importedAt: now
		})
		.onConflictDoNothing({ target: enrollmentsTable.jiraIssueKey })
		.returning({ id: enrollmentsTable.id });

	return inserted.length > 0;
}

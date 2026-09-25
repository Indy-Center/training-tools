import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { syncStateTable } from '$lib/db/schema/sync-state';
import { resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { fetchEnrollmentIssue, searchEnrollmentIssues } from '$lib/server/jira/issues';
import {
	isStale,
	parseJiraTimestamp,
	resolveStatusUpdate,
	type JiraStatusIssue
} from '$lib/server/jira/status';

/**
 * Keeps `enrollments.status` and `teacher` in step with the TRK board.
 *
 * Two ways in, one way to write:
 *
 * - `sweepEnrollmentStatuses()` runs on the 15-minute cron and is the source of
 *   truth. It catches everything the webhook misses — deliveries Jira gave up
 *   on, changes made before the webhook existed, the first backfill.
 * - The Jira webhook applies the delivered issue directly, so a student sees
 *   "In training" within seconds rather than minutes.
 *
 * Both end in `applyIssueStatus()`, which orders every write by when that state
 * was true in Jira, so the two can arrive in any order. See
 * .ai/decisions/0014-enrollment-status-from-jira.md
 */

export type ApplyOutcome =
	/** Status or teacher changed. */
	| 'updated'
	/** Read, and already matched. */
	| 'unchanged'
	/**
	 * No row holds this key yet — an issue filed by hand on the board. Left for
	 * `importBoardIssues()`, the one place rows are created from Jira.
	 */
	| 'no-row'
	/** The student withdrew here; Jira does not get to reopen it. */
	| 'withdrawn-locally'
	/** A status name we do not recognise. Logged, row left alone. */
	| 'unknown-status'
	/** Older than the state already applied — an out-of-order delivery. */
	| 'stale';

/**
 * Write one issue's status onto its enrollment row.
 *
 * `observedAt` is when this state of the issue was true: the webhook's event
 * time, or the issue's `updated` from a read. A state older than the one
 * already applied is refused (`isStale()`), so the order deliveries and sweeps
 * arrive in cannot roll a status back.
 *
 * **A row the student withdrew here is never touched.** Withdrawing stamps
 * `withdrawnAt` first and moves the Jira issue second; if that transition
 * failed, Jira still says Waitlist, and trusting it would put back into the
 * queue someone who asked to leave it.
 */
export async function applyIssueStatus(
	db: Database,
	issue: JiraStatusIssue,
	observedAt: Date | null,
	now = new Date()
): Promise<ApplyOutcome> {
	const resolution = resolveStatusUpdate(issue);

	if (resolution.action === 'unknown-status') {
		console.warn(
			'[training-tools] unrecognised TRK status',
			JSON.stringify({ issue: issue.key, status: resolution.statusName })
		);
		return 'unknown-status';
	}

	const { status, teacher } = resolution.update;

	// Compare-and-set. Two deliveries handled at once both read the row before
	// either writes, so each write is conditional on the row still holding the
	// `jiraUpdatedAt` it was checked against. The loser re-reads: if it was the
	// older state it is now stale and stops; if it was the newer one it applies
	// on top. Either way the newest state wins, whatever order they finish in.
	for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
		const row = await db.query.enrollmentsTable.findFirst({
			where: eq(enrollmentsTable.jiraIssueKey, issue.key)
		});

		if (!row) return 'no-row';
		if (row.withdrawnAt) return 'withdrawn-locally';
		if (isStale(row.jiraUpdatedAt, observedAt)) return 'stale';

		const changed = row.status !== status || row.teacher !== teacher;
		const jiraUpdatedAt = observedAt ?? row.jiraUpdatedAt;

		const written = await db
			.update(enrollmentsTable)
			.set(
				changed
					? { status, teacher, jiraUpdatedAt, jiraStatusSyncedAt: now, updatedAt: now }
					: { jiraUpdatedAt, jiraStatusSyncedAt: now }
			)
			.where(
				and(
					eq(enrollmentsTable.id, row.id),
					row.jiraUpdatedAt
						? eq(enrollmentsTable.jiraUpdatedAt, row.jiraUpdatedAt)
						: isNull(enrollmentsTable.jiraUpdatedAt)
				)
			)
			.returning({ id: enrollmentsTable.id });

		if (written.length > 0) return changed ? 'updated' : 'unchanged';
	}

	// Still contended after every attempt. Leave it: the next sweep re-reads the
	// issue and applies whatever is newest.
	console.warn('[training-tools] enrollment status write kept losing a race', issue.key);
	return 'stale';
}

/** Attempts before a contended write gives up and leaves it to the sweep. */
const MAX_WRITE_ATTEMPTS = 3;

export type SyncIssueResult =
	{ ok: true; outcome: ApplyOutcome | 'issue-gone' } | { ok: false; reason: 'jira-not-configured' };

/**
 * Re-read one issue from Jira and apply it.
 *
 * The webhook's fallback, for a delivery whose body carries no status (for
 * example if "Exclude body" is ever ticked on the webhook). Ordered by the
 * issue's own `updated`. Throws on a Jira failure, so the webhook can answer
 * 5xx and Jira retries.
 */
export async function syncEnrollmentIssue(
	db: Database,
	env: Partial<Env> | undefined,
	issueKey: string
): Promise<SyncIssueResult> {
	const config = resolveJiraConfig(env);
	if (!config) return { ok: false, reason: 'jira-not-configured' };

	const issue = await fetchEnrollmentIssue(config, issueKey);
	if (!issue) return { ok: true, outcome: 'issue-gone' };

	return {
		ok: true,
		outcome: await applyIssueStatus(db, issue, parseJiraTimestamp(issue.fields?.updated))
	};
}

/** `sync_state` key for the sweep's cursor. */
export const SWEEP_CURSOR_KEY = 'jira-status-sweep';

/**
 * Re-read a few minutes before the cursor, so an update Jira indexed a moment
 * after we last searched is not skipped. Costs a handful of re-reads; applying
 * an unchanged issue is a no-op.
 */
const CURSOR_OVERLAP_MINUTES = 5;

export type SweepResult = {
	/** Issues Jira returned. */
	read: number;
	updated: number;
	/** True on the first run, or if the cursor was lost: read every issue. */
	full: boolean;
	/** False when the page cap was hit; the cursor was left alone. */
	complete: boolean;
	skipped?: 'jira-not-configured';
};

async function readCursor(db: Database): Promise<Date | null> {
	const row = await db.query.syncStateTable.findFirst({
		where: eq(syncStateTable.key, SWEEP_CURSOR_KEY)
	});
	return row?.cursorAt ?? null;
}

async function writeCursor(db: Database, cursorAt: Date): Promise<void> {
	await db
		.insert(syncStateTable)
		.values({ key: SWEEP_CURSOR_KEY, cursorAt })
		.onConflictDoUpdate({ target: syncStateTable.key, set: { cursorAt } });
}

/** Minutes of history to ask Jira for, or null for everything. */
export function sweepWindowMinutes(cursor: Date | null, now: Date): number | null {
	if (!cursor) return null;
	const elapsed = Math.max(0, now.getTime() - cursor.getTime()) / 60_000;
	return Math.ceil(elapsed) + CURSOR_OVERLAP_MINUTES;
}

/**
 * Pull every TRK change since the last successful sweep.
 *
 * One or two Jira requests per run regardless of roster size, and **no
 * `IN (...)` over issue keys or CIDs** — each issue is written by its own
 * statement, so D1's 100-parameter limit cannot bite.
 *
 * The cursor only moves after every issue in the window has been applied. A
 * sweep that throws halfway leaves it where it was, and the next run re-reads
 * the same window.
 */
export async function sweepEnrollmentStatuses(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<SweepResult> {
	const config: JiraConfig | null = resolveJiraConfig(env);
	if (!config) {
		return { read: 0, updated: 0, full: false, complete: true, skipped: 'jira-not-configured' };
	}

	const cursor = await readCursor(db);
	const window = sweepWindowMinutes(cursor, now);
	const { issues, complete } = await searchEnrollmentIssues(config, window);

	let updated = 0;
	for (const issue of issues) {
		const observedAt = parseJiraTimestamp(issue.fields?.updated);
		if ((await applyIssueStatus(db, issue, observedAt, now)) === 'updated') updated += 1;
	}

	if (complete) await writeCursor(db, now);

	return { read: issues.length, updated, full: window === null, complete };
}

/**
 * Reading a job's recorded health.
 *
 * Pure, so the rules for "is this a problem" are testable without a database.
 * The rows are written by `$lib/server/job-health.ts`.
 */

/** How often the cron fires. Mirrors `triggers.crons` in wrangler.jsonc. */
export const CRON_INTERVAL_MINUTES = 15;

/**
 * How long without a run before a scheduled job counts as not running.
 *
 * Three intervals: one late run is a slow invocation, three missed ones is the
 * cron not firing.
 */
export const STALE_AFTER_MINUTES = CRON_INTERVAL_MINUTES * 3;

export type JobHealthState =
	| 'ok'
	/** Its last run threw. */
	| 'failing'
	/** Scheduled, but has not run for too long. */
	| 'stale'
	/** Nothing recorded yet. */
	| 'never';

export const JOB_HEALTH_LABELS: Record<JobHealthState, string> = {
	ok: 'OK',
	failing: 'Failing',
	stale: 'Not running',
	never: 'No runs recorded'
};

type Recorded = { lastRunAt: Date; lastOk: boolean };

/**
 * `scheduled` is false for the Jira webhook, which runs when staff change an
 * issue rather than on a clock — a quiet day on the board is not a fault.
 */
export function jobHealthState(
	row: Recorded | null | undefined,
	now: Date,
	{ scheduled = true }: { scheduled?: boolean } = {}
): JobHealthState {
	if (!row) return 'never';

	const minutesSince = (now.getTime() - new Date(row.lastRunAt).getTime()) / 60_000;
	if (scheduled && minutesSince > STALE_AFTER_MINUTES) return 'stale';

	return row.lastOk ? 'ok' : 'failing';
}

/** Whether a state is something an admin should look at. */
export function needsAttention(state: JobHealthState): boolean {
	return state === 'failing' || state === 'stale';
}

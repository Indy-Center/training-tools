import { sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { jobHealthTable, type JobHealth } from '$lib/db/schema/job-health';

/** The Jira webhook's row. Not a cron job, but it reports the same way. */
export const JIRA_WEBHOOK_JOB = 'jira webhook';

/** One finished run of a job: what it reported, or what it threw. */
export type JobRun = { name: string; at: Date } & (
	{ ok: true; summary: object | null } | { ok: false; error: unknown }
);

/** Long enough for a real error or a job's counts; short enough to stay a row. */
const MAX_TEXT_LENGTH = 2000;

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	return typeof error === 'string' ? error : JSON.stringify(error);
}

/**
 * Write how a job's run went onto its row.
 *
 * A success clears the failure streak but leaves the last error in place,
 * dated by `lastFailureAt` — "it failed twice this morning and has been fine
 * since" is worth being able to see. A run that reported nothing leaves the
 * last summary alone, so the row keeps the last time the job did something.
 */
export async function recordJobRun(db: Database, run: JobRun): Promise<void> {
	if (run.ok) {
		const set = {
			lastRunAt: run.at,
			lastOk: true,
			lastSuccessAt: run.at,
			failuresInARow: 0,
			...(run.summary
				? {
						lastSummary: JSON.stringify(run.summary).slice(0, MAX_TEXT_LENGTH),
						lastSummaryAt: run.at
					}
				: {})
		};

		await db
			.insert(jobHealthTable)
			.values({ name: run.name, ...set })
			.onConflictDoUpdate({ target: jobHealthTable.name, set });
		return;
	}

	const set = {
		lastRunAt: run.at,
		lastOk: false,
		lastFailureAt: run.at,
		lastError: errorMessage(run.error).slice(0, MAX_TEXT_LENGTH)
	};

	await db
		.insert(jobHealthTable)
		.values({ name: run.name, ...set, failuresInARow: 1 })
		.onConflictDoUpdate({
			target: jobHealthTable.name,
			set: { ...set, failuresInARow: sql`${jobHealthTable.failuresInARow} + 1` }
		});
}

/** Every recorded job, by name. The table is a handful of rows. */
export async function getJobHealth(db: Database): Promise<Map<string, JobHealth>> {
	const rows = await db.select().from(jobHealthTable);
	return new Map(rows.map((row) => [row.name, row]));
}

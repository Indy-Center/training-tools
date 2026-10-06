import { eq, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { jobHealthTable, type JobHealth } from '$lib/db/schema/job-health';
import { SITE_URL } from '$lib/config';
import { notify, type Notice } from '$lib/server/notify';

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

/**
 * What a run means for the training admins, given how many runs in a row had
 * failed before it. Pure.
 *
 * Told when a job **starts** failing and when it **recovers** — not on every
 * failed run, which for a broken job would be a message every fifteen minutes.
 */
export function jobAlert(run: JobRun, failuresBefore: number): Notice | null {
	if (!run.ok && failuresBefore === 0) {
		return {
			audience: 'training-admins',
			tone: 'warning',
			title: `Background job failing: ${run.name}`,
			summary:
				'Its last run failed. It is tried again on every run; you will hear again when it recovers, not before.',
			link: `${SITE_URL}/admin`,
			fields: [{ label: 'Error', value: errorMessage(run.error) }]
		};
	}

	if (run.ok && failuresBefore > 0) {
		return {
			audience: 'training-admins',
			title: `Background job recovered: ${run.name}`,
			summary: `Working again after ${failuresBefore} failed ${failuresBefore === 1 ? 'run' : 'runs'}.`,
			link: `${SITE_URL}/admin`
		};
	}

	return null;
}

/**
 * Record a run, and tell the training admins if it started a failure or ended
 * one. Like recording itself, the alert never fails the job.
 */
export async function recordAndAlert(
	db: Database,
	env: Partial<Env> | undefined,
	run: JobRun
): Promise<void> {
	const before = await db.query.jobHealthTable.findFirst({
		where: eq(jobHealthTable.name, run.name)
	});
	await recordJobRun(db, run);

	const notice = jobAlert(run, before?.failuresInARow ?? 0);
	if (notice) await notify(env, notice);
}

/** Every recorded job, by name. The table is a handful of rows. */
export async function getJobHealth(db: Database): Promise<Map<string, JobHealth>> {
	const rows = await db.select().from(jobHealthTable);
	return new Map(rows.map((row) => [row.name, row]));
}

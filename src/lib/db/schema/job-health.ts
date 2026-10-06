import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';

export type JobHealth = InferSelectModel<typeof jobHealthTable>;

/**
 * How each background job last went, one row per job.
 *
 * The cron's jobs and the Jira webhook each write their row as they finish, so
 * `/admin` can answer "is it running, and did it work" without anyone tailing
 * the Worker's logs. Before this the only trace of a failed job was a log line.
 *
 * **Latest state, not a history.** Seven jobs run every fifteen minutes; a row
 * per run would be several hundred a day for a question that is only ever
 * "what about now". The row is overwritten, and `failuresInARow` carries the
 * one piece of history worth having.
 *
 * Bookkeeping, like `sync_state`: losing a row costs nothing but the answer
 * until the job next runs.
 */
export const jobHealthTable = sqliteTable('job_health', {
	/** The job's name, as `scheduledJobs()` lists it — or `jira webhook`. */
	name: text('name').primaryKey(),

	lastRunAt: integer('last_run_at', { mode: 'timestamp' }).notNull(),
	/** Whether that last run succeeded. */
	lastOk: integer('last_ok', { mode: 'boolean' }).notNull(),

	lastSuccessAt: integer('last_success_at', { mode: 'timestamp' }),
	lastFailureAt: integer('last_failure_at', { mode: 'timestamp' }),
	/** The last failure's message. Kept after a recovery, with `lastFailureAt` to date it. */
	lastError: text('last_error'),
	/** 0 once a run succeeds. */
	failuresInARow: integer('failures_in_a_row').notNull().default(0),

	/**
	 * What the job last reported doing, as JSON text. Most runs change nothing
	 * and report nothing; this is the last one that did, with when.
	 */
	lastSummary: text('last_summary'),
	lastSummaryAt: integer('last_summary_at', { mode: 'timestamp' })
});

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';

export type SyncState = InferSelectModel<typeof syncStateTable>;

/**
 * Where a scheduled job got up to, keyed by job name.
 *
 * Bookkeeping, not training data: losing a row costs one full re-read on the
 * next run and nothing else, because every job that uses it is idempotent.
 *
 * The Jira status sweep (`jira-status-sweep`) records the start of its last
 * successful run, so the next one asks Jira only for issues updated since.
 *
 * The Jira teacher-dropdown check (`jira-teacher-options`) keeps a signature
 * of the drift it last reported in `value`, so training admins hear about a
 * new difference once rather than every ten minutes.
 *
 * The roster sync (`roster-removal-hold`) keeps removals it refused for being
 * over the limit: `cursorAt` is when the hold started, `value` the held CIDs
 * (a record only; each run works out who is held from who is missing).
 * Losing that row restarts the hold's 24 hours.
 */
export const syncStateTable = sqliteTable('sync_state', {
	key: text('key').primaryKey(),
	/** Start of the last run that completed. */
	cursorAt: integer('cursor_at', { mode: 'timestamp' }).notNull(),
	/** Anything else a job needs to remember between runs. */
	value: text('value')
});

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';

export type SyncState = InferSelectModel<typeof syncStateTable>;

/**
 * Where a scheduled job got up to, keyed by job name.
 *
 * Bookkeeping, not training data: losing a row costs one full re-read on the
 * next run and nothing else, because every job that uses it is idempotent.
 *
 * Today only the Jira status sweep uses it (`jira-status-sweep`), recording the
 * start of its last successful run so the next one asks Jira only for issues
 * updated since.
 */
export const syncStateTable = sqliteTable('sync_state', {
	key: text('key').primaryKey(),
	/** Start of the last run that completed. */
	cursorAt: integer('cursor_at', { mode: 'timestamp' }).notNull()
});

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The last good document the CMS answered for each path, so what it feeds
 * outlives a CMS outage and the CMS is not asked on every page load. See
 * `$lib/server/cms` and decisions/0036-teacher-resources-from-the-cms.md.
 *
 * Bookkeeping, like `sync_state`: losing a row costs one read of the CMS.
 */
export const cmsCopiesTable = sqliteTable('cms_copies', {
	/** The CMS path, as `/api/training/resources`. */
	key: text('key').primaryKey(),
	/** The document as JSON text, as the CMS answered it. Only ever one that passed its check. */
	document: text('document').notNull(),
	fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull()
});

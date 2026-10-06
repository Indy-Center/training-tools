import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { ACTIVITY_EVENTS, type ActivityDetail } from '$lib/activity';

export type ActivityLogEntry = InferSelectModel<typeof activityLogTable>;
export type InsertActivityLogEntry = InferInsertModel<typeof activityLogTable>;

/**
 * What happened to a controller, for their timeline: roster joins and
 * departures for everyone, and teacher roster, role and profile changes.
 *
 * Append-only. Nothing updates or deletes a row.
 *
 * **Temporary.** This is meant to move to a central log on identity, where
 * every app's history for a person will live. Until then it keys on `cid`
 * with no foreign key, like all our training data (0006).
 *
 * See `$lib/activity.ts` for the vocabulary, and
 * decisions/0017-teacher-roster-and-qualifications.md
 */
export const activityLogTable = sqliteTable(
	'activity_log',
	{
		id: text('id').primaryKey(),
		/** Whose timeline this belongs on. */
		cid: text('cid').notNull(),
		event: text('event', { enum: ACTIVITY_EVENTS }).notNull(),
		detail: text('detail', { mode: 'json' }).$type<ActivityDetail>(),
		/** CID of whoever did it; null for the cron. */
		actor: text('actor'),
		at: integer('at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [index('activity_log_cid_at_idx').on(table.cid, table.at)]
);

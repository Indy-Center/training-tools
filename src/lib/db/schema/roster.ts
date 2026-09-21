import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { VatusaRosterMember } from '$lib/types/vatusa';

export type RosterMember = InferSelectModel<typeof rosterMembersTable>;
export type InsertRosterMember = InferInsertModel<typeof rosterMembersTable>;

/** Which side of the VATUSA roster a controller sits on. */
export type RosterMembership = 'home' | 'visit';

/**
 * Local mirror of the VATUSA facility roster.
 *
 * This is a **mirror, not the system of record** for people. Training data we
 * own (certifications, endorsements, currency) keys on `cid` independently and
 * must never take a foreign key onto this table — otherwise someone falling
 * off the VATUSA roster would delete their training history.
 *
 * Rows are soft-removed: a member who disappears from VATUSA gets `removedAt`
 * stamped rather than being deleted, so we can tell "never been on the roster"
 * from "left last Tuesday".
 */
export const rosterMembersTable = sqliteTable(
	'roster_members',
	{
		cid: text('cid').primaryKey(),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),

		rating: integer('rating').notNull(),
		ratingShort: text('rating_short').notNull(),

		membership: text('membership', { enum: ['home', 'visit'] }).notNull(),
		facility: text('facility').notNull(),

		/** VATUSA's own flags, kept because they drive later tickets. */
		isHomeController: integer('is_home_controller', { mode: 'boolean' }).notNull().default(false),
		/** Mentors and supervising instructors — the basis of the DEV-106 teacher roster. */
		isMentor: integer('is_mentor', { mode: 'boolean' }).notNull().default(false),
		isSupIns: integer('is_sup_ins', { mode: 'boolean' }).notNull().default(false),

		/** DEV-110 wants a Discord id on enrollment; VATUSA has one too. */
		discordId: text('discord_id'),

		facilityJoinedAt: text('facility_joined_at'),
		lastActivityAt: text('last_activity_at'),

		/** Full upstream payload, so new fields don't need a migration to inspect. */
		data: text('data', { mode: 'json' }).$type<VatusaRosterMember>().notNull(),

		syncedAt: integer('synced_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** Non-null once VATUSA stops listing them. Active queries filter this. */
		removedAt: integer('removed_at', { mode: 'timestamp' }),

		/**
		 * When the arrival-certification job last looked at this member.
		 *
		 * Ours, not VATUSA's, so the sync upsert deliberately leaves it out of its
		 * `set` clause — a roster refresh must not clear it. Without it, every
		 * member who legitimately qualifies for nothing gets re-checked against the
		 * VATSIM API every 15 minutes forever.
		 *
		 * This is bookkeeping *about* the mirror rather than training data, so it
		 * does not breach the rule above; losing it to a mirror rebuild costs a
		 * burst of re-checks and nothing else, because the grant is idempotent.
		 */
		certificationsCheckedAt: integer('certifications_checked_at', { mode: 'timestamp' })
	},
	(table) => [
		index('roster_members_removed_at_idx').on(table.removedAt),
		index('roster_members_membership_idx').on(table.membership)
	]
);

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { CREDENTIAL_CODES } from '$lib/certifications';
import { QUALIFICATION_LEVELS, TEACHER_STATUSES, type TeacherRole } from '$lib/teachers';

export type Teacher = InferSelectModel<typeof teachersTable>;
export type InsertTeacher = InferInsertModel<typeof teachersTable>;
export type TeacherQualification = InferSelectModel<typeof teacherQualificationsTable>;

/**
 * The teacher roster: everyone holding `ZID:INS` or `ZID:MTR` on VATUSA, plus
 * the profile this app owns for them.
 *
 * Membership is derived, never entered by hand — the teacher roster sync adds,
 * restores and soft-removes rows from the roster mirror. Everything else here
 * (status, initials, availability, slots) is ours, and **this app is the
 * source of truth for it**, including the initials TRK's `Teacher` dropdown
 * should offer.
 *
 * Keys on `cid` with **no foreign key onto `roster_members`**, for the reason
 * 0006 gives: someone leaving VATUSA must not take their teaching history with
 * them. Rows are soft-removed for the same reason, and because their
 * qualifications survive six months off the roster.
 *
 * See .ai/decisions/0017-teacher-roster-and-qualifications.md
 */
export const teachersTable = sqliteTable(
	'teachers',
	{
		cid: text('cid').primaryKey(),

		/** `INS`/`MTR` held at ZID, from the VATUSA roster on the last sync. */
		roles: text('roles', { mode: 'json' }).$type<TeacherRole[]>().notNull(),

		/** Set by training admins. LOA keeps the profile but takes no new students. */
		status: text('status', { enum: TEACHER_STATUSES }).notNull().default('active'),

		/**
		 * Operating initials: what TRK's `Teacher` select holds, and so how an
		 * enrollment is matched to a teacher. Entered by training admins for now.
		 *
		 * TODO(identity): take these from identity's `attributes.operatingInitials`
		 * once community-website is on identity (DEV-5) and initials are
		 * maintained there, rather than keeping a second copy by hand.
		 *
		 * Unique, because two teachers sharing initials would share students.
		 * SQLite allows any number of NULLs.
		 */
		initials: text('initials'),

		/**
		 * Their Discord role and channel, as Larry last found or made them. Kept so
		 * a rename in Discord is followed rather than answered with a second one.
		 * Null until the sync has run for real. See `$lib/discord-rooms.ts`.
		 */
		discordRoleId: text('discord_role_id'),
		discordChannelId: text('discord_channel_id'),

		/** Free text, like a student's: when in the week they can teach. */
		availability: text('availability'),
		/** How many students they will take at once. Null until they say. */
		studentSlots: integer('student_slots'),

		/** First time the sync saw them. Returns are in `activity_log`. */
		joinedAt: integer('joined_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** Non-null once they no longer hold INS or MTR here. */
		removedAt: integer('removed_at', { mode: 'timestamp' }),

		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** CID of whoever last edited the profile; null when automatic. */
		updatedBy: text('updated_by')
	},
	(table) => [
		uniqueIndex('teachers_initials_unique').on(table.initials),
		index('teachers_removed_at_idx').on(table.removedAt)
	]
);

/** How a qualification level came to be held. */
export const QUALIFICATION_BASES = [
	'manual', // set by a training admin
	'automatic' // applied by the rules: an instructor's evaluator level, or a downgrade
] as const;
export type QualificationBasis = (typeof QUALIFICATION_BASES)[number];

/**
 * A teacher's level on one course, kept as an all-time log.
 *
 * The current level is the row with `endedAt` null; no such row is "No Qual".
 * A change ends the current row and starts a new one, so the table answers
 * "what could they do, when, and on whose say-so" without a separate audit
 * table — the same model as `certifications` (0010).
 *
 * Keyed on `cid` with no foreign key, like everything else we own.
 */
export const teacherQualificationsTable = sqliteTable(
	'teacher_qualifications',
	{
		id: text('id').primaryKey(),
		cid: text('cid').notNull(),

		/** Any credential in the catalogue — courses and endorsements alike. */
		code: text('code', { enum: CREDENTIAL_CODES }).notNull(),
		level: text('level', { enum: QUALIFICATION_LEVELS }).notNull(),

		basis: text('basis', { enum: QUALIFICATION_BASES }).notNull(),
		/** Why, when the rules did it — "Instructor: evaluates automatically". */
		note: text('note'),

		startedAt: integer('started_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** CID of the admin who set it; null when automatic. */
		startedBy: text('started_by'),

		/** Null while current. */
		endedAt: integer('ended_at', { mode: 'timestamp' }),
		endedBy: text('ended_by'),
		endedReason: text('ended_reason')
	},
	(table) => [
		index('teacher_qualifications_cid_idx').on(table.cid),
		/** At most one current level per teacher per course. */
		uniqueIndex('teacher_qualifications_current_idx')
			.on(table.cid, table.code)
			.where(sql`${table.endedAt} is null`)
	]
);

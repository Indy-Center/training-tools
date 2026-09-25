import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { COURSE_CODES } from '$lib/courses';

export type Enrollment = InferSelectModel<typeof enrollmentsTable>;
export type InsertEnrollment = InferInsertModel<typeof enrollmentsTable>;

/** How the student wants training staff to reach them. */
export const NOTIFICATION_PREFERENCES = ['discord', 'email'] as const;
export type NotificationPreference = (typeof NOTIFICATION_PREFERENCES)[number];

/**
 * Mirrors the TRK workflow, re-verified against the live project on 2026-09-20
 * after the triage step was removed.
 *
 *   Waitlist ──Assign Teacher──> In Training ──> Rating Exam
 *      │                                              └──> Certification Update ──> Completed
 *      └────Remove from Waitlist───> Removed
 *
 * **A new request starts at `waitlist`** — that is the workflow's initial
 * status, so submitting the form does put someone in the queue.
 *
 * An earlier revision of this app defaulted to a `submitted` state, because the
 * workflow then had a `New Enrolments` triage step in front of `Waitlist`. That
 * step no longer exists. See
 * .ai/decisions/0009-trk-workflow-lost-its-triage-step.md
 *
 * `withdrawn` is ours alone. Jira's `Removed` is the staff-side equivalent, but
 * the two are not the same event — one is the student stepping back, the other
 * is staff taking them off. Keeping them distinct means a withdrawal is never
 * mistaken for a removal when statuses are read back.
 *
 * Jira stays authoritative for progression. We write `waitlist` on submit and
 * `withdrawn` on a student's withdrawal; everything else is read back from the
 * TRK issue by the cron sweep and the Jira webhook — see
 * `$lib/server/enrollments/status-sync.ts` and
 * .ai/decisions/0014-enrollment-status-from-jira.md
 */
export const ENROLLMENT_STATUSES = [
	'waitlist', // Jira: Waitlist (initial)
	'in-training', // Jira: In Training
	'rating-exam', // Jira: Rating Exam
	'certification-update', // Jira: Certification Update
	'completed', // Jira: Completed
	'removed', // Jira: Removed — staff took them off the waitlist
	'withdrawn' // ours only — the student stepped back
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/**
 * Statuses that mean the request is no longer live, so the controller may
 * submit a new one.
 *
 * `certification-update` is deliberately **not** here: it sits between the
 * rating exam and completion, so the request is still very much in flight.
 */
export const CLOSED_ENROLLMENT_STATUSES = ['completed', 'removed', 'withdrawn'] as const;

/**
 * A controller's request for training in a course.
 *
 * **This is the record we own.** The queue the training staff work is Jira
 * project TRK; a row here is created first and the Jira issue is filed from it,
 * so a Jira outage delays the filing rather than losing the request. `jiraIssueKey`
 * is null until that succeeds, which is exactly what the cron reconcile looks for.
 *
 * Like `roster_members`, this keys on `cid` and takes **no foreign key onto
 * it** — a VATUSA roster removal must never cascade away someone's training
 * history. See .ai/decisions/0006-training-tools-owns-the-roster.md and
 * .ai/decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md
 */
export const enrollmentsTable = sqliteTable(
	'enrollments',
	{
		id: text('id').primaryKey(),

		/** VATSIM CID. Not a foreign key — see the note above. */
		cid: text('cid').notNull(),

		course: text('course', { enum: COURSE_CODES }).notNull(),
		status: text('status', { enum: ENROLLMENT_STATUSES }).notNull().default('waitlist'),

		/** Free text: when in the week the student can train. */
		availability: text('availability'),
		notificationPreference: text('notification_preference', {
			enum: NOTIFICATION_PREFERENCES
		}),

		/**
		 * What we sent to Jira, and what they held when they asked.
		 *
		 * Deliberately no email or Discord id: both are derivable on demand from
		 * `roster_members.discord_id` or identity, so a copy here would just be a
		 * second version to keep honest. Name is the exception because it is what
		 * went into the issue summary, and rating because "S2 when they enrolled"
		 * is history a current lookup cannot reconstruct.
		 */
		submittedName: text('submitted_name').notNull(),
		submittedRating: text('submitted_rating'),

		/**
		 * What the student agreed to, and which wording they saw.
		 *
		 * The version matters as much as the timestamp: the terms will be reworded,
		 * and "they accepted on this date" is worth very little if nobody can say
		 * what the text said that day. `TERMS_VERSION` in
		 * `$lib/content/enrollment/` is bumped whenever the agreement changes.
		 *
		 * Nullable because the rows that predate DEV-119 were never shown terms —
		 * backfilling a version onto them would be inventing a record.
		 */
		agreedAt: integer('agreed_at', { mode: 'timestamp' }),
		agreedTermsVersion: text('agreed_terms_version'),

		/**
		 * The course we suggested, when it differs from the one they chose.
		 *
		 * Null when they took the suggestion, or when we had none. Only the
		 * disagreement is worth storing — it is what training staff want flagged,
		 * and DEV-114 asked for a wrong-looking choice to be surfaced rather than
		 * blocked. The suggestion is inferred; the student may simply be right.
		 */
		suggestedCourse: text('suggested_course', { enum: COURSE_CODES }),

		/** Null until the TRK issue exists. The reconcile pass selects on this. */
		jiraIssueKey: text('jira_issue_key'),
		jiraSyncedAt: integer('jira_synced_at', { mode: 'timestamp' }),
		/** Last failure, kept so a stuck row is findable rather than silent. */
		jiraSyncError: text('jira_sync_error'),
		/** Capped by MAX_JIRA_SYNC_ATTEMPTS so a bad payload stops retrying. */
		jiraSyncAttempts: integer('jira_sync_attempts').notNull().default(0),

		/**
		 * The TRK `Teacher` select, read back from Jira: instructor initials, not
		 * an account. Null until staff assign someone.
		 */
		teacher: text('teacher'),
		/**
		 * When `status` and `teacher` were last read back from Jira, by the cron
		 * sweep or the webhook. Null until the first read. See
		 * .ai/decisions/0014-enrollment-status-from-jira.md
		 */
		jiraStatusSyncedAt: integer('jira_status_synced_at', { mode: 'timestamp' }),
		/**
		 * When the Jira state we last applied was true — the webhook's event time,
		 * or the issue's `updated` from a read. Anything older is refused, so two
		 * deliveries landing out of order cannot roll a status back. Milliseconds,
		 * because staff routinely make two changes within the same second or two.
		 */
		jiraUpdatedAt: integer('jira_updated_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		/** Set when the student withdraws; the row survives as history. */
		withdrawnAt: integer('withdrawn_at', { mode: 'timestamp' }),

		/**
		 * Set when the row was created from a TRK issue someone filed by hand on
		 * the board, rather than through this site's form. Null for everything
		 * the form wrote.
		 *
		 * Such rows never saw our form, so `availability`, `agreedAt` and
		 * `submittedRating` stay null — there is nothing true to put there — and
		 * `createdAt` is the issue's `Waitlisted` date, because that is the queue
		 * position staff gave them. See `$lib/server/enrollments/import.ts`.
		 */
		importedAt: integer('imported_at', { mode: 'timestamp' })
	},
	(table) => [
		index('enrollments_cid_idx').on(table.cid),
		index('enrollments_status_idx').on(table.status),
		// Unique so one TRK issue can back at most one row: the import and a
		// submit that is mid-filing can both see the same new issue, and only one
		// of them may win. SQLite lets any number of rows hold NULL, which is what
		// the reconcile pass selects on.
		uniqueIndex('enrollments_jira_issue_key_unique').on(table.jiraIssueKey)
	]
);

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
 *   Waitlist ──Assign Teacher──> In Training ──> Rating Exam ──> Needs CATP ──> (back to training)
 *      │                                 │              └──> Certification Update ──> Completed
 *      │                                 └──(no exam)───────────────^
 *      └────Remove from Waitlist───> Removed
 *
 * **A new request starts at `waitlist`** — that is the workflow's initial
 * status, so submitting the form does put someone in the queue.
 *
 * An earlier revision of this app defaulted to a `submitted` state, because the
 * workflow then had a `New Enrolments` triage step in front of `Waitlist`. That
 * step no longer exists. See
 * decisions/0009-trk-workflow-lost-its-triage-step.md
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
 * decisions/0014-enrollment-status-from-jira.md
 */
export const ENROLLMENT_STATUSES = [
	'waitlist', // Jira: Waitlist (initial)
	'in-training', // Jira: In Training
	'rating-exam', // Jira: Rating Exam
	'needs-catp', // Jira: Needs CATP — the rating exam was not passed; with the TA
	'certification-update', // Jira: Audit (Certification Update until 2026-10-06)
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
 * The open statuses a roster removal takes a request from. Never
 * `certification-update`: the course is passed, so nothing is taken away.
 */
export const ROSTER_REMOVABLE_STATUSES = [
	'waitlist',
	'in-training',
	'rating-exam',
	'needs-catp'
] as const satisfies readonly EnrollmentStatus[];
export type RosterRemovableStatus = (typeof ROSTER_REMOVABLE_STATUSES)[number];

/** Why a restore window ended without a restore. */
export const RESTORE_CLOSED_REASONS = ['expired', 'closed-by-admin', 'moved-on-board'] as const;
export type RestoreClosedReason = (typeof RESTORE_CLOSED_REASONS)[number];

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
 * history. See decisions/0006-training-tools-owns-the-roster.md and
 * decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md
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
		 * The TRK `RE Instructor` select, read back the same way: who is running
		 * the rating exam. Initials like `teacher`, or `VATUSA` when the division
		 * examines. Null until staff assign someone.
		 */
		reInstructor: text('re_instructor'),
		/**
		 * The VATUSA written course for this rating: the day it was assigned and
		 * the day it was passed, as the TRK card holds them (`YYYY-MM-DD`; Jira's
		 * date fields carry no time). Read back from the card like `teacher`.
		 * Null until each happens, and always null for a course with none.
		 */
		vatusaAssignedOn: text('vatusa_assigned_on'),
		vatusaCompletedOn: text('vatusa_completed_on'),
		/**
		 * The last reminder the student was sent about the VATUSA course, so each
		 * goes once: one of `ACADEMY_REMINDERS` in `$lib/vatusa-reminders.ts`. Null
		 * until the first. See `$lib/server/enrollments/reminders.ts`.
		 */
		vatusaReminder: text('vatusa_reminder'),
		/**
		 * The last status this request was announced at, so each arrival is
		 * announced once — see `$lib/server/enrollments/announce.ts`. Differs from
		 * `status` exactly when there is an arrival still to handle.
		 */
		announcedStatus: text('announced_status'),
		/**
		 * The "rating exam" post in the instructors' channel for this request, and
		 * the status it last showed, so the post can be kept up to date and removed
		 * when the exam is over. Both null when there is no post to look after. See
		 * `$lib/server/enrollments/announce.ts`.
		 */
		examMessageId: text('exam_message_id'),
		examMessageStatus: text('exam_message_status'),
		/**
		 * The `teacher` value the student and teacher were last told they were
		 * paired under, so each pairing is announced once and a change of teacher
		 * is announced again — see `$lib/server/enrollments/pairings.ts`.
		 */
		announcedTeacher: text('announced_teacher'),
		/**
		 * When the certification this course earns was applied to the student.
		 *
		 * Set once, when the request first reaches `certification-update` — however
		 * it got there — and the credential and the card's `Certificate Updated`
		 * date have both been written. Null means "not yet", which is what the
		 * cron's certification pass selects on, so a failure is retried rather than
		 * lost. See `$lib/server/enrollments/completion.ts`.
		 */
		certificationAppliedAt: integer('certification_applied_at', { mode: 'timestamp' }),
		/**
		 * Why the certification has **not** been applied: the fields the TRK card
		 * was missing when last checked, comma-separated (`formatHold()` in
		 * `$lib/course-completion.ts`). Null when nothing is holding it.
		 *
		 * Also what makes the training admins hear about a hold once rather than
		 * every ten minutes: they are told when this changes.
		 */
		certificationHold: text('certification_hold'),
		/**
		 * When `status`, `teacher` and `reInstructor` were last read back from Jira, by the cron
		 * sweep or the webhook. Null until the first read. See
		 * decisions/0014-enrollment-status-from-jira.md
		 */
		jiraStatusSyncedAt: integer('jira_status_synced_at', { mode: 'timestamp' }),
		/**
		 * When the Jira state we last applied was true — the webhook's event time,
		 * or the issue's `updated` from a read. Anything older is refused, so two
		 * deliveries landing out of order cannot roll a status back. Milliseconds,
		 * because staff routinely make two changes within the same second or two.
		 */
		jiraUpdatedAt: integer('jira_updated_at', { mode: 'timestamp_ms' }),
		/**
		 * When the card entered its current `status`: set by `applyIssueMove()` in the
		 * write that changes `status` (and nowhere else), and to `createdAt` for a
		 * row this app creates. A CTRS record counts only if its session is on or
		 * after this day — see decisions/0038. Null for a row not yet back-filled
		 * from Jira's changelog (`backfillStatusSince()`), and for closed rows for
		 * good. Not served by any page, RPC or notice.
		 */
		statusSince: integer('status_since', { mode: 'timestamp' }),

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
		importedAt: integer('imported_at', { mode: 'timestamp' }),

		/**
		 * A **roster removal**: the app took this request off because its student
		 * left the home roster. See `$lib/roster-removal.ts` and
		 * decisions/0037-roster-removal-and-restore.md
		 *
		 * `rosterRemovedAt` is when, `rosterRemovedFrom` the status it left,
		 * `leftHomeAt` the student's `roster_members.left_home_at` at the time
		 * (the restore window starts there) and `restoreBy` that plus 30 days. All
		 * null until a removal, and cleared again by a restore.
		 *
		 * The request is **in its restore window** while `rosterRemovedAt` is set
		 * and `restoreClosedAt` is null. It still counts as open then, so the
		 * student cannot file another (`getOpenEnrollment()`). Not served by RPC.
		 */
		rosterRemovedAt: integer('roster_removed_at', { mode: 'timestamp' }),
		rosterRemovedFrom: text('roster_removed_from', { enum: ROSTER_REMOVABLE_STATUSES }),
		leftHomeAt: integer('left_home_at', { mode: 'timestamp' }),
		restoreBy: integer('restore_by', { mode: 'timestamp' }),
		/** When the window ended without a restore, and why. Once set, never removed or restored again. */
		restoreClosedAt: integer('restore_closed_at', { mode: 'timestamp' }),
		restoreClosedReason: text('restore_closed_reason', { enum: RESTORE_CLOSED_REASONS }),
		/**
		 * **Kept in line**: exempt from roster removal while the student is away.
		 * `keptInLineBy` is the admin's CID, or null when the board did it.
		 * Cleared when the student is back on the home roster.
		 */
		keptInLineAt: integer('kept_in_line_at', { mode: 'timestamp' }),
		keptInLineBy: text('kept_in_line_by'),
		/**
		 * When the training admins were told Jira refused this request's restore,
		 * so a retry every pass tells them once. Cleared when the restore succeeds.
		 */
		restoreRefusalToldAt: integer('restore_refusal_told_at', { mode: 'timestamp' })
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

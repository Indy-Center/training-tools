import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { CLOSED_ENROLLMENT_STATUSES, enrollmentsTable } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { toFacilityDate } from '$lib/server/jira/progress';
import { notify, notifyDirect } from '$lib/server/notify';
import { reminderToSend, type AcademyReminder } from '$lib/vatusa-reminders';
import {
	vatusaOverdueNotice,
	vatusaReminderMessage,
	vatusaUndeliveredNotice,
	type NoticeRequest
} from './notices';

/**
 * Remind students about a VATUSA Academy course they have been assigned and
 * have not passed: `$lib/vatusa-reminders.ts` says when.
 *
 * The student is messaged privately on Discord. The training admins are told
 * when the time runs out, and whenever a reminder cannot go to the student
 * because we hold no Discord ID for them.
 *
 * Each reminder goes once: `vatusa_reminder` is claimed before sending, so two
 * passes at once cannot both send, and put back if Larry refuses.
 */

export type ReminderPassResult = {
	/** Courses assigned and not yet passed. */
	pending: number;
	/** Reminders sent this pass. */
	sent: number;
};

/** Set `vatusa_reminder` only if nobody else has since. */
async function mark(db: Database, id: string, from: string | null, to: string | null) {
	const written = await db
		.update(enrollmentsTable)
		.set({ vatusaReminder: to })
		.where(
			and(
				eq(enrollmentsTable.id, id),
				from === null
					? isNull(enrollmentsTable.vatusaReminder)
					: eq(enrollmentsTable.vatusaReminder, from)
			)
		)
		.returning({ id: enrollmentsTable.id });
	return written.length > 0;
}

export async function sendVatusaReminders(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<ReminderPassResult> {
	const open = (
		await db
			.select()
			.from(enrollmentsTable)
			.where(
				and(
					isNotNull(enrollmentsTable.vatusaAssignedOn),
					isNull(enrollmentsTable.vatusaCompletedOn),
					isNull(enrollmentsTable.withdrawnAt)
				)
			)
			.orderBy(asc(enrollmentsTable.createdAt))
	).filter(
		(enrollment) => !(CLOSED_ENROLLMENT_STATUSES as readonly string[]).includes(enrollment.status)
	);

	const today = toFacilityDate(now);
	const base = env?.JIRA_BASE_URL?.trim().replace(/\/$/, '');
	let sent = 0;

	for (const enrollment of open) {
		const assignedOn = enrollment.vatusaAssignedOn!;
		const reminder: AcademyReminder | null = reminderToSend(
			assignedOn,
			today,
			enrollment.vatusaReminder
		);
		if (!reminder) continue;

		// Claim it first, so a concurrent pass does not send it too.
		const previous = enrollment.vatusaReminder;
		if (!(await mark(db, enrollment.id, previous, reminder))) continue;

		// One lookup each: a handful of courses are assigned at once. Removed
		// members included, since a request outlives a roster change.
		const member = await db.query.rosterMembersTable.findFirst({
			where: eq(rosterMembersTable.cid, enrollment.cid)
		});
		const request: NoticeRequest & { assignedOn: string } = {
			name: member
				? `${member.firstName} ${member.lastName}`.trim() || enrollment.submittedName
				: enrollment.submittedName,
			cid: enrollment.cid,
			course: enrollment.course,
			teacher: enrollment.teacher,
			examiner: enrollment.reInstructor,
			issueKey: enrollment.jiraIssueKey,
			issueUrl:
				base && enrollment.jiraIssueKey ? `${base}/browse/${enrollment.jiraIssueKey}` : null,
			assignedOn
		};

		const outcome = member?.discordId
			? await notifyDirect(env, member.discordId, vatusaReminderMessage(reminder, request))
			: await notify(env, vatusaUndeliveredNotice(reminder, request));

		if (outcome === 'failed') {
			// Larry refused or could not be reached: put it back for the next pass.
			await mark(db, enrollment.id, reminder, previous);
			continue;
		}

		// Best effort: the student has been told either way, and a failure here
		// must not send them the reminder a second time.
		if (reminder === 'expired') await notify(env, vatusaOverdueNotice(request));

		if (outcome === 'sent') sent += 1;
	}

	return { pending: open.length, sent };
}

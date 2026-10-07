import { and, asc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { discordSyncMode } from '$lib/discord-rooms';
import { isAssignedTo } from '$lib/teachers';
import { larryGuild } from '$lib/server/discord/larry';
import { notifyChannel } from '$lib/server/notify';
import { listTeachers } from '$lib/server/teachers';
import { buildPairingMessage } from './pairing-message';

/**
 * Tell a student and their teacher that they have been paired, in the
 * teacher's Discord channel.
 *
 * Keyed on who the card names, like the other passes: a request in training
 * whose `teacher` differs from `announced_teacher` is a pairing nobody has been
 * told about — a first assignment, or a change of teacher — however it was made.
 * Each is announced once.
 *
 * Run as soon as a card changes — after a step taken here, and after a Jira
 * webhook delivery — and by the cron, which is what guarantees it. So that it
 * need not wait for the rooms sync, the student is given the teacher's role
 * here first: without it they could not see the channel, and a mention there
 * would not reach them. The sync would have given them the same role.
 *
 * A teacher with no channel yet is left for a later pass rather than skipped.
 * Nothing is posted unless `DISCORD_SYNC` is `live`, like every other change
 * this app makes in Discord.
 *
 * See decisions/0025-teacher-rooms-in-discord.md
 */

export type PairingPassResult = {
	/** Pairings nobody has been told about yet. */
	pending: number;
	/** Of those, how many were posted this pass. */
	announced: number;
};

/** Set `announced_teacher` only if nobody else has since: two passes can run at once. */
async function mark(db: Database, enrollment: Enrollment, from: string | null, to: string | null) {
	const written = await db
		.update(enrollmentsTable)
		.set({ announcedTeacher: to })
		.where(
			and(
				eq(enrollmentsTable.id, enrollment.id),
				from === null
					? isNull(enrollmentsTable.announcedTeacher)
					: eq(enrollmentsTable.announcedTeacher, from)
			)
		)
		.returning({ id: enrollmentsTable.id });
	return written.length > 0;
}

export async function announcePairings(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<PairingPassResult> {
	const mode = discordSyncMode((env as { DISCORD_SYNC?: string } | undefined)?.DISCORD_SYNC);
	if (mode !== 'live') return { pending: 0, announced: 0 };

	const pending = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.status, 'in-training'),
				isNotNull(enrollmentsTable.teacher),
				isNull(enrollmentsTable.withdrawnAt),
				or(
					isNull(enrollmentsTable.announcedTeacher),
					ne(enrollmentsTable.announcedTeacher, enrollmentsTable.teacher)
				)
			)
		)
		.orderBy(asc(enrollmentsTable.updatedAt));

	if (pending.length === 0) return { pending: 0, announced: 0 };

	// Whole tables, not `IN (...)` over the requests: D1's 100-parameter limit.
	const [teachers, roster] = await Promise.all([
		listTeachers(db),
		db
			.select({
				cid: rosterMembersTable.cid,
				firstName: rosterMembersTable.firstName,
				lastName: rosterMembersTable.lastName,
				discordId: rosterMembersTable.discordId
			})
			.from(rosterMembersTable)
	]);
	const people = new Map(roster.map((row) => [row.cid, row]));
	const person = (cid: string, fallback: string) => {
		const found = people.get(cid);
		return {
			name: (found ? `${found.firstName} ${found.lastName}`.trim() : '') || fallback,
			discordId: found?.discordId ?? null
		};
	};

	let announced = 0;

	for (const enrollment of pending) {
		const teacher = teachers.find(
			(candidate) => candidate.removedAt === null && isAssignedTo(enrollment.teacher, candidate)
		);
		// No such teacher here, or their channel has not been made yet: nowhere to
		// post. Left unclaimed, so a later pass finds it once there is.
		if (!teacher?.discordChannelId) continue;

		// Claim it first, so a concurrent pass does not post it too.
		const previous = enrollment.announcedTeacher;
		if (!(await mark(db, enrollment, previous, enrollment.teacher))) continue;

		const student = person(enrollment.cid, enrollment.submittedName);

		// Let them into the channel before they are mentioned in it. Now, not
		// queued: the message must not overtake it. Someone who is not in the
		// server cannot be given a role, and is still named in the message.
		if (teacher.discordRoleId && student.discordId) {
			try {
				await larryGuild(env)?.setMemberRole({
					userId: student.discordId,
					roleId: teacher.discordRoleId,
					has: true
				});
			} catch (err) {
				console.warn(
					'[training-tools] pairing: could not give the teacher role',
					enrollment.cid,
					err instanceof Error ? err.message : err
				);
			}
		}

		const outcome = await notifyChannel(
			env,
			teacher.discordChannelId,
			buildPairingMessage(
				{
					student,
					teacher: person(teacher.cid, teacher.initials ?? teacher.cid),
					course: enrollment.course,
					notificationPreference: enrollment.notificationPreference,
					availability: enrollment.availability
				},
				now
			)
		);

		if (outcome === 'failed') {
			// Larry refused or could not be reached: put it back for the next pass.
			await mark(db, enrollment, enrollment.teacher, previous);
			continue;
		}
		if (outcome === 'sent') announced += 1;
	}

	return { pending: pending.length, announced };
}

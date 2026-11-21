import { and, asc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { isAssignedTo } from '$lib/teachers';
import { GROUP_SOURCE, larryGroups, type GroupPostResult } from '$lib/server/discord/larry';
import { listTeachers } from '$lib/server/teachers';
import { buildPairingMessage } from './pairing-message';

/**
 * Tell a student and their teacher that they have been paired, in the
 * teacher's room.
 *
 * Keyed on who the card names, like the other passes: a request in training
 * whose `teacher` differs from `announced_teacher` is a pairing nobody has been
 * told about — a first assignment, or a change of teacher — however it was made.
 * Each is announced once.
 *
 * Run as soon as a card changes — after a step taken here, and after a Jira
 * webhook delivery — and by the cron, which is what guarantees it. larry posts
 * it in the teacher's group (`teacher:<cid>`, see `$lib/teacher-groups.ts`),
 * giving the student the room first, so the mention reaches them.
 *
 * larry answering `no-room` (the room isn't made yet) or `not-live` (its group
 * sync for this app isn't live) puts it back for a later pass, as does larry
 * being unreachable.
 *
 * See decisions/0025-teacher-rooms-in-discord.md and decisions/0045-groups-contract.md
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
	const larry = larryGroups(env);
	if (!larry) return { pending: 0, announced: 0 };

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
				lastName: rosterMembersTable.lastName
			})
			.from(rosterMembersTable)
	]);
	const people = new Map(roster.map((row) => [row.cid, row]));
	const nameOf = (cid: string, fallback: string) => {
		const found = people.get(cid);
		return (found ? `${found.firstName} ${found.lastName}`.trim() : '') || fallback;
	};

	let announced = 0;

	for (const enrollment of pending) {
		const teacher = teachers.find(
			(candidate) => candidate.removedAt === null && isAssignedTo(enrollment.teacher, candidate)
		);
		// No such teacher here: no group to post in. Left unclaimed, so a later
		// pass finds it once there is.
		if (!teacher) continue;

		// Claim it first, so a concurrent pass does not post it too.
		const previous = enrollment.announcedTeacher;
		if (!(await mark(db, enrollment, previous, enrollment.teacher))) continue;

		const notice = buildPairingMessage(
			{
				student: { name: nameOf(enrollment.cid, enrollment.submittedName) },
				teacher: { name: nameOf(teacher.cid, teacher.initials ?? teacher.cid) },
				teacherMessage: teacher.studentMessage,
				course: enrollment.course,
				notificationPreference: enrollment.notificationPreference,
				availability: enrollment.availability
			},
			now
		);

		let outcome: GroupPostResult | 'failed';
		try {
			outcome = await larry.postToGroup({
				source: GROUP_SOURCE,
				key: `teacher:${teacher.cid}`,
				notice,
				mention: [teacher.cid, enrollment.cid]
			});
		} catch (err) {
			console.error(
				'[training-tools] pairing: larry could not post it',
				enrollment.cid,
				err instanceof Error ? err.message : err
			);
			outcome = 'failed';
		}

		if (outcome !== 'posted') {
			// No room yet, the group sync not live, or larry unreachable: put it
			// back for the next pass.
			await mark(db, enrollment, enrollment.teacher, previous);
			continue;
		}
		announced += 1;
	}

	return { pending: pending.length, announced };
}

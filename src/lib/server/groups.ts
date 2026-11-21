import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { CREDENTIALS } from '$lib/certifications';
import { planGroups } from '$lib/groups';
import { readRoster } from '$lib/server/roster';
import { assignmentsFor, getAssignedEnrollments, listTeachers } from '$lib/server/teachers';
import { lookUpTeachers } from '$lib/server/discord/identity';
import type { GroupsAnswer } from '$rpc';

/**
 * What `TrainingRpc.getGroups()` answers: the credential and teacher groups
 * (`$lib/groups.ts`), from the roster `getRoster()` serves, the teacher roster
 * and their assignments, and identity's preferred names.
 *
 * Whole tables, never an `IN (...)` over CIDs (D1 allows 100 bound
 * parameters). Roster names come from the whole mirror, removed members
 * included, as the teacher rooms have them today.
 */
export async function readGroups(
	db: Database,
	env: Partial<Env> | undefined
): Promise<GroupsAnswer> {
	const [roster, teachers, enrollments, names] = await Promise.all([
		readRoster(db),
		listTeachers(db),
		getAssignedEnrollments(db),
		db
			.select({
				cid: rosterMembersTable.cid,
				firstName: rosterMembersTable.firstName,
				lastName: rosterMembersTable.lastName,
				data: rosterMembersTable.data
			})
			.from(rosterMembersTable)
	]);

	const onRoster = teachers.filter((teacher) => teacher.removedAt === null);
	const identity = await lookUpTeachers(
		env,
		onRoster.map((teacher) => teacher.cid)
	);
	const people = new Map(names.map((row) => [row.cid, row]));

	return planGroups({
		catalogue: CREDENTIALS,
		members: roster.members,
		teachers: teachers.map((teacher) => {
			const person = people.get(teacher.cid);
			return {
				cid: teacher.cid,
				initials: teacher.initials,
				leftAt: teacher.removedAt,
				preferredName: identity.known.get(teacher.cid)?.preferredName ?? null,
				rosterName: person ? { first: person.firstName, last: person.lastName } : null,
				namePrivacy: person?.data.flag_nameprivacy === true,
				students: assignmentsFor(teacher, enrollments).students.map((student) => student.cid)
			};
		})
	});
}

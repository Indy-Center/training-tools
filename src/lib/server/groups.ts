import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { CREDENTIALS } from '$lib/certifications';
import { groupsPanel, planGroups, type GroupsInput, type PanelGroup } from '$lib/groups';
import { getPeople, readRoster } from '$lib/server/roster';
import { assignmentsFor, getAssignedEnrollments, listTeachers } from '$lib/server/teachers';
import { lookUpTeachers } from '$lib/server/discord/identity';
import type { GroupsAnswer } from '$rpc';

/**
 * What `TrainingRpc.getGroups()` answers: the credential and teacher groups
 * (`$lib/groups.ts`), from the roster `getRoster()` serves, the teacher roster
 * and their assignments, and identity's preferred names.
 */
export async function readGroups(
	db: Database,
	env: Partial<Env> | undefined
): Promise<GroupsAnswer> {
	return planGroups(await readGroupsInput(db, env));
}

/**
 * The same groups as `/admin` shows them: members by name, held groups with
 * why. Only this app's side: what larry made of them is in larry's logs and
 * its `getGroupStatus()`.
 */
export async function getGroupsPanel(
	db: Database,
	env: Partial<Env> | undefined
): Promise<PanelGroup[]> {
	const [input, people] = await Promise.all([readGroupsInput(db, env), getPeople(db)]);
	return groupsPanel(input, (cid) => people.get(cid)?.name || cid);
}

/**
 * Whole tables, never an `IN (...)` over CIDs (D1 allows 100 bound
 * parameters). Roster names come from the whole mirror, removed members
 * included, so a teacher's room keeps the name it was given.
 */
async function readGroupsInput(db: Database, env: Partial<Env> | undefined): Promise<GroupsInput> {
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
	const failed = new Set(identity.failed);

	return {
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
				students: assignmentsFor(teacher, enrollments).students.map((student) => student.cid),
				nameUncertain: failed.has(teacher.cid)
			};
		})
	};
}

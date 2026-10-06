import { canManageTeachers } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import { getPeople } from '$lib/server/roster';
import {
	assignmentsFor,
	getAllCurrentQualifications,
	getAssignedEnrollments,
	getStoredDropdownDrift,
	listTeachers
} from '$lib/server/teachers';
import { describeDrift } from '$lib/server/teachers/notices';
import { getRoomsReport } from '$lib/server/discord/rooms';
import { QUALIFICATION_CREDENTIALS, slotSummary } from '$lib/teachers';
import type { PageServerLoad } from './$types';

/**
 * The teacher roster, for training admins (`training:teachers:manage`) only.
 *
 * `hooks.server.ts` proves a session; the role is checked here. There are no
 * actions on this route — `/teachers/{cid}` gates its own.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, canManageTeachers);

	const [teachers, people, qualifications, enrollments, dropdowns, rooms] = await Promise.all([
		listTeachers(locals.db),
		getPeople(locals.db),
		getAllCurrentQualifications(locals.db),
		getAssignedEnrollments(locals.db),
		getStoredDropdownDrift(locals.db),
		getRoomsReport(locals.db)
	]);

	const nameOf = (cid: string) => people.get(cid)?.name ?? cid;

	const rows = teachers.map((teacher) => {
		const person = people.get(teacher.cid);
		const assignments = assignmentsFor(teacher, enrollments);
		const levels = qualifications.get(teacher.cid);

		return {
			cid: teacher.cid,
			name: person?.name ?? teacher.cid,
			ratingShort: person?.ratingShort ?? '—',
			roles: teacher.roles,
			status: teacher.status,
			initials: teacher.initials,
			onRoster: teacher.removedAt === null,
			removedAt: teacher.removedAt,
			assigned: assignments.students.length,
			slots: slotSummary({
				status: teacher.status,
				studentSlots: teacher.studentSlots,
				inTraining: assignments.inTraining
			}),
			levels: Object.fromEntries(
				QUALIFICATION_CREDENTIALS.map((credential) => [
					credential.code,
					levels?.get(credential.code) ?? null
				])
			)
		};
	});

	const current = rows.filter((row) => row.onRoster).sort((a, b) => a.name.localeCompare(b.name));

	return {
		credentials: QUALIFICATION_CREDENTIALS.map((credential) => credential.code),
		current,
		former: rows
			.filter((row) => !row.onRoster)
			.sort((a, b) => (b.removedAt?.getTime() ?? 0) - (a.removedAt?.getTime() ?? 0)),
		// What the last Discord sync did, or in a dry run would do. Null until it has run.
		discord: rooms
			? {
					mode: rooms.mode,
					at: new Date(rooms.at),
					canSeeMembers: rooms.canSeeMembers,
					skipped: rooms.skipped.map((skip) => ({ name: nameOf(skip.cid), reason: skip.reason })),
					// Teachers who left: their role and channel deleted, or about to be.
					deleted: (rooms.removed ?? []).map((removal) => ({
						cid: removal.cid,
						teacher: nameOf(removal.cid),
						role: removal.role,
						channel: removal.channel,
						errors: removal.errors
					})),
					rooms: rooms.rooms.map((room) => ({
						cid: room.cid,
						teacher: nameOf(room.cid),
						roleName: room.roleName,
						role: room.role,
						roleRenamedFrom: room.roleRenamedFrom ?? null,
						channelName: room.channelName,
						channel: room.channel,
						channelRenamedFrom: room.channelRenamedFrom ?? null,
						added: room.added.map(nameOf),
						// Discord IDs: whoever is losing the role may not be on our roster.
						removed: room.removed,
						notInServer: room.notInServer.map(nameOf),
						noDiscord: room.noDiscord.map(nameOf),
						errors: room.errors
					}))
				}
			: null,
		dropdowns: dropdowns
			? {
					checkedAt: dropdowns.checkedAt,
					teacher: describeDrift(dropdowns.drift.teacher),
					reInstructor: describeDrift(dropdowns.drift.reInstructor)
				}
			: null
	};
};

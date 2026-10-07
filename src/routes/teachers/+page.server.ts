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

	const [teachers, people, qualifications, enrollments, dropdowns] = await Promise.all([
		listTeachers(locals.db),
		getPeople(locals.db),
		getAllCurrentQualifications(locals.db),
		getAssignedEnrollments(locals.db),
		getStoredDropdownDrift(locals.db)
	]);

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
		dropdowns: dropdowns
			? {
					checkedAt: dropdowns.checkedAt,
					teacher: describeDrift(dropdowns.drift.teacher),
					reInstructor: describeDrift(dropdowns.drift.reInstructor)
				}
			: null
	};
};

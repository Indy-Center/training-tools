import { redirect } from '@sveltejs/kit';
import { canManageTeachers } from '$lib/utils/permissions';
import { getPeople } from '$lib/server/roster';
import {
	assignmentsFor,
	getActiveTeacher,
	getAssignedEnrollments,
	getCurrentQualifications,
	studentRows
} from '$lib/server/teachers';
import { QUALIFICATION_CREDENTIALS, slotSummary } from '$lib/teachers';
import type { PageServerLoad } from './$types';

/**
 * A teacher's own dashboard: the students assigned to them, and their slots.
 *
 * Open to anyone currently on the teacher roster — which comes from VATUSA's
 * ZID INS/MTR roles, not an identity role. `hooks.server.ts` has already
 * proved there is a session. No actions here: editing happens on the teacher's
 * own `/teachers/{cid}` page, which gates its actions itself.
 *
 * A teacher can also be a student. Their own enrollment is never listed here
 * (see `assignmentsFor`), and nothing on this page touches their student view.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const session = locals.session!;
	const teacher = await getActiveTeacher(locals.db, session.user.cid);

	if (!teacher) {
		// Managers who are not teachers have the roster instead.
		redirect(303, canManageTeachers(session.roles) ? '/teachers' : '/');
	}

	const [enrollments, people, qualifications] = await Promise.all([
		getAssignedEnrollments(locals.db),
		getPeople(locals.db),
		getCurrentQualifications(locals.db, teacher.cid)
	]);

	const assignments = assignmentsFor(teacher, enrollments);
	const levels = new Map(qualifications.map((row) => [row.code, row.level]));

	return {
		teacher: {
			cid: teacher.cid,
			status: teacher.status,
			initials: teacher.initials,
			availability: teacher.availability,
			roles: teacher.roles
		},
		slots: slotSummary({
			status: teacher.status,
			studentSlots: teacher.studentSlots,
			inTraining: assignments.inTraining
		}),
		students: studentRows(assignments.students, people, platform?.env.JIRA_BASE_URL),
		selfAssigned: assignments.selfAssigned !== null,
		qualifications: QUALIFICATION_CREDENTIALS.map((credential) => ({
			code: credential.code,
			name: credential.name,
			level: levels.get(credential.code) ?? null
		}))
	};
};

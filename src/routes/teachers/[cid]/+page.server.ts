import { error, fail, redirect } from '@sveltejs/kit';
import { canManageTeachers } from '$lib/utils/permissions';
import { displayName } from '$lib/user';
import { requireRole, requireSession } from '$lib/server/guards';
import { getPeople, namesFor } from '$lib/server/roster';
import { getTimeline } from '$lib/server/timeline';
import { notifyInBackground } from '$lib/server/notify';
import {
	assignmentsFor,
	capacityNotice,
	checkTeacherDropdowns,
	getAssignedEnrollments,
	getCurrentQualifications,
	getTeacher,
	listTeachers,
	setTeacherQualifications,
	statusNotice,
	studentRows,
	teacherFacts,
	teacherLabel,
	updateTeacherProfile,
	type QualificationEdit
} from '$lib/server/teachers';
import {
	QUALIFICATION_CREDENTIALS,
	QUALIFICATION_LEVELS,
	TEACHER_STATUSES,
	allowedLevels,
	automaticLevel,
	normalizeInitials,
	validateTeacherProfile,
	type QualificationLevel,
	type TeacherStatus
} from '$lib/teachers';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Who may do what here, checked in the load **and** in every action — a form
 * action runs before any load, and `hooks.server.ts` only proves a session.
 * See decisions/0004-gate-in-handle-not-layout.md
 *
 * - Training admins (`training:teachers:manage`): everything.
 * - The teacher themselves: see their own page, and edit their availability
 *   and slots. Not their status, initials or qualifications.
 * - Anyone else: bounced home. The roster is for training admins.
 */
function access(event: Pick<RequestEvent, 'locals' | 'params'>) {
	const session = requireSession(event.locals);
	const manager = canManageTeachers(session.roles);
	const self = session.user.cid === event.params.cid;

	if (!manager && !self) redirect(303, '/');

	return { session, manager, self };
}

/** For the actions only a training admin may run — not the teacher on their own page. */
function managerAccess(event: Pick<RequestEvent, 'locals'>) {
	return { session: requireRole(event.locals, canManageTeachers), manager: true };
}

async function loadTeacher(event: Pick<RequestEvent, 'locals' | 'params'>, manager: boolean) {
	const teacher = await getTeacher(event.locals.db, event.params.cid);
	if (!teacher) {
		// A manager mistyping a CID should see it; someone visiting their own
		// URL without being a teacher just goes home.
		if (manager) error(404, 'Nobody with that CID has been on the teacher roster');
		redirect(303, '/');
	}
	return teacher;
}

/** Run the Jira dropdown check after the response; a change here may affect it. */
function recheckDropdowns(event: Pick<RequestEvent, 'locals' | 'platform'>) {
	const checking = checkTeacherDropdowns(event.locals.db, event.platform?.env).catch((err) =>
		console.error('[training-tools] dropdown check after edit failed', err)
	);
	event.platform?.ctx?.waitUntil(checking);
}

export const load: PageServerLoad = async (event) => {
	const { manager, self } = access(event);
	const teacher = await loadTeacher(event, manager);
	const { locals, platform } = event;

	const [people, current, enrollments, timeline] = await Promise.all([
		getPeople(locals.db),
		getCurrentQualifications(locals.db, teacher.cid),
		getAssignedEnrollments(locals.db),
		getTimeline(locals.db, teacher.cid)
	]);

	const person = people.get(teacher.cid);
	const facts = teacherFacts(teacher, person);
	const assignments = assignmentsFor(teacher, enrollments);
	const levels = new Map(current.map((row) => [row.code, row.level]));

	return {
		manager,
		self,
		teacher: {
			cid: teacher.cid,
			name: person?.name ?? teacher.cid,
			ratingShort: person?.ratingShort ?? '—',
			roles: teacher.roles,
			status: teacher.status,
			initials: teacher.initials,
			availability: teacher.availability,
			studentMessage: teacher.studentMessage,
			studentSlots: teacher.studentSlots,
			onRoster: teacher.removedAt === null,
			removedAt: teacher.removedAt,
			joinedAt: teacher.joinedAt
		},
		students: studentRows(assignments.students, people),
		qualifications: QUALIFICATION_CREDENTIALS.map((credential) => ({
			code: credential.code,
			name: credential.name,
			kind: credential.kind,
			level: levels.get(credential.code) ?? null,
			allowed: allowedLevels(credential.code, facts),
			// Instructors hold these without anyone granting it; the form shows the
			// level but does not offer to change it.
			automatic: automaticLevel(credential.code, facts)
		})),
		timeline,
		names: namesFor(
			timeline.map((entry) => entry.actor),
			people
		)
	};
};

export const actions: Actions = {
	/**
	 * Named actions only — a `default` beside named ones breaks every POST to
	 * the route (how `/enroll` broke in DEV-108). `actions.test.ts` pins this.
	 */

	/** Availability and slots: the teacher or a training admin. */
	updateProfile: async (event) => {
		const { session } = access(event);
		const teacher = await loadTeacher(event, canManageTeachers(session.roles));

		if (teacher.removedAt !== null) {
			return fail(400, { profileError: 'No longer on the teacher roster.' });
		}

		const data = await event.request.formData();
		const validation = validateTeacherProfile({
			availability: data.get('availability') ?? '',
			studentSlots: data.get('studentSlots') ?? '',
			studentMessage: data.get('studentMessage') ?? ''
		});
		if (!validation.ok) return fail(400, { profileErrors: validation.errors });

		let changes;
		try {
			changes = await updateTeacherProfile(
				event.locals.db,
				teacher,
				validation.values,
				session.user.cid
			);
		} catch (err) {
			console.error('[training-tools] updateTeacherProfile failed', err);
			return fail(500, { profileError: 'Could not save. Try again.' });
		}

		const people = await getPeople(event.locals.db);
		const notice = capacityNotice({
			teacher: teacherLabel(teacher, people.get(teacher.cid)),
			changedBy: displayName(session.user),
			changes
		});
		if (notice) notifyInBackground(event.platform, notice);

		return { profileSaved: true };
	},

	/** Status and initials: training admins only. */
	updateAdmin: async (event) => {
		const { session, manager } = managerAccess(event);
		const teacher = await loadTeacher(event, manager);

		if (teacher.removedAt !== null) {
			return fail(400, { adminError: 'No longer on the teacher roster.' });
		}

		const data = await event.request.formData();
		const status = String(data.get('status') ?? '') as TeacherStatus;
		if (!TEACHER_STATUSES.includes(status)) {
			return fail(400, { adminError: 'Choose Active or LOA.' });
		}

		const rawInitials = String(data.get('initials') ?? '').trim();
		const initials = rawInitials === '' ? null : normalizeInitials(rawInitials);
		if (rawInitials !== '' && initials === null) {
			return fail(400, { adminError: 'Initials are two letters, like SC.' });
		}

		if (initials && initials !== teacher.initials) {
			// The unique index would refuse it anyway; this says who has them.
			const holder = (await listTeachers(event.locals.db)).find(
				(other) => other.initials === initials && other.cid !== teacher.cid
			);
			if (holder) {
				return fail(400, { adminError: `${initials} already belongs to CID ${holder.cid}.` });
			}
		}

		let changes;
		try {
			changes = await updateTeacherProfile(
				event.locals.db,
				teacher,
				{ status, initials },
				session.user.cid
			);
		} catch (err) {
			console.error('[training-tools] update teacher status/initials failed', err);
			return fail(500, { adminError: 'Could not save. Try again.' });
		}

		const statusChange = changes.find((change) => change.field === 'status');
		if (statusChange) {
			const [people, enrollments] = await Promise.all([
				getPeople(event.locals.db),
				getAssignedEnrollments(event.locals.db)
			]);
			const notice = statusNotice({
				teacher: teacherLabel({ cid: teacher.cid, initials }, people.get(teacher.cid)),
				from: teacher.status,
				to: status,
				automatic: false,
				assigned: assignmentsFor({ cid: teacher.cid, initials }, enrollments).students.map(
					(student) => ({
						name: people.get(student.cid)?.name ?? student.submittedName,
						course: student.course,
						status: student.status
					})
				)
			});
			if (notice) notifyInBackground(event.platform, notice);
		}

		if (changes.length > 0) recheckDropdowns(event);
		return { adminSaved: true };
	},

	/** Per-course levels: training admins only, and only within the rules. */
	setQualifications: async (event) => {
		const { session, manager } = managerAccess(event);
		const teacher = await loadTeacher(event, manager);

		if (teacher.removedAt !== null) {
			return fail(400, {
				qualificationErrors: ['No longer on the teacher roster; qualifications are read-only.']
			});
		}

		const data = await event.request.formData();
		const people = await getPeople(event.locals.db);
		const facts = teacherFacts(teacher, people.get(teacher.cid));

		const edits: QualificationEdit[] = [];
		for (const credential of QUALIFICATION_CREDENTIALS) {
			// Automatic levels are not on the form, and are not the admin's to set.
			if (automaticLevel(credential.code, facts)) continue;

			const raw = String(data.get(`level:${credential.code}`) ?? '');
			if (raw !== '' && !QUALIFICATION_LEVELS.includes(raw as QualificationLevel)) {
				return fail(400, { qualificationErrors: [`${raw} is not a level`] });
			}
			edits.push({ code: credential.code, level: raw === '' ? null : (raw as QualificationLevel) });
		}

		let result;
		try {
			result = await setTeacherQualifications(
				event.locals.db,
				teacher,
				facts,
				edits,
				session.user.cid
			);
		} catch (err) {
			console.error('[training-tools] setTeacherQualifications failed', err);
			return fail(500, { qualificationErrors: ['Could not save. Try again.'] });
		}

		if (!result.ok) return fail(400, { qualificationErrors: result.problems });

		if (result.changed > 0) recheckDropdowns(event);
		return { qualificationsSaved: true };
	}
};

import { error, fail, redirect } from '@sveltejs/kit';
import { canManageTeachers } from '$lib/utils/permissions';
import { requireSession } from '$lib/server/guards';
import { getPeople } from '$lib/server/roster';
import {
	completeExam,
	completeTraining,
	failExam,
	getEnrollment,
	claimExam,
	type FlowResult
} from '$lib/server/enrollments';
import {
	assignmentsFor,
	getActiveTeacher,
	getAssignedEnrollments,
	getCurrentQualifications,
	studentRows
} from '$lib/server/teachers';
import {
	afterTrainingOptions,
	canCompleteExam,
	canCompleteTraining,
	canClaimExam,
	evaluatesCourse
} from '$lib/course-completion';
import { isAssignedTo, QUALIFICATION_CREDENTIALS, slotSummary } from '$lib/teachers';
import { displayName } from '$lib/user';
import type { Enrollment } from '$lib/db/schema/enrollments';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * A teacher's own dashboard: the students assigned to them, their slots, and
 * the end of each student's course.
 *
 * Open to anyone currently on the teacher roster — which comes from VATUSA's
 * ZID INS/MTR roles, not an identity role. `hooks.server.ts` has already
 * proved there is a session.
 *
 * A teacher can also be a student. Their own enrollment is never listed here
 * (see `assignmentsFor`), and nothing on this page touches their student view.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const session = requireSession(locals);
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
	// Keyed by plain string: a request's course need not be a credential (Custom Training).
	const levels = new Map<string, (typeof qualifications)[number]['level']>(
		qualifications.map((row) => [row.code, row.level])
	);
	const byId = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
	const jiraBaseUrl = platform?.env.JIRA_BASE_URL;

	// Everyone at the exam stage this teacher has a part in: exams they could
	// claim, exams they have claimed, and their own students — who are still
	// under "Your students" too — with the reason they cannot examine them.
	const exams = enrollments.filter(
		(enrollment) =>
			enrollment.status === 'rating-exam' &&
			enrollment.cid !== teacher.cid &&
			(evaluatesCourse(enrollment.course, levels) ||
				isAssignedTo(enrollment.reInstructor, teacher) ||
				isAssignedTo(enrollment.teacher, teacher))
	);

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
		// Still listed at the exam stage: the teacher goes on filing reports for
		// practice sessions until the exam is done.
		students: studentRows(assignments.students, people, jiraBaseUrl).map((row) => {
			const enrollment = byId.get(row.enrollmentId)!;
			return {
				...row,
				canComplete: canCompleteTraining(enrollment, teacher),
				// What "training complete" may lead to: one button each, saying so.
				next: afterTrainingOptions(enrollment.course)
			};
		}),
		exams: studentRows(exams, people, jiraBaseUrl).map((row) => {
			const enrollment = byId.get(row.enrollmentId)!;
			return {
				...row,
				taughtBy: enrollment.teacher,
				examiner: enrollment.reInstructor,
				canClaim: canClaimExam(enrollment, teacher, levels),
				canComplete: canCompleteExam(enrollment, teacher),
				// Shown with a greyed-out button rather than hidden, so it is clear why
				// they cannot claim it.
				taughtByYou: isAssignedTo(enrollment.teacher, teacher)
			};
		}),
		// Whether to show the exams panel when it is empty: only to someone who examines.
		evaluates: [...levels.values()].includes('evaluator'),
		selfAssigned: assignments.selfAssigned !== null,
		qualifications: QUALIFICATION_CREDENTIALS.map((credential) => ({
			code: credential.code,
			name: credential.name,
			level: levels.get(credential.code) ?? null
		}))
	};
};

/**
 * Who is acting, and on which request. A form action runs before any load, so
 * being a teacher is checked again here; whether **this** teacher may take
 * **this** step is each action's own check, against `$lib/course-completion`.
 */
async function acting(event: Pick<RequestEvent, 'locals' | 'request'>) {
	const session = requireSession(event.locals);
	const teacher = await getActiveTeacher(event.locals.db, session.user.cid);
	if (!teacher) error(403, 'Only teachers can do this.');

	const form = await event.request.formData();
	const id = form.get('id');
	const enrollment = typeof id === 'string' && id ? await getEnrollment(event.locals.db, id) : null;

	return { session, teacher, enrollment, form };
}

const GONE = 'That request is no longer open. Reload the page.';
const NOT_YOURS = 'That is not yours to do, or it has already been done. Reload the page.';

function finish(result: FlowResult, done: string, enrollment: Enrollment) {
	if (!result.ok) return fail(502, { flowError: result.message });
	return { flowDone: `${done} for ${enrollment.submittedName}.` };
}

export const actions: Actions = {
	/**
	 * Named, like every action in this app — a `default` beside a named action
	 * breaks every POST to the route. `actions.test.ts` pins it.
	 */

	/** The assigned teacher: the card is dated, and moves on. */
	completeTraining: async (event) => {
		const { session, teacher, enrollment, form } = await acting(event);
		if (!enrollment) return fail(404, { flowError: GONE });
		if (!canCompleteTraining(enrollment, teacher)) return fail(403, { flowError: NOT_YOURS });

		// Only a course with a choice sends one; anything it does not allow is
		// refused, so a standard course cannot be steered past its exam from here.
		const next = form.get('next');
		const options = afterTrainingOptions(enrollment.course);
		const to = options.find((option) => option === next);
		if (next !== null && !to) return fail(400, { flowError: NOT_YOURS });

		const result = await completeTraining(
			event.locals.db,
			event.platform?.env,
			enrollment,
			displayName(session.user),
			to
		);
		return finish(result, 'Training marked complete', enrollment);
	},

	/** An evaluator on the course claims the exam: they go on the card. */
	claimExam: async (event) => {
		const { session, teacher, enrollment } = await acting(event);
		if (!enrollment) return fail(404, { flowError: GONE });

		const qualifications = await getCurrentQualifications(event.locals.db, teacher.cid);
		const levels = new Map(qualifications.map((row) => [row.code, row.level]));
		if (!canClaimExam(enrollment, teacher, levels)) {
			return fail(403, { flowError: NOT_YOURS });
		}

		const result = await claimExam(event.locals.db, event.platform?.env, enrollment, {
			cid: teacher.cid,
			initials: teacher.initials,
			name: displayName(session.user)
		});
		return finish(result, 'Exam claimed', enrollment);
	},

	/** The examiner on the card, after a pass: the exam is dated, and the card moves on. */
	completeExam: async (event) => {
		const { session, teacher, enrollment } = await acting(event);
		if (!enrollment) return fail(404, { flowError: GONE });
		if (!canCompleteExam(enrollment, teacher)) return fail(403, { flowError: NOT_YOURS });

		const result = await completeExam(
			event.locals.db,
			event.platform?.env,
			enrollment,
			displayName(session.user)
		);
		return finish(result, 'Rating exam marked complete', enrollment);
	},

	/** The examiner on the card, after a fail: the card goes to the TA as Needs CATP. */
	failExam: async (event) => {
		const { session, teacher, enrollment } = await acting(event);
		if (!enrollment) return fail(404, { flowError: GONE });
		if (!canCompleteExam(enrollment, teacher)) return fail(403, { flowError: NOT_YOURS });

		const result = await failExam(
			event.locals.db,
			event.platform?.env,
			enrollment,
			displayName(session.user)
		);
		return finish(result, 'Rating exam marked not passed', enrollment);
	}
};

import { fail } from '@sveltejs/kit';
import { formatDate } from '$lib/format';
import { canManageStudents } from '$lib/utils/permissions';
import { requireRole, requireSession } from '$lib/server/guards';
import {
	getEnrollment,
	getOwnOpenEnrollment,
	getWaitlistPosition,
	getWaitlistStats
} from '$lib/server/enrollments';
import {
	assignTeacher,
	assignVatusaCourse,
	changeTeacher,
	completeVatusaCourse,
	getLeftTheRoster,
	getWaitlistSheet,
	removeStudent,
	withdrawStudent
} from '$lib/server/enrollments/waitlist';
import {
	closeRequestForGood,
	keepRequestInLine,
	restoreRequestNow,
	stopKeepingRequestInLine,
	type AdminActionResult
} from '$lib/server/enrollments/roster-admin';
import { SHEET_STATUSES } from '$lib/waitlist';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The waitlist: one page for two audiences.
 *
 * - **Any signed-in VATSIM member** gets the counts per course, and their own
 *   place if they are waiting. `hooks.server.ts` has already proved a session.
 * - **`training:students:manage`** (which `training:admin` covers) also gets
 *   the staff sheet: everyone waiting, by name, with the VATUSA written course
 *   each needs and the teacher to give them.
 *
 * The sheet's rows are **loaded only for that role**, not merely hidden: this
 * page is open to every member, and the rows name people and carry what they
 * told us about their availability. `page.server.test.ts` pins it. Each action
 * checks the role again, because a form action runs before any load.
 *
 * Someone on the waitlist can hold the role too; they get both, their own
 * place first.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const session = requireSession(locals);
	const env: Partial<Env> | undefined = platform?.env;

	const [courses, enrollment] = await Promise.all([
		getWaitlistStats(locals.db),
		getOwnOpenEnrollment(locals)
	]);

	return {
		courses,
		mine:
			enrollment?.status === 'waitlist'
				? {
						course: enrollment.course,
						notification: enrollment.notificationPreference,
						...(await getWaitlistPosition(locals.db, enrollment))
					}
				: null,
		sheet: canManageStudents(session.roles)
			? {
					rows: await getWaitlistSheet(locals.db, platform?.env.JIRA_BASE_URL),
					leftTheRoster: await getLeftTheRoster(locals.db, platform?.env.JIRA_BASE_URL),
					// Whether VATUSA can be asked to assign a course, or only the card dated.
					vatusaKeySet: Boolean(env?.VATUSA_API_KEY?.trim())
				}
			: null
	};
};

/**
 * Who is acting, by CID and name, and the request id the form sent. The
 * Left the roster actions take the id as it is: a removed request is not on
 * the sheet, so they look it up themselves.
 */
async function acting(event: Pick<RequestEvent, 'locals' | 'request'>) {
	const session = requireRole(event.locals, canManageStudents);
	const form = await event.request.formData();
	const id = form.get('id');
	return {
		admin: { cid: session.user.cid, name: displayName(session.user) },
		form,
		id: typeof id === 'string' ? id : ''
	};
}

/** `acting()`, and the request it names, while the sheet still lists it. */
async function actingOnSheet(event: Pick<RequestEvent, 'locals' | 'request'>) {
	const { admin, form, id } = await acting(event);
	const enrollment = id ? await getEnrollment(event.locals.db, id) : null;
	return {
		by: admin.name,
		form,
		enrollment:
			enrollment && (SHEET_STATUSES as readonly string[]).includes(enrollment.status)
				? enrollment
				: null
	};
}

/** A Left the roster action's answer, in the sheet's banners. */
function answer(result: AdminActionResult) {
	return result.ok
		? { sheetDone: result.message }
		: fail(result.status, { sheetError: result.message });
}

const GONE = 'That request is no longer open. Reload the page.';

export const actions: Actions = {
	/**
	 * Named, like every action in this app — a `default` beside a named action
	 * breaks every POST to the route. `actions.test.ts` pins it.
	 */

	/** Assign the VATUSA written course, and date the card. */
	assignVatusa: async (event) => {
		const { by, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await assignVatusaCourse(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		if (result.alreadyPassed) {
			return {
				sheetDone: `${enrollment.submittedName} has already passed this VATUSA exam, on ${formatDate(result.alreadyPassed, 'long')}. Nothing was assigned, and the course is marked as completed.`,
				sheetNote: null
			};
		}

		return {
			sheetDone: `VATUSA course marked as assigned for ${enrollment.submittedName}.`,
			sheetNote: result.byHand ?? null
		};
	},

	/** Date the card as having passed it, when the transcript check has not. */
	completeVatusa: async (event) => {
		const { by, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await completeVatusaCourse(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `VATUSA course marked as completed for ${enrollment.submittedName}.` };
	},

	/** Give them a teacher: the card moves to In Training. */
	assignTeacher: async (event) => {
		const { by, form, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const teacher = form.get('teacher');
		if (typeof teacher !== 'string' || !teacher) {
			return fail(400, { sheetError: 'Choose a teacher.' });
		}

		const result = await assignTeacher(
			event.locals.db,
			event.platform?.env,
			enrollment,
			teacher,
			by
		);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `Teacher assigned for ${enrollment.submittedName}.` };
	},

	/** Move someone who is already in training to a different teacher. */
	changeTeacher: async (event) => {
		const { by, form, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const teacher = form.get('teacher');
		if (typeof teacher !== 'string' || !teacher) {
			return fail(400, { sheetError: 'Choose a teacher.' });
		}

		const result = await changeTeacher(
			event.locals.db,
			event.platform?.env,
			enrollment,
			teacher,
			by
		);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `Teacher changed for ${enrollment.submittedName}.` };
	},

	/** Staff end the request: the card moves to Removed. */
	removeStudent: async (event) => {
		const { by, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await removeStudent(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `${enrollment.submittedName} removed.` };
	},

	/** The student is giving it up, recorded by staff: the card moves to Withdrawn. */
	withdrawStudent: async (event) => {
		const { by, enrollment } = await actingOnSheet(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await withdrawStudent(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `${enrollment.submittedName} withdrawn.` };
	},

	/*
	 * Left the roster: a request a roster removal took off, or one whose student
	 * is off the home roster and not yet removed. See
	 * decisions/0037-roster-removal-and-restore.md
	 */

	/** Put it back where it was now, even if the student is still away. */
	restoreNow: async (event) => {
		const { admin, id } = await acting(event);
		return answer(
			await restoreRequestNow(event.locals.db, event.platform?.env, id, admin, new Date())
		);
	},

	/** End its restore window: the student enrolls again at the back. */
	closeForGood: async (event) => {
		const { admin, id } = await acting(event);
		return answer(
			await closeRequestForGood(event.locals.db, event.platform?.env, id, admin, new Date())
		);
	},

	/** Exempt it from roster removal while the student is away. */
	keepInLine: async (event) => {
		const { admin, id } = await acting(event);
		return answer(await keepRequestInLine(event.locals.db, id, admin, new Date()));
	},

	/** Lift the exemption: the next pass removes it if the 24 hours have passed. */
	stopKeepingInLine: async (event) => {
		const { id } = await acting(event);
		return answer(await stopKeepingRequestInLine(event.locals.db, id, new Date()));
	}
};

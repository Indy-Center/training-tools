import { fail } from '@sveltejs/kit';
import { canManageStudents } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import { getEnrollment } from '$lib/server/enrollments';
import {
	assignTeacher,
	assignVatusaCourse,
	completeVatusaCourse,
	getWaitlistSheet
} from '$lib/server/enrollments/waitlist';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The waitlist, for the people who work it: everyone waiting, across every
 * course, in one table — with the VATUSA written course each needs and the
 * teacher to give them once it is passed.
 *
 * For `training:students:manage` (which `training:admin` covers), checked in
 * the load **and** in every action: a form action runs before any load, and
 * `hooks.server.ts` only proves a session.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireRole(locals, canManageStudents);

	const env: Partial<Env> | undefined = platform?.env;

	return {
		rows: await getWaitlistSheet(locals.db, platform?.env.JIRA_BASE_URL),
		// Whether VATUSA can be asked to assign a course, or only the card dated.
		vatusaKeySet: Boolean(env?.VATUSA_API_KEY?.trim())
	};
};

/** Who is acting, and on which request still on the waitlist. */
async function acting(event: Pick<RequestEvent, 'locals' | 'request'>) {
	const session = requireRole(event.locals, canManageStudents);
	const form = await event.request.formData();
	const id = form.get('id');
	const enrollment = typeof id === 'string' && id ? await getEnrollment(event.locals.db, id) : null;

	return {
		by: displayName(session.user),
		form,
		enrollment: enrollment?.status === 'waitlist' ? enrollment : null
	};
}

const GONE = 'That request is no longer on the waitlist. Reload the page.';

export const actions: Actions = {
	/**
	 * Named, like every action in this app — a `default` beside a named action
	 * breaks every POST to the route. `actions.test.ts` pins it.
	 */

	/** Assign the VATUSA written course, and date the card. */
	assignVatusa: async (event) => {
		const { by, enrollment } = await acting(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await assignVatusaCourse(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return {
			sheetDone: `VATUSA course marked as assigned for ${enrollment.submittedName}.`,
			sheetNote: result.byHand ?? null
		};
	},

	/** Date the card as having passed it, when the transcript check has not. */
	completeVatusa: async (event) => {
		const { by, enrollment } = await acting(event);
		if (!enrollment) return fail(404, { sheetError: GONE });

		const result = await completeVatusaCourse(event.locals.db, event.platform?.env, enrollment, by);
		if (!result.ok) return fail(502, { sheetError: result.message });

		return { sheetDone: `VATUSA course marked as completed for ${enrollment.submittedName}.` };
	},

	/** Give them a teacher: the card moves to In Training. */
	assignTeacher: async (event) => {
		const { by, form, enrollment } = await acting(event);
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
	}
};

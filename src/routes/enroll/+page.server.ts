import { fail, redirect } from '@sveltejs/kit';
import { getRosterMember } from '$lib/server/roster';
import { getOpenEnrollment, submitEnrollment, withdrawEnrollment } from '$lib/server/enrollments';
import { validateEnrollment } from '$lib/enrollment';
import { displayName, atcRating } from '$lib/user';
import type { Actions, PageServerLoad } from './$types';

/**
 * Enrollment is for rostered home controllers.
 *
 * The home page already hides the link for everyone else, but that is
 * presentation — `/enroll` is only auth-gated by `hooks.server.ts`, so without
 * this check any signed-in user could reach the form directly. Both the load
 * and the actions enforce it, because a form action runs before any load.
 */
async function requireHomeController(locals: App.Locals) {
	const session = locals.session!;
	const rosterMember = await getRosterMember(locals.db, session.user.cid);

	if (rosterMember?.membership !== 'home') {
		redirect(303, '/');
	}

	return { session, rosterMember };
}

export const load: PageServerLoad = async ({ locals }) => {
	const { session, rosterMember } = await requireHomeController(locals);

	const enrollment = await getOpenEnrollment(locals.db, session.user.cid);

	return {
		// Shown back to the student as "this is what we send on your behalf".
		controller: {
			cid: session.user.cid,
			name: displayName(session.user),
			rating: rosterMember.ratingShort ?? atcRating(session.user) ?? null
		},
		// Deliberately excludes jiraIssueKey and jiraSyncError: whether the issue
		// has been filed yet is our problem, not something to worry a student with.
		enrollment: enrollment
			? {
					id: enrollment.id,
					course: enrollment.course,
					status: enrollment.status,
					availability: enrollment.availability,
					notificationPreference: enrollment.notificationPreference,
					createdAt: enrollment.createdAt
				}
			: null
	};
};

/**
 * Both actions are **named**, and that is not a style choice: SvelteKit throws
 * "When using named actions, the default action cannot be used" if `default`
 * appears alongside any named action, which breaks every POST to this route.
 * Adding `withdraw` next to a `default` action is exactly how that happened.
 */
export const actions: Actions = {
	enroll: async ({ locals, request, platform }) => {
		const { session, rosterMember } = await requireHomeController(locals);

		// One course at a time. Guards against a double submit and against a second
		// tab that was opened before the first request landed.
		const existing = await getOpenEnrollment(locals.db, session.user.cid);
		if (existing) {
			return fail(409, {
				formError: 'You already have an open training request.'
			});
		}

		const data = await request.formData();
		const input = {
			course: data.get('course') ?? undefined,
			notificationPreference: data.get('notificationPreference') ?? undefined,
			availability: data.get('availability') ?? undefined
		};

		const validation = validateEnrollment(input);
		if (!validation.ok) {
			return fail(400, {
				errors: validation.errors,
				values: {
					course: String(input.course ?? ''),
					notificationPreference: String(input.notificationPreference ?? ''),
					availability: String(input.availability ?? '')
				}
			});
		}

		await submitEnrollment(locals.db, platform?.env, {
			cid: session.user.cid,
			course: validation.values.course,
			submittedName: displayName(session.user),
			submittedRating: rosterMember.ratingShort ?? atcRating(session.user) ?? null,
			availability: validation.values.availability,
			notificationPreference: validation.values.notificationPreference
		});

		// Redirect regardless of whether Jira accepted it: the request is recorded,
		// and the cron files anything that didn't make it. Post/redirect/get so a
		// refresh can't submit twice.
		redirect(303, '/enroll');
	},

	withdraw: async ({ locals, request, platform }) => {
		const { session } = await requireHomeController(locals);

		const data = await request.formData();
		const id = data.get('id');

		if (typeof id !== 'string' || !id) {
			return fail(400, { formError: 'Could not work out which request to withdraw.' });
		}

		// Scoped by CID inside, so a guessed id cannot withdraw someone else's.
		const withdrawn = await withdrawEnrollment(locals.db, platform?.env, id, session.user.cid);

		if (!withdrawn) {
			return fail(404, { formError: 'That request is no longer open.' });
		}

		redirect(303, '/enroll');
	}
};

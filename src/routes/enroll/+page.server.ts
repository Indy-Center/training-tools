import { fail, redirect } from '@sveltejs/kit';
import { submitEnrollment, withdrawEnrollment } from '$lib/server/enrollments';
import { loadTrainingContext } from '$lib/server/training-flow';
import { validateEnrollment } from '$lib/enrollment';
import { divergesFromSuggestion, resolvePlacement } from '$lib/course-placement';
import { findCredential, highestCertification } from '$lib/certifications';
import { TERMS_VERSION } from '$lib/content/enrollment';
import { displayName, atcRating } from '$lib/user';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/enroll` is open to exactly the members the home page shows the enroll
 * branch to: `resolveTrainingFlow()` decides for both, via
 * `loadTrainingContext()`. That is a home controller with a request open, or
 * one who has consolidated and is not due Tier 2 instead.
 *
 * The home page hiding the link is presentation — `/enroll` is only auth-gated
 * by `hooks.server.ts`, so without this any signed-in user could reach the form
 * directly. The load and the `enroll` action both check, because a form action
 * runs before any load.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session!;
	const {
		flow,
		rosterMember,
		openEnrollment: enrollment,
		held: heldCodes
	} = await loadTrainingContext(locals.db, session);

	// `/` explains why, whichever branch it is.
	if (flow !== 'enroll' || !rosterMember) redirect(303, '/');

	const placement = resolvePlacement({ held: heldCodes });

	return {
		// Shown back to the student as "this is what we send on your behalf".
		controller: {
			cid: session.user.cid,
			name: displayName(session.user),
			rating: rosterMember.ratingShort ?? atcRating(session.user) ?? null
		},
		/**
		 * What we think they are due, and why.
		 *
		 * Suggest and confirm — the form still offers every course. We hold an
		 * inferred picture of someone's training; the student and the staff hold
		 * the real one.
		 */
		placement,
		// Shown beside the suggestion so the student can see what it was based on.
		credentials: {
			certification: highestCertification(heldCodes)?.code ?? null,
			endorsements: heldCodes.filter((code) => findCredential(code)?.kind === 'endorsement').sort()
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
		const session = locals.session!;
		const { flow, rosterMember, openEnrollment, held, consolidation } = await loadTrainingContext(
			locals.db,
			session
		);

		// One course at a time. Guards against a double submit and against a second
		// tab that was opened before the first request landed.
		if (openEnrollment) {
			return fail(409, {
				formError: 'You already have an open training request.'
			});
		}

		if (consolidation?.status === 'unknown') {
			return fail(503, {
				formError:
					"We couldn't check your controlling hours with VATSIM. Please try again in a few minutes."
			});
		}

		// Anyone else outside the enroll branch has nothing to submit here.
		if (flow !== 'enroll' || !rosterMember) redirect(303, '/');

		const data = await request.formData();
		const input = {
			course: data.get('course') ?? undefined,
			notificationPreference: data.get('notificationPreference') ?? undefined,
			availability: data.get('availability') ?? undefined
		};
		const agreed = data.get('agreed') === 'on';

		const validation = validateEnrollment(input);

		// Checked here rather than relying on the checkbox's `required`, for the
		// same reason the rest of the form is: the browser attribute is a
		// convenience and a POST can arrive without ever rendering the page.
		if (!validation.ok || !agreed) {
			return fail(400, {
				errors: validation.ok ? {} : validation.errors,
				agreedError: agreed ? undefined : 'Please confirm you have read what we ask of you.',
				values: {
					course: String(input.course ?? ''),
					notificationPreference: String(input.notificationPreference ?? ''),
					availability: String(input.availability ?? ''),
					agreed
				}
			});
		}

		// Recompute rather than trusting a hidden field — otherwise the flag that
		// tells staff "this looks wrong" could be switched off by the person it is
		// about.
		const placement = resolvePlacement({ held });

		await submitEnrollment(locals.db, platform?.env, {
			cid: session.user.cid,
			course: validation.values.course,
			submittedName: displayName(session.user),
			submittedRating: rosterMember.ratingShort ?? atcRating(session.user) ?? null,
			availability: validation.values.availability,
			notificationPreference: validation.values.notificationPreference,
			agreedAt: new Date(),
			agreedTermsVersion: TERMS_VERSION,
			suggestedCourse: divergesFromSuggestion(placement, validation.values.course)
				? placement.suggested
				: null
		});

		// Redirect regardless of whether Jira accepted it: the request is recorded,
		// and the cron files anything that didn't make it. Post/redirect/get so a
		// refresh can't submit twice.
		redirect(303, '/enroll');
	},

	/**
	 * Deliberately not gated on the training flow. Withdrawing only ever touches
	 * the caller's own request (scoped by CID below), so there is nothing to
	 * protect — and giving a place back must never wait on a VATSIM lookup.
	 */
	withdraw: async ({ locals, request, platform }) => {
		const session = locals.session!;

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

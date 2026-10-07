import { fail, redirect } from '@sveltejs/kit';
import {
	getEnrollment,
	getWaitlistPosition,
	submitEnrollment,
	withdrawEnrollment
} from '$lib/server/enrollments';
import { newEnrollmentNotice } from '$lib/server/enrollments/notices';
import { recordEarlierVatusaPass } from '$lib/server/enrollments/waitlist';
import { notifyInBackground } from '$lib/server/notify';
import { requireSession } from '$lib/server/guards';
import { findAssignee, getActiveTeacher } from '$lib/server/teachers';
import { loadTrainingContext } from '$lib/server/training-flow';
import { MOODLE_COURSE_URLS } from '$lib/config';
import { validateEnrollment } from '$lib/enrollment';
import { findCredential, highestCertification } from '$lib/certifications';
import { TERMS_VERSION } from '$lib/content/enrollment';
import { asksForStudentView, hasFinishedTraining, isDueTier2 } from '$lib/training-flow';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad } from './$types';

/**
 * The default view: what a member sees depends on whether they have a request
 * open, and if not, on where they stand with the roster. `resolveTrainingFlow()`
 * decides which; this load gathers what that view draws.
 *
 * `/` is the one page reachable signed out, so the load has to cope with
 * `locals.session` being null — and so do the actions below.
 *
 * For a teacher with nothing left to take as a student, the site opens on
 * `/teach` instead. This page is still theirs to visit — the header links to it
 * with `?view=student`, which is what gets past the redirect.
 *
 * See decisions/0019-default-view-by-enrollment-state.md
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const session = locals.session;
	if (!session) {
		return {
			flow: null,
			rosterMember: null,
			consolidation: null,
			tier2Due: false,
			nextCourse: null,
			request: null,
			enroll: null
		};
	}

	const { flow, rosterMember, openEnrollment, held, consolidation, nextCourse, ratingShort } =
		await loadTrainingContext(locals);

	// The teacher lookup only runs for someone who has finished, so it costs
	// everyone else nothing.
	if (
		!asksForStudentView(url) &&
		hasFinishedTraining({ hasOpenRequest: openEnrollment !== null, held }) &&
		(await getActiveTeacher(locals.db, session.user.cid))
	) {
		redirect(303, '/teach');
	}

	return {
		flow,
		consolidation,
		rosterMember: rosterMember
			? {
					membership: rosterMember.membership,
					ratingShort: rosterMember.ratingShort,
					facility: rosterMember.facility
				}
			: null,
		// Offered alongside the extra-courses and visitor copy; `/enroll/tier-2` gates on the same test.
		tier2Due: rosterMember !== null && isDueTier2(held),
		// The course the enroll view offers, and the one consolidation is holding back.
		nextCourse,
		// Deliberately excludes jiraIssueKey and jiraSyncError: whether the issue
		// has been filed yet is our problem, not something to worry a student with.
		request: openEnrollment
			? {
					id: openEnrollment.id,
					course: openEnrollment.course,
					status: openEnrollment.status,
					createdAt: openEnrollment.createdAt,
					availability: openEnrollment.availability,
					notificationPreference: openEnrollment.notificationPreference,
					// Dates for the timeline on the request panel.
					vatusaAssignedOn: openEnrollment.vatusaAssignedOn,
					vatusaCompletedOn: openEnrollment.vatusaCompletedOn,
					certificationAppliedAt: openEnrollment.certificationAppliedAt,
					// Jira holds initials; the student is shown who that is.
					teacher: await findAssignee(locals.db, openEnrollment.teacher),
					instructor:
						openEnrollment.status === 'rating-exam'
							? await findAssignee(locals.db, openEnrollment.reInstructor)
							: null,
					waitlist:
						openEnrollment.status === 'waitlist'
							? await getWaitlistPosition(locals.db, openEnrollment)
							: null,
					moodleUrl:
						openEnrollment.status === 'in-training'
							? (MOODLE_COURSE_URLS[openEnrollment.course] ?? null)
							: null
				}
			: null,
		enroll:
			flow === 'enroll' && rosterMember
				? {
						// Shown back to the student as "this is what we send on your behalf".
						controller: {
							cid: session.user.cid,
							name: displayName(session.user),
							rating: ratingShort
						},
						// Shown beside the course so the student can see what it was based on.
						credentials: {
							certification: highestCertification(held)?.code ?? null,
							endorsements: held
								.filter((code) => findCredential(code)?.kind === 'endorsement')
								.sort()
						}
					}
				: null
	};
};

/**
 * `/` is on the public allowlist in `hooks.server.ts`, so unlike every other
 * route its actions can be reached with no session. Each one starts with
 * `requireSession()`.
 *
 * Both actions are **named**, and that is not a style choice: SvelteKit throws
 * "When using named actions, the default action cannot be used" if `default`
 * appears alongside any named action, which breaks every POST to this route.
 * Adding `withdraw` next to a `default` action is exactly how that happened.
 */
export const actions: Actions = {
	/**
	 * The page only shows the form to a home controller who may enroll, but that
	 * is presentation: a form action runs before any load, so it checks again.
	 */
	enroll: async ({ locals, request, platform }) => {
		const session = requireSession(locals);
		const { flow, rosterMember, openEnrollment, consolidation, nextCourse, ratingShort } =
			await loadTrainingContext(locals);

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

		// The form offers one course: the next in their progression. Taken from
		// the context rather than trusted from the hidden field, so a hand-built POST
		// cannot enroll in anything else — and a page left open while their
		// certifications changed is told to reload rather than filed for the wrong one.
		if (!nextCourse || input.course !== nextCourse) {
			return fail(409, {
				formError:
					'The course you can enroll in has changed. Reload this page to see your next course.'
			});
		}

		const validation = validateEnrollment(input);

		// Checked here rather than relying on the checkbox's `required`, for the
		// same reason the rest of the form is: the browser attribute is a
		// convenience and a POST can arrive without ever rendering the page.
		if (!validation.ok || !agreed) {
			return fail(400, {
				errors: validation.ok ? {} : validation.errors,
				agreedError: agreed ? undefined : 'Please confirm you have read what we ask of you.',
				values: {
					notificationPreference: String(input.notificationPreference ?? ''),
					availability: String(input.availability ?? ''),
					agreed
				}
			});
		}

		const { enrollment } = await submitEnrollment(locals.db, platform?.env, {
			cid: session.user.cid,
			course: nextCourse,
			submittedName: displayName(session.user),
			submittedRating: ratingShort,
			availability: validation.values.availability,
			notificationPreference: validation.values.notificationPreference,
			agreedAt: new Date(),
			agreedTermsVersion: TERMS_VERSION
		});

		// Tell the training admins. Read back first, for the card's key if the
		// filing went through; sent either way, and never awaited by the student.
		const saved = (await getEnrollment(locals.db, enrollment.id)) ?? enrollment;

		// Someone who has already passed the VATUSA exam this course needs is
		// marked as done with it now, rather than shown as waiting on it. Off the
		// response path: it is a call to VATUSA and one to Jira.
		platform?.ctx?.waitUntil(
			recordEarlierVatusaPass(locals.db, platform?.env, saved).catch((err) =>
				console.error('[training-tools] earlier VATUSA pass check failed', saved.cid, err)
			)
		);
		const jiraBaseUrl = platform?.env.JIRA_BASE_URL?.trim().replace(/\/$/, '');
		notifyInBackground(
			platform,
			newEnrollmentNotice({
				name: saved.submittedName,
				cid: saved.cid,
				course: saved.course,
				teacher: null,
				examiner: null,
				issueKey: saved.jiraIssueKey,
				issueUrl:
					jiraBaseUrl && saved.jiraIssueKey ? `${jiraBaseUrl}/browse/${saved.jiraIssueKey}` : null,
				rating: saved.submittedRating,
				availability: saved.availability,
				notificationPreference: saved.notificationPreference
			})
		);

		// Redirect regardless of whether Jira accepted it: the request is recorded,
		// and the cron files anything that didn't make it. Post/redirect/get so a
		// refresh can't submit twice.
		redirect(303, '/');
	},

	/**
	 * Deliberately not gated on the training flow. Withdrawing only ever touches
	 * the caller's own request (scoped by CID below), so there is nothing to
	 * protect — and giving a place back must never wait on a VATSIM lookup.
	 */
	withdraw: async ({ locals, request, platform }) => {
		const session = requireSession(locals);

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

		redirect(303, '/');
	}
};

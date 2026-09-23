import { redirect } from '@sveltejs/kit';
import { loadTrainingContext } from '$lib/server/training-flow';
import { MOODLE_COURSE_URLS } from '$lib/config';
import type { PageServerLoad } from './$types';

/**
 * The self-led Tier 2 course, for rostered controllers who hold E-RC but not
 * T2-CTR — home or visiting.
 *
 * Gated on the same `loadTrainingContext()` the home page uses, so the page and
 * the button that links to it cannot disagree about who qualifies.
 * `hooks.server.ts` only checks for a session; this is the eligibility check.
 *
 * Nothing is recorded here. Tier 2 has no TRK course and no mentor, so there is
 * no queue to join — staff grant T2-CTR once the Moodle course is complete.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { flow, rosterMember } = await loadTrainingContext(locals.db, locals.session!);

	if (flow !== 'tier-2' || !rosterMember) redirect(303, '/');

	return {
		ratingShort: rosterMember.ratingShort,
		courseUrl: MOODLE_COURSE_URLS['T2-CTR'] ?? null
	};
};

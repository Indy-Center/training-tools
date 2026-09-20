import { getRosterMember } from '$lib/server/roster';
import { getOpenEnrollment } from '$lib/server/enrollments';
import { resolveTrainingFlow } from '$lib/training-flow';
import type { PageServerLoad } from './$types';

/**
 * DEV-112: sort signed-in members into the right starting point.
 *
 * `/` is the one route reachable signed out, so this load has to cope with
 * `locals.session` being null.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session;
	if (!session) return { flow: null, rosterMember: null, hasOpenEnrollment: false };

	const rosterMember = await getRosterMember(locals.db, session.user.cid);

	const flow = resolveTrainingFlow({
		membership: rosterMember?.membership ?? null,
		// Prefer VATUSA's rating for rostered members (it is the facility's own
		// record); fall back to what identity captured from VATSIM Connect.
		ratingId: rosterMember?.rating ?? session.user.vatsimData.vatsim?.rating?.id ?? null,
		ratingShort: rosterMember?.ratingShort ?? session.user.vatsimData.vatsim?.rating?.short ?? null
	});

	// Only the enroll branch renders a call to action that depends on this, so
	// don't spend the query on anyone else.
	const hasOpenEnrollment =
		flow === 'enroll' ? (await getOpenEnrollment(locals.db, session.user.cid)) !== null : false;

	return {
		flow,
		hasOpenEnrollment,
		rosterMember: rosterMember
			? {
					membership: rosterMember.membership,
					ratingShort: rosterMember.ratingShort,
					facility: rosterMember.facility
				}
			: null
	};
};

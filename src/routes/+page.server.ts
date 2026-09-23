import { getWaitlistPosition } from '$lib/server/enrollments';
import { loadTrainingContext } from '$lib/server/training-flow';
import { MOODLE_COURSE_URLS } from '$lib/config';
import type { PageServerLoad } from './$types';

/**
 * DEV-112: sort signed-in members into the right starting point.
 *
 * `/` is the one route reachable signed out, so this load has to cope with
 * `locals.session` being null.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session;
	if (!session) {
		return { flow: null, rosterMember: null, request: null, consolidation: null };
	}

	const { flow, rosterMember, openEnrollment, consolidation } = await loadTrainingContext(
		locals.db,
		session
	);

	return {
		flow,
		consolidation,
		// What the enroll branch shows instead of a button, when a request is open.
		request: openEnrollment
			? {
					course: openEnrollment.course,
					status: openEnrollment.status,
					createdAt: openEnrollment.createdAt,
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
		rosterMember: rosterMember
			? {
					membership: rosterMember.membership,
					ratingShort: rosterMember.ratingShort,
					facility: rosterMember.facility
				}
			: null
	};
};

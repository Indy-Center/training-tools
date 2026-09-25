import { getOpenEnrollment, getWaitlistPosition, getWaitlistStats } from '$lib/server/enrollments';
import type { PageServerLoad } from './$types';

/**
 * DEV-111: per-course waitlist and training counts.
 *
 * Public — see `PUBLIC_PATHS` in hooks.server.ts — so `locals.session` may be
 * null. Signed in with a request on the waitlist, the viewer also gets their
 * own place in that course's queue; nobody else's is ever exposed.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const courses = await getWaitlistStats(locals.db);

	const session = locals.session;
	const enrollment = session ? await getOpenEnrollment(locals.db, session.user.cid) : null;

	return {
		courses,
		mine:
			enrollment?.status === 'waitlist'
				? {
						course: enrollment.course,
						notification: enrollment.notificationPreference,
						...(await getWaitlistPosition(locals.db, enrollment))
					}
				: null
	};
};

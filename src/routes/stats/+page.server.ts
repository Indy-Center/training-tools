import { getOpenEnrollment, getWaitlistPosition, getWaitlistStats } from '$lib/server/enrollments';
import type { PageServerLoad } from './$types';

/**
 * DEV-111: per-course waitlist and training counts.
 *
 * For any signed-in VATSIM member, rostered here or not — `hooks.server.ts`
 * redirects everyone else to identity, so `locals.session` is non-null. A
 * viewer with a request on the waitlist also gets their own place in that
 * course's queue; nobody else's is ever exposed.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session!;

	const [courses, enrollment] = await Promise.all([
		getWaitlistStats(locals.db),
		getOpenEnrollment(locals.db, session.user.cid)
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
				: null
	};
};

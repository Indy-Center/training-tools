import { resolveIdentityUrl } from '$lib/server/identity';
import { getOpenEnrollment } from '$lib/server/enrollments';
import { getActiveTeacher } from '$lib/server/teachers';
import type { LayoutServerLoad } from './$types';

/**
 * Header data only. Nothing here gates anything — per ADR 0004 a layout load
 * is the wrong place for that, and every route checks access itself.
 */
export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const session = locals.session;

	const [teacher, openEnrollment] = session
		? await Promise.all([
				getActiveTeacher(locals.db, session.user.cid),
				getOpenEnrollment(locals.db, session.user.cid)
			])
		: [null, null];

	return {
		user: session?.user,
		roles: session?.roles ?? [],
		// So the header can offer /teach. Being a teacher comes from the VATUSA
		// roster, not an identity role, so the roles above cannot say it.
		isTeacher: teacher !== null,
		// So the header can call `/` "My Training" rather than "Enroll". Submitting
		// and withdrawing both invalidate this load, so the label follows the page.
		hasOpenEnrollment: openEnrollment !== null,
		// The header renders outbound /login and /logout links, so the client
		// needs to know where identity lives.
		identityUrl: resolveIdentityUrl(platform)
	};
};

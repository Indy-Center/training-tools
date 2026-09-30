import { resolveIdentityUrl } from '$lib/server/identity';
import { getActiveTeacher } from '$lib/server/teachers';
import type { LayoutServerLoad } from './$types';

/**
 * Header data only. Nothing here gates anything — per ADR 0004 a layout load
 * is the wrong place for that, and every route checks access itself.
 */
export const load: LayoutServerLoad = async ({ locals, platform }) => {
	const session = locals.session;

	return {
		user: session?.user,
		roles: session?.roles ?? [],
		// So the header can offer /teach. Being a teacher comes from the VATUSA
		// roster, not an identity role, so the roles above cannot say it.
		isTeacher: session ? (await getActiveTeacher(locals.db, session.user.cid)) !== null : false,
		// The header renders outbound /login and /logout links, so the client
		// needs to know where identity lives.
		identityUrl: resolveIdentityUrl(platform)
	};
};

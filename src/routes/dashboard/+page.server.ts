import type { PageServerLoad } from './$types';

/**
 * Unauthenticated requests never reach this load — hooks.server.ts redirects
 * them to identity first — so `locals.session` is non-null here.
 */
export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;

	return {
		user: session.user,
		roles: session.roles,
		sessionExpiresAt: session.sessionExpiresAt,
		activeSession: session.activeSession
	};
};

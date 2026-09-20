import { resolveIdentityUrl } from '$lib/server/identity';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, platform }) => {
	const session = locals.session;

	return {
		user: session?.user,
		roles: session?.roles ?? [],
		// The header renders outbound /login and /logout links, so the client
		// needs to know where identity lives.
		identityUrl: resolveIdentityUrl(platform)
	};
};

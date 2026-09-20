import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { drizzle } from '$lib/server/db';
import { getSessionContext, resolveIdentityUrl } from '$lib/server/identity';
import { loginUrl } from '$lib/identity-links';

/**
 * Paths reachable without a session. Everything else redirects to identity.
 *
 * `/` and `/stats` stay public deliberately: DEV-111 frames waitlist numbers as
 * transparency for prospective members, who by definition have not signed in.
 */
const PUBLIC_PATHS = ['/', '/stats'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')));
}

// Matches community-website: locals.db is always present so feature code can use
// it without null checks. If the binding is genuinely missing the failure shows
// up on the first query rather than on every request, including public ones.
const dbHandle: Handle = async ({ event, resolve }) => {
	event.locals.db = drizzle(event.platform?.env.DB!);
	return resolve(event);
};

/**
 * Loads the session once per request, then gates.
 *
 * The gate lives here rather than in a +layout.server.ts on purpose: a layout's
 * server load does not re-run on navigation beneath it unless a dependency
 * changes, form actions run before any load, and +server.ts endpoints never run
 * one at all. A layout gate covers the first view and then quietly stops, so a
 * revoked session keeps working until a full reload.
 * See .ai/decisions/0004-gate-in-handle-not-layout.md
 */
const authHandle: Handle = async ({ event, resolve }) => {
	event.locals.session = await getSessionContext(event);

	if (!event.locals.session && !isPublic(event.url.pathname)) {
		const identityUrl = resolveIdentityUrl(event.platform);
		// event.url.href is absolute; identity 400s on a bare path.
		redirect(302, loginUrl(identityUrl, event.url.href));
	}

	return resolve(event);
};

export const handle = sequence(dbHandle, authHandle);

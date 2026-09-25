import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { drizzle } from '$lib/server/db';
import { getSessionContext, resolveIdentityUrl } from '$lib/server/identity';
import { loginUrl } from '$lib/identity-links';
import { recordRosterEmail } from '$lib/server/roster';
import { email } from '$lib/user';

/**
 * Paths reachable without a session. Everything else redirects to identity.
 *
 * `/` is public only so it can render a sign-in call to action — redirecting
 * straight to identity would give anonymous visitors no landing page at all.
 * This app is training-only, so there is nothing else worth showing before
 * sign-in.
 *
 * `/stats` is public so that someone deciding whether to enroll can see the
 * wait first. It shows per-course counts only — never a name or a CID — and a
 * signed-in viewer's own position, which its load scopes to their session.
 *
 * `/api/jira/webhook` is public because Jira has no session. It is **not**
 * unauthenticated: it verifies Jira's HMAC signature before doing anything, and
 * only ever re-reads an issue from Jira. Anything added here must carry its own
 * check the same way.
 */
const PUBLIC_PATHS = ['/', '/stats', '/api/jira/webhook'];

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

/**
 * Keeps `roster_members.email` current from identity.
 *
 * VATUSA's public roster never includes emails, so signing in is the only time
 * we learn one. Off the response path via `waitUntil`, and any failure is only
 * logged: this is bookkeeping, and must never be why a page fails to load.
 */
const emailHandle: Handle = async ({ event, resolve }) => {
	const user = event.locals.session?.user;
	const address = user ? email(user) : undefined;

	if (user && address) {
		const write = recordRosterEmail(event.locals.db, user.cid, address).catch((err) =>
			console.error('[training-tools] recordRosterEmail failed', err)
		);
		event.platform?.ctx?.waitUntil(write);
	}

	return resolve(event);
};

export const handle = sequence(dbHandle, authHandle, emailHandle);

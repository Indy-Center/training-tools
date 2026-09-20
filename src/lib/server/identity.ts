import type { RequestEvent } from '@sveltejs/kit';
import type { SessionContext } from '@indy-center/identity';
import { LOCAL_IDENTITY_URL } from '$lib/identity-links';

/** Identity's session cookie, set on `.flyindycenter.com` so every subdomain can read it. */
export const SESSION_COOKIE = 'fic_session';

/**
 * Read the session cookie, validate it via the IDENTITY service binding, and
 * return the joined SessionContext. Returns null when:
 *   - no session cookie is present
 *   - the IDENTITY binding is not configured (local dev, misconfig)
 *   - the binding throws (network error, identity deploy in progress)
 *   - the binding returns null (unknown/expired/invalidated token)
 *
 * This app never sets, refreshes, or deletes the session cookie. Identity owns
 * the cookie lifecycle through its own /login and /logout endpoints.
 */
export async function getSessionContext(event: RequestEvent): Promise<SessionContext | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;

	const identity = event.platform?.env.IDENTITY;
	if (!identity) {
		console.warn('[training-tools] IDENTITY binding unavailable; treating request as logged out');
		return null;
	}

	try {
		return await identity.getSessionContext(token);
	} catch (err) {
		console.error('[training-tools] identity.getSessionContext threw', err);
		return null;
	}
}

/**
 * Base URL of the identity Worker, for the outbound /login and /logout links.
 * Comes from the `PUBLIC_IDENTITY_URL` var (wrangler.jsonc in production,
 * .dev.vars locally).
 */
export function resolveIdentityUrl(platform: App.Platform | undefined): string {
	const fromEnv = (platform?.env as Record<string, unknown> | undefined)?.PUBLIC_IDENTITY_URL;
	if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
	return LOCAL_IDENTITY_URL;
}

/**
 * Outbound links to the identity Worker.
 *
 * Client-safe on purpose: the header renders these, and anything under
 * $lib/server is server-only. Reading a session lives in
 * $lib/server/identity.ts instead.
 *
 * Both endpoints REQUIRE an absolute `return_url` on flyindycenter.com (or
 * loopback when identity runs with COOKIE_DOMAIN=localhost). A bare path gets
 * a 400. Pass `page.url.href` / `event.url.href`, never anything derived from
 * `window.location`, which is undefined during SSR.
 */

/** Fallback when PUBLIC_IDENTITY_URL is unset — a locally-running identity. */
export const LOCAL_IDENTITY_URL = 'http://localhost:8787';

export function loginUrl(identityUrl: string, returnUrl: string): string {
	return `${identityUrl}/login?return_url=${encodeURIComponent(returnUrl)}`;
}

export function logoutUrl(identityUrl: string, returnUrl: string): string {
	return `${identityUrl}/logout?return_url=${encodeURIComponent(returnUrl)}`;
}

import { error, redirect } from '@sveltejs/kit';

type Session = NonNullable<App.Locals['session']>;

/**
 * Who may be here, for loads and actions.
 *
 * `hooks.server.ts` only proves a session exists, and only on gated routes.
 * Anything finer is checked by the route itself — in the load **and** in every
 * action, because a form action runs before any load. These are that check, so
 * no route has to spell it out. See .ai/decisions/0004-gate-in-handle-not-layout.md
 */

/**
 * The session, or a 401.
 *
 * On a gated route the hook has already redirected anyone signed out, so this
 * is the typed way to say so. On `/`, which is public, it is the real check.
 */
export function requireSession(locals: App.Locals): Session {
	if (!locals.session) error(401, 'Sign in to continue.');
	return locals.session;
}

/**
 * The session of someone `allowed` lets in; anyone else is sent home.
 *
 * `allowed` is one of the checks in `$lib/utils/permissions` — for example
 * `requireRole(locals, canManageTeachers)`.
 */
export function requireRole(
	locals: App.Locals,
	allowed: (roles?: string[] | null) => boolean
): Session {
	if (!allowed(locals.session?.roles)) redirect(303, '/');
	return locals.session!;
}

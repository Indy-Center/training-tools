import { describe, expect, it } from 'vitest';

/**
 * The guard every route with form actions carries.
 *
 * SvelteKit throws "When using named actions, the default action cannot be
 * used" when `default` sits alongside any named action — which breaks every
 * POST to the route while the page still renders perfectly. That is how the
 * enrollment form shipped broken in DEV-108: `withdraw` was added beside a
 * `default` action, and nothing caught it, because the feature had been
 * verified through the cron and direct Jira calls rather than a form
 * submission. Several of these pages cannot be clicked through until somebody
 * holds the role they need, so the failure would sit unnoticed for longer still.
 *
 * Listing the names also catches an action renamed without its form.
 *
 * See node_modules/@sveltejs/kit/src/runtime/server/page/actions.js
 * (check_named_default_separate).
 */
export function describeNamedActions(
	route: string,
	actions: Record<string, unknown>,
	expected: readonly string[]
) {
	describe(`${route} actions`, () => {
		it('does not mix a default action with named ones', () => {
			expect(Object.keys(actions)).not.toContain('default');
		});

		it('exposes the actions the page posts to', () => {
			expect(Object.keys(actions).sort()).toEqual([...expected].sort());
		});
	});
}

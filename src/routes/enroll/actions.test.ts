import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

/**
 * Guards the constraint that broke form submission on first release.
 *
 * SvelteKit throws "When using named actions, the default action cannot be
 * used" when `default` sits alongside any named action — so adding `withdraw`
 * next to a `default` action made every POST to /enroll fail, while the page
 * still rendered perfectly. Nothing in the suite caught it, because the whole
 * feature was verified through the cron and direct Jira calls rather than
 * through a form submission.
 *
 * See node_modules/@sveltejs/kit/src/runtime/server/page/actions.js
 * (check_named_default_separate).
 */
describe('/enroll actions', () => {
	it('does not mix a default action with named ones', () => {
		const names = Object.keys(actions);

		expect(names.length).toBeGreaterThan(1);
		expect(names).not.toContain('default');
	});

	it('exposes the actions the page posts to', () => {
		expect(Object.keys(actions).sort()).toEqual(['enroll', 'withdraw']);
	});
});

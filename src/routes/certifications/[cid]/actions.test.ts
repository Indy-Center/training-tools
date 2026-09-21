import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

/**
 * The same guard `/enroll` carries, for the same reason.
 *
 * SvelteKit throws "When using named actions, the default action cannot be
 * used" when `default` sits alongside any named action, which breaks every POST
 * to the route while the page still renders perfectly. That is precisely how
 * `/enroll` shipped broken, and this page cannot be clicked through until
 * somebody holds `training:certifications:edit` — so the failure would sit
 * undiscovered for longer here than it did there.
 *
 * See node_modules/@sveltejs/kit/src/runtime/server/page/actions.js
 * (check_named_default_separate).
 */
describe('/certifications/[cid] actions', () => {
	it('does not mix a default action with named ones', () => {
		const names = Object.keys(actions);

		expect(names.length).toBeGreaterThan(1);
		expect(names).not.toContain('default');
	});

	it('exposes the actions the page posts to', () => {
		expect(Object.keys(actions).sort()).toEqual(['setCertification', 'toggleEndorsement']);
	});
});

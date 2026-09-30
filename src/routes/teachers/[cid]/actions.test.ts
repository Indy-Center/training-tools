import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

/**
 * The guard `/enroll` and `/certifications/[cid]` carry. A `default` action
 * beside named ones makes SvelteKit reject every POST while the page renders
 * fine — how `/enroll` shipped broken in DEV-108. This page cannot be clicked
 * through until someone holds `training:teachers:manage`, so the failure
 * would otherwise sit unnoticed.
 */
describe('/teachers/[cid] actions', () => {
	it('does not mix a default action with named ones', () => {
		expect(Object.keys(actions)).not.toContain('default');
	});

	it('exposes the actions the page posts to', () => {
		expect(Object.keys(actions).sort()).toEqual([
			'setQualifications',
			'updateAdmin',
			'updateProfile'
		]);
	});
});

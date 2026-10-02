import { describe, expect, it } from 'vitest';
import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/', actions, ['enroll', 'withdraw']);

describe('/ actions, signed out', () => {
	// `/` is on the public allowlist, so the hook does not stop a signed-out
	// POST the way it does for every other route.
	it('refuses both', async () => {
		for (const action of [actions.enroll, actions.withdraw]) {
			const event = { locals: { session: null } } as unknown as Parameters<typeof action>[0];
			await expect(async () => action(event)).rejects.toMatchObject({ status: 401 });
		}
	});
});

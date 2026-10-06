import { describe, expect, it } from 'vitest';
import { describeNamedActions } from '$lib/testing/named-actions';
import { Role } from '$lib/utils/permissions';
import { actions, load } from './+page.server';

describeNamedActions('/admin/audit', actions, ['complete']);

describe('/admin/audit access', () => {
	const home = { status: 303, location: '/' };

	// Being able to edit certifications is not being the one who signs them off.
	const notAdmin = {
		session: { user: { cid: '1234567' }, roles: [Role.CERTIFICATIONS, Role.TEACHERS] }
	};

	it('sends anyone but a training admin home, before reading anything', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof load>[0];
		await expect(async () => load(event)).rejects.toMatchObject(home);
	});

	it('checks again in the action', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof actions.complete>[0];
		await expect(async () => actions.complete(event)).rejects.toMatchObject(home);
	});
});

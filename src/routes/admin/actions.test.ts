import { describe, expect, it } from 'vitest';
import { describeNamedActions } from '$lib/testing/named-actions';
import { Role } from '$lib/utils/permissions';
import { actions, load } from './+page.server';

describeNamedActions('/admin', actions, ['retry']);

describe('/admin access', () => {
	const home = { status: 303, location: '/' };

	// Every other training role, held together, is still not admin.
	const notAdmin = {
		session: {
			user: { cid: '1234567' },
			roles: [Role.TEACHERS, Role.CERTIFICATIONS, Role.INSTRUCTOR]
		}
	};

	it('sends anyone but a training admin home, before reading anything', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof load>[0];
		await expect(async () => load(event)).rejects.toMatchObject(home);
	});

	// A form action runs before any load, so the load's check does not cover it.
	it('checks again in the action', async () => {
		const event = { locals: notAdmin } as unknown as Parameters<typeof actions.retry>[0];
		await expect(async () => actions.retry(event)).rejects.toMatchObject(home);
	});
});

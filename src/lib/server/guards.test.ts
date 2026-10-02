import { describe, expect, it } from 'vitest';
import { requireRole, requireSession } from './guards';
import { canManageTeachers, Role } from '$lib/utils/permissions';

function locals(roles: string[] | null): App.Locals {
	return {
		session: roles ? { user: { cid: '1234567' }, roles } : null
	} as unknown as App.Locals;
}

describe('requireSession', () => {
	it('returns the session when there is one', () => {
		expect(requireSession(locals([])).user.cid).toBe('1234567');
	});

	it('is a 401 without one', () => {
		expect(() => requireSession(locals(null))).toThrow(expect.objectContaining({ status: 401 }));
	});
});

describe('requireRole', () => {
	it('returns the session of someone the check allows', () => {
		expect(requireRole(locals([Role.TEACHERS]), canManageTeachers).user.cid).toBe('1234567');
		// Admin implies every other training role.
		expect(requireRole(locals([Role.ADMIN]), canManageTeachers).user.cid).toBe('1234567');
	});

	it('sends anyone else home', () => {
		const home = expect.objectContaining({ status: 303, location: '/' });

		expect(() => requireRole(locals([]), canManageTeachers)).toThrow(home);
		expect(() => requireRole(locals([Role.CERTIFICATIONS]), canManageTeachers)).toThrow(home);
		expect(() => requireRole(locals(null), canManageTeachers)).toThrow(home);
	});
});

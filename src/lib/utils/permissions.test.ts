import { describe, expect, it } from 'vitest';
import { canManage, isInstructor, isTrainingAdmin, Role } from './permissions';

describe('permissions', () => {
	it('treats a missing role list as no access', () => {
		expect(isTrainingAdmin(undefined)).toBe(false);
		expect(isTrainingAdmin(null)).toBe(false);
		expect(isInstructor(undefined)).toBe(false);
		expect(canManage(undefined, Role.INSTRUCTOR)).toBe(false);
	});

	it('grants a role that is explicitly held', () => {
		expect(isInstructor([Role.INSTRUCTOR])).toBe(true);
		expect(isTrainingAdmin([Role.ADMIN])).toBe(true);
	});

	it('lets admin imply every other training role', () => {
		expect(isInstructor([Role.ADMIN])).toBe(true);
		expect(canManage([Role.ADMIN], Role.INSTRUCTOR)).toBe(true);
	});

	it('does not let a lesser role imply admin', () => {
		expect(isTrainingAdmin([Role.INSTRUCTOR])).toBe(false);
	});

	it('ignores unrelated roles from other apps', () => {
		expect(isTrainingAdmin(['admin'])).toBe(false);
		expect(isInstructor(['events:manage'])).toBe(false);
	});
});

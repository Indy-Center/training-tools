import { describe, expect, it } from 'vitest';
import {
	canEditCertifications,
	canManage,
	isInstructor,
	isTrainingAdmin,
	Role
} from './permissions';

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

describe('certification editing', () => {
	it('grants the role when it is explicitly held', () => {
		expect(canEditCertifications([Role.CERTIFICATIONS])).toBe(true);
	});

	it('lets a training admin edit certifications', () => {
		expect(canEditCertifications([Role.ADMIN])).toBe(true);
	});

	// Running lessons and changing someone's certification are different
	// authorities. DEV-115 also wants the ATM and DATM to hold this, and they are
	// not necessarily instructors, so the two must not imply one another.
	it('does not let an instructor edit certifications by implication', () => {
		expect(canEditCertifications([Role.INSTRUCTOR])).toBe(false);
	});

	it('does not let a certification editor become an instructor', () => {
		expect(isInstructor([Role.CERTIFICATIONS])).toBe(false);
		expect(isTrainingAdmin([Role.CERTIFICATIONS])).toBe(false);
	});

	// Nothing writes this role yet, so every real session reads false today.
	it('denies a signed-in user holding no training roles', () => {
		expect(canEditCertifications([])).toBe(false);
		expect(canEditCertifications(undefined)).toBe(false);
	});
});

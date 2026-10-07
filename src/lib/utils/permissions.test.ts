import { describe, expect, it } from 'vitest';
import {
	canEditCertifications,
	canManage,
	canManageTeachers,
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

describe('teacher management', () => {
	it('grants the role when it is explicitly held', () => {
		expect(canManageTeachers([Role.TEACHERS])).toBe(true);
	});

	it('is implied by training admin', () => {
		expect(canManageTeachers([Role.ADMIN])).toBe(true);
	});

	it('is not implied by instructing or editing certifications', () => {
		expect(canManageTeachers([Role.INSTRUCTOR, Role.CERTIFICATIONS])).toBe(false);
	});

	it('does not accept the un-namespaced string another app might use', () => {
		expect(canManageTeachers(['teachers:manage'])).toBe(false);
	});
});

describe('canManageStudents', () => {
	it('is for training:students:manage, and for training admins', async () => {
		const { canManageStudents } = await import('./permissions');
		expect(canManageStudents(['training:students:manage'])).toBe(true);
		expect(canManageStudents(['training:admin'])).toBe(true);
		expect(canManageStudents(['training:teachers:manage'])).toBe(false);
		expect(canManageStudents([])).toBe(false);
		expect(canManageStudents(null)).toBe(false);
	});
});

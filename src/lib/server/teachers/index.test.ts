import { describe, expect, it } from 'vitest';
import type { Teacher } from '$lib/db/schema/teachers';
import type { Enrollment } from '$lib/db/schema/enrollments';
import { assignmentsFor, diffProfile } from './index';

const teacher: Teacher = {
	cid: '100',
	roles: ['MTR'],
	status: 'active',
	initials: 'JR',
	discordRoleId: null,
	discordChannelId: null,
	availability: 'Weeknights',
	studentMessage: null,
	studentSlots: 2,
	joinedAt: new Date('2026-01-01T00:00:00Z'),
	removedAt: null,
	updatedAt: new Date('2026-01-01T00:00:00Z'),
	updatedBy: null
};

function enrollment(cid: string, teacherValue: string | null, status: string): Enrollment {
	return { cid, teacher: teacherValue, status, course: 'S-GC' } as Enrollment;
}

describe('diffProfile', () => {
	it('reports only fields that actually change', () => {
		expect(
			diffProfile(teacher, { availability: 'Weeknights', studentSlots: 3, status: 'active' })
		).toEqual([{ field: 'slots', from: 2, to: 3 }]);
	});

	it('treats an absent field as untouched, and null as clearing it', () => {
		expect(diffProfile(teacher, {})).toEqual([]);
		expect(diffProfile(teacher, { availability: null })).toEqual([
			{ field: 'availability', from: 'Weeknights', to: null }
		]);
	});

	it('covers the message to students', () => {
		expect(diffProfile(teacher, { studentMessage: 'Book at https://example.com' })).toEqual([
			{ field: 'message', from: null, to: 'Book at https://example.com' }
		]);
	});

	it('covers status and initials', () => {
		expect(diffProfile(teacher, { status: 'loa', initials: 'JB' })).toEqual([
			{ field: 'status', from: 'active', to: 'loa' },
			{ field: 'initials', from: 'JR', to: 'JB' }
		]);
	});
});

describe('assignmentsFor', () => {
	it('lists students assigned by initials or CID, and counts slots from in-training only', () => {
		const result = assignmentsFor(teacher, [
			enrollment('1', 'JR', 'in-training'),
			enrollment('2', '100', 'in-training'),
			enrollment('3', 'JR', 'rating-exam'),
			enrollment('4', 'SW', 'in-training')
		]);
		expect(result.students.map((row) => row.cid)).toEqual(['1', '2', '3']);
		expect(result.inTraining).toBe(2);
		expect(result.selfAssigned).toBeNull();
	});

	// Teachers can be students. Being a student somewhere else changes
	// nothing; being assigned to yourself is a board mistake, shown not counted.
	it('never counts a teacher as their own student', () => {
		const own = enrollment('100', 'JR', 'in-training');
		const result = assignmentsFor(teacher, [own, enrollment('1', 'JR', 'in-training')]);
		expect(result.students.map((row) => row.cid)).toEqual(['1']);
		expect(result.inTraining).toBe(1);
		expect(result.selfAssigned).toBe(own);
	});

	it("ignores a teacher's own enrollment with someone else", () => {
		const result = assignmentsFor(teacher, [enrollment('100', 'SW', 'in-training')]);
		expect(result.students).toEqual([]);
		expect(result.selfAssigned).toBeNull();
	});
});

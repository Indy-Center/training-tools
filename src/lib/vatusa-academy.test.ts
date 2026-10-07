import { describe, expect, it } from 'vitest';
import { COURSES } from './courses';
import { hasEvaluation } from './teachers';
import { academyExamFor, firstPass, pickAcademyAssigner, teacherGate } from './vatusa-academy';

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('academyExamFor', () => {
	it('gives the S2, S3 and C1 courses their written exam', () => {
		expect(academyExamFor('A-LC')).toBe('S2');
		expect(academyExamFor('T-RC')).toBe('S3');
		expect(academyExamFor('E-RC')).toBe('C1');
	});

	// The basic exam is passed before anyone joins a facility, so S-GC has
	// nothing for us to assign even though it ends in a rating exam.
	it('has none for S-GC, or for a course with no rating exam', () => {
		for (const course of ['S-GC', 'A-GC', 'S-LC', 'CUSTOM']) {
			expect(academyExamFor(course)).toBeNull();
		}
	});

	it('never asks for one on a course that has no rating exam', () => {
		for (const course of COURSES) {
			if (academyExamFor(course.code)) expect(hasEvaluation(course.code)).toBe(true);
		}
	});
});

describe('firstPass', () => {
	it('is null with no attempts, or none that passed', () => {
		expect(firstPass([])).toBeNull();
		expect(firstPass(null)).toBeNull();
		expect(
			firstPass([{ attempt: 1, grade: 79, time_finished: at('2026-10-01T00:00:00Z') }])
		).toBeNull();
	});

	it('passes at 80 and above', () => {
		expect(firstPass([{ grade: 80, time_finished: at('2026-10-02T15:00:00Z') }])).toEqual(
			new Date('2026-10-02T15:00:00Z')
		);
	});

	// The day they were ready to train, whatever they did afterwards.
	it('takes the first pass, not the latest', () => {
		const pass = firstPass([
			{ attempt: 1, grade: 60, time_finished: at('2026-09-01T00:00:00Z') },
			{ attempt: 3, grade: 95, time_finished: at('2026-09-20T00:00:00Z') },
			{ attempt: 2, grade: 84, time_finished: at('2026-09-10T00:00:00Z') }
		]);
		expect(pass).toEqual(new Date('2026-09-10T00:00:00Z'));
	});

	it('ignores an attempt that is still open, or has no grade', () => {
		expect(firstPass([{ grade: 100, time_finished: 0 }])).toBeNull();
		expect(firstPass([{ grade: null, time_finished: at('2026-09-10T00:00:00Z') }])).toBeNull();
	});
});

describe('teacherGate', () => {
	const request = (course: string, assigned: string | null, completed: string | null) => ({
		course,
		vatusaAssignedOn: assigned,
		vatusaCompletedOn: completed
	});

	it('holds a rating-exam course until the written exam is passed', () => {
		expect(teacherGate(request('T-RC', null, null))).toEqual({
			open: false,
			reason: 'not-assigned'
		});
		expect(teacherGate(request('T-RC', '2026-10-01', null))).toEqual({
			open: false,
			reason: 'not-completed'
		});
		expect(teacherGate(request('T-RC', '2026-10-01', '2026-10-05'))).toEqual({ open: true });
	});

	// Passed somewhere else before we ever assigned it: still passed.
	it('opens on a completion with no assignment', () => {
		expect(teacherGate(request('A-LC', null, '2026-10-05'))).toEqual({ open: true });
	});

	it('never holds a course with no written exam to assign', () => {
		for (const course of ['S-GC', 'A-GC', 'S-LC', 'CUSTOM']) {
			expect(teacherGate(request(course, null, null))).toEqual({ open: true });
		}
	});
});

describe('pickAcademyAssigner', () => {
	const member = (cid: string, ...roles: [string, string][]) => ({
		cid,
		roles: roles.map(([facility, role]) => ({ facility, role }))
	});

	it('prefers the Training Administrator', () => {
		const roster = [member('1', ['ZID', 'ATM']), member('2', ['ZID', 'TA'])];
		expect(pickAcademyAssigner(roster, 'ZID')).toBe('2');
	});

	it('falls back to the ATM when there is no TA', () => {
		expect(pickAcademyAssigner([member('1', ['ZID', 'ATM'], ['ZID', 'INS'])], 'ZID')).toBe('1');
	});

	// Visitors carry their home facility's roles on our roster.
	it('ignores a TA or ATM of another facility', () => {
		const roster = [member('9', ['ZAB', 'TA']), member('1', ['ZID', 'ATM'])];
		expect(pickAcademyAssigner(roster, 'ZID')).toBe('1');
		expect(pickAcademyAssigner([member('9', ['ZAB', 'TA'])], 'ZID')).toBeNull();
	});
});

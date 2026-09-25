import { describe, expect, it } from 'vitest';
import { COURSE_CODES } from '$lib/courses';
import { summariseWaitlist } from './stats';

describe('summariseWaitlist', () => {
	it('lists every course in catalogue order, with zeros where nobody is', () => {
		const summary = summariseWaitlist([]);
		expect(summary.map((c) => c.code)).toEqual(COURSE_CODES);
		for (const course of summary) {
			expect(course.waiting).toBe(0);
			expect(course.inTraining).toBe(0);
		}
	});

	it('counts in training and rating exam together as in training', () => {
		const [sgc] = summariseWaitlist([
			{ course: 'S-GC', status: 'waitlist', count: 2 },
			{ course: 'S-GC', status: 'in-training', count: 8 },
			{ course: 'S-GC', status: 'rating-exam', count: 1 }
		]);
		expect(sgc).toMatchObject({ code: 'S-GC', waiting: 2, inTraining: 9 });
	});

	// Passed, and waiting on paperwork rather than anyone's time.
	it('leaves certification update out of in training', () => {
		const [sgc] = summariseWaitlist([{ course: 'S-GC', status: 'certification-update', count: 4 }]);
		expect(sgc.inTraining).toBe(0);
	});

	it('keeps each course to its own counts', () => {
		const summary = summariseWaitlist([
			{ course: 'T-RC', status: 'waitlist', count: 5 },
			{ course: 'E-RC', status: 'waitlist', count: 3 }
		]);
		const byCode = Object.fromEntries(summary.map((c) => [c.code, c.waiting]));
		expect(byCode).toMatchObject({ 'T-RC': 5, 'E-RC': 3, 'S-GC': 0 });
	});

	it('carries each course’s configured estimate through', () => {
		const [sgc] = summariseWaitlist([]);
		expect(sgc.estimatedWeeks).toEqual({ min: 8, max: 10 });
	});
});

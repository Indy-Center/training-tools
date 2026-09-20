import { describe, expect, it } from 'vitest';
import { COURSES, COURSE_CODES, findCourse, isCourseCode } from './courses';
import { CLOSED_ENROLLMENT_STATUSES, ENROLLMENT_STATUSES } from './db/schema/enrollments';

describe('course catalogue', () => {
	it('covers the six courses on the Jira select', () => {
		expect(COURSE_CODES).toEqual(['S-GC', 'A-GC', 'S-LC', 'A-LC', 'T-RC', 'E-RC']);
	});

	// The label is also what goes in the Jira issue summary, so it has to match
	// the option value character for character.
	it('labels each course as "Name (CODE)", matching Jira', () => {
		for (const course of COURSES) {
			expect(course.label).toBe(`${course.name} (${course.code})`);
		}
	});

	it('gives every course a distinct Jira option id', () => {
		const ids = COURSES.map((course) => course.jiraOptionId);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('looks courses up by code, and reports unknown ones', () => {
		expect(findCourse('T-RC')?.name).toBe('Terminal Radar Control');
		expect(findCourse('S-XX')).toBeUndefined();
		expect(isCourseCode('E-RC')).toBe(true);
		expect(isCourseCode('nonsense')).toBe(false);
	});
});

describe('enrollment statuses', () => {
	// TRK's initial status is Waitlist — the triage step that used to sit in
	// front of it was removed on 2026-09-20 (ADR 0009). Submitting the form does
	// put someone in the queue.
	it('starts at waitlist, matching the TRK entry status', () => {
		expect(ENROLLMENT_STATUSES[0]).toBe('waitlist');
	});

	it('covers every status on the TRK workflow, plus our own withdrawn', () => {
		expect([...ENROLLMENT_STATUSES]).toEqual([
			'waitlist',
			'in-training',
			'rating-exam',
			'certification-update',
			'completed',
			'removed',
			'withdrawn'
		]);
	});

	it('treats completed, removed and withdrawn as closed, and nothing else', () => {
		expect([...CLOSED_ENROLLMENT_STATUSES].sort()).toEqual(['completed', 'removed', 'withdrawn']);

		for (const status of CLOSED_ENROLLMENT_STATUSES) {
			expect(ENROLLMENT_STATUSES).toContain(status);
		}
	});

	// It sits between the rating exam and completion, so the request is still in
	// flight — treating it as closed would let someone enroll in a second course
	// while the first is still finishing.
	it('does not treat certification-update as closed', () => {
		expect([...CLOSED_ENROLLMENT_STATUSES]).not.toContain('certification-update');
	});

	// Guards the getOpenEnrollment query against D1's 100-bound-parameter limit,
	// which is how the roster sync broke.
	it('keeps the closed-status list small enough to bind', () => {
		expect(CLOSED_ENROLLMENT_STATUSES.length).toBeLessThan(100);
	});
});

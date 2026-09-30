import { describe, expect, it } from 'vitest';
import {
	allowedLevels,
	canEvaluate,
	downgradeFor,
	hasEvaluation,
	isAssignedTo,
	isAutomaticEvaluator,
	jiraOptionValue,
	levelProblem,
	normalizeInitials,
	qualificationsExpired,
	slotSummary,
	teacherRolesFrom,
	validateTeacherProfile
} from './teachers';

const S2 = 3;
const S3 = 4;
const C1 = 5;
const I1 = 8;

const instructor = { roles: ['INS'], rating: I1 };
const s3Mentor = { roles: ['MTR'], rating: S3 };
const s2Mentor = { roles: ['MTR'], rating: S2 };

describe('teacherRolesFrom', () => {
	it('takes INS and MTR held at ZID', () => {
		expect(
			teacherRolesFrom([
				{ facility: 'ZID', role: 'MTR' },
				{ facility: 'ZID', role: 'INS' }
			])
		).toEqual(['INS', 'MTR']);
	});

	// Visitors routinely hold INS or MTR at their home facility.
	it('ignores the same roles at other facilities', () => {
		expect(
			teacherRolesFrom([
				{ facility: 'ZAN', role: 'INS' },
				{ facility: 'ZTL', role: 'MTR' }
			])
		).toEqual([]);
	});

	it('ignores other ZID roles', () => {
		expect(
			teacherRolesFrom([
				{ facility: 'ZID', role: 'FE' },
				{ facility: 'ZID', role: 'TA' },
				{ facility: 'ZID', role: 'EC' }
			])
		).toEqual([]);
	});

	it('survives a missing role list', () => {
		expect(teacherRolesFrom(undefined)).toEqual([]);
		expect(teacherRolesFrom(null)).toEqual([]);
	});
});

describe('evaluations', () => {
	it('exist for the four rating-exam courses only', () => {
		expect(['S-GC', 'A-LC', 'T-RC', 'E-RC'].every(hasEvaluation)).toBe(true);
		expect(hasEvaluation('A-GC')).toBe(false);
		expect(hasEvaluation('S-LC')).toBe(false);
		expect(hasEvaluation('T2-CTR')).toBe(false);
	});

	it('are automatic for instructors on every course that has one', () => {
		expect(isAutomaticEvaluator('E-RC', instructor)).toBe(true);
		expect(isAutomaticEvaluator('S-GC', instructor)).toBe(true);
		expect(isAutomaticEvaluator('A-GC', instructor)).toBe(false);
		expect(isAutomaticEvaluator('S-GC', s3Mentor)).toBe(false);
	});

	it('let an S3+ mentor evaluate S-GC, but nothing else', () => {
		expect(canEvaluate('S-GC', s3Mentor)).toBe(true);
		expect(canEvaluate('S-GC', { roles: ['MTR'], rating: C1 })).toBe(true);
		expect(canEvaluate('A-LC', s3Mentor)).toBe(false);
		expect(canEvaluate('E-RC', s3Mentor)).toBe(false);
	});

	it('are never open to an S2 mentor', () => {
		expect(canEvaluate('S-GC', s2Mentor)).toBe(false);
	});

	it('are never offered on a course without one, even to instructors', () => {
		expect(canEvaluate('S-LC', instructor)).toBe(false);
		expect(allowedLevels('T2-CTR', instructor)).toEqual(['training', 'teacher']);
	});
});

describe('levelProblem', () => {
	it('accepts any non-evaluator level on any course', () => {
		expect(levelProblem('A-GC', 'training', s2Mentor)).toBeNull();
		expect(levelProblem('S-LC', 'teacher', s2Mentor)).toBeNull();
		expect(levelProblem('T2-CTR', null, s2Mentor)).toBeNull();
	});

	it('rejects evaluator where the rules do not allow it', () => {
		expect(levelProblem('S-GC', 'evaluator', s2Mentor)).toMatch(/instructors/i);
		expect(levelProblem('E-RC', 'evaluator', s3Mentor)).toMatch(/instructors/i);
		expect(levelProblem('S-LC', 'evaluator', s3Mentor)).toMatch(/no evaluation/);
	});

	it('accepts a manual S-GC evaluator for an S3 mentor', () => {
		expect(levelProblem('S-GC', 'evaluator', s3Mentor)).toBeNull();
	});

	// The sync would put it straight back, so the form must not pretend.
	it('refuses to lower an instructor below evaluator on an evaluated course', () => {
		expect(levelProblem('T-RC', 'teacher', instructor)).toMatch(/automatically/);
		expect(levelProblem('T-RC', null, instructor)).toMatch(/automatically/);
	});

	it('rejects a code that is not in the catalogue', () => {
		expect(levelProblem('APP-SOLO', 'teacher', instructor)).toMatch(/not a course/);
	});
});

describe('downgradeFor', () => {
	it('lowers an evaluator who no longer qualifies to teacher', () => {
		// Lost INS, still a mentor, rated S3: only S-GC survives.
		expect(downgradeFor('E-RC', 'evaluator', s3Mentor)).toBe('teacher');
		expect(downgradeFor('S-GC', 'evaluator', s3Mentor)).toBeNull();
		// A mentor whose rating is below S3 loses S-GC too.
		expect(downgradeFor('S-GC', 'evaluator', s2Mentor)).toBe('teacher');
	});

	it('leaves every other level alone', () => {
		expect(downgradeFor('E-RC', 'teacher', s2Mentor)).toBeNull();
		expect(downgradeFor('E-RC', 'training', s2Mentor)).toBeNull();
		expect(downgradeFor('E-RC', 'evaluator', instructor)).toBeNull();
	});
});

describe('qualificationsExpired', () => {
	const now = new Date('2026-09-30T12:00:00Z');

	it('never expires someone still on the roster', () => {
		expect(qualificationsExpired(null, now)).toBe(false);
	});

	it('keeps them for six months after leaving', () => {
		expect(qualificationsExpired(new Date('2026-04-01T00:00:00Z'), now)).toBe(false);
	});

	it('expires them after more than six months off the roster', () => {
		expect(qualificationsExpired(new Date('2026-03-29T00:00:00Z'), now)).toBe(true);
	});
});

describe('slotSummary', () => {
	it('counts open slots for an active teacher', () => {
		expect(slotSummary({ status: 'active', studentSlots: 3, inTraining: 1 })).toEqual({
			total: 3,
			used: 1,
			available: 2
		});
	});

	// Over-assigned happens on the board; a negative count helps nobody.
	it('never reports negative availability', () => {
		expect(slotSummary({ status: 'active', studentSlots: 1, inTraining: 3 }).available).toBe(0);
	});

	// LOA keeps the number visible — they are showing they are ready to come
	// back — but none of it is open.
	it('keeps the total on LOA but counts nothing as available', () => {
		expect(slotSummary({ status: 'loa', studentSlots: 4, inTraining: 0 })).toEqual({
			total: 4,
			used: 0,
			available: 0
		});
	});

	it('has no availability when no total was set', () => {
		expect(slotSummary({ status: 'active', studentSlots: null, inTraining: 1 })).toEqual({
			total: null,
			used: 1,
			available: null
		});
	});
});

describe('initials and Jira values', () => {
	it('normalises two letters to upper case', () => {
		expect(normalizeInitials(' sc ')).toBe('SC');
	});

	it('rejects anything that is not two letters', () => {
		expect(normalizeInitials('S')).toBeNull();
		expect(normalizeInitials('SCX')).toBeNull();
		expect(normalizeInitials('S1')).toBeNull();
		expect(normalizeInitials('')).toBeNull();
		expect(normalizeInitials(null)).toBeNull();
	});

	it('uses initials in the dropdown, or the CID until there are some', () => {
		expect(jiraOptionValue({ cid: '1530662', initials: 'SC' })).toBe('SC');
		expect(jiraOptionValue({ cid: '1530662', initials: null })).toBe('1530662');
	});
});

describe('isAssignedTo', () => {
	const teacher = { cid: '1530662', initials: 'SC' };

	it('matches on initials, case-insensitively', () => {
		expect(isAssignedTo('SC', teacher)).toBe(true);
		expect(isAssignedTo('sc', teacher)).toBe(true);
	});

	// Students assigned before initials existed were assigned by CID.
	it('also matches the CID', () => {
		expect(isAssignedTo('1530662', teacher)).toBe(true);
	});

	it('does not match someone else or nobody', () => {
		expect(isAssignedTo('SW', teacher)).toBe(false);
		expect(isAssignedTo(null, teacher)).toBe(false);
		expect(isAssignedTo('1530662', { cid: '1', initials: null })).toBe(false);
	});
});

describe('validateTeacherProfile', () => {
	it('accepts availability and a whole number of slots', () => {
		expect(validateTeacherProfile({ availability: ' Weeknights ', studentSlots: '3' })).toEqual({
			ok: true,
			values: { availability: 'Weeknights', studentSlots: 3 }
		});
	});

	// Blank is "not set", which is different from zero open slots.
	it('treats blanks as not set', () => {
		expect(validateTeacherProfile({ availability: '', studentSlots: '' })).toEqual({
			ok: true,
			values: { availability: null, studentSlots: null }
		});
	});

	it('accepts zero slots', () => {
		expect(validateTeacherProfile({ studentSlots: '0' })).toMatchObject({
			ok: true,
			values: { studentSlots: 0 }
		});
	});

	it('rejects fractions, negatives and nonsense', () => {
		for (const value of ['1.5', '-1', 'two', '21']) {
			expect(validateTeacherProfile({ studentSlots: value }).ok).toBe(false);
		}
	});

	it('rejects availability over the limit', () => {
		expect(validateTeacherProfile({ availability: 'x'.repeat(1001) }).ok).toBe(false);
	});
});

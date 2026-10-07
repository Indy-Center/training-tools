import { describe, expect, it } from 'vitest';
import {
	blankReport,
	canReport,
	checkReport,
	ctrsMode,
	isExaminerFor,
	otsChoices,
	POSITION_PATTERN,
	readReport,
	suggestedPosition,
	type ReportValues
} from './ctrs';

const teacher = { cid: '1000001', initials: 'AB' };
const enrollment = {
	cid: '2000002',
	status: 'in-training',
	teacher: 'AB',
	reInstructor: null as string | null
};

const good: ReportValues = {
	date: '2026-10-06',
	time: '23:30',
	duration: '1:15',
	position: 'IND_GND',
	location: '1',
	otsStatus: '0',
	score: '',
	movements: '',
	soloGranted: false,
	notes: 'Worked ground through a busy push.'
};

describe('canReport', () => {
	it('lets the assigned teacher report', () => {
		expect(canReport(enrollment, teacher)).toBe(true);
	});

	it('lets the examiner on the card report', () => {
		expect(
			canReport(
				{ ...enrollment, status: 'rating-exam', teacher: 'ZZ', reInstructor: 'AB' },
				teacher
			)
		).toBe(true);
	});

	it('refuses another teacher, a closed card, and their own enrollment', () => {
		expect(canReport({ ...enrollment, teacher: 'ZZ' }, teacher)).toBe(false);
		expect(canReport({ ...enrollment, status: 'waitlist' }, teacher)).toBe(false);
		expect(canReport({ ...enrollment, status: 'certification-update' }, teacher)).toBe(false);
		expect(canReport({ ...enrollment, cid: teacher.cid }, teacher)).toBe(false);
	});
});

describe('isExaminerFor', () => {
	it('is only the examiner on the card, at the exam stage', () => {
		const exam = { ...enrollment, status: 'rating-exam', reInstructor: '1000001' };
		expect(isExaminerFor(exam, teacher)).toBe(true);
		expect(isExaminerFor({ ...exam, status: 'needs-catp' }, teacher)).toBe(false);
		expect(isExaminerFor({ ...exam, reInstructor: 'ZZ' }, teacher)).toBe(false);
	});
});

describe('otsChoices', () => {
	it('offers an exam result only to the examiner', () => {
		expect(otsChoices(false).map((choice) => choice.value)).toEqual([0, 3]);
		expect(otsChoices(true).map((choice) => choice.value)).toEqual([0, 3, 1, 2]);
	});
});

describe('suggestedPosition and blankReport', () => {
	it('suggests a position VATUSA would accept, or nothing', () => {
		for (const course of ['S-GC', 'A-GC', 'S-LC', 'A-LC', 'T-RC', 'E-RC']) {
			expect(suggestedPosition(course)).toMatch(POSITION_PATTERN);
		}
		expect(suggestedPosition('CUSTOM')).toBe('');
	});

	it('starts on now, in Zulu', () => {
		const blank = blankReport('T-RC', new Date('2026-10-06T23:41:09Z'));
		expect(blank).toMatchObject({ date: '2026-10-06', time: '23:41', position: 'IND_APP' });
	});
});

describe('readReport', () => {
	it('trims, upper-cases the position and reads the checkbox', () => {
		const form = new Map<string, string>([
			['position', ' ind_twr '],
			['notes', '  fine  '],
			['soloGranted', 'on']
		]);
		const values = readReport({ get: (name) => form.get(name) ?? null });
		expect(values).toMatchObject({
			position: 'IND_TWR',
			notes: 'fine',
			soloGranted: true,
			date: ''
		});
	});
});

describe('checkReport', () => {
	it('turns a good form into what VATUSA is sent', () => {
		expect(checkReport(good, false)).toEqual({
			ok: true,
			record: {
				sessionDate: '2026-10-06 23:30',
				position: 'IND_GND',
				duration: '01:15',
				location: 1,
				otsStatus: 0,
				score: null,
				movements: null,
				soloGranted: false,
				notes: good.notes
			}
		});
	});

	it('keeps a score, movements and a solo', () => {
		const result = checkReport({ ...good, score: '4', movements: '32', soloGranted: true }, false);
		expect(result).toMatchObject({
			ok: true,
			record: { score: 4, movements: 32, soloGranted: true }
		});
	});

	it('names everything wrong at once', () => {
		const result = checkReport(
			{
				...good,
				date: '2026-02-30',
				duration: '00:00',
				position: 'INDY GROUND',
				location: '7',
				score: '6',
				movements: '-1',
				notes: ''
			},
			false
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toHaveLength(7);
	});

	it('refuses a duration of a day or more, which VATUSA cannot read', () => {
		expect(checkReport({ ...good, duration: '24:00' }, false).ok).toBe(false);
		expect(checkReport({ ...good, duration: '1:75' }, false).ok).toBe(false);
	});

	it('takes an exam result only from the examiner', () => {
		expect(checkReport({ ...good, otsStatus: '1' }, false).ok).toBe(false);
		expect(checkReport({ ...good, otsStatus: '1' }, true)).toMatchObject({
			ok: true,
			record: { otsStatus: 1 }
		});
	});
});

describe('ctrsMode', () => {
	it('is live only when it says so', () => {
		expect(ctrsMode('live')).toBe('live');
		expect(ctrsMode(' LIVE ')).toBe('live');
		expect(ctrsMode('test')).toBe('test');
		expect(ctrsMode('yes')).toBe('test');
		expect(ctrsMode(undefined)).toBe('test');
	});
});

import { describe, expect, it } from 'vitest';
import {
	blankReport,
	canReport,
	checkReport,
	finishChoices,
	ctrsMode,
	isExaminerFor,
	otsChoices,
	readReport,
	type ReportValues
} from './ctrs';

const teacher = { cid: '1000001', initials: 'AB' };
const enrollment = {
	cid: '2000002',
	course: 'T-RC',
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
	finish: '',
	score: '',
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
		const exam = { ...enrollment, status: 'rating-exam', teacher: 'ZZ', reInstructor: '1000001' };
		expect(isExaminerFor(exam, teacher)).toBe(true);
		expect(isExaminerFor({ ...exam, status: 'needs-catp' }, teacher)).toBe(false);
		expect(isExaminerFor({ ...exam, reInstructor: 'ZZ' }, teacher)).toBe(false);
	});

	// The result moves the card, and nobody examines their own student.
	it('is never the student’s own teacher', () => {
		const exam = { ...enrollment, status: 'rating-exam', teacher: 'AB', reInstructor: 'AB' };
		expect(isExaminerFor(exam, teacher)).toBe(false);
	});
});

describe('otsChoices', () => {
	it('offers an exam result only to the examiner', () => {
		expect(otsChoices(false).map((choice) => choice.value)).toEqual([0]);
		expect(otsChoices(true).map((choice) => choice.value)).toEqual([0, 1, 2]);
	});
});

describe('finishChoices', () => {
	it('is where the course goes next, for the teacher whose training it is', () => {
		expect(finishChoices(enrollment, teacher)).toEqual(['rating-exam']);
		expect(finishChoices({ ...enrollment, course: 'A-GC' }, teacher)).toEqual([
			'certification-update'
		]);
		expect(finishChoices({ ...enrollment, course: 'CUSTOM' }, teacher)).toEqual([
			'rating-exam',
			'certification-update'
		]);
	});

	it('is nothing once training is over, or for someone else', () => {
		expect(finishChoices({ ...enrollment, status: 'rating-exam' }, teacher)).toEqual([]);
		expect(finishChoices({ ...enrollment, teacher: 'ZZ' }, teacher)).toEqual([]);
	});
});

describe('blankReport', () => {
	it('starts on now, in Zulu, with position and duration left to fill in', () => {
		const blank = blankReport(new Date('2026-10-06T23:41:09Z'));
		expect(blank).toMatchObject({
			date: '2026-10-06',
			time: '23:41',
			position: '',
			duration: ''
		});
	});
});

describe('readReport', () => {
	it('trims, and upper-cases the position', () => {
		const form = new Map<string, string>([
			['position', ' ind_twr '],
			['notes', '  fine  ']
		]);
		const values = readReport({ get: (name) => form.get(name) ?? null });
		expect(values).toMatchObject({
			position: 'IND_TWR',
			notes: 'fine',
			date: ''
		});
	});
});

describe('checkReport', () => {
	it('turns a good form into what VATUSA is sent', () => {
		expect(checkReport(good, { examiner: false, finish: [] })).toEqual({
			ok: true,
			record: {
				sessionDate: '2026-10-06 23:30',
				position: 'IND_GND',
				duration: '01:15',
				location: 1,
				otsStatus: 0,
				score: null,
				notes: good.notes
			},
			finish: null,
			examResult: null
		});
	});

	it('keeps progress', () => {
		const result = checkReport({ ...good, score: '4' }, { examiner: false, finish: [] });
		expect(result).toMatchObject({ ok: true, record: { score: 4 } });
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
				notes: ''
			},
			{ examiner: false, finish: [] }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toHaveLength(6);
	});

	it('refuses a duration of a day or more, which VATUSA cannot read', () => {
		expect(checkReport({ ...good, duration: '24:00' }, { examiner: false, finish: [] }).ok).toBe(
			false
		);
		expect(checkReport({ ...good, duration: '1:75' }, { examiner: false, finish: [] }).ok).toBe(
			false
		);
	});

	it('takes an exam result only from the examiner', () => {
		expect(checkReport({ ...good, otsStatus: '1' }, { examiner: false, finish: [] }).ok).toBe(
			false
		);
		expect(checkReport({ ...good, otsStatus: '1' }, { examiner: true, finish: [] })).toMatchObject({
			ok: true,
			record: { otsStatus: 1 }
		});
	});

	it('says which way an exam result moves the card', () => {
		const result = (otsStatus: string) =>
			checkReport({ ...good, otsStatus }, { examiner: true, finish: [] });

		expect(result('1')).toMatchObject({ examResult: 'passed' });
		expect(result('2')).toMatchObject({ examResult: 'not-passed' });
		expect(result('0')).toMatchObject({ examResult: null });
	});

	// A recommendation is the teacher's report, not a result.
	it('has no exam result on a report that recommends for the exam', () => {
		expect(
			checkReport({ ...good, finish: 'rating-exam' }, { examiner: false, finish: ['rating-exam'] })
		).toMatchObject({ examResult: null });
	});
});

describe('checkReport, ending the training', () => {
	it('flags a recommendation on VATUSA when the course goes to a rating exam', () => {
		const result = checkReport(
			{ ...good, finish: 'rating-exam' },
			{ examiner: false, finish: ['rating-exam'] }
		);
		expect(result).toMatchObject({ ok: true, finish: 'rating-exam', record: { otsStatus: 3 } });
	});

	it('sends no flag for a course with no exam', () => {
		const result = checkReport(
			{ ...good, finish: 'certification-update' },
			{ examiner: false, finish: ['certification-update'] }
		);
		expect(result).toMatchObject({
			ok: true,
			finish: 'certification-update',
			record: { otsStatus: 0 }
		});
	});

	it('refuses an ending the course does not have, and a recommendation sent by hand', () => {
		expect(
			checkReport(
				{ ...good, finish: 'certification-update' },
				{ examiner: false, finish: ['rating-exam'] }
			).ok
		).toBe(false);
		expect(
			checkReport({ ...good, finish: 'rating-exam' }, { examiner: false, finish: [] }).ok
		).toBe(false);
		expect(checkReport({ ...good, otsStatus: '3' }, { examiner: true, finish: [] }).ok).toBe(false);
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

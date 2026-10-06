import { describe, expect, it } from 'vitest';
import {
	afterTraining,
	afterTrainingOptions,
	evaluatesCourse,
	canCompleteExam,
	canCompleteTraining,
	canClaimExam,
	credentialChangeFor
} from './course-completion';
import { COURSES, isEnrollableCourseCode } from './courses';
import type { QualificationLevel } from './teachers';

describe('afterTraining', () => {
	// The four courses that end in a VATSIM rating exam.
	it('sends the rating-exam courses to the exam', () => {
		for (const course of ['S-GC', 'A-LC', 'T-RC', 'E-RC']) {
			expect(afterTraining(course)).toBe('rating-exam');
		}
	});

	it('sends the rest straight to the certification update', () => {
		expect(afterTraining('A-GC')).toBe('certification-update');
		expect(afterTraining('S-LC')).toBe('certification-update');
	});

	it('has an answer for every course on the form', () => {
		for (const course of COURSES) {
			expect(['rating-exam', 'certification-update']).toContain(afterTraining(course.code));
		}
	});
});

describe('credentialChangeFor', () => {
	it('gives a first certification to someone holding nothing', () => {
		expect(credentialChangeFor('S-GC', [])).toEqual({ action: 'set-certification', code: 'S-GC' });
	});

	it('moves a controller up the ladder', () => {
		expect(credentialChangeFor('A-GC', ['S-GC'])).toEqual({
			action: 'set-certification',
			code: 'A-GC'
		});
		expect(credentialChangeFor('E-RC', ['T-RC', 'S-LC'])).toEqual({
			action: 'set-certification',
			code: 'E-RC'
		});
	});

	it('grants an endorsement alongside the certification', () => {
		expect(credentialChangeFor('S-LC', ['A-GC'])).toEqual({
			action: 'grant-endorsement',
			code: 'S-LC'
		});
	});

	it('changes nothing when it is already held', () => {
		expect(credentialChangeFor('T-RC', ['T-RC'])).toEqual({
			action: 'none',
			reason: 'already-held'
		});
		expect(credentialChangeFor('S-LC', ['A-GC', 'S-LC'])).toEqual({
			action: 'none',
			reason: 'already-held'
		});
	});

	// A card for a lower course must never take a higher certification away.
	it('never moves a controller down', () => {
		expect(credentialChangeFor('S-GC', ['A-LC'])).toEqual({
			action: 'none',
			reason: 'holds-higher'
		});
		expect(credentialChangeFor('T-RC', ['E-RC', 'T2-CTR'])).toEqual({
			action: 'none',
			reason: 'holds-higher'
		});
	});

	it('changes nothing for a course it does not know', () => {
		expect(credentialChangeFor('X-99', ['S-GC'])).toEqual({
			action: 'none',
			reason: 'no-credential'
		});
	});

	it('names a credential for every course on the form', () => {
		for (const course of COURSES.filter((c) => isEnrollableCourseCode(c.code))) {
			expect(credentialChangeFor(course.code, [])).not.toEqual({
				action: 'none',
				reason: 'no-credential'
			});
		}
	});

	// Custom Training earns nothing: finishing it changes no certification.
	it('changes nothing for Custom Training, which has no exam either', () => {
		expect(credentialChangeFor('CUSTOM', ['S-GC'])).toEqual({
			action: 'none',
			reason: 'no-credential'
		});
		expect(afterTraining('CUSTOM')).toBe('certification-update');
	});
});

const teacher = { cid: '100', initials: 'JR' };
const evaluates = (...codes: string[]) =>
	new Map<string, QualificationLevel>(codes.map((code) => [code, 'evaluator']));

function request(overrides: Partial<Parameters<typeof canCompleteTraining>[0]> = {}) {
	return {
		cid: '200',
		course: 'T-RC',
		status: 'in-training',
		teacher: 'JR',
		reInstructor: null,
		...overrides
	};
}

describe('canCompleteTraining', () => {
	it('is for the teacher on the card, while in training', () => {
		expect(canCompleteTraining(request(), teacher)).toBe(true);
		// The board is edited by hand, and may hold a CID until initials exist.
		expect(canCompleteTraining(request({ teacher: 'jr' }), teacher)).toBe(true);
		expect(canCompleteTraining(request({ teacher: '100' }), teacher)).toBe(true);
	});

	it('is not for another teacher, or once training is over', () => {
		expect(canCompleteTraining(request({ teacher: 'SW' }), teacher)).toBe(false);
		expect(canCompleteTraining(request({ teacher: null }), teacher)).toBe(false);
		expect(canCompleteTraining(request({ status: 'rating-exam' }), teacher)).toBe(false);
		expect(canCompleteTraining(request({ status: 'waitlist' }), teacher)).toBe(false);
	});

	it('is never for their own request', () => {
		expect(canCompleteTraining(request({ cid: '100' }), teacher)).toBe(false);
	});
});

describe('canClaimExam', () => {
	// Taught by SW, so JR is free to examine.
	const waiting = request({ status: 'rating-exam', teacher: 'SW' });

	it('is for anyone else who evaluates the course, when nobody has claimed it', () => {
		expect(canClaimExam(waiting, teacher, evaluates('T-RC'))).toBe(true);
	});

	it('is not for someone who only teaches it, or evaluates another course', () => {
		const teaches = new Map<string, QualificationLevel>([['T-RC', 'teacher']]);
		expect(canClaimExam(waiting, teacher, teaches)).toBe(false);
		expect(canClaimExam(waiting, teacher, evaluates('S-GC'))).toBe(false);
		expect(canClaimExam(waiting, teacher, new Map())).toBe(false);
	});

	// The exam is an independent check of the training.
	it('is never for the student’s own teacher', () => {
		expect(canClaimExam({ ...waiting, teacher: 'JR' }, teacher, evaluates('T-RC'))).toBe(false);
		expect(canClaimExam({ ...waiting, teacher: '100' }, teacher, evaluates('T-RC'))).toBe(false);
	});

	it('is not offered once an examiner is on the card', () => {
		expect(canClaimExam({ ...waiting, reInstructor: 'HI' }, teacher, evaluates('T-RC'))).toBe(
			false
		);
	});

	it('is not offered before the exam stage, or for their own request', () => {
		expect(canClaimExam(request(), teacher, evaluates('T-RC'))).toBe(false);
		expect(canClaimExam({ ...waiting, cid: '100' }, teacher, evaluates('T-RC'))).toBe(false);
	});
});

describe('canCompleteExam', () => {
	// Taught by SW, examined by JR.
	const scheduled = request({ status: 'rating-exam', teacher: 'SW', reInstructor: 'JR' });

	it('is for the examiner on the card', () => {
		expect(canCompleteExam(scheduled, teacher)).toBe(true);
		expect(canCompleteExam({ ...scheduled, reInstructor: 'Jr' }, teacher)).toBe(true);
	});

	it('is not for another evaluator, or before an examiner is set', () => {
		expect(canCompleteExam({ ...scheduled, reInstructor: 'HI' }, teacher)).toBe(false);
		expect(canCompleteExam({ ...scheduled, reInstructor: null }, teacher)).toBe(false);
		// `VATUSA` is a real option on the board: the division examines.
		expect(canCompleteExam({ ...scheduled, reInstructor: 'VATUSA' }, teacher)).toBe(false);
	});

	// Even when staff put the teacher on the card as examiner by hand.
	it('is never for the student’s own teacher', () => {
		expect(canCompleteExam({ ...scheduled, teacher: 'JR' }, teacher)).toBe(false);
	});

	it('is not for their own request, or outside the exam stage', () => {
		expect(canCompleteExam({ ...scheduled, cid: '100' }, teacher)).toBe(false);
		expect(canCompleteExam({ ...scheduled, status: 'in-training' }, teacher)).toBe(false);
	});
});

describe('afterTrainingOptions', () => {
	it('gives the six standard courses exactly one way on', () => {
		for (const course of ['S-GC', 'A-LC', 'T-RC', 'E-RC']) {
			expect(afterTrainingOptions(course)).toEqual(['rating-exam']);
		}
		for (const course of ['A-GC', 'S-LC']) {
			expect(afterTrainingOptions(course)).toEqual(['certification-update']);
		}
	});

	// Only the teacher knows whether what they taught needs examining.
	it('leaves Custom Training to the teacher', () => {
		expect(afterTrainingOptions('CUSTOM')).toEqual(['rating-exam', 'certification-update']);
	});
});

describe('evaluatesCourse', () => {
	const levels = (entries: [string, QualificationLevel][]) => new Map(entries);

	it('needs an evaluator on that course, for a standard course', () => {
		expect(evaluatesCourse('T-RC', levels([['T-RC', 'evaluator']]))).toBe(true);
		expect(evaluatesCourse('T-RC', levels([['S-GC', 'evaluator']]))).toBe(false);
		expect(evaluatesCourse('T-RC', levels([['T-RC', 'teacher']]))).toBe(false);
	});

	// Custom Training has no qualification of its own.
	it('lets anyone who evaluates any course examine Custom Training', () => {
		expect(evaluatesCourse('CUSTOM', levels([['S-GC', 'evaluator']]))).toBe(true);
		expect(evaluatesCourse('CUSTOM', levels([['S-GC', 'teacher']]))).toBe(false);
		expect(evaluatesCourse('CUSTOM', levels([]))).toBe(false);
	});

	it('still keeps a Custom Training exam from the student’s own teacher', () => {
		const custom = {
			cid: '200',
			course: 'CUSTOM',
			status: 'rating-exam',
			teacher: 'JR',
			reInstructor: null
		};
		const evaluator = levels([['S-GC', 'evaluator']]);
		expect(canClaimExam(custom, teacher, evaluator)).toBe(false);
		expect(canClaimExam({ ...custom, teacher: 'SW' }, teacher, evaluator)).toBe(true);
	});
});

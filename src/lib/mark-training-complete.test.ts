import { describe, expect, it } from 'vitest';
import { advancedTo, chosenStep, courseTraining } from './mark-training-complete';

const EITHER = ['rating-exam', 'certification-update'] as const;

describe('chosenStep', () => {
	it('is the only step for a standard course, with nothing chosen', () => {
		expect(chosenStep(['rating-exam'], null)).toBe('rating-exam');
		expect(chosenStep(['certification-update'], null)).toBe('certification-update');
	});

	it('is nothing on Custom Training until a radio is chosen', () => {
		expect(chosenStep(EITHER, null)).toBeNull();
		expect(chosenStep(EITHER, 'rating-exam')).toBe('rating-exam');
		expect(chosenStep(EITHER, 'certification-update')).toBe('certification-update');
	});

	it('ignores a choice the course does not offer', () => {
		expect(chosenStep(EITHER, 'waitlist')).toBeNull();
		expect(chosenStep(['rating-exam'], 'certification-update')).toBe('rating-exam');
	});
});

describe('advancedTo', () => {
	it('names the board column the card moves to', () => {
		expect(advancedTo('rating-exam')).toBe('Rating Exam');
		expect(advancedTo('certification-update')).toBe('Audit');
	});

	it('says "the next step" while Custom Training has no choice', () => {
		expect(advancedTo(null)).toBe('the next step');
	});
});

describe('courseTraining', () => {
	it('names the course', () => {
		expect(courseTraining('S-GC')).toBe('Simple Ground Control training');
	});

	it('does not say "training" twice', () => {
		expect(courseTraining('CUSTOM')).toBe('Custom Training');
	});
});

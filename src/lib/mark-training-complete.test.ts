import { describe, expect, it } from 'vitest';
import {
	advancedTo,
	chosenStep,
	courseTraining,
	trainingCompleteCopy,
	trainingCompleteNote
} from './mark-training-complete';

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

describe('trainingCompleteCopy', () => {
	it('words the dialog for the step chosen so far', () => {
		const copy = trainingCompleteCopy('Jo Rivera', 'S-GC', 'rating-exam');
		expect(copy.title).toBe('Mark training complete?');
		expect(copy.confirmLabel).toBe('Mark complete');
		expect(copy.before).toBe(
			"Jo Rivera's Simple Ground Control training will be marked complete, and the enrollment advanced to Rating Exam."
		);
		expect(copy.bold).toBe('No training report is filed.');
		expect(copy.after).toBe("If you haven't filed one yet do that first.");
		expect(trainingCompleteCopy('Jo Rivera', 'CUSTOM', null).before).toBe(
			"Jo Rivera's Custom Training will be marked complete, and the enrollment advanced to the next step."
		);
	});
});

describe('trainingCompleteNote', () => {
	it('says no report was filed through the app', () => {
		expect(trainingCompleteNote('Sam Teacher')).toBe(
			'Training marked complete by Sam Teacher on /teach; no training report filed through the app.'
		);
	});
});

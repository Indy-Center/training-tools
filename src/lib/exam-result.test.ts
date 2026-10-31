import { describe, expect, it } from 'vitest';
import { examResultCopy, examResultNote } from './exam-result';

describe('examResultCopy', () => {
	it('words Passed, for the course by name', () => {
		const copy = examResultCopy('passed', 'Jo Rivera', 'S-GC');
		expect(copy.title).toBe('Mark the rating exam passed?');
		expect(copy.confirmLabel).toBe('Mark passed');
		expect(copy.before).toBe(
			"Jo Rivera's Simple Ground Control rating exam will be marked passed, and the enrollment advanced to Audit."
		);
		expect(copy.bold).toBe('No training report is filed.');
		expect(copy.after).toBe("If you haven't filed one yet do that first.");
		expect(copy.tone).toBe('default');
	});

	it('words Not passed, in the danger style', () => {
		const copy = examResultCopy('not-passed', 'Jo Rivera', 'S-GC');
		expect(copy.title).toBe('Mark the rating exam not passed?');
		expect(copy.confirmLabel).toBe('Mark not passed');
		expect(copy.before).toBe(
			"Jo Rivera's Simple Ground Control rating exam will be marked not passed, and the enrollment advanced to Needs CATP. Training Completed is cleared."
		);
		expect(copy.tone).toBe('danger');
	});
});

describe('examResultNote', () => {
	it('says no report was filed through the app', () => {
		expect(examResultNote('passed', 'Sam Examiner')).toBe(
			'Rating exam marked passed by Sam Examiner on /teach; no training report filed through the app.'
		);
		expect(examResultNote('not-passed', 'Sam Examiner')).toBe(
			'Rating exam marked not passed by Sam Examiner on /teach; no training report filed through the app. Training Completed cleared.'
		);
	});
});

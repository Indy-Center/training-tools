/**
 * The words in `/teach`'s "Passed" and "Not passed" dialogs, and the card
 * comment each leaves (decisions/0038). Pure, for the page, the actions and
 * their tests; who may press the buttons is `canCompleteExam()`.
 */
import { courseName } from './courses';
import type { ExamResult } from './ctrs';
import { NO_REPORT_FILED, NOT_FILED_THROUGH_THE_APP } from './mark-training-complete';

export function examResultCopy(result: ExamResult, student: string, course: string) {
	const name = courseName(course);
	const passed = result === 'passed';
	return {
		title: passed ? 'Mark the rating exam passed?' : 'Mark the rating exam not passed?',
		confirmLabel: passed ? 'Mark passed' : 'Mark not passed',
		tone: passed ? ('default' as const) : ('danger' as const),
		before: passed
			? `${student}'s ${name} rating exam will be marked passed, and the enrollment advanced to Audit.`
			: `${student}'s ${name} rating exam will be marked not passed, and the enrollment advanced to Needs CATP. Training Completed is cleared.`,
		...NO_REPORT_FILED
	};
}

/** The card comment, in place of the usual note: nothing was filed through the app. */
export function examResultNote(result: ExamResult, by: string): string {
	return result === 'passed'
		? `Rating exam marked passed by ${by} on /teach; ${NOT_FILED_THROUGH_THE_APP}.`
		: `Rating exam marked not passed by ${by} on /teach; ${NOT_FILED_THROUGH_THE_APP}. Training Completed cleared.`;
}

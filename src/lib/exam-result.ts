/**
 * The words in `/teach`'s "Passed" and "Not passed" dialogs, and the card
 * comment each leaves (decisions/0038). Pure, for the page, the actions and
 * their tests; who may press the buttons is `canCompleteExam()`.
 */
import { findCourse } from './courses';

export type ExamResult = 'passed' | 'not-passed';

export function examResultCopy(result: ExamResult, student: string, course: string) {
	const name = findCourse(course)?.name ?? course;
	const passed = result === 'passed';
	return {
		title: passed ? 'Mark the rating exam passed?' : 'Mark the rating exam not passed?',
		confirmLabel: passed ? 'Mark passed' : 'Mark not passed',
		tone: passed ? ('default' as const) : ('danger' as const),
		before: passed
			? `${student}'s ${name} rating exam will be marked passed, and the enrollment advanced to Audit.`
			: `${student}'s ${name} rating exam will be marked not passed, and the enrollment advanced to Needs CATP. Training Completed is cleared.`,
		bold: 'No training report is filed.',
		after: "If you haven't filed one yet do that first."
	};
}

/** The card comment, in place of the usual note: nothing was filed through the app. */
export function examResultNote(result: ExamResult, by: string): string {
	return result === 'passed'
		? `Rating exam marked passed by ${by} on /teach; no training report filed through the app.`
		: `Rating exam marked not passed by ${by} on /teach; no training report filed through the app. Training Completed cleared.`;
}

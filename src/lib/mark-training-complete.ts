/**
 * The words and the one choice in `/teach`'s "Mark training complete?" dialog,
 * and the card comment it leaves. Pure, for the page, the action and their
 * tests; who may press the button is `canCompleteTraining()` in
 * `$lib/course-completion.ts`.
 */
import type { AfterTraining } from './course-completion';
import { courseName } from './courses';

/**
 * What every `/teach` step dialog says, since none of them files a training
 * report (decisions/0038): `bold` is shown in bold, then `after`.
 */
export const NO_REPORT_FILED = {
	bold: 'No training report is filed.',
	after: "If you haven't filed one yet do that first."
} as const;

/** How each `/teach` step's card comment says the same thing. */
export const NOT_FILED_THROUGH_THE_APP = 'no training report filed through the app';

/**
 * Where the card goes, from what the course allows and what the teacher has
 * picked. A standard course has one answer; Custom Training has none until one
 * of its radios is chosen, and Mark complete stays disabled until then.
 */
export function chosenStep(
	options: readonly AfterTraining[],
	chosen: string | null
): AfterTraining | null {
	if (options.length === 1) return options[0];
	return options.find((option) => option === chosen) ?? null;
}

/** The TRK column the card is advanced to, as the dialog names it. */
export function advancedTo(step: AfterTraining | null): string {
	if (step === 'rating-exam') return 'Rating Exam';
	if (step === 'certification-update') return 'Audit';
	return 'the next step';
}

/** "Simple Ground Control training"; Custom Training is already called training. */
export function courseTraining(code: string): string {
	const name = courseName(code);
	return /\btraining$/i.test(name) ? name : `${name} training`;
}

/** The dialog's words, for the step chosen so far (null while Custom Training has none). */
export function trainingCompleteCopy(student: string, course: string, step: AfterTraining | null) {
	return {
		title: 'Mark training complete?',
		confirmLabel: 'Mark complete',
		before: `${student}'s ${courseTraining(course)} will be marked complete, and the enrollment advanced to ${advancedTo(step)}.`,
		...NO_REPORT_FILED
	};
}

/** The card comment, in place of the usual note: nothing was filed through the app. */
export function trainingCompleteNote(by: string): string {
	return `Training marked complete by ${by} on /teach; ${NOT_FILED_THROUGH_THE_APP}.`;
}

/**
 * The words and the one choice in `/teach`'s "Mark training complete?" dialog.
 * Pure, for the page and its tests; who may press the button is
 * `canCompleteTraining()` in `$lib/course-completion.ts`.
 */
import type { AfterTraining } from './course-completion';
import { findCourse } from './courses';

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
	const name = findCourse(code)?.name ?? code;
	return /\btraining$/i.test(name) ? name : `${name} training`;
}

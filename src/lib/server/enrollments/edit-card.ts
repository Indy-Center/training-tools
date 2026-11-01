import type { Database } from '$lib/server/db';
import type { Enrollment } from '$lib/db/schema/enrollments';
import { CARD_DATE_FIELDS, type CardDateKey } from '$lib/card-page';
import { isRealDate } from '$lib/ctrs';
import { JiraError } from '$lib/server/jira/client';
import { fetchCard, fetchTransitions, type Card, type CardTransition } from '$lib/server/jira/card';
import { transitionIssueToStatus } from '$lib/server/jira/enrollment';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import {
	fetchSelectOptions,
	matchSelectOption,
	toFacilityDate,
	updateIssueFields,
	type SelectOption
} from '$lib/server/jira/progress';
import { mapJiraStatus, RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import { getPeople } from '$lib/server/roster';
import { note, onCard } from './completion';

/**
 * Edit card, on `/admin/cards/{key}`: a training admin sets a card's stage,
 * dates and examiner in one save, and it behaves as the same edit on the board
 * would. Jira is written first and the card read back through `onCard()`, so
 * the passes that follow (dates on the move, the certification and its hold,
 * the announcers) run as after a drag. Nothing here is special-cased because
 * the app made the move.
 *
 * See decisions/0040-admins-act-in-the-app-the-board-stays.md
 */

/** A stage the form offers: the card's own, or where a move Jira offers now leads. */
export type StageChoice = {
	/** TRK's status name, as the board shows it. */
	name: string;
	/** Audit, where a card without its evidence is held (0024): the form warns. */
	audit: boolean;
};

const fold = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

/**
 * The form's stage choices: the card's current stage, then each move 04's
 * `fetchTransitions()` lists (already one per target status), **except
 * Completed**, which only the audit makes (0040).
 */
export function stageChoices(
	current: string | null,
	transitions: readonly CardTransition[]
): StageChoice[] {
	const names = [
		...(current ? [current] : []),
		...transitions.map((transition) => transition.to)
	].filter((name) => mapJiraStatus(name) !== 'completed');

	const seen = new Set<string>();
	return names.flatMap((name) => {
		if (seen.has(fold(name))) return [];
		seen.add(fold(name));
		return [{ name, audit: mapJiraStatus(name) === 'certification-update' }];
	});
}

/**
 * What the form posted. A part left out of the POST is left as the card has
 * it; an empty date or examiner clears it.
 */
export type CardEditInput = {
	stage?: string;
	/** RE Instructor's value (`HI`, `VATUSA`), or empty for none. */
	examiner?: string;
	dates: Partial<Record<CardDateKey, string>>;
};

export type CardEditPlan = {
	/** Every changed field, for one `updateIssueFields`. */
	fields: Record<string, unknown>;
	/** What the comment says of the fields, once they land. */
	changes: string[];
	move: { from: string; to: string } | null;
};

export type CardEditRefusal = { refused: string; status: 400 | 409 };

const shown = (value: string | null) => value ?? 'none';

/**
 * Check a save against the card as Jira has it now, and work out what to
 * write. Pure. The refusals that need no card (withdrawn, Completed) are
 * `editCard()`'s, before Jira is asked; these follow them in the spec's order.
 */
export function planCardEdit(input: {
	issueKey: string;
	edit: CardEditInput;
	card: Card;
	stages: readonly StageChoice[];
	examiners: readonly SelectOption[];
	/** The facility's day, `YYYY-MM-DD`. */
	today: string;
}): CardEditPlan | CardEditRefusal {
	const { issueKey, edit, card, stages, examiners, today } = input;

	const examiner = edit.examiner === undefined ? card.reInstructor : edit.examiner.trim() || null;
	if (examiner && card.teacher && fold(examiner) === fold(card.teacher)) {
		return { refused: "The examiner can't be the student's teacher.", status: 400 };
	}

	const fields: Record<string, unknown> = {};
	const changes: string[] = [];

	for (const { key, label } of CARD_DATE_FIELDS) {
		const posted = edit.dates[key];
		if (posted === undefined) continue;
		const value = posted.trim() || null;
		if (value !== null && (!isRealDate(value) || value > today)) {
			return { refused: `${label} must be a date no later than today.`, status: 400 };
		}
		if (value !== card.dates[key]) {
			fields[JIRA_FIELDS[key]] = value;
			changes.push(`${label} ${shown(card.dates[key])} → ${shown(value)}`);
		}
	}

	const stage = edit.stage?.trim() || card.status;
	let move: CardEditPlan['move'] = null;
	if (stage && fold(stage) !== fold(card.status)) {
		const offered = stages.find((choice) => fold(choice.name) === fold(stage));
		if (!offered) {
			return {
				refused: `${issueKey} can't move to ${stage} from ${shown(card.status)} now. Reload and try again.`,
				status: 409
			};
		}
		move = { from: card.status ?? 'none', to: offered.name };
	}

	if (fold(examiner) !== fold(card.reInstructor)) {
		if (examiner) {
			const option = matchSelectOption(examiners, [examiner]);
			if (!option) {
				return {
					refused: `TRK's RE Instructor list has no option for ${examiner}. Reload and try again.`,
					status: 400
				};
			}
			fields[RE_INSTRUCTOR_FIELD] = { id: option.id };
			changes.push(`RE Instructor ${shown(card.reInstructor)} → ${option.value}`);
		} else {
			fields[RE_INSTRUCTOR_FIELD] = null;
			changes.push(`RE Instructor ${shown(card.reInstructor)} → none`);
		}
	}

	if (changes.length === 0 && !move) return { refused: 'Nothing changed.', status: 400 };

	return { fields, changes, move };
}

export type CardEditResult = { ok: true } | { ok: false; message: string; status: 400 | 409 | 502 };

/**
 * Save an Edit card form, in the spec's order: refuse (writing nothing), the
 * changed fields in one call, the move, one comment naming only what landed,
 * then the read-back (`onCard()`).
 *
 * A move Jira refuses leaves the fields written: Jira has them and the
 * read-back shows them. The result then carries the move's error.
 */
export async function editCard(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string,
	edit: CardEditInput,
	now = new Date()
): Promise<CardEditResult> {
	if (enrollment.withdrawnAt) {
		const name = (await getPeople(db)).get(enrollment.cid)?.name ?? enrollment.submittedName;
		return {
			ok: false,
			message: `${name} withdrew this request themselves; it can't be edited here.`,
			status: 409
		};
	}
	if (edit.stage !== undefined && mapJiraStatus(edit.stage) === 'completed') {
		return { ok: false, message: 'A card is completed from the audit.', status: 400 };
	}

	let refusal: CardEditRefusal | null = null;
	let moveError: string | null = null;

	const result = await onCard(db, env, enrollment, 'edit card', async (config, issueKey) => {
		// Read again rather than trust what the page was given: the card, and the
		// moves Jira offers it, may have changed since.
		const [card, transitions, examiners] = await Promise.all([
			fetchCard(config, issueKey),
			fetchTransitions(config, issueKey),
			fetchSelectOptions(config, issueKey, RE_INSTRUCTOR_FIELD)
		]);
		const plan = planCardEdit({
			issueKey,
			edit,
			card,
			stages: stageChoices(card.status, transitions),
			examiners,
			today: toFacilityDate(now)
		});
		if ('refused' in plan) {
			refusal = plan;
			return { ok: false, message: plan.refused };
		}

		const landed: string[] = [];
		if (plan.changes.length > 0) {
			await updateIssueFields(config, issueKey, plan.fields);
			landed.push(...plan.changes);
		}
		if (plan.move) {
			try {
				await transitionIssueToStatus(config, issueKey, plan.move.to);
				landed.push(`moved ${plan.move.from} → ${plan.move.to}`);
			} catch (err) {
				const detail = err instanceof JiraError ? err.message : String(err);
				console.error('[training-tools] edit card: move refused', issueKey, detail);
				moveError = `${issueKey} can't move to ${plan.move.to} from ${plan.move.from} now. Reload and try again. (${detail})`;
			}
		}
		if (landed.length > 0) await note(config, issueKey, `Edited by ${by}: ${landed.join('; ')}.`);
	});

	if (refusal) {
		const { refused, status } = refusal as CardEditRefusal;
		return { ok: false, message: refused, status };
	}
	if (!result.ok) return { ok: false, message: result.message, status: 502 };
	if (moveError) return { ok: false, message: moveError, status: 409 };
	return { ok: true };
}

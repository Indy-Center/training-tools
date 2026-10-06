import { FACILITY_TIME_ZONE } from '$lib/config';
import type { CardEvidence } from '$lib/course-completion';
import { jiraRequest, type JiraConfig } from './client';
import { JIRA_FIELDS } from './fields';
import { RE_INSTRUCTOR_FIELD } from './status';

/**
 * Writing a request's progress onto its TRK issue: the dates staff used to fill
 * in by hand, and the examiner.
 *
 * Moving the issue between columns is `transitionIssueToStatus()` in
 * `./enrollment.ts`. None of TRK's transitions has a screen, so a date cannot
 * ride along with a transition — each is a field edit made **before** the move,
 * which is also the order a "required before transition" rule in Jira needs.
 *
 * See .ai/research/jira-student-tracking.md for the workflow and field ids.
 */

/** TRK's status names for the end of a course. Matched by name, like every transition. */
export const RATING_EXAM_STATUS = 'Rating Exam';
/** A failed rating exam waits here for the TA, who sends it back into training. */
export const NEEDS_CATP_STATUS = 'Needs CATP';
export const CERTIFICATION_UPDATE_STATUS = 'Certification Update';
export const COMPLETED_STATUS = 'Completed';

/**
 * Today's date for a Jira date field, **in the facility's timezone**.
 *
 * Most training happens in the evening. In UTC a session that ends at 9pm
 * Eastern is already tomorrow, and the card would say the training finished a
 * day after it did.
 */
export function toFacilityDate(date: Date, timeZone: string = FACILITY_TIME_ZONE): string {
	// en-CA formats as YYYY-MM-DD, which is what Jira's date fields take.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

/** Set fields on an issue. Throws JiraError. */
export async function updateIssueFields(
	config: JiraConfig,
	issueKey: string,
	fields: Record<string, unknown>
): Promise<void> {
	await jiraRequest(config, `/issue/${encodeURIComponent(issueKey)}`, {
		method: 'PUT',
		body: { fields }
	});
}

type EvidenceIssue = {
	fields?: {
		[JIRA_FIELDS.trainingCompleted]?: string | null;
		[JIRA_FIELDS.reCompleted]?: string | null;
		[RE_INSTRUCTOR_FIELD]?: { value?: string | null } | null;
	} | null;
};

/**
 * The fields on a card that show its course was finished, read fresh.
 *
 * Not kept on our row: they are only ever needed at the moment a certification
 * is about to be applied, and that decision should rest on what the card says
 * now. Throws JiraError, including when the issue is gone.
 */
export async function fetchCardEvidence(
	config: JiraConfig,
	issueKey: string
): Promise<CardEvidence> {
	const fields = [JIRA_FIELDS.trainingCompleted, JIRA_FIELDS.reCompleted, RE_INSTRUCTOR_FIELD];
	const issue = await jiraRequest<EvidenceIssue>(
		config,
		`/issue/${encodeURIComponent(issueKey)}?fields=${fields.join(',')}`,
		{ method: 'GET' }
	);

	return {
		trainingCompleted: issue.fields?.[JIRA_FIELDS.trainingCompleted] || null,
		reCompleted: issue.fields?.[JIRA_FIELDS.reCompleted] || null,
		reInstructor: issue.fields?.[RE_INSTRUCTOR_FIELD]?.value?.trim() || null
	};
}

export type SelectOption = { id: string; value: string };

type EditMeta = {
	fields?: Record<string, { allowedValues?: { id?: string; value?: string }[] } | undefined>;
};

/**
 * The option on one of an issue's select fields that stands for any of
 * `candidates`, or null when the dropdown offers none of them.
 *
 * Looked up rather than sent by value because the board is edited by hand: on
 * 2026-09-30 RE Instructor offered `Sw` for the teacher we hold as `SW`. Setting
 * the field by the option's **id** works whatever its spelling.
 */
export async function findSelectOption(
	config: JiraConfig,
	issueKey: string,
	fieldId: string,
	candidates: readonly (string | null | undefined)[]
): Promise<SelectOption | null> {
	const meta = await jiraRequest<EditMeta>(
		config,
		`/issue/${encodeURIComponent(issueKey)}/editmeta`,
		{ method: 'GET' }
	);

	return matchSelectOption(meta.fields?.[fieldId]?.allowedValues ?? [], candidates);
}

/** Pure half of `findSelectOption`, for testing. Case and stray spaces are ignored. */
export function matchSelectOption(
	options: readonly { id?: string; value?: string }[],
	candidates: readonly (string | null | undefined)[]
): SelectOption | null {
	const fold = (value: string) => value.trim().toUpperCase();
	const wanted = candidates.filter((value): value is string => Boolean(value?.trim())).map(fold);

	// In candidate order, so initials are preferred over the CID fallback.
	for (const candidate of wanted) {
		const option = options.find((o) => o.id && o.value && fold(o.value) === candidate);
		if (option) return { id: option.id!, value: option.value! };
	}

	return null;
}

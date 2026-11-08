import { CARD_DATE_FIELDS, type Card, type CardDateKey } from '$lib/card-page';
import { jiraRequest, type JiraConfig } from './client';
import { JIRA_FIELDS } from './fields';
import { parseJiraTimestamp, RE_INSTRUCTOR_FIELD, TEACHER_FIELD, textareaText } from './status';

/**
 * One TRK card as a training admin sees it on `/admin/cards/{key}`: where it
 * is, who is on it, its dates, the moves Jira offers it now and its latest
 * comments. Every read is live; nothing here is kept on our row.
 *
 * See decisions/0040-admins-act-in-the-app-the-board-stays.md
 */

// Every date the page lists is a field this file knows the id of.
CARD_DATE_FIELDS satisfies readonly { key: keyof typeof JIRA_FIELDS }[];

type CardIssue = {
	fields?: Record<string, unknown> | null;
};

const CARD_FIELDS = [
	'status',
	TEACHER_FIELD,
	RE_INSTRUCTOR_FIELD,
	...CARD_DATE_FIELDS.map(({ key }) => JIRA_FIELDS[key]),
	JIRA_FIELDS.reAttempts
];

/** A select's value, trimmed, or null. */
function selectValue(value: unknown): string | null {
	const text = (value as { value?: unknown } | null | undefined)?.value;
	return typeof text === 'string' ? text.trim() || null : null;
}

/** Read the card. Throws JiraError, including a 404 when the issue is gone. */
export async function fetchCard(config: JiraConfig, issueKey: string): Promise<Card> {
	const issue = await jiraRequest<CardIssue>(
		config,
		`/issue/${encodeURIComponent(issueKey)}?fields=${CARD_FIELDS.join(',')}`,
		{ method: 'GET' }
	);
	const fields = issue.fields ?? {};
	const status = (fields.status as { name?: unknown } | null | undefined)?.name;
	// A number field; Jira's float reads back as e.g. `2`.
	const attempts = fields[JIRA_FIELDS.reAttempts];

	return {
		status: typeof status === 'string' ? status.trim() || null : null,
		teacher: selectValue(fields[TEACHER_FIELD]),
		reInstructor: selectValue(fields[RE_INSTRUCTOR_FIELD]),
		dates: Object.fromEntries(
			CARD_DATE_FIELDS.map(({ key }) => {
				const value = fields[JIRA_FIELDS[key]];
				return [key, typeof value === 'string' && value ? value : null];
			})
		) as Record<CardDateKey, string | null>,
		reAttempts: typeof attempts === 'number' && Number.isFinite(attempts) ? attempts : null
	};
}

/** A move Jira offers the card now. `to` is the target status's name. */
export type CardTransition = { id: string; name: string; to: string };

type JiraTransition = { id?: string; name?: string; to?: { name?: string } | null };

/**
 * One move per target status, the first Jira lists. A workflow can offer two
 * transitions into the same status (from different places, or a renamed one
 * left behind); to an admin choosing where the card goes they are one choice,
 * and `transitionIssueToStatus()` fires by target name anyway.
 *
 * Every status is kept, Completed included: what a form leaves out is the
 * form's business.
 */
export function distinctTransitions(transitions: readonly JiraTransition[]): CardTransition[] {
	const seen = new Set<string>();
	const distinct: CardTransition[] = [];

	for (const transition of transitions) {
		const to = transition.to?.name?.trim();
		if (!to || !transition.id) continue;
		const fold = to.toLowerCase();
		if (seen.has(fold)) continue;
		seen.add(fold);
		distinct.push({ id: transition.id, name: transition.name ?? to, to });
	}

	return distinct;
}

/** The moves Jira offers the card now, one per target status. Throws JiraError. */
export async function fetchTransitions(
	config: JiraConfig,
	issueKey: string
): Promise<CardTransition[]> {
	const { transitions } = await jiraRequest<{ transitions?: JiraTransition[] }>(
		config,
		`/issue/${encodeURIComponent(issueKey)}/transitions`,
		{ method: 'GET' }
	);
	return distinctTransitions(transitions ?? []);
}

export type CardComment = {
	id: string;
	/** Jira's display name for whoever wrote it. The app's own are the API account. */
	author: string | null;
	/** Jira's timestamp, e.g. `2026-10-02T10:00:00.000-0400`. */
	created: string | null;
	text: string;
};

type JiraComment = {
	id?: string;
	author?: { displayName?: string } | null;
	created?: string;
	body?: unknown;
};

/** A comment's time, for ordering; one Jira gave none sorts last. */
const time = (created: string | null) => parseJiraTimestamp(created)?.getTime() ?? 0;

/** How many comments the card page shows. */
export const LATEST_COMMENTS = 5;

/**
 * The card's newest comments, newest first, as plain text. Asked of Jira
 * newest first, and sorted again here so the order does not rest on it.
 * Throws JiraError.
 */
export async function fetchLatestComments(
	config: JiraConfig,
	issueKey: string
): Promise<CardComment[]> {
	const { comments } = await jiraRequest<{ comments?: JiraComment[] }>(
		config,
		`/issue/${encodeURIComponent(issueKey)}/comment?orderBy=-created&maxResults=${LATEST_COMMENTS}`,
		{ method: 'GET' }
	);

	return (comments ?? [])
		.map((comment) => ({
			id: comment.id ?? '',
			author: comment.author?.displayName?.trim() || null,
			created: comment.created ?? null,
			text: textareaText(comment.body) ?? ''
		}))
		.sort((a, b) => time(b.created) - time(a.created))
		.slice(0, LATEST_COMMENTS);
}

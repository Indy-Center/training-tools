import { eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import type { Card } from '$lib/card-page';
import { holdLabels } from '$lib/course-completion';
import { issueUrl, JiraError, resolveJiraConfig } from '$lib/server/jira/client';
import {
	fetchCard,
	fetchLatestComments,
	fetchTransitions,
	type CardComment,
	type CardTransition
} from '$lib/server/jira/card';
import { fetchSelectOptions, type SelectOption } from '$lib/server/jira/progress';
import { RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import { getPeople } from '$lib/server/roster';

/**
 * What `/admin/cards/{key}` shows: our row and the card as Jira has it now.
 * The page is training admins'; the route checks that before calling in here.
 *
 * See decisions/0040-admins-act-in-the-app-the-board-stays.md
 */

/**
 * The request filed as `issueKey`, withdrawn ones included (Edit card refuses
 * those by name), or null when no row has that key.
 */
export async function getEnrollmentByIssueKey(
	db: Database,
	issueKey: string
): Promise<Enrollment | null> {
	const enrollment = await db.query.enrollmentsTable.findFirst({
		where: eq(enrollmentsTable.jiraIssueKey, issueKey)
	});
	return enrollment ?? null;
}

export type CardPage = {
	issueKey: string;
	enrollment: {
		id: string;
		cid: string;
		/** As the roster names them, else as they enrolled. */
		name: string;
		course: string;
		/** Our row's status: where the card was when it was last read back. */
		status: string;
		/** Set when the student withdrew the request here. */
		withdrawn: boolean;
	};
	/** The fields a held card lacks (`certification_hold`), as labels. Empty when not held. */
	hold: string[];
	/** The card on the board, when Jira's address is known. */
	jiraUrl: string | null;
	/** Null when the card could not be read; `jiraError` says why. */
	card: Card | null;
	/** One per target status, Completed included. */
	transitions: CardTransition[];
	/** Newest first, at most five. */
	comments: CardComment[];
	/** RE Instructor's options on this card, for Edit card. */
	examiners: SelectOption[];
	/** `Couldn't read TRK-n from Jira: …`, or null when it was read. */
	jiraError: string | null;
};

/** Read the card for the page. Never throws for Jira: a failed read is `jiraError`. */
export async function loadCardPage(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment
): Promise<CardPage> {
	const issueKey = enrollment.jiraIssueKey!;
	const people = await getPeople(db);

	const page: CardPage = {
		issueKey,
		enrollment: {
			id: enrollment.id,
			cid: enrollment.cid,
			name: people.get(enrollment.cid)?.name ?? enrollment.submittedName,
			course: enrollment.course,
			status: enrollment.status,
			withdrawn: enrollment.withdrawnAt !== null
		},
		hold: holdLabels(enrollment.certificationHold),
		jiraUrl: issueUrl(env?.JIRA_BASE_URL, issueKey),
		card: null,
		transitions: [],
		comments: [],
		examiners: [],
		jiraError: null
	};

	const config = resolveJiraConfig(env);
	if (!config) {
		return {
			...page,
			jiraError: `Couldn't read ${issueKey} from Jira: Jira isn't configured for this app.`
		};
	}

	try {
		const [card, transitions, comments, examiners] = await Promise.all([
			fetchCard(config, issueKey),
			fetchTransitions(config, issueKey),
			fetchLatestComments(config, issueKey),
			fetchSelectOptions(config, issueKey, RE_INSTRUCTOR_FIELD)
		]);
		return { ...page, card, transitions, comments, examiners };
	} catch (err) {
		const detail = err instanceof JiraError ? err.message : String(err);
		console.error('[training-tools] card page: could not read', issueKey, detail);
		return { ...page, jiraError: `Couldn't read ${issueKey} from Jira: ${detail}` };
	}
}

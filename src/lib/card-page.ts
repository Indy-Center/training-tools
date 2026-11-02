/**
 * The training admins' card page, `/admin/cards/{key}`, as the rest of the app
 * refers to it. Client-safe: pages link to it, and it lists the card's dates.
 *
 * See decisions/0040-admins-act-in-the-app-the-board-stays.md
 */

/** The card page's path, for a TRK key (`TRK-14`). Notices prefix `SITE_URL`. */
export function cardPagePath(issueKey: string): string {
	return `/admin/cards/${encodeURIComponent(issueKey)}`;
}

/**
 * The card's date fields an admin can see and edit, in the order the page
 * lists them. Keys are `JIRA_FIELDS`'. `Recommended for RE` and `RE Failed`
 * join once `JIRA_FIELDS` has their ids.
 */
export const CARD_DATE_FIELDS = [
	{ key: 'trainingCompleted', label: 'Training Completed' },
	{ key: 'reCompleted', label: 'RE Completed' },
	{ key: 'teacherAssigned', label: 'Teacher Assigned' },
	{ key: 'removed', label: 'Removed' },
	{ key: 'vatusaAssigned', label: 'VATUSA Assigned' },
	{ key: 'vatusaCompleted', label: 'VATUSA Completed' }
] as const;

export type CardDateKey = (typeof CARD_DATE_FIELDS)[number]['key'];

/** One TRK card as Jira has it now, read by `fetchCard()`. */
export type Card = {
	/** TRK's status name, as the board shows it (`Needs CATP`). */
	status: string | null;
	/** `Teacher`'s value: initials. */
	teacher: string | null;
	/** `RE Instructor`'s value: initials, or `VATUSA`. */
	reInstructor: string | null;
	/** As the card holds them, `YYYY-MM-DD`, or null when empty. */
	dates: Record<CardDateKey, string | null>;
};

/** A stage Edit card offers: the card's own, or where a move Jira offers now leads. */
export type StageChoice = {
	/** TRK's status name, as the board shows it. */
	name: string;
	/** Audit, where a card without its evidence is held (0024): the form warns. */
	audit: boolean;
};

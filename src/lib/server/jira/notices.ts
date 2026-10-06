import type { Notice } from '$lib/server/notify';

/**
 * What the tech team is told when the TRK board holds something the app cannot
 * read. Pure, so the grouping is tested without Jira or Discord.
 */

export type BoardProblem = {
	issueKey: string;
	reason: 'unknown-status' | 'unknown-course' | 'no-cid' | 'no-date';
	/** The value the app did not recognise, when there is one to show. */
	detail: string | null;
};

const REASONS: Record<BoardProblem['reason'], string> = {
	'unknown-status': 'Status the app does not know',
	'unknown-course': 'Course the app does not know',
	'no-cid': 'No usable CID',
	'no-date': 'No Waitlisted or created date'
};

/**
 * One notice for everything wrong on the board, grouped by what is wrong and —
 * for a status or course — by the value, since a renamed status hits every
 * card sitting in it at once. Null when the board is clean.
 *
 * An unknown status is the one that matters most: the app ignores those cards
 * entirely, so a status renamed on the board stops certifications, the
 * student's page and every step on Teach for it until the app is taught the
 * new name.
 */
export function boardProblemsNotice(
	problems: readonly BoardProblem[],
	jiraBaseUrl?: string
): Notice | null {
	if (problems.length === 0) return null;

	const base = jiraBaseUrl?.trim().replace(/\/$/, '');
	const link = (key: string) => (base ? `[${key}](${base}/browse/${key})` : key);

	const groups = new Map<string, string[]>();
	for (const problem of problems) {
		const label = problem.detail
			? `${REASONS[problem.reason]}: ${problem.detail}`
			: REASONS[problem.reason];
		const keys = groups.get(label);
		if (keys) keys.push(problem.issueKey);
		else groups.set(label, [problem.issueKey]);
	}

	const renamed = problems.some((problem) => problem.reason === 'unknown-status');

	return {
		audience: 'tech-team',
		tone: 'warning',
		title: 'TRK cards the app cannot read',
		summary: renamed
			? 'A status on the board is not one the app knows, so those cards are ignored. Was it renamed or added?'
			: 'These cards are skipped until they are fixed on the board.',
		fields: [...groups].map(([label, keys]) => ({ label, value: keys.map(link).join(', ') }))
	};
}

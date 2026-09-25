import { JiraError, jiraRequest, type JiraConfig } from './client';
import { BOARD_ISSUE_FIELDS, type JiraBoardIssue } from './board-issue';
import { STUDENT_ENROLLMENT_ISSUE_TYPE_ID } from './enrollment';
import { STATUS_FIELDS, type JiraStatusIssue } from './status';

/**
 * Reads against TRK's Student Enrollment issues. Each read asks only for the
 * fields its caller uses, which keeps the responses small and the API token's
 * job narrow.
 */

/** Jira's page ceiling for `/search/jql`. */
const PAGE_SIZE = 100;

/**
 * Pages one search will read before giving up.
 *
 * Bounds the subrequests a single cron invocation can spend. TRK holds far
 * fewer issues than this, so hitting it means something is wrong; callers then
 * treat the read as incomplete rather than act on what they did not see.
 */
const MAX_PAGES = 20;

type SearchResponse<T> = {
	issues?: T[];
	nextPageToken?: string;
	isLast?: boolean;
};

export type SearchResult<T = JiraStatusIssue> = {
	issues: T[];
	/** False when MAX_PAGES was hit before Jira said it was done. */
	complete: boolean;
};

function enrollmentJql(config: JiraConfig, extra: string[], orderBy: string): string {
	const clauses = [
		`project = "${config.projectKey}"`,
		`issuetype = ${STUDENT_ENROLLMENT_ISSUE_TYPE_ID}`,
		...extra
	];
	return `${clauses.join(' AND ')} ORDER BY ${orderBy}`;
}

/**
 * Every page of one JQL search.
 *
 * Uses `/search/jql` with `nextPageToken` — the older `/search` with `startAt`
 * has been retired by Atlassian.
 */
async function searchAll<T>(
	config: JiraConfig,
	jql: string,
	fields: readonly string[]
): Promise<SearchResult<T>> {
	const issues: T[] = [];
	let nextPageToken: string | undefined;

	for (let page = 0; page < MAX_PAGES; page += 1) {
		const response = await jiraRequest<SearchResponse<T>>(config, '/search/jql', {
			method: 'POST',
			body: { jql, fields: [...fields], maxResults: PAGE_SIZE, nextPageToken }
		});

		issues.push(...(response.issues ?? []));

		nextPageToken = response.nextPageToken;
		if (response.isLast !== false || !nextPageToken) return { issues, complete: true };
	}

	return { issues, complete: false };
}

/**
 * Student Enrollment issues updated in the last `withinMinutes`, or every one
 * of them when that is null (the first run, or after the cursor was lost).
 * Status fields only — this is the sweep's read.
 *
 * A **relative** JQL date on purpose. An absolute one is read in the API
 * account's own timezone, which is a quiet off-by-hours bug; "-90m" means the
 * same thing wherever the account thinks it is.
 */
export async function searchEnrollmentIssues(
	config: JiraConfig,
	withinMinutes: number | null
): Promise<SearchResult<JiraStatusIssue>> {
	const extra = withinMinutes === null ? [] : [`updated >= "-${Math.ceil(withinMinutes)}m"`];
	return searchAll(config, enrollmentJql(config, extra, 'updated ASC'), STATUS_FIELDS);
}

/**
 * Every Student Enrollment issue on the board, with the fields a row needs.
 * The import's read: it has to see old issues too, so it takes no window.
 */
export async function listBoardIssues(config: JiraConfig): Promise<SearchResult<JiraBoardIssue>> {
	return searchAll(config, enrollmentJql(config, [], 'created ASC'), BOARD_ISSUE_FIELDS);
}

/** One issue's status and teacher, or null when the issue no longer exists. */
export async function fetchEnrollmentIssue(
	config: JiraConfig,
	issueKey: string
): Promise<JiraStatusIssue | null> {
	const fields = STATUS_FIELDS.join(',');

	try {
		return await jiraRequest<JiraStatusIssue>(
			config,
			`/issue/${encodeURIComponent(issueKey)}?fields=${fields}`,
			{ method: 'GET' }
		);
	} catch (err) {
		// Deleted, or moved somewhere the token cannot see: nothing to apply.
		if (err instanceof JiraError && err.status === 404) return null;
		throw err;
	}
}

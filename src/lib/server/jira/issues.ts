import { JiraError, jiraRequest, type JiraConfig } from './client';
import { STUDENT_ENROLLMENT_ISSUE_TYPE_ID } from './enrollment';
import { STATUS_FIELDS, type JiraStatusIssue } from './status';

/**
 * Status reads against TRK. Only `status` and `Teacher` are ever requested,
 * which keeps the responses small and the API token's job narrow.
 */

/** Jira's page ceiling for `/search/jql`. */
const PAGE_SIZE = 100;

/**
 * Pages one sweep will read before giving up.
 *
 * Bounds the subrequests a single cron invocation can spend. TRK holds far
 * fewer issues than this, so hitting it means something is wrong; the caller
 * then leaves its cursor where it was rather than skip what it did not read.
 */
const MAX_PAGES = 20;

type SearchResponse = {
	issues?: JiraStatusIssue[];
	nextPageToken?: string;
	isLast?: boolean;
};

export type SearchResult = {
	issues: JiraStatusIssue[];
	/** False when MAX_PAGES was hit before Jira said it was done. */
	complete: boolean;
};

/**
 * Student Enrollment issues updated in the last `withinMinutes`, or every one
 * of them when that is null (the first run, or after the cursor was lost).
 *
 * A **relative** JQL date on purpose. An absolute one is read in the API
 * account's own timezone, which is a quiet off-by-hours bug; "-90m" means the
 * same thing wherever the account thinks it is.
 *
 * Uses `/search/jql` with `nextPageToken` — the older `/search` with `startAt`
 * has been retired by Atlassian.
 */
export async function searchEnrollmentIssues(
	config: JiraConfig,
	withinMinutes: number | null
): Promise<SearchResult> {
	const clauses = [
		`project = "${config.projectKey}"`,
		`issuetype = ${STUDENT_ENROLLMENT_ISSUE_TYPE_ID}`
	];
	if (withinMinutes !== null) clauses.push(`updated >= "-${Math.ceil(withinMinutes)}m"`);

	const jql = `${clauses.join(' AND ')} ORDER BY updated ASC`;
	const issues: JiraStatusIssue[] = [];
	let nextPageToken: string | undefined;

	for (let page = 0; page < MAX_PAGES; page += 1) {
		const response = await jiraRequest<SearchResponse>(config, '/search/jql', {
			method: 'POST',
			body: { jql, fields: [...STATUS_FIELDS], maxResults: PAGE_SIZE, nextPageToken }
		});

		issues.push(...(response.issues ?? []));

		nextPageToken = response.nextPageToken;
		if (response.isLast !== false || !nextPageToken) return { issues, complete: true };
	}

	return { issues, complete: false };
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

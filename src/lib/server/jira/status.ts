/**
 * Reading an enrollment's status back from its TRK issue.
 *
 * Pure: takes the issue fields Jira returned, gives back the columns to write.
 * The sweep and the webhook both go through `resolveStatusUpdate()`, so they
 * cannot disagree about what an issue means.
 *
 * See .ai/decisions/0014-enrollment-status-from-jira.md
 */
import type { EnrollmentStatus } from '$lib/db/schema/enrollments';

/** `Teacher` on the Student Enrollment issue type: a select of instructor initials. */
export const TEACHER_FIELD = 'customfield_10250';

/** The only fields a status read asks Jira for. */
export const STATUS_FIELDS = ['status', TEACHER_FIELD] as const;

/**
 * TRK status names, lowercased, to ours.
 *
 * Matched by **name**, not id, for the same reason `transitionIssueToStatus()`
 * is: this workflow changed three times in one day, and a renamed status failing
 * to match (and being logged) is a far better failure than a recycled id being
 * silently mapped to the wrong thing.
 */
const JIRA_STATUS_MAP: Readonly<Record<string, EnrollmentStatus>> = {
	waitlist: 'waitlist',
	'in training': 'in-training',
	'rating exam': 'rating-exam',
	'certification update': 'certification-update',
	completed: 'completed',
	removed: 'removed',
	withdrawn: 'withdrawn'
};

export function mapJiraStatus(name: string | null | undefined): EnrollmentStatus | null {
	return JIRA_STATUS_MAP[name?.trim().toLowerCase() ?? ''] ?? null;
}

/** The slice of a Jira issue we read. Everything is optional because Jira's JSON is not ours. */
export type JiraStatusIssue = {
	key: string;
	fields?: {
		status?: { name?: string | null } | null;
		[TEACHER_FIELD]?: { value?: string | null } | null;
	} | null;
};

export type StatusUpdate = {
	status: EnrollmentStatus;
	teacher: string | null;
};

export type StatusResolution =
	| { action: 'update'; update: StatusUpdate }
	/** The issue's status is not one we know; leave the row alone and say so. */
	| { action: 'unknown-status'; statusName: string | null };

export function resolveStatusUpdate(issue: JiraStatusIssue): StatusResolution {
	const statusName = issue.fields?.status?.name ?? null;
	const status = mapJiraStatus(statusName);

	if (!status) return { action: 'unknown-status', statusName };

	return {
		action: 'update',
		update: {
			status,
			teacher: issue.fields?.[TEACHER_FIELD]?.value?.trim() || null
		}
	};
}

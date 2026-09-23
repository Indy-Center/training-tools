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

/** The only fields a status read asks Jira for. `updated` orders the reads. */
export const STATUS_FIELDS = ['status', TEACHER_FIELD, 'updated'] as const;

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
		/** Jira's last-updated time, e.g. "2026-09-23T10:32:53.283-0400". */
		updated?: string | null;
	} | null;
};

/**
 * Parse a Jira timestamp. Jira writes the offset without a colon (`-0400`),
 * which V8 happens to accept but ISO 8601's extended form does not require of
 * anything, so it is normalised rather than relied on.
 */
export function parseJiraTimestamp(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * True when `observedAt` describes an older state of the issue than the one
 * already applied, and so must not overwrite it.
 *
 * This is what makes delivery order irrelevant. Staff set Teacher and then
 * click Assign Teacher a couple of seconds later, so two deliveries land almost
 * together; without this, the Teacher edit (still Waitlist) could be written
 * after the transition and hide In Training until the next sweep. Found on
 * TRK-51 and TRK-52, 2026-09-23.
 *
 * Equal times are not stale: re-applying the same state is a no-op. An unknown
 * time on either side is let through rather than guessed at.
 */
export function isStale(appliedAt: Date | null, observedAt: Date | null): boolean {
	if (!appliedAt || !observedAt) return false;
	return observedAt.getTime() < appliedAt.getTime();
}

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

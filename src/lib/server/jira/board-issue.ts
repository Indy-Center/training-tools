/**
 * Reading a whole Student Enrollment issue off the TRK board, for the import.
 *
 * Pure: takes the issue Jira returned, gives back what an enrollments row needs,
 * or why it cannot have one. Status and teacher go through the same
 * `resolveStatusUpdate()` the sweep and webhook use, so an imported row cannot
 * read an issue differently from how the sync later will.
 *
 * See `$lib/server/enrollments/import.ts`.
 */
import { findCourseByJiraOptionId, type CourseCode } from '$lib/courses';
import type { EnrollmentStatus, NotificationPreference } from '$lib/db/schema/enrollments';
import { JIRA_FIELDS, JIRA_NOTIFICATION_OPTIONS } from './fields';
import {
	parseJiraTimestamp,
	resolveStatusUpdate,
	STATUS_FIELDS,
	type JiraStatusIssue
} from './status';

/** Everything the import asks Jira for. A superset of the status read. */
export const BOARD_ISSUE_FIELDS = [
	...STATUS_FIELDS,
	'created',
	'summary',
	JIRA_FIELDS.course,
	JIRA_FIELDS.cid,
	JIRA_FIELDS.name,
	JIRA_FIELDS.notificationPreference,
	JIRA_FIELDS.waitlisted
] as const;

type SelectValue = { id?: string | null; value?: string | null } | null;

export type JiraBoardIssue = JiraStatusIssue & {
	fields?:
		| (NonNullable<JiraStatusIssue['fields']> & {
				created?: string | null;
				summary?: string | null;
				[JIRA_FIELDS.course]?: SelectValue;
				[JIRA_FIELDS.cid]?: string | null;
				[JIRA_FIELDS.name]?: string | null;
				[JIRA_FIELDS.notificationPreference]?: SelectValue;
				/** Date only, "YYYY-MM-DD". */
				[JIRA_FIELDS.waitlisted]?: string | null;
		  })
		| null;
};

export type BoardEnrollment = {
	issueKey: string;
	cid: string;
	course: CourseCode;
	name: string;
	status: EnrollmentStatus;
	teacher: string | null;
	notificationPreference: NotificationPreference | null;
	/** Where they sit in the queue: `Waitlisted`, else when the issue was created. */
	waitlistedAt: Date;
	/** The issue's `updated`, which orders every status write. */
	updatedAt: Date | null;
};

export type BoardIssueParse =
	| { ok: true; enrollment: BoardEnrollment }
	| {
			ok: false;
			reason: 'no-cid' | 'unknown-course' | 'unknown-status' | 'no-date';
	  };

/**
 * A VATSIM CID. Staff type this field by hand, so anything else is refused
 * rather than stored as a CID that joins to nobody.
 */
const CID = /^\d+$/;

/** "2026-08-24" → midnight UTC that day. Jira date fields carry no time or zone. */
export function parseJiraDate(value: string | null | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Summary convention on the board is "Name – Course (CODE)". */
function nameFromSummary(summary: string | null | undefined): string | null {
	const name = summary?.split(' – ')[0]?.trim();
	return name || null;
}

const NOTIFICATION_BY_OPTION_ID = Object.fromEntries(
	Object.entries(JIRA_NOTIFICATION_OPTIONS).map(([pref, id]) => [id, pref])
) as Record<string, NotificationPreference>;

export function parseBoardIssue(issue: JiraBoardIssue): BoardIssueParse {
	const fields = issue.fields ?? {};

	const cid = fields[JIRA_FIELDS.cid]?.trim() ?? '';
	if (!CID.test(cid)) return { ok: false, reason: 'no-cid' };

	const course = findCourseByJiraOptionId(fields[JIRA_FIELDS.course]?.id);
	if (!course) return { ok: false, reason: 'unknown-course' };

	const resolution = resolveStatusUpdate(issue);
	if (resolution.action !== 'update') return { ok: false, reason: 'unknown-status' };

	// Every issue migrated onto the board on 2026-09-05 was *created* that day,
	// so `created` would put the whole backlog in a tie. `Waitlisted` is the
	// position staff actually gave them.
	const waitlistedAt =
		parseJiraDate(fields[JIRA_FIELDS.waitlisted]) ?? parseJiraTimestamp(fields.created);
	if (!waitlistedAt) return { ok: false, reason: 'no-date' };

	return {
		ok: true,
		enrollment: {
			issueKey: issue.key,
			cid,
			course: course.code as CourseCode,
			name: fields[JIRA_FIELDS.name]?.trim() || nameFromSummary(fields.summary) || `CID ${cid}`,
			status: resolution.update.status,
			teacher: resolution.update.teacher,
			notificationPreference:
				NOTIFICATION_BY_OPTION_ID[fields[JIRA_FIELDS.notificationPreference]?.id ?? ''] ?? null,
			waitlistedAt,
			updatedAt: parseJiraTimestamp(fields.updated)
		}
	};
}

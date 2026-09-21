import { findCourse, type CourseCode } from '$lib/courses';
import type { NotificationPreference } from '$lib/db/schema/enrollments';
import { JIRA_FIELDS, JIRA_NOTIFICATION_OPTIONS } from './fields';
import { jiraRequest, JiraError, type JiraConfig } from './client';

/** The Student Enrollment issue type in TRK. */
export const STUDENT_ENROLLMENT_ISSUE_TYPE_ID = '10057';

/** Everything needed to file the issue, all of it available on an enrollments row. */
export type EnrollmentIssueInput = {
	cid: string;
	course: CourseCode;
	submittedName: string;
	submittedRating?: string | null;
	availability?: string | null;
	notificationPreference?: NotificationPreference | null;
	/**
	 * The course we suggested, set only when the student chose a different one.
	 *
	 * Goes in the description rather than a custom field: it is a note for
	 * whoever picks the request up, not something the board filters on, and
	 * adding a field to TRK is the training team's call rather than ours.
	 */
	suggestedCourse?: CourseCode | null;
};

/**
 * Jira Cloud's v3 API takes Atlassian Document Format, not plain strings, for
 * `description` and for textarea custom fields. Plain text in, one paragraph per
 * line out.
 */
function adf(text: string) {
	const paragraphs = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	return {
		type: 'doc',
		version: 1,
		content: (paragraphs.length > 0 ? paragraphs : ['—']).map((line) => ({
			type: 'paragraph',
			content: [{ type: 'text', text: line }]
		}))
	};
}

/** Jira date fields want YYYY-MM-DD. */
export function toJiraDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Build the create-issue payload.
 *
 * Pure and exported so the field mapping is unit-tested without touching Jira —
 * getting a custom field id wrong is the most likely failure here, and it is
 * the kind that only shows up as a 400 at runtime.
 *
 * The summary matches the convention already on the board (`Name – Course
 * (CODE)`, en-dash), because training staff read that column and a second
 * format would look like a different system wrote it.
 */
export function buildEnrollmentIssuePayload(
	projectKey: string,
	enrollment: EnrollmentIssueInput,
	now: Date
) {
	const course = findCourse(enrollment.course);
	if (!course) {
		throw new JiraError(`Unknown course code "${enrollment.course}"; refusing to file an issue`);
	}

	const rating = enrollment.submittedRating?.trim() || 'unknown';
	const descriptionLines = [
		`Submitted through training.flyindycenter.com by ${enrollment.submittedName} (CID ${enrollment.cid}).`,
		`VATSIM rating at time of enrollment: ${rating}.`
	];

	// Flagged, not blocked. The app's picture of someone's training is inferred
	// from the certifications it holds, and the student may simply be right — so
	// this is a note for whoever picks the request up, not a rejection.
	if (enrollment.suggestedCourse && enrollment.suggestedCourse !== enrollment.course) {
		const suggested = findCourse(enrollment.suggestedCourse);
		descriptionLines.push(
			`Note: based on their certifications we suggested ${
				suggested?.label ?? enrollment.suggestedCourse
			}, and they chose ${course.label} instead. Worth confirming placement.`
		);
	}

	const fields: Record<string, unknown> = {
		project: { key: projectKey },
		issuetype: { id: STUDENT_ENROLLMENT_ISSUE_TYPE_ID },
		summary: `${enrollment.submittedName} – ${course.label}`,
		description: adf(descriptionLines.join('\n')),

		[JIRA_FIELDS.cid]: enrollment.cid,
		[JIRA_FIELDS.name]: enrollment.submittedName,
		[JIRA_FIELDS.course]: { id: course.jiraOptionId },
		// Queue position is read off this date, so it is never left unset.
		[JIRA_FIELDS.waitlisted]: toJiraDate(now)
	};

	if (enrollment.availability) {
		fields[JIRA_FIELDS.availability] = adf(enrollment.availability);
	}

	if (enrollment.notificationPreference) {
		fields[JIRA_FIELDS.notificationPreference] = {
			id: JIRA_NOTIFICATION_OPTIONS[enrollment.notificationPreference]
		};
	}

	return { fields };
}

export type CreatedIssue = { id: string; key: string };

/** File the issue. Throws JiraError; callers record it and let the cron retry. */
export async function createEnrollmentIssue(
	config: JiraConfig,
	enrollment: EnrollmentIssueInput,
	now: Date = new Date()
): Promise<CreatedIssue> {
	return jiraRequest<CreatedIssue>(config, '/issue', {
		method: 'POST',
		body: buildEnrollmentIssuePayload(config.projectKey, enrollment, now)
	});
}

/** Leave a note on the issue — context a status change on its own cannot carry. */
export async function commentOnIssue(
	config: JiraConfig,
	issueKey: string,
	text: string
): Promise<void> {
	await jiraRequest(config, `/issue/${encodeURIComponent(issueKey)}/comment`, {
		method: 'POST',
		body: { body: adf(text) }
	});
}

/** The TRK status a student's own withdrawal moves the issue to. */
export const WITHDRAWN_STATUS = 'Withdrawn';

type JiraTransition = { id: string; name: string; to: { id: string; name: string } };

/**
 * Move an issue to a named status.
 *
 * Resolves the transition by its **target status name**, asking Jira what is
 * available, rather than hardcoding a transition id. The TRK workflow changed
 * twice during DEV-108 — a triage step disappeared and two statuses appeared —
 * so an id baked into this file is a latent bug waiting for the next edit. A
 * name that no longer exists fails loudly with the available options in the
 * message, which is a far better failure than silently firing the wrong
 * transition.
 *
 * Throws if the transition is not available from the issue's current status;
 * callers decide whether that is fatal.
 */
export async function transitionIssueToStatus(
	config: JiraConfig,
	issueKey: string,
	statusName: string
): Promise<void> {
	const path = `/issue/${encodeURIComponent(issueKey)}/transitions`;

	const { transitions } = await jiraRequest<{ transitions: JiraTransition[] }>(config, path, {
		method: 'GET'
	});

	const match = transitions.find(
		(transition) => transition.to.name.toLowerCase() === statusName.toLowerCase()
	);

	if (!match) {
		throw new JiraError(
			`No transition to "${statusName}" from ${issueKey}'s current status. Available: ` +
				(transitions.map((t) => t.to.name).join(', ') || '(none)')
		);
	}

	await jiraRequest(config, path, {
		method: 'POST',
		body: { transition: { id: match.id } }
	});
}

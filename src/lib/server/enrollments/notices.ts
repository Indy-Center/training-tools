import { SITE_URL } from '$lib/config';
import { findCourse } from '$lib/courses';
import type { Notice } from '$lib/server/notify';

/**
 * What the end of a course tells people, and when. Pure, so who is told what is
 * tested without Discord.
 *
 * Students and teachers are not told anything here yet: TRK's own notification
 * script does that for now (DEV-176). These are for the people who act next —
 * evaluators, and the training admins.
 */

/** Which notice, if any, a request arriving at a status gets. */
export type Announcement = 'exam-ready' | 'needs-catp' | 'awaiting-audit';

export function announcementFor(status: string): Announcement | null {
	switch (status) {
		case 'rating-exam':
			return 'exam-ready';
		case 'needs-catp':
			return 'needs-catp';
		case 'certification-update':
			return 'awaiting-audit';
		default:
			return null;
	}
}

/** A request as a notice describes it. */
export type NoticeRequest = {
	name: string;
	cid: string;
	course: string;
	/** TRK's `Teacher` value. */
	teacher: string | null;
	/** TRK's `RE Instructor` value. */
	examiner: string | null;
	issueKey: string | null;
	/** The TRK card, when Jira's address is known. */
	issueUrl: string | null;
};

function course(code: string): string {
	const found = findCourse(code);
	return found ? `${found.name} (${found.code})` : code;
}

function student(request: Pick<NoticeRequest, 'name' | 'cid'>): string {
	return `${request.name} (${request.cid})`;
}

function card(request: NoticeRequest): NonNullable<Notice['fields']> {
	if (!request.issueKey) return [];
	return [
		{
			label: 'TRK card',
			value: request.issueUrl ? `[${request.issueKey}](${request.issueUrl})` : request.issueKey
		}
	];
}

/**
 * A student is at Rating Exam with nobody to examine them yet. Goes to the
 * instructors' channel and pings the evaluators who could take it.
 */
export function examReadyNotice(
	request: NoticeRequest & { availability: string | null },
	evaluators: string[]
): Notice {
	return {
		audience: 'instructors',
		title: `Rating exam to claim: ${course(request.course)}`,
		summary: `${request.name} has finished training and needs an examiner. Claim it on Teach.`,
		link: `${SITE_URL}/teach`,
		mention: evaluators,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Taught by', value: request.teacher ?? 'not set' },
			...(request.availability ? [{ label: 'Availability', value: request.availability }] : []),
			...card(request)
		]
	};
}

/**
 * A card is at Needs CATP: the student needs corrective training before going
 * on. Reached from a rating exam that was not passed, or from In Training when
 * a teacher asks for one, so the wording does not assume an exam.
 */
export function needsCatpNotice(request: NoticeRequest): Notice {
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: `Needs CATP: ${request.name}`,
		summary:
			'The card is at Needs CATP. Decide on the corrective training, then return it to training on the board.',
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Taught by', value: request.teacher ?? 'not set' },
			...(request.examiner ? [{ label: 'Examined by', value: request.examiner }] : []),
			...card(request)
		]
	};
}

/** Training finished and the certification is applied: over to the TA. */
export function awaitingAuditNotice(request: NoticeRequest & { holds: string | null }): Notice {
	return {
		audience: 'training-admins',
		title: `Ready for audit: ${request.name}`,
		summary:
			'Training is complete and the certification has been applied. Review it and mark the audit complete.',
		link: `${SITE_URL}/admin/audit`,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Taught by', value: request.teacher ?? 'not set' },
			...(request.examiner ? [{ label: 'Examined by', value: request.examiner }] : []),
			{ label: 'Now holds', value: request.holds ?? 'no certification' },
			...card(request)
		]
	};
}

/**
 * A request has failed to reach the TRK board too many times, and the cron has
 * stopped trying. Nobody on the training staff can see it until it is fixed.
 */
export function stuckRequestNotice(
	request: Pick<NoticeRequest, 'name' | 'cid' | 'course'>,
	error: string,
	attempts: number
): Notice {
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: `Training request not on the TRK board: ${request.name}`,
		summary: `Filing it failed ${attempts} times, so it is no longer retried. Fix the cause, then retry it from the Admin page.`,
		link: `${SITE_URL}/admin`,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Last error', value: error }
		]
	};
}

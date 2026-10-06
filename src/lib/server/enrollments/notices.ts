import { SITE_URL } from '$lib/config';
import { findCourse } from '$lib/courses';
import { STATUS_LABELS } from '$lib/enrollment-status';
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
 * A student withdrew their own request. The card is commented on and moved, but
 * nobody is watching the board for that — and if they were in training, their
 * teacher has a slot back. `was` is the status they withdrew from.
 */
export function withdrawnNotice(request: NoticeRequest & { was: string }): Notice {
	const midCourse = request.was !== 'waitlist';

	return {
		audience: 'training-admins',
		tone: midCourse ? 'warning' : 'info',
		title: `Withdrawn: ${request.name}`,
		summary: `${request.name} withdrew from ${course(request.course)}.`,
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Was', value: STATUS_LABELS[request.was] ?? request.was },
			...(request.teacher ? [{ label: 'Teacher', value: request.teacher }] : []),
			...(request.examiner ? [{ label: 'Examiner', value: request.examiner }] : []),
			...card(request)
		]
	};
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
		title: `Rating exam recommended ${course(request.course)}`,
		summary: `${request.name} has finished training and needs a rating exam.`,
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

/** A rating exam was not passed: the card waits for the TA to plan more training. */
export function needsCatpNotice(
	request: NoticeRequest,
	// Needs CATP is also reached from In Training on the board, with no exam
	// behind it. Only a card that came from Rating Exam failed one.
	afterExam = true
): Notice {
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: afterExam ? `Rating exam failed: ${request.name}` : `Needs CATP: ${request.name}`,
		summary: afterExam
			? `${request.name} failed their rating exam.`
			: `${request.name} needs a corrective action training plan.`,
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Taught by', value: request.teacher ?? 'not set' },
			{ label: 'Examined by', value: request.examiner ?? 'not set' },
			...card(request)
		]
	};
}

/** Training finished and the certification is applied: over to the TA. */
export function awaitingAuditNotice(request: NoticeRequest & { holds: string | null }): Notice {
	return {
		audience: 'training-admins',
		title: `Ready for audit: ${request.name}`,
		summary: `${request.name} completed ${request.course}.`,
		link: `${SITE_URL}/admin/audit`,
		fields: [
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
		audience: 'tech-team',
		tone: 'warning',
		title: `Training enrollment not on the board: ${request.name}`,
		summary: `Filing it failed ${attempts} times, so it is no longer retried. Fix the cause, then retry it from the Admin page.`,
		link: `${SITE_URL}/admin`,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Last error', value: error }
		]
	};
}

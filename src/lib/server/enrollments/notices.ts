import { SITE_URL } from '$lib/config';
import { findCourse } from '$lib/courses';
import { NOTIFICATION_LABELS, STATUS_LABELS } from '$lib/enrollment-status';
import { formatCardDate } from '$lib/format';
import type { DirectNotice, Notice } from '$lib/server/notify';
import { academyDeadline, ACADEMY_COURSE_DAYS, type AcademyReminder } from '$lib/vatusa-reminders';

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

/** What the exam post says while nobody has claimed it. */
export const EXAM_WAITING = 'Waiting for an examiner';

/**
 * Where a rating exam stands, for its post in the instructors' channel: the
 * line it shows while the exam is open, or null once it is over — passed, not
 * passed, withdrawn or sent back — when the post is removed.
 *
 * `examiner` is whoever claimed it, as they should be named.
 */
export function examStatus(request: {
	status: string;
	withdrawn: boolean;
	examiner: string | null;
}): string | null {
	if (request.withdrawn || request.status !== 'rating-exam') return null;
	return request.examiner?.trim() ? `Claimed by ${request.examiner.trim()}` : EXAM_WAITING;
}

/**
 * A student is at Rating Exam. Goes to the instructors' channel, pings the
 * evaluators who could take it, and is kept up to date with `status` until the
 * exam is over.
 */
export function examReadyNotice(
	request: NoticeRequest & { availability: string | null },
	evaluators: string[],
	status: string = EXAM_WAITING
): Notice {
	return {
		audience: 'instructors',
		title: `Rating exam recommended ${course(request.course)}`,
		summary: `${request.name} has finished training and needs a rating exam.`,
		link: `${SITE_URL}/teach`,
		mention: evaluators,
		buttons: [{ label: 'Open Teach', url: `${SITE_URL}/teach` }],
		fields: [
			{ label: 'Status', value: status },
			{ label: 'Student', value: student(request) },
			{ label: 'Taught by', value: request.teacher ?? 'not set' },
			...(request.availability ? [{ label: 'Availability', value: request.availability }] : [])
			// No TRK card: the people this goes to have no access to the board.
		]
	};
}

/**
 * A card is at Needs CATP: the student needs corrective training before going
 * on. Reached from a rating exam that was not passed, or from In Training when
 * a teacher asks for one, so it only says an exam was failed when told so.
 */
export function needsCatpNotice(
	request: NoticeRequest,
	// Only a card that came from Rating Exam failed one.
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
 * A card is at Certification Update without the fields that show the course was
 * finished, so nothing has been granted. Somebody has to look at the card.
 */
export function certificationHeldNotice(request: NoticeRequest, missing: string[]): Notice {
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: `Certification not applied: ${request.name}`,
		summary:
			'The card is at Audit but is missing what shows the course was finished, so nothing has been granted. Fill it in on the card, or move the card back if it is there by mistake.',
		link: request.issueUrl ?? `${SITE_URL}/admin/audit`,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			{ label: 'Missing on the card', value: missing.join(', ') },
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

/**
 * Someone has enrolled through the form. Sent as they submit, whether or not
 * the card has reached the TRK board yet: a card that has not is filed by the
 * cron, and the training admins hear separately if that keeps failing.
 *
 * Not sent for a card staff file by hand on the board — they already know.
 */
export function newEnrollmentNotice(
	request: NoticeRequest & {
		rating: string | null;
		availability: string | null;
		notificationPreference: string | null;
	}
): Notice {
	const contact = request.notificationPreference
		? (NOTIFICATION_LABELS[request.notificationPreference as keyof typeof NOTIFICATION_LABELS] ??
			request.notificationPreference)
		: null;

	return {
		audience: 'training-admins',
		title: `New enrollment: ${request.name}`,
		summary: `${request.name} has enrolled in ${course(request.course)} and is on the waitlist.`,
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Course', value: course(request.course) },
			...(request.rating ? [{ label: 'Rating', value: request.rating }] : []),
			...(contact ? [{ label: 'Contact by', value: contact }] : []),
			...(request.availability ? [{ label: 'Availability', value: request.availability }] : []),
			...(request.issueKey
				? card(request)
				: [{ label: 'TRK card', value: 'Not on the board yet. It is filed automatically.' }])
		]
	};
}

/** Where a student takes the course. */
const ACADEMY_URL = 'https://academy.vatusa.net';

/** "October 31, 2026", or a plain phrase when the card's date cannot be read. */
function deadline(assignedOn: string): string {
	const date = academyDeadline(assignedOn);
	return date ? formatCardDate(date, 'long') : `${ACADEMY_COURSE_DAYS} days after it was assigned`;
}

/**
 * What a student is told about their VATUSA Academy course, privately: when it
 * is assigned, as the 30 days run down, and when they are up.
 */
export function vatusaReminderMessage(
	reminder: AcademyReminder,
	request: { course: string; assignedOn: string }
): DirectNotice {
	const forCourse = course(request.course);
	const by = deadline(request.assignedOn);

	switch (reminder) {
		case 'assigned':
			return {
				title: 'Your VATUSA Academy course has been assigned',
				summary: `Your VATUSA Academy course for ${forCourse} is ready. You have ${ACADEMY_COURSE_DAYS} days to complete it: by ${by}.`,
				link: ACADEMY_URL
			};
		case '22-days-left':
		case '16-days-left': {
			const days = reminder === '22-days-left' ? 22 : 16;
			return {
				title: `${days} days left on your VATUSA Academy course`,
				summary: `Your VATUSA Academy course for ${forCourse} needs to be completed by ${by}.`,
				link: ACADEMY_URL
			};
		}
		case 'expired':
			return {
				tone: 'warning',
				title: 'Your VATUSA Academy course is overdue',
				summary: `The ${ACADEMY_COURSE_DAYS} days to complete your VATUSA Academy course for ${forCourse} ended on ${by}. Please contact the training staff.`,
				link: ACADEMY_URL
			};
	}
}

/** The time is up and the course is not passed: the training admins decide what happens. */
export function vatusaOverdueNotice(request: NoticeRequest & { assignedOn: string }): Notice {
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: `VATUSA course overdue: ${request.name}`,
		summary: `${request.name} has not passed the VATUSA Academy course for ${course(request.course)} within ${ACADEMY_COURSE_DAYS} days.`,
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Assigned', value: formatCardDate(request.assignedOn, 'long') },
			{ label: 'Due', value: deadline(request.assignedOn) },
			...card(request)
		]
	};
}

/** A reminder that could not go to the student, because we hold no Discord ID for them. */
export function vatusaUndeliveredNotice(
	reminder: AcademyReminder,
	request: NoticeRequest & { assignedOn: string }
): Notice {
	const message = vatusaReminderMessage(reminder, request);
	return {
		audience: 'training-admins',
		title: `Could not message ${request.name} about their VATUSA course`,
		summary: `We hold no Discord ID for ${request.name}, so this was not sent. Please pass it on another way.`,
		link: request.issueUrl ?? undefined,
		fields: [
			{ label: 'Student', value: student(request) },
			{ label: 'Message', value: `${message.title}. ${message.summary}` },
			...card(request)
		]
	};
}

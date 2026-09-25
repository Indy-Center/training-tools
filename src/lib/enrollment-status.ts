/**
 * How an enrollment's status reads to the student.
 *
 * Shared by `/` and `/enroll`, so the two pages cannot describe the same
 * request differently. Not under `$lib/server/` — both pages render it.
 *
 * Mirrors the TRK workflow, which a student sees in their own terms. See
 * `ENROLLMENT_STATUSES` in `$lib/db/schema/enrollments.ts`.
 */
import type { EnrollmentStatus, NotificationPreference } from '$lib/db/schema/enrollments';

/** How each contact option reads. The enroll form's radios and `/stats` both use these. */
export const NOTIFICATION_LABELS: Record<NotificationPreference, string> = {
	discord: 'Discord message',
	email: 'Email'
};

export const STATUS_LABELS: Record<string, string> = {
	waitlist: 'On the waitlist',
	'in-training': 'In training',
	'rating-exam': 'Rating exam',
	'certification-update': 'Updating your certificate',
	completed: 'Completed',
	removed: 'Removed from the waitlist',
	withdrawn: 'Withdrawn'
} satisfies Record<EnrollmentStatus, string>;

type StatusColor = 'yellow' | 'sky' | 'green' | 'gray';

export const STATUS_COLORS: Record<string, StatusColor> = {
	waitlist: 'yellow',
	'in-training': 'sky',
	'rating-exam': 'sky',
	'certification-update': 'sky',
	completed: 'green',
	removed: 'gray',
	withdrawn: 'gray'
} satisfies Record<EnrollmentStatus, StatusColor>;

/** One line on what happens next. Waitlist is left blank: the page shows the queue instead. */
export const STATUS_DETAIL: Record<string, string> = {
	waitlist: '',
	'in-training': 'You have a mentor assigned. They will arrange sessions with you directly.',
	'rating-exam':
		'Your training is done and your rating exam is being arranged. An Instructor will contact you to schedule.',
	'certification-update':
		'You passed — your certificate is being updated and reviewed. Complete your consolidation hours as required by the Training Policy.',
	completed: 'Complete the consolidation hours and enroll in the next course.',
	'completed-c1': 'Great work! You are fully qualified. Check out some other optional courses.',
	removed: 'Your enrolment was cancled. Contact the training staff.'
};

export const STATUS_DETAIL_FALLBACK = 'Training staff will reach out with next steps.';

export function statusDetail(status: string | null | undefined): string {
	return STATUS_DETAIL[status ?? ''] ?? STATUS_DETAIL_FALLBACK;
}

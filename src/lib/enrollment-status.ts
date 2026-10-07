/**
 * How an enrollment's status is labelled, wherever one is listed.
 *
 * Shared by `/`, `/teach` and `/teachers/{cid}`, so no two pages name the same
 * status differently. Not under `$lib/server/` — pages render it. What each
 * status *means* for the student is copy, in `$lib/content/training/`.
 *
 * Mirrors the TRK workflow, which a student sees in their own terms. See
 * `ENROLLMENT_STATUSES` in `$lib/db/schema/enrollments.ts`.
 */
import type { EnrollmentStatus, NotificationPreference } from '$lib/db/schema/enrollments';

/** How each contact option reads. The enroll form's radios, `/` and `/waitlist` all use these. */
export const NOTIFICATION_LABELS: Record<NotificationPreference, string> = {
	discord: 'Discord message',
	email: 'Email'
};

export const STATUS_LABELS: Record<string, string> = {
	waitlist: 'On the waitlist',
	'in-training': 'In training',
	'rating-exam': 'Rating exam',
	'needs-catp': 'Needs CATP',
	'certification-update': 'Being audited',
	completed: 'Completed',
	removed: 'Removed from the waitlist',
	withdrawn: 'Withdrawn'
} satisfies Record<EnrollmentStatus, string>;

type StatusColor = 'yellow' | 'sky' | 'orange' | 'green' | 'gray';

export const STATUS_COLORS: Record<string, StatusColor> = {
	waitlist: 'yellow',
	'in-training': 'sky',
	'rating-exam': 'sky',
	'needs-catp': 'orange',
	'certification-update': 'sky',
	completed: 'green',
	removed: 'gray',
	withdrawn: 'gray'
} satisfies Record<EnrollmentStatus, StatusColor>;

/** How a contact preference reads, or a dash when none was given. */
export function notificationLabel(preference: string | null | undefined): string {
	if (!preference) return '—';
	return NOTIFICATION_LABELS[preference as NotificationPreference] ?? preference;
}

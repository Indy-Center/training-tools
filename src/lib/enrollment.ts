import { isCourseCode, type CourseCode } from '$lib/courses';
import { NOTIFICATION_PREFERENCES, type NotificationPreference } from '$lib/db/schema/enrollments';

/**
 * Validation for the enrollment form.
 *
 * Pure, like `training-flow.ts`, so the rules are testable without a database,
 * a session or a form submission. The route calls this; the browser's own
 * `required` attributes are a convenience, not the enforcement.
 */

/** Long enough for "weeknights after 7pm eastern, most weekends", short enough to stay a Jira field. */
export const AVAILABILITY_MAX_LENGTH = 1000;

export type EnrollmentInput = {
	course?: unknown;
	notificationPreference?: unknown;
	availability?: unknown;
};

export type EnrollmentValues = {
	course: CourseCode;
	notificationPreference: NotificationPreference;
	availability: string;
};

export type EnrollmentErrors = Partial<Record<keyof EnrollmentValues, string>>;

export type EnrollmentValidation =
	{ ok: true; values: EnrollmentValues } | { ok: false; errors: EnrollmentErrors };

function isNotificationPreference(value: unknown): value is NotificationPreference {
	return (
		typeof value === 'string' && (NOTIFICATION_PREFERENCES as readonly string[]).includes(value)
	);
}

export function validateEnrollment(input: EnrollmentInput): EnrollmentValidation {
	const errors: EnrollmentErrors = {};

	if (!isCourseCode(input.course)) {
		errors.course = 'Choose the course you want to train for.';
	}

	if (!isNotificationPreference(input.notificationPreference)) {
		errors.notificationPreference = 'Choose how training staff should contact you.';
	}

	const availability = typeof input.availability === 'string' ? input.availability.trim() : '';
	if (!availability) {
		errors.availability = 'Tell us roughly when you are available to train.';
	} else if (availability.length > AVAILABILITY_MAX_LENGTH) {
		errors.availability = `Keep this under ${AVAILABILITY_MAX_LENGTH} characters.`;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };

	return {
		ok: true,
		values: {
			course: input.course as CourseCode,
			notificationPreference: input.notificationPreference as NotificationPreference,
			availability
		}
	};
}

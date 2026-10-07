/**
 * When a student is reminded about their VATUSA Academy course.
 *
 * They have 30 days from the day it is assigned. They are told when it is
 * assigned, again with 22 and with 16 days left, and once more when the time is
 * up. Pure: the sending is in `$lib/server/enrollments/reminders.ts`.
 *
 * Dates are whole days as the TRK card holds them (`YYYY-MM-DD`, facility
 * time), so "22 days left" does not depend on the hour the cron happens to run.
 */

/** Days a student has to complete the course once it is assigned. */
export const ACADEMY_COURSE_DAYS = 30;

/** In the order they are sent. */
export const ACADEMY_REMINDERS = ['assigned', '22-days-left', '16-days-left', 'expired'] as const;
export type AcademyReminder = (typeof ACADEMY_REMINDERS)[number];

/** Days left at which each reminder becomes due, latest first. */
const DUE_AT: readonly [AcademyReminder, number][] = [
	['expired', 0],
	['16-days-left', 16],
	['22-days-left', 22],
	['assigned', ACADEMY_COURSE_DAYS]
];

const MS_PER_DAY = 86_400_000;

/** A card date as a day count, or null when it is not a real date. */
function dayNumber(date: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
	if (!match) return null;
	const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(time) ? null : Math.round(time / MS_PER_DAY);
}

/** Days left to complete the course; zero or less once the time is up. */
export function academyDaysLeft(assignedOn: string, today: string): number | null {
	const assigned = dayNumber(assignedOn);
	const now = dayNumber(today);
	if (assigned === null || now === null) return null;
	return ACADEMY_COURSE_DAYS - (now - assigned);
}

/** The last day to complete the course, as a card date. */
export function academyDeadline(assignedOn: string): string | null {
	const assigned = dayNumber(assignedOn);
	if (assigned === null) return null;
	return new Date((assigned + ACADEMY_COURSE_DAYS) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The reminder that fits how long is left today. */
export function reminderDue(assignedOn: string, today: string): AcademyReminder | null {
	const left = academyDaysLeft(assignedOn, today);
	if (left === null) return null;
	return DUE_AT.find(([, at]) => left <= at)?.[0] ?? null;
}

/**
 * The reminder to send now, or null when they have had it already.
 *
 * Only ever the one that fits today: after an outage, or for a course assigned
 * on the board some days ago, the student gets the current reminder and not a
 * run of the ones they missed.
 */
export function reminderToSend(
	assignedOn: string,
	today: string,
	lastSent: string | null
): AcademyReminder | null {
	const due = reminderDue(assignedOn, today);
	if (!due) return null;

	const sent = ACADEMY_REMINDERS.indexOf(lastSent as AcademyReminder);
	return ACADEMY_REMINDERS.indexOf(due) > sent ? due : null;
}

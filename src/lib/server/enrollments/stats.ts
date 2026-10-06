import { and, count, inArray, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { COURSES, type CourseCode, type WeeksRange } from '$lib/courses';
import { enrollmentsTable, type EnrollmentStatus } from '$lib/db/schema/enrollments';

/**
 * Per-course counts for `/waitlist` (DEV-111).
 *
 * **Only what is true right now.** Nothing records when a student moved between
 * stages, so there is no measured rate to show — how fast the queue moves, how
 * long training really took. Rather than dress a guess up as a statistic, this
 * reports current headcounts, and the page pairs them with each course's
 * configured `estimatedWeeks`, labelled as an estimate. See
 * decisions/0015-waitlist-stats-without-measured-rates.md
 *
 * Counted from D1, the same source as the home page's "N ahead of you", so the
 * two pages cannot disagree. Hand-filed TRK issues are included because
 * `importBoardIssues()` gives them rows.
 */

/**
 * Statuses that count as "in training": the stages that occupy a mentor or an
 * instructor. `certification-update` is left out — they have passed, and are
 * waiting on paperwork, not on anyone's time. `needs-catp` is in: they did not
 * pass, and are going back into training.
 */
export const IN_TRAINING_STATUSES = [
	'in-training',
	'rating-exam',
	'needs-catp'
] as const satisfies readonly EnrollmentStatus[];

const COUNTED_STATUSES = ['waitlist', ...IN_TRAINING_STATUSES] as const;

export type CourseWaitlist = {
	code: CourseCode;
	label: string;
	waiting: number;
	inTraining: number;
	estimatedWeeks: WeeksRange | null;
};

export type StatusCount = { course: string; status: string; count: number };

/**
 * Fold grouped counts into one entry per course, in catalogue order. Courses
 * with nobody in them still appear, as zeros — "nobody is waiting" is the
 * answer someone deciding whether to enroll wants to see. A course nobody can
 * enroll in (`boardOnly`) is the exception: it is listed only while in use.
 */
export function summariseWaitlist(rows: readonly StatusCount[]): CourseWaitlist[] {
	return COURSES.flatMap((course) => {
		const forCourse = rows.filter((row) => row.course === course.code);
		const total = (statuses: readonly string[]) =>
			forCourse
				.filter((row) => statuses.includes(row.status))
				.reduce((sum, row) => sum + Number(row.count), 0);

		const entry = {
			code: course.code,
			label: course.label,
			waiting: total(['waitlist']),
			inTraining: total(IN_TRAINING_STATUSES),
			estimatedWeeks: course.estimatedWeeks
		};

		const unused = entry.waiting + entry.inTraining === 0;
		return 'boardOnly' in course && course.boardOnly && unused ? [] : [entry];
	});
}

/** One grouped query: three bound parameters, whatever the size of the queue. */
export async function getWaitlistStats(db: Database): Promise<CourseWaitlist[]> {
	const rows = await db
		.select({
			course: enrollmentsTable.course,
			status: enrollmentsTable.status,
			count: count()
		})
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...COUNTED_STATUSES]),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		.groupBy(enrollmentsTable.course, enrollmentsTable.status);

	return summariseWaitlist(rows);
}

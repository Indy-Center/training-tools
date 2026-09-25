/**
 * The training courses a controller can enroll in.
 *
 * Not under `$lib/server/` on purpose — the enrollment form renders these.
 *
 * `label` and `jiraOptionId` mirror the `Course of Training` select on the
 * `Student Enrollment` issue type in Jira project TRK, read on 2026-09-20. The
 * label has to match Jira's option value character for character, because it is
 * also what goes in the issue summary.
 *
 * Code, label and Jira option id live together in one record deliberately.
 * Course content is eventually generated from a repo of markdown, which will
 * mean creating new options on the Jira select rather than choosing from a
 * fixed six; keeping the mapping in one shape gives that generator one place to
 * write instead of two modules to keep in step.
 *
 * See .ai/research/jira-student-tracking.md
 */
export type CourseCode = (typeof COURSES)[number]['code'];

/** Inclusive, in whole weeks. */
export type WeeksRange = { min: number; max: number };

export type Course = {
	/** Short code, used as the stored value and in the UI. */
	code: string;
	/** Human name without the code suffix. */
	name: string;
	/** Exactly Jira's option value, e.g. "Simple Ground Control (S-GC)". */
	label: string;
	/** Option id on Jira's `Course of Training` custom field. */
	jiraOptionId: string;
	/** One line of orientation on the form. */
	description: string;
	/**
	 * How long the course takes once training starts. Shown on `/stats`; null
	 * renders as "not estimated yet" rather than a guess.
	 *
	 * **An estimate, not a measurement.** Nothing records when students move
	 * between stages, so this is not derived from how long training has actually
	 * taken. The starting values assume one lesson a week: `min` is the course's
	 * lesson count, and `max` adds 20% for missed weeks and repeated lessons,
	 * rounded up. Training staff own these numbers.
	 *
	 * See .ai/decisions/0015-waitlist-stats-without-measured-rates.md
	 */
	estimatedWeeks: WeeksRange | null;
};

export const COURSES = [
	{
		code: 'S-GC',
		name: 'Simple Ground Control',
		label: 'Simple Ground Control (S-GC)',
		jiraOptionId: '10088',
		description:
			'Clearance delivery at all airports and ground control at our designated simple fields.',
		// 8 lessons.
		estimatedWeeks: { min: 8, max: 10 }
	},
	{
		code: 'A-GC',
		name: 'Advanced Ground Control',
		label: 'Advanced Ground Control (A-GC)',
		jiraOptionId: '10091',
		description: 'Ground control at Indianapolis and our busier fields.',
		// 2 lessons.
		estimatedWeeks: { min: 2, max: 3 }
	},
	{
		code: 'S-LC',
		name: 'Simple Local Control',
		label: 'Simple Local Control (S-LC)',
		jiraOptionId: '10092',
		description: 'Local control at our simpler fields.',
		// 3 lessons.
		estimatedWeeks: { min: 3, max: 4 }
	},
	{
		code: 'A-LC',
		name: 'Advanced Local Control',
		label: 'Advanced Local Control (A-LC)',
		jiraOptionId: '10093',
		description: 'Local control at more complex airports.',
		// 3 lessons.
		estimatedWeeks: { min: 3, max: 4 }
	},
	{
		code: 'T-RC',
		name: 'Terminal Radar Control',
		label: 'Terminal Radar Control (T-RC)',
		jiraOptionId: '10094',
		description: 'Approach and departure control in our terminal airspace.',
		// 8 lessons.
		estimatedWeeks: { min: 8, max: 10 }
	},
	{
		code: 'E-RC',
		name: 'Enroute Radar Control',
		label: 'Enroute Radar Control (E-RC)',
		jiraOptionId: '10095',
		description: 'Enroute control on Indianapolis Center sectors.',
		// 8 lessons.
		estimatedWeeks: { min: 8, max: 10 }
	}
] as const satisfies readonly Course[];

export const COURSE_CODES = COURSES.map((course) => course.code) as [CourseCode, ...CourseCode[]];

export function findCourse(code: string): Course | undefined {
	return COURSES.find((course) => course.code === code);
}

/** The course whose `Course of Training` option has this id, if any. */
export function findCourseByJiraOptionId(id: string | null | undefined): Course | undefined {
	return id ? COURSES.find((course) => course.jiraOptionId === id) : undefined;
}

export function isCourseCode(value: unknown): value is CourseCode {
	return typeof value === 'string' && COURSES.some((course) => course.code === value);
}

/** "8–10 weeks", or null when there is no estimate. */
export function formatWeeksRange(range: WeeksRange | null): string | null {
	if (!range) return null;
	const unit = range.max === 1 ? 'week' : 'weeks';
	return range.min === range.max ? `${range.min} ${unit}` : `${range.min}–${range.max} ${unit}`;
}

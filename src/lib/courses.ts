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
};

export const COURSES = [
	{
		code: 'S-GC',
		name: 'Simple Ground Control',
		label: 'Simple Ground Control (S-GC)',
		jiraOptionId: '10088',
		description: 'Clearance delivery and ground control at our simpler fields.'
	},
	{
		code: 'A-GC',
		name: 'Advanced Ground Control',
		label: 'Advanced Ground Control (A-GC)',
		jiraOptionId: '10091',
		description: 'Ground control at Indianapolis and our busier terminal fields.'
	},
	{
		code: 'S-LC',
		name: 'Simple Local Control',
		label: 'Simple Local Control (S-LC)',
		jiraOptionId: '10092',
		description: 'Tower and local control at our simpler fields.'
	},
	{
		code: 'A-LC',
		name: 'Advanced Local Control',
		label: 'Advanced Local Control (A-LC)',
		jiraOptionId: '10093',
		description: 'Tower and local control at Indianapolis and our busier fields.'
	},
	{
		code: 'T-RC',
		name: 'Terminal Radar Control',
		label: 'Terminal Radar Control (T-RC)',
		jiraOptionId: '10094',
		description: 'Approach and departure control in our terminal airspace.'
	},
	{
		code: 'E-RC',
		name: 'Enroute Radar Control',
		label: 'Enroute Radar Control (E-RC)',
		jiraOptionId: '10095',
		description: 'Enroute control on Indy Center sectors.'
	}
] as const satisfies readonly Course[];

export const COURSE_CODES = COURSES.map((course) => course.code) as [CourseCode, ...CourseCode[]];

export function findCourse(code: string): Course | undefined {
	return COURSES.find((course) => course.code === code);
}

export function isCourseCode(value: unknown): value is CourseCode {
	return typeof value === 'string' && COURSES.some((course) => course.code === value);
}

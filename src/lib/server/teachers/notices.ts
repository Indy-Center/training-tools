import { SITE_URL } from '$lib/config';
import type { Notice } from '$lib/server/notify';
import {
	QUALIFICATION_LEVEL_LABELS,
	TEACHER_STATUS_LABELS,
	type QualificationLevel,
	type TeacherStatus
} from '$lib/teachers';

/**
 * What training admins are told about teacher changes. Pure, so who gets told
 * what is tested without Discord.
 */

export type ProfileChange =
	| { field: 'availability'; from: string | null; to: string | null }
	| { field: 'message'; from: string | null; to: string | null }
	| { field: 'slots'; from: number | null; to: number | null }
	| { field: 'initials'; from: string | null; to: string | null }
	| { field: 'status'; from: TeacherStatus; to: TeacherStatus };

export type AssignedStudent = { name: string; course: string; status: string };

function findChange<F extends ProfileChange['field']>(
	changes: readonly ProfileChange[],
	field: F
): Extract<ProfileChange, { field: F }> | undefined {
	return changes.find(
		(change): change is Extract<ProfileChange, { field: F }> => change.field === field
	);
}

function describeSlots(value: number | null): string {
	return value === null ? 'not set' : String(value);
}

/**
 * Availability and slot changes, for the training admins' information. Null
 * when neither changed — initials and status are not this notice's business.
 *
 * Shows what each is **now**, not what it was: the old value is on the
 * teacher's timeline for anyone who wants it.
 */
export function capacityNotice(input: {
	teacher: string;
	changedBy: string;
	changes: readonly ProfileChange[];
}): Notice | null {
	const slots = findChange(input.changes, 'slots');
	const availability = findChange(input.changes, 'availability');
	if (!slots && !availability) return null;

	const what = [availability && 'availability', slots && 'student slots']
		.filter(Boolean)
		.join(' and ');

	const fields: Notice['fields'] = [
		{ label: 'Teacher', value: input.teacher },
		{ label: 'Changed by', value: input.changedBy }
	];
	if (slots) {
		fields.push({ label: 'Student slots', value: describeSlots(slots.to) });
	}
	if (availability) {
		fields.push({ label: 'Availability', value: availability.to ?? 'not set' });
	}

	return {
		audience: 'training-admins',
		title: `Teacher ${what} updated`,
		summary: `${input.teacher}'s ${what} changed.`,
		fields
	};
}

/**
 * A status change, when training admins need to hear about it:
 *
 * - **always** when it was changed automatically, since no admin made it;
 * - **as a warning** when a teacher goes on LOA with students still assigned,
 *   however it happened — those students need a plan.
 *
 * A manual change with nobody assigned is the admin's own doing, and says
 * nothing they do not already know. Null then.
 */
export function statusNotice(input: {
	teacher: string;
	from: TeacherStatus;
	to: TeacherStatus;
	automatic: boolean;
	assigned: readonly AssignedStudent[];
}): Notice | null {
	if (input.from === input.to) return null;

	const stranded = input.to === 'loa' && input.assigned.length > 0;
	if (!input.automatic && !stranded) return null;

	const fields: Notice['fields'] = [
		{ label: 'Teacher', value: input.teacher },
		{
			label: 'Status',
			value: `${TEACHER_STATUS_LABELS[input.from]} → ${TEACHER_STATUS_LABELS[input.to]}`
		},
		{ label: 'Changed', value: input.automatic ? 'Automatically' : 'By a training admin' }
	];

	if (stranded) {
		fields.push({
			label: `Students assigned (${input.assigned.length})`,
			value: input.assigned
				.map((student) => `${student.name} — ${student.course} (${student.status})`)
				.join('\n')
		});
	}

	return {
		audience: 'training-admins',
		tone: stranded ? 'warning' : 'info',
		title: stranded
			? `${input.teacher} is going on LOA with students assigned`
			: `${input.teacher}'s teacher status changed`,
		summary: stranded
			? 'These students are assigned to a teacher on LOA.'
			: 'This was changed automatically, not by a person.',
		fields
	};
}

/**
 * A teacher has come off the teacher roster — they no longer hold ZID:INS or
 * ZID:MTR on VATUSA — while students are still assigned to them. The same
 * problem as going on LOA with students, except nobody chose it. Null when
 * they had no students: leaving is then only a line on their timeline.
 */
export function leftRosterNotice(input: {
	teacher: string;
	assigned: readonly AssignedStudent[];
}): Notice | null {
	if (input.assigned.length === 0) return null;

	return {
		audience: 'training-admins',
		tone: 'warning',
		title: `${input.teacher} has left the teacher roster with students assigned`,
		summary: 'These students are assigned to a teacher who is no longer available.',
		fields: [
			{ label: 'Teacher', value: input.teacher },
			{
				label: `Students assigned (${input.assigned.length})`,
				value: input.assigned
					.map((student) => `${student.name} — ${student.course} (${student.status})`)
					.join('\n')
			}
		]
	};
}

/** A qualification the cron changed on its own, as the notice describes it. */
export type AutomaticQualificationChange = {
	teacher: string;
	code: string;
	from: QualificationLevel;
	/** Null when the qualification ended outright. */
	to: QualificationLevel | null;
	reason: string;
};

/**
 * Qualifications the cron lowered or ended this run: an evaluator who no longer
 * meets the rules, or someone off the teacher roster for six months. One notice
 * for the run, grouped by teacher. Null when there were none.
 */
export function qualificationChangesNotice(
	changes: readonly AutomaticQualificationChange[]
): Notice | null {
	if (changes.length === 0) return null;

	const byTeacher = new Map<string, AutomaticQualificationChange[]>();
	for (const change of changes) {
		const list = byTeacher.get(change.teacher);
		if (list) list.push(change);
		else byTeacher.set(change.teacher, [change]);
	}

	return {
		audience: 'training-admins',
		title: 'Teacher qualifications changed automatically',
		summary: 'These no longer met the rules, so they were lowered or ended.',
		link: `${SITE_URL}/teachers`,
		fields: [...byTeacher].map(([teacher, list]) => ({
			label: teacher,
			value: list
				.map((change) => {
					const to = change.to ? QUALIFICATION_LEVEL_LABELS[change.to] : 'ended';
					return `${change.code}: ${QUALIFICATION_LEVEL_LABELS[change.from]} → ${to}. ${change.reason}`;
				})
				.join('\n')
		}))
	};
}

export type TeacherDropdownDrift = {
	teacher: { add: string[]; remove: string[]; rename: { from: string; to: string }[] };
	reInstructor: { add: string[]; remove: string[]; rename: { from: string; to: string }[] };
};

const DROPDOWN_LABELS: Record<keyof TeacherDropdownDrift, string> = {
	teacher: 'Teacher',
	reInstructor: 'RE Instructor'
};

/** One line per kind of change, for one dropdown. */
export function describeDrift(drift: TeacherDropdownDrift[keyof TeacherDropdownDrift]): string[] {
	return [
		drift.add.length > 0 ? `Add: ${drift.add.join(', ')}` : null,
		drift.remove.length > 0 ? `Remove or disable: ${drift.remove.join(', ')}` : null,
		...drift.rename.map((rename) => `Rename: ${rename.from} → ${rename.to}`)
	].filter((line): line is string => line !== null);
}

/**
 * TRK's dropdowns no longer match the teacher roster. A request for an admin to
 * edit them by hand, because Jira cannot be edited from here for a
 * team-managed project. Null when there is nothing to change.
 */
export function dropdownNotice(drift: TeacherDropdownDrift): Notice | null {
	const fields = (Object.keys(DROPDOWN_LABELS) as (keyof TeacherDropdownDrift)[])
		.map((key) => ({
			label: `${DROPDOWN_LABELS[key]} dropdown`,
			value: describeDrift(drift[key]).join('\n')
		}))
		.filter((field) => field.value !== '');
	if (fields.length === 0) return null;

	return {
		audience: 'tech-team',
		tone: 'warning',
		title: "TRK's teacher dropdowns need updating",
		summary:
			"The teacher roster changed, and TRK's Teacher or RE Instructor dropdown no longer matches it. Jira can't be edited automatically for this project, so please make these changes by hand on the Student Enrollment issue type. The /teachers page shows the same list.",
		fields
	};
}

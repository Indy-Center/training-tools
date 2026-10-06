import { jiraRequest, type JiraConfig } from './client';
import { STUDENT_ENROLLMENT_ISSUE_TYPE_ID } from './enrollment';
import { RE_INSTRUCTOR_FIELD, TEACHER_FIELD } from './status';

/**
 * TRK's `Teacher` and `RE Instructor` dropdowns, compared with the teacher
 * roster.
 *
 * **Read-only by necessity.** TRK is a team-managed ("next-gen") project, and
 * Jira has no supported API for editing a team-managed field's options — the
 * field-context endpoints answer "The custom field was not found" for these
 * fields (verified 2026-09-30, with an account that does hold Administer
 * Jira). So the app works out what the dropdowns *should* offer and tells
 * training admins what to change; an admin makes the edit in Jira by hand.
 *
 * The options themselves are readable through the issue create metadata,
 * which is what this does.
 *
 * See decisions/0017-teacher-roster-and-qualifications.md
 */

export const TEACHER_DROPDOWNS = {
	teacher: { fieldId: TEACHER_FIELD, label: 'Teacher' },
	reInstructor: { fieldId: RE_INSTRUCTOR_FIELD, label: 'RE Instructor' }
} as const;
export type TeacherDropdown = keyof typeof TEACHER_DROPDOWNS;

type CreateMetaField = {
	fieldId?: string;
	allowedValues?: { id?: string; value?: string; disabled?: boolean | null }[];
};

type CreateMetaPage = {
	fields?: CreateMetaField[];
	values?: CreateMetaField[];
	startAt?: number;
	maxResults?: number;
	total?: number;
	isLast?: boolean;
};

/** Guards the loop below; the issue type has a few dozen fields. */
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

/** The values each dropdown offers today. */
export async function fetchTeacherDropdownOptions(
	config: JiraConfig
): Promise<Record<TeacherDropdown, string[]>> {
	const wanted = new Map<string, TeacherDropdown>(
		Object.entries(TEACHER_DROPDOWNS).map(([key, dropdown]) => [
			dropdown.fieldId,
			key as TeacherDropdown
		])
	);
	const found: Partial<Record<TeacherDropdown, string[]>> = {};

	for (let page = 0, startAt = 0; page < MAX_PAGES; page += 1) {
		const response = await jiraRequest<CreateMetaPage>(
			config,
			`/issue/createmeta/${encodeURIComponent(config.projectKey)}/issuetypes/${STUDENT_ENROLLMENT_ISSUE_TYPE_ID}?startAt=${startAt}&maxResults=${PAGE_SIZE}`,
			{ method: 'GET' }
		);
		const fields = response.fields ?? response.values ?? [];

		for (const field of fields) {
			const key = field.fieldId ? wanted.get(field.fieldId) : undefined;
			if (!key) continue;
			found[key] = (field.allowedValues ?? [])
				.filter((option) => option.disabled !== true)
				.map((option) => option.value?.trim() ?? '')
				.filter(Boolean);
		}

		startAt += fields.length;
		const done =
			response.isLast === true ||
			fields.length === 0 ||
			(response.total !== undefined && startAt >= response.total);
		if (done) break;
	}

	for (const [key, dropdown] of Object.entries(TEACHER_DROPDOWNS)) {
		if (!found[key as TeacherDropdown]) {
			// Missing means the field was renamed, deleted or moved — every
			// "add" we reported would be wrong. Fail rather than guess.
			throw new Error(`TRK create metadata has no ${dropdown.label} field (${dropdown.fieldId})`);
		}
	}

	return found as Record<TeacherDropdown, string[]>;
}

export type DropdownDrift = {
	/** Should be offered and is not. */
	add: string[];
	/** Belongs to a teacher who should not be offered — on LOA, off the roster, or no longer evaluating. */
	remove: string[];
	/** Offered, but not spelled the way we hold it (`Sw` for `SW`). */
	rename: { from: string; to: string }[];
};

export function isDriftEmpty(drift: DropdownDrift): boolean {
	return drift.add.length + drift.remove.length + drift.rename.length === 0;
}

/**
 * What would bring one dropdown in line. Pure.
 *
 * - `wanted`: the values it should offer.
 * - `known`: every value that has ever stood for one of our teachers — current
 *   and past initials, and CIDs. Only these are ever reported for removal.
 *   Anything else on the dropdown (`VATUSA`, someone we have never heard of)
 *   is not ours to judge, and is left alone.
 *
 * Compared case-insensitively, because the board is edited by hand; a case
 * difference is reported as a rename rather than an add and a remove.
 */
export function planDropdownDrift(input: {
	options: readonly string[];
	wanted: readonly string[];
	known: readonly string[];
}): DropdownDrift {
	const fold = (value: string) => value.trim().toUpperCase();
	const optionsByFold = new Map(input.options.map((option) => [fold(option), option]));
	const wantedFolds = new Set(input.wanted.map(fold));
	const knownFolds = new Set(input.known.map(fold));

	const add: string[] = [];
	const rename: DropdownDrift['rename'] = [];

	for (const value of input.wanted) {
		const option = optionsByFold.get(fold(value));
		if (option === undefined) add.push(value);
		else if (option !== value) rename.push({ from: option, to: value });
	}

	const remove = input.options.filter(
		(option) => knownFolds.has(fold(option)) && !wantedFolds.has(fold(option))
	);

	return { add: add.sort(), remove: remove.sort(), rename };
}

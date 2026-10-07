import type { TeacherGate } from './vatusa-academy';

/**
 * The staff sheet's rows, as `/waitlist` draws them: every request staff are
 * still working, not only the ones waiting. Here rather than under
 * `$lib/server/` because a component uses the types; the rows themselves are
 * built in `$lib/server/enrollments/waitlist.ts`.
 */

/** A teacher someone on the waitlist could be given. */
export type TeacherChoice = {
	cid: string;
	label: string;
	/** Open slots, or null when they have not said how many they take. */
	available: number | null;
};

/**
 * The statuses the sheet lists, in the order a request moves through them.
 * Left out: Audit, which has its own page (`/admin/audit`), and anything
 * closed — completed, removed or withdrawn.
 */
export const SHEET_STATUSES = ['waitlist', 'in-training', 'rating-exam', 'needs-catp'] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export type WaitlistRow = {
	id: string;
	status: SheetStatus;
	cid: string;
	name: string;
	ratingShort: string | null;
	course: string;
	courseName: string;
	/** 1 is next, within their course. Null once they are off the waitlist. */
	position: number | null;
	/** Their teacher, and at the rating exam their examiner, by name. Null until assigned. */
	teacher: string | null;
	/** Their teacher's CID, when the board's value is one of ours. For preselecting them. */
	teacherCid: string | null;
	examiner: string | null;
	waitlistedAt: Date;
	availability: string | null;
	notificationPreference: string | null;
	/**
	 * Their address, only for someone who asked to be reached by email and only
	 * when we hold one. The sheet is loaded for `training:students:manage` alone.
	 */
	contactEmail: string | null;
	/** The written exam this course needs, or null when it needs none. */
	exam: string | null;
	vatusaAssignedOn: string | null;
	vatusaCompletedOn: string | null;
	gate: TeacherGate;
	issueKey: string | null;
	issueUrl: string | null;
	/** Active teachers who may teach this course: to assign one, or to change to. */
	teachers: TeacherChoice[];
};

/** A teacher's open slots as a dropdown shows them: "(2 open)", "(full)", "(slots not set)". */
export function slotsLabel(available: number | null): string {
	if (available === null) return '(slots not set)';
	return available === 0 ? '(full)' : `(${available} open)`;
}

/** One course's rows on the sheet. */
export type CourseGroup<Row extends { course: string }> = {
	code: string;
	rows: Row[];
};

/**
 * Rows gathered by course, keeping the order they came in — both of the
 * courses and of the rows inside each. The server has already sorted them.
 */
export function groupByCourse<Row extends { course: string }>(
	rows: readonly Row[]
): CourseGroup<Row>[] {
	const groups = new Map<string, Row[]>();
	for (const row of rows) {
		const group = groups.get(row.course);
		if (group) group.push(row);
		else groups.set(row.course, [row]);
	}
	return [...groups].map(([code, members]) => ({ code, rows: members }));
}

/** Which statuses the sheet is showing. */
export type StatusFilter = Record<SheetStatus, boolean>;

/** Every status on, which is how the sheet opens. */
export function allStatuses(): StatusFilter {
	return Object.fromEntries(SHEET_STATUSES.map((status) => [status, true])) as StatusFilter;
}

/** The rows a set of filters leaves: statuses that are on, and one course or all of them. */
export function filterRows<Row extends { course: string; status: SheetStatus }>(
	rows: readonly Row[],
	filter: { statuses: StatusFilter; course: string }
): Row[] {
	return rows.filter(
		(row) => filter.statuses[row.status] && (!filter.course || row.course === filter.course)
	);
}

/** How many rows are at each status, whatever the filters say. */
export function countByStatus(
	rows: readonly { status: SheetStatus }[]
): Record<SheetStatus, number> {
	return Object.fromEntries(
		SHEET_STATUSES.map((status) => [status, rows.filter((row) => row.status === status).length])
	) as Record<SheetStatus, number>;
}

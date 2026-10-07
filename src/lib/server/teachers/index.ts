import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable, type Teacher } from '$lib/db/schema/teachers';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import type { PersonSummary } from '$lib/server/roster';
import { activityInsert, runGroups, type BatchStatement } from '$lib/server/activity';
import {
	ASSIGNED_STATUSES,
	QUALIFICATION_CREDENTIALS,
	SLOT_STATUSES,
	isAssignedTo,
	levelProblem,
	type QualificationLevel,
	type TeacherFacts,
	type TeacherStatus
} from '$lib/teachers';
import { endQualification, getCurrentQualifications, startQualification } from './qualifications';
import type { ProfileChange } from './notices';

export { syncTeacherRoster, planTeacherRoster } from './sync';
export {
	getAllCurrentQualifications,
	getCurrentQualifications,
	getQualificationHistory
} from './qualifications';
export { capacityNotice, statusNotice, type AssignedStudent, type ProfileChange } from './notices';

/** A teacher's row, whether or not they are currently on the teacher roster. */
export async function getTeacher(db: Database, cid: string): Promise<Teacher | null> {
	const teacher = await db.query.teachersTable.findFirst({ where: eq(teachersTable.cid, cid) });
	return teacher ?? null;
}

/** Someone currently on the teacher roster — the test for `/teach`. */
export async function getActiveTeacher(db: Database, cid: string): Promise<Teacher | null> {
	const teacher = await db.query.teachersTable.findFirst({
		where: and(eq(teachersTable.cid, cid), isNull(teachersTable.removedAt))
	});
	return teacher ?? null;
}

export type Assignee = {
	/** What the board holds: initials, a CID, or something that is not ours (`VATUSA`). */
	value: string;
	/** Their name, when the value stands for someone on our teacher roster. */
	name: string | null;
};

/**
 * Who a TRK `Teacher` or `RE Instructor` value stands for, for showing a
 * student who they are working with.
 *
 * Matched the way `isAssignedTo` matches — initials or CID, case-insensitive —
 * and against former teachers too, since a request can outlast its teacher's
 * place on the roster. A value nobody here holds comes back with no name
 * rather than null: `VATUSA` on RE Instructor is a real answer.
 */
export async function findAssignee(db: Database, value: string | null): Promise<Assignee | null> {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	const folded = trimmed.toUpperCase();
	const teacher = await db.query.teachersTable.findFirst({
		where: or(eq(teachersTable.initials, folded), eq(teachersTable.cid, folded))
	});
	if (!teacher) return { value: trimmed, name: null };

	// Removed rows included: a former member still has a name.
	const person = await db.query.rosterMembersTable.findFirst({
		where: eq(rosterMembersTable.cid, teacher.cid)
	});
	const name = person ? `${person.firstName} ${person.lastName}`.trim() : '';

	return { value: teacher.initials ?? trimmed, name: name || null };
}

/** Every teacher, current and former. The table is small. */
export async function listTeachers(db: Database): Promise<Teacher[]> {
	return db.select().from(teachersTable);
}

/** The facts the qualification rules need, from a teacher row and the roster. */
export function teacherFacts(teacher: Teacher, person: PersonSummary | undefined): TeacherFacts {
	return { roles: teacher.roles, rating: person?.rating ?? 0 };
}

/**
 * Every enrollment currently assigned to *some* teacher: `in-training` or
 * `rating-exam`, not withdrawn. Two statuses bound, whatever the roster size.
 * Callers split it by teacher with `assignmentsFor`.
 */
export async function getAssignedEnrollments(db: Database): Promise<Enrollment[]> {
	return db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...ASSIGNED_STATUSES]),
				isNull(enrollmentsTable.withdrawnAt)
			)
		);
}

export type Assignments = {
	/** Their students: in training or at the rating exam. Never themselves. */
	students: Enrollment[];
	/** Students using a slot (`in-training`). */
	inTraining: number;
	/**
	 * An enrollment of their own that the board assigns to them. A teacher can
	 * be a student, but never their own — this is shown as a problem, not
	 * counted as a student.
	 */
	selfAssigned: Enrollment | null;
};

export function assignmentsFor(
	teacher: { cid: string; initials: string | null },
	enrollments: readonly Enrollment[]
): Assignments {
	const mine = enrollments.filter((enrollment) => isAssignedTo(enrollment.teacher, teacher));
	const students = mine.filter((enrollment) => enrollment.cid !== teacher.cid);

	return {
		students,
		inTraining: students.filter((enrollment) =>
			(SLOT_STATUSES as readonly string[]).includes(enrollment.status)
		).length,
		selfAssigned: mine.find((enrollment) => enrollment.cid === teacher.cid) ?? null
	};
}

export type ProfileInput = {
	availability?: string | null;
	studentMessage?: string | null;
	studentSlots?: number | null;
	status?: TeacherStatus;
	initials?: string | null;
};

/** What an edit would change, field by field. Pure. */
export function diffProfile(teacher: Teacher, input: ProfileInput): ProfileChange[] {
	const changes: ProfileChange[] = [];

	if (input.availability !== undefined && input.availability !== teacher.availability) {
		changes.push({ field: 'availability', from: teacher.availability, to: input.availability });
	}
	if (input.studentMessage !== undefined && input.studentMessage !== teacher.studentMessage) {
		changes.push({ field: 'message', from: teacher.studentMessage, to: input.studentMessage });
	}
	if (input.studentSlots !== undefined && input.studentSlots !== teacher.studentSlots) {
		changes.push({ field: 'slots', from: teacher.studentSlots, to: input.studentSlots });
	}
	if (input.status !== undefined && input.status !== teacher.status) {
		changes.push({ field: 'status', from: teacher.status, to: input.status });
	}
	if (input.initials !== undefined && input.initials !== teacher.initials) {
		changes.push({ field: 'initials', from: teacher.initials, to: input.initials });
	}

	return changes;
}

const CHANGE_EVENTS = {
	availability: 'teacher.availability',
	message: 'teacher.message',
	slots: 'teacher.slots',
	status: 'teacher.status',
	initials: 'teacher.initials'
} as const;

/**
 * Save a profile edit and log each field that changed, in one batch.
 *
 * `actor` null means the change was automatic (reserved for the LOA hook
 * below); otherwise it is the CID of whoever made it.
 *
 * Returns the changes, so the caller can decide who to tell. Throws on a
 * duplicate initials value (the unique index); the caller reports it.
 */
export async function updateTeacherProfile(
	db: Database,
	teacher: Teacher,
	input: ProfileInput,
	actor: string | null
): Promise<ProfileChange[]> {
	const changes = diffProfile(teacher, input);
	if (changes.length === 0) return [];

	const now = new Date();
	const set: Partial<Teacher> = { updatedAt: now, updatedBy: actor };
	for (const change of changes) {
		if (change.field === 'availability') set.availability = change.to;
		if (change.field === 'message') set.studentMessage = change.to;
		if (change.field === 'slots') set.studentSlots = change.to;
		if (change.field === 'status') set.status = change.to;
		if (change.field === 'initials') set.initials = change.to;
	}

	await runGroups(db, [
		[
			db.update(teachersTable).set(set).where(eq(teachersTable.cid, teacher.cid)),
			...changes.map((change) =>
				activityInsert(db, {
					cid: teacher.cid,
					event: CHANGE_EVENTS[change.field],
					detail: { from: change.from, to: change.to },
					actor,
					at: now
				})
			)
		]
	]);

	return changes;
}

/*
 * TODO(identity): set LOA automatically.
 *
 * When identity carries a controller status, a teacher whose status there is
 * inactive or LOA should be set to `loa` here with `actor` null, which makes
 * `statusNotice` report it to training admins. Call
 * `updateTeacherProfile(db, teacher, { status: 'loa' }, null)` and hand the
 * result to `statusNotice({ automatic: true, ... })` — nothing else is needed.
 * Identity has no such status yet, so nothing calls it.
 */

export type QualificationEdit = { code: string; level: QualificationLevel | null };

export type QualificationEditResult =
	{ ok: true; changed: number } | { ok: false; problems: string[] };

/**
 * Set a teacher's levels from the admin form. Every requested level is checked
 * against the rules first, and nothing is written unless all of them pass.
 * Unchanged levels write nothing. Each change ends the current row and starts
 * the new one in the same batch.
 */
export async function setTeacherQualifications(
	db: Database,
	teacher: Teacher,
	facts: TeacherFacts,
	edits: readonly QualificationEdit[],
	actor: string
): Promise<QualificationEditResult> {
	const problems = edits
		.map((edit) => levelProblem(edit.code, edit.level, facts))
		.filter((problem): problem is string => problem !== null);
	if (problems.length > 0) return { ok: false, problems };

	const current = await getCurrentQualifications(db, teacher.cid);
	const now = new Date();
	const groups: BatchStatement[][] = [];

	for (const edit of edits) {
		if (!QUALIFICATION_CREDENTIALS.some((credential) => credential.code === edit.code)) continue;
		const row = current.find((candidate) => candidate.code === edit.code) ?? null;
		if ((row?.level ?? null) === edit.level) continue;

		const group: BatchStatement[] = [];
		if (row) {
			group.push(
				endQualification(db, row.id, {
					reason: edit.level ? `Changed to ${edit.level}` : 'Removed by a training admin',
					by: actor,
					at: now
				})
			);
		}
		if (edit.level) {
			group.push(
				startQualification(db, {
					cid: teacher.cid,
					code: edit.code,
					level: edit.level,
					basis: 'manual',
					by: actor,
					at: now
				})
			);
		}
		groups.push(group);
	}

	await runGroups(db, groups);
	return { ok: true, changed: groups.length };
}
export {
	checkTeacherDropdowns,
	getStoredDropdownDrift,
	type StoredDropdownDrift
} from './dropdowns';

/** "Jo Rivera (JR)", or the CID when the roster has no name for them. */
export function teacherLabel(
	teacher: { cid: string; initials: string | null },
	person: PersonSummary | undefined
): string {
	const name = person?.name ?? teacher.cid;
	return teacher.initials ? `${name} (${teacher.initials})` : name;
}

export type StudentRow = {
	enrollmentId: string;
	cid: string;
	name: string;
	course: string;
	status: string;
	availability: string | null;
	/** Link to the TRK issue, when the enrollment has one and Jira is configured. */
	issueUrl: string | null;
	issueKey: string | null;
};

/** Enrollments as the teacher pages list them. */
export function studentRows(
	enrollments: readonly Enrollment[],
	people: Map<string, PersonSummary>,
	jiraBaseUrl: string | undefined
): StudentRow[] {
	const base = jiraBaseUrl?.trim().replace(/\/$/, '');

	return enrollments
		.map((enrollment) => ({
			enrollmentId: enrollment.id,
			cid: enrollment.cid,
			name: people.get(enrollment.cid)?.name ?? enrollment.submittedName,
			course: enrollment.course,
			status: enrollment.status,
			availability: enrollment.availability,
			issueKey: enrollment.jiraIssueKey,
			issueUrl: base && enrollment.jiraIssueKey ? `${base}/browse/${enrollment.jiraIssueKey}` : null
		}))
		.sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
}

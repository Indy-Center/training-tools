import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { teachersTable, type Teacher } from '$lib/db/schema/teachers';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
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

/** Every teacher, current and former. The table is small. */
export async function listTeachers(db: Database): Promise<Teacher[]> {
	return db.select().from(teachersTable);
}

export type PersonSummary = { name: string; rating: number; ratingShort: string };

/**
 * Names and ratings from the roster mirror, by CID, for everyone it has ever
 * held. Whole table rather than `IN (...)` — D1's 100-parameter limit — and
 * removed rows included, because a former teacher still has a name.
 */
export async function getPeople(db: Database): Promise<Map<string, PersonSummary>> {
	const rows = await db
		.select({
			cid: rosterMembersTable.cid,
			firstName: rosterMembersTable.firstName,
			lastName: rosterMembersTable.lastName,
			rating: rosterMembersTable.rating,
			ratingShort: rosterMembersTable.ratingShort
		})
		.from(rosterMembersTable);

	return new Map(
		rows.map((row) => [
			row.cid,
			{
				name: `${row.firstName} ${row.lastName}`.trim() || row.cid,
				rating: row.rating,
				ratingShort: row.ratingShort
			}
		])
	);
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

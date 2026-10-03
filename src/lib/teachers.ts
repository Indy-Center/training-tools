/**
 * The teacher roster's rules: who is a teacher, what they may be qualified for
 * per course, and how their student slots count.
 *
 * Not under `$lib/server/` on purpose — the teacher pages render these, and a
 * form that offers only the levels a teacher may hold has to know the rules
 * client-side too. The server re-checks every one of them on submit.
 *
 * Everything here is pure, in the same shape as `$lib/certifications.ts`, so
 * the policy is testable without a database. See
 * .ai/decisions/0017-teacher-roster-and-qualifications.md and DEV-175.
 */
import { CREDENTIALS, findCredential, type CredentialCode } from './certifications';
import { FACILITY_ID, RATING_S3 } from './config';
import { AVAILABILITY_MAX_LENGTH } from './enrollment';

/**
 * The VATUSA facility roles that put someone on the teacher roster: `INS`
 * (instructor) and `MTR` (mentor), held at **our** facility.
 *
 * Verified against the live roster on 2026-09-30: 3 `ZID:INS` and 7 `ZID:MTR`.
 * Visiting controllers often hold INS or MTR at their home facility, which is
 * why the facility is checked, not just the role.
 */
export const TEACHER_ROLES = ['INS', 'MTR'] as const;
export type TeacherRole = (typeof TEACHER_ROLES)[number];

/** A teacher on LOA keeps their profile and slots, but takes no new students. */
export const TEACHER_STATUSES = ['active', 'loa'] as const;
export type TeacherStatus = (typeof TEACHER_STATUSES)[number];

export const TEACHER_STATUS_LABELS: Record<TeacherStatus, string> = {
	active: 'Active',
	loa: 'LOA'
};

/**
 * What a teacher may do on one course. No row at all is "No Qual".
 *
 * Ordered lowest to highest; `evaluator` is "Teacher and Evaluator" — it
 * includes teaching.
 */
export const QUALIFICATION_LEVELS = ['training', 'teacher', 'evaluator'] as const;
export type QualificationLevel = (typeof QUALIFICATION_LEVELS)[number];

export const QUALIFICATION_LEVEL_LABELS: Record<QualificationLevel | 'none', string> = {
	none: 'No Qual',
	training: 'Training',
	teacher: 'Teacher',
	evaluator: 'Teacher and Evaluator'
};

/** Short form, for the roster grid. */
export const QUALIFICATION_LEVEL_SHORT: Record<QualificationLevel, string> = {
	training: 'Trn',
	teacher: 'T',
	evaluator: 'T+E'
};

/**
 * Every credential in the catalogue carries a qualification — courses and
 * endorsements alike. Event endorsements are not in the catalogue yet, and
 * gain a column automatically when they are added to it.
 */
export const QUALIFICATION_CREDENTIALS = CREDENTIALS;

/**
 * Courses that end in an evaluation, and the VATSIM rating it examines for.
 *
 * Only these four can have an evaluator. A-GC is a certification but has no
 * rating exam; endorsements (S-LC, T2-CTR, events) never do.
 */
export const RATING_EXAMS: Readonly<Partial<Record<CredentialCode, string>>> = {
	'S-GC': 'S1',
	'A-LC': 'S2',
	'T-RC': 'S3',
	'E-RC': 'C1'
};

/**
 * How long a teacher may be off the teacher roster before their
 * qualifications end. Someone who returns sooner still holds them.
 */
export const QUALIFICATION_RETENTION_MONTHS = 6;

/**
 * Enrollment statuses that put a student on a teacher's list. `needs-catp` is
 * here because the student is still theirs: the exam was not passed, and the
 * TA decides what further training they get.
 */
export const ASSIGNED_STATUSES = ['in-training', 'rating-exam', 'needs-catp'] as const;

/**
 * Enrollment statuses that use up a slot. A student at their rating exam is
 * still assigned, but is being examined rather than taught.
 */
export const SLOT_STATUSES = ['in-training'] as const;

export type TeacherFacts = {
	roles: readonly string[];
	/** VATSIM rating id from the roster mirror. */
	rating: number;
};

/** The roles in one VATUSA roster entry that make someone a teacher here. */
export function teacherRolesFrom(
	roles: readonly { facility?: string; role?: string }[] | null | undefined
): TeacherRole[] {
	const held = new Set<TeacherRole>();
	for (const entry of roles ?? []) {
		if (entry.facility !== FACILITY_ID) continue;
		const role = TEACHER_ROLES.find((candidate) => candidate === entry.role);
		if (role) held.add(role);
	}
	// Fixed order, so a stored list compares equal however VATUSA ordered it.
	return TEACHER_ROLES.filter((role) => held.has(role));
}

export function isInstructor(teacher: Pick<TeacherFacts, 'roles'>): boolean {
	return teacher.roles.includes('INS');
}

export function hasEvaluation(code: string): boolean {
	return RATING_EXAMS[code as CredentialCode] !== undefined;
}

/**
 * The level an instructor holds on a course without anyone granting it, or
 * null for anyone who is not an instructor. `ZID:INS` is how we know someone is
 * an I1 for us.
 *
 * Instructors teach everything: they evaluate every course that has an
 * evaluation, and are Teacher on every other course and endorsement.
 */
export function automaticLevel(
	code: string,
	teacher: Pick<TeacherFacts, 'roles'>
): QualificationLevel | null {
	if (!isInstructor(teacher) || !findCredential(code)) return null;
	return hasEvaluation(code) ? 'evaluator' : 'teacher';
}

/**
 * Whether a teacher may be an evaluator on a course at all.
 *
 * - Instructors: on every course with an evaluation (automatically —
 *   `automaticLevel`).
 * - Mentors rated S3 or higher: on S-GC only, and only when granted by hand.
 * - Nobody else — not an S2 mentor, and not a mentor on E-RC.
 */
export function canEvaluate(code: string, teacher: TeacherFacts): boolean {
	if (!hasEvaluation(code)) return false;
	if (isInstructor(teacher)) return true;
	return code === 'S-GC' && teacher.roles.includes('MTR') && teacher.rating >= RATING_S3;
}

/** The levels a teacher may be given on a course, lowest first. */
export function allowedLevels(code: string, teacher: TeacherFacts): QualificationLevel[] {
	return QUALIFICATION_LEVELS.filter(
		(level) => level !== 'evaluator' || canEvaluate(code, teacher)
	);
}

/**
 * Why a level cannot be set, or null when it can. `null` for the level means
 * No Qual.
 */
export function levelProblem(
	code: string,
	level: QualificationLevel | null,
	teacher: TeacherFacts
): string | null {
	if (!findCredential(code)) return `${code} is not a course or endorsement`;

	// The sync would put it straight back, so the form must not pretend.
	const automatic = automaticLevel(code, teacher);
	if (automatic && level !== automatic) {
		return automatic === 'evaluator'
			? `Instructors evaluate ${code} automatically`
			: `Instructors teach ${code} automatically`;
	}

	if (level === 'evaluator' && !canEvaluate(code, teacher)) {
		return hasEvaluation(code)
			? `Only instructors, or S3+ mentors on S-GC, can evaluate ${code}`
			: `${code} has no evaluation`;
	}

	return null;
}

/**
 * The level the rules would move a held one to, or null when it stands.
 *
 * Only ever lowers `evaluator` to `teacher` — for someone who lost INS, or a
 * mentor whose rating dropped below S3. Raising an instructor is
 * `automaticLevel`'s job, not this one's.
 */
export function downgradeFor(
	code: string,
	level: QualificationLevel,
	teacher: TeacherFacts
): QualificationLevel | null {
	return level === 'evaluator' && !canEvaluate(code, teacher) ? 'teacher' : null;
}

/** True once a teacher has been off the roster long enough to lose their qualifications. */
export function qualificationsExpired(removedAt: Date | null, now: Date): boolean {
	if (!removedAt) return false;
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - QUALIFICATION_RETENTION_MONTHS);
	return removedAt.getTime() < cutoff.getTime();
}

export type SlotSummary = {
	/** What the teacher set, or null when they have not said. */
	total: number | null;
	/** Students in training with them. */
	used: number;
	/**
	 * Open slots that count as available anywhere in the app. Always 0 on LOA:
	 * the slots stay visible so a teacher can show they are ready to come back,
	 * but they are not open. Null when no total has been set.
	 */
	available: number | null;
};

export function slotSummary(input: {
	status: TeacherStatus;
	studentSlots: number | null;
	inTraining: number;
}): SlotSummary {
	const total = input.studentSlots;
	if (total === null) return { total, used: input.inTraining, available: null };

	return {
		total,
		used: input.inTraining,
		available: input.status === 'loa' ? 0 : Math.max(total - input.inTraining, 0)
	};
}

/**
 * Operating initials as stored: two letters, upper case. Returns null for
 * anything else rather than guessing at what was meant.
 */
export function normalizeInitials(input: string | null | undefined): string | null {
	const value = (input ?? '').trim().toUpperCase();
	return /^[A-Z]{2}$/.test(value) ? value : null;
}

/**
 * What stands for a teacher in TRK's `Teacher` and `RE Instructor` dropdowns:
 * their initials, or their CID until they have some.
 */
export function jiraOptionValue(teacher: { cid: string; initials: string | null }): string {
	return teacher.initials ?? teacher.cid;
}

/**
 * Whether an enrollment's `teacher` (the TRK `Teacher` value) means this
 * teacher. Matches initials or CID, so students assigned while a teacher had
 * no initials still show up after they get some. Case-insensitive, because
 * the board is edited by hand.
 */
export function isAssignedTo(
	enrollmentTeacher: string | null,
	teacher: { cid: string; initials: string | null }
): boolean {
	if (!enrollmentTeacher) return false;
	const value = enrollmentTeacher.trim().toUpperCase();
	return value === teacher.cid || (teacher.initials !== null && value === teacher.initials);
}

/** Guards against a typo like 30 for 3; no real teacher is near it. */
export const MAX_STUDENT_SLOTS = 20;

export type TeacherProfileInput = { availability?: unknown; studentSlots?: unknown };

export type TeacherProfileValidation =
	| { ok: true; values: { availability: string | null; studentSlots: number | null } }
	| { ok: false; errors: { availability?: string; studentSlots?: string } };

/**
 * The teacher-editable part of a profile, from a form. Both may be cleared:
 * blank availability or slots means "not set", not zero.
 */
export function validateTeacherProfile(input: TeacherProfileInput): TeacherProfileValidation {
	const errors: { availability?: string; studentSlots?: string } = {};

	const availabilityText = typeof input.availability === 'string' ? input.availability.trim() : '';
	if (availabilityText.length > AVAILABILITY_MAX_LENGTH) {
		errors.availability = `Keep this under ${AVAILABILITY_MAX_LENGTH} characters.`;
	}

	const slotsText = typeof input.studentSlots === 'string' ? input.studentSlots.trim() : '';
	const slots = slotsText === '' ? null : Number(slotsText);
	if (slots !== null && (!Number.isInteger(slots) || slots < 0 || slots > MAX_STUDENT_SLOTS)) {
		errors.studentSlots = `Enter a whole number from 0 to ${MAX_STUDENT_SLOTS}, or leave it blank.`;
	}

	if (errors.availability || errors.studentSlots) return { ok: false, errors };
	return { ok: true, values: { availability: availabilityText || null, studentSlots: slots } };
}

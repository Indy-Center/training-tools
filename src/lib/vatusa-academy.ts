/**
 * VATUSA's written rating courses, as they bear on our waitlist.
 *
 * Before a controller trains for a rating they sit a written course and exam on
 * VATUSA's academy. Each of our courses that ends in a rating exam has one. The
 * waitlist page records when it was assigned and passed, and a teacher is only
 * assigned once it is.
 *
 * Pure. The calls to VATUSA are in `$lib/server/vatusa.ts`.
 *
 * See research/vatusa-roster.md, "Academy endpoints".
 */

/** VATUSA's names for its four written exams, as its transcript keys them. */
export type AcademyExam = 'BASIC' | 'S2' | 'S3' | 'C1';

/**
 * Which written exam each of our courses needs. A course not listed has none:
 * A-GC and S-LC earn no rating, and Custom Training is whatever staff make it.
 */
const COURSE_EXAMS: Readonly<Record<string, AcademyExam>> = {
	'S-GC': 'BASIC',
	'A-LC': 'S2',
	'T-RC': 'S3',
	'E-RC': 'C1'
};

/** The written exam a course needs before training starts, or null when it needs none. */
export function academyExamFor(course: string): AcademyExam | null {
	return COURSE_EXAMS[course] ?? null;
}

/**
 * VATUSA's pass mark, as a percentage. Its own default for all four exams
 * (`config/exams.php` in VATUSA/api); a division change to it would need
 * mirroring here.
 */
export const ACADEMY_PASS_PERCENT = 80;

/** One sitting of an exam, from `GET /v2/academy/transcript/{cid}`. */
export type AcademyAttempt = {
	attempt?: number | null;
	/** Unix seconds. Zero or missing while the attempt is still open. */
	time_finished?: number | null;
	/** A percentage, 0–100. */
	grade?: number | null;
};

export type AcademyTranscript = Partial<Record<AcademyExam, AcademyAttempt[] | null>>;

/**
 * When an exam was first passed, or null if it has not been.
 *
 * The **first** pass, not the latest: that is the day they were ready to train.
 * A pass from before the course was assigned still counts — someone who sat the
 * exam for another facility has passed it.
 */
export function firstPass(attempts: readonly AcademyAttempt[] | null | undefined): Date | null {
	const passes = (attempts ?? [])
		.filter(
			(attempt) =>
				typeof attempt.grade === 'number' &&
				attempt.grade >= ACADEMY_PASS_PERCENT &&
				typeof attempt.time_finished === 'number' &&
				attempt.time_finished > 0
		)
		.map((attempt) => attempt.time_finished as number)
		.sort((a, b) => a - b);

	return passes.length > 0 ? new Date(passes[0] * 1000) : null;
}

/** What stands between a request on the waitlist and a teacher. */
export type TeacherGate =
	/** Nothing: this course has no written exam, or it is passed. */
	{ open: true } | { open: false; reason: 'not-assigned' | 'not-completed' };

/**
 * Whether a teacher may be assigned yet. A course with a written exam needs it
 * passed first; any other course is open from the start.
 */
export function teacherGate(request: {
	course: string;
	vatusaAssignedOn: string | null;
	vatusaCompletedOn: string | null;
}): TeacherGate {
	if (!academyExamFor(request.course) || request.vatusaCompletedOn) return { open: true };
	return { open: false, reason: request.vatusaAssignedOn ? 'not-completed' : 'not-assigned' };
}

/** The facility roles whose holder VATUSA records as having assigned a course, in order of preference. */
export const ACADEMY_ASSIGNER_ROLES = ['TA', 'ATM'] as const;

/**
 * Who VATUSA should record as assigning a course: the Training Administrator,
 * or the ATM when the facility has no TA. Null when it has neither.
 */
export function pickAcademyAssigner(
	members: readonly { cid: string; roles: readonly { facility?: string; role?: string }[] }[],
	facility: string
): string | null {
	for (const wanted of ACADEMY_ASSIGNER_ROLES) {
		const holder = members.find((member) =>
			member.roles.some((role) => role.facility === facility && role.role === wanted)
		);
		if (holder) return holder.cid;
	}
	return null;
}

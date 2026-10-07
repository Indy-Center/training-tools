import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { FACILITY_ID } from '$lib/config';
import { COURSES, findCourse } from '$lib/courses';
import { CLOSED_ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import { resolveJiraConfig } from '$lib/server/jira/client';
import { transitionIssueToStatus, WITHDRAWN_STATUS } from '$lib/server/jira/enrollment';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { findSelectOption, toFacilityDate, updateIssueFields } from '$lib/server/jira/progress';
import { TEACHER_FIELD } from '$lib/server/jira/status';
import { getPeople } from '$lib/server/roster';
import {
	assignmentsFor,
	getAllCurrentQualifications,
	getAssignedEnrollments,
	listTeachers,
	teacherLabel
} from '$lib/server/teachers';
import {
	enrollInAcademyCourse,
	fetchAcademyCourseIds,
	fetchAcademyTranscript,
	VatusaError
} from '$lib/server/vatusa';
import { isAssignedTo, slotSummary } from '$lib/teachers';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { academyExamFor, firstPass, pickAcademyAssigner, teacherGate } from '$lib/vatusa-academy';
import {
	SHEET_STATUSES,
	type SheetStatus,
	type TeacherChoice,
	type WaitlistRow
} from '$lib/waitlist';
import { note, onCard, type FlowResult } from './completion';
import { syncEnrollmentIssue } from './status-sync';

/**
 * The waitlist as staff work it: everyone waiting, the VATUSA written course
 * each needs, and the step that takes them off it — assigning a teacher.
 *
 * Like the end-of-course steps, **Jira is still the authority**. Each step
 * writes to the card and then reads it back onto our row; nothing is set here
 * that Jira did not accept.
 *
 * See `$lib/vatusa-academy.ts` for the rules.
 */

/** TRK's status for someone with a teacher. Matched by name, like every transition. */
const IN_TRAINING_STATUS = 'In Training';

/**
 * Every request staff are still working, by course, then by how far along it
 * is, then by how long they have waited.
 */
export async function getWaitlistSheet(db: Database, jiraBaseUrl?: string): Promise<WaitlistRow[]> {
	const [waiting, people, teachers, levels, assigned] = await Promise.all([
		db
			.select()
			.from(enrollmentsTable)
			.where(
				and(
					inArray(enrollmentsTable.status, [...SHEET_STATUSES]),
					isNull(enrollmentsTable.withdrawnAt)
				)
			)
			.orderBy(asc(enrollmentsTable.createdAt)),
		getPeople(db),
		listTeachers(db),
		getAllCurrentQualifications(db),
		getAssignedEnrollments(db)
	]);

	const base = jiraBaseUrl?.trim().replace(/\/$/, '');
	const active = teachers.filter(
		(teacher) => teacher.removedAt === null && teacher.status === 'active'
	);

	/** Who may be given a student on this course, most open slots first. */
	const choicesFor = (course: string, studentCid: string): TeacherChoice[] =>
		active
			.filter((teacher) => teacher.cid !== studentCid && mayTeach(course, levels.get(teacher.cid)))
			.map((teacher) => ({
				cid: teacher.cid,
				label: teacherLabel(teacher, people.get(teacher.cid)),
				available: slotSummary({
					status: teacher.status,
					studentSlots: teacher.studentSlots,
					inTraining: assignmentsFor(teacher, assigned).inTraining
				}).available
			}))
			.sort((a, b) => (b.available ?? -1) - (a.available ?? -1) || a.label.localeCompare(b.label));

	/** A board value (initials, or a CID) as the person it stands for. */
	const assigneeName = (value: string | null): string | null => {
		if (!value) return null;
		const match = teachers.find((teacher) => isAssignedTo(value, teacher));
		return match ? teacherLabel(match, people.get(match.cid)) : value;
	};

	const seen = new Map<string, number>();
	const order = (status: string) => (SHEET_STATUSES as readonly string[]).indexOf(status);
	// The catalogue is already in the order the courses are taken, so its index
	// is the sequence. Anything not in it goes last.
	const sequence = (course: string) => {
		const index = COURSES.findIndex((candidate) => candidate.code === course);
		return index === -1 ? COURSES.length : index;
	};

	return waiting
		.map((enrollment): WaitlistRow => {
			const waitingNow = enrollment.status === 'waitlist';
			let position: number | null = null;
			if (waitingNow) {
				position = (seen.get(enrollment.course) ?? 0) + 1;
				seen.set(enrollment.course, position);
			}
			const person = people.get(enrollment.cid);

			return {
				id: enrollment.id,
				status: enrollment.status as SheetStatus,
				teacher: assigneeName(enrollment.teacher),
				teacherCid:
					teachers.find((teacher) => isAssignedTo(enrollment.teacher, teacher))?.cid ?? null,
				examiner: assigneeName(enrollment.reInstructor),
				cid: enrollment.cid,
				name: person?.name ?? enrollment.submittedName,
				ratingShort: person?.ratingShort ?? enrollment.submittedRating,
				course: enrollment.course,
				courseName: findCourse(enrollment.course)?.name ?? enrollment.course,
				position,
				waitlistedAt: enrollment.createdAt,
				availability: enrollment.availability,
				notificationPreference: enrollment.notificationPreference,
				exam: academyExamFor(enrollment.course),
				vatusaAssignedOn: enrollment.vatusaAssignedOn,
				vatusaCompletedOn: enrollment.vatusaCompletedOn,
				gate: teacherGate(enrollment),
				issueKey: enrollment.jiraIssueKey,
				issueUrl:
					base && enrollment.jiraIssueKey ? `${base}/browse/${enrollment.jiraIssueKey}` : null,
				teachers: choicesFor(enrollment.course, enrollment.cid)
			};
		})
		.sort(
			(a, b) =>
				sequence(a.course) - sequence(b.course) ||
				order(a.status) - order(b.status) ||
				a.waitlistedAt.getTime() - b.waitlistedAt.getTime()
		);
}

/**
 * Whether a teacher's qualifications let them take a student on a course:
 * Teacher, or Teacher and Evaluator. Custom Training has no qualification of
 * its own, so any teacher may be given it.
 */
function mayTeach(course: string, levels: ReadonlyMap<string, string> | undefined): boolean {
	if (findCourse(course)?.examOptional) return true;
	const level = levels?.get(course);
	return level === 'teacher' || level === 'evaluator';
}

/** Who VATUSA records as assigning a course: our TA, or the ATM when there is none. */
async function findAcademyAssigner(db: Database): Promise<string | null> {
	const rows = await db
		.select({ cid: rosterMembersTable.cid, data: rosterMembersTable.data })
		.from(rosterMembersTable)
		.where(and(isNull(rosterMembersTable.removedAt), eq(rosterMembersTable.membership, 'home')));

	return pickAcademyAssigner(
		rows.map((row) => ({ cid: row.cid, roles: (row.data as VatusaRosterMember).roles ?? [] })),
		FACILITY_ID
	);
}

function vatusaKey(env: Partial<Env> | undefined): string | null {
	return env?.VATUSA_API_KEY?.trim() || null;
}

/**
 * When this student first passed the written exam their course needs, or null
 * when they have not — or when it cannot be found out: no API key, no exam for
 * the course, or VATUSA not answering. A failed read is not a "no", so callers
 * treat null as "carry on as before", never as proof they still have it to do.
 */
async function earlierPass(
	env: Partial<Env> | undefined,
	enrollment: Pick<Enrollment, 'cid' | 'course'>
): Promise<Date | null> {
	const exam = academyExamFor(enrollment.course);
	const key = vatusaKey(env);
	if (!exam || !key) return null;

	try {
		return firstPass((await fetchAcademyTranscript(key, enrollment.cid))[exam]);
	} catch (err) {
		console.error(
			'[training-tools] VATUSA transcript check failed',
			enrollment.cid,
			err instanceof VatusaError ? err.message : err
		);
		return null;
	}
}

/**
 * Date the card as completed for someone who had already passed the exam
 * before they asked for this course: for another facility, or on an earlier
 * request. Run when a request is filed, so they never show as waiting on a
 * course they have done. Returns the day they passed, or null when nothing was
 * recorded.
 */
export async function recordEarlierVatusaPass(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment
): Promise<Date | null> {
	if (enrollment.vatusaCompletedOn || !enrollment.jiraIssueKey) return null;

	const passed = await earlierPass(env, enrollment);
	if (!passed) return null;

	const result = await completeVatusaCourse(db, env, enrollment, null, passed);
	return result.ok ? passed : null;
}

/**
 * Assign the VATUSA written course, and date the card.
 *
 * Their transcript is read first. Someone who has already passed the exam is
 * not enrolled a second time: the card is dated as completed with the day they
 * passed, and `alreadyPassed` says so.
 *
 * For S2, S3 and C1 the course is assigned on VATUSA itself, through its API,
 * in the name of our TA (or ATM). VATUSA has no course to assign for the basic
 * exam, and without an API key nothing can be assigned at all; in both cases
 * only the card is dated, and whoever pressed the button is told to assign it
 * on VATUSA themselves.
 *
 * VATUSA first, the card second: a card dated for a course VATUSA refused would
 * tell everyone it had been assigned when it had not.
 */
export async function assignVatusaCourse(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string,
	now = new Date()
): Promise<FlowResult & { byHand?: string; alreadyPassed?: Date }> {
	const exam = academyExamFor(enrollment.course);
	if (!exam) return { ok: false, message: 'This course has no VATUSA written course.' };
	if (enrollment.vatusaAssignedOn) {
		return { ok: false, message: 'The VATUSA course is already marked as assigned.' };
	}

	const passed = await earlierPass(env, enrollment);
	if (passed) {
		const result = await completeVatusaCourse(db, env, enrollment, null, passed);
		return result.ok ? { ok: true, alreadyPassed: passed } : result;
	}

	let byHand: string | undefined;
	const key = vatusaKey(env);

	if (!key) {
		byHand = 'No VATUSA API key is set, so assign the course on VATUSA yourself.';
	} else {
		try {
			const courseId = (await fetchAcademyCourseIds())[exam];
			if (!courseId) {
				byHand = `VATUSA has no course to assign for the ${exam} exam through its API, so assign it on VATUSA yourself.`;
			} else {
				const assigner = await findAcademyAssigner(db);
				if (!assigner) {
					return {
						ok: false,
						message:
							'The roster shows no TA or ATM for the facility, so there is nobody to assign it as.'
					};
				}
				await enrollInAcademyCourse(key, courseId, enrollment.cid, assigner);
			}
		} catch (err) {
			const detail = err instanceof VatusaError ? err.message : String(err);
			console.error('[training-tools] VATUSA course assignment failed', enrollment.cid, detail);
			return { ok: false, message: `VATUSA would not assign the course: ${detail}` };
		}
	}

	const result = await onCard(
		db,
		env,
		enrollment,
		'assign VATUSA course',
		async (config, issueKey) => {
			await updateIssueFields(config, issueKey, {
				[JIRA_FIELDS.vatusaAssigned]: toFacilityDate(now)
			});
			await note(
				config,
				issueKey,
				byHand
					? `VATUSA ${exam} course marked as assigned by ${by}.`
					: `VATUSA ${exam} course assigned by ${by}.`
			);
		}
	);

	return result.ok ? { ok: true, byHand } : result;
}

/**
 * Date the card as having passed the VATUSA written course. Usually the cron
 * does this from VATUSA's transcript; this is for when it cannot, or for the
 * basic exam before a key exists.
 */
export async function completeVatusaCourse(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string | null,
	on = new Date()
): Promise<FlowResult> {
	const exam = academyExamFor(enrollment.course);
	if (!exam) return { ok: false, message: 'This course has no VATUSA written course.' };
	if (enrollment.vatusaCompletedOn) {
		return { ok: false, message: 'The VATUSA course is already marked as completed.' };
	}

	return onCard(db, env, enrollment, 'complete VATUSA course', async (config, issueKey) => {
		await updateIssueFields(config, issueKey, {
			[JIRA_FIELDS.vatusaCompleted]: toFacilityDate(on)
		});
		await note(
			config,
			issueKey,
			by
				? `VATUSA ${exam} course marked as completed by ${by}.`
				: `VATUSA ${exam} exam passed, read from the VATUSA transcript.`
		);
	});
}

/**
 * Give someone on the waitlist a teacher: the card gets `Teacher` and today as
 * `Teacher Assigned`, and moves to In Training.
 *
 * Refused until the VATUSA written course is passed, for a course that has
 * one, and for a teacher who is on LOA, off the roster, or not qualified to
 * teach the course. `Teacher` is set before the move, which is the order TRK's
 * own rule on that transition needs.
 */
export async function assignTeacher(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	teacherCid: string,
	by: string,
	now = new Date()
): Promise<FlowResult> {
	if (enrollment.status !== 'waitlist') {
		return { ok: false, message: 'That request is no longer on the waitlist.' };
	}

	const gate = teacherGate(enrollment);
	if (!gate.open) {
		return {
			ok: false,
			message:
				gate.reason === 'not-assigned'
					? 'Assign the VATUSA written course first; a teacher comes after it is passed.'
					: 'They have not passed the VATUSA written course yet.'
		};
	}

	const [teachers, levels, people] = await Promise.all([
		listTeachers(db),
		getAllCurrentQualifications(db),
		getPeople(db)
	]);
	const teacher = teachers.find((candidate) => candidate.cid === teacherCid);

	if (!teacher || teacher.removedAt !== null || teacher.status !== 'active') {
		return { ok: false, message: 'That teacher is not taking students right now.' };
	}
	if (teacher.cid === enrollment.cid) {
		return { ok: false, message: 'Nobody is their own teacher.' };
	}
	if (!mayTeach(enrollment.course, levels.get(teacher.cid))) {
		return { ok: false, message: 'That teacher is not qualified to teach this course.' };
	}

	const label = teacherLabel(teacher, people.get(teacher.cid));

	return onCard(db, env, enrollment, 'assign teacher', async (config, issueKey) => {
		// By option id, because the board's spelling is not ours.
		const option = await findSelectOption(config, issueKey, TEACHER_FIELD, [
			teacher.initials,
			teacher.cid
		]);
		if (!option) {
			return {
				ok: false,
				message: `TRK's Teacher list has no option for ${teacher.initials ?? teacher.cid}. Add it on the board, then try again.`
			};
		}

		await updateIssueFields(config, issueKey, {
			[TEACHER_FIELD]: { id: option.id },
			[JIRA_FIELDS.teacherAssigned]: toFacilityDate(now)
		});
		await transitionIssueToStatus(config, issueKey, IN_TRAINING_STATUS);
		await note(config, issueKey, `${label} assigned as teacher by ${by}.`);
	});
}

/**
 * Give a student who already has a teacher a different one. Only `Teacher` on
 * the card changes: the card stays where it is, and `Teacher Assigned` keeps
 * the day their training began.
 *
 * The same rules as a first assignment: the new teacher must be active and
 * qualified for the course, and nobody is their own teacher.
 */
export async function changeTeacher(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	teacherCid: string,
	by: string
): Promise<FlowResult> {
	if (enrollment.status === 'waitlist') {
		return { ok: false, message: 'They have no teacher yet. Assign one instead.' };
	}

	const [teachers, levels, people] = await Promise.all([
		listTeachers(db),
		getAllCurrentQualifications(db),
		getPeople(db)
	]);
	const teacher = teachers.find((candidate) => candidate.cid === teacherCid);

	if (!teacher || teacher.removedAt !== null || teacher.status !== 'active') {
		return { ok: false, message: 'That teacher is not taking students right now.' };
	}
	if (teacher.cid === enrollment.cid) {
		return { ok: false, message: 'Nobody is their own teacher.' };
	}
	if (!mayTeach(enrollment.course, levels.get(teacher.cid))) {
		return { ok: false, message: 'That teacher is not qualified to teach this course.' };
	}
	if (isAssignedTo(enrollment.teacher, teacher)) {
		return { ok: false, message: 'That is already their teacher.' };
	}

	const label = teacherLabel(teacher, people.get(teacher.cid));
	const was = enrollment.teacher ?? 'nobody';

	return onCard(db, env, enrollment, 'change teacher', async (config, issueKey) => {
		const option = await findSelectOption(config, issueKey, TEACHER_FIELD, [
			teacher.initials,
			teacher.cid
		]);
		if (!option) {
			return {
				ok: false,
				message: `TRK's Teacher list has no option for ${teacher.initials ?? teacher.cid}. Add it on the board, then try again.`
			};
		}

		await updateIssueFields(config, issueKey, { [TEACHER_FIELD]: { id: option.id } });
		await note(config, issueKey, `Teacher changed from ${was} to ${label} by ${by}.`);
	});
}

/** TRK's status for someone staff took off the list. Matched by name. */
const REMOVED_STATUS = 'Removed';

/**
 * Staff take someone off the list: the card moves to Removed. For a request
 * staff are ending — no response, no longer eligible — as opposed to one the
 * student is giving up, which is `withdrawStudent()`.
 */
export async function removeStudent(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'remove student', async (config, issueKey) => {
		await transitionIssueToStatus(config, issueKey, REMOVED_STATUS);
		await note(config, issueKey, `Removed by ${by}.`);
	});
}

/**
 * Staff record that the student has withdrawn: the card moves to Withdrawn,
 * the same place it goes when the student withdraws themselves, with a comment
 * saying who recorded it. Kept apart from Removed so a report can still tell
 * "they left" from "we removed them".
 */
export async function withdrawStudent(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'withdraw student', async (config, issueKey) => {
		await transitionIssueToStatus(config, issueKey, WITHDRAWN_STATUS);
		await note(config, issueKey, `Withdrawn at the student's request, recorded by ${by}.`);
	});
}

export type AcademyPassResult = {
	/** Requests with a VATUSA course assigned and not yet passed. */
	pending: number;
	/** Of those, how many VATUSA's transcript shows as passed, now dated. */
	completed: number;
	skipped?: 'no-api-key' | 'jira-not-configured';
};

/** How many transcripts one run reads: one call to VATUSA each. */
const TRANSCRIPT_BATCH = 20;

/**
 * Date the card for anyone who has passed the VATUSA written course since it
 * was assigned, by reading their transcript. Run by the cron, so staff do not
 * have to watch VATUSA and press a button.
 *
 * Only requests whose course was assigned are checked: that is the list of
 * people someone is waiting on. One failing is logged and the rest still run.
 */
export async function completePassedVatusaCourses(
	db: Database,
	env: Partial<Env> | undefined
): Promise<AcademyPassResult> {
	const key = vatusaKey(env);
	if (!key) return { pending: 0, completed: 0, skipped: 'no-api-key' };
	if (!resolveJiraConfig(env)) return { pending: 0, completed: 0, skipped: 'jira-not-configured' };

	const open = (
		await db
			.select()
			.from(enrollmentsTable)
			.where(
				and(
					isNotNull(enrollmentsTable.vatusaAssignedOn),
					isNull(enrollmentsTable.vatusaCompletedOn),
					isNotNull(enrollmentsTable.jiraIssueKey),
					isNull(enrollmentsTable.withdrawnAt)
				)
			)
			// Longest unchecked first, so a backlog larger than a batch still drains.
			.orderBy(asc(enrollmentsTable.jiraStatusSyncedAt))
	).filter(
		(enrollment) =>
			!(CLOSED_ENROLLMENT_STATUSES as readonly string[]).includes(enrollment.status) &&
			academyExamFor(enrollment.course) !== null
	);

	let completed = 0;

	for (const enrollment of open.slice(0, TRANSCRIPT_BATCH)) {
		try {
			const exam = academyExamFor(enrollment.course)!;
			const transcript = await fetchAcademyTranscript(key, enrollment.cid);
			const passed = firstPass(transcript[exam]);

			if (!passed) {
				// Touch the row so the next run checks someone else first.
				await syncEnrollmentIssue(db, env, enrollment.jiraIssueKey!);
				continue;
			}

			const result = await completeVatusaCourse(db, env, enrollment, null, passed);
			if (result.ok) completed += 1;
		} catch (err) {
			console.error(
				'[training-tools] VATUSA transcript check failed',
				enrollment.cid,
				err instanceof VatusaError ? err.message : err
			);
		}
	}

	return { pending: open.length, completed };
}

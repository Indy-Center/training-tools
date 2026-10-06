import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { FACILITY_ID } from '$lib/config';
import { findCourse } from '$lib/courses';
import { CLOSED_ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import { resolveJiraConfig } from '$lib/server/jira/client';
import { transitionIssueToStatus } from '$lib/server/jira/enrollment';
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
import { slotSummary } from '$lib/teachers';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { academyExamFor, firstPass, pickAcademyAssigner, teacherGate } from '$lib/vatusa-academy';
import type { TeacherChoice, WaitlistRow } from '$lib/waitlist';
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

/** Everyone on the waitlist, by course and then by how long they have waited. */
export async function getWaitlistSheet(db: Database, jiraBaseUrl?: string): Promise<WaitlistRow[]> {
	const [waiting, people, teachers, levels, assigned] = await Promise.all([
		db
			.select()
			.from(enrollmentsTable)
			.where(and(eq(enrollmentsTable.status, 'waitlist'), isNull(enrollmentsTable.withdrawnAt)))
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

	const seen = new Map<string, number>();

	return waiting
		.map((enrollment): WaitlistRow => {
			const position = (seen.get(enrollment.course) ?? 0) + 1;
			seen.set(enrollment.course, position);
			const person = people.get(enrollment.cid);

			return {
				id: enrollment.id,
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
		.sort((a, b) => a.course.localeCompare(b.course) || a.position - b.position);
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
 * Assign the VATUSA written course, and date the card.
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
): Promise<FlowResult & { byHand?: string }> {
	const exam = academyExamFor(enrollment.course);
	if (!exam) return { ok: false, message: 'This course has no VATUSA written course.' };
	if (enrollment.vatusaAssignedOn) {
		return { ok: false, message: 'The VATUSA course is already marked as assigned.' };
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

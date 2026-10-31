import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { afterTrainingOptions } from '$lib/course-completion';
import { COURSES } from '$lib/courses';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import { issueUrl, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { findSelectOption, updateIssueFields } from '$lib/server/jira/progress';
import { RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import { recordFacilityDay, type CtrsRecord } from '$lib/server/ctrs-records';
import { fetchCtrsRecords } from '$lib/server/vatusa';
import { notify } from '$lib/server/notify';
import { completeExam, completeTraining, failExam } from './completion';
import {
	decideRatingExam,
	decideRecommend,
	type RatingExamDecision,
	type RecommendDecision,
	type RosterTeacher
} from './ctrs-decisions';
import {
	ctrsRecommendNotice,
	ctrsTeacherRecordNotice,
	ctrsUnclearCourseNotice,
	ctrsUnclearRecommendNotice,
	type NoticeRequest
} from './notices';

/**
 * The CTRS read-back: a record filed on VATUSA's own form moves the card as a
 * training report through the app would have. The rules are in
 * `./ctrs-decisions.ts`; this is the reads and the writes. See decisions/0038.
 */

/** What one half of the read-back did in a run. */
export type CtrsHalfResult = {
	/** Cards whose student's records were read. */
	checked: number;
	/** Cards moved on a pass. */
	passed: number;
	/** Cards moved on a fail. */
	failed: number;
	/** Training admins told about a record that moved nothing. */
	told: number;
	/** Cards that could not be read or acted on; each is logged. */
	errors: number;
};

/** What the In Training half did in a run. */
export type CtrsInTrainingResult = {
	/** Cards whose student's records were read. */
	checked: number;
	/** Cards moved to Rating Exam on a Recommend. */
	moved: number;
	/** Training admins told about a Recommend that moved nothing. */
	told: number;
	/** Cards that could not be read or acted on; each is logged. */
	errors: number;
};

/**
 * The `ctrs records` job's result: one entry per half, the Rating Exam half
 * (pass or fail) then the In Training half (Recommend, `ots_status` 3).
 */
export type CtrsRecordsResult = {
	ratingExam: CtrsHalfResult;
	inTraining: CtrsInTrainingResult;
	skipped?: 'no-api-key' | 'jira-not-configured';
};

const emptyHalf = (): CtrsHalfResult => ({ checked: 0, passed: 0, failed: 0, told: 0, errors: 0 });
const emptyInTraining = (): CtrsInTrainingResult => ({ checked: 0, moved: 0, told: 0, errors: 0 });

/** Cards the In Training half reads in one run. */
export const IN_TRAINING_BATCH = 20;

/** The courses whose training can end in a rating exam: the only ones a Recommend moves. */
const COURSES_WITH_AN_EXAM = COURSES.map((course) => course.code).filter((code) =>
	afterTrainingOptions(code).includes('rating-exam')
);

/** Who a step taken from the read-back is by. The comment replaces the note that names them. */
const BY = "VATUSA's CTRS records";

/** Statuses at which a card is open for the Custom Training rule (0038). */
const OPEN_FOR_CUSTOM = ['in-training', 'rating-exam'] as const;

/** Read every student's CTRS records back, and act on them. */
export async function checkCtrsRecords(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<CtrsRecordsResult> {
	const idle = { ratingExam: emptyHalf(), inTraining: emptyInTraining() };
	if (!env?.VATUSA_API_KEY?.trim()) return { ...idle, skipped: 'no-api-key' };
	const config = resolveJiraConfig(env);
	if (!config) return { ...idle, skipped: 'jira-not-configured' };

	// Former teachers too: a record they filed still names them.
	const teachers: RosterTeacher[] = await db
		.select({ cid: teachersTable.cid, initials: teachersTable.initials })
		.from(teachersTable);

	// Read once, before either half acts: a card moved earlier in this run still
	// counts as open for the Custom Training rule.
	const open = await openCards(db);

	const ratingExam = await readBackRatingExams(db, env, config, teachers, open, now);
	const inTraining = await readBackRecommends(db, env, config, teachers, open, now);
	return { ratingExam, inTraining };
}

/**
 * Up to `IN_TRAINING_BATCH` cards In Training on a course that can end in an
 * exam, the least recently checked first (never checked first of all). Each
 * one read is stamped `ctrs_checked_at`, whatever came of it, so a card whose
 * read keeps failing doesn't hold the queue.
 */
async function readBackRecommends(
	db: Database,
	env: Partial<Env>,
	config: JiraConfig,
	teachers: readonly RosterTeacher[],
	open: OpenCards,
	now: Date
): Promise<CtrsInTrainingResult> {
	const result = emptyInTraining();
	const cards = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.status, 'in-training'),
				inArray(enrollmentsTable.course, COURSES_WITH_AN_EXAM),
				isNotNull(enrollmentsTable.jiraIssueKey),
				isNotNull(enrollmentsTable.statusSince),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		// SQLite sorts null first when ascending.
		.orderBy(asc(enrollmentsTable.ctrsCheckedAt), asc(enrollmentsTable.createdAt))
		.limit(IN_TRAINING_BATCH);

	for (const card of cards) {
		result.checked += 1;
		try {
			await readBackRecommend(db, env, config, teachers, open, card, result, now);
		} catch (err) {
			console.error('[training-tools] ctrs records: failed on', card.jiraIssueKey, err);
			result.errors += 1;
		} finally {
			// Only the stamp: not guarded by the card's status, which may have just changed.
			await db
				.update(enrollmentsTable)
				.set({ ctrsCheckedAt: now })
				.where(eq(enrollmentsTable.id, card.id))
				.catch((err) => console.error('[training-tools] ctrs records: could not stamp', err));
		}
	}

	return result;
}

async function readBackRecommend(
	db: Database,
	env: Partial<Env>,
	config: JiraConfig,
	teachers: readonly RosterTeacher[],
	open: OpenCards,
	card: Enrollment,
	result: CtrsInTrainingResult,
	now: Date
): Promise<void> {
	let records: CtrsRecord[];
	try {
		records = await fetchCtrsRecords(env, card.cid);
	} catch (err) {
		console.error('[training-tools] ctrs records: could not read', card.jiraIssueKey, err);
		result.errors += 1;
		return;
	}

	const decision = decideRecommend({
		card,
		records,
		teachers,
		otherOpenCards: card.course === 'CUSTOM' && hasOtherOpenCard(open, card)
	});

	if (decision.action === 'nothing') return;

	if (decision.action === 'tell') {
		if (await tellRecommend(db, env, card, decision)) result.told += 1;
		return;
	}

	const { record, instructorCid, completedOn } = decision;
	const name = await rosterName(db, instructorCid);
	const filedBy = name ? `${name} (${instructorCid})` : instructorCid;
	const step = await completeTraining(
		db,
		env,
		card,
		BY,
		'rating-exam',
		`Recommended for a rating exam: CTRS record ${record.id} of ${completedOn}, filed by ${filedBy}, found in VATUSA's records.`,
		completedOn,
		now
	);
	if (step.ok) result.moved += 1;
	else {
		console.error('[training-tools] ctrs records: could not move', card.jiraIssueKey, step.message);
		result.errors += 1;
	}
}

/** As `tell`, for a Recommend. True when the notice was sent. */
async function tellRecommend(
	db: Database,
	env: Partial<Env>,
	card: Enrollment,
	decision: Extract<RecommendDecision, { action: 'tell' }>
): Promise<boolean> {
	const { record, instructorCid } = decision;
	const request: NoticeRequest = {
		name: card.submittedName,
		cid: card.cid,
		course: card.course,
		teacher: card.teacher,
		examiner: card.reInstructor,
		issueKey: card.jiraIssueKey,
		issueUrl: issueUrl(env.JIRA_BASE_URL, card.jiraIssueKey)
	};
	const about = { id: record.id, day: recordFacilityDay(record), position: record.position };

	const notice =
		decision.reason === 'unclear-course'
			? ctrsUnclearRecommendNotice(request, about)
			: ctrsRecommendNotice(request, {
					...about,
					filedBy: instructorCid ? ((await rosterName(db, instructorCid)) ?? instructorCid) : null
				});

	const outcome = await notify(env, notice);
	if (outcome === 'failed') return false;

	await db
		.update(enrollmentsTable)
		.set({ ctrsNotice: String(record.id) })
		.where(and(eq(enrollmentsTable.id, card.id), eq(enrollmentsTable.status, card.status)));

	return outcome === 'sent';
}

/**
 * Every card at Rating Exam with a key and a `statusSince`: a pass or fail
 * filed since it got there moves it. One card failing is logged and counted,
 * and the next is still checked.
 */
async function readBackRatingExams(
	db: Database,
	env: Partial<Env>,
	config: JiraConfig,
	teachers: readonly RosterTeacher[],
	open: OpenCards,
	now: Date
): Promise<CtrsHalfResult> {
	const result = emptyHalf();
	const cards = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.status, 'rating-exam'),
				isNotNull(enrollmentsTable.jiraIssueKey),
				isNotNull(enrollmentsTable.statusSince),
				isNull(enrollmentsTable.withdrawnAt)
			)
		);

	for (const card of cards) {
		result.checked += 1;

		let records: CtrsRecord[];
		try {
			records = await fetchCtrsRecords(env, card.cid);
		} catch (err) {
			console.error('[training-tools] ctrs records: could not read', card.jiraIssueKey, err);
			result.errors += 1;
			continue;
		}

		try {
			const decision = decideRatingExam({
				card,
				records,
				teachers,
				otherOpenCards: card.course === 'CUSTOM' && hasOtherOpenCard(open, card)
			});
			const outcome = await carryOut(db, env, config, card, decision, now);
			if (outcome) result[outcome] += 1;
		} catch (err) {
			console.error('[training-tools] ctrs records: failed on', card.jiraIssueKey, err);
			result.errors += 1;
		}
	}

	return result;
}

async function carryOut(
	db: Database,
	env: Partial<Env>,
	config: JiraConfig,
	card: Enrollment,
	decision: RatingExamDecision,
	now: Date
): Promise<'passed' | 'failed' | 'told' | 'errors' | null> {
	const issueKey = card.jiraIssueKey!;

	switch (decision.action) {
		case 'nothing':
			return null;

		case 'unsettled':
			console.warn(
				'[training-tools] ctrs records: a record with no instructor, not acted on',
				JSON.stringify({ issue: issueKey, record: decision.record.id })
			);
			return 'errors';

		case 'tell':
			return (await tell(db, env, card, decision)) ? 'told' : null;

		case 'act': {
			const { record, examiner, instructorCid, examinedOn } = decision;
			let line: string | null = null;

			if (examiner.kind === 'fill') {
				const option = await findSelectOption(
					config,
					issueKey,
					RE_INSTRUCTOR_FIELD,
					examiner.candidates
				);
				if (!option) {
					console.error(
						'[training-tools] ctrs records: RE Instructor offers neither the instructor nor VATUSA',
						JSON.stringify({ issue: issueKey, candidates: examiner.candidates })
					);
					return 'errors';
				}
				await updateIssueFields(config, issueKey, { [RE_INSTRUCTOR_FIELD]: { id: option.id } });
				line = `RE Instructor set to ${option.value}.`;
			} else if (examiner.kind === 'named') {
				line = `The card's examiner is ${examiner.examiner}.`;
			}

			const name = await rosterName(db, instructorCid);
			const filedBy = name ? `${name} (${instructorCid})` : instructorCid;
			const found = `CTRS record ${record.id} of ${examinedOn}, filed by ${filedBy}, found in VATUSA's records.`;
			const comment = (text: string) => (line ? `${text} ${line}` : text);

			if (decision.result === 'pass') {
				const step = await completeExam(
					db,
					env,
					card,
					BY,
					comment(`Rating exam passed: ${found}`),
					examinedOn,
					now
				);
				return step.ok ? 'passed' : 'errors';
			}
			const step = await failExam(
				db,
				env,
				card,
				BY,
				comment(`Rating exam not passed: ${found} Training Completed cleared.`)
			);
			return step.ok ? 'failed' : 'errors';
		}
	}
}

/**
 * Tell the training admins, and remember the record so it is told once. Not
 * remembered if Larry refuses, so the next run tries again (as 0024's hold).
 * True when the notice was sent.
 */
async function tell(
	db: Database,
	env: Partial<Env>,
	card: Enrollment,
	decision: Extract<RatingExamDecision, { action: 'tell' }>
): Promise<boolean> {
	const { record, instructorCid } = decision;
	const request: NoticeRequest = {
		name: card.submittedName,
		cid: card.cid,
		course: card.course,
		teacher: card.teacher,
		examiner: card.reInstructor,
		issueKey: card.jiraIssueKey,
		issueUrl: issueUrl(env.JIRA_BASE_URL, card.jiraIssueKey)
	};
	const about = {
		id: record.id,
		day: recordFacilityDay(record),
		result: record.otsStatus === 1 ? ('pass' as const) : ('fail' as const),
		position: record.position
	};

	const notice =
		decision.reason === 'teacher'
			? ctrsTeacherRecordNotice(request, {
					...about,
					filedBy: (await rosterName(db, instructorCid!)) ?? instructorCid!
				})
			: ctrsUnclearCourseNotice(request, about);

	const outcome = await notify(env, notice);
	if (outcome === 'failed') return false;

	await db
		.update(enrollmentsTable)
		.set({ ctrsNotice: String(record.id) })
		.where(and(eq(enrollmentsTable.id, card.id), eq(enrollmentsTable.status, card.status)));

	return outcome === 'sent';
}

/** The cards open for the Custom Training rule, as they stood when the job started. */
type OpenCards = readonly { id: string; cid: string }[];

async function openCards(db: Database): Promise<OpenCards> {
	return db
		.select({ id: enrollmentsTable.id, cid: enrollmentsTable.cid })
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...OPEN_FOR_CUSTOM]),
				isNull(enrollmentsTable.withdrawnAt)
			)
		);
}

/** Whether the student had another card open In Training or at Rating Exam. */
function hasOtherOpenCard(open: OpenCards, card: Enrollment): boolean {
	return open.some((other) => other.cid === card.cid && other.id !== card.id);
}

/**
 * The roster mirror's name for a CID, removed members included, or null. The
 * teacher roster holds no names of its own.
 */
async function rosterName(db: Database, cid: string): Promise<string | null> {
	const person = await db.query.rosterMembersTable.findFirst({
		where: eq(rosterMembersTable.cid, cid)
	});
	const name = person ? `${person.firstName} ${person.lastName}`.trim() : '';
	return name || null;
}

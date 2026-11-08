import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { afterTrainingOptions } from '$lib/course-completion';
import { COURSES } from '$lib/courses';
import { examResultOf } from '$lib/ctrs';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import { issueUrl, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { findSelectOption, updateIssueFields } from '$lib/server/jira/progress';
import { RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import { recordFacilityDay, type CtrsRecord } from '$lib/server/ctrs-records';
import { fetchCtrsRecords } from '$lib/server/vatusa';
import { notify, type Notice } from '$lib/server/notify';
import { completeExam, completeTraining, failExam } from './completion';
import {
	decideRatingExam,
	decideRecommend,
	type RatingExamDecision,
	type RecommendDecision,
	type RosterTeacher
} from './ctrs-decisions';
import {
	ctrsNoInstructorNotice,
	ctrsRecommendNotice,
	ctrsTeacherRecordNotice,
	ctrsUnclearCourseNotice,
	type CtrsRecordNotice
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

/** A record either half tells the training admins about instead of acting on. */
type TellDecision = Extract<RatingExamDecision | RecommendDecision, { action: 'tell' }>;

/** What every card read in one run shares. */
type Run = {
	db: Database;
	env: Partial<Env>;
	config: JiraConfig;
	/** Former teachers too: a record they filed still names them. */
	teachers: readonly RosterTeacher[];
	/**
	 * The cards open for the Custom Training rule, read once before either half
	 * acts: a card moved earlier in this run still counts as open.
	 */
	open: readonly { id: string; cid: string }[];
	now: Date;
};

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

	const run: Run = {
		db,
		env,
		config,
		teachers: await db
			.select({ cid: teachersTable.cid, initials: teachersTable.initials })
			.from(teachersTable),
		open: await db
			.select({ id: enrollmentsTable.id, cid: enrollmentsTable.cid })
			.from(enrollmentsTable)
			.where(
				and(
					inArray(enrollmentsTable.status, [...OPEN_FOR_CUSTOM]),
					isNull(enrollmentsTable.withdrawnAt)
				)
			),
		now
	};

	const ratingExam = await readBackRatingExams(run);
	const inTraining = await readBackRecommends(run);
	return { ratingExam, inTraining };
}

/**
 * Every card at Rating Exam with a key and a `statusSince`: a pass or fail
 * filed since it got there moves it. One card failing is logged and counted,
 * and the next is still checked.
 */
async function readBackRatingExams(run: Run): Promise<CtrsHalfResult> {
	const result = emptyHalf();
	const cards = await run.db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.status, 'rating-exam'),
				isNotNull(enrollmentsTable.jiraIssueKey),
				isNotNull(enrollmentsTable.statusSince),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		// The oldest request first; the same moment, by id.
		.orderBy(asc(enrollmentsTable.createdAt), asc(enrollmentsTable.id));

	for (const card of cards) {
		result.checked += 1;
		try {
			const records = await readRecords(run, card);
			const decision = decideRatingExam({
				card,
				records,
				teachers: run.teachers,
				otherOpenCards: hasOtherOpenCard(run, card)
			});
			if (decision.action === 'tell') {
				if (await tell(run, card, decision)) result.told += 1;
			} else if (decision.action === 'act') {
				result[await actOnExam(run, card, decision)] += 1;
			}
		} catch (err) {
			console.error('[training-tools] ctrs records: failed on', card.jiraIssueKey, err);
			result.errors += 1;
		}
	}

	return result;
}

/** Move a Rating Exam card on a pass or fail; which count it adds to. */
async function actOnExam(
	run: Run,
	card: Enrollment,
	decision: Extract<RatingExamDecision, { action: 'act' }>
): Promise<'passed' | 'failed' | 'errors'> {
	const { db, env, config, now } = run;
	const { record, examiner, instructorCid, examinedOn } = decision;
	const issueKey = card.jiraIssueKey!;
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

	const found = await foundIn(db, record, examinedOn, instructorCid);
	const comment = (text: string) => (line ? `${text} ${line}` : text);

	if (decision.result === 'passed') {
		const step = await completeExam(db, env, card, BY, {
			comment: comment(`Rating exam passed: ${found}`),
			completedOn: examinedOn,
			now
		});
		return step.ok ? 'passed' : 'errors';
	}
	const step = await failExam(db, env, card, BY, {
		comment: comment(`Rating exam not passed: ${found}`)
	});
	return step.ok ? 'failed' : 'errors';
}

/**
 * Up to `IN_TRAINING_BATCH` cards In Training on a course that can end in an
 * exam, the least recently checked first (never checked first of all). Each
 * one read is stamped `ctrs_checked_at`, whatever came of it, so a card whose
 * read keeps failing doesn't hold the queue.
 */
async function readBackRecommends(run: Run): Promise<CtrsInTrainingResult> {
	const result = emptyInTraining();
	const cards = await run.db
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
			const records = await readRecords(run, card);
			const decision = decideRecommend({
				card,
				records,
				teachers: run.teachers,
				otherOpenCards: hasOtherOpenCard(run, card)
			});
			if (decision.action === 'tell') {
				if (await tell(run, card, decision)) result.told += 1;
			} else if (decision.action === 'act') {
				const { record, instructorCid, completedOn } = decision;
				const found = await foundIn(run.db, record, completedOn, instructorCid);
				const step = await completeTraining(run.db, run.env, card, BY, 'rating-exam', {
					comment: `Recommended for a rating exam: ${found}`,
					completedOn,
					now: run.now
				});
				if (step.ok) result.moved += 1;
				else {
					console.error(
						'[training-tools] ctrs records: could not move',
						card.jiraIssueKey,
						step.message
					);
					result.errors += 1;
				}
			}
		} catch (err) {
			console.error('[training-tools] ctrs records: failed on', card.jiraIssueKey, err);
			result.errors += 1;
		} finally {
			// Only the stamp: not guarded by the card's status, which may have just changed.
			await run.db
				.update(enrollmentsTable)
				.set({ ctrsCheckedAt: run.now })
				.where(eq(enrollmentsTable.id, card.id))
				.catch((err) => console.error('[training-tools] ctrs records: could not stamp', err));
		}
	}

	return result;
}

/** The student's records. Throws on a VATUSA error, which the caller counts for this card. */
async function readRecords(run: Run, card: Enrollment): Promise<CtrsRecord[]> {
	try {
		return await fetchCtrsRecords(run.env, card.cid);
	} catch (err) {
		throw new Error(`could not read the CTRS records for ${card.jiraIssueKey}`, { cause: err });
	}
}

/** Whether a Custom Training card's student had another card open In Training or at Rating Exam. */
function hasOtherOpenCard(run: Run, card: Enrollment): boolean {
	return (
		card.course === 'CUSTOM' &&
		run.open.some((other) => other.cid === card.cid && other.id !== card.id)
	);
}

/** "CTRS record 501 of 2026-10-25, filed by Casey Dunn (1000900), found in VATUSA's records." */
async function foundIn(
	db: Database,
	record: CtrsRecord,
	day: string,
	instructorCid: string
): Promise<string> {
	const name = await rosterName(db, instructorCid);
	const filedBy = name ? `${name} (${instructorCid})` : instructorCid;
	return `CTRS record ${record.id} of ${day}, filed by ${filedBy}, found in VATUSA's records.`;
}

/**
 * Tell the training admins, and remember the record so it is told once. Not
 * remembered if Larry refuses, so the next run tries again (as 0024's hold).
 * True when the notice was sent.
 */
async function tell(run: Run, card: Enrollment, decision: TellDecision): Promise<boolean> {
	const outcome = await notify(run.env, await noticeFor(run, card, decision));
	if (outcome === 'failed') return false;

	await run.db
		.update(enrollmentsTable)
		.set({ ctrsNotice: String(decision.record.id) })
		.where(and(eq(enrollmentsTable.id, card.id), eq(enrollmentsTable.status, card.status)));

	return outcome === 'sent';
}

async function noticeFor(
	run: Run,
	card: Enrollment,
	{ reason, record, instructorCid }: TellDecision
): Promise<Notice> {
	const request = {
		name: card.submittedName,
		cid: card.cid,
		course: card.course,
		teacher: card.teacher,
		examiner: card.reInstructor,
		issueKey: card.jiraIssueKey,
		issueUrl: issueUrl(run.env.JIRA_BASE_URL, card.jiraIssueKey)
	};
	const about: CtrsRecordNotice = {
		id: record.id,
		day: recordFacilityDay(record),
		// Only passes, fails and Recommends are matched.
		says: examResultOf(record.otsStatus) ?? 'recommend',
		position: record.position
	};

	if (reason === 'unclear-course') return ctrsUnclearCourseNotice(request, about);
	if (instructorCid === null) return ctrsNoInstructorNotice(request, about);

	const filedBy = (await rosterName(run.db, instructorCid)) ?? instructorCid;
	return reason === 'teacher'
		? ctrsTeacherRecordNotice(request, { ...about, filedBy })
		: ctrsRecommendNotice(request, { ...about, filedBy });
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

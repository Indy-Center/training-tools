import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
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
import { completeExam, failExam } from './completion';
import { decideRatingExam, type RatingExamDecision, type RosterTeacher } from './ctrs-decisions';
import { ctrsTeacherRecordNotice, ctrsUnclearCourseNotice, type NoticeRequest } from './notices';

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

/**
 * The `ctrs records` job's result: one entry per half. The In Training half
 * (Recommend, `ots_status` 3) goes beside `ratingExam`.
 */
export type CtrsRecordsResult = {
	ratingExam: CtrsHalfResult;
	skipped?: 'no-api-key' | 'jira-not-configured';
};

const emptyHalf = (): CtrsHalfResult => ({ checked: 0, passed: 0, failed: 0, told: 0, errors: 0 });

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
	if (!env?.VATUSA_API_KEY?.trim()) return { ratingExam: emptyHalf(), skipped: 'no-api-key' };
	const config = resolveJiraConfig(env);
	if (!config) return { ratingExam: emptyHalf(), skipped: 'jira-not-configured' };

	// Former teachers too: a record they filed still names them.
	const teachers: RosterTeacher[] = await db
		.select({ cid: teachersTable.cid, initials: teachersTable.initials })
		.from(teachersTable);

	const ratingExam = await readBackRatingExams(db, env, config, teachers, now);
	return { ratingExam };
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
				otherOpenCards: card.course === 'CUSTOM' && (await hasOtherOpenCard(db, card))
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

/** Whether the student has another card open In Training or at Rating Exam. */
async function hasOtherOpenCard(db: Database, card: Enrollment): Promise<boolean> {
	const other = await db
		.select({ id: enrollmentsTable.id })
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.cid, card.cid),
				ne(enrollmentsTable.id, card.id),
				inArray(enrollmentsTable.status, [...OPEN_FOR_CUSTOM]),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		.limit(1);
	return other.length > 0;
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

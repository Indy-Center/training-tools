import {
	examResultOf,
	OTS_NOT_PASSED,
	OTS_PASSED,
	OTS_RECOMMENDED,
	type ExamResult,
	type OtsStatus
} from '$lib/ctrs';
import type { Enrollment } from '$lib/db/schema/enrollments';
import type { Teacher } from '$lib/db/schema/teachers';
import {
	latestMatchingRecord,
	positionTypeFor,
	recordFacilityDay,
	type CtrsRecord
} from '$lib/server/ctrs-records';
import { isAssignedTo } from '$lib/teachers';

/**
 * What the CTRS read-back does with a card, given ZID's records for its student.
 * Pure: the writes are in `./ctrs-read-back.ts`. See decisions/0038.
 */

/** The teacher roster, current and former, as the rule reads it. */
export type RosterTeacher = Pick<Teacher, 'cid' | 'initials'>;

/** The `RE Instructor` option a card is given when it has none: the last is the division's. */
export const VATUSA_EXAMINER = 'VATUSA';

/** What the card's comment says about its examiner. */
export type ExamExaminer =
	/** RE Instructor is empty: set it to the first of these the dropdown offers. */
	| { kind: 'fill'; candidates: string[] }
	/** RE Instructor names someone other than the record's instructor. */
	| { kind: 'named'; examiner: string }
	/** RE Instructor already names the record's instructor. */
	| { kind: 'same' };

/** Don't move the card; tell the training admins, once for this record. */
type Tell<Reason> = {
	action: 'tell';
	reason: Reason;
	record: CtrsRecord;
	instructorCid: string | null;
};

/** As much of a request as the Rating Exam rule reads. */
export type ExamCard = Pick<
	Enrollment,
	'course' | 'teacher' | 'reInstructor' | 'statusSince' | 'ctrsNotice'
>;

/**
 * `teacher`: filed by the student's teacher. `no-instructor`: VATUSA names
 * nobody, so who examined can't be checked. `unclear-course`: Custom Training
 * with another open card.
 */
export type RatingExamTellReason = 'teacher' | 'no-instructor' | 'unclear-course';

export type RatingExamDecision =
	| { action: 'nothing' }
	| Tell<RatingExamTellReason>
	| {
			action: 'act';
			result: ExamResult;
			record: CtrsRecord;
			instructorCid: string;
			/** The record's facility day, `YYYY-MM-DD`: what `RE Completed` is set to. */
			examinedOn: string;
			examiner: ExamExaminer;
	  };

const NOTHING = { action: 'nothing' } as const;

/** The record that counts for a card, and what the rule needs to know about it. */
type Match = {
	record: CtrsRecord;
	/** The training admins were already told about this record. */
	told: boolean;
	instructor: { cid: string; initials: string | null } | null;
};

/**
 * The latest record with one of `statuses` filed since the card entered its
 * status, on the course's position type (any, for Custom Training). Null when
 * there is none, or when the rule never acts on it: a Custom Training card
 * that was told about a record holds it as unclear for good.
 */
function match(
	card: Pick<Enrollment, 'course' | 'statusSince' | 'ctrsNotice'>,
	records: readonly CtrsRecord[],
	teachers: readonly RosterTeacher[],
	statuses: readonly OtsStatus[]
): Match | null {
	if (!card.statusSince) return null;
	const positionType = positionTypeFor(card.course);
	if (positionType === undefined) return null;

	const record = latestMatchingRecord(records, { positionType, since: card.statusSince, statuses });
	if (!record) return null;

	const told = card.ctrsNotice === String(record.id);
	if (card.course === 'CUSTOM' && told) return null;

	const cid = record.instructorId === null ? null : String(record.instructorId);
	const instructor = cid
		? { cid, initials: teachers.find((teacher) => teacher.cid === cid)?.initials ?? null }
		: null;
	return { record, told, instructor };
}

/** Tell, unless the admins were already told about this record. */
function tellOnce<Reason extends string>(
	{ record, told, instructor }: Match,
	reason: Reason
): typeof NOTHING | Tell<Reason> {
	return told
		? NOTHING
		: { action: 'tell', reason, record, instructorCid: instructor?.cid ?? null };
}

/**
 * A card at Rating Exam: does a pass or fail filed on VATUSA since it got there
 * move it, tell the training admins, or do nothing?
 *
 * - Matched on the course's position type; Custom Training has none, so it
 *   matches a record of any type, but only while it is the student's only open
 *   card (`otherOpenCards` false). Otherwise the course is unclear: told.
 * - A record that names no instructor moves nothing: whether the examiner was
 *   the teacher can't be checked. Told.
 * - A record whose instructor is the student's teacher on the card moves
 *   nothing (0021: the examiner is never the teacher): told.
 * - Each record is told once: not again while `ctrsNotice` holds its id. A
 *   Custom Training card never acts on a record whose id it holds.
 */
export function decideRatingExam(input: {
	card: ExamCard;
	records: readonly CtrsRecord[];
	teachers: readonly RosterTeacher[];
	otherOpenCards: boolean;
}): RatingExamDecision {
	const { card, records, teachers, otherOpenCards } = input;
	const found = match(card, records, teachers, [OTS_PASSED, OTS_NOT_PASSED]);
	if (!found) return NOTHING;
	const { record, instructor } = found;

	if (card.course === 'CUSTOM' && otherOpenCards) return tellOnce(found, 'unclear-course');
	if (!instructor) return tellOnce(found, 'no-instructor');
	if (isAssignedTo(card.teacher, instructor)) return tellOnce(found, 'teacher');

	const onCard = card.reInstructor?.trim();
	const examiner: ExamExaminer = !onCard
		? {
				kind: 'fill',
				candidates: [
					...(instructor.initials ? [instructor.initials] : []),
					instructor.cid,
					VATUSA_EXAMINER
				]
			}
		: isAssignedTo(onCard, instructor)
			? { kind: 'same' }
			: { kind: 'named', examiner: onCard };

	return {
		action: 'act',
		// Matched on pass and fail only, so there is always a result.
		result: examResultOf(record.otsStatus)!,
		record,
		instructorCid: instructor.cid,
		examinedOn: recordFacilityDay(record),
		examiner
	};
}

/** As much of a request as the In Training rule reads. */
export type RecommendCard = Pick<Enrollment, 'course' | 'teacher' | 'statusSince' | 'ctrsNotice'>;

/**
 * `not-teacher`: filed by someone else. `no-instructor`: VATUSA names nobody.
 * `no-teacher`: the card has no teacher. `unclear-course`: Custom Training with
 * another open card.
 */
export type RecommendTellReason = 'not-teacher' | 'no-instructor' | 'no-teacher' | 'unclear-course';

export type RecommendDecision =
	| { action: 'nothing' }
	| Tell<RecommendTellReason>
	| {
			action: 'act';
			record: CtrsRecord;
			instructorCid: string;
			/** The record's facility day, `YYYY-MM-DD`: what `Training Completed` is set to. */
			completedOn: string;
	  };

/**
 * A card In Training: does a Recommend (`ots_status` 3) filed on VATUSA since it
 * got there move it to Rating Exam, tell the training admins, or do nothing?
 *
 * - Matched as for the exam half: the course's position type, or any type for
 *   Custom Training while it is the student's only open card.
 * - Only the card's own teacher's Recommend moves it. A record by anyone else,
 *   by nobody VATUSA names, or on a card with no teacher, is told.
 * - Each record is told once: not again while `ctrsNotice` holds its id.
 */
export function decideRecommend(input: {
	card: RecommendCard;
	records: readonly CtrsRecord[];
	teachers: readonly RosterTeacher[];
	otherOpenCards: boolean;
}): RecommendDecision {
	const { card, records, teachers, otherOpenCards } = input;
	const found = match(card, records, teachers, [OTS_RECOMMENDED]);
	if (!found) return NOTHING;
	const { record, instructor } = found;

	if (card.course === 'CUSTOM' && otherOpenCards) return tellOnce(found, 'unclear-course');
	if (!card.teacher?.trim()) return tellOnce(found, 'no-teacher');
	if (!instructor) return tellOnce(found, 'no-instructor');
	if (!isAssignedTo(card.teacher, instructor)) return tellOnce(found, 'not-teacher');

	return {
		action: 'act',
		record,
		instructorCid: instructor.cid,
		completedOn: recordFacilityDay(record)
	};
}

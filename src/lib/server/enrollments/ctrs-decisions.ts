import { CTRS_POSITION_TYPE } from '$lib/certifications';
import type { Enrollment } from '$lib/db/schema/enrollments';
import type { Teacher } from '$lib/db/schema/teachers';
import { latestMatchingRecord, recordFacilityDay, type CtrsRecord } from '$lib/server/ctrs-records';
import { isAssignedTo } from '$lib/teachers';

/**
 * What the CTRS read-back does with a card, given ZID's records for its student.
 * Pure: the writes are in `./ctrs-read-back.ts`. See decisions/0038.
 */

/** As much of a request as the rule reads. */
export type ExamCard = Pick<
	Enrollment,
	'course' | 'teacher' | 'reInstructor' | 'statusSince' | 'ctrsNotice'
>;

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

export type RatingExamDecision =
	| { action: 'nothing' }
	/** Don't move the card; tell the training admins, once for this record. */
	| {
			action: 'tell';
			/** `teacher`: filed by the student's teacher. `unclear-course`: Custom Training with another open card. */
			reason: 'teacher' | 'unclear-course';
			record: CtrsRecord;
			instructorCid: string | null;
	  }
	| {
			action: 'act';
			result: 'pass' | 'fail';
			record: CtrsRecord;
			instructorCid: string;
			/** The record's facility day, `YYYY-MM-DD`: what `RE Completed` is set to. */
			examinedOn: string;
			examiner: ExamExaminer;
	  }
	/** A record the ticket gives no rule for. Nothing moves; the job logs it. */
	| { action: 'unsettled'; reason: 'no-instructor'; record: CtrsRecord };

/**
 * A card at Rating Exam: does a pass or fail filed on VATUSA since it got there
 * move it, tell the training admins, or do nothing?
 *
 * - Matched on the course's position type; Custom Training has none, so it
 *   matches a record of any type, but only while it is the student's only open
 *   card (`otherOpenCards` false). Otherwise the course is unclear: told.
 * - A record whose instructor is the student's teacher on the card moves
 *   nothing (0021: the examiner is never the teacher): told.
 * - Each record is told once: not again while `ctrsNotice` holds its id.
 */
export function decideRatingExam(input: {
	card: ExamCard;
	records: readonly CtrsRecord[];
	teachers: readonly RosterTeacher[];
	otherOpenCards: boolean;
}): RatingExamDecision {
	const { card, records, teachers, otherOpenCards } = input;
	const nothing = { action: 'nothing' } as const;
	if (!card.statusSince) return nothing;

	const custom = card.course === 'CUSTOM';
	const positionType = custom
		? null
		: (CTRS_POSITION_TYPE as Partial<Record<string, string>>)[card.course];
	if (positionType === undefined) return nothing;

	const record = latestMatchingRecord(records, {
		positionType,
		since: card.statusSince,
		statuses: [1, 2]
	});
	if (!record) return nothing;

	const told = card.ctrsNotice === String(record.id);
	const instructorCid = record.instructorId === null ? null : String(record.instructorId);

	if (custom && otherOpenCards) {
		return told ? nothing : { action: 'tell', reason: 'unclear-course', record, instructorCid };
	}
	if (instructorCid === null) return { action: 'unsettled', reason: 'no-instructor', record };

	const instructor = {
		cid: instructorCid,
		initials: teachers.find((teacher) => teacher.cid === instructorCid)?.initials ?? null
	};

	if (isAssignedTo(card.teacher, instructor)) {
		return told ? nothing : { action: 'tell', reason: 'teacher', record, instructorCid };
	}

	const onCard = card.reInstructor?.trim();
	const examiner: ExamExaminer = !onCard
		? {
				kind: 'fill',
				candidates: [
					...(instructor.initials ? [instructor.initials] : []),
					instructorCid,
					VATUSA_EXAMINER
				]
			}
		: isAssignedTo(onCard, instructor)
			? { kind: 'same' }
			: { kind: 'named', examiner: onCard };

	return {
		action: 'act',
		result: record.otsStatus === 1 ? 'pass' : 'fail',
		record,
		instructorCid,
		examinedOn: recordFacilityDay(record),
		examiner
	};
}

/** As much of a request as the In Training rule reads. */
export type RecommendCard = Pick<Enrollment, 'course' | 'teacher' | 'statusSince' | 'ctrsNotice'>;

export type RecommendDecision =
	| { action: 'nothing' }
	/** Don't move the card; tell the training admins, once for this record. */
	| {
			action: 'tell';
			/**
			 * `not-teacher`: filed by someone else, or by nobody VATUSA names.
			 * `no-teacher`: the card has no teacher. `unclear-course`: Custom
			 * Training with another open card.
			 */
			reason: 'not-teacher' | 'no-teacher' | 'unclear-course';
			record: CtrsRecord;
			instructorCid: string | null;
	  }
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
	const nothing = { action: 'nothing' } as const;
	if (!card.statusSince) return nothing;

	const custom = card.course === 'CUSTOM';
	const positionType = custom
		? null
		: (CTRS_POSITION_TYPE as Partial<Record<string, string>>)[card.course];
	if (positionType === undefined) return nothing;

	const record = latestMatchingRecord(records, {
		positionType,
		since: card.statusSince,
		statuses: [3]
	});
	if (!record) return nothing;

	const told = card.ctrsNotice === String(record.id);
	const instructorCid = record.instructorId === null ? null : String(record.instructorId);
	const tell = (reason: 'not-teacher' | 'no-teacher' | 'unclear-course'): RecommendDecision =>
		told ? nothing : { action: 'tell', reason, record, instructorCid };

	if (custom && otherOpenCards) return tell('unclear-course');
	if (!card.teacher?.trim()) return tell('no-teacher');
	if (instructorCid === null) return tell('not-teacher');

	const instructor = {
		cid: instructorCid,
		initials: teachers.find((teacher) => teacher.cid === instructorCid)?.initials ?? null
	};
	if (!isAssignedTo(card.teacher, instructor)) return tell('not-teacher');

	return { action: 'act', record, instructorCid, completedOn: recordFacilityDay(record) };
}

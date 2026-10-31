import { describe, expect, it } from 'vitest';
import type { CtrsRecord } from '$lib/server/ctrs-records';
import {
	decideRatingExam,
	decideRecommend,
	type ExamCard,
	type RecommendCard
} from './ctrs-decisions';

/** Entered Rating Exam on the facility day 2026-10-20. */
const SINCE = new Date('2026-10-20T16:00:00Z');

const card = (overrides: Partial<ExamCard> = {}): ExamCard => ({
	course: 'A-LC',
	teacher: 'AB',
	reInstructor: null,
	statusSince: SINCE,
	ctrsNotice: null,
	...overrides
});

const record = (overrides: Partial<CtrsRecord> = {}): CtrsRecord => ({
	id: 501,
	studentId: 1000001,
	instructorId: 1000900,
	sessionDate: '2026-10-25 19:00:00',
	facility: 'ZID',
	position: 'XXX_TWR',
	otsStatus: 1,
	...overrides
});

const teachers = [
	{ cid: '1000800', initials: 'AB' },
	{ cid: '1000900', initials: 'CD' }
];

const decide = (
	overrides: {
		card?: Partial<ExamCard>;
		records?: CtrsRecord[];
		otherOpenCards?: boolean;
	} = {}
) =>
	decideRatingExam({
		card: card(overrides.card),
		records: overrides.records ?? [record()],
		teachers,
		otherOpenCards: overrides.otherOpenCards ?? false
	});

describe('decideRatingExam', () => {
	it('moves a pass, dated from the session', () => {
		expect(decide()).toEqual({
			action: 'act',
			result: 'pass',
			record: record(),
			instructorCid: '1000900',
			examinedOn: '2026-10-25',
			examiner: { kind: 'fill', candidates: ['CD', '1000900', 'VATUSA'] }
		});
	});

	it('moves a fail', () => {
		const decision = decide({ records: [record({ otsStatus: 2 })] });
		expect(decision).toMatchObject({ action: 'act', result: 'fail' });
	});

	it('does nothing with no record', () => {
		expect(decide({ records: [] })).toEqual({ action: 'nothing' });
	});

	it('does nothing on a Recommend or a record of another position type', () => {
		expect(
			decide({ records: [record({ otsStatus: 3 }), record({ position: 'XXX_APP' })] })
		).toEqual({ action: 'nothing' });
	});

	it('ignores a record from before the card reached Rating Exam', () => {
		expect(decide({ records: [record({ sessionDate: '2026-10-19 23:00:00' })] })).toEqual({
			action: 'nothing'
		});
	});

	it('does nothing for a card with no status_since', () => {
		expect(decide({ card: { statusSince: null } })).toEqual({ action: 'nothing' });
	});

	it('does nothing for a course with no position type', () => {
		expect(decide({ card: { course: 'S-LC' } })).toEqual({ action: 'nothing' });
	});

	it("tells, and doesn't move, when the instructor is the student's teacher", () => {
		expect(decide({ card: { teacher: 'CD' } })).toEqual({
			action: 'tell',
			reason: 'teacher',
			record: record(),
			instructorCid: '1000900'
		});
	});

	it('matches the teacher whatever the case', () => {
		expect(decide({ card: { teacher: 'cd ' } })).toMatchObject({ action: 'tell' });
	});

	it('tells once for the same record, and again for a new one', () => {
		expect(decide({ card: { teacher: 'CD', ctrsNotice: '501' } })).toEqual({ action: 'nothing' });
		expect(
			decide({ card: { teacher: 'CD', ctrsNotice: '501' }, records: [record({ id: 502 })] })
		).toMatchObject({ action: 'tell', reason: 'teacher' });
	});

	it('fills RE Instructor by CID, then VATUSA, for an instructor not on the teacher roster', () => {
		expect(decide({ records: [record({ instructorId: 1000777 })] })).toMatchObject({
			action: 'act',
			examiner: { kind: 'fill', candidates: ['1000777', 'VATUSA'] }
		});
	});

	it('names a different examiner on the card rather than overwriting it', () => {
		expect(decide({ card: { reInstructor: 'EF' } })).toMatchObject({
			action: 'act',
			examiner: { kind: 'named', examiner: 'EF' }
		});
	});

	it("says nothing about the examiner when it is the record's instructor", () => {
		expect(decide({ card: { reInstructor: 'cd' } })).toMatchObject({
			action: 'act',
			examiner: { kind: 'same' }
		});
	});

	it('acts on nothing from a record with no instructor', () => {
		expect(decide({ records: [record({ instructorId: null })] })).toEqual({
			action: 'unsettled',
			reason: 'no-instructor',
			record: record({ instructorId: null })
		});
	});

	describe('Custom Training', () => {
		const custom = { course: 'CUSTOM' as const };

		it('the only open card moves on a record of any position type', () => {
			expect(decide({ card: custom, records: [record({ position: 'XXX_CTR' })] })).toMatchObject({
				action: 'act',
				result: 'pass'
			});
		});

		it("with another open card, it tells and doesn't move", () => {
			expect(decide({ card: custom, otherOpenCards: true })).toEqual({
				action: 'tell',
				reason: 'unclear-course',
				record: record(),
				instructorCid: '1000900'
			});
		});

		it('tells about an unclear course once per record', () => {
			expect(decide({ card: { ...custom, ctrsNotice: '501' }, otherOpenCards: true })).toEqual({
				action: 'nothing'
			});
		});

		it('never acts on a record it holds, even as the only open card', () => {
			expect(decide({ card: { ...custom, ctrsNotice: '501' } })).toEqual({ action: 'nothing' });
		});

		it('judges a newer record afresh', () => {
			expect(
				decide({
					card: { ...custom, ctrsNotice: '501' },
					records: [record({ id: 502, sessionDate: '2026-10-26 19:00:00' })]
				})
			).toMatchObject({ action: 'act', result: 'pass' });
		});
	});
});

describe('decideRecommend', () => {
	const recommend = (overrides: Partial<CtrsRecord> = {}) =>
		record({ otsStatus: 3, instructorId: 1000800, ...overrides });

	const decideR = (
		overrides: {
			card?: Partial<RecommendCard>;
			records?: CtrsRecord[];
			otherOpenCards?: boolean;
		} = {}
	) =>
		decideRecommend({
			card: {
				course: 'A-LC',
				teacher: 'AB',
				statusSince: SINCE,
				ctrsNotice: null,
				...overrides.card
			},
			records: overrides.records ?? [recommend()],
			teachers,
			otherOpenCards: overrides.otherOpenCards ?? false
		});

	it("moves on the card's teacher's Recommend, dated from the session", () => {
		expect(decideR()).toEqual({
			action: 'act',
			record: recommend(),
			instructorCid: '1000800',
			completedOn: '2026-10-25'
		});
	});

	it('matches the teacher by CID when the card holds it', () => {
		expect(decideR({ card: { teacher: '1000800' } }).action).toBe('act');
	});

	it("tells, and doesn't move, when another instructor filed it", () => {
		expect(decideR({ records: [recommend({ instructorId: 1000900 })] })).toEqual({
			action: 'tell',
			reason: 'not-teacher',
			record: recommend({ instructorId: 1000900 }),
			instructorCid: '1000900'
		});
	});

	it('tells when the record names no instructor', () => {
		expect(decideR({ records: [recommend({ instructorId: null })] })).toMatchObject({
			action: 'tell',
			reason: 'not-teacher',
			instructorCid: null
		});
	});

	it('tells when the card has no teacher', () => {
		expect(decideR({ card: { teacher: null } })).toMatchObject({
			action: 'tell',
			reason: 'no-teacher'
		});
	});

	it('tells once for a record, and again for a newer one', () => {
		const other = { records: [recommend({ instructorId: 1000900 })] };
		expect(decideR({ ...other, card: { ctrsNotice: '501' } })).toEqual({ action: 'nothing' });
		expect(
			decideR({
				records: [
					recommend({ id: 502, instructorId: 1000900, sessionDate: '2026-10-26 19:00:00' })
				],
				card: { ctrsNotice: '501' }
			})
		).toMatchObject({ action: 'tell' });
	});

	it('ignores a Recommend from before the card got back to In Training', () => {
		expect(decideR({ records: [recommend({ sessionDate: '2026-10-19 19:00:00' })] })).toEqual({
			action: 'nothing'
		});
	});

	it('ignores a pass, a fail, another position type and a card with no status_since', () => {
		expect(decideR({ records: [recommend({ otsStatus: 1 })] })).toEqual({ action: 'nothing' });
		expect(decideR({ records: [recommend({ otsStatus: 2 })] })).toEqual({ action: 'nothing' });
		expect(decideR({ records: [recommend({ position: 'XXX_APP' })] })).toEqual({
			action: 'nothing'
		});
		expect(decideR({ card: { statusSince: null } })).toEqual({ action: 'nothing' });
	});

	describe('Custom Training', () => {
		const custom = { card: { course: 'CUSTOM' as const } };

		it('moves the only open card on a Recommend of any position type', () => {
			expect(decideR({ ...custom, records: [recommend({ position: 'XXX_CTR' })] }).action).toBe(
				'act'
			);
		});

		it('still needs the teacher', () => {
			expect(decideR({ ...custom, records: [recommend({ instructorId: 1000900 })] })).toMatchObject(
				{ action: 'tell', reason: 'not-teacher' }
			);
		});

		it('tells, and does not move, with another open card; once per record', () => {
			expect(decideR({ ...custom, otherOpenCards: true })).toMatchObject({
				action: 'tell',
				reason: 'unclear-course'
			});
			expect(
				decideR({ card: { course: 'CUSTOM', ctrsNotice: '501' }, otherOpenCards: true })
			).toEqual({ action: 'nothing' });
		});

		it('never acts on a record it holds, even as the only open card', () => {
			expect(decideR({ card: { course: 'CUSTOM', ctrsNotice: '501' } })).toEqual({
				action: 'nothing'
			});
		});

		it('judges a newer record afresh', () => {
			expect(
				decideR({
					card: { course: 'CUSTOM', ctrsNotice: '501' },
					records: [recommend({ id: 502, sessionDate: '2026-10-26 19:00:00' })]
				})
			).toMatchObject({ action: 'act' });
		});
	});
});

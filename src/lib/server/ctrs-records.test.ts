import { describe, expect, it } from 'vitest';
import {
	latestMatchingRecord,
	parseCtrsRecords,
	recordFacilityDay,
	type CtrsRecord
} from './ctrs-records';

function record(overrides: Partial<CtrsRecord> = {}): CtrsRecord {
	return {
		id: 1,
		studentId: 1000001,
		instructorId: 1000002,
		sessionDate: '2026-06-10 15:00:00',
		facility: 'ZID',
		position: 'IND_TWR',
		otsStatus: 1,
		...overrides
	};
}

const query = {
	positionType: 'TWR',
	since: new Date('2026-06-10T12:00:00Z'),
	statuses: [1, 3] as const
};

describe('parseCtrsRecords', () => {
	it('keeps the seven fields, for all four statuses, and drops the rest', () => {
		const rows = [0, 1, 2, 3].map((ots, i) => ({
			id: i + 1,
			student_id: 1000001,
			instructor_id: 1000002,
			session_date: '2026-06-10 15:00:00',
			facility_id: 'ZID',
			position: 'IND_TWR',
			ots_status: ots,
			notes: 'dropped',
			facility: { id: 'ZID' }
		}));
		const parsed = parseCtrsRecords({ data: rows });
		expect(parsed.map((r) => r.otsStatus)).toEqual([0, 1, 2, 3]);
		expect(parsed[1]).toEqual({
			id: 2,
			studentId: 1000001,
			instructorId: 1000002,
			sessionDate: '2026-06-10 15:00:00',
			facility: 'ZID',
			position: 'IND_TWR',
			otsStatus: 1
		});
	});

	it('reads a missing optional field as none, and a missing instructor as null', () => {
		const [parsed] = parseCtrsRecords({
			data: [
				{
					id: 5,
					student_id: 1000001,
					session_date: '2026-06-10 15:00:00',
					facility_id: 'ZID',
					position: 'IND_TWR'
				}
			]
		});
		expect(parsed.otsStatus).toBe(0);
		expect(parsed.instructorId).toBeNull();
	});

	it('is empty for no records', () => {
		expect(parseCtrsRecords({ data: [] })).toEqual([]);
	});

	it('throws on a body with no data array', () => {
		expect(() => parseCtrsRecords({})).toThrow();
	});

	it('throws on a record without an id, date, facility or position', () => {
		expect(() => parseCtrsRecords({ data: [{ id: 1 }] })).toThrow();
	});
});

describe('recordFacilityDay', () => {
	it('is the date part of session_date as VATUSA returns it', () => {
		expect(recordFacilityDay(record({ sessionDate: '2026-06-10 23:30:00' }))).toBe('2026-06-10');
	});
});

describe('latestMatchingRecord', () => {
	it('returns null when there are no records', () => {
		expect(latestMatchingRecord([], query)).toBeNull();
	});

	it('ignores another facility', () => {
		expect(latestMatchingRecord([record({ facility: 'ZNY' })], query)).toBeNull();
	});

	it('ignores another position type', () => {
		expect(latestMatchingRecord([record({ position: 'IND_GND' })], query)).toBeNull();
	});

	it('ignores the airport prefix, and a position with none', () => {
		expect(latestMatchingRecord([record({ position: 'LAF_TWR' })], query)?.position).toBe(
			'LAF_TWR'
		);
		expect(latestMatchingRecord([record({ position: 'TWR' })], query)).toBeNull();
	});

	it('does not match a position type that only ends in the same letters', () => {
		expect(latestMatchingRecord([record({ position: 'IND_XTWR' })], query)).toBeNull();
	});

	it('ignores an excluded status', () => {
		expect(latestMatchingRecord([record({ otsStatus: 2 })], query)).toBeNull();
		expect(latestMatchingRecord([record({ otsStatus: 0 })], query)).toBeNull();
	});

	it('ignores a record the facility day before since', () => {
		expect(
			latestMatchingRecord([record({ sessionDate: '2026-06-09 23:59:00' })], query)
		).toBeNull();
	});

	it('takes a record on since’s own facility day', () => {
		// 03:00Z on 06-10 is still 06-09 in Indianapolis; since's day is 06-09 there.
		const since = new Date('2026-06-10T03:00:00Z');
		const hit = latestMatchingRecord([record({ sessionDate: '2026-06-09 08:00:00' })], {
			...query,
			since
		});
		expect(hit).not.toBeNull();
		expect(
			latestMatchingRecord([record({ sessionDate: '2026-06-10 08:00:00' })], { ...query, since })
		).not.toBeNull();
	});

	it('takes the later of two by date', () => {
		const older = record({ id: 9, sessionDate: '2026-06-10 15:00:00' });
		const newer = record({ id: 2, sessionDate: '2026-06-12 15:00:00' });
		expect(latestMatchingRecord([older, newer], query)?.id).toBe(2);
		expect(latestMatchingRecord([newer, older], query)?.id).toBe(2);
	});

	it('takes the higher id when the dates tie', () => {
		const a = record({ id: 3 });
		const b = record({ id: 7 });
		expect(latestMatchingRecord([a, b], query)?.id).toBe(7);
		expect(latestMatchingRecord([b, a], query)?.id).toBe(7);
	});

	it('matches any position when the position type is null', () => {
		const rows = [record({ id: 1, position: 'IND_GND' }), record({ id: 2, position: 'ZID_CTR' })];
		expect(latestMatchingRecord(rows, { ...query, positionType: null })?.id).toBe(2);
	});
});

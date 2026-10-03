import { describe, expect, it } from 'vitest';
import { matchSelectOption, toFacilityDate } from './progress';

describe('toFacilityDate', () => {
	// 9pm Eastern on the 1st is already the 2nd in UTC.
	it('uses the facility day, not the UTC day', () => {
		expect(toFacilityDate(new Date('2026-10-02T01:00:00Z'))).toBe('2026-10-01');
	});

	it('agrees with UTC during the facility daytime', () => {
		expect(toFacilityDate(new Date('2026-10-02T18:00:00Z'))).toBe('2026-10-02');
	});

	it('follows daylight saving', () => {
		// 04:30 UTC is 12:30am EDT in July, but 11:30pm EST the night before in January.
		expect(toFacilityDate(new Date('2026-07-10T04:30:00Z'))).toBe('2026-07-10');
		expect(toFacilityDate(new Date('2026-01-10T04:30:00Z'))).toBe('2026-01-09');
	});

	it('formats as YYYY-MM-DD with leading zeros', () => {
		expect(toFacilityDate(new Date('2026-01-05T17:00:00Z'))).toBe('2026-01-05');
	});
});

describe('matchSelectOption', () => {
	// RE Instructor as read from the live board on 2026-09-30.
	const options = [
		{ id: '10104', value: 'HI' },
		{ id: '10105', value: 'Sw' },
		{ id: '10106', value: 'YG' },
		{ id: '10107', value: 'VATUSA' }
	];

	it('finds the option for a teacher’s initials', () => {
		expect(matchSelectOption(options, ['HI', '1283146'])).toEqual({ id: '10104', value: 'HI' });
	});

	// Found on the live board: "Sw" for the teacher we hold as SW.
	it('ignores how the board spelled it', () => {
		expect(matchSelectOption(options, ['SW'])).toEqual({ id: '10105', value: 'Sw' });
	});

	// A teacher with no initials yet is on the dropdown by CID.
	it('falls back to the CID when the initials are not offered', () => {
		const withCid = [...options, { id: '10200', value: '1530662' }];
		expect(matchSelectOption(withCid, [null, '1530662'])).toEqual({
			id: '10200',
			value: '1530662'
		});
		expect(matchSelectOption(withCid, ['ZZ', '1530662'])?.id).toBe('10200');
	});

	it('is null when the dropdown offers none of them', () => {
		expect(matchSelectOption(options, ['JR', '1613736'])).toBeNull();
		expect(matchSelectOption(options, [null, undefined, ''])).toBeNull();
		expect(matchSelectOption([], ['HI'])).toBeNull();
	});
});

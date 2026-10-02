import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

// Midday UTC, so the calendar date is the same in any timezone the suite runs in.
const date = new Date('2026-10-02T12:00:00Z');

describe('formatDate', () => {
	it('is short by default', () => {
		expect(formatDate(date)).toBe('10/2/2026');
	});

	it('spells the month out when asked', () => {
		expect(formatDate(date, 'long')).toBe('October 2, 2026');
	});

	// Dates cross the wire as strings once a load's data has been serialised.
	it('accepts what a Date serialises to', () => {
		expect(formatDate(date.toISOString())).toBe('10/2/2026');
		expect(formatDate(date.getTime())).toBe('10/2/2026');
	});
});

describe('formatDateTime', () => {
	it('carries the date and a time', () => {
		expect(formatDateTime(date)).toMatch(/^10\/2\/2026,\s\d{1,2}:\d{2}\s[AP]M$/);
	});
});

import { describe, expect, it } from 'vitest';
import { formatAgo, formatDate, formatDateTime, formatCardDate } from './format';

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

describe('formatAgo', () => {
	const at = (minutes: number) => new Date(date.getTime() - minutes * 60_000);

	it('counts in the largest unit that fits', () => {
		expect(formatAgo(at(0), date)).toBe('just now');
		expect(formatAgo(at(1), date)).toBe('1 minute ago');
		expect(formatAgo(at(59), date)).toBe('59 minutes ago');
		expect(formatAgo(at(60), date)).toBe('1 hour ago');
		expect(formatAgo(at(60 * 5 + 30), date)).toBe('5 hours ago');
		expect(formatAgo(at(60 * 24 * 2), date)).toBe('2 days ago');
	});

	// A clock a few seconds ahead of the server must not read as the future.
	it('treats a moment slightly ahead of now as just now', () => {
		expect(formatAgo(at(-1), date)).toBe('just now');
	});
});

describe('formatCardDate', () => {
	// A card's date has no time or zone, so it must come out as the same day.
	it('shows a card date as that day, like every other date', () => {
		expect(formatCardDate('2026-10-05')).toBe('10/5/2026');
		expect(formatCardDate('2026-01-01', 'long')).toBe('January 1, 2026');
	});
});

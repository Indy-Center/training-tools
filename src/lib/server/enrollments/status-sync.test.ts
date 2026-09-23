import { describe, expect, it } from 'vitest';
import { sweepWindowMinutes } from './status-sync';

const NOW = new Date('2026-09-23T12:00:00Z');

describe('sweepWindowMinutes', () => {
	it('reads everything when there is no cursor yet', () => {
		expect(sweepWindowMinutes(null, NOW)).toBeNull();
	});

	it('covers the time since the cursor, plus an overlap', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T11:45:00Z'), NOW)).toBe(20);
	});

	it('rounds a part-minute up rather than dropping it', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T11:44:30Z'), NOW)).toBe(21);
	});

	// After an outage the window simply grows; nothing is skipped.
	it('stretches to cover missed runs', () => {
		expect(sweepWindowMinutes(new Date('2026-09-22T12:00:00Z'), NOW)).toBe(24 * 60 + 5);
	});

	it('never asks for a negative window if clocks disagree', () => {
		expect(sweepWindowMinutes(new Date('2026-09-23T12:10:00Z'), NOW)).toBe(5);
	});
});

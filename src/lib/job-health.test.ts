import { describe, expect, it } from 'vitest';
import { jobHealthState, needsAttention, STALE_AFTER_MINUTES } from './job-health';

const now = new Date('2026-10-02T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('jobHealthState', () => {
	it('is never for a job with nothing recorded', () => {
		expect(jobHealthState(null, now)).toBe('never');
		expect(jobHealthState(undefined, now)).toBe('never');
	});

	it('is ok after a recent successful run', () => {
		expect(jobHealthState({ lastRunAt: minutesAgo(14), lastOk: true }, now)).toBe('ok');
	});

	it('is failing after a recent failed run', () => {
		expect(jobHealthState({ lastRunAt: minutesAgo(14), lastOk: false }, now)).toBe('failing');
	});

	// The cron not firing at all is a different problem from a job that throws,
	// and the last outcome says nothing about it.
	it('is stale once a scheduled job has missed its runs, whatever it last did', () => {
		const long = STALE_AFTER_MINUTES + 1;
		expect(jobHealthState({ lastRunAt: minutesAgo(long), lastOk: true }, now)).toBe('stale');
		expect(jobHealthState({ lastRunAt: minutesAgo(long), lastOk: false }, now)).toBe('stale');
	});

	it('allows a late run before calling it stale', () => {
		expect(jobHealthState({ lastRunAt: minutesAgo(STALE_AFTER_MINUTES), lastOk: true }, now)).toBe(
			'ok'
		);
	});

	// The webhook runs when staff touch the board; a quiet weekend is not a fault.
	it('never calls an unscheduled job stale', () => {
		const lastWeek = minutesAgo(7 * 24 * 60);
		expect(jobHealthState({ lastRunAt: lastWeek, lastOk: true }, now, { scheduled: false })).toBe(
			'ok'
		);
		expect(jobHealthState({ lastRunAt: lastWeek, lastOk: false }, now, { scheduled: false })).toBe(
			'failing'
		);
	});

	// Load data crosses the wire, and a Date arrives as whatever it serialised to.
	it('accepts a date that has been serialised', () => {
		const row = { lastRunAt: minutesAgo(5).toISOString() as unknown as Date, lastOk: true };
		expect(jobHealthState(row, now)).toBe('ok');
	});
});

describe('needsAttention', () => {
	it('flags failing and stale, not ok or never', () => {
		expect(needsAttention('failing')).toBe(true);
		expect(needsAttention('stale')).toBe(true);
		expect(needsAttention('ok')).toBe(false);
		expect(needsAttention('never')).toBe(false);
	});
});

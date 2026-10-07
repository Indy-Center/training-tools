import { describe, expect, it } from 'vitest';
import { academyDaysLeft, academyDeadline, reminderDue, reminderToSend } from './vatusa-reminders';

const ASSIGNED = '2026-10-01';

describe('academyDaysLeft', () => {
	it('counts down from 30 on the day it is assigned', () => {
		expect(academyDaysLeft(ASSIGNED, '2026-10-01')).toBe(30);
		expect(academyDaysLeft(ASSIGNED, '2026-10-09')).toBe(22);
		expect(academyDaysLeft(ASSIGNED, '2026-10-31')).toBe(0);
		expect(academyDaysLeft(ASSIGNED, '2026-11-05')).toBe(-5);
	});

	it('is null for a date that is not one', () => {
		expect(academyDaysLeft('soon', '2026-10-09')).toBeNull();
		expect(academyDaysLeft(ASSIGNED, '')).toBeNull();
	});
});

describe('academyDeadline', () => {
	it('is 30 days after it was assigned, across a month end', () => {
		expect(academyDeadline(ASSIGNED)).toBe('2026-10-31');
		expect(academyDeadline('2026-02-10')).toBe('2026-03-12');
		expect(academyDeadline('never')).toBeNull();
	});
});

describe('reminderDue', () => {
	it('moves on at 22 days left, at 16, and when the time is up', () => {
		expect(reminderDue(ASSIGNED, '2026-10-01')).toBe('assigned');
		expect(reminderDue(ASSIGNED, '2026-10-08')).toBe('assigned');
		expect(reminderDue(ASSIGNED, '2026-10-09')).toBe('22-days-left');
		expect(reminderDue(ASSIGNED, '2026-10-14')).toBe('22-days-left');
		expect(reminderDue(ASSIGNED, '2026-10-15')).toBe('16-days-left');
		expect(reminderDue(ASSIGNED, '2026-10-30')).toBe('16-days-left');
		expect(reminderDue(ASSIGNED, '2026-10-31')).toBe('expired');
		expect(reminderDue(ASSIGNED, '2027-01-01')).toBe('expired');
	});
});

describe('reminderToSend', () => {
	it('sends the first reminder to someone who has had none', () => {
		expect(reminderToSend(ASSIGNED, '2026-10-01', null)).toBe('assigned');
	});

	it('sends each reminder once', () => {
		expect(reminderToSend(ASSIGNED, '2026-10-05', 'assigned')).toBeNull();
		expect(reminderToSend(ASSIGNED, '2026-10-09', 'assigned')).toBe('22-days-left');
		expect(reminderToSend(ASSIGNED, '2026-10-10', '22-days-left')).toBeNull();
		expect(reminderToSend(ASSIGNED, '2026-11-20', 'expired')).toBeNull();
	});

	// After an outage, or a course dated on the board some days ago.
	it('skips the reminders that were missed, and sends the one that fits today', () => {
		expect(reminderToSend(ASSIGNED, '2026-10-20', null)).toBe('16-days-left');
		expect(reminderToSend(ASSIGNED, '2026-11-02', 'assigned')).toBe('expired');
	});

	it('sends nothing for a date it cannot read', () => {
		expect(reminderToSend('', '2026-10-09', null)).toBeNull();
	});
});

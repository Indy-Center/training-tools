import { describe, expect, it } from 'vitest';
import { parseBoardIssue, parseJiraDate, type JiraBoardIssue } from './board-issue';

// Shaped like TRK-14 as read from the live board on 2026-09-25: filed by hand
// during the 2026-09-05 migration, waitlisted a month earlier.
function issue(fields: NonNullable<JiraBoardIssue['fields']> = {}): JiraBoardIssue {
	return {
		key: 'TRK-14',
		fields: {
			status: { name: 'Waitlist' },
			customfield_10250: null,
			updated: '2026-09-05T11:02:10.000-0400',
			created: '2026-09-05T10:58:41.000-0400',
			summary: 'Matthew Schweitzer – Terminal Radar Control (T-RC)',
			customfield_10241: { id: '10094', value: 'Terminal Radar Control (T-RC)' },
			customfield_10242: '1884997',
			customfield_10243: 'Matthew Schweitzer',
			customfield_10244: { id: '10089', value: 'Discord Message' },
			customfield_10246: '2026-08-09',
			...fields
		}
	};
}

describe('parseBoardIssue', () => {
	it('reads a hand-filed issue into a row', () => {
		expect(parseBoardIssue(issue())).toEqual({
			ok: true,
			enrollment: {
				issueKey: 'TRK-14',
				cid: '1884997',
				course: 'T-RC',
				name: 'Matthew Schweitzer',
				status: 'waitlist',
				teacher: null,
				notificationPreference: 'discord',
				waitlistedAt: new Date('2026-08-09T00:00:00Z'),
				updatedAt: new Date('2026-09-05T15:02:10.000Z')
			}
		});
	});

	it('carries status and teacher through the same mapping the sync uses', () => {
		const parsed = parseBoardIssue(
			issue({ status: { name: 'In Training' }, customfield_10250: { value: 'SW' } })
		);
		expect(parsed.ok && parsed.enrollment.status).toBe('in-training');
		expect(parsed.ok && parsed.enrollment.teacher).toBe('SW');
	});

	// The backlog was all created on one day, so `created` would tie everyone.
	it('orders by Waitlisted, falling back to created only when it is empty', () => {
		const withDate = parseBoardIssue(issue());
		const without = parseBoardIssue(issue({ customfield_10246: null }));
		expect(withDate.ok && withDate.enrollment.waitlistedAt).toEqual(
			new Date('2026-08-09T00:00:00Z')
		);
		expect(without.ok && without.enrollment.waitlistedAt).toEqual(
			new Date('2026-09-05T14:58:41.000Z')
		);
	});

	it('falls back to the summary, then the CID, for a name', () => {
		const fromSummary = parseBoardIssue(issue({ customfield_10243: null }));
		expect(fromSummary.ok && fromSummary.enrollment.name).toBe('Matthew Schweitzer');

		const fromCid = parseBoardIssue(issue({ customfield_10243: '  ', summary: null }));
		expect(fromCid.ok && fromCid.enrollment.name).toBe('CID 1884997');
	});

	it('reads the email notification option, and tolerates none', () => {
		const email = parseBoardIssue(issue({ customfield_10244: { id: '10090', value: 'Email' } }));
		expect(email.ok && email.enrollment.notificationPreference).toBe('email');

		const none = parseBoardIssue(issue({ customfield_10244: null }));
		expect(none.ok && none.enrollment.notificationPreference).toBeNull();
	});

	// Staff type the CID by hand. A row keyed on a non-CID joins to nobody.
	it('refuses an issue without a usable CID', () => {
		expect(parseBoardIssue(issue({ customfield_10242: null }))).toEqual({
			ok: false,
			reason: 'no-cid'
		});
		expect(parseBoardIssue(issue({ customfield_10242: 'ask Jake' }))).toEqual({
			ok: false,
			reason: 'no-cid'
		});
	});

	it('trims a CID with stray whitespace rather than refusing it', () => {
		const parsed = parseBoardIssue(issue({ customfield_10242: ' 1884997 ' }));
		expect(parsed.ok && parsed.enrollment.cid).toBe('1884997');
	});

	it('refuses a course option we do not know', () => {
		expect(
			parseBoardIssue(issue({ customfield_10241: { id: '99999', value: 'Oceanic' } }))
		).toEqual({ ok: false, reason: 'unknown-course' });
		expect(parseBoardIssue(issue({ customfield_10241: null }))).toEqual({
			ok: false,
			reason: 'unknown-course'
		});
	});

	it('refuses a status we do not know, like the sync does', () => {
		expect(parseBoardIssue(issue({ status: { name: 'Limbo' } }))).toEqual({
			ok: false,
			reason: 'unknown-status'
		});
	});

	it('refuses an issue with no date to queue it by', () => {
		expect(parseBoardIssue(issue({ customfield_10246: null, created: null }))).toEqual({
			ok: false,
			reason: 'no-date'
		});
	});
});

describe('parseJiraDate', () => {
	it('reads a Jira date as midnight UTC', () => {
		expect(parseJiraDate('2024-10-22')).toEqual(new Date('2024-10-22T00:00:00Z'));
	});

	it('refuses anything that is not a bare date', () => {
		expect(parseJiraDate('2024-10-22T10:00:00Z')).toBeNull();
		expect(parseJiraDate('22/10/2024')).toBeNull();
		expect(parseJiraDate('')).toBeNull();
		expect(parseJiraDate(null)).toBeNull();
	});
});

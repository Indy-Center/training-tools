import { describe, expect, it } from 'vitest';
import { buildEnrollmentIssuePayload, toJiraDate } from './enrollment';
import { JIRA_FIELDS, JIRA_NOTIFICATION_OPTIONS } from './fields';

const now = new Date('2026-09-20T18:30:00.000Z');

const enrollment = {
	cid: '1234567',
	course: 'S-GC' as const,
	submittedName: 'Todd Schneider',
	submittedRating: 'S1',
	availability: 'Weeknights after 7pm eastern',
	notificationPreference: 'discord' as const
};

describe('buildEnrollmentIssuePayload', () => {
	// Training staff read the summary column; a second format would look like a
	// different system wrote it. TRK-33 reads exactly this way.
	it('matches the summary convention already on the board, with an en-dash', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields.summary).toBe('Todd Schneider – Simple Ground Control (S-GC)');
		expect(fields.summary).toContain('–');
		expect(fields.summary).not.toContain(' - ');
	});

	it('maps the course to its Jira option id, not its code', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields[JIRA_FIELDS.course]).toEqual({ id: '10088' });
	});

	it('sets CID and name on their custom fields', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields[JIRA_FIELDS.cid]).toBe('1234567');
		expect(fields[JIRA_FIELDS.name]).toBe('Todd Schneider');
	});

	// Queue position is read off this date.
	it('always sets the waitlisted date, as YYYY-MM-DD', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields[JIRA_FIELDS.waitlisted]).toBe('2026-09-20');
	});

	it('maps notification preference to its option id', () => {
		const discord = buildEnrollmentIssuePayload('TRK', enrollment, now);
		const email = buildEnrollmentIssuePayload(
			'TRK',
			{ ...enrollment, notificationPreference: 'email' },
			now
		);

		expect(discord.fields[JIRA_FIELDS.notificationPreference]).toEqual({
			id: JIRA_NOTIFICATION_OPTIONS.discord
		});
		expect(email.fields[JIRA_FIELDS.notificationPreference]).toEqual({
			id: JIRA_NOTIFICATION_OPTIONS.email
		});
	});

	// v3 takes ADF for textarea custom fields; a plain string is a 400.
	it('sends availability as an ADF document, not a string', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields[JIRA_FIELDS.availability]).toMatchObject({ type: 'doc', version: 1 });
		expect(JSON.stringify(fields[JIRA_FIELDS.availability])).toContain(
			'Weeknights after 7pm eastern'
		);
	});

	it('omits the optional fields entirely when they are missing', () => {
		const { fields } = buildEnrollmentIssuePayload(
			'TRK',
			{ ...enrollment, availability: null, notificationPreference: null },
			now
		);

		expect(fields).not.toHaveProperty(JIRA_FIELDS.availability);
		expect(fields).not.toHaveProperty(JIRA_FIELDS.notificationPreference);
	});

	it('targets the project it is given and the Student Enrollment issue type', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(fields.project).toEqual({ key: 'TRK' });
		expect(fields.issuetype).toEqual({ id: '10057' });
	});

	// Discord id and email are derivable from the roster and identity whenever
	// something actually needs them, so they never leave this app.
	it('does not leak a discord id or email into the issue', () => {
		const payload = JSON.stringify(buildEnrollmentIssuePayload('TRK', enrollment, now));

		expect(payload).not.toContain('discord_id');
		expect(payload).not.toContain('@');
	});

	it('records the rating held at enrollment in the description', () => {
		const { fields } = buildEnrollmentIssuePayload('TRK', enrollment, now);

		expect(JSON.stringify(fields.description)).toContain('S1');
	});

	it('says so rather than inventing a rating when none is known', () => {
		const { fields } = buildEnrollmentIssuePayload(
			'TRK',
			{ ...enrollment, submittedRating: null },
			now
		);

		expect(JSON.stringify(fields.description)).toContain('unknown');
	});

	it('refuses to file an issue for a course it cannot map', () => {
		expect(() =>
			buildEnrollmentIssuePayload('TRK', { ...enrollment, course: 'S-XX' as never }, now)
		).toThrow(/Unknown course/);
	});
});

describe('toJiraDate', () => {
	it('formats as YYYY-MM-DD', () => {
		expect(toJiraDate(new Date('2026-01-05T23:59:59.000Z'))).toBe('2026-01-05');
	});
});

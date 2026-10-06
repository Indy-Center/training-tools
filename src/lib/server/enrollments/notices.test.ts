import { describe, expect, it } from 'vitest';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import {
	announcementFor,
	awaitingAuditNotice,
	certificationHeldNotice,
	examReadyNotice,
	needsCatpNotice,
	stuckRequestNotice
} from './notices';

const request = {
	name: 'Jo Rivera',
	cid: '1234567',
	course: 'T-RC',
	teacher: 'SW',
	examiner: 'HI',
	issueKey: 'TRK-42',
	issueUrl: 'https://jira.test/browse/TRK-42'
};

const field = (notice: { fields?: { label: string; value: string }[] }, label: string) =>
	notice.fields?.find((f) => f.label === label)?.value;

describe('announcementFor', () => {
	it('announces the three arrivals someone acts on', () => {
		expect(announcementFor('rating-exam')).toBe('exam-ready');
		expect(announcementFor('needs-catp')).toBe('needs-catp');
		expect(announcementFor('certification-update')).toBe('awaiting-audit');
	});

	it('announces nothing else', () => {
		const announced = ['rating-exam', 'needs-catp', 'certification-update'];
		for (const status of ENROLLMENT_STATUSES.filter((s) => !announced.includes(s))) {
			expect(announcementFor(status)).toBeNull();
		}
	});
});

describe('examReadyNotice', () => {
	const notice = examReadyNotice({ ...request, availability: 'Weeknights' }, ['111', '222']);

	it('goes to the instructors, pinging the evaluators it was given', () => {
		expect(notice.audience).toBe('instructors');
		expect(notice.mention).toEqual(['111', '222']);
	});

	it('names the course, the student, who taught them, and where to claim it', () => {
		expect(notice.title).toContain('Terminal Radar Control (T-RC)');
		expect(field(notice, 'Student')).toBe('Jo Rivera (1234567)');
		expect(field(notice, 'Taught by')).toBe('SW');
		expect(field(notice, 'Availability')).toBe('Weeknights');
		expect(notice.link).toMatch(/\/teach$/);
	});

	it('links the TRK card', () => {
		expect(field(notice, 'TRK card')).toBe('[TRK-42](https://jira.test/browse/TRK-42)');
	});

	it('leaves out availability the student did not give, and a card that does not exist', () => {
		const bare = examReadyNotice({ ...request, availability: null, issueKey: null }, []);
		expect(field(bare, 'Availability')).toBeUndefined();
		expect(field(bare, 'TRK card')).toBeUndefined();
	});
});

describe('needsCatpNotice', () => {
	it('warns the training admins, with who taught and who examined', () => {
		const notice = needsCatpNotice(request);
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBe('warning');
		expect(field(notice, 'Taught by')).toBe('SW');
		expect(field(notice, 'Examined by')).toBe('HI');
		expect(notice.link).toBe('https://jira.test/browse/TRK-42');
		// Students are not pinged from here: TRK's own script tells them for now.
		expect(notice.mention).toBeUndefined();
	});

	// Needs CATP is also reached from In Training, with no exam behind it.
	it('does not assume there was an exam', () => {
		const notice = needsCatpNotice({ ...request, examiner: null });
		expect(notice.title).not.toMatch(/exam/i);
		expect(field(notice, 'Examined by')).toBeUndefined();
	});
});

describe('awaitingAuditNotice', () => {
	it('sends the training admins to the audit, with what the student now holds', () => {
		const notice = awaitingAuditNotice({ ...request, holds: 'T-RC' });
		expect(notice.audience).toBe('training-admins');
		expect(notice.link).toMatch(/\/admin\/audit$/);
		expect(field(notice, 'Now holds')).toBe('T-RC');
	});

	it('leaves out an examiner for a course with no exam', () => {
		const notice = awaitingAuditNotice({
			...request,
			course: 'A-GC',
			examiner: null,
			holds: 'A-GC'
		});
		expect(field(notice, 'Examined by')).toBeUndefined();
	});
});

describe('stuckRequestNotice', () => {
	it('warns the training admins with the error, and sends them to the Admin page', () => {
		const notice = stuckRequestNotice(request, 'Jira 401: Unauthorized', 5);
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBe('warning');
		expect(notice.summary).toContain('5 times');
		expect(field(notice, 'Last error')).toBe('Jira 401: Unauthorized');
		expect(notice.link).toMatch(/\/admin$/);
	});
});

describe('certificationHeldNotice', () => {
	const notice = certificationHeldNotice(request, ['RE Instructor', 'RE Completed']);

	it('warns the training admins, naming what the card lacks', () => {
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBe('warning');
		expect(field(notice, 'Missing on the card')).toBe('RE Instructor, RE Completed');
		expect(notice.summary).toContain('nothing has been granted');
	});

	it('links to the card, or to the audit page when Jira’s address is unknown', () => {
		expect(notice.link).toBe('https://jira.test/browse/TRK-42');
		expect(certificationHeldNotice({ ...request, issueUrl: null }, ['x']).link).toMatch(
			/\/admin\/audit$/
		);
	});

	it('pings nobody', () => {
		expect(notice.mention).toBeUndefined();
	});
});

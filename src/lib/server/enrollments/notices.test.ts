import { describe, expect, it } from 'vitest';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import {
	announcementFor,
	awaitingAuditNotice,
	examReadyNotice,
	needsCatpNotice,
	stuckRequestNotice,
	withdrawnNotice
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

	it('says the exam was failed when the card came from Rating Exam', () => {
		const notice = needsCatpNotice(request, true);
		expect(notice.title).toBe('Rating exam failed: Jo Rivera');
		expect(notice.summary).toBe('Jo Rivera failed their rating exam.');
	});

	// Staff can move a card to Needs CATP from In Training, with no exam behind it.
	it('does not mention an exam when the card came from anywhere else', () => {
		const notice = needsCatpNotice(request, false);
		expect(notice.title).toBe('Needs CATP: Jo Rivera');
		expect(notice.summary).not.toMatch(/exam/i);
	});
});

describe('withdrawnNotice', () => {
	it('tells the training admins who withdrew, from what, and where they were', () => {
		const notice = withdrawnNotice({ ...request, examiner: null, was: 'in-training' });
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toBe('Withdrawn: Jo Rivera');
		expect(notice.summary).toBe('Jo Rivera withdrew from Terminal Radar Control (T-RC).');
		expect(field(notice, 'Was')).toBe('In training');
		expect(field(notice, 'Teacher')).toBe('SW');
		expect(notice.link).toBe('https://jira.test/browse/TRK-42');
	});

	// Mid-course it frees a teacher's slot; from the waitlist it is only news.
	it('is a warning mid-course and plain from the waitlist', () => {
		expect(withdrawnNotice({ ...request, was: 'in-training' }).tone).toBe('warning');
		expect(withdrawnNotice({ ...request, was: 'rating-exam' }).tone).toBe('warning');
		const waiting = withdrawnNotice({ ...request, teacher: null, examiner: null, was: 'waitlist' });
		expect(waiting.tone).toBe('info');
		expect(field(waiting, 'Teacher')).toBeUndefined();
	});
});

describe('awaitingAuditNotice', () => {
	it('sends the training admins to the audit, with what the student now holds', () => {
		const notice = awaitingAuditNotice({ ...request, holds: 'T-RC' });
		expect(notice.audience).toBe('training-admins');
		expect(notice.link).toMatch(/\/admin\/audit$/);
		expect(notice.summary).toBe('Jo Rivera completed T-RC.');
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
	// Only the tech team can fix why Jira is refusing it.
	it('warns the tech team with the error, and sends them to the Admin page', () => {
		const notice = stuckRequestNotice(request, 'Jira 401: Unauthorized', 5);
		expect(notice.audience).toBe('tech-team');
		expect(notice.tone).toBe('warning');
		expect(notice.summary).toContain('5 times');
		expect(field(notice, 'Last error')).toBe('Jira 401: Unauthorized');
		expect(notice.link).toMatch(/\/admin$/);
	});
});

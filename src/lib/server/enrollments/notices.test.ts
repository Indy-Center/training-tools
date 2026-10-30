import { describe, expect, it } from 'vitest';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import {
	announcementFor,
	awaitingAuditNotice,
	certificationHeldNotice,
	examReadyNotice,
	examStatus,
	needsCatpNotice,
	newEnrollmentNotice,
	rosterExpiryNotice,
	rosterRemovalExaminerMessage,
	rosterRemovalNotice,
	rosterRemovalStudentMessage,
	rosterRemovalSummaryNotice,
	rosterRemovalTeacherMessage,
	rosterRestoreExaminerMessage,
	rosterRestoreNotice,
	rosterRestoreRefusedNotice,
	rosterRestoreStudentMessage,
	rosterRestoreTeacherMessage,
	stuckRequestNotice,
	vatusaOverdueNotice,
	vatusaReminderMessage,
	vatusaUndeliveredNotice,
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

	it('starts out waiting for an examiner, with a button to the teach page', () => {
		expect(field(notice, 'Status')).toBe('Waiting for an examiner');
		expect(notice.buttons).toEqual([
			{ label: 'Open Teach', url: 'https://training.flyindycenter.com/teach' }
		]);
	});

	it('shows the status it is given', () => {
		const claimed = examReadyNotice({ ...request, availability: null }, [], 'Claimed by Hal Ito');
		expect(field(claimed, 'Status')).toBe('Claimed by Hal Ito');
	});

	// Evaluators have no access to the board.
	it('does not link the TRK card', () => {
		expect(field(notice, 'TRK card')).toBeUndefined();
	});

	it('leaves out availability the student did not give', () => {
		const bare = examReadyNotice({ ...request, availability: null }, []);
		expect(field(bare, 'Availability')).toBeUndefined();
	});
});

describe('examStatus', () => {
	const exam = { status: 'rating-exam', withdrawn: false, examiner: null as string | null };

	it('waits for an examiner, then names whoever claimed it', () => {
		expect(examStatus(exam)).toBe('Waiting for an examiner');
		expect(examStatus({ ...exam, examiner: ' Hal Ito ' })).toBe('Claimed by Hal Ito');
	});

	// Null is what removes the post.
	it('is over once the request leaves the exam, however it left', () => {
		for (const status of [
			'certification-update',
			'completed',
			'needs-catp',
			'in-training',
			'removed'
		]) {
			expect(examStatus({ ...exam, status, examiner: 'Hal Ito' })).toBeNull();
		}
		expect(examStatus({ ...exam, withdrawn: true })).toBeNull();
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

describe('newEnrollmentNotice', () => {
	const enrolled = {
		...request,
		teacher: null,
		examiner: null,
		rating: 'S1',
		availability: 'Weeknights after 7',
		notificationPreference: 'discord'
	};

	it('tells the training admins who enrolled, in what, and how to reach them', () => {
		const notice = newEnrollmentNotice(enrolled);
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBeUndefined();
		expect(notice.title).toBe('New enrollment: Jo Rivera');
		expect(field(notice, 'Course')).toBe('Terminal Radar Control (T-RC)');
		expect(field(notice, 'Rating')).toBe('S1');
		expect(field(notice, 'Contact by')).toBe('Discord message');
		expect(field(notice, 'Availability')).toBe('Weeknights after 7');
		expect(notice.link).toBe('https://jira.test/browse/TRK-42');
		expect(notice.mention).toBeUndefined();
	});

	// Jira was down as they submitted: the request is still theirs and ours.
	it('says so when the card has not reached the board yet', () => {
		const notice = newEnrollmentNotice({ ...enrolled, issueKey: null, issueUrl: null });
		expect(field(notice, 'TRK card')).toMatch(/Not on the board yet/);
		expect(notice.link).toBeUndefined();
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

describe('vatusaReminderMessage', () => {
	const assigned = { course: 'T-RC', assignedOn: '2026-10-01' };

	it('tells the student they have 30 days, and by when', () => {
		const message = vatusaReminderMessage('assigned', assigned);
		expect(message.title).toBe('Your VATUSA Academy course has been assigned');
		expect(message.summary).toContain('30 days');
		expect(message.summary).toContain('October 31, 2026');
		expect(message.link).toBe('https://academy.vatusa.net');
	});

	it('counts the days left in each reminder', () => {
		expect(vatusaReminderMessage('22-days-left', assigned).title).toMatch(/^22 days left/);
		expect(vatusaReminderMessage('16-days-left', assigned).title).toMatch(/^16 days left/);
		expect(vatusaReminderMessage('16-days-left', assigned).summary).toContain('October 31, 2026');
	});

	it('says so when the time is up', () => {
		const message = vatusaReminderMessage('expired', assigned);
		expect(message.tone).toBe('warning');
		expect(message.title).toContain('overdue');
		expect(message.summary).toContain('training staff');
	});

	it('still reads when the card date cannot', () => {
		expect(vatusaReminderMessage('assigned', { course: 'T-RC', assignedOn: '' }).summary).toContain(
			'30 days after it was assigned'
		);
	});
});

describe('vatusaOverdueNotice', () => {
	it('tells the training admins who is overdue, and since when', () => {
		const notice = vatusaOverdueNotice({ ...request, assignedOn: '2026-10-01' });
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBe('warning');
		expect(notice.title).toBe('VATUSA course overdue: Jo Rivera');
		expect(field(notice, 'Assigned')).toBe('October 1, 2026');
		expect(field(notice, 'Due')).toBe('October 31, 2026');
	});
});

describe('vatusaUndeliveredNotice', () => {
	it('hands the training admins the message that could not be sent', () => {
		const notice = vatusaUndeliveredNotice('22-days-left', {
			...request,
			assignedOn: '2026-10-01'
		});
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toContain('Jo Rivera');
		expect(field(notice, 'Message')).toContain('22 days left');
	});
});

describe('roster removal notices', () => {
	const removal = {
		...request,
		was: 'in-training',
		leftHomeOn: '2026-10-01',
		restoreBy: '2026-10-31',
		untold: []
	};

	it('tells the training admins what was removed, from where, and until when', () => {
		const notice = rosterRemovalNotice(removal);
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toBe('Left the home roster: Jo Rivera');
		expect(notice.summary).toBe(
			'Jo Rivera has been off the ZID home roster for more than 24 hours, so their Terminal Radar Control (T-RC) request was removed automatically. It is restored if they are back on the home roster by October 31, 2026.'
		);
		expect(field(notice, 'Was')).toBe('In training');
		expect(field(notice, 'Left the home roster')).toBe('October 1, 2026');
		expect(field(notice, 'Teacher')).toBe('SW');
		expect(field(notice, 'TRK card')).toBe('[TRK-42](https://jira.test/browse/TRK-42)');
		expect(field(notice, 'Not told')).toBeUndefined();
	});

	it('says who could not be told', () => {
		const notice = rosterRemovalNotice({
			...removal,
			untold: ['the student (no Discord ID)', 'teacher SW (no Discord ID)']
		});
		expect(field(notice, 'Not told')).toBe(
			'the student (no Discord ID), teacher SW (no Discord ID)'
		);
	});

	it('tells the student when to be back by', () => {
		const message = rosterRemovalStudentMessage({ course: 'T-RC', restoreBy: '2026-10-31' });
		expect(message.title).toBe('Your training request is paused');
		expect(message.summary).toBe(
			"You've left the ZID home roster, so your Terminal Radar Control (T-RC) request has been taken off the training queue. If you are back on the home roster by October 31, 2026, it is restored to where it was."
		);
	});

	it('tells the teacher their student has gone and the slot is free', () => {
		const message = rosterRemovalTeacherMessage({
			name: 'Jo Rivera',
			course: 'T-RC',
			restoreBy: '2026-10-31'
		});
		expect(message.title).toBe('Jo Rivera has left the home roster');
		expect(message.summary).toBe(
			'Jo Rivera has left the ZID home roster, so their Terminal Radar Control (T-RC) training is paused and no longer takes one of your slots. If they are back by October 31, 2026, their request is restored to where it was.'
		);
	});

	it('tells the examiner the exam they claimed is off', () => {
		const message = rosterRemovalExaminerMessage({
			name: 'Jo Rivera',
			course: 'T-RC',
			restoreBy: '2026-10-31'
		});
		expect(message.title).toBe("Jo Rivera's rating exam is paused");
		expect(message.summary).toBe(
			'Jo Rivera has left the ZID home roster, so the Terminal Radar Control (T-RC) rating exam you claimed is paused. If they are back by October 31, 2026, their request is restored to where it was.'
		);
	});

	it('gives the admins one line when a restore window runs out', () => {
		const notice = rosterExpiryNotice({ ...request, restoreBy: '2026-11-19' });
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toBe('Request closed: Jo Rivera');
		expect(notice.summary).toBe(
			'Jo Rivera (1234567) did not return to the ZID home roster by November 19, 2026; their Terminal Radar Control (T-RC) request is closed for good.'
		);
	});

	it('sums up a first run in one notice, a line per request', () => {
		const notice = rosterRemovalSummaryNotice([
			{ ...request, was: 'waitlist', leftHomeOn: '2026-08-01' },
			{
				...request,
				name: 'Sam Lee',
				cid: '7654321',
				issueKey: null,
				issueUrl: null,
				was: 'in-training',
				leftHomeOn: '2026-07-15'
			}
		]);
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toBe('Closed 2 requests from students who left the home roster');
		expect(notice.summary).toBe(
			[
				'These students left the ZID home roster more than 30 days ago, so their requests were removed and closed for good. Nobody was messaged. Each can enroll again, at the back of the line.',
				'',
				'Jo Rivera (1234567): Terminal Radar Control (T-RC), On the waitlist, left August 1, 2026 ([TRK-42](https://jira.test/browse/TRK-42))',
				'Sam Lee (7654321): Terminal Radar Control (T-RC), In training, left July 15, 2026'
			].join('\n')
		);
	});
});

describe('roster restore notices', () => {
	const restore = {
		...request,
		stage: 'In Training',
		keptInLine: false,
		teacherCleared: null,
		untold: []
	};

	it('tells the training admins what was restored, and where to', () => {
		const notice = rosterRestoreNotice(restore);
		expect(notice.audience).toBe('training-admins');
		expect(notice.title).toBe('Restored: Jo Rivera');
		expect(notice.summary).toBe(
			"Jo Rivera's Terminal Radar Control (T-RC) request was restored to In Training, at its old place in line."
		);
		expect(field(notice, 'Restored to')).toBe('In Training');
		expect(field(notice, 'Teacher')).toBe('SW');
		expect(field(notice, 'Examiner')).toBe('HI');
		expect(field(notice, 'TRK card')).toBe('[TRK-42](https://jira.test/browse/TRK-42)');
		expect(field(notice, 'Not told')).toBeUndefined();
	});

	it('says when it is kept in line, a teacher was cleared, or someone was not told', () => {
		const notice = rosterRestoreNotice({
			...restore,
			stage: 'Waitlist',
			teacher: null,
			keptInLine: true,
			teacherCleared: 'SW',
			untold: ['the student (chose email)']
		});
		expect(notice.summary).toBe(
			"Jo Rivera's Terminal Radar Control (T-RC) request was restored to Waitlist, at its old place in line. They are still off the ZID home roster, so it is kept in line and is not removed again while they are away."
		);
		expect(field(notice, 'Teacher')).toBe('SW cleared: no longer an active teacher');
		expect(field(notice, 'Not told')).toBe('the student (chose email)');
	});

	it('tells the student their request is back', () => {
		const message = rosterRestoreStudentMessage({
			course: 'T-RC',
			stage: 'Rating Exam',
			teacherCleared: false
		});
		expect(message.title).toBe('Your training request is back');
		expect(message.summary).toBe(
			'Your Terminal Radar Control (T-RC) request has been restored to Rating Exam, at its old place in line.'
		);
	});

	it('tells the student when their teacher is not taking them back', () => {
		const message = rosterRestoreStudentMessage({
			course: 'T-RC',
			stage: 'Waitlist',
			teacherCleared: true
		});
		expect(message.summary).toBe(
			'Your Terminal Radar Control (T-RC) request has been restored to Waitlist, at its old place in line. Your teacher is not taking students right now, so you wait on the waitlist for a new one.'
		);
	});

	it('tells the teacher their student is back with them', () => {
		const message = rosterRestoreTeacherMessage({ name: 'Jo Rivera', course: 'T-RC' });
		expect(message.title).toBe('Jo Rivera is back in training with you');
		expect(message.summary).toBe(
			"Jo Rivera's Terminal Radar Control (T-RC) training has been restored, so they are your student again and take one of your slots."
		);
	});

	it('tells the examiner they are still on the card', () => {
		const message = rosterRestoreExaminerMessage({
			name: 'Jo Rivera',
			course: 'T-RC',
			stage: 'Rating Exam'
		});
		expect(message.title).toBe("Jo Rivera's request is back");
		expect(message.summary).toBe(
			"Jo Rivera's Terminal Radar Control (T-RC) request has been restored to Rating Exam, and you are still named on it as examiner."
		);
	});

	it("tells the training admins a restore is waiting on the board, with Jira's error", () => {
		const notice = rosterRestoreRefusedNotice({
			...request,
			stage: 'Waitlist',
			transition: 'Restore to Waitlist',
			error: 'No transition to "Waitlist" from TRK-42\'s current status.'
		});
		expect(notice.audience).toBe('training-admins');
		expect(notice.tone).toBe('warning');
		expect(notice.title).toBe('Restore waiting on the board: Jo Rivera');
		expect(notice.summary).toBe(
			'Jo Rivera is back on the ZID home roster, but TRK refused to move their Terminal Radar Control (T-RC) request from Removed to Waitlist, so it has not been restored. It is tried again on every pass, and this is the only notice. Has the "Restore to Waitlist" transition been added to the board?'
		);
		expect(field(notice, 'Restore to')).toBe('Waitlist');
		expect(field(notice, 'Jira said')).toBe(
			'No transition to "Waitlist" from TRK-42\'s current status.'
		);
		expect(field(notice, 'TRK card')).toBe('[TRK-42](https://jira.test/browse/TRK-42)');
	});
});

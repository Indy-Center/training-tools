import { describe, expect, it } from 'vitest';
import { requestTimeline, type RequestTimelineInput } from './request-timeline';

/** A course with a rating exam and no VATUSA Academy course. */
const base: RequestTimelineInput = {
	course: 'S-GC',
	status: 'waitlist',
	createdAt: new Date('2026-08-14T15:00:00Z'),
	teacher: null,
	examiner: null,
	vatusaAssignedOn: null,
	vatusaCompletedOn: null,
	certificationAppliedAt: null
};

/** A course with both. */
const radar: RequestTimelineInput = { ...base, course: 'T-RC' };

function states(input: Partial<RequestTimelineInput>) {
	return requestTimeline({ ...base, ...input }).map((step) => `${step.key}:${step.state}`);
}

describe('requestTimeline', () => {
	it('starts on the waitlist, dated when the request was made', () => {
		const steps = requestTimeline(base);

		expect(steps.map((step) => `${step.key}:${step.state}`)).toEqual([
			'waitlist:current',
			'training:upcoming',
			'exam:upcoming',
			'certification:upcoming'
		]);
		expect(steps[0].date).toBe('August 14, 2026');
	});

	it('marks earlier steps done as the status moves on', () => {
		expect(states({ status: 'rating-exam' })).toEqual([
			'waitlist:done',
			'training:done',
			'exam:current',
			'certification:upcoming'
		]);
	});

	it('names the teacher once training has started', () => {
		const training = (input: Partial<RequestTimelineInput>) =>
			requestTimeline({ ...base, teacher: 'Jo Rivera (JR)', ...input }).find(
				(step) => step.key === 'training'
			);

		expect(training({ status: 'waitlist' })?.detail).toBeNull();
		expect(training({ status: 'in-training' })?.detail).toBe('Teacher: Jo Rivera (JR)');
	});

	// The card reaches Needs CATP from training or from a failed exam, and does
	// not say which.
	it('keeps a request at Needs CATP on the training step', () => {
		const steps = requestTimeline({ ...base, status: 'needs-catp' });

		expect(steps.find((step) => step.state === 'current')).toMatchObject({
			key: 'training',
			detail: 'A Corrective Action Training Plan is being put together.'
		});
	});

	it('leaves the rating exam out of a course that has none', () => {
		expect(states({ course: 'A-GC', status: 'in-training' })).toEqual([
			'waitlist:done',
			'training:current',
			'certification:upcoming'
		]);
	});

	it('shows the exam for a course where it is optional only once it is in one', () => {
		expect(states({ course: 'CUSTOM', status: 'in-training' })).not.toContain('exam:upcoming');
		expect(states({ course: 'CUSTOM', status: 'rating-exam' })).toContain('exam:current');
	});

	it('names the examiner during the exam', () => {
		const steps = requestTimeline({ ...base, status: 'rating-exam', examiner: 'VATUSA' });

		expect(steps.find((step) => step.key === 'exam')?.detail).toBe('Examiner: VATUSA');
	});

	it('places the VATUSA course between the waitlist and training before it is assigned', () => {
		expect(states({ course: 'T-RC' })).toEqual([
			'waitlist:current',
			'vatusa-assigned:upcoming',
			'vatusa-passed:upcoming',
			'training:upcoming',
			'exam:upcoming',
			'certification:upcoming'
		]);
	});

	it('leaves the VATUSA course out of a course that has none', () => {
		expect(states({})).toEqual([
			'waitlist:current',
			'training:upcoming',
			'exam:upcoming',
			'certification:upcoming'
		]);
	});

	it('dates the VATUSA course once assigned, and waits on the pass', () => {
		const [, assigned, passed] = requestTimeline({ ...radar, vatusaAssignedOn: '2026-09-20' });

		expect(assigned).toMatchObject({ state: 'done', date: 'September 20, 2026' });
		expect(passed).toMatchObject({ state: 'current', date: null });
	});

	it('dates the VATUSA course by the day it was passed', () => {
		const [, assigned, passed] = requestTimeline({
			...radar,
			vatusaAssignedOn: '2026-09-20',
			vatusaCompletedOn: '2026-10-01'
		});

		expect(assigned).toMatchObject({ state: 'done', date: 'September 20, 2026' });
		expect(passed).toMatchObject({ state: 'done', date: 'October 1, 2026' });
	});

	// A pass from before we assigned it, for another facility, still counts.
	it('counts the course as assigned when it is passed with no assigned date', () => {
		const [, assigned] = requestTimeline({ ...radar, vatusaCompletedOn: '2026-10-01' });

		expect(assigned).toMatchObject({ state: 'done', date: null });
	});

	it('dates the certification once it has been applied', () => {
		const steps = requestTimeline({
			...base,
			status: 'certification-update',
			certificationAppliedAt: new Date('2026-10-05T15:00:00Z')
		});

		expect(steps.at(-1)).toMatchObject({
			key: 'certification',
			state: 'current',
			date: 'October 5, 2026'
		});
	});
});

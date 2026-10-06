import { describe, expect, it } from 'vitest';
import {
	isStale,
	mapJiraStatus,
	parseJiraTimestamp,
	RE_INSTRUCTOR_FIELD,
	resolveStatusUpdate,
	textareaText,
	TEACHER_FIELD
} from './status';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';

describe('mapJiraStatus', () => {
	it('maps every TRK status by name', () => {
		expect(mapJiraStatus('Waitlist')).toBe('waitlist');
		expect(mapJiraStatus('In Training')).toBe('in-training');
		expect(mapJiraStatus('Rating Exam')).toBe('rating-exam');
		expect(mapJiraStatus('Needs CATP')).toBe('needs-catp');
		expect(mapJiraStatus('Audit')).toBe('certification-update');
		expect(mapJiraStatus('Completed')).toBe('completed');
		expect(mapJiraStatus('Removed')).toBe('removed');
		expect(mapJiraStatus('Withdrawn')).toBe('withdrawn');
	});

	// The board called it Certification Update until 2026-10-06.
	it('still reads the status Audit used to be called', () => {
		expect(mapJiraStatus('Certification Update')).toBe('certification-update');
	});

	// Guards the two lists drifting apart when a status is added on one side.
	it('covers every status we store', () => {
		const mapped = [
			'Waitlist',
			'In Training',
			'Rating Exam',
			'Needs CATP',
			'Certification Update',
			'Completed',
			'Removed',
			'Withdrawn'
		].map(mapJiraStatus);
		expect([...mapped].sort()).toEqual([...ENROLLMENT_STATUSES].sort());
	});

	it('ignores case and stray whitespace', () => {
		expect(mapJiraStatus('  in training ')).toBe('in-training');
	});

	// The dead triage statuses from 0009, and anything renamed later.
	it('returns null for a status it does not know', () => {
		expect(mapJiraStatus('New Enrolments')).toBeNull();
		expect(mapJiraStatus('')).toBeNull();
		expect(mapJiraStatus(null)).toBeNull();
	});
});

describe('resolveStatusUpdate', () => {
	it('reads status and teacher initials', () => {
		expect(
			resolveStatusUpdate({
				key: 'TRK-12',
				fields: { status: { name: 'In Training' }, [TEACHER_FIELD]: { value: 'CT' } }
			})
		).toEqual({
			action: 'update',
			update: {
				status: 'in-training',
				teacher: 'CT',
				reInstructor: null,
				availability: null,
				vatusaAssignedOn: null,
				vatusaCompletedOn: null
			}
		});
	});

	it('treats an unset Teacher as null', () => {
		expect(
			resolveStatusUpdate({
				key: 'TRK-12',
				fields: { status: { name: 'Waitlist' }, [TEACHER_FIELD]: null }
			})
		).toEqual({
			action: 'update',
			update: {
				status: 'waitlist',
				teacher: null,
				reInstructor: null,
				availability: null,
				vatusaAssignedOn: null,
				vatusaCompletedOn: null
			}
		});
	});

	// `VATUSA` is a real option on the board: the division examines, not one of ours.
	it('reads the rating exam instructor alongside the teacher', () => {
		expect(
			resolveStatusUpdate({
				key: 'TRK-12',
				fields: {
					status: { name: 'Rating Exam' },
					[TEACHER_FIELD]: { value: 'CT' },
					[RE_INSTRUCTOR_FIELD]: { value: ' VATUSA ' }
				}
			})
		).toEqual({
			action: 'update',
			update: {
				status: 'rating-exam',
				teacher: 'CT',
				reInstructor: 'VATUSA',
				availability: null,
				vatusaAssignedOn: null,
				vatusaCompletedOn: null
			}
		});
	});

	it('reports an unknown status rather than guessing', () => {
		expect(resolveStatusUpdate({ key: 'TRK-12', fields: { status: { name: 'On Hold' } } })).toEqual(
			{
				action: 'unknown-status',
				statusName: 'On Hold'
			}
		);
	});

	it('copes with an issue that came back without fields', () => {
		expect(resolveStatusUpdate({ key: 'TRK-12' })).toEqual({
			action: 'unknown-status',
			statusName: null
		});
	});
});

describe('parseJiraTimestamp', () => {
	it('reads Jira’s colon-less offset', () => {
		expect(parseJiraTimestamp('2026-09-23T10:32:53.283-0400')?.toISOString()).toBe(
			'2026-09-23T14:32:53.283Z'
		);
		expect(parseJiraTimestamp('2026-09-23T14:32:53.283+0000')?.toISOString()).toBe(
			'2026-09-23T14:32:53.283Z'
		);
	});

	it('returns null for anything unparseable', () => {
		expect(parseJiraTimestamp(null)).toBeNull();
		expect(parseJiraTimestamp('')).toBeNull();
		expect(parseJiraTimestamp('yesterday')).toBeNull();
	});
});

describe('isStale', () => {
	// TRK-52, 2026-09-23: Teacher set, then Assign Teacher 2.3 seconds later.
	const teacherEdit = new Date('2026-09-23T14:32:50.985Z');
	const transition = new Date('2026-09-23T14:32:53.283Z');

	it('refuses the Teacher edit once the transition has been applied', () => {
		expect(isStale(transition, teacherEdit)).toBe(true);
	});

	it('applies the transition over the Teacher edit', () => {
		expect(isStale(teacherEdit, transition)).toBe(false);
	});

	it('lets the same state through again', () => {
		expect(isStale(transition, new Date(transition))).toBe(false);
	});

	it('lets anything through when either time is unknown', () => {
		expect(isStale(null, teacherEdit)).toBe(false);
		expect(isStale(transition, null)).toBe(false);
	});
});

describe('resolveStatusUpdate, VATUSA course dates', () => {
	const issue = (assigned: unknown, completed: unknown) => ({
		key: 'TRK-1',
		fields: {
			status: { name: 'Waitlist' },
			customfield_10289: assigned as string | null,
			customfield_10288: completed as string | null
		}
	});

	it('reads the two dates off the card', () => {
		const resolution = resolveStatusUpdate(issue('2026-10-01', '2026-10-05'));
		expect(resolution).toMatchObject({
			update: { vatusaAssignedOn: '2026-10-01', vatusaCompletedOn: '2026-10-05' }
		});
	});

	// A date field is a plain day or nothing; anything else is not trusted.
	it('treats a missing or malformed date as not set', () => {
		expect(resolveStatusUpdate(issue(null, undefined))).toMatchObject({
			update: { vatusaAssignedOn: null, vatusaCompletedOn: null }
		});
		expect(resolveStatusUpdate(issue('yesterday', '2026-10-05T10:00:00Z'))).toMatchObject({
			update: { vatusaAssignedOn: null, vatusaCompletedOn: null }
		});
	});
});

describe('textareaText', () => {
	const doc = (...paragraphs: unknown[][]) => ({
		type: 'doc',
		version: 1,
		content: paragraphs.map((content) => ({ type: 'paragraph', content }))
	});
	const text = (value: string) => ({ type: 'text', text: value });

	it('reads the REST API document format as lines of text', () => {
		expect(
			textareaText(doc([text('Weeknights after 7')], [text('Weekends '), text('any time')]))
		).toBe('Weeknights after 7\nWeekends any time');
	});

	it('keeps a line break inside a paragraph', () => {
		expect(textareaText(doc([text('Mon'), { type: 'hardBreak' }, text('Tue')]))).toBe('Mon\nTue');
	});

	// A webhook delivery carries the same field as a plain string.
	it('reads a plain string as it is', () => {
		expect(textareaText('  Any evening  ')).toBe('Any evening');
	});

	it('is null for an empty field, whatever shape it comes in', () => {
		expect(textareaText(null)).toBeNull();
		expect(textareaText('   ')).toBeNull();
		expect(textareaText(doc([]))).toBeNull();
		expect(textareaText(42)).toBeNull();
	});
});

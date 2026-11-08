import { describe, expect, it } from 'vitest';
import {
	isStale,
	mapJiraStatus,
	fieldsForMove,
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

describe('fieldsForMove', () => {
	const TEACHER_ASSIGNED = 'customfield_10247';
	const REMOVED = 'customfield_10251';
	const RE_FAILED = 'customfield_10324';
	const RE_ATTEMPTS = 'customfield_10325';
	const RECOMMENDED_FOR_RE = 'customfield_10326';
	const REMOVAL_REASON = 'customfield_10323';
	const TRAINING_COMPLETED = 'customfield_10248';
	const TODAY = '2026-11-08';
	const card = (fields: Record<string, string | number | null> = {}) => ({
		key: 'TRK-9001',
		fields
	});

	it('dates Teacher Assigned on a move into In Training', () => {
		expect(fieldsForMove({ from: 'waitlist', to: 'in-training' }, card(), TODAY)).toEqual({
			[TEACHER_ASSIGNED]: TODAY
		});
	});

	it('dates Removed on a move to Removed or Withdrawn, from anywhere', () => {
		expect(fieldsForMove({ from: 'waitlist', to: 'removed' }, card(), TODAY)).toEqual({
			[REMOVED]: TODAY
		});
		expect(fieldsForMove({ from: 'in-training', to: 'withdrawn' }, card(), TODAY)).toEqual({
			[REMOVED]: TODAY
		});
	});

	// A date entered by hand, or the first assignment before a card came back
	// from Needs CATP, stays as it is.
	it('never overwrites a Teacher Assigned or Removed the card already has', () => {
		expect(
			fieldsForMove(
				{ from: 'needs-catp', to: 'in-training' },
				card({ [TEACHER_ASSIGNED]: '2026-09-01' }),
				TODAY
			)
		).toEqual({});
		expect(
			fieldsForMove({ from: 'waitlist', to: 'removed' }, card({ [REMOVED]: '2026-10-01' }), TODAY)
		).toEqual({});
	});

	it('dates Recommended for RE on In Training → Rating Exam, only when it is empty', () => {
		expect(fieldsForMove({ from: 'in-training', to: 'rating-exam' }, card(), TODAY)).toEqual({
			[RECOMMENDED_FOR_RE]: TODAY
		});
		expect(
			fieldsForMove(
				{ from: 'in-training', to: 'rating-exam' },
				card({ [RECOMMENDED_FOR_RE]: '2026-10-20' }),
				TODAY
			)
		).toEqual({});
	});

	// Recommended for RE is the first recommendation: a retake from Needs CATP
	// is not one.
	it('leaves Recommended for RE on a move to Rating Exam from anywhere else', () => {
		expect(fieldsForMove({ from: 'needs-catp', to: 'rating-exam' }, card(), TODAY)).toEqual({});
	});

	it('overwrites RE Failed and counts an attempt on a failed exam', () => {
		expect(
			fieldsForMove(
				{ from: 'rating-exam', to: 'needs-catp' },
				card({ [RE_FAILED]: '2026-09-15', [RE_ATTEMPTS]: 2 }),
				TODAY
			)
		).toEqual({ [RE_FAILED]: TODAY, [RE_ATTEMPTS]: 3 });
	});

	// A fail from an earlier attempt is dated before the retraining's Training
	// Completed (the certification hold relies on it), so it is overwritten.
	it('overwrites an RE Failed dated before Training Completed', () => {
		expect(
			fieldsForMove(
				{ from: 'rating-exam', to: 'needs-catp' },
				card({ [TRAINING_COMPLETED]: '2026-10-01', [RE_FAILED]: '2026-09-15', [RE_ATTEMPTS]: 1 }),
				TODAY
			)
		).toEqual({ [RE_FAILED]: TODAY, [RE_ATTEMPTS]: 2 });
	});

	// The CTRS read-back writes this exam's session day before the move: on or
	// after Training Completed, it is this fail's date and stays.
	it('keeps an RE Failed on or after Training Completed, still counting the attempt', () => {
		for (const failed of ['2026-10-01', '2026-10-20']) {
			expect(
				fieldsForMove(
					{ from: 'rating-exam', to: 'needs-catp' },
					card({ [TRAINING_COMPLETED]: '2026-10-01', [RE_FAILED]: failed }),
					TODAY
				)
			).toEqual({ [RE_ATTEMPTS]: 1 });
		}
	});

	it('counts a passed exam as an attempt, an empty count as 0', () => {
		expect(
			fieldsForMove({ from: 'rating-exam', to: 'certification-update' }, card(), TODAY)
		).toEqual({ [RE_ATTEMPTS]: 1 });
	});

	it('does not count leaving Rating Exam for Removed or Withdrawn as an attempt', () => {
		const counted = card({ [RE_ATTEMPTS]: 1 });
		expect(fieldsForMove({ from: 'rating-exam', to: 'removed' }, counted, TODAY)).toEqual({
			[REMOVED]: TODAY
		});
		expect(fieldsForMove({ from: 'rating-exam', to: 'withdrawn' }, counted, TODAY)).toEqual({
			[REMOVED]: TODAY
		});
	});

	// A card brought back is no longer removed, so the reason it was is cleared,
	// whether or not the card holds one.
	it('clears Removal Reason on a move from Removed to any open stage', () => {
		expect(
			fieldsForMove(
				{ from: 'removed', to: 'waitlist' },
				card({ [REMOVAL_REASON]: 'No response', [REMOVED]: '2026-10-01' }),
				TODAY
			)
		).toEqual({ [REMOVAL_REASON]: null });
		expect(fieldsForMove({ from: 'removed', to: 'rating-exam' }, card(), TODAY)).toEqual({
			[REMOVAL_REASON]: null
		});
		expect(
			fieldsForMove(
				{ from: 'removed', to: 'in-training' },
				card({ [TEACHER_ASSIGNED]: '2026-09-01' }),
				TODAY
			)
		).toEqual({ [REMOVAL_REASON]: null });
	});

	it('keeps Removal Reason on a move from Removed that does not reopen the card', () => {
		const removed = card({ [REMOVAL_REASON]: 'Duplicate or mistake', [REMOVED]: '2026-10-01' });
		expect(fieldsForMove({ from: 'removed', to: 'withdrawn' }, removed, TODAY)).toEqual({});
		expect(fieldsForMove({ from: 'removed', to: 'completed' }, removed, TODAY)).toEqual({});
	});

	it('stamps nothing when the card has not moved', () => {
		expect(fieldsForMove({ from: 'in-training', to: 'in-training' }, card(), TODAY)).toEqual({});
		expect(fieldsForMove(null, card(), TODAY)).toEqual({});
	});

	it('stamps nothing on any other move', () => {
		expect(fieldsForMove({ from: 'certification-update', to: 'completed' }, card(), TODAY)).toEqual(
			{}
		);
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

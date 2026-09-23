import { describe, expect, it } from 'vitest';
import { mapJiraStatus, resolveStatusUpdate, TEACHER_FIELD } from './status';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';

describe('mapJiraStatus', () => {
	it('maps every TRK status by name', () => {
		expect(mapJiraStatus('Waitlist')).toBe('waitlist');
		expect(mapJiraStatus('In Training')).toBe('in-training');
		expect(mapJiraStatus('Rating Exam')).toBe('rating-exam');
		expect(mapJiraStatus('Certification Update')).toBe('certification-update');
		expect(mapJiraStatus('Completed')).toBe('completed');
		expect(mapJiraStatus('Removed')).toBe('removed');
		expect(mapJiraStatus('Withdrawn')).toBe('withdrawn');
	});

	// Guards the two lists drifting apart when a status is added on one side.
	it('covers every status we store', () => {
		const mapped = [
			'Waitlist',
			'In Training',
			'Rating Exam',
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
		).toEqual({ action: 'update', update: { status: 'in-training', teacher: 'CT' } });
	});

	it('treats an unset Teacher as null', () => {
		expect(
			resolveStatusUpdate({
				key: 'TRK-12',
				fields: { status: { name: 'Waitlist' }, [TEACHER_FIELD]: null }
			})
		).toEqual({ action: 'update', update: { status: 'waitlist', teacher: null } });
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

import { describe, expect, it } from 'vitest';
import {
	capacityNotice,
	dropdownNotice,
	leftRosterNotice,
	qualificationChangesNotice,
	statusNotice
} from './notices';

describe('capacityNotice', () => {
	it('tells admins about a slot change, with the new number only', () => {
		const notice = capacityNotice({
			teacher: 'Jo Rivera (JR)',
			changedBy: 'Jo Rivera',
			changes: [{ field: 'slots', from: 2, to: 3 }]
		});
		expect(notice?.audience).toBe('training-admins');
		expect(notice?.title).toBe('Teacher student slots updated');
		expect(notice?.summary).toBe("Jo Rivera (JR)'s student slots changed.");
		expect(notice?.fields).toContainEqual({ label: 'Student slots', value: '3' });
	});

	it('includes the new availability, and not the old', () => {
		const notice = capacityNotice({
			teacher: 'Jo',
			changedBy: 'Jo',
			changes: [{ field: 'availability', from: 'Weeknights', to: 'Weekends' }]
		});
		expect(notice?.fields).toContainEqual({ label: 'Availability', value: 'Weekends' });
		expect(JSON.stringify(notice)).not.toContain('Weeknights');
	});

	it('covers both in one message', () => {
		const notice = capacityNotice({
			teacher: 'Jo',
			changedBy: 'Jo',
			changes: [
				{ field: 'availability', from: 'a', to: 'b' },
				{ field: 'slots', from: null, to: 1 }
			]
		});
		expect(notice?.title).toBe('Teacher availability and student slots updated');
	});

	it('says nothing for initials or status alone', () => {
		expect(
			capacityNotice({
				teacher: 'Jo',
				changedBy: 'Admin',
				changes: [
					{ field: 'initials', from: null, to: 'JR' },
					{ field: 'status', from: 'active', to: 'loa' }
				]
			})
		).toBeNull();
	});
});

describe('statusNotice', () => {
	const assigned = [{ name: 'Sam Lee', course: 'S-GC', status: 'in-training' }];

	it('stays quiet for a manual change with no students', () => {
		expect(
			statusNotice({ teacher: 'Jo', from: 'active', to: 'loa', automatic: false, assigned: [] })
		).toBeNull();
	});

	it('warns when a teacher goes on LOA with students, even manually', () => {
		const notice = statusNotice({
			teacher: 'Jo',
			from: 'active',
			to: 'loa',
			automatic: false,
			assigned
		});
		expect(notice?.tone).toBe('warning');
		expect(notice?.fields).toContainEqual({
			label: 'Students assigned (1)',
			value: 'Sam Lee — S-GC (in-training)'
		});
	});

	it('always reports a change nobody made by hand', () => {
		const notice = statusNotice({
			teacher: 'Jo',
			from: 'loa',
			to: 'active',
			automatic: true,
			assigned: []
		});
		expect(notice?.tone).toBe('info');
		expect(notice?.fields).toContainEqual({ label: 'Changed', value: 'Automatically' });
	});

	it('warns for an automatic LOA with students too', () => {
		expect(
			statusNotice({ teacher: 'Jo', from: 'active', to: 'loa', automatic: true, assigned })?.tone
		).toBe('warning');
	});

	it('says nothing when the status did not change', () => {
		expect(
			statusNotice({ teacher: 'Jo', from: 'loa', to: 'loa', automatic: true, assigned })
		).toBeNull();
	});

	it('does not warn about students when coming back from LOA', () => {
		expect(
			statusNotice({ teacher: 'Jo', from: 'loa', to: 'active', automatic: false, assigned })
		).toBeNull();
	});
});

describe('dropdownNotice', () => {
	const empty = { add: [], remove: [], rename: [] };

	it('says nothing when both dropdowns match', () => {
		expect(dropdownNotice({ teacher: empty, reInstructor: empty })).toBeNull();
	});

	it('lists each change per dropdown', () => {
		const notice = dropdownNotice({
			teacher: { add: ['SC'], remove: ['JR'], rename: [] },
			reInstructor: { add: [], remove: [], rename: [{ from: 'Sw', to: 'SW' }] }
		});
		expect(notice?.audience).toBe('tech-team');
		expect(notice?.tone).toBe('warning');
		expect(notice?.fields).toEqual([
			{ label: 'Teacher dropdown', value: 'Add: SC\nRemove or disable: JR' },
			{ label: 'RE Instructor dropdown', value: 'Rename: Sw → SW' }
		]);
	});
});

describe('leftRosterNotice', () => {
	const assigned = [{ name: 'Sam Lee', course: 'S-GC', status: 'in-training' }];

	it('warns the training admins when a teacher leaves with students assigned', () => {
		const notice = leftRosterNotice({ teacher: 'Jo Rivera (JR)', assigned });
		expect(notice?.audience).toBe('training-admins');
		expect(notice?.tone).toBe('warning');
		expect(notice?.title).toBe('Jo Rivera (JR) has left the teacher roster with students assigned');
		expect(notice?.fields).toContainEqual({
			label: 'Students assigned (1)',
			value: 'Sam Lee — S-GC (in-training)'
		});
	});

	// Leaving with nobody assigned is a line on their timeline and nothing more.
	it('says nothing when they had no students', () => {
		expect(leftRosterNotice({ teacher: 'Jo', assigned: [] })).toBeNull();
	});
});

describe('qualificationChangesNotice', () => {
	it('says nothing when the run changed nothing', () => {
		expect(qualificationChangesNotice([])).toBeNull();
	});

	it('groups what was lowered or ended by teacher, with the reason', () => {
		const notice = qualificationChangesNotice([
			{
				teacher: 'Jo Rivera (JR)',
				code: 'S-GC',
				from: 'evaluator',
				to: 'teacher',
				reason: 'Mentors must be rated S3 or higher to evaluate S-GC'
			},
			{
				teacher: 'Sam Lee (SL)',
				code: 'T-RC',
				from: 'teacher',
				to: null,
				reason: 'Off the roster'
			},
			{ teacher: 'Sam Lee (SL)', code: 'E-RC', from: 'teacher', to: null, reason: 'Off the roster' }
		]);
		expect(notice?.audience).toBe('training-admins');
		expect(notice?.fields).toHaveLength(2);
		expect(notice?.fields?.[0]).toEqual({
			label: 'Jo Rivera (JR)',
			value:
				'S-GC: Teacher and Evaluator → Teacher. Mentors must be rated S3 or higher to evaluate S-GC'
		});
		expect(notice?.fields?.[1].value).toBe(
			'T-RC: Teacher → ended. Off the roster\nE-RC: Teacher → ended. Off the roster'
		);
	});
});

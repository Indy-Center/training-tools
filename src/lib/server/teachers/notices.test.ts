import { describe, expect, it } from 'vitest';
import { capacityNotice, dropdownNotice, statusNotice } from './notices';

describe('capacityNotice', () => {
	it('tells admins about a slot change, with before and after', () => {
		const notice = capacityNotice({
			teacher: 'Jo Rivera (JR)',
			changedBy: 'Jo Rivera',
			changes: [{ field: 'slots', from: 2, to: 3 }]
		});
		expect(notice?.audience).toBe('training-admins');
		expect(notice?.title).toBe('Teacher student slots updated');
		expect(notice?.summary).toMatch(/information/);
		expect(notice?.fields).toContainEqual({ label: 'Student slots', value: '2 → 3' });
	});

	it('includes the old and new availability', () => {
		const notice = capacityNotice({
			teacher: 'Jo',
			changedBy: 'Jo',
			changes: [{ field: 'availability', from: null, to: 'Weekends' }]
		});
		expect(notice?.fields).toContainEqual({ label: 'Availability was', value: 'not set' });
		expect(notice?.fields).toContainEqual({ label: 'Availability is now', value: 'Weekends' });
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
		expect(notice?.tone).toBe('warning');
		expect(notice?.fields).toEqual([
			{ label: 'Teacher dropdown', value: 'Add: SC\nRemove or disable: JR' },
			{ label: 'RE Instructor dropdown', value: 'Rename: Sw → SW' }
		]);
	});
});

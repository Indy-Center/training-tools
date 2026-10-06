import { describe, expect, it } from 'vitest';
import {
	allStatuses,
	countByStatus,
	filterRows,
	groupByCourse,
	SHEET_STATUSES,
	slotsLabel,
	type SheetStatus
} from './waitlist';

const row = (id: string, course: string, status: SheetStatus) => ({ id, course, status });

const rows = [
	row('1', 'S-GC', 'waitlist'),
	row('2', 'S-GC', 'in-training'),
	row('3', 'T-RC', 'waitlist'),
	row('4', 'S-GC', 'rating-exam'),
	row('5', 'T-RC', 'in-training')
];

describe('slotsLabel', () => {
	it('says how many are open, when full, and when nobody has said', () => {
		expect(slotsLabel(2)).toBe('(2 open)');
		expect(slotsLabel(0)).toBe('(full)');
		expect(slotsLabel(null)).toBe('(slots not set)');
	});
});

describe('groupByCourse', () => {
	// The server sorts; grouping must not undo it.
	it('keeps the order the courses and the rows came in', () => {
		const groups = groupByCourse(rows);
		expect(groups.map((group) => group.code)).toEqual(['S-GC', 'T-RC']);
		expect(groups[0].rows.map((r) => r.id)).toEqual(['1', '2', '4']);
		expect(groups[1].rows.map((r) => r.id)).toEqual(['3', '5']);
	});

	it('gives no groups for no rows', () => {
		expect(groupByCourse([])).toEqual([]);
	});
});

describe('allStatuses', () => {
	it('opens the sheet with every status showing', () => {
		expect(Object.keys(allStatuses())).toEqual([...SHEET_STATUSES]);
		expect(Object.values(allStatuses()).every(Boolean)).toBe(true);
	});
});

describe('filterRows', () => {
	it('shows everything with every status on and no course chosen', () => {
		expect(filterRows(rows, { statuses: allStatuses(), course: '' })).toHaveLength(5);
	});

	it('hides a status that is switched off', () => {
		const statuses = { ...allStatuses(), 'in-training': false };
		expect(filterRows(rows, { statuses, course: '' }).map((r) => r.id)).toEqual(['1', '3', '4']);
	});

	it('narrows to one course, on top of the statuses', () => {
		const statuses = { ...allStatuses(), waitlist: false };
		expect(filterRows(rows, { statuses, course: 'S-GC' }).map((r) => r.id)).toEqual(['2', '4']);
	});
});

describe('countByStatus', () => {
	// Counted from every row, so a chip that is off still says what it hides.
	it('counts each status, including those with nobody', () => {
		expect(countByStatus(rows)).toEqual({
			waitlist: 2,
			'in-training': 2,
			'rating-exam': 1,
			'needs-catp': 0
		});
	});
});

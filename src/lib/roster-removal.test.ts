import { describe, expect, it } from 'vitest';
import { ENROLLMENT_STATUSES } from '$lib/db/schema/enrollments';
import {
	boardMoveOutcome,
	isBackOnHomeRoster,
	isDueForRemoval,
	isInRestoreWindow,
	restoreByFor
} from './roster-removal';

const LEFT = new Date('2026-10-01T15:00:00Z');
const minutes = (n: number) => new Date(LEFT.getTime() + n * 60_000);
const HOURS_24 = 24 * 60;

function request(overrides: Partial<Parameters<typeof isDueForRemoval>[0]> = {}) {
	return {
		status: 'waitlist' as string,
		withdrawnAt: null,
		keptInLineAt: null,
		rosterRemovedAt: null,
		restoreClosedAt: null,
		...overrides
	};
}

const away = { leftHomeAt: LEFT };

describe('isDueForRemoval', () => {
	for (const status of ['waitlist', 'in-training', 'rating-exam', 'needs-catp']) {
		it(`removes a ${status} request once its student has been away more than 24 hours`, () => {
			expect(isDueForRemoval(request({ status }), away, minutes(HOURS_24 + 1))).toBe(true);
			expect(isDueForRemoval(request({ status }), away, minutes(HOURS_24 - 1))).toBe(false);
		});
	}

	it('never removes from Audit or a closed status', () => {
		for (const status of ['certification-update', 'completed', 'removed', 'withdrawn']) {
			expect(isDueForRemoval(request({ status }), away, minutes(HOURS_24 * 5))).toBe(false);
		}
	});

	it('covers every status: only the four open stages are ever due', () => {
		const due = ENROLLMENT_STATUSES.filter((status) =>
			isDueForRemoval(request({ status }), away, minutes(HOURS_24 * 5))
		);
		expect(due).toEqual(['waitlist', 'in-training', 'rating-exam', 'needs-catp']);
	});

	it('leaves a request kept in line', () => {
		const kept = request({ keptInLineAt: minutes(60) });
		expect(isDueForRemoval(kept, away, minutes(HOURS_24 * 5))).toBe(false);
	});

	it('leaves a request already in a window, or closed by one', () => {
		const inWindow = request({ rosterRemovedAt: minutes(HOURS_24 + 10) });
		const closed = request({
			rosterRemovedAt: minutes(HOURS_24 + 10),
			restoreClosedAt: minutes(HOURS_24 * 31)
		});
		expect(isDueForRemoval(inWindow, away, minutes(HOURS_24 * 5))).toBe(false);
		expect(isDueForRemoval(closed, away, minutes(HOURS_24 * 40))).toBe(false);
	});

	it('leaves a student back on the home roster', () => {
		expect(isDueForRemoval(request(), { leftHomeAt: null }, minutes(HOURS_24 * 5))).toBe(false);
	});

	// No row means no date to count 24 hours from.
	it('leaves a student with no mirror row at all', () => {
		expect(isDueForRemoval(request(), null, minutes(HOURS_24 * 5))).toBe(false);
	});

	it('leaves a withdrawn request', () => {
		const withdrawn = request({ withdrawnAt: minutes(10) });
		expect(isDueForRemoval(withdrawn, away, minutes(HOURS_24 * 5))).toBe(false);
	});
});

describe('restoreByFor', () => {
	it('is 30 days after leaving the home roster', () => {
		expect(restoreByFor(LEFT).toISOString()).toBe('2026-10-31T15:00:00.000Z');
	});
});

describe('isInRestoreWindow', () => {
	it('is open from the removal until the window closes', () => {
		expect(isInRestoreWindow({ rosterRemovedAt: null, restoreClosedAt: null })).toBe(false);
		expect(isInRestoreWindow({ rosterRemovedAt: LEFT, restoreClosedAt: null })).toBe(true);
		expect(isInRestoreWindow({ rosterRemovedAt: LEFT, restoreClosedAt: minutes(5) })).toBe(false);
	});
});

describe('isBackOnHomeRoster', () => {
	const home = { membership: 'home' as const, removedAt: null, leftHomeAt: null };

	it('is a home member with no left_home_at', () => {
		expect(isBackOnHomeRoster(home)).toBe(true);
	});

	it('is not someone away, a visitor, gone from the mirror, or with no row', () => {
		expect(isBackOnHomeRoster({ ...home, leftHomeAt: LEFT })).toBe(false);
		expect(isBackOnHomeRoster({ ...home, membership: 'visit' })).toBe(false);
		expect(isBackOnHomeRoster({ ...home, removedAt: LEFT })).toBe(false);
		expect(isBackOnHomeRoster(null)).toBe(false);
	});
});

describe('boardMoveOutcome', () => {
	it('treats a card back at a stage as restored', () => {
		for (const status of ['waitlist', 'in-training', 'rating-exam'] as const) {
			expect(boardMoveOutcome({ status, rosterRemovedFrom: 'waitlist' })).toBe('restored');
		}
		expect(boardMoveOutcome({ status: 'needs-catp', rosterRemovedFrom: 'needs-catp' })).toBe(
			'restored'
		);
	});

	it('closes the window for Withdrawn, or Needs CATP from another stage', () => {
		expect(boardMoveOutcome({ status: 'withdrawn', rosterRemovedFrom: 'waitlist' })).toBe('closed');
		expect(boardMoveOutcome({ status: 'needs-catp', rosterRemovedFrom: 'rating-exam' })).toBe(
			'closed'
		);
	});

	it('leaves a card still at Removed, or anywhere else', () => {
		for (const status of ['removed', 'certification-update', 'completed'] as const) {
			expect(boardMoveOutcome({ status, rosterRemovedFrom: 'waitlist' })).toBeNull();
		}
	});
});

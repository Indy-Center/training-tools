import { describe, expect, it } from 'vitest';
import {
	callsignPosition,
	checkConsolidation,
	consolidationRequirement,
	hoursOnPositions,
	type AtcSession
} from './consolidation';

const requirements = {
	'A-LC': { hours: 30, positions: ['GND', 'TWR'] },
	'T-RC': { hours: 50, positions: ['TWR'] }
};

/** A session of `hours` on `callsign`, starting at midnight on the given day of January 2026. */
function session(callsign: string, hours: number, day = 1): AtcSession {
	const start = Date.UTC(2026, 0, day);
	return {
		callsign,
		start: new Date(start).toISOString(),
		end: new Date(start + hours * 3_600_000).toISOString()
	};
}

describe('consolidationRequirement', () => {
	it('reads the configured requirement for a course', () => {
		expect(consolidationRequirement('T-RC', requirements)).toEqual({
			hours: 50,
			positions: ['TWR']
		});
	});

	it('has no requirement for unlisted courses', () => {
		expect(consolidationRequirement('S-GC', requirements)).toBeNull();
		expect(consolidationRequirement(null, requirements)).toBeNull();
	});

	it('treats a setting with no hours or no positions as no requirement', () => {
		expect(consolidationRequirement('X', { X: { hours: 0, positions: ['TWR'] } })).toBeNull();
		expect(consolidationRequirement('X', { X: { hours: -5, positions: ['TWR'] } })).toBeNull();
		expect(consolidationRequirement('X', { X: { hours: 10, positions: [] } })).toBeNull();
	});
});

describe('callsignPosition', () => {
	it('is the last segment of the callsign', () => {
		expect(callsignPosition('CVG_TWR')).toBe('TWR');
		expect(callsignPosition('IND_E_TWR')).toBe('TWR');
		expect(callsignPosition('IND_83_CTR')).toBe('CTR');
	});

	it('normalizes case and whitespace', () => {
		expect(callsignPosition(' ind_gnd ')).toBe('GND');
	});
});

describe('hoursOnPositions', () => {
	it('adds up sessions on any of the positions and ignores the rest', () => {
		const sessions = [
			session('IND_GND', 2),
			session('IND_E_TWR', 1.5, 2),
			session('IND_APP', 10, 3),
			session('IND_DEL', 4, 4)
		];

		expect(hoursOnPositions(sessions, ['GND', 'TWR'])).toBeCloseTo(3.5);
	});

	it('counts an open session up to now', () => {
		const open = { callsign: 'IND_TWR', start: '2026-01-01T00:00:00Z', end: null };

		expect(hoursOnPositions([open], ['TWR'], new Date('2026-01-01T01:30:00Z'))).toBeCloseTo(1.5);
	});

	it('adds nothing for a session whose times make no sense', () => {
		const sessions = [
			{ callsign: 'IND_TWR', start: 'not a date', end: '2026-01-01T01:00:00Z' },
			{ callsign: 'IND_TWR', start: '2026-01-01T02:00:00Z', end: '2026-01-01T01:00:00Z' },
			session('IND_TWR', 1, 2)
		];

		expect(hoursOnPositions(sessions, ['TWR'])).toBeCloseTo(1);
	});
});

describe('checkConsolidation', () => {
	it('is met without any sessions when the course carries no requirement', () => {
		expect(checkConsolidation({ course: 'S-GC', sessions: null, requirements })).toEqual({
			status: 'met',
			course: 'S-GC',
			required: 0
		});
	});

	it('is met when there is no course to enroll in', () => {
		expect(checkConsolidation({ course: null, sessions: null, requirements })).toMatchObject({
			status: 'met'
		});
	});

	it('counts only hours on the positions the course asks for', () => {
		// Plenty of ground time does not consolidate for T-RC.
		expect(
			checkConsolidation({
				course: 'T-RC',
				sessions: [session('IND_GND', 80), session('IND_TWR', 4.5, 10)],
				requirements
			})
		).toEqual({ status: 'not-met', course: 'T-RC', required: 50, logged: 4.5 });
	});

	it('adds the positions together when a course lists more than one', () => {
		expect(
			checkConsolidation({
				course: 'A-LC',
				sessions: [session('IND_GND', 20), session('CMH_TWR', 10, 10)],
				requirements
			})
		).toEqual({ status: 'met', course: 'A-LC', required: 30 });
	});

	it('treats no matching sessions as no hours', () => {
		expect(checkConsolidation({ course: 'T-RC', sessions: [], requirements })).toMatchObject({
			status: 'not-met',
			logged: 0
		});
	});

	// A VATSIM outage must not let everyone through.
	it('fails closed when the sessions could not be fetched', () => {
		expect(checkConsolidation({ course: 'T-RC', sessions: null, requirements })).toEqual({
			status: 'unknown',
			course: 'T-RC',
			required: 50
		});
	});
});

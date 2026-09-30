import { describe, expect, it } from 'vitest';
import type { ActivityLogEntry } from '$lib/db/schema/activity-log';
import type { Certification } from '$lib/db/schema/certifications';
import type { TeacherQualification } from '$lib/db/schema/teachers';
import { buildTimeline, describeActivity } from './timeline';

const t = (iso: string) => new Date(iso);

function activity(overrides: Partial<ActivityLogEntry>): ActivityLogEntry {
	return {
		id: 'a',
		cid: '1',
		event: 'roster.joined',
		detail: null,
		actor: null,
		at: t('2026-01-01T00:00:00Z'),
		...overrides
	};
}

function qualification(overrides: Partial<TeacherQualification>): TeacherQualification {
	return {
		id: 'q',
		cid: '1',
		code: 'S-GC',
		level: 'teacher',
		basis: 'manual',
		note: null,
		startedAt: t('2026-02-01T00:00:00Z'),
		startedBy: '9',
		endedAt: null,
		endedBy: null,
		endedReason: null,
		...overrides
	};
}

describe('describeActivity', () => {
	it('shows before and after for edits', () => {
		expect(describeActivity('teacher.slots', { from: null, to: 3 })).toBe('not set → 3');
		expect(describeActivity('teacher.status', { from: 'active', to: 'loa' })).toBe('Active → LOA');
	});

	it('shows only the new availability, which can be long', () => {
		expect(describeActivity('teacher.availability', { from: 'old', to: 'Weekends' })).toBe(
			'Now: Weekends'
		);
	});

	it('names the role for role changes', () => {
		expect(describeActivity('teacher.role-added', { role: 'INS' })).toBe('INS');
	});

	it('has nothing to say without detail', () => {
		expect(describeActivity('roster.joined', null)).toBeNull();
	});
});

describe('buildTimeline', () => {
	it('merges every source, newest first', () => {
		const entries = buildTimeline({
			activity: [activity({ at: t('2026-01-01T00:00:00Z') })],
			qualifications: [qualification({ startedAt: t('2026-03-01T00:00:00Z') })],
			certifications: [
				{
					code: 'S-GC',
					kind: 'certification',
					grantedAt: t('2026-02-01T00:00:00Z'),
					grantedBy: null,
					grantBasis: 'auto-arrival',
					grantNote: 'S1 on arrival',
					needsReview: false,
					revokedAt: null,
					revokedBy: null,
					revokedReason: null
				} as Certification
			]
		});

		expect(entries.map((entry) => entry.kind)).toEqual([
			'qualification',
			'certification',
			'roster'
		]);
		expect(entries[1].detail).toBe('Granted on arrival · S1 on arrival');
	});

	// A level change is an end and a start at the same instant: one entry.
	it('shows a level change once', () => {
		const changedAt = t('2026-04-01T00:00:00Z');
		const entries = buildTimeline({
			activity: [],
			qualifications: [
				qualification({ id: '1', level: 'teacher', endedAt: changedAt, endedReason: 'Changed' }),
				qualification({ id: '2', level: 'evaluator', startedAt: changedAt })
			],
			certifications: []
		});

		expect(entries.map((entry) => entry.title)).toEqual([
			'Qualified: Teacher and Evaluator',
			'Qualified: Teacher'
		]);
	});

	it('shows an ending on its own as a return to No Qual, with the reason', () => {
		const entries = buildTimeline({
			activity: [],
			qualifications: [
				qualification({
					endedAt: t('2026-09-01T00:00:00Z'),
					endedReason: 'Off the teacher roster for more than 6 months'
				})
			],
			certifications: []
		});

		expect(entries[0]).toMatchObject({
			title: 'Qualification ended: back to No Qual',
			detail: 'Off the teacher roster for more than 6 months',
			tag: 'S-GC',
			actor: null
		});
	});

	it('flags a certification that still needs review', () => {
		const [entry] = buildTimeline({
			activity: [],
			qualifications: [],
			certifications: [
				{
					code: 'E-RC',
					kind: 'certification',
					grantedAt: t('2026-02-01T00:00:00Z'),
					grantBasis: 'auto-arrival',
					needsReview: true,
					revokedAt: null
				} as Certification
			]
		});
		expect(entry.flag).toBe('Needs review');
	});
});

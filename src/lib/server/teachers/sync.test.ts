import { describe, expect, it } from 'vitest';
import type { Teacher, TeacherQualification } from '$lib/db/schema/teachers';
import type { QualificationLevel, TeacherRole } from '$lib/teachers';
import { planTeacherRoster, type RosterFacts } from './sync';

const NOW = new Date('2026-09-30T12:00:00Z');
const S2 = 3;
const S3 = 4;
const I1 = 8;

function teacher(cid: string, roles: TeacherRole[], overrides: Partial<Teacher> = {}): Teacher {
	return {
		cid,
		roles,
		status: 'active',
		initials: null,
		availability: null,
		studentSlots: null,
		joinedAt: new Date('2026-01-01T00:00:00Z'),
		removedAt: null,
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		updatedBy: null,
		...overrides
	};
}

function qual(cid: string, code: string, level: QualificationLevel): TeacherQualification {
	return {
		id: `${cid}-${code}`,
		cid,
		code: code as TeacherQualification['code'],
		level,
		basis: 'manual',
		note: null,
		startedAt: new Date('2026-01-01T00:00:00Z'),
		startedBy: '1',
		endedAt: null,
		endedBy: null,
		endedReason: null
	};
}

function plan(input: {
	roster: RosterFacts[];
	teachers?: Teacher[];
	current?: TeacherQualification[];
}) {
	return planTeacherRoster({
		roster: input.roster,
		teachers: input.teachers ?? [],
		current: input.current ?? [],
		now: NOW
	});
}

describe('planTeacherRoster — membership', () => {
	it('adds someone newly holding a teaching role', () => {
		const result = plan({ roster: [{ cid: '1', rating: S3, roles: ['MTR'] }] });
		expect(result.teachers).toEqual([{ cid: '1', roles: ['MTR'], removedAt: null, isNew: true }]);
		expect(result.events.map((e) => e.event)).toEqual(['teacher.joined']);
	});

	it('ignores roster members without a teaching role', () => {
		const result = plan({ roster: [{ cid: '1', rating: S3, roles: [] }] });
		expect(result.teachers).toEqual([]);
		expect(result.events).toEqual([]);
	});

	it('does nothing for a teacher whose roles are unchanged', () => {
		const result = plan({
			roster: [{ cid: '1', rating: S3, roles: ['MTR'] }],
			teachers: [teacher('1', ['MTR'])]
		});
		expect(result.teachers).toEqual([]);
		expect(result.events).toEqual([]);
	});

	it('records a promotion from mentor to instructor', () => {
		const result = plan({
			roster: [{ cid: '1', rating: I1, roles: ['INS'] }],
			teachers: [teacher('1', ['MTR'])]
		});
		expect(result.teachers).toEqual([{ cid: '1', roles: ['INS'], removedAt: null, isNew: false }]);
		expect(result.events.map((e) => [e.event, e.detail?.role])).toEqual([
			['teacher.role-added', 'INS'],
			['teacher.role-removed', 'MTR']
		]);
	});

	it('soft-removes someone who no longer holds a teaching role', () => {
		const result = plan({
			roster: [{ cid: '1', rating: S3, roles: [] }],
			teachers: [teacher('1', ['MTR'])]
		});
		expect(result.teachers).toEqual([{ cid: '1', roles: [], removedAt: NOW, isNew: false }]);
		expect(result.events.map((e) => e.event)).toEqual(['teacher.left', 'teacher.role-removed']);
	});

	// Leaving the ZID roster entirely looks the same: they are not in `roster`.
	it('soft-removes someone who left the facility', () => {
		const result = plan({ roster: [], teachers: [teacher('1', ['MTR'])] });
		expect(result.summary.left).toBe(1);
	});

	it('restores a returning teacher', () => {
		const result = plan({
			roster: [{ cid: '1', rating: S3, roles: ['MTR'] }],
			teachers: [teacher('1', [], { removedAt: new Date('2026-08-01T00:00:00Z') })]
		});
		expect(result.teachers).toEqual([{ cid: '1', roles: ['MTR'], removedAt: null, isNew: false }]);
		expect(result.events.map((e) => e.event)).toEqual(['teacher.returned', 'teacher.role-added']);
	});

	it('leaves an already-removed teacher alone', () => {
		const result = plan({
			roster: [],
			teachers: [teacher('1', [], { removedAt: new Date('2026-08-01T00:00:00Z') })]
		});
		expect(result.teachers).toEqual([]);
		expect(result.events).toEqual([]);
	});
});

/** Every level an instructor holds automatically, as the sync leaves it. */
const ALL_AUTOMATIC: [string, 'evaluator' | 'teacher'][] = [
	['S-GC', 'evaluator'],
	['A-GC', 'teacher'],
	['A-LC', 'evaluator'],
	['T-RC', 'evaluator'],
	['E-RC', 'evaluator'],
	['S-LC', 'teacher'],
	['T2-CTR', 'teacher']
];

describe('planTeacherRoster — automatic levels', () => {
	it('makes an instructor evaluator on the four evaluated courses, and teacher on the rest', () => {
		const result = plan({
			roster: [{ cid: '1', rating: I1, roles: ['INS'] }],
			teachers: [teacher('1', ['INS'])]
		});
		expect(result.qualifications.map((q) => [q.code, q.startLevel, q.endId])).toEqual([
			['S-GC', 'evaluator', null],
			['A-GC', 'teacher', null],
			['A-LC', 'evaluator', null],
			['T-RC', 'evaluator', null],
			['E-RC', 'evaluator', null],
			['S-LC', 'teacher', null],
			['T2-CTR', 'teacher', null]
		]);
		expect(result.qualifications[1].note).toBe('Instructor (ZID:INS): teaches automatically');
		expect(result.summary.automatic).toBe(7);
	});

	it('raises an instructor held at a lower level, ending that row', () => {
		const result = plan({
			roster: [{ cid: '1', rating: I1, roles: ['INS'] }],
			teachers: [teacher('1', ['INS'])],
			current: [
				...ALL_AUTOMATIC.map(([code, level]) => qual('1', code, level)).filter(
					(row) => row.code !== 'T-RC'
				),
				qual('1', 'T-RC', 'teacher')
			]
		});
		expect(result.qualifications).toHaveLength(1);
		expect(result.qualifications[0]).toMatchObject({
			code: 'T-RC',
			endId: '1-T-RC',
			startLevel: 'evaluator'
		});
	});

	it('is idempotent once applied', () => {
		const result = plan({
			roster: [{ cid: '1', rating: I1, roles: ['INS'] }],
			teachers: [teacher('1', ['INS'])],
			current: ALL_AUTOMATIC.map(([code, level]) => qual('1', code, level))
		});
		expect(result.qualifications).toEqual([]);
	});

	// DEV-118: instructors teach every course, not only the evaluated ones.
	it('raises an instructor held at Training, or nothing, on a course without an evaluation', () => {
		const result = plan({
			roster: [{ cid: '1', rating: I1, roles: ['INS'] }],
			teachers: [teacher('1', ['INS'])],
			current: [
				...ALL_AUTOMATIC.map(([code, level]) => qual('1', code, level)).filter(
					(row) => row.code !== 'A-GC' && row.code !== 'S-LC'
				),
				qual('1', 'A-GC', 'training')
			]
		});
		expect(result.qualifications.map((q) => [q.code, q.startLevel, q.endId])).toEqual([
			['A-GC', 'teacher', '1-A-GC'],
			['S-LC', 'teacher', null]
		]);
	});
});

describe('planTeacherRoster — downgrades', () => {
	it("drops a former instructor to teacher everywhere but an S3+ mentor's S-GC", () => {
		const result = plan({
			roster: [{ cid: '1', rating: S3, roles: ['MTR'] }],
			teachers: [teacher('1', ['INS'])],
			current: ['S-GC', 'A-LC', 'T-RC', 'E-RC'].map((code) => qual('1', code, 'evaluator'))
		});
		expect(result.qualifications.map((q) => [q.code, q.startLevel])).toEqual([
			['A-LC', 'teacher'],
			['T-RC', 'teacher'],
			['E-RC', 'teacher']
		]);
		expect(result.qualifications[0].reason).toBe('Only instructors evaluate A-LC');
	});

	it('drops an S-GC evaluator whose rating is below S3', () => {
		const result = plan({
			roster: [{ cid: '1', rating: S2, roles: ['MTR'] }],
			teachers: [teacher('1', ['MTR'])],
			current: [qual('1', 'S-GC', 'evaluator')]
		});
		expect(result.qualifications).toEqual([
			expect.objectContaining({
				code: 'S-GC',
				startLevel: 'teacher',
				reason: 'Mentors must be rated S3 or higher to evaluate S-GC'
			})
		]);
	});

	it('does not touch a teacher who is away', () => {
		const result = plan({
			roster: [],
			teachers: [teacher('1', [], { removedAt: new Date('2026-08-01T00:00:00Z') })],
			current: [qual('1', 'E-RC', 'evaluator')]
		});
		expect(result.qualifications).toEqual([]);
	});
});

describe('planTeacherRoster — six months away', () => {
	const current = [qual('1', 'S-GC', 'evaluator'), qual('1', 'S-LC', 'teacher')];

	it('keeps qualifications for someone away less than six months', () => {
		const result = plan({
			roster: [],
			teachers: [teacher('1', [], { removedAt: new Date('2026-05-01T00:00:00Z') })],
			current
		});
		expect(result.qualifications).toEqual([]);
	});

	it('ends every qualification after more than six months away', () => {
		const result = plan({
			roster: [],
			teachers: [teacher('1', [], { removedAt: new Date('2026-03-01T00:00:00Z') })],
			current
		});
		expect(result.qualifications.map((q) => [q.code, q.startLevel])).toEqual([
			['S-GC', null],
			['S-LC', null]
		]);
		expect(result.summary.expired).toBe(2);
	});

	it('never expires someone who left in this same run', () => {
		const result = plan({ roster: [], teachers: [teacher('1', ['MTR'])], current });
		expect(result.qualifications).toEqual([]);
	});

	// The whole point of the six months: come back in time and nothing is lost.
	it('keeps everything for someone who returns within six months', () => {
		const result = plan({
			roster: [{ cid: '1', rating: S3, roles: ['MTR'] }],
			teachers: [teacher('1', [], { removedAt: new Date('2026-05-01T00:00:00Z') })],
			current
		});
		expect(result.qualifications).toEqual([]);
		expect(result.summary.returned).toBe(1);
	});
});

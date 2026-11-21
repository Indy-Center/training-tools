import { beforeEach, describe, expect, it } from 'vitest';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { certificationsTable } from '$lib/db/schema/certifications';
import { teachersTable } from '$lib/db/schema/teachers';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { FACILITY_ID } from '$lib/config';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { readGroups } from './groups';

// Made-up people; nothing here is a real controller.
const JOINED = new Date('2026-01-01T00:00:00Z');

const person = (cid: string, first: string, last: string, nameprivacy = false) => ({
	cid,
	firstName: first,
	lastName: last,
	rating: 4,
	ratingShort: 'S3',
	membership: 'home' as const,
	facility: FACILITY_ID,
	data: { flag_nameprivacy: nameprivacy, roles: [] } as never
});

let ids = 0;
const credential = (cid: string, code: 'S-GC' | 'A-GC' | 'S-LC', extra = {}) => ({
	id: `c${++ids}`,
	cid,
	code,
	kind: code === 'S-LC' ? ('endorsement' as const) : ('certification' as const),
	grantBasis: 'manual' as const,
	...extra
});

const enrollment = (
	cid: string,
	status: 'in-training' | 'rating-exam' | 'needs-catp' | 'waitlist',
	teacher: string
) => ({
	id: `e${++ids}`,
	cid,
	course: 'S-GC' as const,
	status,
	submittedName: 'Student',
	teacher
});

/** A stand-in for identity's two by-CID calls; only Joanna has signed in. */
const env = {
	IDENTITY: {
		getUserByCid: async (cid: string) =>
			cid === '1000100' ? { id: 'u1', cid, attributes: { preferredName: 'Jo Rivera' } } : null,
		setAttributes: async () => ({})
	}
} as unknown as Partial<Env>;

describe('readGroups', () => {
	let db: Database;

	beforeEach(async () => {
		db = testDb();
		// Migration 0010 seeds the real teacher roster; start from ours instead.
		await db.delete(teachersTable);

		await db
			.insert(rosterMembersTable)
			.values([
				person('1000100', 'Joanna', 'Rivera'),
				person('1000101', 'Sam', 'Wu'),
				person('1000201', 'Ann', 'Lee'),
				person('1000202', 'Ben', 'Ode'),
				{ ...person('1000203', 'Cy', 'Gone'), removedAt: new Date('2026-10-01T00:00:00Z') }
			]);
		await db
			.insert(certificationsTable)
			.values([
				credential('1000201', 'A-GC'),
				credential('1000202', 'S-GC', { needsReview: true }),
				credential('1000202', 'S-LC', { revokedAt: new Date('2026-10-01T00:00:00Z') }),
				credential('1000203', 'A-GC')
			]);
		await db.insert(teachersTable).values([
			{ cid: '1000100', roles: ['MTR'], initials: 'JR', joinedAt: JOINED, updatedAt: JOINED },
			{
				cid: '1000101',
				roles: ['INS'],
				initials: 'SW',
				status: 'loa',
				joinedAt: JOINED,
				updatedAt: JOINED
			},
			{
				cid: '1000102',
				roles: ['MTR'],
				initials: 'XX',
				joinedAt: JOINED,
				updatedAt: JOINED,
				removedAt: new Date('2026-11-01T00:00:00Z')
			}
		]);
		await db
			.insert(enrollmentsTable)
			.values([
				enrollment('1000201', 'in-training', 'JR'),
				enrollment('1000202', 'waitlist', 'JR'),
				enrollment('1000203', 'rating-exam', 'SW'),
				enrollment('1000204', 'needs-catp', 'SW')
			]);
	});

	it('serves credential holders top down; removed members and revoked credentials count for nothing', async () => {
		const { groups } = await readGroups(db, env);
		const members = (key: string) => groups.find((group) => group.key === key)?.members;

		expect(members('credential:S-GC')).toEqual(['1000201', '1000202']);
		expect(members('credential:A-GC')).toEqual(['1000201']);
		expect(members('credential:S-LC')).toEqual([]);
	});

	it('serves each teacher on the roster with their assigned students and a room', async () => {
		const { groups } = await readGroups(db, env);

		expect(groups.filter((group) => group.key.startsWith('teacher:'))).toEqual([
			{
				key: 'teacher:1000100',
				name: 'JR',
				members: ['1000100', '1000201'],
				room: { name: 'Jo Rivera', fallbackName: 'Jo 1000100' }
			},
			{
				key: 'teacher:1000101',
				name: 'SW',
				members: ['1000101', '1000203', '1000204'],
				room: { name: 'Sam Wu', fallbackName: 'Sam 1000101' }
			}
		]);
	});

	it('holds the group of a teacher whose identity lookup failed, and only theirs', async () => {
		const down = {
			IDENTITY: {
				getUserByCid: async (cid: string) => {
					if (cid === '1000100') throw new Error('identity unavailable');
					return null;
				},
				setAttributes: async () => ({})
			}
		} as unknown as Partial<Env>;
		const { groups } = await readGroups(db, down);
		const teacher = (cid: string) => groups.find((group) => group.key === `teacher:${cid}`);

		expect(teacher('1000100')).toMatchObject({ members: ['1000100', '1000201'], hold: true });
		expect(teacher('1000101')).not.toHaveProperty('hold');
	});
});

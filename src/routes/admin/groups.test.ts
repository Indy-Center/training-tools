import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '$lib/utils/permissions';
import { testDb } from '$lib/server/test-db';
import type { Database } from '$lib/server/db';
import { certificationsTable } from '$lib/db/schema/certifications';
import { enrollmentsTable } from '$lib/db/schema/enrollments';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { teachersTable } from '$lib/db/schema/teachers';
import { FACILITY_ID } from '$lib/config';
import type { PanelGroup } from '$lib/groups';
import { load } from './+page.server';

// Made-up people; nothing here is a real controller.
const person = (cid: string, first: string, last: string) => ({
	cid,
	firstName: first,
	lastName: last,
	rating: 4,
	ratingShort: 'S3',
	membership: 'home' as const,
	facility: FACILITY_ID,
	data: { flag_nameprivacy: false, roles: [] } as never
});

const admin = {
	session: {
		user: { cid: '9990001', attributes: {}, vatsimData: { personal: {} } },
		roles: [Role.ADMIN]
	}
};

describe('/admin groups', () => {
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
				{ ...person('1000102', '', ''), firstName: '', lastName: '' }
			]);
		await db.insert(certificationsTable).values({
			id: 'c1',
			cid: '1000201',
			code: 'A-GC',
			kind: 'certification',
			grantBasis: 'manual'
		});
		await db.insert(teachersTable).values([
			{ cid: '1000100', roles: ['MTR'], initials: 'JR' },
			{ cid: '1000101', roles: ['MTR'], initials: null },
			{ cid: '1000102', roles: ['MTR'], initials: 'NN' }
		]);
		await db.insert(enrollmentsTable).values({
			id: 'e1',
			cid: '1000201',
			course: 'A-LC',
			status: 'in-training',
			submittedName: 'Ann Lee',
			teacher: 'JR'
		});
	});

	async function groups() {
		const event = {
			locals: { ...admin, db },
			platform: { env: {} }
		} as unknown as Parameters<typeof load>[0];
		const data = (await load(event)) as { groups: PanelGroup[] };
		return data.groups;
	}

	it('lists each group with its members by name, and how many', async () => {
		const panel = await groups();

		expect(panel.find((group) => group.key === 'credential:A-GC')).toEqual({
			key: 'credential:A-GC',
			name: 'A-GC',
			room: null,
			members: ['Ann Lee'],
			held: null
		});
		// Top down: holding A-GC puts her in S-GC too.
		expect(panel.find((group) => group.key === 'credential:S-GC')?.members).toEqual(['Ann Lee']);
		expect(panel.find((group) => group.key === 'teacher:1000100')).toEqual({
			key: 'teacher:1000100',
			name: 'JR',
			room: 'Joanna Rivera',
			members: ['Joanna Rivera', 'Ann Lee'],
			held: null
		});
	});

	it('shows held groups with why', async () => {
		const panel = await groups();

		expect(panel.find((group) => group.key === 'teacher:1000101')?.held).toBe('no-initials');
		expect(panel.find((group) => group.key === 'teacher:1000102')?.held).toBe('no-name');
	});
});

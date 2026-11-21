import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { FACILITY_ID } from '$lib/config';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import {
	getHeldCredentials,
	grantArrivalCertifications,
	setCertification,
	toggleEndorsement
} from './index';

// Made-up people; nothing here is a real controller.
const CID = '1000201';
const STAFF = '1000900';

/** A stand-in for larry that records every `syncMembers()` call. */
function fakeLarry(fail = false) {
	const calls: number[][] = [];
	const env = {
		LARRY: {
			syncMembers: async (cids: number[]) => {
				calls.push(cids);
				if (fail) throw new Error('larry is down');
				return cids.map((cid) => ({ cid, queued: true }));
			}
		}
	} as unknown as Partial<Env>;
	return { env, calls };
}

const codes = async (db: Database) => (await getHeldCredentials(db, CID)).map((row) => row.code);

describe('a credential change tells larry', () => {
	let db: Database;

	beforeEach(() => {
		db = testDb();
	});

	it('once for a change of certification, after every write', async () => {
		const larry = fakeLarry();
		await setCertification(db, larry.env, CID, 'S-GC', STAFF);
		await toggleEndorsement(db, larry.env, CID, 'S-LC', STAFF);
		larry.calls.length = 0;

		// Revokes S-GC and S-LC, grants A-GC: three writes, one call.
		await setCertification(db, larry.env, CID, 'A-GC', STAFF);

		expect(larry.calls).toEqual([[Number(CID)]]);
	});

	it('for an endorsement granted or removed', async () => {
		const larry = fakeLarry();
		await setCertification(db, larry.env, CID, 'S-GC', STAFF);
		larry.calls.length = 0;

		await toggleEndorsement(db, larry.env, CID, 'S-LC', STAFF);
		await toggleEndorsement(db, larry.env, CID, 'S-LC', STAFF);

		expect(larry.calls).toEqual([[Number(CID)], [Number(CID)]]);
	});

	it('not when nothing changed', async () => {
		const larry = fakeLarry();
		await setCertification(db, larry.env, CID, 'S-GC', STAFF);
		larry.calls.length = 0;

		await setCertification(db, larry.env, CID, 'S-GC', STAFF);
		// T2-CTR needs E-RC, so it is refused.
		await toggleEndorsement(db, larry.env, CID, 'T2-CTR', STAFF);

		expect(larry.calls).toEqual([]);
	});

	it('and a failed call does not fail the write', async () => {
		const larry = fakeLarry(true);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await setCertification(db, larry.env, CID, 'S-GC', STAFF);

		expect(larry.calls).toHaveLength(1);
		expect(await codes(db)).toEqual(['S-GC']);
	});

	describe('for arrivals', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('in one call for everyone granted this run', async () => {
			await db.insert(rosterMembersTable).values(
				['1000301', '1000302'].map((cid) => ({
					cid,
					firstName: 'New',
					lastName: 'Arrival',
					rating: 3,
					ratingShort: 'S2',
					membership: 'home' as const,
					facility: FACILITY_ID,
					data: { flag_nameprivacy: false, roles: [] } as never
				}))
			);
			// Both controlled last week, so both are granted their rating's certification.
			const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ items: [{ connection_id: { end: lastWeek } }] }))
			);
			const larry = fakeLarry();

			const result = await grantArrivalCertifications(db, larry.env);

			expect(result.granted).toBe(2);
			expect(larry.calls).toEqual([[1000301, 1000302]]);
		});
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNull } from 'drizzle-orm';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import type { Database } from '$lib/server/db';
import { testDb } from '$lib/server/test-db';
import { rosterMembersTable } from '$lib/db/schema/roster';
import { activityLogTable } from '$lib/db/schema/activity-log';
import { fetchRoster } from '$lib/server/vatusa';
import { parseFacilityJoin, syncRoster, toRosterRow } from './sync';

vi.mock('$lib/server/vatusa', () => ({ fetchRoster: vi.fn() }));

const NOW = new Date('2026-09-20T12:00:00Z');

function member(overrides: Partial<VatusaRosterMember> = {}): VatusaRosterMember {
	return {
		cid: 1617100,
		fname: 'Jo',
		lname: 'Rivera',
		email: null,
		facility: 'ZID',
		rating: 2,
		rating_short: 'S1',
		membership: 'home',
		created_at: '2025-01-01',
		updated_at: '2026-09-01',
		facility_join: '2025-02-01',
		lastactivity: '2026-09-19',
		flag_homecontroller: true,
		flag_needbasic: false,
		flag_xferOverride: false,
		flag_nameprivacy: false,
		discord_id: '123456789',
		last_promotion: null,
		last_competency_date: null,
		promotion_eligible: false,
		transfer_eligible: null,
		isMentor: false,
		isSupIns: false,
		roles: [],
		...overrides
	} as VatusaRosterMember;
}

describe('toRosterRow', () => {
	it('maps a home controller', () => {
		const row = toRosterRow(member(), NOW);
		expect(row.cid).toBe('1617100');
		expect(row.membership).toBe('home');
		expect(row.ratingShort).toBe('S1');
		expect(row.isHomeController).toBe(true);
		expect(row.discordId).toBe('123456789');
		expect(row.removedAt).toBeNull();
	});

	// CIDs arrive as numbers from VATUSA but are text keys here, and identity
	// hands us `user.cid` as a string. A mismatch would silently make every
	// controller look unrostered.
	it('stores the CID as a string', () => {
		expect(typeof toRosterRow(member(), NOW).cid).toBe('string');
	});

	it('maps a visiting controller', () => {
		const row = toRosterRow(member({ membership: 'visit', flag_homecontroller: false }), NOW);
		expect(row.membership).toBe('visit');
		expect(row.isHomeController).toBe(false);
	});

	it('treats an unexpected membership value as visiting', () => {
		expect(toRosterRow(member({ membership: 'something-new' }), NOW).membership).toBe('visit');
	});

	it('nulls a missing discord id rather than storing "null"', () => {
		expect(toRosterRow(member({ discord_id: null }), NOW).discordId).toBeNull();
		expect(toRosterRow(member({ discord_id: '0' }), NOW).discordId).toBeNull();
		expect(toRosterRow(member({ discord_id: '' }), NOW).discordId).toBeNull();
	});

	// The email column is filled from identity at sign-in. If the sync row ever
	// carried one, the upsert would start overwriting it with VATUSA's null.
	it('never sets an email, so the sync cannot clobber the one from identity', () => {
		const row = toRosterRow(member({ email: 'someone@example.com' }), NOW);
		expect(row).not.toHaveProperty('email');
	});

	it('always clears removedAt, which is what restores a returning member', () => {
		expect(toRosterRow(member(), NOW).removedAt).toBeNull();
	});

	it('keeps the raw payload for fields we have not modelled', () => {
		const row = toRosterRow(member({ isMentor: true }), NOW);
		expect(row.data.isMentor).toBe(true);
	});

	it('survives missing optional strings', () => {
		const row = toRosterRow(
			member({ facility_join: undefined, lastactivity: undefined }) as VatusaRosterMember,
			NOW
		);
		expect(row.facilityJoinedAt).toBeNull();
		expect(row.lastActivityAt).toBeNull();
	});
});

describe('parseFacilityJoin', () => {
	it("reads VATUSA's timestamp", () => {
		expect(parseFacilityJoin('2025-02-01T10:00:00+00:00')?.toISOString()).toBe(
			'2025-02-01T10:00:00.000Z'
		);
	});

	it('returns null for missing or unparseable values, so the sync time is used', () => {
		expect(parseFacilityJoin(null)).toBeNull();
		expect(parseFacilityJoin('')).toBeNull();
		expect(parseFacilityJoin('not a date')).toBeNull();
	});
});

describe('syncRoster — removals', () => {
	const HOUR = 60 * 60 * 1000;
	const START = new Date('2026-10-26T03:30:00Z');
	const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

	let db: Database;

	/** CIDs 1000001…, as VATUSA members. */
	const cids = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => 1000000 + from + i);

	function vatusaAnswers(list: number[]) {
		vi.mocked(fetchRoster).mockResolvedValueOnce(list.map((cid) => member({ cid })));
	}

	async function active(): Promise<number[]> {
		const rows = await db
			.select({ cid: rosterMembersTable.cid })
			.from(rosterMembersTable)
			.where(isNull(rosterMembersTable.removedAt));
		return rows.map((row) => Number(row.cid)).sort((a, b) => a - b);
	}

	async function events(event: string): Promise<number[]> {
		const rows = await db.select().from(activityLogTable);
		return rows
			.filter((row) => row.event === event)
			.map((row) => Number(row.cid))
			.sort((a, b) => a - b);
	}

	// 160 members: the limit is 8, since 5% of 160 is larger than 5.
	beforeEach(async () => {
		vi.mocked(fetchRoster).mockReset();
		db = testDb();
		vatusaAnswers(cids(1, 160));
		await syncRoster(db, at(-1));
	});

	it('removes leavers as normal when there are no more than the limit', async () => {
		vatusaAnswers(cids(1, 152));
		const result = await syncRoster(db, at(0));
		expect(result.removed).toBe(8);
		expect(await active()).toEqual(cids(1, 152));
		expect(await events('roster.left')).toEqual(cids(153, 160));
	});

	it('removes nobody over the limit, but still adds those present, and throws', async () => {
		const arrival = 1009999;
		vatusaAnswers([...cids(1, 151), arrival]);
		await expect(syncRoster(db, at(0))).rejects.toThrow(
			'VATUSA roster would remove 9 of 160 members (limit 8); keeping the mirror. ' +
				'Applies to whoever is still missing at 2026-10-27 03:30 UTC.'
		);
		expect(await active()).toEqual([...cids(1, 160), arrival]);
		expect(await events('roster.left')).toEqual([]);
		expect(await events('roster.joined')).toContain(arrival);
	});

	it('still holds at 23h59, keeping the time the hold started', async () => {
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(0))).rejects.toThrow();
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(23 + 59 / 60))).rejects.toThrow(
			'VATUSA roster would remove 10 of 160 members (limit 8); keeping the mirror. ' +
				'Applies to whoever is still missing at 2026-10-27 03:30 UTC.'
		);
		expect(await active()).toEqual(cids(1, 160));
	});

	it('removes everyone still missing once 24 hours have passed, and clears the hold', async () => {
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(0))).rejects.toThrow();
		vatusaAnswers(cids(1, 150));
		const result = await syncRoster(db, at(24));
		expect(result.removed).toBe(10);
		expect(await active()).toEqual(cids(1, 150));
		expect(await events('roster.left')).toEqual(cids(151, 160));

		// Cleared: the next large drop starts a hold of its own.
		vatusaAnswers(cids(1, 140));
		await expect(syncRoster(db, at(25))).rejects.toThrow('missing at 2026-10-28 04:30 UTC');
	});

	it('lets returners leave the hold and the newly missing join it', async () => {
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(0))).rejects.toThrow();

		// 151–155 come back; 141–145 go missing.
		const answer = [...cids(1, 140), ...cids(146, 155)];
		vatusaAnswers(answer);
		await expect(syncRoster(db, at(12))).rejects.toThrow(
			'would remove 10 of 160 members (limit 8); keeping the mirror. ' +
				'Applies to whoever is still missing at 2026-10-27 03:30 UTC.'
		);

		vatusaAnswers(answer);
		await syncRoster(db, at(24));
		expect(await events('roster.left')).toEqual([...cids(141, 145), ...cids(156, 160)]);
	});

	it('clears a hold that shrinks to the limit, and syncs as normal', async () => {
		vatusaAnswers(cids(1, 150));
		await expect(syncRoster(db, at(0))).rejects.toThrow();

		vatusaAnswers(cids(1, 152));
		const result = await syncRoster(db, at(1));
		expect(result.removed).toBe(8);
		expect(await active()).toEqual(cids(1, 152));

		// Cleared: the next large drop starts a hold of its own.
		vatusaAnswers(cids(1, 140));
		await expect(syncRoster(db, at(2))).rejects.toThrow('missing at 2026-10-27 05:30 UTC');
	});
});

describe('syncRoster — leftHomeAt', () => {
	const DAY = 24 * 60 * 60 * 1000;
	const day = (n: number) => new Date(NOW.getTime() + n * DAY);
	const FILLER = [2000001, 2000002, 2000003];
	let db: Database;

	function vatusaAnswers(list: VatusaRosterMember[]) {
		vi.mocked(fetchRoster).mockResolvedValueOnce([
			...FILLER.map((cid) => member({ cid })),
			...list
		]);
	}

	async function leftHomeAt(cid = 3000001): Promise<Date | null> {
		const rows = await db.select().from(rosterMembersTable);
		return rows.find((row) => row.cid === String(cid))!.leftHomeAt;
	}

	beforeEach(async () => {
		vi.mocked(fetchRoster).mockReset();
		db = testDb();
	});

	it('is stamped when a home member goes absent', async () => {
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(0));
		expect(await leftHomeAt()).toBeNull();
		vatusaAnswers([]);
		await syncRoster(db, day(1));
		expect(await leftHomeAt()).toEqual(day(1));
	});

	it('is stamped when a home member becomes a visitor', async () => {
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(0));
		vatusaAnswers([member({ cid: 3000001, membership: 'visit' })]);
		await syncRoster(db, day(1));
		expect(await leftHomeAt()).toEqual(day(1));
	});

	it('stays null when a visitor who was never home goes absent', async () => {
		vatusaAnswers([member({ cid: 3000001, membership: 'visit' })]);
		await syncRoster(db, day(0));
		vatusaAnswers([]);
		await syncRoster(db, day(1));
		expect(await leftHomeAt()).toBeNull();
	});

	it('is cleared when the member is back as home', async () => {
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(0));
		vatusaAnswers([]);
		await syncRoster(db, day(1));
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(2));
		expect(await leftHomeAt()).toBeNull();
	});

	it('keeps the first date while the member stays away', async () => {
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(0));
		vatusaAnswers([]);
		await syncRoster(db, day(1));
		vatusaAnswers([]);
		await syncRoster(db, day(2));
		expect(await leftHomeAt()).toEqual(day(1));
	});

	it('keeps the date when the member is back only as a visitor, then vanishes', async () => {
		vatusaAnswers([member({ cid: 3000001 })]);
		await syncRoster(db, day(0));
		vatusaAnswers([member({ cid: 3000001, membership: 'visit' })]);
		await syncRoster(db, day(1));
		vatusaAnswers([member({ cid: 3000001, membership: 'visit' })]);
		await syncRoster(db, day(2));
		expect(await leftHomeAt()).toEqual(day(1));
		vatusaAnswers([]);
		await syncRoster(db, day(3));
		expect(await leftHomeAt()).toEqual(day(1));
	});

	it('is not stamped while the removal is held', async () => {
		const many = Array.from({ length: 20 }, (_, i) => member({ cid: 4000000 + i }));
		vatusaAnswers([member({ cid: 3000001 }), ...many]);
		await syncRoster(db, day(0));
		vi.mocked(fetchRoster).mockResolvedValueOnce([member({ cid: 2000001 })]);
		await expect(syncRoster(db, day(1))).rejects.toThrow();
		expect(await leftHomeAt()).toBeNull();

		vi.mocked(fetchRoster).mockResolvedValueOnce([member({ cid: 2000001 })]);
		await syncRoster(db, day(2));
		expect(await leftHomeAt()).toEqual(day(2));
	});
});

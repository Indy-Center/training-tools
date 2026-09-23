import { describe, expect, it } from 'vitest';
import type { VatusaRosterMember } from '$lib/types/vatusa';
import { toRosterRow } from './sync';

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

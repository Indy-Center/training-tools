import { describe, expect, it } from 'vitest';
import { buildRoster, type HeldRow, type MemberRow } from './read';

// Made-up members; nothing here is a real controller.
const member = (cid: string, overrides: Partial<MemberRow> = {}): MemberRow => ({
	cid,
	firstName: 'Jo',
	lastName: 'Rivera',
	ratingShort: 'S2',
	facilityJoinedAt: '2025-01-15T00:00:00+00:00',
	data: { flag_nameprivacy: false, roles: [] },
	...overrides
});

const held = (cid: string, code: string): HeldRow => ({ cid, code });

describe('buildRoster: members', () => {
	it('gives only the highest certification held', () => {
		const roster = buildRoster(
			[member('1000001')],
			[held('1000001', 'A-GC'), held('1000001', 'T-RC'), held('1000001', 'A-LC')]
		);
		expect(roster.members[0].certification).toBe('T-RC');
	});

	it('returns endorsements held, in catalogue order', () => {
		const roster = buildRoster(
			[member('1000001')],
			[held('1000001', 'T2-CTR'), held('1000001', 'E-RC'), held('1000001', 'S-LC')]
		);
		expect(roster.members[0]).toMatchObject({
			certification: 'E-RC',
			endorsements: ['S-LC', 'T2-CTR']
		});
	});

	it('includes a member with no credentials', () => {
		const roster = buildRoster([member('1000001')], [held('1000009', 'A-GC')]);
		expect(roster.members).toEqual([
			expect.objectContaining({ cid: '1000001', certification: null, endorsements: [] })
		]);
	});

	it('gives named fields, the name-privacy flag and the facility roles, not the VATUSA record', () => {
		const roster = buildRoster(
			[
				member('1000001', {
					firstName: 'Sam',
					lastName: 'Lee',
					ratingShort: 'C1',
					facilityJoinedAt: '2024-03-01T00:00:00+00:00',
					data: {
						flag_nameprivacy: true,
						roles: [
							{ facility: 'ZID', role: 'MTR' },
							{ facility: 'ZID', role: 'EC' },
							{ facility: 'ZAU', role: 'INS' }
						]
					}
				})
			],
			[]
		);
		expect(roster.members[0]).toEqual({
			cid: '1000001',
			firstName: 'Sam',
			lastName: 'Lee',
			namePrivacy: true,
			rating: 'C1',
			facilityJoinedAt: '2024-03-01T00:00:00+00:00',
			roles: ['MTR', 'EC'],
			certification: null,
			endorsements: []
		});
	});

	it('copes with a VATUSA record missing the flag or roles', () => {
		const roster = buildRoster([member('1000001', { data: {} })], []);
		expect(roster.members[0]).toMatchObject({ namePrivacy: false, roles: [] });
	});
});

describe('buildRoster: credentials', () => {
	it('lists every available credential, certifications by rank then endorsements', () => {
		const { credentials } = buildRoster([], []);
		expect(credentials.map((c) => c.code)).toEqual([
			'S-GC',
			'A-GC',
			'A-LC',
			'T-RC',
			'E-RC',
			'S-LC',
			'T2-CTR'
		]);
		expect(credentials.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('gives code, kind, name, order and description, and not what each requires', () => {
		const { credentials } = buildRoster([], []);
		expect(credentials[0]).toEqual({
			code: 'S-GC',
			kind: 'certification',
			name: 'Simple Ground Control',
			order: 1,
			description: 'Clearance delivery and ground control at our simpler fields.'
		});
		for (const credential of credentials) {
			expect(Object.keys(credential).sort()).toEqual([
				'code',
				'description',
				'kind',
				'name',
				'order'
			]);
		}
	});
});

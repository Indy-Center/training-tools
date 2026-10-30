import { describe, expect, it } from 'vitest';
import { CREDENTIALS } from './certifications';
import {
	compareCredentials,
	formatComparison,
	type SiteCredentialRow,
	type SiteUser,
	type TrainingCredentialRow
} from './credential-comparison';

// Made-up CIDs and site user ids; nothing here is a real member.
const users: SiteUser[] = [
	{ id: 'u1', cid: '1000001' },
	{ id: 'u2', cid: '1000002' },
	{ id: 'u3', cid: '1000003' },
	{ id: 'u4', cid: '1000004' },
	{ id: 'u5', cid: '' }
];

const cert = (userId: string, code: string): SiteCredentialRow => ({
	userId,
	code,
	table: 'user_certifications'
});
const endo = (userId: string, code: string): SiteCredentialRow => ({
	userId,
	code,
	table: 'user_endorsements'
});
const held = (cid: string, code: string): TrainingCredentialRow => ({
	cid,
	code,
	kind: CREDENTIALS.find((credential) => credential.code === code)!.kind
});

const compare = (site: SiteCredentialRow[], training: TrainingCredentialRow[]) =>
	compareCredentials({ users, site, training, catalogue: CREDENTIALS });

describe('compareCredentials', () => {
	it('reports nothing when both sides hold the same', () => {
		const result = compare(
			[cert('u1', 'E-RC'), endo('u1', 'T2-CTR'), endo('u1', 'S-LC')],
			[held('1000001', 'E-RC'), held('1000001', 'S-LC'), held('1000001', 'T2-CTR')]
		);
		expect(result.differences).toEqual([]);
		expect(result.unmapped).toEqual([]);
		expect(result.siteCids).toBe(1);
		expect(result.trainingCids).toBe(1);
	});

	it('reports a certification that differs', () => {
		const result = compare([cert('u1', 'T-RC')], [held('1000001', 'A-LC')]);
		expect(result.differences).toEqual([
			{
				cid: '1000001',
				site: { certification: 'T-RC', endorsements: [] },
				training: { certification: 'A-LC', endorsements: [] },
				certificationDiffers: true,
				onlyOnSite: [],
				onlyInTraining: []
			}
		]);
	});

	it('reports an endorsement held on one side only, either way round', () => {
		const result = compare(
			[cert('u1', 'E-RC'), endo('u1', 'T2-CTR'), cert('u2', 'A-GC')],
			[held('1000001', 'E-RC'), held('1000002', 'A-GC'), held('1000002', 'S-LC')]
		);
		expect(result.differences).toEqual([
			expect.objectContaining({
				cid: '1000001',
				certificationDiffers: false,
				onlyOnSite: ['T2-CTR'],
				onlyInTraining: []
			}),
			expect.objectContaining({
				cid: '1000002',
				certificationDiffers: false,
				onlyOnSite: [],
				onlyInTraining: ['S-LC']
			})
		]);
	});

	it('reports a CID held on only one side', () => {
		const result = compare([cert('u3', 'S-GC')], [held('1000004', 'A-GC')]);
		expect(result.differences).toEqual([
			expect.objectContaining({
				cid: '1000003',
				site: { certification: 'S-GC', endorsements: [] },
				training: { certification: null, endorsements: [] },
				certificationDiffers: true
			}),
			expect.objectContaining({
				cid: '1000004',
				site: { certification: null, endorsements: [] },
				training: { certification: 'A-GC', endorsements: [] },
				certificationDiffers: true
			})
		]);
	});

	// As the September import did: one certification per CID, the highest.
	it('keeps only the highest certification the site holds', () => {
		const result = compare([cert('u1', 'S-GC'), cert('u1', 'A-LC')], [held('1000001', 'A-LC')]);
		expect(result.differences).toEqual([]);
	});

	it('lists a code the training app does not have, such as a solo endorsement, and compares the rest', () => {
		const result = compare([cert('u1', 'T-RC'), endo('u1', 'APP-SOLO')], [held('1000001', 'T-RC')]);
		expect(result.differences).toEqual([]);
		expect(result.unmapped).toEqual([
			{
				userId: 'u1',
				cid: '1000001',
				code: 'APP-SOLO',
				table: 'user_endorsements',
				reason: 'unknown-code'
			}
		]);
	});

	it('lists a code filed under the wrong kind', () => {
		const result = compare([endo('u1', 'A-GC')], []);
		expect(result.unmapped).toEqual([
			expect.objectContaining({ code: 'A-GC', reason: 'wrong-kind' })
		]);
		expect(result.differences).toEqual([]);
	});

	it('lists rows for a site user with no CID, or no user at all', () => {
		const result = compare([cert('u5', 'A-GC'), endo('gone', 'S-LC')], []);
		expect(result.unmapped).toEqual([
			{ userId: 'u5', cid: null, code: 'A-GC', table: 'user_certifications', reason: 'no-cid' },
			{ userId: 'gone', cid: null, code: 'S-LC', table: 'user_endorsements', reason: 'no-user' }
		]);
		expect(result.differences).toEqual([]);
	});

	it('merges two site users with the same CID, and repeated rows', () => {
		const result = compareCredentials({
			users: [...users, { id: 'twin', cid: '1000001' }],
			site: [cert('u1', 'A-GC'), endo('u1', 'S-LC'), endo('u1', 'S-LC'), cert('twin', 'A-LC')],
			training: [held('1000001', 'A-LC'), held('1000001', 'S-LC')],
			catalogue: CREDENTIALS
		});
		expect(result.differences).toEqual([]);
		expect(result.siteCids).toBe(1);
	});

	it('sorts by CID as a number', () => {
		const result = compareCredentials({
			users: [
				{ id: 'a', cid: '999999' },
				{ id: 'b', cid: '1000000' }
			],
			site: [cert('b', 'S-GC'), cert('a', 'S-GC')],
			training: [],
			catalogue: CREDENTIALS
		});
		expect(result.differences.map((difference) => difference.cid)).toEqual(['999999', '1000000']);
	});
});

describe('formatComparison', () => {
	const sample = compare(
		[cert('u1', 'T-RC'), endo('u1', 'T2-CTR'), endo('u1', 'APP-SOLO'), cert('u5', 'S-GC')],
		[held('1000001', 'A-LC'), held('1000001', 'S-LC')]
	);
	const text = formatComparison(sample);

	it('shows each side and the difference for a CID', () => {
		expect(text).toContain('CID 1000001');
		expect(text).toMatch(/site:\s+T-RC, T2-CTR/);
		expect(text).toMatch(/training:\s+A-LC, S-LC/);
		expect(text).toMatch(/certification:\s+site T-RC, training A-LC/);
		expect(text).toMatch(/only on site:\s+T2-CTR/);
		expect(text).toMatch(/only in training:\s+S-LC/);
	});

	it('lists the rows it could not map, by site user id and CID', () => {
		expect(text).toMatch(/user u1 \(CID 1000001\): APP-SOLO in user_endorsements/);
		expect(text).toMatch(/user u5 \(no CID\): S-GC in user_certifications/);
	});

	it('says so when nothing differs', () => {
		expect(formatComparison(compare([], []))).toContain('No differences.');
	});
});

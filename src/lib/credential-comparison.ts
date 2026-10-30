/**
 * Compares the credentials community-website holds with the ones held here, so
 * the maintainer can see what the site changed after the September import
 * before it stops keeping its own copy (DEV-116, community-website decision
 * 0003). Run by `scripts/compare-credentials.ts`; pure, so it is tested on
 * made-up rows.
 *
 * The site's rows are mapped the way data migration
 * `0003_import_community_website_certifications.sql` did: site user to CID,
 * codes as they are, one certification per CID (the highest), endorsements
 * as-is. A row that mapping cannot place is listed, not guessed at.
 *
 * The catalogue is passed in rather than imported, and only types are imported,
 * so Node can run this file straight from TypeScript without a bundler.
 */
import type { Credential } from './certifications';

/** A site user, by its own id. Names and emails are never read. */
export type SiteUser = { id: string; cid: string | null };

export type SiteTable = 'user_certifications' | 'user_endorsements';

export type SiteCredentialRow = { userId: string; code: string; table: SiteTable };

/** A credential held here now: `revoked_at IS NULL`. */
export type TrainingCredentialRow = { cid: string; code: string; kind: string };

type CatalogueEntry = Pick<Credential, 'code' | 'kind' | 'rank'>;

export type Held = { certification: string | null; endorsements: string[] };

export type Difference = {
	cid: string;
	site: Held;
	training: Held;
	certificationDiffers: boolean;
	onlyOnSite: string[];
	onlyInTraining: string[];
};

export type UnmappedReason =
	/** Not a credential the training app has, such as APP-SOLO. */
	| 'unknown-code'
	/** A certification filed as an endorsement, or the other way round. */
	| 'wrong-kind'
	/** The site user has no CID. */
	| 'no-cid'
	/** The row's user is not in the site's users table. */
	| 'no-user';

export type Unmapped = {
	userId: string;
	cid: string | null;
	code: string;
	table: SiteTable;
	reason: UnmappedReason;
};

export type Comparison = {
	/** CIDs holding anything, on each side. */
	siteCids: number;
	trainingCids: number;
	differences: Difference[];
	unmapped: Unmapped[];
};

const TABLE_KIND: Record<SiteTable, Credential['kind']> = {
	user_certifications: 'certification',
	user_endorsements: 'endorsement'
};

export function compareCredentials({
	users,
	site,
	training,
	catalogue
}: {
	users: readonly SiteUser[];
	site: readonly SiteCredentialRow[];
	training: readonly TrainingCredentialRow[];
	catalogue: readonly CatalogueEntry[];
}): Comparison {
	const cidByUser = new Map(users.map((user) => [user.id, user.cid?.trim() || null]));
	const unmapped: Unmapped[] = [];
	const siteCodes = new Map<string, Set<string>>();

	for (const row of site) {
		const cid = cidByUser.get(row.userId) ?? null;
		const entry = catalogue.find((credential) => credential.code === row.code);
		const skip = (reason: UnmappedReason) => unmapped.push({ ...row, cid, reason });

		if (!cidByUser.has(row.userId)) skip('no-user');
		else if (!cid) skip('no-cid');
		else if (!entry) skip('unknown-code');
		else if (entry.kind !== TABLE_KIND[row.table]) skip('wrong-kind');
		else addCode(siteCodes, cid, row.code);
	}

	const trainingCodes = new Map<string, Set<string>>();
	for (const row of training) addCode(trainingCodes, row.cid, row.code);

	const cids = [...new Set([...siteCodes.keys(), ...trainingCodes.keys()])].sort(byNumber);
	const differences: Difference[] = [];
	for (const cid of cids) {
		const siteHeld = holding(siteCodes.get(cid), catalogue);
		const trainingHeld = holding(trainingCodes.get(cid), catalogue);
		const onlyOnSite = siteHeld.endorsements.filter(
			(code) => !trainingHeld.endorsements.includes(code)
		);
		const onlyInTraining = trainingHeld.endorsements.filter(
			(code) => !siteHeld.endorsements.includes(code)
		);
		const certificationDiffers = siteHeld.certification !== trainingHeld.certification;
		if (certificationDiffers || onlyOnSite.length > 0 || onlyInTraining.length > 0) {
			differences.push({
				cid,
				site: siteHeld,
				training: trainingHeld,
				certificationDiffers,
				onlyOnSite,
				onlyInTraining
			});
		}
	}

	return {
		siteCids: siteCodes.size,
		trainingCids: trainingCodes.size,
		differences,
		unmapped
	};
}

function addCode(codes: Map<string, Set<string>>, cid: string, code: string) {
	const set = codes.get(cid) ?? new Set<string>();
	set.add(code);
	codes.set(cid, set);
}

/** The highest certification and every endorsement, in catalogue order. */
function holding(codes: Set<string> | undefined, catalogue: readonly CatalogueEntry[]): Held {
	const entries = catalogue.filter((credential) => codes?.has(credential.code));
	const certification = entries
		.filter((credential) => credential.kind === 'certification')
		.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
	return {
		certification: certification?.code ?? null,
		endorsements: entries
			.filter((credential) => credential.kind === 'endorsement')
			.map((credential) => credential.code)
	};
}

function byNumber(a: string, b: string): number {
	return Number(a) - Number(b) || a.localeCompare(b);
}

const REASONS: Record<UnmappedReason, string> = {
	'unknown-code': 'not a credential the training app has',
	'wrong-kind': 'a credential of the other kind',
	'no-cid': 'site user has no CID',
	'no-user': 'no such site user'
};

/** Plain text for a person deciding each difference. CIDs and codes only. */
export function formatComparison(comparison: Comparison): string {
	const lines = [
		'Credentials held now: community-website (website-db) against the training app (training-db).',
		`Site: ${comparison.siteCids} CIDs. Training app: ${comparison.trainingCids} CIDs. Differ: ${comparison.differences.length}.`,
		''
	];

	if (comparison.differences.length === 0) lines.push('No differences.', '');

	for (const difference of comparison.differences) {
		lines.push(
			`CID ${difference.cid}`,
			`  site:              ${describe(difference.site)}`,
			`  training:          ${describe(difference.training)}`
		);
		if (difference.certificationDiffers) {
			lines.push(
				`  certification:     site ${difference.site.certification ?? 'none'}, training ${difference.training.certification ?? 'none'}`
			);
		}
		if (difference.onlyOnSite.length > 0) {
			lines.push(`  only on site:      ${difference.onlyOnSite.join(', ')}`);
		}
		if (difference.onlyInTraining.length > 0) {
			lines.push(`  only in training:  ${difference.onlyInTraining.join(', ')}`);
		}
		lines.push('');
	}

	lines.push(`Site rows not mapped: ${comparison.unmapped.length}.`);
	for (const row of comparison.unmapped) {
		const who = row.cid ? `CID ${row.cid}` : 'no CID';
		lines.push(
			`  user ${row.userId} (${who}): ${row.code} in ${row.table} — ${REASONS[row.reason]}`
		);
	}

	return lines.join('\n') + '\n';
}

function describe(held: Held): string {
	const codes = [held.certification, ...held.endorsements].filter(Boolean);
	return codes.length > 0 ? codes.join(', ') : 'nothing';
}

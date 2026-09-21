/**
 * The certifications and endorsements this ARTCC issues.
 *
 * Not under `$lib/server/` on purpose — the staff edit view and the enrollment
 * form both render these.
 *
 * One catalogue covers both kinds rather than two modules, because almost
 * everything that reads them wants "what does this controller hold" rather than
 * one kind or the other. `kind` is the only thing that differs structurally.
 *
 * See .ai/decisions/0010-certifications-model.md and DEV-115.
 */
import type { CourseCode } from './courses';

export type CredentialKind = 'certification' | 'endorsement';

export type Credential = {
	/** Short code, used as the stored value and in the UI. */
	code: string;
	kind: CredentialKind;
	/** Human name without the code suffix. */
	name: string;
	/**
	 * Top-down progression rank — higher supersedes lower, so a controller holds
	 * exactly one certification. Null for endorsements, which sit alongside it.
	 *
	 * Deliberately not called `tier`: Tier 1 and Tier 2 are GCAP's own terms for
	 * classifying endorsements, and reusing the word as an ordering number would
	 * make "tier 2" ambiguous on sight.
	 */
	rank: number | null;
	/**
	 * What must already be held to pursue this. **Every** entry must be
	 * satisfied; a nested array is an any-one-of group.
	 *
	 * So A-LC needs A-GC *and* S-LC, while S-LC needs S-GC *or* A-GC.
	 *
	 * This governs **enrollment eligibility, not arrival equivalency** — the
	 * GCAP table in DEV-115 grants an S2 arrival A-LC outright, skipping the
	 * ladder, which is the whole point of an equivalency.
	 */
	requires: readonly (string | readonly string[])[];
	/** The course that earns it, or null when it is not taught here. */
	courseCode: CourseCode | null;
	/** One line of orientation, shown wherever the credential is listed. */
	description: string;
};

export const CREDENTIALS = [
	{
		code: 'S-GC',
		kind: 'certification',
		name: 'Simple Ground Control',
		rank: 1,
		requires: [],
		courseCode: 'S-GC',
		description: 'Clearance delivery and ground control at our simpler fields.'
	},
	{
		code: 'A-GC',
		kind: 'certification',
		name: 'Advanced Ground Control',
		rank: 2,
		requires: ['S-GC'],
		courseCode: 'A-GC',
		description: 'Ground control at Indianapolis and our busier terminal fields.'
	},
	{
		code: 'A-LC',
		kind: 'certification',
		name: 'Advanced Local Control',
		rank: 3,
		// Both: advanced ground, and the simple local endorsement.
		requires: ['A-GC', 'S-LC'],
		courseCode: 'A-LC',
		description: 'Tower and local control at Indianapolis and our busier fields.'
	},
	{
		code: 'T-RC',
		kind: 'certification',
		name: 'Terminal Radar Control',
		rank: 4,
		requires: ['A-LC'],
		courseCode: 'T-RC',
		description: 'Approach and departure control in our terminal airspace.'
	},
	{
		code: 'E-RC',
		kind: 'certification',
		name: 'Enroute Radar Control',
		rank: 5,
		requires: ['T-RC'],
		courseCode: 'E-RC',
		description: 'Enroute control on Indy Center sectors.'
	},
	{
		code: 'S-LC',
		kind: 'endorsement',
		name: 'Simple Local Control',
		rank: null,
		// Either ground certification satisfies this.
		requires: [['S-GC', 'A-GC']],
		courseCode: 'S-LC',
		description: 'Tower and local control at our simpler fields.'
	},
	{
		code: 'T2-CTR',
		kind: 'endorsement',
		name: 'Tier 2 Center',
		rank: null,
		requires: ['E-RC'],
		// Self-led on Moodle, so there is no course in the TRK catalogue for it.
		courseCode: null,
		description: 'Tier 2 enroute sectors, earned through a self-led course.'
	}
] as const satisfies readonly Credential[];

/**
 * One entry as it is actually written above, with its literal `code` and `kind`
 * intact. Lookups return this rather than the wider `Credential`, so a code that
 * came out of the catalogue can be handed straight to a drizzle enum column.
 */
export type CredentialRecord = (typeof CREDENTIALS)[number];

export type CredentialCode = CredentialRecord['code'];

export type CertificationCode = Extract<CredentialRecord, { kind: 'certification' }>['code'];

export type EndorsementCode = Extract<CredentialRecord, { kind: 'endorsement' }>['code'];

/** Non-empty tuple so it can be handed to drizzle's `text(..., { enum })`. */
export const CREDENTIAL_CODES = CREDENTIALS.map((credential) => credential.code) as [
	CredentialCode,
	...CredentialCode[]
];

export const CREDENTIAL_KINDS = ['certification', 'endorsement'] as const satisfies readonly [
	CredentialKind,
	...CredentialKind[]
];

export const CERTIFICATIONS = CREDENTIALS.filter(
	(credential) => credential.kind === 'certification'
);

export const ENDORSEMENTS = CREDENTIALS.filter((credential) => credential.kind === 'endorsement');

export function findCredential(code: string): CredentialRecord | undefined {
	return CREDENTIALS.find((credential) => credential.code === code);
}

export function isCredentialCode(value: unknown): value is CredentialCode {
	return typeof value === 'string' && CREDENTIALS.some((credential) => credential.code === value);
}

export function isCertificationCode(value: unknown): value is CertificationCode {
	return findCredential(value as string)?.kind === 'certification';
}

/**
 * The highest-ranked certification in a set of held codes.
 *
 * The top-down model means a controller should only ever hold one, but this
 * resolves the set rather than trusting it — imported data predates the rule.
 */
export function highestCertification(held: readonly string[]): CredentialRecord | undefined {
	return held
		.map((code) => findCredential(code))
		.filter((credential) => credential?.kind === 'certification')
		.sort((a, b) => (b!.rank ?? 0) - (a!.rank ?? 0))[0];
}

/** Whether `held` satisfies every requirement of `code`. */
export function canHold(code: string, held: readonly string[]): boolean {
	const credential = findCredential(code);
	if (!credential) return false;

	return credential.requires.every((requirement) =>
		typeof requirement === 'string'
			? held.includes(requirement)
			: requirement.some((option) => held.includes(option))
	);
}

/**
 * The certification a controller is entitled to on arrival, by VATSIM rating.
 *
 * Straight from the GCAP table in DEV-115. SUP and ADM are absent on purpose:
 * neither is a controller rating, so the earned rating is derived from logged
 * hours instead — see `$lib/certification-grant.ts`.
 */
export const RATING_GRANTS: Readonly<Record<string, CertificationCode | null>> = {
	OBS: null,
	S1: 'S-GC',
	S2: 'A-LC',
	S3: 'T-RC',
	C1: 'E-RC',
	C3: 'E-RC',
	I1: 'E-RC',
	I3: 'E-RC'
};

/**
 * How recently someone must have controlled for an arrival grant.
 *
 * DEV-115: "If they have not had an active controlling session in the last 6
 * months, do not issue certifications."
 */
export const ACTIVITY_WINDOW_MONTHS = 6;

/**
 * Hours at a rating tier below which we do not treat it as earned, when
 * inferring a SUP/ADM's controller rating from their VATSIM stats. Guards
 * against a few stray minutes logged at a rating they never really held.
 */
export const EARNED_RATING_MIN_HOURS = 1;

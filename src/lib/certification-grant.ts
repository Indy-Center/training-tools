/**
 * What a controller is entitled to when they land on the ZID roster.
 *
 * Pure on purpose, in the same shape as `$lib/training-flow.ts`: everything the
 * decision needs is passed in, so every row of DEV-115's GCAP table is testable
 * without a database, a session or a network call. The impure half — fetching
 * from VATSIM and writing the rows — lives in
 * `$lib/server/certifications/arrival.ts`.
 *
 * See decisions/0010-certifications-model.md and DEV-115.
 */
import {
	EARNED_RATING_MIN_HOURS,
	RATING_GRANTS,
	endorsementsLostWith,
	findCredential,
	highestCertification,
	type CertificationCode,
	type CredentialCode
} from './certifications';

/**
 * Cumulative ATC hours per rating, as VATSIM's `/v2/members/{cid}/stats`
 * returns them. Keys are lowercase rating codes: `s1`, `s2`, `s3`, `c1`, …
 */
export type AtcHoursByRating = Readonly<Record<string, number>>;

export type ArrivalFacts = {
	/** Short VATSIM rating, e.g. "S2". From the roster row we just wrote. */
	ratingShort: string;
	/**
	 * Only fetched for SUP/ADM, where the rating does not say what they earned.
	 * Absent when it was not fetched; a failed lookup never gets this far.
	 */
	atcHoursByRating?: AtcHoursByRating;
	/** Credential codes they already hold unrevoked. */
	held: readonly string[];
};

export type GrantDecision =
	/**
	 * They already hold a certification at least as high as their rating grants;
	 * leave it alone, but give up any endorsement it cannot be held with.
	 */
	| { action: 'keep'; code: CredentialCode; reason: string; drop: CredentialCode[] }
	/** Nothing is due. Still stamped as checked, so we stop asking. */
	| { action: 'none'; reason: string }
	/**
	 * Replaces any lower certification they hold, and revokes the endorsements
	 * the new one cannot be held with — an S2 returning with S-GC and S-LC ends
	 * up with A-LC alone.
	 */
	| {
			action: 'grant';
			code: CertificationCode;
			/** DEV-115's "flag for TA" — set when the rating was inferred. */
			needsReview: boolean;
			/** Goes into `grantNote`, so a TA can check the working. */
			note: string;
	  };

/** Ratings in ascending order, as VATSIM's stats endpoint keys them. */
const RATING_TIERS = ['s1', 's2', 's3', 'c1', 'c3', 'i1', 'i3'] as const;

/**
 * The rating a SUP or ADM actually earned as a controller.
 *
 * Neither is a controller rating — someone promoted to Supervisor keeps that as
 * their visible rating whatever they held before — so the rating field cannot
 * answer the question. Their logged hours can: the highest tier they have
 * meaningful time at is the rating they worked.
 *
 * Returns null when there is nothing to go on, which the caller turns into
 * DEV-115's stated fallback rather than a guess.
 */
export function inferEarnedRating(hours: AtcHoursByRating | undefined): string | null {
	if (!hours) return null;

	for (const tier of [...RATING_TIERS].reverse()) {
		if ((hours[tier] ?? 0) >= EARNED_RATING_MIN_HOURS) return tier.toUpperCase();
	}

	return null;
}

/**
 * SUP and ADM are not controller ratings, so what they earned comes from their
 * logged hours rather than the rating.
 */
export function isHoursDerivedRating(ratingShort: string): boolean {
	return ratingShort === 'SUP' || ratingShort === 'ADM';
}

/**
 * Whether looking this member up on VATSIM can change the answer.
 *
 * Only for a SUP or ADM holding no certification: their rating does not say
 * what they earned, so their logged hours have to. Everyone else is decided
 * from the database alone.
 */
export function needsVatsimLookup(ratingShort: string, held: readonly string[]): boolean {
	if (highestCertification(held)) return false;
	return isHoursDerivedRating(ratingShort);
}

export function resolveArrivalGrant(facts: ArrivalFacts): GrantDecision {
	// 1. Already certified at or above what the rating grants — keep it.
	//
	// This is the leave-and-return safety net: whatever they held when they left,
	// they still hold unless staff revoked it, so a returning member is
	// recognised rather than re-inferred. Someone who earned a higher rating while
	// away is moved up to it instead, as any arrival with that rating would be.
	const existing = highestCertification(facts.held);
	if (existing) {
		const entitled = RATING_GRANTS[facts.ratingShort];
		const entitledRank = entitled ? (findCredential(entitled)?.rank ?? 0) : 0;

		if (!entitled || entitledRank <= (existing.rank ?? 0)) {
			return {
				action: 'keep',
				code: existing.code,
				reason: `Already holds ${existing.code}`,
				drop: endorsementsLostWith(existing.code, facts.held).map((lost) => lost.code)
			};
		}

		return {
			action: 'grant',
			code: entitled,
			needsReview: false,
			note: `${facts.ratingShort} on return; replaces ${existing.code}`
		};
	}

	// There is deliberately no activity test here. The six-month currency rule
	// covers the endorsements held at Indy (S-LC, T2-CTR), which are never
	// granted on arrival; a certification follows from the rating alone.

	// 2. SUP and ADM are not controller ratings, so work out what they earned.
	if (isHoursDerivedRating(facts.ratingShort)) {
		const earned = inferEarnedRating(facts.atcHoursByRating);

		// DEV-115's stated fallback: "set E-RC and flag for TA".
		if (!earned) {
			return {
				action: 'grant',
				code: 'E-RC',
				needsReview: true,
				note: `${facts.ratingShort} with no usable hours breakdown; granted E-RC per the fallback rule — confirm with the TA.`
			};
		}

		const code = RATING_GRANTS[earned];
		if (!code) {
			return {
				action: 'none',
				reason: `${facts.ratingShort} appears to have earned ${earned}, which carries no certification`
			};
		}

		const logged = facts.atcHoursByRating?.[earned.toLowerCase()] ?? 0;
		return {
			action: 'grant',
			code,
			// Always flagged: this is an inference, however well-founded.
			needsReview: true,
			note: `${facts.ratingShort} with ${logged.toFixed(1)}h logged at ${earned}; granted ${code} on that basis — confirm with the TA.`
		};
	}

	// 3. Everyone else comes straight off the GCAP table.
	const code = RATING_GRANTS[facts.ratingShort];

	if (code === undefined) {
		// An unrecognised rating is not a silent pass: someone has to look.
		return { action: 'none', reason: `Unrecognised rating ${facts.ratingShort}` };
	}

	if (code === null) {
		return { action: 'none', reason: `${facts.ratingShort} carries no certification` };
	}

	return {
		action: 'grant',
		code,
		needsReview: false,
		note: `${facts.ratingShort} on arrival`
	};
}

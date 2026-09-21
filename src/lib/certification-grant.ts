/**
 * What a controller is entitled to when they land on the ZID roster.
 *
 * Pure on purpose, in the same shape as `$lib/training-flow.ts`: everything the
 * decision needs is passed in, so every row of DEV-115's GCAP table is testable
 * without a database, a session or a network call. The impure half — fetching
 * from VATSIM and writing the rows — lives in
 * `$lib/server/certifications/arrival.ts`.
 *
 * See .ai/decisions/0010-certifications-model.md and DEV-115.
 */
import {
	ACTIVITY_WINDOW_MONTHS,
	EARNED_RATING_MIN_HOURS,
	RATING_GRANTS,
	highestCertification,
	type CertificationCode
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
	 * End of their most recent ATC session anywhere on the network, or null if
	 * they have never controlled.
	 */
	lastAtcSessionEnd: Date | null;
	/** Only fetched for SUP/ADM, where the rating does not say what they earned. */
	atcHoursByRating: AtcHoursByRating | null;
	/** Credential codes they already hold unrevoked. */
	held: readonly string[];
};

export type GrantDecision =
	/** They already hold a certification; leave it alone. */
	| { action: 'keep'; reason: string }
	/** Nothing is due. Still stamped as checked, so we stop asking. */
	| { action: 'none'; reason: string }
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

function monthsBetween(from: Date, to: Date): number {
	return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

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
export function inferEarnedRating(hours: AtcHoursByRating | null): string | null {
	if (!hours) return null;

	for (const tier of [...RATING_TIERS].reverse()) {
		if ((hours[tier] ?? 0) >= EARNED_RATING_MIN_HOURS) return tier.toUpperCase();
	}

	return null;
}

/**
 * Whether looking this member up on VATSIM can change the answer.
 *
 * Two cases are decidable without leaving the database: someone who already
 * holds a certification keeps it, and someone whose rating carries no
 * certification gets nothing however recently they controlled. Both would
 * otherwise cost an HTTP call each.
 *
 * That is not a micro-optimisation. After the community-website import, 114 of
 * 157 roster members hold something and 39 more are OBS, so this is the
 * difference between 157 lookups on the first pass and four.
 */
export function needsVatsimLookup(ratingShort: string, held: readonly string[]): boolean {
	if (highestCertification(held)) return false;
	return RATING_GRANTS[ratingShort] !== null;
}

function isCurrent(lastAtcSessionEnd: Date | null, now: Date): boolean {
	if (!lastAtcSessionEnd) return false;
	return monthsBetween(lastAtcSessionEnd, now) <= ACTIVITY_WINDOW_MONTHS;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function resolveArrivalGrant(facts: ArrivalFacts, now: Date): GrantDecision {
	// 1. Already certified — nothing to do.
	//
	// This is the whole leave-and-return safety net, and it is why "current on
	// the roster in the last 6 months keeps their certifications" needs no date
	// arithmetic here: if the currency job has not revoked them, they still hold
	// them, and a returning member is recognised rather than re-inferred.
	const existing = highestCertification(facts.held);
	if (existing) {
		return { action: 'keep', reason: `Already holds ${existing.code}` };
	}

	// 2. Not current — grant nothing.
	//
	// DEV-115: "If they have not had an active controlling session in the last 6
	// months, do not issue certifications." Covers the controller who goes quiet,
	// takes a leave of absence, and comes back having lost what they held.
	if (!isCurrent(facts.lastAtcSessionEnd, now)) {
		return {
			action: 'none',
			reason: facts.lastAtcSessionEnd
				? `No controlling session since ${formatDate(facts.lastAtcSessionEnd)}`
				: 'No controlling history on record'
		};
	}

	const lastSession = `last ATC session ${formatDate(facts.lastAtcSessionEnd!)}`;

	// 3. SUP and ADM are not controller ratings, so work out what they earned.
	if (facts.ratingShort === 'SUP' || facts.ratingShort === 'ADM') {
		const earned = inferEarnedRating(facts.atcHoursByRating);

		// DEV-115's stated fallback: "set E-RC and flag for TA".
		if (!earned) {
			return {
				action: 'grant',
				code: 'E-RC',
				needsReview: true,
				note: `${facts.ratingShort} with no usable hours breakdown; granted E-RC per the fallback rule — confirm with the TA. ${lastSession}`
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
			note: `${facts.ratingShort} with ${logged.toFixed(1)}h logged at ${earned}; granted ${code} on that basis — confirm with the TA. ${lastSession}`
		};
	}

	// 4. Everyone else comes straight off the GCAP table.
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
		note: `${facts.ratingShort} on arrival; ${lastSession}`
	};
}

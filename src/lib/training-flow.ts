import { RATING_S1 } from '$lib/config';
import type { Consolidation } from '$lib/consolidation';

/**
 * Which branch of the DEV-112 home-page flow a signed-in member sees, and what
 * `/enroll` and `/enroll/tier-2` gate on. One function decides for all three,
 * so a page and the button that links to it cannot disagree.
 *
 * Order matters: roster membership is checked before rating, because the ZID
 * roster genuinely contains OBS controllers. Sorting on rating first would send
 * a rostered observer down the "become a controller" path they have already
 * completed.
 */
export type TrainingFlow =
	| 'enroll' // home controller who may enroll, or already has a request open
	| 'consolidating' // home controller who has not yet consolidated their rating
	| 'tier-2' // rostered, holds E-RC but not T2-CTR: the self-led Tier 2 course
	| 'visiting-controller' // visiting, and nothing here we can train them in
	| 'become-controller' // not rostered, not yet rated to control
	| 'transfer-or-visit'; // not rostered, already holds a controller rating

export type FlowInput = {
	/** Roster membership, or null when the CID is not on the roster. */
	membership: 'home' | 'visit' | null;
	/** VATSIM rating id. OBS is 1; S1 and above can control. */
	ratingId?: number | null;
	/** Short rating code, used when the numeric id is missing. */
	ratingShort?: string | null;
	/**
	 * Home controllers only. Anything but `met` holds them back from enrolling —
	 * including a missing check, so a caller that forgets it fails closed. That
	 * is also what lets the server loader skip VATSIM until the answer is
	 * `consolidating`: see `$lib/server/training-flow.ts`.
	 */
	consolidation?: Consolidation | null;
	/** An open request always shows, whatever else has changed since. */
	hasOpenEnrollment?: boolean;
	/** Credential codes held unrevoked. */
	held?: readonly string[];
};

/** Short codes that cannot control. */
const UNRATED_CODES = ['OBS', 'SUS', 'INA'];

/** True when the member holds S1 or above. */
export function isRatedController(ratingId?: number | null, ratingShort?: string | null): boolean {
	if (typeof ratingId === 'number') return ratingId >= RATING_S1;

	// Identity's VatsimProfile makes every rating field optional, so fall back
	// to the short code when VATSIM didn't supply an id.
	if (ratingShort) {
		const normalized = ratingShort.trim().toUpperCase();
		return !!normalized && !UNRATED_CODES.includes(normalized);
	}

	// Rating unknown — treat as unrated, which routes to the gentler
	// "become a controller" copy rather than assuming credentials.
	return false;
}

/**
 * Due the self-led Tier 2 course: certified for enroute here, not yet Tier 2.
 *
 * Keyed on the credential, not the rating. A C1 is only certified E-RC once the
 * arrival job or staff grant it, and T2-CTR requires E-RC — so the credential is
 * what says the course is open to them. It covers home controllers who trained
 * up, transfers and visitors alike.
 */
export function isDueTier2(held: readonly string[]): boolean {
	return held.includes('E-RC') && !held.includes('T2-CTR');
}

export function resolveTrainingFlow({
	membership,
	ratingId,
	ratingShort,
	consolidation,
	hasOpenEnrollment = false,
	held = []
}: FlowInput): TrainingFlow {
	if (membership === 'home') {
		if (hasOpenEnrollment) return 'enroll';
		if (isDueTier2(held)) return 'tier-2';
		return consolidation?.status === 'met' ? 'enroll' : 'consolidating';
	}

	// Visitors below E-RC cannot train here at all — formal slots are for home
	// controllers — so Tier 2 is the only thing on offer to them.
	if (membership === 'visit') {
		return isDueTier2(held) ? 'tier-2' : 'visiting-controller';
	}

	return isRatedController(ratingId, ratingShort) ? 'transfer-or-visit' : 'become-controller';
}

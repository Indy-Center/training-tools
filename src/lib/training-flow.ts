import { RATING_S1 } from '$lib/config';

/**
 * Which branch of the DEV-112 home-page flow a signed-in member sees.
 *
 * Order matters: roster membership is checked before rating, because the ZID
 * roster genuinely contains OBS controllers. Sorting on rating first would send
 * a rostered observer down the "become a controller" path they have already
 * completed.
 */
export type TrainingFlow =
	| 'enroll' // on the roster as a home controller
	| 'visiting-controller' // on the roster, but visiting from another facility
	| 'become-controller' // not rostered, not yet rated to control
	| 'transfer-or-visit'; // not rostered, already holds a controller rating

export type FlowInput = {
	/** Roster membership, or null when the CID is not on the roster. */
	membership: 'home' | 'visit' | null;
	/** VATSIM rating id. OBS is 1; S1 and above can control. */
	ratingId?: number | null;
	/** Short rating code, used when the numeric id is missing. */
	ratingShort?: string | null;
};

/** True when the member holds S1 or above. */
export function isRatedController(ratingId?: number | null, ratingShort?: string | null): boolean {
	if (typeof ratingId === 'number') return ratingId >= RATING_S1;

	// Identity's VatsimProfile makes every rating field optional, so fall back
	// to the short code when VATSIM didn't supply an id.
	if (ratingShort) {
		const normalized = ratingShort.trim().toUpperCase();
		if (!normalized || normalized === 'OBS' || normalized === 'SUS' || normalized === 'INA') {
			return false;
		}
		return true;
	}

	// Rating unknown — treat as unrated, which routes to the gentler
	// "become a controller" copy rather than assuming credentials.
	return false;
}

export function resolveTrainingFlow({
	membership,
	ratingId,
	ratingShort
}: FlowInput): TrainingFlow {
	if (membership === 'home') return 'enroll';
	if (membership === 'visit') return 'visiting-controller';

	return isRatedController(ratingId, ratingShort) ? 'transfer-or-visit' : 'become-controller';
}

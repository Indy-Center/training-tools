import { RATING_S1 } from '$lib/config';
import { holdsHighestCertification } from '$lib/certifications';
import type { Consolidation } from '$lib/consolidation';
import type { EnrollmentStatus } from '$lib/db/schema/enrollments';

/**
 * Which view a signed-in member gets on `/`, and what the enroll action and
 * `/enroll/tier-2` gate on. One function decides for all of them, so a page and
 * the button that links to it cannot disagree.
 *
 * An open request wins over everything else: the member sees where it stands,
 * whatever has changed about their roster or rating since they filed it.
 *
 * Without one, order matters: roster membership is checked before rating,
 * because the ZID roster genuinely contains OBS controllers. Sorting on rating
 * first would send a rostered observer down the "become a controller" path they
 * have already completed.
 *
 * See decisions/0019-default-view-by-enrollment-state.md
 */
export type TrainingFlow =
	// An open request, by where it sits on the TRK board.
	| OpenEnrollmentStatus
	// No open request.
	| 'enroll' // home controller who may enroll in their next course
	| 'consolidating' // home controller short of the hours their next course asks for
	| 'extra-courses' // home controller holding our highest certification
	| 'visiting-controller' // on our roster as a visitor
	| 'transfer-or-visit' // a rated VATUSA controller who is not on our roster
	| 'become-controller'; // not a rated VATUSA controller yet

/** The statuses of a request that is still in flight. */
export const OPEN_ENROLLMENT_STATUSES = [
	'waitlist',
	'in-training',
	'rating-exam',
	'needs-catp',
	'certification-update'
] as const satisfies readonly EnrollmentStatus[];
export type OpenEnrollmentStatus = (typeof OPEN_ENROLLMENT_STATUSES)[number];

export function isOpenEnrollmentStatus(
	status: string | null | undefined
): status is OpenEnrollmentStatus {
	return (OPEN_ENROLLMENT_STATUSES as readonly string[]).includes(status ?? '');
}

export type FlowInput = {
	/** Roster membership, or null when the CID is not on the roster. */
	membership: 'home' | 'visit' | null;
	/** VATSIM rating id. OBS is 1; S1 and above can control. */
	ratingId?: number | null;
	/** Short rating code, used when the numeric id is missing. */
	ratingShort?: string | null;
	/**
	 * Whether VATSIM places them in the VATUSA division. Only consulted for
	 * members who are not on our roster. Missing counts as "no", for the same
	 * reason an unknown rating does: the gentler copy is the safer wrong answer.
	 */
	inVatusa?: boolean;
	/**
	 * Home controllers only. Anything but `met` holds them back from enrolling —
	 * including a missing check, so a caller that forgets it fails closed. That
	 * is also what lets the server loader skip VATSIM until the answer is
	 * `consolidating`: see `$lib/server/training-flow.ts`.
	 */
	consolidation?: Consolidation | null;
	/** Status of their open request, or null when they have none. */
	openStatus?: string | null;
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
 *
 * Not a view of its own: the extra-courses and visiting-controller views offer
 * it, and `/enroll/tier-2` gates on it.
 */
export function isDueTier2(held: readonly string[]): boolean {
	return held.includes('E-RC') && !held.includes('T2-CTR');
}

/**
 * Nothing left to take as a student: the highest certification, the Tier 2
 * endorsement, and no request in flight.
 *
 * For a teacher this is what makes `/teach` where the site opens instead of
 * `/`. One function decides for the redirect and for the navigation, so the
 * header's link to the student view is the one that gets past the redirect. A
 * teacher still due Tier 2 stays on `/`, where it is offered.
 */
export function hasFinishedTraining(input: {
	hasOpenRequest: boolean;
	held: readonly string[];
}): boolean {
	return !input.hasOpenRequest && holdsHighestCertification(input.held) && !isDueTier2(input.held);
}

/**
 * `/` asked for by name rather than by default.
 *
 * The site opens on `/`, and for a finished teacher `/` opens on `/teach`. But
 * the student view is still theirs to visit — the optional courses live there —
 * so the header links to it with this, and the redirect steps aside.
 */
export const STUDENT_VIEW_HREF = '/?view=student';

export function asksForStudentView(url: URL): boolean {
	return url.searchParams.get('view') === 'student';
}

export function resolveTrainingFlow({
	membership,
	ratingId,
	ratingShort,
	inVatusa = false,
	consolidation,
	openStatus = null,
	held = []
}: FlowInput): TrainingFlow {
	if (isOpenEnrollmentStatus(openStatus)) return openStatus;

	if (membership === 'home') {
		// Nothing left on the ladder to enroll in, so no consolidation lookup.
		if (holdsHighestCertification(held)) return 'extra-courses';
		return consolidation?.status === 'met' ? 'enroll' : 'consolidating';
	}

	// Formal slots are for home controllers, so visitors get copy rather than a form.
	if (membership === 'visit') return 'visiting-controller';

	// We only mirror our own roster, so "on another VATUSA roster" is inferred:
	// in the VATUSA division and rated to control. A VATUSA observer is still in
	// the academy, and a controller from another division has to join VATUSA
	// first — both are "become a VATUSA controller".
	return inVatusa && isRatedController(ratingId, ratingShort)
		? 'transfer-or-visit'
		: 'become-controller';
}

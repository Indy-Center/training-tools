/**
 * Which course a controller is due next.
 *
 * Pure, like `$lib/training-flow.ts` and `$lib/certification-grant.ts`, so the
 * placement rules are testable without a database or a session.
 *
 * The enroll form offers `options` and nothing else: usually the one course
 * that is next, and two where the order is the student's to choose. (DEV-119
 * first let the student pick any course and flagged the difference to staff;
 * that was reversed when `/` became the one student view.)
 *
 * See DEV-119, which supersedes DEV-114.
 */
import {
	CERTIFICATIONS,
	ENDORSEMENTS,
	canHold,
	findCredential,
	highestCertification
} from './certifications';
import { isCourseCode, type CourseCode } from './courses';

export type PlacementInput = {
	/** Credential codes the controller currently holds unrevoked. */
	held: readonly string[];
};

export type Placement = {
	/** The course to preselect, or null when we genuinely cannot tell. */
	suggested: CourseCode | null;
	/** One line explaining the suggestion, shown to the student. */
	reason: string;
	/**
	 * Every course they may enroll in now, the suggestion first. More than one
	 * when an endorsement the ladder will need later is already open to them: a
	 * simple-ground controller may take S-LC before A-GC or after it.
	 */
	options: CourseCode[];
};

/**
 * The next credential the controller should work towards.
 *
 * Driven by the **certification** ladder rather than by "anything they are
 * eligible for". Eligibility alone is the wrong question: S-GC has no
 * prerequisites, so it stays eligible forever and an A-LC holder would be
 * pointed back at it.
 *
 * So: find the next certification above the one they hold, and if it needs an
 * endorsement they do not have, send them to that first. That is what routes a
 * ground-certified controller to S-LC before A-LC, without anybody hand-writing
 * the sequence — A-LC's `requires` already says it.
 */
function nextCredential(held: readonly string[]) {
	const currentRank = highestCertification(held)?.rank ?? 0;

	const nextCertification = CERTIFICATIONS.filter(
		(certification) => (certification.rank ?? 0) > currentRank
	).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0];

	if (nextCertification) {
		// Only all-of entries can be a hard blocker; an any-of group is satisfied
		// by the ground certification they already hold.
		// `flatMap` rather than a `requirement is string` predicate: the catalogue's
		// codes are literal types, so the predicate's `string` would be wider than
		// the element it narrows, which TypeScript rejects.
		const missingEndorsement = nextCertification.requires
			.flatMap((requirement) => (typeof requirement === 'string' ? [requirement] : []))
			.map((code) => findCredential(code))
			.find((credential) => credential?.kind === 'endorsement' && !held.includes(credential.code));

		return missingEndorsement ?? nextCertification;
	}

	// Top of the ladder. Anything left is an endorsement earned some other way.
	return ENDORSEMENTS.find(
		(endorsement) => !held.includes(endorsement.code) && canHold(endorsement.code, held)
	);
}

/**
 * Endorsements they could take now instead of the next certification: ones
 * they can already hold, that a certification further up will require. That is
 * S-LC for a ground-certified controller, because A-LC requires it.
 */
function endorsementsOpenEarly(held: readonly string[]): CourseCode[] {
	const currentRank = highestCertification(held)?.rank ?? 0;
	const neededLater = new Set<string>(
		CERTIFICATIONS.filter((certification) => (certification.rank ?? 0) > currentRank).flatMap(
			(certification) =>
				certification.requires.flatMap((requirement) =>
					typeof requirement === 'string' ? [requirement] : []
				)
		)
	);

	return ENDORSEMENTS.filter(
		(endorsement) =>
			neededLater.has(endorsement.code) &&
			!held.includes(endorsement.code) &&
			canHold(endorsement.code, held)
	).flatMap((endorsement) =>
		endorsement.courseCode && isCourseCode(endorsement.courseCode) ? [endorsement.courseCode] : []
	);
}

export function resolvePlacement(input: PlacementInput): Placement {
	const placement = suggestPlacement(input);
	if (!placement.suggested) return { ...placement, options: [] };

	return {
		...placement,
		options: [...new Set([placement.suggested, ...endorsementsOpenEarly(input.held)])]
	};
}

function suggestPlacement(input: PlacementInput): Omit<Placement, 'options'> {
	const current = highestCertification(input.held);
	const next = nextCredential(input.held);

	if (!next) {
		return {
			suggested: null,
			reason: current
				? `You already hold ${current.code}, our highest certification. Ask the training staff about custom training.`
				: 'Training staff will confirm your placement.'
		};
	}

	// A credential with no course is earned some other way — T2-CTR is self-led
	// on Moodle — so there is nothing here to enroll in.
	if (!next.courseCode || !isCourseCode(next.courseCode)) {
		return {
			suggested: null,
			reason: `${next.name} is not taught as a course here. Training staff will confirm your placement.`
		};
	}

	if (!current) {
		return {
			suggested: next.courseCode,
			// Deliberately does not say "because you hold nothing" — a new controller
			// reading that they have no certifications is discouraging and unhelpful.
			reason: `${next.name} is where controllers start with us.`
		};
	}

	return {
		suggested: next.courseCode,
		reason: `You hold ${current.code}, ${next.name} is next.`
	};
}

/** Whether the student picked something other than what we suggested. */
export function divergesFromSuggestion(
	placement: Placement,
	chosen: string | null | undefined
): boolean {
	if (!placement.suggested || !chosen) return false;
	return placement.suggested !== chosen;
}

/** Human label for a course code, for the divergence note sent to staff. */
export function credentialName(code: string): string {
	return findCredential(code)?.name ?? code;
}

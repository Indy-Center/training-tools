/**
 * Whether a home controller has consolidated their current rating.
 *
 * Pure, like `$lib/training-flow.ts`: the VATSIM hours are passed in, so every
 * case is testable without a network call. The fetch lives in
 * `$lib/server/consolidation.ts`.
 *
 * See .ai/decisions/0012-enrollment-eligibility.md
 */
import { CONSOLIDATION_HOURS } from './config';
import type { AtcHoursByRating } from './certification-grant';

export type Consolidation =
	/** Requirement met, or none applies to their rating. */
	| { status: 'met'; rating: string | null; required: number }
	| { status: 'not-met'; rating: string; required: number; logged: number }
	/** A requirement applies, but VATSIM could not tell us their hours. */
	| { status: 'unknown'; rating: string; required: number };

export type ConsolidationInput = {
	/** Short VATSIM rating, e.g. "S2". */
	ratingShort: string | null;
	/** VATSIM's per-rating hours, or null when the lookup failed or was skipped. */
	hoursByRating: AtcHoursByRating | null;
	/** Overridable for tests; defaults to the configured table. */
	requirements?: Readonly<Record<string, number>>;
};

function normalize(ratingShort: string | null): string | null {
	return ratingShort?.trim().toUpperCase() || null;
}

/** Hours required at this rating, or 0 when the rating has no requirement. */
export function requiredConsolidationHours(
	ratingShort: string | null,
	requirements: Readonly<Record<string, number>> = CONSOLIDATION_HOURS
): number {
	const rating = normalize(ratingShort);
	return rating ? Math.max(0, requirements[rating] ?? 0) : 0;
}

export function checkConsolidation({
	ratingShort,
	hoursByRating,
	requirements = CONSOLIDATION_HOURS
}: ConsolidationInput): Consolidation {
	const rating = normalize(ratingShort);
	const required = requiredConsolidationHours(rating, requirements);

	if (!rating || required === 0) return { status: 'met', rating, required: 0 };

	// Fail closed: without their hours we cannot say they have consolidated, and
	// the enrollment is the thing this requirement exists to hold back.
	if (!hoursByRating) return { status: 'unknown', rating, required };

	// VATSIM keys its stats by lowercase rating code.
	const logged = hoursByRating[rating.toLowerCase()] ?? 0;

	return logged >= required
		? { status: 'met', rating, required }
		: { status: 'not-met', rating, required, logged };
}

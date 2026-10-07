/**
 * Whether a home controller has consolidated for their next course.
 *
 * Pure, like `$lib/training-flow.ts`: the VATSIM sessions are passed in, so
 * every case is testable without a network call. The fetch lives in
 * `$lib/server/consolidation.ts`.
 *
 * See decisions/0027-consolidation-by-position.md
 */
import { CONSOLIDATION_REQUIREMENTS, type ConsolidationRequirement } from './config';

/** The part of a VATSIM ATC session the check reads. */
export type AtcSession = {
	callsign: string;
	/** ISO 8601. */
	start: string;
	/** Null while the session is still open. */
	end: string | null;
};

export type Consolidation =
	/** Requirement met, or none applies to the course. */
	| { status: 'met'; course: string | null; required: number }
	| { status: 'not-met'; course: string; required: number; logged: number }
	/** A requirement applies, but VATSIM could not tell us their sessions. */
	| { status: 'unknown'; course: string; required: number };

type Requirements = Readonly<Record<string, ConsolidationRequirement>>;

export type ConsolidationInput = {
	/** The course they would enroll in, e.g. "T-RC". */
	course: string | null;
	/** Their VATSIM ATC sessions, or null when the lookup failed or was skipped. */
	sessions: readonly AtcSession[] | null;
	/** Overridable for tests; defaults to the configured table. */
	requirements?: Requirements;
	/** When an open session is counted up to. Overridable for tests. */
	now?: Date;
};

/** What this course asks for, or null when it has no requirement. */
export function consolidationRequirement(
	course: string | null,
	requirements: Requirements = CONSOLIDATION_REQUIREMENTS
): ConsolidationRequirement | null {
	const requirement = course ? requirements[course] : undefined;
	if (!requirement || requirement.hours <= 0 || requirement.positions.length === 0) return null;
	return requirement;
}

/** The position a callsign names: `IND_E_TWR` and `CVG_TWR` are both `TWR`. */
export function callsignPosition(callsign: string): string {
	return callsign.trim().toUpperCase().split('_').pop() ?? '';
}

/** Hours across the sessions worked on any of these positions. */
export function hoursOnPositions(
	sessions: readonly AtcSession[],
	positions: readonly string[],
	now: Date = new Date()
): number {
	let milliseconds = 0;

	for (const session of sessions) {
		if (!positions.includes(callsignPosition(session.callsign))) continue;

		const start = new Date(session.start).getTime();
		const end = session.end ? new Date(session.end).getTime() : now.getTime();

		// A date VATSIM sent that does not parse, or a session that ends before it
		// starts, adds nothing rather than poisoning the total.
		if (end > start) milliseconds += end - start;
	}

	return milliseconds / 3_600_000;
}

export function checkConsolidation({
	course,
	sessions,
	requirements = CONSOLIDATION_REQUIREMENTS,
	now
}: ConsolidationInput): Consolidation {
	const requirement = consolidationRequirement(course, requirements);

	if (!course || !requirement) return { status: 'met', course, required: 0 };

	const { hours: required, positions } = requirement;

	// Fail closed: without their sessions we cannot say they have consolidated,
	// and the enrollment is the thing this requirement exists to hold back.
	if (!sessions) return { status: 'unknown', course, required };

	const logged = hoursOnPositions(sessions, positions, now);

	return logged >= required
		? { status: 'met', course, required }
		: { status: 'not-met', course, required, logged };
}

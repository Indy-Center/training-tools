import type { RosterMember } from '$lib/db/schema/roster';
import type { Enrollment } from '$lib/db/schema/enrollments';
import type { Consolidation } from '$lib/consolidation';
import type { CourseCode } from '$lib/courses';
import { resolvePlacement } from '$lib/course-placement';
import { getRosterMember } from '$lib/server/roster';
import { getOwnOpenEnrollment } from '$lib/server/enrollments';
import { getHeldCredentials } from '$lib/server/certifications';
import { getConsolidation } from '$lib/server/consolidation';
import { requireSession } from '$lib/server/guards';
import { resolveTrainingFlow, type TrainingFlow } from '$lib/training-flow';
import { isVatusaMember } from '$lib/user';

export type TrainingContext = {
	flow: TrainingFlow;
	rosterMember: RosterMember | null;
	openEnrollment: Enrollment | null;
	/** Credential codes held unrevoked. Empty for anyone not on the roster. */
	held: string[];
	/** Only looked up when it decides the branch; null otherwise. */
	consolidation: Consolidation | null;
	/**
	 * The next course in their progression: what the enroll view offers, what
	 * the enroll action files, and what consolidation is holding back. Null at
	 * the top of the ladder.
	 */
	nextCourse: CourseCode | null;
	/** Their rating as the facility records it, else as VATSIM told identity. */
	ratingShort: string | null;
};

/**
 * Gather what `resolveTrainingFlow()` needs for the signed-in member, and resolve.
 *
 * The one place `/` (its load and its enroll action) and `/enroll/tier-2` get
 * their answer from, so the eligibility rules live in the pure functions and
 * nowhere else — a page and the action behind it cannot work the next course
 * out differently.
 *
 * The open request is looked up for everyone, not just home controllers: a
 * request outlives a roster change, and its owner still needs to see it and be
 * able to withdraw it.
 *
 * VATSIM is only called when the answer hinges on it. Resolving once without a
 * consolidation fails closed to `consolidating` in exactly that case — a home
 * controller with no open request and a course left to take — so the second
 * pass reuses the ordering rather than restating it here.
 */
export async function loadTrainingContext(locals: App.Locals): Promise<TrainingContext> {
	const session = requireSession(locals);
	const cid = session.user.cid;
	const rosterMember = await getRosterMember(locals.db, cid);
	const membership = rosterMember?.membership ?? null;

	const [openEnrollment, heldRows] = await Promise.all([
		getOwnOpenEnrollment(locals),
		membership ? getHeldCredentials(locals.db, cid) : Promise.resolve([])
	]);
	const held = heldRows.map((row) => row.code);

	// Prefer VATUSA's rating for rostered members (it is the facility's own
	// record); fall back to what identity captured from VATSIM Connect.
	const ratingShort =
		rosterMember?.ratingShort ?? session.user.vatsimData.vatsim?.rating?.short ?? null;

	const input = {
		membership,
		ratingId: rosterMember?.rating ?? session.user.vatsimData.vatsim?.rating?.id ?? null,
		ratingShort,
		inVatusa: isVatusaMember(session.user),
		openStatus: openEnrollment?.status ?? null,
		held
	};

	let flow = resolveTrainingFlow(input);
	let consolidation: Consolidation | null = null;

	if (flow === 'consolidating') {
		consolidation = await getConsolidation(cid, rosterMember!.ratingShort);
		flow = resolveTrainingFlow({ ...input, consolidation });
	}

	return {
		flow,
		rosterMember,
		openEnrollment,
		held,
		consolidation,
		nextCourse: resolvePlacement({ held }).suggested,
		ratingShort
	};
}

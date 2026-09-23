import type { Database } from '$lib/server/db';
import type { RosterMember } from '$lib/db/schema/roster';
import type { Enrollment } from '$lib/db/schema/enrollments';
import type { Consolidation } from '$lib/consolidation';
import { getRosterMember } from '$lib/server/roster';
import { getOpenEnrollment } from '$lib/server/enrollments';
import { getHeldCredentials } from '$lib/server/certifications';
import { getConsolidation } from '$lib/server/consolidation';
import { resolveTrainingFlow, type TrainingFlow } from '$lib/training-flow';

export type TrainingContext = {
	flow: TrainingFlow;
	rosterMember: RosterMember | null;
	openEnrollment: Enrollment | null;
	/** Credential codes held unrevoked. Empty for anyone not on the roster. */
	held: string[];
	/** Only looked up when it decides the branch; null otherwise. */
	consolidation: Consolidation | null;
};

/**
 * Gather what `resolveTrainingFlow()` needs for a signed-in member, and resolve.
 *
 * The one place `/`, `/enroll` and `/enroll/tier-2` get their answer from, so
 * the eligibility rules live in the pure function and nowhere else.
 *
 * VATSIM is only called when the answer hinges on it. Resolving once without a
 * consolidation fails closed to `consolidating` in exactly that case — a home
 * controller with no open request who is not due Tier 2 — so the second pass
 * reuses the ordering rather than restating it here.
 */
export async function loadTrainingContext(
	db: Database,
	session: NonNullable<App.Locals['session']>
): Promise<TrainingContext> {
	const cid = session.user.cid;
	const rosterMember = await getRosterMember(db, cid);
	const membership = rosterMember?.membership ?? null;

	const [openEnrollment, heldRows] = await Promise.all([
		membership === 'home' ? getOpenEnrollment(db, cid) : Promise.resolve(null),
		membership ? getHeldCredentials(db, cid) : Promise.resolve([])
	]);
	const held = heldRows.map((row) => row.code);

	const input = {
		membership,
		// Prefer VATUSA's rating for rostered members (it is the facility's own
		// record); fall back to what identity captured from VATSIM Connect.
		ratingId: rosterMember?.rating ?? session.user.vatsimData.vatsim?.rating?.id ?? null,
		ratingShort: rosterMember?.ratingShort ?? session.user.vatsimData.vatsim?.rating?.short ?? null,
		hasOpenEnrollment: openEnrollment !== null,
		held
	};

	let flow = resolveTrainingFlow(input);
	let consolidation: Consolidation | null = null;

	if (flow === 'consolidating') {
		consolidation = await getConsolidation(cid, rosterMember!.ratingShort);
		flow = resolveTrainingFlow({ ...input, consolidation });
	}

	return { flow, rosterMember, openEnrollment, held, consolidation };
}

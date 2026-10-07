import {
	checkConsolidation,
	consolidationRequirement,
	type Consolidation
} from '$lib/consolidation';
import { fetchAtcSessions } from '$lib/server/vatsim';

/**
 * Look up a home controller's consolidation for a course against VATSIM.
 *
 * Only calls VATSIM when the course actually carries a requirement, so
 * enrolling in S-GC costs no subrequest.
 */
export async function getConsolidation(cid: string, course: string | null): Promise<Consolidation> {
	const sessions = consolidationRequirement(course) ? await fetchAtcSessions(cid) : null;

	return checkConsolidation({ course, sessions });
}

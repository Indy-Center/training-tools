import {
	checkConsolidation,
	requiredConsolidationHours,
	type Consolidation
} from '$lib/consolidation';
import { fetchAtcHoursByRating } from '$lib/server/vatsim';

/**
 * Look up a home controller's consolidation against VATSIM.
 *
 * Only calls VATSIM when their rating actually carries a requirement, so an
 * OBS or C1 member costs no subrequest.
 */
export async function getConsolidation(
	cid: string,
	ratingShort: string | null
): Promise<Consolidation> {
	const hoursByRating =
		requiredConsolidationHours(ratingShort) > 0 ? await fetchAtcHoursByRating(cid) : null;

	return checkConsolidation({ ratingShort, hoursByRating });
}

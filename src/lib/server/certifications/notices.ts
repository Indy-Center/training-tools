import { SITE_URL } from '$lib/config';
import type { Notice } from '$lib/server/notify';

/** A certification granted on arrival that a person should look at. */
export type ReviewGrant = { name: string; cid: string; code: string; note: string };

/**
 * Arrivals whose certification was worked out rather than read off their
 * rating — a supervisor or administrator, whose controller rating is inferred
 * from logged hours — and so needs a TA to confirm it. One notice for the run.
 * Null when nothing needs review.
 */
export function reviewNeededNotice(grants: readonly ReviewGrant[]): Notice | null {
	if (grants.length === 0) return null;

	const one = grants.length === 1;
	return {
		audience: 'training-admins',
		tone: 'warning',
		title: one
			? `Certification to review: ${grants[0].name}`
			: `${grants.length} certifications to review`,
		summary: one
			? 'Granted on arrival from an inferred rating. Check it is right.'
			: 'Granted on arrival from inferred ratings. Check they are right.',
		link: one ? `${SITE_URL}/certifications/${grants[0].cid}` : `${SITE_URL}/certifications`,
		fields: grants.map((grant) => ({
			label: `${grant.name} (${grant.cid})`,
			value: `${grant.code}. ${grant.note}`
		}))
	};
}

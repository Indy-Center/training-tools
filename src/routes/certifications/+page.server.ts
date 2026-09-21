import { redirect } from '@sveltejs/kit';
import { canEditCertifications } from '$lib/utils/permissions';
import { searchRosterMembers, ROSTER_SEARCH_LIMIT } from '$lib/server/roster';
import { getLiveCredentialsByCid } from '$lib/server/certifications';
import { highestCertification, findCredential } from '$lib/certifications';
import type { PageServerLoad } from './$types';

/**
 * Certification data is everyone's training record, so this is staff-only.
 *
 * `hooks.server.ts` only proves a session exists — per ADR 0004 the gate for
 * anything finer belongs in the load, not a layout. There are no actions on
 * this route, so the load is the whole surface; `[cid]` gates its actions
 * separately.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!canEditCertifications(locals.session?.roles)) {
		redirect(303, '/');
	}

	const query = url.searchParams.get('q') ?? '';

	const [members, credentialsByCid] = await Promise.all([
		searchRosterMembers(locals.db, query),
		getLiveCredentialsByCid(locals.db)
	]);

	const controllers = members.map((member) => {
		const held = credentialsByCid.get(member.cid) ?? [];
		const certification = highestCertification(held);

		return {
			cid: member.cid,
			name: `${member.firstName} ${member.lastName}`.trim(),
			ratingShort: member.ratingShort,
			membership: member.membership,
			certification: certification?.code ?? null,
			// The one certification plus every endorsement is exactly DEV-115's
			// display rule — S-LC shows beside the ground certification with no
			// special case, because it is modelled as an endorsement.
			endorsements: held.filter((code) => findCredential(code)?.kind === 'endorsement').sort()
		};
	});

	return {
		query,
		controllers,
		// So the page can say "showing the first 50" rather than implying it found
		// exactly this many.
		truncated: controllers.length === ROSTER_SEARCH_LIMIT
	};
};

import { error, fail, redirect } from '@sveltejs/kit';
import { canEditCertifications } from '$lib/utils/permissions';
import { getRosterMember } from '$lib/server/roster';
import {
	getCredentialHistory,
	getHeldCredentials,
	setCertification,
	toggleEndorsement
} from '$lib/server/certifications';
import {
	CERTIFICATIONS,
	ENDORSEMENTS,
	canHold,
	findCredential,
	highestCertification,
	isCertificationCode
} from '$lib/certifications';
import type { Actions, PageServerLoad } from './$types';

/**
 * Staff-only, checked in the load **and** in every action.
 *
 * Not one or the other: `hooks.server.ts` proves only that a session exists,
 * and a form action runs before any load — so gating in the load alone would
 * leave both actions wide open to any signed-in user. See
 * .ai/decisions/0004-gate-in-handle-not-layout.md
 */
function requireCertificationEditor(locals: App.Locals) {
	if (!canEditCertifications(locals.session?.roles)) {
		redirect(303, '/');
	}

	return locals.session!;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	requireCertificationEditor(locals);

	const member = await getRosterMember(locals.db, params.cid);

	// Deliberately not a redirect: a bad CID in the URL is a mistake worth
	// seeing, not something to silently bounce.
	if (!member) {
		error(404, 'No active roster member with that CID');
	}

	const [held, history] = await Promise.all([
		getHeldCredentials(locals.db, params.cid),
		getCredentialHistory(locals.db, params.cid)
	]);

	const heldCodes = held.map((row) => row.code);
	const certification = highestCertification(heldCodes);

	return {
		controller: {
			cid: member.cid,
			name: `${member.firstName} ${member.lastName}`.trim(),
			ratingShort: member.ratingShort,
			membership: member.membership,
			facilityJoinedAt: member.facilityJoinedAt
		},
		certification: certification?.code ?? null,
		// Anything needing a TA's eye — an arrival whose rating was inferred.
		needsReview: held.some((row) => row.needsReview),
		certifications: CERTIFICATIONS.map((credential) => ({
			code: credential.code,
			name: credential.name,
			description: credential.description
		})),
		endorsements: ENDORSEMENTS.map((credential) => ({
			code: credential.code,
			name: credential.name,
			description: credential.description,
			held: heldCodes.includes(credential.code),
			// Shown as guidance, never enforced: staff correct reality, and reality
			// is sometimes out of order. `requires` describes the training path.
			eligible: canHold(credential.code, heldCodes)
		})),
		history: history
			.map((row) => ({
				code: row.code,
				kind: row.kind,
				grantedAt: row.grantedAt,
				grantedBy: row.grantedBy,
				grantBasis: row.grantBasis,
				grantNote: row.grantNote,
				revokedAt: row.revokedAt,
				revokedBy: row.revokedBy,
				revokedReason: row.revokedReason,
				needsReview: row.needsReview
			}))
			.sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())
	};
};

export const actions: Actions = {
	/**
	 * Both actions are **named**. SvelteKit throws
	 * "When using named actions, the default action cannot be used" the moment a
	 * `default` sits alongside a named one, which silently breaks every POST to
	 * the route — exactly how `/enroll` broke in DEV-108.
	 */
	setCertification: async ({ locals, params, request }) => {
		const session = requireCertificationEditor(locals);

		const data = await request.formData();
		const raw = String(data.get('certification') ?? '');
		// An empty value is "no certification", which is a legitimate choice.
		const code = raw === '' ? null : raw;

		if (code !== null && !isCertificationCode(code)) {
			return fail(400, { formError: `${code} is not a certification` });
		}

		try {
			await setCertification(locals.db, params.cid, code, session.user.cid);
		} catch (err) {
			console.error('[training-tools] setCertification failed', err);
			return fail(500, { formError: 'Could not update the certification.' });
		}

		return { success: true };
	},

	toggleEndorsement: async ({ locals, params, request }) => {
		const session = requireCertificationEditor(locals);

		const data = await request.formData();
		const code = String(data.get('endorsement') ?? '');

		if (findCredential(code)?.kind !== 'endorsement') {
			return fail(400, { formError: `${code} is not an endorsement` });
		}

		try {
			await toggleEndorsement(locals.db, params.cid, code, session.user.cid);
		} catch (err) {
			console.error('[training-tools] toggleEndorsement failed', err);
			return fail(500, { formError: 'Could not update the endorsement.' });
		}

		return { success: true };
	}
};

import { fail } from '@sveltejs/kit';
import { isTrainingAdmin } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import { getLiveCredentialsByCid } from '$lib/server/certifications';
import { completeAudit, getAuditQueue, getEnrollment } from '$lib/server/enrollments';
import { getPeople } from '$lib/server/roster';
import { findCredential, highestCertification } from '$lib/certifications';
import { holdLabels } from '$lib/course-completion';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad } from './$types';

/**
 * The TA's audit: every request sitting at Certification Update, one row each.
 *
 * By the time a request is here its training is done, any rating exam is
 * passed, and the certification the course earns has been applied (or is about
 * to be — `certificationAppliedAt`). The exception is a card that arrived
 * without the fields that show that, which is held and listed with what it lacks. The TA checks it and presses **Audit
 * complete**, which moves the card to Completed and closes the request.
 *
 * Training admins only, checked in the load **and** the action.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, isTrainingAdmin);

	const [queue, people, credentials] = await Promise.all([
		getAuditQueue(locals.db),
		getPeople(locals.db),
		// The whole (small) table rather than an `IN (...)` over the students here:
		// D1's 100-parameter limit, the same reasoning as everywhere else.
		getLiveCredentialsByCid(locals.db)
	]);

	return {
		requests: queue.map((enrollment) => {
			const held = credentials.get(enrollment.cid) ?? [];

			return {
				id: enrollment.id,
				cid: enrollment.cid,
				name: people.get(enrollment.cid)?.name ?? enrollment.submittedName,
				course: enrollment.course,
				teacher: enrollment.teacher,
				examiner: enrollment.reInstructor,
				// What they hold now, which is what the TA is checking.
				certification: highestCertification(held)?.code ?? null,
				endorsements: held.filter((code) => findCredential(code)?.kind === 'endorsement').sort(),
				// Null until the course's certification has been applied and the card
				// dated. The audit cannot be completed before then.
				appliedAt: enrollment.certificationAppliedAt,
				// The fields the card lacks, when that is why nothing has been applied.
				missing: holdLabels(enrollment.certificationHold)
			};
		})
	};
};

export const actions: Actions = {
	/**
	 * Named, like every action in this app — a `default` beside a named action
	 * breaks every POST to the route. `actions.test.ts` pins it.
	 */
	complete: async ({ locals, request, platform }) => {
		const session = requireRole(locals, isTrainingAdmin);

		const id = (await request.formData()).get('id');
		const enrollment = typeof id === 'string' && id ? await getEnrollment(locals.db, id) : null;

		if (!enrollment || enrollment.status !== 'certification-update') {
			return fail(409, { auditError: 'That request is no longer waiting for an audit.' });
		}

		// Closing the card before its certification is applied would leave the
		// cron's pass with nothing to find: it only looks at Certification Update.
		if (!enrollment.certificationAppliedAt) {
			const missing = holdLabels(enrollment.certificationHold);
			if (missing.length > 0) {
				return fail(409, {
					auditError: `The certification for this request is on hold: the card is missing ${missing.join(', ')}.`
				});
			}
			return fail(409, {
				auditError:
					'The certification for this request has not been applied yet. It is retried every 15 minutes; if it stays like this, check the Admin page.'
			});
		}

		const result = await completeAudit(
			locals.db,
			platform?.env,
			enrollment,
			displayName(session.user)
		);
		if (!result.ok) return fail(502, { auditError: result.message });

		return { audited: enrollment.submittedName };
	}
};

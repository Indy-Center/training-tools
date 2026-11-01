import { error } from '@sveltejs/kit';
import { isTrainingAdmin } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import { getEnrollmentByIssueKey, loadCardPage } from '$lib/server/enrollments/card-page';
import type { PageServerLoad } from './$types';

/**
 * One TRK card, for a training admin: our row, and the card read live from
 * Jira with its moves and latest comments. Reached by its key (`TRK-14`), from
 * `/waitlist`, `/admin/audit` and the notices that name a card; not from the nav.
 *
 * Training admins only, checked here and in every action (decisions/0004).
 */
export const load: PageServerLoad = async ({ locals, params, platform }) => {
	requireRole(locals, isTrainingAdmin);

	const enrollment = await getEnrollmentByIssueKey(locals.db, params.issueKey);
	if (!enrollment) error(404, `No enrollment in the app for ${params.issueKey}.`);

	return loadCardPage(locals.db, platform?.env, enrollment);
};

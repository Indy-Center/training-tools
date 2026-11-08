import { error, fail } from '@sveltejs/kit';
import { isTrainingAdmin } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import { CARD_DATE_FIELDS, type CardDateKey } from '$lib/card-page';
import { getEnrollmentByIssueKey, loadCardPage } from '$lib/server/enrollments/card-page';
import { editCard, stageChoices, type CardEditInput } from '$lib/server/enrollments/edit-card';
import { ADMIN_REMOVAL_REASON_CHOICES } from '$lib/server/jira/fields';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad } from './$types';

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

	const page = await loadCardPage(locals.db, platform?.env, enrollment);
	return {
		...page,
		// Edit card's stage choices: the card's own and each move, Completed left out.
		stages: page.card ? stageChoices(page.card.status, page.transitions) : [],
		// Edit card's reasons for a move to Removed: the four an admin may choose.
		removalReasons: ADMIN_REMOVAL_REASON_CHOICES
	};
};

/** The Edit card form's fields. One left out of the POST is left as the card has it. */
function editInput(form: FormData): CardEditInput {
	const text = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : undefined;
	};
	const dates: Partial<Record<CardDateKey, string>> = {};
	for (const { key } of CARD_DATE_FIELDS) {
		const value = text(key);
		if (value !== undefined) dates[key] = value;
	}
	return { stage: text('stage'), examiner: text('examiner'), dates };
}

export const actions: Actions = {
	/**
	 * Edit card: the stage, dates and examiner in one save. The card and its
	 * moves are read again in `editCard()`; nothing posted about them is trusted.
	 */
	edit: async ({ locals, params, request, platform }) => {
		const session = requireRole(locals, isTrainingAdmin);

		const enrollment = await getEnrollmentByIssueKey(locals.db, params.issueKey);
		if (!enrollment) {
			return fail(404, { editError: `No enrollment in the app for ${params.issueKey}.` });
		}

		const result = await editCard(
			locals.db,
			platform?.env,
			enrollment,
			displayName(session.user),
			editInput(await request.formData())
		);
		if (!result.ok) return fail(result.status, { editError: result.message });

		return { edited: params.issueKey };
	}
};

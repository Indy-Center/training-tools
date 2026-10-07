import { error, fail, redirect } from '@sveltejs/kit';
import {
	blankReport,
	canReport,
	checkReport,
	ctrsMode,
	finishChoices,
	isExaminerFor,
	otsChoices,
	readReport
} from '$lib/ctrs';
import { findCourse } from '$lib/courses';
import {
	completeExam,
	completeTraining,
	failExam,
	getEnrollment,
	type FlowResult
} from '$lib/server/enrollments';
import { requireSession } from '$lib/server/guards';
import { getPeople } from '$lib/server/roster';
import { getActiveTeacher } from '$lib/server/teachers';
import { submitTrainingRecord, VatusaError } from '$lib/server/vatusa';
import { displayName } from '$lib/user';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * A training session report, filed in VATUSA's CTRS by the teacher (or
 * examiner) on the student's card. Opened from a button on `/teach`.
 *
 * The record is VATUSA's to keep: nothing is stored here yet.
 *
 * A report can also end the training: the teacher ticks "recommend for a
 * rating exam" or "mark the course complete", whichever the course has, and
 * once VATUSA has the report the card is moved (`completeTraining`).
 *
 * The examiner's report ends the exam the same way: passed moves the card on
 * to audit (`completeExam`), not passed to Needs CATP (`failExam`).
 *
 * `CTRS_SUBMIT` in wrangler.jsonc switches it: `live` files the record;
 * anything else asks VATUSA to check it and save nothing.
 */
function settings(env: Partial<Env> | undefined) {
	const vars = env as { CTRS_SUBMIT?: string } | undefined;
	return {
		apiKey: env?.VATUSA_API_KEY?.trim() || null,
		mode: ctrsMode(vars?.CTRS_SUBMIT)
	};
}

/**
 * Who is reporting, and on whom. Run by the load and again by the action,
 * which runs before any load.
 */
async function reporting(event: Pick<RequestEvent, 'locals' | 'params'>) {
	const session = requireSession(event.locals);
	const teacher = await getActiveTeacher(event.locals.db, session.user.cid);
	if (!teacher) error(403, 'Only teachers can file a training report.');

	const enrollment = await getEnrollment(event.locals.db, event.params.id);
	if (!enrollment || !canReport(enrollment, teacher)) {
		error(404, 'That student is not yours to report on, or their request has closed.');
	}

	return {
		session,
		teacher,
		enrollment,
		allowed: {
			examiner: isExaminerFor(enrollment, teacher),
			finish: finishChoices(enrollment, teacher)
		}
	};
}

export const load: PageServerLoad = async (event) => {
	const { session, teacher, enrollment, allowed } = await reporting(event);
	const people = await getPeople(event.locals.db);
	const { apiKey, mode } = settings(event.platform?.env);

	return {
		student: {
			cid: enrollment.cid,
			name: people.get(enrollment.cid)?.name ?? enrollment.submittedName,
			course: enrollment.course,
			courseName: findCourse(enrollment.course)?.name ?? enrollment.course,
			status: enrollment.status
		},
		instructor: { cid: teacher.cid, name: displayName(session.user) },
		otsChoices: otsChoices(allowed.examiner),
		finishChoices: allowed.finish,
		blank: blankReport(new Date()),
		keySet: apiKey !== null,
		mode
	};
};

export const actions: Actions = {
	/** Named, like every action in this app: see `$lib/testing/named-actions`. */
	submit: async (event) => {
		const { session, teacher, enrollment, allowed } = await reporting(event);
		const values = readReport(await event.request.formData());

		const checked = checkReport(values, allowed);
		if (!checked.ok) return fail(400, { values, errors: checked.errors });

		const { apiKey, mode } = settings(event.platform?.env);
		if (!apiKey) {
			return fail(503, {
				values,
				errors: ['No VATUSA API key is set, so the report cannot be filed from here.']
			});
		}

		let recordId: number | null;
		try {
			const { id } = await submitTrainingRecord(
				apiKey,
				enrollment.cid,
				teacher.cid,
				checked.record,
				{
					test: mode === 'test'
				}
			);
			if (mode === 'test') {
				// Kept on screen: nothing was saved, so they may want to file it again for real.
				return { values, tested: true };
			}
			recordId = id;
		} catch (cause) {
			if (!(cause instanceof VatusaError)) throw cause;
			console.error('CTRS report refused', { status: cause.status, message: cause.message });
			return fail(502, { values, errors: [`VATUSA refused the report: ${cause.message}`] });
		}

		// The report is with VATUSA now, so nothing below sends them back to the
		// form: filing it twice would be worse than a card left for a training admin.
		const { db } = event.locals;
		const env = event.platform?.env;
		const by = displayName(session.user);

		let result: FlowResult | null = null;
		if (checked.finish) {
			result = await completeTraining(db, env, enrollment, by, checked.finish);
		} else if (checked.examResult === 'passed') {
			result = await completeExam(db, env, enrollment, by);
		} else if (checked.examResult === 'not-passed') {
			result = await failExam(db, env, enrollment, by);
		}

		let card = '';
		if (result) {
			if (!result.ok) console.error('CTRS report filed, card not moved', result.message);
			card = result.ok ? '&card=moved' : '&card=stuck';
		}
		// An exam's report is followed by VATUSA's evaluation form, which `/teach`
		// offers next.
		const evaluation = allowed.examiner ? `&evaluate=${enrollment.cid}` : '';
		redirect(303, `/teach?reported=${recordId ?? ''}${card}${evaluation}`);
	}
};

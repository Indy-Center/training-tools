import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { enrollmentsTable, type Enrollment } from '$lib/db/schema/enrollments';
import {
	afterTrainingOptions,
	credentialChangeFor,
	formatHold,
	holdLabels,
	missingEvidence,
	type AfterTraining,
	type CompletionEvidence,
	type CredentialChange
} from '$lib/course-completion';
import { findCourse } from '$lib/courses';
import { getHeldCredentials, grantCredential, setCertification } from '$lib/server/certifications';
import { JiraError, resolveJiraConfig, type JiraConfig } from '$lib/server/jira/client';
import { commentOnIssue, transitionIssueToStatus } from '$lib/server/jira/enrollment';
import { JIRA_FIELDS } from '$lib/server/jira/fields';
import { fetchEnrollmentIssue } from '$lib/server/jira/issues';
import {
	CERTIFICATION_UPDATE_STATUS,
	COMPLETED_STATUS,
	fetchCardEvidence,
	findSelectOption,
	NEEDS_CATP_STATUS,
	RATING_EXAM_STATUS,
	toFacilityDate,
	updateIssueFields
} from '$lib/server/jira/progress';
import { RE_INSTRUCTOR_FIELD } from '$lib/server/jira/status';
import { syncEnrollmentIssue } from './status-sync';
import { announceArrivals } from './announce';
import { notify } from '$lib/server/notify';
import { certificationHeldNotice } from './notices';

/**
 * The end of a course of training, as writes.
 *
 * Who may do each step, and where it leads, is decided by the pure functions in
 * `$lib/course-completion.ts`; the routes check those before calling in here.
 *
 * **Jira is still the authority on where a request is** (0014). So each step
 * writes to the card first — the date, then the move — and only then reads the
 * card back onto our row, through the same `applyIssueStatus()` the webhook and
 * the sweep use. If Jira refuses, nothing here has changed and the person is
 * told why. Nothing is set locally that Jira did not agree to.
 *
 * **The certification is not applied by these steps.** It is applied by
 * `applyCertificationUpdate()` whenever a request is found sitting in
 * `certification-update` without having had it — which covers a card a teacher
 * completed here, and equally one somebody dragged across the board by hand.
 *
 * See decisions/0021-end-of-course-flows.md
 */

export type FlowResult = { ok: true } | { ok: false; message: string };

/**
 * How many one pass will attempt. A handful of courses finish in a week, so
 * this is only ever a guard against a backlog after a long outage.
 */
const BATCH_SIZE = 25;

const NOT_CONFIGURED =
	'Jira is not set up for this app right now, so the card cannot be updated. Tell a training admin.';
const NOT_FILED =
	'This request has not reached the TRK board yet, so there is no card to update. Tell a training admin.';

/** A request by id, for an action that was handed one by a form. */
export async function getEnrollment(db: Database, id: string): Promise<Enrollment | null> {
	const enrollment = await db.query.enrollmentsTable.findFirst({
		where: and(eq(enrollmentsTable.id, id), isNull(enrollmentsTable.withdrawnAt))
	});
	return enrollment ?? null;
}

/**
 * Run one step against the card. Everything Jira can throw becomes a message
 * for the person who pressed the button; the detail goes to the log.
 */
async function onCard(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	step: string,
	write: (config: JiraConfig, issueKey: string) => Promise<FlowResult | void>
): Promise<FlowResult> {
	const config = resolveJiraConfig(env);
	if (!config) return { ok: false, message: NOT_CONFIGURED };
	if (!enrollment.jiraIssueKey) return { ok: false, message: NOT_FILED };

	const issueKey = enrollment.jiraIssueKey;

	try {
		const result = await write(config, issueKey);
		if (result && !result.ok) return result;
	} catch (err) {
		const detail = err instanceof JiraError ? err.message : String(err);
		console.error(`[training-tools] ${step} failed`, issueKey, detail);
		return {
			ok: false,
			message: `Jira would not accept that for ${issueKey}, so nothing has changed. A training admin can see why on the card.`
		};
	}

	// The card has changed; bring our row into line now rather than waiting for
	// the webhook. If this read fails the webhook and the sweep still catch it,
	// so it is not a reason to tell the person their step failed.
	try {
		await syncEnrollmentIssue(db, env, issueKey);
		await applyPendingCertificationUpdates(db, env);
		await announceArrivals(db, env);
	} catch (err) {
		console.error(`[training-tools] ${step}: could not read ${issueKey} back`, err);
	}

	return { ok: true };
}

/** Who did it, on the card itself: every write here is made by one API account. */
async function note(config: JiraConfig, issueKey: string, text: string): Promise<void> {
	await commentOnIssue(config, issueKey, `${text} (through training.flyindycenter.com)`).catch(
		(err) => console.error('[training-tools] could not comment on', issueKey, err)
	);
}

/**
 * The teacher marks the training complete.
 *
 * Stamps `Training Completed`, then moves the card: to Rating Exam when the
 * course ends in one, otherwise straight to Audit. Where a course allows either
 * (`afterTrainingOptions()`), `to` is the teacher's choice and is required.
 */
export async function completeTraining(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string,
	to?: AfterTraining,
	now = new Date()
): Promise<FlowResult> {
	const options = afterTrainingOptions(enrollment.course);
	const chosen = to ?? (options.length === 1 ? options[0] : undefined);
	if (!chosen || !options.includes(chosen)) {
		return { ok: false, message: 'Choose whether this training ends in a rating exam.' };
	}

	const next = chosen === 'rating-exam' ? RATING_EXAM_STATUS : CERTIFICATION_UPDATE_STATUS;

	return onCard(db, env, enrollment, 'complete training', async (config, issueKey) => {
		await updateIssueFields(config, issueKey, {
			[JIRA_FIELDS.trainingCompleted]: toFacilityDate(now)
		});
		await transitionIssueToStatus(config, issueKey, next);
		await note(config, issueKey, `Training marked complete by ${by}.`);
	});
}

/**
 * An evaluator claims a rating exam: they become the card's RE Instructor.
 *
 * The card is read first, so two evaluators pressing the button moments apart
 * do not silently overwrite each other — the second is told who has it.
 */
export async function claimExam(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	examiner: { cid: string; initials: string | null; name: string }
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'claim exam', async (config, issueKey) => {
		const live = await fetchEnrollmentIssue(config, issueKey);
		const taken = live?.fields?.[RE_INSTRUCTOR_FIELD]?.value?.trim();
		if (taken) {
			// Not a failure of ours: let the read-back below show them who has it.
			await syncEnrollmentIssue(db, env, issueKey);
			return { ok: false, message: `This exam has already been claimed by ${taken}.` };
		}

		const option = await findSelectOption(config, issueKey, RE_INSTRUCTOR_FIELD, [
			examiner.initials,
			examiner.cid
		]);
		if (!option) {
			return {
				ok: false,
				message: `TRK's RE Instructor list has no option for ${examiner.initials ?? examiner.cid}. Ask a training admin to add it, then try again.`
			};
		}

		await updateIssueFields(config, issueKey, { [RE_INSTRUCTOR_FIELD]: { id: option.id } });
		await note(config, issueKey, `Rating exam claimed by ${examiner.name}.`);
	});
}

/**
 * The examiner marks the rating exam passed.
 *
 * Stamps `RE Completed` and moves the card to Certification Update, where the
 * certification is applied. A failed exam is `failExam()`.
 */
export async function completeExam(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string,
	now = new Date()
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'complete exam', async (config, issueKey) => {
		await updateIssueFields(config, issueKey, { [JIRA_FIELDS.reCompleted]: toFacilityDate(now) });
		await transitionIssueToStatus(config, issueKey, CERTIFICATION_UPDATE_STATUS);
		await note(config, issueKey, `Rating exam marked complete by ${by}.`);
	});
}

/**
 * The examiner records that the rating exam was not passed.
 *
 * The card moves to Needs CATP, where the TA decides what further training the
 * student needs and sends it back on the board. `Training Completed` is cleared,
 * because the training is not complete after all; the teacher dates it again
 * when it is.
 *
 * The move comes first and the date second — the reverse of the other steps —
 * so a refused move leaves the card exactly as it was, date and all. RE
 * Instructor stays on the card while it waits at Needs CATP, so the TA can see
 * who examined. It comes off when the card goes back to training — see
 * `clearReturnedExaminers()` — so the retake is claimed afresh.
 */
export async function failExam(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'fail exam', async (config, issueKey) => {
		await transitionIssueToStatus(config, issueKey, NEEDS_CATP_STATUS);
		await updateIssueFields(config, issueKey, { [JIRA_FIELDS.trainingCompleted]: null });
		await note(
			config,
			issueKey,
			`Rating exam marked not passed by ${by}; Training Completed cleared.`
		);
	});
}

/** The TA has reviewed it: the card moves to Completed, and the request closes. */
export async function completeAudit(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	by: string
): Promise<FlowResult> {
	return onCard(db, env, enrollment, 'complete audit', async (config, issueKey) => {
		await transitionIssueToStatus(config, issueKey, COMPLETED_STATUS);
		await note(config, issueKey, `Audit completed by ${by}.`);
	});
}

/** Requests waiting on the TA: at Certification Update, oldest first. */
export async function getAuditQueue(db: Database): Promise<Enrollment[]> {
	return db
		.select()
		.from(enrollmentsTable)
		.where(
			and(eq(enrollmentsTable.status, 'certification-update'), isNull(enrollmentsTable.withdrawnAt))
		)
		.orderBy(asc(enrollmentsTable.updatedAt));
}

export type AppliedCertification = {
	/** Null when nothing was decided: the card could not be checked, or is held. */
	change: CredentialChange | null;
	/** False when the card's date could not be written; the pass is retried. */
	stamped: boolean;
	/** What the card lacks. Anything here means nothing was granted. */
	missing: CompletionEvidence[];
};

/**
 * Record that a card is held, and tell the training admins — once per distinct
 * set of missing fields, not on every pass. If the notice cannot be sent the
 * hold is not recorded, so the next pass tries again.
 */
async function holdCertification(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	missing: CompletionEvidence[]
): Promise<void> {
	const hold = formatHold(missing);
	if (hold === enrollment.certificationHold) return;

	const base = env?.JIRA_BASE_URL?.trim().replace(/\/$/, '');
	const outcome = await notify(
		env,
		certificationHeldNotice(
			{
				name: enrollment.submittedName,
				cid: enrollment.cid,
				course: enrollment.course,
				teacher: enrollment.teacher,
				examiner: enrollment.reInstructor,
				issueKey: enrollment.jiraIssueKey,
				issueUrl:
					base && enrollment.jiraIssueKey ? `${base}/browse/${enrollment.jiraIssueKey}` : null
			},
			holdLabels(hold)
		)
	);
	if (outcome === 'failed') return;

	await db
		.update(enrollmentsTable)
		.set({ certificationHold: hold })
		.where(
			and(eq(enrollmentsTable.id, enrollment.id), isNull(enrollmentsTable.certificationAppliedAt))
		);
}

/**
 * Apply what a finished course earns, once.
 *
 * **Only if the card shows the course was finished** — `missingEvidence()`. The
 * card is read fresh from Jira first; one that lacks a field is held, the
 * training admins are told, and nothing is granted. It is checked again on every
 * pass, so filling the card in is all it takes to release it. With no card to
 * read (Jira not set up, or no issue key) nothing is granted either: a
 * certification is not handed out on what could not be checked.
 *
 * Then three writes, in an order that makes a retry safe:
 *
 * 1. **The credential.** Skipped when they already hold it, or hold a higher
 *    certification — `credentialChangeFor()` — so doing it twice changes nothing.
 * 2. **`Certificate Updated` on the card**, today's date. Stamped even when
 *    step 1 changed nothing: the certificate is up to date either way, and a
 *    Jira rule requiring the date before Done should not strand the card.
 * 3. **`certificationAppliedAt` on our row**, which is what stops this running
 *    again. Left null if step 2 failed, so the cron tries again.
 *
 * Granted with no actor: nobody set this by hand. The note says which course
 * and which card, and the TA's audit is the human check.
 */
export async function applyCertificationUpdate(
	db: Database,
	env: Partial<Env> | undefined,
	enrollment: Enrollment,
	now = new Date()
): Promise<AppliedCertification> {
	const config = resolveJiraConfig(env);
	if (!config || !enrollment.jiraIssueKey) return { change: null, stamped: false, missing: [] };

	// Throws when Jira cannot be reached: the pass logs it and tries again.
	const evidence = await fetchCardEvidence(config, enrollment.jiraIssueKey);
	const missing = missingEvidence(enrollment.course, evidence);
	if (missing.length > 0) {
		await holdCertification(db, env, enrollment, missing);
		return { change: null, stamped: false, missing };
	}

	const held = (await getHeldCredentials(db, enrollment.cid)).map((row) => row.code);
	const change = credentialChangeFor(enrollment.course, held);

	const courseName = findCourse(enrollment.course)?.name ?? enrollment.course;
	const grant = {
		basis: 'training' as const,
		note: `Completed ${courseName}${enrollment.jiraIssueKey ? ` (${enrollment.jiraIssueKey})` : ''}`
	};

	if (change.action === 'set-certification') {
		await setCertification(db, enrollment.cid, change.code, null, grant);
	} else if (change.action === 'grant-endorsement') {
		await grantCredential(db, { cid: enrollment.cid, code: change.code, ...grant });
	}

	let stamped = false;

	try {
		await updateIssueFields(config, enrollment.jiraIssueKey, {
			[JIRA_FIELDS.certificateUpdated]: toFacilityDate(now)
		});
		stamped = true;
	} catch (err) {
		console.error(
			'[training-tools] could not stamp Certificate Updated',
			enrollment.jiraIssueKey,
			err instanceof JiraError ? err.message : err
		);
	}

	if (stamped) {
		await db
			.update(enrollmentsTable)
			.set({ certificationAppliedAt: now, certificationHold: null, updatedAt: now })
			.where(
				and(eq(enrollmentsTable.id, enrollment.id), isNull(enrollmentsTable.certificationAppliedAt))
			);
	}

	return { change, stamped, missing: [] };
}

export type ExaminerPassResult = {
	/** Cards back in training that still named an examiner. */
	pending: number;
	/** Of those, how many have had it removed. */
	cleared: number;
};

/** Where a card is "back in training": anything before the exam. */
const BEFORE_THE_EXAM = ['waitlist', 'in-training'] as const;

/**
 * Remove the examiner from any card that is back in training.
 *
 * A failed exam waits at Needs CATP with its examiner still on the card; the TA
 * then sends it back into training on the board. An examiner on a card that is
 * in training would stop anyone else claiming the retake, and would be offered
 * the result buttons the moment the card reached Rating Exam again — so it
 * comes off.
 *
 * Like the certification pass, this keys on where the card **is**, not on the
 * move that put it there: however it got back, the examiner is removed. The
 * card is then read back, which clears our copy and ends the work — there is no
 * marker to keep, because "no examiner" is itself the finished state.
 */
export async function clearReturnedExaminers(
	db: Database,
	env: Partial<Env> | undefined
): Promise<ExaminerPassResult> {
	const config = resolveJiraConfig(env);
	if (!config) return { pending: 0, cleared: 0 };

	const pending = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				inArray(enrollmentsTable.status, [...BEFORE_THE_EXAM]),
				isNotNull(enrollmentsTable.reInstructor),
				isNotNull(enrollmentsTable.jiraIssueKey),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		.limit(BATCH_SIZE);

	let cleared = 0;

	for (const enrollment of pending) {
		const issueKey = enrollment.jiraIssueKey!;
		try {
			await updateIssueFields(config, issueKey, { [RE_INSTRUCTOR_FIELD]: null });
			await note(
				config,
				issueKey,
				`RE Instructor ${enrollment.reInstructor} removed: back in training.`
			);
			await syncEnrollmentIssue(db, env, issueKey);
			cleared += 1;
		} catch (err) {
			console.error(
				'[training-tools] could not remove the examiner from',
				issueKey,
				err instanceof JiraError ? err.message : err
			);
		}
	}

	return { pending: pending.length, cleared };
}

export type CertificationPassResult = {
	/** Requests at Certification Update that had not had theirs applied. */
	pending: number;
	/** Of those, how many are now done. */
	applied: number;
	/** Credentials actually changed — the rest already held theirs, or higher. */
	granted: number;
};

/**
 * Apply the certification for every request that has reached Certification
 * Update without one.
 *
 * Run by the cron after the status sweep, by the webhook after a delivery, and
 * straight after a teacher or examiner completes a step here — so the usual
 * wait is seconds, and the cron is what guarantees it happens at all.
 *
 * Selecting on the status rather than hooking the transition is deliberate: it
 * does not matter how the card got there. A card held for missing fields stays
 * selected, so it is applied on the first pass after someone fills them in. One
 * request failing is logged and the rest still run.
 */
export async function applyPendingCertificationUpdates(
	db: Database,
	env: Partial<Env> | undefined,
	now = new Date()
): Promise<CertificationPassResult> {
	// A held card that was moved back off Certification Update is no longer
	// held. Forgetting it here means a second mistaken arrival is reported again.
	await db
		.update(enrollmentsTable)
		.set({ certificationHold: null })
		.where(
			and(
				isNotNull(enrollmentsTable.certificationHold),
				ne(enrollmentsTable.status, 'certification-update')
			)
		);

	const pending = await db
		.select()
		.from(enrollmentsTable)
		.where(
			and(
				eq(enrollmentsTable.status, 'certification-update'),
				isNull(enrollmentsTable.certificationAppliedAt),
				isNull(enrollmentsTable.withdrawnAt)
			)
		)
		.orderBy(asc(enrollmentsTable.updatedAt))
		.limit(BATCH_SIZE);

	let applied = 0;
	let granted = 0;

	for (const enrollment of pending) {
		try {
			const result = await applyCertificationUpdate(db, env, enrollment, now);
			if (result.stamped) applied += 1;
			if (result.change && result.change.action !== 'none') granted += 1;
		} catch (err) {
			console.error('[training-tools] certification update failed', enrollment.id, err);
		}
	}

	return { pending: pending.length, applied, granted };
}

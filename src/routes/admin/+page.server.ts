import { fail } from '@sveltejs/kit';
import { isTrainingAdmin } from '$lib/utils/permissions';
import { requireRole } from '$lib/server/guards';
import {
	getAuditQueue,
	getUnfiledEnrollments,
	MAX_JIRA_SYNC_ATTEMPTS,
	retryFiling
} from '$lib/server/enrollments';
import { getRoomsPanel } from '$lib/server/discord/rooms';
import {
	clearRosterRelease,
	getPeople,
	readRosterHold,
	RosterHoldError,
	syncRoster,
	writeRosterRelease
} from '$lib/server/roster';
import { resolveJiraConfig } from '$lib/server/jira/client';
import { getJobHealth, JIRA_WEBHOOK_JOB } from '$lib/server/job-health';
import { scheduledJobs } from '$lib/server/scheduled';
import { CRON_INTERVAL_MINUTES, jobHealthState } from '$lib/job-health';
import { displayName } from '$lib/user';
import type { JobHealth } from '$lib/db/schema/job-health';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where a training admin finds out that something behind the scenes is not
 * working — before a student or a teacher has to tell them.
 *
 * Two things, both of which used to exist only as log lines:
 *
 * - **Requests that never reached the TRK board.** The cron retries a failed
 *   filing five times and then stops, on purpose (see `reconcile.ts`). A
 *   request past that point is invisible to staff until somebody looks here.
 * - **Whether the background work is running.** Each cron job and the Jira
 *   webhook records how its last run went (`job_health`).
 *
 * Training admins only (`training:admin`), checked in the load **and** the
 * action — a form action runs before any load.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireRole(locals, isTrainingAdmin);

	// Widened to the global Env, where app.d.ts declares the secrets: the
	// generated platform type only knows what `wrangler types` saw in .dev.vars.
	const env: Partial<Env> | undefined = platform?.env;

	const [unfiled, health, auditQueue, discord, hold] = await Promise.all([
		getUnfiledEnrollments(locals.db),
		getJobHealth(locals.db),
		getAuditQueue(locals.db),
		getRoomsPanel(locals.db),
		readRosterHold(locals.db)
	]);

	// Names for the held CIDs: the whole mirror, matched here, never
	// `IN (...)` over the list (D1 binds at most 100 parameters).
	const people = hold ? await getPeople(locals.db) : null;

	const now = new Date();

	const report = (
		name: string,
		description: string,
		row: JobHealth | undefined,
		scheduled: boolean
	) => ({
		name,
		description,
		state: jobHealthState(row, now, { scheduled }),
		lastRunAt: row?.lastRunAt ?? null,
		lastSuccessAt: row?.lastSuccessAt ?? null,
		lastFailureAt: row?.lastFailureAt ?? null,
		lastError: row?.lastError ?? null,
		failuresInARow: row?.failuresInARow ?? 0,
		lastSummary: row?.lastSummary ?? null,
		lastSummaryAt: row?.lastSummaryAt ?? null
	});

	const requests = unfiled.map((enrollment) => ({
		id: enrollment.id,
		cid: enrollment.cid,
		name: enrollment.submittedName,
		course: enrollment.course,
		createdAt: enrollment.createdAt,
		attempts: enrollment.jiraSyncAttempts,
		error: enrollment.jiraSyncError
	}));

	return {
		// The page words every "ago" against this, so the server and the browser
		// agree on them.
		now,
		// A roster change the sync is holding back for being too large (0039), or
		// null. `members` are the CIDs the page shows, and the ones Apply now posts.
		rosterHold:
			hold && people
				? {
						startedAt: hold.startedAt,
						appliesAt: hold.appliesAt,
						members: hold.cids.map((cid) => ({ cid, name: people.get(cid)?.name ?? cid }))
					}
				: null,
		// What the last Discord sync did to teacher roles and channels, or in a dry
		// run would do. Null until it has run.
		discord,
		// Finished courses waiting on the TA. The work is done on `/admin/audit`;
		// this is how many, so the page can point there.
		awaitingAudit: auditQueue.length,
		// Given up on: these need a person.
		stuck: requests.filter((request) => request.attempts >= MAX_JIRA_SYNC_ATTEMPTS),
		// Still inside the retry budget: the cron tries again every ten minutes.
		retrying: requests.filter((request) => request.attempts < MAX_JIRA_SYNC_ATTEMPTS),
		maxAttempts: MAX_JIRA_SYNC_ATTEMPTS,
		// Listed from the cron's own job list, so a job that has never run still
		// shows — as never having run. Only the names and descriptions are read;
		// nothing is executed.
		jobs: scheduledJobs(locals.db, env as Env).map((job) =>
			report(job.name, job.description, health.get(job.name), true)
		),
		webhook: report(
			JIRA_WEBHOOK_JOB,
			'Applies a status or teacher change within seconds of staff making it on the board.',
			health.get(JIRA_WEBHOOK_JOB),
			false
		),
		// Whether each is set — never the value.
		config: [
			{
				label: 'Jira credentials',
				set: resolveJiraConfig(env) !== null,
				missing: 'Requests are saved but cannot be filed on the TRK board, or read back from it.'
			},
			{
				label: 'Jira webhook secret',
				set: Boolean(env?.JIRA_WEBHOOK_SECRET?.trim()),
				missing: `Board changes are only picked up by the ${CRON_INTERVAL_MINUTES}-minute sweep.`
			},
			{
				label: 'VATUSA API key',
				set: Boolean(env?.VATUSA_API_KEY?.trim()),
				missing:
					'Written courses cannot be assigned on VATUSA from the waitlist, and passes are not picked up automatically.'
			},
			{
				label: 'Larry, for Discord notices',
				set: Boolean(platform?.env.LARRY),
				missing: 'Notices to Discord are logged and not sent.'
			}
		]
	};
};

export const actions: Actions = {
	/**
	 * Named, like every action in this app — a `default` beside a named action
	 * breaks every POST to the route. `actions.test.ts` pins it.
	 */
	retry: async ({ locals, request, platform }) => {
		const session = requireRole(locals, isTrainingAdmin);

		const data = await request.formData();
		const id = data.get('id');
		if (typeof id !== 'string' || !id) {
			return fail(400, { retryError: 'Could not work out which request to retry.' });
		}

		const outcome = await retryFiling(locals.db, platform?.env, id);

		console.log(
			'[training-tools] admin retried filing',
			JSON.stringify({
				enrollment: id,
				by: session.user.cid,
				name: displayName(session.user),
				outcome
			})
		);

		if (outcome === 'not-unfiled') {
			return fail(409, { retryError: 'That request is already on the board, or was withdrawn.' });
		}
		if (outcome === 'failed') {
			// The row now holds Jira's answer, and the page reloads to show it.
			return fail(502, {
				retryError:
					'Jira refused it again. The reason is shown on the request below; it is back in the queue and will be retried.'
			});
		}

		return { retried: true };
	},

	/**
	 * Lets a held roster removal (0039) apply now. Posts the CIDs the page
	 * showed; the sync applies it only if they cover everyone missing now.
	 */
	applyRosterHold: async ({ locals, request }) => {
		const session = requireRole(locals, isTrainingAdmin);

		const data = await request.formData();
		const shown = data.getAll('cid').filter((cid): cid is string => typeof cid === 'string');

		if (!(await readRosterHold(locals.db))) {
			return fail(409, { holdError: "There's no held roster change any more." });
		}

		await writeRosterRelease(locals.db, shown);

		try {
			const result = await syncRoster(locals.db);
			console.log(
				'[training-tools] admin applied a held roster change',
				JSON.stringify({ by: session.user.cid, name: displayName(session.user), ...result })
			);
			return {
				holdApplied: `Applied: ${result.removed} members removed from the roster.`
			};
		} catch (error) {
			if (error instanceof RosterHoldError) {
				// No count when the hold cleared and a new one opened since the check
				// above: the release didn't apply to it, so the list is out of date.
				const more = error.moreMissing ? `: ${error.moreMissing} more are missing` : '';
				return fail(409, {
					holdError: `The roster changed since you looked${more}. Check the list and apply again.`
				});
			}
			// The sync died before it read the release (VATUSA unreachable, say):
			// a release is good for one run, so do not leave it for a later one.
			await clearRosterRelease(locals.db);
			throw error;
		}
	}
};

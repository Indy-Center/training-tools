import type { Database } from '$lib/server/db';
import { syncRoster } from '$lib/server/roster';
import { grantArrivalCertifications } from '$lib/server/certifications';
import {
	importBoardIssues,
	reconcileEnrollments,
	sweepEnrollmentStatuses
} from '$lib/server/enrollments';

/**
 * What the 15-minute cron does, in order.
 *
 * Each job is run and logged by `runScheduledJobs()`, so adding one is adding
 * an entry here — not another copy of the try/catch around it.
 */
export type ScheduledJob = {
	/** Appears in every log line the job produces. */
	name: string;
	/**
	 * Do the work and return what is worth logging, or null to stay quiet —
	 * most runs of most jobs change nothing, and a log line every fifteen
	 * minutes saying so buries the ones that matter.
	 */
	run: () => Promise<object | null>;
};

/**
 * The jobs, in the order they run.
 *
 * Every job is guarded separately: VATUSA being down must not stop enrollments
 * reaching the staff board, Jira being down must not stop the roster
 * refreshing, and VATSIM being down must not stop either. They share a
 * schedule, not a fate.
 *
 * Order matters in three places, each noted below.
 */
export function scheduledJobs(db: Database, env: Env): ScheduledJob[] {
	return [
		{
			name: 'roster sync',
			run: async () => {
				const result = await syncRoster(db);
				// Counts only. The CID lists the sync also returns are for the
				// certification job; logging them would be 157 lines of noise on a
				// first population. Always logged: it is the heartbeat.
				return {
					fetched: result.fetched,
					added: result.added,
					restored: result.restored,
					removed: result.removed
				};
			}
		},
		{
			// After the roster sync, which it reads: a brand-new arrival is certified
			// in the same run rather than waiting another fifteen minutes.
			name: 'arrival certifications',
			run: async () => {
				const result = await grantArrivalCertifications(db);
				return result.pending > 0 ? result : null;
			}
		},
		{
			// Before the reconcile. An unfiled row whose issue does exist — a filing
			// whose key write-back failed — is adopted here, rather than filed a
			// second time there.
			name: 'jira board import',
			run: async () => {
				const result = await importBoardIssues(db, env);
				const changed = result.imported + result.adopted + result.skipped > 0;
				return changed || !result.complete ? result : null;
			}
		},
		{
			name: 'enrollment reconcile',
			run: async () => {
				const result = await reconcileEnrollments(db, env);
				return result.pending > 0 ? result : null;
			}
		},
		{
			// After the reconcile, so an issue filed a moment ago can be read back in
			// the same run. The webhook usually gets there first; this is what makes
			// sure nothing is missed when it does not.
			name: 'enrollment status sweep',
			run: async () => {
				const result = await sweepEnrollmentStatuses(db, env);
				return result.updated > 0 || result.full || !result.complete ? result : null;
			}
		}
	];
}

/**
 * Run every job, whatever happens to the ones before it.
 *
 * A failure is logged and the next job runs anyway. Once all have run, the
 * first failure is rethrown so the invocation shows as failed in Workers
 * observability — a silent success would hide it.
 */
export async function runScheduledJobs(jobs: readonly ScheduledJob[]): Promise<void> {
	let failure: unknown = null;

	for (const job of jobs) {
		try {
			const summary = await job.run();
			if (summary) console.log(`[training-tools] ${job.name}`, JSON.stringify(summary));
		} catch (err) {
			// Surfaced in `wrangler tail`. Every job leaves its state as it was on
			// failure (the roster mirror, the sweep cursor), so the next run retries.
			console.error(`[training-tools] ${job.name} failed`, err);
			failure ??= err;
		}
	}

	if (failure) throw failure;
}

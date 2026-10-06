import type { Database } from '$lib/server/db';
import { syncRoster } from '$lib/server/roster';
import { grantArrivalCertifications } from '$lib/server/certifications';
import { syncTeacherRooms } from '$lib/server/discord/rooms';
import { checkTeacherDropdowns, syncTeacherRoster } from '$lib/server/teachers';
import {
	announceArrivals,
	applyPendingCertificationUpdates,
	clearReturnedExaminers,
	importBoardIssues,
	reconcileEnrollments,
	sweepEnrollmentStatuses
} from '$lib/server/enrollments';
import type { JobRun } from '$lib/server/job-health';

/**
 * What the 15-minute cron does, in order.
 *
 * Each job is run, logged and recorded by `runScheduledJobs()`, so adding one
 * is adding an entry here — not another copy of the try/catch around it.
 */
export type ScheduledJob = {
	/** Appears in every log line the job produces, and keys its row in `job_health`. */
	name: string;
	/** One line on what it does, for `/admin`. */
	description: string;
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
 * Order matters in eight places, each noted below.
 */
export function scheduledJobs(db: Database, env: Env): ScheduledJob[] {
	return [
		{
			name: 'roster sync',
			description: 'Refreshes the mirror of the VATUSA roster.',
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
			description: 'Grants new arrivals the certification their rating entitles them to.',
			run: async () => {
				const result = await grantArrivalCertifications(db, env);
				return result.pending > 0 ? result : null;
			}
		},
		{
			// After the roster sync, which it reads: someone given INS or MTR on
			// VATUSA is on the teacher roster in the same run.
			name: 'teacher roster sync',
			description: 'Keeps the teacher roster and qualification rules in step with ZID INS and MTR.',
			run: async () => {
				const result = await syncTeacherRoster(db, env);
				const { teachers, ...changes } = result;
				return Object.values(changes).some((count) => count > 0) ? result : null;
			}
		},
		{
			// After the teacher roster sync, so the dropdowns are compared with
			// who is a teacher (and an evaluator) as of this run.
			name: 'jira teacher dropdowns',
			description: "Compares TRK's Teacher and RE Instructor options with the teacher roster.",
			run: async () => {
				const result = await checkTeacherDropdowns(db, env);
				if (!result) return null;
				const drift = [result.teacher, result.reInstructor].some(
					(d) => d.add.length + d.remove.length + d.rename.length > 0
				);
				return drift ? result : null;
			}
		},
		{
			// Before the reconcile. An unfiled row whose issue does exist — a filing
			// whose key write-back failed — is adopted here, rather than filed a
			// second time there.
			name: 'jira board import',
			description: 'Creates requests here for TRK issues filed by hand on the board.',
			run: async () => {
				const result = await importBoardIssues(db, env);
				const changed = result.imported + result.adopted + result.skipped > 0;
				return changed || !result.complete ? result : null;
			}
		},
		{
			name: 'enrollment reconcile',
			description: 'Files requests that have not reached the TRK board yet.',
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
			description: 'Reads status, Teacher and RE Instructor back from TRK.',
			run: async () => {
				const result = await sweepEnrollmentStatuses(db, env);
				return result.updated > 0 || result.full || !result.complete ? result : null;
			}
		},
		{
			// After the sweep, which is what notices a card that was moved to
			// Certification Update by hand: it is certified in the same run.
			// After the sweep, which is what notices a card the TA has sent back into
			// training: its examiner comes off in the same run.
			name: 'examiner cleanup',
			description: 'Removes the examiner from cards sent back into training after a failed exam.',
			run: async () => {
				const result = await clearReturnedExaminers(db, env);
				return result.pending > 0 ? result : null;
			}
		},
		{
			name: 'certification updates',
			description: 'Applies the certification a finished course earns, and dates the card.',
			run: async () => {
				const result = await applyPendingCertificationUpdates(db, env);
				return result.pending > 0 ? result : null;
			}
		},
		{
			// After the sweep, which is what says who is with which teacher now, and
			// before the announcements: a student told about their teacher should
			// already be able to see the channel.
			name: 'discord teacher rooms',
			description: "Keeps each teacher's Discord role and channel in step with their students.",
			run: async () => {
				const result = await syncTeacherRooms(db, env);
				if (!result) return null;
				const changed =
					result.created + result.added + result.removed + result.deleted + result.initialsWritten;
				return changed > 0 || result.errors > 0 ? result : null;
			}
		},
		{
			// Last, after everything that moves a request on: a card certified a moment
			// ago is announced to the TA in the same run.
			name: 'announcements',
			description:
				'Tells evaluators about exams to claim, and the TA about audits and failed exams.',
			run: async () => {
				const result = await announceArrivals(db, env);
				return result.announced > 0 ? result : null;
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
 *
 * `record` is told how each job went, which is what `/admin` reads back. It is
 * bookkeeping: if it throws, that is logged and nothing else changes — it must
 * never be why a job counts as failed, or why the next one does not run.
 */
export async function runScheduledJobs(
	jobs: readonly ScheduledJob[],
	record: (run: JobRun) => Promise<void> = async () => {}
): Promise<void> {
	let failure: unknown = null;

	for (const job of jobs) {
		let run: JobRun;

		try {
			const summary = await job.run();
			if (summary) console.log(`[training-tools] ${job.name}`, JSON.stringify(summary));
			run = { name: job.name, at: new Date(), ok: true, summary };
		} catch (err) {
			// Surfaced in `wrangler tail`. Every job leaves its state as it was on
			// failure (the roster mirror, the sweep cursor), so the next run retries.
			console.error(`[training-tools] ${job.name} failed`, err);
			failure ??= err;
			run = { name: job.name, at: new Date(), ok: false, error: err };
		}

		await record(run).catch((err) =>
			console.error(`[training-tools] could not record ${job.name}`, err)
		);
	}

	if (failure) throw failure;
}

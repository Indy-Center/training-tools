import { WorkerEntrypoint } from 'cloudflare:workers';
import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { runScheduledJobs, scheduledJobs } from '$lib/server/scheduled';
import { recordAndAlert } from '$lib/server/job-health';
import { getCurrentQualifications } from '$lib/server/teachers';
import { coursesTaught } from '$lib/teachers';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request. The scheduled handler runs the jobs listed
 * in `$lib/server/scheduled.ts` — the roster mirror, arrival certifications,
 * and keeping enrollments and the TRK board in step. This wrapper is why the
 * app uses @indy-center/adapter-cloudflare rather than upstream — upstream
 * overwrites a custom `main` on each build.
 *
 * Other Workers on the account call `Teaching` below over a service binding.
 */
export default {
	fetch: sv.fetch,

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const db = drizzle(env.DB);
		ctx.waitUntil(runScheduledJobs(scheduledJobs(db, env), (run) => recordAndAlert(db, env, run)));
	}
} satisfies ExportedHandler<Env>;

/**
 * Read-only RPC for other Workers on the account, reached through a service
 * binding with `"entrypoint": "Teaching"`. A service binding is not
 * internet-reachable, so the binding is the access control: only Workers the
 * account's owners bind here can call it. indy-library is the one caller, to
 * decide whose teacher notes to show.
 *
 * It answers who may teach what and nothing else; Training Admin and lead
 * instructors come from identity, not from here (courseware decision 0039).
 */
export class Teaching extends WorkerEntrypoint<Env> {
	/** Course and endorsement codes the CID holds a current teacher qualification on. */
	async coursesTaught(cid: string): Promise<string[]> {
		if (typeof cid !== 'string' || !/^\d+$/.test(cid)) return [];
		return coursesTaught(await getCurrentQualifications(drizzle(this.env.DB), cid));
	}
}

import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { runScheduledJobs, scheduledJobs } from '$lib/server/scheduled';
import { recordAndAlert } from '$lib/server/job-health';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request. The scheduled handler runs the jobs listed
 * in `$lib/server/scheduled.ts` — the roster mirror, arrival certifications,
 * and keeping enrollments and the TRK board in step. This wrapper is why the
 * app uses @indy-center/adapter-cloudflare rather than upstream — upstream
 * overwrites a custom `main` on each build.
 *
 * When the RPC surface lands, a `WorkerEntrypoint` class gets exported from
 * here alongside these handlers; nothing else has to move.
 */
export default {
	fetch: sv.fetch,

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const db = drizzle(env.DB);
		ctx.waitUntil(runScheduledJobs(scheduledJobs(db, env), (run) => recordAndAlert(db, env, run)));
	}
} satisfies ExportedHandler<Env>;

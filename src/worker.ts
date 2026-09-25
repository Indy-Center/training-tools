import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { runScheduledJobs, scheduledJobs } from '$lib/server/scheduled';

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
		ctx.waitUntil(runScheduledJobs(scheduledJobs(drizzle(env.DB), env)));
	}
} satisfies ExportedHandler<Env>;

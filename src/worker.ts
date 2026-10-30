import { WorkerEntrypoint } from 'cloudflare:workers';
import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { runScheduledJobs, scheduledJobs } from '$lib/server/scheduled';
import { recordAndAlert } from '$lib/server/job-health';
import { readRoster } from '$lib/server/roster';
import type { Roster, TrainingRpc as Contract } from '$rpc';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request. The scheduled handler runs the jobs listed
 * in `$lib/server/scheduled.ts` — the roster mirror, arrival certifications,
 * and keeping enrollments and the TRK board in step. This wrapper is why the
 * app uses @indy-center/adapter-cloudflare rather than upstream — upstream
 * overwrites a custom `main` on each build.
 */
export default {
	fetch: sv.fetch,

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const db = drizzle(env.DB);
		ctx.waitUntil(runScheduledJobs(scheduledJobs(db, env), (run) => recordAndAlert(db, env, run)));
	}
} satisfies ExportedHandler<Env>;

/**
 * The read-only RPC other Workers bind to (`entrypoint: "TrainingRpc"`).
 *
 * A thin delegate, kept out of tests: each method hands the database to a
 * function that is tested. Its contract is `rpc/src/index.ts`, the source of
 * the npm package callers type their binding with; `src/worker.test.ts` fails
 * the type check if this class and it differ. A breaking change goes in a new
 * class, `TrainingRpcV2`, beside this one.
 */
export class TrainingRpc extends WorkerEntrypoint<Env> implements Contract {
	getRoster(): Promise<Roster> {
		return readRoster(drizzle(this.env.DB));
	}
}

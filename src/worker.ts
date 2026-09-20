import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { syncRoster } from '$lib/server/roster';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request; the scheduled handler keeps the VATUSA
 * roster mirror fresh. This wrapper is why the app uses
 * @indy-center/adapter-cloudflare rather than upstream — upstream overwrites a
 * custom `main` on each build.
 *
 * When the RPC surface lands, a `WorkerEntrypoint` class gets exported from
 * here alongside these handlers; nothing else has to move.
 */
export default {
	fetch: sv.fetch,

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			(async () => {
				try {
					const result = await syncRoster(drizzle(env.DB));
					console.log('[training-tools] roster sync', JSON.stringify(result));
				} catch (err) {
					// Surfaced in `wrangler tail` and Workers observability. The sync
					// throws rather than half-applying, so the previous mirror stands.
					console.error('[training-tools] roster sync failed', err);
					throw err;
				}
			})()
		);
	}
} satisfies ExportedHandler<Env>;

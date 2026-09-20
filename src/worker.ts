import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { syncRoster } from '$lib/server/roster';
import { reconcileEnrollments } from '$lib/server/enrollments';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request; the scheduled handler keeps the VATUSA
 * roster mirror fresh and files any enrollments that never reached Jira. This
 * wrapper is why the app uses @indy-center/adapter-cloudflare rather than
 * upstream — upstream overwrites a custom `main` on each build.
 *
 * When the RPC surface lands, a `WorkerEntrypoint` class gets exported from
 * here alongside these handlers; nothing else has to move.
 */
export default {
	fetch: sv.fetch,

	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			(async () => {
				const db = drizzle(env.DB);

				// Guarded separately: VATUSA being down must not stop enrollments
				// reaching the staff board, and Jira being down must not stop the
				// roster refreshing. They share a schedule, not a fate.
				let failure: unknown = null;

				try {
					const result = await syncRoster(db);
					console.log('[training-tools] roster sync', JSON.stringify(result));
				} catch (err) {
					// Surfaced in `wrangler tail` and Workers observability. The sync
					// throws rather than half-applying, so the previous mirror stands.
					console.error('[training-tools] roster sync failed', err);
					failure = err;
				}

				try {
					const result = await reconcileEnrollments(db, env);
					// Quiet when there is nothing waiting, which is the normal case.
					if (result.pending > 0) {
						console.log('[training-tools] enrollment reconcile', JSON.stringify(result));
					}
				} catch (err) {
					console.error('[training-tools] enrollment reconcile failed', err);
					failure ??= err;
				}

				if (failure) throw failure;
			})()
		);
	}
} satisfies ExportedHandler<Env>;

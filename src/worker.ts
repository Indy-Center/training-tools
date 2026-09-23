import sv from '../.svelte-kit/cloudflare/_worker.js';
import { drizzle } from '$lib/server/db';
import { syncRoster } from '$lib/server/roster';
import { reconcileEnrollments, sweepEnrollmentStatuses } from '$lib/server/enrollments';
import { grantArrivalCertifications } from '$lib/server/certifications';

/**
 * Custom worker entry.
 *
 * SvelteKit handles every request; the scheduled handler keeps the VATUSA
 * roster mirror fresh, files any enrollments that never reached Jira, and reads
 * their TRK status back. This
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
				// reaching the staff board, Jira being down must not stop the roster
				// refreshing, and VATSIM being down must not stop either. They share a
				// schedule, not a fate.
				//
				// Order matters once: the certification pass reads roster rows the sync
				// has just written, so a brand-new arrival is certified in the same run
				// rather than waiting another fifteen minutes.
				let failure: unknown = null;

				try {
					const result = await syncRoster(db);
					// Counts only. The CID lists the sync also returns are for the
					// certification job; logging them would be 157 lines of noise on a
					// first population.
					console.log(
						'[training-tools] roster sync',
						JSON.stringify({
							fetched: result.fetched,
							added: result.added,
							restored: result.restored,
							removed: result.removed
						})
					);
				} catch (err) {
					// Surfaced in `wrangler tail` and Workers observability. The sync
					// throws rather than half-applying, so the previous mirror stands.
					console.error('[training-tools] roster sync failed', err);
					failure = err;
				}

				try {
					const result = await grantArrivalCertifications(db);
					// Quiet when there is nobody new to look at, which is the normal case.
					if (result.pending > 0) {
						console.log('[training-tools] arrival certifications', JSON.stringify(result));
					}
				} catch (err) {
					// VATSIM being unreachable must not stop the roster refreshing or
					// enrollments reaching the board. Unstamped members are simply
					// re-examined on the next tick.
					console.error('[training-tools] arrival certifications failed', err);
					failure ??= err;
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

				// After the reconcile, so an issue filed a moment ago can be read back in
				// the same run. The webhook usually gets there first; this is what makes
				// sure nothing is missed when it does not.
				try {
					const result = await sweepEnrollmentStatuses(db, env);
					if (result.updated > 0 || result.full || !result.complete) {
						console.log('[training-tools] enrollment status sweep', JSON.stringify(result));
					}
				} catch (err) {
					// The cursor did not move, so the next run re-reads the same window.
					console.error('[training-tools] enrollment status sweep failed', err);
					failure ??= err;
				}

				if (failure) throw failure;
			})()
		);
	}
} satisfies ExportedHandler<Env>;

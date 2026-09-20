import type { IdentityBinding, SessionContext } from '@indy-center/identity';
import type { Database } from '$lib/server/db';

declare global {
	/**
	 * Secrets. `wrangler types` generates Env from the `vars` block in
	 * wrangler.jsonc and from a local `.dev.vars`, so secrets are invisible to it
	 * on a clean checkout — and CI has no `.dev.vars` at all. Declaring them here
	 * keeps `npm run check` honest in CI as well as locally.
	 *
	 * Optional, because the app runs without them: enrollments save to D1 and the
	 * cron files them once credentials exist.
	 */
	interface Env {
		JIRA_USER_EMAIL?: string;
		JIRA_API_TOKEN?: string;
	}

	namespace App {
		interface Locals {
			db: Database;
			session: SessionContext | null;
		}

		interface Platform {
			// `wrangler types` only knows IDENTITY as a bare Fetcher, so we replace it
			// with the typed RPC binding. Optional, because `vite dev` may run without
			// a live binding — see src/lib/server/identity.ts.
			env: Omit<Cloudflare.Env, 'IDENTITY'> & { IDENTITY?: IdentityBinding };
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};

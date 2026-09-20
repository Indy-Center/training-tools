import type { IdentityBinding, SessionContext } from '@indy-center/identity';
import type { Database } from '$lib/server/db';

declare global {
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

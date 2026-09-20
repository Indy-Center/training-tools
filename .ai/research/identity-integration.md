# Identity integration — how it actually works

**Verified on 2026-09-20** against `Indy-Center/identity` @ main,
`Indy-Center/charts` @ main, `@indy-center/identity@1.0.0` on npm, and
`tech.flyindycenter.com/patterns/auth/`.

## The misconception to clear first

`auth.flyindycenter.com` looks like an identity provider, so the natural move is
to reach for an OIDC client library. **Do not.** Identity is a Cloudflare Worker
that is itself an OAuth _client_ of VATSIM Connect. It does not implement OAuth
or OIDC for its own consumers.

There is no `/oauth/authorize`, no `/oauth/token`, no `/userinfo`, no
`/.well-known/openid-configuration`, no JWKS, no token introspection, no
end-session endpoint. There are no client ids, no client secrets, no scopes and
no redirect-URI registration.

Its complete HTTP surface:

| Route                              | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `GET /healthz`                     | `{"ok": true}`                             |
| `GET /login?return_url=`           | starts VATSIM Connect OAuth                |
| `GET /login/callback?code=&state=` | mints the session, redirects back          |
| `GET /logout?return_url=`          | deletes the session row, clears the cookie |

## The actual contract

Two pieces, and that's all:

1. **Cookie `fic_session`** — opaque random base32 token (not a JWT), HttpOnly,
   SameSite=Lax, scoped to `.flyindycenter.com`, 30-day expiry that slides once
   under 15 days remaining. Identity stores only its SHA-256 hash.
2. **A Cloudflare RPC service binding** to the `identity` Worker, exposing one
   typed method:

```ts
export interface IdentityRpc extends Rpc.WorkerEntrypointBranded {
	getSessionContext(token: string): Promise<SessionContext | null>;
}
```

```ts
export type SessionContext = {
	user: User;
	roles: string[];
	sessionExpiresAt: Date; // a real Date — structured clone, not JSON
	activeSession: OnlineController | null; // live vNAS position, 15s TTL upstream
	activeFlightPlan: FlightPlan | null;
};
```

Consumer config is two lines and **zero secrets**:

```jsonc
"vars": { "PUBLIC_IDENTITY_URL": "https://auth.flyindycenter.com" },
"services": [{ "binding": "IDENTITY", "service": "identity" }]
```

## Field shapes — more optional than you'd expect

From `@indy-center/identity@1.0.0`'s own `.d.ts`, not from documentation:

```ts
type User = {
	id: string;
	cid: string;
	email: string;
	isActive: boolean;
	vatsimData: VatsimProfile;
	attributes: Attributes;
	createdAt: number;
	updatedAt: number;
};
```

`VatsimProfile.vatsim` is optional, `.rating` is optional, and `.short` inside
it is optional. `personal.name_full`, `name_first` and `name_last` are all
optional too — only `personal.email` and `cid` are guaranteed. Anything
rendering a name or rating needs the full optional chain; that's what
`src/lib/user.ts` is for.

`Attributes` carries `preferredName`, `pronouns`, `operatingInitials`,
`discordId` (all optional) plus an open index signature. **`discordId` is where
DEV-110's Discord ID comes from** — no separate lookup needed.

## `return_url` rules

Both `/login` and `/logout` require `return_url`, and reject anything else with
a 400:

| Accepted                                                                                          | When                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `https://flyindycenter.com/…` and one level of subdomain (`https://training.flyindycenter.com/…`) | always                                                 |
| `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`                                      | only when identity runs with `COOKIE_DOMAIN=localhost` |

`training.flyindycenter.com` already qualifies — no identity-side change was
needed to onboard this app.

**Must be absolute.** A bare path like `/dashboard` is rejected. Do not build it
from `window.location.origin`, which is `undefined` during SSR and yields
exactly that failure before hydration.

## Roles

Free-form strings in an unconstrained `text` column. No enum, no permissions
model, no typed query API — `getSessionContext` already returns `roles`, so most
consumers never need one. Administration methods exist on the Worker class but
are intentionally absent from the published `IdentityRpc` interface.

See [`../decisions/0005-namespaced-role-vocabulary.md`](../decisions/0005-namespaced-role-vocabulary.md).

## Failure mode to know about

`getSessionContext` returns `null` — never throws — when the cookie is missing,
the binding is unconfigured, the call throws, or the token is unknown/expired.
Charts does this deliberately, and we copied it: identity being mid-deploy
should degrade to "logged out", not a 500.

The cost is that **a misconfigured binding is indistinguishable from being
signed out**. If local sign-in "does nothing", suspect the binding before
suspecting the cookie. `src/lib/server/identity.ts` logs a warning when the
binding is absent, specifically to make that case visible.

## Local development

Identity must run on **port 8787** — the VATSIM Connect redirect URI is
hardcoded to it. It needs `COOKIE_DOMAIN=localhost`, which flips three things at
once: cookies work on localhost, loopback `return_url`s are accepted, and dev
fixtures become available.

**Verified 2026-09-20: `vite dev` does join Wrangler's dev registry**, so the
`IDENTITY` binding resolves without needing `wrangler dev`. With identity not
running, the binding is present but the call fails with
`Worker "identity" not found. Make sure it is running locally.` — which is a
useful signal, because it distinguishes "binding missing" from "identity down".

`getPlatformProxy()` reads `.dev.vars` and it overrides `wrangler.jsonc` `vars`,
which is how `PUBLIC_IDENTITY_URL` gets pointed at localhost. It is read **at
startup only** — create the file before `npm run dev` and restart after editing.
Without it, sign-in redirects to production identity, which rejects a localhost
`return_url` with a 400.

## Sources

- <https://github.com/Indy-Center/identity> — `src/auth/routes.ts`, `src/client/api.ts`, `src/sessions/domain.ts`, `wrangler.jsonc`
- <https://github.com/Indy-Center/charts> — `src/lib/server/identity.ts`, `src/hooks.server.ts`, `src/app.d.ts`
- <https://tech.flyindycenter.com/patterns/auth/>
- `node_modules/@indy-center/identity/dist/*.d.ts`

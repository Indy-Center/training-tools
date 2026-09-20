# training-tools

Controller training management for Indy Center, at
[training.flyindycenter.com](https://training.flyindycenter.com). Students enroll,
track their progress toward certification, and see where they are on the
waitlist; instructors and training staff manage that process.

Part of [DEV-99 — Controller Training Platform](https://zidartcc.atlassian.net/browse/DEV-99).

## HTTP surface

| Route            | Auth     | Purpose                                                    |
| ---------------- | -------- | ---------------------------------------------------------- |
| `GET /`          | public   | Landing page                                               |
| `GET /stats`     | public   | Waitlist numbers and expected wait (placeholder — DEV-111) |
| `GET /dashboard` | required | The signed-in user's training overview                     |

There are deliberately **no `/login`, `/logout` or `/callback` routes**. Identity
owns the session cookie and its whole lifecycle; this app links out to
`auth.flyindycenter.com` for both. See
[`.ai/decisions/0001-identity-via-service-binding.md`](.ai/decisions/0001-identity-via-service-binding.md).

Everything not on the public allowlist redirects to identity's `/login`. The
gate lives in `src/hooks.server.ts`, not in a layout load —
[why](.ai/decisions/0004-gate-in-handle-not-layout.md).

## Bindings

| Binding    | Type                   | What it's for                                                |
| ---------- | ---------------------- | ------------------------------------------------------------ |
| `IDENTITY` | Service (→ `identity`) | Validates the `fic_session` cookie via `getSessionContext()` |
| `DB`       | D1 (`training-db`)     | Application data. No tables yet — DEV-108 adds the first     |
| `ASSETS`   | Static assets          | SvelteKit client build                                       |

| Var                   | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `PUBLIC_IDENTITY_URL` | `https://auth.flyindycenter.com` (override locally in `.dev.vars`) |

**No secrets.** Service bindings aren't internet-reachable, so auth needs no
client id, client secret or signing key.

## Project layout

```
src/
├── hooks.server.ts            db client + session load + the route gate
├── app.d.ts                   App.Locals / App.Platform (IDENTITY is optional here on purpose)
├── lib/
│   ├── identity-links.ts      login/logout URL builders (client-safe)
│   ├── user.ts                display name + rating helpers over identity's very optional types
│   ├── components/            Panel, Badge, PageHero, Logo, ActionButton, header/
│   ├── db/schema/             drizzle tables (empty until DEV-108)
│   ├── server/
│   │   ├── identity.ts        reads fic_session, calls the IDENTITY binding
│   │   └── db/                drizzle client factory
│   └── utils/permissions.ts   training:* role vocabulary
└── routes/                    plain nested folders, no route groups
.ai/                           decisions, research and session notes — start with .ai/README.md
```

## Local development

Requires Node 22 and the identity Worker running alongside. Clone it as a
sibling of this repo:

```
indy-center/
├── identity/
└── training-tools/
```

**1. Start identity on port 8787** (it must be 8787 — VATSIM Connect's redirect
URI is hardcoded to it):

```bash
cd ../identity
npm install
cp .dev.vars.example .dev.vars   # CONNECT_CLIENT_ID / CONNECT_CLIENT_SECRET come from a maintainer
npm run db:migrate:local
npm run dev
curl http://localhost:8787/healthz   # => {"ok":true}
```

`.dev.vars` must have `COOKIE_DOMAIN=localhost`. That single setting is what
makes cookies work on localhost _and_ makes identity accept loopback
`return_url`s — without it, sign-in fails with a 400.

**2. Start this app:**

```bash
npm install
cp .dev.vars.example .dev.vars   # points PUBLIC_IDENTITY_URL at localhost:8787
npm run dev                      # http://localhost:5173
```

> **If you appear permanently signed out locally**, the `IDENTITY` service
> binding probably isn't resolving. Service bindings are wired through
> Wrangler's dev registry, which `vite dev` may not join. Auth degrades silently
> to "logged out" by design, so this looks like a broken login rather than a
> config problem — check the server console for the
> `IDENTITY binding unavailable` warning.
>
> Workaround: use `npm run preview`, which builds and serves through a real
> `wrangler dev` and definitely joins the registry.

Signed-out pages (`/`, `/stats`) work without identity running at all.

## Database

D1 + drizzle. **drizzle-kit generates the SQL; wrangler applies it** — never
`drizzle-kit migrate` or `push`.

```bash
# after editing src/lib/db/schema/*.ts
npm run db:generate        # writes SQL into drizzle/migrations/
npm run db:migrate:local   # applies to local state
```

CI applies `--remote` before every deploy. To reset local state:
`rm -rf .wrangler/state/v3/d1 && npm run db:migrate:local`.

**Never run `wrangler d1 delete` or `wrangler d1 create` to fix local state** —
both operate on production.

## Tests

```bash
npm test
```

CI runs exactly this sequence; run it before opening a PR:

```bash
npm run format:check && npm run check && npm run build && npm test
```

## Deployment

Push to `main` deploys automatically: CI applies D1 migrations, then
`wrangler deploy`. Needs repo secret `CLOUDFLARE_WORKERS_API_KEY`.

Manual deploy (requires access to the `IndyCenter` Cloudflare account — check
with `npx wrangler whoami`):

```bash
npm run deploy
```

After changing bindings in `wrangler.jsonc`, regenerate types:

```bash
npm run cf-typegen
```

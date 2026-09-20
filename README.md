# training-tools

Controller training management for Indy Center, at
[training.flyindycenter.com](https://training.flyindycenter.com). Students enroll,
track their progress toward certification, and see where they are on the
waitlist; instructors and training staff manage that process.

Part of [DEV-99 — Controller Training Platform](https://zidartcc.atlassian.net/browse/DEV-99).

## HTTP surface

| Route            | Auth     | Purpose                                                    |
| ---------------- | -------- | ---------------------------------------------------------- |
| `GET /`          | public   | Sign-in CTA signed out; the DEV-112 flow signed in         |
| `GET /enroll`    | required | Enrollment request (placeholder — DEV-108)                 |
| `GET /stats`     | required | Waitlist numbers and expected wait (placeholder — DEV-111) |
| `GET /dashboard` | required | The signed-in user's training overview                     |

`/` is the **only** public path, and only so it can render the sign-in CTA.

Signed in, `/` sorts the member into one of four branches based on the roster
mirror and their rating:

| Branch                   | Who                                        |
| ------------------------ | ------------------------------------------ |
| Enrollment entry point   | on the ZID roster as a **home** controller |
| Visiting-controller copy | on the roster as a **visiting** controller |
| Transfer-or-visit copy   | not rostered, holds S1+                    |
| Become-a-controller copy | not rostered, OBS or unrated               |

Roster membership is checked **before** rating — the roster contains OBS
controllers, so rating-first would misroute people already training with us.

## Scheduled work

| Trigger        | Does                                                                |
| -------------- | ------------------------------------------------------------------- |
| `*/15 * * * *` | Refreshes the VATUSA roster mirror (`src/worker.ts` → `syncRoster`) |

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
| `DB`       | D1 (`training-db`)     | Roster mirror, and the training data this app owns           |
| `ASSETS`   | Static assets          | SvelteKit client build                                       |

| Var                   | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `PUBLIC_IDENTITY_URL` | `https://auth.flyindycenter.com` (override locally in `.dev.vars`) |

**No secrets.** Service bindings aren't internet-reachable, so auth needs no
client id, client secret or signing key.

## Project layout

```
src/
├── worker.ts                  worker entry: SvelteKit fetch + the roster cron
├── hooks.server.ts            db client + session load + the route gate
├── app.d.ts                   App.Locals / App.Platform (IDENTITY is optional here on purpose)
├── lib/
│   ├── config.ts              facility id, VATSIM rating thresholds
│   ├── identity-links.ts      login/logout URL builders (client-safe)
│   ├── training-flow.ts       pure roster+rating → branch logic (DEV-112)
│   ├── user.ts                display name + rating helpers over identity's very optional types
│   ├── components/            Panel, Badge, PageHero, Logo, ActionButton, header/
│   ├── db/schema/             drizzle tables (roster_members)
│   ├── types/vatusa.ts        VATUSA API shapes
│   ├── server/
│   │   ├── identity.ts        reads fic_session, calls the IDENTITY binding
│   │   ├── vatusa.ts          VATUSA roster fetch (no API key needed)
│   │   ├── roster/            roster lookup + the reconciling sync
│   │   └── db/                drizzle client factory
│   └── utils/permissions.ts   training:* role vocabulary
└── routes/                    plain nested folders, no route groups
.ai/                           decisions, research and session notes — start with .ai/README.md
```

### Roster data

This app owns roster data for the ARTCC. `roster_members` is a **mirror** of the
VATUSA roster, refreshed by cron and **soft-removed** — departed members keep
their row with `removedAt` stamped, so we can tell "never on the roster" from
"left last week". Active queries filter `removedAt IS NULL`.

Training data this app owns (certifications, endorsements, currency) keys on
`cid` **independently** and must never take a foreign key onto `roster_members`
— otherwise falling off the VATUSA roster would delete someone's training
history. See [`.ai/decisions/0006-training-tools-owns-the-roster.md`](.ai/decisions/0006-training-tools-owns-the-roster.md).

**D1 allows only 100 bound parameters per query** and the facility has more
members than that, so never write `IN (...)` over the full CID list. The sync
documents the patterns that avoid it.

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

`vite dev` joins Wrangler's dev registry, so the `IDENTITY` service binding
resolves against your local identity — no `wrangler dev` needed for auth to work.

Two things to know when it misbehaves:

- **`.dev.vars` is read at startup only.** Create it _before_ `npm run dev`, and
  restart after editing. If sign-in sends you to `auth.flyindycenter.com`
  instead of `localhost:8787`, the file wasn't loaded — and production identity
  will reject a `localhost` return URL with a 400.
- **If identity isn't running**, the binding resolves but the call fails with
  `Worker "identity" not found` in the server console, and the request is
  treated as logged out. Auth degrades silently by design, so check the console
  before assuming login is broken.

Also watch the port: if 5173 is taken, Vite silently moves to 5174 and you may
be testing a stale server.

The signed-out landing page (`/`) renders without identity running at all.

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

To populate a local roster, run the cron by hand:

```bash
npx wrangler dev --test-scheduled --port 8788
curl http://localhost:8788/__scheduled      # logs {fetched, added, restored, removed}
```

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

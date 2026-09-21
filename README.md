# training-tools

Controller training management for Indy Center, at
[training.flyindycenter.com](https://training.flyindycenter.com). Students enroll,
track their progress toward certification, and see where they are on the
waitlist; instructors and training staff manage that process.

Part of [DEV-99 — Controller Training Platform](https://zidartcc.atlassian.net/browse/DEV-99).

## HTTP surface

| Route                        | Auth     | Purpose                                                    |
| ---------------------------- | -------- | ---------------------------------------------------------- |
| `GET /`                      | public   | Sign-in CTA signed out; the DEV-112 flow signed in         |
| `GET /enroll`                | required | Enrollment form, or the state of an open request           |
| `POST /enroll`               | required | Submit an enrollment; `?/withdraw` withdraws an open one   |
| `GET /stats`                 | required | Waitlist numbers and expected wait (placeholder — DEV-111) |
| `GET /dashboard`             | required | The signed-in user's training overview                     |
| `GET /certifications`        | staff    | Search the roster by CID or name                           |
| `GET /certifications/{cid}`  | staff    | One controller's credentials and their full history        |
| `POST /certifications/{cid}` | staff    | `?/setCertification`, `?/toggleEndorsement`                |

`/enroll` additionally requires **home** roster membership, and `/certifications`
requires `training:certifications:edit`. Both are enforced in the load **and** in
every action — `hooks.server.ts` only checks for a session, and a form action
runs before any load.

**Nothing grants `training:certifications:edit` yet**, so `/certifications` is
unreachable until identity implements and assigns the role. That is a release
task, not a bug.

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

| Trigger        | Does                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `*/15 * * * *` | Refreshes the VATUSA roster mirror (`src/worker.ts` → `syncRoster`)       |
| `*/15 * * * *` | Grants arrivals what GCAP entitles them to (`grantArrivalCertifications`) |
| `*/15 * * * *` | Files enrollments that never reached Jira (`reconcileEnrollments`)        |

All three run on the same schedule but are guarded separately: VATUSA being down
must not stop enrollments reaching the staff board, Jira being down must not stop
the roster refreshing, and VATSIM being down must not stop either.

Order matters once — the certification pass reads roster rows the sync has just
written, so a brand-new arrival is certified in the same run.

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
| `JIRA_BASE_URL`       | `https://zidartcc.atlassian.net`                                   |
| `JIRA_PROJECT_KEY`    | `TRK` — the Student Tracking waitlist                              |

| Secret            | What it is                                          |
| ----------------- | --------------------------------------------------- |
| `JIRA_USER_EMAIL` | Atlassian account the API token belongs to          |
| `JIRA_API_TOKEN`  | Classic API token, from id.atlassian.com → Security |

**Auth needs no secrets** — service bindings aren't internet-reachable, so there
is no client id, client secret or signing key. The Jira secrets are unrelated to
auth: Atlassian isn't on our Cloudflare account, so it's reached over plain
HTTPS with basic auth.

Set them with `npx wrangler secret put JIRA_API_TOKEN`. Leave them unset and the
app still works: enrollments save to D1 and the cron files them once credentials
exist.

## Project layout

```
src/
├── worker.ts                  worker entry: SvelteKit fetch + the roster cron
├── hooks.server.ts            db client + session load + the route gate
├── app.d.ts                   App.Locals / App.Platform (IDENTITY is optional here on purpose)
├── lib/
│   ├── config.ts              facility id, VATSIM rating thresholds
│   ├── certifications.ts      credential catalogue + the GCAP rating table (client-safe)
│   ├── certification-grant.ts pure arrival-grant logic (DEV-115)
│   ├── courses.ts             the six courses + their Jira option ids (client-safe)
│   ├── enrollment.ts          pure enrollment-form validation
│   ├── identity-links.ts      login/logout URL builders (client-safe)
│   ├── training-flow.ts       pure roster+rating → branch logic (DEV-112)
│   ├── user.ts                display name + rating helpers over identity's very optional types
│   ├── components/            Panel, Badge, PageHero, Logo, ActionButton, header/
│   ├── db/schema/             drizzle tables (roster_members, enrollments, certifications)
│   ├── types/vatusa.ts        VATUSA API shapes
│   ├── types/vatsim.ts        VATSIM v2 API shapes
│   ├── server/
│   │   ├── identity.ts        reads fic_session, calls the IDENTITY binding
│   │   ├── vatusa.ts          VATUSA roster fetch (no API key needed)
│   │   ├── vatsim.ts          VATSIM v2 controlling history (no API key needed)
│   │   ├── roster/            roster lookup, search, and the reconciling sync
│   │   ├── certifications/    grant/revoke, and the arrival pass
│   │   ├── enrollments/       submit, withdraw, and the Jira reconcile pass
│   │   ├── jira/              Jira client, field ids, issue payload builder
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

### Certifications and endorsements

**This app is the certification system of record for the ARTCC.** Both kinds live
in one `certifications` table, separated by `kind`, keyed on `cid` with no
foreign key onto `roster_members`.

`$lib/certifications.ts` is the catalogue — the vocabulary, the top-down `rank`,
the prerequisites (`requires`) and the GCAP rating table — as **data rather than
branches**, so changing what the ARTCC issues is a config edit.

Note two things that bite if you assume otherwise:

- **S-LC is an endorsement, not a certification.** That is why the top-down
  "hold one certification" rule needs no exception, and why S-LC renders beside
  the ground certification for free.
- **`rank` is the ladder; there is no `tier` field.** Tier 1 / Tier 2 are GCAP's
  terms for classifying endorsements, so the word is left to mean that.

**Rows are never deleted and there is no expiry column.** A credential is held
while `revokedAt` is null and is history once it is set, so the grant/revoke
columns are the audit trail. community-website expires certifications instead
and bumps them each sync — a difference DEV-116's cutover has to reconcile.

A **partial unique index** on `(cid, code) WHERE revoked_at IS NULL` is what
stops a member who leaves and returns being granted a duplicate.

Arrivals are granted automatically each cron run from their VATSIM rating, but
only if they have controlled in the last six months — read from VATSIM API v2,
which needs no API key. SUP and ADM are not controller ratings, so their earned
rating is inferred from logged hours and always flagged for a TA. See
[`.ai/decisions/0010-certifications-model.md`](.ai/decisions/0010-certifications-model.md)
and [`.ai/research/vatsim-api.md`](.ai/research/vatsim-api.md).

All grants and revocations go through `grantCredential` / `revokeCredential` in
`$lib/server/certifications/` — the arrival job, the import and the staff edit
page all call them, so there is one place to hook notifications onto later.

### Enrollments

**This app owns the enrollment record; Jira owns the queue.** Submitting the
form writes an `enrollments` row and commits it, _then_ files a Student
Enrollment issue in Jira project `TRK` and writes the key back. A Jira outage
therefore delays the filing rather than losing the request — the cron retries
anything with a null `jiraIssueKey`, capped at 5 attempts.

A new request has status **`waitlist`**, which is TRK's initial status. Note the
workflow changed once during DEV-108 (a triage step in front of the waitlist was
removed), so re-verify the statuses before relying on them — and read them by
creating a test issue, not by listing the board, which hides any status no issue
is currently sitting in. Details and the full field/option id map are in
[`.ai/research/jira-student-tracking.md`](.ai/research/jira-student-tracking.md);
the reasoning is in
[`.ai/decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md`](.ai/decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md).

One open enrollment per CID — you train one course at a time. Students can
withdraw, which comments on the Jira issue rather than transitioning it.

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

The same trigger runs the enrollment reconcile, which is how to exercise the
Jira retry path without a browser session: insert a row with a null
`jira_issue_key`, fire `/__scheduled`, and watch it pick up a key.

**Local dev points at the real `TRK` project**, so a test submission creates a
real issue on the training staff's board. Delete what you create. Leaving
`JIRA_API_TOKEN` unset avoids this entirely — enrollments still save, they just
stay unfiled.

**Never run `wrangler d1 delete` or `wrangler d1 create` to fix local state** —
both operate on production.

## Tests

```bash
npm test
```

CI runs exactly this sequence; run it before opening a PR:

```bash
npm run format:check && npm run build && npm run check && npm test
```

**`build` comes before `check` on purpose.** `src/worker.ts` imports the
adapter's output at `.svelte-kit/cloudflare/_worker.js`, so on a fresh clone
type-checking before building fails with `Cannot find module`. Keep that order
if you edit the workflow.

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

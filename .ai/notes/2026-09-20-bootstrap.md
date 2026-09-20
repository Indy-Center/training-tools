# 2026-09-20 — Bootstrap (DEV-107, DEV-109)

## What was built

A deployed, styled, authenticated shell at `training.flyindycenter.com` with no
features in it yet.

- SvelteKit 2 / Svelte 5 runes / Tailwind v4, upstream
  `@sveltejs/adapter-cloudflare`, deployed as a Worker with static assets.
- Identity auth via the `IDENTITY` service binding, copied from `charts`:
  `src/lib/server/identity.ts` + `authHandle` in `src/hooks.server.ts`.
- Gate in `handle` with a public allowlist (`/`, `/stats`).
- Layout, header and a small component kit ported from `community-website`.
- D1 `training-db` bound and drizzle wired, deliberately with **no tables**.
- Role vocabulary defined (`training:admin`, `training:instructor`), nothing
  granted yet.
- `.ai/` established; ADRs 0001–0005.

Routes: `/` (public landing), `/stats` (public placeholder for DEV-111),
`/dashboard` (gated; renders the live `SessionContext` — deliberately useful as
an auth smoke test).

## Decisions taken with the requester

- D1: **plumbing only, no tables** this iteration.
- Public surface: landing + waitlist stats public, everything else gated.
- Roles: namespaced constants now, no live grants.
- Scope: provision Cloudflare resources and deploy for real.

## Things that bit, or nearly did

- **`prettier-plugin-tailwindcss` 0.6.x is broken with Prettier 3.9** —
  `getVisitorKeys is not a function` on every `.svelte` file. Fixed by moving to
  `^0.8.1`. `community-website` pins `^0.6.11` and only survives via its
  lockfile, so don't copy its version ranges blindly on a fresh install.
- **`loginUrl`/`logoutUrl` cannot live in `$lib/server/`** — the header renders
  them client-side. They're in `$lib/identity-links.ts`; only session _reading_
  is server-only.
- **Identity's types are far more optional than the docs suggest.**
  `vatsimData.vatsim?.rating?.short` — all three levels. Hence `src/lib/user.ts`.
- `Panel.svelte` was copied with a latent reactivity bug (props captured with
  `const`, not `$derived`). Fixed here; noted in ADR 0003 so nobody "corrects"
  it back while diffing against the original.

## Verified locally

- Public routes return 200; `/dashboard` 302s to identity's `/login` with a
  correctly-encoded absolute `return_url`. The gate works.
- **The `IDENTITY` binding resolves under `vite dev`** — it joins Wrangler's dev
  registry, so no `wrangler dev` is needed for local auth. With identity not
  running you get `Worker "identity" not found`, which is a clearer signal than
  expected.
- `.dev.vars` overrides `wrangler.jsonc` `vars`, at startup only.

## Verified in production

Deployed to `training.flyindycenter.com` (version `77d1f485`). D1 `training-db`
created as `1bd45e96-48f1-4041-980e-9ca0e2dd3b1b`.

- `/` and `/stats` return 200 signed out; `/dashboard` 302s to
  `auth.flyindycenter.com/login` with a correct absolute `return_url`.
- **The IDENTITY binding works in production.** Confirmed via `wrangler tail`:
  a request carrying a bogus `fic_session` logged `GET /dashboard - Ok` with
  _no_ `getSessionContext threw` and no `binding unavailable` warning — so the
  RPC call genuinely reached identity, which returned `null` for the unknown
  token. Worth doing it this way: because auth degrades silently, the 302 alone
  would have looked identical with a completely broken binding.

Not verified: a real VATSIM sign-in round trip, which needs a human to
authenticate. Everything up to the redirect is confirmed.

## Two traps in the toolchain (both fixed, don't re-introduce)

- **`wrangler types` poisons `npm run check` once a build exists.** It points
  `Cloudflare.GlobalProps` at `.svelte-kit/cloudflare/_worker.js`, dragging the
  adapter's bundled output into the type program — ~1300 errors in code we
  didn't write. Fixed with `checkJs: false`. All our source is TS/Svelte, so
  nothing of ours goes unchecked.
- **`src/worker-configuration.d.ts` is gitignored but referenced in tsconfig
  `types`.** On a clean CI checkout it wouldn't exist. `npm run check` now runs
  `cf-typegen` first. Verified in both states: fresh checkout (643 files) and
  post-build (676 files), 0 errors each. community-website has the same latent
  hole but never hits it — its CI doesn't run `check` at all.

## Open / next

- **The GitHub repo does not exist yet.** Create `Indy-Center/training-tools`,
  push `main`, and add the `CLOUDFLARE_WORKERS_API_KEY` repo secret or the
  deploy workflow will fail on first run. Deploys have only been manual so far.
- Nobody holds `training:admin` yet. Grant before any staff-facing feature.
- DEV-108 is next and needs a product decision first: **is D1 the waitlist, or
  is Jira the waitlist with D1 mirroring it?** See
  [`../research/jira-dev-99-scope.md`](../research/jira-dev-99-scope.md).
- DEV-101 wants versioned curriculum/rubrics; cheaper to shape in DEV-108's
  schema than to retrofit.

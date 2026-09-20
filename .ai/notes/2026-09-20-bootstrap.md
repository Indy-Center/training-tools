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

## Open / next

- **Unverified: whether the `IDENTITY` binding resolves under `vite dev`.**
  If it doesn't, local auth silently behaves as permanently-logged-out; use
  `npm run preview` (real `wrangler dev`) instead. Documented in the README.
  Needs a human with identity running locally to settle it.
- Nobody holds `training:admin` yet. Grant before any staff-facing feature.
- DEV-108 is next and needs a product decision first: **is D1 the waitlist, or
  is Jira the waitlist with D1 mirroring it?** See
  [`../research/jira-dev-99-scope.md`](../research/jira-dev-99-scope.md).
- DEV-101 wants versioned curriculum/rubrics; cheaper to shape in DEV-108's
  schema than to retrofit.

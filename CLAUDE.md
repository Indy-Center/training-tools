# training-tools

Controller training management for Indy Center (VATSIM ARTCC), at
`training.flyindycenter.com`. SvelteKit on Cloudflare Workers + D1.

**Read [`.ai/README.md`](.ai/README.md) before making architectural changes.**
Decisions live in `.ai/decisions/`, integration research in `.ai/research/`, and
session notes in `.ai/notes/`. Add to them as you go — especially when something
surprises you.

## Four constraints that are not negotiable

1. **This must stay a Cloudflare Worker on account
   `afd63515948c9b2188ce14ef1504b2c1`, served from `*.flyindycenter.com`.** Auth
   works via a Cloudflare RPC service binding plus a cookie scoped to that
   domain. Off that account or that domain, authentication cannot work at all —
   there is no HTTP fallback. ([0001](.ai/decisions/0001-identity-via-service-binding.md))
2. **Identity is not an OAuth/OIDC provider.** Do not reach for an OIDC client.
   Read `fic_session`, call `IDENTITY.getSessionContext(token)`. The reference
   implementation is `Indy-Center/charts`, **not** `community-website` — the
   latter still runs its own VATSIM OAuth and its README is stale on this point.
   ([research](.ai/research/identity-integration.md))
3. **Route gating goes in `handle` (`src/hooks.server.ts`), never in a
   `+layout.server.ts`.** Layout loads don't re-run on nested navigation, form
   actions run before any load, and `+server.ts` endpoints never run one — a
   layout gate silently stops protecting things.
   ([0004](.ai/decisions/0004-gate-in-handle-not-layout.md))
4. **`return_url` passed to identity must be absolute** (`event.url.href` /
   `page.url.href`). Bare paths get a 400. Never derive it from
   `window.location`, which is undefined during SSR.

## Roster ownership

This app is the ARTCC's roster and (eventually) certification system of record.
`roster_members` is a soft-removed **mirror** of the VATUSA roster, refreshed by
the cron in `src/worker.ts`.

- Training data we own keys on `cid` and **never** takes a foreign key onto
  `roster_members` — a VATUSA removal must not delete training history.
- Active-roster queries filter `removedAt IS NULL`.
- **D1 allows only 100 bound parameters per query.** The facility has ~157
  members, so `IN (...)`/`NOT IN (...)` over the full CID list throws at
  runtime. It typechecks and passes unit tests, so it only shows up when the
  cron runs. See `src/lib/server/roster/sync.ts` for the patterns that avoid it.
- The sync refuses to apply on a failed fetch _or_ an empty roster; a stale
  mirror beats one that marks the whole facility departed.

## Conventions

- **Svelte 5 runes** (`$props`, `$state`, `$derived`, snippets). No stores;
  `$app/state`, not `$app/stores`.
- **Tailwind v4** — there is no `tailwind.config.js` and no `@theme` block. The
  theme is convention: dark, stock palette, **sky** accent. Match the classes
  already in use rather than inventing tokens.
  ([0003](.ai/decisions/0003-styles-copied-from-community-website.md))
- **Icons** are `unplugin-icons` from `~icons/mdi/*`, aliased `IconFoo`. Not lucide.
- **Prettier only, no ESLint.** Tabs, single quotes, no trailing comma, 100 cols.
- **Server-only code lives under `$lib/server/`.** Anything a component imports
  must not be in there — that's why the login/logout URL builders sit in
  `$lib/identity-links.ts`.
- **Database access is `locals.db`**, set in `hooks.server.ts`. Never a
  module-level singleton.
- **Migrations**: `npm run db:generate` (drizzle-kit writes SQL) then
  `npm run db:migrate:local` (wrangler applies). Never `drizzle-kit migrate` or
  `push`. Never `wrangler d1 delete`/`create` to fix local state — they hit
  production.
- Identity's user fields are almost all optional. Go through `$lib/user.ts`
  rather than reaching into `vatsimData` directly.

## Before opening a PR

```bash
npm run format:check && npm run check && npm run build && npm test
```

That is exactly what CI runs. The org's definition of done also includes "the
README still describes reality" — update it when behaviour changes.

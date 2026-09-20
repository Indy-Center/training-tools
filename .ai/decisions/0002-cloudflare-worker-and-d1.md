# 0002 — Cloudflare Worker + D1, upstream adapter

- **Status:** partly superseded by
  [0006](0006-training-tools-owns-the-roster.md)
- **Date:** 2026-09-20
- **Ticket:** DEV-107

> **Superseded:** the "upstream adapter" and "D1 plumbing with no tables"
> choices below no longer hold. DEV-112 needed a roster cron, which needs a
> custom worker entry, so the app moved to `@indy-center/adapter-cloudflare` and
> grew its first table. The reasoning here was sound at the time — we genuinely
> needed neither cron nor RPC. Everything else on this page still applies,
> including the migration workflow.

## Context

The org is "Workers first" — nearly everything runs on Cloudflare Workers. The
one notable exception is a legacy k3s cluster still serving `controller-tools`.

`Indy-Center/infrastructure` is _not_ relevant to deploying this app. It is
ArgoCD/Kustomize GitOps for that legacy cluster: no Terraform, no Cloudflare, no
DNS-as-code. New apps are configured entirely in their own repo's
`wrangler.jsonc`, and `routes` with `"custom_domain": true` makes Wrangler
create and manage the DNS record on deploy. Nothing to add anywhere else.

## Decision

- SvelteKit deployed as a Cloudflare Worker with static assets.
- **Upstream `@sveltejs/adapter-cloudflare`**, not the org's
  `@indy-center/adapter-cloudflare` fork.
- Cloudflare D1 (`training-db`) with drizzle-orm, wired up now but with no
  tables yet.

## Why the upstream adapter

The org documents four Worker shapes. "SvelteKit + upstream adapter" is the
default for anything with pages; the fork exists only for apps that need a cron
`scheduled()` handler or want to export their own RPC — `community-website`
needs the first, which is why it uses the fork and its `$env/dynamic/*` shim.

We need neither. Charts, the app we're closest to, uses upstream. The fork is
expected to merge upstream in Kit 3, so choosing it without needing it would be
borrowing a future migration for no benefit.

Consequence: no `$env/dynamic/private` shim, so config reaches us through
`platform.env` rather than `$env/*` imports.

## Why D1 plumbing with no tables

DEV-107 is "spin up the app"; the first tables belong to DEV-108 (enrollment).
Wiring the binding, drizzle client, `drizzle.config.ts`, the generate/apply
scripts and the CI migration step now means the first feature adds a schema file
and nothing else — and it proves the whole loop works while the app is still
trivial enough to debug.

`drizzle/migrations/` is committed empty (with `.gitkeep`). `wrangler d1
migrations apply` against an empty directory is a no-op, so CI is happy.

## Migration workflow

Both existing D1 users pair the two tools rather than using either alone:
**drizzle-kit generates the SQL, wrangler applies it.** `drizzle-kit migrate`
and `drizzle-kit push` are not used against D1.

```
edit src/lib/db/schema/*.ts
npm run db:generate        # drizzle-kit writes SQL into drizzle/migrations/
npm run db:migrate:local   # wrangler applies it to local state
# commit; CI applies --remote before deploying
```

Local reset: `rm -rf .wrangler/state/v3/d1 && npm run db:migrate:local`.

**Never run `wrangler d1 delete` or `wrangler d1 create` to fix local state** —
both hit production.

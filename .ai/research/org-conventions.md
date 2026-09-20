# Indy Center engineering conventions

**Verified on 2026-09-20** against <https://tech.flyindycenter.com/> and the
`Indy-Center` GitHub org.

The developer portal is the source of truth; it "publishes what's been decided,
not what's planned."

## Platform

"Workers first." Nearly everything is a Cloudflare Worker on account
`afd63515948c9b2188ce14ef1504b2c1` (`IndyCenter`). Exceptions: a VPS running
Wiki.js + Postiz, and a small k3s cluster still serving `controller-tools`.

- **Cloudflare Pages is not used** — Workers with static assets everywhere.
- **No KV, no R2** anywhere in the org.
- **Queues** are documented as a pattern with zero current consumers.
- **No HTTP between Workers, ever.** Service bindings only. They're configured
  explicitly in `wrangler.jsonc`, aren't internet-reachable, and so need no
  shared secret, CORS or auth. The only cross-Worker RPC call that exists today
  is charts → `identity.getSessionContext`.

`Indy-Center/infrastructure` is **not** Cloudflare IaC — it's ArgoCD/Kustomize
GitOps for the legacy k3s cluster. There is no DNS-as-code in the org; `routes`
with `"custom_domain": true` makes Wrangler manage the record.

## Worker shapes

| Shape                          | Example             | `main`                              |
| ------------------------------ | ------------------- | ----------------------------------- |
| SvelteKit + upstream adapter   | `charts`            | `.svelte-kit/cloudflare/_worker.js` |
| SvelteKit + org fork + wrapper | `community-website` | `src/worker.ts`                     |
| Hono + `WorkerEntrypoint`      | `identity`          | `src/index.ts`                      |
| Hono only                      | `discord-bot`       | `src/index.ts`                      |

Shape 1 is "the default for anything with pages". Use the
`@indy-center/adapter-cloudflare` fork only for cron/`scheduled` or a custom RPC
export; it's expected to merge upstream in Kit 3.

## CI

Three required checks on every PR: `format:check` (Prettier), `check`
(SvelteKit/Astro) or `typecheck` (plain Worker), and `test` (`vitest run`).
Some older repos use `lint` instead of `format:check`; **new projects should
standardize on `format:check`**.

Two workflows: `ci.yml` (push + PR to `main`, Node 22, concurrency group with
cancel-in-progress) and `build-and-deploy.yml` (push to `main`,
`cloudflare/wrangler-action@v3`, repo secret `CLOUDFLARE_WORKERS_API_KEY`).
**For D1 projects, migrations apply before deploy.**

## Branching

Deliberately minimal: feature branch → PR to `main` → **one approval** → merge →
auto-deploy. Branch names, commit message style and merge method are all the
developer's choice. There is no documented ticket-ID-in-branch-name convention.

> "The repositories are open source and the team is three or four volunteers;
> we'd rather enforce the few things that matter in CI than set rules for the rest."

## Definition of done

1. It works, and you've run it.
2. Tests cover the behavior you changed.
3. CI is green.
4. **The README still describes reality.**

## Environment and secrets

**"Bindings aren't env vars."** D1, KV and service bindings are declared in
`wrangler.jsonc`, never in env files. Neither `.dev.vars` nor `.env` is
committed.

Workers use `.dev.vars` (from a committed `.dev.vars.example`); SvelteKit apps
on the org fork use `.env`. This repo uses `.dev.vars` because the upstream
adapter reads config through `platform.env`, which Wrangler populates from
`wrangler.jsonc` `vars` overridden by `.dev.vars`.

Ports: identity `wrangler dev` → **8787, and it must be 8787** (VATSIM's
redirect URI is hardcoded). SvelteKit `vite dev` → 5173, auto-incrementing.
Start identity first.

Node 22, matching CI. Wrangler is a per-project devDependency, run via `npx`.

## D1 + drizzle

Both existing D1 users pair the tools: **drizzle-kit generates, wrangler
applies.** `drizzle-kit migrate`/`push` is not used. `drizzle.config.ts`'s `out`
points straight at wrangler's `migrations_dir`.

Local reset: `rm -rf .wrangler/state/v3/d1 && npm run db:migrate:local`.
**Never `wrangler d1 delete`/`create` to fix local state** — those hit production.

## Repos worth knowing

| Repo                 | Subdomain                | Note                                                  |
| -------------------- | ------------------------ | ----------------------------------------------------- |
| `identity`           | auth.flyindycenter.com   | auth for everything                                   |
| `community-website`  | flyindycenter.com        | style reference; **not** an auth reference            |
| `charts`             | charts.flyindycenter.com | **the auth reference implementation**                 |
| `developer-portal`   | tech.flyindycenter.com   | these docs                                            |
| `adapter-cloudflare` | —                        | the org's SvelteKit adapter fork                      |
| `scheddy`            | —                        | scaffold; unadopted training-scheduler fork from ZTL  |
| `indy-moodle`        | —                        | empty repo, created Sept 2026, planned LMS for DEV-99 |

## Jira

Project key `DEV` on `zidartcc.atlassian.net`, team-managed, invite-only.
Epics = quarterly/long-tail goals; Stories = work pushing a goal forward;
Subtasks optional.

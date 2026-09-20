# 0006 — training-tools owns the roster

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-112
- **Supersedes:** parts of [0002](0002-cloudflare-worker-and-d1.md) — specifically
  "upstream adapter" and "D1 plumbing with no tables"

## Context

DEV-112 needs to sort signed-in members by roster status and rating. Identity
does not carry roster membership: `SessionContext` has the VATSIM profile, roles
and live controlling session, but nothing about whether a CID is on the ZID
roster.

The narrow fix would be a cached VATUSA call on each request. The wider picture
is that this app is meant to become the **certification system of record** for
the ARTCC (per the DEV-99 epic), shared with community-website and the Discord
bots. Roster data is the spine that certifications, endorsements and currency
all hang off.

So the decision is not "how do we answer this one question" but "who owns
roster".

## Decision

**training-tools owns roster data for ZID**, in three layers:

1. **Ingest** — a cron pulls `https://api.vatusa.net/facility/ZID/roster/both`
   into a local `roster_members` mirror. The endpoint is public; no API key.
2. **Own** — certifications, endorsements and currency become our own tables as
   their tickets land, keyed on CID.
3. **Expose** — eventually a versioned `TrainingRpc` `WorkerEntrypoint`, so
   consumers bind to us rather than each re-deriving roster from VATUSA.

Layer 3 is deliberately **not built yet**: publishing a contract before a
consumer exists means designing in the dark, and a published RPC surface is
expensive to change. `src/worker.ts` is structured so adding it is a few lines.

## Consequences

### We switched to the org adapter fork

`@indy-center/adapter-cloudflare` replaces upstream `@sveltejs/adapter-cloudflare`.
The cron needs a `scheduled()` handler, which needs a custom worker entry
(`src/worker.ts`), and upstream clobbers a custom `main` on every build. The
fork always writes to `.svelte-kit/cloudflare/_worker.js` and lets `main` point
at our wrapper. It is also what an RPC export will require.

This reverses 0002's "upstream adapter" call, which was correct at the time —
we genuinely needed neither cron nor RPC then.

We do **not** use the fork's `$env/dynamic/*` shim or the `alias` block, because
config is read from `platform.env`. Skip it until something needs it.

### The mirror is a mirror, not the source of truth for people

`roster_members` is disposable and rebuildable from VATUSA. Training data we own
keys on `cid` **independently and must never take a foreign key onto it** —
otherwise someone falling off the VATUSA roster would cascade away their own
training history, which is exactly the record we exist to keep.

### Soft removal, not truncate-and-replace

community-website truncates and reinserts the roster each sync. We upsert and
stamp `removedAt` instead, because:

- "never been on the roster" and "left last Tuesday" are different answers, and
  the second one matters when someone disappears mid-training;
- currency tracking later needs to know when someone stopped being current;
- truncating a table that training data references by CID is asking for trouble.

Active queries filter `removedAt IS NULL`. A returning member is restored by the
upsert clearing `removedAt`.

### Two refusals in the sync

The sync throws rather than half-applying if the VATUSA fetch fails **or if it
returns zero members**. Without the second guard, a bad upstream response would
mark the entire facility as departed and drop every controller out of the
enrollment flow. A stale mirror is much better than an empty one.

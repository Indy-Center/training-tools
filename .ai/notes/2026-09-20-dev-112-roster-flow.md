# 2026-09-20 — DEV-112 roster flow + roster ownership

Second session of the day. Follows
[`2026-09-20-bootstrap.md`](2026-09-20-bootstrap.md).

## What changed

DEV-112 asked for a home page that sorts members by roster and rating. Answering
"is this CID rostered" turned into a bigger decision: **this app now owns roster
data** for the ARTCC, as the spine for the certifications, endorsements and
currency it will own later, eventually exposed over RPC.

- Switched to `@indy-center/adapter-cloudflare` + `src/worker.ts` (needed for
  cron, and later RPC). Reverses part of ADR 0002.
- First real D1 table: `roster_members`, a soft-removing mirror of the VATUSA
  roster.
- Cron every 15 minutes pulls the public VATUSA roster (no API key).
- `resolveTrainingFlow()` — pure, unit-tested branching into four paths.
- Home page renders a sign-in CTA signed out, and one of four branches signed in.
- `/stats` is no longer public; `/` is now the only public path.
- Nav links hidden when signed out.

ADRs [0006](../decisions/0006-training-tools-owns-the-roster.md) and
[0007](../decisions/0007-home-page-flow-branching.md).

## Decisions taken with the requester

- Roster foundation now (fork, table, cron), **RPC deferred** until a consumer
  exists to compile against it.
- Soft-removal over truncate-and-replace.
- Home controllers get the enrollment form; **visiting controllers get copy**,
  not the form.
- Everything behind login except the `/` sign-in CTA.

## The bug worth remembering

**D1 allows 100 bound parameters per query.** The first sync attempt used
`inArray(cids)` with 157 CIDs and died with
`D1_ERROR: too many SQL variables`. The `notInArray` soft-removal would have hit
it too.

Only surfaced by actually running the cron — it typechecks fine and passes unit
tests, because the limit is a runtime property of D1.

Fixed by removing the CID lists entirely: scan the small table to classify, and
use `syncedAt < now` as the tombstone marker. Better code than the original
anyway.

## Verified against local D1

Ran the real cron via `wrangler dev --test-scheduled`:

| Run    | Result                                            | Meaning                                          |
| ------ | ------------------------------------------------- | ------------------------------------------------ |
| first  | `{fetched:157, added:157, restored:0, removed:0}` | initial population                               |
| second | `{fetched:157, added:0, restored:0, removed:1}`   | idempotent; synthetic departed member tombstoned |
| third  | `{fetched:157, added:0, restored:1, removed:0}`   | a member marked removed was restored             |

Row counts: 157 total, 110 home, 47 visiting, 7 mentors. The tombstoned row
survived with `removed_at` set — history kept, as intended.

Also: `/` returns 200 signed out with the CTA; `/stats` and `/enroll` 302 to
identity.

## Open / next

- **Still no GitHub repo**, so still no CI and no automatic deploys. The cron
  only runs once deployed.
- The four branches are only verified by unit test — **nobody has seen the
  signed-in page render**, since that needs a real VATSIM session.
- `/enroll` and `/stats` are placeholders (DEV-108, DEV-111).
- RPC surface deferred. When a consumer appears, export a `WorkerEntrypoint`
  from `src/worker.ts` and publish types the way identity does.
- Visiting-controller copy is a guess at policy. Worth a training-staff read
  before it's real: it currently says visitors can't enroll and should transfer.

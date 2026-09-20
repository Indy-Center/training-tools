# VATUSA roster API

**Verified on 2026-09-20** against the live ZID roster.

## The endpoint we use

```
GET https://api.vatusa.net/facility/ZID/roster/both
```

**No API key.** This is the reason roster sync needs no secrets. `both` can be
`home` or `visit` to filter.

Response is `{ data: VatusaRosterMember[] }`. Live ZID numbers on the day:

|                      |                                      |
| -------------------- | ------------------------------------ |
| members              | 157 (110 home, 47 visiting)          |
| `membership`         | only ever `"home"` or `"visit"`      |
| `rating_short`       | OBS, S1, S2, S3, C1, C3, I1, I3, SUP |
| mentors (`isMentor`) | 7                                    |

## Two things that shape the code

**Rostered OBS controllers exist.** The roster contains observers, so roster
membership must be checked _before_ rating when branching — see
[`../decisions/0007-home-page-flow-branching.md`](../decisions/0007-home-page-flow-branching.md).

**CIDs come back as numbers**, but identity hands us `user.cid` as a string and
our primary key is `text`. The sync stringifies on the way in; a mismatch would
silently make every controller look unrostered. There is a test for it.

## Fields worth knowing about

- `isMentor` / `isSupIns` — the basis for the DEV-106 teacher roster import, so
  they get real columns rather than living only in the JSON blob.
- `discord_id` — DEV-110 wants a Discord id with enrollment. Identity also
  carries one in `attributes.discordId`; VATUSA's is a second source.
- `flag_homecontroller` — tracks `membership === 'home'`, kept separately since
  they are nominally independent.
- `promotion_eligible`, `transfer_eligible`, `last_promotion`,
  `last_competency_date` — not modelled as columns yet, but preserved in the
  `data` JSON blob, so inspecting them needs no migration.

## D1 limit that bit us

**D1 allows only 100 bound parameters per query.** A facility of 157 members
means any `IN (...)` or `NOT IN (...)` over the full CID list fails with
`D1_ERROR: too many SQL variables`. Found by running the cron, not by reading
docs.

The sync avoids it by:

- reading the whole (small) table to classify added/restored, instead of
  filtering by CID list;
- using `syncedAt < now` as the tombstone marker instead of
  `NOT IN (current cids)`;
- chunking upserts 25 statements at a time.

## Endpoints we don't use yet

`GET /user/{cid}/transfer/checklist?apikey=…` — visit/transfer eligibility.
**Requires `VATUSA_API_KEY`.** community-website already wraps this and derives
`canVisit` / `canTransfer` from it; worth copying rather than re-deriving the
rules when DEV-106 lands.

`POST /facility/{artcc}/roster/manageVisitor/{cid}?apikey=…` — add a visitor.
Also keyed. DEV-106's "auto-processed visitor application".

## Source

community-website's `src/lib/server/vatsim/vatusaDataClient.ts` and
`src/lib/types/vatusa.ts` are the prior art; our client is a trimmed version of
the same thing.

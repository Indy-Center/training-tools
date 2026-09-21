# 0010 — How this app models certifications and endorsements

- **Status:** accepted
- **Date:** 2026-09-21
- **Ticket:** DEV-115 (subtasks DEV-120, DEV-121, DEV-122)

## Context

[0006](0006-training-tools-owns-the-roster.md) said certifications, endorsements
and currency "become our own tables as their tickets land, keyed on CID". This
is that ticket.

Until now certifications have lived in `community-website`'s D1, keyed on its
internal `users.id`. DEV-116 will eventually make this app the system of record
and community-website a consumer, so the shape chosen here is the shape that
cutover has to migrate onto — and the shape a published RPC surface will expose.

DEV-115 itself asks for something narrower: when a rated controller arrives on
the ZID roster as a transfer or a visitor, work out what GCAP entitles them to
and grant it, so staff only handle exceptions.

## Decisions

### One table for both kinds, separated by `kind`

community-website has `user_certifications` and `user_endorsements` as separate
tables. We have one, because almost every read is "what does this controller
hold" rather than one kind or the other, and two tables means two queries and
two migrations every time that question grows.

### S-LC is an endorsement, not a certification

DEV-115 lists S-LC among the certifications, and then immediately carves out an
exception for it: the top-down model means you hold only your highest
certification, "the exception to this is S-LC", which must display alongside the
ground certification you hold.

Modelling S-LC as an **endorsement** removes the exception entirely. Endorsements
already sit alongside a certification rather than superseding it, so "render the
one certification plus all endorsements" produces exactly the required display
with no special case. community-website independently reached the same shape.

The story's intent is preserved; only the category changes.

### `rank`, and deliberately no `tier`

Certifications carry a numeric `rank` for the top-down ladder. It is **not**
called `tier`, because Tier 1 and Tier 2 are GCAP's own terms for classifying
endorsements — `T2-CTR` is a Tier 2 endorsement — and using the same word for an
ordering number would make "tier 2" ambiguous on sight.

A separate `gcapTier` field was considered and left out: no logic reads it, and
`T2-CTR` already carries the fact in its name. It can be added when something
needs it.

### `requires` is all-of, with any-of groups

The prerequisite metadata DEV-121 asked for. Each entry must be satisfied; a
nested array means any one of its members will do.

```
A-LC  requires ['A-GC', 'S-LC']       // both
S-LC  requires [['S-GC', 'A-GC']]     // either ground certification
```

A flat list could not express A-LC, which genuinely needs advanced ground **and**
the simple local endorsement.

**`requires` governs enrollment eligibility, not arrival equivalency.** The GCAP
table grants an S2 arrival `A-LC` outright, skipping S-GC, A-GC and S-LC — that
is what an equivalency is. The arrival grant therefore never consults `requires`;
only course placement (DEV-119) does.

> **Open with the training team.** A consequence is that an S2 arrival granted
> A-LC will not hold S-LC, where a controller who trained up to A-LC would. If
> arrivals should also receive the endorsements their certification implies,
> that is a rule to add. Raised on DEV-115 rather than assumed.

### Granted/revoked history, and no expiry column

community-website sets `expiresAt` six months out and bumps it on every roster
sync while the member is still on the roster. We do not.

Here, losing currency **revokes** a certification and it must be re-earned. So a
row is held while `revokedAt` is null and is history once it is set. The grant
and revoke columns — `grantBasis`, `grantNote`, `grantedBy`, `revokedReason`,
`revokedBy` — are the audit trail DEV-115 asks for, which is why there is no
separate audit table.

The currency job that writes those revocations is **not built here**. This table
is what it will write to.

That difference is the one real friction in DEV-116's cutover, and it is worth
paying: an expiry that a sync keeps pushing forward cannot answer "when did they
stop being current", which is the question the currency work exists to ask.

### A partial unique index is the duplicate guard

```sql
CREATE UNIQUE INDEX certifications_held_idx
  ON certifications (cid, code) WHERE revoked_at IS NULL;
```

DEV-115 requires handling "a member who left and came back without duplicating
or wrongly re-granting". The application logic does that — an arrival who already
holds a certification is left alone — but logic is where it is easy to be wrong,
and this makes it true in the database whichever code path runs.

Verified directly rather than assumed: two live rows for one `(cid, code)` are
rejected, a revoked row happily coexists with a live one, and re-granting while
one is live is rejected.

### No foreign key onto `roster_members`

Per 0006, and worth restating because this is the table that rule was written
for. A VATUSA roster removal must never cascade away a certification record —
that record is the thing we exist to keep. Certifications key on `cid` alone.

This is also why the community-website import deliberately includes eight CIDs
who have left the roster: if one returns, they are recognised rather than
re-inferred.

## How arrivals get decided

`resolveArrivalGrant()` in `src/lib/certification-grant.ts` is pure, in the same
shape as `resolveTrainingFlow()`, so every row of the GCAP table is testable
without a database or a network call. In order:

1. **Already holds a certification → keep.** This is the whole leave-and-return
   safety net, and it is why "current on the roster in the last 6 months keeps
   their certifications" needs no date arithmetic: if currency has not revoked
   them, they still hold them.
2. **No ATC session in the last 6 months → grant nothing.** The case the
   requester raised: quiet for two months, six months of leave, back on the
   roster — they arrive with nothing and must re-earn it.
3. **Otherwise the rating maps through `RATING_GRANTS`.**
4. **SUP and ADM are derived from logged hours**, then flagged for the TA.

### Where "active in the last 6 months" comes from

Nothing in the app had this. Identity carries only a point-in-time
`activeSession`, and `roster_members.lastActivityAt` is VATUSA's "last seen in
our system", which is not the same as having controlled.

**VATSIM API v2 answers it, publicly, with no API key** (verified 2026-09-21 —
see [`../research/vatsim-api.md`](../research/vatsim-api.md)):

| Endpoint                        | Used for                                      |
| ------------------------------- | --------------------------------------------- |
| `/v2/members/{cid}/atc?limit=1` | The six-month currency test. 450 bytes        |
| `/v2/members/{cid}/stats`       | Hours per rating tier — the SUP/ADM inference |

### SUP and ADM are inferred, and always flagged

Neither is a controller rating: a promoted supervisor keeps SUP as their visible
rating whatever they earned before, so the rating field cannot answer the
question. Their hours can — the highest tier with meaningful time is the rating
they worked.

DEV-115 offered "set E-RC and flag for TA" as the fallback, and that remains the
behaviour when there are no usable hours. When there are, the inference is used
instead — but `needsReview` is set either way, and `grantNote` records the hours
it reasoned from so a TA can check the working. An inference is never silently
trusted, however well-founded.

### C1+ does not get `T2-CTR`

DEV-115 is explicit that Tier 2 comes from a self-led Moodle course.
community-website automatically adds `T2-CTR` whenever E-RC is set; we do not.

Called out because DEV-116's cutover will meet it, and because the behaviour
difference is invisible until someone compares the two systems.

## `certificationsCheckedAt` lives on `roster_members`

The arrival job needs to know who it has already looked at, or every member who
legitimately qualifies for nothing is re-checked against VATSIM every fifteen
minutes forever.

The alternative was a third table recording every check and its outcome. One
nullable column on the mirror is much less machinery, and losing it to a mirror
rebuild is harmless because the check is idempotent — it costs a burst of
re-checks and nothing else.

It is bookkeeping _about_ the mirror rather than training data, so 0006's rule
is not breached. It is excluded from the sync's upsert `set` clause so a refresh
cannot clear it — **except for restored members, where it is cleared on purpose**,
so someone returning to the roster is re-examined rather than silently skipped.

## Two things that keep the cron honest

**The job is driven by the null column, not by the CID lists the sync returns.**
`syncRoster()` does now return `addedCids`/`restoredCids`/`removedCids`, and they
are useful, but selecting on `certificationsCheckedAt IS NULL` is what makes the
job correct: the first run has a backlog no single sync produced, a failed lookup
has to be retried later, and an `IN (...)` over 157 CIDs would exceed **D1's
100-bound-parameter limit** — the bug that bit the roster sync.

**Lookups are capped per run, decidable members are not.** A Worker invocation
has a subrequest budget. `needsVatsimLookup()` settles two cases without any HTTP
at all — already certified, or a rating that carries nothing — which after the
import covers 153 of 157 members. The cap only bounds the genuinely unknown.

## Consequences

- The import from community-website has to run **before** the arrival job is
  enabled, or inferred grants collide with imported ones on the unique index.
  It ships as data migration `0003`, so local and production get identical data.
- `grantCredential()` and `revokeCredential()` are the only writers. The arrival
  job, the import and the staff edit view all go through them, so the Discord
  notification work (blocked on DEV-113) has one producer site to hook rather
  than three call sites to find.
- **Search by operating initials is not possible.** DEV-115 asks for search by
  "cid, name, or ci once identity saves CI", but identity's typed RPC surface is
  `getSessionContext(token)` and nothing else, so there is no way to look up
  another controller. CID and name only until identity changes.
- Nothing grants `training:certifications:edit` yet, so the staff page is
  inaccessible until identity implements and assigns the role — filed separately,
  the same release task 0005 flagged.

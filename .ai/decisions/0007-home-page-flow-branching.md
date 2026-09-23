# 0007 — Home page sorts members into one of four paths

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-112
- **Supersedes:** the public-path part of
  [0004](0004-gate-in-handle-not-layout.md) — `/stats` is no longer public

## Context

DEV-112: "When a VATSIM member is logged in, the home page should display
information based on their current roster and rating." The ticket lists three
outcomes; the roster's `membership` field splits one of them in two.

## Decision

`/` renders one of four branches, resolved by `resolveTrainingFlow()` in
`src/lib/training-flow.ts`:

| Branch                | Who                          | What they see                                                |
| --------------------- | ---------------------------- | ------------------------------------------------------------ |
| `enroll`              | on the roster as `home`      | The enrollment entry point                                   |
| `visiting-controller` | on the roster as `visit`     | Copy: visitors control here but train at their home facility |
| `transfer-or-visit`   | not rostered, S1+            | Copy: transfer to us, or visit                               |
| `become-controller`   | not rostered, OBS or unrated | Copy: get rated first                                        |

The logic is a pure function taking `{membership, ratingId, ratingShort}`, so
every branch is unit-testable without a database or a session.

## Roster is checked before rating, and this matters

The live ZID roster contains **OBS controllers** (verified 2026-09-20:
`rating_short` ranges over OBS, S1, S2, S3, C1, C3, I1, I3, SUP). Sorting on
rating first would send a rostered observer — someone already training with us —
down the "you should become a controller" path they have visibly completed.

There is a test pinning this specific case.

## Unknown rating resolves downward

Identity's `VatsimProfile` makes `vatsim`, `rating` and `short` all optional, so
the rating can genuinely be missing. When it is, the member is treated as
**unrated** and gets the "become a controller" copy. Guessing upward would tell
someone they can transfer a rating they may not hold.

Rating is read from the roster row when we have one (the facility's own record)
and falls back to identity's VATSIM snapshot otherwise.

## `/stats` is no longer public

0004 kept `/stats` reachable signed-out on DEV-111's transparency framing. That
is reversed: this app is training-only, and the requested signed-out experience
is a sign-in CTA and nothing else.

`/` stays on the public allowlist — **it is the only public path** — precisely
so it can render that CTA. Gating `/` would redirect anonymous visitors straight
to identity and leave the app with no landing page.

Nav links are also hidden signed-out, since every destination is gated and
advertising them just bounces people through a login round trip.

## Not decided here

Whether visiting controllers should eventually be able to enroll for ZID
certifications. Today they get copy pointing at a transfer. If that changes, it
is a copy change plus one branch in `resolveTrainingFlow`.

> Partly decided since: visiting C1+ controllers without Tier 2 are pointed at
> the self-led Tier 2 course, and home controllers must consolidate before
> enrolling. See [0012](0012-enrollment-eligibility.md).

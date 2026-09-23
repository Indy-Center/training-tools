# 0012 — Who may start an enrollment, and what an open one shows

- **Status:** accepted
- **Date:** 2026-09-23
- **Extends:** [0007](0007-home-page-flow-branching.md), which it grows from four
  branches to six

## Context

0007 offered the enrollment button to every rostered home controller and told
every visitor they could not enroll. Three refinements were asked for:

1. A home controller must **consolidate** their current rating before starting
   their next course, with a requirement per rating that is settable in config.
2. Anyone certified **E-RC without `T2-CTR`** — home or visiting — should be
   pointed at the self-led Moodle course for Tier 2. Visitors below E-RC keep
   0007's copy: formal training slots are for home controllers.
3. A home controller with a request open should see **where it is**, not just a
   "view your request" button.

## Decisions

### One resolver, one loader, three routes

`resolveTrainingFlow()` in `src/lib/training-flow.ts` is still the only place
the rules live. `loadTrainingContext()` in `src/lib/server/training-flow.ts`
gathers its inputs and is what `/`, `/enroll` and `/enroll/tier-2` all call:

| Route            | Allowed when                              |
| ---------------- | ----------------------------------------- |
| `/`              | always; renders the branch                |
| `/enroll`        | `flow === 'enroll'` (load and `?/enroll`) |
| `/enroll/tier-2` | `flow === 'tier-2'`                       |

A page and the button linking to it cannot disagree, because neither restates
the rule. `?/withdraw` is deliberately **not** gated: it only touches the
caller's own request, scoped by CID, and giving a place back must never wait on
a VATSIM lookup.

### Order within home controllers

1. Open request → `enroll` (it always shows, whatever else has changed).
2. Holds E-RC, not T2-CTR → `tier-2`. No consolidation lookup.
3. Consolidated → `enroll`, otherwise `consolidating`.

The loader resolves once without a consolidation. A missing consolidation fails
closed to `consolidating`, which happens only when the answer actually depends
on it, and only then does the loader call VATSIM and resolve again. The loader
does not repeat the ordering.

### Tier 2 is keyed on the credential, not the rating

A C1 is only certified E-RC here once the arrival job or staff grant it, and
`T2-CTR` requires E-RC. So `isDueTier2(held)` is "holds E-RC, lacks T2-CTR".
That covers home controllers who trained up, transfers, and visitors, with no
rating arithmetic.

### Consolidation is hours at the current rating, from VATSIM

VATUSA's general division policy uses "consolidate" to mean hours controlled at
your current rating, and VATSIM's `/v2/members/{cid}/stats` already breaks hours
down by the rating held at the time — the same endpoint the arrival job uses for
SUP/ADM. So an S2 is measured on their `s2` hours; S1 time does not count.

These hours are **network-wide**. VATSIM does not split them by facility, so a
controller who consolidated elsewhere is counted as consolidated here.

`CONSOLIDATION_HOURS` in `src/lib/config.ts` holds the requirement per short
rating. Absent means no requirement: OBS has nothing to consolidate, and there
is no course after E-RC. **The shipped numbers are placeholders** until the
training team sets them.

### Fail closed when VATSIM does not answer

The lookup has a 5 s timeout and returns null on any failure, which becomes an
`unknown` consolidation and the "we couldn't check" copy. Letting everyone
through during an outage would defeat the requirement.

### What an open request shows

Status copy (labels, colours, the "what happens next" line) moved out of
`/enroll` into `src/lib/enrollment-status.ts`, so both pages say the same thing.

| Status                                | Home page shows                                         |
| ------------------------------------- | ------------------------------------------------------- |
| `waitlist`                            | Position in the course's queue, and a link to `/stats`  |
| `in-training`                         | The course's Moodle link, or "your mentor will share …" |
| `rating-exam`, `certification-update` | The wait instruction; nothing for them to do            |

Moodle links come from `MOODLE_COURSE_URLS` in config, keyed by credential code
(including `T2-CTR`). It is empty until `indy-moodle` publishes courses, and
every use has a fallback.

> **The waitlist position overcounts until DEV-111.** It is counted from D1, and
> nothing syncs statuses back from Jira yet — see
> [0008](0008-enrollment-record-in-d1-jira-owns-the-queue.md). Anyone staff have
> moved to In Training in Jira still reads `waitlist` here. For the same reason
> the `in-training`, `rating-exam` and `certification-update` branches are
> unreachable until that sync exists.

### Tier 2 is a page, not an enrollment record

`/enroll/tier-2` explains the course and links to it. Nothing is written: Tier 2
has no TRK course option, no mentor and no waitlist, and staff grant `T2-CTR` on
completion.

## Not decided here

- Whether consolidation should count only ZID hours. That needs a per-session
  pull from `/v2/members/{cid}/atc` filtered by callsign, not a stats lookup.
- Whether completing the Moodle course should record anything here.

# 2026-09-20 — DEV-108 enrollment form

Third session of the day. Follows
[`2026-09-20-dev-112-roster-flow.md`](2026-09-20-dev-112-roster-flow.md).

## What changed

`/enroll` went from a placeholder pointing at a Google Form to a working form
that records an enrollment in D1 and files it into the training staff's Jira
board.

- `enrollments` table — the second table we own, and the first one that isn't a
  mirror.
- `$lib/courses.ts`, `$lib/enrollment.ts` — course catalogue and pure validation.
- `$lib/server/jira/` — client, field ids, payload builder.
- `$lib/server/enrollments/` — submit, withdraw, and the cron reconcile.
- `/enroll` gated on **home** roster membership in both the load and the actions.
- Home page CTA now distinguishes "start a request" from "view your request".

ADR [0008](../decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md),
research [jira-student-tracking](../research/jira-student-tracking.md).

## The open question from last session, answered

"Is D1 the waitlist, or is Jira the waitlist with D1 mirroring it?"

**Neither, quite.** Reading the live Jira changed the framing: the waitlist is
project `TRK`, a properly modelled workflow with triage, per-course routing,
instructor assignment and milestone dates, worked daily by training staff. Not
something to replace.

So: **D1 owns the enrollment record, Jira owns the queue.** The row commits
before Jira is contacted, which means a Jira outage delays the filing instead of
losing the request, and we still own the record certifications will hang off.

Decided with the requester, along with:

- Jira credentials provisioned now, push wired live.
- All six courses offered; the student chooses. Rating/certification-based
  placement is blocked on a prior question — see Open below.
- **Discord id and email do not go to Jira.** Derivable from the roster mirror
  or identity whenever automation actually needs them. Narrows DEV-110.
- Discord notification deferred to a shared notification service, filed as
  **DEV-113**, rather than wedged into this ticket.

## The thing worth remembering

> **Postscript, same day:** the ARTCC then removed the triage step, so new
> issues start at `Waitlist` after all — and re-reading the workflow turned up
> two statuses we had never seen (`Certification Update`, `Removed`). The app
> was updated to match; see
> [ADR 0009](../decisions/0009-trk-workflow-lost-its-triage-step.md). The lesson
> below survives the reversal intact, and arguably got stronger: the extra two
> statuses were invisible on the board because no issue was sitting in them.

**A new enrollment lands in TRK status `New Enrolments`, not `Waitlist`.**

The board has an Accept/Reject triage step. I got this wrong first time and
defaulted `enrollments.status` to `waitlist`, which would have told students
they had a place in a queue nobody had admitted them to.

The reason it was wrong is the interesting part: all 31 issues on the board had
already been triaged, so sampling them made `Waitlist` look like the entry
point. It only surfaced by **creating a real issue and reading its status back**.

**Sampling existing rows does not reveal a workflow's entry point.** Same shape
as last session's D1 parameter limit — a property of the live system that no
amount of reading the existing data reveals.

Fixed by adding `submitted` and `rejected` to the status vocabulary, defaulting
to `submitted`, and labelling it "Awaiting review" in the UI. Migration 0001 was
regenerated rather than stacked on, since the table existed only in local dev.

## The other thing worth remembering

**A whitespace-padded API token fails as a 400, not a 401.**

A leading space on `JIRA_API_TOKEN` in `.dev.vars` made Jira answer _"the target
project does not exist, or you do not have permission to create issues in that
project"_ — which reads like a Jira permissions problem and sent me looking in
entirely the wrong place. The request was simply anonymous.

`resolveJiraConfig()` now trims every value. Also: Jira returns errors in the
Atlassian account's display language (ours came back in Chinese), so don't
pattern-match on error text.

## Verified

Against live Jira, creating and then deleting three real issues (TRK-39, 40, 41
— all removed, board back to 31):

| Check                             | Result                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Every custom field maps correctly | course, CID, name, notification pref, availability, waitlisted date all landed |
| Summary convention                | `Name – Course (CODE)`, en-dash, matches board                                 |
| ADF for textarea + description    | accepted; plain strings would 400                                              |
| Initial status                    | `New Enrolments` — the triage state                                            |
| Withdrawal comment                | posted                                                                         |

The failure path, deliberately exercised:

| Step                                             | Result                                     |
| ------------------------------------------------ | ------------------------------------------ |
| Row seeded with null key + simulated sync error  | as if Jira had been down                   |
| `wrangler dev --test-scheduled` → `/__scheduled` | filed as TRK-40, `jira_sync_error` cleared |
| Cron run a second time                           | key unchanged, **no duplicate issue**      |
| Default status on a fresh insert                 | `waitlist` (re-verified after ADR 0009)    |

Re-verified after the workflow change with TRK-42, created and deleted: initial
status `Waitlist`, transitions `Assign Teacher` and `Remove from Waitlist`.

`npm run format:check && npm run build && npm run check && npm test` — green, 64
tests.

## Open / next

- **Still nobody has signed in.** Everything here was verified through the cron
  and direct D1/Jira calls, because that path needs no VATSIM session. The form
  UI itself — and the four home-page branches from last session — have still not
  been rendered by a human. That is the first thing to do next session.
- `JIRA_USER_EMAIL` / `JIRA_API_TOKEN` are set locally but **not yet in
  production**. `wrangler secret put` both before deploying, or enrollments will
  save unfiled until they exist (which is at least the designed failure mode).
- D1 migration has not been applied to production (`npm run db:migrate` /
  CI `--remote`).
- **Certification assignment for already-rated controllers** — the blocker on
  course placement. Today the student picks from all six and staff confirm.
  Deserves its own session; probably needs a training-staff conversation about
  how a transferring C1 maps onto our course ladder.
- Enrollments are filed under a named person's API token, so the board
  attributes every one of them to that account. A service account would be
  better.
- Nothing tells a student their request was rejected. DEV-113 is the vehicle.
- Still unverified: whether the Cloudflare account is on Workers Paid, which
  DEV-113 depends on.
- Branch protection / PR flow still not set up; these commits went to `main`.

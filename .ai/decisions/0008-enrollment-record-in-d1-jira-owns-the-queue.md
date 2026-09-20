# 0008 — D1 owns the enrollment record, Jira owns the queue

- **Status:** accepted, with one section superseded
- **Date:** 2026-09-20
- **Ticket:** DEV-108
- **Superseded in part by:**
  [0009](0009-trk-workflow-lost-its-triage-step.md) — the ARTCC removed TRK's
  triage step later the same day, so "A new request is `submitted`, not
  `waitlist`" below is **no longer true**. Everything else here stands.

## Context

DEV-108 replaces a Google Form with a real enrollment form. The open question
left by [0006](0006-training-tools-owns-the-roster.md) and the DEV-99 research
was: **is D1 the waitlist, or is Jira the waitlist with D1 mirroring it?**

Reading the live Jira answered most of it. The waitlist is not a spreadsheet
someone is tolerating — it is project `TRK`, a modelled workflow with a triage
step, per-course routing, instructor assignment and milestone dates, and the
training staff work it daily. See
[`../research/jira-student-tracking.md`](../research/jira-student-tracking.md).

Meanwhile this app is meant to become the certification system of record, and
DEV-101 will hang training history off the enrollment.

So neither "replace Jira" nor "Jira is the only record" is right.

## Decision

**The enrollment record lives in D1. The queue lives in Jira.**

The form writes an `enrollments` row and commits it, then files a TRK issue and
writes the key back onto the row. Two consequences follow, and both are the
point:

1. **The submission cannot be lost to a Jira outage.** The row exists before
   Jira is contacted.
2. **We own the training record.** Certifications key onto it later without
   asking Atlassian for permission.

Staff keep the board they already have. We do not build an admin queue (that is
DEV-106), and we do not read statuses back yet (that is DEV-111).

## What happens when the Jira write fails

This is the part worth spelling out, because it is the whole justification for
the ordering.

1. The insert commits. `jiraIssueKey` is null.
2. One push attempt, no inline retry — making a student wait on a service that
   is already unhappy helps nobody.
3. The failure is recorded in `jiraSyncError`, `jiraSyncAttempts` increments,
   and **the student sees success**, because their request _is_ recorded.
   Whether it has reached the board is our problem, not theirs.
4. The existing 15-minute cron reconciles: rows with no issue key and no
   withdrawal get retried, oldest first.
5. Only rows with a null key are ever pushed, so a duplicate would need two
   concurrent cron runs — which Cloudflare does not do for one scheduled trigger.
6. Attempts cap at 5. A revoked token or a permanently malformed payload stops
   hammering Jira and becomes a findable row instead of a silent retry forever.

The roster sync and the reconcile are guarded separately in `src/worker.ts`:
VATUSA being down must not stop enrollments reaching the board, and Jira being
down must not stop the roster refreshing. They share a schedule, not a fate.

Verified end to end on 2026-09-20 by seeding an unfiled row, running the real
cron, watching it file to TRK, and running it again to confirm no duplicate.

## A new request is `submitted`, not `waitlist`

> **Superseded by [0009](0009-trk-workflow-lost-its-triage-step.md).** The
> triage step described here was removed from TRK later the same day, and a new
> request now starts at `waitlist`. Kept because the reasoning — and how the
> mistake was caught — is still the point.

TRK's initial status is **New Enrolments**, with explicit _Accept Enrollment_
and _Reject Enrollment_ transitions. Being on the waitlist is something training
staff grant.

So `enrollments.status` defaults to `submitted` and the UI says "Awaiting
review". An earlier draft of this work defaulted to `waitlist` — that was wrong,
and it would have told students they had a place in a queue nobody had admitted
them to.

The mistake was inevitable from the data: every issue on the board at the time
had already been triaged, so the initial status was invisible until we created a
real issue and read it back. **Sampling existing rows does not reveal a
workflow's entry point.**

## Discord ids and emails do not go to Jira

DEV-110 asks for "CID, name, email, discord id with the enrollment for Jira to
use". We send CID and name, and deliberately not the other two.

Both are derivable whenever something actually needs them — from
`roster_members.discord_id` (155 of 157 members) or identity's
`attributes.discordId`. The consumers are later automation: role assign/remove,
DMs, channel mentions. Copying them onto a Jira issue creates a second version
to keep honest, in a system we do not own, for no present benefit. The CID is
the join key, and it is on the issue.

This narrows DEV-110 rather than completing it.

## Consequences

- `enrollments` keys on `cid` with **no foreign key onto `roster_members`**,
  for the reason 0006 gives: a VATUSA removal must not delete training history.
- The row carries `submittedName` and `submittedRating` but no email or Discord
  id — name because it is what we put in the issue summary, rating because "S2
  when they enrolled" is history a current lookup cannot reconstruct.
- One open enrollment per CID: you train one course at a time. Because that
  could otherwise dead-end someone who picked the wrong course, students can
  withdraw, which comments on the issue rather than transitioning it — closing
  it is the training staff's call.
- `/enroll` is gated on roster membership in both the load and the actions.
  `hooks.server.ts` only checks for a session, and per
  [0004](0004-gate-in-handle-not-layout.md) a form action runs before any load.

## Not decided here

- Whether enrollments should be filed by a service account rather than a named
  person's API token.
- Whether the app tells a student their request was rejected, and how.
- Course placement by rating or certification. The form offers all six courses
  and training staff confirm placement, because we hold no certification data
  yet. **This is blocked on a prior question: how certifications get assigned to
  controllers who arrive already rated.** Worth its own session.
- Generating courses from a repo of markdown, which will mean creating Jira
  select options programmatically. `$lib/courses.ts` keeps code, label and Jira
  option id in one record so that generator has a single place to write.
- Notifying a Discord channel on new enrollment. Deferred to a shared
  notification service (Cloudflare Queues), filed separately, rather than built
  here — with one producer and one message type the contract would be designed
  in the dark, the same reasoning 0006 used to defer the RPC surface.

# 0009 — TRK's triage step was removed; enrollments start on the waitlist

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-108
- **Supersedes:** the "A new request is `submitted`, not `waitlist`" section of
  [0008](0008-enrollment-record-in-d1-jira-owns-the-queue.md). The rest of 0008
  — D1 owns the record, Jira owns the queue, and the failure/reconcile
  behaviour — is unchanged.

## Context

0008 recorded that TRK's initial status was `New Enrolments`, with _Accept
Enrollment_ and _Reject Enrollment_ transitions in front of `Waitlist`, and set
`enrollments.status` to default to `submitted` so the app would not tell a
student they had a waitlist place before anyone had looked.

The ARTCC then restructured the workflow so that new issues start on the
waitlist directly. Re-read from the live project the same day.

## What the workflow is now

```
Waitlist ──Assign Teacher──> In Training ──> Rating Exam ──> Certification Update ──> Completed
   │
   └────Remove from Waitlist───> Removed
```

| Status               | Id      | Was in 0008?                  |
| -------------------- | ------- | ----------------------------- |
| Waitlist             | `10065` | yes — now the **initial** one |
| In Training          | `10066` | yes                           |
| Rating Exam          | `10071` | yes                           |
| Certification Update | `10070` | **no — new to us**            |
| Completed            | `10068` | yes                           |
| Removed              | `10067` | **no — new to us**            |

`New Enrolments` (`10063`) and `Enrollment Rejected` (`10069`) are **gone**.

Two statuses we had never seen turned up. `Certification Update` sits between
the rating exam and completion — the gap the `Certificate Updated` date field
always implied. `Removed` is where staff put someone they take off the waitlist,
and it replaces `Enrollment Rejected` as the terminal not-completed state.

## Decision

Follow the workflow. `enrollments.status` defaults to `waitlist` again, and the
vocabulary is the six live Jira statuses plus our own `withdrawn`.

**`withdrawn` stays separate from `removed`.** They look similar and are not the
same event: one is the student stepping back, the other is staff taking them
off. Collapsing them would lose that distinction the moment DEV-111 starts
reading statuses back, and "why did this person leave the waitlist" is exactly
the question a waitlist report gets asked.

`certification-update` is **not** a closed status. The request is still in
flight there, so someone in it cannot start a second course.

## How this was caught, again

By creating a real issue and reading its status back — not by inspecting the
board, and not by taking the change description at face value. That is how 0008
found the triage step in the first place, and it is the only reliable way: the
extra two statuses would not have shown up any other way, because no issue on
the board is sitting in them.

Sampling existing rows tells you where issues _are_. It does not tell you where
they _start_, and it does not tell you which states exist but are currently
empty.

## Consequences

- Migration `0001` was regenerated rather than amended with an `ALTER`, because
  the `enrollments` table exists only in local dev — production was checked and
  has `roster_members` and nothing else. The same call as when 0008 changed the
  default in the other direction.
- The student-facing status copy is per-status now rather than a two-way
  branch, since there are six states a student can legitimately be in.
- **Withdrawal still comments on the issue rather than transitioning it**, even
  though a suitable transition now demonstrably exists (`9`, "Remove from
  Waitlist" → `Removed`, available from `Waitlist`). Two reasons: it is only
  reachable from `Waitlist`, so it would silently do nothing for someone already
  in training; and moving a student off the staff board without staff involvement
  is a policy call the training team should make, not one this app should assume.
  Flagged for them — if they want it, it is a small change.

## Watch out

This is the second workflow change in a day. The status ids here are current as
of 2026-09-20 and nothing else; treat
[`../research/jira-student-tracking.md`](../research/jira-student-tracking.md)
as the live record and re-verify before relying on an id.

Nothing in the app reads statuses back from Jira yet, so a future workflow change
breaks nothing at runtime today — it just makes this vocabulary stale. That
changes when DEV-111 lands, and at that point a status we do not recognise needs
a defined behaviour rather than a crash.

# Jira TRK — the training waitlist

**Verified on 2026-09-20** by reading the live project and creating, inspecting
and deleting three real issues. Jira configuration drifts; re-check before
relying on any id here.

<https://zidartcc.atlassian.net/browse/TRK>

## What it is

Project **`TRK` / "Student Tracking"**, one issue type: **Student Enrollment**
(id `10057`, "A student seeking training"). This is the queue the training staff
actually work, and it long predates this app.

We do **not** own it. `training-tools` owns the enrollment record in D1 and
files an issue here from it — see
[`../decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md`](../decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md).

## The workflow

**This changed once already on 2026-09-20** — an earlier `New Enrolments` triage
step in front of `Waitlist` was removed, along with `Enrollment Rejected`. Both
ids are dead. See
[`../decisions/0009-trk-workflow-lost-its-triage-step.md`](../decisions/0009-trk-workflow-lost-its-triage-step.md).
Re-verify before trusting anything below.

```
Waitlist ──Assign Teacher──> In Training ──> Rating Exam ──> Certification Update ──> Completed
   │
   └────Remove from Waitlist───> Removed
```

| Status               | Id      |
| -------------------- | ------- |
| Waitlist             | `10065` |
| In Training          | `10066` |
| Rating Exam          | `10071` |
| Certification Update | `10070` |
| Completed            | `10068` |
| Removed              | `10067` |

**A created issue lands in `Waitlist`** — it is the initial status, so filing an
issue really does put someone in the queue.

Transitions available from `Waitlist`: `8` "Assign Teacher" → In Training, `9`
"Remove from Waitlist" → Removed.

`Removed` is where staff put someone they take off the waitlist. We keep our own
`withdrawn` separate from it, because a student stepping back and staff removing
them are different events and a waitlist report will want to tell them apart.

### The only way to read this reliably

Create a real issue and read its status back, then delete it. Listing the
board's issues does **not** work: it shows where issues currently _are_, not
where they _start_, and it hides any status that happens to be empty.

Both `Certification Update` and `Removed` were invisible until the project's
status list was queried directly — no issue on the board was sitting in either.
The original `New Enrolments` entry point was missed the same way, because all
31 issues had already been triaged past it.

## Fields

Required to create: `project`, `issuetype`, `summary`, `Course of Training`, `CID`.

| Field                     | Id                  | Type         | Who fills it   |
| ------------------------- | ------------------- | ------------ | -------------- |
| Course of Training        | `customfield_10241` | select       | us             |
| CID                       | `customfield_10242` | text         | us             |
| Name                      | `customfield_10243` | text         | us             |
| Notification Prefrence[^] | `customfield_10244` | select       | us             |
| Availability              | `customfield_10245` | **textarea** | us             |
| Waitlisted                | `customfield_10246` | date         | us             |
| Teacher Assigned          | `customfield_10247` | date         | training staff |
| Training Completed        | `customfield_10248` | date         | training staff |
| Certificate Updated       | `customfield_10249` | date         | training staff |
| Teacher                   | `customfield_10250` | select       | training staff |
| Removed                   | `customfield_10251` | date         | training staff |
| RE Completed              | `customfield_10253` | date         | training staff |
| RE Instructor             | `customfield_10254` | select       | training staff |

[^]: Jira's own spelling of "Preference". Matching it is not our call.

### Option ids

`Course of Training` — kept in [`$lib/courses.ts`](../../src/lib/courses.ts)
alongside each course code, so the future markdown-driven course generator has
one place to write:

| Course                         | Option id |
| ------------------------------ | --------- |
| Simple Ground Control (S-GC)   | `10088`   |
| Advanced Ground Control (A-GC) | `10091`   |
| Simple Local Control (S-LC)    | `10092`   |
| Advanced Local Control (A-LC)  | `10093`   |
| Terminal Radar Control (T-RC)  | `10094`   |
| Enroute Radar Control (E-RC)   | `10095`   |

`Notification Prefrence`: Discord Message `10089`, Email `10090`.

`Teacher` and `RE Instructor` are selects of instructor initials (CT, CY, HI,
JR, MB, MO, SW, YG, RS; RE Instructor also has VATUSA). Not a user picker, so
there is no account to map to — relevant whenever DEV-106's teacher roster
lands.

## Gotchas that cost time

- **Summary convention**: `Name – Course (CODE)`, with an **en-dash**, e.g.
  `Todd Schneider – Simple Ground Control (S-GC)`. Staff read that column; a
  hyphen would look like a different system wrote it.
- **REST v3 wants ADF, not strings**, for `description` and for the
  **textarea** custom field `Availability`. A plain string is a 400. The plain
  text fields (`CID`, `Name`) do take strings.
- **A whitespace-padded API token fails as a 400, not a 401.** A leading space
  on `JIRA_API_TOKEN` made Jira answer
  `"target project does not exist, or you do not have permission"`, which reads
  like a permissions problem and is not. `resolveJiraConfig()` trims every
  value for exactly this reason.
- Errors come back in the **Atlassian account's display language** — ours
  returned Chinese. Don't pattern-match on error text.

## Auth

Basic auth, `base64(email:api_token)`, against `https://zidartcc.atlassian.net`
— a classic (unscoped) API token from
<https://id.atlassian.com/manage-profile/security/api-tokens>. Not a service
binding: Atlassian is not on our Cloudflare account.

`JIRA_BASE_URL` and `JIRA_PROJECT_KEY` are vars in `wrangler.jsonc`;
`JIRA_USER_EMAIL` and `JIRA_API_TOKEN` are Worker secrets. The token carries the
permissions of the human it belongs to — worth revisiting if the ARTCC wants
enrollments filed by a bot account rather than an individual.

## Not answered yet

- Whether the issues should be reported by a service account instead of a
  person, so the board doesn't attribute every enrollment to one staff member.
- Whether a student withdrawing should transition the issue to `Removed`
  (transition `9`) rather than just commenting on it. The transition exists and
  works, but only from `Waitlist`, and taking someone off the staff board
  without staff involvement is the training team's call.
- Whether a removal should be communicated to the student by this app, and what
  it should say.
- Adding new `Course of Training` options programmatically, which the
  markdown-driven course work will need. Jira has a field-options API for
  select custom fields; untested here.

# DEV-99 — Controller Training Platform: where this app is going

**Read from Jira on 2026-09-20.** Statuses drift; re-check
<https://zidartcc.atlassian.net/browse/DEV-99> before planning.

## The epic

> Track controllers from waitlist through certification: async training content
> and quizzes live in Moodle, live tracking, grading, and CTRS reporting live in
> a new training app. The training app becomes the certification system of
> record, shared with community-website and Discord.

Two things in that sentence shape architecture well beyond the first story:

- **Moodle owns async content; this app owns live training.** There's an empty
  `Indy-Center/indy-moodle` repo standing by. Expect an integration boundary,
  and expect Moodle to want to embed views from this app in an iframe (named
  explicitly in DEV-106).
- **This app becomes the certification system of record.** Certifications
  currently live in `community-website`'s D1. At some point they move here and
  community-website and the Discord bot become consumers. Design schema with
  that in mind rather than treating certs as private state.

## Stories

### DEV-100 — New controller enrollment & waitlist visibility _(In Progress)_

> Replace the Google Form enrollment and manual waitlist tracking with custom
> form. Students also get a self-service "where am I in line" view sourced from
> the existing Jira waitlist.

| Subtask                                     | Status                 | Notes                                                                                                                                                     |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEV-107 Spin up new training management app | done in this iteration |                                                                                                                                                           |
| DEV-109 Connect to identity                 | done in this iteration |                                                                                                                                                           |
| DEV-108 Create a training enrolment form    | next                   | first D1 tables land here                                                                                                                                 |
| DEV-110 Auto-include controller info        | after 108              | "CID, name, email, discord id with the enrollment for Jira to use" — all four are already on `SessionContext.user` (discord id is `attributes.discordId`) |
| DEV-111 Waitlist stats views                | after 108              | students in training + waitlisted per course; "expected time to complete each course (based on one lesson per week)"                                      |

**Note the Jira coupling.** The waitlist lives in Jira today, and DEV-110 says
the enrollment data is "for Jira to use". DEV-106 later wants an "admin waitlist
dashboard reading/writing Jira". So the enrollment flow probably writes a Jira
issue rather than owning the queue outright — confirm the intended direction
before designing DEV-108's schema, because "D1 is the queue" and "Jira is the
queue, D1 mirrors it" are very different builds.

### DEV-101 — Student training cycle

Curriculum combining Moodle content with live practical lessons: lesson plans,
per-area numeric grading, notes. Completion generates a CTRS submission.

Two requirements with real design weight:

- **CTRS needs two generation paths**: instructor-graded lessons, and self-led
  Moodle completions.
- **Curriculum and grading definitions are app data, admin-editable, not
  GitHub-managed — and must be versioned.** A lesson record references the
  curriculum version active when the lesson _started_, not a live pointer, so a
  mid-cohort rubric change doesn't retroactively alter grading criteria for
  lessons already in progress. That's a schema decision, and it's much cheaper
  to get right in DEV-108 than to retrofit.

### DEV-106 — Training platform enhancements

Grab-bag of later work: resource calendar (2-per-facility cap, soft
adjacent-facility warning), teacher roster VATUSA import + capacity preference,
admin waitlist dashboard reading/writing Jira, visitor path (VATUSA eligibility
check + auto-processed application), self-led courses and their CTRS path,
certification queue → Discord role assignment, Moodle iframe embedding.

## External systems this will touch

Jira (waitlist), Moodle (content/quizzes, iframe embedding), VATUSA (roster
import, visitor eligibility, CTRS), Discord (role assignment), identity
(auth, roles, `discordId`), community-website (certification consumer).

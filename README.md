# training-tools

Controller training management for Indy Center, at
[training.flyindycenter.com](https://training.flyindycenter.com). Students enroll,
track their progress toward certification, and see where they are on the
waitlist; instructors and training staff manage that process.

Part of [DEV-99 — Controller Training Platform](https://zidartcc.atlassian.net/browse/DEV-99).

## HTTP surface

| Route                        | Auth       | Purpose                                                                |
| ---------------------------- | ---------- | ---------------------------------------------------------------------- |
| `GET /`                      | public     | Sign-in CTA signed out; signed in, the view for their situation        |
| `POST /`                     | required   | `?/enroll` submits an enrollment; `?/withdraw` withdraws an open one   |
| `POST /api/jira/webhook`     | HMAC       | TRK "issue updated" deliveries; re-reads the issue's status            |
| `GET /enroll/tier-2`         | required   | The self-led Tier 2 course, for anyone with E-RC but not T2            |
| `GET /waitlist`              | required   | Per-course counts and your own place; for staff, everyone waiting too  |
| `GET /stats`                 | required   | Redirects to `/waitlist`, which replaced it                            |
| `GET /enroll`, `/dashboard`  | required   | Redirect to `/`, which replaced both                                   |
| `GET /certifications`        | staff      | Search the roster by CID or name                                       |
| `GET /certifications/{cid}`  | staff      | One controller's credentials and their full history                    |
| `POST /certifications/{cid}` | staff      | `?/setCertification`, `?/toggleEndorsement`                            |
| `POST /waitlist`             | staff      | `?/assignVatusa`, `?/completeVatusa`, `?/assignTeacher`                |
| `GET /teach`                 | teacher    | A teacher's assigned students, slots and qualifications                |
| `POST /teach`                | teacher    | `?/completeTraining`, `?/claimExam`, `?/completeExam`                  |
| `GET /teach/report/{id}`     | teacher    | A training report form for one of their students                       |
| `POST /teach/report/{id}`    | teacher    | `?/submit` files the report in VATUSA's CTRS                           |
| `GET /teachers`              | admin      | The teacher roster, open slots, TRK dropdown drift                     |
| `GET /teachers/{cid}`        | admin/self | One teacher's profile, students and timeline                           |
| `POST /teachers/{cid}`       | admin/self | `?/updateProfile` (self too), `?/updateAdmin`, `?/setQualifications`   |
| `GET /admin`                 | admin      | Requests that never reached TRK, and the health of the background jobs |
| `POST /admin`                | admin      | `?/retry` files a stuck request again                                  |
| `GET /admin/audit`           | admin      | Finished courses waiting on the TA                                     |
| `POST /admin/audit`          | admin      | `?/complete` moves the card to Completed                               |

`?/enroll` and `/enroll/tier-2` are open only to members `/` offers them to —
both gate on `loadTrainingContext()`, the same call `/` renders from.
`/certifications` requires `training:certifications:edit`. These are enforced in
the load **and** in every action that needs it — `hooks.server.ts` only checks
for a session, and a form action runs before any load. `?/withdraw` is only
scoped to the caller's own request. Because `/` is public, its two actions
check for a session themselves; no other route has to.

**Nothing grants `training:certifications:edit` yet**, so `/certifications` is
unreachable until identity implements and assigns the role. That is a release
task, not a bug.

`/teach` is for anyone on the **teacher roster** — derived from VATUSA's `ZID:INS`
and `ZID:MTR` roles, not from an identity role. `/teachers` needs
`training:teachers:manage` (implied by `training:admin`). On `/teachers/{cid}`
a teacher may view their own page and edit only their availability and slots;
status, initials and qualifications are for training admins. Granting the role
needs no identity code change — it is one row in identity's `user_roles`. Its
`user_id` is identity's own `users.id`, not the CID, and `granted_at` is in
milliseconds.

`/` is public only so it can render the sign-in CTA. `/waitlist` needs a session:
any signed-in VATSIM member may see the counts, plus their own position. The one
other public path is `POST /api/jira/webhook`, which authenticates Jira by HMAC
signature instead of a session.

Signed in, `/` **is** the student's view — there is no separate enroll page or
dashboard. The nav links to it as **My Training** with a request open and
**Enroll** without. Which of ten views it renders is decided by
`resolveTrainingFlow()`: an open request first, then the roster.

| View                | Who                                                                    |
| ------------------- | ---------------------------------------------------------------------- |
| Waitlist            | open request on the waitlist: place in the queue                       |
| In training         | open request with a teacher: teacher and course                        |
| Rating exam         | open request at the exam: the assigned instructor                      |
| Certificate update  | open request, passed: wait                                             |
| Enrollment form     | **home**, below the highest certification, consolidated                |
| Consolidation       | **home**, below the highest certification, short of the hours          |
| Extra courses       | **home**, holds the highest certification (E-RC)                       |
| Visiting controller | on our roster as a **visitor**                                         |
| Transfer or visit   | not rostered; in the VATUSA division **and** rated S1+                 |
| Become a controller | not rostered; anyone else (VATUSA observers, other divisions, unknown) |

An open request shows whatever the member's roster status is now, so someone who
leaves mid-training can still see and withdraw it. Roster membership is checked
**before** rating — the roster contains OBS controllers, so rating-first would
misroute people already training with us. "On another VATUSA roster" is inferred
from the division identity reports plus the rating; we only mirror our own
roster. Anyone on our roster holding E-RC but not `T2-CTR` is also offered the
self-led Tier 2 course, on the extra-courses and visitor views. For a
**teacher** with nothing left to take — the highest certification, Tier 2, and
no open request — the site opens on `/teach`: the bare `/` redirects there. The
student view is still on their menu, linked as `/?view=student`, which is what
gets past the redirect.

Consolidation is hours logged at the member's **current** rating, from VATSIM's
public stats endpoint, against `CONSOLIDATION_HOURS` in `src/lib/config.ts`. A
rating not listed there has no requirement. If VATSIM cannot be reached the
member is held back rather than let through.

The in-training view links the course's Moodle entry when `MOODLE_COURSE_URLS`
has one. Scheduling and the student's next lesson will join it there.

Those statuses, the assigned `Teacher` and the rating exam's `RE Instructor` are
read back from the TRK issue two ways: a Jira webhook (`POST /api/jira/webhook`) within seconds of a change, and
the 15-minute cron sweep as the backstop. A request the student withdrew here is
never reopened by Jira.

## Scheduled work

Every 15 minutes (`*/15 * * * *`), in this order:

| Job                       | Does                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| roster sync               | Refreshes the VATUSA roster mirror (`syncRoster`)                                   |
| arrival certifications    | Grants arrivals what GCAP entitles them to (`grantArrivalCertifications`)           |
| teacher roster sync       | ZID INS/MTR → teacher roster; qualification rules (`syncTeacherRoster`)             |
| jira teacher dropdowns    | Compares TRK's Teacher/RE Instructor options with it (`checkTeacherDropdowns`)      |
| jira board import         | Creates rows for TRK issues filed by hand on the board (`importBoardIssues`)        |
| enrollment reconcile      | Files enrollments that never reached Jira (`reconcileEnrollments`)                  |
| enrollment status sweep   | Reads TRK status, Teacher and RE Instructor back (`sweepEnrollmentStatuses`)        |
| examiner cleanup          | Removes RE Instructor from cards back in training (`clearReturnedExaminers`)        |
| certification updates     | Applies what a finished course earns (`applyPendingCertificationUpdates`)           |
| vatusa course completions | Dates the card when a VATUSA written exam is passed (`completePassedVatusaCourses`) |
| discord teacher rooms     | Teacher roles and channels in Discord, through Larry (`syncTeacherRooms`)           |
| announcements             | Tells evaluators and training admins what has arrived (`announceArrivals`)          |

The list lives in `src/lib/server/scheduled.ts`; `src/worker.ts` only runs it.
Each job records how its run went in `job_health` (one row per job, latest state
only), and so does the Jira webhook for each verified delivery. `/admin` reads
that back — see [Admin](#admin).
Each job is guarded separately: VATUSA being down must not stop enrollments
reaching the staff board, Jira being down must not stop the roster refreshing,
and VATSIM being down must not stop either. A job logs a one-line summary only
when it did something, and the first failure is rethrown after every job has run.

Order matters eight times, and each is commented in `scheduled.ts`: certification
and the teacher roster read the roster the sync just wrote; the dropdown check
reads the teacher roster; the import runs before the reconcile so an
issue whose key write-back failed is adopted rather than filed twice; and the
sweep runs after it so an issue filed moments ago is read back in the same run;
and the examiner cleanup and certification pass run after it, so a card the sweep
has just seen go back into training, or arrive at Audit, is dealt
with in the same run; and the announcements run last, so a card certified a
moment ago is announced in the same run.

There are deliberately **no `/login`, `/logout` or `/callback` routes**. Identity
owns the session cookie and its whole lifecycle; this app links out to
`auth.flyindycenter.com` for both.

Everything not on the public allowlist redirects to identity's `/login`. The
gate lives in `src/hooks.server.ts`, not in a layout load: layout loads do not
re-run on nested navigation, form actions run before any load, and `+server.ts`
endpoints never run one.

Every signed-in request also records the member's VATSIM email from identity
onto their roster row. VATUSA's public roster never includes emails, so
`/certifications/{cid}` shows one only for people who have signed in here at
least once. Discord ids come from the VATUSA roster on each sync.

## Bindings

| Binding    | Type                     | What it's for                                                |
| ---------- | ------------------------ | ------------------------------------------------------------ |
| `IDENTITY` | Service (→ `identity`)   | Validates the `fic_session` cookie via `getSessionContext()` |
| `LARRY`    | Service (→ `indy-larry`) | Queues Discord notices through Larry; see Notifications      |
| `DB`       | D1 (`training-db`)       | Roster mirror, and the training data this app owns           |
| `ASSETS`   | Static assets            | SvelteKit client build                                       |

| Var                              | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| `PUBLIC_IDENTITY_URL`            | `https://auth.flyindycenter.com` (override locally in `.dev.vars`) |
| `JIRA_BASE_URL`                  | `https://zidartcc.atlassian.net`                                   |
| `JIRA_PROJECT_KEY`               | `TRK` — the Student Tracking waitlist                              |
| `DISCORD_SYNC`                   | `off`, `dry-run` or `live` — see Discord roles and channels        |
| `DISCORD_TRAINING_ADMIN_ROLE_ID` | The Discord role that sees every teacher channel                   |
| `CTRS_SUBMIT`                    | `live` files training reports; anything else only checks them      |

| Secret                | What it is                                                       |
| --------------------- | ---------------------------------------------------------------- |
| `JIRA_USER_EMAIL`     | Atlassian account the API token belongs to                       |
| `JIRA_API_TOKEN`      | Classic API token, from id.atlassian.com → Security              |
| `JIRA_WEBHOOK_SECRET` | Secret on the TRK webhook in Jira; verifies each delivery        |
| `VATUSA_API_KEY`      | ZID's VATUSA facility key; set by the deploy from the org secret |

**Auth needs no secrets** — service bindings aren't internet-reachable, so there
is no client id, client secret or signing key. The Jira secrets are unrelated to
auth: Atlassian isn't on our Cloudflare account, so it's reached over plain
HTTPS with basic auth.

Set them with `npx wrangler secret put JIRA_API_TOKEN`. Leave them unset and the
app still works: enrollments save to D1 and the cron files them once credentials
exist.

## Project layout

```
src/
├── worker.ts                  worker entry: SvelteKit fetch + the roster cron
├── hooks.server.ts            db client + session load + the route gate
├── app.d.ts                   App.Locals / App.Platform (IDENTITY is optional here on purpose)
├── lib/
│   ├── config.ts              facility id, rating thresholds, consolidation hours
│   ├── certifications.ts      credential catalogue + the GCAP rating table (client-safe)
│   ├── teachers.ts            teacher roster rules: evaluators, slots, initials (client-safe)
│   ├── activity.ts            activity_log event vocabulary and labels (client-safe)
│   ├── certification-grant.ts pure arrival-grant logic (DEV-115)
│   ├── content/               site copy as markdown, compiled at build time (DEV-119)
│   ├── course-placement.ts    pure "which course is next" logic (DEV-119)
│   ├── course-completion.ts   pure end-of-course rules: who may act, what it earns
│   ├── courses.ts             the six courses + their Jira option ids (client-safe)
│   ├── enrollment.ts          pure enrollment-form validation
│   ├── identity-links.ts      login/logout URL builders (client-safe)
│   ├── training-flow.ts       pure request+roster+rating → view logic
│   ├── enrollment-status.ts   status and contact-method labels, shared by every page
│   ├── consolidation.ts       pure hours-at-rating check that gates enrollment
│   ├── user.ts                display name + rating helpers over identity's very optional types
│   ├── components/            shared components, by what they are for:
│   │   ├── ui/                Panel, Button, Alert, Badge, ChoiceCard, FilterChip, PageHero — no knowledge of training
│   │   ├── forms/             ActionForm (a button that posts to a named action), ActionResult
│   │   ├── content/           CopyPanel, for the markdown site copy
│   │   ├── enrollment/        a request's status badge and its TRK card link
│   │   ├── teachers/          a teacher's status badge, and the teacher dropdown
│   │   ├── controller/        Timeline, one controller's history
│   │   ├── admin/             DiscordRoomsPanel
│   │   └── header/            the site header, navigation and logo
│   ├── format.ts              date formatting, pinned to one locale
│   ├── job-health.ts          pure "is this job healthy" rules for /admin
│   ├── db/schema/             drizzle tables (roster, enrollments, certifications, teachers, activity_log, job_health)
│   ├── types/vatusa.ts        VATUSA API shapes
│   ├── types/vatsim.ts        VATSIM v2 API shapes
│   ├── server/
│   │   ├── identity.ts        reads fic_session, calls the IDENTITY binding
│   │   ├── guards.ts          requireSession / requireRole, for every load and action
│   │   ├── vatusa.ts          VATUSA roster fetch (no API key needed)
│   │   ├── vatsim.ts          VATSIM v2 controlling history (no API key needed)
│   │   ├── roster/            roster lookup, search, and the reconciling sync
│   │   ├── certifications/    grant/revoke, and the arrival pass
│   │   ├── teachers/          teacher roster sync, profiles, qualifications, dropdown check
│   │   ├── notify/            Discord notices, queued through Larry
│   │   ├── timeline.ts        one controller's history, merged from every source
│   │   ├── activity.ts        activity_log writes
│   │   ├── enrollments/       submit, withdraw, waitlist position and stats, and the Jira passes
│   │   ├── scheduled.ts       the cron's job list, in order, and the runner that guards each
│   │   ├── job-health.ts      records each job's last run; read back by /admin
│   │   ├── training-flow.ts   loadTrainingContext(): the one gate for / and /enroll/tier-2
│   │   ├── jira/              Jira client, field ids, issue payload builder
│   │   └── db/                drizzle client factory
│   └── utils/permissions.ts   training:* role vocabulary
└── routes/                    plain nested folders, no route groups
```

### Roster data

This app owns roster data for the ARTCC. `roster_members` is a **mirror** of the
VATUSA roster, refreshed by cron and **soft-removed** — departed members keep
their row with `removedAt` stamped, so we can tell "never on the roster" from
"left last week". Active queries filter `removedAt IS NULL`.

Training data this app owns (certifications, endorsements, currency) keys on
`cid` **independently** and must never take a foreign key onto `roster_members`
— otherwise falling off the VATUSA roster would delete someone's training
history.

**D1 allows only 100 bound parameters per query** and the facility has more
members than that, so never write `IN (...)` over the full CID list. The sync
documents the patterns that avoid it.

### Certifications and endorsements

**This app is the certification system of record for the ARTCC.** Both kinds live
in one `certifications` table, separated by `kind`, keyed on `cid` with no
foreign key onto `roster_members`.

`$lib/certifications.ts` is the catalogue — the vocabulary, the top-down `rank`,
the prerequisites (`requires`) and the GCAP rating table — as **data rather than
branches**, so changing what the ARTCC issues is a config edit.

Note two things that bite if you assume otherwise:

- **S-LC is an endorsement, not a certification.** That is why the top-down
  "hold one certification" rule needs no exception, and why S-LC renders beside
  the ground certification for free.
- **`rank` is the ladder; there is no `tier` field.** Tier 1 / Tier 2 are GCAP's
  terms for classifying endorsements, so the word is left to mean that.

**Rows are never deleted and there is no expiry column.** A credential is held
while `revokedAt` is null and is history once it is set, so the grant/revoke
columns are the audit trail. community-website expires certifications instead
and bumps them each sync — a difference DEV-116's cutover has to reconcile.

A **partial unique index** on `(cid, code) WHERE revoked_at IS NULL` is what
stops a member who leaves and returns being granted a duplicate.

Arrivals are granted automatically each cron run from their VATSIM rating, but
only if they have controlled in the last six months — read from VATSIM API v2,
which needs no API key. SUP and ADM are not controller ratings, so their earned
rating is inferred from logged hours and always flagged for a TA.

All grants and revocations go through `grantCredential` / `revokeCredential` in
`$lib/server/certifications/` — the arrival job, the import and the staff edit
page all call them, so there is one place to hook notifications onto later.

### Teachers

The **teacher roster** is everyone holding `ZID:INS` or `ZID:MTR` on the VATUSA
roster, kept in `teachers` by the cron — never entered by hand. Leaving
soft-removes the row. The profile this app owns (status, initials,
availability, slots) is edited on `/teachers/{cid}`.

Each teacher holds a **qualification per course and endorsement**: No Qual,
Training, Teacher, or Teacher and Evaluator. Only the four rating-exam courses
can have an evaluator — S-GC (S1), A-LC (S2), T-RC (S3), E-RC (C1). Instructors
evaluate all four **automatically**, and are Teacher on every other course and
endorsement automatically too; an S3+ mentor may be made an S-GC evaluator
by hand; nobody else may evaluate. The cron drops any evaluator who no longer
qualifies to Teacher. `teacher_qualifications` is an all-time log — a change
ends one row and starts the next — and **six months off the teacher roster ends
every qualification**; someone back sooner still holds them.

**Slots**: `in-training` students use a slot; `rating-exam` students are listed
as assigned but do not. A teacher on **LOA** keeps their slots visible but none
count as open anywhere. Students are matched to a teacher by TRK's `Teacher`
value — their initials, or their CID until they have some. A teacher can also be
a student; they are never listed as their own.

**This app is the source of truth for TRK's `Teacher` and `RE Instructor`
dropdowns**, but cannot edit them: TRK is a team-managed Jira project, and Jira
has no supported API for a team-managed field's options. The cron compares them
with the roster and tells training admins what to change by hand, once per new
difference; `/teachers` shows the same list. `Teacher` should offer every active
teacher, `RE Instructor` every active teacher who evaluates anything.

Initials are entered by training admins for now. Once community-website is on
identity (DEV-5), take them from identity's `operatingInitials` instead.

### Discord roles and channels

Each teacher has a Discord **role named for their initials**, held by them and
their current students, and a **channel named for them** under Training Center
that only that role and Training Admin see. The app works out who belongs where
and asks Larry to make Discord match; `$lib/discord-rooms.ts` is the rules and
`$lib/server/discord/rooms.ts` the cron job.

- **Who holds a teacher's role:** the teacher, and their students at In Training,
  Rating Exam or Needs CATP. It comes off on the next run after they finish,
  withdraw, are removed or are reassigned. **Anyone else holding it loses it**,
  however they got it.
- **No initials, no role or channel.** A teacher on LOA keeps theirs.
- **A teacher who leaves the teacher roster loses both 48 hours later**
  (`DISCORD_ROOM_GRACE_HOURS`). The role and the channel are **deleted**, with
  the channel's messages, and anyone still assigned to them loses access. Inside
  those 48 hours nothing changes, so a role removed on VATUSA by mistake and put back
  costs nothing. A teacher who returns later starts again with a new channel.
- **Channel name:** their preferred name from identity when they have one,
  otherwise their roster name; kept in step if either changes. Two teachers who
  would collide are both named by first name and CID.
- **Existing roles and channels are adopted by name**, then remembered by ID
  (`teachers.discord_role_id`, `discord_channel_id`). An adopted channel keeps
  the permissions it has; only one Larry creates is set to "role + Training
  Admin".
- **Someone with no Discord ID, or not in the server,** is picked up on a later
  run once that changes. Nothing listens for joins.
- **Initials are written to identity** (`operatingInitials`) for any teacher
  identity knows, which means anyone who has signed in to an identity app.

`DISCORD_SYNC` in `wrangler.jsonc` switches it: `off`, `dry-run` or `live`.
**Dry run changes nothing** and shows at the bottom of `/admin` exactly what live would
do — which roles and channels would be adopted or created, and who would gain
or lose a role. Read it before going live. `DISCORD_TRAINING_ADMIN_ROLE_ID`
must be set for any channel to be made.

Live, a role or channel that cannot be synced fails the job, so the tech team
hears through the job alert; the others are still done.

One thing here is a stand-in: `$lib/server/discord/identity.ts` calls two
identity methods that exist but are not in its published interface.

### Timelines and the activity log

`/teachers/{cid}` and `/certifications/{cid}` show one timeline per controller:
roster joins and departures (every controller), teacher roster, role and profile
changes, qualification changes and certification grants and revocations. Roster
and teacher events are in `activity_log`; the rest is read from each table's own
history. `$lib/server/timeline.ts` is the only reader, because all of this is
meant to move to a **central log on identity** — that is the file to repoint.

### Notifications

`$lib/server/notify` queues notices on **Larry**, the Indy Center Discord bot,
over the `LARRY` service binding to its send Worker (`indy-larry`). Larry
delivers them, retrying rate limits and Discord outages. Callers say who to
tell (an audience) and what to say (a `Notice`); `NOTIFY_CHANNELS` in
`src/lib/config.ts` maps each audience to a channel **name** from Larry's
`SEND_CHANNELS` setting, which lives in the Indy-Center/indy-larry repo. A notice
never fails the change it describes: no binding, an unknown channel or Larry
being down is logged and nothing else.

| Audience          | Channel                 | Told about                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training-admins` | `training-admin-alerts` | a new enrollment through the form; teacher availability/slot changes; a teacher going on LOA, or leaving the teacher roster, with students assigned; qualifications the rules lowered or ended; a student withdrawing; an arrival's certification that needs review; finished courses to audit; a certification held because its card is incomplete; a card at Needs CATP |
| `instructors`     | `instructor-actions`    | a rating exam waiting to be claimed, pinging the evaluators on that course — never the student's own teacher                                                                                                                                                                                                                                                              |
| `tech-team`       | `tech-team-alerts`      | things only the tech team can fix: a background job failing and recovering; a request stuck before TRK; TRK dropdown drift; cards on the board the app cannot read, including a status it does not know                                                                                                                                                                   |

**A status renamed on the board stops the app reading every card in it.** The
board import checks each card's status on every run and tells the tech team
once per distinct set of problems (`sync_state`, like the dropdown check), so
a rename shows up within fifteen minutes rather than when a student asks.

A card at Needs CATP is described as a failed exam only when it arrived from
Rating Exam; staff can also move one there from In Training.

Only the people a notice names are pinged; nothing typed into a field can mention
anyone. **Students and teachers are not messaged by the app yet** — TRK's own
notification script still does that (DEV-176).

**Arrivals are announced once.** `enrollments.announced_status` records the last
status a request was announced at; `announceArrivals()` handles any request
whose status has moved on, however it got there, then the cron, the webhook and
each end-of-course step run it. A retake that leaves Rating Exam and comes back is
announced again. The audit notice waits until the certification is applied.

A failed job is announced when it **starts** failing and when it **recovers**,
not on every run.

The types for the binding come from `@indy-center/indy-larry-worker`.

### Enrollments

**This app owns the enrollment record; Jira owns the queue.** Submitting the
form writes an `enrollments` row and commits it, _then_ files a Student
Enrollment issue in Jira project `TRK` and writes the key back. A Jira outage
therefore delays the filing rather than losing the request — the cron retries
anything with a null `jiraIssueKey`, capped at 5 attempts.

A new request has status **`waitlist`**, which is TRK's initial status. Note the
workflow changed once during DEV-108 (a triage step in front of the waitlist was
removed), so re-verify the statuses before relying on them — and read them by
creating a test issue, not by listing the board, which hides any status no issue
is currently sitting in. The field and option ids the app uses are in
`src/lib/server/jira/fields.ts` and `src/lib/courses.ts`.

**Issues staff file by hand on the board get rows too.** Most of TRK predates
this app — the backlog was moved onto the board by hand on 2026-09-05 — so the
cron's board import creates an `enrollments` row (with `importedAt` set) for any
Student Enrollment issue no row holds, queued by its `Waitlisted` date. Those
students then see their request on `/`, are counted on `/waitlist`, and cannot file
a duplicate. An issue with no usable CID, course or date is skipped and logged
each run until someone fixes it on the board. The import is the only code that
creates rows from Jira; the sweep and webhook only update existing ones.

**`/waitlist` shows headcounts and estimates, not measured rates** (DEV-111). Each
course's length is `estimatedWeeks` in `$lib/courses.ts` — one lesson a week,
plus 20% on the high end — and is labelled as an estimate. There is no
"you'll start in N weeks": nothing records when students move between stages,
so there is no throughput to base one on.

**Custom Training** is a seventh option on TRK's course select, for training
outside the six courses. Staff put it on a card by hand; the app imports and
shows such a request like any other, but never offers it on the form and refuses
a POST naming it (`boardOnly` in `$lib/courses.ts`). It earns no credential, and
`/waitlist` lists it only while someone is in it. **Whether it ends in a rating exam
is the teacher's choice**, made on `/teach` as they mark the training complete:
to Rating Exam, or straight to Audit. Having no qualification of its own, its
exam may be claimed by anyone who evaluates any course — still never the
student's own teacher.

One open enrollment per CID — you train one course at a time. Students can
withdraw, which comments on the Jira issue **and** transitions it to `Withdrawn`
— kept distinct from `Removed`, which is what staff do.

**The form offers one course: the next in the student's progression.** It comes
from the certifications this app holds, walking the `rank` ladder and each
credential's `requires` — so an advanced-ground controller is sent to S-LC before
A-LC, because A-LC requires it. It is recomputed server-side on submit, and a
POST naming any other course is refused. (DEV-119 originally let the student
pick any course and flagged the difference to staff; that was reversed when `/`
became the one student view.) Someone the app
has placed wrongly needs their certifications corrected before they can enroll.

The student must accept the terms in `agreement.md` to submit. The enrollment
records **when** and **which version** (`agreedAt`, `agreedTermsVersion`), since
the wording will change and an acceptance date alone cannot say what was agreed.

### The waitlist, for staff

`/waitlist` is one page for two audiences. Every signed-in member sees their
own place, if they are waiting, and the counts per course. Someone with
`training:students:manage` (which `training:admin` covers) sees their own place
and then the staff sheet in place of the counts. Staff can be on the waitlist
themselves.

**The sheet's rows are loaded only for that role, not hidden from everyone
else.** The page is open to every member and the rows name people, so the load
never reads them without the role; `page.server.test.ts` pins that.

**The sheet lists every request staff are still working**, grouped by course in
the order the courses are taken: on the waitlist, in training, at the rating
exam, and needs CATP. Audit has its own page and closed requests are left out.
Chips along the top switch a status off, and a dropdown narrows to one course.

What staff do from a row:

- **The VATUSA written course**, for the three courses that need one assigned
  (A-LC → S2, T-RC → S3, E-RC → C1; `$lib/vatusa-academy.ts`). **Assign** dates
  `VATUSA Course Assigned` on the card and assigns the course on VATUSA itself
  through its API, in the name of the facility's TA — or the ATM when there is no
  TA. VATUSA emails the student. S-GC has none: the basic exam is passed before
  anyone joins a facility.
- **Assign a teacher**, for someone on the waitlist. The dropdown lists active
  teachers qualified to teach that course, most open slots first. Choosing one
  sets `Teacher` and `Teacher Assigned` on the card and moves it to In
  Training. It is refused until the written course is passed, where there is one.
- **Change the teacher**, for someone who already has one. Only `Teacher`
  changes; the card stays where it is.
- **Withdraw** (the student is giving it up) or **Remove** (staff are ending
  it). The card moves to Withdrawn or Removed, kept apart so a report can tell
  the two; either closes the request.

**Passing is picked up automatically.** The cron reads the VATUSA transcript of
everyone whose course is assigned and not yet passed, and dates
`VATUSA Course Completed` with the day they first scored 80% or more. **Mark
passed** on the page is the fallback.

Both dates, and **availability**, are read back from the card like `Teacher`.
Most cards were filed by hand and never came through the form, so the card is
the only place their availability is; an empty card never erases what a student
typed here.

The page is built from small pieces: `ManagePanel`, `SheetFilters`,
`StudentRow` and the two cells beside it in `src/routes/waitlist/`, on shared
components in `$lib/components/`. The grouping, filtering and counting are plain
functions in `$lib/waitlist.ts`.

`VATUSA_API_KEY` is ZID's facility key. Without it nothing is assigned on VATUSA
and no transcript is read; the buttons still date the card. The deploy sets it
from the `ENV_VATUSA_API_KEY` organisation secret. The VATUSA calls were written
from its API description and public source and **had not been run with a real
key** when this was written.

### Training reports (CTRS)

**File training report**, beside each student on `/teach`, opens
`/teach/report/{enrollment id}` with the student and the instructor already
filled in. The teacher gives the date and Zulu start, duration, position,
where it took place, an optional progress rating (1–5) and movement count, and notes; the
report is filed in VATUSA's training records in their name
(`POST /v2/user/{cid}/training/record`, `submitTrainingRecord`).

- **Who may file one** is `canReport` in `$lib/ctrs.ts`: the teacher or the
  examiner on an open card, never on their own enrollment. Checked in the load
  and again in the action.
- **A report can end the training.** The teacher whose training it is gets a
  tick box worded for the course (`finishChoices`): **Recommend for a rating
  exam** where the course ends in one, **Mark the course complete** where it
  does not, and both for Custom Training. Ticked, the report is filed first —
  flagged on VATUSA as a recommendation (`ots_status` 3) in the first case —
  and then the card is moved exactly as **Mark training complete** on `/teach`
  moves it. If the card cannot be moved the report still stands, and `/teach`
  says to use the button instead.
- **A rating exam result** (passed / not passed) is offered only to the
  examiner on the card, at the exam stage. Filing one **does not move the
  card** — that is still the button on `/teach`.
- **The form is checked against VATUSA's rules first** (`checkReport`), so the
  teacher hears everything wrong at once.
- **Nothing is stored here**: the record is VATUSA's.

`CTRS_SUBMIT` is `test` for now: VATUSA checks the report and answers as it
would, but saves nothing and moves no card, and the page says so. Set it to `live` once a test
has been seen to pass. Like the academy calls, this was written from VATUSA's
public source and **had not been run with a real key** when it was written.

### The end of a course

How a course finishes, and who moves it. The rules are pure functions in
`$lib/course-completion.ts`; the Jira writes are in
`$lib/server/enrollments/completion.ts`.

| Step                       | Who                                                                  | What happens on the card                                                                    |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Mark training complete     | the teacher on the card (`/teach`)                                   | `Training Completed` dated; moved to Rating Exam, or — for a course with no exam — to Audit |
| Claim this exam            | any evaluator on that course except the student's teacher (`/teach`) | they become its `RE Instructor`                                                             |
| Passed: mark exam complete | that examiner (`/teach`)                                             | `RE Completed` dated; moved to Audit                                                        |
| Not passed                 | that examiner (`/teach`)                                             | moved to Needs CATP; `Training Completed` cleared                                           |
| _(automatic)_              | the app                                                              | the certification is applied; `Certificate Updated` dated                                   |
| Audit complete             | a training admin (`/admin/audit`)                                    | moved to Completed                                                                          |

TRK's status for a finished course waiting on the TA is **Audit** (Certification
Update until 2026-10-06). The app's own name for it is still
`certification-update`, and it reads either name off the board.

Four courses end in a rating exam — S-GC, A-LC, T-RC, E-RC (`RATING_EXAMS`).
A-GC and S-LC do not, and go straight to Audit.

**Jira is still the authority on where a request is.** Each step writes the date
and then makes the move, and only then reads the card back onto our row. If Jira
refuses, nothing here has changed and the person is told. Each step also leaves a
comment naming who did it, because every write is made by one API account.

**The certification is applied when a request is found at Audit,
however it got there** — a step taken here, or a card somebody dragged across the
board. The cron's last job, the webhook, and each step above all run the same
pass; `enrollments.certification_applied_at` is what makes it happen once.

**But only if the card shows the course was finished.** Before granting anything
the app reads the card: every course needs `Training Completed`, and the four
that end in a rating exam also need `RE Instructor` and `RE Completed`. A card
without them — dragged past its exam, or across before the training was done —
is **held**: nothing is granted, the training admins are told once, and
`/admin/audit` lists it with what it lacks. It is checked again on every pass,
so filling in the card releases it, and moving the card back clears the hold.
What is missing is kept in `enrollments.certification_hold`. TRK's own
transition rules (DEV-176) are the first defence; this is the one that does not
depend on the workflow staying as it is.

What a course earns is the credential of the same code, and a certification only
ever moves someone **up**: a card for a course below what they already hold
changes nothing. An endorsement (S-LC) is added beside their certification.

**Needs CATP** (a Corrective Action Training Plan) is reached two ways: a failed
exam, below, or a card staff move there from In Training on the board. The
student's page does not say which. The training admins' notice says an exam was
failed only when the card arrived from Rating Exam.

A **failed exam** goes to Needs CATP, with `Training Completed` cleared: the
training was not complete after all. The TA decides what further training the
student gets and returns the card to training on the board; the teacher dates it
again when it is done. RE Instructor stays on the card while it waits at Needs
CATP, so the TA can see who examined, and is **removed when the card goes back
into training** — by the webhook or the cron, however it was moved — so the
retake is claimed afresh. The student's page explains, and the
teacher still sees them on `/teach`.

**The exam is an independent check**: the student's own teacher can neither claim
nor record their exam, even if staff put them on the card by hand. Nobody acts on
their own request, and the audit cannot be completed until the certification has
been applied.

### Admin

`/admin` is for training admins (`training:admin`), and exists so that a problem
behind the scenes is seen before a student has to report it.

- **Requests not on the TRK board.** The cron stops retrying a filing after five
  failures, on purpose. Those requests are listed with Jira's error, and **Retry
  now** resets the count and files again; a retry that fails leaves the request
  back in the cron's queue. Requests still inside their retries are listed
  separately, with nothing to do.
- **Scheduled jobs.** Each of the seven, with when it last ran and one of four
  states: OK, Failing (its last run threw), Not running (no run for 45 minutes —
  three missed intervals), or No runs recorded. A failure shows its message and
  how many runs in a row; the last error stays visible after a recovery.
- **Jira webhook.** The last verified delivery. It is never "Not running": it
  fires when staff change an issue, so a quiet board is not a fault.
- **Configuration.** Whether the Jira credentials, the webhook secret and the
  Larry binding are set — never their values.
- **Discord roles and channels.** At the bottom: what the last Discord sync did
  to each teacher's role and channel, or in a dry run would do. Absent until the
  sync has run once.

Recording a job's outcome is bookkeeping: if the write fails it is logged, and
neither fails the job nor stops the next one. Training admins are told in
Discord when a request gets stuck, and when a job starts failing or recovers —
see Notifications.

### Site copy

General prose is markdown under `src/lib/content/`, compiled to HTML **at build
time** by a small plugin in `vite.config.ts`. `marked` stays a devDependency and
never ships; HTML comments in `.md` files are stripped, so they are safe for
notes to editors.

- `content/training/` — **everything on `/`**: one `.md` per view (waitlist,
  in training, rating exam, visitor, consolidation, …). To change wording, edit
  the file; to change a panel's title or buttons, edit its entry in
  `content/training/index.ts`. Each file's opening comment says who sees it.
- `content/enrollment/` — the form's own blocks: what happens after you enroll,
  the written exam, the agreement.

The page draws data itself (queue position, hours, teacher, course); the
markdown is plain prose with no placeholders. `index.ts` holds each view as
`{ title, body, actions }`, which is the shape to keep when this moves to a CMS.

**Course content does not live here.** This repo is public, and lesson plans,
grade sheets and exam material are neither for the public web nor something the
training team should need a public PR to change.

When you change `agreement.md` in a way that alters what a student agrees to,
**bump `TERMS_VERSION`** in `src/lib/content/enrollment/index.ts`.

## Local development

Requires Node 22 and the identity Worker running alongside. Clone it as a
sibling of this repo:

```
indy-center/
├── identity/
└── training-tools/
```

**1. Start identity on port 8787** (it must be 8787 — VATSIM Connect's redirect
URI is hardcoded to it):

```bash
cd ../identity
npm install
cp .dev.vars.example .dev.vars   # CONNECT_CLIENT_ID / CONNECT_CLIENT_SECRET come from a maintainer
npm run db:migrate:local
npm run dev
curl http://localhost:8787/healthz   # => {"ok":true}
```

`.dev.vars` must have `COOKIE_DOMAIN=localhost`. That single setting is what
makes cookies work on localhost _and_ makes identity accept loopback
`return_url`s — without it, sign-in fails with a 400.

**2. Start this app:**

```bash
npm install
cp .dev.vars.example .dev.vars   # points PUBLIC_IDENTITY_URL at localhost:8787
npm run dev                      # http://localhost:5173
```

`vite dev` joins Wrangler's dev registry, so the `IDENTITY` service binding
resolves against your local identity — no `wrangler dev` needed for auth to work.

Two things to know when it misbehaves:

- **`.dev.vars` is read at startup only.** Create it _before_ `npm run dev`, and
  restart after editing. If sign-in sends you to `auth.flyindycenter.com`
  instead of `localhost:8787`, the file wasn't loaded — and production identity
  will reject a `localhost` return URL with a 400.
- **If identity isn't running**, the binding resolves but the call fails with
  `Worker "identity" not found` in the server console, and the request is
  treated as logged out. Auth degrades silently by design, so check the console
  before assuming login is broken.

Also watch the port: if 5173 is taken, Vite silently moves to 5174 and you may
be testing a stale server.

The signed-out landing page (`/`) renders without identity running at all.

**Larry** works the same way: run its send Worker alongside (`cd ../indy-larry/worker && npx wrangler dev`, with a test token and test channels in its `.dev.vars`) and the `LARRY` binding resolves. Without it, notices are logged and skipped.

## Database

D1 + drizzle. **drizzle-kit generates the SQL; wrangler applies it** — never
`drizzle-kit migrate` or `push`.

```bash
# after editing src/lib/db/schema/*.ts
npm run db:generate        # writes SQL into drizzle/migrations/
npm run db:migrate:local   # applies to local state
```

CI applies `--remote` before every deploy. To reset local state:
`rm -rf .wrangler/state/v3/d1 && npm run db:migrate:local`.

**Hand-written data migrations collide with drizzle's numbering.** drizzle-kit
numbers new files from its own `meta/_journal.json` and does not see SQL it did
not generate, so after `0003_import_community_website_certifications.sql` it
produced a second `0003`. Two files sharing a prefix apply in alphabetical order,
which is luck rather than design.

**Better: register the data migration with drizzle as you add it**, as
`0010_seed_teacher_roster.sql` does — add a journal entry for it and copy the
previous `meta/NNNN_snapshot.json` to its number with a new `id` and `prevId` set
to the old one. `npm run db:generate` should then report "No schema changes",
and the next schema migration numbers on past yours.

For a data migration that was not registered, then generate the next schema migration:
rename drizzle's file past yours, rename its `meta/NNNN_snapshot.json` to match,
and set that journal entry's `idx` and `tag` to the new number. drizzle then
counts on from there. Only safe for a migration not yet applied anywhere — check
`d1_migrations` first.

To populate a local roster, run the cron by hand:

```bash
npx wrangler dev --test-scheduled --port 8788
curl http://localhost:8788/__scheduled      # logs {fetched, added, restored, removed}
```

The same trigger runs the enrollment reconcile, which is how to exercise the
Jira retry path without a browser session: insert a row with a null
`jira_issue_key`, fire `/__scheduled`, and watch it pick up a key.

**Local dev points at the real `TRK` project**, so a test submission creates a
real issue on the training staff's board. Delete what you create. Leaving
`JIRA_API_TOKEN` unset avoids this entirely — enrollments still save, they just
stay unfiled.

**Never run `wrangler d1 delete` or `wrangler d1 create` to fix local state** —
both operate on production.

## Tests

```bash
npm test
```

CI runs exactly this sequence; run it before opening a PR:

```bash
npm run format:check && npm run build && npm run check && npm test
```

**`build` comes before `check` on purpose.** `src/worker.ts` imports the
adapter's output at `.svelte-kit/cloudflare/_worker.js`, so on a fresh clone
type-checking before building fails with `Cannot find module`. Keep that order
if you edit the workflow.

## Deployment

Push to `main` deploys automatically: CI applies D1 migrations, then
`wrangler deploy`. Needs repo secret `CLOUDFLARE_WORKERS_API_KEY`.

Manual deploy (requires access to the `IndyCenter` Cloudflare account — check
with `npx wrangler whoami`):

```bash
npm run deploy
```

After changing bindings in `wrangler.jsonc`, regenerate types:

```bash
npm run cf-typegen
```

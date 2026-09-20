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

`npm run format:check && npm run build && npm run check && npm test` — green, 68
tests.

## The bug the whole verification strategy missed

The page rendered correctly and **submitting the form did nothing.**

`actions.default` cannot coexist with a named action. SvelteKit throws
`When using named actions, the default action cannot be used`
([`check_named_default_separate`](../../node_modules/@sveltejs/kit/src/runtime/server/page/actions.js)),
so adding `withdraw` beside `default` broke every POST to `/enroll`. Both
actions are named now (`?/enroll`, `?/withdraw`) and
`src/routes/enroll/actions.test.ts` asserts the shape, which would have caught
it.

**This is the uncomfortable part.** The session verified a great deal — every
Jira custom field, the en-dash summary, ADF encoding, the cron reconcile, the
no-duplicate guarantee, the failure path with the token unset — by driving the
cron and calling Jira directly. All of that was real, and none of it goes
through a form POST.

So the one path a student actually takes was the one path never exercised, and
it was the one that was broken. Depth of verification elsewhere counted for
nothing. The caveat "nobody has rendered the form UI" was written down twice and
treated as a nice-to-have rather than as the gap it was.

**Anything reachable only through a browser needs a browser.** Where that needs
a session we do not have, say plainly that the feature is unverified rather than
listing everything adjacent to it that is.

**Confirmed working in production** once the secrets were up — the requester
submitted the form and the issue reached the board.

## Filed at the end of the session

| Issue                                                    | What                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [DEV-113](https://zidartcc.atlassian.net/browse/DEV-113) | Shared notification service (Queues → Discord)                  |
| [DEV-114](https://zidartcc.atlassian.net/browse/DEV-114) | Course placement flow + pre-enrollment agreement copy (subtask) |
| [DEV-115](https://zidartcc.atlassian.net/browse/DEV-115) | Auto-assign certifications per GCAP on roster arrival           |
| [DEV-116](https://zidartcc.atlassian.net/browse/DEV-116) | Switch community-website to this app for certs/endorsements     |
| [DEV-117](https://zidartcc.atlassian.net/browse/DEV-117) | File enrollments under a Jira service account                   |
| [IND-40](https://zidartcc.atlassian.net/browse/IND-40)   | Apply for Atlassian non-profit status (epic IND-8)              |

DEV-108 moved to In Progress with a comment covering what works, what is
unverified, and the decisions worth carrying. DEV-110 has a comment explaining
why Discord id and email are not sent to Jira. DEV-113's description was
rewritten — it had been filed with wiki markup that Jira stored literally.

Two dependency chains, both worth not losing.

```
DEV-115 (certs on arrival)  ──>  DEV-114 (course placement)
        │
        └──>  DEV-116 (community-website cutover)
```

DEV-114 cannot reason about placement until arrivals carry certifications, and
DEV-116 must not start until this app is genuinely authoritative — which is also
where the deferred RPC surface finally gets a real consumer to design against.

```
IND-5 (register a 501c3)  ──>  IND-40 (Atlassian non-profit)  ──>  DEV-117 (service account)
```

Linked with Jira `Blocks` links, not just prose. The chain looks
disproportionate for "stop using a personal token" until you see why: a service
account costs a Jira seat, seats are weighed against licence cost, and
non-profit pricing needs the 501c3 to exist. So a tidy-up in the tech backlog is
genuinely gated on a legal filing.

Worth remembering when someone asks why DEV-117 is sitting still.

## Production secrets are set

`JIRA_USER_EMAIL` and `JIRA_API_TOKEN` are now Worker secrets on
`training-tools`. `npx wrangler secret list` shows both.

Confirmed against <https://tech.flyindycenter.com/patterns/ci-shape/> that this
is the org method, and that the alternative of pushing them from the deploy
workflow is explicitly ruled out: _"Runtime secrets ... are Worker secrets, set
with `npx wrangler secret put`, and never appear in a workflow or in
`wrangler.jsonc`."_ I had offered the CI-managed option before checking; it is
against convention, so don't. Recorded in
[`../research/org-conventions.md`](../research/org-conventions.md), which
covered CI and local env but had nothing on production secrets.

`wrangler deploy` does not clear secrets, so CI redeploys over the top without
seeing them. One trap: a `vars` entry in `wrangler.jsonc` sharing a name with a
secret clobbers it on deploy — keep the names disjoint.

They were set by piping out of `.dev.vars` so the values were never echoed:

```bash
grep '^JIRA_API_TOKEN=' .dev.vars | sed 's/^JIRA_API_TOKEN=//' | tr -d '\r\n' \
  | npx wrangler secret put JIRA_API_TOKEN
```

The token is a **personal** one, which is the whole reason DEV-117 exists.

## Withdrawal now transitions the Jira issue

The form works in production once the secrets were up. First real bug report:
withdrawing left the issue sitting on the board.

The training team added a `Withdrawn` status (`10110`), reachable from **any**
status, and it is now transitioned to on withdrawal — plus the existing comment,
because the status alone cannot say _who_ withdrew or that they did it
themselves rather than staff removing them.

`transitionIssueToStatus()` resolves the transition by **target status name**,
asking Jira what is available, rather than hardcoding an id. This workflow
changed three times in one day; an id baked into the source is a bug waiting for
the next edit, and a wrong id fires a wrong transition silently, whereas a
missing name throws with the available options listed.

Verified against live Jira (TRK-46 to TRK-49, all deleted):

| Case                        | Result                             |
| --------------------------- | ---------------------------------- |
| Withdraw from `Waitlist`    | → `Withdrawn`                      |
| Withdraw from `In Training` | → `Withdrawn`                      |
| Bogus status name           | throws, listing what was available |

**The In Training case nearly went unverified.** The first attempt reported
success but the issue had never left `Waitlist` — "Assign Teacher" 400s with
`"Assign a teacher first"` unless `Teacher` (`customfield_10250`) is set, and I
had not checked that response. Setting the field first got it to `In Training`
and the withdrawal genuinely worked. Same failure mode as the form POST bug
earlier: a test that never reached the state it claimed to test.

## Community-website logins do not carry over, and cannot

Reported: signing in on the community website still leaves you pressing Connect
on training. The question was whether we could check for a cookie on page load.

**We already do.** `hooks.server.ts` reads `fic_session` on every request and
validates it through the IDENTITY binding. Nothing needs adding.

The reason it does not help: **community-website is not an identity consumer.**
Checked its source — `@indy-center/identity` is not a dependency, it runs its
own VATSIM OAuth at `/login/connect`, and it sets a cookie named `session`
(`src/lib/server/session.ts`) with no `domain` option, so it is host-only on
`flyindycenter.com` and not sent to subdomains at all.

So there are two unrelated auth systems. There is no shared session to detect,
and no amount of cookie-checking on our side changes that. This is the thing
CLAUDE.md warns about — community-website is a styling reference, **not** an
auth reference, and its README is stale on the point.

The fix belongs in community-website: migrate it onto identity, the way `charts`
already is. Then the `fic_session` cookie on `.flyindycenter.com` is shared and
training picks it up with no button press and no code change here.

Quick way to confirm the mechanism works today: sign in at
`charts.flyindycenter.com`, then load training — it should already know you.

## Open / next

- The enrollment path is confirmed end to end in production. Still unrendered by
  a human: the **four home-page branches** from the previous session, and the
  withdraw button itself (the transition is verified against Jira directly, but
  not by clicking it).
- **Migrate community-website onto identity** so a single sign-in covers both
  sites. Not filed yet — worth its own story, and it is work in that repo, not
  this one.
- D1 migration has not been applied to production (`npm run db:migrate` /
  CI `--remote`). Production still has only `roster_members`.
- Nothing is committed. The whole session is sitting in the working tree.
- Withdrawal comments on the Jira issue rather than transitioning it, even
  though `Remove from Waitlist` exists and works. Left as a policy call for the
  training team — see ADR 0009.
- Still unverified: whether the Cloudflare account is on Workers Paid, which
  DEV-113 depends on.
- Branch protection / PR flow still not set up; these commits went to `main`.

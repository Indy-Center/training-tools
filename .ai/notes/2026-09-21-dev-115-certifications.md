# 2026-09-21 — DEV-115 certifications on arrival

Follows [`2026-09-20-dev-108-enrollment-form.md`](2026-09-20-dev-108-enrollment-form.md),
which filed DEV-115 at the end of the previous session and named it as the thing
blocking course placement.

## What changed

This app now owns certifications and endorsements — the third table, and the
first one that other apps will eventually read rather than just us.

- `certifications` table, plus `$lib/certifications.ts` as the catalogue.
- The community-website data imported as migration `0003`.
- Arrival grants wired into the cron as a third guarded block.
- `/certifications` and `/certifications/[cid]` for training staff.

ADR [0010](../decisions/0010-certifications-model.md), research
[vatsim-api](../research/vatsim-api.md).

## The question the previous session left open, answered

> "How certifications get assigned to controllers who arrive already rated."
> — [ADR 0008](../decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md)

Three parts, and the first one had no data source at all.

**"Active as a VATSIM controller in the last 6 months."** Nothing we had
answers it. Identity carries `activeSession`, which is "online right now".
`roster_members.lastActivityAt` is VATUSA's "last seen in our system", which is
not "controlled" — a tempting near-miss, and the wrong column.

VATSIM API v2 does, publicly and with no key:
`/v2/members/{cid}/atc?limit=1` for the last session, `/v2/members/{cid}/stats`
for hours per rating tier.

That second endpoint is what makes **SUP and ADM** tractable. Neither is a
controller rating — a promoted supervisor keeps SUP whatever they held before —
so the rating field genuinely cannot answer what they earned. Their hours can.

**The existing 157 roster members.** Decided with the requester: import from
community-website first, because it is the current system of record, and let
anyone it does not cover fall through to the rating-based grant.

## The number that made the design

After the import, **153 of 157 roster members need no VATSIM lookup at all** —
114 already hold a certification (keep), 39 are OBS (nothing due). Only 4 are
genuinely unknown.

`needsVatsimLookup()` exists for that, and the first full pass made **4 HTTP
requests instead of 157**. It started as a micro-optimisation and turned out to
be the difference between a job that comfortably fits a Worker invocation and
one that needs careful batching.

Worth remembering as a shape: **look at the data before designing the batching.**
The obvious design — fetch for everyone, cap the batch, spread over runs — was
solving a problem that barely existed.

## What the import actually contained

Read from `website-db` before writing anything, and the numbers settled three
open questions on their own:

|                                   |                         |
| --------------------------------- | ----------------------- |
| Rows / distinct CIDs              | 179 / 122               |
| Land on our active roster         | 114                     |
| Left the roster (imported anyway) | 8                       |
| Roster members with no record     | 43 — **39 of them OBS** |

- **No APP-SOLO or TWR-SOLO rows exist**, so leaving them out of the catalogue
  cost nothing. The requester had already said they were not needed; the data
  agreed.
- The certification codes are exactly the five modelled, and the endorsements
  exactly the two. No translation layer needed.
- **One user held two certifications**, which the top-down model says cannot
  happen. Resolved to the higher one on the requester's call.

Leavers are imported deliberately. Certifications key on CID with no foreign key
onto `roster_members`, which is the whole point of
[0006](../decisions/0006-training-tools-owns-the-roster.md)'s rule — if one
returns, they are recognised rather than re-inferred.

## Verified by running the real cron

The previous session's lesson was that **verifying everything adjacent to a path
is not verifying the path**. So the arrival job was driven through
`wrangler dev --test-scheduled`, not just unit tested:

| Run | Roster sync     | Arrival job                                                |
| --- | --------------- | ---------------------------------------------------------- |
| 1   | no changes      | examined 157 — granted 2, kept 114, none 41, **lookups 4** |
| 2   | no changes      | silent; nothing pending                                    |
| 3   | **restored: 1** | pending 1 — **kept 1, granted 0, lookups 0**               |

Run 3 is DEV-115's leave-and-return requirement, exercised rather than reasoned
about: a certified member was tombstoned as if VATUSA had dropped them, the sync
restored them, their check stamp was cleared, and the certification was **kept,
not re-granted**. One row, no duplicate.

The two real grants carry their working — `S1 on arrival; last ATC session
2026-06-12`. Two of the four looked up were outside the window and correctly got
nothing.

**The partial unique index was exercised directly too**, because it is the
backstop and a backstop nobody tests is a comment:

| Case                            | Result   |
| ------------------------------- | -------- |
| Two live rows, same CID + code  | rejected |
| Revoked + live, same CID + code | accepted |
| Re-granting while one is live   | rejected |

## What is still unverified, plainly

**Nobody has rendered `/certifications` signed in**, because nothing grants
`training:certifications:edit` — identity owns that, and it is filed separately.
The routes build, typecheck, and carry the named-actions test that would catch
the DEV-108 failure, and the search SQL was exercised against real roster data
outside the page. None of that is a human clicking the buttons.

Same caveat, narrower: **the SUP/ADM path has never run on live data.** No
uncertified SUP or ADM is on the roster, so it is unit tests only.

## Things worth not losing

**`tier` was the wrong name and the requester caught it.** Tier 1 / Tier 2 are
GCAP's own terms for classifying endorsements, so using the word for an ordering
number would have made "tier 2" ambiguous in the config forever. It is `rank`.

**A flat prerequisite list could not express A-LC**, which needs advanced ground
_and_ the simple local endorsement, while S-LC needs _either_ ground
certification. Hence all-of entries with any-of groups. Also caught by the
requester — the first draft had A-LC requiring only A-GC.

**A build failure that was not a build failure.** `npm run build` died with
`EPERM ... .svelte-kit\cloudflare` after the cron testing. `TaskStop` killed the
top-level `wrangler dev` but left three node children holding the directory.
Killing them fixed it. Check for orphaned `workerd`/`node` before believing a
Windows file-lock error.

**`db.query.<table>` needs two registrations.** A new schema module must go in
the barrel _and_ in the `schema` spread in `$lib/server/db/index.ts`. Miss the
second and the table silently has no query builder — it typechecks, and only the
call site fails.

## Filed and closed

| Issue   | What                                                                 |
| ------- | -------------------------------------------------------------------- |
| DEV-123 | The `training:certifications:edit` role in identity — blocks DEV-122 |
| DEV-124 | Discord on grant/revoke — blocked by DEV-113                         |
| DEV-125 | Expose certifications to identity and others                         |
| DEV-114 | Closed, superseded by DEV-119                                        |

DEV-122 went to **Blocked/Waiting**, not Done. The code is finished, but no one
can sign in and click it, and calling it Done would claim a verification that has
not happened.

**DEV-125's direction was decided the same day: training-tools pushes to
identity.** The data is ours; broadcasting it through identity keeps the number
of interfaces low, since consumers already bind to identity. It also avoids a
circular binding, where identity would call down into an app that calls up into
it. The cost is a second copy, handled the way the Jira reconcile is — commit
locally, push after, retry from the cron on failure.

## DEV-119 — guided enrollment

Same session, after DEV-115. ADR
[0011](../decisions/0011-site-copy-in-repo-course-content-elsewhere.md).

- `$lib/course-placement.ts` suggests a course from what someone holds.
- `/enroll` preselects it, shows what they hold, and explains the suggestion.
- A "before you enroll" block and a required agreement, both markdown.
- `agreedAt`, `agreedTermsVersion` and `suggestedCourse` on the enrollment.
- A choice that differs from the suggestion is noted on the Jira issue.

### The copy decision

Asked "should we render markdown, or is that overkill?", with the context that
courses, modules, lessons and grade sheets will come from markdown later.

Decided with the requester: **general site copy as markdown in this repo;
course-specific content not in this repo at all** — friction for training staff,
and the repo is public. The line: what you read _before_ enrolling is public,
what you see _during_ training is not.

The requester also caught that per-course blurbs would be throwaway: the course
generator will own course descriptions. So "what this course covers" reuses
`courses.ts`, which [0008](../decisions/0008-enrollment-record-in-d1-jira-owns-the-queue.md)
already set up as the one record a generator writes to.

### Found by checking the build output rather than the code

**Maintainer comments were shipping to students.** `marked` passes HTML comments
through, so every `.md` file's "DRAFT — replace this" and "bump TERMS_VERSION"
notes were sitting in the page source. The plugin now strips comments before
rendering.

It would not have shown in the browser — comments do not render — so it was only
findable by grepping `.svelte-kit/output`. The same grep confirmed the two claims
the plugin rests on: the headings arrive as HTML, and `marked` is in no bundle.

### A bug the placement tests caught

The first ladder walk returned the lowest credential the controller was
_eligible_ for. S-GC has no prerequisites, so it is eligible forever, and an A-LC
holder was being suggested S-GC. Placement now climbs from the certification
they hold, and takes a missing endorsement first when the next certification
requires one.

The shape worth remembering: **eligibility is not progression.** "What can I
hold" and "what should I do next" are different questions, and the first is easy
to mistake for the second.

### drizzle numbered over a hand-written migration

`db:generate` produced a second `0003`, colliding with the import. drizzle counts
from its own journal and does not see SQL it did not write. Renumbered to `0004`
and advanced the journal; documented in the README, since every future data
migration will hit it.

### Two sessions on one file

A second Claude session was working the same page concurrently, after the
requester lost track of this one. It wrote the suggestion banner, the
"Suggested" badge and the agreement panel — good work, kept. The collision
surfaced as two "before you enroll" panels, then as **none**, when both sessions
removed theirs; the what-happens-next and written-exam copy was briefly rendered
nowhere. Restored at the top of the form.

Worth knowing as a failure mode: when a file changes under you, re-read the
whole file before editing, not just the region you meant to touch.

## Still unverified

**Neither `/enroll` nor `/certifications` has been rendered signed in.** Both
need a session, and there is no identity Worker in this workspace. The README's
local-development section describes running identity alongside — that is the
route to clicking through both, and it needs VATSIM Connect credentials from a
maintainer plus a real sign-in, which is a human's job rather than an agent's.

Until then, both pages are verified only as far as: build, typecheck, unit tests,
signed-out redirects, and the action gates rejecting a sessionless POST.

## Open / next

- **Click through `/enroll` and `/certifications` signed in.** The one step that
  counts, and the one not yet done.
- **The copy is placeholder.** Every `.md` file is drafted by engineering and
  marked DRAFT. The training team writes the real wording.
- **Where course content lives**, before anyone writes a lesson. A private
  `@indy-center/curriculum` package is probably the least painful. See 0011.
- **Repo-managed or admin-edited curriculum?** 0008 and the DEV-99 research
  disagree, and the two need different renderers. Unresolved.
- **An S2 arrival granted A-LC will not hold S-LC**, where someone who trained up
  to A-LC would — and placement will then suggest T-RC. Raised with the training
  team.
- **Regenerate migration `0003` if this branch sits unmerged**, or grants made on
  community-website in the meantime are lost.
- `NavigationLinks.svelte` still links to `/students` and `/admin`, **neither of
  which exists**.

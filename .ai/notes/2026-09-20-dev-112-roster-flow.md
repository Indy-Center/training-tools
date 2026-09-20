# 2026-09-20 — DEV-112 roster flow + roster ownership

Second session of the day. Follows
[`2026-09-20-bootstrap.md`](2026-09-20-bootstrap.md).

## What changed

DEV-112 asked for a home page that sorts members by roster and rating. Answering
"is this CID rostered" turned into a bigger decision: **this app now owns roster
data** for the ARTCC, as the spine for the certifications, endorsements and
currency it will own later, eventually exposed over RPC.

- Switched to `@indy-center/adapter-cloudflare` + `src/worker.ts` (needed for
  cron, and later RPC). Reverses part of ADR 0002.
- First real D1 table: `roster_members`, a soft-removing mirror of the VATUSA
  roster.
- Cron every 15 minutes pulls the public VATUSA roster (no API key).
- `resolveTrainingFlow()` — pure, unit-tested branching into four paths.
- Home page renders a sign-in CTA signed out, and one of four branches signed in.
- `/stats` is no longer public; `/` is now the only public path.
- Nav links hidden when signed out.

ADRs [0006](../decisions/0006-training-tools-owns-the-roster.md) and
[0007](../decisions/0007-home-page-flow-branching.md).

## Decisions taken with the requester

- Roster foundation now (fork, table, cron), **RPC deferred** until a consumer
  exists to compile against it.
- Soft-removal over truncate-and-replace.
- Home controllers get the enrollment form; **visiting controllers get copy**,
  not the form.
- Everything behind login except the `/` sign-in CTA.

## The bug worth remembering

**D1 allows 100 bound parameters per query.** The first sync attempt used
`inArray(cids)` with 157 CIDs and died with
`D1_ERROR: too many SQL variables`. The `notInArray` soft-removal would have hit
it too.

Only surfaced by actually running the cron — it typechecks fine and passes unit
tests, because the limit is a runtime property of D1.

Fixed by removing the CID lists entirely: scan the small table to classify, and
use `syncedAt < now` as the tombstone marker. Better code than the original
anyway.

## Verified against local D1

Ran the real cron via `wrangler dev --test-scheduled`:

| Run    | Result                                            | Meaning                                          |
| ------ | ------------------------------------------------- | ------------------------------------------------ |
| first  | `{fetched:157, added:157, restored:0, removed:0}` | initial population                               |
| second | `{fetched:157, added:0, restored:0, removed:1}`   | idempotent; synthetic departed member tombstoned |
| third  | `{fetched:157, added:0, restored:1, removed:0}`   | a member marked removed was restored             |

Row counts: 157 total, 110 home, 47 visiting, 7 mentors. The tombstoned row
survived with `removed_at` set — history kept, as intended.

Also: `/` returns 200 signed out with the CTA; `/stats` and `/enroll` 302 to
identity.

## Verified in production

Deployed as version `2269c570`, cron registered as `schedule: */15 * * * *`.

**The scheduled trigger fired on its own** — production `roster_members` was
empty at 12:00:10 and held 157 rows at 12:01:14, with no manual invocation.
Counts match local exactly: 110 home, 47 visiting, 157 active, 7 mentors.

`155 of 157 members carry a Discord id` from VATUSA, which is worth knowing for
DEV-110 — identity's `attributes.discordId` is not the only source.

Pages: `/` 200 signed out; `/stats`, `/enroll`, `/dashboard` all 302 to identity.

## The Discord id find, and DEV-43

VATUSA's roster carries a `discord_id`, and coverage is high: **155 of 157**
active members (108 of 110 home controllers). It comes from the member's own
VATUSA Discord linkage.

That matters beyond DEV-110, because **DEV-43** ("Add Discord user ID and
TeamSpeak Identity to Identity") plans a link-code/auth flow to collect exactly
this. Flagged on that ticket: for rostered controllers the ids can likely be
seeded from VATUSA rather than asking ~155 people to authorise something they
have effectively already done.

It narrows that ticket rather than closing it — VATUSA gives us **nothing** for
TeamSpeak identities, and **nothing** for non-rostered users (community members,
prospective controllers, leavers), who still need the flow. Two open policy
questions left for them: which source wins when VATUSA and Identity disagree,
and whether a VATUSA-sourced id counts as verified or as a suggestion the user
confirms.

## The repo now exists, and CI caught something we didn't

`Indy-Center/training-tools` is live and public; local `main` is in sync via a
remote named `github`. `CLOUDFLARE_WORKERS_API_KEY` is already set — Build and
Deploy went green on its first run.

**CI failed on both DEV-112 commits** while passing on the bootstrap commit, and
the cause is worth remembering:

`src/worker.ts` imports `../.svelte-kit/cloudflare/_worker.js`, which the
adapter only writes during `npm run build`. The workflow ran `check` _before_
`build`, so on a fresh checkout svelte-check failed with
`Cannot find module '../.svelte-kit/cloudflare/_worker.js'`.

It passed locally every time because a previous build had already left that file
on disk. The custom worker entry introduced the dependency in this session, so
the bootstrap commit was genuinely unaffected — this was a real regression, not
a flake.

Fixed by running `build` before `check` in `ci.yml`, and reproduced/verified in
a clean `git clone` + `npm ci` rather than in the working tree. Keep that order.

**Lesson:** a working tree with build artifacts is not a clean checkout. For
anything order-dependent, clone to a temp dir and run the workflow's exact
sequence.

## Open / next

- **Nobody has seen the signed-in page render.** The four branches are unit
  tested and the roster data is real, but confirming the actual pages needs a
  VATSIM session.
- Visiting-controller copy is a guess at policy. Worth a training-staff read
  before it's real: it currently says visitors can't enroll and should transfer.
- `/enroll` and `/stats` are placeholders (DEV-108, DEV-111).
- DEV-108 still needs the product call: **is D1 the waitlist, or is Jira the
  waitlist with D1 mirroring it?** See
  [`../research/jira-dev-99-scope.md`](../research/jira-dev-99-scope.md).
- RPC surface deferred. When a consumer appears, export a `WorkerEntrypoint`
  from `src/worker.ts` and publish types the way identity does.
- Nobody holds `training:admin` yet. Grant before any staff-facing feature.
- Branch protection / PR flow isn't set up — these commits went straight to
  `main`. The org's stated flow is feature branch → PR → one approval.

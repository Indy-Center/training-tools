# 0011 — Site copy is markdown in this repo; course content is not

- **Status:** accepted
- **Date:** 2026-09-21
- **Ticket:** DEV-119 (which supersedes DEV-114)

## Context

DEV-119 needs blocks of prose on `/enroll`: what happens after you submit, when
the VATUSA written exam arrives, and the terms a student agrees to. The training
team will reword these repeatedly.

The obvious over-reach was a CMS. The obvious under-reach was hard-coding the
copy in Svelte markup, so every wording change needs a developer. Both were
rejected by the requester, along with a third option: putting course content
here too.

That third point matters beyond DEV-119, because the ARTCC intends to generate
courses, modules, lessons **and their grade sheets** from markdown later.

## Decision

**General site copy is markdown in this repo, compiled at build time.**
**Course-specific content is not in this repo at all.**

The dividing line: _what a prospective student reads before enrolling is
public; what they see during training is not._

| Lives here, as markdown                      | Does not live here                   |
| -------------------------------------------- | ------------------------------------ |
| What happens after you submit                | Lesson plans and module content      |
| When the VATUSA written exam is assigned     | Grade sheets and rubrics             |
| The enrollment agreement                     | Exam material                        |
| One-line course descriptions in `courses.ts` | Anything a student sees mid-training |

Two reasons for keeping course content out, from the requester:

- **Friction.** Training staff edit course content far more than site copy, and
  a public repo's PR review is the wrong gate for that volume.
- **Privacy.** This repo is public. Course and assessment material should not be
  readable by anyone browsing the web.

## How the markdown works

`vite.config.ts` has a small plugin that compiles `.md` imports to an HTML string
**at build time**. That choice, rather than a runtime renderer, carries three
consequences worth keeping:

1. **`marked` never reaches the Worker.** It is a devDependency, and only the
   rendered HTML ships. Verified against the build output: the four headings
   are present, the library is in no bundle.
2. **No sanitiser is needed**, because the content is ours and arrives through a
   reviewed PR. `{@html}` is safe _only_ because of that.
3. **HTML comments are stripped before rendering.** `marked` passes them through
   untouched, which was shipping maintainer notes ("DRAFT", "bump
   TERMS_VERSION") to every student's page source. Found by grepping the build
   output, not by reading the code. Comments in `.md` files are now
   authoring-only.

**Do not extend this plugin to admin- or user-supplied content.** The moment the
markdown is not ours, it needs a runtime renderer and sanitisation, or it is a
stored-XSS vector on a page students load.

## Course descriptions stay in `courses.ts`

DEV-119 also wants "what this course covers". That is the one course-specific
block, and it deliberately reuses `$lib/courses.ts` rather than gaining
per-course markdown files.

The reason is the future generator. [0008](0008-enrollment-record-in-d1-jira-owns-the-queue.md)
put code, label, Jira option id and description in one record precisely so a
generator has **one** place to write. A directory of per-course blurbs here would
give it two sources to keep in step, and would have to be thrown away anyway.

## Consequences

- **The terms a student accepted are versioned.** `TERMS_VERSION` in
  `$lib/content/enrollment/` is stored on the enrollment with `agreedAt`, because
  "accepted on this date" is worth little if nobody can say what the text said
  that day. **Bump it whenever `agreement.md` changes what someone is agreeing
  to.** The file says so in a comment, which is now stripped from the output.
- **The copy in the repo today is a placeholder**, drafted by engineering to show
  the shape. Each file is marked DRAFT. The wording is the training team's.

## Not decided here — worth deciding before anyone writes a lesson

**Where course content does live, and how this app reaches it.** A separate
private repo still has to be reachable from this repo's build. The candidates:

- a **private `@indy-center/curriculum` package** — the org already publishes
  `@indy-center/*`, it keeps the PR-review flow, and it versions naturally;
- a git submodule, which leaks nothing but is awkward in CI;
- a build-time fetch using a CI token.

Also open, and heavier: **grade sheets are structured data, not prose.** A rubric
wants to be typed and queryable so scores can be aggregated — "what does this
student average on phraseology" — which rendered markdown cannot answer.
Probably prose in markdown plus the rubric as frontmatter or a sidecar file.

And the DEV-101 requirement that ties both together: _a lesson records the
curriculum version active when it **started**, not a live pointer._ The
versioning model is the hard part. Markdown is the easy part.

> **Also note** a contradiction in the existing notes that this ADR does not
> resolve: [0008](0008-enrollment-record-in-d1-jira-owns-the-queue.md) says
> "generating courses from a repo of markdown", while the DEV-99 research says
> curriculum is "admin-editable, not GitHub-managed". This decision settles the
> _public repo_ question, and points the private-repo route. Whether curriculum
> is repo-managed at all or admin-edited in the app is still open, and the two
> need different renderers.

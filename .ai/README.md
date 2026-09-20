# .ai

Durable context for humans and coding agents working on this repo: why things
are the way they are, and what was learned the hard way.

## Layout

| Folder       | What goes in it                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `decisions/` | One architectural decision per file, numbered. Append new ones; supersede rather than rewrite.             |
| `research/`  | Findings about systems we integrate with but don't own (identity, the org's Cloudflare setup, Jira scope). |
| `notes/`     | Dated session notes — what happened, what's half-finished, what to pick up next.                           |

## Rules

- **Decisions are append-only.** If a decision changes, add a new file and mark
  the old one superseded. The history is the point.
- **Research files record what was verified, and when.** External systems drift.
  Every research file carries a "verified on" date; treat anything older than a
  few months as a hypothesis, not a fact.
- **Don't duplicate the code.** These files explain _why_. If a file just
  restates what `src/` already says, delete it.

## Start here

New to the repo? Read, in order:

1. [`decisions/0001-identity-via-service-binding.md`](decisions/0001-identity-via-service-binding.md)
   — the constraint that shapes everything else.
2. [`decisions/0006-training-tools-owns-the-roster.md`](decisions/0006-training-tools-owns-the-roster.md)
   — what this app is responsible for, and what that implies.
3. [`research/identity-integration.md`](research/identity-integration.md) — how
   auth actually works, including a widespread misconception about it.
4. [`research/org-conventions.md`](research/org-conventions.md) — CI, branching,
   env vars, the D1 migration loop.
5. [`research/vatusa-roster.md`](research/vatusa-roster.md) — the roster feed,
   and D1's 100-parameter limit.
6. [`research/jira-student-tracking.md`](research/jira-student-tracking.md) —
   the training waitlist we file into, its workflow and its field ids.
7. [`research/jira-dev-99-scope.md`](research/jira-dev-99-scope.md) — where this
   app is going.

Note that 0006 and 0007 supersede parts of 0002 and 0004. The superseded files
say so at the top; read the newer one when they disagree.

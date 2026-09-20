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
2. [`research/identity-integration.md`](research/identity-integration.md) — how
   auth actually works, including a widespread misconception about it.
3. [`research/org-conventions.md`](research/org-conventions.md) — CI, branching,
   env vars, the D1 migration loop.
4. [`research/jira-dev-99-scope.md`](research/jira-dev-99-scope.md) — where this
   app is going.

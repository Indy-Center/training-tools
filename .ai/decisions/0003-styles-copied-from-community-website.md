# 0003 — Layout and styles copied from community-website

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-107

## Context

This app should look like it belongs next to `flyindycenter.com`. The org has
**no shared UI package** — every app carries its own components.

## Decision

Copy the layout shell and a small component kit out of `community-website`
rather than inventing a design or building a shared library.

Taken essentially verbatim: `app.css`, `app.html`, the root `+layout.svelte`
(including its inline footer — there is no Footer component), `Logo.svelte`,
`Panel.svelte`, `PageHero.svelte`, `Badge.svelte`, `ActionButton.svelte`.

Adapted: the `header/` components, because the user object differs (see 0001 and
below).

## The theme is convention, not tokens

Worth knowing before trying to "find the theme file": there isn't one.
`community-website` has no `tailwind.config.js` (Tailwind v4), no `@theme`
block, no CSS custom properties and no dark-mode toggle. It is permanently dark
and uses the stock Tailwind palette directly in class names.

The conventions to hold to:

- page `bg-gray-900`; surfaces `bg-slate-800`, panels `bg-slate-800/60 backdrop-blur-sm`
- borders `border-slate-700/50`, `border-slate-600/30`
- accent is **sky**: `bg-sky-600/20`, `border-sky-400`, `text-sky-400`, buttons `bg-sky-600 hover:bg-sky-700`
- text `text-white` (headings), `text-gray-300` (body), `text-gray-400`/`500` (muted)
- CIDs and ratings are always `font-mono`; ATC rating chips `bg-sky-600/30 text-sky-200`. Pilot ratings are not shown — this app covers controller training only
- `rounded-lg`, `transition-colors duration-200`, content width `mx-auto max-w-6xl px-4` (header `max-w-7xl`)
- the header is `absolute top-0`, so non-home pages compensate with `pt-16`
- icons come from `unplugin-icons` as `~icons/mdi/*`, aliased `IconFoo` — not lucide

## What had to change

The header is the only non-mechanical part. `community-website` renders
`user.preferredName ?? firstName + lastName` plus a membership badge from its
own D1 `users` table. Identity's `User` is shaped differently and far more
optional: `attributes.preferredName`, `vatsimData.personal.name_full`,
`vatsimData.vatsim?.rating?.short`.

So:

- The fallback chain lives in `src/lib/user.ts` (`displayName`, `atcRating`,
  `operatingInitials`) instead of being inlined in two
  components. Every level of that chain is optional in identity's types.
- `MembershipBadge` is dropped — identity has no membership concept. Operating
  initials are shown instead.
- Sign in / sign out are external links to identity, not local routes.
- `ExternalLinks` points back at the community site, charts and the wiki.

## Bugs deliberately not inherited

`community-website` has a few known defects near the code we copied. Flagged
here so nobody "restores" them while diffing against the original:

- `logout/+server.ts` reads a `session_id` cookie that is never set, so sessions
  are never actually invalidated server-side. (Moot for us — identity owns logout.)
- `app.d.ts` imports `UserWithRelations` from `$lib/user`, a file that does not exist.
- `@oslojs/crypto` and `@oslojs/encoding` are imported in source but undeclared in `package.json`.
- `Panel.svelte` computed its class strings with `const` instead of `$derived`,
  so a Panel whose `mode` or `overflow` prop changed kept its original styling.
  **Fixed in our copy** — this is the one place we intentionally diverge from
  the original's behaviour.

## Consequences

Divergence over time is the accepted cost. If a third app needs the same shell,
that is the moment to extract a package — not before.

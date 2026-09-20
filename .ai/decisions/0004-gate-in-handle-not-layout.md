# 0004 — Route gating lives in `handle`, never in a layout load

- **Status:** accepted; public-path list superseded by
  [0007](0007-home-page-flow-branching.md)
- **Date:** 2026-09-20
- **Ticket:** DEV-109

> **Superseded in part:** `/stats` is no longer public. `PUBLIC_PATHS` is now
> `['/']` and nothing else. The argument for gating in `handle` rather than a
> layout load is unchanged and still the important part of this page.

## Context

`community-website` gates its admin section from `admin/+layout.server.ts`:

```ts
export const load = async ({ locals }) => {
	if (!isAdmin(locals.roles)) return redirect(302, '/');
	...
};
```

That is a natural place to put it, and it is subtly wrong. The org's auth doc
calls it out explicitly.

## Decision

All gating happens in `authHandle` inside `src/hooks.server.ts`, via a public
path allowlist. No `+layout.server.ts` in this repo performs an auth redirect.

## Why

A layout's server `load` does not re-run on navigation beneath it unless one of
its dependencies changes. On top of that:

- **form actions run before any `load`**, so an action on a gated page can
  execute before the gate is consulted;
- **`+server.ts` endpoints never run a layout load at all**, so API routes under
  a "protected" section are not protected;
- a revoked or expired session keeps working until the user does a full reload.

A layout gate therefore covers the first view and then quietly stops. `handle`
runs on every request — page, action, and endpoint alike — which is the only
place the guarantee actually holds.

## Shape

```ts
const PUBLIC_PATHS = ['/', '/stats'];
```

Everything not matching the allowlist redirects to identity's `/login` with an
absolute `return_url`.

`/` and `/stats` are public deliberately: DEV-111 frames waitlist numbers as
transparency for prospective members, who by definition are not signed in yet.

## Gotcha worth repeating

`return_url` **must be absolute**. Identity rejects a bare path with a 400. Use
`event.url.href` server-side and `page.url.href` in components — never anything
derived from `window.location`, which is `undefined` during SSR and produces
exactly that 400 before hydration would have fixed it.

# 0005 — Namespaced role strings for training permissions

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-109

## Context

Identity stores roles in a `user_roles` table whose `role` column is an
unconstrained `text` — no enum, no schema, no published vocabulary. A user's
grants arrive as `SessionContext.roles: string[]`.

Identity's typed RPC surface (`IdentityRpc`) exposes exactly one method,
`getSessionContext`. Role administration methods (`addRole`, `setRoles`,
`listUsersByRole`, …) exist on the Worker class and are callable at runtime, but
are deliberately not in the typed interface. There is no self-service UI for
granting roles that we control.

`community-website` uses bare and colon-namespaced strings in the same table:
`admin`, `events:manage`, `events:prohibit_signup`. So the namespace is shared
across all apps — a bare `admin` from another app would otherwise silently grant
access here.

## Decision

Define our vocabulary in `src/lib/utils/permissions.ts`, namespaced under
`training:`, mirroring community-website's `Role` enum + `canManage()` pattern:

```ts
export enum Role {
	ADMIN = 'training:admin',
	INSTRUCTOR = 'training:instructor'
}
```

`canManage()` makes `training:admin` imply every other training role, so admin
checks don't need to be repeated at each call site.

## Consequences

- **Nothing grants these yet.** No rows exist in identity's production
  `user_roles` with a `training:` prefix, so every gate reads `false` until
  someone writes them — currently only possible through an untyped RPC call or
  direct D1 access. That is fine: nothing in this iteration depends on a role.
- **`admin` (bare) deliberately does not work here.** A community-website admin
  is not automatically a training admin. If that turns out to be the wrong call,
  it is a one-line change — but the safer default is the explicit grant.
- Before the first staff-facing feature ships (DEV-106 and parts of DEV-101),
  someone has to actually grant `training:admin` to the training staff. Treat
  that as a release task, not an afterthought.
- If the vocabulary grows much past a handful of roles, it belongs in identity
  as a shared published enum rather than duplicated per app.

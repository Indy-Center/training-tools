# 0001 — Auth via identity's Cloudflare service binding

- **Status:** accepted
- **Date:** 2026-09-20
- **Ticket:** DEV-109

## Context

The app needs VATSIM-backed sign-in. The org runs an `identity` service at
`auth.flyindycenter.com`, so the obvious assumption is "point an OIDC client at
it."

That assumption is wrong, and it is worth writing down because it is the single
easiest way to waste a day here. **Identity is not an OAuth2/OIDC provider.** It
is a Cloudflare Worker that is itself an OAuth _client_ of VATSIM Connect. It
exposes no `/oauth/authorize`, no `/oauth/token`, no `/userinfo`, no JWKS, no
introspection endpoint. Its entire HTTP surface is `/healthz`, `/login`,
`/login/callback`, `/logout`.

Consumers integrate by:

1. Reading the `fic_session` cookie, which identity sets on `.flyindycenter.com`
   (HttpOnly, SameSite=Lax, 30-day sliding expiry).
2. Exchanging that opaque token for a `SessionContext` over a **Cloudflare RPC
   service binding**, via the single published method
   `getSessionContext(token)`.

## Decision

Integrate exactly as `Indy-Center/charts` does — the reference implementation
named by `tech.flyindycenter.com/patterns/auth/`. Take the typed contract from
the `@indy-center/identity` npm package (types only, zero runtime).

This app **never** sets, refreshes or deletes the session cookie. Identity owns
its full lifecycle. We have no `/login`, `/logout` or `/callback` routes; those
are outbound links to identity.

## Consequences

Three hard constraints follow, and none of them have a workaround:

1. **This app must be a Cloudflare Worker on account
   `afd63515948c9b2188ce14ef1504b2c1`.** Service bindings are not
   internet-reachable and do not cross accounts. Hosted anywhere else, this app
   cannot authenticate at all — there is no HTTP fallback to degrade to.
2. **It must be served from a `*.flyindycenter.com` subdomain.** The cookie is
   scoped to that domain; on any other origin the browser simply never sends it.
   `training.flyindycenter.com` already satisfies identity's `return_url`
   allowlist (one level of subdomain over https), so no change to the identity
   repo was needed.
3. **Auth degrades silently by design.** When the binding is missing or throws,
   `getSessionContext` returns `null` and the request is treated as logged out.
   That is right for production resilience but makes local misconfiguration look
   like "login is broken" rather than an error. See
   [`../research/identity-integration.md`](../research/identity-integration.md).

The upside is that there are no secrets to manage: no client id, no client
secret, no shared signing key. The binding is declared in `wrangler.jsonc` and
that is the whole configuration.

## Alternatives rejected

- **Point at VATSIM Connect directly**, as `community-website` still does. This
  would mean our own OAuth client, our own session table, our own cookie — and
  a second, separate login for users. It also moves away from where the org is
  deliberately heading. Rejected.
- **Add an HTTP validation endpoint to identity** so any host could verify a
  token. Real work in someone else's repo, to buy portability we don't need.
  Worth revisiting only if an app ever has to live off Cloudflare.

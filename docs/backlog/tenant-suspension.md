# Tenant suspension — enforceable, not just recorded

**Status:** open. `POST /api/platform/tenants/:id/suspend` answers **501** as of
2026-08-05. Before that it answered 200 with a `suspendedAt` timestamp and
wrote nothing.

**Why it refuses rather than being wired.** `Tenant.isActive` exists, so wiring
it is a two-line change — and it would not suspend anything.

| Path | Reads `tenant.isActive`? |
|---|---|
| `auth.service.ts` — register | **Yes** |
| `auth.service.ts` — login | **No** — reads `user.isActive`, a different flag |
| `auth.service.ts` — token refresh | **No** — `user.isActive` again |
| `tenantMiddleware` — every authenticated request | **No** — decodes the JWT, no database read |
| `tenant-lookup.routes.ts` | Filters lists only |

Writing `isActive: false` today blocks **new user registration** and nothing
else. Existing sessions continue, existing users still log in, every request
still passes. That converts a false claim into an unenforced one and adds a
database row that makes the lie look substantiated — worse than the 501,
because the row is evidence.

---

## What building it takes

### 1. Write the flag, both directions

`suspend` sets `isActive: false`; **`unsuspend` sets it back.** A one-way
access control is its own defect — and here it was the thing that hid the
original mock, because nobody could try to undo a suspension.

### 2. Enforce it at three points

- **Login** — a suspended tenant's users must not get tokens.
- **Token refresh** — otherwise an existing session outlives the suspension
  for as long as the refresh token does.
- **`tenantMiddleware`** — otherwise an access token issued before the
  suspension keeps working until it expires.

Any two of the three leaves a hole big enough to drive a session through.

### 3. The design decision — state it, do not drift into it

`tenantMiddleware` currently performs **zero database reads**. It is a pure JWT
decode on every authenticated request, and that is a property worth keeping or
losing on purpose.

| Approach | Cost | Staleness |
|---|---|---|
| Database lookup in middleware | A query on every authenticated request | None |
| Cached lookup (Redis, short TTL) | One query per TTL per tenant | Up to the TTL |
| JWT claim, refreshed at login | Free | Until the access token expires |

The third is cheapest and weakest: a suspension would not take effect until the
current access token expires. Whether that is acceptable is a product call
about how fast a suspension must bite — which is the question to answer before
writing code, not after.

### 4. Blast radius

**This code can lock out every user of a tenant.** It needs a deliberate test
pass, not incidental coverage:

- login while suspended → refused
- token refresh while suspended → refused
- **mid-session request** while suspended → refused (the case a login-only
  check misses)
- unsuspend → all three work again
- a *different* tenant is unaffected throughout

### 5. `suspendedAt` and `reason` have nowhere to live

The mock's response promised both. `Tenant` has only the `isActive` boolean, so
either add columns — `suspendedAt`, `suspendedReason`, and probably
`suspendedBy`, since this is an operator action somebody will need to audit —
or narrow the response to what can be substantiated.

Prefer the columns. "Who suspended this tenant and why" is exactly the question
asked after the fact, and a boolean cannot answer it.

---

## Related

Found during the capability-scoped pass of `false-success-audit.md`, which
exists because the legal-hold **release** path was a mock while the enable path
was real. Same rule found this one: **check the reverse direction first.**

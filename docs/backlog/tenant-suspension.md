# Tenant suspension — enforceable, not just recorded

**Status: CLOSED — shipped 2026-08-06.** Kept for the reasoning.

## What shipped

- **Both directions.** `POST /platform/tenants/:id/suspend` writes the row;
  `POST /platform/tenants/:id/unsuspend` lifts it. A one-way access control is
  its own defect, and its absence is what hid the original mock — nobody could
  try to undo a suspension and discover that suspending had done nothing.
- **Enforced at three points**: login, token refresh, and `tenantMiddleware`.
  Any two leaves a hole the size of a session — refresh alone buys seven days,
  and an access token issued before the suspension works until it expires.
- **`suspendedAt`, `suspendedBy`, `suspendedReason` are columns.** A boolean
  cannot answer "who suspended this tenant and why", and the old response
  promised a timestamp it had nowhere to store. The response reads the row back
  rather than echoing the request.
- **A missing tenant is inactive**, not an error. Returning `true` on a lookup
  miss is how a fail-open creeps in.

## What was deliberately bounded

**A suspension takes effect within 30 seconds, not instantly.**

`tenantMiddleware` performed zero database reads — a pure JWT decode on every
authenticated request — and this change had to keep, spend or bound that.

| Option | Cost | Staleness |
|---|---|---|
| Query in the middleware | A round trip per authenticated request | None |
| **Cache with a short TTL** | One query per tenant per window | **Up to the TTL** |
| JWT claim refreshed at login | Free | Up to 15 minutes |

Chosen: **a 30-second per-process cache**, invalidated locally on suspend and
unsuspend, so the instance serving the change is correct immediately and the
others catch up within the window.

The JWT claim was rejected because fifteen minutes of continued access after an
operator suspends a tenant is precisely the gap suspension exists to close. The
uncached read would put a query on the hottest path in the application for a
value that changes approximately never.

**If it ever needs to be instant, the answer is a shared invalidation channel —
Redis pub/sub or equivalent — not a shorter TTL.** Shortening the window trades
away the hot-path saving for an improvement that never reaches zero; a channel
removes the staleness entirely. No Redis client is wired today, which is why
this was not the first choice.

The bound is stated in `tenant-status.service` beside the code, not only here.

## The blast radius, and how it is covered

This code can lock out every user of a tenant, so the integration tests exist
for that rather than for coverage: login, refresh, **mid-session** (the case a
login-only check misses), restoration on unsuspend with the audit columns
cleared, and **a bystander tenant reachable throughout** — which is where a
wrongly-keyed cache would fail.

---

## The original entry, kept for the reasoning

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

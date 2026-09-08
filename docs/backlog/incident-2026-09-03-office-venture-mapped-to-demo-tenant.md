# Incident: `burkham-wickmont` resolved to the Demo Advisors tenant for 62 brokered calls

**Dates:** 2026-09-03 21:18:45Z – 2026-09-04 16:24:19Z (all times UTC)
**Found:** 2026-09-08, reading back the ledger row written by the first correctly-mapped brokered call
**Status:** no longer occurring; **the 62 rows are left exactly as written** — see *Not corrected, deliberately*

## What a reconstructor will see

Querying `ledger_events` for `eventType = 'office.module.called'` and
`payload.venture = 'burkham-wickmont'` returns rows split across **two
different tenants**:

| rows | `tenantId` | tenant | when |
|---|---|---|---|
| 62 | `b615d509-cb7f-4cd6-954c-33b68f87ddb2` | Demo Advisors LLC | 2026-09-03 → 2026-09-04 |
| 1+ | `d96b4fc3-f963-419d-ae9c-daa4fa7d5fba` | Burkham Wickmont | 2026-09-08 → |

**That discontinuity is real and is not a data fault.** The venture's history
does not begin in its own tenant. Anyone reconstructing what The Office did on
behalf of Burkham Wickmont before 2026-09-08 finds it recorded against Demo
Advisors, and this note is the explanation.

## The boundary, stated precisely

- **Window:** first row `2026-09-03T21:18:45.459Z`, last `2026-09-04T16:24:19.150Z`.
  No cross-tenant row exists outside it.
- **Volume:** 62 rows. Every one carries `payload.venture = 'burkham-wickmont'`
  and `tenantId` = the Demo Advisors tenant.
- **Reads vs writes:** 50 were `GET`. Twelve were non-GET, of which **nine were
  refused** (`400`, `404`, five `422`s, two more `422`s) and wrote nothing.
  **Three writes succeeded:**

  | when (UTC) | status | call |
  |---|---|---|
  | 2026-09-03T21:41:22.947Z | 201 | `POST /api/businesses/seed-biz-001/consent` |
  | 2026-09-03T22:41:43.142Z | 201 | `POST /api/businesses/seed-biz-001/consent` |
  | 2026-09-03T22:41:50.260Z | 200 | `POST /api/applications/office-probe-draft-001/submit` |

- **What they touched:** three resource ids across all 62 rows —
  `seed-biz-001`, `seed-app-001`, `office-probe-draft-001`. The first two are
  seed fixtures created by `prisma/seed.ts`; the third was a probe draft made
  during that session and no longer exists.
- **No real client data crossed tenants.** The Demo Advisors tenant has held
  only the three seeded businesses (`seed-biz-001/002/003` — Apex Digital,
  Meridian Health, Ironclad Logistics) for the whole period. There has never
  been a non-seed business in it, so there was no real client file for a
  Burkham-venture call to reach.

## How it happened — and a correction to the first account

The first account of this said the mapping predated `OFFICE_VENTURE_TENANTS`
existing, i.e. that there was no mapping mechanism yet and the tenant was
arrived at some other way. **That is wrong, and the timestamps say so.**

`OFFICE_VENTURE_TENANTS` and `src/backend/config/office.ts` were both added in
`7350f0d`, authored `2026-09-03T21:25:58Z`. The first cross-tenant ledger row is
`2026-09-03T21:18:45.459Z` — about seven minutes *earlier*, from the working
tree of that same session. Every one of the other 61 rows is after the commit.

That version of `ventureTenantMap()` is the one still in the tree today: it
requires the env var, has **no fallback and no default**, and an unmapped
venture is refused with `403 VENTURE_NOT_MAPPED` *before* any inner call or
ledger write. So a ledger row that exists at all is proof the map resolved.

**Therefore: `OFFICE_VENTURE_TENANTS` was set, for all 62 calls, to
`burkham-wickmont:b615d509-…` — the Demo Advisors tenant id.** The mapping was
configured, not absent. The guard did not fail; it was handed that answer.

What cannot be recovered is the literal `.env` of that period — it is untracked
and has since been rewritten. So *why* it was set that way is inference, not
record. The available reading: **no Burkham Wickmont tenant existed to point
at.** The `tenants` table held exactly one row until 2026-09-08, when the
Burkham tenant was created. A developer wiring up the bridge had one tenant id
available and used it. That is a placeholder that was never revisited, not a
decision to join two tenants — but it is inference, and should not harden into
fact through repetition. The rows are what is known.

## Not corrected, deliberately

**The 62 rows have not been edited, re-tenanted or deleted, and must not be.**
`ledger_events` is the canonical append-only audit ledger; `docs/compliance.md`
calls it a tamper-evident chain of custody. A rewritten audit trail is worse
than a discontinuous one: the discontinuity is a true fact about what the
system did, and a repair would destroy the only evidence of it while making the
record *look* clean. The correct remedy for a wrong entry in an append-only
ledger is an explanation appended beside it — this note.

## What closed it

`OFFICE_VENTURE_TENANTS` now maps `burkham-wickmont` to the real Burkham tenant
(`d96b4fc3-…`), and both it and the broker principals are seeded by
`prisma/seeds/office-bridge.ts` rather than inserted by hand, so the ids are the
same on every machine and in CI.

The underlying condition — that the map is per-machine `.env` configuration and
nothing checks it against reality — **is not closed.** `ventureTenantMap()`
validates the map's *shape*, never that the tenant id names a tenant whose
identity has anything to do with the venture. The same misconfiguration is
still expressible today and would again produce plausible, well-formed,
wrong-tenant rows. That is the residual risk this note exists to make visible.

## Standing check

When a venture is mapped to a tenant, confirm the tenant is that venture's own
before the first brokered call — not that the call succeeds. A brokered call
against the wrong tenant returns `200` and writes a valid ledger row. Success
is not evidence of correct tenancy, and nothing downstream will disagree.

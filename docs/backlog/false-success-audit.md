# Audit: success reported for things that did not happen

**Status:** open — audit list below, **no fixes applied**
**Surfaced by:** three defects in one session, which turned out to be one pattern

## The pattern

Optimistic UI written against endpoints that do not do what their name implies.
The interface reports success, navigates away, or both — and the write never
happened. Each instance looked like its own bug:

1. **New Application** — the form POSTed to `/api/v1/applications`, a route that
   did not exist. Its `catch` navigated to the applications list anyway
   (*"If API doesn't exist yet, just redirect back"*), so a failed create looked
   like a successful one: the user landed on a list of applications theirs was
   not on.
2. **Optimizer 401** — a raw `fetch` with no refresh reported *"Your session has
   expired"* while the session was fine. The inverse failure: a working action
   reported as broken, and the real cause hidden behind a fixed string.
3. **save-strategy / create-round** — both mocks. Toasted *"Strategy saved to
   <client> profile"* and *"Funding Round N created"*, then navigated to
   `/funding-rounds`. Neither wrote anything; `create-round` invented an id.

All three are now fixed. The pattern is not.

**Why it matters here specifically:** this is a funding and compliance product.
"Strategy saved to client profile" and "Funding Round created" are claims about
records an advisor will later act on. A UI that reports a write it did not make
is a data-integrity defect, not a cosmetic one.

## What to audit

**43 success toasts across 17 files**, plus every post-action `router.push`.
For each: does the endpoint it reports on actually persist?

Three questions per site:

1. Does the endpoint write to the database, or is it a mock/stub?
2. Is the toast inside the success path, or does a `catch` also reach it?
3. Does navigation happen before the write is confirmed?

### Highest-signal files first

| File | Toasts | Navigations | Why it ranks here |
|---|---|---|---|
| `app/platform/workflows/page.tsx` | 8 | 0 | Most toasts in the app; unaudited |
| `app/clients/[id]/page.tsx` | 4 | 2 | Toast **and** navigation on client records |
| `components/funding-rounds/RoundActionButtons.tsx` | 2 | 2 | Funding rounds — money attached |
| `components/credit-builder/TradelineTracker.tsx` | 4 | 0 | Writes to a credit-building record |
| `components/clients/DocumentsTab.tsx` | 4 | 0 | Document vault; compliance-relevant |
| `app/optimizer/page.tsx` | 4 | 0 | Two already fixed; other two unaudited |
| `components/documents/GenerateDocumentModal.tsx` | 3 | 0 | Document generation |
| `app/pricing/page.tsx` | 3 | 0 | Pricing changes |
| `app/platform/reports/ScheduledReports.tsx` | 2 | 0 | Report schedules — `docs/gaps.md` says nothing stores one |
| `app/declines/page.tsx` | 2 | 0 | Reapply reminders — `gaps.md` says nothing schedules them |
| `components/dashboard/ActionQueue.tsx` | 1 | 0 | Dismissals — `gaps.md` says anomalies have no stable id |
| `components/applications/NewApplicationModal.tsx` | 1 | 0 | Sibling of the form already fixed |

Remaining single-toast files: `app/regulatory/page.tsx`,
`app/disclosures/page.tsx`, `app/compliance/training/page.tsx`,
`components/applications/GenerateDocumentModal.tsx`.
`components/global/ToastProvider.tsx` is the provider itself — not a call site.

### Known-refusing endpoints to cross-reference

`docs/gaps.md` lists twenty-one endpoints that answer 501, including report
schedules, referrals, decline reminders, overdue reminders, anomaly dismissal,
and the two optimizer actions added this session. **Any success toast whose
endpoint appears on that list is a confirmed defect** — that cross-reference
alone should resolve a good portion of the list without reading the code.

Also check `credit-union.routes.ts` and `simulator.routes.ts`, which carry
mock markers.

## Regenerate the list

```sh
grep -rn "toast.success\|showToast(" --include=*.tsx --include=*.ts src/frontend \
  | grep -v "\.next"
grep -rn "router.push" --include=*.tsx src/frontend | grep -v "\.next"
```

## Suggested output

A table of `call site → endpoint → persists? → verdict`, with verdicts limited
to: **real**, **claims a write that does not happen**, **navigates before
confirming**, or **reachable from a catch**. Fix in a second pass, once the
scale is known — some will be one-line moves of a toast into the success branch,
and others need the endpoint built.

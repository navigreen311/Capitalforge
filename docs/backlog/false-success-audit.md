# Audit: success reported for things that did not happen

**Status:** open — audit list below, **no fixes applied**
**Surfaced by:** three defects in one session, which turned out to be one pattern

## The standing question

Every entry below reduces to one of two checks, and they are not the same:

1. **Does anything read it?**
2. **Does anything act on it?**

A field can pass the first and fail the second — collected, transmitted,
accepted by a request schema, and never consulted by the code that decides the
outcome. That is indistinguishable, from the outside, from a value that shaped
everything. Six optimizer inputs passed check one and failed check two, and one
of them was reported by the provenance panel as `advisor_entered`: the tool
built to make inputs trustworthy, vouching for an input nothing used.

Ask both of every surface in this audit. A toast that reports a write nothing
performed and a field that reports an influence nothing exercised are the same
defect, and the second is quieter.

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

## A fourth instance: a panel that never ran

Found 2026-08-03, after the three above, and it is the same pattern pointed the
other way — not a success reported for a write that did not happen, but a whole
input surface implying an influence it did not have.

The optimizer's **Credit Union Eligibility panel** collects state of residence,
employer, military status, tech-industry status and existing memberships, and
computes an eligibility result on screen. The run payload sent
`includeCreditUnions: false` — hardcoded, never wired to anything. **Every field
in that panel was computed client-side and discarded.** No credit union card
could appear in a plan, whatever an advisor entered.

It cost real time: several rounds of debugging treated the panel as live and
returning nothing, when it had never executed. Nothing about it looked disabled.

Now fixed — an explicit "Include credit unions in this plan" toggle, the
eligibility fields sent, and each CU recommendation stating whether the client
is a member, how they could join, or that their standing is unknown. Logged here
because the class is worth watching for: **a form that changes nothing is the
same defect as a toast that saves nothing**, and it is harder to spot, because
there is no false message to catch — only a control that appears to matter.

Worth adding to the audit below: for each input surface, does anything read it?
A field whose value never reaches a request is the quietest version of this
pattern.

## A fifth instance: inputs the scorer never reads

Found 2026-08-04, immediately after the credit union panel, and the same shape
one level down. Not a whole surface this time — individual fields.

Six inputs on the optimizer form are collected, transmitted, accepted by the
request schema, and **never read by the scorer**:

| Field | Status |
|---|---|
| `dnbPaydex` | inert |
| `experianBis` | inert |
| `ficoSbss` | inert |
| `employees` | inert |
| `inquiries24mo` | inert — only the 12-month figure is used |
| `derogatoryMarks` | inert |

`ApplicationContext` — everything the scorer sees — carries exactly `ficoScore`,
`annualRevenue`, `businessAgeMonths`, `recentInquiries`, `existingCardCount` and
the held-product set. Nothing else reaches scoring.

**`derogatoryMarks` is the sharp one.** The field was added so the provenance
banner would stop reporting it as an assumed default. It now reports
`advisor_entered` in the Inputs Used panel — which states, on the panel built
for exactly this purpose, that a value the advisor supplied was used. It was
not. A provenance panel that vouches for an unused input is worse than no
panel, because it converts a quiet omission into an explicit false claim.

`inquiries24mo` is the second sharp one: the field's own helper text reads
"Chase 5/24 uses 24-month count", and 5/24 does not read it.

**Marked, not wired.** Each field says "not used in scoring yet" on the form,
and every provenance entry carries `influencesPlan`, so the Inputs Used panel
greys and strikes the values the scorer never read. The flag is stored with the
plan rather than derived at render: the unread set will shrink as fields are
wired, and a plan read later must report the system that produced it. Wiring them is a modelling decision
— what weight does a PAYDEX of 72 carry against a FICO of 745 — and inventing
weights would produce a plan that looks more informed than it is, which is the
same defect in a more expensive form.

This is the instance that produced the standing question at the top of this
document.

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

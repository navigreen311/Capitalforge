# 87 raw `fetch` call sites with no token refresh

**Status:** open, not started
**Suggested branch:** `ai-feature/auth-refresh-sweep`
**Surfaced by:** four separate bug reports across one session — the dashboard,
the client roster, the New Client wizard, and the optimizer — each of which was
the same defect on a different page.

## The defect

Access tokens live **15 minutes**. Refresh tokens live **7 days**.

`apiClient` and the `loadJson` helpers answer a 401 by spending the refresh
token and retrying once. **87 call sites across 39 files do not**: they call
`fetch()` directly with `...authHeaders()`, which attaches whatever token is in
`localStorage` and reports the refusal.

The failure is not a broken session. It is a session that was never renewed.

## Why it keeps arriving as four different bugs

Every one of these pages works for fifteen minutes and then does not, and the
symptom depends entirely on how that page words its error:

- `/optimizer` mapped 401 to *"Your session has expired."* — the user was
  signed in, and the client dropdown on the same page still showed data,
  because it had been fetched on mount while the token was good.
- `/clients` printed *"HTTP 401"* as a dead end.
- The New Client wizard passed the server's `AUTH_TOKEN_MISSING` wording
  straight through, after five steps of typing.

Each looked like its own bug. None was.

**A page that loads fine and fails on the first click is this defect.** Expect
more reports until the sweep is done.

## The work

Each site becomes a `loadJson` call with classified error handling — the shape
already applied to `app/clients/page.tsx` and `app/optimizer/page.tsx`:

```ts
try {
  const data = await loadJson<T>('/api/...');
} catch (e) {
  const info = toLoadError(e);
  // auth_required | network_error | server_error
}
```

Mechanical, but 87 of them, and each carries its own error copy that should be
kept rather than flattened. Worth doing as one branch so the pages stay
consistent with each other.

`lib/fetch-all-pages.ts` builds its own header the same way and is used by
several pickers. It is shared, so it is one fix rather than a call-site fix,
and it belongs in this sweep.

## Files

Counts are `authHeaders()` occurrences, excluding comments.

| File | Sites |
|---|---|
| `app/disclosures/page.tsx` | 5 |
| `app/declines/page.tsx` | 5 |
| `app/compliance/documents/page.tsx` | 5 |
| `components/offboarding/offboarding-view.tsx` | 4 |
| `app/regulatory/page.tsx` | 4 |
| `app/comm-compliance/page.tsx` | 4 |
| `components/notification-inbox.tsx` | 3 |
| `app/statements/page.tsx` | 3 |
| `app/spend-governance/page.tsx` | 3 |
| `app/documents/page.tsx` | 3 |
| `app/compliance/training/page.tsx` | 3 |
| `app/compliance/regulatory/page.tsx` | 3 |
| `app/compliance/complaints/page.tsx` | 3 |
| `app/billing/page.tsx` | 3 |
| `components/dashboard/RecentActivity.tsx` | 2 |
| `app/workflows/page.tsx` | 2 |
| `app/training/page.tsx` | 2 |
| `app/rewards/page.tsx` | 2 |
| `app/platform/data-lineage/page.tsx` | 2 |
| `app/issuers/page.tsx` | 2 |
| `app/funding-rounds/page.tsx` | 2 |
| `app/financial-control/simulator/page.tsx` | 2 |
| `app/fair-lending/page.tsx` | 2 |
| `app/decisions/page.tsx` | 2 |
| `app/compliance/decisions/page.tsx` | 2 |
| `app/compliance/deal-committee/page.tsx` | 2 |
| `app/compliance/comm-compliance/page.tsx` | 2 |
| `app/platform/voiceforge/page.tsx` | 1 |
| `app/platform/reports/page.tsx` | 1 |
| `app/platform/crm/page.tsx` | 1 |
| `app/partners/page.tsx` | 1 |
| `app/financial-control/tax/page.tsx` | 1 |
| `app/financial-control/hardship/page.tsx` | 1 |
| `app/compliance/disclosures/page.tsx` | 1 |
| `app/compliance/contracts/page.tsx` | 1 |
| `app/clients/[id]/page.tsx` | 1 |
| `app/ai-governance/page.tsx` | 1 |

Paths are relative to `src/frontend/`. Regenerate with:

```sh
grep -rn "authHeaders()" --include=*.tsx --include=*.ts src/frontend \
  | grep -v "\.next" | grep -v "api-client.ts\|load-json.ts" | grep -v "//"
```

## Already done

- `app/clients/page.tsx` — roster and quick-add
- `app/optimizer/page.tsx` — run, save-strategy, create-round
- `components/dashboard/NavBadgeProvider.tsx`, `components/notification-inbox.tsx`
  — gated on session existence rather than converted; the bell's remaining
  sites are in this list.

---

# Sweep log

## Corrections to the scope above

**37 files, not 39.** `app/clients/page.tsx` and `app/optimizer/page.tsx` are
already converted and now contain only comments mentioning `authHeaders()`.
The 87 call-site count is unchanged.

**A second population: ~54 inline `Authorization: Bearer` headers.** These do not
call `authHeaders()` at all, so the grep this document was built from could not
see them. They sit in about twenty files, **fourteen of which also use
`authHeaders()`** — so those files mix both styles. Real total is nearer 130.

This is the third time this session that a survey scoped around one spelling
missed a variant. The rule taken from it: **scope a sweep by the behaviour, not
the idiom** — "what gets an auth header attached" rather than "what calls
`authHeaders()`".

## Deliberate exclusions

- `app/login/page.tsx` and `app/login/two-factor/page.tsx` — a token refresh
  during sign-in is meaningless. There is no session to renew, and the failure
  these pages need to report is a wrong password.

## Batch 0 — `lib/fetch-all-pages.ts` (done, `11e84e3`)

Shared by twelve pages, so it went first and alone.

## Batch 1 — compliance documents, complaints (done); training deferred

### Resisted: `app/compliance/training/page.tsx`

Not converted. It fetches two endpoints together and **tracks which of them
failed**, reporting a partial result naming the missing part. `loadJson` throws,
which collapses that distinction — converting it means restructuring the error
handling, which is a redesign rather than a mechanical swap.

It also defines its **own local `authHeaders()`** at line 49 — a third variant
of the same idiom, invisible to a search for the shared import.

Wants its own change: keep the per-endpoint failure reporting and add refresh
around each request.

## Logged while sweeping — not fixed

These are the audit's subject, found in passing. Not touched, per the sweep's
mechanical-only rule.

- **`app/compliance/documents/page.tsx`** — every mutation is fire-and-forget
  with `.catch(() => {})` behind an optimistic UI update. Deleting a document
  toasts "deleted" and removes it from the list before the DELETE is attempted;
  a failed request leaves the row gone from the screen and present on the
  server. **Legal hold is the serious one**: the page reports "legal hold
  enabled" whether or not the PATCH succeeded, and a legal hold that was never
  applied is a compliance failure that looks like a success.
- **Both pages fall back to placeholder data** when the initial GET fails
  (`catch { /* use placeholder */ }`), so an unreachable server renders a list
  of invented documents and complaints indistinguishable from real ones.

Both belong in `false-success-audit.md` rather than here; recorded at the point
of discovery so the trail is not lost.

## Batch 2 — a fourth population, found where it was predicted

`app/compliance/regulatory/page.tsx` and `app/compliance/deal-committee/page.tsx`
converted. Then the import rewrite failed on the first file, because it does not
import `authHeaders` — **it defines its own.**

**14 files define a local `authHeaders()`**, each a private copy of the same four
lines reading `cf_access_token` from `localStorage`:

```
app/comm-compliance/page.tsx            app/disclosures/page.tsx
app/compliance/comm-compliance/page.tsx app/fair-lending/page.tsx
app/compliance/decisions/page.tsx       app/regulatory/page.tsx
app/compliance/regulatory/page.tsx      app/training/page.tsx
app/compliance/training/page.tsx        components/dashboard/RecentActivity.tsx
app/decisions/page.tsx                  components/notification-inbox.tsx
app/declines/page.tsx                   components/offboarding/offboarding-view.tsx
```

These were counted — a local `authHeaders()` call still matches the call-site
grep — so the 87 figure holds. What was wrong was the *fix*: "replace the import"
does not apply to a file that never imported anything. Each needs its local
definition deleted as well as its call sites converted.

That is the fourth spelling of one behaviour in this codebase: the shared
`authHeaders`, an inline `Authorization: Bearer`, a hand-rolled
`toLowerCase().replace()` for issuer slugs, and now a locally-redefined header
builder. **Each was found only after the previous one was fixed.** The lesson is
already written down above and keeps earning it: scope by behaviour, not idiom —
here, "what reads `cf_access_token`", which finds all four at once.

## Re-scoped, 2026-08-04 — one pass per file

The original file list was built from `authHeaders()`. Three further spellings
of the same behaviour turned up afterwards, each only once the previous had been
fixed. Continuing against that list would mean a second pass over fourteen files
already touched, and a third over whatever the inline-Bearer pass then revealed.

**The sweep is now scoped by the behaviour: what reads `cf_access_token`.**

```sh
grep -rln "cf_access_token\|authHeaders()" --include=*.tsx --include=*.ts src/frontend \
  | grep -v "\.next"
```

That finds all four spellings at once — the shared import, the inline
`Authorization: Bearer`, the locally-redefined builder, and any file that reaches
into `localStorage` directly. A file is done when the search returns nothing for
it, which is a check the previous scope could not express.

**59 files remain.** Each is converted once: call sites to `loadJson`, any local
`authHeaders()` deleted, inline headers removed with it.

### Excluded, deliberately

`lib/api-client.ts`, `lib/load-json.ts`, `lib/token-refresh.ts`,
`lib/auth-routes.ts`, `hooks/useSessionGate.ts` — these *are* the auth boundary
and are supposed to read the token. `app/login/**` — no session to renew.
`hooks/useAuthFetch.ts` — the hook already refreshes; its own read is the source.

### Remaining batches

| | Area | Files |
|---|---|---|
| 2 (finish) | compliance twins | `compliance/comm-compliance`, `compliance/decisions` |
| 3 | top-level compliance twins | `comm-compliance`, `decisions`, `declines`, `disclosures`, `regulatory`, `fair-lending` |
| 4 | compliance remainder | `complaints`, `documents`, `compliance/contracts`, `compliance/disclosures` |
| 5 | dashboard components | 8 files under `components/dashboard/` |
| 6 | client tabs + wizard | 5 `components/clients/*Tab`, `ApplicationWizardShell`, `clients/[id]` |
| 7 | funding rounds | 4 `components/funding-rounds/*`, `funding-rounds`, `funding-rounds/new`, `SaveFundingPlanButton` |
| 8 | platform | `platform/{crm,data-lineage,referrals,reports,voiceforge,workflows}`, `workflows` |
| 9 | financial + settings | `billing`, `statements`, `spend-governance`, `rewards`, `issuers`, `pricing`, `partners`, `settings`, `financial-control/{tax,hardship,simulator}` |
| 10 | remainder | `training`, `notification-inbox`, `offboarding-view`, `AskCapitalForge`, `lib/claude-document-service`, `ai-governance`, `applications/new` |

`app/compliance/training/page.tsx` stays out of the batches — it is the one file
that resisted, and it needs its per-endpoint failure reporting kept rather than
flattened.

Two files in batch 5 and batch 10 are not components —
`components/dashboard/DashboardEventBus.ts` and `lib/claude-document-service.ts`.
Neither can surface an error to a user directly, so the conversion has to decide
what a failure means to their callers rather than adding a toast. Expect them to
resist.

## Batch 3 — the six top-level compliance twins (done)

`comm-compliance`, `decisions`, `declines`, `disclosures`, `regulatory`,
`fair-lending`. All six defined their own `authHeaders()`; all six are gone.

### The partial-load shape converts cleanly

Four of these pages fetch several endpoints together and name which one failed
(`partial: string[]`, "per-module rates", "the coverage check"). That shape is
why `app/compliance/training/page.tsx` was set aside in batch 1 as resisting.

It does not resist. `loadJson(...).then(parse).catch(() => null)` inside the
existing `Promise.all` keeps per-endpoint reporting exactly, because the catch
is per-promise rather than around the group. **The training page should be
reconsidered** — it was excluded on a judgement that four later files disproved.

### `null` is not always a safe sentinel

`fair-lending` resisted for a reason the others did not: `toFairLendingDashboard`
and `toCoverageCheck` return `null` for a payload they do not recognise. Using
null to mean "did not load" would merge that with "did not answer", and only the
second is a load failure — the page would name an endpoint that is up.

It resolves `{ loaded, value }` instead. The other pages' parsers return arrays
or a Map and never null, so a bare null is unambiguous there.

`declines` has the same `| null` parsers, but its old code set null on both
paths and reported neither, so the bare-null conversion is behaviour-identical.

### Logged, not fixed

- **`app/disclosures/page.tsx`** — a failed version-history read renders as "no
  prior versions". Separating them needs an error state and somewhere to show
  it, which is a redesign rather than a conversion.
- **The `no-restricted-syntax` issuer rule has a false positive.** It fires on
  `app/declines/page.tsx:713`, which is `r.issuer.toLowerCase().includes(q)` —
  a search box filtering rows by typed text, not issuer identity. Lowercasing
  for a substring match is correct there and `parseIssuer` is the wrong tool.
  The rule matches `issuer` plus `.toLowerCase()` without regard to what the
  result is used for. It is a warning, so CI stays green, but a rule that fires
  on legitimate code is one people learn to scroll past — the same
  warning-fatigue failure argued against in `chase-524-enforcement.md`. Needs
  the rule narrowed to cases where the normalised value is compared against an
  issuer constant, not every lowercase of a field called `issuer`.

## Batch 4 — complaints, documents, contracts, compliance disclosures (done)

Eleven call sites. `complaints` was the first file in the sweep whose reads were
all inline `localStorage.getItem('cf_access_token')` rather than any helper —
the population the original `authHeaders()` scope could not see at all.

### Two of the seven token reads in `complaints` were dead

Lines 1334 and 1538 read the token into a `const` that nothing used. Both sat
above a `fetchAllPages` call, which builds its own header — so the reads were
left behind when that walk moved into the shared helper. ESLint had been
reporting both as unused the whole time, as warnings, among others.

They were harmless, but they are the reason a grep-based scope over-counts:
two of the eighty-seven "call sites" were never call sites.

### Logged, not fixed

- **`app/documents/page.tsx`** previously answered a non-success client-list
  response with an empty list and no error, so an unreadable roster looked like
  a tenant with no clients. Now reported. (Fixed in passing — it is the same
  line the conversion rewrites, not a separate change.)

## Batch 5 — dashboard components (done)

Seven files. `DashboardEventBus.ts` resisted as predicted, but not for the
reason predicted, and what it turned up is the most serious thing in the sweep
so far.

### Two dashboard event streams have never recorded anything

`POST /api/v1/events` requires `event_type` (snake_case) and an object
`payload`, and derives the aggregate id from **inside** that payload:
`payload.aggregateId ?? payload.id ?? randomUUID()`. A top-level `aggregateType`
or `aggregateId` is ignored.

`ActionQueue` and `AprExpiryPanel` each posted to it inline, both sending
`eventType` with a top-level `aggregateId`. The server answered **400** to every
one. Neither checked the response — both had a bare `await fetch(...)` inside a
`catch {}` commented "silently fail — non-critical". So no `task.completed` and
no `apr_expiry.acknowledged` event was ever written, and nothing anywhere said
so.

`publishEvent` in `DashboardEventBus.ts` sends the correct shape. It had **zero
callers** — exported from `components/dashboard/index.ts` and imported by
nothing.

Both call sites now go through it, with `aggregateId` moved inside the payload.
`publishEvent` throws on refusal rather than resolving: the callers still
swallow it, because the events are genuinely non-critical, but that is now a
decision taken in the open rather than a rejection nobody could see. Resolving
regardless is what hid this.

**This is the third spelling-mismatch defect in this codebase** — after the
`issuerId` slug and the four auth-header idioms — and it has the same shape:
two places describe the same thing differently, nothing checks, and the failure
is silent. `docs/backlog/issuer-as-foreign-key.md` makes the argument for the
first one; it applies here.

### Logged, not fixed

- **`NavBadgeProvider`** turns an unreadable count into `0`. A badge showing no
  number reads as "nothing waiting" rather than "not known". Needs an unknown
  state the badge can render.
- **`UpcomingPayments`** writes a failed send to the console and shows nothing.
  The button stops, so a send that never happened is indistinguishable from one
  not attempted. Needs an error state the component does not have.

## Batch 6 — client tabs, wizard shell, client detail (done)

Seven files. Four carried a false success, and one carried a guard that
defeated the refresh it stood in front of.

### A third inline caller of the event bus, and the worst of them

`components/clients/TimelineTab.tsx` posts an advisor note to
`/api/v1/events`. Unlike the batch 5 pair it uses the **correct** wire format —
`event_type`, snake_case — but `client.advisor_note_added` is not in the
server's `SUPPORTED_EVENT_TYPES`, so it is refused with 400 all the same.

It then dispatched a `cf:toast` reading **"Note added to timeline"**,
unconditionally, after an unchecked `await fetch`. This event POST is the only
persistence the note has, so the advisor was told a note was saved that was
never written anywhere.

Now routed through `publishEvent`, which throws, with the toast moved into the
success path and a failure toast added.

**Open decision, not taken here:** whether `client.advisor_note_added` should
be added to the server's supported set. The type is refused today, so the
feature does not work either way — but adding it writes advisor notes into
`LedgerEvent` with an aggregate id derived from `randomUUID()`, since the
payload carries `client_id` rather than `aggregateId` or `id`. That is a
product decision about what the ledger holds, and it needs an owner.

### Other false successes fixed on the lines being converted

- **`AcknowledgmentsTab.handleRequestSignature`** — "Signature request sent for
  X." after an unchecked fetch, with an empty catch.
- **`AcknowledgmentsTab.handleRequestAllPending`** — reported the size of the
  list it set out to send, not the number accepted, so a run where every
  request was refused still claimed them all sent. Now counted, and one
  failure no longer abandons the rest.
- **`ApplicationWizardShell`** — the error path re-read the body by hand;
  `loadJson` carries the server's wording through instead.

### A pre-flight guard that defeated the refresh

`CreditTab.handlePullReport` already called `apiClient.post`, which refreshes
and retries. In front of it sat a check for an access token in `localStorage`
that bailed out with *"Authentication required. Please sign in again."*

That refused the pull in exactly the case the refresh exists to handle: a
fifteen-minute access token that has aged out while the seven-day refresh token
is still good. The one action it told the user to take was the one thing they
did not need to do. Guard removed.

**Worth searching for elsewhere.** A token read is not always a request — it
can be a gate in front of one, and a gate is invisible to a sweep looking for
calls. The remaining batches should treat `if (!token)` as its own finding.

## Batch 7 — funding rounds (done)

Seven files. Both patterns flagged at the end of batch 6 turned up immediately,
and a fifth spelling appeared.

### The predicted `if (!token)` gate, found on the first look

`RoundStrategyNotes.handleSave` guarded `apiClient.patch` with a check for an
access token, bailing out with "Authentication required". Identical to
`CreditTab`. Two for two on the prediction — this shape is worth its own pass.

### A fourth inline event-bus caller

`RoundActivityTimeline` posts `round.advisor_note_added`, correct snake_case
format, event type not in `SUPPORTED_EVENT_TYPES` — refused with 400, then a
`cf:toast` reading "Note added to timeline". The same defect as `TimelineTab`,
in the same words, for the round-level note instead of the client-level one.

Both now go through `publishEvent`. The open decision about whether these two
event types should be supported server-side covers both.

### A fifth spelling: a hand-built header passed *into* a helper

`SaveFundingPlanButton` and `RoundCompletionWorkflow` read the token and passed
`headers: { Authorization: ... }` into `apiClient`, which attaches its own.

Harmless, as it happens — `apiClient` sets `Authorization` **after** spreading
caller headers, so the refreshed token wins. `fetch-all-pages` spread them the
other way round, which is why the same mistake there silently cancelled the
refresh (found in batch 2).

**The helpers now agree.** `fetch-all-pages` builds `{ ...extraHeaders,
...authHeader() }`, matching `apiClient`. Relying on every caller to not pass a
stale header is the weaker guarantee; the ordering is now the strong one.

### False successes fixed

- **`RoundActionButtons.handleConfirmClose`** — a bare `fetch` whose response
  was never read, then `toast.success("has been closed")` and `onStatusChange`
  moving the round in the list. A refused PATCH left the round open and
  everything on screen saying otherwise.
- **`app/funding-rounds/new`** — the starkest in the sweep. Unchecked POST,
  `router.push('/funding-rounds')` on success, and **`router.push('/funding-
  rounds')` in the catch**. Both paths identical, so a round that was never
  created looked exactly like one that was: the user landed on a register that
  simply did not contain it. Now stays on the form and says why.

## Batch 8 — platform pages (done)

Seven files: `platform/{crm,data-lineage,referrals,reports,voiceforge,workflows}`
and `app/workflows`. Five were plain conversions. Two were not.

### A write that stored nothing and looked like it had

`app/platform/referrals` carried the comment **"Try to persist via API, but
always add locally"**, and did exactly that: a refused POST still pushed the new
referral into the list, the modal closed, and the form reset. It appeared saved.
The next reload lost it.

A referral that exists only on one screen is worse than one never entered,
because nobody knows to enter it again. It now reports the failure and keeps the
modal open with the values still in it.

This is the same shape as the compliance placeholder fallback escalated earlier
— local state standing in for a server that refused — and the same rule settles
it: an absence must not be dressed as a success.

### An optimistic toggle that told the truth

`app/platform/workflows` fires "Workflow activated" **before** the request and
reverts on failure with a second toast. Left as it is: the revert is real and
the correction is visible, which is a legitimate optimistic pattern rather than
a false success. Converted only for the refresh.

### Note on `data-lineage`

Its failure message — *"Nothing is reconstructed in its place"* — is worth
keeping as written. It is one of the few places in this codebase that says out
loud what it is refusing to do.

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

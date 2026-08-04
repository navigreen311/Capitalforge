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

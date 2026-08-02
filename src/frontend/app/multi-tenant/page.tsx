'use client';

// ============================================================
// /multi-tenant — tenant administration, from the tenant table
//
// This page held five tenants as literals and displayed everything about
// them: Apex Capital Group on Enterprise at $14,400 a month with 48 advisors
// and 412 clients, Clearview Strategies suspended with invoices INV-5019 and
// INV-5006 both overdue, a platform MRR card totalling the array, per-tenant
// activity logs, trial countdowns and next-billing dates. None of it existed.
// The only occurrence of the word fetch in the file was a comment saying what
// to replace the feature-toggle handler with in production.
//
// GET /api/admin/tenants has been there the whole time, along with PUT /:id,
// PUT /:id/flags and GET /:id/usage. They return a tenant, its plan, its
// module entitlements and its metered usage. That is what this page shows.
//
// What is gone, and why none of it came back as a placeholder:
//
//   Invoices, billing status and next billing date. Invoice rows are keyed to
//   a business, not a tenant — they are what a tenant bills its clients, not
//   what the platform bills the tenant. There is no subscription-invoice
//   table, so INV-1041 "Paid" and INV-5019 "Overdue" were not summarising
//   anything.
//
//   Advisor and client counts. Countable — users and businesses both carry a
//   tenantId — but the endpoint does not return them, and counting them from
//   the browser would mean reading other tenants' records to do it.
//
//   The activity log. audit_logs is real and tenant-scoped, but nothing
//   serves it per tenant to an administrator.
//
//   Impersonation. POST /api/platform/tenants/:id/impersonate returns a
//   string of the form imp_<id>_<timestamp> and does nothing else: no
//   session, no audit record. The dialog told the operator "Impersonation is
//   logged and audited. All actions taken while impersonating will be
//   attributed to your admin account", which described a control that does
//   not exist. A claimed audit trail is worse than none.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { apiClient } from '@/lib/api-client';
import {
  toTenantAdminRows,
  toUsageRows,
  totalMonthlyPrice,
  type TenantAdminRow,
} from '@/lib/tenant-admin-view';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** usage_meters stores snake_case metric names, which read badly unspaced. */
function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function planLabel(plan: string): string {
  if (plan === '') return 'No plan recorded';
  return humanise(plan);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MultiTenantPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: raw,
    isLoading,
    error,
    refetch,
  } = useAuthFetch<unknown>('/api/admin/tenants?pageSize=100');

  const tenants = useMemo(() => toTenantAdminRows(raw), [raw]);

  const selected: TenantAdminRow | null =
    tenants.find((t) => t.id === selectedId) ?? tenants[0] ?? null;

  // Idle until a tenant is on screen: useAuthFetch skips a path containing
  // "undefined".
  const { data: usageRaw } = useAuthFetch<unknown>(`/api/admin/tenants/${selected?.id}/usage`);
  const usage = useMemo(
    () => toUsageRows(usageRaw, selected?.usageLimits ?? null),
    [usageRaw, selected],
  );

  const mrr = useMemo(() => totalMonthlyPrice(tenants), [tenants]);
  const activeCount = tenants.filter((t) => t.isActive).length;
  const figuresKnown = !isLoading && error === null;

  const setActive = useCallback(
    async (tenant: TenantAdminRow, isActive: boolean) => {
      setBusy(true);
      setActionError(null);
      try {
        await apiClient.put(`/admin/tenants/${tenant.id}`, { isActive });
        await refetch();
      } catch (err) {
        setActionError(
          `Could not ${isActive ? 'reactivate' : 'suspend'} ${tenant.name}: ${
            err instanceof Error ? err.message : 'the request failed'
          }`,
        );
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const toggleFeature = useCallback(
    async (tenant: TenantAdminRow, key: string, value: boolean) => {
      setBusy(true);
      setActionError(null);
      try {
        // Writes to the tenant's module entitlements. The old handler set
        // React state and carried a comment saying to replace it with a
        // request one day, so a toggle looked saved and changed nothing.
        await apiClient.put(`/admin/tenants/${tenant.id}/flags`, {
          flags: { ...tenant.features, [key]: value },
        });
        await refetch();
      } catch (err) {
        setActionError(
          `Could not change ${humanise(key)}: ${
            err instanceof Error ? err.message : 'the request failed'
          }`,
        );
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Multi-Tenant Admin</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Tenants, their plans, entitlements and metered usage.
        </p>
      </div>

      {actionError !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4">
          <p className="text-sm font-semibold text-red-300">{actionError}</p>
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Tenants',
            value: figuresKnown ? String(tenants.length) : '—',
            sub: figuresKnown ? `${activeCount} active` : 'Not read',
          },
          {
            label: 'Platform MRR',
            // Null when no tenant has a plan on file. A total of $0 would say
            // every tenant is on a free plan, which is a different claim.
            value: figuresKnown && mrr !== null ? money(mrr) : '—',
            sub:
              !figuresKnown
                ? 'Not read'
                : mrr === null
                  ? 'No plan record carries a price'
                  : `From ${tenants.filter((t) => t.monthlyPrice !== null).length} of ${tenants.length}`,
          },
          {
            label: 'Suspended',
            value: figuresKnown ? String(tenants.length - activeCount) : '—',
            sub: 'Recorded as not active',
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
              {c.label}
            </p>
            <p className="text-2xl font-bold text-white tabular-nums">{c.value}</p>
            <p className="text-xs text-gray-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading tenants…</p>}

      {!isLoading && error !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-300">
            The tenant list could not be read.
          </p>
          <p className="text-xs text-red-200">
            No tenants are shown. This page administers real tenants, so it shows none
            rather than a sample.
          </p>
        </div>
      )}

      {!isLoading && error === null && tenants.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-sm text-gray-300">No tenants are visible to you.</p>
          <p className="text-xs text-gray-500 mt-1">
            A tenant administrator sees their own tenant. Listing every tenant on the
            platform is a super-admin capability.
          </p>
        </div>
      )}

      {!isLoading && error === null && tenants.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── Tenant list ──────────────────────────────────── */}
          <div className="xl:col-span-1 space-y-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Tenants
            </h2>
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => setSelectedId(tenant.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  selected?.id === tenant.id
                    ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-100 truncate">{tenant.name}</p>
                    <p className="text-xs text-gray-500 truncate">/{tenant.slug}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      tenant.isActive
                        ? 'bg-green-900 text-green-300 border-green-700'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                  >
                    {tenant.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>{planLabel(tenant.plan)}</span>
                  <span className="tabular-nums">
                    {tenant.monthlyPrice === null ? '—' : `${money(tenant.monthlyPrice)}/mo`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* ── Detail ────────────────────────────────────────── */}
          {selected !== null && (
            <div className="xl:col-span-2 space-y-6">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-200">{selected.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      /{selected.slug} · created {formatDate(selected.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setActive(selected, !selected.isActive)}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {selected.isActive ? 'Suspend tenant' : 'Reactivate tenant'}
                  </button>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { k: 'Plan', v: planLabel(selected.plan) },
                    {
                      k: 'Monthly price',
                      v: selected.monthlyPrice === null ? '—' : money(selected.monthlyPrice),
                    },
                    { k: 'Billing cycle', v: selected.billingCycle ?? '—' },
                    { k: 'Plan status', v: selected.planStatus ?? '—' },
                  ].map((f) => (
                    <div key={f.k}>
                      <dt className="text-[10px] text-gray-500 uppercase tracking-wide">{f.k}</dt>
                      <dd className="text-sm text-gray-200 mt-0.5">{f.v}</dd>
                    </div>
                  ))}
                </dl>

                {selected.monthlyPrice === null && (
                  <p className="text-xs text-gray-500">
                    No plan record is on file for this tenant, so there is no price,
                    cycle or status to show. A dash here is an absent record, not a free
                    plan.
                  </p>
                )}
              </div>

              {/* ── Entitlements ───────────────────────────────── */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-200">Module entitlements</h3>
                {Object.keys(selected.features).length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No entitlements are recorded for this tenant. Nothing is shown as on
                    or off, because neither is known.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(selected.features)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, on]) => (
                        <label
                          key={key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
                        >
                          <span className="text-xs text-gray-300">{humanise(key)}</span>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy}
                            onChange={(e) => void toggleFeature(selected, key, e.target.checked)}
                            aria-label={humanise(key)}
                            className="h-4 w-4"
                          />
                        </label>
                      ))}
                  </div>
                )}
              </div>

              {/* ── Usage ──────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-200">Metered usage</h3>
                {usage.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Nothing has been metered for this tenant in the current period. This
                    is empty rather than zeroed: a meter that has not run is not a meter
                    reading zero.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {usage.map((u) => (
                      <div key={u.metric} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-300">{humanise(u.metric)}</span>
                          <span className="text-gray-400 tabular-nums">
                            {u.used.toLocaleString()}
                            {u.limit === null ? '' : ` of ${u.limit.toLocaleString()}`}
                          </span>
                        </div>
                        {u.limit === null ? (
                          // No denominator, so no bar: a full one would read as a
                          // limit reached and an empty one as headroom.
                          <p className="text-[10px] text-gray-600">
                            The plan sets no limit for this metric.
                          </p>
                        ) : (
                          <div className="h-1.5 w-full rounded-full bg-gray-700">
                            <div
                              className="h-1.5 rounded-full bg-blue-500"
                              style={{
                                width: `${Math.min(100, Math.max(0, (u.used / u.limit) * 100))}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── What this page no longer claims ─────────────── */}
              <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-2">
                <h3 className="text-sm font-semibold text-gray-300">Not shown here</h3>
                <ul className="text-xs text-gray-500 space-y-1.5 list-disc pl-4">
                  <li>
                    <strong className="text-gray-400">
                      Subscription invoices and billing status.
                    </strong>{' '}
                    Invoices are keyed to a business, not a tenant — they are what a
                    tenant bills its clients. Nothing records what the platform bills the
                    tenant, so the invoice rows and the paid and overdue badges are gone
                    rather than recreated.
                  </li>
                  <li>
                    <strong className="text-gray-400">Advisor and client counts.</strong>{' '}
                    Both are countable, but this endpoint does not return them, and
                    counting them from the browser would mean reading records outside
                    this tenant.
                  </li>
                  <li>
                    <strong className="text-gray-400">Activity log.</strong> Audit records
                    exist and are tenant-scoped, but nothing serves them per tenant to an
                    administrator yet.
                  </li>
                  <li>
                    <strong className="text-gray-400">Impersonation.</strong> The endpoint
                    behind it returns a token string, starts no session and writes no
                    audit record, while the dialog stated that impersonation is logged and
                    audited. A control described but not implemented is worse than an
                    absent one.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

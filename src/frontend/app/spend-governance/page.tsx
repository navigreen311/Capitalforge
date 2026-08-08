'use client';

// ============================================================
// /spend-governance — card transactions and their risk
//
// This page held its own transactions and risk summary and called nothing,
// while two endpoints returned the real ones per client:
//
//   GET /api/businesses/:id/transactions
//   GET /api/businesses/:id/transactions/risk-summary
//
// A flagged transaction is an accusation about how a client spent money.
// None is shown here that the record does not carry.
//
// The row shape below is the one the API actually returns. It previously
// asked for `description`, `category` and `riskFlag` — three names that
// exist on no transaction record (two of them belong to `Complaint`, the
// third to nothing at all), so three of six columns rendered "—" over data
// sitting in the response. The flagged transaction the summary counted was
// among them: the table said "—" in the Flag column of the very row that
// produced `flaggedCount: 1`.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';

interface ClientOption {
  id: string;
  businessName: string;
}

/** Mirrors `SpendTransaction` as serialized by GET /transactions. */
interface TransactionRow {
  id: string;
  merchantName?: string | null;
  amount?: number | string | null;
  transactionDate?: string | null;
  mcc?: string | null;
  mccCategory?: string | null;
  riskScore?: number | null;
  isCashLike?: boolean | null;
  businessPurpose?: string | null;
  flagged?: boolean | null;
  flagReason?: string | null;
}

/** Mirrors `RiskSummary` from spend-governance.service.ts. */
interface RiskSummary {
  totalTransactions: number;
  totalAmount: number;
  flaggedCount: number;
  cashLikeCount: number;
  cashLikeAmount: number;
  highRiskCount: number;
  suspiciousRailCount: number;
  averageRiskScore: number | null;
  maxRiskScore: number | null;
  scoredCount: number;
  flaggedTransactions: TransactionRow[];
  highRiskTransactions: TransactionRow[];
  cashLikeTransactions: TransactionRow[];
  suspiciousRailTransactions: TransactionRow[];
  sampleLimit: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  /**
   * Optional because the running API may not have it.
   *
   * This shape describes a response parsed from JSON at runtime, not a value
   * the compiler has checked. Declaring the field required told TypeScript it
   * was always there, so `riskLevelBasis.length` type-checked and threw
   * against a backend a single commit behind — taking the whole route down
   * with it. A field a server might not send is optional here, whatever the
   * server is meant to send.
   */
  riskLevelBasis?: string[];
}

function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    : '—';
}

/**
 * Render a count against the denominator it came from, always.
 *
 * "50%" from two transactions and "50%" from two hundred are different
 * claims, and the bare ratio this page used to print made them identical.
 * The percentage is a convenience; the fraction is the fact, so the
 * fraction leads and the percentage is suppressed entirely below a
 * denominator where it would be more precise than the evidence.
 */
function share(count: number, total: number): string {
  if (total === 0) return '0';
  if (total < 10) return `${count} of ${total}`;
  return `${count} of ${total} (${Math.round((count / total) * 100)}%)`;
}

const RISK_LEVEL_STYLES: Record<RiskSummary['riskLevel'], string> = {
  low: 'border-green-200 bg-green-50 text-green-800',
  moderate: 'border-amber-200 bg-amber-50 text-amber-800',
  high: 'border-orange-200 bg-orange-50 text-orange-900',
  critical: 'border-red-200 bg-red-50 text-red-800',
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      {hint !== undefined && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function RiskSummaryPanel({ summary }: { summary: RiskSummary }) {
  const {
    totalTransactions,
    totalAmount,
    flaggedCount,
    cashLikeCount,
    cashLikeAmount,
    highRiskCount,
    suspiciousRailCount,
    averageRiskScore,
    maxRiskScore,
    scoredCount,
    riskLevel,
    riskLevelBasis,
  } = summary;

  // null means the field was absent or not an array — a different thing from
  // an empty one, and the distinction is rendered below rather than flattened.
  const basis = Array.isArray(riskLevelBasis) ? riskLevelBasis : null;

  return (
    <section className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 ${RISK_LEVEL_STYLES[riskLevel]}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide">Risk level</span>
          <span className="text-xl font-bold capitalize">{riskLevel}</span>
          <span className="text-xs opacity-80">
            from {totalTransactions} transaction{totalTransactions === 1 ? '' : 's'}
          </span>
        </div>

        {/* The level is a verdict. Without the terms that produced it, an
            advisor cannot tell a network-rule violation from an arithmetic
            artifact — which is what "critical" was here.

            Three outcomes, not two. `riskLevelBasis.length` on a response
            that predates the field threw, and React unmounted the whole
            route into an "Application Error" screen — so a backend one
            commit behind the page read as the page being broken, and the
            old values it was still returning read as the change never
            having landed.

            The obvious repair is `riskLevelBasis ?? []`, and it is the
            wrong one: it renders a stale API identically to a healthy one
            with nothing to report. That is the same collapse the field
            was added to undo. An absent basis says so. */}
        {basis === null ? (
          <p className="mt-2 text-sm opacity-90">
            This response carries no <span className="font-mono">riskLevelBasis</span>, so the
            level above is shown without the terms that produced it. The API is older than this
            page.
          </p>
        ) : (
          basis.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {basis.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true">·</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Transactions"
          value={String(totalTransactions)}
          hint={money(totalAmount)}
        />
        <Stat
          label="Flagged"
          value={share(flaggedCount, totalTransactions)}
          hint={flaggedCount > 0 ? 'Listed in the table below' : 'None'}
        />
        <Stat
          label="Cash-like"
          value={share(cashLikeCount, totalTransactions)}
          hint={cashLikeCount > 0 ? money(cashLikeAmount) : 'None'}
        />
        <Stat
          label="Risk score"
          value={
            /* Nothing scored is not a score of zero. The mean used to
               coerce unscored rows to 0, so an unscored book reported
               the lowest risk the scale can express. */
            averageRiskScore === null
              ? 'Not scored'
              : `${averageRiskScore} avg · ${maxRiskScore} max`
          }
          hint={
            averageRiskScore === null
              ? `No score on any of ${totalTransactions}`
              : share(scoredCount, totalTransactions) + ' scored'
          }
        />
      </div>

      {(highRiskCount > 0 || suspiciousRailCount > 0) && (
        <p className="text-xs text-gray-500">
          {highRiskCount > 0 && <>High-risk: {highRiskCount}. </>}
          {suspiciousRailCount > 0 && <>Suspicious payment rail: {suspiciousRailCount}.</>}
        </p>
      )}
    </section>
  );
}

export default function SpendGovernancePage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = (await loadJson<ClientOption[] | null>('/api/clients?limit=200')) ?? [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
        else setLoading(false);
      } catch (e) {
        setError(`Could not load the client list. ${toLoadError(e).message}`);
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      // A failed risk read is reported, not rendered as "no risk" — so it
      // resolves to a wrapper rather than null, because null is also what a
      // summary the server has nothing to say about looks like.
      const [tx, risk] = await Promise.all([
        loadJson<TransactionRow[] | null>(
          `/api/businesses/${encodeURIComponent(businessId)}/transactions`,
        ),
        loadJson<RiskSummary | null>(
          `/api/businesses/${encodeURIComponent(businessId)}/transactions/risk-summary`,
        )
          .then((value) => ({ loaded: true as const, value }))
          .catch(() => ({ loaded: false as const, value: null })),
      ]);

      setRows(Array.isArray(tx) ? tx : []);
      setSummary(risk.value);
      if (!risk.loaded) {
        setError('Transactions loaded, but the risk summary could not be read.');
      }
    } catch (e) {
      setError(`Transactions could not be loaded. ${toLoadError(e).message}`);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  const transactions = rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spend Governance</h1>
          <p className="text-sm text-gray-500 mt-1">Card transactions on record, per client.</p>
        </div>

        {clients.length > 0 && (
          <div>
            <label htmlFor="sg-client" className="block text-xs text-gray-500 mb-1">
              Client
            </label>
            <select
              id="sg-client"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && rows !== null && (
        <>
          {summary !== null && <RiskSummaryPanel summary={summary} />}

          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No transaction is on record for this client. Transactions arrive through the
              import endpoint; nothing is fetched from an issuer, and no spending is inferred.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Merchant</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Business purpose</th>
                    <th className="px-4 py-3 text-left">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t) => (
                    <tr key={t.id} className={t.flagged === true ? 'bg-red-50/60' : undefined}>
                      <td className="px-4 py-3 text-gray-600">
                        {t.transactionDate?.slice(0, 10) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{t.merchantName ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{money(t.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.mccCategory ?? '—'}
                        {t.mcc != null && (
                          <span className="ml-1 text-xs text-gray-400">MCC {t.mcc}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.businessPurpose ?? (
                          <span className="text-gray-400">Not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {t.flagged === true ? (
                          <div className="space-y-1">
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                              Flagged
                            </span>
                            {/* A flag with no reason beside it is an
                                accusation the advisor cannot answer. */}
                            <p className="text-xs text-gray-600">
                              {t.flagReason ?? 'No reason recorded.'}
                            </p>
                            {t.isCashLike === true && (
                              <p className="text-xs font-medium text-red-700">Cash-like</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

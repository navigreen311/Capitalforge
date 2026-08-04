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
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';

interface ClientOption {
  id: string;
  businessName: string;
}

interface TransactionRow {
  id: string;
  description?: string | null;
  amount?: number | string | null;
  transactionDate?: string | null;
  category?: string | null;
  businessPurpose?: string | null;
  riskFlag?: string | null;
}

function money(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    : '—';
}

export default function SpendGovernancePage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
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
        loadJson<Record<string, unknown> | null>(
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
          {summary !== null && (
            <p className="text-xs text-gray-500">
              Risk summary: {JSON.stringify(summary)}
            </p>
          )}

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
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Business purpose</th>
                    <th className="px-4 py-3 text-left">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-gray-600">
                        {t.transactionDate?.slice(0, 10) ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{t.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{money(t.amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{t.category ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.businessPurpose ?? (
                          <span className="text-gray-400">Not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{t.riskFlag ?? '—'}</td>
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

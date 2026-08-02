'use client';

// ============================================================
// /compliance/contracts — analysed contracts
//
// This page held its own contract analyses and called nothing, while GET
// /api/contracts/analyses returned what had actually been analysed — which
// is currently nothing, and saying so is the point.
//
// A contract analysis is a claim about terms somebody is bound by. Inventing
// one is worse than showing an empty list.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface AnalysisRow {
  id: string;
  title?: string | null;
  contractType?: string | null;
  riskLevel?: string | null;
  createdAt?: string | null;
}

export default function ContractsPage() {
  const [rows, setRows] = useState<AnalysisRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/contracts/analyses', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: AnalysisRow[] };
      if (!res.ok || body.success !== true) {
        setError(`Contract analyses could not be loaded (HTTP ${res.status}).`);
        setRows(null);
        return;
      }
      setRows(Array.isArray(body.data) ? body.data : []);
    } catch {
      setError('Could not reach the server.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">Contracts that have been analysed.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No contract has been analysed. Analyses are created by submitting a contract to the
            analysis endpoint; nothing is inferred from a contract that was never read.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Contract</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Risk</th>
                  <th className="px-4 py-3 text-left">Analysed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-gray-900">{r.title ?? r.id}</td>
                    <td className="px-4 py-3 text-gray-600">{r.contractType ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.riskLevel ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {r.createdAt === null || r.createdAt === undefined
                        ? '—'
                        : r.createdAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

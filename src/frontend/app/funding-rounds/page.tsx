'use client';

// ============================================================
// /funding-rounds — the rounds on record
//
// This page held PLACEHOLDER_ROUNDS and called nothing, while GET
// /api/funding-rounds returned the real ones: round number, target credit,
// target card count, status and dates, per client.
//
// A target of 0 is a round aiming at nothing. A round with no target shows
// nothing.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';
import { toRoundRows, formatMoney, humanise, type RoundRow } from '@/lib/client-roster-view';

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function FundingRoundsPage() {
  const [rows, setRows] = useState<RoundRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roundsRes, clientsRes] = await Promise.all([
        fetch('/api/funding-rounds', { headers: authHeaders() }),
        fetch('/api/clients?limit=200', { headers: authHeaders() }),
      ]);

      const body = (await roundsRes.json()) as { success?: boolean; data?: unknown };
      if (!roundsRes.ok || body.success !== true) {
        setError(`Funding rounds could not be loaded (HTTP ${roundsRes.status}).`);
        setRows(null);
        return;
      }
      setRows(toRoundRows(body.data));

      if (clientsRes.ok) {
        const cb = (await clientsRes.json()) as {
          data?: { id: string; businessName: string }[];
        };
        setNames(Object.fromEntries((cb.data ?? []).map((c) => [c.id, c.businessName])));
      }
    } catch {
      setError('Could not reach the server, so no rounds are shown.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rounds = rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Funding Rounds</h1>
        <p className="text-sm text-gray-500 mt-1">Rounds on record, per client.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        rounds.length === 0 ? (
          <p className="text-sm text-gray-500">No funding round is on record.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-right">Round</th>
                  <th className="px-4 py-3 text-right">Target credit</th>
                  <th className="px-4 py-3 text-right">Target cards</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rounds.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-gray-900">
                      {names[r.businessId] ?? (
                        <span className="text-gray-400">Client not resolved</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.roundNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatMoney(r.targetCredit)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {r.targetCardCount ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{humanise(r.status)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(r.startedAt)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(r.completedAt)}</td>
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

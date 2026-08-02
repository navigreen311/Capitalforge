'use client';

// ============================================================
// /compliance/deal-committee — deal reviews
//
// Both this page and /deal-committee held their own literals: pending
// reviews, conditional approvals, sign-off records and committee votes,
// with named members attached to deals nobody had submitted.
//
// A recorded vote is who approved lending money to a client.
//
//   GET /api/deal-reviews — the reviews on record
//
// One implementation, read from that endpoint. Reviewers and an SLA clock
// are not columns on the review, so neither is shown.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface ReviewRow {
  id: string;
  businessId?: string | null;
  status?: string | null;
  decision?: string | null;
  createdAt?: string | null;
}

export default function DealCommitteePage() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewsRes, clientsRes] = await Promise.all([
        fetch('/api/deal-reviews', { headers: authHeaders() }),
        fetch('/api/clients?limit=200', { headers: authHeaders() }),
      ]);

      const body = (await reviewsRes.json()) as { success?: boolean; data?: ReviewRow[] };
      if (!reviewsRes.ok || body.success !== true) {
        setError(`Deal reviews could not be loaded (HTTP ${reviewsRes.status}).`);
        setRows(null);
        return;
      }
      setRows(Array.isArray(body.data) ? body.data : []);

      if (clientsRes.ok) {
        const cb = (await clientsRes.json()) as { data?: { id: string; businessName: string }[] };
        setNames(Object.fromEntries((cb.data ?? []).map((c) => [c.id, c.businessName])));
      }
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

  const reviews = rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Deal Committee</h1>
        <p className="text-sm text-gray-500 mt-1">Reviews on record.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        <>
          {reviews.length === 0 ? (
            <p className="text-sm text-gray-500">
              No deal review is on record. Reviews are opened through the deal-review endpoint.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Decision</th>
                    <th className="px-4 py-3 text-left">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviews.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-gray-900">
                        {r.businessId === null || r.businessId === undefined
                          ? '—'
                          : names[r.businessId] ?? (
                              <span className="text-gray-400">Client not resolved</span>
                            )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.status ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{r.decision ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.createdAt?.slice(0, 10) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section
            aria-label="What is not here"
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-gray-900">What is not here</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Committee members, their votes and an SLA countdown. The page listed all three —
              named reviewers assigned to deals, hours remaining against a target — and the
              review record holds none of it. A recorded vote is who approved lending money to a
              client, and it has to come from a vote that was cast.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

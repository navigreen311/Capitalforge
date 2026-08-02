'use client';

// ============================================================
// /portfolio — portfolio analytics
//
// This page reported approval rates by issuer, by industry and by FICO
// band, quarter by quarter, from four constants: QUARTER_FACTORS,
// ISSUER_APPROVAL, INDUSTRY_APPROVAL and FICO_APPROVAL. Selecting a quarter
// multiplied the same numbers by a per-quarter factor, so the whole
// analysis moved together and none of it came from an application.
//
// Approval rates by issuer are the numbers an advisor uses to decide where
// to send a client. There is no analytics endpoint behind this page, so it
// reports what can be counted from the applications on record and nothing
// beyond that.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { toApplicationRows, humanise, type ApplicationRow } from '@/lib/client-roster-view';

interface IssuerStat {
  issuer: string;
  decided: number;
  approved: number;
}

export default function PortfolioPage() {
  const [apps, setApps] = useState<ApplicationRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows, truncated: cut } = await fetchAllPages('/api/applications', (json) => {
        const body = json as { success?: boolean; data?: unknown };
        return body.success === true ? toApplicationRows(body.data) : [];
      });
      setApps(rows);
      setTruncated(cut);
    } catch {
      setError('Could not reach the server, so no figures are shown.');
      setApps(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = apps ?? [];
  // Only decided applications can produce an approval rate. Counting drafts
  // and submissions in the denominator understates it; leaving them out of
  // both is the only honest reading.
  const decided = rows.filter((a) => a.status === 'approved' || a.status === 'declined');

  const byIssuer = new Map<string, IssuerStat>();
  for (const a of decided) {
    const stat = byIssuer.get(a.issuer) ?? { issuer: a.issuer, decided: 0, approved: 0 };
    stat.decided += 1;
    if (a.status === 'approved') stat.approved += 1;
    byIssuer.set(a.issuer, stat);
  }
  const issuers = [...byIssuer.values()].sort((a, b) => b.decided - a.decided);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">
          What can be counted from the applications on record.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && apps !== null && (
        <>
          {truncated && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Not every application was read, so these counts are partial.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Applications', value: rows.length },
              { label: 'Decided', value: decided.length },
              { label: 'Approved', value: decided.filter((a) => a.status === 'approved').length },
              { label: 'Issuers', value: issuers.length },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          {decided.length === 0 ? (
            <p className="text-sm text-gray-500">
              No application has been decided, so there is no approval rate to report.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Issuer</th>
                    <th className="px-4 py-3 text-right">Decided</th>
                    <th className="px-4 py-3 text-right">Approved</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {issuers.map((s) => (
                    <tr key={s.issuer}>
                      <td className="px-4 py-3 text-gray-900">{humanise(s.issuer)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{s.decided}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{s.approved}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {/* A rate over one or two decisions is not a rate.
                            It is shown with its denominator so nobody reads
                            100% off a single approval. */}
                        {Math.round((s.approved / s.decided) * 100)}%{' '}
                        <span className="text-xs text-gray-400">of {s.decided}</span>
                      </td>
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
              Approval rates by industry and by FICO band, and quarter-on-quarter movement. The
              page reported all three from constants — one set of numbers multiplied by a factor
              per quarter, so the whole analysis moved together. Industry is on the client
              record, but there are too few decided applications here for a rate by industry to
              mean anything, and a credit score is not recorded against an application at all.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

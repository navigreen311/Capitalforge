'use client';

// ============================================================
// /platform/reports — reports
//
// generateReport() built an entire report from constants, per type, with a
// period label and a download: "247 Total Clients (+12)", "68.5% Approval
// Rate (+2.1%)", "$2,450,000 Total Funding Deployed", "$142,500 Revenue",
// pipeline stages by value, average days to fund. The period selector
// changed the label above the same numbers, and the changes — +12, +2.1% —
// were against a prior period nobody had computed.
//
// A downloadable report of invented figures is a document somebody takes to
// a partner or an investor.
//
// What can be counted is counted, from the roster and the applications. The
// rest is named as unavailable rather than filled in, and there is no export
// until there is something true to export.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { loadJson, toLoadError } from '@/lib/load-json';
import { toApplicationRows, toClientRows, type ApplicationRow, type ClientRow } from '@/lib/client-roster-view';

export default function PlatformReportsPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [apps, setApps] = useState<ApplicationRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClients(toClientRows(await loadJson<unknown>('/api/clients?limit=500')));

      const { rows, truncated: cut } = await fetchAllPages('/api/applications', (json) => {
        const body = json as { success?: boolean; data?: unknown };
        return body.success === true ? toApplicationRows(body.data) : [];
      });
      setApps(rows);
      setTruncated(cut);
      setGeneratedAt(new Date().toISOString());
    } catch (e) {
      setError(`No figures are shown. ${toLoadError(e).message}`);
      setClients(null);
      setApps(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clientRows = clients ?? [];
  const appRows = apps ?? [];
  const decided = appRows.filter((a) => a.status === 'approved' || a.status === 'declined');
  const approved = decided.filter((a) => a.status === 'approved');

  // Only from approved applications that carry a limit. Applications with
  // no limit recorded are excluded from both sides rather than counted as
  // zero, and the count is shown so the figure can be read for what it is.
  const withLimit = approved.filter((a) => a.creditLimit !== null);
  const approvedCredit = withLimit.reduce((sum, a) => sum + (a.creditLimit ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Counted from the records, at{' '}
          {generatedAt === null ? '—' : generatedAt.slice(0, 19).replace('T', ' ')}.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && clients !== null && apps !== null && (
        <>
          {truncated && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Not every application was read, so these counts are partial.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: 'Clients', value: String(clientRows.length) },
              { label: 'Applications', value: String(appRows.length) },
              { label: 'Decided', value: String(decided.length) },
              { label: 'Approved', value: String(approved.length) },
              {
                label: 'Approval rate',
                value:
                  decided.length === 0
                    ? '—'
                    : `${Math.round((approved.length / decided.length) * 100)}% of ${decided.length}`,
              },
              {
                label: 'Approved credit',
                value:
                  withLimit.length === 0
                    ? '—'
                    : `${new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      }).format(approvedCredit)} over ${withLimit.length}`,
              },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          <section
            aria-label="What cannot be reported"
            className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-amber-900">What cannot be reported</h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              Revenue, funding deployed, average days to fund, pipeline value, period-on-period
              change. The page reported all of them — &ldquo;$142,500 Revenue&rdquo;,
              &ldquo;$2,450,000 Total Funding Deployed&rdquo;, &ldquo;68.5% Approval Rate
              (+2.1%)&rdquo; — from constants, with the period selector changing only the label
              above them. None is derivable from what the system records: funding deployed is
              not tracked separately from approved credit, no prior period is computed, and
              revenue needs the subscription and fee data that does not exist.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              There is no export. A downloadable report is a document somebody takes to a
              partner, and until the figures above are the whole of what this system knows,
              there is nothing to package.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

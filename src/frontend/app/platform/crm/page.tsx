'use client';

// ============================================================
// /platform/crm — pipeline
//
// The pipeline itself is real and read from /api/crm/pipeline. What was not
// was MRR_TREND_DATA: twelve months of recurring revenue written into the
// page, which is a claim about what the business earns.
//
// Nothing in this system computes recurring revenue. Invoices are recorded
// per client, but no subscription, plan price or renewal is, so a monthly
// figure cannot be derived from them.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface PipelineStage {
  id?: string;
  name?: string | null;
  stage?: string | null;
  count?: number | null;
  value?: number | null;
}

export default function PlatformCrmPage() {
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/pipeline', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (!res.ok || body.success !== true) {
        setError(`The pipeline could not be loaded (HTTP ${res.status}).`);
        setStages(null);
        return;
      }
      const raw = body.data as { stages?: PipelineStage[] } | PipelineStage[];
      setStages(Array.isArray(raw) ? raw : raw.stages ?? []);
    } catch {
      setError('Could not reach the server.');
      setStages(null);
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
        <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
        <p className="text-sm text-gray-500 mt-1">The pipeline, as recorded.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && stages !== null && (
        <>
          {stages.length === 0 ? (
            <p className="text-sm text-gray-500">No pipeline stage is on record.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Stage</th>
                    <th className="px-4 py-3 text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stages.map((s, i) => (
                    <tr key={s.id ?? `${s.stage ?? s.name ?? 'stage'}-${i}`}>
                      <td className="px-4 py-3 text-gray-900">{s.name ?? s.stage ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{s.count ?? '—'}</td>
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
            <h2 className="text-sm font-semibold text-gray-900">No revenue trend</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              The page charted twelve months of recurring revenue from a constant. Nothing here
              computes it: invoices are recorded per client, but no subscription, plan price or
              renewal is, so a monthly recurring figure cannot be derived from what the system
              holds.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

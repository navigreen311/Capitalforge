'use client';

// ============================================================
// /platform/voiceforge — calls
//
// This held calls with transcripts and compliance scores against named
// clients. GET /api/voiceforge/calls returns the ones on record.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface Row { [key: string]: unknown; id?: string }

export default function VoiceForgePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/voiceforge/calls', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (!res.ok || body.success !== true) {
        setError(`Calls could not be loaded (HTTP ${res.status}).`);
        setRows(null);
        return;
      }
      const d = body.data as Record<string, unknown> | unknown[];
      const list = Array.isArray(d) ? d : ((d?.['calls'] as unknown[]) ?? []);
      setRows(list as Row[]);
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

  const items = rows ?? [];
  const columns = items.length === 0 ? [] : Object.keys(items[0]).filter((c) => {
    const v = items[0][c];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  }).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">VoiceForge</h1>
        <p className="text-sm text-gray-500 mt-1">Calls on record.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        items.length === 0 ? (
          <p className="text-sm text-gray-500">No call is on record.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-3 text-left">
                      {c.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-3 text-gray-800">
                        {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                      </td>
                    ))}
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

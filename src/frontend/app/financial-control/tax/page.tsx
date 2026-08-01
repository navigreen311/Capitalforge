'use client';

// ============================================================
// /financial-control/tax — tax documents
//
// This page listed tax documents for "Acme Holdings LLC", EIN 12-3456789 —
// 1099-INT, 1099-MISC, 1099-K, K-1 schedules and annual fee summaries across
// four tax years, each with a status of generated or pending, a file size
// and a generation timestamp, with download buttons and a bulk export. It
// called no API, and the endpoint behind it served four more of the same.
//
// Nothing in this system produces a tax form. There is no generator, no
// store and no filing. A client shown a list of generated 1099s believes
// forms have been prepared for them, and a download that produces nothing is
// the point at which they find out otherwise.
//
//   GET /api/financial/tax-documents — reports that none are generated
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface TaxState {
  documents: unknown[];
  generated: boolean;
  why: string;
}

export default function TaxDocumentsPage() {
  const [state, setState] = useState<TaxState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/financial/tax-documents', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: TaxState };
      if (!res.ok || body.success !== true || body.data === undefined) {
        setError(`Tax documents could not be loaded (HTTP ${res.status}).`);
        setState(null);
        return;
      }
      setState(body.data);
    } catch {
      setError('Could not reach the server.');
      setState(null);
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
        <h1 className="text-2xl font-bold text-gray-900">Tax Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          What this system holds towards a client&rsquo;s return.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && state !== null && (
        <>
          <section
            aria-label="No tax documents are generated"
            className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-amber-900">
              No tax document is produced by this system
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">{state.why}</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              This page used to list 1099-INT, 1099-MISC, 1099-K, K-1 and annual summary forms
              for &ldquo;Acme Holdings LLC&rdquo;, EIN 12-3456789, across four tax years, marked
              generated, with file sizes, generation timestamps, download buttons and a bulk
              export. None of them existed. Nothing generated them, nothing stored them and
              nothing filed them.
            </p>
          </section>

          {state.documents.length > 0 && (
            // Nothing reaches here today. Kept so that a real generator, when
            // one exists, has somewhere to land rather than a page that has
            // hardcoded its own absence.
            <p className="text-sm text-gray-700">
              {state.documents.length} document{state.documents.length === 1 ? '' : 's'} on record.
            </p>
          )}

          <section aria-label="Where the figures are" className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Where the figures are</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Fees charged and interest paid are recorded against invoices and card applications,
              and those are real. A return is prepared from them by the client&rsquo;s
              accountant. This system is not the source of a tax form and does not represent
              itself as one.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

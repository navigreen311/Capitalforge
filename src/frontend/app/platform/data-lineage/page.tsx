'use client';

// ============================================================
// /platform/data-lineage — event lineage
//
// The client selector on this page was a constant: four businesses written
// in, none of which had to exist. Choosing one filtered a lineage view that
// was itself generated.
//
// Lineage means tracing a record back through the events that produced it.
// The ledger holds those events, and the client list comes from the roster
// rather than from a list somebody typed.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface ClientOption {
  id: string;
  businessName: string;
}

interface LedgerEvent {
  id: string;
  eventType?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  publishedAt?: string | null;
}

export default function DataLineagePage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [events, setEvents] = useState<LedgerEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/clients?limit=200', { headers: authHeaders() });
        const body = (await res.json()) as { success?: boolean; data?: ClientOption[] };
        const list = body.success === true ? body.data ?? [] : [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
      } catch {
        setError('Could not load the client list.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/governance/lineage?aggregateId=${encodeURIComponent(businessId)}`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        // The endpoint may not exist. Saying so beats drawing a lineage.
        setEvents(null);
        setError(
          `No lineage could be read for this client (HTTP ${res.status}). ` +
            'Nothing is reconstructed in its place.',
        );
        return;
      }
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      const raw = body.data as { events?: LedgerEvent[] } | LedgerEvent[] | undefined;
      setEvents(Array.isArray(raw) ? raw : raw?.events ?? []);
    } catch {
      setError('Could not reach the server.');
      setEvents(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Lineage</h1>
          <p className="text-sm text-gray-500 mt-1">
            The events recorded against a client, in order.
          </p>
        </div>

        {clients.length > 0 && (
          <div>
            <label htmlFor="dl-client" className="block text-xs text-gray-500 mb-1">
              Client
            </label>
            <select
              id="dl-client"
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
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      {!loading && events !== null && (
        events.length === 0 ? (
          <p className="text-sm text-gray-500">No event is recorded against this client.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-sm text-gray-900">{e.eventType ?? '—'}</p>
                <p className="text-xs text-gray-500">
                  {e.aggregateType ?? '—'} · {e.publishedAt?.slice(0, 19).replace('T', ' ') ?? '—'}
                </p>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

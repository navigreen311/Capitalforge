'use client';

// ============================================================
// /rewards — card benefits on record
//
// This page held CARD_SUMMARIES, SPEND_ROUTES and CATEGORY_BESTS — cards
// with earn rates, annual fees, renewal dates and "best card for this
// category" recommendations — and called nothing.
//
// A recommendation to route spend to a particular card is advice about
// money. It has to come from cards a client actually holds.
//
//   GET /api/businesses/:id/benefits — the benefits on record
//
// That endpoint was unreachable: it was registered at /benefits while its
// handler read a :id parameter the path never supplied. The path this file
// calls is the one its own header documents.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface ClientOption {
  id: string;
  businessName: string;
}

interface BenefitRow {
  id: string;
  benefitName?: string | null;
  issuer?: string | null;
  category?: string | null;
  utilized?: boolean;
  expiresAt?: string | null;
}

interface BenefitsPayload {
  benefits?: BenefitRow[];
  totalBenefits?: number;
  utilizedCount?: number;
  pendingAlerts?: number;
}

export default function RewardsPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<BenefitsPayload | null>(null);
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
        else setLoading(false);
      } catch {
        setError('Could not load the client list.');
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/benefits`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as { success?: boolean; data?: BenefitsPayload };
      if (!res.ok || body.success !== true) {
        setError(`Benefits could not be loaded (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData(body.data ?? null);
    } catch {
      setError('Could not reach the server.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  const benefits = data?.benefits ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards</h1>
          <p className="text-sm text-gray-500 mt-1">Card benefits recorded against a client.</p>
        </div>

        {clients.length > 0 && (
          <div>
            <label htmlFor="rw-client" className="block text-xs text-gray-500 mb-1">
              Client
            </label>
            <select
              id="rw-client"
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

      {!loading && error === null && data !== null && (
        <>
          {benefits.length === 0 ? (
            <p className="text-sm text-gray-500">
              No benefit is recorded for this client. Benefits are attached to cards a client
              holds; none is assumed from the product name.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Benefit</th>
                    <th className="px-4 py-3 text-left">Issuer</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Used</th>
                    <th className="px-4 py-3 text-left">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {benefits.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 text-gray-900">{b.benefitName ?? b.id}</td>
                      <td className="px-4 py-3 text-gray-600">{b.issuer ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.category ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{b.utilized === true ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {b.expiresAt?.slice(0, 10) ?? '—'}
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
              Spend routing advice. The page used to name a best card per category — office
              supplies, travel, advertising — with earn rates and projected annual value, over a
              set of cards written into it. Recommending where a client puts spend is advice
              about money, and it has to start from the cards they hold and the rates those
              carry. The optimisation endpoint computes that from categories and amounts a
              caller supplies; it does not know what any client is holding.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

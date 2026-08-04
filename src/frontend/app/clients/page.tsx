'use client';

// ============================================================
// /clients — the client roster
//
// This page held PLACEHOLDER_CLIENTS and called nothing, while GET
// /api/clients returned the real roster the whole time: every business for
// the tenant, with its advisor, status, entity type, state of formation,
// readiness score and consent standing.
//
// A readiness score of 0 is a client assessed as unready. A client with no
// assessment shows nothing, not a zero.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { loadJson, toLoadError } from '@/lib/load-json';
import { toClientRows, humanise, type ClientRow } from '@/lib/client-roster-view';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-blue-100 text-blue-700',
  intake: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-600',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function ClientsPage() {
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [entityType, setEntityType] = useState('llc');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Through `loadJson` rather than a bare fetch with `authHeaders()`.
      // The bare version attached whatever token existed and reported the
      // status if the server refused it, so an access token that aged out —
      // fifteen minutes — turned this page into "HTTP 401" with no way
      // forward, while a refresh token good for another week sat unused.
      const data = await loadJson<unknown>('/api/clients?limit=200');
      setRows(toClientRows(data));
    } catch (e) {
      const info = toLoadError(e);
      setError(
        info.type === 'auth_required'
          ? 'Your session has ended. Sign in again to see the client roster.'
          : info.type === 'network_error'
            ? 'Could not reach the server, so no clients are shown.'
            : `The client roster could not be loaded. ${info.message}`,
      );
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Creates a real client: POST /api/clients, then the roster is re-read.
  const create = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await loadJson('/api/clients', {
        method: 'POST',
        body: { legalName, entityType },
      });
      setShowNew(false);
      setLegalName('');
      await load();
    } catch (e) {
      const info = toLoadError(e);
      setCreateError(
        info.type === 'auth_required'
          ? 'Your session has ended. Sign in again, then create the client.'
          : info.type === 'network_error'
            ? 'Could not reach the server, so no client was created.'
            : `The client was not created. ${info.message}`,
      );
    } finally {
      setCreating(false);
    }
  }, [legalName, entityType, load]);

  const clients = rows ?? [];
  const statuses = useMemo(() => [...new Set(clients.map((c) => c.status))].sort(), [clients]);

  const filtered = clients.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (query.trim() === '') return true;
    return c.businessName.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500 mt-1">Every business on record for this tenant.</p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="client-search" className="block text-xs text-gray-500 mb-1">
                Search
              </label>
              <input
                id="client-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Business name"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="client-status" className="block text-xs text-gray-500 mb-1">
                Status
              </label>
              <select
                id="client-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              >
                <option value="all">All</option>
                {/* Built from the data, so it cannot offer a status no client
                    has. */}
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            </div>
            <p className="pb-2 text-xs text-gray-500">
              {filtered.length} of {clients.length}
            </p>
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400"
            >
              + New Client
            </button>
          </div>

          {showNew && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">New client</h2>
              {/*
                This form records a name and an entity type and nothing else:
                no owner, no consent, no suitability check, and no funding
                readiness score. It sits behind a button labelled the same as
                the full wizard, so a client onboarded here looks finished and
                is not — which is how a record with two fields set and no
                owner gets created without anyone noticing.
              */}
              <p className="text-xs text-gray-500">
                Records a name and entity type only — no owner, consent or suitability
                check. For full onboarding use the{' '}
                <Link href="/clients/new" className="font-semibold text-gray-700 underline">
                  five-step wizard
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor="new-legal-name" className="block text-xs text-gray-500 mb-1">
                    Legal name
                  </label>
                  <input
                    id="new-legal-name"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </div>
                <div>
                  <label htmlFor="new-entity-type" className="block text-xs text-gray-500 mb-1">
                    Entity type
                  </label>
                  <select
                    id="new-entity-type"
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    {/*
                      These must be the values in ENTITY_TYPES
                      (src/shared/validators/business.validators.ts). This list
                      offered "sole_prop", which is not one of them — and this
                      endpoint does not check the enum, so choosing it stored
                      an entity type nothing else in the system recognises.
                    */}
                    {['llc', 'corporation', 's_corp', 'c_corp', 'sole_proprietor', 'partnership'].map((v) => (
                      <option key={v} value={v}>
                        {humanise(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {createError !== null && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {createError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void create()}
                disabled={creating || legalName.trim() === ''}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}

          {clients.length === 0 ? (
            <p className="text-sm text-gray-500">No clients on record.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Advisor</th>
                    <th className="px-4 py-3 text-left">Entity</th>
                    <th className="px-4 py-3 text-left">State</th>
                    <th className="px-4 py-3 text-right">Readiness</th>
                    <th className="px-4 py-3 text-left">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/clients/${encodeURIComponent(c.id)}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {c.businessName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            STATUS_STYLE[c.status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {humanise(c.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.advisorName ?? <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.entityType ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.state ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {/* Nothing rather than a zero for a client who has
                            not been assessed. */}
                        {c.fundingReadinessScore ?? (
                          <span className="text-gray-400">Not assessed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

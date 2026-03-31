'use client';

// ============================================================
// /clients — Client list page
// Searchable, filterable data table. Click row to navigate
// to the client detail page.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clientsApi } from '../../lib/api-client';
import type { BusinessStatus } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  businessName: string;
  status: BusinessStatus;
  advisorName: string;
  fundingReadinessScore: number;
  lastActivityAt: string;
  entityType: string;
  state: string;
}

// ---------------------------------------------------------------------------
// Placeholder data (shown when API is unavailable)
// ---------------------------------------------------------------------------

const PLACEHOLDER_CLIENTS: ClientRow[] = [
  {
    id: 'biz_001',
    businessName: 'Apex Ventures LLC',
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 82,
    lastActivityAt: '2026-03-29T14:22:00Z',
    entityType: 'llc',
    state: 'TX',
  },
  {
    id: 'biz_002',
    businessName: 'NovaTech Solutions Inc.',
    status: 'onboarding',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 61,
    lastActivityAt: '2026-03-28T09:05:00Z',
    entityType: 'corporation',
    state: 'CA',
  },
  {
    id: 'biz_003',
    businessName: 'Blue Ridge Consulting',
    status: 'active',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 74,
    lastActivityAt: '2026-03-27T16:40:00Z',
    entityType: 'llc',
    state: 'NC',
  },
  {
    id: 'biz_004',
    businessName: 'Summit Capital Group',
    status: 'active',
    advisorName: 'James Okafor',
    fundingReadinessScore: 91,
    lastActivityAt: '2026-03-26T11:15:00Z',
    entityType: 's_corp',
    state: 'NY',
  },
  {
    id: 'biz_005',
    businessName: 'Horizon Retail Partners',
    status: 'intake',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 43,
    lastActivityAt: '2026-03-25T08:30:00Z',
    entityType: 'partnership',
    state: 'FL',
  },
  {
    id: 'biz_006',
    businessName: 'Crestline Medical LLC',
    status: 'active',
    advisorName: 'James Okafor',
    fundingReadinessScore: 77,
    lastActivityAt: '2026-03-24T13:00:00Z',
    entityType: 'llc',
    state: 'OH',
  },
  {
    id: 'biz_007',
    businessName: 'Pinnacle Freight Corp',
    status: 'graduated',
    advisorName: 'Sarah Chen',
    fundingReadinessScore: 95,
    lastActivityAt: '2026-03-20T10:10:00Z',
    entityType: 'c_corp',
    state: 'IL',
  },
  {
    id: 'biz_008',
    businessName: 'Redwood Digital',
    status: 'offboarding',
    advisorName: 'Marcus Williams',
    fundingReadinessScore: 55,
    lastActivityAt: '2026-03-18T15:45:00Z',
    entityType: 'llc',
    state: 'WA',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<BusinessStatus, string> = {
  intake:       'bg-gray-800 text-gray-300 border-gray-600',
  onboarding:   'bg-blue-900 text-blue-300 border-blue-700',
  active:       'bg-green-900 text-green-300 border-green-700',
  graduated:    'bg-purple-900 text-purple-300 border-purple-700',
  offboarding:  'bg-yellow-900 text-yellow-300 border-yellow-700',
  closed:       'bg-red-900 text-red-300 border-red-700',
};

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-red-400';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const ALL_STATUSES: BusinessStatus[] = [
  'intake', 'onboarding', 'active', 'graduated', 'offboarding', 'closed',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>(PLACEHOLDER_CLIENTS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusinessStatus | ''>('');
  const [advisorFilter, setAdvisorFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientsApi.list({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      if (res.success && Array.isArray(res.data)) {
        setClients(res.data as ClientRow[]);
      }
    } catch {
      // API not connected — keep placeholder data
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side filter on placeholder data
  const displayed = clients.filter((c) => {
    const matchSearch =
      !search ||
      c.businessName.toLowerCase().includes(search.toLowerCase()) ||
      c.advisorName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || c.status === statusFilter;
    const matchAdvisor = !advisorFilter || c.advisorName === advisorFilter;
    return matchSearch && matchStatus && matchAdvisor;
  });

  const advisors = Array.from(new Set(clients.map((c) => c.advisorName))).sort();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {displayed.length} business{displayed.length !== 1 ? 'es' : ''} found
          </p>
        </div>
        <button
          onClick={() => router.push('/clients/new')}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
        >
          + New Client
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search business or advisor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BusinessStatus | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={advisorFilter}
          onChange={(e) => setAdvisorFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Advisors</option>
          {advisors.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {(search || statusFilter || advisorFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setAdvisorFilter(''); }}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Business Name</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Advisor</th>
              <th className="text-left px-4 py-3 font-semibold">Entity / State</th>
              <th className="text-right px-4 py-3 font-semibold">Readiness</th>
              <th className="text-right px-4 py-3 font-semibold">Last Activity</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  No clients match your filters.
                </td>
              </tr>
            )}
            {!loading &&
              displayed.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => router.push(`/clients/${client.id}`)}
                  className="bg-gray-950 hover:bg-gray-900 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3 font-medium text-gray-100 group-hover:text-white">
                    {client.businessName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[client.status]}`}
                    >
                      {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{client.advisorName}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {client.entityType.toUpperCase()} · {client.state}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold text-base ${scoreColor(client.fundingReadinessScore)}`}>
                      {client.fundingReadinessScore}
                    </span>
                    <span className="text-gray-600 text-xs"> / 100</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {formatDate(client.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 group-hover:text-gray-300">
                    →
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">Readiness Score:</span>
        <span className="text-green-400">75–100 Excellent</span>
        <span className="text-yellow-400">55–74 Moderate</span>
        <span className="text-red-400">0–54 Low</span>
      </div>
    </div>
  );
}

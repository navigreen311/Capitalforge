'use client';

// ============================================================
// /clients — Client list page
// Searchable, filterable data table. Click row to navigate
// to the client detail page.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { clientsApi } from '../../lib/api-client';
import type { BusinessStatus } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AprAlert {
  days: number;
  tier: 'critical' | 'warning';
}

interface ClientRow {
  id: string;
  businessName: string;
  status: BusinessStatus;
  advisorName: string;
  fundingReadinessScore: number;
  lastActivityAt: string;
  entityType: string;
  state: string;
  aprAlert: AprAlert | null;
  consentStatus: 'complete' | 'pending' | 'blocked';
}

type SortColumn = 'businessName' | 'status' | 'advisorName' | 'fundingReadinessScore' | 'lastActivityAt';
type SortDirection = 'asc' | 'desc';

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
    aprAlert: { days: 12, tier: 'critical' },
    consentStatus: 'complete',
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
    aprAlert: null,
    consentStatus: 'pending',
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
    aprAlert: { days: 45, tier: 'warning' },
    consentStatus: 'complete',
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
    aprAlert: null,
    consentStatus: 'complete',
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
    aprAlert: { days: 8, tier: 'critical' },
    consentStatus: 'blocked',
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
    aprAlert: null,
    consentStatus: 'complete',
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
    aprAlert: null,
    consentStatus: 'pending',
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
    aprAlert: null,
    consentStatus: 'complete',
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

const CONSENT_CHIP: Record<string, string> = {
  complete: 'bg-green-900 text-green-300 border-green-700',
  pending:  'bg-yellow-900 text-yellow-300 border-yellow-700',
  blocked:  'bg-red-900 text-red-300 border-red-700',
};

const STATUS_SORT_ORDER: Record<BusinessStatus, number> = {
  intake: 0,
  onboarding: 1,
  active: 2,
  graduated: 3,
  offboarding: 4,
  closed: 5,
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

const ADVISORS_LIST = ['Sarah Chen', 'Marcus Williams', 'James Okafor'];

function downloadCsv(rows: ClientRow[], filename: string) {
  const headers = [
    'Business Name', 'Status', 'Advisor', 'Entity Type', 'State',
    'Readiness Score', 'Last Activity', 'APR Days', 'APR Tier', 'Consent Status',
  ];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        `"${r.businessName}"`,
        r.status,
        `"${r.advisorName}"`,
        r.entityType,
        r.state,
        r.fundingReadinessScore,
        r.lastActivityAt,
        r.aprAlert?.days ?? '',
        r.aprAlert?.tier ?? '',
        r.consentStatus,
      ].join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sortable column header component
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  align,
  onClick,
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  align?: 'left' | 'right';
  onClick: (col: SortColumn) => void;
}) {
  const isActive = column === activeColumn;
  const arrow = isActive ? (direction === 'asc' ? ' \u2191' : ' \u2193') : '';
  return (
    <th
      className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-3 font-semibold cursor-pointer select-none hover:text-gray-200 transition-colors`}
      onClick={() => onClick(column)}
    >
      {label}{arrow}
    </th>
  );
}

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

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('fundingReadinessScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

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
  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchSearch =
        !search ||
        c.businessName.toLowerCase().includes(search.toLowerCase()) ||
        c.advisorName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || c.status === statusFilter;
      const matchAdvisor = !advisorFilter || c.advisorName === advisorFilter;
      return matchSearch && matchStatus && matchAdvisor;
    });
  }, [clients, search, statusFilter, advisorFilter]);

  // Sorted data
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'businessName':
          cmp = a.businessName.localeCompare(b.businessName);
          break;
        case 'status':
          cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
          break;
        case 'advisorName':
          cmp = a.advisorName.localeCompare(b.advisorName);
          break;
        case 'fundingReadinessScore':
          cmp = a.fundingReadinessScore - b.fundingReadinessScore;
          break;
        case 'lastActivityAt':
          cmp = new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortColumn, sortDirection]);

  // Pagination
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const displayed = sorted.slice(startIndex, startIndex + pageSize);
  const rangeStart = totalItems === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + pageSize, totalItems);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, advisorFilter, pageSize]);

  // Reset selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter, advisorFilter, sortColumn, sortDirection, page, pageSize]);

  const advisors = Array.from(new Set(clients.map((c) => c.advisorName))).sort();

  // Sort handler
  const handleSort = (col: SortColumn) => {
    if (col === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'fundingReadinessScore' ? 'desc' : 'asc');
    }
  };

  // Selection handlers
  const allOnPageSelected = displayed.length > 0 && displayed.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayed.map((c) => c.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk actions
  const handleBulkExport = () => {
    const rows = clients.filter((c) => selectedIds.has(c.id));
    downloadCsv(rows, 'clients-selected.csv');
  };
  const handleAssignAdvisor = (advisor: string) => {
    setClients((prev) =>
      prev.map((c) =>
        selectedIds.has(c.id) ? { ...c, advisorName: advisor } : c,
      ),
    );
    setSelectedIds(new Set());
    setShowAssignDropdown(false);
  };

  // Full export
  const handleExportAll = () => {
    downloadCsv(sorted, 'clients-export.csv');
  };

  const colSpan = 9; // checkbox + 6 data cols + consent + arrow

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalItems} business{totalItems !== 1 ? 'es' : ''} found
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportAll}
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => router.push('/clients/new')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
          >
            + New Client
          </button>
        </div>
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-gray-200">
            {selectedIds.size} selected
          </span>
          <span className="text-gray-700">|</span>
          <button
            onClick={handleBulkExport}
            className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Export CSV
          </button>
          <div className="relative">
            <button
              onClick={() => setShowAssignDropdown(!showAssignDropdown)}
              className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              Assign Advisor &#9662;
            </button>
            {showAssignDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10 min-w-[180px]">
                {ADVISORS_LIST.map((adv) => (
                  <button
                    key={adv}
                    onClick={() => handleAssignAdvisor(adv)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white first:rounded-t-lg last:rounded-b-lg"
                  >
                    {adv}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => { setSelectedIds(new Set()); setShowAssignDropdown(false); }}
            className="px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
              </th>
              <SortableHeader label="Business Name" column="businessName" activeColumn={sortColumn} direction={sortDirection} onClick={handleSort} />
              <SortableHeader label="Status" column="status" activeColumn={sortColumn} direction={sortDirection} onClick={handleSort} />
              <SortableHeader label="Advisor" column="advisorName" activeColumn={sortColumn} direction={sortDirection} onClick={handleSort} />
              <th className="text-left px-4 py-3 font-semibold">Consent</th>
              <th className="text-left px-4 py-3 font-semibold">Entity / State</th>
              <SortableHeader label="Readiness" column="fundingReadinessScore" activeColumn={sortColumn} direction={sortDirection} align="right" onClick={handleSort} />
              <SortableHeader label="Last Activity" column="lastActivityAt" activeColumn={sortColumn} direction={sortDirection} align="right" onClick={handleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-gray-500">
                  No clients match your filters.
                </td>
              </tr>
            )}
            {!loading &&
              displayed.map((client) => (
                <tr
                  key={client.id}
                  className="bg-gray-950 hover:bg-gray-900 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={() => toggleOne(client.id)}
                      className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </td>
                  <td
                    className="px-4 py-3 font-medium text-gray-100 group-hover:text-white"
                    onClick={() => router.push(`/clients/${client.id}`)}
                  >
                    <span>{client.businessName}</span>
                    {client.aprAlert && (
                      <span
                        className={`ml-2 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                          client.aprAlert.tier === 'critical'
                            ? 'bg-red-900 text-red-300 border border-red-700'
                            : 'bg-amber-900 text-amber-300 border border-amber-700'
                        }`}
                      >
                        APR: {client.aprAlert.days}d
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={() => router.push(`/clients/${client.id}`)}>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[client.status]}`}
                    >
                      {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300" onClick={() => router.push(`/clients/${client.id}`)}>
                    {client.advisorName}
                  </td>
                  <td className="px-4 py-3" onClick={() => router.push(`/clients/${client.id}`)}>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CONSENT_CHIP[client.consentStatus]}`}
                    >
                      {client.consentStatus.charAt(0).toUpperCase() + client.consentStatus.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400" onClick={() => router.push(`/clients/${client.id}`)}>
                    {client.entityType.toUpperCase()} · {client.state}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={() => router.push(`/clients/${client.id}`)}>
                    <span className={`font-bold text-base ${scoreColor(client.fundingReadinessScore)}`}>
                      {client.fundingReadinessScore}
                    </span>
                    <span className="text-gray-600 text-xs"> / 100</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400" onClick={() => router.push(`/clients/${client.id}`)}>
                    {formatDate(client.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 group-hover:text-gray-300" onClick={() => router.push(`/clients/${client.id}`)}>
                    →
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {rangeStart}–{rangeEnd} of {totalItems} clients
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
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

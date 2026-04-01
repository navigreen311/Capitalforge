'use client';

// ============================================================
// RecentApplicationsEnhanced — Full-featured applications table
//
// Self-contained dashboard component with inline filtering,
// consent chips, round links, kebab actions menu, and
// loading skeleton.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardBadge, type DashboardBadgeStatus } from './DashboardBadge';

// ── Types ───────────────────────────────────────────────────────────────────

type ConsentStatus = 'complete' | 'pending' | 'blocked';

interface Application {
  id: string;
  clientName: string;
  clientId: string;
  type: string;
  amount: string;
  status: DashboardBadgeStatus;
  submitted: string;
  round: string;
  roundId: string;
  consent: ConsentStatus;
  consentTooltip?: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const APPS: Application[] = [
  { id: 'APP-0091', clientName: 'Meridian Holdings LLC', clientId: 'c-001', type: 'Term Loan', amount: '$250,000', status: 'review', submitted: '2026-03-30', round: 'R2', roundId: 'r-001', consent: 'complete' },
  { id: 'APP-0090', clientName: 'Apex Ventures Inc.', clientId: 'c-002', type: 'SBA 7(a)', amount: '$500,000', status: 'pending', submitted: '2026-03-29', round: 'R1', roundId: 'r-002', consent: 'pending' },
  { id: 'APP-0089', clientName: 'Brightline Corp', clientId: 'c-003', type: 'Credit Stack', amount: '$120,000', status: 'approved', submitted: '2026-03-28', round: 'R1', roundId: 'r-003', consent: 'complete' },
  { id: 'APP-0088', clientName: 'Thornwood Capital', clientId: 'c-004', type: 'Equipment', amount: '$85,000', status: 'blocked', submitted: '2026-03-27', round: 'R1', roundId: 'r-004', consent: 'blocked', consentTooltip: 'Missing Product-Reality Acknowledgment' },
  { id: 'APP-0087', clientName: 'Norcal Transport LLC', clientId: 'c-005', type: 'Line of Credit', amount: '$200,000', status: 'declined', submitted: '2026-03-26', round: 'R3', roundId: 'r-005', consent: 'complete' },
];

// ── Consent Chip ───────────────────────────────────────────────────────────

const CONSENT_STYLES: Record<ConsentStatus, string> = {
  complete: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  pending:  'bg-amber-100 text-amber-800 border-amber-300',
  blocked:  'bg-red-100 text-red-800 border-red-300',
};

const CONSENT_LABELS: Record<ConsentStatus, string> = {
  complete: 'Complete',
  pending:  'Pending',
  blocked:  'Blocked',
};

function ConsentChip({ status, tooltip }: { status: ConsentStatus; tooltip?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONSENT_STYLES[status]}`}
      title={tooltip}
    >
      {CONSENT_LABELS[status]}
    </span>
  );
}

// ── Kebab Actions Menu ─────────────────────────────────────────────────────

const MENU_ITEMS = [
  'View Application',
  'View Client',
  'Flag for Review',
  'Export Dossier',
  'Contact Client',
] as const;

function KebabMenu({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={`Actions for ${appId}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        &#x22EE;
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-surface-border py-1"
          role="menu"
        >
          {MENU_ITEMS.map((item) => (
            <button
              key={item}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter Bar ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: DashboardBadgeStatus[] = [
  'review', 'pending', 'approved', 'blocked', 'declined',
  'processing', 'funded', 'draft', 'inactive', 'active', 'expired', 'awaiting_ack',
];

const TYPE_OPTIONS = ['Term Loan', 'SBA 7(a)', 'Credit Stack', 'Equipment', 'Line of Credit'];

function FilterBar({
  statusFilter,
  typeFilter,
  dateFrom,
  dateTo,
  onStatusChange,
  onTypeChange,
  onDateFromChange,
  onDateToChange,
}: {
  statusFilter: string;
  typeFilter: string;
  dateFrom: string;
  dateTo: string;
  onStatusChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-surface-border bg-gray-50/50">
      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
        aria-label="Filter by status"
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
          </option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
        aria-label="Filter by type"
      >
        <option value="">All Types</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500" htmlFor="filter-date-from">From</label>
        <input
          id="filter-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500" htmlFor="filter-date-to">To</label>
        <input
          id="filter-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
        />
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="flex gap-4 px-6 py-3 border-b border-surface-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded flex-1" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-6 py-4 border-b border-surface-border last:border-b-0">
          {Array.from({ length: 8 }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function RecentApplicationsEnhanced() {
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Filtered data
  const filtered = useMemo(() => {
    return APPS.filter((app) => {
      if (statusFilter && app.status !== statusFilter) return false;
      if (typeFilter && app.type !== typeFilter) return false;
      if (dateFrom && app.submitted < dateFrom) return false;
      if (dateTo && app.submitted > dateTo) return false;
      return true;
    });
  }, [statusFilter, typeFilter, dateFrom, dateTo]);

  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-border">
        <h3 className="text-base font-semibold text-gray-900">Recent Applications</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowFilters((prev) => !prev)}
            className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
              showFilters
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Filters
          </button>
          <a
            href="/applications"
            className="text-sm font-medium text-brand-navy hover:text-brand-navy/80 transition-colors"
          >
            View all
          </a>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <FilterBar
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onStatusChange={setStatusFilter}
          onTypeChange={setTypeFilter}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      )}

      {/* Table content */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50/50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">App ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Round</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Consent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-400">
                    No applications match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr
                    key={app.id}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    {/* App ID */}
                    <td className="px-6 py-3 whitespace-nowrap">
                      <a
                        href={`/applications/${app.id}`}
                        className="text-sm font-medium text-brand-navy hover:underline"
                      >
                        {app.id}
                      </a>
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <a
                        href={`/clients/${app.clientId}`}
                        className="text-sm text-gray-700 hover:text-brand-navy hover:underline"
                      >
                        {app.clientName}
                      </a>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {app.type}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                      {app.amount}
                    </td>

                    {/* Round */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <a
                        href={`/funding-rounds/${app.roundId}`}
                        className="text-sm text-brand-navy hover:underline"
                      >
                        {app.round}
                      </a>
                    </td>

                    {/* Consent */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ConsentChip status={app.consent} tooltip={app.consentTooltip} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DashboardBadge status={app.status} />
                    </td>

                    {/* Submitted */}
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {app.submitted}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      <KebabMenu appId={app.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

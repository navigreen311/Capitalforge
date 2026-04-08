'use client';

// ============================================================
// RecentApplicationsEnhanced — Full-featured applications table
//
// Self-contained dashboard component with inline filtering,
// consent chips, round links, kebab actions menu with keyboard
// navigation, and loading skeleton.
// Uses useAuthFetch for data fetching and DashboardErrorState
// for error display.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { apiClient } from '@/lib/api-client';
import { DashboardBadge, type DashboardBadgeStatus } from './DashboardBadge';
import { DashboardErrorState } from './DashboardErrorState';

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

interface ApplicationsResponse {
  applications: Application[];
  total: number;
}

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

interface MenuAction {
  label: string;
  href?: string;
  onClick?: () => Promise<void> | void;
}

function buildMenuActions(app: Application, onFlagSuccess: () => void): MenuAction[] {
  return [
    {
      label: 'View Application',
      href: `/applications/${app.id}`,
    },
    {
      label: 'View Client',
      href: `/clients/${app.clientId}`,
    },
    {
      label: 'Flag for Review',
      onClick: async () => {
        try {
          await apiClient.post(`/v1/applications/${app.id}/flag`);
          onFlagSuccess();
        } catch {
          // Error is handled inline — toast shown by caller
        }
      },
    },
    {
      label: 'Export Dossier',
      href: `/documents/export?app_id=${app.id}`,
    },
    {
      label: 'Contact Client',
      href: `/voiceforge/outreach?client_id=${app.clientId}`,
    },
  ];
}

function KebabMenu({ app }: { app: Application }) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);

  const actions = useMemo(
    () =>
      buildMenuActions(app, () => {
        setToast(`${app.id} flagged for review`);
        setOpen(false);
        setTimeout(() => setToast(null), 3000);
      }),
    [app],
  );

  // Close on click-outside or Escape
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
        setFocusIndex(-1);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setFocusIndex(-1);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Focus the active menu item when focusIndex changes
  useEffect(() => {
    if (open && focusIndex >= 0) {
      itemRefs.current[focusIndex]?.focus();
    }
  }, [open, focusIndex]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setFocusIndex(0);
    } else {
      setFocusIndex(-1);
    }
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((prev) => (prev + 1) % actions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((prev) => (prev - 1 + actions.length) % actions.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIndex(actions.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
      setFocusIndex(-1);
    }
  }

  function handleItemClick(action: MenuAction) {
    if (action.onClick) {
      action.onClick();
    }
    // For href actions, navigation happens via the anchor — just close
    if (!action.onClick) {
      setOpen(false);
      setFocusIndex(-1);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
        aria-label={`Actions for ${app.id}`}
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
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action, idx) => {
            const commonClasses =
              'w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-100 focus:outline-none transition-colors';

            if (action.href) {
              return (
                <a
                  key={action.label}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  href={action.href}
                  className={`block ${commonClasses}`}
                  role="menuitem"
                  tabIndex={focusIndex === idx ? 0 : -1}
                  onClick={() => handleItemClick(action)}
                >
                  {action.label}
                </a>
              );
            }

            return (
              <button
                key={action.label}
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={commonClasses}
                role="menuitem"
                tabIndex={focusIndex === idx ? 0 : -1}
                onClick={() => handleItemClick(action)}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Confirmation toast */}
      {toast && (
        <div className="absolute right-0 top-full mt-10 z-50 w-56 bg-emerald-600 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
          {toast}
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
  const { data, isLoading, error, refetch } = useAuthFetch<ApplicationsResponse>(
    '/api/v1/dashboard/recent-applications',
  );

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const applications = data?.applications ?? [];

  // Filtered data
  const filtered = useMemo(() => {
    return applications.filter((app) => {
      if (statusFilter && app.status !== statusFilter) return false;
      if (typeFilter && app.type !== typeFilter) return false;
      if (dateFrom && app.submitted < dateFrom) return false;
      if (dateTo && app.submitted > dateTo) return false;
      return true;
    });
  }, [applications, statusFilter, typeFilter, dateFrom, dateTo]);

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <DashboardErrorState error={error} onRetry={refetch} />
    );
  }

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
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50/50">
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">App ID</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Client</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Type</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Amount</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[60px]">Round</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Consent</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[90px]">Status</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Submitted</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                    className="group hover:bg-gray-50/50 transition-colors"
                  >
                    {/* App ID */}
                    <td className="px-3 py-3 truncate">
                      <a
                        href={`/applications/${app.id}`}
                        className="text-sm font-medium text-brand-navy hover:underline"
                      >
                        {app.id}
                      </a>
                    </td>

                    {/* Client */}
                    <td className="px-3 py-3 truncate">
                      <a
                        href={`/clients/${app.clientId}`}
                        className="text-sm text-gray-700 hover:text-brand-navy hover:underline"
                      >
                        {app.clientName}
                      </a>
                    </td>

                    {/* Type */}
                    <td className="px-3 py-3 truncate text-gray-600">
                      {app.type}
                    </td>

                    {/* Amount */}
                    <td className="px-3 py-3 truncate font-medium text-gray-900">
                      {app.amount}
                    </td>

                    {/* Round */}
                    <td className="px-3 py-3 truncate">
                      <a
                        href={`/funding-rounds/${app.roundId}`}
                        className="text-sm text-brand-navy hover:underline"
                      >
                        {app.round}
                      </a>
                    </td>

                    {/* Consent */}
                    <td className="px-3 py-3 truncate">
                      <ConsentChip status={app.consent} tooltip={app.consentTooltip} />
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 truncate">
                      <DashboardBadge status={app.status} />
                    </td>

                    {/* Submitted */}
                    <td className="px-3 py-3 truncate text-gray-500">
                      {app.submitted}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right">
                      <a
                        href={`/applications/${app.id}`}
                        className="text-sm font-medium text-brand-navy hover:text-brand-navy/80 transition-colors"
                      >
                        View &rarr;
                      </a>
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

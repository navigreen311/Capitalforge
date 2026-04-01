'use client';

// ============================================================
// ApplicationTableView — Sortable table view of applications
//
// Features:
//   - Sortable columns (click header for asc/desc)
//   - Default sort: submitted_date desc
//   - 25 rows per page with pagination
//   - Checkbox column for bulk select
//   - Bulk actions bar: Export CSV, Send Consent Requests
//   - Row hover highlight (via cf-table classes)
//   - Kebab menu per row: View Details, Submit, Contact Client,
//     Export Dossier
//   - Currency formatting, relative dates
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '../ui/badge';
import type { BadgeStatus } from '../ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationRow {
  id: string;
  client_id: string;
  client_name: string;
  card_product: string;
  issuer: string;
  round_number: number | null;
  round_id: string | null;
  requested: number;
  approved: number | null;
  status: string;
  apr_days_remaining: number | null;
  submitted_date: string;
  advisor: string;
  consent_status: string;
  acknowledgment_status: string;
}

interface ApplicationTableViewProps {
  applications: ApplicationRow[];
  onCardClick: (appId: string) => void;
}

type SortField =
  | 'id'
  | 'client_name'
  | 'card_product'
  | 'issuer'
  | 'round_number'
  | 'requested'
  | 'approved'
  | 'status'
  | 'apr_days_remaining'
  | 'submitted_date'
  | 'advisor';

type SortDirection = 'asc' | 'desc';

// ── Constants ──────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 25;

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  draft: 'draft',
  pending_consent: 'pending',
  submitted: 'review',
  approved: 'approved',
  declined: 'declined',
  reconsideration: 'processing',
  funded: 'funded',
  expired: 'expired',
  active: 'active',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'in the future';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function formatAbsoluteDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function aprExpiryLabel(days: number | null): string {
  if (days == null) return '\u2014';
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function compareValues<T>(a: T, b: T, dir: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === 'asc' ? -1 : 1;
  if (b == null) return dir === 'asc' ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  return 0;
}

function exportCsv(rows: ApplicationRow[]): void {
  const headers = [
    'App ID', 'Client', 'Card Product', 'Issuer', 'Round',
    'Requested', 'Approved', 'Status', 'APR Days Remaining',
    'Submitted', 'Advisor', 'Consent', 'Acknowledgment',
  ];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id, `"${r.client_name}"`, `"${r.card_product}"`, `"${r.issuer}"`,
        r.round_number ?? '', r.requested, r.approved ?? '',
        r.status, r.apr_days_remaining ?? '', r.submitted_date,
        `"${r.advisor}"`, r.consent_status, r.acknowledgment_status,
      ].join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `applications-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sort Arrow ──────────────────────────────────────────────────────────────

function SortArrow({ field, sortField, sortDir }: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDirection;
}) {
  if (field !== sortField) {
    return <span className="ml-1 text-gray-300 text-[10px]">{'\u2195'}</span>;
  }
  return (
    <span className="ml-1 text-brand-navy text-[10px]">
      {sortDir === 'asc' ? '\u2191' : '\u2193'}
    </span>
  );
}

// ── Row Kebab Menu ──────────────────────────────────────────────────────────

function RowKebabMenu({ app, onCardClick }: {
  app: ApplicationRow;
  onCardClick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={`Actions for application ${app.id}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        &#x22EE;
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-lg shadow-lg border border-surface-border py-1"
          role="menu"
        >
          <button
            onClick={() => { onCardClick(app.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            View Details
          </button>
          <button
            onClick={() => { console.info('[ApplicationTable] Submit:', app.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Submit
          </button>
          <button
            onClick={() => { console.info('[ApplicationTable] Contact Client:', app.client_id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Contact Client
          </button>
          <button
            onClick={() => { console.info('[ApplicationTable] Export Dossier:', app.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Export Dossier
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bulk Actions Bar ────────────────────────────────────────────────────────

function BulkActionsBar({
  selectedCount,
  selectedApps,
  onClearSelection,
}: {
  selectedCount: number;
  selectedApps: ApplicationRow[];
  onClearSelection: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-navy/5 border-b border-surface-border">
      <span className="text-sm font-medium text-gray-700">
        {selectedCount} selected
      </span>
      <button
        onClick={() => exportCsv(selectedApps)}
        className="px-3 py-1.5 text-xs font-medium text-brand-navy rounded-lg border border-brand-navy/20 hover:bg-brand-navy/5 transition-colors"
      >
        Export CSV
      </button>
      <button
        onClick={() => {
          console.info('[ApplicationTable] Send consent requests for:', selectedApps.map((a) => a.id));
        }}
        className="px-3 py-1.5 text-xs font-medium text-brand-navy rounded-lg border border-brand-navy/20 hover:bg-brand-navy/5 transition-colors"
      >
        Send Consent Requests
      </button>
      <button
        onClick={onClearSelection}
        className="ml-auto text-xs text-gray-500 hover:text-gray-700"
      >
        Clear selection
      </button>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  totalRows,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * ROWS_PER_PAGE + 1;
  const end = Math.min(currentPage * ROWS_PER_PAGE, totalRows);

  // Build page numbers: show first, last, and neighbors of current
  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
      <span className="text-xs text-gray-500">
        Showing {start}&ndash;{end} of {totalRows}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 py-1 text-xs rounded-md border border-surface-border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ell-${i}`} className="px-1 text-xs text-gray-400">&hellip;</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                p === currentPage
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'border-surface-border hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 py-1 text-xs rounded-md border border-surface-border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ApplicationTableView({
  applications,
  onCardClick,
}: ApplicationTableViewProps) {
  const [sortField, setSortField] = useState<SortField>('submitted_date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Sort ────────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDir('asc');
      }
      return field;
    });
    setCurrentPage(1);
  }, []);

  const sorted = useMemo(() => {
    const copy = [...applications];
    copy.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return compareValues(aVal, bVal, sortDir);
    });
    return copy;
  }, [applications, sortField, sortDir]);

  // ── Pagination ──────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return sorted.slice(start, start + ROWS_PER_PAGE);
  }, [sorted, safePage]);

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [applications.length]);

  // ── Selection ───────────────────────────────────────────────────────────
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }, [pageRows, allOnPageSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedApps = useMemo(
    () => applications.filter((a) => selected.has(a.id)),
    [applications, selected],
  );

  // ── Sortable header helper ─────────────────────────────────────────────
  const thButton = (label: string, field: SortField, align: 'text-left' | 'text-right' = 'text-left') => (
    <th className={align}>
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-0.5 hover:text-gray-800 transition-colors"
      >
        {label}
        <SortArrow field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    </th>
  );

  return (
    <div className="cf-table-wrapper">
      {/* Bulk actions */}
      <BulkActionsBar
        selectedCount={selected.size}
        selectedApps={selectedApps}
        onClearSelection={clearSelection}
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="cf-table">
          <thead>
            <tr>
              {/* Checkbox */}
              <th className="text-left w-10">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                  aria-label="Select all on this page"
                />
              </th>
              {thButton('App ID', 'id')}
              {thButton('Client', 'client_name')}
              {thButton('Card Product', 'card_product')}
              {thButton('Issuer', 'issuer')}
              {thButton('Round', 'round_number')}
              {thButton('Requested', 'requested', 'text-right')}
              {thButton('Approved', 'approved', 'text-right')}
              {thButton('Status', 'status')}
              {thButton('APR Expiry', 'apr_days_remaining')}
              {thButton('Submitted', 'submitted_date')}
              {thButton('Advisor', 'advisor')}
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-12 text-gray-400 text-sm">
                  No applications found.
                </td>
              </tr>
            ) : (
              pageRows.map((app) => {
                const badgeStatus: BadgeStatus = STATUS_TO_BADGE[app.status] ?? 'draft';
                const isExpiringSoon = app.apr_days_remaining != null && app.apr_days_remaining <= 15;

                return (
                  <tr key={app.id} className="group">
                    {/* Checkbox */}
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(app.id)}
                        onChange={() => toggleOne(app.id)}
                        className="rounded border-gray-300 text-brand-navy focus:ring-brand-navy/30"
                        aria-label={`Select application ${app.id}`}
                      />
                    </td>

                    {/* App ID — clickable */}
                    <td>
                      <button
                        onClick={() => onCardClick(app.id)}
                        className="font-medium text-brand-navy hover:underline text-sm"
                      >
                        {app.id}
                      </button>
                    </td>

                    {/* Client — link */}
                    <td>
                      <Link
                        href={`/clients/${app.client_id}`}
                        className="font-medium text-gray-900 hover:text-brand-navy hover:underline"
                      >
                        {app.client_name}
                      </Link>
                    </td>

                    {/* Card Product */}
                    <td>{app.card_product}</td>

                    {/* Issuer */}
                    <td>{app.issuer}</td>

                    {/* Round */}
                    <td>
                      {app.round_number != null ? (
                        <span className="text-sm">R{app.round_number}</span>
                      ) : (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </td>

                    {/* Requested */}
                    <td className="text-right font-mono text-sm">
                      {formatCurrency(app.requested)}
                    </td>

                    {/* Approved */}
                    <td className="text-right font-mono text-sm">
                      {formatCurrency(app.approved)}
                    </td>

                    {/* Status */}
                    <td>
                      <Badge
                        status={badgeStatus}
                        label={statusLabel(app.status)}
                        size="sm"
                      />
                    </td>

                    {/* APR Expiry */}
                    <td>
                      <span
                        className={`text-sm font-medium ${
                          isExpiringSoon ? 'text-red-600' : 'text-gray-700'
                        }`}
                      >
                        {aprExpiryLabel(app.apr_days_remaining)}
                      </span>
                    </td>

                    {/* Submitted */}
                    <td>
                      <span
                        className="text-sm cursor-default"
                        title={formatAbsoluteDate(app.submitted_date)}
                      >
                        {relativeDate(app.submitted_date)}
                      </span>
                    </td>

                    {/* Advisor */}
                    <td className="text-sm">{app.advisor}</td>

                    {/* Actions */}
                    <td className="text-right">
                      <RowKebabMenu app={app} onCardClick={onCardClick} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        totalRows={sorted.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

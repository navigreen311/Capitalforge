'use client';

import React, { useState, useMemo, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnDef<T> {
  /** Unique key — also used as the sort key when sortable */
  key: string;
  header: string;
  /** Render a cell. Falls back to String(row[key]) */
  cell?: (row: T, rowIndex: number) => React.ReactNode;
  /** Enable column sorting */
  sortable?: boolean;
  /** Column header alignment */
  align?: 'left' | 'center' | 'right';
  /** Fixed column width (e.g. "w-32") */
  width?: string;
}

interface SortState {
  key: string;
  direction: SortDirection;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Key in T used as React list key (defaults to "id") */
  rowKey?: keyof T;
  /** Rows per page options */
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /** Loading state — renders skeleton rows */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNestedValue<T extends Record<string, unknown>>(obj: T, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function sortData<T extends Record<string, unknown>>(
  data: T[],
  sort: SortState,
): T[] {
  if (!sort.direction) return data;
  return [...data].sort((a, b) => {
    const va = getNestedValue(a, sort.key);
    const vb = getNestedValue(b, sort.key);
    const aStr = va == null ? '' : String(va);
    const bStr = vb == null ? '' : String(vb);
    // Numeric sort when both values look numeric
    const aNum = parseFloat(aStr.replace(/[^0-9.-]/g, ''));
    const bNum = parseFloat(bStr.replace(/[^0-9.-]/g, ''));
    const numeric = !isNaN(aNum) && !isNaN(bNum);
    const cmp = numeric ? aNum - bNum : aStr.localeCompare(bStr);
    return sort.direction === 'asc' ? cmp : -cmp;
  });
}

// ─── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-surface-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded-md bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100
                          animate-shimmer bg-[length:200%_100%]"
               style={{ width: `${55 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Sort icon ───────────────────────────────────────────────────────────────

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === 'asc')  return <span aria-hidden="true" className="ml-1 text-brand-gold">↑</span>;
  if (direction === 'desc') return <span aria-hidden="true" className="ml-1 text-brand-gold">↓</span>;
  return <span aria-hidden="true" className="ml-1 text-gray-300">↕</span>;
}

// ─── DataTable ───────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey = 'id' as keyof T,
  pageSizeOptions = [10, 25, 50],
  defaultPageSize = 10,
  loading = false,
  emptyMessage = 'No records found.',
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>({ key: '', direction: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const handleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc')  return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: null };
      return { key, direction: 'asc' };
    });
    setPage(1);
  }, []);

  const sorted = useMemo(() => sortData(data, sort), [data, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart  = (clampedPage - 1) * pageSize;
  const pageRows   = sorted.slice(pageStart, pageStart + pageSize);

  const alignClass: Record<NonNullable<ColumnDef<T>['align']>, string> = {
    left:   'text-left',
    center: 'text-center',
    right:  'text-right',
  };

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {/* ── Table ─────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-t-xl border border-surface-border">
        <table className="w-full text-sm">
          {/* Head */}
          <thead>
            <tr className="bg-surface-overlay border-b border-surface-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500
                    whitespace-nowrap select-none
                    ${alignClass[col.align ?? 'left']}
                    ${col.width ?? ''}
                    ${col.sortable
                      ? 'cursor-pointer hover:text-gray-900 hover:bg-gray-50 transition-colors duration-100'
                      : ''}
                  `}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sort.key === col.key
                      ? sort.direction === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && (
                      <SortIcon direction={sort.key === col.key ? sort.direction : null} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="bg-white divide-y divide-surface-border">
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, rowIndex) => {
                const key = String(row[rowKey] ?? pageStart + rowIndex);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`
                      border-b border-surface-border last:border-0
                      transition-colors duration-100
                      ${onRowClick ? 'cursor-pointer hover:bg-surface-overlay' : 'hover:bg-gray-50/50'}
                    `}
                  >
                    {columns.map((col) => {
                      const raw = getNestedValue(row, col.key);
                      return (
                        <td
                          key={col.key}
                          className={`
                            px-4 py-3 text-gray-700 whitespace-nowrap
                            ${alignClass[col.align ?? 'left']}
                            ${col.width ?? ''}
                          `}
                        >
                          {col.cell
                            ? col.cell(row, rowIndex)
                            : raw == null ? <span className="text-gray-300">—</span> : String(raw)
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination bar ────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-4 py-3
                      bg-white border-x border-b border-surface-border rounded-b-xl
                      text-sm text-gray-500">
        {/* Left — count + page size selector */}
        <div className="flex items-center gap-3">
          <span>
            {loading ? '—' : (
              sorted.length === 0
                ? '0 results'
                : `${pageStart + 1}–${Math.min(pageStart + pageSize, sorted.length)} of ${sorted.length}`
            )}
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="text-xs border border-surface-border rounded-md px-2 py-1
                       bg-white text-gray-600 focus:outline-none focus:ring-1
                       focus:ring-brand-gold cursor-pointer"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>

        {/* Right — page controls */}
        <div className="flex items-center gap-1">
          <PaginationButton
            onClick={() => setPage(1)}
            disabled={clampedPage === 1}
            aria-label="First page"
          >«</PaginationButton>
          <PaginationButton
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage === 1}
            aria-label="Previous page"
          >‹</PaginationButton>

          <span className="px-3 py-1 text-xs font-medium text-gray-700">
            {clampedPage} / {totalPages}
          </span>

          <PaginationButton
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage === totalPages}
            aria-label="Next page"
          >›</PaginationButton>
          <PaginationButton
            onClick={() => setPage(totalPages)}
            disabled={clampedPage === totalPages}
            aria-label="Last page"
          >»</PaginationButton>
        </div>
      </div>
    </div>
  );
}

// ─── PaginationButton helper ─────────────────────────────────────────────────

interface PaginationButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}

function PaginationButton({ children, onClick, disabled, 'aria-label': ariaLabel }: PaginationButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium
                 border border-surface-border bg-white text-gray-600
                 hover:bg-surface-overlay hover:text-gray-900
                 disabled:opacity-40 disabled:cursor-not-allowed
                 transition-colors duration-100"
    >
      {children}
    </button>
  );
}

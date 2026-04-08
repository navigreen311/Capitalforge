'use client';

// ============================================================
// ApplicationFilterBar — Horizontal filter bar with dropdowns
// and view-mode toggle for the applications kanban/table view.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationFilters {
  client: string;
  issuer: string;
  advisor: string;
  round: string;
}

export interface ApplicationFilterBarProps {
  filters: ApplicationFilters;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  viewMode: 'kanban' | 'table';
  onViewModeChange: (mode: 'kanban' | 'table') => void;
  hasActiveFilters: boolean;
}

// ── Dropdown options ────────────────────────────────────────────────────────

const CLIENT_OPTIONS = [
  'Apex Ventures LLC',
  'NovaGo Solutions Inc.',
  'Meridian Holdings LLC',
  'Brightline Corp',
  'Thornwood Capital',
] as const;

/** Grouped issuer options by category */
const ISSUER_GROUPS: { label: string; issuers: string[] }[] = [
  {
    label: 'Major Banks',
    issuers: [
      'Chase',
      'American Express',
      'Capital One',
      'Citi',
      'Bank of America',
      'US Bank',
      'Wells Fargo',
      'Barclays',
    ],
  },
  {
    label: 'Credit Unions',
    issuers: [
      'Navy Federal Credit Union',
      'Alliant Credit Union',
      'PenFed Credit Union',
      'Boeing Employees Credit Union',
      'First Tech Federal Credit Union',
      'Lake Michigan Credit Union',
    ],
  },
  {
    label: 'Other',
    issuers: [
      'Synchrony',
      'Bread Financial',
      'Celtic Bank',
    ],
  },
];

const ADVISOR_OPTIONS = [
  'Sarah Chen',
  'Marcus Williams',
  'James Okafor',
] as const;

const ROUND_OPTIONS = [
  'Round 1',
  'Round 2',
  'Round 3',
] as const;

// ── Icons ───────────────────────────────────────────────────────────────────

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="1" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="1" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2" width="14" height="2" rx="0.5" fill="currentColor" />
      <rect x="1" y="6" width="14" height="2" rx="0.5" fill="currentColor" />
      <rect x="1" y="10" width="14" height="2" rx="0.5" fill="currentColor" />
      <rect x="1" y="14" width="14" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FilterSelectProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="cf-input !py-1.5 !px-2.5 !text-xs !rounded-md appearance-none
                 cursor-pointer min-w-[140px] bg-[length:16px_16px] bg-[right_6px_center]
                 bg-no-repeat pr-7"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/** Issuer dropdown with grouped <optgroup> categories */
function IssuerFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="All Issuers"
      className="cf-input !py-1.5 !px-2.5 !text-xs !rounded-md appearance-none
                 cursor-pointer min-w-[140px] bg-[length:16px_16px] bg-[right_6px_center]
                 bg-no-repeat pr-7"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      <option value="">All Issuers</option>
      {ISSUER_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.issuers.map((issuer) => (
            <option key={issuer} value={issuer}>
              {issuer}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
}: ApplicationFilterBarProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter dropdowns */}
        <FilterSelect
          label="All Clients"
          value={filters.client}
          options={CLIENT_OPTIONS}
          onChange={(v) => onFilterChange('client', v)}
        />

        <IssuerFilterSelect
          value={filters.issuer}
          onChange={(v) => onFilterChange('issuer', v)}
        />

        <FilterSelect
          label="All Advisors"
          value={filters.advisor}
          options={ADVISOR_OPTIONS}
          onChange={(v) => onFilterChange('advisor', v)}
        />

        <FilterSelect
          label="All Rounds"
          value={filters.round}
          options={ROUND_OPTIONS}
          onChange={(v) => onFilterChange('round', v)}
        />

        {/* Clear filters link */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-brand-gold hover:text-brand-gold-600 font-medium
                       underline underline-offset-2 transition-colors"
          >
            Clear Filters
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-surface-border overflow-hidden">
          <button
            type="button"
            onClick={() => onViewModeChange('kanban')}
            aria-label="Kanban view"
            aria-pressed={viewMode === 'kanban'}
            className={`p-2 transition-colors ${
              viewMode === 'kanban'
                ? 'bg-brand-navy text-white'
                : 'bg-white text-gray-400 hover:text-gray-600'
            }`}
          >
            <KanbanIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
            className={`p-2 transition-colors ${
              viewMode === 'table'
                ? 'bg-brand-navy text-white'
                : 'bg-white text-gray-400 hover:text-gray-600'
            }`}
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

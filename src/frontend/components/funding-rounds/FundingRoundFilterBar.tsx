'use client';

// ============================================================
// FundingRoundFilterBar — Horizontal filter bar with search,
// dropdowns, and view-mode toggle for the funding rounds list.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FundingRoundFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  advisorFilter: string;
  onAdvisorChange: (value: string) => void;
  urgencyFilter: string;
  onUrgencyChange: (value: string) => void;
  viewMode: 'cards' | 'table';
  onViewModeChange: (mode: 'cards' | 'table') => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

// ── Dropdown options ────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'Planning',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;

const ADVISOR_OPTIONS = [
  'Sarah Chen',
  'James Okafor',
  'Marcus Williams',
] as const;

const URGENCY_OPTIONS = [
  { value: 'urgent', label: 'Urgent (<15d)' },
  { value: 'act-soon', label: 'Act Soon (15-60d)' },
  { value: 'clear', label: 'Clear' },
] as const;

// ── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CardsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
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

const CHEVRON_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

interface FilterSelectProps {
  label: string;
  value: string;
  options: readonly string[] | readonly { value: string; label: string }[];
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
      style={{ backgroundImage: CHEVRON_BG }}
    >
      <option value="">{label}</option>
      {options.map((opt) => {
        const isObj = typeof opt === 'object';
        return (
          <option key={isObj ? opt.value : opt} value={isObj ? opt.value : opt}>
            {isObj ? opt.label : opt}
          </option>
        );
      })}
    </select>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function FundingRoundFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  advisorFilter,
  onAdvisorChange,
  urgencyFilter,
  onUrgencyChange,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
  onClearFilters,
}: FundingRoundFilterBarProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search rounds or clients..."
            aria-label="Search rounds or clients"
            className="cf-input !py-1.5 !pl-8 !pr-2.5 !text-xs !rounded-md min-w-[200px]"
          />
        </div>

        {/* Status filter */}
        <FilterSelect
          label="All Statuses"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={onStatusChange}
        />

        {/* Advisor filter */}
        <FilterSelect
          label="All Advisors"
          value={advisorFilter}
          options={ADVISOR_OPTIONS}
          onChange={onAdvisorChange}
        />

        {/* APR Urgency filter */}
        <FilterSelect
          label="All Urgency"
          value={urgencyFilter}
          options={URGENCY_OPTIONS}
          onChange={onUrgencyChange}
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
            onClick={() => onViewModeChange('cards')}
            aria-label="Cards view"
            aria-pressed={viewMode === 'cards'}
            className={`p-2 transition-colors ${
              viewMode === 'cards'
                ? 'bg-brand-navy text-white'
                : 'bg-white text-gray-400 hover:text-gray-600'
            }`}
          >
            <CardsIcon className="w-4 h-4" />
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

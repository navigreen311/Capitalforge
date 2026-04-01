'use client';

// ============================================================
// SpendClientSelector — Client search, date-range presets,
// and card filter for the Spend Governance page.
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpendClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

export interface DateRange {
  label: string;
  from: Date;
  to: Date;
}

export interface SpendClientSelectorProps {
  onClientSelect: (client: SpendClient) => void;
  onClear: () => void;
  selectedClient: SpendClient | null;
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange) => void;
  cardFilter: string;
  onCardFilterChange: (card: string) => void;
}

// ── Static data ─────────────────────────────────────────────────────────────

const PLACEHOLDER_CLIENTS: SpendClient[] = [
  { id: 'sg_001', legal_name: 'Apex Ventures LLC', entity_type: 'LLC', state: 'TX' },
  { id: 'sg_002', legal_name: 'NovaGo Solutions Inc.', entity_type: 'S-Corp', state: 'CA' },
  { id: 'sg_003', legal_name: 'Meridian Holdings LLC', entity_type: 'C-Corp', state: 'NY' },
  { id: 'sg_004', legal_name: 'Brightline Corp', entity_type: 'C-Corp', state: 'FL' },
  { id: 'sg_005', legal_name: 'Thornwood Capital', entity_type: 'LLC', state: 'DE' },
];

const CARD_OPTIONS = [
  'All Cards',
  'Chase Ink Cash',
  'Chase Ink Preferred',
  'Amex Business Platinum',
  'Amex Business Gold',
  'Capital One Spark Cash',
  'Brex 30',
] as const;

// ── Date-range helpers ──────────────────────────────────────────────────────

function makeDateRange(label: string, daysBack: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return { label, from, to };
}

function makeThisMonth(): DateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { label: 'This month', from, to: now };
}

interface DatePreset {
  label: string;
  build: () => DateRange;
}

const DATE_PRESETS: DatePreset[] = [
  { label: 'Last 7d', build: () => makeDateRange('Last 7d', 7) },
  { label: 'Last 30d', build: () => makeDateRange('Last 30d', 30) },
  { label: 'Last 90d', build: () => makeDateRange('Last 90d', 90) },
  { label: 'This month', build: () => makeThisMonth() },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SpendClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
  dateRange,
  onDateRangeChange,
  cardFilter,
  onCardFilterChange,
}: SpendClientSelectorProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = PLACEHOLDER_CLIENTS.filter((c) =>
    c.legal_name.toLowerCase().includes(query.toLowerCase()),
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, []);

  function handleSelect(client: SpendClient) {
    onClientSelect(client);
    setQuery('');
    setIsOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery('');
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
      {/* ── Row 1: Client search ──────────────────────────────────────────── */}
      <div ref={containerRef} className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Client
        </p>

        {!selectedClient && (
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search for a client..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm
                text-gray-100 placeholder-gray-500 outline-none
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-colors"
            />

            {isOpen && (
              <ul
                className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border
                  border-gray-700 bg-gray-800 shadow-xl"
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">No clients found</li>
                ) : (
                  filtered.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(client)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-700
                          focus:bg-gray-700 outline-none transition-colors"
                      >
                        <span className="font-medium text-gray-100">{client.legal_name}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {client.entity_type} &middot; {client.state}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        {selectedClient && (
          <div
            className="inline-flex items-center gap-2 rounded-full border border-gray-700
              bg-gray-800 px-3 py-1.5"
          >
            <span className="text-sm font-medium text-gray-100">
              {selectedClient.legal_name}
            </span>
            <span className="text-xs text-gray-400">
              {selectedClient.entity_type} &middot; {selectedClient.state}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-1 flex-shrink-0 rounded-full p-0.5 text-gray-500 hover:text-gray-300
                hover:bg-gray-700 transition-colors"
              aria-label="Clear selected client"
            >
              &#10005;
            </button>
          </div>
        )}
      </div>

      {/* ── Row 2: Date range presets + Card filter ────────────────────────── */}
      <div className="flex items-end gap-4 flex-wrap">
        {/* Date range presets */}
        <div className="flex-1 min-w-[200px]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Date Range
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DATE_PRESETS.map((preset) => {
              const isActive = dateRange?.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onDateRangeChange(preset.build())}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                    isActive
                      ? 'bg-blue-600 text-white border border-blue-500'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card filter dropdown */}
        <div className="min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Card
          </p>
          <select
            value={cardFilter}
            onChange={(e) => onCardFilterChange(e.target.value)}
            aria-label="Card filter"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm
              text-gray-100 outline-none appearance-none cursor-pointer
              focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-colors
              bg-[length:16px_16px] bg-[right_8px_center] bg-no-repeat pr-8"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            }}
          >
            {CARD_OPTIONS.map((card) => (
              <option key={card} value={card}>
                {card}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

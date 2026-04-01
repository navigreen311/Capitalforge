'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OptimizerClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
  readiness_score: number;
  credit: {
    best_personal_score: number;
    total_limit: number;
    total_balance: number;
    inquiries_90d: number;
  };
  business_credit?: {
    fico_sbss: number;
    paydex: number;
  };
  annual_revenue: number;
  employees: number;
  months_in_business: number;
}

export interface OptimizerClientSelectorProps {
  onClientSelect: (client: OptimizerClient) => void;
  onClear: () => void;
  selectedClient: OptimizerClient | null;
}

// ─── Placeholder clients ─────────────────────────────────────────────────────

const PLACEHOLDER_CLIENTS: OptimizerClient[] = [
  {
    id: 'cli_001',
    legal_name: 'Apex Logistics LLC',
    entity_type: 'LLC',
    state: 'TX',
    readiness_score: 82,
    credit: { best_personal_score: 745, total_limit: 85000, total_balance: 12400, inquiries_90d: 1 },
    business_credit: { fico_sbss: 210, paydex: 78 },
    annual_revenue: 1200000,
    employees: 14,
    months_in_business: 36,
  },
  {
    id: 'cli_002',
    legal_name: 'Bright Horizon Media Inc.',
    entity_type: 'S-Corp',
    state: 'CA',
    readiness_score: 91,
    credit: { best_personal_score: 790, total_limit: 140000, total_balance: 8200, inquiries_90d: 0 },
    business_credit: { fico_sbss: 245, paydex: 85 },
    annual_revenue: 3400000,
    employees: 28,
    months_in_business: 60,
  },
  {
    id: 'cli_003',
    legal_name: 'Cedar & Stone Construction',
    entity_type: 'LLC',
    state: 'FL',
    readiness_score: 67,
    credit: { best_personal_score: 680, total_limit: 42000, total_balance: 19800, inquiries_90d: 3 },
    annual_revenue: 750000,
    employees: 8,
    months_in_business: 24,
  },
  {
    id: 'cli_004',
    legal_name: 'DataPulse Analytics Corp',
    entity_type: 'C-Corp',
    state: 'NY',
    readiness_score: 74,
    credit: { best_personal_score: 720, total_limit: 65000, total_balance: 15600, inquiries_90d: 2 },
    business_credit: { fico_sbss: 190, paydex: 72 },
    annual_revenue: 980000,
    employees: 12,
    months_in_business: 42,
  },
  {
    id: 'cli_005',
    legal_name: 'Evergreen Wellness Spa',
    entity_type: 'Sole Proprietor',
    state: 'CO',
    readiness_score: 55,
    credit: { best_personal_score: 650, total_limit: 22000, total_balance: 9800, inquiries_90d: 4 },
    annual_revenue: 320000,
    employees: 5,
    months_in_business: 18,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function OptimizerClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
}: OptimizerClientSelectorProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = PLACEHOLDER_CLIENTS.filter((c) =>
    c.legal_name.toLowerCase().includes(query.toLowerCase()),
  );

  // Close on click-outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [],
  );

  function handleSelect(client: OptimizerClient) {
    onClientSelect(client);
    setQuery('');
    setIsOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Section label */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Load Client Profile
      </p>

      {/* Search combobox (hidden when a client is selected) */}
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
            placeholder="Search client to auto-populate..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm
              text-gray-100 placeholder-gray-500 outline-none
              focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-colors"
          />

          {/* Dropdown */}
          {isOpen && (
            <ul
              className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border
                border-gray-700 bg-gray-900 shadow-xl"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No clients found</li>
              ) : (
                filtered.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(client)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-800
                        focus:bg-gray-800 outline-none transition-colors"
                    >
                      <span className="font-medium text-gray-100">{client.legal_name}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {client.entity_type} &middot; {client.state} &middot; Readiness {client.readiness_score}/100
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {/* Selected client card */}
      {selectedClient && (
        <div
          className="flex items-center justify-between rounded-lg border border-gray-700
            bg-gray-900 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-100 truncate">
              {selectedClient.legal_name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedClient.entity_type} &middot; {selectedClient.state} &middot;{' '}
              Readiness: {selectedClient.readiness_score}/100
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="ml-3 flex-shrink-0 rounded p-1 text-gray-500 hover:text-gray-300
              hover:bg-gray-800 transition-colors"
            aria-label="Clear selected client"
          >
            &#10005;
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CBClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

export interface CreditBuilderClientSelectorProps {
  onClientSelect: (client: CBClient) => void;
  onClear: () => void;
  selectedClient: CBClient | null;
}

// ─── Mock client data ───────────────────────────────────────────────────────

const MOCK_CLIENTS: CBClient[] = [
  { id: 'cb_001', legal_name: 'Apex Ventures LLC', entity_type: 'LLC', state: 'TX' },
  { id: 'cb_002', legal_name: 'NovaGo Solutions', entity_type: 'S-Corp', state: 'CA' },
  { id: 'cb_003', legal_name: 'Meridian Holdings', entity_type: 'C-Corp', state: 'NY' },
  { id: 'cb_004', legal_name: 'Brightline Corp', entity_type: 'C-Corp', state: 'FL' },
  { id: 'cb_005', legal_name: 'Thornwood Capital', entity_type: 'LLC', state: 'DE' },
  { id: 'cb_006', legal_name: 'Pinnacle Group Inc', entity_type: 'C-Corp', state: 'IL' },
  { id: 'cb_007', legal_name: 'Summit Edge Partners', entity_type: 'LLC', state: 'WA' },
  { id: 'cb_008', legal_name: 'Vanguard Logistics LLC', entity_type: 'LLC', state: 'GA' },
];

// ─── Debounce hook ──────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreditBuilderClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
}: CreditBuilderClientSelectorProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 300ms debounce on the search query
  const debouncedQuery = useDebouncedValue(query, 300);

  const filtered = MOCK_CLIENTS.filter((c) => {
    if (!debouncedQuery) return true; // show all when no query
    const q = debouncedQuery.toLowerCase();
    return (
      c.legal_name.toLowerCase().includes(q) ||
      c.entity_type.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    );
  });

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIdx(-1);
  }, [debouncedQuery]);

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
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[highlightIdx]);
      }
    },
    [filtered, highlightIdx],
  );

  function handleSelect(client: CBClient) {
    onClientSelect(client);
    setQuery('');
    setIsOpen(false);
    setHighlightIdx(-1);
  }

  function handleClear() {
    onClear();
    setQuery('');
    setHighlightIdx(-1);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Section label */}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Viewing Progress For:
      </p>

      {/* Search combobox (hidden when a client is selected) */}
      {!selectedClient && (
        <div className="relative">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
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
              placeholder="Search clients by name, type, or state..."
              aria-label="Search clients"
              aria-expanded={isOpen}
              aria-controls="cb-client-list"
              role="combobox"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-9 pr-3 py-2 text-sm
                text-gray-100 placeholder-gray-500 outline-none
                focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
            />
            {/* Spinner shown while debounce is pending */}
            {query !== debouncedQuery && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 border-2 border-gray-600 border-t-[#C9A84C] rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Dropdown */}
          {isOpen && (
            <ul
              id="cb-client-list"
              role="listbox"
              className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border
                border-gray-700 bg-gray-900 shadow-xl"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No clients found</li>
              ) : (
                filtered.map((client, idx) => (
                  <li key={client.id} role="option" aria-selected={idx === highlightIdx}>
                    <button
                      type="button"
                      onClick={() => handleSelect(client)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full text-left px-3 py-2.5 text-sm outline-none transition-colors
                        ${idx === highlightIdx ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
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

          {/* Empty state message */}
          <div className="mt-4 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-6 text-center">
            <p className="text-sm text-gray-400">
              Select a client to view their Credit Builder progress
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Search above by company name, entity type, or state
            </p>
          </div>
        </div>
      )}

      {/* Selected client pill */}
      {selectedClient && (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30
            bg-[#0A1628] px-3 py-1.5"
        >
          <span className="h-2 w-2 rounded-full bg-[#C9A84C]" />
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

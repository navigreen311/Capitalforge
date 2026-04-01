'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RepaymentClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

export interface RepaymentClientSelectorProps {
  onClientSelect: (client: RepaymentClient) => void;
  onClear: () => void;
  selectedClient: RepaymentClient | null;
}

// ─── Placeholder clients ─────────────────────────────────────────────────────

const PLACEHOLDER_CLIENTS: RepaymentClient[] = [
  { id: 'rp_001', legal_name: 'Summit Ridge Partners', entity_type: 'LLC', state: 'TX' },
  { id: 'rp_002', legal_name: 'Ironclad Industries', entity_type: 'S-Corp', state: 'CA' },
  { id: 'rp_003', legal_name: 'Verdant Growth Co', entity_type: 'C-Corp', state: 'NY' },
  { id: 'rp_004', legal_name: 'Coastline Ventures', entity_type: 'LLC', state: 'FL' },
  { id: 'rp_005', legal_name: 'Pinehurst Capital', entity_type: 'C-Corp', state: 'DE' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function RepaymentClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
}: RepaymentClientSelectorProps) {
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

  function handleSelect(client: RepaymentClient) {
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
        Viewing Repayment For:
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
            placeholder="Search for a client..."
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
                        {client.entity_type} &middot; {client.state}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          {/* Helper text when no client selected */}
          <p className="mt-2 text-xs text-gray-500">
            Select a client above to view their repayment details. Showing example data.
          </p>
        </div>
      )}

      {/* Selected client pill */}
      {selectedClient && (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-gray-700
            bg-gray-900 px-3 py-1.5"
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

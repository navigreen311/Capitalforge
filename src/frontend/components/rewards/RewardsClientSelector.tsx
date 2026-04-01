'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RewardsClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

export interface RewardsClientSelectorProps {
  onClientSelect: (client: RewardsClient) => void;
  onClear: () => void;
  selectedClient: RewardsClient | null;
}

// ─── Placeholder clients ─────────────────────────────────────────────────────

const PLACEHOLDER_CLIENTS: RewardsClient[] = [
  { id: 'rw_001', legal_name: 'Apex Ventures LLC', entity_type: 'LLC', state: 'TX' },
  { id: 'rw_002', legal_name: 'NovaGo Solutions', entity_type: 'S-Corp', state: 'CA' },
  { id: 'rw_003', legal_name: 'Meridian Holdings', entity_type: 'C-Corp', state: 'NY' },
  { id: 'rw_004', legal_name: 'Brightline Corp', entity_type: 'C-Corp', state: 'FL' },
  { id: 'rw_005', legal_name: 'Thornwood Capital', entity_type: 'LLC', state: 'DE' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function RewardsClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
}: RewardsClientSelectorProps) {
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

  function handleSelect(client: RewardsClient) {
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
        Rewards Client
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

          {/* Helper text */}
          <p className="mt-2 text-xs text-gray-500">
            Select a client to view their rewards routing and optimization data.
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

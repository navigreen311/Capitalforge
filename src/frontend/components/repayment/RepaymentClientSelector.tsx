'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

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

// ─── Client source ───────────────────────────────────────────────────────────
//
// Five invented clients used to populate this combobox. Selecting one set a
// name in the page header and nothing else, because no id here matched a real
// business — the repayment view keyed off it could never have loaded.

/** Maps a /api/v1/clients row onto the shape this combobox renders. */
function toRepaymentClient(row: Record<string, unknown>): RepaymentClient | null {
  const id = typeof row['id'] === 'string' ? row['id'] : null;
  if (!id) return null;
  const name = row['businessName'] ?? row['legalName'];
  return {
    id,
    legal_name: typeof name === 'string' && name.trim() !== '' ? name : 'Unnamed business',
    entity_type: typeof row['entityType'] === 'string' ? row['entityType'] : '',
    state: typeof row['state'] === 'string' ? row['state'] : '',
  };
}

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

export function RepaymentClientSelector({
  onClientSelect,
  onClear,
  selectedClient,
}: RepaymentClientSelectorProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  // Debounce the search query by 300ms
  const debouncedQuery = useDebouncedValue(query, 300);

  const [clients, setClients] = useState<RepaymentClient[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const res = await fetch('/api/v1/clients', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = (await res.json()) as { success?: boolean; data?: unknown };
        if (cancelled) return;

        if (!res.ok || json.success !== true || !Array.isArray(json.data)) {
          // An empty combobox that silently shows nothing is indistinguishable
          // from a tenant with no clients, so the failure is kept distinct.
          setLoadState('error');
          return;
        }

        setClients(
          json.data
            .map((row) => toRepaymentClient(row as Record<string, unknown>))
            .filter((c): c is RepaymentClient => c !== null),
        );
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = clients.filter((c) =>
    c.legal_name.toLowerCase().includes(debouncedQuery.toLowerCase()),
  );

  // Auto-select from ?client=X once the real list has arrived.
  useEffect(() => {
    const clientParam = searchParams.get('client');
    if (clientParam && !selectedClient && clients.length > 0) {
      const match = clients.find(
        (c) =>
          c.id === clientParam ||
          c.legal_name.toLowerCase() === clientParam.toLowerCase(),
      );
      if (match) {
        onClientSelect(match);
      }
    }
    // Only run on mount / when searchParams or the loaded list change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, clients]);

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
          <input aria-label="Search for a client"
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
                // Three different reasons for an empty list, kept apart:
                // still loading, the request failed, or this tenant genuinely
                // has no client matching the query.
                <li className="px-3 py-2 text-sm text-gray-500">
                  {loadState === 'loading'
                    ? 'Loading clients…'
                    : loadState === 'error'
                      ? 'Could not load clients. Check that you are signed in, then retry.'
                      : clients.length === 0
                        ? 'No clients on this tenant yet.'
                        : 'No clients match that search.'}
                </li>
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

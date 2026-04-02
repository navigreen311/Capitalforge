'use client';

import React, { useState, useEffect, useRef, useCallback, useId, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_PAGES, type PageEntry } from '@/components/ui/search-palette';

// ─── Mock client data ────────────────────────────────────────────────────────

interface ClientEntry {
  id: string;
  name: string;
  fico: number;
  status: 'Active' | 'Pending' | 'Under Review' | 'Approved' | 'Flagged';
  href: string;
}

const MOCK_CLIENTS: ClientEntry[] = [
  { id: 'cl-001', name: 'Apex Ventures',      fico: 742, status: 'Active',       href: '/clients/cl-001' },
  { id: 'cl-002', name: 'Meridian Holdings',   fico: 698, status: 'Pending',      href: '/clients/cl-002' },
  { id: 'cl-003', name: 'Brightline Corp',     fico: 781, status: 'Approved',     href: '/clients/cl-003' },
  { id: 'cl-004', name: 'Thornwood Capital',    fico: 655, status: 'Under Review', href: '/clients/cl-004' },
  { id: 'cl-005', name: 'Norcal Transport',     fico: 710, status: 'Flagged',      href: '/clients/cl-005' },
];

// ─── Mock application data ───────────────────────────────────────────────────

interface ApplicationEntry {
  id: string;
  label: string;
  client: string;
  amount: string;
  status: 'Draft' | 'Submitted' | 'In Review' | 'Approved' | 'Declined';
  href: string;
}

const MOCK_APPLICATIONS: ApplicationEntry[] = [
  { id: 'app-101', label: 'LOC $500K',   client: 'Apex Ventures',    amount: '$500,000', status: 'In Review',  href: '/applications/app-101' },
  { id: 'app-102', label: 'Term $250K',  client: 'Meridian Holdings', amount: '$250,000', status: 'Submitted', href: '/applications/app-102' },
  { id: 'app-103', label: 'SBA 7(a)',    client: 'Brightline Corp',   amount: '$750,000', status: 'Approved',  href: '/applications/app-103' },
  { id: 'app-104', label: 'Bridge $120K',client: 'Thornwood Capital', amount: '$120,000', status: 'Draft',     href: '/applications/app-104' },
  { id: 'app-105', label: 'LOC $310K',   client: 'Norcal Transport',  amount: '$310,000', status: 'Declined',  href: '/applications/app-105' },
];

// ─── Result types ────────────────────────────────────────────────────────────

type ResultItem =
  | { group: 'Clients'; data: ClientEntry }
  | { group: 'Applications'; data: ApplicationEntry }
  | { group: 'Pages'; data: PageEntry };

// ─── Search / filter helpers ─────────────────────────────────────────────────

function matchClient(q: string, c: ClientEntry): boolean {
  return c.name.toLowerCase().includes(q) || c.status.toLowerCase().includes(q);
}

function matchApplication(q: string, a: ApplicationEntry): boolean {
  const haystack = `${a.label} ${a.client} ${a.amount} ${a.status}`.toLowerCase();
  return haystack.includes(q);
}

function matchPage(q: string, p: PageEntry): boolean {
  const haystack = `${p.label} ${p.section} ${p.keywords ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

function buildResults(query: string): ResultItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const clients = MOCK_CLIENTS.filter((c) => matchClient(q, c)).map(
    (data): ResultItem => ({ group: 'Clients', data }),
  );
  const applications = MOCK_APPLICATIONS.filter((a) => matchApplication(q, a)).map(
    (data): ResultItem => ({ group: 'Applications', data }),
  );
  const pages = ALL_PAGES.filter((p) => matchPage(q, p))
    .slice(0, 8)
    .map((data): ResultItem => ({ group: 'Pages', data }));

  return [...clients, ...applications, ...pages];
}

// ─── Status badge colors ────────────────────────────────────────────────────

const CLIENT_STATUS_COLORS: Record<ClientEntry['status'], string> = {
  Active:       'bg-emerald-500/15 text-emerald-400',
  Pending:      'bg-amber-500/15 text-amber-400',
  'Under Review':'bg-blue-500/15 text-blue-400',
  Approved:     'bg-teal-500/15 text-teal-400',
  Flagged:      'bg-red-500/15 text-red-400',
};

const APP_STATUS_COLORS: Record<ApplicationEntry['status'], string> = {
  Draft:      'bg-gray-500/15 text-gray-400',
  Submitted:  'bg-blue-500/15 text-blue-400',
  'In Review':'bg-amber-500/15 text-amber-400',
  Approved:   'bg-emerald-500/15 text-emerald-400',
  Declined:   'bg-red-500/15 text-red-400',
};

// ─── CommandPalette ──────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const router = useRouter();

  // Debounce query by 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => buildResults(debouncedQuery), [debouncedQuery]);

  // Focus & reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [debouncedQuery]);

  // Scroll active item into view
  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-result-item]');
    const el = items?.[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const navigateTo = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const getHref = (item: ResultItem): string => {
    if (item.group === 'Clients') return item.data.href;
    if (item.group === 'Applications') return item.data.href;
    return item.data.href;
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && results[activeIdx]) {
        e.preventDefault();
        navigateTo(getHref(results[activeIdx]));
      }
    },
    [results, activeIdx, onClose, navigateTo],
  );

  if (!open) return null;

  // Group results for rendering with section headers
  const grouped: { group: string; items: { item: ResultItem; globalIdx: number }[] }[] = [];
  let currentGroup = '';
  results.forEach((item, idx) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      grouped.push({ group: currentGroup, items: [] });
    }
    grouped[grouped.length - 1].items.push({ item, globalIdx: idx });
  });

  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Palette panel */}
      <div
        className="relative z-10 w-full max-w-xl bg-[#0F1A2E] rounded-2xl shadow-2xl
                   border border-white/10 overflow-hidden animate-fade-in"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-white/10">
          <svg
            aria-hidden="true"
            className="flex-shrink-0 w-4 h-4 text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={results[activeIdx] ? `cmd-item-${activeIdx}` : undefined}
            placeholder="Search clients, applications, pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 py-4 text-sm text-white placeholder-gray-500
                       bg-transparent border-none outline-none"
          />

          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded
                       text-[10px] font-mono text-gray-500
                       border border-white/10 bg-white/5"
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="max-h-[380px] overflow-y-auto"
        >
          {hasQuery && results.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No results for &ldquo;<span className="text-gray-300">{debouncedQuery}</span>&rdquo;
            </div>
          )}

          {grouped.map((section) => (
            <div key={section.group}>
              {/* Section header */}
              <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {section.group}
              </div>

              {section.items.map(({ item, globalIdx }) => (
                <div
                  key={`${item.group}-${globalIdx}`}
                  id={`cmd-item-${globalIdx}`}
                  role="option"
                  aria-selected={globalIdx === activeIdx}
                  data-result-item
                  onMouseEnter={() => setActiveIdx(globalIdx)}
                  onClick={() => navigateTo(getHref(item))}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 cursor-pointer
                    transition-colors duration-75 text-sm
                    ${globalIdx === activeIdx
                      ? 'bg-brand-gold/15 text-white'
                      : 'text-gray-300 hover:bg-white/5'}
                  `}
                >
                  {item.group === 'Clients' && (
                    <>
                      <span className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400
                                       text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        CL
                      </span>
                      <span className="flex-1 font-medium truncate">{item.data.name}</span>
                      <span className="text-xs text-gray-500 tabular-nums">FICO {(item.data as ClientEntry).fico}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CLIENT_STATUS_COLORS[(item.data as ClientEntry).status]}`}>
                        {(item.data as ClientEntry).status}
                      </span>
                    </>
                  )}

                  {item.group === 'Applications' && (
                    <>
                      <span className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400
                                       text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        AP
                      </span>
                      <span className="flex-1 font-medium truncate">
                        {(item.data as ApplicationEntry).label}
                        <span className="text-gray-500 ml-1.5">{(item.data as ApplicationEntry).client}</span>
                      </span>
                      <span className="text-xs text-gray-500">{(item.data as ApplicationEntry).amount}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${APP_STATUS_COLORS[(item.data as ApplicationEntry).status]}`}>
                        {(item.data as ApplicationEntry).status}
                      </span>
                    </>
                  )}

                  {item.group === 'Pages' && (
                    <>
                      <span className="w-7 h-7 rounded-lg bg-white/10 text-gray-400
                                       text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        PG
                      </span>
                      <span className="flex-1 font-medium truncate">{(item.data as PageEntry).label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/5 text-gray-500">
                        {(item.data as PageEntry).section}
                      </span>
                    </>
                  )}

                  {globalIdx === activeIdx && (
                    <kbd className="hidden sm:inline-flex items-center px-1 py-0.5 rounded
                                   text-[10px] font-mono bg-white/10 text-gray-400
                                   border border-white/10 flex-shrink-0">
                      ↵
                    </kbd>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/10
                        bg-white/[0.03] text-[10px] text-gray-500 select-none">
          <span className="flex items-center gap-1">
            <kbd className="border border-white/10 rounded px-1 py-0.5 font-mono bg-white/5">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-white/10 rounded px-1 py-0.5 font-mono bg-white/5">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-white/10 rounded px-1 py-0.5 font-mono bg-white/5">Esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: useCommandPalette ─────────────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, openPalette, closePalette };
}

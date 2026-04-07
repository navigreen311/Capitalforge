'use client';

import React, { useState, useEffect, useRef, useCallback, useId, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_PAGES, type PageEntry } from '@/components/ui/search-palette';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClientEntry {
  id: string;
  legalName: string;
  dba: string;
  status: 'Active' | 'Pending' | 'Under Review' | 'Approved' | 'Flagged';
  href: string;
}

interface ApplicationEntry {
  id: string;
  issuer: string;
  cardProduct: string;
  client: string;
  amount: string;
  status: 'Draft' | 'Submitted' | 'In Review' | 'Approved' | 'Declined';
  href: string;
}

interface FundingRoundEntry {
  id: string;
  name: string;
  totalAmount: string;
  status: 'Open' | 'Closed' | 'In Progress';
  href: string;
}

interface QuickAction {
  label: string;
  href: string;
  icon: string;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_CLIENTS: ClientEntry[] = [
  { id: 'cl-001', legalName: 'Apex Ventures LLC',     dba: 'Apex Ventures',    status: 'Active',       href: '/clients/cl-001' },
  { id: 'cl-002', legalName: 'Meridian Holdings Inc',  dba: 'Meridian',         status: 'Pending',      href: '/clients/cl-002' },
  { id: 'cl-003', legalName: 'Brightline Corp',        dba: 'Brightline',       status: 'Approved',     href: '/clients/cl-003' },
  { id: 'cl-004', legalName: 'Thornwood Capital LLC',   dba: 'Thornwood',        status: 'Under Review', href: '/clients/cl-004' },
  { id: 'cl-005', legalName: 'Norcal Transport Inc',    dba: 'Norcal',           status: 'Flagged',      href: '/clients/cl-005' },
];

const MOCK_APPLICATIONS: ApplicationEntry[] = [
  { id: 'app-101', issuer: 'Chase',      cardProduct: 'Ink Business Preferred', client: 'Apex Ventures',    amount: '$500,000', status: 'In Review',  href: '/applications/app-101' },
  { id: 'app-102', issuer: 'Amex',       cardProduct: 'Business Gold',          client: 'Meridian Holdings', amount: '$250,000', status: 'Submitted', href: '/applications/app-102' },
  { id: 'app-103', issuer: 'Capital One', cardProduct: 'Spark Cash Plus',       client: 'Brightline Corp',   amount: '$750,000', status: 'Approved',  href: '/applications/app-103' },
  { id: 'app-104', issuer: 'US Bank',    cardProduct: 'Business Leverage',      client: 'Thornwood Capital', amount: '$120,000', status: 'Draft',     href: '/applications/app-104' },
  { id: 'app-105', issuer: 'Citi',       cardProduct: 'Business AA Advantage',  client: 'Norcal Transport',  amount: '$310,000', status: 'Declined',  href: '/applications/app-105' },
];

const MOCK_FUNDING_ROUNDS: FundingRoundEntry[] = [
  { id: 'fr-001', name: 'Series A Stack',         totalAmount: '$2.1M',  status: 'Open',        href: '/funding-rounds/fr-001' },
  { id: 'fr-002', name: 'Bridge Round',            totalAmount: '$800K',  status: 'In Progress', href: '/funding-rounds/fr-002' },
  { id: 'fr-003', name: 'Credit Line Consolidation',totalAmount: '$1.5M', status: 'Closed',      href: '/funding-rounds/fr-003' },
];

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Client',      href: '/clients/new',      icon: '+C' },
  { label: 'New Application', href: '/applications/new',  icon: '+A' },
];

// ─── Result types ───────────────────────────────────────────────────────────

type ResultItem =
  | { group: 'Quick Actions'; data: QuickAction }
  | { group: 'Recent'; data: { label: string; href: string } }
  | { group: 'Businesses'; data: ClientEntry }
  | { group: 'Applications'; data: ApplicationEntry }
  | { group: 'Funding Rounds'; data: FundingRoundEntry }
  | { group: 'Pages'; data: PageEntry };

// ─── localStorage helpers ───────────────────────────────────────────────────

const RECENT_KEY = 'cf_cmd_recent';
const MAX_RECENT = 5;

function getRecentSearches(): { label: string; href: string }[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(label: string, href: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches().filter((r) => r.href !== href);
    recent.unshift({ label, href });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

// ─── Search helpers ─────────────────────────────────────────────────────────

function matchClient(q: string, c: ClientEntry): boolean {
  const hay = `${c.legalName} ${c.dba} ${c.status}`.toLowerCase();
  return hay.includes(q);
}

function matchApp(q: string, a: ApplicationEntry): boolean {
  const hay = `${a.issuer} ${a.cardProduct} ${a.client} ${a.amount} ${a.status}`.toLowerCase();
  return hay.includes(q);
}

function matchRound(q: string, r: FundingRoundEntry): boolean {
  const hay = `${r.name} ${r.totalAmount} ${r.status}`.toLowerCase();
  return hay.includes(q);
}

function matchPage(q: string, p: PageEntry): boolean {
  const hay = `${p.label} ${p.section} ${p.keywords ?? ''}`.toLowerCase();
  return hay.includes(q);
}

function buildResults(query: string): ResultItem[] {
  const q = query.toLowerCase().trim();

  // No query -> show quick actions + recent searches
  if (!q) {
    const actions: ResultItem[] = QUICK_ACTIONS.map((data) => ({ group: 'Quick Actions', data }));
    const recent: ResultItem[] = getRecentSearches().map((data) => ({ group: 'Recent', data }));
    return [...actions, ...recent];
  }

  const businesses = MOCK_CLIENTS.filter((c) => matchClient(q, c)).map(
    (data): ResultItem => ({ group: 'Businesses', data }),
  );
  const applications = MOCK_APPLICATIONS.filter((a) => matchApp(q, a)).map(
    (data): ResultItem => ({ group: 'Applications', data }),
  );
  const rounds = MOCK_FUNDING_ROUNDS.filter((r) => matchRound(q, r)).map(
    (data): ResultItem => ({ group: 'Funding Rounds', data }),
  );
  const pages = ALL_PAGES.filter((p) => matchPage(q, p))
    .slice(0, 6)
    .map((data): ResultItem => ({ group: 'Pages', data }));

  return [...businesses, ...applications, ...rounds, ...pages];
}

// ─── Status colors ──────────────────────────────────────────────────────────

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

const ROUND_STATUS_COLORS: Record<FundingRoundEntry['status'], string> = {
  Open:         'bg-emerald-500/15 text-emerald-400',
  'In Progress':'bg-amber-500/15 text-amber-400',
  Closed:       'bg-gray-500/15 text-gray-400',
};

// ─── Group icon map ─────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, { label: string; bg: string; color: string }> = {
  'Quick Actions':   { label: '>>',  bg: 'bg-brand-gold/20',   color: 'text-brand-gold' },
  'Recent':          { label: 'RC',  bg: 'bg-white/10',        color: 'text-gray-400' },
  'Businesses':      { label: 'BZ',  bg: 'bg-blue-500/15',     color: 'text-blue-400' },
  'Applications':    { label: 'AP',  bg: 'bg-purple-500/15',   color: 'text-purple-400' },
  'Funding Rounds':  { label: 'FR',  bg: 'bg-teal-500/15',     color: 'text-teal-400' },
  'Pages':           { label: 'PG',  bg: 'bg-white/10',        color: 'text-gray-400' },
};

// ─── CommandPalette component ───────────────────────────────────────────────

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

  // Debounce 150ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
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

  // Reset index on result change
  useEffect(() => { setActiveIdx(0); }, [debouncedQuery]);

  // Scroll active into view
  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-result-item]');
    const el = items?.[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const getHref = (item: ResultItem): string => {
    return item.data.href;
  };

  const getLabel = (item: ResultItem): string => {
    if (item.group === 'Quick Actions') return item.data.label;
    if (item.group === 'Recent') return item.data.label;
    if (item.group === 'Businesses') return item.data.legalName;
    if (item.group === 'Applications') return `${item.data.issuer} ${item.data.cardProduct}`;
    if (item.group === 'Funding Rounds') return item.data.name;
    return item.data.label;
  };

  const navigateTo = useCallback(
    (item: ResultItem) => {
      const href = getHref(item);
      const label = getLabel(item);
      if (item.group !== 'Quick Actions' && item.group !== 'Recent') {
        addRecentSearch(label, href);
      }
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

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
        navigateTo(results[activeIdx]);
      }
    },
    [results, activeIdx, onClose, navigateTo],
  );

  if (!open) return null;

  // Group results for section headers
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[12vh] px-3 sm:px-4"
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
            placeholder="Search businesses, applications, funding rounds, pages..."
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

          {grouped.map((section) => {
            const iconCfg = GROUP_ICONS[section.group] ?? GROUP_ICONS['Pages'];
            return (
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
                    onClick={() => navigateTo(item)}
                    className={`
                      flex items-center gap-3 px-4 py-2.5 cursor-pointer
                      transition-colors duration-75 text-sm
                      ${globalIdx === activeIdx
                        ? 'bg-brand-gold/15 text-white'
                        : 'text-gray-300 hover:bg-white/5'}
                    `}
                  >
                    {/* Icon */}
                    <span className={`w-7 h-7 rounded-lg ${iconCfg.bg} ${iconCfg.color}
                                     text-[9px] font-bold flex items-center justify-center flex-shrink-0`}>
                      {iconCfg.label}
                    </span>

                    {/* Content */}
                    {item.group === 'Quick Actions' && (
                      <span className="flex-1 font-medium truncate">{item.data.label}</span>
                    )}

                    {item.group === 'Recent' && (
                      <span className="flex-1 font-medium truncate">{item.data.label}</span>
                    )}

                    {item.group === 'Businesses' && (
                      <>
                        <span className="flex-1 font-medium truncate">
                          {item.data.legalName}
                          {item.data.dba !== item.data.legalName && (
                            <span className="text-gray-500 ml-1.5">({item.data.dba})</span>
                          )}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CLIENT_STATUS_COLORS[item.data.status]}`}>
                          {item.data.status}
                        </span>
                      </>
                    )}

                    {item.group === 'Applications' && (
                      <>
                        <span className="flex-1 font-medium truncate">
                          {item.data.issuer} — {item.data.cardProduct}
                          <span className="text-gray-500 ml-1.5">{item.data.client}</span>
                        </span>
                        <span className="text-xs text-gray-500">{item.data.amount}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${APP_STATUS_COLORS[item.data.status]}`}>
                          {item.data.status}
                        </span>
                      </>
                    )}

                    {item.group === 'Funding Rounds' && (
                      <>
                        <span className="flex-1 font-medium truncate">{item.data.name}</span>
                        <span className="text-xs text-gray-500">{item.data.totalAmount}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ROUND_STATUS_COLORS[item.data.status]}`}>
                          {item.data.status}
                        </span>
                      </>
                    )}

                    {item.group === 'Pages' && (
                      <>
                        <span className="flex-1 font-medium truncate">{item.data.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/5 text-gray-500">
                          {item.data.section}
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
            );
          })}
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

// ─── Hook: useCommandPalette ────────────────────────────────────────────────

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

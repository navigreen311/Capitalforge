'use client';

import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import Link from 'next/link';

// ─── All navigable pages ──────────────────────────────────────────────────────

export interface PageEntry {
  label: string;
  href: string;
  section: string;
  keywords?: string;
}

export const ALL_PAGES: PageEntry[] = [
  // Core Operations
  { label: 'Dashboard',       href: '/',                  section: 'Core Operations' },
  { label: 'Clients',         href: '/clients',           section: 'Core Operations' },
  { label: 'Applications',    href: '/applications',      section: 'Core Operations' },
  { label: 'Funding Rounds',  href: '/funding-rounds',    section: 'Core Operations' },
  { label: 'Optimizer',       href: '/optimizer',         section: 'Core Operations', keywords: 'credit intelligence optimize' },
  { label: 'Declines',        href: '/declines',          section: 'Core Operations', keywords: 'declined rejected' },
  { label: 'Credit Builder',  href: '/credit-builder',    section: 'Core Operations', keywords: 'build score' },

  // Financial Control
  { label: 'Repayment',       href: '/repayment',         section: 'Financial Control', keywords: 'payment pay back' },
  { label: 'Spend Governance',href: '/spend-governance',  section: 'Financial Control', keywords: 'spending limits controls' },
  { label: 'Rewards',         href: '/rewards',           section: 'Financial Control', keywords: 'points cashback benefits' },
  { label: 'Card Benefits',   href: '/card-benefits',     section: 'Financial Control', keywords: 'cards perks' },
  { label: 'Statements',      href: '/statements',        section: 'Financial Control', keywords: 'account history' },
  { label: 'Billing',         href: '/billing',           section: 'Financial Control', keywords: 'invoice payment' },
  { label: 'Tax',             href: '/tax',               section: 'Financial Control', keywords: 'taxes 1099' },
  { label: 'Simulator',       href: '/simulator',         section: 'Financial Control', keywords: 'simulate model scenario' },
  { label: 'Sandbox',         href: '/sandbox',           section: 'Financial Control', keywords: 'test testing dev' },
  { label: 'Hardship',        href: '/hardship',          section: 'Financial Control', keywords: 'hardship relief deferral' },
  { label: 'Tax Docs',        href: '/financial-control/tax',       section: 'Financial Control', keywords: 'tax documents 1099 annual summary export' },
  { label: 'Scenario Sim',    href: '/financial-control/simulator', section: 'Financial Control', keywords: 'scenario funding simulator compare projection' },
  { label: 'Hardship Mgr',    href: '/financial-control/hardship',  section: 'Financial Control', keywords: 'hardship case manager workout resolution' },

  // Compliance
  { label: 'Compliance',      href: '/compliance',        section: 'Compliance', keywords: 'regulatory rules' },
  { label: 'Documents',       href: '/documents',         section: 'Compliance', keywords: 'files uploads' },
  { label: 'Contracts',       href: '/contracts',         section: 'Compliance', keywords: 'agreements legal' },
  { label: 'Disclosures',     href: '/disclosures',       section: 'Compliance', keywords: 'notices disclosures' },
  { label: 'Complaints',      href: '/complaints',        section: 'Compliance', keywords: 'dispute grievance' },
  { label: 'Regulatory',      href: '/regulatory',        section: 'Compliance', keywords: 'regulation law' },
  { label: 'Comm Compliance', href: '/comm-compliance',   section: 'Compliance', keywords: 'communication marketing compliance' },
  { label: 'Training',        href: '/training',          section: 'Compliance', keywords: 'learn courses education' },
  { label: 'Deal Committee',  href: '/deal-committee',    section: 'Compliance', keywords: 'committee review deals' },
  { label: 'Decisions',       href: '/decisions',         section: 'Compliance', keywords: 'approval denial outcome' },
  { label: 'Fair Lending',    href: '/fair-lending',      section: 'Compliance', keywords: 'ECOA fair lending disparate impact' },
  { label: 'AI Governance',   href: '/ai-governance',     section: 'Compliance', keywords: 'model risk AI ML explainability' },

  // Platform
  { label: 'CRM',             href: '/crm',               section: 'Platform', keywords: 'customer relationship management contacts' },
  { label: 'Portfolio',       href: '/portfolio',         section: 'Platform', keywords: 'portfolio loans assets' },
  { label: 'Partners',        href: '/partners',          section: 'Platform', keywords: 'channel partner broker' },
  { label: 'Referrals',       href: '/referrals',         section: 'Platform', keywords: 'refer affiliate' },
  { label: 'Issuers',         href: '/issuers',           section: 'Platform', keywords: 'card issuer bank' },
  { label: 'Workflows',       href: '/workflows',         section: 'Platform', keywords: 'automation process flow' },
  { label: 'Settings',        href: '/settings',          section: 'Platform', keywords: 'configuration preferences' },
  { label: 'Reports',         href: '/reports',           section: 'Platform', keywords: 'analytics export data' },
  { label: 'Multi-Tenant',    href: '/multi-tenant',      section: 'Platform', keywords: 'tenants organizations white label' },
  { label: 'Offboarding',     href: '/offboarding',       section: 'Platform', keywords: 'close account exit' },
  { label: 'Data Lineage',    href: '/data-lineage',      section: 'Platform', keywords: 'data pipeline audit trail' },
];

// ─── Fuzzy search ──────────────────────────────────────────────────────────────

function fuzzyMatch(query: string, entry: PageEntry): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = `${entry.label} ${entry.section} ${entry.keywords ?? ''}`.toLowerCase();
  // Allow non-contiguous character matching (simple fuzzy)
  let qi = 0;
  for (let i = 0; i < haystack.length && qi < q.length; i++) {
    if (haystack[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function scoreMatch(query: string, entry: PageEntry): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const label = entry.label.toLowerCase();
  // Exact match in label gets highest priority
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  // Section or keyword match
  const kw = `${entry.section} ${entry.keywords ?? ''}`.toLowerCase();
  if (kw.includes(q)) return 30;
  return 10;
}

// ─── SearchPalette component ──────────────────────────────────────────────────

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const results = ALL_PAGES
    .filter((p) => fuzzyMatch(query, p))
    .sort((a, b) => scoreMatch(query, b) - scoreMatch(query, a))
    .slice(0, 12);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // rAF ensures the element is visible before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index on results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const li = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    li?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

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
        // Navigate via anchor click
        const link = listRef.current?.children[activeIdx]?.querySelector('a') as HTMLAnchorElement | null;
        link?.click();
      }
    },
    [results, activeIdx, onClose],
  );

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quick navigation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Palette panel */}
      <div
        className="
          relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl
          border border-surface-border overflow-hidden
          animate-fade-in
        "
        onKeyDown={handleKeyDown}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 border-b border-surface-border">
          {/* Magnifier icon */}
          <svg
            aria-hidden="true"
            className="flex-shrink-0 w-4 h-4 text-gray-400"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
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
            aria-activedescendant={results[activeIdx] ? `palette-item-${activeIdx}` : undefined}
            placeholder="Go to page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="
              flex-1 py-4 text-sm text-gray-900 placeholder-gray-400
              bg-transparent border-none outline-none
            "
          />

          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded
                       text-[10px] font-mono text-gray-400
                       border border-surface-border bg-surface"
          >
            Esc
          </kbd>
        </div>

        {/* Results list */}
        {results.length > 0 ? (
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label="Navigation results"
            className="max-h-[320px] overflow-y-auto py-1.5"
          >
            {results.map((entry, idx) => (
              <li
                key={entry.href}
                id={`palette-item-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
              >
                <Link
                  href={entry.href}
                  onClick={onClose}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-100
                    ${idx === activeIdx
                      ? 'bg-brand-navy text-white'
                      : 'text-gray-700 hover:bg-surface-overlay'}
                  `}
                >
                  {/* Page label */}
                  <span className="flex-1 font-medium truncate">{entry.label}</span>
                  {/* Section badge */}
                  <span
                    className={`
                      flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium
                      ${idx === activeIdx
                        ? 'bg-white/15 text-white/80'
                        : 'bg-surface-overlay text-gray-400'}
                    `}
                  >
                    {entry.section}
                  </span>
                  {/* Enter hint */}
                  {idx === activeIdx && (
                    <kbd
                      className="hidden sm:inline-flex items-center px-1 py-0.5 rounded
                                 text-[10px] font-mono bg-white/15 text-white/80
                                 border border-white/20"
                    >
                      ↵
                    </kbd>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No pages match <span className="font-medium text-gray-600">&ldquo;{query}&rdquo;</span>
          </div>
        )}

        {/* Footer hint */}
        <div
          className="
            flex items-center gap-4 px-4 py-2.5 border-t border-surface-border
            bg-surface text-[10px] text-gray-400 select-none
          "
        >
          <span className="flex items-center gap-1">
            <kbd className="border border-surface-border rounded px-1 py-0.5 font-mono bg-white">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-surface-border rounded px-1 py-0.5 font-mono bg-white">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-surface-border rounded px-1 py-0.5 font-mono bg-white">Esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: useSearchPalette ────────────────────────────────────────────────────

/**
 * Manages open/close state and registers the Cmd+K / Ctrl+K global shortcut.
 *
 * Usage:
 *   const { open, openPalette, closePalette } = useSearchPalette();
 */
export function useSearchPalette() {
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

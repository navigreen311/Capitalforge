'use client';

// ============================================================
// EligibilityCalendarEnhanced — Reapply Eligibility Calendar
//
// Displays declined card applications with progress bars,
// alert bell toggles (persisted to localStorage), issuer
// recon phone numbers, and reapply dropdown for eligible items.
// Dark-themed section card component.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CalendarItem {
  id: string;
  issuer: string;
  cardProduct: string;
  businessName: string;
  declinedDate: string;
  eligibleDate: string;
  daysRemaining: number;
  eligible: boolean;
}

export interface EligibilityCalendarEnhancedProps {
  items: CalendarItem[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cf_decline_alerts';

const RECON_LINES: Record<string, string> = {
  'Chase':              '1-888-270-2127',
  'American Express':   '1-800-567-1083',
  'Amex':               '1-800-567-1083',
  'Capital One':        '1-800-625-7866',
  'Citi':               '1-800-695-5171',
  'Citibank':           '1-800-695-5171',
  'Bank of America':    '1-866-224-8555',
  'Barclays':           '1-866-408-4064',
  'Discover':           '1-800-347-2683',
  'Wells Fargo':        '1-800-967-9521',
  'US Bank':            '1-800-947-1444',
  'Synchrony':          '1-866-419-4096',
  'TD Bank':            '1-888-561-8861',
  'PNC':                '1-888-762-2265',
  'HSBC':               '1-800-975-4722',
  'Navy Federal':       '1-888-842-6328',
  'USAA':               '1-800-531-8722',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadAlerts(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveAlerts(alerts: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...alerts]));
}

function getProgressColor(daysRemaining: number, eligible: boolean): string {
  if (eligible) return 'bg-emerald-500';
  if (daysRemaining <= 30) return 'bg-amber-400';
  if (daysRemaining <= 90) return 'bg-yellow-500';
  return 'bg-blue-500';
}

function getProgressPercent(daysRemaining: number, eligible: boolean): number {
  if (eligible) return 100;
  // Assume a 365-day max window; clamp to 5–95 range for visual clarity
  const pct = Math.max(5, Math.min(95, ((365 - daysRemaining) / 365) * 100));
  return pct;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getReconPhone(issuer: string): string | undefined {
  return RECON_LINES[issuer] ?? Object.entries(RECON_LINES).find(
    ([key]) => issuer.toLowerCase().includes(key.toLowerCase()),
  )?.[1];
}

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.daysRemaining - b.daysRemaining;
  });
}

// ── Reapply Dropdown ────────────────────────────────────────────────────────

function ReapplyDropdown({ item }: { item: CalendarItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const optimizerHref = `/optimizer?issuer=${encodeURIComponent(item.issuer)}`;
  const applyHref = `/applications/new?issuer=${encodeURIComponent(item.issuer)}&card=${encodeURIComponent(item.cardProduct)}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white
                   hover:bg-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        aria-haspopup="true"
        aria-expanded={open}
      >
        Reapply
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-700
                     bg-gray-800 py-1 shadow-xl animate-in fade-in slide-in-from-top-1"
          role="menu"
        >
          <a
            href={optimizerHref}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg className="h-4 w-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Re-run via Optimizer
          </a>
          <a
            href={applyHref}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Apply Directly
          </a>
        </div>
      )}
    </div>
  );
}

// ── Alert Bell ──────────────────────────────────────────────────────────────

function AlertBell({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="rounded p-1 transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      title={active ? 'Disable alert' : 'Enable alert'}
      aria-label={active ? 'Disable reapply alert' : 'Enable reapply alert'}
    >
      {active ? (
        // Filled gold bell
        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.85 3.5a.75.75 0 00-1.117-1 9.719 9.719 0 00-2.348 4.876.75.75 0 001.479.248A8.219 8.219 0 015.85 3.5zM19.267 2.5a.75.75 0 10-1.118 1 8.22 8.22 0 011.987 4.124.75.75 0 001.48-.248A9.72 9.72 0 0019.266 2.5z" />
          <path fillRule="evenodd" d="M12 2.25A6.75 6.75 0 005.25 9v.75a8.217 8.217 0 01-2.119 5.52.75.75 0 00.298 1.206c1.544.57 3.16.99 4.831 1.243a3.75 3.75 0 007.48 0 24.583 24.583 0 004.83-1.244.75.75 0 00.298-1.205 8.217 8.217 0 01-2.118-5.52V9A6.75 6.75 0 0012 2.25zM9.75 18c0-.034 0-.067.002-.1a25.05 25.05 0 004.496 0l.002.1a2.25 2.25 0 01-4.5 0z" clipRule="evenodd" />
        </svg>
      ) : (
        // Outline gray bell
        <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      )}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function EligibilityCalendarEnhanced({ items }: EligibilityCalendarEnhancedProps) {
  const [alerts, setAlerts] = useState<Set<string>>(() => loadAlerts());

  const toggleAlert = useCallback((id: string) => {
    setAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveAlerts(next);
      return next;
    });
  }, []);

  const sorted = useMemo(() => sortItems(items), [items]);

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="text-base font-semibold text-gray-100">Reapply Eligibility Calendar</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3" aria-hidden="true">📅</span>
          <p className="text-sm text-gray-400">No declined applications to track.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-700">
        <h3 className="text-base font-semibold text-gray-100">Reapply Eligibility Calendar</h3>
        <span className="text-xs text-gray-500">{sorted.length} item{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-800">
        {sorted.map((item) => {
          const phone = getReconPhone(item.issuer);
          const progressPct = getProgressPercent(item.daysRemaining, item.eligible);
          const progressColor = getProgressColor(item.daysRemaining, item.eligible);

          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 hover:bg-gray-800/50 transition-colors"
            >
              {/* Issuer + business name */}
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-medium text-gray-100">{item.issuer}</p>
                <p className="text-xs text-gray-400 truncate">{item.businessName} &middot; {item.cardProduct}</p>
              </div>

              {/* Progress bar */}
              <div className="w-32 flex-shrink-0">
                <div className="h-2 w-full rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {!item.eligible && (
                  <p className="mt-1 text-[10px] text-gray-500">{item.daysRemaining}d remaining</p>
                )}
              </div>

              {/* Date / status */}
              <div className="w-28 flex-shrink-0 text-right">
                {item.eligible ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    Eligible Now
                  </span>
                ) : (
                  <p className="text-xs text-gray-400">{formatDate(item.eligibleDate)}</p>
                )}
              </div>

              {/* Alert bell */}
              <AlertBell
                active={alerts.has(item.id)}
                onToggle={() => toggleAlert(item.id)}
              />

              {/* Phone number */}
              <div className="w-32 flex-shrink-0">
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    title={`${item.issuer} reconsideration line`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {phone}
                  </a>
                ) : (
                  <span className="text-xs text-gray-600">--</span>
                )}
              </div>

              {/* Reapply dropdown (only for eligible items) */}
              <div className="w-24 flex-shrink-0 flex justify-end">
                {item.eligible ? (
                  <ReapplyDropdown item={item} />
                ) : (
                  <span className="text-xs text-gray-600">--</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SetupChecklist — New-tenant onboarding checklist
// Persistent checklist shown on dashboard for new tenants.
// State stored in localStorage. Dismissable.
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  /** If true, this item is always checked and cannot be toggled */
  alwaysChecked?: boolean;
}

// ─── Data ───────────────────────────────────────────────────

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'account-created',   label: 'Account created',              href: '#',              alwaysChecked: true },
  { id: 'add-first-client',  label: 'Add your first client',        href: '/clients/new' },
  { id: 'pull-credit',       label: 'Pull their credit report',     href: '/clients' },
  { id: 'run-optimizer',     label: 'Run the Stacking Optimizer',   href: '/optimizer' },
  { id: 'configure-fees',    label: 'Configure fee structure',      href: '/settings' },
  { id: 'invite-team',       label: 'Invite a team member',         href: '/settings' },
  { id: 'complete-compliance', label: 'Complete compliance setup',   href: '/compliance' },
];

const STORAGE_KEY = 'cf_onboarding_checklist';
const DISMISSED_KEY = 'cf_onboarding_dismissed';

// ─── Helpers ────────────────────────────────────────────────

function loadCheckedItems(): Set<string> {
  if (typeof window === 'undefined') return new Set(['account-created']);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: string[] = raw ? JSON.parse(raw) : [];
    const set = new Set(parsed);
    set.add('account-created'); // always checked
    return set;
  } catch {
    return new Set(['account-created']);
  }
}

function loadDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DISMISSED_KEY) === 'true';
}

// ─── Component ──────────────────────────────────────────────

export function SetupChecklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set(['account-created']));
  const [dismissed, setDismissed] = useState(true); // default hidden until hydrated
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    setChecked(loadCheckedItems());
    setDismissed(loadDismissed());
    setMounted(true);
  }, []);

  // Don't render until hydrated (avoid flash)
  if (!mounted || dismissed) return null;

  const completedCount = checked.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const allComplete = completedCount >= totalCount;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="cf-card border-[#C9A84C]/20 bg-gradient-to-br from-white to-amber-50/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Get started with CapitalForge</h3>
            <p className="text-sm text-gray-500">
              Complete these steps to set up your practice ({completedCount}/{totalCount})
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 -mt-1"
          aria-label="Dismiss checklist"
          title="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C9A84C] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-1">
        {CHECKLIST_ITEMS.map((item) => {
          const isChecked = checked.has(item.id);
          const isAlwaysChecked = item.alwaysChecked;

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isChecked ? 'bg-green-50/50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => !isAlwaysChecked && toggleItem(item.id)}
                disabled={isAlwaysChecked}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  isChecked
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-gray-300 hover:border-[#C9A84C]'
                } ${isAlwaysChecked ? 'cursor-default' : 'cursor-pointer'}`}
                aria-label={`${isChecked ? 'Uncheck' : 'Check'} "${item.label}"`}
              >
                {isChecked && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* Label + link */}
              <Link
                href={item.href}
                className={`text-sm flex-1 transition-colors ${
                  isChecked
                    ? 'text-gray-400 line-through'
                    : 'text-gray-700 hover:text-[#0A1628] font-medium'
                }`}
              >
                {item.label}
              </Link>

              {/* Arrow — navigates to step page */}
              {!isAlwaysChecked && (
                <Link href={item.href} className="text-gray-300 hover:text-[#C9A84C] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* All-complete message */}
      {allComplete && (
        <div className="mt-4 pt-4 border-t border-surface-border text-center">
          <p className="text-sm text-emerald-600 font-medium mb-2">
            All set! Your practice is ready to go.
          </p>
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Dismiss checklist
          </button>
        </div>
      )}
    </div>
  );
}

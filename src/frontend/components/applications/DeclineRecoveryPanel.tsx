'use client';

// ============================================================
// DeclineRecoveryPanel — Shown when application status is
// 'declined'. Displays decline reason, issuer-specific retry
// windows, countdown to retry eligibility, and quick actions
// for generating reconsideration letters or finding alternatives.
// ============================================================

import { useMemo } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeclineRecoveryPanelProps {
  issuer: string;
  declineReason: string | null;
  adverseActionDate: string | null;
  clientName: string;
  cardProduct: string;
  onGenerateReconsiderationLetter: () => void;
  onFindAlternatives: () => void;
}

// ── Issuer retry windows (in days) ──────────────────────────────────────────

const ISSUER_RETRY_WINDOWS: Record<string, { days: number; label: string }> = {
  'Chase':        { days: 180, label: '6 months' },
  'Amex':         { days: 90,  label: '90 days' },
  'American Express': { days: 90, label: '90 days' },
  'Capital One':  { days: 180, label: '6 months' },
  'CapOne':       { days: 180, label: '6 months' },
  'Citi':         { days: 180, label: '6 months' },
  'Citibank':     { days: 180, label: '6 months' },
  'Bank of America': { days: 90, label: '3 months' },
  'BofA':         { days: 90,  label: '3 months' },
};

const DEFAULT_RETRY_WINDOW = { days: 180, label: '6 months' };

// ── Helpers ─────────────────────────────────────────────────────────────────

function getRetryWindow(issuer: string) {
  // Try exact match first, then case-insensitive partial match
  if (ISSUER_RETRY_WINDOWS[issuer]) return ISSUER_RETRY_WINDOWS[issuer];
  const key = Object.keys(ISSUER_RETRY_WINDOWS).find(
    (k) => issuer.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(issuer.toLowerCase()),
  );
  return key ? ISSUER_RETRY_WINDOWS[key] : DEFAULT_RETRY_WINDOW;
}

function calculateRetryDate(adverseActionDate: string, retryDays: number): Date {
  const d = new Date(adverseActionDate);
  d.setDate(d.getDate() + retryDays);
  return d;
}

function daysUntil(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export function DeclineRecoveryPanel({
  issuer,
  declineReason,
  adverseActionDate,
  clientName,
  cardProduct,
  onGenerateReconsiderationLetter,
  onFindAlternatives,
}: DeclineRecoveryPanelProps) {
  const retryWindow = useMemo(() => getRetryWindow(issuer), [issuer]);

  const retryInfo = useMemo(() => {
    if (!adverseActionDate) return null;
    const retryDate = calculateRetryDate(adverseActionDate, retryWindow.days);
    const remaining = daysUntil(retryDate);
    return { retryDate, remaining, isEligible: remaining <= 0 };
  }, [adverseActionDate, retryWindow.days]);

  // Progress percentage (how far through the wait)
  const progressPct = useMemo(() => {
    if (!retryInfo || !adverseActionDate) return 0;
    const totalDays = retryWindow.days;
    const elapsed = totalDays - retryInfo.remaining;
    return Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
  }, [retryInfo, adverseActionDate, retryWindow.days]);

  return (
    <div className="rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Decline Recovery
      </h4>

      {/* Decline reason */}
      {declineReason && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Decline Reason</p>
          <p className="text-sm text-gray-800 bg-white/60 rounded-md px-3 py-2 border border-gray-200/60">
            {declineReason}
          </p>
        </div>
      )}

      {/* Issuer retry window info */}
      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 mb-1">
          {issuer} Retry Window
        </p>
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-gray-700 font-medium">{retryWindow.label}</span>
          {adverseActionDate && (
            <span className="text-gray-500 text-xs">
              Declined {formatDate(adverseActionDate)}
            </span>
          )}
        </div>

        {/* Countdown / eligibility */}
        {retryInfo && (
          <>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  retryInfo.isEligible ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {retryInfo.isEligible ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span className="text-emerald-700 font-semibold">
                  Eligible for retry now
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-amber-700 font-semibold">
                    {retryInfo.remaining} day{retryInfo.remaining !== 1 ? 's' : ''} remaining
                  </span>
                </div>
                <span className="text-gray-500 text-xs">
                  Eligible {retryInfo.retryDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </>
        )}

        {!adverseActionDate && (
          <p className="text-xs text-gray-400 italic">
            No adverse action date recorded -- retry timeline cannot be calculated.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-4">
        <button
          type="button"
          onClick={onGenerateReconsiderationLetter}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium text-[#0A1628] bg-[#C9A84C] hover:bg-[#b8973f] rounded-lg px-4 py-2.5 transition-colors"
        >
          <span>&#10022;</span>
          Generate Reconsideration Letter
        </button>
        <button
          type="button"
          onClick={onFindAlternatives}
          className="w-full text-center text-sm font-medium text-brand-navy border border-brand-navy/30 hover:bg-brand-navy/5 rounded-lg px-4 py-2 transition-colors"
        >
          Find Alternative Cards
        </button>
      </div>
    </div>
  );
}

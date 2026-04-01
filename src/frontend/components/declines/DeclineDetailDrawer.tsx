'use client';

// ============================================================
// DeclineDetailDrawer — 480px right slide-over
// Shows full decline record details: header, summary, adverse
// action notice, reconsideration info, repair plan, timeline.
// ============================================================

import { useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReasonCategory =
  | 'too_many_inquiries'
  | 'insufficient_history'
  | 'high_utilization'
  | 'income_verification'
  | 'velocity'
  | 'internal_policy'
  | 'derogatory_marks';

type ReconStatus = 'not_started' | 'in_review' | 'approved' | 'denied' | 'scheduled';

interface DeclineRecord {
  id: string;
  appId: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  declinedDate: string;
  reasonCategory: ReasonCategory;
  reasonDetail: string;
  reconStatus: ReconStatus;
  cooldownEndsDate: string | null;
  requestedLimit: number;
}

export interface DeclineDetailDrawerProps {
  decline: DeclineRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onWriteLetter: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<ReasonCategory, { label: string; cls: string }> = {
  too_many_inquiries:   { label: 'Too Many Inquiries', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  insufficient_history: { label: 'Thin File',          cls: 'bg-blue-900 text-blue-300 border-blue-700' },
  high_utilization:     { label: 'High Utilization',   cls: 'bg-red-900 text-red-300 border-red-700' },
  income_verification:  { label: 'Income Verify',      cls: 'bg-purple-900 text-purple-300 border-purple-700' },
  velocity:             { label: 'Velocity Rule',      cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  internal_policy:      { label: 'Internal Policy',    cls: 'bg-gray-700 text-gray-300 border-gray-600' },
  derogatory_marks:     { label: 'Derogatory',         cls: 'bg-red-950 text-red-400 border-red-800' },
};

const RECON_STATUS_LABELS: Record<ReconStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
  in_review:   { label: 'In Review',   cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  approved:    { label: 'Approved',    cls: 'bg-green-900 text-green-300 border-green-700' },
  denied:      { label: 'Denied',      cls: 'bg-red-900 text-red-300 border-red-700' },
  scheduled:   { label: 'Scheduled',   cls: 'bg-blue-900 text-blue-300 border-blue-700' },
};

const RECON_LINES: Record<string, { phone: string; hours: string }> = {
  'Chase':          { phone: '1-888-270-2127', hours: 'Mon-Fri 8am-10pm ET' },
  'Amex':           { phone: '1-800-567-1083', hours: 'Mon-Fri 8am-12am ET, Sat 10am-6:30pm ET' },
  'Citi':           { phone: '1-800-695-5171', hours: 'Mon-Fri 8am-6pm ET' },
  'Capital One':    { phone: '1-800-625-7866', hours: 'Mon-Sun 8am-11pm ET' },
  'Bank of America':{ phone: '1-866-865-3728', hours: 'Mon-Fri 8am-9pm ET, Sat 8am-5pm ET' },
  'US Bank':        { phone: '1-800-947-1444', hours: 'Mon-Fri 7am-7pm CT' },
  'Wells Fargo':    { phone: '1-800-967-9521', hours: 'Mon-Fri 8am-9pm ET, Sat 8am-2pm ET' },
  'Barclays':       { phone: '1-866-928-8598', hours: 'Mon-Sun 8am-8pm ET' },
};

const REPAIR_PLANS: Record<ReasonCategory, string[]> = {
  too_many_inquiries: [
    'Freeze new applications for 6-12 months to let inquiry count age',
    'Dispute any unauthorized or duplicate inquiries on all three bureaus',
    'Focus on product-changing or pre-approved offers that use soft pulls',
    'Set a calendar reminder to reapply once inquiries fall below issuer threshold',
  ],
  insufficient_history: [
    'Open a secured business credit card or Net-30 vendor account to build trade lines',
    'Add business as authorized user on an existing seasoned trade line',
    'Register with Dun & Bradstreet and establish a PAYDEX score',
    'Wait 6+ months for new accounts to age before reapplying',
  ],
  high_utilization: [
    'Pay down revolving balances to below 30% utilization before statement close',
    'Request credit limit increases on existing cards to lower utilization ratio',
    'Shift balances to a 0% APR balance transfer card if available',
    'Avoid new charges on high-balance cards until utilization is under control',
  ],
  income_verification: [
    'Prepare business tax returns (2 most recent years) and bank statements',
    'Ensure stated revenue on applications matches IRS filings',
    'Consider applying with a co-signer or guarantor if personal income is thin',
    'Contact issuer proactively to submit documentation before recon call',
  ],
  velocity: [
    'Stop all new applications immediately and wait for accounts to season',
    'Calculate your current count against the issuer velocity rule (e.g., Chase 5/24)',
    'Consider product-changing existing cards instead of opening new ones',
    'Set a reapply date for when you will fall below the velocity threshold',
  ],
  internal_policy: [
    'Call reconsideration line to request more specific decline details',
    'Check if issuer has a blacklist or prior relationship issues on file',
    'Try a different product from the same issuer with lower tier requirements',
    'Document the decline and revisit in 6-12 months with a stronger profile',
  ],
  derogatory_marks: [
    'Obtain a copy of all three credit reports and identify the derogatory item(s)',
    'Dispute any inaccurate negative marks through the bureau dispute process',
    'Negotiate pay-for-delete agreements on collections or charge-offs',
    'If a tax lien, work with a CPA to resolve and obtain a lien withdrawal letter',
    'Allow 12-24 months for score recovery after resolution before reapplying',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function daysRemaining(endsDate: string | null): number | null {
  if (!endsDate) return null;
  const today = new Date('2026-03-31');
  const end = new Date(endsDate);
  const days = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

function eligibilityDisplay(endsDate: string | null): { text: string; cls: string } {
  const days = daysRemaining(endsDate);
  if (days === null || days === 0) return { text: 'Eligible Now', cls: 'text-green-400 font-semibold' };
  if (days <= 30) return { text: `${days} days remaining`, cls: 'text-yellow-400' };
  return { text: `${days} days remaining`, cls: 'text-red-400' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeclineDetailDrawer({
  decline,
  isOpen,
  onClose,
  onWriteLetter,
}: DeclineDetailDrawerProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !decline) return null;

  const reason = REASON_LABELS[decline.reasonCategory as ReasonCategory] ?? REASON_LABELS.internal_policy;
  const recon = RECON_STATUS_LABELS[decline.reconStatus as ReconStatus] ?? RECON_STATUS_LABELS.not_started;
  const reconLine = RECON_LINES[decline.issuer] ?? { phone: 'N/A', hours: 'Check issuer website' };
  const repairSteps = REPAIR_PLANS[decline.reasonCategory as ReasonCategory] ?? REPAIR_PLANS.internal_policy;
  const eligibility = eligibilityDisplay(decline.cooldownEndsDate);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-[#1a2332] border-l border-gray-800 z-50 shadow-2xl flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Decline detail drawer"
      >
        {/* ── 1. Header ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-gray-800 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{decline.cardProduct}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-blue-900 text-blue-300 border-blue-700">
                  {decline.issuer}
                </span>
              </div>
              <p className="text-sm text-gray-300 mt-2">{decline.businessName}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-mono text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {decline.appId}
                </span>
                <span className="text-xs text-gray-500">
                  Declined {decline.declinedDate}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-gray-500 hover:text-gray-300 text-xl leading-none p-1 -mt-1"
              aria-label="Close drawer"
            >
              &#10005;
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── 2. Decline Summary ────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Decline Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Reason</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${reason.cls}`}>
                  {reason.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-800">
                {decline.reasonDetail}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Requested Amount</span>
                <span className="text-sm font-bold text-white">{formatCurrency(decline.requestedLimit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Recon Status</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${recon.cls}`}>
                  {recon.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Eligible Date</span>
                <div className="text-right">
                  <span className="text-xs text-gray-300">
                    {decline.cooldownEndsDate ?? 'Now'}
                  </span>
                  <span className={`ml-2 text-xs ${eligibility.cls}`}>
                    {eligibility.text}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── 3. Adverse Action Notice ──────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Adverse Action Notice</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">No notice uploaded yet</p>
                <p className="text-xs text-gray-600 mt-0.5">Upload the issuer decline letter for automated parsing</p>
              </div>
              <button
                onClick={() => alert('Upload adverse action notice — coming soon')}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 text-xs text-gray-300 transition-colors"
              >
                Upload
              </button>
            </div>
          </section>

          {/* ── 4. Reconsideration ────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Reconsideration</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 space-y-3">
              {/* Recon phone line */}
              <div>
                <p className="text-xs text-gray-500 mb-1">{decline.issuer} Recon Line</p>
                <p className="text-sm font-semibold text-white font-mono">{reconLine.phone}</p>
                <p className="text-xs text-gray-600 mt-0.5">{reconLine.hours}</p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={onWriteLetter}
                  className="flex-1 px-3 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 text-sm font-semibold text-white transition-colors text-center"
                >
                  Write Letter
                </button>
                <button
                  onClick={() => alert('VoiceForge call integration — coming soon')}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 text-sm font-semibold text-gray-300 transition-colors text-center"
                >
                  Call via VoiceForge
                </button>
              </div>
            </div>
          </section>

          {/* ── 5. Repair Plan ────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Repair Plan
              <span className="ml-2 text-gray-600 normal-case font-normal">
                based on: {reason.label}
              </span>
            </h3>
            <div className="space-y-2">
              {repairSteps.map((step, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 border border-gray-700 text-xs font-bold text-gray-400 flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-xs text-gray-300 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 6. Timeline ──────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Timeline</h3>
            <div className="relative pl-4 border-l-2 border-gray-800 space-y-4">
              {/* Event: Declined */}
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-red-600 border-2 border-[#1a2332]" />
                <p className="text-xs font-semibold text-gray-200">Application Declined</p>
                <p className="text-xs text-gray-500 mt-0.5">{decline.declinedDate}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {decline.issuer} declined {decline.cardProduct} application
                </p>
              </div>

              {/* Event: Submitted */}
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-[#1a2332]" />
                <p className="text-xs font-semibold text-gray-200">Application Submitted</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {/* ~3 days before decline as placeholder */}
                  {(() => {
                    const d = new Date(decline.declinedDate);
                    d.setDate(d.getDate() - 3);
                    return d.toISOString().split('T')[0];
                  })()}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Requested {formatCurrency(decline.requestedLimit)} credit line
                </p>
              </div>

              {/* Event: Bureau pulled */}
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-gray-600 border-2 border-[#1a2332]" />
                <p className="text-xs font-semibold text-gray-200">Credit Bureau Pulled</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(() => {
                    const d = new Date(decline.declinedDate);
                    d.setDate(d.getDate() - 3);
                    return d.toISOString().split('T')[0];
                  })()}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">Hard inquiry recorded on credit report</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

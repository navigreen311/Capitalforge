'use client';

// ============================================================
// /compliance/disclosures — Disclosures Management
// Table: Business | State | Regulation | Deadline | Status
// Color coding for overdue/due-soon/on-track, file action.
// State coverage: CA, NY, IL, TX, VA, UT.
// Features:
//   3A — State tab filters with count badges
//   3B — File Disclosure modal with AI generation typing effect
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DisclosureStatus = 'Filed' | 'Pending' | 'Overdue' | 'Draft';

interface Disclosure {
  id: string;
  businessName: string;
  state: string;
  regulation: string;
  deadline: string;
  status: DisclosureStatus;
  filedAt: string | null;
}

// ---------------------------------------------------------------------------
// State-specific template map (3B)
// ---------------------------------------------------------------------------

const STATE_TEMPLATES: Record<string, string> = {
  CA: 'SB 1235',
  NY: 'CFDL',
  VA: 'CPA',
  IL: 'PLPA',
  TX: 'HB 1442',
  UT: 'Title 70C',
};

// ---------------------------------------------------------------------------
// Mock AI disclosure generation text per state
// ---------------------------------------------------------------------------

function generateDisclosureText(d: Disclosure): string {
  const tpl = STATE_TEMPLATES[d.state] || 'General';
  const lines: Record<string, string> = {
    CA: `CALIFORNIA COMMERCIAL FINANCE DISCLOSURE — SB 1235

Pursuant to California Senate Bill 1235 (Cal. Fin. Code § 22800 et seq.), this disclosure is provided to ${d.businessName} in connection with the commercial financing transaction described herein.

TOTAL AMOUNT OF FUNDS PROVIDED: $[AMOUNT]
TOTAL DOLLAR COST OF FINANCING: $[COST]
TERM: [TERM] months
ANNUAL PERCENTAGE RATE (APR): [APR]%
PAYMENT AMOUNT: $[PAYMENT] per [FREQUENCY]
PREPAYMENT: You may prepay this financing at any time without penalty.

This disclosure is made in compliance with the California Commercial Financing Disclosure Law. All terms are subject to the executed financing agreement. The provider is registered with the California Department of Financial Protection and Innovation (DFPI).

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,

    NY: `NEW YORK COMMERCIAL FINANCE DISCLOSURE LAW (CFDL)

In accordance with the New York Commercial Finance Disclosure Law (N.Y. Fin. Svcs. Law § 801 et seq.), the following disclosure is provided to ${d.businessName}.

FINANCING TYPE: [TYPE]
AMOUNT FINANCED: $[AMOUNT]
FINANCE CHARGE: $[CHARGE]
ANNUAL PERCENTAGE RATE: [APR]%
TOTAL REPAYMENT AMOUNT: $[TOTAL]
PAYMENT SCHEDULE: $[PAYMENT] every [FREQUENCY] for [TERM]
PREPAYMENT POLICY: [PREPAYMENT_TERMS]

This disclosure is provided pursuant to New York law and does not constitute a commitment to provide financing. All figures are estimates and may vary based on final underwriting.

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,

    IL: `ILLINOIS PREDATORY LENDING PREVENTION ACT (PLPA) DISCLOSURE

Pursuant to the Illinois Predatory Lending Prevention Act (815 ILCS 123/), this disclosure is provided to ${d.businessName}.

LOAN AMOUNT: $[AMOUNT]
ANNUAL PERCENTAGE RATE: [APR]% (must not exceed 36% APR under PLPA)
TOTAL INTEREST AND FEES: $[TOTAL_COST]
REPAYMENT TERM: [TERM]
MONTHLY PAYMENT: $[PAYMENT]

WARNING: Illinois law prohibits any loan with an APR exceeding 36%. If you believe the APR on this financing exceeds that limit, contact the Illinois Department of Financial and Professional Regulation.

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,

    TX: `TEXAS BUSINESS LENDING TRANSPARENCY DISCLOSURE — HB 1442

In compliance with Texas House Bill 1442 and applicable provisions of the Texas Finance Code, this disclosure is provided to ${d.businessName}.

FINANCING PRODUCT: [TYPE]
PRINCIPAL AMOUNT: $[AMOUNT]
ESTIMATED APR: [APR]%
TOTAL COST OF FINANCING: $[COST]
PAYMENT SCHEDULE: [SCHEDULE]
COLLATERAL REQUIRED: [YES/NO]

This disclosure is intended to promote transparency in commercial lending as required by Texas law. Terms are subject to the final executed agreement.

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,

    VA: `VIRGINIA CONSUMER PROTECTION ACT (CPA) DISCLOSURE

Pursuant to the Virginia Consumer Protection Act (Va. Code § 59.1-196 et seq.) and applicable open-end credit regulations, this disclosure is provided to ${d.businessName}.

CREDIT LIMIT: $[AMOUNT]
ANNUAL PERCENTAGE RATE: [APR]%
MINIMUM PAYMENT CALCULATION: [METHOD]
LATE FEE: $[LATE_FEE]
GRACE PERIOD: [DAYS] days

This disclosure is made in accordance with Virginia law. The consumer has the right to cancel within the statutory rescission period. For questions, contact the Virginia Attorney General's Office of Consumer Protection.

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,

    UT: `UTAH CONSUMER CREDIT PROTECTION DISCLOSURE — TITLE 70C

In accordance with Utah Code Title 70C (Consumer Credit Code), this disclosure is provided to ${d.businessName}.

AMOUNT FINANCED: $[AMOUNT]
FINANCE CHARGE: $[CHARGE]
ANNUAL PERCENTAGE RATE: [APR]%
TOTAL OF PAYMENTS: $[TOTAL]
PAYMENT SCHEDULE: $[PAYMENT] per [FREQUENCY] for [TERM]

This disclosure complies with Utah consumer credit protection requirements. Borrower rights under Title 70C are preserved regardless of any conflicting terms in the financing agreement.

Date: ${new Date().toLocaleDateString('en-US')}
Provider: CapitalForge Inc.
Recipient: ${d.businessName}`,
  };

  return lines[d.state] || `GENERAL DISCLOSURE — ${tpl}\n\nDisclosure for ${d.businessName} under ${d.regulation}.\n\nDate: ${new Date().toLocaleDateString('en-US')}\nProvider: CapitalForge Inc.`;
}

// ---------------------------------------------------------------------------
// Placeholder data — 6 required states
// ---------------------------------------------------------------------------

const PLACEHOLDER_DISCLOSURES: Disclosure[] = [
  { id: 'dis_001', businessName: 'Apex Ventures LLC',       state: 'CA', regulation: 'SB 1235 Commercial Finance Disclosures',       deadline: '2026-04-15', status: 'Pending',  filedAt: null },
  { id: 'dis_002', businessName: 'NovaTech Solutions Inc.',  state: 'NY', regulation: 'Commercial Finance Disclosure Law',             deadline: '2026-03-31', status: 'Overdue',  filedAt: null },
  { id: 'dis_003', businessName: 'Horizon Retail Partners',  state: 'IL', regulation: 'Consumer Installment Loan Act Disclosure',      deadline: '2026-05-01', status: 'Filed',    filedAt: '2026-03-20T10:00:00Z' },
  { id: 'dis_004', businessName: 'Summit Capital Group',     state: 'TX', regulation: 'HB 1442 Business Lending Transparency',         deadline: '2026-09-01', status: 'Draft',    filedAt: null },
  { id: 'dis_005', businessName: 'Blue Ridge Consulting',    state: 'VA', regulation: 'Open-End Credit Disclosure Requirements',       deadline: '2026-04-10', status: 'Pending',  filedAt: null },
  { id: 'dis_006', businessName: 'Crestline Medical LLC',    state: 'UT', regulation: 'Consumer Credit Protection — Title 70C',        deadline: '2026-06-30', status: 'Filed',    filedAt: '2026-03-15T14:00:00Z' },
  { id: 'dis_007', businessName: 'Meridian Capital',         state: 'CA', regulation: 'CCPA / CPRA Privacy Disclosure',                deadline: '2026-04-05', status: 'Overdue',  filedAt: null },
  { id: 'dis_008', businessName: 'Pinnacle Freight LLC',     state: 'NY', regulation: 'Truth in Lending — NY Addendum',                deadline: '2026-04-12', status: 'Pending',  filedAt: null },
  { id: 'dis_009', businessName: 'Apex Ventures LLC',        state: 'IL', regulation: 'Predatory Lending Prevention Disclosure',       deadline: '2026-07-15', status: 'Draft',    filedAt: null },
  { id: 'dis_010', businessName: 'Summit Capital Group',     state: 'VA', regulation: 'VA Consumer Protection Act Addendum',           deadline: '2026-04-08', status: 'Pending',  filedAt: null },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColor(dateStr: string, status: DisclosureStatus): string {
  if (status === 'Filed') return 'text-green-400';
  const days = daysUntil(dateStr);
  if (days < 0) return 'text-red-400';      // Overdue
  if (days <= 7) return 'text-amber-400';    // Due within 7 days
  return 'text-green-400';                    // On track
}

function deadlineRowBorder(dateStr: string, status: DisclosureStatus): string {
  if (status === 'Filed') return 'border-l-green-500';
  const days = daysUntil(dateStr);
  if (days < 0) return 'border-l-red-500';
  if (days <= 7) return 'border-l-amber-500';
  return 'border-l-green-500';
}

function statusBadge(s: DisclosureStatus): string {
  switch (s) {
    case 'Filed':   return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'Pending': return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
    case 'Overdue': return 'bg-red-900/50 text-red-300 border border-red-700';
    case 'Draft':   return 'bg-blue-900/50 text-blue-300 border border-blue-700';
  }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

const STATE_LIST = ['All', 'CA', 'NY', 'IL', 'TX', 'VA', 'UT'] as const;

// ---------------------------------------------------------------------------
// FileDisclosureModal (3B)
// ---------------------------------------------------------------------------

function FileDisclosureModal({
  disclosure,
  onClose,
  onFileSave,
}: {
  disclosure: Disclosure;
  onClose: () => void;
  onFileSave: (id: string) => void;
}) {
  const templateName = STATE_TEMPLATES[disclosure.state] || 'General';
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingDone, setIsTypingDone] = useState(false);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);

  // Clean up typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  const handleGenerate = useCallback(() => {
    setIsGenerating(true);
    setDisplayedText('');
    setGeneratedText('');
    setIsTypingDone(false);
    charIndexRef.current = 0;

    // Simulate a short AI "thinking" delay
    setTimeout(() => {
      const fullText = generateDisclosureText(disclosure);
      setGeneratedText(fullText);
      setIsGenerating(false);

      // Start typing effect
      typingRef.current = setInterval(() => {
        charIndexRef.current += 3; // 3 chars at a time for speed
        if (charIndexRef.current >= fullText.length) {
          charIndexRef.current = fullText.length;
          if (typingRef.current) clearInterval(typingRef.current);
          setIsTypingDone(true);
        }
        setDisplayedText(fullText.slice(0, charIndexRef.current));
      }, 12);
    }, 800);
  }, [disclosure]);

  const handleFileSave = useCallback(() => {
    onFileSave(disclosure.id);
    onClose();
  }, [disclosure.id, onFileSave, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white">File Disclosure</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {disclosure.state} &mdash; {templateName} Template
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none p-1">&times;</button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Pre-filled deal data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Business Name</label>
              <input
                type="text"
                readOnly
                value={disclosure.businessName}
                className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">State</label>
              <input
                type="text"
                readOnly
                value={disclosure.state}
                className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Regulation</label>
              <input
                type="text"
                readOnly
                value={disclosure.regulation}
                className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Deadline</label>
              <input
                type="text"
                readOnly
                value={formatDate(disclosure.deadline)}
                className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              />
            </div>
          </div>

          {/* Generate button */}
          {!generatedText && !isGenerating && (
            <button
              onClick={handleGenerate}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#C9A84C] to-[#b8973f] text-[#0A1628] font-semibold text-sm hover:from-[#d4b45c] hover:to-[#c9a84c] transition-all"
            >
              Generate Disclosure &#10022;
            </button>
          )}

          {/* Generating spinner */}
          {isGenerating && (
            <div className="flex items-center justify-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[#C9A84C]">Generating {templateName} disclosure...</span>
            </div>
          )}

          {/* Editable textarea with typing effect */}
          {(displayedText || isTypingDone) && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Generated Disclosure (editable)</label>
              <textarea
                value={isTypingDone ? generatedText : displayedText}
                onChange={(e) => {
                  if (isTypingDone) setGeneratedText(e.target.value);
                }}
                readOnly={!isTypingDone}
                rows={14}
                className={`w-full bg-[#0A1628] border rounded-lg px-3 py-2 text-sm text-gray-200 font-mono leading-relaxed resize-y ${
                  isTypingDone ? 'border-[#C9A84C]/50 focus:border-[#C9A84C] focus:outline-none' : 'border-gray-700'
                }`}
              />
              {!isTypingDone && displayedText && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 bg-[#C9A84C] rounded-full animate-pulse" />
                  <span className="text-xs text-[#C9A84C]">Generating...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleFileSave}
            disabled={!isTypingDone}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isTypingDone
                ? 'bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628]'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            File &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DisclosuresPage() {
  const [disclosures, setDisclosures] = useState<Disclosure[]>(PLACEHOLDER_DISCLOSURES);
  const [stateFilter, setStateFilter] = useState<string>('All');
  const [toast, setToast] = useState<string | null>(null);
  const [modalDisclosure, setModalDisclosure] = useState<Disclosure | null>(null);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/compliance/disclosures');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.length) setDisclosures(data.data);
        }
      } catch { /* placeholder */ }
    })();
  }, []);

  // 3A — Count badges per state
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = { All: disclosures.length };
    for (const d of disclosures) {
      counts[d.state] = (counts[d.state] || 0) + 1;
    }
    return counts;
  }, [disclosures]);

  const filtered = stateFilter === 'All'
    ? disclosures
    : disclosures.filter((d) => d.state === stateFilter);

  // Sort: Overdue first, then by deadline ascending
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
    if (b.status === 'Overdue' && a.status !== 'Overdue') return 1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  // 3B — File via modal: update status to Filed, show toast
  const handleFileSave = useCallback((id: string) => {
    setDisclosures((prev) =>
      prev.map((d) => d.id === id ? { ...d, status: 'Filed' as DisclosureStatus, filedAt: new Date().toISOString() } : d)
    );
    const disc = disclosures.find((d) => d.id === id);
    if (disc) {
      setToast(`${disc.regulation} filed for ${disc.businessName}`);
      fetch(`/api/compliance/disclosures/${id}/file`, { method: 'POST' }).catch(() => {});
    }
  }, [disclosures]);

  // Summary stats
  const overdue = disclosures.filter((d) => d.status === 'Overdue').length;
  const pending = disclosures.filter((d) => d.status === 'Pending').length;
  const filed = disclosures.filter((d) => d.status === 'Filed').length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Disclosures</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            State disclosure tracking &middot; {disclosures.length} total &middot;{' '}
            {overdue > 0 && <span className="text-red-400 font-semibold">{overdue} overdue</span>}
            {overdue > 0 && pending > 0 && ' · '}
            {pending > 0 && <span className="text-yellow-400">{pending} pending</span>}
            {(overdue > 0 || pending > 0) && ' · '}
            <span className="text-green-400">{filed} filed</span>
          </p>
        </div>
      </div>

      {/* 3A — State filter tabs with count badges */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {STATE_LIST.map((s) => (
          <button
            key={s}
            onClick={() => setStateFilter(s)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              stateFilter === s
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {s}
            <span
              className={`text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${
                stateFilter === s
                  ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {stateCounts[s] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Business</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">State</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Regulation</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Deadline</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No disclosures for this state.</td></tr>
              ) : (
                sorted.map((d) => {
                  const days = daysUntil(d.deadline);
                  return (
                    <tr key={d.id} className={`border-b border-gray-800/50 border-l-4 ${deadlineRowBorder(d.deadline, d.status)} hover:bg-[#0A1628]/50 transition-colors`}>
                      <td className="px-4 py-3 text-gray-100 font-medium">{d.businessName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold bg-gray-800 text-gray-300 border border-gray-600 px-2 py-0.5 rounded">
                          {d.state}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs max-w-[300px]">{d.regulation}</td>
                      <td className={`px-4 py-3 text-xs font-semibold ${deadlineColor(d.deadline, d.status)}`}>
                        {formatDate(d.deadline)}
                        {d.status !== 'Filed' && (
                          <span className="block text-xs font-normal mt-0.5 opacity-80">
                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d remaining`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(d.status)}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.status !== 'Filed' ? (
                          <button
                            onClick={() => setModalDisclosure(d)}
                            className="px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-xs font-semibold text-[#0A1628] transition-colors"
                          >
                            File Disclosure
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Filed {d.filedAt ? formatDate(d.filedAt) : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3B — File Disclosure Modal */}
      {modalDisclosure && (
        <FileDisclosureModal
          disclosure={modalDisclosure}
          onClose={() => setModalDisclosure(null)}
          onFileSave={handleFileSave}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-[fadeIn_0.3s_ease-out]">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}

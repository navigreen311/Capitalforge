'use client';

// ============================================================
// /tax — Tax Reporting Center
// IRC §163(j) deductibility summary card, year-end fee
// summary table by card, business-purpose substantiation
// score gauge, export buttons (CSV/JSON/PDF), year selector,
// client selector, card drill-down, send to CPA modal.
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat = 'csv' | 'json' | 'pdf';

interface Card163jSummary {
  cardName: string;
  issuer: string;
  last4: string;
  totalInterest: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  limitationApplied: boolean;
  atiBasis: number;       // ATI = Adjusted Taxable Income basis used
}

interface CardFeeSummary {
  cardName: string;
  issuer: string;
  last4: string;
  annualFee: number;
  lateFees: number;
  foreignTransactionFees: number;
  otherFees: number;
  totalFees: number;
  deductible: boolean;
}

interface SubstantiationItem {
  category: string;
  totalTransactions: number;
  substantiated: number;
  score: number;       // 0-100
}

interface PlaceholderClient {
  id: string;
  name: string;
  ein: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS: PlaceholderClient[] = [
  { id: 'c1', name: 'Acme Holdings LLC', ein: '12-3456789' },
  { id: 'c2', name: 'Vertex Capital Group', ein: '98-7654321' },
  { id: 'c3', name: 'Northwind Traders Inc', ein: '55-1234567' },
  { id: 'c4', name: 'Contoso Partners LP', ein: '33-9876543' },
  { id: 'c5', name: 'Tailspin Ventures Corp', ein: '77-4561230' },
];

const DATA_BY_YEAR: Record<
  number,
  {
    cards163j: Card163jSummary[];
    cardFees: CardFeeSummary[];
    substantiation: SubstantiationItem[];
    atiLimit: number;
    totalInterest: number;
    totalDeductible: number;
    carryforwardAmount: number;
  }
> = {
  2025: {
    atiLimit: pct30_ati(2_840_000),
    totalInterest: 92_400,
    totalDeductible: 78_200,
    carryforwardAmount: 14_200,
    cards163j: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', totalInterest: 28_400, deductibleAmount: 24_100, nonDeductibleAmount: 4_300,  limitationApplied: true,  atiBasis: 2_840_000 },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', totalInterest: 34_600, deductibleAmount: 29_400, nonDeductibleAmount: 5_200,  limitationApplied: true,  atiBasis: 2_840_000 },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', totalInterest: 14_200, deductibleAmount: 12_800, nonDeductibleAmount: 1_400,  limitationApplied: false, atiBasis: 2_840_000 },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', totalInterest: 9_640,  deductibleAmount: 7_400,  nonDeductibleAmount: 2_240,  limitationApplied: false, atiBasis: 2_840_000 },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', totalInterest: 5_560,  deductibleAmount: 4_500,  nonDeductibleAmount: 1_060,  limitationApplied: false, atiBasis: 2_840_000 },
    ],
    cardFees: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', annualFee: 95,   lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 95,   deductible: true  },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', annualFee: 695,  lateFees: 0,   foreignTransactionFees: 120, otherFees: 0,   totalFees: 815,  deductible: true  },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', annualFee: 150,  lateFees: 39,  foreignTransactionFees: 0,   otherFees: 0,   totalFees: 189,  deductible: false },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', annualFee: 0,    lateFees: 0,   foreignTransactionFees: 0,   otherFees: 45,  totalFees: 45,   deductible: true  },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', annualFee: 99,   lateFees: 0,   foreignTransactionFees: 55,  otherFees: 0,   totalFees: 154,  deductible: true  },
    ],
    substantiation: [
      { category: 'Travel',              totalTransactions: 48,  substantiated: 46, score: 96 },
      { category: 'Software/SaaS',       totalTransactions: 124, substantiated: 124, score: 100 },
      { category: 'Meals & Entertainment', totalTransactions: 62, substantiated: 41, score: 66 },
      { category: 'Office Supplies',     totalTransactions: 35,  substantiated: 33, score: 94 },
      { category: 'Shipping',            totalTransactions: 19,  substantiated: 14, score: 74 },
      { category: 'Advertising',         totalTransactions: 27,  substantiated: 22, score: 81 },
    ],
  },
  2024: {
    atiLimit: pct30_ati(2_540_000),
    totalInterest: 74_800,
    totalDeductible: 68_200,
    carryforwardAmount: 6_600,
    cards163j: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', totalInterest: 22_000, deductibleAmount: 20_400, nonDeductibleAmount: 1_600,  limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', totalInterest: 28_100, deductibleAmount: 24_900, nonDeductibleAmount: 3_200,  limitationApplied: true,  atiBasis: 2_540_000 },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', totalInterest: 12_400, deductibleAmount: 12_400, nonDeductibleAmount: 0,      limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', totalInterest: 8_100,  deductibleAmount: 7_200,  nonDeductibleAmount: 900,    limitationApplied: false, atiBasis: 2_540_000 },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', totalInterest: 4_200,  deductibleAmount: 3_300,  nonDeductibleAmount: 900,    limitationApplied: false, atiBasis: 2_540_000 },
    ],
    cardFees: [
      { cardName: 'Ink Business Preferred', issuer: 'Chase',          last4: '4821', annualFee: 95,   lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 95,   deductible: true  },
      { cardName: 'Business Platinum',      issuer: 'Amex',           last4: '9034', annualFee: 695,  lateFees: 0,   foreignTransactionFees: 80,  otherFees: 0,   totalFees: 775,  deductible: true  },
      { cardName: 'Spark Cash Plus',        issuer: 'Capital One',    last4: '7712', annualFee: 150,  lateFees: 0,   foreignTransactionFees: 0,   otherFees: 0,   totalFees: 150,  deductible: false },
      { cardName: 'Business Advantage',     issuer: 'Bank of America', last4: '3390', annualFee: 0,    lateFees: 0,   foreignTransactionFees: 0,   otherFees: 30,  totalFees: 30,   deductible: true  },
      { cardName: 'Business AAdvantage',    issuer: 'Citi',           last4: '5521', annualFee: 99,   lateFees: 39,  foreignTransactionFees: 42,  otherFees: 0,   totalFees: 180,  deductible: true  },
    ],
    substantiation: [
      { category: 'Travel',              totalTransactions: 42,  substantiated: 38, score: 90 },
      { category: 'Software/SaaS',       totalTransactions: 108, substantiated: 108, score: 100 },
      { category: 'Meals & Entertainment', totalTransactions: 55, substantiated: 32, score: 58 },
      { category: 'Office Supplies',     totalTransactions: 29,  substantiated: 25, score: 86 },
      { category: 'Shipping',            totalTransactions: 16,  substantiated: 10, score: 63 },
      { category: 'Advertising',         totalTransactions: 22,  substantiated: 17, score: 77 },
    ],
  },
};

function pct30_ati(ati: number) { return Math.round(ati * 0.3); }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#eab308';
  if (score >= 60) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Moderate';
  return 'Weak';
}

const AVAILABLE_YEARS = [2025, 2024];

/** Generate placeholder month-by-month interest for a card */
function generateMonthlyInterest(totalInterest: number): number[] {
  const base = totalInterest / 12;
  // create slight variance per month using a deterministic pattern
  return MONTH_NAMES.map((_, i) => {
    const variance = 1 + (((i * 7 + 3) % 11) - 5) / 50; // +/- ~10%
    return Math.round(base * variance);
  });
}

/** Trigger a browser download for the given content */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-4 bg-[#C9A84C] text-gray-950 px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-800 hover:text-gray-950 font-bold">
        &times;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client Selector (search combobox)
// ---------------------------------------------------------------------------

function ClientSelector({
  selected,
  onSelect,
}: {
  selected: PlaceholderClient | null;
  onSelect: (client: PlaceholderClient | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = CLIENTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.ein.includes(search),
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-[#C9A84C]/20 border border-[#C9A84C]/50 text-[#C9A84C] text-xs font-semibold px-3 py-1.5 rounded-full">
            {selected.name}
            <button
              onClick={() => onSelect(null)}
              className="ml-1 text-[#C9A84C]/70 hover:text-[#C9A84C] font-bold"
            >
              &times;
            </button>
          </span>
        </div>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Select Client
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 left-0 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-600">No clients found</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <p className="text-xs text-gray-200 font-medium">{c.name}</p>
                <p className="text-[10px] text-gray-600">EIN {c.ein}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Detail Drawer (month-by-month interest)
// ---------------------------------------------------------------------------

function CardDetailDrawer({
  card,
  year,
  onClose,
}: {
  card: Card163jSummary;
  year: number;
  onClose: () => void;
}) {
  const monthly = generateMonthlyInterest(card.totalInterest);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-700 overflow-y-auto shadow-2xl">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-white">{card.cardName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{card.issuer} ···{card.last4} | FY {year}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg font-bold"
            >
              &times;
            </button>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: 'Total Interest', value: fmtCurrency(card.totalInterest), color: 'text-gray-100' },
              { label: 'Deductible', value: fmtCurrency(card.deductibleAmount), color: 'text-emerald-400' },
              { label: 'Non-Deductible', value: fmtCurrency(card.nonDeductibleAmount), color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
                <p className={`text-sm font-black mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Month-by-month table */}
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Monthly Interest Charges</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-2 text-gray-500 text-xs font-semibold">Month</th>
                <th className="text-right px-3 py-2 text-gray-500 text-xs font-semibold">Interest</th>
                <th className="text-right px-3 py-2 text-gray-500 text-xs font-semibold">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((amount, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                >
                  <td className="px-3 py-2 text-xs text-gray-300">
                    {MONTH_NAMES[i]} {year}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-200 font-medium">
                    {fmtCurrency(amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">
                    {card.totalInterest > 0 ? Math.round((amount / card.totalInterest) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-700 bg-gray-900">
                <td className="px-3 py-2 text-xs font-bold text-gray-400">Total</td>
                <td className="px-3 py-2 text-right text-xs font-bold text-gray-100">{fmtCurrency(card.totalInterest)}</td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">100%</td>
              </tr>
            </tfoot>
          </table>

          {/* Limitation note */}
          {card.limitationApplied && (
            <div className="mt-4 rounded-lg bg-orange-950/40 border border-orange-800 px-3 py-2.5 text-xs text-orange-300">
              <span className="font-semibold">IRC &#167;163(j) Limitation Applied:</span>{' '}
              This card&apos;s interest was subject to the 30% ATI limitation. ATI basis: {fmtCurrency(card.atiBasis)}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send to CPA Modal
// ---------------------------------------------------------------------------

function SendToCpaModal({
  year,
  onClose,
  onToast,
}: {
  year: number;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(`Hi,\n\nPlease find attached the FY ${year} tax report from CapitalForge.\n\nBest regards`);
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachCsv, setAttachCsv] = useState(true);
  const [attachJson, setAttachJson] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSending(false);
    onClose();
    onToast(`Tax report sent securely to ${email}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">Send to CPA</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg font-bold">
              &times;
            </button>
          </div>

          {/* Email field */}
          <label className="block mb-3">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">CPA Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cpa@example.com"
              className="mt-1 w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600"
            />
          </label>

          {/* Attachments */}
          <div className="mb-3">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Attachments</span>
            <div className="flex items-center gap-4 mt-2">
              {[
                { label: 'PDF Report', checked: attachPdf, onChange: setAttachPdf },
                { label: 'CSV Data', checked: attachCsv, onChange: setAttachCsv },
                { label: 'JSON Data', checked: attachJson, onChange: setAttachJson },
              ].map(({ label, checked, onChange }) => (
                <label key={label} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-0 focus:ring-offset-0 accent-[#C9A84C]"
                  />
                  <span className="text-xs text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Message */}
          <label className="block mb-4">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="mt-1 w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-600 resize-none"
            />
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!email.trim() || sending}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Send Securely
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section163jCard({
  total, deductible, nonDeductible, carryforward, atiLimit,
}: {
  total: number; deductible: number; nonDeductible: number; carryforward: number; atiLimit: number;
}) {
  const deductiblePct = total > 0 ? Math.round((deductible / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-[#C9A84C]/40 bg-[#0A1628] p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-[#C9A84C] uppercase tracking-wide">IRC &#167;163(j) Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Business interest expense deductibility</p>
        </div>
        <span className="text-[10px] font-semibold bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
          30% ATI Limit
        </span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Interest',      value: fmtCurrency(total),        color: 'text-gray-100' },
          { label: 'Deductible',          value: fmtCurrency(deductible),   color: 'text-emerald-400' },
          { label: 'Non-Deductible',      value: fmtCurrency(nonDeductible), color: nonDeductible > 0 ? 'text-red-400' : 'text-gray-500' },
          { label: 'Carryforward',        value: fmtCurrency(carryforward), color: carryforward > 0 ? 'text-yellow-400' : 'text-gray-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
            <p className={`text-lg font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ATI limit bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">Deductible Interest vs. 30% ATI Limit</span>
          <span className="text-xs font-semibold text-gray-300">
            {fmtCurrency(deductible)} / {fmtCurrency(atiLimit)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#C9A84C] transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round((deductible / atiLimit) * 100))}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          {fmtPct(deductible, atiLimit)} of ATI limit utilized · ATI basis {fmtCurrency(atiLimit / 0.3)}
        </p>
      </div>

      {/* Deductible breakdown bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">Deductible Ratio</span>
          <span className="text-xs font-semibold text-emerald-400">{deductiblePct}% deductible</span>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${deductiblePct}%` }} />
          <div className="h-full bg-red-700 transition-all duration-500" style={{ width: `${100 - deductiblePct}%` }} />
        </div>
      </div>

      {carryforward > 0 && (
        <div className="mt-4 rounded-lg bg-yellow-950/50 border border-yellow-800 px-3 py-2.5 text-xs text-yellow-300">
          <span className="font-semibold">Carryforward Notice:</span> {fmtCurrency(carryforward)} of non-deductible
          business interest carries forward to the next tax year per IRC &#167;163(j)(2).
        </div>
      )}
    </div>
  );
}

function SubstantiationGauge({ items, year }: { items: SubstantiationItem[]; year: number }) {
  const router = useRouter();
  const overall = items.length
    ? Math.round(items.reduce((acc, i) => acc + i.score, 0) / items.length)
    : 0;

  const color = scoreColor(overall);
  const size = 120;
  const radius = 44;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - overall / 100);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-4">
        Business-Purpose Substantiation
      </h2>

      <div className="flex items-start gap-6 flex-wrap">
        {/* Gauge */}
        <div className="flex flex-col items-center">
          <svg width={size} height={size} aria-label={`Substantiation score ${overall}`}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={10} />
            <circle
              cx={cx} cy={cy} r={radius} fill="none"
              stroke={color} strokeWidth={10} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={24} fontWeight="900" fill={color}>{overall}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#6b7280">/ 100</text>
          </svg>
          <p className="text-xs font-semibold mt-1" style={{ color }}>{scoreLabel(overall)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Overall Score</p>
        </div>

        {/* Per-category breakdown */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {items.map(({ category, totalTransactions, substantiated, score }) => (
            <div key={category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 font-medium truncate">{category}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-gray-500">
                    {substantiated}/{totalTransactions}
                  </span>
                  <span
                    className="text-[10px] font-bold w-8 text-right"
                    style={{ color: scoreColor(score) }}
                  >
                    {score}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                />
              </div>
              {/* Substantiation improvement CTA for low scores */}
              {score < 75 && (
                <button
                  onClick={() =>
                    router.push(`/spend-governance?category=${encodeURIComponent(category)}`)
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-orange-400 hover:text-orange-300 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Documentation ({totalTransactions - substantiated} transactions)
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {overall < 75 && (
        <div className="mt-4 rounded-lg bg-orange-950/40 border border-orange-800 px-3 py-2.5 text-xs text-orange-300">
          <span className="font-semibold">IRS Audit Risk:</span> Substantiation below 75% increases audit exposure.
          Improve business-purpose documentation for Meals &amp; Entertainment and Shipping categories.
        </div>
      )}
    </div>
  );
}

function ExportButtons({
  year,
  data,
  onToast,
}: {
  year: number;
  data: (typeof DATA_BY_YEAR)[number];
  onToast: (msg: string) => void;
}) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  function buildCsv(): string {
    const lines: string[] = [];
    const totalFees = data.cardFees.reduce((a, c) => a + c.totalFees, 0);
    const deductibleFees = data.cardFees.filter((c) => c.deductible).reduce((a, c) => a + c.totalFees, 0);

    // Section 1: IRC 163(j) Summary
    lines.push('IRC 163(j) Summary');
    lines.push('Metric,Value');
    lines.push(`Total Interest,${data.totalInterest}`);
    lines.push(`Deductible,${data.totalDeductible}`);
    lines.push(`Non-Deductible,${data.totalInterest - data.totalDeductible}`);
    lines.push(`Carryforward,${data.carryforwardAmount}`);
    lines.push(`ATI Limit (30%),${data.atiLimit}`);
    lines.push('');

    // Section 2: Per-Card Interest Breakdown
    lines.push('Per-Card Interest Breakdown');
    lines.push('Card,Issuer,Last4,Total Interest,Deductible,Non-Deductible,Limitation Applied');
    for (const c of data.cards163j) {
      lines.push(
        `"${c.cardName}",${c.issuer},${c.last4},${c.totalInterest},${c.deductibleAmount},${c.nonDeductibleAmount},${c.limitationApplied ? 'Yes' : 'No'}`,
      );
    }
    lines.push('');

    // Section 3: Fee Summary
    lines.push('Fee Summary');
    lines.push('Card,Issuer,Last4,Annual Fee,Late Fees,Foreign Tx Fees,Other Fees,Total Fees,Deductible');
    for (const c of data.cardFees) {
      lines.push(
        `"${c.cardName}",${c.issuer},${c.last4},${c.annualFee},${c.lateFees},${c.foreignTransactionFees},${c.otherFees},${c.totalFees},${c.deductible ? 'Yes' : 'No'}`,
      );
    }
    lines.push(`Total Fees,,,,,,,,${totalFees}`);
    lines.push(`Deductible Fees,,,,,,,,${deductibleFees}`);
    lines.push('');

    // Section 4: Substantiation Scores
    lines.push('Substantiation Scores');
    lines.push('Category,Total Transactions,Substantiated,Score');
    for (const s of data.substantiation) {
      lines.push(`"${s.category}",${s.totalTransactions},${s.substantiated},${s.score}%`);
    }

    return lines.join('\n');
  }

  function buildJson(): string {
    return JSON.stringify(
      {
        taxYear: year,
        generatedAt: new Date().toISOString(),
        irc163j: {
          atiLimit: data.atiLimit,
          totalInterest: data.totalInterest,
          totalDeductible: data.totalDeductible,
          carryforwardAmount: data.carryforwardAmount,
          cards: data.cards163j,
        },
        fees: {
          cards: data.cardFees,
          totalFees: data.cardFees.reduce((a, c) => a + c.totalFees, 0),
          deductibleFees: data.cardFees.filter((c) => c.deductible).reduce((a, c) => a + c.totalFees, 0),
        },
        substantiation: data.substantiation,
      },
      null,
      2,
    );
  }

  async function handleExport(fmt: ExportFormat) {
    setExporting(fmt);

    if (fmt === 'csv') {
      const csv = buildCsv();
      downloadFile(csv, `capitalforge-tax-${year}.csv`, 'text/csv');
      onToast('Tax report exported as CSV');
    } else if (fmt === 'json') {
      const json = buildJson();
      downloadFile(json, `capitalforge-tax-${year}.json`, 'application/json');
      onToast('Tax report exported as JSON');
    } else if (fmt === 'pdf') {
      // Simulate PDF generation with a loading delay
      await new Promise((r) => setTimeout(r, 1500));
      onToast('Tax report exported as PDF');
    }

    setExporting(null);
  }

  const formats: { fmt: ExportFormat; label: string; icon: string }[] = [
    { fmt: 'csv',  label: 'CSV',  icon: 'C' },
    { fmt: 'json', label: 'JSON', icon: 'J' },
    { fmt: 'pdf',  label: 'PDF',  icon: 'P' },
  ];

  return (
    <div className="flex items-center gap-2">
      {formats.map(({ fmt, label, icon }) => (
        <button
          key={fmt}
          onClick={() => handleExport(fmt)}
          disabled={exporting !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-gray-700 bg-gray-900 text-gray-300 hover:text-[#C9A84C] hover:border-[#C9A84C] transition-colors disabled:opacity-50"
        >
          <span
            className="h-4 w-4 rounded text-[9px] font-black flex items-center justify-center bg-gray-800 text-gray-400"
            aria-hidden
          >
            {icon}
          </span>
          {exporting === fmt ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Exporting...
            </span>
          ) : (
            `Export ${label}`
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TaxPage() {
  const [year, setYear] = useState<number>(2025);
  const [selectedClient, setSelectedClient] = useState<PlaceholderClient | null>(CLIENTS[0]);
  const [selectedTaxCard, setSelectedTaxCard] = useState<Card163jSummary | null>(null);
  const [showCpaModal, setShowCpaModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const data = DATA_BY_YEAR[year];

  const totalFees = data.cardFees.reduce((acc, c) => acc + c.totalFees, 0);
  const deductibleFees = data.cardFees.filter((c) => c.deductible).reduce((acc, c) => acc + c.totalFees, 0);

  const showToast = useCallback((msg: string) => setToastMessage(msg), []);
  const clearToast = useCallback(() => setToastMessage(null), []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={clearToast} />}

      {/* Card Detail Drawer */}
      {selectedTaxCard && (
        <CardDetailDrawer
          card={selectedTaxCard}
          year={year}
          onClose={() => setSelectedTaxCard(null)}
        />
      )}

      {/* Send to CPA Modal */}
      {showCpaModal && (
        <SendToCpaModal
          year={year}
          onClose={() => setShowCpaModal(false)}
          onToast={showToast}
        />
      )}

      {/* Client Selector */}
      <div className="mb-4">
        <ClientSelector selected={selectedClient} onSelect={setSelectedClient} />
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tax Reporting Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            IRC &#167;163(j) deductibility · fee summaries · substantiation scores
            {selectedClient && (
              <span className="text-gray-600"> · {selectedClient.name}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="year-select" className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
              Tax Year
            </label>
            <select
              id="year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>FY {y}</option>
              ))}
            </select>
          </div>

          <ExportButtons year={year} data={data} onToast={showToast} />

          {/* Send to CPA button */}
          <button
            onClick={() => setShowCpaModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-[#C9A84C]/50 bg-[#C9A84C]/10 text-[#C9A84C] hover:bg-[#C9A84C]/20 hover:border-[#C9A84C] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send to CPA
          </button>
        </div>
      </div>

      {/* 163(j) Summary card */}
      <div className="mb-6">
        <Section163jCard
          total={data.totalInterest}
          deductible={data.totalDeductible}
          nonDeductible={data.totalInterest - data.totalDeductible}
          carryforward={data.carryforwardAmount}
          atiLimit={data.atiLimit}
        />
      </div>

      {/* 163(j) per-card breakdown */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">
            Interest Deductibility by Card
          </h2>
          <span className="text-[10px] text-gray-600">FY {year} · Click a row for details</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Card</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Total Interest</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Deductible</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Non-Deductible</th>
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Limitation</th>
              <th className="px-4 py-2.5 hidden sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {data.cards163j.map((card, i) => (
              <tr
                key={card.last4}
                onClick={() => setSelectedTaxCard(card)}
                className={`border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800/60 transition-colors ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}
              >
                <td className="px-4 py-3">
                  <p className="text-gray-200 font-semibold text-xs">{card.cardName}</p>
                  <p className="text-[10px] text-gray-500">
                    {card.issuer} ···{card.last4}
                  </p>
                </td>
                <td className="px-4 py-3 text-right text-gray-300 font-medium">
                  {fmtCurrency(card.totalInterest)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-400 font-semibold">
                  {fmtCurrency(card.deductibleAmount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={card.nonDeductibleAmount > 0 ? 'text-red-400 font-semibold' : 'text-gray-600'}>
                    {fmtCurrency(card.nonDeductibleAmount)}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {card.limitationApplied ? (
                    <span className="text-[10px] font-bold bg-orange-900 text-orange-300 border border-orange-700 px-1.5 py-0.5 rounded-full">
                      Applied
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600">None</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {/* Deductible ratio bar */}
                  <div className="w-20">
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${card.totalInterest > 0 ? Math.round((card.deductibleAmount / card.totalInterest) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5 text-right">
                      {card.totalInterest > 0 ? Math.round((card.deductibleAmount / card.totalInterest) * 100) : 0}%
                    </p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-900">
              <td className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</td>
              <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(data.totalInterest)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmtCurrency(data.totalDeductible)}</td>
              <td className="px-4 py-3 text-right font-bold text-red-400">{fmtCurrency(data.totalInterest - data.totalDeductible)}</td>
              <td colSpan={2} className="hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Year-end fee summary */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Year-End Fee Summary</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {fmtCurrency(deductibleFees)} deductible of {fmtCurrency(totalFees)} total
            </span>
            <span className="text-[10px] text-gray-600">FY {year}</span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 border-b border-gray-800">
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Card</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Annual</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Late</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Foreign Tx</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Other</th>
              <th className="text-right px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Total Fees</th>
              <th className="text-left px-4 py-2.5 text-gray-500 text-xs font-semibold uppercase tracking-wide">Deductible</th>
            </tr>
          </thead>
          <tbody>
            {data.cardFees.map((card, i) => (
              <tr
                key={card.last4}
                className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900'}`}
              >
                <td className="px-4 py-3">
                  <p className="text-gray-200 font-semibold text-xs">{card.cardName}</p>
                  <p className="text-[10px] text-gray-500">{card.issuer} ···{card.last4}</p>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.annualFee > 0 ? fmtCurrency(card.annualFee) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className={card.lateFees > 0 ? 'text-red-400 font-semibold' : 'text-gray-700'}>
                    {card.lateFees > 0 ? fmtCurrency(card.lateFees) : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.foreignTransactionFees > 0 ? fmtCurrency(card.foreignTransactionFees) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                  {card.otherFees > 0 ? fmtCurrency(card.otherFees) : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(card.totalFees)}</td>
                <td className="px-4 py-3">
                  {card.deductible ? (
                    <span className="text-[10px] font-bold bg-emerald-900 text-emerald-300 border border-emerald-700 px-1.5 py-0.5 rounded-full">
                      Yes
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded-full">
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700 bg-gray-900">
              <td className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</td>
              <td colSpan={4} className="hidden sm:table-cell" />
              <td className="px-4 py-3 text-right font-bold text-gray-100">{fmtCurrency(totalFees)}</td>
              <td className="px-4 py-3">
                <span className="text-xs text-emerald-400 font-semibold">{fmtCurrency(deductibleFees)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Substantiation score gauge */}
      <SubstantiationGauge items={data.substantiation} year={year} />

      {/* Footer note */}
      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">Disclaimer:</span> This report is generated from
        imported statement data and is intended to support tax preparation. Consult a qualified CPA or tax
        counsel before filing. IRC &#167;163(j) computations are based on estimated ATI and may differ from
        final return calculations.
      </div>
    </div>
  );
}

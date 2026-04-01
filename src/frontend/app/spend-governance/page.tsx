'use client';

// ============================================================
// /spend-governance — Spend Governance dashboard
// Transaction list with MCC category, risk score gauge,
// cash-like flag, business purpose tag.
// Risk summary cards (total, flagged, cash-like, chargeback ratio).
// Business-purpose evidence export button.
// Network rule violations alert panel.
// ============================================================

import { useState, useMemo } from 'react';
import {
  SpendClientSelector,
  SpendByCategoryChart,
  TransactionDetailModal,
  ViolationActionButtons,
} from '@/components/spend-governance';
import type { SpendClient, DateRange } from '@/components/spend-governance';
import { PLACEHOLDER_SPEND_BY_CATEGORY } from '@/components/spend-governance/SpendByCategoryChart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface Transaction {
  id: string;
  merchant: string;
  mccCode: string;
  mccCategory: string;
  amount: number;
  date: string;
  riskScore: number;       // 0–100
  riskLevel: RiskLevel;
  isCashLike: boolean;
  businessPurpose: string;
  flagged: boolean;
  chargedBack: boolean;
}

interface NetworkViolation {
  id: string;
  rule: string;
  network: 'Visa' | 'Mastercard' | 'Amex';
  severity: RiskLevel;
  merchant: string;
  date: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_TRANSACTIONS: Transaction[] = [
  {
    id: 'txn_001', merchant: 'Shell Gas Station', mccCode: '5541', mccCategory: 'Auto Fuel',
    amount: 284.50, date: '2026-03-30', riskScore: 18, riskLevel: 'low',
    isCashLike: false, businessPurpose: 'Fleet fuel — delivery vehicles', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_002', merchant: 'Vegas ATM Advance', mccCode: '6011', mccCategory: 'Cash Advance / ATM',
    amount: 1_500.00, date: '2026-03-29', riskScore: 91, riskLevel: 'critical',
    isCashLike: true, businessPurpose: 'Unverified', flagged: true, chargedBack: false,
  },
  {
    id: 'txn_003', merchant: 'Staples Business', mccCode: '5111', mccCategory: 'Office Supplies',
    amount: 637.20, date: '2026-03-29', riskScore: 12, riskLevel: 'low',
    isCashLike: false, businessPurpose: 'Office supplies — Q2 restock', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_004', merchant: 'Delta Airlines', mccCode: '3058', mccCategory: 'Airlines & Travel',
    amount: 4_210.00, date: '2026-03-28', riskScore: 44, riskLevel: 'medium',
    isCashLike: false, businessPurpose: 'Client meeting — SFO', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_005', merchant: 'MoneyGram Wire Svc', mccCode: '4829', mccCategory: 'Wire Transfer',
    amount: 9_750.00, date: '2026-03-27', riskScore: 88, riskLevel: 'high',
    isCashLike: true, businessPurpose: 'Unverified', flagged: true, chargedBack: false,
  },
  {
    id: 'txn_006', merchant: 'Hilton Hotels', mccCode: '3504', mccCategory: 'Lodging',
    amount: 1_820.00, date: '2026-03-27', riskScore: 21, riskLevel: 'low',
    isCashLike: false, businessPurpose: 'Sales conference — Chicago', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_007', merchant: 'CoinFlip Bitcoin ATM', mccCode: '6051', mccCategory: 'Crypto / Quasi-Cash',
    amount: 3_000.00, date: '2026-03-26', riskScore: 97, riskLevel: 'critical',
    isCashLike: true, businessPurpose: 'Unverified', flagged: true, chargedBack: true,
  },
  {
    id: 'txn_008', merchant: 'AWS Cloud Services', mccCode: '7372', mccCategory: 'SaaS / Technology',
    amount: 5_450.00, date: '2026-03-26', riskScore: 8, riskLevel: 'low',
    isCashLike: false, businessPurpose: 'Cloud infrastructure — prod env', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_009', merchant: 'Restaurant Supplies Co', mccCode: '5812', mccCategory: 'Restaurants',
    amount: 398.75, date: '2026-03-25', riskScore: 33, riskLevel: 'medium',
    isCashLike: false, businessPurpose: 'Client entertainment', flagged: false, chargedBack: false,
  },
  {
    id: 'txn_010', merchant: 'PayDay Advance Kiosk', mccCode: '6012', mccCategory: 'Payday / Financial',
    amount: 750.00, date: '2026-03-24', riskScore: 76, riskLevel: 'high',
    isCashLike: true, businessPurpose: 'Unverified', flagged: true, chargedBack: false,
  },
];

const PLACEHOLDER_VIOLATIONS: NetworkViolation[] = [
  {
    id: 'viol_001', rule: 'Visa Rule 10.3.2 — Quasi-Cash Restriction',
    network: 'Visa', severity: 'critical', merchant: 'CoinFlip Bitcoin ATM',
    date: '2026-03-26',
    description: 'Corporate card used at crypto/quasi-cash merchant. Violates cardholder agreement and may result in program termination.',
  },
  {
    id: 'viol_002', rule: 'MC Rule 5.10.1.1 — Card-Present ATM Advance',
    network: 'Mastercard', severity: 'high', merchant: 'Vegas ATM Advance',
    date: '2026-03-29',
    description: 'Cash advance on business card exceeds single-transaction limit. Automatic fraud review triggered.',
  },
  {
    id: 'viol_003', rule: 'Visa Rule 11.1 — Chargeback Threshold Warning',
    network: 'Visa', severity: 'high', merchant: 'CoinFlip Bitcoin ATM',
    date: '2026-03-26',
    description: 'Chargeback filed on flagged transaction. Cumulative chargeback ratio approaching Visa Early Warning threshold (0.65%).',
  },
  {
    id: 'viol_004', rule: 'Amex CPC Policy 4.2 — Wire Transfer Usage',
    network: 'Amex', severity: 'medium', merchant: 'MoneyGram Wire Svc',
    date: '2026-03-27',
    description: 'Commercial card used for wire transfer service. Requires pre-authorization and documented business purpose.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; dotClass: string; bgClass: string }> = {
  low:      { label: 'Low',      badgeClass: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400',  bgClass: 'bg-green-950' },
  medium:   { label: 'Medium',   badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', dotClass: 'bg-yellow-400', bgClass: 'bg-yellow-950' },
  high:     { label: 'High',     badgeClass: 'bg-orange-900 text-orange-300 border-orange-700', dotClass: 'bg-orange-400', bgClass: 'bg-orange-950' },
  critical: { label: 'Critical', badgeClass: 'bg-red-900 text-red-300 border-red-700',          dotClass: 'bg-red-400',    bgClass: 'bg-red-950' },
};

const NETWORK_COLORS: Record<string, string> = {
  Visa:       'bg-blue-900 text-blue-300 border-blue-700',
  Mastercard: 'bg-orange-900 text-orange-300 border-orange-700',
  Amex:       'bg-teal-900 text-teal-300 border-teal-700',
};

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function estimateCashAdvanceFee(amount: number): string {
  const low = (amount * 0.03).toFixed(2);
  const high = (amount * 0.05).toFixed(2);
  return `$${low}–$${high}`;
}

function isCashAdvanceCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return lower.includes('cash advance') || lower.includes('atm');
}

// Risk score gauge (mini SVG arc)
function RiskGauge({ score }: { score: number }) {
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : score >= 25 ? '#eab308' : '#22c55e';
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const dash = circ * pct;
  const gap = circ - dash;

  return (
    <div className="flex flex-col items-center">
      <svg width={44} height={44} viewBox="0 0 44 44" aria-label={`Risk score ${score}`}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="#1f2937" strokeWidth={5} />
        <circle
          cx={22} cy={22} r={r} fill="none"
          stroke={color} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform="rotate(-90 22 22)"
        />
        <text x={22} y={26} textAnchor="middle" fontSize={10} fontWeight="800" fill={color}>{score}</text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SpendGovernancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>(PLACEHOLDER_TRANSACTIONS);
  const [violations] = useState<NetworkViolation[]>(PLACEHOLDER_VIOLATIONS);
  const [txnFilter, setTxnFilter] = useState<'all' | 'flagged' | 'cash-like'>('all');
  const [exportLoading, setExportLoading] = useState(false);

  // SpendClientSelector state
  const [selectedClient, setSelectedClient] = useState<SpendClient | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [cardFilter, setCardFilter] = useState('All Cards');

  // TransactionDetailModal state
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Inline editing of business purpose
  const [editingPurposeId, setEditingPurposeId] = useState<string | null>(null);
  const [editingPurposeValue, setEditingPurposeValue] = useState('');

  // ViolationActionButtons — track acknowledged violations
  const [acknowledgedViolations, setAcknowledgedViolations] = useState<Set<string>>(new Set());

  // Summary stats
  const totalTxns = transactions.length;
  const flaggedCount = transactions.filter((t) => t.flagged).length;
  const cashLikeCount = transactions.filter((t) => t.isCashLike).length;
  const chargedBackCount = transactions.filter((t) => t.chargedBack).length;
  const chargebackRatio = totalTxns > 0 ? ((chargedBackCount / totalTxns) * 100).toFixed(2) : '0.00';
  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0);

  // Filter transactions based on txnFilter tabs
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (txnFilter === 'flagged') return t.flagged;
      if (txnFilter === 'cash-like') return t.isCashLike;
      return true;
    });
  }, [transactions, txnFilter]);

  // Export CSV with all columns
  function handleExport() {
    setExportLoading(true);
    setTimeout(() => {
      const headers = [
        'ID', 'Merchant', 'MCC Code', 'MCC Category', 'Amount', 'Date',
        'Risk Score', 'Risk Level', 'Cash-Like', 'Business Purpose',
        'Flagged', 'Charged Back',
      ];
      const rows = [
        headers.join(','),
        ...transactions.map((t) => [
          t.id,
          `"${t.merchant}"`,
          t.mccCode,
          `"${t.mccCategory}"`,
          t.amount.toFixed(2),
          t.date,
          t.riskScore,
          t.riskLevel,
          t.isCashLike ? 'Yes' : 'No',
          `"${t.businessPurpose}"`,
          t.flagged ? 'Yes' : 'No',
          t.chargedBack ? 'Yes' : 'No',
        ].join(',')),
      ].join('\n');

      const blob = new Blob([rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spend-governance-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportLoading(false);
    }, 600);
  }

  // Convert page Transaction to modal Transaction shape
  function openTransactionModal(t: Transaction) {
    setSelectedTransaction(t);
  }

  function handleSavePurpose(txnId: string, purpose: string) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, businessPurpose: purpose } : t)),
    );
    setSelectedTransaction(null);
  }

  function handleMarkReviewed(txnId: string) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txnId ? { ...t, flagged: false } : t)),
    );
    setSelectedTransaction(null);
  }

  // Inline business purpose editing
  function handleStartEditPurpose(txn: Transaction) {
    setEditingPurposeId(txn.id);
    setEditingPurposeValue(txn.businessPurpose === 'Unverified' ? '' : txn.businessPurpose);
  }

  function handleSaveInlinePurpose(txnId: string) {
    if (editingPurposeValue.trim()) {
      setTransactions((prev) =>
        prev.map((t) => (t.id === txnId ? { ...t, businessPurpose: editingPurposeValue.trim() } : t)),
      );
    }
    setEditingPurposeId(null);
    setEditingPurposeValue('');
  }

  function handleCancelEditPurpose() {
    setEditingPurposeId(null);
    setEditingPurposeValue('');
  }

  // Violation actions
  function handleAcknowledge(violationId: string) {
    setAcknowledgedViolations((prev) => new Set(prev).add(violationId));
  }

  function handleDocumentResponse(violationId: string) {
    // Placeholder: in production this would open a document editor or form
    alert(`Opening document response form for violation ${violationId}`);
  }

  // Build the modal transaction shape from page Transaction
  const modalTransaction = selectedTransaction
    ? {
        id: selectedTransaction.id,
        merchant: selectedTransaction.merchant,
        mcc: selectedTransaction.mccCode,
        category: selectedTransaction.mccCategory,
        amount: selectedTransaction.amount,
        date: selectedTransaction.date,
        riskScore: selectedTransaction.riskScore,
        flags: [
          ...(selectedTransaction.isCashLike ? ['Cash-Like'] : []),
          ...(selectedTransaction.flagged ? ['Flagged'] : []),
          ...(selectedTransaction.chargedBack ? ['Chargeback'] : []),
        ],
        businessPurpose:
          selectedTransaction.businessPurpose === 'Unverified'
            ? null
            : selectedTransaction.businessPurpose,
        card: cardFilter !== 'All Cards' ? cardFilter : 'Corporate Card',
        violations: PLACEHOLDER_VIOLATIONS
          .filter((v) => v.merchant === selectedTransaction.merchant)
          .map((v) => v.rule),
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Spend Governance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalTxns} transactions · {formatCurrency(totalAmount)} total spend
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-semibold transition-colors"
        >
          {exportLoading ? 'Exporting…' : 'Export Business Purpose Evidence'}
        </button>
      </div>

      {/* Client Selector — top of page, before KPI cards */}
      <div className="mb-6">
        <SpendClientSelector
          selectedClient={selectedClient}
          onClientSelect={setSelectedClient}
          onClear={() => setSelectedClient(null)}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          cardFilter={cardFilter}
          onCardFilterChange={setCardFilter}
        />
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Transactions', value: totalTxns, color: 'text-gray-100', sub: null },
          { label: 'Flagged Transactions', value: flaggedCount, color: flaggedCount > 0 ? 'text-red-400' : 'text-green-400', sub: null },
          { label: 'Cash-Like Transactions', value: cashLikeCount, color: cashLikeCount > 0 ? 'text-orange-400' : 'text-green-400', sub: null },
          { label: 'Chargeback Ratio', value: `${chargebackRatio}%`, color: parseFloat(chargebackRatio) >= 0.65 ? 'text-red-400' : 'text-green-400', sub: `${chargedBackCount} chargeback${chargedBackCount !== 1 ? 's' : ''}` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{card.label}</p>
            <p className={`text-3xl font-black ${card.color}`}>{card.value}</p>
            {card.sub && <p className="text-xs text-gray-500 mt-1">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* Spend by Category Chart — below KPI cards, above violations */}
      <div className="mb-6">
        <SpendByCategoryChart data={PLACEHOLDER_SPEND_BY_CATEGORY} />
      </div>

      {/* Network Rule Violations Alert Panel */}
      {violations.length > 0 && (
        <div className="rounded-xl border border-red-800 bg-red-950 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            <h2 className="text-sm font-bold text-red-300 uppercase tracking-wide">
              Network Rule Violations — {violations.length} Active
            </h2>
          </div>
          <div className="space-y-3">
            {violations.map((v) => (
              <div key={v.id} className={`rounded-lg border p-3 ${RISK_CONFIG[v.severity].bgClass} border-gray-700`}>
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[v.severity].badgeClass}`}>
                      {RISK_CONFIG[v.severity].label}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${NETWORK_COLORS[v.network]}`}>
                      {v.network}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{v.rule}</span>
                  </div>
                  <p className="text-xs text-gray-500 whitespace-nowrap">{formatDate(v.date)}</p>
                </div>
                <p className="text-sm font-semibold text-gray-100 mb-0.5">{v.merchant}</p>
                <p className="text-xs text-gray-400 mb-3">{v.description}</p>
                {/* Violation Action Buttons */}
                <ViolationActionButtons
                  violationId={v.id}
                  network={v.network}
                  acknowledged={acknowledgedViolations.has(v.id)}
                  onAcknowledge={handleAcknowledge}
                  onDocumentResponse={handleDocumentResponse}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Transactions</h2>
          <div className="flex gap-1">
            {(['all', 'flagged', 'cash-like'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTxnFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  txnFilter === f
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {f === 'all' ? 'All' : f === 'flagged' ? `Flagged (${flaggedCount})` : `Cash-Like (${cashLikeCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Merchant', 'MCC / Category', 'Amount', 'Date', 'Risk', 'Flags', 'Business Purpose'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openTransactionModal(t)}
                  className={`transition-colors hover:bg-gray-800/50 cursor-pointer ${t.flagged ? 'bg-red-950/20' : ''}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-100 whitespace-nowrap">{t.merchant}</p>
                    <p className="text-xs text-gray-500">{t.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-mono text-gray-400">{t.mccCode}</p>
                    <p className="text-xs text-gray-300">{t.mccCategory}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`font-bold tabular-nums ${t.amount >= 5000 ? 'text-orange-300' : 'text-gray-100'}`}>
                      {formatCurrency(t.amount)}
                    </p>
                    {/* Cash advance fee alert */}
                    {isCashAdvanceCategory(t.mccCategory) && (
                      <p className="text-xs text-amber-400 mt-1">
                        &#x26A0; Cash advance fee likely: ~{estimateCashAdvanceFee(t.amount)} (3-5%)
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(t.date)}
                  </td>
                  <td className="px-4 py-3">
                    <RiskGauge score={t.riskScore} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {t.isCashLike && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border bg-orange-900 text-orange-300 border-orange-700 w-fit">
                          Cash-Like
                        </span>
                      )}
                      {t.flagged && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border bg-red-900 text-red-300 border-red-700 w-fit">
                          Flagged
                        </span>
                      )}
                      {t.chargedBack && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded border bg-purple-900 text-purple-300 border-purple-700 w-fit">
                          Chargeback
                        </span>
                      )}
                      {!t.isCashLike && !t.flagged && !t.chargedBack && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs" onClick={(e) => e.stopPropagation()}>
                    {editingPurposeId === t.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingPurposeValue}
                          onChange={(e) => setEditingPurposeValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveInlinePurpose(t.id);
                            if (e.key === 'Escape') handleCancelEditPurpose();
                          }}
                          autoFocus
                          className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
                          placeholder="Enter business purpose..."
                        />
                        <button
                          onClick={() => handleSaveInlinePurpose(t.id)}
                          className="text-xs text-green-400 hover:text-green-300 font-semibold px-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditPurpose}
                          className="text-xs text-gray-500 hover:text-gray-300 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p
                        className={`text-xs ${
                          t.businessPurpose === 'Unverified'
                            ? 'text-red-400 font-semibold cursor-pointer hover:underline'
                            : 'text-gray-400'
                        }`}
                        onClick={() => {
                          if (t.businessPurpose === 'Unverified') handleStartEditPurpose(t);
                        }}
                        title={t.businessPurpose === 'Unverified' ? 'Click to add business purpose' : undefined}
                      >
                        {t.businessPurpose}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No transactions match this filter.
            </div>
          )}
        </div>
      </div>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={modalTransaction}
        isOpen={selectedTransaction !== null}
        onClose={() => setSelectedTransaction(null)}
        onSavePurpose={handleSavePurpose}
        onMarkReviewed={handleMarkReviewed}
      />
    </div>
  );
}

'use client';

// ============================================================
// /statements — Statement Reconciliation
// Statement list table with issuer, date, closing balance,
// reconciled status badge. Anomaly alerts panel (fee
// anomalies, balance mismatches). Upload/import button.
// Per-statement expandable detail rows with normalized data.
// ============================================================

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import AnomalyAlert from '../../components/modules/anomaly-alert';
import type { Anomaly } from '../../components/modules/anomaly-alert';
import DisputeLetterModal from '../../components/modules/dispute-letter-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReconcileStatus = 'reconciled' | 'pending' | 'mismatch' | 'importing';

interface NormalizedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  businessPurpose?: string;
}

interface Statement {
  id: string;
  issuer: string;
  cardName: string;
  last4: string;
  statementDate: string;
  closingBalance: number;
  openingBalance: number;
  totalCharges: number;
  totalCredits: number;
  totalFees: number;
  status: ReconcileStatus;
  importedAt?: string;
  transactions: NormalizedTransaction[];
}

interface StatementsClient {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CLIENTS: StatementsClient[] = [
  { id: 'st_001', legal_name: 'Apex Ventures LLC', entity_type: 'LLC', state: 'TX' },
  { id: 'st_002', legal_name: 'NovaGo Solutions', entity_type: 'S-Corp', state: 'CA' },
  { id: 'st_003', legal_name: 'Meridian Holdings', entity_type: 'C-Corp', state: 'NY' },
  { id: 'st_004', legal_name: 'Brightline Corp', entity_type: 'C-Corp', state: 'FL' },
  { id: 'st_005', legal_name: 'Thornwood Capital', entity_type: 'LLC', state: 'DE' },
];

const PLACEHOLDER_STATEMENTS: Statement[] = [
  {
    id: 'stmt_001',
    issuer: 'Chase',
    cardName: 'Ink Business Preferred',
    last4: '4821',
    statementDate: '2026-03-15',
    closingBalance: 48_320.00,
    openingBalance: 22_100.00,
    totalCharges: 31_420.00,
    totalCredits: 5_200.00,
    totalFees: 95.00,
    status: 'reconciled',
    importedAt: '2026-03-16T08:30:00Z',
    transactions: [
      { date: '2026-03-01', description: 'AMAZON WEB SERVICES', amount: 4_210.00, category: 'Software/SaaS', businessPurpose: 'Cloud infrastructure' },
      { date: '2026-03-05', description: 'DELTA AIRLINES', amount: 1_840.00, category: 'Travel', businessPurpose: 'Client meeting – NYC' },
      { date: '2026-03-08', description: 'OFFICE DEPOT #4421', amount: 340.00, category: 'Office Supplies' },
      { date: '2026-03-12', description: 'GOOGLE WORKSPACE', amount: 285.00, category: 'Software/SaaS', businessPurpose: 'Productivity suite' },
      { date: '2026-03-14', description: 'ANNUAL FEE', amount: 95.00, category: 'Card Fee' },
    ],
  },
  {
    id: 'stmt_002',
    issuer: 'Amex',
    cardName: 'Business Platinum',
    last4: '9034',
    statementDate: '2026-03-20',
    closingBalance: 72_140.00,
    openingBalance: 30_000.00,
    totalCharges: 45_600.00,
    totalCredits: 3_460.00,
    totalFees: 695.00,
    status: 'mismatch',
    importedAt: '2026-03-21T11:00:00Z',
    transactions: [
      { date: '2026-03-02', description: 'MARRIOTT HOTELS & RESORTS', amount: 3_280.00, category: 'Travel', businessPurpose: 'Executive retreat' },
      { date: '2026-03-07', description: 'STRIPE PAYMENTS', amount: 12_400.00, category: 'Payment Processing' },
      { date: '2026-03-10', description: 'ANNUAL FEE', amount: 695.00, category: 'Card Fee' },
      { date: '2026-03-17', description: 'SALESFORCE INC', amount: 6_450.00, category: 'Software/SaaS', businessPurpose: 'CRM platform' },
    ],
  },
  {
    id: 'stmt_003',
    issuer: 'Capital One',
    cardName: 'Spark Cash Plus',
    last4: '7712',
    statementDate: '2026-03-25',
    closingBalance: 19_850.00,
    openingBalance: 8_400.00,
    totalCharges: 12_900.00,
    totalCredits: 1_450.00,
    totalFees: 150.00,
    status: 'pending',
    transactions: [],
  },
  {
    id: 'stmt_004',
    issuer: 'Bank of America',
    cardName: 'Business Advantage Cash',
    last4: '3390',
    statementDate: '2026-02-28',
    closingBalance: 9_640.00,
    openingBalance: 4_200.00,
    totalCharges: 7_240.00,
    totalCredits: 1_800.00,
    totalFees: 0,
    status: 'reconciled',
    importedAt: '2026-03-01T09:15:00Z',
    transactions: [
      { date: '2026-02-10', description: 'ZOOM VIDEO COMMUNICATIONS', amount: 499.90, category: 'Software/SaaS', businessPurpose: 'Video conferencing' },
      { date: '2026-02-18', description: 'STAPLES BUSINESS', amount: 218.00, category: 'Office Supplies' },
      { date: '2026-02-22', description: 'FEDEX CORP', amount: 142.50, category: 'Shipping' },
    ],
  },
  {
    id: 'stmt_005',
    issuer: 'Citi',
    cardName: 'Business AAdvantage',
    last4: '5521',
    statementDate: '2026-03-10',
    closingBalance: 31_200.00,
    openingBalance: 14_800.00,
    totalCharges: 18_200.00,
    totalCredits: 1_800.00,
    totalFees: 99.00,
    status: 'importing',
    transactions: [],
  },
];

const PLACEHOLDER_ANOMALIES: Anomaly[] = [
  {
    id: 'ano_001',
    type: 'fee_anomaly',
    severity: 'high',
    description: 'Annual fee charged twice on Amex Business Platinum in the same billing cycle.',
    affectedCard: 'Amex Business Platinum',
    affectedCardLast4: '9034',
    issuer: 'Amex',
    amount: 1_390.00,
    expectedAmount: 695.00,
    detectedAt: '2026-03-21T11:05:00Z',
    suggestedAction: 'Contact Amex commercial servicing to request reversal of duplicate annual fee charge (ref: stmt_002). Escalate if unresolved within 5 business days.',
    statementId: 'stmt_002',
  },
  {
    id: 'ano_002',
    type: 'balance_mismatch',
    severity: 'medium',
    description: 'Closing balance on imported PDF does not match issuer portal balance by $340.00.',
    affectedCard: 'Amex Business Platinum',
    affectedCardLast4: '9034',
    issuer: 'Amex',
    amount: 72_480.00,
    expectedAmount: 72_140.00,
    detectedAt: '2026-03-21T11:06:00Z',
    suggestedAction: 'Re-download statement PDF directly from issuer portal and re-import. Check for pending transactions that may have posted after statement close.',
    statementId: 'stmt_002',
  },
  {
    id: 'ano_003',
    type: 'missing_transaction',
    severity: 'low',
    description: 'Stripe Payments charge ($12,400) present on statement but not found in expense system.',
    affectedCard: 'Amex Business Platinum',
    affectedCardLast4: '9034',
    issuer: 'Amex',
    amount: 12_400.00,
    detectedAt: '2026-03-22T09:00:00Z',
    suggestedAction: 'Sync expense management platform and re-run matching. If unmatched, manually categorize as Payment Processing with appropriate business purpose.',
    statementId: 'stmt_002',
  },
];

// Placeholder row-level transactions for expanded view
const EXPANDED_TRANSACTIONS: Record<string, { merchant: string; date: string; amount: number; category: string; matchStatus: 'matched' | 'unmatched' | 'pending' }[]> = {
  stmt_001: [
    { merchant: 'AMAZON WEB SERVICES', date: '2026-03-01', amount: 4210.00, category: 'Software/SaaS', matchStatus: 'matched' },
    { merchant: 'DELTA AIRLINES', date: '2026-03-05', amount: 1840.00, category: 'Travel', matchStatus: 'matched' },
    { merchant: 'OFFICE DEPOT #4421', date: '2026-03-08', amount: 340.00, category: 'Office Supplies', matchStatus: 'matched' },
    { merchant: 'GOOGLE WORKSPACE', date: '2026-03-12', amount: 285.00, category: 'Software/SaaS', matchStatus: 'matched' },
  ],
  stmt_002: [
    { merchant: 'MARRIOTT HOTELS & RESORTS', date: '2026-03-02', amount: 3280.00, category: 'Travel', matchStatus: 'matched' },
    { merchant: 'STRIPE PAYMENTS', date: '2026-03-07', amount: 12400.00, category: 'Payment Processing', matchStatus: 'unmatched' },
    { merchant: 'ANNUAL FEE', date: '2026-03-10', amount: 695.00, category: 'Card Fee', matchStatus: 'matched' },
    { merchant: 'SALESFORCE INC', date: '2026-03-17', amount: 6450.00, category: 'Software/SaaS', matchStatus: 'pending' },
  ],
  stmt_003: [
    { merchant: 'UBER BUSINESS', date: '2026-03-18', amount: 245.00, category: 'Travel', matchStatus: 'pending' },
    { merchant: 'SHOPIFY INC', date: '2026-03-20', amount: 1890.00, category: 'Software/SaaS', matchStatus: 'pending' },
    { merchant: 'COSTCO WHOLESALE', date: '2026-03-22', amount: 678.00, category: 'Office Supplies', matchStatus: 'pending' },
  ],
  stmt_004: [
    { merchant: 'ZOOM VIDEO COMMUNICATIONS', date: '2026-02-10', amount: 499.90, category: 'Software/SaaS', matchStatus: 'matched' },
    { merchant: 'STAPLES BUSINESS', date: '2026-02-18', amount: 218.00, category: 'Office Supplies', matchStatus: 'matched' },
    { merchant: 'FEDEX CORP', date: '2026-02-22', amount: 142.50, category: 'Shipping', matchStatus: 'matched' },
  ],
  stmt_005: [
    { merchant: 'HILTON HOTELS', date: '2026-03-02', amount: 2100.00, category: 'Travel', matchStatus: 'pending' },
    { merchant: 'MICROSOFT 365', date: '2026-03-05', amount: 549.00, category: 'Software/SaaS', matchStatus: 'pending' },
    { merchant: 'USPS POSTAGE', date: '2026-03-07', amount: 89.00, category: 'Shipping', matchStatus: 'pending' },
  ],
};

// Placeholder payments per statement
const EXPANDED_PAYMENTS: Record<string, { date: string; description: string; amount: number; method: string }[]> = {
  stmt_001: [
    { date: '2026-02-28', description: 'AutoPay - Full Balance', amount: 22_100.00, method: 'ACH' },
  ],
  stmt_002: [
    { date: '2026-02-25', description: 'Online Payment', amount: 15_000.00, method: 'ACH' },
    { date: '2026-03-10', description: 'Partial Payment', amount: 10_000.00, method: 'Wire' },
  ],
  stmt_003: [],
  stmt_004: [
    { date: '2026-02-15', description: 'AutoPay - Minimum Due', amount: 126.00, method: 'ACH' },
  ],
  stmt_005: [],
};

// Placeholder fees per statement (flagged = amber/red highlight)
const EXPANDED_FEES: Record<string, { date: string; description: string; amount: number; flagged: boolean; flagReason?: string }[]> = {
  stmt_001: [
    { date: '2026-03-14', description: 'Annual Fee', amount: 95.00, flagged: false },
  ],
  stmt_002: [
    { date: '2026-03-10', description: 'Annual Fee', amount: 695.00, flagged: true, flagReason: 'Duplicate charge detected' },
    { date: '2026-03-10', description: 'Annual Fee (duplicate)', amount: 695.00, flagged: true, flagReason: 'Duplicate — contact issuer for reversal' },
    { date: '2026-03-15', description: 'Late Payment Fee', amount: 39.00, flagged: true, flagReason: 'Payment was received on time — possible error' },
  ],
  stmt_003: [
    { date: '2026-03-25', description: 'Annual Fee', amount: 150.00, flagged: false },
  ],
  stmt_004: [],
  stmt_005: [
    { date: '2026-03-01', description: 'Annual Fee', amount: 99.00, flagged: false },
    { date: '2026-03-08', description: 'Foreign Transaction Fee', amount: 34.50, flagged: true, flagReason: 'Unexpected — card has no-FTF benefit' },
  ],
};

// Reconciliation diff data per statement
const RECON_DIFFS: Record<string, { statementBalance: number; ledgerBalance: number; difference: number; status: 'matched' | 'variance' | 'unreconciled'; notes: string } | null> = {
  stmt_001: { statementBalance: 48_320.00, ledgerBalance: 48_320.00, difference: 0, status: 'matched', notes: 'Balances match exactly. No action required.' },
  stmt_002: { statementBalance: 72_140.00, ledgerBalance: 72_480.00, difference: -340.00, status: 'variance', notes: 'Ledger shows $340.00 higher than statement. Likely caused by duplicate annual fee posted to ledger but reversed on statement. Investigate fee entries.' },
  stmt_003: null,
  stmt_004: { statementBalance: 9_640.00, ledgerBalance: 9_640.00, difference: 0, status: 'matched', notes: 'Balances match. Fully reconciled.' },
  stmt_005: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ReconcileStatus, { label: string; badgeClass: string; dotClass: string }> = {
  reconciled: { label: 'Reconciled', badgeClass: 'bg-emerald-900 text-emerald-300 border-emerald-700', dotClass: 'bg-emerald-400' },
  pending:    { label: 'Pending',    badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700',   dotClass: 'bg-yellow-400' },
  mismatch:   { label: 'Mismatch',   badgeClass: 'bg-red-900 text-red-300 border-red-700',            dotClass: 'bg-red-400' },
  importing:  { label: 'Importing',  badgeClass: 'bg-blue-900 text-blue-300 border-blue-700',         dotClass: 'bg-blue-400' },
};

const ISSUER_COLORS: Record<string, string> = {
  Chase:          'bg-blue-900 text-blue-200 border-blue-700',
  Amex:           'bg-emerald-900 text-emerald-200 border-emerald-700',
  'Capital One':  'bg-purple-900 text-purple-200 border-purple-700',
  'Bank of America': 'bg-amber-900 text-amber-200 border-amber-700',
  Citi:           'bg-red-900 text-red-200 border-red-700',
};

const CATEGORY_DOT: Record<string, string> = {
  'Software/SaaS': 'bg-blue-400',
  Travel:          'bg-purple-400',
  'Office Supplies': 'bg-yellow-400',
  'Card Fee':      'bg-red-400',
  'Payment Processing': 'bg-emerald-400',
  Shipping:        'bg-orange-400',
};

const MATCH_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  matched:   { label: 'Matched',   cls: 'text-emerald-400 bg-emerald-900 border-emerald-700' },
  unmatched: { label: 'Unmatched', cls: 'text-red-400 bg-red-900 border-red-700' },
  pending:   { label: 'Pending',   cls: 'text-yellow-400 bg-yellow-900 border-yellow-700' },
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ReconcileStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass} ${status === 'importing' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function IssuerBadge({ issuer }: { issuer: string }) {
  const cls = ISSUER_COLORS[issuer] ?? 'bg-gray-800 text-gray-300 border-gray-700';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cls}`}>
      {issuer}
    </span>
  );
}

function ExpandedDetail({ stmt, onReconcile }: { stmt: Statement; onReconcile: (id: string) => void }) {
  const txns = EXPANDED_TRANSACTIONS[stmt.id] ?? [];
  const payments = EXPANDED_PAYMENTS[stmt.id] ?? [];
  const fees = EXPANDED_FEES[stmt.id] ?? [];
  const reconDiff = RECON_DIFFS[stmt.id] ?? null;

  if (stmt.transactions.length === 0 && txns.length === 0 && stmt.status !== 'importing') {
    return (
      <div className="px-4 pb-4 pt-2">
        <p className="text-sm text-gray-500 italic">No transaction detail available.</p>
      </div>
    );
  }

  if (stmt.status === 'importing') {
    return (
      <div className="px-4 pb-4 pt-2">
        <p className="text-sm text-gray-500 italic">Import in progress...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2 border-t border-gray-800 space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Opening Balance', value: fmtCurrency(stmt.openingBalance), color: 'text-gray-300' },
          { label: 'Total Charges',   value: fmtCurrency(stmt.totalCharges),   color: 'text-red-400' },
          { label: 'Total Credits',   value: fmtCurrency(stmt.totalCredits),   color: 'text-emerald-400' },
          { label: 'Total Fees',      value: fmtCurrency(stmt.totalFees),      color: stmt.totalFees > 0 ? 'text-yellow-400' : 'text-gray-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
            <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Transactions table ── */}
      {txns.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Transactions</h4>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Date</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Description</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Amount</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Category</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Match</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx, i) => {
                  const mCfg = MATCH_STATUS_CONFIG[tx.matchStatus];
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                    >
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                      <td className="px-3 py-2 text-gray-200 font-medium">{tx.merchant}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-200 whitespace-nowrap">
                        {fmtCurrency(tx.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${CATEGORY_DOT[tx.category] ?? 'bg-gray-500'}`} />
                          <span className="text-gray-400">{tx.category}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${mCfg.cls}`}>
                          {mCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payments section ── */}
      <div>
        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Payments</h4>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No payments recorded for this statement period.</p>
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Date</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Description</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Amount</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
                  >
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-3 py-2 text-gray-200 font-medium">{p.description}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-400 whitespace-nowrap">
                      -{fmtCurrency(p.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-gray-800 text-gray-300 border-gray-700">
                        {p.method}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Fees section (flagged items in amber/red) ── */}
      <div>
        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Fees</h4>
        {fees.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No fees on this statement.</p>
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Date</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Description</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Amount</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-800 last:border-0 ${
                      fee.flagged
                        ? 'bg-amber-950/40 border-l-2 border-l-red-500'
                        : i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'
                    }`}
                  >
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(fee.date)}</td>
                    <td className="px-3 py-2">
                      <span className={fee.flagged ? 'text-amber-200 font-semibold' : 'text-gray-200 font-medium'}>
                        {fee.description}
                      </span>
                      {fee.flagged && fee.flagReason && (
                        <p className="text-[10px] text-red-400 mt-0.5">{fee.flagReason}</p>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${fee.flagged ? 'text-red-400' : 'text-gray-200'}`}>
                      {fmtCurrency(fee.amount)}
                    </td>
                    <td className="px-3 py-2">
                      {fee.flagged ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700">
                          Flagged
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-gray-800 text-gray-400 border-gray-700">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reconciliation diff callout ── */}
      {reconDiff && (
        <div className={`rounded-xl border p-4 ${
          reconDiff.status === 'matched'
            ? 'border-emerald-800 bg-emerald-950/20'
            : 'border-amber-700 bg-amber-950/20'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {reconDiff.status === 'matched' ? (
              <svg className="h-4 w-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <h4 className={`text-sm font-bold ${reconDiff.status === 'matched' ? 'text-emerald-300' : 'text-amber-300'}`}>
              Reconciliation {reconDiff.status === 'matched' ? 'Matched' : 'Variance Detected'}
            </h4>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Statement Balance</p>
              <p className="text-sm font-bold text-gray-200 mt-0.5">{fmtCurrency(reconDiff.statementBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Internal Ledger</p>
              <p className="text-sm font-bold text-gray-200 mt-0.5">{fmtCurrency(reconDiff.ledgerBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Difference</p>
              <p className={`text-sm font-bold mt-0.5 ${
                reconDiff.difference === 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {reconDiff.difference === 0 ? '$0.00' : fmtCurrency(reconDiff.difference)}
              </p>
            </div>
          </div>
          <p className={`text-xs ${reconDiff.status === 'matched' ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
            {reconDiff.notes}
          </p>
        </div>
      )}

      {/* Mark Reconciled button */}
      {stmt.status !== 'reconciled' && (
        <button
          onClick={() => onReconcile(stmt.id)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs font-bold transition-colors border border-emerald-600"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Mark Statement Reconciled
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-[slideUp_0.3s_ease-out] bg-gray-800 border border-gray-600 text-gray-100 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 text-sm font-medium">
      <svg className="h-4 w-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {message}
      <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-2">
        &#10005;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client Selector
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function StatementsClientSelector({
  selectedClient,
  onClientSelect,
  onClear,
}: {
  selectedClient: StatementsClient | null;
  onClientSelect: (client: StatementsClient) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      PLACEHOLDER_CLIENTS.filter((c) =>
        c.legal_name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        c.entity_type.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        c.state.toLowerCase().includes(debouncedQuery.toLowerCase()),
      ),
    [debouncedQuery],
  );

  useEffect(() => {
    setHighlightIndex(-1);
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filtered.length) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    }
  }, [filtered, highlightIndex]);

  function handleSelect(client: StatementsClient) {
    onClientSelect(client);
    setQuery('');
    setIsOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery('');
  }

  // Highlight matching text
  function highlightMatch(text: string) {
    if (!debouncedQuery) return text;
    const idx = text.toLowerCase().indexOf(debouncedQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-[#C9A84C] font-bold">{text.slice(idx, idx + debouncedQuery.length)}</span>
        {text.slice(idx + debouncedQuery.length)}
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Statement Client
      </p>

      {!selectedClient && (
        <div className="relative max-w-md">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search clients by name, type, or state..."
              className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-autocomplete="list"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors text-sm"
                aria-label="Clear search"
              >
                &#10005;
              </button>
            )}
          </div>
          {isOpen && (
            <ul
              className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center">
                  <p className="text-sm text-gray-500">No clients found</p>
                  <p className="text-xs text-gray-600 mt-1">Try a different search term</p>
                </li>
              ) : (
                filtered.map((client, i) => (
                  <li key={client.id} role="option" aria-selected={i === highlightIndex}>
                    <button
                      type="button"
                      onClick={() => handleSelect(client)}
                      onMouseEnter={() => setHighlightIndex(i)}
                      className={`w-full text-left px-3 py-2.5 text-sm outline-none transition-colors flex items-center justify-between ${
                        i === highlightIndex ? 'bg-gray-800' : 'hover:bg-gray-800'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-gray-100">{highlightMatch(client.legal_name)}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {client.entity_type} &middot; {client.state}
                        </span>
                      </div>
                      <svg className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Select a client to view their statement reconciliation data.
          </p>
        </div>
      )}

      {selectedClient && (
        <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/5 px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-[#C9A84C]/20 flex items-center justify-center text-[10px] text-[#C9A84C] font-bold">
            {selectedClient.legal_name.charAt(0)}
          </span>
          <span className="text-sm font-medium text-gray-100">{selectedClient.legal_name}</span>
          <span className="text-xs text-gray-400">
            {selectedClient.entity_type} &middot; {selectedClient.state}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 flex-shrink-0 rounded-full p-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            aria-label="Clear selected client"
          >
            &#10005;
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Modal
// ---------------------------------------------------------------------------

interface ParsedStatementResult {
  issuer: string;
  cardLast4: string;
  statementDate: string;
  closingBalance: number;
  txnCount: number;
}

const MOCK_PARSED_RESULT: ParsedStatementResult = {
  issuer: 'Wells Fargo',
  cardLast4: '6218',
  statementDate: '2026-04-01',
  closingBalance: 15_780.00,
  txnCount: 17,
};

function UploadModal({ onClose, onImport }: { onClose: () => void; onImport: (stmt: Statement) => void }) {
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedStatementResult | null>(null);

  // Manual form state
  const [manualIssuer, setManualIssuer] = useState('');
  const [manualCard, setManualCard] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualBalance, setManualBalance] = useState('');

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const hasPdf = files.some((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length > 0 && !hasPdf) {
      // Only accept PDF
      return;
    }
    simulateParse();
  }

  function handleFileSelect() {
    simulateParse();
  }

  function simulateParse() {
    setParsing(true);
    setParsed(null);
    setTimeout(() => {
      setParsing(false);
      setParsed(MOCK_PARSED_RESULT);
    }, 2000);
  }

  function handleImport() {
    if (!parsed) return;
    const newStmt: Statement = {
      id: `stmt_import_${Date.now()}`,
      issuer: parsed.issuer,
      cardName: 'Business Elite',
      last4: parsed.cardLast4,
      statementDate: parsed.statementDate,
      closingBalance: parsed.closingBalance,
      openingBalance: parsed.closingBalance * 0.6,
      totalCharges: parsed.closingBalance * 0.5,
      totalCredits: parsed.closingBalance * 0.1,
      totalFees: 125.00,
      status: 'pending',
      importedAt: new Date().toISOString(),
      transactions: [],
    };
    onImport(newStmt);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Upload / Import Statement</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none">
            &#10005;
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => { setMode('upload'); setParsed(null); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                mode === 'upload'
                  ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
              }`}
            >
              Upload PDF
            </button>
            <button
              onClick={() => { setMode('manual'); setParsed(null); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                mode === 'manual'
                  ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
              }`}
            >
              Enter Manually
            </button>
          </div>
        </div>

        <div className="px-5 pb-5">
          {mode === 'upload' && (
            <>
              {/* Drop zone — PDF only */}
              {!parsed && !parsing && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                      : 'border-gray-700 hover:border-gray-500 bg-gray-800/30'
                  }`}
                  onClick={handleFileSelect}
                >
                  <svg className="h-10 w-10 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  <p className="text-sm text-gray-300 font-medium">
                    Drop PDF statement here
                  </p>
                  <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                  <p className="text-[10px] text-gray-600 mt-3">
                    Accepted format: PDF
                  </p>
                </div>
              )}

              {/* Parsing animation */}
              {parsing && (
                <div className="border border-gray-700 rounded-xl p-8 text-center bg-gray-800/30">
                  <div className="h-8 w-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-300 font-medium">Parsing...</p>
                  <p className="text-xs text-gray-500 mt-1">Extracting statement data from PDF</p>
                </div>
              )}

              {/* Parsed results */}
              {parsed && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm font-bold text-emerald-300">Statement Parsed Successfully</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Issuer', value: parsed.issuer },
                        { label: 'Card Last 4', value: `···${parsed.cardLast4}` },
                        { label: 'Statement Date', value: fmtDate(parsed.statementDate) },
                        { label: 'Closing Balance', value: fmtCurrency(parsed.closingBalance) },
                        { label: 'Transaction Count', value: `${parsed.txnCount} found` },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
                          <p className="text-xs text-gray-200 font-medium mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      className="flex-1 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors"
                    >
                      Import Statement
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors border border-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1">Issuer</label>
                <input
                  type="text"
                  value={manualIssuer}
                  onChange={(e) => setManualIssuer(e.target.value)}
                  placeholder="e.g. Chase, Amex..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1">Card Name</label>
                <input
                  type="text"
                  value={manualCard}
                  onChange={(e) => setManualCard(e.target.value)}
                  placeholder="e.g. Ink Business Preferred"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1">Statement Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1">Closing Balance</label>
                  <input
                    type="text"
                    value={manualBalance}
                    onChange={(e) => setManualBalance(e.target.value)}
                    placeholder="$0.00"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors mt-2"
              >
                Add Statement
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investigation Modal
// ---------------------------------------------------------------------------

function InvestigationModal({
  anomaly,
  onClose,
  onToast,
}: {
  anomaly: Anomaly;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [contactDone, setContactDone] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [disputeLogged, setDisputeLogged] = useState(false);
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  const stepsComplete = [contactDone, disputeLogged, reminderSet].filter(Boolean).length;
  const allComplete = stepsComplete === 3;

  // Compute follow-up date (5 business days from now)
  function getFollowUpDate(): string {
    const d = new Date();
    let added = 0;
    while (added < 5) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Mock POST helper — simulates a 400ms network call
  function mockPost(endpoint: string, _body: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-console
      console.log(`[mock POST] ${endpoint}`, _body);
      setTimeout(resolve, 400);
    });
  }

  async function handleContactDone() {
    if (contactDone || contactLoading) return;
    setContactLoading(true);
    await mockPost('/api/investigations/contact-issuer', {
      anomalyId: anomaly.id,
      issuer: anomaly.issuer,
    });
    setContactDone(true);
    setContactLoading(false);
    onToast('Issuer contacted — step 1 of 3 complete');
  }

  async function handleLogDispute() {
    if (disputeLogged || disputeLoading) return;
    setDisputeLoading(true);
    await mockPost('/api/investigations/log-dispute', {
      anomalyId: anomaly.id,
      card: anomaly.affectedCard,
    });
    setDisputeLogged(true);
    setDisputeLoading(false);
    onToast('Dispute logged');
  }

  async function handleSetReminder() {
    if (reminderSet || reminderLoading) return;
    setReminderLoading(true);
    const followUpDate = getFollowUpDate();
    await mockPost('/api/investigations/set-reminder', {
      anomalyId: anomaly.id,
      followUpDate,
    });
    setReminderSet(true);
    setReminderLoading(false);
    onToast(`Reminder set for ${followUpDate}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">
            {allComplete ? 'Investigation Complete' : 'Investigate Anomaly'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none">
            &#10005;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Anomaly summary */}
          <div className={`rounded-xl border p-3 transition-colors ${allComplete ? 'border-emerald-800 bg-emerald-950/30' : 'border-orange-800 bg-orange-950/30'}`}>
            <p className={`text-sm font-semibold ${allComplete ? 'text-emerald-300' : 'text-orange-300'}`}>{anomaly.description}</p>
            <div className="flex gap-4 mt-2">
              {anomaly.amount !== undefined && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Amount</p>
                  <p className={`text-xs font-bold ${allComplete ? 'text-emerald-300' : 'text-orange-300'}`}>{fmtCurrency(anomaly.amount)}</p>
                </div>
              )}
              {anomaly.statementId && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Reference</p>
                  <p className="text-xs text-gray-300 font-mono">{anomaly.statementId}</p>
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${allComplete ? 'bg-emerald-500' : 'bg-[#C9A84C]'}`}
                style={{ width: `${(stepsComplete / 3) * 100}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold ${allComplete ? 'text-emerald-400' : 'text-gray-500'}`}>{stepsComplete}/3</span>
          </div>

          {/* Investigation complete banner */}
          {allComplete && (
            <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-3 flex items-center gap-3">
              <svg className="h-5 w-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-bold text-emerald-300">All investigation steps completed successfully.</p>
            </div>
          )}

          {/* Step 1: Contact issuer */}
          <div className={`rounded-xl border p-3 transition-colors ${contactDone ? 'border-emerald-800 bg-emerald-950/20' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${contactDone ? 'bg-emerald-800 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                    {contactDone ? '\u2713' : '1'}
                  </span>
                  <p className="text-sm font-semibold text-gray-200">Contact Issuer</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  Call {anomaly.issuer ?? 'issuer'} commercial servicing
                </p>
                <p className="text-xs text-gray-500 mt-0.5 ml-7 font-mono">
                  1-800-453-9719 (Business line)
                </p>
              </div>
              <button
                onClick={handleContactDone}
                disabled={contactDone || contactLoading}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  contactDone
                    ? 'bg-emerald-900 text-emerald-400 cursor-default border border-emerald-700'
                    : contactLoading
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
                }`}
              >
                {contactLoading ? 'Saving...' : contactDone ? 'Done' : 'Mark Done'}
              </button>
            </div>
          </div>

          {/* Step 2: Log dispute */}
          <div className={`rounded-xl border p-3 transition-colors ${disputeLogged ? 'border-emerald-800 bg-emerald-950/20' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${disputeLogged ? 'bg-emerald-800 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                    {disputeLogged ? '\u2713' : '2'}
                  </span>
                  <p className="text-sm font-semibold text-gray-200">Log Dispute</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  Create formal dispute record for {anomaly.affectedCard}
                </p>
              </div>
              <button
                onClick={handleLogDispute}
                disabled={disputeLogged || disputeLoading}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  disputeLogged
                    ? 'bg-emerald-900 text-emerald-400 cursor-default border border-emerald-700'
                    : disputeLoading
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
                }`}
              >
                {disputeLoading ? 'Saving...' : disputeLogged ? 'Logged' : 'Log Dispute'}
              </button>
            </div>
          </div>

          {/* Step 3: Set follow-up reminder */}
          <div className={`rounded-xl border p-3 transition-colors ${reminderSet ? 'border-emerald-800 bg-emerald-950/20' : 'border-gray-700 bg-gray-800/30'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${reminderSet ? 'bg-emerald-800 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                    {reminderSet ? '\u2713' : '3'}
                  </span>
                  <p className="text-sm font-semibold text-gray-200">Set Follow-up Reminder</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  Schedule a 5 business day follow-up to check resolution status
                </p>
              </div>
              <button
                onClick={handleSetReminder}
                disabled={reminderSet || reminderLoading}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                  reminderSet
                    ? 'bg-emerald-900 text-emerald-400 cursor-default border border-emerald-700'
                    : reminderLoading
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
                }`}
              >
                {reminderLoading ? 'Saving...' : reminderSet ? 'Set' : 'Set Reminder'}
              </button>
            </div>
          </div>

          {/* Close / finish */}
          {allComplete && (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-bold transition-colors border border-emerald-600"
            >
              Investigation Complete - Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dismiss Confirmation Modal
// ---------------------------------------------------------------------------

function DismissConfirmModal({
  anomaly,
  onConfirm,
  onCancel,
}: {
  anomaly: Anomaly;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">Dismiss High-Severity Alert?</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-300 mb-1">{anomaly.description}</p>
          {anomaly.amount !== undefined && (
            <p className="text-xs text-orange-400 font-bold mb-3">Amount: {fmtCurrency(anomaly.amount)}</p>
          )}
          <p className="text-xs text-gray-500">
            This is a high-severity anomaly. Are you sure you want to dismiss it without investigation?
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-red-100 text-sm font-bold transition-colors border border-red-600"
          >
            Dismiss Anyway
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold transition-colors border border-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StatementsPage() {
  const [statements, setStatements] = useState<Statement[]>(PLACEHOLDER_STATEMENTS);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(PLACEHOLDER_ANOMALIES);
  const [expandedStatements, setExpandedStatements] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<ReconcileStatus | 'all'>('all');
  const [showAnomalies, setShowAnomalies] = useState(true);

  // Modal states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [investigationModal, setInvestigationModal] = useState<Anomaly | null>(null);
  const [dismissConfirm, setDismissConfirm] = useState<Anomaly | null>(null);
  const [disputeLetterAnomaly, setDisputeLetterAnomaly] = useState<Anomaly | null>(null);

  // Client selector
  const [selectedClient, setSelectedClient] = useState<StatementsClient | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const filtered = filterStatus === 'all'
    ? statements
    : statements.filter((s) => s.status === filterStatus);

  const mismatchCount   = statements.filter((s) => s.status === 'mismatch').length;
  const pendingCount    = statements.filter((s) => s.status === 'pending').length;
  const reconciledCount = statements.filter((s) => s.status === 'reconciled').length;
  const activeAnomalies = anomalies.filter((a) => a.severity === 'critical' || a.severity === 'high');

  function toggleExpand(id: string) {
    setExpandedStatements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Mock POST helper for dismiss logging
  function mockPostDismiss(anomalyId: string) {
    // eslint-disable-next-line no-console
    console.log('[mock POST] /api/anomalies/dismiss', { anomalyId });
    // Fire-and-forget — optimistic UI
  }

  function dismissAnomaly(id: string) {
    const anomaly = anomalies.find((a) => a.id === id);
    if (!anomaly) return;

    if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
      setDismissConfirm(anomaly);
      return;
    }

    // Optimistically remove from UI, fire mock POST
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
    mockPostDismiss(id);
    setToast('Anomaly dismissed');
  }

  function confirmDismiss() {
    if (!dismissConfirm) return;
    // Optimistically remove from UI, fire mock POST
    setAnomalies((prev) => prev.filter((a) => a.id !== dismissConfirm.id));
    mockPostDismiss(dismissConfirm.id);
    setToast('Anomaly dismissed');
    setDismissConfirm(null);
  }

  function handleReconcile(stmtId: string) {
    setStatements((prev) =>
      prev.map((s) => (s.id === stmtId ? { ...s, status: 'reconciled' as ReconcileStatus } : s)),
    );
    setToast('Statement marked as reconciled');
  }

  const showToast = useCallback(() => setToast(null), []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Client selector */}
      <div className="mb-6">
        <StatementsClientSelector
          selectedClient={selectedClient}
          onClientSelect={setSelectedClient}
          onClear={() => setSelectedClient(null)}
        />
      </div>

      {/* Empty state when no client selected */}
      {!selectedClient && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-300 mb-1">No Client Selected</h2>
          <p className="text-sm text-gray-500 max-w-sm mb-4">
            Search and select a client above to view their statement reconciliation data, anomaly alerts, and dispute tools.
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              {PLACEHOLDER_CLIENTS.length} clients available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              {PLACEHOLDER_STATEMENTS.length} total statements
            </span>
          </div>
        </div>
      )}

      {/* Main content — only visible when a client is selected */}
      {selectedClient && (
        <>
          {/* Page header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Statement Reconciliation
                <span className="text-[#C9A84C]"> — {selectedClient.legal_name}</span>
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {statements.length} statements · {reconciledCount} reconciled
                {mismatchCount > 0 && (
                  <span className="ml-2 text-red-400 font-semibold">
                    {mismatchCount} mismatch{mismatchCount > 1 ? 'es' : ''}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="ml-2 text-yellow-400 font-semibold">
                    {pendingCount} pending
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-bold transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v13m-4-4l4 4 4-4" />
              </svg>
              Upload / Import
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Statements', value: statements.length, color: 'text-gray-100' },
              { label: 'Reconciled',       value: reconciledCount,   color: 'text-emerald-400' },
              { label: 'Mismatches',       value: mismatchCount,     color: mismatchCount > 0 ? 'text-red-400' : 'text-gray-500' },
              { label: 'Anomalies',        value: anomalies.length,  color: anomalies.length > 0 ? 'text-yellow-400' : 'text-gray-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">{label}</p>
                <p className={`text-3xl font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Anomaly alerts panel */}
          {anomalies.length > 0 && (
            <div className="rounded-xl border border-orange-800 bg-orange-950/30 p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                  <h2 className="text-sm font-bold text-orange-300 uppercase tracking-wide">
                    Anomaly Alerts
                  </h2>
                  <span className="text-[10px] bg-orange-900 text-orange-300 border border-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                    {anomalies.length}
                  </span>
                </div>
                <button
                  onClick={() => setShowAnomalies((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showAnomalies ? 'Collapse' : 'Expand'}
                </button>
              </div>

              {showAnomalies && (
                <div className="space-y-3">
                  {/* Critical/high first */}
                  {activeAnomalies.length > 0 && (
                    <div className="space-y-2">
                      {activeAnomalies.map((a) => (
                        <div key={a.id}>
                          <AnomalyAlert
                            anomaly={a}
                            onDismiss={dismissAnomaly}
                            onAction={(anomaly) => {
                              setInvestigationModal(anomaly);
                            }}
                          />
                          <div className="flex justify-end mt-1.5 mr-1">
                            <button
                              onClick={() => setDisputeLetterAnomaly(a)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30 transition-colors"
                            >
                              <span className="text-sm">&#10022;</span>
                              Generate Dispute Letter
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Lower severity compact */}
                  {anomalies.filter((a) => a.severity === 'medium' || a.severity === 'low').map((a) => (
                    <div key={a.id}>
                      <AnomalyAlert
                        anomaly={a}
                        compact
                        onDismiss={dismissAnomaly}
                      />
                      <div className="flex justify-end mt-1 mr-1">
                        <button
                          onClick={() => setDisputeLetterAnomaly(a)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30 transition-colors"
                        >
                          <span className="text-xs">&#10022;</span>
                          Generate Dispute Letter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide mr-1">Filter:</span>
            {(['all', 'reconciled', 'mismatch', 'pending', 'importing'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                  filterStatus === s
                    ? 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]'
                    : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          {/* Statements table */}
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-500 text-xs font-semibold uppercase tracking-wide">Issuer / Card</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs font-semibold uppercase tracking-wide">Statement Date</th>
                  <th className="text-right px-4 py-3 text-gray-500 text-xs font-semibold uppercase tracking-wide">Closing Balance</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs font-semibold uppercase tracking-wide hidden sm:table-cell">Imported</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((stmt) => {
                  const isExpanded = expandedStatements.has(stmt.id);
                  const hasAnomalies = anomalies.some((a) => a.statementId === stmt.id);

                  return (
                    <>
                      <tr
                        key={stmt.id}
                        className={`border-b border-gray-800 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-gray-900' : 'bg-gray-950 hover:bg-gray-900'
                        }`}
                        onClick={() => toggleExpand(stmt.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <IssuerBadge issuer={stmt.issuer} />
                            {hasAnomalies && (
                              <span className="h-2 w-2 rounded-full bg-orange-400 flex-shrink-0" title="Has anomalies" />
                            )}
                          </div>
                          <p className="text-gray-200 font-semibold mt-0.5 text-xs">
                            {stmt.cardName}
                            <span className="text-gray-500 font-normal ml-1">···{stmt.last4}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtDate(stmt.statementDate)}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-100 whitespace-nowrap">
                          {fmtCurrency(stmt.closingBalance)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={stmt.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                          {stmt.importedAt ? fmtDate(stmt.importedAt) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <svg
                            className={`h-4 w-4 text-gray-500 inline-block transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${stmt.id}-detail`} className="bg-gray-900">
                          <td colSpan={6} className="p-0">
                            <ExpandedDetail stmt={stmt} onReconcile={handleReconcile} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-600 text-sm">
                      No statements match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modals */}
      {uploadModalOpen && (
        <UploadModal
          onClose={() => setUploadModalOpen(false)}
          onImport={(newStmt) => {
            setStatements((prev) => [...prev, newStmt]);
            setToast(`Imported statement from ${newStmt.issuer} ···${newStmt.last4}`);
          }}
        />
      )}
      {investigationModal && (
        <InvestigationModal
          anomaly={investigationModal}
          onClose={() => setInvestigationModal(null)}
          onToast={setToast}
        />
      )}
      {dismissConfirm && (
        <DismissConfirmModal
          anomaly={dismissConfirm}
          onConfirm={confirmDismiss}
          onCancel={() => setDismissConfirm(null)}
        />
      )}
      {disputeLetterAnomaly && (
        <DisputeLetterModal
          anomaly={disputeLetterAnomaly}
          clientName={selectedClient?.legal_name}
          onClose={() => setDisputeLetterAnomaly(null)}
          onSave={(letter) => {
            setToast('Dispute letter saved successfully');
            setDisputeLetterAnomaly(null);
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={showToast} />}
    </div>
  );
}

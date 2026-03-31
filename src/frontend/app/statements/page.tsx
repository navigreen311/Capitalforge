'use client';

// ============================================================
// /statements — Statement Reconciliation
// Statement list table with issuer, date, closing balance,
// reconciled status badge. Anomaly alerts panel (fee
// anomalies, balance mismatches). Upload/import button.
// Per-statement expandable detail rows with normalized data.
// ============================================================

import { useState } from 'react';
import AnomalyAlert from '../../components/modules/anomaly-alert';
import type { Anomaly } from '../../components/modules/anomaly-alert';

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

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

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

function ExpandedDetail({ stmt }: { stmt: Statement }) {
  if (stmt.transactions.length === 0) {
    return (
      <div className="px-4 pb-4 pt-2">
        <p className="text-sm text-gray-500 italic">
          {stmt.status === 'importing' ? 'Import in progress…' : 'No transaction detail available.'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2 border-t border-gray-800">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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

      {/* Transactions table */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800">
              <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Date</th>
              <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Description</th>
              <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Category</th>
              <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Business Purpose</th>
              <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody>
            {stmt.transactions.map((tx, i) => (
              <tr
                key={i}
                className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950'}`}
              >
                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
                <td className="px-3 py-2 text-gray-200 font-medium">{tx.description}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${CATEGORY_DOT[tx.category] ?? 'bg-gray-500'}`} />
                    <span className="text-gray-400">{tx.category}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 italic">
                  {tx.businessPurpose ?? <span className="text-gray-700">—</span>}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-200 whitespace-nowrap">
                  {fmtCurrency(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StatementsPage() {
  const [statements] = useState<Statement[]>(PLACEHOLDER_STATEMENTS);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(PLACEHOLDER_ANOMALIES);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ReconcileStatus | 'all'>('all');
  const [showAnomalies, setShowAnomalies] = useState(true);

  const filtered = filterStatus === 'all'
    ? statements
    : statements.filter((s) => s.status === filterStatus);

  const mismatchCount   = statements.filter((s) => s.status === 'mismatch').length;
  const pendingCount    = statements.filter((s) => s.status === 'pending').length;
  const reconciledCount = statements.filter((s) => s.status === 'reconciled').length;
  const activeAnomalies = anomalies.filter((a) => a.severity === 'critical' || a.severity === 'high');

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function dismissAnomaly(id: string) {
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Statement Reconciliation</h1>
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
          onClick={() => alert('Upload/import modal — stub')}
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
                    <AnomalyAlert
                      key={a.id}
                      anomaly={a}
                      onDismiss={dismissAnomaly}
                      onAction={(anomaly) => {
                        setExpandedId(anomaly.statementId ?? null);
                      }}
                    />
                  ))}
                </div>
              )}
              {/* Lower severity compact */}
              {anomalies.filter((a) => a.severity === 'medium' || a.severity === 'low').map((a) => (
                <AnomalyAlert
                  key={a.id}
                  anomaly={a}
                  compact
                  onDismiss={dismissAnomaly}
                />
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
              const isExpanded = expandedId === stmt.id;
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
                        <ExpandedDetail stmt={stmt} />
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
    </div>
  );
}

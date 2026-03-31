'use client';

// ============================================================
// /billing — Revenue Ops & Billing
// Invoices table with status badges (draft/issued/paid/refunded),
// amount, due date, client.
// Generate invoice button with deal structure selector.
// Commission tracking tab (partner/advisor commissions with status).
// SaaS usage metering panel.
// ============================================================

import { useState } from 'react';
import UsageMeter from '../../components/modules/usage-meter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'refunded' | 'overdue';
type CommissionStatus = 'pending' | 'approved' | 'paid' | 'disputed';
type DealStructure = 'revenue_share' | 'flat_fee' | 'term_loan' | 'line_of_credit' | 'mca';

interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  dueDate: string;
  issuedDate: string;
  status: InvoiceStatus;
  dealStructure: DealStructure;
  description: string;
}

interface Commission {
  id: string;
  partner: string;
  role: 'partner' | 'advisor' | 'broker';
  deal: string;
  dealAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: CommissionStatus;
  dueDate: string;
}

interface UsageMetric {
  planName: string;
  metricLabel: string;
  current: number;
  limit: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_INVOICES: Invoice[] = [
  {
    id: 'inv_001', invoiceNumber: 'CF-2026-0041', client: 'Apex Ventures LLC',
    amount: 18_500.00, dueDate: '2026-04-15', issuedDate: '2026-03-15',
    status: 'issued', dealStructure: 'revenue_share',
    description: 'Origination fee + revenue share — Q1 2026',
  },
  {
    id: 'inv_002', invoiceNumber: 'CF-2026-0040', client: 'NovaTech Solutions Inc.',
    amount: 9_750.00, dueDate: '2026-03-31', issuedDate: '2026-03-01',
    status: 'overdue', dealStructure: 'flat_fee',
    description: 'Advisory flat fee — funding round facilitation',
  },
  {
    id: 'inv_003', invoiceNumber: 'CF-2026-0039', client: 'Horizon Retail Partners',
    amount: 42_000.00, dueDate: '2026-03-20', issuedDate: '2026-02-20',
    status: 'paid', dealStructure: 'mca',
    description: 'MCA origination + servicing fee — tranche 1',
  },
  {
    id: 'inv_004', invoiceNumber: 'CF-2026-0038', client: 'Summit Capital Group',
    amount: 5_200.00, dueDate: '2026-04-30', issuedDate: '2026-03-28',
    status: 'draft', dealStructure: 'term_loan',
    description: 'Term loan processing fee — 36-month facility',
  },
  {
    id: 'inv_005', invoiceNumber: 'CF-2026-0037', client: 'Blue Ridge Consulting',
    amount: 7_800.00, dueDate: '2026-02-28', issuedDate: '2026-01-28',
    status: 'refunded', dealStructure: 'line_of_credit',
    description: 'LOC setup fee — refunded due to application withdrawal',
  },
  {
    id: 'inv_006', invoiceNumber: 'CF-2026-0036', client: 'Crestline Medical LLC',
    amount: 31_250.00, dueDate: '2026-03-10', issuedDate: '2026-02-10',
    status: 'paid', dealStructure: 'revenue_share',
    description: 'Revenue share Q4 2025 settlement',
  },
  {
    id: 'inv_007', invoiceNumber: 'CF-2026-0035', client: 'Pacific Growth Partners',
    amount: 14_000.00, dueDate: '2026-04-01', issuedDate: '2026-03-25',
    status: 'issued', dealStructure: 'flat_fee',
    description: 'Due diligence + structuring fee',
  },
];

const PLACEHOLDER_COMMISSIONS: Commission[] = [
  {
    id: 'com_001', partner: 'Marcus Webb', role: 'partner', deal: 'Apex Ventures LOC',
    dealAmount: 250_000, commissionRate: 2.5, commissionAmount: 6_250,
    status: 'approved', dueDate: '2026-04-15',
  },
  {
    id: 'com_002', partner: 'Renata Solís', role: 'advisor', deal: 'NovaTech Revenue Share',
    dealAmount: 180_000, commissionRate: 1.8, commissionAmount: 3_240,
    status: 'pending', dueDate: '2026-04-30',
  },
  {
    id: 'com_003', partner: 'EastBridge Capital', role: 'broker', deal: 'Horizon Retail MCA',
    dealAmount: 420_000, commissionRate: 3.0, commissionAmount: 12_600,
    status: 'paid', dueDate: '2026-03-20',
  },
  {
    id: 'com_004', partner: 'James Okeke', role: 'advisor', deal: 'Summit Term Loan',
    dealAmount: 95_000, commissionRate: 2.0, commissionAmount: 1_900,
    status: 'disputed', dueDate: '2026-04-05',
  },
  {
    id: 'com_005', partner: 'Pacific Referral LLC', role: 'broker', deal: 'Crestline Medical RS',
    dealAmount: 310_000, commissionRate: 2.8, commissionAmount: 8_680,
    status: 'paid', dueDate: '2026-03-10',
  },
  {
    id: 'com_006', partner: 'Tyra Banks-Finley', role: 'partner', deal: 'Pacific Growth LOC',
    dealAmount: 140_000, commissionRate: 2.2, commissionAmount: 3_080,
    status: 'pending', dueDate: '2026-05-01',
  },
];

const USAGE_METRICS: UsageMetric[] = [
  { planName: 'Enterprise', metricLabel: 'API Calls', current: 87_400, limit: 100_000, unit: 'calls' },
  { planName: 'Enterprise', metricLabel: 'Active Deals', current: 48, limit: 50, unit: 'deals' },
  { planName: 'Enterprise', metricLabel: 'Documents Stored', current: 2_310, limit: 5_000, unit: 'docs' },
  { planName: 'Enterprise', metricLabel: 'Active Users', current: 12, limit: 12, unit: 'seats' },
];

const DEAL_STRUCTURE_OPTIONS: { value: DealStructure; label: string }[] = [
  { value: 'revenue_share', label: 'Revenue Share' },
  { value: 'flat_fee', label: 'Flat Fee' },
  { value: 'term_loan', label: 'Term Loan' },
  { value: 'line_of_credit', label: 'Line of Credit' },
  { value: 'mca', label: 'Merchant Cash Advance (MCA)' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  draft:    { label: 'Draft',    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600' },
  issued:   { label: 'Issued',   badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  paid:     { label: 'Paid',     badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  refunded: { label: 'Refunded', badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  overdue:  { label: 'Overdue',  badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

const COMMISSION_STATUS_CONFIG: Record<CommissionStatus, { label: string; badgeClass: string }> = {
  pending:  { label: 'Pending',  badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  approved: { label: 'Approved', badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  paid:     { label: 'Paid',     badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  disputed: { label: 'Disputed', badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

const ROLE_CONFIG: Record<string, string> = {
  partner: 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]/40',
  advisor: 'bg-indigo-950 text-indigo-300 border-indigo-700',
  broker:  'bg-teal-950 text-teal-300 border-teal-700',
};

const DEAL_STRUCTURE_LABELS: Record<DealStructure, string> = {
  revenue_share:  'Rev. Share',
  flat_fee:       'Flat Fee',
  term_loan:      'Term Loan',
  line_of_credit: 'LOC',
  mca:            'MCA',
};

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function isOverdue(dueDate: string, status: InvoiceStatus): boolean {
  return status !== 'paid' && status !== 'refunded' && new Date(dueDate) < new Date();
}

// ---------------------------------------------------------------------------
// Generate Invoice Modal (inline)
// ---------------------------------------------------------------------------

interface GenerateInvoiceModalProps {
  onClose: () => void;
}

function GenerateInvoiceModal({ onClose }: GenerateInvoiceModalProps) {
  const [form, setForm] = useState({
    client: '',
    dealStructure: 'flat_fee' as DealStructure,
    amount: '',
    dueDate: '',
    description: '',
  });
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    if (!form.client || !form.amount) return;
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      onClose();
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Generate Invoice</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
              Client Name
            </label>
            <input
              type="text"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder="e.g. Apex Ventures LLC"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
              Deal Structure
            </label>
            <select
              value={form.dealStructure}
              onChange={(e) => setForm({ ...form, dealStructure: e.target.value as DealStructure })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            >
              {DEAL_STRUCTURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                Amount (USD)
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
                Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Invoice description…"
              rows={3}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !form.client || !form.amount}
            className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-semibold transition-colors"
          >
            {generating ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'commissions' | 'usage'>('invoices');
  const [showModal, setShowModal] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStatus | 'all'>('all');
  const [commissionFilter, setCommissionFilter] = useState<CommissionStatus | 'all'>('all');

  // Invoice stats
  const totalRevenue = PLACEHOLDER_INVOICES.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const outstandingAmount = PLACEHOLDER_INVOICES.filter((i) => i.status === 'issued' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const overdueCount = PLACEHOLDER_INVOICES.filter((i) => isOverdue(i.dueDate, i.status) || i.status === 'overdue').length;

  // Commission stats
  const totalCommissionsPaid = PLACEHOLDER_COMMISSIONS.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionAmount, 0);
  const pendingCommissions = PLACEHOLDER_COMMISSIONS.filter((c) => c.status === 'pending' || c.status === 'approved').reduce((s, c) => s + c.commissionAmount, 0);

  const filteredInvoices = PLACEHOLDER_INVOICES.filter((i) =>
    invoiceFilter === 'all' ? true : i.status === invoiceFilter,
  );

  const filteredCommissions = PLACEHOLDER_COMMISSIONS.filter((c) =>
    commissionFilter === 'all' ? true : c.status === commissionFilter,
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {showModal && <GenerateInvoiceModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Ops & Billing</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {formatCurrency(totalRevenue)} collected · {formatCurrency(outstandingAmount)} outstanding
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
        >
          + Generate Invoice
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-green-400' },
          { label: 'Outstanding', value: formatCurrency(outstandingAmount), color: 'text-blue-300' },
          { label: 'Overdue Invoices', value: overdueCount, color: overdueCount > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Pending Commissions', value: formatCurrency(pendingCommissions), color: 'text-yellow-400' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{card.label}</p>
            <p className={`text-2xl font-black ${card.color} leading-tight`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {(['invoices', 'commissions', 'usage'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'invoices' ? 'Invoices' : tab === 'commissions' ? 'Commissions' : 'Usage Metering'}
          </button>
        ))}
      </div>

      {/* ── Invoices Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div>
          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(['all', 'draft', 'issued', 'paid', 'overdue', 'refunded'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setInvoiceFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  invoiceFilter === s
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {s === 'all' ? 'All' : INVOICE_STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Invoice #', 'Client', 'Deal Structure', 'Amount', 'Issued', 'Due Date', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredInvoices.map((inv) => {
                    const statusCfg = INVOICE_STATUS_CONFIG[isOverdue(inv.dueDate, inv.status) && inv.status !== 'paid' && inv.status !== 'refunded' ? 'overdue' : inv.status];
                    return (
                      <tr key={inv.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-[#C9A84C]">{inv.invoiceNumber}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-100 whitespace-nowrap">{inv.client}</p>
                          <p className="text-xs text-gray-500 mt-0.5 max-w-[180px] truncate">{inv.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded">
                            {DEAL_STRUCTURE_LABELS[inv.dealStructure]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold tabular-nums text-gray-100">{formatCurrency(inv.amount)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(inv.issuedDate)}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={isOverdue(inv.dueDate, inv.status) ? 'text-red-400 font-semibold' : 'text-gray-400'}>
                            {formatDate(inv.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInvoices.length === 0 && (
                <div className="px-5 py-10 text-center text-gray-600 text-sm">
                  No invoices match this filter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Commissions Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'commissions' && (
        <div>
          {/* Summary pills */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Total Paid</p>
              <p className="text-lg font-black text-green-400">{formatCurrency(totalCommissionsPaid)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">Pending / Approved</p>
              <p className="text-lg font-black text-yellow-400">{formatCurrency(pendingCommissions)}</p>
            </div>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(['all', 'pending', 'approved', 'paid', 'disputed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setCommissionFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  commissionFilter === s
                    ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'
                }`}
              >
                {s === 'all' ? 'All' : COMMISSION_STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Partner / Advisor', 'Role', 'Deal', 'Deal Amount', 'Rate', 'Commission', 'Due Date', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredCommissions.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-100">{c.partner}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border capitalize ${ROLE_CONFIG[c.role]}`}>
                          {c.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-300">{c.deal}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-200 tabular-nums">{formatCurrency(c.dealAmount)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-400 tabular-nums">{c.commissionRate.toFixed(1)}%</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-sm font-bold tabular-nums ${
                          c.status === 'paid' ? 'text-green-400' :
                          c.status === 'disputed' ? 'text-red-400' :
                          'text-[#C9A84C]'
                        }`}>
                          {formatCurrency(c.commissionAmount)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(c.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${COMMISSION_STATUS_CONFIG[c.status].badgeClass}`}>
                          {COMMISSION_STATUS_CONFIG[c.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCommissions.length === 0 && (
                <div className="px-5 py-10 text-center text-gray-600 text-sm">
                  No commissions match this filter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Usage Metering Tab ───────────────────────────────────────────────── */}
      {activeTab === 'usage' && (
        <div>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">SaaS Usage Metering</h2>
              <p className="text-xs text-gray-500 mt-0.5">Billing cycle: Apr 1 – Apr 30, 2026</p>
            </div>
            <span className="text-xs font-semibold text-[#C9A84C] bg-[#0A1628] border border-[#C9A84C]/30 px-3 py-1.5 rounded-lg">
              Enterprise Plan
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {USAGE_METRICS.map((m) => (
              <UsageMeter
                key={m.metricLabel}
                planName={m.planName}
                metricLabel={m.metricLabel}
                current={m.current}
                limit={m.limit}
                unit={m.unit}
                onUpgrade={() => alert('Upgrade flow — connect to billing provider')}
              />
            ))}
          </div>

          {/* Plan details */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 mt-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
              Current Plan Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Plan', value: 'Enterprise' },
                { label: 'Billing Cycle', value: 'Monthly' },
                { label: 'Monthly Spend', value: '$4,800 / mo' },
                { label: 'Renewal', value: 'May 1, 2026' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-100">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Overage charges apply at $0.05 per extra API call and $500 per extra deal slot.
              </p>
              <button className="text-xs font-semibold text-[#C9A84C] hover:text-amber-300 transition-colors">
                View Full Plan →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

// ============================================================
// /billing — Revenue Ops & Billing
// Invoices table with status badges (draft/issued/paid/refunded),
// amount, due date, client.
// Generate invoice button with deal structure selector.
// Commission tracking tab (partner/advisor commissions with status).
// SaaS usage metering panel.
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import UsageMeter from '../../components/modules/usage-meter';
import GenerateInvoiceModal from '../../components/billing/GenerateInvoiceModal';
import type { InvoicePayload } from '../../components/billing/GenerateInvoiceModal';
import RevenueTrendChart from '../../components/billing/RevenueTrendChart';

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

// DEAL_STRUCTURE_OPTIONS and PLACEHOLDER_CLIENTS moved into GenerateInvoiceModal component

const UPGRADE_TIERS = [
  { name: 'Pro', price: '$1,200/mo', features: ['25 Active Deals', '50K API Calls', '5 Users', 'Priority Support'] },
  { name: 'Enterprise', price: '$4,800/mo', features: ['50 Active Deals', '100K API Calls', '12 Users', 'Dedicated CSM'] },
  { name: 'Enterprise+', price: '$9,600/mo', features: ['Unlimited Deals', '500K API Calls', 'Unlimited Users', 'SLA 99.99%'] },
];

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.className =
    'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-2xl animate-fade-in';
  el.style.animation = 'fadeInUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

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

// GenerateInvoiceModal is now imported from components/billing/GenerateInvoiceModal

// ---------------------------------------------------------------------------
// Commission Detail Modal (inline)
// ---------------------------------------------------------------------------

interface CommissionDetailModalProps {
  commission: Commission;
  onClose: () => void;
  onAction: (id: string, action: string) => void;
}

function CommissionDetailModal({ commission, onClose, onAction }: CommissionDetailModalProps) {
  const actionLabel =
    commission.status === 'pending' ? 'Approve' :
    commission.status === 'approved' ? 'Mark Paid' :
    commission.status === 'disputed' ? 'Resolve Dispute' : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Commission Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Partner</span>
            <span className="text-sm font-semibold text-gray-100">{commission.partner}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Role</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded border capitalize ${ROLE_CONFIG[commission.role]}`}>
              {commission.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Deal</span>
            <span className="text-sm text-gray-300">{commission.deal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Deal Amount</span>
            <span className="text-sm font-semibold text-gray-200">{formatCurrency(commission.dealAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Rate</span>
            <span className="text-sm text-gray-400">{commission.commissionRate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Commission</span>
            <span className="text-sm font-bold text-[#C9A84C]">{formatCurrency(commission.commissionAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500 uppercase">Due Date</span>
            <span className="text-sm text-gray-400">{formatDate(commission.dueDate)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500 uppercase">Status</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${COMMISSION_STATUS_CONFIG[commission.status].badgeClass}`}>
              {COMMISSION_STATUS_CONFIG[commission.status].label}
            </span>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Close
          </button>
          {actionLabel && (
            <button
              onClick={() => { onAction(commission.id, actionLabel); onClose(); }}
              className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrade Plan Modal (inline)
// ---------------------------------------------------------------------------

interface UpgradePlanModalProps {
  onClose: () => void;
}

function UpgradePlanModal({ onClose }: UpgradePlanModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-2xl mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Upgrade Your Plan</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {UPGRADE_TIERS.map((tier) => (
            <div key={tier.name} className="rounded-xl border border-gray-700 bg-gray-800 p-4 flex flex-col">
              <h3 className="text-sm font-bold text-white mb-1">{tier.name}</h3>
              <p className="text-lg font-black text-[#C9A84C] mb-3">{tier.price}</p>
              <ul className="space-y-1.5 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="text-xs text-gray-400 flex items-center gap-1.5">
                    <span className="text-green-400">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { showToast(`${tier.name} plan selected -- a sales rep will follow up.`); onClose(); }}
                className="mt-4 w-full px-3 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-xs font-semibold transition-colors"
              >
                Select {tier.name}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={() => { showToast('Contact sales request submitted.'); onClose(); }}
            className="text-xs font-semibold text-gray-400 hover:text-[#C9A84C] transition-colors"
          >
            Need a custom plan? Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan Details Modal (inline)
// ---------------------------------------------------------------------------

interface PlanDetailsModalProps {
  onClose: () => void;
}

function PlanDetailsModal({ onClose }: PlanDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Enterprise Plan Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-3">
          {[
            { label: 'Plan Name', value: 'Enterprise' },
            { label: 'Monthly Cost', value: '$4,800 / mo' },
            { label: 'Billing Cycle', value: 'Monthly (auto-renew)' },
            { label: 'Next Renewal', value: 'May 1, 2026' },
            { label: 'API Calls', value: '100,000 / mo' },
            { label: 'Active Deals', value: '50 deals' },
            { label: 'Document Storage', value: '5,000 docs' },
            { label: 'User Seats', value: '12 seats' },
            { label: 'Overage: API', value: '$0.05 per extra call' },
            { label: 'Overage: Deals', value: '$500 per extra deal slot' },
            { label: 'Support Level', value: 'Dedicated CSM + Priority' },
          ].map((row) => (
            <div key={row.label} className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-xs text-gray-500 uppercase">{row.label}</span>
              <span className="text-sm font-semibold text-gray-100">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Close
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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStatus | 'all'>('all');
  const [commissionFilter, setCommissionFilter] = useState<CommissionStatus | 'all'>('all');
  const [invoices, setInvoices] = useState<Invoice[]>(PLACEHOLDER_INVOICES);
  const [commissions, setCommissions] = useState<Commission[]>(PLACEHOLDER_COMMISSIONS);
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null);

  // Next invoice number
  const nextInvoiceNum = invoices.length + 1;

  // Invoice stats (derived from live state)
  const totalRevenue = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const outstandingAmount = invoices.filter((i) => i.status === 'issued' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);

  // Overdue calculation
  const overdueInvoices = useMemo(
    () => invoices.filter((i) => isOverdue(i.dueDate, i.status) || i.status === 'overdue'),
    [invoices],
  );
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  // Commission stats
  const totalCommissionsPaid = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionAmount, 0);
  const pendingCommissions = commissions.filter((c) => c.status === 'pending' || c.status === 'approved').reduce((s, c) => s + c.commissionAmount, 0);

  // Filtered lists
  const filteredInvoices = useMemo(
    () => invoices.filter((i) => invoiceFilter === 'all' ? true : i.status === invoiceFilter),
    [invoices, invoiceFilter],
  );

  const filteredCommissions = useMemo(
    () => commissions.filter((c) => commissionFilter === 'all' ? true : c.status === commissionFilter),
    [commissions, commissionFilter],
  );

  // -- Invoice actions --
  const handleAddInvoice = useCallback((inv: Invoice | InvoicePayload) => {
    setInvoices((prev) => [inv as Invoice, ...prev]);
    showToast(`Invoice #${inv.invoiceNumber} created for ${formatCurrency(inv.amount)}`);
  }, []);

  const handleMarkPaid = useCallback((id: string) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === id ? { ...inv, status: inv.status === 'paid' ? 'issued' : 'paid' as InvoiceStatus } : inv,
      ),
    );
    showToast('Invoice status updated.');
  }, []);

  const handleVoidInvoice = useCallback((id: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    setVoidConfirmId(null);
    showToast('Invoice voided and removed.');
  }, []);

  const handleViewPdf = useCallback((inv?: Invoice) => {
    const target = inv ?? filteredInvoices[0];
    if (!target) {
      showToast('No invoice selected.');
      return;
    }
    const content = [
      '═══════════════════════════════════════════════',
      '              CAPITALFORGE INVOICE              ',
      '═══════════════════════════════════════════════',
      '',
      `Invoice #:     ${target.invoiceNumber}`,
      `Client:        ${target.client}`,
      `Deal Structure: ${DEAL_STRUCTURE_LABELS[target.dealStructure]}`,
      `Amount:        ${formatCurrency(target.amount)}`,
      `Issued:        ${formatDate(target.issuedDate)}`,
      `Due Date:      ${formatDate(target.dueDate)}`,
      `Status:        ${INVOICE_STATUS_CONFIG[target.status].label}`,
      '',
      `Description:   ${target.description}`,
      '',
      '───────────────────────────────────────────────',
      'Generated by CapitalForge Revenue Ops',
      `Date: ${new Date().toLocaleDateString('en-US')}`,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${target.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Invoice ${target.invoiceNumber} downloaded.`);
  }, [filteredInvoices]);

  const handleSendReminder = useCallback((inv: Invoice) => {
    showToast(`Reminder sent to ${inv.client} for ${inv.invoiceNumber}.`);
  }, []);

  // -- Commission actions --
  const handleCommissionAction = useCallback((id: string, action: string) => {
    setCommissions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const newStatus: CommissionStatus =
          action === 'Approve' ? 'approved' :
          action === 'Mark Paid' ? 'paid' :
          action === 'Resolve Dispute' ? 'approved' :
          c.status;
        return { ...c, status: newStatus };
      }),
    );
    showToast(`Commission ${action.toLowerCase()}d successfully.`);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast animation styles */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {showModal && (
        <GenerateInvoiceModal
          onClose={() => setShowModal(false)}
          onSubmit={handleAddInvoice}
          nextNumber={nextInvoiceNum}
        />
      )}
      {showUpgradeModal && <UpgradePlanModal onClose={() => setShowUpgradeModal(false)} />}
      {showPlanModal && <PlanDetailsModal onClose={() => setShowPlanModal(false)} />}
      {selectedCommission && (
        <CommissionDetailModal
          commission={selectedCommission}
          onClose={() => setSelectedCommission(null)}
          onAction={handleCommissionAction}
        />
      )}

      {/* Void confirmation dialog */}
      {voidConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
            <h3 className="text-lg font-bold text-white mb-2">Void Invoice?</h3>
            <p className="text-sm text-gray-400 mb-5">This action will permanently remove this invoice. Are you sure?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setVoidConfirmId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleVoidInvoice(voidConfirmId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
              >
                Void Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Ops & Billing</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {formatCurrency(totalRevenue)} collected · {formatCurrency(outstandingAmount)} outstanding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const headers = ['Invoice #', 'Client', 'Deal Structure', 'Amount', 'Issued', 'Due Date', 'Status', 'Description'];
              const rows = [
                headers.join(','),
                ...invoices.map((inv) => [
                  inv.invoiceNumber,
                  `"${inv.client}"`,
                  DEAL_STRUCTURE_LABELS[inv.dealStructure],
                  inv.amount.toFixed(2),
                  inv.issuedDate,
                  inv.dueDate,
                  INVOICE_STATUS_CONFIG[inv.status].label,
                  `"${inv.description}"`,
                ].join(',')),
              ].join('\n');
              const blob = new Blob([rows], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `invoices-export-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              showToast(`Exported ${invoices.length} invoices.`);
            }}
            className="px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 text-sm font-semibold transition-colors"
          >
            Export Invoices
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
          >
            + Generate Invoice
          </button>
        </div>
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

      {/* Revenue Analytics (collapsible) */}
      <div className="mb-6">
        <RevenueTrendChart />
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

          {/* Overdue banner */}
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg border border-amber-700/50 bg-amber-950/30">
              <span className="inline-flex items-center justify-center bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6">
                {overdueCount}
              </span>
              <span className="text-sm font-semibold text-amber-300">
                Overdue ({formatCurrency(overdueAmount)})
              </span>
              <span className="text-xs text-amber-400/70 ml-1">— requires immediate attention</span>
            </div>
          )}

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Invoice #', 'Client', 'Deal Structure', 'Amount', 'Issued', 'Due Date', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredInvoices.map((inv) => {
                    const effectivelyOverdue = isOverdue(inv.dueDate, inv.status) && inv.status !== 'paid' && inv.status !== 'refunded';
                    const statusCfg = INVOICE_STATUS_CONFIG[effectivelyOverdue ? 'overdue' : inv.status];
                    const rowBg = effectivelyOverdue || inv.status === 'overdue'
                      ? 'bg-red-950/20 hover:bg-red-950/40'
                      : 'hover:bg-gray-800/50';
                    return (
                      <tr key={inv.id} className={`${rowBg} transition-colors`}>
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewPdf(inv)}
                              className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                              title="Download Invoice"
                            >
                              PDF
                            </button>
                            {(effectivelyOverdue || inv.status === 'overdue') && (
                              <button
                                onClick={() => handleSendReminder(inv)}
                                className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
                                title="Send Reminder"
                              >
                                Remind
                              </button>
                            )}
                            {inv.status !== 'refunded' && (
                              <button
                                onClick={() => handleMarkPaid(inv.id)}
                                className="text-xs text-gray-500 hover:text-green-400 transition-colors"
                                title={inv.status === 'paid' ? 'Unmark Paid' : 'Mark Paid'}
                              >
                                {inv.status === 'paid' ? 'Unpay' : 'Pay'}
                              </button>
                            )}
                            {inv.status !== 'paid' && inv.status !== 'refunded' && (
                              <button
                                onClick={() => setVoidConfirmId(inv.id)}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                                title="Void Invoice"
                              >
                                Void
                              </button>
                            )}
                          </div>
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
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCommission(c)}
                      className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
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
              <p className="text-xs text-gray-500 mt-0.5">Billing cycle: Apr 1 - Apr 30, 2026</p>
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
                onUpgrade={() => setShowUpgradeModal(true)}
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
              <button
                onClick={() => setShowPlanModal(true)}
                className="text-xs font-semibold text-[#C9A84C] hover:text-amber-300 transition-colors"
              >
                View Full Plan →
              </button>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
            >
              Upgrade Plan
            </button>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 text-sm font-semibold transition-colors"
            >
              Unblock Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

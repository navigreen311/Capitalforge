'use client';

// ============================================================
// /repayment — Repayment Command Center
//
// Sections:
//   1. Client selector
//   2. Summary stats (total balance, monthly payment, cards, savings)
//   3. Interest shock alerts (cards near promo expiry) + actions
//   4. Repayment strategy toggle (avalanche vs snowball)
//   5. Active repayment plans table with payoff progress bars
//   6. Method comparison panel (avalanche vs snowball side-by-side)
//   7. Payment calendar with upcoming due dates
//   8. Card detail drawer + balance transfer panel (modals)
// ============================================================

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import PaymentCalendar, { PLACEHOLDER_PAYMENTS } from '../../components/modules/payment-calendar';
import InterestShockAlert, { PLACEHOLDER_PROMO_CARDS } from '../../components/modules/interest-shock-alert';
import {
  RepaymentClientSelector,
  RepaymentCardDetailDrawer,
  BalanceTransferPanel,
  MethodComparisonPanel,
  InterestShockAlertActions,
  PayoffProjectionChart,
  BalanceTransferModal,
  EscalationModal,
} from '@/components/repayment';
import type { RepaymentClient, RepaymentCardDetailPlan } from '@/components/repayment';
import { useToast } from '@/components/global/ToastProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Strategy = 'avalanche' | 'snowball';

type AutopayStatus = 'confirmed' | 'not_set' | 'failed';

interface RepaymentPlan {
  id: string;
  cardName: string;
  issuer: string;
  balance: number;
  creditLimit: number;
  apr: number;
  minPayment: number;
  allocatedPayment: number;
  payoffMonths: number; // estimated months to payoff
  utilization: number; // 0–100
  status: 'on_track' | 'behind' | 'at_risk';
  promoExpiry?: string; // ISO date if promo rate
  autopay: AutopayStatus;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_PLANS: RepaymentPlan[] = [
  {
    id: 'rp_001',
    cardName: 'Ink Business Cash',
    issuer: 'Chase',
    balance: 18_400,
    creditLimit: 25_000,
    apr: 21.99,
    minPayment: 368,
    allocatedPayment: 2_200,
    payoffMonths: 9,
    utilization: 74,
    status: 'at_risk',
    promoExpiry: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    autopay: 'confirmed',
  },
  {
    id: 'rp_002',
    cardName: 'Business Gold Card',
    issuer: 'Amex',
    balance: 12_200,
    creditLimit: 20_000,
    apr: 27.49,
    minPayment: 244,
    allocatedPayment: 1_500,
    payoffMonths: 10,
    utilization: 61,
    status: 'behind',
    promoExpiry: new Date(Date.now() + 18 * 86_400_000).toISOString(),
    autopay: 'not_set',
  },
  {
    id: 'rp_003',
    cardName: 'Spark Cash Plus',
    issuer: 'Capital One',
    balance: 8_750,
    creditLimit: 15_000,
    apr: 24.99,
    minPayment: 175,
    allocatedPayment: 900,
    payoffMonths: 11,
    utilization: 58,
    status: 'on_track',
    autopay: 'confirmed',
  },
  {
    id: 'rp_004',
    cardName: 'Ink Business Preferred',
    issuer: 'Chase',
    balance: 6_300,
    creditLimit: 20_000,
    apr: 20.74,
    minPayment: 126,
    allocatedPayment: 700,
    payoffMonths: 10,
    utilization: 32,
    status: 'on_track',
    autopay: 'not_set',
  },
  {
    id: 'rp_005',
    cardName: 'Business Platinum',
    issuer: 'Amex',
    balance: 4_100,
    creditLimit: 30_000,
    apr: 19.99,
    minPayment: 82,
    allocatedPayment: 500,
    payoffMonths: 9,
    utilization: 14,
    status: 'on_track',
    autopay: 'confirmed',
  },
  {
    id: 'rp_006',
    cardName: 'Venture X Business',
    issuer: 'Capital One',
    balance: 5_300,
    creditLimit: 15_000,
    apr: 22.49,
    minPayment: 106,
    allocatedPayment: 600,
    payoffMonths: 10,
    utilization: 35,
    status: 'on_track',
    autopay: 'failed',
  },
];

// ---------------------------------------------------------------------------
// Placeholder comparison data for MethodComparisonPanel
// ---------------------------------------------------------------------------

const AVALANCHE_STATS = { totalInterest: 5_820, months: 11, savesVsMinimum: 3_140 };
const SNOWBALL_STATS  = { totalInterest: 6_450, months: 12, savesVsMinimum: 2_510 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const STATUS_STYLES: Record<RepaymentPlan['status'], { bg: string; border: string; text: string; label: string }> = {
  on_track: { bg: 'bg-green-900/40',  border: 'border-green-700',  text: 'text-green-300',  label: 'On Track' },
  behind:   { bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Behind'   },
  at_risk:  { bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'At Risk'  },
};

const AUTOPAY_DISPLAY: Record<AutopayStatus, { icon: string; text: string; className: string }> = {
  confirmed: { icon: '\u2705', text: 'Confirmed', className: 'text-green-400' },
  not_set:   { icon: '\u26A0\uFE0F', text: 'Not Set', className: 'text-yellow-400' },
  failed:    { icon: '\u274C', text: 'Failed', className: 'text-red-400' },
};

function utilizationColor(pct: number): string {
  if (pct >= 70) return 'bg-red-500';
  if (pct >= 40) return 'bg-yellow-400';
  return 'bg-green-500';
}

function balanceProgressColor(pct: number): string {
  // pct = paid off percentage (inverted from utilization)
  if (pct >= 60) return 'bg-green-500';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-red-500';
}

function sortByStrategy(plans: RepaymentPlan[], strategy: Strategy): RepaymentPlan[] {
  return [...plans].sort((a, b) =>
    strategy === 'avalanche'
      ? b.apr - a.apr          // highest APR first
      : a.balance - b.balance  // lowest balance first
  );
}

/** Map a RepaymentPlan to the shape the drawer expects */
function toDrawerPlan(plan: RepaymentPlan): RepaymentCardDetailPlan {
  const paidPct = Math.round(((plan.creditLimit - plan.balance) / plan.creditLimit) * 100);
  return {
    id: plan.id,
    card: plan.cardName,
    issuer: plan.issuer,
    balance: plan.balance,
    apr: plan.apr,
    monthlyPayment: plan.allocatedPayment,
    minPayment: plan.minPayment,
    payoffProgressPct: paidPct,
    etaMonths: plan.payoffMonths,
    status: plan.status,
    autopay: plan.autopay,
  };
}

/** Check if a plan has an expired promo */
function isPromoExpired(plan: RepaymentPlan): boolean {
  return !!plan.promoExpiry && new Date(plan.promoExpiry) < new Date();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type AutopayPaymentType = 'minimum' | 'fixed' | 'full';

interface AutopayConfig {
  planId: string;
  cardName: string;
  paymentType: AutopayPaymentType;
  paymentDay: number;
  fixedAmount?: number;
}

export default function RepaymentPage() {
  const [strategy, setStrategy] = useState<Strategy>('avalanche');
  const [plans, setPlans] = useState<RepaymentPlan[]>(PLACEHOLDER_PLANS);

  // Client selector state
  const [selectedClient, setSelectedClient] = useState<RepaymentClient | null>(null);

  // Card detail drawer state
  const [selectedPlan, setSelectedPlan] = useState<RepaymentPlan | null>(null);

  // Balance transfer panel state (legacy panel)
  const [transferPlan, setTransferPlan] = useState<RepaymentPlan | null>(null);

  // Balance transfer modal state (new recommender modal)
  const [transferModalPlan, setTransferModalPlan] = useState<RepaymentPlan | null>(null);

  // Calendar month navigation state
  const [calendarMonth] = useState<Date>(new Date());

  // Bug 4B: highlight state for at-risk scroll
  const [highlightPlanId, setHighlightPlanId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  // Bug 4C: autopay modal state
  const [autopayModal, setAutopayModal] = useState<{ planId: string; cardName: string } | null>(null);
  const [autopayType, setAutopayType] = useState<AutopayPaymentType>('minimum');
  const [autopayDay, setAutopayDay] = useState<number>(1);
  const [autopayFixedAmount, setAutopayFixedAmount] = useState<number>(100);
  const toast = useToast();

  // Bug 4B: scroll to first at-risk/behind card and pulse it
  const scrollToAtRiskCard = useCallback(() => {
    if (!tableRef.current) return;
    const row = tableRef.current.querySelector<HTMLElement>('[data-status="at_risk"], [data-status="behind"]');
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const planId = row.getAttribute('data-plan-id');
      if (planId) {
        setHighlightPlanId(planId);
        setTimeout(() => setHighlightPlanId(null), 1_800); // 3 pulses * 600ms
      }
    }
  }, []);

  // Bug 4C: save autopay handler
  const handleSaveAutopay = useCallback(() => {
    if (!autopayModal) return;
    setPlans((prev) =>
      prev.map((p) =>
        p.id === autopayModal.planId ? { ...p, autopay: 'confirmed' as AutopayStatus } : p,
      ),
    );
    toast.success(`Autopay configured for ${autopayModal.cardName}`);
    setAutopayModal(null);
    setAutopayType('minimum');
    setAutopayDay(1);
    setAutopayFixedAmount(100);
  }, [autopayModal, toast]);
  // 5C: Export & Email modals
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [letterText, setLetterText] = useState<string | null>(null);
  const [generatingLetter, setGeneratingLetter] = useState(false);

  // 5D: Escalation modal for behind-status cards
  const [escalatePlan, setEscalatePlan] = useState<RepaymentPlan | null>(null);

  useEffect(() => {
    // Future: fetch from API
  }, []);

  const sorted = sortByStrategy(plans, strategy);

  const totalBalance   = plans.reduce((s, p) => s + p.balance, 0);
  const totalMonthly   = plans.reduce((s, p) => s + p.allocatedPayment, 0);
  const totalMinimums  = plans.reduce((s, p) => s + p.minPayment, 0);
  const extraPayment   = totalMonthly - totalMinimums;
  const avgApr         = plans.reduce((s, p) => s + p.apr, 0) / plans.length;
  const atRiskCount    = plans.filter(p => p.status === 'at_risk').length;

  // 5C: Export PDF handler
  function handleExportPdf() {
    const lines = [
      'REPAYMENT COMMAND CENTER — SUMMARY REPORT',
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `Strategy: ${strategy === 'avalanche' ? 'Avalanche (highest APR first)' : 'Snowball (lowest balance first)'}`,
      '',
      `Total Balance: ${formatCurrency(totalBalance)}`,
      `Monthly Payment: ${formatCurrency(totalMonthly)} (${formatCurrency(extraPayment)} above minimums)`,
      `Avg APR: ${avgApr.toFixed(2)}%`,
      '',
      'ACTIVE REPAYMENT PLANS:',
      '─'.repeat(60),
      ...sorted.map((p, i) =>
        `${i + 1}. ${p.cardName} (${p.issuer})\n   Balance: ${formatCurrency(p.balance)} | APR: ${p.apr}% | Monthly: ${formatCurrency(p.allocatedPayment)} | ETA: ${p.payoffMonths}mo | Status: ${p.status}`
      ),
      '',
      '─'.repeat(60),
      `Avalanche total interest: ${formatCurrency(AVALANCHE_STATS.totalInterest)} over ${AVALANCHE_STATS.months} months`,
      `Snowball total interest: ${formatCurrency(SNOWBALL_STATS.totalInterest)} over ${SNOWBALL_STATS.months} months`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repayment-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 5C: Email preview text
  const emailPreview = `Repayment Summary for ${selectedClient?.name ?? 'Client'}\n\nTotal balance: ${formatCurrency(totalBalance)}\nMonthly payment: ${formatCurrency(totalMonthly)}\nStrategy: ${strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}\n\n${sorted.map((p, i) => `${i + 1}. ${p.cardName} — ${formatCurrency(p.balance)} at ${p.apr}%`).join('\n')}`;

  // 5C: Send email handler
  function handleSendEmail() {
    setEmailSent(true);
    setTimeout(() => {
      setShowEmailModal(false);
      setEmailSent(false);
    }, 2000);
  }

  // 5C: Generate letter handler
  function handleGenerateLetter() {
    setShowLetterModal(true);
    setGeneratingLetter(true);
    setLetterText(null);
    setTimeout(() => {
      setLetterText(
        `Dear ${selectedClient?.name ?? 'Valued Client'},\n\n` +
        `Based on our analysis of your current credit portfolio, we recommend the following repayment guidance:\n\n` +
        `Your total outstanding balance of ${formatCurrency(totalBalance)} across ${plans.length} cards can be optimally managed using the ${strategy} method.\n\n` +
        `Key Recommendations:\n` +
        `• Maintain your monthly allocation of ${formatCurrency(totalMonthly)}, which is ${formatCurrency(extraPayment)} above required minimums\n` +
        `• Focus extra payments on ${sorted[0]?.cardName ?? 'your highest-priority card'} (${strategy === 'avalanche' ? `highest APR at ${sorted[0]?.apr}%` : `lowest balance at ${formatCurrency(sorted[0]?.balance ?? 0)}`})\n` +
        `• Expected payoff timeline: ${AVALANCHE_STATS.months}–${SNOWBALL_STATS.months} months\n` +
        `• Projected interest savings vs minimum payments: ${formatCurrency(strategy === 'avalanche' ? AVALANCHE_STATS.savesVsMinimum : SNOWBALL_STATS.savesVsMinimum)}\n\n` +
        `${plans.filter(p => p.status === 'behind').length > 0 ? `Action Required: ${plans.filter(p => p.status === 'behind').length} card(s) are currently behind schedule. Please contact us to discuss hardship options.\n\n` : ''}` +
        `We are committed to helping you achieve financial freedom. Please don't hesitate to reach out with questions.\n\n` +
        `Best regards,\nCapitalForge Advisory Team`
      );
      setGeneratingLetter(false);
    }, 1500);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">

      {/* Client selector — top of page */}
      <Suspense fallback={<div className="h-12" />}>
        <RepaymentClientSelector
          selectedClient={selectedClient}
          onClientSelect={setSelectedClient}
          onClear={() => setSelectedClient(null)}
        />
      </Suspense>

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Repayment Command Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage active repayment plans, monitor due dates, and track payoff progress.
          </p>
        </div>
        {atRiskCount > 0 && (
          <button
            onClick={scrollToAtRiskCard}
            className="flex items-center gap-2 bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-red-900/60 transition-colors"
          >
            <span className="text-red-400 text-sm font-semibold">
              ⚠ {atRiskCount} card{atRiskCount > 1 ? 's' : ''} at risk
            </span>
          </button>
        )}
      </div>

      {/* 5C: Action buttons — Export, Email, Generate Letter */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm font-semibold text-gray-200 hover:bg-gray-800 hover:border-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export PDF
        </button>
        <button
          onClick={() => setShowEmailModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm font-semibold text-gray-200 hover:bg-gray-800 hover:border-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Email to Client
        </button>
        <button
          onClick={handleGenerateLetter}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/10 text-sm font-semibold text-[#C9A84C] hover:bg-[#C9A84C]/20 transition-colors"
        >
          <span className="text-base">&#10022;</span>
          Generate Letter
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Balance"
          value={formatCurrency(totalBalance)}
          sub={`across ${plans.length} cards`}
          accent="text-red-300"
        />
        <SummaryCard
          label="Monthly Payment"
          value={formatCurrency(totalMonthly)}
          sub={`${formatCurrency(extraPayment)} above minimums`}
          accent="text-[#C9A84C]"
        />
        <SummaryCard
          label="Avg APR"
          value={`${avgApr.toFixed(2)}%`}
          sub="weighted across all cards"
          accent="text-yellow-300"
        />
        <SummaryCard
          label="Min Payments"
          value={formatCurrency(totalMinimums)}
          sub="required minimums only"
          accent="text-gray-300"
        />
      </div>

      {/* Interest shock alerts */}
      <div id="interest-shock-alerts">
        <InterestShockAlert
          cards={PLACEHOLDER_PROMO_CARDS}
          minSeverity="warning"
          compact={false}
        />

        {/* Interest shock alert actions — rendered below each alert card */}
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          {PLACEHOLDER_PROMO_CARDS.map((card) => {
            const days = Math.ceil((new Date(card.promoExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            // Only show actions for cards at warning or critical severity
            if (days > 60) return null;
            return (
              <div
                key={card.id}
                className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
              >
                <p className="text-xs text-gray-400 mb-2">
                  Actions for <span className="text-gray-200 font-medium">{card.cardName}</span>
                </p>
                <InterestShockAlertActions
                  clientId={selectedClient?.id ?? 'unknown'}
                  card={card.cardName}
                  issuer={card.issuer}
                  transferEligible={days <= 30}
                  onContactClient={() => {
                    // Future: open contact modal
                  }}
                  onViewPlan={() => {
                    const matchingPlan = plans.find(
                      (p) => p.cardName === card.cardName && p.issuer === card.issuer,
                    );
                    if (matchingPlan) setSelectedPlan(matchingPlan);
                  }}
                  onExploreTransfer={() => {
                    const matchingPlan = plans.find(
                      (p) => p.cardName === card.cardName && p.issuer === card.issuer,
                    );
                    if (matchingPlan) setTransferModalPlan(matchingPlan);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategy toggle + repayment table */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        {/* Section header with toggle */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-white">Active Repayment Plans</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {strategy === 'avalanche'
                ? 'Avalanche: highest APR paid first — minimizes total interest'
                : 'Snowball: lowest balance paid first — builds momentum'}
            </p>
          </div>

          {/* Strategy toggle */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
            <button
              onClick={() => setStrategy('avalanche')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                strategy === 'avalanche'
                  ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Avalanche
            </button>
            <button
              onClick={() => setStrategy('snowball')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                strategy === 'snowball'
                  ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Snowball
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">
                  {strategy === 'avalanche' ? '# (by APR)' : '# (by Balance)'}
                </th>
                <th className="text-left px-4 py-3 font-semibold">Card</th>
                <th className="text-right px-4 py-3 font-semibold">Balance</th>
                <th className="text-right px-4 py-3 font-semibold">APR</th>
                <th className="text-right px-4 py-3 font-semibold">Monthly</th>
                <th className="text-left px-4 py-3 font-semibold min-w-[140px]">Payoff Progress</th>
                <th className="text-left px-4 py-3 font-semibold min-w-[140px]">Utilization</th>
                <th className="text-center px-4 py-3 font-semibold">ETA</th>
                <th className="text-center px-4 py-3 font-semibold">Autopay</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody ref={tableRef} className="divide-y divide-gray-800">
              {sorted.map((plan, idx) => {
                const s = STATUS_STYLES[plan.status];
                const ap = AUTOPAY_DISPLAY[plan.autopay];
                // Payoff progress: what % of original credit limit has been freed up
                const paidPct = Math.round(((plan.creditLimit - plan.balance) / plan.creditLimit) * 100);
                const isHighlighted = highlightPlanId === plan.id;

                return (
                  <tr
                    key={plan.id}
                    data-status={plan.status}
                    data-plan-id={plan.id}
                    className={`bg-[#0A1628] hover:bg-gray-900/50 transition-colors group cursor-pointer border-2 ${
                      isHighlighted ? 'animate-highlight-pulse border-[#C9A84C]' : 'border-transparent'
                    }`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {/* Priority rank */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${idx === 0
                          ? 'bg-[#C9A84C] text-[#0A1628]'
                          : 'bg-gray-800 text-gray-400'}`}>
                        {idx + 1}
                      </span>
                    </td>

                    {/* Card name */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-100">{plan.cardName}</p>
                      <p className="text-xs text-gray-500">{plan.issuer}</p>
                      {plan.promoExpiry && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-[10px] font-semibold ${
                            new Date(plan.promoExpiry) < new Date() ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {new Date(plan.promoExpiry) < new Date() ? 'Promo expired' : 'Promo active'}
                          </p>
                          {isPromoExpired(plan) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransferModalPlan(plan);
                              }}
                              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline"
                            >
                              Explore Balance Transfer &rarr;
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Balance */}
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {formatCurrency(plan.balance)}
                    </td>

                    {/* APR */}
                    <td className={`px-4 py-3 text-right font-bold ${
                      plan.apr >= 25 ? 'text-red-400' : plan.apr >= 22 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {plan.apr}%
                    </td>

                    {/* Monthly allocated */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-[#C9A84C] font-semibold">{formatCurrency(plan.allocatedPayment)}</span>
                      <span className="text-xs text-gray-500 block">min {formatCurrency(plan.minPayment)}</span>
                    </td>

                    {/* Payoff progress bar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${balanceProgressColor(paidPct)}`}
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{paidPct}%</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {formatCurrency(plan.creditLimit - plan.balance)} freed
                      </p>
                    </td>

                    {/* Utilization */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${utilizationColor(plan.utilization)}`}
                            style={{ width: `${plan.utilization}%` }}
                          />
                        </div>
                        <span className={`text-xs w-8 text-right font-semibold ${
                          plan.utilization >= 70 ? 'text-red-400' : plan.utilization >= 40 ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {plan.utilization}%
                        </span>
                      </div>
                    </td>

                    {/* ETA */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-200 font-medium">{plan.payoffMonths}mo</span>
                    </td>

                    {/* Autopay */}
                    <td className="px-4 py-3 text-center">
                      {plan.autopay === 'not_set' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAutopayModal({ planId: plan.id, cardName: plan.cardName });
                          }}
                          className="text-xs font-semibold text-[#C9A84C] hover:text-[#e0c166] border border-[#C9A84C]/40 rounded-md px-2 py-1 hover:bg-[#C9A84C]/10 transition-colors"
                        >
                          Set Up Autopay
                        </button>
                      ) : (
                        <span className={`text-xs font-semibold ${ap.className}`}>
                          {ap.icon} {ap.text}
                        </span>
                      )}
                    </td>

                    {/* Status badge — 5D: "behind" gets escalate button */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
                          {s.label}
                        </span>
                        {plan.status === 'behind' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEscalatePlan(plan);
                            }}
                            className="text-[10px] font-semibold text-yellow-400 hover:text-yellow-300 transition-colors underline decoration-dotted"
                          >
                            Escalate &rarr;
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 bg-gray-900/30 text-xs text-gray-400">
          <span>
            {strategy === 'avalanche'
              ? 'Avalanche method: direct extra payments to the highest-APR card first.'
              : 'Snowball method: direct extra payments to the lowest-balance card first.'}
          </span>
          <span className="text-[#C9A84C] font-semibold">
            Extra payment capacity: {formatCurrency(extraPayment)}/mo
          </span>
        </div>
      </div>

      {/* Method comparison panel — below the plans table */}
      <MethodComparisonPanel
        method={strategy}
        avalanche={AVALANCHE_STATS}
        snowball={SNOWBALL_STATS}
      />

      {/* Payoff projection chart — visual balance decline over time */}
      <PayoffProjectionChart initialStrategy={strategy} />

      {/* Payment calendar */}
      <PaymentCalendar payments={PLACEHOLDER_PAYMENTS} />
      {/* Payment calendar — 5E: day-click with Mark Paid + Past Due CTA */}
      <PaymentCalendar
        payments={PLACEHOLDER_PAYMENTS}
        onMarkPaid={(paymentId) => {
          // Mock: show toast-like feedback (in production, update via API)
          const el = document.createElement('div');
          el.className = 'fixed bottom-4 right-4 z-50 bg-green-900 border border-green-700 text-green-200 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg transition-opacity';
          el.textContent = `Payment marked as paid`;
          document.body.appendChild(el);
          setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
        }}
        onContactClient={(paymentId) => {
          const el = document.createElement('div');
          el.className = 'fixed bottom-4 right-4 z-50 bg-yellow-900 border border-yellow-700 text-yellow-200 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg transition-opacity';
          el.textContent = `Contact request sent for overdue payment`;
          document.body.appendChild(el);
          setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
        }}
      />

      {/* Card detail drawer (slide-over) */}
      <RepaymentCardDetailDrawer
        plan={selectedPlan ? toDrawerPlan(selectedPlan) : null}
        isOpen={selectedPlan !== null}
        onClose={() => setSelectedPlan(null)}
      />

      {/* Balance transfer panel (legacy modal) */}
      {transferPlan && (
        <BalanceTransferPanel
          card={transferPlan.cardName}
          issuer={transferPlan.issuer}
          balance={transferPlan.balance}
          currentApr={transferPlan.apr}
          isOpen={transferPlan !== null}
          onClose={() => setTransferPlan(null)}
        />
      )}

      {/* Autopay setup modal (inline overlay) */}
      {autopayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-[#0A1628] p-6 shadow-2xl animate-fade-in">
            <h3 className="text-lg font-semibold text-white mb-1">Set Up Autopay</h3>
            <p className="text-sm text-gray-400 mb-5">
              Configure automatic payments for <span className="text-gray-200 font-medium">{autopayModal.cardName}</span>
            </p>

            {/* Payment type */}
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Payment Type
            </label>
            <div className="flex gap-2 mb-5">
              {([
                { value: 'minimum', label: 'Minimum' },
                { value: 'fixed', label: 'Fixed Amount' },
                { value: 'full', label: 'Full Balance' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAutopayType(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    autopayType === opt.value
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Fixed amount input (only when fixed is selected) */}
            {autopayType === 'fixed' && (
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Monthly Amount ($)
                </label>
                <input
                  type="number"
                  min={1}
                  value={autopayFixedAmount}
                  onChange={(e) => setAutopayFixedAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
                />
              </div>
            )}

            {/* Payment day */}
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Payment Day of Month
            </label>
            <select
              value={autopayDay}
              onChange={(e) => setAutopayDay(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors mb-6"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                </option>
              ))}
            </select>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAutopayModal(null);
                  setAutopayType('minimum');
                  setAutopayDay(1);
                  setAutopayFixedAmount(100);
                }}
                className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAutopay}
                className="rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#0A1628] hover:bg-[#d8b85b] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      {/* Balance transfer recommender modal (new) */}
      {transferModalPlan && (
        <BalanceTransferModal
          card={transferModalPlan.cardName}
          issuer={transferModalPlan.issuer}
          balance={transferModalPlan.balance}
          currentApr={transferModalPlan.apr}
          isOpen={transferModalPlan !== null}
          onClose={() => setTransferModalPlan(null)}
          onApply={(cardId) => {
            // Placeholder: would navigate to application flow
            console.log(`Apply for transfer card: ${cardId}`);
            setTransferModalPlan(null);
          }}
        />
      )}

      {/* 5C: Email to Client modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEmailModal(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700 bg-[#0A1628] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-semibold text-white">Email to Client</h3>
              <button onClick={() => setShowEmailModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">&times;</button>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preview</p>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-gray-900/50 border border-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto">{emailPreview}</pre>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSendEmail}
                  disabled={emailSent}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${emailSent ? 'bg-green-800 text-green-200' : 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8993f]'}`}
                >
                  {emailSent ? 'Email Sent!' : 'Send Email'}
                </button>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5C: Generate Letter modal */}
      {showLetterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLetterModal(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-[#C9A84C]">&#10022;</span>
                <h3 className="text-base font-semibold text-white">AI-Generated Repayment Letter</h3>
              </div>
              <button onClick={() => setShowLetterModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">&times;</button>
            </div>
            <div className="p-5">
              {generatingLetter ? (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="w-5 h-5 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-[#C9A84C] font-semibold">Generating guidance letter...</span>
                </div>
              ) : letterText ? (
                <>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-[#C9A84C]/5 border border-[#C9A84C]/20 rounded-lg p-4 max-h-80 overflow-y-auto">{letterText}</pre>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        const blob = new Blob([letterText], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `repayment-letter-${new Date().toISOString().slice(0, 10)}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#C9A84C] text-[#0A1628] hover:bg-[#b8993f] transition-colors"
                    >
                      Download Letter
                    </button>
                    <button
                      onClick={() => setShowLetterModal(false)}
                      className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 5D: Escalation modal */}
      <EscalationModal
        isOpen={escalatePlan !== null}
        cardName={escalatePlan?.cardName ?? ''}
        issuer={escalatePlan?.issuer ?? ''}
        balance={escalatePlan?.balance ?? 0}
        onClose={() => setEscalatePlan(null)}
      />

    </div>
  );
}

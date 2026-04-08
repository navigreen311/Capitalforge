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

  // Balance transfer panel state
  const [transferPlan, setTransferPlan] = useState<RepaymentPlan | null>(null);

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
                    if (matchingPlan) setTransferPlan(matchingPlan);
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
                                setTransferPlan(plan);
                              }}
                              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline"
                            >
                              Explore Transfer &rarr;
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

                    {/* Status badge */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
                        {s.label}
                      </span>
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

      {/* Payment calendar */}
      <PaymentCalendar payments={PLACEHOLDER_PAYMENTS} />

      {/* Card detail drawer (slide-over) */}
      <RepaymentCardDetailDrawer
        plan={selectedPlan ? toDrawerPlan(selectedPlan) : null}
        isOpen={selectedPlan !== null}
        onClose={() => setSelectedPlan(null)}
      />

      {/* Balance transfer panel (modal) */}
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
      )}

    </div>
  );
}

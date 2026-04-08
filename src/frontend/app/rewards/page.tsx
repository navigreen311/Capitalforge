'use client';

// Metadata moved to layout or removed — client components cannot export metadata
import { useState, useMemo, useCallback } from 'react';
import { StatCard, SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeStatus } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@/components/ui/data-table';
import RewardsSummaryCard from '@/components/modules/rewards-summary-card';
import type { CategoryBestCard } from '@/components/modules/rewards-summary-card';
import {
  RewardsClientSelector,
  RewardsTrendChart,
  REWARDS_TREND_PLACEHOLDER,
  RewardsActionModal,
  FeeRenewalCalendar,
  RoutingOpportunityGap,
  PointsValuationColumn,
  PointsBalancePanel,
  POINTS_BALANCE_PLACEHOLDER,
  FeeWaiverModal,
} from '@/components/rewards';
import type { RewardsClient, RewardsActionCard, FeeRenewalCard } from '@/components/rewards';



// ─── Types ────────────────────────────────────────────────────────────────────

type CardRec = 'keep' | 'review' | 'cancel';

interface SpendRoute {
  [key: string]: unknown;
  id: string;
  mccCategory: string;
  mccCode: string;
  bestCard: string;
  rewardRate: string;
  rewardType: string;
  monthlySpend: string;
  projectedAnnualReward: string;
}

interface CardSummary {
  [key: string]: unknown;
  id: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  annualRewardsEarned: number;
  netBenefit: number;
  recommendation: CardRec;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SPEND_ROUTES: SpendRoute[] = [
  {
    id: 'sr-01',
    mccCategory: 'Travel — Airlines',
    mccCode: '3000–3299',
    bestCard: 'Amex Business Platinum',
    rewardRate: '5.0%',
    rewardType: 'Points',
    monthlySpend: '$8,400',
    projectedAnnualReward: '$5,040',
  },
  {
    id: 'sr-02',
    mccCategory: 'Hotels & Lodging',
    mccCode: '7011',
    bestCard: 'Chase Ink Preferred',
    rewardRate: '3.0%',
    rewardType: 'Points',
    monthlySpend: '$3,200',
    projectedAnnualReward: '$1,152',
  },
  {
    id: 'sr-03',
    mccCategory: 'Dining & Restaurants',
    mccCode: '5812',
    bestCard: 'Amex Business Gold',
    rewardRate: '4.0%',
    rewardType: 'Points',
    monthlySpend: '$2,600',
    projectedAnnualReward: '$1,248',
  },
  {
    id: 'sr-04',
    mccCategory: 'Office Supplies',
    mccCode: '5943',
    bestCard: 'Chase Ink Cash',
    rewardRate: '5.0%',
    rewardType: 'Cash Back',
    monthlySpend: '$1,100',
    projectedAnnualReward: '$660',
  },
  {
    id: 'sr-05',
    mccCategory: 'Advertising & Media',
    mccCode: '7311',
    bestCard: 'Amex Business Gold',
    rewardRate: '4.0%',
    rewardType: 'Points',
    monthlySpend: '$5,800',
    projectedAnnualReward: '$2,784',
  },
  {
    id: 'sr-06',
    mccCategory: 'Shipping & Freight',
    mccCode: '4215',
    bestCard: 'Chase Ink Cash',
    rewardRate: '5.0%',
    rewardType: 'Cash Back',
    monthlySpend: '$900',
    projectedAnnualReward: '$540',
  },
  {
    id: 'sr-07',
    mccCategory: 'Gas & Fuel',
    mccCode: '5541',
    bestCard: 'Bank of America Bus. Cash',
    rewardRate: '3.0%',
    rewardType: 'Cash Back',
    monthlySpend: '$1,400',
    projectedAnnualReward: '$504',
  },
  {
    id: 'sr-08',
    mccCategory: 'Utilities & Telecom',
    mccCode: '4900',
    bestCard: 'Citi Business AA Plat',
    rewardRate: '2.0%',
    rewardType: 'Miles',
    monthlySpend: '$2,200',
    projectedAnnualReward: '$528',
  },
  {
    id: 'sr-09',
    mccCategory: 'SaaS & Software',
    mccCode: '5045',
    bestCard: 'Chase Ink Preferred',
    rewardRate: '3.0%',
    rewardType: 'Points',
    monthlySpend: '$3,900',
    projectedAnnualReward: '$1,404',
  },
  {
    id: 'sr-10',
    mccCategory: 'General Merchandise',
    mccCode: '5999',
    bestCard: 'Capital One Spark Cash+',
    rewardRate: '2.0%',
    rewardType: 'Cash Back',
    monthlySpend: '$4,100',
    projectedAnnualReward: '$984',
  },
];

const CARD_SUMMARIES: CardSummary[] = [
  {
    id: 'cs-01',
    cardName: 'Amex Business Platinum',
    issuer: 'American Express',
    annualFee: 695,
    annualRewardsEarned: 5820,
    netBenefit: 5125,
    recommendation: 'keep',
  },
  {
    id: 'cs-02',
    cardName: 'Amex Business Gold',
    issuer: 'American Express',
    annualFee: 375,
    annualRewardsEarned: 4032,
    netBenefit: 3657,
    recommendation: 'keep',
  },
  {
    id: 'cs-03',
    cardName: 'Chase Ink Preferred',
    issuer: 'Chase',
    annualFee: 95,
    annualRewardsEarned: 2556,
    netBenefit: 2461,
    recommendation: 'keep',
  },
  {
    id: 'cs-04',
    cardName: 'Chase Ink Cash',
    issuer: 'Chase',
    annualFee: 0,
    annualRewardsEarned: 1200,
    netBenefit: 1200,
    recommendation: 'keep',
  },
  {
    id: 'cs-05',
    cardName: 'Citi Business AA Plat',
    issuer: 'Citibank',
    annualFee: 99,
    annualRewardsEarned: 528,
    netBenefit: 429,
    recommendation: 'review',
  },
  {
    id: 'cs-06',
    cardName: 'Bank of America Bus. Cash',
    issuer: 'Bank of America',
    annualFee: 0,
    annualRewardsEarned: 504,
    netBenefit: 504,
    recommendation: 'keep',
  },
  {
    id: 'cs-07',
    cardName: 'Capital One Spark Cash+',
    issuer: 'Capital One',
    annualFee: 150,
    annualRewardsEarned: 984,
    netBenefit: 834,
    recommendation: 'keep',
  },
  {
    id: 'cs-08',
    cardName: 'Wells Fargo Bus. Elite',
    issuer: 'Wells Fargo',
    annualFee: 125,
    annualRewardsEarned: 88,
    netBenefit: -37,
    recommendation: 'cancel',
  },
];

const CATEGORY_BESTS: CategoryBestCard[] = [
  { category: 'Travel',      cardName: 'Amex Business Platinum', rewardRate: 0.05, rewardType: 'Points',    iconCode: 'TR' },
  { category: 'Dining',      cardName: 'Amex Business Gold',     rewardRate: 0.04, rewardType: 'Points',    iconCode: 'DI' },
  { category: 'Office',      cardName: 'Chase Ink Cash',         rewardRate: 0.05, rewardType: 'Cash Back', iconCode: 'OF' },
  { category: 'Advertising', cardName: 'Amex Business Gold',     rewardRate: 0.04, rewardType: 'Points',    iconCode: 'AD' },
  { category: 'Shipping',    cardName: 'Chase Ink Cash',         rewardRate: 0.05, rewardType: 'Cash Back', iconCode: 'SH' },
  { category: 'Fuel',        cardName: 'Bank of America Bus. Cash', rewardRate: 0.03, rewardType: 'Cash Back', iconCode: 'GS' },
];

// ─── Fee renewal calendar data ───────────────────────────────────────────────

const FEE_RENEWAL_CARDS: FeeRenewalCard[] = CARD_SUMMARIES
  .filter((c) => c.annualFee > 0)
  .map((c, i) => ({
    card: c.cardName,
    issuer: c.issuer,
    // Stagger renewal dates across the year
    renewalDate: `2026-${String((i + 4) % 12 + 1).padStart(2, '0')}-15`,
    annualFee: c.annualFee,
    recommendation: c.recommendation,
  }));

// ─── Recommendation badge map ────────────────────────────────────────────────

const REC_CONFIG: Record<CardRec, { label: string; status: BadgeStatus }> = {
  keep:   { label: 'Keep',   status: 'approved' },
  review: { label: 'Review', status: 'pending'  },
  cancel: { label: 'Cancel', status: 'declined' },
};

// ─── CSV export helper ──────────────────────────────────────────────────────

function exportCardSummaryCSV(data: CardSummary[]) {
  const headers = ['Card Name', 'Issuer', 'Annual Fee', 'Rewards Earned', 'Net Benefit', 'Recommendation'];
  const rows = data.map((c) => [
    c.cardName,
    c.issuer,
    c.annualFee,
    c.annualRewardsEarned,
    c.netBenefit,
    c.recommendation,
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'card-summary-report.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Table column definitions ─────────────────────────────────────────────────

function buildRouteColumns(onSetReminder: (route: SpendRoute) => void): ColumnDef<SpendRoute>[] {
  return [
    {
      key: 'mccCategory',
      header: 'MCC Category',
      sortable: true,
      cell: (row) => (
        <span className="font-medium text-gray-900">{row.mccCategory}</span>
      ),
    },
    {
      key: 'mccCode',
      header: 'MCC Code',
      sortable: false,
      cell: (row) => (
        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {row.mccCode}
        </span>
      ),
    },
    {
      key: 'bestCard',
      header: 'Best Card',
      sortable: true,
      cell: (row) => (
        <span className="font-semibold text-brand-navy text-sm">{row.bestCard}</span>
      ),
    },
    {
      key: 'rewardRate',
      header: 'Rate',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-bold text-emerald-600">{row.rewardRate}</span>
      ),
    },
    {
      key: 'rewardType',
      header: 'Type',
      sortable: true,
    },
    {
      key: 'monthlySpend',
      header: 'Monthly Spend',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-medium text-gray-800">{row.monthlySpend}</span>
      ),
    },
    {
      key: 'projectedAnnualReward',
      header: 'Projected Annual Reward',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-bold text-gray-900">{row.projectedAnnualReward}</span>
      ),
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetReminder(row); }}
          className="text-xs font-medium text-brand-navy hover:text-brand-navy/80
                     bg-brand-navy/5 hover:bg-brand-navy/10
                     px-2.5 py-1 rounded-md transition-all duration-150
                     whitespace-nowrap"
        >
          Set Reminder
        </button>
      ),
    },
  ];
}

function buildCardColumns(
  onCancel: (card: CardSummary) => void,
  onReview: (card: CardSummary) => void,
): ColumnDef<CardSummary>[] {
  return [
    {
      key: 'cardName',
      header: 'Card',
      sortable: true,
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-tight">{row.cardName}</p>
          <p className="text-xs text-gray-400">{row.issuer}</p>
        </div>
      ),
    },
    {
      key: 'annualFee',
      header: 'Annual Fee',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className={`font-medium ${row.annualFee === 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
          {row.annualFee === 0 ? 'No fee' : `$${row.annualFee.toLocaleString()}`}
        </span>
      ),
    },
    {
      key: 'annualRewardsEarned',
      header: 'Rewards Earned',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-bold text-emerald-600">
          ${row.annualRewardsEarned.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'netBenefit',
      header: 'Net Benefit',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span
          className={`font-bold ${
            row.netBenefit >= 0 ? 'text-gray-900' : 'text-red-500'
          }`}
        >
          {row.netBenefit >= 0 ? '+' : ''}${row.netBenefit.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'recommendation',
      header: 'Recommendation',
      sortable: true,
      cell: (row) => {
        const cfg = REC_CONFIG[row.recommendation as CardRec];
        return <Badge status={cfg.status} label={cfg.label} />;
      },
    },
    {
      key: '_action',
      header: '',
      sortable: false,
      align: 'right',
      cell: (row) => {
        if (row.recommendation === 'cancel') {
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(row); }}
              className="text-xs font-medium text-red-600 hover:text-red-700
                         bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-md
                         transition-colors duration-150 whitespace-nowrap"
            >
              Cancel Card
            </button>
          );
        }
        if (row.recommendation === 'review') {
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReview(row); }}
              className="text-xs font-medium text-amber-700 hover:text-amber-800
                         bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md
                         transition-colors duration-150 whitespace-nowrap"
            >
              Review
            </button>
          );
        }
        return null;
      },
    },
  ];
}

// ─── KPI totals ───────────────────────────────────────────────────────────────

const TOTAL_REWARDS  = CARD_SUMMARIES.reduce((s, c) => s + c.annualRewardsEarned, 0);
const TOTAL_FEES     = CARD_SUMMARIES.reduce((s, c) => s + c.annualFee, 0);
const TOTAL_NET      = CARD_SUMMARIES.reduce((s, c) => s + c.netBenefit, 0);
const TOTAL_MONTHLY  = 33600; // combined monthly card spend (placeholder)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  // Client selector state
  const [selectedClient, setSelectedClient] = useState<RewardsClient | null>(null);

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'cancel' | 'negotiate';
    card: RewardsActionCard;
  }>({
    isOpen: false,
    type: 'cancel',
    card: { name: '', issuer: '', annualFee: 0, rewardsEarned: 0, netBenefit: 0 },
  });

  // Fee waiver modal state
  const [feeWaiverModal, setFeeWaiverModal] = useState<{
    isOpen: boolean;
    cardName: string;
    issuer: string;
    annualFee: number;
  }>({ isOpen: false, cardName: '', issuer: '', annualFee: 0 });

  // Reminder toast state
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  // Card summary sort state
  const [cardSortCol, setCardSortCol] = useState<keyof CardSummary | null>(null);
  const [cardSortDir, setCardSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedCardSummaries = useMemo(() => {
    if (!cardSortCol) return CARD_SUMMARIES;
    return [...CARD_SUMMARIES].sort((a, b) => {
      const va = a[cardSortCol];
      const vb = b[cardSortCol];
      const aStr = va == null ? '' : String(va);
      const bStr = vb == null ? '' : String(vb);
      const aNum = typeof va === 'number' ? va : parseFloat(aStr.replace(/[^0-9.-]/g, ''));
      const bNum = typeof vb === 'number' ? vb : parseFloat(bStr.replace(/[^0-9.-]/g, ''));
      const numeric = !isNaN(aNum) && !isNaN(bNum);
      const cmp = numeric ? aNum - bNum : aStr.localeCompare(bStr);
      return cardSortDir === 'asc' ? cmp : -cmp;
    });
  }, [cardSortCol, cardSortDir]);

  const handleCardSort = useCallback((col: keyof CardSummary) => {
    setCardSortCol((prev) => {
      if (prev === col) {
        setCardSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return col;
      }
      setCardSortDir('asc');
      return col;
    });
  }, []);

  const openCancelModal = useCallback((card: CardSummary) => {
    setActionModal({
      isOpen: true,
      type: 'cancel',
      card: {
        name: card.cardName,
        issuer: card.issuer,
        annualFee: card.annualFee,
        rewardsEarned: card.annualRewardsEarned,
        netBenefit: card.netBenefit,
      },
    });
  }, []);

  const openReviewModal = useCallback((card: CardSummary) => {
    setActionModal({
      isOpen: true,
      type: 'negotiate',
      card: {
        name: card.cardName,
        issuer: card.issuer,
        annualFee: card.annualFee,
        rewardsEarned: card.annualRewardsEarned,
        netBenefit: card.netBenefit,
      },
    });
  }, []);

  const closeModal = useCallback(() => {
    setActionModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openFeeWaiverModal = useCallback((card: FeeRenewalCard) => {
    setFeeWaiverModal({
      isOpen: true,
      cardName: card.card,
      issuer: card.issuer,
      annualFee: card.annualFee,
    });
  }, []);

  const closeFeeWaiverModal = useCallback(() => {
    setFeeWaiverModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSetReminder = useCallback((route: SpendRoute) => {
    setReminderToast(`Reminder set for ${route.mccCategory} routing`);
    setTimeout(() => setReminderToast(null), 3000);
  }, []);

  const routeColumns = useMemo(() => buildRouteColumns(handleSetReminder), [handleSetReminder]);
  const cardColumns = useMemo(() => buildCardColumns(openCancelModal, openReviewModal), [openCancelModal, openReviewModal]);

  return (
    <div className="space-y-8">
      {/* ── Client selector ─────────────────────────────────── */}
      <RewardsClientSelector
        selectedClient={selectedClient}
        onClientSelect={setSelectedClient}
        onClear={() => setSelectedClient(null)}
      />

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards Optimization</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Spend routing recommendations and card ROI analysis
          </p>
        </div>
        <button
          className="btn-accent btn flex-shrink-0"
          onClick={() => exportCardSummaryCSV(sortedCardSummaries)}
        >
          <span aria-hidden="true">&#8595;</span>
          Export Report
        </button>
      </div>

      {/* ── KPI strip ────────────────────────────────────────── */}
      <section aria-labelledby="rewards-kpi-heading">
        <h2 id="rewards-kpi-heading" className="sr-only">Rewards Key Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Rewards Earned"
            value={`$${TOTAL_REWARDS.toLocaleString()}`}
            trendLabel="+$1,240 vs last year"
            trendDirection="up"
            icon="RW"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
            subtitle="Annualised estimate"
          />
          <StatCard
            title="Total Annual Fees"
            value={`$${TOTAL_FEES.toLocaleString()}`}
            trendLabel="-$95 vs last year"
            trendDirection="up"
            icon="FE"
            iconBg="bg-red-50"
            iconColor="text-red-600"
            subtitle="8 active cards"
          />
          <StatCard
            title="Net Benefit"
            value={`$${TOTAL_NET.toLocaleString()}`}
            trendLabel="+$1,335 vs last year"
            trendDirection="up"
            icon="NB"
            iconBg="bg-brand-navy/5"
            iconColor="text-brand-navy"
            subtitle="Rewards minus all fees"
          />
          <StatCard
            title="Monthly Card Spend"
            value={`$${(TOTAL_MONTHLY / 1000).toFixed(1)}K`}
            trendLabel="+$2.1K this month"
            trendDirection="up"
            icon="SP"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
            subtitle="Across all active cards"
          />
        </div>
      </section>

      {/* ── Rewards trend chart ──────────────────────────────── */}
      <RewardsTrendChart
        data={REWARDS_TREND_PLACEHOLDER}
        yoyDelta="+$1,240 vs last year"
      />

      {/* ── Points balance panel ──────────────────────────────── */}
      <PointsBalancePanel cards={POINTS_BALANCE_PLACEHOLDER} />

      {/* ── Main body ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: tables (2/3) ──────────────────────────────── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Spend routing table */}
          <SectionCard
            title="Spend Routing Recommendations"
            subtitle="Optimal card assignment per MCC category to maximise reward yield"
            flushBody
          >
            <DataTable<SpendRoute>
              columns={routeColumns}
              data={SPEND_ROUTES}
              rowKey="id"
              defaultPageSize={10}
              pageSizeOptions={[10, 25]}
            />
          </SectionCard>

          {/* Routing opportunity gap */}
          <RoutingOpportunityGap
            currentYield={15712}
            optimalYield={18400}
            gap={2688}
          />

          {/* Card ROI table */}
          <SectionCard
            title="Annual Rewards vs Fees — Card Summary"
            subtitle="Keep / review / cancel recommendation per card based on net benefit"
            flushBody
          >
            <DataTable<CardSummary>
              columns={cardColumns}
              data={sortedCardSummaries}
              rowKey="id"
              defaultPageSize={8}
              pageSizeOptions={[8, 25]}
            />
          </SectionCard>

          {/* Fee renewal calendar */}
          <FeeRenewalCalendar cards={FEE_RENEWAL_CARDS} onFeeWaiver={openFeeWaiverModal} />
        </div>

        {/* ── Right: summary card (1/3) ────────────────────────── */}
        <div className="space-y-6">
          <RewardsSummaryCard
            totalRewardsEarned={TOTAL_REWARDS}
            totalAnnualFees={TOTAL_FEES}
            categoryCards={CATEGORY_BESTS}
          />

          {/* Recommendation legend */}
          <SectionCard title="Decision Legend" subtitle="How recommendations are determined">
            <div className="space-y-3 text-sm">
              <LegendRow
                status="approved"
                label="Keep"
                description="Net benefit is positive; card earns more than it costs."
              />
              <LegendRow
                status="pending"
                label="Negotiate"
                description="Marginal ROI; consider fee waiver or product change."
              />
              <LegendRow
                status="declined"
                label="Cancel"
                description="Fees exceed rewards earned — close or downgrade card."
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Action modal ────────────────────────────────────── */}
      <RewardsActionModal
        isOpen={actionModal.isOpen}
        onClose={closeModal}
        type={actionModal.type}
        card={actionModal.card}
      />

      {/* ── Fee waiver modal ──────────────────────────────────── */}
      <FeeWaiverModal
        isOpen={feeWaiverModal.isOpen}
        onClose={closeFeeWaiverModal}
        cardName={feeWaiverModal.cardName}
        issuer={feeWaiverModal.issuer}
        annualFee={feeWaiverModal.annualFee}
      />

      {/* ── Reminder toast ──────────────────────────────────── */}
      {reminderToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-brand-navy px-5 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
          {reminderToast}
        </div>
      )}
    </div>
  );
}

// ─── Legend row helper ────────────────────────────────────────────────────────

function LegendRow({
  status,
  label,
  description,
}: {
  status: BadgeStatus;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Badge status={status} label={label} className="flex-shrink-0 mt-0.5" />
      <p className="text-gray-500 text-xs leading-relaxed">{description}</p>
    </div>
  );
}

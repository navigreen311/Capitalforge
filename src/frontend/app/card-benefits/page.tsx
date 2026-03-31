'use client';

import React, { useState } from 'react';
import { SectionCard, StatCard } from '@/components/ui/card';

// Next.js metadata cannot be exported from 'use client' files — kept as a
// comment for reference. Title: 'Card Benefits Tracker'

// ─── Types ────────────────────────────────────────────────────────────────────

type BenefitStatus = 'used' | 'unused' | 'expired';
type CardRenewalRec = 'keep' | 'negotiate' | 'cancel';

interface Benefit {
  id: string;
  name: string;
  value: number;         // estimated dollar value
  status: BenefitStatus;
  expiryDate?: string;   // ISO date — when the benefit resets/expires
  notes?: string;
}

interface CardBenefitProfile {
  id: string;
  cardName: string;
  issuer: string;
  iconCode: string;
  iconBg: string;
  iconText: string;
  annualFee: number;
  totalBenefitsValue: number;
  benefitsUsedValue: number;
  renewal: CardRenewalRec;
  renewalDate: string;   // ISO date
  benefits: Benefit[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const CARDS: CardBenefitProfile[] = [
  {
    id: 'card-01',
    cardName: 'Amex Business Platinum',
    issuer: 'American Express',
    iconCode: 'AX',
    iconBg: 'bg-brand-navy/10',
    iconText: 'text-brand-navy',
    annualFee: 695,
    totalBenefitsValue: 1540,
    benefitsUsedValue: 1290,
    renewal: 'keep',
    renewalDate: '2026-11-01',
    benefits: [
      { id: 'b-01-1', name: '$200 Airline Fee Credit',     value: 200,  status: 'used',   expiryDate: '2026-12-31' },
      { id: 'b-01-2', name: '$189 CLEAR Membership',       value: 189,  status: 'used',   expiryDate: '2026-12-31' },
      { id: 'b-01-3', name: '$100 Global Entry/TSA',       value: 100,  status: 'used',   expiryDate: '2027-06-01' },
      { id: 'b-01-4', name: '$200 Hotel Collection Credit',value: 200,  status: 'used',   expiryDate: '2026-12-31' },
      { id: 'b-01-5', name: 'Centurion Lounge Access',     value: 600,  status: 'used',   expiryDate: '2026-11-01' },
      { id: 'b-01-6', name: '$179 GOES Credit',            value: 179,  status: 'unused', expiryDate: '2026-12-31', notes: 'Enroll before Dec' },
      { id: 'b-01-7', name: 'Fine Hotels & Resorts Perks', value: 72,   status: 'unused', expiryDate: '2026-11-01' },
    ],
  },
  {
    id: 'card-02',
    cardName: 'Amex Business Gold',
    issuer: 'American Express',
    iconCode: 'AG',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    annualFee: 375,
    totalBenefitsValue: 810,
    benefitsUsedValue: 810,
    renewal: 'keep',
    renewalDate: '2026-09-15',
    benefits: [
      { id: 'b-02-1', name: '$240 Flexible Business Credit', value: 240, status: 'used',   expiryDate: '2026-12-31' },
      { id: 'b-02-2', name: '$155 Walmart+ Credit',          value: 155, status: 'used',   expiryDate: '2026-12-31' },
      { id: 'b-02-3', name: 'No Foreign Transaction Fees',   value: 415, status: 'used',   expiryDate: '2026-09-15' },
    ],
  },
  {
    id: 'card-03',
    cardName: 'Chase Ink Preferred',
    issuer: 'Chase',
    iconCode: 'IP',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
    annualFee: 95,
    totalBenefitsValue: 380,
    benefitsUsedValue: 240,
    renewal: 'keep',
    renewalDate: '2026-08-20',
    benefits: [
      { id: 'b-03-1', name: 'Cell Phone Protection',       value: 180, status: 'used',   expiryDate: '2026-08-20' },
      { id: 'b-03-2', name: 'Purchase Protection',         value: 120, status: 'used',   expiryDate: '2026-08-20' },
      { id: 'b-03-3', name: 'Trip Cancellation Insurance', value: 80,  status: 'unused', expiryDate: '2026-08-20', notes: 'No eligible trip yet' },
    ],
  },
  {
    id: 'card-04',
    cardName: 'Chase Ink Cash',
    issuer: 'Chase',
    iconCode: 'IC',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    annualFee: 0,
    totalBenefitsValue: 220,
    benefitsUsedValue: 220,
    renewal: 'keep',
    renewalDate: '2026-07-10',
    benefits: [
      { id: 'b-04-1', name: 'Extended Warranty',    value: 120, status: 'used',   expiryDate: '2026-07-10' },
      { id: 'b-04-2', name: 'Purchase Protection',  value: 100, status: 'used',   expiryDate: '2026-07-10' },
    ],
  },
  {
    id: 'card-05',
    cardName: 'Citi Business AA Plat',
    issuer: 'Citibank',
    iconCode: 'CB',
    iconBg: 'bg-red-100',
    iconText: 'text-red-700',
    annualFee: 99,
    totalBenefitsValue: 180,
    benefitsUsedValue: 50,
    renewal: 'negotiate',
    renewalDate: '2026-06-01',
    benefits: [
      { id: 'b-05-1', name: 'First Checked Bag Free',    value: 80,  status: 'unused', expiryDate: '2026-06-01', notes: 'Rarely fly AA' },
      { id: 'b-05-2', name: 'Priority Boarding',         value: 50,  status: 'used',   expiryDate: '2026-06-01' },
      { id: 'b-05-3', name: '$100 AA Flight Discount',   value: 50,  status: 'unused', expiryDate: '2026-12-31', notes: 'Threshold not met' },
    ],
  },
  {
    id: 'card-06',
    cardName: 'Wells Fargo Bus. Elite',
    issuer: 'Wells Fargo',
    iconCode: 'WF',
    iconBg: 'bg-red-50',
    iconText: 'text-red-600',
    annualFee: 125,
    totalBenefitsValue: 60,
    benefitsUsedValue: 0,
    renewal: 'cancel',
    renewalDate: '2026-05-15',
    benefits: [
      { id: 'b-06-1', name: 'Cell Phone Protection', value: 60, status: 'unused', expiryDate: '2026-05-15', notes: 'Covered by another card' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Renewal recommendation config ───────────────────────────────────────────

const RENEWAL_CONFIG: Record<
  CardRenewalRec,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  keep:      { label: 'Keep',      bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  negotiate: { label: 'Negotiate', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  cancel:    { label: 'Cancel',    bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'     },
};

// ─── Benefit status config ────────────────────────────────────────────────────

const BENEFIT_STATUS_CONFIG: Record<
  BenefitStatus,
  { label: string; bg: string; text: string }
> = {
  used:    { label: 'Used',    bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  unused:  { label: 'Unused',  bg: 'bg-gray-100',    text: 'text-gray-600'    },
  expired: { label: 'Expired', bg: 'bg-red-50',      text: 'text-red-600'     },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpiryBadge({ isoDate }: { isoDate: string }) {
  const days = daysUntil(isoDate);
  let bgClass: string;
  let label: string;

  if (days < 0) {
    bgClass = 'bg-red-100 text-red-700';
    label = 'Expired';
  } else if (days <= 30) {
    bgClass = 'bg-amber-100 text-amber-700';
    label = `${days}d left`;
  } else if (days <= 90) {
    bgClass = 'bg-blue-50 text-blue-600';
    label = `${days}d left`;
  } else {
    bgClass = 'bg-gray-100 text-gray-500';
    label = formatDate(isoDate);
  }

  return (
    <span
      className={`inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 ${bgClass}`}
    >
      {label}
    </span>
  );
}

function RenewalBadge({ rec }: { rec: CardRenewalRec }) {
  const cfg = RENEWAL_CONFIG[rec];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium
                  px-2.5 py-1 ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function BenefitStatusPill({ status }: { status: BenefitStatus }) {
  const cfg = BENEFIT_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full text-[10px] font-semibold
                  px-2 py-0.5 ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Utilization bar ──────────────────────────────────────────────────────────

function UtilizationBar({
  usedValue,
  totalValue,
  annualFee,
}: {
  usedValue: number;
  totalValue: number;
  annualFee: number;
}) {
  const usedPct   = totalValue > 0 ? Math.min((usedValue / totalValue) * 100, 100) : 0;
  const feePct    = totalValue > 0 ? Math.min((annualFee / totalValue) * 100, 100) : 0;

  return (
    <div className="space-y-1.5 mt-3">
      {/* Benefits value bar */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>Benefits used</span>
        <span className="font-semibold text-gray-700">
          ${usedValue.toLocaleString()} / ${totalValue.toLocaleString()}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${usedPct}%` }}
        />
      </div>

      {/* Annual fee bar */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 mb-1">
        <span>Annual fee</span>
        <span className="font-semibold text-red-500">
          {annualFee === 0 ? 'No fee' : `$${annualFee.toLocaleString()}`}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-red-400 transition-all duration-500"
          style={{ width: `${feePct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Card benefit tile ────────────────────────────────────────────────────────

function CardBenefitTile({ card }: { card: CardBenefitProfile }) {
  const [expanded, setExpanded] = useState(false);
  const unusedBenefits  = card.benefits.filter((b) => b.status === 'unused');
  const unusedCount     = unusedBenefits.length;
  const totalCount      = card.benefits.length;
  const renewalDays     = daysUntil(card.renewalDate);
  const renewalUrgent   = renewalDays <= 60;

  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden flex flex-col">
      {/* ── Card header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-border">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg
                         text-xs font-bold flex-shrink-0 ${card.iconBg} ${card.iconText}`}
            aria-hidden="true"
          >
            {card.iconCode}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {card.cardName}
            </p>
            <p className="text-xs text-gray-400">{card.issuer}</p>
          </div>
        </div>
        <RenewalBadge rec={card.renewal} />
      </div>

      {/* ── Utilization bar ──────────────────────────────────── */}
      <div className="px-5 pt-3 pb-2">
        <UtilizationBar
          usedValue={card.benefitsUsedValue}
          totalValue={card.totalBenefitsValue}
          annualFee={card.annualFee}
        />
      </div>

      {/* ── Benefit list ─────────────────────────────────────── */}
      <div className="flex-1 px-5 pb-3">
        <div className="flex items-center justify-between mb-2 mt-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Benefits ({totalCount})
          </p>
          {unusedCount > 0 && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200
                             rounded-full px-2 py-0.5 font-semibold">
              {unusedCount} unused
            </span>
          )}
        </div>

        <ul className="space-y-1.5">
          {(expanded ? card.benefits : card.benefits.slice(0, 4)).map((benefit) => (
            <li
              key={benefit.id}
              className="flex items-start justify-between gap-2 py-1.5 border-b
                         border-surface-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <BenefitStatusPill status={benefit.status} />
                  <span className="text-xs text-gray-700 font-medium leading-tight">
                    {benefit.name}
                  </span>
                </div>
                {benefit.notes && (
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                    {benefit.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs font-bold text-gray-800">
                  ${benefit.value.toLocaleString()}
                </span>
                {benefit.expiryDate && (
                  <ExpiryBadge isoDate={benefit.expiryDate} />
                )}
              </div>
            </li>
          ))}
        </ul>

        {card.benefits.length > 4 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-gold-600 hover:underline mt-2 block"
          >
            {expanded ? 'Show less' : `Show ${card.benefits.length - 4} more`}
          </button>
        )}
      </div>

      {/* ── Footer: renewal info ─────────────────────────────── */}
      <div
        className={`px-5 py-2.5 border-t border-surface-border text-[11px] flex items-center
                     justify-between ${renewalUrgent ? 'bg-amber-50' : 'bg-surface-overlay'}`}
      >
        <span className={renewalUrgent ? 'text-amber-700 font-semibold' : 'text-gray-500'}>
          Renewal: {formatDate(card.renewalDate)}
        </span>
        {renewalUrgent && (
          <span className="text-amber-600 font-bold">{renewalDays}d away</span>
        )}
      </div>
    </div>
  );
}

// ─── KPI totals ───────────────────────────────────────────────────────────────

const TOTAL_BENEFITS_VALUE = CARDS.reduce((s, c) => s + c.totalBenefitsValue, 0);
const TOTAL_USED_VALUE     = CARDS.reduce((s, c) => s + c.benefitsUsedValue, 0);
const TOTAL_FEES           = CARDS.reduce((s, c) => s + c.annualFee, 0);
const TOTAL_UNUSED         = CARDS.reduce(
  (s, c) => s + c.benefits.filter((b) => b.status === 'unused').length,
  0,
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardBenefitsPage() {
  return (
    <div className="space-y-8">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Card Benefits Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Benefit utilization, expiry countdowns, and renewal recommendations
          </p>
        </div>
        <button className="btn-accent btn flex-shrink-0">
          <span aria-hidden="true">↓</span>
          Export
        </button>
      </div>

      {/* ── KPI strip ────────────────────────────────────────── */}
      <section aria-labelledby="benefits-kpi-heading">
        <h2 id="benefits-kpi-heading" className="sr-only">Benefits Key Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Benefits Value"
            value={`$${TOTAL_BENEFITS_VALUE.toLocaleString()}`}
            trendLabel="Across all active cards"
            trendDirection="flat"
            icon="BV"
            iconBg="bg-brand-navy/5"
            iconColor="text-brand-navy"
            subtitle={`${CARDS.length} cards tracked`}
          />
          <StatCard
            title="Benefits Used"
            value={`$${TOTAL_USED_VALUE.toLocaleString()}`}
            trendLabel={`${Math.round((TOTAL_USED_VALUE / TOTAL_BENEFITS_VALUE) * 100)}% utilization rate`}
            trendDirection="up"
            icon="BU"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
            subtitle="Year-to-date"
          />
          <StatCard
            title="Unused Benefits"
            value={`${TOTAL_UNUSED}`}
            trendLabel="Benefits not yet claimed"
            trendDirection="down"
            icon="UN"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
            subtitle="Review before expiry"
          />
          <StatCard
            title="Total Annual Fees"
            value={`$${TOTAL_FEES.toLocaleString()}`}
            trendLabel={`Net: +$${(TOTAL_USED_VALUE - TOTAL_FEES).toLocaleString()}`}
            trendDirection="up"
            icon="FE"
            iconBg="bg-red-50"
            iconColor="text-red-600"
            subtitle="Benefits cover fees"
          />
        </div>
      </section>

      {/* ── Renewal legend ───────────────────────────────────── */}
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Renewal recommendation:</span>
        {(['keep', 'negotiate', 'cancel'] as CardRenewalRec[]).map((rec) => {
          const cfg = RENEWAL_CONFIG[rec];
          return (
            <span
              key={rec}
              className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium
                          px-2.5 py-1 ${cfg.bg} ${cfg.text} ${cfg.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
              {cfg.label}
            </span>
          );
        })}
      </div>

      {/* ── Benefits grid ────────────────────────────────────── */}
      <section aria-labelledby="benefits-grid-heading">
        <h2 id="benefits-grid-heading" className="sr-only">Card Benefits Grid</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {CARDS.map((card) => (
            <CardBenefitTile key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* ── Benefits value vs fee bar chart ──────────────────── */}
      <SectionCard
        title="Benefits Value vs Annual Fee"
        subtitle="Bar comparison per card — green = benefits value, red = annual fee"
      >
        <div className="space-y-4">
          {CARDS.map((card) => {
            const maxVal = Math.max(...CARDS.map((c) => c.totalBenefitsValue));
            const benefitPct = (card.totalBenefitsValue / maxVal) * 100;
            const feePct     = (card.annualFee / maxVal) * 100;
            const cfg        = RENEWAL_CONFIG[card.renewal];

            return (
              <div key={card.id} className="flex items-center gap-4">
                {/* Card label */}
                <div className="w-48 flex-shrink-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{card.cardName}</p>
                  <div className="mt-0.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border text-[10px]
                                   font-semibold px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
                      {cfg.label}
                    </span>
                  </div>
                </div>

                {/* Bars */}
                <div className="flex-1 space-y-1">
                  {/* Benefits bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${benefitPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 w-16 text-right">
                      ${card.totalBenefitsValue.toLocaleString()}
                    </span>
                  </div>
                  {/* Fee bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-400 transition-all duration-500"
                        style={{ width: `${feePct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-red-500 w-16 text-right">
                      {card.annualFee === 0 ? 'No fee' : `$${card.annualFee.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-surface-border text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-400 flex-shrink-0" aria-hidden="true" />
            Benefits value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400 flex-shrink-0" aria-hidden="true" />
            Annual fee
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

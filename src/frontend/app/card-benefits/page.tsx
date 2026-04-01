'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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

// ─── Placeholder clients ─────────────────────────────────────────────────────

const PLACEHOLDER_CLIENTS = [
  { id: 'cl-01', name: 'Acme Corp' },
  { id: 'cl-02', name: 'Sterling Partners' },
  { id: 'cl-03', name: 'Redwood Holdings' },
  { id: 'cl-04', name: 'Pinnacle Ventures' },
  { id: 'cl-05', name: 'BlueSky Industries' },
];

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_CARDS: CardBenefitProfile[] = [
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

// ─── How-to-claim text per benefit (keyed by benefit id) ─────────────────────

const HOW_TO_CLAIM: Record<string, string> = {
  'b-01-1': 'Select your preferred airline in the Amex portal, then use the card for incidental fees.',
  'b-01-2': 'Enroll via the CLEAR website using your Amex card for payment.',
  'b-01-3': 'Apply through the Global Entry or TSA PreCheck program and pay with this card.',
  'b-01-4': 'Book through the Hotel Collection on amextravel.com for a minimum 2-night stay.',
  'b-01-5': 'Present your Platinum card at any Centurion Lounge entrance.',
  'b-01-6': 'Apply for Global Entry/NEXUS and pay the application fee with this card.',
  'b-01-7': 'Book through Fine Hotels & Resorts on amextravel.com.',
  'b-02-1': 'Select two monthly statement credit categories in the Amex app.',
  'b-02-2': 'Enroll for Walmart+ through the Amex benefits portal.',
  'b-02-3': 'Automatically applied to all international transactions.',
  'b-03-1': 'Pay your monthly cell phone bill with this card. File claims through cardbenefitservices.com.',
  'b-03-2': 'Automatically covers eligible purchases. File claims within 120 days.',
  'b-03-3': 'Book and pay for travel with this card. File claims through eclaimsline.com.',
  'b-04-1': 'Automatically extends manufacturer warranty by 1 year on eligible purchases.',
  'b-04-2': 'Covers eligible purchases against damage or theft for 120 days.',
  'b-05-1': 'Automatically applied when booking AA flights and checking bags.',
  'b-05-2': 'Present your boarding pass — priority boarding is linked to your AAdvantage account.',
  'b-05-3': 'Spend the required threshold on AA purchases to unlock the discount.',
  'b-06-1': 'Pay your monthly cell phone bill with this card. File claims through the Wells Fargo portal.',
};

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

function BenefitStatusPill({
  status,
  onClick,
}: {
  status: BenefitStatus;
  onClick?: () => void;
}) {
  const cfg = BENEFIT_STATUS_CONFIG[status];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex items-center rounded-full text-[10px] font-semibold
                  px-2 py-0.5 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300
                  transition-all ${cfg.bg} ${cfg.text}`}
      title={`Click to mark as ${status === 'used' ? 'Unused' : 'Used'}`}
    >
      {cfg.label}
    </button>
  );
}

// ─── Toast component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-gray-900 text-white text-sm px-4 py-3
                    rounded-lg shadow-lg animate-in slide-in-from-bottom-2 flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
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

function CardBenefitTile({
  card,
  onToggleBenefitStatus,
  onClick,
}: {
  card: CardBenefitProfile;
  onToggleBenefitStatus: (cardId: string, benefitId: string) => void;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unusedBenefits  = card.benefits.filter((b) => b.status === 'unused');
  const unusedCount     = unusedBenefits.length;
  const totalCount      = card.benefits.length;
  const renewalDays     = daysUntil(card.renewalDate);
  const renewalUrgent   = renewalDays <= 60;

  return (
    <div
      className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden
                 flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
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

      {/* ── Cancel banner for cancel-recommended cards ────────── */}
      {card.renewal === 'cancel' && (
        <div className="bg-red-600 text-white px-5 py-3 text-xs font-semibold flex items-center justify-between gap-2">
          <span>Cancel before {formatDate(card.renewalDate)}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); window.alert(`Calling ${card.issuer}...`); }}
              className="bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold px-3 py-1 rounded"
            >
              Call {card.issuer}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.alert('Cancellation logged.'); }}
              className="bg-white text-red-600 hover:bg-red-50 text-[11px] font-semibold px-3 py-1 rounded"
            >
              Log Cancellation
            </button>
          </div>
        </div>
      )}

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
                  <BenefitStatusPill
                    status={benefit.status}
                    onClick={() => onToggleBenefitStatus(card.id, benefit.id)}
                  />
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
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
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

// ─── Detail drawer ───────────────────────────────────────────────────────────

function CardDetailDrawer({
  card,
  onClose,
  onToggleBenefitStatus,
}: {
  card: CardBenefitProfile;
  onClose: () => void;
  onToggleBenefitStatus: (cardId: string, benefitId: string) => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-white z-50 shadow-2xl
                       overflow-y-auto flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg
                           text-xs font-bold flex-shrink-0 ${card.iconBg} ${card.iconText}`}
              aria-hidden="true"
            >
              {card.iconCode}
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{card.cardName}</p>
              <p className="text-xs text-gray-400">{card.issuer}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none p-1"
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        {/* Cancel / Negotiate CTA */}
        {card.renewal === 'cancel' && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-700 mb-2">
              Cancel before {formatDate(card.renewalDate)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.alert(`Calling ${card.issuer}...`)}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded"
              >
                Call {card.issuer}
              </button>
              <button
                onClick={() => window.alert('Cancellation logged.')}
                className="bg-white border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold px-4 py-2 rounded"
              >
                Log Cancellation
              </button>
            </div>
          </div>
        )}
        {card.renewal === 'negotiate' && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-700 mb-2">
              Negotiate before {formatDate(card.renewalDate)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.alert(`Calling ${card.issuer} to negotiate...`)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded"
              >
                Call {card.issuer}
              </button>
            </div>
          </div>
        )}

        {/* Benefits list */}
        <div className="px-6 py-4 flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">All Benefits ({card.benefits.length})</p>
            <RenewalBadge rec={card.renewal} />
          </div>

          <ul className="space-y-3">
            {card.benefits.map((benefit) => (
              <li key={benefit.id} className="border border-surface-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BenefitStatusPill
                      status={benefit.status}
                      onClick={() => onToggleBenefitStatus(card.id, benefit.id)}
                    />
                    <span className="text-sm font-medium text-gray-800">{benefit.name}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-800">${benefit.value.toLocaleString()}</span>
                </div>
                {benefit.expiryDate && (
                  <div className="mb-1">
                    <ExpiryBadge isoDate={benefit.expiryDate} />
                  </div>
                )}
                {benefit.notes && (
                  <p className="text-xs text-gray-400 mb-1">{benefit.notes}</p>
                )}
                {HOW_TO_CLAIM[benefit.id] && (
                  <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mt-1">
                    <span className="font-semibold">How to claim:</span> {HOW_TO_CLAIM[benefit.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Utilization summary */}
        <div className="px-6 py-4 border-t border-surface-border bg-surface-overlay">
          <UtilizationBar
            usedValue={card.benefitsUsedValue}
            totalValue={card.totalBenefitsValue}
            annualFee={card.annualFee}
          />
        </div>
      </div>
    </>
  );
}

// ─── Client selector ─────────────────────────────────────────────────────────

function ClientSelector({
  selectedClient,
  onSelect,
}: {
  selectedClient: typeof PLACEHOLDER_CLIENTS[number] | null;
  onSelect: (client: typeof PLACEHOLDER_CLIENTS[number] | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => PLACEHOLDER_CLIENTS.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  if (selectedClient) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 bg-brand-navy/10 text-brand-navy text-sm
                          font-medium px-3 py-1.5 rounded-full">
          {selectedClient.name}
          <button
            onClick={() => onSelect(null)}
            className="text-brand-navy/60 hover:text-brand-navy text-lg leading-none"
            aria-label="Clear client"
          >
            &times;
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search clients..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="bg-gray-50 border border-surface-border rounded-lg px-3 py-1.5 text-sm
                   text-gray-700 placeholder-gray-400 w-56 focus:outline-none focus:ring-2
                   focus:ring-brand-navy/20"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute top-full left-0 mt-1 w-56 bg-white border border-surface-border
                        rounded-lg shadow-lg z-30 overflow-hidden">
          {filtered.map((client) => (
            <li key={client.id}>
              <button
                onMouseDown={() => { onSelect(client); setQuery(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-navy/5"
              >
                {client.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── CSV export helper ───────────────────────────────────────────────────────

function exportCardBenefitsCSV(cards: CardBenefitProfile[]) {
  const header = 'Card Name,Benefit Name,Value,Status,Expiry Date';
  const rows = cards.flatMap((card) =>
    card.benefits.map((b) =>
      [
        `"${card.cardName}"`,
        `"${b.name}"`,
        b.value,
        b.status,
        b.expiryDate ?? '',
      ].join(','),
    ),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'card-benefits-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardBenefitsPage() {
  // State: cards data (mutable for toggling benefit status)
  const [cards, setCards] = useState<CardBenefitProfile[]>(INITIAL_CARDS);

  // State: recommendation filter
  const [recommendationFilter, setRecommendationFilter] = useState<'all' | CardRenewalRec>('all');

  // State: selected client
  const [selectedClient, setSelectedClient] = useState<typeof PLACEHOLDER_CLIENTS[number] | null>(null);

  // State: selected card for drawer
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // State: toast
  const [toast, setToast] = useState<string | null>(null);

  // Toggle benefit used/unused
  const handleToggleBenefitStatus = useCallback((cardId: string, benefitId: string) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          benefits: card.benefits.map((b) => {
            if (b.id !== benefitId) return b;
            const newStatus: BenefitStatus = b.status === 'used' ? 'unused' : 'used';
            setToast(`Benefit marked as ${newStatus === 'used' ? 'Used' : 'Unused'}`);
            return { ...b, status: newStatus };
          }),
        };
      }),
    );
  }, []);

  // Filtered cards by recommendation
  const filteredCards = useMemo(
    () => recommendationFilter === 'all'
      ? cards
      : cards.filter((c) => c.renewal === recommendationFilter),
    [cards, recommendationFilter],
  );

  // KPI totals (computed from current card state)
  const totals = useMemo(() => {
    const totalBenefitsValue = cards.reduce((s, c) => s + c.totalBenefitsValue, 0);
    const totalUsedValue     = cards.reduce((s, c) => s + c.benefitsUsedValue, 0);
    const totalFees          = cards.reduce((s, c) => s + c.annualFee, 0);
    const totalUnused        = cards.reduce(
      (s, c) => s + c.benefits.filter((b) => b.status === 'unused').length, 0,
    );
    return { totalBenefitsValue, totalUsedValue, totalFees, totalUnused };
  }, [cards]);

  // Expiring benefits within 90 days (unused only, with expiry date)
  const expiringBenefits = useMemo(() => {
    const result: { card: CardBenefitProfile; benefit: Benefit; daysLeft: number }[] = [];
    for (const card of cards) {
      for (const benefit of card.benefits) {
        if (benefit.status === 'unused' && benefit.expiryDate) {
          const days = daysUntil(benefit.expiryDate);
          if (days >= 0 && days <= 90) {
            result.push({ card, benefit, daysLeft: days });
          }
        }
      }
    }
    return result.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [cards]);

  const expiringTotalValue = useMemo(
    () => expiringBenefits.reduce((s, e) => s + e.benefit.value, 0),
    [expiringBenefits],
  );

  // Selected card for drawer
  const selectedCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  );

  return (
    <div className="space-y-8">
      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* ── Detail drawer ──────────────────────────────────────── */}
      {selectedCard && (
        <CardDetailDrawer
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onToggleBenefitStatus={handleToggleBenefitStatus}
        />
      )}

      {/* ── Client selector ────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client:</span>
        <ClientSelector selectedClient={selectedClient} onSelect={setSelectedClient} />
      </div>

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Card Benefits Tracker</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Benefit utilization, expiry countdowns, and renewal recommendations
          </p>
        </div>
        <button
          className="btn-accent btn flex-shrink-0"
          onClick={() => exportCardBenefitsCSV(cards)}
        >
          <span aria-hidden="true">↓</span>
          Export
        </button>
      </div>

      {/* ── Expiring benefits alert ──────────────────────────── */}
      {expiringBenefits.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg" role="img" aria-label="Warning">&#9888;&#65039;</span>
            <span className="text-sm font-bold text-amber-800">
              Benefits Expiring Soon &mdash; ${expiringTotalValue.toLocaleString()} at risk
            </span>
          </div>
          <ul className="space-y-1">
            {expiringBenefits.map((item) => (
              <li
                key={`${item.card.id}-${item.benefit.id}`}
                className="flex items-center justify-between text-xs text-amber-700"
              >
                <span>
                  <span className="font-semibold">{item.card.cardName}</span>
                  {' '}&mdash;{' '}
                  {item.benefit.name}
                </span>
                <span className="font-semibold">
                  ${item.benefit.value.toLocaleString()} &middot; {item.daysLeft}d left
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── KPI strip ────────────────────────────────────────── */}
      <section aria-labelledby="benefits-kpi-heading">
        <h2 id="benefits-kpi-heading" className="sr-only">Benefits Key Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Benefits Value"
            value={`$${totals.totalBenefitsValue.toLocaleString()}`}
            trendLabel="Across all active cards"
            trendDirection="flat"
            icon="BV"
            iconBg="bg-brand-navy/5"
            iconColor="text-brand-navy"
            subtitle={`${cards.length} cards tracked`}
          />
          <StatCard
            title="Benefits Used"
            value={`$${totals.totalUsedValue.toLocaleString()}`}
            trendLabel={`${Math.round((totals.totalUsedValue / totals.totalBenefitsValue) * 100)}% utilization rate`}
            trendDirection="up"
            icon="BU"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
            subtitle="Year-to-date"
          />
          <StatCard
            title="Unused Benefits"
            value={`${totals.totalUnused}`}
            trendLabel="Benefits not yet claimed"
            trendDirection="down"
            icon="UN"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
            subtitle="Review before expiry"
          />
          <StatCard
            title="Total Annual Fees"
            value={`$${totals.totalFees.toLocaleString()}`}
            trendLabel={`Net: +$${(totals.totalUsedValue - totals.totalFees).toLocaleString()}`}
            trendDirection="up"
            icon="FE"
            iconBg="bg-red-50"
            iconColor="text-red-600"
            subtitle="Benefits cover fees"
          />
        </div>
      </section>

      {/* ── Renewal legend / filter chips ────────────────────── */}
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Renewal recommendation:</span>
        {/* "All" chip */}
        <button
          onClick={() => setRecommendationFilter('all')}
          className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium
                      px-2.5 py-1 transition-all ${
                        recommendationFilter === 'all'
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
        >
          All
        </button>
        {(['keep', 'negotiate', 'cancel'] as CardRenewalRec[]).map((rec) => {
          const cfg = RENEWAL_CONFIG[rec];
          const isActive = recommendationFilter === rec;
          return (
            <button
              key={rec}
              onClick={() => setRecommendationFilter(rec)}
              className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium
                          px-2.5 py-1 transition-all ${
                            isActive
                              ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-2 ring-offset-1 ring-current`
                              : `${cfg.bg} ${cfg.text} ${cfg.border} hover:ring-1 hover:ring-current`
                          }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* ── Benefits grid ────────────────────────────────────── */}
      <section aria-labelledby="benefits-grid-heading">
        <h2 id="benefits-grid-heading" className="sr-only">Card Benefits Grid</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredCards.map((card) => (
            <CardBenefitTile
              key={card.id}
              card={card}
              onToggleBenefitStatus={handleToggleBenefitStatus}
              onClick={() => setSelectedCardId(card.id)}
            />
          ))}
        </div>
        {filteredCards.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-12">
            No cards match the selected filter.
          </p>
        )}
      </section>

      {/* ── Benefits value vs fee bar chart ──────────────────── */}
      <SectionCard
        title="Benefits Value vs Annual Fee"
        subtitle="Bar comparison per card — green = benefits value, red = annual fee"
      >
        <div className="space-y-4">
          {filteredCards.map((card) => {
            const maxVal = Math.max(...cards.map((c) => c.totalBenefitsValue));
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

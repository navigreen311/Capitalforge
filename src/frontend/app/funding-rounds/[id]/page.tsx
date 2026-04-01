'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui/card';

// ── Placeholder data ───────────────────────────────────────────

const PLACEHOLDER = {
  id: 'FR-018',
  businessName: 'Apex Ventures LLC',
  businessId: 'biz_001',
  roundNumber: 2,
  status: 'in_progress' as const,
  targetAmount: 150000,
  obtainedAmount: 105000,
  advisorName: 'Sarah Chen',
  startedAt: '2026-01-15',
  targetCloseAt: '2026-04-15',
  cards: [
    { id: 'app_004', cardProduct: 'Ink Business Preferred', issuer: 'Chase', limit: 45000, status: 'approved', aprExpiry: '2026-05-20', aprDaysLeft: 49 },
    { id: 'app_001', cardProduct: 'Ink Business Cash', issuer: 'Chase', limit: 25000, status: 'draft', aprExpiry: null, aprDaysLeft: null },
    { id: 'app_007', cardProduct: 'Business Advantage Cash', issuer: 'BofA', limit: 35000, status: 'submitted', aprExpiry: null, aprDaysLeft: null },
  ],
  economics: {
    programFee: 4750,
    fundingFee: 1800,
    totalCost: 6550,
    netCapital: 98450,
    effectiveRate: 6.25,
  },
};

// ── Helpers ────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const STATUS_CHIP: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  planning: 'bg-gray-100 text-gray-600 border-gray-200',
};

function aprColor(days: number | null) {
  if (days === null) return 'text-gray-400';
  if (days <= 15) return 'text-red-600 font-semibold';
  if (days <= 60) return 'text-amber-600 font-semibold';
  return 'text-emerald-600';
}

// ── Page ──────────────────────────────────────────────────────

export default function FundingRoundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const round = PLACEHOLDER;
  const pct = round.targetAmount > 0 ? Math.min((round.obtainedAmount / round.targetAmount) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/funding-rounds')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
        ← Back to Funding Rounds
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Round {round.roundNumber} — {round.businessName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {round.id} · Advisor: {round.advisorName} · {round.startedAt} → {round.targetCloseAt}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_CHIP[round.status]}`}>
          {round.status.replace('_', ' ')}
        </span>
      </div>

      {/* Progress */}
      <SectionCard title="Round Progress" subtitle={`${fmt(round.obtainedAmount)} of ${fmt(round.targetAmount)} (${Math.round(pct)}%)`}>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </SectionCard>

      {/* Cards in Round */}
      <SectionCard title="Cards in This Round" flushBody>
        <div className="overflow-x-auto">
          <table className="cf-table">
            <thead>
              <tr className="bg-gray-50/60 border-b border-surface-border">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Card</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Issuer</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Limit</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">APR Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {round.cards.map((card) => (
                <tr key={card.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{card.cardProduct}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{card.issuer}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right tabular-nums">{fmt(card.limit)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CHIP[card.status] ?? STATUS_CHIP.draft}`}>
                      {card.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm text-right tabular-nums ${aprColor(card.aprDaysLeft)}`}>
                    {card.aprDaysLeft != null ? `${card.aprDaysLeft}d left` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Round Economics */}
      <SectionCard title="Round Economics">
        <div className="space-y-2 text-sm">
          {[
            ['Program Fee', fmt(round.economics.programFee), 'paid Jan 15, 2026'],
            ['% of Funding Fee', fmt(round.economics.fundingFee), 'pending — on approval'],
            ['Total Projected Cost', fmt(round.economics.totalCost), null],
            ['Net Usable Capital', fmt(round.economics.netCapital), 'after fees'],
            ['Effective Cost Rate', `${round.economics.effectiveRate}%`, null],
          ].map(([label, value, note]) => (
            <div key={label as string} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 last:pb-0">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-900 font-semibold">
                {value}
                {note && <span className="text-xs text-gray-400 font-normal ml-2">({note})</span>}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push(`/applications/new?client_id=${round.businessId}&round_id=${round.id}`)}
          className="btn-primary btn"
        >
          + Add Application to Round
        </button>
        <button onClick={() => router.push(`/clients/${round.businessId}`)} className="btn-outline btn">
          View Client
        </button>
      </div>
    </div>
  );
}

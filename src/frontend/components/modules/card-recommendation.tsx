'use client';

// ============================================================
// CardRecommendation — Single card recommendation tile.
// - Card name / issuer branding
// - Approval probability bar (0–100 %)
// - Intro APR badge, credit limit estimate, rewards summary
// - Issuer rule warnings (Chase 5/24, Amex velocity, etc.)
// - Score breakdown tooltip on hover
// ============================================================

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardNetwork = 'Visa' | 'Mastercard' | 'Amex' | 'Discover';

export interface IssuerRuleWarning {
  rule: string;       // e.g. "Chase 5/24"
  severity: 'block' | 'caution';
  explanation: string;
}

export interface ScoreBreakdown {
  label: string;
  score: number;   // 0–100
  weight: number;  // 0–1, for display only
}

export interface CardRecommendationProps {
  rank: number;
  cardName: string;
  issuer: string;
  network: CardNetwork;
  approvalProbability: number;  // 0–100
  introApr: string;             // e.g. "0% for 15 months"
  ongoingApr: string;           // e.g. "19.99%–28.99%"
  creditLimitEstimate: string;  // e.g. "$5,000–$25,000"
  rewardsSummary: string;       // e.g. "2x points on all purchases"
  annualFee: string;            // e.g. "$0" or "$95"
  warnings?: IssuerRuleWarning[];
  scoreBreakdown?: ScoreBreakdown[];
  className?: string;
  /** Whether this card is from a credit union issuer */
  isCreditUnion?: boolean;
  /** Bureau pulled by this CU (e.g. "TransUnion", "Equifax") */
  bureauPull?: string;
  /** Membership note for CU cards */
  membershipNote?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NETWORK_COLORS: Record<CardNetwork, string> = {
  Visa:       'bg-blue-50 text-blue-700 border-blue-200',
  Mastercard: 'bg-orange-50 text-orange-700 border-orange-200',
  Amex:       'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
  Discover:   'bg-amber-50 text-amber-700 border-amber-200',
};

function probColor(pct: number): string {
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-brand-gold';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

function probLabel(pct: number): { text: string; cls: string } {
  if (pct >= 75) return { text: 'High',    cls: 'text-emerald-600' };
  if (pct >= 50) return { text: 'Moderate', cls: 'text-amber-600' };
  if (pct >= 30) return { text: 'Low',      cls: 'text-orange-600' };
  return            { text: 'Very Low',     cls: 'text-red-600' };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreTooltip({ breakdown }: { breakdown: ScoreBreakdown[] }) {
  return (
    <div className="absolute z-20 top-full mt-2 right-0 w-64 bg-gray-900 rounded-xl shadow-xl border border-gray-700 p-4">
      <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">
        Score Breakdown
      </p>
      <div className="space-y-2.5">
        {breakdown.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{item.label}</span>
              <span className="text-xs font-bold text-brand-gold">{item.score}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-gold/70"
                style={{ width: `${item.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {/* Arrow */}
      <div className="absolute -top-1.5 right-4 w-3 h-3 bg-gray-900 border-l border-t border-gray-700 rotate-45" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CardRecommendation({
  rank,
  cardName,
  issuer,
  network,
  approvalProbability,
  introApr,
  ongoingApr,
  creditLimitEstimate,
  rewardsSummary,
  annualFee,
  warnings = [],
  scoreBreakdown = [],
  className = '',
  isCreditUnion = false,
  bureauPull,
  membershipNote,
}: CardRecommendationProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const prob = Math.min(Math.max(Math.round(approvalProbability), 0), 100);
  const { text: probText, cls: probCls } = probLabel(prob);
  const blockWarnings   = warnings.filter((w) => w.severity === 'block');
  const cautionWarnings = warnings.filter((w) => w.severity === 'caution');
  const hasWarnings     = warnings.length > 0;

  return (
    <div
      className={`
        bg-white rounded-xl border shadow-card overflow-hidden transition-shadow duration-150
        hover:shadow-card-hover
        ${hasWarnings && blockWarnings.length > 0
          ? 'border-red-200'
          : hasWarnings
          ? 'border-amber-200'
          : 'border-surface-border'}
        ${className}
      `}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        {/* Rank badge + card info */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-navy flex items-center justify-center">
            <span className="text-xs font-bold text-brand-gold">#{rank}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{cardName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{issuer}</p>
          </div>
        </div>

        {/* Network badge + CU badge + score tooltip trigger */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isCreditUnion && (
            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border bg-teal-50 text-teal-700 border-teal-200">
              CU
            </span>
          )}
          <span
            className={`
              inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border
              ${NETWORK_COLORS[network]}
            `}
          >
            {network}
          </span>

          {scoreBreakdown.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTooltipOpen((v) => !v)}
                onBlur={() => setTooltipOpen(false)}
                className="text-xs text-gray-400 hover:text-brand-navy transition-colors px-1.5 py-0.5 rounded border border-gray-200 hover:border-brand-navy/30"
                aria-label="View score breakdown"
              >
                Score
              </button>
              {tooltipOpen && <ScoreTooltip breakdown={scoreBreakdown} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Approval Probability Bar ──────────────────────── */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600">Approval Probability</span>
          <span className={`text-xs font-bold ${probCls}`}>
            {prob}% — {probText}
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${probColor(prob)}`}
            style={{ width: `${prob}%` }}
            role="progressbar"
            aria-valuenow={prob}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* ── Key Details Grid ──────────────────────────────── */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <DetailCell label="Intro APR" value={introApr} highlight />
        <DetailCell label="Annual Fee" value={annualFee} />
        <DetailCell label="Ongoing APR" value={ongoingApr} />
        <DetailCell label="Est. Credit Limit" value={creditLimitEstimate} />
        <div className="col-span-2">
          <DetailCell label="Rewards" value={rewardsSummary} />
        </div>
      </div>

      {/* ── Issuer Rule Warnings ──────────────────────────── */}
      {hasWarnings && (
        <div className="border-t border-surface-border px-5 py-3 space-y-2">
          {blockWarnings.map((w) => (
            <WarningRow key={w.rule} warning={w} />
          ))}
          {cautionWarnings.map((w) => (
            <WarningRow key={w.rule} warning={w} />
          ))}
        </div>
      )}

      {/* ── Credit Union Info ──────────────────────────────── */}
      {isCreditUnion && (bureauPull || membershipNote) && (
        <div className="border-t border-teal-100 bg-teal-50/30 px-5 py-3 space-y-1.5">
          {bureauPull && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Bureau Pull:</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                {bureauPull}
              </span>
            </div>
          )}
          {membershipNote && (
            <p className="text-xs text-teal-700 leading-relaxed">
              {membershipNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Detail cell helper ───────────────────────────────────────────────────────

function DetailCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-gray-400 text-[10px] uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className={`font-semibold ${highlight ? 'text-brand-navy' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

// ─── Warning row helper ───────────────────────────────────────────────────────

function WarningRow({ warning }: { warning: IssuerRuleWarning }) {
  const isBlock = warning.severity === 'block';
  return (
    <div
      className={`
        rounded-lg px-3 py-2 text-xs
        ${isBlock
          ? 'bg-red-50 border border-red-200'
          : 'bg-amber-50 border border-amber-200'}
      `}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className={`font-bold ${isBlock ? 'text-red-700' : 'text-amber-700'}`}
          aria-label={isBlock ? 'Blocked by rule' : 'Caution'}
        >
          {isBlock ? '✕' : '⚠'}
        </span>
        <span className={`font-semibold ${isBlock ? 'text-red-700' : 'text-amber-700'}`}>
          {warning.rule}
        </span>
      </div>
      <p className={`leading-snug ${isBlock ? 'text-red-600' : 'text-amber-600'}`}>
        {warning.explanation}
      </p>
    </div>
  );
}

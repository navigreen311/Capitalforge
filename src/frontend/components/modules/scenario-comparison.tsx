'use client';

// ============================================================
// ScenarioComparison — Side-by-side scenario comparison
// with delta indicators between two funding scenarios.
// Usage:
//   <ScenarioComparison scenarioA={...} scenarioB={...} />
// ============================================================

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScenarioMetrics {
  label: string;
  totalCapital: number;
  avgApr: number;
  rounds: number;
  approvalProbability: number;
  timeToFunding: number; // days
  totalInterestCost: number;
  debtServiceRatio: number; // %
  riskScore: 'Low' | 'Medium' | 'High';
}

interface ScenarioComparisonProps {
  scenarioA?: ScenarioMetrics;
  scenarioB?: ScenarioMetrics;
  className?: string;
}

// ─── Default placeholder scenarios ────────────────────────────────────────────

const DEFAULT_A: ScenarioMetrics = {
  label:               'Conservative Strategy',
  totalCapital:        85_000,
  avgApr:              20.4,
  rounds:              3,
  approvalProbability: 82,
  timeToFunding:       14,
  totalInterestCost:   17_340,
  debtServiceRatio:    18,
  riskScore:           'Low',
};

const DEFAULT_B: ScenarioMetrics = {
  label:               'Aggressive Strategy',
  totalCapital:        210_000,
  avgApr:              16.1,
  rounds:              6,
  approvalProbability: 61,
  timeToFunding:       38,
  totalInterestCost:   33_810,
  debtServiceRatio:    31,
  riskScore:           'High',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, type: 'currency' | 'pct' | 'num' | 'days'): string {
  if (type === 'currency') {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
    return `$${n}`;
  }
  if (type === 'pct')  return `${n.toFixed(1)}%`;
  if (type === 'days') return `${n}d`;
  return `${n}`;
}

type Direction = 'higher-better' | 'lower-better' | 'neutral';

interface MetricDef {
  key: keyof ScenarioMetrics;
  label: string;
  type: 'currency' | 'pct' | 'num' | 'days';
  direction: Direction;
  suffix?: string;
}

const METRICS: MetricDef[] = [
  { key: 'totalCapital',        label: 'Total Capital',          type: 'currency', direction: 'higher-better' },
  { key: 'avgApr',              label: 'Average APR',            type: 'pct',      direction: 'lower-better'  },
  { key: 'rounds',              label: 'Rounds Required',        type: 'num',      direction: 'lower-better'  },
  { key: 'approvalProbability', label: 'Approval Probability',   type: 'pct',      direction: 'higher-better' },
  { key: 'timeToFunding',       label: 'Time to Full Funding',   type: 'days',     direction: 'lower-better'  },
  { key: 'totalInterestCost',   label: 'Total Interest Cost',    type: 'currency', direction: 'lower-better'  },
  { key: 'debtServiceRatio',    label: 'Debt Service Ratio',     type: 'pct',      direction: 'lower-better'  },
];

function riskColor(r: ScenarioMetrics['riskScore']): string {
  if (r === 'Low')    return 'text-emerald-400';
  if (r === 'Medium') return 'text-yellow-400';
  return 'text-red-400';
}

function riskBadge(r: ScenarioMetrics['riskScore']): string {
  if (r === 'Low')    return 'bg-emerald-900/50 text-emerald-300 border border-emerald-700';
  if (r === 'Medium') return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-red-900/50 text-red-300 border border-red-700';
}

function deltaLabel(
  valA: number,
  valB: number,
  direction: Direction,
  type: MetricDef['type'],
): { text: string; color: string; icon: string } {
  const diff = valB - valA;
  if (diff === 0) return { text: 'No change', color: 'text-gray-500', icon: '→' };

  const diffStr = type === 'currency'
    ? fmt(Math.abs(diff), 'currency')
    : type === 'pct'
    ? `${Math.abs(diff).toFixed(1)}%`
    : type === 'days'
    ? `${Math.abs(diff)}d`
    : `${Math.abs(diff)}`;

  const bIsHigher = diff > 0;
  let isBetter: boolean;
  if (direction === 'higher-better') isBetter = bIsHigher;
  else if (direction === 'lower-better') isBetter = !bIsHigher;
  else isBetter = true; // neutral

  return {
    text: `${bIsHigher ? '+' : '-'}${diffStr}`,
    color: direction === 'neutral' ? 'text-gray-400' : isBetter ? 'text-emerald-400' : 'text-red-400',
    icon: bIsHigher ? '↑' : '↓',
  };
}

function winnerSide(a: ScenarioMetrics, b: ScenarioMetrics): 'A' | 'B' | 'tie' {
  // Simple scoring: count metrics where each side wins
  let aScore = 0;
  let bScore = 0;
  for (const m of METRICS) {
    if (m.direction === 'neutral') continue;
    const av = a[m.key] as number;
    const bv = b[m.key] as number;
    if (m.direction === 'higher-better') {
      if (av > bv) aScore++;
      else if (bv > av) bScore++;
    } else {
      if (av < bv) aScore++;
      else if (bv < av) bScore++;
    }
  }
  if (aScore === bScore) return 'tie';
  return aScore > bScore ? 'A' : 'B';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScenarioComparison({
  scenarioA = DEFAULT_A,
  scenarioB = DEFAULT_B,
  className = '',
}: ScenarioComparisonProps) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const winner = winnerSide(scenarioA, scenarioB);

  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 overflow-hidden ${className}`}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] border-b border-gray-800">

        {/* Scenario A header */}
        <div className={`px-5 py-4 space-y-1 ${winner === 'A' ? 'bg-[#C9A84C]/5' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/30 px-2 py-0.5 rounded uppercase tracking-wide">
              Scenario A
            </span>
            {winner === 'A' && (
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700 px-2 py-0.5 rounded">
                Winner
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-100">{scenarioA.label}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${riskBadge(scenarioA.riskScore)}`}>
            {scenarioA.riskScore} Risk
          </span>
        </div>

        {/* Delta column header */}
        <div className="px-4 py-4 flex items-center justify-center border-x border-gray-800 min-w-[80px]">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Delta B→A</span>
        </div>

        {/* Scenario B header */}
        <div className={`px-5 py-4 space-y-1 ${winner === 'B' ? 'bg-[#C9A84C]/5' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-blue-300 bg-blue-900/20 border border-blue-800 px-2 py-0.5 rounded uppercase tracking-wide">
              Scenario B
            </span>
            {winner === 'B' && (
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-700 px-2 py-0.5 rounded">
                Winner
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-100">{scenarioB.label}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${riskBadge(scenarioB.riskScore)}`}>
            {scenarioB.riskScore} Risk
          </span>
        </div>
      </div>

      {/* ── Metric rows ─────────────────────────────────────────── */}
      {METRICS.map((m) => {
        const valA = scenarioA[m.key] as number;
        const valB = scenarioB[m.key] as number;
        const delta = deltaLabel(valA, valB, m.direction, m.type);
        const isHighlighted = highlight === m.key;

        // Which side "wins" for this metric?
        let aWins = false;
        let bWins = false;
        if (m.direction === 'higher-better') { aWins = valA > valB; bWins = valB > valA; }
        if (m.direction === 'lower-better')  { aWins = valA < valB; bWins = valB < valA; }

        return (
          <div
            key={m.key}
            onMouseEnter={() => setHighlight(m.key)}
            onMouseLeave={() => setHighlight(null)}
            className={`grid grid-cols-[1fr_auto_1fr] border-b border-gray-800 transition-colors ${isHighlighted ? 'bg-gray-800/60' : ''}`}
          >
            {/* Value A */}
            <div className={`px-5 py-3 flex items-center justify-between gap-3 ${aWins ? 'bg-emerald-900/10' : ''}`}>
              <div className="min-w-0">
                <p className={`text-xs text-gray-500 font-medium truncate ${isHighlighted ? 'text-gray-300' : ''}`}>{m.label}</p>
                <p className={`text-base font-bold tabular-nums ${aWins ? 'text-emerald-300' : 'text-gray-100'}`}>
                  {fmt(valA, m.type)}
                </p>
              </div>
              {aWins && <span className="text-emerald-400 text-xs flex-shrink-0">●</span>}
            </div>

            {/* Delta */}
            <div className="px-3 py-3 flex flex-col items-center justify-center border-x border-gray-800 min-w-[80px]">
              <span className={`text-xs font-bold tabular-nums ${delta.color}`}>
                {delta.icon} {delta.text}
              </span>
            </div>

            {/* Value B */}
            <div className={`px-5 py-3 flex items-center justify-between gap-3 flex-row-reverse ${bWins ? 'bg-emerald-900/10' : ''}`}>
              <div className="min-w-0 text-right">
                <p className={`text-xs text-gray-500 font-medium truncate ${isHighlighted ? 'text-gray-300' : ''}`}>{m.label}</p>
                <p className={`text-base font-bold tabular-nums ${bWins ? 'text-emerald-300' : 'text-gray-100'}`}>
                  {fmt(valB, m.type)}
                </p>
              </div>
              {bWins && <span className="text-emerald-400 text-xs flex-shrink-0">●</span>}
            </div>
          </div>
        );
      })}

      {/* ── Footer summary ──────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] bg-gray-950">
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Overall Score</p>
          <p className="text-sm font-bold text-gray-200">
            {METRICS.filter((m) => {
              if (m.direction === 'neutral') return false;
              const av = scenarioA[m.key] as number;
              const bv = scenarioB[m.key] as number;
              return m.direction === 'higher-better' ? av > bv : av < bv;
            }).length} / {METRICS.filter((m) => m.direction !== 'neutral').length} metrics won
          </p>
        </div>

        <div className="px-4 py-4 flex items-center justify-center border-x border-gray-800">
          {winner === 'tie' ? (
            <span className="text-[10px] text-gray-500 font-semibold">TIE</span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${winner === 'A' ? 'text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/30' : 'text-blue-300 bg-blue-900/20 border border-blue-800'}`}>
              {winner} wins
            </span>
          )}
        </div>

        <div className="px-5 py-4 text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Overall Score</p>
          <p className="text-sm font-bold text-gray-200">
            {METRICS.filter((m) => {
              if (m.direction === 'neutral') return false;
              const av = scenarioA[m.key] as number;
              const bv = scenarioB[m.key] as number;
              return m.direction === 'higher-better' ? bv > av : bv < av;
            }).length} / {METRICS.filter((m) => m.direction !== 'neutral').length} metrics won
          </p>
        </div>
      </div>

      <div className="px-5 py-2 border-t border-gray-800 bg-gray-950">
        <p className="text-[10px] text-gray-600">
          Placeholder — connect to /api/simulator/compare-scenarios · Hover a row to highlight.
        </p>
      </div>
    </div>
  );
}

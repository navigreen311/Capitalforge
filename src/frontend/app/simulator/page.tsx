'use client';

// ============================================================
// /simulator — Funding Strategy Simulator
// Scenario builder, multi-round projections, approval
// probability, interest shock, and alternative comparison.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import CashFlowStressTest from '../../components/simulator/CashFlowStressTest';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenarioInput {
  fico: string;
  revenue: string;
  debt: string;
  target: string;
  industry: string;
  months: string;
}

interface CardProjection {
  name: string;
  issuer: string;
  limit: number;
  apr: number;
  introApr: number | null;
  introMonths: number;
  approvalPct: number;
  annualFee: number;
}

interface RoundResult {
  round: number;
  waitWeeks: number;
  cards: CardProjection[];
}

interface IssuerWarning {
  issuer: string;
  message: string;
  severity: 'info' | 'warn' | 'critical';
}

interface AprExpiry {
  cardName: string;
  introApr: number;
  regularApr: number;
  expiryMonth: number;
}

interface SimulationResults {
  suitabilityScore: number;
  rounds: RoundResult[];
  totalEstimatedCredit: number;
  issuerWarnings: IssuerWarning[];
  aprExpirySchedule: AprExpiry[];
}

interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  input: ScenarioInput;
  results: SimulationResults;
}

interface ClientProfile {
  name: string;
  fico: string;
  revenue: string;
  debt: string;
  industry: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = ['Retail', 'Tech', 'Healthcare', 'Food & Bev', 'Construction', 'Professional Services'];

const DEFAULT_INPUT: ScenarioInput = {
  fico:     '720',
  revenue:  '850000',
  debt:     '28',
  target:   '150000',
  industry: 'Retail',
  months:   '12',
};

const CLIENT_PROFILES: ClientProfile[] = [
  { name: 'Marcus Rivera — Retail Store', fico: '745', revenue: '920000', debt: '22', industry: 'Retail' },
  { name: 'Lisa Chen — Tech Startup', fico: '710', revenue: '450000', debt: '35', industry: 'Tech' },
  { name: 'David Okafor — Medical Practice', fico: '780', revenue: '1200000', debt: '18', industry: 'Healthcare' },
  { name: 'Sarah Johnson — Restaurant', fico: '695', revenue: '680000', debt: '42', industry: 'Food & Bev' },
  { name: 'James Wright — Contractor', fico: '730', revenue: '550000', debt: '30', industry: 'Construction' },
];

const PRESETS: Record<string, ScenarioInput> = {
  Conservative: { fico: '750', revenue: '500000', debt: '20', target: '75000', industry: 'Retail', months: '18' },
  Moderate:     { fico: '720', revenue: '800000', debt: '30', target: '150000', industry: 'Tech', months: '12' },
  Aggressive:   { fico: '700', revenue: '1000000', debt: '40', target: '300000', industry: 'Construction', months: '24' },
};

const STORAGE_KEY = 'simulator_scenarios';
const MAX_SAVED = 10;

// ─── Simulation Engine (local, no API) ────────────────────────────────────────

const CARD_POOL: Omit<CardProjection, 'approvalPct'>[] = [
  { name: 'Chase Ink Business Unlimited', issuer: 'Chase', limit: 30000, apr: 18.49, introApr: 0, introMonths: 12, annualFee: 0 },
  { name: 'Amex Blue Business Plus', issuer: 'American Express', limit: 25000, apr: 17.99, introApr: 0, introMonths: 12, annualFee: 0 },
  { name: 'Capital One Spark Cash', issuer: 'Capital One', limit: 20000, apr: 20.49, introApr: null, introMonths: 0, annualFee: 95 },
  { name: 'Bank of America Business Advantage', issuer: 'Bank of America', limit: 15000, apr: 16.49, introApr: 0, introMonths: 9, annualFee: 0 },
  { name: 'US Bank Business Triple Cash', issuer: 'US Bank', limit: 18000, apr: 19.49, introApr: 0, introMonths: 15, annualFee: 0 },
  { name: 'Citi Business AA Platinum', issuer: 'Citi', limit: 22000, apr: 19.99, introApr: null, introMonths: 0, annualFee: 99 },
  { name: 'Wells Fargo Business Platinum', issuer: 'Wells Fargo', limit: 25000, apr: 17.49, introApr: 0, introMonths: 9, annualFee: 0 },
  { name: 'Brex Corporate Card', issuer: 'Brex', limit: 50000, apr: 0, introApr: null, introMonths: 0, annualFee: 0 },
  { name: 'Divvy Business Credit', issuer: 'Divvy', limit: 35000, apr: 0, introApr: null, introMonths: 0, annualFee: 0 },
];

function computeSuitabilityScore(fico: number): number {
  if (fico >= 750) return 85;
  if (fico >= 720) return 72;
  if (fico >= 700) return 60;
  return 45;
}

function computeApprovalPct(fico: number, roundIndex: number, cardIndex: number): number {
  const base = Math.min(95, Math.max(15, Math.round((fico - 500) / 3)));
  const roundPenalty = roundIndex * 6;
  const cardPenalty = cardIndex * 3;
  return Math.max(10, base - roundPenalty - cardPenalty);
}

function runLocalSimulation(input: ScenarioInput): SimulationResults {
  const fico = parseInt(input.fico, 10) || 700;
  const target = parseInt(input.target, 10) || 100000;
  const months = parseInt(input.months, 10) || 12;

  const suitabilityScore = computeSuitabilityScore(fico);

  // Determine number of rounds based on target and horizon
  let numRounds: number;
  if (target <= 50000 && months <= 12) numRounds = 2;
  else if (target <= 150000) numRounds = 3;
  else numRounds = Math.min(4, Math.ceil(months / 6));
  if (numRounds < 2) numRounds = 2;

  // Build rounds by picking cards from the pool
  const usedIssuers = new Set<string>();
  const rounds: RoundResult[] = [];
  let totalCredit = 0;
  let poolIdx = 0;

  for (let r = 0; r < numRounds; r++) {
    const cardsPerRound = r === 0 ? 3 : 2;
    const cards: CardProjection[] = [];

    for (let c = 0; c < cardsPerRound && poolIdx < CARD_POOL.length; c++) {
      const base = CARD_POOL[poolIdx % CARD_POOL.length];
      poolIdx++;

      // Scale limit by FICO
      const ficoMultiplier = fico >= 750 ? 1.2 : fico >= 720 ? 1.0 : fico >= 700 ? 0.8 : 0.6;
      const adjustedLimit = Math.round(base.limit * ficoMultiplier / 1000) * 1000;

      cards.push({
        ...base,
        limit: adjustedLimit,
        approvalPct: computeApprovalPct(fico, r, c),
      });
      usedIssuers.add(base.issuer);
      totalCredit += adjustedLimit;
    }

    rounds.push({
      round: r + 1,
      waitWeeks: r === 0 ? 0 : (r === 1 ? 6 : 12),
      cards,
    });
  }

  // Issuer warnings
  const issuerWarnings: IssuerWarning[] = [];
  if (usedIssuers.has('Chase')) {
    issuerWarnings.push({ issuer: 'Chase', message: 'Chase 5/24 rule: denied if 5+ new accounts in 24 months.', severity: 'critical' });
  }
  if (usedIssuers.has('American Express')) {
    issuerWarnings.push({ issuer: 'American Express', message: 'Amex limits you to 5 credit cards. Check existing cards.', severity: 'warn' });
  }
  if (fico < 700) {
    issuerWarnings.push({ issuer: 'General', message: 'Sub-700 FICO may trigger manual review on most issuers.', severity: 'warn' });
  }
  if (parseInt(input.debt, 10) > 35) {
    issuerWarnings.push({ issuer: 'General', message: 'High DTI (>35%) reduces approval odds across all issuers.', severity: 'critical' });
  }

  // APR expiry schedule
  const aprExpirySchedule: AprExpiry[] = [];
  for (const round of rounds) {
    for (const card of round.cards) {
      if (card.introApr !== null && card.introMonths > 0) {
        aprExpirySchedule.push({
          cardName: card.name,
          introApr: card.introApr,
          regularApr: card.apr,
          expiryMonth: card.introMonths,
        });
      }
    }
  }
  aprExpirySchedule.sort((a, b) => a.expiryMonth - b.expiryMonth);

  return { suitabilityScore, rounds, totalEstimatedCredit: totalCredit, issuerWarnings, aprExpirySchedule };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function suitabilityBanner(score: number) {
  if (score >= 75) return { bg: 'bg-emerald-900/40 border-emerald-700', text: 'text-emerald-300', label: 'Strong Candidate', icon: '\u2713' };
  if (score >= 55) return { bg: 'bg-yellow-900/40 border-yellow-700', text: 'text-yellow-300', label: 'Moderate Candidate', icon: '\u26A0' };
  return { bg: 'bg-red-900/40 border-red-700', text: 'text-red-300', label: 'Weak Candidate', icon: '\u2717' };
}

function approvalBadgeCls(pct: number): string {
  if (pct >= 70) return 'bg-emerald-900/50 text-emerald-300 border border-emerald-700';
  if (pct >= 50) return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-red-900/50 text-red-300 border border-red-700';
}

function warnSeverityCls(severity: IssuerWarning['severity']): string {
  if (severity === 'critical') return 'bg-red-900/40 border-red-700 text-red-300';
  if (severity === 'warn') return 'bg-yellow-900/40 border-yellow-700 text-yellow-300';
  return 'bg-blue-900/40 border-blue-700 text-blue-300';
}

function fmt$(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg bg-emerald-800 border border-emerald-600 text-emerald-100 text-sm font-medium shadow-lg animate-pulse">
      {message}
    </div>
  );
}

// ─── Compare Modal helpers ───────────────────────────────────────────────────

/** Metric rows used in comparison table. `numericVal` extracts a comparable number.
 *  `direction`: 'higher-better' or 'lower-better' determines the winner. */
interface CompareMetricDef {
  label: string;
  fn: (s: SavedScenario) => string;
  numericVal: (s: SavedScenario) => number;
  direction: 'higher-better' | 'lower-better' | 'neutral';
}

const COMPARE_METRICS: CompareMetricDef[] = [
  { label: 'FICO',         fn: (s) => s.input.fico,                                                  numericVal: (s) => parseInt(s.input.fico, 10) || 0,       direction: 'neutral' },
  { label: 'Revenue',      fn: (s) => fmt$(parseInt(s.input.revenue, 10) || 0),                      numericVal: (s) => parseInt(s.input.revenue, 10) || 0,     direction: 'neutral' },
  { label: 'DTI',          fn: (s) => s.input.debt + '%',                                            numericVal: (s) => parseFloat(s.input.debt) || 0,          direction: 'lower-better' },
  { label: 'Target',       fn: (s) => fmt$(parseInt(s.input.target, 10) || 0),                       numericVal: (s) => parseInt(s.input.target, 10) || 0,      direction: 'neutral' },
  { label: 'Horizon',      fn: (s) => s.input.months + ' mo',                                        numericVal: (s) => parseInt(s.input.months, 10) || 0,      direction: 'lower-better' },
  { label: 'Suitability',  fn: (s) => s.results.suitabilityScore + '/100',                           numericVal: (s) => s.results.suitabilityScore,             direction: 'higher-better' },
  { label: 'Total Credit', fn: (s) => fmt$(s.results.totalEstimatedCredit),                          numericVal: (s) => s.results.totalEstimatedCredit,         direction: 'higher-better' },
  { label: 'Rounds',       fn: (s) => String(s.results.rounds.length),                               numericVal: (s) => s.results.rounds.length,                direction: 'lower-better' },
  { label: 'Total Cards',  fn: (s) => String(s.results.rounds.reduce((a, r) => a + r.cards.length, 0)), numericVal: (s) => s.results.rounds.reduce((a, r) => a + r.cards.length, 0), direction: 'lower-better' },
  { label: 'Warnings',     fn: (s) => String(s.results.issuerWarnings.length),                       numericVal: (s) => s.results.issuerWarnings.length,        direction: 'lower-better' },
];

/** Find the winning scenario index for a given metric, or -1 if tie/neutral. */
function findWinner(scenarios: SavedScenario[], metric: CompareMetricDef): number {
  if (metric.direction === 'neutral' || scenarios.length < 2) return -1;
  const values = scenarios.map((s) => metric.numericVal(s));
  let bestIdx = 0;
  let tied = false;
  for (let i = 1; i < values.length; i++) {
    const better = metric.direction === 'higher-better' ? values[i] > values[bestIdx] : values[i] < values[bestIdx];
    const same = values[i] === values[bestIdx];
    if (better) { bestIdx = i; tied = false; }
    else if (same && i !== bestIdx) { tied = true; }
  }
  return tied ? -1 : bestIdx;
}

/** Count wins per scenario across all scored metrics. */
function countWins(scenarios: SavedScenario[]): number[] {
  const wins = scenarios.map(() => 0);
  for (const m of COMPARE_METRICS) {
    const w = findWinner(scenarios, m);
    if (w >= 0) wins[w]++;
  }
  return wins;
}

/** Generate a text comparison report for download. */
function generateComparisonReport(scenarios: SavedScenario[], clientName: string): string {
  const wins = countWins(scenarios);
  const maxWins = Math.max(...wins);
  const recommendedIdx = wins.indexOf(maxWins);
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const lines: string[] = [];
  lines.push('='.repeat(64));
  lines.push('  CAPITALFORGE - FUNDING SCENARIO COMPARISON REPORT');
  lines.push('='.repeat(64));
  lines.push('');
  lines.push(`Client:  ${clientName}`);
  lines.push(`Date:    ${date}`);
  lines.push(`Scenarios compared: ${scenarios.length}`);
  lines.push('');

  // Each scenario's inputs + results
  lines.push('-'.repeat(64));
  lines.push('  SCENARIO DETAILS');
  lines.push('-'.repeat(64));
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    lines.push('');
    lines.push(`  Scenario ${i + 1}: ${s.name}`);
    lines.push(`  ${'~'.repeat(40)}`);
    lines.push(`  Inputs:`);
    lines.push(`    FICO Score:       ${s.input.fico}`);
    lines.push(`    Annual Revenue:   ${fmt$(parseInt(s.input.revenue, 10) || 0)}`);
    lines.push(`    DTI Ratio:        ${s.input.debt}%`);
    lines.push(`    Capital Target:   ${fmt$(parseInt(s.input.target, 10) || 0)}`);
    lines.push(`    Industry:         ${s.input.industry}`);
    lines.push(`    Horizon:          ${s.input.months} months`);
    lines.push(`  Results:`);
    lines.push(`    Suitability:      ${s.results.suitabilityScore}/100`);
    lines.push(`    Total Credit:     ${fmt$(s.results.totalEstimatedCredit)}`);
    lines.push(`    Rounds:           ${s.results.rounds.length}`);
    lines.push(`    Total Cards:      ${s.results.rounds.reduce((a, r) => a + r.cards.length, 0)}`);
    lines.push(`    Issuer Warnings:  ${s.results.issuerWarnings.length}`);
  }

  // Side-by-side comparison
  lines.push('');
  lines.push('-'.repeat(64));
  lines.push('  SIDE-BY-SIDE COMPARISON');
  lines.push('-'.repeat(64));
  lines.push('');

  const colWidth = 20;
  const labelWidth = 16;
  const header = 'Metric'.padEnd(labelWidth) + scenarios.map((s, i) => `Scenario ${i + 1}`.padStart(colWidth)).join('') + '  Winner';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const m of COMPARE_METRICS) {
    const winnerIdx = findWinner(scenarios, m);
    const row = m.label.padEnd(labelWidth) +
      scenarios.map((s) => m.fn(s).padStart(colWidth)).join('') +
      (winnerIdx >= 0 ? `  <- Scenario ${winnerIdx + 1}` : '');
    lines.push(row);
  }

  // Recommendation
  lines.push('');
  lines.push('-'.repeat(64));
  lines.push('  RECOMMENDATION');
  lines.push('-'.repeat(64));
  lines.push('');
  lines.push(`  Win counts: ${scenarios.map((s, i) => `${s.name}: ${wins[i]}`).join(' | ')}`);
  lines.push('');
  if (maxWins > 0 && wins.filter((w) => w === maxWins).length === 1) {
    lines.push(`  RECOMMENDED: Scenario ${recommendedIdx + 1} (${scenarios[recommendedIdx].name})`);
    lines.push(`  This scenario wins on ${wins[recommendedIdx]} out of ${COMPARE_METRICS.filter((m) => m.direction !== 'neutral').length} scored metrics.`);
  } else {
    lines.push(`  No clear winner - scenarios are closely matched.`);
    lines.push(`  Consider weighing the metrics most important to the client's goals.`);
  }
  lines.push('');
  lines.push('='.repeat(64));
  lines.push('  Generated by CapitalForge Funding Strategy Simulator');
  lines.push('='.repeat(64));

  return lines.join('\n');
}

/** Trigger a browser download of a text string as a .txt file. */
function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({ scenarios, onClose }: { scenarios: SavedScenario[]; onClose: () => void }) {
  const [exporting, setExporting] = useState(false);
  const wins = countWins(scenarios);
  const maxWins = Math.max(...wins);
  const recommendedIdx = maxWins > 0 && wins.filter((w) => w === maxWins).length === 1 ? wins.indexOf(maxWins) : -1;

  function handleExportComparison() {
    setExporting(true);
    // Small delay for loading state visibility
    setTimeout(() => {
      const clientName = scenarios[0]?.name?.split('/')[0]?.trim() || 'Client';
      const report = generateComparisonReport(scenarios, clientName);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadTextFile(report, `capitalforge-comparison-${dateStr}.txt`);
      setExporting(false);
    }, 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Scenario Comparison</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportComparison}
              disabled={exporting}
              className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {exporting && (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {exporting ? 'Generating...' : 'Export Comparison'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Recommended banner */}
        {recommendedIdx >= 0 && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-4 py-3 flex items-center gap-3">
            <span className="text-emerald-300 text-lg">&#9733;</span>
            <div>
              <p className="text-sm font-bold text-emerald-300">
                Recommended: {scenarios[recommendedIdx].name}
              </p>
              <p className="text-xs text-emerald-400/80 mt-0.5">
                Wins {wins[recommendedIdx]} of {COMPARE_METRICS.filter((m) => m.direction !== 'neutral').length} scored metrics
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-950 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-semibold">Metric</th>
                {scenarios.map((s, i) => (
                  <th key={s.id} className="px-4 py-3 text-center font-semibold">
                    {s.name}
                    {i === recommendedIdx && (
                      <span className="ml-2 text-[10px] text-emerald-300 bg-emerald-900/40 border border-emerald-700 px-1.5 py-0.5 rounded">
                        &#9733; Best
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {COMPARE_METRICS.map((row) => {
                const winnerIdx = findWinner(scenarios, row);
                return (
                  <tr key={row.label} className="bg-gray-900 hover:bg-gray-800">
                    <td className="px-4 py-2 text-gray-400 font-medium">{row.label}</td>
                    {scenarios.map((s, i) => {
                      const isWinner = winnerIdx === i;
                      return (
                        <td
                          key={s.id}
                          className={`px-4 py-2 text-center tabular-nums ${isWinner ? 'text-emerald-300 font-bold' : 'text-gray-200'}`}
                        >
                          <span className="inline-flex items-center gap-1.5 justify-center">
                            {row.fn(s)}
                            {isWinner && (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-900/50 border border-emerald-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                &#10003; Best
                              </span>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Win count footer */}
        <div className="flex gap-4 pt-2 border-t border-gray-800">
          {scenarios.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <span className={`font-bold ${wins[i] === maxWins && maxWins > 0 ? 'text-emerald-300' : 'text-gray-400'}`}>
                {s.name}:
              </span>
              <span className={`tabular-nums ${wins[i] === maxWins && maxWins > 0 ? 'text-emerald-300' : 'text-gray-500'}`}>
                {wins[i]} win{wins[i] !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClientSelector({ onSelect }: { onSelect: (p: ClientProfile) => void }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">Client Quick-Select</h3>
      <div className="flex flex-wrap gap-2">
        {CLIENT_PROFILES.map((p) => (
          <button
            key={p.name}
            onClick={() => onSelect(p)}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-800 hover:border-[#C9A84C] transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function PresetButtons({ onSelect }: { onSelect: (preset: ScenarioInput) => void }) {
  return (
    <div className="flex gap-2">
      {Object.entries(PRESETS).map(([label, preset]) => {
        const colors: Record<string, string> = {
          Conservative: 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30',
          Moderate:     'border-yellow-700 text-yellow-400 hover:bg-yellow-900/30',
          Aggressive:   'border-red-700 text-red-400 hover:bg-red-900/30',
        };
        return (
          <button
            key={label}
            onClick={() => onSelect(preset)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${colors[label] || 'border-gray-700 text-gray-300'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScenarioBuilder({
  input,
  setInput,
  onRun,
  running,
}: {
  input: ScenarioInput;
  setInput: (v: ScenarioInput) => void;
  onRun: () => void;
  running: boolean;
}) {
  function set(key: keyof ScenarioInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setInput({ ...input, [key]: e.target.value });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Scenario Builder</h3>
          <p className="text-xs text-gray-500 mt-0.5">Enter client parameters to model a multi-round funding strategy.</p>
        </div>
        <PresetButtons onSelect={setInput} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">FICO Score</label>
          <input type="number" min={300} max={850} value={input.fico} onChange={set('fico')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Annual Revenue ($)</label>
          <input type="number" value={input.revenue} onChange={set('revenue')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Debt-to-Income Ratio (%)</label>
          <input type="number" min={0} max={100} value={input.debt} onChange={set('debt')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Capital Target ($)</label>
          <input type="number" value={input.target} onChange={set('target')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Industry</label>
          <select value={input.industry} onChange={set('industry')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
            {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Horizon (months)</label>
          <select value={input.months} onChange={set('months')}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
            {['6', '12', '18', '24', '36'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={running}
        className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {running ? 'Simulating...' : 'Run Simulation'}
      </button>
    </div>
  );
}

function ResultsPanel({
  results,
  input,
  onSave,
  onExport,
}: {
  results: SimulationResults;
  input: ScenarioInput;
  onSave: () => void;
  onExport: () => void;
}) {
  const banner = suitabilityBanner(results.suitabilityScore);
  const targetAmt = parseInt(input.target, 10) || 0;
  const pctOfTarget = targetAmt > 0 ? Math.round((results.totalEstimatedCredit / targetAmt) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Suitability banner */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${banner.bg}`}>
        <span className={`text-3xl ${banner.text}`}>{banner.icon}</span>
        <div>
          <p className={`text-sm font-bold ${banner.text}`}>{banner.label} &mdash; Score: {results.suitabilityScore}/100</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Based on FICO {input.fico}. Estimated {fmt$(results.totalEstimatedCredit)} across {results.rounds.length} rounds ({pctOfTarget}% of target).
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Estimated Credit', value: fmt$(results.totalEstimatedCredit), sub: `${results.rounds.length}-round strategy`, up: true },
          { label: 'Suitability Score',      value: `${results.suitabilityScore}/100`,  sub: 'FICO-based',                             up: results.suitabilityScore >= 60 },
          { label: 'Target Coverage',        value: `${pctOfTarget}%`,                  sub: `of ${fmt$(targetAmt)} target`,            up: pctOfTarget >= 80 },
          { label: 'APR Expiries',           value: String(results.aprExpirySchedule.length), sub: 'intro rates ending',               up: false },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{card.label}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
            <p className={`text-xs font-medium ${card.up ? 'text-emerald-400' : 'text-amber-400'}`}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Round-by-round cards */}
      {results.rounds.map((round) => (
        <div key={round.round} className="space-y-2">
          {round.waitWeeks > 0 && (
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 border-t border-dashed border-gray-700" />
              <span className="text-xs text-gray-500 font-medium">Wait {round.waitWeeks} weeks</span>
              <div className="flex-1 border-t border-dashed border-gray-700" />
            </div>
          )}

          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
              <span className="text-sm font-bold text-[#C9A84C]">Round {round.round}</span>
              <span className="text-xs text-gray-500">{round.cards.length} card{round.cards.length > 1 ? 's' : ''}</span>
            </div>

            <div className="divide-y divide-gray-800">
              {round.cards.map((card) => (
                <div key={card.name} className="px-4 py-3 flex items-center justify-between flex-wrap gap-3 hover:bg-gray-800/50 transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-200">{card.name}</p>
                    <p className="text-xs text-gray-500">{card.issuer} &middot; {card.annualFee > 0 ? `$${card.annualFee}/yr` : 'No annual fee'}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <p className="text-gray-100 font-semibold tabular-nums">{fmt$(card.limit)}</p>
                      <p className="text-[10px] text-gray-500">limit</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-300 tabular-nums">
                        {card.introApr !== null ? `${card.introApr}% / ${card.apr}%` : `${card.apr}%`}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {card.introApr !== null ? `intro ${card.introMonths}mo` : 'APR'}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${approvalBadgeCls(card.approvalPct)}`}>
                      {card.approvalPct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Total credit summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-200">Total Estimated Credit</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Sum of all card limits across {results.rounds.length} rounds &middot; {results.rounds.reduce((a, r) => a + r.cards.length, 0)} cards
          </p>
        </div>
        <p className="text-2xl font-bold text-[#C9A84C] tabular-nums">{fmt$(results.totalEstimatedCredit)}</p>
      </div>

      {/* Issuer warnings */}
      {results.issuerWarnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Issuer Warnings</h3>
          {results.issuerWarnings.map((w, i) => (
            <div key={i} className={`rounded-lg border p-3 flex items-start gap-3 ${warnSeverityCls(w.severity)}`}>
              <span className="text-sm mt-0.5">{w.severity === 'critical' ? '\u26D4' : w.severity === 'warn' ? '\u26A0' : '\u2139'}</span>
              <div>
                <p className="text-xs font-bold">{w.issuer}</p>
                <p className="text-xs mt-0.5 opacity-90">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APR expiry schedule */}
      {results.aprExpirySchedule.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">APR Expiry Schedule</h3>
            <p className="text-xs text-gray-500 mt-0.5">When introductory rates expire and regular APR kicks in.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-950 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-semibold">Card</th>
                <th className="px-4 py-3 text-right font-semibold">Intro APR</th>
                <th className="px-4 py-3 text-right font-semibold">Regular APR</th>
                <th className="px-4 py-3 text-right font-semibold">Expires (Month)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {results.aprExpirySchedule.map((entry, i) => (
                <tr key={i} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3 text-gray-200">{entry.cardName}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 tabular-nums font-medium">{entry.introApr}%</td>
                  <td className="px-4 py-3 text-right text-red-400 tabular-nums font-medium">{entry.regularApr}%</td>
                  <td className="px-4 py-3 text-right text-gray-300 tabular-nums">Month {entry.expiryMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onSave}
          className="px-5 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Save Scenario
        </button>
        <button
          onClick={onExport}
          className="px-5 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Export Results
        </button>
      </div>
    </div>
  );
}

function SavedScenariosList({
  scenarios,
  onLoad,
  onDelete,
}: {
  scenarios: SavedScenario[];
  onLoad: (s: SavedScenario) => void;
  onDelete: (id: string) => void;
}) {
  if (scenarios.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-200">Saved Scenarios ({scenarios.length})</h3>
      </div>
      <div className="divide-y divide-gray-800">
        {scenarios.map((s) => (
          <div key={s.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-gray-200">{s.name}</p>
              <p className="text-xs text-gray-500">
                FICO {s.input.fico} &middot; {fmt$(s.results.totalEstimatedCredit)} credit &middot; Score {s.results.suitabilityScore}/100
                &middot; {new Date(s.savedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onLoad(s)}
                className="px-3 py-1 rounded-lg border border-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-800 transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => onDelete(s.id)}
                className="px-3 py-1 rounded-lg border border-red-800 text-red-400 text-xs font-medium hover:bg-red-900/30 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [input, setInput] = useState<ScenarioInput>(DEFAULT_INPUT);
  const [running, setRunning] = useState(false);
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Load saved scenarios from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedScenarios(JSON.parse(raw));
    } catch { /* ignore corrupt data */ }
  }, []);

  function persistScenarios(scenarios: SavedScenario[]) {
    setSavedScenarios(scenarios);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  }

  function handleRun() {
    setRunning(true);
    setSimulationResults(null);
    setTimeout(() => {
      const results = runLocalSimulation(input);
      setSimulationResults(results);
      setRunning(false);
    }, 1200);
  }

  function handleSave() {
    if (!simulationResults) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = `FICO ${input.fico} / ${fmt$(parseInt(input.target, 10))} / ${input.months}mo`;
    const scenario: SavedScenario = { id, name, savedAt: new Date().toISOString(), input: { ...input }, results: simulationResults };
    const updated = [scenario, ...savedScenarios].slice(0, MAX_SAVED);
    persistScenarios(updated);
    setToast('Scenario saved successfully');
  }

  function handleExport() {
    if (!simulationResults) return;
    const lines: string[] = [];
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    lines.push('='.repeat(56));
    lines.push('  CAPITALFORGE - SIMULATION RESULTS');
    lines.push('='.repeat(56));
    lines.push('');
    lines.push(`Date:             ${date}`);
    lines.push(`FICO Score:       ${input.fico}`);
    lines.push(`Annual Revenue:   ${fmt$(parseInt(input.revenue, 10) || 0)}`);
    lines.push(`DTI Ratio:        ${input.debt}%`);
    lines.push(`Capital Target:   ${fmt$(parseInt(input.target, 10) || 0)}`);
    lines.push(`Industry:         ${input.industry}`);
    lines.push(`Horizon:          ${input.months} months`);
    lines.push('');
    lines.push(`Suitability:      ${simulationResults.suitabilityScore}/100`);
    lines.push(`Total Credit:     ${fmt$(simulationResults.totalEstimatedCredit)}`);
    lines.push(`Rounds:           ${simulationResults.rounds.length}`);
    lines.push('');
    for (const round of simulationResults.rounds) {
      lines.push(`--- Round ${round.round}${round.waitWeeks > 0 ? ` (wait ${round.waitWeeks} weeks)` : ''} ---`);
      for (const card of round.cards) {
        lines.push(`  ${card.name} (${card.issuer})`);
        lines.push(`    Limit: ${fmt$(card.limit)} | APR: ${card.introApr !== null ? `${card.introApr}%/${card.apr}%` : `${card.apr}%`} | Approval: ${card.approvalPct}%`);
      }
    }
    if (simulationResults.issuerWarnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const w of simulationResults.issuerWarnings) {
        lines.push(`  [${w.severity.toUpperCase()}] ${w.issuer}: ${w.message}`);
      }
    }
    lines.push('');
    lines.push('Generated by CapitalForge Funding Strategy Simulator');
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(lines.join('\n'), `capitalforge-results-${dateStr}.txt`);
    setToast('Results exported as .txt');
  }

  function handleLoad(s: SavedScenario) {
    setInput({ ...s.input });
    setSimulationResults(s.results);
    setToast(`Loaded: ${s.name}`);
  }

  function handleDelete(id: string) {
    const updated = savedScenarios.filter((s) => s.id !== id);
    persistScenarios(updated);
    setToast('Scenario deleted');
  }

  function handleClientSelect(p: ClientProfile) {
    setInput((prev) => ({
      ...prev,
      fico: p.fico,
      revenue: p.revenue,
      debt: p.debt,
      industry: p.industry,
    }));
  }

  function handleCompare() {
    if (savedScenarios.length < 2) {
      setToast('Save at least 2 scenarios to compare');
      return;
    }
    setShowCompare(true);
  }

  function handleHeaderSave() {
    if (simulationResults) {
      handleSave();
    } else {
      setToast('Run a simulation first to save');
    }
  }

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* Toast */}
      {toast && <Toast message={toast} onClose={dismissToast} />}

      {/* Compare Modal */}
      {showCompare && <CompareModal scenarios={savedScenarios} onClose={() => setShowCompare(false)} />}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Funding Strategy Simulator</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Model multi-round funding scenarios, approval probabilities, and capital outcomes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleHeaderSave}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Save Scenario
          </button>
          <button
            onClick={handleCompare}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            Compare Scenarios
          </button>
        </div>
      </div>

      {/* ── Client Selector ─────────────────────────────────────── */}
      <ClientSelector onSelect={handleClientSelect} />

      {/* ── Scenario Builder ────────────────────────────────────── */}
      <ScenarioBuilder input={input} setInput={setInput} onRun={handleRun} running={running} />

      {/* ── Results ─────────────────────────────────────────────── */}
      {simulationResults && !running && (
        <section aria-label="Simulation Results">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Simulation Results</h2>
          <ResultsPanel results={simulationResults} input={input} onSave={handleSave} onExport={handleExport} />
        </section>
      )}

      {/* ── Cash Flow Stress Test ──────────────────────────────── */}
      {simulationResults && !running && (() => {
        // Estimate monthly debt payment: total credit spread over horizon with avg APR
        const totalCredit = simulationResults.totalEstimatedCredit;
        const horizonMonths = parseInt(input.months, 10) || 12;
        const allCards = simulationResults.rounds.flatMap((r) => r.cards);
        const avgApr = allCards.length > 0
          ? allCards.reduce((sum, c) => sum + c.apr, 0) / allCards.length
          : 18;
        const monthlyRate = avgApr / 100 / 12;
        // Amortized monthly payment
        const monthlyDebtPayment = monthlyRate > 0
          ? Math.round(totalCredit * (monthlyRate * Math.pow(1 + monthlyRate, horizonMonths)) / (Math.pow(1 + monthlyRate, horizonMonths) - 1))
          : Math.round(totalCredit / horizonMonths);

        return (
          <section aria-label="Cash Flow Stress Test">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Cash Flow Stress Test</h2>
            <CashFlowStressTest
              monthlyRevenue={45000}
              monthlyDebtPayment={monthlyDebtPayment}
              months={horizonMonths}
            />
          </section>
        );
      })()}

      {!simulationResults && !running && (
        <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-gray-600">
          <p className="text-sm">Configure your scenario above and click <span className="text-[#C9A84C]">Run Simulation</span> to see projections.</p>
        </div>
      )}

      {running && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
          <div className="inline-flex items-center gap-3 text-gray-400 text-sm">
            <svg className="animate-spin w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running simulation...
          </div>
        </div>
      )}

      {/* ── Saved Scenarios ─────────────────────────────────────── */}
      <SavedScenariosList scenarios={savedScenarios} onLoad={handleLoad} onDelete={handleDelete} />

    </div>
  );
}

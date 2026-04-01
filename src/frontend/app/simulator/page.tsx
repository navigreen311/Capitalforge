'use client';

// ============================================================
// /simulator — Funding Strategy Simulator
// Scenario builder, multi-round projections, approval
// probability, interest shock, and alternative comparison.
// ============================================================

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenarioInput {
  fico: string;
  revenue: string;
  debt: string;
  target: string;
  industry: string;
  months: string;
}

interface RoundProjection {
  round: number;
  product: string;
  limit: string;
  apr: string;
  approvalPct: number;
  netCapital: string;
}

interface Alternative {
  name: string;
  totalCapital: string;
  avgApr: string;
  rounds: number;
  risk: 'Low' | 'Medium' | 'High';
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const DEFAULT_INPUT: ScenarioInput = {
  fico:     '720',
  revenue:  '850000',
  debt:     '28',
  target:   '150000',
  industry: 'Retail',
  months:   '12',
};

const INDUSTRIES = ['Retail', 'Tech', 'Healthcare', 'Food & Bev', 'Construction', 'Professional Services'];

function generateProjections(input: ScenarioInput): RoundProjection[] {
  const fico = parseInt(input.fico, 10) || 700;
  const baseApproval = Math.min(95, Math.max(20, Math.round((fico - 500) / 3.5)));
  return [
    { round: 1, product: 'Business Credit Card',        limit: '$25,000',  apr: '18.9%', approvalPct: baseApproval,      netCapital: '$25,000'  },
    { round: 2, product: 'Business Credit Card #2',     limit: '$20,000',  apr: '19.9%', approvalPct: baseApproval - 4,  netCapital: '$45,000'  },
    { round: 3, product: 'SBA Micro Loan',              limit: '$50,000',  apr: '9.5%',  approvalPct: baseApproval - 8,  netCapital: '$95,000'  },
    { round: 4, product: 'Equipment Financing',         limit: '$35,000',  apr: '11.2%', approvalPct: baseApproval - 12, netCapital: '$130,000' },
    { round: 5, product: 'Business Line of Credit',     limit: '$40,000',  apr: '14.5%', approvalPct: baseApproval - 18, netCapital: '$170,000' },
  ];
}

function generateAlternatives(): Alternative[] {
  return [
    { name: 'Conservative (Cards Only)',        totalCapital: '$85,000',  avgApr: '20.4%', rounds: 3, risk: 'Low'    },
    { name: 'Balanced (Cards + SBA)',            totalCapital: '$145,000', avgApr: '15.8%', rounds: 4, risk: 'Medium' },
    { name: 'Aggressive (Full Stack)',           totalCapital: '$210,000', avgApr: '16.1%', rounds: 6, risk: 'High'   },
    { name: 'Debt Consolidation First',          totalCapital: '$95,000',  avgApr: '12.3%', rounds: 3, risk: 'Low'    },
    { name: 'Revenue-Based Financing Bridge',   totalCapital: '$60,000',  avgApr: '28.0%', rounds: 2, risk: 'Medium' },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function approvalColor(pct: number): string {
  if (pct >= 70) return 'text-emerald-400';
  if (pct >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function approvalBar(pct: number): string {
  if (pct >= 70) return '#22c55e';
  if (pct >= 50) return '#C9A84C';
  return '#ef4444';
}

function riskBadge(risk: Alternative['risk']): string {
  if (risk === 'Low')    return 'bg-emerald-900/50 text-emerald-300 border border-emerald-700';
  if (risk === 'Medium') return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-red-900/50 text-red-300 border border-red-700';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Scenario Builder</h3>
        <p className="text-xs text-gray-500 mt-0.5">Enter client parameters to model a multi-round funding strategy.</p>
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
        {running ? 'Simulating…' : 'Run Simulation'}
      </button>
    </div>
  );
}

function ResultsPanel({ projections, alternatives }: { projections: RoundProjection[]; alternatives: Alternative[] }) {
  const totalCapital = '$170,000';
  const interestShock = projections.some((p) => parseFloat(p.apr) > 20) ? 'High' : 'Moderate';

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Capital Available',  value: totalCapital,  sub: '5-round strategy',      up: true  },
          { label: 'Avg Approval Probability', value: `${projections.length ? Math.round(projections.reduce((s, r) => s + r.approvalPct, 0) / projections.length) : 0}%`, sub: 'Across all rounds', up: true },
          { label: 'Interest Rate Shock',      value: interestShock, sub: 'APR delta vs. baseline', up: false },
          { label: 'Rounds to Target',         value: '4',           sub: '$150k threshold',        up: true  },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{card.label}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
            <p className={`text-xs font-medium ${card.up ? 'text-emerald-400' : 'text-amber-400'}`}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Round projections */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="bg-gray-900 px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Multi-Round Projections</h3>
          <p className="text-xs text-gray-500 mt-0.5">Recommended sequence by approval probability and capital efficiency.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Round</th>
              <th className="px-4 py-3 text-left font-semibold">Product</th>
              <th className="px-4 py-3 text-right font-semibold">Limit</th>
              <th className="px-4 py-3 text-right font-semibold">APR</th>
              <th className="px-4 py-3 text-right font-semibold">Approval %</th>
              <th className="px-4 py-3 text-right font-semibold">Net Capital</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {projections.map((row) => (
              <tr key={row.round} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                <td className="px-4 py-3 font-semibold text-[#C9A84C] tabular-nums">R{row.round}</td>
                <td className="px-4 py-3 text-gray-200">{row.product}</td>
                <td className="px-4 py-3 text-right text-gray-300 tabular-nums font-medium">{row.limit}</td>
                <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{row.apr}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${row.approvalPct}%`, backgroundColor: approvalBar(row.approvalPct) }} />
                    </div>
                    <span className={`font-semibold ${approvalColor(row.approvalPct)}`}>{row.approvalPct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-100 font-semibold tabular-nums">{row.netCapital}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alternative comparison */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="bg-gray-900 px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Alternative Strategies</h3>
          <p className="text-xs text-gray-500 mt-0.5">Compare against other funding pathways.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-950 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Strategy</th>
              <th className="px-4 py-3 text-right font-semibold">Total Capital</th>
              <th className="px-4 py-3 text-right font-semibold">Avg APR</th>
              <th className="px-4 py-3 text-right font-semibold">Rounds</th>
              <th className="px-4 py-3 text-right font-semibold">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {alternatives.map((alt) => (
              <tr key={alt.name} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                <td className="px-4 py-3 text-gray-200">{alt.name}</td>
                <td className="px-4 py-3 text-right text-gray-100 font-semibold tabular-nums">{alt.totalCapital}</td>
                <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{alt.avgApr}</td>
                <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{alt.rounds}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${riskBadge(alt.risk)}`}>{alt.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/simulator/run-scenario</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [input, setInput] = useState<ScenarioInput>(DEFAULT_INPUT);
  const [running, setRunning] = useState(false);
  const [projections, setProjections] = useState<RoundProjection[]>([]);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [ran, setRan] = useState(false);

  function handleRun() {
    setRunning(true);
    setRan(false);
    setTimeout(() => {
      setProjections(generateProjections(input));
      setAlternatives(generateAlternatives());
      setRunning(false);
      setRan(true);
    }, 1400);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Funding Strategy Simulator</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Model multi-round funding scenarios, approval probabilities, and capital outcomes.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Save Scenario
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            Compare Scenarios
          </button>
        </div>
      </div>

      {/* ── Scenario Builder ────────────────────────────────────── */}
      <ScenarioBuilder input={input} setInput={setInput} onRun={handleRun} running={running} />

      {/* ── Results ─────────────────────────────────────────────── */}
      {ran && (
        <section aria-label="Simulation Results">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Simulation Results</h2>
          <ResultsPanel projections={projections} alternatives={alternatives} />
        </section>
      )}

      {!ran && !running && (
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
            Running simulation…
          </div>
        </div>
      )}

    </div>
  );
}

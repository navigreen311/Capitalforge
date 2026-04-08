'use client';

// ============================================================
// /financial-control/simulator — Funding Scenario Simulator
//
// Sections:
//   1. Client / business selector
//   2. Funding scenario inputs (rounds, target amount, timing)
//   3. Projected output display (total capital, cost, APR, credit impact)
//   4. Compare up to 3 scenarios side by side
//   5. Save / export scenario summary
// ============================================================

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientOption {
  id: string;
  name: string;
  fico: number;
  revenue: number;
  industry: string;
}

interface ScenarioInput {
  id: string;
  name: string;
  clientId: string;
  rounds: number;
  targetPerRound: number;
  timingMonths: number;
  avgApr: number;
  introAprMonths: number;
}

interface ScenarioResult {
  totalCapital: number;
  costOfCapital: number;
  effectiveApr: number;
  aprExpiryMonth: number;
  creditImpactEstimate: 'minimal' | 'moderate' | 'significant';
  monthlyPayment: number;
  totalInterest: number;
  projectedPayoffMonths: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS: ClientOption[] = [
  { id: 'c1', name: 'Marcus Rivera — Retail Store', fico: 745, revenue: 920_000, industry: 'Retail' },
  { id: 'c2', name: 'Lisa Chen — Tech Startup', fico: 710, revenue: 450_000, industry: 'Tech' },
  { id: 'c3', name: 'David Okafor — Medical Practice', fico: 780, revenue: 1_200_000, industry: 'Healthcare' },
  { id: 'c4', name: 'Sarah Johnson — Restaurant', fico: 695, revenue: 680_000, industry: 'Food & Bev' },
  { id: 'c5', name: 'James Wright — Contractor', fico: 730, revenue: 550_000, industry: 'Construction' },
];

const DEFAULT_SCENARIO: Omit<ScenarioInput, 'id' | 'name'> = {
  clientId: 'c1',
  rounds: 3,
  targetPerRound: 50_000,
  timingMonths: 6,
  avgApr: 22.5,
  introAprMonths: 12,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function simulateScenario(input: ScenarioInput): ScenarioResult {
  const totalCapital = input.rounds * input.targetPerRound;
  const effectiveApr = input.avgApr * 0.85; // simplified: blend with intro rates
  const totalInterest = totalCapital > 0
    ? totalCapital * (effectiveApr / 100) * (input.timingMonths * input.rounds / 12)
    : 0;
  const costOfCapital = totalCapital > 0 ? (totalInterest / totalCapital) * 100 : 0;
  const denom = input.timingMonths * input.rounds;
  const monthlyPayment = denom > 0 ? (totalCapital + totalInterest) / denom : 0;
  const projectedPayoffMonths = monthlyPayment > 0
    ? Math.ceil((totalCapital + totalInterest) / monthlyPayment)
    : 0;

  let creditImpactEstimate: ScenarioResult['creditImpactEstimate'] = 'minimal';
  if (totalCapital > 200_000 || input.rounds > 4) creditImpactEstimate = 'significant';
  else if (totalCapital > 100_000 || input.rounds > 2) creditImpactEstimate = 'moderate';

  return {
    totalCapital,
    costOfCapital: Math.round(costOfCapital * 100) / 100,
    effectiveApr: Math.round(effectiveApr * 100) / 100,
    aprExpiryMonth: input.introAprMonths,
    creditImpactEstimate,
    monthlyPayment: Math.round(monthlyPayment),
    totalInterest: Math.round(totalInterest),
    projectedPayoffMonths,
  };
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const SCENARIO_AUTO_NAMES = ['Conservative', 'Moderate', 'Aggressive'] as const;

const BLANK_SCENARIO: Omit<ScenarioInput, 'id' | 'name'> = {
  clientId: 'c1',
  rounds: 1,
  targetPerRound: 0,
  timingMonths: 6,
  avgApr: 0,
  introAprMonths: 0,
};

const CREDIT_IMPACT_CONFIG: Record<ScenarioResult['creditImpactEstimate'], { label: string; color: string }> = {
  minimal:     { label: 'Minimal',     color: 'text-green-400' },
  moderate:    { label: 'Moderate',    color: 'text-yellow-400' },
  significant: { label: 'Significant', color: 'text-red-400' },
};

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.className =
    'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-2xl';
  el.style.animation = 'fadeInUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScenarioCard({
  scenario,
  result,
  index,
  onRemove,
  onChange,
  onSaveToProfile,
  onCreateFundingRound,
}: {
  scenario: ScenarioInput;
  result: ScenarioResult;
  index: number;
  onRemove: () => void;
  onChange: (updated: ScenarioInput) => void;
  onSaveToProfile: () => void;
  onCreateFundingRound: () => void;
}) {
  const client = CLIENTS.find((c) => c.id === scenario.clientId);
  const impact = CREDIT_IMPACT_CONFIG[result.creditImpactEstimate];
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const finishEditing = () => {
    setEditingName(false);
    if (!scenario.name.trim()) {
      onChange({ ...scenario, name: SCENARIO_AUTO_NAMES[index] ?? `Scenario ${index + 1}` });
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0A1628] p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#C9A84C] text-[#0A1628] text-xs font-bold">
            {index + 1}
          </span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={scenario.name}
              onChange={(e) => onChange({ ...scenario, name: e.target.value })}
              onBlur={finishEditing}
              onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); }}
              className="bg-transparent text-sm font-semibold text-white border-b border-[#C9A84C] focus:outline-none px-1 py-0.5"
            />
          ) : (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#C9A84C] transition-colors px-1 py-0.5 group"
              title="Click to edit name"
            >
              {scenario.name}
              <span className="text-gray-600 group-hover:text-[#C9A84C] text-xs transition-colors">&#9998;</span>
            </button>
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          title="Remove scenario"
        >
          Remove
        </button>
      </div>

      {/* Inputs */}
      <div className="space-y-3 mb-5">
        <div>
          <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Client</label>
          <select
            value={scenario.clientId}
            onChange={(e) => onChange({ ...scenario, clientId: e.target.value })}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
          >
            {CLIENTS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {client && (
            <p className="text-[10px] text-gray-500 mt-1">
              FICO {client.fico} | {client.industry} | Rev. {formatCurrency(client.revenue)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Rounds</label>
            <input
              type="number"
              min={1}
              max={10}
              value={scenario.rounds}
              onChange={(e) => onChange({ ...scenario, rounds: Number(e.target.value) || 1 })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Target / Round</label>
            <input
              type="number"
              min={5000}
              step={5000}
              value={scenario.targetPerRound}
              onChange={(e) => onChange({ ...scenario, targetPerRound: Number(e.target.value) || 5000 })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Timing (mo)</label>
            <input
              type="number"
              min={1}
              max={36}
              value={scenario.timingMonths}
              onChange={(e) => onChange({ ...scenario, timingMonths: Number(e.target.value) || 1 })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Avg APR %</label>
            <input
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={scenario.avgApr}
              onChange={(e) => onChange({ ...scenario, avgApr: Number(e.target.value) || 0 })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">Intro (mo)</label>
            <input
              type="number"
              min={0}
              max={24}
              value={scenario.introAprMonths}
              onChange={(e) => onChange({ ...scenario, introAprMonths: Number(e.target.value) || 0 })}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800 my-3" />

      {/* Results */}
      <div className="space-y-2.5 flex-1">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Projected Results</h4>

        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Total Capital</span>
          <span className="text-sm font-bold text-white">{formatCurrency(result.totalCapital)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Cost of Capital</span>
          <span className="text-sm font-bold text-[#C9A84C]">{result.costOfCapital}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Effective APR</span>
          <span className={`text-sm font-bold ${result.effectiveApr >= 20 ? 'text-red-400' : result.effectiveApr >= 15 ? 'text-yellow-400' : 'text-green-400'}`}>
            {result.effectiveApr}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">APR Expiry</span>
          <span className="text-sm font-semibold text-gray-300">Month {result.aprExpiryMonth}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Monthly Payment</span>
          <span className="text-sm font-semibold text-gray-200">{formatCurrency(result.monthlyPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Total Interest</span>
          <span className="text-sm font-semibold text-orange-400">{formatCurrency(result.totalInterest)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">Payoff Timeline</span>
          <span className="text-sm font-semibold text-gray-300">{result.projectedPayoffMonths} months</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Credit Impact</span>
          <span className={`text-sm font-bold ${impact.color}`}>{impact.label}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800 my-3" />

      {/* Action buttons */}
      <div className="space-y-2 mt-auto">
        <button
          onClick={onSaveToProfile}
          className="w-full px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-300 hover:border-[#C9A84C]/60 hover:text-white transition-colors"
        >
          Save to Client Profile &rarr;
        </button>
        <button
          onClick={onCreateFundingRound}
          className="w-full px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-bold transition-colors"
        >
          Create Funding Round &rarr;
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialControlSimulatorPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { id: generateId(), name: 'Conservative', ...BLANK_SCENARIO },
    { id: generateId(), name: 'Moderate', ...BLANK_SCENARIO },
  ]);

  const results = scenarios.map(simulateScenario);

  const handleAdd = useCallback(() => {
    if (scenarios.length >= 3) {
      showToast('Maximum 3 scenarios — remove one before adding another.');
      return;
    }
    const autoName = SCENARIO_AUTO_NAMES[scenarios.length] ?? `Scenario ${scenarios.length + 1}`;
    setScenarios((prev) => [
      ...prev,
      {
        id: generateId(),
        name: autoName,
        ...BLANK_SCENARIO,
      },
    ]);
  }, [scenarios.length]);

  const handleRemove = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleChange = useCallback((id: string, updated: ScenarioInput) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const handleSaveToProfile = useCallback((scenario: ScenarioInput) => {
    const client = CLIENTS.find((c) => c.id === scenario.clientId);
    const clientName = client ? client.name.split(' — ')[0] : 'client';
    // Mock POST
    setTimeout(() => {
      showToast(`${scenario.name} saved to ${clientName}'s profile`);
    }, 300);
  }, []);

  const handleCreateFundingRound = useCallback((scenario: ScenarioInput) => {
    // Mock POST
    setTimeout(() => {
      showToast(`Funding Round created from ${scenario.name}`);
      router.push('/funding-rounds');
    }, 300);
  }, [router]);

  const handleExport = useCallback(() => {
    const data = scenarios.map((s, i) => ({
      scenario: s.name,
      input: s,
      result: results[i],
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-comparison-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Scenario comparison exported.');
  }, [scenarios, results]);

  // Best scenario comparison
  const bestCapital = results.length > 0 ? Math.max(...results.map((r) => r.totalCapital)) : 0;
  const lowestCost = results.length > 0 ? Math.min(...results.map((r) => r.costOfCapital)) : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {/* Toast animation styles */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Funding Scenario Simulator</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Model funding strategies, compare scenarios side by side, and project outcomes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={scenarios.length === 0}
            className="px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 disabled:opacity-50 text-sm font-semibold transition-colors"
          >
            Export Comparison
          </button>
          <button
            onClick={handleAdd}
            disabled={scenarios.length >= 3}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-semibold transition-colors"
          >
            + Add Scenario
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {results.length >= 2 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Scenarios</p>
            <p className="text-2xl font-bold text-white">{scenarios.length}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Highest Capital</p>
            <p className="text-2xl font-bold text-[#C9A84C]">{formatCurrency(bestCapital)}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Lowest Cost</p>
            <p className="text-2xl font-bold text-green-400">{lowestCost}%</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Compare</p>
            <p className="text-2xl font-bold text-gray-300">{scenarios.length} / 3</p>
          </div>
        </div>
      )}

      {/* Scenario cards - side by side */}
      {scenarios.length > 0 ? (
        <div className={`grid gap-6 ${
          scenarios.length === 1 ? 'grid-cols-1 max-w-lg' :
          scenarios.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
          'grid-cols-1 lg:grid-cols-3'
        }`}>
          {scenarios.map((s, i) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              result={results[i]}
              index={i}
              onRemove={() => handleRemove(s.id)}
              onChange={(updated) => handleChange(s.id, updated)}
              onSaveToProfile={() => handleSaveToProfile(s)}
              onCreateFundingRound={() => handleCreateFundingRound(s)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-[#0A1628] p-10 text-center">
          <p className="text-gray-500 text-sm mb-3">No scenarios configured. Add a scenario to start simulating.</p>
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 text-gray-900 text-sm font-semibold transition-colors"
          >
            + Add First Scenario
          </button>
        </div>
      )}

      {/* Comparison table (when 2+ scenarios) */}
      {results.length >= 2 && (
        <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-base font-semibold text-white">Side-by-Side Comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Metric</th>
                  {scenarios.map((s) => (
                    <th key={s.id} className="text-right px-4 py-3 font-semibold">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {[
                  { label: 'Total Capital', key: 'totalCapital', format: formatCurrency },
                  { label: 'Cost of Capital', key: 'costOfCapital', format: (v: number) => `${v}%` },
                  { label: 'Effective APR', key: 'effectiveApr', format: (v: number) => `${v}%` },
                  { label: 'Monthly Payment', key: 'monthlyPayment', format: formatCurrency },
                  { label: 'Total Interest', key: 'totalInterest', format: formatCurrency },
                  { label: 'Payoff Months', key: 'projectedPayoffMonths', format: (v: number) => `${v} mo` },
                  { label: 'Credit Impact', key: 'creditImpactEstimate', format: (v: string) => v },
                ].map((row) => (
                  <tr key={row.key} className="bg-[#0A1628] hover:bg-gray-900/50 transition-colors">
                    <td className="px-5 py-3 text-gray-300 font-medium">{row.label}</td>
                    {results.map((r, i) => (
                      <td key={scenarios[i].id} className="px-4 py-3 text-right font-semibold text-gray-100">
                        {row.format((r as unknown as Record<string, number | string>)[row.key] as never)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

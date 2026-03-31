'use client';

// ============================================================
// /sandbox — Sandbox Environment
// Archetype library grid, practice mode launcher, regression
// test runner, and custom profile creator form.
// ============================================================

import { useState } from 'react';

// ─── Mock data ────────────────────────────────────────────────────────────────

type FicoTier = 'Excellent' | 'Good' | 'Fair' | 'Poor';
type Industry = 'Retail' | 'Tech' | 'Healthcare' | 'Food & Bev' | 'Construction' | 'Professional Services';

interface Archetype {
  id: number;
  name: string;
  ficoTier: FicoTier;
  fico: number;
  industry: Industry;
  revenue: string;
  revenueRaw: number;
  description: string;
}

const FICO_TIERS: FicoTier[] = ['Excellent', 'Good', 'Fair', 'Poor'];
const INDUSTRIES: Industry[] = ['Retail', 'Tech', 'Healthcare', 'Food & Bev', 'Construction', 'Professional Services'];

function makeName(i: number): string {
  const first = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
  const second = ['Profile', 'Archetype', 'Case', 'Scenario', 'Model', 'Example', 'Template', 'Pattern', 'Instance', 'Variant'];
  return `${first[i % 10]} ${second[Math.floor(i / 10) % 10]}`;
}

const ARCHETYPES: Archetype[] = Array.from({ length: 50 }, (_, i) => {
  const fico = 580 + ((i * 7) % 270);
  const tier: FicoTier = fico >= 750 ? 'Excellent' : fico >= 670 ? 'Good' : fico >= 580 ? 'Fair' : 'Poor';
  const revRaw = 150_000 + (i * 34_000) % 2_000_000;
  return {
    id: i + 1,
    name: makeName(i),
    ficoTier: tier,
    fico,
    industry: INDUSTRIES[i % INDUSTRIES.length],
    revenue: revRaw >= 1_000_000 ? `$${(revRaw / 1_000_000).toFixed(1)}M` : `$${(revRaw / 1_000).toFixed(0)}k`,
    revenueRaw: revRaw,
    description: `${tier} credit, ${INDUSTRIES[i % INDUSTRIES.length]} operator at ${revRaw >= 1_000_000 ? `$${(revRaw / 1_000_000).toFixed(1)}M` : `$${(revRaw / 1_000).toFixed(0)}k`} revenue.`,
  };
});

type TestResult = { name: string; status: 'pass' | 'fail'; ms: number };

const REGRESSION_TESTS: TestResult[] = [
  { name: 'Approval logic — FICO ≥ 720',           status: 'pass', ms: 12  },
  { name: 'Approval logic — FICO < 580 decline',   status: 'pass', ms: 9   },
  { name: 'Revenue threshold $250k gate',           status: 'pass', ms: 14  },
  { name: 'Debt ratio > 60% decline override',      status: 'fail', ms: 18  },
  { name: 'Multi-round projection accuracy ±5%',    status: 'pass', ms: 31  },
  { name: 'Interest shock alert trigger',           status: 'pass', ms: 8   },
  { name: 'Card recommendation ranking stability',  status: 'fail', ms: 22  },
  { name: 'Compliance scanner false-positive rate', status: 'pass', ms: 45  },
  { name: 'Consent capture field validation',       status: 'pass', ms: 11  },
  { name: 'Score model determinism check',          status: 'pass', ms: 19  },
  { name: 'Hardship deferral eligibility logic',    status: 'pass', ms: 7   },
  { name: 'Tax document attachment validation',     status: 'pass', ms: 16  },
];

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-green-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

const FICO_TIER_COLORS: Record<FicoTier, string> = {
  Excellent: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
  Good:      'bg-blue-900/50 text-blue-300 border border-blue-700',
  Fair:      'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  Poor:      'bg-red-900/50 text-red-300 border border-red-700',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FicoTierBadge({ tier }: { tier: FicoTier }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${FICO_TIER_COLORS[tier]}`}>
      {tier}
    </span>
  );
}

function IndustryBadge({ industry }: { industry: Industry }) {
  return (
    <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/30">
      {industry}
    </span>
  );
}

function ArchetypeGrid() {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<FicoTier | 'All'>('All');
  const [selected, setSelected] = useState<number | null>(null);

  const filtered = ARCHETYPES.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) || a.industry.toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === 'All' || a.ficoTier === filterTier;
    return matchSearch && matchTier;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search archetypes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
        <div className="flex gap-1.5">
          {(['All', ...FICO_TIERS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTier === t
                  ? 'bg-[#C9A84C] text-[#0A1628]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">{filtered.length} profiles</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {filtered.map((a) => (
          <div
            key={a.id}
            onClick={() => setSelected(selected === a.id ? null : a.id)}
            className={`rounded-xl border p-3 cursor-pointer transition-all space-y-2 ${
              selected === a.id
                ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                : 'border-gray-800 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-semibold text-gray-100 leading-tight">{a.name}</p>
              <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">#{a.id}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <FicoTierBadge tier={a.ficoTier} />
              <IndustryBadge industry={a.industry} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
              <span>FICO {a.fico}</span>
              <span>{a.revenue}</span>
            </div>
          </div>
        ))}
      </div>

      {selected !== null && (
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4">
          <p className="text-xs font-semibold text-[#C9A84C] mb-1">Selected: {ARCHETYPES.find((a) => a.id === selected)?.name}</p>
          <p className="text-xs text-gray-300">{ARCHETYPES.find((a) => a.id === selected)?.description}</p>
          <button className="mt-3 px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors">
            Launch Practice Mode with this Profile
          </button>
        </div>
      )}
    </div>
  );
}

function PracticeMode() {
  const [launched, setLaunched] = useState(false);
  const [score, setScore] = useState<string | null>(null);

  function runSession() {
    setLaunched(true);
    setScore(null);
    setTimeout(() => {
      const grades = ['A', 'A', 'B', 'B', 'C', 'D'];
      setScore(grades[Math.floor(Math.random() * grades.length)]);
    }, 1800);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Practice Mode</h3>
        <p className="text-xs text-gray-500 mt-0.5">Run a simulated advisor session and receive a letter grade.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Session Type</label>
          <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
            <option>Full Discovery</option>
            <option>Quick Pre-Qual</option>
            <option>Objection Handling</option>
            <option>Funding Strategy</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Difficulty</label>
          <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
            <option>Expert</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Archetype Pool</label>
          <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
            <option>Random</option>
            <option>Excellent FICO Only</option>
            <option>Challenging Cases</option>
            <option>Industry Mix</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={runSession}
          className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          {launched && !score ? 'Running…' : 'Launch Session'}
        </button>

        {score && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Grade</p>
              <p className={`text-4xl font-black tabular-nums ${GRADE_COLORS[score] ?? 'text-gray-300'}`}>{score}</p>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>Accuracy: {score === 'A' ? '94' : score === 'B' ? '83' : score === 'C' ? '72' : '61'}%</p>
              <p>Time: 4m 32s</p>
              <p>Cards recommended: 3</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/sandbox/practice-session</p>
    </div>
  );
}

function RegressionRunner() {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  function runTests() {
    setRunning(true);
    setRan(false);
    setTimeout(() => {
      setResults(REGRESSION_TESTS);
      setRunning(false);
      setRan(true);
    }, 2000);
  }

  const passing = results.filter((r) => r.status === 'pass').length;
  const failing = results.filter((r) => r.status === 'fail').length;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Regression Test Runner</h3>
          <p className="text-xs text-gray-500 mt-0.5">Validate scoring logic and decision rules against known cases.</p>
        </div>
        <button
          onClick={runTests}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-[#0A1628] border border-[#C9A84C]/50 hover:border-[#C9A84C] text-[#C9A84C] text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run All Tests'}
        </button>
      </div>

      {ran && (
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-emerald-400 font-semibold">{passing} passed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            <span className="text-red-400 font-semibold">{failing} failed</span>
          </div>
          <span className="text-gray-500 text-xs self-center">
            {Math.round((passing / results.length) * 100)}% pass rate
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-950 text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left font-semibold">Test</th>
                <th className="px-4 py-2 text-right font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {results.map((r) => (
                <tr key={r.name} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-2 text-gray-300">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-semibold ${r.status === 'pass' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.status === 'pass' ? '✓ PASS' : '✗ FAIL'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 tabular-nums">{r.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/sandbox/regression-tests</p>
    </div>
  );
}

function CustomProfileCreator() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Custom Profile Creator</h3>
        <p className="text-xs text-gray-500 mt-0.5">Build a bespoke archetype for targeted practice or test scenarios.</p>
      </div>

      {submitted ? (
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700 p-4 text-emerald-300 text-sm">
          Profile saved to sandbox library. It will appear in the archetype grid after refresh.
          <button onClick={() => setSubmitted(false)} className="ml-3 text-xs underline opacity-70 hover:opacity-100">
            Create another
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Profile Name</label>
            <input placeholder="e.g. Edge Case Alpha" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">FICO Score</label>
            <input type="number" min={300} max={850} placeholder="720" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Industry</label>
            <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
              {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Annual Revenue ($)</label>
            <input type="number" placeholder="500000" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Debt-to-Income Ratio (%)</label>
            <input type="number" min={0} max={100} placeholder="35" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Business Age (years)</label>
            <input type="number" min={0} placeholder="3" className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 space-y-1">
            <label className="text-xs text-gray-400 font-medium">Notes</label>
            <textarea rows={2} placeholder="Scenario description or edge case notes..." className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
            <button type="submit" className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
              Save Profile
            </button>
            <button type="button" className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
              Reset
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [activeTab, setActiveTab] = useState<'library' | 'practice' | 'regression' | 'creator'>('library');

  const TABS = [
    { key: 'library' as const,    label: 'Archetype Library' },
    { key: 'practice' as const,   label: 'Practice Mode' },
    { key: 'regression' as const, label: 'Regression Tests' },
    { key: 'creator' as const,    label: 'Custom Profile' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Sandbox Environment</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Practice advisor sessions, test decision logic, and build custom profiles.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Reset Sandbox
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            Export Library
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
              activeTab === tab.key
                ? 'text-[#C9A84C] border border-gray-800 border-b-gray-950 bg-gray-950'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────── */}
      {activeTab === 'library' && (
        <section aria-label="Archetype Library">
          <ArchetypeGrid />
        </section>
      )}
      {activeTab === 'practice' && (
        <section aria-label="Practice Mode">
          <PracticeMode />
        </section>
      )}
      {activeTab === 'regression' && (
        <section aria-label="Regression Tests">
          <RegressionRunner />
        </section>
      )}
      {activeTab === 'creator' && (
        <section aria-label="Custom Profile Creator">
          <CustomProfileCreator />
        </section>
      )}

    </div>
  );
}

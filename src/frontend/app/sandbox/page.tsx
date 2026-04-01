'use client';

// ============================================================
// /sandbox — Sandbox Environment
// Archetype library grid, practice mode launcher, regression
// test runner, and custom profile creator form.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  dti: number;
  businessAge: number;
  existingCards: number;
  description: string;
  isCustom?: boolean;
}

interface PracticeScenario {
  clientName: string;
  businessName: string;
  openingStatement: string;
  concerns: string[];
  advisorActions: { id: string; label: string; correct: boolean }[];
}

interface PracticeGrade {
  letter: string;
  score: number;
  strengths: string[];
  missed: string[];
  feedback: string;
}

interface RegressionTestCase {
  name: string;
  profileSummary: string;
  expectedResult: string;
  actualResult: string;
  pass: boolean;
  ms: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FICO_TIERS: FicoTier[] = ['Excellent', 'Good', 'Fair', 'Poor'];
const INDUSTRIES: Industry[] = ['Retail', 'Tech', 'Healthcare', 'Food & Bev', 'Construction', 'Professional Services'];

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

const CUSTOM_ARCHETYPES_KEY = 'custom_archetypes';

const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer', 'Richard', 'Elizabeth'];
const LAST_NAMES = ['Chen', 'Rodriguez', 'Patel', 'O\'Brien', 'Kim', 'Martinez', 'Nguyen', 'Williams', 'Davis', 'Thompson'];
const BUSINESS_SUFFIXES = ['Solutions', 'Group', 'Enterprises', 'Co.', 'Industries', 'Partners', 'Consulting', 'Services', 'Labs', 'Holdings'];

// ─── Mock data builders ──────────────────────────────────────────────────────

function makeName(i: number): string {
  const first = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
  const second = ['Profile', 'Archetype', 'Case', 'Scenario', 'Model', 'Example', 'Template', 'Pattern', 'Instance', 'Variant'];
  return `${first[i % 10]} ${second[Math.floor(i / 10) % 10]}`;
}

function ficoToTier(fico: number): FicoTier {
  return fico >= 750 ? 'Excellent' : fico >= 670 ? 'Good' : fico >= 580 ? 'Fair' : 'Poor';
}

function formatRevenue(revRaw: number): string {
  return revRaw >= 1_000_000 ? `$${(revRaw / 1_000_000).toFixed(1)}M` : `$${(revRaw / 1_000).toFixed(0)}k`;
}

const BUILT_IN_ARCHETYPES: Archetype[] = Array.from({ length: 50 }, (_, i) => {
  const fico = 580 + ((i * 7) % 270);
  const tier = ficoToTier(fico);
  const revRaw = 150_000 + (i * 34_000) % 2_000_000;
  const dti = 15 + ((i * 13) % 55);
  const businessAge = 1 + (i % 20);
  const existingCards = i % 6;
  return {
    id: i + 1,
    name: makeName(i),
    ficoTier: tier,
    fico,
    industry: INDUSTRIES[i % INDUSTRIES.length],
    revenue: formatRevenue(revRaw),
    revenueRaw: revRaw,
    dti,
    businessAge,
    existingCards,
    description: `${tier} credit, ${INDUSTRIES[i % INDUSTRIES.length]} operator at ${formatRevenue(revRaw)} revenue.`,
  };
});

// ─── Practice scenario generator (local, no API) ────────────────────────────

function generateScenario(archetype: Archetype): PracticeScenario {
  const fnIdx = Math.floor(Math.random() * FIRST_NAMES.length);
  const lnIdx = Math.floor(Math.random() * LAST_NAMES.length);
  const clientName = `${FIRST_NAMES[fnIdx]} ${LAST_NAMES[lnIdx]}`;
  const businessName = `${LAST_NAMES[(lnIdx + 3) % LAST_NAMES.length]} ${BUSINESS_SUFFIXES[fnIdx % BUSINESS_SUFFIXES.length]}`;

  const tierConcerns: Record<FicoTier, string[]> = {
    Excellent: [
      'Wants to maximize rewards and cashback across multiple premium cards',
      'Concerned about annual fees cutting into ROI on high-limit cards',
      'Needs guidance on optimal credit utilization to maintain 800+ score',
    ],
    Good: [
      'Looking to graduate from mid-tier cards to premium products',
      'Worried about hard inquiries dropping score below 670 threshold',
      'Needs help balancing business growth spending with credit health',
    ],
    Fair: [
      'Struggling with high DTI ratio limiting card approval odds',
      'Needs a realistic timeline to rebuild credit into Good tier',
      'Unsure which secured or builder cards will actually help long-term',
    ],
    Poor: [
      'Recently recovered from a default, needs a rebuilding roadmap',
      'Confused about which negative marks can be disputed or removed',
      'Worried that any new application will further damage their score',
    ],
  };

  const concerns = tierConcerns[archetype.ficoTier];

  const openingStatement = `Hi, I'm ${clientName} from ${businessName}. We're a ${archetype.industry.toLowerCase()} business doing about ${archetype.revenue} in annual revenue. My FICO is around ${archetype.fico} and I have ${archetype.existingCards} existing card${archetype.existingCards === 1 ? '' : 's'}. I need help figuring out my best credit strategy.`;

  // Define 6 advisor actions: 3 correct, 3 incorrect based on tier
  const correctActions: { id: string; label: string }[] = [];
  const incorrectActions: { id: string; label: string }[] = [];

  if (archetype.ficoTier === 'Excellent' || archetype.ficoTier === 'Good') {
    correctActions.push(
      { id: 'a1', label: 'Review full credit report and identify utilization optimization opportunities' },
      { id: 'a2', label: 'Recommend premium rewards cards matched to spending patterns' },
      { id: 'a3', label: 'Create a 90-day application strategy to minimize inquiry impact' },
    );
    incorrectActions.push(
      { id: 'a4', label: 'Suggest secured credit cards to rebuild credit' },
      { id: 'a5', label: 'Advise closing all existing cards to simplify portfolio' },
      { id: 'a6', label: 'Recommend waiting 12 months before any new applications' },
    );
  } else {
    correctActions.push(
      { id: 'a1', label: 'Pull credit report and identify disputable negative marks' },
      { id: 'a2', label: 'Recommend credit-builder or secured cards with graduation paths' },
      { id: 'a3', label: 'Create a DTI reduction plan before applying for new credit' },
    );
    incorrectActions.push(
      { id: 'a4', label: 'Apply for multiple premium rewards cards immediately' },
      { id: 'a5', label: 'Recommend balance transfers to cards they cannot qualify for' },
      { id: 'a6', label: 'Advise ignoring existing debt and focusing on new credit lines' },
    );
  }

  const allActions = [
    ...correctActions.map((a) => ({ ...a, correct: true })),
    ...incorrectActions.map((a) => ({ ...a, correct: false })),
  ].sort(() => Math.random() - 0.5);

  return { clientName, businessName, openingStatement, concerns, advisorActions: allActions };
}

function gradeSession(actions: { id: string; label: string; correct: boolean }[], selectedIds: Set<string>): PracticeGrade {
  const correctIds = new Set(actions.filter((a) => a.correct).map((a) => a.id));
  const correctSelected = Array.from(selectedIds).filter((id) => correctIds.has(id));
  const incorrectSelected = Array.from(selectedIds).filter((id) => !correctIds.has(id));
  const missedCorrect = Array.from(correctIds).filter((id) => !selectedIds.has(id));

  const maxPoints = correctIds.size;
  const points = correctSelected.length - incorrectSelected.length * 0.5;
  const score = Math.max(0, Math.round((points / maxPoints) * 100));

  let letter: string;
  if (score >= 90) letter = 'A';
  else if (score >= 80) letter = 'B';
  else if (score >= 70) letter = 'C';
  else if (score >= 60) letter = 'D';
  else letter = 'F';

  const strengths = correctSelected.map(
    (id) => actions.find((a) => a.id === id)?.label ?? '',
  ).filter(Boolean);

  const missed = missedCorrect.map(
    (id) => actions.find((a) => a.id === id)?.label ?? '',
  ).filter(Boolean);

  const incorrectLabels = incorrectSelected.map(
    (id) => actions.find((a) => a.id === id)?.label ?? '',
  ).filter(Boolean);

  let feedback = '';
  if (letter === 'A') feedback = 'Excellent work! You identified all the right actions for this client profile.';
  else if (letter === 'B') feedback = 'Good job. You caught most of the right moves but missed a nuance.';
  else if (letter === 'C') feedback = 'Decent effort. Review the missed items to strengthen your advisory skills.';
  else if (letter === 'D') feedback = 'Needs improvement. Focus on matching recommendations to the client tier.';
  else feedback = 'Review the fundamentals. The selected actions could harm this client.';

  if (incorrectLabels.length > 0) {
    feedback += ` You also selected ${incorrectLabels.length} incorrect action${incorrectLabels.length > 1 ? 's' : ''} that would be counterproductive.`;
  }

  return { letter, score, strengths, missed, feedback };
}

// ─── Regression test case definitions ────────────────────────────────────────

const REGRESSION_TEST_DEFS: { name: string; profileSummary: string; expectedResult: string }[] = [
  { name: 'Approval logic - FICO >= 720', profileSummary: 'FICO 740, Revenue $800k, DTI 30%', expectedResult: 'Approved: Premium tier' },
  { name: 'Approval logic - FICO < 580 decline', profileSummary: 'FICO 540, Revenue $200k, DTI 55%', expectedResult: 'Declined: Below minimum threshold' },
  { name: 'Revenue threshold $250k gate', profileSummary: 'FICO 690, Revenue $180k, DTI 25%', expectedResult: 'Declined: Revenue below $250k minimum' },
  { name: 'Debt ratio > 60% decline override', profileSummary: 'FICO 710, Revenue $500k, DTI 65%', expectedResult: 'Declined: DTI exceeds 60% limit' },
  { name: 'Multi-round projection accuracy', profileSummary: 'FICO 720, Revenue $1.2M, DTI 35%', expectedResult: 'Projected score delta within +/-5%' },
  { name: 'Interest shock alert trigger', profileSummary: 'FICO 680, Revenue $400k, DTI 50%', expectedResult: 'Alert triggered: High interest risk' },
  { name: 'Card recommendation ranking stability', profileSummary: 'FICO 750, Revenue $900k, DTI 20%', expectedResult: 'Top 3 cards consistent across runs' },
  { name: 'Compliance scanner false-positive rate', profileSummary: 'FICO 700, Revenue $600k, DTI 40%', expectedResult: 'False positive rate < 2%' },
];

function runRegressionTests(): Promise<RegressionTestCase[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results: RegressionTestCase[] = REGRESSION_TEST_DEFS.map((def) => {
        // Simulate test execution: most pass, some fail deterministically
        const failIndices = new Set([3, 6]); // DTI override and ranking stability fail
        const idx = REGRESSION_TEST_DEFS.indexOf(def);
        const pass = !failIndices.has(idx);
        const ms = 5 + Math.floor(Math.random() * 40);
        const actualResult = pass
          ? def.expectedResult
          : idx === 3
            ? 'Approved: DTI override not enforced'
            : 'Top 3 cards differ between runs 2 and 3';
        return { name: def.name, profileSummary: def.profileSummary, expectedResult: def.expectedResult, actualResult, pass, ms };
      });
      resolve(results);
    }, 1500);
  });
}

// ─── Toast component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg bg-emerald-900/90 border border-emerald-700 text-emerald-200 text-sm font-medium shadow-xl animate-in slide-in-from-bottom-4">
      {message}
    </div>
  );
}

// ─── Confirmation modal ──────────────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <p className="text-xs text-gray-400">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
            Confirm Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function CustomBadge() {
  return (
    <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700">
      Custom
    </span>
  );
}

// ─── Detail Drawer ───────────────────────────────────────────────────────────

function ArchetypeDrawer({
  archetype,
  onClose,
  onUseProfile,
  onRunOptimizer,
}: {
  archetype: Archetype;
  onClose: () => void;
  onUseProfile: () => void;
  onRunOptimizer: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute top-0 right-0 h-full w-[480px] max-w-full bg-gray-900 border-l border-gray-700 shadow-2xl overflow-y-auto animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-100">{archetype.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Profile #{archetype.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none p-1">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <FicoTierBadge tier={archetype.ficoTier} />
            <IndustryBadge industry={archetype.industry} />
            {archetype.isCustom && <CustomBadge />}
          </div>

          {/* Profile details grid */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ['FICO Score', String(archetype.fico)],
              ['Tier', archetype.ficoTier],
              ['Annual Revenue', archetype.revenue],
              ['Industry', archetype.industry],
              ['DTI Ratio', `${archetype.dti}%`],
              ['Business Age', `${archetype.businessAge} yr${archetype.businessAge !== 1 ? 's' : ''}`],
              ['Existing Cards', String(archetype.existingCards)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-gray-800/50 border border-gray-800 p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                <p className="text-sm text-gray-100 font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-1">Description</p>
            <p className="text-xs text-gray-300">{archetype.description}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onUseProfile}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
            >
              Use This Profile
            </button>
            <button
              onClick={onRunOptimizer}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#C9A84C]/50 hover:border-[#C9A84C] text-[#C9A84C] text-sm font-semibold transition-colors"
            >
              Run Optimizer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Archetype Grid ──────────────────────────────────────────────────────────

function ArchetypeGrid({
  customArchetypes,
  onSelectForPractice,
}: {
  customArchetypes: Archetype[];
  onSelectForPractice: (a: Archetype) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<FicoTier | 'All'>('All');
  const [drawerArchetype, setDrawerArchetype] = useState<Archetype | null>(null);

  const allArchetypes = [...BUILT_IN_ARCHETYPES, ...customArchetypes];

  const filtered = allArchetypes.filter((a) => {
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
            key={`${a.isCustom ? 'custom-' : ''}${a.id}`}
            onClick={() => setDrawerArchetype(a)}
            className="rounded-xl border p-3 cursor-pointer transition-all space-y-2 border-gray-800 bg-gray-900 hover:border-gray-600"
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-semibold text-gray-100 leading-tight">{a.name}</p>
              <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">
                {a.isCustom ? 'C' : '#'}{a.id}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              <FicoTierBadge tier={a.ficoTier} />
              <IndustryBadge industry={a.industry} />
              {a.isCustom && <CustomBadge />}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
              <span>FICO {a.fico}</span>
              <span>{a.revenue}</span>
            </div>
          </div>
        ))}
      </div>

      {drawerArchetype && (
        <ArchetypeDrawer
          archetype={drawerArchetype}
          onClose={() => setDrawerArchetype(null)}
          onUseProfile={() => {
            onSelectForPractice(drawerArchetype);
            setDrawerArchetype(null);
          }}
          onRunOptimizer={() => {
            // Placeholder for optimizer integration
            setDrawerArchetype(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Practice Mode ───────────────────────────────────────────────────────────

function PracticeMode({ preselectedArchetype }: { preselectedArchetype: Archetype | null }) {
  const [sessionType, setSessionType] = useState('Full Discovery');
  const [difficulty, setDifficulty] = useState('Beginner');
  const [archetypePool, setArchetypePool] = useState('Random');

  const [scenario, setScenario] = useState<PracticeScenario | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [grade, setGrade] = useState<PracticeGrade | null>(null);
  const [usedArchetype, setUsedArchetype] = useState<Archetype | null>(null);

  function launchSession() {
    // Pick an archetype
    let archetype: Archetype;
    if (preselectedArchetype) {
      archetype = preselectedArchetype;
    } else {
      let pool = BUILT_IN_ARCHETYPES;
      if (archetypePool === 'Excellent FICO Only') pool = pool.filter((a) => a.ficoTier === 'Excellent');
      else if (archetypePool === 'Challenging Cases') pool = pool.filter((a) => a.ficoTier === 'Fair' || a.ficoTier === 'Poor');
      else if (archetypePool === 'Industry Mix') pool = pool.filter((_, i) => i % 6 < 4); // diverse subset
      archetype = pool[Math.floor(Math.random() * pool.length)];
    }

    setUsedArchetype(archetype);
    setScenario(generateScenario(archetype));
    setSelectedActions(new Set());
    setGrade(null);
  }

  function toggleAction(id: string) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitDecisions() {
    if (!scenario) return;
    const result = gradeSession(scenario.advisorActions, selectedActions);
    setGrade(result);
  }

  function resetSession() {
    setScenario(null);
    setSelectedActions(new Set());
    setGrade(null);
    setUsedArchetype(null);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Practice Mode</h3>
        <p className="text-xs text-gray-500 mt-0.5">Run a simulated advisor session and receive a letter grade. All scenarios generated locally.</p>
      </div>

      {!scenario && !grade && (
        <>
          {preselectedArchetype && (
            <div className="rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-3">
              <p className="text-xs text-[#C9A84C] font-medium">
                Using selected profile: {preselectedArchetype.name} (FICO {preselectedArchetype.fico}, {preselectedArchetype.industry})
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Session Type</label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
              >
                <option>Full Discovery</option>
                <option>Quick Pre-Qual</option>
                <option>Objection Handling</option>
                <option>Funding Strategy</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Expert</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Archetype Pool</label>
              <select
                value={archetypePool}
                onChange={(e) => setArchetypePool(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
              >
                <option>Random</option>
                <option>Excellent FICO Only</option>
                <option>Challenging Cases</option>
                <option>Industry Mix</option>
              </select>
            </div>
          </div>

          <button
            onClick={launchSession}
            className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            Launch Session
          </button>
        </>
      )}

      {/* Scenario display */}
      {scenario && !grade && (
        <div className="space-y-5">
          {/* Client info */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-800 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center text-[#C9A84C] font-bold text-sm">
                {scenario.clientName.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">{scenario.clientName}</p>
                <p className="text-xs text-gray-400">{scenario.businessName}</p>
              </div>
              {usedArchetype && (
                <div className="ml-auto">
                  <FicoTierBadge tier={usedArchetype.ficoTier} />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-300 italic leading-relaxed">&ldquo;{scenario.openingStatement}&rdquo;</p>
          </div>

          {/* Key concerns */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Key Client Concerns</p>
            <ul className="space-y-1.5">
              {scenario.concerns.map((c, i) => (
                <li key={i} className="text-xs text-gray-300 flex gap-2">
                  <span className="text-[#C9A84C] flex-shrink-0">{i + 1}.</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Advisor action selection */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Select Your Advisor Actions (choose the correct responses)</p>
            <div className="space-y-2">
              {scenario.advisorActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => toggleAction(action.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-xs transition-all ${
                    selectedActions.has(action.id)
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-gray-100'
                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className={`inline-block w-4 h-4 rounded border mr-3 text-center text-[10px] leading-4 ${
                    selectedActions.has(action.id)
                      ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0A1628]'
                      : 'border-gray-600'
                  }`}>
                    {selectedActions.has(action.id) ? '\u2713' : ''}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={submitDecisions}
              disabled={selectedActions.size === 0}
              className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit My Decisions
            </button>
            <button
              onClick={resetSession}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grade card */}
      {grade && (
        <div className="space-y-5">
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-5 space-y-4">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Grade</p>
                <p className={`text-5xl font-black tabular-nums ${GRADE_COLORS[grade.letter] ?? 'text-gray-300'}`}>{grade.letter}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Score</p>
                <p className="text-2xl font-bold text-gray-100">{grade.score}%</p>
              </div>
              {usedArchetype && (
                <div className="ml-auto text-right">
                  <p className="text-[10px] text-gray-500">Profile</p>
                  <p className="text-xs text-gray-300">{usedArchetype.name}</p>
                  <p className="text-[10px] text-gray-500">FICO {usedArchetype.fico} / {usedArchetype.ficoTier}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-300">{grade.feedback}</p>

            {grade.strengths.length > 0 && (
              <div>
                <p className="text-[10px] text-emerald-400 uppercase tracking-wide font-medium mb-1">Correct Actions</p>
                <ul className="space-y-1">
                  {grade.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-gray-300 flex gap-2">
                      <span className="text-emerald-400 flex-shrink-0">{'\u2713'}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {grade.missed.length > 0 && (
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wide font-medium mb-1">Missed Items</p>
                <ul className="space-y-1">
                  {grade.missed.map((m, i) => (
                    <li key={i} className="text-xs text-gray-300 flex gap-2">
                      <span className="text-red-400 flex-shrink-0">{'\u2717'}</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={resetSession}
            className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            Start New Session
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Regression Runner ───────────────────────────────────────────────────────

function RegressionRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RegressionTestCase[]>([]);

  async function runTests() {
    setRunning(true);
    setResults([]);
    const data = await runRegressionTests();
    setResults(data);
    setRunning(false);
  }

  const passing = results.filter((r) => r.pass).length;
  const failing = results.filter((r) => !r.pass).length;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Regression Test Runner</h3>
          <p className="text-xs text-gray-500 mt-0.5">Validate scoring logic and decision rules against 8 known test cases.</p>
        </div>
        <button
          onClick={runTests}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-[#0A1628] border border-[#C9A84C]/50 hover:border-[#C9A84C] text-[#C9A84C] text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run All Tests'}
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
          Running 8 test cases...
        </div>
      )}

      {results.length > 0 && (
        <>
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

          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-950 text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-semibold">Test</th>
                  <th className="px-4 py-2 text-left font-semibold">Profile</th>
                  <th className="px-4 py-2 text-left font-semibold">Expected</th>
                  <th className="px-4 py-2 text-left font-semibold">Actual</th>
                  <th className="px-4 py-2 text-right font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {results.map((r) => (
                  <tr key={r.name} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-2 text-gray-300">{r.name}</td>
                    <td className="px-4 py-2 text-gray-400">{r.profileSummary}</td>
                    <td className="px-4 py-2 text-gray-400">{r.expectedResult}</td>
                    <td className={`px-4 py-2 ${r.pass ? 'text-gray-400' : 'text-red-300'}`}>{r.actualResult}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.pass
                          ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                          : 'bg-red-900/50 text-red-300 border border-red-700'
                      }`}>
                        {r.pass ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500 tabular-nums">{r.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Custom Profile Creator ──────────────────────────────────────────────────

function CustomProfileCreator({
  onSave,
  showToast,
}: {
  onSave: (archetype: Archetype) => void;
  showToast: (msg: string) => void;
}) {
  const [profileName, setProfileName] = useState('');
  const [fico, setFico] = useState('');
  const [industry, setIndustry] = useState<Industry>('Retail');
  const [revenue, setRevenue] = useState('');
  const [dti, setDti] = useState('');
  const [businessAge, setBusinessAge] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setProfileName('');
    setFico('');
    setIndustry('Retail');
    setRevenue('');
    setDti('');
    setBusinessAge('');
    setNotes('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ficoNum = parseInt(fico) || 680;
    const revNum = parseInt(revenue) || 500000;
    const dtiNum = parseInt(dti) || 35;
    const ageNum = parseInt(businessAge) || 3;
    const tier = ficoToTier(ficoNum);

    const newArchetype: Archetype = {
      id: Date.now(),
      name: profileName || 'Custom Profile',
      ficoTier: tier,
      fico: ficoNum,
      industry,
      revenue: formatRevenue(revNum),
      revenueRaw: revNum,
      dti: dtiNum,
      businessAge: ageNum,
      existingCards: 0,
      description: notes || `${tier} credit, ${industry} operator at ${formatRevenue(revNum)} revenue.`,
      isCustom: true,
    };

    onSave(newArchetype);
    showToast('Custom profile saved to sandbox library.');
    resetForm();
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Custom Profile Creator</h3>
        <p className="text-xs text-gray-500 mt-0.5">Build a bespoke archetype for targeted practice or test scenarios.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Profile Name</label>
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g. Edge Case Alpha"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">FICO Score</label>
          <input
            type="number"
            min={300}
            max={850}
            value={fico}
            onChange={(e) => setFico(e.target.value)}
            placeholder="720"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Industry</label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value as Industry)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
          >
            {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Annual Revenue ($)</label>
          <input
            type="number"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="500000"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Debt-to-Income Ratio (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={dti}
            onChange={(e) => setDti(e.target.value)}
            placeholder="35"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Business Age (years)</label>
          <input
            type="number"
            min={0}
            value={businessAge}
            onChange={(e) => setBusinessAge(e.target.value)}
            placeholder="3"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 space-y-1">
          <label className="text-xs text-gray-400 font-medium">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Scenario description or edge case notes..."
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
          <button type="submit" className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            Save Profile
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [activeTab, setActiveTab] = useState<'library' | 'practice' | 'regression' | 'creator'>('library');
  const [customArchetypes, setCustomArchetypes] = useState<Archetype[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [practiceArchetype, setPracticeArchetype] = useState<Archetype | null>(null);

  // Load custom archetypes from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_ARCHETYPES_KEY);
      if (stored) {
        setCustomArchetypes(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  function saveCustomArchetype(archetype: Archetype) {
    const updated = [...customArchetypes, archetype];
    setCustomArchetypes(updated);
    try {
      localStorage.setItem(CUSTOM_ARCHETYPES_KEY, JSON.stringify(updated));
    } catch {
      // storage full or unavailable
    }
  }

  function handleExportLibrary() {
    const allArchetypes = [...BUILT_IN_ARCHETYPES, ...customArchetypes];
    const blob = new Blob([JSON.stringify(allArchetypes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'capitalforge-archetypes.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Archetype library exported as JSON.');
  }

  function handleResetSandbox() {
    localStorage.removeItem(CUSTOM_ARCHETYPES_KEY);
    localStorage.removeItem('simulator_scenarios');
    localStorage.removeItem('practice_session_history');
    setCustomArchetypes([]);
    setPracticeArchetype(null);
    setShowResetModal(false);
    showToast('Sandbox reset. All custom data cleared.');
  }

  function handleSelectForPractice(a: Archetype) {
    setPracticeArchetype(a);
    setActiveTab('practice');
  }

  const TABS = [
    { key: 'library' as const,    label: 'Archetype Library' },
    { key: 'practice' as const,   label: 'Practice Mode' },
    { key: 'regression' as const, label: 'Regression Tests' },
    { key: 'creator' as const,    label: 'Custom Profile' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Reset confirmation modal */}
      {showResetModal && (
        <ConfirmModal
          title="Reset Sandbox"
          message="This will clear all custom archetypes, saved scenarios, and practice session history. This action cannot be undone."
          onConfirm={handleResetSandbox}
          onCancel={() => setShowResetModal(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Sandbox Environment</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Practice advisor sessions, test decision logic, and build custom profiles.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowResetModal(true)}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Reset Sandbox
          </button>
          <button
            onClick={handleExportLibrary}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            Export Library
          </button>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Tab Content */}
      {activeTab === 'library' && (
        <section aria-label="Archetype Library">
          <ArchetypeGrid customArchetypes={customArchetypes} onSelectForPractice={handleSelectForPractice} />
        </section>
      )}
      {activeTab === 'practice' && (
        <section aria-label="Practice Mode">
          <PracticeMode preselectedArchetype={practiceArchetype} />
        </section>
      )}
      {activeTab === 'regression' && (
        <section aria-label="Regression Tests">
          <RegressionRunner />
        </section>
      )}
      {activeTab === 'creator' && (
        <section aria-label="Custom Profile Creator">
          <CustomProfileCreator onSave={saveCustomArchetype} showToast={showToast} />
        </section>
      )}

    </div>
  );
}

'use client';

// ============================================================
// /comm-compliance — Communication Compliance
// Approved scripts library with category filter & expand.
// Banned claims scanner — local text input with real-time risk score.
// QA scorecard table per advisor with drill-down slide-over.
// Communication risk trend chart.
// Submit for QA Review modal, Add Script modal, client selector.
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScriptCategory = 'outbound_sales' | 'objection_handling' | 'disclosure' | 'consent' | 'follow_up';

interface ApprovedScript {
  id: string;
  title: string;
  category: ScriptCategory;
  version: string;
  approvedBy: string;
  approvedAt: string;
  body: string;
  tags: string[];
}

interface AdvisorQAScore {
  advisorName: string;
  avatarInitials: string;
  callsReviewed: number;
  overallScore: number;
  complianceScore: number;
  scriptAdherenceScore: number;
  consentCaptureScore: number;
  lastReviewedAt: string;
  trend: 'up' | 'down' | 'flat';
}

interface RecentCall {
  date: string;
  client: string;
  score: number;
  flags: string;
}

// ---------------------------------------------------------------------------
// Banned Claims Scanner Types & Data
// ---------------------------------------------------------------------------

type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

interface ScanViolation {
  phrase: string;
  severity: ViolationSeverity;
  regulation: string;
  alternative: string;
}

interface ScanResult {
  status: 'pass' | 'caution' | 'fail';
  riskScore: number;
  violations: ScanViolation[];
}

const BANNED_CLAIMS: { phrase: string; pattern: RegExp; severity: ViolationSeverity; regulation: string; alternative: string }[] = [
  { phrase: 'guaranteed approval', pattern: /guaranteed\s+approval/gi, severity: 'critical', regulation: 'UDAP Section 5 — Deceptive Practices', alternative: 'Subject to credit review and approval' },
  { phrase: 'guaranteed funding', pattern: /guaranteed\s+funding/gi, severity: 'critical', regulation: 'UDAP Section 5 — Deceptive Practices', alternative: 'Apply now to see if you qualify for funding' },
  { phrase: '0% APR', pattern: /0%\s*apr/gi, severity: 'critical', regulation: 'Reg Z / SB 1235 — APR Accuracy', alternative: '0% intro APR for 12 months on qualifying accounts; standard rate thereafter' },
  { phrase: 'no hard pull', pattern: /no\s+hard\s+pull/gi, severity: 'high', regulation: 'FCRA Section 604 — Credit Inquiry Disclosure', alternative: 'Soft credit pull only — no impact to your score' },
  { phrase: 'no credit check', pattern: /no\s+credit\s+check/gi, severity: 'high', regulation: 'FCRA Section 604 — Credit Inquiry Disclosure', alternative: 'Soft inquiry only — does not affect your credit score' },
  { phrase: 'best rates', pattern: /best\s+rates/gi, severity: 'high', regulation: 'FTC Guides — Superlative Claims', alternative: 'Competitive rates based on your profile' },
  { phrase: 'lowest rates', pattern: /lowest\s+rates/gi, severity: 'high', regulation: 'FTC Guides — Superlative Claims', alternative: 'Competitive rates — compare with your current offers' },
];

function runLocalScan(text: string): ScanResult {
  const violations: ScanViolation[] = [];
  for (const claim of BANNED_CLAIMS) {
    claim.pattern.lastIndex = 0;
    if (claim.pattern.test(text)) {
      violations.push({ phrase: claim.phrase, severity: claim.severity, regulation: claim.regulation, alternative: claim.alternative });
    }
  }
  const critCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;
  const medCount = violations.filter(v => v.severity === 'medium').length;
  const riskScore = Math.min(100, critCount * 35 + highCount * 20 + medCount * 10);
  const status: ScanResult['status'] = violations.length === 0 ? 'pass' : critCount > 0 ? 'fail' : 'caution';
  return { status, riskScore, violations };
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_SCRIPTS: ApprovedScript[] = [
  {
    id: 'scr_001',
    title: 'Opening Call — Business Funding Introduction',
    category: 'outbound_sales',
    version: '2.3',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-02-15',
    tags: ['outbound', 'cold call', 'introduction'],
    body: `Hello, may I speak with [Owner Name]? Hi [Name], this is [Advisor Name] calling from CapitalForge. I'm reaching out because we help businesses like yours access flexible funding solutions — things like business lines of credit, equipment financing, and working capital. I'm not here to sell you anything today, just to understand if there's a fit. Do you have two minutes to chat about your current funding needs? [Pause for response] Great. Could you tell me a bit about your business and whether you've explored any funding options recently?`,
  },
  {
    id: 'scr_002',
    title: 'Rate & Terms Disclosure Script',
    category: 'disclosure',
    version: '3.1',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-03-01',
    tags: ['disclosure', 'APR', 'required'],
    body: `Before we proceed, I'm required to share some important disclosures with you. The annual percentage rate for this offer ranges from [X%] to [Y%] depending on your creditworthiness and selected term. Total repayment amount would be [$ Amount] over [Term] months. There is [no prepayment penalty / a prepayment fee of X%]. This offer is subject to final credit approval and verification of your business documents. Do you have any questions about these terms before we continue?`,
  },
  {
    id: 'scr_003',
    title: 'TCPA Consent Capture — Voice',
    category: 'consent',
    version: '1.8',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-01-20',
    tags: ['TCPA', 'consent', 'required', 'voice'],
    body: `Before we wrap up, I need to capture your consent for future contact. By saying yes, you agree that CapitalForge and its partners may contact you at [phone number] using automated dialing systems or pre-recorded messages for informational and marketing purposes. This consent is not required to obtain our services, and you can revoke it at any time by calling [number] or emailing [email]. Do you provide your consent? [Record response clearly: "Yes" or "No"]`,
  },
  {
    id: 'scr_004',
    title: 'Handling the "What Are Your Rates?" Objection',
    category: 'objection_handling',
    version: '1.4',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-02-28',
    tags: ['objection', 'rates', 'APR'],
    body: `Great question — I want to give you an honest answer on that. Our rates are competitive and depend on a few factors: how long you've been in business, your monthly revenue, and your credit profile. Generally, we work with businesses where rates range from [X%] to [Y%] APR. The best way to know your actual rate is to complete a quick application — it's a soft pull only, so it won't affect your credit score. Would you like to take five minutes to find out where you'd qualify?`,
  },
  {
    id: 'scr_005',
    title: 'Follow-Up Call — Application Status Check',
    category: 'follow_up',
    version: '1.1',
    approvedBy: 'Compliance Team',
    approvedAt: '2026-03-10',
    tags: ['follow-up', 'application', 'status'],
    body: `Hi [Name], this is [Advisor Name] from CapitalForge following up on your funding application from [Date]. I wanted to let you know that your application is currently [under review / in the final approval stage] and we expect a decision by [Date]. Is there anything you need from our side, or any questions I can answer while you wait? [If approved:] Great news — your application has been approved for [$ Amount]. I'd love to walk you through your options when you have a few minutes.`,
  },
  {
    id: 'scr_006',
    title: 'Voicemail Script — Compliant Drop',
    category: 'outbound_sales',
    version: '2.0',
    approvedBy: 'Legal & Compliance',
    approvedAt: '2026-02-10',
    tags: ['voicemail', 'outbound', 'TCPA'],
    body: `Hi [Name], this is [Advisor Name] from CapitalForge — our number is [Phone Number]. I'm reaching out about business funding options that may be available to [Business Name]. No obligation to respond. If you're interested in learning more, please call us at [Phone Number] or visit capitalforge.com. This message was intended for [Name], owner of [Business Name]. If you received this in error, please disregard.`,
  },
];

const PLACEHOLDER_QA_SCORES: AdvisorQAScore[] = [
  {
    advisorName: 'Jordan Mitchell',
    avatarInitials: 'JM',
    callsReviewed: 42,
    overallScore: 94,
    complianceScore: 97,
    scriptAdherenceScore: 91,
    consentCaptureScore: 95,
    lastReviewedAt: '2026-03-28',
    trend: 'up',
  },
  {
    advisorName: 'Casey Rivera',
    avatarInitials: 'CR',
    callsReviewed: 38,
    overallScore: 81,
    complianceScore: 84,
    scriptAdherenceScore: 78,
    consentCaptureScore: 80,
    lastReviewedAt: '2026-03-27',
    trend: 'flat',
  },
  {
    advisorName: 'Alex Torres',
    avatarInitials: 'AT',
    callsReviewed: 29,
    overallScore: 73,
    complianceScore: 70,
    scriptAdherenceScore: 75,
    consentCaptureScore: 68,
    lastReviewedAt: '2026-03-25',
    trend: 'down',
  },
  {
    advisorName: 'Morgan Park',
    avatarInitials: 'MP',
    callsReviewed: 51,
    overallScore: 88,
    complianceScore: 90,
    scriptAdherenceScore: 86,
    consentCaptureScore: 92,
    lastReviewedAt: '2026-03-29',
    trend: 'up',
  },
  {
    advisorName: 'Sam Delgado',
    avatarInitials: 'SD',
    callsReviewed: 14,
    overallScore: 62,
    complianceScore: 58,
    scriptAdherenceScore: 64,
    consentCaptureScore: 55,
    lastReviewedAt: '2026-03-20',
    trend: 'down',
  },
];

const ADVISOR_RECENT_CALLS: Record<string, RecentCall[]> = {
  'Jordan Mitchell': [
    { date: '2026-03-28', client: 'BlueStar LLC', score: 96, flags: 'None' },
    { date: '2026-03-25', client: 'Apex Growth', score: 92, flags: 'None' },
    { date: '2026-03-22', client: 'Vantage Corp', score: 94, flags: 'None' },
  ],
  'Casey Rivera': [
    { date: '2026-03-27', client: 'Metro Funding Co', score: 83, flags: 'Missed disclosure' },
    { date: '2026-03-24', client: 'Peak Capital', score: 79, flags: 'Script deviation' },
    { date: '2026-03-20', client: 'Harbor Inc', score: 81, flags: 'None' },
  ],
  'Alex Torres': [
    { date: '2026-03-25', client: 'Rapid Solutions', score: 71, flags: 'No consent capture' },
    { date: '2026-03-21', client: 'Summit Group', score: 68, flags: 'Banned claim used' },
    { date: '2026-03-18', client: 'Crest Financial', score: 76, flags: 'Script deviation' },
  ],
  'Morgan Park': [
    { date: '2026-03-29', client: 'Delta Partners', score: 90, flags: 'None' },
    { date: '2026-03-26', client: 'Forge Industries', score: 87, flags: 'Minor script skip' },
    { date: '2026-03-23', client: 'Nova Lending', score: 88, flags: 'None' },
  ],
  'Sam Delgado': [
    { date: '2026-03-20', client: 'Atlas Finance', score: 58, flags: 'Banned claim used' },
    { date: '2026-03-17', client: 'Iron Bridge LLC', score: 64, flags: 'No consent capture' },
    { date: '2026-03-14', client: 'Cornerstone Biz', score: 60, flags: 'Multiple violations' },
  ],
};

const CLIENTS = [
  { id: 'all', name: 'All Clients' },
  { id: 'cl_001', name: 'BlueStar LLC' },
  { id: 'cl_002', name: 'Apex Growth Partners' },
  { id: 'cl_003', name: 'Metro Funding Co' },
  { id: 'cl_004', name: 'Summit Group Holdings' },
  { id: 'cl_005', name: 'Delta Partners Inc' },
];

const ADVISORS = ['Jordan Mitchell', 'Casey Rivera', 'Alex Torres', 'Morgan Park'];
const REVIEWERS = ['Sarah Chen (QA Lead)', 'Marcus Johnson (Compliance)', 'Diana Reeves (Sr. QA)', 'Tom Nakamura (QA)'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<ScriptCategory, { label: string; color: string }> = {
  outbound_sales:    { label: 'Outbound Sales',    color: 'bg-blue-900 text-blue-300 border-blue-700' },
  objection_handling:{ label: 'Objection Handling', color: 'bg-purple-900 text-purple-300 border-purple-700' },
  disclosure:        { label: 'Disclosure',         color: 'bg-amber-900 text-amber-300 border-amber-700' },
  consent:           { label: 'Consent',            color: 'bg-green-900 text-green-300 border-green-700' },
  follow_up:         { label: 'Follow-Up',          color: 'bg-gray-800 text-gray-300 border-gray-600' },
};

// Filter chip categories for the Scripts tab
const SCRIPT_FILTER_CATEGORIES: { key: ScriptCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'outbound_sales', label: 'Outbound Sales' },
  { key: 'consent', label: 'Inbound' },
  { key: 'disclosure', label: 'Rate Discussion' },
  { key: 'objection_handling', label: 'Hardship' },
  { key: 'follow_up', label: 'Compliance' },
];

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-400';
  if (score >= 75) return 'text-yellow-400';
  if (score >= 60) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-green-900/40';
  if (score >= 75) return 'bg-yellow-900/40';
  if (score >= 60) return 'bg-orange-900/40';
  return 'bg-red-900/40';
}

function MiniScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#eab308' : score >= 60 ? '#f97316' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-800 border border-gray-700 text-gray-100 px-5 py-3 rounded-xl shadow-2xl animate-fade-in">
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Backdrop
// ---------------------------------------------------------------------------

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity badge helper for scanner
// ---------------------------------------------------------------------------

const SEV_BADGE: Record<ViolationSeverity, string> = {
  critical: 'bg-red-900 text-red-300 border-red-700',
  high: 'bg-orange-900 text-orange-300 border-orange-700',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  low: 'bg-blue-900 text-blue-300 border-blue-700',
};

// ---------------------------------------------------------------------------
// Scripts Library
// ---------------------------------------------------------------------------

function ScriptsLibrary({
  scripts,
  showToast,
}: {
  scripts: ApprovedScript[];
  showToast: (msg: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<ScriptCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = scripts;
    if (activeCategory !== 'all') list = list.filter((s) => s.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [scripts, activeCategory, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedScripts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts by title, keyword, or tag..."
            className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                       placeholder:text-gray-600 pl-9 pr-4 py-2.5 focus:outline-none
                       focus:border-brand-gold/60 transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">&#x2315;</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCRIPT_FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                activeCategory === cat.key
                  ? 'bg-brand-navy-700 border-brand-gold text-brand-gold'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">{filtered.length} of {scripts.length} scripts</p>

      <div className="space-y-2">
        {filtered.map((script) => {
          const cat = CATEGORY_CONFIG[script.category];
          const isOpen = expandedScripts.has(script.id);

          return (
            <div key={script.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3"
                onClick={() => toggleExpand(script.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cat.color}`}>
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-500">v{script.version}</span>
                      {script.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm font-semibold text-gray-100">{script.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Approved by {script.approvedBy} &middot; {formatDate(script.approvedAt)}
                    </p>
                  </div>
                  <span className="text-gray-500 text-xs flex-shrink-0 mt-1">{isOpen ? '\u25B2' : '\u25BC'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Full Script Content</p>
                  <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{script.body}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => showToast('Scanning for violations...')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-900/40 text-red-300 border border-red-700 hover:bg-red-900/60 transition-colors"
                    >
                      Scan for Violations
                    </button>
                    <button
                      onClick={() => showToast('New version submitted for review')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-700 hover:bg-blue-900/60 transition-colors"
                    >
                      Submit New Version
                    </button>
                    <button
                      onClick={() => showToast('PDF download started')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={() => showToast('Script sent to advisor')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-900/40 text-green-300 border border-green-700 hover:bg-green-900/60 transition-colors"
                    >
                      Send to Advisor
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-sm text-gray-500">No scripts match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claims Scanner (local — no API)
// ---------------------------------------------------------------------------

function ClaimsScanner() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScan = () => {
    if (!text.trim()) return;
    setResult(runLocalScan(text));
  };

  const handleClear = () => {
    setText('');
    setResult(null);
  };

  const statusConfig = {
    pass:    { label: 'PASS',    color: 'text-green-400',  bg: 'bg-green-900/30 border-green-800' },
    caution: { label: 'CAUTION', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-800' },
    fail:    { label: 'FAIL',    color: 'text-red-400',    bg: 'bg-red-900/30 border-red-800' },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Paste or type any communication text below to scan it against {BANNED_CLAIMS.length} banned claim phrases.
        The scanner checks locally — no external API calls.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type a script, email, or call note to scan for banned claims..."
        rows={6}
        className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                   placeholder:text-gray-600 px-4 py-3 resize-y focus:outline-none
                   focus:border-brand-gold/60 transition-colors"
      />

      <div className="flex gap-2">
        <button
          onClick={handleScan}
          disabled={!text.trim()}
          className="px-5 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Scan
        </button>
        <button
          onClick={handleClear}
          className="px-5 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm font-semibold border border-gray-700 hover:bg-gray-700 transition-colors"
        >
          Clear
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Overall result */}
          <div className={`rounded-xl border p-4 ${statusConfig[result.status].bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Overall Risk</span>
              <span className={`text-lg font-black ${statusConfig[result.status].color}`}>
                {statusConfig[result.status].label}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Risk Score</span>
              <span className="text-sm font-bold text-gray-200">{result.riskScore} / 100</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${result.riskScore}%`,
                  backgroundColor: result.status === 'pass' ? '#22c55e' : result.status === 'caution' ? '#eab308' : '#ef4444',
                }}
              />
            </div>
          </div>

          {/* Violations */}
          {result.violations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {result.violations.length} Violation{result.violations.length !== 1 ? 's' : ''} Found
              </p>
              {result.violations.map((v, i) => (
                <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEV_BADGE[v.severity]}`}>
                      {v.severity.toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-gray-100">Banned phrase detected</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Exact phrase: </span>
                    <span className="text-xs font-mono bg-red-950/60 text-red-300 px-2 py-0.5 rounded border border-red-800">
                      &ldquo;{v.phrase}&rdquo;
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Regulation: </span>
                    <span className="text-xs text-gray-300">{v.regulation}</span>
                  </div>
                  <div className="bg-green-950/30 border border-green-800/50 rounded-lg p-2">
                    <span className="text-xs text-green-400 font-semibold">Compliant alternative: </span>
                    <span className="text-xs text-green-300">{v.alternative}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-green-800 bg-green-950/30 p-4">
              <p className="text-sm font-semibold text-green-400">No violations detected</p>
              <p className="text-xs text-green-600 mt-1">
                This text passed all {BANNED_CLAIMS.length} banned claim checks.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QA Scorecard Table
// ---------------------------------------------------------------------------

function QAScorecardTable({
  scores,
  onAdvisorClick,
}: {
  scores: AdvisorQAScore[];
  onAdvisorClick: (advisor: AdvisorQAScore) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof AdvisorQAScore>('overallScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...scores].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [scores, sortKey, sortDir]);

  const handleSort = (key: keyof AdvisorQAScore) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ colKey, label }: { colKey: keyof AdvisorQAScore; label: string }) => (
    <th
      className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-200 transition-colors select-none whitespace-nowrap"
      onClick={() => handleSort(colKey)}
    >
      {label}
      <span className="ml-1 text-gray-600">
        {sortKey === colKey ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
      </span>
    </th>
  );

  const TREND_ICON: Record<string, string> = { up: '\u2191', down: '\u2193', flat: '\u2192' };
  const TREND_COLOR: Record<string, string> = { up: 'text-green-400', down: 'text-red-400', flat: 'text-gray-400' };

  return (
    <div className="overflow-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="bg-gray-900 border-b border-gray-800">
          <tr>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Advisor</th>
            <SortHeader colKey="overallScore"          label="Overall" />
            <SortHeader colKey="complianceScore"       label="Compliance" />
            <SortHeader colKey="scriptAdherenceScore"  label="Script Adherence" />
            <SortHeader colKey="consentCaptureScore"   label="Consent Capture" />
            <SortHeader colKey="callsReviewed"         label="Calls Reviewed" />
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Trend</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Last Review</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.advisorName}
              className={`border-t border-gray-800 transition-colors hover:bg-gray-800/40 cursor-pointer ${
                i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/60'
              }`}
              onClick={() => onAdvisorClick(row)}
            >
              {/* Advisor */}
              <td className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 h-8 w-8 rounded-full bg-brand-gold/20 text-brand-gold text-xs font-bold flex items-center justify-center">
                    {row.avatarInitials}
                  </span>
                  <span className="font-semibold text-gray-100 text-sm">{row.advisorName}</span>
                </div>
              </td>

              {/* Overall */}
              <td className="py-3 px-4">
                <div className={`inline-flex items-center justify-center h-8 w-10 rounded-lg text-sm font-black ${scoreBg(row.overallScore)} ${scoreColor(row.overallScore)}`}>
                  {row.overallScore}
                </div>
              </td>

              {/* Compliance */}
              <td className="py-3 px-4"><MiniScoreBar score={row.complianceScore} /></td>

              {/* Script Adherence */}
              <td className="py-3 px-4"><MiniScoreBar score={row.scriptAdherenceScore} /></td>

              {/* Consent Capture */}
              <td className="py-3 px-4"><MiniScoreBar score={row.consentCaptureScore} /></td>

              {/* Calls Reviewed */}
              <td className="py-3 px-4 text-gray-400 text-xs tabular-nums">{row.callsReviewed}</td>

              {/* Trend */}
              <td className="py-3 px-4">
                <span className={`text-sm font-bold ${TREND_COLOR[row.trend]}`}>
                  {TREND_ICON[row.trend]}
                </span>
              </td>

              {/* Last Review */}
              <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">{formatDate(row.lastReviewedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advisor Slide-Over
// ---------------------------------------------------------------------------

function AdvisorSlideOver({
  advisor,
  onClose,
  showToast,
}: {
  advisor: AdvisorQAScore;
  onClose: () => void;
  showToast: (msg: string) => void;
}) {
  const calls = ADVISOR_RECENT_CALLS[advisor.advisorName] || [];
  const needsRemediation = advisor.overallScore < 75;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[480px] max-w-full h-full bg-gray-950 border-l border-gray-800 overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-brand-gold/20 text-brand-gold text-lg font-bold flex items-center justify-center">
                {advisor.avatarInitials}
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">{advisor.advisorName}</h3>
                <p className="text-xs text-gray-500">{advisor.callsReviewed} calls reviewed</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>

          {/* Score Breakdown */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Score Breakdown</p>
            {[
              { label: 'Overall', score: advisor.overallScore },
              { label: 'Compliance', score: advisor.complianceScore },
              { label: 'Script Adherence', score: advisor.scriptAdherenceScore },
              { label: 'Consent Capture', score: advisor.consentCaptureScore },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{item.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.score}%`,
                        backgroundColor: item.score >= 90 ? '#22c55e' : item.score >= 75 ? '#eab308' : item.score >= 60 ? '#f97316' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${scoreColor(item.score)}`}>{item.score}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Calls */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent Calls</p>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-gray-500 font-semibold">Date</th>
                    <th className="text-left py-2 text-gray-500 font-semibold">Client</th>
                    <th className="text-left py-2 text-gray-500 font-semibold">Score</th>
                    <th className="text-left py-2 text-gray-500 font-semibold">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call, i) => (
                    <tr key={i} className="border-t border-gray-800/50">
                      <td className="py-2 text-gray-400">{formatDate(call.date)}</td>
                      <td className="py-2 text-gray-300">{call.client}</td>
                      <td className="py-2">
                        <span className={`font-bold ${scoreColor(call.score)}`}>{call.score}</span>
                      </td>
                      <td className="py-2 text-gray-500">{call.flags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons (only for <75) */}
          {needsRemediation && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Remediation Required</p>
              <button
                onClick={() => { showToast(`Remediation training assigned to ${advisor.advisorName}`); onClose(); }}
                className="w-full px-4 py-2.5 rounded-lg bg-orange-900/40 text-orange-300 border border-orange-700 text-sm font-semibold hover:bg-orange-900/60 transition-colors"
              >
                Assign Remediation Training
              </button>
              <button
                onClick={() => { showToast(`Coaching session scheduled for ${advisor.advisorName}`); onClose(); }}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-900/40 text-blue-300 border border-blue-700 text-sm font-semibold hover:bg-blue-900/60 transition-colors"
              >
                Schedule Coaching
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Trend Chart
// ---------------------------------------------------------------------------

function RiskTrendChart() {
  const points = [68, 72, 65, 78, 70, 82, 75, 88, 80, 85, 79, 90];
  const maxVal = 100;
  const w = 600;
  const h = 120;
  const padX = 20;
  const padY = 16;

  const xs = points.map((_, i) => padX + (i / (points.length - 1)) * (w - padX * 2));
  const ys = points.map((p) => h - padY - (p / maxVal) * (h - padY * 2));
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
  const areaD = `${pathD} L ${xs[xs.length - 1]} ${h - padY} L ${xs[0]} ${h - padY} Z`;

  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Communication Risk Score Trend
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">6-month rolling average across all reviewed communications</p>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-label="Risk trend chart">
          {/* Grid lines */}
          {[25, 50, 75, 100].map((val) => {
            const y = h - padY - (val / maxVal) * (h - padY * 2);
            return (
              <g key={val}>
                <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="#1f2937" strokeWidth={1} />
                <text x={padX - 4} y={y + 4} fontSize={9} fill="#4b5563" textAnchor="end">{val}</text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="#C9A84C" fillOpacity={0.06} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#C9A84C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {xs.map((x, i) => (
            <circle key={i} cx={x} cy={ys[i]} r={3} fill="#C9A84C" />
          ))}

          {/* Month labels */}
          {months.map((m, i) => {
            const segX = padX + ((i * 2 + 1) / (points.length - 1)) * (w - padX * 2);
            return (
              <text key={m} x={segX} y={h - 2} fontSize={10} fill="#6b7280" textAnchor="middle">{m}</text>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-800">
        {[
          { label: 'Avg Risk Score', value: '79', color: 'text-brand-gold' },
          { label: 'Improvement vs Prior Period', value: '+11pts', color: 'text-green-400' },
          { label: 'High-Risk Comms This Month', value: '3', color: 'text-orange-400' },
          { label: 'Scans Completed', value: '214', color: 'text-gray-300' },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <span className="text-xs text-gray-500">{stat.label}</span>
            <span className={`text-lg font-black ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'scripts' | 'scanner' | 'scorecard' | 'trends';

export default function CommCompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('scripts');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState('all');

  // QA Review Modal
  const [qaModalOpen, setQaModalOpen] = useState(false);
  const [qaAdvisor, setQaAdvisor] = useState(ADVISORS[0]);
  const [qaReviewType, setQaReviewType] = useState('Call Recording');
  const [qaCallRef, setQaCallRef] = useState('');
  const [qaReviewer, setQaReviewer] = useState(REVIEWERS[0]);
  const [qaPriority, setQaPriority] = useState('Normal');

  // Add Script Modal
  const [addScriptOpen, setAddScriptOpen] = useState(false);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptCategory, setNewScriptCategory] = useState<ScriptCategory>('outbound_sales');
  const [newScriptContent, setNewScriptContent] = useState('');

  // Advisor Slide-Over
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorQAScore | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  const avgScore = Math.round(
    PLACEHOLDER_QA_SCORES.reduce((a, s) => a + s.overallScore, 0) / PLACEHOLDER_QA_SCORES.length,
  );
  const lowScoreCount = PLACEHOLDER_QA_SCORES.filter((s) => s.overallScore < 75).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* QA Review Modal */}
      {qaModalOpen && (
        <ModalBackdrop onClose={() => setQaModalOpen(false)}>
          <div className="w-[480px] max-w-[90vw] bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Submit for QA Review</h2>
              <button onClick={() => setQaModalOpen(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Advisor</label>
                <select
                  value={qaAdvisor}
                  onChange={(e) => setQaAdvisor(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
                >
                  {ADVISORS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Review Type</label>
                <select
                  value={qaReviewType}
                  onChange={(e) => setQaReviewType(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
                >
                  {['Call Recording', 'Script Review', 'Email Review', 'Random Sample'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {qaReviewType === 'Call Recording' && (
                <div>
                  <label className="block text-xs text-gray-400 font-semibold mb-1">Call Reference</label>
                  <input
                    type="text"
                    value={qaCallRef}
                    onChange={(e) => setQaCallRef(e.target.value)}
                    placeholder="e.g. CALL-2026-03-28-001"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-brand-gold/60"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Reviewer</label>
                <select
                  value={qaReviewer}
                  onChange={(e) => setQaReviewer(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
                >
                  {REVIEWERS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Priority</label>
                <select
                  value={qaPriority}
                  onChange={(e) => setQaPriority(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
                >
                  {['Normal', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                showToast(`QA review submitted for ${qaAdvisor} (${qaReviewType}, ${qaPriority} priority)`);
                setQaModalOpen(false);
                setQaCallRef('');
              }}
              className="w-full px-4 py-2.5 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Submit
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* Add Script Modal */}
      {addScriptOpen && (
        <ModalBackdrop onClose={() => setAddScriptOpen(false)}>
          <div className="w-[520px] max-w-[90vw] bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add New Script</h2>
              <button onClick={() => setAddScriptOpen(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Script Name</label>
                <input
                  type="text"
                  value={newScriptName}
                  onChange={(e) => setNewScriptName(e.target.value)}
                  placeholder="e.g. New Client Onboarding Call"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 placeholder:text-gray-600 focus:outline-none focus:border-brand-gold/60"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Category</label>
                <select
                  value={newScriptCategory}
                  onChange={(e) => setNewScriptCategory(e.target.value as ScriptCategory)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
                >
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Content</label>
                <textarea
                  value={newScriptContent}
                  onChange={(e) => setNewScriptContent(e.target.value)}
                  placeholder="Type or paste the full script content..."
                  rows={6}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2 placeholder:text-gray-600 resize-y focus:outline-none focus:border-brand-gold/60"
                />
              </div>
            </div>

            <button
              onClick={() => {
                showToast(`Script "${newScriptName || 'Untitled'}" saved as draft`);
                setAddScriptOpen(false);
                setNewScriptName('');
                setNewScriptCategory('outbound_sales');
                setNewScriptContent('');
              }}
              className="w-full px-4 py-2.5 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Save as Draft
            </button>
          </div>
        </ModalBackdrop>
      )}

      {/* Advisor Slide-Over */}
      {selectedAdvisor && (
        <AdvisorSlideOver
          advisor={selectedAdvisor}
          onClose={() => setSelectedAdvisor(null)}
          showToast={showToast}
        />
      )}

      {/* Client Selector */}
      <div className="mb-4">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:border-brand-gold/60"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Communication Compliance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {PLACEHOLDER_SCRIPTS.length} approved scripts &middot; {PLACEHOLDER_QA_SCORES.length} advisors scored
            {lowScoreCount > 0 && (
              <span className="ml-2 text-orange-400 font-semibold">
                &#9888; {lowScoreCount} advisor{lowScoreCount !== 1 ? 's' : ''} below threshold
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAddScriptOpen(true)}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-100 text-sm font-bold border border-gray-700 hover:bg-gray-700 transition-colors"
          >
            + Add Script
          </button>
          <button
            onClick={() => setQaModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Submit for QA Review
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Approved Scripts',   value: PLACEHOLDER_SCRIPTS.length, color: 'text-gray-100' },
          { label: 'Team Avg Score',     value: `${avgScore}%`,             color: avgScore >= 85 ? 'text-green-400' : avgScore >= 70 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Below Threshold',    value: lowScoreCount,              color: lowScoreCount > 0 ? 'text-orange-400' : 'text-gray-400' },
          { label: 'Scans This Month',   value: 214,                        color: 'text-brand-gold' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800 overflow-x-auto">
        {([
          { key: 'scripts',   label: 'Scripts Library' },
          { key: 'scanner',   label: 'Claims Scanner' },
          { key: 'scorecard', label: 'QA Scorecard' },
          { key: 'trends',    label: 'Risk Trends' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Scripts Library */}
      {activeTab === 'scripts' && (
        <ScriptsLibrary scripts={PLACEHOLDER_SCRIPTS} showToast={showToast} />
      )}

      {/* Tab: Claims Scanner (local) */}
      {activeTab === 'scanner' && (
        <ClaimsScanner />
      )}

      {/* Tab: QA Scorecard */}
      {activeTab === 'scorecard' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              Click any advisor row to view details. Scores below 75 indicate remediation required.
            </p>
            <div className="flex gap-2">
              {[
                { color: 'bg-green-400', label: '\u226590 Excellent' },
                { color: 'bg-yellow-400', label: '75\u201389 Good' },
                { color: 'bg-orange-400', label: '60\u201374 At Risk' },
                { color: 'bg-red-400', label: '<60 Critical' },
              ].map((leg) => (
                <div key={leg.label} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${leg.color}`} />
                  <span className="text-xs text-gray-500">{leg.label}</span>
                </div>
              ))}
            </div>
          </div>
          <QAScorecardTable
            scores={PLACEHOLDER_QA_SCORES}
            onAdvisorClick={(advisor) => setSelectedAdvisor(advisor)}
          />
        </div>
      )}

      {/* Tab: Risk Trends */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <RiskTrendChart />
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
              Risk Distribution by Category
            </h3>
            <div className="space-y-3">
              {[
                { category: 'Approval Language',   count: 28, pct: 38, color: '#ef4444' },
                { category: 'Rate & APR Claims',   count: 19, pct: 26, color: '#f97316' },
                { category: 'Pre-Approval Language', count: 12, pct: 16, color: '#eab308' },
                { category: 'Timing Claims',        count: 8,  pct: 11, color: '#C9A84C' },
                { category: 'Risk Disclosures',     count: 7,  pct:  9, color: '#6b7280' },
              ].map((row) => (
                <div key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{row.category}</span>
                    <span className="text-gray-500">{row.count} flags ({row.pct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

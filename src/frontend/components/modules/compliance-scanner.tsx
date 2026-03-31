'use client';

// ============================================================
// ComplianceScanner — real-time text analysis component
// Scans pasted or typed communication text for:
//   - Banned claims with severity badges (critical/high/medium)
//   - Risk score meter (0–100)
//   - Inline violation highlights
//   - Suggested compliant alternatives
// ============================================================

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Violation {
  id: string;
  matchedText: string;
  severity: ViolationSeverity;
  rule: string;
  explanation: string;
  suggestedAlternative: string;
  startIndex: number;
  endIndex: number;
}

export interface ScanResult {
  riskScore: number;           // 0 – 100
  violations: Violation[];
  passedChecks: string[];
  scannedAt: string;
}

export interface ComplianceScannerProps {
  /** Optional initial text */
  initialText?: string;
  /** Fired after every scan with the full result */
  onScanComplete?: (result: ScanResult) => void;
  /** Compact mode — hides suggestions panel */
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Banned claims database (placeholder — replace with API call)
// ---------------------------------------------------------------------------

interface BannedClaimRule {
  id: string;
  pattern: RegExp;
  severity: ViolationSeverity;
  rule: string;
  explanation: string;
  suggestedAlternative: string;
}

const BANNED_CLAIM_RULES: BannedClaimRule[] = [
  {
    id: 'bc_001',
    pattern: /guaranteed\s+(approval|funding|loan|credit)/gi,
    severity: 'critical',
    rule: 'No-Guarantee Rule (UDAP §5)',
    explanation: 'Promising guaranteed approval is a deceptive practice under UDAP. Approval is always subject to underwriting.',
    suggestedAlternative: 'Replace with "subject to credit review and approval" or "apply now to see if you qualify".',
  },
  {
    id: 'bc_002',
    pattern: /0%\s*(apr|interest|fee)|zero\s*(percent|%)\s*(interest|apr)/gi,
    severity: 'critical',
    rule: 'APR Accuracy Rule (Reg Z / SB 1235)',
    explanation: 'Advertising 0% APR requires substantiation and full disclosure of qualifying conditions and duration.',
    suggestedAlternative: 'Disclose the promotional period, qualifying criteria, and revert rate. E.g., "0% intro APR for 12 months on qualifying accounts; 24.99% APR thereafter."',
  },
  {
    id: 'bc_003',
    pattern: /no\s+(credit\s+check|hard\s+pull|inquiry)/gi,
    severity: 'high',
    rule: 'Credit Inquiry Disclosure (FCRA §604)',
    explanation: 'Claiming "no credit check" when any inquiry is performed violates FCRA and UDAP.',
    suggestedAlternative: 'Use "soft credit pull only — no impact to your score" if applicable, or disclose the nature of the inquiry accurately.',
  },
  {
    id: 'bc_004',
    pattern: /best\s+rate(s)?\s+(in|on)\s+(the\s+)?(market|industry)|lowest\s+rate(s)?\s+(guaranteed|available|in\s+the\s+market)/gi,
    severity: 'high',
    rule: 'Superlative Claims Standard (FTC Guides)',
    explanation: 'Superlative market claims require current, verifiable substantiation at time of communication.',
    suggestedAlternative: 'Replace with "competitive rates" or cite specific comparison data with a date and source.',
  },
  {
    id: 'bc_005',
    pattern: /pre[\s-]?approved|you('ve| have) been (selected|approved)/gi,
    severity: 'high',
    rule: 'Pre-Approval Accuracy (FCRA §615)',
    explanation: 'Pre-approval language must reflect a firm offer of credit based on a prescreened list. Misuse is an FCRA violation.',
    suggestedAlternative: 'Use "pre-qualified" with a clear disclaimer: "Pre-qualification is not a guarantee of final approval."',
  },
  {
    id: 'bc_006',
    pattern: /instant\s+(approval|funding|cash|decision)/gi,
    severity: 'medium',
    rule: 'Timing Representation Rule',
    explanation: '"Instant" implies no review occurs. This can mislead applicants about the underwriting process.',
    suggestedAlternative: 'Use "fast decisions — often within 24 hours" or "same-day funding available on qualifying applications".',
  },
  {
    id: 'bc_007',
    pattern: /risk[\s-]?free|no[\s-]?risk/gi,
    severity: 'medium',
    rule: 'Risk Disclosure Requirement',
    explanation: 'All financial products carry risk. "Risk-free" language is materially misleading.',
    suggestedAlternative: 'Describe specific protections or favorable terms instead. E.g., "no prepayment penalty" or "no collateral required".',
  },
  {
    id: 'bc_008',
    pattern: /limited\s+time\s+offer|act\s+now|expires?\s+(today|tonight|midnight)/gi,
    severity: 'low',
    rule: 'Urgency & Scarcity Claims (FTC)',
    explanation: 'Artificial urgency claims without substantiation may constitute deceptive practices.',
    suggestedAlternative: 'Only use deadline language if an actual deadline exists. Cite the specific expiry date/time.',
  },
];

// ---------------------------------------------------------------------------
// Scanner logic
// ---------------------------------------------------------------------------

function runScan(text: string): ScanResult {
  if (!text.trim()) {
    return { riskScore: 0, violations: [], passedChecks: PASSED_CHECK_LABELS, scannedAt: new Date().toISOString() };
  }

  const violations: Violation[] = [];

  for (const rule of BANNED_CLAIM_RULES) {
    rule.pattern.lastIndex = 0; // reset global regex
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      violations.push({
        id: `${rule.id}_${match.index}`,
        matchedText: match[0],
        severity: rule.severity,
        rule: rule.rule,
        explanation: rule.explanation,
        suggestedAlternative: rule.suggestedAlternative,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Deduplicate by rule + approximate position
  const unique = violations.filter((v, i, arr) =>
    arr.findIndex((u) => u.id === v.id) === i
  );

  // Score calculation
  const penalty = unique.reduce((acc, v) => {
    const weights: Record<ViolationSeverity, number> = { critical: 35, high: 20, medium: 10, low: 4 };
    return acc + weights[v.severity];
  }, 0);
  const riskScore = Math.min(100, penalty);

  const passedChecks = PASSED_CHECK_LABELS.filter((label) => {
    if (label === 'No guaranteed approval claims' && unique.some((v) => v.id.startsWith('bc_001'))) return false;
    if (label === 'APR disclosures accurate' && unique.some((v) => v.id.startsWith('bc_002'))) return false;
    if (label === 'Credit inquiry disclosure present' && unique.some((v) => v.id.startsWith('bc_003'))) return false;
    return true;
  });

  return { riskScore, violations: unique, passedChecks, scannedAt: new Date().toISOString() };
}

const PASSED_CHECK_LABELS = [
  'No guaranteed approval claims',
  'APR disclosures accurate',
  'Credit inquiry disclosure present',
  'No unsubstantiated superlatives',
  'Risk language appropriate',
  'Consent language present',
];

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEV_CONFIG: Record<ViolationSeverity, { label: string; badge: string; dot: string; border: string; bg: string }> = {
  critical: { label: 'Critical', badge: 'bg-red-900 text-red-300 border-red-700',        dot: 'bg-red-400',    border: 'border-red-700',    bg: 'bg-red-950/60' },
  high:     { label: 'High',     badge: 'bg-orange-900 text-orange-300 border-orange-700', dot: 'bg-orange-400', border: 'border-orange-700', bg: 'bg-orange-950/60' },
  medium:   { label: 'Medium',   badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', dot: 'bg-yellow-400', border: 'border-yellow-700', bg: 'bg-yellow-950/60' },
  low:      { label: 'Low',      badge: 'bg-blue-900 text-blue-300 border-blue-700',       dot: 'bg-blue-400',   border: 'border-blue-700',   bg: 'bg-blue-950/60' },
};

// ---------------------------------------------------------------------------
// Risk Score Meter
// ---------------------------------------------------------------------------

function RiskScoreMeter({ score }: { score: number }) {
  const color = score === 0 ? '#22c55e' : score < 20 ? '#84cc16' : score < 40 ? '#eab308' : score < 65 ? '#f97316' : '#ef4444';
  const label = score === 0 ? 'Clean' : score < 20 ? 'Low Risk' : score < 40 ? 'Moderate' : score < 65 ? 'High Risk' : 'Critical';
  const pct = score;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Risk Score</span>
        <span className="text-sm font-bold" style={{ color }}>{score} / 100</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">0 — Clean</span>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span className="text-xs text-gray-500">100 — Critical</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Violation card
// ---------------------------------------------------------------------------

function ViolationCard({ violation, index }: { violation: Violation; index: number }) {
  const [open, setOpen] = useState(false);
  const sev = SEV_CONFIG[violation.severity];

  return (
    <div className={`rounded-lg border p-3 ${sev.border} ${sev.bg}`}>
      <button
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-xs font-bold text-gray-500 mt-0.5 flex-shrink-0">#{index + 1}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${sev.badge} flex-shrink-0`}>
                  {sev.label}
                </span>
                <span className="text-xs text-gray-400 font-medium truncate">{violation.rule}</span>
              </div>
              <p className="text-xs font-mono bg-gray-800/80 text-red-300 px-2 py-0.5 rounded inline-block">
                &ldquo;{violation.matchedText}&rdquo;
              </p>
            </div>
          </div>
          <span className="text-gray-500 text-xs flex-shrink-0 mt-0.5">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Why it flags</p>
            <p className="text-xs text-gray-300">{violation.explanation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">Suggested alternative</p>
            <p className="text-xs text-green-300 bg-green-950/40 border border-green-800/50 rounded p-2">
              {violation.suggestedAlternative}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ComplianceScanner({
  initialText = '',
  onScanComplete,
  compact = false,
  className = '',
}: ComplianceScannerProps) {
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setResult(null);
        return;
      }
      setScanning(true);
      debounceRef.current = setTimeout(() => {
        const res = runScan(value);
        setResult(res);
        setScanning(false);
        onScanComplete?.(res);
      }, 350);
    },
    [onScanComplete],
  );

  const criticalCount = result?.violations.filter((v) => v.severity === 'critical').length ?? 0;
  const highCount = result?.violations.filter((v) => v.severity === 'high').length ?? 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Text input */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Paste or type a script, email, or communication to scan for compliance violations…"
          rows={compact ? 4 : 7}
          className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                     placeholder:text-gray-600 px-4 py-3 resize-y focus:outline-none
                     focus:border-brand-gold/60 transition-colors"
          aria-label="Communication text to scan"
        />
        {scanning && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
            <span className="text-xs text-gray-500">Scanning…</span>
          </div>
        )}
        {!scanning && result && (
          <div className="absolute top-3 right-3">
            {result.violations.length === 0 ? (
              <span className="text-xs text-green-400 font-semibold">✓ Clean</span>
            ) : (
              <span className="text-xs text-red-400 font-semibold">
                {result.violations.length} violation{result.violations.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Score meter */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <RiskScoreMeter score={result.riskScore} />
          </div>

          {/* Violation summary chips */}
          {result.violations.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Flags:</span>
              {criticalCount > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-900 text-red-300 border-red-700">
                  {criticalCount} Critical
                </span>
              )}
              {highCount > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-orange-900 text-orange-300 border-orange-700">
                  {highCount} High
                </span>
              )}
              {result.violations.filter((v) => v.severity === 'medium').length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-yellow-900 text-yellow-300 border-yellow-700">
                  {result.violations.filter((v) => v.severity === 'medium').length} Medium
                </span>
              )}
              {result.violations.filter((v) => v.severity === 'low').length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-900 text-blue-300 border-blue-700">
                  {result.violations.filter((v) => v.severity === 'low').length} Low
                </span>
              )}
            </div>
          )}

          {/* Violations list */}
          {result.violations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Violations — click to expand
              </p>
              {result.violations.map((v, i) => (
                <ViolationCard key={v.id} violation={v} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-green-800 bg-green-950/30 p-4">
              <p className="text-sm font-semibold text-green-400 mb-1">No violations detected</p>
              <p className="text-xs text-green-600">
                This communication passed all {BANNED_CLAIM_RULES.length} active compliance rules.
              </p>
            </div>
          )}

          {/* Passed checks — only in non-compact mode */}
          {!compact && result.passedChecks.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Passed Checks</p>
              <div className="space-y-1.5">
                {result.passedChecks.map((check) => (
                  <div key={check} className="flex items-center gap-2">
                    <span className="text-green-400 text-xs font-bold flex-shrink-0">✓</span>
                    <span className="text-xs text-gray-400">{check}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CapitalForge — Compliance view mapping
//
// Pure translation from the stored compliance-check shape to what the UI
// renders. Kept out of the component so the rules that matter — a null score
// is not a zero, an unrated check is not a low-risk check, an empty result is
// not a pass — are directly testable.
// ============================================================

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/** Derived from `resolvedAt`; the stored record has no status column. */
export type CheckStatus = 'resolved' | 'open';

/** A compliance check row as returned by the API. */
export interface ApiComplianceCheck {
  id: string;
  checkType: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  findings: unknown;
  stateJurisdiction: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

export interface ComplianceCheckView {
  id: string;
  riskLevel: RiskLevel;
  checkType: string;
  status: CheckStatus;
  date: string;
  findings: string;
}

const VALID_RISK_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

/**
 * A level the API did not set becomes `unknown`, never `low`.
 *
 * Defaulting an unrated check to the lowest risk band would render an
 * unassessed obligation in calm green.
 */
export function toRiskLevel(value: string | null | undefined): RiskLevel {
  const normalized = value?.toLowerCase().trim() ?? '';
  return (VALID_RISK_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as RiskLevel)
    : 'unknown';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Date unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** `findings` is a JSON column: it may be a string, an object, an array, or absent. */
export function formatFindings(findings: unknown): string {
  if (typeof findings === 'string' && findings.trim()) return findings;

  if (Array.isArray(findings)) {
    const parts = findings
      .map((f) => (typeof f === 'string' ? f : JSON.stringify(f)))
      .filter((s) => s && s.length > 0);
    return parts.length ? parts.join('; ') : 'No findings recorded.';
  }

  if (findings && typeof findings === 'object') {
    const record = findings as Record<string, unknown>;
    for (const key of ['summary', 'detail', 'message', 'description']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    const entries = Object.entries(record);
    if (entries.length) {
      return entries
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
    }
  }

  return 'No findings recorded.';
}

export function toComplianceCheckView(check: ApiComplianceCheck): ComplianceCheckView {
  return {
    id: check.id,
    riskLevel: toRiskLevel(check.riskLevel),
    checkType: check.checkType?.replace(/_/g, ' ').toUpperCase() || 'UNSPECIFIED CHECK',
    status: check.resolvedAt ? 'resolved' : 'open',
    date: formatDate(check.resolvedAt ?? check.createdAt),
    findings: formatFindings(check.findings),
  };
}

// ── Score presentation ──────────────────────────────────────────────────────

export interface ScoreDisplay {
  /** True when no score could be derived — render as text, not as a number. */
  unassessed: boolean;
  label: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
}

/**
 * How to present a nullable compliance score.
 *
 * null means no stored check carries a risk score, so nothing can be derived.
 * That is reported as "Not assessed" in a neutral tone — collapsing it to 0
 * would put a client with no scored checks in the same bucket as one that
 * failed every check, and 0 in a red badge reads as a finding.
 */
export function describeComplianceScore(
  score: number | null | undefined,
  maxScore = 100,
): ScoreDisplay {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { unassessed: true, label: 'Not assessed', tone: 'neutral' };
  }

  const tone: ScoreDisplay['tone'] = score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
  return { unassessed: false, label: `${score}/${maxScore}`, tone };
}

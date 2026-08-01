// ============================================================
// CapitalForge — Communication compliance mapping
//
// The page called nothing. Its worst fixture was a QA scorecard naming four
// advisors and scoring them:
//
//   Alex Torres   compliance 70   script adherence 75   consent 68   ↓
//   Casey Rivera  compliance 84   script adherence 78   consent 80   →
//
// That is a performance record about a named person. Nobody scored those
// calls. Beside it were five approved scripts with approvers written in, a
// list of reviewers with job titles, and a banned-claims scanner that ran a
// regex in the browser.
//
// The real ones:
//   POST /api/comm-compliance/scan      — server-side scan, per channel
//   GET  /api/scripts                   — the script library
//   GET  /api/advisors/:id/qa-scores    — scored calls for one advisor
//
// QA scores are recorded per call, not as an advisor average, and there is
// no endpoint that lists advisors — so a team scorecard cannot be assembled
// at all. What can be shown is one advisor's scored calls, given their id.
// ============================================================

export type Channel = 'voice' | 'email' | 'sms' | 'chat' | 'document';

export const CHANNELS: Channel[] = ['voice', 'email', 'sms', 'chat', 'document'];

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ScanViolation {
  claimId: string;
  category: string;
  label: string;
  /** The text that matched, as the scanner found it. */
  evidence: string;
  position: number | null;
  severityWeight: number | null;
  /** The statute or rule. Real law, unlike the enforcement examples. */
  legalCitation: string | null;
  compliantAlternative: string | null;
}

export interface ScanResult {
  scanId: string;
  channel: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
  violations: ScanViolation[];
}

export interface ScriptRow {
  id: string;
  name: string;
  category: string;
  version: string;
  content: string;
  isActive: boolean;
  /** Null when nobody has approved it — never a role name standing in. */
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
}

export interface QaScoreRow {
  id: string;
  advisorId: string;
  /** Null when the score is not tied to a recorded call. */
  callRecordId: string | null;
  overallScore: number;
  complianceScore: number | null;
  scriptAdherence: number | null;
  consentCapture: number | null;
  riskClaimAvoidance: number | null;
  feedback: string | null;
  scoredAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const RISK_LEVELS = new Set<string>(['low', 'medium', 'high', 'critical']);

export function toRiskLevel(raw: unknown): RiskLevel {
  const s = (str(raw) ?? '').toLowerCase();
  // Unrecognised becomes 'critical', not 'low'. On a scan of what an advisor
  // is about to say, the safe direction to be wrong is toward review.
  return RISK_LEVELS.has(s) ? (s as RiskLevel) : 'critical';
}

export function toScanResult(data: unknown): ScanResult | null {
  const d = asRecord(data);
  const scanId = str(d['scanId']);
  if (scanId === null) return null;

  const violations = Array.isArray(d['violations'])
    ? d['violations'].flatMap((entry) => {
        const v = asRecord(entry);
        const label = str(v['label']);
        if (label === null) return [];
        return [
          {
            claimId: str(v['claimId']) ?? '',
            category: str(v['category']) ?? 'unclassified',
            label,
            evidence: str(v['evidence']) ?? '',
            position: num(v['position']),
            severityWeight: num(v['severityWeight']),
            legalCitation: str(v['legalCitation']),
            compliantAlternative: str(v['compliantAlternative']),
            // enforcementExample is deliberately not carried. The scanner's
            // reference table cites enforcement actions — one of them against
            // "Pinnacle Business Capital", which appears elsewhere in this
            // codebase as an explicitly stubbed vendor. Putting invented
            // precedent in front of an advisor as the reason their wording is
            // flagged is the thing this page was being repaired for.
          },
        ];
      })
    : [];

  return {
    scanId,
    channel: str(d['channel']) ?? 'unknown',
    riskScore: num(d['riskScore']),
    riskLevel: toRiskLevel(d['riskLevel']),
    violations,
  };
}

export function toScriptRow(row: unknown): ScriptRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  // The endpoint nests the text and its approval under currentVersion.
  const current = asRecord(r['currentVersion']);

  return {
    id,
    name: str(r['name']) ?? 'Untitled script',
    category: str(r['category']) ?? 'uncategorised',
    version: str(current['version']) ?? '—',
    content: str(current['content']) ?? '',
    isActive: current['isActive'] === true,
    approvedBy: str(current['approvedBy']),
    approvedAt: str(current['approvedAt']),
    updatedAt: str(r['updatedAt']),
  };
}

export function toScriptRows(data: unknown): ScriptRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list.map((row) => toScriptRow(row)).filter((row): row is ScriptRow => row !== null);
}

export function toQaScoreRows(data: unknown): QaScoreRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const id = str(e['id']);
    const overall = num(e['overallScore']);
    // A QA row with no overall score is not a zero-scored call.
    if (id === null || overall === null) return [];

    return [
      {
        id,
        advisorId: str(e['advisorId']) ?? '',
        callRecordId: str(e['callRecordId']),
        overallScore: overall,
        complianceScore: num(e['complianceScore']),
        scriptAdherence: num(e['scriptAdherence']),
        consentCapture: num(e['consentCapture']),
        riskClaimAvoidance: num(e['riskClaimAvoidance']),
        feedback: str(e['feedback']),
        scoredAt: str(e['scoredAt']),
      },
    ];
  });
}

// ── Derived ─────────────────────────────────────────────────

export interface ScriptSummary {
  total: number;
  /** Scripts in use with no recorded approver. */
  unapproved: number;
}

export function summariseScripts(rows: ScriptRow[]): ScriptSummary {
  return {
    total: rows.length,
    unapproved: rows.filter((r) => r.approvedBy === null).length,
  };
}

export interface QaSummary {
  scored: number;
  /** Mean of the overall scores. Null when nothing has been scored. */
  averageOverall: number | null;
  /** The most recent scoring date, or null. */
  lastScoredAt: string | null;
}

/**
 * An advisor's scored calls, summarised.
 *
 * This is an average of the calls that were reviewed — not of an advisor's
 * work. The page used to show a call count and a trend arrow beside a single
 * headline number, which reads as a standing rating of the person.
 */
export function summariseQaScores(rows: QaScoreRow[]): QaSummary {
  if (rows.length === 0) {
    return { scored: 0, averageOverall: null, lastScoredAt: null };
  }

  const dates = rows
    .map((r) => r.scoredAt)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    scored: rows.length,
    averageOverall: Math.round(
      rows.reduce((sum, r) => sum + r.overallScore, 0) / rows.length,
    ),
    lastScoredAt: dates.length === 0 ? null : dates[dates.length - 1],
  };
}

/** Newest first. */
export function byScoredAtDesc(rows: QaScoreRow[]): QaScoreRow[] {
  return [...rows].sort((a, b) => {
    if (a.scoredAt === null && b.scoredAt === null) return 0;
    if (a.scoredAt === null) return 1;
    if (b.scoredAt === null) return -1;
    return b.scoredAt.localeCompare(a.scoredAt);
  });
}

/** The distinct categories present, for filter controls. */
export function scriptCategories(rows: ScriptRow[]): string[] {
  return [...new Set(rows.map((r) => r.category))].sort();
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

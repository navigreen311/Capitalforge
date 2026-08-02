// ============================================================
// compliance-overview-view — /compliance reads compliance_checks
//
// The page held ten findings as literals, against businesses that do not
// exist: "NY disclosure deadline missed — immediate filing required" for Apex
// Ventures LLC, "Affiliated vendor on CFPB enforcement watch list" for Blue
// Ridge Consulting, KYB gaps for Horizon Retail Partners. It scored them into
// a six-component breakdown, named a top priority — "File the 2 overdue state
// disclosures (+10 points)" — and listed quick wins naming more businesses
// that do not exist.
//
// GET /api/compliance/overview reads compliance_checks and has done all
// along. The rule this file holds: a compliance score is a statement about a
// regulated firm's exposure, and it is null until checks have run. Absence of
// evidence is not a clean bill of health.
// ============================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceCheckView {
  id: string;
  checkType: string;
  businessName: string;
  riskLevel: RiskLevel;
  passed: boolean;
  findings: string;
  checkedAt: string;
}

export interface RiskDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ComplianceOverviewView {
  /** Null until checks have run. Never a default of 100. */
  score: number | null;
  total: number;
  passed: number;
  failed: number;
  critical: number;
  riskDistribution: RiskDistribution;
  checks: ComplianceCheckView[];
  /** False until a response has been read. */
  loaded: boolean;
}

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export const EMPTY_OVERVIEW: ComplianceOverviewView = {
  score: null,
  total: 0,
  passed: 0,
  failed: 0,
  critical: 0,
  riskDistribution: { critical: 0, high: 0, medium: 0, low: 0 },
  checks: [],
  loaded: false,
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function riskLevel(value: unknown): RiskLevel | null {
  return typeof value === 'string' && (RISK_LEVELS as string[]).includes(value)
    ? (value as RiskLevel)
    : null;
}

/** Maps GET /api/compliance/overview. */
export function toComplianceOverview(data: unknown): ComplianceOverviewView {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (root === null) return EMPTY_OVERVIEW;

  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rawChecks = Array.isArray(body['checks']) ? (body['checks'] as unknown[]) : null;
  // No checks key at all means nothing was read, which is not the same as a
  // tenant with no checks on record.
  if (rawChecks === null) return EMPTY_OVERVIEW;

  const checks: ComplianceCheckView[] = rawChecks.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const c = raw as Record<string, unknown>;
    const id = str(c['id']);
    const level = riskLevel(c['riskLevel']);
    // A check with no risk level recorded is not a passing check, and
    // guessing one would be inventing the assessment this file exists to stop.
    if (id === null || level === null) return [];

    return [
      {
        id,
        checkType: str(c['checkType']) ?? 'unknown',
        businessName: str(c['businessName']) ?? 'unassigned',
        riskLevel: level,
        passed: c['passed'] === true,
        findings: str(c['findings']) ?? '',
        checkedAt: str(c['checkedAt']) ?? '',
      },
    ];
  });

  const rawDist = body['riskDistribution'] && typeof body['riskDistribution'] === 'object'
    ? (body['riskDistribution'] as Record<string, unknown>)
    : {};

  return {
    // Deliberately not defaulted. The endpoint returns null when no check has
    // run, and a page showing 100 there tells a firm it is fully compliant on
    // the strength of never having looked.
    score: num(body['score']),
    total: num(body['total']) ?? checks.length,
    passed: num(body['passed']) ?? checks.filter((c) => c.passed).length,
    failed: num(body['failed']) ?? checks.filter((c) => !c.passed).length,
    critical: num(body['critical']) ?? checks.filter((c) => c.riskLevel === 'critical').length,
    riskDistribution: {
      critical: num(rawDist['critical']) ?? 0,
      high: num(rawDist['high']) ?? 0,
      medium: num(rawDist['medium']) ?? 0,
      low: num(rawDist['low']) ?? 0,
    },
    checks,
    loaded: true,
  };
}

/**
 * Share of checks at a risk level, as a percentage.
 *
 * Null when there are no checks: 0% would state that no check is critical,
 * which is a finding, rather than that nothing has been assessed.
 */
export function riskShare(count: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((count / total) * 100);
}

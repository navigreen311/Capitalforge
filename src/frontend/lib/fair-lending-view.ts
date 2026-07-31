// ============================================================
// CapitalForge — Section 1071 / fair lending mapping
//
// The dashboard carried ten hardcoded demographic buckets — approval rates by
// race, gender and ownership, with a fifteen-point gap between White
// (Non-Hispanic) at 71% and Black or African American at 56% — while the
// fair_lending_records table was empty and the API reported
// totalApplications: 0, recordsWithDemographics: 0.
//
// Both readings of that are bad. Taken as real it shows a disparity that is
// not happening, which is grounds for a self-report that is not warranted.
// And because the numbers were fixed, a tenant with a genuine disparity saw
// exactly the same screen — the monitoring surface could not detect the thing
// it exists to detect.
//
// Alongside it: an adverse action table with a noticeDelivered flag for a
// column that exists nowhere in the schema, and a per-field completeness
// breakdown with no source.
//
// What the API does return is mapped here. What it deliberately does not —
// demographics broken down by outcome — is not reconstructed. That absence is
// the Regulation B firewall working: getAdverseActionReport excludes
// demographic data by design, and per-record access runs through a separate
// audit-logged endpoint.
// ============================================================

/** Action taken on the application, in CFPB 1071 terms. */
export type ActionTaken =
  | 'approved_and_originated'
  | 'approved_not_accepted'
  | 'denied'
  | 'withdrawn_by_applicant'
  | 'incomplete';

export type CoverageStatus = 'below_threshold' | 'approaching_threshold' | '1071_triggered';

export interface FairLendingDashboard {
  reportingYear: number;
  totalApplications: number;
  /**
   * Null when no applications fall in the year. The API sends 0, which on a
   * fair lending surface reads as "nothing was approved" rather than "nothing
   * was decided".
   */
  approvalRate: number | null;
  denialRate: number | null;
  withdrawalRate: number | null;
  applicationsByPurpose: { label: string; count: number }[];
  actionsByType: { action: ActionTaken | string; count: number }[];
  topAdverseReasons: { reason: string; count: number }[];
  coverageStatus: CoverageStatus;
  coverageThreshold: number;
  recordsWithDemographics: number;
  /** Null on an empty year, for the same reason as the rates. */
  demographicCompletionRate: number | null;
}

export interface CoverageCheck {
  year: number;
  applicationCount: number;
  threshold: number;
  triggered: boolean;
  percentToThreshold: number;
}

export interface AdverseActionRow {
  recordId: string;
  applicationId: string | null;
  actionDate: string | null;
  actionTaken: string;
  adverseReasons: string[];
  creditPurpose: string | null;
  businessType: string | null;
  isFirewalled: boolean;
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

const COVERAGE: Record<string, CoverageStatus> = {
  below_threshold: 'below_threshold',
  approaching_threshold: 'approaching_threshold',
  '1071_triggered': '1071_triggered',
};

/** Turn a counts object into sorted rows, largest first. */
function toCounts(value: unknown): { key: string; count: number }[] {
  return Object.entries(asRecord(value))
    .map(([key, raw]) => ({ key, count: num(raw) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  return key
    .split('_')
    .filter((part) => part !== '')
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export function toFairLendingDashboard(data: unknown): FairLendingDashboard | null {
  const d = asRecord(data);
  const total = num(d['totalApplications']);
  const year = num(d['reportingYear']);
  if (total === null || year === null) return null;

  // A rate over no applications is not 0% — it does not exist. On this page
  // that distinction is the difference between "we approved none of them" and
  // "there were none to approve".
  const rate = (value: unknown): number | null => (total === 0 ? null : num(value));

  return {
    reportingYear: year,
    totalApplications: total,
    approvalRate: rate(d['approvalRate']),
    denialRate: rate(d['denialRate']),
    withdrawalRate: rate(d['withdrawalRate']),
    applicationsByPurpose: toCounts(d['applicationsByPurpose']).map((row) => ({
      label: humanise(row.key),
      count: row.count,
    })),
    actionsByType: toCounts(d['actionsByType']).map((row) => ({
      action: row.key,
      count: row.count,
    })),
    topAdverseReasons: Array.isArray(d['topAdverseReasons'])
      ? d['topAdverseReasons'].flatMap((entry) => {
          const e = asRecord(entry);
          const reason = str(e['reason']);
          return reason === null ? [] : [{ reason, count: num(e['count']) ?? 0 }];
        })
      : [],
    coverageStatus: COVERAGE[str(d['coverageStatus']) ?? ''] ?? 'below_threshold',
    coverageThreshold: num(d['coverageThreshold']) ?? 0,
    recordsWithDemographics: num(d['recordsWithDemographics']) ?? 0,
    demographicCompletionRate: rate(d['demographicCompletionRate']),
  };
}

export function toCoverageCheck(data: unknown): CoverageCheck | null {
  const d = asRecord(data);
  const count = num(d['applicationCount']);
  const threshold = num(d['threshold']);
  if (count === null || threshold === null) return null;

  return {
    year: num(d['year']) ?? new Date().getFullYear(),
    applicationCount: count,
    threshold,
    triggered: d['triggered'] === true,
    percentToThreshold: num(d['percentToThreshold']) ?? 0,
  };
}

export function toAdverseActionRows(data: unknown): AdverseActionRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const e = asRecord(entry);
    const id = str(e['recordId']);
    if (id === null) return [];
    return [
      {
        recordId: id,
        applicationId: str(e['applicationId']),
        actionDate: str(e['actionDate']),
        actionTaken: str(e['actionTaken']) ?? 'unknown',
        adverseReasons: Array.isArray(e['adverseReasons'])
          ? e['adverseReasons'].filter((r): r is string => typeof r === 'string')
          : [],
        creditPurpose: str(e['creditPurpose']),
        businessType: str(e['businessType']),
        // Records are written firewalled; a false here is worth showing
        // rather than assuming.
        isFirewalled: e['isFirewalled'] === true,
      },
    ];
  });
}

// ── Derived compliance signals ──────────────────────────────

export interface CoverageBanner {
  tone: 'neutral' | 'warning' | 'triggered';
  headline: string;
  detail: string;
}

/**
 * What the coverage position means, stated rather than colour-coded.
 *
 * Section 1071 reporting obligations attach at the threshold, so "how far
 * from it" is the only number on this page that changes what anyone has to do.
 */
export function coverageBanner(
  coverage: CoverageCheck | null,
  status: CoverageStatus,
): CoverageBanner {
  if (coverage === null) {
    return {
      tone: 'neutral',
      headline: 'Coverage unknown',
      detail: 'The coverage check could not be read, so no threshold position is shown.',
    };
  }

  const remaining = Math.max(0, coverage.threshold - coverage.applicationCount);

  if (status === '1071_triggered' || coverage.triggered) {
    return {
      tone: 'triggered',
      headline: 'Section 1071 reporting is required',
      detail:
        `${coverage.applicationCount} covered applications recorded in ${coverage.year}, ` +
        `at or above the threshold of ${coverage.threshold}.`,
    };
  }

  if (status === 'approaching_threshold') {
    return {
      tone: 'warning',
      headline: 'Approaching the Section 1071 threshold',
      detail:
        `${coverage.applicationCount} of ${coverage.threshold} covered applications in ` +
        `${coverage.year}. ${remaining} more would trigger reporting.`,
    };
  }

  return {
    tone: 'neutral',
    headline: 'Below the Section 1071 threshold',
    detail:
      `${coverage.applicationCount} of ${coverage.threshold} covered applications in ` +
      `${coverage.year}. Reporting is not required at this volume.`,
  };
}

/**
 * Demographic collection, which is the one demographic figure this page can
 * honestly show.
 *
 * It counts how many records carry a response — not what the responses were.
 * Applicants may decline to provide, so short of 100% is the normal state and
 * is not itself a finding.
 */
export interface CollectionStatus {
  collected: number;
  total: number;
  rate: number | null;
  note: string;
}

export function collectionStatus(dashboard: FairLendingDashboard | null): CollectionStatus {
  if (dashboard === null || dashboard.totalApplications === 0) {
    return {
      collected: 0,
      total: 0,
      rate: null,
      note: 'No covered applications recorded for this year.',
    };
  }

  return {
    collected: dashboard.recordsWithDemographics,
    total: dashboard.totalApplications,
    rate: dashboard.demographicCompletionRate,
    note:
      'Counts records carrying a demographic response, not what was answered. ' +
      'Applicants may decline, so this is expected to sit below 100%.',
  };
}

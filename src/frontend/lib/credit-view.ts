// ============================================================
// CapitalForge — Credit view mapping
//
// The credit endpoints return CreditProfile rows and derived history. The tab
// was written against a different shape — `{ history: [...] }` for the
// timeline, `{ recommendations: [...] }` with a point-impact estimate, and a
// hardcoded PERSONAL_SCORES constant for the personal bureaus — none of which
// the API produces. Reading `.history.length` off the real response throws.
//
// This translates what the API actually returns, and is kept pure so the
// rules are testable without rendering.
// ============================================================

export type Bureau = string;

/** A CreditProfile row as returned by the API. */
export interface ApiCreditProfile {
  id: string;
  bureau: string;
  score: number | null;
  scoreType: string | null;
  utilization: string | number | null;
  inquiryCount: number | null;
  derogatoryCount: number | null;
  tradelines: unknown;
  pulledAt: string | null;
  profileType?: string;
}

export interface ScoreCardView {
  id: string;
  bureau: string;
  scoreType: string | null;
  score: number | null;
  maxScore: number;
  pullDate: string | null;
  /** 0–1, or null when the pull carried no utilisation. */
  utilization: number | null;
  tradelineCount: number | null;
}

/**
 * Score ranges differ by product: FICO runs 300–850, PAYDEX 0–100, SBSS
 * 0–300. Rendering a PAYDEX of 80 against an 850 scale would show a healthy
 * score as almost empty.
 */
const SCORE_MAX: Record<string, number> = {
  fico: 850,
  vantage: 850,
  fico_sbss: 300,
  sbss: 300,
  paydex: 100,
  intelliscore: 100,
};

export function maxScoreFor(scoreType: string | null | undefined): number {
  if (!scoreType) return 850;
  return SCORE_MAX[scoreType.toLowerCase()] ?? 850;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Tradeline count, when the pull recorded one. */
function tradelineCount(tradelines: unknown): number | null {
  if (typeof tradelines === 'number') return tradelines;
  if (Array.isArray(tradelines)) return tradelines.length;
  if (tradelines && typeof tradelines === 'object') {
    const vendors = (tradelines as Record<string, unknown>)['vendors'];
    if (typeof vendors === 'number') return vendors;
  }
  return null;
}

export function toScoreCard(profile: ApiCreditProfile): ScoreCardView {
  return {
    id: profile.id,
    bureau: profile.bureau,
    scoreType: profile.scoreType,
    score: profile.score,
    maxScore: maxScoreFor(profile.scoreType),
    pullDate: profile.pulledAt,
    utilization: toNumber(profile.utilization),
    tradelineCount: tradelineCount(profile.tradelines),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Accepts `{ scores: [...] }` or a bare array. */
export function toScoreCards(data: unknown): ScoreCardView[] {
  const record = asRecord(data);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record['scores'])
      ? (record['scores'] as unknown[])
      : [];

  return rows
    .filter((r): r is ApiCreditProfile => !!r && typeof r === 'object' && 'bureau' in r)
    .map(toScoreCard);
}

// ── History ─────────────────────────────────────────────────────────────────

export interface HistoryPoint {
  month: string;
  [bureau: string]: string | number | null;
}

export interface CreditHistoryView {
  points: HistoryPoint[];
  bureaus: string[];
  pullCount: number;
  changeSinceFirstPull: number | null;
  latestPullAt: string | null;
}

/**
 * The API reports one point per month per bureau, and omits months with no
 * pull rather than interpolating them. An empty history is a real state — a
 * client whose credit has never been pulled — not a reason to invent a curve.
 */
export function toCreditHistory(data: unknown): CreditHistoryView {
  const record = asRecord(data);
  const months = Array.isArray(record['months']) ? (record['months'] as HistoryPoint[]) : [];
  const bureaus = Array.isArray(record['bureaus']) ? (record['bureaus'] as string[]) : [];

  return {
    points: months,
    bureaus,
    pullCount: typeof record['pullCount'] === 'number' ? (record['pullCount'] as number) : months.length,
    changeSinceFirstPull:
      typeof record['changeSinceFirstPull'] === 'number'
        ? (record['changeSinceFirstPull'] as number)
        : null,
    latestPullAt: typeof record['latestPullAt'] === 'string' ? (record['latestPullAt'] as string) : null,
  };
}

// ── Recommendations ─────────────────────────────────────────────────────────

export interface RecommendationView {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  /** The observation that raised it. */
  basis: string;
}

const PRIORITIES = new Set(['high', 'medium', 'low']);

/**
 * Accepts the bare array the API returns.
 *
 * No point-impact estimate is carried, because the API does not produce one:
 * predicting a score change needs a model this system does not have. The tab
 * previously displayed one per recommendation.
 */
export function toRecommendations(data: unknown): RecommendationView[] {
  const record = asRecord(data);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record['recommendations'])
      ? (record['recommendations'] as unknown[])
      : [];

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      id: String(r['id'] ?? ''),
      priority: (PRIORITIES.has(String(r['priority'])) ? r['priority'] : 'low') as
        | 'high'
        | 'medium'
        | 'low',
      title: String(r['title'] ?? 'Recommendation'),
      basis: typeof r['basis'] === 'string' ? r['basis'] : '',
    }))
    .filter((r) => r.id !== '');
}

// ── Business credit builder ─────────────────────────────────────────────────

export interface BusinessScoreSet {
  paydex: number | null;
  paydexDate: string | null;
  experianBusiness: number | null;
  experianDate: string | null;
  sbss: number | null;
  sbssDate: string | null;
}

/** scoreType values that map onto each panel slot. */
const PAYDEX_TYPES = new Set(['paydex']);
const EXPERIAN_TYPES = new Set(['intelliscore', 'experian_business']);
const SBSS_TYPES = new Set(['sbss', 'fico_sbss']);

/**
 * Reduce the credit-builder scores response to the three the panel shows.
 *
 * A bureau with no pull on record stays null, which the panel renders as
 * absent. The page previously hardcoded all three — paydex 72, experian 54,
 * sbss 148 — identically for every client.
 */
export function toBusinessScoreSet(data: unknown): BusinessScoreSet {
  const empty: BusinessScoreSet = {
    paydex: null,
    paydexDate: null,
    experianBusiness: null,
    experianDate: null,
    sbss: null,
    sbssDate: null,
  };

  const scores = toScoreCards(data);
  return scores.reduce<BusinessScoreSet>((acc, s) => {
    const type = s.scoreType?.toLowerCase() ?? '';
    if (PAYDEX_TYPES.has(type)) {
      acc.paydex = s.score;
      acc.paydexDate = s.pullDate;
    } else if (EXPERIAN_TYPES.has(type)) {
      acc.experianBusiness = s.score;
      acc.experianDate = s.pullDate;
    } else if (SBSS_TYPES.has(type)) {
      acc.sbss = s.score;
      acc.sbssDate = s.pullDate;
    }
    return acc;
  }, empty);
}

/** Tradelines from the credit-builder response; accepts the wrapper or a bare array. */
export function toTradelineCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return Array.isArray(record['tradelines']) ? (record['tradelines'] as unknown[]).length : 0;
}

// ── Vendor tradelines ───────────────────────────────────────────────────────

export interface TradelineView {
  id: string;
  vendor: string;
  applied_date: string;
  approved: boolean;
  credit_limit: number;
  balance: number;
  payments_made: number;
  payments_total: number;
  status: 'Applied' | 'Approved' | 'Reporting' | 'Late';
  reportsTo: string[];
  disputeCount: number;
}

/** Bureaus a vendor reports to, when the record lists any. */
function reportsToList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Status the UI shows, derived from the stored status and whether the vendor
 * reports to any bureau.
 *
 * A tradeline that reports nowhere does not build credit, so "open" alone is
 * not "Reporting" — the distinction is the entire point of the feature.
 */
function tradelineStatus(status: string, reportsTo: string[]): TradelineView['status'] {
  if (status === 'delinquent') return 'Late';
  if (status === 'closed') return 'Applied';
  return reportsTo.length > 0 ? 'Reporting' : 'Approved';
}

export function toTradelines(data: unknown): TradelineView[] {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record['tradelines'])
      ? (record['tradelines'] as unknown[])
      : [];

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && 'id' in r)
    .map((r) => {
      const reportsTo = reportsToList(r['reportsTo']);
      const status = typeof r['status'] === 'string' ? r['status'] : 'open';
      const disputes = Array.isArray(r['disputes']) ? (r['disputes'] as unknown[]).length : 0;

      return {
        id: String(r['id']),
        vendor: typeof r['vendor'] === 'string' ? r['vendor'] : 'Unknown vendor',
        applied_date: typeof r['openedDate'] === 'string' ? r['openedDate'] : '',
        approved: status !== 'closed',
        credit_limit: typeof r['creditLimit'] === 'number' ? r['creditLimit'] : 0,
        balance: typeof r['balance'] === 'number' ? r['balance'] : 0,
        // Real payment history. `payments_made` counts those confirmed paid by
        // their due date; the total counts every payment logged. A payment
        // with no known due date is in the total but not the on-time count,
        // because an unknown must not be presented as paid on time.
        payments_made: typeof r['onTimeCount'] === 'number' ? r['onTimeCount'] : 0,
        payments_total: typeof r['paymentCount'] === 'number' ? r['paymentCount'] : 0,
        status: tradelineStatus(status, reportsTo),
        reportsTo,
        disputeCount: disputes,
      };
    });
}

/** How many tradelines are actually reporting to a bureau. */
export function reportingCount(tradelines: TradelineView[]): number {
  return tradelines.filter((t) => t.status === 'Reporting').length;
}

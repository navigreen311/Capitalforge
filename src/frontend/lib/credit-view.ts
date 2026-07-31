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

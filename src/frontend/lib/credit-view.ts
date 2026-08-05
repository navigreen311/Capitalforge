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
  // Equifax's business product runs 101–992, so a bar drawn against 100 would
  // peg every real score at full.
  equifax_business_risk: 992,
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

/**
 * Tradelines from the credit-builder response; accepts the wrapper or a bare
 * array.
 *
 * Null when the response carries no tradeline list at all — nothing has been
 * fetched, or the request failed. That is not the same as a client with no
 * trade lines, which is a real answer of zero, and the two were previously
 * indistinguishable: both rendered "0 of 5 trade lines established", so a page
 * that had loaded nothing stated that the client had opened nothing.
 */
export function toTradelineCount(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return Array.isArray(record['tradelines']) ? (record['tradelines'] as unknown[]).length : null;
}

// ── DUNS registration track ─────────────────────────────────────────────────

/**
 * Which kind of claim a step carries.
 *
 * `derived` is recomputed from the client's data on every read and can go
 * backwards — close a trade line and step 4 stops being complete. `attested`
 * is an advisor saying so, with their id on the record. The page must not
 * present them identically: "the PAYDEX is 80" and "Sarah confirmed the bank
 * account" are different claims, and only one of them has an author.
 */
export type DunsStepSource = 'derived' | 'attested';

export interface DunsStepState {
  stepNumber: number;
  source: DunsStepSource;
  completed: boolean;
  /** What the data said, for a derived step. Null for an attested one. */
  basis: string | null;
  completedAt: string | null;
  /** User id of whoever marked it, when one was recorded. */
  completedBy: string | null;
}

/**
 * A client's DUNS-track progress, from GET /:clientId/steps.
 *
 * Null when the response carries no step list — no client is selected, or the
 * read failed. That is not the same as a client who has completed none, and
 * the difference matters here more than usual: the count feeds
 * `tier1Unlocked`, so an unread track must not be able to satisfy a threshold
 * or to fail one.
 *
 * These marks previously lived in component state, keyed to nobody: they
 * survived neither a refresh nor a change of client, and stayed on screen
 * after switching to a different business.
 */
export function toDunsSteps(data: unknown): DunsStepState[] | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rows = Array.isArray(body['steps']) ? (body['steps'] as unknown[]) : null;
  if (rows === null) return null;

  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    const stepNumber = typeof r['stepNumber'] === 'number' ? r['stepNumber'] : null;
    if (stepNumber === null) return [];

    return [
      {
        stepNumber,
        // Anything the API does not explicitly call derived is treated as
        // attested, which is the safe direction: an attested step offers a
        // control and says who marked it, so a mislabelled one is visibly
        // wrong rather than quietly authoritative.
        source: r['source'] === 'derived' ? 'derived' : 'attested',
        completed: r['completed'] === true,
        basis: typeof r['basis'] === 'string' ? r['basis'] : null,
        completedAt: typeof r['completedAt'] === 'string' ? r['completedAt'] : null,
        completedBy: typeof r['completedBy'] === 'string' ? r['completedBy'] : null,
      },
    ];
  });
}

/** How many steps are marked complete, or null when the track was not read. */
export function completedStepCount(steps: DunsStepState[] | null): number | null {
  return steps === null ? null : steps.filter((s) => s.completed).length;
}

// ── Stacking unlock criteria ────────────────────────────────────────────────

export type CriterionStatus = 'met' | 'not_met' | 'unknown' | 'unassessable';

export interface StackingCriterionView {
  id: string;
  label: string;
  description: string;
  requiredForTier: number;
  status: CriterionStatus;
  /** What the assessment read, or why it could not be made. */
  basis: string;
}

export interface TierAssessmentView {
  tier: number;
  criteria: StackingCriterionView[];
  met: number;
  total: number;
  unlocked: boolean;
  blockedBy: string[];
}

const CRITERION_STATUSES = new Set<CriterionStatus>([
  'met',
  'not_met',
  'unknown',
  'unassessable',
]);

/**
 * The assessed criteria, from GET /:clientId/stacking-criteria.
 *
 * Null when nothing was read — no client is selected, or the request failed.
 * The page listed eight criteria with a hardcoded status of "unknown" and
 * `allMet = false` beside them, so it reported "none assessed" to every client
 * whether or not anything had been asked.
 *
 * An unrecognised status becomes `unknown` rather than `not_met`: a client must
 * not be reported as failing a threshold because a string did not parse.
 */
export function toStackingCriteria(data: unknown): TierAssessmentView[] | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rows = Array.isArray(body['tiers']) ? (body['tiers'] as unknown[]) : null;
  if (rows === null) return null;

  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const t = raw as Record<string, unknown>;
    const tier = typeof t['tier'] === 'number' ? t['tier'] : null;
    if (tier === null) return [];

    const criteria = (Array.isArray(t['criteria']) ? (t['criteria'] as unknown[]) : []).flatMap(
      (entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const c = entry as Record<string, unknown>;
        const id = typeof c['id'] === 'string' ? c['id'] : null;
        if (id === null) return [];

        const status = c['status'] as CriterionStatus;
        return [
          {
            id,
            label: typeof c['label'] === 'string' ? c['label'] : id,
            description: typeof c['description'] === 'string' ? c['description'] : '',
            requiredForTier: typeof c['requiredForTier'] === 'number' ? c['requiredForTier'] : tier,
            status: CRITERION_STATUSES.has(status) ? status : ('unknown' as CriterionStatus),
            basis: typeof c['basis'] === 'string' ? c['basis'] : '',
          },
        ];
      },
    );

    return [
      {
        tier,
        criteria,
        met: typeof t['met'] === 'number' ? t['met'] : criteria.filter((c) => c.status === 'met').length,
        total: typeof t['total'] === 'number' ? t['total'] : criteria.length,
        // Never inferred here. A tier is unlocked when the server says every
        // criterion is met; deriving it from a partially-parsed list is how a
        // page comes to announce an unlock nothing assessed.
        unlocked: t['unlocked'] === true,
        blockedBy: Array.isArray(t['blockedBy'])
          ? (t['blockedBy'] as unknown[]).filter((b): b is string => typeof b === 'string')
          : [],
      },
    ];
  });
}

/**
 * Months since formation, from the stacking-criteria response.
 *
 * `Business.dateOfFormation` exists and is populated — the page passed null to
 * the progress timeline anyway, which rendered "Formation date not recorded"
 * for every client. An earlier revision of docs/gaps.md called this a missing
 * column; the column was there the whole time and nothing surfaced it.
 *
 * Still null when genuinely absent, which the timeline renders as unknown
 * rather than as a business that has just been formed.
 */
export function toBusinessAgeMonths(data: unknown): number | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const months = body['businessAgeMonths'];
  return typeof months === 'number' && Number.isFinite(months) ? months : null;
}

// ── Credit-builder client picker ────────────────────────────────────────────

export interface CreditBuilderClientView {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string;
}

/**
 * The clients offered by the credit-builder picker, from /api/v1/clients.
 *
 * The picker held eight literals — Apex Ventures LLC, NovaGo Solutions,
 * Meridian Holdings and five more — under ids cb_001 to cb_008. No such
 * businesses exist, so every downstream request went to
 * /api/credit-builder/cb_001/scores, which correctly answers 404, and the page
 * turned that emptiness into zeros and drew a credit profile from them.
 *
 * One of those names, Apex Ventures LLC, is in the list another spec asserts
 * must never appear on the communications-compliance page, for the same
 * reason: it is not a client.
 */
export function toCreditBuilderClients(data: unknown): CreditBuilderClientView[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)['data'])
      ? ((data as Record<string, unknown>)['data'] as unknown[])
      : [];

  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const id = typeof r['id'] === 'string' ? r['id'] : null;
    // businessName is what /api/v1/clients calls the legal name.
    const name = typeof r['businessName'] === 'string' ? r['businessName'] : null;
    if (id === null || name === null) return [];

    return [
      {
        id,
        legal_name: name,
        entity_type: typeof r['entityType'] === 'string' ? r['entityType'] : '',
        state: typeof r['state'] === 'string' ? r['state'] : '',
      },
    ];
  });
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

/**
 * Whether a `reportsTo` entry names Dun & Bradstreet.
 *
 * The list is free-form — the add form's checkbox writes "D&B", but a line
 * entered or imported another way may say "Dun & Bradstreet" or "DNB".
 * Mirrors the backend rule that derives DUNS step 4, so the count on this page
 * and the step above it cannot disagree.
 */
function namesDnb(bureau: string): boolean {
  const normalised = bureau.toLowerCase().replace(/[^a-z]/g, '');
  return normalised === 'db' || normalised === 'dnb' || normalised.startsWith('dunbradstreet');
}

/**
 * How many tradelines report to D&B specifically.
 *
 * The tradeline tracker's summary is labelled "Tradelines reporting to D&B"
 * and counted with `reportingCount`, which counts a line reporting to *any*
 * bureau — so a client with five Experian-only lines read as five of five
 * toward a D&B threshold. The label and the figure have disagreed since the
 * summary was written; this is the figure the label describes.
 */
export function dnbReportingCount(tradelines: TradelineView[]): number {
  return tradelines.filter(
    (t) => t.status === 'Reporting' && t.reportsTo.some(namesDnb),
  ).length;
}

// ── Score history ───────────────────────────────────────────────────────────

export interface ScoreHistoryPoint {
  month: string;
  paydex?: number | null;
  intelliscore?: number | null;
  sbss?: number | null;
}

/**
 * Points for the trajectory chart, from GET /:clientId/score-history.
 *
 * The chart drew a fixed six-month climb ending at paydex 72, intelliscore 54
 * and SBSS 148 — for every client, including ones with no business credit
 * file. The endpoint returns one entry per month that actually has a pull, so
 * an empty array means no pulls rather than a flat line at zero.
 */
export function toScoreHistoryPoints(data: unknown): ScoreHistoryPoint[] {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const months = Array.isArray(body['months']) ? (body['months'] as unknown[]) : [];

  return months.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const m = raw as Record<string, unknown>;
    const month = typeof m['month'] === 'string' ? m['month'] : null;
    if (month === null) return [];

    const score = (key: string): number | null =>
      typeof m[key] === 'number' && Number.isFinite(m[key]) ? (m[key] as number) : null;

    return [
      {
        month,
        paydex: score('paydex'),
        intelliscore: score('intelliscore'),
        sbss: score('sbss'),
      },
    ];
  });
}

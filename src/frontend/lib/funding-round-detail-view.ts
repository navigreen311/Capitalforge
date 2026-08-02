// ============================================================
// funding-round-detail-view — /funding-rounds/[id] reads the round
//
// The page was a single literal. `const PLACEHOLDER = { id: 'FR-018',
// businessName: 'Apex Ventures LLC', ... }` with three cards, a target of
// $150,000 and $105,000 obtained — rendered for every round id, including
// ids that do not exist. Apex Ventures LLC is one of the businesses other
// specs in this repo assert must never appear, because it is not a client.
//
// It survived four passes of this work because the sweep that finds these
// skips dynamic segments: it cannot visit /funding-rounds/[id] without an id,
// so the one page with fixtures was the one it could not reach.
//
// GET /api/funding-rounds/:roundId has been there throughout, tenant-scoped,
// with the applications attached to the round and progress derived from them.
// ============================================================

export interface RoundApplicationView {
  id: string;
  issuer: string;
  cardProduct: string;
  status: string;
  /** Null when no limit is recorded — not a card approved for nothing. */
  creditLimit: number | null;
  introAprExpiry: string | null;
  declineReason: string | null;
}

export interface RoundProgressView {
  applicationCount: number;
  approvedCount: number;
  declinedCount: number;
  pendingCount: number;
  creditObtained: number;
  /** Null when the round carries no target to measure against. */
  creditRemaining: number | null;
  targetProgressPct: number | null;
}

export interface FundingRoundDetailView {
  id: string;
  businessId: string;
  businessName: string;
  roundNumber: number | null;
  status: string;
  /** Null when no target credit is recorded for the round. */
  targetCredit: number | null;
  targetCardCount: number | null;
  aprExpiryDate: string | null;
  aprExpiryDaysRemaining: number | null;
  startedAt: string | null;
  completedAt: string | null;
  progress: RoundProgressView;
  applications: RoundApplicationView[];
  /** False until a response has been read. */
  loaded: boolean;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Prisma Decimal crosses JSON as a string.
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Days until an intro APR lapses.
 *
 * Null without an expiry date. The fixture carried aprDaysLeft alongside each
 * card, which meant the number could disagree with the date beside it; this
 * derives one from the other so they cannot.
 */
export function aprDaysRemaining(expiry: string | null, now: Date = new Date()): number | null {
  if (expiry === null) return null;
  const then = new Date(expiry).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.ceil((then - now.getTime()) / (24 * 60 * 60 * 1000));
}

export const EMPTY_ROUND: FundingRoundDetailView = {
  id: '',
  businessId: '',
  businessName: '',
  roundNumber: null,
  status: '',
  targetCredit: null,
  targetCardCount: null,
  aprExpiryDate: null,
  aprExpiryDaysRemaining: null,
  startedAt: null,
  completedAt: null,
  progress: {
    applicationCount: 0,
    approvedCount: 0,
    declinedCount: 0,
    pendingCount: 0,
    creditObtained: 0,
    creditRemaining: null,
    targetProgressPct: null,
  },
  applications: [],
  loaded: false,
};

/** Maps GET /api/funding-rounds/:roundId. */
export function toFundingRoundDetail(data: unknown): FundingRoundDetailView {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (root === null) return EMPTY_ROUND;

  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const id = str(body['id']);
  // No id means no round was read — an error body, or nothing yet. Rendering
  // anything at that point is what the fixture did.
  if (id === null) return EMPTY_ROUND;

  const rawProgress = body['progress'] && typeof body['progress'] === 'object'
    ? (body['progress'] as Record<string, unknown>)
    : {};

  const applications: RoundApplicationView[] = Array.isArray(body['applications'])
    ? (body['applications'] as unknown[]).flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const a = raw as Record<string, unknown>;
        const appId = str(a['id']);
        if (appId === null) return [];
        return [
          {
            id: appId,
            issuer: str(a['issuer']) ?? '',
            cardProduct: str(a['cardProduct']) ?? '',
            status: str(a['status']) ?? '',
            creditLimit: num(a['creditLimit']),
            introAprExpiry: str(a['introAprExpiry']),
            declineReason: str(a['declineReason']),
          },
        ];
      })
    : [];

  return {
    id,
    businessId: str(body['businessId']) ?? '',
    businessName: str(body['businessName']) ?? '',
    roundNumber: num(body['roundNumber']),
    status: str(body['status']) ?? '',
    targetCredit: num(body['targetCredit']),
    targetCardCount: num(body['targetCardCount']),
    aprExpiryDate: str(body['aprExpiryDate']),
    aprExpiryDaysRemaining: num(body['aprExpiryDaysRemaining']),
    startedAt: str(body['startedAt']),
    completedAt: str(body['completedAt']),
    progress: {
      applicationCount: num(rawProgress['applicationCount']) ?? applications.length,
      approvedCount: num(rawProgress['approvedCount']) ?? 0,
      declinedCount: num(rawProgress['declinedCount']) ?? 0,
      pendingCount: num(rawProgress['pendingCount']) ?? 0,
      creditObtained: num(rawProgress['creditObtained']) ?? 0,
      // Null, not 0: nothing left to raise is a different fact from no target
      // having been set.
      creditRemaining: num(rawProgress['creditRemaining']),
      targetProgressPct: num(rawProgress['targetProgressPct']),
    },
    applications,
    loaded: true,
  };
}

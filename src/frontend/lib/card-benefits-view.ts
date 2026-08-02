// ============================================================
// card-benefits-view — /card-benefits reads the card_benefits table
//
// The page held three cards as literals — Amex Business Platinum, Chase
// Sapphire Reserve, Amex Business Gold — with twelve benefits between them,
// and the API returned the same three for any client asked for. Both are
// gone. card_benefits is a real table keyed to a card application.
//
// The judgment this file exists to hold: a benefit with no recorded value is
// not a benefit worth nothing. The page totals these into "left on the table",
// and a null counted as zero understates that total silently.
// ============================================================

export interface BenefitView {
  benefitId: string;
  name: string;
  type: string;
  /** Null when no value is recorded for this benefit. */
  value: number | null;
  expiresAt: string | null;
  utilized: boolean;
  utilizedDate: string | null;
}

export interface CardView {
  cardId: string;
  issuer: string;
  product: string;
  status: string;
  annualFee: number | null;
  benefits: BenefitView[];
}

export interface BenefitsSummaryView {
  totalBenefits: number;
  utilized: number;
  expiringSoon: number;
  /** Null when no unused benefit carries a value. */
  estimatedUnusedValue: number | null;
  /** How many benefits carry a value at all, so a partial total reads as one. */
  valuedBenefits: number;
}

export interface ExpiringBenefitView extends BenefitView {
  daysRemaining: number;
}

export interface CardBenefitsView {
  summary: BenefitsSummaryView;
  expiring: ExpiringBenefitView[];
  cards: CardView[];
  /** False until a response has been read, so the page can hold its figures. */
  loaded: boolean;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toBenefit(raw: unknown): BenefitView[] {
  if (!raw || typeof raw !== 'object') return [];
  const b = raw as Record<string, unknown>;
  const id = str(b['benefitId']);
  const name = str(b['name']);
  if (id === null || name === null) return [];
  return [
    {
      benefitId: id,
      name,
      type: str(b['type']) ?? '',
      value: num(b['value']),
      expiresAt: str(b['expiresAt']),
      utilized: b['utilized'] === true,
      utilizedDate: str(b['utilizedDate']),
    },
  ];
}

export const EMPTY_VIEW: CardBenefitsView = {
  summary: {
    totalBenefits: 0,
    utilized: 0,
    expiringSoon: 0,
    estimatedUnusedValue: null,
    valuedBenefits: 0,
  },
  expiring: [],
  cards: [],
  loaded: false,
};

/** Maps GET /api/card-benefits/:clientId. */
export function toCardBenefitsView(data: unknown): CardBenefitsView {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (root === null) return EMPTY_VIEW;

  const body = root['data'] && typeof root['data'] === 'object'
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rawCards = Array.isArray(body['cards']) ? (body['cards'] as unknown[]) : null;
  // No cards key at all means nothing was read, which is different from a
  // client who holds no cards.
  if (rawCards === null) return EMPTY_VIEW;

  const cards: CardView[] = rawCards.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const c = raw as Record<string, unknown>;
    const cardId = str(c['cardId']);
    if (cardId === null) return [];
    return [
      {
        cardId,
        issuer: str(c['issuer']) ?? '',
        product: str(c['product']) ?? '',
        status: str(c['status']) ?? '',
        annualFee: num(c['annualFee']),
        benefits: Array.isArray(c['benefits'])
          ? (c['benefits'] as unknown[]).flatMap(toBenefit)
          : [],
      },
    ];
  });

  const rawSummary = body['summary'] && typeof body['summary'] === 'object'
    ? (body['summary'] as Record<string, unknown>)
    : {};

  const all = cards.flatMap((c) => c.benefits);

  const expiring: ExpiringBenefitView[] = Array.isArray(body['expiring'])
    ? (body['expiring'] as unknown[]).flatMap((raw) => {
        const mapped = toBenefit(raw);
        if (mapped.length === 0) return [];
        const days = num((raw as Record<string, unknown>)['daysRemaining']);
        if (days === null) return [];
        return [{ ...mapped[0]!, daysRemaining: days }];
      })
    : [];

  return {
    summary: {
      totalBenefits: num(rawSummary['totalBenefits']) ?? all.length,
      utilized: num(rawSummary['utilized']) ?? all.filter((b) => b.utilized).length,
      expiringSoon: num(rawSummary['expiringSoon']) ?? expiring.length,
      // Deliberately not defaulted to 0: absent means no unused benefit
      // carries a value, which the page states rather than showing $0.
      estimatedUnusedValue: num(rawSummary['estimatedUnusedValue']),
      valuedBenefits:
        num(rawSummary['valuedBenefits']) ?? all.filter((b) => b.value !== null).length,
    },
    expiring,
    cards,
    loaded: true,
  };
}

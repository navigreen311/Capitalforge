// ============================================================
// Coaching cards — what to tell this client this week
//
// Kept out of the component, and pure, so the rules can be tested without
// rendering — the same reasoning as `credit-view`.
//
// The rule these encode, and the reason this file exists: a card that states
// something about the client must read it. Coaching used to be keyed on the
// tier alone while asserting client facts, so every Tier 1 client was told
// "you need 5 reporting tradelines… apply to at least 2 new accounts this
// week" — including a client with six, and including a client whose trade
// lines had never been read at all.
//
// An unknown is not a quantity. Where the fact is missing the card says so
// and drops the number, rather than defaulting to one and presenting it as
// measured.
// ============================================================

/** PAYDEX that Tier 2 vendors and Costco generally look for. */
export const PAYDEX_TARGET = 80;
/** Reporting trade lines Tier 1 needs. */
export const TRADELINE_TARGET = 5;

export interface CoachingItem {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
}

/**
 * The client facts coaching may assert.
 *
 * These are the same values the tier estimates above are computed from — one
 * reading of the client per render. Coaching used to be keyed on `tier` alone
 * while stating things about the client, so every Tier 1 client was told "you
 * need 5 reporting tradelines… apply to at least 2 new accounts this week",
 * including a client with six. Nothing read their count.
 */
export interface CoachingFacts {
  /** Null when the trade-line list has not been read for this client. */
  tradelineCount: number | null;
  paydex: number | null;
  experianBusiness: number | null;
}

/**
 * Cards that state a quantity must compute it, and must not compute one from
 * an absence.
 *
 * The rule this encodes: an unknown is not a number. "Apply to 2 more vendors"
 * for a client whose trade lines were never read is the same defect as a
 * count that hides what produced it — a figure presented as measured when
 * nothing measured it. Where the fact is missing the card says so and drops
 * the quantity rather than defaulting to one.
 */
function tier1Cards(f: CoachingFacts): CoachingItem[] {
  const cards: CoachingItem[] = [];

  if (f.tradelineCount === null) {
    cards.push({
      id: 'c1-1',
      title: 'Trade lines have not been read for this client',
      description:
        'How many more Net-30 accounts they need cannot be stated, because nothing has read how many they have. Open the trade-line tracker above first — this card used to say "apply for 2 more" to every client at this tier, including ones that already had six.',
    });
  } else if (f.tradelineCount >= TRADELINE_TARGET) {
    cards.push({
      id: 'c1-1',
      title: 'Enough trade lines — keep them clean',
      description: `${f.tradelineCount} accounts are reporting to D&B, past the ${TRADELINE_TARGET} this tier needs. Nothing more to open; what moves the score now is paying them early.`,
    });
  } else {
    const needed = TRADELINE_TARGET - f.tradelineCount;
    cards.push({
      id: 'c1-1',
      title: `Apply for ${needed} more Net-30 vendor${needed === 1 ? '' : 's'}`,
      description: `${f.tradelineCount} of the ${TRADELINE_TARGET} trade lines this tier needs are reporting to D&B. Browse the vendor table above and open ${needed} more.`,
      actionLabel: 'View Vendors',
    });
  }

  cards.push(...TIER_1_GENERIC);
  return cards;
}

/**
 * Advice that is sound for any client at this tier and asserts nothing about
 * them. "Pay invoices 10+ days early" needs no data to be true.
 */
const TIER_1_GENERIC: CoachingItem[] = [
    {
      id: 'c1-2',
      title: 'Pay all outstanding invoices early',
      description: 'Early payments push your Paydex score higher faster. Review open invoices and pay at least 10 days before due date for maximum impact.',
      actionLabel: 'View Tradelines',
    },
    {
      id: 'c1-3',
      title: 'Verify your D&B file is accurate',
      description: 'Log into D&B and confirm your business name, address, SIC code, and employee count are correct. Errors can delay your Paydex scoring.',
      actionLabel: 'Check D&B Profile',
      actionUrl: 'https://www.dnb.com/duns-number/lookup.html',
    },
];

function tier2Cards(f: CoachingFacts): CoachingItem[] {
  const cards: CoachingItem[] = [];

  // "With your Paydex approaching 80" was stated to every Tier 2 client,
  // including one with no PAYDEX on record at all.
  if (f.paydex === null) {
    cards.push({
      id: 'c2-1',
      title: 'No PAYDEX on record, so Tier 2 readiness is unknown',
      description:
        'Tier 2 vendors like Home Depot Pro and Staples Business generally want a PAYDEX in the 70s. Nothing has read one for this client, so whether they are close cannot be said — and applying blind risks a hard decline on the file.',
    });
  } else if (f.paydex >= PAYDEX_TARGET) {
    cards.push({
      id: 'c2-1',
      title: 'Apply for Tier 2 vendors',
      description: `PAYDEX is ${f.paydex}, past the ${PAYDEX_TARGET} Tier 2 vendors look for. Home Depot Pro and Staples Business carry higher limits and report to more bureaus.`,
      actionLabel: 'View Tier 2 Vendors',
    });
  } else {
    cards.push({
      id: 'c2-1',
      title: `PAYDEX is ${f.paydex} — ${PAYDEX_TARGET - f.paydex} short of Tier 2 vendors`,
      description: `Tier 2 vendors generally want ${PAYDEX_TARGET}. Paying existing Net-30 invoices early is what closes that gap; applying now risks a decline recorded on the file.`,
    });
  }

  cards.push(...TIER_2_GENERIC);
  return cards;
}

const TIER_2_GENERIC: CoachingItem[] = [
    {
      id: 'c2-2',
      title: 'Pull your Experian Business report',
      // This said "Pull a free report". Experian does not give a business its
      // own Intelliscore Plus for free — it is ~$49.95 one-time or ~$199/yr
      // (verified 2026-08-05, docs/product/business-credit-scores.md). An
      // advisor reading this told the client something they would find untrue
      // at the paywall, which is worse than saying nothing.
      description: 'Your Experian Intelliscore needs to reach 60+. A report with Intelliscore Plus costs about $49.95 one-time, or about $199/year for monitoring — tell the client to expect a charge. It is usually worth it: correcting bad data on the file moves the score faster than building new tradelines.',
      actionLabel: 'Check Experian',
      actionUrl: 'https://www.experian.com/small-business/business-credit-report.jsp',
    },
    {
      id: 'c2-3',
      title: 'Ensure consistent bank deposits',
      description: 'Maintain regular business bank deposits of $5,000+/month. Lenders and credit algorithms factor in cash flow stability when scoring.',
    },
];

function tier3Cards(f: CoachingFacts): CoachingItem[] {
  const cards: CoachingItem[] = [...TIER_3_GENERIC];

  // "With Paydex 80+ and 5+ tradelines, you qualify for Costco Business
  // Credit" asserted two facts and an eligibility conclusion, for every Tier 3
  // client, reading none of them. A client sent to apply on that basis and
  // declined carries the inquiry on their file.
  if (f.paydex === null || f.tradelineCount === null) {
    const missing = [
      f.paydex === null ? 'PAYDEX' : null,
      f.tradelineCount === null ? 'trade-line count' : null,
    ]
      .filter(Boolean)
      .join(' and ');
    cards.push({
      id: 'c3-3',
      title: 'Costco Business Credit — eligibility not established',
      description: `Costco generally wants a PAYDEX of ${PAYDEX_TARGET} and ${TRADELINE_TARGET}+ reporting trade lines. This client's ${missing} has not been read, so whether they qualify is unknown. A decline leaves an inquiry on the file, so establish the figures before sending them.`,
    });
  } else if (f.paydex >= PAYDEX_TARGET && f.tradelineCount >= TRADELINE_TARGET) {
    cards.push({
      id: 'c3-3',
      title: 'Apply for Costco Business Credit',
      description: `PAYDEX ${f.paydex} and ${f.tradelineCount} reporting trade lines clear what Costco generally looks for (${PAYDEX_TARGET}, ${TRADELINE_TARGET}+). Limits reach $50K and it reports to Experian, so it is a strong tradeline to add.`,
      actionLabel: 'Apply at Costco',
      actionUrl: 'https://www.costco.com/business.html',
    });
  } else {
    const short = [
      f.paydex < PAYDEX_TARGET ? `PAYDEX ${f.paydex} of ${PAYDEX_TARGET}` : null,
      f.tradelineCount < TRADELINE_TARGET
        ? `${f.tradelineCount} of ${TRADELINE_TARGET} trade lines`
        : null,
    ]
      .filter(Boolean)
      .join(', ');
    cards.push({
      id: 'c3-3',
      title: 'Not yet ready for Costco Business Credit',
      description: `Costco generally wants PAYDEX ${PAYDEX_TARGET} and ${TRADELINE_TARGET}+ reporting trade lines; this client is at ${short}. Applying now risks a decline recorded against the file.`,
    });
  }

  return cards;
}

const TIER_3_GENERIC: CoachingItem[] = [
    {
      id: 'c3-1',
      // Was "Schedule credit review at SBSS 160" — telling a client to wait
      // for a number they cannot observe. SBSS is computed by a lender at
      // application; nobody can watch it "hit" anything. 160 was also a third
      // inconsistent threshold on this page, alongside 140 and 175, and the
      // SBA sequence was 140, 155, 165, then retired on 2026-03-01.
      title: 'Talk to a lender rather than waiting on a score',
      description: 'There is no SBSS to watch: it is calculated when a lender requests it, from the owners\' personal credit, business bureau data, financials and the application. The SBA retired its pre-screen minimum on 2026-03-01 and lenders now use their own models. Ask the loan officer what they score on, and what they pulled.',
    },
    {
      id: 'c3-2',
      title: 'Prepare financial statements',
      description: 'Tier 3 credit products require formal financials. Prepare your P&L statement, balance sheet, and 2-year tax returns for upcoming applications.',
    },
];

/** The cards for a tier, read against this client rather than assumed. */
export function coachingForTier(tier: number, facts: CoachingFacts): CoachingItem[] {
  if (tier === 1) return tier1Cards(facts);
  if (tier === 2) return tier2Cards(facts);
  if (tier === 3) return tier3Cards(facts);
  return [];
}

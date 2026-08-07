// ============================================================
// How a client actually gets each score
//
// Every sentence here is transcribed from
// `docs/product/business-credit-scores.md`, and each carries the source and
// verification date that document recorded. Nothing is written from memory.
//
// That is not a style preference. The Tier 2 coaching card once told advisors
// to have a client "pull a free report" from Experian — it costs about $49.95,
// and the client finds out at the paywall. Nobody invented that maliciously;
// somebody wrote plausible copy without checking. The types below make the
// same mistake a compile error: a `Claim` cannot exist without a source and a
// date, and a fact nobody has confirmed cannot be expressed as a `Claim` at
// all — it has to be an `Unverified`, which renders differently and says so.
//
// ── Why four shapes rather than one
//
// These products do not differ only in their numbers. PAYDEX is a sequence you
// walk. Intelliscore is a purchase followed by a correction loop. Equifax is a
// purchase followed by a *identification* problem. SBSS has no path at all —
// its expansion is an argument for doing something else. Forcing them into one
// template would flatten the single most decision-relevant difference between
// them, which is whether the client can act at all.
// ============================================================

/** A source good enough to repeat to a client. */
export interface SourceRef {
  /** Publisher or issuing body, as a reader would recognise it. */
  readonly publisher: string;
  /** What it is — a notice number, an article title. */
  readonly title: string;
  readonly url?: string;
}

/**
 * A statement somebody has stood behind.
 *
 * `source` and `verifiedOn` are required and non-optional on purpose. There is
 * no constructor path that produces a claim without them.
 */
export interface Claim {
  readonly kind: 'claim';
  readonly text: string;
  readonly source: SourceRef;
  /** ISO date the source was checked. Not the date it was published. */
  readonly verifiedOn: string;
}

/**
 * Something believed but not confirmed.
 *
 * Marked, not removed, and never upgraded to a Claim — the standing pattern
 * from the source document. `whatWouldSettleIt` exists so the gap is
 * actionable rather than decorative: a reader who knows the answer can close
 * it, and a reader who does not knows precisely what is missing.
 */
export interface Unverified {
  readonly kind: 'unverified';
  readonly text: string;
  readonly whatWouldSettleIt: string;
}

export type Statement = Claim | Unverified;

/** True when a statement carries provenance a client can be told. */
export function isClaim(s: Statement): s is Claim {
  return s.kind === 'claim';
}

// ── Sources, named once ──────────────────────────────────────

const STARTUP_OWL_MONITORING: SourceRef = {
  publisher: 'Startup Owl',
  title: 'Business credit monitoring 2026',
  url: 'https://startupowl.com/fund/business-credit-monitoring',
};

const STARTUP_OWL_EXPERIAN: SourceRef = {
  publisher: 'Startup Owl',
  title: 'Experian Business Credit review 2026',
  url: 'https://startupowl.com/reviews/experian-business',
};

const NERDWALLET_EQUIFAX: SourceRef = {
  publisher: 'NerdWallet',
  title: 'Equifax business credit report',
  url: 'https://www.nerdwallet.com/business/credit-cards/learn/equifax-business-credit-report',
};

const EQUIFAX_ONESCORE: SourceRef = {
  publisher: 'Equifax',
  title: 'OneScore for Commercial',
  url: 'https://www.equifax.com/business/product/onescore-for-commercial/',
};

const NAV_SBSS: SourceRef = {
  publisher: 'Nav',
  title: 'FICO SBSS Score in 2026',
  url: 'https://www.nav.com/business-credit/fico-sbss/',
};

const CRS_SBSS_FACTORS: SourceRef = {
  publisher: 'CRS Credit API',
  title: 'SBSS score calculation factors',
  url: 'https://crscreditapi.com/sbss-score-calculation-factors/',
};

const SBA_876777: SourceRef = {
  publisher: 'U.S. Small Business Administration',
  title: 'Procedural Notice 5000-876777 — Sunset of SBSS Score, Supplemental Guidance (operative)',
  url: 'https://www.sba.gov/document/procedural-notice-5000-876777-sunset-sbss-score-supplemental-guidance',
};

const NAGGL_SUMMARY: SourceRef = {
  publisher: 'NAGGL',
  title: 'SBA notice revising underwriting requirements for 7(a) Small Loans',
  url: 'https://www.naggl.org/sba-notice-revising-previously-issued-underwriting-requirements-for-7a-small-loans/',
};

/** Our own vendor data, not a third party — labelled as such. */
const OWN_VENDOR_DATA: SourceRef = {
  publisher: 'CapitalForge vendor directory',
  title: 'Uline Net-30 reporting terms',
};

const V_0805 = '2026-08-05';
const V_0806 = '2026-08-06';

// ── PAYDEX — a sequence the client walks ─────────────────────

export interface BuildStep {
  readonly n: number;
  readonly action: string;
  readonly detail: Statement;
}

export interface PaydexPath {
  readonly kind: 'build_path';
  readonly summary: string;
  readonly steps: readonly BuildStep[];
  readonly timing: readonly Statement[];
  readonly freeVsPaid: readonly Statement[];
}

export const PAYDEX_PATH: PaydexPath = {
  kind: 'build_path',
  summary:
    'The most directly controllable of the four. D&B calculates it from trade payments your suppliers report, so the client controls both who reports and how early they pay.',
  steps: [
    {
      n: 1,
      action: 'Get a D-U-N-S number',
      detail: {
        kind: 'claim',
        text: 'Free, direct from D&B. Required before any trade experience can attach to the business.',
        source: STARTUP_OWL_MONITORING,
        verifiedOn: V_0805,
      },
    },
    {
      n: 2,
      action: 'Open Net-30 accounts with vendors that report to D&B',
      detail: {
        kind: 'unverified',
        text:
          'How many reporting trade experiences D&B needs before it calculates a PAYDEX at all is not confirmed. Treat any specific count you have seen — including ones in this industry’s guides — as unconfirmed.',
        whatWouldSettleIt:
          'D&B publishing its minimum, or a support response stating it. Until then, open more than you think you need and do not promise the client a threshold.',
      },
    },
    {
      n: 3,
      action: 'Pay early, not merely on time',
      detail: {
        kind: 'claim',
        text: 'PAYDEX rewards days-early payment. Paying on the due date does not score the same as paying ahead of it.',
        source: STARTUP_OWL_MONITORING,
        verifiedOn: V_0805,
      },
    },
    {
      n: 4,
      action: 'Buy visibility only when you need the number',
      detail: {
        kind: 'claim',
        text: 'Change alerts are free. Pay for the score itself when a decision turns on the figure, not to watch it.',
        source: STARTUP_OWL_MONITORING,
        verifiedOn: V_0805,
      },
    },
  ],
  timing: [
    {
      kind: 'claim',
      text:
        'Uline reports to D&B within 30–60 days of the first paid invoice, and a PAYDEX begins reflecting activity after about two billing cycles. Each vendor differs — this is a reasonable shape for Net-30 vendors, not a rule.',
      source: OWN_VENDOR_DATA,
      verifiedOn: V_0805,
    },
  ],
  freeVsPaid: [
    {
      kind: 'claim',
      text:
        'D&B CreditSignal is free and alerts on changes, but exact numerical scores stop after a 14-day preview. The number itself needs a paid product; one-time reports start around $60.',
      source: STARTUP_OWL_MONITORING,
      verifiedOn: V_0805,
    },
  ],
};

// ── Intelliscore — buy, read, dispute ────────────────────────

export interface DisputePath {
  readonly kind: 'buy_and_dispute';
  readonly summary: string;
  readonly cost: Statement;
  readonly whatTheFileIsBuiltFrom: readonly Statement[];
  readonly whyCorrectBeforeBuild: Statement;
  /** Copy an advisor may have learned elsewhere and should stop repeating. */
  readonly caution: Statement;
}

export const INTELLISCORE_PATH: DisputePath = {
  kind: 'buy_and_dispute',
  summary:
    'The one score where a same-week action can produce a real change — because the fastest move is correcting wrong data rather than building new data.',
  cost: {
    kind: 'claim',
    text: 'Around $49.95 per report, or about $199 a year for monitoring. Obtainable on demand, today.',
    source: STARTUP_OWL_EXPERIAN,
    verifiedOn: V_0805,
  },
  whatTheFileIsBuiltFrom: [
    {
      kind: 'claim',
      text:
        'Experian scores it from trade data it receives. For thin or new business files it blends the owner’s personal credit — so a client with no business history is partly being scored on themselves.',
      source: STARTUP_OWL_EXPERIAN,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text:
        'That blend cuts both ways: an owner’s personal credit improvement can move a thin business file with no new trade data at all.',
      source: STARTUP_OWL_EXPERIAN,
      verifiedOn: V_0805,
    },
  ],
  whyCorrectBeforeBuild: {
    kind: 'claim',
    text:
      'Buy the report, read it for errors, dispute what is wrong. Correcting bad data is faster than building good data.',
    source: STARTUP_OWL_EXPERIAN,
    verifiedOn: V_0805,
  },
  caution: {
    kind: 'claim',
    text:
      'Do not tell a client to pull a free report. Experian does not give a business its own Intelliscore Plus for free, and the client finds out at the paywall.',
    source: STARTUP_OWL_EXPERIAN,
    verifiedOn: V_0805,
  },
};

// ── Equifax — buy, then work out which score you are holding ──

export interface EquifaxProductRow {
  readonly product: string;
  readonly range: string;
  /** True for the one this card tracks. */
  readonly isTheOneTracked: boolean;
  /** True when its range overlaps Business Credit Risk and cannot be told apart by value. */
  readonly overlapsSilently: boolean;
}

export interface IdentifyPath {
  readonly kind: 'buy_and_identify';
  readonly summary: string;
  readonly cost: Statement;
  readonly howToOrder: Statement;
  readonly products: readonly EquifaxProductRow[];
  readonly productsSource: SourceRef;
  readonly productsVerifiedOn: string;
  readonly trap: readonly Statement[];
}

export const EQUIFAX_PATH: IdentifyPath = {
  kind: 'buy_and_identify',
  summary:
    'Buying it is easy. The risk is reading the wrong number off the bundle — Equifax prints several commercial scores together, and one of them is indistinguishable from this card’s by value alone.',
  cost: {
    kind: 'claim',
    text:
      'About $49.95 through an approved reseller such as eCredable, or roughly $30–40 ordered directly from Equifax. Self-service access widened in August 2025, so guidance written before then may say this is harder than it is.',
    source: NERDWALLET_EQUIFAX,
    verifiedOn: V_0805,
  },
  howToOrder: {
    kind: 'claim',
    text:
      'Order directly from the Equifax business portal: legal name, EIN, address and primary contact, then download the PDF. Read it for errors and dispute what is wrong — the same play as Experian.',
    source: NERDWALLET_EQUIFAX,
    verifiedOn: V_0805,
  },
  products: [
    { product: 'Business Credit Risk Score', range: '101–992', isTheOneTracked: true, overlapsSilently: false },
    { product: 'Business Failure Score', range: '1,000–1,880', isTheOneTracked: false, overlapsSilently: false },
    { product: 'OneScore for Commercial', range: '300–650', isTheOneTracked: false, overlapsSilently: true },
    { product: 'Payment Index', range: '1–100', isTheOneTracked: false, overlapsSilently: false },
  ],
  productsSource: EQUIFAX_ONESCORE,
  productsVerifiedOn: V_0806,
  trap: [
    {
      kind: 'claim',
      text:
        'OneScore for Commercial runs 300–650, which sits entirely inside this card’s 101–992. Entered here it passes every validation we have and is then measured against a threshold that means nothing on its scale.',
      source: EQUIFAX_ONESCORE,
      verifiedOn: V_0806,
    },
    {
      kind: 'claim',
      text:
        'It is also the likeliest mistake: OneScore is what Equifax leads with in the Industry Report 2.0 bundle, so it is prominent on exactly the PDF an advisor is reading.',
      source: EQUIFAX_ONESCORE,
      verifiedOn: V_0806,
    },
    {
      kind: 'claim',
      text:
        'Failure Score and Payment Index are unmistakable — one is above 1,000, the other below 101 — and both are rejected automatically. Only OneScore needs a human to check. Record it under its own score type rather than here.',
      source: NERDWALLET_EQUIFAX,
      verifiedOn: V_0806,
    },
  ],
};

// ── SBSS — no path; an argument for doing something else ─────

export interface NoPath {
  readonly kind: 'no_path';
  readonly summary: string;
  readonly whyNobodyCanPullIt: readonly Statement[];
  readonly narrowException: Statement;
  readonly whatInfluencesIt: readonly Statement[];
  readonly whatChanged: readonly Statement[];
  readonly whatToDoInstead: readonly string[];
}

export const SBSS_PATH: NoPath = {
  kind: 'no_path',
  summary:
    'There is no acquisition path, and that is not an omission. SBSS is computed when a lender requests it, from an application that does not exist until somebody applies — so there is no dormant score waiting to be pulled.',
  whyNobodyCanPullIt: [
    {
      kind: 'claim',
      text:
        'FICO does not sell a FICO SBSS product directly to business owners the way it sells MyFICO to consumers. Only lenders and approved entities can request it during underwriting.',
      source: NAV_SBSS,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text:
        'FICO is not a credit bureau. SBSS is a scoring model that consumes bureau data rather than a score held at a bureau, so there is no file to request a copy of.',
      source: CRS_SBSS_FACTORS,
      verifiedOn: V_0805,
    },
  ],
  narrowException: {
    kind: 'claim',
    text:
      'Nav states it provides access to "one version of your FICO SBSS scores" through its monitoring platform. Two caveats, both material: the claim is Nav’s own marketing, and one version is not the score a particular lender will compute from a particular application. Treat it as indicative visibility, never as a number to gate a decision on. A client can also simply ask the loan officer who pulled it.',
    source: NAV_SBSS,
    verifiedOn: V_0805,
  },
  whatInfluencesIt: [
    {
      kind: 'claim',
      text:
        'The personal credit history of the business owners — per FICO, typically the most influential factor, and the one the client can both obtain and improve.',
      source: CRS_SBSS_FACTORS,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text: 'Business credit bureau data — the PAYDEX and Intelliscore work on this page feeds it.',
      source: CRS_SBSS_FACTORS,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text: 'Business financials, and the loan application itself.',
      source: CRS_SBSS_FACTORS,
      verifiedOn: V_0805,
    },
  ],
  whatChanged: [
    {
      kind: 'claim',
      text:
        'Effective 1 March 2026 the SBA discontinued the mandatory SBSS prescreen for 7(a) Small Loans of $350,000 and under. Cite notice 5000-876777 — it revised and replaced the amendments issued in the earlier 5000-875701.',
      source: SBA_876777,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text:
        'In its place those loans require full credit analysis, including a minimum debt service coverage ratio of 1.10:1 and two months of commercial bank statements. SBA Express was explicitly unaffected, and the prescreen never applied to 504 loans.',
      source: NAGGL_SUMMARY,
      verifiedOn: V_0805,
    },
    {
      kind: 'claim',
      text:
        'The SBA removed the requirement, not the option. Many lenders still use SBSS by choice, now with their own models, which vary. What ended is SBSS as a universal floor — so "raise your SBSS to N" is no longer sound advice, because N no longer exists and the client could not observe it in any case.',
      source: NAV_SBSS,
      verifiedOn: V_0805,
    },
  ],
  whatToDoInstead: [
    'Coach the owner’s personal credit first — the most influential input, and the only one the client can both see and change.',
    'Keep building business bureau data; the PAYDEX and Intelliscore work above feeds this.',
    'Treat DSCR 1.10:1 as the concrete target where a score threshold used to be.',
    'Make the application complete and documented — it is an input, not paperwork.',
  ],
};

// ── The four, keyed the way the panel already keys them ──────

export type AcquisitionPath = PaydexPath | DisputePath | IdentifyPath | NoPath;

export const ACQUISITION_PATHS = {
  paydex: PAYDEX_PATH,
  intelliscore: INTELLISCORE_PATH,
  equifax_business_risk: EQUIFAX_PATH,
  sbss: SBSS_PATH,
} as const satisfies Record<string, AcquisitionPath>;

export type AcquisitionKey = keyof typeof ACQUISITION_PATHS;

/**
 * Every statement in a path, flattened.
 *
 * Exists for the test that asserts provenance across the whole module — a
 * per-shape walk would silently skip a field somebody adds later, which is the
 * failure this module exists to prevent.
 */
export function statementsIn(path: AcquisitionPath): Statement[] {
  const out: Statement[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (v && typeof v === 'object') {
      const maybe = v as { kind?: unknown };
      if (maybe.kind === 'claim' || maybe.kind === 'unverified') {
        out.push(v as Statement);
        return;
      }
      Object.values(v).forEach(visit);
    }
  };
  visit(path);
  return out;
}

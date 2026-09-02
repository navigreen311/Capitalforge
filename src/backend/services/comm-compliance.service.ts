// ============================================================
// CapitalForge — Communication Compliance Service
//
// Core responsibilities:
//   1. Approved script library with version control
//   2. Banned-claims detector: TWENTY-ODD REGEXES over a fixed list. This said
//      "AI-style pattern scan", and a manual author reading that will describe
//      semantic detection to an agent. `BANNED_CLAIMS` is a literal array of
//      RegExp; nothing here understands language. "We get everyone approved,
//      every time" contains no banned phrase and passes clean.
//   3. Disclosure placement — the required disclosure is placed next to the
//      claim that triggered it where the claim's position is known, and
//      appended only where it is not.
//   4. Score communications for compliance risk (0–100)
//   5. Persist CommComplianceRecord and write ledger events
//
// WHAT riskLevel DOES: NOTHING.
//
//   `riskLevel` is computed from the score and returned, and no code branches
//   on it. The only gate is `approved = riskScore === 0` — any hit at all,
//   however slight, is not approved. That is deliberate for now: a threshold
//   nobody has decided is worse than no threshold. Written down because a
//   field called riskLevel sitting in a response reads like it gates
//   something, and the next person should not have to find out that it does
//   not.
//
// Banned Claim Categories:
//   - Guaranteed approval / certainty claims
//   - Government / SBA affiliation misrepresentation
//   - No-risk / zero-risk assurances
//   - Income / ROI projections
//   - Urgency / high-pressure tactics
//   - Coaching/service misrepresentation
//   - Upfront-fee concealment
// ============================================================

import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import type { ScanChannel } from '@shared/types/index.js';
import logger from '../config/logger.js';

// ── Banned-claim definitions ──────────────────────────────────────

export type BannedClaimCategory =
  | 'guaranteed_approval'
  | 'government_affiliation'
  | 'no_risk_claim'
  | 'income_projection'
  | 'urgency_pressure'
  | 'coaching_misrepresentation'
  | 'upfront_fee_concealment'
  | 'credit_certainty'
  | 'sba_affiliation'
  // ── Added for the marketing-compliance surface ──────────────────
  // These exist because AnimaForge now scans generation scripts through this
  // same list before rendering video. The categories above were written for
  // an advisor talking to one client; a marketing video reaches an audience,
  // and the two claim types below are the ones a video is most likely to make
  // and the ones this list could not previously see.
  //
  // They live HERE, in the one library, and not in AnimaForge. A second
  // banned-phrase list drifts from the first, and the drift is silent.
  | 'rate_or_term_claim'
  | 'credit_improvement_claim';

export interface BannedClaim {
  id: string;
  category: BannedClaimCategory;
  /** Regex pattern used for detection */
  pattern: RegExp;
  /** Human-readable label */
  label: string;
  /** Why this is prohibited */
  rationale: string;
  /** Regulatory basis */
  legalCitation: string;
  /** Severity weight 1–10 */
  severityWeight: number;
  /** Optional example of an acceptable alternative */
  compliantAlternative?: string;
  /** Enforcement case example for training */
}

export const BANNED_CLAIMS: BannedClaim[] = [
  // ── Guaranteed approval ────────────────────────────────────────
  {
    id: 'banned-001',
    category: 'guaranteed_approval',
    pattern: /guaranteed?\s+(approval|credit|funding|limit)/i,
    label: 'Guaranteed approval claim',
    rationale: 'No issuer can guarantee approval. Stating otherwise is a material misrepresentation.',
    legalCitation: 'FTC Act § 5; Dodd-Frank § 1031 (UDAAP)',
    severityWeight: 10,
    compliantAlternative: 'Many of our clients are approved — results depend on your credit profile.',
  },
  {
    id: 'banned-002',
    category: 'guaranteed_approval',
    pattern: /100\s*%\s*(approval|approved|success)/i,
    label: '100% approval rate claim',
    rationale: 'Absolute certainty claims are deceptive when approval rates are variable.',
    legalCitation: 'FTC Act § 5; UDAAP',
    severityWeight: 10,
    compliantAlternative: 'We have a strong track record of approvals for well-qualified businesses.',
  },
  {
    id: 'banned-003',
    category: 'credit_certainty',
    pattern: /you\s+(will|are going to)\s+(get|receive|be approved|qualify)/i,
    label: 'Credit certainty assurance',
    rationale: 'Advisors cannot predict issuer decisions with certainty.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 8,
    compliantAlternative: 'Based on your profile, you may qualify for several products.',
  },

  // ── Government / SBA affiliation ──────────────────────────────
  {
    id: 'banned-004',
    category: 'sba_affiliation',
    pattern: /sba[- ]?(approved|backed|affiliated|program|partner|certified)/i,
    label: 'False SBA affiliation',
    rationale: 'Implying SBA approval or affiliation without authorisation is a federal misrepresentation.',
    legalCitation: 'FTC Act § 5; 15 U.S.C. § 1125 (Lanham Act); SBA Reg. 13 C.F.R. § 120',
    severityWeight: 10,
    compliantAlternative: 'We work with lenders who offer SBA loan products — but we are a private service.',
  },
  {
    id: 'banned-005',
    category: 'government_affiliation',
    pattern: /government[- ](program|backed|approved|affiliated|funded)/i,
    label: 'False government affiliation',
    rationale: 'Claiming government backing without authorisation misleads consumers about source credibility.',
    legalCitation: 'FTC Act § 5; UDAAP',
    severityWeight: 10,
    compliantAlternative: 'This is a private financing programme — not affiliated with any government agency.',
  },
  {
    id: 'banned-006',
    category: 'government_affiliation',
    pattern: /federal(ly)?\s+(approved|backed|funded|program)/i,
    label: 'False federal programme claim',
    rationale: 'Implies federal government endorsement without basis.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 9,
  },

  // ── No-risk / zero-risk ────────────────────────────────────────
  {
    id: 'banned-007',
    category: 'no_risk_claim',
    pattern: /no\s+(risk|downside|danger|liability|personal\s+guarantee)/i,
    label: 'No-risk assurance',
    rationale: 'All business credit products carry real financial risk including personal liability.',
    legalCitation: 'FTC Act § 5; UDAAP',
    severityWeight: 9,
    compliantAlternative: 'We will walk you through the risks and personal guarantee requirements in detail.',
  },
  {
    id: 'banned-008',
    category: 'no_risk_claim',
    pattern: /risk[\s-]free/i,
    label: 'Risk-free claim',
    rationale: 'No commercial credit product is risk-free.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 9,
  },
  {
    id: 'banned-009',
    category: 'no_risk_claim',
    pattern: /zero\s+risk/i,
    label: 'Zero-risk assurance',
    rationale: 'Zero-risk language constitutes a material misrepresentation.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 9,
  },

  // ── Income / ROI projections ──────────────────────────────────
  {
    id: 'banned-010',
    category: 'income_projection',
    pattern: /earn\s+up\s+to\s+\$[\d,]+/i,
    label: 'Income projection claim',
    rationale: 'Projecting specific income from funded activities is deceptive without substantiation.',
    legalCitation: 'FTC Act § 5; FTC Income Disclosure Guidelines',
    severityWeight: 8,
    compliantAlternative: 'Results vary — we focus on helping you access capital, not guarantee returns.',
  },
  {
    id: 'banned-011',
    category: 'income_projection',
    pattern: /make\s+\$[\d,]+\s+(per|a)\s+(month|year|week)/i,
    label: 'Specific income claim',
    rationale: 'Specific income projections are unsubstantiated and deceptive.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 8,
  },
  {
    id: 'banned-012',
    category: 'income_projection',
    pattern: /guaranteed?\s+(return|roi|income|profit|revenue)/i,
    label: 'Guaranteed return claim',
    rationale: 'Guaranteeing financial returns for commercial credit products is deceptive.',
    legalCitation: 'FTC Act § 5; Securities Act (if applicable)',
    severityWeight: 10,
  },

  // ── Urgency / pressure tactics ────────────────────────────────
  {
    id: 'banned-013',
    category: 'urgency_pressure',
    pattern: /must\s+(decide|act|sign|commit)\s+(today|now|immediately|right now)/i,
    label: 'High-pressure urgency tactic',
    rationale: 'Artificial urgency denies consumers time to make informed decisions.',
    legalCitation: 'FTC Act § 5; CFPB UDAAP guidance',
    severityWeight: 7,
    compliantAlternative: 'Take your time to review everything — we are here when you are ready.',
  },
  {
    id: 'banned-014',
    category: 'urgency_pressure',
    pattern: /limited\s+time\s+offer|offer\s+expires|spots?\s+(are\s+)?(limited|filling|almost\s+gone)/i,
    label: 'False scarcity claim',
    rationale: 'False scarcity creates artificial urgency that constitutes an unfair practice.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 7,
  },
  {
    id: 'banned-015',
    category: 'urgency_pressure',
    pattern: /lose\s+your\s+spot|miss\s+your\s+(chance|opportunity|window)/i,
    label: 'Spot-loss pressure tactic',
    rationale: 'Threat of losing access to a non-scarce programme is deceptive.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 6,
  },

  // ── Coaching / service misrepresentation ──────────────────────
  {
    id: 'banned-016',
    category: 'coaching_misrepresentation',
    pattern: /coaching\s+is\s+(completely\s+)?free|free\s+(coaching|consulting|advisory)/i,
    label: 'Free coaching misrepresentation',
    rationale: 'Describing paid programme services as free is deceptive when fees are charged.',
    legalCitation: 'FTC Act § 5; UDAAP',
    severityWeight: 8,
    compliantAlternative: 'Our advisory services are included as part of the programme fee.',
  },
  {
    id: 'banned-017',
    category: 'coaching_misrepresentation',
    pattern: /no\s+(programme|program|membership|advisory)\s+fee/i,
    label: 'Fee concealment claim',
    rationale: 'Denying programme fees when they exist is a material misrepresentation.',
    legalCitation: 'FTC Act § 5; Regulation Z (where applicable)',
    severityWeight: 9,
  },

  // ── Upfront fee concealment ───────────────────────────────────
  {
    id: 'banned-018',
    category: 'upfront_fee_concealment',
    pattern: /no\s+upfront\s+fee|no\s+\w+\s+fee\s+charged\s+upfront|fee\s+charged\s+upfront/i,
    label: 'No upfront fee concealment',
    rationale:
      'Claiming no upfront fees when a programme fee or retainer is charged is deceptive.',
    legalCitation: 'FTC Act § 5; Regulation Z; UDAAP',
    severityWeight: 9,
    compliantAlternative: 'Our programme fee is [amount] — disclosed fully before you sign anything.',
  },
  {
    id: 'banned-019',
    category: 'upfront_fee_concealment',
    pattern: /absolutely\s+no\s+(fees?|charges?|costs?)/i,
    label: 'Absolute fee denial',
    rationale: 'Absolute denial of fees when any fees exist is a deceptive practice.',
    legalCitation: 'FTC Act § 5',
    severityWeight: 10,
  },

  // ── Rate and term claims (TILA / Regulation Z) ─────────────────
  //
  // A stated rate or term is a "trigger term": once one appears in an
  // advertisement, Regulation Z obliges the full set of disclosures alongside
  // it. A video that says "0% APR" and stops has made an incomplete
  // disclosure, which is the violation — not the number itself.
  //
  // These patterns therefore catch the ABSOLUTE and PERMANENT framings, not
  // every mention of a rate. "0% APR for 12 months, then 18.99% variable" is
  // compliant and must pass; "0% APR forever" must not.
  {
    id: 'banned-020',
    category: 'rate_or_term_claim',
    pattern: /(0|zero)\s*%?\s*(apr|interest|rate)\s+(forever|for life|permanently|always|guaranteed)/i,
    label: 'Permanent zero-rate claim',
    rationale:
      'A promotional rate has a defined period. Presenting it as permanent misstates the cost of credit.',
    legalCitation: 'TILA 15 U.S.C. § 1601; Regulation Z 12 C.F.R. § 1026.16 (trigger terms)',
    severityWeight: 10,
    compliantAlternative:
      '0% intro APR for 12 months, then the standard variable rate — currently 18.99%–24.99%.',
  },
  {
    id: 'banned-021',
    category: 'rate_or_term_claim',
    pattern: /\b(no|zero)\s+interest\b(?!\s+(for|during|until|through))/i,
    label: 'Unqualified no-interest claim',
    rationale:
      'A no-interest claim without the period it applies to is an incomplete Regulation Z disclosure.',
    legalCitation: 'TILA 15 U.S.C. § 1601; Regulation Z 12 C.F.R. § 1026.16',
    severityWeight: 8,
    compliantAlternative: 'No interest for the first 12 billing cycles on qualifying purchases.',
  },
  {
    id: 'banned-022',
    category: 'rate_or_term_claim',
    pattern: /(guaranteed|locked[- ]in|fixed)\s+(rate|apr)\b/i,
    label: 'Guaranteed rate claim',
    rationale:
      'The rate offered is set by the issuer at underwriting. Promising one in advance misstates the terms.',
    legalCitation: 'TILA; Regulation Z 12 C.F.R. § 1026.16; FTC Act § 5',
    severityWeight: 9,
    compliantAlternative: 'Rates start at 9.99% APR and depend on your credit profile.',
  },
  {
    id: 'banned-023',
    category: 'rate_or_term_claim',
    pattern: /(lowest|best)\s+(rate|apr)s?\s+(in the|on the|anywhere|guaranteed|available)/i,
    label: 'Superlative rate claim',
    rationale:
      'An unsubstantiated superlative about price is a deceptive comparative claim.',
    legalCitation: 'FTC Act § 5; FTC Guides Concerning Use of Endorsements 16 C.F.R. § 255',
    severityWeight: 7,
  },

  // ── Credit improvement claims (CROA) ───────────────────────────
  //
  // The Credit Repair Organizations Act attaches to anyone who represents
  // that they will improve a consumer's credit record. Burkham Wickmont is
  // not a credit repair organization, and design principle 1 says no feature
  // may recharacterize it as one. A video making any of these claims does
  // exactly that, in writing, to an audience.
  {
    id: 'banned-024',
    category: 'credit_improvement_claim',
    pattern: /(remove|delete|erase|wipe|clear)\s+(negative|derogatory|bad)\s+(items?|marks?|accounts?|entries)/i,
    label: 'Derogatory removal claim',
    rationale:
      'Promising removal of accurate negative information is a CROA-prohibited representation and false.',
    legalCitation: 'CROA 15 U.S.C. § 1679b(a); FTC Act § 5',
    severityWeight: 10,
    compliantAlternative:
      'We do not repair credit. Accurate information stays on your report for the statutory period.',
  },
  {
    id: 'banned-025',
    category: 'credit_improvement_claim',
    pattern: /(fix|repair|restore|rebuild|boost|raise)\s+your\s+credit\b/i,
    label: 'Credit repair representation',
    rationale:
      'Representing that the firm will improve a consumer credit record is the definition of a credit repair organization under CROA.',
    legalCitation: 'CROA 15 U.S.C. § 1679a(3), § 1679b(a)',
    severityWeight: 10,
    compliantAlternative:
      'We structure business credit. We do not offer credit repair and are not a credit repair organization.',
  },
  {
    id: 'banned-026',
    category: 'credit_improvement_claim',
    // `credit` alone is included, not only `credit score`. "Boost your credit
    // by 120 points" is the quantified claim in ordinary speech, and the first
    // version of this pattern required the word "score" — so the phrase was
    // caught by banned-025 as a generic repair claim and recorded under the
    // wrong category. Still blocked, but described wrongly, and the category is
    // what a reviewer reads.
    pattern: /(raise|increase|boost|add)\s+(your\s+)?(credit\s+score|credit|score|fico)\s+(by\s+)?\d+\s*(\+|points?)/i,
    label: 'Quantified score improvement claim',
    rationale:
      'A numeric score-increase promise cannot be substantiated and is a CROA-prohibited representation.',
    legalCitation: 'CROA 15 U.S.C. § 1679b(a)(3); FTC Act § 5',
    severityWeight: 10,
  },
  {
    id: 'banned-027',
    category: 'credit_improvement_claim',
    pattern: /(new|second|clean)\s+credit\s+(file|identity|profile)|credit\s+privacy\s+number|\bcpn\b/i,
    label: 'File segregation / CPN claim',
    rationale:
      'Advising a consumer to obtain a new credit identity is expressly prohibited and is criminal conduct.',
    legalCitation: 'CROA 15 U.S.C. § 1679b(a)(1)-(2); 18 U.S.C. § 1028',
    severityWeight: 10,
  },
];

// ── Disclosure templates for insertion engine ─────────────────────

export interface DisclosureTemplate {
  id: string;
  trigger: string;
  disclosureText: string;
  /**
   * Which channel this disclosure applies to, or 'all'.
   *
   * `document` was missing from this union while being a valid consent and
   * scan channel, so a disclosure could not be marked as applying to a
   * document at all. `ScanChannel` now, plus 'all'.
   */
  channel: ScanChannel | 'all';
  required: boolean;
}

export const REQUIRED_DISCLOSURES: DisclosureTemplate[] = [
  {
    id: 'disc-001',
    trigger: 'credit_application',
    disclosureText:
      'IMPORTANT: Applying for business credit will result in hard inquiries on your personal and/or ' +
      'business credit report. This may temporarily affect your credit score. Approval is subject to ' +
      'each issuer\'s underwriting criteria and is not guaranteed.',
    channel: 'all',
    required: true,
  },
  {
    id: 'disc-002',
    trigger: 'programme_fee',
    disclosureText:
      'Our advisory programme includes a fee of [AMOUNT] due upon engagement. This fee is separate ' +
      'from any credit card annual fees, interest charges, or other costs associated with credit products.',
    channel: 'all',
    required: true,
  },
  {
    id: 'disc-003',
    trigger: 'personal_guarantee',
    disclosureText:
      'NOTICE: Business credit cards typically require a personal guarantee. You may be personally ' +
      'liable for balances if the business is unable to pay. Please review all terms before applying.',
    channel: 'all',
    required: true,
  },
  {
    id: 'disc-004',
    trigger: 'intro_apr',
    disclosureText:
      'RATE DISCLOSURE: Introductory 0% APR periods are temporary. After the promotional period ends, ' +
      'the standard variable APR will apply to remaining balances. Plan to pay off balances before ' +
      'the promotional period expires to avoid interest charges.',
    channel: 'all',
    required: true,
  },
  {
    id: 'disc-005',
    trigger: 'no_affiliation',
    disclosureText:
      'CapitalForge is an independent advisory service. We are not affiliated with, endorsed by, or ' +
      'acting on behalf of any government agency, the SBA, or any card issuer.',
    channel: 'all',
    required: true,
  },
];

// ── Script version management ──────────────────────────────────────

export interface ApprovedScriptVersion {
  version: string;
  content: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  isActive: boolean;
  changeNotes?: string;
}

export interface ApprovedScriptResult {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  currentVersion: ApprovedScriptVersion;
  createdAt: Date;
  updatedAt: Date;
}

// ── Scan result types ──────────────────────────────────────────────

export interface BannedClaimViolation {
  claimId: string;
  category: BannedClaimCategory;
  label: string;
  evidence: string;
  position: number;
  severityWeight: number;
  legalCitation: string;
  compliantAlternative?: string;
  /**
   * How many times this claim appears in the text.
   *
   * The deduplication kept "the highest-severity hit per claim ID", comparing
   * `v.severityWeight > existing.severityWeight` — but severityWeight comes
   * from the claim definition, so every hit of one claim carries the same
   * weight and the comparison was never true. It kept the first occurrence and
   * silently discarded the rest, so a script saying "guaranteed approval" nine
   * times reported and scored exactly as one saying it once.
   *
   * Repetition is the thing worth counting on a marketing script, so the count
   * is reported. It does not multiply the risk score: nine of one claim is one
   * problem to fix, not nine.
   */
  occurrences: number;
  /** Every position, in order. `position` is the first, kept for compatibility. */
  positions: number[];
}

export interface CommComplianceScanResult {
  scanId: string;
  tenantId: string;
  advisorId: string;
  channel: ScanChannel;
  riskScore: number;
  riskLevel: 'clean' | 'low' | 'medium' | 'high' | 'critical';
  violations: BannedClaimViolation[];
  requiredDisclosures: DisclosureTemplate[];
  contentWithDisclosures: string;
  approved: boolean;
  summary: string;
  scannedAt: Date;
}

// ── QA score types ────────────────────────────────────────────────

export interface QaScoreInput {
  tenantId: string;
  advisorId: string;
  callRecordId?: string;
  overallScore: number;
  complianceScore?: number;
  scriptAdherence?: number;
  consentCapture?: number;
  riskClaimAvoidance?: number;
  feedback?: string;
}

export interface QaScoreResult {
  id: string;
  tenantId: string;
  advisorId: string;
  callRecordId: string | null;
  overallScore: number;
  complianceScore: number | null;
  scriptAdherence: number | null;
  consentCapture: number | null;
  riskClaimAvoidance: number | null;
  feedback: string | null;
  scoredAt: Date;
}

/**
 * The advisor a scan was filed against is not a user in this tenant.
 *
 * Typed so the route can answer 422 with a reason rather than a 500, and named
 * for the check rather than the field: what is wrong is not the shape of the
 * id — that was always validated — but that nothing behind it exists.
 */
export class UnknownAdvisorError extends Error {
  constructor(public readonly advisorId: string) {
    super(`No advisor ${advisorId} in this tenant.`);
    this.name = 'UnknownAdvisorError';
  }
}

/**
 * A spoken script needs a disclosure that nothing in the text anchors.
 *
 * On a written message an appended disclosure is imperfect — it is at the
 * bottom, and the reader may not get there. On a spoken one it is a disclosure
 * after the call ended: the script finishes, the advisor stops talking, and
 * the text below the sign-off is read by nobody.
 *
 * So voice refuses. The disclosure is triggered by a keyword rather than by a
 * banned claim, so there is no position to attach it to and no honest place to
 * put it — the script has to be written so the disclosure has somewhere to go,
 * which is a question for whoever wrote it rather than for this function.
 */
export class UnanchoredVoiceDisclosureError extends Error {
  constructor(public readonly disclosureIds: string[]) {
    super(
      `A voice script requires ${disclosureIds.join(', ')}, and nothing in the text `
      + `anchors ${disclosureIds.length === 1 ? 'it' : 'them'}. Appending a disclosure `
      + 'to a spoken script puts it after the '
      + 'sign-off, where it is never said. Place the disclosure in the script yourself, '
      + 'or say the thing that requires it near where it belongs.',
    );
    this.name = 'UnanchoredVoiceDisclosureError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function riskScoreToLevel(score: number): CommComplianceScanResult['riskLevel'] {
  if (score === 0) return 'clean';
  if (score <= 20) return 'low';
  if (score <= 45) return 'medium';
  if (score <= 70) return 'high';
  return 'critical';
}

/**
 * Find every banned claim in a text, once per claim, counting repeats.
 *
 * Extracted because `scanCommunication` and `previewScan` had the same twenty
 * lines twice, and a detection rule maintained in two places is a rule that
 * will disagree with itself.
 */
export function detectBannedClaims(content: string): BannedClaimViolation[] {
  const byClaim = new Map<string, BannedClaimViolation>();

  for (const claim of BANNED_CLAIMS) {
    const flags = claim.pattern.flags.includes('g')
      ? claim.pattern.flags
      : claim.pattern.flags + 'g';
    const regex = new RegExp(claim.pattern.source, flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const existing = byClaim.get(claim.id);
      if (existing) {
        existing.occurrences += 1;
        existing.positions.push(match.index);
      } else {
        byClaim.set(claim.id, {
          claimId:              claim.id,
          category:             claim.category,
          label:                claim.label,
          evidence:             extractEvidence(content, match),
          position:             match.index,
          positions:            [match.index],
          occurrences:          1,
          severityWeight:       claim.severityWeight,
          legalCitation:        claim.legalCitation,
          compliantAlternative: claim.compliantAlternative,
        });
      }
      // Prevent infinite loop on zero-length matches
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  return [...byClaim.values()];
}

function extractEvidence(content: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 20);
  const end = Math.min(content.length, match.index + match[0].length + 20);
  return content.slice(start, end).replace(/\n/g, ' ').trim();
}

function selectRequiredDisclosures(
  content: string,
  violations: BannedClaimViolation[],
): DisclosureTemplate[] {
  const triggered = new Set<string>();

  // disc-005 is NOT added unconditionally any more.
  //
  // Every scanned communication came back carrying the no-affiliation
  // disclosure whether or not anything in it raised the question, and a
  // disclosure that appears on everything is a disclosure nobody reads — which
  // costs you the one message where it mattered. It is triggered below by an
  // affiliation or credit-improvement violation, and here by the words that
  // raise the question in the first place.
  if (/\b(sba|government|federal|agency|affiliat\w*|endorse\w*|approved\s+lender)\b/i.test(content)) {
    triggered.add('disc-005');
  }

  // Trigger based on content keywords
  if (/credit\s*(card|application|apply|limit)/i.test(content)) triggered.add('disc-001');
  if (/fee|cost|charge|price|programme|program/i.test(content)) triggered.add('disc-002');
  if (/personal\s+guarantee|personally\s+liable/i.test(content)) triggered.add('disc-003');
  if (/intro|promotional|0\s*%|zero\s*%\s*apr/i.test(content)) triggered.add('disc-004');

  // Trigger based on violation categories
  for (const v of violations) {
    if (v.category === 'government_affiliation' || v.category === 'sba_affiliation') {
      triggered.add('disc-005');
    }
    if (v.category === 'upfront_fee_concealment' || v.category === 'coaching_misrepresentation') {
      triggered.add('disc-002');
    }
    if (v.category === 'no_risk_claim') {
      triggered.add('disc-003');
    }
    // A rate or term claim is a Regulation Z trigger term: the intro-APR
    // disclosure is what makes the statement complete rather than misleading.
    if (v.category === 'rate_or_term_claim') {
      triggered.add('disc-004');
    }
    // A credit-improvement claim is answered by saying what this firm is not.
    // disc-005 is the no-affiliation text and is always present anyway; naming
    // it here records WHY it was required rather than leaving it to the default.
    if (v.category === 'credit_improvement_claim') {
      triggered.add('disc-005');
    }
  }

  return REQUIRED_DISCLOSURES.filter((d) => triggered.has(d.id));
}

/**
 * Which disclosure answers which kind of claim.
 *
 * The mappings `selectRequiredDisclosures` already uses, read the other way
 * round, so a disclosure can be placed beside the sentence that made it
 * necessary rather than at the end of the message.
 */
const DISCLOSURE_FOR_CATEGORY: Partial<Record<BannedClaimCategory, string>> = {
  government_affiliation:     'disc-005',
  sba_affiliation:            'disc-005',
  credit_improvement_claim:   'disc-005',
  upfront_fee_concealment:    'disc-002',
  coaching_misrepresentation: 'disc-002',
  no_risk_claim:              'disc-003',
  rate_or_term_claim:         'disc-004',
};

/**
 * Put each disclosure next to the claim that triggered it.
 *
 * This appended everything to the end of the message, under a header calling
 * it an "insertion engine". For an email that is fine. `channel` is a free
 * string and voice is expected, and a required disclosure landing after the
 * sign-off of a spoken script is a disclosure that does not do its job — the
 * listener has stopped by then.
 *
 * So: a disclosure answering a claim whose position is known goes in
 * immediately after the sentence containing that claim. One triggered by a
 * keyword rather than a violation has no position to attach to and is
 * appended, which is the honest fallback rather than the default.
 */
function placeDisclosures(
  content: string,
  disclosures: DisclosureTemplate[],
  violations: BannedClaimViolation[],
  channel: ScanChannel | null,
): string {
  if (disclosures.length === 0) return content;

  /** disclosureId -> the earliest claim position it answers. */
  const anchorFor = new Map<string, number>();
  for (const v of violations) {
    const discId = DISCLOSURE_FOR_CATEGORY[v.category];
    if (!discId) continue;
    const at = Math.min(...v.positions);
    const existing = anchorFor.get(discId);
    if (existing === undefined || at < existing) anchorFor.set(discId, at);
  }

  const placed: Array<{ at: number; text: string }> = [];
  const appended: DisclosureTemplate[] = [];

  for (const d of disclosures) {
    const anchor = anchorFor.get(d.id);
    if (anchor === undefined) {
      appended.push(d);
      continue;
    }
    // End of the sentence the claim sits in, so the disclosure follows the
    // statement it qualifies rather than interrupting it.
    const rest = content.slice(anchor);
    const nextBreak = rest.search(/[.!?](\s|$)|\n/);
    const at = nextBreak === -1 ? content.length : anchor + nextBreak + 1;
    placed.push({ at, text: ` [REQUIRED DISCLOSURE] ${d.disclosureText}` });
  }

  // Right to left, so an earlier insertion does not move a later offset.
  placed.sort((a, b) => b.at - a.at);
  let out = content;
  for (const p of placed) {
    out = out.slice(0, p.at) + p.text + out.slice(p.at);
  }

  if (appended.length > 0) {
    // A spoken script does not get an appended disclosure. Appending puts it
    // after the sign-off, where it is never said — see
    // UnanchoredVoiceDisclosureError.
    if (channel === 'voice') {
      throw new UnanchoredVoiceDisclosureError(appended.map((d) => d.id));
    }
    const block = appended
      .map((d) => `[REQUIRED DISCLOSURE] ${d.disclosureText}`)
      .join('\n\n');
    out = `${out}\n\n---\n${block}`;
  }

  return out;
}

function buildScanSummary(
  score: number,
  level: CommComplianceScanResult['riskLevel'],
  violations: BannedClaimViolation[],
): string {
  if (violations.length === 0) {
    return 'Communication is compliant. No banned claims detected.';
  }
  const cats = [...new Set(violations.map((v) => v.category))].join(', ');
  return (
    `${level.toUpperCase()} risk (${score}/100). ` +
    `${violations.length} banned claim(s) detected across categories: ${cats}. ` +
    'Review and revise before sending.'
  );
}

// ── CommComplianceService ──────────────────────────────────────────

export class CommComplianceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? sharedPrisma;
  }

  // ── Script library ────────────────────────────────────────────

  /**
   * Create a new approved script or a new version of an existing script.
   */
  async createScript(params: {
    tenantId: string;
    name: string;
    category: string;
    content: string;
    version: string;
    approvedBy?: string;
    changeNotes?: string;
  }): Promise<ApprovedScriptResult> {
    const now = new Date();

    const record = await this.prisma.approvedScript.create({
      data: {
        id:         uuidv4(),
        tenantId:   params.tenantId,
        name:       params.name,
        category:   params.category,
        content:    params.content,
        version:    params.version,
        isActive:   true,
        approvedBy: params.approvedBy ?? null,
        approvedAt: params.approvedBy ? now : null,
      },
    });

    return this._mapScript(record);
  }

  /**
   * Retrieve all active approved scripts for a tenant, optionally filtered by category.
   */
  async listScripts(tenantId: string, category?: string): Promise<ApprovedScriptResult[]> {
    const records = await this.prisma.approvedScript.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this._mapScript(r));
  }

  /**
   * Retrieve a single script by ID, verifying tenant ownership.
   */
  async getScript(scriptId: string, tenantId: string): Promise<ApprovedScriptResult | null> {
    const record = await this.prisma.approvedScript.findFirst({
      where: { id: scriptId, tenantId },
    });

    return record ? this._mapScript(record) : null;
  }

  /**
   * Deactivate (soft-delete) a script version.
   */
  async deactivateScript(scriptId: string, tenantId: string): Promise<boolean> {
    const existing = await this.prisma.approvedScript.findFirst({
      where: { id: scriptId, tenantId },
    });

    if (!existing) return false;

    await this.prisma.approvedScript.update({
      where: { id: scriptId },
      data: { isActive: false, updatedAt: new Date() },
    });

    return true;
  }

  // ── Banned-claims scanner ──────────────────────────────────────

  /**
   * Scan advisor communication text for banned claims. Persists a
   * CommComplianceRecord and emits a ledger event.
   */
  async scanCommunication(params: {
    tenantId: string;
    advisorId: string;
    /**
     * One of SCAN_CHANNELS. Was `string`, so this module could not express a
     * distinction the compliance library already made — and the column behind
     * it was unconstrained too. It matters here: placement depends on whether
     * a script is spoken.
     */
    channel: ScanChannel;
    content: string;
  }): Promise<CommComplianceScanResult> {
    // ── The advisor has to be an advisor ─────────────────────────
    //
    // `advisorId` was validated as a UUID and nothing else. Every record this
    // module writes hangs off it — the scan, its content, its violations, and
    // the QA scores listed at GET /advisors/:id/qa-scores, which filters on
    // `{ advisorId, tenantId }` and therefore reports faithfully over an
    // attribution nobody checked.
    //
    // Refused rather than defaulted to the caller. A scan filed against the
    // person who ran it, when they named somebody else, is a different wrong
    // answer rather than a fix.
    const advisor = await this.prisma.user.findFirst({
      where:  { id: params.advisorId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!advisor) {
      // Same answer for an id that does not exist and one in another tenant.
      throw new UnknownAdvisorError(params.advisorId);
    }

    const scanId = uuidv4();

    // One detector, shared with scoreCommunication. Repeats are counted rather
    // than discarded; see BannedClaimViolation.occurrences.
    const deduped = detectBannedClaims(params.content);

    // ── Risk score calculation ───────────────────────────────────
    // Additive: each distinct violation contributes its severityWeight * 5,
    // capped at 100. Repetition is reported in `occurrences` and does not
    // multiply the score — nine of one claim is one problem to fix.
    //
    // There is no hard stop at 70. The header used to say there was; 70 is the
    // high/critical boundary in `riskScoreToLevel` and nothing branches on it.
    const rawScore = deduped.reduce((sum, v) => sum + v.severityWeight * 5, 0);
    const riskScore = Math.min(100, rawScore);
    const riskLevel = riskScoreToLevel(riskScore);
    const approved  = riskScore === 0;

    // ── Disclosure placement ─────────────────────────────────────
    const requiredDisclosures = selectRequiredDisclosures(params.content, deduped);
    const contentWithDisclosures = placeDisclosures(
      params.content,
      requiredDisclosures,
      deduped,
      params.channel,
    );

    const summary = buildScanSummary(riskScore, riskLevel, deduped);

    // ── Persist record ───────────────────────────────────────────
    await this.prisma.commComplianceRecord.create({
      data: {
        id:         scanId,
        tenantId:   params.tenantId,
        advisorId:  params.advisorId,
        channel:    params.channel,
        content:    params.content,
        violations: deduped as unknown as object,
        riskScore,
        approved,
        // `reviewedAt`, set to now. A field named for review recorded when the
        // automation ran, and a compliance reader seeing "reviewed" concludes
        // a person looked at it. Human review is `humanReviewedAt` with
        // `reviewedByUserId`, both null until somebody actually does.
        scannedAt: new Date(),
        // What the scan required, and the text that would go out. Both were
        // returned to the caller and discarded; a complaint turns on the
        // second one.
        requiredDisclosures: requiredDisclosures as unknown as object,
        contentWithDisclosures,
      },
    });

    // ── Write ledger events ──────────────────────────────────────
    if (deduped.length > 0) {
      // publishAndPersist, not publish.
      //
      // This broadcast in-process and wrote no ledger row, so the canonical
      // ledger — the thing a regulator is shown — had no record that a
      // compliance violation had ever been detected. Every other module in
      // this codebase persists: statements, consent, the regulator dossier.
      // Of all the event types here, this is the one that has to be in there.
      await eventBus.publishAndPersist(params.tenantId, {
        eventType:     EVENT_TYPES.CALL_COMPLIANCE_VIOLATION,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId:   scanId,
        payload: {
          advisorId:      params.advisorId,
          channel:        params.channel,
          riskScore,
          riskLevel,
          violationCount: deduped.length,
          categories:     [...new Set(deduped.map((v) => v.category))],
        },
      });
    }

    logger.info('Communication compliance scan completed', {
      scanId,
      tenantId:       params.tenantId,
      advisorId:      params.advisorId,
      riskScore,
      riskLevel,
      violationCount: deduped.length,
    });

    return {
      scanId,
      tenantId:   params.tenantId,
      advisorId:  params.advisorId,
      channel:    params.channel,
      riskScore,
      riskLevel,
      violations: deduped,
      requiredDisclosures,
      contentWithDisclosures,
      approved,
      summary,
      scannedAt: new Date(),
    };
  }

  /**
   * Score a communication synchronously without persisting — useful
   * for real-time UI feedback.
   */
  scoreCommunication(content: string): {
    riskScore: number;
    riskLevel: CommComplianceScanResult['riskLevel'];
    violations: BannedClaimViolation[];
    approved: boolean;
  } {
    // The same detector `scanCommunication` uses. This held a second copy of
    // the twenty-line matching loop and its own deduplication, so the
    // preview an advisor sees while typing and the record written on submit
    // were computed by two implementations of one rule.
    const deduped = detectBannedClaims(content);

    const rawScore = deduped.reduce((sum, v) => sum + v.severityWeight * 5, 0);
    const riskScore = Math.min(100, rawScore);
    const riskLevel = riskScoreToLevel(riskScore);

    return { riskScore, riskLevel, violations: deduped, approved: riskScore === 0 };
  }

  /**
   * Append named disclosures to a content block without scanning.
   *
   * Appends, and says so. The caller names disclosure ids directly rather than
   * scanning, so there is no violation and no position to place any of them
   * beside — which is exactly the case `placeDisclosures` appends in.
   */
  appendRequiredDisclosures(content: string, triggerIds: string[]): string {
    const disclosures = REQUIRED_DISCLOSURES.filter((d) => triggerIds.includes(d.id));
    // No channel: this names disclosure ids directly rather than scanning, so
    // there is nothing to refuse on behalf of.
    return placeDisclosures(content, disclosures, [], null);
  }

  // ── QA scoring ────────────────────────────────────────────────

  /**
   * Record a QA score for an advisor call.
   */
  async recordQaScore(input: QaScoreInput): Promise<QaScoreResult> {
    const record = await this.prisma.advisorQaScore.create({
      data: {
        id:                 uuidv4(),
        tenantId:           input.tenantId,
        advisorId:          input.advisorId,
        callRecordId:       input.callRecordId ?? null,
        overallScore:       input.overallScore,
        complianceScore:    input.complianceScore ?? null,
        scriptAdherence:    input.scriptAdherence ?? null,
        consentCapture:     input.consentCapture ?? null,
        riskClaimAvoidance: input.riskClaimAvoidance ?? null,
        feedback:           input.feedback ?? null,
      },
    });

    return this._mapQaScore(record);
  }

  /**
   * List QA scores for an advisor, most recent first.
   */
  async listQaScores(
    advisorId: string,
    tenantId: string,
    limit = 20,
  ): Promise<QaScoreResult[]> {
    const records = await this.prisma.advisorQaScore.findMany({
      where:   { advisorId, tenantId },
      orderBy: { scoredAt: 'desc' },
      take:    limit,
    });

    return records.map((r) => this._mapQaScore(r));
  }

  /**
   * Return the average QA scores for an advisor over a date range.
   */
  async getAdvisorQaAverage(
    advisorId: string,
    tenantId: string,
    since?: Date,
  ): Promise<{
    /** Null when no communication has been scanned for this advisor. */
    averageOverall: number | null;
    averageCompliance: number | null;
    averageScriptAdherence: number | null;
    averageConsentCapture: number | null;
    averageRiskClaimAvoidance: number | null;
    sampleCount: number;
  }> {
    const where: Record<string, unknown> = { advisorId, tenantId };
    if (since) where['scoredAt'] = { gte: since };

    const records = await this.prisma.advisorQaScore.findMany({
      where,
      select: {
        overallScore:       true,
        complianceScore:    true,
        scriptAdherence:    true,
        consentCapture:     true,
        riskClaimAvoidance: true,
      },
    });

    if (records.length === 0) {
      return {
        // null, like the four beside it. An advisor nobody has scanned has not
        // scored zero — zero is the worst score this scale has, and it was the
        // one field in this object that did not follow the file's own
        // convention. The `avg` helper below already returns null when there is
        // nothing to average.
        averageOverall:            null,
        averageCompliance:         null,
        averageScriptAdherence:    null,
        averageConsentCapture:     null,
        averageRiskClaimAvoidance: null,
        sampleCount:               0,
      };
    }

    const avg = (vals: (number | null)[]): number | null => {
      const valid = vals.filter((v): v is number => v !== null);
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    };

    return {
      averageOverall:            records.reduce((s, r) => s + r.overallScore, 0) / records.length,
      averageCompliance:         avg(records.map((r) => r.complianceScore)),
      averageScriptAdherence:    avg(records.map((r) => r.scriptAdherence)),
      averageConsentCapture:     avg(records.map((r) => r.consentCapture)),
      averageRiskClaimAvoidance: avg(records.map((r) => r.riskClaimAvoidance)),
      sampleCount:               records.length,
    };
  }

  // ── Private mapping helpers ───────────────────────────────────

  private _mapScript(record: {
    id: string;
    tenantId: string;
    name: string;
    category: string;
    content: string;
    version: string;
    isActive: boolean;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ApprovedScriptResult {
    return {
      id:       record.id,
      tenantId: record.tenantId,
      name:     record.name,
      category: record.category,
      currentVersion: {
        version:    record.version,
        content:    record.content,
        approvedBy: record.approvedBy,
        approvedAt: record.approvedAt,
        isActive:   record.isActive,
      },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private _mapQaScore(record: {
    id: string;
    tenantId: string;
    advisorId: string;
    callRecordId: string | null;
    overallScore: number;
    complianceScore: number | null;
    scriptAdherence: number | null;
    consentCapture: number | null;
    riskClaimAvoidance: number | null;
    feedback: string | null;
    scoredAt: Date;
  }): QaScoreResult {
    return {
      id:                 record.id,
      tenantId:           record.tenantId,
      advisorId:          record.advisorId,
      callRecordId:       record.callRecordId,
      overallScore:       record.overallScore,
      complianceScore:    record.complianceScore,
      scriptAdherence:    record.scriptAdherence,
      consentCapture:     record.consentCapture,
      riskClaimAvoidance: record.riskClaimAvoidance,
      feedback:           record.feedback,
      scoredAt:           record.scoredAt,
    };
  }

  /**
   * Return the full banned claims library (for admin/training use).
   */
  getBannedClaimsLibrary(): Omit<BannedClaim, 'pattern'>[] {
    return BANNED_CLAIMS.map(({ pattern: _p, ...rest }) => rest);
  }
}

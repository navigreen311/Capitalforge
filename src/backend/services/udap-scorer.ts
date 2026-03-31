// ============================================================
// CapitalForge — UDAP / UDAAP Risk Scorer
//
// Scores client interactions and deal representations for risk
// under the FTC Act Section 5 (UDAP) and Dodd-Frank Section 1031
// (UDAAP).  Each violation category carries a severity weight;
// the final score is a weighted sum capped at 100.
//
// Red-flag patterns drawn from published FTC enforcement actions
// in the credit-repair, business-coaching, and MCA/credit-stacking
// space.
//
// This is a rule-based stub.  In production, augment with an
// NLP classifier trained on your call/chat transcript corpus.
// ============================================================

// ── Types ────────────────────────────────────────────────────────

export type UdapViolationType =
  | 'misleading_fee_representation'
  | 'product_mismatch_claim'
  | 'unauthorized_consent'
  | 'pressure_tactic'
  | 'missing_disclosure'
  | 'government_affiliation_claim'
  | 'no_upfront_fee_claim'
  | 'coaching_misrepresentation'
  | 'guaranteed_approval_claim'
  | 'income_projection_misrepresentation';

export interface UdapViolation {
  type: UdapViolationType;
  /** Matched text or pattern that triggered this finding */
  evidence: string;
  /** Severity weight used in final score calculation (1 – 10) */
  severityWeight: number;
  /** Short human-readable description of the concern */
  description: string;
}

export interface UdapScorerInput {
  /** Free-form text to analyse (call transcript excerpt, email, chat message, etc.) */
  interactionText: string;
  /** Optional: name of the product being discussed */
  productContext?: string;
  /** Optional: whether a SB 1235 / equivalent disclosure has already been sent */
  disclosureSent?: boolean;
  /** Optional: whether written consent was obtained before this interaction */
  consentOnFile?: boolean;
}

export interface UdapScorerOutput {
  /** 0 – 100 aggregate UDAP/UDAAP risk score */
  score: number;
  violations: UdapViolation[];
  /** True when score >= 70 or any critical violation present */
  requiresReview: boolean;
  /** True when score >= 90 — deal must be halted pending legal review */
  hardStop: boolean;
  summary: string;
}

// ── Violation definitions ────────────────────────────────────────
// severityWeight 1–10; higher = more dangerous under enforcement precedent

interface ViolationRule {
  type: UdapViolationType;
  severityWeight: number;
  description: string;
  /** Regex patterns tested against lowercased interactionText */
  patterns: RegExp[];
}

const VIOLATION_RULES: ViolationRule[] = [
  {
    type: 'no_upfront_fee_claim',
    severityWeight: 9,
    description:
      'FTC red flag: "no upfront fee" claims without clear disclosure of all program costs. ' +
      'Violates FTC Act §5 when fees are deferred or embedded (FTC v. Lanier Law 2017).',
    patterns: [
      /no\s+upfront\s+fee/i,
      /zero\s+upfront/i,
      /nothing\s+upfront/i,
      /no\s+cost\s+to\s+(you|start|begin)/i,
      /free\s+to\s+(start|join|enroll)/i,
    ],
  },
  {
    type: 'government_affiliation_claim',
    severityWeight: 10,
    description:
      'FTC red flag: implied or explicit government/SBA affiliation without authorisation. ' +
      'Categorically deceptive under UDAP (FTC v. MBA Center 2019).',
    patterns: [
      /sba[\s-]?(approved|backed|certified|authorized|affiliated)/i,
      /government[\s-]?(program|grant|funding|backed)/i,
      /federal[\s-]?(program|funding|grant|backed)/i,
      /\bfdic\b.*program/i,
      /treasury[\s-]?program/i,
    ],
  },
  {
    type: 'coaching_misrepresentation',
    severityWeight: 8,
    description:
      'FTC red flag: representing a fee-based coaching program as free funding or credit access. ' +
      'High enforcement risk in credit-stacking space (FTC v. Business Funding Suite 2021).',
    patterns: [
      /coaching\s+(is\s+)?(free|no\s+cost|included)/i,
      /training\s+(is\s+)?(free|no\s+cost|included)/i,
      /mentorship\s+at\s+no\s+(additional\s+)?charge/i,
      /program\s+fee.*not\s+required/i,
    ],
  },
  {
    type: 'guaranteed_approval_claim',
    severityWeight: 9,
    description:
      'Guaranteeing credit approval is deceptive and violates UDAP/UDAAP. ' +
      'Issuer decisions are independent and cannot be guaranteed.',
    patterns: [
      /guaranteed?\s+(approval|credit|funding|card)/i,
      /100\s*%\s*approval/i,
      /approve[sd]?\s+(no matter|regardless)/i,
      /certain\s+to\s+(get|receive|be\s+approved)/i,
      /we\s+guarantee\s+you\s+(will\s+)?(get|receive)/i,
    ],
  },
  {
    type: 'misleading_fee_representation',
    severityWeight: 8,
    description:
      'Misrepresenting, omitting, or burying material fees (program fees, processing fees, ' +
      'cash-advance fees) constitutes an unfair or deceptive act under UDAAP.',
    patterns: [
      /no\s+(hidden\s+)?fees/i,
      /totally\s+free/i,
      /only\s+pay\s+when\s+you\s+use\s+it/i,
      /no\s+monthly\s+fee[s]?\b(?!.*unless)/i,
      /fee.{0,30}waived\s+(forever|always|permanently)/i,
    ],
  },
  {
    type: 'product_mismatch_claim',
    severityWeight: 7,
    description:
      'Presenting a product (e.g. a revolving credit card) as something materially different ' +
      '(e.g. a term loan, line of credit, or cash grant) is deceptive under UDAAP.',
    patterns: [
      /credit\s+card.{0,40}(same\s+as|equivalent\s+to|works\s+like)\s+(a\s+)?(loan|line\s+of\s+credit)/i,
      /cash\s+advance.{0,30}(interest[\s-]?free|no\s+cost)/i,
      /revolving.{0,30}(same\s+as|like\s+a?)\s+grant/i,
      /unsecured.{0,30}(grant|free\s+money)/i,
    ],
  },
  {
    type: 'income_projection_misrepresentation',
    severityWeight: 8,
    description:
      'Projecting specific earnings or revenue increases without substantiation violates ' +
      'FTC endorsement guides and UDAP. Common in business-coaching upsell contexts.',
    patterns: [
      /earn\s+(up\s+to\s+)?\$[\d,]+\s+(per\s+month|monthly|a\s+month)/i,
      /make\s+(up\s+to\s+)?\$[\d,]+\s+(per\s+month|monthly)/i,
      /average\s+(client|customer|member)\s+(earns|makes|generates)/i,
      /guaranteed?\s+(income|revenue|profit|return)/i,
      /double\s+(your\s+)?(income|revenue|profit)\s+in/i,
    ],
  },
  {
    type: 'pressure_tactic',
    severityWeight: 6,
    description:
      'High-pressure sales tactics that prevent informed decision-making constitute "unfair" ' +
      'practices under UDAP (limited time, manufactured urgency, fear-based selling).',
    patterns: [
      /offer\s+expires?\s+(today|tonight|in\s+\d+\s+hour)/i,
      /only\s+\d+\s+spots?\s+(left|remaining|available)/i,
      /this\s+(offer|deal|rate)\s+(won.t|will\s+not)\s+last/i,
      /decide\s+(right\s+now|immediately|on\s+this\s+call)/i,
      /if\s+you\s+don.t\s+(act|sign|decide)\s+(now|today)/i,
      /lose\s+(your\s+)?(spot|place|opportunity)\s+if/i,
    ],
  },
  {
    type: 'unauthorized_consent',
    severityWeight: 9,
    description:
      'Proceeding with a hard inquiry, application, or ACH debit without documented consent ' +
      'violates FCRA, EFTA, and UDAAP. Consent must be affirmative, specific, and on record.',
    patterns: [
      /without\s+(your\s+)?(permission|consent|authoriz)/i,
      /we.ll\s+(just\s+)?(run|pull|check)\s+(your\s+)?(credit|report)/i,
      /automatically\s+(enroll|sign\s+you|add\s+you|debit)/i,
      /pull\s+(your\s+)?credit\s+without/i,
    ],
  },
  {
    type: 'missing_disclosure',
    severityWeight: 7,
    description:
      'Material terms (APR, fees, personal guarantee, cash-advance costs) must be disclosed ' +
      'prior to application or enrollment per TILA, Reg Z, and state SB 1235 equivalents.',
    patterns: [
      /don.t\s+(need|worry\s+about)\s+(to\s+)?(read|review)\s+the\s+(fine\s+print|terms|agreement)/i,
      /sign\s+(here|now)\s+(and\s+)?we.ll\s+explain\s+later/i,
      /terms.{0,20}not\s+important/i,
      /skip\s+the\s+(disclosure|fine\s+print|terms)/i,
    ],
  },
];

// ── Scoring ──────────────────────────────────────────────────────

/** Max raw weighted sum achievable across all rules at weight 10. */
const MAX_RAW_SCORE = VIOLATION_RULES.reduce((sum, r) => sum + r.severityWeight * 10, 0);

/**
 * Analyse the interaction text for UDAP/UDAAP violation patterns.
 *
 * Scoring algorithm:
 *  1. Each matched rule contributes `severityWeight × 10` raw points.
 *  2. If `disclosureSent === false`, `missing_disclosure` weight is doubled.
 *  3. If `consentOnFile === false`, `unauthorized_consent` weight is doubled.
 *  4. Raw sum is normalised to [0, 100].
 */
export function scoreUdapRisk(input: UdapScorerInput): UdapScorerOutput {
  const text = input.interactionText;
  const violations: UdapViolation[] = [];
  let rawScore = 0;

  for (const rule of VIOLATION_RULES) {
    const matched: string[] = [];

    for (const pattern of rule.patterns) {
      const match = pattern.exec(text);
      if (match) {
        matched.push(match[0]);
      }
    }

    if (matched.length > 0) {
      // Apply context multipliers for known aggravating factors
      let weight = rule.severityWeight;
      if (rule.type === 'missing_disclosure' && input.disclosureSent === false) {
        weight = Math.min(10, weight * 1.5);
      }
      if (rule.type === 'unauthorized_consent' && input.consentOnFile === false) {
        weight = Math.min(10, weight * 1.5);
      }

      rawScore += weight * 10;

      violations.push({
        type: rule.type,
        evidence: matched.join(' | '),
        severityWeight: weight,
        description: rule.description,
      });
    }
  }

  // Normalise to 0–100
  const score = Math.min(100, Math.round((rawScore / MAX_RAW_SCORE) * 100));
  const requiresReview =
    score >= 40 ||
    violations.some(
      (v) =>
        v.type === 'government_affiliation_claim' ||
        v.type === 'guaranteed_approval_claim' ||
        v.type === 'unauthorized_consent',
    );
  const hardStop =
    score >= 75 ||
    violations.some(
      (v) =>
        v.type === 'government_affiliation_claim' || v.type === 'guaranteed_approval_claim',
    );

  const summary = buildSummary(score, violations, hardStop);

  return { score, violations, requiresReview, hardStop, summary };
}

function buildSummary(
  score: number,
  violations: UdapViolation[],
  hardStop: boolean,
): string {
  if (violations.length === 0) {
    return `No UDAP/UDAAP red flags detected. Score: ${score}/100.`;
  }
  const violationList = violations.map((v) => v.type).join(', ');
  const prefix = hardStop
    ? `HARD STOP — UDAP/UDAAP Score ${score}/100.`
    : `UDAP/UDAAP Score ${score}/100 — review required.`;
  return `${prefix} Violations detected: ${violationList}.`;
}

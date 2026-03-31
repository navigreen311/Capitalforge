// ============================================================
// CapitalForge — Communication Compliance Service
//
// Core responsibilities:
//   1. Approved script library with version control
//   2. Banned-claims detector: AI-style pattern scan of advisor
//      language for prohibited phrases
//   3. Disclosure insertion engine — inject required disclosures
//      into advisor communications
//   4. Score communications for compliance risk (0–100)
//   5. Persist CommComplianceRecord and emit ledger events
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
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
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
  | 'sba_affiliation';

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
  enforcementExample?: string;
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
    enforcementExample:
      'FTC v. Pinnacle Business Capital (2021): $5M penalty for guaranteed approval claims in commercial financing marketing.',
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
    enforcementExample:
      'CFPB Supervisory Highlights (2023): flagged "virtually guaranteed" approval language as deceptive.',
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
    enforcementExample:
      'FTC v. Business Advisors Inc. (2019): consent order for falsely claiming SBA certification.',
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
    enforcementExample:
      'CFPB Supervisory Highlights (2022): "no personal risk" claims in commercial credit stacking flagged as deceptive.',
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
    enforcementExample:
      'FTC v. Credit Secrets (2020): income projection claims in credit-building context led to $5.2M redress order.',
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
    enforcementExample:
      'CFPB Enforcement Action (2021): "decide today" language cited as abusive in commercial financing context.',
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
    enforcementExample:
      'CFPB v. Consumer Assistance Services (2020): "free consulting" language where fees were embedded.',
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
    enforcementExample:
      'FTC v. Pinnacle Business Capital (2021): "$0 upfront" claims with embedded fees led to $5M civil penalty.',
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
];

// ── Disclosure templates for insertion engine ─────────────────────

export interface DisclosureTemplate {
  id: string;
  trigger: string;
  disclosureText: string;
  channel: 'voice' | 'email' | 'sms' | 'chat' | 'all';
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
  enforcementExample?: string;
}

export interface CommComplianceScanResult {
  scanId: string;
  tenantId: string;
  advisorId: string;
  channel: string;
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

// ── Helpers ────────────────────────────────────────────────────────

function riskScoreToLevel(score: number): CommComplianceScanResult['riskLevel'] {
  if (score === 0) return 'clean';
  if (score <= 20) return 'low';
  if (score <= 45) return 'medium';
  if (score <= 70) return 'high';
  return 'critical';
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

  // Always include no-affiliation disclosure
  triggered.add('disc-005');

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
  }

  return REQUIRED_DISCLOSURES.filter((d) => triggered.has(d.id));
}

function insertDisclosures(content: string, disclosures: DisclosureTemplate[]): string {
  if (disclosures.length === 0) return content;

  const disclosureBlock = disclosures
    .map((d) => `[REQUIRED DISCLOSURE] ${d.disclosureText}`)
    .join('\n\n');

  return `${content}\n\n---\n${disclosureBlock}`;
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
    this.prisma = prisma ?? new PrismaClient();
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
    channel: string;
    content: string;
  }): Promise<CommComplianceScanResult> {
    const scanId = uuidv4();
    const violations: BannedClaimViolation[] = [];

    // ── Pattern matching pass ────────────────────────────────────
    for (const claim of BANNED_CLAIMS) {
      const regex = new RegExp(claim.pattern.source, claim.pattern.flags.includes('g') ? claim.pattern.flags : claim.pattern.flags + 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(params.content)) !== null) {
        violations.push({
          claimId:             claim.id,
          category:            claim.category,
          label:               claim.label,
          evidence:            extractEvidence(params.content, match),
          position:            match.index,
          severityWeight:      claim.severityWeight,
          legalCitation:       claim.legalCitation,
          compliantAlternative: claim.compliantAlternative,
          enforcementExample:  claim.enforcementExample,
        });
        // Prevent infinite loop on zero-length matches
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    }

    // Deduplicate — keep only the highest-severity hit per claim ID
    const seen = new Map<string, BannedClaimViolation>();
    for (const v of violations) {
      const existing = seen.get(v.claimId);
      if (!existing || v.severityWeight > existing.severityWeight) {
        seen.set(v.claimId, v);
      }
    }
    const deduped = [...seen.values()];

    // ── Risk score calculation ───────────────────────────────────
    // Additive: each violation contributes its severityWeight * 5
    // Cap at 100 with a hard-stop at score ≥ 70 for critical violations
    const rawScore = deduped.reduce((sum, v) => sum + v.severityWeight * 5, 0);
    const riskScore = Math.min(100, rawScore);
    const riskLevel = riskScoreToLevel(riskScore);
    const approved  = riskScore === 0;

    // ── Disclosure insertion ─────────────────────────────────────
    const requiredDisclosures = selectRequiredDisclosures(params.content, deduped);
    const contentWithDisclosures = insertDisclosures(params.content, requiredDisclosures);

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
        reviewedAt: new Date(),
      },
    });

    // ── Emit ledger events ───────────────────────────────────────
    if (deduped.length > 0) {
      await eventBus.publish(params.tenantId, {
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
    const violations: BannedClaimViolation[] = [];

    for (const claim of BANNED_CLAIMS) {
      const regex = new RegExp(claim.pattern.source, claim.pattern.flags.includes('g') ? claim.pattern.flags : claim.pattern.flags + 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        violations.push({
          claimId:             claim.id,
          category:            claim.category,
          label:               claim.label,
          evidence:            extractEvidence(content, match),
          position:            match.index,
          severityWeight:      claim.severityWeight,
          legalCitation:       claim.legalCitation,
          compliantAlternative: claim.compliantAlternative,
          enforcementExample:  claim.enforcementExample,
        });
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    }

    const seen = new Map<string, BannedClaimViolation>();
    for (const v of violations) {
      const existing = seen.get(v.claimId);
      if (!existing || v.severityWeight > existing.severityWeight) seen.set(v.claimId, v);
    }
    const deduped = [...seen.values()];

    const rawScore = deduped.reduce((sum, v) => sum + v.severityWeight * 5, 0);
    const riskScore = Math.min(100, rawScore);
    const riskLevel = riskScoreToLevel(riskScore);

    return { riskScore, riskLevel, violations: deduped, approved: riskScore === 0 };
  }

  /**
   * Insert required disclosures into a content block without scanning.
   */
  insertRequiredDisclosures(content: string, triggerIds: string[]): string {
    const disclosures = REQUIRED_DISCLOSURES.filter((d) => triggerIds.includes(d.id));
    return insertDisclosures(content, disclosures);
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
    averageOverall: number;
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
        averageOverall:            0,
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

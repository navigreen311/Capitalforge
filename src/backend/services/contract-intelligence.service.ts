// ============================================================
// CapitalForge — Contract Intelligence Service
//
// Core responsibilities:
//   1. Extract and classify contract clauses (fees, refund, arbitration,
//      non-disparagement, indemnification)
//   2. Red-flag detection based on FTC enforcement patterns
//   3. Missing-protection alerts
//   4. Contract comparison lab: side-by-side clause matrix
//
// FTC Enforcement Patterns Checked:
//   - Mandatory binding arbitration with class-action waiver
//   - Unilateral modification rights
//   - Broad indemnification shifting all risk to client
//   - Non-disparagement silencing client complaints
//   - Unconscionable refund/cancellation terms
//   - Hidden fee escalation clauses
//   - Auto-renewal with inadequate notice
//   - Limitation of liability below statutory minimums
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Clause types ──────────────────────────────────────────────────

export type ClauseType =
  | 'fee'
  | 'refund'
  | 'arbitration'
  | 'non_disparagement'
  | 'indemnification'
  | 'auto_renewal'
  | 'unilateral_modification'
  | 'limitation_of_liability'
  | 'governing_law'
  | 'class_action_waiver'
  | 'termination'
  | 'intellectual_property'
  | 'confidentiality'
  | 'force_majeure'
  | 'other';

export type RedFlagSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ExtractedClause {
  id: string;
  type: ClauseType;
  title: string;
  text: string;
  /** 0–100 confidence that this is the correct clause type */
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

export interface RedFlag {
  id: string;
  severity: RedFlagSeverity;
  category: string;
  description: string;
  clauseId?: string;
  ftcPattern: string;
  recommendation: string;
}

export interface MissingProtection {
  id: string;
  name: string;
  description: string;
  importance: 'required' | 'strongly_recommended' | 'recommended';
  reference?: string;
}

// ── Analysis I/O ──────────────────────────────────────────────────

export interface ContractAnalysisInput {
  tenantId: string;
  contractType: string;
  documentText: string;
  documentId?: string;
  partnerId?: string;
}

export interface ContractAnalysisResult {
  id: string;
  tenantId: string;
  contractType: string;
  extractedClauses: ExtractedClause[];
  redFlags: RedFlag[];
  missingProtections: MissingProtection[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  analyzedAt: Date;
}

// ── Comparison I/O ────────────────────────────────────────────────

export interface ComparisonRow {
  clauseType: ClauseType;
  clauseTitle: string;
  contracts: Record<string, { text: string | null; redFlags: string[] }>;
}

export interface ContractComparisonResult {
  contractIds: string[];
  clauseMatrix: ComparisonRow[];
  winner?: string;
  summary: string;
}

// ── Keyword patterns per clause type ─────────────────────────────

const CLAUSE_PATTERNS: Record<ClauseType, RegExp[]> = {
  fee: [
    /\b(fee[s]?|charge[s]?|cost[s]?|payment[s]?|price|pricing|rate[s]?|amount due)\b/i,
    /\b(upfront|setup|origination|processing|service|program|membership)\s+fee\b/i,
  ],
  refund: [
    /\b(refund[s]?|return[s]?|reimburse|cancell?ation|money.back)\b/i,
    /\b(no refund|non.refundable|all sales final)\b/i,
  ],
  arbitration: [
    /\b(arbitrat(ion|e|or)|adr|alternative dispute resolution)\b/i,
    /\b(jams|aaa arbitration|binding arbitration|final and binding)\b/i,
  ],
  non_disparagement: [
    /\b(non.?disparagement|not disparage|disparaging|derogatory|defamatory)\b/i,
    /\b(negative review|public comment|social media)\b.*\b(prohibited|shall not|agree not)\b/i,
  ],
  indemnification: [
    /\b(indemnif(y|ication|ied)|hold harmless|defend and indemnify)\b/i,
    /\b(indemnitor|indemnitee|indemnity)\b/i,
  ],
  auto_renewal: [
    /\b(auto.?renew(al|s)?|automatically renew|renewal term|evergreen)\b/i,
    /\b(unless cancelled|unless terminated)\b.*\b(renew|continue)\b/i,
  ],
  unilateral_modification: [
    /\b(right to (modify|change|amend|update))\b.*\b(at any time|without notice|sole discretion)\b/i,
    /\b(reserves the right|may change|may modify)\b.*\b(terms|agreement|policy)\b/i,
  ],
  limitation_of_liability: [
    /\b(limit(ation)?s? of liability|limit(ed)? liability|liability cap)\b/i,
    /\b(in no event|shall not be liable|disclaim all liability)\b/i,
  ],
  governing_law: [
    /\b(governed by|governing law|jurisdiction|choice of law|venue)\b/i,
    /\b(laws of the state of|courts of)\b/i,
  ],
  class_action_waiver: [
    /\b(class action waiver|class.wide|waive[s]? any right to bring a class)\b/i,
    /\b(no class|only on individual basis|not as part of a class)\b/i,
  ],
  termination: [
    /\b(terminat(e|ion|ing)|cancel(lation)?|expir(e|ation)|end of (term|agreement))\b/i,
    /\b(notice of termination|right to terminate|may terminate)\b/i,
  ],
  intellectual_property: [
    /\b(intellectual property|ip rights?|copyright|trademark|patent|trade secret)\b/i,
    /\b(license|licence|proprietary|ownership of|work made for hire)\b/i,
  ],
  confidentiality: [
    /\b(confidential(ity)?|non.?disclosure|nda|proprietary information|trade secret)\b/i,
    /\b(shall not disclose|keep confidential|confidential information)\b/i,
  ],
  force_majeure: [
    /\b(force majeure|act of god|beyond.*(reasonable )?control|unforeseen circumstance)\b/i,
  ],
  other: [],
};

// ── FTC enforcement patterns → red-flag rules ─────────────────────

interface RedFlagRule {
  id: string;
  severity: RedFlagSeverity;
  category: string;
  pattern: RegExp;
  description: string;
  ftcPattern: string;
  recommendation: string;
  affectsClauseType?: ClauseType;
}

const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: 'rf-001',
    severity: 'critical',
    category: 'Binding Arbitration',
    pattern: /\b(binding arbitration|mandatory arbitration)\b.*\b(waiv(e|er)|prohibit(ed)?|no class)\b/i,
    description: 'Mandatory binding arbitration combined with class-action waiver eliminates meaningful dispute resolution for clients.',
    ftcPattern: 'FTC v. CFPB consent order patterns: forced arbitration with class waiver is a UDAAP concern.',
    recommendation: 'Require mutual arbitration election, remove class-action waiver, or negotiate AAA consumer rules application.',
    affectsClauseType: 'arbitration',
  },
  {
    id: 'rf-002',
    severity: 'critical',
    category: 'Non-Disparagement Silencing',
    pattern: /\b(non.?disparagement|not disparage)\b.*\b(regulat(or|ory)|complaint|government|agency)\b/i,
    description: 'Non-disparagement clause that extends to regulatory agencies or complaints is unenforceable per FTC enforcement actions.',
    ftcPattern: 'FTC Act §5 — clauses preventing consumer complaints to government agencies are deceptive/unfair.',
    recommendation: 'Carve out regulatory and government agency communications from any non-disparagement provision.',
    affectsClauseType: 'non_disparagement',
  },
  {
    id: 'rf-003',
    severity: 'high',
    category: 'Non-Disparagement (Broad)',
    pattern: /\b(non.?disparagement|not.*post.*negative|negative review)\b/i,
    description: 'Broad non-disparagement clause may violate Consumer Review Fairness Act (CRFA) and FTC guidance.',
    ftcPattern: 'Consumer Review Fairness Act — prohibits suppression of honest customer reviews.',
    recommendation: 'Limit non-disparagement to false statements of fact; cannot prohibit honest reviews.',
    affectsClauseType: 'non_disparagement',
  },
  {
    id: 'rf-004',
    severity: 'critical',
    category: 'Unilateral Modification',
    pattern: /(reserves the right|may (change|modify|amend|update)).{0,80}(at any time|without (prior )?notice|sole (and absolute )?discretion)/i,
    description: 'Unilateral modification rights without notice or client consent are a primary FTC enforcement concern in funding agreements.',
    ftcPattern: 'FTC Holder Rule and CFPB UDAAP: material contract changes without notice are unfair practices.',
    recommendation: 'Require 30-day advance notice plus client right to terminate without penalty on material changes.',
    affectsClauseType: 'unilateral_modification',
  },
  {
    id: 'rf-005',
    severity: 'high',
    category: 'Indemnification Imbalance',
    pattern: /\b(client|customer|borrower)\b.{0,200}\bindemnif(y|ies|ied)\b.{0,200}\b(including (any |all )?(negligence|gross negligence|willful))/i,
    description: 'Client is required to indemnify provider including for provider\'s own negligence — classic risk-transfer abuse.',
    ftcPattern: 'FTC UDAAP analysis: one-sided indemnification including provider negligence is an unfair contract term.',
    recommendation: 'Negotiate mutual indemnification limited to each party\'s own acts/omissions; exclude gross negligence and willful misconduct.',
    affectsClauseType: 'indemnification',
  },
  {
    id: 'rf-006',
    severity: 'high',
    category: 'No-Refund Policy',
    pattern: /\b(no refund|non.?refundable|all (fees are |payments are )?non.?refundable)\b/i,
    description: 'Absolute no-refund policy regardless of service delivery failure is an unfair business practice.',
    ftcPattern: 'FTC Act §5 — failure to disclose material no-refund policies or blanket refusal constitutes deception.',
    recommendation: 'Establish a tiered refund schedule tied to service milestones; provide pro-rata refund for undelivered services.',
    affectsClauseType: 'refund',
  },
  {
    id: 'rf-007',
    severity: 'high',
    category: 'Auto-Renewal Without Adequate Notice',
    pattern: /\b(auto.?renew|automatically renew)\b.{0,300}(?!(30|60|90).day)/i,
    description: 'Auto-renewal clause without required advance notice violates FTC and multiple state auto-renewal laws.',
    ftcPattern: 'FTC Negative Option Rule (2023): clear notice required before automatic renewal charges.',
    recommendation: 'Require 30–60 day advance written notice before auto-renewal; provide simple cancellation mechanism.',
    affectsClauseType: 'auto_renewal',
  },
  {
    id: 'rf-008',
    severity: 'medium',
    category: 'Liability Cap Below Fees Paid',
    pattern: /\b(liability.{0,50}(not exceed|limited to|capped at)).{0,100}\b(\$1|one dollar|\$0|zero|nominal)/i,
    description: 'Liability cap is set at a nominal amount, effectively eliminating any meaningful client remedy.',
    ftcPattern: 'CFPB UDAAP supervision guidance: limitation of liability disproportionate to potential client harm.',
    recommendation: 'Set liability cap at minimum of total fees paid or establish tiered cap based on contract value.',
    affectsClauseType: 'limitation_of_liability',
  },
  {
    id: 'rf-009',
    severity: 'medium',
    category: 'Governing Law / Venue Inconvenience',
    pattern: /\b(governed by|jurisdiction).{0,100}(Nevada|Delaware|Utah|Wyoming).{0,100}(arbitration|litigation|dispute)/i,
    description: 'Governing law and venue clause places disputes in jurisdictions historically favorable to lenders/processors.',
    ftcPattern: 'FTC choice-of-law analysis: venue selection designed to prevent consumers from pursuing claims.',
    recommendation: 'Negotiate for client\'s home state as permissible venue, or at minimum a neutral jurisdiction.',
    affectsClauseType: 'governing_law',
  },
  {
    id: 'rf-010',
    severity: 'high',
    category: 'Hidden Fee Escalation',
    pattern: /\b(fee[s]?|rate[s]?|charge[s]?)\b.{0,100}(increas(e|ed?)|adjust(ed?|ment)|escalat(e|ion)).{0,100}(CPI|inflation|index|annual|periodic)/i,
    description: 'Fee escalation clause tied to index or at provider\'s discretion without meaningful cap or notice.',
    ftcPattern: 'FTC Act §5 — hidden price escalation constitutes deceptive pricing in financial services.',
    recommendation: 'Cap fee escalation at a fixed percentage (e.g., 5% annually) with 60-day advance written notice.',
    affectsClauseType: 'fee',
  },
];

// ── Required protections checklist ───────────────────────────────

const REQUIRED_PROTECTIONS: MissingProtection[] = [
  {
    id: 'mp-001',
    name: 'Right to Cancel (Cooling-Off Period)',
    description: 'Contract should provide a minimum 3–5 business day right-to-cancel period for financial services agreements.',
    importance: 'required',
    reference: 'FTC Cooling-Off Rule; state-specific right-to-rescind statutes',
  },
  {
    id: 'mp-002',
    name: 'Fee Disclosure Schedule',
    description: 'All fees must be disclosed in a single consolidated schedule, not scattered throughout the document.',
    importance: 'required',
    reference: 'CFPB Know Before You Owe; FTC Disclosure guidance',
  },
  {
    id: 'mp-003',
    name: 'Refund Policy',
    description: 'Contract must contain a clear, accessible refund or cancellation policy.',
    importance: 'required',
    reference: 'FTC Act §5; Consumer Review Fairness Act',
  },
  {
    id: 'mp-004',
    name: 'Dispute Resolution Process',
    description: 'A fair dispute resolution mechanism must be described, including escalation path.',
    importance: 'required',
    reference: 'CFPB complaints process; FTC UDAAP guidelines',
  },
  {
    id: 'mp-005',
    name: 'Data Privacy and Security Clause',
    description: 'Contract should specify how client data is collected, used, stored, and protected.',
    importance: 'strongly_recommended',
    reference: 'GLBA Safeguards Rule; state privacy laws (CCPA, VCDPA, etc.)',
  },
  {
    id: 'mp-006',
    name: 'Service Level Agreement (SLA)',
    description: 'Funding or advisory services should define minimum service delivery standards and timelines.',
    importance: 'strongly_recommended',
    reference: 'FTC service representation guidelines',
  },
  {
    id: 'mp-007',
    name: 'Amendment Notice Requirement',
    description: 'Contract should require advance written notice (minimum 30 days) before any material term changes.',
    importance: 'strongly_recommended',
    reference: 'CFPB UDAAP exam procedures — unilateral modifications',
  },
  {
    id: 'mp-008',
    name: 'Limitation of Non-Disparagement Scope',
    description: 'If non-disparagement exists, explicit carve-out must exist for government agency and regulatory complaints.',
    importance: 'required',
    reference: 'Consumer Review Fairness Act; FTC Act §5',
  },
  {
    id: 'mp-009',
    name: 'Mutual Termination Rights',
    description: 'Both parties should have termination rights with reasonable notice periods.',
    importance: 'strongly_recommended',
    reference: 'Unconscionability doctrine; FTC UDAAP fairness standards',
  },
  {
    id: 'mp-010',
    name: 'Personal Guarantee Disclosure',
    description: 'If personal guarantee is required, it must be clearly disclosed as a separate, signed document.',
    importance: 'required',
    reference: 'FTC Credit Practices Rule; Reg B adverse action',
  },
];

// ── Helpers ───────────────────────────────────────────────────────

function extractClausesFromText(text: string): ExtractedClause[] {
  const clauses: ExtractedClause[] = [];
  const processedTypes = new Set<ClauseType>();

  // Split text into paragraphs for more granular analysis
  const paragraphs = text.split(/\n{2,}|\r\n{2,}/);

  for (const [idx, paragraph] of paragraphs.entries()) {
    const trimmed = paragraph.trim();
    if (trimmed.length < 30) continue;

    let bestType: ClauseType = 'other';
    let bestScore = 0;

    for (const [clauseType, patterns] of Object.entries(CLAUSE_PATTERNS) as [ClauseType, RegExp[]][]) {
      if (clauseType === 'other') continue;
      let score = 0;
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestType = clauseType as ClauseType;
      }
    }

    if (bestScore === 0) continue;

    const confidence = Math.min(95, 40 + bestScore * 25);

    // Prefer first occurrence per type unless confidence is higher
    const existing = clauses.find(c => c.type === bestType);
    if (!existing || confidence > existing.confidence) {
      if (existing) {
        const existingIdx = clauses.indexOf(existing);
        clauses.splice(existingIdx, 1);
      }

      clauses.push({
        id: uuidv4(),
        type: bestType,
        title: formatClauseTitle(bestType),
        text: trimmed.slice(0, 1000),
        confidence,
        startIndex: idx,
      });
    }
  }

  return clauses;
}

function formatClauseTitle(type: ClauseType): string {
  const titles: Record<ClauseType, string> = {
    fee: 'Fee Schedule',
    refund: 'Refund & Cancellation Policy',
    arbitration: 'Arbitration Clause',
    non_disparagement: 'Non-Disparagement Clause',
    indemnification: 'Indemnification Clause',
    auto_renewal: 'Auto-Renewal Provision',
    unilateral_modification: 'Unilateral Modification Rights',
    limitation_of_liability: 'Limitation of Liability',
    governing_law: 'Governing Law & Jurisdiction',
    class_action_waiver: 'Class Action Waiver',
    termination: 'Termination Clause',
    intellectual_property: 'Intellectual Property',
    confidentiality: 'Confidentiality & NDA',
    force_majeure: 'Force Majeure',
    other: 'Other Provision',
  };
  return titles[type] ?? 'Miscellaneous Clause';
}

function detectRedFlags(text: string, clauses: ExtractedClause[]): RedFlag[] {
  const flags: RedFlag[] = [];

  for (const rule of RED_FLAG_RULES) {
    if (rule.pattern.test(text)) {
      const relatedClause = rule.affectsClauseType
        ? clauses.find(c => c.type === rule.affectsClauseType)
        : undefined;

      flags.push({
        id: uuidv4(),
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        clauseId: relatedClause?.id,
        ftcPattern: rule.ftcPattern,
        recommendation: rule.recommendation,
      });
    }
  }

  return flags;
}

function detectMissingProtections(text: string, clauses: ExtractedClause[]): MissingProtection[] {
  const missing: MissingProtection[] = [];
  const lowerText = text.toLowerCase();
  const clauseTypes = new Set(clauses.map(c => c.type));

  const checks: Array<{ protection: MissingProtection; hasIt: boolean }> = [
    {
      protection: REQUIRED_PROTECTIONS[0], // cooling-off
      hasIt: /\b(right to cancel|cancellation period|rescind|cooling.off|3.business.day|5.business.day)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[1], // fee disclosure schedule
      hasIt: clauseTypes.has('fee') && /\b(fee schedule|fee disclosure|all fees|total fees|complete.{0,10}fee)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[2], // refund policy
      hasIt: clauseTypes.has('refund'),
    },
    {
      protection: REQUIRED_PROTECTIONS[3], // dispute resolution
      hasIt: clauseTypes.has('arbitration') || /\b(dispute resolution|complaint process|escalat|grievance)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[4], // data privacy
      hasIt: /\b(privacy|data protection|personal information|gdpr|ccpa|glba|safeguard)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[5], // SLA
      hasIt: /\b(service level|sla|turnaround|timeline|deliver|business days?)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[6], // amendment notice
      hasIt: /\b(amend(ment)?|modif(y|ication)).{0,100}\b(\d+).day[s]? notice\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[7], // non-disparagement carve-out
      hasIt: !clauseTypes.has('non_disparagement') ||
        /\b(government|regulator|agency|ftc|cfpb|state attorney).{0,50}(except(ed)?|carve.?out|permitted|not covered)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[8], // mutual termination
      hasIt: /\b(either party|both parties|mutual(ly)?.{0,20}terminat)\b/i.test(text),
    },
    {
      protection: REQUIRED_PROTECTIONS[9], // personal guarantee disclosure
      hasIt: /\b(personal guarantee|personal guaranty|personally guarantee)\b/i.test(text)
        ? /\b(separately signed|separate document|addendum|exhibit)\b/i.test(text)
        : true, // Not a problem if no personal guarantee is required
    },
  ];

  for (const { protection, hasIt } of checks) {
    if (!hasIt) {
      missing.push(protection);
    }
  }

  return missing;
}

function computeRiskScore(redFlags: RedFlag[], missingProtections: MissingProtection[]): number {
  let score = 0;

  const severityWeights: Record<RedFlagSeverity, number> = {
    critical: 20,
    high: 12,
    medium: 6,
    low: 3,
  };

  const importanceWeights: Record<string, number> = {
    required: 8,
    strongly_recommended: 4,
    recommended: 2,
  };

  for (const flag of redFlags) {
    score += severityWeights[flag.severity] ?? 0;
  }

  for (const mp of missingProtections) {
    score += importanceWeights[mp.importance] ?? 0;
  }

  return Math.min(100, score);
}

function scoreToRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score <= 20) return 'low';
  if (score <= 45) return 'medium';
  if (score <= 70) return 'high';
  return 'critical';
}

// ── Service class ─────────────────────────────────────────────────

export class ContractIntelligenceService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Analyze a contract document ─────────────────────────────────

  async analyzeContract(input: ContractAnalysisInput): Promise<ContractAnalysisResult> {
    const { tenantId, contractType, documentText, documentId, partnerId } = input;

    logger.info({ tenantId, contractType }, 'ContractIntelligence: analyzing contract');

    const extractedClauses = extractClausesFromText(documentText);
    const redFlags = detectRedFlags(documentText, extractedClauses);
    const missingProtections = detectMissingProtections(documentText, extractedClauses);
    const riskScore = computeRiskScore(redFlags, missingProtections);
    const riskLevel = scoreToRiskLevel(riskScore);

    // Persist analysis
    const record = await this.prisma.contractAnalysis.create({
      data: {
        tenantId,
        contractType,
        documentId: documentId ?? null,
        partnerId: partnerId ?? null,
        extractedClauses: extractedClauses as unknown as object,
        redFlags: redFlags as unknown as object,
        missingProtections: missingProtections as unknown as object,
        riskScore,
        analyzedAt: new Date(),
      },
    });

    // Emit event
    await eventBus.publish({
      id: uuidv4(),
      tenantId,
      eventType: EVENT_TYPES.COMPLIANCE_CHECK_COMPLETED ?? 'CONTRACT_ANALYZED',
      aggregateType: AGGREGATE_TYPES.COMPLIANCE ?? 'contract_analysis',
      aggregateId: record.id,
      payload: {
        contractType,
        riskScore,
        riskLevel,
        redFlagCount: redFlags.length,
        criticalFlags: redFlags.filter(f => f.severity === 'critical').length,
        missingCount: missingProtections.length,
      },
      version: 1,
    });

    logger.info(
      { id: record.id, riskScore, riskLevel, flagCount: redFlags.length },
      'ContractIntelligence: analysis complete',
    );

    return {
      id: record.id,
      tenantId,
      contractType,
      extractedClauses,
      redFlags,
      missingProtections,
      riskScore,
      riskLevel,
      analyzedAt: record.analyzedAt,
    };
  }

  // ── List analyses ────────────────────────────────────────────────

  async listAnalyses(
    tenantId: string,
    options: { contractType?: string; limit?: number; offset?: number } = {},
  ): Promise<ContractAnalysisResult[]> {
    const { contractType, limit = 20, offset = 0 } = options;

    const records = await this.prisma.contractAnalysis.findMany({
      where: {
        tenantId,
        ...(contractType ? { contractType } : {}),
      },
      orderBy: { analyzedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return records.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      contractType: r.contractType,
      extractedClauses: (r.extractedClauses as unknown as ExtractedClause[]) ?? [],
      redFlags: (r.redFlags as unknown as RedFlag[]) ?? [],
      missingProtections: (r.missingProtections as unknown as MissingProtection[]) ?? [],
      riskScore: r.riskScore ?? 0,
      riskLevel: scoreToRiskLevel(r.riskScore ?? 0),
      analyzedAt: r.analyzedAt,
    }));
  }

  // ── Get red flags for a specific analysis ────────────────────────

  async getRedFlags(tenantId: string, analysisId: string): Promise<RedFlag[]> {
    const record = await this.prisma.contractAnalysis.findFirst({
      where: { id: analysisId, tenantId },
    });

    if (!record) {
      throw new Error(`ContractAnalysis ${analysisId} not found`);
    }

    return (record.redFlags as unknown as RedFlag[]) ?? [];
  }

  // ── Contract comparison lab ──────────────────────────────────────

  async compareContracts(
    tenantId: string,
    contractInputs: Array<{ id: string; label: string; documentText: string; contractType: string }>,
  ): Promise<ContractComparisonResult> {
    if (contractInputs.length < 2) {
      throw new Error('At least two contracts are required for comparison.');
    }

    // Analyze each contract (inline, no DB persist for comparison)
    const analyzed: Array<{
      id: string;
      label: string;
      clauses: ExtractedClause[];
      flags: RedFlag[];
      riskScore: number;
    }> = contractInputs.map(c => {
      const clauses = extractClausesFromText(c.documentText);
      const flags = detectRedFlags(c.documentText, clauses);
      const missing = detectMissingProtections(c.documentText, clauses);
      return {
        id: c.id,
        label: c.label,
        clauses,
        flags,
        riskScore: computeRiskScore(flags, missing),
      };
    });

    // Build clause matrix
    const allClauseTypes: ClauseType[] = [
      'fee', 'refund', 'arbitration', 'non_disparagement', 'indemnification',
      'auto_renewal', 'unilateral_modification', 'limitation_of_liability',
      'governing_law', 'class_action_waiver', 'termination',
    ];

    const matrix: ComparisonRow[] = allClauseTypes.map(clauseType => {
      const contracts: Record<string, { text: string | null; redFlags: string[] }> = {};

      for (const analyzed_contract of analyzed) {
        const clause = analyzed_contract.clauses.find(c => c.type === clauseType);
        const relatedFlags = analyzed_contract.flags
          .filter(f => {
            // Find if flag has a clause id matching this clause
            return clause ? f.clauseId === clause.id : false;
          })
          .map(f => f.description);

        contracts[analyzed_contract.label] = {
          text: clause?.text ?? null,
          redFlags: relatedFlags,
        };
      }

      return {
        clauseType,
        clauseTitle: formatClauseTitle(clauseType),
        contracts,
      };
    });

    // Determine winner (lowest risk score)
    const winner = analyzed.reduce((best, current) =>
      current.riskScore < best.riskScore ? current : best,
    );

    const scores = analyzed.map(a => `${a.label}: ${a.riskScore}/100`).join(', ');

    return {
      contractIds: contractInputs.map(c => c.id),
      clauseMatrix: matrix,
      winner: winner.label,
      summary: `Comparison of ${contractInputs.length} contracts. Risk scores — ${scores}. "${winner.label}" has the lowest risk profile.`,
    };
  }
}

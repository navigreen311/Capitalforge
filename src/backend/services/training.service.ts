// ============================================================
// CapitalForge — Training & Certification Service
//
// Core responsibilities:
//   1. Compliance certification tracks:
//        - onboarding  (new advisor required before first client)
//        - annual      (annual renewal, expires 12 months)
//        - advanced     (optional advanced compliance mastery)
//   2. Banned claims library with enforcement case examples
//   3. QA call scoring integration — gap identification
//   4. Training gap identification based on compliance violations
//   5. New regulation training triggers
// ============================================================

import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { BANNED_CLAIMS, type BannedClaimCategory } from './comm-compliance.service.js';
import logger from '../config/logger.js';

// ── Track definitions ─────────────────────────────────────────────

export type TrackName = 'onboarding' | 'annual' | 'advanced';

export interface TrackDefinition {
  name: TrackName;
  label: string;
  description: string;
  /** Months until certification expires (null = does not expire) */
  expiryMonths: number | null;
  /** Minimum passing score 0–100 */
  passingScore: number;
  modules: TrainingModule[];
  prerequisiteTracks: TrackName[];
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  /** Topics covered */
  topics: string[];
  /** Key banned-claim categories this module addresses */
  bannedClaimCategories: BannedClaimCategory[];
  /** Relevant enforcement cases for context */
  rules: ComplianceRule[];
  estimatedMinutes: number;
}

/**
 * A rule an advisor has to follow, and the law it comes from.
 *
 * This replaces a library of six enforcement cases — "FTC v. Pinnacle
 * Business Capital (2021), $5,000,000 civil money penalty", "CFPB v.
 * Consumer Assistance Services LLC (2020), $2,700,000 redress", each with a
 * paragraph of findings and a docket-style reference like FTC-X-2021-0041.
 *
 * None of it could be verified, and one of the respondents — Pinnacle
 * Business Capital — appears elsewhere in this codebase as the name of an
 * explicitly stubbed vendor, which is where it most likely came from. A
 * compliance product citing case law it cannot substantiate is worse than
 * one that cites none: an advisor repeats it, and the fabrication travels.
 *
 * The lessons survive because they do not depend on the cases. What an
 * advisor must not say is fixed by the statutes named in `authority`, which
 * are real and checkable, and the guidance was sound regardless of the
 * docket numbers attached to it.
 */
export interface ComplianceRule {
  ruleId: string;
  /** What to do, or not do. */
  lesson: string;
  /** The provision it rests on. A statute, not a case. */
  authority: string;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    ruleId: 'rule-guaranteed-approval',
    lesson:
      'Never use "guaranteed approval", "government-backed", or "no upfront fee" language. ' +
      'All fees must be disclosed before any commitment.',
    authority: 'FTC Act § 5 (deceptive acts or practices)',
  },
  {
    ruleId: 'rule-fee-disclosure',
    lesson:
      'Always disclose all fees explicitly. If advisory services are included in a ' +
      'programme fee, describe them as "included in the programme fee", not "free".',
    authority: 'Dodd-Frank § 1031 (unfair, deceptive or abusive acts or practices)',
  },
  {
    ruleId: 'rule-personal-guarantee',
    lesson:
      'Personal guarantee risk must be disclosed at the first substantive discussion ' +
      'of credit products — not after a client verbally commits.',
    authority: 'Dodd-Frank § 1031 (unfair, deceptive or abusive acts or practices)',
  },
  {
    ruleId: 'rule-government-affiliation',
    lesson:
      'SBA affiliation requires formal written authorisation from the SBA. ' +
      'Any government affiliation claim must be verified and documented before use.',
    authority: 'FTC Act § 5 (deceptive acts or practices)',
  },
  {
    ruleId: 'rule-earnings-claims',
    lesson:
      'Never project specific income figures. Refer clients to their own financial ' +
      'advisors for ROI analysis.',
    authority: 'FTC Act § 5 (deceptive acts or practices)',
  },
  {
    ruleId: 'rule-urgency',
    lesson:
      'Give clients adequate time to review all terms. Urgency scripts that create ' +
      'artificial pressure are abusive practices.',
    authority: 'Dodd-Frank § 1031 (unfair, deceptive or abusive acts or practices)',
  },
];

// ── Track catalogue ────────────────────────────────────────────────

/** A module as it leaves the service: lessons kept, citations dropped. */
export interface PublishedModule {
  id: string;
  title: string;
  description: string;
  topics: string[];
  bannedClaimCategories: BannedClaimCategory[];
  estimatedMinutes: number;
  /** The takeaway from each enforcement case, without the case. */
  lessons: string[];
}

export interface PublishedTrack {
  name: TrackName;
  label: string;
  description: string;
  expiryMonths: number | null;
  passingScore: number;
  prerequisiteTracks: TrackName[];
  modules: PublishedModule[];
}

/**
 * Strip the enforcement cases from a track.
 *
 * Applied wherever a track leaves this service. See the note in
 * _mapCertification: the cases carry invented parties, penalties and
 * docket-style references, and this is compliance training.
 */
export function withoutEnforcementCases(track: TrackDefinition): PublishedTrack {
  return {
    name: track.name,
    label: track.label,
    description: track.description,
    expiryMonths: track.expiryMonths,
    passingScore: track.passingScore,
    prerequisiteTracks: track.prerequisiteTracks,
    modules: track.modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      topics: module.topics,
      bannedClaimCategories: module.bannedClaimCategories,
      estimatedMinutes: module.estimatedMinutes,
      lessons: module.rules.map((r) => r.lesson),
    })),
  };
}

export const TRACK_CATALOGUE: Record<TrackName, TrackDefinition> = {
  onboarding: {
    name: 'onboarding',
    label: 'Advisor Onboarding Compliance Certification',
    description:
      'Required before an advisor handles their first client. Covers UDAAP fundamentals, ' +
      'banned claims, disclosure obligations, and the CapitalForge communication standards.',
    expiryMonths: null,
    passingScore: 80,
    prerequisiteTracks: [],
    modules: [
      {
        id: 'mod-onb-001',
        title: 'UDAAP Fundamentals',
        description: 'Overview of Unfair, Deceptive, or Abusive Acts or Practices under Dodd-Frank § 1031.',
        topics: [
          'FTC Act § 5 and Dodd-Frank § 1031',
          'What constitutes an unfair practice',
          'What constitutes a deceptive representation',
          'What constitutes an abusive practice',
          'Regulatory enforcement landscape',
        ],
        bannedClaimCategories: ['guaranteed_approval', 'government_affiliation', 'sba_affiliation'],
        rules: [COMPLIANCE_RULES[0]!, COMPLIANCE_RULES[3]!],
        estimatedMinutes: 30,
      },
      {
        id: 'mod-onb-002',
        title: 'Banned Claims & Prohibited Language',
        description: 'Deep dive into the 19 banned claim patterns, why each is prohibited, and compliant alternatives.',
        topics: [
          'Guaranteed approval language',
          'Government and SBA affiliation misrepresentation',
          'No-risk and risk-free claims',
          'Income projection claims',
          'Upfront fee concealment',
          'Coaching misrepresentation',
          'Urgency and pressure tactics',
        ],
        bannedClaimCategories: [
          'guaranteed_approval',
          'credit_certainty',
          'sba_affiliation',
          'government_affiliation',
          'no_risk_claim',
          'income_projection',
          'urgency_pressure',
          'coaching_misrepresentation',
          'upfront_fee_concealment',
        ],
        rules: COMPLIANCE_RULES,
        estimatedMinutes: 45,
      },
      {
        id: 'mod-onb-003',
        title: 'Required Disclosures',
        description: 'When and how to deliver required disclosures for credit applications, personal guarantees, fees, and non-affiliation.',
        topics: [
          'Timing of disclosures',
          'Credit application disclosure',
          'Personal guarantee disclosure',
          'Programme fee disclosure',
          'Introductory APR disclosure',
          'Non-affiliation disclaimer',
        ],
        bannedClaimCategories: ['upfront_fee_concealment', 'coaching_misrepresentation', 'no_risk_claim'],
        rules: [COMPLIANCE_RULES[2]!, COMPLIANCE_RULES[1]!],
        estimatedMinutes: 25,
      },
      {
        id: 'mod-onb-004',
        title: 'Approved Script Usage',
        description: 'How to use, customise within bounds, and not deviate from approved scripts.',
        topics: [
          'Script approval workflow',
          'Allowed personalisation vs. prohibited deviations',
          'Escalation when a client asks a question not covered by script',
          'Documenting client interactions',
        ],
        bannedClaimCategories: [],
        rules: [],
        estimatedMinutes: 20,
      },
    ],
  },

  annual: {
    name: 'annual',
    label: 'Annual Compliance Renewal Certification',
    description:
      'Annual renewal to maintain active advisor status. Reviews regulatory updates, ' +
      'common QA findings from the past year, and refreshes banned claims awareness.',
    expiryMonths: 12,
    passingScore: 75,
    prerequisiteTracks: ['onboarding'],
    modules: [
      {
        id: 'mod-ann-001',
        title: 'Regulatory Updates',
        description: 'Changes to UDAAP guidance, state law requirements, and CFPB/FTC enforcement priorities since last certification.',
        topics: [
          'Recent enforcement actions and lessons',
          'State-specific disclosure law changes',
          'CFPB supervisory highlights summary',
          'Updated FTC guidance on income claims',
        ],
        bannedClaimCategories: ['guaranteed_approval', 'income_projection', 'government_affiliation'],
        rules: COMPLIANCE_RULES,
        estimatedMinutes: 20,
      },
      {
        id: 'mod-ann-002',
        title: 'Common QA Findings Review',
        description: 'Analysis of the most common QA compliance failures across the advisor team over the past 12 months.',
        topics: [
          'Top 5 banned-claim violations from QA reviews',
          'Disclosure delivery failures',
          'Script deviation patterns',
          'Remediation best practices',
        ],
        bannedClaimCategories: [
          'urgency_pressure',
          'no_risk_claim',
          'coaching_misrepresentation',
          'upfront_fee_concealment',
        ],
        rules: [COMPLIANCE_RULES[1]!, COMPLIANCE_RULES[2]!, COMPLIANCE_RULES[5]!],
        estimatedMinutes: 20,
      },
      {
        id: 'mod-ann-003',
        title: 'Consent & Documentation Refresh',
        description: 'Best practices for obtaining and documenting client consent and required acknowledgments.',
        topics: [
          'TCPA consent requirements',
          'Product acknowledgment workflow',
          'Recording and retention requirements',
          'Client revocation handling',
        ],
        bannedClaimCategories: [],
        rules: [],
        estimatedMinutes: 15,
      },
    ],
  },

  advanced: {
    name: 'advanced',
    label: 'Advanced Compliance Mastery Certification',
    description:
      'Optional advanced track for senior advisors and compliance officers. Covers state law complexity, ' +
      'deal committee participation, and AI/script governance.',
    expiryMonths: 24,
    passingScore: 85,
    prerequisiteTracks: ['onboarding', 'annual'],
    modules: [
      {
        id: 'mod-adv-001',
        title: 'State Law Complexity',
        description: 'In-depth treatment of CA, NY, VA, UT, FL commercial financing disclosure laws.',
        topics: [
          'California SB 1235 CCFPL requirements',
          'New York Commercial Finance Disclosure Law',
          'Virginia and Utah broker registration',
          'Florida-specific requirements',
          'Multi-state deal structuring',
        ],
        bannedClaimCategories: ['government_affiliation', 'sba_affiliation'],
        rules: [COMPLIANCE_RULES[3]!],
        estimatedMinutes: 60,
      },
      {
        id: 'mod-adv-002',
        title: 'Deal Committee & Escalation Protocols',
        description: 'When to escalate to the deal committee, how to prepare red-flag checklists, and counsel sign-off requirements.',
        topics: [
          'Red-flag trigger criteria',
          'Deal committee roles',
          'Legal counsel sign-off workflow',
          'Documenting override decisions',
        ],
        bannedClaimCategories: [],
        rules: COMPLIANCE_RULES.slice(0, 3),
        estimatedMinutes: 40,
      },
      {
        id: 'mod-adv-003',
        title: 'AI & Script Governance',
        description: 'Oversight of AI-assisted compliance scanning, script version control, and QA scoring calibration.',
        topics: [
          'Understanding the banned-claims detection engine',
          'Script approval and versioning workflow',
          'QA calibration and inter-rater reliability',
          'AI decision log review',
        ],
        bannedClaimCategories: [],
        rules: [],
        estimatedMinutes: 30,
      },
    ],
  },
};

// ── Training gap analysis ─────────────────────────────────────────

export interface TrainingGap {
  advisorId: string;
  gapType: 'certification_expired' | 'certification_missing' | 'compliance_violation_pattern' | 'low_qa_score';
  track: TrackName;
  module?: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  triggerSource: string;
  identifiedAt: Date;
}

export interface RegulationTrigger {
  id: string;
  regulationTitle: string;
  affectedTracks: TrackName[];
  description: string;
  requiredByDate: Date;
  triggerSource: string;
}

// ── Certification result ───────────────────────────────────────────

export interface CertificationResult {
  id: string;
  tenantId: string;
  userId: string;
  trackName: TrackName;
  status: 'not_started' | 'in_progress' | 'passed' | 'failed' | 'expired';
  score: number | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  certificateRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * The track, as published: enforcement cases removed. See
   * withoutEnforcementCases for why a certification payload must not carry
   * them.
   */
  trackDefinition: PublishedTrack;
}

// ── TrainingService ────────────────────────────────────────────────

export class TrainingService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? sharedPrisma;
  }

  // ── Certification management ──────────────────────────────────

  /**
   * Enrol a user in a certification track (creates a not_started record
   * if one does not already exist for this track).
   */
  async enrolUser(tenantId: string, userId: string, trackName: TrackName): Promise<CertificationResult> {
    const existing = await this.prisma.trainingCertification.findFirst({
      where: { tenantId, userId, trackName, status: { not: 'expired' } },
    });

    if (existing) {
      return this._mapCertification(existing);
    }

    const record = await this.prisma.trainingCertification.create({
      data: {
        id:             uuidv4(),
        tenantId,
        userId,
        trackName,
        status:         'not_started',
        score:          null,
        completedAt:    null,
        expiresAt:      null,
        certificateRef: null,
      },
    });

    logger.info('User enrolled in training track', { tenantId, userId, trackName });

    return this._mapCertification(record);
  }

  /**
   * List all certifications for a user.
   */
  async listCertifications(
    tenantId: string,
    userId: string,
  ): Promise<CertificationResult[]> {
    const records = await this.prisma.trainingCertification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this._mapCertification(r));
  }

  /**
   * Mark a certification as completed (passed or failed based on score).
   * Calculates expiry date for tracks with expiryMonths set.
   */
  async completeCertification(
    certificationId: string,
    tenantId: string,
    score: number,
  ): Promise<CertificationResult> {
    const record = await this.prisma.trainingCertification.findFirst({
      where: { id: certificationId, tenantId },
    });

    if (!record) {
      throw new Error(`Certification ${certificationId} not found.`);
    }

    const track = TRACK_CATALOGUE[record.trackName as TrackName];
    if (!track) {
      throw new Error(`Unknown track "${record.trackName}".`);
    }

    const passed = score >= track.passingScore;
    const now    = new Date();
    let expiresAt: Date | null = null;

    if (passed && track.expiryMonths !== null) {
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + track.expiryMonths);
    }

    const certificateRef = passed ? `cert-${uuidv4().slice(0, 8).toUpperCase()}` : null;

    const updated = await this.prisma.trainingCertification.update({
      where: { id: certificationId },
      data: {
        status:         passed ? 'passed' : 'failed',
        score,
        completedAt:    now,
        expiresAt,
        certificateRef,
        updatedAt:      now,
      },
    });

    logger.info('Certification completed', {
      tenantId,
      userId:    record.userId,
      trackName: record.trackName,
      score,
      passed,
    });

    return this._mapCertification(updated);
  }

  /**
   * Expire stale certifications. Intended to run as a scheduled job.
   */
  async expireStale(tenantId: string): Promise<number> {
    const now = new Date();

    const result = await this.prisma.trainingCertification.updateMany({
      where: {
        tenantId,
        status:    'passed',
        expiresAt: { lt: now },
      },
      data: {
        status:    'expired',
        updatedAt: now,
      },
    });

    return result.count;
  }

  // ── Training gap identification ───────────────────────────────

  /**
   * Identify training gaps for an advisor based on:
   *   1. Missing/expired certifications
   *   2. Recent comm compliance violations (pattern matching to modules)
   *   3. Low QA scores (complianceScore or riskClaimAvoidance < 70)
   */
  async identifyTrainingGaps(
    advisorId: string,
    tenantId: string,
  ): Promise<TrainingGap[]> {
    const gaps: TrainingGap[] = [];
    const now = new Date();

    // ── 1. Certification gaps ──────────────────────────────────
    const certs = await this.prisma.trainingCertification.findMany({
      where: { userId: advisorId, tenantId },
    });

    const certsByTrack = new Map<string, typeof certs[number]>();
    for (const c of certs) {
      const existing = certsByTrack.get(c.trackName);
      if (!existing || c.createdAt > existing.createdAt) {
        certsByTrack.set(c.trackName, c);
      }
    }

    // Onboarding is always required
    const onboarding = certsByTrack.get('onboarding');
    if (!onboarding || onboarding.status === 'not_started' || onboarding.status === 'failed') {
      gaps.push({
        advisorId,
        gapType:       'certification_missing',
        track:         'onboarding',
        description:   'Onboarding certification not completed. Required before handling clients.',
        severity:      'critical',
        triggerSource: 'certification_check',
        identifiedAt:  now,
      });
    } else if (onboarding.status === 'expired') {
      gaps.push({
        advisorId,
        gapType:       'certification_expired',
        track:         'onboarding',
        description:   'Onboarding certification has expired.',
        severity:      'high',
        triggerSource: 'certification_check',
        identifiedAt:  now,
      });
    }

    // Annual renewal check
    const annual = certsByTrack.get('annual');
    if (annual && annual.status === 'expired') {
      gaps.push({
        advisorId,
        gapType:       'certification_expired',
        track:         'annual',
        description:   'Annual compliance renewal certification has expired. Renewal required.',
        severity:      'high',
        triggerSource: 'certification_check',
        identifiedAt:  now,
      });
    } else if (!annual && onboarding?.status === 'passed') {
      // Has onboarding but no annual yet — flag after 12 months
      const onboardingAge = onboarding.completedAt
        ? (now.getTime() - onboarding.completedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
        : 0;
      if (onboardingAge >= 12) {
        gaps.push({
          advisorId,
          gapType:       'certification_missing',
          track:         'annual',
          description:   'Annual renewal certification not completed (onboarding > 12 months ago).',
          severity:      'medium',
          triggerSource: 'certification_check',
          identifiedAt:  now,
        });
      }
    }

    // ── 2. Compliance violation pattern gaps ──────────────────
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentViolations = await this.prisma.commComplianceRecord.findMany({
      where: {
        advisorId,
        tenantId,
        createdAt: { gte: thirtyDaysAgo },
        approved:  false,
      },
      select: { violations: true },
    });

    const categoryCounts = new Map<string, number>();
    for (const record of recentViolations) {
      const violations = record.violations as Array<{ category: string }> | null;
      if (Array.isArray(violations)) {
        for (const v of violations) {
          categoryCounts.set(v.category, (categoryCounts.get(v.category) ?? 0) + 1);
        }
      }
    }

    // Map violation categories to training modules
    for (const [category, count] of categoryCounts.entries()) {
      if (count >= 2) {
        // Find which track/module covers this category
        const track = this._findTrackForCategory(category as BannedClaimCategory);
        if (track) {
          gaps.push({
            advisorId,
            gapType:       'compliance_violation_pattern',
            track:         track.trackName,
            module:        track.moduleId,
            description:   `Recurring "${category}" violations (${count} in last 30 days). Remedial training recommended.`,
            severity:      count >= 5 ? 'critical' : count >= 3 ? 'high' : 'medium',
            triggerSource: 'comm_compliance_scan',
            identifiedAt:  now,
          });
        }
      }
    }

    // ── 3. Low QA score gaps ──────────────────────────────────
    const recentQaScores = await this.prisma.advisorQaScore.findMany({
      where: { advisorId, tenantId, scoredAt: { gte: thirtyDaysAgo } },
      select: {
        overallScore:       true,
        complianceScore:    true,
        riskClaimAvoidance: true,
        scriptAdherence:    true,
      },
    });

    if (recentQaScores.length >= 3) {
      const avgCompliance = this._average(recentQaScores.map((s) => s.complianceScore));
      const avgRiskClaims = this._average(recentQaScores.map((s) => s.riskClaimAvoidance));
      const avgScript     = this._average(recentQaScores.map((s) => s.scriptAdherence));

      if (avgCompliance !== null && avgCompliance < 70) {
        gaps.push({
          advisorId,
          gapType:       'low_qa_score',
          track:         'annual',
          module:        'mod-ann-002',
          description:   `Average QA compliance score is ${avgCompliance.toFixed(1)}/100 (below 70 threshold) over the last 30 days.`,
          severity:      avgCompliance < 50 ? 'critical' : 'high',
          triggerSource: 'qa_score_analysis',
          identifiedAt:  now,
        });
      }

      if (avgRiskClaims !== null && avgRiskClaims < 70) {
        gaps.push({
          advisorId,
          gapType:       'low_qa_score',
          track:         'onboarding',
          module:        'mod-onb-002',
          description:   `Average QA risk-claim avoidance score is ${avgRiskClaims.toFixed(1)}/100 (below 70 threshold).`,
          severity:      avgRiskClaims < 50 ? 'critical' : 'high',
          triggerSource: 'qa_score_analysis',
          identifiedAt:  now,
        });
      }

      if (avgScript !== null && avgScript < 70) {
        gaps.push({
          advisorId,
          gapType:       'low_qa_score',
          track:         'onboarding',
          module:        'mod-onb-004',
          description:   `Average QA script adherence score is ${avgScript.toFixed(1)}/100 (below 70 threshold).`,
          severity:      avgScript < 50 ? 'high' : 'medium',
          triggerSource: 'qa_score_analysis',
          identifiedAt:  now,
        });
      }
    }

    return gaps;
  }

  // ── Regulation training triggers ──────────────────────────────

  /**
   * Generate training triggers for a new or updated regulation.
   * In production this would integrate with RegulatoryAlert records.
   */
  async triggerRegulationTraining(params: {
    tenantId: string;
    regulationTitle: string;
    affectedTracks: TrackName[];
    description: string;
    requiredByDate: Date;
    triggerSource: string;
  }): Promise<RegulationTrigger> {
    const trigger: RegulationTrigger = {
      id:               uuidv4(),
      regulationTitle:  params.regulationTitle,
      affectedTracks:   params.affectedTracks,
      description:      params.description,
      requiredByDate:   params.requiredByDate,
      triggerSource:    params.triggerSource,
    };

    // In a full implementation, this would create remedial certification
    // records for all advisors in the tenant and notify them.
    logger.info('Regulation training trigger created', {
      tenantId:        params.tenantId,
      regulationTitle: params.regulationTitle,
      affectedTracks:  params.affectedTracks,
    });

    return trigger;
  }

  // ── Banned claims library ──────────────────────────────────────

  /**
   * Return the full banned claims library with enforcement cases
   * for training display.
   */
  getBannedClaimsLibrary() {
    // The claim and the statute behind it. This used to attach the
    // enforcement case whose respondent name appeared in the claim's own
    // example string — a join between two invented fields.
    return BANNED_CLAIMS.map(({ pattern: _p, ...claim }) => ({ ...claim }));
  }

  /**
   * The rules that bear on a banned-claim category.
   *
   * This returned enforcement cases — parties, penalties, docket references —
   * none of which could be verified. What an advisor needs is the rule and
   * the statute, and both survive.
   */
  getRulesForCategory(category: BannedClaimCategory): ComplianceRule[] {
    const relevantTrack = this._findTrackForCategory(category);
    if (!relevantTrack) return [];

    const track = TRACK_CATALOGUE[relevantTrack.trackName];
    const module = track.modules.find((m) => m.id === relevantTrack.moduleId);
    return module?.rules ?? [];
  }

  /**
   * Return full track catalogue.
   */
  getTrackCatalogue(): TrackDefinition[] {
    return Object.values(TRACK_CATALOGUE);
  }

  // ── Private helpers ───────────────────────────────────────────

  private _mapCertification(record: {
    id: string;
    tenantId: string;
    userId: string;
    trackName: string;
    status: string;
    score: number | null;
    completedAt: Date | null;
    expiresAt: Date | null;
    certificateRef: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CertificationResult {
    const trackDef = TRACK_CATALOGUE[record.trackName as TrackName];

    return {
      id:             record.id,
      tenantId:       record.tenantId,
      userId:         record.userId,
      trackName:      record.trackName as TrackName,
      status:         record.status as CertificationResult['status'],
      score:          record.score,
      completedAt:    record.completedAt,
      expiresAt:      record.expiresAt,
      certificateRef: record.certificateRef,
      createdAt:      record.createdAt,
      updatedAt:      record.updatedAt,
      // The track, minus the enforcement cases attached to each module.
      //
      // Those cases are not real — "FTC v. Pinnacle Business Capital (2021),
      // $5,000,000 civil money penalty, FTC-X-2021-0041" names a company that
      // appears elsewhere in this codebase as an explicitly stubbed vendor,
      // and the docket-style sourceRef gives it the shape of something a
      // reader could look up. This is the payload behind a certification
      // record, so it is what an advisor is certified as having learned.
      //
      // The lesson from each case is kept: "never use guaranteed approval
      // language" is sound whatever it is attributed to. The attribution is
      // what must not go out.
      trackDefinition: withoutEnforcementCases(trackDef ?? TRACK_CATALOGUE.onboarding),
    };
  }

  private _findTrackForCategory(
    category: BannedClaimCategory,
  ): { trackName: TrackName; moduleId: string } | null {
    for (const track of Object.values(TRACK_CATALOGUE)) {
      for (const module of track.modules) {
        if (module.bannedClaimCategories.includes(category)) {
          return { trackName: track.name, moduleId: module.id };
        }
      }
    }
    return null;
  }

  private _average(values: (number | null)[]): number | null {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
  }
}

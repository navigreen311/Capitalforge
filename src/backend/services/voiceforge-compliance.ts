// ============================================================
// CapitalForge — VoiceForge Compliance Service
//
// Live call compliance monitoring and post-call QA scoring.
//
// Responsibilities:
//   1. Scan transcript text for banned claims (reuses BANNED_CLAIMS
//      list from comm-compliance.service.ts — single source of truth).
//   2. Real-time risk scoring during a call (0–100 risk score).
//   3. Flag risky phrases with severity weights and legal citations.
//   4. Auto-insert required disclosures when compliance violations
//      are detected mid-call.
//   5. Advisor QA scoring per completed call.
//   6. Publish CALL_COMPLIANCE_VIOLATION events for any violation
//      scored above threshold.
//
// Risk scoring model:
//   - Each banned claim violation contributes its severityWeight × 10
//     to the raw risk score, capped at 100.
//   - riskLevel:
//       0–25   → low
//       26–50  → medium
//       51–75  → high
//       76–100 → critical
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import {
  BANNED_CLAIMS,
  REQUIRED_DISCLOSURES,
  type BannedClaim,
  type BannedClaimCategory,
} from './comm-compliance.service.js';
import type { RiskLevel } from '@shared/types/index.js';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CallBannedClaimViolation {
  claimId: string;
  category: BannedClaimCategory;
  label: string;
  rationale: string;
  legalCitation: string;
  severityWeight: number;
  matchedText: string;
  position: number;
  compliantAlternative: string | undefined;
  enforcementExample: string | undefined;
}

export interface RequiredDisclosureInsertion {
  disclosureKey: string;
  text: string;
  triggerReason: string;
}

export interface CallComplianceScanInput {
  tenantId: string;
  businessId: string;
  callId: string;
  advisorId: string;
  transcriptText: string;
  /** Whether this is a real-time mid-call scan vs post-call full scan */
  isLive?: boolean;
}

export interface CallComplianceScanResult {
  scanId: string;
  callId: string;
  advisorId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  violations: CallBannedClaimViolation[];
  requiredDisclosures: RequiredDisclosureInsertion[];
  violationCount: number;
  criticalViolationCount: number;
  highViolationCount: number;
  complianceStatus: 'pass' | 'advisory' | 'fail';
  summary: string;
  scannedAt: Date;
}

export interface CallQaScoreInput {
  tenantId: string;
  advisorId: string;
  callId: string;
  overallScore: number;
  complianceScore?: number;
  scriptAdherence?: number;
  tcpaHandling?: number;
  consentCapture?: number;
  riskClaimAvoidance?: number;
  disclosureDelivery?: number;
  feedback?: string;
}

export interface CallQaScoreResult {
  id: string;
  tenantId: string;
  advisorId: string;
  callId: string;
  overallScore: number;
  complianceScore: number | null;
  scriptAdherence: number | null;
  tcpaHandling: number | null;
  consentCapture: number | null;
  riskClaimAvoidance: number | null;
  disclosureDelivery: number | null;
  feedback: string | null;
  grade: 'excellent' | 'satisfactory' | 'needs_improvement' | 'unsatisfactory';
  scoredAt: Date;
}

export interface AdvisorQaSummary {
  advisorId: string;
  tenantId: string;
  totalCallsScored: number;
  averageOverallScore: number;
  averageComplianceScore: number | null;
  averageRiskClaimAvoidance: number | null;
  recentScores: CallQaScoreResult[];
  gradeDistribution: Record<CallQaScoreResult['grade'], number>;
  lastScoredAt: Date | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Risk score above this threshold triggers CALL_COMPLIANCE_VIOLATION event */
const VIOLATION_EVENT_THRESHOLD = 50;

/** Severity weight at or above this value is classified as critical */
const CRITICAL_SEVERITY_THRESHOLD = 9;

/** Severity weight at or above this value is classified as high */
const HIGH_SEVERITY_THRESHOLD = 7;

// ── VoiceForgeComplianceService ──────────────────────────────────────────────

export class VoiceForgeComplianceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Transcript scanning ──────────────────────────────────────────────────

  /**
   * Scan transcript text against the full BANNED_CLAIMS list.
   * Works for both real-time (live) chunks and full post-call transcripts.
   *
   * Violations are persisted to the CallComplianceScan table.
   * CALL_COMPLIANCE_VIOLATION is published if riskScore >= threshold.
   */
  async scanTranscript(input: CallComplianceScanInput): Promise<CallComplianceScanResult> {
    const log = logger.child({
      tenantId: input.tenantId,
      callId: input.callId,
      advisorId: input.advisorId,
    });

    log.info('[VoiceForgeCompliance] Scanning transcript', {
      textLength: input.transcriptText.length,
      isLive: input.isLive ?? false,
    });

    // ── Detect violations ──────────────────────────────────────────
    const violations = this._detectViolations(input.transcriptText);

    // ── Calculate risk score ───────────────────────────────────────
    const riskScore = this._calculateRiskScore(violations);
    const riskLevel = this._riskLevel(riskScore);

    // ── Determine required disclosures ─────────────────────────────
    const requiredDisclosures = this._buildRequiredDisclosures(violations);

    // ── Classify violation severity counts ─────────────────────────
    const criticalViolationCount = violations.filter(
      (v) => v.severityWeight >= CRITICAL_SEVERITY_THRESHOLD,
    ).length;
    const highViolationCount = violations.filter(
      (v) =>
        v.severityWeight >= HIGH_SEVERITY_THRESHOLD &&
        v.severityWeight < CRITICAL_SEVERITY_THRESHOLD,
    ).length;

    // ── Determine compliance status ────────────────────────────────
    const complianceStatus = this._complianceStatus(riskScore, criticalViolationCount);

    const summary = this._buildSummary(
      violations.length,
      criticalViolationCount,
      riskScore,
      complianceStatus,
    );

    // ── Persist scan record ────────────────────────────────────────
    const scanId = uuidv4();
    const scannedAt = new Date();

    await this.prisma.callComplianceScan.create({
      data: {
        id: scanId,
        tenantId: input.tenantId,
        callId: input.callId,
        advisorId: input.advisorId,
        riskScore,
        riskLevel,
        violationCount: violations.length,
        criticalViolationCount,
        complianceStatus,
        violationsJson: JSON.stringify(violations),
        disclosuresJson: JSON.stringify(requiredDisclosures),
        isLiveScan: input.isLive ?? false,
        scannedAt,
      },
    });

    // ── Publish violation event if above threshold ─────────────────
    if (riskScore >= VIOLATION_EVENT_THRESHOLD || criticalViolationCount > 0) {
      await eventBus.publishAndPersist(input.tenantId, {
        eventType: EVENT_TYPES.CALL_COMPLIANCE_VIOLATION,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId: input.callId,
        payload: {
          scanId,
          callId: input.callId,
          advisorId: input.advisorId,
          riskScore,
          riskLevel,
          violationCount: violations.length,
          criticalViolationCount,
          complianceStatus,
        },
      });

      log.warn('[VoiceForgeCompliance] Compliance violation event published', {
        scanId,
        riskScore,
        riskLevel,
        violationCount: violations.length,
      });
    }

    log.info('[VoiceForgeCompliance] Scan complete', {
      scanId,
      riskScore,
      riskLevel,
      violationCount: violations.length,
      complianceStatus,
    });

    return {
      scanId,
      callId: input.callId,
      advisorId: input.advisorId,
      riskScore,
      riskLevel,
      violations,
      requiredDisclosures,
      violationCount: violations.length,
      criticalViolationCount,
      highViolationCount,
      complianceStatus,
      summary,
      scannedAt,
    };
  }

  // ── QA Scoring ────────────────────────────────────────────────────────────

  /**
   * Record a QA score for a completed call.
   * Scores are stored in CallQaScore and rolled into advisor aggregate metrics.
   */
  async recordCallQaScore(input: CallQaScoreInput): Promise<CallQaScoreResult> {
    const grade = this._gradeFromScore(input.overallScore);
    const scoredAt = new Date();
    const id = uuidv4();

    const record = await this.prisma.callQaScore.create({
      data: {
        id,
        tenantId: input.tenantId,
        advisorId: input.advisorId,
        callId: input.callId,
        overallScore: input.overallScore,
        complianceScore: input.complianceScore ?? null,
        scriptAdherence: input.scriptAdherence ?? null,
        tcpaHandling: input.tcpaHandling ?? null,
        consentCapture: input.consentCapture ?? null,
        riskClaimAvoidance: input.riskClaimAvoidance ?? null,
        disclosureDelivery: input.disclosureDelivery ?? null,
        feedback: input.feedback ?? null,
        grade,
        scoredAt,
      },
    });

    logger.info('[VoiceForgeCompliance] QA score recorded', {
      id,
      advisorId: input.advisorId,
      callId: input.callId,
      overallScore: input.overallScore,
      grade,
    });

    return this._mapQaScore(record);
  }

  /**
   * Get QA score summary for an advisor, including recent call scores
   * and grade distribution.
   */
  async getAdvisorQaSummary(
    advisorId: string,
    tenantId: string,
    limit = 20,
  ): Promise<AdvisorQaSummary> {
    const scores = await this.prisma.callQaScore.findMany({
      where: { advisorId, tenantId },
      orderBy: { scoredAt: 'desc' },
      take: limit,
    });

    const allScores = await this.prisma.callQaScore.findMany({
      where: { advisorId, tenantId },
      select: {
        overallScore: true,
        complianceScore: true,
        riskClaimAvoidance: true,
        grade: true,
        scoredAt: true,
      },
    });

    const totalCallsScored = allScores.length;

    const averageOverallScore = totalCallsScored > 0
      ? Math.round(allScores.reduce((sum, s) => sum + s.overallScore, 0) / totalCallsScored)
      : 0;

    const withCompliance = allScores.filter((s) => s.complianceScore !== null);
    const averageComplianceScore = withCompliance.length > 0
      ? Math.round(
          withCompliance.reduce((sum, s) => sum + (s.complianceScore ?? 0), 0) /
            withCompliance.length,
        )
      : null;

    const withRiskAvoidance = allScores.filter((s) => s.riskClaimAvoidance !== null);
    const averageRiskClaimAvoidance = withRiskAvoidance.length > 0
      ? Math.round(
          withRiskAvoidance.reduce((sum, s) => sum + (s.riskClaimAvoidance ?? 0), 0) /
            withRiskAvoidance.length,
        )
      : null;

    const gradeDistribution: Record<CallQaScoreResult['grade'], number> = {
      excellent: 0,
      satisfactory: 0,
      needs_improvement: 0,
      unsatisfactory: 0,
    };
    for (const s of allScores) {
      const g = s.grade as CallQaScoreResult['grade'];
      gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
    }

    const lastScoredAt =
      allScores.length > 0
        ? allScores.reduce(
            (latest, s) => (s.scoredAt > latest ? s.scoredAt : latest),
            allScores[0]!.scoredAt,
          )
        : null;

    return {
      advisorId,
      tenantId,
      totalCallsScored,
      averageOverallScore,
      averageComplianceScore,
      averageRiskClaimAvoidance,
      recentScores: scores.map((s) => this._mapQaScore(s)),
      gradeDistribution,
      lastScoredAt,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Run all BANNED_CLAIMS patterns against the transcript. */
  private _detectViolations(text: string): CallBannedClaimViolation[] {
    const violations: CallBannedClaimViolation[] = [];

    for (const claim of BANNED_CLAIMS) {
      const matches = [...text.matchAll(new RegExp(claim.pattern.source, 'gi'))];

      for (const match of matches) {
        violations.push({
          claimId: claim.id,
          category: claim.category,
          label: claim.label,
          rationale: claim.rationale,
          legalCitation: claim.legalCitation,
          severityWeight: claim.severityWeight,
          matchedText: match[0] ?? '',
          position: match.index ?? 0,
          compliantAlternative: claim.compliantAlternative,
          enforcementExample: claim.enforcementExample,
        });
      }
    }

    // Sort by position in text (earliest first)
    return violations.sort((a, b) => a.position - b.position);
  }

  /**
   * Calculate a 0–100 risk score from violations.
   * Each violation contributes severityWeight × 10, capped at 100.
   * Duplicate claims (same claimId) use max-severity, not accumulation.
   */
  private _calculateRiskScore(violations: CallBannedClaimViolation[]): number {
    if (violations.length === 0) return 0;

    // De-duplicate by claimId — take max severity per unique claim
    const byClaimId = new Map<string, CallBannedClaimViolation>();
    for (const v of violations) {
      const existing = byClaimId.get(v.claimId);
      if (!existing || v.severityWeight > existing.severityWeight) {
        byClaimId.set(v.claimId, v);
      }
    }

    const rawScore = Array.from(byClaimId.values()).reduce(
      (sum, v) => sum + v.severityWeight * 10,
      0,
    );

    return Math.min(100, rawScore);
  }

  private _riskLevel(score: number): RiskLevel {
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'critical';
  }

  private _complianceStatus(
    riskScore: number,
    criticalCount: number,
  ): 'pass' | 'advisory' | 'fail' {
    if (criticalCount > 0 || riskScore >= 75) return 'fail';
    if (riskScore >= 25) return 'advisory';
    return 'pass';
  }

  private _buildSummary(
    violationCount: number,
    criticalCount: number,
    riskScore: number,
    status: 'pass' | 'advisory' | 'fail',
  ): string {
    if (violationCount === 0) {
      return 'No compliance violations detected. Call transcript is clean.';
    }
    return (
      `Detected ${violationCount} violation(s) (${criticalCount} critical). ` +
      `Risk score: ${riskScore}/100. Status: ${status.toUpperCase()}. ` +
      `Review flagged phrases and ensure required disclosures were delivered.`
    );
  }

  /** Build required disclosure insertions based on which violation categories fired. */
  private _buildRequiredDisclosures(
    violations: CallBannedClaimViolation[],
  ): RequiredDisclosureInsertion[] {
    const insertions: RequiredDisclosureInsertion[] = [];
    const categoriesSeen = new Set(violations.map((v) => v.category));

    for (const disclosure of REQUIRED_DISCLOSURES) {
      // Always include disclosures whose channel is 'voice' or 'all'
      if (disclosure.channel === 'voice' || disclosure.channel === 'all') {
        insertions.push({
          disclosureKey: disclosure.id,
          text: disclosure.disclosureText,
          triggerReason: 'Required for all voice calls',
        });
      }
    }

    return insertions;
  }

  private _gradeFromScore(
    score: number,
  ): 'excellent' | 'satisfactory' | 'needs_improvement' | 'unsatisfactory' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'satisfactory';
    if (score >= 60) return 'needs_improvement';
    return 'unsatisfactory';
  }

  private _mapQaScore(r: {
    id: string;
    tenantId: string;
    advisorId: string;
    callId: string;
    overallScore: number;
    complianceScore: number | null;
    scriptAdherence: number | null;
    tcpaHandling: number | null;
    consentCapture: number | null;
    riskClaimAvoidance: number | null;
    disclosureDelivery: number | null;
    feedback: string | null;
    grade: string;
    scoredAt: Date;
  }): CallQaScoreResult {
    return {
      id: r.id,
      tenantId: r.tenantId,
      advisorId: r.advisorId,
      callId: r.callId,
      overallScore: r.overallScore,
      complianceScore: r.complianceScore,
      scriptAdherence: r.scriptAdherence,
      tcpaHandling: r.tcpaHandling,
      consentCapture: r.consentCapture,
      riskClaimAvoidance: r.riskClaimAvoidance,
      disclosureDelivery: r.disclosureDelivery,
      feedback: r.feedback,
      grade: r.grade as CallQaScoreResult['grade'],
      scoredAt: r.scoredAt,
    };
  }
}

// ── Singleton export ─────────────────────────────────────────────────────────

export const voiceForgeCompliance = new VoiceForgeComplianceService();

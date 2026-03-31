// ============================================================
// CapitalForge — AI Governance Harness
//
// Responsibilities:
//   1. AI evaluation: accuracy, consistency, calibration
//   2. Confidence threshold enforcement
//   3. Hallucination detection stub
//   4. Prompt and model version history
//   5. Override tracking
// ============================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Types ─────────────────────────────────────────────────────

export type AiModuleSource =
  | 'stacking_optimizer'
  | 'suitability_engine'
  | 'credit_intelligence'
  | 'udap_scorer'
  | 'decline_recovery'
  | 'contract_analysis'
  | 'comm_compliance'
  | 'fraud_detection';

export type AiDecisionType =
  | 'recommendation'
  | 'risk_score'
  | 'classification'
  | 'extraction'
  | 'generation';

export interface LogAiDecisionInput {
  tenantId:      string;
  moduleSource:  AiModuleSource;
  decisionType:  AiDecisionType;
  inputPayload:  Record<string, unknown>;
  output:        Record<string, unknown>;
  confidence?:   number;
  modelVersion?: string;
  promptVersion?: string;
  latencyMs?:    number;
}

export interface OverrideAiDecisionInput {
  decisionId:     string;
  tenantId:       string;
  overriddenBy:   string;
  overrideReason: string;
  correctedOutput?: Record<string, unknown>;
}

export interface AiDecisionRecord {
  id:            string;
  tenantId:      string;
  moduleSource:  string;
  decisionType:  string;
  inputHash:     string | null;
  output:        Record<string, unknown>;
  confidence:    number | null;
  overriddenBy:  string | null;
  overrideReason: string | null;
  modelVersion:  string | null;
  promptVersion: string | null;
  latencyMs:     number | null;
  createdAt:     Date;
  flags:         AiDecisionFlags;
}

export interface AiDecisionFlags {
  belowConfidenceThreshold: boolean;
  possibleHallucination:    boolean;
  wasOverridden:            boolean;
}

export interface AiMetrics {
  tenantId:              string;
  moduleSource:          string;
  period:                { start: string; end: string };
  totalDecisions:        number;
  overrideRate:          number;
  averageConfidence:     number;
  belowThresholdRate:    number;
  possibleHallucinationRate: number;
  averageLatencyMs:      number;
  modelVersionDistribution: Record<string, number>;
  promptVersionDistribution: Record<string, number>;
}

export interface ConfidenceThreshold {
  moduleSource: AiModuleSource;
  minimumConfidence: number;
  blockBelowThreshold: boolean;
  alertOnBelowThreshold: boolean;
}

// ── Default confidence thresholds by module ───────────────────

export const DEFAULT_CONFIDENCE_THRESHOLDS: Record<string, ConfidenceThreshold> = {
  stacking_optimizer: {
    moduleSource:          'stacking_optimizer',
    minimumConfidence:      0.75,
    blockBelowThreshold:    false,
    alertOnBelowThreshold:  true,
  },
  suitability_engine: {
    moduleSource:          'suitability_engine',
    minimumConfidence:      0.80,
    blockBelowThreshold:    true,   // Hard block — suitability is critical
    alertOnBelowThreshold:  true,
  },
  credit_intelligence: {
    moduleSource:          'credit_intelligence',
    minimumConfidence:      0.70,
    blockBelowThreshold:    false,
    alertOnBelowThreshold:  true,
  },
  udap_scorer: {
    moduleSource:          'udap_scorer',
    minimumConfidence:      0.85,
    blockBelowThreshold:    true,   // Hard block — UDAP compliance is critical
    alertOnBelowThreshold:  true,
  },
  decline_recovery: {
    moduleSource:          'decline_recovery',
    minimumConfidence:      0.65,
    blockBelowThreshold:    false,
    alertOnBelowThreshold:  false,
  },
  contract_analysis: {
    moduleSource:          'contract_analysis',
    minimumConfidence:      0.70,
    blockBelowThreshold:    false,
    alertOnBelowThreshold:  true,
  },
  comm_compliance: {
    moduleSource:          'comm_compliance',
    minimumConfidence:      0.80,
    blockBelowThreshold:    false,
    alertOnBelowThreshold:  true,
  },
  fraud_detection: {
    moduleSource:          'fraud_detection',
    minimumConfidence:      0.90,
    blockBelowThreshold:    true,   // Hard block — fraud decisions are critical
    alertOnBelowThreshold:  true,
  },
};

// ── Hallucination detection patterns ──────────────────────────
// Stub: production version would embed a verifier model.

const HALLUCINATION_SIGNALS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(guaranteed|100% certain|always works|never fails)\b/i, weight: 0.6 },
  { pattern: /\b(SBA[- ]approved|government[- ]backed program)\b/i,     weight: 0.8 },
  { pattern: /\binfinit\w*\b/i,                                          weight: 0.4 },
  { pattern: /\b(no credit check|no background check)\b/i,              weight: 0.7 },
  { pattern: /\bfake (company|business|address)\b/i,                    weight: 0.9 },
];

function detectHallucination(output: Record<string, unknown>): boolean {
  const text = JSON.stringify(output).toLowerCase();
  const totalWeight = HALLUCINATION_SIGNALS.reduce((sum, sig) => {
    return sig.pattern.test(text) ? sum + sig.weight : sum;
  }, 0);
  return totalWeight >= 0.8;
}

// ── Service ───────────────────────────────────────────────────

export class AiGovernanceService {
  constructor(private prisma: PrismaClient = getPrisma()) {}

  // ── Log AI Decision ─────────────────────────────────────────

  async logDecision(input: LogAiDecisionInput): Promise<AiDecisionRecord> {
    const inputHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input.inputPayload))
      .digest('hex');

    const possibleHallucination = detectHallucination(input.output);
    const threshold = DEFAULT_CONFIDENCE_THRESHOLDS[input.moduleSource];
    const belowThreshold =
      threshold !== undefined &&
      input.confidence !== undefined &&
      input.confidence < threshold.minimumConfidence;

    // Enforce hard blocks
    if (belowThreshold && threshold?.blockBelowThreshold) {
      logger.warn('AI decision blocked: confidence below threshold', {
        moduleSource: input.moduleSource,
        confidence:   input.confidence,
        threshold:    threshold.minimumConfidence,
      });
      throw new Error(
        `AI decision blocked for module "${input.moduleSource}": confidence ` +
          `${input.confidence?.toFixed(3)} is below required threshold ` +
          `${threshold.minimumConfidence}. Human review required.`,
      );
    }

    if (possibleHallucination) {
      logger.warn('Possible hallucination detected in AI output', {
        moduleSource: input.moduleSource,
        tenantId:     input.tenantId,
      });
    }

    if (belowThreshold && threshold?.alertOnBelowThreshold) {
      logger.warn('AI decision confidence below threshold — alert issued', {
        moduleSource: input.moduleSource,
        confidence:   input.confidence,
        tenantId:     input.tenantId,
      });
    }

    const record = await this.prisma.aiDecisionLog.create({
      data: {
        tenantId:      input.tenantId,
        moduleSource:  input.moduleSource,
        decisionType:  input.decisionType,
        inputHash,
        output:        input.output as unknown as object,
        confidence:    input.confidence ?? null,
        modelVersion:  input.modelVersion ?? null,
        promptVersion: input.promptVersion ?? null,
        latencyMs:     input.latencyMs ?? null,
      },
    });

    return this.toAiDecisionRecord(record, belowThreshold, possibleHallucination);
  }

  // ── List Decisions ──────────────────────────────────────────

  async listDecisions(
    tenantId: string,
    filters: {
      moduleSource?: string;
      decisionType?: string;
      onlyOverridden?: boolean;
      onlyBelowThreshold?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<{ decisions: AiDecisionRecord[]; total: number }> {
    const page     = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const where: Record<string, unknown> = { tenantId };
    if (filters.moduleSource)  where['moduleSource']  = filters.moduleSource;
    if (filters.decisionType)  where['decisionType']  = filters.decisionType;
    if (filters.onlyOverridden) where['overriddenBy'] = { not: null };

    const [records, total] = await Promise.all([
      this.prisma.aiDecisionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      this.prisma.aiDecisionLog.count({ where }),
    ]);

    const decisions = records.map((r) => {
      const threshold = DEFAULT_CONFIDENCE_THRESHOLDS[r.moduleSource];
      const belowThreshold =
        threshold !== undefined &&
        r.confidence !== null &&
        Number(r.confidence) < threshold.minimumConfidence;
      const possibleHallucination = detectHallucination(r.output as Record<string, unknown>);
      return this.toAiDecisionRecord(r, belowThreshold, possibleHallucination);
    });

    const filtered = filters.onlyBelowThreshold
      ? decisions.filter((d) => d.flags.belowConfidenceThreshold)
      : decisions;

    return { decisions: filtered, total };
  }

  // ── Override Decision ────────────────────────────────────────

  async overrideDecision(input: OverrideAiDecisionInput): Promise<AiDecisionRecord> {
    const existing = await this.prisma.aiDecisionLog.findFirst({
      where: { id: input.decisionId, tenantId: input.tenantId },
    });
    if (!existing) throw new Error(`AI decision ${input.decisionId} not found.`);
    if (existing.overriddenBy) {
      throw new Error(`AI decision ${input.decisionId} has already been overridden.`);
    }

    const updated = await this.prisma.aiDecisionLog.update({
      where: { id: input.decisionId },
      data: {
        overriddenBy:   input.overriddenBy,
        overrideReason: input.overrideReason,
        ...(input.correctedOutput && { output: input.correctedOutput as unknown as object }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId:   input.tenantId,
        userId:     input.overriddenBy,
        action:     'ai_decision.overridden',
        resource:   'ai_decision_log',
        resourceId: input.decisionId,
        metadata:   { reason: input.overrideReason },
      },
    });

    logger.info('AI decision overridden', {
      decisionId:  input.decisionId,
      overriddenBy: input.overriddenBy,
    });

    const threshold = DEFAULT_CONFIDENCE_THRESHOLDS[updated.moduleSource];
    const belowThreshold =
      threshold !== undefined &&
      updated.confidence !== null &&
      Number(updated.confidence) < threshold.minimumConfidence;

    return this.toAiDecisionRecord(
      updated,
      belowThreshold,
      detectHallucination(updated.output as Record<string, unknown>),
    );
  }

  // ── Metrics ──────────────────────────────────────────────────

  async getMetrics(
    tenantId: string,
    moduleSource?: string,
    periodDays = 30,
  ): Promise<AiMetrics[]> {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const where: Record<string, unknown> = {
      tenantId,
      createdAt: { gte: since },
    };
    if (moduleSource) where['moduleSource'] = moduleSource;

    const records = await this.prisma.aiDecisionLog.findMany({ where });

    // Group by moduleSource
    const byModule: Record<string, typeof records> = {};
    for (const r of records) {
      if (!byModule[r.moduleSource]) byModule[r.moduleSource] = [];
      byModule[r.moduleSource]!.push(r);
    }

    const metrics: AiMetrics[] = [];

    for (const [source, moduleRecords] of Object.entries(byModule)) {
      const threshold = DEFAULT_CONFIDENCE_THRESHOLDS[source];
      const total     = moduleRecords.length;
      const overrides = moduleRecords.filter((r) => r.overriddenBy !== null).length;
      const confidenceValues = moduleRecords
        .filter((r) => r.confidence !== null)
        .map((r) => Number(r.confidence));

      const avgConfidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
          : 0;

      const belowThresholdCount = threshold
        ? moduleRecords.filter(
            (r) => r.confidence !== null && Number(r.confidence) < threshold.minimumConfidence,
          ).length
        : 0;

      const hallucinationCount = moduleRecords.filter((r) =>
        detectHallucination(r.output as Record<string, unknown>),
      ).length;

      const latencies = moduleRecords.filter((r) => r.latencyMs !== null).map((r) => r.latencyMs!);
      const avgLatency =
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

      const modelDist: Record<string, number> = {};
      const promptDist: Record<string, number> = {};
      for (const r of moduleRecords) {
        const mv = r.modelVersion ?? 'unknown';
        const pv = r.promptVersion ?? 'unknown';
        modelDist[mv]  = (modelDist[mv]  ?? 0) + 1;
        promptDist[pv] = (promptDist[pv] ?? 0) + 1;
      }

      metrics.push({
        tenantId,
        moduleSource: source,
        period: {
          start: since.toISOString(),
          end:   new Date().toISOString(),
        },
        totalDecisions:         total,
        overrideRate:           total > 0 ? Math.round((overrides / total) * 1000) / 10 : 0,
        averageConfidence:      Math.round(avgConfidence * 1000) / 10,
        belowThresholdRate:     total > 0 ? Math.round((belowThresholdCount / total) * 1000) / 10 : 0,
        possibleHallucinationRate: total > 0 ? Math.round((hallucinationCount / total) * 1000) / 10 : 0,
        averageLatencyMs:       Math.round(avgLatency),
        modelVersionDistribution:  modelDist,
        promptVersionDistribution: promptDist,
      });
    }

    return metrics;
  }

  // ── Version History ──────────────────────────────────────────

  async getVersionHistory(
    tenantId: string,
    moduleSource?: string,
  ): Promise<Array<{ modelVersion: string; promptVersion: string; firstSeen: Date; lastSeen: Date; count: number }>> {
    const where: Record<string, unknown> = { tenantId };
    if (moduleSource) where['moduleSource'] = moduleSource;

    const records = await this.prisma.aiDecisionLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const versionMap: Record<
      string,
      { modelVersion: string; promptVersion: string; firstSeen: Date; lastSeen: Date; count: number }
    > = {};

    for (const r of records) {
      const key = `${r.modelVersion ?? 'unknown'}::${r.promptVersion ?? 'unknown'}`;
      if (!versionMap[key]) {
        versionMap[key] = {
          modelVersion:  r.modelVersion  ?? 'unknown',
          promptVersion: r.promptVersion ?? 'unknown',
          firstSeen:     r.createdAt,
          lastSeen:      r.createdAt,
          count:         0,
        };
      }
      versionMap[key]!.count++;
      if (r.createdAt > versionMap[key]!.lastSeen) {
        versionMap[key]!.lastSeen = r.createdAt;
      }
    }

    return Object.values(versionMap).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  // ── Consistency Check ────────────────────────────────────────
  // Compares outputs for identical inputs to detect non-determinism.

  async checkConsistency(
    tenantId: string,
    moduleSource: string,
    inputHash: string,
  ): Promise<{ consistent: boolean; distinctOutputs: number; samples: number }> {
    const records = await this.prisma.aiDecisionLog.findMany({
      where: { tenantId, moduleSource, inputHash },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (records.length < 2) {
      return { consistent: true, distinctOutputs: 1, samples: records.length };
    }

    const outputHashes = new Set(
      records.map((r) =>
        crypto.createHash('sha256').update(JSON.stringify(r.output)).digest('hex'),
      ),
    );

    return {
      consistent:      outputHashes.size === 1,
      distinctOutputs: outputHashes.size,
      samples:         records.length,
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private toAiDecisionRecord(
    r: {
      id: string;
      tenantId: string;
      moduleSource: string;
      decisionType: string;
      inputHash: string | null;
      output: unknown;
      confidence: { toNumber(): number } | null;
      overriddenBy: string | null;
      overrideReason: string | null;
      modelVersion: string | null;
      promptVersion: string | null;
      latencyMs: number | null;
      createdAt: Date;
    },
    belowThreshold: boolean,
    possibleHallucination: boolean,
  ): AiDecisionRecord {
    return {
      id:            r.id,
      tenantId:      r.tenantId,
      moduleSource:  r.moduleSource,
      decisionType:  r.decisionType,
      inputHash:     r.inputHash,
      output:        r.output as Record<string, unknown>,
      confidence:    r.confidence ? r.confidence.toNumber() : null,
      overriddenBy:  r.overriddenBy,
      overrideReason: r.overrideReason,
      modelVersion:  r.modelVersion,
      promptVersion: r.promptVersion,
      latencyMs:     r.latencyMs,
      createdAt:     r.createdAt,
      flags: {
        belowConfidenceThreshold: belowThreshold,
        possibleHallucination,
        wasOverridden:            r.overriddenBy !== null,
      },
    };
  }
}

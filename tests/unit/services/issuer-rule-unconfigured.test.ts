// ============================================================
// An issuer rule with a missing threshold reports itself
//
// Every rule parameter used to be defaulted with `??`, and the same `?? 0`
// meant opposite things depending on which side of the comparison it landed:
//
//   maxApps    = rule.value ?? 0    ->  currentApps >= 0   -> blocks everyone
//   minScore   = rule.value ?? 0    ->  score >= 0         -> passes everyone
//   periodDays = rule.periodDays ?? 0 / ?? 365 / ?? 30     -> three defaults
//                                                             in one file
//
// So an issuer rule nobody finished recording silently became either a total
// block or a no-op, and which one depended on which function read it. Nothing
// said the rule was unconfigured.
//
// This is the engine that answers 5/24.
// ============================================================

import { describe, it, expect, vi } from 'vitest';

const issuerFindUnique = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    issuer: { findUnique: issuerFindUnique },
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

import { IssuerRulesEngine } from '../../../src/backend/services/issuer-rules-engine.js';
import type { PrismaClient } from '@prisma/client';

function engineWithRule(rule: Record<string, unknown>) {
  issuerFindUnique.mockResolvedValue({
    id: 'iss-1',
    name: 'Chase',
    rules: [
      {
        id: 'rule-1',
        ruleName: 'Chase 5/24',
        ruleType: 'velocity_max_apps_per_period',
        severity: 'hard',
        description: 'Five cards in twenty-four months',
        isActive: true,
        value: null,
        periodDays: null,
        ...rule,
      },
    ],
  });
  return new IssuerRulesEngine({ issuer: { findUnique: issuerFindUnique } } as unknown as PrismaClient);
}

const context = {
  businessId: 'biz-1',
  newCardsLast24Months: 2,
  totalAppsInPeriod: 2,
  issuerAppsInPeriod: 1,
  daysSinceLastApplication: 200,
  creditScore: 720,
  businessAgeMonths: 36,
  annualRevenue: 500_000,
  inquiries: 2,
  utilization: 0.2,
} as never;

describe('a rule missing its threshold', () => {
  it('is reported as unevaluated rather than silently applied', async () => {
    const engine = engineWithRule({ value: null, periodDays: 365 });
    const result = await engine.checkIssuerEligibility('iss-1', context);

    expect(result.unevaluatedRules).toHaveLength(1);
    expect(result.unevaluatedRules[0]!.severity).toBe('unconfigured');
    expect(result.unevaluatedRules[0]!.reason).toMatch(/value.*not recorded/i);
  });

  it('blocks rather than passes, and says so in hardBlocks', async () => {
    // `minScore ?? 0` used to make an unconfigured minimum pass everyone. An
    // issuer rule nobody finished recording is not evidence a client qualifies.
    const engine = engineWithRule({ ruleType: 'score_minimum', value: null });
    const result = await engine.checkIssuerEligibility('iss-1', context);

    expect(result.eligible).toBe(false);
    expect(result.hardBlocks.some((v) => v.severity === 'unconfigured')).toBe(true);
  });

  it('reports a missing period separately from a missing value', async () => {
    const engine = engineWithRule({ value: 5, periodDays: null });
    const result = await engine.checkIssuerEligibility('iss-1', context);

    expect(result.unevaluatedRules[0]!.reason).toMatch(/periodDays.*not recorded/i);
  });

  it('names the rule, so somebody can go and record it', async () => {
    const engine = engineWithRule({ value: null });
    const result = await engine.checkIssuerEligibility('iss-1', context);

    const v = result.unevaluatedRules[0]!;
    expect(v.ruleName).toBe('Chase 5/24');
    expect(v.ruleId).toBe('rule-1');
    // No invented threshold on the violation either.
    expect(v.threshold).toBeNull();
    expect(v.currentValue).toBeNull();
  });

  it('leaves a fully-recorded rule evaluating normally', async () => {
    const engine = engineWithRule({ value: 5, periodDays: 365 });
    const result = await engine.checkIssuerEligibility('iss-1', context);

    expect(result.unevaluatedRules).toHaveLength(0);
    // Two cards against a limit of five: eligible, and for a real reason.
    expect(result.eligible).toBe(true);
  });
});

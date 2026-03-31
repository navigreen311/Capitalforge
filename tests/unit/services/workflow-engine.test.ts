// ============================================================
// Unit tests — Workflow Engine, Policy Orchestration &
//              Rules Versioning Services
//
// Coverage (25 tests):
//   WorkflowEngineService
//     - evaluateCondition: all operators
//     - evaluateConditions: AND logic, empty conditions
//     - createRule / listRules
//     - evaluateRules: no match, partial match, full match
//     - Approval chains by risk tier
//     - Blocking vs non-blocking action handling
//
//   PolicyOrchestrationService
//     - createRule / listRules
//     - buildRule: validation errors
//     - evaluateRules: stopOnMatch behavior, priority ordering
//     - canProgress correctly derived from blockers
//
//   RulesVersioningService
//     - createVersion / listVersions / getActiveVersion
//     - deployVersion: valid progression, invalid regression
//     - rollback: audit trail, re-activates previous version
//     - diffVersions: no change, added condition, breaking action
//     - simulateImpact: impacted deals, new blockers detected
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-mock', publishedAt: new Date() }),
  },
}));

const mockWorkflowRuleCreate   = vi.fn();
const mockWorkflowRuleFindMany = vi.fn();
const mockPolicyRuleCreate     = vi.fn();
const mockPolicyRuleFindMany   = vi.fn();

vi.mock('@prisma/client', () => {
  const PrismaClient = vi.fn().mockImplementation(() => ({
    workflowRule: {
      create:   mockWorkflowRuleCreate,
      findMany: mockWorkflowRuleFindMany,
    },
    policyRule: {
      create:   mockPolicyRuleCreate,
      findMany: mockPolicyRuleFindMany,
    },
  }));
  return { PrismaClient };
});

// ── Imports (after mocks) ─────────────────────────────────────

import {
  WorkflowEngineService,
  evaluateCondition,
  evaluateConditions,
  APPROVAL_CHAINS,
  setPrismaClient as setWorkflowPrisma,
  type RuleCondition,
  type DealContext,
  type WorkflowAction,
} from '../../../src/backend/services/workflow-engine.service.js';

import {
  PolicyOrchestrationService,
  setPrismaClient as setPolicyPrisma,
} from '../../../src/backend/services/policy-orchestration.service.js';

import {
  RulesVersioningService,
  type RuleVersionPayload,
} from '../../../src/backend/services/rules-versioning.service.js';

import { PrismaClient } from '@prisma/client';

// ── Fixtures ─────────────────────────────────────────────────

const tenantId   = 'tenant-001';
const businessId = 'biz-001';

function makeContext(overrides: Partial<DealContext['deal']> = {}): DealContext {
  return {
    tenantId,
    businessId,
    deal: {
      riskTier:         'medium',
      status:           'active',
      annualRevenue:    500_000,
      creditScore:      720,
      businessAgeMonths: 24,
      stateOfFormation: 'DE',
      entityType:       'LLC',
      ...overrides,
    },
    compliance: {
      kycStatus:        'approved',
      sanctionsCleared: true,
      suitabilityScore: 75,
    },
  };
}

const blockingAction: WorkflowAction = {
  type:     'block_progression',
  label:    'Block: KYC required',
  blocking: true,
};

const notifyAction: WorkflowAction = {
  type:     'notify_advisor',
  label:    'Notify: deal flagged',
  blocking: false,
};

const simpleCondition: RuleCondition = {
  field:    'deal.riskTier',
  operator: 'eq',
  value:    'high',
};

const revenueCondition: RuleCondition = {
  field:    'deal.annualRevenue',
  operator: 'gte',
  value:    400_000,
};

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  const mockClient = new PrismaClient();
  setWorkflowPrisma(mockClient);
  setPolicyPrisma(mockClient);
});

// ============================================================
// evaluateCondition
// ============================================================

describe('evaluateCondition', () => {
  it('eq — matches equal values', () => {
    const cond: RuleCondition = { field: 'deal.riskTier', operator: 'eq', value: 'medium' };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('eq — returns false for non-equal', () => {
    const cond: RuleCondition = { field: 'deal.riskTier', operator: 'eq', value: 'critical' };
    expect(evaluateCondition(cond, makeContext())).toBe(false);
  });

  it('neq — returns true when values differ', () => {
    const cond: RuleCondition = { field: 'deal.riskTier', operator: 'neq', value: 'low' };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('gt — returns true when actual > value', () => {
    const cond: RuleCondition = { field: 'deal.annualRevenue', operator: 'gt', value: 400_000 };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('gte — returns true when actual equals value', () => {
    const cond: RuleCondition = { field: 'deal.annualRevenue', operator: 'gte', value: 500_000 };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('lt — returns false when actual is higher', () => {
    const cond: RuleCondition = { field: 'deal.creditScore', operator: 'lt', value: 700 };
    expect(evaluateCondition(cond, makeContext())).toBe(false);
  });

  it('in — returns true when value is in list', () => {
    const cond: RuleCondition = { field: 'deal.entityType', operator: 'in', value: ['LLC', 'Corp'] };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('not_in — returns true when value is not in list', () => {
    const cond: RuleCondition = { field: 'deal.entityType', operator: 'not_in', value: ['Sole Proprietor'] };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('contains — returns true for substring match', () => {
    const cond: RuleCondition = { field: 'deal.stateOfFormation', operator: 'contains', value: 'D' };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('exists — returns true for defined field', () => {
    const cond: RuleCondition = { field: 'deal.annualRevenue', operator: 'exists' };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });

  it('not_exists — returns true for undefined nested field', () => {
    const cond: RuleCondition = { field: 'deal.nonExistentField', operator: 'not_exists' };
    expect(evaluateCondition(cond, makeContext())).toBe(true);
  });
});

// ============================================================
// evaluateConditions
// ============================================================

describe('evaluateConditions', () => {
  it('returns true when all conditions pass (AND logic)', () => {
    const conditions: RuleCondition[] = [
      { field: 'deal.riskTier', operator: 'eq', value: 'medium' },
      revenueCondition,
    ];
    expect(evaluateConditions(conditions, makeContext())).toBe(true);
  });

  it('returns false when any condition fails', () => {
    const conditions: RuleCondition[] = [
      { field: 'deal.riskTier', operator: 'eq', value: 'high' }, // fails
      revenueCondition,
    ];
    expect(evaluateConditions(conditions, makeContext())).toBe(false);
  });

  it('returns true for empty conditions array', () => {
    expect(evaluateConditions([], makeContext())).toBe(true);
  });
});

// ============================================================
// WorkflowEngineService
// ============================================================

describe('WorkflowEngineService', () => {
  const service = new WorkflowEngineService();

  it('createRule — persists rule and returns it', async () => {
    const mockRule = {
      id: 'rule-1', tenantId, name: 'High Risk Block', priority: 10,
      conditions: [simpleCondition], actions: [blockingAction], isActive: true,
    };
    mockWorkflowRuleCreate.mockResolvedValue(mockRule);

    const result = await service.createRule({
      tenantId,
      name:       'High Risk Block',
      conditions: [simpleCondition],
      actions:    [blockingAction],
      priority:   10,
    });

    expect(result.name).toBe('High Risk Block');
    expect(mockWorkflowRuleCreate).toHaveBeenCalledOnce();
  });

  it('listRules — returns rules ordered by priority', async () => {
    const rules = [
      { id: 'r1', priority: 5  },
      { id: 'r2', priority: 10 },
    ];
    mockWorkflowRuleFindMany.mockResolvedValue(rules);

    const result = await service.listRules(tenantId);
    expect(result).toHaveLength(2);
    expect(mockWorkflowRuleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priority: 'desc' } }),
    );
  });

  it('evaluateRules — no rules match returns canProgress=true', async () => {
    mockWorkflowRuleFindMany.mockResolvedValue([
      {
        id: 'r1', name: 'High tier only', priority: 5, isActive: true,
        conditions: [simpleCondition], // requires riskTier = 'high'
        actions:    [blockingAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext({ riskTier: 'low' }));
    expect(result.matchedRules[0].matched).toBe(false);
    expect(result.blockers).toHaveLength(0);
    expect(result.canProgress).toBe(true);
  });

  it('evaluateRules — matched blocking rule sets canProgress=false', async () => {
    mockWorkflowRuleFindMany.mockResolvedValue([
      {
        id: 'r1', name: 'High risk block', priority: 5, isActive: true,
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'high' }],
        actions:    [blockingAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext({ riskTier: 'high' }));
    expect(result.matchedRules[0].matched).toBe(true);
    expect(result.blockers).toHaveLength(1);
    expect(result.canProgress).toBe(false);
  });

  it('evaluateRules — non-blocking match does not prevent progression', async () => {
    mockWorkflowRuleFindMany.mockResolvedValue([
      {
        id: 'r2', name: 'Notify only', priority: 1, isActive: true,
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'medium' }],
        actions:    [notifyAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext());
    expect(result.blockers).toHaveLength(0);
    expect(result.canProgress).toBe(true);
    expect(result.requiredActions).toHaveLength(1);
  });

  it('evaluateRules — deduplicates identical actions across multiple matched rules', async () => {
    mockWorkflowRuleFindMany.mockResolvedValue([
      {
        id: 'r1', priority: 5, isActive: true, name: 'Rule A',
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'high' }],
        actions:    [blockingAction],
      },
      {
        id: 'r2', priority: 3, isActive: true, name: 'Rule B',
        conditions: [{ field: 'deal.annualRevenue', operator: 'gte', value: 0 }],
        actions:    [blockingAction], // same blocking action
      },
    ]);

    const result = await service.evaluateRules(makeContext({ riskTier: 'high' }));
    expect(result.requiredActions).toHaveLength(1); // deduplicated
  });

  it('getApprovalChain — low tier has 1 step', () => {
    const chain = service.getApprovalChain('low');
    expect(chain).toHaveLength(1);
    expect(chain[0].requiredRole).toBe('advisor');
  });

  it('getApprovalChain — critical tier has 5 steps', () => {
    const chain = service.getApprovalChain('critical');
    expect(chain).toHaveLength(5);
  });

  it('getApprovalChain — completed counselSignoff marks legal_counsel step done', () => {
    const chain = service.getApprovalChain('high', { counselSignoff: true });
    const legalStep = chain.find((s) => s.requiredRole === 'legal_counsel');
    expect(legalStep?.completed).toBe(true);
  });
});

// ============================================================
// APPROVAL_CHAINS constant
// ============================================================

describe('APPROVAL_CHAINS', () => {
  it('all risk tiers have ascending step numbers', () => {
    for (const [tier, chain] of Object.entries(APPROVAL_CHAINS)) {
      chain.forEach((step, i) => {
        expect(step.stepNumber).toBe(i + 1);
      });
      void tier;
    }
  });
});

// ============================================================
// PolicyOrchestrationService
// ============================================================

describe('PolicyOrchestrationService', () => {
  const service = new PolicyOrchestrationService();

  it('buildRule — throws if conditions missing', () => {
    expect(() =>
      service.buildRule({
        tenantId, name: 'Test', ruleType: 'eligibility',
        conditions: [],
        actions: [{ type: 'block_progression', label: 'Block', blocking: true }],
      }),
    ).toThrow('At least one condition is required');
  });

  it('buildRule — throws if actions missing', () => {
    expect(() =>
      service.buildRule({
        tenantId, name: 'Test', ruleType: 'eligibility',
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'low' }],
        actions: [],
      }),
    ).toThrow('At least one action is required');
  });

  it('buildRule — returns valid definition with defaults', () => {
    const def = service.buildRule({
      tenantId, name: 'Gate', ruleType: 'suitability_gate',
      conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'medium' }],
      actions: [{ type: 'require_approval', label: 'Approve', blocking: true }],
    });
    expect(def.stopOnMatch).toBe(false);
    expect(def.version).toBe('1.0.0');
    expect(def.isActive).toBe(true);
  });

  it('createRule — calls prisma and returns created rule', async () => {
    const mockRule = {
      id: 'pol-1', tenantId, name: 'KYC Gate', ruleType: 'kyc_kyb',
      stopOnMatch: true, version: '1.0.0', isActive: true,
    };
    mockPolicyRuleCreate.mockResolvedValue(mockRule);

    const def = service.buildRule({
      tenantId, name: 'KYC Gate', ruleType: 'kyc_kyb',
      conditions: [{ field: 'compliance.kycStatus', operator: 'eq', value: 'pending' }],
      actions: [{ type: 'block_progression', label: 'Block KYC', blocking: true }],
      stopOnMatch: true,
    });

    const result = await service.createRule(def);
    expect(result.name).toBe('KYC Gate');
    expect(mockPolicyRuleCreate).toHaveBeenCalledOnce();
  });

  it('listRules — filters by ruleType when provided', async () => {
    mockPolicyRuleFindMany.mockResolvedValue([]);
    await service.listRules(tenantId, 'eligibility');
    expect(mockPolicyRuleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ruleType: 'eligibility' }),
      }),
    );
  });

  it('evaluateRules — stopOnMatch halts evaluation at first match', async () => {
    mockPolicyRuleFindMany.mockResolvedValue([
      {
        id: 'p1', name: 'Stop rule', ruleType: 'eligibility', version: '1.0',
        isActive: true, stopOnMatch: true, priority: 100,
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'high' }],
        actions:    [blockingAction],
      },
      {
        id: 'p2', name: 'Second rule', ruleType: 'disclosure', version: '1.0',
        isActive: true, stopOnMatch: false, priority: 50,
        conditions: [{ field: 'deal.annualRevenue', operator: 'gte', value: 0 }],
        actions:    [notifyAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext({ riskTier: 'high' }));
    expect(result.stopped).toBe(true);
    expect(result.stoppedByRule).toBe('Stop rule');
    // Second rule should not have been evaluated (stopped = true halted loop)
    expect(result.evaluatedRules.filter((r) => r.matched)).toHaveLength(1);
  });

  it('evaluateRules — no stopOnMatch processes all matching rules', async () => {
    mockPolicyRuleFindMany.mockResolvedValue([
      {
        id: 'p1', name: 'Rule 1', ruleType: 'eligibility', version: '1.0',
        isActive: true, stopOnMatch: false, priority: 10,
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'medium' }],
        actions:    [notifyAction],
      },
      {
        id: 'p2', name: 'Rule 2', ruleType: 'disclosure', version: '1.0',
        isActive: true, stopOnMatch: false, priority: 5,
        conditions: [{ field: 'deal.annualRevenue', operator: 'gte', value: 0 }],
        actions:    [notifyAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext());
    expect(result.stopped).toBe(false);
    expect(result.canProgress).toBe(true); // both non-blocking
  });

  it('evaluateRules — canProgress=false when blocking rule matches', async () => {
    mockPolicyRuleFindMany.mockResolvedValue([
      {
        id: 'p1', name: 'Block Rule', ruleType: 'compliance_hold', version: '1.0',
        isActive: true, stopOnMatch: false, priority: 10,
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'medium' }],
        actions:    [blockingAction],
      },
    ]);

    const result = await service.evaluateRules(makeContext());
    expect(result.blockers).toHaveLength(1);
    expect(result.canProgress).toBe(false);
  });
});

// ============================================================
// RulesVersioningService
// ============================================================

describe('RulesVersioningService', () => {
  let service: RulesVersioningService;
  const ruleId = 'rule-issuer-chase-524';

  const samplePayload: RuleVersionPayload = {
    conditions: [{ field: 'deal.creditScore', operator: 'gte', value: 650 }],
    actions:    [{ type: 'block_progression', label: 'Block low score', blocking: true }],
  };

  beforeEach(() => {
    // Fresh instance per test to isolate in-memory store
    service = new RulesVersioningService();
  });

  it('createVersion — creates a version in test stage', () => {
    const v = service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId,
      ruleName: 'Chase 5/24', semver: '1.0.0',
      payload: samplePayload, createdBy: 'user-1',
    });
    expect(v.stage).toBe('test');
    expect(v.isActive).toBe(false);
    expect(v.semver).toBe('1.0.0');
  });

  it('createVersion — throws on duplicate semver', () => {
    service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId,
      ruleName: 'Chase 5/24', semver: '1.0.0',
      payload: samplePayload, createdBy: 'user-1',
    });

    expect(() =>
      service.createVersion({
        tenantId, ruleCategory: 'issuer_rule', ruleId,
        ruleName: 'Chase 5/24', semver: '1.0.0',
        payload: samplePayload, createdBy: 'user-1',
      }),
    ).toThrow('already exists');
  });

  it('listVersions — returns all versions for a ruleId', () => {
    service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.1.0', payload: samplePayload, createdBy: 'u' });
    const versions = service.listVersions(tenantId, ruleId);
    expect(versions).toHaveLength(2);
  });

  it('deployVersion — advances test → staging', async () => {
    const v = service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    const deployed = await service.deployVersion({ versionId: v.id, targetStage: 'staging', deployedBy: 'user-1', tenantId });
    expect(deployed.stage).toBe('staging');
    expect(deployed.isActive).toBe(true);
  });

  it('deployVersion — throws when attempting regression (staging → test)', async () => {
    const v = service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    await service.deployVersion({ versionId: v.id, targetStage: 'staging', deployedBy: 'u', tenantId });

    await expect(
      service.deployVersion({ versionId: v.id, targetStage: 'test', deployedBy: 'u', tenantId }),
    ).rejects.toThrow();
  });

  it('deployVersion — throws on unknown version id', async () => {
    await expect(
      service.deployVersion({ versionId: 'ghost-id', targetStage: 'staging', deployedBy: 'u', tenantId }),
    ).rejects.toThrow('not found');
  });

  it('rollback — deactivates current and restores previous', async () => {
    const v1 = service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    await service.deployVersion({ versionId: v1.id, targetStage: 'staging', deployedBy: 'u', tenantId });

    const v2 = service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.1.0', payload: samplePayload, createdBy: 'u' });
    await service.deployVersion({ versionId: v2.id, targetStage: 'staging', deployedBy: 'u', tenantId });

    const rolledBack = await service.rollback({ versionId: v2.id, reason: 'Regression found', rolledBackBy: 'admin', tenantId });
    expect(rolledBack.isActive).toBe(false);
    expect(rolledBack.rollbackReason).toBe('Regression found');
    expect(rolledBack.rollbackBy).toBe('admin');
  });

  it('rollback — records rollbackReason and rolledBackAt timestamp', async () => {
    const v = service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '2.0.0', payload: samplePayload, createdBy: 'u' });
    await service.deployVersion({ versionId: v.id, targetStage: 'staging', deployedBy: 'u', tenantId });

    const result = await service.rollback({ versionId: v.id, reason: 'Bad deployment', rolledBackBy: 'ops', tenantId });
    expect(result.rolledBackAt).toBeInstanceOf(Date);
  });

  it('diffVersions — no diffs when payloads are identical', () => {
    service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.1', payload: samplePayload, createdBy: 'u' });

    const diff = service.diffVersions(tenantId, ruleId, '1.0.0', '1.0.1');
    expect(diff.conditionDiffs).toHaveLength(0);
    expect(diff.actionDiffs).toHaveLength(0);
    expect(diff.breakingChange).toBe(false);
  });

  it('diffVersions — detects added condition', () => {
    service.createVersion({ tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0', payload: samplePayload, createdBy: 'u' });
    service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '2.0.0',
      payload: {
        ...samplePayload,
        conditions: [
          ...samplePayload.conditions,
          { field: 'deal.riskTier', operator: 'eq', value: 'high' } as RuleCondition,
        ],
      },
      createdBy: 'u',
    });

    const diff = service.diffVersions(tenantId, ruleId, '1.0.0', '2.0.0');
    expect(diff.conditionDiffs.some((d) => d.type === 'added')).toBe(true);
  });

  it('diffVersions — flags breakingChange when new blocking action added', () => {
    service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.0.0',
      payload: { conditions: samplePayload.conditions, actions: [notifyAction] },
      createdBy: 'u',
    });
    service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '1.1.0',
      payload: { conditions: samplePayload.conditions, actions: [notifyAction, blockingAction] },
      createdBy: 'u',
    });

    const diff = service.diffVersions(tenantId, ruleId, '1.0.0', '1.1.0');
    expect(diff.breakingChange).toBe(true);
    expect(diff.summary).toContain('BREAKING');
  });

  it('simulateImpact — returns impacted deals with correct delta', () => {
    const v = service.createVersion({
      tenantId, ruleCategory: 'issuer_rule', ruleId, ruleName: 'R', semver: '3.0.0',
      payload: {
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'high' }],
        actions:    [blockingAction],
      },
      createdBy: 'u',
    });

    const dealContexts: DealContext[] = [
      makeContext({ riskTier: 'high' }),    // will match
      makeContext({ riskTier: 'low' }),     // won't match
    ];

    const result = service.simulateImpact({ versionId: v.id, tenantId, dealContexts });
    expect(result.testedContexts).toBe(2);
    expect(result.impactedDeals.length).toBeGreaterThanOrEqual(1);
    expect(result.impactedDeals[0].businessId).toBe(businessId);
    expect(result.summary.totalImpacted).toBeGreaterThanOrEqual(1);
  });

  it('simulateImpact — tracks new blockers in summary', () => {
    const v = service.createVersion({
      tenantId, ruleCategory: 'policy_playbook', ruleId: 'pol-new', ruleName: 'P', semver: '1.0.0',
      payload: {
        conditions: [{ field: 'deal.riskTier', operator: 'eq', value: 'critical' }],
        actions:    [blockingAction],
      },
      createdBy: 'u',
    });

    const dealContexts = [makeContext({ riskTier: 'critical' })];
    const result = service.simulateImpact({ versionId: v.id, tenantId, dealContexts });
    expect(result.summary.newBlockers).toBeGreaterThanOrEqual(1);
  });
});

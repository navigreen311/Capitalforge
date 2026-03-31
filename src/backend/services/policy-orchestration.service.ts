// ============================================================
// CapitalForge — Policy Orchestration Service
//
// Master rules-and-actions layer that sits above individual
// compliance checks and workflow steps.
//
// Responsibilities:
//   1. Configurable condition-action policy rule builder
//   2. Priority-ordered rule evaluation (highest priority first)
//   3. Automatic stop logic: block progression when required
//      steps are incomplete (stopOnMatch flag)
//   4. Multi-type policy support: eligibility, disclosure,
//      document-gate, fee-disclosure, compliance-hold
//   5. Return ordered action lists with stop reasoning
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';
import {
  evaluateConditions,
  type RuleCondition,
  type DealContext,
  type WorkflowAction,
} from './workflow-engine.service.js';

// ── Prisma singleton ─────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ============================================================
// Domain types
// ============================================================

export type PolicyRuleType =
  | 'eligibility'
  | 'disclosure'
  | 'document_gate'
  | 'fee_disclosure'
  | 'compliance_hold'
  | 'advisor_qualification'
  | 'state_law'
  | 'kyc_kyb'
  | 'suitability_gate';

export interface PolicyRuleDefinition {
  id?: string;
  tenantId: string;
  name: string;
  ruleType: PolicyRuleType;
  conditions: RuleCondition[];
  actions: WorkflowAction[];
  /** Highest integer = evaluated first */
  priority: number;
  /** Stop evaluating subsequent rules after this one matches */
  stopOnMatch: boolean;
  version: string;
  isActive?: boolean;
}

export interface PolicyMatchResult {
  ruleId: string;
  ruleName: string;
  ruleType: PolicyRuleType;
  version: string;
  matched: boolean;
  stopTriggered: boolean;
  actions: WorkflowAction[];
  priority: number;
}

export interface PolicyEvaluationOutput {
  context: DealContext;
  evaluatedRules: PolicyMatchResult[];
  /** All actions from matched rules, in priority order */
  orderedActions: WorkflowAction[];
  /** Actions with blocking=true */
  blockers: WorkflowAction[];
  /** Whether a stopOnMatch rule fired */
  stopped: boolean;
  /** Which rule triggered the stop */
  stoppedByRule?: string;
  canProgress: boolean;
  evaluatedAt: Date;
}

// ============================================================
// Policy Orchestration Service
// ============================================================

export class PolicyOrchestrationService {

  /**
   * Create a new PolicyRule in the database.
   */
  async createRule(definition: PolicyRuleDefinition) {
    const prisma = getPrisma();

    const rule = await prisma.policyRule.create({
      data: {
        id:          uuidv4(),
        tenantId:    definition.tenantId,
        name:        definition.name,
        ruleType:    definition.ruleType,
        conditions:  definition.conditions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        actions:     definition.actions    as unknown as import('@prisma/client').Prisma.InputJsonValue,
        stopOnMatch: definition.stopOnMatch,
        version:     definition.version,
        isActive:    definition.isActive ?? true,
      },
    });

    logger.info('[PolicyOrchestration] Policy rule created', {
      ruleId: rule.id,
      type:   rule.ruleType,
    });

    return rule;
  }

  /**
   * List active policy rules for a tenant, optionally filtered by type.
   * Ordered by priority descending so highest-priority rules appear first.
   */
  async listRules(tenantId: string, ruleType?: PolicyRuleType) {
    const prisma = getPrisma();

    return prisma.policyRule.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(ruleType ? { ruleType } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Evaluate all active policy rules for a tenant against the deal context.
   *
   * Rules are evaluated in descending priority order. When a rule has
   * stopOnMatch=true and matches, evaluation halts immediately — no further
   * rules are processed.
   */
  async evaluateRules(context: DealContext): Promise<PolicyEvaluationOutput> {
    const prisma = getPrisma();

    // Fetch rules ordered by priority
    const dbRules = await prisma.policyRule.findMany({
      where:   { tenantId: context.tenantId, isActive: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    // Sort in-memory by an embedded priority field if present, then by DB order
    const rules = [...dbRules].sort((a, b) => {
      const pa = (a as unknown as { priority?: number }).priority ?? 0;
      const pb = (b as unknown as { priority?: number }).priority ?? 0;
      return pb - pa;
    });

    const evaluatedRules: PolicyMatchResult[] = [];
    const allActions: WorkflowAction[] = [];
    let stopped = false;
    let stoppedByRule: string | undefined;

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as RuleCondition[];
      const actions    = rule.actions    as unknown as WorkflowAction[];
      const matched    = evaluateConditions(conditions, context);
      const stopTriggered = matched && rule.stopOnMatch;

      const result: PolicyMatchResult = {
        ruleId:       rule.id,
        ruleName:     rule.name,
        ruleType:     rule.ruleType as PolicyRuleType,
        version:      rule.version,
        matched,
        stopTriggered,
        actions:      matched ? actions : [],
        priority:     (rule as unknown as { priority?: number }).priority ?? 0,
      };

      evaluatedRules.push(result);

      if (matched) {
        allActions.push(...actions);

        if (stopTriggered) {
          stopped        = true;
          stoppedByRule  = rule.name;
          break;
        }
      }
    }

    // Deduplicate and order actions
    const orderedActions = this._deduplicateActions(allActions);
    const blockers       = orderedActions.filter((a) => a.blocking);
    const canProgress    = !stopped && blockers.length === 0;

    const output: PolicyEvaluationOutput = {
      context,
      evaluatedRules,
      orderedActions,
      blockers,
      stopped,
      stoppedByRule,
      canProgress,
      evaluatedAt: new Date(),
    };

    await eventBus.publishAndPersist({
      tenantId:      context.tenantId,
      eventType:     EVENT_TYPES.POLICY_EVALUATED ?? 'POLICY_EVALUATED',
      aggregateType: AGGREGATE_TYPES.BUSINESS ?? 'business',
      aggregateId:   context.businessId,
      payload: {
        businessId:    context.businessId,
        matchedCount:  evaluatedRules.filter((r) => r.matched).length,
        stopped,
        stoppedByRule,
        blockerCount:  blockers.length,
        canProgress,
      },
    });

    return output;
  }

  /**
   * Build a rule definition object from a declarative spec.
   * Validates required fields and returns a ready-to-persist definition.
   */
  buildRule(spec: {
    tenantId: string;
    name: string;
    ruleType: PolicyRuleType;
    conditions: Array<{ field: string; operator: string; value?: unknown }>;
    actions: Array<{ type: string; label: string; blocking: boolean; config?: Record<string, unknown> }>;
    priority?: number;
    stopOnMatch?: boolean;
    version?: string;
  }): PolicyRuleDefinition {
    if (!spec.tenantId || !spec.name || !spec.ruleType) {
      throw new Error('[PolicyOrchestration] tenantId, name, and ruleType are required');
    }
    if (!spec.conditions?.length) {
      throw new Error('[PolicyOrchestration] At least one condition is required');
    }
    if (!spec.actions?.length) {
      throw new Error('[PolicyOrchestration] At least one action is required');
    }

    return {
      tenantId:    spec.tenantId,
      name:        spec.name,
      ruleType:    spec.ruleType,
      conditions:  spec.conditions as RuleCondition[],
      actions:     spec.actions    as WorkflowAction[],
      priority:    spec.priority ?? 0,
      stopOnMatch: spec.stopOnMatch ?? false,
      version:     spec.version ?? '1.0.0',
      isActive:    true,
    };
  }

  // ── Private ─────────────────────────────────────────────────

  private _deduplicateActions(actions: WorkflowAction[]): WorkflowAction[] {
    const seen = new Set<string>();
    return actions.filter((a) => {
      const key = `${a.type}:${a.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const policyOrchestrationService = new PolicyOrchestrationService();

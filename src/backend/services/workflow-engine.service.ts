// ============================================================
// CapitalForge — Workflow Automation Engine
//
// Rule-driven workflow: IF [conditions] THEN [required actions].
//
// Responsibilities:
//   1. Evaluate WorkflowRules against a deal/business context
//   2. Resolve required actions and blocks per rule match
//   3. Enforce state-triggered workflow transitions
//   4. Required approval chains by deal risk tier
//   5. Return structured action requirements with priority ordering
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

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

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'exists'
  | 'not_exists';

export interface RuleCondition {
  field: string;          // dot-notation path in DealContext, e.g. "deal.riskTier"
  operator: ConditionOperator;
  value?: unknown;        // not required for exists/not_exists
}

export type ActionType =
  | 'require_approval'
  | 'block_progression'
  | 'require_document'
  | 'notify_advisor'
  | 'notify_compliance'
  | 'flag_for_review'
  | 'trigger_compliance_check'
  | 'require_committee_review'
  | 'send_disclosure'
  | 'pause_workflow';

export interface WorkflowAction {
  type: ActionType;
  label: string;
  config?: Record<string, unknown>;
  /** Roles that must fulfill this action */
  requiredRoles?: string[];
  /** Whether this action blocks progression until complete */
  blocking: boolean;
}

/** Structured result of evaluating a single workflow rule */
export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actions: WorkflowAction[];
  priority: number;
}

/** Full workflow evaluation output for a deal context */
export interface WorkflowEvaluationOutput {
  dealContext: DealContext;
  matchedRules: RuleEvaluationResult[];
  requiredActions: WorkflowAction[];
  blockers: WorkflowAction[];
  approvalChain: ApprovalStep[];
  canProgress: boolean;
  evaluatedAt: Date;
}

export interface ApprovalStep {
  stepNumber: number;
  label: string;
  requiredRole: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: Date;
}

/** Context object fed into rule evaluation */
export interface DealContext {
  tenantId: string;
  businessId: string;
  deal: {
    riskTier: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    fundingRoundId?: string;
    targetCredit?: number;
    annualRevenue?: number;
    creditScore?: number;
    stateOfFormation?: string;
    entityType?: string;
    businessAgeMonths?: number;
  };
  compliance?: {
    kycStatus?: string;
    kybStatus?: string;
    sanctionsCleared?: boolean;
    udapRiskLevel?: string;
    suitabilityScore?: number;
  };
  documents?: {
    requiredTypes?: string[];
    uploadedTypes?: string[];
  };
  approvals?: {
    counselSignoff?: boolean;
    accountantSignoff?: boolean;
    committeeApproved?: boolean;
  };
  [key: string]: unknown;
}

// ============================================================
// Risk-tier approval chains
// ============================================================

export const APPROVAL_CHAINS: Record<string, ApprovalStep[]> = {
  low: [
    { stepNumber: 1, label: 'Advisor sign-off', requiredRole: 'advisor', completed: false },
  ],
  medium: [
    { stepNumber: 1, label: 'Advisor sign-off', requiredRole: 'advisor', completed: false },
    { stepNumber: 2, label: 'Compliance review', requiredRole: 'compliance_officer', completed: false },
  ],
  high: [
    { stepNumber: 1, label: 'Advisor sign-off', requiredRole: 'advisor', completed: false },
    { stepNumber: 2, label: 'Compliance review', requiredRole: 'compliance_officer', completed: false },
    { stepNumber: 3, label: 'Legal counsel sign-off', requiredRole: 'legal_counsel', completed: false },
  ],
  critical: [
    { stepNumber: 1, label: 'Advisor sign-off', requiredRole: 'advisor', completed: false },
    { stepNumber: 2, label: 'Compliance review', requiredRole: 'compliance_officer', completed: false },
    { stepNumber: 3, label: 'Legal counsel sign-off', requiredRole: 'legal_counsel', completed: false },
    { stepNumber: 4, label: 'Deal committee approval', requiredRole: 'committee_member', completed: false },
    { stepNumber: 5, label: 'Executive sponsor approval', requiredRole: 'executive', completed: false },
  ],
};

// ============================================================
// Condition evaluator
// ============================================================

function resolvePath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function evaluateCondition(condition: RuleCondition, context: DealContext): boolean {
  const actual = resolvePath(context, condition.field);

  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'gt':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'gte':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lt':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'lte':
      return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(actual);
    case 'contains':
      return typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    default:
      return false;
  }
}

export function evaluateConditions(conditions: RuleCondition[], context: DealContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, context));
}

// ============================================================
// Workflow Engine Service
// ============================================================

export class WorkflowEngineService {

  /**
   * Create a new WorkflowRule in the database.
   */
  async createRule(params: {
    tenantId: string;
    name: string;
    conditions: RuleCondition[];
    actions: WorkflowAction[];
    priority?: number;
    triggerEvent?: string;
  }) {
    const prisma = getPrisma();

    const rule = await prisma.workflowRule.create({
      data: {
        id:           uuidv4(),
        tenantId:     params.tenantId,
        name:         params.name,
        conditions:   params.conditions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        actions:      params.actions as unknown as import('@prisma/client').Prisma.InputJsonValue,
        priority:     params.priority ?? 0,
        triggerEvent: params.triggerEvent ?? null,
        isActive:     true,
      },
    });

    logger.info('[WorkflowEngine] Rule created', { ruleId: rule.id, name: rule.name });
    return rule;
  }

  /**
   * List active workflow rules for a tenant, sorted by priority descending.
   */
  async listRules(tenantId: string) {
    const prisma = getPrisma();
    return prisma.workflowRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * Evaluate all active workflow rules against the provided deal context.
   * Returns matched rules, required actions, blockers, and approval chain.
   */
  async evaluateRules(context: DealContext): Promise<WorkflowEvaluationOutput> {
    const prisma = getPrisma();

    const rules = await prisma.workflowRule.findMany({
      where: { tenantId: context.tenantId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    const matchedRules: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as RuleCondition[];
      const actions    = rule.actions    as unknown as WorkflowAction[];

      const matched = evaluateConditions(conditions, context);

      matchedRules.push({
        ruleId:    rule.id,
        ruleName:  rule.name,
        matched,
        actions:   matched ? actions : [],
        priority:  rule.priority,
      });
    }

    const activeMatches = matchedRules.filter((r) => r.matched);

    // Flatten and deduplicate required actions
    const allActions: WorkflowAction[] = activeMatches.flatMap((r) => r.actions);
    const requiredActions = this._deduplicateActions(allActions);
    const blockers = requiredActions.filter((a) => a.blocking);

    // Resolve approval chain from deal risk tier
    const riskTier = context.deal.riskTier ?? 'medium';
    const approvalChain = this._resolveApprovalChain(riskTier, context.approvals);

    const pendingApprovals = approvalChain.filter((s) => !s.completed);
    const canProgress = blockers.length === 0 && pendingApprovals.length === 0;

    const output: WorkflowEvaluationOutput = {
      dealContext:    context,
      matchedRules,
      requiredActions,
      blockers,
      approvalChain,
      canProgress,
      evaluatedAt:    new Date(),
    };

    // Emit ledger event
    await eventBus.publishAndPersist({
      tenantId:      context.tenantId,
      eventType:     EVENT_TYPES.WORKFLOW_EVALUATED ?? 'WORKFLOW_EVALUATED',
      aggregateType: AGGREGATE_TYPES.BUSINESS ?? 'business',
      aggregateId:   context.businessId,
      payload:       {
        businessId:       context.businessId,
        matchedRuleCount: activeMatches.length,
        blockerCount:     blockers.length,
        canProgress,
      },
    });

    return output;
  }

  /**
   * Returns the required approval chain for a given risk tier,
   * merging in any already-completed approvals from the deal context.
   */
  getApprovalChain(
    riskTier: 'low' | 'medium' | 'high' | 'critical',
    completedApprovals?: DealContext['approvals'],
  ): ApprovalStep[] {
    return this._resolveApprovalChain(riskTier, completedApprovals);
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

  private _resolveApprovalChain(
    riskTier: string,
    completedApprovals?: DealContext['approvals'],
  ): ApprovalStep[] {
    const chain = (APPROVAL_CHAINS[riskTier] ?? APPROVAL_CHAINS['medium']).map((s) => ({ ...s }));

    if (!completedApprovals) return chain;

    for (const step of chain) {
      if (step.requiredRole === 'legal_counsel' && completedApprovals.counselSignoff) {
        step.completed = true;
      }
      if (step.requiredRole === 'committee_member' && completedApprovals.committeeApproved) {
        step.completed = true;
      }
    }

    return chain;
  }
}

export const workflowEngineService = new WorkflowEngineService();

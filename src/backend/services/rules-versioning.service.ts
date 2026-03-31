// ============================================================
// CapitalForge — Rules Versioning & Release Management
//
// Version control for issuer rules, state disclosures, and
// policy playbooks. Supports staged deployment, rollback with
// audit trail, policy diffing, and impact simulation.
//
// Responsibilities:
//   1. Create versioned rule snapshots
//   2. Staged deployment: test → staging → production
//   3. Rollback to any previous version with audit reason
//   4. Policy diff viewer: structured diff between two versions
//   5. Rule change impact simulation against live deal contexts
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';
import {
  evaluateConditions,
  type RuleCondition,
  type WorkflowAction,
  type DealContext,
} from './workflow-engine.service.js';
import type { PolicyRuleType } from './policy-orchestration.service.js';

// ============================================================
// Domain types
// ============================================================

export type DeploymentStage = 'test' | 'staging' | 'production';

export type RuleCategory = 'issuer_rule' | 'state_disclosure' | 'policy_playbook' | 'workflow_rule';

export interface RuleVersion {
  id: string;
  tenantId: string;
  ruleCategory: RuleCategory;
  ruleId: string;                  // ID of the logical rule being versioned
  ruleName: string;
  semver: string;                  // e.g. "2.3.1"
  stage: DeploymentStage;
  isActive: boolean;               // true = current live version for its stage
  payload: RuleVersionPayload;
  createdBy: string;
  createdAt: Date;
  deployedAt?: Date;
  rolledBackAt?: Date;
  rollbackReason?: string;
  rollbackBy?: string;
}

export interface RuleVersionPayload {
  conditions: RuleCondition[];
  actions: WorkflowAction[];
  ruleType?: PolicyRuleType;
  metadata?: Record<string, unknown>;
}

export type FieldDiff =
  | { type: 'added';   field: string; newValue: unknown }
  | { type: 'removed'; field: string; oldValue: unknown }
  | { type: 'changed'; field: string; oldValue: unknown; newValue: unknown };

export interface PolicyDiff {
  fromVersion: string;
  toVersion:   string;
  ruleId:      string;
  diffs:       FieldDiff[];
  conditionDiffs: ConditionDiff[];
  actionDiffs:    ActionDiff[];
  breakingChange: boolean;
  summary:        string;
}

export interface ConditionDiff {
  index:    number;
  type:     'added' | 'removed' | 'changed';
  from?:    RuleCondition;
  to?:      RuleCondition;
}

export interface ActionDiff {
  index:  number;
  type:   'added' | 'removed' | 'changed';
  from?:  WorkflowAction;
  to?:    WorkflowAction;
}

export interface ImpactSimulationResult {
  versionId:      string;
  testedContexts: number;
  impactedDeals:  ImpactedDeal[];
  summary: {
    totalImpacted:          number;
    newBlockers:            number;
    removedBlockers:        number;
    approvalChainChanges:   number;
  };
}

export interface ImpactedDeal {
  businessId: string;
  dealStatus: string;
  currentActions: string[];
  simulatedActions: string[];
  delta: {
    added:   string[];
    removed: string[];
  };
  blockingChange: boolean;
}

// ============================================================
// Store key helper
// ============================================================

function storeKey(tenantId: string, ruleId: string, semver: string): string {
  return `${tenantId}:${ruleId}:${semver}`;
}

// ============================================================
// Rules Versioning Service
// ============================================================

export class RulesVersioningService {

  // In-memory store (production would use DB table / Redis)
  // Keyed: tenantId:ruleId:semver
  private _store = new Map<string, RuleVersion>();


  // ── Version creation ─────────────────────────────────────────

  /**
   * Create a new version snapshot of a rule.
   * Starts in 'test' stage by default.
   */
  createVersion(params: {
    tenantId:     string;
    ruleCategory: RuleCategory;
    ruleId:       string;
    ruleName:     string;
    semver:       string;
    payload:      RuleVersionPayload;
    createdBy:    string;
  }): RuleVersion {
    const existing = this.getVersion(params.tenantId, params.ruleId, params.semver);
    if (existing) {
      throw new Error(
        `[RulesVersioning] Version ${params.semver} already exists for rule ${params.ruleId}`,
      );
    }

    const version: RuleVersion = {
      id:           uuidv4(),
      tenantId:     params.tenantId,
      ruleCategory: params.ruleCategory,
      ruleId:       params.ruleId,
      ruleName:     params.ruleName,
      semver:       params.semver,
      stage:        'test',
      isActive:     false,
      payload:      params.payload,
      createdBy:    params.createdBy,
      createdAt:    new Date(),
    };

    this._store.set(storeKey(params.tenantId, params.ruleId, params.semver), version);

    logger.info('[RulesVersioning] Version created', {
      ruleId:  version.ruleId,
      semver:  version.semver,
      stage:   version.stage,
    });

    return version;
  }

  // ── Version retrieval ────────────────────────────────────────

  getVersion(tenantId: string, ruleId: string, semver: string): RuleVersion | undefined {
    return this._store.get(storeKey(tenantId, ruleId, semver));
  }

  listVersions(tenantId: string, ruleId?: string): RuleVersion[] {
    const versions: RuleVersion[] = [];
    for (const v of this._store.values()) {
      if (v.tenantId !== tenantId) continue;
      if (ruleId && v.ruleId !== ruleId) continue;
      versions.push(v);
    }
    return versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getActiveVersion(tenantId: string, ruleId: string, stage: DeploymentStage): RuleVersion | undefined {
    for (const v of this._store.values()) {
      if (v.tenantId === tenantId && v.ruleId === ruleId && v.stage === stage && v.isActive) {
        return v;
      }
    }
    return undefined;
  }

  getVersionById(id: string): RuleVersion | undefined {
    for (const v of this._store.values()) {
      if (v.id === id) return v;
    }
    return undefined;
  }

  // ── Staged deployment ────────────────────────────────────────

  /**
   * Deploy a version to the next stage in the pipeline.
   * Allowed progressions: test → staging → production.
   * Deactivates the previously active version for that stage.
   */
  async deployVersion(params: {
    versionId:  string;
    targetStage: DeploymentStage;
    deployedBy:  string;
    tenantId:    string;
  }): Promise<RuleVersion> {
    const version = this.getVersionById(params.versionId);
    if (!version) {
      throw new Error(`[RulesVersioning] Version not found: ${params.versionId}`);
    }
    if (version.tenantId !== params.tenantId) {
      throw new Error('[RulesVersioning] Tenant mismatch');
    }

    this._validateStageProgression(version.stage, params.targetStage);

    // Deactivate current active version for this stage
    for (const v of this._store.values()) {
      if (
        v.tenantId === params.tenantId &&
        v.ruleId === version.ruleId &&
        v.stage === params.targetStage &&
        v.isActive
      ) {
        v.isActive = false;
      }
    }

    version.stage      = params.targetStage;
    version.isActive   = true;
    version.deployedAt = new Date();

    logger.info('[RulesVersioning] Version deployed', {
      ruleId:  version.ruleId,
      semver:  version.semver,
      stage:   params.targetStage,
    });

    await eventBus.publishAndPersist({
      tenantId:      params.tenantId,
      eventType:     EVENT_TYPES.RULE_VERSION_DEPLOYED ?? 'RULE_VERSION_DEPLOYED',
      aggregateType: AGGREGATE_TYPES.BUSINESS ?? 'rule',
      aggregateId:   version.ruleId,
      payload: {
        versionId:   version.id,
        ruleId:      version.ruleId,
        semver:      version.semver,
        stage:       params.targetStage,
        deployedBy:  params.deployedBy,
      },
    });

    return version;
  }

  // ── Rollback ────────────────────────────────────────────────

  /**
   * Roll back to a previous version on a given stage.
   * Records the rollback reason in the version audit trail.
   */
  async rollback(params: {
    versionId:    string;
    reason:       string;
    rolledBackBy: string;
    tenantId:     string;
  }): Promise<RuleVersion> {
    const version = this.getVersionById(params.versionId);
    if (!version) {
      throw new Error(`[RulesVersioning] Version not found: ${params.versionId}`);
    }
    if (version.tenantId !== params.tenantId) {
      throw new Error('[RulesVersioning] Tenant mismatch');
    }
    if (!version.isActive) {
      throw new Error('[RulesVersioning] Cannot roll back an inactive version. Target the active version for this stage.');
    }

    // Find the previously active version for the same stage
    const candidates = this.listVersions(params.tenantId, version.ruleId)
      .filter((v) => v.id !== version.id && v.stage === version.stage && !v.rolledBackAt)
      .sort((a, b) => (b.deployedAt?.getTime() ?? 0) - (a.deployedAt?.getTime() ?? 0));

    // Deactivate current
    version.isActive       = false;
    version.rolledBackAt   = new Date();
    version.rollbackReason = params.reason;
    version.rollbackBy     = params.rolledBackBy;

    // Re-activate previous if available
    let restored: RuleVersion | undefined;
    if (candidates.length > 0) {
      restored           = candidates[0];
      restored.isActive  = true;
      restored.deployedAt = new Date();
    }

    logger.warn('[RulesVersioning] Version rolled back', {
      ruleId:        version.ruleId,
      semver:        version.semver,
      reason:        params.reason,
      restoredSemver: restored?.semver,
    });

    await eventBus.publishAndPersist({
      tenantId:      params.tenantId,
      eventType:     EVENT_TYPES.RULE_VERSION_ROLLED_BACK ?? 'RULE_VERSION_ROLLED_BACK',
      aggregateType: AGGREGATE_TYPES.BUSINESS ?? 'rule',
      aggregateId:   version.ruleId,
      payload: {
        rolledBackVersionId: version.id,
        semver:              version.semver,
        reason:              params.reason,
        rolledBackBy:        params.rolledBackBy,
        restoredVersionId:   restored?.id,
        restoredSemver:      restored?.semver,
      },
    });

    return version;
  }

  // ── Policy diff viewer ───────────────────────────────────────

  /**
   * Compute a structured diff between two rule versions.
   */
  diffVersions(
    tenantId:    string,
    ruleId:      string,
    fromSemver:  string,
    toSemver:    string,
  ): PolicyDiff {
    const from = this.getVersion(tenantId, ruleId, fromSemver);
    const to   = this.getVersion(tenantId, ruleId, toSemver);

    if (!from) throw new Error(`[RulesVersioning] Version not found: ${fromSemver}`);
    if (!to)   throw new Error(`[RulesVersioning] Version not found: ${toSemver}`);

    const diffs: FieldDiff[]          = [];
    const conditionDiffs: ConditionDiff[] = [];
    const actionDiffs:    ActionDiff[]    = [];

    // Top-level metadata diff (ruleName)
    if (from.ruleName !== to.ruleName) {
      diffs.push({ type: 'changed', field: 'ruleName', oldValue: from.ruleName, newValue: to.ruleName });
    }

    // Condition diffs
    const fromConds = from.payload.conditions ?? [];
    const toConds   = to.payload.conditions   ?? [];
    const condLen = Math.max(fromConds.length, toConds.length);

    for (let i = 0; i < condLen; i++) {
      const fc = fromConds[i];
      const tc = toConds[i];
      if (!fc && tc) {
        conditionDiffs.push({ index: i, type: 'added',   to: tc });
      } else if (fc && !tc) {
        conditionDiffs.push({ index: i, type: 'removed', from: fc });
      } else if (JSON.stringify(fc) !== JSON.stringify(tc)) {
        conditionDiffs.push({ index: i, type: 'changed', from: fc, to: tc });
      }
    }

    // Action diffs
    const fromActions = from.payload.actions ?? [];
    const toActions   = to.payload.actions   ?? [];
    const actLen = Math.max(fromActions.length, toActions.length);

    for (let i = 0; i < actLen; i++) {
      const fa = fromActions[i];
      const ta = toActions[i];
      if (!fa && ta) {
        actionDiffs.push({ index: i, type: 'added',   to: ta });
      } else if (fa && !ta) {
        actionDiffs.push({ index: i, type: 'removed', from: fa });
      } else if (JSON.stringify(fa) !== JSON.stringify(ta)) {
        actionDiffs.push({ index: i, type: 'changed', from: fa, to: ta });
      }
    }

    // Breaking change: new blocker added or existing non-blocking action became blocking
    const breakingChange = actionDiffs.some((d) => {
      if (d.type === 'added') return d.to?.blocking === true;
      if (d.type === 'changed') return !d.from?.blocking && d.to?.blocking === true;
      return false;
    });

    const totalChanges = diffs.length + conditionDiffs.length + actionDiffs.length;
    const summary = totalChanges === 0
      ? 'No changes between versions.'
      : `${totalChanges} change(s): ${conditionDiffs.length} condition(s), ${actionDiffs.length} action(s).${breakingChange ? ' BREAKING: new blocker introduced.' : ''}`;

    return {
      fromVersion: fromSemver,
      toVersion:   toSemver,
      ruleId,
      diffs,
      conditionDiffs,
      actionDiffs,
      breakingChange,
      summary,
    };
  }

  // ── Impact simulation ────────────────────────────────────────

  /**
   * Simulate the impact of deploying a specific version against
   * a set of deal contexts (without actually deploying).
   */
  simulateImpact(params: {
    versionId:    string;
    tenantId:     string;
    dealContexts: DealContext[];
  }): ImpactSimulationResult {
    const version = this.getVersionById(params.versionId);
    if (!version) {
      throw new Error(`[RulesVersioning] Version not found: ${params.versionId}`);
    }

    const impactedDeals: ImpactedDeal[] = [];
    let newBlockers        = 0;
    let removedBlockers    = 0;
    let approvalChainChanges = 0;

    // Get the currently active production version for comparison
    const currentVersion = this.getActiveVersion(params.tenantId, version.ruleId, 'production');

    for (const context of params.dealContexts) {
      const currentActions = currentVersion
        ? this._simulateActions(currentVersion.payload, context)
        : [];
      const simulatedActions = this._simulateActions(version.payload, context);

      const currentSet    = new Set(currentActions);
      const simulatedSet  = new Set(simulatedActions);

      const added:   string[] = simulatedActions.filter((a) => !currentSet.has(a));
      const removed: string[] = currentActions.filter((a) => !simulatedSet.has(a));

      if (added.length === 0 && removed.length === 0) continue;

      const currentBlockers   = currentActions.filter((a) => a.startsWith('BLOCK:'));
      const simulatedBlockers = simulatedActions.filter((a) => a.startsWith('BLOCK:'));

      const blockingChange = simulatedBlockers.length !== currentBlockers.length ||
        simulatedBlockers.some((b) => !currentBlockers.includes(b));

      if (blockingChange) {
        if (simulatedBlockers.length > currentBlockers.length) newBlockers++;
        else removedBlockers++;
      }

      impactedDeals.push({
        businessId:       context.businessId,
        dealStatus:       context.deal.status,
        currentActions,
        simulatedActions,
        delta:            { added, removed },
        blockingChange,
      });
    }

    return {
      versionId:      params.versionId,
      testedContexts: params.dealContexts.length,
      impactedDeals,
      summary: {
        totalImpacted:        impactedDeals.length,
        newBlockers,
        removedBlockers,
        approvalChainChanges,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  private _validateStageProgression(current: DeploymentStage, target: DeploymentStage): void {
    const ORDER: DeploymentStage[] = ['test', 'staging', 'production'];
    const currentIdx = ORDER.indexOf(current);
    const targetIdx  = ORDER.indexOf(target);

    // Allow re-deploying to same stage or advancing one step
    if (targetIdx < currentIdx) {
      throw new Error(
        `[RulesVersioning] Cannot deploy from ${current} to ${target}. Use rollback instead.`,
      );
    }
  }

  private _simulateActions(payload: RuleVersionPayload, context: DealContext): string[] {
    const matched = evaluateConditions(payload.conditions, context);
    if (!matched) return [];

    return (payload.actions ?? []).map((a) => {
      const prefix = a.blocking ? 'BLOCK' : 'ACTION';
      return `${prefix}:${a.type}:${a.label}`;
    });
  }
}

export const rulesVersioningService = new RulesVersioningService();

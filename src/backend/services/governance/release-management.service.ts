// ============================================================
// CapitalForge — Release & Rollout Discipline Service
//
// Manages staged rule/feature deployment across tenants:
//   1. Feature flags per tenant (on/off/percentage rollout)
//   2. Staged rule deployment: canary → expanded → all
//   3. Migration preview — dry-run before deployment
//   4. Rollback with full audit trail
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../../config/logger.js';

// ============================================================
// Domain types
// ============================================================

export type RolloutStage = 'canary' | 'expanded' | 'all' | 'rollback';

export type FeatureFlagState = 'on' | 'off' | 'percentage';

export interface FeatureFlag {
  id: string;
  featureKey: string;
  tenantId: string;        // '*' = platform-wide default
  state: FeatureFlagState;
  percentage?: number;     // 0–100; only when state === 'percentage'
  enabledForTenants: string[]; // explicit allowlist when state !== 'on'
  description: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}

export interface ReleaseDeployment {
  id: string;
  tenantId: string;        // '*' = all tenants
  releaseTag: string;      // e.g. "v2.4.1-issuer-rules"
  ruleVersionIds: string[];
  stage: RolloutStage;
  canaryTenantIds: string[];
  expandedTenantIds: string[];
  status: 'draft' | 'in_progress' | 'complete' | 'rolled_back';
  migrationPreviewId?: string;
  deployedAt?: Date;
  deployedBy?: string;
  rollbackAt?: Date;
  rollbackBy?: string;
  rollbackReason?: string;
  auditLog: ReleaseAuditEntry[];
  createdAt: Date;
  createdBy: string;
}

export interface ReleaseAuditEntry {
  ts: Date;
  actor: string;
  action: string;
  detail: string;
}

export interface MigrationPreview {
  id: string;
  releaseTag: string;
  tenantId: string;
  ruleVersionIds: string[];
  affectedEntityCount: number;
  breakingChanges: BreakingChange[];
  warnings: string[];
  previewedAt: Date;
  previewedBy: string;
  approved: boolean;
}

export interface BreakingChange {
  entityId: string;
  entityType: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changeType: 'field_removed' | 'type_changed' | 'value_constraint_tightened' | 'new_mandatory_field';
}

export interface CreateFeatureFlagInput {
  featureKey: string;
  tenantId: string;
  state: FeatureFlagState;
  percentage?: number;
  enabledForTenants?: string[];
  description: string;
  createdBy: string;
}

export interface UpdateFeatureFlagInput {
  flagId: string;
  state?: FeatureFlagState;
  percentage?: number;
  enabledForTenants?: string[];
  updatedBy: string;
}

export interface CreateReleaseInput {
  tenantId: string;
  releaseTag: string;
  ruleVersionIds: string[];
  canaryTenantIds: string[];
  expandedTenantIds: string[];
  createdBy: string;
}

// ============================================================
// In-memory stores
// ============================================================

const flagStore: FeatureFlag[]             = [];
const releaseStore: ReleaseDeployment[]    = [];
const previewStore: MigrationPreview[]     = [];

// ============================================================
// Service
// ============================================================

export class ReleaseManagementService {

  // ── Feature Flags ────────────────────────────────────────────

  setFeatureFlag(input: CreateFeatureFlagInput): FeatureFlag {
    const existing = flagStore.find(
      (f) => f.featureKey === input.featureKey && f.tenantId === input.tenantId,
    );

    if (existing) {
      existing.state             = input.state;
      existing.percentage        = input.percentage;
      existing.enabledForTenants = input.enabledForTenants ?? existing.enabledForTenants;
      existing.description       = input.description;
      existing.updatedAt         = new Date();
      existing.updatedBy         = input.createdBy;
      logger.info({ featureKey: input.featureKey, tenantId: input.tenantId, state: input.state }, 'feature flag updated');
      return existing;
    }

    const flag: FeatureFlag = {
      id: uuidv4(),
      featureKey: input.featureKey,
      tenantId: input.tenantId,
      state: input.state,
      percentage: input.percentage,
      enabledForTenants: input.enabledForTenants ?? [],
      description: input.description,
      createdBy: input.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: input.createdBy,
    };

    flagStore.push(flag);
    logger.info({ featureKey: input.featureKey, tenantId: input.tenantId, state: input.state }, 'feature flag created');
    return flag;
  }

  updateFeatureFlag(input: UpdateFeatureFlagInput): FeatureFlag {
    const flag = flagStore.find((f) => f.id === input.flagId);
    if (!flag) throw new Error(`Feature flag ${input.flagId} not found`);

    if (input.state !== undefined)             flag.state             = input.state;
    if (input.percentage !== undefined)        flag.percentage        = input.percentage;
    if (input.enabledForTenants !== undefined) flag.enabledForTenants = input.enabledForTenants;
    flag.updatedAt = new Date();
    flag.updatedBy = input.updatedBy;

    logger.info({ flagId: input.flagId, updatedBy: input.updatedBy }, 'feature flag patched');
    return flag;
  }

  isFlagEnabled(featureKey: string, tenantId: string): boolean {
    // Tenant-specific flag takes precedence over platform default
    const tenantFlag = flagStore.find((f) => f.featureKey === featureKey && f.tenantId === tenantId);
    const flag = tenantFlag ?? flagStore.find((f) => f.featureKey === featureKey && f.tenantId === '*');

    if (!flag) return false;
    if (flag.state === 'on') return true;
    if (flag.state === 'off') return false;
    if (flag.state === 'percentage') {
      if (flag.enabledForTenants.includes(tenantId)) return true;
      const pct = flag.percentage ?? 0;
      // deterministic hash-based percentage check
      const hash = tenantId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      return (hash % 100) < pct;
    }
    return false;
  }

  listFeatureFlags(tenantId?: string): FeatureFlag[] {
    if (!tenantId) return [...flagStore];
    return flagStore.filter((f) => f.tenantId === tenantId || f.tenantId === '*');
  }

  // ── Migration Preview ────────────────────────────────────────

  async previewMigration(
    releaseTag: string,
    ruleVersionIds: string[],
    tenantId: string,
    previewedBy: string,
    mockAffectedEntities: Array<{ entityId: string; entityType: string; before: Record<string, unknown>; after: Record<string, unknown> }> = [],
  ): Promise<MigrationPreview> {
    const breakingChanges: BreakingChange[] = [];
    const warnings: string[] = [];

    for (const entity of mockAffectedEntities) {
      const beforeKeys = Object.keys(entity.before);
      const afterKeys  = Object.keys(entity.after);

      // Detect removed fields
      for (const key of beforeKeys) {
        if (!afterKeys.includes(key)) {
          breakingChanges.push({
            entityId: entity.entityId,
            entityType: entity.entityType,
            before: { [key]: entity.before[key] },
            after: {},
            changeType: 'field_removed',
          });
        }
      }

      // Detect type changes
      for (const key of afterKeys) {
        const beforeVal = entity.before[key];
        const afterVal  = entity.after[key];
        if (beforeVal !== undefined && typeof beforeVal !== typeof afterVal) {
          breakingChanges.push({
            entityId: entity.entityId,
            entityType: entity.entityType,
            before: { [key]: beforeVal },
            after: { [key]: afterVal },
            changeType: 'type_changed',
          });
        }
      }

      // Detect new mandatory fields (present in after but not before)
      for (const key of afterKeys) {
        if (!beforeKeys.includes(key)) {
          warnings.push(`Entity ${entity.entityId}: new field '${key}' added (may require backfill)`);
        }
      }
    }

    const preview: MigrationPreview = {
      id: uuidv4(),
      releaseTag,
      tenantId,
      ruleVersionIds,
      affectedEntityCount: mockAffectedEntities.length,
      breakingChanges,
      warnings,
      previewedAt: new Date(),
      previewedBy,
      approved: breakingChanges.length === 0,
    };

    previewStore.push(preview);
    logger.info({ previewId: preview.id, breakingChanges: breakingChanges.length }, 'migration preview generated');
    return preview;
  }

  // ── Staged Deployments ───────────────────────────────────────

  async createRelease(input: CreateReleaseInput): Promise<ReleaseDeployment> {
    const release: ReleaseDeployment = {
      id: uuidv4(),
      tenantId: input.tenantId,
      releaseTag: input.releaseTag,
      ruleVersionIds: input.ruleVersionIds,
      stage: 'canary',
      canaryTenantIds: input.canaryTenantIds,
      expandedTenantIds: input.expandedTenantIds,
      status: 'draft',
      auditLog: [],
      createdAt: new Date(),
      createdBy: input.createdBy,
    };

    release.auditLog.push({
      ts: new Date(),
      actor: input.createdBy,
      action: 'created',
      detail: `Release ${input.releaseTag} created with ${input.ruleVersionIds.length} rule version(s)`,
    });

    releaseStore.push(release);
    logger.info({ releaseId: release.id, releaseTag: input.releaseTag }, 'release created');
    return release;
  }

  async advanceStage(releaseId: string, actor: string): Promise<ReleaseDeployment> {
    const release = releaseStore.find((r) => r.id === releaseId);
    if (!release) throw new Error(`Release ${releaseId} not found`);
    if (release.status === 'rolled_back') throw new Error(`Cannot advance a rolled-back release`);

    const stageMap: Record<RolloutStage, RolloutStage> = {
      canary: 'expanded',
      expanded: 'all',
      all: 'all',
      rollback: 'canary',
    };

    const prevStage = release.stage;
    release.stage = stageMap[release.stage];

    if (release.stage === 'all') {
      release.status = 'complete';
      release.deployedAt = new Date();
      release.deployedBy = actor;
    } else {
      release.status = 'in_progress';
    }

    release.auditLog.push({
      ts: new Date(),
      actor,
      action: 'stage_advanced',
      detail: `Stage advanced from ${prevStage} → ${release.stage}`,
    });

    await eventBus.publishAndPersist({
      id: uuidv4(),
      type: EVENT_TYPES.RULE_UPDATED,
      aggregateType: AGGREGATE_TYPES.RULE,
      aggregateId: release.id,
      tenantId: release.tenantId,
      payload: { releaseTag: release.releaseTag, stage: release.stage, actor },
      occurredAt: new Date(),
    });

    logger.info({ releaseId, stage: release.stage }, 'release stage advanced');
    return release;
  }

  async rollbackRelease(releaseId: string, rollbackBy: string, reason: string): Promise<ReleaseDeployment> {
    const release = releaseStore.find((r) => r.id === releaseId);
    if (!release) throw new Error(`Release ${releaseId} not found`);
    if (release.status === 'draft') throw new Error(`Cannot rollback a draft release`);

    release.stage          = 'rollback';
    release.status         = 'rolled_back';
    release.rollbackAt     = new Date();
    release.rollbackBy     = rollbackBy;
    release.rollbackReason = reason;

    release.auditLog.push({
      ts: new Date(),
      actor: rollbackBy,
      action: 'rollback',
      detail: `Rolled back — reason: ${reason}`,
    });

    await eventBus.publishAndPersist({
      id: uuidv4(),
      type: EVENT_TYPES.RULE_UPDATED,
      aggregateType: AGGREGATE_TYPES.RULE,
      aggregateId: release.id,
      tenantId: release.tenantId,
      payload: { releaseTag: release.releaseTag, rollbackBy, reason },
      occurredAt: new Date(),
    });

    logger.info({ releaseId, rollbackBy, reason }, 'release rolled back');
    return release;
  }

  listReleases(tenantId?: string): ReleaseDeployment[] {
    const releases = tenantId
      ? releaseStore.filter((r) => r.tenantId === tenantId || r.tenantId === '*')
      : [...releaseStore];
    return releases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getRelease(releaseId: string): ReleaseDeployment | null {
    return releaseStore.find((r) => r.id === releaseId) ?? null;
  }

  getPreview(previewId: string): MigrationPreview | null {
    return previewStore.find((p) => p.id === previewId) ?? null;
  }

  _reset(): void {
    flagStore.length    = 0;
    releaseStore.length = 0;
    previewStore.length = 0;
  }
}

// ============================================================
// CapitalForge — SaaS Entitlements & Usage Metering
//
// Responsibilities:
//   • Pricing plan definitions (Starter / Professional / Enterprise)
//   • Module entitlements per plan (feature flags)
//   • Usage metering by module + action, per billing period
//   • Overage detection and alerting
//   • Reseller / white-label economics (margin, seat pricing)
//   • TenantPlan management (activate, upgrade, downgrade)
//   • UsageMeter reads and writes
// ============================================================

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

// ── Plan Names ────────────────────────────────────────────────────────────────

export type PlanName = 'starter' | 'professional' | 'enterprise' | 'reseller';

// ── Module Keys ───────────────────────────────────────────────────────────────

export type ModuleKey =
  | 'credit_intelligence'
  | 'card_stacking_optimizer'
  | 'compliance_center'
  | 'document_vault'
  | 'ach_controls'
  | 'spend_governance'
  | 'rewards_optimization'
  | 'repayment_planner'
  | 'deal_committee'
  | 'partner_portal'
  | 'white_label_branding'
  | 'api_access'
  | 'advanced_analytics'
  | 'ai_underwriting'
  | 'multi_advisor'
  | 'sandbox_mode';

// ── Entitlement Definition ────────────────────────────────────────────────────

export interface ModuleEntitlement {
  enabled: boolean;
  /** null = unlimited */
  monthlyLimit: number | null;
  /** Seat cap (for per-advisor modules), null = unlimited */
  seatLimit: number | null;
}

export type PlanEntitlements = Record<ModuleKey, ModuleEntitlement>;

// ── Usage Limits ──────────────────────────────────────────────────────────────

export interface UsageLimits {
  /** Max businesses under management */
  maxBusinesses: number | null;
  /** Max API calls per month */
  maxApiCallsPerMonth: number | null;
  /** Max documents stored */
  maxDocuments: number | null;
  /** Max advisor user seats */
  maxSeats: number | null;
  /** Max card applications submitted per month */
  maxCardApplicationsPerMonth: number | null;
}

// ── Plan Definition ───────────────────────────────────────────────────────────

export interface PlanDefinition {
  name: PlanName;
  displayName: string;
  monthlyPrice: number;
  annualPrice: number;
  usageLimits: UsageLimits;
  entitlements: PlanEntitlements;
  resellerMarginPercent: number | null;
  overageRatePerUnit: Record<string, number>;
}

// ── Plan Catalog ──────────────────────────────────────────────────────────────

function entitlement(
  enabled: boolean,
  monthlyLimit: number | null = null,
  seatLimit: number | null = null,
): ModuleEntitlement {
  return { enabled, monthlyLimit, seatLimit };
}

export const PLAN_CATALOG: Record<PlanName, PlanDefinition> = {
  starter: {
    name: 'starter',
    displayName: 'Starter',
    monthlyPrice: 199,
    annualPrice: 1_990,
    usageLimits: {
      maxBusinesses: 10,
      maxApiCallsPerMonth: 1_000,
      maxDocuments: 100,
      maxSeats: 2,
      maxCardApplicationsPerMonth: 25,
    },
    entitlements: {
      credit_intelligence:         entitlement(true,  50),
      card_stacking_optimizer:     entitlement(true,  25),
      compliance_center:           entitlement(true,  null),
      document_vault:              entitlement(true,  100),
      ach_controls:                entitlement(false),
      spend_governance:            entitlement(false),
      rewards_optimization:        entitlement(true,  25),
      repayment_planner:           entitlement(true,  null),
      deal_committee:              entitlement(false),
      partner_portal:              entitlement(false),
      white_label_branding:        entitlement(false),
      api_access:                  entitlement(false),
      advanced_analytics:          entitlement(false),
      ai_underwriting:             entitlement(false),
      multi_advisor:               entitlement(false, null, 2),
      sandbox_mode:                entitlement(true),
    },
    resellerMarginPercent: null,
    overageRatePerUnit: {
      businesses: 29,
      api_calls: 0.01,
      documents: 0.50,
      card_applications: 5.00,
    },
  },

  professional: {
    name: 'professional',
    displayName: 'Professional',
    monthlyPrice: 599,
    annualPrice: 5_990,
    usageLimits: {
      maxBusinesses: 100,
      maxApiCallsPerMonth: 25_000,
      maxDocuments: 2_500,
      maxSeats: 10,
      maxCardApplicationsPerMonth: 500,
    },
    entitlements: {
      credit_intelligence:         entitlement(true,  null),
      card_stacking_optimizer:     entitlement(true,  null),
      compliance_center:           entitlement(true,  null),
      document_vault:              entitlement(true,  null),
      ach_controls:                entitlement(true,  null),
      spend_governance:            entitlement(true,  null),
      rewards_optimization:        entitlement(true,  null),
      repayment_planner:           entitlement(true,  null),
      deal_committee:              entitlement(true,  50),
      partner_portal:              entitlement(false),
      white_label_branding:        entitlement(false),
      api_access:                  entitlement(true,  25_000),
      advanced_analytics:          entitlement(true),
      ai_underwriting:             entitlement(true,  100),
      multi_advisor:               entitlement(true,  null, 10),
      sandbox_mode:                entitlement(true),
    },
    resellerMarginPercent: null,
    overageRatePerUnit: {
      businesses: 9,
      api_calls: 0.005,
      documents: 0.25,
      card_applications: 2.50,
      deal_committee: 15,
      ai_underwriting: 3.00,
    },
  },

  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    monthlyPrice: 2_499,
    annualPrice: 24_990,
    usageLimits: {
      maxBusinesses: null,
      maxApiCallsPerMonth: null,
      maxDocuments: null,
      maxSeats: null,
      maxCardApplicationsPerMonth: null,
    },
    entitlements: {
      credit_intelligence:         entitlement(true,  null),
      card_stacking_optimizer:     entitlement(true,  null),
      compliance_center:           entitlement(true,  null),
      document_vault:              entitlement(true,  null),
      ach_controls:                entitlement(true,  null),
      spend_governance:            entitlement(true,  null),
      rewards_optimization:        entitlement(true,  null),
      repayment_planner:           entitlement(true,  null),
      deal_committee:              entitlement(true,  null),
      partner_portal:              entitlement(true,  null),
      white_label_branding:        entitlement(true),
      api_access:                  entitlement(true,  null),
      advanced_analytics:          entitlement(true),
      ai_underwriting:             entitlement(true,  null),
      multi_advisor:               entitlement(true,  null, null),
      sandbox_mode:                entitlement(true),
    },
    resellerMarginPercent: null,
    overageRatePerUnit: {},
  },

  reseller: {
    name: 'reseller',
    displayName: 'Reseller / White-Label',
    monthlyPrice: 499,
    annualPrice: 4_990,
    usageLimits: {
      maxBusinesses: null,
      maxApiCallsPerMonth: 100_000,
      maxDocuments: null,
      maxSeats: null,
      maxCardApplicationsPerMonth: null,
    },
    entitlements: {
      credit_intelligence:         entitlement(true,  null),
      card_stacking_optimizer:     entitlement(true,  null),
      compliance_center:           entitlement(true,  null),
      document_vault:              entitlement(true,  null),
      ach_controls:                entitlement(true,  null),
      spend_governance:            entitlement(true,  null),
      rewards_optimization:        entitlement(true,  null),
      repayment_planner:           entitlement(true,  null),
      deal_committee:              entitlement(true,  null),
      partner_portal:              entitlement(true,  null),
      white_label_branding:        entitlement(true),
      api_access:                  entitlement(true,  100_000),
      advanced_analytics:          entitlement(true),
      ai_underwriting:             entitlement(true,  null),
      multi_advisor:               entitlement(true,  null, null),
      sandbox_mode:                entitlement(true),
    },
    resellerMarginPercent: 30,  // 30% margin on sub-tenant plan revenue
    overageRatePerUnit: {
      api_calls: 0.002,
    },
  },
};

// ── TenantPlan (in-memory, swap for Prisma in production) ────────────────────

export interface TenantPlan {
  id: string;
  tenantId: string;
  planName: PlanName;
  moduleEntitlements: PlanEntitlements;
  usageLimits: UsageLimits;
  monthlyPrice: number;
  billingCycle: 'monthly' | 'annual';
  startDate: Date;
  endDate: Date | null;
  status: 'active' | 'suspended' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const planStore = new Map<string, TenantPlan>();

export function activatePlan(
  tenantId: string,
  planName: PlanName,
  billingCycle: 'monthly' | 'annual' = 'monthly',
  customEntitlements?: Partial<PlanEntitlements>,
): TenantPlan {
  const definition = PLAN_CATALOG[planName];
  if (!definition) throw new Error(`Unknown plan: ${planName}`);

  const now = new Date();

  const plan: TenantPlan = {
    id: randomUUID(),
    tenantId,
    planName,
    moduleEntitlements: {
      ...definition.entitlements,
      ...(customEntitlements ?? {}),
    },
    usageLimits: { ...definition.usageLimits },
    monthlyPrice:
      billingCycle === 'annual'
        ? Math.round(definition.annualPrice / 12)
        : definition.monthlyPrice,
    billingCycle,
    startDate: now,
    endDate: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  planStore.set(tenantId, plan);

  logger.info('Tenant plan activated', { tenantId, planName, billingCycle });

  return plan;
}

export function getTenantPlan(tenantId: string): TenantPlan | null {
  return planStore.get(tenantId) ?? null;
}

export function upgradePlan(tenantId: string, newPlanName: PlanName): TenantPlan {
  const existing = planStore.get(tenantId);
  if (!existing) throw new Error(`No active plan found for tenant ${tenantId}.`);

  return activatePlan(tenantId, newPlanName, existing.billingCycle);
}

export function cancelPlan(tenantId: string): TenantPlan {
  const existing = planStore.get(tenantId);
  if (!existing) throw new Error(`No active plan found for tenant ${tenantId}.`);

  const updated: TenantPlan = {
    ...existing,
    status: 'cancelled',
    endDate: new Date(),
    updatedAt: new Date(),
  };

  planStore.set(tenantId, updated);
  logger.info('Tenant plan cancelled', { tenantId });
  return updated;
}

// ── Entitlement Check ─────────────────────────────────────────────────────────

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  remainingThisPeriod?: number | null;
}

export function checkEntitlement(
  tenantId: string,
  module: ModuleKey,
  currentUsageThisPeriod = 0,
): EntitlementCheckResult {
  const plan = planStore.get(tenantId);

  if (!plan || plan.status !== 'active') {
    return { allowed: false, reason: 'No active plan found for this tenant.' };
  }

  const ent = plan.moduleEntitlements[module];

  if (!ent || !ent.enabled) {
    return {
      allowed: false,
      reason: `Module "${module}" is not included in the ${plan.planName} plan. Upgrade to unlock.`,
    };
  }

  if (ent.monthlyLimit !== null) {
    const remaining = ent.monthlyLimit - currentUsageThisPeriod;
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: `Monthly limit of ${ent.monthlyLimit} reached for "${module}". Overage charges apply or upgrade your plan.`,
        remainingThisPeriod: 0,
      };
    }
    return { allowed: true, remainingThisPeriod: remaining };
  }

  return { allowed: true, remainingThisPeriod: null };
}

// ── Usage Metering ────────────────────────────────────────────────────────────

export interface UsageMeterRecord {
  id: string;
  tenantId: string;
  metricName: string;
  metricValue: number;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

export interface RecordUsageInput {
  tenantId: string;
  metricName: string;
  increment?: number;
}

export interface UsageSnapshot {
  tenantId: string;
  period: { start: Date; end: Date };
  metrics: Record<string, number>;
}

// In-memory meter store keyed by `tenantId::metricName::periodStart(YYYY-MM)`
const meterStore = new Map<string, UsageMeterRecord>();

function meterKey(tenantId: string, metricName: string, periodStart: Date): string {
  const month = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
  return `${tenantId}::${metricName}::${month}`;
}

function currentPeriodBounds(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart, periodEnd };
}

export function recordUsage(input: RecordUsageInput): UsageMeterRecord {
  const { periodStart, periodEnd } = currentPeriodBounds();
  const increment = input.increment ?? 1;
  const key = meterKey(input.tenantId, input.metricName, periodStart);

  const existing = meterStore.get(key);

  const record: UsageMeterRecord = existing
    ? { ...existing, metricValue: existing.metricValue + increment }
    : {
        id: randomUUID(),
        tenantId: input.tenantId,
        metricName: input.metricName,
        metricValue: increment,
        periodStart,
        periodEnd,
        createdAt: new Date(),
      };

  meterStore.set(key, record);
  return record;
}

export function getUsageForPeriod(
  tenantId: string,
  periodStart?: Date,
): UsageSnapshot {
  const { periodStart: defaultStart, periodEnd: defaultEnd } = currentPeriodBounds();
  const start = periodStart ?? defaultStart;
  const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

  const metrics: Record<string, number> = {};

  for (const [key, record] of meterStore.entries()) {
    if (record.tenantId === tenantId && key.endsWith(`::${month}`)) {
      metrics[record.metricName] = record.metricValue;
    }
  }

  return {
    tenantId,
    period: { start, end: periodStart ? new Date(start.getFullYear(), start.getMonth() + 1, 0) : defaultEnd },
    metrics,
  };
}

export function getMetricValue(
  tenantId: string,
  metricName: string,
  periodStart?: Date,
): number {
  const { periodStart: defaultStart } = currentPeriodBounds();
  const start = periodStart ?? defaultStart;
  const key = meterKey(tenantId, metricName, start);
  return meterStore.get(key)?.metricValue ?? 0;
}

// ── Overage Detection ─────────────────────────────────────────────────────────

export interface OverageAlert {
  tenantId: string;
  metricName: string;
  currentValue: number;
  limit: number;
  overageUnits: number;
  overageCost: number;
  severity: 'warning' | 'exceeded';
}

export function detectOverages(tenantId: string): OverageAlert[] {
  const plan = planStore.get(tenantId);
  if (!plan || plan.status !== 'active') return [];

  const definition = PLAN_CATALOG[plan.planName];
  const snapshot = getUsageForPeriod(tenantId);
  const alerts: OverageAlert[] = [];

  // Map usage limit fields to metric names
  const limitMap: Record<string, number | null> = {
    businesses: plan.usageLimits.maxBusinesses,
    api_calls: plan.usageLimits.maxApiCallsPerMonth,
    documents: plan.usageLimits.maxDocuments,
    card_applications: plan.usageLimits.maxCardApplicationsPerMonth,
    advisor_seats: plan.usageLimits.maxSeats,
  };

  for (const [metricName, limit] of Object.entries(limitMap)) {
    if (limit === null) continue;

    const current = snapshot.metrics[metricName] ?? 0;
    const overageUnits = Math.max(0, current - limit);
    const overageRate = definition.overageRatePerUnit[metricName] ?? 0;
    const overageCost = round2(overageUnits * overageRate);

    if (current >= limit) {
      alerts.push({
        tenantId,
        metricName,
        currentValue: current,
        limit,
        overageUnits,
        overageCost,
        severity: current > limit ? 'exceeded' : 'warning',
      });
    } else if (current >= limit * 0.8) {
      // Warn at 80% of limit
      alerts.push({
        tenantId,
        metricName,
        currentValue: current,
        limit,
        overageUnits: 0,
        overageCost: 0,
        severity: 'warning',
      });
    }
  }

  if (alerts.length > 0) {
    logger.warn('Usage overage/warning detected', {
      tenantId,
      plan: plan.planName,
      alertCount: alerts.length,
      exceeded: alerts.filter((a) => a.severity === 'exceeded').length,
    });
  }

  return alerts;
}

// ── Reseller Economics ────────────────────────────────────────────────────────

export interface ResellerMarginResult {
  subTenantPlan: PlanName;
  retailPrice: number;
  wholesalePrice: number;
  marginAmount: number;
  marginPercent: number;
}

export function computeResellerMargin(
  resellerTenantId: string,
  subTenantPlan: PlanName,
  billingCycle: 'monthly' | 'annual' = 'monthly',
): ResellerMarginResult {
  const resellerPlan = planStore.get(resellerTenantId);
  if (!resellerPlan) throw new Error(`No plan found for reseller ${resellerTenantId}.`);
  if (resellerPlan.planName !== 'reseller') {
    throw new Error(`Tenant ${resellerTenantId} is not on the reseller plan.`);
  }

  const definition = PLAN_CATALOG[resellerPlan.planName];
  const marginPercent = definition.resellerMarginPercent ?? 30;

  const subDef = PLAN_CATALOG[subTenantPlan];
  const retailPrice =
    billingCycle === 'annual'
      ? Math.round(subDef.annualPrice / 12)
      : subDef.monthlyPrice;

  const marginAmount = round2(retailPrice * (marginPercent / 100));
  const wholesalePrice = round2(retailPrice - marginAmount);

  return {
    subTenantPlan,
    retailPrice,
    wholesalePrice,
    marginAmount,
    marginPercent,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Service Singleton ─────────────────────────────────────────────────────────

export const saasEntitlementsService = {
  // Plans
  activatePlan,
  getTenantPlan,
  upgradePlan,
  cancelPlan,
  getPlanDefinition: (plan: PlanName): PlanDefinition => ({ ...PLAN_CATALOG[plan] }),
  listPlans: (): PlanDefinition[] => Object.values(PLAN_CATALOG),

  // Entitlements
  checkEntitlement,

  // Usage
  recordUsage,
  getUsageForPeriod,
  getMetricValue,

  // Overages
  detectOverages,

  // Reseller
  computeResellerMargin,
};

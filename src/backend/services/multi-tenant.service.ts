// ============================================================
// CapitalForge — Multi-Tenant Service
//
// Responsibilities:
//   1. Tenant onboarding with branding configuration
//   2. Feature flag management per tenant
//   3. Per-tenant billing and usage metering
//   4. Tenant isolation enforcement
//   5. Tenant configuration CRUD
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../../shared/constants/index.js';
import { eventBus } from '../events/event-bus.js';
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

export interface BrandConfig {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  companyName?: string;
  supportEmail?: string;
  customDomain?: string;
}

export type TenantPlanName = 'starter' | 'growth' | 'enterprise' | 'white_label';

export interface FeatureFlags {
  fairLendingModule: boolean;
  aiGovernance: boolean;
  multiRoundStacking: boolean;
  documentVault: boolean;
  rewardsOptimization: boolean;
  hardshipWorkflow: boolean;
  section1071Reporting: boolean;
  whiteLabel: boolean;
  sandboxMode: boolean;
  apiAccess: boolean;
}

export interface UsageLimits {
  maxBusinesses: number;
  maxUsers: number;
  maxDocumentsMb: number;
  maxApiCallsPerMonth: number;
  maxFundingRoundsPerBusiness: number;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: TenantPlanName;
  brandConfig?: BrandConfig;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
}

export interface UpdateTenantInput {
  name?: string;
  brandConfig?: BrandConfig;
  plan?: TenantPlanName;
  isActive?: boolean;
}

export interface UpdateFeatureFlagsInput {
  flags: Partial<FeatureFlags>;
}

export interface RecordUsageInput {
  tenantId: string;
  metricName: string;
  increment?: number;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface TenantWithPlan {
  id: string;
  name: string;
  slug: string;
  plan: string;
  brandConfig: BrandConfig | null;
  isActive: boolean;
  createdAt: Date;
  currentPlan?: {
    planName: string;
    moduleEntitlements: FeatureFlags;
    usageLimits: UsageLimits | null;
    monthlyPrice: number | null;
    billingCycle: string;
    status: string;
  } | null;
}

// ── Default feature flags by plan ─────────────────────────────

const PLAN_FEATURE_FLAGS: Record<TenantPlanName, FeatureFlags> = {
  starter: {
    fairLendingModule:      false,
    aiGovernance:           false,
    multiRoundStacking:     true,
    documentVault:          true,
    rewardsOptimization:    false,
    hardshipWorkflow:       false,
    section1071Reporting:   false,
    whiteLabel:             false,
    sandboxMode:            true,
    apiAccess:              false,
  },
  growth: {
    fairLendingModule:      true,
    aiGovernance:           true,
    multiRoundStacking:     true,
    documentVault:          true,
    rewardsOptimization:    true,
    hardshipWorkflow:       true,
    section1071Reporting:   false,
    whiteLabel:             false,
    sandboxMode:            true,
    apiAccess:              true,
  },
  enterprise: {
    fairLendingModule:      true,
    aiGovernance:           true,
    multiRoundStacking:     true,
    documentVault:          true,
    rewardsOptimization:    true,
    hardshipWorkflow:       true,
    section1071Reporting:   true,
    whiteLabel:             false,
    sandboxMode:            true,
    apiAccess:              true,
  },
  white_label: {
    fairLendingModule:      true,
    aiGovernance:           true,
    multiRoundStacking:     true,
    documentVault:          true,
    rewardsOptimization:    true,
    hardshipWorkflow:       true,
    section1071Reporting:   true,
    whiteLabel:             true,
    sandboxMode:            true,
    apiAccess:              true,
  },
};

// ── Default usage limits by plan ──────────────────────────────

const PLAN_USAGE_LIMITS: Record<TenantPlanName, UsageLimits> = {
  starter:    { maxBusinesses: 25,    maxUsers: 3,    maxDocumentsMb: 500,   maxApiCallsPerMonth: 0,       maxFundingRoundsPerBusiness: 2  },
  growth:     { maxBusinesses: 250,   maxUsers: 15,   maxDocumentsMb: 5000,  maxApiCallsPerMonth: 10000,   maxFundingRoundsPerBusiness: 5  },
  enterprise: { maxBusinesses: 2500,  maxUsers: 100,  maxDocumentsMb: 50000, maxApiCallsPerMonth: 100000,  maxFundingRoundsPerBusiness: 10 },
  white_label:{ maxBusinesses: 10000, maxUsers: 500,  maxDocumentsMb: 200000,maxApiCallsPerMonth: 500000,  maxFundingRoundsPerBusiness: 20 },
};

// ── Plan pricing ──────────────────────────────────────────────

const PLAN_MONTHLY_PRICE: Record<TenantPlanName, number> = {
  starter:    97,
  growth:     297,
  enterprise: 997,
  white_label:2497,
};

// ── Service ───────────────────────────────────────────────────

export class MultiTenantService {
  constructor(private prisma: PrismaClient = getPrisma()) {}

  // ── Tenant Onboarding ───────────────────────────────────────

  async createTenant(input: CreateTenantInput): Promise<TenantWithPlan> {
    const planName: TenantPlanName = (input.plan as TenantPlanName) ?? 'starter';

    const slugExists = await this.prisma.tenant.findFirst({
      where: { slug: input.slug },
    });
    if (slugExists) {
      throw new Error(`Tenant slug "${input.slug}" is already in use.`);
    }

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [tenant] = await this.prisma.$transaction(async (tx) => {
      // 1. Create tenant row
      const newTenant = await tx.tenant.create({
        data: {
          name:        input.name,
          slug:        input.slug,
          plan:        planName,
          brandConfig: (input.brandConfig as object) ?? null,
          isActive:    true,
        },
      });

      // 2. Create default admin user (passwordless — auth service sets hash)
      await tx.user.create({
        data: {
          tenantId:  newTenant.id,
          email:     input.adminEmail,
          firstName: input.adminFirstName,
          lastName:  input.adminLastName,
          role:      'tenant_admin',
          isActive:  true,
        },
      });

      // 3. Create TenantPlan record
      await tx.tenantPlan.create({
        data: {
          tenantId:          newTenant.id,
          planName,
          moduleEntitlements: PLAN_FEATURE_FLAGS[planName] as unknown as object,
          usageLimits:        PLAN_USAGE_LIMITS[planName] as unknown as object,
          monthlyPrice:       PLAN_MONTHLY_PRICE[planName],
          billingCycle:       'monthly',
          startDate:          now,
          status:             'active',
        },
      });

      // 4. Seed usage meter for current period
      await tx.usageMeter.create({
        data: {
          tenantId:    newTenant.id,
          metricName:  'businesses_created',
          metricValue: 0,
          periodStart: now,
          periodEnd,
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          tenantId:   newTenant.id,
          action:     'tenant.created',
          resource:   'tenant',
          resourceId: newTenant.id,
          metadata:   { plan: planName, adminEmail: input.adminEmail },
        },
      });

      return [newTenant];
    });

    await eventBus.publish({
      eventType:     EVENT_TYPES.BUSINESS_CREATED,
      aggregateType: AGGREGATE_TYPES.TENANT,
      aggregateId:   tenant.id,
      payload:       { tenantId: tenant.id, plan: planName, slug: input.slug },
    });

    logger.info('Tenant created', { tenantId: tenant.id, slug: input.slug, plan: planName });

    return this.getTenantById(tenant.id);
  }

  // ── Tenant CRUD ─────────────────────────────────────────────

  async getTenantById(tenantId: string): Promise<TenantWithPlan> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);

    const plan = await this.prisma.tenantPlan.findFirst({
      where:   { tenantId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });

    return {
      id:          tenant.id,
      name:        tenant.name,
      slug:        tenant.slug,
      plan:        tenant.plan,
      brandConfig: (tenant.brandConfig as BrandConfig) ?? null,
      isActive:    tenant.isActive,
      createdAt:   tenant.createdAt,
      currentPlan: plan
        ? {
            planName:           plan.planName,
            moduleEntitlements: plan.moduleEntitlements as unknown as FeatureFlags,
            usageLimits:        plan.usageLimits as unknown as UsageLimits,
            monthlyPrice:       plan.monthlyPrice ? Number(plan.monthlyPrice) : null,
            billingCycle:       plan.billingCycle,
            status:             plan.status,
          }
        : null,
    };
  }

  async listTenants(
    filters: { isActive?: boolean; plan?: string } = {},
    page = 1,
    pageSize = 50,
  ): Promise<{ tenants: TenantWithPlan[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (filters.isActive !== undefined) where['isActive'] = filters.isActive;
    if (filters.plan)                   where['plan']     = filters.plan;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const enriched = await Promise.all(tenants.map((t) => this.getTenantById(t.id)));
    return { tenants: enriched, total };
  }

  async updateTenant(tenantId: string, input: UpdateTenantInput): Promise<TenantWithPlan> {
    const existing = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!existing) throw new Error(`Tenant ${tenantId} not found.`);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data:  {
        ...(input.name        && { name: input.name }),
        ...(input.brandConfig && { brandConfig: input.brandConfig as unknown as object }),
        ...(input.plan        && { plan: input.plan }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    // If plan changed, create a new TenantPlan record and close old one
    if (input.plan && input.plan !== existing.plan) {
      const planName = input.plan as TenantPlanName;
      await this.prisma.tenantPlan.updateMany({
        where: { tenantId, status: 'active' },
        data:  { status: 'superseded', endDate: new Date() },
      });
      await this.prisma.tenantPlan.create({
        data: {
          tenantId,
          planName,
          moduleEntitlements: PLAN_FEATURE_FLAGS[planName] as unknown as object,
          usageLimits:        PLAN_USAGE_LIMITS[planName] as unknown as object,
          monthlyPrice:       PLAN_MONTHLY_PRICE[planName],
          billingCycle:       'monthly',
          startDate:          new Date(),
          status:             'active',
        },
      });
    }

    logger.info('Tenant updated', { tenantId, changes: Object.keys(input) });
    return this.getTenantById(tenantId);
  }

  async deleteTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);
    if (tenant.isActive) throw new Error('Deactivate tenant before deletion. Use offboarding workflow.');
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });
    logger.warn('Tenant soft-deleted', { tenantId });
  }

  // ── Feature Flags ───────────────────────────────────────────

  async getFeatureFlags(tenantId: string): Promise<FeatureFlags> {
    const plan = await this.prisma.tenantPlan.findFirst({
      where:   { tenantId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });
    if (!plan) {
      const defaultPlan: TenantPlanName = 'starter';
      return PLAN_FEATURE_FLAGS[defaultPlan];
    }
    return plan.moduleEntitlements as unknown as FeatureFlags;
  }

  async updateFeatureFlags(tenantId: string, input: UpdateFeatureFlagsInput): Promise<FeatureFlags> {
    const plan = await this.prisma.tenantPlan.findFirst({
      where:   { tenantId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });
    if (!plan) throw new Error(`No active plan found for tenant ${tenantId}.`);

    const current = plan.moduleEntitlements as unknown as FeatureFlags;
    const updated: FeatureFlags = { ...current, ...input.flags };

    await this.prisma.tenantPlan.update({
      where: { id: plan.id },
      data:  { moduleEntitlements: updated as unknown as object },
    });

    logger.info('Feature flags updated', { tenantId, changed: Object.keys(input.flags) });
    return updated;
  }

  async isFeatureEnabled(tenantId: string, feature: keyof FeatureFlags): Promise<boolean> {
    const flags = await this.getFeatureFlags(tenantId);
    return flags[feature] === true;
  }

  // ── Usage Metering ──────────────────────────────────────────

  async recordUsage(input: RecordUsageInput): Promise<void> {
    const now = new Date();
    const periodStart = input.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd   = input.periodEnd   ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const increment   = input.increment ?? 1;

    const existing = await this.prisma.usageMeter.findFirst({
      where: {
        tenantId:    input.tenantId,
        metricName:  input.metricName,
        periodStart: { gte: periodStart },
        periodEnd:   { lte: periodEnd },
      },
    });

    if (existing) {
      await this.prisma.usageMeter.update({
        where: { id: existing.id },
        data:  { metricValue: existing.metricValue + increment },
      });
    } else {
      await this.prisma.usageMeter.create({
        data: {
          tenantId:    input.tenantId,
          metricName:  input.metricName,
          metricValue: increment,
          periodStart,
          periodEnd,
        },
      });
    }
  }

  async getUsageSummary(
    tenantId: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<Record<string, number>> {
    const now = new Date();
    const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = periodEnd   ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const meters = await this.prisma.usageMeter.findMany({
      where: {
        tenantId,
        periodStart: { gte: start },
        periodEnd:   { lte: end },
      },
    });

    return meters.reduce(
      (acc, m) => {
        acc[m.metricName] = (acc[m.metricName] ?? 0) + m.metricValue;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async checkUsageLimit(tenantId: string, metric: keyof UsageLimits): Promise<{
    current: number;
    limit: number;
    percentUsed: number;
    exceeded: boolean;
  }> {
    const flags = await this.getFeatureFlags(tenantId);
    const plan = await this.prisma.tenantPlan.findFirst({
      where:   { tenantId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });
    const limits = (plan?.usageLimits as unknown as UsageLimits) ?? PLAN_USAGE_LIMITS['starter'];
    const limit = limits[metric] as number;

    const usage = await this.getUsageSummary(tenantId);
    const current = usage[metric] ?? 0;
    const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;

    return { current, limit, percentUsed, exceeded: current >= limit };
  }

  // ── Tenant Isolation Enforcement ────────────────────────────

  async assertTenantAccess(tenantId: string, resourceTenantId: string): Promise<void> {
    if (tenantId !== resourceTenantId) {
      throw new Error(
        `Tenant isolation violation: tenant ${tenantId} attempted to access resource of tenant ${resourceTenantId}.`,
      );
    }
  }

  async assertTenantActive(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found.`);
    if (!tenant.isActive) throw new Error(`Tenant ${tenantId} is deactivated.`);
  }
}

// ============================================================
// Unit Tests — Multi-Tenant, Offboarding, Fair-Lending &
//              AI Governance Services
//
// Run: npx vitest run tests/unit/services/multi-tenant.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  MultiTenantService,
} from '../../../src/backend/services/multi-tenant.service.js';
import type { CreateTenantInput, UpdateTenantInput } from '../../../src/backend/services/multi-tenant.service.js';

import {
  OffboardingService,
} from '../../../src/backend/services/offboarding.service.js';
import type { InitiateOffboardingInput } from '../../../src/backend/services/offboarding.service.js';

import {
  FairLendingService,
  SECTION_1071_COVERAGE_THRESHOLD,
} from '../../../src/backend/services/fair-lending.service.js';

import {
  AiGovernanceService,
  DEFAULT_CONFIDENCE_THRESHOLDS,
} from '../../../src/backend/services/ai-governance.service.js';
import type { LogAiDecisionInput } from '../../../src/backend/services/ai-governance.service.js';

// ── Prisma mock factory ───────────────────────────────────────

function makePrismaMock() {
  return {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown[]>) => {
      return fn(makeTxMock());
    }),
    tenant: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      findMany:  vi.fn().mockResolvedValue([]),
      update:    vi.fn(),
      count:     vi.fn().mockResolvedValue(0),
    },
    user: {
      create:   vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update:   vi.fn(),
    },
    tenantPlan: {
      create:     vi.fn(),
      findFirst:  vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
    },
    usageMeter: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      findMany:  vi.fn().mockResolvedValue([]),
      update:    vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    business: {
      findFirst: vi.fn(),
      count:     vi.fn().mockResolvedValue(0),
    },
    cardApplication: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    invoice: {
      create:    vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    offboardingWorkflow: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    consentRecord: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    businessOwner: {
      findMany: vi.fn().mockResolvedValue([]),
      update:   vi.fn(),
    },
    fairLendingRecord: {
      create:   vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst:vi.fn(),
      update:   vi.fn(),
      count:    vi.fn().mockResolvedValue(0),
    },
    aiDecisionLog: {
      create:    vi.fn(),
      findMany:  vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update:    vi.fn(),
      count:     vi.fn().mockResolvedValue(0),
    },
    document: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeTxMock() {
  return {
    tenant:      { create: vi.fn().mockResolvedValue({ id: 'tenant-001', name: 'Test Co', slug: 'test-co', plan: 'starter', brandConfig: null, isActive: true, createdAt: new Date() }) },
    user:        { create: vi.fn() },
    tenantPlan:  { create: vi.fn() },
    usageMeter:  { create: vi.fn() },
    auditLog:    { create: vi.fn() },
  };
}

const TENANT_FIXTURE = {
  id: 'tenant-001',
  name: 'Acme Capital',
  slug: 'acme-capital',
  plan: 'starter',
  brandConfig: null,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const PLAN_FIXTURE = {
  id:                 'plan-001',
  tenantId:           'tenant-001',
  planName:           'starter',
  moduleEntitlements: {
    fairLendingModule: false,
    aiGovernance: false,
    multiRoundStacking: true,
    documentVault: true,
    rewardsOptimization: false,
    hardshipWorkflow: false,
    section1071Reporting: false,
    whiteLabel: false,
    sandboxMode: true,
    apiAccess: false,
  },
  usageLimits: { maxBusinesses: 25, maxUsers: 3, maxDocumentsMb: 500, maxApiCallsPerMonth: 0, maxFundingRoundsPerBusiness: 2 },
  monthlyPrice: { toNumber: () => 97 },
  billingCycle: 'monthly',
  startDate:   new Date(),
  endDate:     null,
  status:      'active',
  createdAt:   new Date(),
  updatedAt:   new Date(),
};

// ============================================================
// MULTI-TENANT SERVICE TESTS
// ============================================================

describe('MultiTenantService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: MultiTenantService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc    = new MultiTenantService(prisma as unknown as import('@prisma/client').PrismaClient);
  });

  // ── Tenant CRUD ─────────────────────────────────────────────

  it('createTenant — creates tenant, admin user, plan, and usage meter in transaction', async () => {
    const input: CreateTenantInput = {
      name: 'Acme Capital', slug: 'acme-capital',
      adminEmail: 'admin@acme.com', adminFirstName: 'Jane', adminLastName: 'Doe',
    };

    prisma.tenant.findFirst.mockResolvedValueOnce(null); // slug check
    prisma.tenant.findFirst.mockResolvedValueOnce(TENANT_FIXTURE); // getTenantById
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);

    const result = await svc.createTenant(input);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(result).toHaveProperty('id');
  });

  it('createTenant — rejects duplicate slug', async () => {
    prisma.tenant.findFirst.mockResolvedValueOnce(TENANT_FIXTURE); // slug in use
    const input: CreateTenantInput = {
      name: 'Acme Capital', slug: 'acme-capital',
      adminEmail: 'admin@acme.com', adminFirstName: 'Jane', adminLastName: 'Doe',
    };
    await expect(svc.createTenant(input)).rejects.toThrow('already in use');
  });

  it('getTenantById — returns tenant with current plan', async () => {
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);

    const result = await svc.getTenantById('tenant-001');
    expect(result.slug).toBe('acme-capital');
    expect(result.currentPlan?.planName).toBe('starter');
  });

  it('getTenantById — throws if tenant not found', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(svc.getTenantById('tenant-x')).rejects.toThrow('not found');
  });

  it('listTenants — returns paginated list', async () => {
    prisma.tenant.findMany.mockResolvedValue([TENANT_FIXTURE]);
    prisma.tenant.count.mockResolvedValue(1);
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);
    // getTenantById needs to find tenant
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);

    const { tenants, total } = await svc.listTenants({ isActive: true }, 1, 50);
    expect(total).toBe(1);
    expect(tenants).toHaveLength(1);
  });

  it('updateTenant — updates name and brandConfig', async () => {
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);
    prisma.tenant.update.mockResolvedValue({ ...TENANT_FIXTURE, name: 'Updated Name' });
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);

    const input: UpdateTenantInput = { name: 'Updated Name', brandConfig: { primaryColor: '#ff0000' } };
    const result = await svc.updateTenant('tenant-001', input);
    expect(prisma.tenant.update).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });

  it('updateTenant — plan change creates new TenantPlan and closes old', async () => {
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);
    prisma.tenant.update.mockResolvedValue(TENANT_FIXTURE);
    prisma.tenantPlan.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenantPlan.create.mockResolvedValue({ ...PLAN_FIXTURE, planName: 'growth' });
    prisma.tenantPlan.findFirst.mockResolvedValue({ ...PLAN_FIXTURE, planName: 'growth' });

    await svc.updateTenant('tenant-001', { plan: 'growth' });
    expect(prisma.tenantPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'superseded' }) }),
    );
    expect(prisma.tenantPlan.create).toHaveBeenCalledOnce();
  });

  it('deleteTenant — throws if tenant is still active', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ ...TENANT_FIXTURE, isActive: true });
    await expect(svc.deleteTenant('tenant-001')).rejects.toThrow('Deactivate tenant');
  });

  it('deleteTenant — soft-deletes inactive tenant', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ ...TENANT_FIXTURE, isActive: false });
    prisma.tenant.update.mockResolvedValue({ ...TENANT_FIXTURE, isActive: false });
    await svc.deleteTenant('tenant-001');
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  // ── Feature Flags ───────────────────────────────────────────

  it('getFeatureFlags — returns plan entitlements', async () => {
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);
    const flags = await svc.getFeatureFlags('tenant-001');
    expect(flags.multiRoundStacking).toBe(true);
    expect(flags.aiGovernance).toBe(false);
  });

  it('getFeatureFlags — returns starter defaults when no plan found', async () => {
    prisma.tenantPlan.findFirst.mockResolvedValue(null);
    const flags = await svc.getFeatureFlags('tenant-001');
    expect(flags.whiteLabel).toBe(false);
    expect(flags.documentVault).toBe(true);
  });

  it('updateFeatureFlags — merges flag overrides', async () => {
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);
    prisma.tenantPlan.update.mockResolvedValue({
      ...PLAN_FIXTURE,
      moduleEntitlements: { ...PLAN_FIXTURE.moduleEntitlements, aiGovernance: true },
    });
    const flags = await svc.updateFeatureFlags('tenant-001', { flags: { aiGovernance: true } });
    expect(prisma.tenantPlan.update).toHaveBeenCalledOnce();
    expect(flags.aiGovernance).toBe(true);
  });

  it('isFeatureEnabled — returns true for enabled feature', async () => {
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);
    const result = await svc.isFeatureEnabled('tenant-001', 'documentVault');
    expect(result).toBe(true);
  });

  it('isFeatureEnabled — returns false for disabled feature', async () => {
    prisma.tenantPlan.findFirst.mockResolvedValue(PLAN_FIXTURE);
    const result = await svc.isFeatureEnabled('tenant-001', 'whiteLabel');
    expect(result).toBe(false);
  });

  // ── Usage Metering ──────────────────────────────────────────

  it('recordUsage — creates new meter when none exists', async () => {
    prisma.usageMeter.findFirst.mockResolvedValue(null);
    prisma.usageMeter.create.mockResolvedValue({ id: 'meter-001' });

    await svc.recordUsage({ tenantId: 'tenant-001', metricName: 'businesses_created', increment: 1 });
    expect(prisma.usageMeter.create).toHaveBeenCalledOnce();
  });

  it('recordUsage — increments existing meter', async () => {
    prisma.usageMeter.findFirst.mockResolvedValue({ id: 'meter-001', metricValue: 5 });
    prisma.usageMeter.update.mockResolvedValue({ id: 'meter-001', metricValue: 6 });

    await svc.recordUsage({ tenantId: 'tenant-001', metricName: 'businesses_created', increment: 1 });
    expect(prisma.usageMeter.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metricValue: 6 } }),
    );
  });

  it('getUsageSummary — aggregates metrics by name', async () => {
    prisma.usageMeter.findMany.mockResolvedValue([
      { metricName: 'businesses_created', metricValue: 10 },
      { metricName: 'businesses_created', metricValue:  5 },
      { metricName: 'api_calls',          metricValue: 200 },
    ]);
    const summary = await svc.getUsageSummary('tenant-001');
    expect(summary['businesses_created']).toBe(15);
    expect(summary['api_calls']).toBe(200);
  });

  // ── Tenant Isolation ────────────────────────────────────────

  it('assertTenantAccess — passes when IDs match', async () => {
    await expect(svc.assertTenantAccess('t1', 't1')).resolves.toBeUndefined();
  });

  it('assertTenantAccess — throws on cross-tenant access', async () => {
    await expect(svc.assertTenantAccess('t1', 't2')).rejects.toThrow('isolation violation');
  });

  it('assertTenantActive — throws if tenant is inactive', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ ...TENANT_FIXTURE, isActive: false });
    await expect(svc.assertTenantActive('tenant-001')).rejects.toThrow('deactivated');
  });
});

// ============================================================
// OFFBOARDING SERVICE TESTS
// ============================================================

describe('OffboardingService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: OffboardingService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc    = new OffboardingService(prisma as unknown as import('@prisma/client').PrismaClient);
  });

  const WF_FIXTURE = {
    id:                  'wf-001',
    tenantId:            'tenant-001',
    businessId:          'biz-001',
    offboardingType:     'client',
    status:              'initiated',
    finalInvoiceId:      null,
    refundAmount:        null,
    dataExportCompleted: false,
    dataDeletionStatus:  'pending',
    deletionProofHash:   null,
    retentionSchedule:   null,
    exitReason:          'cost',
    exitInterviewNotes:  null,
    initiatedAt:         new Date(),
    completedAt:         null,
    createdAt:           new Date(),
    updatedAt:           new Date(),
  };

  it('initiateOffboarding — creates workflow for client offboarding', async () => {
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);
    prisma.business.findFirst.mockResolvedValue({ id: 'biz-001', tenantId: 'tenant-001' });
    prisma.offboardingWorkflow.findFirst.mockResolvedValueOnce(null); // no existing
    prisma.offboardingWorkflow.create.mockResolvedValue(WF_FIXTURE);
    prisma.offboardingWorkflow.findFirst.mockResolvedValueOnce(WF_FIXTURE); // getStatus
    prisma.cardApplication.findMany.mockResolvedValue([]);

    const result = await svc.initiateOffboarding({
      tenantId: 'tenant-001',
      offboardingType: 'client',
      businessId: 'biz-001',
      exitReason: 'cost',
      requestedBy: 'user-001',
    });

    expect(prisma.offboardingWorkflow.create).toHaveBeenCalledOnce();
    expect(result.offboardingType).toBe('client');
  });

  it('initiateOffboarding — rejects if active workflow already exists', async () => {
    prisma.tenant.findFirst.mockResolvedValue(TENANT_FIXTURE);
    prisma.business.findFirst.mockResolvedValue({ id: 'biz-001' });
    prisma.offboardingWorkflow.findFirst.mockResolvedValueOnce(WF_FIXTURE); // existing

    await expect(svc.initiateOffboarding({
      tenantId: 'tenant-001', offboardingType: 'client',
      businessId: 'biz-001', requestedBy: 'user-001',
    })).rejects.toThrow('already exists');
  });

  it('getOffboardingStatus — returns workflow with card closure guidance', async () => {
    prisma.offboardingWorkflow.findFirst.mockResolvedValue(WF_FIXTURE);
    prisma.cardApplication.findMany.mockResolvedValue([
      { id: 'app-001', issuer: 'chase', cardProduct: 'Ink Business', creditLimit: { toNumber: () => 10000 }, status: 'approved' },
    ]);

    const status = await svc.getOffboardingStatus('wf-001');
    expect(status.id).toBe('wf-001');
    expect(status.cardClosureGuidance).toHaveLength(1);
    expect(status.cardClosureGuidance![0].issuer).toBe('chase');
  });

  it('captureExitInterview — stores interview notes', async () => {
    prisma.offboardingWorkflow.findFirst.mockResolvedValue(WF_FIXTURE);
    prisma.offboardingWorkflow.update.mockResolvedValue(WF_FIXTURE);
    prisma.offboardingWorkflow.findFirst.mockResolvedValueOnce(WF_FIXTURE); // second call in getStatus
    prisma.cardApplication.findMany.mockResolvedValue([]);

    await svc.captureExitInterview({
      workflowId: 'wf-001',
      notes: 'Platform too expensive',
      satisfactionScore: 6,
      primaryExitReason: 'pricing',
      wouldRecommend: true,
    });

    expect(prisma.offboardingWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wf-001' },
        data: expect.objectContaining({ exitInterviewNotes: expect.stringContaining('pricing') }),
      }),
    );
  });

  it('generateConfirmationToken — is deterministic', () => {
    const t1 = svc.generateConfirmationToken('tenant-001', 'wf-001');
    const t2 = svc.generateConfirmationToken('tenant-001', 'wf-001');
    expect(t1).toBe(t2);
    expect(t1).toHaveLength(16);
  });

  it('deleteData — rejects invalid confirmation token', async () => {
    prisma.offboardingWorkflow.findFirst.mockResolvedValue({ ...WF_FIXTURE, dataDeletionStatus: 'pending' });
    await expect(svc.deleteData({
      workflowId: 'wf-001',
      jurisdiction: 'ccpa',
      requestedBy: 'user-001',
      confirmationToken: 'INVALID-TOKEN',
    })).rejects.toThrow('Invalid confirmation token');
  });

  it('deleteData — succeeds with correct token', async () => {
    const token = svc.generateConfirmationToken('tenant-001', 'wf-001');
    prisma.offboardingWorkflow.findFirst.mockResolvedValue({ ...WF_FIXTURE, dataDeletionStatus: 'pending' });
    prisma.offboardingWorkflow.update.mockResolvedValue({ ...WF_FIXTURE, dataDeletionStatus: 'completed' });
    prisma.tenant.update.mockResolvedValue({ ...TENANT_FIXTURE, isActive: false });
    prisma.businessOwner.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.fairLendingRecord.findMany.mockResolvedValue([]);
    prisma.consentRecord.deleteMany.mockResolvedValue({ count: 2 });

    const report = await svc.deleteData({
      workflowId: 'wf-001',
      jurisdiction: 'ccpa',
      requestedBy: 'user-001',
      confirmationToken: token,
    });

    expect(report.proofHash).toBeDefined();
    expect(report.proofHash).toHaveLength(64); // sha256 hex
    expect(report.reportSignature).toBeDefined();
    expect(report.jurisdiction).toBe('ccpa');
  });

  it('deleteData — rejects if deletion already completed', async () => {
    const token = svc.generateConfirmationToken('tenant-001', 'wf-001');
    prisma.offboardingWorkflow.findFirst.mockResolvedValue({ ...WF_FIXTURE, dataDeletionStatus: 'completed' });
    await expect(svc.deleteData({
      workflowId: 'wf-001', jurisdiction: 'gdpr',
      requestedBy: 'user-001', confirmationToken: token,
    })).rejects.toThrow('already completed');
  });
});

// ============================================================
// FAIR LENDING SERVICE TESTS
// ============================================================

describe('FairLendingService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: FairLendingService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc    = new FairLendingService(prisma as unknown as import('@prisma/client').PrismaClient);
  });

  it('SECTION_1071_COVERAGE_THRESHOLD is 100', () => {
    expect(SECTION_1071_COVERAGE_THRESHOLD).toBe(100);
  });

  it('create1071Record — stores record with isFirewalled=true', async () => {
    prisma.fairLendingRecord.create.mockResolvedValue({ id: 'flr-001' });
    prisma.fairLendingRecord.count.mockResolvedValue(1); // threshold check
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.create1071Record({
      tenantId: 'tenant-001', businessId: 'biz-001',
      creditPurpose: 'business_credit_card',
      actionTaken: 'approved_and_originated',
      actionDate: new Date(),
    });

    expect(result.id).toBe('flr-001');
    expect(prisma.fairLendingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFirewalled: true }) }),
    );
  });

  it('create1071Record — demographic data stored separately', async () => {
    prisma.fairLendingRecord.create.mockResolvedValue({ id: 'flr-002' });
    prisma.fairLendingRecord.count.mockResolvedValue(5);
    prisma.auditLog.create.mockResolvedValue({});

    await svc.create1071Record({
      tenantId: 'tenant-001', businessId: 'biz-001',
      creditPurpose: 'business_credit_card',
      actionTaken: 'denied',
      actionDate: new Date(),
      demographicData: { ownerSex: 'female', ownerEthnicity: 'hispanic_or_latino' },
    });

    expect(prisma.fairLendingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          demographicData: expect.objectContaining({ ownerSex: 'female' }),
        }),
      }),
    );
  });

  it('getDashboard — calculates rates correctly', async () => {
    prisma.fairLendingRecord.findMany.mockResolvedValue([
      { actionTaken: 'approved_and_originated', creditPurpose: 'business_credit_card', adverseReasons: null, demographicData: null },
      { actionTaken: 'denied',                  creditPurpose: 'line_of_credit',        adverseReasons: ['08'], demographicData: { ownerSex: 'male' } },
      { actionTaken: 'denied',                  creditPurpose: 'business_credit_card',  adverseReasons: ['08'], demographicData: null },
      { actionTaken: 'withdrawn_by_applicant',  creditPurpose: 'term_loan',             adverseReasons: null,   demographicData: null },
    ]);

    const dashboard = await svc.getDashboard('tenant-001', 2025);
    expect(dashboard.totalApplications).toBe(4);
    expect(dashboard.approvalRate).toBe(25);
    expect(dashboard.denialRate).toBe(50);
    expect(dashboard.withdrawalRate).toBe(25);
    expect(dashboard.recordsWithDemographics).toBe(1);
    expect(dashboard.demographicCompletionRate).toBe(25);
    expect(dashboard.coverageStatus).toBe('below_threshold');
  });

  it('getDashboard — reports 1071_triggered when at threshold', async () => {
    const records = Array.from({ length: 100 }, () => ({
      actionTaken: 'approved_and_originated', creditPurpose: 'business_credit_card',
      adverseReasons: null, demographicData: null,
    }));
    prisma.fairLendingRecord.findMany.mockResolvedValue(records);

    const dashboard = await svc.getDashboard('tenant-001');
    expect(dashboard.coverageStatus).toBe('1071_triggered');
  });

  it('getDashboard — reports approaching_threshold at 80%', async () => {
    const records = Array.from({ length: 82 }, () => ({
      actionTaken: 'denied', creditPurpose: 'term_loan',
      adverseReasons: null, demographicData: null,
    }));
    prisma.fairLendingRecord.findMany.mockResolvedValue(records);

    const dashboard = await svc.getDashboard('tenant-001');
    expect(dashboard.coverageStatus).toBe('approaching_threshold');
  });

  it('checkCoverageThreshold — returns correct percentToThreshold', async () => {
    prisma.fairLendingRecord.count.mockResolvedValue(60);
    const result = await svc.checkCoverageThreshold('tenant-001', 2025);
    expect(result.applicationCount).toBe(60);
    expect(result.triggered).toBe(false);
    expect(result.percentToThreshold).toBe(60);
  });

  it('checkCoverageThreshold — triggered at or above 100', async () => {
    prisma.fairLendingRecord.count.mockResolvedValue(100);
    const result = await svc.checkCoverageThreshold('tenant-001');
    expect(result.triggered).toBe(true);
  });

  it('getAdverseActionReport — excludes demographic data from standard view', async () => {
    prisma.fairLendingRecord.findMany.mockResolvedValue([
      {
        id: 'flr-001', applicationId: 'app-001', tenantId: 'tenant-001',
        actionTaken: 'denied', actionDate: new Date(),
        adverseReasons: ['08', '23'], creditPurpose: 'business_credit_card',
        businessType: 'llc', isFirewalled: true,
        demographicData: { ownerSex: 'male' },
      },
    ]);

    const report = await svc.getAdverseActionReport('tenant-001', { year: 2025 });
    expect(report).toHaveLength(1);
    expect(report[0]).not.toHaveProperty('demographicData'); // firewall enforced
    expect(report[0]!.adverseReasons).toContain('08');
  });
});

// ============================================================
// AI GOVERNANCE SERVICE TESTS
// ============================================================

describe('AiGovernanceService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: AiGovernanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc    = new AiGovernanceService(prisma as unknown as import('@prisma/client').PrismaClient);
  });

  const DECISION_FIXTURE = {
    id:            'dec-001',
    tenantId:      'tenant-001',
    moduleSource:  'stacking_optimizer',
    decisionType:  'recommendation',
    inputHash:     'abc123',
    output:        { recommendation: 'Apply for Chase Ink' },
    confidence:    { toNumber: () => 0.85 },
    overriddenBy:  null,
    overrideReason: null,
    modelVersion:  'gpt-4o-2024-11',
    promptVersion: 'v2.1',
    latencyMs:     420,
    createdAt:     new Date(),
  };

  it('logDecision — persists decision log record', async () => {
    prisma.aiDecisionLog.create.mockResolvedValue(DECISION_FIXTURE);

    const input: LogAiDecisionInput = {
      tenantId: 'tenant-001',
      moduleSource: 'stacking_optimizer',
      decisionType: 'recommendation',
      inputPayload: { businessId: 'biz-001' },
      output: { recommendation: 'Apply for Chase Ink' },
      confidence: 0.85,
      modelVersion: 'gpt-4o-2024-11',
      promptVersion: 'v2.1',
      latencyMs: 420,
    };

    const result = await svc.logDecision(input);
    expect(prisma.aiDecisionLog.create).toHaveBeenCalledOnce();
    expect(result.flags.belowConfidenceThreshold).toBe(false);
    expect(result.flags.wasOverridden).toBe(false);
  });

  it('logDecision — hashes input payload', async () => {
    prisma.aiDecisionLog.create.mockResolvedValue(DECISION_FIXTURE);
    await svc.logDecision({
      tenantId: 'tenant-001', moduleSource: 'stacking_optimizer',
      decisionType: 'recommendation',
      inputPayload: { businessId: 'biz-001' },
      output: { recommendation: 'test' },
    });

    expect(prisma.aiDecisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inputHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      }),
    );
  });

  it('logDecision — flags below confidence threshold (soft warn)', async () => {
    prisma.aiDecisionLog.create.mockResolvedValue({
      ...DECISION_FIXTURE,
      confidence: { toNumber: () => 0.60 },
      moduleSource: 'stacking_optimizer',
    });

    const result = await svc.logDecision({
      tenantId: 'tenant-001', moduleSource: 'stacking_optimizer',
      decisionType: 'recommendation',
      inputPayload: {}, output: { result: 'low confidence' },
      confidence: 0.60,
    });

    expect(result.flags.belowConfidenceThreshold).toBe(true);
  });

  it('logDecision — hard blocks when confidence below threshold for critical module', async () => {
    // suitability_engine has blockBelowThreshold: true, threshold: 0.80
    await expect(svc.logDecision({
      tenantId: 'tenant-001', moduleSource: 'suitability_engine',
      decisionType: 'risk_score',
      inputPayload: {}, output: {},
      confidence: 0.55,
    })).rejects.toThrow('confidence');
  });

  it('logDecision — detects possible hallucination in output', async () => {
    prisma.aiDecisionLog.create.mockResolvedValue({
      ...DECISION_FIXTURE,
      output: { text: 'This is an SBA-approved government program with guaranteed approval!' },
    });

    const result = await svc.logDecision({
      tenantId: 'tenant-001', moduleSource: 'stacking_optimizer',
      decisionType: 'generation',
      inputPayload: {},
      output: { text: 'This is an SBA-approved government program with guaranteed approval!' },
      confidence: 0.9,
    });

    expect(result.flags.possibleHallucination).toBe(true);
  });

  it('overrideDecision — marks decision as overridden', async () => {
    prisma.aiDecisionLog.findFirst.mockResolvedValue({ ...DECISION_FIXTURE, overriddenBy: null });
    prisma.aiDecisionLog.update.mockResolvedValue({
      ...DECISION_FIXTURE,
      overriddenBy: 'user-001',
      overrideReason: 'Manual review indicated different recommendation',
    });
    prisma.auditLog.create.mockResolvedValue({});

    const result = await svc.overrideDecision({
      decisionId: 'dec-001', tenantId: 'tenant-001',
      overriddenBy: 'user-001',
      overrideReason: 'Manual review indicated different recommendation',
    });

    expect(result.overriddenBy).toBe('user-001');
    expect(result.flags.wasOverridden).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('overrideDecision — rejects double override', async () => {
    prisma.aiDecisionLog.findFirst.mockResolvedValue({
      ...DECISION_FIXTURE,
      overriddenBy: 'user-001',
    });

    await expect(svc.overrideDecision({
      decisionId: 'dec-001', tenantId: 'tenant-001',
      overriddenBy: 'user-002',
      overrideReason: 'second override attempt',
    })).rejects.toThrow('already been overridden');
  });

  it('getMetrics — returns metrics per module', async () => {
    prisma.aiDecisionLog.findMany.mockResolvedValue([
      { moduleSource: 'stacking_optimizer', confidence: { toNumber: () => 0.9 }, overriddenBy: null, latencyMs: 300, modelVersion: 'gpt-4o', promptVersion: 'v1', output: {} },
      { moduleSource: 'stacking_optimizer', confidence: { toNumber: () => 0.7 }, overriddenBy: 'u1', latencyMs: 500, modelVersion: 'gpt-4o', promptVersion: 'v1', output: {} },
      { moduleSource: 'udap_scorer',        confidence: { toNumber: () => 0.95 }, overriddenBy: null, latencyMs: 100, modelVersion: 'gpt-4o', promptVersion: 'v2', output: {} },
    ]);

    const metrics = await svc.getMetrics('tenant-001', undefined, 30);
    expect(metrics).toHaveLength(2);
    const stackMetrics = metrics.find((m) => m.moduleSource === 'stacking_optimizer');
    expect(stackMetrics?.overrideRate).toBe(50);
    expect(stackMetrics?.totalDecisions).toBe(2);
  });

  it('checkConsistency — detects inconsistent outputs for same input', async () => {
    prisma.aiDecisionLog.findMany.mockResolvedValue([
      { output: { score: 80 } },
      { output: { score: 82 } },
      { output: { score: 80 } },
    ]);

    const result = await svc.checkConsistency('tenant-001', 'suitability_engine', 'hash-abc');
    expect(result.consistent).toBe(false);
    expect(result.distinctOutputs).toBeGreaterThan(1);
  });

  it('checkConsistency — reports consistent for identical outputs', async () => {
    prisma.aiDecisionLog.findMany.mockResolvedValue([
      { output: { score: 80 } },
      { output: { score: 80 } },
    ]);

    const result = await svc.checkConsistency('tenant-001', 'suitability_engine', 'hash-abc');
    expect(result.consistent).toBe(true);
    expect(result.distinctOutputs).toBe(1);
  });

  it('DEFAULT_CONFIDENCE_THRESHOLDS — suitability_engine blocks below threshold', () => {
    const threshold = DEFAULT_CONFIDENCE_THRESHOLDS['suitability_engine'];
    expect(threshold).toBeDefined();
    expect(threshold!.blockBelowThreshold).toBe(true);
    expect(threshold!.minimumConfidence).toBeGreaterThanOrEqual(0.75);
  });

  it('DEFAULT_CONFIDENCE_THRESHOLDS — fraud_detection has highest threshold', () => {
    const fraudThreshold = DEFAULT_CONFIDENCE_THRESHOLDS['fraud_detection']!.minimumConfidence;
    const allThresholds  = Object.values(DEFAULT_CONFIDENCE_THRESHOLDS).map((t) => t.minimumConfidence);
    expect(fraudThreshold).toBe(Math.max(...allThresholds));
  });
});

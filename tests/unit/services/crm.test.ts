// ============================================================
// Unit Tests — CRM, Portfolio Benchmarking & Issuer Relationship
//
// Run: npx vitest run tests/unit/services/crm.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CrmService,
  PIPELINE_STAGES,
  setPrismaClient as setCrmPrisma,
} from '../../../src/backend/services/crm.service.js';
import {
  PortfolioBenchmarkingService,
  setPrismaClient as setBenchPrisma,
} from '../../../src/backend/services/portfolio-benchmarking.service.js';
import {
  IssuerRelationshipService,
  setPrismaClient as setIssuerPrisma,
} from '../../../src/backend/services/issuer-relationship.service.js';

// ── Prisma mock factory ───────────────────────────────────────

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    pipelineStage: {
      create:    vi.fn(),
      findMany:  vi.fn().mockResolvedValue([]),
      count:     vi.fn().mockResolvedValue(0),
    },
    business: {
      findFirst: vi.fn().mockResolvedValue({ id: 'biz-001', legalName: 'Acme LLC', advisorId: 'adv-001' }),
      findMany:  vi.fn().mockResolvedValue([]),
      count:     vi.fn().mockResolvedValue(10),
      groupBy:   vi.fn().mockResolvedValue([]),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    commissionRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'adv-001', firstName: 'Jane', lastName: 'Doe' }),
      findMany:  vi.fn().mockResolvedValue([]),
    },
    referralAttribution: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    cardApplication: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    creditProfile: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    advisorQaScore: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ledgerEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    fundingRound: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    repaymentPlan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    complaint: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    partner: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    costCalculation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    issuerContact: {
      findMany:  vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    declineRecovery: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

const TENANT_ID = 'tenant-001';
const BIZ_ID    = 'biz-001';
const ADV_ID    = 'adv-001';

// ─────────────────────────────────────────────────────────────
// CRM SERVICE TESTS
// ─────────────────────────────────────────────────────────────

describe('CrmService', () => {
  let svc: CrmService;
  let db: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    db  = makePrismaMock();
    setCrmPrisma(db as never);
    svc = new CrmService();
  });

  // ── Pipeline stage constants ──────────────────────────────

  it('exports correct PIPELINE_STAGES constants', () => {
    expect(PIPELINE_STAGES.PROSPECT).toBe('prospect');
    expect(PIPELINE_STAGES.ONBOARDING).toBe('onboarding');
    expect(PIPELINE_STAGES.ACTIVE).toBe('active');
    expect(PIPELINE_STAGES.GRADUATED).toBe('graduated');
    expect(PIPELINE_STAGES.CHURNED).toBe('churned');
  });

  // ── transitionStage ───────────────────────────────────────

  it('transitions a business to a new pipeline stage', async () => {
    const mockRecord = {
      id:         'stage-001',
      tenantId:   TENANT_ID,
      businessId: BIZ_ID,
      stage:      'active',
      enteredAt:  new Date('2025-01-01'),
      exitedAt:   null,
      advisorId:  ADV_ID,
      notes:      null,
    };

    db.pipelineStage.create.mockResolvedValue(mockRecord);

    const result = await svc.transitionStage({
      tenantId:   TENANT_ID,
      businessId: BIZ_ID,
      toStage:    'active',
      advisorId:  ADV_ID,
    });

    expect(db.$executeRawUnsafe).toHaveBeenCalledOnce();
    expect(db.pipelineStage.create).toHaveBeenCalledOnce();
    expect(result.stage).toBe('active');
    expect(result.businessId).toBe(BIZ_ID);
  });

  it('throws when business not found during stage transition', async () => {
    db.business.findFirst.mockResolvedValue(null);

    await expect(
      svc.transitionStage({ tenantId: TENANT_ID, businessId: 'bad-id', toStage: 'active' }),
    ).rejects.toThrow('not found');
  });

  // ── getPipelineSummary ────────────────────────────────────

  it('returns empty pipeline summary when no open stages exist', async () => {
    db.pipelineStage.findMany.mockResolvedValue([]);
    db.business.findMany.mockResolvedValue([]);

    const result = await svc.getPipelineSummary(TENANT_ID);

    expect(result).toHaveLength(5); // one per stage
    for (const stage of result) {
      expect(stage.count).toBe(0);
      expect(stage.businesses).toHaveLength(0);
    }
  });

  it('correctly counts businesses per pipeline stage', async () => {
    const openStages = [
      { businessId: 'biz-001', stage: 'active',     advisorId: ADV_ID, enteredAt: new Date() },
      { businessId: 'biz-002', stage: 'active',     advisorId: null,   enteredAt: new Date() },
      { businessId: 'biz-003', stage: 'onboarding', advisorId: null,   enteredAt: new Date() },
    ];
    db.pipelineStage.findMany.mockResolvedValue(openStages);
    db.business.findMany.mockResolvedValue([
      { id: 'biz-001', legalName: 'Acme LLC',    advisorId: ADV_ID },
      { id: 'biz-002', legalName: 'Beta Corp',   advisorId: null   },
      { id: 'biz-003', legalName: 'Gamma Inc',   advisorId: null   },
    ]);

    const result = await svc.getPipelineSummary(TENANT_ID);
    const activeStage    = result.find((s) => s.stage === 'active');
    const onboardingStage = result.find((s) => s.stage === 'onboarding');

    expect(activeStage?.count).toBe(2);
    expect(onboardingStage?.count).toBe(1);
  });

  // ── getRevenueAnalytics ───────────────────────────────────

  it('returns zero totals when no invoices exist', async () => {
    const result = await svc.getRevenueAnalytics(TENANT_ID);

    expect(result.totalRevenue).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.totalPending).toBe(0);
    expect(result.revenueByAdvisor).toHaveLength(0);
    expect(result.topClients).toHaveLength(0);
  });

  it('sums revenue across paid and pending invoices correctly', async () => {
    db.invoice.findMany.mockResolvedValue([
      { amount: '5000', status: 'paid',   businessId: BIZ_ID, createdAt: new Date('2025-01-15') },
      { amount: '3000', status: 'issued', businessId: BIZ_ID, createdAt: new Date('2025-02-10') },
      { amount: '1000', status: 'paid',   businessId: BIZ_ID, createdAt: new Date('2025-01-20') },
    ]);

    const result = await svc.getRevenueAnalytics(TENANT_ID);

    expect(result.totalRevenue).toBe(9000);
    expect(result.totalPaid).toBe(6000);
    expect(result.totalPending).toBe(3000);
  });

  it('builds monthly revenue breakdown from invoice dates', async () => {
    db.invoice.findMany.mockResolvedValue([
      { amount: '4000', status: 'paid', businessId: BIZ_ID, createdAt: new Date('2025-01-10') },
      { amount: '2000', status: 'paid', businessId: BIZ_ID, createdAt: new Date('2025-01-25') },
      { amount: '5000', status: 'paid', businessId: BIZ_ID, createdAt: new Date('2025-02-05') },
    ]);

    const result = await svc.getRevenueAnalytics(TENANT_ID);
    const jan = result.revenueByMonth.find((m) => m.month === '2025-01');
    const feb = result.revenueByMonth.find((m) => m.month === '2025-02');

    expect(jan?.revenue).toBe(6000);
    expect(feb?.revenue).toBe(5000);
  });

  // ── getApprovalRateAnalytics ──────────────────────────────

  it('returns zero overall approval rate with no applications', async () => {
    const result = await svc.getApprovalRateAnalytics(TENANT_ID);

    expect(result.overall.totalApplications).toBe(0);
    expect(result.overall.approvalRate).toBe(0);
    expect(result.byIssuer).toHaveLength(0);
  });

  it('calculates approval rates broken down by issuer', async () => {
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'app-1', issuer: 'Chase',    status: 'approved', businessId: BIZ_ID, business: { industry: 'retail', stateOfFormation: 'CA' } },
      { id: 'app-2', issuer: 'Chase',    status: 'declined', businessId: BIZ_ID, business: { industry: 'retail', stateOfFormation: 'CA' } },
      { id: 'app-3', issuer: 'Amex',     status: 'approved', businessId: BIZ_ID, business: { industry: 'tech',   stateOfFormation: 'NY' } },
    ]);

    const result = await svc.getApprovalRateAnalytics(TENANT_ID);

    const chase = result.byIssuer.find((i) => i.value === 'Chase');
    const amex  = result.byIssuer.find((i) => i.value === 'Amex');

    expect(chase?.approvalRate).toBeCloseTo(0.5, 5);
    expect(amex?.approvalRate).toBe(1);
    expect(result.overall.approvalRate).toBeCloseTo(2 / 3, 5);
  });

  it('buckets applications into correct FICO bands', async () => {
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'app-1', issuer: 'Chase', status: 'approved', businessId: 'biz-hi', business: { industry: 'retail', stateOfFormation: 'CA' } },
      { id: 'app-2', issuer: 'Chase', status: 'declined', businessId: 'biz-lo', business: { industry: 'retail', stateOfFormation: 'CA' } },
    ]);
    db.creditProfile.findMany.mockResolvedValue([
      { businessId: 'biz-hi', score: 820 },
      { businessId: 'biz-lo', score: 620 },
    ]);

    const result = await svc.getApprovalRateAnalytics(TENANT_ID);

    const highBand = result.byFicoBand.find((b) => b.value === '800+');
    const lowBand  = result.byFicoBand.find((b) => b.value === '600-649');

    expect(highBand?.approvalRate).toBe(1);
    expect(lowBand?.approvalRate).toBe(0);
  });

  // ── getAdvisorPerformance ─────────────────────────────────

  it('returns advisor performance with correct name and zero stats for new advisor', async () => {
    db.business.findMany.mockResolvedValue([]);

    const result = await svc.getAdvisorPerformance(ADV_ID, TENANT_ID);

    expect(result.advisorId).toBe(ADV_ID);
    expect(result.advisorName).toBe('Jane Doe');
    expect(result.totalClients).toBe(0);
    expect(result.approvalRate).toBe(0);
  });

  it('throws when advisor does not exist', async () => {
    db.user.findFirst.mockResolvedValue(null);

    await expect(
      svc.getAdvisorPerformance('bad-adv', TENANT_ID),
    ).rejects.toThrow('not found');
  });

  it('calculates approval rate from advisor client applications', async () => {
    db.business.findMany.mockResolvedValue([{ id: BIZ_ID }]);
    db.cardApplication.findMany.mockResolvedValue([
      { status: 'approved' },
      { status: 'approved' },
      { status: 'declined' },
    ]);

    const result = await svc.getAdvisorPerformance(ADV_ID, TENANT_ID);
    expect(result.approvalRate).toBeCloseTo(2 / 3, 5);
  });

  it('averages QA scores correctly', async () => {
    db.advisorQaScore.findMany.mockResolvedValue([
      { overallScore: 80, scoredAt: new Date() },
      { overallScore: 90, scoredAt: new Date() },
      { overallScore: 70, scoredAt: new Date() },
    ]);

    const result = await svc.getAdvisorPerformance(ADV_ID, TENANT_ID);
    expect(result.avgQaScore).toBeCloseTo(80, 5);
    expect(result.qaScoreCount).toBe(3);
  });

  // ── getClientTimeline ─────────────────────────────────────

  it('returns client timeline events in descending order', async () => {
    const events = [
      { id: 'evt-1', aggregateId: BIZ_ID, eventType: 'APPLICATION_SUBMITTED',  aggregateType: 'CardApplication', payload: {}, publishedAt: new Date('2025-03-01') },
      { id: 'evt-2', aggregateId: BIZ_ID, eventType: 'APPLICATION_APPROVED',   aggregateType: 'CardApplication', payload: {}, publishedAt: new Date('2025-03-05') },
    ];
    db.ledgerEvent.findMany.mockResolvedValue(events);

    const result = await svc.getClientTimeline(BIZ_ID, TENANT_ID);

    expect(result).toHaveLength(2);
    expect(result[0].eventType).toBe('APPLICATION_SUBMITTED');
  });

  it('throws when business not found during timeline fetch', async () => {
    db.business.findFirst.mockResolvedValue(null);

    await expect(svc.getClientTimeline('bad-id', TENANT_ID)).rejects.toThrow('not found');
  });
});

// ─────────────────────────────────────────────────────────────
// PORTFOLIO BENCHMARKING SERVICE TESTS
// ─────────────────────────────────────────────────────────────

describe('PortfolioBenchmarkingService', () => {
  let svc: PortfolioBenchmarkingService;
  let db: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    db  = makePrismaMock();
    setBenchPrisma(db as never);
    svc = new PortfolioBenchmarkingService();
  });

  // ── getApprovalBenchmarks ─────────────────────────────────

  it('returns empty benchmark arrays when no applications exist', async () => {
    const result = await svc.getApprovalBenchmarks(TENANT_ID);

    expect(result.byIssuer).toHaveLength(0);
    expect(result.byIndustry).toHaveLength(0);
    expect(result.byFicoBand).toHaveLength(0);
    expect(result.byState).toHaveLength(0);
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('calculates benchmark approval rates by industry', async () => {
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'a1', issuer: 'Chase', status: 'approved', businessId: 'b1', business: { industry: 'retail', stateOfFormation: 'CA' } },
      { id: 'a2', issuer: 'Chase', status: 'approved', businessId: 'b2', business: { industry: 'retail', stateOfFormation: 'CA' } },
      { id: 'a3', issuer: 'Chase', status: 'declined', businessId: 'b3', business: { industry: 'hospitality', stateOfFormation: 'NY' } },
    ]);

    const result = await svc.getApprovalBenchmarks(TENANT_ID);
    const retail     = result.byIndustry.find((r) => r.label === 'retail');
    const hospitality = result.byIndustry.find((r) => r.label === 'hospitality');

    expect(retail?.approvalRate).toBe(1);
    expect(hospitality?.approvalRate).toBe(0);
  });

  // ── getPromoSurvivalRates ─────────────────────────────────

  it('returns empty array when no completed funding rounds exist', async () => {
    const result = await svc.getPromoSurvivalRates(TENANT_ID);
    expect(result).toHaveLength(0);
  });

  it('calculates promo survival rate for an issuer', async () => {
    const now   = new Date();
    const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days out

    db.fundingRound.findMany.mockResolvedValue([
      {
        businessId:   BIZ_ID,
        startedAt:    new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
        aprExpiryDate: expiry,
        completedAt:  null,
        business:     { tenantId: TENANT_ID },
        applications: [
          { id: 'app-1', issuer: 'Chase', status: 'approved', creditLimit: '50000', introAprExpiry: expiry },
        ],
      },
    ]);

    const result = await svc.getPromoSurvivalRates(TENANT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].issuer).toBe('Chase');
    expect(result[0].totalRounds).toBe(1);
  });

  // ── getComplaintRates ─────────────────────────────────────

  it('returns empty complaint rates when no complaints exist', async () => {
    const result = await svc.getComplaintRates(TENANT_ID);

    expect(result.byVendor).toHaveLength(0);
    expect(result.byAdvisor).toHaveLength(0);
    expect(result.byChannel).toHaveLength(0);
  });

  it('groups complaint rates by channel', async () => {
    db.complaint.findMany.mockResolvedValue([
      { id: 'c1', businessId: BIZ_ID, source: 'email',   assignedTo: ADV_ID },
      { id: 'c2', businessId: BIZ_ID, source: 'phone',   assignedTo: ADV_ID },
      { id: 'c3', businessId: BIZ_ID, source: 'email',   assignedTo: null   },
    ]);
    db.referralAttribution.findMany.mockResolvedValue([
      { channel: 'email', businessId: 'biz-a' },
      { channel: 'email', businessId: 'biz-b' },
      { channel: 'phone', businessId: 'biz-c' },
    ]);

    const result = await svc.getComplaintRates(TENANT_ID);
    const emailCh = result.byChannel.find((c) => c.value === 'email');
    const phoneCh = result.byChannel.find((c) => c.value === 'phone');

    expect(emailCh?.complaints).toBe(2);
    expect(phoneCh?.complaints).toBe(1);
  });

  // ── getCohortProfitability ────────────────────────────────

  it('returns empty array when no businesses exist', async () => {
    db.business.findMany.mockResolvedValue([]);
    const result = await svc.getCohortProfitability(TENANT_ID);
    expect(result).toHaveLength(0);
  });

  it('groups businesses into quarterly cohorts', async () => {
    db.business.findMany.mockResolvedValue([
      { id: 'biz-a', createdAt: new Date('2025-01-10') },
      { id: 'biz-b', createdAt: new Date('2025-01-20') },
      { id: 'biz-c', createdAt: new Date('2025-04-05') },
    ]);

    const result = await svc.getCohortProfitability(TENANT_ID);
    const q1 = result.find((c) => c.cohortKey === '2025-Q1');
    const q2 = result.find((c) => c.cohortKey === '2025-Q2');

    expect(q1?.clientCount).toBe(2);
    expect(q2?.clientCount).toBe(1);
  });

  // ── getPortfolioRiskHeatmap ───────────────────────────────

  it('returns empty heatmap when no applications exist', async () => {
    const result = await svc.getPortfolioRiskHeatmap(TENANT_ID);

    expect(result.cells).toHaveLength(0);
    expect(result.issuers).toHaveLength(0);
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('builds heatmap cells with risk scores between 0 and 100', async () => {
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'a1', issuer: 'Chase', status: 'approved', businessId: BIZ_ID },
      { id: 'a2', issuer: 'Chase', status: 'declined', businessId: 'biz-2' },
    ]);
    db.creditProfile.findMany.mockResolvedValue([
      { businessId: BIZ_ID,  score: 780 },
      { businessId: 'biz-2', score: 720 },
    ]);

    const result = await svc.getPortfolioRiskHeatmap(TENANT_ID);

    for (const cell of result.cells) {
      expect(cell.riskScore).toBeGreaterThanOrEqual(0);
      expect(cell.riskScore).toBeLessThanOrEqual(100);
    }
    expect(result.issuers).toContain('Chase');
  });
});

// ─────────────────────────────────────────────────────────────
// ISSUER RELATIONSHIP SERVICE TESTS
// ─────────────────────────────────────────────────────────────

describe('IssuerRelationshipService', () => {
  let svc: IssuerRelationshipService;
  let db: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    db  = makePrismaMock();
    setIssuerPrisma(db as never);
    svc = new IssuerRelationshipService();
  });

  // ── listContacts ──────────────────────────────────────────

  it('returns empty array when no contacts exist', async () => {
    const result = await svc.listContacts(TENANT_ID);
    expect(result).toHaveLength(0);
  });

  it('returns mapped contacts from Prisma records', async () => {
    const now = new Date();
    db.issuerContact.findMany.mockResolvedValue([
      {
        id: 'ic-001', tenantId: TENANT_ID, issuer: 'Chase',
        contactName: 'John Smith', contactRole: 'Relationship Manager',
        phone: '800-555-0100', email: 'jsmith@chase.com',
        reconsiderationLine: '800-453-9719',
        notes: 'Best time: morning EST.',
        relationshipScore: 85, createdAt: now, updatedAt: now,
      },
    ]);

    const result = await svc.listContacts(TENANT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].issuer).toBe('Chase');
    expect(result[0].reconsiderationLine).toBe('800-453-9719');
    expect(result[0].relationshipScore).toBe(85);
  });

  // ── createContact ─────────────────────────────────────────

  it('creates a new issuer contact record', async () => {
    const now = new Date();
    const mockRecord = {
      id: 'ic-002', tenantId: TENANT_ID, issuer: 'Amex',
      contactName: 'Sarah Lee', contactRole: 'Senior Banker',
      phone: null, email: 'slee@amex.com',
      reconsiderationLine: '800-567-1234',
      notes: null, relationshipScore: 70,
      createdAt: now, updatedAt: now,
    };
    db.issuerContact.create.mockResolvedValue(mockRecord);

    const result = await svc.createContact({
      tenantId:            TENANT_ID,
      issuer:              'Amex',
      contactName:         'Sarah Lee',
      contactRole:         'Senior Banker',
      email:               'slee@amex.com',
      reconsiderationLine: '800-567-1234',
      relationshipScore:   70,
    });

    expect(db.issuerContact.create).toHaveBeenCalledOnce();
    expect(result.issuer).toBe('Amex');
    expect(result.contactRole).toBe('Senior Banker');
  });

  // ── updateContact ─────────────────────────────────────────

  it('updates an existing issuer contact', async () => {
    const now = new Date();
    const original = {
      id: 'ic-001', tenantId: TENANT_ID, issuer: 'Chase',
      contactName: 'Old Name', contactRole: null,
      phone: null, email: null, reconsiderationLine: null,
      notes: null, relationshipScore: 50,
      createdAt: now, updatedAt: now,
    };
    db.issuerContact.findFirst.mockResolvedValue(original);
    db.issuerContact.update.mockResolvedValue({
      ...original,
      contactName:       'New Name',
      relationshipScore: 90,
    });

    const result = await svc.updateContact('ic-001', TENANT_ID, {
      contactName:       'New Name',
      relationshipScore: 90,
    });

    expect(db.issuerContact.update).toHaveBeenCalledOnce();
    expect(result.contactName).toBe('New Name');
    expect(result.relationshipScore).toBe(90);
  });

  it('throws when contact not found during update', async () => {
    db.issuerContact.findFirst.mockResolvedValue(null);

    await expect(
      svc.updateContact('bad-id', TENANT_ID, { contactName: 'X' }),
    ).rejects.toThrow('not found');
  });

  // ── getReconsiderationOutcomes ────────────────────────────

  it('returns empty outcomes when no decline recoveries exist', async () => {
    const result = await svc.getReconsiderationOutcomes(TENANT_ID);
    expect(result).toHaveLength(0);
  });

  it('groups reconsideration outcomes by issuer and calculates success rate', async () => {
    const now = new Date();
    db.declineRecovery.findMany.mockResolvedValue([
      { issuer: 'Chase', reconsiderationStatus: 'approved', applicationId: 'app-1', createdAt: now, updatedAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
      { issuer: 'Chase', reconsiderationStatus: 'declined', applicationId: 'app-2', createdAt: now, updatedAt: now },
      { issuer: 'Chase', reconsiderationStatus: 'pending',  applicationId: 'app-3', createdAt: now, updatedAt: now },
    ]);
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'app-1', business: { advisorId: ADV_ID } },
      { id: 'app-2', business: { advisorId: ADV_ID } },
      { id: 'app-3', business: { advisorId: ADV_ID } },
    ]);

    const result = await svc.getReconsiderationOutcomes(TENANT_ID);
    const chaseEntry = result.find((r) => r.issuer === 'Chase');

    expect(chaseEntry?.totalAttempts).toBe(3);
    expect(chaseEntry?.successful).toBe(1);
    expect(chaseEntry?.pending).toBe(1);
    expect(chaseEntry?.failed).toBe(1);
    expect(chaseEntry?.successRate).toBeCloseTo(1 / 3, 5);
  });

  // ── getIssuerApprovalTrends ───────────────────────────────

  it('returns empty trends when no applications exist', async () => {
    const result = await svc.getIssuerApprovalTrends(TENANT_ID);
    expect(result).toHaveLength(0);
  });

  it('labels trend as improving when recent approvals rise', async () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(`2025-0${i + 1}-15`);
      const isRecent  = i >= 3;
      return {
        id:          `app-${i}`,
        issuer:      'Chase',
        status:      isRecent ? 'approved' : 'declined',
        submittedAt: d,
        decidedAt:   d,
      };
    });
    db.cardApplication.findMany.mockResolvedValue(months);
    db.issuerContact.findMany.mockResolvedValue([
      { issuer: 'Chase', relationshipScore: 80 },
    ]);

    const result = await svc.getIssuerApprovalTrends(TENANT_ID);
    const chase = result.find((t) => t.issuer === 'Chase');

    expect(chase).toBeDefined();
    expect(chase?.trend).toBe('improving');
    expect(chase?.relationshipScore).toBe(80);
  });

  it('defaults relationship score to 0 when no contact found', async () => {
    db.cardApplication.findMany.mockResolvedValue([
      { id: 'a1', issuer: 'BoA', status: 'approved', submittedAt: new Date('2025-01-15'), decidedAt: new Date('2025-01-15') },
    ]);
    db.issuerContact.findMany.mockResolvedValue([]);

    const result = await svc.getIssuerApprovalTrends(TENANT_ID);
    expect(result[0].relationshipScore).toBe(0);
  });

  it('getContact returns null when contact does not exist', async () => {
    db.issuerContact.findFirst.mockResolvedValue(null);
    const result = await svc.getContact('no-id', TENANT_ID);
    expect(result).toBeNull();
  });
});

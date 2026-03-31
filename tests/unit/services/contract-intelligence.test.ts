// ============================================================
// Unit Tests — Contract Intelligence & Disclosure CMS
//
// Run: npx vitest run tests/unit/services/contract-intelligence.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ContractIntelligenceService,
} from '../../../src/backend/services/contract-intelligence.service.js';
import type {
  ContractAnalysisInput,
  ExtractedClause,
  RedFlag,
} from '../../../src/backend/services/contract-intelligence.service.js';

import {
  DisclosureCmsService,
  SEED_TEMPLATES,
} from '../../../src/backend/services/disclosure-cms.service.js';
import type { RenderContext } from '../../../src/backend/services/disclosure-cms.service.js';

// ── Prisma mock factory ────────────────────────────────────────────

function makeContractPrismaMock() {
  return {
    contractAnalysis: {
      create: vi.fn().mockResolvedValue({
        id: 'analysis-001',
        tenantId: 'tenant-001',
        contractType: 'advisory_agreement',
        extractedClauses: [],
        redFlags: [],
        missingProtections: [],
        riskScore: 0,
        analyzedAt: new Date(),
        createdAt: new Date(),
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeDisclosurePrismaMock() {
  const records: any[] = [];
  return {
    disclosureTemplate: {
      create: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
        const record = { id: `tpl-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        records.push(record);
        return record;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: any }) => {
        return records.find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null;
      }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: any; data: any }) => {
        const idx = records.findIndex(r => r.id === where.id);
        if (idx >= 0) {
          records[idx] = { ...records[idx], ...data };
          return records[idx];
        }
        return { id: where.id, ...data, createdAt: new Date(), updatedAt: new Date() };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    _records: records,
  };
}

// ── Mock the event bus ────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Contract document fixtures ────────────────────────────────────

const CLEAN_CONTRACT = `
ADVISORY SERVICES AGREEMENT

This Advisory Services Agreement ("Agreement") is entered into between CapitalForge Advisory LLC ("Advisor") and the undersigned business ("Client").

FEES
The program fee is 10% of total funded credit, earned upon successful funding and clearly disclosed in the attached fee schedule.

REFUND POLICY
In the event of cancellation before program completion, Client shall receive a pro-rata refund based on services delivered. Refunds are processed within 30 business days.

RIGHT TO CANCEL
Client has the right to cancel this Agreement within 3 business days of signing without penalty.

TERMINATION
Either party may terminate this Agreement with 30 days written notice. Termination does not waive fees for services already rendered.

GOVERNING LAW
This Agreement shall be governed by the laws of the State of Delaware. Any disputes shall be resolved in the state or federal courts of Delaware, and both parties consent to personal jurisdiction therein.

DISPUTE RESOLUTION
Either party may escalate disputes to a neutral mediator agreed upon by both parties. Arbitration, if elected, shall be conducted under AAA Commercial Rules and shall be mutual and voluntary.

DATA PRIVACY
Client data is collected, used, and stored in accordance with Advisor's Privacy Policy, which complies with applicable federal and state privacy laws including the Gramm-Leach-Bliley Act.

LIMITATION OF LIABILITY
Neither party's liability shall exceed the total fees paid by Client under this Agreement during the 12 months preceding the claim.

AMENDMENT
This Agreement may only be amended by mutual written consent of both parties. Either party may terminate without penalty if a proposed amendment is unacceptable.
`;

const TOXIC_CONTRACT = `
PROGRAM AGREEMENT — BUSINESS FUNDING SERVICES

FEES
Our program fee of 15% is non-refundable once the agreement is signed regardless of outcome.

NO REFUND POLICY
All fees are non-refundable. All sales final. No exceptions.

NON-DISPARAGEMENT
Client agrees not to post any negative review, comment, or feedback about Company on any platform including Yelp, Google, BBB, or any government or regulatory agency. Client shall not disparage Company to any third party including government agencies, regulators, the FTC, CFPB, or state attorneys general.

ARBITRATION
Any and all disputes shall be resolved exclusively through mandatory binding arbitration. Client waives any right to bring a class action, collective action, or representative proceeding. Arbitration shall be final and binding.

UNILATERAL MODIFICATION
Company reserves the right to change, modify, or update these terms at any time without prior notice in its sole and absolute discretion. Continued use of services constitutes acceptance.

INDEMNIFICATION
Client agrees to defend, hold harmless, and indemnify Company from any and all claims, damages, costs, and expenses including Company's own negligence, gross negligence, or willful misconduct.

GOVERNING LAW
This Agreement is governed by the laws of the State of Nevada. All disputes must be litigated or arbitrated exclusively in Clark County, Nevada.

AUTO-RENEWAL
Services will automatically renew on an annual basis. To cancel, client must send written notice via certified mail to our legal department. Cancellation is effective only upon written acknowledgment from Company.

LIABILITY CAP
In no event shall Company's liability exceed $1.00 (one dollar).
`;

const ARBITRATION_CONTRACT = `
DISPUTE RESOLUTION

All disputes arising from this Agreement shall be resolved through binding arbitration administered by JAMS.

CLASS ACTION WAIVER
EACH PARTY WAIVES THE RIGHT TO PARTICIPATE IN CLASS OR COLLECTIVE ARBITRATION.

Governing Law: This Agreement is governed by California law.
`;

const INDEMNIFICATION_CONTRACT = `
INDEMNIFICATION

Client hereby agrees to indemnify, defend, and hold harmless Company and its officers from any and all claims including those arising from Company's negligence, gross negligence, errors, and omissions.
`;

// ── Test fixtures ─────────────────────────────────────────────────

const TENANT_ID = 'tenant-001';

// =================================================================
// CLAUSE EXTRACTION TESTS
// =================================================================

describe('ContractIntelligenceService — Clause Extraction', () => {
  let svc: ContractIntelligenceService;
  let prismaMock: ReturnType<typeof makeContractPrismaMock>;

  beforeEach(() => {
    prismaMock = makeContractPrismaMock();
    svc = new ContractIntelligenceService(prismaMock as any);

    prismaMock.contractAnalysis.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 'analysis-001',
      ...data,
      analyzedAt: new Date(),
      createdAt: new Date(),
    }));
  });

  it('extracts fee clause from a contract containing fee language', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    const feeClause = result.extractedClauses.find(c => c.type === 'fee');
    expect(feeClause).toBeDefined();
    expect(feeClause!.confidence).toBeGreaterThan(0);
  });

  it('extracts refund clause from a contract containing refund language', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    const refundClause = result.extractedClauses.find(c => c.type === 'refund');
    expect(refundClause).toBeDefined();
  });

  it('extracts governing_law clause', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    const govClause = result.extractedClauses.find(c => c.type === 'governing_law');
    expect(govClause).toBeDefined();
  });

  it('extracts arbitration clause from toxic contract', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const arbitration = result.extractedClauses.find(c => c.type === 'arbitration');
    expect(arbitration).toBeDefined();
  });

  it('extracts non_disparagement clause from toxic contract', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const nd = result.extractedClauses.find(c => c.type === 'non_disparagement');
    expect(nd).toBeDefined();
  });

  it('extracts indemnification clause', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: INDEMNIFICATION_CONTRACT,
    });

    const indemnify = result.extractedClauses.find(c => c.type === 'indemnification');
    expect(indemnify).toBeDefined();
  });

  it('extracts auto_renewal clause from toxic contract', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const autoRenew = result.extractedClauses.find(c => c.type === 'auto_renewal');
    expect(autoRenew).toBeDefined();
  });

  it('gives each extracted clause a title', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    for (const clause of result.extractedClauses) {
      expect(clause.title).toBeTruthy();
      expect(clause.title.length).toBeGreaterThan(0);
    }
  });

  it('assigns confidence scores between 1 and 100', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    for (const clause of result.extractedClauses) {
      expect(clause.confidence).toBeGreaterThan(0);
      expect(clause.confidence).toBeLessThanOrEqual(100);
    }
  });
});

// =================================================================
// RED FLAG DETECTION TESTS
// =================================================================

describe('ContractIntelligenceService — Red Flag Detection', () => {
  let svc: ContractIntelligenceService;
  let prismaMock: ReturnType<typeof makeContractPrismaMock>;

  beforeEach(() => {
    prismaMock = makeContractPrismaMock();
    svc = new ContractIntelligenceService(prismaMock as any);

    prismaMock.contractAnalysis.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 'analysis-002',
      ...data,
      analyzedAt: new Date(),
      createdAt: new Date(),
    }));
  });

  it('detects no red flags in a clean contract', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    expect(result.redFlags).toHaveLength(0);
    expect(result.riskLevel).toBe('low');
  });

  it('detects non-disparagement targeting regulators as CRITICAL', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const ndFlag = result.redFlags.find(f => f.category === 'Non-Disparagement Silencing');
    expect(ndFlag).toBeDefined();
    expect(ndFlag!.severity).toBe('critical');
  });

  it('detects broad non-disparagement as HIGH severity', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const ndFlags = result.redFlags.filter(f =>
      f.category === 'Non-Disparagement Silencing' || f.category === 'Non-Disparagement (Broad)',
    );
    expect(ndFlags.length).toBeGreaterThanOrEqual(1);
  });

  it('detects unilateral modification as CRITICAL', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const modFlag = result.redFlags.find(f => f.category === 'Unilateral Modification');
    expect(modFlag).toBeDefined();
    expect(modFlag!.severity).toBe('critical');
  });

  it('detects absolute no-refund policy as HIGH severity', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    const refundFlag = result.redFlags.find(f => f.category === 'No-Refund Policy');
    expect(refundFlag).toBeDefined();
    expect(refundFlag!.severity).toBe('high');
  });

  it('detects indemnification covering provider negligence as HIGH', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: INDEMNIFICATION_CONTRACT,
    });

    const indemnifyFlag = result.redFlags.find(f => f.category === 'Indemnification Imbalance');
    expect(indemnifyFlag).toBeDefined();
    expect(indemnifyFlag!.severity).toBe('high');
  });

  it('detects binding arbitration + class action waiver as CRITICAL', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: ARBITRATION_CONTRACT,
    });

    const arbFlag = result.redFlags.find(f => f.category === 'Binding Arbitration');
    expect(arbFlag).toBeDefined();
    expect(arbFlag!.severity).toBe('critical');
  });

  it('toxic contract produces critical risk level', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    expect(result.riskScore).toBeGreaterThan(50);
    expect(['high', 'critical']).toContain(result.riskLevel);
  });

  it('each red flag includes FTC pattern reference and recommendation', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    for (const flag of result.redFlags) {
      expect(flag.ftcPattern).toBeTruthy();
      expect(flag.recommendation).toBeTruthy();
    }
  });
});

// =================================================================
// MISSING PROTECTION ALERTS TESTS
// =================================================================

describe('ContractIntelligenceService — Missing Protection Alerts', () => {
  let svc: ContractIntelligenceService;
  let prismaMock: ReturnType<typeof makeContractPrismaMock>;

  beforeEach(() => {
    prismaMock = makeContractPrismaMock();
    svc = new ContractIntelligenceService(prismaMock as any);

    prismaMock.contractAnalysis.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 'analysis-003',
      ...data,
      analyzedAt: new Date(),
      createdAt: new Date(),
    }));
  });

  it('flags missing refund policy in a contract without refund clause', async () => {
    const minimalContract = `
ADVISORY AGREEMENT

FEES
Our program fee is 10% of funded credit.

GOVERNING LAW
Delaware law governs this agreement.
`;

    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: minimalContract,
    });

    const missing = result.missingProtections.find(mp => mp.name === 'Refund Policy');
    expect(missing).toBeDefined();
    expect(missing!.importance).toBe('required');
  });

  it('flags missing non-disparagement carve-out when clause is present', async () => {
    const contractWithND = `
NON-DISPARAGEMENT
Client agrees not to post any negative review or comment about Company on any platform.

FEES
Program fee is 10%.
`;

    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: contractWithND,
    });

    const missing = result.missingProtections.find(
      mp => mp.name === 'Limitation of Non-Disparagement Scope',
    );
    expect(missing).toBeDefined();
  });

  it('clean contract with all protections has minimal missing protections', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'advisory_agreement',
      documentText: CLEAN_CONTRACT,
    });

    // Clean contract should not flag refund, termination, or dispute resolution
    const requiredMissing = result.missingProtections.filter(
      mp => mp.importance === 'required',
    );
    expect(requiredMissing.length).toBeLessThanOrEqual(3);
  });

  it('all missing protections include an importance level', async () => {
    const result = await svc.analyzeContract({
      tenantId: TENANT_ID,
      contractType: 'program_agreement',
      documentText: TOXIC_CONTRACT,
    });

    for (const mp of result.missingProtections) {
      expect(['required', 'strongly_recommended', 'recommended']).toContain(mp.importance);
    }
  });
});

// =================================================================
// CONTRACT COMPARISON LAB TESTS
// =================================================================

describe('ContractIntelligenceService — Contract Comparison Lab', () => {
  let svc: ContractIntelligenceService;
  let prismaMock: ReturnType<typeof makeContractPrismaMock>;

  beforeEach(() => {
    prismaMock = makeContractPrismaMock();
    svc = new ContractIntelligenceService(prismaMock as any);
  });

  it('throws when fewer than two contracts are provided', async () => {
    await expect(
      svc.compareContracts(TENANT_ID, [
        { id: 'c1', label: 'Contract A', documentText: CLEAN_CONTRACT, contractType: 'advisory' },
      ]),
    ).rejects.toThrow(/at least two/i);
  });

  it('returns a clause matrix for two contracts', async () => {
    const result = await svc.compareContracts(TENANT_ID, [
      { id: 'c1', label: 'Clean', documentText: CLEAN_CONTRACT, contractType: 'advisory' },
      { id: 'c2', label: 'Toxic', documentText: TOXIC_CONTRACT, contractType: 'program' },
    ]);

    expect(result.clauseMatrix).toBeDefined();
    expect(result.clauseMatrix.length).toBeGreaterThan(0);
  });

  it('clause matrix contains entries for both contract labels', async () => {
    const result = await svc.compareContracts(TENANT_ID, [
      { id: 'c1', label: 'Clean', documentText: CLEAN_CONTRACT, contractType: 'advisory' },
      { id: 'c2', label: 'Toxic', documentText: TOXIC_CONTRACT, contractType: 'program' },
    ]);

    for (const row of result.clauseMatrix) {
      expect(row.contracts).toHaveProperty('Clean');
      expect(row.contracts).toHaveProperty('Toxic');
    }
  });

  it('identifies the clean contract as the winner', async () => {
    const result = await svc.compareContracts(TENANT_ID, [
      { id: 'c1', label: 'Clean', documentText: CLEAN_CONTRACT, contractType: 'advisory' },
      { id: 'c2', label: 'Toxic', documentText: TOXIC_CONTRACT, contractType: 'program' },
    ]);

    expect(result.winner).toBe('Clean');
  });

  it('returns a summary string', async () => {
    const result = await svc.compareContracts(TENANT_ID, [
      { id: 'c1', label: 'A', documentText: CLEAN_CONTRACT, contractType: 'advisory' },
      { id: 'c2', label: 'B', documentText: TOXIC_CONTRACT, contractType: 'program' },
    ]);

    expect(result.summary).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(10);
  });
});

// =================================================================
// DISCLOSURE TEMPLATE CMS TESTS
// =================================================================

describe('DisclosureCmsService — Template Creation & Management', () => {
  let svc: DisclosureCmsService;
  let prismaMock: ReturnType<typeof makeDisclosurePrismaMock>;

  beforeEach(() => {
    prismaMock = makeDisclosurePrismaMock();
    svc = new DisclosureCmsService(prismaMock as any);
  });

  it('creates a template and returns draft status', async () => {
    const record = await svc.createTemplate({
      tenantId: TENANT_ID,
      state: 'CA',
      category: 'credit_stacking',
      name: 'CA Credit Stacking Disclosure',
      content: 'This is a test disclosure template with {{businessLegalName}} and {{fundingAmount}} variables and enough content here.',
      effectiveDate: new Date('2024-06-01'),
    });

    expect(record).toBeDefined();
    expect(record.status).toBe('draft');
    expect(record.isActive).toBe(false);
    expect(record.version).toBe('1.0.0');
    expect(record.state).toBe('CA');
  });

  it('returns CATEGORY_VARIABLES for the category as the variable list', async () => {
    const record = await svc.createTemplate({
      tenantId: TENANT_ID,
      state: 'TX',
      category: 'fee_schedule',
      name: 'TX Fee Schedule',
      content: 'Fee schedule disclosure with {{businessLegalName}} and {{programFee}} and {{totalCost}} and {{disclosureDate}} info here.',
      effectiveDate: new Date('2024-06-01'),
    });

    expect(record.variables).toBeDefined();
    expect(record.variables.length).toBeGreaterThan(0);
    const hasRequired = record.variables.some(v => v.required === true);
    expect(hasRequired).toBe(true);
  });
});

// =================================================================
// DISCLOSURE CMS — VERSION HISTORY TESTS
// =================================================================

describe('DisclosureCmsService — Version History', () => {
  let svc: DisclosureCmsService;
  let prismaMock: ReturnType<typeof makeDisclosurePrismaMock>;

  beforeEach(() => {
    prismaMock = makeDisclosurePrismaMock();
    svc = new DisclosureCmsService(prismaMock as any);
  });

  it('getVersionHistory queries by state and category', async () => {
    await svc.getVersionHistory(TENANT_ID, 'CA', 'credit_stacking');

    expect(prismaMock.disclosureTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: 'CA', category: 'credit_stacking' }),
      }),
    );
  });

  it('normalizes state to uppercase in version history query', async () => {
    await svc.getVersionHistory(TENANT_ID, 'ca', 'fee_schedule');

    expect(prismaMock.disclosureTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: 'CA' }),
      }),
    );
  });
});

// =================================================================
// DISCLOSURE CMS — APPROVAL WORKFLOW TESTS
// =================================================================

describe('DisclosureCmsService — Approval Workflow', () => {
  let svc: DisclosureCmsService;
  let prismaMock: ReturnType<typeof makeDisclosurePrismaMock>;

  const BASE_TEMPLATE = {
    id: 'tpl-001',
    tenantId: TENANT_ID,
    state: 'FEDERAL',
    category: 'credit_stacking',
    name: 'Federal Credit Disclosure',
    content: 'Disclosure content {{businessLegalName}}',
    version: '1.0.0',
    effectiveDate: new Date('2024-01-01'),
    isActive: false,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaMock = makeDisclosurePrismaMock();
    svc = new DisclosureCmsService(prismaMock as any);

    prismaMock.disclosureTemplate.findFirst.mockResolvedValue(BASE_TEMPLATE);
    prismaMock.disclosureTemplate.update.mockResolvedValue({
      ...BASE_TEMPLATE,
      isActive: true,
      approvedBy: 'user-compliance-001',
      approvedAt: new Date(),
    });
  });

  it('approveTemplate sets isActive=true and records approvedBy', async () => {
    const approved = await svc.approveTemplate(TENANT_ID, 'tpl-001', {
      approverId: 'user-compliance-001',
      notes: 'Reviewed and approved',
    });

    expect(prismaMock.disclosureTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: true,
          approvedBy: 'user-compliance-001',
        }),
      }),
    );
    expect(approved.isActive).toBe(true);
    expect(approved.status).toBe('approved');
  });

  it('approveTemplate deactivates other templates for same state/category', async () => {
    await svc.approveTemplate(TENANT_ID, 'tpl-001', {
      approverId: 'user-compliance-001',
    });

    expect(prismaMock.disclosureTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          state: 'FEDERAL',
          category: 'credit_stacking',
          isActive: true,
          id: { not: 'tpl-001' },
        }),
        data: { isActive: false },
      }),
    );
  });

  it('approveTemplate throws when template not found', async () => {
    prismaMock.disclosureTemplate.findFirst.mockResolvedValue(null);

    await expect(
      svc.approveTemplate(TENANT_ID, 'nonexistent-id', { approverId: 'admin' }),
    ).rejects.toThrow(/not found/i);
  });

  it('submitForApproval emits a submission event', async () => {
    const { eventBus } = await import('../../../src/backend/events/event-bus.js');
    const template = await svc.submitForApproval(TENANT_ID, 'tpl-001');

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DISCLOSURE_TEMPLATE_SUBMITTED_FOR_APPROVAL',
        aggregateId: 'tpl-001',
      }),
    );
  });
});

// =================================================================
// DISCLOSURE CMS — STATE-SPECIFIC RENDERING TESTS
// =================================================================

describe('DisclosureCmsService — Template Rendering', () => {
  let svc: DisclosureCmsService;
  let prismaMock: ReturnType<typeof makeDisclosurePrismaMock>;

  const ACTIVE_TEMPLATE = {
    id: 'tpl-active-001',
    tenantId: TENANT_ID,
    state: 'CA',
    category: 'credit_stacking',
    name: 'CA Credit Stacking Disclosure',
    content: 'Business: {{businessLegalName}}\nFunding: ${{fundingAmount}}\nFee: {{programFeePercent}}%\nDate: {{disclosureDate}}',
    version: '2.1.0',
    effectiveDate: new Date('2024-01-01'),
    isActive: true,
    approvedBy: 'user-001',
    approvedAt: new Date('2024-01-01'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaMock = makeDisclosurePrismaMock();
    svc = new DisclosureCmsService(prismaMock as any);
    prismaMock.disclosureTemplate.findFirst.mockResolvedValue(ACTIVE_TEMPLATE);
  });

  it('renders template with all variables substituted', async () => {
    const context: RenderContext = {
      businessLegalName: 'Acme Corp LLC',
      fundingAmount: '100000',
      programFeePercent: '10',
    };

    const rendered = await svc.renderDisclosure(TENANT_ID, 'tpl-active-001', context);

    expect(rendered.renderedContent).toContain('Acme Corp LLC');
    expect(rendered.renderedContent).toContain('100000');
    expect(rendered.renderedContent).toContain('10%');
  });

  it('auto-injects disclosureDate if not provided', async () => {
    const context: RenderContext = {
      businessLegalName: 'Test Business',
      fundingAmount: '50000',
      programFeePercent: '8',
    };

    const rendered = await svc.renderDisclosure(TENANT_ID, 'tpl-active-001', context);

    expect(rendered.renderedContent).not.toContain('{{disclosureDate}}');
    expect(rendered.missingVariables).not.toContain('disclosureDate');
  });

  it('reports missing variables when context is incomplete', async () => {
    const context: RenderContext = {}; // no variables provided

    const rendered = await svc.renderDisclosure(TENANT_ID, 'tpl-active-001', context);

    expect(rendered.missingVariables.length).toBeGreaterThan(0);
    expect(rendered.missingVariables).toContain('businessLegalName');
    expect(rendered.missingVariables).toContain('fundingAmount');
  });

  it('leaves placeholder text for missing variables', async () => {
    const context: RenderContext = { businessLegalName: 'ACME LLC' };

    const rendered = await svc.renderDisclosure(TENANT_ID, 'tpl-active-001', context);

    expect(rendered.renderedContent).toContain('{{fundingAmount}}');
  });

  it('throws when rendering an inactive template', async () => {
    prismaMock.disclosureTemplate.findFirst.mockResolvedValue({
      ...ACTIVE_TEMPLATE,
      isActive: false,
      approvedBy: null,
      approvedAt: null,
    });

    await expect(
      svc.renderDisclosure(TENANT_ID, 'tpl-active-001', { businessLegalName: 'Test' }),
    ).rejects.toThrow(/not active/i);
  });

  it('throws when template is not found', async () => {
    prismaMock.disclosureTemplate.findFirst.mockResolvedValue(null);

    await expect(
      svc.renderDisclosure(TENANT_ID, 'nonexistent', {}),
    ).rejects.toThrow(/not found/i);
  });

  it('returns correct templateVersion in rendered output', async () => {
    const context: RenderContext = {
      businessLegalName: 'ABC Inc',
      fundingAmount: '75000',
      programFeePercent: '12',
    };

    const rendered = await svc.renderDisclosure(TENANT_ID, 'tpl-active-001', context);

    expect(rendered.templateVersion).toBe('2.1.0');
    expect(rendered.state).toBe('CA');
    expect(rendered.category).toBe('credit_stacking');
  });
});

// =================================================================
// DISCLOSURE CMS — SEED TEMPLATES TESTS
// =================================================================

describe('DisclosureCmsService — Seed Templates', () => {
  it('SEED_TEMPLATES array contains federal and state templates', () => {
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(4);

    const federalTemplates = SEED_TEMPLATES.filter(t => t.state === 'FEDERAL');
    expect(federalTemplates.length).toBeGreaterThanOrEqual(2);

    const stateTemplates = SEED_TEMPLATES.filter(t => t.state !== 'FEDERAL');
    expect(stateTemplates.length).toBeGreaterThanOrEqual(2);
  });

  it('all seed templates have content with variable placeholders', () => {
    for (const template of SEED_TEMPLATES) {
      expect(template.content).toContain('{{');
      expect(template.content.length).toBeGreaterThan(100);
    }
  });

  it('CA and NY state-specific templates are present', () => {
    const states = SEED_TEMPLATES.map(t => t.state);
    expect(states).toContain('CA');
    expect(states).toContain('NY');
  });
});

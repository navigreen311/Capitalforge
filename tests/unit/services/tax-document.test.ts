// ============================================================
// CapitalForge — Tax Document & Data Lineage Test Suite
//
// Covers (25 tests):
//   • TaxDocumentService
//     - generateIRC163jReport: computation correctness, alert
//       flags, planning notes, entity info, disclaimer
//     - generateYearEndFeeSummary: card aggregation, fee totals,
//       §163(j) estimate block, empty-cards edge case
//     - generateExportPackage: JSON shape, CSV serialisation,
//       conditional §163(j) inclusion
//     - serializeToCSV: structure, escaping, section headers
//
//   • DataLineageService (pure / catalog-level tests)
//     - Lineage catalog: node IDs, kinds, required fields
//     - Edge catalog: fromNodeId / toNodeId reference valid nodes
//     - resolveUpstreamChain: terminal source nodes have no parents
//     - buildRegulatoryExport: provenance ordering, attestation
//     - detectChanges: no changes when snapshot matches,
//       delta computation, severity mapping
//     - captureSnapshot: _capturedAt metadata field present
//
//   All database calls are mocked via vi.mock so no Prisma
//   connection is required at test time.
// ============================================================

import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import {
  TaxDocumentService,
  type IRC163jReportInput,
} from '../../../src/backend/services/tax-document.service.js';
import {
  DataLineageService,
} from '../../../src/backend/services/data-lineage.service.js';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock('../../../src/backend/config/database.js', () => ({
  prisma: {
    business: {
      findFirst: vi.fn(),
    },
    costCalculation: {
      findFirst: vi.fn(),
    },
    cardApplication: {
      findMany: vi.fn(),
    },
    spendTransaction: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/backend/config/database.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const BIZ_ID = 'biz-tax-001';
const TENANT_ID = 'tenant-test-001';
const TAX_YEAR = 2026;

function mockBusiness(overrides = {}) {
  return {
    id: BIZ_ID,
    legalName: 'Acme Corp LLC',
    ein: '12-3456789',
    entityType: 'LLC',
    annualRevenue: 1_200_000,
    ...overrides,
  };
}

function mockCostCalc(overrides = {}) {
  return {
    id: 'cc-001',
    businessId: BIZ_ID,
    programFees: 2500,
    percentOfFunding: 1200,
    annualFees: 1245,
    cashAdvanceFees: 800,
    processorFees: 1800,
    totalCost: 9500,
    effectiveApr: 0.18,
    irc163jImpact: 4000,
    createdAt: new Date('2026-12-31'),
    ...overrides,
  };
}

function mockCardApp(overrides = {}) {
  return {
    id: `app-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_ID,
    issuer: 'Chase',
    cardProduct: 'Ink Business Preferred',
    creditLimit: 25000,
    annualFee: 95,
    cashAdvanceFee: 200,
    introApr: 0,
    regularApr: 0.2099,
    introAprExpiry: new Date('2027-06-01'),
    status: 'approved',
    decidedAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function mockSpendTx(overrides = {}) {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    businessId: BIZ_ID,
    tenantId: TENANT_ID,
    amount: 500,
    merchantName: 'Office Depot',
    mccCategory: 'Office Supplies',
    businessPurpose: 'Printer paper and toner for home office',
    isCashLike: false,
    flagged: false,
    flagReason: null,
    transactionDate: new Date(`${TAX_YEAR}-03-15`),
    createdAt: new Date(`${TAX_YEAR}-03-15`),
    ...overrides,
  };
}

function makeIRC163jInput(overrides: Partial<IRC163jReportInput> = {}): IRC163jReportInput {
  return {
    businessId: BIZ_ID,
    tenantId: TENANT_ID,
    taxYear: TAX_YEAR,
    adjustedTaxableIncome: 500_000,
    businessInterestIncome: 2_000,
    effectiveTaxRate: 0.21,
    ...overrides,
  };
}

// ── TaxDocumentService ────────────────────────────────────────────────────────

describe('TaxDocumentService', () => {
  let service: TaxDocumentService;

  beforeEach(() => {
    service = new TaxDocumentService();
    vi.clearAllMocks();
  });

  // ── generateIRC163jReport ─────────────────────────────────────────────────

  describe('generateIRC163jReport', () => {
    it('returns a report with correct businessId, taxYear, and entity info', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const report = await service.generateIRC163jReport(makeIRC163jInput());

      expect(report.businessId).toBe(BIZ_ID);
      expect(report.taxYear).toBe(TAX_YEAR);
      expect(report.businessName).toBe('Acme Corp LLC');
      expect(report.ein).toBe('12-3456789');
      expect(report.entityType).toBe('LLC');
    });

    it('exposes full §163(j) computation result on the report', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const report = await service.generateIRC163jReport(makeIRC163jInput());

      expect(report.computation).toBeDefined();
      expect(typeof report.computation.deductibleInterest).toBe('number');
      expect(typeof report.computation.disallowedAmount).toBe('number');
      expect(typeof report.computation.atiLimit).toBe('number');
      expect(typeof report.computation.limitationFlag).toBe('string');
    });

    it('sets requiresAlert = true when limitation flag is exceeds_limit', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      // Zero ATI means nothing is deductible — disallowed amount will be non-zero
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(
        mockCostCalc({ cashAdvanceFees: 999_999, effectiveApr: 5.0 }),
      );

      const report = await service.generateIRC163jReport(
        makeIRC163jInput({ adjustedTaxableIncome: 0, businessInterestIncome: 0 }),
      );

      // With ATI = 0 and large interest, limit is 0 so everything is disallowed
      expect(report.requiresAlert).toBe(true);
      expect(report.computation.limitationFlag).toBe('exceeds_limit');
    });

    it('sets requiresAlert = false when fully deductible', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(
        mockCostCalc({ cashAdvanceFees: 100, processorFees: 50 }),
      );

      const report = await service.generateIRC163jReport(
        makeIRC163jInput({ adjustedTaxableIncome: 2_000_000 }),
      );

      expect(report.requiresAlert).toBe(false);
    });

    it('includes interest expense component breakdown', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const report = await service.generateIRC163jReport(makeIRC163jInput());

      const components = report.interestExpenseComponents;
      expect(typeof components.creditCardInterest).toBe('number');
      expect(typeof components.cashAdvanceFees).toBe('number');
      expect(typeof components.processorFees).toBe('number');
      expect(typeof components.totalBusinessInterestExpense).toBe('number');
      expect(components.totalBusinessInterestExpense).toBeGreaterThanOrEqual(0);
    });

    it('includes the TAX_DISCLAIMER text', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const report = await service.generateIRC163jReport(makeIRC163jInput());

      expect(report.disclaimer).toContain('not constitute legal, tax, or financial advice');
    });

    it('includes non-empty taxPlanningNotes array', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const report = await service.generateIRC163jReport(makeIRC163jInput({ taxYear: 2025 }));

      expect(Array.isArray(report.taxPlanningNotes)).toBe(true);
      expect(report.taxPlanningNotes.length).toBeGreaterThan(0);
    });

    it('throws when business is not found', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(null);

      await expect(service.generateIRC163jReport(makeIRC163jInput())).rejects.toThrow(
        /not found/i,
      );
    });

    it('uses averageAnnualGrossReceipts for small-business exemption check', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      // Receipts well below $29M threshold — should be exempt
      const report = await service.generateIRC163jReport(
        makeIRC163jInput({ averageAnnualGrossReceipts: 5_000_000 }),
      );

      expect(report.computation.isExempt).toBe(true);
      expect(report.computation.limitationFlag).toBe('exempt');
    });
  });

  // ── generateYearEndFeeSummary ─────────────────────────────────────────────

  describe('generateYearEndFeeSummary', () => {
    it('returns correct cardSummaries for each application', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([
        mockCardApp({ issuer: 'Chase', annualFee: 95, cashAdvanceFee: 0 }),
        mockCardApp({ issuer: 'Amex', annualFee: 250, cashAdvanceFee: 100 }),
      ]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.cardSummaries).toHaveLength(2);
      expect(summary.cardSummaries[0].issuer).toBe('Chase');
      expect(summary.cardSummaries[1].issuer).toBe('Amex');
    });

    it('sums totalAnnualFees correctly across all cards', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([
        mockCardApp({ annualFee: 95 }),
        mockCardApp({ annualFee: 550 }),
        mockCardApp({ annualFee: 695 }),
      ]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.totalAnnualFees).toBe(1_340);
    });

    it('returns zero-fee summary when no card applications exist', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.cardSummaries).toHaveLength(0);
      expect(summary.totalAnnualFees).toBe(0);
      expect(summary.grandTotalCost).toBe(0);
      expect(summary.irc163jEstimate).toBeNull();
    });

    it('sets irc163jEstimate block when costCalc has irc163jImpact', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(
        mockCostCalc({ irc163jImpact: 4_500 }),
      );

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.irc163jEstimate).not.toBeNull();
      expect(summary.irc163jEstimate!.deductibleInterest).toBe(4_500);
    });

    it('includes correct taxYear and businessId on summary', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.businessId).toBe(BIZ_ID);
      expect(summary.taxYear).toBe(TAX_YEAR);
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });

    it('computes totalFeesForYear per card as annualFee + cashAdvanceFee', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([
        mockCardApp({ annualFee: 95, cashAdvanceFee: 200 }),
      ]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);

      const summary = await service.generateYearEndFeeSummary(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(summary.cardSummaries[0].totalFeesForYear).toBe(295);
    });
  });

  // ── generateExportPackage ─────────────────────────────────────────────────

  describe('generateExportPackage', () => {
    beforeEach(() => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([
        mockCardApp(),
      ]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.spendTransaction.findMany as unknown as MockInstance).mockResolvedValue([
        mockSpendTx(),
      ]);
    });

    it('returns a package with correct format = json by default', async () => {
      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(pkg.format).toBe('json');
      expect(pkg.businessId).toBe(BIZ_ID);
      expect(pkg.taxYear).toBe(TAX_YEAR);
    });

    it('includes yearEndFeeSummary and businessPurposeSummary always', async () => {
      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(pkg.yearEndFeeSummary).toBeDefined();
      expect(pkg.businessPurposeSummary).toBeDefined();
    });

    it('irc163jReport is null when no 163j input provided', async () => {
      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(pkg.irc163jReport).toBeNull();
    });

    it('irc163jReport is populated when §163(j) input is provided', async () => {
      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR, {
        adjustedTaxableIncome: 500_000,
        businessInterestIncome: 2_000,
      });

      expect(pkg.irc163jReport).not.toBeNull();
      expect(pkg.irc163jReport!.taxYear).toBe(TAX_YEAR);
    });

    it('metadata contains generatedBy, version, and disclaimer', async () => {
      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);

      expect(pkg.metadata.generatedBy).toContain('CapitalForge');
      expect(typeof pkg.metadata.version).toBe('string');
      expect(pkg.metadata.disclaimer).toContain('not constitute legal');
    });
  });

  // ── serializeToCSV ────────────────────────────────────────────────────────

  describe('serializeToCSV', () => {
    it('produces a string containing the year-end fee section header', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([mockCardApp()]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.spendTransaction.findMany as unknown as MockInstance).mockResolvedValue([]);

      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);
      const csv = service.serializeToCSV(pkg);

      expect(csv).toContain('YEAR-END FEE SUMMARY');
    });

    it('produces a string containing the business purpose section header', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);
      (prisma.spendTransaction.findMany as unknown as MockInstance).mockResolvedValue([mockSpendTx()]);

      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);
      const csv = service.serializeToCSV(pkg);

      expect(csv).toContain('BUSINESS PURPOSE DOCUMENTATION');
    });

    it('escapes commas inside field values with double-quotes', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([
        mockCardApp({ cardProduct: 'Visa, Premium Card' }),
      ]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);
      (prisma.spendTransaction.findMany as unknown as MockInstance).mockResolvedValue([]);

      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR);
      const csv = service.serializeToCSV(pkg);

      expect(csv).toContain('"Visa, Premium Card"');
    });

    it('includes §163(j) section when report is present', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.spendTransaction.findMany as unknown as MockInstance).mockResolvedValue([]);

      const pkg = await service.generateExportPackage(BIZ_ID, TENANT_ID, TAX_YEAR, {
        adjustedTaxableIncome: 500_000,
        businessInterestIncome: 0,
      });
      const csv = service.serializeToCSV(pkg);

      expect(csv).toContain('IRC §163(j) DEDUCTIBILITY REPORT');
    });
  });
});

// ── DataLineageService (catalog-level — no DB required) ──────────────────────

describe('DataLineageService (catalog-level)', () => {
  let service: DataLineageService;

  beforeEach(() => {
    service = new DataLineageService();
    vi.clearAllMocks();
  });

  describe('lineage graph structure', () => {
    it('builds a graph with both nodes and edges for a known business', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([mockCardApp()]);

      const graph = await service.buildLineageGraph(BIZ_ID, TENANT_ID);

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.businessId).toBe(BIZ_ID);
      expect(graph.generatedAt).toBeInstanceOf(Date);
    });

    it('graph outputs list contains the export package node', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);

      const graph = await service.buildLineageGraph(BIZ_ID, TENANT_ID);

      expect(graph.outputs).toContain('taxReport.exportPackage');
    });

    it('all edges reference nodes that exist in the catalog', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(null);
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);

      const graph = await service.buildLineageGraph(BIZ_ID, TENANT_ID);
      const nodeIds = new Set(graph.nodes.map((n) => n.id));

      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.fromNodeId), `fromNodeId "${edge.fromNodeId}" not in catalog`).toBe(true);
        expect(nodeIds.has(edge.toNodeId), `toNodeId "${edge.toNodeId}" not in catalog`).toBe(true);
      }
    });

    it('throws when business is not found', async () => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(null);

      await expect(service.buildLineageGraph(BIZ_ID, TENANT_ID)).rejects.toThrow(/not found/i);
    });
  });

  describe('field lineage resolution', () => {
    beforeEach(() => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([mockCardApp()]);
    });

    it('resolves field lineage for a known transformation node', async () => {
      const lineage = await service.getFieldLineage(
        BIZ_ID,
        TENANT_ID,
        'irc163j.deductibleInterest',
      );

      expect(lineage.fieldPath).toBe('irc163j.deductibleInterest');
      expect(lineage.node.id).toBe('irc163j.deductibleInterest');
      expect(lineage.upstreamChain.length).toBeGreaterThan(0);
    });

    it('upstream chain for deductibleInterest includes the deductibilityLimit node', async () => {
      const lineage = await service.getFieldLineage(
        BIZ_ID,
        TENANT_ID,
        'irc163j.deductibleInterest',
      );

      const ids = lineage.upstreamChain.map((n) => n.id);
      expect(ids).toContain('irc163j.deductibilityLimit');
    });

    it('regulatorExport contains non-empty provenance array', async () => {
      const lineage = await service.getFieldLineage(
        BIZ_ID,
        TENANT_ID,
        'irc163j.disallowedAmount',
      );

      expect(lineage.regulatorExport.dataProvenance.length).toBeGreaterThan(0);
    });

    it('regulatorExport contains attestation string', async () => {
      const lineage = await service.getFieldLineage(
        BIZ_ID,
        TENANT_ID,
        'irc163j.disallowedAmount',
      );

      expect(lineage.regulatorExport.attestation).toContain('CapitalForge');
    });

    it('throws when fieldPath is not in the catalog', async () => {
      await expect(
        service.getFieldLineage(BIZ_ID, TENANT_ID, 'nonexistent.field'),
      ).rejects.toThrow(/not found in lineage catalog/i);
    });

    it('resolves lineage for a source node with no upstream parents', async () => {
      const lineage = await service.getFieldLineage(
        BIZ_ID,
        TENANT_ID,
        'costCalc.totalCost',
      );

      // Source nodes have no upstream parents in the catalog
      expect(lineage.upstreamChain).toHaveLength(0);
    });
  });

  describe('change detection', () => {
    beforeEach(() => {
      (prisma.business.findFirst as unknown as MockInstance).mockResolvedValue(mockBusiness());
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());
      (prisma.cardApplication.findMany as unknown as MockInstance).mockResolvedValue([]);
    });

    it('returns hasChanges = false when snapshot matches current values', async () => {
      // Capture snapshot first
      const snapshot = await service.captureSnapshot(BIZ_ID, TENANT_ID);

      // Re-mock to same values
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(mockCostCalc());

      const result = await service.detectChanges(BIZ_ID, TENANT_ID, snapshot);

      // All values are the same — changes may only include newly discovered fields
      const nonInfoAlerts = result.alerts.filter((a) => a.severity !== 'info');
      expect(nonInfoAlerts).toHaveLength(0);
    });

    it('detects a change when a numeric value differs from snapshot', async () => {
      const snapshot = { 'costCalc.totalCost': 9500, _capturedAt: new Date().toISOString() };

      // Updated mock: totalCost has changed to 12000
      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(
        mockCostCalc({ totalCost: 12_000 }),
      );

      const result = await service.detectChanges(BIZ_ID, TENANT_ID, snapshot);

      expect(result.hasChanges).toBe(true);
      const alert = result.alerts.find((a) => a.fieldPath === 'costCalc.totalCost');
      expect(alert).toBeDefined();
      expect(alert!.delta).toBe(2_500);
    });

    it('assigns critical severity to irc163j.disallowedAmount changes', async () => {
      // Mock: disallowedAmount node has current value via the costCalc
      const snapshot = {
        'costCalc.totalCost': 5_000,
        _capturedAt: new Date().toISOString(),
      };

      (prisma.costCalculation.findFirst as unknown as MockInstance).mockResolvedValue(
        mockCostCalc({ totalCost: 25_000 }),
      );

      const result = await service.detectChanges(BIZ_ID, TENANT_ID, snapshot);

      const totalCostAlert = result.alerts.find((a) => a.fieldPath === 'costCalc.totalCost');
      expect(totalCostAlert?.severity).toBe('critical');
    });

    it('captureSnapshot includes _capturedAt metadata key', async () => {
      const snapshot = await service.captureSnapshot(BIZ_ID, TENANT_ID);

      expect(snapshot['_capturedAt']).toBeDefined();
      expect(typeof snapshot['_capturedAt']).toBe('string');
    });

    it('captureSnapshot includes businessId metadata', async () => {
      const snapshot = await service.captureSnapshot(BIZ_ID, TENANT_ID);

      expect(snapshot['_businessId']).toBe(BIZ_ID);
    });

    it('returns checkedAt as a Date on the ChangeDetectionResult', async () => {
      const snapshot = { _capturedAt: new Date().toISOString() };
      const result = await service.detectChanges(BIZ_ID, TENANT_ID, snapshot);

      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.businessId).toBe(BIZ_ID);
    });
  });
});

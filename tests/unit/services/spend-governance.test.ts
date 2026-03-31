// ============================================================
// Unit Tests — Spend Governance & Business-Purpose Evidence
//
// Run standalone:
//   npx vitest run tests/unit/services/spend-governance.test.ts
//
// Coverage (27 tests):
//   SpendGovernanceService
//     MCC risk scoring            — known MCCs, cash-like range detection, unknown fallback
//     Transaction risk assessment — cash-like flags, suspicious rail, merchant-name patterns,
//                                   amount boosting, score threshold flagging
//     Transaction recording       — happy path, tenant isolation, cash-like event publishing,
//                                   high-risk event publishing
//     Transaction listing         — filters (mcc, flagged, isCashLike, date, amount), pagination
//     Risk summary                — aggregation, chargeback ratio, risk level determination
//   BusinessPurposeEvidenceService
//     Category resolution         — known categories, personal-use flag, disallowed categories
//     Transaction tagging         — happy path, empty-purpose rejection, tenant isolation
//     Invoice matching            — exact match, fuzzy match, missing doc, amount discrepancy
//     Network-rule compliance     — cash-like violation, personal-use violation, large unsubstantiated
//     Tax export                  — line generation, deductible amounts, 50% meals limit,
//                                   summary aggregation, missing evidence count
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  SpendGovernanceService,
  MCC_RISK_MAP,
  CASH_LIKE_MCC_RANGES,
} from '../../../src/backend/services/spend-governance.service.js';
import {
  BusinessPurposeEvidenceService,
  PERSONAL_USE_CATEGORIES,
  BUSINESS_PURPOSE_CATEGORIES,
} from '../../../src/backend/services/business-purpose-evidence.js';

// ── Fixtures ──────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-001';
const BUSINESS_ID = 'biz-test-001';
const TX_ID = 'tx-test-001';
const DOC_ID = 'doc-test-001';

function makeTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TX_ID,
    tenantId: TENANT_ID,
    businessId: BUSINESS_ID,
    cardApplicationId: null,
    amount: new Decimal('500.00'),
    merchantName: 'Acme Software LLC',
    mcc: '7372',
    mccCategory: 'technology',
    riskScore: 5,
    isCashLike: false,
    businessPurpose: 'Cloud infrastructure subscription',
    evidenceDocId: null,
    flagged: false,
    flagReason: null,
    transactionDate: new Date('2025-06-15T00:00:00Z'),
    createdAt: new Date('2025-06-15T10:00:00Z'),
    ...overrides,
  };
}

// ── Prisma mock factory ───────────────────────────────────────

function makePrismaMock() {
  return {
    business: {
      findFirst: vi.fn(),
    },
    spendTransaction: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    document: {
      findFirst: vi.fn(),
    },
  };
}

function makeEventBusMock() {
  return {
    publishAndPersist: vi.fn().mockResolvedValue(undefined),
  };
}

// ═══════════════════════════════════════════════════════════════
// SpendGovernanceService
// ═══════════════════════════════════════════════════════════════

describe('SpendGovernanceService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let service: SpendGovernanceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    service = new SpendGovernanceService(prisma as never, eventBus as never);
  });

  // ── MCC Risk Scoring ────────────────────────────────────────

  describe('scoreMcc', () => {
    it('scores ATM cash disbursement MCC 6011 as critical (95) and cash-like', () => {
      const result = service.scoreMcc('6011');
      expect(result.riskScore).toBe(95);
      expect(result.isCashLike).toBe(true);
      expect(result.category).toBe('cash_advance');
    });

    it('scores quasi-cash MCC 6051 as critical (98) with suspicious rail', () => {
      const result = service.scoreMcc('6051');
      expect(result.riskScore).toBe(98);
      expect(result.isCashLike).toBe(true);
      expect(result.suspiciousRail).toBe(true);
    });

    it('scores money transfer MCC 4829 as high-risk with suspicious rail', () => {
      const result = service.scoreMcc('4829');
      expect(result.riskScore).toBe(90);
      expect(result.isCashLike).toBe(true);
      expect(result.suspiciousRail).toBe(true);
    });

    it('scores technology MCC 7372 as low risk', () => {
      const result = service.scoreMcc('7372');
      expect(result.riskScore).toBe(5);
      expect(result.isCashLike).toBe(false);
      expect(result.category).toBe('technology');
    });

    it('detects cash-like MCC via numeric range check (6010–6012)', () => {
      // 6010 and 6012 in range but 6010 has direct mapping
      // Use a code only in the range but not directly mapped: 6010 is mapped, test range logic via 6012
      const result = service.scoreMcc('6012');
      expect(result.isCashLike).toBe(true);
    });

    it('returns low-moderate default (20) for unknown MCC', () => {
      const result = service.scoreMcc('9999');
      expect(result.riskScore).toBe(20);
      expect(result.isCashLike).toBe(false);
      expect(result.category).toBe('unclassified');
    });

    it('returns unknown profile for null MCC', () => {
      const result = service.scoreMcc(null);
      expect(result.riskScore).toBe(20);
      expect(result.isCashLike).toBe(false);
      expect(result.category).toBe('unknown');
    });

    it('returns unknown profile for undefined MCC', () => {
      const result = service.scoreMcc(undefined);
      expect(result.category).toBe('unknown');
    });
  });

  // ── Transaction Risk Assessment ─────────────────────────────

  describe('assessTransactionRisk', () => {
    it('flags cash-like MCC transactions with appropriate reason', () => {
      const result = service.assessTransactionRisk('6011', 500);
      expect(result.flagged).toBe(true);
      expect(result.isCashLike).toBe(true);
      expect(result.flagReason).toContain('Cash-like MCC 6011');
    });

    it('boosts risk score for large cash-like amounts (>$2000)', () => {
      const smallResult = service.assessTransactionRisk('6011', 100);
      const largeResult = service.assessTransactionRisk('6011', 2500);
      expect(largeResult.riskScore).toBeGreaterThan(smallResult.riskScore);
    });

    it('flags transactions above the risk score threshold (60)', () => {
      // MCC 7995 gambling scores 80
      const result = service.assessTransactionRisk('7995', 100);
      expect(result.flagged).toBe(true);
    });

    it('flags suspicious merchant names matching P2P/crypto patterns', () => {
      const result = service.assessTransactionRisk('5812', 200, 'Venmo Payment');
      expect(result.flagged).toBe(true);
      expect(result.flagReason).toContain('Venmo Payment');
      expect(result.suspiciousRail).toBe(true);
    });

    it('flags Coinbase as suspicious crypto rail merchant', () => {
      const result = service.assessTransactionRisk('5999', 1500, 'Coinbase Exchange');
      expect(result.suspiciousRail).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('does not flag low-risk technology spend', () => {
      const result = service.assessTransactionRisk('7372', 250, 'AWS Services');
      expect(result.flagged).toBe(false);
      expect(result.isCashLike).toBe(false);
      expect(result.mccCategory).toBe('technology');
    });

    it('includes suspicious rail flag in flag reason when applicable', () => {
      const result = service.assessTransactionRisk('4829', 1000);
      expect(result.flagReason).toContain('suspicious payment-rail routing');
    });
  });

  // ── Transaction Recording ───────────────────────────────────

  describe('recordTransaction', () => {
    it('records a normal business transaction and returns the persisted record', async () => {
      const txData = makeTx();
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme Inc' });
      prisma.spendTransaction.create.mockResolvedValue(txData);

      const result = await service.recordTransaction({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        amount: 500,
        mcc: '7372',
        merchantName: 'Acme Software LLC',
        businessPurpose: 'Cloud subscription',
        transactionDate: '2025-06-15T00:00:00Z',
      });

      expect(result.id).toBe(TX_ID);
      expect(prisma.spendTransaction.create).toHaveBeenCalledOnce();
      // No event should be published for non-flagged transaction
      expect(eventBus.publishAndPersist).not.toHaveBeenCalled();
    });

    it('throws when business is not found in tenant', async () => {
      prisma.business.findFirst.mockResolvedValue(null);

      await expect(
        service.recordTransaction({
          tenantId: TENANT_ID,
          businessId: 'nonexistent',
          amount: 100,
          transactionDate: '2025-06-15T00:00:00Z',
        }),
      ).rejects.toThrow('not found for tenant');
    });

    it('publishes spend.cash_like.detected event for ATM transaction', async () => {
      const cashTx = makeTx({ mcc: '6011', isCashLike: true, flagged: true, riskScore: 95 });
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme Inc' });
      prisma.spendTransaction.create.mockResolvedValue(cashTx);

      await service.recordTransaction({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        amount: 500,
        mcc: '6011',
        transactionDate: '2025-06-15T00:00:00Z',
      });

      expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
      const call = eventBus.publishAndPersist.mock.calls[0];
      expect(call[1].eventType).toBe('spend.cash_like.detected');
    });

    it('publishes risk.alert.raised event for high-risk non-cash-like transaction', async () => {
      // Gambling MCC 7995 is flagged but not cash-like
      const highRiskTx = makeTx({
        mcc: '7995',
        isCashLike: false,
        flagged: true,
        mccCategory: 'gambling',
        riskScore: 80,
      });
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
      prisma.spendTransaction.create.mockResolvedValue(highRiskTx);

      await service.recordTransaction({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        amount: 200,
        mcc: '7995',
        transactionDate: '2025-06-15T00:00:00Z',
      });

      expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
      const call = eventBus.publishAndPersist.mock.calls[0];
      expect(call[1].eventType).toBe('risk.alert.raised');
    });
  });

  // ── Transaction Listing & Filters ──────────────────────────

  describe('listTransactions', () => {
    beforeEach(() => {
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    });

    it('returns paginated transactions with defaults', async () => {
      const txList = [makeTx(), makeTx({ id: 'tx-002' })];
      prisma.spendTransaction.findMany.mockResolvedValue(txList);
      prisma.spendTransaction.count.mockResolvedValue(2);

      const result = await service.listTransactions(TENANT_ID, BUSINESS_ID);

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    it('passes flagged filter to query', async () => {
      prisma.spendTransaction.findMany.mockResolvedValue([]);
      prisma.spendTransaction.count.mockResolvedValue(0);

      await service.listTransactions(TENANT_ID, BUSINESS_ID, { flagged: true });

      const whereArg = prisma.spendTransaction.findMany.mock.calls[0][0].where;
      expect(whereArg['flagged']).toBe(true);
    });

    it('passes isCashLike filter to query', async () => {
      prisma.spendTransaction.findMany.mockResolvedValue([]);
      prisma.spendTransaction.count.mockResolvedValue(0);

      await service.listTransactions(TENANT_ID, BUSINESS_ID, { isCashLike: true });

      const whereArg = prisma.spendTransaction.findMany.mock.calls[0][0].where;
      expect(whereArg['isCashLike']).toBe(true);
    });

    it('caps pageSize at 200', async () => {
      prisma.spendTransaction.findMany.mockResolvedValue([]);
      prisma.spendTransaction.count.mockResolvedValue(0);

      const result = await service.listTransactions(TENANT_ID, BUSINESS_ID, { pageSize: 9999 });

      expect(result.pageSize).toBe(200);
    });

    it('throws when business not found', async () => {
      prisma.business.findFirst.mockResolvedValue(null);

      await expect(
        service.listTransactions(TENANT_ID, 'unknown-biz'),
      ).rejects.toThrow('not found for tenant');
    });
  });

  // ── Risk Summary ────────────────────────────────────────────

  describe('getRiskSummary', () => {
    beforeEach(() => {
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    });

    it('returns low risk level for all low-risk transactions', async () => {
      const txs = Array.from({ length: 5 }, (_, i) =>
        makeTx({ id: `tx-${i}`, riskScore: 5, isCashLike: false, flagged: false }),
      );
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const summary = await service.getRiskSummary(TENANT_ID, BUSINESS_ID);

      expect(summary.riskLevel).toBe('low');
      expect(summary.cashLikeCount).toBe(0);
      expect(summary.flaggedCount).toBe(0);
    });

    it('returns critical risk level when cash-like transactions are present', async () => {
      const txs = [
        makeTx({ isCashLike: true, flagged: true, riskScore: 95 }),
        makeTx({ id: 'tx-002' }),
      ];
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const summary = await service.getRiskSummary(TENANT_ID, BUSINESS_ID);

      expect(summary.riskLevel).toBe('critical');
      expect(summary.cashLikeCount).toBe(1);
    });

    it('computes correct chargeback ratio', async () => {
      const txs = [
        makeTx({ flagged: true }),
        makeTx({ id: 'tx-002', flagged: false }),
        makeTx({ id: 'tx-003', flagged: false }),
        makeTx({ id: 'tx-004', flagged: false }),
      ];
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const summary = await service.getRiskSummary(TENANT_ID, BUSINESS_ID);

      expect(summary.chargebackRatio).toBe(0.25); // 1 / 4
    });

    it('returns zero totals for empty transaction history', async () => {
      prisma.spendTransaction.findMany.mockResolvedValue([]);

      const summary = await service.getRiskSummary(TENANT_ID, BUSINESS_ID);

      expect(summary.totalTransactions).toBe(0);
      expect(summary.totalAmount).toBe(0);
      expect(summary.averageRiskScore).toBe(0);
      expect(summary.riskLevel).toBe('low');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// BusinessPurposeEvidenceService
// ═══════════════════════════════════════════════════════════════

describe('BusinessPurposeEvidenceService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: BusinessPurposeEvidenceService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new BusinessPurposeEvidenceService(prisma as never);
  });

  // ── Category Resolution ─────────────────────────────────────

  describe('resolvePurposeCategory', () => {
    it('resolves technology category correctly', () => {
      const cat = service.resolvePurposeCategory('technology');
      expect(cat?.taxCategory).toBe('office_expenses');
      expect(cat?.isDeductible).toBe(true);
      expect(cat?.scheduleC_line).toBe(22);
    });

    it('resolves meals_entertainment with 50% deductibility limit', () => {
      const cat = service.resolvePurposeCategory('meals_entertainment');
      expect(cat?.taxCategory).toBe('meals');
      expect(cat?.limitPercent).toBe(50);
      expect(cat?.requiresSubstantiation).toBe(true);
    });

    it('marks personal_likely as personal use', () => {
      const cat = service.resolvePurposeCategory('personal_likely');
      expect(cat?.isPersonalUse).toBe(true);
      expect(cat?.isDeductible).toBe(false);
    });

    it('marks cash_advance as disallowed', () => {
      const cat = service.resolvePurposeCategory('cash_advance');
      expect(cat?.isDisallowed).toBe(true);
      expect(cat?.isDeductible).toBe(false);
    });

    it('marks gambling as personal use and disallowed', () => {
      const cat = service.resolvePurposeCategory('gambling');
      expect(cat?.isPersonalUse).toBe(true);
      expect(cat?.isDisallowed).toBe(true);
    });

    it('marks entertainment as non-deductible (TCJA 2017)', () => {
      const cat = service.resolvePurposeCategory('entertainment');
      expect(cat?.isDeductible).toBe(false);
    });

    it('returns unclassified for null category', () => {
      const cat = service.resolvePurposeCategory(null);
      expect(cat).toBeNull();
    });
  });

  // ── Transaction Tagging ─────────────────────────────────────

  describe('tagTransaction', () => {
    it('tags a transaction with business purpose and returns category', async () => {
      const tx = makeTx();
      const updatedTx = makeTx({ businessPurpose: 'AWS cloud hosting Q2 2025' });
      prisma.spendTransaction.findFirst.mockResolvedValue(tx);
      prisma.spendTransaction.update.mockResolvedValue(updatedTx);

      const result = await service.tagTransaction({
        transactionId: TX_ID,
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        businessPurpose: 'AWS cloud hosting Q2 2025',
      });

      expect(result.purposeCategory?.taxCategory).toBe('office_expenses');
      expect(result.networkRuleViolation).toBe(false);
    });

    it('rejects empty businessPurpose', async () => {
      const tx = makeTx();
      prisma.spendTransaction.findFirst.mockResolvedValue(tx);

      await expect(
        service.tagTransaction({
          transactionId: TX_ID,
          tenantId: TENANT_ID,
          businessId: BUSINESS_ID,
          businessPurpose: '   ',
        }),
      ).rejects.toThrow('businessPurpose cannot be empty');
    });

    it('throws when transaction not found for business', async () => {
      prisma.spendTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.tagTransaction({
          transactionId: 'nonexistent',
          tenantId: TENANT_ID,
          businessId: BUSINESS_ID,
          businessPurpose: 'Some purpose',
        }),
      ).rejects.toThrow('not found for business');
    });
  });

  // ── Invoice Matching ────────────────────────────────────────

  describe('matchTransactionToInvoice', () => {
    it('returns none match when invoice document is not found in vault', async () => {
      prisma.spendTransaction.findFirst.mockResolvedValue(makeTx());
      prisma.document.findFirst.mockResolvedValue(null);

      const result = await service.matchTransactionToInvoice({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        transactionId: TX_ID,
        invoiceRef: 'inv-not-found',
      });

      expect(result.matched).toBe(false);
      expect(result.matchConfidence).toBe('none');
      expect(result.discrepancies[0]).toContain('not found in vault');
    });

    it('returns exact match when invoice metadata matches amount exactly', async () => {
      prisma.spendTransaction.findFirst.mockResolvedValue(makeTx({ amount: new Decimal('500.00') }));
      prisma.document.findFirst.mockResolvedValue({
        id: DOC_ID,
        metadata: { amount: 500, date: '2025-06-15' },
      });
      prisma.spendTransaction.update.mockResolvedValue(makeTx({ evidenceDocId: DOC_ID }));

      const result = await service.matchTransactionToInvoice({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        transactionId: TX_ID,
        invoiceRef: DOC_ID,
      });

      expect(result.matched).toBe(true);
      expect(result.matchConfidence).toBe('exact');
      expect(result.discrepancies).toHaveLength(0);
    });

    it('returns fuzzy match when amount is within tolerance', async () => {
      prisma.spendTransaction.findFirst.mockResolvedValue(makeTx({ amount: new Decimal('500.00') }));
      prisma.document.findFirst.mockResolvedValue({
        id: DOC_ID,
        metadata: { amount: 500.50 },
      });
      prisma.spendTransaction.update.mockResolvedValue(makeTx());

      const result = await service.matchTransactionToInvoice({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        transactionId: TX_ID,
        invoiceRef: DOC_ID,
        amountTolerance: 1.0,
      });

      expect(result.matched).toBe(true);
      expect(result.matchConfidence).toBe('fuzzy');
    });

    it('returns no match when amount exceeds tolerance', async () => {
      prisma.spendTransaction.findFirst.mockResolvedValue(makeTx({ amount: new Decimal('500.00') }));
      prisma.document.findFirst.mockResolvedValue({
        id: DOC_ID,
        metadata: { amount: 600 },
      });
      prisma.spendTransaction.update.mockResolvedValue(makeTx());

      const result = await service.matchTransactionToInvoice({
        tenantId: TENANT_ID,
        businessId: BUSINESS_ID,
        transactionId: TX_ID,
        invoiceRef: DOC_ID,
        amountTolerance: 1.0,
      });

      expect(result.matched).toBe(false);
      expect(result.matchConfidence).toBe('none');
      expect(result.discrepancies[0]).toContain('Amount mismatch');
    });
  });

  // ── Network-Rule Compliance ─────────────────────────────────

  describe('checkNetworkRuleCompliance', () => {
    it('flags cash-like transaction as network-rule violation', () => {
      const tx = makeTx({ isCashLike: true, mcc: '6011', mccCategory: 'cash_advance' });
      const result = service.checkNetworkRuleCompliance(tx as never);

      expect(result.isCompliant).toBe(false);
      expect(result.violations[0]).toContain('cash advances prohibited');
    });

    it('flags personal-use category without documented business purpose', () => {
      const tx = makeTx({
        isCashLike: false,
        mcc: '5411',
        mccCategory: 'personal_likely',
        businessPurpose: null,
        amount: new Decimal('250.00'),
      });
      const result = service.checkNetworkRuleCompliance(tx as never);

      expect(result.isCompliant).toBe(false);
      expect(result.violations.some((v) => v.includes('personal-use'))).toBe(true);
    });

    it('flags large unsubstantiated personal-likely transaction', () => {
      const tx = makeTx({
        mccCategory: 'personal_likely',
        isCashLike: false,
        businessPurpose: null,
        amount: new Decimal('350.00'),
      });
      const result = service.checkNetworkRuleCompliance(tx as never);

      expect(result.violations.some((v) => v.includes('business-purpose documentation'))).toBe(true);
    });

    it('clears compliance for a normal technology transaction', () => {
      const tx = makeTx();
      const result = service.checkNetworkRuleCompliance(tx as never);

      expect(result.isCompliant).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  // ── Tax Substantiation Export ───────────────────────────────

  describe('exportTaxSubstantiation', () => {
    beforeEach(() => {
      prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    });

    it('generates export lines for each transaction', async () => {
      const txs = [
        makeTx({ id: 'tx-001', mccCategory: 'technology', amount: new Decimal('300.00') }),
        makeTx({ id: 'tx-002', mccCategory: 'meals_entertainment', amount: new Decimal('100.00') }),
      ];
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const result = await service.exportTaxSubstantiation(
        TENANT_ID, BUSINESS_ID, '2025-01-01', '2025-12-31',
      );

      expect(result.lines).toHaveLength(2);
      expect(result.summary.totalTransactions).toBe(2);
      expect(result.summary.totalAmount).toBe(400);
    });

    it('applies 50% deductibility limit for meals_entertainment', async () => {
      const tx = makeTx({
        mccCategory: 'meals_entertainment',
        amount: new Decimal('200.00'),
        evidenceDocId: 'doc-receipt-001',
      });
      prisma.spendTransaction.findMany.mockResolvedValue([tx]);

      const result = await service.exportTaxSubstantiation(
        TENANT_ID, BUSINESS_ID, '2025-01-01', '2025-12-31',
      );

      const line = result.lines[0];
      expect(line.deductibleAmount).toBe(100); // 50% of $200
      expect(line.taxCategory).toBe('meals');
    });

    it('counts missing evidence for transactions requiring substantiation', async () => {
      const txs = [
        makeTx({ mccCategory: 'travel', evidenceDocId: null, businessPurpose: null }),
        makeTx({ id: 'tx-002', mccCategory: 'travel', evidenceDocId: 'doc-001', businessPurpose: null }),
      ];
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const result = await service.exportTaxSubstantiation(
        TENANT_ID, BUSINESS_ID, '2025-01-01', '2025-12-31',
      );

      // First tx has neither evidenceDocId nor businessPurpose — missing
      expect(result.summary.missingEvidenceCount).toBe(1);
      expect(result.summary.requiresSubstantiationCount).toBe(2);
    });

    it('accumulates category summary correctly', async () => {
      const txs = [
        makeTx({ id: 'tx-001', mccCategory: 'technology', amount: new Decimal('100.00') }),
        makeTx({ id: 'tx-002', mccCategory: 'technology', amount: new Decimal('200.00') }),
        makeTx({ id: 'tx-003', mccCategory: 'travel', amount: new Decimal('500.00') }),
      ];
      prisma.spendTransaction.findMany.mockResolvedValue(txs);

      const result = await service.exportTaxSubstantiation(
        TENANT_ID, BUSINESS_ID, '2025-01-01', '2025-12-31',
      );

      const techSummary = result.summary.byCategory['office_expenses'];
      expect(techSummary.count).toBe(2);
      expect(techSummary.totalAmount).toBe(300);
    });

    it('rejects invalid date range (start after end)', async () => {
      await expect(
        service.exportTaxSubstantiation(
          TENANT_ID, BUSINESS_ID, '2025-12-31', '2025-01-01',
        ),
      ).rejects.toThrow('startDate must be before endDate');
    });

    it('throws for business not found', async () => {
      prisma.business.findFirst.mockResolvedValue(null);

      await expect(
        service.exportTaxSubstantiation(TENANT_ID, 'bad-biz', '2025-01-01', '2025-12-31'),
      ).rejects.toThrow('not found for tenant');
    });
  });
});

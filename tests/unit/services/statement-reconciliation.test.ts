// ============================================================
// Unit Tests — Statement Reconciliation Engine
//
// Run standalone: npx vitest run tests/unit/services/statement-reconciliation.test.ts
//
// Coverage (25 tests):
//   A. StatementNormalizer
//      1.  Chase statement normalization (newBalance alias, date parsing)
//      2.  Amex statement normalization (minimumPaymentDue alias)
//      3.  Capital One normalization (totalFees alias)
//      4.  Citi normalization (totalInterestCharged alias)
//      5.  Unknown issuer fallback (slug derivation)
//      6.  Multi-currency detection + warning
//      7.  Partial statement detection (missing required fields)
//      8.  Duplicate transaction deduplication
//      9.  Amount parsing — formats: "$1,234.56", "(123.45)", "1.234,56"
//      10. Date parsing — MM/DD/YYYY, DD MMM YYYY, ISO
//      11. Available credit consistency check
//
//   B. Fee Anomaly Detection
//      12. Overlimit fee detection → high severity
//      13. Foreign transaction fee detection → medium severity
//      14. Duplicate charge detection → high severity
//      15. Fee spike detection (> 2× average)
//      16. No anomalies when fees are normal
//
//   C. Balance Mismatch Detection
//      17. Balance mismatch (> $0.50 tolerance) → flagged
//      18. Balance within tolerance → no anomaly
//      19. Missing previousBalance → skipped (no false positive)
//
//   D. StatementReconciliationService
//      20. ingestStatement — creates record, publishes events
//      21. ingestStatement — publishes anomaly event when anomalies detected
//      22. listStatements — returns paginated summaries
//      23. getStatementDetail — returns normalized data and anomalies
//      24. getAnomaliesForBusiness — filters by severity
//      25. reconcileStatement — marks reconciled, publishes event
//      26. reconcileStatement — throws when already reconciled
//
//   E. Email Parser Stub
//      27. Extracts fields from Chase email body
//      28. Identifies unrecognized email gracefully
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  StatementNormalizer,
  parseAmount,
  parseDate,
  type RawStatementData,
  type NormalizedStatement,
} from '../../../src/backend/services/statement-normalizer.js';
import {
  StatementReconciliationService,
  type StatementAnomaly,
} from '../../../src/backend/services/statement-reconciliation.service.js';

// ── Fixtures ──────────────────────────────────────────────────

const TENANT_ID = 'tenant-stmt-001';
const BUSINESS_ID = 'biz-stmt-001';
const STATEMENT_ID = 'stmt-001';

function makeStatementRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: STATEMENT_ID,
    tenantId: TENANT_ID,
    businessId: BUSINESS_ID,
    cardApplicationId: null,
    issuer: 'chase',
    statementDate: new Date('2026-01-31T00:00:00Z'),
    closingBalance: new Decimal('2500.00'),
    minimumPayment: new Decimal('25.00'),
    dueDate: new Date('2026-02-25T00:00:00Z'),
    interestCharged: new Decimal('0.00'),
    feesCharged: new Decimal('0.00'),
    sourceDocumentId: null,
    normalizedData: {},
    anomalies: [],
    reconciled: false,
    createdAt: new Date('2026-01-31T12:00:00Z'),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    business: {
      findFirst: vi.fn(),
    },
    statementRecord: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function makeEventBusMock() {
  return {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'event-001', publishedAt: new Date() }),
  };
}

// ── A. StatementNormalizer ────────────────────────────────────

describe('StatementNormalizer', () => {
  let normalizer: StatementNormalizer;

  beforeEach(() => {
    normalizer = new StatementNormalizer();
  });

  // Test 1 — Chase normalization
  it('normalizes Chase statement using newBalance alias and ISO date', () => {
    const raw: RawStatementData = {
      issuer: 'Chase',
      newBalance: '$2,500.00',
      previousBalance: '1800.00',
      minimumPayment: '25.00',
      dueDate: '02/25/2026',
      statementDate: '2026-01-31',
      interestCharged: '0.00',
      feesCharged: '95.00',
      creditLimit: '10000.00',
      availableCredit: '7500.00',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.issuer).toBe('chase');
    expect(result.closingBalance).toBe(2500.00);
    expect(result.previousBalance).toBe(1800.00);
    expect(result.minimumPayment).toBe(25.00);
    expect(result.dueDate).toBe('2026-02-25');
    expect(result.statementDate).toBe('2026-01-31');
    expect(result.feesCharged).toBe(95.00);
    expect(result.isPartial).toBe(false);
  });

  // Test 2 — Amex normalization
  it('normalizes Amex statement using minimumPaymentDue alias', () => {
    const raw: RawStatementData = {
      issuer: 'American Express',
      closingBalance: '4,200.00',
      minimumPaymentDue: '35.00',
      dueDate: '02/20/2026',
      statementDate: '01/25/2026',
      totalInterestCharged: '12.50',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.issuer).toBe('amex');
    expect(result.minimumPayment).toBe(35.00);
    expect(result.interestCharged).toBe(12.50);
    expect(result.closingBalance).toBe(4200.00);
  });

  // Test 3 — Capital One normalization
  it('normalizes Capital One statement using totalFees alias', () => {
    const raw: RawStatementData = {
      issuer: 'Capital One',
      closingBalance: '1750.00',
      minimumPayment: '18.00',
      dueDate: '03/01/2026',
      statementDate: '02/04/2026',
      totalFees: '39.00',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.issuer).toBe('capital_one');
    expect(result.feesCharged).toBe(39.00);
  });

  // Test 4 — Citi normalization
  it('normalizes Citi statement using totalInterestCharged alias', () => {
    const raw: RawStatementData = {
      issuer: 'Citibank',
      closingBalance: '3100.00',
      minimumPayment: '31.00',
      dueDate: '02-28-2026',
      statementDate: '01-31-2026',
      totalInterestCharged: '22.75',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.issuer).toBe('citi');
    expect(result.interestCharged).toBe(22.75);
    expect(result.dueDate).toBe('2026-02-28');
  });

  // Test 5 — Unknown issuer fallback
  it('slugifies unknown issuer names gracefully', () => {
    const raw: RawStatementData = {
      issuer: 'First National Bank',
      closingBalance: '500.00',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.issuer).toBe('first_national_bank');
  });

  // Test 6 — Multi-currency detection
  it('detects multi-currency transactions and sets hasMultiCurrency flag', () => {
    const raw: RawStatementData = {
      issuer: 'Chase',
      closingBalance: '2000.00',
      minimumPayment: '20.00',
      dueDate: '02/25/2026',
      statementDate: '2026-01-31',
      transactions: [
        { description: 'Restaurant NYC', amount: '50.00', date: '2026-01-10' },
        { description: 'Hotel Paris', amount: '€120.00', date: '2026-01-15' },
      ],
    };

    const result = normalizer.normalize(raw);

    expect(result.hasMultiCurrency).toBe(true);
    expect(result.warnings.some((w) => w.includes('EUR'))).toBe(true);
  });

  // Test 7 — Partial statement detection
  it('flags partial statement when multiple key fields are missing', () => {
    const raw: RawStatementData = {
      issuer: 'Chase',
      // No closingBalance, minimumPayment, or dueDate
      statementDate: '2026-01-31',
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.isPartial).toBe(true);
    expect(result.warnings.some((w) => w.includes('partial'))).toBe(true);
  });

  // Test 8 — Duplicate transaction deduplication
  it('removes duplicate transactions and warns about them', () => {
    const raw: RawStatementData = {
      issuer: 'Chase',
      closingBalance: '1000.00',
      minimumPayment: '10.00',
      dueDate: '02/25/2026',
      statementDate: '2026-01-31',
      transactions: [
        { description: 'Amazon', amount: '75.00', date: '2026-01-10' },
        { description: 'Amazon', amount: '75.00', date: '2026-01-10' }, // duplicate
        { description: 'Target', amount: '50.00', date: '2026-01-12' },
      ],
    };

    const result = normalizer.normalize(raw);

    expect(result.transactions).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  // Test 9 — Amount parsing edge cases
  it('parses diverse amount formats correctly', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('(123.45)')).toBe(-123.45);
    expect(parseAmount('1.234,56')).toBe(1234.56);   // European format
    expect(parseAmount('0.00')).toBe(0);
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(500)).toBe(500);
    expect(parseAmount('not-a-number')).toBeNull();
  });

  // Test 10 — Date parsing edge cases
  it('parses diverse date formats to ISO-8601', () => {
    expect(parseDate('01/31/2026')).toBe('2026-01-31');
    expect(parseDate('01-31-2026')).toBe('2026-01-31');
    expect(parseDate('2026-01-31')).toBe('2026-01-31');
    expect(parseDate('31 Jan 2026')).toBe('2026-01-31');
    expect(parseDate('01/31/26')).toBe('2026-01-31');
    expect(parseDate(null)).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
  });

  // Test 11 — Available credit consistency check
  it('warns when availableCredit does not match derived value', () => {
    const raw: RawStatementData = {
      issuer: 'Chase',
      closingBalance: '2000.00',
      minimumPayment: '20.00',
      dueDate: '02/25/2026',
      statementDate: '2026-01-31',
      creditLimit: '10000.00',
      availableCredit: '9000.00', // Should be 8000
      transactions: [],
    };

    const result = normalizer.normalize(raw);

    expect(result.warnings.some((w) => w.includes('Available credit mismatch'))).toBe(true);
  });
});

// ── B. Fee Anomaly Detection ──────────────────────────────────

describe('StatementReconciliationService — Fee Anomaly Detection', () => {
  let service: StatementReconciliationService;

  beforeEach(() => {
    const prisma = makePrismaMock() as never;
    const eventBus = makeEventBusMock() as never;
    service = new StatementReconciliationService(prisma, eventBus);
  });

  function makeNormalized(
    transactions: NormalizedStatement['transactions'],
    feesCharged?: number,
  ): NormalizedStatement {
    return {
      issuer: 'chase',
      statementDate: '2026-01-31',
      dueDate: '2026-02-25',
      closingBalance: 2500,
      previousBalance: 2000,
      minimumPayment: 25,
      interestCharged: 0,
      feesCharged: feesCharged ?? 0,
      creditLimit: 10000,
      availableCredit: 7500,
      rewardsEarned: null,
      transactions,
      currency: 'USD',
      isPartial: false,
      hasMultiCurrency: false,
      warnings: [],
    };
  }

  // Test 12 — Overlimit fee → high severity
  it('detects overlimit fee with high severity', () => {
    const normalized = makeNormalized([
      {
        description: 'Overlimit Fee',
        amount: 35,
        transactionDate: '2026-01-30',
        isFee: true,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
    ]);

    const anomalies = service.detectFeeAnomalies(normalized);

    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    const overlimit = anomalies.find((a) => a.type === 'overlimit_fee');
    expect(overlimit).toBeDefined();
    expect(overlimit?.severity).toBe('high');
  });

  // Test 13 — Foreign transaction fee → medium severity
  it('detects foreign transaction fee with medium severity', () => {
    const normalized = makeNormalized([
      {
        description: 'Foreign Transaction Fee',
        amount: 5.00,
        transactionDate: '2026-01-15',
        isFee: true,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
    ]);

    const anomalies = service.detectFeeAnomalies(normalized);

    const ftf = anomalies.find((a) => a.type === 'unexpected_fee' && a.description.includes('foreign'));
    expect(ftf).toBeDefined();
    expect(ftf?.severity).toBe('medium');
  });

  // Test 14 — Duplicate charge detection → high severity
  it('detects duplicate charges across non-fee transactions', () => {
    const normalized = makeNormalized([
      {
        description: 'Costco Wholesale',
        amount: 250.00,
        transactionDate: '2026-01-10',
        isFee: false,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
      {
        description: 'Costco Wholesale',
        amount: 250.00,
        transactionDate: '2026-01-10',
        isFee: false,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
    ]);

    const anomalies = service.detectFeeAnomalies(normalized);

    const dup = anomalies.find((a) => a.type === 'duplicate_charge');
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe('high');
    expect(dup?.amount).toBe(500.00); // 2 × 250
  });

  // Test 15 — Fee spike detection
  it('detects a fee spike when one fee is more than 2× the average', () => {
    const normalized = makeNormalized([
      {
        description: 'Late Fee',
        amount: 29,
        transactionDate: '2026-01-05',
        isFee: true,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
      {
        description: 'Annual Fee',
        amount: 95,
        transactionDate: '2026-01-01',
        isFee: true,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
      // Spike: 300 vs avg of (29+95+300)/3 = 141.33 → 300 > 2×141.33? No, but 300 > 2×62 (avg of first two)
      // Let's use a real spike: avg of 29 and 95 = 62, spike = 200 > 2*62=124 ✓
      {
        description: 'Penalty Fee',
        amount: 200,
        transactionDate: '2026-01-20',
        isFee: true,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
    ]);

    const anomalies = service.detectFeeAnomalies(normalized);

    // At least one spike anomaly should be detected
    const spike = anomalies.find((a) => a.type === 'fee_spike');
    expect(spike).toBeDefined();
    expect(spike?.type).toBe('fee_spike');
  });

  // Test 16 — No anomalies with normal fees
  it('returns no fee anomalies for a clean statement', () => {
    const normalized = makeNormalized([
      {
        description: 'Whole Foods Market',
        amount: 120.00,
        transactionDate: '2026-01-08',
        isFee: false,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
      {
        description: 'Southwest Airlines',
        amount: 300.00,
        transactionDate: '2026-01-12',
        isFee: false,
        isCashAdvance: false,
        isInterest: false,
        currency: 'USD',
      },
    ]);

    const anomalies = service.detectFeeAnomalies(normalized);

    expect(anomalies).toHaveLength(0);
  });
});

// ── C. Balance Mismatch Detection ────────────────────────────

describe('StatementReconciliationService — Balance Mismatch Detection', () => {
  let service: StatementReconciliationService;

  beforeEach(() => {
    const prisma = makePrismaMock() as never;
    const eventBus = makeEventBusMock() as never;
    service = new StatementReconciliationService(prisma, eventBus);
  });

  function makeBalance(overrides: Partial<NormalizedStatement>): NormalizedStatement {
    return {
      issuer: 'chase',
      statementDate: '2026-01-31',
      dueDate: '2026-02-25',
      closingBalance: 2500,
      previousBalance: 2000,
      minimumPayment: 25,
      interestCharged: 0,
      feesCharged: 0,
      creditLimit: 10000,
      availableCredit: 7500,
      rewardsEarned: null,
      transactions: [
        {
          description: 'Office Depot',
          amount: 500,
          transactionDate: '2026-01-10',
          isFee: false,
          isCashAdvance: false,
          isInterest: false,
          currency: 'USD',
        },
      ],
      currency: 'USD',
      isPartial: false,
      hasMultiCurrency: false,
      warnings: [],
      ...overrides,
    };
  }

  // Test 17 — Balance mismatch detected
  it('flags balance mismatch when expected ≠ reported (delta > $0.50)', () => {
    // previousBalance=2000 + charges=500 - payments=0 + interest=0 + fees=0 = 2500 (correct)
    // Let's create a mismatch: change closingBalance to 2800
    const normalized = makeBalance({ closingBalance: 2800 });

    const anomalies = service.detectBalanceMismatch(normalized);

    expect(anomalies.length).toBe(1);
    expect(anomalies[0].type).toBe('balance_mismatch');
    expect(anomalies[0].amount).toBeCloseTo(300, 1);
  });

  // Test 18 — Balance within tolerance — no anomaly
  it('does not flag balance mismatch when within $0.50 tolerance', () => {
    // previousBalance=2000 + charges=500 = expected 2500, reported 2500.30 (within tolerance)
    const normalized = makeBalance({ closingBalance: 2500.30 });

    const anomalies = service.detectBalanceMismatch(normalized);

    expect(anomalies).toHaveLength(0);
  });

  // Test 19 — Missing previousBalance — check skipped
  it('skips balance mismatch check when previousBalance is missing', () => {
    const normalized = makeBalance({ previousBalance: null });

    const anomalies = service.detectBalanceMismatch(normalized);

    expect(anomalies).toHaveLength(0);
  });
});

// ── D. StatementReconciliationService (full service) ─────────

describe('StatementReconciliationService — Service Methods', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;
  let service: StatementReconciliationService;

  beforeEach(() => {
    prisma = makePrismaMock();
    eventBus = makeEventBusMock();
    service = new StatementReconciliationService(
      prisma as never,
      eventBus as never,
    );
  });

  // Test 20 — ingestStatement creates record and publishes events
  it('ingestStatement creates a StatementRecord and publishes STATEMENT_INGESTED', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme LLC' });
    prisma.statementRecord.create.mockResolvedValue(makeStatementRecord());

    const result = await service.ingestStatement({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      rawData: {
        issuer: 'Chase',
        newBalance: '2500.00',
        previousBalance: '2000.00',
        minimumPayment: '25.00',
        dueDate: '02/25/2026',
        statementDate: '2026-01-31',
        interestCharged: '0.00',
        feesCharged: '0.00',
        transactions: [],
      },
    });

    expect(result.statementRecordId).toBe(STATEMENT_ID);
    expect(result.normalized.issuer).toBe('chase');
    expect(prisma.statementRecord.create).toHaveBeenCalledOnce();
    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'statement.ingested' }),
    );
  });

  // Test 21 — ingestStatement publishes anomaly event when anomalies found
  it('ingestStatement publishes STATEMENT_ANOMALY_DETECTED when anomalies exist', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID, legalName: 'Acme LLC' });
    prisma.statementRecord.create.mockResolvedValue(makeStatementRecord());

    await service.ingestStatement({
      tenantId: TENANT_ID,
      businessId: BUSINESS_ID,
      rawData: {
        issuer: 'Chase',
        newBalance: '9000.00', // mismatch: prev=2000, charges=500 → expected 2500, not 9000
        previousBalance: '2000.00',
        minimumPayment: '25.00',
        dueDate: '02/25/2026',
        statementDate: '2026-01-31',
        transactions: [
          { description: 'Office Supplies', amount: '500.00', date: '2026-01-10' },
        ],
      },
    });

    const calls = eventBus.publishAndPersist.mock.calls;
    const anomalyCall = calls.find(
      (c: unknown[]) =>
        (c[1] as Record<string, unknown>)?.eventType === 'statement.anomaly.detected',
    );
    expect(anomalyCall).toBeDefined();
  });

  // Test 22 — listStatements returns paginated summaries
  it('listStatements returns paginated statements with totals', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    const mockRecord = makeStatementRecord();
    prisma.$transaction.mockResolvedValue([[mockRecord], 1]);

    const { statements, total } = await service.listStatements(
      TENANT_ID, BUSINESS_ID, 50, 0,
    );

    expect(total).toBe(1);
    expect(statements).toHaveLength(1);
    expect(statements[0].id).toBe(STATEMENT_ID);
    expect(statements[0].issuer).toBe('chase');
    expect(statements[0].closingBalance).toBe(2500);
    expect(statements[0].reconciled).toBe(false);
  });

  // Test 23 — getStatementDetail returns normalized data and anomalies
  it('getStatementDetail returns record with normalized data and anomalies', async () => {
    const mockAnomaly: StatementAnomaly = {
      type: 'balance_mismatch',
      severity: 'high',
      description: 'Test mismatch',
      amount: 150,
      transactionRef: null,
    };
    const mockRecord = makeStatementRecord({
      normalizedData: { issuer: 'chase', closingBalance: 2500, transactions: [] },
      anomalies: [mockAnomaly],
    });
    prisma.statementRecord.findFirst.mockResolvedValue(mockRecord);

    const { record, normalized, anomalies } = await service.getStatementDetail(
      TENANT_ID, STATEMENT_ID,
    );

    expect(record).toBeDefined();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('balance_mismatch');
    expect(normalized).toBeDefined();
  });

  // Test 24 — getAnomaliesForBusiness with severity filter
  it('getAnomaliesForBusiness returns only anomalies matching severity filter', async () => {
    prisma.business.findFirst.mockResolvedValue({ id: BUSINESS_ID });
    prisma.statementRecord.findMany.mockResolvedValue([
      makeStatementRecord({
        anomalies: [
          { type: 'balance_mismatch', severity: 'critical', description: 'Big mismatch', amount: 500 },
          { type: 'unexpected_fee', severity: 'medium', description: 'Unexpected fee', amount: 15 },
        ],
      }),
    ]);

    const reports = await service.getAnomaliesForBusiness(TENANT_ID, BUSINESS_ID, 'critical');

    expect(reports).toHaveLength(1);
    expect(reports[0].anomalies).toHaveLength(1);
    expect(reports[0].anomalies[0].severity).toBe('critical');
  });

  // Test 25 — reconcileStatement marks reconciled and publishes event
  it('reconcileStatement updates record to reconciled and publishes STATEMENT_RECONCILED', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue(
      makeStatementRecord({ reconciled: false }),
    );
    prisma.statementRecord.update.mockResolvedValue(
      makeStatementRecord({ reconciled: true }),
    );

    const result = await service.reconcileStatement({
      tenantId: TENANT_ID,
      statementId: STATEMENT_ID,
      reconciledBy: 'user-advisor-001',
      notes: 'Verified against bank records.',
    });

    expect(result.reconciled).toBe(true);
    expect(result.statementId).toBe(STATEMENT_ID);
    expect(prisma.statementRecord.update).toHaveBeenCalledWith({
      where: { id: STATEMENT_ID },
      data: { reconciled: true },
    });
    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'statement.reconciled' }),
    );
  });

  // Test 26 — reconcileStatement throws when already reconciled
  it('reconcileStatement throws when statement is already reconciled', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue(
      makeStatementRecord({ reconciled: true }),
    );

    await expect(
      service.reconcileStatement({
        tenantId: TENANT_ID,
        statementId: STATEMENT_ID,
        reconciledBy: 'user-advisor-001',
      }),
    ).rejects.toThrow('already reconciled');
  });
});

// ── E. Email Parser Stub ──────────────────────────────────────

describe('StatementReconciliationService — Email Parser Stub', () => {
  let service: StatementReconciliationService;

  beforeEach(() => {
    const prisma = makePrismaMock() as never;
    const eventBus = makeEventBusMock() as never;
    service = new StatementReconciliationService(prisma, eventBus);
  });

  // Test 27 — Extracts fields from a Chase email body
  it('extracts statement fields from a Chase email body', () => {
    const emailBody = `
      From: Chase <no-reply@chase.com>

      Your January 2026 Statement is Ready

      New Balance: $2,500.00
      Minimum Payment Due: $25.00
      Payment Due Date: 02/25/2026
      Statement Date: 01/31/2026
      Credit Limit: $10,000.00
      Available Credit: $7,500.00
    `;

    const result = service.parseEmailStatement(emailBody, 'no-reply@chase.com');

    expect(result.recognized).toBe(true);
    expect(result.issuer).toBe('Chase');
    expect(result.extractedFields.closingBalance).toBeDefined();
    expect(result.extractedFields.minimumPayment).toBeDefined();
    expect(result.extractedFields.dueDate).toBeDefined();
    expect(result.matchedPatterns).toContain('sender_domain:chase.com');
  });

  // Test 28 — Unrecognized email returns graceful result
  it('returns recognized=false for an unrecognized email body', () => {
    const emailBody = 'Hey, just checking in. How are you doing?';

    const result = service.parseEmailStatement(emailBody);

    expect(result.recognized).toBe(false);
    expect(result.issuer).toBeNull();
    expect(result.notes.some((n) => n.includes('did not match'))).toBe(true);
  });
});

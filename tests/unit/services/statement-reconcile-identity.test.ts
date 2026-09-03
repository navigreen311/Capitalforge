// ============================================================
// Who reconciled a statement, and what makes two statements the same one
//
// `statement_records` recorded reconciliation as a boolean. `reconcileStatement`
// computed a `reconciledAt`, returned it, and put it — with `reconciledBy` and
// the notes — into a ledger event published AFTER and OUTSIDE the update that
// flipped the flag. So the only record of who signed off could fail to exist
// while the statement stayed reconciled, and no read would ever say so.
//
// The route defaulted the actor to `'system'`, which recorded an advisor's
// attestation against a machine that reviewed nothing. Same shape as the
// consent revoke that recorded the wrong actor.
//
// And nothing made a statement unique. Ingesting one twice made two records,
// two ledger events, and doubled every anomaly on the business report — so an
// agent retrying a timeout doubled a client's month.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StatementReconciliationService,
  UnattributedReconciliationError,
  StatementAlreadyReconciledError,
  StatementNotFoundError,
  BusinessNotFoundError,
} from '../../../src/backend/services/statement-reconciliation.service.js';

const TENANT = 'tenant-1';
const BUSINESS = 'biz-1';

function makePrisma() {
  return {
    business: { findFirst: vi.fn().mockResolvedValue({ id: BUSINESS, legalName: 'Acme' }) },
    statementRecord: {
      create: vi.fn().mockResolvedValue({ id: 'stmt-new' }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

const eventBus = { publishAndPersist: vi.fn().mockResolvedValue({ id: 'e1', publishedAt: new Date() }) };

let prisma: ReturnType<typeof makePrisma>;
let service: StatementReconciliationService;

beforeEach(() => {
  vi.clearAllMocks();
  prisma = makePrisma();
  eventBus.publishAndPersist.mockResolvedValue({ id: 'e1', publishedAt: new Date() });
  service = new StatementReconciliationService(prisma as never, eventBus as never);
});

const RAW = {
  issuer: 'Chase',
  statementDate: '2026-01-31',
  closingBalance: 2500,
  previousBalance: 2000,
  minimumPayment: 25,
  interestCharged: 0,
  feesCharged: 0,
  transactions: [],
};

describe('reconciling without an actor', () => {
  it('is refused rather than attributed to "system"', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue({ id: 's-1', reconciled: false });

    await expect(
      service.reconcileStatement({ tenantId: TENANT, statementId: 's-1', reconciledBy: 'system' }),
    ).rejects.toBeInstanceOf(UnattributedReconciliationError);

    await expect(
      service.reconcileStatement({ tenantId: TENANT, statementId: 's-1', reconciledBy: '' }),
    ).rejects.toBeInstanceOf(UnattributedReconciliationError);

    expect(prisma.statementRecord.update).not.toHaveBeenCalled();
  });

  it('refuses before reading the statement, so an absent actor is not a 404', async () => {
    // The order matters for what the caller is told to fix.
    await expect(
      service.reconcileStatement({ tenantId: TENANT, statementId: 's-1', reconciledBy: '' }),
    ).rejects.toBeInstanceOf(UnattributedReconciliationError);

    expect(prisma.statementRecord.findFirst).not.toHaveBeenCalled();
  });
});

describe('the errors this service throws', () => {
  it('are typed, so a route need not match on message text', async () => {
    prisma.business.findFirst.mockResolvedValue(null);
    await expect(
      service.ingestStatement({ tenantId: TENANT, businessId: BUSINESS, rawData: RAW }),
    ).rejects.toBeInstanceOf(BusinessNotFoundError);

    prisma.statementRecord.findFirst.mockResolvedValue(null);
    await expect(
      service.reconcileStatement({ tenantId: TENANT, statementId: 's-1', reconciledBy: 'u-1' }),
    ).rejects.toBeInstanceOf(StatementNotFoundError);

    prisma.statementRecord.findFirst.mockResolvedValue({ id: 's-1', reconciled: true });
    await expect(
      service.reconcileStatement({ tenantId: TENANT, statementId: 's-1', reconciledBy: 'u-1' }),
    ).rejects.toBeInstanceOf(StatementAlreadyReconciledError);
  });

  it('do not name the tenant in the message a caller is shown', async () => {
    // These read `Business <id> not found for tenant <tenantId>` and the route
    // returned the message verbatim in the 404 body, handing a caller an id
    // belonging to the account boundary itself.
    prisma.business.findFirst.mockResolvedValue(null);

    const err: unknown = await service
      .ingestStatement({ tenantId: TENANT, businessId: BUSINESS, rawData: RAW })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BusinessNotFoundError);
    const { message } = err as Error;
    expect(message).not.toContain(TENANT);
    expect(message).toContain(BUSINESS);
  });
});

describe('ingesting the same period twice', () => {
  it('supersedes the earlier record instead of adding a second one', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue({ id: 'stmt-old', reconciled: false });

    const result = await service.ingestStatement({
      tenantId: TENANT,
      businessId: BUSINESS,
      rawData: RAW,
    });

    expect(result.supersededStatementRecordId).toBe('stmt-old');
    expect(prisma.statementRecord.update).toHaveBeenCalledWith({
      where: { id: 'stmt-old' },
      data: { supersededAt: expect.any(Date), supersededById: 'stmt-new' },
    });
  });

  it('looks for the previous record by account, issuer and period', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue(null);

    await service.ingestStatement({ tenantId: TENANT, businessId: BUSINESS, rawData: RAW });

    const [{ where }] = prisma.statementRecord.findFirst.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toMatchObject({
      tenantId: TENANT,
      businessId: BUSINESS,
      issuer: 'chase',
      // Only against the live row — a superseded one is already replaced.
      supersededAt: null,
    });
    expect(where.statementDate).toBeInstanceOf(Date);
  });

  it('says when the record it replaced had already been signed off', async () => {
    // The attestation does not carry over. Somebody reviewed the earlier
    // figures; nobody has reviewed these.
    prisma.statementRecord.findFirst.mockResolvedValue({ id: 'stmt-old', reconciled: true });

    const result = await service.ingestStatement({
      tenantId: TENANT,
      businessId: BUSINESS,
      rawData: RAW,
    });

    expect(result.supersededReconciledStatement).toBe(true);
  });

  it('reports no supersession on a first import', async () => {
    prisma.statementRecord.findFirst.mockResolvedValue(null);

    const result = await service.ingestStatement({
      tenantId: TENANT,
      businessId: BUSINESS,
      rawData: RAW,
    });

    expect(result.supersededStatementRecordId).toBeNull();
    expect(result.supersededReconciledStatement).toBe(false);
    expect(prisma.statementRecord.update).not.toHaveBeenCalled();
  });
});

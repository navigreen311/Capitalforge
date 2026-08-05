// ============================================================
// Compliance findings — resolution
//
// `ComplianceCheck.resolvedAt` has existed, and been read in three places,
// since the column was added. Nothing ever wrote it. So every finding this
// system has raised stayed open for ever: the compliance overview counted
// `openFindings` over rows that could never leave that set, and the sweep
// reported `resolved: null` because a count of resolutions would have been
// invented in the same way the rest of that endpoint once was.
//
// The model: a finding is resolved when the next check of the same kind, for
// the same business, comes back below the level that raised it. These pin the
// judgments in that sentence — especially the ones about when it must *not*
// resolve.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceService } from '../../../src/backend/services/compliance.service';

function makePrismaMock(resolvedCount = 0) {
  return {
    complianceCheck: {
      create: vi.fn().mockResolvedValue({ id: 'check-001' }),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: resolvedCount }),
    },
    business: { findFirst: vi.fn().mockResolvedValue({ id: 'biz-001' }) },
  };
}

/** A UDAP check whose text drives the risk level. */
const CLEAN_TEXT =
  'We offer transparent business financing with clear terms and full disclosures.';
const EGREGIOUS_TEXT =
  'Guaranteed approval! No credit check! Everyone is approved instantly, act now before it is too late!';

let mock: ReturnType<typeof makePrismaMock>;
let service: ComplianceService;

beforeEach(() => {
  mock = makePrismaMock();
  service = new ComplianceService(mock as never);
});

describe('a clean check closes what it cleared', () => {
  it('resolves earlier high and critical findings for the same business and type', async () => {
    const result = await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'udap',
      interactionText: CLEAN_TEXT,
    });

    expect(mock.complianceCheck.updateMany).toHaveBeenCalledOnce();
    const where = mock.complianceCheck.updateMany.mock.calls[0]![0].where;

    expect(where.businessId).toBe('biz-001');
    expect(where.checkType).toBe('udap');
    expect(where.riskLevel).toEqual({ in: ['high', 'critical'] });
    // Only ones still open — resolving an already-resolved row would restamp
    // a date somebody may be relying on.
    expect(where.resolvedAt).toBeNull();
    expect(result.resolvedFindings).toBe(0);
  });

  it('reports how many it closed', async () => {
    mock = makePrismaMock(3);
    service = new ComplianceService(mock as never);

    const result = await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'udap',
      interactionText: CLEAN_TEXT,
    });

    expect(result.resolvedFindings).toBe(3);
  });

  it('never resolves the row it just wrote', async () => {
    await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'udap',
      interactionText: CLEAN_TEXT,
    });

    const where = mock.complianceCheck.updateMany.mock.calls[0]![0].where;
    expect(where.NOT).toEqual({ id: expect.any(String) });
  });

  it('does not reach across check types', async () => {
    // A clean KYB says nothing about an open UDAP finding. Resolving across
    // types would close findings nobody re-examined.
    await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'kyb',
    });

    if (mock.complianceCheck.updateMany.mock.calls.length > 0) {
      expect(mock.complianceCheck.updateMany.mock.calls[0]![0].where.checkType).toBe('kyb');
    }
  });
});

describe('a check that did not clear resolves nothing', () => {
  it('leaves findings open when the risk is still high', async () => {
    const result = await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'udap',
      interactionText: EGREGIOUS_TEXT,
    });

    expect(['high', 'critical']).toContain(result.riskLevel);
    expect(mock.complianceCheck.updateMany).not.toHaveBeenCalled();
    expect(result.resolvedFindings).toBe(0);
  });

  it('leaves findings open when the check could not run', async () => {
    // `unknown` is an absence of evidence, not a pass. Closing a finding on it
    // would be a clean bill of health issued by a check that never happened —
    // the same defect as scoring an unscreened vendor as low risk.
    const result = await service.runComplianceCheck({
      businessId: 'biz-001',
      tenantId: 'tenant-001',
      checkType: 'vendor',
      vendorId: 'vendor-001',
    });

    expect(result.riskLevel).toBe('unknown');
    expect(mock.complianceCheck.updateMany).not.toHaveBeenCalled();
    expect(result.resolvedFindings).toBe(0);
  });
});

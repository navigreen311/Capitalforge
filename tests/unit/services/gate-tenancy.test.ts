// ============================================================
// Every submission gate scopes its own query
//
// businessId always arrives as `application.businessId` from a row already
// proven to be the caller's, and checkAll is the only entry point. That was
// true and it was an argument about every call site rather than a property of
// any query — one call site away from being false, with nothing failing when
// it changes.
//
// These gates decide whether an application may be submitted. A gate passing
// on another business's acknowledgment is a wrong DECISION, not a disclosure,
// and application-truthfulness-v1 describes them as controls that hold.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationGateChecker } from '../../../src/backend/services/application-gates.js';

const TENANT = 'tenant-1';
const BUSINESS = 'biz-1';
const APP = 'app-1';

const ackFindFirst = vi.fn();
const consentFindFirst = vi.fn();
const suitabilityFindFirst = vi.fn();
const ownerFindMany = vi.fn();
const applicationFindUnique = vi.fn();
const complianceFindFirst = vi.fn();

function checker() {
  return new ApplicationGateChecker({
    productAcknowledgment: { findFirst: ackFindFirst },
    consentRecord: { findFirst: consentFindFirst, findMany: vi.fn().mockResolvedValue([]) },
    suitabilityCheck: { findFirst: suitabilityFindFirst },
    businessOwner: { findMany: ownerFindMany },
    cardApplication: { findUnique: applicationFindUnique },
    complianceCheck: { findFirst: complianceFindFirst },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  ackFindFirst.mockResolvedValue({ id: 'a-1', signedAt: new Date() });
  consentFindFirst.mockResolvedValue({ id: 'c-1' });
  suitabilityFindFirst.mockResolvedValue({ noGoTriggered: false, overriddenBy: null, score: 90 });
  ownerFindMany.mockResolvedValue([{ id: 'o-1', kycStatus: 'verified', firstName: 'A', lastName: 'B' }]);
  applicationFindUnique.mockResolvedValue({ consentCapturedAt: new Date() });
  complianceFindFirst.mockResolvedValue({ riskLevel: 'low', resolvedAt: new Date() });
});

/** The tenant reached directly or through the business relation. */
function isScoped(where: Record<string, unknown>): boolean {
  return (
    where['tenantId'] === TENANT
    || (where['business'] as { tenantId?: string } | undefined)?.tenantId === TENANT
  );
}

describe('each gate scopes its own query', () => {
  it('product reality', async () => {
    await checker().checkProductRealityAcknowledged(BUSINESS, TENANT);
    const [{ where }] = ackFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(isScoped(where)).toBe(true);
  });

  it('consent captured', async () => {
    await checker().checkConsentCaptured(APP, BUSINESS, TENANT);
    const [{ where }] = consentFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(isScoped(where)).toBe(true);
  });

  it('suitability passed', async () => {
    await checker().checkSuitabilityPassed(BUSINESS, TENANT);
    const [{ where }] = suitabilityFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(isScoped(where)).toBe(true);
  });

  it('kyb/kyc verified — the tenant was already a parameter and unused', async () => {
    await checker().checkKybKycVerified(BUSINESS, TENANT);
    const [{ where }] = ownerFindMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(isScoped(where)).toBe(true);
  });

  it('cu membership disclosure — inert, and scoped anyway', async () => {
    // Gate 6 cannot fire: checkAll runs it only for issuerType
    // 'credit_union', and CardApplication has an issuer NAME and no issuer
    // TYPE column, so nothing can produce that value. Scoped regardless,
    // because the day something wires it up is not the day to remember this.
    await checker().checkCuMembershipDisclosure(APP, BUSINESS, TENANT);
    const [{ where }] = ackFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(isScoped(where)).toBe(true);
  });
});

describe('checkAll passes the tenant to every gate', () => {
  it('so a new call site cannot reintroduce the gap', async () => {
    await checker().checkAll(APP, BUSINESS, TENANT, {
      createdByUserId: 'maker',
      approverUserId: 'checker',
    });

    for (const [name, fn] of Object.entries({
      productAcknowledgment: ackFindFirst,
      consentRecord: consentFindFirst,
      suitabilityCheck: suitabilityFindFirst,
      businessOwner: ownerFindMany,
    })) {
      const [{ where }] = fn.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(isScoped(where), name).toBe(true);
    }
  });
});

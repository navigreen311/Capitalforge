// ============================================================
// POST /applications/:id/submit runs the same gates as the status path
//
// There were two ways to reach `submitted`. The status path
// (PUT /applications/:id/status) ran ApplicationGateChecker.checkAll — six
// gates including maker_checker and kyb_kyc. The route actually named "submit"
// ran three inline checks of its own and neither of those two.
//
// specification.md §1 states "maker-checker on submit" as a property of the
// system. It was a property of the other path.
//
// Nothing failed when the inline block was replaced with checkAll, because
// nothing tested this route's gates. That is why this file exists: the change
// that removed the divergence was invisible to the suite that was supposed to
// notice it.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';
const APP_ID = 'app-1';
const BUSINESS_ID = 'biz-1';
const MAKER = 'user-maker';
const CHECKER = 'user-checker';

const applicationFindFirst = vi.fn();
const applicationFindUnique = vi.fn();
const applicationUpdate = vi.fn();
const ackFindMany = vi.fn();
const consentFindMany = vi.fn();
const consentFindFirst = vi.fn();
const suitabilityFindFirst = vi.fn();
const complianceFindFirst = vi.fn();
const ownerFindMany = vi.fn();
const auditCreate = vi.fn();
// The create path. These tests are the first in this file to drive it - the
// harness was built for /submit, which only ever updates.
const applicationCreate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    cardApplication: {
      findFirst: applicationFindFirst,
      findUnique: applicationFindUnique,
      update: applicationUpdate,
      create: applicationCreate,
    },
    productAcknowledgment: { findMany: ackFindMany, findFirst: vi.fn().mockResolvedValue({ id: 'ack-1', signedAt: new Date() }) },
    consentRecord: { findMany: consentFindMany, findFirst: consentFindFirst },
    suitabilityCheck: { findFirst: suitabilityFindFirst },
    complianceCheck: { findFirst: complianceFindFirst },
    businessOwner: { findMany: ownerFindMany },
    auditLog: { create: auditCreate },
    business: { findFirst: vi.fn().mockResolvedValue({ id: BUSINESS_ID, tenantId: TENANT }) },
    $on: vi.fn(),
  })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@backend/events/event-bus.js', () => ({
  eventBus: { publishAndPersist: vi.fn().mockResolvedValue(undefined), publish: vi.fn() },
  EventBus: { reset: vi.fn() },
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const router = (await import('@backend/api/routes/applications.routes.js'))
    .default as unknown as import('express').Router;

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: CHECKER, role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', router);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();

  applicationCreate.mockResolvedValue({
    id: APP_ID,
    businessId: BUSINESS_ID,
    status: 'draft',
    submittedAt: null,
    creditLimit: null,
    fundingRoundId: null,
    issuer: 'chase',
    cardProduct: 'ink-business-preferred',
    business: { id: BUSINESS_ID, legalName: 'Acme' },
    fundingRound: null,
    createdAt: new Date(),
  });

  // A draft whose maker is recorded, and whose every other gate passes.
  applicationFindFirst.mockResolvedValue({
    id: APP_ID,
    businessId: BUSINESS_ID,
    status: 'draft',
    createdByUserId: MAKER,
    adverseActionNotice: { createdByUserId: MAKER },
    business: { id: BUSINESS_ID, legalName: 'Acme', tenantId: TENANT },
  });
  applicationUpdate.mockResolvedValue({
    id: APP_ID,
    status: 'submitted',
    business: { id: BUSINESS_ID, legalName: 'Acme' },
    fundingRound: null,
  });
  // The consent gate reads the per-application timestamp, which the
  // `pending_consent` transition stamps. That is a real sequencing requirement
  // the inline checks did not have: a draft that never captured consent per
  // application now fails `consent_captured` with a reason saying so, instead
  // of passing on a business-level consent record of any channel.
  applicationFindUnique.mockResolvedValue({ consentCapturedAt: new Date() });
  ackFindMany.mockResolvedValue([{ acknowledgmentType: 'product_reality', signedAt: new Date() }]);
  consentFindMany.mockResolvedValue([{ consentType: 'tcpa', status: 'active' }]);
  consentFindFirst.mockResolvedValue({ id: 'c-1' });
  suitabilityFindFirst.mockResolvedValue({ noGoTriggered: false, overriddenBy: null, score: 90 });
  complianceFindFirst.mockResolvedValue({ riskLevel: 'low', resolvedAt: new Date() });
  ownerFindMany.mockResolvedValue([{ id: 'o-1', kycStatus: 'verified', firstName: 'A', lastName: 'B' }]);
  auditCreate.mockResolvedValue({});
});

/** Every declaration confirmed, by id. */
const ALL_DECLARED = {
  consent_verified: true,
  product_reality_signed: true,
  no_misrepresentation: true,
  business_purpose_legitimate: true,
};

function submit(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/applications/${APP_ID}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ declarations: ALL_DECLARED, ...body }),
  });
}

interface Body {
  // `message` is asserted on the create-path refusal, which names the route that
  // does gate. Absent here, the assertion was a type error rather than a failing
  // test, so the whole Lint & Type Check job stopped before any test ran.
  error?: { code: string; message?: string; details?: { failedGates?: string[] } };
}

describe('maker-checker on POST /applications/:id/submit', () => {
  it('refuses a submission with no approver named', async () => {
    // The gate this route did not have. Burkham's compliance library says no
    // agent submits; this is the control that enforces it.
    const res = await submit({});
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.details?.failedGates).toContain('maker_checker');
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it('refuses self-approval', async () => {
    const res = await submit({ approvedByUserId: MAKER });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.details?.failedGates).toContain('maker_checker');
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it('submits when a different user approves and every other gate passes', async () => {
    const res = await submit({ approvedByUserId: CHECKER });

    expect(res.status).toBe(200);
    expect(applicationUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('the other gates the inline checks did not run', () => {
  it('refuses a draft that never captured per-application consent', async () => {
    applicationFindUnique.mockResolvedValue({ consentCapturedAt: null });

    const res = await submit({ approvedByUserId: CHECKER });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.details?.failedGates).toContain('consent_captured');
  });

  it('refuses when no beneficial owner is KYC verified', async () => {
    // kyb_kyc — absent from this route entirely before.
    ownerFindMany.mockResolvedValue([{ id: 'o-1', kycStatus: 'pending', firstName: 'A', lastName: 'B' }]);

    const res = await submit({ approvedByUserId: CHECKER });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.details?.failedGates).toContain('kyb_kyc');
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it('names the reason per gate, not only the gate', async () => {
    // "maker_checker" alone does not tell an advisor whether they forgot an
    // approver or named themselves.
    const res = await submit({ approvedByUserId: MAKER });
    const body = (await res.json()) as { error?: { details?: { issues?: { gate: string; reason?: string }[] } } };

    const issue = body.error?.details?.issues?.find((i) => i.gate === 'maker_checker');
    expect(issue?.reason).toMatch(/different user|self-approval/i);
  });
});

describe('the four declarations, by name', () => {
  it('refuses a positional array of booleans', async () => {
    // `[1, 'yes', {}, []]` used to pass: the check was `length >= 4 &&
    // every(Boolean)`. A positional array cannot say WHICH thing was confirmed
    // — reorder the checkboxes and the same payload attests to different
    // things.
    const res = await submit({ declarations: [true, true, true, true] });
    const body = (await res.json()) as { error?: { code: string } };

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('DECLARATIONS_REQUIRED');
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it('names the declaration that was not confirmed', async () => {
    const res = await submit({
      declarations: { ...ALL_DECLARED, no_misrepresentation: false },
      approvedByUserId: CHECKER,
    });
    const body = (await res.json()) as {
      error?: { code: string; details?: { missing?: { id: string; text: string }[] } };
    };

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('DECLARATIONS_INCOMPLETE');
    // The id AND the wording. The sentence is the attestation.
    expect(body.error?.details?.missing?.[0]?.id).toBe('no_misrepresentation');
    expect(body.error?.details?.missing?.[0]?.text).toMatch(/misrepresentation/i);
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it('refuses a declaration that is truthy but not true', async () => {
    const res = await submit({
      declarations: { ...ALL_DECLARED, consent_verified: 'yes' },
      approvedByUserId: CHECKER,
    });

    expect(res.status).toBe(422);
    expect(applicationUpdate).not.toHaveBeenCalled();
  });
});

describe('consentCapturedAt', () => {
  it('is not written on submit', async () => {
    // It was set to `new Date()` here, so the gate read it, passed, and this
    // write destroyed the value that satisfied it — the field recording when
    // consent was captured recorded when the application was submitted, for
    // every application ever submitted through this route.
    await submit({ approvedByUserId: CHECKER });

    const [{ data }] = applicationUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.status).toBe('submitted');
    expect(data.submittedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('consentCapturedAt');
  });
});

describe('a missing maker names itself', () => {
  it('does not report an absent creator as an absent approver', async () => {
    // The approver branch was tested first and a missing maker arrived as '',
    // so this said "No approver specified" to somebody who had supplied one —
    // on the gate that enforces "no agent submits". A refusal naming the wrong
    // cause sends people to fix the thing that was never broken.
    applicationFindFirst.mockResolvedValue({
      id: APP_ID,
      businessId: BUSINESS_ID,
      status: 'draft',
      createdByUserId: null,
      adverseActionNotice: {},
      business: { id: BUSINESS_ID, legalName: 'Acme', tenantId: TENANT },
    });

    const res = await submit({ approvedByUserId: CHECKER });
    const body = (await res.json()) as {
      error?: { details?: { issues?: { gate: string; reason?: string }[] } };
    };

    const issue = body.error?.details?.issues?.find((i) => i.gate === 'maker_checker');
    expect(res.status).toBe(422);
    expect(issue?.reason).toMatch(/no recorded creator/i);
    expect(issue?.reason).not.toMatch(/No approver specified/i);
  });
});

// ============================================================
// POST /applications refuses to create one already submitted
//
// The third route to `submitted`, and the last one running controls of its own.
// It read consent records and product acknowledgments into `hasConsent` and
// `hasAck` and never read either variable, so an application could be created
// submitted with no consent on file and no product-reality acknowledgment. Its
// suitability read carried no tenantId and ignored `overriddenBy`, so an
// overridden no-go passed on /submit and blocked here.
//
// It is refused rather than gated: three of the gates key on an application id,
// and per-application consent is captured against an application that exists.
// See docs/decisions/submit-application.md entry 1.
// ============================================================

describe('POST /applications — submission is a separate act', () => {
  function create(body: Record<string, unknown>) {
    return fetch(`${baseUrl}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: BUSINESS_ID,
        issuer: 'chase',
        cardProduct: 'ink-business-preferred',
        ...body,
      }),
    });
  }

  it('refuses status: submitted, and names the route that gates', async () => {
    const res = await create({ status: 'submitted', declarations: ALL_DECLARED });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('SUBMIT_IS_A_SEPARATE_ACT');
    expect(body.error?.message).toContain('/submit');
  });

  it('refuses it even with every declaration confirmed', async () => {
    // The inline block asked for four declarations and then let the application
    // through with no consent and no acknowledgment. Confirming the declarations
    // was the whole of its gate, so a caller who satisfied it satisfied nothing.
    const res = await create({ status: 'submitted', declarations: ALL_DECLARED });

    expect(res.status).toBe(422);
  });

  it('still creates a draft', async () => {
    const res = await create({});

    expect([200, 201]).toContain(res.status);
  });
});

// ============================================================
// The credit-union tripwire
//
// cu_membership_disclosure is declared required for credit-union issuers and its
// gate cannot fire — CardApplication has an issuer NAME and no issuer TYPE. Six
// credit unions are on file as active placement targets offering business cards,
// so the first CU placement would pass with five gates green and the sixth never
// running: a required disclosure skipped in silence.
//
// The refusal is not the fix. It turns the silent pass into a loud one while the
// compliance question is open — docs/decisions/submit-application.md entry 5.
// ============================================================

describe('a credit-union placement is refused while its gate cannot run', () => {
  /** The issuer lives on the application, not in the request. */
  function applicationWithIssuer(issuer: string) {
    const current = applicationFindFirst.getMockImplementation?.();
    void current;
    applicationFindFirst.mockResolvedValueOnce({
      id: APP_ID,
      businessId: BUSINESS_ID,
      status: 'draft',
      issuer,
      createdByUserId: MAKER,
      adverseActionNotice: { createdByUserId: MAKER },
      business: { id: BUSINESS_ID, legalName: 'Acme', tenantId: TENANT },
    });
  }

  it('refuses when the issuer resolves to a credit union', async () => {
    applicationWithIssuer('Navy Federal Credit Union');
    const res = await submit({ approvedByUserId: 'user-approver' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE');
  });

  it('resolves an alias, not just the exact name', async () => {
    applicationWithIssuer('navy_federal');
    const res = await submit({ approvedByUserId: 'user-approver' });
    const body = (await res.json()) as Body;

    expect(body.error?.code).toBe('CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE');
  });

  // THE COVERAGE QUESTION, WHICH THE ALIAS TEST ABOVE DOES NOT ASK.
  //
  // The first version of this control used `parseIssuer`, which resolves the six
  // credit unions in the catalogue and returns null for everything else. It had a
  // passing test - the one above - and the test passed while the control leaked,
  // because it exercised the alias list rather than what happens to a credit union
  // that is not on it.
  //
  // These are ordinary names, not edge cases. Every one of them walked past the
  // control as originally approved.
  it.each([
    'Golden 1 Credit Union',
    'Star One Credit Union',
    'Some Random FCU',
  ])('refuses %s - a credit union outside the catalogue', async (issuer) => {
    applicationWithIssuer(issuer);
    const res = await submit({ approvedByUserId: 'user-approver' });
    const body = (await res.json()) as Body;

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe('CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE');
  });

  it('documents what still gets past it: a bare CU suffix', async () => {
    // isCreditUnionIssuerName's last resort is
    //   normalised.includes('creditunion') || normalised.endsWith('fcu')
    // so "Redwood CU" is not recognised. This test asserts the CURRENT behaviour
    // rather than the desired one, so that closing the gap breaks it deliberately
    // and whoever closes it reads why.
    //
    // A resolver over a free-text column cannot be complete. An issuerType column,
    // or resolution against the CreditUnion table at write time, is what makes it
    // total - see docs/decisions/submit-application.md entry 5.
    applicationWithIssuer('Redwood CU');
    const res = await submit({ approvedByUserId: 'user-approver' });
    const body = (await res.json()) as Body;

    expect(body.error?.code).not.toBe('CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE');
  });

  it('does not refuse a bank issuer', async () => {
    applicationWithIssuer('chase');
    const res = await submit({ approvedByUserId: 'user-approver' });
    const body = (await res.json()) as Body;

    expect(body.error?.code).not.toBe('CU_MEMBERSHIP_DISCLOSURE_UNENFORCEABLE');
  });
});

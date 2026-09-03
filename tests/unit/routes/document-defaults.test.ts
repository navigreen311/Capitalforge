// ============================================================
// A missing field renders as a bracket, not as a claim
//
// Thirty-five fields across eleven templates fell back to a statement rather
// than a placeholder. Three shapes:
//
//   ASSERTED PROVENANCE — the consent confirmation letter defaulted the method
//   of consent to 'Electronic signature via client portal', the consent date to
//   today, the channels to 'Voice, SMS, Email', and the consent reference to
//   'CST-' + Date.now(). That last one is an invented evidence pointer: a
//   client given a reference number that resolves to nothing.
//
//   ASSERTED STATE — a progress report defaulting to 'On track' and 'Stable',
//   an incident report defaulting to 'Under investigation', a reconsideration
//   letter defaulting the reason a LENDER declined to 'too many recent
//   inquiries'. A progress report that defaults to on-track is a fabricated
//   document, not a fabricated field.
//
//   SAMPLE IDENTITIES — 'Acme Holdings LLC', 'John Smith', 'Chase' in letters
//   addressed to issuers.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

const TENANT = 'tenant-1';

const consentFindMany = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({ $on: vi.fn() })),
  Prisma: { DbNull: Symbol('DbNull') },
}));

vi.mock('@backend/config/database.js', () => ({
  prisma: {
    consentRecord: { findMany: consentFindMany },
    business: { findFirst: vi.fn() },
    $on: vi.fn(),
  },
}));

vi.mock('@backend/middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const express = (await import('express')).default;
  const { documentGenRouter } = await import('@backend/api/routes/document-gen.routes.js');
  const { setPrismaClient } = await import('@backend/services/consent.service.js');
  const { prisma } = await import('@backend/config/database.js');
  setPrismaClient(prisma as never);

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenant = { tenantId: TENANT, userId: 'u-1', role: 'advisor', permissions: [] };
    next();
  });
  app.use('/api', documentGenRouter);

  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  consentFindMany.mockResolvedValue([
    {
      id: 'c-1',
      channel: 'sms',
      consentType: 'tcpa',
      status: 'active',
      grantedAt: new Date('2026-03-04'),
      revokedAt: null,
      evidenceRef: 'call-recording-8871',
    },
  ]);
});

function generate(document_type: string, context: Record<string, unknown> = {}) {
  return fetch(`${baseUrl}/api/documents/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_type, context }),
  });
}

interface Body {
  success: boolean;
  data?: { text: string };
  error?: { code: string; message: string };
}

async function textOf(document_type: string, context: Record<string, unknown> = {}) {
  const res = await generate(document_type, context);
  const body = (await res.json()) as Body;
  return { status: res.status, text: body.data?.text ?? '', error: body.error };
}

describe('the consent confirmation letter', () => {
  it('states the channels, dates and evidence reference actually recorded', async () => {
    const { status, text } = await textOf('consent_confirmation_letter', {
      business_id: 'biz-1',
      client_name: 'Acme Holdings LLC',
    });

    expect(status).toBe(200);
    expect(text).toMatch(/sms \(tcpa\): active, recorded 2026-03-04/);
    expect(text).toMatch(/Evidence reference: call-recording-8871/);
  });

  it('does not assert how consent was obtained, because nothing records it', async () => {
    // The finding behind the default. `ConsentRecord` holds channel,
    // consentType, status, grantedAt, ipAddress, evidenceRef and metadata.
    // There is no method column anywhere in the schema, and `consent_method`
    // appears in exactly one place in the codebase — the string this letter
    // used to print.
    const { text } = await textOf('consent_confirmation_letter', { business_id: 'biz-1' });

    expect(text).toMatch(/Consent Method: \[not recorded\]/);
    expect(text).not.toMatch(/Electronic signature via client portal/);
    expect(text).toMatch(/does not record the METHOD/);
  });

  it('does not invent an evidence reference', async () => {
    // `'CST-' + Date.now().toString(36)` gave a client a reference number that
    // resolves to nothing. evidenceRef is the field that carries proof.
    consentFindMany.mockResolvedValue([
      {
        id: 'c-1',
        channel: 'email',
        consentType: 'tcpa',
        status: 'active',
        grantedAt: new Date('2026-03-04'),
        revokedAt: null,
        evidenceRef: null,
      },
    ]);

    const { text } = await textOf('consent_confirmation_letter', { business_id: 'biz-1' });

    expect(text).toMatch(/Evidence reference: \[not recorded\]/);
    expect(text).not.toMatch(/CST-/);
  });

  it('does not default the channels to all three', async () => {
    // `?? 'Voice, SMS, Email'` told a client they had consented to voice, SMS
    // and email when nobody had said so — on the letter that is their record
    // of what they agreed to.
    const { text } = await textOf('consent_confirmation_letter', { business_id: 'biz-1' });

    expect(text).not.toMatch(/Voice, SMS, Email/);
  });

  it('refuses when no consent is recorded, rather than confirming one', async () => {
    consentFindMany.mockResolvedValue([]);

    const { status, error } = await textOf('consent_confirmation_letter', {
      business_id: 'biz-1',
    });

    expect(status).toBe(422);
    expect(error?.code).toBe('DOCUMENT_CONTEXT_REQUIRED');
    expect(error?.message).toMatch(/nothing to confirm/);
  });

  it('refuses without a business to read', async () => {
    const { status, error } = await textOf('consent_confirmation_letter', {});

    expect(status).toBe(422);
    expect(error?.code).toBe('BUSINESS_ID_REQUIRED');
  });
});

describe('asserted state', () => {
  it('leaves a progress report empty rather than reporting progress', async () => {
    const { text } = await textOf('client_progress_report');

    expect(text).toMatch(/\[payment performance\]/);
    expect(text).toMatch(/\[score change\]/);
    expect(text).toMatch(/\[funding status\]/);
    expect(text).toMatch(/\[delinquencies\]/);
    expect(text).not.toMatch(/On track|Stable|progressing well|Program enrollment completed/);
  });

  it('leaves an incident report unresolved rather than under investigation', async () => {
    const { text } = await textOf('compliance_incident_report');

    expect(text).toMatch(/\[root cause\]/);
    expect(text).toMatch(/\[remediation\]/);
    expect(text).toMatch(/\[affected clients\]/);
    expect(text).not.toMatch(/Under investigation|None identified|corrective actions pending/);
  });

  it('does not state why a lender declined', async () => {
    // A fact about a third party's decision, asserted in a letter sent back to
    // that third party.
    const { text } = await textOf('decline_reconsideration_letter');

    expect(text).toMatch(/\[decline reason\]/);
    expect(text).not.toMatch(/too many recent inquiries/);
  });

  it('does not state what a call was about or what was decided', async () => {
    const { text } = await textOf('advisor_call_summary');

    expect(text).toMatch(/\[call type\]/);
    expect(text).toMatch(/\[key decisions\]/);
    expect(text).not.toMatch(/Strategy Session|No major decisions recorded/);
  });
});

describe('sample identities', () => {
  it('are gone from the letters that go to issuers', async () => {
    for (const type of [
      'decline_reconsideration_letter',
      'application_cover_letter',
      'business_purpose_statement',
    ]) {
      const { text } = await textOf(type);
      expect(text, type).not.toMatch(/Acme Holdings LLC|John Smith|Ink Business/);
      expect(text, type).toMatch(/\[Business\]|\[Applicant\]|\[Card\]/);
    }
  });

  it('do not name an issuer nobody named', async () => {
    const { text } = await textOf('decline_reconsideration_letter');

    expect(text).toMatch(/\[Issuer\] Reconsideration Department/);
    expect(text).not.toMatch(/Chase Reconsideration Department/);
  });

  it('do not assert years in business in a letter to an issuer', async () => {
    const { text } = await textOf('application_cover_letter');

    expect(text).toMatch(/\[years in business\]/);
  });
});

describe('the business purpose statement, which the client signs', () => {
  it('does not assert the client can service the obligations', async () => {
    // Surfaced by keying the figure rule per generator: one route-level
    // allowlist entry had been covering this and the APR letter together.
    const { text } = await textOf('business_purpose_statement');

    expect(text).toMatch(/\[repayment basis/);
    expect(text).not.toMatch(/generates sufficient monthly cash flow/);
  });

  it('prints the basis when one is supplied', async () => {
    const { text } = await textOf('business_purpose_statement', {
      repayment_basis: 'Q3 receivables of $180,000 against a $40,000 draw.',
    });

    expect(text).toMatch(/Q3 receivables of \$180,000/);
    expect(text).not.toMatch(/\[repayment basis/);
  });
});

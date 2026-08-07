// ============================================================
// When a document was signed, and when we heard about it
//
// The webhook handler computed one timestamp for both:
//
//   const ts = timestamp ?? new Date().toISOString();
//
// So for any DocuSign payload that arrived without a date — and the fields are
// optional in their schema — "when was this signed?" answered "just now". On a
// signature record that is not a rounding error; it is an invented fact about
// the execution of a document, and nothing downstream could tell it from a
// real one.
//
// These assert the two times are kept apart, and that an unreported one stays
// unreported.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DocuSignService } from '../../src/backend/services/docusign.service';

const prisma = new PrismaClient();
// The client is first, Prisma second. Passing Prisma as the first argument
// ran fine — the service falls back to the shared client and the shared
// Prisma, so the assertions still hit the right database — and `tsc` rejected
// it. A test that works for the wrong reason is one refactor from working for
// none.
const svc = new DocuSignService(undefined, prisma);

const SUFFIX = `ds-${process.pid}-${Date.now()}`;
let tenantId: string;
let businessId: string;

/** A contract document carrying an envelope id, as the webhook matches on. */
async function documentFor(envelopeId: string) {
  return prisma.document.create({
    data: {
      tenantId,
      businessId,
      title: `Agreement ${envelopeId}`,
      documentType: 'contract',
      storageKey: `test/${envelopeId}.pdf`,
      metadata: { envelopeId },
    },
  });
}

const meta = (doc: { metadata: unknown }) => doc.metadata as Record<string, unknown>;

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `DS ${SUFFIX}`, slug: `ds-${SUFFIX}` } })).id;
  businessId = (
    await prisma.business.create({
      data: { tenantId, legalName: `DS Co ${SUFFIX}`, entityType: 'llc' },
    })
  ).id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('when DocuSign reports a time', () => {
  it('records the reported time, not the time we processed it', async () => {
    const envelopeId = `env-reported-${SUFFIX}`;
    const doc = await documentFor(envelopeId);
    const signedAt = '2026-02-14T09:15:00.000Z';

    await svc.handleWebhookCompletion(envelopeId, 'completed', signedAt);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(meta(row).completedAt).toBe(signedAt);
    expect(meta(row).timestampSource).toBe('docusign');
  });

  it('keeps our recording time separately', async () => {
    const envelopeId = `env-both-${SUFFIX}`;
    const doc = await documentFor(envelopeId);
    const signedAt = '2026-02-14T09:15:00.000Z';

    await svc.handleWebhookCompletion(envelopeId, 'completed', signedAt);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    // Both facts are worth having, and they are different facts. A webhook
    // replayed a week late must not move the signing date.
    expect(meta(row).completedAt).toBe(signedAt);
    expect(meta(row).recordedAt).not.toBe(signedAt);
    expect(new Date(meta(row).recordedAt as string).getTime()).toBeGreaterThan(
      new Date(signedAt).getTime(),
    );
  });
});

describe('when DocuSign reports no time', () => {
  it('does not invent one', async () => {
    // The defect, exactly. This used to write `completedAt: <now>`, which is
    // indistinguishable from a document signed this second.
    const envelopeId = `env-unreported-${SUFFIX}`;
    const doc = await documentFor(envelopeId);

    await svc.handleWebhookCompletion(envelopeId, 'completed', undefined);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(meta(row).completedAt).toBeUndefined();
  });

  it('says the absence is unreported rather than pending', async () => {
    // Without this, a missing `completedAt` reads as a record that has not
    // been updated yet — which is a third meaning nobody wants.
    const envelopeId = `env-unreported2-${SUFFIX}`;
    const doc = await documentFor(envelopeId);

    await svc.handleWebhookCompletion(envelopeId, 'completed', undefined);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(meta(row).timestampSource).toBe('unreported');
    expect(meta(row).signatureStatus).toBe('signed');
    // We still know when we heard, which is the honest half of what was being
    // conflated.
    expect(meta(row).recordedAt).toBeTruthy();
  });
});

describe('declined and voided behave the same way', () => {
  it('records a reported decline time', async () => {
    const envelopeId = `env-declined-${SUFFIX}`;
    const doc = await documentFor(envelopeId);

    await svc.handleWebhookCompletion(envelopeId, 'declined', '2026-02-15T10:00:00.000Z');

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(meta(row).declinedAt).toBe('2026-02-15T10:00:00.000Z');
    expect(meta(row).signatureStatus).toBe('declined');
  });

  it('invents no void time', async () => {
    const envelopeId = `env-voided-${SUFFIX}`;
    const doc = await documentFor(envelopeId);

    await svc.handleWebhookCompletion(envelopeId, 'voided', undefined);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(meta(row).voidedAt).toBeUndefined();
    expect(meta(row).timestampSource).toBe('unreported');
  });
});

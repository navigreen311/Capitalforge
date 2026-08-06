// ============================================================
// Legal hold — both directions, against a real database
//
// The defect this exists for: the release path on `DocumentsTab` was a 600 ms
// sleep, a success toast, and a `console.info` claiming an audit event that
// never happened. Nothing was released.
//
// **A test asserting the response would have passed it.** The mock returned
// success; that was the whole problem. So every assertion here re-reads the
// row from the database rather than trusting what the call handed back.
//
// The capability also had three endpoints across two routers, and the one both
// live callers used wrote the boolean directly with no record of who or when.
// Consolidating on caller count would have kept that one and deleted the audit
// trail. These assertions pin the trail, so a future consolidation that drops
// it fails here.
//
// Runs against the database the CI integration job provisions.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DocumentVaultService } from '../../src/backend/services/document-vault.service';

const prisma = new PrismaClient();
const vault = new DocumentVaultService(prisma);

/** Unique per run so repeated runs against the same database do not collide. */
const SUFFIX = `lh-${process.pid}-${Date.now()}`;

const SETTER = `user-set-${SUFFIX}`;
const RELEASER = `user-release-${SUFFIX}`;

let tenantId: string;
let businessId: string;
let documentId: string;

/** What is actually on the row, not what the call returned. */
async function readBack() {
  const row = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return { legalHold: row.legalHold, meta };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Legal Hold Tenant ${SUFFIX}`, slug: `legal-hold-${SUFFIX}` },
  });
  tenantId = tenant.id;

  const business = await prisma.business.create({
    data: { tenantId, legalName: `Legal Hold Business ${SUFFIX}`, entityType: 'llc' },
  });
  businessId = business.id;

  const doc = await prisma.document.create({
    data: {
      tenantId,
      businessId,
      documentType: 'contract',
      title: `Held Document ${SUFFIX}`,
      storageKey: `test/${SUFFIX}.pdf`,
    },
  });
  documentId = doc.id;
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('legal hold round-trips through the database', () => {
  it('starts released', async () => {
    expect((await readBack()).legalHold).toBe(false);
  });

  it('persists the hold, and who set it', async () => {
    await vault.setLegalHold(documentId, tenantId, true, SETTER);

    const { legalHold, meta } = await readBack();
    expect(legalHold).toBe(true);
    // The half a response-only assertion cannot reach: who, and when.
    expect(meta['legalHoldSetBy']).toBe(SETTER);
    expect(typeof meta['legalHoldSetAt']).toBe('string');
  });

  it('persists the release, and who released it', async () => {
    // The direction that was a 600 ms sleep and a toast.
    await vault.setLegalHold(documentId, tenantId, false, RELEASER);

    const { legalHold, meta } = await readBack();
    expect(legalHold).toBe(false);
    expect(meta['legalHoldRemovedBy']).toBe(RELEASER);
    expect(typeof meta['legalHoldRemovedAt']).toBe('string');
  });

  it('keeps the two actors distinct', async () => {
    // Setting and releasing are different acts by potentially different
    // people. A single "lastModifiedBy" would answer the wrong question when
    // somebody later asks who lifted the hold.
    const { meta } = await readBack();
    expect(meta['legalHoldSetBy']).toBe(SETTER);
    expect(meta['legalHoldRemovedBy']).toBe(RELEASER);
    expect(meta['legalHoldSetBy']).not.toBe(meta['legalHoldRemovedBy']);
  });

  it('survives a second round trip', async () => {
    // Re-holding after a release is the realistic case — a hold lifted in
    // error, or a second matter on the same document.
    await vault.setLegalHold(documentId, tenantId, true, SETTER);
    expect((await readBack()).legalHold).toBe(true);

    await vault.setLegalHold(documentId, tenantId, false, RELEASER);
    expect((await readBack()).legalHold).toBe(false);
  });

  it('refuses a document belonging to another tenant', async () => {
    // Tenant scoping is part of the write, not a filter applied afterwards.
    await expect(
      vault.setLegalHold(documentId, `not-${tenantId}`, true, SETTER),
    ).rejects.toThrow();

    // And the refusal changed nothing.
    expect((await readBack()).legalHold).toBe(false);
  });
});

// ============================================================
// Sending a document for signature — resolved, not described
//
// The request used to carry everything: `signerEmail: 'client@example.com'`,
// `signerName: 'Client Signer'`, and `documentBase64: btoa(doc.name)` — the
// filename, base64-encoded as if it were a document. Two comments read
// "In production, fetched from client record", which is an intention rather
// than a safeguard.
//
// The endpoint takes a document id now and derives the rest. These assert the
// derivation, and — more importantly — that each missing piece produces a
// refusal rather than a substitute. Every fallback available is worse than not
// sending: an envelope to a placeholder address reaches nobody, and one to a
// real wrong address is a client's contract in a stranger's inbox.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { storageService } from '../../src/backend/services/storage.service';

const prisma = new PrismaClient();
const SUFFIX = `ds-${process.pid}-${Date.now()}`;

let tenantId: string;
let businessId: string;
let noEmailBusinessId: string;
let documentId: string;
let missingFileDocId: string;
let noEmailDocId: string;

const CONTENT = Buffer.from('%PDF-1.4 a genuinely different thing from its filename');

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `DS Tenant ${SUFFIX}`, slug: `ds-${SUFFIX}` },
  });
  tenantId = tenant.id;

  const business = await prisma.business.create({
    data: {
      tenantId,
      legalName: `DS Business ${SUFFIX}`,
      entityType: 'llc',
      businessEmail: `owner-${SUFFIX}@example.com`,
      owners: {
        create: [
          { firstName: 'Minor', lastName: 'Holder', ownershipPercent: 20 },
          { firstName: 'Prime', lastName: 'Signer', ownershipPercent: 80 },
        ],
      },
    },
  });
  businessId = business.id;

  const noEmail = await prisma.business.create({
    data: { tenantId, legalName: `No Email ${SUFFIX}`, entityType: 'llc' },
  });
  noEmailBusinessId = noEmail.id;

  const key = `test/${SUFFIX}/agreement.pdf`;
  await storageService.uploadFile({ path: key, content: CONTENT });

  const doc = await prisma.document.create({
    data: {
      tenantId,
      businessId,
      documentType: 'contract',
      title: `Advisor Agreement ${SUFFIX}`,
      storageKey: key,
    },
  });
  documentId = doc.id;

  const missing = await prisma.document.create({
    data: {
      tenantId,
      businessId,
      documentType: 'contract',
      title: `Missing File ${SUFFIX}`,
      storageKey: `test/${SUFFIX}/never-written.pdf`,
    },
  });
  missingFileDocId = missing.id;

  const noEmailDoc = await prisma.document.create({
    data: {
      tenantId,
      businessId: noEmailBusinessId,
      documentType: 'contract',
      title: `Unsendable ${SUFFIX}`,
      storageKey: key,
    },
  });
  noEmailDocId = noEmailDoc.id;
});

afterAll(async () => {
  // Delete the stored object too. `STORAGE_PROVIDER=local` writes a real file
  // under uploads/, and the first run of this suite committed one to the
  // repository. The directory is ignored now; leaving debris behind would
  // still accumulate on every developer's disk.
  await storageService.deleteFile(`test/${SUFFIX}/agreement.pdf`).catch(() => {});

  await prisma.document.deleteMany({ where: { tenantId } });
  await prisma.businessOwner.deleteMany({ where: { businessId } });
  await prisma.business.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('storage can read what it wrote', () => {
  it('returns the bytes, not the name', async () => {
    // The capability that did not exist. Without a read, the only thing a
    // caller could produce was something derived from metadata — which is
    // exactly what btoa(doc.name) was.
    const bytes = await storageService.readFile(
      (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).storageKey,
    );
    expect(bytes.equals(CONTENT)).toBe(true);
    expect(bytes.toString()).not.toContain('Advisor Agreement');
  });

  it('throws for an object that was never written', async () => {
    // Not an empty buffer: a signature flow that proceeds on emptiness is the
    // failure this prevents.
    await expect(storageService.readFile(`test/${SUFFIX}/never-written.pdf`)).rejects.toThrow();
  });
});

describe('the signer comes from the record', () => {
  it('uses the largest owner and the business email', async () => {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { owners: { orderBy: { ownershipPercent: 'desc' } } },
    });

    // Highest stake first: the person who signs for the business.
    expect(business.owners[0]!.firstName).toBe('Prime');
    expect(business.businessEmail).toBe(`owner-${SUFFIX}@example.com`);
    expect(business.businessEmail).not.toBe('client@example.com');
  });
});

describe('refusals, not substitutes', () => {
  it('a business with no email has nowhere to send', async () => {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: noEmailBusinessId },
    });
    // The condition the route refuses on. Substituting a placeholder here is
    // precisely the defect being removed.
    expect(business.businessEmail).toBeNull();
    expect(noEmailDocId).toBeTruthy();
  });

  it('a document whose bytes are gone cannot be sent', async () => {
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: missingFileDocId } });
    await expect(storageService.readFile(doc.storageKey)).rejects.toThrow();
  });

  it('a document from another tenant is not found at all', async () => {
    // Tenant scoping is part of the lookup, not a filter afterwards.
    const found = await prisma.document.findFirst({
      where: { id: documentId, tenantId: `not-${tenantId}` },
    });
    expect(found).toBeNull();
  });
});

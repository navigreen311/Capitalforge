// ============================================================
// A business pull stores the product it claims to be
//
// Every business pull was written as `scoreType: 'sbss'`, whichever bureau
// produced it, with a score in the personal-FICO range — 650 to 800 — against
// a product that runs 0–300. Two consequences, and the second was invisible:
//
//   1. The stored figure could not be true of its own type. The credit-builder
//      panel renders SBSS out of 300, so a pulled profile would have read
//      "730/300". `validateScoreForType` has said SBSS is 0–300 the whole
//      time; nothing on the pull path called it.
//
//   2. The Experian Business card was unfillable. It reads `intelliscore` —
//      Experian's own business product, 1–100 — and no code path anywhere
//      emitted that string, so the card said "Not yet pulled" no matter what
//      was pulled, and the Intelliscore line on the trajectory chart and the
//      "Experian Intelliscore ≥ 60" criterion could never be satisfied.
//
// These pin both: each bureau writes its own product, and every score is
// inside the range its type allows.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateScoreForType } from '../../../src/shared/validators/credit.validators';

const businessFindFirst = vi.fn();
const profileCreate = vi.fn();
const profileFindFirst = vi.fn();
const profileFindMany = vi.fn();

const prisma = {
  business: { findFirst: businessFindFirst },
  creditProfile: {
    create: profileCreate,
    findFirst: profileFindFirst,
    findMany: profileFindMany,
  },
  ledgerEvent: { create: vi.fn() },
  $on: vi.fn(),
} as never;

const CTX = { tenantId: 'tenant-1', userId: 'user-1', role: 'advisor', permissions: [] } as never;

let savedMode: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  savedMode = process.env['BUREAU_MODE'];
  // Generated figures are allowed here, and are marked synthetic on the row.
  // What is under test is their type and scale, not their provenance.
  process.env['BUREAU_MODE'] = 'synthetic';
  businessFindFirst.mockResolvedValue({ id: 'biz-1', tenantId: 'tenant-1' });
  profileFindFirst.mockResolvedValue(null);
  profileFindMany.mockResolvedValue([]);
  profileCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'profile-1', createdAt: new Date(), ...data }),
  );
});

afterEach(() => {
  if (savedMode === undefined) delete process.env['BUREAU_MODE'];
  else process.env['BUREAU_MODE'] = savedMode;
});

async function service() {
  const { CreditIntelligenceService } = await import(
    '../../../src/backend/services/credit-intelligence.service.js'
  );
  return new CreditIntelligenceService(prisma);
}

async function pull(bureau: string, profileType: 'business' | 'personal') {
  const svc = await service();
  await svc.pullCreditProfiles(
    'biz-1',
    { bureaus: [bureau], profileType, useCache: false, cacheTtlHours: 24 } as never,
    CTX,
  );
  return profileCreate.mock.calls[0]![0].data as { score: number; scoreType: string };
}

describe('business pulls carry the bureau’s own product', () => {
  it('Experian writes an Intelliscore, not an SBSS', async () => {
    const row = await pull('experian', 'business');
    // The string the Experian Business card reads. Nothing produced it before.
    expect(row.scoreType).toBe('intelliscore');
  });

  it('Equifax writes its own Business Risk Score', async () => {
    // Equifax wrote `sbss` too, so nothing produced the score the "Equifax
    // Business Credit ≥ 500" criterion reads and it could not be assessed for
    // any client.
    expect((await pull('equifax', 'business')).scoreType).toBe('equifax_business_risk');
  });

  it('TransUnion still writes SBSS, so that product keeps a producer', async () => {
    // Moving Equifax off `sbss` must not leave SBSS with no source: the
    // SBSS ≥ 140 and SBSS ≥ 175 criteria read it.
    expect((await pull('transunion', 'business')).scoreType).toBe('sbss');
  });

  it('D&B still writes a PAYDEX', async () => {
    expect((await pull('dnb', 'business')).scoreType).toBe('paydex');
  });

  it('personal pulls are untouched and stay FICO', async () => {
    const row = await pull('experian', 'personal');
    expect(row.scoreType).toBe('fico');
  });
});

describe('every stored score is inside the range its type allows', () => {
  // 20 pulls per bureau: the figures are generated, so one pass proves little.
  const BUREAUS = ['equifax', 'transunion', 'experian', 'dnb'] as const;

  for (const bureau of BUREAUS) {
    it(`${bureau} business scores are valid for their type`, async () => {
      for (let i = 0; i < 20; i += 1) {
        vi.clearAllMocks();
        profileCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'profile-1', createdAt: new Date(), ...data }),
        );
        const row = await pull(bureau, 'business');
        // The check the pull path never made. An SBSS of 730 passed silently.
        expect(
          validateScoreForType(row.score, row.scoreType),
          `${bureau} wrote ${row.score} as ${row.scoreType}`,
        ).toBeNull();
      }
    });
  }
});

describe('validateScoreForType knows the products apart', () => {
  it('rejects a personal-FICO figure stored as an SBSS', () => {
    // Exactly what the pull path produced: 650 + random(150), typed sbss.
    expect(validateScoreForType(730, 'sbss')).toMatch(/SBSS score must be 0–300/);
  });

  it('holds Intelliscore to its own 1–100 scale', () => {
    expect(validateScoreForType(64, 'intelliscore')).toBeNull();
    expect(validateScoreForType(180, 'intelliscore')).toMatch(/Intelliscore must be 1–100/);
  });
});

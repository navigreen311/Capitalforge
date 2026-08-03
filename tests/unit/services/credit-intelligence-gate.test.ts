// ============================================================
// credit-intelligence — will not write an invented credit profile
//
// The adapters in this service generate their answers, and
// pullCreditProfiles writes the result into credit_profiles. So a FICO of
// 650 + Math.random() * 150 became a stored credit profile indistinguishable
// from a real pull, which the credit-builder page read back as the client's
// score and which drove the utilisation alerts and ledger events emitted
// alongside it.
//
// The identical generators in integrations/credit-bureaus/bureau-client.ts
// were gated first — that file is imported by nothing. This one is wired to
// POST /api/businesses/:id/credit/pull. Both now consult the same
// configuration, so there is a single answer to whether this system may
// invent a score.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

const ENV_KEYS = ['BUREAU_MODE', 'EXPERIAN_CLIENT_ID', 'EQUIFAX_CLIENT_ID'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  businessFindFirst.mockResolvedValue({ id: 'biz-1', tenantId: 'tenant-1' });
  profileFindFirst.mockResolvedValue(null);
  // The pull emits utilisation and inquiry-velocity alerts after writing, and
  // those read profiles back. Empty is fine — what is under test is whether
  // the write happens at all, and what it records.
  profileFindMany.mockResolvedValue([]);
  profileCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'profile-1',
      businessId: data['businessId'],
      profileType: data['profileType'],
      bureau: data['bureau'],
      score: data['score'],
      scoreType: data['scoreType'],
      utilization: data['utilization'],
      inquiryCount: data['inquiryCount'],
      derogatoryCount: data['derogatoryCount'],
      tradelines: data['tradelines'],
      rawData: data['rawData'],
      pulledAt: data['pulledAt'],
      createdAt: new Date(),
    }),
  );
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function service() {
  const { CreditIntelligenceService } = await import(
    '../../../src/backend/services/credit-intelligence.service.js'
  );
  return new CreditIntelligenceService(prisma);
}

describe('with no credentials and no synthetic mode', () => {
  it('refuses the pull rather than generating a score', async () => {
    const { BureauNotConfiguredError } = await import(
      '../../../src/backend/services/credit-intelligence.service.js'
    );
    const svc = await service();

    await expect(
      svc.pullCreditProfiles('biz-1', { bureaus: ['equifax'], profileType: 'business', useCache: false, cacheTtlHours: 24 }, CTX),
    ).rejects.toBeInstanceOf(BureauNotConfiguredError);
  });

  it('writes nothing', async () => {
    const svc = await service();

    await svc
      .pullCreditProfiles('biz-1', { bureaus: ['equifax'], profileType: 'business', useCache: false, cacheTtlHours: 24 }, CTX)
      .catch(() => undefined);

    // The whole point: no row reaches credit_profiles, because anything that
    // did would be read back as a real bureau pull.
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('does not fall through to an empty result', async () => {
    // The per-bureau catch continues on failure, which for a missing
    // credential would return [] and read as a clean pull that found nothing.
    const svc = await service();

    await expect(
      svc.pullCreditProfiles(
        'biz-1',
        { bureaus: ['equifax', 'experian'], profileType: 'business', useCache: false, cacheTtlHours: 24 },
        CTX,
      ),
    ).rejects.toThrow(/No credentials are configured/);
  });
});

describe('in synthetic mode', () => {
  it('writes the profile and records it as synthetic', async () => {
    process.env['BUREAU_MODE'] = 'synthetic';
    const svc = await service();

    await svc.pullCreditProfiles(
      'biz-1',
      { bureaus: ['equifax'], profileType: 'business', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    expect(profileCreate).toHaveBeenCalledTimes(1);
    const data = profileCreate.mock.calls[0]![0].data as { rawData: { synthetic: boolean } };
    expect(data.rawData.synthetic, 'the row says where the figures came from').toBe(true);
  });
});

describe('with a bureau configured', () => {
  it('does not mark the profile synthetic', async () => {
    process.env['EQUIFAX_CLIENT_ID'] = 'test-client-id';
    const svc = await service();

    await svc.pullCreditProfiles(
      'biz-1',
      { bureaus: ['equifax'], profileType: 'business', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    const data = profileCreate.mock.calls[0]![0].data as { rawData: { synthetic: boolean } };
    expect(data.rawData.synthetic).toBe(false);
  });

  it('gates each bureau on its own credential', async () => {
    process.env['EQUIFAX_CLIENT_ID'] = 'test-client-id';
    const svc = await service();

    // Configuring one bureau must not open the others.
    await expect(
      svc.pullCreditProfiles('biz-1', { bureaus: ['experian'], profileType: 'business', useCache: false, cacheTtlHours: 24 }, CTX),
    ).rejects.toThrow(/experian/);
  });
});

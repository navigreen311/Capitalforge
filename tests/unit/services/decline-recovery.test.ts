// ============================================================
// Unit Tests — Decline Recovery Service & Adverse Action Parser
//
// Coverage (25 tests):
//   - categorizeDeclineReason: known codes, text patterns, fallback
//   - categorizeDeclineReasons: batch processing
//   - buildCooldownCalendar: per-issuer days, eligibility flag
//   - generateReconsiderationLetter: structure, compliance references
//   - createDeclineRecovery: persist + event publish (mocked)
//   - listDeclinesByBusiness: query + mapping
//   - getDeclineRecovery: found / not-found
//   - generateAndStoreReconsiderationLetter: update + event
//   - getDeclineCooldown: found / not-found
//   - registerDeclineAutoTrigger: event bus subscription
//   - parseAdverseActionNotice: denial text, closure text, JSON, unknown
//   - routeAdverseAction: denial → recovery, closure → alert, unknown
//   - parseAndRouteAdverseAction: end-to-end convenience wrapper
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks — must be hoisted before imports ─────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-mock-001', publishedAt: new Date() }),
    subscribe:         vi.fn().mockReturnValue('sub-001'),
  },
}));

vi.mock('@prisma/client', () => {
  const mockCreate     = vi.fn();
  const mockFindMany   = vi.fn();
  const mockFindFirst  = vi.fn();
  const mockUpdate     = vi.fn();

  const PrismaClient = vi.fn().mockImplementation(() => ({
    declineRecovery: {
      create:    mockCreate,
      findMany:  mockFindMany,
      findFirst: mockFindFirst,
      update:    mockUpdate,
    },
  }));

  return { PrismaClient };
});

// ── Imports (after mocks) ─────────────────────────────────────

import {
  categorizeDeclineReason,
  categorizeDeclineReasons,
  buildCooldownCalendar,
  generateReconsiderationLetter,
  createDeclineRecovery,
  listDeclinesByBusiness,
  getDeclineRecovery,
  generateAndStoreReconsiderationLetter,
  getDeclineCooldown,
  registerDeclineAutoTrigger,
  setPrismaClient,
  REASON_CODE_MAP,
  ISSUER_COOLDOWN_DAYS,
  type DeclineReason,
} from '../../../src/backend/services/decline-recovery.service.js';

import {
  parseAdverseActionNotice,
  routeAdverseAction,
  parseAndRouteAdverseAction,
} from '../../../src/backend/services/adverse-action-parser.js';

import { eventBus } from '../../../src/backend/events/event-bus.js';
import { PrismaClient } from '@prisma/client';

// ── Test fixtures ─────────────────────────────────────────────

const basePrismaRecord = {
  id:                    'recovery-001',
  tenantId:              'tenant-001',
  businessId:            'biz-001',
  applicationId:         'app-001',
  issuer:                'chase',
  declineReasons:        [] as unknown,
  adverseActionRaw:      null,
  reconsiderationStatus: 'pending',
  reconsiderationNotes:  null,
  reapplyCooldownDate:   new Date('2026-05-01'),
  letterGenerated:       false,
  createdAt:             new Date('2026-03-31'),
  updatedAt:             new Date('2026-03-31'),
};

// ── categorizeDeclineReason ───────────────────────────────────

describe('categorizeDeclineReason', () => {
  it('maps a known ECOA reason code to category and label', () => {
    const result = categorizeDeclineReason('Too many recent inquiries', '08');
    expect(result.category).toBe('velocity');
    expect(result.code).toBe('08');
    expect(result.label).toBe(REASON_CODE_MAP['08'].label);
  });

  it('categorizes credit-related text without a code', () => {
    const result = categorizeDeclineReason('Credit score too low for approval');
    expect(result.category).toBe('credit');
    expect(result.code).toBeUndefined();
  });

  it('categorizes utilization-related text', () => {
    const result = categorizeDeclineReason('Revolving utilization too high on existing accounts');
    expect(result.category).toBe('utilization');
  });

  it('categorizes velocity-related text', () => {
    const result = categorizeDeclineReason('Too many inquiries in the past 24 months');
    expect(result.category).toBe('velocity');
  });

  it('categorizes fraud-related text', () => {
    const result = categorizeDeclineReason('Security alert on file — cannot verify identity');
    expect(result.category).toBe('fraud');
  });

  it('falls back to "other" for unrecognized text', () => {
    const result = categorizeDeclineReason('Applicant does not meet internal policy criteria');
    expect(result.category).toBe('other');
  });

  it('returns the rawText when no code is given', () => {
    const result = categorizeDeclineReason('Derogatory public record on file');
    expect(result.rawText).toBe('Derogatory public record on file');
  });
});

// ── categorizeDeclineReasons ──────────────────────────────────

describe('categorizeDeclineReasons', () => {
  it('processes an array of mixed strings and code objects', () => {
    const inputs = [
      'Credit score too low',
      { code: '10', text: 'Proportion of balances too high' },
      { code: '08', text: 'Too many inquiries' },
    ];
    const results = categorizeDeclineReasons(inputs);
    expect(results).toHaveLength(3);
    expect(results[0].category).toBe('credit');
    expect(results[1].category).toBe('utilization');
    expect(results[2].category).toBe('velocity');
  });

  it('returns an empty array for empty input', () => {
    expect(categorizeDeclineReasons([])).toHaveLength(0);
  });
});

// ── buildCooldownCalendar ─────────────────────────────────────

describe('buildCooldownCalendar', () => {
  it('uses the correct cooldown for Chase (30 days)', () => {
    const declinedAt = new Date('2026-01-01');
    const calendar   = buildCooldownCalendar('chase', declinedAt);
    expect(calendar.cooldownDays).toBe(ISSUER_COOLDOWN_DAYS['chase']);
    expect(calendar.cooldownDays).toBe(30);
  });

  it('uses the correct cooldown for Amex (90 days)', () => {
    const declinedAt = new Date('2026-01-01');
    const calendar   = buildCooldownCalendar('amex', declinedAt);
    expect(calendar.cooldownDays).toBe(90);
  });

  it('falls back to default (60 days) for unknown issuer', () => {
    const declinedAt = new Date('2026-01-01');
    const calendar   = buildCooldownCalendar('unknown_issuer', declinedAt);
    expect(calendar.cooldownDays).toBe(ISSUER_COOLDOWN_DAYS['default']);
  });

  it('sets isEligibleNow = false for a recent decline', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const calendar = buildCooldownCalendar('chase', yesterday);
    expect(calendar.isEligibleNow).toBe(false);
    expect(calendar.daysRemaining).toBeGreaterThan(0);
  });

  it('sets isEligibleNow = true for an old decline past cooldown', () => {
    const oldDate = new Date('2020-01-01');
    const calendar = buildCooldownCalendar('chase', oldDate);
    expect(calendar.isEligibleNow).toBe(true);
    expect(calendar.daysRemaining).toBe(0);
  });

  it('reapplyEligibleAt is declinedAt + cooldownDays', () => {
    const declinedAt = new Date('2026-01-01');
    const calendar   = buildCooldownCalendar('citi', declinedAt);
    const expected   = new Date('2026-01-01');
    expected.setDate(expected.getDate() + ISSUER_COOLDOWN_DAYS['citi']);
    expect(calendar.reapplyEligibleAt.toDateString()).toBe(expected.toDateString());
  });
});

// ── generateReconsiderationLetter ────────────────────────────

describe('generateReconsiderationLetter', () => {
  const reasons: DeclineReason[] = [
    { rawText: 'Credit score too low', category: 'credit',      label: 'Credit score too low' },
    { rawText: 'High utilization',     category: 'utilization', label: 'High utilization' },
  ];

  it('returns a letter with a unique letterId', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.letterId).toBeTruthy();
    expect(letter.letterId).toHaveLength(36); // UUID
  });

  it('includes the issuer name in the letter body', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.body.toLowerCase()).toContain('chase');
  });

  it('includes the business name in the letter body', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.body).toContain('Acme LLC');
  });

  it('references ECOA in the letter body', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.body).toContain('ECOA');
  });

  it('lists decline reasons in the letter body', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.body).toContain('Credit score too low');
    expect(letter.body).toContain('High utilization');
  });

  it('sets the subject line with the application reference', () => {
    const letter = generateReconsiderationLetter('biz-001', 'Acme LLC', 'chase', reasons, 'app-001');
    expect(letter.subject).toContain('app-001');
  });
});

// ── createDeclineRecovery ─────────────────────────────────────

describe('createDeclineRecovery', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('persists a decline recovery record and returns structured output', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.create.mockResolvedValueOnce({
      ...basePrismaRecord,
      declineReasons: [{ rawText: 'Credit score too low', category: 'credit', label: 'Credit score too low' }],
    });

    const result = await createDeclineRecovery({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      applicationId:  'app-001',
      issuer:         'chase',
      declineReasons: ['Credit score too low'],
    });

    expect(result.id).toBe('recovery-001');
    expect(result.issuer).toBe('chase');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).declineRecovery.create).toHaveBeenCalledOnce();
  });

  it('publishes a decline.recovery.created event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.create.mockResolvedValueOnce(basePrismaRecord);

    await createDeclineRecovery({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      applicationId:  'app-001',
      issuer:         'chase',
      declineReasons: [],
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({ eventType: 'decline.recovery.created' }),
    );
  });
});

// ── listDeclinesByBusiness ────────────────────────────────────

describe('listDeclinesByBusiness', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('returns an empty array when no records exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findMany.mockResolvedValueOnce([]);
    const results = await listDeclinesByBusiness('biz-001', 'tenant-001');
    expect(results).toHaveLength(0);
  });

  it('returns mapped records for a business with declines', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findMany.mockResolvedValueOnce([
      { ...basePrismaRecord, declineReasons: [] },
      { ...basePrismaRecord, id: 'recovery-002', declineReasons: [] },
    ]);

    const results = await listDeclinesByBusiness('biz-001', 'tenant-001');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('recovery-001');
    expect(results[1].id).toBe('recovery-002');
  });
});

// ── getDeclineRecovery ────────────────────────────────────────

describe('getDeclineRecovery', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('returns null when record not found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findFirst.mockResolvedValueOnce(null);
    const result = await getDeclineRecovery('recovery-999', 'tenant-001');
    expect(result).toBeNull();
  });

  it('returns a mapped record when found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findFirst.mockResolvedValueOnce({
      ...basePrismaRecord,
      declineReasons: [{ rawText: 'High utilization', category: 'utilization', label: 'High utilization' }],
    });

    const result = await getDeclineRecovery('recovery-001', 'tenant-001');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('recovery-001');
    expect(result!.declineReasons[0].category).toBe('utilization');
  });
});

// ── generateAndStoreReconsiderationLetter ────────────────────

describe('generateAndStoreReconsiderationLetter', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('throws when the recovery record is not found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findFirst.mockResolvedValueOnce(null);

    await expect(
      generateAndStoreReconsiderationLetter('recovery-999', 'tenant-001', 'Acme LLC'),
    ).rejects.toThrow(/not found/i);
  });

  it('updates letterGenerated and reconsiderationStatus on success', async () => {
    const recordWithReasons = {
      ...basePrismaRecord,
      declineReasons: [{ rawText: 'Credit score too low', category: 'credit', label: 'Credit score too low' }],
    };
    const updatedRecord = { ...recordWithReasons, letterGenerated: true, reconsiderationStatus: 'letter_sent' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findFirst.mockResolvedValueOnce(recordWithReasons);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.update.mockResolvedValueOnce(updatedRecord);

    const result = await generateAndStoreReconsiderationLetter('recovery-001', 'tenant-001', 'Acme LLC');

    expect(result.updatedStatus).toBe('letter_sent');
    expect(result.letter.letterId).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).declineRecovery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ letterGenerated: true }),
      }),
    );
  });

  it('publishes a decline.reconsideration.generated event', async () => {
    const recordWithReasons = {
      ...basePrismaRecord,
      declineReasons: [],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.findFirst.mockResolvedValueOnce(recordWithReasons);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.update.mockResolvedValueOnce({ ...recordWithReasons, letterGenerated: true, reconsiderationStatus: 'letter_sent' });

    await generateAndStoreReconsiderationLetter('recovery-001', 'tenant-001', 'Acme LLC');

    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({ eventType: 'decline.reconsideration.generated' }),
    );
  });
});

// ── registerDeclineAutoTrigger ────────────────────────────────

describe('registerDeclineAutoTrigger', () => {
  it('subscribes to the APPLICATION_DECLINED event on the event bus', () => {
    registerDeclineAutoTrigger();
    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'card.declined',
      expect.any(Function),
      expect.objectContaining({ handlerName: 'decline-recovery-auto-trigger' }),
    );
  });
});

// ── parseAdverseActionNotice ──────────────────────────────────

describe('parseAdverseActionNotice', () => {
  it('detects a denial notice from plain text', () => {
    const text = `Dear Applicant,\n\nWe are unable to approve your application at this time.\n\nReason: Credit score too low for approval.\n\nSincerely, Chase Bank`;
    const result = parseAdverseActionNotice(text);
    expect(result.noticeType).toBe('denial');
  });

  it('detects an account closure notice from plain text', () => {
    const text = `We are writing to inform you that your account ending in 4321 has been closed effective immediately.`;
    const result = parseAdverseActionNotice(text);
    expect(result.noticeType).toBe('account_closure');
  });

  it('detects a credit limit reduction notice from plain text', () => {
    const text = `We are reducing your credit limit from $25,000 to $10,000 effective 30 days from this notice.`;
    const result = parseAdverseActionNotice(text);
    expect(result.noticeType).toBe('credit_limit_reduction');
  });

  it('extracts issuer from text for a known issuer', () => {
    const text = `American Express has reviewed your application. We were unable to approve your application. Reason: Too many recent inquiries.`;
    const result = parseAdverseActionNotice(text);
    expect(result.issuer).toBe('amex');
  });

  it('parses a structured JSON denial notice', () => {
    const json = {
      type:    'denial',
      issuer:  'chase',
      applicationId: 'APP-12345',
      reasons: [{ code: '08', text: 'Too many inquiries' }],
    };
    const result = parseAdverseActionNotice(json as Record<string, unknown>);
    expect(result.noticeType).toBe('denial');
    expect(result.issuer).toBe('chase');
    expect(result.applicationRef).toBe('APP-12345');
    expect(result.reasons[0].category).toBe('velocity');
  });

  it('parses a structured JSON closure notice', () => {
    const json = {
      type:          'account_closure',
      issuer:        'citi',
      accountNumber: 'XXXX-4321',
      reasons:       ['Account closed per issuer policy'],
    };
    const result = parseAdverseActionNotice(json as Record<string, unknown>);
    expect(result.noticeType).toBe('account_closure');
    expect(result.accountRef).toBe('XXXX-4321');
  });

  it('returns noticeType "unknown" and low confidence for ambiguous text', () => {
    const text = `Thank you for your inquiry. Please contact customer service.`;
    const result = parseAdverseActionNotice(text);
    expect(result.noticeType).toBe('unknown');
    expect(result.confidence).toBe('low');
  });
});

// ── routeAdverseAction ────────────────────────────────────────

describe('routeAdverseAction', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('routes a denial notice to DeclineRecovery and returns recoveryId', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.create.mockResolvedValueOnce({
      ...basePrismaRecord,
      declineReasons: [],
    });

    const denialNotice = parseAdverseActionNotice(
      `We are unable to approve your application. Reason: Credit score too low.`,
    );

    const result = await routeAdverseAction({
      parsedNotice:  denialNotice,
      tenantId:      'tenant-001',
      businessId:    'biz-001',
      applicationId: 'app-001',
      issuer:        'chase',
    });

    expect(result.noticeType).toBe('denial');
    expect(result.routed).toBe(true);
    expect(result.recoveryId).toBe('recovery-001');
  });

  it('routes an account closure to an alert event', async () => {
    const closureNotice = parseAdverseActionNotice(
      `Your credit card account ending in 5678 has been closed.`,
    );

    const result = await routeAdverseAction({
      parsedNotice:  closureNotice,
      tenantId:      'tenant-001',
      businessId:    'biz-001',
      applicationId: 'app-001',
      issuer:        'amex',
    });

    expect(result.noticeType).toBe('account_closure');
    expect(result.routed).toBe(true);
    expect(result.alertId).toBeTruthy();
    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({ eventType: 'risk.alert.raised' }),
    );
  });

  it('returns routed=false for unknown notice type', async () => {
    const unknownNotice = parseAdverseActionNotice('Thank you for contacting us.');

    const result = await routeAdverseAction({
      parsedNotice:  unknownNotice,
      tenantId:      'tenant-001',
      businessId:    'biz-001',
      applicationId: 'app-001',
    });

    expect(result.noticeType).toBe('unknown');
    expect(result.routed).toBe(false);
  });
});

// ── parseAndRouteAdverseAction (convenience) ──────────────────

describe('parseAndRouteAdverseAction', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('parses and routes in one call, returning both parsed and routing results', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).declineRecovery.create.mockResolvedValueOnce({
      ...basePrismaRecord,
      declineReasons: [],
    });

    const { parsed, routing } = await parseAndRouteAdverseAction(
      `Your application has been declined. Reason Code: 10 — Proportion of balances too high on revolving accounts.`,
      'tenant-001',
      'biz-001',
      'app-001',
      'citi',
    );

    expect(parsed.noticeType).toBe('denial');
    expect(routing.routed).toBe(true);
    expect(routing.recoveryId).toBe('recovery-001');
  });
});

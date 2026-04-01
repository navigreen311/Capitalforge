// ============================================================
// Credit Bureau Integration — Unit Tests
//
// Coverage:
//   Section 1:  BureauClient.pullCredit — all three personal bureaus
//   Section 2:  BureauClient.pullCredit — consent validation
//   Section 3:  BureauClient.pullBusinessCredit — all four bureaus
//   Section 4:  BureauClient.pullBusinessCredit — EIN validation
//   Section 5:  D&B unsupported personal pull
//   Section 6:  Rate limiting (per bureau)
//   Section 7:  Normalised CreditProfile shape contract
//   Section 8:  BureauWebhookHandler — score change alerts
//   Section 9:  BureauWebhookHandler — new inquiry alerts
//   Section 10: BureauWebhookHandler — derogatory mark alerts
//   Section 11: BureauWebhookHandler — account opened/closed
//   Section 12: BureauWebhookHandler — idempotency
//   Section 13: BureauWebhookHandler — payload normalisation across bureaus
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BureauClient,
  BureauConsentError,
  BureauValidationError,
  BureauUnsupportedError,
  BureauRateLimitError,
  type ConsentAttestation,
} from '../../../src/backend/integrations/credit-bureaus/bureau-client.js';
import {
  BureauWebhookHandler,
} from '../../../src/backend/integrations/credit-bureaus/bureau-webhooks.js';
import type { Bureau } from '../../../src/shared/types/index.js';

// ── Fixtures ──────────────────────────────────────────────────

const TENANT_ID = 'tenant-bureau-001';

function makeConsent(overrides: Partial<ConsentAttestation> = {}): ConsentAttestation {
  return {
    subjectId:  'subj-001',
    consentId:  `consent-${crypto.randomUUID()}`,
    capturedAt: new Date().toISOString(),
    ipAddress:  '192.0.2.1',
    ...overrides,
  };
}

function makeEventBusMock() {
  return {
    publish:           vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue(undefined),
    subscribe:         vi.fn(),
  };
}

// ── Section 1: pullCredit — personal bureaus ──────────────────

describe('BureauClient.pullCredit — personal bureaus', () => {
  let client: BureauClient;

  beforeEach(() => {
    client = new BureauClient();
    client._resetRateBuckets();
  });

  it.each(['experian', 'transunion', 'equifax'] as Bureau[])(
    'returns a normalised CreditProfile for %s',
    async (bureau) => {
      const result = await client.pullCredit(bureau, '123-45-6789', makeConsent());

      expect(result.bureau).toBe(bureau);
      expect(result.profile.bureau).toBe(bureau);
      expect(result.profile.profileType).toBe('personal');
      expect(result.profile.scoreType).toBe('fico');
      expect(result.profile.profileId).toBeTruthy();
      expect(result.consentId).toBeTruthy();
    },
  );

  it('returns a score in valid FICO range (300–850)', async () => {
    const result = await client.pullCredit('equifax', '123-45-6789', makeConsent());
    expect(result.profile.score).toBeGreaterThanOrEqual(300);
    expect(result.profile.score).toBeLessThanOrEqual(850);
  });

  it('returns tradelines array with at least one entry', async () => {
    const result = await client.pullCredit('experian', '123-45-6789', makeConsent());
    expect(Array.isArray(result.profile.tradelines)).toBe(true);
    expect(result.profile.tradelines.length).toBeGreaterThan(0);
  });

  it('includes subjectRef and consentId in the result', async () => {
    const consent = makeConsent({ subjectId: 'subj-test-123' });
    const result  = await client.pullCredit('transunion', '987-65-4321', consent);

    expect(result.subjectRef).toContain('subj-test-123');
    expect(result.consentId).toBe(consent.consentId);
  });
});

// ── Section 2: pullCredit — consent validation ────────────────

describe('BureauClient.pullCredit — consent validation', () => {
  let client: BureauClient;

  beforeEach(() => {
    client = new BureauClient();
    client._resetRateBuckets();
  });

  it('throws BureauConsentError when consentId is missing', async () => {
    await expect(
      client.pullCredit('equifax', '123-45-6789', makeConsent({ consentId: '' })),
    ).rejects.toThrow(BureauConsentError);
  });

  it('throws BureauConsentError when subjectId is missing', async () => {
    await expect(
      client.pullCredit('equifax', '123-45-6789', makeConsent({ subjectId: '' })),
    ).rejects.toThrow(BureauConsentError);
  });

  it('throws BureauConsentError when capturedAt is missing', async () => {
    await expect(
      client.pullCredit('equifax', '123-45-6789', makeConsent({ capturedAt: '' })),
    ).rejects.toThrow(BureauConsentError);
  });

  it('throws BureauConsentError when consent is older than 90 days', async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      client.pullCredit('equifax', '123-45-6789', makeConsent({ capturedAt: ninetyOneDaysAgo })),
    ).rejects.toThrow(BureauConsentError);
  });

  it('accepts consent captured exactly 89 days ago', async () => {
    const eightyNineDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      client.pullCredit('experian', '123-45-6789', makeConsent({ capturedAt: eightyNineDaysAgo })),
    ).resolves.toBeDefined();
  });
});

// ── Section 3: pullBusinessCredit — all bureaus ───────────────

describe('BureauClient.pullBusinessCredit', () => {
  let client: BureauClient;

  beforeEach(() => {
    client = new BureauClient();
    client._resetRateBuckets();
  });

  it.each(['experian', 'transunion', 'equifax'] as Bureau[])(
    'returns a normalised business CreditProfile for %s (SBSS)',
    async (bureau) => {
      const result = await client.pullBusinessCredit(bureau, '12-3456789');

      expect(result.bureau).toBe(bureau);
      expect(result.ein).toBe('12-3456789');
      expect(result.profile.profileType).toBe('business');
      expect(result.profile.scoreType).toBe('sbss');
      expect(result.profile.score).toBeGreaterThanOrEqual(0);
      expect(result.profile.score).toBeLessThanOrEqual(300); // SBSS 0–300
    },
  );

  it('returns a D&B Paydex profile with score 0–100 and dunsNumber', async () => {
    client._resetRateBuckets();
    const result = await client.pullBusinessCredit('dnb', '98-7654321');

    expect(result.bureau).toBe('dnb');
    expect(result.profile.scoreType).toBe('paydex');
    expect(result.profile.score).toBeGreaterThanOrEqual(0);
    expect(result.profile.score).toBeLessThanOrEqual(100);
    expect(result.dunsNumber).toBeTruthy();
    expect(result.dunsNumber).toMatch(/^\d{9}$/);
  });

  it('D&B profile has null utilization (Paydex does not model utilization)', async () => {
    client._resetRateBuckets();
    const result = await client.pullBusinessCredit('dnb', '98-7654321');
    expect(result.profile.utilization).toBeNull();
  });
});

// ── Section 4: pullBusinessCredit — EIN validation ───────────

describe('BureauClient.pullBusinessCredit — EIN validation', () => {
  let client: BureauClient;

  beforeEach(() => {
    client = new BureauClient();
    client._resetRateBuckets();
  });

  it('throws BureauValidationError for EIN with fewer than 9 digits', async () => {
    await expect(
      client.pullBusinessCredit('equifax', '12-345678'),
    ).rejects.toThrow(BureauValidationError);
  });

  it('throws BureauValidationError for EIN with letters', async () => {
    await expect(
      client.pullBusinessCredit('equifax', 'AB-CDEFGHI'),
    ).rejects.toThrow(BureauValidationError);
  });

  it('accepts EIN without hyphen (9 bare digits)', async () => {
    await expect(
      client.pullBusinessCredit('transunion', '123456789'),
    ).resolves.toBeDefined();
  });

  it('accepts EIN with standard hyphen format (XX-XXXXXXX)', async () => {
    await expect(
      client.pullBusinessCredit('experian', '12-3456789'),
    ).resolves.toBeDefined();
  });
});

// ── Section 5: D&B unsupported personal pull ─────────────────

describe('BureauClient — D&B unsupported operations', () => {
  it('throws BureauUnsupportedError when pulling personal credit from D&B', async () => {
    const client = new BureauClient();
    client._resetRateBuckets();

    await expect(
      client.pullCredit('dnb', '123-45-6789', makeConsent()),
    ).rejects.toThrow(BureauUnsupportedError);
  });

  it('error message mentions using pullBusinessCredit instead', async () => {
    const client = new BureauClient();
    client._resetRateBuckets();

    try {
      await client.pullCredit('dnb', '123-45-6789', makeConsent());
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toMatch(/pullBusinessCredit/i);
    }
  });
});

// ── Section 6: Rate limiting ──────────────────────────────────

describe('BureauClient — rate limiting', () => {
  it('getRateLimitStatus returns current token count and limit', () => {
    const client = new BureauClient();
    client._resetRateBuckets();

    const status = client.getRateLimitStatus('experian');
    expect(status.bureau).toBe('experian');
    expect(status.requestsPerMinute).toBeGreaterThan(0);
    expect(status.tokensRemaining).toBeGreaterThan(0);
  });

  it('tokens decrease after each successful pull', async () => {
    const client = new BureauClient();
    client._resetRateBuckets();

    const before = client.getRateLimitStatus('equifax').tokensRemaining;
    await client.pullCredit('equifax', '123-45-6789', makeConsent());
    const after = client.getRateLimitStatus('equifax').tokensRemaining;

    expect(after).toBe(before - 1);
  });
});

// ── Section 7: CreditProfile shape contract ──────────────────

describe('BureauClient — CreditProfile shape contract', () => {
  let client: BureauClient;

  beforeEach(() => {
    client = new BureauClient();
    client._resetRateBuckets();
  });

  it('personal profile has all required CreditProfile fields', async () => {
    const result = await client.pullCredit('experian', '123-45-6789', makeConsent());
    const profile = result.profile;

    expect(profile).toHaveProperty('profileId');
    expect(profile).toHaveProperty('bureau');
    expect(profile).toHaveProperty('profileType');
    expect(profile).toHaveProperty('score');
    expect(profile).toHaveProperty('scoreType');
    expect(profile).toHaveProperty('utilization');
    expect(profile).toHaveProperty('inquiryCount');
    expect(profile).toHaveProperty('derogatoryCount');
    expect(profile).toHaveProperty('tradelines');
    expect(profile).toHaveProperty('rawResponseRef');
    expect(profile).toHaveProperty('pulledAt');
  });

  it('tradelines have all required NormalisedTradeline fields', async () => {
    const result = await client.pullCredit('transunion', '123-45-6789', makeConsent());
    const tl = result.profile.tradelines[0];

    expect(tl).toHaveProperty('creditor');
    expect(tl).toHaveProperty('accountType');
    expect(tl).toHaveProperty('paymentStatus');
    expect(tl).toHaveProperty('isDerogatory');
    expect(typeof tl.isDerogatory).toBe('boolean');
  });

  it('pulledAt is an ISO 8601 string', async () => {
    const result = await client.pullBusinessCredit('equifax', '12-3456789');
    expect(() => new Date(result.profile.pulledAt)).not.toThrow();
    expect(new Date(result.profile.pulledAt).toISOString()).toBe(result.profile.pulledAt);
  });
});

// ── Section 8: BureauWebhookHandler — score change ───────────

describe('BureauWebhookHandler — score change alerts', () => {
  let handler:  BureauWebhookHandler;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    handler  = new BureauWebhookHandler(eventBus as never);
    handler._clearProcessedAlerts();
  });

  it('processes a score_change alert and emits a bureau.alert.score_change event', async () => {
    const result = await handler.processAlert('equifax', {
      alertType:     'SCORE_CHANGE',
      subjectRef:    'subj-001',
      timestamp:     new Date().toISOString(),
      scoreChange:   { previous: 720, current: 700, type: 'fico' },
    }, TENANT_ID);

    expect(result.alertType).toBe('credit_score_change');
    expect(result.received).toBe(true);
    expect(eventBus.publish).toHaveBeenCalled();
  });

  it('emits bureau.alert.score_change.significant when delta >= 20 points', async () => {
    await handler.processAlert('experian', {
      alertType:   'SCORE_CHANGE',
      subjectRef:  'subj-002',
      timestamp:   new Date().toISOString(),
      scoreChange: { previous: 760, current: 720, type: 'fico' }, // delta = -40
    }, TENANT_ID);

    const calls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const significantCall = calls.find(([, payload]: [string, { eventType: string }]) =>
      payload.eventType === 'bureau.alert.score_change.significant',
    );
    expect(significantCall).toBeDefined();
  });

  it('marks result as significant when score drops by threshold or more', async () => {
    const result = await handler.processAlert('transunion', {
      alertType:   'SCORE_CHANGE',
      subjectRef:  'subj-003',
      timestamp:   new Date().toISOString(),
      scoreChange: { previous: 700, current: 650 }, // delta = -50
    }, TENANT_ID);

    expect(result.significant).toBe(true);
  });
});

// ── Section 9: BureauWebhookHandler — new inquiry ────────────

describe('BureauWebhookHandler — new inquiry alerts', () => {
  let handler:  BureauWebhookHandler;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    handler  = new BureauWebhookHandler(eventBus as never);
    handler._clearProcessedAlerts();
  });

  it('processes a new_inquiry alert and emits bureau.alert.new_inquiry', async () => {
    const result = await handler.processAlert('experian', {
      alertType:    'INQUIRY',
      subjectRef:   'subj-004',
      timestamp:    new Date().toISOString(),
      inquiryType:  'hard',
      creditor:     'First National Bank',
      inquiryDate:  new Date().toISOString(),
    }, TENANT_ID);

    expect(result.alertType).toBe('new_inquiry');
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'bureau.alert.new_inquiry' }),
    );
  });
});

// ── Section 10: BureauWebhookHandler — derogatory marks ──────

describe('BureauWebhookHandler — derogatory mark alerts', () => {
  let handler:  BureauWebhookHandler;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    handler  = new BureauWebhookHandler(eventBus as never);
    handler._clearProcessedAlerts();
  });

  it('processes a derogatory alert and emits bureau.alert.derogatory_mark', async () => {
    const result = await handler.processAlert('equifax', {
      alertType:    'DEROGATORY',
      subjectRef:   'subj-005',
      timestamp:    new Date().toISOString(),
      event:        { type: 'COLLECTION', amount: 1200 },
    }, TENANT_ID);

    expect(result.alertType).toBe('derogatory_mark');
    expect(result.significant).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'bureau.alert.derogatory_mark' }),
    );
  });

  it('includes derogatoryAmount in the event payload', async () => {
    await handler.processAlert('transunion', {
      alertType: 'JUDGMENT',
      subjectRef: 'subj-006',
      timestamp:  new Date().toISOString(),
      amount:     5000,
    }, TENANT_ID);

    const [, payload] = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { payload: { derogatoryAmount: number } }];
    expect(payload.payload.derogatoryAmount).toBe(5000);
  });
});

// ── Section 11: BureauWebhookHandler — account changes ───────

describe('BureauWebhookHandler — account opened/closed', () => {
  let handler:  BureauWebhookHandler;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    handler  = new BureauWebhookHandler(eventBus as never);
    handler._clearProcessedAlerts();
  });

  it('processes account_opened and emits bureau.alert.account_opened', async () => {
    const result = await handler.processAlert('experian', {
      alertType:   'OPEN',
      subjectRef:  'subj-007',
      timestamp:   new Date().toISOString(),
      accountType: 'revolving',
      creditLimit: 10000,
      creditor:    'Chase',
    }, TENANT_ID);

    expect(result.alertType).toBe('account_opened');
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'bureau.alert.account_opened' }),
    );
  });

  it('processes account_closed and emits bureau.alert.account_closed', async () => {
    const result = await handler.processAlert('equifax', {
      alertType:   'CLOSED',
      subjectRef:  'subj-008',
      timestamp:   new Date().toISOString(),
      accountType: 'installment',
      creditor:    'Sallie Mae',
    }, TENANT_ID);

    expect(result.alertType).toBe('account_closed');
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'bureau.alert.account_closed' }),
    );
  });
});

// ── Section 12: BureauWebhookHandler — idempotency ───────────

describe('BureauWebhookHandler — idempotency', () => {
  let handler: BureauWebhookHandler;

  beforeEach(() => {
    handler = new BureauWebhookHandler(makeEventBusMock() as never);
    handler._clearProcessedAlerts();
  });

  it('returns duplicate=true on second delivery of same alert', async () => {
    const body = {
      alertType:  'SCORE_CHANGE',
      subjectRef: 'subj-idem-001',
      timestamp:  '2026-01-15T10:00:00Z',
      scoreChange: { previous: 700, current: 690 },
    };

    const first  = await handler.processAlert('equifax', body, TENANT_ID);
    const second = await handler.processAlert('equifax', body, TENANT_ID);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });

  it('does NOT deduplicate same alert type from different bureaus', async () => {
    const baseBody = {
      alertType:   'SCORE_CHANGE',
      subjectRef:  'subj-idem-002',
      timestamp:   '2026-01-15T11:00:00Z',
      scoreChange: { previous: 700, current: 695 },
    };

    const r1 = await handler.processAlert('experian',   baseBody, TENANT_ID);
    const r2 = await handler.processAlert('transunion', baseBody, TENANT_ID);

    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(false);
  });
});

// ── Section 13: Payload normalisation ────────────────────────

describe('BureauWebhookHandler — payload normalisation', () => {
  let handler: BureauWebhookHandler;

  beforeEach(() => {
    handler = new BureauWebhookHandler(makeEventBusMock() as never);
    handler._clearProcessedAlerts();
  });

  it('normalises D&B payload (entityDuns as subjectRef)', async () => {
    const result = await handler.processAlert('dnb', {
      alertCategory: 'DEROGATORY',
      entityDuns:    '123456789',
      timestamp:     new Date().toISOString(),
      event:         { type: 'COLLECTION', amount: 3000 },
    }, TENANT_ID);

    expect(result.subjectRef).toBe('123456789');
  });

  it('uses generatedAt as fallback timestamp', async () => {
    const result = await handler.processAlert('equifax', {
      alertType:  'INQUIRY',
      subjectRef: 'subj-ts-001',
      generatedAt: '2026-01-10T00:00:00Z',
    }, TENANT_ID);

    expect(result.received).toBe(true);
  });
});

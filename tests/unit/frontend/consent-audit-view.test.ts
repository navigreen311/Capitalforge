// ============================================================
// consent-audit-view — consent state and do-not-contact
//
// Two of the page's fixtures decided whether contacting somebody is lawful:
// a consent table giving each business voice, SMS and email status, and a
// do-not-contact list. Both were literals, and this system can send real
// SMS. These pin the one judgment everything else rests on: nothing unknown
// is ever read as consent.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toConsentStatus,
  toConsentEntries,
  toDncEntries,
  channelStatus,
  mayContact,
  summariseConsent,
  suppressedBusinessIds,
  humanise,
  type BusinessConsent,
} from '../../../src/frontend/lib/consent-audit-view';

/** Captured from GET /api/businesses/:id/consent. */
const REAL_CONSENT = [
  {
    channel: 'email',
    consentType: 'tcpa',
    status: 'active',
    grantedAt: '2025-09-04T00:00:00.000Z',
    revokedAt: null,
    evidenceRef: 'email-thread-2025090412341',
    recordId: 'seed-consent-001',
  },
  {
    channel: 'document',
    consentType: 'data_sharing',
    status: 'active',
    grantedAt: '2025-09-04T00:00:00.000Z',
    revokedAt: null,
    evidenceRef: 'docusign-envelope-abc123',
    recordId: 'seed-consent-002',
  },
];

const business = (entries: BusinessConsent['entries']): BusinessConsent => ({
  businessId: 'seed-biz-001',
  businessName: 'Apex Digital Solutions LLC',
  entries,
});

describe('toConsentStatus', () => {
  it('accepts the statuses the API records', () => {
    for (const s of ['active', 'revoked', 'expired', 'pending']) {
      expect(toConsentStatus(s)).toBe(s);
    }
  });

  it('reads anything unrecognised as unknown, never as active', () => {
    // Reading a value this code does not understand as permission to contact
    // somebody is the one failure that costs the client rather than the firm.
    expect(toConsentStatus('granted')).toBe('unknown');
    expect(toConsentStatus(undefined)).toBe('unknown');
    expect(toConsentStatus(null)).toBe('unknown');
    expect(toConsentStatus('')).toBe('unknown');
  });
});

describe('toConsentEntries', () => {
  it('maps a real consent response', () => {
    expect(toConsentEntries(REAL_CONSENT)[0]).toMatchObject({
      channel: 'email',
      consentType: 'tcpa',
      status: 'active',
      evidenceRef: 'email-thread-2025090412341',
    });
  });

  it('reads the audit envelope too', () => {
    expect(toConsentEntries({ records: REAL_CONSENT, totalRecords: 2 })).toHaveLength(2);
  });

  it('drops an entry with no channel', () => {
    expect(toConsentEntries([{ status: 'active' }])).toEqual([]);
  });

  it('leaves a missing evidence reference null', () => {
    // Consent with nothing proving it is a gap worth seeing, not a blank.
    const e = toConsentEntries([{ ...REAL_CONSENT[0], evidenceRef: null }])[0];
    expect(e.evidenceRef).toBeNull();
  });

  it('returns an empty list for junk', () => {
    expect(toConsentEntries(null)).toEqual([]);
    expect(toConsentEntries({ records: 'nope' })).toEqual([]);
  });
});

describe('channelStatus', () => {
  it('reports an active consent on the channel', () => {
    expect(channelStatus(business(toConsentEntries(REAL_CONSENT)), 'email')).toBe('active');
  });

  it('reports unknown when nothing covers the channel', () => {
    // Not 'revoked', which reads as a decision somebody made, and not
    // 'active'. No basis on file is its own state.
    expect(channelStatus(business(toConsentEntries(REAL_CONSENT)), 'sms')).toBe('unknown');
    expect(channelStatus(business(toConsentEntries(REAL_CONSENT)), 'voice')).toBe('unknown');
  });

  it('reports unknown when the record could not be read', () => {
    expect(channelStatus(business(null), 'email')).toBe('unknown');
  });

  it('lets a revocation win over an active record on the same channel', () => {
    // Consent is revocable at any time; the most recent word counts, and
    // between the two the safe reading is the revocation.
    const entries = toConsentEntries([
      { ...REAL_CONSENT[0], channel: 'sms', status: 'active' },
      { ...REAL_CONSENT[0], channel: 'sms', status: 'revoked', recordId: 'r2' },
    ]);
    expect(channelStatus(business(entries), 'sms')).toBe('revoked');
  });

  it('does not treat pending or expired as permission', () => {
    for (const status of ['pending', 'expired']) {
      const entries = toConsentEntries([{ ...REAL_CONSENT[0], channel: 'voice', status }]);
      expect(channelStatus(business(entries), 'voice')).toBe(status);
      expect(mayContact(business(entries), 'voice')).toBe(false);
    }
  });
});

describe('mayContact', () => {
  it('is true only on an active consent', () => {
    const entries = toConsentEntries(REAL_CONSENT);
    expect(mayContact(business(entries), 'email')).toBe(true);
    expect(mayContact(business(entries), 'sms')).toBe(false);
    expect(mayContact(business(null), 'email')).toBe(false);
  });
});

describe('summariseConsent', () => {
  it('counts contactable and unknown per channel', () => {
    const withEmail = business(toConsentEntries(REAL_CONSENT));
    const withNothing = business([]);

    const s = summariseConsent([withEmail, withNothing]);
    expect(s.businesses).toBe(2);
    expect(s.contactable.email).toBe(1);
    expect(s.unknown.email).toBe(1);
    expect(s.unknown.sms).toBe(2);
    expect(s.contactable.sms).toBe(0);
  });

  it('counts businesses whose record could not be read', () => {
    const s = summariseConsent([business(null), business([])]);
    expect(s.unreadable).toBe(1);
    // And an unreadable record counts as unknown, not as contactable.
    expect(s.contactable.voice).toBe(0);
    expect(s.unknown.voice).toBe(2);
  });

  it('handles an empty list', () => {
    expect(summariseConsent([])).toMatchObject({
      businesses: 0,
      unreadable: 0,
      contactable: { voice: 0, sms: 0, email: 0 },
    });
  });
});

describe('toDncEntries', () => {
  const REAL_DNC = {
    id: 'dnc-1',
    phoneNumber: '+13025550101',
    businessId: 'seed-biz-001',
    businessName: 'Apex Digital',
    source: 'opt_out',
    reason: 'Replied STOP to a payment reminder.',
    addedAt: '2026-08-01T03:20:00.000Z',
  };

  it('maps a real suppression', () => {
    expect(toDncEntries([REAL_DNC])[0]).toMatchObject({
      phoneNumber: '+13025550101',
      businessName: 'Apex Digital',
      source: 'opt_out',
    });
  });

  it('keeps a suppression that matched no client', () => {
    // Somebody can opt out from a number on no file, and that is still a
    // number the sender must not dial.
    const row = toDncEntries([
      { ...REAL_DNC, id: 'dnc-2', businessId: null, businessName: null },
    ])[0];
    expect(row.businessId).toBeNull();
    expect(row.businessName).toBeNull();
    expect(row.phoneNumber).toBe('+13025550101');
  });

  it('drops a suppression with no number', () => {
    // It suppresses nothing, and rendering it implies a protection that is
    // not in place.
    expect(toDncEntries([{ ...REAL_DNC, phoneNumber: null }])).toEqual([]);
  });

  it('reads the list envelope', () => {
    expect(toDncEntries({ data: [REAL_DNC] })).toHaveLength(1);
    expect(toDncEntries(null)).toEqual([]);
  });
});

describe('suppressedBusinessIds', () => {
  it('collects the clients behind the suppressions', () => {
    const rows = toDncEntries([
      { id: 'a', phoneNumber: '+1', businessId: 'biz-1' },
      { id: 'b', phoneNumber: '+2', businessId: null },
      { id: 'c', phoneNumber: '+3', businessId: 'biz-2' },
    ]);
    expect([...suppressedBusinessIds(rows)].sort()).toEqual(['biz-1', 'biz-2']);
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('opt_out')).toBe('Opt out');
  });
});

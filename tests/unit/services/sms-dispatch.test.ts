// ============================================================
// SMS dispatch — unit tests
//
// Covers the pure decision logic that decides whether a message may be sent.
// The dispatch loop itself needs a database and a provider and is exercised
// by integration checks; what is asserted here is the reasoning that must
// hold regardless of either — because every one of these functions returning
// the wrong answer means contacting someone the law says must not be
// contacted.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';

import {
  normalisePhone,
  isOptOutKeyword,
  withinQuietHours,
  smsConfigStatus,
} from '../../../src/backend/services/sms-dispatch.service.js';
import { resolveTimezone } from '../../../src/backend/services/timezone.js';

// ── Phone normalisation ─────────────────────────────────────────────────────

describe('normalisePhone', () => {
  it('normalises the formats a number is realistically stored in', () => {
    // All four describe the same number. If any normalised differently, a
    // do-not-call entry recorded from one would not match a send using
    // another — an opt-out that silently fails to stop anything.
    for (const input of ['(512) 555-0123', '512-555-0123', '5125550123', '+1 512 555 0123']) {
      expect(normalisePhone(input)).toBe('+15125550123');
    }
  });

  it('keeps an already-E.164 international number', () => {
    expect(normalisePhone('+442071234567')).toBe('+442071234567');
  });

  it('returns null rather than guessing at something unusable', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('not a phone')).toBeNull();
    // Too short to be a real number: inferring a country code here would
    // produce a valid-looking number that belongs to someone else.
    expect(normalisePhone('555-0123')).toBeNull();
  });
});

// ── Opt-out keywords ────────────────────────────────────────────────────────

describe('isOptOutKeyword', () => {
  it('recognises the keywords carriers require', () => {
    for (const word of ['STOP', 'stop', 'Stop', 'STOPALL', 'unsubscribe', 'CANCEL', 'end', 'quit', 'REVOKE', 'optout']) {
      expect(isOptOutKeyword(word)).toBe(true);
    }
  });

  it('tolerates surrounding whitespace and trailing punctuation', () => {
    expect(isOptOutKeyword('  stop  ')).toBe(true);
    expect(isOptOutKeyword('STOP.')).toBe(true);
    expect(isOptOutKeyword('stop!')).toBe(true);
  });

  it('does not treat prose containing the word as an opt-out', () => {
    // A reply is an opt-out only when the message *is* the keyword. Matching
    // on substrings would opt people out of messages they were discussing.
    expect(isOptOutKeyword('please stop sending these')).toBe(false);
    expect(isOptOutKeyword('can you stop by tomorrow')).toBe(false);
    expect(isOptOutKeyword('')).toBe(false);
  });
});

// ── Quiet hours ─────────────────────────────────────────────────────────────

describe('withinQuietHours', () => {
  // 18:00 UTC is 13:00 in Chicago (inside the window) and 10:00 in Los
  // Angeles (also inside); 02:00 UTC is 20:00 the previous day in Chicago
  // (inside) but 18:00 in LA (inside) — so the discriminating case is one
  // that lands on opposite sides, which is the whole reason this is per-zone.
  it('judges the same instant differently in different zones', () => {
    // 04:00 UTC = 23:00 in New York (outside) and 20:00 in Los Angeles (inside).
    const instant = new Date('2026-01-15T04:00:00Z');

    expect(withinQuietHours(instant, 'America/New_York')).toBe(false);
    expect(withinQuietHours(instant, 'America/Los_Angeles')).toBe(true);
  });

  it('permits contact inside the window', () => {
    const midday = new Date('2026-01-15T18:00:00Z'); // 12:00 Chicago
    expect(withinQuietHours(midday, 'America/Chicago')).toBe(true);
  });

  it('refuses contact outside it', () => {
    const smallHours = new Date('2026-01-15T09:00:00Z'); // 03:00 Chicago
    expect(withinQuietHours(smallHours, 'America/Chicago')).toBe(false);
  });

  it('respects the window boundaries', () => {
    // 08:00 local is permitted; 21:00 local is not.
    expect(withinQuietHours(new Date('2026-01-15T14:00:00Z'), 'America/Chicago')).toBe(true);
    expect(withinQuietHours(new Date('2026-01-16T03:00:00Z'), 'America/Chicago')).toBe(false);
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // 01:30 UTC is 20:30 in Chicago during CDT (inside the window) but 19:30
    // during CST (also inside) — so compare a case that actually flips:
    // 02:30 UTC is 21:30 CDT (outside) and 20:30 CST (inside).
    const summer = new Date('2026-07-15T02:30:00Z');
    const winter = new Date('2026-01-15T02:30:00Z');

    expect(withinQuietHours(summer, 'America/Chicago')).toBe(false);
    expect(withinQuietHours(winter, 'America/Chicago')).toBe(true);
  });

  it('treats Arizona as distinct from Mountain time in summer', () => {
    // Arizona does not observe DST. In July, 03:30 UTC is 20:30 in Phoenix
    // (inside) but 21:30 in Denver (outside).
    const instant = new Date('2026-07-16T03:30:00Z');

    expect(withinQuietHours(instant, 'America/Phoenix')).toBe(true);
    expect(withinQuietHours(instant, 'America/Denver')).toBe(false);
  });
});

// ── Timezone resolution ─────────────────────────────────────────────────────

describe('resolveTimezone', () => {
  it('prefers the stored timezone', () => {
    // A client who moved keeps their old area code; only the stored value can
    // be right, so it must win.
    expect(resolveTimezone('America/Denver', '+12125550123')).toEqual({
      zone: 'America/Denver',
      source: 'business',
    });
  });

  it('falls back to the area code when nothing is stored', () => {
    expect(resolveTimezone(null, '+12125550123')).toEqual({
      zone: 'America/New_York',
      source: 'area_code',
    });
    expect(resolveTimezone(null, '+13125550123').zone).toBe('America/Chicago');
    expect(resolveTimezone(null, '+16025550123').zone).toBe('America/Phoenix');
    expect(resolveTimezone(null, '+19075550123').zone).toBe('America/Anchorage');
  });

  it('ignores an invalid stored timezone rather than trusting it', () => {
    // A typo in one record should not stop a campaign, but must not be used.
    expect(resolveTimezone('Mars/Olympus_Mons', '+13125550123')).toEqual({
      zone: 'America/Chicago',
      source: 'area_code',
    });
  });

  it('resolves to nothing when neither source can answer', () => {
    expect(resolveTimezone(null, null)).toEqual({ zone: null, source: 'none' });
    expect(resolveTimezone(null, '+442071234567')).toEqual({ zone: null, source: 'none' });
    // An unassigned NANP area code resolves to nothing rather than to a
    // neighbouring zone.
    expect(resolveTimezone(null, '+19995550123')).toEqual({ zone: null, source: 'none' });
  });
});

// ── Configuration ───────────────────────────────────────────────────────────

describe('smsConfigStatus', () => {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
  const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('reports every missing variable, not just the first', () => {
    for (const k of keys) delete process.env[k];
    const status = smsConfigStatus();

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(keys);
  });

  it('treats a missing from-number as disqualifying', () => {
    process.env['TWILIO_ACCOUNT_SID'] = 'AC123';
    process.env['TWILIO_AUTH_TOKEN'] = 'token';
    delete process.env['TWILIO_FROM_NUMBER'];

    // Credentials alone are not enough: Twilio rejects a send with no from
    // number, so reporting "configured" here would turn one configuration
    // mistake into a per-recipient failure.
    const status = smsConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(['TWILIO_FROM_NUMBER']);
  });

  it('reports configured only when all three are present', () => {
    process.env['TWILIO_ACCOUNT_SID'] = 'AC123';
    process.env['TWILIO_AUTH_TOKEN'] = 'token';
    process.env['TWILIO_FROM_NUMBER'] = '+15005550006';

    expect(smsConfigStatus()).toEqual({ configured: true, missing: [] });
  });
});

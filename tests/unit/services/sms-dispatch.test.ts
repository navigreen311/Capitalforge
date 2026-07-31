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
  QUIET_HOURS_START,
  QUIET_HOURS_END,
} from '../../../src/backend/services/sms-dispatch.service.js';

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
  const original = process.env['SMS_TIMEZONE_OFFSET_HOURS'];

  afterEach(() => {
    if (original === undefined) delete process.env['SMS_TIMEZONE_OFFSET_HOURS'];
    else process.env['SMS_TIMEZONE_OFFSET_HOURS'] = original;
  });

  it('permits contact inside the window', () => {
    delete process.env['SMS_TIMEZONE_OFFSET_HOURS'];
    expect(withinQuietHours(new Date(2026, 0, 1, QUIET_HOURS_START, 0))).toBe(true);
    expect(withinQuietHours(new Date(2026, 0, 1, 14, 0))).toBe(true);
    expect(withinQuietHours(new Date(2026, 0, 1, QUIET_HOURS_END - 1, 59))).toBe(true);
  });

  it('refuses contact outside it', () => {
    delete process.env['SMS_TIMEZONE_OFFSET_HOURS'];
    expect(withinQuietHours(new Date(2026, 0, 1, 3, 0))).toBe(false);
    expect(withinQuietHours(new Date(2026, 0, 1, 23, 30))).toBe(false);
    // The boundaries themselves: start is inclusive, end is not.
    expect(withinQuietHours(new Date(2026, 0, 1, QUIET_HOURS_START - 1, 59))).toBe(false);
    expect(withinQuietHours(new Date(2026, 0, 1, QUIET_HOURS_END, 0))).toBe(false);
  });

  it('shifts the window by the configured offset', () => {
    // 22:00 on a server running 3 hours behind the recipients is 01:00 for
    // them, which must be refused.
    process.env['SMS_TIMEZONE_OFFSET_HOURS'] = '3';
    expect(withinQuietHours(new Date(2026, 0, 1, 22, 0))).toBe(false);

    // 06:00 server time is 09:00 for them, which is inside the window.
    expect(withinQuietHours(new Date(2026, 0, 1, 6, 0))).toBe(true);
  });

  it('ignores a malformed offset rather than shifting by NaN', () => {
    process.env['SMS_TIMEZONE_OFFSET_HOURS'] = 'not-a-number';
    expect(withinQuietHours(new Date(2026, 0, 1, 14, 0))).toBe(true);
    expect(withinQuietHours(new Date(2026, 0, 1, 3, 0))).toBe(false);
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

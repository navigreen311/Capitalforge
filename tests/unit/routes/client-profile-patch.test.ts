// ============================================================
// PATCH /api/v1/clients/:clientId — coercing what a form sends
//
// The handler passed the request body straight to `prisma.business.updateMany`.
// `dateOfFormation` is a DateTime column and every date input in the app
// produces "YYYY-MM-DD", which Prisma rejects as not being ISO-8601. So every
// attempt to edit a client's formation date threw inside the driver and came
// back as a 500 — reported to the user as "Unable to update the client", which
// reads like a broken server rather than a value needing conversion.
//
// The modal swallowed that rejection, so the button appeared to do nothing.
//
// These pin the coercion rules the handler now applies before the write.
// ============================================================

import { describe, it, expect } from 'vitest';

/**
 * The transformation the PATCH handler performs on an accepted body.
 * Mirrors client-detail.routes.ts; kept here so the rules are pinned without
 * standing up Express and a database for a pure data question.
 */
function coerceProfileUpdate(updates: Record<string, unknown>):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string } {
  const data: Record<string, unknown> = { ...updates };

  if (data.dateOfFormation !== undefined && data.dateOfFormation !== null) {
    if (typeof data.dateOfFormation !== 'string' && !(data.dateOfFormation instanceof Date)) {
      return { ok: false, code: 'INVALID_DATE' };
    }
    const parsed = new Date(data.dateOfFormation as string);
    if (Number.isNaN(parsed.getTime())) return { ok: false, code: 'INVALID_DATE' };
    data.dateOfFormation = parsed;
  }

  for (const key of ['dba', 'ein', 'website', 'addressLine1', 'addressLine2',
                     'city', 'state', 'zip', 'businessEmail', 'phoneNumber',
                     'industry', 'naicsCode', 'mcc']) {
    if (data[key] === '') data[key] = null;
  }

  return { ok: true, data };
}

describe('PATCH client profile — dateOfFormation', () => {
  it('turns the date input format into a Date, which is what the column takes', () => {
    const r = coerceProfileUpdate({ dateOfFormation: '2021-03-15' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dateOfFormation).toBeInstanceOf(Date);
    expect((r.data.dateOfFormation as Date).toISOString()).toBe('2021-03-15T00:00:00.000Z');
  });

  it('accepts a full ISO timestamp too', () => {
    const r = coerceProfileUpdate({ dateOfFormation: '2021-03-15T00:00:00.000Z' });
    expect(r.ok).toBe(true);
  });

  it('rejects a date that is not one, rather than letting the driver throw', () => {
    // Previously a 500. A bad value from a form is the caller's problem to fix
    // and should say so.
    expect(coerceProfileUpdate({ dateOfFormation: 'not-a-date' })).toEqual({
      ok: false,
      code: 'INVALID_DATE',
    });
  });

  it('rejects a non-string, non-Date value', () => {
    expect(coerceProfileUpdate({ dateOfFormation: 12345 })).toEqual({
      ok: false,
      code: 'INVALID_DATE',
    });
  });

  it('passes null through, so a date can be cleared', () => {
    const r = coerceProfileUpdate({ dateOfFormation: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dateOfFormation).toBeNull();
  });

  it('leaves the field alone when it is not part of the update', () => {
    const r = coerceProfileUpdate({ legalName: 'Apex Ventures LLC' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('dateOfFormation' in r.data).toBe(false);
  });
});

describe('PATCH client profile — cleared text fields', () => {
  it('stores a cleared field as null rather than an empty string', () => {
    // "" would read back as a recorded value: a DBA that is the empty string
    // is not the same as a business that has none.
    const r = coerceProfileUpdate({ dba: '', website: '', city: '' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ dba: null, website: null, city: null });
  });

  it('does not blank a numeric zero', () => {
    // 0 employees is a fact; only empty strings mean "unset".
    const r = coerceProfileUpdate({ employees: 0, annualRevenue: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.employees).toBe(0);
    expect(r.data.annualRevenue).toBe(0);
  });

  it('keeps real values untouched', () => {
    const r = coerceProfileUpdate({ city: 'Austin', zip: '78751' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ city: 'Austin', zip: '78751' });
  });
});

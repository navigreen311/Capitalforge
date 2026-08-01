// ============================================================
// disclosure-filings-view — no filing status, by construction
//
// The page listed ten state disclosure filings with deadlines and statuses,
// two of them "Filed" with dates and confirmation references, and filing one
// minted a confirmation number with Math.random(). These pin the shape that
// makes that impossible to reintroduce by accident: the mapper has no
// concept of a filing status, and a missing record reads as missing.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toBusinessRow,
  toDisclosureInventory,
  statesRepresented,
  withoutState,
} from '../../../src/frontend/lib/disclosure-filings-view';

/** Captured from GET /api/compliance/disclosures. */
const REAL_RESPONSE = {
  businesses: [
    {
      businessId: 'seed-biz-001',
      businessName: 'Apex Digital Solutions LLC',
      stateOfFormation: 'DE',
      status: 'active',
    },
    {
      businessId: 'seed-biz-002',
      businessName: 'Meridian Health & Wellness S Corp',
      stateOfFormation: 'FL',
      status: 'onboarding',
    },
  ],
  obligations: [],
  obligationRegister: {
    exists: false,
    why: 'Which disclosure law binds which business is a legal determination.',
  },
  filingRecord: {
    exists: false,
    why: 'No table records a filing, its date, who made it, or a confirmation reference.',
  },
};

describe('toDisclosureInventory', () => {
  it('maps the businesses the API returns', () => {
    const inventory = toDisclosureInventory(REAL_RESPONSE);
    expect(inventory.businesses).toHaveLength(2);
    expect(inventory.businesses[0]).toEqual({
      businessId: 'seed-biz-001',
      businessName: 'Apex Digital Solutions LLC',
      stateOfFormation: 'DE',
      status: 'active',
    });
  });

  it('carries no filing status of any kind', () => {
    // Filed, Pending, Overdue and Draft were the four the page rendered, and
    // three of them are claims about an obligation or an act.
    const row = toDisclosureInventory(REAL_RESPONSE).businesses[0] as unknown as
      Record<string, unknown>;
    for (const field of ['filingStatus', 'status_', 'deadline', 'filedAt', 'confirmationRef']) {
      expect(row[field]).toBeUndefined();
    }
  });

  it('reads a missing register or filing record as missing', () => {
    const inventory = toDisclosureInventory(REAL_RESPONSE);
    expect(inventory.obligationRegister.exists).toBe(false);
    expect(inventory.filingRecord.exists).toBe(false);
    expect(inventory.filingRecord.why.length).toBeGreaterThan(0);
  });

  it('treats an absent statement as absent, not as present', () => {
    // The safe default is that the record is missing rather than that it is
    // there and simply was not described.
    const inventory = toDisclosureInventory({ businesses: [] });
    expect(inventory.obligationRegister.exists).toBe(false);
    expect(inventory.filingRecord.exists).toBe(false);
  });

  it('returns an empty inventory for junk', () => {
    expect(toDisclosureInventory(null).businesses).toEqual([]);
    expect(toDisclosureInventory({ businesses: 'nope' }).businesses).toEqual([]);
  });
});

describe('toBusinessRow', () => {
  it('drops a row with no id or name', () => {
    expect(toBusinessRow({ businessName: 'Acme' })).toBeNull();
    expect(toBusinessRow({ businessId: 'b1' })).toBeNull();
  });

  it('keeps a missing state null rather than guessing one', () => {
    const row = toBusinessRow({ businessId: 'b1', businessName: 'Acme', stateOfFormation: null });
    expect(row?.stateOfFormation).toBeNull();
  });
});

describe('statesRepresented', () => {
  it('lists the states in the data, deduplicated and sorted', () => {
    const rows = toDisclosureInventory({
      businesses: [
        { businessId: 'a', businessName: 'A', stateOfFormation: 'TX' },
        { businessId: 'b', businessName: 'B', stateOfFormation: 'DE' },
        { businessId: 'c', businessName: 'C', stateOfFormation: 'TX' },
      ],
    }).businesses;
    expect(statesRepresented(rows)).toEqual(['DE', 'TX']);
  });

  it('does not invent a state for a business that has none', () => {
    // The page covered "CA, NY, IL, TX, VA, UT" regardless of the data.
    const rows = toDisclosureInventory({
      businesses: [{ businessId: 'a', businessName: 'A', stateOfFormation: null }],
    }).businesses;
    expect(statesRepresented(rows)).toEqual([]);
    expect(withoutState(rows)).toBe(1);
  });
});

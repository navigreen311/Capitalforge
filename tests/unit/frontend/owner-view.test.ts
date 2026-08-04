// ============================================================
// toOwnerRows — joining the owners endpoint to the profile card
//
// `GET /api/v1/clients/:id/owners` returns BusinessOwner rows as stored:
// firstName, lastName, kycStatus. The card reads name, title,
// personalGuarantee and kycVerified. Not one of those names matched, so an
// owner on file rendered with a blank name, a blank title, "PG: No" and
// "KYC Pending" — the same card a business with no owners would show.
// ============================================================

import { describe, it, expect } from 'vitest';
import { toOwnerRow, toOwnerRows, totalOwnership } from '../../../src/frontend/lib/owner-view';

/** Captured from the endpoint. Decimal columns arrive as strings. */
const API_ROW = {
  id: 'own-1',
  businessId: 'biz-1',
  firstName: 'Marcus',
  lastName: 'Rivera',
  title: 'CEO',
  ownershipPercent: '100',
  ssn: null,
  ssnLast4: '7842',
  dateOfBirth: '1985-07-22T00:00:00.000Z',
  personalGuarantee: true,
  isBeneficialOwner: true,
  kycStatus: 'pending',
};

describe('toOwnerRow — the fields the card actually reads', () => {
  it('builds a display name from the two stored ones', () => {
    expect(toOwnerRow(API_ROW).name).toBe('Marcus Rivera');
  });

  it('carries the title through', () => {
    expect(toOwnerRow(API_ROW).title).toBe('CEO');
  });

  it('reads ownership from a string, which is how a Decimal arrives', () => {
    expect(toOwnerRow(API_ROW).ownershipPercent).toBe(100);
  });

  it('carries the personal guarantee through', () => {
    expect(toOwnerRow(API_ROW).personalGuarantee).toBe(true);
    expect(toOwnerRow({ ...API_ROW, personalGuarantee: false }).personalGuarantee).toBe(false);
  });
});

describe('toOwnerRow — KYC is only verified when it says so', () => {
  it('treats the recorded status as verified', () => {
    expect(toOwnerRow({ ...API_ROW, kycStatus: 'verified' }).kycVerified).toBe(true);
  });

  it.each(['pending', 'failed', '', undefined, null])(
    'does not claim verification for %s',
    (status) => {
      // A card claiming a verified identity is claiming a check nobody ran.
      expect(toOwnerRow({ ...API_ROW, kycStatus: status }).kycVerified).toBe(false);
    },
  );
});

describe('toOwnerRow — missing data', () => {
  it('says a name is not recorded rather than rendering an empty line', () => {
    expect(toOwnerRow({ id: 'own-2' }).name).toBe('Name not recorded');
  });

  it('falls back to zero ownership rather than NaN', () => {
    expect(toOwnerRow({ id: 'own-2', ownershipPercent: 'not-a-number' }).ownershipPercent).toBe(0);
  });

  it('leaves an absent title empty rather than printing undefined', () => {
    expect(toOwnerRow({ id: 'own-2' }).title).toBe('');
  });
});

describe('toOwnerRows', () => {
  it('maps a list', () => {
    expect(toOwnerRows([API_ROW])).toHaveLength(1);
  });

  it.each([null, undefined, {}, 'nope'])('returns an empty list for %s', (input) => {
    expect(toOwnerRows(input)).toEqual([]);
  });
});

describe('totalOwnership', () => {
  it('adds recorded ownership across owners', () => {
    const rows = toOwnerRows([
      { ...API_ROW, ownershipPercent: '60' },
      { ...API_ROW, id: 'own-2', ownershipPercent: '40' },
    ]);
    expect(totalOwnership(rows)).toBe(100);
  });

  it('is zero for no owners', () => {
    expect(totalOwnership([])).toBe(0);
  });
});

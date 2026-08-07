// ============================================================
// A signer is a person, not a business
//
// A signature request addressed `Business.businessEmail` and put an owner's
// name on the envelope. The name and the destination were describing two
// different parties, and nothing said so — a success looked identical whether
// it reached the person who signs or the company's general inbox.
//
// `BusinessOwner.email` exists now. These pin the selection rule and, just as
// hard, the reporting: the fallback must remain distinguishable from the real
// thing, because a fallback nobody can see is how the original defect lasted.
// ============================================================

import { describe, it, expect } from 'vitest';
import { selectSigner, type SignerCandidate } from '../../../src/backend/services/signer-selection';

function owner(over: Partial<SignerCandidate> = {}): SignerCandidate {
  return {
    id: 'o1',
    firstName: 'Dana',
    lastName: 'Reyes',
    email: null,
    isSignatory: false,
    ownershipPercent: 50,
    ...over,
  };
}

describe('which owner signs', () => {
  it('prefers the owner marked as signatory over the largest stake', () => {
    // Largest stake is a default, not a rule. A 60% owner may not be the
    // officer authorised to bind the company, and this is how that exception
    // gets recorded rather than being wrong quietly.
    const result = selectSigner(
      [
        owner({ id: 'big', firstName: 'Max', ownershipPercent: 60, email: 'max@co.test' }),
        owner({ id: 'off', firstName: 'Officer', ownershipPercent: 10, email: 'off@co.test', isSignatory: true }),
      ],
      'Northwind LLC',
      'hello@co.test',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerId).toBe('off');
    expect(result.reason).toMatch(/signatory/i);
  });

  it('falls back to the largest stake when nobody is marked', () => {
    const result = selectSigner(
      [
        owner({ id: 'small', ownershipPercent: 10, email: 'a@co.test' }),
        owner({ id: 'big', ownershipPercent: 90, email: 'b@co.test' }),
      ],
      'Northwind LLC',
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerId).toBe('big');
    expect(result.reason).toMatch(/largest/i);
  });

  it('does not depend on the order the caller passed', () => {
    // The query orders by stake today. A refactor dropping that `orderBy`
    // would otherwise silently change who signs a contract.
    const owners = [
      owner({ id: 'small', ownershipPercent: 10, email: 'a@co.test' }),
      owner({ id: 'big', ownershipPercent: 90, email: 'b@co.test' }),
    ];
    const forward = selectSigner(owners, 'N', null);
    const reversed = selectSigner([...owners].reverse(), 'N', null);
    expect(forward).toEqual(reversed);
  });

  it('says so when the marked signatory has no email and someone else was used', () => {
    // Routing around a recorded intention is a thing worth stating. Silence
    // here would present a default as a decision.
    const result = selectSigner(
      [
        owner({ id: 'off', ownershipPercent: 10, isSignatory: true, email: null }),
        owner({ id: 'big', ownershipPercent: 90, email: 'b@co.test' }),
      ],
      'Northwind LLC',
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerId).toBe('big');
    expect(result.reason).toMatch(/marked as signatory has no email/i);
  });

  it('reports whether the choice was a choice', () => {
    const one = selectSigner([owner({ email: 'a@co.test' })], 'N', null);
    const several = selectSigner(
      [owner({ id: 'a', email: 'a@co.test' }), owner({ id: 'b', email: 'b@co.test' })],
      'N',
      null,
    );
    expect(one.ok && one.hadAlternatives).toBe(false);
    expect(several.ok && several.hadAlternatives).toBe(true);
  });
});

describe('where the envelope actually goes', () => {
  it('addresses the owner when the owner has an address', () => {
    const result = selectSigner([owner({ email: 'dana@co.test' })], 'N', 'general@co.test');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toBe('dana@co.test');
    expect(result.addressKind).toBe('owner');
  });

  it('marks a business-address fallback as exactly that', () => {
    // The distinction that did not exist. Both paths produce a sent envelope;
    // only this field says whether it reached the person or the company.
    const result = selectSigner([owner({ email: null })], 'Northwind LLC', 'general@co.test');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toBe('general@co.test');
    expect(result.addressKind).toBe('business');
    expect(result.name).toBe('Dana Reyes');
    expect(result.reason).toMatch(/business address/i);
  });

  it('trims a padded address rather than sending to it', () => {
    const result = selectSigner([owner({ email: '  dana@co.test  ' })], 'N', null);
    expect(result.ok && result.email).toBe('dana@co.test');
  });

  it('treats a whitespace-only address as absent, not as an address', () => {
    const result = selectSigner([owner({ email: '   ' })], 'N', 'general@co.test');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.addressKind).toBe('business');
  });
});

describe('refusals, rather than sending somewhere plausible', () => {
  it('refuses when no owner is recorded', () => {
    const result = selectSigner([], 'Northwind LLC', 'general@co.test');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_OWNERS');
  });

  it('refuses when neither an owner nor the business has an address', () => {
    const result = selectSigner([owner({ email: null })], 'Northwind LLC', null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_SIGNER_EMAIL');
    expect(result.message).toMatch(/Northwind LLC/);
  });
});

describe('ownership stakes that are not numbers', () => {
  it('handles a Decimal arriving as a string', () => {
    // Prisma hands back Decimal. A string comparison would sort "9" above
    // "80", which is the kind of thing that quietly picks the wrong signer.
    const result = selectSigner(
      [
        owner({ id: 'nine', ownershipPercent: '9', email: 'a@co.test' }),
        owner({ id: 'eighty', ownershipPercent: '80', email: 'b@co.test' }),
      ],
      'N',
      null,
    );
    expect(result.ok && result.ownerId).toBe('eighty');
  });

  it('treats a missing stake as zero rather than skipping the owner', () => {
    const result = selectSigner([owner({ ownershipPercent: null, email: 'a@co.test' })], 'N', null);
    expect(result.ok && result.ownerId).toBe('o1');
  });
});

// ============================================================
// createBusinessSchema — the fields the onboarding wizard sends
//
// The schema is a bare `z.object()`, which strips keys it does not declare.
// It declared ten. The wizard sends the business address — which it will not
// let you past step one without — plus phone, email, website and employee
// count. Those were removed from the body during validation, so the create
// succeeded, returned 201, and stored a record with none of them. Nothing
// failed; the data was simply gone.
//
// These pin the accepted shape so a field cannot be dropped again by being
// left out of the schema.
// ============================================================

import { describe, it, expect } from 'vitest';
import { createBusinessSchema } from '../../../src/shared/validators/business.validators';

/** Exactly what the wizard's handleSubmit builds for the test client. */
const WIZARD_BODY = {
  legalName: 'Apex Ventures LLC',
  dba: 'Apex Ventures',
  ein: '82-1234567',
  entityType: 'llc',
  stateOfFormation: 'TX',
  dateOfFormation: '2021-03-15',
  industry: 'Technology',
  mcc: '7372',
  naicsCode: '5415',
  annualRevenue: 920000,
  monthlyRevenue: 76667,
  employees: 12,
  website: 'https://apexventures.io',
  addressLine1: '4500 Guadalupe St',
  addressLine2: 'Suite 200',
  city: 'Austin',
  state: 'TX',
  zip: '78751',
  phoneNumber: '(512) 555-0142',
  businessEmail: 'contact@apexventures.io',
};

describe('createBusinessSchema — nothing the wizard sends is silently dropped', () => {
  it('accepts the whole wizard body', () => {
    const parsed = createBusinessSchema.safeParse(WIZARD_BODY);
    expect(parsed.success).toBe(true);
  });

  it.each([
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'zip',
    'businessEmail',
    'phoneNumber',
    'website',
    'employees',
    'naicsCode',
  ])('keeps %s rather than stripping it', (field) => {
    const parsed = createBusinessSchema.parse(WIZARD_BODY) as Record<string, unknown>;
    expect(parsed[field]).toBeDefined();
  });

  it('keeps the address exactly as entered', () => {
    const parsed = createBusinessSchema.parse(WIZARD_BODY);
    expect(parsed.addressLine1).toBe('4500 Guadalupe St');
    expect(parsed.addressLine2).toBe('Suite 200');
    expect(parsed.city).toBe('Austin');
    expect(parsed.state).toBe('TX');
    expect(parsed.zip).toBe('78751');
  });
});

describe('createBusinessSchema — the new fields are still validated', () => {
  it('rejects a website that is not a URL', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, website: 'apexventures' });
    expect(r.success).toBe(false);
  });

  it('rejects a malformed ZIP', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, zip: '787' });
    expect(r.success).toBe(false);
  });

  it('accepts ZIP+4', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, zip: '78751-1234' });
    expect(r.success).toBe(true);
  });

  it('rejects a business email that is not an address', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, businessEmail: 'contact-at-apex' });
    expect(r.success).toBe(false);
  });

  it('rejects a fractional employee count', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, employees: 12.5 });
    expect(r.success).toBe(false);
  });

  it('rejects a state that is not a two-letter code', () => {
    const r = createBusinessSchema.safeParse({ ...WIZARD_BODY, state: 'Texas' });
    expect(r.success).toBe(false);
  });

  it('still requires only legalName and entityType', () => {
    // The address is required by the wizard, not by the API: a client created
    // through another path should not be forced to invent one.
    const r = createBusinessSchema.safeParse({ legalName: 'Minimal Co', entityType: 'llc' });
    expect(r.success).toBe(true);
  });
});

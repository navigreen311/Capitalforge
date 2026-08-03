// ============================================================
// bureau-client — refuses to invent a credit history
//
// Every adapter in this file generates its answer. A personal pull returned
// a FICO score of 640 + Math.random() * 160, a payment status that was
// "30_days_late" 12% of the time, a derogatory mark 8% of the time, and a
// utilisation drawn from Math.random() — the inputs to a lending decision,
// invented per call and different on every retry.
//
// Nothing imports the client, which is the only reason that did no harm. It
// is exactly the kind of file somebody wires up later assuming it works, so
// it fails closed: no credentials, no answer. The generators stay available
// behind BUREAU_MODE=synthetic for local work, and everything they produce
// is marked on the record.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BureauClient,
  BureauNotConfiguredError,
  isBureauConfigured,
  isSyntheticMode,
} from '../../../src/backend/integrations/credit-bureaus/bureau-client';

const CONSENT = {
  consentId: 'consent-1',
  subjectId: 'subject-1',
  purpose: 'credit_application' as const,
  capturedAt: new Date().toISOString(),
  ipAddress: '127.0.0.1',
};

/** A structurally valid SSN and EIN, so validation is not what refuses. */
const SSN = '123-45-6789';
const EIN = '12-3456789';

const ENV_KEYS = [
  'BUREAU_MODE',
  'EXPERIAN_CLIENT_ID',
  'TRANSUNION_CLIENT_ID',
  'EQUIFAX_CLIENT_ID',
  'DNB_API_KEY',
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('with no credentials and no synthetic mode', () => {
  it('refuses a personal pull rather than generating a score', async () => {
    const client = new BureauClient();
    await expect(client.pullCredit('experian', SSN, CONSENT)).rejects.toBeInstanceOf(
      BureauNotConfiguredError,
    );
  });

  it('refuses a business pull too', async () => {
    const client = new BureauClient();
    await expect(client.pullBusinessCredit('dnb', EIN)).rejects.toBeInstanceOf(
      BureauNotConfiguredError,
    );
  });

  it('says what is missing and what the figures would have been', async () => {
    const client = new BureauClient();
    await expect(client.pullCredit('experian', SSN, CONSENT)).rejects.toThrow(
      /EXPERIAN_CLIENT_ID is unset/,
    );
    await expect(client.pullCredit('experian', SSN, CONSENT)).rejects.toThrow(
      /generates its figures/,
    );
  });

  it('refuses before consent is validated', async () => {
    // The order matters: an invalid-consent error would send somebody looking
    // at the consent record for a problem that is a missing credential.
    const client = new BureauClient();
    const badConsent = { ...CONSENT, consentId: '' };
    await expect(client.pullCredit('experian', SSN, badConsent)).rejects.toBeInstanceOf(
      BureauNotConfiguredError,
    );
  });
});

describe('synthetic mode', () => {
  it('has to be asked for by name', () => {
    expect(isSyntheticMode()).toBe(false);
    process.env['NODE_ENV'] = 'test';
    // Not inferred from the environment: being outside production is not
    // consent to invent somebody's credit history, and a test environment is
    // where a generated score is most likely to be taken for a real one.
    expect(isSyntheticMode()).toBe(false);
    process.env['BUREAU_MODE'] = 'synthetic';
    expect(isSyntheticMode()).toBe(true);
  });

  it('marks every profile it produces', async () => {
    process.env['BUREAU_MODE'] = 'synthetic';
    const client = new BureauClient();

    const personal = await client.pullCredit('experian', SSN, CONSENT);
    expect(personal.profile.synthetic, 'a generated personal profile is marked').toBe(true);

    const business = await client.pullBusinessCredit('dnb', EIN);
    expect(business.profile.synthetic, 'a generated business profile is marked').toBe(true);
  });

  it('marks profiles from every bureau', async () => {
    process.env['BUREAU_MODE'] = 'synthetic';
    const client = new BureauClient();

    for (const bureau of ['experian', 'transunion', 'equifax'] as const) {
      const res = await client.pullCredit(bureau, SSN, CONSENT);
      expect(res.profile.synthetic, `${bureau} personal is marked`).toBe(true);
    }

    for (const bureau of ['experian', 'transunion', 'equifax', 'dnb'] as const) {
      const res = await client.pullBusinessCredit(bureau, EIN);
      expect(res.profile.synthetic, `${bureau} business is marked`).toBe(true);
    }
  });
});

describe('with credentials configured', () => {
  it('allows the pull to proceed past the gate', async () => {
    // The adapters still generate — replacing them with real HTTP calls is the
    // work this scaffold documents. What is pinned here is that the gate opens
    // on a credential and the result is still labelled for what it is.
    process.env['EXPERIAN_CLIENT_ID'] = 'test-client-id';
    expect(isBureauConfigured('experian')).toBe(true);
    expect(isBureauConfigured('transunion')).toBe(false);

    const client = new BureauClient();
    const res = await client.pullCredit('experian', SSN, CONSENT);
    expect(res.profile.synthetic).toBe(true);
  });

  it('treats a blank credential as absent', () => {
    process.env['EQUIFAX_CLIENT_ID'] = '   ';
    expect(isBureauConfigured('equifax')).toBe(false);
  });

  it('gates each bureau on its own credential', async () => {
    process.env['EXPERIAN_CLIENT_ID'] = 'test-client-id';
    const client = new BureauClient();

    // Configuring one bureau must not open the others.
    await expect(client.pullCredit('transunion', SSN, CONSENT)).rejects.toBeInstanceOf(
      BureauNotConfiguredError,
    );
  });
});

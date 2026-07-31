// ============================================================
// Compliance view mapping — unit tests
//
// The rules under test are the ones that decide whether a client with no
// assessment looks the same as a client that passed. Each is a distinct claim
// about a lending file, so none of them may collapse into another.
// ============================================================

import { describe, it, expect } from 'vitest';

import {
  describeComplianceScore,
  formatFindings,
  toComplianceCheckView,
  toRiskLevel,
  type ApiComplianceCheck,
} from '../../../src/frontend/lib/compliance-view.js';

// ── Score ───────────────────────────────────────────────────────────────────

describe('describeComplianceScore', () => {
  it('reports a null score as unassessed rather than as zero', () => {
    const display = describeComplianceScore(null);

    expect(display.unassessed).toBe(true);
    expect(display.label).toBe('Not assessed');
    // Neutral, not red: an underived score is not a finding against the client.
    expect(display.tone).toBe('neutral');
  });

  it('treats undefined and NaN the same as null', () => {
    expect(describeComplianceScore(undefined).unassessed).toBe(true);
    expect(describeComplianceScore(Number.NaN).unassessed).toBe(true);
  });

  it('keeps a real zero distinct from an absent score', () => {
    const zero = describeComplianceScore(0);

    expect(zero.unassessed).toBe(false);
    expect(zero.label).toBe('0/100');
    expect(zero.tone).toBe('bad');

    // The two must never render identically — this is the whole point.
    expect(zero.label).not.toBe(describeComplianceScore(null).label);
    expect(zero.tone).not.toBe(describeComplianceScore(null).tone);
  });

  it('bands a derived score', () => {
    expect(describeComplianceScore(95).tone).toBe('good');
    expect(describeComplianceScore(80).tone).toBe('good');
    expect(describeComplianceScore(79).tone).toBe('warn');
    expect(describeComplianceScore(60).tone).toBe('warn');
    expect(describeComplianceScore(59).tone).toBe('bad');
  });

  it('honours a non-default maximum', () => {
    expect(describeComplianceScore(30, 50).label).toBe('30/50');
  });
});

// ── Risk level ──────────────────────────────────────────────────────────────

describe('toRiskLevel', () => {
  it('passes through the levels the API can set', () => {
    expect(toRiskLevel('critical')).toBe('critical');
    expect(toRiskLevel('HIGH')).toBe('high');
    expect(toRiskLevel(' medium ')).toBe('medium');
    expect(toRiskLevel('low')).toBe('low');
  });

  it('maps an unset or unrecognised level to unknown, never to low', () => {
    // riskLevel is nullable in the schema. Defaulting to 'low' would paint an
    // unassessed obligation green.
    expect(toRiskLevel(null)).toBe('unknown');
    expect(toRiskLevel(undefined)).toBe('unknown');
    expect(toRiskLevel('')).toBe('unknown');
    expect(toRiskLevel('severe')).toBe('unknown');
  });
});

// ── Findings ────────────────────────────────────────────────────────────────

describe('formatFindings', () => {
  it('uses a plain string as-is', () => {
    expect(formatFindings('Consent revoked on the voice channel.')).toBe(
      'Consent revoked on the voice channel.',
    );
  });

  it('prefers a recognised summary field on an object', () => {
    expect(formatFindings({ summary: 'Two of three owners verified.', code: 'KYC_PARTIAL' })).toBe(
      'Two of three owners verified.',
    );
  });

  it('falls back to key/value pairs for an unrecognised object', () => {
    expect(formatFindings({ owners: 3, verified: 2 })).toBe('owners: 3, verified: 2');
  });

  it('joins array findings', () => {
    expect(formatFindings(['Missing W-9', 'Stale bank statement'])).toBe(
      'Missing W-9; Stale bank statement',
    );
  });

  it('says nothing is recorded rather than rendering empty or null JSON', () => {
    expect(formatFindings(null)).toBe('No findings recorded.');
    expect(formatFindings(undefined)).toBe('No findings recorded.');
    expect(formatFindings('   ')).toBe('No findings recorded.');
    expect(formatFindings({})).toBe('No findings recorded.');
    expect(formatFindings([])).toBe('No findings recorded.');
  });
});

// ── Row mapping ─────────────────────────────────────────────────────────────

describe('toComplianceCheckView', () => {
  const base: ApiComplianceCheck = {
    id: 'chk-1',
    checkType: 'state_law',
    riskScore: 40,
    riskLevel: 'high',
    findings: 'Illinois disclosure outstanding.',
    stateJurisdiction: 'IL',
    resolvedAt: null,
    createdAt: '2026-07-01T12:00:00.000Z',
  };

  it('derives status from resolvedAt', () => {
    expect(toComplianceCheckView(base).status).toBe('open');
    expect(toComplianceCheckView({ ...base, resolvedAt: '2026-07-10T09:00:00.000Z' }).status).toBe(
      'resolved',
    );
  });

  it('humanises the check type', () => {
    expect(toComplianceCheckView(base).checkType).toBe('STATE LAW');
  });

  it('labels a missing check type instead of rendering blank', () => {
    expect(toComplianceCheckView({ ...base, checkType: null }).checkType).toBe('UNSPECIFIED CHECK');
  });

  it('does not invent a date when none is stored', () => {
    expect(
      toComplianceCheckView({ ...base, resolvedAt: null, createdAt: null }).date,
    ).toBe('Date unknown');
    expect(toComplianceCheckView({ ...base, createdAt: 'not-a-date' }).date).toBe('Date unknown');
  });

  it('carries an unrated check through as unknown', () => {
    expect(toComplianceCheckView({ ...base, riskLevel: null }).riskLevel).toBe('unknown');
  });
});

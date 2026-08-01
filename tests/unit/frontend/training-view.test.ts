// ============================================================
// training-view — certifications and the track catalogue
//
// The page carried three tracks with their own modules and a per-advisor
// progress table showing completed certifications with expiry dates. Nobody
// sat any of it. These pin the mapping and the two judgments that decide
// whether somebody is allowed to work: nothing unrecognised is a pass, and a
// pass past its expiry is not current however the status column reads.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  toCertification,
  toCertifications,
  toTrack,
  toTracks,
  toCertStatus,
  isCurrentlyValid,
  daysUntilExpiry,
  standings,
  summarise,
  humanise,
} from '../../../src/frontend/lib/training-view';

const NOW = new Date('2026-08-01T00:00:00.000Z');

/** Captured from GET /api/training/certifications. */
const REAL_CERT = {
  id: 'seed-cert-003',
  tenantId: '9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b',
  userId: '35810869-77f9-47fd-8a90-916807f0d325',
  trackName: 'onboarding',
  status: 'passed',
  score: 88,
  completedAt: '2025-07-14T00:00:00.000Z',
  expiresAt: null,
  certificateRef: null,
};

/** Captured from GET /api/training/tracks. */
const REAL_TRACK = {
  name: 'annual',
  label: 'Annual Compliance Renewal Certification',
  description: 'Annual renewal to maintain active advisor status.',
  expiryMonths: 12,
  passingScore: 75,
  prerequisiteTracks: ['onboarding'],
  totalMinutes: 55,
  modules: [
    {
      id: 'mod-ann-001',
      title: 'Regulatory Updates',
      description: 'Changes to UDAAP guidance and enforcement priorities.',
      topics: ['Recent enforcement actions and lessons', 'State-specific disclosure law changes'],
      bannedClaimCategories: ['guaranteed_approval'],
      estimatedMinutes: 25,
      lessons: ['Never use "guaranteed approval" language.'],
    },
  ],
};

describe('toCertification', () => {
  it('maps a real certification', () => {
    expect(toCertification(REAL_CERT)).toMatchObject({
      id: 'seed-cert-003',
      trackName: 'onboarding',
      status: 'passed',
      score: 88,
      expiresAt: null,
    });
  });

  it('leaves an unscored attempt null rather than zero', () => {
    expect(toCertification({ ...REAL_CERT, score: null })?.score).toBeNull();
  });

  it('drops a record with no id', () => {
    expect(toCertification({ trackName: 'onboarding' })).toBeNull();
  });

  it('reads the list envelope', () => {
    expect(toCertifications({ data: [REAL_CERT] })).toHaveLength(1);
    expect(toCertifications(null)).toEqual([]);
  });
});

describe('toCertStatus', () => {
  it('accepts every status the API records', () => {
    for (const s of ['not_started', 'in_progress', 'passed', 'failed', 'expired']) {
      expect(toCertStatus(s)).toBe(s);
    }
  });

  it('falls back to not_started, never to passed', () => {
    // A pass is the record that somebody completed mandatory training. It
    // has to come from an attempt, not from a fallback.
    expect(toCertStatus('complete')).toBe('not_started');
    expect(toCertStatus(undefined)).toBe('not_started');
  });
});

describe('toTrack', () => {
  it('maps a real track', () => {
    expect(toTrack(REAL_TRACK)).toMatchObject({
      name: 'annual',
      expiryMonths: 12,
      passingScore: 75,
      prerequisiteTracks: ['onboarding'],
      totalMinutes: 55,
    });
  });

  it('keeps the lessons and carries no enforcement cases', () => {
    // The service strips them: they name parties, penalties and docket-style
    // references that are not real, and this is compliance training.
    const module = toTrack(REAL_TRACK)?.modules[0] as unknown as Record<string, unknown>;
    expect(module['lessons']).toEqual(['Never use "guaranteed approval" language.']);
    expect(module['enforcementCases']).toBeUndefined();
  });

  it('drops a module with no id or title', () => {
    const t = toTrack({ ...REAL_TRACK, modules: [{ description: 'x' }] });
    expect(t?.modules).toEqual([]);
  });

  it('drops a track with no name', () => {
    expect(toTrack({ label: 'Nameless' })).toBeNull();
  });

  it('reads the list envelope', () => {
    expect(toTracks({ data: [REAL_TRACK] })).toHaveLength(1);
    expect(toTracks('nope')).toEqual([]);
  });
});

describe('isCurrentlyValid', () => {
  const cert = (over: Record<string, unknown>) =>
    toCertification({ ...REAL_CERT, ...over })!;

  it('is true for a pass that does not expire', () => {
    expect(isCurrentlyValid(cert({ status: 'passed', expiresAt: null }), NOW)).toBe(true);
  });

  it('is true for a pass that has not yet expired', () => {
    expect(
      isCurrentlyValid(cert({ status: 'passed', expiresAt: '2027-01-01T00:00:00.000Z' }), NOW),
    ).toBe(true);
  });

  it('is false for a pass whose expiry has gone by', () => {
    // Whatever the status column says. Expiry is a date, and the sweep that
    // marks records expired may not have run.
    expect(
      isCurrentlyValid(cert({ status: 'passed', expiresAt: '2026-01-01T00:00:00.000Z' }), NOW),
    ).toBe(false);
  });

  it('is false for anything that is not a pass', () => {
    for (const status of ['in_progress', 'failed', 'not_started', 'expired']) {
      expect(isCurrentlyValid(cert({ status, expiresAt: null }), NOW)).toBe(false);
    }
  });

  it('is false when the expiry cannot be read', () => {
    expect(isCurrentlyValid(cert({ status: 'passed', expiresAt: 'not a date' }), NOW)).toBe(false);
  });
});

describe('daysUntilExpiry', () => {
  it('counts the days left', () => {
    const cert = toCertification({ ...REAL_CERT, expiresAt: '2026-08-31T00:00:00.000Z' })!;
    expect(daysUntilExpiry(cert, NOW)).toBe(30);
  });

  it('is null when the certification does not expire', () => {
    expect(daysUntilExpiry(toCertification(REAL_CERT)!, NOW)).toBeNull();
  });

  it('goes negative once lapsed, rather than clamping to zero', () => {
    const cert = toCertification({ ...REAL_CERT, expiresAt: '2026-07-01T00:00:00.000Z' })!;
    expect(daysUntilExpiry(cert, NOW)).toBeLessThan(0);
  });
});

describe('standings', () => {
  const tracks = toTracks([
    { ...REAL_TRACK, name: 'onboarding', prerequisiteTracks: [] },
    REAL_TRACK,
  ]);

  it('pairs each track with its certification', () => {
    const rows = standings(tracks, toCertifications([REAL_CERT]), NOW);
    expect(rows[0].certification?.id).toBe('seed-cert-003');
    expect(rows[0].valid).toBe(true);
    expect(rows[1].certification).toBeNull();
  });

  it('reports a track with no record as not started, not failed', () => {
    const rows = standings(tracks, [], NOW);
    expect(rows.every((r) => r.certification === null)).toBe(true);
    expect(rows.every((r) => r.valid === false)).toBe(true);
  });

  it('names prerequisites that are not currently held', () => {
    // The annual track requires onboarding. Without a valid onboarding
    // certification, that is a real blocker rather than a footnote.
    const rows = standings(tracks, [], NOW);
    expect(rows[1].missingPrerequisites).toEqual(['onboarding']);
  });

  it('clears the prerequisite once it is validly held', () => {
    const rows = standings(tracks, toCertifications([REAL_CERT]), NOW);
    expect(rows[1].missingPrerequisites).toEqual([]);
  });

  it('does not accept a lapsed certification as a prerequisite', () => {
    const lapsed = toCertifications([
      { ...REAL_CERT, status: 'passed', expiresAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(standings(tracks, lapsed, NOW)[1].missingPrerequisites).toEqual(['onboarding']);
  });
});

describe('summarise', () => {
  const tracks = toTracks([
    { ...REAL_TRACK, name: 'onboarding', prerequisiteTracks: [] },
    REAL_TRACK,
  ]);

  it('counts what is held, lapsed, started and untouched', () => {
    const certs = toCertifications([
      REAL_CERT,
      { ...REAL_CERT, id: 'b', trackName: 'annual', status: 'in_progress', completedAt: null },
    ]);
    expect(summarise(standings(tracks, certs, NOW), NOW)).toMatchObject({
      tracks: 2,
      certified: 1,
      inProgress: 1,
      notStarted: 0,
    });
  });

  it('counts a lapsed pass separately from one never taken', () => {
    // Somebody who was certified and no longer is, versus somebody who never
    // was: the same blank on a progress bar, two different conversations.
    const certs = toCertifications([
      { ...REAL_CERT, status: 'passed', expiresAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const s = summarise(standings(tracks, certs, NOW), NOW);
    expect(s.certified).toBe(0);
    expect(s.lapsed).toBe(1);
    expect(s.notStarted).toBe(1);
  });
});

describe('humanise', () => {
  it('turns API keys into words', () => {
    expect(humanise('in_progress')).toBe('In progress');
    expect(humanise('guaranteed_approval')).toBe('Guaranteed approval');
  });
});

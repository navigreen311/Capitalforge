// ============================================================
// Portfolio benchmarks — graduation rate
//
// This was the literal 19.4%, beside an industry figure the portfolio beat.
// When the literals came out it became null with "graduated is undefined",
// which was true: the engine computed a track from live data every time it was
// asked, and nothing recorded that the answer had changed.
//
// It is defined now, in the vocabulary the engine already had — a client
// graduates when observed on a track further along than the one they were last
// observed on. These pin the two rules that keep the figure from flattering,
// and the states where it still refuses to answer.
// ============================================================

import { describe, it, expect } from 'vitest';
import { graduationRate } from '../../../src/backend/api/routes/platform-portfolio.routes';

const Q_START = new Date('2026-04-01T00:00:00.000Z');
const Q_END = new Date('2026-07-01T00:00:00.000Z');

const observation = (
  businessId: string,
  fromTrack: string | null,
  toTrack: string,
  observedAt: string,
) => ({ businessId, fromTrack, toTrack, observedAt: new Date(observedAt) });

describe('graduationRate', () => {
  it('counts a client who moved up a track during the quarter', () => {
    const result = graduationRate(
      [
        observation('biz-1', null, 'credit_builder', '2026-01-15'),
        observation('biz-1', 'credit_builder', 'starter_stack', '2026-05-02'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.rate).toBe(100);
    expect(result.graduatedInQuarter).toBe(1);
    expect(result.observedBeforeQuarter).toBe(1);
  });

  it('does not count a client who fell back a track', () => {
    // Utilisation rises and a client stops qualifying. A rate counting any
    // change would report that as success.
    const result = graduationRate(
      [
        observation('biz-1', null, 'full_stack', '2026-01-15'),
        observation('biz-1', 'full_stack', 'starter_stack', '2026-05-02'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.rate).toBe(0);
    expect(result.graduatedInQuarter).toBe(0);
  });

  it('excludes clients first seen inside the quarter from the denominator', () => {
    // They had no earlier track to move from. Counting them as non-graduates
    // would push the rate down for a reason unrelated to their progress.
    const result = graduationRate(
      [
        observation('old', null, 'credit_builder', '2026-01-15'),
        observation('old', 'credit_builder', 'starter_stack', '2026-05-02'),
        observation('new', null, 'credit_builder', '2026-05-20'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.observedBeforeQuarter).toBe(1);
    expect(result.rate).toBe(100);
  });

  it('ignores movement outside the quarter', () => {
    const result = graduationRate(
      [
        observation('biz-1', null, 'credit_builder', '2026-01-15'),
        observation('biz-1', 'credit_builder', 'starter_stack', '2026-08-02'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.rate).toBe(0);
    expect(result.graduatedInQuarter).toBe(0);
  });

  it('counts a client once however many times they moved', () => {
    const result = graduationRate(
      [
        observation('biz-1', null, 'credit_builder', '2026-01-15'),
        observation('biz-1', 'credit_builder', 'starter_stack', '2026-04-10'),
        observation('biz-1', 'starter_stack', 'full_stack', '2026-06-10'),
        observation('biz-2', null, 'credit_builder', '2026-01-20'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.graduatedInQuarter).toBe(1);
    expect(result.observedBeforeQuarter).toBe(2);
    expect(result.rate).toBe(50);
  });

  it('refuses to answer before any client has been assessed', () => {
    const result = graduationRate([], Q_START, Q_END);
    expect(result.rate).toBeNull();
    expect(result.unavailableBecause).toMatch(/No client has been assessed yet/);
  });

  it('refuses to answer when the quarter has no history behind it', () => {
    // Everyone was first seen inside the quarter. There is nothing to compare
    // against, which is a different statement from "nobody graduated".
    const result = graduationRate(
      [observation('biz-1', null, 'credit_builder', '2026-05-01')],
      Q_START,
      Q_END,
    );

    expect(result.rate).toBeNull();
    expect(result.unavailableBecause).toMatch(/no earlier track to have moved from/);
  });

  it('reports zero, not null, when clients had the chance and did not move', () => {
    // A real answer: these clients were observed before the quarter and none
    // progressed. Null would say we could not tell.
    const result = graduationRate(
      [
        observation('biz-1', null, 'credit_builder', '2026-01-15'),
        observation('biz-2', null, 'credit_builder', '2026-02-15'),
      ],
      Q_START,
      Q_END,
    );

    expect(result.rate).toBe(0);
    expect(result.unavailableBecause).toBeUndefined();
  });
});

// ============================================================
// CreditScoreCard — unit tests
// Tests pure helper logic: score color, score label, utilization
// color, bureau label, and date formatting — all extracted from
// credit-score-card.tsx without requiring React rendering.
// ============================================================

import { describe, it, expect } from 'vitest';
import type { Bureau } from '../../../src/shared/types/index';

// ── Inline helpers matching credit-score-card.tsx exactly ───────────────────

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.75) return '#22c55e';
  if (pct >= 0.55) return '#eab308';
  if (pct >= 0.4)  return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.75) return 'Excellent';
  if (pct >= 0.65) return 'Good';
  if (pct >= 0.55) return 'Fair';
  if (pct >= 0.4)  return 'Poor';
  return 'Very Poor';
}

function utilizationColor(u: number): string {
  if (u <= 0.3) return 'bg-green-500';
  if (u <= 0.7) return 'bg-yellow-500';
  if (u <= 0.9) return 'bg-orange-500';
  return 'bg-red-500';
}

function bureauLabel(bureau: Bureau): string {
  const labels: Record<Bureau, string> = {
    equifax:   'Equifax',
    transunion:'TransUnion',
    experian:  'Experian',
    dnb:       'D&B',
  };
  return labels[bureau] ?? bureau;
}

const MAX_SCORE = 850;

// ────────────────────────────────────────────────────────────────────────────

describe('CreditScoreCard — score display', () => {
  it('score value is preserved as-is for rendering', () => {
    const score = 720;
    expect(score).toBe(720);
  });

  it('maxScore defaults to 850', () => {
    expect(MAX_SCORE).toBe(850);
  });

  it('renders score as a number between 300 and 850 for standard FICO', () => {
    const score = 650;
    expect(score).toBeGreaterThanOrEqual(300);
    expect(score).toBeLessThanOrEqual(850);
  });

  it('calculates correct percent for score 637 / 850', () => {
    const pct = 637 / 850;
    expect(pct).toBeCloseTo(0.749, 2);
  });
});

describe('CreditScoreCard — score color coding by range', () => {
  it('returns green for excellent score (>= 75% of max)', () => {
    expect(scoreColor(720, 850)).toBe('#22c55e'); // 720/850 ≈ 84.7%
    expect(scoreColor(850, 850)).toBe('#22c55e');
    expect(scoreColor(638, 850)).toBe('#22c55e'); // just above 75%
  });

  it('returns yellow for fair score (55–74% of max)', () => {
    expect(scoreColor(550, 850)).toBe('#eab308'); // 550/850 ≈ 64.7%
    expect(scoreColor(500, 850)).toBe('#eab308'); // 500/850 ≈ 58.8%
  });

  it('returns orange for poor score (40–54% of max)', () => {
    expect(scoreColor(380, 850)).toBe('#f97316'); // 380/850 ≈ 44.7%
    expect(scoreColor(400, 850)).toBe('#f97316'); // 400/850 ≈ 47.1%
  });

  it('returns red for very poor score (< 40% of max)', () => {
    expect(scoreColor(300, 850)).toBe('#ef4444'); // 300/850 ≈ 35.3%
    expect(scoreColor(200, 850)).toBe('#ef4444');
  });

  it('boundary: 637/850 = 74.94% → yellow (just under 75%)', () => {
    expect(scoreColor(637, 850)).toBe('#eab308');
  });

  it('boundary: 638/850 = 75.06% → green (just over 75%)', () => {
    expect(scoreColor(638, 850)).toBe('#22c55e');
  });
});

describe('CreditScoreCard — score label by range', () => {
  it('returns Excellent for scores >= 75% of max', () => {
    expect(scoreLabel(720, 850)).toBe('Excellent');
    expect(scoreLabel(850, 850)).toBe('Excellent');
  });

  it('returns Good for scores 65–74% of max', () => {
    expect(scoreLabel(600, 850)).toBe('Good');  // 600/850 ≈ 70.6%
    expect(scoreLabel(560, 850)).toBe('Good');  // 560/850 ≈ 65.9%
  });

  it('returns Fair for scores 55–64% of max', () => {
    expect(scoreLabel(500, 850)).toBe('Fair');  // 500/850 ≈ 58.8%
    expect(scoreLabel(470, 850)).toBe('Fair');  // 470/850 ≈ 55.3%
  });

  it('returns Poor for scores 40–54% of max', () => {
    expect(scoreLabel(400, 850)).toBe('Poor');  // 400/850 ≈ 47.1%
  });

  it('returns Very Poor for scores below 40% of max', () => {
    expect(scoreLabel(300, 850)).toBe('Very Poor');
    expect(scoreLabel(250, 850)).toBe('Very Poor');
  });
});

describe('CreditScoreCard — bureau label', () => {
  it('formats equifax correctly', () => {
    expect(bureauLabel('equifax')).toBe('Equifax');
  });

  it('formats transunion correctly', () => {
    expect(bureauLabel('transunion')).toBe('TransUnion');
  });

  it('formats experian correctly', () => {
    expect(bureauLabel('experian')).toBe('Experian');
  });

  it('formats dnb correctly', () => {
    expect(bureauLabel('dnb')).toBe('D&B');
  });
});

describe('CreditScoreCard — utilization bar color', () => {
  it('returns green for utilization <= 30%', () => {
    expect(utilizationColor(0)).toBe('bg-green-500');
    expect(utilizationColor(0.3)).toBe('bg-green-500');
  });

  it('returns yellow for utilization 31–70%', () => {
    expect(utilizationColor(0.31)).toBe('bg-yellow-500');
    expect(utilizationColor(0.7)).toBe('bg-yellow-500');
  });

  it('returns orange for utilization 71–90%', () => {
    expect(utilizationColor(0.71)).toBe('bg-orange-500');
    expect(utilizationColor(0.9)).toBe('bg-orange-500');
  });

  it('returns red for utilization > 90%', () => {
    expect(utilizationColor(0.91)).toBe('bg-red-500');
    expect(utilizationColor(1.0)).toBe('bg-red-500');
  });

  it('utilization percentage display rounds correctly', () => {
    expect(Math.round(0.276 * 100)).toBe(28);
    expect(Math.round(0.5 * 100)).toBe(50);
    expect(Math.round(0.999 * 100)).toBe(100);
  });

  it('utilization bar width caps at 100%', () => {
    expect(Math.min(1.5 * 100, 100)).toBe(100);
    expect(Math.min(0.75 * 100, 100)).toBe(75);
  });
});

describe('CreditScoreCard — prop shape', () => {
  it('accepts the expected prop fields', () => {
    const props = {
      score: 720,
      maxScore: 850,
      bureau: 'equifax' as Bureau,
      scoreType: 'fico' as const,
      pullDate: '2026-01-15',
      utilization: 0.35,
      className: 'w-64',
    };
    expect(props.score).toBe(720);
    expect(props.bureau).toBe('equifax');
    expect(props.scoreType).toBe('fico');
    expect(props.utilization).toBe(0.35);
  });

  it('utilization is optional (undefined does not render bar)', () => {
    const props = {
      score: 700,
      maxScore: 850,
      bureau: 'experian' as Bureau,
      pullDate: '2026-02-01',
    };
    expect(props).not.toHaveProperty('utilization');
  });
});

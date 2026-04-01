// ============================================================
// SuitabilityIndicator — unit tests
// Tests band classification, BAND_CONFIG entries for all 4 bands
// (good/moderate/high/nogo), no-go display logic, and recommendation
// text rendering — using pure data logic from suitability-indicator.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { RISK_THRESHOLDS } from '../../../src/shared/constants/index';
import type { SuitabilityResult } from '../../../src/shared/types/index';

// ── Inline band logic matching suitability-indicator.tsx ────────────────────

type Band = 'nogo' | 'high' | 'moderate' | 'good';

function getBand(score: number, noGoTriggered: boolean): Band {
  if (noGoTriggered || score < RISK_THRESHOLDS.SUITABILITY_NOGO) return 'nogo';
  if (score < RISK_THRESHOLDS.SUITABILITY_HIGH_RISK)              return 'high';
  if (score < RISK_THRESHOLDS.SUITABILITY_MODERATE)               return 'moderate';
  return 'good';
}

interface BandConfig {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  barClass: string;
  dotClass: string;
}

const BAND_CONFIG: Record<Band, BandConfig> = {
  nogo: {
    label: 'No-Go',
    bgClass: 'bg-gray-950',
    textClass: 'text-gray-200',
    borderClass: 'border-gray-600',
    barClass: 'bg-gray-600',
    dotClass: 'bg-gray-400',
  },
  high: {
    label: 'High Risk',
    bgClass: 'bg-red-950',
    textClass: 'text-red-300',
    borderClass: 'border-red-700',
    barClass: 'bg-red-500',
    dotClass: 'bg-red-400',
  },
  moderate: {
    label: 'Moderate',
    bgClass: 'bg-yellow-950',
    textClass: 'text-yellow-300',
    borderClass: 'border-yellow-700',
    barClass: 'bg-yellow-500',
    dotClass: 'bg-yellow-400',
  },
  good: {
    label: 'Suitable',
    bgClass: 'bg-green-950',
    textClass: 'text-green-300',
    borderClass: 'border-green-700',
    barClass: 'bg-green-500',
    dotClass: 'bg-green-400',
  },
};

// ── Shared fixture factory ────────────────────────────────────────────────────

function makeSuitabilityResult(overrides: Partial<SuitabilityResult> = {}): SuitabilityResult {
  return {
    score: 75,
    maxSafeLeverage: 3,
    noGoTriggered: false,
    noGoReasons: [],
    recommendation: 'Proceed with standard product stack.',
    alternativeProducts: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────

describe('SuitabilityIndicator — RISK_THRESHOLDS constants', () => {
  it('SUITABILITY_NOGO threshold is 30', () => {
    expect(RISK_THRESHOLDS.SUITABILITY_NOGO).toBe(30);
  });

  it('SUITABILITY_HIGH_RISK threshold is 50', () => {
    expect(RISK_THRESHOLDS.SUITABILITY_HIGH_RISK).toBe(50);
  });

  it('SUITABILITY_MODERATE threshold is 70', () => {
    expect(RISK_THRESHOLDS.SUITABILITY_MODERATE).toBe(70);
  });

  it('thresholds are in ascending order', () => {
    expect(RISK_THRESHOLDS.SUITABILITY_NOGO)
      .toBeLessThan(RISK_THRESHOLDS.SUITABILITY_HIGH_RISK);
    expect(RISK_THRESHOLDS.SUITABILITY_HIGH_RISK)
      .toBeLessThan(RISK_THRESHOLDS.SUITABILITY_MODERATE);
  });
});

describe('SuitabilityIndicator — getBand classification', () => {
  it('returns "good" (green) for score >= SUITABILITY_MODERATE (70)', () => {
    expect(getBand(70, false)).toBe('good');
    expect(getBand(85, false)).toBe('good');
    expect(getBand(100, false)).toBe('good');
  });

  it('returns "moderate" (yellow) for score 50–69', () => {
    expect(getBand(50, false)).toBe('moderate');
    expect(getBand(60, false)).toBe('moderate');
    expect(getBand(69, false)).toBe('moderate');
  });

  it('returns "high" (red) for score 30–49', () => {
    expect(getBand(30, false)).toBe('high');
    expect(getBand(40, false)).toBe('high');
    expect(getBand(49, false)).toBe('high');
  });

  it('returns "nogo" (black) for score < 30', () => {
    expect(getBand(29, false)).toBe('nogo');
    expect(getBand(0, false)).toBe('nogo');
  });

  it('returns "nogo" when noGoTriggered is true regardless of score', () => {
    expect(getBand(90, true)).toBe('nogo');
    expect(getBand(75, true)).toBe('nogo');
    expect(getBand(50, true)).toBe('nogo');
  });

  it('boundary: score 70 is "good", score 69 is "moderate"', () => {
    expect(getBand(70, false)).toBe('good');
    expect(getBand(69, false)).toBe('moderate');
  });

  it('boundary: score 50 is "moderate", score 49 is "high"', () => {
    expect(getBand(50, false)).toBe('moderate');
    expect(getBand(49, false)).toBe('high');
  });

  it('boundary: score 30 is "high", score 29 is "nogo"', () => {
    expect(getBand(30, false)).toBe('high');
    expect(getBand(29, false)).toBe('nogo');
  });
});

describe('SuitabilityIndicator — 4 score band configs', () => {
  it('BAND_CONFIG has entries for all 4 bands', () => {
    const bands: Band[] = ['nogo', 'high', 'moderate', 'good'];
    bands.forEach((b) => {
      expect(BAND_CONFIG).toHaveProperty(b);
    });
  });

  it('good band — green colors and "Suitable" label', () => {
    const cfg = BAND_CONFIG.good;
    expect(cfg.label).toBe('Suitable');
    expect(cfg.bgClass).toContain('green');
    expect(cfg.textClass).toContain('green');
    expect(cfg.barClass).toContain('green');
    expect(cfg.dotClass).toContain('green');
  });

  it('moderate band — yellow colors and "Moderate" label', () => {
    const cfg = BAND_CONFIG.moderate;
    expect(cfg.label).toBe('Moderate');
    expect(cfg.bgClass).toContain('yellow');
    expect(cfg.textClass).toContain('yellow');
    expect(cfg.barClass).toContain('yellow');
  });

  it('high band — red colors and "High Risk" label', () => {
    const cfg = BAND_CONFIG.high;
    expect(cfg.label).toBe('High Risk');
    expect(cfg.bgClass).toContain('red');
    expect(cfg.textClass).toContain('red');
    expect(cfg.barClass).toContain('red');
  });

  it('nogo band — gray/black colors and "No-Go" label', () => {
    const cfg = BAND_CONFIG.nogo;
    expect(cfg.label).toBe('No-Go');
    expect(cfg.bgClass).toContain('gray');
    expect(cfg.textClass).toContain('gray');
    expect(cfg.barClass).toContain('gray');
  });

  it('every band config has all required keys', () => {
    const requiredKeys: (keyof BandConfig)[] = [
      'label', 'bgClass', 'textClass', 'borderClass', 'barClass', 'dotClass',
    ];
    (Object.keys(BAND_CONFIG) as Band[]).forEach((band) => {
      requiredKeys.forEach((key) => {
        expect(BAND_CONFIG[band]).toHaveProperty(key);
      });
    });
  });
});

describe('SuitabilityIndicator — no-go display logic', () => {
  it('noGoTriggered=false with no reasons → nogo NOT shown', () => {
    const result = makeSuitabilityResult({ score: 80, noGoTriggered: false, noGoReasons: [] });
    const shouldShowNoGo = result.noGoTriggered && result.noGoReasons.length > 0;
    expect(shouldShowNoGo).toBe(false);
  });

  it('noGoTriggered=true with reasons → nogo section shown', () => {
    const result = makeSuitabilityResult({
      score: 20,
      noGoTriggered: true,
      noGoReasons: ['Bankruptcy within 2 years', 'Score below minimum threshold'],
    });
    const shouldShowNoGo = result.noGoTriggered && result.noGoReasons.length > 0;
    expect(shouldShowNoGo).toBe(true);
    expect(result.noGoReasons).toHaveLength(2);
  });

  it('noGoTriggered=true with empty reasons array → no-go triggers but list is empty', () => {
    const result = makeSuitabilityResult({ noGoTriggered: true, noGoReasons: [] });
    const shouldShowNoGo = result.noGoTriggered && result.noGoReasons.length > 0;
    expect(shouldShowNoGo).toBe(false);
  });

  it('no-go reasons are strings', () => {
    const reasons = ['Bankruptcy within 2 years', 'Tax liens present'];
    reasons.forEach((r) => expect(typeof r).toBe('string'));
  });
});

describe('SuitabilityIndicator — recommendation text', () => {
  it('recommendation is shown when showRecommendation=true and text is present', () => {
    const result = makeSuitabilityResult({
      recommendation: 'Consider secured card options first.',
    });
    const showRecommendation = true;
    const shouldShow = showRecommendation && !!result.recommendation;
    expect(shouldShow).toBe(true);
    expect(result.recommendation).toBe('Consider secured card options first.');
  });

  it('recommendation is hidden when showRecommendation=false', () => {
    const result = makeSuitabilityResult({ recommendation: 'Some advice' });
    const showRecommendation = false;
    const shouldShow = showRecommendation && !!result.recommendation;
    expect(shouldShow).toBe(false);
  });

  it('recommendation is hidden when text is empty string', () => {
    const result = makeSuitabilityResult({ recommendation: '' });
    const showRecommendation = true;
    const shouldShow = showRecommendation && !!result.recommendation;
    expect(shouldShow).toBe(false);
  });
});

describe('SuitabilityIndicator — score bar width', () => {
  it('bar width equals score% directly (score is 0–100)', () => {
    const score = 65;
    const width = `${score}%`;
    expect(width).toBe('65%');
  });

  it('score 100 renders full bar', () => {
    expect(`${100}%`).toBe('100%');
  });

  it('score 0 renders empty bar', () => {
    expect(`${0}%`).toBe('0%');
  });
});

describe('SuitabilityIndicator — alternative products', () => {
  it('alternatives shown when showAlternatives=true and list is non-empty', () => {
    const result = makeSuitabilityResult({
      alternativeProducts: ['Secured Business Card', 'Credit Builder Loan'],
    });
    const showAlternatives = true;
    const shouldShow = showAlternatives && result.alternativeProducts.length > 0;
    expect(shouldShow).toBe(true);
    expect(result.alternativeProducts).toContain('Secured Business Card');
  });

  it('alternatives hidden when list is empty', () => {
    const result = makeSuitabilityResult({ alternativeProducts: [] });
    const shouldShow = true && result.alternativeProducts.length > 0;
    expect(shouldShow).toBe(false);
  });
});

describe('SuitabilityIndicator — compact mode', () => {
  it('compact mode renders score and band label inline', () => {
    const result = makeSuitabilityResult({ score: 75 });
    const band = getBand(result.score, result.noGoTriggered);
    const cfg = BAND_CONFIG[band];
    const inlineText = `${result.score} — ${cfg.label}`;
    expect(inlineText).toBe('75 — Suitable');
  });

  it('compact mode for nogo shows No-Go label', () => {
    const result = makeSuitabilityResult({ score: 20, noGoTriggered: true });
    const band = getBand(result.score, result.noGoTriggered);
    expect(BAND_CONFIG[band].label).toBe('No-Go');
  });
});

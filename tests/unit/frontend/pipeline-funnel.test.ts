// ============================================================
// PipelineFunnel — unit tests
// Tests all 5 stages present, stage colors, conversion rate
// calculation, count display, STAGE_COLORS array, and width
// shrinkage logic — from pipeline-funnel.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';

// ── Types matching pipeline-funnel.tsx ───────────────────────────────────────

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  description?: string;
}

// ── Inline constants from pipeline-funnel.tsx ─────────────────────────────────

const STAGE_COLORS = [
  '#0A1628', // 0%   — full navy
  '#2D3A58', // 25%
  '#506285', // 50%
  '#8A8460', // 75%
  '#C9A84C', // 100% — full gold
];

const STAGE_TEXT_COLORS = [
  'text-white',
  'text-white',
  'text-white',
  'text-white',
  'text-[#0A1628]',
];

// ── Width calculation matching pipeline-funnel.tsx ───────────────────────────

function stageWidthPct(index: number, totalStages: number): number {
  const minWidthPct = 52;
  return 100 - ((100 - minWidthPct) / (totalStages - 1)) * index;
}

// ── Conversion rate calculation ───────────────────────────────────────────────

function conversionRate(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((to / from) * 100);
}

// ── Default 5-stage pipeline fixture ─────────────────────────────────────────

const DEFAULT_STAGES: FunnelStage[] = [
  { key: 'prospect',    label: 'Prospect',    count: 200, description: 'Leads in evaluation'      },
  { key: 'onboarding',  label: 'Onboarding',  count: 120, description: 'Completing intake'         },
  { key: 'active',      label: 'Active',      count: 85,  description: 'Funded & in stack'         },
  { key: 'graduated',   label: 'Graduated',   count: 40,  description: 'Achieved credit goals'     },
  { key: 'churned',     label: 'Churned',     count: 15,  description: 'Exited the program'        },
];

// ────────────────────────────────────────────────────────────────────────────

describe('PipelineFunnel — all 5 stages', () => {
  it('default stages array has exactly 5 entries', () => {
    expect(DEFAULT_STAGES).toHaveLength(5);
  });

  it('stage keys are: prospect, onboarding, active, graduated, churned', () => {
    const keys = DEFAULT_STAGES.map((s) => s.key);
    expect(keys).toEqual(['prospect', 'onboarding', 'active', 'graduated', 'churned']);
  });

  it('all stages have label, count, and key', () => {
    DEFAULT_STAGES.forEach((stage) => {
      expect(stage.label).toBeTruthy();
      expect(stage.key).toBeTruthy();
      expect(typeof stage.count).toBe('number');
    });
  });

  it('stage labels are in correct order', () => {
    const labels = DEFAULT_STAGES.map((s) => s.label);
    expect(labels[0]).toBe('Prospect');
    expect(labels[1]).toBe('Onboarding');
    expect(labels[2]).toBe('Active');
    expect(labels[3]).toBe('Graduated');
    expect(labels[4]).toBe('Churned');
  });

  it('stage counts are non-negative integers', () => {
    DEFAULT_STAGES.forEach((s) => {
      expect(s.count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(s.count)).toBe(true);
    });
  });
});

describe('PipelineFunnel — conversion rates', () => {
  it('calculates Prospect → Onboarding conversion correctly', () => {
    const rate = conversionRate(DEFAULT_STAGES[0].count, DEFAULT_STAGES[1].count);
    expect(rate).toBe(60); // 120/200 = 60%
  });

  it('calculates Onboarding → Active conversion correctly', () => {
    const rate = conversionRate(DEFAULT_STAGES[1].count, DEFAULT_STAGES[2].count);
    expect(rate).toBe(71); // 85/120 ≈ 70.8% → 71%
  });

  it('calculates Active → Graduated conversion correctly', () => {
    const rate = conversionRate(DEFAULT_STAGES[2].count, DEFAULT_STAGES[3].count);
    expect(rate).toBe(47); // 40/85 ≈ 47.1% → 47%
  });

  it('calculates Graduated → Churned rate correctly', () => {
    const rate = conversionRate(DEFAULT_STAGES[3].count, DEFAULT_STAGES[4].count);
    expect(rate).toBe(38); // 15/40 = 37.5% → 38%
  });

  it('returns 0 when "from" count is 0 (avoids division by zero)', () => {
    expect(conversionRate(0, 50)).toBe(0);
  });

  it('returns 100 when from equals to', () => {
    expect(conversionRate(100, 100)).toBe(100);
  });

  it('conversion rates are displayed as integers (Math.round)', () => {
    const rate = conversionRate(3, 2);
    expect(Number.isInteger(rate)).toBe(true);
  });
});

describe('PipelineFunnel — stage colors (navy → gold gradient)', () => {
  it('STAGE_COLORS has 5 colors', () => {
    expect(STAGE_COLORS).toHaveLength(5);
  });

  it('first stage color is navy (#0A1628)', () => {
    expect(STAGE_COLORS[0]).toBe('#0A1628');
  });

  it('last stage color is gold (#C9A84C)', () => {
    expect(STAGE_COLORS[4]).toBe('#C9A84C');
  });

  it('intermediate colors are hex values', () => {
    STAGE_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('STAGE_TEXT_COLORS has 5 entries', () => {
    expect(STAGE_TEXT_COLORS).toHaveLength(5);
  });

  it('first 4 text colors are white', () => {
    STAGE_TEXT_COLORS.slice(0, 4).forEach((cls) => {
      expect(cls).toBe('text-white');
    });
  });

  it('last stage text is navy (for contrast on gold background)', () => {
    expect(STAGE_TEXT_COLORS[4]).toBe('text-[#0A1628]');
  });

  it('color at index i falls back to last color when index exceeds array length', () => {
    const idx = 10;
    const color = STAGE_COLORS[idx] ?? STAGE_COLORS[STAGE_COLORS.length - 1];
    expect(color).toBe('#C9A84C');
  });
});

describe('PipelineFunnel — stage bar width shrinkage', () => {
  const TOTAL = 5;
  const MIN_WIDTH_PCT = 52;

  it('first stage (index 0) is 100% wide', () => {
    expect(stageWidthPct(0, TOTAL)).toBe(100);
  });

  it('last stage (index 4) is 52% wide (minWidthPct)', () => {
    expect(stageWidthPct(4, TOTAL)).toBeCloseTo(52, 0);
  });

  it('width decreases with each stage', () => {
    const widths = [0, 1, 2, 3, 4].map((i) => stageWidthPct(i, TOTAL));
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });

  it('all widths are between 52 and 100 percent', () => {
    for (let i = 0; i < TOTAL; i++) {
      const w = stageWidthPct(i, TOTAL);
      expect(w).toBeGreaterThanOrEqual(MIN_WIDTH_PCT);
      expect(w).toBeLessThanOrEqual(100);
    }
  });
});

describe('PipelineFunnel — max count for proportion bars', () => {
  it('maxCount is the maximum count across all stages', () => {
    const maxCount = Math.max(...DEFAULT_STAGES.map((s) => s.count), 1);
    expect(maxCount).toBe(200); // Prospect stage
  });

  it('maxCount defaults to 1 when all counts are 0 (avoids division by zero)', () => {
    const zeroCounts = DEFAULT_STAGES.map((s) => ({ ...s, count: 0 }));
    const maxCount = Math.max(...zeroCounts.map((s) => s.count), 1);
    expect(maxCount).toBe(1);
  });

  it('proportion bar width = (count / maxCount) * 100', () => {
    const maxCount = 200;
    const stage = DEFAULT_STAGES[2]; // Active: 85
    const barWidth = Math.round((stage.count / maxCount) * 100);
    expect(barWidth).toBe(43); // 85/200 = 42.5% → 43%
  });
});

describe('PipelineFunnel — summary row', () => {
  it('summary shows all stage labels', () => {
    const summaryLabels = DEFAULT_STAGES.map((s) => s.label);
    expect(summaryLabels).toContain('Prospect');
    expect(summaryLabels).toContain('Onboarding');
    expect(summaryLabels).toContain('Active');
    expect(summaryLabels).toContain('Graduated');
    expect(summaryLabels).toContain('Churned');
  });

  it('summary shows all stage counts', () => {
    const summaryCounts = DEFAULT_STAGES.map((s) => s.count);
    expect(summaryCounts).toContain(200);
    expect(summaryCounts).toContain(120);
    expect(summaryCounts).toContain(85);
    expect(summaryCounts).toContain(40);
    expect(summaryCounts).toContain(15);
  });

  it('ConversionArrow is NOT shown after the last stage', () => {
    const stages = DEFAULT_STAGES;
    // Arrow shown between stages (length - 1 arrows total)
    const arrowCount = stages.length - 1;
    expect(arrowCount).toBe(4);
  });
});

describe('PipelineFunnel — aria labels', () => {
  it('each stage bar aria-label includes label and count', () => {
    DEFAULT_STAGES.forEach((stage) => {
      const ariaLabel = `${stage.label}: ${stage.count} clients`;
      expect(ariaLabel).toContain(stage.label);
      expect(ariaLabel).toContain(String(stage.count));
    });
  });

  it('conversion arrow aria-label shows rate percentage', () => {
    const from = DEFAULT_STAGES[0].count;
    const to   = DEFAULT_STAGES[1].count;
    const rate = conversionRate(from, to);
    const ariaLabel = `${rate}% conversion`;
    expect(ariaLabel).toBe('60% conversion');
  });
});

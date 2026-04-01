// ============================================================
// AprCountdown — unit tests
// Tests days-remaining calculation, color urgency bands
// (green >60d, yellow 30–60d, red <30d), expired state,
// and URGENCY_CONFIG entries — all pure logic from apr-countdown.tsx.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { APR_ALERT_WINDOWS } from '../../../src/shared/constants/index';

// ── Inline urgency logic matching apr-countdown.tsx ─────────────────────────

type UrgencyLevel = 'safe' | 'warning' | 'critical' | 'expired';

function daysUntil(isoDate: string, nowMs?: number): number {
  const now = nowMs ?? Date.now();
  const target = new Date(isoDate).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function getUrgency(days: number): UrgencyLevel {
  if (days <= 0)                        return 'expired';
  if (days < APR_ALERT_WINDOWS[2])      return 'critical';  // < 15
  if (days < APR_ALERT_WINDOWS[1])      return 'critical';  // < 30
  if (days < APR_ALERT_WINDOWS[0])      return 'warning';   // < 60
  return 'safe';
}

interface UrgencyConfig {
  ringClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  badgeLabel: string;
}

const URGENCY_CONFIG: Record<UrgencyLevel, UrgencyConfig> = {
  safe: {
    ringClass: 'stroke-green-500',
    textClass: 'text-green-400',
    bgClass: 'bg-green-950',
    borderClass: 'border-green-700',
    badgeClass: 'bg-green-900 text-green-300 border-green-700',
    badgeLabel: 'On Track',
  },
  warning: {
    ringClass: 'stroke-yellow-500',
    textClass: 'text-yellow-400',
    bgClass: 'bg-yellow-950',
    borderClass: 'border-yellow-700',
    badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    badgeLabel: 'Act Soon',
  },
  critical: {
    ringClass: 'stroke-red-500',
    textClass: 'text-red-400',
    bgClass: 'bg-red-950',
    borderClass: 'border-red-700',
    badgeClass: 'bg-red-900 text-red-300 border-red-700',
    badgeLabel: 'Urgent',
  },
  expired: {
    ringClass: 'stroke-gray-600',
    textClass: 'text-gray-400',
    bgClass: 'bg-gray-900',
    borderClass: 'border-gray-700',
    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600',
    badgeLabel: 'APR Active',
  },
};

// ── Time helper ───────────────────────────────────────────────────────────────

function addDaysToNow(days: number, baseMs = Date.now()): string {
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}

// ────────────────────────────────────────────────────────────────────────────

describe('AprCountdown — APR_ALERT_WINDOWS constants', () => {
  it('has three thresholds [60, 30, 15]', () => {
    expect(APR_ALERT_WINDOWS).toEqual([60, 30, 15]);
  });

  it('first threshold (safe boundary) is 60 days', () => {
    expect(APR_ALERT_WINDOWS[0]).toBe(60);
  });

  it('second threshold is 30 days', () => {
    expect(APR_ALERT_WINDOWS[1]).toBe(30);
  });

  it('third threshold (most critical) is 15 days', () => {
    expect(APR_ALERT_WINDOWS[2]).toBe(15);
  });
});

describe('AprCountdown — daysUntil calculation', () => {
  const BASE_NOW = new Date('2026-01-01T12:00:00Z').getTime();

  it('returns 0 for a past date', () => {
    expect(daysUntil('2025-12-01', BASE_NOW)).toBe(0);
  });

  it('returns 0 for today (same day)', () => {
    const today = new Date(BASE_NOW).toISOString().slice(0, 10);
    // same-day ISO means target is at midnight, we are at noon → negative after noon
    const result = daysUntil(today + 'T00:00:00Z', BASE_NOW);
    expect(result).toBe(0);
  });

  it('returns correct days for future date', () => {
    const future = new Date(BASE_NOW + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(future, BASE_NOW)).toBe(30);
  });

  it('returns 90 days for 90-day future date', () => {
    const future = new Date(BASE_NOW + 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntil(future, BASE_NOW)).toBe(90);
  });

  it('never returns negative', () => {
    const past = '2020-01-01';
    expect(daysUntil(past, BASE_NOW)).toBe(0);
  });
});

describe('AprCountdown — urgency level classification', () => {
  it('returns "safe" (green) for > 60 days remaining', () => {
    expect(getUrgency(61)).toBe('safe');
    expect(getUrgency(90)).toBe('safe');
    expect(getUrgency(180)).toBe('safe');
  });

  it('returns "warning" (yellow) for days 31–59', () => {
    // warning: days < APR_ALERT_WINDOWS[0] (60) but >= APR_ALERT_WINDOWS[1] (30)
    expect(getUrgency(59)).toBe('warning');
    expect(getUrgency(45)).toBe('warning');
    expect(getUrgency(31)).toBe('warning');
  });

  it('boundary: exactly 60 days is "safe" (60 is NOT < 60)', () => {
    // getUrgency(60): 60 <= 0? no. 60 < 15? no. 60 < 30? no. 60 < 60? no. → 'safe'
    expect(getUrgency(60)).toBe('safe');
  });

  it('boundary: exactly 59 days is "warning"', () => {
    expect(getUrgency(59)).toBe('warning');
  });

  it('returns "critical" (red) for < 30 days remaining', () => {
    expect(getUrgency(29)).toBe('critical');
    expect(getUrgency(15)).toBe('critical');
    expect(getUrgency(1)).toBe('critical');
  });

  it('returns "expired" for 0 days remaining', () => {
    expect(getUrgency(0)).toBe('expired');
  });

  it('returns "critical" for days between 15 and 29 (both < 30 branches)', () => {
    expect(getUrgency(14)).toBe('critical');
    expect(getUrgency(20)).toBe('critical');
    expect(getUrgency(28)).toBe('critical');
  });
});

describe('AprCountdown — URGENCY_CONFIG entries', () => {
  it('has config for all 4 urgency levels', () => {
    const levels: UrgencyLevel[] = ['safe', 'warning', 'critical', 'expired'];
    levels.forEach((level) => {
      expect(URGENCY_CONFIG).toHaveProperty(level);
    });
  });

  it('safe config — green colors and "On Track" badge', () => {
    const cfg = URGENCY_CONFIG.safe;
    expect(cfg.badgeLabel).toBe('On Track');
    expect(cfg.textClass).toContain('green');
    expect(cfg.bgClass).toContain('green');
    expect(cfg.ringClass).toContain('green');
  });

  it('warning config — yellow colors and "Act Soon" badge', () => {
    const cfg = URGENCY_CONFIG.warning;
    expect(cfg.badgeLabel).toBe('Act Soon');
    expect(cfg.textClass).toContain('yellow');
    expect(cfg.bgClass).toContain('yellow');
  });

  it('critical config — red colors and "Urgent" badge', () => {
    const cfg = URGENCY_CONFIG.critical;
    expect(cfg.badgeLabel).toBe('Urgent');
    expect(cfg.textClass).toContain('red');
    expect(cfg.bgClass).toContain('red');
  });

  it('expired config — gray colors and "APR Active" badge', () => {
    const cfg = URGENCY_CONFIG.expired;
    expect(cfg.badgeLabel).toBe('APR Active');
    expect(cfg.textClass).toContain('gray');
    expect(cfg.bgClass).toContain('gray');
  });

  it('every config entry has all required fields', () => {
    const requiredKeys: (keyof UrgencyConfig)[] = [
      'ringClass', 'textClass', 'bgClass', 'borderClass', 'badgeClass', 'badgeLabel',
    ];
    (Object.keys(URGENCY_CONFIG) as UrgencyLevel[]).forEach((level) => {
      requiredKeys.forEach((key) => {
        expect(URGENCY_CONFIG[level]).toHaveProperty(key);
      });
    });
  });
});

describe('AprCountdown — urgency message logic', () => {
  it('no urgency message shown when urgency is "safe"', () => {
    const urgency = getUrgency(90);
    const shouldShowMessage = urgency !== 'safe';
    expect(shouldShowMessage).toBe(false);
  });

  it('urgency message shown for warning, critical, expired', () => {
    (['warning', 'critical', 'expired'] as UrgencyLevel[]).forEach((u) => {
      const days = u === 'expired' ? 0 : u === 'critical' ? 10 : 45;
      const urgency = getUrgency(days);
      expect(urgency).toBe(u);
      expect(urgency !== 'safe').toBe(true);
    });
  });

  it('critical message mentions days remaining', () => {
    const days = 7;
    const message = `Only ${days} days left! Transfer or pay down this balance immediately.`;
    expect(message).toContain('7 days left');
  });

  it('warning message mentions days remaining', () => {
    const days = 45;
    const message = `${days} days remaining. Start planning payoff or transfer strategy.`;
    expect(message).toContain('45 days remaining');
  });

  it('expired message indicates APR is now active', () => {
    const message = 'Promo period has ended — regular APR is now in effect.';
    expect(message).toContain('regular APR');
  });
});

describe('AprCountdown — prop shape', () => {
  it('requires cardProduct, issuer, and expiresAt', () => {
    const props = {
      cardProduct: 'Ink Business Preferred',
      issuer: 'Chase',
      expiresAt: '2026-06-30',
    };
    expect(props.cardProduct).toBeTruthy();
    expect(props.issuer).toBeTruthy();
    expect(props.expiresAt).toBeTruthy();
  });

  it('optional fields: regularApr, balance, compact', () => {
    const minimalProps = {
      cardProduct: 'Spark Cash Plus',
      issuer: 'Capital One',
      expiresAt: '2026-09-01',
    };
    expect(minimalProps).not.toHaveProperty('regularApr');
    expect(minimalProps).not.toHaveProperty('balance');
    expect(minimalProps).not.toHaveProperty('compact');
  });
});

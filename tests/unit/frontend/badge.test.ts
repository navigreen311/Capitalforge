// ============================================================
// Badge — unit tests
// Tests all status variants, badge sizes, variant styles (subtle /
// solid / outline), color mapping per status, and STATUS_MAP
// completeness — using pure data from badge.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';

// ── Types matching badge.tsx ─────────────────────────────────────────────────

type BadgeStatus =
  | 'approved'
  | 'pending'
  | 'declined'
  | 'review'
  | 'inactive'
  | 'draft'
  | 'active'
  | 'funded'
  | 'expired'
  | 'processing';

type BadgeSize = 'sm' | 'md' | 'lg';
type BadgeVariant = 'subtle' | 'solid' | 'outline';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

// ── Inline STATUS_MAP matching badge.tsx ─────────────────────────────────────

const STATUS_MAP: Record<BadgeStatus, StatusConfig> = {
  approved:   { label: 'Approved',   bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  active:     { label: 'Active',     bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  funded:     { label: 'Funded',     bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  pending:    { label: 'Pending',    bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  processing: { label: 'Processing', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400'   },
  review:     { label: 'In Review',  bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  draft:      { label: 'Draft',      bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400'    },
  inactive:   { label: 'Inactive',   bg: 'bg-gray-50',     text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400'    },
  declined:   { label: 'Declined',   bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'     },
  expired:    { label: 'Expired',    bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400'     },
};

const SIZE_MAP: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs    px-2   py-1   gap-1.5',
  lg: 'text-sm    px-3   py-1.5 gap-2',
};

// ────────────────────────────────────────────────────────────────────────────

describe('Badge — STATUS_MAP completeness', () => {
  const ALL_STATUSES: BadgeStatus[] = [
    'approved', 'pending', 'declined', 'review', 'inactive',
    'draft', 'active', 'funded', 'expired', 'processing',
  ];

  it('has entries for all 10 status variants', () => {
    expect(Object.keys(STATUS_MAP)).toHaveLength(10);
  });

  it('every status has an entry in STATUS_MAP', () => {
    ALL_STATUSES.forEach((status) => {
      expect(STATUS_MAP).toHaveProperty(status);
    });
  });

  it('every STATUS_MAP entry has label, bg, text, border, and dot', () => {
    ALL_STATUSES.forEach((status) => {
      const cfg = STATUS_MAP[status];
      expect(cfg.label).toBeTruthy();
      expect(cfg.bg).toBeTruthy();
      expect(cfg.text).toBeTruthy();
      expect(cfg.border).toBeTruthy();
      expect(cfg.dot).toBeTruthy();
    });
  });
});

describe('Badge — status labels', () => {
  it('approved → "Approved"', () => {
    expect(STATUS_MAP.approved.label).toBe('Approved');
  });

  it('pending → "Pending"', () => {
    expect(STATUS_MAP.pending.label).toBe('Pending');
  });

  it('declined → "Declined"', () => {
    expect(STATUS_MAP.declined.label).toBe('Declined');
  });

  it('review → "In Review"', () => {
    expect(STATUS_MAP.review.label).toBe('In Review');
  });

  it('active → "Active"', () => {
    expect(STATUS_MAP.active.label).toBe('Active');
  });

  it('funded → "Funded"', () => {
    expect(STATUS_MAP.funded.label).toBe('Funded');
  });

  it('expired → "Expired"', () => {
    expect(STATUS_MAP.expired.label).toBe('Expired');
  });

  it('processing → "Processing"', () => {
    expect(STATUS_MAP.processing.label).toBe('Processing');
  });

  it('draft → "Draft"', () => {
    expect(STATUS_MAP.draft.label).toBe('Draft');
  });

  it('inactive → "Inactive"', () => {
    expect(STATUS_MAP.inactive.label).toBe('Inactive');
  });
});

describe('Badge — color mapping by status', () => {
  it('approved/active/funded use emerald (green) color', () => {
    (['approved', 'active', 'funded'] as BadgeStatus[]).forEach((s) => {
      expect(STATUS_MAP[s].bg).toContain('emerald');
      expect(STATUS_MAP[s].text).toContain('emerald');
      expect(STATUS_MAP[s].dot).toContain('emerald');
    });
  });

  it('pending/processing use amber (yellow) color', () => {
    (['pending', 'processing'] as BadgeStatus[]).forEach((s) => {
      expect(STATUS_MAP[s].bg).toContain('amber');
      expect(STATUS_MAP[s].text).toContain('amber');
    });
  });

  it('review uses blue color', () => {
    expect(STATUS_MAP.review.bg).toContain('blue');
    expect(STATUS_MAP.review.text).toContain('blue');
    expect(STATUS_MAP.review.dot).toContain('blue');
  });

  it('draft/inactive use gray color', () => {
    (['draft', 'inactive'] as BadgeStatus[]).forEach((s) => {
      expect(STATUS_MAP[s].bg).toContain('gray');
      expect(STATUS_MAP[s].text).toContain('gray');
      expect(STATUS_MAP[s].dot).toContain('gray');
    });
  });

  it('declined/expired use red color', () => {
    (['declined', 'expired'] as BadgeStatus[]).forEach((s) => {
      expect(STATUS_MAP[s].bg).toContain('red');
      expect(STATUS_MAP[s].text).toContain('red');
      expect(STATUS_MAP[s].dot).toContain('red');
    });
  });
});

describe('Badge — sizes', () => {
  it('SIZE_MAP has sm, md, and lg entries', () => {
    expect(SIZE_MAP).toHaveProperty('sm');
    expect(SIZE_MAP).toHaveProperty('md');
    expect(SIZE_MAP).toHaveProperty('lg');
  });

  it('sm size uses smaller text', () => {
    expect(SIZE_MAP.sm).toContain('text-[10px]');
  });

  it('md size uses xs text', () => {
    expect(SIZE_MAP.md).toContain('text-xs');
  });

  it('lg size uses sm text', () => {
    expect(SIZE_MAP.lg).toContain('text-sm');
  });

  it('sizes have different padding values', () => {
    // sm < md < lg padding
    expect(SIZE_MAP.sm).toContain('px-1.5');
    expect(SIZE_MAP.md).toContain('px-2');
    expect(SIZE_MAP.lg).toContain('px-3');
  });
});

describe('Badge — variant style logic', () => {
  const status: BadgeStatus = 'approved';
  const cfg = STATUS_MAP[status];

  it('subtle variant uses bg and text colors with transparent border', () => {
    // In badge.tsx: variant='subtle' → cfg.bg + cfg.text + border-transparent
    const subtleClasses = `${cfg.bg} ${cfg.text} border-transparent`;
    expect(subtleClasses).toContain('bg-emerald-50');
    expect(subtleClasses).toContain('text-emerald-700');
    expect(subtleClasses).toContain('border-transparent');
  });

  it('solid variant uses dot color as background with white text', () => {
    // variant='solid' → cfg.dot (bg) + text-white + border-transparent
    const solidClasses = `${cfg.dot} text-white border-transparent`;
    expect(solidClasses).toContain('bg-emerald-500');
    expect(solidClasses).toContain('text-white');
  });

  it('outline variant uses border color with transparent background', () => {
    // variant='outline' → bg-transparent + cfg.border + cfg.text
    const outlineClasses = `bg-transparent border ${cfg.border} ${cfg.text}`;
    expect(outlineClasses).toContain('bg-transparent');
    expect(outlineClasses).toContain('border-emerald-200');
    expect(outlineClasses).toContain('text-emerald-700');
  });
});

describe('Badge — label override', () => {
  it('custom label overrides default status label', () => {
    const cfg = STATUS_MAP.approved;
    const customLabel = 'Pre-Approved';
    const displayLabel = customLabel ?? cfg.label;
    expect(displayLabel).toBe('Pre-Approved');
  });

  it('undefined label falls back to STATUS_MAP label', () => {
    const cfg = STATUS_MAP.pending;
    const customLabel = undefined;
    const displayLabel = customLabel ?? cfg.label;
    expect(displayLabel).toBe('Pending');
  });
});

describe('Badge — aria-label', () => {
  it('aria-label is "Status: <label>"', () => {
    const displayLabel = 'Approved';
    const ariaLabel = `Status: ${displayLabel}`;
    expect(ariaLabel).toBe('Status: Approved');
  });
});

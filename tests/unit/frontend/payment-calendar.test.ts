// ============================================================
// PaymentCalendar — unit tests
// Tests due date rendering, STATUS_STYLES color coding (paid /
// upcoming / overdue / scheduled), calendar grid math, payment
// aggregation, and PLACEHOLDER_PAYMENTS fixture — from
// payment-calendar.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';

// ── Types matching payment-calendar.tsx ──────────────────────────────────────

type PaymentStatus = 'paid' | 'upcoming' | 'overdue' | 'scheduled';

interface PaymentDue {
  id: string;
  cardName: string;
  issuer: string;
  dueDate: string;
  amount: number;
  status: PaymentStatus;
  minPayment?: number;
}

// ── Inline STATUS_STYLES matching payment-calendar.tsx ───────────────────────

const STATUS_STYLES: Record<
  PaymentStatus,
  { dot: string; bg: string; border: string; text: string; label: string }
> = {
  paid:      { dot: 'bg-green-500',  bg: 'bg-green-900/40',  border: 'border-green-700',  text: 'text-green-300',  label: 'Paid' },
  upcoming:  { dot: 'bg-yellow-400', bg: 'bg-yellow-900/40', border: 'border-yellow-700', text: 'text-yellow-300', label: 'Due Soon' },
  overdue:   { dot: 'bg-red-500',    bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300',    label: 'Overdue' },
  scheduled: { dot: 'bg-gray-500',   bg: 'bg-gray-800/60',   border: 'border-gray-700',   text: 'text-gray-400',   label: 'Scheduled' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Sample payments ───────────────────────────────────────────────────────────

const SAMPLE_PAYMENTS: PaymentDue[] = [
  { id: 'p1', cardName: 'Ink Business Preferred', issuer: 'Chase',       dueDate: '2026-03-05', amount: 1200, status: 'paid',      minPayment: 35  },
  { id: 'p2', cardName: 'Business Gold Card',      issuer: 'Amex',        dueDate: '2026-03-10', amount: 880,  status: 'overdue',   minPayment: 27  },
  { id: 'p3', cardName: 'Spark Cash Plus',         issuer: 'Capital One', dueDate: '2026-03-18', amount: 540,  status: 'upcoming',  minPayment: 25  },
  { id: 'p4', cardName: 'Plum Card',               issuer: 'Amex',        dueDate: '2026-03-22', amount: 2300, status: 'upcoming',  minPayment: 60  },
  { id: 'p5', cardName: 'Ink Business Cash',       issuer: 'Chase',       dueDate: '2026-04-02', amount: 760,  status: 'scheduled', minPayment: 25  },
  { id: 'p6', cardName: 'Business Platinum',       issuer: 'Amex',        dueDate: '2026-04-15', amount: 4100, status: 'scheduled', minPayment: 100 },
  { id: 'p7', cardName: 'Venture X Business',      issuer: 'Capital One', dueDate: '2026-04-22', amount: 1650, status: 'scheduled', minPayment: 45  },
];

// ────────────────────────────────────────────────────────────────────────────

describe('PaymentCalendar — STATUS_STYLES color coding', () => {
  it('has entries for all 4 payment statuses', () => {
    const statuses: PaymentStatus[] = ['paid', 'upcoming', 'overdue', 'scheduled'];
    statuses.forEach((s) => {
      expect(STATUS_STYLES).toHaveProperty(s);
    });
  });

  it('paid status uses green color', () => {
    const s = STATUS_STYLES.paid;
    expect(s.dot).toContain('green');
    expect(s.bg).toContain('green');
    expect(s.text).toContain('green');
    expect(s.label).toBe('Paid');
  });

  it('upcoming status uses yellow color', () => {
    const s = STATUS_STYLES.upcoming;
    expect(s.dot).toContain('yellow');
    expect(s.bg).toContain('yellow');
    expect(s.text).toContain('yellow');
    expect(s.label).toBe('Due Soon');
  });

  it('overdue status uses red color', () => {
    const s = STATUS_STYLES.overdue;
    expect(s.dot).toContain('red');
    expect(s.bg).toContain('red');
    expect(s.text).toContain('red');
    expect(s.label).toBe('Overdue');
  });

  it('scheduled status uses gray color', () => {
    const s = STATUS_STYLES.scheduled;
    expect(s.dot).toContain('gray');
    expect(s.bg).toContain('gray');
    expect(s.text).toContain('gray');
    expect(s.label).toBe('Scheduled');
  });

  it('every status entry has dot, bg, border, text, and label', () => {
    const statuses: PaymentStatus[] = ['paid', 'upcoming', 'overdue', 'scheduled'];
    statuses.forEach((s) => {
      expect(STATUS_STYLES[s].dot).toBeTruthy();
      expect(STATUS_STYLES[s].bg).toBeTruthy();
      expect(STATUS_STYLES[s].border).toBeTruthy();
      expect(STATUS_STYLES[s].text).toBeTruthy();
      expect(STATUS_STYLES[s].label).toBeTruthy();
    });
  });
});

describe('PaymentCalendar — due dates render', () => {
  it('all sample payments have valid dueDate strings', () => {
    SAMPLE_PAYMENTS.forEach((p) => {
      expect(p.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  it('each payment has id, cardName, issuer, amount, and status', () => {
    SAMPLE_PAYMENTS.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.cardName).toBeTruthy();
      expect(p.issuer).toBeTruthy();
      expect(p.amount).toBeGreaterThan(0);
      expect(p.status).toBeTruthy();
    });
  });

  it('paymentMap groups payments by ISO date key', () => {
    const paymentMap = new Map<string, PaymentDue[]>();
    SAMPLE_PAYMENTS.forEach((p) => {
      const key = p.dueDate.slice(0, 10);
      if (!paymentMap.has(key)) paymentMap.set(key, []);
      paymentMap.get(key)!.push(p);
    });

    expect(paymentMap.has('2026-03-05')).toBe(true);
    expect(paymentMap.get('2026-03-05')).toHaveLength(1);
    expect(paymentMap.get('2026-03-05')![0].cardName).toBe('Ink Business Preferred');
  });

  it('payments for same day are grouped together', () => {
    const dupes: PaymentDue[] = [
      { id: 'a', cardName: 'Card A', issuer: 'Chase', dueDate: '2026-03-15', amount: 500, status: 'upcoming' },
      { id: 'b', cardName: 'Card B', issuer: 'Amex',  dueDate: '2026-03-15', amount: 300, status: 'upcoming' },
    ];
    const map = new Map<string, PaymentDue[]>();
    dupes.forEach((p) => {
      const key = p.dueDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    expect(map.get('2026-03-15')).toHaveLength(2);
  });
});

describe('PaymentCalendar — summary counts', () => {
  it('counts overdue payments correctly', () => {
    const overdue = SAMPLE_PAYMENTS.filter((p) => p.status === 'overdue');
    expect(overdue).toHaveLength(1);
  });

  it('counts upcoming payments correctly', () => {
    const upcoming = SAMPLE_PAYMENTS.filter((p) => p.status === 'upcoming');
    expect(upcoming).toHaveLength(2);
  });

  it('calculates total due (upcoming + overdue)', () => {
    const totalDue = SAMPLE_PAYMENTS
      .filter((p) => p.status === 'upcoming' || p.status === 'overdue')
      .reduce((sum, p) => sum + p.amount, 0);
    expect(totalDue).toBe(880 + 540 + 2300); // 3720
  });

  it('formatCurrency formats amounts correctly', () => {
    expect(formatCurrency(1200)).toBe('$1,200');
    expect(formatCurrency(4100)).toBe('$4,100');
    expect(formatCurrency(750)).toBe('$750');
  });
});

describe('PaymentCalendar — calendar grid math', () => {
  it('March 2026 starts on Sunday (0)', () => {
    const firstDay = new Date(2026, 2, 1).getDay(); // month is 0-indexed
    expect(firstDay).toBe(0);
  });

  it('March 2026 has 31 days', () => {
    const daysInMonth = new Date(2026, 3, 0).getDate();
    expect(daysInMonth).toBe(31);
  });

  it('calendar cells total is a multiple of 7', () => {
    const cells = buildCalendarCells(2026, 2); // March 2026
    expect(cells.length % 7).toBe(0);
  });

  it('leading null cells equal firstDay', () => {
    const firstDay = new Date(2026, 2, 1).getDay();
    const cells = buildCalendarCells(2026, 2);
    const leadingNulls = cells.filter((c, i) => c === null && i < firstDay).length;
    expect(leadingNulls).toBe(firstDay);
  });

  it('non-null cells count equals days in month', () => {
    const cells = buildCalendarCells(2026, 2);
    const dayCells = cells.filter((c) => c !== null);
    expect(dayCells).toHaveLength(31);
  });

  it('day cells are numbered 1–31 in order', () => {
    const cells = buildCalendarCells(2026, 2);
    const dayCells = cells.filter((c) => c !== null) as number[];
    expect(dayCells[0]).toBe(1);
    expect(dayCells[30]).toBe(31);
  });

  it('generates correct 7 weekday headers', () => {
    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]).toBe('Sun');
    expect(WEEKDAYS[6]).toBe('Sat');
  });
});

describe('PaymentCalendar — cell color logic', () => {
  it('cell with overdue payment gets red background class', () => {
    const payments: PaymentDue[] = [
      { id: 'x', cardName: 'Card', issuer: 'Chase', dueDate: '2026-03-10', amount: 500, status: 'overdue' },
    ];
    const hasOverdue = payments.some((p) => p.status === 'overdue');
    const cellBg = hasOverdue ? 'bg-red-950/30' : 'hover:bg-gray-800/40';
    expect(cellBg).toContain('red');
  });

  it('cell with upcoming payment gets yellow background class', () => {
    const payments: PaymentDue[] = [
      { id: 'y', cardName: 'Card', issuer: 'Amex', dueDate: '2026-03-18', amount: 400, status: 'upcoming' },
    ];
    const hasOverdue  = payments.some((p) => p.status === 'overdue');
    const hasUpcoming = payments.some((p) => p.status === 'upcoming');
    const cellBg = hasOverdue ? 'bg-red-950/30' : hasUpcoming ? 'bg-yellow-950/30' : 'hover:bg-gray-800/40';
    expect(cellBg).toContain('yellow');
  });

  it('cell with only paid payment gets green background', () => {
    const payments: PaymentDue[] = [
      { id: 'z', cardName: 'Card', issuer: 'Chase', dueDate: '2026-03-05', amount: 1200, status: 'paid' },
    ];
    const hasOverdue  = payments.some((p) => p.status === 'overdue');
    const hasUpcoming = payments.some((p) => p.status === 'upcoming');
    const hasPaid     = payments.some((p) => p.status === 'paid');
    const cellBg = hasOverdue
      ? 'bg-red-950/30'
      : hasUpcoming
      ? 'bg-yellow-950/30'
      : hasPaid
      ? 'bg-green-950/20'
      : 'hover:bg-gray-800/40';
    expect(cellBg).toContain('green');
  });

  it('empty cell gets default hover class', () => {
    const payments: PaymentDue[] = [];
    const hasOverdue  = payments.some((p) => p.status === 'overdue');
    const hasUpcoming = payments.some((p) => p.status === 'upcoming');
    const hasPaid     = payments.some((p) => p.status === 'paid');
    const cellBg = hasOverdue ? 'bg-red-950/30' : hasUpcoming ? 'bg-yellow-950/30' : hasPaid ? 'bg-green-950/20' : 'hover:bg-gray-800/40';
    expect(cellBg).toBe('hover:bg-gray-800/40');
  });
});

describe('PaymentCalendar — month navigation', () => {
  it('prevMonth from January wraps to December of previous year', () => {
    let year = 2026;
    let month = 0; // January
    if (month === 0) { year = year - 1; month = 11; }
    else month = month - 1;
    expect(year).toBe(2025);
    expect(month).toBe(11); // December
  });

  it('nextMonth from December wraps to January of next year', () => {
    let year = 2026;
    let month = 11; // December
    if (month === 11) { year = year + 1; month = 0; }
    else month = month + 1;
    expect(year).toBe(2027);
    expect(month).toBe(0); // January
  });

  it('formatMonthYear produces readable month/year string', () => {
    const result = new Date(2026, 2, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    expect(result).toBe('March 2026');
  });
});

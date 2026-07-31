// ============================================================
// CapitalForge — Client repayment view mapping
//
// /api/v1/clients/:id/repayment returns the active plan, its schedule and the
// approved cards. The tab was written against a different shape entirely —
// `{ summary, payments, aprExpiry, interestShockMonthly, payoffWaterfall }` —
// so destructuring the real response yields undefined and the first field
// read throws.
//
// Some fields the tab displayed have no source at all. Card balances and
// per-card APRs are not modelled: no issuer integration supplies them. They
// are surfaced as nulls here and rendered as unavailable, rather than being
// defaulted to zero — a zero balance and a real one look the same on screen
// and mean opposite things.
// ============================================================

export interface NextPaymentView {
  date: string;
  amount: number;
  issuer: string;
  autopay: boolean;
}

export interface PaymentRow {
  id: string;
  date: string;
  issuer: string;
  amount: number;
  status: string;
  autopayEnabled: boolean;
}

export interface AprExpiryRow {
  applicationId: string;
  issuer: string;
  cardProduct: string;
  expiryDate: string;
  daysRemaining: number;
  currentApr: number | null;
  postExpiryApr: number | null;
  creditLimit: number | null;
  severity: 'critical' | 'warning' | 'ok';
}

export interface PayoffRow {
  applicationId: string;
  priority: number;
  issuer: string;
  cardProduct: string;
  creditLimit: number | null;
  reason: string;
}

export interface RepaymentView {
  hasPlan: boolean;
  strategy: string | null;
  totalBalance: number | null;
  /** Null when no plan is on record — different from an obligation of zero. */
  totalMonthlyObligations: number | null;
  autopayPercent: number | null;
  cardsAtRisk: number;
  nextPayment: NextPaymentView | null;
  payments: PaymentRow[];
  aprExpiry: AprExpiryRow[];
  payoffWaterfall: PayoffRow[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function severityFor(daysRemaining: number | null): 'critical' | 'warning' | 'ok' {
  if (daysRemaining === null) return 'ok';
  if (daysRemaining <= 14) return 'critical';
  if (daysRemaining <= 60) return 'warning';
  return 'ok';
}

export function toRepaymentView(data: unknown): RepaymentView {
  const d = asRecord(data);
  const next = asRecord(d['nextPayment']);

  const payments = (Array.isArray(d['paymentCalendar']) ? d['paymentCalendar'] : [])
    .map(asRecord)
    .map((p) => ({
      id: str(p['id']),
      date: str(p['date']),
      issuer: str(p['issuer'], 'Unknown issuer'),
      amount: num(p['amount']) ?? 0,
      status: str(p['status'], 'upcoming'),
      autopayEnabled: p['autopayEnabled'] === true,
    }))
    .filter((p) => p.id !== '');

  const aprExpiry = (Array.isArray(d['aprExpirySchedule']) ? d['aprExpirySchedule'] : [])
    .map(asRecord)
    .map((a) => {
      const daysRemaining = num(a['daysRemaining']);
      return {
        applicationId: str(a['applicationId']),
        issuer: str(a['issuer'], 'Unknown issuer'),
        cardProduct: str(a['cardProduct'], 'Unspecified card'),
        expiryDate: str(a['expiryDate']),
        daysRemaining: daysRemaining ?? 0,
        currentApr: num(a['currentApr']),
        postExpiryApr: num(a['postExpiryApr']),
        creditLimit: num(a['creditLimit']),
        severity: severityFor(daysRemaining),
      };
    });

  const payoffWaterfall = (Array.isArray(d['payoffWaterfall']) ? d['payoffWaterfall'] : [])
    .map(asRecord)
    .map((p) => ({
      applicationId: str(p['applicationId']),
      priority: num(p['priority']) ?? 0,
      issuer: str(p['issuer'], 'Unknown issuer'),
      cardProduct: str(p['cardProduct'], 'Unspecified card'),
      creditLimit: num(p['creditLimit']),
      reason: str(p['reason']),
    }));

  return {
    hasPlan: d['hasPlan'] === true,
    strategy: typeof d['strategy'] === 'string' ? d['strategy'] : null,
    totalBalance: num(d['totalBalance']),
    totalMonthlyObligations: num(d['totalMonthlyObligations']),
    autopayPercent: num(d['autopayPct']),
    cardsAtRisk: num(d['cardsAtRisk']) ?? 0,
    nextPayment:
      Object.keys(next).length > 0
        ? {
            date: str(next['date']),
            amount: num(next['amount']) ?? 0,
            issuer: str(next['issuer'], 'Unknown issuer'),
            autopay: next['autopay'] === true,
          }
        : null,
    payments,
    aprExpiry,
    payoffWaterfall,
  };
}

/** Currency, or an explicit dash for a figure the API does not carry. */
export function formatAmountOrDash(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================
// Figures about a tenant's portfolio, and the ones there is no source for
//
// Two surfaces report the same figures: `/api/platform/portfolio` and the
// `portfolio-performance` report from `/api/platform/reports/generate`. They
// disagreed. The portfolio endpoint published `delinquencyRate: null` with a
// paragraph explaining why the figure cannot be honestly derived; the report
// published **2.1**, a literal, next to an equally invented average credit
// score of 712 and a graduation rate of 18.6.
//
// A report is worse than a dashboard to be wrong on, because a report gets
// exported and sent. And the contradiction is the tell this file exists to
// prevent: one reason, in one place, read by both.
//
// ── Why delinquency is null and not a number
//
// Decided 2026-08-05, recorded in `docs/gaps.md` §2b. Delinquency **is**
// recorded — `PaymentSchedule.status = 'missed'`, written nightly — but a
// `PaymentSchedule` belongs to a `RepaymentPlan`, a hardship arrangement a
// client is put on. So the only delinquency observable is *a client already on
// a plan missing a payment*. A card going past due outside a plan is invisible.
//
// `delinquentCards / allCards` from that draws its numerator and denominator
// from different populations and lands near zero — which reads as "no
// delinquencies in this portfolio" and means "we only ever looked at the
// clients already in trouble". Beside a printed industry benchmark, a
// structurally low number is worse than no number.
//
// What would change it: any source that observes a card going past due — an
// issuer feed, a statement import carrying payment status, or a deliberate
// advisor-entered flag with a surface behind it.
// ============================================================

/**
 * Why a figure is absent, in words a surface can print.
 *
 * Absent figures carry a reason rather than a null, because a blank on a
 * dashboard and a blank on an exported report are read as zero by different
 * people for different reasons, and neither of them is going to go and read
 * `docs/gaps.md`.
 */
export const UNMEASURABLE = {
  delinquencyRate:
    'Not measured. Delinquency is recorded only as a missed payment on a repayment plan, '
    + 'which observes clients already on one rather than the portfolio. Publishing that as '
    + 'a portfolio rate would understate it structurally. See docs/gaps.md section 2b.',

  avgCreditScore:
    'Not measured. Personal FICO is captured per application when an advisor enters it, not '
    + 'held as a current score per client, so an average across the portfolio would mix scores '
    + 'recorded months apart and count clients more than once.',

  revenue:
    'Not measured. Nothing records programme, funding or platform fees, so revenue figures have '
    + 'no source in this system.',

  complianceFindings:
    'Not measured. Compliance checks are not counted or risk-graded anywhere, so a findings '
    + 'breakdown has nothing behind it.',
} as const;

export type UnmeasurableKey = keyof typeof UNMEASURABLE;

/**
 * Missed payments among clients on a repayment plan.
 *
 * The true, narrower figure — option 1 in the gaps write-up. Returned under a
 * name that says what it counts, and deliberately **not** called a delinquency
 * rate: the objection to option 1 was never that it is false, it was that
 * placing it in the column where a portfolio delinquency rate goes makes it
 * read as one whatever the label says underneath.
 *
 * Useful where repayment plans are the subject. Not useful beside an industry
 * benchmark, which is why nothing here puts it there.
 */
export interface RepaymentPlanMissedPayments {
  /** Schedules past due and unpaid, among plans. */
  missed: number;
  /** Schedules observed at all. Zero means nothing was looked at. */
  observed: number;
  /**
   * The share, or null when nothing was observed.
   *
   * Null rather than 0: "no missed payments among the plans we looked at" and
   * "we looked at no plans" are different statements, and a zero says the
   * first while meaning the second.
   */
  rate: number | null;
}

export function summariseRepaymentMissedPayments(
  schedules: Array<{ status: string }>,
): RepaymentPlanMissedPayments {
  const observed = schedules.length;
  const missed = schedules.filter((s) => s.status === 'missed').length;
  return {
    missed,
    observed,
    rate: observed === 0 ? null : Number(((missed / observed) * 100).toFixed(1)),
  };
}

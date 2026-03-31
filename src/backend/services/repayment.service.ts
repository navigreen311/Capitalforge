// ============================================================
// CapitalForge — Repayment Command Center Service
//
// Responsibilities:
//   • Create & manage repayment plans (avalanche vs snowball)
//   • Generate per-card payment schedules
//   • Autopay verification tracking
//   • Balance transfer / refinancing planner
//   • "Interest shock" forecast when balances carry past promo period
//   • Payoff date projections (month-by-month amortisation)
// ============================================================

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepaymentStrategy = 'avalanche' | 'snowball';
export type PlanStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type ScheduleStatus = 'upcoming' | 'paid' | 'overdue' | 'skipped';

export interface CardDebt {
  /** Card application / account identifier */
  cardApplicationId: string;
  issuer: string;
  /** Current outstanding balance */
  currentBalance: number;
  /** Credit limit on the card */
  creditLimit: number;
  /** Regular / post-promo APR (decimal, e.g. 0.2099) */
  regularApr: number;
  /** Promotional APR (0 = 0% intro) */
  introApr: number;
  /** Calendar date when the promo period expires */
  introAprExpiry: Date | null;
  /** Minimum payment (dollar amount per cycle) */
  minimumPayment: number;
  /** Annual fee */
  annualFee: number;
  /** Whether autopay is enrolled */
  autopayEnabled: boolean;
  /** Whether autopay enrollment has been independently verified */
  autopayVerified: boolean;
}

export interface CreateRepaymentPlanInput {
  businessId: string;
  tenantId: string;
  /** Cards to include in the plan */
  cards: CardDebt[];
  /** Total monthly budget available for all card payments */
  monthlyPaymentBudget: number;
  /** Debt prioritisation algorithm */
  strategy: RepaymentStrategy;
  /** Projection horizon in months (default 60) */
  projectionMonths?: number;
}

// ── Per-card payment schedule entry ──────────────────────────────────────────

export interface ScheduleEntry {
  /** Owning repayment plan ID (set after plan persistence) */
  repaymentPlanId: string;
  cardApplicationId: string;
  issuer: string;
  dueDate: Date;
  minimumPayment: number;
  recommendedPayment: number;
  status: ScheduleStatus;
  autopayEnabled: boolean;
  autopayVerified: boolean;
}

// ── Payoff projection ─────────────────────────────────────────────────────────

export interface CardPayoffProjection {
  cardApplicationId: string;
  issuer: string;
  openingBalance: number;
  /** Month-by-month amortisation table */
  monthlyBreakdown: MonthlyBreakdownRow[];
  payoffMonth: number | null;
  totalInterestPaid: number;
  totalPaid: number;
}

export interface MonthlyBreakdownRow {
  month: number;        // 1-based
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

// ── Interest shock forecast ───────────────────────────────────────────────────

export interface InterestShockCard {
  cardApplicationId: string;
  issuer: string;
  /** Projected balance on the promo expiry date */
  projectedBalanceAtExpiry: number;
  promoExpiryDate: Date;
  /** APR that kicks in after promo */
  postPromoApr: number;
  /** Monthly interest at post-promo rate on projected balance */
  monthlyInterestAtExpiry: number;
  /** Annual interest exposure if balance is not repaid */
  annualInterestExposure: number;
  /** Days until promo expires (from today) */
  daysUntilExpiry: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface InterestShockForecast {
  businessId: string;
  forecastDate: Date;
  cards: InterestShockCard[];
  totalMonthlyShockExposure: number;
  totalAnnualShockExposure: number;
  /** Earliest promo expiry date across all cards */
  earliestExpiryDate: Date | null;
  recommendation: string;
}

// ── Balance transfer / refinancing planner ────────────────────────────────────

export interface BalanceTransferOption {
  cardApplicationId: string;
  issuer: string;
  currentApr: number;
  currentBalance: number;
  /** Estimated transfer APR available (0 = 0% offer) */
  transferApr: number;
  /** Balance transfer fee (decimal, e.g. 0.03 = 3%) */
  transferFeePct: number;
  transferFeeAmount: number;
  /** Projected interest saving over 12 months */
  projectedInterestSaving: number;
  netSaving: number;
  isRecommended: boolean;
  rationale: string;
}

export interface RefinancingPlan {
  businessId: string;
  analysedAt: Date;
  options: BalanceTransferOption[];
  totalPotentialSaving: number;
  recommendation: string;
}

// ── Full repayment plan result ────────────────────────────────────────────────

export interface RepaymentPlanResult {
  businessId: string;
  tenantId: string;
  strategy: RepaymentStrategy;
  totalBalance: number;
  monthlyPayment: number;
  /** Ordered list of cards in repayment priority */
  prioritisedCards: CardDebt[];
  schedules: ScheduleEntry[];
  payoffProjections: CardPayoffProjection[];
  /** Earliest interest-shock date across the stack (for plan-level alerting) */
  interestShockDate: Date | null;
  /** Total monthly interest that would shock in on the next promo expiry */
  interestShockAmount: number | null;
  nextPaymentDate: Date | null;
  createdAt: Date;
}

// ── Autopay verification ──────────────────────────────────────────────────────

export interface AutopayStatus {
  cardApplicationId: string;
  issuer: string;
  autopayEnabled: boolean;
  autopayVerified: boolean;
  verificationGap: boolean; // enabled but not verified
  recommendation: string;
}

// ── Record-payment input ──────────────────────────────────────────────────────

export interface RecordPaymentInput {
  scheduleId: string;
  actualPayment: number;
  paidAt?: Date;
}

export interface RecordPaymentResult {
  scheduleId: string;
  status: ScheduleStatus;
  actualPayment: number;
  paidAt: Date;
  overpayment: number;
  underpayment: number;
}

// ── In-memory stores (production: replace with Prisma calls) ──────────────────

const planStore = new Map<string, RepaymentPlanResult>();
const scheduleStore = new Map<string, ScheduleEntry & { id: string; actualPayment?: number; paidAt?: Date }>();

let scheduleIdCounter = 0;

function newScheduleId(): string {
  return `sched-${++scheduleIdCounter}-${Date.now()}`;
}

// ── RepaymentService ──────────────────────────────────────────────────────────

export class RepaymentService {

  // ── Plan Creation ──────────────────────────────────────────────────────────

  /**
   * Create a repayment plan using the requested strategy.
   *
   * AVALANCHE: Pay minimums on all cards, throw extra budget at the card with
   *            the highest APR first. Minimises total interest paid.
   *
   * SNOWBALL:  Pay minimums on all cards, throw extra budget at the card with
   *            the lowest balance first. Maximises psychological momentum via
   *            quick wins — cards eliminated sooner.
   */
  createPlan(input: CreateRepaymentPlanInput): RepaymentPlanResult {
    const projectionMonths = input.projectionMonths ?? 60;

    // Validate budget covers at least all minimums
    const totalMinimums = input.cards.reduce((s, c) => s + c.minimumPayment, 0);
    const effectiveBudget = Math.max(input.monthlyPaymentBudget, totalMinimums);

    // Prioritise cards per strategy
    const prioritisedCards = this.prioritiseCards(input.cards, input.strategy);

    // Build payment schedules (next 12 months)
    const schedules = this.generateSchedules(
      prioritisedCards,
      effectiveBudget,
      input.strategy,
      'plan-pending',   // planId set after persistence; caller updates
    );

    // Register schedules in the in-memory store
    for (const s of schedules) {
      const id = newScheduleId();
      scheduleStore.set(id, { ...s, id });
    }

    // Build month-by-month payoff projections
    const payoffProjections = prioritisedCards.map((card) =>
      this.projectCardPayoff(card, effectiveBudget, projectionMonths, prioritisedCards),
    );

    // Derive plan-level interest shock summary
    const shockCards = this.buildInterestShockCards(prioritisedCards, payoffProjections);
    const nearestShock = shockCards
      .filter((c) => c.projectedBalanceAtExpiry > 0)
      .sort((a, b) => a.promoExpiryDate.getTime() - b.promoExpiryDate.getTime())[0];

    const totalBalance = round2(
      input.cards.reduce((s, c) => s + c.currentBalance, 0),
    );

    const plan: RepaymentPlanResult = {
      businessId: input.businessId,
      tenantId: input.tenantId,
      strategy: input.strategy,
      totalBalance,
      monthlyPayment: round2(effectiveBudget),
      prioritisedCards,
      schedules,
      payoffProjections,
      interestShockDate: nearestShock ? nearestShock.promoExpiryDate : null,
      interestShockAmount: nearestShock ? round2(nearestShock.monthlyInterestAtExpiry) : null,
      nextPaymentDate: schedules.length > 0 ? schedules[0]!.dueDate : null,
      createdAt: new Date(),
    };

    planStore.set(input.businessId, plan);
    return plan;
  }

  // ── Strategy Prioritisation ────────────────────────────────────────────────

  /**
   * Return a copy of the cards array sorted by repayment priority.
   *
   * Avalanche: highest effective APR first (post-promo rate; promo-expired
   *            cards are treated as already at regular APR).
   * Snowball:  lowest current balance first.
   */
  prioritiseCards(cards: CardDebt[], strategy: RepaymentStrategy): CardDebt[] {
    const today = new Date();
    const sorted = [...cards];

    if (strategy === 'avalanche') {
      sorted.sort((a, b) => {
        const aprA = this.effectiveApr(a, today);
        const aprB = this.effectiveApr(b, today);
        return aprB - aprA; // highest first
      });
    } else {
      // snowball — lowest balance first
      sorted.sort((a, b) => a.currentBalance - b.currentBalance);
    }

    return sorted;
  }

  /**
   * Compute the "effective" APR to use for avalanche ordering.
   * Cards within an active promo period are ordered by post-promo rate
   * (because that is the risk we are managing), but any card whose promo
   * has already expired uses its regularApr directly.
   */
  private effectiveApr(card: CardDebt, today: Date): number {
    if (card.introAprExpiry === null) {
      return card.regularApr;
    }
    return card.introAprExpiry <= today ? card.regularApr : card.regularApr;
    // Note: both branches return regularApr intentionally — promo expiry date
    // is used in the shock forecast; for avalanche ordering the post-promo rate
    // is what matters regardless of whether the promo is currently active.
  }

  // ── Schedule Generation ────────────────────────────────────────────────────

  /**
   * Generate payment schedule entries for the next 12 monthly cycles.
   *
   * Allocates the budget according to strategy priority:
   *   1. Pay minimum on every card.
   *   2. Apply extra budget to the highest-priority card until balance = 0,
   *      then cascade surplus to the next card ("debt snowball/avalanche roll").
   */
  generateSchedules(
    prioritisedCards: CardDebt[],
    monthlyBudget: number,
    strategy: RepaymentStrategy,
    planId: string,
    months = 12,
  ): ScheduleEntry[] {
    const schedules: ScheduleEntry[] = [];
    const today = new Date();

    // Working copy of balances for the roll-down simulation
    const balances = prioritisedCards.map((c) => c.currentBalance);

    for (let m = 0; m < months; m++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + m + 1);
      dueDate.setDate(1);

      // Budget allocation for this month
      let remaining = monthlyBudget;
      const payments: number[] = prioritisedCards.map((c, i) => {
        const min = Math.min(c.minimumPayment, balances[i] ?? 0);
        remaining -= min;
        return min;
      });

      // Roll extra down priority list
      for (let i = 0; i < prioritisedCards.length && remaining > 0; i++) {
        const extra = Math.min(remaining, (balances[i] ?? 0) - payments[i]!);
        if (extra > 0) {
          payments[i] = (payments[i] ?? 0) + extra;
          remaining -= extra;
        }
      }

      // Update balance estimates and create schedule entries
      for (let i = 0; i < prioritisedCards.length; i++) {
        const card = prioritisedCards[i]!;
        const payment = payments[i] ?? 0;
        const prevBalance = balances[i] ?? 0;

        if (prevBalance <= 0) continue; // card already paid off

        // Monthly interest accrual
        const currentApr = this.aprForMonth(card, dueDate);
        const interest = round2(prevBalance * (currentApr / 12));
        const principal = Math.min(payment - interest, prevBalance);
        balances[i] = Math.max(0, prevBalance + interest - payment);

        schedules.push({
          repaymentPlanId: planId,
          cardApplicationId: card.cardApplicationId,
          issuer: card.issuer,
          dueDate,
          minimumPayment: round2(card.minimumPayment),
          recommendedPayment: round2(payment),
          status: 'upcoming',
          autopayEnabled: card.autopayEnabled,
          autopayVerified: card.autopayVerified,
        });
      }
    }

    return schedules;
  }

  /** Determine which APR applies to a card on a given date. */
  private aprForMonth(card: CardDebt, date: Date): number {
    if (card.introAprExpiry !== null && date < card.introAprExpiry) {
      return card.introApr;
    }
    return card.regularApr;
  }

  // ── Payoff Projection ──────────────────────────────────────────────────────

  /**
   * Project month-by-month amortisation for a single card.
   *
   * The card receives its proportional share of the total monthly budget based
   * on its priority position.  Priority-1 card (head of list) receives minimum
   * + all surplus until paid off; once gone, surplus cascades to priority-2, etc.
   *
   * For simplicity this function allocates the full budget to each card in
   * sequence — the roll-down is implicit: once the leading card's balance hits
   * zero its surplus appears in a subsequent call.
   *
   * Callers should use projections together (as a set) rather than in isolation.
   */
  projectCardPayoff(
    card: CardDebt,
    monthlyBudget: number,
    projectionMonths: number,
    allCards: CardDebt[],
  ): CardPayoffProjection {
    const breakdown: MonthlyBreakdownRow[] = [];
    let balance = card.currentBalance;
    let totalInterest = 0;
    let totalPaid = 0;
    let payoffMonth: number | null = null;

    // Compute how much budget to allocate to this card.
    // For multi-card plans the budget is shared; here we prorate by balance.
    const totalBalance = allCards.reduce((s, c) => s + c.currentBalance, 0);
    const share = totalBalance > 0 ? card.currentBalance / totalBalance : 1;
    const cardBudget = Math.max(card.minimumPayment, monthlyBudget * share);

    for (let m = 1; m <= projectionMonths; m++) {
      if (balance <= 0) break;

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + m);
      const apr = this.aprForMonth(card, dueDate);
      const interest = round2(balance * (apr / 12));
      const payment = Math.min(cardBudget, balance + interest);
      const principal = round2(payment - interest);
      const closingBalance = round2(Math.max(0, balance + interest - payment));

      breakdown.push({
        month: m,
        openingBalance: round2(balance),
        payment: round2(payment),
        interest,
        principal,
        closingBalance,
      });

      totalInterest += interest;
      totalPaid += payment;

      if (closingBalance === 0 && payoffMonth === null) {
        payoffMonth = m;
      }

      balance = closingBalance;
    }

    return {
      cardApplicationId: card.cardApplicationId,
      issuer: card.issuer,
      openingBalance: round2(card.currentBalance),
      monthlyBreakdown: breakdown,
      payoffMonth,
      totalInterestPaid: round2(totalInterest),
      totalPaid: round2(totalPaid),
    };
  }

  // ── Interest Shock Forecast ────────────────────────────────────────────────

  /**
   * Forecast the "interest shock" that hits when promotional 0% periods expire
   * with an outstanding balance.
   *
   * For each card with an active promo:
   *   1. Estimate the balance on expiry date by running the minimum-payment
   *      amortisation until expiry.
   *   2. Compute the monthly interest that would start accruing at regularApr.
   *   3. Assign an urgency level based on days until expiry.
   */
  forecastInterestShock(
    businessId: string,
    cards: CardDebt[],
  ): InterestShockForecast {
    const today = new Date();
    const shockCards = this.buildInterestShockCards(cards);

    const totalMonthly = round2(
      shockCards.reduce((s, c) => s + (c.projectedBalanceAtExpiry > 0 ? c.monthlyInterestAtExpiry : 0), 0),
    );
    const totalAnnual = round2(totalMonthly * 12);

    const earliest = shockCards
      .filter((c) => c.projectedBalanceAtExpiry > 0)
      .sort((a, b) => a.promoExpiryDate.getTime() - b.promoExpiryDate.getTime())[0];

    const recommendation = this.buildShockRecommendation(shockCards, today);

    return {
      businessId,
      forecastDate: today,
      cards: shockCards,
      totalMonthlyShockExposure: totalMonthly,
      totalAnnualShockExposure: totalAnnual,
      earliestExpiryDate: earliest ? earliest.promoExpiryDate : null,
      recommendation,
    };
  }

  private buildInterestShockCards(
    cards: CardDebt[],
    payoffProjections?: CardPayoffProjection[],
  ): InterestShockCard[] {
    const today = new Date();
    const results: InterestShockCard[] = [];

    for (const card of cards) {
      if (card.introAprExpiry === null) continue;
      if (card.introAprExpiry <= today) continue; // promo already expired

      const daysUntilExpiry = Math.ceil(
        (card.introAprExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Estimate balance at expiry using minimum-payment rundown
      const monthsUntilExpiry = Math.max(1, Math.ceil(daysUntilExpiry / 30));
      const projectedBalance = this.estimateBalanceAtDate(
        card.currentBalance,
        card.introApr,
        card.minimumPayment,
        monthsUntilExpiry,
      );

      const monthlyInterest = projectedBalance > 0
        ? round2(projectedBalance * (card.regularApr / 12))
        : 0;
      const annualInterest = round2(monthlyInterest * 12);

      const urgencyLevel = this.shockUrgencyLevel(daysUntilExpiry, projectedBalance);

      results.push({
        cardApplicationId: card.cardApplicationId,
        issuer: card.issuer,
        projectedBalanceAtExpiry: round2(projectedBalance),
        promoExpiryDate: card.introAprExpiry,
        postPromoApr: card.regularApr,
        monthlyInterestAtExpiry: monthlyInterest,
        annualInterestExposure: annualInterest,
        daysUntilExpiry,
        urgencyLevel,
      });
    }

    return results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /**
   * Estimate the balance after N months of minimum payments at a given APR.
   * If minimum payment exceeds interest + balance the card is paid off earlier.
   */
  estimateBalanceAtDate(
    openingBalance: number,
    apr: number,
    minimumPayment: number,
    months: number,
  ): number {
    let balance = openingBalance;
    for (let m = 0; m < months; m++) {
      if (balance <= 0) break;
      const interest = balance * (apr / 12);
      const payment = Math.min(minimumPayment, balance + interest);
      balance = Math.max(0, balance + interest - payment);
    }
    return round2(balance);
  }

  private shockUrgencyLevel(
    daysUntilExpiry: number,
    projectedBalance: number,
  ): InterestShockCard['urgencyLevel'] {
    if (projectedBalance <= 0) return 'low';
    if (daysUntilExpiry <= 30) return 'critical';
    if (daysUntilExpiry <= 60) return 'high';
    if (daysUntilExpiry <= 90) return 'medium';
    return 'low';
  }

  private buildShockRecommendation(
    shockCards: InterestShockCard[],
    _today: Date,
  ): string {
    const critical = shockCards.filter((c) => c.urgencyLevel === 'critical' && c.projectedBalanceAtExpiry > 0);
    const high = shockCards.filter((c) => c.urgencyLevel === 'high' && c.projectedBalanceAtExpiry > 0);
    const parts: string[] = [];

    if (critical.length > 0) {
      const names = critical.map((c) => c.issuer).join(', ');
      parts.push(
        `URGENT: ${critical.length} card(s) (${names}) have promo periods expiring within 30 days with outstanding balances. ` +
        `Initiate balance transfers or accelerated payments immediately.`,
      );
    }
    if (high.length > 0) {
      const names = high.map((c) => c.issuer).join(', ');
      parts.push(
        `WARNING: ${high.length} card(s) (${names}) expire within 60 days. ` +
        `Set up autopay at maximum payment rate and evaluate balance transfer options.`,
      );
    }
    if (parts.length === 0) {
      parts.push(
        'No immediate interest shock risk detected. Continue monitoring promo expiry dates 90 days in advance.',
      );
    }
    return parts.join(' ');
  }

  // ── Balance Transfer / Refinancing Planner ────────────────────────────────

  /**
   * Identify cards that would benefit from a balance transfer to a new 0%
   * promotional offer, factoring in the transfer fee.
   *
   * A transfer is recommended when: projectedInterestSaving > transferFeeAmount
   */
  buildRefinancingPlan(
    businessId: string,
    cards: CardDebt[],
    /** Available 0%-offer APR (default 0%) */
    transferApr = 0,
    /** Transfer fee as decimal (default 3%) */
    transferFeePct = 0.03,
    projectionMonths = 12,
  ): RefinancingPlan {
    const options: BalanceTransferOption[] = cards.map((card) => {
      const transferFeeAmount = round2(card.currentBalance * transferFeePct);
      // Cap effective months by how quickly the card would be paid off with minimum payments
      const minPayoffMonths = card.minimumPayment > 0
        ? Math.ceil(card.currentBalance / card.minimumPayment)
        : projectionMonths;
      const effectiveMonths = Math.min(projectionMonths, minPayoffMonths);
      const currentInterest = round2(
        card.currentBalance * (card.regularApr / 12) * effectiveMonths,
      );
      const transferInterest = round2(
        card.currentBalance * (transferApr / 12) * effectiveMonths,
      );
      const projectedInterestSaving = round2(currentInterest - transferInterest);
      const netSaving = round2(projectedInterestSaving - transferFeeAmount);
      const isRecommended = netSaving > 0 && card.currentBalance > 0;

      const rationale = isRecommended
        ? `Transfer saves $${netSaving.toLocaleString('en-US', { maximumFractionDigits: 0 })} net over ${projectionMonths} months after the $${transferFeeAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} transfer fee.`
        : netSaving <= 0
          ? `Transfer fee ($${transferFeeAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}) exceeds projected interest saving — not cost-effective.`
          : 'Card balance is zero; no transfer needed.';

      return {
        cardApplicationId: card.cardApplicationId,
        issuer: card.issuer,
        currentApr: card.regularApr,
        currentBalance: card.currentBalance,
        transferApr,
        transferFeePct,
        transferFeeAmount,
        projectedInterestSaving,
        netSaving,
        isRecommended,
        rationale,
      };
    });

    const totalPotentialSaving = round2(
      options.filter((o) => o.isRecommended).reduce((s, o) => s + o.netSaving, 0),
    );

    const recommendedCount = options.filter((o) => o.isRecommended).length;
    const recommendation =
      recommendedCount > 0
        ? `${recommendedCount} card(s) are candidates for balance transfers, saving up to $${totalPotentialSaving.toLocaleString('en-US', { maximumFractionDigits: 0 })} net over ${projectionMonths} months.`
        : 'No balance transfers are cost-effective at the current transfer fee rate.';

    return {
      businessId,
      analysedAt: new Date(),
      options,
      totalPotentialSaving,
      recommendation,
    };
  }

  // ── Autopay Verification ───────────────────────────────────────────────────

  /**
   * Return autopay status and surface verification gaps (enabled but not yet
   * independently verified).
   */
  checkAutopayStatus(cards: CardDebt[]): AutopayStatus[] {
    return cards.map((card) => {
      const verificationGap = card.autopayEnabled && !card.autopayVerified;
      const recommendation = !card.autopayEnabled
        ? `Enroll ${card.issuer} in autopay to avoid missed payments.`
        : verificationGap
          ? `Autopay is enrolled for ${card.issuer} but not yet verified. Confirm with the issuer portal or statement.`
          : `Autopay confirmed for ${card.issuer}.`;

      return {
        cardApplicationId: card.cardApplicationId,
        issuer: card.issuer,
        autopayEnabled: card.autopayEnabled,
        autopayVerified: card.autopayVerified,
        verificationGap,
        recommendation,
      };
    });
  }

  // ── Payment Recording ─────────────────────────────────────────────────────

  recordPayment(input: RecordPaymentInput): RecordPaymentResult {
    const schedule = scheduleStore.get(input.scheduleId);
    if (!schedule) {
      throw new Error(`Schedule entry ${input.scheduleId} not found.`);
    }

    const paidAt = input.paidAt ?? new Date();
    const overpayment = round2(Math.max(0, input.actualPayment - schedule.recommendedPayment));
    const underpayment = round2(Math.max(0, schedule.minimumPayment - input.actualPayment));
    const newStatus: ScheduleStatus = input.actualPayment >= schedule.minimumPayment ? 'paid' : 'overdue';

    scheduleStore.set(input.scheduleId, {
      ...schedule,
      actualPayment: round2(input.actualPayment),
      paidAt,
      status: newStatus,
    });

    return {
      scheduleId: input.scheduleId,
      status: newStatus,
      actualPayment: round2(input.actualPayment),
      paidAt,
      overpayment,
      underpayment,
    };
  }

  // ── Plan & Schedule Retrieval ─────────────────────────────────────────────

  getLatestPlan(businessId: string): RepaymentPlanResult | undefined {
    return planStore.get(businessId);
  }

  getScheduleById(id: string): (ScheduleEntry & { id: string; actualPayment?: number; paidAt?: Date }) | undefined {
    return scheduleStore.get(id);
  }

  getAllSchedulesForBusiness(businessId: string): ScheduleEntry[] {
    const plan = planStore.get(businessId);
    if (!plan) return [];
    return plan.schedules;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const repaymentService = new RepaymentService();

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

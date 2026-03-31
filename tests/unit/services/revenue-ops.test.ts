// ============================================================
// CapitalForge — Revenue Ops & SaaS Entitlements Test Suite
//
// Covers (25 tests):
//   Fee Calculation (4)
//     • All deal structures produce correct line items
//     • Custom schedule overrides apply
//     • Percent-of-funding math precision
//     • Overage fee calculation
//
//   Invoice Generation (4)
//     • Invoice fields populated correctly
//     • Invoice number is unique per call
//     • Due date calculated from dueDaysFromNow
//     • Type set to percent_of_funding when rate > 0
//
//   Card Approval Trigger (2)
//     • triggerPercentOfFundingFee creates invoice on card approval
//     • Default rate used when none supplied
//
//   Invoice Payment & Refund (4)
//     • payInvoice transitions status to paid
//     • Double-pay throws
//     • issueRefund creates credit note
//     • Over-refund throws
//
//   Commission Tracking (5)
//     • createCommission with flat amount
//     • createCommission with percentage + base
//     • Missing payee throws
//     • approveCommission changes status
//     • clawBackCommission sets status clawed_back
//
//   Plan Entitlements (3)
//     • checkEntitlement allows enabled module
//     • checkEntitlement blocks disabled module
//     • checkEntitlement blocks when monthly limit reached
//
//   Usage Metering (3)
//     • recordUsage increments metric
//     • getUsageForPeriod aggregates metrics
//     • detectOverages returns alert at limit
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateFees,
  generateInvoice,
  triggerPercentOfFundingFee,
  payInvoice,
  issueRefund,
  createCommission,
  approveCommission,
  markCommissionPaid,
  clawBackCommission,
  autoGenerateCommissions,
  getInvoice,
  getInvoicesForBusiness,
  getCommissionsForInvoice,
  FeeCalculationInput,
  GenerateInvoiceInput,
} from '../../../src/backend/services/revenue-ops.service.js';
import {
  activatePlan,
  getTenantPlan,
  upgradePlan,
  cancelPlan,
  checkEntitlement,
  recordUsage,
  getUsageForPeriod,
  getMetricValue,
  detectOverages,
  computeResellerMargin,
  PLAN_CATALOG,
} from '../../../src/backend/services/saas-entitlements.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const T1 = `tenant-test-${Date.now()}`;
const T2 = `tenant-b-${Date.now()}`;
const B1 = `biz-${Date.now()}`;

function makePaidInvoice(tenantId = T1, businessId = B1) {
  const inv = generateInvoice({
    tenantId,
    businessId,
    dealStructure: 'card_stacking',
    totalApprovedCredit: 50_000,
  });
  return payInvoice({ invoiceId: inv.id });
}

// ── Fee Calculation ───────────────────────────────────────────────────────────

describe('calculateFees', () => {
  it('card_stacking: program fee + percent-of-funding line items', () => {
    const result = calculateFees({
      dealStructure: 'card_stacking',
      totalApprovedCredit: 100_000,
    });

    expect(result.programFlatFee).toBe(2_500);
    expect(result.percentOfFundingFee).toBe(3_000); // 3% of 100k
    expect(result.totalFee).toBe(5_500);
    expect(result.lineItems.length).toBe(2);
    expect(result.lineItems[0]?.description).toContain('Program fee');
    expect(result.lineItems[1]?.description).toContain('Percent-of-funding');
  });

  it('consulting_only: only program fee, no percent-of-funding', () => {
    const result = calculateFees({
      dealStructure: 'consulting_only',
      totalApprovedCredit: 200_000,
    });

    expect(result.percentOfFundingFee).toBe(0);
    expect(result.programFlatFee).toBe(1_500);
    expect(result.totalFee).toBe(1_500);
    expect(result.lineItems.length).toBe(1);
  });

  it('custom schedule overrides default values', () => {
    const result = calculateFees({
      dealStructure: 'card_stacking',
      totalApprovedCredit: 50_000,
      customSchedule: {
        programFlatFee: 1_000,
        percentOfFundingRate: 0.05,
      },
    });

    expect(result.programFlatFee).toBe(1_000);
    expect(result.percentOfFundingFee).toBe(2_500); // 5% of 50k
    expect(result.totalFee).toBe(3_500);
  });

  it('overage fee is calculated and included in line items', () => {
    const result = calculateFees({
      dealStructure: 'white_label_reseller',
      totalApprovedCredit: 0,
      overageUnits: 10,
    });

    expect(result.overageFee).toBe(25); // 10 × $2.50
    expect(result.lineItems.some((li) => li.description.includes('Overage'))).toBe(true);
  });
});

// ── Invoice Generation ────────────────────────────────────────────────────────

describe('generateInvoice', () => {
  it('returns invoice with correct amount and status', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'card_stacking',
      totalApprovedCredit: 80_000,
    });

    expect(inv.id).toBeTruthy();
    expect(inv.tenantId).toBe(T1);
    expect(inv.businessId).toBe(B1);
    expect(inv.status).toBe('issued');
    expect(inv.amount).toBe(4_900); // 2500 + 3% of 80k (2400)
    expect(inv.issuedAt).toBeInstanceOf(Date);
  });

  it('each invocation produces a unique invoice number', () => {
    const inv1 = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'consulting_only',
      totalApprovedCredit: 0,
    });
    const inv2 = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'consulting_only',
      totalApprovedCredit: 0,
    });

    expect(inv1.invoiceNumber).not.toBe(inv2.invoiceNumber);
  });

  it('due date is set to dueDaysFromNow from issuedAt', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'consulting_only',
      totalApprovedCredit: 0,
      dueDaysFromNow: 15,
    });

    const dayDiff = Math.round(
      (inv.dueDate!.getTime() - inv.issuedAt!.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(dayDiff).toBe(15);
  });

  it('invoice type is percent_of_funding when rate > 0', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'card_stacking',
      totalApprovedCredit: 50_000,
    });
    expect(inv.type).toBe('percent_of_funding');
  });
});

// ── Card Approval Trigger ─────────────────────────────────────────────────────

describe('triggerPercentOfFundingFee', () => {
  it('creates an invoice on card approval with correct fee', () => {
    const inv = triggerPercentOfFundingFee({
      tenantId: T1,
      businessId: B1,
      cardApplicationId: 'card-app-001',
      approvedCreditLimit: 30_000,
    });

    expect(inv.type).toBe('percent_of_funding');
    expect(inv.amount).toBe(900); // 3% of 30k
    expect(inv.lineItems[0]?.metadata?.['cardApplicationId']).toBe('card-app-001');
  });

  it('uses provided rate override instead of default', () => {
    const inv = triggerPercentOfFundingFee({
      tenantId: T1,
      businessId: B1,
      cardApplicationId: 'card-app-002',
      approvedCreditLimit: 20_000,
      percentOfFundingRate: 0.05,
    });

    expect(inv.amount).toBe(1_000); // 5% of 20k
  });
});

// ── Invoice Payment & Refund ──────────────────────────────────────────────────

describe('payInvoice', () => {
  it('transitions invoice status to paid', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'consulting_only',
      totalApprovedCredit: 0,
    });

    const paid = payInvoice({ invoiceId: inv.id, stripePaymentId: 'pi_test_123' });

    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(paid.stripePaymentId).toBe('pi_test_123');
  });

  it('throws when invoice is already paid', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'consulting_only',
      totalApprovedCredit: 0,
    });
    payInvoice({ invoiceId: inv.id });

    expect(() => payInvoice({ invoiceId: inv.id })).toThrowError(/already paid/);
  });
});

describe('issueRefund', () => {
  it('creates a credit note with negative amount', () => {
    const paid = makePaidInvoice();
    const refundAmount = paid.amount / 2;

    const result = issueRefund({
      originalInvoiceId: paid.id,
      refundAmount,
      reason: 'Client dispute resolved',
      tenantId: T1,
      businessId: B1,
    });

    expect(result.creditNote.amount).toBe(-refundAmount);
    expect(result.creditNote.type).toBe('credit_note');
    expect(result.refundedAmount).toBe(refundAmount);
    expect(result.originalInvoice.refundedAmount).toBe(refundAmount);
  });

  it('throws when refund amount exceeds paid amount', () => {
    const paid = makePaidInvoice();

    expect(() =>
      issueRefund({
        originalInvoiceId: paid.id,
        refundAmount: paid.amount + 1,
        reason: 'Test',
        tenantId: T1,
        businessId: B1,
      }),
    ).toThrowError(/exceeds refundable/);
  });
});

// ── Commission Tracking ───────────────────────────────────────────────────────

describe('createCommission', () => {
  it('creates commission with flat amount', () => {
    const rec = createCommission({
      tenantId: T1,
      partnerId: 'partner-001',
      type: 'referral_flat',
      amount: 500,
    });

    expect(rec.amount).toBe(500);
    expect(rec.status).toBe('pending');
    expect(rec.partnerId).toBe('partner-001');
    expect(rec.percentage).toBeNull();
  });

  it('creates commission from percentage + base amount', () => {
    const rec = createCommission({
      tenantId: T1,
      advisorId: 'advisor-001',
      type: 'advisor_split',
      percentage: 0.40,
      baseAmount: 2_500,
    });

    expect(rec.amount).toBe(1_000); // 40% of 2500
    expect(rec.percentage).toBe(0.40);
  });

  it('throws when neither partnerId nor advisorId provided', () => {
    expect(() =>
      createCommission({
        tenantId: T1,
        type: 'referral_flat',
        amount: 100,
      }),
    ).toThrowError(/requires either partnerId or advisorId/);
  });

  it('approveCommission changes status to approved', () => {
    const rec = createCommission({
      tenantId: T1,
      partnerId: 'partner-002',
      type: 'referral_flat',
      amount: 250,
    });
    const approved = approveCommission(rec.id);
    expect(approved.status).toBe('approved');
  });

  it('clawBackCommission sets status to clawed_back', () => {
    const rec = createCommission({
      tenantId: T1,
      advisorId: 'advisor-002',
      type: 'advisor_split',
      amount: 750,
    });
    const clawed = clawBackCommission(rec.id);
    expect(clawed.status).toBe('clawed_back');
  });
});

describe('autoGenerateCommissions', () => {
  it('creates both partner and advisor commission records', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'card_stacking',
      totalApprovedCredit: 50_000,
    });

    const records = autoGenerateCommissions({
      tenantId: T1,
      invoiceId: inv.id,
      invoiceAmount: inv.amount,
      partnerId: 'partner-xyz',
      advisorId: 'advisor-xyz',
    });

    expect(records.length).toBe(2);
    const partner = records.find((r) => r.partnerId === 'partner-xyz');
    const advisor = records.find((r) => r.advisorId === 'advisor-xyz');
    expect(partner).toBeTruthy();
    expect(advisor).toBeTruthy();
    expect(partner!.type).toBe('referral_percent');
    expect(advisor!.type).toBe('advisor_split');
  });
});

// ── Plan Entitlements ─────────────────────────────────────────────────────────

describe('checkEntitlement', () => {
  const TENANT_ENT = `tenant-ent-${Date.now()}`;

  beforeEach(() => {
    activatePlan(TENANT_ENT, 'professional');
  });

  it('allows access to enabled module with no limit', () => {
    const result = checkEntitlement(TENANT_ENT, 'credit_intelligence', 50);
    expect(result.allowed).toBe(true);
    expect(result.remainingThisPeriod).toBeNull();
  });

  it('blocks access to module not included in plan', () => {
    // starter plan — partner_portal is disabled
    const starterTenant = `tenant-starter-${Date.now()}`;
    activatePlan(starterTenant, 'starter');
    const result = checkEntitlement(starterTenant, 'partner_portal', 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not included');
  });

  it('blocks access when monthly limit is exhausted', () => {
    // professional plan: deal_committee limit = 50
    const result = checkEntitlement(TENANT_ENT, 'deal_committee', 50);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Monthly limit');
    expect(result.remainingThisPeriod).toBe(0);
  });
});

// ── Usage Metering ────────────────────────────────────────────────────────────

describe('usage metering', () => {
  const TENANT_USAGE = `tenant-usage-${Date.now()}`;

  beforeEach(() => {
    activatePlan(TENANT_USAGE, 'starter');
  });

  it('recordUsage increments the metric value', () => {
    recordUsage({ tenantId: TENANT_USAGE, metricName: 'api_calls', increment: 5 });
    recordUsage({ tenantId: TENANT_USAGE, metricName: 'api_calls', increment: 3 });

    const value = getMetricValue(TENANT_USAGE, 'api_calls');
    // Note: may include prior test runs in same period, so check it grew
    expect(value).toBeGreaterThanOrEqual(8);
  });

  it('getUsageForPeriod aggregates all metrics for tenant', () => {
    recordUsage({ tenantId: TENANT_USAGE, metricName: 'documents', increment: 10 });
    recordUsage({ tenantId: TENANT_USAGE, metricName: 'card_applications', increment: 2 });

    const snapshot = getUsageForPeriod(TENANT_USAGE);
    expect(snapshot.tenantId).toBe(TENANT_USAGE);
    expect(snapshot.metrics['documents']).toBeGreaterThanOrEqual(10);
    expect(snapshot.metrics['card_applications']).toBeGreaterThanOrEqual(2);
  });

  it('detectOverages returns severity exceeded when limit surpassed', () => {
    const TENANT_OVER = `tenant-over-${Date.now()}`;
    activatePlan(TENANT_OVER, 'starter');

    // starter: maxBusinesses = 10 — record 12
    recordUsage({ tenantId: TENANT_OVER, metricName: 'businesses', increment: 12 });

    const alerts = detectOverages(TENANT_OVER);
    const businessAlert = alerts.find((a) => a.metricName === 'businesses');
    expect(businessAlert).toBeTruthy();
    expect(businessAlert!.severity).toBe('exceeded');
    expect(businessAlert!.overageUnits).toBe(2);
  });
});

// ── Plan Lifecycle ────────────────────────────────────────────────────────────

describe('plan lifecycle', () => {
  const TENANT_LC = `tenant-lc-${Date.now()}`;

  it('activatePlan creates an active plan', () => {
    const plan = activatePlan(TENANT_LC, 'starter');
    expect(plan.planName).toBe('starter');
    expect(plan.status).toBe('active');
    expect(plan.tenantId).toBe(TENANT_LC);
  });

  it('upgradePlan replaces plan with new tier', () => {
    activatePlan(TENANT_LC, 'starter');
    const upgraded = upgradePlan(TENANT_LC, 'professional');
    expect(upgraded.planName).toBe('professional');
    expect(upgraded.status).toBe('active');

    const stored = getTenantPlan(TENANT_LC);
    expect(stored?.planName).toBe('professional');
  });

  it('cancelPlan sets status to cancelled', () => {
    activatePlan(TENANT_LC, 'professional');
    const cancelled = cancelPlan(TENANT_LC);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.endDate).toBeInstanceOf(Date);
  });
});

// ── Reseller Economics ────────────────────────────────────────────────────────

describe('computeResellerMargin', () => {
  it('returns correct margin and wholesale price for sub-tenant plan', () => {
    const RESELLER = `reseller-${Date.now()}`;
    activatePlan(RESELLER, 'reseller');

    const result = computeResellerMargin(RESELLER, 'professional');

    expect(result.retailPrice).toBe(PLAN_CATALOG.professional.monthlyPrice);
    expect(result.marginPercent).toBe(30);
    expect(result.marginAmount).toBe(Math.round(PLAN_CATALOG.professional.monthlyPrice * 0.30 * 100) / 100);
    expect(result.wholesalePrice).toBe(
      Math.round((PLAN_CATALOG.professional.monthlyPrice - result.marginAmount) * 100) / 100,
    );
  });

  it('throws when caller is not on reseller plan', () => {
    const NOT_RESELLER = `not-reseller-${Date.now()}`;
    activatePlan(NOT_RESELLER, 'professional');

    expect(() => computeResellerMargin(NOT_RESELLER, 'starter')).toThrowError(
      /not on the reseller plan/,
    );
  });
});

// ── Store Accessors ───────────────────────────────────────────────────────────

describe('store accessors', () => {
  it('getInvoicesForBusiness returns only matching tenant + business invoices', () => {
    const TENANT_A = `tenant-a-${Date.now()}`;
    const BIZ_A = `biz-a-${Date.now()}`;
    const BIZ_B = `biz-b-${Date.now()}`;

    generateInvoice({ tenantId: TENANT_A, businessId: BIZ_A, dealStructure: 'consulting_only', totalApprovedCredit: 0 });
    generateInvoice({ tenantId: TENANT_A, businessId: BIZ_A, dealStructure: 'consulting_only', totalApprovedCredit: 0 });
    generateInvoice({ tenantId: TENANT_A, businessId: BIZ_B, dealStructure: 'consulting_only', totalApprovedCredit: 0 });

    const results = getInvoicesForBusiness(TENANT_A, BIZ_A);
    expect(results.length).toBe(2);
    expect(results.every((i) => i.businessId === BIZ_A)).toBe(true);
  });

  it('getCommissionsForInvoice returns only commissions for that invoice', () => {
    const inv = generateInvoice({
      tenantId: T1,
      businessId: B1,
      dealStructure: 'card_stacking',
      totalApprovedCredit: 30_000,
    });

    const records = autoGenerateCommissions({
      tenantId: T1,
      invoiceId: inv.id,
      invoiceAmount: inv.amount,
      partnerId: 'p-filter-test',
    });

    const fetched = getCommissionsForInvoice(inv.id);
    expect(fetched.length).toBeGreaterThanOrEqual(1);
    expect(fetched.every((r) => r.invoiceId === inv.id)).toBe(true);
  });
});

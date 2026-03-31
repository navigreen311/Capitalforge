// ============================================================
// CapitalForge — Acknowledgment Templates
//
// Version-controlled text that clients must acknowledge before
// any funded product is delivered or any card application is
// submitted.
//
// FTC compliance anchor: Seek Capital enforcement action (2023).
// Adding a new version automatically invalidates prior signed
// copies — callers must re-obtain signatures on any version bump.
// ============================================================

// ---- Types -------------------------------------------------

export type AcknowledgmentType =
  | 'product_reality'
  | 'fee_schedule'
  | 'personal_guarantee'
  | 'cash_advance_risk';

export interface AcknowledgmentTemplate {
  /** Semantic version — bump minor for editorial, major for material changes. */
  version: string;
  type: AcknowledgmentType;
  title: string;
  /** Full disclosure text the client sees and must explicitly accept. */
  body: string;
  /** Effective date of this version */
  effectiveDate: string;
}

// ---- Version registry -------------------------------------
// IMPORTANT: every entry is append-only. Never edit an existing
// record — add a new version instead. The service layer uses
// CURRENT_VERSIONS to determine which version requires signing.

export const CURRENT_VERSIONS: Record<AcknowledgmentType, string> = {
  product_reality:     '1.0.0',
  fee_schedule:        '1.0.0',
  personal_guarantee:  '1.0.0',
  cash_advance_risk:   '1.0.0',
};

// ---- Template definitions ----------------------------------

const PRODUCT_REALITY_V1: AcknowledgmentTemplate = {
  version:       '1.0.0',
  type:          'product_reality',
  effectiveDate: '2026-01-01',
  title:         'Product Reality Disclosure — You Are Receiving Business Credit Cards, Not a Loan',
  body: `
IMPORTANT NOTICE — PLEASE READ CAREFULLY BEFORE SIGNING

1. NATURE OF PRODUCT
   CapitalForge and its advisors facilitate applications for BUSINESS-PURPOSE CREDIT
   CARDS issued by third-party banks (issuers). You are NOT a term loan,
   line of credit, merchant cash advance, or any other form of direct debt
   financing recipient from CapitalForge. You are NOT receiving a term loan.

2. WHAT YOU WILL RECEIVE
   If approved by one or more issuers, you will receive one or more business credit
   cards with individual credit limits set by each issuer. Collectively, these
   credit limits constitute your "stacked" credit capacity. You are solely
   responsible for all balances, minimum payments, and compliance with each
   issuer's cardholder agreement.

3. NO GUARANTEE OF APPROVAL
   CapitalForge does not guarantee, promise, or imply that any credit card
   application will be approved. Approval decisions rest exclusively with each
   issuer and are based on factors including but not limited to creditworthiness,
   business revenue, and issuer-specific underwriting criteria.

4. INTRODUCTORY RATES ARE TEMPORARY
   Many business credit cards carry 0% introductory APR periods. THESE RATES
   EXPIRE. Upon expiration, standard purchase APRs — which may exceed 25% —
   apply to any remaining balance. You are responsible for monitoring expiry
   dates and managing balances accordingly.

5. PERSONAL LIABILITY
   By signing business credit card applications, you may be personally liable for
   balances under your personal guarantee. This is separate from any corporate
   structure you maintain. See the Personal Guarantee Acknowledgment for details.

6. CASH ADVANCES CARRY ADDITIONAL FEES AND RISKS
   Using a business credit card for cash advances typically incurs immediate fees
   (3–5% of the advance) and a higher ongoing APR with no grace period. See the
   Cash Advance Risk Acknowledgment for details.

7. FTC DISCLOSURE
   In connection with a Federal Trade Commission consent order, CapitalForge
   explicitly states that it is NOT a lender and that "funding" obtained through
   this program consists of credit card spending capacity, not loan proceeds.

I HAVE READ AND UNDERSTOOD THIS DISCLOSURE. I ACKNOWLEDGE THAT I AM APPLYING
FOR BUSINESS CREDIT CARDS AND THAT NO TERM LOAN, LINE OF CREDIT, OR OTHER DIRECT
DEBT INSTRUMENT WILL BE PROVIDED BY CAPITALFORGE.
`.trim(),
};

const FEE_SCHEDULE_V1: AcknowledgmentTemplate = {
  version:       '1.0.0',
  type:          'fee_schedule',
  effectiveDate: '2026-01-01',
  title:         'Fee Schedule Disclosure — All Program Fees Itemized',
  body: `
FEE SCHEDULE DISCLOSURE

Before entering into any engagement with CapitalForge, you must understand and
agree to the following fee structure. All fees are itemized in compliance with
the FTC's prohibition on undisclosed or misleading fee representations.

1. PROGRAM ENROLLMENT FEE
   A one-time enrollment fee is charged upon commencement of the engagement.
   This fee covers credit analysis, strategy design, and program onboarding.
   The exact amount is specified in your Engagement Agreement. This fee is
   NON-REFUNDABLE once advisory services begin.

2. SUCCESS FEE (PERCENT OF APPROVED CREDIT)
   Upon successful card approvals, a success fee equal to a percentage of the
   total approved credit limits is due. This percentage is disclosed in your
   Engagement Agreement and is typically between 8% and 12% of approved limits.
   For example: $100,000 in approved credit limits at 10% = $10,000 success fee.

3. ANNUAL CARD FEES
   Many business credit cards carry annual fees ranging from $0 to $695 per card
   per year. These fees are charged by the card ISSUER, not by CapitalForge.
   You are responsible for all issuer fees.

4. PAYMENT PROCESSOR FEES
   If you use a third-party payment processor to convert credit capacity into
   business funds (e.g., via ACH transfer services), that processor may charge
   fees of 1.5% to 2.9% plus transaction charges. CapitalForge is not responsible
   for processor pricing.

5. NO HIDDEN FEES
   CapitalForge will not charge any fees not disclosed in this schedule or your
   Engagement Agreement. If additional fee structures apply to your specific
   program tier, they will be disclosed in writing before you are obligated to pay.

6. TOTAL COST OF CAPITAL
   You are entitled to a Cost of Capital calculation prior to signing. This
   calculation will model your total estimated expense as an effective APR
   equivalent so you can compare this program to alternative financing options.

I HAVE REVIEWED THE COMPLETE FEE SCHEDULE. I UNDERSTAND THE FEES I MAY INCUR
AND CONSENT TO THESE TERMS AS A CONDITION OF ENGAGING CAPITALFORGE SERVICES.
`.trim(),
};

const PERSONAL_GUARANTEE_V1: AcknowledgmentTemplate = {
  version:       '1.0.0',
  type:          'personal_guarantee',
  effectiveDate: '2026-01-01',
  title:         'Personal Guarantee Acknowledgment — Your Personal Liability',
  body: `
PERSONAL GUARANTEE ACKNOWLEDGMENT

1. NATURE OF YOUR LIABILITY
   Business credit card issuers typically require a personal guarantee from the
   principal applicant. By signing the card applications facilitated by
   CapitalForge, you are personally guaranteeing the debt owed on each card.

2. CORPORATE STRUCTURE DOES NOT ELIMINATE PERSONAL LIABILITY
   Even if your business is structured as an LLC, S-Corp, C-Corp, or other
   limited liability entity, your personal guarantee on a credit card means that
   the card issuer may pursue YOU PERSONALLY for unpaid balances, including through
   collection activity, credit reporting, and civil litigation.

3. IMPACT ON PERSONAL CREDIT
   Balances, late payments, and defaults on personally guaranteed business credit
   cards may be reported to personal consumer credit bureaus (Equifax, TransUnion,
   Experian), potentially lowering your personal credit score.

4. JOINT AND SEVERAL LIABILITY
   In cases where multiple guarantors sign, each guarantor may be held fully liable
   for the entire balance — not merely a proportional share.

5. YOUR OBLIGATION TO MANAGE BALANCES
   You are solely responsible for making minimum payments on all approved cards,
   regardless of the business's financial condition. CapitalForge has no obligation
   to pay any card balance on your behalf.

I UNDERSTAND THAT BY PROCEEDING WITH BUSINESS CREDIT CARD APPLICATIONS, I AM
ACCEPTING PERSONAL GUARANTEE LIABILITY. I HAVE CONSULTED OR HAD THE OPPORTUNITY
TO CONSULT WITH LEGAL COUNSEL REGARDING THIS OBLIGATION.
`.trim(),
};

const CASH_ADVANCE_RISK_V1: AcknowledgmentTemplate = {
  version:       '1.0.0',
  type:          'cash_advance_risk',
  effectiveDate: '2026-01-01',
  title:         'Cash Advance Risk Disclosure — Fees, Rates, and Risks',
  body: `
CASH ADVANCE RISK DISCLOSURE

If you intend to use business credit card cash advance features, or if you intend
to use third-party services that process credit card charges and then remit funds
to your bank account (functionally similar to a cash advance), you must understand
the following risks.

1. IMMEDIATE CASH ADVANCE FEES
   Cash advances on business credit cards typically incur an upfront fee of 3% to
   5% of the advance amount with no grace period. This fee is charged immediately
   when the advance is taken.

2. HIGHER CASH ADVANCE APR
   Cash advance APRs are typically higher than purchase APRs and begin accruing
   IMMEDIATELY with no interest-free grace period. Cash advance APRs of 25% to
   30% are common and can significantly erode the value of the funds obtained.

3. THIRD-PARTY PAYMENT PROCESSOR RISK
   Services that facilitate the transfer of credit availability into cash may
   classify those transactions as cash advances, triggering the fees and rates
   described above. Read all processor agreements carefully. CapitalForge is NOT
   responsible for how issuers classify transactions processed by third parties.

4. TOTAL COST IMPLICATIONS
   Using $50,000 of a credit card limit as a cash advance at a 5% upfront fee and
   27% APR, carried for 12 months with minimum payments, could result in total
   fees and interest exceeding $18,000 on the original $50,000 draw.

5. NOT RECOMMENDED AS CORE STRATEGY
   CapitalForge's program is designed primarily for PURCHASE TRANSACTIONS during
   the introductory 0% APR period. Cash advances fundamentally alter the
   economics of this program and are generally discouraged unless you have a
   specific, well-modeled use case.

I HAVE READ AND UNDERSTOOD THE CASH ADVANCE RISK DISCLOSURE. I ACKNOWLEDGE THAT
CASH ADVANCES CARRY SIGNIFICANT FEES AND INTEREST CHARGES THAT CAN SUBSTANTIALLY
INCREASE MY TOTAL COST OF CAPITAL.
`.trim(),
};

// ---- Public API -------------------------------------------

/** All known templates indexed by [type][version]. */
const TEMPLATE_REGISTRY: Record<AcknowledgmentType, Record<string, AcknowledgmentTemplate>> = {
  product_reality:    { '1.0.0': PRODUCT_REALITY_V1 },
  fee_schedule:       { '1.0.0': FEE_SCHEDULE_V1 },
  personal_guarantee: { '1.0.0': PERSONAL_GUARANTEE_V1 },
  cash_advance_risk:  { '1.0.0': CASH_ADVANCE_RISK_V1 },
};

/**
 * Retrieve a template by type and version.
 * Returns undefined if the version does not exist.
 */
export function getTemplate(
  type: AcknowledgmentType,
  version: string,
): AcknowledgmentTemplate | undefined {
  return TEMPLATE_REGISTRY[type]?.[version];
}

/**
 * Retrieve the current (latest required) template for a given type.
 * Throws if the current version is somehow unregistered — this is a
 * developer error.
 */
export function getCurrentTemplate(type: AcknowledgmentType): AcknowledgmentTemplate {
  const version = CURRENT_VERSIONS[type];
  const tpl = TEMPLATE_REGISTRY[type]?.[version];
  if (!tpl) {
    throw new Error(
      `[AcknowledgmentTemplates] No template found for type="${type}" version="${version}". ` +
      'Register it in TEMPLATE_REGISTRY.',
    );
  }
  return tpl;
}

/** Returns all registered versions for a given type, newest last. */
export function getVersionHistory(type: AcknowledgmentType): string[] {
  return Object.keys(TEMPLATE_REGISTRY[type] ?? {});
}

/** All acknowledgment types in required-signing order. */
export const ALL_ACK_TYPES: AcknowledgmentType[] = [
  'product_reality',
  'fee_schedule',
  'personal_guarantee',
  'cash_advance_risk',
];

/**
 * Gate acknowledgment types that must be signed BEFORE any card
 * application can be submitted.
 */
export const PRE_SUBMISSION_REQUIRED: AcknowledgmentType[] = [
  'product_reality',
  'fee_schedule',
];

/**
 * Gate acknowledgment types required during initial onboarding
 * (before engagement begins).
 */
export const PRE_ENGAGEMENT_REQUIRED: AcknowledgmentType[] = [
  'product_reality',
  'fee_schedule',
];

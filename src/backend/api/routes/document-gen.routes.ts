// ============================================================
// CapitalForge — Document Generation Routes
//
// Endpoints:
//   POST /api/documents/generate — generate mock document text
//     Supported document_type values (16 total):
//       - decline_reconsideration_letter
//       - business_purpose_statement
//       - application_cover_letter
//       - product_reality_acknowledgment
//       - hardship_workout_proposal
//       - fee_disclosure_letter
//       - welcome_package
//       - apr_expiry_warning_letter
//       - restack_opportunity_summary
//       - compliance_incident_report
//       - client_progress_report
//       - funding_round_summary
//       - advisor_call_summary
//       - collection_notice
//       - consent_confirmation_letter
//       - adverse_action_response
//
// All routes require a valid tenant JWT via tenantMiddleware.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import {
  checkRestackEligibility,
  RestackBusinessNotFoundError,
} from '../../services/restack-trigger.js';
import { ConsentService } from '../../services/consent.service.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const documentGenRouter = Router();

let _consentService: ConsentService | null = null;
function getConsentService(): ConsentService {
  _consentService ??= new ConsentService();
  return _consentService;
}

documentGenRouter.use(tenantMiddleware);

// ── Supported Document Types ─────────────────────────────────

const DOCUMENT_TYPES = [
  'decline_reconsideration_letter',
  'business_purpose_statement',
  'application_cover_letter',
  'product_reality_acknowledgment',
  'hardship_workout_proposal',
  'fee_disclosure_letter',
  'welcome_package',
  'apr_expiry_warning_letter',
  'restack_opportunity_summary',
  'compliance_incident_report',
  'client_progress_report',
  'funding_round_summary',
  'advisor_call_summary',
  'collection_notice',
  'consent_confirmation_letter',
  'adverse_action_response',
] as const;

type GeneratedDocumentType = typeof DOCUMENT_TYPES[number];

// ── Validation Schema ────────────────────────────────────────

const GenerateSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

// ── Helpers ───────────────────────────────────────────────────

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(status).json(body);
}

function handleUnexpected(err: unknown, res: Response, context: string): void {
  if (err instanceof DocumentContextRequiredError) {
    sendError(res, 422, 'DOCUMENT_CONTEXT_REQUIRED', err.message, {
      documentType: err.documentType,
    });
    return;
  }
  if (err instanceof ZodError) {
    sendError(res, 422, 'VALIDATION_ERROR', 'Invalid request body.', err.flatten().fieldErrors);
    return;
  }
  logger.error(`[DocumentGenRoutes] Unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

/**
 * A document that cannot be produced without something nobody supplied.
 *
 * The generators are pure `(ctx) => string`, and every missing field until now
 * degraded to a `[placeholder]`. That is the right answer for a field. It is
 * the wrong answer for the CLAIM a document is built around: a re-stack
 * summary whose executive summary says "you are eligible" is not improved by
 * putting the readiness score in brackets underneath.
 */
export class DocumentContextRequiredError extends Error {
  constructor(public readonly documentType: string, public readonly missing: string) {
    super(`${documentType} cannot be generated: ${missing}`);
    this.name = 'DocumentContextRequiredError';
  }
}

// ── Template Generators ──────────────────────────────────────

function generateDeclineReconsiderationLetter(ctx: Record<string, unknown>): string {
  const businessName = (ctx.business_name as string) ?? '[Business]';
  const issuer = (ctx.issuer as string) ?? '[Issuer]';
  const cardName = (ctx.card_name as string) ?? '[Card]';
  const declineReason = (ctx.decline_reason as string) ?? '[decline reason]';
  const applicantName = (ctx.applicant_name as string) ?? '[Applicant]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `${date}

${issuer} Reconsideration Department
P.O. Box 15298
Wilmington, DE 19850

Re: Reconsideration Request for ${cardName} Application
Business: ${businessName}

Dear ${issuer} Reconsideration Team,

I am writing to respectfully request reconsideration of the recent decision to decline my application for the ${cardName} credit card on behalf of ${businessName}.

I understand the initial decision was based on ${declineReason}. I would like to provide additional context that may support a favorable review:

1. ${businessName} has been operating profitably for over 2 years with consistent revenue growth.
2. Our current business credit profile demonstrates responsible utilization across existing accounts.
3. The recent inquiries were part of a planned business credit building strategy managed by a licensed financial advisor.

We are seeking this line of credit to support our business operations and growth initiatives. Our strong payment history and business fundamentals demonstrate our ability to manage this account responsibly.

I would appreciate the opportunity to discuss this further and provide any additional documentation that may be helpful.

Sincerely,
${applicantName}
${businessName}`;
}

function generateBusinessPurposeStatement(ctx: Record<string, unknown>): string {
  const businessName = (ctx.business_name as string) ?? '[Business]';
  const industry = (ctx.industry as string) ?? '[industry]';
  // Brackets, not figures. Every other field in these generators falls back to a
  // visible placeholder; these two fell back to money. A Business Purpose
  // Statement is signed by the client, and one asserting $150,000 sought against
  // $500,000 of revenue — when neither was supplied — reads exactly like one
  // where both were.
  const creditAmount = (ctx.credit_amount as string) ?? '[credit amount]';
  const purpose = (ctx.purpose as string) ?? '[purpose]';
  const revenue = (ctx.annual_revenue as string) ?? '[annual revenue]';

  // The client signs this statement, and this paragraph asserted their
  // solvency: "${businessName} generates sufficient monthly cash flow to
  // service all credit obligations within the 0% APR introductory periods."
  //
  // Nothing checked that, and nothing here could — the statement is assembled
  // from a request body. It also presumed the client holds 0% introductory-APR
  // cards. A capacity claim in a document the client puts their name to is the
  // same defect as the re-stack summary's executive summary, one step worse:
  // there it was the system asserting; here it is the client, on the system's
  // say-so.
  const repaymentBasis =
    typeof ctx.repayment_basis === 'string' && ctx.repayment_basis.trim() !== ''
      ? (ctx.repayment_basis as string)
      : `[repayment basis — state how ${businessName} will service these obligations]`;

  // The allocation comes from the client or it is a bracket.
  //
  // It was four fixed lines — Inventory 40%, Marketing 25%, Equipment 20%,
  // Working capital 15% — identical in every statement this system produced.
  // A Business Purpose Statement is the document that evidences credit is for
  // business rather than personal use, and the allocation is the part doing that
  // evidencing. Nobody here knows how a given client will spend the money, and
  // the document whose purpose is proving business use is the wrong place to
  // guess at it.
  //
  // `use_of_funds` is an array of {purpose, percent} when the client has stated
  // one. When they have not, the section says so in a form nobody will mistake
  // for an answer — and a statement that goes out with the bracket still in it
  // is a statement somebody has to fill in before it means anything, which is
  // the correct outcome.
  const useOfFunds = Array.isArray(ctx.use_of_funds) ? ctx.use_of_funds : null;
  const allocation =
    useOfFunds && useOfFunds.length > 0
      ? useOfFunds
          .map((u) => {
            const item = u as { purpose?: unknown; percent?: unknown };
            const purposeText =
              typeof item.purpose === 'string' && item.purpose.trim()
                ? item.purpose
                : '[purpose]';
            const pct =
              typeof item.percent === 'number' ? ` (${item.percent}%)` : '';
            return `- ${purposeText}${pct}`;
          })
          .join('\n')
      : '[The client has not stated an allocation. This section must be completed '
        + 'with the client before the statement is used.]';

  return `BUSINESS PURPOSE STATEMENT

Business Name: ${businessName}
Industry: ${industry}
Annual Revenue: ${revenue}

PURPOSE OF CREDIT FACILITY

${businessName} is seeking a total credit facility of ${creditAmount} for the purpose of ${purpose}.

INTENDED USE OF FUNDS

The requested credit will be allocated as follows:
${allocation}

REPAYMENT STRATEGY

${repaymentBasis}
- Monthly minimum payments maintained across all accounts
- Strategic balance paydown prioritized by APR expiration dates
- Revenue-based accelerated repayment during peak business periods

BUSINESS JUSTIFICATION

This credit facility will enable ${businessName} to:
1. Scale operations without diluting equity
2. Take advantage of vendor early-payment discounts
3. Maintain adequate cash reserves for unexpected opportunities
4. Build a strong business credit profile for future financing needs

This statement is accurate and complete to the best of my knowledge.

Authorized Representative
${businessName}
Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}

function generateApplicationCoverLetter(ctx: Record<string, unknown>): string {
  const businessName = (ctx.business_name as string) ?? '[Business]';
  const issuer = (ctx.issuer as string) ?? '[Issuer]';
  const cardName = (ctx.card_name as string) ?? '[Card]';
  const applicantName = (ctx.applicant_name as string) ?? '[Applicant]';
  const applicantTitle = (ctx.applicant_title as string) ?? '[Title]';
  const yearsInBusiness = (ctx.years_in_business as string) ?? '[years in business]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `${date}

${issuer} Business Card Applications
Card Services Division

Re: Application for ${cardName}
Business: ${businessName}

Dear ${issuer} Business Card Team,

I am pleased to submit this application for the ${cardName} on behalf of ${businessName}, where I serve as ${applicantTitle}.

BUSINESS OVERVIEW

${businessName} has been in operation for ${yearsInBusiness} years. Our business maintains strong financial fundamentals with consistent revenue growth and responsible credit management across all existing accounts.

APPLICATION CONTEXT

We are applying for the ${cardName} as part of our strategic credit portfolio to support ongoing business operations. Our advisor has identified this product as an excellent fit for our current business profile and credit needs.

SUPPORTING INFORMATION

- All existing business credit accounts are in good standing with no late payments
- Personal credit profile of the guarantor is strong and well-maintained
- Business revenue supports the requested credit line
- Clear business purpose and repayment strategy in place

We look forward to establishing a relationship with ${issuer} and are happy to provide any additional documentation or information required.

Best regards,
${applicantName}
${applicantTitle}
${businessName}`;
}

function generateProductRealityAcknowledgment(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? 'Client';
  const primaryOwner = (ctx.primary_owner as string) ?? clientName;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `PRODUCT-REALITY ACKNOWLEDGMENT

Client: ${clientName}
Primary Owner: ${primaryOwner}
Date: ${date}

I acknowledge and understand that:

1. I am receiving business credit cards, not a traditional business loan.
2. Cards carry variable APRs after any introductory period expires.
3. Personal guarantees may apply to business credit card accounts.
4. Cash advances are restricted and subject to additional fees.
5. The program fee structure is as disclosed in the Fee Disclosure Letter.
6. Credit limits are determined by the issuing bank and are not guaranteed.
7. Late or missed payments may result in penalty APR and credit score impact.

I have read, understand, and agree to the terms of the CapitalForge Business Credit Card Stacking Program.

Signature: ________________________
Date: ${date}`;
}

function generateHardshipWorkoutProposal(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? 'Client';
  const issuer = (ctx.issuer as string) ?? 'Issuer';
  const currentBalance = ctx.current_balance ? '$' + Number(ctx.current_balance).toLocaleString() : '[balance]';
  const hardshipReason = (ctx.hardship_reason as string) ?? '[hardship reason]';
  const currentApr = (ctx.current_apr as string) ?? '[current APR]';
  const monthlyRevenue = ctx.monthly_revenue ? '$' + Number(ctx.monthly_revenue).toLocaleString() : '[monthly revenue]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `${date}

To: ${issuer} Hardship Department
Re: Payment Arrangement Request
Account Holder: ${clientName}
Current Balance: ${currentBalance}

Dear Hardship Team,

I am writing on behalf of ${clientName} to request a temporary payment arrangement due to ${hardshipReason}.

CURRENT SITUATION

The account holder is experiencing ${hardshipReason} which has temporarily impacted their ability to meet the current minimum payment obligations. This is a temporary situation and the client remains committed to fulfilling all financial obligations.

PROPOSED WORKOUT TERMS

We respectfully request:
1. A temporary payment reduction for the next 3-6 months
2. An interest rate reduction from ${currentApr}% to a hardship rate
3. Waiver of late fees incurred during the hardship period
4. A structured repayment plan that allows the client to maintain good standing

REPAYMENT CAPACITY

The client has monthly business revenue of ${monthlyRevenue} and is confident they can service a modified payment plan. We propose a graduated payment schedule that increases as business conditions normalize.

We appreciate your consideration of this request and are available to discuss further.

Sincerely,
${advisorName}
CapitalForge`;
}

function generateFeeDisclosureLetter(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const programFeeFlat = ctx.program_fee_flat ? '$' + Number(ctx.program_fee_flat).toLocaleString() : '[flat fee]';
  const programFeePct = (ctx.program_fee_pct as string) ?? '[X]';
  const fundingEstimate = ctx.funding_estimate ? '$' + Number(ctx.funding_estimate).toLocaleString() : '[estimate]';
  const refundPolicy = (ctx.refund_policy as string) ?? '[refund policy]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `FEE DISCLOSURE LETTER

To: ${clientName}
From: ${advisorName}, CapitalForge
Date: ${date}

Dear ${clientName},

This letter discloses all fees associated with your CapitalForge Business Credit Card Stacking Program engagement. Please review carefully before proceeding.

PROGRAM FEE SCHEDULE

- Program Fee (Flat): ${programFeeFlat}
- Percentage of Funding Fee: ${programFeePct}% of total funded amount
- Estimated Total Fees: Based on a funding estimate of ${fundingEstimate}

PAYMENT TERMS

- Program fee is due upon enrollment
- Percentage fee is invoiced upon successful funding completion
- Payment methods accepted: ACH, wire transfer, credit card

REFUND POLICY

${refundPolicy}

Please review these terms carefully and contact your advisor with any questions before signing the engagement agreement.

Sincerely,
${advisorName}
CapitalForge`;
}

function generateWelcomePackage(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const ownerName = (ctx.owner_name as string) ?? clientName;
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const nextSteps = Array.isArray(ctx.next_steps)
    ? (ctx.next_steps as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '1. Complete all acknowledgment documents\n2. Upload required bank statements and tax returns\n3. Schedule your initial strategy call with your advisor\n4. Review the Fee Disclosure Letter';

  return `WELCOME TO CAPITALFORGE

Dear ${ownerName},

We are thrilled to welcome ${clientName} to the CapitalForge Business Credit Card Stacking Program. Our team is committed to helping you access the capital your business needs to grow.

YOUR ADVISOR

Your dedicated advisor is ${advisorName}. They will guide you through every step of the funding process, from initial credit analysis through successful funding and beyond.

NEXT STEPS

${nextSteps}

WHAT TO EXPECT

- Initial credit analysis within 48 hours of document submission
- Personalized funding strategy tailored to your business profile
- Ongoing monitoring of your credit portfolio and APR expiration dates
- Access to the CapitalForge client portal for real-time status updates

IMPORTANT REMINDERS

- All communications are recorded for compliance and quality purposes
- Keep your advisor updated on any changes to your business or financial situation
- Maintain timely payments on all existing credit accounts during the program

We look forward to helping ${clientName} access the capital it deserves.

Warm regards,
${advisorName}
CapitalForge`;
}

function generateAprExpiryWarningLetter(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const ownerName = (ctx.owner_name as string) ?? clientName;
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';

  let cardDetails = 'Your card introductory APR period is expiring soon. Please contact your advisor for details.';
  if (Array.isArray(ctx.expiring_cards)) {
    const cards = ctx.expiring_cards as Array<Record<string, unknown>>;
    cardDetails = 'The following cards have introductory APR periods expiring soon:\n\n' +
      cards.map(c =>
        `- ${c.card_name ?? 'Card'} (${c.issuer ?? 'Issuer'}): Balance ${c.balance === undefined || c.balance === null ? '[balance]' : '$' + Number(c.balance).toLocaleString()}, expires in ${c.days_remaining ?? '??'} days`
      ).join('\n');
  }

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `URGENT: APR EXPIRY WARNING

Date: ${date}

Dear ${ownerName},

This letter is to advise you that one or more of your business credit cards have 0% introductory APR periods expiring soon. Immediate action is recommended to minimize interest charges.

EXPIRING CARDS

${cardDetails}

RECOMMENDED ACTIONS

1. Review your current balances and payment schedule
2. Consider balance transfer options to extend 0% APR periods
3. Accelerate payments on cards with the nearest expiration dates
4. Contact your advisor to discuss restack or refinancing options

WHAT HAPPENS WHEN APR EXPIRES

Once the introductory period ends, the variable APR will apply to any remaining balance. This can significantly increase your monthly payment obligations.

Please contact ${advisorName} immediately to discuss your options and develop an action plan.

Sincerely,
${advisorName}
CapitalForge`;
}

/**
 * The eligibility verdict this document is built around.
 *
 * Injected by the route from `checkRestackEligibility`, not accepted from the
 * caller's context blob. The document is handed to a client; a caller who could
 * type `eligible: true` into a request body could hand a client a letter saying
 * they qualify for funding they do not qualify for.
 */
export interface RestackSummaryVerdict {
  eligible: boolean;
  reasons: string[];
  readinessScore: number | null;
}

function generateRestackOpportunitySummary(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // The executive summary is a verdict, so it comes from the engine or the
  // document is not produced.
  //
  // This read `Based on your current credit profile and payment history, you
  // are eligible for an additional round of business credit card funding` —
  // unconditionally, in a document handed to a client, from a generator that
  // received no eligibility result and checked nothing. Whatever
  // restack-trigger had decided, the letter said yes.
  const verdict = ctx.eligibility as RestackSummaryVerdict | undefined;
  if (!verdict || typeof verdict.eligible !== 'boolean') {
    throw new DocumentContextRequiredError(
      'restack_opportunity_summary',
      'no eligibility result was supplied. The executive summary states whether the '
      + 'client qualifies for another round, and this document is given to the client, '
      + 'so that sentence has to come from the re-stack engine rather than from the '
      + 'request. Send business_id and the route will read it.',
    );
  }

  const readinessScore = verdict.readinessScore === null
    ? '[not assessed]'
    : String(verdict.readinessScore);

  const executiveSummary = verdict.eligible
    ? 'Based on the re-stack review of your account, you are eligible for an additional '
      + 'round of business credit card funding (re-stack).'
    : 'Based on the re-stack review of your account, you are NOT currently eligible for '
      + 'an additional round of business credit card funding. The findings are listed '
      + 'below.';

  const findings = verdict.reasons.length > 0
    ? verdict.reasons.map((r) => `- ${r}`).join('\n')
    : '- No findings were recorded.';

  // Money, percentages and counts stay as brackets when absent, as everywhere
  // else in this file.
  const estimatedCredit = ctx.estimated_credit
    ? '$' + Number(ctx.estimated_credit).toLocaleString()
    : '[estimate]';

  // These two used to fall back to 'Good' and 'Stable/Improving'. Every other
  // field in every other generator degrades to a visible placeholder; these
  // degraded to favourable assertions about a client's credit, in a document
  // that client reads. A caller who supplied nothing got a letter rating their
  // payment history Good.
  const paymentRating = (ctx.payment_rating as string) ?? '[not supplied]';
  const scoreTrend = (ctx.score_trend as string) ?? '[not supplied]';

  const nextSteps = verdict.eligible
    ? `RECOMMENDED NEXT STEPS

1. Review current card portfolio and close any dormant accounts if beneficial
2. Ensure all current balances are optimally distributed
3. Schedule a re-stack strategy session with your advisor
4. Prepare updated business documentation (bank statements, P&L)`
    : `RECOMMENDED NEXT STEPS

1. Review the findings above with your advisor
2. Address the items that are within your control
3. Ask your advisor when this review should be run again`;

  return `RE-STACK FUNDING OPPORTUNITY SUMMARY

Date: ${date}
Client: ${clientName}
Prepared by: ${advisorName}

EXECUTIVE SUMMARY

${executiveSummary}

ELIGIBILITY ANALYSIS

- Re-Stack Readiness Score: ${readinessScore}/100
- Estimated Additional Credit Available: ${estimatedCredit}
- Time Since Last Funding Round: ${(ctx.months_since_last as string) ?? '[X]'} months
- Payment History Rating: ${paymentRating}

FINDINGS

${findings}

KEY FACTORS

- Credit score trajectory: ${scoreTrend}
- Current utilization across existing cards: ${(ctx.utilization as string) ?? '[X]'}%
- Number of eligible issuers for new applications: ${(ctx.eligible_issuers as string) ?? '[X]'}

${nextSteps}

RISK CONSIDERATIONS

- Additional inquiries will temporarily impact credit score
- New accounts reduce average age of accounts
- Ensure business cash flow supports additional credit obligations

Contact ${advisorName} to discuss this review${verdict.eligible ? ' and schedule your re-stack round' : ''}.`;
}

function generateComplianceIncidentReport(ctx: Record<string, unknown>): string {
  const incidentType = (ctx.incident_type as string) ?? '[Type]';
  const severity = (ctx.severity as string) ?? '[Severity]';
  const description = (ctx.description as string) ?? '[Description of the incident]';
  const affectedClients = (ctx.affected_clients as string) ?? '[affected clients]';
  const rootCause = (ctx.root_cause as string) ?? '[root cause]';
  const remediation = (ctx.remediation as string) ?? '[remediation]';
  const reportedBy = (ctx.reported_by as string) ?? '[Reporter]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `COMPLIANCE INCIDENT REPORT

Report Date: ${date}
Incident Type: ${incidentType}
Severity Level: ${severity}
Reported By: ${reportedBy}
Report ID: INC-${Date.now().toString(36).toUpperCase()}

INCIDENT DESCRIPTION

${description}

AFFECTED PARTIES

Affected Clients: ${affectedClients}
Regulatory Implications: ${(ctx.regulatory_implications as string) ?? '[regulatory implications]'}

ROOT CAUSE ANALYSIS

${rootCause}

IMMEDIATE ACTIONS TAKEN

1. Incident documented and compliance team notified
2. Affected client accounts flagged for review
3. ${remediation}

REMEDIATION PLAN

- Short-term: Contain the incident and prevent recurrence
- Medium-term: Implement process improvements and additional controls
- Long-term: Update compliance training and monitoring procedures

REGULATORY NOTIFICATION

Required: ${(ctx.notification_required as string) ?? '[notification required]'}
Deadline: ${(ctx.notification_deadline as string) ?? 'N/A'}

This report is confidential and intended for internal compliance review only.`;
}

function generateClientProgressReport(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const period = (ctx.period as string) ?? '[reporting period]';
  const fundingStatus = (ctx.funding_status as string) ?? '[funding status]';
  const scoreChange = (ctx.score_change as string) ?? '[score change]';
  const paymentPerformance = (ctx.payment_performance as string) ?? '[payment performance]';
  const nextSteps = (ctx.next_steps as string) ?? '[next steps]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `CLIENT PROGRESS REPORT

Date: ${date}
Client: ${clientName}
Period: ${period}
Advisor: ${advisorName}

FUNDING STATUS

Current Status: ${fundingStatus}
Total Credit Secured: ${ctx.total_credit ? '$' + Number(ctx.total_credit).toLocaleString() : '[amount]'}
Active Cards: ${(ctx.active_cards as string) ?? '[count]'}

CREDIT HEALTH

Credit Score Change: ${scoreChange}
Average Utilization: ${(ctx.avg_utilization as string) ?? '[X]'}%
Payment Performance: ${paymentPerformance}
Delinquencies: ${(ctx.delinquencies as string) ?? '[delinquencies]'}

MILESTONES ACHIEVED

- ${(ctx.milestones as string) ?? '[milestones]'}

RECOMMENDED NEXT STEPS

${nextSteps}

ADVISOR NOTES

${(ctx.advisor_notes as string) ?? '[advisor notes]'}`;
}

function generateFundingRoundSummary(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const roundNumber = (ctx.round_number as string) ?? '[#]';
  const roundId = (ctx.round_id as string) ?? '[ID]';
  const totalCredit = ctx.total_credit ? '$' + Number(ctx.total_credit).toLocaleString() : '[amount]';
  const targetCredit = ctx.target_credit ? '$' + Number(ctx.target_credit).toLocaleString() : '[target]';
  const programFee = ctx.program_fee ? '$' + Number(ctx.program_fee).toLocaleString() : '[fee]';
  const netCapital = ctx.net_capital ? '$' + Number(ctx.net_capital).toLocaleString() : '[net]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let cardsSection = '[Cards listed here]';
  if (Array.isArray(ctx.cards)) {
    const cards = ctx.cards as Array<Record<string, unknown>>;
    cardsSection = cards.map(c =>
      `- ${c.name ?? 'Card'} (${c.issuer ?? 'Issuer'}): Approved $${Number(c.approved_amount ?? 0).toLocaleString()}`
    ).join('\n');
  }

  return `FUNDING ROUND SUMMARY

Date: ${date}
Client: ${clientName}
Round: ${roundNumber} (${roundId})

RESULTS OVERVIEW

Total Credit Secured: ${totalCredit}
Original Target: ${targetCredit}
Achievement Rate: ${ctx.total_credit && ctx.target_credit ? Math.round((Number(ctx.total_credit) / Number(ctx.target_credit)) * 100) : '[X]'}%

CARDS OBTAINED

${cardsSection}

FINANCIAL SUMMARY

Total Credit Lines: ${totalCredit}
Program Fee: ${programFee}
Net Usable Capital: ${netCapital}

APPLICATIONS SUMMARY

Total Applications Submitted: ${(ctx.apps_submitted as string) ?? '[count]'}
Approved: ${(ctx.apps_approved as string) ?? '[count]'}
Declined: ${(ctx.apps_declined as string) ?? '[count]'}
Pending: ${(ctx.apps_pending as string) ?? '[count]'}

NEXT STEPS

1. Set up autopay on all new accounts
2. Monitor introductory APR expiration dates
3. Maintain low utilization during the first 6 months
4. Schedule re-stack eligibility review in 6-12 months`;
}

function generateAdvisorCallSummary(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const callDate = (ctx.call_date as string) ?? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const callDuration = (ctx.call_duration_minutes as string) ?? '[X]';
  const callPurpose = (ctx.call_purpose as string) ?? '[Purpose]';

  const topicsDiscussed = Array.isArray(ctx.topics_discussed)
    ? (ctx.topics_discussed as string[]).map(t => `- ${t}`).join('\n')
    : '- [Topics discussed during the call]';

  const actionItems = Array.isArray(ctx.action_items)
    ? (ctx.action_items as string[]).map(a => `- [ ] ${a}`).join('\n')
    : '- [ ] [Action items from the call]';

  return `ADVISOR CALL SUMMARY

Date: ${callDate}
Duration: ${callDuration} minutes
Client: ${clientName}
Advisor: ${advisorName}
Call Type: ${(ctx.call_type as string) ?? '[call type]'}

PURPOSE

${callPurpose}

TOPICS DISCUSSED

${topicsDiscussed}

KEY DECISIONS

${(ctx.key_decisions as string) ?? '[key decisions]'}

ACTION ITEMS

${actionItems}

FOLLOW-UP

Next Scheduled Call: ${(ctx.next_call_date as string) ?? '[next call date]'}
Priority Items: ${(ctx.priority_items as string) ?? '[priority items]'}

COMPLIANCE NOTE

This call summary was generated from VoiceForge call recording and may require advisor review for accuracy.`;
}

// A past-due notice. `Late Fee Applied` fell back to '$0.00' while every other
// field in this function fell back to a bracket — so "no late fee was stated"
// and "the late fee is zero" produced the same line, in a document telling
// somebody what they owe. A bracket is not a claim about money; $0.00 is.
function generateCollectionNotice(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const amountDue = ctx.amount_due ? '$' + Number(ctx.amount_due).toLocaleString() : '[amount]';
  const dueDate = (ctx.due_date as string) ?? '[date]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const invoiceNumber = (ctx.invoice_number as string) ?? '[INV-XXXX]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `PAST DUE NOTICE

Date: ${date}
To: ${clientName}
Invoice: ${invoiceNumber}

Dear ${clientName},

This notice is to inform you that payment for the following obligation is past due:

PAYMENT DETAILS

Amount Due: ${amountDue}
Original Due Date: ${dueDate}
Days Past Due: ${(ctx.days_past_due as string) ?? '[X]'}
Late Fee Applied: ${ctx.late_fee === undefined || ctx.late_fee === null ? '[late fee]' : '$' + Number(ctx.late_fee).toLocaleString()}

PAYMENT OPTIONS

Payment may be made via any of the following methods:
- ACH Transfer
- Wire Transfer
- Certified Check
- Online Portal Payment

IMPORTANT

Failure to remit payment within 15 days of this notice may result in:
- Additional late fees
- Suspension of advisory services
- Referral to collections

If you are experiencing financial difficulty, please contact ${advisorName} immediately to discuss payment arrangement options.

If payment has already been sent, please disregard this notice and accept our thanks.

Sincerely,
CapitalForge Accounts Receivable`;
}

/**
 * One recorded consent, as the letter states it.
 *
 * Injected by the route from `ConsentService.getConsentStatuses`, not taken
 * from the caller's context. This letter is the client's copy of what the
 * system holds about their consent; assembling it from a request body means
 * confirming to a client whatever the caller typed.
 */
export interface ConsentLetterRecord {
  channel: string;
  consentType: string;
  status: string;
  grantedAt: string;
  evidenceRef: string | null;
}

function generateConsentConfirmationLetter(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Four defaults used to live here, and the letter is a client's copy of a
  // consent record:
  //
  //   consent_date      ?? new Date()   — today, asserted as the date consent
  //                                       was given
  //   channels          ?? 'Voice, SMS, Email'
  //                                     — consent to all three channels,
  //                                       asserted when none were supplied
  //   consent_method    ?? 'Electronic signature via client portal'
  //   consent_reference ?? 'CST-' + Date.now()
  //                                     — an invented evidence pointer
  //
  // The reference is the worst of the four. `evidenceRef` is the field that
  // carries proof a consent happened; generating one from a timestamp gives a
  // client a reference number that resolves to nothing.
  const consents = ctx.consents as ConsentLetterRecord[] | undefined;
  if (!Array.isArray(consents)) {
    throw new DocumentContextRequiredError(
      'consent_confirmation_letter',
      'no consent records were supplied. This letter is the copy given to the client of '
      + 'what the '
      + 'system holds — the channels, the dates and the evidence reference — so it is read '
      + 'from the consent record rather than from the request. Send business_id and the '
      + 'route will read it.',
    );
  }
  if (consents.length === 0) {
    throw new DocumentContextRequiredError(
      'consent_confirmation_letter',
      'no consent is recorded for this client, so there is nothing to confirm. A letter '
      + 'confirming a consent that was never captured is the document this endpoint exists '
      + 'not to produce.',
    );
  }

  const rows = consents
    .map(
      (c) =>
        `- ${c.channel} (${c.consentType}): ${c.status}, recorded ${c.grantedAt}\n`
        + `  Evidence reference: ${c.evidenceRef ?? '[not recorded]'}`,
    )
    .join('\n');

  return `CONSENT CONFIRMATION LETTER

Date: ${date}
To: ${clientName}

Dear ${clientName},

This letter confirms the communication consent recorded in our system for your account.

CONSENT DETAILS

${rows}

Consent Method: [not recorded]

CapitalForge records the channel, the date, the IP address and an evidence
reference for each consent. It does not record the METHOD by which consent was
given, so this letter cannot state one. If you need the method confirmed,
contact CapitalForge Compliance and quote the evidence reference above.

SCOPE OF CONSENT

By providing consent, you have agreed to receive communications from CapitalForge and authorized advisors through the channels listed above for the following purposes:
- Program updates and status notifications
- Payment reminders and billing communications
- Compliance and regulatory notices
- Marketing and re-stack opportunity alerts (if applicable)

YOUR RIGHTS

- You may revoke consent at any time by contacting your advisor or visiting the client portal
- Revocation of consent does not affect the lawfulness of processing prior to revocation
- Certain regulatory and compliance communications may continue regardless of consent status
- You may update your channel preferences at any time

If you did not authorize this consent or believe it was recorded in error, please contact CapitalForge Compliance immediately.

Sincerely,
CapitalForge Compliance Department`;
}

function generateAdverseActionResponse(ctx: Record<string, unknown>): string {
  const clientName = (ctx.client_name as string) ?? '[Client]';
  const issuer = (ctx.issuer as string) ?? '[Issuer]';
  const cardName = (ctx.card_name as string) ?? '[Card]';
  const noticeDate = (ctx.notice_date as string) ?? '[date]';
  const declineReasons = (ctx.decline_reasons as string) ?? '[decline reasons]';
  const advisorName = (ctx.advisor_name as string) ?? '[Advisor]';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `ADVERSE ACTION RESPONSE

Date: ${date}

To: ${issuer} Credit Review Department
Re: Adverse Action Notice dated ${noticeDate}
Application: ${cardName}
Applicant: ${clientName}

Dear Credit Review Team,

We acknowledge receipt of the adverse action notice dated ${noticeDate} regarding the application for ${cardName} with ${issuer} on behalf of ${clientName}.

STATED REASONS FOR ADVERSE ACTION

${declineReasons}

RESPONSE AND ADDITIONAL CONTEXT

We wish to address each stated reason and provide supporting documentation for your reconsideration:

1. Credit History: ${clientName} maintains a strong payment history across all existing obligations with no delinquencies in the past 24 months.

2. Inquiries: Recent credit inquiries reflect a planned business credit building initiative managed by a licensed financial advisor and do not represent distressed credit-seeking behavior.

3. Business Viability: The business generates consistent revenue and has maintained profitable operations, demonstrating capacity to service additional credit.

SUPPORTING DOCUMENTATION

The following documents are available upon request:
- Business bank statements (last 6 months)
- Business tax returns (most recent filing)
- Personal financial statement
- Business plan and revenue projections

REQUEST

We respectfully request that ${issuer} reconsider this application in light of the additional context and supporting documentation provided. We are confident that a thorough review will demonstrate the applicant's creditworthiness.

Please contact us at your earliest convenience to discuss.

Sincerely,
${advisorName}
CapitalForge`;
}

// ── The fees this letter names are the fees that exist ───────
//
// It listed three under ADDITIONAL FEES, each at $0:
//
//     Expedited Processing Fee: $0 (included in program fee)
//     Document Preparation Fee: $0 (included in program fee)
//     Restack Analysis Fee: $0 for first restack, standard rates apply
//
// Those three names appeared nowhere else in this codebase and nowhere in
// Burkham Wickmont's. They were not the placement schedule either — that is per
// product and flat per placement: $500 business credit card, $5,000 equipment
// finance, $7,500 line of credit, $10,000 term loan, $20,000 SBA, $7,500 invoice
// factoring, in packages/billing/src/successFeeSeed.ts, where `successFeeFor`
// refuses a fee the Compliance Review Board has not approved.
//
// Founder decision, 2026-09-01: they do not exist. The firm charges flat success
// fees per placement and nothing else. An expedited processing fee, a document
// preparation fee and a restack analysis fee were never decided, and a letter
// template is not where a fee gets introduced.
//
// So the section is gone rather than priced. The letter generates again, and
// everything left in it — the flat program fee, the percentage-of-funding fee,
// the funding estimate — comes from the caller and falls back to a bracket.
//
// The rule this leaves behind: a disclosure names the fees that exist. Adding a
// line here means adding a fee somewhere first.

// ── Template dispatcher ──────────────────────────────────────

const GENERATORS: Record<GeneratedDocumentType, (ctx: Record<string, unknown>) => string> = {
  decline_reconsideration_letter: generateDeclineReconsiderationLetter,
  business_purpose_statement: generateBusinessPurposeStatement,
  application_cover_letter: generateApplicationCoverLetter,
  product_reality_acknowledgment: generateProductRealityAcknowledgment,
  hardship_workout_proposal: generateHardshipWorkoutProposal,
  fee_disclosure_letter: generateFeeDisclosureLetter,
  welcome_package: generateWelcomePackage,
  apr_expiry_warning_letter: generateAprExpiryWarningLetter,
  restack_opportunity_summary: generateRestackOpportunitySummary,
  compliance_incident_report: generateComplianceIncidentReport,
  client_progress_report: generateClientProgressReport,
  funding_round_summary: generateFundingRoundSummary,
  advisor_call_summary: generateAdvisorCallSummary,
  collection_notice: generateCollectionNotice,
  consent_confirmation_letter: generateConsentConfirmationLetter,
  adverse_action_response: generateAdverseActionResponse,
};

// ── POST /api/documents/generate ─────────────────────────────
// Generate a mock document based on type and context values.

documentGenRouter.post(
  '/documents/generate',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        422,
        'VALIDATION_ERROR',
        `Invalid request body. document_type must be one of: ${DOCUMENT_TYPES.join(', ')}`,
        parsed.error.flatten().fieldErrors,
      );
      return;
    }

    try {
      const { document_type, context: ctx } = parsed.data;
      const context = { ...ctx } as Record<string, unknown>;

      // ── Figures this route reads rather than accepts ─────────
      //
      // The generators are pure and take a context blob. That is fine for a
      // client's name and wrong for a verdict: this document tells a client
      // whether they qualify for another funding round, and a caller who can
      // type `eligible: true` into a request body can hand a client a letter
      // saying they qualify when the engine said otherwise.
      //
      // So for this one document the route asks restack-trigger, with the
      // caller's own tenant, and overwrites anything the caller sent under the
      // same key. `business_id` is required — without it there is nobody to
      // ask about, and the generator refuses.
      if (document_type === 'restack_opportunity_summary') {
        const businessId = typeof context.business_id === 'string' ? context.business_id : null;
        if (!businessId) {
          sendError(
            res,
            422,
            'BUSINESS_ID_REQUIRED',
            'restack_opportunity_summary states whether a client is eligible for another '
            + 'round, and that verdict is read from the re-stack engine rather than taken '
            + 'from the request. Supply context.business_id.',
          );
          return;
        }
        let verdict;
        try {
          verdict = await checkRestackEligibility(businessId, tenantId);
        } catch (err) {
          if (err instanceof RestackBusinessNotFoundError) {
            sendError(
              res,
              404,
              'BUSINESS_NOT_FOUND',
              'No such business in this tenant, so no re-stack review exists to summarise.',
            );
            return;
          }
          throw err;
        }
        context.eligibility = {
          eligible: verdict.eligible,
          reasons: verdict.reasons,
          readinessScore: verdict.readinessScore,
        };
        context.client_name = context.client_name ?? verdict.businessName;
      }

      if (document_type === 'consent_confirmation_letter') {
        const businessId = typeof context.business_id === 'string' ? context.business_id : null;
        if (!businessId) {
          sendError(
            res,
            422,
            'BUSINESS_ID_REQUIRED',
            'consent_confirmation_letter is the copy given to the client of the consent this '
            + 'system '
            + 'holds, so the channels, dates and evidence references are read from the '
            + 'consent record. Supply context.business_id.',
          );
          return;
        }
        const statuses = await getConsentService().getConsentStatuses(tenantId, businessId);
        context.consents = statuses.map((c) => ({
          channel: c.channel,
          consentType: c.consentType,
          status: c.status,
          grantedAt: c.grantedAt.toISOString().slice(0, 10),
          evidenceRef: c.evidenceRef,
        }));
      }

      const generator = GENERATORS[document_type];
      const text = generator(context);

      const result = {
        id: `doc_gen_${Date.now()}`,
        document_type,
        generatedAt: new Date().toISOString(),
        tenantId,
        text,
        wordCount: text.split(/\s+/).length,
        // What the document was actually built from, including the figures
        // this route read rather than accepted.
        context,
      };

      logger.info('[DocumentGenRoutes] Document generated', {
        documentType: document_type,
        docId: result.id,
        tenantId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'POST /documents/generate');
    }
  },
);

export default documentGenRouter;

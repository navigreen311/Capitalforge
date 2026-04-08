// ============================================================
// CapitalForge — Document Generation Routes
//
// Endpoints:
//   POST /api/documents/generate — generate mock document text
//     Supported document_type values:
//       - decline_reconsideration_letter
//       - business_purpose_statement
//       - application_cover_letter
//
// All routes require a valid tenant JWT via tenantMiddleware.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const documentGenRouter = Router();

documentGenRouter.use(tenantMiddleware);

// ── Supported Document Types ─────────────────────────────────

const DOCUMENT_TYPES = [
  'decline_reconsideration_letter',
  'business_purpose_statement',
  'application_cover_letter',
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
  if (err instanceof ZodError) {
    sendError(res, 422, 'VALIDATION_ERROR', 'Invalid request body.', err.flatten().fieldErrors);
    return;
  }
  logger.error(`[DocumentGenRoutes] Unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

// ── Template Generators ──────────────────────────────────────

function generateDeclineReconsiderationLetter(ctx: Record<string, unknown>): string {
  const businessName = (ctx.business_name as string) ?? 'Acme Holdings LLC';
  const issuer = (ctx.issuer as string) ?? 'Chase';
  const cardName = (ctx.card_name as string) ?? 'Ink Business Unlimited';
  const declineReason = (ctx.decline_reason as string) ?? 'too many recent inquiries';
  const applicantName = (ctx.applicant_name as string) ?? 'John Smith';
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
  const businessName = (ctx.business_name as string) ?? 'Acme Holdings LLC';
  const industry = (ctx.industry as string) ?? 'Professional Services';
  const creditAmount = (ctx.credit_amount as string) ?? '$150,000';
  const purpose = (ctx.purpose as string) ?? 'working capital and operational expenses';
  const revenue = (ctx.annual_revenue as string) ?? '$500,000';

  return `BUSINESS PURPOSE STATEMENT

Business Name: ${businessName}
Industry: ${industry}
Annual Revenue: ${revenue}

PURPOSE OF CREDIT FACILITY

${businessName} is seeking a total credit facility of ${creditAmount} for the purpose of ${purpose}.

INTENDED USE OF FUNDS

The requested credit will be allocated as follows:
- Inventory and supply chain management (40%)
- Marketing and client acquisition (25%)
- Equipment and technology upgrades (20%)
- Working capital reserve (15%)

REPAYMENT STRATEGY

${businessName} generates sufficient monthly cash flow to service all credit obligations within the 0% APR introductory periods. Our repayment strategy includes:
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
  const businessName = (ctx.business_name as string) ?? 'Acme Holdings LLC';
  const issuer = (ctx.issuer as string) ?? 'Chase';
  const cardName = (ctx.card_name as string) ?? 'Ink Business Preferred';
  const applicantName = (ctx.applicant_name as string) ?? 'John Smith';
  const applicantTitle = (ctx.applicant_title as string) ?? 'Managing Member';
  const yearsInBusiness = (ctx.years_in_business as string) ?? '3';
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

// ── Template dispatcher ──────────────────────────────────────

const GENERATORS: Record<GeneratedDocumentType, (ctx: Record<string, unknown>) => string> = {
  decline_reconsideration_letter: generateDeclineReconsiderationLetter,
  business_purpose_statement: generateBusinessPurposeStatement,
  application_cover_letter: generateApplicationCoverLetter,
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
      const generator = GENERATORS[document_type];
      const text = generator(ctx as Record<string, unknown>);

      const result = {
        id: `doc_gen_${Date.now()}`,
        document_type,
        generatedAt: new Date().toISOString(),
        tenantId,
        text,
        wordCount: text.split(/\s+/).length,
        context: ctx,
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

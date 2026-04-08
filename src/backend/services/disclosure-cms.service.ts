// ============================================================
// CapitalForge — Disclosure & Template CMS Service
//
// Core responsibilities:
//   1. State-specific disclosure template library (50 states + federal)
//   2. Version history with effective dates
//   3. Compliance team approval workflow before activation
//   4. Auto-population from client profile and deal data
//   5. Template rendering with variable substitution
//
// Disclosure categories:
//   - funding_agreement     — General funding/advisory service disclosure
//   - credit_stacking       — Multi-card stacking program disclosure
//   - fee_schedule          — Complete fee schedule disclosure
//   - risk_acknowledgment   — Risk & suitability acknowledgment
//   - personal_guarantee    — Personal guarantee disclosure
//   - arbitration_notice    — Pre-dispute arbitration notice
//   - state_specific        — State-mandated specific disclosures
//   - federal               — Federal regulatory disclosures (Reg B, TILA, FTC)
//
// Approval workflow states:
//   draft → pending_review → approved | rejected
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Types & interfaces ────────────────────────────────────────────

export type DisclosureCategory =
  | 'funding_agreement'
  | 'credit_stacking'
  | 'fee_schedule'
  | 'risk_acknowledgment'
  | 'personal_guarantee'
  | 'arbitration_notice'
  | 'state_specific'
  | 'federal'
  | 'cu_membership';

export type TemplateStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'superseded';

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface DisclosureTemplateRecord {
  id: string;
  tenantId: string;
  state: string;
  category: DisclosureCategory;
  name: string;
  content: string;
  version: string;
  effectiveDate: Date;
  isActive: boolean;
  status: TemplateStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  variables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  tenantId: string;
  state: string;
  category: DisclosureCategory;
  name: string;
  content: string;
  effectiveDate: Date;
  variables?: TemplateVariable[];
}

export interface UpdateTemplateInput {
  name?: string;
  content?: string;
  effectiveDate?: Date;
  variables?: TemplateVariable[];
}

export interface ApproveTemplateInput {
  approverId: string;
  notes?: string;
}

export interface RenderContext {
  /** Business / client profile fields */
  businessName?: string;
  businessLegalName?: string;
  businessEin?: string;
  businessState?: string;
  businessCity?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerAddress?: string;
  /** Deal / funding fields */
  fundingAmount?: string | number;
  programFee?: string | number;
  programFeePercent?: string | number;
  introApr?: string | number;
  introAprExpiry?: string;
  regularApr?: string | number;
  annualFee?: string | number;
  totalCost?: string | number;
  effectiveApr?: string | number;
  /** Dates */
  disclosureDate?: string;
  effectiveDate?: string;
  expirationDate?: string;
  /** Advisor / advisor firm */
  advisorName?: string;
  advisorEmail?: string;
  firmName?: string;
  /** Issuer / card */
  issuerName?: string;
  cardProduct?: string;
  /** Credit union membership */
  membershipRequirement?: string;
  membershipFee?: string | number;
  /** Catch-all for custom variables */
  [key: string]: string | number | undefined;
}

export interface RenderedDisclosure {
  templateId: string;
  templateVersion: string;
  state: string;
  category: DisclosureCategory;
  renderedContent: string;
  missingVariables: string[];
  renderedAt: Date;
}

// ── Default variable definitions per category ─────────────────────

const CATEGORY_VARIABLES: Record<DisclosureCategory, TemplateVariable[]> = {
  funding_agreement: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'businessEin', description: 'EIN / Tax ID', required: true },
    { name: 'ownerFirstName', description: 'Primary owner first name', required: true },
    { name: 'ownerLastName', description: 'Primary owner last name', required: true },
    { name: 'fundingAmount', description: 'Total funding amount', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
    { name: 'firmName', description: 'Advisory firm name', required: false },
  ],
  credit_stacking: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'fundingAmount', description: 'Target credit amount', required: true },
    { name: 'introApr', description: 'Intro APR', required: true },
    { name: 'introAprExpiry', description: 'Intro APR expiry date', required: true },
    { name: 'regularApr', description: 'Regular APR after intro period', required: true },
    { name: 'programFee', description: 'Program fee amount', required: true },
    { name: 'programFeePercent', description: 'Program fee as % of funding', required: false },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  fee_schedule: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'programFee', description: 'Program fee', required: true },
    { name: 'annualFee', description: 'Annual card fee', required: false },
    { name: 'totalCost', description: 'Total estimated cost', required: true },
    { name: 'effectiveApr', description: 'Effective APR', required: false },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  risk_acknowledgment: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'ownerFirstName', description: 'Owner first name', required: true },
    { name: 'ownerLastName', description: 'Owner last name', required: true },
    { name: 'fundingAmount', description: 'Proposed funding amount', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  personal_guarantee: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'ownerFirstName', description: 'Guarantor first name', required: true },
    { name: 'ownerLastName', description: 'Guarantor last name', required: true },
    { name: 'ownerAddress', description: 'Guarantor address', required: true },
    { name: 'issuerName', description: 'Card issuer name', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  arbitration_notice: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
    { name: 'firmName', description: 'Advisory firm name', required: true },
  ],
  state_specific: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'businessState', description: 'State of business operations', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
  federal: [
    { name: 'businessLegalName', description: 'Legal business name', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
    { name: 'firmName', description: 'Advisory firm name', required: true },
  ],
  cu_membership: [
    { name: 'cardProduct', description: 'Credit union card product name', required: true },
    { name: 'issuerName', description: 'Credit union name', required: true },
    { name: 'businessLegalName', description: 'Client business legal name', required: true },
    { name: 'membershipRequirement', description: 'Membership eligibility requirement description', required: true },
    { name: 'membershipFee', description: 'Membership fee amount', required: true },
    { name: 'disclosureDate', description: 'Date of disclosure', required: true },
  ],
};

// ── Seed templates for federal and common states ──────────────────

export const SEED_TEMPLATES: Omit<CreateTemplateInput, 'tenantId'>[] = [
  {
    state: 'FEDERAL',
    category: 'credit_stacking',
    name: 'Federal Credit Stacking Program Disclosure',
    content: `BUSINESS CREDIT CARD STACKING PROGRAM DISCLOSURE

Date: {{disclosureDate}}
Business: {{businessLegalName}}

NOTICE TO BUSINESS CREDIT CARD STACKING PROGRAM PARTICIPANTS

This disclosure is provided pursuant to the Federal Trade Commission Act and applicable federal consumer protection regulations.

PROGRAM DESCRIPTION
{{firmName}} provides advisory services to assist businesses in applying for multiple business credit cards during a single funding round to maximize available credit. This program is not a loan and does not guarantee approval from any card issuer.

TOTAL TARGET FUNDING: {{fundingAmount}}
PROGRAM FEE: {{programFee}} ({{programFeePercent}}% of funded credit)
INTRODUCTORY APR: {{introApr}}% (expires {{introAprExpiry}})
REGULAR APR AFTER INTRO PERIOD: {{regularApr}}%

MATERIAL RISKS
1. Credit impact: Multiple hard inquiries will appear on personal and business credit reports.
2. Approval not guaranteed: Issuers may decline applications at their sole discretion.
3. Interest rate risk: Introductory APR periods expire. Failure to repay balances before expiration will result in interest charges at the regular APR of {{regularApr}}%.
4. Personal liability: Business credit cards may require personal guarantees.
5. No government affiliation: This program is not affiliated with the SBA, FTC, CFPB, or any government agency.

FEES
All program fees are disclosed in the accompanying Fee Schedule. Fees are earned upon successful funding.

I acknowledge receipt of this disclosure.
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.credit_stacking,
  },
  {
    state: 'FEDERAL',
    category: 'fee_schedule',
    name: 'Federal Fee Schedule Disclosure',
    content: `COMPLETE FEE SCHEDULE DISCLOSURE

Date: {{disclosureDate}}
Client Business: {{businessLegalName}}

PROGRAM FEES
Advisory Program Fee: \${{programFee}}
Annual Card Fees (estimated): \${{annualFee}}
Total Estimated Cost: \${{totalCost}}
Effective APR (first year, if balances maintained): {{effectiveApr}}%

NO HIDDEN FEES: The above schedule represents all fees payable in connection with this program. No additional fees will be charged without your prior written consent.

REFUND POLICY: Program fees are earned as services are delivered. If the program is cancelled prior to funding, a prorated refund will be provided based on services delivered.

RIGHT TO CANCEL: You have the right to cancel this agreement within 3 business days of signing without penalty.
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.fee_schedule,
  },
  {
    state: 'CA',
    category: 'state_specific',
    name: 'California SB 1235 Commercial Financing Disclosure',
    content: `CALIFORNIA COMMERCIAL FINANCING DISCLOSURE
(Required under California SB 1235 / Cal. Fin. Code §22800 et seq.)

Date: {{disclosureDate}}
Recipient Business: {{businessLegalName}}
State of Operations: {{businessState}}

FINANCING AMOUNT: \${{fundingAmount}}
TOTAL COST OF FINANCING (estimated): \${{totalCost}}
ANNUAL PERCENTAGE RATE (APR): {{effectiveApr}}%

This disclosure is provided pursuant to California SB 1235, which requires certain disclosures to commercial financing recipients. This program involves business credit cards and is an advisory service, not a direct loan.

Financing Costs include program fees, annual card fees, and estimated interest if balances are not paid during the introductory APR period.

By signing this disclosure, you acknowledge receipt and understand the above terms.
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.state_specific,
  },
  {
    state: 'NY',
    category: 'state_specific',
    name: 'New York Commercial Finance Disclosure (S5470)',
    content: `NEW YORK COMMERCIAL FINANCE DISCLOSURE
(Required under N.Y. Financial Services Law §801 et seq.)

Date: {{disclosureDate}}
Recipient Business: {{businessLegalName}}

AMOUNT OF FUNDS PROVIDED: \${{fundingAmount}}
TOTAL DOLLAR COST: \${{totalCost}}
ANNUAL PERCENTAGE RATE: {{effectiveApr}}%
PAYMENT TERMS: As described in your business credit card cardholder agreement(s).

This disclosure is provided in compliance with New York's commercial financing disclosure requirements. The above figures are estimates based on program fee structure and projected credit utilization.

Prepayment: Business credit cards may be repaid at any time without penalty. Early repayment will reduce total cost of financing.
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.state_specific,
  },
  {
    state: 'TX',
    category: 'state_specific',
    name: 'Texas Commercial Loan Disclosure',
    content: `TEXAS COMMERCIAL FINANCING NOTICE

Date: {{disclosureDate}}
Recipient: {{businessLegalName}}

This advisory program assists Texas businesses in obtaining business credit cards. This is not a loan. The following estimated costs apply:

Program Advisory Fee: \${{programFee}}
Target Funding: \${{fundingAmount}}
Introductory APR: {{introApr}}% through {{introAprExpiry}}
Standard APR After Intro Period: {{regularApr}}%

Texas consumers have the right to file complaints with the Texas Office of Consumer Credit Commissioner.
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.state_specific,
  },
  {
    state: 'FEDERAL',
    category: 'cu_membership',
    name: 'Credit Union Membership Disclosure',
    content: `CREDIT UNION MEMBERSHIP DISCLOSURE

Date: {{disclosureDate}}
Client Business: {{businessLegalName}}
Credit Union: {{issuerName}}
Card Product: {{cardProduct}}

MEMBERSHIP REQUIREMENT NOTICE

This disclosure is provided to inform you that the business credit card product you are applying for — {{cardProduct}} — is issued by {{issuerName}}, a federally or state-chartered credit union.

MEMBERSHIP IS REQUIRED: Credit unions are member-owned financial cooperatives. Before your application for {{cardProduct}} can be processed, you must establish membership with {{issuerName}}. Membership is a SEPARATE account and relationship from the business credit card.

MEMBERSHIP ELIGIBILITY: {{membershipRequirement}}

MEMBERSHIP FEE: \${{membershipFee}}

IMPORTANT DISCLOSURES:
1. Membership in {{issuerName}} is a prerequisite for any credit product. You cannot apply for {{cardProduct}} without first becoming a member.
2. The membership account (typically a savings account with a small minimum balance) is separate from and in addition to the business credit card account.
3. Membership fees and minimum balance requirements are set by {{issuerName}} and are not controlled by or refundable through {{businessLegalName}}'s advisory service.
4. Approval for membership does not guarantee approval for the credit card product. Credit decisions are made independently by {{issuerName}} based on their underwriting criteria.
5. If your credit card application is declined, your membership with {{issuerName}} remains active and any membership fees or deposits are subject to the credit union's own policies.
6. Credit union deposits are insured by the National Credit Union Administration (NCUA) up to $250,000 per depositor, per institution.

By signing below, I acknowledge that:
- I have been informed that membership in {{issuerName}} is required before applying for {{cardProduct}}.
- I understand that membership is a separate account/relationship from the business credit card.
- I understand the membership eligibility requirements and associated fees.
- I consent to the establishment of a membership account with {{issuerName}}.

Signature: ___________________________  Date: __________
Name: {{businessLegalName}}
`,
    effectiveDate: new Date('2024-01-01'),
    variables: CATEGORY_VARIABLES.cu_membership,
  },
];

// ── Template version number utility ──────────────────────────────

function nextVersion(currentVersion: string): string {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length === 3) {
    parts[2]++;
    return parts.join('.');
  }
  if (parts.length === 2) {
    parts[1]++;
    return parts.join('.');
  }
  return `${(parseInt(currentVersion, 10) || 1) + 1}`;
}

// ── Variable substitution renderer ───────────────────────────────

function renderTemplate(content: string, context: RenderContext): { rendered: string; missing: string[] } {
  const missing: string[] = [];

  const rendered = content.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    const value = context[varName];
    if (value === undefined || value === null || value === '') {
      missing.push(varName);
      return match; // leave placeholder in output
    }
    return String(value);
  });

  return { rendered, missing };
}

// ── Service class ─────────────────────────────────────────────────

export class DisclosureCmsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Create template ──────────────────────────────────────────────

  async createTemplate(input: CreateTemplateInput): Promise<DisclosureTemplateRecord> {
    const { tenantId, state, category, name, content, effectiveDate, variables } = input;

    logger.info({ tenantId, state, category }, 'DisclosureCMS: creating template');

    const record = await this.prisma.disclosureTemplate.create({
      data: {
        tenantId,
        state: state.toUpperCase(),
        category,
        name,
        content,
        version: '1.0.0',
        effectiveDate,
        isActive: false, // templates start inactive until approved
        approvedBy: null,
        approvedAt: null,
      },
    });

    await eventBus.publish({
      id: uuidv4(),
      tenantId,
      eventType: 'DISCLOSURE_TEMPLATE_CREATED',
      aggregateType: 'disclosure_template',
      aggregateId: record.id,
      payload: { state: record.state, category, name, version: record.version },
      version: 1,
    });

    return this.mapRecord(record, variables ?? CATEGORY_VARIABLES[category] ?? []);
  }

  // ── Update template (creates new version) ───────────────────────

  async updateTemplate(
    tenantId: string,
    templateId: string,
    input: UpdateTemplateInput,
  ): Promise<DisclosureTemplateRecord> {
    const existing = await this.prisma.disclosureTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!existing) {
      throw new Error(`DisclosureTemplate ${templateId} not found`);
    }

    // Bump version
    const newVersion = nextVersion(existing.version);

    // Mark old version as superseded if it was active
    if (existing.isActive) {
      await this.prisma.disclosureTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });
    }

    const updated = await this.prisma.disclosureTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name ?? existing.name,
        content: input.content ?? existing.content,
        effectiveDate: input.effectiveDate ?? existing.effectiveDate,
        version: newVersion,
        isActive: false, // requires re-approval after update
        approvedBy: null,
        approvedAt: null,
      },
    });

    logger.info(
      { templateId, newVersion, tenantId },
      'DisclosureCMS: template updated, requires re-approval',
    );

    return this.mapRecord(updated, input.variables ?? CATEGORY_VARIABLES[existing.category as DisclosureCategory] ?? []);
  }

  // ── Submit for approval ──────────────────────────────────────────

  async submitForApproval(tenantId: string, templateId: string): Promise<DisclosureTemplateRecord> {
    const existing = await this.prisma.disclosureTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!existing) {
      throw new Error(`DisclosureTemplate ${templateId} not found`);
    }

    // For now status is tracked via approvedBy/approvedAt nullability
    // Log event to signal pending review
    await eventBus.publish({
      id: uuidv4(),
      tenantId,
      eventType: 'DISCLOSURE_TEMPLATE_SUBMITTED_FOR_APPROVAL',
      aggregateType: 'disclosure_template',
      aggregateId: templateId,
      payload: { state: existing.state, category: existing.category, version: existing.version },
      version: 1,
    });

    logger.info({ templateId, tenantId }, 'DisclosureCMS: template submitted for approval');

    return this.mapRecord(existing, CATEGORY_VARIABLES[existing.category as DisclosureCategory] ?? []);
  }

  // ── Approve template ─────────────────────────────────────────────

  async approveTemplate(
    tenantId: string,
    templateId: string,
    input: ApproveTemplateInput,
  ): Promise<DisclosureTemplateRecord> {
    const existing = await this.prisma.disclosureTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!existing) {
      throw new Error(`DisclosureTemplate ${templateId} not found`);
    }

    // Deactivate any currently active templates for the same state/category
    await this.prisma.disclosureTemplate.updateMany({
      where: {
        tenantId,
        state: existing.state,
        category: existing.category,
        isActive: true,
        id: { not: templateId },
      },
      data: { isActive: false },
    });

    const approved = await this.prisma.disclosureTemplate.update({
      where: { id: templateId },
      data: {
        isActive: true,
        approvedBy: input.approverId,
        approvedAt: new Date(),
      },
    });

    await eventBus.publish({
      id: uuidv4(),
      tenantId,
      eventType: 'DISCLOSURE_TEMPLATE_APPROVED',
      aggregateType: 'disclosure_template',
      aggregateId: templateId,
      payload: {
        state: approved.state,
        category: approved.category,
        version: approved.version,
        approvedBy: input.approverId,
        notes: input.notes ?? null,
      },
      version: 1,
    });

    logger.info(
      { templateId, approvedBy: input.approverId, tenantId },
      'DisclosureCMS: template approved and activated',
    );

    return this.mapRecord(approved, CATEGORY_VARIABLES[approved.category as DisclosureCategory] ?? []);
  }

  // ── List templates ────────────────────────────────────────────────

  async listTemplates(
    tenantId: string,
    options: {
      state?: string;
      category?: DisclosureCategory;
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<DisclosureTemplateRecord[]> {
    const { state, category, activeOnly = false, limit = 50, offset = 0 } = options;

    const records = await this.prisma.disclosureTemplate.findMany({
      where: {
        tenantId,
        ...(state ? { state: state.toUpperCase() } : {}),
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ state: 'asc' }, { category: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return records.map(r =>
      this.mapRecord(r, CATEGORY_VARIABLES[r.category as DisclosureCategory] ?? []),
    );
  }

  // ── Get a specific template ───────────────────────────────────────

  async getTemplate(tenantId: string, templateId: string): Promise<DisclosureTemplateRecord | null> {
    const record = await this.prisma.disclosureTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!record) return null;

    return this.mapRecord(record, CATEGORY_VARIABLES[record.category as DisclosureCategory] ?? []);
  }

  // ── Get version history for a state/category ─────────────────────

  async getVersionHistory(
    tenantId: string,
    state: string,
    category: DisclosureCategory,
  ): Promise<DisclosureTemplateRecord[]> {
    const records = await this.prisma.disclosureTemplate.findMany({
      where: { tenantId, state: state.toUpperCase(), category },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map(r =>
      this.mapRecord(r, CATEGORY_VARIABLES[r.category as DisclosureCategory] ?? []),
    );
  }

  // ── Render a disclosure for a specific client ─────────────────────

  async renderDisclosure(
    tenantId: string,
    templateId: string,
    context: RenderContext,
  ): Promise<RenderedDisclosure> {
    const record = await this.prisma.disclosureTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!record) {
      throw new Error(`DisclosureTemplate ${templateId} not found`);
    }

    if (!record.isActive) {
      throw new Error(
        `Template ${templateId} is not active. Only approved, active templates may be rendered.`,
      );
    }

    // Auto-inject disclosureDate if not provided
    const enrichedContext: RenderContext = {
      disclosureDate: new Date().toLocaleDateString('en-US'),
      ...context,
    };

    const { rendered, missing } = renderTemplate(record.content, enrichedContext);

    if (missing.length > 0) {
      logger.warn(
        { templateId, missing },
        'DisclosureCMS: rendered with missing variables',
      );
    }

    return {
      templateId: record.id,
      templateVersion: record.version,
      state: record.state,
      category: record.category as DisclosureCategory,
      renderedContent: rendered,
      missingVariables: missing,
      renderedAt: new Date(),
    };
  }

  // ── Render all required disclosures for a state ───────────────────

  async renderAllForState(
    tenantId: string,
    state: string,
    context: RenderContext,
    categories?: DisclosureCategory[],
  ): Promise<RenderedDisclosure[]> {
    const statesToFetch = ['FEDERAL', state.toUpperCase()];
    const categoriesToFetch = categories ?? [
      'credit_stacking',
      'fee_schedule',
      'risk_acknowledgment',
      'state_specific',
    ];

    const templates = await this.prisma.disclosureTemplate.findMany({
      where: {
        tenantId,
        state: { in: statesToFetch },
        category: { in: categoriesToFetch },
        isActive: true,
      },
    });

    const rendered: RenderedDisclosure[] = [];

    for (const template of templates) {
      const enrichedContext: RenderContext = {
        disclosureDate: new Date().toLocaleDateString('en-US'),
        ...context,
      };

      const { rendered: content, missing } = renderTemplate(template.content, enrichedContext);

      rendered.push({
        templateId: template.id,
        templateVersion: template.version,
        state: template.state,
        category: template.category as DisclosureCategory,
        renderedContent: content,
        missingVariables: missing,
        renderedAt: new Date(),
      });
    }

    return rendered;
  }

  // ── Seed default templates for a tenant ──────────────────────────

  async seedDefaultTemplates(tenantId: string, approverId?: string): Promise<number> {
    let seeded = 0;

    for (const template of SEED_TEMPLATES) {
      // Check if already exists
      const existing = await this.prisma.disclosureTemplate.findFirst({
        where: {
          tenantId,
          state: template.state.toUpperCase(),
          category: template.category,
        },
      });

      if (existing) continue;

      await this.prisma.disclosureTemplate.create({
        data: {
          tenantId,
          state: template.state.toUpperCase(),
          category: template.category,
          name: template.name,
          content: template.content,
          version: '1.0.0',
          effectiveDate: template.effectiveDate,
          isActive: approverId ? true : false,
          approvedBy: approverId ?? null,
          approvedAt: approverId ? new Date() : null,
        },
      });

      seeded++;
    }

    logger.info({ tenantId, seeded }, 'DisclosureCMS: seeded default templates');
    return seeded;
  }

  // ── Private mapper ────────────────────────────────────────────────

  private mapRecord(record: any, variables: TemplateVariable[]): DisclosureTemplateRecord {
    const isApproved = !!record.approvedAt;

    let status: TemplateStatus;
    if (record.isActive && isApproved) {
      status = 'approved';
    } else if (!record.isActive && isApproved) {
      status = 'superseded';
    } else {
      status = 'draft';
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      state: record.state,
      category: record.category as DisclosureCategory,
      name: record.name,
      content: record.content,
      version: record.version,
      effectiveDate: record.effectiveDate,
      isActive: record.isActive,
      status,
      approvedBy: record.approvedBy ?? null,
      approvedAt: record.approvedAt ?? null,
      variables,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

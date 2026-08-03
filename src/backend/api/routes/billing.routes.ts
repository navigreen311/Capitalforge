// ============================================================
// CapitalForge — Billing & Entitlements Routes
//
// POST /api/businesses/:id/invoices          — generate invoice
// GET  /api/businesses/:id/invoices          — list invoices for business
// GET  /api/invoices/:id                     — get single invoice
// POST /api/invoices/:id/pay                 — mark invoice paid
//
// GET  /api/tenants/:tenantId/plan           — get active plan + entitlements
// GET  /api/tenants/:tenantId/usage          — get current period usage snapshot
// POST /api/tenants/:tenantId/usage/record   — record a usage event
//
// Extended billing management:
// GET  /api/billing/invoices/:id/pdf         — invoice as text, not a PDF
// POST /api/billing/invoices/:id/void        — void an invoice
// POST /api/billing/invoices/:id/unpay       — revert invoice to unpaid
// POST /api/billing/commissions/:id/resolve  — resolve a commission dispute
// GET  /api/billing/revenue-trend            — 6 months from the invoices table
// ============================================================

import { Router } from 'express';
import type { Response } from 'express';
import type { Request } from '../../types/http.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  revenueOpsService,
  issueRefund,
  approveCommission,
  markCommissionPaid,
  clawBackCommission,
  CommissionTransitionError,
} from '../../services/revenue-ops.service.js';
import type {
  GenerateInvoiceInput,
  DealStructure,
  InvoiceType,
  InvoiceStatus,
  CommissionType,
  CommissionStatus,
} from '../../services/revenue-ops.service.js';
import {
  saasEntitlementsService,
} from '../../services/saas-entitlements.service.js';
import type {
  PlanName,
  ModuleKey,
} from '../../services/saas-entitlements.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';
import { Prisma } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const billingRouter = Router({ mergeParams: true });

billingRouter.use(tenantMiddleware);

// ── POST /api/businesses/:id/invoices ─────────────────────────────────────────

billingRouter.post(
  '/businesses/:id/invoices',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const raw = req.body as Partial<GenerateInvoiceInput>;

    if (!raw.dealStructure) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '"dealStructure" is required.' },
      };
      res.status(422).json(body);
      return;
    }

    const validStructures: DealStructure[] = [
      'card_stacking', 'credit_repair', 'consulting_only', 'white_label_reseller', 'enterprise_managed',
    ];
    if (!validStructures.includes(raw.dealStructure as DealStructure)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `"dealStructure" must be one of: ${validStructures.join(', ')}.`,
        },
      };
      res.status(422).json(body);
      return;
    }

    if (
      raw.totalApprovedCredit !== undefined &&
      (typeof raw.totalApprovedCredit !== 'number' || raw.totalApprovedCredit < 0)
    ) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '"totalApprovedCredit" must be a non-negative number.' },
      };
      res.status(422).json(body);
      return;
    }

    try {
      const invoice = revenueOpsService.generateInvoice({
        tenantId,
        businessId,
        dealStructure: raw.dealStructure as DealStructure,
        totalApprovedCredit: raw.totalApprovedCredit ?? 0,
        customSchedule: raw.customSchedule,
        overageUnits: raw.overageUnits,
        dueDaysFromNow: raw.dueDaysFromNow,
      });

      // The service computes the invoice; the row is written here.
      //
      // revenue-ops keeps its results in a Map held by the process, so an
      // invoice generated through this API used to exist only until the
      // server restarted, and only for the worker that served the request —
      // while an invoices table sat unused. The computation is unchanged;
      // what changes is that the result survives.
      // The number comes from the table, not from the service's counter.
      //
      // nextInvoiceNumber() increments a module-level integer that starts at
      // zero on boot, which was harmless while invoices lived in a Map and
      // is a unique-constraint violation now that they are rows: after a
      // restart it reissues INV-…-000001.
      const issued = await sharedPrisma.invoice.count({ where: { tenantId } });
      const prefix = tenantId.slice(0, 4).toUpperCase();
      const year = new Date().getFullYear().toString().slice(2);
      const invoiceNumber = `INV-${prefix}${year}-${String(issued + 1).padStart(6, '0')}`;

      const saved = await sharedPrisma.invoice.create({
        data: {
          tenantId,
          businessId,
          invoiceNumber,
          type: invoice.type,
          amount: invoice.amount,
          feeBreakdown: { lineItems: invoice.lineItems } as unknown as Prisma.InputJsonValue,
          status: invoice.status,
          issuedAt: invoice.issuedAt,
          dueDate: invoice.dueDate,
        },
      });

      logger.info('Invoice generated via API', {
        invoiceId: saved.id,
        businessId,
        tenantId,
        amount: invoice.amount,
      });

      const body: ApiResponse<typeof invoice & { id: string }> = {
        success: true,
        data: { ...invoice, id: saved.id, invoiceNumber },
      };
      res.status(201).json(body);
    } catch (err) {
      logger.error('Invoice generation failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVOICE_ERROR', message: 'Failed to generate invoice.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/invoices ──────────────────────────────────────────

billingRouter.get(
  '/businesses/:id/invoices',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // From the invoices table. This read revenue-ops' in-memory Map, which
    // meant a restart emptied the list and two workers disagreed about it.
    const rows = await sharedPrisma.invoice.findMany({
      where: { tenantId, businessId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const invoices = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      businessId: r.businessId,
      invoiceNumber: r.invoiceNumber,
      type: r.type,
      amount: Number(r.amount),
      feeBreakdown: r.feeBreakdown ?? null,
      status: r.status,
      issuedAt: r.issuedAt?.toISOString() ?? null,
      dueDate: r.dueDate?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      stripePaymentId: r.stripePaymentId,
      createdAt: r.createdAt.toISOString(),
    }));

    const body: ApiResponse<typeof invoices> = {
      success: true,
      data: invoices,
      meta: { total: invoices.length },
    };
    res.status(200).json(body);
  },
);

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────

billingRouter.get(
  '/invoices/:id',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // From the table, scoped in the query. This read revenue-ops' in-memory
    // Map, so an invoice raised before the last restart came back 404 while
    // its row sat in the database.
    const row = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!row) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    const invoice = {
      id: row.id,
      tenantId: row.tenantId,
      businessId: row.businessId,
      invoiceNumber: row.invoiceNumber,
      type: row.type,
      amount: Number(row.amount),
      feeBreakdown: row.feeBreakdown ?? null,
      status: row.status,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      stripePaymentId: row.stripePaymentId,
      createdAt: row.createdAt.toISOString(),
    };

    const body: ApiResponse<typeof invoice> = { success: true, data: invoice };
    res.status(200).json(body);
  },
);

// ── GET /api/commissions ──────────────────────────────────────────────────────
//
// From commission_records. The table existed and nothing wrote to it: the
// commission functions in revenue-ops mutated a Map held by the process, so
// a commission "created" through this system was gone on restart and
// invisible to every other worker — and the billing page had to say
// commissions could not be shown at all.

billingRouter.get(
  '/commissions',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant context is required.' },
      };
      res.status(400).json(body);
      return;
    }

    const rows = await sharedPrisma.commissionRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const data = rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      partnerId: r.partnerId,
      advisorId: r.advisorId,
      amount: Number(r.amount),
      // Null where the commission was a flat amount rather than a rate.
      percentage: r.percentage === null ? null : Number(r.percentage),
      type: r.type,
      status: r.status,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    const body: ApiResponse<typeof data> = {
      success: true,
      data,
      meta: { total: data.length },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/commissions/:id/{approve,pay,clawback} ─────────
//
// The commission lifecycle.
//
// approveCommission, markCommissionPaid and clawBackCommission read a record
// out of commissionStore, mutated it and put it back, so an approval or a
// payment lived in one worker's memory until the process restarted while
// commission_records held whatever it had held before. No route called them,
// which is the only reason that did no harm.
//
// They are pure transitions now. These three read the row, ask the service
// what the next state is, and write it — the split the invoice and refund
// paths use.
//
// markCommissionPaid used to check nothing: it would pay a commission nobody
// had approved, and pay one already clawed back. The transitions are stated
// in the service and refused here with a 422.

type CommissionAction = 'approve' | 'pay' | 'clawback';

async function transitionCommission(
  req: Request,
  res: Response,
  action: CommissionAction,
): Promise<void> {
  const commissionId = req.params['id'];
  const tenantId = req.tenant?.tenantId;

  if (!commissionId || !tenantId) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Commission ID and tenant context are required.' },
    };
    res.status(400).json(body);
    return;
  }

  // Scoped in the query: a commission on another tenant answers the same way
  // one that does not exist does.
  const existing = await sharedPrisma.commissionRecord.findFirst({
    where: { id: commissionId, tenantId },
  });

  if (!existing) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: `Commission ${commissionId} not found.` },
    };
    res.status(404).json(body);
    return;
  }

  const record = {
    id: existing.id,
    tenantId: existing.tenantId,
    invoiceId: existing.invoiceId,
    partnerId: existing.partnerId,
    advisorId: existing.advisorId,
    amount: Number(existing.amount),
    percentage: existing.percentage === null ? null : Number(existing.percentage),
    type: existing.type as CommissionType,
    status: existing.status as CommissionStatus,
    paidAt: existing.paidAt,
    createdAt: existing.createdAt,
  };

  let next;
  try {
    next =
      action === 'approve'
        ? approveCommission(record)
        : action === 'pay'
          ? markCommissionPaid(record)
          : clawBackCommission(record);
  } catch (err) {
    if (err instanceof CommissionTransitionError) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_TRANSITION', message: err.message },
      };
      res.status(422).json(body);
      return;
    }
    throw err;
  }

  const [updated] = await sharedPrisma.$transaction([
    sharedPrisma.commissionRecord.update({
      where: { id: commissionId },
      data: { status: next.status, paidAt: next.paidAt },
    }),
    // The record carries a status and a paid date, and nothing else. Who moved
    // it and when goes where the other decisions about money go.
    sharedPrisma.auditLog.create({
      data: {
        tenantId,
        userId: req.tenant?.userId ?? null,
        action: `commission.${action}`,
        resource: 'commission_record',
        resourceId: commissionId,
        metadata: {
          from: record.status,
          to: next.status,
          amount: record.amount,
        },
      },
    }),
  ]);

  logger.info('Commission transitioned', {
    commissionId,
    tenantId,
    from: record.status,
    to: updated.status,
  });

  const body: ApiResponse<{
    commissionId: string;
    status: string;
    paidAt: string | null;
    amount: number;
    disbursed: boolean;
  }> = {
    success: true,
    data: {
      commissionId: updated.id,
      status: updated.status,
      paidAt: updated.paidAt?.toISOString() ?? null,
      amount: Number(updated.amount),
      // Marking a commission paid records that it was. Nothing here moves
      // money to a partner or an advisor.
      disbursed: false,
    },
  };
  res.status(200).json(body);
}

billingRouter.post('/commissions/:id/approve', async (req: Request, res: Response) => {
  await transitionCommission(req, res, 'approve');
});

billingRouter.post('/commissions/:id/pay', async (req: Request, res: Response) => {
  await transitionCommission(req, res, 'pay');
});

billingRouter.post('/commissions/:id/clawback', async (req: Request, res: Response) => {
  await transitionCommission(req, res, 'clawback');
});

// ── POST /api/invoices/:id/commissions ────────────────────────────────────────
//
// Computes the commission with revenue-ops — which validates that exactly
// one of amount or percentage-with-base is given, and that a partner or an
// advisor is named — and writes the row.

billingRouter.post(
  '/invoices/:id/commissions',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const invoiceId = req.params['id'];
    if (!tenantId || !invoiceId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Scoped: a commission cannot be attached to another tenant's invoice.
    const invoice = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, amount: true },
    });
    if (!invoice) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    const raw = req.body as {
      partnerId?: string;
      advisorId?: string;
      type?: string;
      amount?: number;
      percentage?: number;
    };

    try {
      const computed = revenueOpsService.createCommission({
        tenantId,
        invoiceId,
        partnerId: raw.partnerId,
        advisorId: raw.advisorId,
        type: (raw.type ?? 'partner_referral') as Parameters<
          typeof revenueOpsService.createCommission
        >[0]['type'],
        amount: raw.amount,
        percentage: raw.percentage,
        baseAmount: raw.percentage === undefined ? undefined : Number(invoice.amount),
      });

      const saved = await sharedPrisma.commissionRecord.create({
        data: {
          tenantId,
          invoiceId,
          partnerId: computed.partnerId,
          advisorId: computed.advisorId,
          amount: computed.amount,
          percentage: computed.percentage,
          type: computed.type,
          status: computed.status,
        },
      });

      const data = {
        id: saved.id,
        invoiceId: saved.invoiceId,
        amount: Number(saved.amount),
        percentage: saved.percentage === null ? null : Number(saved.percentage),
        type: saved.type,
        status: saved.status,
        createdAt: saved.createdAt.toISOString(),
      };

      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(201).json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the commission.';
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message },
      };
      res.status(422).json(body);
    }
  },
);

// ── POST /api/invoices/:id/pay ────────────────────────────────────────────────

billingRouter.post(
  '/invoices/:id/pay',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Scoped to the tenant in the query: an invoice belonging to another one
    // is reported the same way an invoice that does not exist is.
    const existing = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    if (existing.status === 'paid') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'PAYMENT_ERROR', message: 'Invoice is already paid.' },
      };
      res.status(422).json(body);
      return;
    }

    const { stripePaymentId } = req.body as { stripePaymentId?: string };

    // Marks the invoice paid. It does not take a payment: nothing here
    // charges a card or moves money, and stripePaymentId is a reference the
    // caller supplies, not one this system obtained.
    const paid = await sharedPrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paidAt: new Date(),
        stripePaymentId: stripePaymentId ?? null,
      },
    });

    logger.info('Invoice marked paid via API', {
      invoiceId,
      tenantId,
      amount: Number(paid.amount),
      stripePaymentId: paid.stripePaymentId,
    });

    const body: ApiResponse<{
      id: string;
      status: string;
      amount: number;
      paidAt: string | null;
      stripePaymentId: string | null;
      charged: boolean;
    }> = {
      success: true,
      data: {
        id: paid.id,
        status: paid.status,
        amount: Number(paid.amount),
        paidAt: paid.paidAt?.toISOString() ?? null,
        stripePaymentId: paid.stripePaymentId,
        charged: false,
      },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/invoices/:id/refund ─────────────────────────────────────────────
//
// issueRefund was the last write in revenue-ops that went nowhere. It read the
// invoice out of a module-level Map, built a credit note, and put both back
// into that Map — so a refund left no record, disappeared on restart, and was
// invisible to any other worker. Nothing called it, which is the only reason
// that did no harm.
//
// The service computes and validates; this writes the rows, the same split the
// generate and pay handlers use.
//
// Invoices carry no refundedAmount column, so what has already been refunded
// is summed from the credit notes on record against this invoice rather than
// stored twice and allowed to disagree.

billingRouter.post(
  '/invoices/:id/refund',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = req.params['id'];
    const tenantId = req.tenant?.tenantId;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const { refundAmount, reason } = req.body as { refundAmount?: number; reason?: string };

    if (typeof refundAmount !== 'number' || !Number.isFinite(refundAmount)) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_BODY', message: '"refundAmount" must be a number.' },
      };
      res.status(400).json(body);
      return;
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      // A credit note without a reason is a refund nobody can account for.
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_BODY', message: '"reason" is required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Scoped in the query: an invoice on another tenant answers the same way
    // one that does not exist does.
    const existing = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    // Credit notes already raised against this invoice. Their amounts are
    // negative, so the sum is negated to give the refunded total.
    const priorNotes = await sharedPrisma.invoice.findMany({
      where: { tenantId, type: 'credit_note' },
      select: { amount: true, feeBreakdown: true },
    });

    const alreadyRefunded = priorNotes.reduce((sum, note) => {
      const breakdown = note.feeBreakdown as { lineItems?: { metadata?: { originalInvoiceId?: string } }[] } | null;
      const belongs = breakdown?.lineItems?.some(
        (li) => li.metadata?.originalInvoiceId === invoiceId,
      );
      return belongs ? sum + Math.abs(Number(note.amount)) : sum;
    }, 0);

    let computed;
    try {
      computed = issueRefund({
        originalInvoice: {
          id: existing.id,
          tenantId: existing.tenantId,
          businessId: existing.businessId,
          invoiceNumber: existing.invoiceNumber,
          // The column is a string; the service's unions are narrower. Cast
          // rather than re-declare them here, where they would drift.
          type: existing.type as InvoiceType,
          amount: Number(existing.amount),
          lineItems: [],
          status: existing.status as InvoiceStatus,
          issuedAt: existing.issuedAt,
          dueDate: existing.dueDate,
          paidAt: existing.paidAt,
          stripePaymentId: existing.stripePaymentId,
          refundedAmount: alreadyRefunded,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
        alreadyRefunded,
        refundAmount,
        reason,
        tenantId,
        businessId: existing.businessId,
      });
    } catch (err) {
      // The service's own validation: unpaid invoice, non-positive amount, or
      // more than the balance left on it.
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'REFUND_REJECTED',
          message: err instanceof Error ? err.message : 'Refund rejected.',
        },
      };
      res.status(422).json(body);
      return;
    }

    // The number comes from the table, as it does for generated invoices: the
    // service's counter restarts at zero on boot and would collide.
    const issued = await sharedPrisma.invoice.count({ where: { tenantId } });
    const prefix = tenantId.slice(0, 4).toUpperCase();
    const year = new Date().getFullYear().toString().slice(2);
    const creditNoteNumber = `CN-${prefix}${year}-${String(issued + 1).padStart(6, '0')}`;

    // Both writes together: a credit note without the status change on the
    // invoice would let the same amount be refunded again.
    const [creditNote, updatedOriginal] = await sharedPrisma.$transaction([
      sharedPrisma.invoice.create({
        data: {
          tenantId,
          businessId: existing.businessId,
          invoiceNumber: creditNoteNumber,
          type: 'credit_note',
          amount: computed.creditNote.amount,
          feeBreakdown: { lineItems: computed.creditNote.lineItems } as unknown as Prisma.InputJsonValue,
          status: 'paid',
          issuedAt: computed.creditNote.issuedAt,
          dueDate: computed.creditNote.dueDate,
          paidAt: computed.creditNote.paidAt,
        },
      }),
      sharedPrisma.invoice.update({
        where: { id: invoiceId },
        data: { status: computed.originalInvoice.status },
      }),
    ]);

    logger.info('Refund issued via API', {
      invoiceId,
      tenantId,
      creditNoteId: creditNote.id,
      refundAmount: computed.refundedAmount,
      refundedTotal: computed.originalInvoice.refundedAmount,
    });

    const body: ApiResponse<{
      creditNoteId: string;
      creditNoteNumber: string;
      refundAmount: number;
      refundedTotal: number;
      invoiceStatus: string;
      charged: boolean;
    }> = {
      success: true,
      data: {
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.invoiceNumber,
        refundAmount: computed.refundedAmount,
        refundedTotal: computed.originalInvoice.refundedAmount ?? computed.refundedAmount,
        invoiceStatus: updatedOriginal.status,
        // Nothing here moves money back to anybody. This records the credit
        // note; returning the funds is a separate act through the processor.
        charged: false,
      },
    };
    res.status(201).json(body);
  },
);

// ── GET /api/tenants/:tenantId/plan ───────────────────────────────────────────

billingRouter.get(
  '/tenants/:tenantId/plan',
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.params;
    const callerTenantId = req.tenant?.tenantId;

    if (!tenantId || !callerTenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant ID required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Callers can only read their own plan (unless admin role)
    if (tenantId !== callerTenantId && req.tenant?.role !== 'admin') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access another tenant\'s plan.' },
      };
      res.status(403).json(body);
      return;
    }

    const plan = saasEntitlementsService.getTenantPlan(tenantId);

    if (!plan) {
      // Return default starter info if no plan exists
      const definition = saasEntitlementsService.getPlanDefinition('starter');
      const body: ApiResponse = {
        success: true,
        data: {
          tenantId,
          planName: 'starter',
          status: 'no_plan',
          definition,
          message: 'No active plan found. Defaulting to Starter plan information.',
        },
      };
      res.status(200).json(body);
      return;
    }

    const overages = saasEntitlementsService.detectOverages(tenantId);

    const body: ApiResponse = {
      success: true,
      data: { plan, overages },
    };
    res.status(200).json(body);
  },
);

// ── GET /api/tenants/:tenantId/usage ──────────────────────────────────────────

billingRouter.get(
  '/tenants/:tenantId/usage',
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.params;
    const callerTenantId = req.tenant?.tenantId;

    if (!tenantId || !callerTenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant ID required.' },
      };
      res.status(400).json(body);
      return;
    }

    if (tenantId !== callerTenantId && req.tenant?.role !== 'admin') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access another tenant\'s usage.' },
      };
      res.status(403).json(body);
      return;
    }

    const { year, month } = req.query as { year?: string; month?: string };
    let periodStart: Date | undefined;
    if (year && month) {
      periodStart = new Date(Number(year), Number(month) - 1, 1);
    }

    const snapshot = saasEntitlementsService.getUsageForPeriod(tenantId, periodStart);
    const overages = saasEntitlementsService.detectOverages(tenantId);

    const body: ApiResponse = {
      success: true,
      data: { usage: snapshot, overages },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/tenants/:tenantId/usage/record ──────────────────────────────────

billingRouter.post(
  '/tenants/:tenantId/usage/record',
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.params;
    const callerTenantId = req.tenant?.tenantId;

    if (!tenantId || !callerTenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant ID required.' },
      };
      res.status(400).json(body);
      return;
    }

    if (tenantId !== callerTenantId && req.tenant?.role !== 'admin') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot record usage for another tenant.' },
      };
      res.status(403).json(body);
      return;
    }

    const { metricName, increment, module } = req.body as {
      metricName?: string;
      increment?: number;
      module?: ModuleKey;
    };

    if (!metricName) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '"metricName" is required.' },
      };
      res.status(422).json(body);
      return;
    }

    if (increment !== undefined && (typeof increment !== 'number' || increment < 0)) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '"increment" must be a non-negative number.' },
      };
      res.status(422).json(body);
      return;
    }

    try {
      // Optionally check entitlement before recording
      if (module) {
        const currentUsage = saasEntitlementsService.getMetricValue(tenantId, metricName);
        const check = saasEntitlementsService.checkEntitlement(tenantId, module, currentUsage);
        if (!check.allowed) {
          const body: ApiResponse = {
            success: false,
            error: { code: 'ENTITLEMENT_DENIED', message: check.reason ?? 'Module not permitted.' },
          };
          res.status(402).json(body);
          return;
        }
      }

      const record = saasEntitlementsService.recordUsage({ tenantId, metricName, increment });
      const overages = saasEntitlementsService.detectOverages(tenantId);

      const body: ApiResponse = {
        success: true,
        data: { record, overages },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Usage recording failed', {
        tenantId,
        metricName,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'USAGE_ERROR', message: 'Failed to record usage.' },
      };
      res.status(500).json(body);
    }
  },
);

// ============================================================
// Extended Billing Management (Mock Endpoints)
// ============================================================

// In-memory state for voids, unpays, and commission resolutions

// ── GET /api/billing/invoices/:id/pdf ────────────────────
//
// The invoice as text, from the row.
//
// This returned a fabricated document for any id at all: a fixed billing
// address at "123 Business Ave, Suite 400, New York, NY 10001", four invented
// line items — advisory fee, credit optimization, portfolio monitoring,
// compliance review — totalling $4,549.00, and a due date thirty days out.
// It is a demand for payment somebody could send to a client.

billingRouter.get(
  '/billing/invoices/:id/pdf',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const invoice = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    const business = await sharedPrisma.business.findFirst({
      where: { id: invoice.businessId, tenantId },
      select: { legalName: true },
    });

    const money = (n: number): string => `$${n.toFixed(2)}`;
    const date = (d: Date | null): string =>
      d === null ? 'not recorded' : d.toISOString().slice(0, 10);

    const breakdown = invoice.feeBreakdown as {
      lineItems?: { description?: string; totalAmount?: number }[];
    } | null;
    const lineItems = breakdown?.lineItems ?? [];

    const lines: string[] = [
      'INVOICE',
      '='.repeat(50),
      `Invoice #: ${invoice.invoiceNumber}`,
      `Status: ${invoice.status}`,
      `Issued: ${date(invoice.issuedAt)}`,
      `Due: ${date(invoice.dueDate)}`,
      '',
      'Bill To:',
      // The client on the invoice, or nothing. No address is on file, so none
      // is printed — the one that used to be here belonged to nobody.
      `  ${business?.legalName ?? 'client not found'}`,
      '',
      'Items:',
    ];

    if (lineItems.length === 0) {
      lines.push('  no line items recorded on this invoice');
    } else {
      for (const item of lineItems) {
        const amount =
          typeof item.totalAmount === 'number' ? money(item.totalAmount) : 'not recorded';
        lines.push(`  ${item.description ?? 'unnamed item'}  ${amount}`);
      }
    }

    lines.push(
      '  ' + '-'.repeat(45),
      `  TOTAL  ${money(Number(invoice.amount))}`,
      '',
      // No payment terms or methods: nothing records what was agreed, and
      // "Net 30 / ACH, Wire, Check" was printed on every one of these.
      'This is a text rendering of the invoice record, not a PDF.',
    );

    logger.debug('GET invoice text', { invoiceId, tenantId });

    res.status(200).json({
      success: true,
      data: {
        invoiceId,
        format: 'text',
        content: lines.join('\n'),
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

// ── POST /api/billing/invoices/:id/void ──────────────────
//
// Void an invoice.
//
// This wrote to `voidedInvoices`, a module-level object, and answered 200 with
// status "voided" while the row kept whatever status it had. The invoice went
// on being listed, payable and refundable, and the void was gone at the next
// restart.

billingRouter.post(
  '/billing/invoices/:id/void',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;
    const { reason } = req.body as Record<string, unknown>;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const existing = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    if (existing.status === 'void') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'ALREADY_VOIDED', message: `Invoice ${invoiceId} is already voided.` },
      };
      res.status(422).json(body);
      return;
    }

    if (existing.status === 'paid') {
      // Voiding a paid invoice would erase the record of a payment. A refund
      // is the operation for that, and it leaves a credit note behind.
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message:
            'A paid invoice cannot be voided. Issue a refund instead, which records a credit note.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const voidReason = typeof reason === 'string' && reason.trim() !== '' ? reason : null;

    const [updated] = await sharedPrisma.$transaction([
      sharedPrisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'void' },
      }),
      // The reason has no column, and voiding an invoice is a decision about
      // money — it goes where the other such decisions go.
      sharedPrisma.auditLog.create({
        data: {
          tenantId,
          userId: req.tenant?.userId ?? null,
          action: 'invoice.voided',
          resource: 'invoice',
          resourceId: invoiceId,
          metadata: { reason: voidReason, previousStatus: existing.status },
        },
      }),
    ]);

    logger.info('Invoice voided', { invoiceId, tenantId });

    const body: ApiResponse = {
      success: true,
      data: {
        invoiceId,
        status: updated.status,
        voidedAt: new Date().toISOString(),
        reason: voidReason,
      },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/billing/invoices/:id/unpay ─────────────────
//
// Revert a paid invoice to unpaid.
//
// This wrote to `unpaidInvoices`, another module-level object, and answered
// 200 with status "unpaid" while the row stayed paid — so the invoice was
// reported reverted and remained settled everywhere else.

billingRouter.post(
  '/billing/invoices/:id/unpay',
  async (req: Request, res: Response): Promise<void> => {
    const invoiceId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;

    if (!invoiceId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'Invoice ID and tenant context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const existing = await sharedPrisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    if (existing.status === 'void') {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `Invoice ${invoiceId} is voided and cannot be unpaid.`,
        },
      };
      res.status(422).json(body);
      return;
    }

    if (existing.status !== 'paid') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_STATE', message: `Invoice ${invoiceId} is not paid.` },
      };
      res.status(422).json(body);
      return;
    }

    const [updated] = await sharedPrisma.$transaction([
      sharedPrisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'issued', paidAt: null, stripePaymentId: null },
      }),
      sharedPrisma.auditLog.create({
        data: {
          tenantId,
          userId: req.tenant?.userId ?? null,
          action: 'invoice.unpaid',
          resource: 'invoice',
          resourceId: invoiceId,
          metadata: {
            previousPaidAt: existing.paidAt?.toISOString() ?? null,
            previousStripePaymentId: existing.stripePaymentId,
          },
        },
      }),
    ]);

    logger.info('Invoice reverted to unpaid', { invoiceId, tenantId });

    const body: ApiResponse = {
      success: true,
      data: {
        invoiceId,
        status: updated.status,
        revertedAt: new Date().toISOString(),
        // Reverting the record does not reverse a payment with the processor.
        refunded: false,
      },
    };
    res.status(200).json(body);
  },
);

// ── POST /api/billing/commissions/:id/resolve ────────────────
//
// Resolve a commission dispute.
//
// This wrote the resolution into `resolvedCommissions`, a module-level object,
// and answered 200 with status "resolved". So a dispute was reported settled,
// the record kept its old status, and the note describing the settlement was
// gone at the next restart and invisible to every other worker meanwhile.
//
// The record's status is a real column. The resolution text and any agreed
// amount have no column, so they go to audit_logs — which is where a decision
// about money and its reason belong anyway, and which is already how
// offboarding records its steps.

billingRouter.post(
  '/billing/commissions/:id/resolve',
  async (req: Request, res: Response): Promise<void> => {
    const commissionId = String(req.params['id'] ?? '');
    const tenantId = req.tenant?.tenantId;
    const { resolution, amount } = req.body as Record<string, unknown>;

    if (!commissionId || !tenantId) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'Commission ID and tenant context are required.',
        },
      };
      res.status(400).json(body);
      return;
    }

    if (!resolution || typeof resolution !== 'string' || resolution.trim() === '') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'resolution is required and must be a string.' },
      };
      res.status(422).json(body);
      return;
    }

    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount))) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'amount must be a number when supplied.' },
      };
      res.status(422).json(body);
      return;
    }

    // Scoped in the query: a commission on another tenant answers the same way
    // one that does not exist does.
    const existing = await sharedPrisma.commissionRecord.findFirst({
      where: { id: commissionId, tenantId },
    });

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Commission ${commissionId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    // Both writes together: a status with no record of why it changed is the
    // half of this that used to survive a restart.
    const [updated, audit] = await sharedPrisma.$transaction([
      sharedPrisma.commissionRecord.update({
        where: { id: commissionId },
        data: { status: 'resolved' },
      }),
      sharedPrisma.auditLog.create({
        data: {
          tenantId,
          userId: req.tenant?.userId ?? null,
          action: 'commission.dispute_resolved',
          resource: 'commission_record',
          resourceId: commissionId,
          metadata: {
            resolution,
            // Recorded only when supplied. A default of 0 would state that the
            // dispute settled for nothing.
            ...(typeof amount === 'number' ? { agreedAmount: amount } : {}),
            previousStatus: existing.status,
          },
        },
      }),
    ]);

    logger.info('Commission dispute resolved', { commissionId, tenantId, resolution });

    const body: ApiResponse<{
      commissionId: string;
      status: string;
      resolution: string;
      resolvedAt: string;
      agreedAmount: number | null;
      paid: boolean;
    }> = {
      success: true,
      data: {
        commissionId: updated.id,
        status: updated.status,
        resolution,
        resolvedAt: audit.timestamp.toISOString(),
        agreedAmount: typeof amount === 'number' ? amount : null,
        // Resolving a dispute records an outcome. It does not pay anybody.
        paid: false,
      },
    };
    res.status(200).json(body);
  },
);

// ── GET /api/billing/revenue-trend ───────────────────────────
//
// Six months of revenue, from the invoices table.
//
// This invented it: `45000 + Math.random() * 15000` per month, an invoice
// count of `15 + Math.random() * 10`, and a collection rate starting at 92%.
// Then it sorted the six random figures ascending under a comment reading
// "Ensure upward trend", so the chart always climbed, and computed a growth
// rate from that ordering. The numbers changed on every request, which is the
// one way a reader might have noticed.
//
// Credit notes are negative invoices and are counted as such, so a month with
// refunds shows the revenue actually kept.

billingRouter.get(
  '/billing/revenue-trend',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant context is required.' },
      };
      res.status(400).json(body);
      return;
    }

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const invoices = await sharedPrisma.invoice.findMany({
      where: { tenantId, issuedAt: { gte: windowStart } },
      select: { amount: true, status: true, issuedAt: true },
    });

    const months: Array<{
      month: string;
      revenue: number;
      invoiceCount: number;
      /** Null where nothing was issued that month — not a collection failure. */
      collectionRate: number | null;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toISOString().slice(0, 7);

      const inMonth = invoices.filter(
        (inv) => inv.issuedAt !== null && inv.issuedAt.toISOString().slice(0, 7) === monthLabel,
      );
      const paid = inMonth.filter((inv) => inv.status === 'paid');

      months.push({
        month: monthLabel,
        // Paid invoices only: an issued invoice is not revenue.
        revenue: Math.round(paid.reduce((sum, inv) => sum + Number(inv.amount), 0) * 100) / 100,
        invoiceCount: inMonth.length,
        collectionRate:
          inMonth.length === 0
            ? null
            : Math.round((paid.length / inMonth.length) * 1000) / 1000,
      });
    }

    const totalRevenue = Math.round(months.reduce((sum, m) => sum + m.revenue, 0) * 100) / 100;
    const first = months[0]!.revenue;
    const last = months[months.length - 1]!.revenue;
    const rated = months.filter((m) => m.collectionRate !== null);

    res.status(200).json({
      success: true,
      data: {
        period: `${months[0]!.month} to ${months[months.length - 1]!.month}`,
        months,
        summary: {
          totalRevenue,
          averageMonthly: Math.round((totalRevenue / months.length) * 100) / 100,
          // Null rather than Infinity or a fabricated climb: with no revenue
          // in the first month there is no base to grow from.
          growthRate: first === 0 ? null : +(((last - first) / first) * 100).toFixed(1),
          totalInvoices: months.reduce((sum, m) => sum + m.invoiceCount, 0),
          avgCollectionRate:
            rated.length === 0
              ? null
              : +(
                  rated.reduce((sum, m) => sum + (m.collectionRate ?? 0), 0) / rated.length
                ).toFixed(3),
        },
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

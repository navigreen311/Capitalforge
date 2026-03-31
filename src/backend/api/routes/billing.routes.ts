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
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  revenueOpsService,
} from '../../services/revenue-ops.service.js';
import type {
  GenerateInvoiceInput,
  DealStructure,
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

      logger.info('Invoice generated via API', {
        invoiceId: invoice.id,
        businessId,
        tenantId,
        amount: invoice.amount,
      });

      const body: ApiResponse<typeof invoice> = { success: true, data: invoice };
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

    const invoices = revenueOpsService.getInvoicesForBusiness(tenantId, businessId);

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

    const invoice = revenueOpsService.getInvoice(invoiceId);

    if (!invoice) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    // Tenant isolation check
    if (invoice.tenantId !== tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this invoice.' },
      };
      res.status(403).json(body);
      return;
    }

    const body: ApiResponse<typeof invoice> = { success: true, data: invoice };
    res.status(200).json(body);
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

    const existing = revenueOpsService.getInvoice(invoiceId);

    if (!existing) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Invoice ${invoiceId} not found.` },
      };
      res.status(404).json(body);
      return;
    }

    if (existing.tenantId !== tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to this invoice.' },
      };
      res.status(403).json(body);
      return;
    }

    const { stripePaymentId } = req.body as { stripePaymentId?: string };

    try {
      const paid = revenueOpsService.payInvoice({ invoiceId, stripePaymentId });

      logger.info('Invoice paid via API', {
        invoiceId,
        tenantId,
        amount: paid.amount,
        stripePaymentId: paid.stripePaymentId,
      });

      const body: ApiResponse<typeof paid> = { success: true, data: paid };
      res.status(200).json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process payment.';
      const body: ApiResponse = {
        success: false,
        error: { code: 'PAYMENT_ERROR', message },
      };
      res.status(422).json(body);
    }
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

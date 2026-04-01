// ============================================================
// CapitalForge — Governance Routes
//
// GET  /api/governance/reference-data              — list entities per domain
// POST /api/governance/reference-data              — create / submit / approve version
// POST /api/governance/releases                    — create release or advance/rollback stage
// GET  /api/governance/releases                    — list releases
// GET  /api/governance/releases/:id/preview        — get migration preview
// POST /api/governance/releases/:id/preview        — generate migration preview
// GET  /api/governance/support/incidents           — list incidents
// POST /api/governance/support/incidents           — create incident
// PATCH /api/governance/support/incidents/:id      — update incident
// GET  /api/governance/support/incidents/:id       — get single incident
// GET  /api/governance/support/status/:tenantId    — tenant status summary
// GET  /api/governance/cadence/upcoming            — upcoming governance reviews
// POST /api/governance/cadence/schedule            — schedule review
// PATCH /api/governance/cadence/:id/complete       — complete review
// POST /api/governance/cadence/reminders/process   — process due reminders (cron)
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { ReferenceDataService } from '../../services/governance/reference-data.service.js';
import { ReleaseManagementService } from '../../services/governance/release-management.service.js';
import { SupportOpsService } from '../../services/governance/support-ops.service.js';
import { GovernanceCadenceService } from '../../services/governance/governance-cadence.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const governanceRouter = Router();

// ── Lazy singletons ────────────────────────────────────────────

let refDataSvc: ReferenceDataService       | null = null;
let releaseSvc: ReleaseManagementService   | null = null;
let supportSvc: SupportOpsService          | null = null;
let cadenceSvc: GovernanceCadenceService   | null = null;

function getRefDataSvc():  ReferenceDataService     { return (refDataSvc  ??= new ReferenceDataService()); }
function getReleaseSvc():  ReleaseManagementService { return (releaseSvc  ??= new ReleaseManagementService()); }
function getSupportSvc():  SupportOpsService        { return (supportSvc  ??= new SupportOpsService()); }
function getCadenceSvc():  GovernanceCadenceService { return (cadenceSvc  ??= new GovernanceCadenceService()); }

/** DI injection for tests. */
export function configureGovernanceRouter(deps: {
  refData?:  ReferenceDataService;
  release?:  ReleaseManagementService;
  support?:  SupportOpsService;
  cadence?:  GovernanceCadenceService;
}): void {
  if (deps.refData)  refDataSvc  = deps.refData;
  if (deps.release)  releaseSvc  = deps.release;
  if (deps.support)  supportSvc  = deps.support;
  if (deps.cadence)  cadenceSvc  = deps.cadence;
}

// ── Helpers ────────────────────────────────────────────────────

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(status).json(body);
}

function fail(res: Response, message: string, status = 400): void {
  const body: ApiResponse<null> = { success: false, error: message };
  res.status(status).json(body);
}

function tenantId(req: Request): string {
  return req.tenantContext?.tenantId ?? 'unknown';
}

// ============================================================
// Reference Data
// ============================================================

/**
 * GET /api/governance/reference-data?domain=:domain
 * List all entities (latest version per entityId) for a domain.
 */
governanceRouter.get('/reference-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { domain } = req.query as { domain?: string };
    if (!domain) return fail(res, 'domain query parameter is required');

    const entities = getRefDataSvc().listEntities(domain as any, tenantId(req));
    ok(res, { domain, entities });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/governance/reference-data
 * Multipurpose: action in body determines operation.
 * Actions: create_version | submit_for_review | process_approval | activate_version | recheck_quality
 */
governanceRouter.post('/reference-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, ...payload } = req.body as {
      action: string;
      [key: string]: unknown;
    };

    const svc = getRefDataSvc();

    switch (action) {
      case 'create_version': {
        const version = await svc.createVersion({
          tenantId: tenantId(req),
          domain:     payload['domain'] as any,
          entityId:   payload['entityId'] as string,
          payload:    payload['payload'] as Record<string, unknown>,
          changeNote: payload['changeNote'] as string,
          createdBy:  (req as any).user?.id ?? 'system',
        });
        return ok(res, version, 201);
      }

      case 'submit_for_review': {
        const version = await svc.submitForReview(payload['versionId'] as string);
        return ok(res, version);
      }

      case 'process_approval': {
        const version = await svc.processApproval({
          versionId:       payload['versionId'] as string,
          reviewedBy:      (req as any).user?.id ?? 'system',
          approve:         payload['approve'] as boolean,
          rejectionReason: payload['rejectionReason'] as string | undefined,
        });
        return ok(res, version);
      }

      case 'activate_version': {
        const version = await svc.activateVersion(
          payload['versionId'] as string,
          (req as any).user?.id ?? 'system',
        );
        return ok(res, version);
      }

      case 'recheck_quality': {
        const version = svc.recheckQuality(payload['versionId'] as string);
        return ok(res, version);
      }

      default:
        return fail(res, `Unknown action: ${action}`);
    }
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Release Management
// ============================================================

/**
 * GET /api/governance/releases
 */
governanceRouter.get('/releases', (req: Request, res: Response, next: NextFunction) => {
  try {
    const releases = getReleaseSvc().listReleases(tenantId(req));
    ok(res, { releases });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/governance/releases
 * Actions: create | advance_stage | rollback | set_feature_flag | preview_migration
 */
governanceRouter.post('/releases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, ...payload } = req.body as { action: string; [key: string]: unknown };
    const svc = getReleaseSvc();

    switch (action) {
      case 'create': {
        const release = await svc.createRelease({
          tenantId:         tenantId(req),
          releaseTag:       payload['releaseTag'] as string,
          ruleVersionIds:   payload['ruleVersionIds'] as string[],
          canaryTenantIds:  payload['canaryTenantIds'] as string[],
          expandedTenantIds: payload['expandedTenantIds'] as string[],
          createdBy:        (req as any).user?.id ?? 'system',
        });
        return ok(res, release, 201);
      }

      case 'advance_stage': {
        const release = await svc.advanceStage(
          payload['releaseId'] as string,
          (req as any).user?.id ?? 'system',
        );
        return ok(res, release);
      }

      case 'rollback': {
        const release = await svc.rollbackRelease(
          payload['releaseId'] as string,
          (req as any).user?.id ?? 'system',
          payload['reason'] as string,
        );
        return ok(res, release);
      }

      case 'set_feature_flag': {
        const flag = svc.setFeatureFlag({
          featureKey:        payload['featureKey'] as string,
          tenantId:          (payload['tenantId'] as string) ?? tenantId(req),
          state:             payload['state'] as any,
          percentage:        payload['percentage'] as number | undefined,
          enabledForTenants: payload['enabledForTenants'] as string[] | undefined,
          description:       payload['description'] as string,
          createdBy:         (req as any).user?.id ?? 'system',
        });
        return ok(res, flag);
      }

      case 'preview_migration': {
        const preview = await svc.previewMigration(
          payload['releaseTag'] as string,
          payload['ruleVersionIds'] as string[],
          tenantId(req),
          (req as any).user?.id ?? 'system',
          (payload['mockEntities'] as any[]) ?? [],
        );
        return ok(res, preview);
      }

      default:
        return fail(res, `Unknown action: ${action}`);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/governance/releases/:id
 */
governanceRouter.get('/releases/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const release = getReleaseSvc().getRelease(req.params['id']!);
    if (!release) return fail(res, 'Release not found', 404);
    ok(res, release);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Support Operations — Incidents
// ============================================================

/**
 * GET /api/governance/support/incidents
 */
governanceRouter.get('/support/incidents', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { severity, status } = req.query as { severity?: string; status?: string };
    const incidents = getSupportSvc().listIncidents(
      tenantId(req),
      severity as any,
      status   as any,
    );
    ok(res, { incidents });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/governance/support/incidents
 */
governanceRouter.post('/support/incidents', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      title: string;
      description: string;
      severity: string;
      affectedComponents: string[];
      tags?: string[];
      externalTicketId?: string;
    };

    const incident = getSupportSvc().createIncident({
      tenantId:           tenantId(req),
      title:              body.title,
      description:        body.description,
      severity:           body.severity as any,
      affectedComponents: body.affectedComponents ?? [],
      reportedBy:         (req as any).user?.id ?? 'system',
      tags:               body.tags,
      externalTicketId:   body.externalTicketId,
    });

    ok(res, incident, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/governance/support/incidents/:id
 */
governanceRouter.get('/support/incidents/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = getSupportSvc().getIncident(req.params['id']!);
    if (!incident) return fail(res, 'Incident not found', 404);
    ok(res, incident);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/governance/support/incidents/:id
 */
governanceRouter.patch('/support/incidents/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { status?: string; assignedTo?: string; message: string };
    const incident = getSupportSvc().updateIncident({
      incidentId: req.params['id']!,
      status:     body.status as any,
      assignedTo: body.assignedTo,
      message:    body.message,
      actor:      (req as any).user?.id ?? 'system',
    });
    ok(res, incident);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/governance/support/status/:tenantId
 */
governanceRouter.get('/support/status/:tenantId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = getSupportSvc().getTenantStatusSummary(req.params['tenantId']!);
    ok(res, summary);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/governance/support/sla-policies
 */
governanceRouter.get('/support/sla-policies', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = getSupportSvc().getAllSlaPolicies();
    ok(res, { policies });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Governance Cadence
// ============================================================

/**
 * GET /api/governance/cadence/upcoming?days=30
 */
governanceRouter.get('/cadence/upcoming', (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(String(req.query['days'] ?? '30'), 10);
    const reviews = getCadenceSvc().listUpcoming(tenantId(req), days);
    ok(res, { reviews });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/governance/cadence/overdue
 */
governanceRouter.get('/cadence/overdue', (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviews = getCadenceSvc().listOverdue(tenantId(req));
    ok(res, { reviews });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/governance/cadence/schedule
 * Actions: schedule | quarterly_legal | compliance_committee | issuer_rules |
 *          partner_recertification | training_renewal
 */
governanceRouter.post('/cadence/schedule', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, ...payload } = req.body as { action: string; [key: string]: unknown };
    const svc = getCadenceSvc();
    const tid = tenantId(req);
    const actor = (req as any).user?.id ?? 'system';

    switch (action) {
      case 'schedule': {
        const review = svc.scheduleReview({
          tenantId:         tid,
          reviewType:       payload['reviewType'] as any,
          title:            payload['title'] as string,
          description:      payload['description'] as string,
          dueDate:          new Date(payload['dueDate'] as string),
          scheduledDate:    payload['scheduledDate'] ? new Date(payload['scheduledDate'] as string) : undefined,
          assignedTo:       payload['assignedTo'] as string[],
          notifyEmails:     payload['notifyEmails'] as string[],
          recurrenceMonths: payload['recurrenceMonths'] as number | undefined,
          linkedEntityId:   payload['linkedEntityId'] as string | undefined,
          linkedEntityType: payload['linkedEntityType'] as string | undefined,
          createdBy:        actor,
        });
        return ok(res, review, 201);
      }

      case 'quarterly_legal': {
        const reviews = svc.scheduleQuarterlyLegalReviews(
          tid,
          (payload['year'] as number) ?? new Date().getFullYear(),
          payload['assignedTo'] as string[],
          payload['notifyEmails'] as string[],
          actor,
        );
        return ok(res, { reviews }, 201);
      }

      case 'compliance_committee': {
        const review = svc.scheduleComplianceCommittee(
          tid,
          new Date(payload['meetingDate'] as string),
          payload['agenda'] as string,
          payload['attendees'] as string[],
          payload['notifyEmails'] as string[],
          actor,
        );
        return ok(res, review, 201);
      }

      case 'issuer_rules': {
        const review = svc.scheduleIssuerRulesReview(
          tid,
          payload['issuerId'] as string,
          payload['issuerName'] as string,
          new Date(payload['dueDate'] as string),
          payload['assignedTo'] as string[],
          payload['notifyEmails'] as string[],
          actor,
        );
        return ok(res, review, 201);
      }

      case 'partner_recertification': {
        const review = svc.schedulePartnerRecertification(
          tid,
          payload['partnerId'] as string,
          payload['partnerName'] as string,
          new Date(payload['certificationDue'] as string),
          payload['assignedTo'] as string[],
          payload['notifyEmails'] as string[],
          actor,
        );
        return ok(res, review, 201);
      }

      case 'training_renewal': {
        const review = svc.scheduleTrainingRenewal(
          tid,
          payload['trainingModule'] as string,
          payload['assignedTo'] as string[],
          payload['notifyEmails'] as string[],
          new Date(payload['dueDate'] as string),
          actor,
        );
        return ok(res, review, 201);
      }

      default:
        return fail(res, `Unknown action: ${action}`);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/governance/cadence/:id/complete
 */
governanceRouter.patch('/cadence/:id/complete', (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = getCadenceSvc().completeReview({
      reviewId:    req.params['id']!,
      completedBy: (req as any).user?.id ?? 'system',
      notes:       req.body['notes'],
    });
    ok(res, review);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/governance/cadence/reminders/process
 * Triggered by cron to dispatch pending reminders.
 */
governanceRouter.post('/cadence/reminders/process', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const svc      = getCadenceSvc();
    const overdue  = svc.markOverdueItems();
    const reminders = svc.processDueReminders();
    ok(res, { overdueMarked: overdue.length, remindersSent: reminders.length });
  } catch (err) {
    next(err);
  }
});

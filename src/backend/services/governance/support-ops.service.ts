// ============================================================
// CapitalForge — Enterprise Support Operations Service
//
// Manages:
//   1. Incident creation & lifecycle (P1–P4 severity)
//   2. SLA policy per support tier
//        P1: 1hr response  / 4hr resolution
//        P2: 4hr response  / 8hr resolution
//        P3: 8hr response  / 24hr resolution
//        P4: 24hr response / 72hr resolution
//   3. Tenant status page data aggregation
//   4. Support ticket routing by severity & tenant tier
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';

// ============================================================
// Domain types
// ============================================================

export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus   = 'open' | 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'closed';
export type TenantSupportTier = 'enterprise' | 'professional' | 'starter';

export interface SlaPolicy {
  severity: IncidentSeverity;
  firstResponseMinutes: number;   // SLA minutes for first response
  resolutionMinutes: number;      // SLA minutes for resolution
  escalationMinutes: number;      // auto-escalate if no update after this
  notifyChannels: string[];       // e.g. ['email', 'pagerduty', 'slack']
}

export interface Incident {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedComponents: string[];
  assignedTeam: string;
  assignedTo?: string;
  reportedBy: string;
  createdAt: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  slaFirstResponseDeadline: Date;
  slaResolutionDeadline: Date;
  slaBreached: boolean;
  updates: IncidentUpdate[];
  tags: string[];
  externalTicketId?: string;
  postmortemUrl?: string;
}

export interface IncidentUpdate {
  id: string;
  ts: Date;
  actor: string;
  statusChange?: IncidentStatus;
  message: string;
}

export interface TenantStatusSummary {
  tenantId: string;
  activeIncidents: number;
  openByseverity: Record<IncidentSeverity, number>;
  slaBreaches: number;
  lastUpdated: Date;
  overallHealth: 'operational' | 'degraded' | 'outage';
}

export interface CreateIncidentInput {
  tenantId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  affectedComponents: string[];
  reportedBy: string;
  tags?: string[];
  externalTicketId?: string;
}

export interface UpdateIncidentInput {
  incidentId: string;
  status?: IncidentStatus;
  assignedTo?: string;
  message: string;
  actor: string;
}

// ============================================================
// SLA configuration
// ============================================================

const SLA_POLICIES: Record<IncidentSeverity, SlaPolicy> = {
  P1: {
    severity: 'P1',
    firstResponseMinutes: 60,
    resolutionMinutes: 240,
    escalationMinutes: 30,
    notifyChannels: ['pagerduty', 'slack', 'email', 'sms'],
  },
  P2: {
    severity: 'P2',
    firstResponseMinutes: 240,
    resolutionMinutes: 480,
    escalationMinutes: 120,
    notifyChannels: ['pagerduty', 'slack', 'email'],
  },
  P3: {
    severity: 'P3',
    firstResponseMinutes: 480,
    resolutionMinutes: 1440,
    escalationMinutes: 240,
    notifyChannels: ['slack', 'email'],
  },
  P4: {
    severity: 'P4',
    firstResponseMinutes: 1440,
    resolutionMinutes: 4320,
    escalationMinutes: 720,
    notifyChannels: ['email'],
  },
};

/** Route incidents to support teams based on severity and component. */
function routeIncident(severity: IncidentSeverity, affectedComponents: string[]): string {
  if (severity === 'P1') return 'sre-on-call';
  if (severity === 'P2') return 'platform-engineering';
  if (affectedComponents.some((c) => c.includes('compliance') || c.includes('regulatory'))) {
    return 'compliance-ops';
  }
  if (severity === 'P3') return 'tier2-support';
  return 'tier1-support';
}

// ============================================================
// In-memory store
// ============================================================

const incidentStore: Incident[] = [];

// ============================================================
// Service
// ============================================================

export class SupportOpsService {

  getSlaPolicy(severity: IncidentSeverity): SlaPolicy {
    return SLA_POLICIES[severity];
  }

  getAllSlaPolicies(): SlaPolicy[] {
    return Object.values(SLA_POLICIES);
  }

  // ── Incident lifecycle ───────────────────────────────────────

  createIncident(input: CreateIncidentInput): Incident {
    const sla  = SLA_POLICIES[input.severity];
    const now  = new Date();

    const incident: Incident = {
      id: uuidv4(),
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: 'open',
      affectedComponents: input.affectedComponents,
      assignedTeam: routeIncident(input.severity, input.affectedComponents),
      reportedBy: input.reportedBy,
      createdAt: now,
      slaFirstResponseDeadline: new Date(now.getTime() + sla.firstResponseMinutes * 60_000),
      slaResolutionDeadline:    new Date(now.getTime() + sla.resolutionMinutes    * 60_000),
      slaBreached: false,
      updates: [],
      tags: input.tags ?? [],
      externalTicketId: input.externalTicketId,
    };

    incident.updates.push({
      id: uuidv4(),
      ts: now,
      actor: input.reportedBy,
      statusChange: 'open',
      message: `Incident created — ${input.description}`,
    });

    incidentStore.push(incident);

    logger.info(
      {
        incidentId: incident.id,
        severity: incident.severity,
        tenantId: incident.tenantId,
        team: incident.assignedTeam,
      },
      'incident created',
    );

    // Stub: in production, dispatch PagerDuty / Slack / email via sla.notifyChannels
    this._sendNotificationStub(incident);

    return incident;
  }

  updateIncident(input: UpdateIncidentInput): Incident {
    const incident = incidentStore.find((i) => i.id === input.incidentId);
    if (!incident) throw new Error(`Incident ${input.incidentId} not found`);

    const now = new Date();

    // First response tracking
    if (!incident.firstResponseAt) {
      incident.firstResponseAt = now;
      // Check SLA breach on first response
      if (now > incident.slaFirstResponseDeadline) {
        incident.slaBreached = true;
        logger.warn({ incidentId: incident.id }, 'SLA first-response deadline breached');
      }
    }

    if (input.status) {
      incident.status = input.status;
      if (input.status === 'resolved') {
        incident.resolvedAt = now;
        if (now > incident.slaResolutionDeadline) {
          incident.slaBreached = true;
          logger.warn({ incidentId: incident.id }, 'SLA resolution deadline breached');
        }
      }
      if (input.status === 'closed') {
        incident.closedAt = now;
      }
    }

    if (input.assignedTo) incident.assignedTo = input.assignedTo;

    incident.updates.push({
      id: uuidv4(),
      ts: now,
      actor: input.actor,
      statusChange: input.status,
      message: input.message,
    });

    logger.info({ incidentId: incident.id, status: incident.status, actor: input.actor }, 'incident updated');
    return incident;
  }

  getIncident(incidentId: string): Incident | null {
    return incidentStore.find((i) => i.id === incidentId) ?? null;
  }

  listIncidents(tenantId?: string, severity?: IncidentSeverity, status?: IncidentStatus): Incident[] {
    return incidentStore.filter((i) => {
      if (tenantId && i.tenantId !== tenantId) return false;
      if (severity  && i.severity  !== severity)  return false;
      if (status    && i.status    !== status)    return false;
      return true;
    }).sort((a, b) => {
      // P1 first, then by creation date desc
      const severityOrder: Record<IncidentSeverity, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      if (a.severity !== b.severity) return severityOrder[a.severity] - severityOrder[b.severity];
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  // ── Status page ──────────────────────────────────────────────

  getTenantStatusSummary(tenantId: string): TenantStatusSummary {
    const tenantIncidents = incidentStore.filter(
      (i) => i.tenantId === tenantId && !['closed', 'resolved'].includes(i.status),
    );

    const openByseverity: Record<IncidentSeverity, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
    for (const inc of tenantIncidents) openByseverity[inc.severity]++;

    const slaBreaches = tenantIncidents.filter((i) => i.slaBreached).length;

    let overallHealth: TenantStatusSummary['overallHealth'] = 'operational';
    if (openByseverity.P1 > 0) overallHealth = 'outage';
    else if (openByseverity.P2 > 0 || slaBreaches > 0) overallHealth = 'degraded';

    return {
      tenantId,
      activeIncidents: tenantIncidents.length,
      openByseverity,
      slaBreaches,
      lastUpdated: new Date(),
      overallHealth,
    };
  }

  getGlobalStatusSummary(): TenantStatusSummary[] {
    const tenantIds = [...new Set(incidentStore.map((i) => i.tenantId))];
    return tenantIds.map((tid) => this.getTenantStatusSummary(tid));
  }

  // ── SLA audit ────────────────────────────────────────────────

  checkSlaBreaches(): Incident[] {
    const now = new Date();
    const breached: Incident[] = [];

    for (const incident of incidentStore) {
      if (['resolved', 'closed'].includes(incident.status)) continue;

      let newBreach = false;

      if (!incident.firstResponseAt && now > incident.slaFirstResponseDeadline) {
        newBreach = true;
      }
      if (!incident.resolvedAt && now > incident.slaResolutionDeadline) {
        newBreach = true;
      }

      if (newBreach && !incident.slaBreached) {
        incident.slaBreached = true;
        logger.warn({ incidentId: incident.id, severity: incident.severity }, 'SLA breach detected');
        breached.push(incident);
      }
    }

    return breached;
  }

  // ── Notification stub ────────────────────────────────────────

  private _sendNotificationStub(incident: Incident): void {
    const sla = SLA_POLICIES[incident.severity];
    logger.info(
      {
        incidentId: incident.id,
        channels: sla.notifyChannels,
        assignedTeam: incident.assignedTeam,
      },
      '[STUB] support notification dispatched',
    );
    // TODO: integrate PagerDuty, Slack, and email notifiers
  }

  _reset(): void {
    incidentStore.length = 0;
  }
}

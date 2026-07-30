// ============================================================
// CapitalForge — Issuer Relationship Management Service
//
// Responsibilities:
//   1. Issuer contact registry: banker names, reconsideration lines
//   2. Reconsideration outcome tracking by issuer and advisor
//   3. Approval trend data by relationship strength
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Domain Types ──────────────────────────────────────────────

export interface IssuerContactRecord {
  id:                 string;
  tenantId:           string;
  issuer:             string;
  contactName:        string | null;
  contactRole:        string | null;
  phone:              string | null;
  email:              string | null;
  reconsiderationLine: string | null;
  notes:              string | null;
  relationshipScore:  number | null;
  createdAt:          Date;
  updatedAt:          Date;
}

export interface CreateIssuerContactInput {
  tenantId:            string;
  issuer:              string;
  contactName?:        string;
  contactRole?:        string;
  phone?:              string;
  email?:              string;
  reconsiderationLine?: string;
  notes?:              string;
  relationshipScore?:  number;
}

export interface UpdateIssuerContactInput {
  contactName?:        string;
  contactRole?:        string;
  phone?:              string;
  email?:              string;
  reconsiderationLine?: string;
  notes?:              string;
  relationshipScore?:  number;
}

export interface ReconsiderationOutcome {
  issuer:           string;
  advisorId:        string | null;
  totalAttempts:    number;
  successful:       number;
  pending:          number;
  failed:           number;
  successRate:      number;
  avgDaysToResolve: number;
}

export interface IssuerApprovalTrend {
  issuer:          string;
  relationshipScore: number;
  months:          Array<{
    month:         string;
    totalApps:     number;
    approved:      number;
    approvalRate:  number;
  }>;
  overallApprovalRate: number;
  trend:           'improving' | 'declining' | 'stable';
}

// ── Issuer Relationship Service ───────────────────────────────

export class IssuerRelationshipService {
  private get db(): PrismaClient {
    return getPrisma();
  }

  // ── Contact Registry ────────────────────────────────────────

  /**
   * List all issuer contacts for a tenant.
   * Optionally filter by issuer name.
   */
  async listContacts(tenantId: string, issuer?: string): Promise<IssuerContactRecord[]> {
    const contacts = await this.db.issuerContact.findMany({
      where: {
        tenantId,
        ...(issuer ? { issuer: { contains: issuer, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ issuer: 'asc' }, { createdAt: 'desc' }],
    });

    return contacts.map(this.mapContact);
  }

  /**
   * Get a single issuer contact by ID.
   */
  async getContact(id: string, tenantId: string): Promise<IssuerContactRecord | null> {
    const contact = await this.db.issuerContact.findFirst({
      where: { id, tenantId },
    });
    return contact ? this.mapContact(contact) : null;
  }

  /**
   * Create a new issuer contact entry.
   */
  async createContact(input: CreateIssuerContactInput): Promise<IssuerContactRecord> {
    const contact = await this.db.issuerContact.create({
      data: {
        id:                  uuidv4(),
        tenantId:            input.tenantId,
        issuer:              input.issuer,
        contactName:         input.contactName   ?? null,
        contactRole:         input.contactRole   ?? null,
        phone:               input.phone         ?? null,
        email:               input.email         ?? null,
        reconsiderationLine: input.reconsiderationLine ?? null,
        notes:               input.notes         ?? null,
        relationshipScore:   input.relationshipScore  ?? null,
      },
    });

    logger.info('Issuer contact created', {
      tenantId:  input.tenantId,
      issuer:    input.issuer,
      contactId: contact.id,
    });

    return this.mapContact(contact);
  }

  /**
   * Update an existing issuer contact.
   */
  async updateContact(
    id: string,
    tenantId: string,
    input: UpdateIssuerContactInput,
  ): Promise<IssuerContactRecord> {
    const existing = await this.db.issuerContact.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new Error(`IssuerContact ${id} not found in tenant ${tenantId}`);
    }

    const updated = await this.db.issuerContact.update({
      where: { id },
      data:  {
        ...(input.contactName         !== undefined && { contactName:         input.contactName }),
        ...(input.contactRole         !== undefined && { contactRole:         input.contactRole }),
        ...(input.phone               !== undefined && { phone:               input.phone }),
        ...(input.email               !== undefined && { email:               input.email }),
        ...(input.reconsiderationLine !== undefined && { reconsiderationLine: input.reconsiderationLine }),
        ...(input.notes               !== undefined && { notes:               input.notes }),
        ...(input.relationshipScore   !== undefined && { relationshipScore:   input.relationshipScore }),
      },
    });

    logger.info('Issuer contact updated', { tenantId, contactId: id });

    return this.mapContact(updated);
  }

  // ── Reconsideration Outcomes ────────────────────────────────

  /**
   * Reconsideration outcome analytics from DeclineRecovery records.
   * Grouped by issuer and advisor.
   */
  async getReconsiderationOutcomes(
    tenantId: string,
    issuerFilter?: string,
  ): Promise<ReconsiderationOutcome[]> {
    const recoveries = await this.db.declineRecovery.findMany({
      where: {
        tenantId,
        ...(issuerFilter ? { issuer: issuerFilter } : {}),
      },
      select: {
        issuer:                 true,
        reconsiderationStatus:  true,
        createdAt:              true,
        updatedAt:              true,
        applicationId:          true,
      },
    }) as Array<{
      issuer: string;
      reconsiderationStatus: string;
      createdAt: Date;
      updatedAt: Date;
      applicationId: string;
    }>;

    // Match advisor to each decline via CardApplication
    const appIds = [...new Set(recoveries.map((r) => r.applicationId))];
    const applications = await this.db.cardApplication.findMany({
      where: { id: { in: appIds } },
      select: {
        id:       true,
        business: { select: { advisorId: true } },
      },
    }) as Array<{ id: string; business: { advisorId: string | null } }>;
    const appAdvisorMap = new Map(
      applications.map((a) => [a.id, a.business.advisorId]),
    );

    // Group: issuer → advisorId → outcomes
    const groupKey = (issuer: string, advisorId: string | null) =>
      `${issuer}|||${advisorId ?? '__none__'}`;

    type OutcomeAcc = {
      issuer:      string;
      advisorId:   string | null;
      total:       number;
      successful:  number;
      pending:     number;
      failed:      number;
      daysSum:     number;
      resolvedCount: number;
    };

    const outMap = new Map<string, OutcomeAcc>();

    for (const rec of recoveries) {
      const advisorId = appAdvisorMap.get(rec.applicationId) ?? null;
      const key       = groupKey(rec.issuer, advisorId);
      const entry     = outMap.get(key) ?? {
        issuer:         rec.issuer,
        advisorId,
        total:          0,
        successful:     0,
        pending:        0,
        failed:         0,
        daysSum:        0,
        resolvedCount:  0,
      };

      entry.total += 1;
      if (rec.reconsiderationStatus === 'approved') {
        entry.successful += 1;
        const days = Math.floor(
          (rec.updatedAt.getTime() - rec.createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        entry.daysSum += days;
        entry.resolvedCount += 1;
      } else if (rec.reconsiderationStatus === 'pending') {
        entry.pending += 1;
      } else {
        entry.failed += 1;
      }

      outMap.set(key, entry);
    }

    return [...outMap.values()].map((e) => ({
      issuer:           e.issuer,
      advisorId:        e.advisorId,
      totalAttempts:    e.total,
      successful:       e.successful,
      pending:          e.pending,
      failed:           e.failed,
      successRate:      e.total > 0 ? e.successful / e.total : 0,
      avgDaysToResolve: e.resolvedCount > 0 ? e.daysSum / e.resolvedCount : 0,
    }));
  }

  // ── Approval Trends by Relationship Strength ────────────────

  /**
   * Monthly approval rate trend per issuer, annotated with
   * relationship score from IssuerContact.
   */
  async getIssuerApprovalTrends(tenantId: string): Promise<IssuerApprovalTrend[]> {
    // All applications for this tenant
    const applications = await this.db.cardApplication.findMany({
      where: { business: { tenantId } },
      select: {
        issuer:      true,
        status:      true,
        submittedAt: true,
        decidedAt:   true,
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Relationship scores per issuer
    const contacts = await this.db.issuerContact.findMany({
      where:  { tenantId },
      select: { issuer: true, relationshipScore: true },
    });

    // Best (highest) relationship score per issuer
    const relScoreMap = new Map<string, number>();
    for (const c of contacts) {
      if (c.relationshipScore !== null) {
        const existing = relScoreMap.get(c.issuer) ?? 0;
        if (c.relationshipScore > existing) {
          relScoreMap.set(c.issuer, c.relationshipScore);
        }
      }
    }

    // Group by issuer → month
    type MonthBucket = { total: number; approved: number };
    const issuerMonthMap = new Map<string, Map<string, MonthBucket>>();

    for (const app of applications) {
      const dateRef = app.decidedAt ?? app.submittedAt;
      if (!dateRef) continue;

      const month = `${dateRef.getFullYear()}-${String(dateRef.getMonth() + 1).padStart(2, '0')}`;
      const monthMap = issuerMonthMap.get(app.issuer) ?? new Map<string, MonthBucket>();
      const bucket   = monthMap.get(month) ?? { total: 0, approved: 0 };

      bucket.total += 1;
      if (app.status === 'approved') bucket.approved += 1;
      monthMap.set(month, bucket);
      issuerMonthMap.set(app.issuer, monthMap);
    }

    const trends: IssuerApprovalTrend[] = [];

    for (const [issuer, monthMap] of issuerMonthMap.entries()) {
      const months = [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, b]) => ({
          month,
          totalApps:    b.total,
          approved:     b.approved,
          approvalRate: b.total > 0 ? b.approved / b.total : 0,
        }));

      const totalApps = months.reduce((s, m) => s + m.totalApps, 0);
      const totalApproved = months.reduce((s, m) => s + m.approved, 0);
      const overallApprovalRate = totalApps > 0 ? totalApproved / totalApps : 0;

      // Simple trend: compare last 3 months vs prior 3 months
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (months.length >= 6) {
        const recent = months.slice(-3).reduce((s, m) => s + m.approvalRate, 0) / 3;
        const prior  = months.slice(-6, -3).reduce((s, m) => s + m.approvalRate, 0) / 3;
        if (recent - prior > 0.03) trend = 'improving';
        else if (prior - recent > 0.03) trend = 'declining';
      }

      trends.push({
        issuer,
        relationshipScore:   relScoreMap.get(issuer) ?? 0,
        months,
        overallApprovalRate,
        trend,
      });
    }

    return trends.sort((a, b) => b.overallApprovalRate - a.overallApprovalRate);
  }

  // ── Private helpers ─────────────────────────────────────────

  private mapContact(c: {
    id: string;
    tenantId: string;
    issuer: string;
    contactName: string | null;
    contactRole: string | null;
    phone: string | null;
    email: string | null;
    reconsiderationLine: string | null;
    notes: string | null;
    relationshipScore: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): IssuerContactRecord {
    return {
      id:                  c.id,
      tenantId:            c.tenantId,
      issuer:              c.issuer,
      contactName:         c.contactName,
      contactRole:         c.contactRole,
      phone:               c.phone,
      email:               c.email,
      reconsiderationLine: c.reconsiderationLine,
      notes:               c.notes,
      relationshipScore:   c.relationshipScore,
      createdAt:           c.createdAt,
      updatedAt:           c.updatedAt,
    };
  }
}

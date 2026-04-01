// ============================================================
// CapitalForge — Human Governance Cadence Service
//
// Schedules and tracks all human-in-the-loop governance reviews:
//   1. Quarterly legal review scheduler
//   2. Compliance committee meeting tracker
//   3. Issuer rules review reminders
//   4. Partner re-certification tracker
//   5. Training renewal reminders
//
// All review items carry an email notification stub that would
// dispatch via an email provider (SendGrid / SES) in production.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';

// ============================================================
// Domain types
// ============================================================

export type ReviewType =
  | 'quarterly_legal_review'
  | 'compliance_committee_meeting'
  | 'issuer_rules_review'
  | 'partner_recertification'
  | 'training_renewal';

export type ReviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export interface GovernanceReviewItem {
  id: string;
  tenantId: string;
  reviewType: ReviewType;
  title: string;
  description: string;
  dueDate: Date;
  scheduledDate?: Date;
  status: ReviewStatus;
  assignedTo: string[];     // user IDs / email addresses
  notifyEmails: string[];
  recurrenceMonths?: number; // e.g. 3 = quarterly
  completedAt?: Date;
  completedBy?: string;
  notes?: string;
  linkedEntityId?: string;  // e.g. partnerId, issuerId
  linkedEntityType?: string;
  nextReviewDate?: Date;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  remindersSent: ReminderRecord[];
}

export interface ReminderRecord {
  id: string;
  sentAt: Date;
  channel: 'email' | 'in_app';
  recipients: string[];
  message: string;
}

export interface CreateReviewInput {
  tenantId: string;
  reviewType: ReviewType;
  title: string;
  description: string;
  dueDate: Date;
  scheduledDate?: Date;
  assignedTo: string[];
  notifyEmails: string[];
  recurrenceMonths?: number;
  linkedEntityId?: string;
  linkedEntityType?: string;
  createdBy: string;
}

export interface CompleteReviewInput {
  reviewId: string;
  completedBy: string;
  notes?: string;
}

// ============================================================
// Recurrence helpers
// ============================================================

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function nextQuarterStart(from: Date): Date {
  const d = new Date(from);
  const month = d.getMonth();
  const nextQ = Math.ceil((month + 1) / 3) * 3; // 3, 6, 9, 12
  d.setMonth(nextQ % 12, 1);
  d.setHours(0, 0, 0, 0);
  if (nextQ >= 12) d.setFullYear(d.getFullYear() + 1);
  return d;
}

// ============================================================
// Default reminder cadence (days before due)
// ============================================================

const DEFAULT_REMINDER_DAYS: Record<ReviewType, number[]> = {
  quarterly_legal_review:       [30, 14, 7, 1],
  compliance_committee_meeting: [14, 7, 1],
  issuer_rules_review:          [21, 7, 3],
  partner_recertification:      [60, 30, 14],
  training_renewal:             [30, 14, 7, 1],
};

// ============================================================
// In-memory store
// ============================================================

const reviewStore: GovernanceReviewItem[] = [];

// ============================================================
// Service
// ============================================================

export class GovernanceCadenceService {

  // ── Create / schedule ────────────────────────────────────────

  scheduleReview(input: CreateReviewInput): GovernanceReviewItem {
    const review: GovernanceReviewItem = {
      id: uuidv4(),
      tenantId: input.tenantId,
      reviewType: input.reviewType,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      scheduledDate: input.scheduledDate,
      status: 'scheduled',
      assignedTo: input.assignedTo,
      notifyEmails: input.notifyEmails,
      recurrenceMonths: input.recurrenceMonths,
      linkedEntityId: input.linkedEntityId,
      linkedEntityType: input.linkedEntityType,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: new Date(),
      remindersSent: [],
    };

    reviewStore.push(review);
    logger.info(
      { reviewId: review.id, type: input.reviewType, dueDate: input.dueDate },
      'governance review scheduled',
    );

    // Send initial scheduling notification
    this._sendEmailStub(review, `Governance review scheduled: ${input.title}`, input.notifyEmails);

    return review;
  }

  /** Convenience: schedule all four quarterly legal reviews for the current year. */
  scheduleQuarterlyLegalReviews(
    tenantId: string,
    year: number,
    assignedTo: string[],
    notifyEmails: string[],
    createdBy: string,
  ): GovernanceReviewItem[] {
    const quarters = [
      { label: 'Q1', month: 2 },  // March
      { label: 'Q2', month: 5 },  // June
      { label: 'Q3', month: 8 },  // September
      { label: 'Q4', month: 11 }, // December
    ];

    return quarters.map((q) =>
      this.scheduleReview({
        tenantId,
        reviewType: 'quarterly_legal_review',
        title: `${q.label} ${year} Legal Review`,
        description: `Quarterly legal and compliance review for ${q.label} ${year}. Review issuer agreements, regulatory updates, and state disclosure changes.`,
        dueDate: new Date(year, q.month, 28),
        assignedTo,
        notifyEmails,
        recurrenceMonths: 3,
        createdBy,
      }),
    );
  }

  /** Schedule a compliance committee meeting. */
  scheduleComplianceCommittee(
    tenantId: string,
    meetingDate: Date,
    agenda: string,
    attendees: string[],
    notifyEmails: string[],
    createdBy: string,
  ): GovernanceReviewItem {
    return this.scheduleReview({
      tenantId,
      reviewType: 'compliance_committee_meeting',
      title: `Compliance Committee — ${meetingDate.toDateString()}`,
      description: agenda,
      dueDate: meetingDate,
      scheduledDate: meetingDate,
      assignedTo: attendees,
      notifyEmails,
      recurrenceMonths: 1,
      createdBy,
    });
  }

  /** Schedule an issuer rules review for a specific issuer. */
  scheduleIssuerRulesReview(
    tenantId: string,
    issuerId: string,
    issuerName: string,
    dueDate: Date,
    assignedTo: string[],
    notifyEmails: string[],
    createdBy: string,
  ): GovernanceReviewItem {
    return this.scheduleReview({
      tenantId,
      reviewType: 'issuer_rules_review',
      title: `Issuer Rules Review — ${issuerName}`,
      description: `Review and validate current issuer rules for ${issuerName}. Confirm velocity limits, application windows, and product-family restrictions are current.`,
      dueDate,
      assignedTo,
      notifyEmails,
      recurrenceMonths: 6,
      linkedEntityId: issuerId,
      linkedEntityType: 'issuer',
      createdBy,
    });
  }

  /** Schedule partner re-certification. */
  schedulePartnerRecertification(
    tenantId: string,
    partnerId: string,
    partnerName: string,
    certificationDue: Date,
    assignedTo: string[],
    notifyEmails: string[],
    createdBy: string,
  ): GovernanceReviewItem {
    return this.scheduleReview({
      tenantId,
      reviewType: 'partner_recertification',
      title: `Partner Re-Certification — ${partnerName}`,
      description: `Annual re-certification review for partner ${partnerName}. Validate compliance posture, data handling practices, and contractual obligations.`,
      dueDate: certificationDue,
      assignedTo,
      notifyEmails,
      recurrenceMonths: 12,
      linkedEntityId: partnerId,
      linkedEntityType: 'partner',
      createdBy,
    });
  }

  /** Schedule training renewal for a user or team. */
  scheduleTrainingRenewal(
    tenantId: string,
    trainingModule: string,
    assignedTo: string[],
    notifyEmails: string[],
    dueDate: Date,
    createdBy: string,
  ): GovernanceReviewItem {
    return this.scheduleReview({
      tenantId,
      reviewType: 'training_renewal',
      title: `Training Renewal — ${trainingModule}`,
      description: `Annual compliance training renewal for module: ${trainingModule}. All assigned staff must complete renewal before due date.`,
      dueDate,
      assignedTo,
      notifyEmails,
      recurrenceMonths: 12,
      createdBy,
    });
  }

  // ── Complete a review ────────────────────────────────────────

  completeReview(input: CompleteReviewInput): GovernanceReviewItem {
    const review = reviewStore.find((r) => r.id === input.reviewId);
    if (!review) throw new Error(`Review ${input.reviewId} not found`);

    review.status      = 'completed';
    review.completedAt = new Date();
    review.completedBy = input.completedBy;
    review.notes       = input.notes;
    review.updatedAt   = new Date();

    // Schedule next recurrence if applicable
    if (review.recurrenceMonths) {
      review.nextReviewDate = addMonths(review.dueDate, review.recurrenceMonths);
      logger.info(
        { reviewId: review.id, nextReviewDate: review.nextReviewDate },
        'next recurrence date set',
      );
    }

    logger.info({ reviewId: review.id, completedBy: input.completedBy }, 'governance review completed');

    this._sendEmailStub(
      review,
      `Governance review completed: ${review.title}`,
      review.notifyEmails,
    );

    return review;
  }

  // ── Query ────────────────────────────────────────────────────

  listUpcoming(tenantId: string, withinDays = 30): GovernanceReviewItem[] {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000);
    return reviewStore
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          ['scheduled', 'in_progress'].includes(r.status) &&
          r.dueDate <= cutoff,
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  listOverdue(tenantId?: string): GovernanceReviewItem[] {
    const now = new Date();
    return reviewStore.filter(
      (r) =>
        (!tenantId || r.tenantId === tenantId) &&
        ['scheduled', 'in_progress'].includes(r.status) &&
        r.dueDate < now,
    );
  }

  getReview(reviewId: string): GovernanceReviewItem | null {
    return reviewStore.find((r) => r.id === reviewId) ?? null;
  }

  // ── Reminders ────────────────────────────────────────────────

  /** Process and dispatch pending reminders for all reviews. */
  processDueReminders(): ReminderRecord[] {
    const now   = new Date();
    const sent: ReminderRecord[] = [];

    for (const review of reviewStore) {
      if (!['scheduled', 'in_progress'].includes(review.status)) continue;

      const reminderDays = DEFAULT_REMINDER_DAYS[review.reviewType];

      for (const daysBeforeDue of reminderDays) {
        const reminderTime = new Date(review.dueDate.getTime() - daysBeforeDue * 86_400_000);

        // Check if this specific reminder has already been sent
        const alreadySent = review.remindersSent.some(
          (rs) =>
            Math.abs(rs.sentAt.getTime() - reminderTime.getTime()) < 86_400_000 / 2,
        );

        if (!alreadySent && now >= reminderTime && now < review.dueDate) {
          const message = `Reminder: "${review.title}" is due in ${daysBeforeDue} day(s) on ${review.dueDate.toDateString()}.`;
          const reminder: ReminderRecord = {
            id: uuidv4(),
            sentAt: new Date(),
            channel: 'email',
            recipients: review.notifyEmails,
            message,
          };

          review.remindersSent.push(reminder);
          sent.push(reminder);

          this._sendEmailStub(review, message, review.notifyEmails);
        }
      }
    }

    if (sent.length > 0) {
      logger.info({ count: sent.length }, 'governance reminders dispatched');
    }

    return sent;
  }

  // ── Overdue check ────────────────────────────────────────────

  markOverdueItems(): GovernanceReviewItem[] {
    const now     = new Date();
    const updated: GovernanceReviewItem[] = [];

    for (const review of reviewStore) {
      if (review.status === 'scheduled' && review.dueDate < now) {
        review.status    = 'overdue';
        review.updatedAt = now;
        updated.push(review);

        this._sendEmailStub(
          review,
          `OVERDUE: "${review.title}" was due on ${review.dueDate.toDateString()}`,
          review.notifyEmails,
        );
      }
    }

    if (updated.length > 0) {
      logger.warn({ count: updated.length }, 'governance items marked overdue');
    }

    return updated;
  }

  // ── Email notification stub ──────────────────────────────────

  private _sendEmailStub(
    review: GovernanceReviewItem,
    subject: string,
    recipients: string[],
  ): void {
    logger.info(
      {
        reviewId: review.id,
        reviewType: review.reviewType,
        subject,
        recipients,
      },
      '[STUB] governance email notification dispatched',
    );
    // TODO: integrate SendGrid / AWS SES:
    // await emailProvider.send({ to: recipients, subject, body: buildEmailBody(review) });
  }

  _reset(): void {
    reviewStore.length = 0;
  }

  _store(): GovernanceReviewItem[] {
    return reviewStore;
  }
}

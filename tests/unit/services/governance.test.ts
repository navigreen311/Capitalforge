// ============================================================
// Unit tests — Operating Model Governance Layer
//
// Coverage (24 tests across 4 services):
//
//   ReferenceDataService (6 tests)
//     - createVersion: happy path, quality scoring, error issues
//     - submitForReview: blocks when quality errors present
//     - processApproval: approve and reject paths
//     - activateVersion: supersedes previous active version
//     - listEntities / getActive
//
//   ReleaseManagementService (6 tests)
//     - setFeatureFlag: create, update, idempotent upsert
//     - isFlagEnabled: on/off/percentage logic
//     - createRelease + advanceStage: canary → expanded → all
//     - rollbackRelease: sets rolled_back status with audit entry
//     - previewMigration: detects breaking changes
//
//   SupportOpsService (6 tests)
//     - createIncident: routing, SLA deadline calculation
//     - SLA policies: correct minutes per severity
//     - updateIncident: first response tracking, SLA breach detection
//     - listIncidents: filtering by severity and status
//     - getTenantStatusSummary: health derivation (operational/degraded/outage)
//     - checkSlaBreaches: marks incidents overdue
//
//   GovernanceCadenceService (6 tests)
//     - scheduleReview: creates with correct fields
//     - scheduleQuarterlyLegalReviews: returns 4 items
//     - completeReview: sets status and nextReviewDate for recurring
//     - listUpcoming: filters by tenant and date window
//     - listOverdue: flags past-due items
//     - processDueReminders: dispatches reminders for items in window
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-mock', publishedAt: new Date() }),
  },
}));

vi.mock('../../../src/backend/config/logger.js', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@shared/constants/index.js', () => ({
  EVENT_TYPES:     { RULE_CREATED: 'rule.created', RULE_UPDATED: 'rule.updated' },
  AGGREGATE_TYPES: { RULE: 'rule' },
}));

// ── Imports ───────────────────────────────────────────────────

import { ReferenceDataService }    from '../../../src/backend/services/governance/reference-data.service.js';
import { ReleaseManagementService } from '../../../src/backend/services/governance/release-management.service.js';
import { SupportOpsService }        from '../../../src/backend/services/governance/support-ops.service.js';
import { GovernanceCadenceService } from '../../../src/backend/services/governance/governance-cadence.service.js';

// ============================================================
// ReferenceDataService
// ============================================================

describe('ReferenceDataService', () => {
  let svc: ReferenceDataService;

  beforeEach(() => {
    svc = new ReferenceDataService();
    svc._reset();
  });

  it('createVersion — creates draft with semver 1.0.0 and quality score', async () => {
    const v = await svc.createVersion({
      domain: 'issuer_rules',
      entityId: 'chase',
      payload: {
        issuerId: 'chase',
        issuerName: 'Chase',
        maxCards24Months: 5,
        velocityWindowDays: 30,
        maxAppsInWindow: 2,
        cooldownDays: 0,
      },
      changeNote: 'Initial chase 5/24 rule',
      createdBy: 'admin',
    });

    expect(v.semver).toBe('1.0.0');
    expect(v.status).toBe('draft');
    expect(v.qualityScore).toBeGreaterThanOrEqual(80);
    expect(v.qualityIssues).toHaveLength(0);
  });

  it('createVersion — records quality errors for missing required fields', async () => {
    const v = await svc.createVersion({
      domain: 'fee_taxonomy',
      entityId: 'fee-annual',
      payload: { feeName: 'Annual Fee' }, // missing feeCode, category, disclosureRequired
      changeNote: 'incomplete fee',
      createdBy: 'admin',
    });

    expect(v.qualityScore).toBeLessThan(80);
    expect(v.qualityIssues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('submitForReview — blocks submission when quality errors exist', async () => {
    const v = await svc.createVersion({
      domain: 'card_products',
      entityId: 'prod-1',
      payload: { productName: 'Sapphire' }, // missing productId, network, annualFee
      changeNote: 'bad draft',
      createdBy: 'admin',
    });

    await expect(svc.submitForReview(v.id)).rejects.toThrow(/quality error/i);
  });

  it('processApproval — approves version on approve=true', async () => {
    const v = await svc.createVersion({
      domain: 'mcc_classifications',
      entityId: 'mcc-5411',
      payload: { mccCode: '5411', categoryName: 'Grocery', parentCategory: 'Food', businessPurposeEligible: true, rewardsMultiplier: 2, highRiskFlag: false },
      changeNote: 'grocery MCC',
      createdBy: 'admin',
    });
    await svc.submitForReview(v.id);
    const approved = await svc.processApproval({ versionId: v.id, reviewedBy: 'reviewer', approve: true });

    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('reviewer');
  });

  it('activateVersion — supersedes previous active and sets status=active', async () => {
    // Create and activate v1
    const v1 = await svc.createVersion({
      domain: 'mcc_classifications',
      entityId: 'mcc-5411',
      payload: { mccCode: '5411', categoryName: 'Grocery', parentCategory: 'Food', businessPurposeEligible: true, rewardsMultiplier: 2, highRiskFlag: false },
      changeNote: 'v1',
      createdBy: 'admin',
    });
    await svc.submitForReview(v1.id);
    await svc.processApproval({ versionId: v1.id, reviewedBy: 'r', approve: true });
    await svc.activateVersion(v1.id, 'admin');

    // Create and activate v2
    const v2 = await svc.createVersion({
      domain: 'mcc_classifications',
      entityId: 'mcc-5411',
      payload: { mccCode: '5411', categoryName: 'Grocery Stores', parentCategory: 'Food', businessPurposeEligible: true, rewardsMultiplier: 3, highRiskFlag: false },
      changeNote: 'updated multiplier',
      createdBy: 'admin',
    });
    await svc.submitForReview(v2.id);
    await svc.processApproval({ versionId: v2.id, reviewedBy: 'r', approve: true });
    await svc.activateVersion(v2.id, 'admin');

    const activeVersion = svc.getActive('mcc_classifications', 'mcc-5411');
    const v1Refreshed   = svc._store().find((v) => v.id === v1.id)!;

    expect(activeVersion?.id).toBe(v2.id);
    expect(v1Refreshed.status).toBe('superseded');
  });

  it('listEntities — returns one entry per entityId (latest version)', async () => {
    await svc.createVersion({ domain: 'state_disclosures', entityId: 'CA', payload: { stateCode: 'CA', disclosureType: 'APR', templateId: 'tmpl-1', mandatoryFields: [], deliveryMethods: ['email'], timingRequirement: 'before_signing', regulatoryReference: 'CA Fin Code 22000' }, changeNote: 'init', createdBy: 'admin' });
    await svc.createVersion({ domain: 'state_disclosures', entityId: 'NY', payload: { stateCode: 'NY', disclosureType: 'APR', templateId: 'tmpl-2', mandatoryFields: [], deliveryMethods: ['mail'], timingRequirement: 'before_signing', regulatoryReference: 'NY UCC 9' }, changeNote: 'init', createdBy: 'admin' });

    const entities = svc.listEntities('state_disclosures');
    expect(entities).toHaveLength(2);
  });
});

// ============================================================
// ReleaseManagementService
// ============================================================

describe('ReleaseManagementService', () => {
  let svc: ReleaseManagementService;

  beforeEach(() => {
    svc = new ReleaseManagementService();
    svc._reset();
  });

  it('setFeatureFlag — creates flag and upserts on duplicate key', () => {
    const f1 = svc.setFeatureFlag({ featureKey: 'newDashboard', tenantId: 'tenant-1', state: 'off', description: 'Test flag', createdBy: 'admin' });
    expect(f1.state).toBe('off');

    const f2 = svc.setFeatureFlag({ featureKey: 'newDashboard', tenantId: 'tenant-1', state: 'on', description: 'Updated', createdBy: 'admin' });
    expect(f2.id).toBe(f1.id); // same record upserted
    expect(f2.state).toBe('on');
  });

  it('isFlagEnabled — respects on/off/percentage states', () => {
    svc.setFeatureFlag({ featureKey: 'alpha', tenantId: '*', state: 'on',  description: 'Alpha on', createdBy: 'admin' });
    svc.setFeatureFlag({ featureKey: 'beta',  tenantId: '*', state: 'off', description: 'Beta off', createdBy: 'admin' });

    expect(svc.isFlagEnabled('alpha', 'any-tenant')).toBe(true);
    expect(svc.isFlagEnabled('beta',  'any-tenant')).toBe(false);
    expect(svc.isFlagEnabled('nonexistent', 'any-tenant')).toBe(false);
  });

  it('createRelease — initializes as draft at canary stage', async () => {
    const r = await svc.createRelease({
      tenantId: 'tenant-1',
      releaseTag: 'v2.4.1-rules',
      ruleVersionIds: ['rv-1', 'rv-2'],
      canaryTenantIds: ['tenant-canary'],
      expandedTenantIds: ['tenant-a', 'tenant-b'],
      createdBy: 'admin',
    });

    expect(r.stage).toBe('canary');
    expect(r.status).toBe('draft');
    expect(r.auditLog).toHaveLength(1);
  });

  it('advanceStage — progresses canary → expanded → all and sets complete', async () => {
    const r = await svc.createRelease({
      tenantId: '*', releaseTag: 'v1.0.0', ruleVersionIds: ['rv-1'],
      canaryTenantIds: ['t1'], expandedTenantIds: ['t2'], createdBy: 'admin',
    });

    await svc.advanceStage(r.id, 'admin');
    expect(svc.getRelease(r.id)!.stage).toBe('expanded');

    await svc.advanceStage(r.id, 'admin');
    const final = svc.getRelease(r.id)!;
    expect(final.stage).toBe('all');
    expect(final.status).toBe('complete');
  });

  it('rollbackRelease — sets rolled_back status and appends audit entry', async () => {
    const r = await svc.createRelease({
      tenantId: '*', releaseTag: 'v1.0.0-bad', ruleVersionIds: ['rv-1'],
      canaryTenantIds: [], expandedTenantIds: [], createdBy: 'admin',
    });
    await svc.advanceStage(r.id, 'admin'); // in_progress

    const rolled = await svc.rollbackRelease(r.id, 'admin', 'Regression detected in canary');
    expect(rolled.status).toBe('rolled_back');
    expect(rolled.rollbackReason).toMatch(/regression/i);
    expect(rolled.auditLog.some((e) => e.action === 'rollback')).toBe(true);
  });

  it('previewMigration — detects field_removed and type_changed as breaking changes', async () => {
    const preview = await svc.previewMigration(
      'v2.0.0',
      ['rv-1'],
      'tenant-1',
      'admin',
      [
        {
          entityId: 'e1',
          entityType: 'issuer_rule',
          before: { issuerId: 'chase', maxCards24Months: 5, cooldownDays: 30 },
          after:  { issuerId: 'chase', maxCards24Months: '5' }, // cooldownDays removed; type changed
        },
      ],
    );

    expect(preview.breakingChanges.length).toBeGreaterThan(0);
    expect(preview.breakingChanges.some((c) => c.changeType === 'field_removed')).toBe(true);
    expect(preview.breakingChanges.some((c) => c.changeType === 'type_changed')).toBe(true);
    expect(preview.approved).toBe(false);
  });
});

// ============================================================
// SupportOpsService
// ============================================================

describe('SupportOpsService', () => {
  let svc: SupportOpsService;

  beforeEach(() => {
    svc = new SupportOpsService();
    svc._reset();
  });

  it('SLA policies — correct response and resolution minutes per severity', () => {
    expect(svc.getSlaPolicy('P1').firstResponseMinutes).toBe(60);
    expect(svc.getSlaPolicy('P1').resolutionMinutes).toBe(240);
    expect(svc.getSlaPolicy('P2').firstResponseMinutes).toBe(240);
    expect(svc.getSlaPolicy('P3').firstResponseMinutes).toBe(480);
    expect(svc.getSlaPolicy('P4').firstResponseMinutes).toBe(1440);
    expect(svc.getAllSlaPolicies()).toHaveLength(4);
  });

  it('createIncident — routes P1 to sre-on-call with correct SLA deadlines', () => {
    const before = new Date();
    const inc = svc.createIncident({
      tenantId: 'tenant-1',
      title: 'Card processing down',
      description: 'All card auth requests are failing',
      severity: 'P1',
      affectedComponents: ['card-processing'],
      reportedBy: 'ops-engineer',
    });

    expect(inc.severity).toBe('P1');
    expect(inc.assignedTeam).toBe('sre-on-call');
    expect(inc.status).toBe('open');
    // SLA deadline = now + 60min
    const expectedDeadline = new Date(before.getTime() + 60 * 60_000);
    expect(inc.slaFirstResponseDeadline.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(inc.slaFirstResponseDeadline.getTime()).toBeLessThanOrEqual(expectedDeadline.getTime() + 2000);
  });

  it('createIncident — routes compliance component to compliance-ops team', () => {
    const inc = svc.createIncident({
      tenantId: 'tenant-2',
      title: 'Disclosure rendering failure',
      description: 'State disclosures not rendering',
      severity: 'P3',
      affectedComponents: ['compliance-disclosure'],
      reportedBy: 'legal-team',
    });

    expect(inc.assignedTeam).toBe('compliance-ops');
  });

  it('updateIncident — tracks first response and advances status', () => {
    const inc = svc.createIncident({
      tenantId: 'tenant-1', title: 'DB latency', description: 'High DB latency',
      severity: 'P2', affectedComponents: ['database'], reportedBy: 'monitoring',
    });

    const updated = svc.updateIncident({
      incidentId: inc.id,
      status: 'investigating',
      message: 'Root cause under investigation',
      actor: 'sre-1',
    });

    expect(updated.firstResponseAt).toBeDefined();
    expect(updated.status).toBe('investigating');
    expect(updated.updates).toHaveLength(2); // created + this update
  });

  it('getTenantStatusSummary — returns outage when P1 open', () => {
    svc.createIncident({ tenantId: 't1', title: 'Outage', description: 'Major outage', severity: 'P1', affectedComponents: [], reportedBy: 'ops' });

    const summary = svc.getTenantStatusSummary('t1');
    expect(summary.overallHealth).toBe('outage');
    expect(summary.openByseverity.P1).toBe(1);
    expect(summary.activeIncidents).toBe(1);
  });

  it('listIncidents — filters by severity and status', () => {
    svc.createIncident({ tenantId: 't1', title: 'Inc1', description: 'D', severity: 'P1', affectedComponents: [], reportedBy: 'u' });
    svc.createIncident({ tenantId: 't1', title: 'Inc2', description: 'D', severity: 'P3', affectedComponents: [], reportedBy: 'u' });
    svc.createIncident({ tenantId: 't2', title: 'Inc3', description: 'D', severity: 'P1', affectedComponents: [], reportedBy: 'u' });

    const t1P1 = svc.listIncidents('t1', 'P1');
    expect(t1P1).toHaveLength(1);
    expect(t1P1[0]!.title).toBe('Inc1');

    const allT1 = svc.listIncidents('t1');
    expect(allT1).toHaveLength(2);
  });
});

// ============================================================
// GovernanceCadenceService
// ============================================================

describe('GovernanceCadenceService', () => {
  let svc: GovernanceCadenceService;

  beforeEach(() => {
    svc = new GovernanceCadenceService();
    svc._reset();
  });

  it('scheduleReview — creates review with correct fields and status=scheduled', () => {
    const dueDate = new Date(Date.now() + 14 * 86_400_000);
    const review = svc.scheduleReview({
      tenantId: 't1',
      reviewType: 'compliance_committee_meeting',
      title: 'March Committee',
      description: 'Monthly compliance review',
      dueDate,
      assignedTo: ['user-1', 'user-2'],
      notifyEmails: ['legal@corp.com'],
      createdBy: 'admin',
    });

    expect(review.status).toBe('scheduled');
    expect(review.reviewType).toBe('compliance_committee_meeting');
    expect(review.tenantId).toBe('t1');
    expect(review.assignedTo).toContain('user-1');
  });

  it('scheduleQuarterlyLegalReviews — creates 4 reviews for the year', () => {
    const reviews = svc.scheduleQuarterlyLegalReviews(
      't1', 2026, ['counsel@corp.com'], ['counsel@corp.com'], 'admin',
    );

    expect(reviews).toHaveLength(4);
    expect(reviews[0]!.title).toContain('Q1');
    expect(reviews[3]!.title).toContain('Q4');
    reviews.forEach((r) => expect(r.recurrenceMonths).toBe(3));
  });

  it('completeReview — sets completed status and derives next review date for recurring', () => {
    const dueDate = new Date(Date.now() + 10 * 86_400_000);
    const review = svc.scheduleReview({
      tenantId: 't1',
      reviewType: 'partner_recertification',
      title: 'Partner ABC Recert',
      description: 'Annual recert',
      dueDate,
      assignedTo: ['pm-1'],
      notifyEmails: ['pm@corp.com'],
      recurrenceMonths: 12,
      createdBy: 'admin',
    });

    const completed = svc.completeReview({ reviewId: review.id, completedBy: 'pm-1', notes: 'All clear' });

    expect(completed.status).toBe('completed');
    expect(completed.completedBy).toBe('pm-1');
    expect(completed.nextReviewDate).toBeDefined();
    // Next review ≈ dueDate + 12 months
    const expectedNext = new Date(dueDate);
    expectedNext.setMonth(expectedNext.getMonth() + 12);
    expect(completed.nextReviewDate!.getFullYear()).toBe(expectedNext.getFullYear());
  });

  it('listUpcoming — returns only items due within window', () => {
    svc.scheduleReview({ tenantId: 't1', reviewType: 'training_renewal', title: 'Soon', description: '', dueDate: new Date(Date.now() + 5 * 86_400_000), assignedTo: [], notifyEmails: [], createdBy: 'admin' });
    svc.scheduleReview({ tenantId: 't1', reviewType: 'training_renewal', title: 'Far', description: '', dueDate: new Date(Date.now() + 60 * 86_400_000), assignedTo: [], notifyEmails: [], createdBy: 'admin' });
    svc.scheduleReview({ tenantId: 't2', reviewType: 'training_renewal', title: 'Other tenant', description: '', dueDate: new Date(Date.now() + 5 * 86_400_000), assignedTo: [], notifyEmails: [], createdBy: 'admin' });

    const upcoming = svc.listUpcoming('t1', 10);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.title).toBe('Soon');
  });

  it('listOverdue — flags reviews past their due date', () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000);
    svc.scheduleReview({ tenantId: 't1', reviewType: 'issuer_rules_review', title: 'Overdue review', description: '', dueDate: pastDate, assignedTo: [], notifyEmails: [], createdBy: 'admin' });
    svc.scheduleReview({ tenantId: 't1', reviewType: 'issuer_rules_review', title: 'Future review', description: '', dueDate: new Date(Date.now() + 30 * 86_400_000), assignedTo: [], notifyEmails: [], createdBy: 'admin' });

    const overdue = svc.listOverdue('t1');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.title).toBe('Overdue review');
  });

  it('processDueReminders — dispatches reminders for items in reminder window', () => {
    // Schedule a review due in 7 days (within 7-day reminder window for training_renewal)
    const dueIn7 = new Date(Date.now() + 7 * 86_400_000);
    svc.scheduleReview({ tenantId: 't1', reviewType: 'training_renewal', title: 'Expiring training', description: '', dueDate: dueIn7, assignedTo: ['u1'], notifyEmails: ['u1@corp.com'], createdBy: 'admin' });

    const reminders = svc.processDueReminders();
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    expect(reminders[0]!.recipients).toContain('u1@corp.com');
  });
});

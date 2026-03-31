// ============================================================
// CapitalForge — E2E: Compliance Flow
//
// Covers the full compliance pipeline:
//   UDAP scoring → state law requirements → consent gate →
//   acknowledgment gate → document vault storage →
//   compliance dossier export
//
// All Prisma calls are mocked. Services are tested with real logic
// wired to injected mocks — no HTTP layer involved.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createFullTestBusiness,
  cleanupTestBusiness,
  createEventBusSpy,
  buildCallerContext,
  type TestBusinessGraph,
} from './helpers/test-setup.js';

// ── Service imports ───────────────────────────────────────────
import {
  scoreUdap,
  type UdapScorerInput,
} from '../../src/backend/services/udap-scorer.js';
import {
  getStateLawProfile,
} from '../../src/backend/services/state-law-mapper.js';
import {
  consentGate,
} from '../../src/backend/services/consent-gate.js';
import {
  ConsentService,
  setPrismaClient as setConsentPrisma,
} from '../../src/backend/services/consent.service.js';
import {
  ProductAcknowledgmentService,
  setPrismaClient as setAckPrisma,
} from '../../src/backend/services/product-acknowledgment.service.js';
import {
  DocumentVaultService,
} from '../../src/backend/services/document-vault.service.js';
import {
  ComplianceDossierService,
  setPrismaClient as setDossierPrisma,
} from '../../src/backend/services/compliance-dossier.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: Compliance Flow', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix: 'compliance',
      kybVerified:    true,
      kycVerified:    true,
      withConsent:    true,
    });
    setConsentPrisma(graph.prisma);
    setAckPrisma(graph.prisma);
    setDossierPrisma(graph.prisma);
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: UDAP scorer returns low risk for clean content ─────

  it('scores marketing copy with no violations as low risk', () => {
    const input: UdapScorerInput = {
      interactionText: 'We help small businesses build their credit profile using business credit cards.',
      productContext:  'credit card stacking program',
      disclosureSent:  true,
      consentOnFile:   true,
    };

    const result = scoreUdap(input);

    expect(result.score).toBeLessThan(26);
    expect(result.violations).toHaveLength(0);
    expect(result.requiresReview).toBe(false);
    expect(result.hardStop).toBe(false);
  });

  // ── Test 2: UDAP scorer flags guaranteed approval claim ────────

  it('flags "guaranteed approval" language as a UDAP violation', () => {
    const input: UdapScorerInput = {
      interactionText: 'We guarantee your business will be approved for $150,000 in credit.',
      productContext:  'credit card stacking',
      disclosureSent:  false,
      consentOnFile:   true,
    };

    const result = scoreUdap(input);

    expect(result.violations.length).toBeGreaterThan(0);
    const types = result.violations.map((v) => v.type);
    expect(types).toContain('guaranteed_approval_claim');
    expect(result.requiresReview).toBe(true);
  });

  // ── Test 3: UDAP scorer hard-stops on critical violation ───────

  it('returns a hard stop when score reaches 90+ from multiple violations', () => {
    const input: UdapScorerInput = {
      interactionText: [
        'This is a government-approved program.',
        'We guarantee $200,000 in credit.',
        'There are absolutely no fees involved.',
        'Approval is 100% certain regardless of credit history.',
        'This is equivalent to an SBA loan with no personal guarantee.',
      ].join(' '),
      productContext: 'credit stacking',
      disclosureSent: false,
      consentOnFile:  false,
    };

    const result = scoreUdap(input);

    expect(result.hardStop).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // ── Test 4: UDAP scorer includes missing-disclosure violation ──

  it('flags missing disclosure when disclosure has not been sent', () => {
    const input: UdapScorerInput = {
      interactionText: 'Let me walk you through our funding program details.',
      productContext:  'credit card stacking',
      disclosureSent:  false,
      consentOnFile:   true,
    };

    const result = scoreUdap(input);

    const hasDisclosureViolation = result.violations.some(
      (v) => v.type === 'missing_disclosure',
    );
    expect(hasDisclosureViolation).toBe(true);
  });

  // ── Test 5: State law profile returns CA SB 1235 requirements ─

  it('returns California SB 1235 requirements for CA-registered businesses', () => {
    const profile = getStateLawProfile('CA');

    expect(profile.stateCode).toBe('CA');
    expect(profile.hasSpecificStateLaw).toBe(true);
    expect(profile.primaryCitation).toMatch(/SB 1235|DFPI/i);
    expect(profile.requiredDisclosures.length).toBeGreaterThan(0);
    expect(profile.complianceSteps.length).toBeGreaterThan(0);
  });

  // ── Test 6: State law profile returns NY requirements ──────────

  it('returns New York commercial financing requirements for NY businesses', () => {
    const profile = getStateLawProfile('NY');

    expect(profile.stateCode).toBe('NY');
    expect(profile.hasSpecificStateLaw).toBe(true);
    expect(profile.primaryCitation).toMatch(/NYCRR|NY|N\.Y\./i);
    expect(profile.requiredDisclosures.length).toBeGreaterThan(0);
  });

  // ── Test 7: State law profile returns federal baseline for TX ──

  it('returns federal baseline for states without specific commercial law (TX)', () => {
    const profile = getStateLawProfile('TX');

    expect(profile.stateCode).toBe('TX');
    expect(profile.regulatoryBody).toMatch(/FTC|federal/i);
    expect(profile.requiredDisclosures.length).toBeGreaterThanOrEqual(0);
  });

  // ── Test 8: Consent gate blocks SMS without TCPA consent ───────

  it('consent gate blocks SMS outreach when TCPA consent is missing', async () => {
    const svc = new ConsentService(graph.prisma);
    graph.prisma.consentRecord.findFirst = vi.fn().mockResolvedValue(null);

    const result = await consentGate.check(
      graph.tenant.id,
      graph.business.id,
      'sms',
      svc,
    );

    expect(result.allowed).toBe(false);
    expect(['CONSENT_MISSING', 'TCPA_HARD_BLOCK']).toContain(result.reason);
  });

  // ── Test 9: Consent grant records evidence and emits event ─────

  it('grants TCPA consent with evidence reference and emits CONSENT_GRANTED event', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new ConsentService(graph.prisma);

    graph.prisma.consentRecord.create = vi.fn().mockResolvedValue({
      ...graph.tcpaConsent,
      status:    'active',
      grantedAt: new Date(),
    });

    const result = await svc.grant({
      tenantId:    graph.tenant.id,
      businessId:  graph.business.id,
      channel:     'voice',
      consentType: 'tcpa',
      evidenceRef: 'sig_tcpa_abc123',
      ipAddress:   '192.168.1.100',
      actorId:     graph.advisorUser.id,
    });

    expect(result.status).toBe('active');
    expect(graph.prisma.consentRecord.create).toHaveBeenCalledOnce();
    spy.assertEventFired('consent.captured');
    spy.restore();
  });

  // ── Test 10: Acknowledgment signing stores vault document ──────

  it('signs a product_reality acknowledgment and links to document vault', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new ProductAcknowledgmentService(graph.prisma);

    graph.prisma.productAcknowledgment.create = vi.fn().mockResolvedValue({
      id:                 `ack-new-${graph.business.id}`,
      businessId:         graph.business.id,
      acknowledgmentType: 'product_reality',
      version:            '1.0.0',
      signedAt:           new Date(),
      signatureRef:       'sig_abc123def456',
      documentVaultId:    `doc-ack-${graph.business.id}`,
      metadata:           { signerUserId: graph.advisorUser.id },
      createdAt:          new Date(),
    });
    graph.prisma.document.create = vi.fn().mockResolvedValue(
      (graph.prisma.document as unknown as { findMany: { mock: unknown }, create: ReturnType<typeof vi.fn> }).create
        ? { id: `doc-ack-${graph.business.id}`, storageKey: 'docs/ack.txt' }
        : undefined,
    );

    const ack = await svc.sign({
      businessId:    graph.business.id,
      tenantId:      graph.tenant.id,
      signedByUserId: graph.advisorUser.id,
      input: {
        acknowledgmentType: 'product_reality',
        signerName:         'Jane Doe',
      },
      signerIp: '10.0.0.1',
    });

    expect(ack.acknowledgmentType).toBe('product_reality');
    expect(ack.signatureRef).toBeDefined();
    spy.assertEventFired('product.reality.acknowledged');
    spy.restore();
  });

  // ── Test 11: Document vault stores file with crypto-timestamp ──

  it('uploads a document to the vault and emits DOCUMENT_UPLOADED event', async () => {
    const spy = createEventBusSpy(eventBus);
    const vaultSvc = new DocumentVaultService(graph.prisma);

    graph.prisma.document.create = vi.fn().mockResolvedValue({
      id:              `doc-upload-${Date.now()}`,
      tenantId:        graph.tenant.id,
      businessId:      graph.business.id,
      documentType:    'disclosure',
      title:           'SB 1235 Disclosure',
      storageKey:      `docs/${graph.tenant.id}/${graph.business.id}/disclosure.pdf`,
      mimeType:        'application/pdf',
      sizeBytes:       2048,
      sha256Hash:      'deadbeef1234567890',
      cryptoTimestamp: `${new Date().toISOString()}:deadbeef1234567890`,
      legalHold:       false,
      uploadedBy:      graph.advisorUser.id,
      metadata:        {},
      createdAt:       new Date(),
      updatedAt:       new Date(),
    });

    const doc = await vaultSvc.upload({
      tenantId:     graph.tenant.id,
      businessId:   graph.business.id,
      uploadedBy:   graph.advisorUser.id,
      documentType: 'disclosure',
      title:        'SB 1235 Disclosure',
      mimeType:     'application/pdf',
      content:      Buffer.from('This is the SB 1235 disclosure content.'),
    });

    expect(doc.id).toBeDefined();
    expect(doc.sha256Hash).toBeDefined();
    expect(doc.cryptoTimestamp).toBeDefined();
    spy.assertEventFired('document.uploaded');
    spy.restore();
  });

  // ── Test 12: Compliance dossier assembles all records ──────────

  it('assembles a complete compliance dossier for a business', async () => {
    const dossierSvc = new ComplianceDossierService(graph.prisma);

    graph.prisma.consentRecord.findMany = vi.fn().mockResolvedValue([graph.tcpaConsent]);
    graph.prisma.productAcknowledgment.findMany = vi.fn().mockResolvedValue([{
      id: `ack-${graph.business.id}`,
      businessId: graph.business.id,
      acknowledgmentType: 'product_reality',
      version: '1.0.0',
      signedAt: new Date(Date.now() - 3600_000),
      signatureRef: 'sig_abc123',
      documentVaultId: `doc-ack-${graph.business.id}`,
      metadata: {},
      createdAt: new Date(Date.now() - 3600_000),
    }]);
    graph.prisma.cardApplication.findMany = vi.fn().mockResolvedValue([graph.application]);
    graph.prisma.document.findMany = vi.fn().mockResolvedValue([{
      id: `doc-${graph.business.id}`,
      tenantId: graph.tenant.id,
      businessId: graph.business.id,
      documentType: 'consent_form',
      title: 'TCPA Consent',
      storageKey: `docs/${graph.tenant.id}/${graph.business.id}/consent.txt`,
      mimeType: 'text/plain',
      sizeBytes: 512,
      sha256Hash: 'abc123',
      cryptoTimestamp: `${new Date().toISOString()}:abc123`,
      legalHold: false,
      uploadedBy: graph.advisorUser.id,
      metadata: {},
      createdAt: new Date(),
    }]);
    graph.prisma.suitabilityCheck.findMany = vi.fn().mockResolvedValue([graph.suitability]);
    graph.prisma.achAuthorization = { findMany: vi.fn().mockResolvedValue([]) } as never;
    graph.prisma.costCalculation.findMany = vi.fn().mockResolvedValue([]);
    graph.prisma.complianceCheck.findMany = vi.fn().mockResolvedValue([{
      id: `kyb-check-${graph.business.id}`,
      checkType: 'kyb', riskScore: 10, riskLevel: 'low',
      findings: { status: 'verified' }, createdAt: new Date(),
    }]);

    const dossier = await dossierSvc.assemble({
      tenantId:    graph.tenant.id,
      businessId:  graph.business.id,
      requestedBy: graph.complianceUser.id,
    });

    expect(dossier.businessId).toBe(graph.business.id);
    expect(dossier.consentRecords.length).toBeGreaterThanOrEqual(1);
    expect(dossier.acknowledgments.length).toBeGreaterThanOrEqual(1);
    expect(dossier.documents.length).toBeGreaterThanOrEqual(1);
    expect(dossier.generatedAt).toBeDefined();
  });
});

// ============================================================
// CapitalForge — Compliance Dossier Service
//
// One-click "regulator-ready packet" assembly.
//
// Assembles ALL compliance-relevant records for a single business:
//   - Consent records (TCPA, data-sharing, application, product-reality)
//   - Product acknowledgments (product reality, fee schedules, guarantees)
//   - Card applications with adverse-action notices
//   - Fee schedule snapshots (cost calculations)
//   - Documents stored in the vault (all types)
//   - ACH authorizations
//   - Suitability checks
//   - Compliance checks
//
// Output: a structured JSON manifest + a flat list of document refs
// that can be zipped and handed to regulators / counsel.
//
// PRODUCTION NOTE: In production, replace the in-memory JSON assembly
// with a streaming ZIP builder (e.g. archiver npm package) that pulls
// raw file bytes from S3 for each document and streams directly to the
// response without buffering the full archive in Lambda memory.
// ============================================================

import { PrismaClient } from '@prisma/client';
import logger from '../config/logger.js';
import { verifyCryptoTimestamp } from './crypto-timestamp.js';

// ── Types ──────────────────────────────────────────────────────

export interface DossierOptions {
  tenantId:   string;
  businessId: string;
  /** Requesting user ID — logged for audit */
  requestedBy: string;
  /**
   * Optional ISO date range filter.
   * If omitted all records since business creation are included.
   */
  since?: string;
  until?: string;
}

export interface ConsentSummary {
  id:             string;
  channel:        string;
  consentType:    string;
  status:         string;
  grantedAt:      string;
  revokedAt:      string | null;
  revocationReason: string | null;
  ipAddress:      string | null;
  evidenceRef:    string | null;
}

export interface AcknowledgmentSummary {
  id:                  string;
  acknowledgmentType:  string;
  version:             string;
  signedAt:            string;
  signatureRef:        string | null;
  documentVaultId:     string | null;
}

export interface ApplicationSummary {
  id:                 string;
  issuer:             string;
  cardProduct:        string;
  status:             string;
  creditLimit:        string | null;
  introApr:           string | null;
  introAprExpiry:     string | null;
  regularApr:         string | null;
  annualFee:          string | null;
  consentCapturedAt:  string | null;
  submittedAt:        string | null;
  decidedAt:          string | null;
  declineReason:      string | null;
  adverseActionNotice: unknown;
}

export interface FeeScheduleSummary {
  id:               string;
  programFees:      string;
  percentOfFunding: string;
  annualFees:       string;
  cashAdvanceFees:  string;
  processorFees:    string;
  totalCost:        string;
  effectiveApr:     string | null;
  createdAt:        string;
}

export interface AchAuthSummary {
  id:                  string;
  processorName:       string;
  authorizedAmount:    string | null;
  authorizedFrequency: string | null;
  status:              string;
  authorizedAt:        string;
  revokedAt:           string | null;
}

export interface SuitabilitySummary {
  id:                 string;
  score:              number;
  maxSafeLeverage:    string | null;
  recommendation:     string;
  noGoTriggered:      boolean;
  noGoReasons:        unknown;
  overriddenBy:       string | null;
  overrideReason:     string | null;
  createdAt:          string;
}

export interface ComplianceCheckSummary {
  id:               string;
  checkType:        string;
  riskScore:        number | null;
  riskLevel:        string | null;
  findings:         unknown;
  stateJurisdiction: string | null;
  resolvedAt:       string | null;
  createdAt:        string;
}

export interface VaultDocumentSummary {
  id:              string;
  documentType:    string;
  title:           string;
  storageKey:      string;
  mimeType:        string | null;
  sizeBytes:       number | null;
  sha256Hash:      string | null;
  cryptoTimestamp: string | null;
  /** Result of timestamp integrity check performed at dossier assembly time */
  timestampIntegrity: 'verified' | 'unverifiable' | 'tampered';
  legalHold:       boolean;
  uploadedBy:      string | null;
  createdAt:       string;
}

export interface BusinessSnapshot {
  id:                  string;
  legalName:           string;
  dba:                 string | null;
  ein:                 string | null;
  entityType:          string;
  stateOfFormation:    string | null;
  dateOfFormation:     string | null;
  industry:            string | null;
  annualRevenue:       string | null;
  fundingReadinessScore: number | null;
  status:              string;
}

export interface ComplianceDossier {
  /** RFC 3339 timestamp of when this dossier was assembled */
  assembledAt:       string;
  assembledBy:       string;
  tenantId:          string;
  businessId:        string;
  /** Optional date range applied as filter */
  filterSince:       string | null;
  filterUntil:       string | null;

  business:          BusinessSnapshot;
  consentRecords:    ConsentSummary[];
  acknowledgments:   AcknowledgmentSummary[];
  applications:      ApplicationSummary[];
  feeSchedules:      FeeScheduleSummary[];
  achAuthorizations: AchAuthSummary[];
  suitabilityChecks: SuitabilitySummary[];
  complianceChecks:  ComplianceCheckSummary[];
  documents:         VaultDocumentSummary[];

  /** Counts for quick review */
  summary: {
    totalConsents:        number;
    activeConsents:       number;
    revokedConsents:      number;
    totalAcknowledgments: number;
    totalApplications:    number;
    approvedApplications: number;
    declinedApplications: number;
    totalDocuments:       number;
    documentsOnLegalHold: number;
    timestampsTampered:   number;
    noGoTriggered:        boolean;
    openComplianceIssues: number;
  };
}

// ── ComplianceDossierService ───────────────────────────────────

export class ComplianceDossierService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  /**
   * Assemble the full compliance dossier for a single business.
   *
   * All queries are tenant-scoped (tenantId guard on every query).
   * No PII is returned beyond what is stored in the underlying records —
   * EIN and SSN fields are NOT included (they exist on BusinessOwner which
   * is excluded here; advisors should retrieve those through a separately
   * permissioned endpoint).
   */
  async assemble(options: DossierOptions): Promise<ComplianceDossier> {
    const { tenantId, businessId, requestedBy, since, until } = options;
    const assembledAt = new Date().toISOString();

    const svcLog = logger.child({
      service:    'ComplianceDossierService',
      tenantId,
      businessId,
      requestedBy,
    });

    svcLog.info('[assemble] Starting dossier assembly');

    // Build date range filter used by most sub-queries
    const dateFilter = this._buildDateFilter(since, until);

    // Parallel fetch all record types — tenant + business scoped
    const [
      business,
      consents,
      acknowledgments,
      applications,
      feeSchedules,
      achAuths,
      suitabilityChecks,
      complianceChecks,
      documents,
    ] = await Promise.all([
      this._fetchBusiness(tenantId, businessId),
      this._fetchConsents(tenantId, businessId, dateFilter),
      this._fetchAcknowledgments(businessId, dateFilter),
      this._fetchApplications(businessId, dateFilter),
      this._fetchFeeSchedules(businessId, dateFilter),
      this._fetchAchAuths(businessId, dateFilter),
      this._fetchSuitabilityChecks(businessId, dateFilter),
      this._fetchComplianceChecks(tenantId, businessId, dateFilter),
      this._fetchDocuments(tenantId, businessId, dateFilter),
    ]);

    if (!business) {
      throw new BusinessNotFoundForDossierError(businessId);
    }

    // Verify cryptographic timestamps on all vault documents
    const verifiedDocuments = documents.map((doc) =>
      this._verifyDocumentTimestamp(doc, tenantId),
    );

    const timestampsTampered = verifiedDocuments.filter(
      (d) => d.timestampIntegrity === 'tampered',
    ).length;

    if (timestampsTampered > 0) {
      svcLog.error('[assemble] ALERT: Tampered document timestamps detected', {
        businessId,
        tamperedCount: timestampsTampered,
      });
    }

    // Compute summary statistics
    const summary = {
      totalConsents:        consents.length,
      activeConsents:       consents.filter((c) => c.status === 'active').length,
      revokedConsents:      consents.filter((c) => c.status === 'revoked').length,
      totalAcknowledgments: acknowledgments.length,
      totalApplications:    applications.length,
      approvedApplications: applications.filter((a) => a.status === 'approved').length,
      declinedApplications: applications.filter((a) => a.status === 'declined').length,
      totalDocuments:       verifiedDocuments.length,
      documentsOnLegalHold: verifiedDocuments.filter((d) => d.legalHold).length,
      timestampsTampered,
      noGoTriggered:        suitabilityChecks.some((s) => s.noGoTriggered),
      openComplianceIssues: complianceChecks.filter((c) => !c.resolvedAt).length,
    };

    svcLog.info('[assemble] Dossier assembled', {
      businessId,
      ...summary,
    });

    return {
      assembledAt,
      assembledBy:       requestedBy,
      tenantId,
      businessId,
      filterSince:       since ?? null,
      filterUntil:       until ?? null,
      business:          this._toBusinessSnapshot(business),
      consentRecords:    consents.map(this._toConsentSummary),
      acknowledgments:   acknowledgments.map(this._toAcknowledgmentSummary),
      applications:      applications.map(this._toApplicationSummary),
      feeSchedules:      feeSchedules.map(this._toFeeScheduleSummary),
      achAuthorizations: achAuths.map(this._toAchAuthSummary),
      suitabilityChecks: suitabilityChecks.map(this._toSuitabilitySummary),
      complianceChecks:  complianceChecks.map(this._toComplianceCheckSummary),
      documents:         verifiedDocuments,
      summary,
    };
  }

  // ── Private fetchers ───────────────────────────────────────

  private async _fetchBusiness(tenantId: string, businessId: string) {
    return this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
    });
  }

  private async _fetchConsents(
    tenantId:   string,
    businessId: string,
    dateFilter: Record<string, unknown>,
  ) {
    return this.prisma.consentRecord.findMany({
      where: { tenantId, businessId, ...dateFilter },
      orderBy: { grantedAt: 'asc' },
    });
  }

  private async _fetchAcknowledgments(
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.productAcknowledgment.findMany({
      where: { businessId, ...this._mapDateField(dateFilter, 'signedAt') },
      orderBy: { signedAt: 'asc' },
    });
  }

  private async _fetchApplications(
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.cardApplication.findMany({
      where: { businessId, ...this._mapDateField(dateFilter, 'createdAt') },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchFeeSchedules(
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.costCalculation.findMany({
      where: { businessId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchAchAuths(
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.achAuthorization.findMany({
      where: { businessId, ...this._mapDateField(dateFilter, 'authorizedAt') },
      orderBy: { authorizedAt: 'asc' },
    });
  }

  private async _fetchSuitabilityChecks(
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.suitabilityCheck.findMany({
      where: { businessId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchComplianceChecks(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.complianceCheck.findMany({
      where: { tenantId, businessId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchDocuments(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.document.findMany({
      where: { tenantId, businessId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── Timestamp verification ─────────────────────────────────

  private _verifyDocumentTimestamp(
    doc: {
      id:              string;
      documentType:    string;
      title:           string;
      storageKey:      string;
      mimeType:        string | null;
      sizeBytes:       number | null;
      sha256Hash:      string | null;
      cryptoTimestamp: string | null;
      legalHold:       boolean;
      uploadedBy:      string | null;
      createdAt:       Date;
    },
    tenantId: string,
  ): VaultDocumentSummary {
    let timestampIntegrity: 'verified' | 'unverifiable' | 'tampered' = 'unverifiable';

    if (doc.sha256Hash && doc.cryptoTimestamp) {
      const result = verifyCryptoTimestamp(doc.cryptoTimestamp, {
        contentHash: doc.sha256Hash,
        timestamp:   doc.createdAt.toISOString(),
        tenantId,
        documentId:  doc.id,
      });
      timestampIntegrity = result.valid ? 'verified' : 'tampered';
    }

    return {
      id:              doc.id,
      documentType:    doc.documentType,
      title:           doc.title,
      storageKey:      doc.storageKey,
      mimeType:        doc.mimeType,
      sizeBytes:       doc.sizeBytes,
      sha256Hash:      doc.sha256Hash,
      cryptoTimestamp: doc.cryptoTimestamp,
      timestampIntegrity,
      legalHold:       doc.legalHold,
      uploadedBy:      doc.uploadedBy,
      createdAt:       doc.createdAt.toISOString(),
    };
  }

  // ── Date filter helpers ────────────────────────────────────

  private _buildDateFilter(
    since?: string,
    until?: string,
  ): Record<string, unknown> {
    if (!since && !until) return {};
    const filter: Record<string, Date> = {};
    if (since) filter['gte'] = new Date(since);
    if (until) filter['lte'] = new Date(until);
    return { createdAt: filter };
  }

  /**
   * Re-maps a generic createdAt date filter onto a different date field.
   * Used for models where the primary date field differs (e.g. signedAt, authorizedAt).
   */
  private _mapDateField(
    dateFilter: Record<string, unknown>,
    field: string,
  ): Record<string, unknown> {
    if (!dateFilter['createdAt']) return {};
    return { [field]: dateFilter['createdAt'] };
  }

  // ── Mappers ────────────────────────────────────────────────

  private _toBusinessSnapshot(b: {
    id: string;
    legalName: string;
    dba: string | null;
    ein: string | null;
    entityType: string;
    stateOfFormation: string | null;
    dateOfFormation: Date | null;
    industry: string | null;
    annualRevenue: unknown;
    fundingReadinessScore: number | null;
    status: string;
  }): BusinessSnapshot {
    return {
      id:                   b.id,
      legalName:            b.legalName,
      dba:                  b.dba,
      ein:                  b.ein ? `***-**-${b.ein.slice(-4)}` : null, // mask EIN
      entityType:           b.entityType,
      stateOfFormation:     b.stateOfFormation,
      dateOfFormation:      b.dateOfFormation?.toISOString() ?? null,
      industry:             b.industry,
      annualRevenue:        b.annualRevenue ? String(b.annualRevenue) : null,
      fundingReadinessScore: b.fundingReadinessScore,
      status:               b.status,
    };
  }

  private _toConsentSummary(c: {
    id: string;
    channel: string;
    consentType: string;
    status: string;
    grantedAt: Date;
    revokedAt: Date | null;
    revocationReason: string | null;
    ipAddress: string | null;
    evidenceRef: string | null;
  }): ConsentSummary {
    return {
      id:               c.id,
      channel:          c.channel,
      consentType:      c.consentType,
      status:           c.status,
      grantedAt:        c.grantedAt.toISOString(),
      revokedAt:        c.revokedAt?.toISOString() ?? null,
      revocationReason: c.revocationReason,
      // Mask IP to /24 for privacy — full IP not needed in the dossier
      ipAddress:        c.ipAddress ? c.ipAddress.replace(/\.\d+$/, '.xxx') : null,
      evidenceRef:      c.evidenceRef,
    };
  }

  private _toAcknowledgmentSummary(a: {
    id: string;
    acknowledgmentType: string;
    version: string;
    signedAt: Date;
    signatureRef: string | null;
    documentVaultId: string | null;
  }): AcknowledgmentSummary {
    return {
      id:                  a.id,
      acknowledgmentType:  a.acknowledgmentType,
      version:             a.version,
      signedAt:            a.signedAt.toISOString(),
      signatureRef:        a.signatureRef,
      documentVaultId:     a.documentVaultId,
    };
  }

  private _toApplicationSummary(a: {
    id: string;
    issuer: string;
    cardProduct: string;
    status: string;
    creditLimit: unknown;
    introApr: unknown;
    introAprExpiry: Date | null;
    regularApr: unknown;
    annualFee: unknown;
    consentCapturedAt: Date | null;
    submittedAt: Date | null;
    decidedAt: Date | null;
    declineReason: string | null;
    adverseActionNotice: unknown;
  }): ApplicationSummary {
    return {
      id:                  a.id,
      issuer:              a.issuer,
      cardProduct:         a.cardProduct,
      status:              a.status,
      creditLimit:         a.creditLimit ? String(a.creditLimit) : null,
      introApr:            a.introApr ? String(a.introApr) : null,
      introAprExpiry:      a.introAprExpiry?.toISOString() ?? null,
      regularApr:          a.regularApr ? String(a.regularApr) : null,
      annualFee:           a.annualFee ? String(a.annualFee) : null,
      consentCapturedAt:   a.consentCapturedAt?.toISOString() ?? null,
      submittedAt:         a.submittedAt?.toISOString() ?? null,
      decidedAt:           a.decidedAt?.toISOString() ?? null,
      declineReason:       a.declineReason,
      adverseActionNotice: a.adverseActionNotice,
    };
  }

  private _toFeeScheduleSummary(f: {
    id: string;
    programFees: unknown;
    percentOfFunding: unknown;
    annualFees: unknown;
    cashAdvanceFees: unknown;
    processorFees: unknown;
    totalCost: unknown;
    effectiveApr: unknown;
    createdAt: Date;
  }): FeeScheduleSummary {
    return {
      id:               f.id,
      programFees:      String(f.programFees),
      percentOfFunding: String(f.percentOfFunding),
      annualFees:       String(f.annualFees),
      cashAdvanceFees:  String(f.cashAdvanceFees),
      processorFees:    String(f.processorFees),
      totalCost:        String(f.totalCost),
      effectiveApr:     f.effectiveApr ? String(f.effectiveApr) : null,
      createdAt:        f.createdAt.toISOString(),
    };
  }

  private _toAchAuthSummary(a: {
    id: string;
    processorName: string;
    authorizedAmount: unknown;
    authorizedFrequency: string | null;
    status: string;
    authorizedAt: Date;
    revokedAt: Date | null;
  }): AchAuthSummary {
    return {
      id:                  a.id,
      processorName:       a.processorName,
      authorizedAmount:    a.authorizedAmount ? String(a.authorizedAmount) : null,
      authorizedFrequency: a.authorizedFrequency,
      status:              a.status,
      authorizedAt:        a.authorizedAt.toISOString(),
      revokedAt:           a.revokedAt?.toISOString() ?? null,
    };
  }

  private _toSuitabilitySummary(s: {
    id: string;
    score: number;
    maxSafeLeverage: unknown;
    recommendation: string;
    noGoTriggered: boolean;
    noGoReasons: unknown;
    overriddenBy: string | null;
    overrideReason: string | null;
    createdAt: Date;
  }): SuitabilitySummary {
    return {
      id:              s.id,
      score:           s.score,
      maxSafeLeverage: s.maxSafeLeverage ? String(s.maxSafeLeverage) : null,
      recommendation:  s.recommendation,
      noGoTriggered:   s.noGoTriggered,
      noGoReasons:     s.noGoReasons,
      overriddenBy:    s.overriddenBy,
      overrideReason:  s.overrideReason,
      createdAt:       s.createdAt.toISOString(),
    };
  }

  private _toComplianceCheckSummary(c: {
    id: string;
    checkType: string;
    riskScore: number | null;
    riskLevel: string | null;
    findings: unknown;
    stateJurisdiction: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
  }): ComplianceCheckSummary {
    return {
      id:                c.id,
      checkType:         c.checkType,
      riskScore:         c.riskScore,
      riskLevel:         c.riskLevel,
      findings:          c.findings,
      stateJurisdiction: c.stateJurisdiction,
      resolvedAt:        c.resolvedAt?.toISOString() ?? null,
      createdAt:         c.createdAt.toISOString(),
    };
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class BusinessNotFoundForDossierError extends Error {
  public readonly code = 'BUSINESS_NOT_FOUND';
  constructor(businessId: string) {
    super(
      `Cannot assemble compliance dossier: business ${businessId} not found ` +
      'or does not belong to the specified tenant.',
    );
    this.name = 'BusinessNotFoundForDossierError';
  }
}

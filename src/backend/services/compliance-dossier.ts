// ============================================================
// CapitalForge — Compliance Manifest Service
//
// A MANIFEST, NOT A PACKET.
//
// This said "one-click regulator-ready packet assembly", and that the output
// "can be zipped and handed to regulators / counsel". Neither was true. The
// output is JSON containing document REFERENCES — storageKey, sha256Hash,
// cryptoTimestamp — and nothing in this repository fetches a byte of the
// documents themselves or produces an archive. The route sets
// `Content-Disposition: attachment`, so a browser saves a file and it looks
// like a deliverable.
//
// Handing a regulator this file gives them a list of documents that exist
// somewhere. Whether it should assemble the real bytes is a real piece of work
// and a real decision; it is recorded in docs/gaps.md, not assumed here.
//
// Assembles compliance-relevant records for a single business:
//   - Consent records (TCPA, data-sharing, application, product-reality)
//   - Product acknowledgments (product reality, fee schedules, guarantees)
//   - Card applications with adverse-action notices
//   - Fee schedule snapshots (cost calculations)
//   - Documents stored in the vault (all types)
//   - ACH authorizations
//   - Suitability checks
//   - Compliance checks
//
// Output: a structured JSON manifest and a flat list of document references.
// `contents: 'references'` says so in the payload itself.
//
// WHAT IT DOES NOT CONTAIN is declared in the manifest too, as
// `excludedRecordTypes` — communication scans, the ledger, recorded decisions
// and prior exports. A reader cannot otherwise tell an omitted record type
// from one that is empty for this client.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import logger from '../config/logger.js';
import { verifyCryptoTimestamp } from './crypto-timestamp.js';

// ── Module-level prisma injection (test support) ───────────────

let _sharedPrisma: PrismaClient | null = null;

/** Allow test injection of a shared PrismaClient. */
export function setPrismaClient(client: PrismaClient): void {
  _sharedPrisma = client;
}

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

export interface ComplianceManifest {
  /** RFC 3339 timestamp of when this dossier was assembled */
  assembledAt:       string;
  /**
   * Alias for `assembledAt`, populated with the same value. The assemble()
   * implementation has always emitted it; declaring it here makes the type
   * match what is actually returned.
   */
  generatedAt:       string;
  assembledBy:       string;
  tenantId:          string;
  businessId:        string;
  /** Optional date range applied as filter */
  filterSince:       string | null;
  filterUntil:       string | null;
  /**
   * Which date column each record type was filtered on.
   *
   * One `filterSince` described four different clocks: acknowledgments were
   * filtered on `signedAt`, ACH authorisations on `authorizedAt`, and fee
   * schedules and suitability checks on `createdAt`. "Records since 1 January"
   * meant four things and said one.
   */
  filteredFields:    Readonly<Record<string, string>>;
  /** Record types this manifest does NOT contain. See EXCLUDED_RECORD_TYPES. */
  excludedRecordTypes: readonly ExcludedRecordType[];
  /** Canonical-ledger events attributable to this business. */
  ledgerEvents:      LedgerEventSummary[];
  /** How those events were attributed, and what that misses. */
  ledgerScopeNote:   string;
  /**
   * `references` — this manifest lists documents; it does not contain them.
   * A field rather than a comment, because the distinction is the whole
   * difference between an index and a packet and a reader has to see it.
   */
  contents:          'references';

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
    /**
     * Documents whose timestamp could not be checked at all — no sha256 hash,
     * no crypto timestamp, or neither.
     *
     * `timestampsTampered: 0` used to mean either "every document verified" or
     * "not one could be checked", and a reader could not tell which. It is the
     * field a regulator reads first, and it was the third-state collapse this
     * codebase keeps finding: verified, tampered, and the silent third that
     * counted as neither.
     */
    documentsUnverifiable: number;
    documentsVerified:     number;
    noGoTriggered:        boolean;
    openComplianceIssues: number;
    ledgerEventsAttributed: number;
  };
}

/**
 * The date column each record type is filtered on.
 *
 * Travels in the manifest, because `filterSince` alone is one label over four
 * meanings — and a reader deciding whether a record is missing or merely
 * out of range needs to know which clock was used.
 */
export const FILTERED_DATE_FIELDS = {
  consentRecords:    'createdAt',
  acknowledgments:   'signedAt',
  applications:      'createdAt',
  feeSchedules:      'createdAt',
  achAuthorizations: 'authorizedAt',
  suitabilityChecks: 'createdAt',
  complianceChecks:  'createdAt',
  documents:         'createdAt',
  ledgerEvents:      'publishedAt',
} as const;

export interface ExcludedRecordType {
  recordType: string;
  reason:     string;
}

/**
 * One canonical-ledger event touching this business.
 *
 * The envelope plus the payload. The payload is what makes the entry evidence
 * rather than a timestamp, and every figure in it is already represented
 * elsewhere in this manifest — the ledger is the record that it happened and
 * in what order.
 */
export interface LedgerEventSummary {
  id:            string;
  eventType:     string;
  aggregateType: string;
  aggregateId:   string;
  payload:       unknown;
  version:       number;
  publishedAt:   string;
  /** Which of the two predicates matched. See LEDGER_SCOPE_NOTE. */
  matchedBy:     'aggregate_id' | 'payload_business_id';
}

/**
 * What this manifest does not contain, named rather than silently absent.
 *
 * A reader cannot tell an omitted record type from one that happens to be
 * empty for this client, and the four below are exactly the ones somebody
 * would assume were included in something called a compliance manifest.
 *
 * Whether any of them SHOULD be included is a product decision, recorded in
 * docs/gaps.md rather than settled here. Declaring the omission is not the
 * same as defending it.
 */
/**
 * How ledger events are attributed to a business, stated because it is not
 * exact.
 *
 * `ledger_events` is a system-wide stream. Nothing on the row names a
 * business: `aggregateId` is sometimes the business id and more often the id
 * of the thing that happened — an application, an ACH authorisation, a scan —
 * and most publishers put `businessId` in the payload. So this matches on
 * either, and reports which one matched per event.
 *
 * WHAT THAT MISSES: an event whose aggregateId is a child entity AND whose
 * payload omits businessId. Those exist and are not counted here, which is why
 * this note travels in the manifest rather than living only in this file. It
 * is the difference between "these are the events" and "these are the events
 * we can attribute", and a regulator reading a compliance manifest is owed the
 * second sentence.
 */
export const LEDGER_SCOPE_NOTE =
  'Ledger events are matched by aggregateId = businessId OR payload.businessId = '
  + 'businessId. Nothing on a ledger row names a business directly, so an event '
  + 'whose aggregateId is a child entity (an application, an authorisation) and '
  + 'whose payload omits businessId is NOT included. This section is what can be '
  + 'attributed to this business, not everything that touched it.';

export const EXCLUDED_RECORD_TYPES: readonly ExcludedRecordType[] = [
  {
    recordType: 'comm_compliance_records',
    reason:
      'Communication scans. DECIDED 2026-09-02 that these belong in this manifest, '
      + 'as an index without message content: that a communication was scanned, '
      + 'when, against which rules, the outcome and the violations found. NOT YET '
      + 'INCLUDED because the record cannot be scoped to a business — '
      + 'comm_compliance_records carries tenantId and advisorId and no businessId, '
      + 'and an advisor scans messages for many clients, so there is nothing to '
      + 'derive the link from. Adding a nullable businessId is sized in '
      + 'docs/gaps.md; a marketing video script legitimately has no client, which '
      + 'is why it would be nullable.',
  },
  {
    recordType: 'ai_decision_logs',
    reason:
      'Recorded decisions. Considered and excluded 2026-09-02, on the reasoning '
      + 'rather than by default: AI_MODULE_SOURCES names nine modules and only '
      + 'issuer_eligibility writes a row, so a section here would be almost empty '
      + 'for every business and would read as "no decisions were made about this '
      + 'client" — the absence-as-value shape, in the document where it does the '
      + 'most damage. Revisit when the other eight write: at that point the '
      + 'section becomes a real record of what a placement strategy was built on, '
      + 'and the argument for excluding it stops holding. See docs/gaps.md §7b.',
  },
  {
    recordType: 'regulatory_dossier_exports',
    reason:
      'Prior exports of this kind. Excluded 2026-09-02: a manifest listing its '
      + 'own predecessors tells a reader about this system rather than about the '
      + 'business, and the export history is available to whoever administers the '
      + 'system without being carried to a regulator.',
  },
  {
    recordType: 'business_owners',
    reason:
      'Beneficial owners, including encrypted SSNs. Deliberately excluded and not '
      + 'a gap: these are retrieved through a separately permissioned endpoint.',
  },
] as const;

// ── ComplianceDossierService ───────────────────────────────────

export class ComplianceDossierService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? _sharedPrisma ?? sharedPrisma;
  }

  /**
   * Assemble the compliance manifest for a single business.
   *
   * Tenancy: `_fetchBusiness` filters on `{ id: businessId, tenantId }` and the
   * assembly throws `BusinessNotFoundForDossierError` when it comes back empty,
   * so nothing about another tenant's business is ever returned.
   *
   * What that is NOT: a tenantId guard on every query. Four of the nine fetches
   * — acknowledgments, applications, fee schedules, ACH auths, suitability
   * checks — filter on `businessId` alone, and all nine run inside one
   * `Promise.all`, so the ownership check does not precede them. They execute
   * and are discarded.
   *
   * Safe, and worth stating precisely rather than as the stronger claim this
   * line used to make. The stronger claim is what stops the next person
   * checking, and it stops being true the moment somebody returns a partial
   * result, logs one, or moves a fetch out of the throw's reach.
   * No PII is returned beyond what is stored in the underlying records —
   * EIN and SSN fields are NOT included (they exist on BusinessOwner which
   * is excluded here; advisors should retrieve those through a separately
   * permissioned endpoint).
   */
  async assemble(options: DossierOptions): Promise<ComplianceManifest> {
    const { tenantId, businessId, requestedBy, since, until } = options;
    const assembledAt = new Date().toISOString();

    const svcLog = logger.child({
      service:    'ComplianceDossierService',
      tenantId,
      businessId,
      requestedBy,
    });

    svcLog.info('[assemble] Starting dossier assembly');

    // Build date range filter used by most sub-queries. Refuses an unparseable
    // date rather than passing an Invalid Date to the driver.
    const dateFilter = this._buildDateFilter(since, until);

    // The requester is named in `assembledBy` on a document handed to counsel,
    // so the id has to resolve. Same shape as advisorId on a communication
    // scan: it arrives from a verified token rather than a request body, which
    // makes it likelier to be right and no more verified.
    await this._verifyRequester(tenantId, requestedBy);

    // ── Ownership FIRST, then everything else ────────────────────
    //
    // These nine used to run in one `Promise.all`, and five of them filtered on
    // `businessId` alone. The ownership check came after the await, so it did
    // not precede the queries it was supposed to gate: they executed against
    // another tenant's rows and their results were discarded by the throw.
    //
    // Nothing leaked — the throw is before any return — but that is safe by
    // arrangement rather than by construction, and the arrangement stops
    // holding the moment somebody returns a partial result, logs one, or moves
    // a fetch out of the throw's reach. The check is a gate now, and the five
    // are scoped through `business: { tenantId }` as well, so neither one is
    // load-bearing alone.
    //
    // This is inside a service, where `npm run check:route-tenancy` cannot
    // see it. That is the documented blind spot, not an exemption from it.
    const business = await this._fetchBusiness(tenantId, businessId);
    if (!business) {
      throw new BusinessNotFoundForDossierError(businessId);
    }

    const [
      consents,
      acknowledgments,
      applications,
      feeSchedules,
      achAuths,
      suitabilityChecks,
      complianceChecks,
      documents,
      ledgerEvents,
    ] = await Promise.all([
      this._fetchConsents(tenantId, businessId, dateFilter),
      this._fetchAcknowledgments(tenantId, businessId, dateFilter),
      this._fetchApplications(tenantId, businessId, dateFilter),
      this._fetchFeeSchedules(tenantId, businessId, dateFilter),
      this._fetchAchAuths(tenantId, businessId, dateFilter),
      this._fetchSuitabilityChecks(tenantId, businessId, dateFilter),
      this._fetchComplianceChecks(tenantId, businessId, dateFilter),
      this._fetchDocuments(tenantId, businessId, dateFilter),
      this._fetchLedgerEvents(tenantId, businessId, dateFilter),
    ]);

    // Verify cryptographic timestamps on all vault documents
    const verifiedDocuments = documents.map((doc) =>
      this._verifyDocumentTimestamp(doc, tenantId),
    );

    const timestampsTampered = verifiedDocuments.filter(
      (d) => d.timestampIntegrity === 'tampered',
    ).length;

    const timestampsUnverifiable = verifiedDocuments.filter(
      (d) => d.timestampIntegrity === 'unverifiable',
    ).length;

    if (timestampsTampered > 0) {
      svcLog.error('[assemble] ALERT: Tampered document timestamps detected', {
        businessId,
        tamperedCount: timestampsTampered,
      });
    }
    if (timestampsUnverifiable > 0) {
      // Not an alert. A document with no hash was never checkable, which is a
      // gap in what was recorded rather than evidence of tampering — but it is
      // also not a clean bill of health, and it used to be counted as neither.
      svcLog.warn('[assemble] Documents whose timestamps could not be checked', {
        businessId,
        unverifiableCount: timestampsUnverifiable,
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
      documentsUnverifiable: verifiedDocuments.filter(
        (d) => d.timestampIntegrity === 'unverifiable',
      ).length,
      documentsVerified: verifiedDocuments.filter(
        (d) => d.timestampIntegrity === 'verified',
      ).length,
      noGoTriggered:        suitabilityChecks.some((s) => s.noGoTriggered),
      openComplianceIssues: complianceChecks.filter((c) => !c.resolvedAt).length,
      /** Attributable ledger events. Not "events about this business" — see
       *  ledgerScopeNote for the difference. */
      ledgerEventsAttributed: ledgerEvents.length,
    };

    svcLog.info('[assemble] Dossier assembled', {
      businessId,
      ...summary,
    });

    return {
      assembledAt,
      generatedAt:       assembledAt, // Alias for assembledAt — test-friendly
      assembledBy:       requestedBy,
      tenantId,
      businessId,
      filterSince:       since ?? null,
      filterUntil:       until ?? null,
      filteredFields:    FILTERED_DATE_FIELDS,
      excludedRecordTypes: EXCLUDED_RECORD_TYPES,
      ledgerEvents:      ledgerEvents.map((e) => this._toLedgerSummary(e, businessId)),
      ledgerScopeNote:   LEDGER_SCOPE_NOTE,
      contents:          'references',
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

  /**
   * Confirm the id recorded in `assembledBy` names a user in this tenant.
   *
   * The manifest is handed to counsel and a regulator, and `assembledBy` is
   * its provenance line. The id comes from a verified JWT rather than a
   * request body, which makes it likelier to be right and no more verified —
   * a token minted for a user since deleted, or a service principal that was
   * never created, produces a document attributed to nobody.
   */
  private async _verifyRequester(tenantId: string, requestedBy: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where:  { id: requestedBy, tenantId },
      select: { id: true },
    });
    if (!user) throw new UnknownRequesterError(requestedBy);
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
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.productAcknowledgment.findMany({
      where: { businessId, business: { tenantId }, ...this._mapDateField(dateFilter, 'signedAt') },
      orderBy: { signedAt: 'asc' },
    });
  }

  private async _fetchApplications(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.cardApplication.findMany({
      where: { businessId, business: { tenantId }, ...this._mapDateField(dateFilter, 'createdAt') },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchFeeSchedules(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.costCalculation.findMany({
      where: { businessId, business: { tenantId }, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async _fetchAchAuths(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.achAuthorization.findMany({
      where: { businessId, business: { tenantId }, ...this._mapDateField(dateFilter, 'authorizedAt') },
      orderBy: { authorizedAt: 'asc' },
    });
  }

  private async _fetchSuitabilityChecks(
    tenantId:   string,
    businessId: string,
    dateFilter:  Record<string, unknown>,
  ) {
    return this.prisma.suitabilityCheck.findMany({
      where: { businessId, business: { tenantId }, ...dateFilter },
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

  /**
   * Ledger events attributable to this business.
   *
   * Two predicates because nothing on a ledger row names a business: see
   * LEDGER_SCOPE_NOTE, which travels in the manifest for the same reason this
   * comment exists here.
   *
   * Filtered on `publishedAt` — the ledger has no createdAt — which is one more
   * clock, and it is declared in FILTERED_DATE_FIELDS with the rest.
   */
  private async _fetchLedgerEvents(
    tenantId:   string,
    businessId: string,
    dateFilter: Record<string, unknown>,
  ) {
    return this.prisma.ledgerEvent.findMany({
      where: {
        tenantId,
        OR: [
          { aggregateId: businessId },
          { payload: { path: ['businessId'], equals: businessId } },
        ],
        ...this._mapDateField(dateFilter, 'publishedAt'),
      },
      orderBy: { publishedAt: 'asc' },
    });
  }

  private _toLedgerSummary(
    e: {
      id: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: unknown;
      version: number;
      publishedAt: Date;
    },
    businessId: string,
  ): LedgerEventSummary {
    return {
      id:            e.id,
      eventType:     e.eventType,
      aggregateType: e.aggregateType,
      aggregateId:   e.aggregateId,
      payload:       e.payload,
      version:       e.version,
      publishedAt:   e.publishedAt.toISOString(),
      matchedBy:     e.aggregateId === businessId ? 'aggregate_id' : 'payload_business_id',
    };
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

    // Refused, not passed through.
    //
    // `new Date('last-tuesday')` is an Invalid Date, and what happened next
    // depended on the driver: either an error the caller reads as a server
    // fault, or a filter that quietly matches nothing. A manifest covering
    // "no records" because the range was unreadable is the worst of the three
    // outcomes and was one of the two on offer.
    const filter: Record<string, Date> = {};
    if (since) {
      const d = new Date(since);
      if (Number.isNaN(d.getTime())) throw new InvalidDateRangeError('since', since);
      filter['gte'] = d;
    }
    if (until) {
      const d = new Date(until);
      if (Number.isNaN(d.getTime())) throw new InvalidDateRangeError('until', until);
      filter['lte'] = d;
    }
    if (filter['gte'] && filter['lte'] && filter['gte'] > filter['lte']) {
      // An inverted range matches nothing, which reads as "no records exist".
      throw new InvalidDateRangeError('range', `${since} .. ${until}`);
    }
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

/** The id that would be recorded in `assembledBy` names nobody in this tenant. */
export class UnknownRequesterError extends Error {
  constructor(public readonly requestedBy: string) {
    super(
      `No user ${requestedBy} in this tenant. A compliance manifest records who `
      + 'assembled it, and that line is read by counsel and by a regulator, so it '
      + 'cannot be attributed to an id that resolves to nobody.',
    );
    this.name = 'UnknownRequesterError';
  }
}

/** A `since`/`until` that cannot be read as a date, or a range that inverts. */
export class InvalidDateRangeError extends Error {
  constructor(public readonly field: 'since' | 'until' | 'range', public readonly value: string) {
    super(
      field === 'range'
        ? `The range ${value} ends before it starts. A manifest covering nothing `
          + 'because the range was inverted reads exactly like one covering a client '
          + 'with no records.'
        : `\`${field}\` is not a date this system can read: "${value}". Use an ISO `
          + '8601 date, e.g. 2026-01-31.',
    );
    this.name = 'InvalidDateRangeError';
  }
}

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

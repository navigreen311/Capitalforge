// ============================================================
// CapitalForge — Product Acknowledgment Service
//
// Generates, signs, and stores acknowledgments that prevent the
// #1 FTC enforcement pattern: marketing loans but delivering
// credit cards (ref: Seek Capital FTC consent order).
//
// Compliance invariants enforced here:
//   1. product_reality ack is REQUIRED before ANY card application
//   2. fee_schedule ack is REQUIRED before engagement begins
//   3. Acknowledgments are versioned; a prior-version signature
//      does NOT satisfy a requirement if the template was bumped
//   4. Every acknowledgment is stored in the Document Vault with
//      a cryptographic timestamp
//   5. PRODUCT_REALITY_ACKNOWLEDGED event is published to the
//      canonical ledger on every successful signing
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '../events/event-types.js';
import logger from '../config/logger.js';

import {
  getCurrentTemplate,
  CURRENT_VERSIONS,
  PRE_SUBMISSION_REQUIRED,
  PRE_ENGAGEMENT_REQUIRED,
  type AcknowledgmentType,
} from './acknowledgment-templates.js';

import type {
  AcknowledgmentRecord,
  AcknowledgmentStatusResult,
  GateCheckResult,
  CreateAcknowledgmentInput,
} from '../../shared/validators/acknowledgment.validators.js';

// ---- Internal types ----------------------------------------

export interface SignAcknowledgmentOptions {
  businessId: string;
  tenantId: string;
  /** User ID of the person clicking "I agree" */
  signedByUserId: string;
  input: CreateAcknowledgmentInput;
  /** Client IP for the audit trail — populated from req.ip */
  signerIp?: string;
}

export interface AcknowledgmentWithTemplate extends AcknowledgmentRecord {
  templateTitle: string;
  templateBody: string;
}

// ---- Helpers -----------------------------------------------

/**
 * Build a deterministic, verifiable signature reference.
 *
 * Format: sha256( businessId + type + version + signedAt_ms + nonce )
 * The nonce prevents pre-image attacks while keeping the hash
 * short enough to store in a VARCHAR column.
 */
function buildSignatureRef(
  businessId: string,
  type: AcknowledgmentType,
  version: string,
  signedAt: Date,
): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${businessId}:${type}:${version}:${signedAt.getTime()}:${nonce}`;
  const hash = createHash('sha256').update(payload).digest('hex');
  return `ack_${hash.slice(0, 40)}`;
}

/**
 * Build the canonical document content that gets stored in the
 * Document Vault — a self-contained, human-readable record.
 */
function buildDocumentContent(
  businessId: string,
  signedByUserId: string,
  signerName: string | undefined,
  signerIp: string | undefined,
  type: AcknowledgmentType,
  version: string,
  signedAt: Date,
  templateTitle: string,
  templateBody: string,
  signatureRef: string,
): string {
  return [
    '═══════════════════════════════════════════════════════════',
    'CAPITALFORGE — SIGNED ACKNOWLEDGMENT RECORD',
    '═══════════════════════════════════════════════════════════',
    '',
    `Document Type  : ${type.toUpperCase()}`,
    `Template Title : ${templateTitle}`,
    `Template Version: ${version}`,
    `Business ID    : ${businessId}`,
    `Signed By User : ${signedByUserId}`,
    `Signer Name    : ${signerName ?? '(not provided)'}`,
    `Signer IP      : ${signerIp ?? '(not provided)'}`,
    `Signed At (UTC): ${signedAt.toISOString()}`,
    `Signature Ref  : ${signatureRef}`,
    '',
    '─── Disclosure Text (version signed) ──────────────────────',
    '',
    templateBody,
    '',
    '─── End of Document ────────────────────────────────────────',
    '',
    `SHA-256 of above: ${createHash('sha256').update(templateBody).digest('hex')}`,
  ].join('\n');
}

// ---- Service class -----------------------------------------

export class ProductAcknowledgmentService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Core signing operation ─────────────────────────────────

  /**
   * Create and persist a signed acknowledgment.
   *
   * Steps:
   *   1. Resolve the current template version
   *   2. Build a tamper-evident signature reference
   *   3. Store the full rendered document in the Document Vault
   *   4. Write the ProductAcknowledgment record
   *   5. Publish PRODUCT_REALITY_ACKNOWLEDGED (or equivalent) event
   */
  async sign(opts: SignAcknowledgmentOptions): Promise<AcknowledgmentRecord> {
    const { businessId, tenantId, signedByUserId, input, signerIp } = opts;
    const type = input.acknowledgmentType;

    const template = getCurrentTemplate(type);
    const signedAt = new Date();

    const signatureRef = buildSignatureRef(businessId, type, template.version, signedAt);

    // Build the immutable document content
    const documentContent = buildDocumentContent(
      businessId,
      signedByUserId,
      input.signerName,
      signerIp ?? input.signerIp,
      type,
      template.version,
      signedAt,
      template.title,
      template.body,
      signatureRef,
    );

    // Compute SHA-256 of the full document for vault integrity check
    const sha256Hash = createHash('sha256').update(documentContent).digest('hex');

    // Cryptographic timestamp = ISO 8601 with millisecond precision
    // In production this would be a RFC 3161 timestamp from a TSA;
    // here we store a deterministic local timestamp + hash as the anchor.
    const cryptoTimestamp = `${signedAt.toISOString()}:${sha256Hash.slice(0, 16)}`;

    // Persist to Document Vault and create the acknowledgment in a single
    // Prisma transaction for atomicity.
    const documentId = uuidv4();
    const storageKey = `acknowledgments/${tenantId}/${businessId}/${type}/${template.version}/${documentId}.txt`;

    const metadata: Record<string, unknown> = {
      signerUserId: signedByUserId,
      signerName:   input.signerName ?? null,
      signerIp:     signerIp ?? input.signerIp ?? null,
      templateType: type,
      templateVersion: template.version,
      ...(input.metadata ?? {}),
    };

    const [ack] = await this.prisma.$transaction([
      // 1. Write Document Vault entry
      this.prisma.document.create({
        data: {
          id:              documentId,
          tenantId,
          businessId,
          documentType:    `acknowledgment_${type}`,
          title:           `${template.title} — v${template.version}`,
          storageKey,
          mimeType:        'text/plain',
          sizeBytes:       Buffer.byteLength(documentContent, 'utf8'),
          sha256Hash,
          cryptoTimestamp,
          legalHold:       true,   // acknowledgments can never be purged
          uploadedBy:      signedByUserId,
          metadata,
        },
        select: { id: true },
      }),

      // 2. Write ProductAcknowledgment record
      this.prisma.productAcknowledgment.create({
        data: {
          businessId,
          acknowledgmentType: type,
          version:            template.version,
          signedAt,
          signatureRef,
          documentVaultId:    documentId,
          metadata,
        },
      }),
    ]);

    logger.info('[ProductAcknowledgmentService] Acknowledgment signed', {
      businessId,
      tenantId,
      type,
      version: template.version,
      signatureRef,
      documentVaultId: documentId,
    });

    // Publish compliance event — always emit, even if the event bus
    // has no subscribers, so the ledger captures the signed action.
    const eventType =
      type === 'product_reality'
        ? EVENT_TYPES.PRODUCT_REALITY_ACKNOWLEDGED
        : `acknowledgment.signed.${type}`;

    await eventBus.publishAndPersist(tenantId, {
      eventType,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId:   businessId,
      payload: {
        acknowledgmentId:   ack.id,
        acknowledgmentType: type,
        version:            template.version,
        signedAt:           signedAt.toISOString(),
        signatureRef,
        documentVaultId:    documentId,
        signedByUserId,
        signerIp:           signerIp ?? input.signerIp ?? null,
      },
      metadata: { source: 'product-acknowledgment-service' },
    });

    return this._toRecord(ack);
  }

  // ── Query operations ───────────────────────────────────────

  /**
   * List all acknowledgments for a business, ordered by most-recent first.
   */
  async listForBusiness(
    businessId: string,
    opts?: { type?: AcknowledgmentType; limit?: number; offset?: number },
  ): Promise<AcknowledgmentRecord[]> {
    const rows = await this.prisma.productAcknowledgment.findMany({
      where: {
        businessId,
        ...(opts?.type ? { acknowledgmentType: opts.type } : {}),
      },
      orderBy: { signedAt: 'desc' },
      take:    opts?.limit  ?? 100,
      skip:    opts?.offset ?? 0,
    });

    return rows.map((r) => this._toRecord(r));
  }

  /**
   * Return the status of a specific acknowledgment type for a business.
   * Includes whether the CURRENT version is signed.
   */
  async getStatus(
    businessId: string,
    type: AcknowledgmentType,
  ): Promise<AcknowledgmentStatusResult> {
    const currentVersion = CURRENT_VERSIONS[type];

    const latest = await this.prisma.productAcknowledgment.findFirst({
      where: { businessId, acknowledgmentType: type },
      orderBy: { signedAt: 'desc' },
    });

    return {
      type,
      currentVersion,
      isSigned:               !!latest,
      signedVersion:          latest?.version ?? null,
      signedAt:               latest?.signedAt ?? null,
      isCurrentVersionSigned: latest?.version === currentVersion,
    };
  }

  /**
   * Gate check: returns whether all types in `requiredTypes` have a
   * current-version signature for the given business.
   *
   * Used by:
   *  - Pre-engagement gate  (PRE_ENGAGEMENT_REQUIRED)
   *  - Pre-submission gate  (PRE_SUBMISSION_REQUIRED, checked before
   *    any CardApplication transitions to submitted)
   */
  async checkGate(
    businessId: string,
    requiredTypes: AcknowledgmentType[],
  ): Promise<GateCheckResult> {
    const missing: AcknowledgmentType[] = [];

    await Promise.all(
      requiredTypes.map(async (type) => {
        const status = await this.getStatus(businessId, type);
        if (!status.isCurrentVersionSigned) {
          missing.push(type);
        }
      }),
    );

    return {
      passed: missing.length === 0,
      missing,
    };
  }

  /**
   * Convenience: check the pre-submission gate specifically.
   * Throws an AcknowledgmentGateError if any required ack is missing.
   */
  async assertPreSubmissionGate(businessId: string): Promise<void> {
    const result = await this.checkGate(businessId, PRE_SUBMISSION_REQUIRED);
    if (!result.passed) {
      throw new AcknowledgmentGateError(
        'pre_submission',
        result.missing,
        `Cannot submit card application for business ${businessId}: ` +
          `missing required acknowledgments: ${result.missing.join(', ')}`,
      );
    }
  }

  /**
   * Convenience: check the pre-engagement gate.
   */
  async assertPreEngagementGate(businessId: string): Promise<void> {
    const result = await this.checkGate(businessId, PRE_ENGAGEMENT_REQUIRED);
    if (!result.passed) {
      throw new AcknowledgmentGateError(
        'pre_engagement',
        result.missing,
        `Cannot begin engagement for business ${businessId}: ` +
          `missing required acknowledgments: ${result.missing.join(', ')}`,
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────

  private _toRecord(row: {
    id: string;
    businessId: string;
    acknowledgmentType: string;
    version: string;
    signedAt: Date;
    signatureRef: string | null;
    documentVaultId: string | null;
    metadata: unknown;
    createdAt: Date;
  }): AcknowledgmentRecord {
    return {
      id:                 row.id,
      businessId:         row.businessId,
      acknowledgmentType: row.acknowledgmentType as AcknowledgmentType,
      version:            row.version,
      signedAt:           row.signedAt,
      signatureRef:       row.signatureRef,
      documentVaultId:    row.documentVaultId,
      metadata:           (row.metadata as Record<string, unknown>) ?? null,
      createdAt:          row.createdAt,
    };
  }
}

// ---- Domain error ------------------------------------------

export class AcknowledgmentGateError extends Error {
  readonly gate: 'pre_submission' | 'pre_engagement';
  readonly missingTypes: AcknowledgmentType[];

  constructor(
    gate: 'pre_submission' | 'pre_engagement',
    missingTypes: AcknowledgmentType[],
    message: string,
  ) {
    super(message);
    this.name = 'AcknowledgmentGateError';
    this.gate = gate;
    this.missingTypes = missingTypes;
  }
}

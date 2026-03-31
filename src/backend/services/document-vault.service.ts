// ============================================================
// CapitalForge — Document Vault Service
//
// Responsibilities:
//   - Upload documents with cryptographic SHA-256 hashing
//   - Store document metadata in Postgres (Document table)
//   - Stub S3-compatible object storage (replace PutObject with
//     real AWS SDK / MinIO / GCS calls in production)
//   - Retrieve documents with presigned URL stubs
//   - Search / list documents with tenant-scoped filters
//   - Legal hold: prevent deletion by any actor
//   - Auto-file documents from other modules
//   - Publish DOCUMENT_UPLOADED events to the EventBus
//   - Mask PII in all metadata logs
//
// STORAGE STUB: storageKey is stored as-is. In production wiring:
//   import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
//   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// Replace the stub functions below with those SDK calls.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { EventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger, { maskPii } from '../config/logger.js';
import { hashContent, generateCryptoTimestamp } from './crypto-timestamp.js';

// ── Types ──────────────────────────────────────────────────────

/** All document types recognised by the vault. */
export type DocumentType =
  | 'consent_form'
  | 'acknowledgment'
  | 'application'
  | 'disclosure'
  | 'adverse_action'
  | 'contract'
  | 'statement'
  | 'receipt';

export interface UploadDocumentInput {
  tenantId:    string;
  businessId?: string;
  uploadedBy?: string;
  documentType: DocumentType;
  title:       string;
  mimeType?:   string;
  /** Raw file content as a Buffer */
  content:     Buffer;
  /** Arbitrary metadata tags — PII fields must NOT be included */
  metadata?:   Record<string, unknown>;
}

export interface DocumentRecord {
  id:               string;
  tenantId:         string;
  businessId:       string | null;
  documentType:     string;
  title:            string;
  storageKey:       string;
  mimeType:         string | null;
  sizeBytes:        number | null;
  sha256Hash:       string | null;
  cryptoTimestamp:  string | null;
  legalHold:        boolean;
  metadata:         unknown;
  uploadedBy:       string | null;
  createdAt:        Date;
}

export interface ListDocumentsFilter {
  tenantId:      string;
  businessId?:   string;
  documentType?: DocumentType;
  legalHold?:    boolean;
  /** ISO string — only documents created on or after this date */
  since?:        string;
  page?:         number;
  pageSize?:     number;
}

export interface ListDocumentsResult {
  documents: DocumentRecord[];
  total:     number;
  page:      number;
  pageSize:  number;
}

export interface RetrieveResult {
  document:    DocumentRecord;
  /** Presigned URL stub — replace with real AWS SDK getSignedUrl in production */
  presignedUrl: string;
  /** Unix epoch (seconds) when presigned URL expires */
  expiresAt:   number;
}

// ── S3-Compatible Storage Stub ─────────────────────────────────
// These functions represent the storage I/O layer.
// Replace with real SDK calls without changing any callers.

const S3_BUCKET = process.env.DOCUMENT_VAULT_BUCKET ?? 'capitalforge-documents';
const S3_REGION = process.env.AWS_REGION ?? 'us-east-1';
const PRESIGN_TTL_SECONDS = 900; // 15 minutes

/**
 * Build the canonical S3 object key for a document.
 * Namespace: <tenantId>/<businessId|_shared>/<docType>/<documentId>/<filename>
 */
function buildStorageKey(
  tenantId:    string,
  businessId:  string | undefined,
  documentType: string,
  documentId:  string,
  title:       string,
): string {
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 64);
  const scope = businessId ?? '_shared';
  return `${tenantId}/${scope}/${documentType}/${documentId}/${safeTitle}`;
}

/**
 * STUB: Upload content to S3-compatible storage.
 * In production replace with:
 *   await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, Metadata }))
 */
async function stubS3Put(
  key:     string,
  content: Buffer,
  mime:    string,
): Promise<void> {
  // No-op stub — logs what would be sent
  logger.debug('[DocumentVault:S3Stub] PutObject', {
    bucket:      S3_BUCKET,
    key,
    sizeBytes:   content.length,
    contentType: mime,
  });
}

/**
 * STUB: Generate a presigned GET URL.
 * In production replace with:
 *   return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn })
 */
function stubPresignedUrl(key: string): string {
  // Deterministic stub URL — safe for testing and development
  const encoded = encodeURIComponent(key);
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encoded}?X-Amz-Expires=${PRESIGN_TTL_SECONDS}&X-Amz-Stub=true`;
}

// ── DocumentVaultService ───────────────────────────────────────

export class DocumentVaultService {
  private readonly prisma:    PrismaClient;
  private readonly eventBus:  EventBus;

  constructor(prisma?: PrismaClient, eventBus?: EventBus) {
    this.prisma   = prisma    ?? new PrismaClient();
    this.eventBus = eventBus  ?? EventBus.getInstance();
  }

  // ── Upload ─────────────────────────────────────────────────

  /**
   * Upload a document to the vault.
   *
   * Steps:
   *   1. Compute SHA-256 content hash — immutable fingerprint
   *   2. Create a stub Document row to get an ID
   *   3. Build storage key and upload to S3 stub
   *   4. Generate cryptographic timestamp binding hash + time + tenant + id
   *   5. Finalize Document row with all fields
   *   6. Publish DOCUMENT_UPLOADED event
   */
  async upload(input: UploadDocumentInput): Promise<DocumentRecord> {
    const svcLog = logger.child({
      service:      'DocumentVaultService',
      tenantId:     input.tenantId,
      documentType: input.documentType,
    });

    // 1. Content hash — computed before any storage operation
    const sha256Hash = hashContent(input.content);
    const sizeBytes  = input.content.length;
    const timestamp  = new Date().toISOString();
    const mimeType   = input.mimeType ?? 'application/octet-stream';

    svcLog.debug('[upload] Hashed content', {
      sizeBytes,
      sha256Hash,
    });

    // 2. Create placeholder row to obtain auto-assigned UUID
    const placeholder = await this.prisma.document.create({
      data: {
        tenantId:     input.tenantId,
        businessId:   input.businessId ?? null,
        documentType: input.documentType,
        title:        input.title,
        storageKey:   '__pending__', // updated below
        mimeType,
        sizeBytes,
        sha256Hash,
        cryptoTimestamp: null,       // updated below
        legalHold:    false,
        metadata:     this._sanitiseMetadata(input.metadata ?? {}),
        uploadedBy:   input.uploadedBy ?? null,
      },
    });

    // 3. Build key and upload
    const storageKey = buildStorageKey(
      input.tenantId,
      input.businessId,
      input.documentType,
      placeholder.id,
      input.title,
    );

    await stubS3Put(storageKey, input.content, mimeType);

    // 4. Cryptographic timestamp — binds content + time + tenant + id
    const tsRecord = generateCryptoTimestamp({
      contentHash: sha256Hash,
      timestamp,
      tenantId:    input.tenantId,
      documentId:  placeholder.id,
    });

    // 5. Finalize row
    const document = await this.prisma.document.update({
      where: { id: placeholder.id },
      data: {
        storageKey,
        cryptoTimestamp: tsRecord.token,
      },
    });

    svcLog.info('[upload] Document stored', {
      documentId:   document.id,
      documentType: document.documentType,
      // sha256Hash logged at debug level only — not PII but can be sensitive
      sizeBytes,
    });

    // 6. Publish event — PII-free payload
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType:     EVENT_TYPES.DOCUMENT_UPLOADED,
      aggregateType: AGGREGATE_TYPES.DOCUMENT,
      aggregateId:   document.id,
      payload: {
        documentId:   document.id,
        documentType: document.documentType,
        businessId:   document.businessId ?? null,
        title:        document.title,
        sizeBytes:    document.sizeBytes,
        uploadedBy:   document.uploadedBy ?? null,
      },
      metadata: {
        sha256Hash,
        cryptoTimestampVersion: tsRecord.version,
        timestampedAt:          timestamp,
      },
    });

    return this._toDocumentRecord(document);
  }

  // ── List ───────────────────────────────────────────────────

  /** List documents for a tenant, with optional filters and pagination. */
  async list(filter: ListDocumentsFilter): Promise<ListDocumentsResult> {
    const page     = Math.max(1, filter.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const where = this._buildWhereClause(filter);

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:  pageSize,
        skip,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      documents: documents.map((d) => this._toDocumentRecord(d)),
      total,
      page,
      pageSize,
    };
  }

  // ── Retrieve ───────────────────────────────────────────────

  /**
   * Retrieve a single document by ID with a presigned URL.
   * Tenant-scoped — throws if document belongs to a different tenant.
   */
  async retrieve(documentId: string, tenantId: string): Promise<RetrieveResult> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    const presignedUrl = stubPresignedUrl(document.storageKey);
    const expiresAt    = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;

    return {
      document:    this._toDocumentRecord(document),
      presignedUrl,
      expiresAt,
    };
  }

  // ── Legal Hold ─────────────────────────────────────────────

  /**
   * Toggle legal hold status on a document.
   *
   * When legalHold === true:
   *   - The document cannot be deleted by any actor, including admins.
   *   - A DOCUMENT_UPLOADED event is NOT re-emitted (hold is a state change).
   *
   * Returns the updated document record.
   */
  async setLegalHold(
    documentId:  string,
    tenantId:    string,
    hold:        boolean,
    requestedBy: string,
  ): Promise<DocumentRecord> {
    const existing = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!existing) {
      throw new DocumentNotFoundError(documentId);
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        legalHold: hold,
        metadata: {
          // Preserve existing metadata, add hold audit trail
          ...(typeof existing.metadata === 'object' && existing.metadata !== null
            ? (existing.metadata as Record<string, unknown>)
            : {}),
          legalHoldSetAt: hold ? new Date().toISOString() : null,
          legalHoldSetBy: hold ? requestedBy : null,
          legalHoldRemovedAt: !hold ? new Date().toISOString() : undefined,
          legalHoldRemovedBy: !hold ? requestedBy : undefined,
        },
      },
    });

    logger.info('[DocumentVault] Legal hold toggled', {
      documentId,
      tenantId,
      legalHold: hold,
      // requestedBy is a userId — not PII in this context
      requestedBy,
    });

    return this._toDocumentRecord(updated);
  }

  // ── Deletion guard ─────────────────────────────────────────

  /**
   * Delete a document — hard-blocked when legal hold is active.
   * Returns true on success, throws DocumentOnLegalHoldError when blocked.
   */
  async delete(
    documentId: string,
    tenantId:   string,
    deletedBy:  string,
  ): Promise<boolean> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    if (document.legalHold) {
      throw new DocumentOnLegalHoldError(documentId);
    }

    await this.prisma.document.delete({ where: { id: documentId } });

    logger.info('[DocumentVault] Document deleted', {
      documentId,
      tenantId,
      deletedBy,
    });

    return true;
  }

  // ── Auto-file ──────────────────────────────────────────────

  /**
   * Auto-file a document from another module.
   * Convenience wrapper that sets metadata from the source module.
   *
   * @param sourceModule  e.g. 'consent', 'application', 'ach'
   * @param sourceId      ID of the source record
   */
  async autoFile(
    input: UploadDocumentInput & { sourceModule: string; sourceId: string },
  ): Promise<DocumentRecord> {
    const enrichedMetadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      autoFiled:    true,
      sourceModule: input.sourceModule,
      sourceId:     input.sourceId,
      autoFiledAt:  new Date().toISOString(),
    };

    return this.upload({ ...input, metadata: enrichedMetadata });
  }

  // ── Private helpers ────────────────────────────────────────

  /** Build Prisma where clause from filter — always tenant-scoped. */
  private _buildWhereClause(filter: ListDocumentsFilter) {
    const where: Record<string, unknown> = {
      tenantId: filter.tenantId,
    };

    if (filter.businessId   !== undefined) where['businessId']   = filter.businessId;
    if (filter.documentType !== undefined) where['documentType'] = filter.documentType;
    if (filter.legalHold    !== undefined) where['legalHold']    = filter.legalHold;

    if (filter.since) {
      where['createdAt'] = { gte: new Date(filter.since) };
    }

    return where;
  }

  /**
   * Strip any fields that could carry PII before persisting metadata.
   * This is a defence-in-depth layer — callers should not pass PII,
   * but we scrub known sensitive keys here as a safety net.
   */
  private _sanitiseMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitised = maskPii(metadata) as Record<string, unknown>;
    return sanitised;
  }

  private _toDocumentRecord(row: {
    id:              string;
    tenantId:        string;
    businessId:      string | null;
    documentType:    string;
    title:           string;
    storageKey:      string;
    mimeType:        string | null;
    sizeBytes:       number | null;
    sha256Hash:      string | null;
    cryptoTimestamp: string | null;
    legalHold:       boolean;
    metadata:        unknown;
    uploadedBy:      string | null;
    createdAt:       Date;
  }): DocumentRecord {
    return {
      id:              row.id,
      tenantId:        row.tenantId,
      businessId:      row.businessId,
      documentType:    row.documentType,
      title:           row.title,
      storageKey:      row.storageKey,
      mimeType:        row.mimeType,
      sizeBytes:       row.sizeBytes,
      sha256Hash:      row.sha256Hash,
      cryptoTimestamp: row.cryptoTimestamp,
      legalHold:       row.legalHold,
      metadata:        row.metadata,
      uploadedBy:      row.uploadedBy,
      createdAt:       row.createdAt,
    };
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class DocumentNotFoundError extends Error {
  public readonly code = 'DOCUMENT_NOT_FOUND';
  constructor(documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentOnLegalHoldError extends Error {
  public readonly code = 'DOCUMENT_ON_LEGAL_HOLD';
  constructor(documentId: string) {
    super(
      `Document ${documentId} is under legal hold and cannot be deleted. ` +
      'Remove the legal hold via PUT /api/documents/:id/legal-hold before deleting.',
    );
    this.name = 'DocumentOnLegalHoldError';
  }
}

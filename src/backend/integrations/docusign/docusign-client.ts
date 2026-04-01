// ============================================================
// CapitalForge — DocuSign Client
//
// Responsibilities:
//   - JWT (service account) authentication flow against DocuSign OAuth
//   - createEnvelope: from templateId or custom recipients/docs
//   - sendForSignature: transition envelope to sent status
//   - getEnvelopeStatus: poll/fetch current envelope status
//   - downloadSignedDocument: retrieve completed PDF bytes
//   - voidEnvelope: cancel an in-flight envelope
//   - Auto-file completed envelopes to the Document Vault
//
// STUB NOTE: All HTTP calls are stubbed at the adapter layer.
// Replace stub* functions with real docusign-esign SDK calls:
//   import docusign from 'docusign-esign';
//   const apiClient = new docusign.ApiClient();
//   apiClient.setBasePath(BASE_PATH);
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';
import { DocumentVaultService } from '../../services/document-vault.service.js';
import { EventBus } from '../../events/event-bus.js';

// ── Environment ───────────────────────────────────────────────

const DOCUSIGN_BASE_URL   = process.env['DOCUSIGN_BASE_URL']   ?? 'https://demo.docusign.net/restapi';
const DOCUSIGN_ACCOUNT_ID = process.env['DOCUSIGN_ACCOUNT_ID'] ?? 'demo-account-id';
const DOCUSIGN_INTEGRATION_KEY = process.env['DOCUSIGN_INTEGRATION_KEY'] ?? '';
const DOCUSIGN_USER_ID    = process.env['DOCUSIGN_USER_ID']    ?? '';
const DOCUSIGN_PRIVATE_KEY = process.env['DOCUSIGN_PRIVATE_KEY'] ?? '';

const TOKEN_EXPIRY_BUFFER_SECONDS = 60; // refresh token 60s before expiry

// ── Types ─────────────────────────────────────────────────────

export type EnvelopeStatus =
  | 'created'
  | 'sent'
  | 'delivered'
  | 'signed'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'deleted';

export interface DocuSignRecipient {
  email:      string;
  name:       string;
  recipientId?: string;
  /** Signing order (1-based). Defaults to 1. */
  routingOrder?: number;
  /** Custom tabs / fields to prefill on the doc */
  tabs?: Record<string, unknown>;
}

export interface DocuSignDocument {
  /** Base64-encoded document bytes */
  documentBase64: string;
  name:       string;
  fileExtension: 'pdf' | 'docx' | 'html';
  documentId: string;
}

export interface CreateEnvelopeInput {
  tenantId:    string;
  businessId?: string;
  /** If provided, DocuSign template is used; documents is ignored */
  templateId?: string;
  /** Required when templateId is not provided */
  documents?:  DocuSignDocument[];
  recipients:  DocuSignRecipient[];
  emailSubject: string;
  emailBlurb?:  string;
  /** If true, sends immediately; otherwise creates as draft */
  sendNow?:    boolean;
  /** Arbitrary metadata stored alongside envelope record */
  metadata?:   Record<string, unknown>;
}

export interface EnvelopeRecord {
  envelopeId:   string;
  tenantId:     string;
  businessId:   string | null;
  status:       EnvelopeStatus;
  emailSubject: string;
  templateId:   string | null;
  sentAt:       string | null;
  completedAt:  string | null;
  voidedAt:     string | null;
  voidedReason: string | null;
  metadata:     Record<string, unknown>;
  createdAt:    string;
}

export interface VoidEnvelopeInput {
  envelopeId:   string;
  tenantId:     string;
  voidedReason: string;
}

export interface DownloadResult {
  envelopeId:  string;
  documentId:  string;
  fileName:    string;
  contentType: string;
  /** Raw PDF bytes */
  content:     Buffer;
}

// ── JWT Token Cache ────────────────────────────────────────────

interface CachedToken {
  accessToken: string;
  expiresAt:   number; // Unix epoch (seconds)
}

let _tokenCache: CachedToken | null = null;

// ── Stub: JWT Auth Flow ────────────────────────────────────────
// In production: use docusign-esign ApiClient.requestJWTUserToken()
// or requestJWTApplicationToken(), passing the RSA private key.

async function stubGetAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (_tokenCache && _tokenCache.expiresAt - now > TOKEN_EXPIRY_BUFFER_SECONDS) {
    logger.debug('[DocuSignClient] Using cached JWT token');
    return _tokenCache.accessToken;
  }

  // Simulate JWT grant flow
  logger.debug('[DocuSignClient:JWT] Requesting new token', {
    integrationKey: DOCUSIGN_INTEGRATION_KEY ? '[SET]' : '[MISSING]',
    userId: DOCUSIGN_USER_ID ? '[SET]' : '[MISSING]',
    privateKey: DOCUSIGN_PRIVATE_KEY ? '[SET]' : '[MISSING]',
  });

  // STUB: production replacement:
  //   const apiClient = new docusign.ApiClient({ basePath: DOCUSIGN_BASE_URL });
  //   const results = await apiClient.requestJWTUserToken(
  //     DOCUSIGN_INTEGRATION_KEY,
  //     DOCUSIGN_USER_ID,
  //     ['signature', 'impersonation'],
  //     Buffer.from(DOCUSIGN_PRIVATE_KEY),
  //     3600,
  //   );
  //   const { access_token, expires_in } = results.body;
  const access_token = `stub-jwt-${uuidv4()}`;
  const expires_in   = 3600;

  _tokenCache = { accessToken: access_token, expiresAt: now + expires_in };

  logger.info('[DocuSignClient:JWT] Token obtained', { expiresIn: expires_in });
  return access_token;
}

// ── In-Memory Envelope Store (replace with Prisma in production) ─

const _envelopes = new Map<string, EnvelopeRecord>();

// ── Stub: DocuSign API Adapters ────────────────────────────────

async function stubCreateEnvelopeApi(
  _token:  string,
  input:   CreateEnvelopeInput,
): Promise<{ envelopeId: string; status: EnvelopeStatus }> {
  const envelopeId = `env-${uuidv4()}`;
  const status: EnvelopeStatus = input.sendNow ? 'sent' : 'created';

  logger.debug('[DocuSignClient:API] createEnvelope (stub)', {
    envelopeId,
    templateId: input.templateId ?? null,
    recipientCount: input.recipients.length,
    documentCount:  input.documents?.length ?? 0,
    sendNow: input.sendNow ?? false,
  });

  // STUB: production replacement:
  //   const envelopesApi = new docusign.EnvelopesApi(apiClient);
  //   const def = { ...(templateId ? { templateId } : { documents, recipients }), status, emailSubject };
  //   const result = await envelopesApi.createEnvelope(DOCUSIGN_ACCOUNT_ID, { envelopeDefinition: def });
  //   return { envelopeId: result.envelopeId, status: result.status };

  return { envelopeId, status };
}

async function stubSendEnvelopeApi(
  _token:     string,
  envelopeId: string,
): Promise<EnvelopeStatus> {
  logger.debug('[DocuSignClient:API] sendEnvelope (stub)', { envelopeId });

  // STUB: production replacement:
  //   const envelopesApi = new docusign.EnvelopesApi(apiClient);
  //   await envelopesApi.update(DOCUSIGN_ACCOUNT_ID, envelopeId, {
  //     envelope: { status: 'sent' },
  //   });

  return 'sent';
}

async function stubGetEnvelopeStatusApi(
  _token:     string,
  envelopeId: string,
): Promise<{ status: EnvelopeStatus; completedAt: string | null }> {
  logger.debug('[DocuSignClient:API] getEnvelopeStatus (stub)', { envelopeId });

  // STUB: production replacement:
  //   const envelopesApi = new docusign.EnvelopesApi(apiClient);
  //   const envelope = await envelopesApi.getEnvelope(DOCUSIGN_ACCOUNT_ID, envelopeId);
  //   return { status: envelope.status, completedAt: envelope.completedDateTime ?? null };

  const existing = _envelopes.get(envelopeId);
  const status   = (existing?.status ?? 'sent') as EnvelopeStatus;
  return { status, completedAt: null };
}

async function stubDownloadDocumentApi(
  _token:     string,
  envelopeId: string,
  documentId: string,
): Promise<Buffer> {
  logger.debug('[DocuSignClient:API] downloadDocument (stub)', { envelopeId, documentId });

  // STUB: production replacement:
  //   const envelopesApi = new docusign.EnvelopesApi(apiClient);
  //   const stream = await envelopesApi.getDocument(DOCUSIGN_ACCOUNT_ID, envelopeId, documentId);
  //   return Buffer.from(stream);

  return Buffer.from(`%PDF-1.4 stub-signed-document envelope=${envelopeId} doc=${documentId}`);
}

async function stubVoidEnvelopeApi(
  _token:     string,
  envelopeId: string,
  reason:     string,
): Promise<void> {
  logger.debug('[DocuSignClient:API] voidEnvelope (stub)', { envelopeId, reason });

  // STUB: production replacement:
  //   const envelopesApi = new docusign.EnvelopesApi(apiClient);
  //   await envelopesApi.update(DOCUSIGN_ACCOUNT_ID, envelopeId, {
  //     envelope: { status: 'voided', voidedReason: reason },
  //   });
}

// ── DocuSign Events (for EventBus) ────────────────────────────

const DOCUSIGN_EVENTS = {
  ENVELOPE_CREATED:   'docusign.envelope.created',
  ENVELOPE_SENT:      'docusign.envelope.sent',
  ENVELOPE_COMPLETED: 'docusign.envelope.completed',
  ENVELOPE_DECLINED:  'docusign.envelope.declined',
  ENVELOPE_VOIDED:    'docusign.envelope.voided',
} as const;

// ── DocuSignClient ────────────────────────────────────────────

export class DocuSignClient {
  private readonly vault:    DocumentVaultService;
  private readonly eventBus: EventBus;

  constructor(vault?: DocumentVaultService, eventBus?: EventBus) {
    this.vault    = vault    ?? new DocumentVaultService();
    this.eventBus = eventBus ?? EventBus.getInstance();
  }

  // ── Create Envelope ────────────────────────────────────────

  /**
   * Create a DocuSign envelope from a template or custom documents.
   *
   * Steps:
   *   1. Obtain JWT access token
   *   2. Call DocuSign envelopes API (stubbed)
   *   3. Persist envelope record locally
   *   4. Emit docusign.envelope.created event
   */
  async createEnvelope(input: CreateEnvelopeInput): Promise<EnvelopeRecord> {
    const svcLog = logger.child({
      service:  'DocuSignClient',
      tenantId: input.tenantId,
      op:       'createEnvelope',
    });

    if (!input.templateId && (!input.documents || input.documents.length === 0)) {
      throw new DocuSignValidationError('Either templateId or at least one document is required');
    }

    if (input.recipients.length === 0) {
      throw new DocuSignValidationError('At least one recipient is required');
    }

    const token = await stubGetAccessToken();
    const { envelopeId, status } = await stubCreateEnvelopeApi(token, input);

    const record: EnvelopeRecord = {
      envelopeId,
      tenantId:     input.tenantId,
      businessId:   input.businessId ?? null,
      status,
      emailSubject: input.emailSubject,
      templateId:   input.templateId ?? null,
      sentAt:       status === 'sent' ? new Date().toISOString() : null,
      completedAt:  null,
      voidedAt:     null,
      voidedReason: null,
      metadata:     input.metadata ?? {},
      createdAt:    new Date().toISOString(),
    };

    _envelopes.set(envelopeId, record);

    await this.eventBus.publish(input.tenantId, {
      eventType:     DOCUSIGN_EVENTS.ENVELOPE_CREATED,
      aggregateType: 'envelope',
      aggregateId:   envelopeId,
      payload: {
        envelopeId,
        status,
        emailSubject: input.emailSubject,
        templateId:   input.templateId ?? null,
        businessId:   input.businessId ?? null,
        recipientCount: input.recipients.length,
      },
    });

    svcLog.info('[createEnvelope] Envelope created', { envelopeId, status });
    return record;
  }

  // ── Send For Signature ─────────────────────────────────────

  /**
   * Transition a draft envelope to "sent" status.
   * No-ops if the envelope is already sent/completed.
   */
  async sendForSignature(envelopeId: string, tenantId: string): Promise<EnvelopeRecord> {
    const record = this._findEnvelope(envelopeId, tenantId);

    if (record.status === 'sent' || record.status === 'delivered' || record.status === 'completed') {
      logger.debug('[DocuSignClient] sendForSignature: already in progress', { envelopeId, status: record.status });
      return record;
    }

    if (record.status === 'voided' || record.status === 'declined') {
      throw new DocuSignStateError(
        `Cannot send envelope ${envelopeId}: current status is ${record.status}`,
      );
    }

    const token = await stubGetAccessToken();
    const newStatus = await stubSendEnvelopeApi(token, envelopeId);

    record.status = newStatus;
    record.sentAt = new Date().toISOString();
    _envelopes.set(envelopeId, record);

    await this.eventBus.publish(tenantId, {
      eventType:     DOCUSIGN_EVENTS.ENVELOPE_SENT,
      aggregateType: 'envelope',
      aggregateId:   envelopeId,
      payload:       { envelopeId, sentAt: record.sentAt },
    });

    logger.info('[DocuSignClient] Envelope sent', { envelopeId });
    return record;
  }

  // ── Get Envelope Status ────────────────────────────────────

  /**
   * Fetch the current status of an envelope from DocuSign.
   * Updates the local record if the status has changed.
   */
  async getEnvelopeStatus(envelopeId: string, tenantId: string): Promise<EnvelopeRecord> {
    const record = this._findEnvelope(envelopeId, tenantId);
    const token  = await stubGetAccessToken();

    const { status, completedAt } = await stubGetEnvelopeStatusApi(token, envelopeId);

    if (status !== record.status) {
      record.status = status;
      if (completedAt) record.completedAt = completedAt;
      _envelopes.set(envelopeId, record);

      logger.info('[DocuSignClient] Envelope status updated', { envelopeId, newStatus: status });
    }

    return record;
  }

  // ── Download Signed Document ───────────────────────────────

  /**
   * Download the signed PDF for a completed envelope.
   * Automatically files the document into the Document Vault.
   *
   * @param documentId  DocuSign document ID within the envelope ('1', '2', etc.)
   */
  async downloadSignedDocument(
    envelopeId: string,
    tenantId:   string,
    documentId  = '1',
  ): Promise<DownloadResult> {
    const record = this._findEnvelope(envelopeId, tenantId);

    if (record.status !== 'completed') {
      throw new DocuSignStateError(
        `Cannot download document for envelope ${envelopeId}: status is ${record.status}, expected 'completed'`,
      );
    }

    const token   = await stubGetAccessToken();
    const content = await stubDownloadDocumentApi(token, envelopeId, documentId);

    const fileName = `signed-${envelopeId}-doc-${documentId}.pdf`;

    // Auto-file to Document Vault
    if (record.tenantId) {
      await this.vault.autoFile({
        tenantId:     record.tenantId,
        businessId:   record.businessId ?? undefined,
        documentType: 'contract',
        title:        `Signed: ${record.emailSubject}`,
        mimeType:     'application/pdf',
        content,
        sourceModule: 'docusign',
        sourceId:     envelopeId,
        metadata: {
          envelopeId,
          documentId,
          completedAt: record.completedAt,
        },
      });
      logger.info('[DocuSignClient] Signed doc filed to vault', { envelopeId, documentId });
    }

    return {
      envelopeId,
      documentId,
      fileName,
      contentType: 'application/pdf',
      content,
    };
  }

  // ── Void Envelope ──────────────────────────────────────────

  /**
   * Void (cancel) an in-flight envelope.
   * Completed or already-voided envelopes cannot be voided again.
   */
  async voidEnvelope(input: VoidEnvelopeInput): Promise<EnvelopeRecord> {
    const { envelopeId, tenantId, voidedReason } = input;
    const record = this._findEnvelope(envelopeId, tenantId);

    if (record.status === 'completed') {
      throw new DocuSignStateError(
        `Cannot void envelope ${envelopeId}: envelope is already completed`,
      );
    }

    if (record.status === 'voided') {
      logger.debug('[DocuSignClient] voidEnvelope: already voided', { envelopeId });
      return record;
    }

    const token = await stubGetAccessToken();
    await stubVoidEnvelopeApi(token, envelopeId, voidedReason);

    record.status       = 'voided';
    record.voidedAt     = new Date().toISOString();
    record.voidedReason = voidedReason;
    _envelopes.set(envelopeId, record);

    await this.eventBus.publish(tenantId, {
      eventType:     DOCUSIGN_EVENTS.ENVELOPE_VOIDED,
      aggregateType: 'envelope',
      aggregateId:   envelopeId,
      payload:       { envelopeId, voidedReason, voidedAt: record.voidedAt },
    });

    logger.info('[DocuSignClient] Envelope voided', { envelopeId, voidedReason });
    return record;
  }

  // ── Internal Helpers ───────────────────────────────────────

  /**
   * Retrieve envelope from in-memory store, scoped to tenantId.
   * Throws DocuSignEnvelopeNotFoundError if not found or cross-tenant.
   */
  _findEnvelope(envelopeId: string, tenantId: string): EnvelopeRecord {
    const record = _envelopes.get(envelopeId);
    if (!record || record.tenantId !== tenantId) {
      throw new DocuSignEnvelopeNotFoundError(envelopeId);
    }
    return record;
  }

  /**
   * Expose the envelope store for testing (not for production use).
   * @internal
   */
  _getEnvelopeStore(): Map<string, EnvelopeRecord> {
    return _envelopes;
  }

  /**
   * Clear the cached JWT token (used in tests to force token refresh).
   * @internal
   */
  _clearTokenCache(): void {
    _tokenCache = null;
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class DocuSignEnvelopeNotFoundError extends Error {
  public readonly code = 'DOCUSIGN_ENVELOPE_NOT_FOUND';
  constructor(envelopeId: string) {
    super(`DocuSign envelope not found: ${envelopeId}`);
    this.name = 'DocuSignEnvelopeNotFoundError';
  }
}

export class DocuSignStateError extends Error {
  public readonly code = 'DOCUSIGN_INVALID_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'DocuSignStateError';
  }
}

export class DocuSignValidationError extends Error {
  public readonly code = 'DOCUSIGN_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'DocuSignValidationError';
  }
}

export class DocuSignAuthError extends Error {
  public readonly code = 'DOCUSIGN_AUTH_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'DocuSignAuthError';
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const docuSignClient = new DocuSignClient();

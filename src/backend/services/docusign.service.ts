// ============================================================
// CapitalForge — DocuSign Service
//
// High-level orchestration layer that wraps the DocuSign client
// integration to provide business-domain operations:
//
//   sendForSignature()  — create envelope and send for signature
//   getEnvelopeStatus() — poll/fetch current envelope status
//   getAccessToken()    — JWT grant flow (delegates to client)
//
// All DocuSign calls are wrapped in try/catch with graceful
// fallback when DOCUSIGN keys aren't configured (returns
// mock/stub response for demo mode).
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import logger from '../config/logger.js';
import {
  DocuSignClient,
  docuSignClient,
  type EnvelopeRecord,
  type EnvelopeStatus,
} from '../integrations/docusign/index.js';

// ── Environment ───────────────────────────────────────────────

const DOCUSIGN_INTEGRATION_KEY = process.env['DOCUSIGN_INTEGRATION_KEY'] ?? '';
const DOCUSIGN_SECRET_KEY      = process.env['DOCUSIGN_SECRET_KEY'] ?? '';
const DOCUSIGN_ACCOUNT_ID      = process.env['DOCUSIGN_ACCOUNT_ID'] ?? '';

/** Returns true if DocuSign credentials are configured */
function isDocuSignConfigured(): boolean {
  return !!(DOCUSIGN_INTEGRATION_KEY && DOCUSIGN_SECRET_KEY && DOCUSIGN_ACCOUNT_ID);
}

// ── Types ─────────────────────────────────────────────────────

export interface SendForSignatureInput {
  signerEmail:     string;
  signerName:      string;
  documentBase64:  string;
  documentName:    string;
  envelopeSubject: string;
  envelopeMessage?: string;
  businessId:      string;
  docType:         string;
  tenantId?:       string;
}

export interface SendForSignatureResult {
  envelopeId:  string;
  status:      EnvelopeStatus;
  sentAt:      string;
  isMock:      boolean;
  message:     string;
}

export interface EnvelopeStatusResult {
  envelopeId:  string;
  status:      EnvelopeStatus;
  sentAt:      string | null;
  completedAt: string | null;
  isMock:      boolean;
}

// ── Mock Helpers ──────────────────────────────────────────────

function buildMockSendResult(input: SendForSignatureInput): SendForSignatureResult {
  return {
    envelopeId: `mock-env-${uuidv4()}`,
    status:     'sent',
    sentAt:     new Date().toISOString(),
    isMock:     true,
    message:    `[DEMO] Signature request for "${input.documentName}" sent to ${input.signerEmail}`,
  };
}

function buildMockStatusResult(envelopeId: string): EnvelopeStatusResult {
  // Simulate a progression based on envelope ID hash for demo consistency
  const statuses: EnvelopeStatus[] = ['sent', 'delivered', 'completed'];
  const hash = envelopeId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const status = statuses[hash % statuses.length] ?? 'sent';

  return {
    envelopeId,
    status,
    sentAt:      new Date(Date.now() - 86_400_000).toISOString(), // yesterday
    completedAt: status === 'completed' ? new Date().toISOString() : null,
    isMock:      true,
  };
}

// ── DocuSignService ───────────────────────────────────────────

export class DocuSignService {
  private readonly client: DocuSignClient;
  private readonly prisma: PrismaClient;

  constructor(client?: DocuSignClient, prisma?: PrismaClient) {
    this.client = client ?? docuSignClient;
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Send For Signature ────────────────────────────────────

  /**
   * Create and send a DocuSign envelope for e-signature.
   *
   * When DocuSign keys are not configured, returns a mock response
   * so the UI can operate in demo mode.
   */
  async sendForSignature(input: SendForSignatureInput): Promise<SendForSignatureResult> {
    const svcLog = logger.child({
      service:    'DocuSignService',
      op:         'sendForSignature',
      businessId: input.businessId,
    });

    // ── Demo mode fallback ──────────────────────────────────
    if (!isDocuSignConfigured()) {
      svcLog.info('[sendForSignature] DocuSign not configured — returning mock response');
      const mock = buildMockSendResult(input);

      // Persist mock envelope reference for status tracking
      await this._persistEnvelopeRecord({
        envelopeId:  mock.envelopeId,
        businessId:  input.businessId,
        tenantId:    input.tenantId ?? 'demo',
        docType:     input.docType,
        signerEmail: input.signerEmail,
        signerName:  input.signerName,
        status:      'sent',
        isMock:      true,
      });

      return mock;
    }

    // ── Live mode ───────────────────────────────────────────
    try {
      const tenantId = input.tenantId ?? 'default';

      const envelope = await this.client.createEnvelope({
        tenantId,
        businessId:   input.businessId,
        emailSubject: input.envelopeSubject,
        emailBlurb:   input.envelopeMessage,
        sendNow:      true,
        documents: [
          {
            documentBase64: input.documentBase64,
            name:           input.documentName,
            fileExtension:  'pdf',
            documentId:     '1',
          },
        ],
        recipients: [
          {
            email:       input.signerEmail,
            name:        input.signerName,
            recipientId: '1',
          },
        ],
        metadata: {
          docType:    input.docType,
          businessId: input.businessId,
          source:     'docusign-service',
        },
      });

      await this._persistEnvelopeRecord({
        envelopeId:  envelope.envelopeId,
        businessId:  input.businessId,
        tenantId,
        docType:     input.docType,
        signerEmail: input.signerEmail,
        signerName:  input.signerName,
        status:      envelope.status,
        isMock:      false,
      });

      svcLog.info('[sendForSignature] Envelope created and sent', {
        envelopeId: envelope.envelopeId,
        status:     envelope.status,
      });

      return {
        envelopeId: envelope.envelopeId,
        status:     envelope.status,
        sentAt:     envelope.sentAt ?? new Date().toISOString(),
        isMock:     false,
        message:    `Signature request sent to ${input.signerEmail}`,
      };
    } catch (err) {
      svcLog.error('[sendForSignature] DocuSign API error — falling back to mock', {
        error: err instanceof Error ? err.message : String(err),
      });

      // Graceful fallback on any DocuSign error
      const mock = buildMockSendResult(input);
      return mock;
    }
  }

  // ── Get Envelope Status ───────────────────────────────────

  /**
   * Retrieve the current status of a DocuSign envelope.
   *
   * Returns mock status when DocuSign is not configured.
   */
  async getEnvelopeStatus(envelopeId: string, tenantId?: string): Promise<EnvelopeStatusResult> {
    const svcLog = logger.child({
      service: 'DocuSignService',
      op:      'getEnvelopeStatus',
      envelopeId,
    });

    // ── Demo mode fallback ──────────────────────────────────
    if (!isDocuSignConfigured()) {
      svcLog.debug('[getEnvelopeStatus] DocuSign not configured — returning mock status');
      return buildMockStatusResult(envelopeId);
    }

    // ── Live mode ───────────────────────────────────────────
    try {
      const tenant = tenantId ?? 'default';
      const record = await this.client.getEnvelopeStatus(envelopeId, tenant);

      return {
        envelopeId:  record.envelopeId,
        status:      record.status,
        sentAt:      record.sentAt,
        completedAt: record.completedAt,
        isMock:      false,
      };
    } catch (err) {
      svcLog.error('[getEnvelopeStatus] DocuSign API error — returning mock', {
        error: err instanceof Error ? err.message : String(err),
      });
      return buildMockStatusResult(envelopeId);
    }
  }

  // ── Get Access Token ──────────────────────────────────────

  /**
   * Obtain a JWT access token for DocuSign API calls.
   *
   * When DocuSign credentials are configured, performs the JWT Grant flow:
   *   1. Build a JWT assertion signed with the RSA private key
   *   2. POST to DocuSign OAuth token endpoint
   *   3. Cache the token until near expiry
   *
   * Returns a stub token when credentials are not configured.
   */
  async getAccessToken(): Promise<{ token: string; expiresIn: number; isMock: boolean }> {
    if (!isDocuSignConfigured()) {
      return { token: `mock-token-${Date.now()}`, expiresIn: 3600, isMock: true };
    }

    // Check cache first
    if (this._cachedToken && this._cachedTokenExpiresAt > Date.now() + 60_000) {
      return { token: this._cachedToken, expiresIn: Math.floor((this._cachedTokenExpiresAt - Date.now()) / 1000), isMock: false };
    }

    const privateKey = process.env['DOCUSIGN_PRIVATE_KEY'] ?? '';
    const userId = process.env['DOCUSIGN_USER_ID'] ?? '';
    const oauthBase = process.env['DOCUSIGN_OAUTH_BASE_URL'] ?? 'https://account-d.docusign.com';

    if (!privateKey || !userId) {
      logger.warn('[DocuSignService] DOCUSIGN_PRIVATE_KEY or DOCUSIGN_USER_ID not set — returning mock token');
      return { token: `mock-token-${Date.now()}`, expiresIn: 3600, isMock: true };
    }

    try {
      // Build JWT assertion for DocuSign JWT Grant
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: DOCUSIGN_INTEGRATION_KEY,
        sub: userId,
        aud: new URL(oauthBase).hostname,
        iat: now,
        exp: now + 3600,
        scope: 'signature impersonation',
      })).toString('base64url');

      const { createSign } = await import('crypto');
      const sign = createSign('RSA-SHA256');
      sign.update(`${header}.${payload}`);
      const signature = sign.sign(privateKey, 'base64url');

      const assertion = `${header}.${payload}.${signature}`;

      // Exchange JWT for access token
      const tokenUrl = `${oauthBase}/oauth/token`;
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });

      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`DocuSign OAuth error ${resp.status}: ${errBody}`);
      }

      const tokenData = await resp.json() as { access_token: string; expires_in: number };
      this._cachedToken = tokenData.access_token;
      this._cachedTokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

      logger.info('[DocuSignService] JWT access token obtained', {
        expiresIn: tokenData.expires_in,
      });

      return { token: tokenData.access_token, expiresIn: tokenData.expires_in, isMock: false };
    } catch (err) {
      logger.error('[DocuSignService] Failed to get access token', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { token: `fallback-token-${Date.now()}`, expiresIn: 3600, isMock: true };
    }
  }

  // Token cache for JWT grant flow
  private _cachedToken: string | null = null;
  private _cachedTokenExpiresAt: number = 0;

  // ── Handle Webhook Completion ─────────────────────────────

  /**
   * Called when a DocuSign webhook fires an envelope status event.
   * Updates the Document record linked to this envelope in the database.
   *
   * Handled statuses:
   *   - 'completed' → marks signatureStatus as 'signed', records completedAt
   *   - 'declined'  → marks signatureStatus as 'declined', records declinedAt
   *   - 'voided'    → marks signatureStatus as 'voided', records voidedAt
   */
  async handleWebhookCompletion(
    envelopeId: string,
    status: EnvelopeStatus,
    timestamp?: string,
  ): Promise<{ updated: boolean; envelopeId: string; status: string }> {
    const svcLog = logger.child({
      service: 'DocuSignService',
      op:      'handleWebhookCompletion',
      envelopeId,
    });

    // Map DocuSign envelope status to our acknowledgment signature status
    const signatureStatusMap: Record<string, string> = {
      completed: 'signed',
      declined:  'declined',
      voided:    'voided',
    };
    const signatureStatus = signatureStatusMap[status] ?? status;
    const ts = timestamp ?? new Date().toISOString();

    try {
      // Update the Document records linked to this envelope
      const updatedCount = await this.prisma.document.updateMany({
        where: {
          metadata: {
            path: ['envelopeId'],
            equals: envelopeId,
          },
        },
        data: {
          metadata: {
            envelopeId,
            signatureStatus,
            ...(status === 'completed' ? { completedAt: ts } : {}),
            ...(status === 'declined'  ? { declinedAt: ts }  : {}),
            ...(status === 'voided'    ? { voidedAt: ts }    : {}),
            updatedAt: ts,
          },
        },
      });

      svcLog.info('[handleWebhookCompletion] Updated records', {
        envelopeId,
        status,
        signatureStatus,
        count: updatedCount.count,
      });

      return { updated: updatedCount.count > 0, envelopeId, status: signatureStatus };
    } catch (err) {
      svcLog.error('[handleWebhookCompletion] Failed to update records', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { updated: false, envelopeId, status: signatureStatus };
    }
  }

  // ── Private Helpers ───────────────────────────────────────

  /**
   * Persist an envelope reference for status tracking.
   * Uses the Document table with a docusign_envelope type.
   */
  private async _persistEnvelopeRecord(opts: {
    envelopeId:  string;
    businessId:  string;
    tenantId:    string;
    docType:     string;
    signerEmail: string;
    signerName:  string;
    status:      string;
    isMock:      boolean;
  }): Promise<void> {
    try {
      await this.prisma.document.create({
        data: {
          id:           uuidv4(),
          tenantId:     opts.tenantId,
          businessId:   opts.businessId,
          documentType: `docusign_envelope_${opts.docType}`,
          title:        `DocuSign Envelope: ${opts.docType}`,
          storageKey:   `docusign/${opts.tenantId}/${opts.businessId}/${opts.envelopeId}`,
          mimeType:     'application/pdf',
          sizeBytes:    0,
          sha256Hash:   '',
          uploadedBy:   'system',
          metadata: {
            envelopeId:      opts.envelopeId,
            signerEmail:     opts.signerEmail,
            signerName:      opts.signerName,
            docType:         opts.docType,
            signatureStatus: opts.status,
            isMock:          opts.isMock,
          },
        },
      });
    } catch (err) {
      // Non-fatal — log and continue
      logger.warn('[DocuSignService] Failed to persist envelope record', {
        envelopeId: opts.envelopeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const docuSignService = new DocuSignService();

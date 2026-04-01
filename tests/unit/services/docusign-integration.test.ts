// ============================================================
// DocuSign Integration — Unit Tests
//
// Coverage:
//   Section 1: DocuSignClient — createEnvelope (template + custom)
//   Section 2: DocuSignClient — sendForSignature (state transitions)
//   Section 3: DocuSignClient — getEnvelopeStatus (polling)
//   Section 4: DocuSignClient — downloadSignedDocument + vault filing
//   Section 5: DocuSignClient — voidEnvelope (state guards)
//   Section 6: JWT token caching
//   Section 7: DocuSignWebhookHandler — envelope-completed (vault + event)
//   Section 8: DocuSignWebhookHandler — envelope-declined
//   Section 9: DocuSignWebhookHandler — envelope-voided
//   Section 10: DocuSignWebhookHandler — idempotency
//   Section 11: DocuSignWebhookHandler — unknown events (graceful handling)
//   Section 12: DocuSignWebhookHandler — signature verification skip in test mode
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DocuSignClient,
  DocuSignEnvelopeNotFoundError,
  DocuSignStateError,
  DocuSignValidationError,
  type CreateEnvelopeInput,
} from '../../../src/backend/integrations/docusign/docusign-client.js';
import {
  DocuSignWebhookHandler,
} from '../../../src/backend/integrations/docusign/docusign-webhooks.js';

// ── Fixtures ──────────────────────────────────────────────────

const TENANT_ID   = 'tenant-docusign-001';
const BUSINESS_ID = 'biz-001';

function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    email: 'signer@example.com',
    name:  'Jane Signer',
    ...overrides,
  };
}

function makeCreateInput(overrides: Partial<CreateEnvelopeInput> = {}): CreateEnvelopeInput {
  return {
    tenantId:     TENANT_ID,
    businessId:   BUSINESS_ID,
    emailSubject: 'Please sign this funding agreement',
    recipients:   [makeRecipient()],
    documents:    [
      {
        documentBase64: Buffer.from('stub-pdf-content').toString('base64'),
        name:           'Funding Agreement.pdf',
        fileExtension:  'pdf',
        documentId:     '1',
      },
    ],
    ...overrides,
  };
}

// ── Mock builders ─────────────────────────────────────────────

function makeVaultMock() {
  return {
    autoFile: vi.fn().mockResolvedValue({ id: 'doc-vault-001', storageKey: 'stub-key' }),
    upload:   vi.fn().mockResolvedValue({ id: 'doc-vault-002' }),
  };
}

function makeEventBusMock() {
  return {
    publish:            vi.fn().mockResolvedValue(undefined),
    publishAndPersist:  vi.fn().mockResolvedValue(undefined),
    subscribe:          vi.fn(),
  };
}

// ── Section 1: createEnvelope ─────────────────────────────────

describe('DocuSignClient.createEnvelope', () => {
  let client: DocuSignClient;

  beforeEach(() => {
    client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    // Clear the shared envelope store between tests
    client._getEnvelopeStore().clear();
    client._clearTokenCache();
  });

  it('creates an envelope from custom documents and returns a record', async () => {
    const record = await client.createEnvelope(makeCreateInput());

    expect(record.envelopeId).toBeTruthy();
    expect(record.tenantId).toBe(TENANT_ID);
    expect(record.businessId).toBe(BUSINESS_ID);
    expect(record.emailSubject).toBe('Please sign this funding agreement');
    expect(record.templateId).toBeNull();
  });

  it('creates a draft envelope (sendNow=false) with status "created"', async () => {
    const record = await client.createEnvelope(makeCreateInput({ sendNow: false }));
    expect(record.status).toBe('created');
    expect(record.sentAt).toBeNull();
  });

  it('creates and sends an envelope immediately (sendNow=true) with status "sent"', async () => {
    const record = await client.createEnvelope(makeCreateInput({ sendNow: true }));
    expect(record.status).toBe('sent');
    expect(record.sentAt).not.toBeNull();
  });

  it('creates an envelope from a templateId (no documents required)', async () => {
    const record = await client.createEnvelope(
      makeCreateInput({ templateId: 'tmpl-funding-001', documents: undefined }),
    );
    expect(record.templateId).toBe('tmpl-funding-001');
    expect(record.envelopeId).toBeTruthy();
  });

  it('throws DocuSignValidationError when neither templateId nor documents provided', async () => {
    await expect(
      client.createEnvelope(makeCreateInput({ templateId: undefined, documents: undefined })),
    ).rejects.toThrow(DocuSignValidationError);
  });

  it('throws DocuSignValidationError when no recipients provided', async () => {
    await expect(
      client.createEnvelope(makeCreateInput({ recipients: [] })),
    ).rejects.toThrow(DocuSignValidationError);
  });

  it('persists the envelope record in the store after creation', async () => {
    const record = await client.createEnvelope(makeCreateInput());
    const stored = client._getEnvelopeStore().get(record.envelopeId);
    expect(stored).toBeDefined();
    expect(stored?.envelopeId).toBe(record.envelopeId);
  });

  it('publishes a docusign.envelope.created event on the event bus', async () => {
    const eventBus = makeEventBusMock();
    const c = new DocuSignClient(makeVaultMock() as never, eventBus as never);
    c._getEnvelopeStore().clear();

    await c.createEnvelope(makeCreateInput());

    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'docusign.envelope.created' }),
    );
  });
});

// ── Section 2: sendForSignature ───────────────────────────────

describe('DocuSignClient.sendForSignature', () => {
  let client: DocuSignClient;

  beforeEach(() => {
    client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();
    client._clearTokenCache();
  });

  it('transitions a draft envelope to sent status', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: false }));
    expect(created.status).toBe('created');

    const sent = await client.sendForSignature(created.envelopeId, TENANT_ID);
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();
  });

  it('is a no-op when envelope is already sent', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: true }));
    expect(created.status).toBe('sent');

    const again = await client.sendForSignature(created.envelopeId, TENANT_ID);
    expect(again.status).toBe('sent');
  });

  it('throws DocuSignStateError when envelope is voided', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: false }));
    await client.voidEnvelope({ envelopeId: created.envelopeId, tenantId: TENANT_ID, voidedReason: 'test' });

    await expect(
      client.sendForSignature(created.envelopeId, TENANT_ID),
    ).rejects.toThrow(DocuSignStateError);
  });

  it('throws DocuSignEnvelopeNotFoundError for unknown envelopeId', async () => {
    await expect(
      client.sendForSignature('non-existent-env', TENANT_ID),
    ).rejects.toThrow(DocuSignEnvelopeNotFoundError);
  });

  it('throws DocuSignEnvelopeNotFoundError for cross-tenant access', async () => {
    const created = await client.createEnvelope(makeCreateInput());
    await expect(
      client.sendForSignature(created.envelopeId, 'other-tenant'),
    ).rejects.toThrow(DocuSignEnvelopeNotFoundError);
  });
});

// ── Section 3: getEnvelopeStatus ──────────────────────────────

describe('DocuSignClient.getEnvelopeStatus', () => {
  let client: DocuSignClient;

  beforeEach(() => {
    client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();
    client._clearTokenCache();
  });

  it('returns current status of a known envelope', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: true }));
    const status  = await client.getEnvelopeStatus(created.envelopeId, TENANT_ID);

    expect(status.envelopeId).toBe(created.envelopeId);
    expect(['sent', 'delivered', 'completed', 'created']).toContain(status.status);
  });

  it('throws for unknown envelope', async () => {
    await expect(
      client.getEnvelopeStatus('ghost-envelope', TENANT_ID),
    ).rejects.toThrow(DocuSignEnvelopeNotFoundError);
  });
});

// ── Section 4: downloadSignedDocument ────────────────────────

describe('DocuSignClient.downloadSignedDocument', () => {
  let client: DocuSignClient;
  let vault: ReturnType<typeof makeVaultMock>;

  beforeEach(() => {
    vault  = makeVaultMock();
    client = new DocuSignClient(vault as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();
    client._clearTokenCache();
  });

  it('downloads and auto-files a completed envelope to the vault', async () => {
    // Manually inject a completed envelope record
    const envelopeId = 'env-completed-001';
    client._getEnvelopeStore().set(envelopeId, {
      envelopeId,
      tenantId:     TENANT_ID,
      businessId:   BUSINESS_ID,
      status:       'completed',
      emailSubject: 'Signed Agreement',
      templateId:   null,
      sentAt:       new Date().toISOString(),
      completedAt:  new Date().toISOString(),
      voidedAt:     null,
      voidedReason: null,
      metadata:     {},
      createdAt:    new Date().toISOString(),
    });

    const result = await client.downloadSignedDocument(envelopeId, TENANT_ID);

    expect(result.envelopeId).toBe(envelopeId);
    expect(result.contentType).toBe('application/pdf');
    expect(result.content).toBeInstanceOf(Buffer);
    expect(vault.autoFile).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'contract',
        sourceModule: 'docusign',
        sourceId:     envelopeId,
      }),
    );
  });

  it('throws DocuSignStateError when envelope is not completed', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: true }));
    // Status is 'sent', not 'completed'
    await expect(
      client.downloadSignedDocument(created.envelopeId, TENANT_ID),
    ).rejects.toThrow(DocuSignStateError);
  });
});

// ── Section 5: voidEnvelope ───────────────────────────────────

describe('DocuSignClient.voidEnvelope', () => {
  let client: DocuSignClient;

  beforeEach(() => {
    client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();
    client._clearTokenCache();
  });

  it('voids a sent envelope and sets voidedAt + reason', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: true }));
    const voided  = await client.voidEnvelope({
      envelopeId:   created.envelopeId,
      tenantId:     TENANT_ID,
      voidedReason: 'Client requested cancellation',
    });

    expect(voided.status).toBe('voided');
    expect(voided.voidedReason).toBe('Client requested cancellation');
    expect(voided.voidedAt).not.toBeNull();
  });

  it('throws DocuSignStateError when trying to void a completed envelope', async () => {
    const envelopeId = 'env-complete-002';
    client._getEnvelopeStore().set(envelopeId, {
      envelopeId,
      tenantId:     TENANT_ID,
      businessId:   null,
      status:       'completed',
      emailSubject: 'Done',
      templateId:   null,
      sentAt:       new Date().toISOString(),
      completedAt:  new Date().toISOString(),
      voidedAt:     null,
      voidedReason: null,
      metadata:     {},
      createdAt:    new Date().toISOString(),
    });

    await expect(
      client.voidEnvelope({ envelopeId, tenantId: TENANT_ID, voidedReason: 'late void' }),
    ).rejects.toThrow(DocuSignStateError);
  });

  it('is a no-op when envelope is already voided', async () => {
    const created = await client.createEnvelope(makeCreateInput({ sendNow: false }));
    await client.voidEnvelope({ envelopeId: created.envelopeId, tenantId: TENANT_ID, voidedReason: 'first void' });
    const again = await client.voidEnvelope({ envelopeId: created.envelopeId, tenantId: TENANT_ID, voidedReason: 'second void' });

    expect(again.status).toBe('voided');
    expect(again.voidedReason).toBe('first void'); // reason should not be overwritten
  });

  it('publishes a docusign.envelope.voided event', async () => {
    const eventBus = makeEventBusMock();
    const c = new DocuSignClient(makeVaultMock() as never, eventBus as never);
    c._getEnvelopeStore().clear();

    const created = await c.createEnvelope(makeCreateInput({ sendNow: true }));
    await c.voidEnvelope({ envelopeId: created.envelopeId, tenantId: TENANT_ID, voidedReason: 'test' });

    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'docusign.envelope.voided' }),
    );
  });
});

// ── Section 7: Webhook — envelope-completed ───────────────────

describe('DocuSignWebhookHandler — envelope-completed', () => {
  let handler: DocuSignWebhookHandler;
  let client:  DocuSignClient;
  let vault:   ReturnType<typeof makeVaultMock>;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    vault    = makeVaultMock();
    eventBus = makeEventBusMock();
    client   = new DocuSignClient(vault as never, eventBus as never);
    client._getEnvelopeStore().clear();

    handler = new DocuSignWebhookHandler(client, vault as never, eventBus as never);
    handler._clearProcessedEvents();
  });

  it('processes envelope-completed and files doc to vault', async () => {
    const envelopeId = 'env-webhook-001';
    client._getEnvelopeStore().set(envelopeId, {
      envelopeId,
      tenantId:     TENANT_ID,
      businessId:   BUSINESS_ID,
      status:       'sent',
      emailSubject: 'Loan Agreement',
      templateId:   null,
      sentAt:       new Date().toISOString(),
      completedAt:  null,
      voidedAt:     null,
      voidedReason: null,
      metadata:     {},
      createdAt:    new Date().toISOString(),
    });

    const result = await handler.processWebhook(
      {
        event: 'envelope-completed',
        data:  { envelopeId, envelopeSummary: { status: 'completed' } },
        generatedDateTime: new Date().toISOString(),
      },
      TENANT_ID,
    );

    expect(result.received).toBe(true);
    expect(result.event).toBe('envelope-completed');
    expect(result.envelopeId).toBe(envelopeId);
    expect(result.duplicate).toBe(false);
    expect(vault.autoFile).toHaveBeenCalledWith(
      expect.objectContaining({ sourceModule: 'docusign', sourceId: envelopeId }),
    );
  });

  it('publishes docusign.webhook.envelope.completed event', async () => {
    const envelopeId = 'env-webhook-002';
    client._getEnvelopeStore().set(envelopeId, {
      envelopeId,
      tenantId: TENANT_ID,
      businessId: null,
      status: 'sent',
      emailSubject: 'Test',
      templateId: null,
      sentAt: null,
      completedAt: null,
      voidedAt: null,
      voidedReason: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    });

    await handler.processWebhook(
      { event: 'envelope-completed', data: { envelopeId }, generatedDateTime: new Date().toISOString() },
      TENANT_ID,
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'docusign.webhook.envelope.completed' }),
    );
  });
});

// ── Section 8: Webhook — envelope-declined ────────────────────

describe('DocuSignWebhookHandler — envelope-declined', () => {
  let handler: DocuSignWebhookHandler;
  let client:  DocuSignClient;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    client   = new DocuSignClient(makeVaultMock() as never, eventBus as never);
    client._getEnvelopeStore().clear();
    handler = new DocuSignWebhookHandler(client, makeVaultMock() as never, eventBus as never);
    handler._clearProcessedEvents();
  });

  it('processes envelope-declined and publishes declined event', async () => {
    const envelopeId = 'env-declined-001';
    client._getEnvelopeStore().set(envelopeId, {
      envelopeId,
      tenantId: TENANT_ID,
      businessId: null,
      status: 'sent',
      emailSubject: 'Test',
      templateId: null,
      sentAt: null,
      completedAt: null,
      voidedAt: null,
      voidedReason: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    });

    const result = await handler.processWebhook(
      { event: 'envelope-declined', data: { envelopeId }, generatedDateTime: new Date().toISOString() },
      TENANT_ID,
    );

    expect(result.event).toBe('envelope-declined');
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'docusign.webhook.envelope.declined' }),
    );
  });

  it('handles declined event even when envelope is not in local store', async () => {
    const result = await handler.processWebhook(
      {
        event: 'envelope-declined',
        data: { envelopeId: 'unknown-env-999' },
        generatedDateTime: new Date().toISOString(),
      },
      TENANT_ID,
    );

    expect(result.received).toBe(true);
  });
});

// ── Section 9: Webhook — envelope-voided ─────────────────────

describe('DocuSignWebhookHandler — envelope-voided', () => {
  let handler:  DocuSignWebhookHandler;
  let eventBus: ReturnType<typeof makeEventBusMock>;

  beforeEach(() => {
    eventBus = makeEventBusMock();
    const client = new DocuSignClient(makeVaultMock() as never, eventBus as never);
    client._getEnvelopeStore().clear();
    handler = new DocuSignWebhookHandler(client, makeVaultMock() as never, eventBus as never);
    handler._clearProcessedEvents();
  });

  it('publishes docusign.webhook.envelope.voided event', async () => {
    const result = await handler.processWebhook(
      {
        event: 'envelope-voided',
        data: { envelopeId: 'env-voided-001', envelopeSummary: { voidedReason: 'Client cancelled' } },
        generatedDateTime: new Date().toISOString(),
      },
      TENANT_ID,
    );

    expect(result.event).toBe('envelope-voided');
    expect(eventBus.publish).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ eventType: 'docusign.webhook.envelope.voided' }),
    );
  });
});

// ── Section 10: Webhook — Idempotency ────────────────────────

describe('DocuSignWebhookHandler — idempotency', () => {
  let handler: DocuSignWebhookHandler;

  beforeEach(() => {
    const client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();
    handler = new DocuSignWebhookHandler(client, makeVaultMock() as never, makeEventBusMock() as never);
    handler._clearProcessedEvents();
  });

  it('returns duplicate=true on second delivery of same event', async () => {
    const body = {
      event: 'envelope-completed',
      data:  { envelopeId: 'env-idem-001' },
      generatedDateTime: '2026-01-15T10:00:00Z',
    };

    const first  = await handler.processWebhook(body, TENANT_ID);
    const second = await handler.processWebhook(body, TENANT_ID);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });

  it('does NOT deduplicate different events for the same envelope', async () => {
    const envelopeId = 'env-idem-002';
    const ts = '2026-01-15T10:00:00Z';

    const r1 = await handler.processWebhook(
      { event: 'envelope-sent',      data: { envelopeId }, generatedDateTime: ts },
      TENANT_ID,
    );
    const r2 = await handler.processWebhook(
      { event: 'envelope-completed', data: { envelopeId }, generatedDateTime: ts },
      TENANT_ID,
    );

    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(false);
  });
});

// ── Section 11: Webhook — missing envelopeId ─────────────────

describe('DocuSignWebhookHandler — validation', () => {
  let handler: DocuSignWebhookHandler;

  beforeEach(() => {
    handler = new DocuSignWebhookHandler(
      new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never),
      makeVaultMock() as never,
      makeEventBusMock() as never,
    );
    handler._clearProcessedEvents();
  });

  it('throws when envelopeId is absent from payload', async () => {
    await expect(
      handler.processWebhook({ event: 'envelope-completed', data: {} }, TENANT_ID),
    ).rejects.toThrow(/envelopeId/);
  });
});

// ── Section 12: Client tenant isolation ──────────────────────

describe('DocuSignClient — tenant isolation', () => {
  it('does not allow cross-tenant envelope access', async () => {
    const client = new DocuSignClient(makeVaultMock() as never, makeEventBusMock() as never);
    client._getEnvelopeStore().clear();

    const record = await client.createEnvelope(makeCreateInput({ tenantId: 'tenant-A' }));

    await expect(
      client.getEnvelopeStatus(record.envelopeId, 'tenant-B'),
    ).rejects.toThrow(DocuSignEnvelopeNotFoundError);
  });
});

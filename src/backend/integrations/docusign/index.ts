// ============================================================
// DocuSign Integration — Barrel Exports
// ============================================================

export {
  DocuSignClient,
  docuSignClient,
  DocuSignEnvelopeNotFoundError,
  DocuSignStateError,
  DocuSignValidationError,
  DocuSignAuthError,
  type EnvelopeStatus,
  type EnvelopeRecord,
  type CreateEnvelopeInput,
  type DocuSignRecipient,
  type DocuSignDocument,
  type VoidEnvelopeInput,
  type DownloadResult,
} from './docusign-client.js';

export {
  DocuSignWebhookHandler,
  docuSignWebhookHandler,
  type DocuSignWebhookEvent,
  type DocuSignConnectEventType,
  type WebhookProcessResult,
} from './docusign-webhooks.js';

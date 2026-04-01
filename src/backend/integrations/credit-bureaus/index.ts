// ============================================================
// Credit Bureau Integration — Barrel Exports
// ============================================================

export {
  BureauClient,
  bureauClient,
  BureauRateLimitError,
  BureauConsentError,
  BureauValidationError,
  BureauUnsupportedError,
  BureauApiError,
  type CreditProfile,
  type NormalisedTradeline,
  type PersonalCreditResult,
  type BusinessCreditResult,
  type ConsentAttestation,
  type ProfileType,
} from './bureau-client.js';

export {
  BureauWebhookHandler,
  bureauWebhookHandler,
  type BureauAlertPayload,
  type BureauAlertData,
  type BureauAlertType,
  type AlertProcessResult,
} from './bureau-webhooks.js';

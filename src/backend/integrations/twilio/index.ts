// ============================================================
// CapitalForge — Twilio Integration
//
// Barrel export for all Twilio integration modules.
// ============================================================

// Client
export {
  TwilioClient,
  getTwilioClient,
  resetTwilioClient,
} from './twilio-client.js';

export type {
  MakeCallParams,
  MakeCallResult,
  EndCallResult,
  CallStatusResult,
  RecordingResult,
  TranscriptionResult,
  SendSmsParams,
  SendSmsResult,
  ConferenceParams,
  ConferenceResult,
} from './twilio-client.js';

// Webhooks
export {
  TwilioWebhookHandler,
  twilioWebhookHandler,
  validateTwilioSignature,
} from './twilio-webhooks.js';

export type {
  TwilioCallStatusPayload,
  TwilioRecordingPayload,
  TwilioTranscriptionPayload,
  WebhookResult,
} from './twilio-webhooks.js';

// Campaigns
export {
  TwilioCampaignManager,
  twilioCampaignManager,
} from './twilio-campaigns.js';

export type {
  CampaignType,
  CampaignTarget,
  CampaignConfig,
  CampaignResult,
} from './twilio-campaigns.js';

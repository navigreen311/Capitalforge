// ============================================================
// CapitalForge — VoiceForge Client
//
// Unified typed client for all VoiceForge telephony operations.
// Uses real Twilio when TWILIO_ACCOUNT_SID is set; otherwise
// falls back to deterministic mock responses.
//
// Methods:
//   initiateCall(params)        — start outbound call (TCPA-gated)
//   endCall(callId)             — end active call
//   getCallStatus(callId)       — check call status
//   sendSMS(params)             — send SMS (TCPA-gated)
//   getCallRecording(callId)    — get recording URL
//
// TCPA CONTRACT:
//   initiateCall and sendSMS enforce consent gate before any
//   outbound communication. This is non-negotiable.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { consentGate, TcpaConsentError } from './consent-gate.js';
import logger from '../config/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface InitiateCallParams {
  tenantId: string;
  businessId: string;
  toPhoneNumber: string;
  fromPhoneNumber: string;
  advisorId?: string;
  purpose: string;
  twiml?: string;
  twimlUrl?: string;
  record?: boolean;
}

export interface InitiateCallResult {
  callSid: string;
  status: string;
  to: string;
  from: string;
}

export interface EndCallResult {
  callSid: string;
  status: string;
}

export interface CallStatusResult {
  callSid: string;
  status: string;
  direction: string;
  duration: string | null;
  startTime: Date | null;
  endTime: Date | null;
  to: string;
  from: string;
}

export interface SendSMSParams {
  tenantId: string;
  businessId: string;
  to: string;
  from: string;
  body: string;
}

export interface SendSMSResult {
  messageSid: string;
  status: string;
  to: string;
  from: string;
  body: string;
}

export interface CallRecordingResult {
  recordingSid: string | null;
  callSid: string;
  status: string;
  duration: string | null;
  mediaUrl: string | null;
}

// ── Mode detection ─────────────────────────────────────────────────────────

function useLiveTwilio(): boolean {
  return !!process.env['TWILIO_ACCOUNT_SID'];
}

// ── Live Twilio helpers ────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[VoiceForgeClient] Missing env var: ${key}`);
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _twilioInstance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTwilioClient(): any {
  if (!_twilioInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio') as (sid: string, token: string) => unknown;
    _twilioInstance = twilio(
      requireEnv('TWILIO_ACCOUNT_SID'),
      requireEnv('TWILIO_AUTH_TOKEN'),
    );
  }
  return _twilioInstance;
}

// ── Mock helpers ───────────────────────────────────────────────────────────

function mockCallSid(): string {
  return `CA${uuidv4().replace(/-/g, '').slice(0, 32)}`;
}

function mockMessageSid(): string {
  return `SM${uuidv4().replace(/-/g, '').slice(0, 32)}`;
}

function mockRecordingSid(): string {
  return `RE${uuidv4().replace(/-/g, '').slice(0, 32)}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initiate an outbound call.
 *
 * TCPA consent gate is checked BEFORE any dial attempt. If consent
 * is denied, a TcpaConsentError is thrown immediately.
 */
export async function initiateCall(params: InitiateCallParams): Promise<InitiateCallResult> {
  const log = logger.child({ tenantId: params.tenantId, businessId: params.businessId });

  // ── TCPA consent gate (non-negotiable) ─────────────────────
  const gate = await consentGate.check(params.tenantId, params.businessId, 'voice');
  if (!gate.allowed) {
    log.warn('[VoiceForgeClient] TCPA consent gate blocked call', { reason: gate.reason });
    throw new TcpaConsentError(gate.reason, gate.message, 'voice', params.businessId);
  }

  log.info('[VoiceForgeClient] Initiating call', { to: params.toPhoneNumber });

  if (useLiveTwilio()) {
    const client = getTwilioClient();
    const twimlBaseUrl = process.env['TWILIO_TWIML_BASE_URL'] ?? 'https://voiceforge.invalid';
    const apiBaseUrl = process.env['API_BASE_URL'] ?? '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callParams: Record<string, any> = {
      to: params.toPhoneNumber,
      from: params.fromPhoneNumber,
      statusCallback: `${apiBaseUrl}/api/webhooks/voiceforge`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: params.record ?? false,
    };

    if (params.twiml) {
      callParams['twiml'] = params.twiml;
    } else {
      callParams['url'] = params.twimlUrl ?? `${twimlBaseUrl}/twiml/outbound`;
    }

    const call = await client.calls.create(callParams);
    log.info('[VoiceForgeClient] Live call created', { callSid: call.sid });

    return { callSid: call.sid, status: call.status, to: call.to, from: call.from };
  }

  // ── Mock mode ───────────────────────────────────────────────
  const callSid = mockCallSid();
  log.info('[VoiceForgeClient] Mock call created', { callSid });
  return { callSid, status: 'queued', to: params.toPhoneNumber, from: params.fromPhoneNumber };
}

/**
 * End an active call by updating its status to "completed".
 */
export async function endCall(callSid: string): Promise<EndCallResult> {
  logger.info('[VoiceForgeClient] Ending call', { callSid });

  if (useLiveTwilio()) {
    const client = getTwilioClient();
    const call = await client.calls(callSid).update({ status: 'completed' });
    return { callSid: call.sid, status: call.status };
  }

  return { callSid, status: 'completed' };
}

/**
 * Fetch the current status of a call.
 */
export async function getCallStatus(callSid: string): Promise<CallStatusResult> {
  logger.info('[VoiceForgeClient] Fetching call status', { callSid });

  if (useLiveTwilio()) {
    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();
    return {
      callSid: call.sid,
      status: call.status,
      direction: call.direction,
      duration: call.duration ?? null,
      startTime: call.startTime ?? null,
      endTime: call.endTime ?? null,
      to: call.to,
      from: call.from,
    };
  }

  return {
    callSid,
    status: 'completed',
    direction: 'outbound-api',
    duration: '120',
    startTime: new Date(Date.now() - 120_000),
    endTime: new Date(),
    to: '+15551234567',
    from: '+15559876543',
  };
}

/**
 * Send an outbound SMS message.
 *
 * TCPA consent gate is checked BEFORE sending. If consent is
 * denied, a TcpaConsentError is thrown.
 */
export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const log = logger.child({ tenantId: params.tenantId, businessId: params.businessId });

  // ── TCPA consent gate (non-negotiable) ─────────────────────
  const gate = await consentGate.check(params.tenantId, params.businessId, 'sms');
  if (!gate.allowed) {
    log.warn('[VoiceForgeClient] TCPA consent gate blocked SMS', { reason: gate.reason });
    throw new TcpaConsentError(gate.reason, gate.message, 'sms', params.businessId);
  }

  log.info('[VoiceForgeClient] Sending SMS', { to: params.to });

  if (useLiveTwilio()) {
    const client = getTwilioClient();
    const apiBaseUrl = process.env['API_BASE_URL'] ?? '';
    const message = await client.messages.create({
      to: params.to,
      from: params.from,
      body: params.body,
      statusCallback: `${apiBaseUrl}/api/webhooks/voiceforge`,
    });
    log.info('[VoiceForgeClient] Live SMS sent', { messageSid: message.sid });
    return {
      messageSid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
    };
  }

  // ── Mock mode ───────────────────────────────────────────────
  const messageSid = mockMessageSid();
  log.info('[VoiceForgeClient] Mock SMS sent', { messageSid });
  return { messageSid, status: 'queued', to: params.to, from: params.from, body: params.body };
}

/**
 * Retrieve the recording for a completed call.
 */
export async function getCallRecording(callSid: string): Promise<CallRecordingResult> {
  logger.info('[VoiceForgeClient] Fetching recording', { callSid });

  if (useLiveTwilio()) {
    const client = getTwilioClient();
    const accountSid = requireEnv('TWILIO_ACCOUNT_SID');

    const recordings = await client.recordings.list({ callSid, limit: 1 });

    if (recordings.length === 0) {
      return { recordingSid: null, callSid, status: 'not_found', duration: null, mediaUrl: null };
    }

    const rec = recordings[0];
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${rec.sid}.mp3`;

    return {
      recordingSid: rec.sid,
      callSid: rec.callSid,
      status: rec.status,
      duration: rec.duration ?? null,
      mediaUrl,
    };
  }

  // ── Mock mode ───────────────────────────────────────────────
  const recordingSid = mockRecordingSid();
  return {
    recordingSid,
    callSid,
    status: 'completed',
    duration: '120',
    mediaUrl: `https://api.twilio.com/stub/recordings/${recordingSid}.mp3`,
  };
}

// ── Reset singleton (for testing) ──────────────────────────────────────────

export function _resetTwilioClient(): void {
  _twilioInstance = null;
}

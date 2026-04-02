// ============================================================
// POST /api/webhooks/voiceforge
// ============================================================
// Receives webhook events from the VoiceForge telephony
// service. Supported event types:
//   - call.completed
//   - call.recording_ready
//   - compliance.flag_raised
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoiceForgeWebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ─── Supported events ───────────────────────────────────────────────────────

const SUPPORTED_EVENTS = new Set([
  'call.completed',
  'call.recording_ready',
  'compliance.flag_raised',
]);

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let payload: VoiceForgeWebhookPayload;

  try {
    payload = (await request.json()) as VoiceForgeWebhookPayload;
  } catch {
    return NextResponse.json(
      { received: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { event, timestamp, data } = payload;

  if (!event || !SUPPORTED_EVENTS.has(event)) {
    console.warn(
      `[voiceforge-webhook] Unknown or missing event type: "${event}"`,
    );
    return NextResponse.json(
      { received: false, error: `Unsupported event: ${event}` },
      { status: 422 },
    );
  }

  // ── Process each event type ────────────────────────────────────────────

  switch (event) {
    case 'call.completed':
      console.log(
        `[voiceforge-webhook] Call completed: callId=${data.callId}, duration=${data.durationSec}s @ ${timestamp}`,
      );
      // TODO: Update call record in database, trigger post-call QA scoring
      break;

    case 'call.recording_ready':
      console.log(
        `[voiceforge-webhook] Recording ready: callId=${data.callId}, url=${data.recordingUrl} @ ${timestamp}`,
      );
      // TODO: Store recording URL, trigger transcription pipeline
      break;

    case 'compliance.flag_raised':
      console.log(
        `[voiceforge-webhook] Compliance flag: callId=${data.callId}, type=${data.flagType}, severity=${data.severity} @ ${timestamp}`,
      );
      // TODO: Create compliance alert, notify compliance team
      break;
  }

  return NextResponse.json({ received: true });
}

// ============================================================
// POST /api/webhooks/visionaudioforge
// ============================================================
// Receives webhook events from the VisionAudioForge document-
// intelligence service. Supported event types:
//   - document.parsed
//   - kyc.verified
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VisionAudioForgeWebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ─── Supported events ───────────────────────────────────────────────────────

const SUPPORTED_EVENTS = new Set([
  'document.parsed',
  'kyc.verified',
]);

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let payload: VisionAudioForgeWebhookPayload;

  try {
    payload = (await request.json()) as VisionAudioForgeWebhookPayload;
  } catch {
    return NextResponse.json(
      { received: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { event, timestamp, data } = payload;

  if (!event || !SUPPORTED_EVENTS.has(event)) {
    console.warn(
      `[visionaudioforge-webhook] Unknown or missing event type: "${event}"`,
    );
    return NextResponse.json(
      { received: false, error: `Unsupported event: ${event}` },
      { status: 422 },
    );
  }

  // ── Process each event type ────────────────────────────────────────────

  switch (event) {
    case 'document.parsed':
      console.log(
        `[visionaudioforge-webhook] Document parsed: docId=${data.documentId}, type=${data.docType}, status=${data.status} @ ${timestamp}`,
      );
      // TODO: Update document record, attach parsed fields to client profile
      break;

    case 'kyc.verified':
      console.log(
        `[visionaudioforge-webhook] KYC verified: docId=${data.documentId}, verified=${data.verified}, name=${data.fullName} @ ${timestamp}`,
      );
      // TODO: Update KYC status on client record, trigger compliance workflow
      break;
  }

  return NextResponse.json({ received: true });
}

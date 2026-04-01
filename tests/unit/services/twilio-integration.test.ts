// ============================================================
// Unit Tests — Twilio Integration
//
// Covers: TwilioClient, TwilioWebhookHandler, TwilioCampaignManager
//
// Run: npx vitest run tests/unit/services/twilio-integration.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  TwilioClient,
  type MakeCallParams,
} from '../../../src/backend/integrations/twilio/twilio-client.js';

import {
  TwilioWebhookHandler,
  validateTwilioSignature,
  _setValidateRequest,
  _resetValidateRequest,
  type TwilioCallStatusPayload,
  type TwilioRecordingPayload,
  type TwilioTranscriptionPayload,
} from '../../../src/backend/integrations/twilio/twilio-webhooks.js';

import {
  TwilioCampaignManager,
  type CampaignConfig,
} from '../../../src/backend/integrations/twilio/twilio-campaigns.js';

import { TcpaConsentError } from '../../../src/backend/services/consent-gate.js';

// ── Mock: twilio npm package ──────────────────────────────────────────────

// Shared mock function references — populated inside vi.mock factory below
const twilioMockFns = {
  mockCallsCreate:                 vi.fn(),
  mockCallsUpdate:                 vi.fn(),
  mockCallsFetch:                  vi.fn(),
  mockRecordingFetch:              vi.fn(),
  mockMessagesCreate:              vi.fn(),
  mockConferencesList:             vi.fn(),
  mockIntelligenceTranscriptsList: vi.fn(),
  mockValidateRequest:             vi.fn().mockReturnValue(true),
};

vi.mock('twilio', () => {
  const {
    mockCallsCreate,
    mockCallsUpdate,
    mockCallsFetch,
    mockRecordingFetch,
    mockMessagesCreate,
    mockConferencesList,
    mockIntelligenceTranscriptsList,
    mockValidateRequest,
  } = twilioMockFns;

  // The factory function returned by require('twilio')
  const twilioFactory = vi.fn(() => ({
    calls: Object.assign(
      vi.fn(() => ({
        update: mockCallsUpdate,
        fetch:  mockCallsFetch,
      })),
      { create: mockCallsCreate },
    ),
    recordings: vi.fn(() => ({
      fetch: mockRecordingFetch,
    })),
    messages: { create: mockMessagesCreate },
    conferences: { list: mockConferencesList },
    intelligence: {
      v2: {
        transcripts: Object.assign(
          vi.fn(() => ({
            sentences: { list: vi.fn().mockResolvedValue([]) },
          })),
          { list: mockIntelligenceTranscriptsList },
        ),
      },
    },
  }));

  // Attach validateRequest to the factory itself (for require() usage).
  // The twilio source files use `require('twilio')` which in CJS interop
  // returns the default export directly, so we attach all needed properties
  // onto twilioFactory so it works both as `require('twilio')(sid, token)`
  // and `require('twilio').validateRequest(...)`.
  Object.assign(twilioFactory, { validateRequest: mockValidateRequest });

  // Returning the factory directly (not wrapped in { default }) ensures that
  // `require('twilio')` in CJS context gets the callable factory function.
  // Setting `default` on the factory covers ESM `import twilio from 'twilio'`.
  (twilioFactory as unknown as Record<string, unknown>)['default'] = twilioFactory;
  return twilioFactory;
});

// ── Mock: consent gate ────────────────────────────────────────────────────

vi.mock('../../../src/backend/services/consent-gate.js', () => ({
  consentGate: {
    check: vi.fn(),
  },
  TcpaConsentError: class TcpaConsentError extends Error {
    public reason:     string;
    public channel:    string;
    public businessId: string;
    constructor(reason: string, message: string, channel: string, businessId: string) {
      super(message ?? reason);
      this.reason     = reason;
      this.channel    = channel;
      this.businessId = businessId;
      this.name       = 'TcpaConsentError';
    }
  },
}));

// ── Mock: event bus ───────────────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => {
  const mockInstance = {
    publish:           vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue(undefined),
    subscribe:         vi.fn(),
    setLedgerWriter:   vi.fn(),
  };
  return {
    eventBus: mockInstance,
    EventBus: {
      getInstance: vi.fn().mockReturnValue(mockInstance),
      reset:       vi.fn(),
    },
  };
});

// ── Import mocked modules ─────────────────────────────────────────────────

import { consentGate } from '../../../src/backend/services/consent-gate.js';
import { eventBus } from '../../../src/backend/events/event-bus.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function getTwilioMocks() {
  return twilioMockFns;
}

/** Build a mock Twilio SDK instance directly from the shared mock functions. */
function makeTwilioInstance() {
  const {
    mockCallsCreate,
    mockCallsUpdate,
    mockCallsFetch,
    mockRecordingFetch,
    mockMessagesCreate,
    mockConferencesList,
    mockIntelligenceTranscriptsList,
  } = twilioMockFns;

  return {
    calls: Object.assign(
      vi.fn(() => ({
        update: mockCallsUpdate,
        fetch:  mockCallsFetch,
      })),
      { create: mockCallsCreate },
    ),
    recordings: vi.fn(() => ({
      fetch: mockRecordingFetch,
    })),
    messages: { create: mockMessagesCreate },
    conferences: { list: mockConferencesList },
    intelligence: {
      v2: {
        transcripts: Object.assign(
          vi.fn(() => ({
            sentences: { list: vi.fn().mockResolvedValue([]) },
          })),
          { list: mockIntelligenceTranscriptsList },
        ),
      },
    },
  };
}

function makeDocumentVaultMock() {
  return {
    upload:   vi.fn().mockResolvedValue({ id: 'vault-doc-001' }),
    autoFile: vi.fn().mockResolvedValue({ id: 'vault-doc-001' }),
  };
}

function makeCallDbRecord(overrides: Record<string, unknown> = {}) {
  return {
    id:              'call-001',
    tenantId:        'tenant-001',
    businessId:      'biz-001',
    advisorId:       null,
    twilioCallSid:   'CA1234567890abcdef1234567890abcdef',
    toPhoneNumber:   '+15550001111',
    fromPhoneNumber: '+15559998888',
    direction:       'outbound',
    status:          'queued',
    purpose:         'Test call',
    campaignType:    null,
    campaignId:      null,
    durationSeconds: null,
    recordingSid:    null,
    recordingUrl:    null,
    transcriptText:  null,
    documentVaultId: null,
    startedAt:       new Date('2026-01-01T00:00:00Z'),
    endedAt:         null,
    createdAt:       new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaMock() {
  const callRecord = makeCallDbRecord();

  return {
    voiceCall: {
      create:    vi.fn().mockResolvedValue(callRecord),
      update:    vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...callRecord, ...data }),
      ),
      findFirst: vi.fn().mockResolvedValue(callRecord),
      findMany:  vi.fn().mockResolvedValue([callRecord]),
      count:     vi.fn().mockResolvedValue(1),
    },
    fundingRound: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    repaymentSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    business: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    doNotCallList: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function setEnvVars() {
  process.env['TWILIO_ACCOUNT_SID'] = 'ACtest123';
  process.env['TWILIO_AUTH_TOKEN']  = 'authtokentest';
  process.env['TWILIO_TWIML_BASE_URL'] = 'https://twiml.test';
  process.env['API_BASE_URL'] = 'https://api.test';
}

// ── TwilioClient — makeCall ───────────────────────────────────────────────

describe('TwilioClient.makeCall', () => {
  let client: TwilioClient;
  let mocks: ReturnType<typeof getTwilioMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
    const prisma = makePrismaMock();
    const vault  = makeDocumentVaultMock();
    client = new TwilioClient(
      prisma as never,
      vault as never,
      makeTwilioInstance() as never,
    );
    mocks = getTwilioMocks();
    mocks['mockCallsCreate'].mockResolvedValue({
      sid: 'CA_test_sid',
      status: 'queued',
      to: '+15550001111',
      from: '+15559998888',
    });
  });

  it('creates a Twilio call with correct to/from numbers', async () => {
    const params: MakeCallParams = {
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      to:         '+15550001111',
      from:       '+15559998888',
    };

    const result = await client.makeCall(params);

    expect(mocks['mockCallsCreate']).toHaveBeenCalledOnce();
    const createArg = mocks['mockCallsCreate'].mock.calls[0][0] as Record<string, unknown>;
    expect(createArg['to']).toBe('+15550001111');
    expect(createArg['from']).toBe('+15559998888');
    expect(result.callSid).toBe('CA_test_sid');
    expect(result.status).toBe('queued');
  });

  it('uses inline twiml string when provided', async () => {
    await client.makeCall({
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      to:         '+15550001111',
      from:       '+15559998888',
      twiml:      '<Response><Say>Hello</Say></Response>',
    });

    const createArg = mocks['mockCallsCreate'].mock.calls[0][0] as Record<string, unknown>;
    expect(createArg['twiml']).toBe('<Response><Say>Hello</Say></Response>');
    expect(createArg['url']).toBeUndefined();
  });

  it('falls back to twimlUrl when no inline twiml', async () => {
    await client.makeCall({
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      to:         '+15550001111',
      from:       '+15559998888',
      twimlUrl:   'https://custom.twiml/outbound',
    });

    const createArg = mocks['mockCallsCreate'].mock.calls[0][0] as Record<string, unknown>;
    expect(createArg['url']).toBe('https://custom.twiml/outbound');
  });

  it('attaches statusCallback URL from API_BASE_URL env', async () => {
    await client.makeCall({
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      to:         '+15550001111',
      from:       '+15559998888',
    });

    const createArg = mocks['mockCallsCreate'].mock.calls[0][0] as Record<string, unknown>;
    expect(createArg['statusCallback']).toContain('https://api.test');
  });
});

// ── TwilioClient — endCall ────────────────────────────────────────────────

describe('TwilioClient.endCall', () => {
  let client: TwilioClient;
  let mocks: ReturnType<typeof getTwilioMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
    client = new TwilioClient(makePrismaMock() as never, makeDocumentVaultMock() as never, makeTwilioInstance() as never);
    mocks  = getTwilioMocks();
    mocks['mockCallsUpdate'].mockResolvedValue({ sid: 'CA_test', status: 'completed' });
  });

  it('calls Twilio update with status completed', async () => {
    const result = await client.endCall('CA_test');

    expect(mocks['mockCallsUpdate']).toHaveBeenCalledWith({ status: 'completed' });
    expect(result.status).toBe('completed');
    expect(result.callSid).toBe('CA_test');
  });
});

// ── TwilioClient — getRecording ───────────────────────────────────────────

describe('TwilioClient.getRecording', () => {
  let client: TwilioClient;
  let vault: ReturnType<typeof makeDocumentVaultMock>;
  let mocks: ReturnType<typeof getTwilioMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
    vault  = makeDocumentVaultMock();
    client = new TwilioClient(makePrismaMock() as never, vault as never, makeTwilioInstance() as never);
    mocks  = getTwilioMocks();
    mocks['mockRecordingFetch'].mockResolvedValue({
      sid:      'RE_test_sid',
      callSid:  'CA_test',
      status:   'completed',
      duration: '90',
    });
  });

  it('returns recording details with media URL', async () => {
    const result = await client.getRecording('RE_test_sid');

    expect(result.recordingSid).toBe('RE_test_sid');
    expect(result.mediaUrl).toContain('ACtest123');
    expect(result.duration).toBe('90');
  });

  it('auto-archives completed recording to Document Vault when context provided', async () => {
    await client.getRecording('RE_test_sid', {
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      callId:     'call-001',
    });

    expect(vault.upload).toHaveBeenCalledOnce();
    const uploadArg = vault.upload.mock.calls[0][0] as Record<string, unknown>;
    expect(uploadArg['tenantId']).toBe('tenant-001');
    expect(uploadArg['documentType']).toBe('receipt');
  });

  it('does not archive when recording status is not completed', async () => {
    mocks['mockRecordingFetch'].mockResolvedValue({
      sid:      'RE_test_sid',
      callSid:  'CA_test',
      status:   'processing',
      duration: null,
    });

    const result = await client.getRecording('RE_test_sid', {
      tenantId:   'tenant-001',
      businessId: 'biz-001',
    });

    expect(vault.upload).not.toHaveBeenCalled();
    expect(result.documentVaultId).toBeNull();
  });
});

// ── TwilioClient — sendSms (TCPA gate) ────────────────────────────────────

describe('TwilioClient.sendSms — TCPA gate', () => {
  let client: TwilioClient;
  let mocks: ReturnType<typeof getTwilioMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
    client = new TwilioClient(makePrismaMock() as never, makeDocumentVaultMock() as never, makeTwilioInstance() as never);
    mocks  = getTwilioMocks();
  });

  it('sends SMS when consent is granted', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);
    mocks['mockMessagesCreate'].mockResolvedValue({
      sid:    'SM_test_sid',
      status: 'queued',
      to:     '+15550001111',
      from:   '+15559998888',
      body:   'Hello',
    });

    const result = await client.sendSms({
      tenantId:   'tenant-001',
      businessId: 'biz-001',
      to:         '+15550001111',
      from:       '+15559998888',
      body:       'Hello',
    });

    expect(result.messageSid).toBe('SM_test_sid');
    expect(mocks['mockMessagesCreate']).toHaveBeenCalledOnce();
  });

  it('throws TcpaConsentError when SMS consent is denied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({
      allowed: false,
      reason:  'CONSENT_MISSING',
      message: 'No SMS consent on file.',
    } as never);

    await expect(
      client.sendSms({
        tenantId:   'tenant-001',
        businessId: 'biz-001',
        to:         '+15550001111',
        from:       '+15559998888',
        body:       'Test message',
      }),
    ).rejects.toThrow(TcpaConsentError);

    expect(mocks['mockMessagesCreate']).not.toHaveBeenCalled();
  });
});

// ── TwilioWebhookHandler — call-completed ────────────────────────────────

describe('TwilioWebhookHandler.handleCallStatus — completed', () => {
  let handler: TwilioWebhookHandler;
  let prisma:  ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma  = makePrismaMock();
    handler = new TwilioWebhookHandler(prisma as never, makeDocumentVaultMock() as never);
  });

  const completedPayload: TwilioCallStatusPayload = {
    CallSid:    'CA1234567890abcdef1234567890abcdef',
    CallStatus: 'completed',
    Duration:   '120',
    From:       '+15559998888',
    To:         '+15550001111',
  };

  it('updates call status to completed in the database', async () => {
    await handler.handleCallStatus(completedPayload);

    expect(prisma.voiceCall.update).toHaveBeenCalledOnce();
    const updateArg = prisma.voiceCall.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data['status']).toBe('completed');
  });

  it('sets durationSeconds from the Duration field', async () => {
    await handler.handleCallStatus(completedPayload);

    const updateArg = prisma.voiceCall.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data['durationSeconds']).toBe(120);
  });

  it('publishes CALL_COMPLETED event to event bus', async () => {
    await handler.handleCallStatus(completedPayload);

    expect(vi.mocked(eventBus.publishAndPersist)).toHaveBeenCalledOnce();
    const publishArg = vi.mocked(eventBus.publishAndPersist).mock.calls[0][1] as {
      eventType: string;
    };
    expect(publishArg.eventType).toBe('call.completed');
  });

  it('returns processed: false when no matching call record exists', async () => {
    prisma.voiceCall.findFirst.mockResolvedValue(null);

    const result = await handler.handleCallStatus(completedPayload);

    expect(result.processed).toBe(false);
    expect(prisma.voiceCall.update).not.toHaveBeenCalled();
  });
});

// ── TwilioWebhookHandler — recording-available ────────────────────────────

describe('TwilioWebhookHandler.handleRecordingAvailable', () => {
  let handler: TwilioWebhookHandler;
  let prisma:  ReturnType<typeof makePrismaMock>;
  let vault:   ReturnType<typeof makeDocumentVaultMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma  = makePrismaMock();
    vault   = makeDocumentVaultMock();
    handler = new TwilioWebhookHandler(prisma as never, vault as never);
  });

  const recordingPayload: TwilioRecordingPayload = {
    CallSid:          'CA1234567890abcdef1234567890abcdef',
    RecordingSid:     'RE_abc123',
    RecordingUrl:     'https://api.twilio.com/2010-04-01/Accounts/ACtest/Recordings/RE_abc123',
    RecordingStatus:  'completed',
    RecordingDuration: '90',
  };

  it('persists recording SID and URL on the VoiceCall record', async () => {
    await handler.handleRecordingAvailable(recordingPayload);

    expect(prisma.voiceCall.update).toHaveBeenCalled();
    const updateCalls = prisma.voiceCall.update.mock.calls;
    const firstUpdate = updateCalls[0][0] as { data: Record<string, unknown> };
    expect(firstUpdate.data['recordingSid']).toBe('RE_abc123');
    expect(firstUpdate.data['recordingUrl']).toContain('RE_abc123');
  });

  it('auto-files recording to Document Vault', async () => {
    await handler.handleRecordingAvailable(recordingPayload);

    expect(vault.upload).toHaveBeenCalledOnce();
  });

  it('publishes recording.available event to event bus', async () => {
    await handler.handleRecordingAvailable(recordingPayload);

    const publishedEvents = vi.mocked(eventBus.publish).mock.calls.map(
      (c) => (c[1] as { eventType: string }).eventType,
    );
    expect(publishedEvents).toContain('recording.available');
  });

  it('returns processed: true on success', async () => {
    const result = await handler.handleRecordingAvailable(recordingPayload);
    expect(result.processed).toBe(true);
  });
});

// ── TwilioWebhookHandler — transcription-available ───────────────────────

describe('TwilioWebhookHandler.handleTranscriptionAvailable', () => {
  let handler: TwilioWebhookHandler;
  let prisma:  ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma  = makePrismaMock();
    handler = new TwilioWebhookHandler(prisma as never, makeDocumentVaultMock() as never);
  });

  const transcriptionPayload: TwilioTranscriptionPayload = {
    CallSid:             'CA1234567890abcdef1234567890abcdef',
    TranscriptionSid:    'TR_abc123',
    TranscriptionText:   'Hello this is a test transcript.',
    TranscriptionStatus: 'completed',
  };

  it('caches transcript text on the VoiceCall record', async () => {
    await handler.handleTranscriptionAvailable(transcriptionPayload);

    expect(prisma.voiceCall.update).toHaveBeenCalledOnce();
    const updateArg = prisma.voiceCall.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data['transcriptText']).toBe('Hello this is a test transcript.');
  });

  it('does not update DB when transcription status is not completed', async () => {
    await handler.handleTranscriptionAvailable({
      ...transcriptionPayload,
      TranscriptionStatus: 'failed',
    });

    expect(prisma.voiceCall.update).not.toHaveBeenCalled();
  });

  it('publishes transcription.available event to event bus', async () => {
    await handler.handleTranscriptionAvailable(transcriptionPayload);

    const publishedEvents = vi.mocked(eventBus.publish).mock.calls.map(
      (c) => (c[1] as { eventType: string }).eventType,
    );
    expect(publishedEvents).toContain('transcription.available');
  });
});

// ── validateTwilioSignature ───────────────────────────────────────────────

describe('validateTwilioSignature', () => {
  beforeEach(() => {
    // Inject mock so validateTwilioSignature uses the test stub
    _setValidateRequest(twilioMockFns.mockValidateRequest as unknown as Parameters<typeof _setValidateRequest>[0]);
  });

  afterEach(() => {
    _resetValidateRequest();
  });

  it('returns true when signature is valid (twilio.validateRequest returns true)', () => {
    const result = validateTwilioSignature(
      'auth-token',
      'valid-sig',
      'https://api.test/webhooks',
      { CallSid: 'CA123', CallStatus: 'completed' },
    );

    expect(result).toBe(true);
  });
});

// ── TwilioCampaignManager — TCPA gate enforcement ────────────────────────

describe('TwilioCampaignManager — TCPA gate enforcement', () => {
  let manager: TwilioCampaignManager;
  let prisma:  ReturnType<typeof makePrismaMock>;
  let twilioClientMock: {
    makeCall: ReturnType<typeof vi.fn>;
  };

  const campaignConfig: CampaignConfig = {
    tenantId:        'tenant-001',
    fromPhoneNumber: '+15559998888',
    callsPerSecond:  100, // fast for tests
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
    prisma = makePrismaMock();
    twilioClientMock = { makeCall: vi.fn().mockResolvedValue({ callSid: 'CA_new', status: 'queued', to: '+15550001111', from: '+15559998888' }) };
    manager = new TwilioCampaignManager(
      prisma as never,
      twilioClientMock as never,
    );
  });

  it('blocks APR expiry campaign calls when TCPA consent is denied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({
      allowed: false,
      reason:  'CONSENT_MISSING',
      message: 'No consent.',
    } as never);

    prisma.fundingRound.findMany.mockResolvedValue([
      {
        id:            'round-001',
        business:      { id: 'biz-001', phoneNumber: '+15550001111' },
        aprExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await manager.runAprExpiryCampaign(campaignConfig);

    expect(result.consentBlocked).toBe(1);
    expect(result.callsInitiated).toBe(0);
    expect(twilioClientMock.makeCall).not.toHaveBeenCalled();
  });

  it('initiates calls for consented businesses in repayment reminder campaign', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);

    prisma.repaymentSchedule.findMany.mockResolvedValue([
      {
        id:       'sched-001',
        business: { id: 'biz-001', phoneNumber: '+15550001111' },
        dueDate:  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await manager.runRepaymentReminderCampaign(campaignConfig);

    expect(result.callsInitiated).toBe(1);
    expect(result.consentBlocked).toBe(0);
    expect(twilioClientMock.makeCall).toHaveBeenCalledOnce();
  });

  it('skips DNC-listed phone numbers before consent check', async () => {
    prisma.doNotCallList.findFirst.mockResolvedValue({ id: 'dnc-001', phoneNumber: '+15550001111' });

    prisma.fundingRound.findMany.mockResolvedValue([
      {
        id:            'round-001',
        business:      { id: 'biz-001', phoneNumber: '+15550001111' },
        aprExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await manager.runAprExpiryCampaign(campaignConfig);

    expect(result.dncBlocked).toBe(1);
    expect(result.callsInitiated).toBe(0);
    // Consent gate should NOT have been queried for a DNC-blocked target
    expect(vi.mocked(consentGate.check)).not.toHaveBeenCalled();
  });

  it('deduplicates targets in repayment reminder (one call per business)', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);

    // Two schedules for the same business
    prisma.repaymentSchedule.findMany.mockResolvedValue([
      { id: 'sched-001', business: { id: 'biz-001', phoneNumber: '+15550001111' }, dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
      { id: 'sched-002', business: { id: 'biz-001', phoneNumber: '+15550001111' }, dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000) },
    ]);

    const result = await manager.runRepaymentReminderCampaign(campaignConfig);

    expect(result.totalTargets).toBe(1);
    expect(twilioClientMock.makeCall).toHaveBeenCalledOnce();
  });

  it('runs restack consultation campaign for eligible businesses', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);

    prisma.business.findMany.mockResolvedValue([
      { id: 'biz-001', phoneNumber: '+15550001111' },
      { id: 'biz-002', phoneNumber: '+15550002222' },
    ]);

    const result = await manager.runRestackConsultationCampaign(campaignConfig);

    expect(result.totalTargets).toBe(2);
    expect(result.callsInitiated).toBe(2);
    expect(twilioClientMock.makeCall).toHaveBeenCalledTimes(2);
  });

  it('persists a VoiceCall record for each initiated call', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);

    prisma.business.findMany.mockResolvedValue([
      { id: 'biz-001', phoneNumber: '+15550001111' },
    ]);

    await manager.runRestackConsultationCampaign(campaignConfig);

    expect(prisma.voiceCall.create).toHaveBeenCalledOnce();
    const createArg = prisma.voiceCall.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data['campaignType']).toBe('restack_consultation');
    expect(createArg.data['direction']).toBe('outbound');
  });

  it('publishes call.initiated event for each successful dial', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);

    prisma.business.findMany.mockResolvedValue([
      { id: 'biz-001', phoneNumber: '+15550001111' },
    ]);

    await manager.runRestackConsultationCampaign(campaignConfig);

    const publishedEventTypes = vi.mocked(eventBus.publish).mock.calls.map(
      (c) => (c[1] as { eventType: string }).eventType,
    );
    expect(publishedEventTypes).toContain('call.initiated');
  });

  it('counts errors from Twilio API failures without crashing campaign', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true } as never);
    twilioClientMock.makeCall.mockRejectedValue(new Error('Twilio API unavailable'));

    prisma.business.findMany.mockResolvedValue([
      { id: 'biz-001', phoneNumber: '+15550001111' },
    ]);

    const result = await manager.runRestackConsultationCampaign(campaignConfig);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].businessId).toBe('biz-001');
    expect(result.callsInitiated).toBe(0);
  });
});

// ============================================================
// The Office adapter: the manifest, the split, and the guards
//
// The manifest is the only artefact in the bridge that is derived rather than
// declared, and that property is the whole reason The Office asks a Forge what
// it dispatches instead of reading its own registry. A literal list maintained
// beside the dispatch map would answer identically today and drift silently
// afterwards, while carrying the authority of having come from the Forge.
//
// So the first half of this file checks the property, not the contents: it
// reads office.routes.ts as text and fails if the manifest stops being built
// from the map. A test that only asserted the five module names would pass on a
// hardcoded list, which is exactly the failure it exists to prevent.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `vi.hoisted` because vi.mock factories are lifted above every const in the
// file, so a spy declared normally is in the temporal dead zone when the mock
// is evaluated.
const { publishAndPersist } = vi.hoisted(() => ({
  publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt', publishedAt: new Date() }),
}));

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: { publishAndPersist },
}));

vi.mock('../../../src/backend/config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

const SECRET = 'office-shared-secret-for-tests';
const TENANT = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = '22222222-2222-4222-8222-222222222222';

process.env['OFFICE_SHARED_SECRET'] = SECRET;
process.env['OFFICE_VENTURE_TENANTS'] = `burkham-wickmont:${TENANT}`;
process.env['OFFICE_SERVICE_PRINCIPAL_ID'] = PRINCIPAL;
process.env['JWT_ACCESS_SECRET'] ??= 'test-access-secret-at-least-32-characters-long';

import {
  officeRouter,
  moduleIds,
  moduleManuals,
  setInnerCaller,
  type InnerRequest,
  HEADER_FORGE_REQUEST_ID,
} from '../../../src/backend/api/routes/office.routes.js';
import { verifyAccessToken } from '../../../src/backend/config/auth.js';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/backend/api/routes/office.routes.ts'),
  'utf8',
);

// -- A minimal request/response pair --------------------------

interface Sent {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function call(
  method: 'GET' | 'POST',
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<Sent> {
  const sent: Sent = { status: 200, body: undefined, headers: {} };

  const req = {
    method,
    url: path,
    originalUrl: `/api/office${path}`,
    headers: { ...(options.headers ?? {}) },
    body: options.body,
    params: {},
    query: {},
  } as unknown as Parameters<typeof officeRouter>[0];

  return new Promise((resolve, reject) => {
    const res = {
      setHeader(name: string, value: string) {
        sent.headers[name] = value;
        return this;
      },
      status(code: number) {
        sent.status = code;
        return this;
      },
      json(payload: unknown) {
        sent.body = payload;
        resolve(sent);
        return this;
      },
    } as unknown as Parameters<typeof officeRouter>[1];

    officeRouter(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve({ ...sent, status: 404, body: { unhandled: true } });
    });
  });
}

const auth = (extra: Record<string, string> = {}): Record<string, string> => ({
  authorization: `Bearer ${SECRET}`,
  'x-office-venture': 'burkham-wickmont',
  'x-office-agent-id': '33333333-3333-4333-8333-333333333333',
  'x-office-trace': '44444444-4444-4444-8444-444444444444',
  'x-office-forge-api-version': '1.0.0',
  ...extra,
});

let seen: InnerRequest[] = [];
let restore: ReturnType<typeof setInnerCaller>;

beforeAll(() => {
  restore = setInnerCaller(async (request) => {
    seen.push(request);
    return { status: 200, body: { success: true, data: { id: 'client-1' } } };
  });
});

afterAll(() => {
  setInnerCaller(restore);
});

// ============================================================
// The manifest is derived
// ============================================================

describe('the manifest is derived from the dispatch map', () => {
  it('is built by iterating MODULES, not from a literal list', () => {
    // The property, checked in the source. `Object.entries(MODULES)` inside the
    // /_modules handler is what makes a name present if and only if a handler is
    // bound to it. If this assertion is what broke, do not fix it by updating
    // the string - fix it by not maintaining a second list.
    const handler = SOURCE.slice(SOURCE.indexOf("officeRouter.get('/_modules'"));
    expect(handler).toContain('Object.entries(MODULES)');

    const literal = /modules:\s*\[\s*['"]/.exec(handler);
    expect(
      literal,
      'the manifest names a module as a string literal - it must be derived from the map',
    ).toBeNull();
  });

  it('answers with every bound module and nothing else', async () => {
    const res = await call('GET', '/_modules', { headers: auth() });

    expect(res.status).toBe(200);
    const body = res.body as { modules: { module_id: string }[]; forge_id: string };
    expect(body.forge_id).toBe('capitalforge');
    expect(body.modules.map((m) => m.module_id)).toEqual(moduleIds());
  });

  it('states a shape for every module, in the three values the registry accepts', async () => {
    const res = await call('GET', '/_modules', { headers: auth() });
    const body = res.body as {
      modules: { module_id: string; is_mutating: boolean; idempotency_support: string }[];
    };

    for (const entry of body.modules) {
      expect(typeof entry.is_mutating).toBe('boolean');
      expect(['key', 'natural', 'at_most_once']).toContain(entry.idempotency_support);
    }
  });

  it('names an operating instruction for every module, and no manual twice', async () => {
    // The acceptance criterion: every id has a manual and every manual an id.
    // This half is self-attestation - it proves the map names a file, not that
    // the file exists or that it describes this module. The Office's
    // `check_module_manuals.py` proves that, because that is where the manuals
    // live.
    const manuals = moduleManuals();
    const names = Object.values(manuals);

    expect(names.length).toBe(moduleIds().length);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^capitalforge-[a-z0-9-]+\.md$/);
    }
  });
});

// ============================================================
// record_consent is split
// ============================================================

describe('consent_grant records; it does not contact anyone', () => {
  it('binds exactly one operation, and it is the write to the consent table', async () => {
    seen = [];
    const res = await call('POST', '/consent_grant', {
      headers: auth(),
      body: { business_id: 'biz-1', channel: 'sms' },
    });

    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.path).toBe('/api/businesses/biz-1/consent');
  });

  it('does not dispatch the re-consent email under any view', async () => {
    // POST /api/clients/:clientId/consent/request emails a client. It sat under
    // `record_consent` in the Burkham Pack alongside the row write, so one grant
    // covered filing a record and sending mail to a person. It is a separate
    // module (`client_consent_request`), unbound until it has its own manual and
    // its own grant.
    seen = [];
    const res = await call('POST', '/consent_grant', {
      headers: auth(),
      body: { view: 'request', business_id: 'biz-1', channel: 'sms' },
    });

    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe('VIEW_NOT_BOUND');
    expect(seen).toHaveLength(0);
  });

  it('binds no operation on any module that reaches /consent/request', async () => {
    // Exercised rather than grepped. The source mentions the path in the comment
    // explaining why it is unbound, so a text search would fail on the
    // explanation; what matters is that no operation builds it.
    seen = [];
    const res = await call('GET', '/_modules', { headers: auth() });
    const manifest = (res.body as { modules: { module_id: string; operations: string[] }[] })
      .modules;

    for (const entry of manifest) {
      for (const view of entry.operations) {
        await call('POST', `/${entry.module_id}`, {
          headers: auth(),
          body: { view, client_id: 'client-1', business_id: 'biz-1', channel: 'sms' },
        });
      }
    }

    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.path).not.toContain('/consent/request');
    }
  });

  it('does not dispatch client_consent_request, because it is not bound', async () => {
    const res = await call('POST', '/client_consent_request', {
      headers: auth(),
      body: { client_id: 'client-1' },
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('MODULE_NOT_BOUND');
    expect(moduleIds()).not.toContain('client_consent_request');
  });
});

// ============================================================
// Authentication and tenancy
// ============================================================

describe('the door', () => {
  it('refuses a caller with no credential', async () => {
    const res = await call('GET', '/_modules');
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('OFFICE_CREDENTIAL_REJECTED');
  });

  it('refuses a caller with the wrong credential', async () => {
    const res = await call('GET', '/_modules', {
      headers: { authorization: `Bearer ${SECRET}x` },
    });
    expect(res.status).toBe(401);
  });

  it('stamps X-Forge-Request-Id even on a refusal', async () => {
    const res = await call('GET', '/_modules');
    expect(res.headers[HEADER_FORGE_REQUEST_ID]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a venture it has no tenant for, rather than picking one', async () => {
    seen = [];
    const res = await call('POST', '/client_read', {
      headers: auth({ 'x-office-venture': 'some-other-venture' }),
      body: { view: 'profile', client_id: 'client-1' },
    });

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('VENTURE_NOT_MAPPED');
    expect(seen).toHaveLength(0);
  });

  it('refuses a call with no venture header', async () => {
    const headers = auth();
    delete headers['x-office-venture'];
    const res = await call('POST', '/client_read', {
      headers,
      body: { view: 'profile', client_id: 'client-1' },
    });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// The internal token
// ============================================================

describe('the internal token carries only what the module needs', () => {
  it('mints the called module permissions and the mapped tenant', async () => {
    seen = [];
    await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: 'client-1' },
    });

    const verified = await verifyAccessToken(seen[0]!.token);
    expect(verified.valid).toBe(true);
    if (!verified.valid) return;

    expect(verified.payload.tenantId).toBe(TENANT);
    expect(verified.payload.sub).toBe(PRINCIPAL);
    expect(verified.payload.permissions).toEqual(['business:read']);
  });

  it('does not give client_read the PII or credit permissions', async () => {
    seen = [];
    await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: 'client-1' },
    });

    const verified = await verifyAccessToken(seen[0]!.token);
    if (!verified.valid) throw new Error('token did not verify');

    expect(verified.payload.permissions).not.toContain('business:read:pii');
    expect(verified.payload.permissions).not.toContain('business:read:credit');
  });

  it('gives client_read_pii the floor and the specific one', async () => {
    seen = [];
    await call('POST', '/client_read_pii', {
      headers: auth(),
      body: { view: 'owners', client_id: 'client-1' },
    });

    const verified = await verifyAccessToken(seen[0]!.token);
    if (!verified.valid) throw new Error('token did not verify');

    expect(verified.payload.permissions).toEqual(['business:read', 'business:read:pii']);
  });
});

// ============================================================
// Dispatch
// ============================================================

describe('dispatch', () => {
  it('refuses a module it does not bind', async () => {
    const res = await call('POST', '/lender_match', {
      headers: auth(),
      body: {},
    });
    expect(res.status).toBe(404);
  });

  it('requires a view when a module has more than one operation', async () => {
    const res = await call('POST', '/client_read', {
      headers: auth(),
      body: { client_id: 'client-1' },
    });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe('VIEW_REQUIRED');
  });

  it('refuses a payload missing a path argument', async () => {
    const res = await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile' },
    });
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe('PAYLOAD_INVALID');
  });

  it('encodes a caller-supplied id into the path', async () => {
    seen = [];
    await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: '../admin' },
    });
    expect(seen[0]!.path).toBe('/api/clients/..%2Fadmin');
  });

  it('maps every read operation to a GET', async () => {
    seen = [];
    for (const [moduleId, views] of [
      ['client_read', ['profile', 'documents', 'acknowledgments', 'compliance', 'compliance_status', 'repayment']],
      ['client_read_pii', ['owners', 'timeline', 'ach_authorization']],
      ['client_read_credit', ['business', 'personal', 'history', 'recommendations']],
      ['restack_recommend', ['check', 'eligible', 'opportunities']],
    ] as [string, string[]][]) {
      for (const view of views) {
        await call('POST', `/${moduleId}`, {
          headers: auth(),
          body: { view, client_id: 'client-1', business_id: 'biz-1' },
        });
      }
    }

    expect(seen).toHaveLength(16);
    for (const request of seen) {
      expect(request.method).toBe('GET');
      expect(request.body).toBeUndefined();
    }
  });

  it('passes the Forge answer through with its own status', async () => {
    const previous = setInnerCaller(async () => ({
      status: 404,
      body: { success: false, error: { code: 'CLIENT_NOT_FOUND' } },
    }));

    const res = await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: 'nope' },
    });

    setInnerCaller(previous);
    expect(res.status).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('CLIENT_NOT_FOUND');
  });
});

// ============================================================
// The record on this side
// ============================================================

describe('every brokered call is recorded', () => {
  it('writes one ledger row joined to The Office by the trace id', async () => {
    publishAndPersist.mockClear();
    await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: 'client-1' },
    });

    expect(publishAndPersist).toHaveBeenCalledTimes(1);
    const [tenantId, envelope] = publishAndPersist.mock.calls[0] as [
      string,
      { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
    ];

    expect(tenantId).toBe(TENANT);
    expect(envelope.eventType).toBe('office.module.called');
    expect(envelope.aggregateType).toBe('office_call');
    expect(envelope.aggregateId).toBe('44444444-4444-4444-8444-444444444444');
    expect(envelope.payload['moduleId']).toBe('client_read');
    expect(envelope.payload['officeAgentId']).toBe('33333333-3333-4333-8333-333333333333');
    expect(envelope.payload['status']).toBe(200);
  });

  it('records a read, even though the module itself writes nothing', async () => {
    // capitalforge-client-read.md section 2 says the module records nothing,
    // "including no record that the read happened". True of a human's call. An
    // autonomous agent reading a client's file must leave a trace on the side
    // that holds the file, so the adapter writes an access record - which is not
    // a business event, and not something the module did.
    publishAndPersist.mockClear();
    await call('POST', '/client_read_pii', {
      headers: auth(),
      body: { view: 'owners', client_id: 'client-1' },
    });

    expect(publishAndPersist).toHaveBeenCalledTimes(1);
  });

  it('still answers when the ledger write fails', async () => {
    publishAndPersist.mockRejectedValueOnce(new Error('ledger down'));

    const res = await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile', client_id: 'client-1' },
    });

    // The call happened. Reporting a failure would make The Office retry.
    expect(res.status).toBe(200);
  });

  it('writes no row for a call that was refused before it reached CapitalForge', async () => {
    publishAndPersist.mockClear();
    await call('POST', '/client_read', {
      headers: auth(),
      body: { view: 'profile' },
    });
    expect(publishAndPersist).not.toHaveBeenCalled();
  });
});

// ============================================================
// The wiring
// ============================================================

describe('the mount', () => {
  const INDEX = readFileSync(join(process.cwd(), 'src/backend/api/routes/index.ts'), 'utf8');

  it('is mounted under /api/office', () => {
    expect(INDEX).toContain("apiRouter.use('/office', officeRouter)");
  });

  it('is opted out of the user auth gate, since it authenticates differently', () => {
    expect(INDEX).toMatch(/\/\^\\\/office/);
  });

  it('is mounted only when the bridge is configured', () => {
    // An adapter that served /_modules while holding no credential to check
    // would tell The Office that CapitalForge is bridged when it is not.
    expect(INDEX).toContain('if (officeBridgeConfigured())');
  });
});

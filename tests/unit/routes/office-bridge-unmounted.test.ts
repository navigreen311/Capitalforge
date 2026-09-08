// ============================================================
// The Office bridge has three states, and two of them used to look the same
//
// `.env.example` has always stated the intent: "When any is absent the adapter
// is NOT MOUNTED and /api/office 404s, which The Office reads as 'serves no
// manifest' - the truth." It was not what happened. Nothing matched `/office`,
// the request fell through to a router mounted at '/' in api/routes/index.ts,
// and that router's `tenantMiddleware` answered
// `401 UNAUTHORIZED - Authentication token required.`
//
// A surface with no credential configured was reporting that the caller's
// credential was the problem. Filed as Capitalforge#92.
//
// WHY IT SURVIVED, AND WHY THAT DICTATES THE SHAPE OF THIS FILE
// ============================================================
//
// The lie and the truth share a status. A MOUNTED bridge refuses an
// unauthenticated caller with `401 OFFICE_CREDENTIAL_REJECTED`, so anyone
// checking the status alone saw a 401 and saw what they expected. The evidence
// that nothing was checking a credential was the ABSENCE of that code, and an
// absence is not a thing a reader notices.
//
// So the three states are asserted SEPARATELY, and then asserted to differ:
//
//   1. unconfigured                -> 404 OFFICE_BRIDGE_NOT_CONFIGURED
//   2. configured, bad credential  -> 401 OFFICE_CREDENTIAL_REJECTED
//   3. configured, good credential -> 200 and the manifest
//
// A single test that only walked one of those would have passed throughout the
// defect's life. The property that matters is that 1 and 2 are distinguishable,
// which is why it gets a test of its own that reads both responses.
//
// THE UNCONFIGURED STATE IS CONSTRUCTED HERE, NOT SAMPLED FROM THE MACHINE
// =======================================================================
//
// The bridge is configured on the machine this fix was written on, and a live
// server there already answers state 2 and state 3 correctly. That is exactly
// why these tests build their own environment: a test that passes only because
// an operator has configured the deployment is a test that verifies the
// operator, not the code. The defect lives in the code path for the
// unconfigured state, and every fresh checkout and every new deployment starts
// in that state.
//
// `officeBridgeConfigured()` is called at IMPORT time in index.ts, inside the
// `if` that decides the mount. So the environment has to be set before the
// import, not before the request - hence `vi.resetModules()` and a dynamic
// import per state. No production file is changed to make this possible, and
// no `.env` file is read or written.
//
// Nothing here binds a port. The request is a real `http.IncomingMessage` and
// the response a real `http.ServerResponse` driven through a real express app,
// so `req.path`, the mount matching and the status codes are the production
// ones - but no socket is ever listened on. A live CapitalForge runs on :4000
// and this suite must not go anywhere near it.
// ============================================================

import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { type Express } from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const SECRET = 'office-shared-secret-for-the-unmounted-bridge-suite';
const TENANT = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = '22222222-2222-4222-8222-222222222222';

// A user JWT secret, so the generic auth gate can run rather than throwing.
// Nothing in this file presents a user token; the point is what happens to a
// caller who has none.
process.env['JWT_ACCESS_SECRET'] ??= 'test-access-secret-at-least-32-characters-long';

/** The three variables `officeBridgeConfigured()` reads. Set, or absent. */
function setBridgeEnv(configured: boolean): void {
  if (configured) {
    process.env['OFFICE_SHARED_SECRET'] = SECRET;
    process.env['OFFICE_VENTURE_TENANTS'] = `burkham-wickmont:${TENANT}`;
    process.env['OFFICE_SERVICE_PRINCIPAL_ID'] = PRINCIPAL;
  } else {
    delete process.env['OFFICE_SHARED_SECRET'];
    delete process.env['OFFICE_VENTURE_TENANTS'];
    delete process.env['OFFICE_SERVICE_PRINCIPAL_ID'];
  }
}

/**
 * An app composed the way server.ts composes it: `apiRouter` under `/api`, the
 * 404 catch-all behind it, the error handler last.
 *
 * The mount order is the substance. Testing `officeRouter` on its own cannot
 * see this defect at all - the fall-through is to OTHER routers, and a router
 * examined in isolation has nothing to fall through to.
 */
async function buildApp(configured: boolean): Promise<Express> {
  vi.resetModules();
  setBridgeEnv(configured);

  const { apiRouter } = await import('../../../src/backend/api/routes/index.js');
  const { notFoundHandler, globalErrorHandler } = await import(
    '../../../src/backend/middleware/error-handler.js'
  );

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(globalErrorHandler);
  return app;
}

// Built once per state. The mount decision is frozen at import, so an app is
// only ever the state it was built in; `appFor` re-applies the environment on
// every call because the shared secret is read LAZILY, per request.
const built = new Map<boolean, Promise<Express>>();

function appFor(configured: boolean): Promise<Express> {
  setBridgeEnv(configured);
  let app = built.get(configured);
  if (app === undefined) {
    app = buildApp(configured);
    built.set(configured, app);
  }
  return app;
}

// `apiRouter` pulls in every route module in the API, which is a few seconds of
// transform on a cold runner - comfortably past vitest's 5s default. Paid once,
// here, with a timeout that says so, rather than leaving the first test in the
// file to fail on a clock instead of on a claim.
beforeAll(async () => {
  await appFor(false);
  await appFor(true);
}, 120_000);

interface Answer {
  status: number;
  code: string | undefined;
  body: unknown;
}

/** Drives a real express pipeline in-process. Binds nothing. */
function inject(
  app: Express,
  method: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<Answer> {
  return new Promise<Answer>((resolve, reject) => {
    const req = new IncomingMessage(new Socket());
    req.method = method;
    req.url = url;
    req.headers = { host: '127.0.0.1', ...headers };

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    const collect = (chunk: unknown): void => {
      if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        chunks.push(Buffer.from(chunk as string | Buffer));
      }
    };
    const done = (rest: unknown[]): void => {
      const last = rest[rest.length - 1];
      if (typeof last === 'function') (last as () => void)();
    };

    // Replaced rather than wrapped: with no socket assigned, the real ones
    // would try to write to one. Everything above this line is express's.
    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      collect(chunk);
      done(rest);
      return true;
    }) as typeof res.write;

    res.end = ((chunk: unknown, ...rest: unknown[]) => {
      collect(chunk);
      done(rest);
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // A non-JSON body is a legitimate answer here; keep the text.
      }
      const error = (body as { error?: { code?: unknown } } | null)?.error;
      const code = typeof error?.code === 'string' ? error.code : undefined;
      resolve({ status: res.statusCode, code, body });
      return res;
    }) as typeof res.end;

    const timer = setTimeout(() => reject(new Error(`no response for ${method} ${url}`)), 20_000);
    timer.unref();

    app(req, res);
  });
}

const OFFICE_MANIFEST = '/api/office/_modules';

const withCredential = (secret: string): Record<string, string> => ({
  authorization: `Bearer ${secret}`,
  'x-office-venture': 'burkham-wickmont',
  'x-office-forge-api-version': '1.0.0',
});

// ============================================================
// State 1 - the bridge is not configured
// ============================================================

describe('an unconfigured Office bridge', () => {
  it('answers the manifest path with 404, as .env.example says it does', async () => {
    const answer = await inject(await appFor(false), 'GET', OFFICE_MANIFEST);

    expect(answer.status).toBe(404);
    expect(answer.code).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
  });

  it('does not answer 401 UNAUTHORIZED from a tenant middleware it never reached', async () => {
    // The regression itself. This is what the surface returned before the
    // `else` branch existed: the request fell past /office into a router
    // mounted at '/', whose tenantMiddleware reported a missing token on a
    // surface that reads no token.
    const answer = await inject(await appFor(false), 'GET', OFFICE_MANIFEST);

    expect(answer.status).not.toBe(401);
    expect(answer.code).not.toBe('UNAUTHORIZED');
  });

  it('answers 404 on a sub-path under /office that no module would serve', async () => {
    // The fall-through was never specific to `_modules`; it applied to
    // anything under the prefix. A handler that terminated only the manifest
    // path would leave the old 401 in place everywhere else.
    const answer = await inject(await appFor(false), 'GET', '/api/office/definitely-not-a-route');

    expect(answer.status).toBe(404);
    expect(answer.code).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
  });

  it('answers 404 to a POST at a module path, not only to a GET', async () => {
    // A brokered call is a POST. If the terminating handler answered GETs
    // only, the request The Office actually makes would still fall through.
    const answer = await inject(await appFor(false), 'POST', '/api/office/client_read', {
      'content-type': 'application/json',
    });

    expect(answer.status).toBe(404);
    expect(answer.code).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
  });

  it('leaves the generic auth gate answering AUTH_TOKEN_MISSING off the office prefix', async () => {
    // The office exemption in PUBLIC_API_PATHS is untouched and not widened:
    // a path outside /office is still refused by requireAuth, with the code it
    // has always used. This is the control that says the fix stopped the
    // fall-through rather than opening a hole.
    const answer = await inject(await appFor(false), 'GET', '/api/definitely-not-a-route');

    expect(answer.status).toBe(401);
    expect(answer.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('leaves the public health probe answering 200', async () => {
    const answer = await inject(await appFor(false), 'GET', '/api/health');

    expect(answer.status).toBe(200);
  });
});

// ============================================================
// State 2 - configured, and the credential is refused
// ============================================================

describe('a configured Office bridge presented with the wrong credential', () => {
  it('answers 401 OFFICE_CREDENTIAL_REJECTED', async () => {
    const answer = await inject(
      await appFor(true),
      'GET',
      OFFICE_MANIFEST,
      withCredential('not-the-shared-secret'),
    );

    expect(answer.status).toBe(401);
    expect(answer.code).toBe('OFFICE_CREDENTIAL_REJECTED');
  });

  it('answers 401 OFFICE_CREDENTIAL_REJECTED when no credential is presented', async () => {
    const answer = await inject(await appFor(true), 'GET', OFFICE_MANIFEST);

    expect(answer.status).toBe(401);
    expect(answer.code).toBe('OFFICE_CREDENTIAL_REJECTED');
  });
});

// ============================================================
// State 3 - configured, and the credential is accepted
// ============================================================

describe('a configured Office bridge presented with the right credential', () => {
  it('answers 200 with a manifest naming this forge', async () => {
    const answer = await inject(
      await appFor(true),
      'GET',
      OFFICE_MANIFEST,
      withCredential(SECRET),
    );

    expect(answer.status).toBe(200);

    const body = answer.body as { forge_id?: string; modules?: unknown };
    expect(body.forge_id).toBe('capitalforge');
    expect(Array.isArray(body.modules)).toBe(true);
    expect((body.modules as unknown[]).length).toBeGreaterThan(0);
  });
});

// ============================================================
// The property the three states exist for
// ============================================================

describe('the three bridge states', () => {
  it('does not let an unconfigured bridge and a refused credential share a status', async () => {
    // The whole defect, in one assertion. Both answers were 401 before the
    // fix, so a reader could not tell "this deployment has no bridge" from
    // "your credential was refused" - and the second reading sent an operator
    // looking for a bad token that did not exist.
    const unconfigured = await inject(await appFor(false), 'GET', OFFICE_MANIFEST);
    const refused = await inject(await appFor(true), 'GET', OFFICE_MANIFEST);
    const accepted = await inject(
      await appFor(true),
      'GET',
      OFFICE_MANIFEST,
      withCredential(SECRET),
    );

    expect(unconfigured.status).not.toBe(refused.status);
    expect(unconfigured.status).not.toBe(accepted.status);
    expect(refused.status).not.toBe(accepted.status);

    expect(new Set([unconfigured.code, refused.code, accepted.code]).size).toBe(3);
  });
});

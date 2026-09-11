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
// State 1 is exercised with the three variables absent AND with each one absent
// in turn, because `.env.example` says "when ANY is absent" and the mount
// comment warns about a half-configured bridge specifically. Neither the
// none-set nor the all-set case can see `officeBridgeConfigured()` being
// loosened from AND to OR; rotating the missing one can.
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

/** The three variables `officeBridgeConfigured()` reads, and their test values. */
const BRIDGE_VARS = {
  OFFICE_SHARED_SECRET: SECRET,
  OFFICE_VENTURE_TENANTS: `burkham-wickmont:${TENANT}`,
  OFFICE_SERVICE_PRINCIPAL_ID: PRINCIPAL,
} as const;

type BridgeVar = keyof typeof BRIDGE_VARS;

const EVERY_VAR = Object.keys(BRIDGE_VARS) as BridgeVar[];

/**
 * Puts the environment into one named configuration state: the listed variables
 * set to their test values, the unlisted ones ABSENT.
 *
 * Deleted rather than emptied. `officeBridgeConfigured()` treats an empty string
 * as absent, but a fresh checkout has no variable at all, and the state under
 * test is the one a fresh checkout starts in.
 */
function setBridgeEnv(present: readonly BridgeVar[]): void {
  for (const name of EVERY_VAR) {
    if (present.includes(name)) {
      process.env[name] = BRIDGE_VARS[name];
    } else {
      delete process.env[name];
    }
  }
}

/**
 * Warms the modules that read `.env`, so that the environment this file
 * establishes is the one the router actually sees.
 *
 * `@prisma/client` loads `.env` at import time, and dotenv FILLS AN ABSENT
 * variable - it declines only to overwrite a variable that is already there.
 * `buildApp` deletes the three bridge variables to construct the unconfigured
 * state and then imports the router, which pulls in Prisma. So on any checkout
 * whose `.env` configures the bridge, the delete was undone between those two
 * lines and `officeBridgeConfigured()` read `true` at the mount.
 *
 * That is not hypothetical, and the shape of it is what hid it. The reload
 * happens once per worker, so it struck whichever state was built FIRST and no
 * other; every later build saw the environment it had asked for. The
 * unconfigured state is built first, and it is the one state this file exists
 * to assert. On a developer machine with the bridge in `.env` the unconfigured
 * tests failed while the half-configured rotation passed; on CI, which has no
 * `.env` at all, every test passed. Green on the runner and red on any desk
 * that had onboarded the bridge - and the failure there was `401
 * OFFICE_CREDENTIAL_REJECTED`, which reads exactly like the defect this file
 * was written about.
 *
 * Importing it HERE, before `setBridgeEnv`, moves the load to a moment when we
 * do not yet care what the variables are.
 */
async function warmEnvReaders(): Promise<void> {
  await import('@prisma/client');
}

/**
 * An app composed the way server.ts composes it: `apiRouter` under `/api`, the
 * 404 catch-all behind it, the error handler last.
 *
 * The mount order is the substance. Testing `officeRouter` on its own cannot
 * see this defect at all - the fall-through is to OTHER routers, and a router
 * examined in isolation has nothing to fall through to.
 */
async function buildApp(present: readonly BridgeVar[]): Promise<Express> {
  vi.resetModules();
  await warmEnvReaders();
  setBridgeEnv(present);

  const { apiRouter } = await import('../../../src/backend/api/routes/index.js');

  // The precondition, asserted rather than assumed, AFTER the import that
  // consumes it.
  //
  // Every claim in this file is about what a bridge in a named configuration
  // state answers, and all of them are vacuous if the state is not the one we
  // asked for. The order here is the whole point: the mount decision is taken
  // during the import on the line above, and the `.env` reload that used to
  // break it is triggered BY that import. A check placed before it reads an
  // environment nothing has consumed yet and passes while the router goes on
  // to see something else - which is precisely how this survived. So it is
  // read here, off the same side of the import that the router read it from.
  const { officeBridgeConfigured } = await import('../../../src/backend/config/office.js');
  const wanted = present.length === EVERY_VAR.length;
  if (officeBridgeConfigured() !== wanted) {
    throw new Error(
      `bridge state not established: wanted officeBridgeConfigured() === ${String(wanted)} ` +
        `for [${present.join(', ') || 'none'}], got ${String(officeBridgeConfigured())}. ` +
        'Importing the router re-populated the OFFICE_* variables this test had cleared, ' +
        'so the app under test is not in the state the test names.',
    );
  }

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
const built = new Map<string, Promise<Express>>();

function appFor(present: readonly BridgeVar[]): Promise<Express> {
  setBridgeEnv(present);
  const key = [...present].sort().join('+') || 'none';
  let app = built.get(key);
  if (app === undefined) {
    app = buildApp(present);
    built.set(key, app);
  }
  return app;
}

const CONFIGURED = EVERY_VAR;
const UNCONFIGURED: readonly BridgeVar[] = [];

// `apiRouter` pulls in every route module in the API, which is a few seconds of
// transform on a cold runner - comfortably past vitest's 5s default. Paid once,
// here, with a timeout that says so, rather than leaving the first test in the
// file to fail on a clock instead of on a claim.
beforeAll(async () => {
  await appFor(UNCONFIGURED);
  await appFor(CONFIGURED);
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
    const answer = await inject(await appFor(UNCONFIGURED), 'GET', OFFICE_MANIFEST);

    expect(answer.status).toBe(404);
    expect(answer.code).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
  });

  it('does not answer 401 UNAUTHORIZED from a tenant middleware it never reached', async () => {
    // The regression itself. This is what the surface returned before the
    // `else` branch existed: the request fell past /office into a router
    // mounted at '/', whose tenantMiddleware reported a missing token on a
    // surface that reads no token.
    const answer = await inject(await appFor(UNCONFIGURED), 'GET', OFFICE_MANIFEST);

    expect(answer.status).not.toBe(401);
    expect(answer.code).not.toBe('UNAUTHORIZED');
  });

  it('answers 404 on a sub-path under /office that no module would serve', async () => {
    // The fall-through was never specific to `_modules`; it applied to
    // anything under the prefix. A handler that terminated only the manifest
    // path would leave the old 401 in place everywhere else.
    const answer = await inject(await appFor(UNCONFIGURED), 'GET', '/api/office/definitely-not-a-route');

    expect(answer.status).toBe(404);
    expect(answer.code).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
  });

  it('answers 404 to a POST at a module path, not only to a GET', async () => {
    // A brokered call is a POST. If the terminating handler answered GETs
    // only, the request The Office actually makes would still fall through.
    const answer = await inject(await appFor(UNCONFIGURED), 'POST', '/api/office/client_read', {
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
    const answer = await inject(await appFor(UNCONFIGURED), 'GET', '/api/definitely-not-a-route');

    expect(answer.status).toBe(401);
    expect(answer.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('leaves the public health probe answering 200', async () => {
    const answer = await inject(await appFor(UNCONFIGURED), 'GET', '/api/health');

    expect(answer.status).toBe(200);
  });

  it('answers 404 when one of the three variables is missing and the other two are set', async () => {
    // `.env.example` says "when ANY is absent", and the mount comment says a
    // half-configured bridge that answered "would tell The Office that
    // CapitalForge is bridged when nothing can authenticate to it". Nothing
    // asserted it. A partial configuration is the likelier accident of the two
    // - a fresh checkout has none of them, but a half-finished R-1 has some.
    //
    // Rotating which one is missing is the point: this fails if
    // `officeBridgeConfigured()` is ever loosened from AND to OR, which the
    // none-set and all-set cases above would both survive.
    for (const missing of EVERY_VAR) {
      const partial = EVERY_VAR.filter((name) => name !== missing);
      const answer = await inject(await appFor(partial), 'GET', OFFICE_MANIFEST);

      expect(answer.status, `missing ${missing}`).toBe(404);
      expect(answer.code, `missing ${missing}`).toBe('OFFICE_BRIDGE_NOT_CONFIGURED');
    }
  }, 120_000);
});

// ============================================================
// State 2 - configured, and the credential is refused
// ============================================================

describe('a configured Office bridge presented with the wrong credential', () => {
  it('answers 401 OFFICE_CREDENTIAL_REJECTED', async () => {
    const answer = await inject(
      await appFor(CONFIGURED),
      'GET',
      OFFICE_MANIFEST,
      withCredential('not-the-shared-secret'),
    );

    expect(answer.status).toBe(401);
    expect(answer.code).toBe('OFFICE_CREDENTIAL_REJECTED');
  });

  it('answers 401 OFFICE_CREDENTIAL_REJECTED when no credential is presented', async () => {
    const answer = await inject(await appFor(CONFIGURED), 'GET', OFFICE_MANIFEST);

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
      await appFor(CONFIGURED),
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
    const unconfigured = await inject(await appFor(UNCONFIGURED), 'GET', OFFICE_MANIFEST);
    const refused = await inject(await appFor(CONFIGURED), 'GET', OFFICE_MANIFEST);
    const accepted = await inject(
      await appFor(CONFIGURED),
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

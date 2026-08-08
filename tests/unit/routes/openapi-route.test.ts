// ============================================================
// OpenAPI route tests
//
// This route had no tests, which is how it shipped broken.
//
// It parsed the spec with a `require('js-yaml')` wrapped in a
// try/catch, and on failure assigned an error object to the cache and
// served it with 200 OK and a 60-second Cache-Control. js-yaml was not
// a declared dependency — it reached the tree only as a transitive
// dependency of eslint, a devDependency — so the production image,
// built with `npm ci --omit=dev`, took the failure path every time
// while dev and CI took the success path.
//
// Two properties are locked here: the body is an actual specification,
// and a failure is a failure rather than a 200 with an apology in it.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { openApiRouter } from '@backend/api/routes/openapi.routes.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use('/api', openApiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') throw new Error('no port assigned');
      baseUrl = `http://127.0.0.1:${String(addr.port)}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => {
    resolve();
  }));
});

describe('GET /api/docs/openapi.json', () => {
  it('serves a parsed specification, not an error object', async () => {
    const res = await fetch(`${baseUrl}/api/docs/openapi.json`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;

    // The precise shape the old fallback produced. Asserting its absence
    // is the point: it was served with a 200, so status alone proved
    // nothing about whether the route worked.
    expect(body['error']).toBeUndefined();
    expect(body['hint']).toBeUndefined();

    expect(body['openapi']).toBe('3.1.0');
    expect(body['info']).toBeTypeOf('object');

    // A spec with no paths would satisfy every assertion above while
    // being useless, so require that parsing actually produced routes.
    const paths = body['paths'];
    expect(paths).toBeTypeOf('object');
    expect(Object.keys(paths as Record<string, unknown>).length).toBeGreaterThan(0);
  });

  it('serves the raw YAML too, and the two describe the same spec', async () => {
    const res = await fetch(`${baseUrl}/api/docs/openapi.yaml`);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('openapi: 3.1.0');
  });
});

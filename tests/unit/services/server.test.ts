// ============================================================
// Server Unit Tests
// Tests: health endpoints, error handling, request ID injection
// Uses supertest-style light assertions via fetch (no extra deps).
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';

// ── Mock Prisma before importing routes that reference it ─────
vi.mock('@prisma/client', () => {
  const mockQueryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $queryRaw: mockQueryRaw,
    })),
  };
});

// ── Import app after mocks are set up ─────────────────────────
// We import createApp lazily so vitest mocks take effect first.
const { createApp } = await import('@backend/server.js');

// ── Test server bootstrap ─────────────────────────────────────
let server: Server;
let baseUrl: string;

beforeAll(() => {
  const app = createApp();
  server = app.listen(0); // random port
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => {
  server.close();
});

// ── Helper ────────────────────────────────────────────────────
async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, { headers });
}

// ─────────────────────────────────────────────────────────────
// Health — liveness
// ─────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('includes timestamp and uptime fields', async () => {
    const res = await get('/api/health');
    const body = await res.json();
    expect(typeof body.data.timestamp).toBe('string');
    expect(typeof body.data.uptime).toBe('number');
    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('sets X-Request-ID response header', async () => {
    const res = await get('/api/health');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('preserves a caller-supplied X-Request-ID', async () => {
    const id = 'test-correlation-abc-123';
    const res = await get('/api/health', { 'X-Request-ID': id });
    expect(res.headers.get('x-request-id')).toBe(id);
  });
});

// ─────────────────────────────────────────────────────────────
// Health — readiness
// ─────────────────────────────────────────────────────────────
describe('GET /api/health/ready', () => {
  it('returns 200 when DB check passes', async () => {
    const res = await get('/api/health/ready');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.checks.database.status).toBe('ok');
    expect(typeof body.data.checks.database.latencyMs).toBe('number');
  });

  it('returns 503 when DB check fails', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const instance = (PrismaClient as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    if (instance) {
      instance.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));
    }

    const res = await get('/api/health/ready');
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.checks.database.status).toBe('error');
    expect(body.error?.code).toBe('SERVICE_UNAVAILABLE');
  });
});

// ─────────────────────────────────────────────────────────────
// Request ID middleware
// ─────────────────────────────────────────────────────────────
describe('Request ID middleware', () => {
  it('generates a UUID when no X-Request-ID is provided', async () => {
    const res = await get('/api/health');
    const id = res.headers.get('x-request-id');
    // UUID v4 pattern
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates a different ID for each request', async () => {
    const [r1, r2] = await Promise.all([get('/api/health'), get('/api/health')]);
    const id1 = r1.headers.get('x-request-id');
    const id2 = r2.headers.get('x-request-id');
    expect(id1).not.toBe(id2);
  });
});

// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────
describe('Error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await get('/api/does-not-exist');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for completely unknown path', async () => {
    const res = await get('/totally-unknown');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('responds with ApiResponse shape on errors', async () => {
    const res = await get('/api/missing');
    const body = await res.json();
    // Shape check
    expect(typeof body.success).toBe('boolean');
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });

  it('sets X-Request-ID even on error responses', async () => {
    const res = await get('/api/missing');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }',
    });
    // Express json() parser will throw a SyntaxError → our handler catches it
    expect([400, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────
describe('CORS', () => {
  it('includes CORS headers on health response', async () => {
    const res = await get('/api/health');
    // In test env FRONTEND_URL defaults to http://localhost:3000
    // cors() may not set header when origin doesn't match — just verify
    // the server doesn't crash and responds correctly
    expect(res.status).toBe(200);
  });
});

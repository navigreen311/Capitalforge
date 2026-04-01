// ============================================================
// CapitalForge — Security Unit Tests
// Covers: encryption/decryption, PII redaction, input
// sanitization, CSRF token validation, session limits, and
// security headers.
//
// Run: npx vitest run tests/unit/services/security.test.ts
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ============================================================
// 1. ENCRYPTION SERVICE
// ============================================================

describe('EncryptionService', () => {
  // Must set env before module import — use dynamic imports inside tests
  const ENCRYPTION_KEY = 'test-encryption-key-secure-32chars!!';

  beforeEach(() => {
    process.env['ENCRYPTION_KEY'] = ENCRYPTION_KEY;
    // Clear the lazy singleton between tests
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env['ENCRYPTION_KEY'];
    delete process.env['ENCRYPTION_KEY_2'];
    vi.resetModules();
  });

  it('encrypts a plaintext string and returns a non-empty envelope', async () => {
    const { encrypt, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ciphertext = encrypt('secret-value');
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain('secret-value');
  });

  it('produces a 4-segment colon-separated envelope', async () => {
    const { encrypt, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ciphertext = encrypt('hello');
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(4);
  });

  it('decrypts back to the original plaintext', async () => {
    const { encrypt, decrypt, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const original = 'super-secret-ssn';
    const ciphertext = encrypt(original);
    expect(decrypt(ciphertext)).toBe(original);
  });

  it('every encryption produces a unique ciphertext (random IV)', async () => {
    const { encrypt, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ct1 = encrypt('same-value');
    const ct2 = encrypt('same-value');
    expect(ct1).not.toBe(ct2);
  });

  it('throws EncryptionError on tampered ciphertext', async () => {
    const { encrypt, decrypt, EncryptionError, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ct = encrypt('data');
    const parts = ct.split(':');
    // Corrupt the ciphertext segment
    parts[3] = Buffer.from('corrupted').toString('base64');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow(EncryptionError);
  });

  it('throws EncryptionError on malformed envelope string', async () => {
    const { decrypt, EncryptionError, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    expect(() => decrypt('not:a:valid')).toThrow(EncryptionError);
  });

  it('encryptPIIField strips formatting from SSN before encryption', async () => {
    const { encryptPIIField, decryptPIIField, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ct = encryptPIIField('ssn', '123-45-6789');
    const plain = decryptPIIField('ssn', ct);
    expect(plain).toBe('123456789'); // formatting stripped
  });

  it('encryptPIIField strips formatting from card numbers', async () => {
    const { encryptPIIField, decryptPIIField, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    const ct = encryptPIIField('cardNumber', '4111 1111 1111 1111');
    const plain = decryptPIIField('cardNumber', ct);
    expect(plain).toBe('4111111111111111');
  });

  it('rotateKey decrypts with old key and re-encrypts under current key', async () => {
    const {
      encrypt,
      decrypt,
      rotateKey,
      isCurrentKeyVersion,
      resetKeyRegistryCache,
    } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();

    const original = 'rotate-me';
    const oldCt = encrypt(original);
    // Simulate key rotation: current key is now "version 2"
    // (In real use, set ENCRYPTION_KEY=newKey and ENCRYPTION_KEY_2=oldKey)
    const rotated = rotateKey(oldCt);
    expect(decrypt(rotated)).toBe(original);
    expect(isCurrentKeyVersion(rotated)).toBe(true);
  });

  it('throws EncryptionConfigError when ENCRYPTION_KEY is absent', async () => {
    delete process.env['ENCRYPTION_KEY'];
    const { encrypt, EncryptionConfigError, resetKeyRegistryCache } = await import('../../../src/backend/services/encryption.service.js');
    resetKeyRegistryCache();
    expect(() => encrypt('x')).toThrow(EncryptionConfigError);
  });
});

// ============================================================
// 2. PII REDACTION
// ============================================================

describe('PII Redactor — maskSSN', () => {
  it('masks a formatted SSN', async () => {
    const { maskSSN } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskSSN('123-45-6789')).toBe('***-**-6789');
  });

  it('masks an unformatted SSN', async () => {
    const { maskSSN } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskSSN('123456789')).toBe('***-**-6789');
  });

  it('returns original string for non-SSN input', async () => {
    const { maskSSN } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskSSN('not-an-ssn')).toBe('not-an-ssn');
  });
});

describe('PII Redactor — maskEIN', () => {
  it('masks a formatted EIN', async () => {
    const { maskEIN } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskEIN('12-3456789')).toBe('**-***6789');
  });

  it('masks a raw EIN', async () => {
    const { maskEIN } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskEIN('123456789')).toBe('**-***6789');
  });
});

describe('PII Redactor — maskCardNumber', () => {
  it('masks a 16-digit card number', async () => {
    const { maskCardNumber } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskCardNumber('4111111111111111')).toBe('****1111');
  });

  it('masks a spaced card number', async () => {
    const { maskCardNumber } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskCardNumber('4111 1111 1111 1111')).toBe('****1111');
  });

  it('returns original for too-short input', async () => {
    const { maskCardNumber } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskCardNumber('1234')).toBe('1234');
  });
});

describe('PII Redactor — maskEmail', () => {
  it('masks a standard email', async () => {
    const { maskEmail } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskEmail('john.doe@example.com')).toBe('j***@***.com');
  });

  it('masks an email with subdomain', async () => {
    const { maskEmail } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskEmail('alice@mail.company.org')).toBe('a***@***.org');
  });

  it('returns original for string without @', async () => {
    const { maskEmail } = await import('../../../src/backend/utils/pii-redactor.js');
    expect(maskEmail('notanemail')).toBe('notanemail');
  });
});

describe('PII Redactor — redactPII (object deep-walk)', () => {
  it('redacts SSN fields in a nested object', async () => {
    const { redactPII } = await import('../../../src/backend/utils/pii-redactor.js');
    const input = { business: { ssn: '123-45-6789', name: 'Acme Corp' } };
    const result = redactPII(input) as { business: { ssn: string; name: string } };
    expect(result.business.ssn).toBe('***-**-6789');
    expect(result.business.name).toBe('Acme Corp');
  });

  it('does not mutate the original object', async () => {
    const { redactPII } = await import('../../../src/backend/utils/pii-redactor.js');
    const original = { ssn: '123-45-6789' };
    redactPII(original);
    expect(original.ssn).toBe('123-45-6789');
  });

  it('handles arrays of objects', async () => {
    const { redactPII } = await import('../../../src/backend/utils/pii-redactor.js');
    const input = [{ email: 'a@b.com' }, { email: 'c@d.org' }];
    const result = redactPII(input) as Array<{ email: string }>;
    expect(result[0]!.email).toBe('a***@***.com');
    expect(result[1]!.email).toBe('c***@***.org');
  });

  it('redacts password fields to [REDACTED]', async () => {
    const { redactPII } = await import('../../../src/backend/utils/pii-redactor.js');
    const result = redactPII({ password: 'mysecret' }) as { password: string };
    expect(result.password).toBe('[REDACTED]');
  });
});

describe('PII Redactor — redactInlineText', () => {
  it('replaces embedded SSN patterns in a log string', async () => {
    const { redactInlineText } = await import('../../../src/backend/utils/pii-redactor.js');
    const text = 'User SSN is 123-45-6789 for record';
    expect(redactInlineText(text)).toContain('***-**-6789');
    expect(redactInlineText(text)).not.toContain('123-45-6789');
  });

  it('replaces embedded card numbers in a log string', async () => {
    const { redactInlineText } = await import('../../../src/backend/utils/pii-redactor.js');
    const text = 'Charged card 4111111111111111 successfully';
    const result = redactInlineText(text);
    expect(result).toContain('****1111');
    expect(result).not.toContain('4111111111111111');
  });
});

// ============================================================
// 3. INPUT SANITIZATION
// ============================================================

describe('InputSanitizer — sanitizeString', () => {
  it('throws SanitizationError for script tag injection', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    // <script> tags are dangerous and rejected outright rather than silently stripped
    expect(() => sanitizeString('<script>alert(1)</script>Hello')).toThrow(SanitizationError);
  });

  it('strips benign HTML formatting tags (bold, italic)', async () => {
    const { sanitizeString } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(sanitizeString('<b><i>text</i></b>')).toBe('text');
  });

  it('throws SanitizationError for XSS event handler attribute', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(() => sanitizeString('value" onclick="evil()')).toThrow(SanitizationError);
  });

  it('throws SanitizationError for javascript: URI', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(() => sanitizeString('javascript:void(0)')).toThrow(SanitizationError);
  });

  it('throws SanitizationError for SQL SELECT injection', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(() => sanitizeString("' OR SELECT * FROM users --")).toThrow(SanitizationError);
  });

  it('throws SanitizationError for SQL DROP injection', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(() => sanitizeString("'; DROP TABLE users; --")).toThrow(SanitizationError);
  });

  it('throws SanitizationError for path traversal sequence', async () => {
    const { sanitizeString, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(() => sanitizeString('../../etc/passwd')).toThrow(SanitizationError);
  });

  it('allows normal business text through unchanged', async () => {
    const { sanitizeString } = await import('../../../src/backend/middleware/input-sanitizer.js');
    const clean = 'Acme Corp dba The Widget Company';
    expect(sanitizeString(clean)).toBe(clean);
  });

  it('strips null bytes', async () => {
    const { sanitizeString } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
  });
});

describe('InputSanitizer — sanitizeObject', () => {
  it('recursively sanitizes nested string fields', async () => {
    const { sanitizeObject } = await import('../../../src/backend/middleware/input-sanitizer.js');
    const input = { name: '<b>Bob</b>', nested: { value: '<em>ok</em>' } };
    const result = sanitizeObject(input) as { name: string; nested: { value: string } };
    expect(result.name).toBe('Bob');
    expect(result.nested.value).toBe('ok');
  });

  it('drops __proto__ keys to prevent prototype pollution', async () => {
    const { sanitizeObject } = await import('../../../src/backend/middleware/input-sanitizer.js');
    const input = JSON.parse('{"__proto__":{"isAdmin":true},"name":"test"}');
    const result = sanitizeObject(input) as Record<string, unknown>;
    // The __proto__ key must not be an own property of the result object
    expect(Object.hasOwn(result, '__proto__')).toBe(false);
    expect(result['name']).toBe('test');
  });

  it('throws on excessive nesting depth', async () => {
    const { sanitizeObject, SanitizationError } = await import('../../../src/backend/middleware/input-sanitizer.js');
    // Build a 25-level deep object
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 25; i++) deep = { child: deep };
    expect(() => sanitizeObject(deep)).toThrow(SanitizationError);
  });
});

describe('InputSanitizer — validateField', () => {
  it('validates a correctly formatted EIN', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('ein', '12-3456789')).toBe(true);
  });

  it('rejects a malformed EIN', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('ein', '12345678')).toBe(false);
  });

  it('validates a correctly formatted SSN', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('ssn', '123-45-6789')).toBe(true);
  });

  it('validates a valid email address', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('email', 'user@example.com')).toBe(true);
  });

  it('rejects an invalid email address', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('email', 'not-an-email')).toBe(false);
  });

  it('validates a card number after stripping spaces', async () => {
    const { validateField } = await import('../../../src/backend/middleware/input-sanitizer.js');
    expect(validateField('cardNumber', '4111 1111 1111 1111')).toBe(true);
  });
});

describe('InputSanitizer — sanitizeInputs middleware', () => {
  function buildReq(overrides: Partial<Request> = {}): Request {
    return {
      body: {},
      query: {},
      params: {},
      ...overrides,
    } as unknown as Request;
  }

  function buildRes(): Response {
    const json = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json } as unknown as Response;
  }

  it('calls next() for clean input', async () => {
    const { sanitizeInputs } = await import('../../../src/backend/middleware/input-sanitizer.js');
    const req = buildReq({ body: { name: 'Alice' } });
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    sanitizeInputs(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 400 for XSS in body', async () => {
    const { sanitizeInputs } = await import('../../../src/backend/middleware/input-sanitizer.js');
    const req = buildReq({ body: { name: '<img src=x onerror=alert(1)>' } });
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    sanitizeInputs(req, res, next);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// ============================================================
// 4. CSRF PROTECTION
// ============================================================

describe('CSRF Protection', () => {
  it('generateCSRFToken returns a 64-char hex string', async () => {
    const { generateCSRFToken } = await import('../../../src/backend/middleware/csrf-protection.js');
    const token = generateCSRFToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('compareCSRFTokens returns true for identical tokens', async () => {
    const { generateCSRFToken, compareCSRFTokens } = await import('../../../src/backend/middleware/csrf-protection.js');
    const t = generateCSRFToken();
    expect(compareCSRFTokens(t, t)).toBe(true);
  });

  it('compareCSRFTokens returns false for different tokens', async () => {
    const { generateCSRFToken, compareCSRFTokens } = await import('../../../src/backend/middleware/csrf-protection.js');
    const t1 = generateCSRFToken();
    const t2 = generateCSRFToken();
    expect(compareCSRFTokens(t1, t2)).toBe(false);
  });

  it('compareCSRFTokens returns false for different-length strings', async () => {
    const { compareCSRFTokens } = await import('../../../src/backend/middleware/csrf-protection.js');
    expect(compareCSRFTokens('short', 'much-longer-string')).toBe(false);
  });

  it('csrfProtection calls next() for GET requests without checking token', async () => {
    const { csrfProtection } = await import('../../../src/backend/middleware/csrf-protection.js');
    const req = {
      method: 'GET',
      path: '/dashboard',
      headers: { cookie: '' },
      body: {},
    } as unknown as Request;
    const res = { setHeader: vi.fn(), getHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('csrfProtection calls next() for POST to /api/ (exempt)', async () => {
    const { csrfProtection } = await import('../../../src/backend/middleware/csrf-protection.js');
    const req = {
      method: 'POST',
      path: '/api/applications',
      headers: { cookie: '' },
      body: {},
    } as unknown as Request;
    const res = { setHeader: vi.fn(), getHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('csrfProtection returns 403 when CSRF cookie is missing on POST', async () => {
    const { csrfProtection } = await import('../../../src/backend/middleware/csrf-protection.js');
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = {
      method: 'POST',
      path: '/forms/submit',
      headers: { cookie: '' },
      body: {},
    } as unknown as Request;
    const res = { status, json, setHeader: vi.fn(), getHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    csrfProtection(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('csrfProtection returns 403 when cookie present but header token missing', async () => {
    const { csrfProtection, CSRF_COOKIE_NAME } = await import('../../../src/backend/middleware/csrf-protection.js');
    const token = 'a'.repeat(64);
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = {
      method: 'POST',
      path: '/forms/submit',
      headers: { cookie: `${CSRF_COOKIE_NAME}=${token}` },
      body: {},
    } as unknown as Request;
    const res = { status, json, setHeader: vi.fn(), getHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    csrfProtection(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('csrfProtection calls next() when cookie and header tokens match', async () => {
    const { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = await import('../../../src/backend/middleware/csrf-protection.js');
    const token = 'b'.repeat(64);
    const next = vi.fn() as unknown as NextFunction;
    const req = {
      method: 'POST',
      path: '/forms/submit',
      headers: {
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        [CSRF_HEADER_NAME]: token,
      },
      body: {},
    } as unknown as Request;
    const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), getHeader: vi.fn() } as unknown as Response;
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ============================================================
// 5. SESSION MANAGEMENT
// ============================================================

describe('SessionManagementService', () => {
  async function makeService() {
    const { SessionManagementService, InMemorySessionStore } = await import('../../../src/backend/services/session-management.service.js');
    const store = new InMemorySessionStore();
    const service = new SessionManagementService(store);
    return { service, store };
  }

  const BASE_OPTS = {
    userId: 'user-001',
    tenantId: 'tenant-abc',
    ip: '192.168.1.1',
    deviceFingerprint: 'fp-device-abc',
  };

  it('creates a session with expected fields', async () => {
    const { service } = await makeService();
    const session = await service.createSession(BASE_OPTS);
    expect(session.sessionId).toBeTruthy();
    expect(session.userId).toBe('user-001');
    expect(session.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session.revoked).toBe(false);
  });

  it('validates a fresh session successfully', async () => {
    const { service } = await makeService();
    const session = await service.createSession(BASE_OPTS);
    const result = await service.validateSession(session.sessionId, BASE_OPTS.ip);
    expect(result.valid).toBe(true);
  });

  it('returns not_found for unknown session ID', async () => {
    const { service } = await makeService();
    const result = await service.validateSession('non-existent-id', '1.2.3.4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('returns revoked for an explicitly revoked session', async () => {
    const { service } = await makeService();
    const session = await service.createSession(BASE_OPTS);
    await service.revokeSession(session.sessionId);
    const result = await service.validateSession(session.sessionId, BASE_OPTS.ip);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('enforces concurrent session limit of 3', async () => {
    const { service } = await makeService();
    const sessions = await Promise.all([
      service.createSession(BASE_OPTS),
      service.createSession(BASE_OPTS),
      service.createSession(BASE_OPTS),
    ]);
    // Creating a 4th session should evict the oldest
    const fourth = await service.createSession(BASE_OPTS);
    const active = await service.getActiveSessions('user-001');
    expect(active.length).toBeLessThanOrEqual(3);
    expect(active.map((s) => s.sessionId)).toContain(fourth.sessionId);
    // Suppress unused warning
    void sessions;
  });

  it('revokeAllUserSessions invalidates every active session', async () => {
    const { service } = await makeService();
    await service.createSession(BASE_OPTS);
    await service.createSession(BASE_OPTS);
    const count = await service.revokeAllUserSessions('user-001');
    expect(count).toBe(2);
    const active = await service.getActiveSessions('user-001');
    expect(active).toHaveLength(0);
  });

  it('invalidateOnPasswordChange revokes all sessions', async () => {
    const { service } = await makeService();
    await service.createSession(BASE_OPTS);
    await service.createSession(BASE_OPTS);
    const count = await service.invalidateOnPasswordChange('user-001');
    expect(count).toBe(2);
  });

  it('fires IP anomaly event when session is used from new IP', async () => {
    const { service } = await makeService();
    const session = await service.createSession(BASE_OPTS);
    const anomalyHandler = vi.fn();
    service.onIPAnomaly(anomalyHandler);
    await service.validateSession(session.sessionId, '10.0.0.99');
    expect(anomalyHandler).toHaveBeenCalledOnce();
    const event = anomalyHandler.mock.calls[0]![0];
    expect(event.previousIp).toBe('192.168.1.1');
    expect(event.newIp).toBe('10.0.0.99');
  });

  it('does not fire anomaly event when IP is unchanged', async () => {
    const { service } = await makeService();
    const session = await service.createSession(BASE_OPTS);
    const anomalyHandler = vi.fn();
    service.onIPAnomaly(anomalyHandler);
    await service.validateSession(session.sessionId, BASE_OPTS.ip);
    expect(anomalyHandler).not.toHaveBeenCalled();
  });

  it('tracks device fingerprints across sessions', async () => {
    const { service } = await makeService();
    await service.createSession({ ...BASE_OPTS, deviceFingerprint: 'fp-laptop' });
    await service.createSession({ ...BASE_OPTS, deviceFingerprint: 'fp-phone' });
    const devices = await service.getKnownDevices('user-001');
    expect(devices).toContain('fp-laptop');
    expect(devices).toContain('fp-phone');
  });

  it('isKnownDevice returns true for a recognised fingerprint', async () => {
    const { service } = await makeService();
    await service.createSession({ ...BASE_OPTS, deviceFingerprint: 'fp-known' });
    expect(await service.isKnownDevice('user-001', 'fp-known')).toBe(true);
  });

  it('isKnownDevice returns false for an unknown fingerprint', async () => {
    const { service } = await makeService();
    expect(await service.isKnownDevice('user-001', 'fp-unknown')).toBe(false);
  });
});

// ============================================================
// 6. SECURITY HEADERS MIDDLEWARE
// ============================================================

describe('Security Headers Middleware', () => {
  function buildRes() {
    const headers: Record<string, string | string[]> = {};
    return {
      setHeader: vi.fn((name: string, value: string) => { headers[name.toLowerCase()] = value; }),
      removeHeader: vi.fn(),
      getHeaders: () => headers,
      _headers: headers,
    } as unknown as Response;
  }

  it('sets HSTS with includeSubDomains and preload', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/dashboard', headers: {} } as unknown as Request;
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    applySecurityHeaders(req, res, next);
    expect((res.setHeader as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('includeSubDomains'),
    );
    expect((res.setHeader as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('preload'),
    );
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/api/test', headers: {} } as unknown as Request;
    const res = buildRes();
    applySecurityHeaders(req, res, vi.fn() as unknown as NextFunction);
    expect((res.setHeader as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/api/test', headers: {} } as unknown as Request;
    const res = buildRes();
    applySecurityHeaders(req, res, vi.fn() as unknown as NextFunction);
    expect((res.setHeader as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('sets Referrer-Policy: strict-origin', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/api/test', headers: {} } as unknown as Request;
    const res = buildRes();
    applySecurityHeaders(req, res, vi.fn() as unknown as NextFunction);
    expect((res.setHeader as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin');
  });

  it('disables camera/microphone on regular routes via Permissions-Policy', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/dashboard', headers: {} } as unknown as Request;
    const res = buildRes();
    applySecurityHeaders(req, res, vi.fn() as unknown as NextFunction);
    const ppCall = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [string, string]) => c[0] === 'Permissions-Policy',
    );
    expect(ppCall).toBeTruthy();
    expect(ppCall![1]).toContain('camera=()');
    expect(ppCall![1]).toContain('microphone=()');
  });

  it('allows camera/microphone on document capture routes', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/api/documents/capture', headers: {} } as unknown as Request;
    const res = buildRes();
    applySecurityHeaders(req, res, vi.fn() as unknown as NextFunction);
    const ppCall = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [string, string]) => c[0] === 'Permissions-Policy',
    );
    expect(ppCall![1]).toContain('camera=(self)');
    expect(ppCall![1]).toContain('microphone=(self)');
  });

  it('calls next() after setting all headers', async () => {
    const { applySecurityHeaders } = await import('../../../src/backend/middleware/security-headers.js');
    const req = { path: '/test', headers: {} } as unknown as Request;
    const res = buildRes();
    const next = vi.fn() as unknown as NextFunction;
    applySecurityHeaders(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

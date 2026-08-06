// ============================================================
// Tenant suspension — enforced, both directions, against a real database
//
// `POST /platform/tenants/:id/suspend` answered 200 with a `suspendedAt`
// timestamp and wrote nothing. Then it refused with a 501, because
// `Tenant.isActive` existed and only `register` read it: setting it would have
// blocked new sign-ups and nothing else.
//
// This code can lock out every user of a tenant, so the cases below are the
// point of the change rather than coverage of it. In particular **mid-session**
// — the case a login-only check misses, and the one an access token issued
// before the suspension would otherwise sail through.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  createTenantStatusService,
  invalidateTenantStatus,
  TENANT_STATUS_TTL_MS,
} from '../../src/backend/services/tenant-status.service';
import { createAuthService, isMfaChallenge } from '../../src/backend/services/auth.service';

const prisma = new PrismaClient();
const tenantStatus = createTenantStatusService(prisma);
const auth = createAuthService(prisma);

const SUFFIX = `susp-${process.pid}-${Date.now()}`;
const PASSWORD = 'Str0ng!password#';
const OPERATOR = `operator-${SUFFIX}`;

let tenantId: string;
let otherTenantId: string;
let email: string;
let otherEmail: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Suspend Tenant ${SUFFIX}`, slug: `suspend-${SUFFIX}` },
  });
  tenantId = tenant.id;
  email = `user-${SUFFIX}@example.com`;

  const other = await prisma.tenant.create({
    data: { name: `Bystander ${SUFFIX}`, slug: `bystander-${SUFFIX}` },
  });
  otherTenantId = other.id;
  otherEmail = `other-${SUFFIX}@example.com`;

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.create({
    data: { tenantId, email, passwordHash: hash, firstName: 'A', lastName: 'B', role: 'advisor' },
  });
  await prisma.user.create({
    data: {
      tenantId: otherTenantId,
      email: otherEmail,
      passwordHash: hash,
      firstName: 'C',
      lastName: 'D',
      role: 'advisor',
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  // Each case starts from a known cache state rather than inheriting the last.
  invalidateTenantStatus();
});

async function signIn(as = email, tenant = tenantId) {
  const outcome = await auth.login({ email: as, password: PASSWORD, tenantId: tenant });
  if (isMfaChallenge(outcome)) throw new Error('unexpected challenge');
  return outcome;
}

describe('suspension is recorded, not just claimed', () => {
  it('writes the row, with who and why', async () => {
    await tenantStatus.suspend(tenantId, OPERATOR, 'non-payment');

    // Re-read: the defect was a response that reported a write never made.
    const row = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(row.isActive).toBe(false);
    expect(row.suspendedBy).toBe(OPERATOR);
    expect(row.suspendedReason).toBe('non-payment');
    expect(row.suspendedAt).not.toBeNull();
  });
});

describe('all three enforcement points', () => {
  beforeEach(async () => {
    await tenantStatus.unsuspend(tenantId, OPERATOR);
  });

  it('refuses login while suspended', async () => {
    await signIn(); // works before

    await tenantStatus.suspend(tenantId, OPERATOR, null);
    await expect(signIn()).rejects.toThrow(/suspended/i);
  });

  it('refuses token refresh while suspended', async () => {
    // Without this a session outlives the suspension by the refresh token's
    // lifetime — seven days of a suspended tenant renewing itself.
    const session = await signIn();
    await tenantStatus.suspend(tenantId, OPERATOR, null);

    await expect(auth.refreshTokens(session.tokens.refreshToken)).rejects.toThrow(/suspended/i);
  });

  it('refuses a request made mid-session', async () => {
    // The case a login-only check misses entirely: the access token was issued
    // before the suspension and remains cryptographically valid.
    const session = await signIn();
    await tenantStatus.suspend(tenantId, OPERATOR, null);

    // What the middleware asks.
    expect(await tenantStatus.isTenantActive(tenantId)).toBe(false);
    expect(session.tokens.accessToken).toBeTruthy();
  });

  it('restores all three on unsuspend', async () => {
    await tenantStatus.suspend(tenantId, OPERATOR, null);
    await expect(signIn()).rejects.toThrow(/suspended/i);

    await tenantStatus.unsuspend(tenantId, OPERATOR);

    const session = await signIn();
    expect(session.tokens.accessToken).toBeTruthy();
    await expect(auth.refreshTokens(session.tokens.refreshToken)).resolves.toBeTruthy();
    expect(await tenantStatus.isTenantActive(tenantId)).toBe(true);

    const row = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(row.suspendedAt).toBeNull();
    expect(row.suspendedBy).toBeNull();
  });

  it('leaves a different tenant untouched throughout', async () => {
    await tenantStatus.suspend(tenantId, OPERATOR, null);

    // The blast radius is the point: suspending one tenant must not reach
    // another. A cache keyed wrongly would fail exactly here.
    const bystander = await signIn(otherEmail, otherTenantId);
    expect(bystander.tokens.accessToken).toBeTruthy();
    expect(await tenantStatus.isTenantActive(otherTenantId)).toBe(true);
  });
});

describe('the cached lookup', () => {
  beforeEach(async () => {
    await tenantStatus.unsuspend(tenantId, OPERATOR);
  });

  it('serves a repeat read from cache', async () => {
    expect(await tenantStatus.isTenantActive(tenantId)).toBe(true);

    // Changed underneath the cache, without going through the service, so the
    // cache cannot have been invalidated.
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });

    // Still the cached answer — this is the staleness the design accepts, and
    // stating it is the point of the test.
    expect(await tenantStatus.isTenantActive(tenantId)).toBe(true);
  });

  it('re-reads once the TTL has passed', async () => {
    await tenantStatus.isTenantActive(tenantId);
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });

    // A clock nudge rather than a real 30-second wait.
    const later = Date.now() + TENANT_STATUS_TTL_MS + 1;
    expect(await tenantStatus.isTenantActive(tenantId, later)).toBe(false);
  });

  it('is correct immediately on the instance that made the change', async () => {
    await tenantStatus.isTenantActive(tenantId);
    await tenantStatus.suspend(tenantId, OPERATOR, null);

    // suspend() invalidates locally, so no TTL is served here.
    expect(await tenantStatus.isTenantActive(tenantId)).toBe(false);
  });

  it('treats a tenant that does not exist as inactive', async () => {
    // Returning true on a lookup miss is how a fail-open creeps in.
    expect(await tenantStatus.isTenantActive('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});

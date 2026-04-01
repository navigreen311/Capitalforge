# CapitalForge — Testing Guide

**Last updated:** 2026-03-31

---

## Table of Contents

1. [Overview](#overview)
2. [Test Infrastructure](#test-infrastructure)
3. [Unit Test Patterns](#unit-test-patterns)
4. [Integration Test Patterns](#integration-test-patterns)
5. [E2E Test Patterns](#e2e-test-patterns)
6. [Performance Testing](#performance-testing)
7. [Test Data Management](#test-data-management)
8. [CI/CD Integration](#cicd-integration)
9. [Coverage Targets](#coverage-targets)
10. [Running Tests](#running-tests)

---

## Overview

CapitalForge has a three-tier test pyramid:

```
         ┌──────────┐
         │   E2E    │  36 tests — full workflow coverage (no infrastructure)
         ├──────────┤
         │  Integr. │  DB + Redis — real queries against Docker infrastructure
         ├──────────┤
         │   Unit   │  1,700+ tests — pure functions, mocked dependencies
         └──────────┘
```

**Test runner:** Vitest 3.x
**Config:** `vitest.config.ts` at project root

All tests are written in TypeScript. There are no JavaScript test files.

---

## Test Infrastructure

### Development (Unit + E2E)

Unit and E2E tests require no running services. They use:
- Vitest's built-in mocking (`vi.mock()`, `vi.fn()`, `vi.spyOn()`)
- Custom Prisma mock factory: `makePrismaMockFor()`
- In-memory event bus spy: `createEventBusSpy()`

```bash
# No docker required
npm run test:unit
npm run test:e2e
```

### Integration Tests

Integration tests require the Docker stack:

```bash
# Start infrastructure first
npm run docker:up      # PostgreSQL 16 + Redis 7

# Then run tests
npm run test:integration
```

Integration tests use a dedicated test database (`capitalforge_test`) created automatically by the migration setup script. Tests clean up their own data using `afterEach` teardown.

### Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Root Vitest configuration |
| `tests/unit/` | Unit tests |
| `tests/integration/` | Integration tests |
| `tests/e2e/` | End-to-end flow tests |
| `tests/helpers/` | Shared test utilities and factories |

---

## Unit Test Patterns

Unit tests cover all service-layer functions, utility functions, validators, and business logic. No I/O of any kind — every dependency is mocked.

### File Naming

```
src/backend/modules/consent/consent.service.ts
tests/unit/consent.service.test.ts
```

### Basic Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsentService } from '../../src/backend/modules/consent/consent.service';
import { makePrismaMockFor } from '../helpers/prisma-mock';
import { createEventBusSpy } from '../helpers/event-bus-spy';
import { buildCallerContext } from '../helpers/caller-context';

describe('ConsentService', () => {
  let prismaMock: ReturnType<typeof makePrismaMockFor>;
  let eventBusSpy: ReturnType<typeof createEventBusSpy>;
  let service: ConsentService;

  beforeEach(() => {
    prismaMock = makePrismaMockFor(['consentRecord']);
    eventBusSpy = createEventBusSpy();
    service = new ConsentService(prismaMock, eventBusSpy);
  });

  describe('captureConsent', () => {
    it('creates a consent record and emits consent.captured event', async () => {
      const ctx = buildCallerContext({ tenantId: 'tenant-1', userId: 'user-1' });
      prismaMock.consentRecord.create.mockResolvedValue({ id: 'consent-1', status: 'active' });

      const result = await service.captureConsent(ctx, {
        businessId: 'biz-1',
        channel: 'voice',
        consentType: 'tcpa',
        ipAddress: '203.0.113.1',
      });

      expect(result.status).toBe('active');
      expect(eventBusSpy.published).toContainEqual(
        expect.objectContaining({ eventType: 'consent.captured' })
      );
    });

    it('throws when businessId is not found', async () => {
      prismaMock.consentRecord.create.mockRejectedValue(new Error('Foreign key constraint'));
      await expect(service.captureConsent(ctx, { businessId: 'nonexistent', ... }))
        .rejects.toThrow();
    });
  });
});
```

### Mocking Patterns

**Mocking Prisma:**
```typescript
const prismaMock = makePrismaMockFor(['business', 'creditProfile', 'fundingRound']);
prismaMock.business.findFirst.mockResolvedValue({ id: 'biz-1', status: 'active' });
prismaMock.creditProfile.create.mockResolvedValue({ id: 'cp-1', score: 740 });
```

**Mocking Event Bus:**
```typescript
const eventBusSpy = createEventBusSpy();
// After service call:
expect(eventBusSpy.published[0].eventType).toBe('business.created');
expect(eventBusSpy.published).toHaveLength(1);
```

**Mocking external services (BullMQ, S3, bureau API):**
```typescript
vi.mock('../../src/backend/lib/queue', () => ({
  aprAlertQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) }
}));
```

### Assertion Patterns

- Use `expect().toMatchObject()` for partial object matching
- Use `expect().toContainEqual()` for array membership
- Use `expect().toHaveBeenCalledWith()` for mock call assertions
- Use `expect().rejects.toThrow()` for error path testing
- Never use `expect().toMatchSnapshot()` for compliance-critical output — use explicit assertions

---

## Integration Test Patterns

Integration tests exercise the full service + database layer against a real PostgreSQL 16 and Redis 7 instance. They validate queries, indexes, and transactions behave as expected.

### Setup and Teardown

```typescript
import { PrismaClient } from '@prisma/client';
import { createClient } from 'ioredis';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const redis = createClient(process.env.REDIS_URL);

beforeAll(async () => {
  await prisma.$connect();
  await redis.connect();
});

afterEach(async () => {
  // Clean up test data in reverse dependency order
  await prisma.ledgerEvent.deleteMany({ where: { tenantId: TEST_TENANT_ID } });
  await prisma.consentRecord.deleteMany({ where: { tenantId: TEST_TENANT_ID } });
  await prisma.business.deleteMany({ where: { tenantId: TEST_TENANT_ID } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.disconnect();
});
```

### Integration Test Pattern

```typescript
it('creates consent and can be queried by businessId + channel', async () => {
  // Arrange
  const business = await prisma.business.create({ data: testBusinessFixture() });

  // Act
  const consent = await consentService.captureConsent(testCtx, {
    businessId: business.id,
    channel: 'sms',
    consentType: 'tcpa',
  });

  // Assert — verify DB state directly
  const stored = await prisma.consentRecord.findFirst({
    where: { businessId: business.id, channel: 'sms' }
  });
  expect(stored).not.toBeNull();
  expect(stored!.status).toBe('active');
});
```

### Testing BullMQ Jobs

```typescript
it('schedules APR alert job in Redis queue', async () => {
  const queue = new Queue('apr-alerts', { connection: redis });
  await aprAlertService.scheduleAlerts(fundingRoundId, aprExpiryDate);
  const jobs = await queue.getJobs(['waiting', 'delayed']);
  expect(jobs.some(j => j.data.fundingRoundId === fundingRoundId)).toBe(true);
});
```

---

## E2E Test Patterns

E2E tests exercise complete user-facing workflows from HTTP-layer perspective using mocked infrastructure (no Docker required). They validate that all modules integrate correctly across a realistic sequence of API calls.

### Available Helpers

```typescript
import { createFullTestBusiness } from '../helpers/create-full-test-business';
import { makePrismaMockFor }       from '../helpers/prisma-mock';
import { createEventBusSpy }       from '../helpers/event-bus-spy';
import { buildCallerContext }       from '../helpers/caller-context';
```

**`createFullTestBusiness(prismaOverrides?)`** — Creates a complete business fixture with active status, one beneficial owner, a credit profile, and a funding readiness score. Returns the business, owner, credit profile, and caller context.

**`makePrismaMockFor(models)`** — Returns a deeply mocked PrismaClient that only includes the specified model methods. Prevents accidental real DB calls.

**`createEventBusSpy()`** — Returns an event bus instance that captures published events in memory for assertion.

**`buildCallerContext(overrides?)`** — Builds a `CallerContext` object with sensible test defaults.

### E2E Pattern — Full Workflow Test

```typescript
describe('Funding Flow E2E', () => {
  it('full flow: suitability → ack gate → consent gate → optimizer → apply → approve', async () => {
    // 1. Set up full test business
    const { business, ctx } = await createFullTestBusiness(prismaMock);

    // 2. Run suitability check
    const suitability = await suitabilityService.assess(ctx, business.id);
    expect(suitability.recommendation).toBe('approved');

    // 3. Capture required acknowledgment
    const ack = await ackService.sign(ctx, {
      businessId: business.id,
      acknowledgmentType: 'product_reality',
      version: '1.2',
    });
    expect(ack.id).toBeDefined();

    // 4. Capture TCPA consent
    const consent = await consentService.captureConsent(ctx, {
      businessId: business.id,
      channel: 'voice',
      consentType: 'tcpa',
    });
    expect(consent.status).toBe('active');

    // 5. Create funding round and application
    const round = await fundingService.createRound(ctx, { businessId: business.id, targetCredit: 75000 });
    const app   = await appService.createApplication(ctx, { fundingRoundId: round.id, issuer: 'chase' });
    expect(app.status).toBe('draft');

    // 6. Submit and approve
    await appService.updateApplication(ctx, app.id, { status: 'submitted' });
    await appService.updateApplication(ctx, app.id, { status: 'approved', approvedCredit: 25000 });

    // 7. Verify events
    const events = eventBusSpy.published.map(e => e.eventType);
    expect(events).toContain('consent.captured');
    expect(events).toContain('application.submitted');
    expect(events).toContain('card.approved');
  });
});
```

### Three Core E2E Test Files

| File | Tests | Covers |
|------|-------|--------|
| `tests/e2e/onboarding-flow.test.ts` | 12 | Business creation, KYB/KYC, OFAC hard stop, readiness scoring, track routing |
| `tests/e2e/funding-flow.test.ts` | 12 | Suitability, leverage, ack gate, consent gate, optimizer, apply, maker-checker approve |
| `tests/e2e/compliance-flow.test.ts` | 12 | UDAP scanning, state law profiles, consent gate, ack signing, document vault, dossier |

---

## Performance Testing

CapitalForge does not currently have automated performance test fixtures in the test suite. Performance baselines are established via the following manual procedures.

### API Latency Targets

| Endpoint Category | P50 Target | P99 Target |
|------------------|-----------|-----------|
| Auth (login/refresh) | < 100ms | < 300ms |
| Business read (single) | < 50ms | < 150ms |
| Credit profile ingest | < 200ms | < 500ms |
| Funding readiness score | < 300ms | < 800ms |
| UDAP compliance scan | < 500ms | < 1500ms |

### Load Testing (manual)

Use `autocannon` or `k6` for load testing against a staging environment:

```bash
# Install autocannon
npm install -g autocannon

# Run 30-second load test — 10 concurrent connections
autocannon -c 10 -d 30 -m GET \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "X-Tenant-ID: $TEST_TENANT" \
  http://localhost:4000/api/businesses
```

### Database Query Performance

Check slow queries in development via:

```bash
# Enable pg_stat_statements
psql -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# Query slowest statements
psql -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;"
```

All high-frequency queries must use indexed columns. Index coverage is verified as part of PR review (see CONTRIBUTING.md).

### BullMQ Job Throughput

APR alert jobs are scheduled as delayed BullMQ jobs. Under normal load:
- Alert scheduling: < 50ms per funding round
- Alert processing: < 200ms per job (including DB write + event emit)

---

## Test Data Management

### Fixtures vs. Factories

**Use factories, not static fixtures.** All test data is generated via factory functions in `tests/helpers/`:

```typescript
// Good — factory with sensible defaults + override capability
export function testBusinessFixture(overrides?: Partial<Business>): Business {
  return {
    id: `biz-${randomUUID()}`,
    tenantId: DEFAULT_TENANT_ID,
    legalName: 'Acme Corp LLC',
    ein: '12-3456789',
    entityType: 'llc',
    status: 'active',
    annualRevenue: 500000,
    ...overrides,
  };
}

// Bad — hardcoded UUID that collides across parallel test runs
const TEST_BUSINESS = { id: 'biz-abc-123', ... };
```

### Tenant Isolation in Tests

Every test that touches the database must use a unique `tenantId` per test run. Use `randomUUID()` in the test setup:

```typescript
const TEST_TENANT_ID = `test-${randomUUID()}`;
```

This prevents test pollution between parallel test runs and CI runs.

### Sensitive Data in Tests

- **Never use real SSNs, EINs, or DOBs** — use synthetic values: `SSN: '999-99-0001'`, `EIN: '99-9900001'`
- **Never use real credit bureau responses** — use stubbed bureau fixtures
- **Never use production API keys** — CI uses placeholder values that are intercepted by mocks

### Seeding for Manual Testing

```bash
npm run db:seed
```

Seeds the following reference data:
- 1 super_admin tenant + user
- 2 sample tenants with tenant_admin users
- Sample business records in various onboarding states
- Sample credit profiles and funding rounds
- Sample consent and acknowledgment records

---

## CI/CD Integration

### GitHub Actions — CI Pipeline (`.github/workflows/ci.yml`)

Triggered on: push and pull_request to `master`

```yaml
jobs:
  lint:       eslint + tsc --noEmit
  unit:       vitest run tests/unit (no infrastructure)
  integration: vitest run tests/integration (PostgreSQL 16 + Redis 7 service containers)
  e2e:        vitest run tests/e2e (no infrastructure)
```

All jobs must pass before a PR can be merged.

### Service Containers (Integration Tests in CI)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_DB: capitalforge_test
      POSTGRES_USER: capitalforge
      POSTGRES_PASSWORD: test_password
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

  redis:
    image: redis:7-alpine
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
```

### Environment Variables in CI

All secrets used in CI are stored in GitHub Actions Secrets and injected via `env:` blocks. No secrets appear in workflow YAML files.

### Fail Fast Policy

- If `lint` or `tsc` fails, other jobs do not run
- If unit tests fail, integration and E2E tests do not run
- Coverage check runs after all test jobs pass; it is advisory (not a merge gate) until v2.0.0-beta.1

---

## Coverage Targets

Run coverage: `npm run test:coverage`

Output: `coverage/` directory with HTML report at `coverage/index.html`

| Scope | Target | Current Status |
|-------|--------|----------------|
| Statements overall | >= 80% | See coverage report |
| Service layer | >= 90% | See coverage report |
| Compliance gates (consent, suitability, UDAP, ACH) | 100% | Enforced |
| Auth middleware | 100% | Enforced |
| Event bus publish paths | >= 95% | Enforced |
| Financial calculations (leverage, IRC 163(j)) | 100% | Enforced |

### Viewing the Coverage Report

```bash
npm run test:coverage
# HTML report: open coverage/index.html
# Text summary: printed to console
```

### Coverage Exclusions

The following are excluded from coverage requirements:
- `prisma/seed.ts` — manual seed script
- `scripts/` — operational shell scripts
- `src/frontend/` — frontend coverage tracked separately
- `*.d.ts` declaration files
- Test helper files in `tests/helpers/`

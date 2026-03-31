# api-test — Generate API Contract & Integration Tests

Generate API contract and integration tests from OpenAPI/GraphQL specs or live endpoints.

## Arguments

- **spec_path_or_url**: `$ARGUMENTS` — path to OpenAPI/GraphQL spec file or base URL
- **auth_mode**: none | bearer | api-key | oauth2 | cookie
- **env**: local | staging | production
- **test_style**: jest | vitest | mocha | pytest | supertest
- **load_smoke**: (optional) true — include basic load/smoke tests

## Process

### 1. Parse Spec / Discover Endpoints
- If spec file: parse OpenAPI/GraphQL schema and extract all endpoints.
- If URL: probe common endpoints, read available docs, or use provided spec.
- List all discovered endpoints with methods, params, and response schemas.

### 2. Generate Test Cases
For each endpoint, generate:

**Success Tests**
- Happy path with valid data
- All required parameters present
- Response schema validation
- Status code assertions

**Error Tests**
- Missing required fields → 400
- Invalid data types → 400/422
- Unauthorized access → 401
- Forbidden access → 403
- Not found → 404
- Duplicate/conflict → 409

**Edge Cases**
- Empty collections
- Pagination boundaries
- Large payloads
- Special characters in strings

### 3. Reusable Client & Helpers
- Create a test client/helper module with:
  - Base URL configuration per environment
  - Auth token/key injection
  - Response assertion helpers
  - Test data factories

### 4. CLI / Script for Environments
- Create a test runner script that accepts env as argument.
- Example: `npm run test:api -- --env=staging`
- Support `.env.test.local` for secrets.

### 5. Load Smoke (if load_smoke=true)
- Generate basic load test (k6, artillery, or autocannon).
- Target: key endpoints, 10-50 concurrent users, 30-second duration.
- Report: p50, p95, p99 latency, error rate.

### 6. Run & Summarize
- Execute all generated tests against specified env.
- Report results by endpoint and test category.

## Output

```
## API TEST RESULTS
- Endpoints tested: X
- Total tests: X | Passed: X | Failed: X

## GENERATED FILES
- tests/api/<endpoint>.test.ts
- tests/api/helpers/client.ts
- tests/api/helpers/factories.ts

## COMMANDS
- Run all: `npm run test:api`
- Run specific: `npm run test:api -- --grep "POST /api/cards"`
- Run against staging: `npm run test:api -- --env=staging`
```

## Example Invocation

```
/api-test ./openapi.yaml auth_mode=bearer env=local test_style=vitest load_smoke=true
```

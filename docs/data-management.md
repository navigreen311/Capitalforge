# CapitalForge Data Management Guide

This guide covers seeding, migration, backup, restore, test data generation, and cleanup procedures for CapitalForge.

---

## Table of Contents

1. [Database Seeding](#database-seeding)
2. [Data Migration](#data-migration)
3. [Synthetic Test Data](#synthetic-test-data)
4. [Data Cleanup](#data-cleanup)
5. [Database Health Checks](#database-health-checks)
6. [Backup & Restore](#backup--restore)
7. [CCPA / Data Deletion](#ccpa--data-deletion)
8. [Operational Runbooks](#operational-runbooks)

---

## Database Seeding

### Quick Start

```bash
# Minimal seed (1 tenant, 3 businesses)
npm run db:seed

# Comprehensive seed (3 tenants, 10 users, 25 businesses, 50+ applications)
npx tsx prisma/seed-full.ts
```

### seed.ts — Minimal Demo Seed

**File:** `prisma/seed.ts`

Creates a single `demo-advisors` tenant with:
- 2 users (admin + advisor)
- 3 businesses with owners and credit profiles
- 4 card applications across 2 funding rounds
- Consent records, compliance checks, product acknowledgments

Use this for: local development, CI bootstrapping.

### seed-full.ts — Comprehensive Demo Seed

**File:** `prisma/seed-full.ts`

Creates:

| Resource            | Count |
|---------------------|-------|
| Tenants             | 3 (starter / pro / enterprise) |
| Users               | 10 |
| Businesses          | 25 (varied industries, stages, FICO ranges) |
| Credit profiles     | 16 |
| Funding rounds      | 10 |
| Card applications   | 52+ |
| Consent records     | 12 |
| Compliance checks   | 12 |
| Documents           | 12 |
| Statement records   | 10 |
| Complaints          | 7 |
| Partners            | 8 |
| Suitability checks  | 4 |
| ACH authorizations  | 3 |
| Cost calculations   | 2 |
| Ledger events       | 10 |

**Tenants created:**

| Slug                     | Plan        | Focus |
|--------------------------|-------------|-------|
| `greenleaf-advisors`     | starter     | Small advisory shop, 5 businesses |
| `summit-capital`         | pro         | Mid-size firm, 10 businesses |
| `meridian-funding-group` | enterprise  | Large enterprise, 10 businesses |

**Default password for all users:** `DemoPass123!`

**Idempotent:** All upserts use stable IDs (e.g., `fs-gl-biz-001`). Safe to re-run.

### Seed Coverage by FICO Range

| Range       | Label     | Example Tenant |
|-------------|-----------|----------------|
| 760–850     | Excellent | Meridian enterprise clients |
| 700–759     | Good      | Summit pro clients |
| 650–699     | Fair      | Greenleaf starter + some Summit |
| Below 650   | Poor      | Intentionally absent from seed (use test generator) |

---

## Data Migration

**File:** `scripts/migrate-data.ts`

### Export a Tenant

Exports all data for a tenant to a JSON file.

```bash
npx tsx scripts/migrate-data.ts export \
  --tenant summit-capital \
  --output /backups/summit-capital-export-2026.json
```

The export JSON includes:
- Schema version header
- All businesses, owners, credit profiles
- Funding rounds and card applications
- Consent records, compliance checks, documents
- ACH authorizations, statements, complaints
- Partners, ledger events

### Validate an Export

Check referential integrity and required fields before importing.

```bash
npx tsx scripts/migrate-data.ts validate \
  --source /backups/summit-capital-export-2026.json
```

Validation checks:
- All required fields present
- Schema version present
- No orphaned businessOwners or creditProfiles
- Arrays are valid types

### Import into a New Tenant

Imports an export file into a new tenant with a fresh slug. All UUIDs are remapped — no ID collisions.

```bash
npx tsx scripts/migrate-data.ts import \
  --source /backups/summit-capital-export-2026.json \
  --tenant summit-capital-v2
```

Validation runs automatically before import. Import is wrapped in a single Prisma transaction — it either fully succeeds or fully rolls back.

### Transform Between Schema Versions

Applies migration transformations when the schema has changed between export and target version.

```bash
npx tsx scripts/migrate-data.ts transform \
  --source export-v1.json \
  --from 1 \
  --to 2 \
  --output export-v2.json
```

Current transforms defined:
- **v1 → v2:** normalizes `entityType` to lowercase, adds `fundingReadinessScore` default of 0

---

## Synthetic Test Data

**File:** `scripts/generate-test-data.ts`

Generates N businesses with full lifecycle data for load testing and performance benchmarking. Each business gets:
- Business owner
- Credit profile
- Consent record
- Funding round + card applications (if FICO/score qualifies)

### Usage

```bash
npx tsx scripts/generate-test-data.ts \
  --tenant summit-capital \
  --count 500 \
  --start 2024-01-01 \
  --end 2025-12-31 \
  --fico-dist balanced \
  --industry-mix diverse
```

### Options

| Option          | Values                                          | Default   |
|-----------------|-------------------------------------------------|-----------|
| `--tenant`      | Any existing tenant slug (required)             | —         |
| `--count`       | 1–10000                                         | 50        |
| `--start`       | ISO date string                                 | 2023-01-01 |
| `--end`         | ISO date string                                 | today     |
| `--fico-dist`   | `excellent` `good` `fair` `poor` `balanced`     | balanced  |
| `--industry-mix`| `diverse` `tech` `services` `retail`           | diverse   |
| `--dry-run`     | flag                                            | false     |

### FICO Distributions

| Value       | Score Range        | Use Case |
|-------------|-------------------|----------|
| `excellent` | 760–850            | Test premium approval flows |
| `good`      | 700–759            | Test standard approval flows |
| `fair`      | 650–699            | Test borderline/caution flows |
| `poor`      | 580–649            | Test decline and No-Go flows |
| `balanced`  | All ranges (equal) | General load testing |

### Dry Run

Preview what would be created without writing to the database:

```bash
npx tsx scripts/generate-test-data.ts \
  --tenant summit-capital \
  --count 50 \
  --dry-run true
```

### Cleanup After Testing

Test businesses use the ID prefix `test-<tenantSlug>-biz-`. Remove them with:

```bash
npx tsx scripts/cleanup-data.ts purge-test-data --tenant summit-capital
```

---

## Data Cleanup

**File:** `scripts/cleanup-data.ts`

All commands support `--dry-run` to preview changes without modifying data.

### Purge Test Data

Removes only test-generated businesses (prefix `test-<slug>-biz-`) from a tenant.

```bash
npx tsx scripts/cleanup-data.ts purge-test-data \
  --tenant summit-capital \
  [--dry-run]
```

### Expire Old Consents

Marks `active` consent records older than 2 years as `expired`.

```bash
# All tenants
npx tsx scripts/cleanup-data.ts expire-consents

# Specific tenant
npx tsx scripts/cleanup-data.ts expire-consents \
  --tenant summit-capital

# Preview first
npx tsx scripts/cleanup-data.ts expire-consents \
  --tenant summit-capital \
  --dry-run
```

**Note:** This updates `status` to `expired`. Records are retained for audit purposes.

### Archive Audit Logs (>2 Years)

Exports old audit logs to a JSON file and removes them from the database.

```bash
npx tsx scripts/cleanup-data.ts archive-audit-logs \
  --before 2024-01-01 \
  --output /archives/audit-logs-pre-2024.json

# Default: archive everything older than 2 years
npx tsx scripts/cleanup-data.ts archive-audit-logs \
  --output /archives/audit-logs-archive-$(date +%Y%m%d).json
```

### CCPA Deletion Request

Processes a data deletion request for a specific business. This:
1. Deletes business owners (PII)
2. Deletes consent records
3. Deletes documents
4. Revokes ACH authorizations
5. Anonymizes the business record (replaces name/EIN with `[DELETED-<id>]`)

```bash
npx tsx scripts/cleanup-data.ts process-ccpa \
  --business <business-uuid>

# Preview first
npx tsx scripts/cleanup-data.ts process-ccpa \
  --business <business-uuid> \
  --dry-run
```

### Purge Old Ledger Events

Removes processed ledger events older than a given date (useful after archiving).

```bash
npx tsx scripts/cleanup-data.ts purge-old-ledger \
  --before 2024-01-01
```

Only removes events where `processedAt IS NOT NULL`. Unprocessed events are preserved.

### Purge Entire Tenant

**Irreversible.** Removes all data for a tenant including the tenant record itself. Has a 3-second pause before executing.

```bash
# Always dry-run first
npx tsx scripts/cleanup-data.ts purge-tenant \
  --tenant test-tenant-slug \
  --dry-run

# Then execute
npx tsx scripts/cleanup-data.ts purge-tenant \
  --tenant test-tenant-slug
```

---

## Database Health Checks

**File:** `scripts/db-health-check.ts`

### Run a Full Health Check

```bash
# All tenants
npx tsx scripts/db-health-check.ts

# Scoped to one tenant
npx tsx scripts/db-health-check.ts --tenant summit-capital

# Machine-readable JSON output (for monitoring integrations)
npx tsx scripts/db-health-check.ts --json
```

### What It Checks

**Connectivity:**
- PostgreSQL connection via `SELECT 1`

**Table record counts:**
- All 49 tables in the schema
- Flags empty tables as warnings

**Orphan / integrity checks:**
- Active businesses with no owners
- Active businesses with no consent records
- Completed funding rounds with no applications
- Card applications referencing non-existent businesses
- Consent records with invalid business_id
- Debit events with no authorization
- Payment schedules with no repayment plan

**Distribution statistics:**
- Business status breakdown (active / onboarding / intake)
- Card application status (approved / declined / submitted / draft)
- Consent status (active / revoked / expired)
- Compliance risk level (low / medium / high / critical)

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Healthy (no errors) |
| 1    | Errors found (broken FK references, failed queries) |

Warnings (empty tables, missing consent records) do not cause a non-zero exit.

### Scheduling Health Checks

Add to cron for continuous monitoring:

```cron
# Run health check every 6 hours; alert on non-zero exit
0 */6 * * * npx tsx /app/scripts/db-health-check.ts --json >> /var/log/capitalforge/db-health.log 2>&1
```

---

## Backup & Restore

### Automated Backup (scripts/backup.sh)

The `scripts/backup.sh` script wraps `pg_dump` and uploads to object storage. See `scripts/backup.sh` for configuration.

```bash
# Run backup manually
bash scripts/backup.sh
```

**Backup schedule** (configure in cron or cloud scheduler):

| Frequency | Retention | Type |
|-----------|-----------|------|
| Daily     | 30 days   | Full |
| Weekly    | 12 weeks  | Full |
| Monthly   | 12 months | Full |

### Manual Restore

```bash
# 1. Restore from pg_dump file
pg_restore \
  --host=$PGHOST \
  --dbname=$PGDATABASE \
  --username=$PGUSER \
  --no-owner \
  --role=$PGUSER \
  /backups/capitalforge-2026-03-31.dump

# 2. Verify with health check
npx tsx scripts/db-health-check.ts
```

### Point-in-Time Recovery (Managed Databases)

For AWS RDS / Supabase / Neon:
- Enable PITR in the database console
- Restore to any timestamp within your retention window
- After restore, run `npx prisma migrate deploy` to verify migrations are current

---

## CCPA / Data Deletion

### Process Overview

1. Receive deletion request identifying `businessId`
2. Run dry-run to preview affected records:
   ```bash
   npx tsx scripts/cleanup-data.ts process-ccpa \
     --business <uuid> \
     --dry-run
   ```
3. Confirm with legal/compliance team
4. Execute deletion:
   ```bash
   npx tsx scripts/cleanup-data.ts process-ccpa \
     --business <uuid>
   ```
5. Record the deletion timestamp and confirmation in your compliance log

### Data Retained After CCPA Deletion

These records are **retained** for regulatory compliance (FCRA, ECOA, state requirements):
- `CardApplication` — adverse action history (anonymized)
- `ComplianceCheck` — regulatory audit trail
- `AuditLog` — system access log
- `FairLendingRecord` — Section 1071 reporting

These records are **deleted**:
- `BusinessOwner` — PII (SSN, DOB, address)
- `ConsentRecord` — consent evidence
- `Document` — uploaded files (vault keys cleared)
- `AchAuthorization` — bank authorization details

The `Business` record is **anonymized** (name replaced with `[DELETED-<id>]`, EIN cleared, status set to `deleted`).

---

## Operational Runbooks

### New Tenant Onboarding

```bash
# 1. Create tenant (via API or directly)
# 2. Optionally seed starter data for demos:
npx tsx prisma/seed-full.ts
# 3. Verify
npx tsx scripts/db-health-check.ts --tenant <new-slug>
```

### Pre-Production Environment Refresh

```bash
# 1. Drop and recreate schema
npx prisma migrate reset --force

# 2. Run comprehensive seed
npx tsx prisma/seed-full.ts

# 3. Generate load test data
npx tsx scripts/generate-test-data.ts \
  --tenant meridian-funding-group \
  --count 1000 \
  --fico-dist balanced \
  --industry-mix diverse

# 4. Verify health
npx tsx scripts/db-health-check.ts
```

### Monthly Maintenance

```bash
# 1. Expire old consents
npx tsx scripts/cleanup-data.ts expire-consents

# 2. Archive audit logs older than 2 years
npx tsx scripts/cleanup-data.ts archive-audit-logs \
  --output /archives/audit-logs-$(date +%Y-%m).json

# 3. Purge old processed ledger events
npx tsx scripts/cleanup-data.ts purge-old-ledger \
  --before $(date -d '2 years ago' +%Y-%m-%d)

# 4. Run health check and verify
npx tsx scripts/db-health-check.ts
```

### Production Incident: Orphaned Records Found

If `db-health-check.ts` reports orphaned records:

```bash
# 1. Identify the orphans
npx tsx scripts/db-health-check.ts --json | jq '.orphanChecks'

# 2. Investigate in Prisma Studio
npx prisma studio

# 3. If safe, clean up
# For orphaned consent records with bad businessId:
# UPDATE consent_records SET business_id = NULL WHERE business_id NOT IN (SELECT id FROM businesses);
# Run via psql or Prisma Studio
```

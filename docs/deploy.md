# CapitalForge — Deployment Guide

**Last updated:** 2026-03-31

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Commands](#docker-commands)
4. [Database Migration](#database-migration)
5. [Deployment Procedures](#deployment-procedures)
6. [Rollback Procedure](#rollback-procedure)
7. [Monitoring Checklist](#monitoring-checklist)
8. [Secrets Reference](#secrets-reference)

---

## Prerequisites

### Host Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | 24.x | 26.x |
| Docker Compose | 2.x | 2.27+ |
| Node.js (CI only) | 20 LTS | 20 LTS |

### DNS and TLS

- Production domain must resolve to the server IP before deploying.
- TLS certificates must be present at `/etc/nginx/certs/` on the host (see nginx config).
- Recommended: use Certbot with nginx plugin or an AWS ACM-terminated load balancer.

### External Services Required

| Service | Purpose |
|---------|---------|
| PostgreSQL 16 | Primary data store (managed or Docker) |
| Redis 7 | BullMQ job queue and session cache |
| AWS S3 (or compatible) | Document vault storage |
| GitHub Container Registry | Docker image storage (`ghcr.io`) |
| SMTP provider | Transactional emails |
| Twilio (optional) | VoiceForge telephony |
| Stripe (optional) | SaaS billing |

---

## Environment Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/green-companies-llc/capitalforge.git
cd capitalforge
```

### Step 2 — Copy and configure environment file

```bash
cp .env.example .env
```

Open `.env` and fill in **all required values**. See [Secrets Reference](#secrets-reference) below for details.

**Never commit `.env` to version control.**

### Step 3 — Verify Docker installation

```bash
docker --version          # Docker version 24.x or higher
docker compose version    # Docker Compose version v2.x or higher
docker info               # Confirms daemon is running
```

### Step 4 — Log in to GitHub Container Registry

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u <github-username> --password-stdin
```

---

## Docker Commands

### Development (local)

```bash
# Start all infrastructure services (Postgres + Redis)
docker compose up -d

# View service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Stop all services
docker compose down

# Stop and remove volumes (full reset)
docker compose down -v
```

### Production

```bash
# Pull latest images
IMAGE_TAG=<sha-or-semver> docker compose -f docker-compose.prod.yml pull

# Start / update services with rolling restart (zero-downtime)
IMAGE_TAG=<sha-or-semver> docker compose -f docker-compose.prod.yml up -d \
  --no-deps --remove-orphans backend frontend

# Full stack start
IMAGE_TAG=<sha-or-semver> docker compose -f docker-compose.prod.yml up -d

# View container status
docker compose -f docker-compose.prod.yml ps

# Tail backend logs in production
docker compose -f docker-compose.prod.yml logs -f backend

# Open a psql shell in the running postgres container
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U capitalforge -d capitalforge

# Run a one-off backend command
docker compose -f docker-compose.prod.yml run --rm backend node -e "console.log('ok')"
```

### Build images locally

```bash
# Build backend
docker build -t capitalforge/backend:local -f Dockerfile .

# Build frontend
docker build -t capitalforge/frontend:local -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_API_URL=/api .
```

---

## Database Migration

### Development

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Apply migrations (creates migration files)
npm run db:migrate

# Seed reference data
npm run db:seed
```

### Production

Migrations are run automatically by the CI/CD pipeline before each deployment. To run manually:

```bash
# Run pending migrations against production database
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma migrate deploy

# Check current migration status
docker compose -f docker-compose.prod.yml run --rm backend \
  npx prisma migrate status
```

**Important rules:**
- Never run `prisma migrate reset` on production — it will drop all data.
- Always take a database backup before running migrations (done automatically by the deploy workflow via `scripts/backup.sh`).
- If a migration fails mid-run, check `_prisma_migrations` table for the failed entry and resolve before re-attempting.

---

## Deployment Procedures

### Automated via GitHub Actions

| Trigger | Environment | Workflow |
|---------|-------------|----------|
| Push to `main` | Staging | `.github/workflows/deploy.yml` → `deploy-staging` |
| Publish GitHub Release (semver tag) | Production | `.github/workflows/deploy.yml` → `deploy-production` |
| Manual `workflow_dispatch` | Staging or Production | `.github/workflows/deploy.yml` |

### Manual Deployment (emergency / hotfix)

1. SSH to the server:

   ```bash
   ssh deploy@<server-ip>
   ```

2. Navigate to the application directory:

   ```bash
   cd /opt/capitalforge
   ```

3. Pull the new images:

   ```bash
   IMAGE_TAG=<target-tag> \
   REGISTRY=ghcr.io \
   IMAGE_NAMESPACE=green-companies-llc/capitalforge \
   docker compose -f docker-compose.prod.yml pull backend frontend
   ```

4. Run migrations:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy
   ```

5. Restart services:

   ```bash
   IMAGE_TAG=<target-tag> \
   docker compose -f docker-compose.prod.yml up -d \
     --no-deps --remove-orphans backend frontend
   ```

6. Verify health:

   ```bash
   curl -s https://<domain>/api/health | jq .
   # Expected: { "status": "ok", "db": "ok", "redis": "ok" }
   ```

---

## Rollback Procedure

### Automated Rollback

The deploy workflow automatically attempts a rollback to the `latest` tagged image if the production health check fails. Review the Actions run logs for details.

### Manual Rollback

1. Identify the last known good image tag from the GitHub Packages registry or `docker images`.

2. Pin the rollback tag:

   ```bash
   export ROLLBACK_TAG=<last-known-good-sha>
   ```

3. Pull the rollback images:

   ```bash
   IMAGE_TAG=${ROLLBACK_TAG} docker compose -f docker-compose.prod.yml pull backend frontend
   ```

4. Restore the database backup (if schema changed in the failed release):

   ```bash
   # List available backups
   ls -lht /var/backups/capitalforge/

   # Restore (replaces current data — confirm before running)
   zcat /var/backups/capitalforge/capitalforge_<TIMESTAMP>_pre-deploy-<SHA>.sql.gz | \
     psql "${DATABASE_URL}"
   ```

5. Restart on the rollback image:

   ```bash
   IMAGE_TAG=${ROLLBACK_TAG} docker compose -f docker-compose.prod.yml up -d \
     --no-deps --remove-orphans backend frontend
   ```

6. Verify health and notify the team via your incident channel.

**Rollback decision rules:**
- If migration was applied and contains destructive changes, restoring the DB backup is required.
- If migration was additive only (new columns with defaults, new tables), rolling back the app image without a DB restore is usually safe.
- Always confirm with the team lead before restoring production data.

---

## Monitoring Checklist

Use this checklist after every deployment to confirm the system is healthy.

### Immediate (first 5 minutes)

- [ ] `/api/health` returns `200 OK` with `{ status: "ok", db: "ok", redis: "ok" }`
- [ ] No `ERROR` or `FATAL` lines in `docker compose logs backend` since deploy
- [ ] No `ERROR` or `FATAL` lines in `docker compose logs frontend` since deploy
- [ ] `docker compose ps` shows all containers as `Up (healthy)`
- [ ] Nginx access log shows no `5xx` responses for recent requests

### Functional (first 15 minutes)

- [ ] Auth login endpoint `POST /api/auth/login` returns a valid JWT
- [ ] Business listing endpoint `GET /api/businesses` returns correct tenant data
- [ ] BullMQ job queue shows no failed jobs: `docker compose exec redis redis-cli LLEN bull:apr-expiry:failed`
- [ ] Prisma migration table shows no failed migrations: `npx prisma migrate status`

### Ongoing Monitoring

| Signal | Tool | Threshold |
|--------|------|-----------|
| Backend error rate | Application logs / Datadog | < 0.1% of requests |
| Response time (p95) | APM / nginx logs | < 500ms |
| Database connection pool | Prisma metrics | < 80% utilization |
| Redis memory | `redis-cli INFO memory` | < 80% of `maxmemory` |
| Disk usage | `df -h` | < 80% on backup and data volumes |
| BullMQ failed jobs | Bull dashboard or CLI | 0 failed jobs per hour |
| TLS certificate expiry | Certbot / ACM | > 30 days remaining |

### Alert Runbook Links

- **5xx spike** — check `docker compose logs backend` for stack traces; roll back if error rate > 1%
- **DB connection exhaustion** — check `pg_stat_activity`; restart backend containers to flush idle connections
- **Redis OOM** — check memory policy (`allkeys-lru` should auto-evict); increase `maxmemory` if needed
- **BullMQ stuck jobs** — check Redis key expiry; inspect job payload in Bull dashboard; re-queue or discard

---

## Secrets Reference

Set all of the following in `.env` (production) or as GitHub Actions repository secrets (CI/CD).

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/dbname` |
| `REDIS_URL` | Yes | `redis://:password@host:6379` |
| `REDIS_PASSWORD` | Yes | Redis auth password |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL superuser password |
| `JWT_ACCESS_SECRET` | Yes | Min 32-char random secret for access tokens |
| `JWT_REFRESH_SECRET` | Yes | Min 32-char random secret for refresh tokens |
| `JWT_ACCESS_EXPIRY` | Yes | e.g. `15m` |
| `JWT_REFRESH_EXPIRY` | Yes | e.g. `7d` |
| `ENCRYPTION_KEY` | Yes | 32-byte AES-256 key for PII field encryption |
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | Backend API port (default `4000`) |
| `FRONTEND_URL` | Yes | Full public URL of the frontend |
| `NEXT_PUBLIC_API_URL` | Yes | e.g. `/api` or `https://api.yourdomain.com` |
| `STORAGE_PROVIDER` | Yes | `s3` or `local` |
| `S3_BUCKET` | If S3 | S3 bucket name for document vault |
| `S3_REGION` | If S3 | AWS region |
| `AWS_ACCESS_KEY_ID` | If S3 | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | If S3 | AWS secret key |
| `TWILIO_ACCOUNT_SID` | VoiceForge | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | VoiceForge | Twilio auth token |
| `STRIPE_SECRET_KEY` | Billing | Stripe secret key |
| `BUREAU_API_KEY` | Credit Intel | Credit bureau aggregator key |
| `SANCTIONLIST_API_KEY` | Compliance | Sanctions screening provider key |
| `STAGING_SSH_KEY` | CI/CD | SSH private key for staging server |
| `STAGING_HOST` | CI/CD | Staging server IP or hostname |
| `STAGING_USER` | CI/CD | SSH user for staging |
| `PRODUCTION_SSH_KEY` | CI/CD | SSH private key for production server |
| `PRODUCTION_HOST` | CI/CD | Production server IP or hostname |
| `PRODUCTION_USER` | CI/CD | SSH user for production |

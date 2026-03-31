# deploy-prod — Prepare Production Deployment

Prepare production deployment assets and a repeatable pipeline.

## Arguments

- **platform**: `$ARGUMENTS` — target platform (vercel | aws | gcp | azure | docker | railway | fly)
- **region**: deployment region (e.g., us-east-1)
- **runtime**: Node.js version, Python version, etc.
- **database**: postgres | mysql | mongodb | sqlite | supabase | planetscale
- **secrets_source**: env-file | aws-ssm | vault | doppler | vercel-env
- **zero_downtime**: true | false — whether rolling/blue-green deploy is required

## Process

### 1. Architecture Diagram
- Generate a deployment architecture diagram (Mermaid).
- Show: compute, database, CDN, load balancer, DNS, secrets, monitoring.

### 2. Infrastructure / Platform Config
- Generate IaC (Terraform, Pulumi) or platform config (vercel.json, fly.toml, Dockerfile).
- Include environment variable templates with placeholder values.
- Configure database connection, migrations, and seed strategy.

### 3. Build & Release Scripts
- Create or update build scripts (Dockerfile, build commands).
- Add release scripts: migrate, seed, health-check.
- Generate `scripts/deploy.sh` for one-command deploy.

### 4. Rollout Strategy
- If zero_downtime=true: configure rolling deploy or blue-green.
- Define health check endpoints and readiness probes.
- Document rollback procedure (exact commands).

### 5. Observability
- Add structured logging configuration.
- Configure error tracking (Sentry or equivalent) placeholder.
- Add health/readiness endpoints if not present.
- Document key metrics to monitor post-deploy.

### 6. Staging Deploy & Smoke Tests
- Provide commands for staging deployment.
- List smoke test steps (manual or scripted).
- Verify critical paths before production cutover.

## Output

```
## DEPLOYMENT ARCHITECTURE
<Mermaid diagram>

## HOW TO DEPLOY
<exact commands for staging and production>

## ROLLBACK
<exact rollback commands>

## MONITORING
<what to watch post-deploy>
```

### 7. Documentation
- Create or update `docs/deploy.md` with full deployment guide.
- Include: prerequisites, env vars, commands, troubleshooting.

## Example Invocation

```
/deploy-prod vercel region=us-east-1 runtime=node20 database=supabase secrets_source=vercel-env zero_downtime=true
```

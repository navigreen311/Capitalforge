#!/usr/bin/env bash
# =============================================================================
# CapitalForge — One-Command Setup Script
# =============================================================================
# Usage: bash scripts/setup.sh
#
# Idempotent — safe to run multiple times.
# Checks for required prerequisites, starts infrastructure, installs
# dependencies, configures environment, and runs database migrations + seed.
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_step()    { echo -e "\n${BOLD}${BLUE}==> $*${NC}"; }
die()         { log_error "$*"; exit 1; }

# ── Resolve repo root (script lives in /scripts/) ─────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"
log_info "Working directory: ${REPO_ROOT}"

# =============================================================================
# Step 1 — Check Prerequisites
# =============================================================================
log_step "Checking prerequisites"

# Node.js
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install Node.js >= 20 from https://nodejs.org/"
fi
NODE_VERSION="$(node --version | sed 's/v//')"
NODE_MAJOR="$(echo "${NODE_VERSION}" | cut -d. -f1)"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  die "Node.js >= 20 is required. Found: v${NODE_VERSION}. Update at https://nodejs.org/"
fi
log_success "Node.js v${NODE_VERSION}"

# npm
if ! command -v npm &>/dev/null; then
  die "npm is not installed. It should come with Node.js."
fi
NPM_VERSION="$(npm --version)"
log_success "npm v${NPM_VERSION}"

# Docker
if ! command -v docker &>/dev/null; then
  die "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
fi
DOCKER_VERSION="$(docker --version | awk '{print $3}' | tr -d ',')"
log_success "Docker v${DOCKER_VERSION}"

# Docker Compose (v2 plugin — `docker compose`, not `docker-compose`)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VERSION="$(docker compose version --short 2>/dev/null || echo 'v2')"
  COMPOSE_CMD="docker compose"
  log_success "Docker Compose ${COMPOSE_VERSION} (plugin)"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_VERSION="$(docker-compose --version | awk '{print $3}' | tr -d ',')"
  COMPOSE_CMD="docker-compose"
  log_success "Docker Compose v${COMPOSE_VERSION} (standalone)"
else
  die "Docker Compose is not installed. Install Docker Desktop (includes Compose) or the Compose plugin."
fi

# Verify Docker daemon is running
if ! docker info &>/dev/null 2>&1; then
  die "Docker daemon is not running. Start Docker Desktop and try again."
fi
log_success "Docker daemon is running"

# =============================================================================
# Step 2 — Start Infrastructure (PostgreSQL + Redis)
# =============================================================================
log_step "Starting infrastructure containers (PostgreSQL + Redis)"

${COMPOSE_CMD} up -d

log_info "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY=0
until ${COMPOSE_CMD} exec -T postgres pg_isready -U capitalforge -q 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ "${RETRY}" -ge "${MAX_RETRIES}" ]; then
    die "PostgreSQL did not become ready in time. Check 'docker compose logs postgres'."
  fi
  sleep 2
done
log_success "PostgreSQL is ready"

log_info "Waiting for Redis to be ready..."
RETRY=0
until ${COMPOSE_CMD} exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  RETRY=$((RETRY + 1))
  if [ "${RETRY}" -ge "${MAX_RETRIES}" ]; then
    die "Redis did not become ready in time. Check 'docker compose logs redis'."
  fi
  sleep 2
done
log_success "Redis is ready"

# =============================================================================
# Step 3 — Install Node Dependencies
# =============================================================================
log_step "Installing Node.js dependencies"

npm install
log_success "npm install complete"

# =============================================================================
# Step 4 — Configure Environment
# =============================================================================
log_step "Configuring environment"

if [ ! -f "${REPO_ROOT}/.env" ]; then
  if [ -f "${REPO_ROOT}/.env.example" ]; then
    cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
    log_success "Copied .env.example to .env"
    log_warn "IMPORTANT: Open .env and replace all placeholder values with your actual secrets before running the application."
    log_warn "           Specifically: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY must be strong random values."
  else
    log_warn ".env.example not found. Skipping .env creation. You must create .env manually before running the app."
  fi
else
  log_info ".env already exists — skipping copy"
fi

# =============================================================================
# Step 5 — Generate Prisma Client
# =============================================================================
log_step "Generating Prisma client"

npx prisma generate
log_success "Prisma client generated"

# =============================================================================
# Step 6 — Run Database Migrations
# =============================================================================
log_step "Running database migrations"

# Load DATABASE_URL from .env if it exists and isn't already set
if [ -z "${DATABASE_URL:-}" ] && [ -f "${REPO_ROOT}/.env" ]; then
  # Export only DATABASE_URL from .env (safely, without eval)
  DATABASE_URL_FROM_ENV="$(grep '^DATABASE_URL=' "${REPO_ROOT}/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [ -n "${DATABASE_URL_FROM_ENV}" ]; then
    export DATABASE_URL="${DATABASE_URL_FROM_ENV}"
    log_info "Loaded DATABASE_URL from .env"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  die "DATABASE_URL is not set. Set it in .env or as an environment variable before running this script."
fi

npx prisma migrate dev --name "initial_setup" 2>/dev/null || npx prisma migrate dev
log_success "Database migrations complete"

# =============================================================================
# Step 7 — Seed Database
# =============================================================================
log_step "Seeding database with reference data"

if [ -f "${REPO_ROOT}/prisma/seed.ts" ]; then
  npx prisma db seed
  log_success "Database seeded successfully"
else
  log_warn "No seed file found at prisma/seed.ts — skipping seed step"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}  CapitalForge setup complete!${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo ""
echo -e "  ${BOLD}Start the development server:${NC}"
echo -e "    npm run dev"
echo ""
echo -e "  ${BOLD}API:${NC}       http://localhost:4000/api"
echo -e "  ${BOLD}Frontend:${NC}  http://localhost:3000"
echo -e "  ${BOLD}DB Studio:${NC} npx prisma studio"
echo ""
echo -e "  ${BOLD}Run tests:${NC}"
echo -e "    npm test                  # all tests"
echo -e "    npm run test:unit         # unit tests only"
echo -e "    npm run test:integration  # integration tests only"
echo ""
if [ -f "${REPO_ROOT}/.env" ]; then
  if grep -q "YOUR_\|REPLACE_\|CHANGEME\|placeholder" "${REPO_ROOT}/.env" 2>/dev/null; then
    echo -e "  ${YELLOW}${BOLD}REMINDER:${NC} Your .env still contains placeholder values."
    echo -e "  ${YELLOW}          Edit .env and replace all placeholders before running the app.${NC}"
    echo ""
  fi
fi

#!/usr/bin/env bash
# =============================================================================
# CapitalForge — Production Deployment Script
# Strategy: Blue-Green swap with health-gate and automatic rollback
#
# Usage:
#   ./scripts/deploy.sh [--rollback] [--tag <image-tag>] [--skip-migrations]
#
# Requires: docker, docker compose, curl, jq
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()     { echo -e "${BLUE}[DEPLOY]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/.env"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ROLLBACK=false
SKIP_MIGRATIONS=false
HEALTH_TIMEOUT=120   # seconds to wait for healthy containers after swap
HEALTH_RETRIES=24    # check every 5 s → 120 s total

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --rollback)         ROLLBACK=true ;;
        --tag)              IMAGE_TAG="$2"; shift ;;
        --skip-migrations)  SKIP_MIGRATIONS=true ;;
        -h|--help)
            echo "Usage: $0 [--rollback] [--tag <tag>] [--skip-migrations]"
            exit 0
            ;;
        *) die "Unknown argument: $1" ;;
    esac
    shift
done

# ── Pre-flight checks ─────────────────────────────────────────────────────────
preflight() {
    log "Running pre-flight checks…"
    for cmd in docker curl jq; do
        command -v "$cmd" &>/dev/null || die "Required command not found: $cmd"
    done
    [[ -f "$ENV_FILE" ]] || die ".env file not found at $ENV_FILE — copy .env.example and fill in secrets."
    [[ -f "$COMPOSE_FILE" ]] || die "docker-compose.prod.yml not found."
    success "Pre-flight checks passed."
}

# ── Pull images from registry ─────────────────────────────────────────────────
pull_images() {
    log "Pulling images with tag: $IMAGE_TAG"
    export IMAGE_TAG
    # shellcheck disable=SC1091
    source "$ENV_FILE" 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull backend frontend
    success "Images pulled."
}

# ── Run Prisma migrations ─────────────────────────────────────────────────────
run_migrations() {
    if [[ "$SKIP_MIGRATIONS" == "true" ]]; then
        warn "Skipping database migrations (--skip-migrations flag set)."
        return
    fi
    log "Running Prisma migrations…"
    # Run migrations inside a temporary backend container before traffic cut-over
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        run --rm --no-deps \
        -e IMAGE_TAG="$IMAGE_TAG" \
        backend \
        node -e "
          const { execSync } = require('child_process');
          execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        " || die "Migrations failed. Aborting deployment."
    success "Migrations applied."
}

# ── Health check a service ────────────────────────────────────────────────────
wait_healthy() {
    local service="$1"
    log "Waiting for $service to become healthy (timeout: ${HEALTH_TIMEOUT}s)…"
    local i=0
    while [[ $i -lt $HEALTH_RETRIES ]]; do
        local status
        status=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            ps --format json "$service" 2>/dev/null \
            | jq -r '.[0].Health // "unknown"' 2>/dev/null || echo "unknown")
        if [[ "$status" == "healthy" ]]; then
            success "$service is healthy."
            return 0
        fi
        log "  $service health: $status (attempt $((i+1))/$HEALTH_RETRIES)"
        sleep 5
        ((i++))
    done
    error "$service did not become healthy within ${HEALTH_TIMEOUT}s."
    return 1
}

# ── Save current image digests for rollback ───────────────────────────────────
save_rollback_state() {
    local state_file="$PROJECT_ROOT/.deploy-rollback-state"
    log "Saving rollback state…"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        ps --format json 2>/dev/null \
        | jq -r '.[].Image' \
        > "$state_file" 2>/dev/null || true

    # Also store the current IMAGE_TAG
    echo "ROLLBACK_TAG=${IMAGE_TAG}" >> "$state_file"
    success "Rollback state saved to $state_file"
}

# ── Deploy (blue-green swap) ──────────────────────────────────────────────────
deploy() {
    log "========================================================"
    log "  CapitalForge — Deploying tag: $IMAGE_TAG"
    log "========================================================"

    save_rollback_state
    pull_images
    run_migrations

    log "Starting new containers (scaling up)…"
    export IMAGE_TAG
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        up -d --remove-orphans --no-build

    # Health-gate: all key services must be healthy before we declare success
    local failed=false
    for svc in postgres redis backend frontend nginx; do
        wait_healthy "$svc" || { failed=true; break; }
    done

    if [[ "$failed" == "true" ]]; then
        error "One or more services failed health checks. Initiating rollback…"
        rollback
        die "Deployment FAILED and was rolled back."
    fi

    # Clean up dangling images to reclaim disk space
    docker image prune -f --filter "label=org.opencontainers.image.source=capitalforge" 2>/dev/null || true

    success "========================================================"
    success "  Deployment SUCCESSFUL — running tag: $IMAGE_TAG"
    success "========================================================"
}

# ── Rollback ──────────────────────────────────────────────────────────────────
rollback() {
    local state_file="$PROJECT_ROOT/.deploy-rollback-state"
    warn "========================================================"
    warn "  ROLLBACK INITIATED"
    warn "========================================================"

    if [[ ! -f "$state_file" ]]; then
        die "No rollback state found at $state_file. Cannot roll back."
    fi

    # Extract the previously deployed tag
    local prev_tag
    prev_tag=$(grep "^ROLLBACK_TAG=" "$state_file" | cut -d= -f2 || echo "previous")
    warn "Rolling back to tag: $prev_tag"

    export IMAGE_TAG="$prev_tag"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        up -d --remove-orphans --no-build

    for svc in backend frontend; do
        wait_healthy "$svc" || warn "$svc did not become healthy after rollback — manual intervention required."
    done

    warn "Rollback complete. Review logs with: docker compose -f docker-compose.prod.yml logs -f"
}

# ── Entry point ───────────────────────────────────────────────────────────────
main() {
    preflight

    if [[ "$ROLLBACK" == "true" ]]; then
        rollback
    else
        deploy
    fi
}

main "$@"

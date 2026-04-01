#!/usr/bin/env bash
# =============================================================================
# CapitalForge — k6 Load Test Runner
#
# Runs all k6 performance scenarios and produces per-scenario JSON summaries
# plus a consolidated HTML report (requires k6-reporter or xk6-dashboard).
#
# Usage:
#   ./scripts/run-load-tests.sh [OPTIONS] [SCENARIO]
#
# Options:
#   --scenario <name>    Run only the named scenario (default: all)
#                        Values: onboarding | funding-flow | api-stress | compliance
#   --base-url <url>     Target API base URL (default: http://localhost:4000)
#   --token <jwt>        Bearer token for authenticated routes
#   --tenant-id <id>     Tenant UUID injected via X-Tenant-Id header
#   --output-dir <path>  Directory for test reports (default: reports/)
#   --no-html            Skip HTML report generation
#   --summary            Print aggregated pass/fail summary to stdout only
#   --help               Show this help and exit
#
# Environment variables (override flags):
#   K6_BASE_URL    API base URL
#   K6_AUTH_TOKEN  JWT bearer token
#   K6_TENANT_ID   Tenant UUID
#
# Requires: k6 >= 0.45 (https://k6.io/docs/getting-started/installation/)
#           Optional: xk6-dashboard for live HTML report streaming
#
# Examples:
#   # Run all scenarios against local dev server
#   ./scripts/run-load-tests.sh
#
#   # Run only the funding flow scenario against staging
#   ./scripts/run-load-tests.sh --scenario funding-flow \
#     --base-url https://api.staging.capitalforge.io \
#     --token "$CI_LOAD_TEST_TOKEN"
#
#   # Run all with custom output directory
#   ./scripts/run-load-tests.sh --output-dir ci-reports/$(date +%Y%m%d_%H%M%S)
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
log()     { echo -e "${BLUE}[LOAD-TEST]${NC} $*"; }
success() { echo -e "${GREEN}[PASS]${NC}     $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}     $*"; }
error()   { echo -e "${RED}[FAIL]${NC}     $*" >&2; }
header()  { echo -e "\n${CYAN}══════════════════════════════════════════════${NC}"; \
            echo -e "${CYAN}  $*${NC}"; \
            echo -e "${CYAN}══════════════════════════════════════════════${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCENARIOS_DIR="$PROJECT_ROOT/tests/performance/scenarios"
OUTPUT_DIR="$PROJECT_ROOT/reports"
BASE_URL="${K6_BASE_URL:-http://localhost:4000}"
AUTH_TOKEN="${K6_AUTH_TOKEN:-}"
TENANT_ID="${K6_TENANT_ID:-test-tenant-load}"
RUN_SCENARIO="all"
GENERATE_HTML=true
SUMMARY_ONLY=false

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)   RUN_SCENARIO="$2";  shift 2 ;;
    --base-url)   BASE_URL="$2";      shift 2 ;;
    --token)      AUTH_TOKEN="$2";    shift 2 ;;
    --tenant-id)  TENANT_ID="$2";     shift 2 ;;
    --output-dir) OUTPUT_DIR="$2";    shift 2 ;;
    --no-html)    GENERATE_HTML=false; shift ;;
    --summary)    SUMMARY_ONLY=true;   shift ;;
    --help|-h)
      sed -n '/^# Usage:/,/^# =====*$/p' "$0" | head -n -1 | sed 's/^# //'
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ── Preflight checks ──────────────────────────────────────────────────────────
if ! command -v k6 &>/dev/null; then
  error "k6 is not installed. Install it from https://k6.io/docs/getting-started/installation/"
  exit 1
fi

K6_VERSION=$(k6 version 2>&1 | head -1)
log "Using $K6_VERSION"

# ── Ensure output directory exists ───────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"
log "Reports will be written to: $OUTPUT_DIR"

# ── Build k6 env flags ────────────────────────────────────────────────────────
K6_ENV_FLAGS=(
  "-e" "K6_BASE_URL=${BASE_URL}"
  "-e" "K6_TENANT_ID=${TENANT_ID}"
)

if [[ -n "$AUTH_TOKEN" ]]; then
  K6_ENV_FLAGS+=("-e" "K6_AUTH_TOKEN=${AUTH_TOKEN}")
fi

# ── Scenario registry ─────────────────────────────────────────────────────────
declare -A SCENARIO_FILES
SCENARIO_FILES=(
  [onboarding]="onboarding-load.js"
  [funding-flow]="funding-flow-load.js"
  [api-stress]="api-stress.js"
  [compliance]="compliance-load.js"
)

declare -A SCENARIO_LABELS
SCENARIO_LABELS=(
  [onboarding]="Onboarding Load (50 VUs — business create, owner, KYB/KYC)"
  [funding-flow]="Funding Flow Load (30 VUs — suitability → optimize → apply → approve)"
  [api-stress]="API Stress Test (100 VUs — core endpoint stress)"
  [compliance]="Compliance Load (30 VUs — UDAP, consent gates, document vault)"
)

# ── Run helper ────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
declare -a FAILED_SCENARIOS

run_scenario() {
  local key="$1"
  local file="${SCENARIO_FILES[$key]}"
  local label="${SCENARIO_LABELS[$key]}"
  local full_path="$SCENARIOS_DIR/$file"

  if [[ ! -f "$full_path" ]]; then
    warn "Scenario file not found, skipping: $full_path"
    return
  fi

  header "$label"
  log "Starting: $key"
  log "File:     $full_path"
  log "Target:   $BASE_URL"

  local report_json="$OUTPUT_DIR/${key}-summary.json"
  local report_html="$OUTPUT_DIR/${key}-report.html"
  local exit_code=0

  local k6_cmd=(
    k6 run
    "${K6_ENV_FLAGS[@]}"
    --summary-export="$report_json"
  )

  # Attach xk6-dashboard HTML output if available and not suppressed
  if $GENERATE_HTML && k6 run --help 2>&1 | grep -q '\-\-out'; then
    # xk6-dashboard: k6 run --out dashboard=... (requires xk6-dashboard build)
    # Gracefully fall back if not available
    if k6 run --help 2>&1 | grep -q 'dashboard'; then
      k6_cmd+=("--out" "dashboard=report=${report_html}")
    fi
  fi

  k6_cmd+=("$full_path")

  set +e
  if $SUMMARY_ONLY; then
    "${k6_cmd[@]}" --quiet 2>&1
    exit_code=$?
  else
    "${k6_cmd[@]}" 2>&1 | tee "$OUTPUT_DIR/${key}-run.log"
    exit_code=$?
  fi
  set -e

  if [[ $exit_code -eq 0 ]]; then
    success "$key — PASSED (thresholds met)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    error "$key — FAILED (threshold violation or execution error, exit code: $exit_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_SCENARIOS+=("$key")
  fi

  log "Report: $report_json"
  echo ""
}

# ── Execute scenarios ─────────────────────────────────────────────────────────
START_TS=$(date +%s)

if [[ "$RUN_SCENARIO" == "all" ]]; then
  log "Running all $(${#SCENARIO_FILES[@]}) scenarios sequentially"
  for key in onboarding funding-flow api-stress compliance; do
    run_scenario "$key"
  done
elif [[ -n "${SCENARIO_FILES[$RUN_SCENARIO]+_}" ]]; then
  run_scenario "$RUN_SCENARIO"
else
  error "Unknown scenario: '$RUN_SCENARIO'"
  error "Available scenarios: ${!SCENARIO_FILES[*]}"
  exit 1
fi

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

# ── Final summary ─────────────────────────────────────────────────────────────
header "Load Test Run Summary"
echo -e "  Duration  : ${ELAPSED}s"
echo -e "  Target    : ${BASE_URL}"
echo -e "  Tenant    : ${TENANT_ID}"
echo -e "  Reports   : ${OUTPUT_DIR}"
echo ""
echo -e "  ${GREEN}Passed${NC} : ${PASS_COUNT}"
echo -e "  ${RED}Failed${NC} : ${FAIL_COUNT}"
echo ""

if [[ ${#FAILED_SCENARIOS[@]} -gt 0 ]]; then
  error "The following scenarios exceeded thresholds:"
  for s in "${FAILED_SCENARIOS[@]}"; do
    error "  - $s  (see $OUTPUT_DIR/${s}-run.log)"
  done
  echo ""
  exit 1
else
  success "All scenarios passed!"
  exit 0
fi

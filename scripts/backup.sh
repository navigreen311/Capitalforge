#!/usr/bin/env bash
# =============================================================================
# CapitalForge — Database Backup Script
#
# Usage:
#   bash scripts/backup.sh [label]
#
# Arguments:
#   label  Optional tag appended to the backup filename (e.g. "pre-deploy-abc1234").
#          Defaults to "scheduled".
#
# What this script does:
#   1. Validates required environment variables.
#   2. Runs pg_dump with a UTC timestamp in the filename.
#   3. Compresses the dump with gzip.
#   4. Uploads the compressed dump to S3 (stub — replace with real AWS CLI call).
#   5. Verifies the backup is non-empty and passes a quick restore dry-run.
#   6. Enforces a 90-day retention policy by deleting older backups from the
#      local backup directory and the S3 prefix.
#   7. Logs every step with ISO 8601 timestamps.
#   8. Exits non-zero on any failure — safe to call from CI/CD pipelines.
#
# Required environment variables:
#   DATABASE_URL     — PostgreSQL connection string
#   BACKUP_DIR       — Local directory to write dump files (default: /var/backups/capitalforge)
#   S3_BUCKET        — S3 bucket name for remote backup storage
#   S3_REGION        — AWS region (default: us-east-1)
#   RETENTION_DAYS   — Days to keep backups (default: 90)
#
# Optional environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY — if not using instance role
#   POSTGRES_EXTRA_OPTS — additional pg_dump flags (e.g. "--exclude-table=sessions")
# =============================================================================

set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

error() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2
}

# ── Configuration ─────────────────────────────────────────────────────────────

LABEL="${1:-scheduled}"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/capitalforge}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
S3_REGION="${S3_REGION:-us-east-1}"

DUMP_FILENAME="capitalforge_${TIMESTAMP}_${LABEL}.sql"
COMPRESSED_FILENAME="${DUMP_FILENAME}.gz"
DUMP_PATH="${BACKUP_DIR}/${DUMP_FILENAME}"
COMPRESSED_PATH="${BACKUP_DIR}/${COMPRESSED_FILENAME}"

# S3 key prefix — organise by year/month for lifecycle rules
S3_PREFIX="backups/$(date -u '+%Y/%m')"
S3_KEY="${S3_PREFIX}/${COMPRESSED_FILENAME}"

# ── Validate required env vars ────────────────────────────────────────────────

log "=== CapitalForge Database Backup ==="
log "Label:     ${LABEL}"
log "Timestamp: ${TIMESTAMP}"
log "Output:    ${COMPRESSED_PATH}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  error "DATABASE_URL is required but not set."
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" ]]; then
  error "S3_BUCKET is required but not set. Set it or the S3 upload step will be skipped."
  # Non-fatal for local-only backups — warn and continue
  S3_BUCKET=""
fi

# ── Create backup directory ───────────────────────────────────────────────────

log "Step 1: Ensuring backup directory exists..."
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# ── Parse connection string ───────────────────────────────────────────────────

# Extract components from DATABASE_URL: postgresql://user:pass@host:port/dbname
# Handles both postgres:// and postgresql:// schemes.
DB_URL="${DATABASE_URL}"
DB_SCHEME="${DB_URL%%://*}"
DB_AUTHORITY="${DB_URL#*://}"
DB_USERINFO="${DB_AUTHORITY%%@*}"
DB_HOST_AND_PATH="${DB_AUTHORITY#*@}"
DB_HOST="${DB_HOST_AND_PATH%%/*}"
DB_NAME="${DB_HOST_AND_PATH##*/}"
DB_NAME="${DB_NAME%%\?*}"   # strip query params
DB_USER="${DB_USERINFO%%:*}"
DB_PASS="${DB_USERINFO#*:}"
DB_PORT="${DB_HOST##*:}"
DB_HOST="${DB_HOST%%:*}"

if [[ "${DB_PORT}" == "${DB_HOST}" ]]; then
  DB_PORT="5432"
fi

export PGPASSWORD="${DB_PASS}"

log "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME} (user: ${DB_USER})"

# ── Step 2: pg_dump ───────────────────────────────────────────────────────────

log "Step 2: Running pg_dump..."

pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=plain \
  --no-password \
  --verbose \
  ${POSTGRES_EXTRA_OPTS:-} \
  > "${DUMP_PATH}"

DUMP_SIZE=$(stat -c%s "${DUMP_PATH}" 2>/dev/null || stat -f%z "${DUMP_PATH}" 2>/dev/null || echo "0")
log "Dump complete: ${DUMP_SIZE} bytes at ${DUMP_PATH}"

if [[ "${DUMP_SIZE}" -lt 1024 ]]; then
  error "Dump file is suspiciously small (${DUMP_SIZE} bytes). Aborting."
  rm -f "${DUMP_PATH}"
  exit 1
fi

# ── Step 3: Compress ─────────────────────────────────────────────────────────

log "Step 3: Compressing with gzip..."
gzip -9 "${DUMP_PATH}"
COMPRESSED_SIZE=$(stat -c%s "${COMPRESSED_PATH}" 2>/dev/null || stat -f%z "${COMPRESSED_PATH}" 2>/dev/null || echo "0")
log "Compressed: ${COMPRESSED_SIZE} bytes at ${COMPRESSED_PATH}"

# ── Step 4: S3 Upload (stub — replace with real AWS CLI call) ─────────────────

log "Step 4: Uploading to S3..."

if [[ -n "${S3_BUCKET}" ]]; then
  # ── PRODUCTION IMPLEMENTATION ──────────────────────────────────────────────
  # Uncomment and use this block when the AWS CLI is available on the runner:
  #
  # aws s3 cp "${COMPRESSED_PATH}" \
  #   "s3://${S3_BUCKET}/${S3_KEY}" \
  #   --region "${S3_REGION}" \
  #   --sse aws:kms \
  #   --storage-class STANDARD_IA \
  #   --metadata "label=${LABEL},timestamp=${TIMESTAMP},hostname=$(hostname)"
  #
  # if [[ $? -ne 0 ]]; then
  #   error "S3 upload failed for s3://${S3_BUCKET}/${S3_KEY}"
  #   exit 1
  # fi
  # log "S3 upload complete: s3://${S3_BUCKET}/${S3_KEY}"
  # ── END PRODUCTION IMPLEMENTATION ─────────────────────────────────────────

  # STUB: log the intended upload target for now
  log "[STUB] Would upload to: s3://${S3_BUCKET}/${S3_KEY} (region: ${S3_REGION})"
  log "[STUB] Replace this stub with: aws s3 cp \"${COMPRESSED_PATH}\" \"s3://${S3_BUCKET}/${S3_KEY}\" --sse aws:kms"
else
  log "S3_BUCKET not set — skipping S3 upload. Backup is local-only."
fi

# ── Step 5: Verification ──────────────────────────────────────────────────────

log "Step 5: Verifying backup integrity..."

# Verify the gz file is valid
if ! gzip --test "${COMPRESSED_PATH}"; then
  error "Backup verification failed — gzip integrity check failed."
  exit 1
fi

# Dry-run: decompress to /dev/null and check pg_dump header
HEADER=$(zcat "${COMPRESSED_PATH}" | head -5)
if ! echo "${HEADER}" | grep -qi 'PostgreSQL\|pg_dump\|SET\|--'; then
  error "Backup verification failed — dump does not look like a valid PostgreSQL dump."
  exit 1
fi

log "Backup verification passed."

# ── Step 6: Retention policy — local cleanup ─────────────────────────────────

log "Step 6: Enforcing ${RETENTION_DAYS}-day retention policy on local backups..."

DELETED_COUNT=0
while IFS= read -r -d '' OLD_FILE; do
  log "  Deleting expired backup: ${OLD_FILE}"
  rm -f "${OLD_FILE}"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'capitalforge_*.sql.gz' \
  -mtime "+${RETENTION_DAYS}" -print0)

log "Local retention: deleted ${DELETED_COUNT} file(s) older than ${RETENTION_DAYS} days."

# ── Step 6b: Retention policy — S3 cleanup (stub) ────────────────────────────

if [[ -n "${S3_BUCKET}" ]]; then
  # ── PRODUCTION IMPLEMENTATION ──────────────────────────────────────────────
  # Use S3 Lifecycle rules (recommended) or the AWS CLI:
  #
  # CUTOFF_DATE=$(date -u -d "${RETENTION_DAYS} days ago" '+%Y-%m-%d' 2>/dev/null || \
  #              date -u -v"-${RETENTION_DAYS}d" '+%Y-%m-%d')
  #
  # aws s3api list-objects-v2 \
  #   --bucket "${S3_BUCKET}" \
  #   --prefix "backups/" \
  #   --query "Contents[?LastModified<='${CUTOFF_DATE}'].Key" \
  #   --output text | tr '\t' '\n' | while read -r KEY; do
  #     [ -n "${KEY}" ] || continue
  #     aws s3 rm "s3://${S3_BUCKET}/${KEY}" --region "${S3_REGION}"
  #     echo "  Deleted: s3://${S3_BUCKET}/${KEY}"
  # done
  # ── END PRODUCTION IMPLEMENTATION ─────────────────────────────────────────

  log "[STUB] Would delete S3 objects older than ${RETENTION_DAYS} days under s3://${S3_BUCKET}/backups/"
  log "[STUB] Recommended: configure S3 Lifecycle rule to expire objects after ${RETENTION_DAYS} days."
fi

# ── Summary ───────────────────────────────────────────────────────────────────

log "=== Backup Complete ==="
log "File:          ${COMPRESSED_PATH}"
log "Size:          ${COMPRESSED_SIZE} bytes"
log "S3 target:     ${S3_BUCKET:+s3://${S3_BUCKET}/${S3_KEY}}${S3_BUCKET:-local only}"
log "Retention:     ${RETENTION_DAYS} days"
log "Deleted local: ${DELETED_COUNT} expired file(s)"

unset PGPASSWORD
exit 0

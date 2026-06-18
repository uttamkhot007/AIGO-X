#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — Backup Script
# ═══════════════════════════════════════════════════════════════════════════════
# Dumps Postgres (pg_dump) + Redis RDB snapshot, compresses both into a
# timestamped tar.gz, and optionally uploads to S3 / Azure Blob / GCS.
#
# Usage:
#   scripts/backup.sh                    # full backup (Postgres + Redis)
#   BACKUP_REDIS=false scripts/backup.sh # Postgres only
#   BACKUP_TAG=weekly scripts/backup.sh  # weekly retention tag
#   scripts/backup.sh --verify-last      # verify last archive is readable
#
# Required env (sourced from .env automatically if present):
#   DATABASE_URL or POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
#   REDIS_PASSWORD (optional, needed for auth)
#
# Optional cloud upload env:
#   BACKUP_STORAGE=s3|azure|gcs|local
#   AWS_S3_BUCKET, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_CONTAINER,
#   GCS_BUCKET, BACKUP_STORAGE_PATH (for local)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load .env if available ──────────────────────────────────────────────────────
[[ -f "$REPO_ROOT/.env" ]] && set -a && source "$REPO_ROOT/.env" && set +a

# ── Configuration ───────────────────────────────────────────────────────────────
BACKUP_TAG="${BACKUP_TAG:-daily}"
BACKUP_REDIS="${BACKUP_REDIS:-true}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_NAME="dufense-${BACKUP_TAG}-${TIMESTAMP}"
BACKUP_STORAGE="${BACKUP_STORAGE:-local}"
LOCAL_BACKUP_DIR="${BACKUP_STORAGE_PATH:-$REPO_ROOT/backups/${BACKUP_TAG}}"
WORK_DIR="/tmp/dufense-backup-$$"

# Postgres connection
PG_USER="${POSTGRES_USER:-grc_user}"
PG_DB="${POSTGRES_DB:-dufense_grc}"
PG_PASSWORD="${POSTGRES_PASSWORD:-}"
PG_HOST="localhost"
PG_PORT="5432"

# Parse DATABASE_URL if set (overrides individual vars)
if [[ -n "${DATABASE_URL:-}" ]]; then
  # postgresql://user:pass@host:port/dbname
  PG_USER="$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')"
  PG_PASSWORD="$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
  PG_HOST="$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+)[:/].*|\1|')"
  PG_PORT="$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')"
  PG_DB="$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')"
fi

log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [INFO]  $*"; }
warn() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [WARN]  $*" >&2; }
err()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [ERROR] $*" >&2; exit 1; }

# ── Verify last backup ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "--verify-last" ]]; then
  latest="$(ls -t "$LOCAL_BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)"
  [[ -z "$latest" ]] && err "No backup archives found in $LOCAL_BACKUP_DIR"
  log "Verifying archive: $latest"
  tar -tzf "$latest" > /dev/null && log "Archive OK: $latest" || err "Archive CORRUPT: $latest"
  exit 0
fi

# ── Setup work directory ────────────────────────────────────────────────────────
mkdir -p "$WORK_DIR" "$LOCAL_BACKUP_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

log "Starting backup: $BACKUP_NAME"

# ── Postgres dump (via docker exec — no host port required) ──────────────────────
# pg_dump runs inside the postgres container so DATABASE_URL host resolution
# (e.g. 'postgres:5432') is handled by Docker's internal DNS, not the host.
PG_CONTAINER="${PG_CONTAINER:-dufense_db}"
log "Dumping Postgres database: $PG_DB (container: $PG_CONTAINER)"

docker exec -i "$PG_CONTAINER" \
  pg_dump -U "$PG_USER" \
    --format=custom \
    --compress=9 \
    --no-acl \
    --no-owner \
    "$PG_DB" \
  > "$WORK_DIR/postgres.dump" \
  || err "pg_dump failed — is container '$PG_CONTAINER' running? Check: docker ps"
log "Postgres dump: $(du -sh "$WORK_DIR/postgres.dump" | cut -f1)"

# ── Redis snapshot ──────────────────────────────────────────────────────────────
if [[ "$BACKUP_REDIS" == "true" ]]; then
  # All redis-cli commands run via docker exec inside the Redis container so no
  # host port publication is required — matches the Compose networking model.
  REDIS_CONTAINER="${REDIS_CONTAINER:-dufense_redis}"
  REDIS_PASSWORD_ARG=""
  [[ -n "${REDIS_PASSWORD:-}" ]] && REDIS_PASSWORD_ARG="--pass $REDIS_PASSWORD"

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${REDIS_CONTAINER}$"; then
    warn "Redis container '$REDIS_CONTAINER' is not running — skipping Redis backup"
  else
    log "Triggering Redis BGSAVE (container: $REDIS_CONTAINER)..."

    # Trigger background save
    docker exec -i "$REDIS_CONTAINER" \
      redis-cli $REDIS_PASSWORD_ARG BGSAVE &>/dev/null \
      || warn "BGSAVE command failed inside container — will copy whatever RDB exists"

    # Wait for BGSAVE to complete (up to 30 s)
    local_attempt=0
    while true; do
      save_in_progress="$(docker exec -i "$REDIS_CONTAINER" \
        redis-cli $REDIS_PASSWORD_ARG INFO persistence 2>/dev/null \
        | grep 'rdb_bgsave_in_progress:1' || true)"
      [[ -z "$save_in_progress" ]] && break
      local_attempt=$((local_attempt + 1))
      [[ $local_attempt -ge 15 ]] && { warn "Redis BGSAVE timed out; copying current RDB"; break; }
      sleep 2
    done

    # Copy the RDB file from the container filesystem (no host port needed)
    if docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "$WORK_DIR/redis.rdb" 2>/dev/null; then
      log "Redis RDB: $(du -sh "$WORK_DIR/redis.rdb" | cut -f1)"
    else
      warn "Could not copy Redis RDB from container — skipping Redis backup"
    fi
  fi
fi

# ── Write metadata ──────────────────────────────────────────────────────────────
cat > "$WORK_DIR/backup-metadata.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$TIMESTAMP",
  "tag": "$BACKUP_TAG",
  "postgres_db": "$PG_DB",
  "postgres_host": "$PG_HOST",
  "redis_included": $BACKUP_REDIS,
  "dufense_version": "${APP_VERSION:-unknown}"
}
EOF

# ── Create archive ──────────────────────────────────────────────────────────────
ARCHIVE="$LOCAL_BACKUP_DIR/${BACKUP_NAME}.tar.gz"
log "Compressing to $ARCHIVE..."
tar -czf "$ARCHIVE" -C "$WORK_DIR" .
log "Archive: $(du -sh "$ARCHIVE" | cut -f1)"

# ── Upload to cloud storage ─────────────────────────────────────────────────────
case "$BACKUP_STORAGE" in
  s3)
    log "Uploading to S3: s3://${AWS_S3_BUCKET}/${BACKUP_TAG}/${BACKUP_NAME}.tar.gz"
    aws s3 cp "$ARCHIVE" "s3://${AWS_S3_BUCKET}/${BACKUP_TAG}/${BACKUP_NAME}.tar.gz" \
      --storage-class STANDARD_IA \
      || err "S3 upload failed"
    log "S3 upload complete"
    ;;
  azure)
    log "Uploading to Azure Blob: ${AZURE_STORAGE_CONTAINER}/${BACKUP_TAG}/${BACKUP_NAME}.tar.gz"
    az storage blob upload \
      --account-name "$AZURE_STORAGE_ACCOUNT" \
      --container-name "$AZURE_STORAGE_CONTAINER" \
      --name "${BACKUP_TAG}/${BACKUP_NAME}.tar.gz" \
      --file "$ARCHIVE" \
      --auth-mode login \
      || err "Azure Blob upload failed"
    log "Azure Blob upload complete"
    ;;
  gcs)
    log "Uploading to GCS: gs://${GCS_BUCKET}/${BACKUP_TAG}/${BACKUP_NAME}.tar.gz"
    gsutil -q cp "$ARCHIVE" "gs://${GCS_BUCKET}/${BACKUP_TAG}/${BACKUP_NAME}.tar.gz" \
      || err "GCS upload failed"
    log "GCS upload complete"
    ;;
  local|*)
    log "Backup stored locally: $ARCHIVE"
    ;;
esac

log "Backup complete: $BACKUP_NAME"

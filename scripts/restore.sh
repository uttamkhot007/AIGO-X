#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — Restore Script
# ═══════════════════════════════════════════════════════════════════════════════
# Restores a Postgres dump and/or Redis RDB from a backup archive produced by
# scripts/backup.sh.
#
# Usage:
#   scripts/restore.sh <archive.tar.gz>          # restore Postgres + Redis
#   scripts/restore.sh <archive.tar.gz> --db-only
#   scripts/restore.sh <archive.tar.gz> --redis-only
#
# IMPORTANT: This will REPLACE the current database.
# Stop all application services before restoring:
#   docker compose -f deploy/docker-compose.microservices.yml stop
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

[[ -f "$REPO_ROOT/.env" ]] && set -a && source "$REPO_ROOT/.env" && set +a

log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [INFO]  $*"; }
warn() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [WARN]  $*" >&2; }
err()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [ERROR] $*" >&2; exit 1; }

ARCHIVE="${1:-}"
DB_ONLY=false
REDIS_ONLY=false

[[ -z "$ARCHIVE" ]] && { echo "Usage: $0 <archive.tar.gz> [--db-only|--redis-only]"; exit 1; }
[[ -f "$ARCHIVE" ]] || err "Archive not found: $ARCHIVE"

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only)    DB_ONLY=true; shift ;;
    --redis-only) REDIS_ONLY=true; shift ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

# ── Confirm ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ⚠  This will REPLACE the current database contents."
echo "  Archive: $ARCHIVE"
echo ""
read -rp "  Type 'yes' to confirm: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

# ── Postgres connection ──────────────────────────────────────────────────────────
PG_USER="${POSTGRES_USER:-grc_user}"
PG_DB="${POSTGRES_DB:-dufense_grc}"
PG_PASSWORD="${POSTGRES_PASSWORD:-}"
PG_HOST="localhost"
PG_PORT="5432"

if [[ -n "${DATABASE_URL:-}" ]]; then
  PG_USER="$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')"
  PG_PASSWORD="$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
  PG_HOST="$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+)[:/].*|\1|')"
  PG_PORT="$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')"
  PG_DB="$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')"
fi

# ── Extract archive ─────────────────────────────────────────────────────────────
WORK_DIR="/tmp/dufense-restore-$$"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

log "Extracting archive: $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

# ── Show metadata ────────────────────────────────────────────────────────────────
if [[ -f "$WORK_DIR/backup-metadata.json" ]]; then
  log "Backup metadata:"
  cat "$WORK_DIR/backup-metadata.json"
fi

# ── Restore Postgres (via docker exec — no host port required) ───────────────────
# All psql/pg_restore commands run inside the postgres container so Docker's
# internal DNS resolves service names correctly, matching the backup approach.
PG_CONTAINER="${PG_CONTAINER:-dufense_db}"

if [[ "$REDIS_ONLY" != "true" ]]; then
  DUMP_FILE="$WORK_DIR/postgres.dump"
  [[ -f "$DUMP_FILE" ]] || err "postgres.dump not found in archive"

  log "Restoring Postgres database: $PG_DB (container: $PG_CONTAINER)"

  # Terminate open connections, drop, and recreate
  docker exec -i "$PG_CONTAINER" \
    psql -U "$PG_USER" postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" \
    &>/dev/null || true

  docker exec -i "$PG_CONTAINER" \
    psql -U "$PG_USER" postgres \
    -c "DROP DATABASE IF EXISTS \"$PG_DB\";" \
    || err "Could not drop database — ensure no app services are connected"

  docker exec -i "$PG_CONTAINER" \
    psql -U "$PG_USER" postgres \
    -c "CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\";" \
    || err "Could not create database"

  # Restore from custom-format dump piped into the container
  docker exec -i "$PG_CONTAINER" \
    pg_restore -U "$PG_USER" -d "$PG_DB" \
    --no-acl --no-owner \
    < "$DUMP_FILE" \
    || warn "pg_restore completed with non-fatal warnings (e.g. pre-existing objects)"

  log "Postgres restore complete"
fi

# ── Restore Redis ────────────────────────────────────────────────────────────────
if [[ "$DB_ONLY" != "true" ]] && [[ -f "$WORK_DIR/redis.rdb" ]]; then
  REDIS_CONTAINER="${REDIS_CONTAINER:-dufense_redis}"
  log "Restoring Redis RDB to container: $REDIS_CONTAINER"

  # Flush via docker exec — Redis is not published to a host port.
  REDIS_PASSWORD_ARG=""
  [[ -n "${REDIS_PASSWORD:-}" ]] && REDIS_PASSWORD_ARG="--pass $REDIS_PASSWORD"
  docker exec -i "$REDIS_CONTAINER" \
    redis-cli $REDIS_PASSWORD_ARG FLUSHALL &>/dev/null || true

  # Stop Redis, replace dump.rdb (fastest safe restore method), restart
  docker stop "$REDIS_CONTAINER" 2>/dev/null || true
  docker cp "$WORK_DIR/redis.rdb" "${REDIS_CONTAINER}:/data/dump.rdb" \
    || err "Could not copy RDB into container — is '$REDIS_CONTAINER' stopped?"
  docker start "$REDIS_CONTAINER"

  log "Redis restore complete — container restarted"
elif [[ "$DB_ONLY" != "true" ]]; then
  warn "No redis.rdb found in archive — skipping Redis restore"
fi

echo ""
log "Restore complete from: $ARCHIVE"
log "Restart application services to bring the platform back online:"
log "  docker compose -f deploy/docker-compose.microservices.yml up -d"

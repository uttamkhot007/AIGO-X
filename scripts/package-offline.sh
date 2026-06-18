#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — Air-Gap Offline Bundle Packager
# ═══════════════════════════════════════════════════════════════════════════════
# Bundles ALL Docker images, Helm charts, DB migration files, and deploy scripts
# into a single self-contained tar.gz for transfer to an isolated (air-gapped)
# network.
#
# Usage:
#   scripts/package-offline.sh                       # full bundle
#   scripts/package-offline.sh --output /mnt/usb     # custom output dir
#   scripts/package-offline.sh --version 1.2.0        # specific app version
#   scripts/package-offline.sh --mode microservices   # only microservices images
#
# Requirements:
#   - Docker (images must be built or pulled first)
#   - tar, gzip
#   - At least 20GB free disk space (varies by image sizes)
#
# Output:
#   dufense-offline-<version>-<timestamp>.tar.gz
#   dufense-offline-<version>-<timestamp>.sha256
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [INFO]  $*"; }
warn() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [WARN]  $*" >&2; }
err()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [ERROR] $*" >&2; exit 1; }

# ── Argument parsing ─────────────────────────────────────────────────────────────
OUTPUT_DIR="$REPO_ROOT"
APP_VERSION="${APP_VERSION:-1.0.0}"
MODE="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)  OUTPUT_DIR="$2"; shift 2 ;;
    --version) APP_VERSION="$2"; shift 2 ;;
    --mode)    MODE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--output DIR] [--version VERSION] [--mode all|microservices|single|hybrid]"
      exit 0 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BUNDLE_NAME="dufense-offline-${APP_VERSION}-${TIMESTAMP}"
WORK_DIR="/tmp/dufense-offline-$$"
IMAGES_DIR="$WORK_DIR/images"
BUNDLE_ROOT="$WORK_DIR/$BUNDLE_NAME"

mkdir -p "$IMAGES_DIR" "$BUNDLE_ROOT"
trap 'rm -rf "$WORK_DIR"' EXIT

# ── Image lists ──────────────────────────────────────────────────────────────────
BASE_IMAGES=(
  "postgres:16-alpine"
  "redis:7-alpine"
  "nginx:alpine"
)

APP_IMAGES=(
  "dufense/auth-service:${APP_VERSION}"
  "dufense/risk-service:${APP_VERSION}"
  "dufense/compliance-service:${APP_VERSION}"
  "dufense/governance-service:${APP_VERSION}"
  "dufense/privacy-service:${APP_VERSION}"
  "dufense/evidence-service:${APP_VERSION}"
  "dufense/secops-service:${APP_VERSION}"
  "dufense/ai-service:${APP_VERSION}"
  "dufense/trust-service:${APP_VERSION}"
  "dufense/integration-service:${APP_VERSION}"
  "dufense/gateway:${APP_VERSION}"
  "dufense/grc-platform:${APP_VERSION}"
)

# Hybrid mode only bundles core on-prem services
HYBRID_APP_IMAGES=(
  "dufense/auth-service:${APP_VERSION}"
  "dufense/risk-service:${APP_VERSION}"
  "dufense/compliance-service:${APP_VERSION}"
  "dufense/governance-service:${APP_VERSION}"
  "dufense/privacy-service:${APP_VERSION}"
  "dufense/evidence-service:${APP_VERSION}"
  "dufense/secops-service:${APP_VERSION}"
  "dufense/trust-service:${APP_VERSION}"
  "dufense/gateway:${APP_VERSION}"
  "dufense/grc-platform:${APP_VERSION}"
)

case "$MODE" in
  hybrid)       IMAGES_TO_SAVE=("${BASE_IMAGES[@]}" "${HYBRID_APP_IMAGES[@]}") ;;
  single)       IMAGES_TO_SAVE=("${BASE_IMAGES[@]}" "dufense/api-server:${APP_VERSION}" "dufense/grc-platform:${APP_VERSION}") ;;
  microservices|all|*)  IMAGES_TO_SAVE=("${BASE_IMAGES[@]}" "${APP_IMAGES[@]}") ;;
esac

# ── Prerequisites ────────────────────────────────────────────────────────────────
log "Checking prerequisites..."
for cmd in docker tar gzip; do
  command -v "$cmd" &>/dev/null || err "$cmd is required but not installed"
done
# jq is used to generate the manifest; install or fall back gracefully
if ! command -v jq &>/dev/null; then
  warn "jq not found — manifest images array will use a simplified format"
  HAS_JQ=false
else
  HAS_JQ=true
fi
log "Prerequisites OK"

log "Packaging offline bundle: $BUNDLE_NAME (mode: $MODE)"
log "Images to save: ${#IMAGES_TO_SAVE[@]}"

# ── Save Docker images ───────────────────────────────────────────────────────────
log "Saving Docker images (this may take several minutes)..."
ALL_IMAGES="${IMAGES_TO_SAVE[*]}"
docker save $ALL_IMAGES | gzip > "$IMAGES_DIR/dufense-images.tar.gz" \
  || err "docker save failed — ensure all images are built/pulled locally"
log "Docker images saved: $(du -sh "$IMAGES_DIR/dufense-images.tar.gz" | cut -f1)"

# ── Copy deployment artefacts ────────────────────────────────────────────────────
log "Copying deployment files..."
mkdir -p "$BUNDLE_ROOT/deploy" "$BUNDLE_ROOT/nginx" "$BUNDLE_ROOT/scripts" "$BUNDLE_ROOT/backups"

# Docker Compose files
cp "$REPO_ROOT/deploy/docker-compose.microservices.yml" "$BUNDLE_ROOT/deploy/"
cp "$REPO_ROOT/deploy/docker-compose.hybrid.yml"        "$BUNDLE_ROOT/deploy/"
cp "$REPO_ROOT/deploy/docker-compose.single.yml"        "$BUNDLE_ROOT/deploy/"
# Copy every file in deploy/ that is not a compose file (Dockerfiles, aux confs, etc.)
# This ensures bind-mounted files like nginx.microservices.conf travel with the bundle.
for f in "$REPO_ROOT/deploy/"*; do
  [[ -f "$f" ]] && cp "$f" "$BUNDLE_ROOT/deploy/"
done

# Nginx configs
cp "$REPO_ROOT/nginx/"*.conf "$BUNDLE_ROOT/nginx/"

# Scripts
cp "$REPO_ROOT/scripts/setup.sh"         "$BUNDLE_ROOT/scripts/"
cp "$REPO_ROOT/scripts/backup.sh"        "$BUNDLE_ROOT/scripts/"
cp "$REPO_ROOT/scripts/restore.sh"       "$BUNDLE_ROOT/scripts/"
cp "$REPO_ROOT/scripts/load-offline.sh"  "$BUNDLE_ROOT/scripts/"
chmod +x "$BUNDLE_ROOT/scripts/"*.sh

# Helm charts (if present)
if [[ -d "$REPO_ROOT/helm" ]]; then
  cp -r "$REPO_ROOT/helm" "$BUNDLE_ROOT/"
  log "Helm charts included"
fi

# DB migrations — canonical location is lib/db/migrations/ (SQL files applied by setup.sh)
if [[ -d "$REPO_ROOT/lib/db/migrations" ]]; then
  mkdir -p "$BUNDLE_ROOT/lib/db"
  cp -r "$REPO_ROOT/lib/db/migrations" "$BUNDLE_ROOT/lib/db/"
  log "DB migrations included ($(ls "$REPO_ROOT/lib/db/migrations/"*.sql 2>/dev/null | wc -l | tr -d ' ') files)"
fi

# Backup cron example
cp "$REPO_ROOT/backups/cron.example" "$BUNDLE_ROOT/backups/"

# ── Preflight: verify all bind-mounted files exist inside the bundle ─────────────
# Prevents "file not found" failures on isolated hosts caused by missing compose
# bind-mount sources. Checks every bundled compose file for relative host paths.
log "Preflight: verifying compose bind-mount completeness..."
PREFLIGHT_ERRORS=0
for compose_file in "$BUNDLE_ROOT/deploy/"*.yml; do
  while IFS= read -r line; do
    # Match lines like "- ./foo:/bar" or "- ../foo:/bar"
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(\./|\.\./)([^:]+): ]]; then
      rel_path="${BASH_REMATCH[1]}${BASH_REMATCH[2]}"
      abs_path="$(cd "$BUNDLE_ROOT/deploy" && realpath -m "$rel_path" 2>/dev/null || echo "")"
      if [[ -n "$abs_path" ]] && [[ ! -e "$abs_path" ]]; then
        warn "MISSING bundle asset (referenced by $(basename "$compose_file")): $rel_path -> $abs_path"
        PREFLIGHT_ERRORS=$((PREFLIGHT_ERRORS + 1))
      fi
    fi
  done < "$compose_file"
done
if [[ $PREFLIGHT_ERRORS -gt 0 ]]; then
  err "Bundle preflight failed: $PREFLIGHT_ERRORS missing bind-mount source(s). Fix package-offline.sh to include them."
fi
log "Preflight OK — all compose bind-mount sources present in bundle"

# ── Write manifest ───────────────────────────────────────────────────────────────
if [[ "$HAS_JQ" == "true" ]]; then
  IMAGES_JSON="$(printf '%s\n' "${IMAGES_TO_SAVE[@]}" | jq -R . | jq -s .)"
else
  # jq unavailable — build JSON array manually
  IMAGES_JSON="[$(printf '"%s",' "${IMAGES_TO_SAVE[@]}" | sed 's/,$//')]"
fi

cat > "$BUNDLE_ROOT/manifest.json" <<EOF
{
  "bundle_name": "$BUNDLE_NAME",
  "created_at": "$TIMESTAMP",
  "app_version": "$APP_VERSION",
  "mode": "$MODE",
  "images": $IMAGES_JSON,
  "image_archive": "images/dufense-images.tar.gz"
}
EOF

# ── Write quick-start README ─────────────────────────────────────────────────────
cat > "$BUNDLE_ROOT/README.txt" <<EOF
DuFense AIGO-X GRC Platform — Offline Bundle
=============================================
Version: $APP_VERSION   Created: $TIMESTAMP   Mode: $MODE

INSTALLATION
------------
1. Transfer BOTH files to the air-gapped server into the SAME directory:
     ${BUNDLE_NAME}.tar.gz
     ${BUNDLE_NAME}.sha256
2. Run the loader (it verifies the checksum then runs setup):
     bash scripts/load-offline.sh ${BUNDLE_NAME}.tar.gz
3. Follow the on-screen setup wizard

VERIFY CHECKSUM ONLY (optional pre-check)
-----------------------------------------
bash scripts/load-offline.sh --verify ${BUNDLE_NAME}.tar.gz

MANUAL STEPS (if load-offline.sh is not used)
----------------------------------------------
a) Verify: cd <bundle-dir> && sha256sum --check ${BUNDLE_NAME}.sha256
b) Extract: tar -xzf ${BUNDLE_NAME}.tar.gz
c) Load images: docker load < images/dufense-images.tar.gz
d) Run setup:   bash scripts/setup.sh --skip-pull
e) Start:       docker compose -f deploy/docker-compose.microservices.yml up -d

BACKUPS
-------
Schedule: crontab -e < backups/cron.example
Run now:  bash scripts/backup.sh
Restore:  bash scripts/restore.sh <archive.tar.gz>
EOF

# ── Move images into bundle ──────────────────────────────────────────────────────
cp -r "$IMAGES_DIR" "$BUNDLE_ROOT/"

# ── Create final archive ─────────────────────────────────────────────────────────
FINAL_ARCHIVE="$OUTPUT_DIR/${BUNDLE_NAME}.tar.gz"
log "Creating final bundle: $FINAL_ARCHIVE"
tar -czf "$FINAL_ARCHIVE" -C "$WORK_DIR" "$BUNDLE_NAME"

# ── Generate checksum (portable — basename only, verified from same directory) ────
# sha256sum writes "<hash>  <filename>". By cd-ing into OUTPUT_DIR and hashing
# the bare filename, --check works regardless of where the bundle was transferred.
CHECKSUM_FILE="$OUTPUT_DIR/${BUNDLE_NAME}.sha256"
(
  cd "$OUTPUT_DIR"
  if command -v sha256sum &>/dev/null; then
    sha256sum "${BUNDLE_NAME}.tar.gz" > "${BUNDLE_NAME}.sha256"
  else
    shasum -a 256 "${BUNDLE_NAME}.tar.gz" > "${BUNDLE_NAME}.sha256"
  fi
)

log "Bundle: $FINAL_ARCHIVE  ($(du -sh "$FINAL_ARCHIVE" | cut -f1))"
log "SHA256: $CHECKSUM_FILE"
log ""
log "Transfer BOTH files to the air-gapped server (same directory), then run:"
log "  bash scripts/load-offline.sh ${BUNDLE_NAME}.tar.gz"

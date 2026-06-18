#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — Air-Gap Offline Bundle Loader
# ═══════════════════════════════════════════════════════════════════════════════
# Loads an offline bundle produced by scripts/package-offline.sh onto an
# air-gapped (no-internet) target machine and starts the platform.
#
# Usage:
#   bash load-offline.sh <bundle.tar.gz>              # full load + setup
#   bash load-offline.sh <bundle.tar.gz> --images-only # load images, no setup
#   bash load-offline.sh --verify <bundle.tar.gz>      # verify checksum only
#
# Requirements:
#   - Docker (daemon running)
#   - docker compose (plugin or standalone)
#   - tar, gzip, sha256sum or shasum
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

log()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [INFO]  $*"; }
warn() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [WARN]  $*" >&2; }
err()  { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [ERROR] $*" >&2; exit 1; }

header() {
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║   DuFense AIGO-X GRC — Air-Gap Loader                   ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
}

# ── Argument parsing ─────────────────────────────────────────────────────────────
BUNDLE=""
IMAGES_ONLY=false
VERIFY_ONLY=false
INSTALL_DIR="${INSTALL_DIR:-/opt/dufense}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --images-only) IMAGES_ONLY=true; shift ;;
    --verify)      VERIFY_ONLY=true; BUNDLE="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 <bundle.tar.gz> [--images-only] [--install-dir DIR]"
      echo "       $0 --verify <bundle.tar.gz>"
      exit 0 ;;
    *)
      [[ -z "$BUNDLE" ]] && BUNDLE="$1" || warn "Ignoring unknown arg: $1"
      shift ;;
  esac
done

[[ -z "$BUNDLE" ]] && { echo "Usage: $0 <bundle.tar.gz>"; exit 1; }
[[ -f "$BUNDLE" ]] || err "Bundle not found: $BUNDLE"

header

# ── Verify checksum ──────────────────────────────────────────────────────────────
# The .sha256 file contains only the basename (written by package-offline.sh via
# `cd OUTPUT_DIR && sha256sum BASENAME`).  We must verify from the same directory
# so the embedded filename resolves correctly — works regardless of where the
# bundle was transferred.
BUNDLE_ABS="$(cd "$(dirname "$BUNDLE")" && pwd)/$(basename "$BUNDLE")"
BUNDLE_DIR="$(dirname "$BUNDLE_ABS")"
BUNDLE_BASE="$(basename "$BUNDLE_ABS")"
CHECKSUM_FILE="$BUNDLE_DIR/${BUNDLE_BASE%.tar.gz}.sha256"

if [[ -f "$CHECKSUM_FILE" ]]; then
  log "Verifying bundle checksum..."
  (
    cd "$BUNDLE_DIR"
    if sha256sum --check "${BUNDLE_BASE%.tar.gz}.sha256" &>/dev/null \
       || shasum -a 256 --check "${BUNDLE_BASE%.tar.gz}.sha256" &>/dev/null; then
      log "Checksum OK"
    else
      echo "Checksum MISMATCH — bundle may be corrupt or tampered." >&2
      exit 1
    fi
  ) || err "Checksum verification failed. Aborting."
else
  warn "No .sha256 file found alongside bundle — skipping checksum verification"
  warn "Transfer ${BUNDLE_BASE%.tar.gz}.sha256 with the bundle for integrity checks"
fi

[[ "$VERIFY_ONLY" == "true" ]] && { log "Verification complete."; exit 0; }

# ── Prerequisites ────────────────────────────────────────────────────────────────
log "Checking prerequisites..."
command -v docker &>/dev/null || err "Docker is not installed"
docker info &>/dev/null        || err "Docker daemon is not running"

COMPOSE=""
if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  err "Docker Compose is required. Install Docker Desktop or the Compose plugin."
fi
log "Docker + Compose: OK"

# ── Extract bundle ────────────────────────────────────────────────────────────────
WORK_DIR="/tmp/dufense-load-$$"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

log "Extracting bundle: $BUNDLE"
tar -xzf "$BUNDLE" -C "$WORK_DIR"

# Find the bundle root directory inside the archive
BUNDLE_ROOT="$(ls -d "$WORK_DIR"/dufense-offline-* 2>/dev/null | head -1)"
[[ -d "$BUNDLE_ROOT" ]] || err "Invalid bundle structure — expected dufense-offline-* directory"

# Parse manifest — extract APP_VERSION and MODE so Compose uses the right image tags
# and setup.sh does not fall back to the default 1.0.0 in an offline environment.
if [[ -f "$BUNDLE_ROOT/manifest.json" ]]; then
  log "Bundle manifest:"
  cat "$BUNDLE_ROOT/manifest.json"

  # Extract app_version from manifest (works with or without jq)
  MANIFEST_VERSION=""
  if command -v jq &>/dev/null; then
    MANIFEST_VERSION="$(jq -r '.app_version // empty' "$BUNDLE_ROOT/manifest.json" 2>/dev/null || true)"
  else
    MANIFEST_VERSION="$(grep -o '"app_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$BUNDLE_ROOT/manifest.json" \
      | sed 's/.*"app_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)"
  fi

  if [[ -n "$MANIFEST_VERSION" ]]; then
    export APP_VERSION="$MANIFEST_VERSION"
    log "APP_VERSION set from manifest: $APP_VERSION"
  else
    warn "Could not parse app_version from manifest; APP_VERSION may default to 1.0.0"
  fi

  # Also surface the packaged mode as a hint (operator may override via --mode)
  MANIFEST_MODE=""
  if command -v jq &>/dev/null; then
    MANIFEST_MODE="$(jq -r '.mode // empty' "$BUNDLE_ROOT/manifest.json" 2>/dev/null || true)"
  else
    MANIFEST_MODE="$(grep -o '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$BUNDLE_ROOT/manifest.json" \
      | sed 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)"
  fi
  [[ -n "$MANIFEST_MODE" ]] && log "Packaged mode: $MANIFEST_MODE"
fi

# ── Load Docker images ────────────────────────────────────────────────────────────
IMAGE_ARCHIVE="$BUNDLE_ROOT/images/dufense-images.tar.gz"
[[ -f "$IMAGE_ARCHIVE" ]] || err "Image archive not found in bundle: images/dufense-images.tar.gz"

log "Loading Docker images (this may take several minutes)..."
docker load < <(gzip -dc "$IMAGE_ARCHIVE") 2>&1 | while IFS= read -r line; do
  log "  $line"
done
log "Docker images loaded"

[[ "$IMAGES_ONLY" == "true" ]] && { log "Images loaded. Setup skipped (--images-only)."; exit 0; }

# ── Install files ─────────────────────────────────────────────────────────────────
log "Installing DuFense to: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Copy all bundle contents (except the images archive — already loaded)
rsync -a --exclude 'images/' "$BUNDLE_ROOT/" "$INSTALL_DIR/" 2>/dev/null \
  || cp -r "$BUNDLE_ROOT"/. "$INSTALL_DIR/"

chmod +x "$INSTALL_DIR/scripts/"*.sh

log "Files installed to $INSTALL_DIR"

# ── Run setup ─────────────────────────────────────────────────────────────────────
echo ""
echo "  All images loaded and files installed."
echo "  Now running the interactive setup wizard..."
echo ""

cd "$INSTALL_DIR"
# --skip-pull : images already loaded by docker load above; no internet access
# --skip-migrate is NOT passed here — migrations run via docker exec (no internet needed)
bash scripts/setup.sh --skip-pull

log ""
log "Air-gap load complete. DuFense is running in offline mode."
log "No internet access is required for operation."

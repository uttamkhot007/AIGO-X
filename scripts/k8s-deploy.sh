#!/usr/bin/env bash
# ── AIGO-X GRC Platform — Kubernetes Deploy Script ────────────────────────────
# Usage:
#   ./scripts/k8s-deploy.sh --env dev
#   ./scripts/k8s-deploy.sh --env staging --version 1.2.3
#   ./scripts/k8s-deploy.sh --env prod    --version 1.2.3 --dry-run
#
# Requirements:
#   - helm >= 3.13   (brew install helm)
#   - kubectl configured for target cluster
#   - Environment variables set (see below per env)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/helm/aigo-x"
RELEASE_NAME="aigo-x"
NAMESPACE="aigo-x"
ENV=""
VERSION=""
DRY_RUN=false
EXTRA_ARGS=()

# ── Parse arguments ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"; shift 2 ;;
    --version|-v)
      VERSION="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=true; shift ;;
    --namespace|-n)
      NAMESPACE="$2"; shift 2 ;;
    --release)
      RELEASE_NAME="$2"; shift 2 ;;
    *)
      EXTRA_ARGS+=("$1"); shift ;;
  esac
done

# ── Validate ───────────────────────────────────────────────────────────────────
if [[ -z "$ENV" ]]; then
  echo "ERROR: --env is required (dev | staging | prod)"
  exit 1
fi

case "$ENV" in
  dev|staging|prod) ;;
  *)
    echo "ERROR: --env must be one of: dev, staging, prod (got: $ENV)"
    exit 1 ;;
esac

VALUES_FILE="$CHART_DIR/values.${ENV}.yaml"
if [[ ! -f "$VALUES_FILE" ]]; then
  echo "ERROR: Values file not found: $VALUES_FILE"
  exit 1
fi

# ── Build dependencies ─────────────────────────────────────────────────────────
echo "==> Building Helm dependencies..."
helm dependency build "$CHART_DIR"

# ── Assemble helm command ──────────────────────────────────────────────────────
HELM_CMD=(
  helm upgrade --install "$RELEASE_NAME" "$CHART_DIR"
  --namespace "$NAMESPACE"
  --create-namespace
  --values "$VALUES_FILE"
  --wait
  --timeout 10m
)

if [[ -n "$VERSION" ]]; then
  HELM_CMD+=(
    --set "gateway.image.tag=$VERSION"
    --set "auth-service.image.tag=$VERSION"
    --set "risk-service.image.tag=$VERSION"
    --set "compliance-service.image.tag=$VERSION"
    --set "governance-service.image.tag=$VERSION"
    --set "privacy-service.image.tag=$VERSION"
    --set "evidence-service.image.tag=$VERSION"
    --set "secops-service.image.tag=$VERSION"
    --set "ai-service.image.tag=$VERSION"
    --set "trust-service.image.tag=$VERSION"
    --set "integration-service.image.tag=$VERSION"
    --set "web.image.tag=$VERSION"
  )
fi

# ── Inject secrets from env vars (prod) ───────────────────────────────────────
# For prod, secrets must be supplied via env vars (not stored in values files).
if [[ "$ENV" == "prod" ]]; then
  : "${DATABASE_URL:?DATABASE_URL env var is required for prod}"
  : "${JWT_SECRET:?JWT_SECRET env var is required for prod}"
  : "${REDIS_PASSWORD:?REDIS_PASSWORD env var is required for prod}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD env var is required for prod}"

  HELM_CMD+=(
    --set "secrets.create=true"
    --set "secrets.databaseUrl=$DATABASE_URL"
    --set "secrets.jwtSecret=$JWT_SECRET"
    --set "secrets.redisPassword=$REDIS_PASSWORD"
    --set "secrets.postgresPassword=$POSTGRES_PASSWORD"
    --set "secrets.tokenEncryptionKey=${TOKEN_ENCRYPTION_KEY:-}"
    --set "secrets.openaiApiKey=${OPENAI_API_KEY:-}"
    --set "gateway.ingress.host=${AIGO_X_HOST:?AIGO_X_HOST is required for prod}"
    --set "web.ingress.host=${AIGO_X_HOST}"
  )
fi

# Add any extra --set args passed to the script
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  HELM_CMD+=("${EXTRA_ARGS[@]}")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  HELM_CMD+=(--dry-run)
fi

# ── Execute ────────────────────────────────────────────────────────────────────
echo "==> Deploying aigo-x to '$ENV' (namespace: $NAMESPACE)"
if [[ -n "$VERSION" ]]; then
  echo "    Version: $VERSION"
fi
if [[ "$DRY_RUN" == "true" ]]; then
  echo "    Mode: DRY RUN"
fi
echo ""
# Log the command with secrets redacted — never print --set secrets.* values
SAFE_CMD=()
REDACT_NEXT=false
for arg in "${HELM_CMD[@]}"; do
  if $REDACT_NEXT; then
    SAFE_CMD+=("[REDACTED]")
    REDACT_NEXT=false
    continue
  fi
  case "$arg" in
    --set)
      SAFE_CMD+=("$arg")
      REDACT_NEXT=false   # handled below with value inspection
      ;;
    --set=secrets.*|--set\ secrets.*)
      SAFE_CMD+=("[REDACTED]")
      ;;
    secrets.databaseUrl=*|secrets.jwtSecret=*|secrets.redisPassword=*|\
    secrets.postgresPassword=*|secrets.tokenEncryptionKey=*|secrets.openaiApiKey=*)
      SAFE_CMD+=("[REDACTED]")
      ;;
    *)
      SAFE_CMD+=("$arg")
      ;;
  esac
done
echo "Running: ${SAFE_CMD[*]}"
echo ""

"${HELM_CMD[@]}"

echo ""
echo "==> Deploy complete."
echo ""
echo "Check rollout status:"
echo "  kubectl rollout status deployment --namespace $NAMESPACE"
echo ""
echo "Check pods:"
echo "  kubectl get pods --namespace $NAMESPACE"

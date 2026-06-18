#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# AIGO-X GRC — GCP GKE Autopilot deployment script
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
HELM_DIR="$(cd "$SCRIPT_DIR/../helm" && pwd)"

ENV="${DEPLOY_ENV:-prod}"
VERSION="${IMAGE_TAG:-latest}"
GCP_PROJECT="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
GCP_REGION="${GCP_REGION:-us-central1}"
PLAN_ONLY=false
DESTROY=false
HELM_ONLY=false

usage() {
  cat <<EOF
AIGO-X GCP GKE Autopilot Deploy Script

Usage: $0 [OPTIONS]

Options:
  --env           dev|staging|prod  (default: prod)
  --version       Image tag to deploy (default: latest)
  --project       GCP project ID (required)
  --region        GCP region (default: us-central1)
  --plan          Terraform plan only (no apply)
  --helm-only     Build+push images and upgrade Helm release, skip Terraform
  --destroy       Destroy all infrastructure (DANGER)
  -h, --help      Show this help

Required env: GCP_PROJECT_ID

Example:
  GCP_PROJECT_ID=my-project IMAGE_TAG=1.2.3 ./gcp/deploy.sh \\
    --env prod --project my-project --version 1.2.3
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)       ENV="$2";        shift 2 ;;
    --version)   VERSION="$2";    shift 2 ;;
    --project)   GCP_PROJECT="$2"; shift 2 ;;
    --region)    GCP_REGION="$2"; shift 2 ;;
    --plan)      PLAN_ONLY=true;  shift ;;
    --helm-only) HELM_ONLY=true;  shift ;;
    --destroy)   DESTROY=true;    shift ;;
    -h|--help)   usage ;;
    *)           echo "Unknown option: $1"; usage ;;
  esac
done

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
warn() { echo "[$(date '+%H:%M:%S')] WARN: $*" >&2; }
die()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

command -v gcloud    >/dev/null 2>&1 || die "gcloud not found"
command -v terraform >/dev/null 2>&1 || die "terraform not found (>= 1.5)"
command -v helm      >/dev/null 2>&1 || die "helm not found (>= 3.12)"
command -v kubectl   >/dev/null 2>&1 || die "kubectl not found"
command -v docker    >/dev/null 2>&1 || die "docker not found"

log "Deploying AIGO-X to GKE Autopilot (project=$GCP_PROJECT, env=$ENV, version=$VERSION)"

NAME_PREFIX="aigo-x-$ENV"
AR_LOCATION="$GCP_REGION"
AR_REGISTRY="$AR_LOCATION-docker.pkg.dev/$GCP_PROJECT/$NAME_PREFIX"

# ── Service list: left=directory name (image path), right=Helm chart key ──────
# Helm keys match Chart.yaml dependency names exactly.
SERVICES=(
  "gateway:gateway"
  "auth:auth-service"
  "risk:risk-service"
  "compliance:compliance-service"
  "governance:governance-service"
  "privacy:privacy-service"
  "evidence:evidence-service"
  "secops:secops-service"
  "ai:ai-service"
  "trust:trust-service"
  "integration:integration-service"
  "web:web"
)

# Build --set-string overrides for EVERY service's image tag + repository.
build_image_tag_sets() {
  local version="$1"
  local registry="$2"
  local sets=""
  for pair in "${SERVICES[@]}"; do
    local svc_dir="${pair%%:*}"
    local helm_key="${pair##*:}"
    sets+=" --set-string ${helm_key}.image.tag=${version}"
    sets+=" --set-string ${helm_key}.image.repository=${registry}/${svc_dir}"
  done
  echo "$sets"
}

_helm_upgrade() {
  local cluster_name="$1"
  local sql_private_ip="$2"   # from TF output: cloudsql_private_ip (private VPC IP)
  local redis_host="$3"       # from TF output: memorystore_host
  local wi_sa_email="$4"
  local registry="$5"

  local image_sets
  image_sets="$(build_image_tag_sets "$VERSION" "$registry")"

  # ── Build DATABASE_URL from managed secrets ───────────────────────────────
  # service-kit (packages/service-kit/src/db.ts) throws if DATABASE_URL is absent.
  # Cloud SQL Auth Proxy sidecar listens on 127.0.0.1:5432 inside each pod.
  # Fetch the password from Secret Manager, construct the URL, persist it as a
  # new secret version, and inject it via Helm so every service gets DATABASE_URL.
  local db_user="${GCP_DB_USERNAME:-grc_admin}"
  local db_name="${GCP_DB_NAME:-dufense_grc}"
  local db_pass_secret="${NAME_PREFIX}-db-password"
  log "Fetching DB password from Secret Manager: $db_pass_secret"
  local db_pass
  db_pass="$(gcloud secrets versions access latest \
    --secret="$db_pass_secret" --project="$GCP_PROJECT" 2>/dev/null || echo "")"
  if [[ -z "$db_pass" ]]; then
    warn "Secret '$db_pass_secret' not found or has no versions."
    warn "Set it: echo -n '<PASS>' | gcloud secrets versions add $db_pass_secret --data-file=- --project=$GCP_PROJECT"
    db_pass="CHANGEME"
  fi
  # Connect directly to Cloud SQL private IP (VPC-peered private access).
  # sslmode=require — Cloud SQL enforces TLS on all connections by default.
  local database_url="postgresql://${db_user}:${db_pass}@${sql_private_ip}:5432/${db_name}?sslmode=require"
  # Persist to Secret Manager so future pods can access it natively
  local db_url_secret="${NAME_PREFIX}-database-url"
  if gcloud secrets describe "$db_url_secret" --project="$GCP_PROJECT" &>/dev/null; then
    printf '%s' "$database_url" | gcloud secrets versions add "$db_url_secret" \
      --data-file=- --project="$GCP_PROJECT" \
      && log "Updated Secret Manager: $db_url_secret" || warn "Could not update $db_url_secret"
  else
    gcloud secrets create "$db_url_secret" --project="$GCP_PROJECT" --replication-policy=automatic \
      && printf '%s' "$database_url" | gcloud secrets versions add "$db_url_secret" \
           --data-file=- --project="$GCP_PROJECT" \
      && log "Created Secret Manager: $db_url_secret" || warn "Could not create $db_url_secret"
  fi

  # ── Ensure operator IP can reach GKE control plane ──────────────────────
  # Default TF config allows 0.0.0.0/0; in hardened environments the caller
  # can override by setting TF_VAR_gke_master_authorized_cidr before apply.
  # As an extra safety measure we detect the operator's egress IP and add it
  # so even non-default restrictive configs allow this deploy session.
  local op_ip
  op_ip="$(curl -sf https://checkip.amazonaws.com/ || curl -sf https://api4.my-ip.io/ip || echo "")"
  if [[ -n "$op_ip" ]]; then
    log "Ensuring operator IP ${op_ip}/32 is in GKE master authorized networks..."
    gcloud container clusters update "$cluster_name" \
      --region "$GCP_REGION" --project "$GCP_PROJECT" \
      --enable-master-authorized-networks \
      --master-authorized-networks "${op_ip}/32" \
      --quiet 2>/dev/null || warn "Could not update master authorized networks — proceeding anyway"
  fi

  log "Getting GKE credentials..."
  gcloud container clusters get-credentials "$cluster_name" \
    --region "$GCP_REGION" --project "$GCP_PROJECT"

  log "Applying GKE Gateway + HTTPRoute config..."
  GATEWAY_YAML="$TF_DIR/modules/load-balancing/gateway-config.yaml"
  kubectl create namespace aigo-x --dry-run=client -o yaml | kubectl apply -f -
  if [[ -f "$GATEWAY_YAML" ]]; then
    kubectl apply -f "$GATEWAY_YAML" \
      && log "Gateway config applied" \
      || warn "Gateway config apply failed — check GKE Gateway API is enabled on the cluster"
  else
    warn "gateway-config.yaml not found at $GATEWAY_YAML — run terraform apply first"
  fi

  # ── Create aigo-x-secrets K8s Secret from Secret Manager values ──────────
  # values.gcp.yaml sets secrets.create: false so Helm does NOT own this object.
  # We fetch every required secret from Secret Manager via Workload Identity and
  # create (or update) the K8s Secret directly — keeping sensitive material out
  # of Helm values and command-line --set flags.
  log "Provisioning aigo-x-secrets K8s Secret from Secret Manager..."
  _sm_get() {
    gcloud secrets versions access latest \
      --secret="$1" --project="$GCP_PROJECT" 2>/dev/null || echo "CHANGEME"
  }

  local k8s_jwt_secret; k8s_jwt_secret="$(_sm_get "${NAME_PREFIX}-jwt-secret")"
  local k8s_token_key;  k8s_token_key="$(_sm_get "${NAME_PREFIX}-token-encryption-key")"
  local k8s_openai_key; k8s_openai_key="$(_sm_get "${NAME_PREFIX}-openai-api-key")"
  local k8s_redis_auth; k8s_redis_auth="$(_sm_get "${NAME_PREFIX}-redis-auth")"

  # Construct REDIS_URL from the GCP-generated auth_string (now stored in SM).
  # Chart ConfigMap uses global.redisUrl (full URL) not separate host/port keys.
  # Memorystore uses SERVER_AUTHENTICATION (TLS), connect with rediss:// scheme.
  local redis_url="rediss://:${k8s_redis_auth}@${redis_host}:6379"

  kubectl create secret generic aigo-x-secrets \
    --from-literal=DATABASE_URL="$database_url" \
    --from-literal=JWT_SECRET="$k8s_jwt_secret" \
    --from-literal=REDIS_PASSWORD="$k8s_redis_auth" \
    --from-literal=TOKEN_ENCRYPTION_KEY="$k8s_token_key" \
    --from-literal=OPENAI_API_KEY="$k8s_openai_key" \
    --namespace aigo-x \
    --dry-run=client -o yaml | kubectl apply -f - \
    && log "aigo-x-secrets applied" \
    || warn "Could not apply aigo-x-secrets — check RBAC permissions"

  log "Deploying AIGO-X Helm chart (env=$ENV, version=$VERSION)..."
  # global.redisUrl  — full Redis URL consumed by chart ConfigMap (global.redisUrl key)
  # global.secretName — K8s Secret name consumed by chart Deployment envFrom.secretRef
  # shellcheck disable=SC2086
  helm upgrade --install aigo-x "$HELM_DIR/aigo-x" \
    -f "$HELM_DIR/aigo-x/values.prod.yaml" \
    -f "$HELM_DIR/aigo-x/values.gcp.yaml" \
    --set "global.imageRegistry=${registry}" \
    --set-string "global.imageTag=${VERSION}" \
    --set-string "global.redisUrl=${redis_url}" \
    --set-string "global.secretName=aigo-x-secrets" \
    --set        "secrets.create=false" \
    $image_sets \
    --namespace aigo-x --create-namespace \
    --wait --timeout 15m

  log "Helm deploy complete."
}

if [[ "$HELM_ONLY" == "true" ]]; then
  GKE_CLUSTER="${GKE_CLUSTER_NAME:?GKE_CLUSTER_NAME is required for --helm-only}"
  # Matches TF output: cloudsql_private_ip (VPC private IP; no proxy required)
  CLOUDSQL_IP="${GCP_CLOUDSQL_PRIVATE_IP:?GCP_CLOUDSQL_PRIVATE_IP is required}"
  REDIS_HOST="${GCP_REDIS_HOST:?GCP_REDIS_HOST (memorystore_host) is required}"
  WI_SA_EMAIL="${GCP_WI_SA_EMAIL:?GCP_WI_SA_EMAIL is required}"

  log "Configuring Docker for Artifact Registry..."
  gcloud auth configure-docker "$AR_LOCATION-docker.pkg.dev" --quiet

  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  for pair in "${SERVICES[@]}"; do
    svc_dir="${pair%%:*}"
    IMAGE="$AR_REGISTRY/${svc_dir}:$VERSION"
    if [[ "$svc_dir" == "gateway" ]]; then
      DF="$PROJECT_ROOT/gateway/Dockerfile"
    elif [[ "$svc_dir" == "web" ]]; then
      DF="$PROJECT_ROOT/deploy/Dockerfile.web"
    else
      DF="$PROJECT_ROOT/services/${svc_dir}-service/Dockerfile"
    fi
    docker build -t "$IMAGE" -f "$DF" "$PROJECT_ROOT"
    docker push "$IMAGE"
    log "Pushed $svc_dir"
  done

  _helm_upgrade "$GKE_CLUSTER" "$CLOUDSQL_IP" "$REDIS_HOST" "$WI_SA_EMAIL" "$AR_REGISTRY"
  exit 0
fi

# ── Terraform ─────────────────────────────────────────────────────────────────
cd "$TF_DIR"

log "Initialising Terraform..."
terraform init -upgrade

if [[ "$DESTROY" == "true" ]]; then
  terraform destroy \
    -var="gcp_project_id=$GCP_PROJECT" \
    -var="gcp_region=$GCP_REGION" \
    -var="environment=$ENV" \
    -auto-approve
  exit 0
fi

log "Planning Terraform changes..."
terraform plan \
  -var="gcp_project_id=$GCP_PROJECT" \
  -var="gcp_region=$GCP_REGION" \
  -var="environment=$ENV" \
  -var="image_tag=$VERSION" \
  -out="tfplan-$ENV.out"

if [[ "$PLAN_ONLY" == "true" ]]; then
  log "Plan complete (--plan mode, not applying)."
  exit 0
fi

log "Applying Terraform..."
terraform apply "tfplan-$ENV.out"

# ── Collect Terraform outputs (names match outputs.tf exactly) ────────────────
GKE_CLUSTER="$(terraform output -raw gke_cluster_name)"
CLOUDSQL_IP="$(terraform output -raw cloudsql_private_ip)"      # VPC private IP — no proxy needed
REDIS_HOST="$(terraform output -raw memorystore_host)"          # TF output: memorystore_host
WI_SA_EMAIL="$(terraform output -raw workload_identity_sa)"
LB_IP="$(terraform output -raw load_balancer_ip)"
AR_URL="$(terraform output -raw artifact_registry_url)"         # = AR_REGISTRY from TF

log "GKE:         $GKE_CLUSTER"
log "Cloud SQL:   $CLOUDSQL_IP (private IP)"
log "Redis:       $REDIS_HOST"
log "LB IP:       $LB_IP"
log "Workload SA: $WI_SA_EMAIL"
log "Registry:    $AR_URL"

# ── Build + push all 12 service images ───────────────────────────────────────
log "Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "$AR_LOCATION-docker.pkg.dev" --quiet

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
for pair in "${SERVICES[@]}"; do
  svc_dir="${pair%%:*}"
  IMAGE="$AR_URL/${svc_dir}:$VERSION"
  if [[ "$svc_dir" == "gateway" ]]; then
    DF="$PROJECT_ROOT/gateway/Dockerfile"
  elif [[ "$svc_dir" == "web" ]]; then
    DF="$PROJECT_ROOT/deploy/Dockerfile.web"
  else
    DF="$PROJECT_ROOT/services/${svc_dir}-service/Dockerfile"
  fi
  docker build -t "$IMAGE" -f "$DF" "$PROJECT_ROOT"
  docker push "$IMAGE"
  log "Pushed $svc_dir"
done

# ── Helm deploy (GKE Gateway apply + all image tag overrides + managed infra) ─
_helm_upgrade "$GKE_CLUSTER" "$CLOUDSQL_IP" "$REDIS_HOST" "$WI_SA_EMAIL" "$AR_URL"

log ""
log "==> Deploy complete!"
log "    Load Balancer IP: $LB_IP"
log "    GKE cluster:      $GKE_CLUSTER"
log ""
log "Point DNS A record → $LB_IP"
log ""
log "Update secrets in Secret Manager:"
log "  echo -n '<VALUE>' | gcloud secrets versions add ${NAME_PREFIX}-jwt-secret \\"
log "    --data-file=- --project=$GCP_PROJECT"

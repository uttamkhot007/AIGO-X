#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# AIGO-X GRC — Azure AKS deployment script
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
HELM_DIR="$(cd "$SCRIPT_DIR/../helm" && pwd)"

ENV="${DEPLOY_ENV:-prod}"
VERSION="${IMAGE_TAG:-latest}"
LOCATION="${AZURE_LOCATION:-eastus}"
PLAN_ONLY=false
DESTROY=false
HELM_ONLY=false

usage() {
  cat <<EOF
AIGO-X Azure AKS Deploy Script

Usage: $0 [OPTIONS]

Options:
  --env           dev|staging|prod  (default: prod)
  --version       Image tag to deploy (default: latest)
  --location      Azure region (default: eastus)
  --plan          Terraform plan only (no apply)
  --helm-only     Build+push images and upgrade Helm release, skip Terraform
  --destroy       Destroy all infrastructure (DANGER)
  -h, --help      Show this help

Prerequisites: az login, terraform >= 1.5, helm >= 3.12, kubectl, docker

Example:
  IMAGE_TAG=1.2.3 DEPLOY_ENV=prod ./azure/deploy.sh --env prod --version 1.2.3
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)       ENV="$2";      shift 2 ;;
    --version)   VERSION="$2";  shift 2 ;;
    --location)  LOCATION="$2"; shift 2 ;;
    --plan)      PLAN_ONLY=true; shift ;;
    --helm-only) HELM_ONLY=true; shift ;;
    --destroy)   DESTROY=true;  shift ;;
    -h|--help)   usage ;;
    *)           echo "Unknown option: $1"; usage ;;
  esac
done

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
warn() { echo "[$(date '+%H:%M:%S')] WARN: $*" >&2; }
die()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

command -v az        >/dev/null 2>&1 || die "az CLI not found"
command -v terraform >/dev/null 2>&1 || die "terraform not found (>= 1.5)"
command -v helm      >/dev/null 2>&1 || die "helm not found (>= 3.12)"
command -v kubectl   >/dev/null 2>&1 || die "kubectl not found"
command -v docker    >/dev/null 2>&1 || die "docker not found"

log "Deploying AIGO-X to Azure AKS (env=$ENV, version=$VERSION)"

# ── Service list: left=directory name used for Dockerfile/image, right=Helm key
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

# Build --set-string overrides that cover EVERY service's image tag + repository.
# Helm key uses the chart dependency name (e.g. auth-service); image path uses
# the directory name (e.g. auth) so it matches what was pushed to the registry.
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
  local acr_login_server="$1"   # e.g. aigoxprodacr.azurecr.io
  local rg_name="$2"
  local aks_name="$3"
  local postgres_fqdn="$4"
  local redis_hostname="$5"     # matches TF output: redis_hostname
  local kv_uri="$6"             # matches TF output: keyvault_uri

  local registry="${acr_login_server}/aigo-x"
  local image_sets
  image_sets="$(build_image_tag_sets "$VERSION" "$registry")"

  # ── Build DATABASE_URL from managed secrets ───────────────────────────────
  # service-kit (packages/service-kit/src/db.ts) throws if DATABASE_URL is absent.
  # Fetch the password from Key Vault, construct the URL, store it back in KV,
  # and pass it to Helm so every service gets the env var it needs.
  local kv_name
  kv_name="$(echo "$kv_uri" | sed 's|https://||' | cut -d. -f1)"
  local db_user="${AZURE_DB_USERNAME:-grc_admin}"
  local db_name="${AZURE_DB_NAME:-dufense_grc}"
  # Key Vault secret name matches what the Postgres module writes: "postgres-admin-password"
  local kv_db_secret="postgres-admin-password"
  log "Fetching DB password from Key Vault: $kv_name / $kv_db_secret"
  local db_pass
  db_pass="$(az keyvault secret show \
    --vault-name "$kv_name" --name "$kv_db_secret" \
    --query value -o tsv 2>/dev/null || echo "")"
  if [[ -z "$db_pass" ]]; then
    warn "Secret '$kv_db_secret' not found in Key Vault '$kv_name'."
    warn "Ensure the Postgres module has run and written the admin password to Key Vault."
    warn "Override: az keyvault secret set --vault-name $kv_name --name $kv_db_secret --value '<PASSWORD>'"
    db_pass="CHANGEME"
  fi
  local database_url="postgresql://${db_user}:${db_pass}@${postgres_fqdn}:5432/${db_name}?sslmode=require"
  # Persist to Key Vault so the CSI SecretProviderClass can sync it to K8s
  az keyvault secret set --vault-name "$kv_name" --name database-url \
    --value "$database_url" --output none \
    && log "Stored database-url in Key Vault" \
    || warn "Could not store database-url in Key Vault — continuing anyway"

  # ── Fetch Redis primary access key + build REDIS_URL ────────────────────
  # azurerm_redis_cache primary_access_key is needed for AUTH commands.
  # Fetch from az CLI and store in KV so CSI can sync it to the K8s Secret.
  # Chart ConfigMap uses global.redisUrl (full URL) not separate host/port keys.
  # Redis name matches Terraform: name_prefix + "-redis" = "aigo-x-${ENV}-redis"
  local redis_name="aigo-x-${ENV}-redis"
  local redis_pass
  redis_pass="$(az redis list-keys --name "$redis_name" --resource-group "$rg_name" \
    --query primaryKey -o tsv 2>/dev/null || echo "")"
  if [[ -z "$redis_pass" ]]; then
    warn "Could not fetch Redis primary key for '$redis_name'. Falling back to KV 'redis-password'."
    redis_pass="$(az keyvault secret show --vault-name "$kv_name" --name redis-password \
      --query value -o tsv 2>/dev/null || echo "CHANGEME")"
  else
    az keyvault secret set --vault-name "$kv_name" --name redis-password \
      --value "$redis_pass" --output none || warn "Could not store redis-password in KV"
  fi
  # rediss:// = TLS; Azure Cache for Redis uses port 6380 with SSL
  local redis_url="rediss://:${redis_pass}@${redis_hostname}:6380"

  # ── Fetch remaining KV secrets for K8s Secret bootstrap ─────────────────
  _kv_get() {
    az keyvault secret show --vault-name "$kv_name" --name "$1" \
      --query value -o tsv 2>/dev/null || echo "CHANGEME"
  }
  local kv_jwt;       kv_jwt="$(_kv_get jwt-secret)"
  local kv_token_key; kv_token_key="$(_kv_get token-encryption-key)"
  local kv_openai;    kv_openai="$(_kv_get openai-api-key)"

  log "Getting AKS credentials..."
  az aks get-credentials --resource-group "$rg_name" --name "$aks_name" --overwrite-existing

  # ── Install/upgrade AGIC (Application Gateway Ingress Controller) ──────────
  # Terraform creates the App Gateway named: aigo-x-${ENV}-appgw (name_prefix + "-appgw")
  local appgw_name="aigo-x-${ENV}-appgw"
  log "Looking up App Gateway: $appgw_name"
  local appgw_id
  appgw_id="$(az network application-gateway show \
    --name "$appgw_name" \
    --resource-group "$rg_name" \
    --query id --output tsv 2>/dev/null || echo "")"

  if [[ -n "$appgw_id" ]]; then
    log "Installing/upgrading AGIC..."
    helm repo add application-gateway-kubernetes-ingress \
      https://appgwingress.blob.core.windows.net/ingress-azure-helm-package/ \
      --force-update 2>/dev/null || true

    local subscription_id
    subscription_id="$(az account show --query id -o tsv)"

    # Use Workload Identity (not aadPodIdentity) — the UAMI is provisioned by
    # Terraform (azure/modules/aks) with Contributor on the App Gateway and a
    # federated credential bound to kube-system:ingress-azure SA.
    local agic_client_id
    agic_client_id="$(terraform -chdir="$TF_DIR" output -raw agic_identity_client_id 2>/dev/null || echo "")"

    helm upgrade --install agic application-gateway-kubernetes-ingress/ingress-azure \
      --namespace kube-system \
      --set appgw.subscriptionId="$subscription_id" \
      --set appgw.resourceGroup="$rg_name" \
      --set appgw.name="$appgw_name" \
      --set appgw.usePrivateIP=false \
      --set armAuth.type=workloadIdentity \
      --set armAuth.identityClientID="$agic_client_id" \
      --set rbac.enabled=true \
      --wait --timeout 5m || warn "AGIC install failed — check App Gateway permissions"
  else
    warn "App Gateway '$appgw_name' not found in '$rg_name'; skipping AGIC install."
    warn "Verify Terraform apply succeeded and the App Gateway module created the resource."
  fi

  # ── Create aigo-x-secrets K8s Secret from Key Vault values ─────────────
  # values.azure.yaml sets secrets.create: false so Helm does NOT own this object.
  # We bootstrap it directly; the CSI SecretProviderClass will refresh it at pod
  # mount time on subsequent restarts.
  log "Provisioning aigo-x-secrets K8s Secret from Key Vault..."
  kubectl create namespace aigo-x --dry-run=client -o yaml | kubectl apply -f -
  kubectl create secret generic aigo-x-secrets \
    --from-literal=DATABASE_URL="$database_url" \
    --from-literal=JWT_SECRET="$kv_jwt" \
    --from-literal=REDIS_PASSWORD="$redis_pass" \
    --from-literal=TOKEN_ENCRYPTION_KEY="$kv_token_key" \
    --from-literal=OPENAI_API_KEY="$kv_openai" \
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
    -f "$HELM_DIR/aigo-x/values.azure.yaml" \
    --set "global.imageRegistry=${registry}" \
    --set-string "global.imageTag=${VERSION}" \
    --set-string "global.redisUrl=${redis_url}" \
    --set-string "global.secretName=aigo-x-secrets" \
    --set        "secrets.create=false" \
    $image_sets \
    --namespace aigo-x --create-namespace \
    --wait --timeout 10m

  log "Helm deploy complete."
}

if [[ "$HELM_ONLY" == "true" ]]; then
  ACR_NAME="${AZURE_ACR_NAME:?AZURE_ACR_NAME is required for --helm-only}"
  RG_NAME="${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
  AKS_NAME="${AZURE_AKS_NAME:?AZURE_AKS_NAME is required}"
  POSTGRES_FQDN="${AZURE_POSTGRES_FQDN:?AZURE_POSTGRES_FQDN is required}"
  # Matches TF output name: redis_hostname
  REDIS_HOSTNAME="${AZURE_REDIS_HOSTNAME:?AZURE_REDIS_HOSTNAME is required}"

  log "Logging in to ACR: $ACR_NAME"
  az acr login --name "$ACR_NAME"

  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  for pair in "${SERVICES[@]}"; do
    svc_dir="${pair%%:*}"
    IMAGE="$ACR_NAME.azurecr.io/aigo-x/${svc_dir}:$VERSION"
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

  KV_URI="${AZURE_KEYVAULT_URI:?AZURE_KEYVAULT_URI is required for --helm-only}"
  _helm_upgrade "$ACR_NAME.azurecr.io" "$RG_NAME" "$AKS_NAME" "$POSTGRES_FQDN" "$REDIS_HOSTNAME" "$KV_URI"
  exit 0
fi

# ── Terraform ─────────────────────────────────────────────────────────────────
cd "$TF_DIR"

log "Initialising Terraform..."
terraform init -upgrade

if [[ "$DESTROY" == "true" ]]; then
  terraform destroy \
    -var="environment=$ENV" \
    -var="location=$LOCATION" \
    -auto-approve
  exit 0
fi

log "Planning Terraform changes..."
terraform plan \
  -var="environment=$ENV" \
  -var="location=$LOCATION" \
  -var="image_tag=$VERSION" \
  -out="tfplan-$ENV.out"

if [[ "$PLAN_ONLY" == "true" ]]; then
  log "Plan complete (--plan mode, not applying)."
  exit 0
fi

log "Applying Terraform..."
terraform apply "tfplan-$ENV.out"

# ── Collect Terraform outputs (names match outputs.tf exactly) ────────────────
ACR_LOGIN_SERVER="$(terraform output -raw acr_login_server)"          # e.g. foo.azurecr.io
ACR_NAME="${ACR_LOGIN_SERVER%%.*}"
RG_NAME="$(terraform output -raw resource_group_name)"
AKS_NAME="$(terraform output -raw aks_cluster_name)"
POSTGRES_FQDN="$(terraform output -raw postgres_fqdn)"
REDIS_HOSTNAME="$(terraform output -raw redis_hostname)"              # TF output: redis_hostname
KV_URI="$(terraform output -raw keyvault_uri)"
APPGW_IP="$(terraform output -raw app_gateway_public_ip)"

log "ACR:      $ACR_LOGIN_SERVER"
log "AKS:      $AKS_NAME"
log "Postgres: $POSTGRES_FQDN"
log "Redis:    $REDIS_HOSTNAME"

# ── Build + push all 12 service images ───────────────────────────────────────
log "Logging in to ACR: $ACR_NAME"
az acr login --name "$ACR_NAME"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
for pair in "${SERVICES[@]}"; do
  svc_dir="${pair%%:*}"
  IMAGE="$ACR_LOGIN_SERVER/aigo-x/${svc_dir}:$VERSION"
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

# ── Helm deploy (AGIC install + managed DB/Redis + DATABASE_URL + all image tag overrides) ───
_helm_upgrade "$ACR_LOGIN_SERVER" "$RG_NAME" "$AKS_NAME" "$POSTGRES_FQDN" "$REDIS_HOSTNAME" "$KV_URI"

log ""
log "==> Deploy complete!"
log "    App Gateway IP: $APPGW_IP"
log "    Key Vault URI:  $KV_URI"
log ""
log "Update Key Vault secrets (CHANGEME → real values):"
log "  az keyvault secret set --vault-name $ACR_NAME-kv --name jwt-secret --value '<VALUE>'"
log "  az keyvault secret set --vault-name $ACR_NAME-kv --name openai-api-key --value 'sk-...'"

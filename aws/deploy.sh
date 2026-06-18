#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# AIGO-X GRC — AWS ECS Fargate deployment script
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV="${DEPLOY_ENV:-prod}"
VERSION="${IMAGE_TAG:-latest}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PLAN_ONLY=false
DESTROY=false
SERVICES_ONLY=false

usage() {
  cat <<EOF
AIGO-X AWS ECS Deploy Script

Usage: $0 [OPTIONS]

Options:
  --env           dev|staging|prod  (default: prod)
  --version       Image tag to deploy (default: latest)
  --region        AWS region (default: us-east-1)
  --plan          Terraform plan only (no apply)
  --services-only Build+push images and update ECS services, skip Terraform
  --destroy       Destroy all infrastructure (DANGER)
  -h, --help      Show this help

Required environment variables:
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  (or AWS_PROFILE for SSO)

Example:
  IMAGE_TAG=1.2.3 DEPLOY_ENV=prod ./aws/deploy.sh --env prod --version 1.2.3
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)        ENV="$2";        shift 2 ;;
    --version)    VERSION="$2";    shift 2 ;;
    --region)     AWS_REGION="$2"; shift 2 ;;
    --plan)       PLAN_ONLY=true;  shift ;;
    --services-only) SERVICES_ONLY=true; shift ;;
    --destroy)    DESTROY=true;    shift ;;
    -h|--help)    usage ;;
    *)            echo "Unknown option: $1"; usage ;;
  esac
done

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
warn() { echo "[$(date '+%H:%M:%S')] WARN: $*" >&2; }
die()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

# ── Validate prerequisites ─────────────────────────────────────────────────────
command -v aws       >/dev/null 2>&1 || die "aws CLI not found"
command -v terraform >/dev/null 2>&1 || die "terraform not found (>= 1.5)"
command -v docker    >/dev/null 2>&1 || die "docker not found"

log "Deploying AIGO-X to AWS ECS (env=$ENV, version=$VERSION, region=$AWS_REGION)"

# ── Verify AWS credentials ────────────────────────────────────────────────────
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
log "AWS account: $ACCOUNT_ID"
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

SERVICES=(
  "gateway" "auth" "risk" "compliance" "governance"
  "privacy" "evidence" "secops" "ai" "trust" "integration" "web"
)

if [[ "$SERVICES_ONLY" == "true" ]]; then
  # ── Image build + push only ──────────────────────────────────────────────────
  log "Logging in to ECR..."
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$ECR_REGISTRY"

  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  for SVC in "${SERVICES[@]}"; do
    REPO="$ECR_REGISTRY/aigo-x-$ENV/$SVC"
    log "Building $SVC → $REPO:$VERSION"

    if [[ "$SVC" == "gateway" ]]; then
      DOCKERFILE="$PROJECT_ROOT/gateway/Dockerfile"
    elif [[ "$SVC" == "web" ]]; then
      DOCKERFILE="$PROJECT_ROOT/deploy/Dockerfile.web"
    else
      DOCKERFILE="$PROJECT_ROOT/services/${SVC}-service/Dockerfile"
    fi

    docker build -t "$REPO:$VERSION" -f "$DOCKERFILE" "$PROJECT_ROOT"
    docker push "$REPO:$VERSION"
    log "Pushed $SVC"
  done

  log "Updating ECS services..."
  CLUSTER="aigo-x-$ENV-cluster"
  for SVC in "${SERVICES[@]}"; do
    aws ecs update-service \
      --cluster "$CLUSTER" \
      --service "aigo-x-$ENV-$SVC" \
      --force-new-deployment \
      --region "$AWS_REGION" \
      --output text --query 'service.serviceName' | xargs -I{} log "Updated ECS service: {}"
  done

  log "Waiting for services to stabilise (this may take a few minutes)..."
  for SVC in "${SERVICES[@]}"; do
    aws ecs wait services-stable \
      --cluster "$CLUSTER" \
      --services "aigo-x-$ENV-$SVC" \
      --region "$AWS_REGION" && log "$SVC stable" || warn "$SVC wait timed out"
  done

  log "Services-only deploy complete."
  exit 0
fi

# ── Terraform infra ───────────────────────────────────────────────────────────
cd "$TF_DIR"

log "Initialising Terraform..."
terraform init -upgrade

if [[ "$DESTROY" == "true" ]]; then
  log "DESTROYING all infrastructure in $ENV..."
  terraform destroy \
    -var="environment=$ENV" \
    -var="aws_region=$AWS_REGION" \
    -var="image_tag=$VERSION" \
    -auto-approve
  exit 0
fi

log "Planning Terraform changes..."
terraform plan \
  -var="environment=$ENV" \
  -var="aws_region=$AWS_REGION" \
  -var="image_tag=$VERSION" \
  -out="tfplan-$ENV.out"

if [[ "$PLAN_ONLY" == "true" ]]; then
  log "Plan complete (--plan mode, not applying)."
  exit 0
fi

log "Applying Terraform..."
terraform apply "tfplan-$ENV.out"

# ── Build + push images ───────────────────────────────────────────────────────
log "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for SVC in "${SERVICES[@]}"; do
  REPO="$(terraform output -raw ecr_repository_urls 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$SVC',''))" 2>/dev/null || echo "$ECR_REGISTRY/aigo-x-$ENV/$SVC")"

  log "Building $SVC → $REPO:$VERSION"

  if [[ "$SVC" == "gateway" ]]; then
    DOCKERFILE="$PROJECT_ROOT/gateway/Dockerfile"
  elif [[ "$SVC" == "web" ]]; then
    DOCKERFILE="$PROJECT_ROOT/deploy/Dockerfile.web"
  else
    DOCKERFILE="$PROJECT_ROOT/services/${SVC}-service/Dockerfile"
  fi

  docker build -t "$REPO:$VERSION" -f "$DOCKERFILE" "$PROJECT_ROOT"
  docker push "$REPO:$VERSION"
  log "Pushed $SVC"
done

# ── Force ECS re-deploy ───────────────────────────────────────────────────────
log "Triggering ECS rolling deployments..."
CLUSTER="$(terraform output -raw ecs_cluster_name)"
for SVC in "${SERVICES[@]}"; do
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "aigo-x-$ENV-$SVC" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --output text --query 'service.serviceName' | xargs -I{} log "Triggered: {}"
done

log ""
log "==> Deploy complete!"
log "    ALB: $(terraform output -raw alb_dns_name)"
log ""
log "Monitor rollout:"
log "  aws ecs list-services --cluster $CLUSTER --region $AWS_REGION"

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — On-Premises One-Command Installer
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   cd /opt/dufense
#   bash scripts/setup.sh [--mode microservices|single|hybrid] [--non-interactive]
#
# Flags:
#   --mode <mode>       Deployment mode (microservices, single, hybrid)
#   --non-interactive   Use defaults + env vars; no prompts (CI/automation use)
#   --skip-pull         Skip docker pull (air-gap / pre-loaded images)
#   --skip-migrate      Skip DB migration (already run)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RESET="\033[0m"; BOLD="\033[1m"; DIM="\033[2m"
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; WHITE="\033[97m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy"

log()  { echo -e "  ${GREEN}✔${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}   $*"; }
err()  { echo -e "  ${RED}✖${RESET}  $*"; exit 1; }
ask()  { echo -en "  ${CYAN}?${RESET}  $* "; }
step() { echo -e "\n${BOLD}${WHITE}▶  $*${RESET}"; }

header() {
  echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║     DuFense AIGO-X GRC — On-Premises Setup Wizard        ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${RESET}\n"
}

# ── Argument parsing ────────────────────────────────────────────────────────────
MODE=""
NON_INTERACTIVE=false
SKIP_PULL=false
SKIP_MIGRATE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)           MODE="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    --skip-pull)      SKIP_PULL=true; shift ;;
    --skip-migrate)   SKIP_MIGRATE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--mode microservices|single|hybrid] [--non-interactive] [--skip-pull] [--skip-migrate]"
      exit 0 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

# ── Prerequisites ───────────────────────────────────────────────────────────────
check_prereqs() {
  step "Checking prerequisites"
  for cmd in docker openssl; do
    command -v "$cmd" &>/dev/null && log "$cmd found" || err "$cmd is required. Install it and re-run."
  done

  COMPOSE=""
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
    log "docker compose (plugin) found"
  elif command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
    log "docker-compose (standalone) found"
  else
    err "Docker Compose is required. Install Docker Desktop or the Compose plugin."
  fi

  # Docker daemon must be running
  docker info &>/dev/null || err "Docker daemon is not running. Start Docker and re-run."
  log "Docker daemon is running"
}

# ── Mode selection ──────────────────────────────────────────────────────────────
choose_mode() {
  if [[ -n "$MODE" ]]; then
    log "Mode set to: $MODE"
    return
  fi
  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    MODE="${DUFENSE_MODE:-microservices}"
    log "Non-interactive mode — using: $MODE"
    return
  fi

  step "Deployment mode"
  echo ""
  echo -e "  ${BOLD}1)${RESET} microservices   Full 10-service stack on-prem (recommended)"
  echo -e "  ${BOLD}2)${RESET} single          Single monolithic API + web (smallest footprint)"
  echo -e "  ${BOLD}3)${RESET} hybrid          Core on-prem, AI/integrations in cloud"
  echo ""
  ask "Enter choice [1]:"
  read -r choice
  case "${choice:-1}" in
    1) MODE="microservices" ;;
    2) MODE="single" ;;
    3) MODE="hybrid" ;;
    *) err "Invalid choice." ;;
  esac
  log "Mode: $MODE"
}

# ── Secrets generation ──────────────────────────────────────────────────────────
generate_secrets() {
  step "Generating secrets"
  POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  REDIS_PASSWORD="$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 24)"
  JWT_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
  TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 16)"
  SESSION_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
  log "Postgres password generated"
  log "Redis password generated"
  log "JWT secret generated"
  log "Token encryption key generated"
}

# ── Optional inputs ─────────────────────────────────────────────────────────────
collect_optional() {
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  ORG_NAME="${ORG_NAME:-My Organisation}"
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
  WEB_PORT="${WEB_PORT:-80}"
  APP_VERSION="${APP_VERSION:-1.0.0}"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    log "Non-interactive: using env defaults"
    return
  fi

  step "AI features (optional)"
  echo -e "  ${DIM}Leave blank to skip — add OPENAI_API_KEY to .env later.${RESET}"
  ask "OpenAI API key (sk-... or blank):"
  read -r key_input
  OPENAI_API_KEY="${key_input:-}"
  [[ -n "$OPENAI_API_KEY" ]] && log "OpenAI key set" || warn "AI features disabled"

  if [[ "$MODE" == "single" ]]; then
    step "Organisation details"
    ask "Organisation name [$ORG_NAME]:"
    read -r name_input
    ORG_NAME="${name_input:-$ORG_NAME}"
    ask "Admin email [$ADMIN_EMAIL]:"
    read -r email_input
    ADMIN_EMAIL="${email_input:-$ADMIN_EMAIL}"
  fi

  step "Network"
  ask "Web port (80 for HTTP, 443 for HTTPS) [$WEB_PORT]:"
  read -r port_input
  WEB_PORT="${port_input:-$WEB_PORT}"
}

# ── Connection variables (used by backup/restore helpers too) ────────────────────
PG_USER="grc_user"
PG_DB="dufense_grc"

# ── Write .env ──────────────────────────────────────────────────────────────────
write_env() {
  step "Writing .env"
  local env_file="$REPO_ROOT/.env"

  if [[ -f "$env_file" ]]; then
    local backup="$env_file.backup.$(date +%Y%m%d%H%M%S)"
    cp "$env_file" "$backup"
    warn "Existing .env backed up to $backup"
  fi

  cat > "$env_file" <<EOF
# DuFense AIGO-X GRC Platform — Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# !! Keep this file secret — never commit to version control !!

DEPLOYMENT_TYPE=onprem
DEPLOYMENT_MODE=${MODE}
APP_VERSION=${APP_VERSION}
NODE_ENV=production

# ── Database ────────────────────────────────────────────────────────────────────
POSTGRES_USER=grc_user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dufense_grc
DATABASE_URL=postgresql://grc_user:${POSTGRES_PASSWORD}@postgres:5432/dufense_grc

# ── Cache ───────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=${REDIS_PASSWORD}

# ── Security ────────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
SESSION_SECRET=${SESSION_SECRET}

# ── AI (optional) ───────────────────────────────────────────────────────────────
OPENAI_API_KEY=${OPENAI_API_KEY}

# ── Network ─────────────────────────────────────────────────────────────────────
WEB_PORT=${WEB_PORT}

# ── Single-tenant extras ─────────────────────────────────────────────────────────
ORG_NAME=${ORG_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}

# ── Hybrid-mode cloud endpoints ──────────────────────────────────────────────────
# Set these when MODE=hybrid to route AI/integration traffic to cloud services.
# AI_SERVICE_URL=https://ai.your-cloud.example.com
# INTEGRATION_SERVICE_URL=https://integrations.your-cloud.example.com
# CLOUD_SERVICE_TOKEN=
EOF

  chmod 600 "$env_file"
  log ".env written and permissions set to 600"
}

# ── Pull images ─────────────────────────────────────────────────────────────────
pull_images() {
  if [[ "$SKIP_PULL" == "true" ]]; then
    warn "Skipping image pull (--skip-pull)"
    return
  fi

  local compose_file
  compose_file="$(compose_file_for_mode)"

  step "Pulling base images (postgres, redis, nginx)"
  cd "$REPO_ROOT"
  $COMPOSE -f "$compose_file" pull postgres redis nginx 2>/dev/null || true
  log "Base images ready"
}

# ── Build application images ────────────────────────────────────────────────────
build_images() {
  if [[ "$SKIP_PULL" == "true" ]]; then
    # In air-gap / offline mode all images were already loaded by load-offline.sh;
    # there is no internet access and no source build context in the bundle.
    warn "Skipping image build (--skip-pull / offline mode — images pre-loaded)"
    return
  fi

  local compose_file
  compose_file="$(compose_file_for_mode)"

  step "Building application images"
  cd "$REPO_ROOT"
  $COMPOSE -f "$compose_file" build --parallel 2>&1 | tail -5 || err "Image build failed"
  log "Application images built"
}

# ── Start infrastructure ────────────────────────────────────────────────────────
start_infra() {
  local compose_file
  compose_file="$(compose_file_for_mode)"

  # Single mode has no Redis service in its compose file; only start postgres.
  # Microservices and hybrid both define a redis service.
  local infra_services="postgres redis"
  [[ "$MODE" == "single" ]] && infra_services="postgres"

  step "Starting infrastructure ($infra_services)"
  cd "$REPO_ROOT"
  # shellcheck disable=SC2086  # intentional word-splitting for service list
  $COMPOSE -f "$compose_file" up -d $infra_services
  log "Waiting for postgres to be healthy..."

  local retries=30
  until $COMPOSE -f "$compose_file" exec -T postgres \
    pg_isready -U grc_user -d dufense_grc &>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -le 0 ]] && err "Postgres did not become healthy in time"
    sleep 2
  done
  log "Postgres is ready"
}

# ── Run DB migrations ───────────────────────────────────────────────────────────
# Strategy: run drizzle-kit push (schema sync) directly inside the running
# postgres container, or via a service that ships drizzle-kit.
# We exec into the postgres container using the loaded credentials — this avoids
# requiring Postgres to be published to a host port.
run_migrations() {
  if [[ "$SKIP_MIGRATE" == "true" ]]; then
    warn "Skipping DB migration (--skip-migrate)"
    return
  fi

  local compose_file
  compose_file="$(compose_file_for_mode)"
  local pg_container="dufense_db"

  step "Running database migrations"
  cd "$REPO_ROOT"

  # Verify the postgres container is running and accepting connections
  if ! docker exec -i "$pg_container" pg_isready -U "$PG_USER" -d "$PG_DB" &>/dev/null; then
    err "Postgres container '$pg_container' is not ready. Cannot run migrations."
  fi

  # Apply SQL migration files from lib/db/migrations/ (canonical location).
  # Files are sorted numerically so they apply in schema order (0000_, 0001_, …).
  # All SQL is executed inside the postgres container via docker exec, so no
  # host port is required and Docker's internal DNS resolves 'postgres:5432'.
  local applied=0
  local failed=0
  local migrations_dir="$REPO_ROOT/lib/db/migrations"

  if [[ ! -d "$migrations_dir" ]]; then
    warn "Migration directory not found at $migrations_dir"
    warn "Run migrations manually: psql \$DATABASE_URL < lib/db/migrations/*.sql"
    return
  fi

  shopt -s nullglob
  local sql_files=("$migrations_dir"/*.sql)
  shopt -u nullglob

  if [[ ${#sql_files[@]} -eq 0 ]]; then
    warn "No .sql migration files found in $migrations_dir"
    return
  fi

  for sql_file in "${sql_files[@]}"; do
    local fname
    fname="$(basename "$sql_file")"
    log "  Applying migration: $fname"
    docker exec -i "$pg_container" \
      psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
      < "$sql_file" \
      && applied=$((applied + 1)) \
      || { warn "Migration FAILED: $fname"; failed=$((failed + 1)); }
  done

  if [[ $failed -gt 0 ]]; then
    err "DB migration failed ($failed file(s)). Fix and re-run with --skip-migrate after services are stopped."
  fi
  log "Migrations complete — $applied file(s) applied"
}

# ── Start all services ──────────────────────────────────────────────────────────
start_services() {
  local compose_file
  compose_file="$(compose_file_for_mode)"

  step "Starting all services"
  cd "$REPO_ROOT"
  $COMPOSE -f "$compose_file" up -d
  log "All services started"
}

# ── Health check ────────────────────────────────────────────────────────────────
# Gateway is not published to a host port in the default compose stacks, so we
# cannot curl localhost:8080. Instead we poll the container's own health status
# (set via healthcheck in the compose file) and fall back to a compose ps check.
wait_healthy() {
  local compose_file
  compose_file="$(compose_file_for_mode)"

  step "Waiting for services to become healthy"
  local retries=40
  while [[ $retries -gt 0 ]]; do
    retries=$((retries - 1))

    # Check if compose reports all containers as healthy/running (not restarting)
    local unhealthy
    unhealthy="$($COMPOSE -f "$compose_file" ps --format json 2>/dev/null \
      | grep -c '"Health":"unhealthy"\|"State":"restarting"' 2>/dev/null || echo "0")"

    # Check gateway container health directly via docker inspect
    local gw_health
    gw_health="$(docker inspect --format '{{.State.Health.Status}}' dufense_gateway 2>/dev/null || echo "unknown")"

    if [[ "$gw_health" == "healthy" ]] || [[ "$unhealthy" == "0" && "$gw_health" != "starting" ]]; then
      log "Gateway is healthy"
      return
    fi

    [[ $retries -le 0 ]] && { warn "Gateway did not become healthy in time — check: docker compose logs gateway"; return; }
    sleep 3
  done
}

# ── Helpers ─────────────────────────────────────────────────────────────────────
compose_file_for_mode() {
  case "$MODE" in
    single)        echo "$DEPLOY_DIR/docker-compose.single.yml" ;;
    hybrid)        echo "$DEPLOY_DIR/docker-compose.hybrid.yml" ;;
    microservices) echo "$DEPLOY_DIR/docker-compose.microservices.yml" ;;
    *)             echo "$DEPLOY_DIR/docker-compose.microservices.yml" ;;
  esac
}

# ── Summary ─────────────────────────────────────────────────────────────────────
print_summary() {
  echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║             Setup Complete!                              ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}\n"
  echo -e "  ${BOLD}Mode:${RESET}       $MODE"
  echo -e "  ${BOLD}Web port:${RESET}   $WEB_PORT"
  echo -e "  ${BOLD}AI:${RESET}         $( [[ -n "$OPENAI_API_KEY" ]] && echo "Enabled" || echo "Disabled (set OPENAI_API_KEY in .env)" )"
  echo ""
  echo -e "  ${BOLD}${CYAN}Next steps:${RESET}"
  echo -e "  ${DIM}1. Place TLS certs in nginx/ssl/ (fullchain.pem, privkey.pem)${RESET}"
  echo -e "  ${DIM}2. Open:${RESET} ${BOLD}https://your-server:${WEB_PORT}/grc-platform${RESET}"
  echo -e "  ${DIM}3. Log in with the admin credentials created during initial seeding${RESET}"
  echo -e "  ${DIM}4. Schedule backups: crontab -e < backups/cron.example${RESET}"
  echo ""
  warn "IMPORTANT: .env contains secrets — store it securely, never commit to git"
  echo ""
}

# ── Main ────────────────────────────────────────────────────────────────────────
main() {
  header
  check_prereqs
  choose_mode
  generate_secrets
  collect_optional
  write_env
  pull_images
  build_images
  start_infra
  run_migrations
  start_services
  wait_healthy
  print_summary
}

main

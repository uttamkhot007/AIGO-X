#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DuFense AIGO-X GRC Platform — On-Premises Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RESET="\033[0m"; BOLD="\033[1m"; DIM="\033[2m"
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; WHITE="\033[97m"
BLUE="\033[34m"; MAGENTA="\033[35m"

header() {
  echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║        DuFense AIGO-X GRC — On-Prem Setup Wizard         ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${RESET}\n"
}

step() { echo -e "\n${BOLD}${WHITE}▶  Step $1: $2${RESET}"; }
ok()   { echo -e "  ${GREEN}✔${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}   $1"; }
err()  { echo -e "  ${RED}✖${RESET}  $1"; exit 1; }
ask()  { echo -en "  ${CYAN}?${RESET}  $1 "; }

# ── Prerequisite check ─────────────────────────────────────────────────────────
check_prereqs() {
  step "0" "Checking prerequisites"
  for cmd in docker openssl; do
    if command -v "$cmd" &>/dev/null; then
      ok "$cmd found"
    else
      err "$cmd is required but not installed. Please install it and re-run."
    fi
  done
  DOCKER_COMPOSE_CMD=""
  if docker compose version &>/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
    ok "docker compose (plugin) found"
  elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    ok "docker-compose (standalone) found"
  else
    err "Docker Compose is required. Install Docker Desktop or the Compose plugin."
  fi
}

# ── Deployment type ────────────────────────────────────────────────────────────
choose_deployment_type() {
  step "1" "Deployment Target"
  echo -e "  ${DIM}Where will DuFense GRC Platform be deployed?${RESET}\n"
  echo -e "  ${BOLD}1)${RESET} ☁️   Cloud  (AWS, Azure, GCP, Replit Autoscale)"
  echo -e "  ${BOLD}2)${RESET} 🏢  On-Premises  (your own servers / data centre)"
  echo ""
  ask "Enter choice [1/2]:"
  read -r dt_choice
  case "$dt_choice" in
    1) DEPLOYMENT_TYPE="cloud"
       echo -e "\n  ${YELLOW}Cloud deployment — use Replit Autoscale or your cloud provider's container service.${RESET}"
       echo -e "  ${DIM}This script generates configuration for on-prem. For cloud, use the platform's deployment settings.${RESET}"
       exit 0 ;;
    2) DEPLOYMENT_TYPE="onprem"; ok "On-Premises selected" ;;
    *) err "Invalid choice. Please enter 1 or 2." ;;
  esac
}

# ── Tenant mode ────────────────────────────────────────────────────────────────
choose_tenant_mode() {
  step "2" "Tenant Mode"
  echo -e "  ${DIM}How will this instance serve your organisation(s)?${RESET}\n"
  echo -e "  ${BOLD}1)${RESET} 👤  Single Tenant"
  echo -e "     ${DIM}One organisation. Simpler setup. No tenant management UI.${RESET}"
  echo -e "     ${DIM}Best for: Internal deployment for a single company.${RESET}\n"
  echo -e "  ${BOLD}2)${RESET} 🏢  Multi-Tenant"
  echo -e "     ${DIM}Multiple organisations share one platform instance.${RESET}"
  echo -e "     ${DIM}Best for: MSSPs, consultancies, SaaS providers.${RESET}"
  echo ""
  ask "Enter choice [1/2]:"
  read -r tm_choice
  case "$tm_choice" in
    1) TENANT_MODE="single"; ok "Single-Tenant selected" ;;
    2) TENANT_MODE="multi";  ok "Multi-Tenant selected" ;;
    *) err "Invalid choice." ;;
  esac
}

# ── Organisation info (single tenant) ─────────────────────────────────────────
collect_org_info() {
  if [[ "$TENANT_MODE" == "single" ]]; then
    step "3a" "Organisation Details"
    ask "Organisation name [My Organisation]:"
    read -r ORG_NAME
    ORG_NAME="${ORG_NAME:-My Organisation}"
    ask "Admin email [admin@example.com]:"
    read -r ADMIN_EMAIL
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
    ok "Organisation: $ORG_NAME ($ADMIN_EMAIL)"
  fi
}

# ── Security secrets ───────────────────────────────────────────────────────────
generate_secrets() {
  step "3" "Generating Security Secrets"
  POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
  TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 16)
  SESSION_SECRET=$(openssl rand -base64 32 | tr -d '\n')
  ok "PostgreSQL password generated"
  ok "JWT secret (64-byte) generated"
  ok "Token encryption key (32-hex) generated"
  ok "Session secret generated"
}

# ── OpenAI key ─────────────────────────────────────────────────────────────────
collect_openai() {
  step "4" "AI Features (optional)"
  echo -e "  ${DIM}An OpenAI API key enables AI vCISO, risk scoring, policy drafting, and AI enrichment.${RESET}"
  echo -e "  ${DIM}Leave blank to skip — AI features can be enabled later by updating OPENAI_API_KEY in .env${RESET}"
  ask "OpenAI API key (sk-... or blank to skip):"
  read -r OPENAI_API_KEY
  if [[ -n "$OPENAI_API_KEY" ]]; then
    ok "OpenAI API key set"
  else
    warn "AI features disabled — add OPENAI_API_KEY to .env to enable later"
    OPENAI_API_KEY=""
  fi
}

# ── Network config ─────────────────────────────────────────────────────────────
collect_network() {
  step "5" "Network Configuration"
  ask "Web port [443]:"
  read -r WEB_PORT
  WEB_PORT="${WEB_PORT:-443}"
  ask "API port [8080]:"
  read -r API_PORT
  API_PORT="${API_PORT:-8080}"
  ok "Web: $WEB_PORT, API: $API_PORT"
}

# ── Write .env ─────────────────────────────────────────────────────────────────
write_env() {
  step "6" "Writing .env"
  SINGLE_EXTRAS=""
  if [[ "$TENANT_MODE" == "single" ]]; then
    SINGLE_EXTRAS="
# ── Single-Tenant ──────────────────────────────────────────────────────────────
ORG_NAME=${ORG_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}"
  fi

  cat > .env <<EOF
# DuFense AIGO-X GRC Platform — Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# !! Keep this file secret — never commit to version control !!

DEPLOYMENT_TYPE=onprem
TENANT_MODE=${TENANT_MODE}
APP_VERSION=1.0.0
NODE_ENV=production

POSTGRES_USER=grc_user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dufense_grc
DATABASE_URL=postgresql://grc_user:${POSTGRES_PASSWORD}@postgres:5432/dufense_grc

JWT_SECRET=${JWT_SECRET}
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
SESSION_SECRET=${SESSION_SECRET}

OPENAI_API_KEY=${OPENAI_API_KEY}

WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
${SINGLE_EXTRAS}
EOF
  ok ".env written"
}

# ── Write docker-compose.yml ───────────────────────────────────────────────────
write_compose() {
  step "7" "Writing docker-compose.yml"
  COMPOSE_FILE="docker-compose.${TENANT_MODE}.yml"
  if [[ -f "$COMPOSE_FILE" ]]; then
    cp "$COMPOSE_FILE" docker-compose.yml
    ok "docker-compose.yml written (${TENANT_MODE}-tenant template)"
  else
    warn "$COMPOSE_FILE not found — using generic template"
    cp docker-compose.multi.yml docker-compose.yml 2>/dev/null || true
  fi
}

# ── Summary ────────────────────────────────────────────────────────────────────
print_summary() {
  echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║               Setup Complete! 🎉                         ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${BOLD}Deployment:${RESET}  On-Premises"
  echo -e "  ${BOLD}Mode:${RESET}        ${TENANT_MODE^}-Tenant"
  [[ "$TENANT_MODE" == "single" ]] && echo -e "  ${BOLD}Org:${RESET}         $ORG_NAME"
  echo -e "  ${BOLD}Web Port:${RESET}    $WEB_PORT"
  echo -e "  ${BOLD}API Port:${RESET}    $API_PORT"
  echo -e "  ${BOLD}AI:${RESET}          $( [[ -n "$OPENAI_API_KEY" ]] && echo "Enabled" || echo "Disabled (add OPENAI_API_KEY to enable)" )"
  echo ""
  echo -e "  ${BOLD}${CYAN}Next steps:${RESET}"
  echo -e "  ${DIM}1. Review .env — change passwords if needed${RESET}"
  echo -e "  ${DIM}2. Place your TLS certificates in ./ssl/ (fullchain.pem, privkey.pem)${RESET}"
  echo -e "  ${DIM}3. Run:${RESET} ${BOLD}${DOCKER_COMPOSE_CMD} up -d${RESET}"
  echo -e "  ${DIM}4. Run database migrations:${RESET} ${BOLD}${DOCKER_COMPOSE_CMD} exec api pnpm db:migrate${RESET}"
  echo -e "  ${DIM}5. Seed initial data:${RESET} ${BOLD}${DOCKER_COMPOSE_CMD} exec api node dist/seed.mjs${RESET}"
  echo -e "  ${DIM}6. Open:${RESET} ${BOLD}https://your-server:${WEB_PORT}/grc-platform${RESET}"
  echo ""
  warn "IMPORTANT: .env contains secrets — store it securely and never commit to git"
  echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  header
  check_prereqs
  choose_deployment_type
  choose_tenant_mode
  collect_org_info
  generate_secrets
  collect_openai
  collect_network
  write_env
  write_compose
  print_summary
}

main

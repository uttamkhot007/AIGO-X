import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth";
import { registry } from "../lib/service-registry";

const router = Router();
const isSuperAdmin = requireRole("super_admin");

/** Reads deployment config from environment variables. */
function getDeploymentConfig() {
  return {
    deploymentType:  process.env["DEPLOYMENT_TYPE"]  ?? "cloud",
    tenantMode:      process.env["TENANT_MODE"]       ?? "multi",
    version:         process.env["APP_VERSION"]       ?? "1.0.0",
    environment:     process.env["NODE_ENV"]          ?? "development",
    configured:      !!process.env["DEPLOYMENT_TYPE"],
    features: {
      aiEnabled:     !!process.env["OPENAI_API_KEY"],
      mfaEnabled:    true,
      ssoEnabled:    !!process.env["SSO_ENABLED"],
      auditEnabled:  true,
    },
    db: {
      connected:     !!process.env["DATABASE_URL"],
      provider:      "postgresql",
    },
  };
}

// GET /deployment/config — public
router.get("/deployment/config", (_req, res) => {
  res.json(getDeploymentConfig());
});

// GET /deployment/services — super_admin
router.get("/deployment/services", requireAuth, isSuperAdmin, (_req, res) => {
  const all = registry.getAll();
  res.json({
    services: all.map(s => ({
      name: s.name, path: s.path, status: s.status,
      version: s.version, lastChecked: s.lastChecked.toISOString(),
    })),
    summary: {
      total:    all.length,
      healthy:  all.filter(s => s.status === "healthy").length,
      degraded: all.filter(s => s.status === "degraded").length,
      down:     all.filter(s => s.status === "offline").length,
    },
  });
});

// POST /deployment/generate-config — super_admin
router.post("/deployment/generate-config", requireAuth, isSuperAdmin, (req, res) => {
  const {
    deploymentType, tenantMode, orgName, adminEmail,
    openaiKey, dbPassword, jwtSecret, encKey,
    webPort, apiPort,
    cloudApiEndpoint, cloudDbUrl, agentKey,
    cloudProvider, useK8s, agentCount, agentRegions, enableMonitoring,
    awsRegion, awsAccountId, ecsCluster,
    azureRg, azureLocation,
    gcpProject, gcpRegion,
    k8sContext, k8sNamespace, k8sStorageClass,
  } = req.body as Record<string, string>;

  const validTypes = ["onprem", "hybrid"];
  if (!validTypes.includes(deploymentType)) {
    res.status(400).json({ error: "Config generation is only for on-premises or hybrid deployments" });
    return;
  }

  const safeOrg  = (orgName  ?? "My Organization").replace(/[^a-zA-Z0-9 ]/g, "");
  const safeMode = tenantMode === "single" ? "single" : "multi";
  const safePort = (webPort  ?? "443").replace(/[^0-9]/g, "")  || "443";
  const safeApi  = (apiPort  ?? "8080").replace(/[^0-9]/g, "") || "8080";
  const safeCount = Math.min(Math.max(parseInt(agentCount ?? "1", 10) || 1, 1), 10);
  const safeRegions = (agentRegions ?? "dc-01").split(",").map(r => r.trim()).filter(Boolean);
  const k8s = useK8s === "true";
  const monitoring = enableMonitoring === "true";
  const provider = ["aws", "azure", "gcp", "k8s", "docker"].includes(cloudProvider ?? "") ? cloudProvider : "docker";
  const effectiveK8s = k8s || provider === "k8s";

  if (deploymentType === "hybrid") {
    const result = buildHybridConfig({
      safeOrg, safeMode, openaiKey, adminEmail,
      cloudApiEndpoint: cloudApiEndpoint ?? "https://grc.aigosek.com",
      cloudDbUrl, agentKey, jwtSecret, encKey, dbPassword,
      cloudProvider: provider!, k8s: effectiveK8s, agentCount: safeCount,
      agentRegions: safeRegions, monitoring,
      awsRegion: awsRegion ?? "us-east-1",
      awsAccountId: awsAccountId ?? "",
      ecsCluster: ecsCluster ?? "aigo-x-cluster",
      azureRg: azureRg ?? "aigo-x-rg",
      azureLocation: azureLocation ?? "eastus",
      gcpProject: gcpProject ?? "",
      gcpRegion: gcpRegion ?? "us-central1",
      k8sContext: k8sContext ?? "",
      k8sNamespace: k8sNamespace ?? "aigo-x",
      k8sStorageClass: k8sStorageClass ?? "standard",
    });
    res.json(result);
    return;
  }

  const envContent = buildOnPremEnv({
    safeOrg, safeMode, openaiKey, adminEmail,
    webPort: safePort, apiPort: safeApi,
    dbPassword, jwtSecret, encKey,
  });
  const composeContent = buildComposeYaml(safeMode, safeOrg);
  const nginxContent   = buildNginxConf(safeMode);
  res.json({ envContent, composeContent, nginxContent, tenantMode: safeMode });
});

// ── Shared secret placeholder generator ──────────────────────────────────────
function placeholder(name: string, provided?: string): string {
  return provided && provided.trim() ? provided.trim() : `CHANGE_ME_${name}`;
}

// ── On-prem env ───────────────────────────────────────────────────────────────
function buildOnPremEnv(p: {
  safeOrg: string; safeMode: string; openaiKey?: string; adminEmail?: string;
  webPort: string; apiPort: string; dbPassword?: string; jwtSecret?: string; encKey?: string;
}): string {
  const dbPass = placeholder("STRONG_DB_PASSWORD", p.dbPassword);
  return [
    `# AIGO-X GRC Platform — On-Premises Configuration`,
    `# Generated: ${new Date().toISOString()}`,
    `# Mode: On-Premises / ${p.safeMode === "single" ? "Single Tenant" : "Multi-Tenant"}`,
    ``,
    `# ── Deployment ────────────────────────────────`,
    `DEPLOYMENT_TYPE=onprem`,
    `TENANT_MODE=${p.safeMode}`,
    `APP_VERSION=1.0.0`,
    `NODE_ENV=production`,
    ``,
    `# ── Database ───────────────────────────────────`,
    `POSTGRES_USER=grc_user`,
    `POSTGRES_PASSWORD=${dbPass}`,
    `POSTGRES_DB=aigo_grc`,
    `DATABASE_URL=postgresql://grc_user:${dbPass}@postgres:5432/aigo_grc`,
    ``,
    `# ── Security ───────────────────────────────────`,
    `JWT_SECRET=${placeholder("JWT_SECRET_64_CHARS_RANDOM", p.jwtSecret)}`,
    `TOKEN_ENCRYPTION_KEY=${placeholder("TOKEN_ENC_KEY_32_HEX", p.encKey)}`,
    ``,
    `# ── AI Features (optional) ─────────────────────`,
    `OPENAI_API_KEY=${p.openaiKey ?? ""}`,
    ``,
    `# ── Network ────────────────────────────────────`,
    `WEB_PORT=${p.webPort}`,
    `API_PORT=${p.apiPort}`,
    ...(p.safeMode === "single" ? [
      ``,
      `# ── Single-Tenant Config ───────────────────────`,
      `ORG_NAME=${p.safeOrg}`,
      `ADMIN_EMAIL=${p.adminEmail ?? "admin@example.com"}`,
    ] : []),
  ].join("\n");
}

// ── Nginx conf (on-prem / cloud) ──────────────────────────────────────────────
function buildNginxConf(mode: string): string {
  return `# nginx.conf — AIGO-X GRC Platform
# Mode: ${mode === "single" ? "Single Tenant" : "Multi-Tenant"}
# Place at ./nginx.conf

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name grc.aigosek.com;
    return 301 https://grc.aigosek.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grc.aigosek.com;

    # TLS — replace with your cert paths or use certbot/Let's Encrypt
    ssl_certificate     /etc/ssl/certs/grc.aigosek.com.crt;
    ssl_certificate_key /etc/ssl/private/grc.aigosek.com.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options        DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy        strict-origin-when-cross-origin;
    add_header X-XSS-Protection       "1; mode=block";

    # Frontend — static assets
    location / {
        proxy_pass         http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API — all /api/* routes
    location /api/ {
        proxy_pass         http://api:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50m;
    }

    # SSE — keep alive for event streams
    location /api/events {
        proxy_pass         http://api:8080/api/events;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }
}`;
}

// ── Nginx agent conf (on-prem outbound proxy) ────────────────────────────────
function buildNginxAgentConf(cloudApiEndpoint: string): string {
  return `# nginx-agent.conf — AIGO-X Agent Outbound Proxy
# Forwards agent traffic to the cloud control plane
# Place at ./nginx-agent.conf on each on-prem agent node

# Strip scheme for upstream host
upstream cloud_api {
    server ${cloudApiEndpoint.replace(/^https?:\/\//, "")}:443;
    keepalive 16;
}

server {
    listen 9099;
    server_name _;

    location / {
        proxy_pass         https://cloud_api;
        proxy_http_version 1.1;
        proxy_ssl_verify   on;
        proxy_set_header   Host              $proxy_host;
        proxy_set_header   X-Agent-Id        $http_x_agent_id;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}`;
}

// ── Agent setup script ────────────────────────────────────────────────────────
function buildAgentSetupScript(p: {
  cloudApiEndpoint: string; agentRegistrationKey: string;
  agentCount: number; agentRegions: string[];
}): string {
  const regions = p.agentRegions.length >= p.agentCount
    ? p.agentRegions.slice(0, p.agentCount)
    : [...p.agentRegions, ...Array.from({ length: p.agentCount - p.agentRegions.length }, (_, i) => `region-${i + p.agentRegions.length + 1}`)];

  const agentBlocks = regions.map((region, i) => `
# ── Agent ${i + 1}: ${region} ────────────────────────────────
echo "Deploying agent ${i + 1} (${region})..."
AGENT_ID="aigo-agent-${region}-$(uuidgen | tr '[:upper:]' '[:lower:]')" \\
AGENT_REGION="${region}" \\
AGENT_TAGS="datacenter=${region},node=${i + 1}" \\
  docker compose -f docker-compose.agent.yml up -d --remove-orphans
echo "Agent ${i + 1} started."`).join("\n");

  return `#!/usr/bin/env bash
# AIGO-X Hybrid Agent Setup Script
# Generated: ${new Date().toISOString()}
# Run as root on each on-premises server
# Usage: chmod +x setup-agents.sh && sudo ./setup-agents.sh

set -euo pipefail

CLOUD_API="${p.cloudApiEndpoint}"
AGENT_KEY="${p.agentRegistrationKey}"
AGENT_COUNT=${p.agentCount}

echo "======================================================"
echo "  AIGO-X GRC Platform — Hybrid Agent Setup"
echo "  Cloud endpoint : $CLOUD_API"
echo "  Agents to deploy: $AGENT_COUNT"
echo "======================================================"

# Prerequisites check
command -v docker  >/dev/null 2>&1 || { echo "ERROR: docker not installed"; exit 1; }
command -v uuidgen >/dev/null 2>&1 || { echo "ERROR: uuidgen not found (install util-linux)"; exit 1; }

# Pull latest agent image
echo "Pulling agent images..."
docker pull aigo-x/agent:1.0.0
docker pull aigo-x/evidence-engine:1.0.0
echo "Images pulled."

# Write environment file for agents
cat > .env.agent <<EOF
CLOUD_API_ENDPOINT=${p.cloudApiEndpoint}
AGENT_KEY=${p.agentRegistrationKey}
AGENT_TLS_VERIFY=true
AGENT_SYNC_INTERVAL=60
EVIDENCE_STORAGE_PATH=/data/evidence
EVIDENCE_MAX_SIZE_MB=5120
EVIDENCE_RETENTION_DAYS=90
EOF
echo ".env.agent written."
${agentBlocks}

echo ""
echo "✅ All agents deployed. Check status: docker ps -a | grep aigo"
echo "   Verify connectivity: docker logs aigo-agent-<id>"
`;
}

// ── Hybrid config builder ──────────────────────────────────────────────────────
function buildHybridConfig(p: {
  safeOrg: string; safeMode: string; openaiKey?: string; adminEmail?: string;
  cloudApiEndpoint: string; cloudDbUrl?: string; agentKey?: string;
  jwtSecret?: string; encKey?: string; dbPassword?: string;
  cloudProvider: string; k8s: boolean; agentCount: number;
  agentRegions: string[]; monitoring: boolean;
  awsRegion: string; awsAccountId: string; ecsCluster: string;
  azureRg: string; azureLocation: string;
  gcpProject: string; gcpRegion: string;
  k8sContext: string; k8sNamespace: string; k8sStorageClass: string;
}): object {
  const ts  = new Date().toISOString();
  const agentRegistrationKey = placeholder("AGENT_REGISTRATION_KEY_32CHARS", p.agentKey);
  const jwtSec  = placeholder("JWT_SECRET_64_CHARS_RANDOM", p.jwtSecret);
  const encKey  = placeholder("TOKEN_ENC_KEY_32_HEX", p.encKey);
  const dbPass  = placeholder("STRONG_DB_PASSWORD", p.dbPassword);
  const providerLabel = { aws: "AWS ECS / Fargate", azure: "Azure Container Apps", gcp: "GCP Cloud Run", k8s: "Kubernetes (self-managed / EKS / AKS / GKE)", docker: "Docker Compose (VM)" }[p.cloudProvider] ?? "Docker Compose";

  const singleExtras = p.safeMode === "single" ? `\n      ORG_NAME: \${ORG_NAME}\n      ADMIN_EMAIL: \${ADMIN_EMAIL}` : "";

  // ── Cloud env ────────────────────────────────────────────────────────────────
  const envCloudContent = [
    `# AIGO-X GRC Platform — Hybrid Deployment: Cloud Control Plane`,
    `# Generated: ${ts}`,
    `# Cloud Provider: ${providerLabel}`,
    `# Tenant Mode: ${p.safeMode === "single" ? "Single Tenant" : "Multi-Tenant"}`,
    ``,
    `# ── Deployment ────────────────────────────────`,
    `DEPLOYMENT_TYPE=hybrid`,
    `HYBRID_ROLE=control-plane`,
    `TENANT_MODE=${p.safeMode}`,
    `APP_VERSION=1.0.0`,
    `NODE_ENV=production`,
    ``,
    `# ── Database (Cloud Managed) ─────────────────`,
    `DATABASE_URL=${p.cloudDbUrl ?? `postgresql://grc_user:${dbPass}@your-managed-db.example.com:5432/aigo_grc`}`,
    ``,
    `# ── Redis (session cache / pub-sub) ──────────`,
    `REDIS_URL=redis://redis:6379`,
    ``,
    `# ── Security ─────────────────────────────────`,
    `JWT_SECRET=${jwtSec}`,
    `TOKEN_ENCRYPTION_KEY=${encKey}`,
    `AGENT_REGISTRATION_KEY=${agentRegistrationKey}`,
    ``,
    `# ── mTLS (agent ↔ control plane) ─────────────`,
    `# Generate with: openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 3650 -nodes`,
    `MTLS_CERT_PATH=/run/secrets/server_crt`,
    `MTLS_KEY_PATH=/run/secrets/server_key`,
    `MTLS_CA_PATH=/run/secrets/ca_crt`,
    ``,
    `# ── AI Features (optional) ───────────────────`,
    `OPENAI_API_KEY=${p.openaiKey ?? ""}`,
    ``,
    `# ── Network ──────────────────────────────────`,
    `WEB_PORT=443`,
    `API_PORT=8080`,
    ...(p.monitoring ? [
      ``,
      `# ── Observability ────────────────────────────`,
      `PROMETHEUS_ENABLED=true`,
      `METRICS_PORT=9091`,
    ] : []),
    ...(p.cloudProvider === "aws" ? [
      ``,
      `# ── AWS Configuration ────────────────────────`,
      `AWS_REGION=${p.awsRegion}`,
      `AWS_ACCOUNT_ID=${p.awsAccountId || "# Set your 12-digit AWS account ID"}`,
      `ECS_CLUSTER=${p.ecsCluster}`,
      `ECR_REGISTRY=${p.awsAccountId ? p.awsAccountId + ".dkr.ecr." + p.awsRegion + ".amazonaws.com" : "# <account>.dkr.ecr." + p.awsRegion + ".amazonaws.com"}`,
      `# IAM Role: attach AmazonECS_FullAccess + AmazonRDSFullAccess + AmazonElastiCacheFullAccess`,
      ...(p.monitoring ? [`CLOUDWATCH_LOG_GROUP=/aigo-x/production`, `XRAY_DAEMON_ADDRESS=xray-daemon:2000`] : []),
    ] : []),
    ...(p.cloudProvider === "azure" ? [
      ``,
      `# ── Azure Configuration ──────────────────────`,
      `AZURE_RESOURCE_GROUP=${p.azureRg}`,
      `AZURE_LOCATION=${p.azureLocation}`,
      `AZURE_CONTAINER_REGISTRY=aigoxacr.azurecr.io`,
      `# Service Principal: az ad sp create-for-rbac --name aigo-x-sp --role contributor`,
      `AZURE_CLIENT_ID=# Set after creating service principal`,
      `AZURE_TENANT_ID=# az account show --query tenantId`,
      ...(p.monitoring ? [`AZURE_LOG_ANALYTICS_WORKSPACE_ID=# az monitor log-analytics workspace create`] : []),
    ] : []),
    ...(p.cloudProvider === "gcp" ? [
      ``,
      `# ── GCP Configuration ────────────────────────`,
      `GCP_PROJECT=${p.gcpProject || "# Set your GCP project ID"}`,
      `GCP_REGION=${p.gcpRegion}`,
      `GCP_ARTIFACT_REGISTRY=gcr.io/${p.gcpProject || "<project>"}`,
      `# Service Account: gcloud iam service-accounts create aigo-x-sa --project ${p.gcpProject || "<project>"}`,
      ...(p.monitoring ? [`GOOGLE_CLOUD_PROJECT=${p.gcpProject || "<project>"}`, `TRACE_ENABLED=true`] : []),
    ] : []),
    ...(p.cloudProvider === "k8s" ? [
      ``,
      `# ── Kubernetes Configuration ─────────────────`,
      `K8S_NAMESPACE=${p.k8sNamespace}`,
      `K8S_CONTEXT=${p.k8sContext || "# kubectl config current-context"}`,
      `K8S_STORAGE_CLASS=${p.k8sStorageClass}`,
      `# Image registry: set REGISTRY below before pushing images`,
      `REGISTRY=registry.example.com/aigo-x`,
    ] : []),
    ...(p.safeMode === "single" ? [
      ``,
      `# ── Single-Tenant Config ─────────────────────`,
      `ORG_NAME=${p.safeOrg}`,
      `ADMIN_EMAIL=${p.adminEmail ?? "admin@example.com"}`,
    ] : []),
  ].join("\n");

  // ── On-prem agent env ────────────────────────────────────────────────────────
  const envOnPremContent = [
    `# AIGO-X GRC Platform — Hybrid Deployment: On-Premises Agent Nodes`,
    `# Generated: ${ts}`,
    `# Copy to each on-premises server. Customise AGENT_ID, AGENT_REGION, AGENT_TAGS per node.`,
    ``,
    `# ── Deployment ────────────────────────────────`,
    `DEPLOYMENT_TYPE=hybrid`,
    `HYBRID_ROLE=agent-node`,
    `APP_VERSION=1.0.0`,
    `NODE_ENV=production`,
    ``,
    `# ── Cloud Connectivity ────────────────────────`,
    `CLOUD_API_ENDPOINT=${p.cloudApiEndpoint}`,
    `AGENT_KEY=${agentRegistrationKey}`,
    `AGENT_TLS_VERIFY=true`,
    `AGENT_SYNC_INTERVAL=60`,
    `AGENT_HEARTBEAT_INTERVAL=30`,
    ``,
    `# ── Agent Identity (unique per node) ─────────`,
    `AGENT_ID=CHANGE_ME_UNIQUE_AGENT_ID`,
    `AGENT_REGION=${p.agentRegions[0] ?? "dc-01"}`,
    `AGENT_TAGS=datacenter=${p.agentRegions[0] ?? "hq"},network=internal`,
    ``,
    `# ── mTLS Agent Certificate ───────────────────`,
    `# Generate with: openssl req -x509 -newkey rsa:4096 -keyout agent.key -out agent.crt -days 3650 -nodes`,
    `AGENT_CERT_PATH=/run/secrets/agent_crt`,
    `AGENT_KEY_PATH=/run/secrets/agent_key`,
    `AGENT_CA_PATH=/run/secrets/ca_crt`,
    ``,
    `# ── Local Evidence Collection ─────────────────`,
    `EVIDENCE_STORAGE_PATH=/data/evidence`,
    `EVIDENCE_MAX_SIZE_MB=5120`,
    `EVIDENCE_RETENTION_DAYS=90`,
    `EVIDENCE_COMPRESS=true`,
    ``,
    `# ── Scan Targets (comma-separated CIDRs or hostnames) ─`,
    `SCAN_TARGETS=192.168.1.0/24`,
    `SCAN_SCHEDULE=0 3 * * *`,
    ``,
    `# ── AI Features (optional) ───────────────────`,
    `OPENAI_API_KEY=${p.openaiKey ?? ""}`,
    ``,
    `# ── Proxy / Firewall ─────────────────────────`,
    `# HTTPS_PROXY=http://proxy.corp.example.com:3128`,
    `# NO_PROXY=localhost,127.0.0.1,169.254.169.254`,
  ].join("\n");

  // ── Cloud Compose ─────────────────────────────────────────────────────────────
  const monitoringServices = p.monitoring ? `
  prometheus:
    image: prom/prometheus:v2.51.2
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=30d"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.4.2
    environment:
      GF_SECURITY_ADMIN_PASSWORD: \${GRAFANA_PASSWORD:-CHANGE_ME}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
    restart: unless-stopped` : "";

  const monitoringVolumes = p.monitoring ? `
  prometheus_data:
    driver: local
  grafana_data:
    driver: local` : "";

  const composeCloudContent = `# AIGO-X GRC Platform — Hybrid Deployment: Cloud Control Plane
# Generated: ${ts}
# Provider: ${providerLabel}
# Note: Remove the 'build' blocks when using pre-built registry images.

services:
  api:
    image: aigo-x/api-server:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: \${DATABASE_URL}
      REDIS_URL: \${REDIS_URL:-redis://redis:6379}
      JWT_SECRET: \${JWT_SECRET}
      TOKEN_ENCRYPTION_KEY: \${TOKEN_ENCRYPTION_KEY}
      AGENT_REGISTRATION_KEY: \${AGENT_REGISTRATION_KEY}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      DEPLOYMENT_TYPE: hybrid
      HYBRID_ROLE: control-plane
      TENANT_MODE: ${p.safeMode}
      NODE_ENV: production
      PORT: 8080${singleExtras}
    ports:
      - "\${API_PORT:-8080}:8080"
    secrets:
      - server_crt
      - server_key
      - ca_crt
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8080/api/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

  web:
    image: aigo-x/grc-platform:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.web
    environment:
      VITE_API_BASE_URL: http://api:8080
      TENANT_MODE: ${p.safeMode}
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:7.2-alpine
    command: >
      redis-server
      --requirepass \${REDIS_PASSWORD:-CHANGE_ME_REDIS_PASS}
      --save 60 1
      --loglevel warning
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "\${REDIS_PASSWORD:-CHANGE_ME_REDIS_PASS}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  nginx:
    image: nginx:1.25-alpine
    ports:
      - "\${WEB_PORT:-443}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - web
      - api
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"
${monitoringServices}

secrets:
  server_crt:
    file: ./certs/server.crt
  server_key:
    file: ./certs/server.key
  ca_crt:
    file: ./certs/ca.crt

volumes:
  redis_data:
    driver: local${monitoringVolumes}

networks:
  default:
    name: aigo_cloud_network
    driver: bridge
`;

  // ── On-prem agent Compose ─────────────────────────────────────────────────────
  const composeOnPremContent = `# AIGO-X GRC Platform — Hybrid Deployment: On-Premises Agent Nodes
# Generated: ${ts}
# Deploy on each on-premises server. Set AGENT_ID and AGENT_REGION per node.

services:
  agent:
    image: aigo-x/agent:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.agent
    environment:
      CLOUD_API_ENDPOINT: \${CLOUD_API_ENDPOINT}
      AGENT_KEY: \${AGENT_KEY}
      AGENT_ID: \${AGENT_ID}
      AGENT_REGION: \${AGENT_REGION}
      AGENT_TAGS: \${AGENT_TAGS}
      AGENT_TLS_VERIFY: \${AGENT_TLS_VERIFY:-true}
      AGENT_SYNC_INTERVAL: \${AGENT_SYNC_INTERVAL:-60}
      AGENT_HEARTBEAT_INTERVAL: \${AGENT_HEARTBEAT_INTERVAL:-30}
      DEPLOYMENT_TYPE: hybrid
      HYBRID_ROLE: agent-node
    volumes:
      - evidence_data:/data/evidence
      - agent_logs:/var/log/aigo-agent
    secrets:
      - agent_crt
      - agent_key
      - ca_crt
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:9090/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

  evidence-engine:
    image: aigo-x/evidence-engine:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.evidence
    environment:
      AGENT_ID: \${AGENT_ID}
      CLOUD_API_ENDPOINT: \${CLOUD_API_ENDPOINT}
      AGENT_KEY: \${AGENT_KEY}
      EVIDENCE_STORAGE_PATH: /data/evidence
      EVIDENCE_MAX_SIZE_MB: \${EVIDENCE_MAX_SIZE_MB:-5120}
      EVIDENCE_RETENTION_DAYS: \${EVIDENCE_RETENTION_DAYS:-90}
      EVIDENCE_COMPRESS: \${EVIDENCE_COMPRESS:-true}
      SCAN_TARGETS: \${SCAN_TARGETS:-}
      SCAN_SCHEDULE: \${SCAN_SCHEDULE:-0 3 * * *}
    volumes:
      - evidence_data:/data/evidence
    depends_on:
      agent:
        condition: service_healthy
    restart: unless-stopped

  local-proxy:
    image: nginx:1.25-alpine
    volumes:
      - ./nginx-agent.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - agent
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

secrets:
  agent_crt:
    file: ./certs/agent.crt
  agent_key:
    file: ./certs/agent.key
  ca_crt:
    file: ./certs/ca.crt

volumes:
  evidence_data:
    driver: local
  agent_logs:
    driver: local

networks:
  default:
    name: aigo_onprem_network
    driver: bridge
`;

  // ── K8s manifests (cloud control plane) ──────────────────────────────────────
  const k8sCloudManifest = p.k8s ? buildK8sCloudManifest(p.safeMode, p.safeOrg, p.monitoring, singleExtras) : undefined;
  const k8sAgentManifest = p.k8s ? buildK8sAgentManifest(p.cloudApiEndpoint, p.agentRegions) : undefined;

  const nginxContent      = buildNginxConf(p.safeMode);
  const nginxAgentContent = buildNginxAgentConf(p.cloudApiEndpoint);
  const setupScript       = buildAgentSetupScript({
    cloudApiEndpoint: p.cloudApiEndpoint,
    agentRegistrationKey,
    agentCount: p.agentCount,
    agentRegions: p.agentRegions,
  });

  const prometheusYml = p.monitoring ? buildPrometheusConfig() : undefined;
  const providerScript = buildProviderScript(p);

  return {
    envCloudContent, envOnPremContent,
    composeCloudContent, composeOnPremContent,
    nginxContent, nginxAgentContent,
    setupScript,
    k8sCloudManifest, k8sAgentManifest,
    prometheusYml,
    providerScript,
    tenantMode: p.safeMode,
    cloudProvider: p.cloudProvider,
    agentCount: p.agentCount,
    monitoring: p.monitoring,
    k8s: p.k8s,
  };
}

// ── Provider-specific deploy script builder ───────────────────────────────────
function buildProviderScript(p: {
  safeOrg: string; cloudProvider: string; monitoring: boolean; k8s: boolean;
  cloudApiEndpoint: string;
  awsRegion: string; awsAccountId: string; ecsCluster: string;
  azureRg: string; azureLocation: string;
  gcpProject: string; gcpRegion: string;
  k8sContext: string; k8sNamespace: string; k8sStorageClass: string;
}): string {
  const ts = new Date().toISOString();
  if (p.cloudProvider === "aws") {
    const accountLine = p.awsAccountId
      ? `ACCOUNT="${p.awsAccountId}"`
      : `ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"`;
    return `#!/usr/bin/env bash
# AIGO-X GRC — AWS ECS Fargate Deployment Script
# Generated: ${ts}
# Region: ${p.awsRegion} | Cluster: ${p.ecsCluster}
set -euo pipefail
REGION="${p.awsRegion}"
CLUSTER="${p.ecsCluster}"
${accountLine}
ECR="\$ACCOUNT.dkr.ecr.\$REGION.amazonaws.com"

echo "🟠 Authenticating with ECR..."
aws ecr get-login-password --region "\$REGION" | docker login --username AWS --password-stdin "\$ECR"

echo "📦 Creating ECR repositories (idempotent)..."
aws ecr create-repository --region "\$REGION" --repository-name aigo-x/api --image-scanning-configuration scanOnPush=true 2>/dev/null || true
aws ecr create-repository --region "\$REGION" --repository-name aigo-x/web --image-scanning-configuration scanOnPush=true 2>/dev/null || true

echo "🔨 Building & pushing images..."
docker build -t aigo-x/api -f Dockerfile.api .
docker tag aigo-x/api "\$ECR/aigo-x/api:1.0"
docker push "\$ECR/aigo-x/api:1.0"

docker build -t aigo-x/web -f Dockerfile.web .
docker tag aigo-x/web "\$ECR/aigo-x/web:1.0"
docker push "\$ECR/aigo-x/web:1.0"

echo "⚙️  Registering ECS task definitions..."
cat > /tmp/ecs-task-api.json <<EOF
{
  "family": "aigo-x-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512", "memory": "1024",
  "containerDefinitions": [{
    "name": "api",
    "image": "\$ECR/aigo-x/api:1.0",
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "environment": [{"name": "NODE_ENV", "value": "production"}],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/aigo-x/production", "awslogs-region": "\$REGION", "awslogs-stream-prefix": "api" }
    }
  }]
}
EOF
aws ecs register-task-definition --region "\$REGION" --cli-input-json file:///tmp/ecs-task-api.json

echo "🚀 Updating ECS services..."
aws ecs update-service --region "\$REGION" --cluster "\$CLUSTER" --service aigo-x-api --task-definition aigo-x-api --force-new-deployment
aws ecs update-service --region "\$REGION" --cluster "\$CLUSTER" --service aigo-x-web --task-definition aigo-x-web --force-new-deployment

echo "✅ Waiting for services to stabilise..."
aws ecs wait services-stable --region "\$REGION" --cluster "\$CLUSTER" --services aigo-x-api aigo-x-web

echo "🗄️  Running DB migrations..."
aws ecs run-task --region "\$REGION" --cluster "\$CLUSTER" \\
  --task-definition aigo-x-api \\
  --overrides '{"containerOverrides":[{"name":"api","command":["pnpm","db:migrate"]}]}' \\
  --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[\$SUBNET_ID],securityGroups=[\$SG_ID],assignPublicIp=ENABLED}"

echo ""
echo "✅ AIGO-X deployed to AWS ECS! Endpoint: ${p.cloudApiEndpoint}"
echo "   Next: deploy on-prem agents with setup-agents.sh"
`;
  }

  if (p.cloudProvider === "azure") {
    return `#!/usr/bin/env bash
# AIGO-X GRC — Azure Container Apps Deployment Script
# Generated: ${ts}
# Resource Group: ${p.azureRg} | Location: ${p.azureLocation}
set -euo pipefail
RG="${p.azureRg}"
LOCATION="${p.azureLocation}"
ACR_NAME="aigoxacr\${RANDOM}"

echo "🔷 Logging in to Azure..."
az login --only-show-errors

echo "📦 Creating Resource Group (idempotent)..."
az group create --name "\$RG" --location "\$LOCATION" --output none

echo "🗃️  Creating Azure Container Registry..."
az acr create --resource-group "\$RG" --name "\$ACR_NAME" --sku Basic --admin-enabled true --output none

echo "🔨 Building & pushing images via ACR Tasks..."
az acr build --registry "\$ACR_NAME" --image aigo-x/api:1.0 --file Dockerfile.api .
az acr build --registry "\$ACR_NAME" --image aigo-x/web:1.0 --file Dockerfile.web .

echo "⚙️  Creating Container Apps Environment..."
az containerapp env create --name aigo-x-env --resource-group "\$RG" --location "\$LOCATION" --output none

echo "🚀 Deploying Container Apps..."
az containerapp create \\
  --name aigo-x-api \\
  --resource-group "\$RG" \\
  --environment aigo-x-env \\
  --image "\$ACR_NAME.azurecr.io/aigo-x/api:1.0" \\
  --target-port 8080 --ingress external \\
  --min-replicas 1 --max-replicas 5 \\
  --env-vars "NODE_ENV=production" \\
  --output none

az containerapp create \\
  --name aigo-x-web \\
  --resource-group "\$RG" \\
  --environment aigo-x-env \\
  --image "\$ACR_NAME.azurecr.io/aigo-x/web:1.0" \\
  --target-port 80 --ingress external \\
  --min-replicas 1 --max-replicas 3 \\
  --output none

echo "🗄️  Running DB migrations..."
az containerapp exec --name aigo-x-api --resource-group "\$RG" --command "pnpm db:migrate"

echo ""
echo "✅ AIGO-X deployed to Azure Container Apps!"
echo "   API URL: \$(az containerapp show -n aigo-x-api -g \$RG --query properties.configuration.ingress.fqdn -o tsv)"
echo "   Next: deploy on-prem agents with setup-agents.sh"
`;
  }

  if (p.cloudProvider === "gcp") {
    const project = p.gcpProject || "<YOUR_GCP_PROJECT>";
    return `#!/usr/bin/env bash
# AIGO-X GRC — GCP Cloud Run Deployment Script
# Generated: ${ts}
# Project: ${project} | Region: ${p.gcpRegion}
set -euo pipefail
PROJECT="${project}"
REGION="${p.gcpRegion}"

echo "🔵 Authenticating with GCP..."
gcloud auth configure-docker --quiet
gcloud config set project "\$PROJECT" --quiet

echo "⚡ Enabling required APIs..."
gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com artifactregistry.googleapis.com --project "\$PROJECT"

echo "📦 Creating Artifact Registry repository..."
gcloud artifacts repositories create aigo-x --repository-format=docker --location="\$REGION" --project="\$PROJECT" 2>/dev/null || true

echo "🔨 Building & pushing images..."
gcloud builds submit --tag "\$REGION-docker.pkg.dev/\$PROJECT/aigo-x/api:1.0" --file Dockerfile.api .
gcloud builds submit --tag "\$REGION-docker.pkg.dev/\$PROJECT/aigo-x/web:1.0" --file Dockerfile.web .

echo "🚀 Deploying Cloud Run services..."
gcloud run deploy aigo-x-api \\
  --image "\$REGION-docker.pkg.dev/\$PROJECT/aigo-x/api:1.0" \\
  --region "\$REGION" \\
  --platform managed \\
  --allow-unauthenticated \\
  --port 8080 \\
  --min-instances 1 \\
  --max-instances 10 \\
  --set-env-vars "NODE_ENV=production,GCP_PROJECT=\$PROJECT" \\
  --quiet

gcloud run deploy aigo-x-web \\
  --image "\$REGION-docker.pkg.dev/\$PROJECT/aigo-x/web:1.0" \\
  --region "\$REGION" \\
  --platform managed \\
  --allow-unauthenticated \\
  --port 80 \\
  --min-instances 1 \\
  --max-instances 5 \\
  --quiet

echo "🗄️  Running DB migrations via Cloud Run Jobs..."
gcloud run jobs create aigo-x-migrate \\
  --image "\$REGION-docker.pkg.dev/\$PROJECT/aigo-x/api:1.0" \\
  --region "\$REGION" \\
  --command "pnpm" \\
  --args "db:migrate" \\
  --set-env-vars "NODE_ENV=production" 2>/dev/null || true
gcloud run jobs execute aigo-x-migrate --region "\$REGION" --wait

echo ""
echo "✅ AIGO-X deployed to GCP Cloud Run!"
echo "   API URL: \$(gcloud run services describe aigo-x-api --region \$REGION --format 'value(status.url)')"
echo "   Next: deploy on-prem agents with setup-agents.sh"
`;
  }

  if (p.cloudProvider === "k8s") {
    const ns = p.k8sNamespace || "aigo-x";
    const ctx = p.k8sContext ? `kubectl config use-context "${p.k8sContext}"` : "# Using current kubectl context";
    return `#!/usr/bin/env bash
# AIGO-X GRC — Kubernetes Deployment Script
# Generated: ${ts}
# Namespace: ${ns} | Storage Class: ${p.k8sStorageClass}
set -euo pipefail
NS="${ns}"
SC="${p.k8sStorageClass}"

echo "☸️  Setting kubectl context..."
${ctx}

echo "📦 Creating namespace (idempotent)..."
kubectl create namespace "\$NS" 2>/dev/null || true
kubectl label namespace "\$NS" app.kubernetes.io/name=aigo-x-grc --overwrite

echo "🔐 Creating secrets from .env.cloud..."
kubectl create secret generic aigo-x-secrets \\
  --from-env-file=.env.cloud \\
  --namespace="\$NS" \\
  --dry-run=client -o yaml | kubectl apply -f -

echo "🚀 Applying cloud manifests..."
kubectl apply -f k8s-cloud.yaml -n "\$NS"

echo "⏳ Waiting for deployments to roll out..."
kubectl rollout status deployment/aigo-x-api -n "\$NS" --timeout=300s
kubectl rollout status deployment/aigo-x-web -n "\$NS" --timeout=300s

echo "🗄️  Running DB migrations..."
kubectl exec -n "\$NS" deploy/aigo-x-api -- pnpm db:migrate

echo "🌐 Checking Ingress..."
kubectl get ingress -n "\$NS"

echo "🏢 Applying agent manifests..."
kubectl apply -f k8s-agents.yaml

echo ""
echo "✅ AIGO-X deployed to Kubernetes namespace: \$NS"
echo "   Pods: \$(kubectl get pods -n \$NS --no-headers | wc -l) running"
echo "   Next: deploy on-prem agents with setup-agents.sh"
`;
  }

  // docker (default)
  return `#!/usr/bin/env bash
# AIGO-X GRC — Docker Compose Hybrid Deployment Script
# Generated: ${ts}
set -euo pipefail

echo "🐳 Deploying cloud control plane..."
docker compose -f docker-compose.cloud.yml --env-file .env.cloud pull
docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d

echo "⏳ Waiting for API to be healthy..."
for i in \$(seq 1 30); do
  if docker compose -f docker-compose.cloud.yml exec -T api wget -qO- http://localhost:8080/api/healthz >/dev/null 2>&1; then
    echo "✅ API healthy"
    break
  fi
  echo "  attempt \$i/30..."
  sleep 5
done

echo "🗄️  Running DB migrations..."
docker compose -f docker-compose.cloud.yml exec api pnpm db:migrate

echo "🌐 Cloud endpoint: ${p.cloudApiEndpoint}"
echo ""
echo "✅ Cloud control plane running!"
echo "   Next: copy docker-compose.agent.yml + .env.onprem + setup-agents.sh to each on-prem server"
echo "   Then: chmod +x setup-agents.sh && sudo ./setup-agents.sh"
`;
}

// ── Kubernetes: Cloud Control Plane ──────────────────────────────────────────
function buildK8sCloudManifest(mode: string, org: string, monitoring: boolean, singleExtras: string): string {
  void singleExtras;
  const monDeployment = monitoring ? `
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: aigo-x
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:v2.51.2
        args: ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.retention.time=30d"]
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: config
          mountPath: /etc/prometheus
      volumes:
      - name: config
        configMap:
          name: prometheus-config` : "";

  return `# AIGO-X GRC Platform — Kubernetes Manifests: Cloud Control Plane
# Generated: ${new Date().toISOString()}
# Namespace: aigo-x | Mode: ${mode === "single" ? "Single Tenant" : "Multi-Tenant"} | Org: ${org}
# Apply: kubectl apply -f k8s-cloud.yaml

---
apiVersion: v1
kind: Namespace
metadata:
  name: aigo-x
  labels:
    app.kubernetes.io/name: aigo-x-grc
    app.kubernetes.io/managed-by: helm

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: aigo-x
  labels:
    app: api-server
    tier: control-plane
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api-server
        image: aigo-x/api-server:1.0.0
        ports:
        - containerPort: 8080
        envFrom:
        - secretRef:
            name: aigo-x-secrets
        - configMapRef:
            name: aigo-x-config
        livenessProbe:
          httpGet:
            path: /api/healthz
            port: 8080
          initialDelaySeconds: 40
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/healthz
            port: 8080
          initialDelaySeconds: 20
          periodSeconds: 10
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1"
            memory: "1Gi"

---
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: aigo-x
spec:
  selector:
    app: api-server
  ports:
  - port: 8080
    targetPort: 8080

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grc-platform
  namespace: aigo-x
spec:
  replicas: 2
  selector:
    matchLabels:
      app: grc-platform
  template:
    metadata:
      labels:
        app: grc-platform
    spec:
      containers:
      - name: grc-platform
        image: aigo-x/grc-platform:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: VITE_API_BASE_URL
          value: "http://api-server:8080"
        resources:
          requests:
            cpu: "100m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"

---
apiVersion: v1
kind: Service
metadata:
  name: grc-platform
  namespace: aigo-x
spec:
  selector:
    app: grc-platform
  ports:
  - port: 3000
    targetPort: 3000

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: aigo-x
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7.2-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "250m"
            memory: "256Mi"

---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: aigo-x
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aigo-x-ingress
  namespace: aigo-x
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx
  rules:
  - host: CHANGE_ME_YOUR_DOMAIN
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-server
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: grc-platform
            port:
              number: 3000
${monDeployment}

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: aigo-x-config
  namespace: aigo-x
data:
  DEPLOYMENT_TYPE: "hybrid"
  HYBRID_ROLE: "control-plane"
  TENANT_MODE: "${mode}"
  NODE_ENV: "production"
  PORT: "8080"
`;
}

// ── Kubernetes: On-Prem Agent Nodes ──────────────────────────────────────────
function buildK8sAgentManifest(cloudApiEndpoint: string, agentRegions: string[]): string {
  const regionDeployments = agentRegions.map((region, i) => `
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: aigo-agent-${region}
  namespace: aigo-agents
  labels:
    app: aigo-agent
    region: "${region}"
spec:
  selector:
    matchLabels:
      app: aigo-agent
      region: "${region}"
  template:
    metadata:
      labels:
        app: aigo-agent
        region: "${region}"
    spec:
      nodeSelector:
        aigo-x/agent-region: "${region}"
      containers:
      - name: agent
        image: aigo-x/agent:1.0.0
        env:
        - name: CLOUD_API_ENDPOINT
          value: "${cloudApiEndpoint}"
        - name: AGENT_REGION
          value: "${region}"
        - name: AGENT_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        envFrom:
        - secretRef:
            name: agent-secrets-${region}
        volumeMounts:
        - name: evidence-storage
          mountPath: /data/evidence
        resources:
          requests:
            cpu: "100m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 9090
          initialDelaySeconds: 20
          periodSeconds: 30
      volumes:
      - name: evidence-storage
        hostPath:
          path: /data/aigo-evidence/${region}
          type: DirectoryOrCreate
      tolerations:
      - key: "node-role.kubernetes.io/control-plane"
        operator: "Exists"
        effect: "NoSchedule"
`).join("");

  return `# AIGO-X GRC Platform — Kubernetes Manifests: On-Premises Agent Nodes
# Generated: ${new Date().toISOString()}
# Regions: ${agentRegions.join(", ")}
# Apply: kubectl apply -f k8s-agents.yaml
# Note: Label each node — kubectl label node <name> aigo-x/agent-region=<region>

---
apiVersion: v1
kind: Namespace
metadata:
  name: aigo-agents
  labels:
    app.kubernetes.io/name: aigo-x-agents
${regionDeployments}`;
}

// ── Prometheus config ─────────────────────────────────────────────────────────
function buildPrometheusConfig(): string {
  return `# prometheus.yml — AIGO-X GRC Platform Monitoring
# Generated: ${new Date().toISOString()}
# Place at ./prometheus.yml

global:
  scrape_interval: 30s
  evaluation_interval: 30s
  external_labels:
    app: aigo-x-grc
    env: production

scrape_configs:
  - job_name: "api-server"
    static_configs:
      - targets: ["api:9091"]
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: "redis"
    static_configs:
      - targets: ["redis:6379"]

  - job_name: "node-exporter"
    static_configs:
      - targets: ["node-exporter:9100"]
`;
}

// ── On-prem Docker Compose ────────────────────────────────────────────────────
function buildComposeYaml(mode: string, orgName: string): string {
  const singleTenantExtras = mode === "single" ? `\n      ORG_NAME: \${ORG_NAME}\n      ADMIN_EMAIL: \${ADMIN_EMAIL}` : "";
  return `# AIGO-X GRC Platform — Docker Compose (On-Premises)
# Mode: ${mode === "single" ? "Single Tenant" : "Multi-Tenant"}  |  Org: ${orgName}
# Generated: ${new Date().toISOString()}

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"

  api:
    image: aigo-x/api-server:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: \${DATABASE_URL}
      JWT_SECRET: \${JWT_SECRET}
      TOKEN_ENCRYPTION_KEY: \${TOKEN_ENCRYPTION_KEY}
      OPENAI_API_KEY: \${OPENAI_API_KEY:-}
      DEPLOYMENT_TYPE: onprem
      TENANT_MODE: ${mode}
      NODE_ENV: production
      PORT: 8080${singleTenantExtras}
    ports:
      - "\${API_PORT:-8080}:8080"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8080/api/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

  web:
    image: aigo-x/grc-platform:1.0.0
    build:
      context: .
      dockerfile: Dockerfile.web
    environment:
      VITE_API_BASE_URL: http://api:8080
      TENANT_MODE: ${mode}
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:1.25-alpine
    ports:
      - "\${WEB_PORT:-443}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - web
      - api
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"

volumes:
  postgres_data:
    driver: local

networks:
  default:
    name: aigo_network
    driver: bridge
`;
}

export default router;

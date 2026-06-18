# AIGO-X GRC — On-Premises Deployment Runbook

## Architecture

```
Internet / Corporate Network
    │
    ▼
Nginx Reverse Proxy (port 443 / 80)
    │  /api/* → gateway:8080
    │  /*      → web:3000
    ▼
Docker Compose (single host or Swarm) / Kubernetes
    ├── gateway (8080)
    ├── auth-service    (8001)
    ├── risk-service    (8002)
    ├── compliance-service (8003)
    ├── governance-service (8004)
    ├── privacy-service    (8005)
    ├── evidence-service   (8006)
    ├── secops-service     (8007)
    ├── ai-service         (8008)
    ├── trust-service      (8009)
    ├── integration-service (8010)
    └── web (3000)
         │
         ├── PostgreSQL 16 (volume-backed)
         └── Redis 7       (volume-backed)
```

---

## Prerequisites

| Tool           | Version | Notes |
|----------------|---------|-------|
| Docker Engine  | ≥ 25    | With Compose plugin v2 |
| Docker Compose | ≥ 2.20  | `docker compose version` |
| openssl        | any     | For generating secrets |

For Kubernetes on-prem:

| Tool       | Version | Notes |
|------------|---------|-------|
| kubectl    | ≥ 1.29  | |
| Helm       | ≥ 3.12  | |
| k3s / RKE2 | latest  | Lightweight K8s for on-prem |

---

## Option A: Docker Compose (single host / VM)

### Step 1 — Clone and configure

```bash
git clone https://github.com/dufense/aigo-x-grc.git
cd aigo-x-grc

# Copy and fill in environment file
cp .env.example .env
```

Edit `.env`:

```dotenv
# Database
DATABASE_URL=postgresql://grc_user:STRONG_PASSWORD@postgres:5432/dufense_grc
POSTGRES_USER=grc_user
POSTGRES_PASSWORD=STRONG_PASSWORD       # min 24 chars, alphanumeric
POSTGRES_DB=dufense_grc

# Redis
REDIS_PASSWORD=STRONG_REDIS_PASSWORD    # min 24 chars

# Application
JWT_SECRET=$(openssl rand -hex 32)      # 64 hex chars
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 16)

# Optional
OPENAI_API_KEY=sk-...                   # leave empty to disable AI features
APP_VERSION=1.0.0
WEB_PORT=443
DEPLOYMENT_TYPE=onprem
TENANT_MODE=single                      # single | multi
```

### Step 2 — TLS certificate

```bash
# Option A: Let's Encrypt (requires public domain)
certbot certonly --standalone -d grc.example.com
cp /etc/letsencrypt/live/grc.example.com/fullchain.pem deploy/ssl/cert.pem
cp /etc/letsencrypt/live/grc.example.com/privkey.pem   deploy/ssl/key.pem

# Option B: Self-signed (internal/lab use)
mkdir -p deploy/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/ssl/key.pem \
  -out    deploy/ssl/cert.pem \
  -subj "/CN=grc.example.com"
```

Update `deploy/nginx.conf` if using a custom path.

### Step 3 — Build and start

```bash
# Pull pre-built images (requires registry access)
docker compose -f deploy/docker-compose.multi.yml pull

# OR build from source
docker compose -f deploy/docker-compose.multi.yml build

# Start all services
docker compose -f deploy/docker-compose.multi.yml up -d

# Verify
docker compose -f deploy/docker-compose.multi.yml ps
```

### Step 4 — Run database migrations

```bash
docker compose -f deploy/docker-compose.multi.yml exec \
  auth-service pnpm --filter @workspace/api-server db:push
```

### Step 5 — Verify

```bash
# Health check
curl -sk https://localhost/api/healthz

# View logs
docker compose -f deploy/docker-compose.multi.yml logs -f gateway

# Admin login
# URL: https://grc.example.com (or https://localhost)
# Email: admin@acme.com
# Password: (set in initial DB seed)
```

---

## Option B: Kubernetes (k3s / RKE2 / bare-metal)

### Step 1 — Install k3s

```bash
# Single-node (dev/staging)
curl -sfL https://get.k3s.io | sh -

# Multi-node HA (production)
# Follow: https://docs.k3s.io/installation/ha-embedded
```

### Step 2 — Configure Helm values for on-prem

```bash
# Copy and edit on-prem values (based on values.dev.yaml)
cp helm/aigo-x/values.dev.yaml helm/aigo-x/values.onprem.yaml
```

Key settings in `values.onprem.yaml`:

```yaml
secrets:
  create: true
  databaseUrl: "postgresql://grc_user:PASS@postgres:5432/dufense_grc"
  jwtSecret: "YOUR_64_CHAR_SECRET"
  redisPassword: "YOUR_REDIS_PASSWORD"
  postgresPassword: "YOUR_POSTGRES_PASSWORD"
  tokenEncryptionKey: "YOUR_32_CHAR_KEY"

gateway:
  ingress:
    host: "grc.example.com"
    tlsSecretName: aigo-x-tls

postgres:
  persistence:
    enabled: true
    storageClass: "local-path"   # k3s default; or "longhorn", "openebs"
    size: 50Gi

redis:
  persistence:
    enabled: true
    storageClass: "local-path"
    size: 4Gi
```

### Step 3 — Create TLS secret

```bash
kubectl create secret tls aigo-x-tls \
  --cert=deploy/ssl/cert.pem \
  --key=deploy/ssl/key.pem \
  --namespace aigo-x
```

### Step 4 — Deploy

```bash
helm upgrade --install aigo-x helm/aigo-x \
  -f helm/aigo-x/values.onprem.yaml \
  --namespace aigo-x --create-namespace \
  --wait --timeout 10m
```

### Step 5 — Verify

```bash
kubectl get pods -n aigo-x
kubectl get svc  -n aigo-x
kubectl logs -n aigo-x -l app=gateway --tail=50
```

---

## Maintenance

### Backup PostgreSQL (Docker Compose)

```bash
docker compose -f deploy/docker-compose.multi.yml exec postgres \
  pg_dump -U grc_user dufense_grc | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore PostgreSQL

```bash
gunzip -c backup_20250101.sql.gz | \
  docker compose -f deploy/docker-compose.multi.yml exec -T postgres \
  psql -U grc_user dufense_grc
```

### Rotate secrets

1. Generate new secret values.
2. Update `.env` (Docker Compose) or Helm values + Kubernetes Secret.
3. Restart all services:
   ```bash
   docker compose -f deploy/docker-compose.multi.yml restart
   # or
   kubectl rollout restart deployment -n aigo-x
   ```

### Update to a new version

```bash
# Docker Compose
APP_VERSION=1.2.3 docker compose -f deploy/docker-compose.multi.yml pull
APP_VERSION=1.2.3 docker compose -f deploy/docker-compose.multi.yml up -d

# Helm / Kubernetes
helm upgrade aigo-x helm/aigo-x \
  -f helm/aigo-x/values.onprem.yaml \
  --set gateway.image.tag=1.2.3 \
  --set web.image.tag=1.2.3 \
  --namespace aigo-x --wait
```

---

## Air-gapped / Offline Installation

For environments without internet access:

```bash
# On a machine with internet access:
docker save \
  dufense/gateway:1.0.0 \
  dufense/auth-service:1.0.0 \
  dufense/web:1.0.0 \
  ... \
  | gzip > aigo-x-1.0.0-images.tar.gz

# Transfer to air-gapped host, then:
docker load < aigo-x-1.0.0-images.tar.gz
docker compose -f deploy/docker-compose.multi.yml up -d
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `connection refused` on PostgreSQL | DB not ready | Check `docker compose ps postgres` |
| Redis AUTH failed | Wrong `REDIS_PASSWORD` | Verify `.env` value matches running container |
| Gateway 502 | Domain service not healthy | `docker compose logs <service>` |
| Cannot pull images | No registry access | Use `docker save`/`docker load` for air-gap |
| Nginx 502 | Web/gateway containers not started | Check `depends_on` health checks |
| JWT errors | Secret mismatch after restart | Ensure JWT_SECRET is unchanged |

---

## Minimum Hardware Requirements

| Environment | CPU | RAM | Storage |
|-------------|-----|-----|---------|
| Dev/Trial   | 4 vCPU | 8 GB | 40 GB |
| Staging     | 8 vCPU | 16 GB | 100 GB |
| Production  | 16 vCPU | 32 GB | 500 GB (SSD) |

For production, use separate hosts for database and application tiers.

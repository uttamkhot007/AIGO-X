# api-server — Migrated to Microservices

> **Status: Deprecated for production. Use the API gateway + domain services instead.**

This monolithic Express server has been split into 10 independent domain microservices,
each running on its own port, behind an API gateway.

## New architecture

```
nginx (:443)
  └── gateway (:8080)          — http-proxy-middleware routes by path prefix
        ├── auth-service        (:8001) — /api/auth  /api/users  /api/tenants
        ├── risk-service        (:8002) — /api/risks  /api/riskmap  /api/dashboard
        ├── compliance-service  (:8003) — /api/compliance  /api/maturity  /api/frameworks
        ├── governance-service  (:8004) — /api/governance  /api/audit  /api/ad-auditor
        ├── privacy-service     (:8005) — /api/privacy  /api/privacy-program
        ├── evidence-service    (:8006) — /api/evidence  /api/evidence-engine
        ├── secops-service      (:8007) — /api/security  /api/sspm  /api/cspm  /api/dspm
        ├── ai-service          (:8008) — /api/ai  /api/ai-engines  /api/tickets
        ├── trust-service       (:8009) — /api/trust-center  /api/portals
        └── integration-service (:8010) — /api/integration-hub  /api/mcp
```

## Start the stack

```bash
# From the repo root
cp deploy/.env.example deploy/.env   # fill in secrets
docker compose -f deploy/docker-compose.multi.yml up -d
```

## Development

During local Replit development, the monolith in this folder (`artifacts/api-server`)
continues to run for convenience — it provides the full API without Docker.

For production deployments, the canonical path is `docker-compose.multi.yml` which
starts all microservices and the gateway instead.

## Files

| Location | Purpose |
|---|---|
| `gateway/` | API gateway (routes requests to services) |
| `services/<name>-service/` | Individual domain services |
| `packages/service-kit/` | Shared utilities (auth, db, logger, ServiceClient) |
| `deploy/docker-compose.multi.yml` | Production deployment manifest |
| `deploy/nginx.conf` | Nginx config (points `/api/` to gateway) |

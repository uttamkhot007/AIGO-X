# AIGO-X GRC — GCP Deployment

Deploy AIGO-X GRC to **GKE Autopilot** with Cloud SQL PostgreSQL, Memorystore Redis, Artifact Registry, and Cloud Load Balancing — all managed by Google.

## Quick Start

```bash
# 1. Authenticate to GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# 2. Configure your deployment
cp .env.example .env && source .env

# 3. Provision infrastructure + build images + Helm deploy (first time: ~35 min)
GCP_PROJECT_ID=my-project ./deploy.sh \
  --env prod --project my-project --version 1.0.0

# 4. Update secrets (CHANGEME placeholders → real values)
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets versions add aigo-x-prod-jwt-secret --data-file=- \
  --project my-project

echo -n "sk-..." | \
  gcloud secrets versions add aigo-x-prod-openai-api-key --data-file=- \
  --project my-project
```

## What Gets Created

| Resource | Details |
|----------|---------|
| VPC | Custom VPC with secondary ranges for pods/services, Cloud NAT |
| Private Service Access | VPC peering for Cloud SQL + Memorystore private IPs |
| GKE Autopilot | Private nodes, Workload Identity, Managed Prometheus, Binary Auth |
| Artifact Registry | Single repo `aigo-x-{env}` for all 12 service images |
| Cloud SQL PostgreSQL 16 | Regional HA, 100 GB SSD, query insights, private IP only |
| Memorystore Redis 7 | Standard HA, AUTH + TLS, private IP only |
| Secret Manager | 5 secrets (jwt, token key, openai, db-password, redis-auth) |
| Workload Identity SA | GCP SA bound to K8s SA for secretless pod authentication |
| Certificate Manager | Managed TLS cert + cert map for GKE Gateway |
| Global External IP | Static IP for Cloud Load Balancer |

## Subsequent Deploys (image update only)

```bash
GKE_CLUSTER_NAME=aigo-x-prod-gke \
GCP_PROJECT_ID=my-project \
IMAGE_TAG=1.2.3 ./deploy.sh \
  --env prod --project my-project --version 1.2.3 --helm-only
```

## Terraform Modules

```
terraform/modules/
  vpc/               — VPC, subnet (with pod/service secondary ranges), Cloud NAT,
                       Private Services Access peering, firewall rules
  artifact-registry/ — Single Docker repository for all service images
  secret-manager/    — App-level secrets (jwt, token key, openai)
  cloudsql/          — Cloud SQL PostgreSQL 16 + db-password secret
  memorystore/       — Memorystore Redis 7 + redis-auth secret
  iam/               — Workload Identity SA + unified secret access grants
  gke/               — GKE Autopilot cluster (private, Workload Identity)
  load-balancing/    — Global IP + Certificate Manager cert map +
                       GKE Gateway/HTTPRoute config (apply via kubectl)
```

## Security Notes

- **GKE API server access** is restricted to `gke_master_authorized_cidr` (default `10.0.0.0/8`). Set this to your corporate VPN or bastion CIDR:
  ```bash
  TF_VAR_gke_master_authorized_cidr=203.0.113.0/24 ./deploy.sh ...
  ```
- **Secrets** use Workload Identity — no static credentials in pods.
- **Cloud SQL** and **Memorystore** are private-IP only.

## Full Documentation

See [`docs/deployment/gcp.md`](../docs/deployment/gcp.md) for:
- Step-by-step setup guide including Workload Identity binding
- GKE Gateway + HTTPRoute kubectl commands
- Secret rotation procedure
- Monitoring with Cloud Logging
- Troubleshooting guide
- Cost estimate (~$600/month)

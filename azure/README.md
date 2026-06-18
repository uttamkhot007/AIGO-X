# AIGO-X GRC — Azure Deployment

Deploy AIGO-X GRC to **Azure Kubernetes Service (AKS)** with Azure Database for PostgreSQL Flexible Server, Azure Cache for Redis, Azure Container Registry, and Application Gateway.

## Quick Start

```bash
# 1. Authenticate to Azure
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# 2. Configure your deployment
cp .env.example .env && source .env

# 3. Provision infrastructure + build images + Helm deploy (first time: ~30 min)
./deploy.sh --env prod --version 1.0.0

# 4. Set your real secrets in Key Vault
KV="aigo-x-prod-kv"
az keyvault secret set --vault-name "$KV" --name jwt-secret \
  --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name "$KV" --name openai-api-key \
  --value "sk-..."
```

## What Gets Created

| Resource | Details |
|----------|---------|
| Resource Group | Single RG for all resources |
| Virtual Network | VNet with AKS, App Gateway, and DB subnets |
| AKS Cluster | System + workload node pools, autoscaler (2–10 nodes) |
| ACR | Standard tier; AKS granted AcrPull |
| Azure Key Vault | RBAC mode, CSI driver integration for pod secret injection |
| PostgreSQL Flexible | Zone Redundant HA, 100 GB, backup 14 days |
| Azure Cache for Redis | Standard C1, SSL-only |
| Application Gateway | v2 with autoscale, `/api/*` path routing |

## Subsequent Deploys (image update only)

```bash
AZURE_ACR_NAME=aigoxprodacr \
AZURE_RESOURCE_GROUP=aigo-x-prod-rg \
AZURE_AKS_NAME=aigo-x-prod-aks \
IMAGE_TAG=1.2.3 ./deploy.sh --env prod --version 1.2.3 --helm-only
```

## Terraform Modules

```
terraform/modules/
  resource-group/  — Resource group
  networking/      — VNet, subnets, Private DNS zone (PostgreSQL)
  acr/             — Azure Container Registry
  keyvault/        — Key Vault + initial secret placeholders
  postgres/        — PostgreSQL Flexible Server
  redis/           — Azure Cache for Redis
  aks/             — AKS cluster, node pools, Log Analytics
  app-gateway/     — Application Gateway v2
```

## Helm Integration

Azure uses the Helm charts from `helm/aigo-x/` (created in the K8s task).
The `values.prod.yaml` is applied with `--set` overrides for the ACR registry URL.

## Full Documentation

See [`docs/deployment/azure.md`](../docs/deployment/azure.md) for:
- Step-by-step setup guide
- Key Vault CSI SecretProviderClass configuration
- DNS / TLS with Application Gateway
- Monitoring and log commands
- Troubleshooting guide
- Cost estimate (~$640/month)

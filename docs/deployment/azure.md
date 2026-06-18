# AIGO-X GRC — Azure Deployment Runbook

## Architecture

```
Internet
    │
    ▼
Application Gateway v2 (public IP, WAF optional)
    │  /api/* → AKS gateway service
    │  /*      → AKS web service
    ▼
AKS Cluster (azure CNI, private nodes)
    ├── System node pool (Standard_D4s_v3 × 2)
    └── Workload node pool (Standard_D4s_v3, autoscale 2–10)
         │
         ├── AIGO-X Helm release (aigo-x namespace)
         │    ├── gateway (8080), auth (8001), risk (8002) …
         │    └── web (80)
         ├── Azure Database for PostgreSQL Flexible Server (Zone Redundant HA)
         ├── Azure Cache for Redis (Standard C1, SSL)
         └── Azure Container Registry (Standard)
```

All secrets reside in **Azure Key Vault** and are surfaced to pods via the **Key Vault Secrets Provider** CSI driver — no secrets in Kubernetes Secrets or environment variables.

---

## Prerequisites

| Tool       | Version | Install |
|------------|---------|---------|
| Azure CLI  | ≥ 2.57  | `brew install azure-cli` |
| Terraform  | ≥ 1.5   | `brew install terraform` |
| kubectl    | ≥ 1.29  | `brew install kubectl` |
| Helm       | ≥ 3.12  | `brew install helm` |
| Docker     | ≥ 24    | `brew install --cask docker` |

### Required Azure roles

The deploying identity needs (at subscription or resource group level):

```
Contributor
Key Vault Administrator (resource group)
AcrPush (ACR)
```

---

## Step 1 — Authenticate to Azure

```bash
az login

# For CI/CD with a service principal:
az login --service-principal \
  --username "$ARM_CLIENT_ID" \
  --password "$ARM_CLIENT_SECRET" \
  --tenant "$ARM_TENANT_ID"

az account set --subscription "$ARM_SUBSCRIPTION_ID"
```

---

## Step 2 — Configure deployment variables

```bash
cp azure/.env.example azure/.env
# Edit azure/.env: set subscription ID, tenant ID, domain name, etc.
source azure/.env
```

---

## Step 3 — Provision infrastructure

```bash
# Plan (no changes made)
./azure/deploy.sh --env prod --version 1.0.0 --plan

# Apply (provisions VNet, AKS, PostgreSQL, Redis, ACR, Key Vault, App Gateway)
./azure/deploy.sh --env prod --version 1.0.0
```

Expected duration: **20–35 minutes** (AKS provisioning dominates).

---

## Step 4 — Update Key Vault secrets

After first deploy, set real secret values:

```bash
KV_NAME="aigo-x-prod-kv"   # from: terraform output keyvault_uri

az keyvault secret set --vault-name "$KV_NAME" \
  --name jwt-secret --value "$(openssl rand -hex 32)"

az keyvault secret set --vault-name "$KV_NAME" \
  --name token-encryption-key --value "$(openssl rand -hex 16)"

az keyvault secret set --vault-name "$KV_NAME" \
  --name openai-api-key --value "$OPENAI_API_KEY"
```

---

## Step 5 — Configure Key Vault CSI in Kubernetes

After AKS is ready, create the `SecretProviderClass` to sync Key Vault secrets into pods:

```bash
# Get Key Vault details from Terraform
KV_NAME="$(cd azure/terraform && terraform output -raw keyvault_uri | awk -F/ '{print $3}' | cut -d. -f1)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
CLIENT_ID="$(kubectl get sa aigo-x-workload-sa -n aigo-x -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}')"

cat <<EOF | kubectl apply -f -
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aigo-x-keyvault
  namespace: aigo-x
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "false"
    clientID: "$CLIENT_ID"
    keyvaultName: "$KV_NAME"
    tenantId: "$TENANT_ID"
    objects: |
      array:
        - |
          objectName: jwt-secret
          objectType: secret
        - |
          objectName: db-password
          objectType: secret
        - |
          objectName: redis-access-key
          objectType: secret
        - |
          objectName: token-encryption-key
          objectType: secret
        - |
          objectName: openai-api-key
          objectType: secret
  secretObjects:
    - secretName: aigo-x-secrets
      type: Opaque
      data:
        - key: JWT_SECRET
          objectName: jwt-secret
        - key: DB_PASSWORD
          objectName: db-password
        - key: REDIS_PASSWORD
          objectName: redis-access-key
        - key: TOKEN_ENCRYPTION_KEY
          objectName: token-encryption-key
        - key: OPENAI_API_KEY
          objectName: openai-api-key
EOF
```

---

## Step 6 — Deploy Helm chart

```bash
# Images are pushed and Helm is deployed automatically by deploy.sh.
# For subsequent image-only updates:
AZURE_ACR_NAME=aigoxprodacr \
AZURE_RESOURCE_GROUP=aigo-x-prod-rg \
AZURE_AKS_NAME=aigo-x-prod-aks \
IMAGE_TAG=1.2.3 ./azure/deploy.sh --env prod --version 1.2.3 --helm-only
```

---

## DNS / TLS Setup

1. Point your domain's A record to the App Gateway public IP:
   ```bash
   cd azure/terraform && terraform output app_gateway_public_ip
   ```
2. To enable TLS, install `cert-manager` + the AGIC ingress controller, or upload a PFX cert to the Application Gateway via:
   ```bash
   az network application-gateway ssl-cert create \
     --gateway-name aigo-x-prod-appgw \
     --resource-group aigo-x-prod-rg \
     --name aigo-x-tls \
     --cert-file ./cert.pfx \
     --cert-password "$CERT_PASSWORD"
   ```

---

## Monitoring & Logs

```bash
# Get AKS credentials
az aks get-credentials --resource-group aigo-x-prod-rg --name aigo-x-prod-aks

# Pod status
kubectl get pods -n aigo-x

# Logs
kubectl logs -n aigo-x -l app=gateway --tail=100 -f

# Azure Monitor
az monitor log-analytics query \
  --workspace "$(cd azure/terraform && terraform output -json | jq -r '.log_analytics_workspace_id.value')" \
  --analytics-query "ContainerLogV2 | where ContainerName == 'gateway' | take 50"
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Pods in `ContainerCreating` | CSI driver not ready | Check `kubectl describe pod` for volume errors |
| Key Vault 403 | Missing Key Vault role | Add `Key Vault Secrets User` to workload MSI |
| Image pull failure | AcrPull not assigned | Re-run `terraform apply` to fix RBAC |
| App Gateway 502 | AKS pods not ready | Check pod health with `kubectl get pods -n aigo-x` |
| PostgreSQL connection refused | VNet delegation | Ensure subnet has `Microsoft.DBforPostgreSQL/flexibleServers` delegation |

---

## Cost Estimate (East US, prod)

| Resource | Config | Est. monthly |
|----------|--------|-------------|
| AKS (system 2 × D4s_v3 + workload 2–10 × D4s_v3) | | ~$350 |
| Azure DB for PostgreSQL Flexible (GP D2s, 100 GB) | Zone Redundant HA | ~$180 |
| Azure Cache for Redis (Standard C1) | | ~$55 |
| Azure Container Registry (Standard) | | ~$20 |
| Application Gateway v2 | | ~$30 |
| Key Vault | | ~$5 |
| **Total** | | **~$640/mo** |

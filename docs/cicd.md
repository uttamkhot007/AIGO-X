# CI/CD Pipeline — Configuration & Usage Guide

The AIGO-X GRC platform uses GitHub Actions for continuous integration and
deployment. This document explains how to configure secrets for each cloud,
how to trigger deploys, and how to add a new deployment target.

---

## Overview of Workflows

| Workflow | File | Trigger |
|---|---|---|
| CI checks | `ci.yml` | Every PR + push to `main` |
| Build & push images | `build.yml` | Push to `main` |
| Deploy to AWS ECS | `deploy-aws.yml` | Manual / `release/*` push |
| Deploy to Azure AKS | `deploy-azure.yml` | Manual / `release/*` push |
| Deploy to GCP GKE | `deploy-gcp.yml` | Manual / `release/*` push |
| Deploy on-premises | `deploy-onprem.yml` | Manual only |

---

## CI (`ci.yml`)

Runs on every pull request and push to `main`. Fails fast on any error.

**Jobs:**
- **Typecheck** — Runs `pnpm typecheck` for all 13 TypeScript packages in parallel
- **Frontend build** — Runs `pnpm build` for the React frontend; uploads `dist/` as an artifact
- **Tests** — Runs `pnpm test` for the API server and core services against a real Postgres instance
- **CI gate** — Aggregates all results; required as a branch protection status check

**No secrets required** for CI — it uses `GITHUB_TOKEN` only.

**Branch protection setup:**

In your repo settings → Branches → Branch protection rules for `main`:
- Require status checks: `CI gate`
- Require branches to be up to date
- Restrict pushes (optional)

---

## Build & Push (`build.yml`)

Runs on every push to `main` and builds Docker images for all 12 services in parallel
using a matrix strategy with layer caching via GitHub Actions cache.

### Configuring the container registry

Set the **repository variable** `REGISTRY_PROVIDER` (Settings → Secrets & Variables → Variables):

| Value | Registry | Required secrets |
|---|---|---|
| `ghcr` (default) | GitHub Container Registry | None — uses `GITHUB_TOKEN` |
| `ecr` | AWS ECR | `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_ACCOUNT_ID` |
| `acr` | Azure Container Registry | `AZURE_ACR_NAME`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| `gcr` | GCP Artifact Registry | `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_REGION` |

**Image tag:** By default the image is tagged with the full git SHA (`github.sha`).
You can override this by triggering the workflow manually and supplying a version string.

**Image names follow the pattern:**
```
<registry-url>/<service-name>:<tag>
<registry-url>/<service-name>:latest
```

Where `<service-name>` is one of:
`gateway`, `auth-service`, `risk-service`, `compliance-service`, `governance-service`,
`privacy-service`, `evidence-service`, `secops-service`, `ai-service`, `trust-service`,
`integration-service`, `web`

---

## Deploy to AWS ECS (`deploy-aws.yml`)

### Authentication — OIDC (no long-lived keys)

1. Create an IAM Role with a trust policy that allows GitHub Actions OIDC:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:environment:prod"
      }
    }
  }]
}
```

2. Attach policies: `AmazonECS_FullAccess`, `AmazonEC2ContainerRegistryPowerUser`,
   `AmazonSSMFullAccess` (for ECS exec).

### Required GitHub secrets (in the `prod` environment)

| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | IAM role ARN to assume via OIDC |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `AWS_ACCOUNT_ID` | 12-digit AWS account ID (needed for ECR URL) |

### Triggering a deploy

**Manual deploy via GitHub UI:**

1. Go to Actions → "Deploy — AWS ECS"
2. Click "Run workflow"
3. Choose environment (`prod`, `staging`, `dev`)
4. Optionally specify an image tag
5. Optionally check "services only" to skip Terraform (faster for image-only updates)

**Automatic deploy on release:**

Create a branch named `release/1.2.3`. On push, the workflow triggers automatically
using the `prod` environment.

**Via `aigo-x` CLI:**
```bash
aigo-x deploy --cloud aws --env prod --version 1.2.3
```

### DB migrations

Before rolling out new images, the workflow attempts to run migrations via ECS exec
into the running gateway container. If ECS exec is unavailable, run migrations manually:

```bash
# Via ECS exec
aws ecs execute-command \
  --cluster aigo-x-prod-cluster \
  --task <TASK_ARN> \
  --container gateway \
  --command "psql \$DATABASE_URL -f /app/lib/db/migrations/0001_init.sql" \
  --interactive

# Or via a one-shot ECS task
aws ecs run-task \
  --cluster aigo-x-prod-cluster \
  --task-definition aigo-x-prod-migration \
  --launch-type FARGATE \
  ...
```

---

## Deploy to Azure AKS (`deploy-azure.yml`)

### Authentication — Azure Workload Identity (OIDC)

1. Create an App Registration in Azure AD → note the **Client ID** and **Tenant ID**
2. Create a Federated Credential on the App Registration:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:<ORG>/<REPO>:environment:prod`
   - Audience: `api://AzureADTokenExchange`
3. Assign the App Registration **Contributor** role on your subscription (or resource group)
4. Grant **AcrPush** on your ACR and **Azure Kubernetes Service Cluster User Role** on AKS

### Required GitHub secrets (in the `prod` environment)

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | App Registration client ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_ACR_NAME` | ACR name without `.azurecr.io` suffix |
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `AZURE_AKS_NAME` | AKS cluster name |
| `AZURE_POSTGRES_FQDN` | Managed Postgres FQDN (for `--helm-only`) |
| `AZURE_REDIS_HOSTNAME` | Redis hostname (for `--helm-only`) |
| `AZURE_KEYVAULT_URI` | Key Vault URI (for `--helm-only`) |
| `AZURE_LOCATION` | Azure region (e.g. `eastus`) |

---

## Deploy to GCP GKE (`deploy-gcp.yml`)

### Authentication — Workload Identity Federation

1. Create a Workload Identity Pool and Provider in GCP IAM:
   ```bash
   gcloud iam workload-identity-pools create github-actions \
     --project=<PROJECT_ID> --location=global \
     --display-name="GitHub Actions"

   gcloud iam workload-identity-pools providers create-oidc github \
     --project=<PROJECT_ID> --location=global \
     --workload-identity-pool=github-actions \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"
   ```

2. Bind the provider to a Service Account:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     deploy-sa@<PROJECT_ID>.iam.gserviceaccount.com \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions/attribute.repository/<ORG>/<REPO>"
   ```

3. Grant roles to the Service Account:
   - `roles/container.developer` (GKE)
   - `roles/artifactregistry.writer`
   - `roles/secretmanager.secretAccessor`

### Required GitHub secrets (in the `prod` environment)

| Secret | Description |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name |
| `GCP_SERVICE_ACCOUNT` | Deploy SA email (`deploy-sa@project.iam.gserviceaccount.com`) |
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_REGION` | GCP region (e.g. `us-central1`) |

---

## Deploy On-Premises (`deploy-onprem.yml`)

Deploys to bare-metal or VM servers using SSH + Docker Compose.

### Setup

1. Create a **GitHub Environment** named `onprem-prod` (and optionally `onprem-staging`)
2. Add the following secrets to each environment:

| Secret | Description |
|---|---|
| `ONPREM_HOST` | Server hostname or IP |
| `ONPREM_USER` | SSH username (e.g. `deployer`) |
| `ONPREM_SSH_KEY` | Private SSH key (PEM format) |
| `ONPREM_PORT` | SSH port (default: `22`) |
| `ONPREM_DEPLOY_PATH` | Deployment directory (default: `/opt/dufense`) |

3. Ensure the deploy user has permission to run `docker compose` without sudo, or add
   them to the `docker` group:
   ```bash
   sudo usermod -aG docker deployer
   ```

4. Pre-stage secrets in `/opt/dufense/.env` on the server (not committed to Git):
   ```bash
   DATABASE_URL=postgresql://...
   JWT_SECRET=...
   REDIS_URL=redis://...
   ```

### Triggering a deploy

Via GitHub UI → Actions → "Deploy — On-Premises" → Run workflow.

Or to update a single service:
- Set the **services** input to `gateway` (or `auth-service,risk-service` for multiple)

For an air-gapped server, images must be pre-loaded. Set `SKIP_PULL=true` in the
server's environment or load images manually:
```bash
docker load < aigo-x-auth-service-1.2.3.tar.gz
```

---

## GitHub Environments — Production Approval Gate

For production deploys you can require a manual approval step:

1. Go to Settings → Environments → Create environment `prod`
2. Enable **Required reviewers** and add your release managers
3. The deploy job will pause and wait for approval before executing

This provides a hard gate: CI must pass → build must succeed → approver clicks
"Approve and deploy" before any production changes go out.

---

## Adding a New Deployment Target

To add a new cloud or region:

1. Create `.github/workflows/deploy-<target>.yml` following the pattern of an existing
   deploy workflow
2. Add the required secrets to the new GitHub Environment
3. Create a deploy script at `<cloud>/deploy.sh` (or reuse an existing one with different env vars)
4. Update this doc and `docs/cli.md` to reflect the new target

---

## Troubleshooting

**`Error: credentials file not found`** — The OIDC trust relationship is misconfigured.
Check that the `sub` claim in your federated credential matches the environment name exactly.

**`Error: image not found in registry`** — The build workflow did not complete before
the deploy triggered. Check the build workflow status and ensure `build.yml` ran on
the `main` branch with the expected image tag.

**`Migration step skipped / pod not found`** — On first deploy there are no running pods
to exec into. Apply migrations manually before starting services, or use a Kubernetes Job.

**Build cache miss (slow builds)** — GitHub Actions cache is scoped per branch. First
builds on a new branch will be slower. Caches are automatically evicted after 7 days of
inactivity.

**On-prem: `docker compose` command not found`** — Install the Compose plugin:
```bash
sudo apt-get install docker-compose-plugin
```
Or update Docker Engine to v20.10+.

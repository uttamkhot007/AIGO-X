# AIGO-X GRC — AWS Deployment Runbook

## Architecture

```
Internet
    │
    ▼
Application Load Balancer (public subnets, 3 AZs)
    │  /api/* → Gateway Target Group
    │  /*      → Web Target Group
    ▼
ECS Fargate (private subnets, Fargate, Cloud Map service discovery)
    ├── gateway (port 8080)    ← proxy to all domain services
    ├── auth    (port 8001)
    ├── risk    (port 8002)
    ├── compliance (port 8003)
    ├── governance (port 8004)
    ├── privacy    (port 8005)
    ├── evidence   (port 8006)
    ├── secops     (port 8007)
    ├── ai         (port 8008)
    ├── trust      (port 8009)
    ├── integration (port 8010)
    └── web        (port 3000)
         │
         ├── RDS PostgreSQL 16 (Multi-AZ, private subnet)
         ├── ElastiCache Redis 7 (TLS + AUTH, private subnet)
         └── ECR (image registry, 12 repositories)
```

Secrets are stored in **AWS Secrets Manager** and injected into ECS tasks via `secretsFrom` — never in environment variables or config files.

---

## Prerequisites

| Tool        | Version   | Install                                     |
|-------------|-----------|---------------------------------------------|
| AWS CLI     | ≥ 2.13    | `brew install awscli`                       |
| Terraform   | ≥ 1.5     | `brew install terraform`                    |
| Docker      | ≥ 24      | `brew install --cask docker`                |
| jq          | any       | `brew install jq`                           |

### IAM Permissions

The deploying IAM entity needs:

```
ecs:*, ecr:*, rds:*, elasticache:*, elasticloadbalancing:*,
ec2:*, iam:*, secretsmanager:*, servicediscovery:*,
logs:*, autoscaling:*, application-autoscaling:*,
s3:* (ALB access log bucket)
```

Use an IAM role attached to your CI runner, or an IAM user for local deployments.

---

## Step 1 — Configure AWS credentials

```bash
# Option A: SSO (recommended)
aws configure sso
aws sso login --profile aigo-x-prod

# Option B: IAM user keys
aws configure --profile aigo-x-prod
export AWS_PROFILE=aigo-x-prod
```

---

## Step 2 — Configure deployment variables

```bash
cp aws/.env.example aws/.env
# Edit aws/.env with your region, environment, etc.
source aws/.env
```

---

## Step 3 — First-time infrastructure provisioning

```bash
# Plan first (recommended)
./aws/deploy.sh --env prod --version 1.0.0 --plan

# Apply (provisions VPC, RDS, Redis, ECR, ECS, ALB, Secrets Manager)
./aws/deploy.sh --env prod --version 1.0.0
```

Expected duration: **15–25 minutes** for first deploy.

---

## Step 4 — Update secrets

After first deploy, set real secret values in Secrets Manager:

```bash
# Get the secret ARN from Terraform output
SECRET_ARN="$(cd aws/terraform && terraform output -raw secrets_bundle_arn)"

# Update with your actual secrets
aws secretsmanager update-secret \
  --secret-id "$SECRET_ARN" \
  --secret-string "$(jq -n \
    --arg jwt "$(openssl rand -hex 32)" \
    --arg key "$(openssl rand -hex 16)" \
    --arg openai "$OPENAI_API_KEY" \
    '{JWT_SECRET: $jwt, TOKEN_ENCRYPTION_KEY: $key, OPENAI_API_KEY: $openai}')"
```

---

## Step 5 — Subsequent deployments (image update only)

```bash
# Build+push+redeploy without re-running Terraform
IMAGE_TAG=1.2.3 ./aws/deploy.sh --env prod --version 1.2.3 --services-only
```

---

## DNS / TLS Setup

1. Create an ACM certificate in the same region:
   ```bash
   aws acm request-certificate \
     --domain-name grc.example.com \
     --validation-method DNS \
     --region us-east-1
   ```
2. Add the CNAME validation record in your DNS provider.
3. Pass the certificate ARN to Terraform:
   ```bash
   TF_VAR_domain_name=grc.example.com
   TF_VAR_acm_certificate_arn=arn:aws:acm:us-east-1:123456789:certificate/...
   terraform apply
   ```
4. Create a Route 53 alias record (or CNAME) pointing to the ALB DNS name:
   ```bash
   cd aws/terraform && terraform output alb_dns_name
   ```

---

## Monitoring & Logs

```bash
# View logs for a service
aws logs tail /ecs/aigo-x-prod/gateway --follow --region us-east-1

# Check ECS service health
aws ecs describe-services \
  --cluster aigo-x-prod-cluster \
  --services aigo-x-prod-gateway \
  --region us-east-1 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'

# Check RDS performance insights
aws rds describe-db-instances \
  --db-instance-identifier aigo-x-prod-postgres \
  --query 'DBInstances[0].{status:DBInstanceStatus,endpoint:Endpoint.Address}'
```

---

## Scaling

Auto Scaling is configured on all ECS services (CPU 70% / Memory 80%). To adjust:

```bash
# Change min/max manually
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/aigo-x-prod-cluster/aigo-x-prod-gateway \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 3 --max-capacity 20
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Tasks failing to start | Secrets Manager access | Check task execution role |
| ALB 502 | ECS tasks starting | Wait for health checks (60s) |
| DB connection refused | Security group | Verify RDS SG allows ECS SG on 5432 |
| ECR pull failure | Missing execution role policy | Check `AmazonECSTaskExecutionRolePolicy` |
| `ResourceAlreadyExists` | Previous partial deploy | Import existing resource or rename |

---

## Rollback

```bash
# Roll back a service to the previous task definition
CLUSTER=aigo-x-prod-cluster
SERVICE=aigo-x-prod-gateway

PREV_TD="$(aws ecs describe-services \
  --cluster $CLUSTER --services $SERVICE \
  --query 'services[0].taskDefinition' --output text | sed 's/:[0-9]*$//')"

aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition "${PREV_TD}:$(( $(aws ecs list-task-definitions \
    --family-prefix aigo-x-prod-gateway --query 'length(taskDefinitionArns)' \
    --output text) - 1 ))"
```

---

## Cost Estimate (us-east-1, prod)

| Resource | Config | Est. monthly |
|----------|--------|-------------|
| ECS Fargate (12 svc × 0.5 vCPU / 1 GB × 2 tasks) | | ~$200 |
| RDS PostgreSQL Multi-AZ db.t3.medium | 100 GB gp3 | ~$130 |
| ElastiCache Redis cache.t3.small | 1 node | ~$25 |
| ALB | | ~$20 |
| ECR | 12 repos | ~$5 |
| NAT Gateway (3 AZs) | | ~$100 |
| **Total** | | **~$480/mo** |

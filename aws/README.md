# AIGO-X GRC — AWS Deployment

Deploy AIGO-X GRC to **AWS ECS Fargate** with RDS PostgreSQL, ElastiCache Redis, and an Application Load Balancer.

## Quick Start

```bash
# 1. Set up AWS credentials
aws configure --profile aigo-x-prod
export AWS_PROFILE=aigo-x-prod

# 2. Configure your deployment
cp .env.example .env && source .env

# 3. Provision infrastructure + build images + deploy (first time: ~20 min)
./deploy.sh --env prod --version 1.0.0

# 4. Set your real secrets (auto-generated placeholders need updating)
aws secretsmanager update-secret \
  --secret-id aigo-x-prod/app-secrets \
  --secret-string '{"JWT_SECRET":"<64 hex chars>","OPENAI_API_KEY":"sk-..."}'
```

## What Gets Created

| Resource | Details |
|----------|---------|
| VPC | 3-AZ, public + private subnets, NAT gateways, VPC endpoints |
| ECR | 12 repositories (gateway + 10 domain services + web) |
| ECS Fargate | 12 services with Cloud Map service discovery + auto scaling |
| ALB | `/api/*` → gateway, `/*` → web; HTTPS with ACM cert |
| RDS PostgreSQL 16 | Multi-AZ, gp3, Performance Insights |
| ElastiCache Redis 7 | TLS + AUTH token replication group |
| Secrets Manager | All secrets in a JSON bundle, auto-generated on first deploy |
| IAM | Task execution role (ECR + Secrets Manager) + task role |

## Subsequent Deploys (image update only)

```bash
IMAGE_TAG=1.2.3 ./deploy.sh --env prod --version 1.2.3 --services-only
```

## Terraform Modules

```
terraform/modules/
  vpc/          — VPC, subnets, security groups, VPC endpoints
  ecr/          — ECR repos with lifecycle policies
  iam/          — ECS task execution + task roles
  secrets/      — Secrets Manager secret bundle
  rds/          — RDS PostgreSQL 16
  elasticache/  — ElastiCache Redis 7 (TLS, AUTH)
  alb/          — ALB, target groups, listener rules
  ecs/          — ECS cluster, task definitions, services, auto scaling
```

## Full Documentation

See [`docs/deployment/aws.md`](../docs/deployment/aws.md) for:
- Step-by-step setup guide
- DNS / TLS configuration
- Monitoring and log commands
- Rollback procedure
- Cost estimate (~$480/month)

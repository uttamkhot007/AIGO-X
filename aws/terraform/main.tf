locals {
  name_prefix = "${var.project_name}-${var.environment}"

  services = {
    gateway    = { port = 8080, cpu = var.gateway_cpu,    memory = var.gateway_memory    }
    auth       = { port = 8001, cpu = var.service_cpu,    memory = var.service_memory    }
    risk       = { port = 8002, cpu = var.service_cpu,    memory = var.service_memory    }
    compliance = { port = 8003, cpu = var.service_cpu,    memory = var.service_memory    }
    governance = { port = 8004, cpu = var.service_cpu,    memory = var.service_memory    }
    privacy    = { port = 8005, cpu = var.service_cpu,    memory = var.service_memory    }
    evidence   = { port = 8006, cpu = var.service_cpu,    memory = var.service_memory    }
    secops     = { port = 8007, cpu = var.service_cpu,    memory = var.service_memory    }
    ai         = { port = 8008, cpu = var.ai_service_cpu, memory = var.ai_service_memory }
    trust      = { port = 8009, cpu = var.service_cpu,    memory = var.service_memory    }
    integration = { port = 8010, cpu = var.service_cpu,   memory = var.service_memory    }
    web        = { port = 80,    cpu = var.service_cpu,   memory = var.service_memory    }
  }
}

# ── VPC ──────────────────────────────────────────────────────────────────────
module "vpc" {
  source             = "./modules/vpc"
  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

# ── ECR Repositories ─────────────────────────────────────────────────────────
module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name_prefix
  services    = keys(local.services)
}

# ── IAM Task Roles ────────────────────────────────────────────────────────────
module "iam" {
  source           = "./modules/iam"
  name_prefix      = local.name_prefix
  aws_region       = var.aws_region
  secrets_arn_prefix = module.secrets.secrets_arn_prefix
}

# ── Secrets Manager ───────────────────────────────────────────────────────────
module "secrets" {
  source      = "./modules/secrets"
  name_prefix = local.name_prefix
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────
module "rds" {
  source             = "./modules/rds"
  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  db_sg_id           = module.vpc.db_sg_id
  db_instance_class  = var.db_instance_class
  db_engine_version  = var.db_engine_version
  db_name            = var.db_name
  db_username        = var.db_username
  db_password_secret_arn = module.secrets.db_password_arn
  db_multi_az        = var.db_multi_az
  db_storage_gb      = var.db_storage_gb
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
module "elasticache" {
  source             = "./modules/elasticache"
  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  redis_sg_id        = module.vpc.redis_sg_id
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
  auth_token_secret_arn = module.secrets.redis_auth_arn
}

# ── Application Load Balancer ─────────────────────────────────────────────────
module "alb" {
  source             = "./modules/alb"
  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  alb_sg_id          = module.vpc.alb_sg_id
  domain_name        = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
}

# ── DATABASE_URL secret ───────────────────────────────────────────────────────
# Created AFTER both the secrets module (owns the password) and the RDS module
# (owns the endpoint) are ready, so both outputs are available here.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/database-url"
  description             = "Full PostgreSQL connection string expected by service-kit (DATABASE_URL)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  # db_address is host-only (e.g. mydb.xxx.rds.amazonaws.com).
  # db_endpoint includes the port (host:5432) — using it would produce host:5432:5432.
  secret_string = "postgresql://${var.db_username}:${module.secrets.db_password}@${module.rds.db_address}:5432/${var.db_name}?sslmode=require"

  depends_on = [module.rds, module.secrets]
}

# ── ECS Cluster + Services ────────────────────────────────────────────────────
module "ecs" {
  source              = "./modules/ecs"
  name_prefix         = local.name_prefix
  aws_region          = var.aws_region
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  ecs_sg_id           = module.vpc.ecs_sg_id
  services            = local.services
  ecr_registry        = coalesce(var.ecr_registry, "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com")
  ecr_repositories    = module.ecr.repository_urls
  image_tag           = var.image_tag
  task_execution_role_arn = module.iam.task_execution_role_arn
  task_role_arn       = module.iam.task_role_arn
  secrets_arn         = module.secrets.bundle_arn
  alb_listener_arn    = module.alb.https_listener_arn
  alb_listener_http_arn = module.alb.http_listener_arn
  gateway_target_group_arn = module.alb.gateway_tg_arn
  web_target_group_arn     = module.alb.web_tg_arn
  min_capacity        = var.min_capacity
  max_capacity        = var.max_capacity
  db_host             = module.rds.db_address   # host-only; db_endpoint includes :port
  db_name             = var.db_name
  db_username         = var.db_username
  db_password_secret_arn = module.secrets.db_password_arn
  redis_endpoint         = module.elasticache.redis_endpoint
  redis_auth_secret_arn  = module.secrets.redis_auth_arn
  database_url_secret_arn = aws_secretsmanager_secret.database_url.arn
}

data "aws_caller_identity" "current" {}

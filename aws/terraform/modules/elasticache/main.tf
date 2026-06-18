resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.name_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${var.name_prefix}-redis-subnet-group" }
}

resource "aws_elasticache_parameter_group" "redis7" {
  name   = "${var.name_prefix}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = { Name = "${var.name_prefix}-redis7" }
}

data "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = var.auth_token_secret_arn
}

# ── Replication Group (TLS + AUTH — the only Redis resource) ─────────────────
# aws_elasticache_cluster does not support transit_encryption_enabled or
# auth_token. Using the replication group exclusively ensures production-grade
# security (TLS + AUTH) without creating a redundant, unencrypted resource.
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.name_prefix}-redis-rg"
  description                = "AIGO-X Redis replication group"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_nodes
  parameter_group_name       = aws_elasticache_parameter_group.redis7.name
  engine_version             = "7.1"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [var.redis_sg_id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = data.aws_secretsmanager_secret_version.redis_auth.secret_string
  automatic_failover_enabled = var.num_cache_nodes > 1

  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"

  tags = { Name = "${var.name_prefix}-redis-rg" }
}

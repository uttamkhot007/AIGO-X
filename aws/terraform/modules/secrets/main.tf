resource "random_password" "db" {
  length  = 32
  # special = false: URI-reserved chars (:@/?#) in passwords break postgresql://
  # connection strings without percent-encoding. Alphanumeric-only is safe for
  # all DSN parsers while still providing 190+ bits of entropy at length=32.
  special = false
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "token_key" {
  length  = 32
  special = false
}

# ── Individual secrets (for ECS task secret injection) ────────────────────────
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.name_prefix}/db-password"
  description             = "PostgreSQL master password"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${var.name_prefix}/redis-auth-token"
  description             = "ElastiCache Redis auth token"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis.result
}

# ── Bundle secret (all app env vars in one JSON blob) ─────────────────────────
# ECS tasks reference individual keys from this bundle.
resource "aws_secretsmanager_secret" "bundle" {
  name                    = "${var.name_prefix}/app-secrets"
  description             = "All AIGO-X application secrets as JSON"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "bundle" {
  secret_id = aws_secretsmanager_secret.bundle.id

  secret_string = jsonencode({
    JWT_SECRET           = random_password.jwt.result
    TOKEN_ENCRYPTION_KEY = random_password.token_key.result
    DB_PASSWORD          = random_password.db.result
    REDIS_AUTH_TOKEN     = random_password.redis.result
    # OPENAI_API_KEY managed externally — update via AWS CLI or console:
    # aws secretsmanager update-secret --secret-id <arn> --secret-string '{...}'
    OPENAI_API_KEY = ""
  })
}

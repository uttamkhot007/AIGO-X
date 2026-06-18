output "bundle_arn" {
  value     = aws_secretsmanager_secret.bundle.arn
  sensitive = true
}

output "db_password_arn" {
  value     = aws_secretsmanager_secret.db_password.arn
  sensitive = true
}

output "redis_auth_arn" {
  value     = aws_secretsmanager_secret.redis_auth.arn
  sensitive = true
}

output "secrets_arn_prefix" {
  description = "ARN prefix for wildcard IAM policy"
  value       = "arn:aws:secretsmanager:*:*:secret:${var.name_prefix}/*"
}

output "db_password" {
  description = "Raw DB password — used by main.tf to construct DATABASE_URL secret"
  value       = random_password.db.result
  sensitive   = true
}

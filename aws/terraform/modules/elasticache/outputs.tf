output "redis_endpoint" {
  description = "Primary endpoint for the Redis replication group"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  value = 6379
}

output "cluster_id" {
  value = aws_elasticache_replication_group.main.id
}

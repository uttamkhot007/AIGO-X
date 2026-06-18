output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "service_names" {
  value = { for k, v in aws_ecs_service.service : k => v.name }
}

output "service_discovery_namespace" {
  value = aws_service_discovery_private_dns_namespace.main.name
}

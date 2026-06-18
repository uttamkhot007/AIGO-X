output "resource_group_name" {
  description = "Name of the Azure resource group"
  value       = module.resource_group.name
}

output "aks_cluster_name" {
  description = "AKS cluster name"
  value       = module.aks.cluster_name
}

output "aks_kube_config_command" {
  description = "az CLI command to get AKS credentials"
  value       = "az aks get-credentials --resource-group ${module.resource_group.name} --name ${module.aks.cluster_name}"
}

output "acr_login_server" {
  description = "ACR login server URL"
  value       = module.acr.login_server
}

output "acr_push_command" {
  description = "az CLI command to log in to ACR"
  value       = "az acr login --name ${module.acr.name}"
}

output "postgres_fqdn" {
  description = "PostgreSQL Flexible Server fully qualified domain name"
  value       = module.postgres.fqdn
  sensitive   = true
}

output "redis_hostname" {
  description = "Azure Cache for Redis hostname"
  value       = module.redis.hostname
  sensitive   = true
}

output "keyvault_uri" {
  description = "Azure Key Vault URI for reading secrets"
  value       = module.keyvault.uri
}

output "app_gateway_public_ip" {
  description = "Public IP address of the Application Gateway"
  value       = module.app_gateway.public_ip
}

output "agic_identity_client_id" {
  description = "Client ID of the AGIC User-Assigned Managed Identity (used by deploy.sh for Workload Identity AGIC install)"
  value       = module.aks.agic_identity_client_id
}

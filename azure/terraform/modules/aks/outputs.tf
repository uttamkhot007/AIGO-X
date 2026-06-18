output "cluster_name"          { value = azurerm_kubernetes_cluster.main.name }
output "cluster_id"            { value = azurerm_kubernetes_cluster.main.id }
output "kube_config"           { value = azurerm_kubernetes_cluster.main.kube_config_raw; sensitive = true }
output "node_pool_id"          { value = azurerm_kubernetes_cluster_node_pool.workload.id }
output "oidc_issuer_url"       { value = azurerm_kubernetes_cluster.main.oidc_issuer_url }
output "agic_identity_client_id"    { value = azurerm_user_assigned_identity.agic.client_id }
output "agic_identity_resource_id"  { value = azurerm_user_assigned_identity.agic.id }

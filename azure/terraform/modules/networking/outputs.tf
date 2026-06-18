output "vnet_id"                    { value = azurerm_virtual_network.main.id }
output "aks_subnet_id"             { value = azurerm_subnet.aks.id }
output "appgw_subnet_id"           { value = azurerm_subnet.appgw.id }
output "db_subnet_id"              { value = azurerm_subnet.db.id }
output "postgres_private_dns_zone_id" { value = azurerm_private_dns_zone.postgres.id }

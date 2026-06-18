output "fqdn"       { value = azurerm_postgresql_flexible_server.main.fqdn; sensitive = true }
output "server_id" { value = azurerm_postgresql_flexible_server.main.id }
output "db_name"   { value = azurerm_postgresql_flexible_server_database.grc.name }

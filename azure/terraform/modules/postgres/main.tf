resource "random_password" "db" {
  length  = 32
  # special = false: URI-reserved chars (:@/?#) in passwords break postgresql://
  # connection strings without percent-encoding. Alphanumeric-only at length=32
  # still gives 190+ bits of entropy and works safely in any DSN parser.
  special = false
}

resource "azurerm_key_vault_secret" "postgres_password" {
  name         = "postgres-admin-password"
  value        = random_password.db.result
  key_vault_id = var.keyvault_id
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${var.name_prefix}-postgres"
  resource_group_name    = var.resource_group
  location               = var.location
  version                = var.postgres_version
  delegated_subnet_id    = var.delegated_subnet_id
  private_dns_zone_id    = var.private_dns_zone_id
  administrator_login    = var.admin_login
  administrator_password = random_password.db.result
  sku_name               = var.sku_name
  storage_mb             = var.storage_mb
  backup_retention_days  = var.backup_retention_days
  geo_redundant_backup_enabled = true
  zone                   = "1"

  high_availability {
    mode                      = "ZoneRedundant"
    standby_availability_zone = "2"
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 3
    start_minute = 0
  }

  tags = var.tags
}

resource "azurerm_postgresql_flexible_server_database" "grc" {
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_configuration" "log_connections" {
  name      = "log_connections"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

resource "azurerm_postgresql_flexible_server_configuration" "log_min_duration" {
  name      = "log_min_duration_statement"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "1000"
}

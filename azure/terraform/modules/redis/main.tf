resource "azurerm_redis_cache" "main" {
  name                = "${var.name_prefix}-redis"
  resource_group_name = var.resource_group
  location            = var.location
  capacity            = var.capacity
  family              = var.family
  sku_name            = var.sku_name
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  redis_version       = 7

  redis_configuration {
    enable_authentication = true
    maxmemory_policy      = "allkeys-lru"
  }

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 3
  }

  tags = var.tags
}

resource "azurerm_key_vault_secret" "redis_access_key" {
  name         = "redis-access-key"
  value        = azurerm_redis_cache.main.primary_access_key
  key_vault_id = var.keyvault_id
}

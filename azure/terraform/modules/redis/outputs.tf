output "hostname"          { value = azurerm_redis_cache.main.hostname; sensitive = true }
output "ssl_port"         { value = azurerm_redis_cache.main.ssl_port }
output "id"               { value = azurerm_redis_cache.main.id }

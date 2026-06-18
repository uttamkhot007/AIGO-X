data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                        = var.name
  resource_group_name         = var.resource_group
  location                    = var.location
  sku_name                    = "standard"
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days  = 90
  purge_protection_enabled    = true
  enable_rbac_authorization   = true
  tags                        = var.tags
}

# Grant the current deployment principal Key Vault Administrator
resource "azurerm_role_assignment" "deployer_kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# Placeholder secrets — Terraform creates the secret *name* but ignores future
# value changes so that `terraform apply` cannot overwrite secrets rotated outside
# of Terraform (via az CLI, deploy.sh, or the Azure Portal).
# Update each secret before first deploy:
#   az keyvault secret set --vault-name <name> --name jwt-secret --value '<64-char-random>'
resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = "CHANGEME-replace-with-min-64-char-random-string"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "db-password"
  value        = "CHANGEME-replace-with-strong-db-password"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "redis_password" {
  name         = "redis-password"
  value        = "CHANGEME-replace-with-strong-redis-password"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "token_encryption_key" {
  name         = "token-encryption-key"
  value        = "CHANGEME-replace-with-32-char-random-key"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "openai_api_key" {
  name         = "openai-api-key"
  value        = "CHANGEME-replace-with-actual-openai-key-or-leave-empty"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployer_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

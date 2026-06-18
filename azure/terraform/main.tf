locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # Sanitised prefix for Azure resources that don't allow hyphens
  safe_prefix = replace(local.name_prefix, "-", "")

  services = [
    "gateway", "auth", "risk", "compliance", "governance",
    "privacy", "evidence", "secops", "ai", "trust", "integration", "web"
  ]

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── Resource Group ────────────────────────────────────────────────────────────
module "resource_group" {
  source      = "./modules/resource-group"
  name        = "${local.name_prefix}-rg"
  location    = var.location
  tags        = local.common_tags
}

# ── Networking ────────────────────────────────────────────────────────────────
module "networking" {
  source            = "./modules/networking"
  name_prefix       = local.name_prefix
  resource_group    = module.resource_group.name
  location          = var.location
  vnet_cidr         = var.vnet_cidr
  aks_subnet_cidr   = var.aks_subnet_cidr
  appgw_subnet_cidr = var.appgw_subnet_cidr
  db_subnet_cidr    = var.db_subnet_cidr
  tags              = local.common_tags
}

# ── Azure Container Registry ──────────────────────────────────────────────────
module "acr" {
  source         = "./modules/acr"
  name           = "${local.safe_prefix}acr"
  resource_group = module.resource_group.name
  location       = var.location
  sku            = var.acr_sku
  tags           = local.common_tags
}

# ── Azure Key Vault ───────────────────────────────────────────────────────────
module "keyvault" {
  source         = "./modules/keyvault"
  name           = "${local.name_prefix}-kv"
  resource_group = module.resource_group.name
  location       = var.location
  tags           = local.common_tags
}

# ── Azure Database for PostgreSQL Flexible Server ─────────────────────────────
module "postgres" {
  source                = "./modules/postgres"
  name_prefix           = local.name_prefix
  resource_group        = module.resource_group.name
  location              = var.location
  sku_name              = var.db_sku_name
  postgres_version      = var.db_postgres_version
  db_name               = var.db_name
  admin_login           = var.db_admin_login
  storage_mb            = var.db_storage_mb
  backup_retention_days = var.db_backup_retention_days
  delegated_subnet_id   = module.networking.db_subnet_id
  private_dns_zone_id   = module.networking.postgres_private_dns_zone_id
  keyvault_id           = module.keyvault.id
  tags                  = local.common_tags
}

# ── Azure Cache for Redis ─────────────────────────────────────────────────────
module "redis" {
  source         = "./modules/redis"
  name_prefix    = local.name_prefix
  resource_group = module.resource_group.name
  location       = var.location
  sku_name       = var.redis_sku_name
  family         = var.redis_family
  capacity       = var.redis_capacity
  keyvault_id    = module.keyvault.id
  tags           = local.common_tags
}

# ── AKS Cluster ───────────────────────────────────────────────────────────────
module "aks" {
  source               = "./modules/aks"
  name_prefix          = local.name_prefix
  resource_group       = module.resource_group.name
  location             = var.location
  k8s_version          = var.k8s_version
  aks_subnet_id        = module.networking.aks_subnet_id
  system_node_vm_size  = var.system_node_vm_size
  user_node_vm_size    = var.user_node_vm_size
  system_node_count    = var.system_node_count
  user_node_min_count  = var.user_node_min_count
  user_node_max_count  = var.user_node_max_count
  acr_id               = module.acr.id
  keyvault_id          = module.keyvault.id
  # AGIC Workload Identity needs Contributor on the App Gateway
  appgw_id             = module.app_gateway.id
  tags                 = local.common_tags
}

# ── Application Gateway ───────────────────────────────────────────────────────
# NOTE: module.aks depends_on module.app_gateway via appgw_id input — Terraform
# resolves this automatically through the output reference; no explicit depends_on needed.
module "app_gateway" {
  source           = "./modules/app-gateway"
  name_prefix      = local.name_prefix
  resource_group   = module.resource_group.name
  location         = var.location
  appgw_subnet_id  = module.networking.appgw_subnet_id
  domain_name      = var.domain_name
  tags             = local.common_tags
}

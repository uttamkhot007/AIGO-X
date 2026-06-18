variable "location" {
  description = "Azure region to deploy into"
  type        = string
  default     = "eastus"
}

variable "project_name" {
  description = "Short project name used as prefix for all resource names"
  type        = string
  default     = "aigo-x"
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

# ── Networking ────────────────────────────────────────────────────────────────
variable "vnet_cidr" {
  description = "Address space for the Virtual Network"
  type        = string
  default     = "10.1.0.0/16"
}

variable "aks_subnet_cidr" {
  description = "Subnet CIDR for AKS node pools"
  type        = string
  default     = "10.1.0.0/20"
}

variable "appgw_subnet_cidr" {
  description = "Subnet CIDR for Application Gateway (requires dedicated subnet)"
  type        = string
  default     = "10.1.16.0/24"
}

variable "db_subnet_cidr" {
  description = "Subnet CIDR for Azure Database for PostgreSQL"
  type        = string
  default     = "10.1.17.0/24"
}

# ── AKS ──────────────────────────────────────────────────────────────────────
variable "k8s_version" {
  description = "Kubernetes version for the AKS cluster"
  type        = string
  default     = "1.29"
}

variable "system_node_vm_size" {
  description = "VM size for the system node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "user_node_vm_size" {
  description = "VM size for the workload node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "system_node_count" {
  description = "Initial node count for the system pool (not autoscaled)"
  type        = number
  default     = 2
}

variable "user_node_min_count" {
  description = "Minimum nodes in the user workload pool"
  type        = number
  default     = 2
}

variable "user_node_max_count" {
  description = "Maximum nodes in the user workload pool"
  type        = number
  default     = 10
}

# ── PostgreSQL Flexible Server ────────────────────────────────────────────────
variable "db_sku_name" {
  description = "SKU for Azure Database for PostgreSQL Flexible Server"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "db_postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "16"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "dufense_grc"
}

variable "db_admin_login" {
  description = "Admin login for PostgreSQL"
  type        = string
  default     = "grc_admin"
}

variable "db_storage_mb" {
  description = "Storage size in MB for the Flexible Server"
  type        = number
  default     = 102400
}

variable "db_backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 14
}

# ── Azure Cache for Redis ─────────────────────────────────────────────────────
variable "redis_sku_name" {
  description = "Redis SKU (Basic | Standard | Premium)"
  type        = string
  default     = "Standard"
}

variable "redis_family" {
  description = "Redis family (C for Basic/Standard, P for Premium)"
  type        = string
  default     = "C"
}

variable "redis_capacity" {
  description = "Redis capacity (0–6 for Basic/Standard)"
  type        = number
  default     = 1
}

# ── ACR ──────────────────────────────────────────────────────────────────────
variable "acr_sku" {
  description = "ACR tier (Basic | Standard | Premium)"
  type        = string
  default     = "Standard"
}

# ── Application Gateway ───────────────────────────────────────────────────────
variable "domain_name" {
  description = "Public domain name for Application Gateway (e.g. grc.example.com)"
  type        = string
  default     = "grc.example.com"
}

# ── Image ─────────────────────────────────────────────────────────────────────
variable "image_tag" {
  description = "Container image tag to deploy"
  type        = string
  default     = "latest"
}

variable "name_prefix"           { type = string }
variable "resource_group"        { type = string }
variable "location"              { type = string }
variable "sku_name"              { type = string }
variable "postgres_version"      { type = string }
variable "db_name"               { type = string }
variable "admin_login"           { type = string }
variable "storage_mb"            { type = number }
variable "backup_retention_days" { type = number }
variable "delegated_subnet_id"   { type = string }
variable "private_dns_zone_id"   { type = string }
variable "keyvault_id"           { type = string }
variable "tags"                  { type = map(string); default = {} }

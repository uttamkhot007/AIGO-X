variable "name_prefix"    { type = string }
variable "resource_group" { type = string }
variable "location"       { type = string }
variable "sku_name"       { type = string }
variable "family"         { type = string }
variable "capacity"       { type = number }
variable "keyvault_id"    { type = string }
variable "tags"           { type = map(string); default = {} }

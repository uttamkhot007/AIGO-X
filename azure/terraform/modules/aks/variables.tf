variable "name_prefix"          { type = string }
variable "resource_group"       { type = string }
variable "location"             { type = string }
variable "k8s_version"          { type = string }
variable "aks_subnet_id"        { type = string }
variable "system_node_vm_size"  { type = string }
variable "user_node_vm_size"    { type = string }
variable "system_node_count"    { type = number }
variable "user_node_min_count"  { type = number }
variable "user_node_max_count"  { type = number }
variable "acr_id"               { type = string }
variable "keyvault_id"          { type = string }
variable "appgw_id"             { type = string; description = "Resource ID of the App Gateway — used to grant AGIC Contributor access." }
variable "tags"                 { type = map(string); default = {} }

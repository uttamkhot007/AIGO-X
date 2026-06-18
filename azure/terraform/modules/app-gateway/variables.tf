variable "name_prefix"     { type = string }
variable "resource_group"  { type = string }
variable "location"        { type = string }
variable "appgw_subnet_id" { type = string }
variable "domain_name"     { type = string }
variable "tags"            { type = map(string); default = {} }

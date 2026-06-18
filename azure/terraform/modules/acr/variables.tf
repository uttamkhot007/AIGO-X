variable "name"           { type = string }
variable "resource_group" { type = string }
variable "location"       { type = string }
variable "sku"            { type = string; default = "Standard" }
variable "tags"           { type = map(string); default = {} }

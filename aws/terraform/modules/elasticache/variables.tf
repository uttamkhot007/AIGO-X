variable "name_prefix"           { type = string }
variable "vpc_id"               { type = string }
variable "private_subnet_ids"   { type = list(string) }
variable "redis_sg_id"          { type = string }
variable "node_type"            { type = string }
variable "num_cache_nodes"      { type = number }
variable "auth_token_secret_arn" { type = string }

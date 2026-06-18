variable "name_prefix"            { type = string }
variable "aws_region"             { type = string }
variable "vpc_id"                 { type = string }
variable "private_subnet_ids"     { type = list(string) }
variable "ecs_sg_id"              { type = string }
variable "image_tag"              { type = string }
variable "ecr_registry"           { type = string }
variable "task_execution_role_arn" { type = string }
variable "task_role_arn"          { type = string }
variable "secrets_arn"            { type = string }
variable "alb_listener_arn"       { type = string }
variable "alb_listener_http_arn"  { type = string }
variable "gateway_target_group_arn" { type = string }
variable "web_target_group_arn"   { type = string }
variable "min_capacity"           { type = number }
variable "max_capacity"           { type = number }
variable "db_host"                { type = string }
variable "db_name"                { type = string }
variable "db_username"            { type = string }
variable "db_password_secret_arn" { type = string }
variable "redis_endpoint"         { type = string }
variable "redis_auth_secret_arn"  { type = string }
variable "database_url_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the full DATABASE_URL connection string"
  type        = string
}

variable "ecr_repositories" {
  type        = map(string)
  description = "Map of service name → ECR repository URL"
}

variable "services" {
  type = map(object({
    port   = number
    cpu    = number
    memory = number
  }))
}

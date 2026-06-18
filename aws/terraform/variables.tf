variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
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

# ── VPC ──────────────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AZs to deploy into (must be ≥ 2)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# ── RDS ──────────────────────────────────────────────────────────────────────
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.2"
}

variable "db_name" {
  description = "Name of the initial database"
  type        = string
  default     = "dufense_grc"
}

variable "db_username" {
  description = "Master database username"
  type        = string
  default     = "grc_admin"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "db_storage_gb" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

# ── ElastiCache (Redis) ───────────────────────────────────────────────────────
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 1
}

# ── ECS ──────────────────────────────────────────────────────────────────────
variable "image_tag" {
  description = "Container image tag to deploy (e.g. 1.2.3)"
  type        = string
  default     = "latest"
}

variable "ecr_registry" {
  description = "ECR registry URI (defaults to account.dkr.ecr.region.amazonaws.com)"
  type        = string
  default     = ""
}

variable "service_cpu" {
  description = "Default CPU units for ECS tasks (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "service_memory" {
  description = "Default memory in MiB for ECS tasks"
  type        = number
  default     = 1024
}

variable "gateway_cpu" {
  description = "CPU units for the gateway task"
  type        = number
  default     = 1024
}

variable "gateway_memory" {
  description = "Memory in MiB for the gateway task"
  type        = number
  default     = 2048
}

variable "ai_service_cpu" {
  description = "CPU units for the AI service task"
  type        = number
  default     = 1024
}

variable "ai_service_memory" {
  description = "Memory in MiB for the AI service task"
  type        = number
  default     = 2048
}

variable "min_capacity" {
  description = "Minimum ECS task count per service"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum ECS task count per service"
  type        = number
  default     = 10
}

# ── ALB / TLS ─────────────────────────────────────────────────────────────────
variable "domain_name" {
  description = "Public domain name (e.g. grc.example.com). Leave empty to skip ACM cert."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate. Auto-requested when domain_name is set."
  type        = string
  default     = ""
}

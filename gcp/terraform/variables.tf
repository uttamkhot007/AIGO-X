variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
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
  description = "Primary CIDR range for the VPC subnet"
  type        = string
  default     = "10.2.0.0/20"
}

variable "pods_cidr" {
  description = "Secondary CIDR range for GKE pods"
  type        = string
  default     = "10.48.0.0/14"
}

variable "services_cidr" {
  description = "Secondary CIDR range for GKE services"
  type        = string
  default     = "10.52.0.0/20"
}

# ── GKE Autopilot ────────────────────────────────────────────────────────────
variable "k8s_version_prefix" {
  description = "GKE release channel or version prefix (e.g. '1.29' or 'latest')"
  type        = string
  default     = "latest"
}

variable "gke_release_channel" {
  description = "GKE release channel (RAPID | REGULAR | STABLE)"
  type        = string
  default     = "REGULAR"
}

variable "gke_master_authorized_cidr" {
  description = "CIDR block allowed to reach the GKE control plane API. Default covers RFC1918 private ranges (VPN/bastion use). deploy.sh also detects and adds the operator's current public egress IP at deploy time via 'gcloud container clusters update'."
  type        = string
  default     = "10.0.0.0/8"
}

# ── Cloud SQL ─────────────────────────────────────────────────────────────────
variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-7680"
}

variable "db_postgres_version" {
  description = "PostgreSQL version for Cloud SQL"
  type        = string
  default     = "POSTGRES_16"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "dufense_grc"
}

variable "db_user" {
  description = "Database admin user"
  type        = string
  default     = "grc_admin"
}

variable "db_disk_size_gb" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 100
}

variable "db_backup_enabled" {
  description = "Enable Cloud SQL automated backups"
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Protect Cloud SQL instance from accidental deletion"
  type        = bool
  default     = true
}

# ── Memorystore (Redis) ───────────────────────────────────────────────────────
variable "redis_tier" {
  description = "Memorystore service tier (BASIC | STANDARD_HA)"
  type        = string
  default     = "STANDARD_HA"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 4
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
variable "artifact_registry_location" {
  description = "Artifact Registry location (can differ from gcp_region)"
  type        = string
  default     = "us-central1"
}

# ── Image ─────────────────────────────────────────────────────────────────────
variable "image_tag" {
  description = "Container image tag to deploy"
  type        = string
  default     = "latest"
}

# ── Domain ───────────────────────────────────────────────────────────────────
variable "domain_name" {
  description = "Public domain for Cloud Load Balancing (e.g. grc.example.com)"
  type        = string
  default     = "grc.example.com"
}

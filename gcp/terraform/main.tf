locals {
  name_prefix = "${var.project_name}-${var.environment}"

  services = [
    "gateway", "auth", "risk", "compliance", "governance",
    "privacy", "evidence", "secops", "ai", "trust", "integration", "web"
  ]
}

# Enable required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "dns.googleapis.com",
    "certificatemanager.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ── VPC & Networking ──────────────────────────────────────────────────────────
module "vpc" {
  source        = "./modules/vpc"
  name_prefix   = local.name_prefix
  gcp_region    = var.gcp_region
  gcp_project   = var.gcp_project_id
  vpc_cidr      = var.vpc_cidr
  pods_cidr     = var.pods_cidr
  services_cidr = var.services_cidr

  depends_on = [google_project_service.apis]
}

# ── Artifact Registry (single repo) ──────────────────────────────────────────
module "artifact_registry" {
  source      = "./modules/artifact-registry"
  name_prefix = local.name_prefix
  gcp_project = var.gcp_project_id
  location    = var.artifact_registry_location

  depends_on = [google_project_service.apis]
}

# ── App-level secrets (jwt, token key, openai) ────────────────────────────────
module "secret_manager" {
  source      = "./modules/secret-manager"
  name_prefix = local.name_prefix
  gcp_project = var.gcp_project_id
  gcp_region  = var.gcp_region

  depends_on = [google_project_service.apis]
}

# ── Cloud SQL (PostgreSQL) ── owns db-password secret ─────────────────────────
module "cloudsql" {
  source              = "./modules/cloudsql"
  name_prefix         = local.name_prefix
  gcp_project         = var.gcp_project_id
  gcp_region          = var.gcp_region
  tier                = var.db_tier
  postgres_version    = var.db_postgres_version
  db_name             = var.db_name
  db_user             = var.db_user
  disk_size_gb        = var.db_disk_size_gb
  backup_enabled      = var.db_backup_enabled
  deletion_protection = var.db_deletion_protection
  private_network_id  = module.vpc.network_id

  depends_on = [module.vpc, google_project_service.apis]
}

# ── Memorystore (Redis) ── owns redis-auth secret ─────────────────────────────
module "memorystore" {
  source          = "./modules/memorystore"
  name_prefix     = local.name_prefix
  gcp_project     = var.gcp_project_id
  gcp_region      = var.gcp_region
  tier            = var.redis_tier
  memory_size_gb  = var.redis_memory_size_gb
  redis_version   = var.redis_version
  private_network = module.vpc.network_id

  depends_on = [module.vpc, google_project_service.apis]
}

# ── IAM — merge app secrets + db/redis secrets for single accessor ────────────
module "iam" {
  source      = "./modules/iam"
  name_prefix = local.name_prefix
  gcp_project = var.gcp_project_id

  # All secrets the workload SA needs to access
  all_secret_names = merge(
    module.secret_manager.secret_names,
    {
      "db-password" = module.cloudsql.db_password_secret_id
      "redis-auth"  = module.memorystore.redis_auth_secret_id
    }
  )

  depends_on = [module.secret_manager, module.cloudsql, module.memorystore]
}

# ── GKE Autopilot Cluster ─────────────────────────────────────────────────────
module "gke" {
  source                = "./modules/gke"
  name_prefix           = local.name_prefix
  gcp_project           = var.gcp_project_id
  gcp_region            = var.gcp_region
  network_id            = module.vpc.network_id
  subnetwork_id         = module.vpc.subnetwork_id
  pods_range_name       = module.vpc.pods_range_name
  services_range_name   = module.vpc.services_range_name
  k8s_version_prefix    = var.k8s_version_prefix
  release_channel       = var.gke_release_channel
  workload_sa_email     = module.iam.workload_sa_email
  master_authorized_cidr = var.gke_master_authorized_cidr

  depends_on = [module.vpc, google_project_service.apis]
}

# ── Cloud Load Balancing ──────────────────────────────────────────────────────
module "load_balancing" {
  source      = "./modules/load-balancing"
  name_prefix = local.name_prefix
  gcp_project = var.gcp_project_id
  gcp_region  = var.gcp_region
  domain_name = var.domain_name

  depends_on = [module.gke, google_project_service.apis]
}

# ── Secret Manager secret (created before the instance so the resource exists) ─
resource "google_secret_manager_secret" "redis_auth" {
  project   = var.gcp_project
  secret_id = "${var.name_prefix}-redis-auth"

  replication {
    auto {}
  }
}

# ── Memorystore Redis (auth_enabled=true — GCP generates auth_string) ──────────
resource "google_redis_instance" "main" {
  name               = "${var.name_prefix}-redis"
  project            = var.gcp_project
  region             = var.gcp_region
  tier               = var.tier
  memory_size_gb     = var.memory_size_gb
  redis_version      = var.redis_version
  authorized_network = var.private_network
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  auth_enabled       = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }
}

# ── Store GCP-generated auth_string as the canonical secret version ────────────
# auth_string is emitted by GCP after instance creation and is the ONLY valid
# token for AUTH commands — any separately-generated random value will be wrong.
resource "google_secret_manager_secret_version" "redis_auth" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = google_redis_instance.main.auth_string

  depends_on = [google_redis_instance.main]
}

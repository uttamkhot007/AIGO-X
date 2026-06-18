resource "random_password" "db" {
  length  = 32
  special = false
}

# ── Single source of truth for the DB password ────────────────────────────────
resource "google_secret_manager_secret" "db_password" {
  project   = var.gcp_project
  secret_id = "${var.name_prefix}-db-password"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_sql_database_instance" "main" {
  name             = "${var.name_prefix}-postgres"
  project          = var.gcp_project
  region           = var.gcp_region
  database_version = var.postgres_version

  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    availability_type = "REGIONAL"
    disk_size         = var.disk_size_gb
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network_id
      require_ssl     = true
    }

    backup_configuration {
      enabled                        = var.backup_enabled
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      backup_retention_settings {
        retained_backups = 14
      }
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }
}

resource "google_sql_database" "grc" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
  project  = var.gcp_project
}

resource "google_sql_user" "main" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  project  = var.gcp_project
  password = random_password.db.result
}

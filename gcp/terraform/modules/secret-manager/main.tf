resource "google_service_account" "secret_accessor" {
  account_id   = "${var.name_prefix}-secret-sa"
  display_name = "AIGO-X Secret Manager accessor"
  project      = var.gcp_project
}

# ── App secrets (jwt, token key, openai key) ──────────────────────────────────
# NOTE: db-password and redis-auth are owned by the cloudsql and memorystore
# modules respectively — they generate random passwords and store them here
# so that the secret exists in one place.  This module owns only the
# application-level secrets that are NOT tied to a managed-service credential.
locals {
  app_secrets = {
    jwt-secret           = "CHANGEME-replace-with-min-64-char-secret"
    token-encryption-key = "CHANGEME-replace-with-32-char-key"
    openai-api-key       = ""
  }
}

resource "google_secret_manager_secret" "app_secrets" {
  for_each  = local.app_secrets
  project   = var.gcp_project
  secret_id = "${var.name_prefix}-${each.key}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "app_secrets" {
  for_each    = local.app_secrets
  secret      = google_secret_manager_secret.app_secrets[each.key].id
  secret_data = each.value

  # Do not overwrite on subsequent applies — rotate via gcloud CLI.
  lifecycle {
    ignore_changes = [secret_data]
  }
}

# ── Grant SA access to the app secrets (db/redis IAM is added in iam module) ──
resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = local.app_secrets
  project   = var.gcp_project
  secret_id = google_secret_manager_secret.app_secrets[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.secret_accessor.email}"
}

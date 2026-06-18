resource "google_service_account" "workload" {
  account_id   = "${var.name_prefix}-workload-sa"
  display_name = "AIGO-X GKE Workload Identity SA"
  project      = var.gcp_project
}

# Grant access to all secrets (app secrets + db-password + redis-auth)
resource "google_secret_manager_secret_iam_member" "workload_accessor" {
  for_each  = var.all_secret_names
  project   = var.gcp_project
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.workload.email}"
}

# Allow the Kubernetes SA to impersonate the GCP SA (Workload Identity binding)
resource "google_service_account_iam_member" "workload_identity_binding" {
  service_account_id = google_service_account.workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project}.svc.id.goog[aigo-x/aigo-x-workload-sa]"
}

# Cloud SQL client (for Cloud SQL Auth Proxy sidecar)
resource "google_project_iam_member" "sql_client" {
  project = var.gcp_project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

# Artifact Registry pull
resource "google_project_iam_member" "ar_reader" {
  project = var.gcp_project
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

# Cloud Logging write
resource "google_project_iam_member" "log_writer" {
  project = var.gcp_project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

# Cloud Monitoring write
resource "google_project_iam_member" "monitoring_writer" {
  project = var.gcp_project
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

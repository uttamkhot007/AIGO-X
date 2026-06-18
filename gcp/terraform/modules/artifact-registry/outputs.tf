output "registry_url" {
  description = "Base URL for all AIGO-X images: <registry_url>/<service>:<tag>"
  value       = "${var.location}-docker.pkg.dev/${var.gcp_project}/${google_artifact_registry_repository.main.repository_id}"
}

output "repository_id" {
  value = google_artifact_registry_repository.main.repository_id
}

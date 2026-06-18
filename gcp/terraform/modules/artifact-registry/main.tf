# Single Artifact Registry repository for all AIGO-X service images.
# Images are distinguished by service-specific tags:
#   us-central1-docker.pkg.dev/<PROJECT>/<name_prefix>/<SERVICE>:<TAG>
resource "google_artifact_registry_repository" "main" {
  project       = var.gcp_project
  location      = var.location
  repository_id = var.name_prefix
  format        = "DOCKER"
  description   = "AIGO-X GRC platform — all service images"

  cleanup_policies {
    id     = "keep-tagged-20"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["v", "sha-"]
      newer_than   = "0s"
    }
  }

  cleanup_policies {
    id     = "delete-untagged-7d"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
}

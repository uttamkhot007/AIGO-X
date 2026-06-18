output "gke_cluster_name" {
  description = "GKE Autopilot cluster name"
  value       = module.gke.cluster_name
}

output "gke_connect_command" {
  description = "gcloud command to get cluster credentials"
  value       = "gcloud container clusters get-credentials ${module.gke.cluster_name} --region ${var.gcp_region} --project ${var.gcp_project_id}"
}

output "artifact_registry_url" {
  description = "Artifact Registry base URL for all service images"
  value       = "${var.artifact_registry_location}-docker.pkg.dev/${var.gcp_project_id}/${local.name_prefix}"
}

output "cert_map_name" {
  description = "Certificate Manager cert map name (referenced in GKE Gateway annotation)"
  value       = module.load_balancing.cert_map_name
}

output "cloudsql_connection_name" {
  description = "Cloud SQL connection name for Cloud SQL Auth Proxy"
  value       = module.cloudsql.connection_name
  sensitive   = true
}

output "cloudsql_private_ip" {
  description = "Cloud SQL private IP address (accessible from GKE pods)"
  value       = module.cloudsql.private_ip
  sensitive   = true
}

output "memorystore_host" {
  description = "Memorystore Redis host (private IP)"
  value       = module.memorystore.host
  sensitive   = true
}

output "memorystore_port" {
  description = "Memorystore Redis port"
  value       = module.memorystore.port
}

output "load_balancer_ip" {
  description = "External IP of the Cloud Load Balancer"
  value       = module.load_balancing.lb_ip
}

output "workload_identity_sa" {
  description = "GCP Service Account for Workload Identity (bind to K8s SA)"
  value       = module.iam.workload_sa_email
}

output "secret_manager_secrets" {
  description = "List of Secret Manager secret names"
  value       = module.secret_manager.secret_names
}

output "cluster_name"     { value = google_container_cluster.main.name }
output "cluster_id"       { value = google_container_cluster.main.id }
output "cluster_endpoint" { value = google_container_cluster.main.endpoint; sensitive = true }
output "cluster_ca"       { value = google_container_cluster.main.master_auth[0].cluster_ca_certificate; sensitive = true }

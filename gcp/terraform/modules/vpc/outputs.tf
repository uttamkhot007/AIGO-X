output "network_id"           { value = google_compute_network.main.id }
output "network_name"         { value = google_compute_network.main.name }
output "subnetwork_id"        { value = google_compute_subnetwork.main.id }
output "subnetwork_name"      { value = google_compute_subnetwork.main.name }
output "pods_range_name"      { value = "${var.name_prefix}-pods" }
output "services_range_name"  { value = "${var.name_prefix}-services" }

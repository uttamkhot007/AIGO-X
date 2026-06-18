output "lb_ip"          { value = google_compute_global_address.lb_ip.address }
output "lb_ip_name"     { value = google_compute_global_address.lb_ip.name }
output "cert_name"      { value = google_certificate_manager_certificate.main.name }
output "cert_map_name"  { value = google_certificate_manager_certificate_map.main.name }

resource "google_compute_network" "main" {
  name                    = "${var.name_prefix}-vpc"
  project                 = var.gcp_project
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "main" {
  name                     = "${var.name_prefix}-subnet"
  project                  = var.gcp_project
  region                   = var.gcp_region
  network                  = google_compute_network.main.id
  ip_cidr_range            = var.vpc_cidr
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "${var.name_prefix}-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "${var.name_prefix}-services"
    ip_cidr_range = var.services_cidr
  }
}

# ── Cloud Router + NAT (for private GKE nodes outbound) ───────────────────────
resource "google_compute_router" "main" {
  name    = "${var.name_prefix}-router"
  project = var.gcp_project
  region  = var.gcp_region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.name_prefix}-nat"
  project                            = var.gcp_project
  router                             = google_compute_router.main.name
  region                             = var.gcp_region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ── Private Service Access (for Cloud SQL + Memorystore) ─────────────────────
resource "google_compute_global_address" "private_ip_range" {
  name          = "${var.name_prefix}-private-ip"
  project       = var.gcp_project
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# ── Firewall Rules ────────────────────────────────────────────────────────────
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.name_prefix}-allow-internal"
  project = var.gcp_project
  network = google_compute_network.main.id

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow { protocol = "icmp" }

  source_ranges = [var.vpc_cidr, var.pods_cidr, var.services_cidr]
}

resource "google_compute_firewall" "allow_health_checks" {
  name    = "${var.name_prefix}-allow-health-checks"
  project = var.gcp_project
  network = google_compute_network.main.id

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080"]
  }

  # Google health checker IPs
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
}

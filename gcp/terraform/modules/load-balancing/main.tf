# ── Global External IP ─────────────────────────────────────────────────────────
resource "google_compute_global_address" "lb_ip" {
  name    = "${var.name_prefix}-lb-ip"
  project = var.gcp_project
}

# ── Certificate Manager (for GKE Gateway annotation) ─────────────────────────
resource "google_certificate_manager_certificate" "main" {
  name    = "${var.name_prefix}-cert"
  project = var.gcp_project

  managed {
    domains = [var.domain_name]
  }
}

resource "google_certificate_manager_certificate_map" "main" {
  name    = "${var.name_prefix}-certmap"
  project = var.gcp_project
}

resource "google_certificate_manager_certificate_map_entry" "main" {
  name         = "${var.name_prefix}-certmap-entry"
  project      = var.gcp_project
  map          = google_certificate_manager_certificate_map.main.name
  certificates = [google_certificate_manager_certificate.main.id]
  hostname     = var.domain_name
}

# ── GKE Gateway + HTTPRoute config (applied via kubectl post-cluster-creation) ─
# Written as a local file so the operator can apply it after Terraform:
#   kubectl apply -f <module_path>/gateway-config.yaml
resource "local_file" "gateway_config" {
  filename = "${path.module}/gateway-config.yaml"
  content  = <<-YAML
    # Apply after GKE cluster is ready:
    #   gcloud container clusters get-credentials ${var.name_prefix}-gke \
    #     --region ${var.gcp_region} --project ${var.gcp_project}
    #   kubectl apply -f gateway-config.yaml
    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
      name: aigo-x-gateway
      namespace: aigo-x
      annotations:
        networking.gke.io/certmap: ${google_certificate_manager_certificate_map.main.name}
    spec:
      gatewayClassName: gke-l7-global-external-managed
      addresses:
        - type: NamedAddress
          value: ${google_compute_global_address.lb_ip.name}
      listeners:
        - name: https
          port: 443
          protocol: HTTPS
          tls:
            mode: Terminate
        - name: http
          port: 80
          protocol: HTTP
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
      name: api-route
      namespace: aigo-x
    spec:
      parentRefs:
        - name: aigo-x-gateway
      rules:
        - matches:
            - path:
                type: PathPrefix
                value: /api
          backendRefs:
            - name: aigo-x-gateway
              port: 8080
        - matches:
            - path:
                type: PathPrefix
                value: /
          backendRefs:
            - name: aigo-x-web
              port: 80
  YAML
}

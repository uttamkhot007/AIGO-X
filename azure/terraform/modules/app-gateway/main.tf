resource "azurerm_public_ip" "appgw" {
  name                = "${var.name_prefix}-appgw-pip"
  resource_group_name = var.resource_group
  location            = var.location
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = replace(var.name_prefix, "_", "-")
  tags                = var.tags
}

locals {
  frontend_ip_config  = "${var.name_prefix}-frontend-ip"
  frontend_port_http  = "${var.name_prefix}-port-80"
  frontend_port_https = "${var.name_prefix}-port-443"
  gateway_pool        = "${var.name_prefix}-gateway-pool"
  web_pool            = "${var.name_prefix}-web-pool"
  http_settings       = "${var.name_prefix}-http-settings"
  # Single listener on port 80 — path-based routing handles /api/* vs /*
  main_listener       = "${var.name_prefix}-main-listener"
}

resource "azurerm_application_gateway" "main" {
  name                = "${var.name_prefix}-appgw"
  resource_group_name = var.resource_group
  location            = var.location

  sku {
    name = "Standard_v2"
    tier = "Standard_v2"
  }

  autoscale_configuration {
    min_capacity = 1
    max_capacity = 5
  }

  gateway_ip_configuration {
    name      = "${var.name_prefix}-gwip"
    subnet_id = var.appgw_subnet_id
  }

  frontend_ip_configuration {
    name                 = local.frontend_ip_config
    public_ip_address_id = azurerm_public_ip.appgw.id
  }

  frontend_port { name = local.frontend_port_http;  port = 80  }
  frontend_port { name = local.frontend_port_https; port = 443 }

  # Backend pools — targets are managed by AGIC after AKS services are created
  backend_address_pool { name = local.gateway_pool }
  backend_address_pool { name = local.web_pool     }

  backend_http_settings {
    name                  = local.http_settings
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 120
    probe_name            = "${var.name_prefix}-health-probe"
  }

  probe {
    name                = "${var.name_prefix}-health-probe"
    protocol            = "Http"
    path                = "/api/healthz"
    host                = "127.0.0.1"
    interval            = 15
    timeout             = 10
    unhealthy_threshold = 3
    match {
      status_code = ["200-399"]
    }
  }

  # Single HTTP listener — no host_name conflict, path map below handles routing.
  http_listener {
    name                           = local.main_listener
    frontend_ip_configuration_name = local.frontend_ip_config
    frontend_port_name             = local.frontend_port_http
    protocol                       = "Http"
  }

  # Route /api/* to AKS gateway service; all other paths → web frontend
  url_path_map {
    name                               = "${var.name_prefix}-url-map"
    default_backend_address_pool_name  = local.web_pool
    default_backend_http_settings_name = local.http_settings

    path_rule {
      name                       = "api-rule"
      paths                      = ["/api/*"]
      backend_address_pool_name  = local.gateway_pool
      backend_http_settings_name = local.http_settings
    }
  }

  request_routing_rule {
    name               = "${var.name_prefix}-routing-rule"
    rule_type          = "PathBasedRouting"
    http_listener_name = local.main_listener
    url_path_map_name  = "${var.name_prefix}-url-map"
    priority           = 100
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [
      # AGIC manages backend pool membership, listeners, routing rules after initial creation
      backend_address_pool,
      backend_http_settings,
      http_listener,
      probe,
      request_routing_rule,
      url_path_map,
    ]
  }
}

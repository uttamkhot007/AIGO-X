data "azurerm_client_config" "current" {}

resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.name_prefix}-aks"
  resource_group_name = var.resource_group
  location            = var.location
  dns_prefix          = "${var.name_prefix}-aks"
  kubernetes_version  = var.k8s_version

  default_node_pool {
    name                 = "system"
    node_count           = var.system_node_count
    vm_size              = var.system_node_vm_size
    vnet_subnet_id       = var.aks_subnet_id
    os_disk_size_gb      = 128
    type                 = "VirtualMachineScaleSets"
    only_critical_addons_enabled = true

    upgrade_settings {
      max_surge = "33%"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin     = "azure"
    network_policy     = "azure"
    load_balancer_sku  = "standard"
    outbound_type      = "loadBalancer"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  key_vault_secrets_provider {
    secret_rotation_enabled = true
  }

  azure_policy_enabled             = true
  http_application_routing_enabled = false
  # Required for Workload Identity (AGIC auth, Key Vault CSI, future service accounts)
  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  auto_scaler_profile {
    balance_similar_node_groups      = true
    skip_nodes_with_system_pods      = false
    scale_down_delay_after_add       = "5m"
    scale_down_unneeded              = "5m"
  }

  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [2, 3, 4]
    }
  }

  tags = var.tags
}

# ── Workload Node Pool ────────────────────────────────────────────────────────
resource "azurerm_kubernetes_cluster_node_pool" "workload" {
  name                  = "workload"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = var.user_node_vm_size
  vnet_subnet_id        = var.aks_subnet_id
  enable_auto_scaling   = true
  min_count             = var.user_node_min_count
  max_count             = var.user_node_max_count
  os_disk_size_gb       = 128

  upgrade_settings {
    max_surge = "33%"
  }

  tags = var.tags
}

# ── Log Analytics (for AKS monitoring) ───────────────────────────────────────
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.name_prefix}-logs"
  resource_group_name = var.resource_group
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

# ── Grant AKS pull access to ACR ─────────────────────────────────────────────
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}

# ── Grant AKS Managed Identity access to Key Vault secrets ───────────────────
resource "azurerm_role_assignment" "aks_kv_secrets" {
  scope                = var.keyvault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_kubernetes_cluster.main.key_vault_secrets_provider[0].secret_identity[0].object_id
}

# ── AGIC User-Assigned Managed Identity ──────────────────────────────────────
# AGIC uses Workload Identity (not aadPodIdentity) to control App Gateway.
# The Helm install in deploy.sh references agic_identity_client_id.
resource "azurerm_user_assigned_identity" "agic" {
  name                = "${var.name_prefix}-agic-identity"
  resource_group_name = var.resource_group
  location            = var.location
  tags                = var.tags
}

# Federated credential so the AGIC pod (kube-system/ingress-azure SA) can
# exchange a Kubernetes ServiceAccount token for an Azure access token.
resource "azurerm_federated_identity_credential" "agic" {
  name                = "${var.name_prefix}-agic-federated"
  resource_group_name = var.resource_group
  parent_id           = azurerm_user_assigned_identity.agic.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.main.oidc_issuer_url
  subject             = "system:serviceaccount:kube-system:ingress-azure"
}

# AGIC needs Contributor on the App Gateway to manage listeners/rules/pools.
resource "azurerm_role_assignment" "agic_appgw_contributor" {
  scope                = var.appgw_id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.agic.principal_id
}

# AGIC also reads resource group metadata (e.g. virtual network / public IP).
resource "azurerm_role_assignment" "agic_rg_reader" {
  scope                = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/resourceGroups/${var.resource_group}"
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.agic.principal_id
}

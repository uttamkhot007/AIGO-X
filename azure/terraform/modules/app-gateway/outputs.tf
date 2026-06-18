output "id"        { value = azurerm_application_gateway.main.id }
output "public_ip" { value = azurerm_public_ip.appgw.ip_address }
output "fqdn"      { value = azurerm_public_ip.appgw.fqdn }

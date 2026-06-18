output "service_account_email" { value = google_service_account.secret_accessor.email }
output "service_account_id"    { value = google_service_account.secret_accessor.id }

output "secret_names" {
  description = "Map of app secret key → Secret Manager secret_id (excludes db/redis secrets)"
  value = { for k, v in google_secret_manager_secret.app_secrets : k => v.secret_id }
}

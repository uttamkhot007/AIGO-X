output "host"               { value = google_redis_instance.main.host; sensitive = true }
output "port"               { value = google_redis_instance.main.port }
output "auth_string"        { value = google_redis_instance.main.auth_string; sensitive = true }
output "instance_name"      { value = google_redis_instance.main.name }
output "redis_auth_secret_id" { value = google_secret_manager_secret.redis_auth.secret_id }

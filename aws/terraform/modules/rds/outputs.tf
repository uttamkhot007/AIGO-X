output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "db_address" {
  value     = aws_db_instance.main.address
  sensitive = true
}

output "db_port" {
  value = aws_db_instance.main.port
}

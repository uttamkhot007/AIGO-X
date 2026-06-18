output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}

output "gateway_tg_arn" {
  value = aws_lb_target_group.gateway.arn
}

output "web_tg_arn" {
  value = aws_lb_target_group.web.arn
}

output "https_listener_arn" {
  value = length(aws_lb_listener.https) > 0 ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
}

output "http_listener_arn" {
  value = aws_lb_listener.http.arn
}

locals {
  service_image_map = {
    for svc, cfg in var.services :
    svc => lookup(var.ecr_repositories, svc, "${var.ecr_registry}/${var.name_prefix}/${svc}:${var.image_tag}")
  }

  service_ports = {
    gateway     = 8080
    auth        = 8001
    risk        = 8002
    compliance  = 8003
    governance  = 8004
    privacy     = 8005
    evidence    = 8006
    secops      = 8007
    ai          = 8008
    trust       = 8009
    integration = 8010
    web         = 80
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "services" {
  for_each          = var.services
  name              = "/ecs/${var.name_prefix}/${each.key}"
  retention_in_days = 30
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.name_prefix}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ── Task Definitions ──────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "service" {
  for_each = var.services

  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${lookup(var.ecr_repositories, each.key, "${var.ecr_registry}/${var.name_prefix}/${each.key}")}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = local.service_ports[each.key]
          protocol      = "tcp"
        }
      ]

      environment = concat(
        [
          { name = "PORT",     value = tostring(local.service_ports[each.key]) },
          { name = "NODE_ENV", value = "production" },
          { name = "DB_HOST",  value = var.db_host },
          { name = "DB_NAME",  value = var.db_name },
          { name = "DB_USER",  value = var.db_username },
          { name = "REDIS_HOST", value = var.redis_endpoint },
        ],
        each.key == "gateway" ? [
          { name = "AUTH_SERVICE_URL",        value = "http://auth.${var.name_prefix}.local:8001" },
          { name = "RISK_SERVICE_URL",        value = "http://risk.${var.name_prefix}.local:8002" },
          { name = "COMPLIANCE_SERVICE_URL",  value = "http://compliance.${var.name_prefix}.local:8003" },
          { name = "GOVERNANCE_SERVICE_URL",  value = "http://governance.${var.name_prefix}.local:8004" },
          { name = "PRIVACY_SERVICE_URL",     value = "http://privacy.${var.name_prefix}.local:8005" },
          { name = "EVIDENCE_SERVICE_URL",    value = "http://evidence.${var.name_prefix}.local:8006" },
          { name = "SECOPS_SERVICE_URL",      value = "http://secops.${var.name_prefix}.local:8007" },
          { name = "AI_SERVICE_URL",          value = "http://ai.${var.name_prefix}.local:8008" },
          { name = "TRUST_SERVICE_URL",       value = "http://trust.${var.name_prefix}.local:8009" },
          { name = "INTEGRATION_SERVICE_URL", value = "http://integration.${var.name_prefix}.local:8010" },
        ] : []
      )

      secrets = [
        { name = "JWT_SECRET",           valueFrom = "${var.secrets_arn}:JWT_SECRET::" },
        { name = "DATABASE_URL",         valueFrom = var.database_url_secret_arn },
        { name = "DB_PASSWORD",          valueFrom = "${var.secrets_arn}:DB_PASSWORD::" },
        { name = "REDIS_PASSWORD",       valueFrom = "${var.secrets_arn}:REDIS_AUTH_TOKEN::" },
        { name = "TOKEN_ENCRYPTION_KEY", valueFrom = "${var.secrets_arn}:TOKEN_ENCRYPTION_KEY::" },
        { name = "OPENAI_API_KEY",       valueFrom = "${var.secrets_arn}:OPENAI_API_KEY::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.name_prefix}/${each.key}"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        # web service (nginx) exposes /health; API services expose /api/healthz
        command     = ["CMD-SHELL", each.key == "web" ? "wget -qO- http://localhost:80/health || exit 1" : "wget -qO- http://localhost:${local.service_ports[each.key]}/api/healthz || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = { Name = "${var.name_prefix}-${each.key}" }
}

# ── Service Discovery (Cloud Map) ─────────────────────────────────────────────
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.name_prefix}.local"
  description = "Private DNS namespace for AIGO-X service discovery"
  vpc         = var.vpc_id

  tags = { Name = "${var.name_prefix}-namespace" }
}

resource "aws_service_discovery_service" "service" {
  for_each = var.services
  name     = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# ── ECS Services ──────────────────────────────────────────────────────────────
resource "aws_ecs_service" "service" {
  for_each = var.services

  name            = "${var.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.min_capacity
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_sg_id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.service[each.key].arn
  }

  dynamic "load_balancer" {
    for_each = each.key == "gateway" ? [1] : []
    content {
      target_group_arn = var.gateway_target_group_arn
      container_name   = "gateway"
      container_port   = 8080
    }
  }

  dynamic "load_balancer" {
    for_each = each.key == "web" ? [1] : []
    content {
      target_group_arn = var.web_target_group_arn
      container_name   = "web"
      container_port   = 80
    }
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = { Name = "${var.name_prefix}-${each.key}" }
}

# ── Auto Scaling ──────────────────────────────────────────────────────────────
resource "aws_appautoscaling_target" "service" {
  for_each           = var.services
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.service[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = var.services
  name               = "${var.name_prefix}-${each.key}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory" {
  for_each           = var.services
  name               = "${var.name_prefix}-${each.key}-mem-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.service[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.service[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.service[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

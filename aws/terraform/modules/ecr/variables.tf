variable "name_prefix" {
  type = string
}

variable "services" {
  type        = list(string)
  description = "List of service names to create ECR repositories for"
}

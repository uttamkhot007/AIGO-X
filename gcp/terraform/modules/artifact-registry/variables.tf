variable "name_prefix" { type = string }
variable "gcp_project" { type = string }
variable "location"    { type = string }

variable "services" {
  type        = list(string)
  description = "Not used — kept for backward compat; single repo holds all services"
  default     = []
}

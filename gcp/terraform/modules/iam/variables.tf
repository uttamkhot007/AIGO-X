variable "name_prefix"  { type = string }
variable "gcp_project"  { type = string }

variable "all_secret_names" {
  type        = map(string)
  description = "Map of secret key → Secret Manager secret_id (all secrets: app + db + redis)"
}

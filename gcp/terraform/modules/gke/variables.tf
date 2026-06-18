variable "name_prefix"          { type = string }
variable "gcp_project"          { type = string }
variable "gcp_region"           { type = string }
variable "network_id"           { type = string }
variable "subnetwork_id"        { type = string }
variable "pods_range_name"      { type = string }
variable "services_range_name"  { type = string }
variable "k8s_version_prefix"   { type = string }
variable "release_channel"      { type = string }
variable "workload_sa_email"    { type = string }

variable "master_authorized_cidr" {
  type        = string
  description = "CIDR allowed to reach the GKE API server. Use your corporate VPN/bastion CIDR in prod."
  default     = "10.0.0.0/8"
}

// @ts-nocheck
import React, { useState, useMemo, useCallback } from "react";
import { useCspmFindings } from "@/hooks/useGrcApi";
import { useOrg } from "@/context/OrgContext";

// ── Design tokens (match CloudOps) ────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const RED = "#F87171";
const AMB = "#FCD34D";
const BLU = "#60A5FA";
const PRP = "#C4B5FD";
const GRN = "#4ADE80";
const YEL = "#FDE68A";
const CYN = "#22D3EE";

const card = (ex: React.CSSProperties = {}): React.CSSProperties => ({
  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35)", ...ex,
});

const SEV_C:  Record<string,string> = { Critical: RED,  High: AMB,  Medium: YEL, Low: BLU };
const SEV_BG: Record<string,string> = { Critical:"rgba(248,113,113,0.13)", High:"rgba(252,211,77,0.11)", Medium:"rgba(253,230,138,0.10)", Low:"rgba(96,165,250,0.10)" };
const STAT_C: Record<string,string> = { open: RED, "in-remediation": AMB, resolved: EME, suppressed:"var(--muted-foreground)" };
const PROV_C: Record<string,string> = { AWS:"#FF9900", Azure:"#0078D4", GCP:"#4285F4" };

// ── Framework catalogue ───────────────────────────────────────────────────────
const FW_CATALOGUE = [
  { id:"cis-aws",   name:"CIS AWS",       ver:"v3.0",     provider:"AWS",   total:58, passing:41, score:71, color:"#FF9900" },
  { id:"cis-az",    name:"CIS Azure",     ver:"v2.0",     provider:"Azure", total:57, passing:39, score:68, color:"#0078D4" },
  { id:"cis-gcp",   name:"CIS GCP",       ver:"v2.0",     provider:"GCP",   total:58, passing:43, score:74, color:"#4285F4" },
  { id:"pci-dss",   name:"PCI DSS",       ver:"v4.0",     provider:"All",   total:59, passing:47, score:80, color:"#8B5CF6" },
  { id:"soc2",      name:"SOC 2",         ver:"Type II",  provider:"All",   total:60, passing:49, score:82, color:"#EC4899" },
  { id:"nist-csf",  name:"NIST CSF",      ver:"v1.1",     provider:"All",   total:75, passing:57, score:76, color:"#10B981" },
  { id:"iso27001",  name:"ISO 27001",     ver:"2022",     provider:"All",   total:70, passing:58, score:83, color:"#F59E0B" },
  { id:"aws-waf",   name:"AWS Well-Arch", ver:"2024",     provider:"AWS",   total:75, passing:52, score:69, color:"#EF4444" },
];

// ── Rule → framework & detail mapping ────────────────────────────────────────
type RuleInfo = { frameworks: string[]; description: string; impact: string; category: string; iacFix?: string };
const RULE_INFO: Record<string, RuleInfo> = {
  SG_UNRESTRICTED_SSH: {
    frameworks:["CIS AWS 4.1","SOC 2 CC6.6","PCI DSS 1.2.1","NIST CSF PR.AC-5"],
    category:"Network Security",
    description:"A security group allows unrestricted inbound SSH (TCP/22) from any source (0.0.0.0/0 or ::/0). This exposes the compute instance to brute-force attacks, credential stuffing, and zero-day SSH exploits from the entire internet.",
    impact:"Any internet host can attempt SSH authentication, dramatically increasing the attack surface. Shell access via a compromised credential enables lateral movement, metadata service exfiltration, and full data store access.",
    iacFix:`resource "aws_security_group_rule" "restrict_ssh" {\n  type        = "ingress"\n  from_port   = 22\n  to_port     = 22\n  protocol    = "tcp"\n  cidr_blocks = ["10.0.0.0/8"]   # bastion CIDR only\n  security_group_id = aws_security_group.prod.id\n}`,
  },
  S3_PUBLIC_READ_ACL: {
    frameworks:["CIS AWS 2.1.5","SOC 2 CC6.1","ISO 27001 A.13.1.3","AWS Well-Arch SEC.7"],
    category:"Data Protection",
    description:"An S3 bucket has a public-read ACL enabled, allowing any unauthenticated user to list and download all objects. This is critical when the bucket contains database backups, application configs, or personally identifiable information.",
    impact:"Complete data exfiltration without authentication. Credential files embedded in backups can lead to account takeover. GDPR/CCPA reportable exposure if PII is present.",
    iacFix:`resource "aws_s3_bucket_public_access_block" "backups" {\n  bucket                  = "acme-backups-prod"\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}`,
  },
  IAM_ROOT_KEY_ACTIVE: {
    frameworks:["CIS AWS 1.4","SOC 2 CC6.3","PCI DSS 8.2.1","NIST CSF PR.AC-1"],
    category:"Identity & Access",
    description:"The AWS account root user has active long-term programmatic access keys. Root keys bypass all IAM permission boundaries and provide unrestricted access to every AWS service and resource in the account.",
    impact:"A leaked root key grants full, unrestricted account compromise — disable GuardDuty, delete CloudTrail, exfiltrate all data. No blast-radius limit exists for root credentials.",
    iacFix:`# Delete root access keys immediately — cannot be done via Terraform\n# CLI: aws iam delete-access-key --access-key-id <KEY_ID>\n# Then enforce: aws iam create-account-password-policy`,
  },
  "IAM-NO-MFA": {
    frameworks:["CIS AWS 1.10","SOC 2 CC6.1","PCI DSS 8.3.6","ISO 27001 A.9.4.2"],
    category:"Identity & Access",
    description:"An IAM user with console access or active access keys does not have MFA enabled. Password-only authentication provides no second-factor protection against credential theft, phishing, or password spray attacks.",
    impact:"Stolen password → immediate console and API access. No friction for an attacker who obtained the credential via phishing, credential stuffing, or dark-web purchase.",
    iacFix:`resource "aws_iam_account_password_policy" "strict" {\n  require_uppercase_characters = true\n  require_lowercase_characters = true\n  require_numbers              = true\n  require_symbols              = true\n  minimum_password_length      = 16\n  # Pair with SCPs enforcing MFA for all console access\n}`,
  },
  IAM_MFA_NOT_ENFORCED: {
    frameworks:["CIS AWS 1.10","SOC 2 CC6.1","PCI DSS 8.3.6","ISO 27001 A.9.4.2"],
    category:"Identity & Access",
    description:"IAM policies do not enforce MFA for console and sensitive API actions. Without conditional enforcement, users can authenticate and perform privileged operations with only a password.",
    impact:"Credential compromise directly leads to privilege abuse. Attackers escalate through unguarded admin actions without any secondary factor check.",
    iacFix:`# SCP to enforce MFA for all non-root actions:\n# Condition: { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }\n# Effect: Deny on all actions except sts:GetSessionToken`,
  },
  "IAM-ADMIN-OVERPERMISSIVE": {
    frameworks:["CIS AWS 1.16","SOC 2 CC6.3","PCI DSS 7.1.2","ISO 27001 A.9.2.3"],
    category:"Identity & Access",
    description:"An IAM role or managed policy uses wildcard (*:*) actions, granting unrestricted administrator access. This violates the principle of least privilege and maximises the blast radius of any workload compromise.",
    impact:"Any service assuming this role gains full account admin. A single compromised Lambda, EC2 instance, or CI pipeline immediately elevates to full account takeover.",
    iacFix:`# Replace with scoped policy:\nresource "aws_iam_policy" "least_privilege" {\n  policy = jsonencode({\n    Version   = "2012-10-17"\n    Statement = [{ Action = ["s3:GetObject","s3:PutObject"], Effect = "Allow", Resource = "arn:aws:s3:::acme-app-bucket/*" }]\n  })\n}`,
  },
  EC2_PUBLIC_IP_BASTION: {
    frameworks:["CIS AWS 5.2","SOC 2 CC6.6","PCI DSS 1.3.2","NIST CSF PR.AC-5"],
    category:"Network Security",
    description:"A bastion host has a public IP and SSH open to the internet. This creates a high-value, highly visible attack surface. Bastion compromise grants attackers a network foothold into private VPC segments.",
    impact:"Continuous brute-force, exploitation of SSH CVEs (e.g. CVE-2023-38408), and social engineering risks. Compromised bastion provides authenticated VPC-level access.",
    iacFix:`# Use AWS Systems Manager Session Manager instead:\nresource "aws_iam_role_policy_attachment" "ssm_core" {\n  role       = aws_iam_role.ec2_role.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"\n}\n# Remove all security group inbound rules for port 22`,
  },
  "S3-PUBLIC-READ-WRITE": {
    frameworks:["CIS AWS 2.1.5","SOC 2 CC6.1","PCI DSS 7.2.1","ISO 27001 A.8.2.3"],
    category:"Data Protection",
    description:"An S3 bucket allows both public READ and WRITE access. Any unauthenticated user can list, download, overwrite, or delete objects, and upload malicious content.",
    impact:"Full data exfiltration + content injection. Attackers can overwrite application assets (web shells), inject malware, or destroy production data at zero cost.",
    iacFix:`resource "aws_s3_bucket_acl" "secure" {\n  bucket = "acme-prod-data"\n  acl    = "private"\n}\nresource "aws_s3_bucket_public_access_block" "secure" {\n  bucket                  = "acme-prod-data"\n  block_public_acls       = true\n  block_public_policy     = true\n}`,
  },
  VM_NO_JIT_ACCESS: {
    frameworks:["CIS Azure 7.4","SOC 2 CC6.6","NIST CSF PR.AC-3","ISO 27001 A.9.1.2"],
    category:"Network Security",
    description:"An Azure virtual machine does not have Just-in-Time (JIT) access configured. Management ports (RDP 3389 / SSH 22) are permanently accessible rather than opened on-demand for authorized sessions only.",
    impact:"Permanent exposure to internet-wide port scanners and brute-force automation. JIT restricts the attack window to authorized sessions lasting minutes.",
    iacFix:`resource "azurerm_security_center_jit_network_access_policy" "vm" {\n  name               = "jit-policy"\n  location           = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  virtual_machine_id = azurerm_linux_virtual_machine.vm.id\n  timeoutInMinutes   = 3\n}`,
  },
  "AZURE-AD-SP-SECRET-EXPIRY": {
    frameworks:["CIS Azure 1.22","SOC 2 CC6.1","ISO 27001 A.9.4.2","NIST CSF PR.AC-1"],
    category:"Identity & Access",
    description:"An Azure AD service principal client secret expires within 14 days. Near-expiry indicates poor credential lifecycle management and may cause production outages if the secret is not rotated proactively.",
    impact:"Service outage on expiry. Pre-expiry window creates urgency that motivates insecure emergency practices. Indicates broader secret sprawl risk across the environment.",
    iacFix:`# Rotate SP secret via CLI:\n# az ad sp credential reset --id <APP_ID> --years 1\n# Use Managed Identity or federated credentials instead:\n# az ad app federated-credential create ...`,
  },
  GCP_SA_OWNER_ROLE: {
    frameworks:["CIS GCP 1.5","SOC 2 CC6.3","ISO 27001 A.9.2.3","NIST CSF PR.AC-4"],
    category:"Identity & Access",
    description:"A GCP service account has been granted the project Owner IAM role. Service accounts should never hold primitive Owner, Editor, or Viewer roles — only purpose-scoped predefined or custom roles.",
    impact:"Any workload running as this service account has unrestricted project control — modify IAM policies, access all storage, run compute, and exfiltrate any data.",
    iacFix:`resource "google_project_iam_binding" "scoped_sa" {\n  project = var.project_id\n  role    = "roles/storage.objectViewer"  # Least-privilege role\n  members = ["serviceAccount:\${google_service_account.app_sa.email}"]\n}\n# Remove: roles/owner binding`,
  },
  GCP_FW_ALLOW_ALL_INGRESS: {
    frameworks:["CIS GCP 3.5","SOC 2 CC6.6","PCI DSS 1.2.1","NIST CSF PR.AC-5"],
    category:"Network Security",
    description:"A GCP VPC firewall rule with priority 65534 allows all ingress traffic from 0.0.0.0/0 on all ports. This effectively disables network perimeter security for the entire VPC.",
    impact:"Full port scan and exploit capability from any internet source. All compute in the VPC is exposed to services they should never receive external traffic on.",
    iacFix:`resource "google_compute_firewall" "deny_all_ingress" {\n  name    = "deny-all-ingress"\n  network = google_compute_network.main.name\n  priority = 65000\n  deny { protocol = "all" }\n  source_ranges = ["0.0.0.0/0"]\n}`,
  },
  ENTRA_MFA_NOT_REQUIRED: {
    frameworks:["CIS Azure 1.1","SOC 2 CC6.1","ISO 27001 A.9.4.2","NIST CSF PR.AC-7"],
    category:"Identity & Access",
    description:"Microsoft Entra ID (Azure AD) does not require MFA for privileged administrator accounts via Conditional Access Policy. Admin sign-ins succeed with password alone.",
    impact:"Phishing or credential stuffing → immediate tenant-admin access. Full tenant compromise including directory, subscriptions, and all Azure resources.",
    iacFix:`# Create Entra Conditional Access policy:\n# - Apply to: All admins / Global Admin role\n# - Require MFA grant control\n# Use: az ad signed-in-user show (verify before deploying)\n# Or Terraform: azuread_conditional_access_policy`,
  },
  RDS_NOT_ENCRYPTED: {
    frameworks:["CIS AWS 2.3.1","PCI DSS 3.5.1","ISO 27001 A.10.1.1","HIPAA 164.312.a.2.iv"],
    category:"Data Protection",
    description:"An RDS database instance does not have encryption at rest enabled. All database files, automated backups, read replicas, and snapshots are stored as plaintext on disk.",
    impact:"Physical disk access, EBS snapshot sharing, or cloud provider-side compromise exposes all database contents. Automatic snapshots are also unencrypted and could be shared accidentally.",
    iacFix:`resource "aws_db_instance" "secure" {\n  identifier        = "analytics-mysql-prod"\n  # Encryption requires snapshot + restore:\n  storage_encrypted = true\n  kms_key_id        = aws_kms_key.rds.arn\n  # Note: enable on new instance; existing requires snapshot copy\n}`,
  },
  VM_DISK_ENCRYPTION: {
    frameworks:["CIS Azure 7.2","ISO 27001 A.10.1.1","NIST 800-53 SC-28","SOC 2 CC6.7"],
    category:"Data Protection",
    description:"Azure VM OS and data disks are not encrypted with Azure Disk Encryption (ADE) or platform-managed encryption with customer-managed keys (CMK). Data is stored without end-to-end disk-level protection.",
    impact:"Disk snapshots, detached disk scenarios, or data center physical access could expose all VM disk contents without any encryption barrier.",
    iacFix:`resource "azurerm_disk_encryption_set" "vm_enc" {\n  name                = "vm-disk-encryption"\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  key_vault_key_id    = azurerm_key_vault_key.disk_key.id\n}`,
  },
  BLOB_PUBLIC_ACCESS: {
    frameworks:["CIS Azure 3.7","SOC 2 CC6.1","ISO 27001 A.8.2.3","PCI DSS 7.2.1"],
    category:"Data Protection",
    description:"An Azure Blob Storage container has anonymous public read access enabled. All blobs in the container are accessible without credentials via the storage account endpoint.",
    impact:"Unauthenticated data exposure. Application logs, backups, or customer data accessible to the internet without audit trail.",
    iacFix:`resource "azurerm_storage_account" "secure" {\n  name                     = "acmeprodstore001"\n  allow_nested_items_to_be_public = false\n  min_tls_version          = "TLS1_2"\n}`,
  },
  GCS_BUCKET_PUBLIC: {
    frameworks:["CIS GCP 5.1","SOC 2 CC6.1","ISO 27001 A.13.1.3","NIST CSF PR.DS-5"],
    category:"Data Protection",
    description:"A GCS bucket has public access enabled via allUsers or allAuthenticatedUsers IAM binding. All objects are readable by anyone without authentication.",
    impact:"Full object-level data exposure. ML model weights, training data, or customer PII may be publicly accessible and indexed by web crawlers.",
    iacFix:`resource "google_storage_bucket_iam_binding" "secure" {\n  bucket = google_storage_bucket.models.name\n  role   = "roles/storage.objectViewer"\n  members = ["serviceAccount:\${google_service_account.app.email}"]\n  # Remove: allUsers / allAuthenticatedUsers members\n}`,
  },
};

const defaultRuleInfo = (rule: string): RuleInfo => ({
  frameworks: ["CIS","SOC 2 CC6","NIST CSF","ISO 27001 A"],
  category: "Configuration",
  description:`A cloud security misconfiguration (${rule}) has been detected that violates one or more compliance framework controls. The resource is not aligned with the expected security baseline.`,
  impact: "Unauthorized access, data exposure, or privilege escalation may be possible depending on the resource type and context.",
});

const getInfo = (rule: string): RuleInfo => RULE_INFO[rule] ?? defaultRuleInfo(rule);

// ── Attack path definitions ────────────────────────────────────────────────────
type APNode = { id:string; x:number; y:number; icon:string; label:string; sub:string; color:string; border:string; pulse?:boolean };
type APEdge = { from:string; to:string; label:string; type:"attack"|"lateral"|"data" };
type AttackPath = { title:string; nodes:APNode[]; edges:APEdge[] };

const EDGE_C: Record<string,string> = { attack: RED, lateral: AMB, data: BLU };

const AP: Record<string, AttackPath> = {
  ssh: {
    title:"SSH Brute-Force → Lateral Movement → Data Exfiltration",
    nodes:[
      {id:"inet",  x:50,  y:115, icon:"🌐", label:"Internet",      sub:"External attacker", color:"rgba(248,113,113,0.2)",border:RED},
      {id:"sg",    x:195, y:65,  icon:"🔓", label:"Open SG",        sub:"Port 22/0.0.0.0/0", color:"rgba(248,113,113,0.18)",border:RED, pulse:true},
      {id:"ec2",   x:195, y:170, icon:"🖥",  label:"EC2 Bastion",    sub:"prod-bastion-1",    color:"rgba(147,197,253,0.15)",border:BLU},
      {id:"iam",   x:360, y:115, icon:"🔑", label:"IAM Role",       sub:"ec2-admin-role",    color:"rgba(196,181,253,0.18)",border:PRP},
      {id:"s3",    x:520, y:65,  icon:"🗄",  label:"S3 Backups",     sub:"DB dumps · PII",    color:"rgba(252,211,77,0.15)", border:AMB, pulse:true},
      {id:"rds",   x:520, y:170, icon:"🗃",  label:"RDS Prod",       sub:"prod-postgres",     color:"rgba(252,211,77,0.15)", border:AMB},
    ],
    edges:[
      {from:"inet",to:"sg",  label:"Port 22/TCP",    type:"attack"},
      {from:"sg",  to:"ec2", label:"SSH auth",        type:"attack"},
      {from:"ec2", to:"iam", label:"Priv escalation", type:"lateral"},
      {from:"iam", to:"s3",  label:"GetObject *",     type:"data"},
      {from:"iam", to:"rds", label:"DB connect",      type:"data"},
    ],
  },
  s3: {
    title:"Anonymous S3 Read → Credential Exposure → Account Takeover",
    nodes:[
      {id:"inet", x:50,  y:115, icon:"🌐", label:"Internet",         sub:"Anonymous user",     color:"rgba(248,113,113,0.2)",  border:RED},
      {id:"s3",   x:200, y:115, icon:"🗄",  label:"S3 Public Bucket", sub:"READ ACL enabled",   color:"rgba(248,113,113,0.18)", border:RED, pulse:true},
      {id:"dump", x:370, y:60,  icon:"📄", label:"DB Dumps / PII",   sub:"2.3 GB exposed",     color:"rgba(252,211,77,0.15)",  border:AMB, pulse:true},
      {id:"cred", x:370, y:170, icon:"🔑", label:"AWS Credentials",  sub:".env · config files", color:"rgba(196,181,253,0.18)",border:PRP},
      {id:"full", x:530, y:115, icon:"⚠",  label:"Account Takeover", sub:"Full admin access",   color:"rgba(248,113,113,0.22)", border:RED, pulse:true},
    ],
    edges:[
      {from:"inet",to:"s3",  label:"HTTP GET anon",   type:"attack"},
      {from:"s3",  to:"dump",label:"List + download",  type:"data"},
      {from:"s3",  to:"cred",label:"Credential files", type:"lateral"},
      {from:"cred",to:"full",label:"API call w/ key",  type:"attack"},
    ],
  },
  iam: {
    title:"Compromised Root Key → Full Account Control → Stealth",
    nodes:[
      {id:"atk",  x:50,  y:115, icon:"👤", label:"Attacker",       sub:"Root key leaked",    color:"rgba(248,113,113,0.2)",  border:RED},
      {id:"root", x:200, y:115, icon:"🔑", label:"Root IAM Key",   sub:"No MFA enforced",    color:"rgba(248,113,113,0.18)", border:RED, pulse:true},
      {id:"ec2",  x:370, y:60,  icon:"🖥",  label:"All EC2",        sub:"Full control",       color:"rgba(147,197,253,0.15)", border:BLU},
      {id:"s3",   x:370, y:170, icon:"🗄",  label:"All S3",         sub:"Read/Write/Delete",  color:"rgba(252,211,77,0.15)",  border:AMB},
      {id:"rds",  x:530, y:60,  icon:"🗃",  label:"All RDS",        sub:"Full admin",         color:"rgba(252,211,77,0.15)",  border:AMB, pulse:true},
      {id:"ct",   x:530, y:170, icon:"🚫", label:"CloudTrail Off", sub:"Stealth mode",       color:"rgba(248,113,113,0.15)", border:RED},
    ],
    edges:[
      {from:"atk",  to:"root",label:"API auth",       type:"attack"},
      {from:"root", to:"ec2", label:"Full EC2",        type:"data"},
      {from:"root", to:"s3",  label:"Full S3",         type:"data"},
      {from:"ec2",  to:"rds", label:"DB connect",      type:"lateral"},
      {from:"root", to:"ct",  label:"Disable logging", type:"lateral"},
    ],
  },
  gcp: {
    title:"Open Firewall → Owner SA Abuse → Full GCP Project Compromise",
    nodes:[
      {id:"inet",x:50,  y:115, icon:"🌐", label:"Internet",     sub:"All sources",          color:"rgba(248,113,113,0.2)",  border:RED},
      {id:"fw",  x:200, y:115, icon:"🔓", label:"Open Firewall", sub:"All ports 0.0.0.0/0", color:"rgba(248,113,113,0.18)", border:RED, pulse:true},
      {id:"vm",  x:360, y:65,  icon:"🖥",  label:"GCE Instance", sub:"With SA attached",    color:"rgba(66,133,244,0.15)",  border:"#4285F4"},
      {id:"sa",  x:360, y:170, icon:"🔑", label:"Owner SA",      sub:"Project Owner role",  color:"rgba(196,181,253,0.18)", border:PRP, pulse:true},
      {id:"bq",  x:520, y:65,  icon:"📊", label:"BigQuery",      sub:"Analytics data",      color:"rgba(252,211,77,0.15)",  border:AMB},
      {id:"gcs", x:520, y:170, icon:"🗄",  label:"GCS Buckets",  sub:"All storage",         color:"rgba(252,211,77,0.15)",  border:AMB},
    ],
    edges:[
      {from:"inet",to:"fw", label:"All ports",     type:"attack"},
      {from:"fw",  to:"vm", label:"SSH/RDP",        type:"attack"},
      {from:"vm",  to:"sa", label:"Metadata API",   type:"lateral"},
      {from:"sa",  to:"bq", label:"BigQuery.read",  type:"data"},
      {from:"sa",  to:"gcs",label:"Storage.admin",  type:"data"},
    ],
  },
  azure: {
    title:"No JIT + Expired SP Secret → AKS → Tenant Compromise",
    nodes:[
      {id:"inet",x:50,  y:115, icon:"🌐", label:"Internet",     sub:"Persistent access",    color:"rgba(248,113,113,0.2)",  border:RED},
      {id:"vm",  x:195, y:65,  icon:"🖥",  label:"Azure VM",    sub:"Mgmt ports open",      color:"rgba(248,113,113,0.18)", border:RED, pulse:true},
      {id:"sp",  x:195, y:170, icon:"🔑", label:"SP Secret",    sub:"Expires in 3 days",    color:"rgba(196,181,253,0.18)", border:PRP, pulse:true},
      {id:"aks", x:360, y:115, icon:"📦", label:"AKS Cluster", sub:"RBAC disabled",         color:"rgba(0,120,212,0.15)",   border:"#0078D4"},
      {id:"kv",  x:520, y:65,  icon:"🔒", label:"Key Vault",   sub:"App secrets",           color:"rgba(252,211,77,0.15)",  border:AMB, pulse:true},
      {id:"sql", x:520, y:170, icon:"🗃",  label:"Azure SQL",   sub:"Prod databases",        color:"rgba(252,211,77,0.15)",  border:AMB},
    ],
    edges:[
      {from:"inet",to:"vm", label:"RDP/SSH",        type:"attack"},
      {from:"inet",to:"sp", label:"Stolen secret",  type:"attack"},
      {from:"vm",  to:"aks",label:"K8s API",         type:"lateral"},
      {from:"sp",  to:"aks",label:"SP auth",         type:"lateral"},
      {from:"aks", to:"kv", label:"Secret access",   type:"data"},
      {from:"aks", to:"sql",label:"DB creds",         type:"data"},
    ],
  },
  generic: {
    title:"Cloud Misconfiguration → Unauthorized Access → Data Exposure",
    nodes:[
      {id:"atk", x:50,  y:115, icon:"🌐", label:"External",          sub:"Unauthenticated",     color:"rgba(248,113,113,0.2)",  border:RED},
      {id:"vuln",x:210, y:115, icon:"⚠",  label:"Misconfiguration",  sub:"Access control gap",  color:"rgba(248,113,113,0.18)", border:RED, pulse:true},
      {id:"res", x:375, y:65,  icon:"🖥",  label:"Cloud Resource",    sub:"Affected asset",      color:"rgba(147,197,253,0.15)", border:BLU},
      {id:"data",x:375, y:170, icon:"📄", label:"Sensitive Data",    sub:"Exposed",             color:"rgba(252,211,77,0.15)",  border:AMB, pulse:true},
      {id:"full",x:535, y:115, icon:"🔓", label:"Unauthorized",      sub:"Compliance violation", color:"rgba(248,113,113,0.2)", border:RED},
    ],
    edges:[
      {from:"atk", to:"vuln",label:"Exploit",          type:"attack"},
      {from:"vuln",to:"res", label:"Access granted",   type:"lateral"},
      {from:"vuln",to:"data",label:"Data exposed",     type:"data"},
      {from:"res", to:"full",label:"Pivot",            type:"lateral"},
      {from:"data",to:"full",label:"Exfiltration",     type:"attack"},
    ],
  },
};

const getPath = (rule: string): AttackPath => {
  const r = rule.toUpperCase();
  if (r.includes("SSH") || r.includes("BASTION") || r.includes("K8S") || r.includes("EKS")) return AP.ssh;
  if (r.includes("S3") || r.includes("GCS_BUCKET") || r.includes("BLOB") || r.includes("STORAGE")) return AP.s3;
  if (r.includes("IAM") || r.includes("ROOT") || r.includes("MFA") || r.includes("OVERPERM")) return AP.iam;
  if (r.includes("GCP") || r.includes("SA_OWNER") || r.includes("FW_ALLOW") || r.includes("BQ_")) return AP.gcp;
  if (r.includes("AZURE") || r.includes("VM_NO") || r.includes("ENTRA") || r.includes("AKS") || r.includes("BLOB_") || r.includes("VM_DISK")) return AP.azure;
  return AP.generic;
};

// ── Attack Path SVG ───────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes ccPulse { 0%,100%{opacity:0.35;r:28} 50%{opacity:0.7;r:31} }
  @keyframes ccRingPulse { 0%,100%{opacity:0.2;stroke-width:1} 50%{opacity:0.55;stroke-width:2} }
`;

function AttackPathSVG({ path }: { path: AttackPath }) {
  const nodeMap = Object.fromEntries(path.nodes.map(n => [n.id, n]));

  // Cubic bezier midpoint (rough) for label placement
  const midOf = (e: APEdge) => {
    const a = nodeMap[e.from], b = nodeMap[e.to];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const edgePath = (e: APEdge) => {
    const a = nodeMap[e.from], b = nodeMap[e.to];
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  };

  return (
    <div>
      <style>{ANIM_CSS}</style>
      <svg width="100%" viewBox="0 0 590 230" style={{ display:"block", overflow:"visible" }}>
        <defs>
          {(["attack","lateral","data"] as const).map(t => (
            <marker key={t} id={`cc-arr-${t}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={EDGE_C[t]} fillOpacity="0.85" />
            </marker>
          ))}
          <filter id="cc-glow">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="cc-bg" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(147,197,253,0.04)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>

        {/* Edges */}
        {path.edges.map((e, i) => {
          const m = midOf(e);
          const lw = String(m.x.toFixed(0));
          const lh = String((m.y - 9).toFixed(0));
          return (
            <g key={i}>
              <path d={edgePath(e)} stroke={EDGE_C[e.type]} strokeWidth={1.8} fill="none"
                strokeOpacity={0.75}
                strokeDasharray={e.type === "lateral" ? "5,3" : undefined}
                markerEnd={`url(#cc-arr-${e.type})`}
              />
              <rect x={+lw - 28} y={+lh - 8} width={56} height={14} rx={4}
                fill="var(--card)" fillOpacity={0.9} />
              <text x={lw} y={lh + 2} textAnchor="middle" fontSize={7.5}
                fill={EDGE_C[e.type]} fontWeight={600}>{e.label}</text>
            </g>
          );
        })}

        {/* Nodes */}
        {path.nodes.map(n => (
          <g key={n.id}>
            {n.pulse && (
              <circle cx={n.x} cy={n.y} r={32} fill="none" stroke={n.border} strokeWidth={1.5}
                style={{ animation:"ccRingPulse 2.2s ease-in-out infinite" }}/>
            )}
            <circle cx={n.x} cy={n.y} r={22} fill={n.color} stroke={n.border}
              strokeWidth={n.pulse ? 2 : 1.5}
              style={n.pulse ? { filter:"url(#cc-glow)" } : undefined}
            />
            <text x={n.x} y={n.y + 7} textAnchor="middle" fontSize={17}>{n.icon}</text>
            <text x={n.x} y={n.y + 37} textAnchor="middle" fontSize={9} fontWeight={700}
              fill="var(--foreground)">{n.label}</text>
            <text x={n.x} y={n.y + 48} textAnchor="middle" fontSize={7.5}
              fill="var(--muted-foreground)">{n.sub}</text>
          </g>
        ))}
      </svg>

      <div style={{ display:"flex", gap:16, marginTop:8, justifyContent:"flex-end" }}>
        {([["attack",RED,"Attack path"],["lateral",AMB,"Lateral move"],["data",BLU,"Data access"]] as const).map(([t,c,l]) => (
          <div key={t} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:20, height:2, background:c, borderRadius:1, opacity:0.85 }}/>
            <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Framework scorecard strip ─────────────────────────────────────────────────
function ScoreArc({ pct, color, size=52 }: { pct:number; color:string; size?:number }) {
  const r = (size - 6) / 2, circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"/>
    </svg>
  );
}

function FrameworkStrip({ fws }: { fws: typeof FW_CATALOGUE; }) {
  return (
    <div style={{ display:"flex", gap:10, overflowX:"auto", padding:"0 0 12px 0", flexShrink:0,
      scrollbarWidth:"thin", scrollbarColor:"rgba(255,255,255,0.1) transparent" }}>
      {fws.map(f => {
        const failing = f.total - f.passing;
        const scoreColor = f.score >= 80 ? EME : f.score >= 65 ? AMB : RED;
        return (
          <div key={f.id} style={{ ...card({ padding:"12px 14px", flexShrink:0, minWidth:155, cursor:"pointer",
            borderColor: f.score < 70 ? "rgba(248,113,113,0.3)" : "var(--border)" }),
            transition:"border-color 0.2s", position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative" }}>
                <ScoreArc pct={f.score} color={scoreColor} />
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
                  justifyContent:"center", transform:"rotate(0deg)" }}>
                  <span style={{ fontSize:11, fontWeight:900, color:scoreColor,
                    fontFamily:"'JetBrains Mono',monospace" }}>{f.score}</span>
                </div>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:800, color:"var(--foreground)", whiteSpace:"nowrap" }}>{f.name}</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>{f.ver} · {f.provider}</div>
                <div style={{ display:"flex", gap:6, marginTop:5, fontSize:9 }}>
                  <span style={{ color:EME }}>✓ {f.passing}</span>
                  <span style={{ color:RED }}>✗ {failing}</span>
                  <span style={{ color:"var(--muted-foreground)" }}>of {f.total}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Finding row ───────────────────────────────────────────────────────────────
function FindingRow({ f, selected, onClick }: { f:any; selected:boolean; onClick:()=>void }) {
  const info = getInfo(f.rule);
  const sc = SEV_C[f.severity] ?? BLU;
  return (
    <div onClick={onClick} style={{
      padding:"10px 12px", cursor:"pointer", borderBottom:"1px solid var(--border)",
      background: selected ? "rgba(147,197,253,0.09)" : "transparent",
      borderLeft: selected ? `3px solid ${NAV}` : "3px solid transparent",
      transition:"background 0.15s",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:sc,
          marginTop:4, flexShrink:0, boxShadow:`0 0 5px ${sc}` }}/>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", lineHeight:1.4,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.title}</div>
          <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:10, color:PROV_C[f.provider] ?? NAV, fontWeight:700 }}>{f.provider}</span>
            <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>·</span>
            <span style={{ fontSize:10, color:"var(--muted-foreground)",
              overflow:"hidden", textOverflow:"ellipsis", maxWidth:120, whiteSpace:"nowrap" }}>{f.resourceId}</span>
          </div>
          <div style={{ display:"flex", gap:4, marginTop:5, flexWrap:"wrap" }}>
            <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4,
              background:SEV_BG[f.severity] ?? "rgba(147,197,253,0.1)",
              color:sc, fontWeight:700 }}>{f.severity}</span>
            <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4,
              background:"rgba(147,197,253,0.07)", color:NAV,
              maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {info.frameworks[0] ?? "CIS"}
            </span>
            <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4,
              background:`${STAT_C[f.status] ?? RED}18`, color:STAT_C[f.status] ?? RED, fontWeight:600 }}>
              {f.status === "in-remediation" ? "In Remediation" : f.status === "open" ? "Open" : f.status === "resolved" ? "✅ Resolved" : f.status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ finding, onClose, onLinkCompliance }: { finding:any; onClose:()=>void; onLinkCompliance:(fw:string)=>void }) {
  const info = getInfo(finding.rule);
  const ap = getPath(finding.rule);
  const sc = SEV_C[finding.severity] ?? BLU;
  const [activeTab, setActiveTab] = useState<"details"|"comments">("details");
  const [status, setStatus] = useState(finding.status);
  const [showIac, setShowIac] = useState(false);

  const metaGrid = [
    { label:"Status",       value: <span style={{ color: STAT_C[status] ?? RED, fontWeight:700, cursor:"pointer" }}
        onClick={() => { const cycle = ["open","in-remediation","resolved"]; setStatus(cycle[(cycle.indexOf(status)+1)%3]); }}>
        {status === "open" ? "🔴 Open" : status === "in-remediation" ? "🟡 In Remediation" : "🟢 Resolved"} ↺
      </span> },
    { label:"Severity",    value: <span style={{ color:sc, fontWeight:700 }}>{finding.severity}</span> },
    { label:"Provider",    value: <span style={{ color:PROV_C[finding.provider] ?? NAV }}>{finding.provider}</span> },
    { label:"Resource",    value: <span style={{ fontFamily:"monospace", fontSize:11 }}>{finding.resourceId}</span> },
    { label:"Category",    value: info.category },
    { label:"Rule ID",     value: <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)" }}>{finding.rule}</span> },
    { label:"Finding ID",  value: <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)" }}>{finding.findingId}</span> },
    { label:"Detected",    value: new Date(finding.createdAt).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) },
  ];

  return (
    <div style={{ flex:"0 0 61%", display:"flex", flexDirection:"column", borderLeft:"1px solid var(--border)",
      overflow:"hidden", background:"var(--card)" }}>

      {/* Header */}
      <div style={{ padding:"14px 18px 10px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4,
                background:SEV_BG[finding.severity] ?? "rgba(248,113,113,0.1)",
                color:sc, fontWeight:800, letterSpacing:"0.4px" }}>{finding.severity.toUpperCase()}</span>
              <span style={{ fontSize:10, color:STAT_C[status] ?? RED, fontWeight:600 }}>
                {status === "open" ? "● Open" : status === "in-remediation" ? "◑ In Remediation" : "✓ Resolved"}
              </span>
              <span style={{ fontSize:10, color:PROV_C[finding.provider] ?? NAV, fontWeight:700 }}>
                {finding.provider}
              </span>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--foreground)", lineHeight:1.5 }}>
              {finding.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--muted-foreground)",
            cursor:"pointer", fontSize:18, padding:"2px 4px", flexShrink:0, lineHeight:1 }}>✕</button>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[
            { icon:"💬", label:"Comment" },
            { icon:"▶", label:"Run Action" },
            { icon:"🎫", label:"Create Ticket" },
          ].map(a => (
            <button key={a.label} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px",
              background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)",
              borderRadius:7, color:NAV, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
          <button onClick={() => onLinkCompliance(info.frameworks[0] ?? "")}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px",
              background:"rgba(52,211,153,0.09)", border:"1px solid rgba(52,211,153,0.25)",
              borderRadius:7, color:EME, fontSize:11, fontWeight:600, cursor:"pointer",
              marginLeft:"auto" }}>
            🔗 View in ComplianceOps →
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display:"flex", gap:0, marginTop:12, borderBottom:"1px solid var(--border)" }}>
          {(["details","comments"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding:"6px 16px", background:"none", border:"none", fontSize:12,
              fontWeight: activeTab === t ? 700 : 500,
              color: activeTab === t ? NAV : "var(--muted-foreground)",
              borderBottom: activeTab === t ? `2px solid ${NAV}` : "2px solid transparent",
              cursor:"pointer", textTransform:"capitalize",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 18px" }}>
        {activeTab === "details" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* Metadata grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
              {metaGrid.map(m => (
                <div key={m.label}>
                  <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)",
                    textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>{m.label}</div>
                  <div style={{ fontSize:12, color:"var(--foreground)" }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            <section>
              <SectionHead>Description</SectionHead>
              <p style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.7, margin:0 }}>
                {info.description}
              </p>
            </section>

            {/* Potential Impact */}
            <section>
              <SectionHead>Potential Impact</SectionHead>
              <div style={{ padding:"12px 14px", borderRadius:8, background:"rgba(248,113,113,0.07)",
                border:"1px solid rgba(248,113,113,0.2)", fontSize:13, color:"var(--foreground)", lineHeight:1.7 }}>
                {info.impact}
              </div>
            </section>

            {/* Related Frameworks */}
            <section>
              <SectionHead>Related Frameworks</SectionHead>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {info.frameworks.map(fw => (
                  <span key={fw} style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                    background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.2)",
                    color:NAV, cursor:"pointer" }} onClick={() => onLinkCompliance(fw)}>
                    📋 {fw}
                  </span>
                ))}
              </div>
            </section>

            {/* Evidence — Attack Path */}
            <section>
              <SectionHead>Evidence · Attack Path Visualization</SectionHead>
              <div style={{ ...card({ padding:"14px", background:"rgba(0,0,0,0.25)" }) }}>
                <div style={{ fontSize:11, fontWeight:700, color:RED, marginBottom:10 }}>
                  ⚡ {ap.title}
                </div>
                <AttackPathSVG path={ap} />
              </div>
            </section>

            {/* Remediation */}
            <section>
              <SectionHead>Remediation Guidance</SectionHead>
              <div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.7,
                padding:"12px 14px", borderRadius:8,
                background:"rgba(52,211,153,0.07)", border:"1px solid rgba(52,211,153,0.15)" }}>
                {finding.remediation ?? "Follow your organisation's change management process to remediate this finding."}
              </div>
            </section>

            {/* IaC Fix */}
            {info.iacFix && (
              <section>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <SectionHead style={{ marginBottom:0 }}>IaC Fix (Terraform)</SectionHead>
                  <button onClick={() => setShowIac(!showIac)} style={{
                    padding:"3px 10px", fontSize:10, borderRadius:6, cursor:"pointer",
                    background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.2)",
                    color:NAV, fontWeight:600 }}>
                    {showIac ? "Hide" : "Show"} code
                  </button>
                  {showIac && (
                    <button onClick={() => navigator.clipboard.writeText(info.iacFix!)}
                      style={{ padding:"3px 10px", fontSize:10, borderRadius:6, cursor:"pointer",
                        background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.2)",
                        color:EME, fontWeight:600 }}>📋 Copy</button>
                  )}
                </div>
                {showIac && (
                  <pre style={{ margin:0, padding:"12px 14px", borderRadius:8, fontSize:11,
                    background:"rgba(0,0,0,0.35)", border:"1px solid rgba(147,197,253,0.15)",
                    color:"#e2e8f0", overflowX:"auto", lineHeight:1.6,
                    fontFamily:"'JetBrains Mono',monospace" }}>
                    {info.iacFix}
                  </pre>
                )}
              </section>
            )}

          </div>
        )}

        {activeTab === "comments" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ padding:"40px 0", textAlign:"center", color:"var(--muted-foreground)", fontSize:13 }}>
              No comments yet. Add a comment to collaborate on this finding.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input placeholder="Add a comment…" style={{ flex:1, padding:"8px 12px", borderRadius:8, fontSize:13,
                background:"var(--secondary)", border:"1px solid var(--border)", color:"var(--foreground)",
                outline:"none" }} />
              <button style={{ padding:"8px 16px", borderRadius:8, background:NAV, border:"none",
                color:"#0f172a", fontWeight:700, cursor:"pointer", fontSize:12 }}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHead({ children, style }: { children:React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.6px",
    color:"var(--muted-foreground)", marginBottom:8, ...style }}>{children}</div>;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ flex:"0 0 61%", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", borderLeft:"1px solid var(--border)", background:"var(--card)",
      color:"var(--muted-foreground)", gap:12 }}>
      <div style={{ fontSize:40, opacity:0.3 }}>🛡</div>
      <div style={{ fontSize:14, fontWeight:600 }}>Select a finding to see details</div>
      <div style={{ fontSize:12, opacity:0.7, textAlign:"center", maxWidth:280, lineHeight:1.6 }}>
        Choose a cloud compliance violation from the list to view its description, potential impact,
        attack path visualization, and remediation steps.
      </div>
    </div>
  );
}

// ── Main CloudComplianceTab ───────────────────────────────────────────────────
export function CloudComplianceTab({ onNavigateCompliance }: { onNavigateCompliance?: (fw: string) => void }) {
  const { viewTenantId } = useOrg();
  const { data: rawFindings = [] } = useCspmFindings();

  const findings = useMemo(() => rawFindings.map(f => ({
    ...f,
    _info: getInfo(f.rule),
  })), [rawFindings]);

  const [sel, setSel]       = useState<any>(null);
  const [sevF, setSevF]     = useState("all");
  const [statF, setStatF]   = useState("all");
  const [provF, setProvF]   = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"severity"|"provider"|"framework">("severity");

  const SEV_ORDER: Record<string,number> = { Critical:0, High:1, Medium:2, Low:3, Informational:4 };

  const filtered = useMemo(() => {
    const res = findings.filter(f => {
      if (sevF  !== "all" && f.severity !== sevF)  return false;
      if (statF !== "all" && f.status   !== statF) return false;
      if (provF !== "all" && f.provider !== provF) return false;
      if (search && !f.title.toLowerCase().includes(search.toLowerCase()) &&
          !f.resourceId?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sortBy === "severity")  res.sort((a,b) => (SEV_ORDER[a.severity]??5) - (SEV_ORDER[b.severity]??5));
    if (sortBy === "provider")  res.sort((a,b) => a.provider.localeCompare(b.provider));
    if (sortBy === "framework") res.sort((a,b) => (a._info.frameworks[0]??'').localeCompare(b._info.frameworks[0]??''));
    return res;
  }, [findings, sevF, statF, provF, search, sortBy]);

  // Stats for header
  const stats = useMemo(() => {
    const total  = findings.length;
    const crit   = findings.filter(f => f.severity === "Critical").length;
    const open   = findings.filter(f => f.status   === "open").length;
    const remmed = findings.filter(f => f.status   === "resolved").length;
    return { total, crit, open, remmed };
  }, [findings]);

  const handleLinkCompliance = useCallback((fw: string) => {
    if (onNavigateCompliance) onNavigateCompliance(fw);
    else window.location.hash = "#complianceops";
  }, [onNavigateCompliance]);

  const fwWithLiveCounts = useMemo(() => FW_CATALOGUE.map(fw => {
    const fwFindings = findings.filter(f => f._info.frameworks.some(f => f.includes(fw.name.split(" ")[0])));
    const extraFailing = fwFindings.filter(f => f.status !== "resolved").length;
    const adjustedPassing = Math.max(0, fw.passing - Math.min(extraFailing, 5));
    const adjustedScore   = Math.round((adjustedPassing / fw.total) * 100);
    return { ...fw, passing: adjustedPassing, score: adjustedScore };
  }), [findings]);

  if (viewTenantId !== 1) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        flex:1, color:"var(--muted-foreground)", gap:12, padding:40 }}>
        <div style={{ fontSize:38, opacity:0.25 }}>☁</div>
        <div style={{ fontSize:15, fontWeight:600 }}>No cloud accounts connected</div>
        <div style={{ fontSize:12, opacity:0.7, textAlign:"center", maxWidth:320, lineHeight:1.6 }}>
          Connect AWS, Azure, or GCP accounts to start scanning for cloud compliance violations
          across CIS, PCI DSS, SOC 2, NIST CSF, ISO 27001, and more.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", gap:0 }}>

      {/* Framework scorecard strip */}
      <div style={{ padding:"16px 0 0 0", flexShrink:0 }}>
        <FrameworkStrip fws={fwWithLiveCounts} />
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 0 10px 0", flexShrink:0, flexWrap:"wrap" }}>
        {/* Stats pills */}
        <span style={{ fontSize:11, color:"var(--muted-foreground)", fontWeight:600, marginRight:4 }}>
          {filtered.length}/{stats.total} findings
        </span>
        {stats.crit > 0 && <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6,
          background:"rgba(248,113,113,0.12)", color:RED, fontWeight:700 }}>⚡ {stats.crit} Critical</span>}
        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6,
          background:"rgba(248,113,113,0.08)", color:RED, fontWeight:600 }}>{stats.open} Open</span>
        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6,
          background:"rgba(52,211,153,0.08)", color:EME, fontWeight:600 }}>✓ {stats.remmed} Resolved</span>

        <div style={{ flex:1, display:"flex", justifyContent:"flex-end", gap:8, flexWrap:"wrap" }}>
          {/* Search */}
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)",
              fontSize:12, opacity:0.5, pointerEvents:"none" }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search findings…"
              style={{ paddingLeft:26, paddingRight:10, paddingTop:6, paddingBottom:6,
                borderRadius:8, border:"1px solid var(--border)", background:"var(--secondary)",
                color:"var(--foreground)", fontSize:12, outline:"none", width:180 }} />
          </div>

          {/* Severity filter */}
          <select value={sevF} onChange={e => setSevF(e.target.value)}
            style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
              background:"var(--secondary)", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>
            <option value="all">All Severities</option>
            {["Critical","High","Medium","Low"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Status filter */}
          <select value={statF} onChange={e => setStatF(e.target.value)}
            style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
              background:"var(--secondary)", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-remediation">In Remediation</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Provider filter */}
          <select value={provF} onChange={e => setProvF(e.target.value)}
            style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
              background:"var(--secondary)", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>
            <option value="all">All Providers</option>
            <option value="AWS">AWS</option>
            <option value="Azure">Azure</option>
            <option value="GCP">GCP</option>
          </select>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
              background:"var(--secondary)", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>
            <option value="severity">Sort: Severity</option>
            <option value="provider">Sort: Provider</option>
            <option value="framework">Sort: Framework</option>
          </select>
        </div>
      </div>

      {/* Main content area: list + detail */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", borderRadius:12,
        border:"1px solid var(--border)", boxShadow:"0 2px 12px rgba(0,0,0,0.35)" }}>

        {/* Findings list (left 39%) */}
        <div style={{ flex:"0 0 39%", overflowY:"auto", borderRight:"1px solid var(--border)",
          scrollbarWidth:"thin", scrollbarColor:"rgba(255,255,255,0.08) transparent" }}>
          {filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--muted-foreground)", fontSize:12 }}>
              No findings match your filters.
            </div>
          ) : (
            filtered.map(f => (
              <FindingRow key={f.findingId} f={f} selected={sel?.findingId === f.findingId}
                onClick={() => setSel(f)} />
            ))
          )}
        </div>

        {/* Detail panel (right 61%) */}
        {sel
          ? <DetailDrawer finding={sel} onClose={() => setSel(null)} onLinkCompliance={handleLinkCompliance} />
          : <EmptyState />
        }
      </div>
    </div>
  );
}

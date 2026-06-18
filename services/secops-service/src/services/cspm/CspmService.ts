import { randomUUID } from "crypto";

export type CloudProvider = "AWS"|"Azure"|"GCP";
export type FindingSeverity = "Critical"|"High"|"Medium"|"Low"|"Informational";
export type FindingStatus = "open"|"suppressed"|"in-remediation"|"resolved";
export type ResourceStatus = "compliant"|"non-compliant"|"unknown";

export interface CloudResource {
  id: string; provider: CloudProvider; service: string; resourceId: string;
  region: string; owner: string; tags: Record<string, string>;
  status: ResourceStatus; risk: string; compliant: boolean;
  lastScanned: string; config: Record<string, string>;
  createdAt: string; updatedAt: string;
}
export interface CisSection { id: string; name: string; }
export interface CspmFinding {
  id: string; resourceId: string; provider: CloudProvider; service: string;
  title: string; description: string; severity: FindingSeverity;
  status: FindingStatus; cisSection: string; cisControl: string;
  remediationSteps: string[]; affectedResource: string;
  region: string; detectedAt: string; resolvedAt?: string;
  driftDetected: boolean; baseline?: string; current?: string;
  createdAt: string; updatedAt: string;
}
export interface RemediationGuide {
  findingType: string; steps: string[]; automatable: boolean;
  estimatedEffort: string; references: string[];
}
export interface DriftRecord {
  id: string; resourceId: string; field: string; baseline: string;
  current: string; detectedAt: string; acknowledged: boolean;
}

const REMEDIATION_DB: Record<string, RemediationGuide> = {
  "s3-public-acl": {
    findingType:"S3 Bucket Public ACL", automatable:true, estimatedEffort:"5 min",
    steps:[
      "Navigate to S3 console → bucket → Permissions tab",
      "Click 'Edit' under 'Block public access'",
      "Enable all four block public access settings",
      "Save changes and confirm",
      "Rotate any exposed data if bucket was publicly readable",
    ],
    references:["https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html","CIS AWS 2.1.5"],
  },
  "vm-disk-unencrypted": {
    findingType:"VM Unencrypted Disk", automatable:false, estimatedEffort:"30 min",
    steps:[
      "Stop the VM and take a snapshot",
      "Create an encrypted disk from the snapshot",
      "Swap the disk on the VM",
      "Restart the VM and validate",
      "Delete unencrypted disk after validation",
    ],
    references:["https://learn.microsoft.com/azure/virtual-machines/disk-encryption","CIS Azure 7.2"],
  },
  "sql-no-ssl": {
    findingType:"Cloud SQL Without SSL", automatable:true, estimatedEffort:"10 min",
    steps:[
      "Navigate to Cloud SQL instance → Connections tab",
      "Enable 'Require SSL' for all connections",
      "Download new client certificates",
      "Update application connection strings to use SSL",
      "Test connections and verify SSL enforcement",
    ],
    references:["https://cloud.google.com/sql/docs/postgres/configure-ssl-instance","CIS GCP 6.2"],
  },
  "security-group-open": {
    findingType:"Overly Permissive Security Group", automatable:true, estimatedEffort:"15 min",
    steps:[
      "Identify the security group and its inbound rules",
      "Remove or restrict any 0.0.0.0/0 rules to specific CIDRs",
      "Use least-privilege principle — only allow required ports/IPs",
      "Apply changes during a maintenance window",
      "Validate services still accessible after change",
    ],
    references:["CIS AWS 5.1","NIST SP 800-53 SC-7"],
  },
};

const SEED_RESOURCES: Omit<CloudResource,"createdAt"|"updatedAt">[] = [
  { id:"CRS-001", provider:"AWS",   service:"S3",              resourceId:"acme-backups-prod",          region:"us-east-1",      owner:"Alex Kim",       tags:{env:"prod",team:"ops"},     status:"non-compliant", risk:"Critical", compliant:false, lastScanned:"2 hrs ago",  config:{"versioning":"disabled","encryption":"AES256","acl":"public-read"} },
  { id:"CRS-002", provider:"AWS",   service:"EC2",             resourceId:"i-0abc123def456",            region:"eu-west-1",      owner:"Alex Kim",       tags:{env:"prod",team:"eng"},     status:"compliant",     risk:"Low",      compliant:true,  lastScanned:"2 hrs ago",  config:{"instance-type":"t3.large","ami":"ami-0987654321","sg":"sg-restricted"} },
  { id:"CRS-003", provider:"AWS",   service:"Security Group",  resourceId:"sg-0abc12345",               region:"us-east-1",      owner:"Alex Kim",       tags:{env:"prod"},                status:"non-compliant", risk:"High",     compliant:false, lastScanned:"2 hrs ago",  config:{"inbound-0.0.0.0/0":"0-65535","outbound":"all"} },
  { id:"CRS-004", provider:"AWS",   service:"Lambda",          resourceId:"acme-api-handler",           region:"eu-west-1",      owner:"Sarah Chen",     tags:{env:"prod",team:"eng"},     status:"compliant",     risk:"Low",      compliant:true,  lastScanned:"2 hrs ago",  config:{"runtime":"nodejs20","memory":"256MB"} },
  { id:"CRS-005", provider:"AWS",   service:"RDS",             resourceId:"rds-prod-mysql-01",          region:"us-east-1",      owner:"Alex Kim",       tags:{env:"prod",team:"dba"},     status:"non-compliant", risk:"Medium",   compliant:false, lastScanned:"2 hrs ago",  config:{"encrypted":"false","multi-az":"true","backup":"7days"} },
  { id:"CRS-006", provider:"AWS",   service:"IAM Role",        resourceId:"arn:aws:iam::123:role/admin",region:"global",         owner:"Alex Kim",       tags:{},                          status:"non-compliant", risk:"High",     compliant:false, lastScanned:"2 hrs ago",  config:{"policy":"AdministratorAccess","mfa":"not-required"} },
  { id:"CRS-007", provider:"Azure", service:"Virtual Machine", resourceId:"vm/prod-api-01",             region:"westeurope",     owner:"Sarah Chen",     tags:{env:"prod",app:"api"},      status:"non-compliant", risk:"High",     compliant:false, lastScanned:"3 hrs ago",  config:{"disk-encryption":"disabled","os":"Windows Server 2019","size":"D4s_v3"} },
  { id:"CRS-008", provider:"Azure", service:"Key Vault",       resourceId:"acme-keyvault-prod",         region:"westeurope",     owner:"Alex Kim",       tags:{env:"prod"},                status:"compliant",     risk:"Low",      compliant:true,  lastScanned:"3 hrs ago",  config:{"soft-delete":"enabled","purge-protection":"enabled","rbac":"true"} },
  { id:"CRS-009", provider:"Azure", service:"Storage Account", resourceId:"acmestorprod01",             region:"westeurope",     owner:"Sarah Chen",     tags:{env:"prod"},                status:"non-compliant", risk:"High",     compliant:false, lastScanned:"3 hrs ago",  config:{"https-only":"false","tls-version":"TLS1.0","public-access":"enabled"} },
  { id:"CRS-010", provider:"Azure", service:"SQL Database",    resourceId:"acme-sql-analytics",         region:"northeurope",    owner:"Marcus Johnson", tags:{env:"prod",team:"data"},    status:"compliant",     risk:"Low",      compliant:true,  lastScanned:"3 hrs ago",  config:{"tde":"enabled","firewall":"restrictive"} },
  { id:"CRS-011", provider:"GCP",   service:"Cloud SQL",       resourceId:"gcp/sql/analytics-db",       region:"europe-west1",   owner:"Sarah Chen",     tags:{env:"prod"},                status:"non-compliant", risk:"Medium",   compliant:false, lastScanned:"4 hrs ago",  config:{"ssl":"disabled","public-ip":"enabled","backups":"enabled"} },
  { id:"CRS-012", provider:"GCP",   service:"GCS Bucket",      resourceId:"gs://acme-ml-datasets",      region:"us-central1",    owner:"Marcus Johnson", tags:{env:"prod",team:"ml"},      status:"non-compliant", risk:"High",     compliant:false, lastScanned:"4 hrs ago",  config:{"acl":"public","versioning":"enabled","logging":"disabled"} },
  { id:"CRS-013", provider:"GCP",   service:"GKE Cluster",     resourceId:"gke-prod-eu-west",           region:"europe-west1",   owner:"Sarah Chen",     tags:{env:"prod",team:"eng"},     status:"compliant",     risk:"Low",      compliant:true,  lastScanned:"4 hrs ago",  config:{"version":"1.28","network-policy":"enabled","private":"true"} },
  { id:"CRS-014", provider:"GCP",   service:"Firestore",       resourceId:"acme-firestore-prod",        region:"europe-west1",   owner:"Alex Kim",       tags:{},                          status:"non-compliant", risk:"Medium",   compliant:false, lastScanned:"4 hrs ago",  config:{"security-rules":"permissive","audit-logs":"disabled"} },
];

const SEED_FINDINGS: Omit<CspmFinding,"id"|"createdAt"|"updatedAt">[] = [
  { resourceId:"CRS-001", provider:"AWS",   service:"S3",              title:"S3 bucket with public read ACL",                      description:"The bucket 'acme-backups-prod' has a public-read ACL allowing unauthenticated access to all objects.", severity:"Critical", status:"open",           cisSection:"2.1", cisControl:"CIS AWS 2.1.5", remediationSteps:REMEDIATION_DB["s3-public-acl"].steps, affectedResource:"s3://acme-backups-prod",             region:"us-east-1",      detectedAt:"2024-09-10", driftDetected:true,  baseline:"private", current:"public-read" },
  { resourceId:"CRS-003", provider:"AWS",   service:"Security Group",  title:"Security group allows unrestricted inbound 0.0.0.0/0", description:"Security group sg-0abc12345 allows all inbound traffic from any IP — overly permissive.", severity:"High",     status:"in-remediation", cisSection:"5",   cisControl:"CIS AWS 5.1",   remediationSteps:REMEDIATION_DB["security-group-open"].steps, affectedResource:"sg-0abc12345",               region:"us-east-1",      detectedAt:"2024-09-01", driftDetected:false },
  { resourceId:"CRS-005", provider:"AWS",   service:"RDS",             title:"RDS instance storage not encrypted at rest",            description:"Production MySQL RDS instance rds-prod-mysql-01 does not have storage encryption enabled.", severity:"Medium",   status:"open",           cisSection:"2.3", cisControl:"CIS AWS 2.3.1", remediationSteps:["Enable encryption when creating a new snapshot","Restore from snapshot with encryption enabled"], affectedResource:"rds-prod-mysql-01",          region:"us-east-1",      detectedAt:"2024-08-15", driftDetected:false },
  { resourceId:"CRS-006", provider:"AWS",   service:"IAM",             title:"IAM role with admin policy — MFA not required",         description:"Role 'admin' has AdministratorAccess policy attached without requiring MFA for sts:AssumeRole.", severity:"High",     status:"open",           cisSection:"1.5", cisControl:"CIS AWS 1.5",   remediationSteps:["Add a condition to role trust policy: aws:MultiFactorAuthPresent = true"], affectedResource:"arn:aws:iam::123:role/admin", region:"global",         detectedAt:"2024-09-12", driftDetected:false },
  { resourceId:"CRS-007", provider:"Azure", service:"VM",              title:"Azure VM OS disk encryption not enabled",               description:"Virtual machine vm/prod-api-01 does not have Azure Disk Encryption enabled on OS disk.", severity:"High",     status:"open",           cisSection:"7",   cisControl:"CIS Azure 7.2", remediationSteps:REMEDIATION_DB["vm-disk-unencrypted"].steps, affectedResource:"vm/prod-api-01",             region:"westeurope",     detectedAt:"2024-09-08", driftDetected:true,  baseline:"encrypted", current:"unencrypted" },
  { resourceId:"CRS-009", provider:"Azure", service:"Storage",         title:"Storage account allows HTTP (non-HTTPS) traffic",       description:"Storage account 'acmestorprod01' does not enforce HTTPS-only connections — TLS 1.0 accepted.", severity:"High",     status:"open",           cisSection:"3",   cisControl:"CIS Azure 3.1", remediationSteps:["Enable 'Secure transfer required' in storage account settings","Set minimum TLS to TLS 1.2"], affectedResource:"acmestorprod01",             region:"westeurope",     detectedAt:"2024-09-05", driftDetected:false },
  { resourceId:"CRS-011", provider:"GCP",   service:"Cloud SQL",       title:"Cloud SQL instance without SSL enforced",               description:"Cloud SQL instance 'analytics-db' accepts connections without SSL — data transmitted in cleartext.", severity:"Medium",   status:"open",           cisSection:"6",   cisControl:"CIS GCP 6.2",   remediationSteps:REMEDIATION_DB["sql-no-ssl"].steps, affectedResource:"gcp/sql/analytics-db",       region:"europe-west1",   detectedAt:"2024-09-03", driftDetected:false },
  { resourceId:"CRS-012", provider:"GCP",   service:"GCS",             title:"GCS bucket with allUsers IAM binding (public)",         description:"Bucket 'acme-ml-datasets' grants allUsers storage.objectViewer — training data publicly readable.", severity:"High",     status:"open",           cisSection:"5",   cisControl:"CIS GCP 5.1",   remediationSteps:["Remove allUsers/allAuthenticatedUsers IAM bindings","Enable Uniform Bucket-Level Access","Review and restrict to specific service accounts"], affectedResource:"gs://acme-ml-datasets",      region:"us-central1",    detectedAt:"2024-09-11", driftDetected:true,  baseline:"private", current:"public" },
  { resourceId:"CRS-014", provider:"GCP",   service:"Firestore",       title:"Firestore security rules allow read without auth",       description:"Firestore security rules have 'allow read, write: if true' — any unauthenticated user can read/write.", severity:"Critical", status:"open",           cisSection:"4",   cisControl:"CIS GCP 4.3",   remediationSteps:["Replace permissive rules with authentication-based rules","Test with Firebase Emulator","Deploy updated rules"], affectedResource:"acme-firestore-prod",        region:"europe-west1",   detectedAt:"2024-09-14", driftDetected:false },
  { resourceId:"CRS-002", provider:"AWS",   service:"EC2",             title:"EC2 instance using outdated AMI (6 months old)",        description:"Instance i-0abc123def456 is using an AMI that is 6 months old — may miss security patches.", severity:"Low",      status:"open",           cisSection:"2.2", cisControl:"CIS AWS 2.2.1", remediationSteps:["Build a new AMI with latest patches","Launch new instance and retire old one"], affectedResource:"i-0abc123def456",            region:"eu-west-1",      detectedAt:"2024-08-01", driftDetected:false },
];

const SEED_DRIFT: DriftRecord[] = [
  { id:"DFT-001", resourceId:"CRS-001", field:"acl",               baseline:"private",         current:"public-read",   detectedAt:"2024-09-10", acknowledged:false },
  { id:"DFT-002", resourceId:"CRS-007", field:"disk-encryption",   baseline:"enabled",         current:"disabled",      detectedAt:"2024-09-08", acknowledged:false },
  { id:"DFT-003", resourceId:"CRS-012", field:"iam-binding",       baseline:"project-members", current:"allUsers",      detectedAt:"2024-09-11", acknowledged:false },
  { id:"DFT-004", resourceId:"CRS-009", field:"https-only",        baseline:"true",            current:"false",         detectedAt:"2024-09-05", acknowledged:true  },
];

const resourceStore = new Map<string, CloudResource[]>();
const findingStore  = new Map<string, Map<string, CspmFinding>>();
const driftStore    = new Map<string, DriftRecord[]>();

function tenantResources(tid: string): CloudResource[] {
  if (!resourceStore.has(tid)) {
    if (tid === "1") {
      const now = new Date().toISOString().slice(0, 10);
      resourceStore.set(tid, SEED_RESOURCES.map(r => ({ ...r, createdAt: now, updatedAt: now })));
    } else {
      resourceStore.set(tid, []);
    }
  }
  return resourceStore.get(tid)!;
}
function tenantFindings(tid: string): Map<string, CspmFinding> {
  if (!findingStore.has(tid)) {
    if (tid === "1") {
      const now = new Date().toISOString().slice(0, 10);
      const m = new Map<string, CspmFinding>();
      SEED_FINDINGS.forEach((f, i) => {
        const id = `${tid}:CSPM-${String(i + 1).padStart(4, "0")}`;
        m.set(id, { ...f, id, createdAt: now, updatedAt: now });
      });
      findingStore.set(tid, m);
    } else {
      findingStore.set(tid, new Map());
    }
  }
  return findingStore.get(tid)!;
}
function tenantDrift(tid: string): DriftRecord[] {
  if (!driftStore.has(tid)) driftStore.set(tid, tid === "1" ? SEED_DRIFT.map(d => ({ ...d })) : []);
  return driftStore.get(tid)!;
}

export class CspmService {
  // ── Resources ──────────────────────────────────────────────────────────────
  getResources(tenantId: string, provider?: CloudProvider): CloudResource[] {
    const list = tenantResources(tenantId);
    return provider ? list.filter(r => r.provider === provider) : list;
  }

  getResource(tenantId: string, id: string): CloudResource | undefined {
    return tenantResources(tenantId).find(r => r.id === id);
  }

  // ── Findings ───────────────────────────────────────────────────────────────
  getFindings(tenantId: string, filters?: { severity?: string; status?: string; provider?: string }): CspmFinding[] {
    let list = [...tenantFindings(tenantId).values()];
    if (filters?.severity) list = list.filter(f => f.severity === filters.severity);
    if (filters?.status)   list = list.filter(f => f.status === filters.status);
    if (filters?.provider) list = list.filter(f => f.provider === filters.provider);
    return list;
  }

  getFinding(tenantId: string, id: string): CspmFinding | null {
    return tenantFindings(tenantId).get(id) ?? null;
  }

  updateFindingStatus(tenantId: string, id: string, status: FindingStatus): CspmFinding | null {
    const f = tenantFindings(tenantId).get(id);
    if (!f) return null;
    f.status = status;
    f.updatedAt = new Date().toISOString().slice(0, 10);
    if (status === "resolved") f.resolvedAt = f.updatedAt;
    return f;
  }

  // ── Remediation ────────────────────────────────────────────────────────────
  getRemediation(findingType: string): RemediationGuide | undefined {
    return REMEDIATION_DB[findingType];
  }

  // ── Drift ──────────────────────────────────────────────────────────────────
  getDrift(tenantId: string, resourceId?: string): DriftRecord[] {
    const list = tenantDrift(tenantId);
    return resourceId ? list.filter(d => d.resourceId === resourceId) : list;
  }

  acknowledgeDrift(tenantId: string, driftId: string): DriftRecord | null {
    const d = tenantDrift(tenantId).find(x => x.id === driftId);
    if (!d) return null;
    d.acknowledged = true;
    return d;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  getStats(tenantId: string) {
    const resources = tenantResources(tenantId);
    const findings  = [...tenantFindings(tenantId).values()];
    return {
      totalResources:    resources.length,
      compliantResources: resources.filter(r => r.compliant).length,
      byProvider: { AWS: resources.filter(r=>r.provider==="AWS").length, Azure: resources.filter(r=>r.provider==="Azure").length, GCP: resources.filter(r=>r.provider==="GCP").length },
      findings: {
        total:    findings.length,
        critical: findings.filter(f=>f.severity==="Critical").length,
        high:     findings.filter(f=>f.severity==="High").length,
        medium:   findings.filter(f=>f.severity==="Medium").length,
        open:     findings.filter(f=>f.status==="open").length,
      },
      driftItems: tenantDrift(tenantId).filter(d => !d.acknowledged).length,
      complianceScore: resources.length === 0 ? 0 : Math.round((resources.filter(r=>r.compliant).length / resources.length) * 100),
    };
  }
}

export const cspmService = new CspmService();

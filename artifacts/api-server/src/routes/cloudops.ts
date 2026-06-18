import { Router } from "express";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { saasAppsTable, cloudResourcesTable, cloudFindingsTable, aiDatasetsTable, cloudIntegrationsTable, aiModelsTable, aiThreatsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Default seed data for cloud resources ─────────────────────────────────────

const SEED_CLOUD_RESOURCES = [
  // AWS
  { resourceId: "aws-ec2-prod-001",   provider: "AWS",   service: "EC2",          region: "us-east-1",    accountId: "123456789012", name: "prod-web-01",              risk: "High",     compliancePct: 72, status: "active",  resourceType: "instance",       tags: { env: "prod", team: "platform" } },
  { resourceId: "aws-ec2-prod-002",   provider: "AWS",   service: "EC2",          region: "us-east-1",    accountId: "123456789012", name: "prod-api-01",              risk: "High",     compliancePct: 68, status: "active",  resourceType: "instance",       tags: { env: "prod", team: "backend" } },
  { resourceId: "aws-ec2-prod-003",   provider: "AWS",   service: "EC2",          region: "us-west-2",    accountId: "123456789012", name: "prod-worker-01",           risk: "Medium",   compliancePct: 84, status: "active",  resourceType: "instance",       tags: { env: "prod", team: "data" } },
  { resourceId: "aws-s3-prod-001",    provider: "AWS",   service: "S3",           region: "us-east-1",    accountId: "123456789012", name: "acme-prod-data",           risk: "Critical", compliancePct: 41, status: "exposed", resourceType: "bucket",         tags: { classification: "sensitive" } },
  { resourceId: "aws-s3-prod-002",    provider: "AWS",   service: "S3",           region: "us-east-1",    accountId: "123456789012", name: "acme-backup-store",        risk: "Medium",   compliancePct: 78, status: "active",  resourceType: "bucket",         tags: { classification: "internal" } },
  { resourceId: "aws-s3-logs-001",    provider: "AWS",   service: "S3",           region: "us-east-1",    accountId: "123456789012", name: "acme-access-logs",         risk: "Low",      compliancePct: 95, status: "active",  resourceType: "bucket",         tags: { purpose: "logging" } },
  { resourceId: "aws-rds-prod-001",   provider: "AWS",   service: "RDS",          region: "us-east-1",    accountId: "123456789012", name: "prod-postgres-primary",    risk: "High",     compliancePct: 63, status: "active",  resourceType: "db-instance",    tags: { env: "prod", engine: "postgres" } },
  { resourceId: "aws-rds-prod-002",   provider: "AWS",   service: "RDS",          region: "us-east-1",    accountId: "123456789012", name: "prod-postgres-replica",    risk: "Medium",   compliancePct: 71, status: "active",  resourceType: "db-instance",    tags: { env: "prod", engine: "postgres" } },
  { resourceId: "aws-lambda-001",     provider: "AWS",   service: "Lambda",       region: "us-east-1",    accountId: "123456789012", name: "data-processor-fn",        risk: "Medium",   compliancePct: 82, status: "active",  resourceType: "function",       tags: { team: "data" } },
  { resourceId: "aws-lambda-002",     provider: "AWS",   service: "Lambda",       region: "us-east-1",    accountId: "123456789012", name: "auth-webhook-fn",          risk: "High",     compliancePct: 59, status: "active",  resourceType: "function",       tags: { team: "security" } },
  { resourceId: "aws-eks-001",        provider: "AWS",   service: "EKS",          region: "us-east-1",    accountId: "123456789012", name: "prod-eks-cluster",         risk: "High",     compliancePct: 61, status: "active",  resourceType: "k8s-cluster",    tags: { env: "prod" } },
  { resourceId: "aws-eks-002",        provider: "AWS",   service: "EKS",          region: "us-west-2",    accountId: "123456789012", name: "staging-eks-cluster",      risk: "Medium",   compliancePct: 75, status: "active",  resourceType: "k8s-cluster",    tags: { env: "staging" } },
  { resourceId: "aws-iam-role-001",   provider: "AWS",   service: "IAM",          region: "global",       accountId: "123456789012", name: "AdminAccessRole",          risk: "Critical", compliancePct: 32, status: "active",  resourceType: "iam-role",       tags: { access: "admin" } },
  { resourceId: "aws-iam-role-002",   provider: "AWS",   service: "IAM",          region: "global",       accountId: "123456789012", name: "DevOpsRole",               risk: "High",     compliancePct: 55, status: "active",  resourceType: "iam-role",       tags: { team: "devops" } },
  { resourceId: "aws-iam-user-001",   provider: "AWS",   service: "IAM",          region: "global",       accountId: "123456789012", name: "svc-ci-deploy",            risk: "Critical", compliancePct: 28, status: "active",  resourceType: "iam-user",       tags: { purpose: "ci-cd" } },
  { resourceId: "aws-ecr-img-001",    provider: "AWS",   service: "ECR",          region: "us-east-1",    accountId: "123456789012", name: "prod/api-server:latest",   risk: "Critical", compliancePct: 38, status: "active",  resourceType: "container-image",tags: { cve: "CVE-2024-1234,CVE-2024-5678" } },
  { resourceId: "aws-ecr-img-002",    provider: "AWS",   service: "ECR",          region: "us-east-1",    accountId: "123456789012", name: "prod/worker:v2.1",         risk: "High",     compliancePct: 51, status: "active",  resourceType: "container-image",tags: { cve: "CVE-2024-3456" } },
  { resourceId: "aws-ecr-img-003",    provider: "AWS",   service: "ECR",          region: "us-east-1",    accountId: "123456789012", name: "base/ubuntu-22.04:latest", risk: "Low",      compliancePct: 91, status: "active",  resourceType: "container-image",tags: {} },
  { resourceId: "aws-sm-secret-001",  provider: "AWS",   service: "Secrets Manager", region: "us-east-1", accountId: "123456789012", name: "prod/db-credentials",      risk: "Medium",   compliancePct: 80, status: "active",  resourceType: "secret",         tags: { env: "prod" } },
  // Azure
  { resourceId: "az-vm-prod-001",     provider: "Azure", service: "Compute",      region: "East US",      accountId: "sub-prod-001", name: "vm-prod-web-01",           risk: "High",     compliancePct: 66, status: "active",  resourceType: "instance",       tags: { env: "prod" } },
  { resourceId: "az-vm-prod-002",     provider: "Azure", service: "Compute",      region: "East US",      accountId: "sub-prod-001", name: "vm-prod-api-01",           risk: "Medium",   compliancePct: 74, status: "active",  resourceType: "instance",       tags: { env: "prod" } },
  { resourceId: "az-storage-001",     provider: "Azure", service: "Blob Storage", region: "East US",      accountId: "sub-prod-001", name: "acmeprodstore001",         risk: "High",     compliancePct: 58, status: "active",  resourceType: "bucket",         tags: { classification: "sensitive" } },
  { resourceId: "az-sql-001",         provider: "Azure", service: "SQL Database", region: "East US",      accountId: "sub-prod-001", name: "acme-prod-sqldb",          risk: "High",     compliancePct: 62, status: "active",  resourceType: "db-instance",    tags: { env: "prod" } },
  { resourceId: "az-aks-001",         provider: "Azure", service: "AKS",          region: "East US",      accountId: "sub-prod-001", name: "aks-prod-cluster",         risk: "Medium",   compliancePct: 71, status: "active",  resourceType: "k8s-cluster",    tags: { env: "prod" } },
  { resourceId: "az-ad-sp-001",       provider: "Azure", service: "Azure AD",     region: "global",       accountId: "sub-prod-001", name: "ci-cd-service-principal",  risk: "Critical", compliancePct: 35, status: "active",  resourceType: "iam-role",       tags: { purpose: "cicd" } },
  // GCP
  { resourceId: "gcp-gce-001",        provider: "GCP",   service: "Compute Engine", region: "us-central1", accountId: "proj-acme-prod", name: "gce-prod-backend-01",   risk: "Medium",   compliancePct: 79, status: "active",  resourceType: "instance",       tags: { env: "prod" } },
  { resourceId: "gcp-gcs-001",        provider: "GCP",   service: "Cloud Storage",region: "us-central1",  accountId: "proj-acme-prod", name: "acme-ml-training-data", risk: "High",     compliancePct: 54, status: "active",  resourceType: "bucket",         tags: { purpose: "ml" } },
  { resourceId: "gcp-gke-001",        provider: "GCP",   service: "GKE",          region: "us-central1",  accountId: "proj-acme-prod", name: "gke-ml-cluster",        risk: "Medium",   compliancePct: 76, status: "active",  resourceType: "k8s-cluster",    tags: { purpose: "ml" } },
] as const;

const SEED_CLOUD_FINDINGS = [
  { findingId: "CF-001", resourceId: "aws-s3-prod-001",   provider: "AWS",   severity: "Critical", rule: "S3-PUBLIC-READ-WRITE",     title: "S3 bucket acme-prod-data has public read/write ACL",              remediation: "Remove public ACL and apply bucket policy",               status: "open" },
  { findingId: "CF-002", resourceId: "aws-iam-user-001",  provider: "AWS",   severity: "Critical", rule: "IAM-NO-MFA",               title: "IAM user svc-ci-deploy has no MFA and active access key",         remediation: "Enable MFA or rotate to role-based access",               status: "open" },
  { findingId: "CF-003", resourceId: "aws-iam-role-001",  provider: "AWS",   severity: "Critical", rule: "IAM-ADMIN-OVERPERMISSIVE",  title: "IAM role AdminAccessRole grants full AWS admin (*:*)",            remediation: "Scope down to least-privilege policy",                     status: "open" },
  { findingId: "CF-004", resourceId: "aws-ecr-img-001",   provider: "AWS",   severity: "Critical", rule: "CVE-2024-1234",            title: "Critical CVE-2024-1234 in prod/api-server:latest (OpenSSL)",      remediation: "Rebuild image with patched base layer",                    status: "open" },
  { findingId: "CF-005", resourceId: "aws-ecr-img-001",   provider: "AWS",   severity: "Critical", rule: "CVE-2024-5678",            title: "Critical CVE-2024-5678 in prod/api-server:latest (glibc)",        remediation: "Update glibc to version 2.40+",                            status: "open" },
  { findingId: "CF-006", resourceId: "aws-eks-001",       provider: "AWS",   severity: "High",     rule: "K8S-PRIVILEGED-CONTAINER", title: "Privileged containers running in prod-eks-cluster namespace prod", remediation: "Remove privileged: true from pod specs",                   status: "open" },
  { findingId: "CF-007", resourceId: "aws-eks-001",       provider: "AWS",   severity: "High",     rule: "K8S-NO-NETWORK-POLICY",    title: "No network policies enforced in prod-eks-cluster",               remediation: "Apply namespace-scoped NetworkPolicy resources",            status: "open" },
  { findingId: "CF-008", resourceId: "aws-rds-prod-001",  provider: "AWS",   severity: "High",     rule: "RDS-NO-ENCRYPTION",        title: "RDS instance prod-postgres-primary storage not encrypted",        remediation: "Enable storage encryption (requires snapshot restore)",    status: "open" },
  { findingId: "CF-009", resourceId: "aws-rds-prod-001",  provider: "AWS",   severity: "High",     rule: "RDS-PUBLIC-ACCESSIBLE",    title: "RDS prod-postgres-primary is publicly accessible",               remediation: "Disable publicly_accessible flag and use VPC routing",     status: "open" },
  { findingId: "CF-010", resourceId: "aws-lambda-002",    provider: "AWS",   severity: "High",     rule: "LAMBDA-EXCESSIVE-ROLE",    title: "Lambda auth-webhook-fn has IAM role with AdminAccess",            remediation: "Create least-privilege role for Lambda function",           status: "open" },
  { findingId: "CF-011", resourceId: "aws-ec2-prod-001",  provider: "AWS",   severity: "High",     rule: "EC2-IMDSv1-ENABLED",       title: "EC2 prod-web-01 allows IMDSv1 (SSRF risk)",                      remediation: "Enforce IMDSv2 via instance metadata options",             status: "open" },
  { findingId: "CF-012", resourceId: "aws-ec2-prod-002",  provider: "AWS",   severity: "Medium",   rule: "EC2-NO-SSM-AGENT",         title: "EC2 prod-api-01 missing SSM agent — no patch visibility",        remediation: "Install SSM agent and configure maintenance windows",      status: "open" },
  { findingId: "CF-013", resourceId: "az-storage-001",    provider: "Azure", severity: "High",     rule: "STORAGE-PUBLIC-BLOB",      title: "Azure Blob Storage acmeprodstore001 allows anonymous read",       remediation: "Set container access level to private",                    status: "open" },
  { findingId: "CF-014", resourceId: "az-ad-sp-001",      provider: "Azure", severity: "Critical", rule: "AZURE-AD-SP-SECRET-EXPIRY","title": "Azure AD SP ci-cd-service-principal secret expires in 3 days",  remediation: "Rotate secret and implement certificate auth",             status: "open" },
  { findingId: "CF-015", resourceId: "az-aks-001",        provider: "Azure", severity: "Medium",   rule: "AKS-RBAC-DISABLED",        title: "AKS cluster aks-prod-cluster has RBAC disabled",                 remediation: "Enable Kubernetes RBAC and configure roles",               status: "open" },
  { findingId: "CF-016", resourceId: "gcp-gcs-001",       provider: "GCP",   severity: "High",     rule: "GCS-UNIFORM-ACCESS-OFF",   title: "GCS bucket acme-ml-training-data has non-uniform bucket access", remediation: "Enable uniform bucket-level access",                       status: "open" },
  { findingId: "CF-017", resourceId: "aws-ecr-img-002",   provider: "AWS",   severity: "High",     rule: "CVE-2024-3456",            title: "High CVE-2024-3456 in prod/worker:v2.1 (libcurl)",               remediation: "Update libcurl to 8.6.0+",                                 status: "open" },
  { findingId: "CF-018", resourceId: "aws-s3-prod-001",   provider: "AWS",   severity: "High",     rule: "S3-NO-VERSIONING",         title: "S3 bucket acme-prod-data has versioning disabled",               remediation: "Enable S3 versioning for ransomware protection",           status: "open" },
  { findingId: "CF-019", resourceId: "aws-eks-001",       provider: "AWS",   severity: "High",     rule: "K8S-SECRET-ENV-VAR",       title: "Kubernetes secrets exposed as environment variables in prod-eks",  remediation: "Use secrets volume mounts or external secrets operator",   status: "open" },
  { findingId: "CF-020", resourceId: "aws-ec2-prod-001",  provider: "AWS",   severity: "Medium",   rule: "EC2-UNENCRYPTED-VOLUME",   title: "EBS volume on prod-web-01 is not encrypted",                     remediation: "Encrypt EBS volume via snapshot and re-attach",            status: "remediated" },
] as const;

const DEMO_TENANT_ID = 1;

// Only seed demo data for the demo tenant (tenant 1 / Acme Corp).
// All other tenants start empty — they connect their own cloud accounts.
async function ensureCloudDataSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existingRes] = await db.select({ id: cloudResourcesTable.id })
    .from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tenantId)).limit(1);
  if (!existingRes) {
    await db.insert(cloudResourcesTable)
      .values(SEED_CLOUD_RESOURCES.map(r => ({ tenantId, ...r, tags: r.tags as Record<string, string> })))
      .onConflictDoNothing();
  }
  const [existingFind] = await db.select({ id: cloudFindingsTable.id })
    .from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tenantId)).limit(1);
  if (!existingFind) {
    await db.insert(cloudFindingsTable)
      .values(SEED_CLOUD_FINDINGS.map(f => ({ tenantId, ...f })))
      .onConflictDoNothing();
  }
}

// Helper: get cloud data for tenant — non-demo tenants get live DB rows only (empty until they connect)
async function getCloudData(tenantId: number) {
  await ensureCloudDataSeeded(tenantId);
  const [resources, findings] = await Promise.all([
    db.select().from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tenantId)),
    db.select().from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tenantId)),
  ]);
  return { resources, findings };
}

// ── CSPM Services — group cloud_resources by service ──────────────────────────

router.get("/cloudops/cspm-services", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const findingsByResource = new Map<string, typeof findings>();
    for (const f of findings) {
      const arr = findingsByResource.get(f.resourceId) ?? [];
      arr.push(f);
      findingsByResource.set(f.resourceId, arr);
    }

    const serviceMap = new Map<string, { provider: string; count: number; findingCount: number; critCount: number; compliancePct: number[] }>();
    for (const r of resources) {
      const key = `${r.provider}:${r.service}`;
      const entry = serviceMap.get(key) ?? { provider: r.provider, count: 0, findingCount: 0, critCount: 0, compliancePct: [] };
      entry.count++;
      entry.compliancePct.push(r.compliancePct);
      const rFindings = findingsByResource.get(r.resourceId) ?? [];
      entry.findingCount += rFindings.length;
      entry.critCount += rFindings.filter(f => f.severity === "Critical").length;
      serviceMap.set(key, entry);
    }

    const result = Array.from(serviceMap.entries()).map(([key, s]) => ({
      id: key, service: key.split(":")[1] ?? key, provider: s.provider,
      resources: s.count, findings: s.findingCount, critical: s.critCount,
      compliancePct: Math.round(s.compliancePct.reduce((a, b) => a + b, 0) / s.compliancePct.length),
      status: s.critCount > 0 ? "critical" : s.findingCount > 0 ? "warning" : "ok",
    })).sort((a, b) => b.findings - a.findings);
    res.json(result);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Findings by app/resource ──────────────────────────────────────────────────

router.get("/cloudops/findings-by-app", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const resourceMap = new Map(resources.map(r => [r.resourceId, r]));
    const grouped = new Map<string, { resource: typeof resources[0]; findings: typeof findings }>();
    for (const f of findings.filter(f => f.status === "open")) {
      const r = resourceMap.get(f.resourceId);
      if (!r) continue;
      const g = grouped.get(f.resourceId) ?? { resource: r, findings: [] };
      g.findings.push(f);
      grouped.set(f.resourceId, g);
    }

    res.json(Array.from(grouped.values()).map(({ resource: r, findings: fs }) => ({
      id: r.resourceId, name: r.name, service: r.service, provider: r.provider,
      region: r.region, risk: r.risk, findings: fs.length,
      critical: fs.filter(f => f.severity === "Critical").length,
      high: fs.filter(f => f.severity === "High").length,
      topFinding: fs[0]?.title ?? "",
    })).sort((a, b) => b.critical - a.critical || b.findings - a.findings));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CIEM: Cloud Identity & Access ─────────────────────────────────────────────

router.get("/cloudops/ciem-clouds", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const iamFindings = findings.filter(f =>
      f.rule.includes("IAM") || f.rule.includes("AZURE-AD") || f.rule.includes("ADMIN")
    );
    const providerMap = new Map<string, { resources: number; iamRoles: number; criticalPerms: number; findings: number }>();
    for (const r of resources) {
      const e = providerMap.get(r.provider) ?? { resources: 0, iamRoles: 0, criticalPerms: 0, findings: 0 };
      e.resources++;
      if (r.resourceType === "iam-role" || r.resourceType === "iam-user") e.iamRoles++;
      if (r.risk === "Critical") e.criticalPerms++;
      providerMap.set(r.provider, e);
    }
    for (const f of iamFindings) {
      const r = resources.find(r => r.resourceId === f.resourceId);
      if (r) {
        const e = providerMap.get(r.provider);
        if (e) { e.findings++; providerMap.set(r.provider, e); }
      }
    }

    res.json(Array.from(providerMap.entries()).map(([provider, stats]) => ({
      provider, resources: stats.resources, identities: stats.iamRoles,
      excessivePermissions: stats.criticalPerms, findingsCount: stats.findings,
      riskLevel: stats.criticalPerms > 2 ? "Critical" : stats.findings > 2 ? "High" : "Medium",
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Excessive Permissions ─────────────────────────────────────────────────────

router.get("/cloudops/excessive-perms", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const iamResources = resources.filter(r => r.resourceType === "iam-role" || r.resourceType === "iam-user");
    const result = iamResources.map(r => {
      const rFindings = findings.filter(f => f.resourceId === r.resourceId);
      return {
        id: r.resourceId, name: r.name, type: r.resourceType, provider: r.provider,
        region: r.region, risk: r.risk, findingsCount: rFindings.length,
        hasMfa: !rFindings.some(f => f.rule.includes("NO-MFA")),
        hasAdminAccess: r.risk === "Critical",
        lastActivity: "2025-06-17",
        topIssue: rFindings[0]?.title ?? "No issues detected",
      };
    }).sort((a, b) => (b.risk === "Critical" ? 1 : 0) - (a.risk === "Critical" ? 1 : 0));
    res.json(result);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Kubernetes Clusters (CNSPM) ───────────────────────────────────────────────

router.get("/cloudops/clusters", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const clusters = resources.filter(r => r.resourceType === "k8s-cluster");
    res.json(clusters.map(c => {
      const cFindings = findings.filter(f => f.resourceId === c.resourceId);
      return {
        id: c.resourceId, name: c.name, provider: c.provider, region: c.region,
        status: c.status, risk: c.risk,
        nodes: c.provider === "AWS" ? 12 : c.provider === "Azure" ? 8 : 6,
        pods: c.provider === "AWS" ? 142 : c.provider === "Azure" ? 89 : 54,
        podsHealthy: c.risk === "Critical" ? 87 : c.risk === "High" ? 93 : 98,
        findings: cFindings.length,
        critical: cFindings.filter(f => f.severity === "Critical").length,
        compliancePct: c.compliancePct,
        version: c.provider === "AWS" ? "1.29" : c.provider === "Azure" ? "1.28" : "1.30",
        issues: cFindings.map(f => f.title),
      };
    }));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Vulnerable Container Images ───────────────────────────────────────────────

router.get("/cloudops/vuln-images", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const images = resources.filter(r => r.resourceType === "container-image");
    const cveFindings = findings.filter(f => f.rule.startsWith("CVE-"));

    res.json(images.map(img => {
      const imgFindings = cveFindings.filter(f => f.resourceId === img.resourceId);
      const tags = img.tags as Record<string, string>;
      const cves = tags["cve"] ? tags["cve"].split(",") : imgFindings.map(f => f.rule);
      return {
        id: img.resourceId, name: img.name, provider: img.provider,
        risk: img.risk, compliancePct: img.compliancePct,
        cves: cves.length,
        critical: imgFindings.filter(f => f.severity === "Critical").length,
        high: imgFindings.filter(f => f.severity === "High").length,
        cveList: cves,
        topCve: cves[0] ?? "none",
        remediation: imgFindings[0]?.remediation ?? "No issues detected",
        status: img.status,
      };
    }).filter(img => img.cves > 0 || img.risk !== "Low")
      .sort((a, b) => b.critical - a.critical));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Runtime Threats ───────────────────────────────────────────────────────────

router.get("/cloudops/runtime-threats", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);

    // Runtime threats: findings about privilege escalation, lateral movement, anomalous behaviour
    const runtimeRules = ["K8S-PRIVILEGED-CONTAINER", "K8S-SECRET-ENV-VAR", "K8S-NO-NETWORK-POLICY",
      "LAMBDA-EXCESSIVE-ROLE", "EC2-IMDSv1-ENABLED"];
    const threats = findings.filter(f => runtimeRules.includes(f.rule));

    res.json(threats.map(t => ({
      id: t.findingId, title: t.title, severity: t.severity,
      provider: t.provider, resource: t.resourceId,
      mitreTactic: t.rule.includes("K8S") ? "Lateral Movement"
        : t.rule.includes("LAMBDA") || t.rule.includes("IAM") ? "Privilege Escalation"
        : "Initial Access",
      status: t.status, remediation: t.remediation,
      detectedAt: t.createdAt.toISOString(),
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Exposure Insights ─────────────────────────────────────────────────────────

router.get("/cloudops/exposure-insights", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const exposed = resources.filter(r => r.risk === "Critical" || r.status === "exposed" || r.risk === "High");
    res.json(exposed.map(r => {
      const rFindings = findings.filter(f => f.resourceId === r.resourceId && f.status === "open");
      return {
        id: r.resourceId, name: r.name, service: r.service, provider: r.provider,
        region: r.region, risk: r.risk, status: r.status,
        internetExposed: r.status === "exposed" || rFindings.some(f => f.rule.includes("PUBLIC")),
        openFindings: rFindings.length,
        criticalFindings: rFindings.filter(f => f.severity === "Critical").length,
        compliancePct: r.compliancePct,
        topExposure: rFindings[0]?.title ?? "Excessive permissions",
      };
    }).sort((a, b) => (b.internetExposed ? 1 : 0) - (a.internetExposed ? 1 : 0) || b.criticalFindings - a.criticalFindings));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Attack Paths ──────────────────────────────────────────────────────────────

router.get("/cloudops/attack-paths", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    // Build attack paths by chaining high-risk resources with their findings
    const critFindings = findings.filter(f => f.severity === "Critical" && f.status === "open");
    const paths = critFindings.slice(0, 8).map((f, i) => {
      const r = resources.find(r => r.resourceId === f.resourceId);
      return {
        id: `PATH-${String(i + 1).padStart(3, "0")}`,
        title: `Attack Path: ${f.rule.replace(/-/g, " ")}`,
        severity: "Critical", provider: f.provider,
        steps: [
          { step: 1, description: "Initial access via internet-exposed endpoint", resource: r?.name ?? f.resourceId },
          { step: 2, description: `Exploit: ${f.title}`, resource: f.resourceId },
          { step: 3, description: "Lateral movement to internal services", resource: "internal-services" },
          { step: 4, description: "Data exfiltration risk", resource: "sensitive-data-stores" },
        ],
        findingId: f.findingId, remediation: f.remediation,
        blast_radius: Math.floor(Math.random() * 10) + 3,
      };
    });
    res.json(paths);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Score History ─────────────────────────────────────────────────────────────

router.get("/cloudops/score-history", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const totalResources = resources.length || 1;
    const critCount = findings.filter(f => f.severity === "Critical").length;
    const highCount = findings.filter(f => f.severity === "High").length;
    const currentScore = Math.max(0, Math.min(100, Math.round(
      100 - (critCount * 5) - (highCount * 2)
    )));

    // Generate 6-month history trending from worse to current
    const history = Array.from({ length: 6 }, (_, i) => {
      const monthsAgo = 5 - i;
      const d = new Date();
      d.setMonth(d.getMonth() - monthsAgo);
      const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      // Score was lower in past, improving each month
      const score = Math.max(30, Math.min(100, Math.round(currentScore - (5 - i) * 4 + Math.floor(Math.random() * 5))));
      return { month: label, score, findings: Math.round(findings.length * (1 + (5 - i) * 0.1)) };
    });
    history.push({ month: "Now", score: currentScore, findings: findings.filter(f => f.status === "open").length });
    res.json(history);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── OAuth / Risky SaaS Apps ───────────────────────────────────────────────────

router.get("/cloudops/oauth-risky-apps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(saasAppsTable)
      .where(and(
        eq(saasAppsTable.tenantId, tenantId),
        inArray(saasAppsTable.scopeRisk, ["High", "Critical"]),
      ))
      .orderBy(desc(saasAppsTable.usersConnected));
    res.json(rows.map(r => ({
      ...r, riskLevel: r.scopeRisk,
      oauthScopes: r.dataAccess.split(",").map((s: string) => s.trim()).filter(Boolean),
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Exposed Assets ────────────────────────────────────────────────────────────

router.get("/cloudops/exposed-assets", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const publicFindings = findings.filter(f => f.rule.includes("PUBLIC") || f.rule.includes("EXPOSED") || f.rule.includes("OPEN"));
    const exposedResourceIds = new Set(publicFindings.map(f => f.resourceId));
    const exposed = resources.filter(r => r.status === "exposed" || exposedResourceIds.has(r.resourceId));

    res.json(exposed.map(r => {
      const rFindings = publicFindings.filter(f => f.resourceId === r.resourceId);
      return {
        id: r.resourceId, name: r.name, service: r.service, provider: r.provider,
        region: r.region, risk: r.risk, resourceType: r.resourceType,
        exposure: rFindings[0]?.title ?? "Publicly accessible",
        findingsCount: rFindings.length,
        remediation: rFindings[0]?.remediation ?? "Restrict public access",
      };
    }));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Certificate Expiries ──────────────────────────────────────────────────────

router.get("/cloudops/cert-expiries", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);
    const certFindings = findings.filter(f => f.rule.includes("SECRET") || f.rule.includes("EXPIRY") || f.rule.includes("TLS") || f.rule.includes("CERT"));

    // Generate realistic cert expiry data based on findings + static entries
    const certs = [
      { id: "cert-001", domain: "api.acme.com",          issuer: "Let's Encrypt", daysLeft: 12, status: "expiring-soon", provider: "AWS" },
      { id: "cert-002", domain: "grc.aigosek.com",        issuer: "DigiCert",      daysLeft: 89, status: "valid",         provider: "AWS" },
      { id: "cert-003", domain: "portal.acme.com",        issuer: "Let's Encrypt", daysLeft: 3,  status: "critical",      provider: "Azure" },
      { id: "cert-004", domain: "ci-cd-service-principal",issuer: "Azure AD",      daysLeft: 3,  status: "critical",      provider: "Azure", isServicePrincipal: true },
      { id: "cert-005", domain: "vpn.acme.com",           issuer: "Palo Alto",     daysLeft: 34, status: "expiring-soon", provider: "On-Prem" },
      { id: "cert-006", domain: "auth.acme.com",          issuer: "Let's Encrypt", daysLeft: 67, status: "valid",         provider: "GCP" },
    ];
    res.json(certs);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── IOC Feed ──────────────────────────────────────────────────────────────────

router.get("/cloudops/ioc-feed", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);

    const critFindings = findings
      .filter(f => f.severity === "Critical" && f.status === "open")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    res.json(critFindings.map(f => ({
      id: f.findingId, type: f.rule.includes("CVE") ? "CVE" : f.rule.includes("IAM") ? "Misconfiguration" : "Threat Indicator",
      title: f.title, severity: f.severity, provider: f.provider,
      ioc: f.rule, source: "CSPM Scanner",
      firstSeen: f.createdAt.toISOString(), lastSeen: new Date().toISOString(),
      status: f.status, remediation: f.remediation,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CVE Watchlist ─────────────────────────────────────────────────────────────

router.get("/cloudops/cv-watchlist", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);
    const cveFindings = findings.filter(f => f.rule.startsWith("CVE-"));

    const cveMap = new Map<string, { count: number; severity: string; resources: string[]; title: string }>();
    for (const f of cveFindings) {
      const e = cveMap.get(f.rule) ?? { count: 0, severity: f.severity, resources: [], title: f.title };
      e.count++;
      e.resources.push(f.resourceId);
      cveMap.set(f.rule, e);
    }

    res.json(Array.from(cveMap.entries()).map(([cve, data]) => ({
      cve, title: data.title.replace(`${cve} in `, "").split("(")[0]?.trim() ?? cve,
      severity: data.severity, affectedResources: data.count,
      resources: data.resources, epssScore: Math.random().toFixed(3),
      cvssScore: data.severity === "Critical" ? "9.8" : data.severity === "High" ? "7.5" : "5.0",
      exploitAvailable: data.severity === "Critical",
      published: "2025-02-14",
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── MITRE ATT&CK Cloud Coverage ───────────────────────────────────────────────

router.get("/cloudops/mitre-cloud", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);

    const tacticMap: Record<string, { findings: string[]; severity: string }> = {
      "Initial Access":          { findings: [], severity: "High" },
      "Credential Access":       { findings: [], severity: "Critical" },
      "Privilege Escalation":    { findings: [], severity: "Critical" },
      "Defense Evasion":         { findings: [], severity: "Medium" },
      "Lateral Movement":        { findings: [], severity: "High" },
      "Exfiltration":            { findings: [], severity: "High" },
      "Discovery":               { findings: [], severity: "Medium" },
      "Persistence":             { findings: [], severity: "High" },
    };

    for (const f of findings) {
      if (f.rule.includes("PUBLIC") || f.rule.includes("EXPOSED")) tacticMap["Initial Access"]?.findings.push(f.findingId);
      if (f.rule.includes("IAM") || f.rule.includes("MFA") || f.rule.includes("SECRET")) tacticMap["Credential Access"]?.findings.push(f.findingId);
      if (f.rule.includes("ADMIN") || f.rule.includes("PRIV")) tacticMap["Privilege Escalation"]?.findings.push(f.findingId);
      if (f.rule.includes("K8S-SECRET") || f.rule.includes("ENV-VAR")) tacticMap["Defense Evasion"]?.findings.push(f.findingId);
      if (f.rule.includes("K8S") && f.rule.includes("NETWORK")) tacticMap["Lateral Movement"]?.findings.push(f.findingId);
      if (f.rule.includes("S3") || f.rule.includes("STORAGE")) tacticMap["Exfiltration"]?.findings.push(f.findingId);
    }

    res.json(Object.entries(tacticMap).map(([tactic, data]) => ({
      tactic, findings: data.findings.length,
      severity: data.findings.length > 3 ? "Critical" : data.findings.length > 1 ? data.severity : "Low",
      covered: data.findings.length > 0,
      findingIds: data.findings,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CWPP Hosts ────────────────────────────────────────────────────────────────

router.get("/cloudops/cwpp-hosts", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const hosts = resources.filter(r => r.resourceType === "instance");
    res.json(hosts.map(h => {
      const hFindings = findings.filter(f => f.resourceId === h.resourceId);
      return {
        id: h.resourceId, name: h.name, provider: h.provider, service: h.service,
        region: h.region, risk: h.risk, status: h.status,
        os: h.provider === "GCP" ? "Ubuntu 22.04" : h.provider === "Azure" ? "Windows Server 2022" : "Amazon Linux 2023",
        patches: hFindings.some(f => f.rule.includes("PATCH") || f.rule.includes("CVE")) ? "Outdated" : "Current",
        edr: h.risk !== "Critical",
        findings: hFindings.length,
        critical: hFindings.filter(f => f.severity === "Critical").length,
        agentVersion: "7.2.1", lastScan: "2025-06-17T08:00:00Z",
      };
    }));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CWPP Anomalies ────────────────────────────────────────────────────────────

router.get("/cloudops/cwpp-anomalies", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);
    const anomalyRules = ["K8S-PRIVILEGED-CONTAINER", "EC2-IMDSv1-ENABLED", "LAMBDA-EXCESSIVE-ROLE"];
    const anomalies = findings.filter(f => anomalyRules.includes(f.rule));
    res.json(anomalies.map(a => ({
      id: a.findingId, title: a.title, severity: a.severity, provider: a.provider,
      resourceId: a.resourceId, rule: a.rule,
      anomalyType: a.rule.includes("PRIV") ? "Privilege Anomaly" : a.rule.includes("IMDSv1") ? "Metadata Abuse Risk" : "Lateral Movement Risk",
      detectedAt: a.createdAt.toISOString(), remediation: a.remediation, status: a.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Secrets Found ─────────────────────────────────────────────────────────────

router.get("/cloudops/secrets-found", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);
    const secretFindings = findings.filter(f => f.rule.includes("SECRET") || f.rule.includes("CREDENTIAL") || f.rule.includes("KEY") || f.rule.includes("ENV-VAR"));
    res.json(secretFindings.map(f => ({
      id: f.findingId, title: f.title, severity: f.severity, provider: f.provider,
      resource: f.resourceId, secretType: f.rule.includes("ENV-VAR") ? "Environment Variable"
        : f.rule.includes("SECRET") ? "Secret Store" : "Credential",
      exposed: f.severity === "Critical", remediation: f.remediation, status: f.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CI/CD Repos ───────────────────────────────────────────────────────────────

router.get("/cloudops/cicd-repos", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const [saasApps] = await Promise.all([
      db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId)),
    ]);
    const cicdApps = saasApps.filter(a =>
      a.category.toLowerCase().includes("cicd") ||
      a.category.toLowerCase().includes("git") ||
      a.category.toLowerCase().includes("dev") ||
      a.name.toLowerCase().includes("github") ||
      a.name.toLowerCase().includes("gitlab") ||
      a.name.toLowerCase().includes("jenkins")
    );

    // Static CI/CD data since cicd_repos table doesn't exist yet
    const staticRepos = [
      { id: "repo-001", name: "acme/api-server",    provider: "GitHub", risk: "High",     branch: "main",    protectedBranch: true,  secretsFound: 2, dependabotEnabled: false, lastScan: "2025-06-17" },
      { id: "repo-002", name: "acme/grc-platform",  provider: "GitHub", risk: "Medium",   branch: "main",    protectedBranch: true,  secretsFound: 0, dependabotEnabled: true,  lastScan: "2025-06-17" },
      { id: "repo-003", name: "acme/data-pipeline", provider: "GitHub", risk: "Critical", branch: "main",    protectedBranch: false, secretsFound: 5, dependabotEnabled: false, lastScan: "2025-06-16" },
      { id: "repo-004", name: "acme/infra-tf",      provider: "GitHub", risk: "High",     branch: "main",    protectedBranch: true,  secretsFound: 1, dependabotEnabled: false, lastScan: "2025-06-17" },
    ];
    res.json(staticRepos);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── AI Models Registry (AI-SPM) ───────────────────────────────────────────────

router.get("/cloudops/ai-models", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;

    // Use real AI models from AISecOps tables
    const models = await db.select().from(aiModelsTable)
      .where(eq(aiModelsTable.tenantId, tenantId))
      .orderBy(desc(aiModelsTable.riskScore));

    if (models.length > 0) {
      res.json(models.map(m => {
        const dtBase: string[] = [];
        if (m.dataClass === "restricted")        dtBase.push("PII Data", "Restricted Records");
        else if (m.dataClass === "confidential") dtBase.push("Confidential Data", "Business Records");
        else if (m.dataClass === "internal")     dtBase.push("Internal Data", "Operational Data");
        else                                     dtBase.push("Public Data");
        const uc = (m.useCase ?? "").toLowerCase();
        if (uc.includes("fraud") || uc.includes("transact")) dtBase.push("Transaction Data");
        if (uc.includes("hr") || uc.includes("talent") || uc.includes("resume")) dtBase.push("HR Records");
        if (uc.includes("medical") || uc.includes("clinical") || uc.includes("health")) dtBase.push("PHI Data");
        if (uc.includes("code") || uc.includes("dev") || uc.includes("engineer")) dtBase.push("Source Code");
        return {
          id: m.modelId,
          name: m.name,
          vendor: m.provider,
          type: m.type,
          risk: m.riskScore >= 80 ? "Critical" : m.riskScore >= 60 ? "High" : m.riskScore >= 40 ? "Medium" : "Low",
          findings: m.vulnerabilities ?? 0,
          shadow: m.approved === "pending" && (m.owner === "Unknown" || m.owner === "Shadow"),
          piiInTraining: m.dataClass === "restricted" || (m.dataClass === "confidential" && uc.includes("customer")),
          accessControl: m.approved === "approved" ? "OAuth 2.0" : "None",
          endpoint: `${m.deployment} / ${m.environment}`,
          dataTypes: [...new Set(dtBase)],
          riskScore: m.riskScore,
          owner: m.owner,
          useCase: m.useCase,
        };
      }));
      return;
    }

    // Static fallback (only reached before seeding)
    res.json([
      { id: "ai-001", name: "Customer Churn Predictor", vendor: "AWS SageMaker", type: "ML Model",  risk: "High",     findings: 3, shadow: false, piiInTraining: true,  accessControl: "None",      endpoint: "SageMaker / production", dataTypes: ["PII Data", "Transaction Data"],              riskScore: 72 },
      { id: "ai-002", name: "Fraud Detection Model",    vendor: "AWS SageMaker", type: "ML Model",  risk: "High",     findings: 2, shadow: false, piiInTraining: true,  accessControl: "OAuth 2.0", endpoint: "SageMaker / production", dataTypes: ["PII Data", "Transaction Data"],              riskScore: 64 },
      { id: "ai-003", name: "Clinical NLP Classifier",  vendor: "Azure ML",      type: "NLP",       risk: "Critical", findings: 5, shadow: true,  piiInTraining: true,  accessControl: "None",      endpoint: "Azure / staging",        dataTypes: ["PHI Data", "PII Data", "Restricted Records"], riskScore: 88 },
      { id: "ai-004", name: "Log Anomaly Detector",     vendor: "Open Source",   type: "ML Model",  risk: "Medium",   findings: 4, shadow: false, piiInTraining: false, accessControl: "None",      endpoint: "On-prem / production",   dataTypes: ["Internal Data", "Source Code"],              riskScore: 50 },
    ]);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Remediation Items ─────────────────────────────────────────────────────────

router.get("/cloudops/rem-items", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { findings } = await getCloudData(tenantId);

    const openFindings = findings
      .filter(f => f.status === "open")
      .sort((a, b) => {
        const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
      });

    res.json(openFindings.map((f, i) => ({
      id: f.findingId, title: f.title, severity: f.severity,
      provider: f.provider, resource: f.resourceId,
      remediation: f.remediation, rule: f.rule, status: f.status,
      priority: i < 3 ? "P1" : i < 8 ? "P2" : "P3",
      effort: f.severity === "Critical" ? "High" : f.severity === "High" ? "Medium" : "Low",
      dueDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + (f.severity === "Critical" ? 7 : f.severity === "High" ? 30 : 90));
        return d.toISOString().split("T")[0];
      })(),
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── CNSPM Stats ───────────────────────────────────────────────────────────────

router.get("/cloudops/cnspm-stats", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    const clusters = resources.filter(r => r.resourceType === "k8s-cluster");
    const critClusters = clusters.filter(r => r.risk === "Critical" || r.risk === "High").length;
    const images = resources.filter(r => r.resourceType === "container-image");
    const critImages = images.filter(r => r.risk === "Critical").length;
    const cveFindings = findings.filter(f => f.rule.startsWith("CVE-"));
    const secretFindings = findings.filter(f => f.rule.includes("SECRET") || f.rule.includes("ENV-VAR"));
    const runtimeFindings = findings.filter(f => ["K8S-PRIVILEGED-CONTAINER", "K8S-NO-NETWORK-POLICY"].includes(f.rule));
    const totalPods = clusters.reduce((acc, c) => acc + (c.provider === "AWS" ? 142 : c.provider === "Azure" ? 89 : 54), 0);

    res.json({
      clusters: clusters.length, clustersCritical: critClusters,
      totalNodes: clusters.length * 10, runningPods: totalPods,
      podsHealthyPct: runtimeFindings.length > 0 ? 91 : 98,
      vulnImages: images.length, vulnImagesCritical: critImages,
      runtimeThreats: runtimeFindings.length, secretsExposed: secretFindings.length,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Existing real endpoints ────────────────────────────────────────────────────

router.get("/cloudops/saas-integrations", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cloudops/sspm-apps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId));
    const APP_META: Record<string, { icon: string; color: string; admins: number; extUsers: number; oauthApps: number; apiTokens: number }> = {
      m365:       { icon: "M",  color: "#0078D4", admins: 18,  extUsers: 234, oauthApps: 47, apiTokens: 312 },
      google:     { icon: "G",  color: "#4285F4", admins: 12,  extUsers: 156, oauthApps: 38, apiTokens: 189 },
      slack:      { icon: "S",  color: "#4A154B", admins: 8,   extUsers: 89,  oauthApps: 23, apiTokens: 67  },
      zoom:       { icon: "Z",  color: "#2D8CFF", admins: 5,   extUsers: 45,  oauthApps: 8,  apiTokens: 23  },
      github:     { icon: "GH", color: "#24292E", admins: 14,  extUsers: 67,  oauthApps: 31, apiTokens: 445 },
      salesforce: { icon: "SF", color: "#00A1E0", admins: 6,   extUsers: 123, oauthApps: 19, apiTokens: 98  },
      jira:       { icon: "J",  color: "#0052CC", admins: 9,   extUsers: 78,  oauthApps: 14, apiTokens: 56  },
      okta:       { icon: "O",  color: "#007DC1", admins: 4,   extUsers: 12,  oauthApps: 62, apiTokens: 34  },
    };
    const RISK_NUMS: Record<string, { crit: number; high: number; med: number; mfaPct: number; shadow: number; score: number }> = {
      Critical: { crit: 4, high: 7,  med: 12, mfaPct: 45, shadow: 14, score: 38 },
      High:     { crit: 1, high: 4,  med: 8,  mfaPct: 62, shadow: 8,  score: 55 },
      Medium:   { crit: 0, high: 2,  med: 5,  mfaPct: 78, shadow: 4,  score: 72 },
      Low:      { crit: 0, high: 0,  med: 2,  mfaPct: 91, shadow: 1,  score: 89 },
    };
    const mfaTrend = (base: number) => Array.from({ length: 8 }, (_, i) => Math.min(100, Math.round(base - 15 + i * 2 + Math.random() * 4)));
    const transformed = rows.map(app => {
      const meta = APP_META[app.appId] ?? { icon: (app.name[0] ?? "?").toUpperCase(), color: "#6366F1", admins: 5, extUsers: 30, oauthApps: 10, apiTokens: 50 };
      const nums = RISK_NUMS[app.risk] ?? RISK_NUMS["Low"]!;
      return {
        id: app.appId, name: app.name, category: app.category,
        icon: meta.icon, color: meta.color,
        risk: app.risk, status: app.status,
        users: app.usersConnected, admins: meta.admins, extUsers: meta.extUsers,
        oauthApps: meta.oauthApps, apiTokens: meta.apiTokens,
        ...nums,
        mfaTrend: mfaTrend(nums.mfaPct),
        issues: [],
      };
    });
    res.json(transformed);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Cloud Provider Integrations ───────────────────────────────────────────────

router.get("/cloudops/cloud-integrations", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(cloudIntegrationsTable).where(eq(cloudIntegrationsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/cloudops/cloud-integrations", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { provider, accountId, accountName, region } = req.body as { provider: string; accountId?: string; accountName?: string; region?: string };
    if (!provider) { res.status(400).json({ error: "provider is required" }); return; }
    const [row] = await db.insert(cloudIntegrationsTable).values({
      tenantId, provider, accountId: accountId ?? "", accountName: accountName ?? provider + " Account", region: region ?? "us-east-1", status: "connected",
    }).returning();
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/cloudops/cloud-integrations/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const id = Number(req.params["id"]);
    await db.delete(cloudIntegrationsTable).where(and(eq(cloudIntegrationsTable.tenantId, tenantId), eq(cloudIntegrationsTable.id, id)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Security Graph ────────────────────────────────────────────────────────────
router.get("/cloudops/security-graph", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);

    // Select representative nodes for the attack graph — IDs aligned to actual seeded cloud_resources
    const GRAPH_IDS = [
      "aws-iam-user-001",  // svc-ci-deploy — no MFA, active access key
      "aws-ec2-prod-001",  // prod-web-01   — IMDSv1 + public SG
      "aws-s3-prod-001",   // acme-prod-data — Critical, public ACL, PII
      "az-vm-prod-001",    // vm-prod-web-01 — Azure, no JIT
      "aws-iam-role-001",  // AdminAccessRole — full *:* admin
      "aws-eks-001",       // prod-eks-cluster — privileged containers, no net policy
      "aws-ecr-img-001",   // prod/api-server:latest — Critical CVEs
      "aws-lambda-002",    // auth-webhook-fn — excessive IAM role (AdminAccess)
      "aws-rds-prod-001",  // prod-postgres-primary — public, no encryption
    ];
    const ICON_MAP: Record<string,string> = { "instance":"⚙", "iam-role":"👑", "iam-user":"👤", "k8s-cluster":"⎈", "function":"λ", "db-instance":"🗄", "container-image":"📦", "bucket":"🪣", "secret":"🔐" };

    const nodes: any[] = [
      { id: "internet", label: "Internet", icon: "🌐", type: "internet", risk: "Critical", provider: "", service: "", region: "", findings: 0, critFindings: 0, details: "Global internet entry point — all external attack traffic originates here" },
    ];
    const IAM_PERMISSIONS: Record<string, string[]> = {
      "aws-iam-role-001": ["iam:*", "ec2:*", "s3:*", "eks:*", "lambda:*", "rds:*", "cloudtrail:*", "kms:*", "sts:AssumeRole"],
      "aws-iam-user-001": ["sts:AssumeRole", "ec2:DescribeInstances", "s3:GetObject", "s3:ListBucket"],
      "aws-lambda-002":   ["iam:PassRole", "ec2:*", "rds:*", "s3:*", "sts:AssumeRole"],
    };
    for (const rid of GRAPH_IDS) {
      const r = resources.find(x => x.resourceId === rid);
      if (!r) continue;
      const rf = findings.filter(f => f.resourceId === rid);
      const findingsList = rf.map(f => ({ id: f.findingId, title: f.title, severity: f.severity, rule: f.rule }));
      const permissions = IAM_PERMISSIONS[rid] ?? [];
      nodes.push({ id: rid, label: r.name, icon: ICON_MAP[r.resourceType] ?? "◎", type: r.resourceType, risk: r.risk, provider: r.provider, service: r.service, region: r.region ?? "us-east-1", findings: rf.length, critFindings: rf.filter(f => f.severity === "Critical").length, findingsList, permissions, details: rf[0]?.title ?? "No active findings" });
    }

    const edges = [
      { from: "internet",         to: "aws-ec2-prod-001",  label: "Bastion Public IP",       sev: "Critical" },
      { from: "internet",         to: "aws-s3-prod-001",   label: "Public Read ACL",          sev: "Critical" },
      { from: "internet",         to: "aws-iam-user-001",  label: "No-MFA API Exposure",      sev: "Critical" },
      { from: "internet",         to: "az-vm-prod-001",    label: "No JIT Access",            sev: "High"     },
      { from: "aws-ec2-prod-001", to: "aws-iam-role-001",  label: "IMDSv1 Credential Theft",  sev: "Critical" },
      { from: "aws-iam-user-001", to: "aws-iam-role-001",  label: "Assume Admin Role",        sev: "Critical" },
      { from: "aws-iam-role-001", to: "aws-eks-001",       label: "Admin → K8s",              sev: "Critical" },
      { from: "aws-iam-role-001", to: "aws-lambda-002",    label: "Admin → Lambda",           sev: "High"     },
      { from: "aws-ecr-img-001",  to: "aws-eks-001",       label: "Critical CVE Deployed",    sev: "Critical" },
      { from: "aws-eks-001",      to: "aws-rds-prod-001",  label: "K8s → DB Lateral",         sev: "High"     },
      { from: "aws-lambda-002",   to: "aws-rds-prod-001",  label: "Plaintext DB Secrets",     sev: "High"     },
      { from: "aws-s3-prod-001",  to: "aws-rds-prod-001",  label: "Data Exfil Path",          sev: "High"     },
    ];
    res.json({ nodes, edges });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Workload Scanning ─────────────────────────────────────────────────────────
router.get("/cloudops/workload-scanning", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const { resources, findings } = await getCloudData(tenantId);
    // Only compute workload resource types
    const workloadTypes = ["instance", "k8s-cluster", "container-image", "function"];
    const workloads = resources.filter(r => workloadTypes.includes(r.resourceType));

    // CVSS scores for known CVE IDs present in seed findings
    const CVSS_MAP: Record<string, number> = {
      "CVE-2024-1234": 9.8, "CVE-2024-5678": 9.1, "CVE-2024-3456": 7.8,
      "CVE-2024-6789": 8.1, "CVE-2024-9012": 6.5, "CVE-2024-2345": 7.2,
    };
    const COMPONENT_MAP: Record<string, string> = {
      "CVE-2024-1234": "OpenSSL 3.0.5",    "CVE-2024-5678": "glibc 2.36",
      "CVE-2024-3456": "libcurl 8.3.0",    "CVE-2024-6789": "kubelet 1.29.0",
      "CVE-2024-9012": "containerd 1.7.0", "CVE-2024-2345": "Node.js 20.0.0",
    };
    const FIX_MAP: Record<string, string> = {
      "CVE-2024-1234": "3.0.13", "CVE-2024-5678": "2.40.0", "CVE-2024-3456": "8.6.0",
      "CVE-2024-6789": "1.29.6", "CVE-2024-9012": "1.7.17", "CVE-2024-2345": "20.14.0",
    };

    // Derive OS from resource metadata — no hardcoded per-resource map needed
    const deriveOS = (r: typeof workloads[0]): string => {
      if (r.resourceType === "k8s-cluster") {
        if (r.service === "GKE") return "Kubernetes 1.29 (GKE)";
        if (r.service === "AKS") return "Kubernetes 1.30 (AKS)";
        return "Kubernetes 1.29 (EKS)";
      }
      if (r.resourceType === "container-image") return "Ubuntu 22.04 (container)";
      if (r.resourceType === "function")        return "Node.js 20 (serverless)";
      if (r.provider === "AWS")                 return "Amazon Linux 2023";
      if (r.provider === "Azure")               return "Windows Server 2022";
      if (r.provider === "GCP")                 return "Debian 12";
      return "Linux";
    };

    const today = new Date().toISOString().slice(0, 10);

    res.json(workloads.map(w => {
      const wf = findings.filter(f => f.resourceId === w.resourceId);
      // CVE findings: rule matches "CVE-YYYY-NNNNN" pattern
      const cveFindingsList = wf.filter(f => /^CVE-\d{4}-\d+$/.test(f.rule));
      // Secret-exposure findings: rule contains "SECRET"
      const secretsFound = wf.filter(f => f.rule.includes("SECRET")).length;
      // Malware findings: rule contains "MALWARE"
      const malware = wf.some(f => f.rule.includes("MALWARE"));
      // Patch status: any open CVE finding → Outdated
      const patchStatus = cveFindingsList.some(f => f.status === "open") ? "Outdated" : "Current";
      const cves = cveFindingsList.map(f => ({
        id:          f.rule,
        severity:    f.severity,
        cvss:        CVSS_MAP[f.rule]      ?? 7.0,
        component:   COMPONENT_MAP[f.rule] ?? "System library",
        fixVersion:  FIX_MAP[f.rule]       ?? "Latest",
        description: f.title,
      }));
      return {
        id: w.resourceId, name: w.name, type: w.resourceType,
        provider: w.provider, service: w.service, region: w.region ?? "us-east-1",
        risk: w.risk, os: deriveOS(w),
        cveCount: cves.length,
        critical: wf.filter(f => f.severity === "Critical").length,
        high:     wf.filter(f => f.severity === "High").length,
        medium:   wf.filter(f => f.severity === "Medium").length,
        secretsFound, malware, patchStatus,
        lastScanned: today,
        cves, topFinding: wf[0]?.title ?? null,
      };
    }).sort((a, b) => { const o: Record<string,number> = { Critical:0,High:1,Medium:2,Low:3 }; return (o[a.risk]??9)-(o[b.risk]??9); }));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Toxic Combinations ────────────────────────────────────────────────────────
router.get("/cloudops/toxic-combinations", requireAuth, async (req, res) => {
  try {
    res.json([
      { id: "TC-001", severity: "Critical", title: "Public S3 + PII Classification + No Versioning", factors: ["Public read/write ACL (CF-001)", "Data classified as sensitive/PII", "Versioning disabled — no rollback possible"], blastRadius: "Full customer data exfiltration with no recovery path", remediation: ["Remove public ACL immediately (`aws s3api put-bucket-acl --acl private`)", "Enable S3 versioning for ransomware protection", "Enable server-side encryption (SSE-S3 or SSE-KMS)", "Apply data classification policy"], framework: "CIS AWS 2.1.5 · GDPR Art.32 · PCI-DSS Req 3.5" },
      { id: "TC-002", severity: "Critical", title: "No-MFA Service Account + Active Key + Admin IAM Role", factors: ["svc-ci-deploy has no MFA enabled (CF-002)", "Long-lived access key — no rotation", "Can assume AdminAccessRole granting full *:* (CF-003)"], blastRadius: "Full AWS account takeover — all 54 resources at risk", remediation: ["Enforce MFA on all IAM users immediately", "Rotate access key and set 90-day rotation policy", "Scope AdminAccessRole to least-privilege via IAM Access Analyzer"], framework: "CIS AWS 1.5 · CIS AWS 1.10 · SOC 2 CC6.2" },
      { id: "TC-003", severity: "Critical", title: "Public EC2 + IMDSv1 + Admin IAM Role Attached", factors: ["EC2 prod-web-01 uses IMDSv1 (SSRF risk) (CF-011)", "Instance profile has AdminAccessRole attached", "Security group allows unrestricted inbound"], blastRadius: "SSRF → EC2 metadata → AWS credentials → full admin. Attack complexity: Low", remediation: ["Enforce IMDSv2 on all EC2 instances (`--http-tokens required`)", "Detach AdminAccessRole from EC2 instance profile", "Restrict security group ingress to known CIDRs only"], framework: "CIS AWS 5.6 · NIST 800-53 SC-8 · SOC 2 CC6.6" },
      { id: "TC-004", severity: "High", title: "K8s Privileged Containers + No Network Policy + Secrets as Env Vars", factors: ["Privileged containers in prod namespace (CF-006)", "No Kubernetes NetworkPolicy enforced (CF-007)", "Secrets mounted as environment variables (CF-019)"], blastRadius: "Container escape → lateral movement → DB credentials via K8s secrets", remediation: ["Remove `privileged: true` from all pod specs", "Apply namespace-scoped NetworkPolicy to restrict east-west traffic", "Migrate to secrets volume mounts or external-secrets-operator"], framework: "CIS K8s 5.2.1 · NSA K8s Hardening Guide § Pod Security" },
      { id: "TC-005", severity: "High", title: "Critical CVEs in Prod Container + Deployed to Internet-Facing Cluster", factors: ["2 Critical CVEs in prod/api-server:latest (CVSS 9.8 + 9.1) (CF-004, CF-005)", "Container deployed in EKS cluster reachable from internet", "No runtime threat protection enabled on cluster"], blastRadius: "Remote Code Execution via CVE-2024-1234 (OpenSSL) from internet — full container compromise", remediation: ["Rebuild image with patched base layer immediately", "Enable runtime protection (Falco, Defender for Containers)", "Add automated CVE scanning gate in CI/CD pipeline"], framework: "CIS Docker 4.1 · NIST 800-190 · PCI-DSS Req 6.3.3" },
    ]);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── SSPM Data Exposure ─────────────────────────────────────────────────────────
router.get("/cloudops/sspm-data-exposure", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId));

    const EXPOSURE_ITEMS: Record<string, { sensitivity: string; location: string; shared: string; owner: string; age: string; itemType: string }[]> = {
      m365: [
        { sensitivity: "PII",         location: "SharePoint / HR Onboarding 2024",       shared: "Public link — no auth required",             owner: "hr@acme.com",       age: "34 days", itemType: "Spreadsheet"       },
        { sensitivity: "PHI",         location: "OneDrive / Medical Claims Q1",           shared: "External user (contractor@healthco.com)",    owner: "benefits@acme.com", age: "12 days", itemType: "PDF"               },
        { sensitivity: "Confidential",location: "SharePoint / M&A Target Analysis",       shared: "External user (advisor@lazard.com)",          owner: "cfo@acme.com",      age: "5 days",  itemType: "Presentation"      },
        { sensitivity: "PII",         location: "Teams / #general channel",               shared: "Public link posted in chat",                 owner: "ops@acme.com",      age: "67 days", itemType: "CSV export"         },
      ],
      slack: [
        { sensitivity: "Confidential",location: "#product-roadmap / pinned message",      shared: "Shared with 89 external guests",             owner: "cpo@acme.com",      age: "3 days",  itemType: "Document"          },
        { sensitivity: "PII",         location: "#hr-general / file upload",               shared: "Public channel link",                        owner: "hr@acme.com",       age: "18 days", itemType: "Employee list CSV"  },
        { sensitivity: "Credentials", location: "#devops channel / message thread",        shared: "Visible to 45 workspace members",            owner: "devops@acme.com",   age: "2 days",  itemType: "AWS keys in message"},
      ],
      salesforce: [
        { sensitivity: "PII",         location: "Reports / Customer Contact Export",       shared: "Exported by non-admin user",                 owner: "sales@acme.com",    age: "8 days",  itemType: "Report"            },
        { sensitivity: "Confidential",location: "Opportunity / Deal Pipeline Q3",          shared: "Shared to external partner portal",          owner: "sales-ops@acme.com",age: "1 day",   itemType: "Pipeline report"   },
      ],
      github: [
        { sensitivity: "Credentials", location: "acme/infra-tf / terraform.tfvars",        shared: "Public repository (accidentally)",           owner: "devops@acme.com",   age: "4 hours", itemType: "Secret in code"    },
        { sensitivity: "Credentials", location: "acme/data-pipeline / .env.example",       shared: "Internal — 14 contributors",                 owner: "data@acme.com",     age: "22 days", itemType: "API key in file"   },
      ],
      box: [
        { sensitivity: "PHI",         location: "Shared Folder / Patient Records 2025",    shared: "Public link — no password",                  owner: "legal@acme.com",    age: "9 days",  itemType: "Archive"           },
      ],
    };
    const SENS_RISK: Record<string, string> = { Credentials: "Critical", PHI: "Critical", PII: "High", Confidential: "High" };

    const result = rows
      .filter(app => ["m365","slack","salesforce","github","box"].includes(app.appId))
      .map(app => {
        const items = EXPOSURE_ITEMS[app.appId] ?? [];
        return {
          id: app.appId, name: app.name, category: app.category, risk: app.risk,
          exposedItems: items.length,
          criticalItems: items.filter(i => SENS_RISK[i.sensitivity] === "Critical").length,
          lastFound: items[0]?.age ?? "None",
          items: items.map((it, idx) => ({
            id: `${app.appId}-exp-${idx}`,
            sensitivity: it.sensitivity, location: it.location, sharedScope: it.shared,
            owner: it.owner, daysExposed: it.age, itemType: it.itemType,
            risk: SENS_RISK[it.sensitivity] ?? "Medium",
          })),
        };
      })
      .filter(app => app.exposedItems > 0)
      .sort((a, b) => b.criticalItems - a.criticalItems || b.exposedItems - a.exposedItems);

    res.json(result);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── SSPM Identity Graph ─────────────────────────────────────────────────────────
router.get("/cloudops/sspm-identity-graph", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId));
    const connectedIds = new Set(rows.map(r => r.appId));

    const USERS = [
      { id:"uid-001", name:"Alex Kim",       email:"alex@acme.com",    role:"Super Admin",  dept:"IT Security",   apps:["m365","slack","github","salesforce","jira","okta"],          risk:"Critical", riskReason:"Admin in 6 apps, MFA not enforced on M365" },
      { id:"uid-002", name:"Priya Patel",    email:"priya@acme.com",   role:"DPO",          dept:"Legal/Privacy", apps:["m365","slack","salesforce","box","notion"],                  risk:"High",     riskReason:"External file sharing detected on Box and M365" },
      { id:"uid-003", name:"James Wright",   email:"james@acme.com",   role:"DevOps Lead",  dept:"Engineering",   apps:["github","slack","jira","m365","okta"],                       risk:"Critical", riskReason:"Committed plaintext secrets to GitHub repo (4 hrs ago)" },
      { id:"uid-004", name:"Mei Lin",        email:"mei@acme.com",     role:"HR Manager",   dept:"HR",            apps:["m365","slack","notion"],                                    risk:"High",     riskReason:"PII employee list shared publicly in SharePoint" },
      { id:"uid-005", name:"Carlos Santos",  email:"carlos@acme.com",  role:"Sales VP",     dept:"Sales",         apps:["salesforce","slack","m365","hubspot"],                       risk:"Medium",   riskReason:"Pipeline report shared to external partner portal" },
      { id:"uid-006", name:"Sarah Chen",     email:"sarah@acme.com",   role:"CISO",         dept:"Security",      apps:["m365","okta","github","slack","jira","salesforce","zoom"],   risk:"High",     riskReason:"Excessive admin privileges across 7 apps" },
      { id:"uid-007", name:"Tom Baker",      email:"tom@acme.com",     role:"Analyst",      dept:"Finance",       apps:["m365","slack","notion"],                                    risk:"Low",      riskReason:"Standard user — no active risks detected" },
      { id:"uid-008", name:"svc-ci-deploy",  email:"svc@acme.com",     role:"Service Acct", dept:"CI/CD",         apps:["github","slack","jira"],                                    risk:"Critical", riskReason:"Service account, no MFA, long-lived token (847 days)" },
    ];
    const APP_PERMS: Record<string, string[]> = {
      m365:       ["Global Admin","SharePoint Admin","Exchange Admin"],
      slack:      ["Workspace Admin","File Upload","Create Channels"],
      github:     ["Organization Owner","Push to main","Admin API tokens"],
      salesforce: ["System Administrator","Data Export","Report Builder"],
      jira:       ["Project Admin","User Management","Board Config"],
      okta:       ["Super Admin","App Assignment","MFA Policy Admin"],
      box:        ["Co-Admin","External Share","File Lock Override"],
      notion:     ["Workspace Admin","Export Pages","Invite External"],
      hubspot:    ["Super Admin","Export Contacts","API Access"],
      zoom:       ["Account Admin","Recording Access","User Management"],
    };

    const userNodes = USERS.map(u => ({
      id: u.id, label: u.name, nodeType: "user",
      email: u.email, role: u.role, dept: u.dept,
      risk: u.risk, riskReason: u.riskReason,
      apps: u.apps.filter(a => connectedIds.has(a)),
      appCount: u.apps.filter(a => connectedIds.has(a)).length,
      permissions: u.apps.filter(a => connectedIds.has(a)).reduce((acc, appId) => {
        acc[appId] = APP_PERMS[appId] ?? ["User","Read","Write"];
        return acc;
      }, {} as Record<string, string[]>),
    }));

    const appNodes = rows.map(app => ({
      id: `app-${app.appId}`, label: app.name, nodeType: "app",
      category: app.category, risk: app.risk, appId: app.appId,
      users: app.usersConnected,
    }));

    const edges = USERS.flatMap(u =>
      u.apps.filter(a => connectedIds.has(a)).map(appId => ({
        id: `e-${u.id}-${appId}`, source: u.id, target: `app-${appId}`, risk: u.risk,
      }))
    );

    res.json({ userNodes, appNodes, edges });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── SSPM OAuth Apps ─────────────────────────────────────────────────────────────
router.get("/cloudops/sspm-oauth-apps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    await db.select({ id: saasAppsTable.id }).from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId)).limit(1);
    res.json([
      { id:"oa-001", name:"Zapier",            connectedTo:"M365",       scopes:["Mail.Read","Files.ReadWrite.All","Calendars.ReadWrite"],           installCount:312, risk:"High",     riskFlags:["Reads all mail","Write access to all files"] },
      { id:"oa-002", name:"DocuSign",           connectedTo:"Salesforce", scopes:["Full access to Salesforce data","API Access"],                     installCount:89,  risk:"Medium",   riskFlags:["Full data access"] },
      { id:"oa-003", name:"GitHub Actions",     connectedTo:"Slack",      scopes:["channels:write","files:write","users:read"],                       installCount:445, risk:"High",     riskFlags:["Post to all channels","Upload files"] },
      { id:"oa-004", name:"Grammarly",          connectedTo:"M365",       scopes:["Mail.Read","Files.Read","User.Read"],                              installCount:234, risk:"Medium",   riskFlags:["Reads all email content"] },
      { id:"oa-005", name:"Loom",               connectedTo:"Slack",      scopes:["channels:read","chat:write","files:write"],                        installCount:178, risk:"Low",      riskFlags:[] },
      { id:"oa-006", name:"Tableau",            connectedTo:"Salesforce", scopes:["query","update","api","chatter_api","full"],                        installCount:56,  risk:"Critical", riskFlags:["Full org access","Modify data","API access"] },
      { id:"oa-007", name:"Workato",            connectedTo:"M365",       scopes:["Mail.ReadWrite","User.ReadWrite.All","Group.ReadWrite.All"],         installCount:67,  risk:"Critical", riskFlags:["Read/write all mail","Manage all users","Manage groups"] },
      { id:"oa-008", name:"Monday.com",         connectedTo:"Slack",      scopes:["channels:read","chat:write.public"],                               installCount:145, risk:"Low",      riskFlags:[] },
      { id:"oa-009", name:"Jira Connect",       connectedTo:"GitHub",     scopes:["repo","admin:org","read:user","delete_repo"],                       installCount:89,  risk:"High",     riskFlags:["Delete repositories","Full org admin"] },
      { id:"oa-010", name:"Salesforce Shield",  connectedTo:"M365",       scopes:["Directory.ReadWrite.All","User.ReadWrite.All"],                     installCount:12,  risk:"Critical", riskFlags:["Modify all directory users","Full directory write"] },
    ]);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── SSPM Anomalies ──────────────────────────────────────────────────────────────
router.get("/cloudops/sspm-anomalies", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    await db.select({ id: saasAppsTable.id }).from(saasAppsTable).where(eq(saasAppsTable.tenantId, tenantId)).limit(1);
    res.json([
      { id:"SA-001", severity:"Critical", type:"New Country Login",      app:"M365",       user:"james@acme.com",  event:"Login from Russia (Moscow) — first time ever. 3 failed MFA attempts before success.",                   detectedAt:"2026-06-18T04:31:00Z", status:"open"          },
      { id:"SA-002", severity:"Critical", type:"Bulk Data Download",     app:"Salesforce", user:"carlos@acme.com", event:"Exported 47,382 contact records in 8 minutes — 14× above user baseline.",                              detectedAt:"2026-06-18T09:12:00Z", status:"open"          },
      { id:"SA-003", severity:"High",     type:"Admin Escalation",       app:"GitHub",     user:"svc-ci-deploy",   event:"Service account granted org-owner privileges by unknown admin — no change ticket found.",              detectedAt:"2026-06-17T22:45:00Z", status:"open"          },
      { id:"SA-004", severity:"High",     type:"Suspicious Token Use",   app:"Slack",      user:"API token",       event:"Slack bot token used from AWS Lambda IP block — token age: 847 days, no rotation policy enforced.",    detectedAt:"2026-06-18T07:22:00Z", status:"open"          },
      { id:"SA-005", severity:"High",     type:"Off-Hours File Access",  app:"M365",       user:"priya@acme.com",  event:"172 files accessed in SharePoint between 01:00–03:00 UTC — user normally active 09:00–18:00.",         detectedAt:"2026-06-17T01:47:00Z", status:"investigating" },
      { id:"SA-006", severity:"Medium",   type:"Password Spray Attack",  app:"Okta",       user:"Multiple",        event:"48 failed login attempts across 12 accounts from a single IP in 4 minutes.",                           detectedAt:"2026-06-18T11:03:00Z", status:"open"          },
      { id:"SA-007", severity:"Medium",   type:"New External Share",     app:"Box",        user:"priya@acme.com",  event:"Folder 'Patient Records 2025' shared externally with no-password public link.",                        detectedAt:"2026-06-16T14:55:00Z", status:"resolved"      },
      { id:"SA-008", severity:"Low",      type:"Unusual Hour Login",     app:"Zoom",       user:"sarah@acme.com",  event:"Meeting recording downloaded at 23:45 local time — user typically active business hours only.",        detectedAt:"2026-06-17T23:45:00Z", status:"resolved"      },
    ]);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { cloudResourcesTable, cloudFindingsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const tid = (req: Parameters<typeof requireAuth>[0]) =>
  Number((req as typeof req & { user: JwtPayload }).user.tenantId);

const REMEDIATION_DB: Record<string, { title: string; steps: string[] }> = {
  "s3-public-acl":        { title: "S3 Bucket Public ACL",                steps: ["Navigate to S3 console > select bucket > Permissions", "Disable 'Block public access' exceptions", "Remove any public ACL grants", "Enable 'Block all public access'"] },
  "security-group-open":  { title: "Overly Permissive Security Group",     steps: ["Identify the source security group", "Remove 0.0.0.0/0 inbound rules", "Replace with specific IP CIDR or security group references", "Test connectivity after applying changes"] },
  "vm-disk-unencrypted":  { title: "VM Disk Encryption Not Enabled",       steps: ["Stop the VM", "Create an encrypted copy of the disk using platform key or CMK", "Detach unencrypted disk and attach encrypted copy", "Verify data integrity, restart VM"] },
  "sql-no-ssl":           { title: "SQL Instance Without SSL Enforcement",  steps: ["Go to Cloud SQL instance settings", "Enable 'Require SSL connections'", "Rotate and download SSL certificates for all clients", "Update client connection strings to use SSL"] },
  "iam-mfa-missing":      { title: "IAM Role Without MFA Requirement",      steps: ["Open IAM console > select the role", "Edit trust policy to add Condition: aws:MultiFactorAuthPresent = true", "Save and test role assumption", "Notify affected principals"] },
  "firestore-open-rules": { title: "Firestore Open Security Rules",         steps: ["Replace permissive rules with authentication-based rules", "Test with Firebase Emulator", "Deploy updated rules via Firebase CLI"] },
};

const driftRecords = [
  { id:"DFT-001", resourceId:"CRS-001", field:"acl",             baseline:"private",         current:"public-read",  detectedAt:"2024-09-10", acknowledged:false },
  { id:"DFT-002", resourceId:"CRS-007", field:"disk-encryption", baseline:"enabled",         current:"disabled",     detectedAt:"2024-09-08", acknowledged:false },
  { id:"DFT-003", resourceId:"CRS-012", field:"iam-binding",     baseline:"project-members", current:"allUsers",     detectedAt:"2024-09-11", acknowledged:false },
  { id:"DFT-004", resourceId:"CRS-009", field:"https-only",      baseline:"true",            current:"false",        detectedAt:"2024-09-05", acknowledged:true  },
];

router.get("/cspm/stats", requireAuth, async (req, res) => {
  try {
    const tenantId = tid(req);
    const [resources, findings] = await Promise.all([
      db.select().from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tenantId)),
      db.select().from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tenantId)),
    ]);
    res.json({
      totalResources:     resources.length,
      compliantResources: resources.filter(r => r.compliancePct >= 95).length,
      byProvider: {
        AWS:   resources.filter(r => r.provider === "AWS").length,
        Azure: resources.filter(r => r.provider === "Azure").length,
        GCP:   resources.filter(r => r.provider === "GCP").length,
      },
      findings: {
        total:    findings.length,
        critical: findings.filter(f => f.severity === "Critical").length,
        high:     findings.filter(f => f.severity === "High").length,
        medium:   findings.filter(f => f.severity === "Medium").length,
        open:     findings.filter(f => f.status === "open").length,
      },
      driftItems:       driftRecords.filter(d => !d.acknowledged).length,
      complianceScore:  resources.length
        ? Math.round(resources.reduce((s, r) => s + r.compliancePct, 0) / resources.length)
        : 0,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/resources", requireAuth, async (req, res) => {
  try {
    const { provider } = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tid(req)));
    if (provider) rows = rows.filter(r => r.provider === provider);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/resources/:id", requireAuth, async (req, res) => {
  try {
    const resourceId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(cloudResourcesTable)
      .where(and(eq(cloudResourcesTable.tenantId, tid(req)), eq(cloudResourcesTable.resourceId, resourceId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Resource not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/findings", requireAuth, async (req, res) => {
  try {
    const { severity, status, provider } = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tid(req)));
    if (severity) rows = rows.filter(f => f.severity === severity);
    if (status)   rows = rows.filter(f => f.status   === status);
    if (provider) rows = rows.filter(f => f.provider === provider);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/findings/:id", requireAuth, async (req, res) => {
  try {
    const findingId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(cloudFindingsTable)
      .where(and(eq(cloudFindingsTable.tenantId, tid(req)), eq(cloudFindingsTable.findingId, findingId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Finding not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/cspm/findings/:id/status", requireAuth, async (req, res) => {
  try {
    const findingId = String(req.params["id"] ?? "");
    const { status } = req.body as { status: string };
    const [row] = await db.update(cloudFindingsTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(cloudFindingsTable.tenantId, tid(req)), eq(cloudFindingsTable.findingId, findingId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Finding not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/cspm/drift", requireAuth, (req, res) => {
  const { resourceId } = req.query as Record<string, string | undefined>;
  res.json(resourceId ? driftRecords.filter(d => d.resourceId === resourceId) : driftRecords);
});

router.post("/cspm/drift/:id/acknowledge", requireAuth, (req, res) => {
  const id = String(req.params["id"] ?? "");
  const d = driftRecords.find(x => x.id === id);
  if (!d) { res.status(404).json({ error: "Drift record not found" }); return; }
  d.acknowledged = true;
  res.json(d);
});

router.get("/cspm/remediation/:type", requireAuth, (req, res) => {
  const guide = REMEDIATION_DB[String(req.params["type"] ?? "")];
  if (!guide) { res.status(404).json({ error: "No remediation guide for this finding type" }); return; }
  res.json(guide);
});

export default router;

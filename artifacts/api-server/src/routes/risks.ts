import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import {
  risksTable,
  riskVendorsTable,
  riskAppetiteTable,
  riskTreatmentsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { eventBus, Events } from "../lib/event-bus";
import type { JwtPayload } from "../lib/auth";

const router = Router();

function riskRow(r: typeof risksTable.$inferSelect) {
  return {
    id: r.id, riskId: r.riskId, severity: r.severity, name: r.name,
    category: r.category, description: r.description,
    score: r.score, owner: r.owner, ownerFull: r.ownerFull,
    trend: r.trend, status: r.status,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

// GET /risks
router.get("/risks", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(risksTable)
      .where(eq(risksTable.tenantId, tenantId))
      .orderBy(desc(risksTable.score));
    res.json(rows.map(riskRow));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /risks
router.post("/risks", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as {
      severity: string; name: string; category: string;
      description?: string; score: number; owner: string; ownerFull: string;
    };
    const [latest] = await db.select({ id: risksTable.id }).from(risksTable)
      .where(eq(risksTable.tenantId, tenantId)).orderBy(desc(risksTable.id)).limit(1);
    const riskId = `RK-${(latest?.id ?? 2000) + 1}`;
    const [risk] = await db.insert(risksTable).values({ tenantId, riskId, ...body }).returning();
    eventBus.publish(Events.RISK_CREATED, { riskId, severity: body.severity, name: body.name }, tenantId, userId);
    res.status(201).json(riskRow(risk!));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /risks/:id
router.get("/risks/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const [risk] = await db.select().from(risksTable)
      .where(and(eq(risksTable.id, id), eq(risksTable.tenantId, tenantId))).limit(1);
    if (!risk) { res.status(404).json({ error: "Risk not found" }); return; }
    res.json(riskRow(risk));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /risks/:id
router.patch("/risks/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      severity: string; name: string; category: string; description: string;
      score: number; owner: string; ownerFull: string; trend: string; status: string;
    }>;
    const [risk] = await db.update(risksTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(risksTable.id, id), eq(risksTable.tenantId, tenantId))).returning();
    if (!risk) { res.status(404).json({ error: "Risk not found" }); return; }
    eventBus.publish(Events.RISK_UPDATED, { riskId: risk.riskId }, tenantId, userId);
    res.json(riskRow(risk));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /risks/:id
router.delete("/risks/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    await db.delete(risksTable).where(and(eq(risksTable.id, id), eq(risksTable.tenantId, tenantId)));
    eventBus.publish(Events.RISK_DELETED, { id }, tenantId, userId);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── TPRM Vendors ──────────────────────────────────────────────────────────────

const DEFAULT_VENDORS = [
  { vendorId: "VND-001", name: "Amazon Web Services",  tier: 1, category: "Cloud Infrastructure",  contact: "aws-tpm@acme.com",        score: 82, status: "approved", lastAssessed: "2025-05-15", nextDue: "2025-11-15", critical: true,  notes: "Primary cloud provider. Annual review required by infosec policy." },
  { vendorId: "VND-002", name: "Microsoft Azure",      tier: 1, category: "Cloud Infrastructure",  contact: "azure-tpm@acme.com",      score: 78, status: "approved", lastAssessed: "2025-04-20", nextDue: "2025-10-20", critical: true,  notes: "Secondary cloud — disaster-recovery environment." },
  { vendorId: "VND-003", name: "Salesforce",           tier: 2, category: "SaaS / CRM",            contact: "it@acme.com",             score: 85, status: "approved", lastAssessed: "2025-03-10", nextDue: "2025-09-10", critical: false, notes: "CRM platform — processes customer PII. SOC 2 Type II on file." },
  { vendorId: "VND-004", name: "Accenture",            tier: 1, category: "IT Services / MSP",     contact: "vendor.mgmt@acme.com",    score: 55, status: "review",   lastAssessed: "2025-01-15", nextDue: "2025-07-15", critical: true,  notes: "MSP with production admin access. DPA update pending — escalated." },
  { vendorId: "VND-005", name: "Okta",                 tier: 2, category: "Identity & Access Mgmt",contact: "it@acme.com",             score: 89, status: "approved", lastAssessed: "2025-05-01", nextDue: "2025-11-01", critical: false, notes: "SSO/MFA provider. Critical auth infrastructure." },
  { vendorId: "VND-006", name: "Splunk",               tier: 2, category: "Security Monitoring",   contact: "sec@acme.com",            score: 76, status: "approved", lastAssessed: "2025-04-01", nextDue: "2025-10-01", critical: false, notes: "SIEM — ingests all security telemetry." },
  { vendorId: "VND-007", name: "ServiceNow",           tier: 2, category: "ITSM / Ticketing",      contact: "it@acme.com",             score: 81, status: "approved", lastAssessed: "2025-02-20", nextDue: "2025-08-20", critical: false, notes: "ITSM platform — GRC workflow integration active." },
  { vendorId: "VND-008", name: "Databricks",           tier: 3, category: "Data / ML Platform",    contact: "data@acme.com",           score: 68, status: "pending",  lastAssessed: "2025-04-10", nextDue: "2025-10-10", critical: false, notes: "Lakehouse — processing sensitive employee and financial data." },
  { vendorId: "VND-009", name: "Palo Alto Networks",   tier: 1, category: "Network Security",      contact: "sec@acme.com",            score: 91, status: "approved", lastAssessed: "2025-05-20", nextDue: "2025-11-20", critical: true,  notes: "Perimeter firewall and SASE. Critical network dependency." },
  { vendorId: "VND-010", name: "CrowdStrike",          tier: 1, category: "Endpoint Security",     contact: "sec@acme.com",            score: 93, status: "approved", lastAssessed: "2025-05-10", nextDue: "2025-11-10", critical: true,  notes: "EDR on all managed endpoints. SOC 2 + FedRAMP." },
  { vendorId: "VND-011", name: "Veeva Systems",        tier: 2, category: "Life Sciences SaaS",    contact: "compliance@acme.com",     score: 79, status: "approved", lastAssessed: "2025-03-25", nextDue: "2025-09-25", critical: false, notes: "Clinical trial data management. GxP compliant." },
  { vendorId: "VND-012", name: "Workday",              tier: 2, category: "HR / Finance SaaS",     contact: "hr@acme.com",             score: 83, status: "approved", lastAssessed: "2025-02-15", nextDue: "2025-08-15", critical: false, notes: "HR and payroll — processes employee PII and financial data." },
] as const;

const DEMO_TENANT_ID = 1;

async function ensureVendorsSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: riskVendorsTable.id })
    .from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, tenantId)).limit(1);
  if (existing) return;
  await db.insert(riskVendorsTable)
    .values(DEFAULT_VENDORS.map(v => ({ tenantId, ...v })))
    .onConflictDoNothing();
}

router.get("/risks/vendors", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureVendorsSeeded(tenantId);
    const rows = await db.select().from(riskVendorsTable)
      .where(eq(riskVendorsTable.tenantId, tenantId))
      .orderBy(riskVendorsTable.tier, riskVendorsTable.name);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/risks/vendors", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as {
      name: string; tier: number; category: string; contact?: string;
      score: number; status: string; nextDue: string; critical?: boolean; notes?: string;
    };
    const all = await db.select({ id: riskVendorsTable.id })
      .from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, tenantId));
    const vendorId = `VND-${String(all.length + 1).padStart(3, "0")}`;
    const [vendor] = await db.insert(riskVendorsTable)
      .values({ tenantId, vendorId, ...body }).returning();
    res.status(201).json(vendor);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/risks/vendors/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      name: string; tier: number; category: string; contact: string;
      score: number; status: string; nextDue: string; lastAssessed: string;
      critical: boolean; notes: string;
    }>;
    const [vendor] = await db.update(riskVendorsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(riskVendorsTable.id, id), eq(riskVendorsTable.tenantId, tenantId)))
      .returning();
    if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
    res.json(vendor);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/risks/vendors/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    await db.delete(riskVendorsTable)
      .where(and(eq(riskVendorsTable.id, id), eq(riskVendorsTable.tenantId, tenantId)));
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Risk Appetite ─────────────────────────────────────────────────────────────

const DEFAULT_APPETITE = [
  { domain: "Cybersecurity",    appetite: "Low",      threshold: 4, current: 5, breached: true  },
  { domain: "Third-Party Risk", appetite: "Medium",   threshold: 6, current: 4, breached: false },
  { domain: "Compliance",       appetite: "Very Low", threshold: 2, current: 3, breached: true  },
  { domain: "Operational",      appetite: "Medium",   threshold: 6, current: 5, breached: false },
  { domain: "Reputational",     appetite: "Very Low", threshold: 2, current: 2, breached: false },
  { domain: "Financial",        appetite: "Medium",   threshold: 5, current: 3, breached: false },
] as const;

async function ensureAppetiteSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: riskAppetiteTable.id })
    .from(riskAppetiteTable).where(eq(riskAppetiteTable.tenantId, tenantId)).limit(1);
  if (existing) return;
  await db.insert(riskAppetiteTable)
    .values(DEFAULT_APPETITE.map(a => ({ tenantId, ...a })))
    .onConflictDoNothing();
}

router.get("/risks/appetite", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureAppetiteSeeded(tenantId);
    const rows = await db.select().from(riskAppetiteTable)
      .where(eq(riskAppetiteTable.tenantId, tenantId));
    res.json(rows.map(r => ({ ...r, breached: r.current > r.threshold })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/risks/appetite/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ appetite: string; threshold: number; current: number }>;
    const [row] = await db.update(riskAppetiteTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(riskAppetiteTable.id, id), eq(riskAppetiteTable.tenantId, tenantId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Appetite record not found" }); return; }
    res.json({ ...row, breached: row.current > row.threshold });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Risk Treatments ───────────────────────────────────────────────────────────

const DEFAULT_TREATMENTS = [
  { treatmentId: "TRT-001", riskId: "RK-2041", name: "AWS S3 Bucket Remediation",              type: "Mitigate", owner: "Alex Kim",     dueDate: "2025-07-31", priority: "Critical", status: "in-progress", notes: "Remove public-read ACL. Enforce bucket policies and enable versioning." },
  { treatmentId: "TRT-002", riskId: "RK-2039", name: "MFA Enforcement — Privileged Accounts",   type: "Mitigate", owner: "Maria Santos", dueDate: "2025-07-15", priority: "High",     status: "in-progress", notes: "Roll out TOTP and hardware security keys to all admin accounts." },
  { treatmentId: "TRT-003", riskId: "RK-2037", name: "Linux Kernel Emergency Patching",         type: "Mitigate", owner: "Ryan Johnson", dueDate: "2025-07-20", priority: "High",     status: "in-progress", notes: "Apply CVE-2024-1234 kernel patch across all production hosts via Ansible." },
  { treatmentId: "TRT-004", riskId: "RK-2035", name: "Accenture DPA Execution",                 type: "Transfer", owner: "Priya Lee",    dueDate: "2025-08-01", priority: "Medium",   status: "open",        notes: "Execute updated DPA including SCCs for EU personal data transfers." },
  { treatmentId: "TRT-005", riskId: "RK-2033", name: "DSAR Response Automation",                type: "Mitigate", owner: "Emma Wilson",  dueDate: "2025-08-15", priority: "Medium",   status: "open",        notes: "Integrate DSAR portal with HR system and data lake for automated discovery." },
  { treatmentId: "TRT-006", riskId: "RK-2031", name: "DMZ Firewall Ruleset Cleanup",            type: "Mitigate", owner: "Ryan Johnson", dueDate: "2025-09-30", priority: "Medium",   status: "open",        notes: "Remove any-any rules; restrict outbound to required ports only." },
  { treatmentId: "TRT-007", riskId: "RK-2029", name: "SSL Certificate Auto-Renewal Pipeline",   type: "Mitigate", owner: "Maria Santos", dueDate: "2025-07-10", priority: "Low",      status: "open",        notes: "Implement cert-manager with Let's Encrypt for all public services." },
  { treatmentId: "TRT-008", riskId: "RK-2027", name: "IoT Device Discovery & CMDB Register",    type: "Accept",   owner: "Alex Kim",     dueDate: "2025-10-31", priority: "Low",      status: "open",        notes: "Deploy NAC solution and register all OT/IoT assets in CMDB with owners." },
] as const;

async function ensureTreatmentsSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: riskTreatmentsTable.id })
    .from(riskTreatmentsTable).where(eq(riskTreatmentsTable.tenantId, tenantId)).limit(1);
  if (existing) return;
  await db.insert(riskTreatmentsTable)
    .values(DEFAULT_TREATMENTS.map(t => ({ tenantId, ...t })))
    .onConflictDoNothing();
}

router.get("/risks/treatments", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureTreatmentsSeeded(tenantId);
    const rows = await db.select().from(riskTreatmentsTable)
      .where(eq(riskTreatmentsTable.tenantId, tenantId))
      .orderBy(riskTreatmentsTable.createdAt);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/risks/treatments", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as {
      riskId: string; name: string; type: string; owner: string;
      dueDate: string; priority: string; status?: string; notes?: string;
    };
    const all = await db.select({ id: riskTreatmentsTable.id })
      .from(riskTreatmentsTable).where(eq(riskTreatmentsTable.tenantId, tenantId));
    const treatmentId = `TRT-${String(all.length + 1).padStart(3, "0")}`;
    const [treatment] = await db.insert(riskTreatmentsTable)
      .values({ tenantId, treatmentId, ...body }).returning();
    res.status(201).json(treatment);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/risks/treatments/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{
      name: string; type: string; owner: string; dueDate: string;
      priority: string; status: string; notes: string;
    }>;
    const [treatment] = await db.update(riskTreatmentsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(riskTreatmentsTable.id, id), eq(riskTreatmentsTable.tenantId, tenantId)))
      .returning();
    if (!treatment) { res.status(404).json({ error: "Treatment not found" }); return; }
    res.json(treatment);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;

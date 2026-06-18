import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  grcPoliciesTable,
  governanceProcessesTable,
  governanceProceduresTable,
  governanceControlsLibraryTable,
  attestationDeptsTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import { governanceService } from "../services/governance";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: Number(u.tenantId) };
};
const userStr = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

// ── Response mappers ─────────────────────────────────────────────────────────

function mapPolicy(row: typeof grcPoliciesTable.$inferSelect) {
  const tags = (row.tags as Record<string, unknown>) ?? {};
  const frameworks = Array.isArray(tags["frameworks"]) ? tags["frameworks"] as string[] : [];
  const rs = row.riskScore ?? 0;
  const impact = rs >= 22 ? "Critical" : rs >= 16 ? "High" : rs >= 10 ? "Medium" : "Low";
  return {
    ...row,
    policyRef:   row.policyId,
    name:        row.title,
    category:    row.type,
    frameworks,
    reviewed:    row.effectiveDate ?? "",
    nextReview:  row.reviewDate    ?? "",
    description: row.content       ?? `${row.title} — governance policy for ${row.type}.`,
    impact,
    aiInsights:  [] as string[],
    applicable:  true,
    aiEnriched:  false,
    scope:       `${row.dept ?? row.type} — All personnel and systems within scope of ${row.title}.`,
  };
}

function mapProcess(row: typeof governanceProcessesTable.$inferSelect) {
  return {
    ...row,
    id:         row.processId,
    kpis:       Array.isArray(row.kpis)       ? row.kpis       : [],
    aiInsights: Array.isArray(row.aiInsights) ? row.aiInsights : [],
  };
}

function mapProcedure(row: typeof governanceProceduresTable.$inferSelect) {
  const rawSteps = Array.isArray(row.steps) ? row.steps : [];
  const steps = rawSteps.map((s: unknown) =>
    typeof s === "string" ? s : (s as Record<string, unknown>)?.["action"] ?? String(s)
  );
  return {
    ...row,
    id:         row.procedureId,
    steps,
    aiInsights: Array.isArray(row.aiInsights) ? row.aiInsights : [],
  };
}

// ── Templates — static service data ──────────────────────────────────────────
router.get("/governance/templates", requireAuth, (req, res) => {
  const { category, framework } = req.query as Record<string, string | undefined>;
  res.json({
    count: governanceService.getTemplateCount(),
    templates: governanceService.getTemplates(category, framework),
  });
});

router.get("/governance/templates/:id", requireAuth, (req, res) => {
  const t = governanceService.getTemplate(String(req.params["id"] ?? ""));
  if (!t) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(t);
});

// ── Policies CRUD — DB-backed ─────────────────────────────────────────────────

router.get("/governance/policies", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId))
      .orderBy(desc(grcPoliciesTable.updatedAt));
    res.json(rows.map(mapPolicy));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof grcPoliciesTable.$inferInsert>;
    if (!body.title || !body.type || !body.owner) {
      res.status(400).json({ error: "title, type and owner are required" }); return;
    }
    const policyId = `POL-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [row] = await db.insert(grcPoliciesTable)
      .values({
        ...body,
        tenantId,
        policyId,
        title:         body.title  as string,
        type:          body.type   as string,
        owner:         body.owner  as string,
        status:        body.status        ?? "draft",
        effectiveDate: body.effectiveDate ?? today,
        reviewDate:    body.reviewDate    ?? nextYear,
      })
      .returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/governance/policies/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    // Support lookup by numeric DB id or policyId string
    const isNumeric = /^\d+$/.test(id);
    const rows = await db.select().from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId));
    const row = isNumeric
      ? rows.find(r => r.id === Number(id))
      : rows.find(r => r.policyId === id);
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(mapPolicy(row));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/governance/policies/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const body = req.body as Partial<typeof grcPoliciesTable.$inferInsert>;
    // Find the row first to get the DB id
    const rows = await db.select({ id: grcPoliciesTable.id }).from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId));
    const isNumeric = /^\d+$/.test(id);
    const dbId = isNumeric
      ? rows.find(r => r.id === Number(id))?.id
      : undefined;
    if (isNumeric && !dbId) { res.status(404).json({ error: "Policy not found" }); return; }
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof grcPoliciesTable.$inferInsert> = {};
    if (b["title"]           !== undefined) patch.title           = b["title"]           as string;
    if (b["type"]            !== undefined) patch.type            = b["type"]            as string;
    if (b["owner"]           !== undefined) patch.owner           = b["owner"]           as string;
    if (b["status"]          !== undefined) patch.status          = b["status"]          as string;
    if (b["effectiveDate"]   !== undefined) patch.effectiveDate   = b["effectiveDate"]   as string;
    if (b["reviewDate"]      !== undefined) patch.reviewDate      = b["reviewDate"]      as string;
    if (b["dept"]            !== undefined) patch.dept            = b["dept"]            as string;
    if (b["riskScore"]       !== undefined) patch.riskScore       = b["riskScore"]       as number;
    if (b["content"]         !== undefined) patch.content         = b["content"]         as string;
    if (b["version"]         !== undefined) patch.version         = b["version"]         as string;
    if (b["tags"]            !== undefined) patch.tags            = b["tags"];
    if (b["attachedControls"]!== undefined) patch.attachedControls= b["attachedControls"];
    const [row] = await db.update(grcPoliciesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/governance/policies/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.delete(grcPoliciesTable).where(whereClause!).returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Policy workflow actions — update status in DB
router.post("/governance/policies/:id/submit-review", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.update(grcPoliciesTable)
      .set({ status: "in-review", updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(409).json({ error: "Policy not found or cannot be submitted" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies/:id/approve", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.update(grcPoliciesTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies/:id/reject", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.update(grcPoliciesTable)
      .set({ status: "draft", updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies/:id/distribute", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.update(grcPoliciesTable)
      .set({ status: "distributed", updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies/:id/archive", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [row] = await db.update(grcPoliciesTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(whereClause!)
      .returning();
    if (!row) { res.status(404).json({ error: "Policy not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Version history — stored in tags JSONB column
router.get("/governance/policies/:id/versions", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const id = String(req.params["id"] ?? "");
    const isNumeric = /^\d+$/.test(id);
    const rows = await db.select({ tags: grcPoliciesTable.tags }).from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId));
    const row = isNumeric
      ? rows.find((_, i, a) => {
          const found = a.find((__, ii) => ii === Number(id) - 1);
          return found === rows[Number(id) - 1];
        })
      : rows[0];
    res.json(((row?.tags as { versions?: unknown[] } | null)?.versions) ?? []);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/policies/:id/versions", requireAuth, async (req, res) => {
  try {
    const { tenantId, email } = user(req);
    const id = String(req.params["id"] ?? "");
    const { summary } = req.body as { summary: string };
    if (!summary) { res.status(400).json({ error: "summary is required" }); return; }
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric
      ? and(eq(grcPoliciesTable.id, Number(id)), eq(grcPoliciesTable.tenantId, tenantId))
      : and(eq(grcPoliciesTable.policyId, id), eq(grcPoliciesTable.tenantId, tenantId));
    const [existing] = await db.select({ version: grcPoliciesTable.version, tags: grcPoliciesTable.tags })
      .from(grcPoliciesTable).where(whereClause!).limit(1);
    if (!existing) { res.status(404).json({ error: "Policy not found" }); return; }
    const versions = (((existing.tags ?? {}) as { versions?: unknown[] }).versions ?? []) as unknown[];
    const newVersion = { version: existing.version, changedBy: email ?? "Unknown", changedAt: new Date().toISOString(), summary, status: "draft" };
    versions.push(newVersion);
    await db.update(grcPoliciesTable)
      .set({ tags: { ...((existing.tags as object) ?? {}), versions }, updatedAt: new Date() })
      .where(whereClause!);
    res.status(201).json(newVersion);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Attestations — DB-backed ──────────────────────────────────────────────────

router.get("/governance/attestations", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(attestationDeptsTable)
      .where(eq(attestationDeptsTable.tenantId, tenantId));
    const departments = rows.map(r => ({
      dept:          r.dept,
      contact:       r.contact,
      totalPolicies: r.totalPolicies,
      acknowledged:  r.acknowledged,
      overdue:       r.overdue,
      lastActivity:  r.lastActivity,
      color:         r.color,
    }));
    const total   = departments.reduce((s, d) => s + d.totalPolicies, 0);
    const ack     = departments.reduce((s, d) => s + d.acknowledged, 0);
    const over    = departments.reduce((s, d) => s + d.overdue, 0);
    const summary = { total, acknowledged: ack, overdue: over, pct: Math.round((ack / Math.max(total, 1)) * 100) };
    res.json({ departments, summary });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/governance/attestations/:dept", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const dept = decodeURIComponent(String(req.params["dept"] ?? ""));
    const { acknowledged } = req.body as { acknowledged: number };
    if (typeof acknowledged !== "number") { res.status(400).json({ error: "acknowledged must be a number" }); return; }
    const [existing] = await db.select().from(attestationDeptsTable)
      .where(and(eq(attestationDeptsTable.tenantId, tenantId), eq(attestationDeptsTable.dept, dept)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Department not found" }); return; }
    const capped = Math.min(acknowledged, existing.totalPolicies);
    const overdue = Math.max(0, existing.totalPolicies - capped);
    const [updated] = await db.update(attestationDeptsTable)
      .set({ acknowledged: capped, overdue, lastActivity: "just now", updatedAt: new Date() })
      .where(and(eq(attestationDeptsTable.tenantId, tenantId), eq(attestationDeptsTable.dept, dept)))
      .returning();
    const allRows = await db.select().from(attestationDeptsTable)
      .where(eq(attestationDeptsTable.tenantId, tenantId));
    const total   = allRows.reduce((s, d) => s + d.totalPolicies, 0);
    const ack     = allRows.reduce((s, d) => s + d.acknowledged, 0);
    const over    = allRows.reduce((s, d) => s + d.overdue, 0);
    const summary = { total, acknowledged: ack, overdue: over, pct: Math.round((ack / Math.max(total, 1)) * 100) };
    res.json({ department: updated, summary });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Controls library — DB-backed ──────────────────────────────────────────────

function mapControl(row: typeof governanceControlsLibraryTable.$inferSelect) {
  return {
    id:            row.controlId,
    ref:           row.ref,
    name:          row.name,
    category:      row.category,
    type:          row.type,
    frameworks:    Array.isArray(row.frameworks) ? row.frameworks as string[] : [],
    policies:      Array.isArray(row.policies)   ? row.policies   as string[] : [],
    status:        row.status,
    effectiveness: row.effectiveness,
    owner:         row.owner,
    lastTested:    row.lastTested ?? undefined,
    nextTest:      row.nextTest   ?? undefined,
    description:   row.description,
    deficiencies:  row.deficiencies ?? undefined,
    createdAt:     row.createdAt.toISOString().slice(0, 10),
    updatedAt:     row.updatedAt.toISOString().slice(0, 10),
  };
}

router.get("/governance/controls", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { category, type, status, framework } = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(governanceControlsLibraryTable)
      .where(eq(governanceControlsLibraryTable.tenantId, tenantId));
    if (category) rows = rows.filter(r => r.category === category);
    if (type)     rows = rows.filter(r => r.type === type);
    if (status)   rows = rows.filter(r => r.status === status);
    if (framework) rows = rows.filter(r =>
      (Array.isArray(r.frameworks) ? r.frameworks as string[] : []).some(f =>
        f.toLowerCase().includes(framework.toLowerCase())
      )
    );
    res.json(rows.map(mapControl));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/governance/controls/stats", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(governanceControlsLibraryTable)
      .where(eq(governanceControlsLibraryTable.tenantId, tenantId));
    const byStatus = {
      implemented:    rows.filter(r => r.status === "implemented").length,
      partial:        rows.filter(r => r.status === "partial").length,
      planned:        rows.filter(r => r.status === "planned").length,
      "not-started":  rows.filter(r => r.status === "not-started").length,
    };
    const avgEffectiveness = rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.effectiveness, 0) / rows.length)
      : 0;
    const categories = [...new Set(rows.map(r => r.category))];
    const byCategory = categories.map(cat => {
      const catRows = rows.filter(r => r.category === cat);
      return {
        category: cat,
        count: catRows.length,
        avgEffectiveness: Math.round(catRows.reduce((s, r) => s + r.effectiveness, 0) / catRows.length),
      };
    });
    res.json({ total: rows.length, byStatus, avgEffectiveness, byCategory });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/controls", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as {
      name?: string; category?: string; type?: string; owner?: string;
      frameworks?: string[]; policies?: string[]; status?: string;
      effectiveness?: number; description?: string; deficiencies?: string;
      lastTested?: string; nextTest?: string;
    };
    if (!body.name || !body.category || !body.type || !body.owner) {
      res.status(400).json({ error: "name, category, type and owner are required" }); return;
    }
    const existing = await db.select({ controlId: governanceControlsLibraryTable.controlId })
      .from(governanceControlsLibraryTable)
      .where(eq(governanceControlsLibraryTable.tenantId, tenantId));
    const maxNum = existing.reduce((max, r) => {
      const n = parseInt(r.controlId.replace(/^CTL-/, ""), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const controlId = `CTL-${String(maxNum + 1).padStart(3, "0")}`;
    const [row] = await db.insert(governanceControlsLibraryTable).values({
      tenantId,
      controlId,
      ref:           controlId,
      name:          body.name,
      category:      body.category,
      type:          body.type,
      owner:         body.owner,
      frameworks:    body.frameworks    ?? [],
      policies:      body.policies      ?? [],
      status:        body.status        ?? "planned",
      effectiveness: body.effectiveness ?? 0,
      description:   body.description   ?? "",
      deficiencies:  body.deficiencies,
      lastTested:    body.lastTested,
      nextTest:      body.nextTest,
    }).returning();
    res.status(201).json(mapControl(row!));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/governance/controls/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const controlId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(governanceControlsLibraryTable)
      .where(and(
        eq(governanceControlsLibraryTable.tenantId, tenantId),
        eq(governanceControlsLibraryTable.controlId, controlId),
      )).limit(1);
    if (!row) { res.status(404).json({ error: "Control not found" }); return; }
    res.json(mapControl(row));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/governance/controls/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const controlId = String(req.params["id"] ?? "");
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof governanceControlsLibraryTable.$inferInsert> = {};
    if (b["name"]          !== undefined) patch.name          = b["name"]          as string;
    if (b["category"]      !== undefined) patch.category      = b["category"]      as string;
    if (b["type"]          !== undefined) patch.type          = b["type"]          as string;
    if (b["owner"]         !== undefined) patch.owner         = b["owner"]         as string;
    if (b["status"]        !== undefined) patch.status        = b["status"]        as string;
    if (b["effectiveness"] !== undefined) patch.effectiveness = b["effectiveness"] as number;
    if (b["description"]   !== undefined) patch.description   = b["description"]   as string;
    if (b["deficiencies"]  !== undefined) patch.deficiencies  = b["deficiencies"]  as string;
    if (b["lastTested"]    !== undefined) patch.lastTested    = b["lastTested"]    as string;
    if (b["nextTest"]      !== undefined) patch.nextTest      = b["nextTest"]      as string;
    if (b["frameworks"]    !== undefined) patch.frameworks    = b["frameworks"];
    if (b["policies"]      !== undefined) patch.policies      = b["policies"];
    const [row] = await db.update(governanceControlsLibraryTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(
        eq(governanceControlsLibraryTable.tenantId, tenantId),
        eq(governanceControlsLibraryTable.controlId, controlId),
      )).returning();
    if (!row) { res.status(404).json({ error: "Control not found" }); return; }
    res.json(mapControl(row));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/governance/controls/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const controlId = String(req.params["id"] ?? "");
    const [row] = await db.delete(governanceControlsLibraryTable)
      .where(and(
        eq(governanceControlsLibraryTable.tenantId, tenantId),
        eq(governanceControlsLibraryTable.controlId, controlId),
      )).returning();
    if (!row) { res.status(404).json({ error: "Control not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Processes — DB-backed ─────────────────────────────────────────────────────

router.get("/governance/processes", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { category, status } = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(governanceProcessesTable)
      .where(eq(governanceProcessesTable.tenantId, tenantId));
    if (category && category !== "All") rows = rows.filter(p => p.category === category);
    if (status) rows = rows.filter(p => p.status === status);
    res.json(rows.map(mapProcess));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/processes", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof governanceProcessesTable.$inferInsert>;
    if (!body.name || !body.category || !body.owner) {
      res.status(400).json({ error: "name, category and owner are required" }); return;
    }
    const processId = `PRC-${Date.now()}`;
    const [row] = await db.insert(governanceProcessesTable)
      .values({ ...body, tenantId, processId, name: body.name as string, owner: body.owner as string, category: body.category as string, status: body.status ?? "active" })
      .returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/governance/processes/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const processId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(governanceProcessesTable)
      .where(and(eq(governanceProcessesTable.tenantId, tenantId), eq(governanceProcessesTable.processId, processId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Process not found" }); return; }
    res.json(mapProcess(row));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/governance/processes/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const processId = String(req.params["id"] ?? "");
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof governanceProcessesTable.$inferInsert> = {};
    if (b["name"]        !== undefined) patch.name        = b["name"]        as string;
    if (b["category"]    !== undefined) patch.category    = b["category"]    as string;
    if (b["owner"]       !== undefined) patch.owner       = b["owner"]       as string;
    if (b["status"]      !== undefined) patch.status      = b["status"]      as string;
    if (b["description"] !== undefined) patch.description = b["description"] as string;
    if (b["steps"]       !== undefined) patch.steps       = b["steps"]       as number;
    if (b["linked"]      !== undefined) patch.linked      = b["linked"]      as string;
    if (b["maturity"]    !== undefined) patch.maturity    = b["maturity"]    as string;
    if (b["riskScore"]   !== undefined) patch.riskScore   = b["riskScore"]   as number;
    if (b["impact"]      !== undefined) patch.impact      = b["impact"]      as string;
    if (b["kpis"]        !== undefined) patch.kpis        = b["kpis"];
    if (b["aiInsights"]  !== undefined) patch.aiInsights  = b["aiInsights"];
    const [row] = await db.update(governanceProcessesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(governanceProcessesTable.tenantId, tenantId), eq(governanceProcessesTable.processId, processId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Process not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/governance/processes/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const processId = String(req.params["id"] ?? "");
    const [row] = await db.delete(governanceProcessesTable)
      .where(and(eq(governanceProcessesTable.tenantId, tenantId), eq(governanceProcessesTable.processId, processId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Process not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Procedures — DB-backed ────────────────────────────────────────────────────

router.get("/governance/procedures", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { processId, status } = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(governanceProceduresTable)
      .where(eq(governanceProceduresTable.tenantId, tenantId));
    if (processId) rows = rows.filter(p => p.process === processId);
    if (status)    rows = rows.filter(p => p.status === status);
    res.json(rows.map(mapProcedure));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/governance/procedures", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as Partial<typeof governanceProceduresTable.$inferInsert>;
    if (!body.name || !body.owner) {
      res.status(400).json({ error: "name and owner are required" }); return;
    }
    const procedureId = `SOP-${Date.now()}`;
    const [row] = await db.insert(governanceProceduresTable)
      .values({ ...body, tenantId, procedureId, name: body.name as string, owner: body.owner as string, status: body.status ?? "active" })
      .returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/governance/procedures/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const procedureId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(governanceProceduresTable)
      .where(and(eq(governanceProceduresTable.tenantId, tenantId), eq(governanceProceduresTable.procedureId, procedureId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Procedure not found" }); return; }
    res.json(mapProcedure(row));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/governance/procedures/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const procedureId = String(req.params["id"] ?? "");
    const b = req.body as Record<string, unknown>;
    const patch: Partial<typeof governanceProceduresTable.$inferInsert> = {};
    if (b["name"]        !== undefined) patch.name        = b["name"]        as string;
    if (b["process"]     !== undefined) patch.process     = b["process"]     as string;
    if (b["owner"]       !== undefined) patch.owner       = b["owner"]       as string;
    if (b["version"]     !== undefined) patch.version     = b["version"]     as string;
    if (b["status"]      !== undefined) patch.status      = b["status"]      as string;
    if (b["pages"]       !== undefined) patch.pages       = b["pages"]       as number;
    if (b["riskScore"]   !== undefined) patch.riskScore   = b["riskScore"]   as number;
    if (b["lastTested"]  !== undefined) patch.lastTested  = b["lastTested"]  as string;
    if (b["description"] !== undefined) patch.description = b["description"] as string;
    if (b["impact"]      !== undefined) patch.impact      = b["impact"]      as string;
    if (b["steps"]       !== undefined) patch.steps       = b["steps"];
    if (b["aiInsights"]  !== undefined) patch.aiInsights  = b["aiInsights"];
    const [row] = await db.update(governanceProceduresTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(governanceProceduresTable.tenantId, tenantId), eq(governanceProceduresTable.procedureId, procedureId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Procedure not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/governance/procedures/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const procedureId = String(req.params["id"] ?? "");
    const [row] = await db.delete(governanceProceduresTable)
      .where(and(eq(governanceProceduresTable.tenantId, tenantId), eq(governanceProceduresTable.procedureId, procedureId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Procedure not found" }); return; }
    res.status(204).send();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── AI Enrichment ─────────────────────────────────────────────────────────────
router.post("/governance/enrich", requireAuth, async (req, res) => {
  const { type = "policy", name = "", category = "" } = req.body as { type?: string; name?: string; category?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const OPENAI_BASE = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
  const OPENAI_KEY  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

  if (OPENAI_KEY) {
    try {
      const systemContent = `You are a senior GRC (Governance, Risk & Compliance) expert at a Fortune 500 company. Generate professional, accurate enrichment content for enterprise GRC records. Return ONLY valid JSON with no markdown or code fences.`;
      const userContent = `Enrich this GRC ${type}:\nName: "${name}"\nCategory: "${category}"\n\nReturn JSON with exactly these fields:\n{"description":"2-3 sentence professional description of purpose and scope","frameworks":["framework1","framework2","framework3"],"insights":["actionable insight 1","actionable insight 2","actionable insight 3"],"kpis":["KPI metric 1","KPI metric 2","KPI metric 3"]}`;
      const resp = await (fetch as typeof globalThis.fetch)(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemContent }, { role: "user", content: userContent }], response_format: { type: "json_object" }, max_tokens: 700, temperature: 0.7 }),
      });
      if (resp.ok) {
        const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (content) { res.json(JSON.parse(content)); return; }
      }
    } catch (_) {}
  }

  const fwMap: Record<string, string[]> = {
    Security: ["ISO 27001","SOC 2 Type II","NIST CSF","CIS Controls 18"],
    IAM: ["ISO 27001 A.9","SOC 2 CC6.1","NIST SP 800-53 AC","CIS Control 5"],
    Privacy: ["GDPR Art.5","ISO 27701","CCPA","NIST Privacy Framework"],
    Cloud: ["ISO 27017","CSA CCM v4","CIS Cloud Benchmarks","SOC 2"],
    Risk: ["ISO 31000","NIST RMF","COSO ERM","ISO 27005"],
    Data: ["ISO 27001 A.8","SOC 2 CC6.7","GDPR Art.5","NIST SP 800-53 SC"],
    BCP: ["ISO 22301","ISO 27001 A.17","NIST SP 800-34","BS 65000"],
    Compliance: ["ISO 27001","SOC 2","PCI DSS v4","HIPAA Security Rule"],
    AppSec: ["OWASP SAMM","ISO 27001 A.14","NIST SP 800-53 SA","CWE Top 25"],
    ITSM: ["ITIL 4","ISO 20000","ISO 27001 A.12","SOC 2 CC8.1"],
    Cybersecurity: ["NIST CSF","ISO 27001","SOC 2","CIS Controls 18"],
    Governance: ["ISO 38500","COBIT 2019","ISO 27001","SOC 2"],
    HR: ["ISO 27001 A.7","SOC 2 CC1.4","NIST AT-2","ILO Standards"],
    Physical: ["ISO 27001 A.11","SOC 2 CC6.4","NIST PE-2","PCI DSS 9"],
  };
  const fw = fwMap[category] ?? fwMap["Security"]!;
  res.json({
    description: `${name} establishes the governance framework for ${category.toLowerCase()} management across the organisation. This ${type} defines roles, responsibilities, and controls ensuring compliance with applicable regulations and internal standards. All relevant personnel and systems within scope are required to adhere to this ${type}.`,
    frameworks: fw,
    insights: [
      `${name} aligns with ${fw[0]} and should be reviewed annually or after significant organisational changes.`,
      `Current ${type} coverage should be validated against the latest ${fw[1]} criteria to close any compliance gaps.`,
      `AI-assisted monitoring and automated evidence collection can improve ${type} compliance tracking by up to 40%.`,
    ],
    kpis: [
      `Compliance rate: >95% across all in-scope units`,
      `Annual review completion: 100% on schedule`,
      `Policy exceptions logged and approved: <5% of scope`,
    ],
  });
});

export default router;

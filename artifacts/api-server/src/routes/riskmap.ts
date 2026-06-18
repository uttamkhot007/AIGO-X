import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { risksTable, riskAppetiteTable, riskCascadesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { riskService } from "../services/risk";
import type { JwtPayload } from "../lib/auth";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: Number(u.tenantId) };
};

// GET /risks/heatmap — returns 5×5 heat map with risk IDs per cell
router.get("/risks/heatmap", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select({ id: risksTable.riskId }).from(risksTable).where(eq(risksTable.tenantId, tenantId));
    res.json(riskService.buildHeatMap(rows.map(r => ({ id: r.id }))));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /risks/:riskId/montecarlo
router.get("/risks/:riskId/montecarlo", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const riskId = String(req.params["riskId"] ?? "");
    const [row] = await db.select({ score: risksTable.score, riskId: risksTable.riskId })
      .from(risksTable)
      .where(and(eq(risksTable.riskId, riskId), eq(risksTable.tenantId, tenantId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: `Risk ${riskId} not found` }); return; }
    res.json(riskService.runMonteCarlo(row.score, row.riskId));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Risk appetite — DB-backed ─────────────────────────────────────────────────

router.get("/risks/appetite", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(riskAppetiteTable).where(eq(riskAppetiteTable.tenantId, tenantId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/risks/appetite/:domain", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const domain = decodeURIComponent(String(req.params["domain"] ?? ""));
    const body = req.body as { threshold?: number; current?: number; appetite?: string };
    const [existing] = await db.select().from(riskAppetiteTable)
      .where(and(eq(riskAppetiteTable.tenantId, tenantId), eq(riskAppetiteTable.domain, domain)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Risk domain not found" }); return; }
    const threshold = typeof body.threshold === "number" ? body.threshold : existing.threshold;
    const current   = typeof body.current   === "number" ? body.current   : existing.current;
    const updates: Record<string, unknown> = { updatedAt: new Date(), breached: current > threshold };
    if (typeof body.threshold === "number") updates.threshold = body.threshold;
    if (typeof body.current   === "number") updates.current   = body.current;
    if (body.appetite)                      updates.appetite  = body.appetite;
    const [row] = await db.update(riskAppetiteTable).set(updates)
      .where(and(eq(riskAppetiteTable.tenantId, tenantId), eq(riskAppetiteTable.domain, domain)))
      .returning();
    res.json(row);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Risk cascades — DB-backed ─────────────────────────────────────────────────

router.get("/risks/cascades", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(riskCascadesTable).where(eq(riskCascadesTable.tenantId, tenantId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/risks/cascades", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const body = req.body as { parentId: string; childId: string; relationship: string; description?: string };
    if (!body.parentId || !body.childId || !body.relationship) {
      res.status(400).json({ error: "parentId, childId and relationship are required" }); return;
    }
    const [row] = await db.insert(riskCascadesTable)
      .values({ tenantId, parentId: body.parentId, childId: body.childId, relationship: body.relationship, description: body.description ?? "" })
      .returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/risks/cascades", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { parentId, childId } = req.body as { parentId: string; childId: string };
    if (!parentId || !childId) { res.status(400).json({ error: "parentId and childId are required" }); return; }
    await db.delete(riskCascadesTable)
      .where(and(eq(riskCascadesTable.tenantId, tenantId), eq(riskCascadesTable.parentId, parentId), eq(riskCascadesTable.childId, childId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

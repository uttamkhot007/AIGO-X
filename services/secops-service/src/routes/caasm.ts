import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { grcAssetsTable, assetRelationshipsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const tid = (req: Parameters<typeof requireAuth>[0]) =>
  Number((req as typeof req & { user: JwtPayload }).user.tenantId);

router.get("/caasm/stats", requireAuth, async (req, res) => {
  try {
    const assets = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tid(req)));
    const byCategory: Record<string, number> = {};
    const byRisk: Record<string, number> = {};
    assets.forEach(a => {
      byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
      byRisk[a.risk]         = (byRisk[a.risk] ?? 0) + 1;
    });
    res.json({
      total:       assets.length,
      managed:     assets.filter(a => a.managed).length,
      unmanaged:   assets.filter(a => !a.managed).length,
      byCategory, byRisk,
      avgExposure: assets.length ? Math.round(assets.reduce((s, a) => s + a.exposureScore, 0) / assets.length) : 0,
      totalVulns:  assets.reduce((s, a) => s + a.vulnCount, 0),
      critVulns:   assets.reduce((s, a) => s + a.critVulns, 0),
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/assets", requireAuth, async (req, res) => {
  try {
    const { page, pageSize, search, category } = req.query as Record<string, string | undefined>;
    let assets = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tid(req)));
    if (category && category !== "All") assets = assets.filter(a => a.category === category);
    if (search) {
      const s = search.toLowerCase();
      assets = assets.filter(a =>
        a.hostname.toLowerCase().includes(s) ||
        a.ip.toLowerCase().includes(s) ||
        a.dept.toLowerCase().includes(s) ||
        (a.os ?? "").toLowerCase().includes(s)
      );
    }
    if (page !== undefined) {
      const ps   = Math.min(Math.max(1, parseInt(pageSize ?? "100", 10) || 100), 500);
      const p    = Math.max(1, parseInt(page, 10) || 1);
      const total = assets.length;
      const pages = Math.ceil(total / ps) || 1;
      const pg    = Math.min(p, pages);
      res.json({ items: assets.slice((pg - 1) * ps, pg * ps), total, page: pg, pageSize: ps, pages });
    } else {
      res.json(assets);
    }
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/assets/:id", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(grcAssetsTable)
      .where(and(eq(grcAssetsTable.tenantId, tid(req)), eq(grcAssetsTable.assetId, assetId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/caasm/assets", requireAuth, async (req, res) => {
  try {
    const body = req.body as Partial<typeof grcAssetsTable.$inferInsert>;
    const tenantId = tid(req);
    const [row] = await db.insert(grcAssetsTable).values({
      tenantId,
      assetId:   body.assetId   ?? `AST-${Date.now()}`,
      hostname:  body.hostname  ?? "",
      category:  body.category  ?? "Server",
      ip:        body.ip        ?? "",
      os:        body.os        ?? "",
      risk:      body.risk      ?? "Low",
      managed:   body.managed   ?? true,
      dept:      body.dept      ?? "",
      lastSeen:  body.lastSeen  ?? new Date().toISOString().slice(0, 10),
      exposureScore: body.exposureScore ?? 0,
      vulnCount: body.vulnCount ?? 0,
      critVulns: body.critVulns ?? 0,
    }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/caasm/assets/:id", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params["id"] ?? "");
    const body = req.body as Partial<typeof grcAssetsTable.$inferInsert>;
    const [row] = await db.update(grcAssetsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(grcAssetsTable.tenantId, tid(req)), eq(grcAssetsTable.assetId, assetId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Asset not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/caasm/assets/:id", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params["id"] ?? "");
    const result = await db.delete(grcAssetsTable)
      .where(and(eq(grcAssetsTable.tenantId, tid(req)), eq(grcAssetsTable.assetId, assetId)))
      .returning({ id: grcAssetsTable.id });
    if (!result.length) { res.status(404).json({ error: "Asset not found" }); return; }
    res.status(204).end();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/caasm/filter", requireAuth, async (req, res) => {
  try {
    const { logic = "AND", conditions = [] } = req.body as { logic: "AND"|"OR"; conditions: Array<{ field: string; op: string; value: unknown }> };
    const assets = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tid(req)));
    type Row = typeof assets[0];
    const match = (a: Row, c: typeof conditions[0]): boolean => {
      const val = String((a as unknown as Record<string, unknown>)[c.field] ?? "").toLowerCase();
      const v   = String(c.value).toLowerCase();
      switch (c.op) {
        case "eq":       return val === v;
        case "neq":      return val !== v;
        case "contains": return val.includes(v);
        case "gt":       return Number(val) > Number(v);
        case "lt":       return Number(val) < Number(v);
        case "in":       return (c.value as string[]).map(x => x.toLowerCase()).includes(val);
        default:         return true;
      }
    };
    const filtered = conditions.length
      ? assets.filter(a => logic === "AND" ? conditions.every(c => match(a, c)) : conditions.some(c => match(a, c)))
      : assets;
    res.json(filtered);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/relationships", requireAuth, async (req, res) => {
  try {
    const { assetId } = req.query as Record<string, string | undefined>;
    const tenantId = tid(req);
    let rows = await db.select().from(assetRelationshipsTable).where(eq(assetRelationshipsTable.tenantId, tenantId));
    if (assetId) rows = rows.filter(r => r.sourceId === assetId || r.targetId === assetId);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/caasm/relationships", requireAuth, async (req, res) => {
  try {
    const body = req.body as Partial<typeof assetRelationshipsTable.$inferInsert>;
    const tenantId = tid(req);
    const [row] = await db.insert(assetRelationshipsTable).values({
      tenantId,
      relationId:   body.relationId   ?? `REL-${Date.now()}`,
      sourceId:     body.sourceId     ?? "",
      targetId:     body.targetId     ?? "",
      type:         body.type         ?? "dependency",
      label:        body.label        ?? "",
      strength:     body.strength     ?? 1,
      discoveredBy: body.discoveredBy ?? "Manual",
    }).returning();
    res.status(201).json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/caasm/relationships/:id", requireAuth, async (req, res) => {
  try {
    const relationId = String(req.params["id"] ?? "");
    const result = await db.delete(assetRelationshipsTable)
      .where(and(eq(assetRelationshipsTable.tenantId, tid(req)), eq(assetRelationshipsTable.relationId, relationId)))
      .returning({ id: assetRelationshipsTable.id });
    if (!result.length) { res.status(404).json({ error: "Relationship not found" }); return; }
    res.status(204).end();
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/assets/:id/timeline", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params["id"] ?? "");
    const [row] = await db.select({ timeline: grcAssetsTable.timeline })
      .from(grcAssetsTable)
      .where(and(eq(grcAssetsTable.tenantId, tid(req)), eq(grcAssetsTable.assetId, assetId)))
      .limit(1);
    res.json(Array.isArray(row?.timeline) ? row.timeline : []);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/caasm/exposure-paths", requireAuth, async (req, res) => {
  try {
    const tenantId = tid(req);
    const [assets, rels] = await Promise.all([
      db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tenantId)),
      db.select().from(assetRelationshipsTable).where(eq(assetRelationshipsTable.tenantId, tenantId)),
    ]);
    const critIds = new Set(assets.filter(a => a.risk === "Critical").map(a => a.assetId));
    res.json(
      rels
        .filter(r => critIds.has(r.sourceId) || critIds.has(r.targetId))
        .map(r => ({
          ...r,
          sourceAsset:  assets.find(a => a.assetId === r.sourceId),
          targetAsset:  assets.find(a => a.assetId === r.targetId),
          exposureRisk: critIds.has(r.sourceId) && critIds.has(r.targetId) ? "Critical" : "High",
        }))
    );
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;

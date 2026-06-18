import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { risksTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import { eventBus, Events } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

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
    const rows = await db.select().from(risksTable).where(eq(risksTable.tenantId, tenantId)).orderBy(risksTable.score);
    res.json(rows.map(riskRow).reverse());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /risks
router.post("/risks", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { severity: string; name: string; category: string; description?: string; score: number; owner: string; ownerFull: string };
    const [existing] = await db.select({ id: risksTable.id }).from(risksTable).where(eq(risksTable.tenantId, tenantId)).orderBy(risksTable.id).limit(1);
    const nextNum = (existing?.id ?? 2000) + 1;
    const riskId = `RK-${nextNum}`;
    const [risk] = await db.insert(risksTable).values({ tenantId, riskId, ...body }).returning();
    eventBus.publish(Events.RISK_CREATED, { riskId }, tenantId, userId);
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
    const [risk] = await db.select().from(risksTable).where(and(eq(risksTable.id, id), eq(risksTable.tenantId, tenantId))).limit(1);
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
    const body = req.body as Partial<{ severity: string; name: string; category: string; description: string; score: number; owner: string; ownerFull: string; trend: string; status: string }>;
    const [risk] = await db.update(risksTable).set({ ...body, updatedAt: new Date() }).where(and(eq(risksTable.id, id), eq(risksTable.tenantId, tenantId))).returning();
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

export default router;

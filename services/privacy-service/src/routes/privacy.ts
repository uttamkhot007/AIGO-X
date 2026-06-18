import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { dsarsTable, dpiasTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import { eventBus, Events } from "@workspace/service-kit";

const router = Router();

// GET /privacy/dsars
router.get("/privacy/dsars", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId));
    res.json(rows.map(d => ({ ...d })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /privacy/dsars
router.post("/privacy/dsars", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { type: string; subject: string; due: string };
    const [existing] = await db.select({ id: dsarsTable.id }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)).orderBy(dsarsTable.id).limit(1);
    const nextNum = (existing?.id ?? 310) + 1;
    const dsarId = `DSR-0${nextNum}`;
    const received = new Date().toISOString().slice(0, 10);
    const [dsar] = await db.insert(dsarsTable).values({ tenantId, dsarId, received, ...body }).returning();
    eventBus.publish(Events.DSAR_CREATED, { dsarId }, tenantId, userId);
    res.status(201).json(dsar!);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /privacy/dsars/:id
router.patch("/privacy/dsars/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ status: string; daysLeft: number }>;
    const [dsar] = await db.update(dsarsTable).set(body).where(and(eq(dsarsTable.id, id), eq(dsarsTable.tenantId, tenantId))).returning();
    if (!dsar) { res.status(404).json({ error: "DSAR not found" }); return; }
    if (body.status === "completed") eventBus.publish(Events.DSAR_RESOLVED, { id }, tenantId, userId);
    res.json(dsar);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /privacy/dpias
router.get("/privacy/dpias", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId));
    res.json(rows.map(d => ({ ...d })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /privacy/dpias
router.post("/privacy/dpias", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { name: string; risk: string; owner: string };
    const [existing] = await db.select({ id: dpiasTable.id }).from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId)).orderBy(dpiasTable.id).limit(1);
    const nextNum = (existing?.id ?? 9) + 1;
    const dpiaId = `DPIA-0${nextNum.toString().padStart(2, "0")}`;
    const updated = new Date().toISOString().slice(0, 10);
    const [dpia] = await db.insert(dpiasTable).values({ tenantId, dpiaId, updated, ...body }).returning();
    res.status(201).json(dpia!);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

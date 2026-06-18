import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { ticketsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import { eventBus, Events } from "@workspace/service-kit";

const router = Router();

function ticketRow(t: typeof ticketsTable.$inferSelect) {
  return { id: t.id, ticketId: t.ticketId, priority: t.priority, title: t.title, category: t.category, assignee: t.assignee, status: t.status, sla: t.sla, createdAt: t.createdAt.toISOString() };
}

// GET /tickets
router.get("/tickets", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId)).orderBy(ticketsTable.createdAt);
    res.json(rows.map(ticketRow).reverse());
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tickets
router.post("/tickets", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { priority: string; title: string; category: string; assignee: string; sla: string };
    const [existing] = await db.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId)).orderBy(ticketsTable.id).limit(1);
    const nextNum = (existing?.id ?? 7840) + 1;
    const ticketId = `SD-${nextNum}`;
    const [ticket] = await db.insert(ticketsTable).values({ tenantId, ticketId, ...body }).returning();
    eventBus.publish(Events.TICKET_CREATED, { ticketId }, tenantId, userId);
    res.status(201).json(ticketRow(ticket!));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tickets/:id
router.get("/tickets/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const [ticket] = await db.select().from(ticketsTable).where(and(eq(ticketsTable.id, id), eq(ticketsTable.tenantId, tenantId))).limit(1);
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(ticketRow(ticket));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /tickets/:id
router.patch("/tickets/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ priority: string; title: string; status: string; assignee: string }>;
    const [ticket] = await db.update(ticketsTable).set(body).where(and(eq(ticketsTable.id, id), eq(ticketsTable.tenantId, tenantId))).returning();
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    if (body.status === "resolved") eventBus.publish(Events.TICKET_RESOLVED, { ticketId: ticket.ticketId }, tenantId, userId);
    res.json(ticketRow(ticket));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { tenantsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "@workspace/service-kit";
import { sql } from "drizzle-orm";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

const isSuperAdmin = requireRole("super_admin");
function u(req: Parameters<typeof requireAuth>[0]) {
  return (req as typeof req & { user: JwtPayload }).user;
}

// GET /tenants — super_admin only: list all tenants
router.get("/tenants", requireAuth, isSuperAdmin, async (_req, res) => {
  try {
    const tenants = await db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
      domain: tenantsTable.domain,
      plan: tenantsTable.plan,
      status: tenantsTable.status,
      seats: tenantsTable.seats,
      licenseExpiry: tenantsTable.licenseExpiry,
      createdAt: tenantsTable.createdAt,
      userCount: sql<number>`(SELECT COUNT(*) FROM users WHERE tenant_id = ${tenantsTable.id})`,
    }).from(tenantsTable).orderBy(tenantsTable.id);
    res.json(tenants.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tenants — super_admin only: create a new tenant
router.post("/tenants", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const { name, slug, domain, plan } = req.body as { name: string; slug: string; domain?: string; plan: string };
    const [tenant] = await db.insert(tenantsTable).values({ name, slug, domain, plan }).returning();
    res.status(201).json({ ...tenant!, createdAt: tenant!.createdAt.toISOString(), userCount: 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    res.status(msg.includes("unique") ? 409 : 500).json({ error: msg.includes("unique") ? "Slug already exists" : "Internal server error" });
  }
});

// GET /tenants/:id — any authenticated user (read their own tenant); super_admin can read any
router.get("/tenants/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const actor = u(req);
    if (actor.role !== "super_admin" && actor.tenantId !== id) {
      res.status(403).json({ error: "Forbidden — you can only view your own tenant" });
      return;
    }
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({ ...tenant, createdAt: tenant.createdAt.toISOString(), userCount: null });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /tenants/:id — super_admin only
router.patch("/tenants/:id", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const { name, domain, plan, status, seats, licenseExpiry } = req.body as {
      name?: string; domain?: string; plan?: string;
      status?: string; seats?: number; licenseExpiry?: string;
    };
    const updates: Partial<typeof tenantsTable.$inferInsert> = {};
    if (name) updates.name = name;
    if (domain !== undefined) updates.domain = domain;
    if (plan) updates.plan = plan;
    if (status) updates.status = status;
    if (seats !== undefined) updates.seats = Number(seats);
    if (licenseExpiry !== undefined) updates.licenseExpiry = licenseExpiry || null;
    const [tenant] = await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, id)).returning();
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({ ...tenant, createdAt: tenant.createdAt.toISOString(), userCount: null });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tenants/:id — super_admin only
router.delete("/tenants/:id", requireAuth, isSuperAdmin, async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const userCount = await db.select({ count: sql<number>`COUNT(*)` }).from(usersTable).where(eq(usersTable.tenantId, id));
    if (Number(userCount[0]?.count ?? 0) > 0) {
      res.status(409).json({ error: "Cannot delete tenant with active users. Remove all users first." });
      return;
    }
    const [deleted] = await db.delete(tenantsTable).where(eq(tenantsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({ success: true, id });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

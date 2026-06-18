import { Router } from "express";
import { db } from "@workspace/db";
import {
  tenantModuleLicensesTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const router = Router();

const PLAN_SEATS: Record<string, number> = {
  starter: 10,
  pro: 25,
  enterprise: 50,
};

const PLAN_MODULES: Record<string, Record<string, boolean>> = {
  enterprise: {
    // Page-level (mirrors sidebar navigation)
    govops: true, riskops: true, complyops: true,
    secops: true, cloudops: true, privacyops: true, dataops: true,
    assetops: true, serviceops: true, peopleops: true,
    analyticsops: true, aivciso: true,
    // Sub-feature keys (fine-grained gating within pages)
    cspm: true, sspm: true, ciem: true, cnspm: true, asm: true,
    threatintel: true, cwpp: true, scpm: true, aispm: true,
    dpia: true, dspm: true, dlp: true, datalineage: true, encryption: true, residency: true,
  },
  pro: {
    govops: true, riskops: true, complyops: true,
    secops: true, cloudops: true, privacyops: true, dataops: true,
    assetops: true, serviceops: true, peopleops: true,
    analyticsops: false, aivciso: false,
    cspm: true, sspm: true, ciem: true, cnspm: false, asm: false,
    threatintel: false, cwpp: true, scpm: false, aispm: false,
    dpia: true, dspm: true, dlp: true, datalineage: false, encryption: false, residency: false,
  },
  starter: {
    govops: true, riskops: true, complyops: true,
    secops: false, cloudops: false, privacyops: false, dataops: false,
    assetops: false, serviceops: true, peopleops: false,
    analyticsops: false, aivciso: false,
    cspm: false, sspm: false, ciem: false, cnspm: false, asm: false,
    threatintel: false, cwpp: false, scpm: false, aispm: false,
    dpia: false, dspm: false, dlp: false, datalineage: false, encryption: false, residency: false,
  },
};

function isAdmin(req: any): boolean {
  const { role } = (req as any).user as JwtPayload;
  return role === "super_admin" || role === "tenant_admin";
}

// Ensure a license row exists for a tenant, seeding from its plan
async function ensureLicense(tenantId: number, plan?: string) {
  const [existing] = await db
    .select()
    .from(tenantModuleLicensesTable)
    .where(eq(tenantModuleLicensesTable.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const p = plan ?? tenant?.plan ?? "starter";
  const modules = PLAN_MODULES[p] ?? PLAN_MODULES.starter;
  const seats = tenant?.seats ?? PLAN_SEATS[p] ?? 10;

  const [row] = await db
    .insert(tenantModuleLicensesTable)
    .values({ tenantId, plan: p, seats, modules, frameworkIds: [] })
    .returning();
  return row;
}

// GET /me/license — current user's tenant license
router.get("/me/license", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as any).user as JwtPayload;

    const license = await ensureLicense(tenantId);

    // Count users for seat consumption
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));

    return res.json({
      plan: license.plan,
      seats: license.seats,
      seatsUsed: users.length,
      modules: license.modules,
      frameworkIds: license.frameworkIds,
      expiresAt: license.expiresAt ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load license" });
  }
});

// GET /tenants/:id/license
router.get("/tenants/:id/license", requireAuth, async (req, res) => {
  try {
    const { role, tenantId: callerTenantId } = (req as any).user as JwtPayload;
    const tenantId = parseInt(String(req.params.id ?? ""), 10);

    if (role !== "super_admin" && callerTenantId !== tenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const license = await ensureLicense(tenantId);

    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));

    return res.json({
      plan: license.plan,
      seats: license.seats,
      seatsUsed: users.length,
      modules: license.modules,
      frameworkIds: license.frameworkIds,
      expiresAt: license.expiresAt ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load license" });
  }
});

// PUT /tenants/:id/license — super_admin only
router.put("/tenants/:id/license", requireAuth, async (req, res) => {
  try {
    const { role } = (req as any).user as JwtPayload;
    if (role !== "super_admin") return res.status(403).json({ error: "Forbidden" });

    const tenantId = parseInt(String(req.params.id ?? ""), 10);
    const { plan, seats, modules, frameworkIds, expiresAt } = req.body;

    // Ensure row exists first
    await ensureLicense(tenantId);

    const updates: Partial<typeof tenantModuleLicensesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (plan !== undefined) updates.plan = plan;
    if (seats !== undefined) updates.seats = Number(seats);
    if (modules !== undefined) updates.modules = modules;
    if (frameworkIds !== undefined) updates.frameworkIds = frameworkIds;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt || null;

    const [row] = await db
      .update(tenantModuleLicensesTable)
      .set(updates)
      .where(eq(tenantModuleLicensesTable.tenantId, tenantId))
      .returning();

    // Also sync seats on the tenant row
    if (seats !== undefined) {
      await db
        .update(tenantsTable)
        .set({ seats: Number(seats) })
        .where(eq(tenantsTable.id, tenantId));
    }
    // Sync plan on tenant row
    if (plan !== undefined) {
      await db
        .update(tenantsTable)
        .set({ plan })
        .where(eq(tenantsTable.id, tenantId));
    }

    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));

    return res.json({
      plan: row.plan,
      seats: row.seats,
      seatsUsed: users.length,
      modules: row.modules,
      frameworkIds: row.frameworkIds,
      expiresAt: row.expiresAt ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update license" });
  }
});

// POST /tenants/:id/license/apply-plan — apply default modules for a plan
router.post("/tenants/:id/license/apply-plan", requireAuth, async (req, res) => {
  try {
    const { role } = (req as any).user as JwtPayload;
    if (role !== "super_admin") return res.status(403).json({ error: "Forbidden" });

    const tenantId = parseInt(String(req.params.id ?? ""), 10);
    const { plan } = req.body;
    if (!plan || !PLAN_MODULES[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    await ensureLicense(tenantId);

    const [row] = await db
      .update(tenantModuleLicensesTable)
      .set({
        plan,
        modules: PLAN_MODULES[plan],
        seats: PLAN_SEATS[plan],
        updatedAt: new Date(),
      })
      .where(eq(tenantModuleLicensesTable.tenantId, tenantId))
      .returning();

    await db.update(tenantsTable).set({ plan, seats: PLAN_SEATS[plan] }).where(eq(tenantsTable.id, tenantId));

    return res.json({ plan: row.plan, seats: row.seats, modules: row.modules });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to apply plan" });
  }
});

// GET /tenants/:id/users — super_admin: list users for any tenant
router.get("/tenants/:id/users", requireAuth, async (req, res) => {
  try {
    const { role } = (req as any).user as JwtPayload;
    if (role !== "super_admin") return res.status(403).json({ error: "Forbidden" });

    const tenantId = parseInt(String(req.params.id ?? ""), 10);
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
        lastLogin: usersTable.lastLogin,
      })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));

    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

// Seed all existing tenants with default licenses on startup
export async function seedTenantLicenses() {
  try {
    const tenants = await db.select({ id: tenantsTable.id, plan: tenantsTable.plan }).from(tenantsTable);
    for (const t of tenants) {
      await ensureLicense(t.id, t.plan);
    }
  } catch (err) {
    console.error("License seed error:", err);
  }
}

export default router;

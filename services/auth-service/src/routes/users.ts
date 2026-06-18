import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { usersTable } from "@workspace/db";
import { hashPassword } from "@workspace/service-kit";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

function userRow(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    mfaEnabled: u.mfaEnabled,
    lastLogin: u.lastLogin?.toISOString() ?? null,
    avatar: u.avatar,
    createdAt: u.createdAt.toISOString(),
  };
}

// GET /users
router.get("/users", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const users = await db.select().from(usersTable).where(eq(usersTable.tenantId, tenantId));
    res.json(users.map(userRow));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users
router.post("/users", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const { email, name, role, password } = req.body as { email: string; name: string; role: string; password: string };
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({ tenantId, email: email.toLowerCase().trim(), name, role, passwordHash }).returning();
    res.status(201).json(userRow(user!));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    res.status(msg.includes("unique") ? 409 : 500).json({ error: msg.includes("unique") ? "Email already exists" : "Internal server error" });
  }
});

// GET /users/:id
router.get("/users/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId))).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userRow(user));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id
router.patch("/users/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const { name, role, email } = req.body as { name?: string; role?: string; email?: string };
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (email) updates.email = email.toLowerCase().trim();
    const [user] = await db.update(usersTable).set(updates).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId))).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userRow(user));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /users/:id
router.delete("/users/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

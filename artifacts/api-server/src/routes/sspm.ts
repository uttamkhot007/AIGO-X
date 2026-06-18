import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { saasAppsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { sspmService } from "../services/sspm";

const router = Router();
const tid = (req: Parameters<typeof requireAuth>[0]) =>
  Number((req as typeof req & { user: JwtPayload }).user.tenantId);
const tidStr = (req: Parameters<typeof requireAuth>[0]) =>
  String((req as typeof req & { user: JwtPayload }).user.tenantId);

router.get("/sspm/stats", requireAuth, async (req, res) => {
  try {
    const apps   = await db.select().from(saasAppsTable).where(eq(saasAppsTable.tenantId, tid(req)));
    const access = sspmService.getUserAccess(tidStr(req));
    res.json({
      totalApps:     apps.filter(a => a.status !== "shadow").length,
      approvedApps:  apps.filter(a => a.status === "approved").length,
      shadowApps:    apps.filter(a => a.status === "shadow").length,
      criticalApps:  apps.filter(a => a.risk === "Critical").length,
      staleAccounts: access.filter(u => u.stale).length,
      noMfaAdmins:   access.filter(u => u.permissionLevel === "admin" && !u.mfaEnabled).length,
      totalUsers:    [...new Set(access.map(u => u.userId))].length,
      avgRiskScore:  0,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/sspm/apps", requireAuth, async (req, res) => {
  try {
    const { status } = req.query as Record<string, string | undefined>;
    let apps = await db.select().from(saasAppsTable)
      .where(and(eq(saasAppsTable.tenantId, tid(req))));
    apps = apps.filter(a => a.status !== "shadow");
    if (status) apps = apps.filter(a => a.status === status);
    res.json(apps);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/sspm/apps/:id", requireAuth, async (req, res) => {
  try {
    const appId = String(req.params["id"] ?? "");
    const [row] = await db.select().from(saasAppsTable)
      .where(and(eq(saasAppsTable.tenantId, tid(req)), eq(saasAppsTable.appId, appId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "App not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/sspm/apps/:id/status", requireAuth, async (req, res) => {
  try {
    const appId = String(req.params["id"] ?? "");
    const { status } = req.body as { status: string };
    const [row] = await db.update(saasAppsTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(saasAppsTable.tenantId, tid(req)), eq(saasAppsTable.appId, appId)))
      .returning();
    if (!row) { res.status(404).json({ error: "App not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/sspm/shadow-it", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(saasAppsTable)
      .where(and(eq(saasAppsTable.tenantId, tid(req)), eq(saasAppsTable.status, "shadow")));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/sspm/shadow-it/:id/approve", requireAuth, async (req, res) => {
  try {
    const appId = String(req.params["id"] ?? "");
    const [row] = await db.update(saasAppsTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(and(eq(saasAppsTable.tenantId, tid(req)), eq(saasAppsTable.appId, appId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Shadow IT app not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/sspm/access", requireAuth, (req, res) => {
  const { appId, staleOnly } = req.query as Record<string, string | undefined>;
  res.json(sspmService.getUserAccess(tidStr(req), appId, staleOnly === "true"));
});

export default router;

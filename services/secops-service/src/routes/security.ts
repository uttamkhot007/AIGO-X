import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { findingsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

// GET /security/assets — static CAASM asset types (no dedicated table yet)
router.get("/security/assets", requireAuth, (_req, res) => {
  res.json([
    { id: 1, type: "Server",         count: 142, newCount: 2,  status: "healthy", color: "#065F46" },
    { id: 2, type: "Workstation",    count: 847, newCount: 14, status: "healthy", color: "#1E3A5F" },
    { id: 3, type: "Cloud Service",  count: 63,  newCount: 5,  status: "alert",   color: "#D97706" },
    { id: 4, type: "SaaS App",       count: 31,  newCount: 3,  status: "alert",   color: "#DC2626" },
    { id: 5, type: "IoT Device",     count: 28,  newCount: 0,  status: "unknown", color: "#9CA3AF" },
    { id: 6, type: "Network Device", count: 19,  newCount: 1,  status: "healthy", color: "#4338CA" },
  ]);
});

// GET /security/findings
router.get("/security/findings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(findingsTable).where(eq(findingsTable.tenantId, tenantId));
    res.json(rows.map(f => ({
      id: f.id, findingId: f.findingId, cloud: f.cloud,
      severity: f.severity, title: f.title, resource: f.resource, status: f.status,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

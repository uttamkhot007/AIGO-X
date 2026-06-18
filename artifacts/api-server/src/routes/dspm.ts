import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import {
  shadowDataStoresTable,
  dlpPoliciesTable,
  encryptionMatrixTable,
  dataResidencyTable,
  aiDatasetsTable,
  dspmAccessEventsTable,
  dspmOverAccessAlertsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { dataClassService } from "../services/data-classification";

const router = Router();

const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

const tid = (req: Parameters<typeof requireAuth>[0]) =>
  Number((req as typeof req & { user: JwtPayload }).user.tenantId);

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/dspm/stats", requireAuth, (req, res) => {
  const base = dataClassService.getStats(user(req).tenantId);
  res.json({ ...base, score: 68 });
});

// ── Data Stores ───────────────────────────────────────────────────────────
router.get("/dspm/stores", requireAuth, (req, res) => {
  const q = (req.query as Record<string, string | undefined>);
  let stores = dataClassService.getStores(user(req).tenantId);
  if (q["platform"])    stores = stores.filter(s => s.platform === q["platform"]);
  if (q["environment"]) stores = stores.filter(s => s.environment === q["environment"]);
  if (q["risk"] === "high") stores = stores.filter(s => s.riskScore >= 80);
  res.json(stores);
});

router.get("/dspm/stores/:id", requireAuth, (req, res) => {
  const item = dataClassService.getStoreById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "Data store not found" }); return; }
  res.json(item);
});

router.post("/dspm/stores/:id/scan", requireAuth, (req, res) => {
  const result = dataClassService.triggerStoreScan(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!result) { res.status(404).json({ error: "Data store not found" }); return; }
  res.json({ message: "Scan triggered", store: result });
});

// ── Classification Findings ───────────────────────────────────────────────
router.get("/dspm/findings", requireAuth, (req, res) => {
  const q = (req.query as Record<string, string | undefined>);
  let findings = dataClassService.getFindings(user(req).tenantId);
  if (q["storeId"])     findings = findings.filter(f => f.storeId === q["storeId"]);
  if (q["findingType"]) findings = findings.filter(f => f.findingType === q["findingType"]);
  if (q["severity"])    findings = findings.filter(f => f.severity === q["severity"]);
  if (q["status"])      findings = findings.filter(f => f.status === q["status"]);
  res.json(findings);
});

router.get("/dspm/findings/:id", requireAuth, (req, res) => {
  const item = dataClassService.getFindingById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(item);
});

router.patch("/dspm/findings/:id/remediate", requireAuth, (req, res) => {
  const result = dataClassService.remediateFinding(user(req).tenantId, String(req.params["id"] ?? ""), req.body ?? {});
  if (!result) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(result);
});

// ── Shadow Data Stores ────────────────────────────────────────────────────
router.get("/dspm/shadow-stores", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(shadowDataStoresTable).where(eq(shadowDataStoresTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── DLP Policies ──────────────────────────────────────────────────────────
router.get("/dspm/dlp-policies", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(dlpPoliciesTable).where(eq(dlpPoliciesTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── DAM Events ────────────────────────────────────────────────────────────
router.get("/dspm/dam-events", requireAuth, (_req, res) => { res.json([]); });

// ── Encryption Matrix ─────────────────────────────────────────────────────
router.get("/dspm/encryption-matrix", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(encryptionMatrixTable).where(eq(encryptionMatrixTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Data Residency ────────────────────────────────────────────────────────
router.get("/dspm/residency", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(dataResidencyTable).where(eq(dataResidencyTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── AI Datasets ───────────────────────────────────────────────────────────
router.get("/dspm/ai-datasets", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(aiDatasetsTable).where(eq(aiDatasetsTable.tenantId, tid(req)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Anomalies / Catalog ───────────────────────────────────────────────────
router.get("/dspm/anomalies", requireAuth, (_req, res) => { res.json([]); });
router.get("/dspm/catalog",   requireAuth, (_req, res) => { res.json([]); });

// ── Risk Trend ────────────────────────────────────────────────────────────
router.get("/dspm/risk-trend", requireAuth, (_req, res) => {
  res.json([]);
});

// ── Type Distribution ─────────────────────────────────────────────────────
router.get("/dspm/type-distribution", requireAuth, (_req, res) => {
  res.json([]);
});

// ── Access Events ─────────────────────────────────────────────────────────
router.get("/dspm/access-events", requireAuth, async (req, res) => {
  try {
    const tenantId = tid(req);
    const q = req.query as Record<string, string | undefined>;
    let rows = await db.select().from(dspmAccessEventsTable)
      .where(eq(dspmAccessEventsTable.tenantId, tenantId))
      .orderBy(dspmAccessEventsTable.createdAt);
    if (q["storeId"])  rows = rows.filter(r => r.storeId  === q["storeId"]);
    if (q["userId"])   rows = rows.filter(r => r.userId   === q["userId"]);
    if (q["severity"]) rows = rows.filter(r => r.riskLevel === q["severity"]);
    if (q["anomalous"] === "true") rows = rows.filter(r => r.anomalous);
    res.json(rows.reverse());
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Over-Access Alerts ────────────────────────────────────────────────────
router.get("/dspm/over-access-alerts", requireAuth, async (req, res) => {
  try {
    const tenantId = tid(req);
    const rows = await db.select().from(dspmOverAccessAlertsTable)
      .where(eq(dspmOverAccessAlertsTable.tenantId, tenantId))
      .orderBy(dspmOverAccessAlertsTable.createdAt);
    res.json(rows.reverse());
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Access Heatmap (hour × store aggregated event counts) ────────────────
router.get("/dspm/access-heatmap", requireAuth, async (req, res) => {
  try {
    const tenantId = tid(req);
    const storeIdFilter = req.query["storeId"] as string | undefined;
    let query = db.select().from(dspmAccessEventsTable)
      .where(eq(dspmAccessEventsTable.tenantId, tenantId));
    const allRows = await query;
    const rows = storeIdFilter
      ? allRows.filter(r => r.storeId === storeIdFilter || r.storeName === storeIdFilter)
      : allRows;
    // Build a 7 × 24 grid (day-of-week × hour)
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    rows.forEach(r => {
      const ts = new Date(r.occurredAt.replace(" ", "T"));
      if (!isNaN(ts.getTime())) {
        const dow = ts.getDay();
        const hr  = ts.getHours();
        grid[dow]![hr] = (grid[dow]![hr] ?? 0) + 1;
      }
    });
    // Return unique stores so the UI can build a selector
    const storeMap = new Map<string, string>();
    allRows.forEach(r => storeMap.set(r.storeId, r.storeName));
    const stores = Array.from(storeMap.entries()).map(([id, name]) => ({ id, name }));
    res.json({ grid, days: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], stores, selectedStore: storeIdFilter || null });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;

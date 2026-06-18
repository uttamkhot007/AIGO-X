import { Router } from "express";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import { dataClassService } from "../services/data-classification";

const router = Router();

const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/dspm/stats", requireAuth, (req, res) => {
  res.json(dataClassService.getStats(user(req).tenantId));
});

// ── Data Stores ───────────────────────────────────────────────────────────
router.get("/dspm/stores", requireAuth, (req, res) => {
  const q = (req.query as Record<string,string|undefined>);
  let stores = dataClassService.getStores(user(req).tenantId);
  if (q["platform"]) stores = stores.filter(s => s.platform === q["platform"]);
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
  const q = (req.query as Record<string,string|undefined>);
  let findings = dataClassService.getFindings(user(req).tenantId);
  if (q["storeId"])      findings = findings.filter(f => f.storeId === q["storeId"]);
  if (q["findingType"])  findings = findings.filter(f => f.findingType === q["findingType"]);
  if (q["severity"])     findings = findings.filter(f => f.severity === q["severity"]);
  if (q["status"])       findings = findings.filter(f => f.status === q["status"]);
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

router.patch("/dspm/findings/:id/accept", requireAuth, (req, res) => {
  const result = dataClassService.acceptFinding(user(req).tenantId, String(req.params["id"] ?? ""), req.body ?? {});
  if (!result) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(result);
});

// ── Sensitivity Heatmap ───────────────────────────────────────────────────
router.get("/dspm/heatmap", requireAuth, (req, res) => {
  res.json(dataClassService.getHeatmap(user(req).tenantId));
});

// ── Data Lineage ──────────────────────────────────────────────────────────
router.get("/dspm/lineage", requireAuth, (_req, res) => {
  res.json(dataClassService.getLineage());
});

// ── Over-Permission Alerts ────────────────────────────────────────────────
router.get("/dspm/over-permission", requireAuth, (req, res) => {
  const q = (req.query as Record<string,string|undefined>);
  let alerts = dataClassService.getOverPerm(user(req).tenantId);
  if (q["severity"]) alerts = alerts.filter(a => a.severity === q["severity"]);
  if (q["status"])   alerts = alerts.filter(a => a.status === q["status"]);
  res.json(alerts);
});

router.patch("/dspm/over-permission/:id/status", requireAuth, (req, res) => {
  const body = req.body ?? {};
  const allowed = ["open", "reviewed", "remediated"];
  if (!allowed.includes(body.status)) { res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` }); return; }
  const result = dataClassService.updateAlertStatus(user(req).tenantId, String(req.params["id"] ?? ""), body.status);
  if (!result) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json(result);
});

// ── Regulatory Obligations ────────────────────────────────────────────────
router.get("/dspm/obligations", requireAuth, (req, res) => {
  const q = (req.query as Record<string,string|undefined>);
  let obs = dataClassService.getRegObligations(user(req).tenantId);
  if (q["regulation"]) obs = obs.filter(o => o.regulation === q["regulation"]);
  if (q["status"])     obs = obs.filter(o => o.status === q["status"]);
  res.json(obs);
});

router.patch("/dspm/obligations/:id", requireAuth, (req, res) => {
  const body = req.body ?? {};
  if (!body.status) { res.status(400).json({ error: "status is required" }); return; }
  const result = dataClassService.updateObligationStatus(user(req).tenantId, String(req.params["id"] ?? ""), body);
  if (!result) { res.status(404).json({ error: "Obligation not found" }); return; }
  res.json(result);
});

export default router;

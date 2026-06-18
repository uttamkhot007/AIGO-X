import { Router } from "express";
import { requireAuth } from "@workspace/service-kit";
import { networkAuditService } from "../services/network-audit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

router.get("/network-audit/stats",     requireAuth, (req, res) => { res.json(networkAuditService.getStats(user(req).tenantId)); });
router.get("/network-audit/rule-sets", requireAuth, (req, res) => { res.json(networkAuditService.getRuleSets(user(req).tenantId)); });
router.get("/network-audit/rule-sets/:id", requireAuth, (req, res) => {
  const rs = networkAuditService.getRuleSet(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!rs) { res.status(404).json({ error: "Rule set not found" }); return; }
  res.json(rs);
});

router.get("/network-audit/rules", requireAuth, (req, res) => {
  const { ruleSetId, anomaly } = req.query as Record<string, string | undefined>;
  res.json(networkAuditService.getRules(user(req).tenantId, ruleSetId, anomaly as "any-any" | "overly-permissive" | "unused" | "redundant" | "shadowed" | "conflict" | undefined));
});
router.get("/network-audit/rules/:id", requireAuth, (req, res) => {
  const r = networkAuditService.getRule(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!r) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json(r);
});
router.patch("/network-audit/rules/:id", requireAuth, (req, res) => {
  const r = networkAuditService.updateRule(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!r) { res.status(404).json({ error: "Rule not found" }); return; }
  res.json(r);
});

router.get("/network-audit/anomalies", requireAuth, (req, res) => { res.json(networkAuditService.detectAnomalies(user(req).tenantId)); });

router.get("/network-audit/changes",  requireAuth, (req, res) => {
  const { ruleSetId } = req.query as Record<string, string | undefined>;
  res.json(networkAuditService.getChanges(user(req).tenantId, ruleSetId ?? ""));
});
router.post("/network-audit/changes", requireAuth, (req, res) => { res.status(201).json(networkAuditService.addChange(user(req).tenantId, req.body)); });

router.get("/network-audit/zones", requireAuth, (req, res) => { res.json(networkAuditService.getZoneMatrix(user(req).tenantId)); });
router.get("/network-audit/zones/policy", requireAuth, (req, res) => {
  const { src, dst } = req.query as Record<string, string | undefined>;
  const z = networkAuditService.getZonePolicies(user(req).tenantId, src ?? "", dst ?? "");
  if (!z) { res.status(404).json({ error: "Zone pair not found" }); return; }
  res.json(z);
});

export default router;

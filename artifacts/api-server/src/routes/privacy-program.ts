import { Router } from "express";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { privacyService } from "../services/privacy";

const router = Router();

const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get("/privacy-program/dashboard", requireAuth, (req, res) => {
  res.json(privacyService.getDashboardStats(user(req).tenantId));
});

// ── RoPA ──────────────────────────────────────────────────────────────────
router.get("/privacy-program/ropa", requireAuth, (req, res) => {
  res.json(privacyService.getRopa(user(req).tenantId));
});

router.get("/privacy-program/ropa/stats", requireAuth, (req, res) => {
  res.json(privacyService.getRopaStats(user(req).tenantId));
});

router.get("/privacy-program/ropa/:id", requireAuth, (req, res) => {
  const item = privacyService.getRopaById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "RoPA record not found" }); return; }
  res.json(item);
});

router.post("/privacy-program/ropa", requireAuth, (req, res) => {
  const record = privacyService.createRopa(user(req).tenantId, req.body ?? {});
  res.status(201).json(record);
});

router.patch("/privacy-program/ropa/:id", requireAuth, (req, res) => {
  const result = privacyService.updateRopa(user(req).tenantId, String(req.params["id"] ?? ""), req.body ?? {});
  if (!result) { res.status(404).json({ error: "RoPA record not found" }); return; }
  res.json(result);
});

router.delete("/privacy-program/ropa/:id", requireAuth, (req, res) => {
  const ok = privacyService.deleteRopa(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!ok) { res.status(404).json({ error: "RoPA record not found" }); return; }
  res.json({ deleted: true });
});

// ── DPIA ──────────────────────────────────────────────────────────────────
router.get("/privacy-program/dpias", requireAuth, (req, res) => {
  res.json(privacyService.getDpias(user(req).tenantId));
});

router.get("/privacy-program/dpias/:id", requireAuth, (req, res) => {
  const item = privacyService.getDpiaById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "DPIA not found" }); return; }
  res.json(item);
});

router.post("/privacy-program/dpias/:id/steps/:step/advance", requireAuth, (req, res) => {
  const result = privacyService.advanceDpiaStep(
    user(req).tenantId,
    String(req.params["id"] ?? ""),
    Number(req.params["step"]),
    req.body ?? {}
  );
  if (!result) { res.status(404).json({ error: "DPIA or step not found" }); return; }
  res.json(result);
});

router.post("/privacy-program/dpias/:id/signoff", requireAuth, (req, res) => {
  const body = req.body ?? {};
  if (typeof body.approved !== "boolean") { res.status(400).json({ error: "approved (boolean) required" }); return; }
  const result = privacyService.signOffDpia(user(req).tenantId, String(req.params["id"] ?? ""), body);
  if (!result) { res.status(404).json({ error: "DPIA not found" }); return; }
  res.json(result);
});

// ── Privacy Notices ────────────────────────────────────────────────────────
router.get("/privacy-program/notices", requireAuth, (req, res) => {
  res.json(privacyService.getNotices(user(req).tenantId));
});

router.get("/privacy-program/notices/:id", requireAuth, (req, res) => {
  const item = privacyService.getNoticeById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "Privacy notice not found" }); return; }
  res.json(item);
});

router.post("/privacy-program/notices/:id/publish", requireAuth, (req, res) => {
  const result = privacyService.publishNotice(user(req).tenantId, String(req.params["id"] ?? ""), req.body ?? {});
  if (!result) { res.status(404).json({ error: "Privacy notice not found" }); return; }
  res.json(result);
});

// ── DSAR ──────────────────────────────────────────────────────────────────
router.get("/privacy-program/dsars", requireAuth, (req, res) => {
  res.json(privacyService.getDsars(user(req).tenantId));
});

router.get("/privacy-program/dsars/stats", requireAuth, (req, res) => {
  res.json(privacyService.getDsarStats(user(req).tenantId));
});

router.get("/privacy-program/dsars/:id", requireAuth, (req, res) => {
  const item = privacyService.getDsarById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "DSAR not found" }); return; }
  res.json(item);
});

router.post("/privacy-program/dsars", requireAuth, (req, res) => {
  const body = req.body ?? {};
  if (!body.type || !body.subject) { res.status(400).json({ error: "type and subject are required" }); return; }
  const record = privacyService.createDsar(user(req).tenantId, body);
  res.status(201).json(record);
});

router.patch("/privacy-program/dsars/:id/transition", requireAuth, (req, res) => {
  const body = req.body ?? {};
  if (!body.status) { res.status(400).json({ error: "status is required" }); return; }
  const result = privacyService.transitionDsar(user(req).tenantId, String(req.params["id"] ?? ""), body);
  if (!result) { res.status(422).json({ error: "DSAR not found or transition not valid" }); return; }
  res.json(result);
});

router.post("/privacy-program/dsars/:id/extend", requireAuth, (req, res) => {
  const days = Number((req.body ?? {}).days ?? 30);
  const result = privacyService.extendDsar(user(req).tenantId, String(req.params["id"] ?? ""), days);
  if (!result) { res.status(404).json({ error: "DSAR not found" }); return; }
  res.json(result);
});

// ── Consent ───────────────────────────────────────────────────────────────
router.get("/privacy-program/consent", requireAuth, (req, res) => {
  res.json(privacyService.getConsent(user(req).tenantId));
});

router.get("/privacy-program/consent/stats", requireAuth, (req, res) => {
  res.json(privacyService.getConsentStats(user(req).tenantId));
});

router.post("/privacy-program/consent/:id/withdraw", requireAuth, (req, res) => {
  const result = privacyService.withdrawConsent(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!result) { res.status(422).json({ error: "Consent record not found or already withdrawn" }); return; }
  res.json(result);
});

// ── DPA Tracker ───────────────────────────────────────────────────────────
router.get("/privacy-program/dpas", requireAuth, (req, res) => {
  res.json(privacyService.getDpas(user(req).tenantId));
});

router.get("/privacy-program/dpas/stats", requireAuth, (req, res) => {
  res.json(privacyService.getDpaStats(user(req).tenantId));
});

router.get("/privacy-program/dpas/:id", requireAuth, (req, res) => {
  const item = privacyService.getDpaById(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!item) { res.status(404).json({ error: "DPA not found" }); return; }
  res.json(item);
});

router.patch("/privacy-program/dpas/:id", requireAuth, (req, res) => {
  const result = privacyService.updateDpa(user(req).tenantId, String(req.params["id"] ?? ""), req.body ?? {});
  if (!result) { res.status(404).json({ error: "DPA not found" }); return; }
  res.json(result);
});

router.post("/privacy-program/dpas/:id/renew", requireAuth, (req, res) => {
  const result = privacyService.renewDpa(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!result) { res.status(404).json({ error: "DPA not found" }); return; }
  res.json(result);
});

export default router;

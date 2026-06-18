import { Router } from "express";
import { requireAuth } from "@workspace/service-kit";
import { integrationHubService, ingestConnection, getPipelineLog } from "../services/integration-hub";
import type { JwtPayload } from "@workspace/service-kit";
import type { ConnectorCategory } from "../services/integration-hub";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

// ── Connector registry ──────────────────────────────────────────────────────
router.get("/integrations/connectors",     requireAuth, (req, res) => {
  const { category } = req.query as Record<string, string | undefined>;
  res.json(integrationHubService.getConnectors(category as ConnectorCategory | undefined));
});
router.get("/integrations/connectors/:id", requireAuth, (req, res) => {
  const c = integrationHubService.getConnector(String(req.params["id"] ?? ""));
  if (!c) { res.status(404).json({ error: "Connector not found" }); return; }
  res.json(c);
});

// ── Stats ───────────────────────────────────────────────────────────────────
router.get("/integrations/stats",          requireAuth, (req, res) => { res.json(integrationHubService.getStats(user(req).tenantId)); });

// ── Connections ─────────────────────────────────────────────────────────────
router.get("/integrations/connections",    requireAuth, (req, res) => { res.json(integrationHubService.getConnections(user(req).tenantId)); });
router.get("/integrations/connections/:id",requireAuth, (req, res) => {
  const c = integrationHubService.getConnection(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!c) { res.status(404).json({ error: "Connection not found" }); return; }
  res.json(c);
});

// POST /integrations/connections — create + activate (with optional config)
router.post("/integrations/connections",   requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const { connectorId, config } = req.body as { connectorId: string; config?: Record<string, string> };
    const conn = integrationHubService.createConnection(tenantId, connectorId);
    if (!conn) { res.status(400).json({ error: "Connector not found" }); return; }

    const connector = integrationHubService.getConnector(connectorId);
    if (connector && config && Object.keys(config).length > 0) {
      integrationHubService.storeConnectionConfig(tenantId, conn.id, config);
      const event = await ingestConnection(tenantId, conn, connector);
      integrationHubService.markConnected(tenantId, conn.id, event.ingested);
      res.status(201).json({ connection: integrationHubService.getConnection(tenantId, conn.id), event });
    } else {
      res.status(201).json({ connection: conn });
    }
  } catch (err) {
    console.error("[POST /integrations/connections]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/integrations/connections/:id", requireAuth, (req, res) => {
  const c = integrationHubService.updateConnection(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!c) { res.status(404).json({ error: "Connection not found" }); return; }
  res.json(c);
});
router.delete("/integrations/connections/:id", requireAuth, (req, res) => {
  const ok = integrationHubService.deleteConnection(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!ok) { res.status(404).json({ error: "Connection not found" }); return; }
  res.status(204).end();
});

// POST /integrations/connections/:id/sync — full re-ingest
router.post("/integrations/connections/:id/sync", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const connId = String(req.params["id"] ?? "");
    const conn = integrationHubService.getConnection(tenantId, connId);
    if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
    const connector = integrationHubService.getConnector(conn.connectorId);
    if (!connector) { res.status(404).json({ error: "Connector not found" }); return; }

    const event = await ingestConnection(tenantId, conn, connector);
    integrationHubService.markConnected(tenantId, connId, event.ingested);
    res.json({ connection: integrationHubService.getConnection(tenantId, connId), event });
  } catch (err) {
    console.error("[POST /integrations/connections/:id/sync]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /integrations/connections/:id/activate — re-configure + re-ingest
router.post("/integrations/connections/:id/activate", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const connId = String(req.params["id"] ?? "");
    const { config } = req.body as { config?: Record<string, string> };

    let conn = integrationHubService.getConnection(tenantId, connId);
    if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
    const connector = integrationHubService.getConnector(conn.connectorId);
    if (!connector) { res.status(404).json({ error: "Connector not found" }); return; }

    if (config && Object.keys(config).length > 0) {
      integrationHubService.storeConnectionConfig(tenantId, connId, config);
    }
    const event = await ingestConnection(tenantId, conn, connector);
    integrationHubService.markConnected(tenantId, connId, event.ingested);
    conn = integrationHubService.getConnection(tenantId, connId)!;
    res.json({ connection: conn, event });
  } catch (err) {
    console.error("[POST /integrations/connections/:id/activate]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Pipeline log ─────────────────────────────────────────────────────────────
router.get("/integrations/pipeline", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  res.json(getPipelineLog(tenantId));
});

// ── Pipeline metrics ────────────────────────────────────────────────────────
router.get("/integrations/metrics",        requireAuth, (req, res) => { res.json(integrationHubService.getMetrics(user(req).tenantId)); });

// ── Webhooks ────────────────────────────────────────────────────────────────
router.get("/integrations/webhooks",       requireAuth, (req, res) => { res.json(integrationHubService.getWebhooks(user(req).tenantId)); });
router.post("/integrations/webhooks",      requireAuth, (req, res) => { res.status(201).json(integrationHubService.createWebhook(user(req).tenantId, req.body)); });
router.patch("/integrations/webhooks/:id", requireAuth, (req, res) => {
  const w = integrationHubService.updateWebhook(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!w) { res.status(404).json({ error: "Webhook not found" }); return; }
  res.json(w);
});
router.delete("/integrations/webhooks/:id",requireAuth, (req, res) => {
  const ok = integrationHubService.deleteWebhook(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!ok) { res.status(404).json({ error: "Webhook not found" }); return; }
  res.status(204).end();
});
router.get("/integrations/webhooks/:id/logs",requireAuth, (req, res) => { res.json(integrationHubService.getDeliveryLog(user(req).tenantId, String(req.params["id"] ?? ""))); });

export default router;

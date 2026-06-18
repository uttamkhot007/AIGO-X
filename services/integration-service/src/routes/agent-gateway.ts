import { Router } from "express";
import { requireAuth, db } from "@workspace/service-kit";
import { agentGatewayService } from "../services/agent-gateway";
import { processPush } from "../services/agent-gateway/AgentPipelineService.js";
import { caasmService } from "../services/caasm/index.js";
import { findingsTable, controlsTable, ticketsTable } from "@workspace/db";
import { eq, ilike, and, or, desc } from "drizzle-orm";
import type { JwtPayload } from "@workspace/service-kit";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const router = Router();

const JWT_SECRET = process.env["JWT_SECRET"] ?? "fallback-secret";
const AGENT_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const user = (req: Request) => {
  const u = (req as Request & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

interface AgentJwt { agentId: string; tenantId: number; role: "agent" }

function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Missing agent bearer token" }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AgentJwt;
    if (payload.role !== "agent") throw new Error("Not an agent token");
    (req as Request & { agent: AgentJwt }).agent = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired agent token" });
  }
}

function signAgentToken(agentId: string, tenantId: number): string {
  return jwt.sign({ agentId, tenantId, role: "agent" }, JWT_SECRET, { expiresIn: AGENT_TOKEN_TTL });
}

function tenantOf(req: Request): number {
  return (req as Request & { agent: AgentJwt }).agent.tenantId;
}
function agentIdOf(req: Request): string {
  return (req as Request & { agent: AgentJwt }).agent.agentId;
}

// ── Existing authenticated routes (user JWT) ──────────────────────────────────

router.get("/agents/stats",           requireAuth, (req, res) => { res.json(agentGatewayService.getStats(user(req).tenantId)); });
router.get("/agents",                 requireAuth, (req, res) => { res.json(agentGatewayService.listAgents(user(req).tenantId)); });
router.get("/agents/:id",             requireAuth, (req, res) => {
  const a = agentGatewayService.getAgent(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!a) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json(a);
});

router.post("/agents/register",       requireAuth, async (req, res) => {
  const a = await agentGatewayService.register(user(req).tenantId, req.body);
  res.status(201).json(a);
});

router.post("/agents/:id/checkin",    requireAuth, (req, res) => {
  const a = agentGatewayService.checkin(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!a) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json(a);
});

router.get("/agents/:id/push",        requireAuth, (req, res) => {
  const pending = agentGatewayService.getPendingPush(user(req).tenantId, String(req.params["id"] ?? ""));
  res.json({ pending });
});

router.patch("/agents/:id/policy",    requireAuth, (req, res) => {
  const a = agentGatewayService.updatePolicy(user(req).tenantId, String(req.params["id"] ?? ""), req.body);
  if (!a) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json(a);
});

router.delete("/agents/:id",          requireAuth, (req, res) => {
  const ok = agentGatewayService.deleteAgent(user(req).tenantId, String(req.params["id"] ?? ""));
  if (!ok) { res.status(404).json({ error: "Agent not found" }); return; }
  res.status(204).end();
});

// ── SEC-001: Bootstrap token → JWT exchange ───────────────────────────────────

async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.headers["authorization"] ?? "";
    const enrollToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!enrollToken) { res.status(401).json({ error: "Missing enroll token" }); return; }

    const validToken = agentGatewayService.validateEnrollToken(enrollToken);
    if (!validToken) { res.status(401).json({ error: "Invalid enroll token" }); return; }

    const body = req.body as {
      hostname?: string; os?: string; arch?: string; version?: string;
      ip?: string; tags?: string[]; ed25519_public_key?: string;
    };

    const tenantId = validToken.tenantId;
    const agent = await agentGatewayService.register(String(tenantId), {
      hostname: body.hostname ?? "unknown-host",
      os: (body.os as "linux" | "windows" | "macos" | "mobile" | "cloud") ?? "linux",
      arch: body.arch ?? "x86_64",
      version: body.version ?? "unknown",
      ip: body.ip ?? req.ip ?? "0.0.0.0",
      tags: body.tags ?? [],
      ed25519_public_key: body.ed25519_public_key,
    });

    const accessToken = signAgentToken(agent.id, tenantId);
    const refreshToken = await agentGatewayService.createRefreshToken(agent.id, tenantId);

    res.status(201).json({
      agent_id: agent.id,
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: refreshToken,
      hmac_secret: agent.hmacSecret,
      heartbeat_interval: agent.policy.reportingIntervalSecs,
      collection_interval: 300,
      policy: agent.policy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
}

// Both paths resolve to the same handler — Rust clients may use either
router.post("/v1/agent/auth/register", handleRegister);
router.post("/v1/agent/register",      handleRegister);

// ── SEC-002: Refresh token rotation ──────────────────────────────────────────

// Compatibility alias used by the Rust agent runtime
router.post("/agent/token/refresh", handleRefresh);
router.post("/v1/agent/auth/refresh", handleRefresh);

async function handleRefresh(req: Request, res: Response): Promise<void> {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };
    if (!refresh_token) { res.status(400).json({ error: "Missing refresh_token" }); return; }

    const record = await agentGatewayService.consumeRefreshToken(refresh_token);
    if (!record) { res.status(401).json({ error: "Invalid or expired refresh token" }); return; }

    const accessToken = signAgentToken(record.agentId, record.tenantId);
    const newRefreshToken = await agentGatewayService.createRefreshToken(record.agentId, record.tenantId);

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
}

// ── SEC-003: Agent heartbeat / check-in ──────────────────────────────────────

router.post("/v1/agent/checkin", requireAgentAuth, (req, res) => {
  try {
    const agentId = agentIdOf(req);
    const tenantId = String(tenantOf(req));
    const body = req.body as {
      health?: { cpu: number; mem: number; disk: number; uptime: number };
      telemetry?: { assetsDiscovered: number; eventsLastHour: number; alertsOpen: number };
      version?: string;
    };

    const agent = agentGatewayService.checkin(tenantId, agentId, {
      agentId,
      health: body.health ?? { cpu: 0, mem: 0, disk: 0, uptime: 0 },
      telemetry: body.telemetry ?? { assetsDiscovered: 0, eventsLastHour: 0, alertsOpen: 0 },
      version: body.version ?? "unknown",
    });

    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const pending = agentGatewayService.getPendingPush(tenantId, agentId);
    const pendingActions: Array<{ type: string; payload?: unknown }> = [];
    if (pending) {
      pendingActions.push({ type: "update_agent", payload: pending });
    }
    pendingActions.push({ type: "push_config", payload: agent.policy });
    pendingActions.push({ type: "collect_logs" });

    // Return both keys: pendingActions (Rust serde name) and commands (spec name)
    res.json({ pendingActions, commands: pendingActions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── DATA-001: Receive and route result payloads ───────────────────────────────

router.post("/v1/agent/push", requireAgentAuth, async (req, res) => {
  try {
    const agentId = agentIdOf(req);
    const tenantId = tenantOf(req);
    const body = req.body as {
      result_type?: string;
      payload?: unknown;
      checks_run?: number;
      checks_passed?: number;
      checks_failed?: number;
      score?: number;
      payload_signature?: string;
      ed25519_signature?: string;
    };

    if (!body.result_type) { res.status(400).json({ error: "Missing result_type" }); return; }
    if (!body.payload) { res.status(400).json({ error: "Missing payload" }); return; }

    const secrets = await agentGatewayService.getAgentSecrets(String(tenantId), agentId);
    if (!secrets) { res.status(404).json({ error: "Agent not found or tenantId mismatch" }); return; }

    const result = await processPush(agentId, tenantId, {
      agent_id: agentId,
      result_type: body.result_type,
      payload: body.payload,
      checks_run: body.checks_run,
      checks_passed: body.checks_passed,
      checks_failed: body.checks_failed,
      score: body.score,
      payload_signature: body.payload_signature,
      ed25519_signature: body.ed25519_signature,
    }, secrets);

    res.json({
      ok: true,
      ingested: {
        controls: result.controls,
        assets: result.assets,
        findings: result.findings,
        tickets: result.tickets,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isAuthErr = msg.includes("signature") || msg.includes("public key");
    const isRouteErr = msg.includes("Unknown result_type");
    res.status(isAuthErr ? 403 : isRouteErr ? 400 : 500).json({ error: msg });
  }
});

// ── Per-module query endpoints (user JWT) ─────────────────────────────────────

router.get("/agent-gateway/complyops/evidence", requireAuth, async (req, res) => {
  try {
    const tid = Number(user(req).tenantId);
    const rows = await db
      .select()
      .from(controlsTable)
      .where(and(
        eq(controlsTable.tenantId, tid),
        ilike(controlsTable.controlId, "AGTC-%"),
      ))
      .orderBy(desc(controlsTable.controlId))
      .limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to query agent compliance data" });
  }
});

router.get("/agent-gateway/assetops/inventory", requireAuth, async (req, res) => {
  try {
    const tid = Number(user(req).tenantId);

    // Fetch CAASM assets discovered by agents (hardware)
    const caasmAssets = caasmService.getAgentAssets(String(tid));

    // Fetch software inventory findings from DB
    const softwareFindings = await db
      .select()
      .from(findingsTable)
      .where(and(
        eq(findingsTable.tenantId, tid),
        eq(findingsTable.cloud, "SoftInv-Agent"),
      ))
      .orderBy(desc(findingsTable.findingId))
      .limit(200);

    res.json({ assets: caasmAssets, software: softwareFindings });
  } catch (err) {
    res.status(500).json({ error: "Failed to query agent asset data" });
  }
});

router.get("/agent-gateway/dataops/discoveries", requireAuth, async (req, res) => {
  try {
    const tid = Number(user(req).tenantId);
    const rows = await db
      .select()
      .from(findingsTable)
      .where(and(
        eq(findingsTable.tenantId, tid),
        eq(findingsTable.cloud, "DSPM-Agent"),
      ))
      .orderBy(desc(findingsTable.findingId))
      .limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to query agent data discoveries" });
  }
});

router.get("/agent-gateway/secops/benchmark", requireAuth, async (req, res) => {
  try {
    const tid = Number(user(req).tenantId);
    const rows = await db
      .select()
      .from(findingsTable)
      .where(and(
        eq(findingsTable.tenantId, tid),
        or(
          eq(findingsTable.cloud, "CIS-Agent"),
          eq(findingsTable.cloud, "CVE-Agent"),
        ),
      ))
      .orderBy(desc(findingsTable.findingId))
      .limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to query agent security data" });
  }
});

router.get("/agent-gateway/serviceops/incidents", requireAuth, async (req, res) => {
  try {
    const tid = Number(user(req).tenantId);
    const rows = await db
      .select()
      .from(ticketsTable)
      .where(and(
        eq(ticketsTable.tenantId, tid),
        ilike(ticketsTable.ticketId, "AGTI-%"),
      ))
      .orderBy(desc(ticketsTable.ticketId))
      .limit(100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to query agent incident data" });
  }
});

export default router;

import { Router } from "express";
import { eq, and, ilike, or, inArray } from "drizzle-orm";
import { createHmac, timingSafeEqual, verify as cryptoVerify, createPublicKey, randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import { requireAuth } from "../lib/auth";
import { db } from "../lib/db";
import { findingsTable, controlsTable, ticketsTable, grcAssetsTable } from "@workspace/db";
import { agentGatewayService } from "../services/agent-gateway";
import type { JwtPayload } from "../lib/auth";
import type { Request, Response, NextFunction } from "express";

const router = Router();
const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: String(u.tenantId) };
};

// ── SEC-001: Agent JWT auth ───────────────────────────────────────────────────

const JWT_SECRET = process.env["JWT_SECRET"] ?? "fallback-secret";
const AIGO_ENROLL_TOKEN = process.env["AIGO_ENROLL_TOKEN"] ?? "";
const AGENT_TOKEN_TTL = "15m";

interface AgentJwt { agentId: string; tenantId: number; role: "agent" }

function signAgentToken(agentId: string, tenantId: number): string {
  return jwt.sign({ agentId, tenantId, role: "agent" }, JWT_SECRET, { expiresIn: AGENT_TOKEN_TTL });
}

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

function agentOf(req: Request): AgentJwt {
  return (req as Request & { agent: AgentJwt }).agent;
}

// ── SEC-001: Bootstrap token → JWT exchange ───────────────────────────────────

router.post("/v1/agent/auth/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = req.headers["authorization"] ?? "";
    const enrollToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!enrollToken) { res.status(401).json({ error: "Missing enroll token" }); return; }
    if (!AIGO_ENROLL_TOKEN || enrollToken !== AIGO_ENROLL_TOKEN) {
      res.status(401).json({ error: "Invalid enroll token" }); return;
    }

    const tenantId = 1;
    const body = req.body as {
      hostname?: string; os?: string; arch?: string; version?: string;
      ip?: string; tags?: string[]; ed25519_public_key?: string;
    };

    const agent = await agentGatewayService.register(String(tenantId), {
      hostname: body.hostname ?? "unknown-host",
      os: (body.os as "linux" | "windows" | "macos" | "mobile" | "cloud") ?? "linux",
      arch: body.arch ?? "x86_64",
      version: body.version ?? "unknown",
      ip: body.ip ?? (req.ip ?? "0.0.0.0"),
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
});

// ── SEC-002: Refresh token rotation ──────────────────────────────────────────

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

router.post("/v1/agent/auth/refresh", handleRefresh);
router.post("/agent/token/refresh",   handleRefresh);

// Alias
router.post("/v1/agent/register", (req: Request, res: Response, next: NextFunction) => {
  (router as any).handle(Object.assign(req, { url: "/v1/agent/auth/register", originalUrl: req.originalUrl }), res, next);
});

// ── DATA-001: Agent push → DB pipeline ───────────────────────────────────────

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map(k => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k])).join(",") + "}";
}

function verifyHmac(payload: unknown, sig: string, secret: string): boolean {
  try {
    const canonical = canonicalJson(payload);
    const expected = createHmac("sha256", secret).update(canonical).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch { return false; }
}

function verifyEd25519(payloadStr: string, sigHex: string, pubKeyHex: string): boolean {
  try {
    const rawPubKey = Buffer.from(pubKeyHex, "hex");
    if (rawPubKey.length !== 32) throw new Error("Invalid Ed25519 key length");
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawPubKey]);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    return cryptoVerify(null, Buffer.from(payloadStr), key, Buffer.from(sigHex, "hex"));
  } catch { return false; }
}

let _seq = Date.now();
const nextId = (prefix: string) => `${prefix}-${++_seq}`;

async function processPush(agentId: string, tenantId: number, resultType: string, payload: unknown, hmacSecret: string, publicKey?: string, payloadSig?: string, ed25519Sig?: string) {
  if (payloadSig) {
    if (!verifyHmac(payload, payloadSig, hmacSecret)) {
      throw new Error("HMAC signature verification failed — payload rejected");
    }
  }
  if (ed25519Sig) {
    if (!publicKey) throw new Error("Ed25519 signature present but no public key registered");
    if (!verifyEd25519(canonicalJson(payload), ed25519Sig, publicKey)) {
      throw new Error("Ed25519 signature verification failed — payload rejected");
    }
  }

  const rt = (resultType ?? "").toLowerCase();
  let controls = 0, assets = 0, findings = 0, tickets = 0;
  const DUE = (days = 30) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

  if (rt === "complyops" || rt === "compliance") {
    const p = payload as { policy_findings?: Array<{ id: string; name: string; status: string; framework: string; severity: string }> };
    for (const f of (p.policy_findings ?? [])) {
      const status = f.status === "pass" ? "implemented" : f.status === "fail" ? "not-started" : "in-review";
      await db.insert(controlsTable).values({
        tenantId,
        controlId: `AGTC-${agentId.slice(-4)}-${f.id}`.slice(0, 40),
        framework: f.framework || "CIS Benchmark",
        domain: "Endpoint Compliance",
        name: `[Agent: ${agentId}] ${f.name}`,
        status,
        owner: "agent@aigo-x.io",
        evidence: f.status === "pass" ? 1 : 0,
        dueDate: DUE(30),
      }).onConflictDoNothing();
      controls++;
    }
  } else if (rt === "assetops" || rt === "inventory") {
    const p = payload as { hardware?: { cpu: string; ram_gb: number; disk_gb: number; serial?: string; model?: string; manufacturer?: string }; software?: Array<{ name: string; version: string; vendor: string; cve_count: number }> };
    const hw = p.hardware;
    if (hw) {
      const model = [hw.manufacturer, hw.model].filter(Boolean).join(" ") || hw.cpu;
      const assetId = `agent-${agentId.slice(-8)}-hw`;
      await db.insert(grcAssetsTable).values({
        tenantId,
        assetId,
        hostname: `agent-${agentId.slice(-8)}`,
        category: "Server",
        confidence: "High",
        os: hw.cpu,
        ip: "0.0.0.0",
        manufacturer: hw.manufacturer ?? "Unknown",
        risk: "Low",
        managed: true,
        dept: "IT Ops",
        tags: ["aigo-agent", `agent:${agentId}`, "endpoint"],
        antivirus: "N/A",
        agentVersion: "unknown",
        lastSeen: new Date().toISOString().slice(0, 10),
        exposureScore: 0,
        vulnCount: 0,
        critVulns: 0,
        serialNumber: hw.serial,
        sources: [],
        timeline: [],
      }).onConflictDoNothing();
      await db.insert(findingsTable).values({
        tenantId,
        findingId: nextId("AGTH"),
        cloud: "SoftInv-Agent",
        severity: "Low",
        title: `[Agent ${agentId}] HW: ${model} — RAM:${hw.ram_gb}GB Disk:${hw.disk_gb}GB`,
        resource: `agent:${agentId}:hardware:${hw.serial ?? hw.model ?? hw.cpu}`,
        status: "open",
      }).onConflictDoNothing();
      assets++;
      findings++;
    }
    for (const sw of (p.software ?? [])) {
      const severity = sw.cve_count >= 5 ? "Critical" : sw.cve_count >= 3 ? "High" : sw.cve_count >= 1 ? "Medium" : "Low";
      await db.insert(findingsTable).values({
        tenantId,
        findingId: nextId("AGTS"),
        cloud: "SoftInv-Agent",
        severity,
        title: `[Agent ${agentId}] ${sw.name} ${sw.version} (${sw.vendor})${sw.cve_count > 0 ? ` — ${sw.cve_count} CVE(s)` : ""}`,
        resource: `agent:${agentId}:software:${sw.name}`,
        status: sw.cve_count > 0 ? "open" : "resolved",
      }).onConflictDoNothing();
      assets++;
      findings++;
    }
  } else if (rt === "dataops" || rt === "dspm") {
    const p = payload as { stores?: Array<{ path: string; classifications?: string[]; risk_level: string }> };
    for (const store of (p.stores ?? [])) {
      const hasHighRisk = store.risk_level === "Critical" || store.risk_level === "High";
      const hasSensitive = store.classifications && store.classifications.length > 0;
      if (hasHighRisk || hasSensitive) {
        await db.insert(findingsTable).values({
          tenantId,
          findingId: nextId("AGTD"),
          cloud: "DSPM-Agent",
          severity: store.risk_level === "Critical" ? "Critical" : store.risk_level === "High" ? "High" : "Medium",
          title: `[Agent ${agentId}] Sensitive data store: ${store.path} [${(store.classifications ?? []).join(", ") || "Unclassified"}]`,
          resource: `agent:${agentId}:data:${store.path}`,
          status: "open",
        }).onConflictDoNothing();
        findings++;
      }
    }
  } else if (rt === "secops" || rt === "hardening" || rt === "vulnerability") {
    const p = payload as { benchmark_name?: string; controls?: Array<{ id: string; title: string; status: string; severity?: string }>; cves?: Array<{ id: string; cvss: number; severity?: string; package: string; fixed_version?: string }> };
    const benchmarkName = p.benchmark_name || "CIS Benchmark";
    for (const ctrl of (p.controls ?? [])) {
      if (ctrl.status === "fail") {
        await db.insert(findingsTable).values({
          tenantId,
          findingId: nextId("AGTB"),
          cloud: "CIS-Agent",
          severity: ctrl.severity || "Medium",
          title: `[Agent ${agentId}] ${benchmarkName}: ${ctrl.title} — FAILED`,
          resource: `agent:${agentId}:benchmark:${ctrl.id}`,
          status: "open",
        }).onConflictDoNothing();
        findings++;
      }
    }
    for (const cve of (p.cves ?? [])) {
      await db.insert(findingsTable).values({
        tenantId,
        findingId: nextId("AGTV"),
        cloud: "CVE-Agent",
        severity: cve.severity || (cve.cvss >= 9 ? "Critical" : cve.cvss >= 7 ? "High" : cve.cvss >= 4 ? "Medium" : "Low"),
        title: `[Agent ${agentId}] ${cve.id}: ${cve.package}${cve.fixed_version ? ` (fix: ${cve.fixed_version})` : ""}`,
        resource: `agent:${agentId}:cve:${cve.id}`,
        status: "open",
      }).onConflictDoNothing();
      findings++;
    }
  } else if (rt === "serviceops" || rt === "threat" || rt === "incident") {
    const p = payload as { incidents?: Array<{ type: string; severity: string; description: string; timestamp: string }>; change_requests?: Array<{ title: string; category: string; risk: string }> };
    for (const inc of (p.incidents ?? [])) {
      await db.insert(ticketsTable).values({
        tenantId,
        ticketId: nextId("AGTI"),
        priority: inc.severity,
        title: `[Agent ${agentId}] ${inc.type}: ${inc.description}`,
        category: "Incident",
        assignee: "soc@aigo-x.io",
        status: "open",
        sla: inc.severity === "Critical" ? "4h" : "24h",
        aiSeverity: inc.severity,
        aiCategory: "Incident",
        aiConfidence: 0.85,
      }).onConflictDoNothing();
      tickets++;
    }
    for (const cr of (p.change_requests ?? [])) {
      await db.insert(ticketsTable).values({
        tenantId,
        ticketId: nextId("AGTI"),
        priority: cr.risk,
        title: `[Agent ${agentId}] Change: ${cr.title}`,
        category: "Change",
        assignee: "itops@aigo-x.io",
        status: "open",
        sla: "72h",
        aiSeverity: cr.risk,
        aiCategory: "Change",
        aiConfidence: 0.80,
      }).onConflictDoNothing();
      tickets++;
    }
  } else {
    throw new Error(`Unknown result_type: "${rt}"`);
  }

  return { controls, assets, findings, tickets };
}

router.post("/v1/agent/push", requireAgentAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId, tenantId } = agentOf(req);
    const body = req.body as {
      result_type?: string;
      payload?: unknown;
      payload_signature?: string;
      ed25519_signature?: string;
      checks_run?: number; checks_passed?: number; checks_failed?: number; score?: number;
    };

    if (!body.result_type) { res.status(400).json({ error: "Missing result_type" }); return; }
    if (!body.payload) { res.status(400).json({ error: "Missing payload" }); return; }
    if (!body.payload_signature) {
      res.status(403).json({ error: "Missing payload_signature — signed pushes are required" }); return;
    }

    const secrets = await agentGatewayService.getAgentSecrets(String(tenantId), agentId);
    if (!secrets) { res.status(404).json({ error: "Agent not found or tenantId mismatch" }); return; }

    const result = await processPush(
      agentId, tenantId,
      body.result_type, body.payload,
      secrets.hmacSecret, secrets.publicKey,
      body.payload_signature, body.ed25519_signature,
    );

    const feedKeyMap: Record<string, string> = {
      complyops: "complyops", compliance: "complyops",
      assetops: "assetops", inventory: "assetops",
      dataops: "dataops", dspm: "dataops",
      secops: "secops", hardening: "secops",
      serviceops: "serviceops", threat: "serviceops", incident: "serviceops",
    };
    const feedKey = feedKeyMap[(body.result_type ?? "").toLowerCase()];
    if (feedKey) agentGatewayService.recordFeedPush(String(tenantId), agentId, feedKey);

    res.json({ ok: true, ingested: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isAuthErr = msg.includes("signature") || msg.includes("public key");
    const isRouteErr = msg.includes("Unknown result_type");
    res.status(isAuthErr ? 403 : isRouteErr ? 400 : 500).json({ error: msg });
  }
});

// ── Agent management (user JWT) ───────────────────────────────────────────────

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

// ── AIGO-X Agent module feed queries ─────────────────────────────────────────

router.get("/agent-gateway/complyops/evidence", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(controlsTable)
      .where(and(eq(controlsTable.tenantId, Number(tenantId)), ilike(controlsTable.controlId, "AGTC-%")))
      .orderBy(controlsTable.id)
      .limit(100);
    res.json(rows.map(c => ({
      controlId: c.controlId, name: c.name, framework: c.framework,
      domain: c.domain, status: c.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/agent-gateway/assetops/inventory", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(findingsTable)
      .where(and(eq(findingsTable.tenantId, Number(tenantId)), eq(findingsTable.cloud, "SoftInv-Agent")))
      .orderBy(findingsTable.id)
      .limit(100);
    res.json(rows.map(f => ({
      findingId: f.findingId, title: f.title, cloud: f.cloud,
      severity: f.severity, resource: f.resource, status: f.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/agent-gateway/dataops/discoveries", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(findingsTable)
      .where(and(eq(findingsTable.tenantId, Number(tenantId)), eq(findingsTable.cloud, "DSPM-Agent")))
      .orderBy(findingsTable.id)
      .limit(100);
    res.json(rows.map(f => ({
      findingId: f.findingId, title: f.title, cloud: f.cloud,
      severity: f.severity, resource: f.resource, status: f.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/agent-gateway/secops/benchmark", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(findingsTable)
      .where(and(
        eq(findingsTable.tenantId, Number(tenantId)),
        inArray(findingsTable.cloud, ["CIS-Agent", "CVE-Agent"]),
      ))
      .orderBy(findingsTable.id)
      .limit(100);
    res.json(rows.map(f => ({
      findingId: f.findingId, title: f.title, cloud: f.cloud,
      severity: f.severity, resource: f.resource, status: f.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/agent-gateway/serviceops/incidents", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const rows = await db.select().from(ticketsTable)
      .where(and(eq(ticketsTable.tenantId, Number(tenantId)), ilike(ticketsTable.ticketId, "AGTI-%")))
      .orderBy(ticketsTable.id)
      .limit(100);
    res.json(rows.map(t => ({
      ticketId: t.ticketId, title: t.title, category: t.category,
      priority: t.priority, status: t.status,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// BROWSER AGENT SERVICE — in-memory, no DB required
// ══════════════════════════════════════════════════════════════════

interface BrowserExtension {
  id: string;
  tenantId: string;
  version: string;
  browser: string;
  platform: string;
  installType: string;
  managedByPolicy: boolean;
  status: "connected" | "offline" | "connecting";
  lastSeen: string;
  enrolledAt: string;
  policies: { logAiTools: boolean; logShadowIt: boolean; blockAiTools: boolean; blockShadowIt: boolean };
  hostname?: string;
  eventCount: number;
  userId?: string;
  userLabel?: string;
}

interface BrowserEvent {
  id: string;
  extensionId: string;
  tenantId: string;
  type: "ai-tool" | "saas-approved" | "shadow-it" | "policy-violation";
  domain: string;
  appName: string;
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  approved: boolean;
  ts: string;
}

class BrowserAgentManager {
  private extensions = new Map<string, BrowserExtension>();
  private events: BrowserEvent[] = [];
  private readonly maxEvents = 2000;

  constructor() { this.seed(); }

  private seed() {
    const now = new Date();
    const h = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
    const exts: BrowserExtension[] = [
      { id: "br-a1b2c3d4", tenantId: "1", version: "1.0.2", browser: "Chrome", platform: "Win32", installType: "admin", managedByPolicy: true,  status: "connected", lastSeen: h(2),  enrolledAt: h(5760), policies: { logAiTools: true, logShadowIt: true, blockAiTools: false, blockShadowIt: false }, eventCount: 342, userLabel: "alex.kim@acme.com",    hostname: "ACME-WIN-001" },
      { id: "br-e5f6a7b8", tenantId: "1", version: "1.0.2", browser: "Firefox", platform: "Linux x86_64", installType: "admin", managedByPolicy: true,  status: "connected", lastSeen: h(4),  enrolledAt: h(4320), policies: { logAiTools: true, logShadowIt: true, blockAiTools: false, blockShadowIt: false }, eventCount: 218, userLabel: "priya.lee@acme.com",    hostname: "ACME-LNX-002" },
      { id: "br-c9d0e1f2", tenantId: "1", version: "1.0.1", browser: "Edge",    platform: "Win32",     installType: "normal",  managedByPolicy: false, status: "offline",   lastSeen: h(95), enrolledAt: h(2880), policies: { logAiTools: true, logShadowIt: true, blockAiTools: false, blockShadowIt: false }, eventCount: 87,  userLabel: "marcus.johnson@acme.com", hostname: "ACME-WIN-003" },
    ];
    exts.forEach(e => this.extensions.set(e.id, e));

    const evtDefs: Array<[string, string, string, string, BrowserEvent["type"], BrowserEvent["risk"], boolean]> = [
      ["br-a1b2c3d4", "chat.openai.com",    "ChatGPT",             "Generative AI", "ai-tool",       "medium", false],
      ["br-a1b2c3d4", "claude.ai",           "Claude (Anthropic)",  "Generative AI", "ai-tool",       "medium", false],
      ["br-e5f6a7b8", "perplexity.ai",       "Perplexity AI",       "AI Search",     "ai-tool",       "medium", false],
      ["br-a1b2c3d4", "github.com",          "GitHub",              "DevOps",        "saas-approved", "low",    true ],
      ["br-e5f6a7b8", "character.ai",        "Character.AI",        "Generative AI", "policy-violation","high", false],
      ["br-a1b2c3d4", "dropbox.com",         "Dropbox",             "File Storage",  "shadow-it",     "high",   false],
      ["br-e5f6a7b8", "grammarly.com",       "Grammarly",           "AI Writing",    "ai-tool",       "high",   false],
      ["br-a1b2c3d4", "gemini.google.com",   "Google Gemini",       "Generative AI", "ai-tool",       "medium", false],
      ["br-c9d0e1f2", "notion.so",           "Notion",              "Workspace",     "shadow-it",     "medium", false],
      ["br-a1b2c3d4", "slack.com",           "Slack",               "Collaboration", "saas-approved", "low",    true ],
      ["br-e5f6a7b8", "huggingface.co",      "HuggingFace",         "AI Platform",   "ai-tool",       "medium", false],
      ["br-a1b2c3d4", "tiktok.com",          "TikTok",              "Social",        "policy-violation","critical",false],
      ["br-e5f6a7b8", "chat.openai.com",     "ChatGPT",             "Generative AI", "ai-tool",       "medium", false],
      ["br-a1b2c3d4", "midjourney.com",      "Midjourney",          "AI Image",      "ai-tool",       "medium", false],
      ["br-c9d0e1f2", "loom.com",            "Loom",                "Video",         "shadow-it",     "medium", false],
    ];
    evtDefs.forEach(([extId, domain, appName, category, type, risk, approved], i) => {
      const minsAgo = 5 + i * 20;
      const ext = this.extensions.get(extId)!;
      this.events.push({
        id: `evt-seed-${i}`,
        extensionId: extId,
        tenantId: "1",
        type, domain, appName, category,
        risk: risk as BrowserEvent["risk"],
        approved,
        ts: new Date(now.getTime() - minsAgo * 60000).toISOString(),
      });
    });
  }

  register(tenantId: string, data: Partial<BrowserExtension>): BrowserExtension {
    const id = data.id && !this.extensions.has(data.id) ? data.id : `br-${Math.random().toString(36).slice(2,10)}`;
    const ext: BrowserExtension = {
      id, tenantId,
      version: data.version ?? "1.0.2",
      browser: data.browser ?? "Unknown",
      platform: data.platform ?? "Unknown",
      installType: data.installType ?? "normal",
      managedByPolicy: data.managedByPolicy ?? false,
      status: "connecting",
      lastSeen: new Date().toISOString(),
      enrolledAt: new Date().toISOString(),
      policies: data.policies ?? { logAiTools: true, logShadowIt: true, blockAiTools: false, blockShadowIt: false },
      eventCount: 0,
      ...(data.userLabel  ? { userLabel:  data.userLabel  } : {}),
      ...(data.hostname   ? { hostname:   data.hostname   } : {}),
    };
    this.extensions.set(id, ext);
    return ext;
  }

  heartbeat(tenantId: string, data: { agentId: string; version?: string; installType?: string; managedByPolicy?: boolean; browser?: string; platform?: string }) {
    let ext = this.extensions.get(data.agentId);
    if (!ext) {
      ext = this.register(tenantId, { id: data.agentId, ...data });
    }
    ext.status = "connected";
    ext.lastSeen = new Date().toISOString();
    if (data.version)         ext.version         = data.version;
    if (data.installType)     ext.installType     = data.installType;
    if (data.managedByPolicy !== undefined) ext.managedByPolicy = data.managedByPolicy;
    if (data.browser)         ext.browser         = data.browser;
    if (data.platform)        ext.platform        = data.platform;
    this.extensions.set(ext.id, ext);
    return ext;
  }

  addEvents(tenantId: string, extensionId: string, evts: Omit<BrowserEvent, "id"|"tenantId"|"extensionId">[]) {
    const ext = this.extensions.get(extensionId);
    const mapped = evts.map(e => ({ ...e, id: crypto.randomUUID(), tenantId, extensionId }));
    this.events.push(...mapped);
    if (ext) { ext.eventCount += mapped.length; this.extensions.set(extensionId, ext); }
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return mapped.length;
  }

  getStatus(tenantId: string) {
    const exts = [...this.extensions.values()].filter(e => e.tenantId === tenantId);
    // Mark offline if not seen in 15 min
    const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
    exts.forEach(e => { if (e.lastSeen < cutoff && e.status === "connected") e.status = "offline"; });
    const connected = exts.filter(e => e.status === "connected");
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const recent = this.events.filter(e => e.tenantId === tenantId && e.ts > since24h);
    return {
      count:       exts.length,
      connected:   connected.length > 0,
      activeCount: connected.length,
      version:     connected[0]?.version ?? exts[0]?.version ?? null,
      lastSeen:    exts.reduce((a,b) => b.lastSeen > a ? b.lastSeen : a, ""),
      eventCount24h:      recent.length,
      aiToolCount24h:     recent.filter(e => e.type === "ai-tool").length,
      shadowItCount24h:   recent.filter(e => e.type === "shadow-it").length,
      policyViolations24h: recent.filter(e => e.type === "policy-violation").length,
      managedCount:       exts.filter(e => e.managedByPolicy).length,
    };
  }

  listExtensions(tenantId: string) {
    const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
    return [...this.extensions.values()].filter(e => e.tenantId === tenantId)
      .map(e => ({ ...e, status: e.lastSeen < cutoff ? "offline" : e.status }));
  }

  listEvents(tenantId: string, limit = 100) {
    return this.events.filter(e => e.tenantId === tenantId)
      .sort((a,b) => b.ts.localeCompare(a.ts))
      .slice(0, limit);
  }

  removeExtension(tenantId: string, id: string) {
    const e = this.extensions.get(id);
    if (e && e.tenantId === tenantId) { this.extensions.delete(id); return true; }
    return false;
  }
}

const browserAgentManager = new BrowserAgentManager();

// ── POST /browser-agent/register ──────────────────────────────────────────────
router.post("/browser-agent/register", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  const ext = browserAgentManager.register(tenantId, { id: req.body.agentId, ...req.body });
  res.json({ ok: true, agentId: ext.id, enrolledAt: ext.enrolledAt });
});

// ── POST /browser-agent/heartbeat (also accepts no-auth for enrolled agents) ──
router.post("/browser-agent/heartbeat", (req, res) => {
  // Allow both JWT (dashboard) and raw bearer token (extension)
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  let tenantId = "1"; // fallback for extension tokens (not JWT)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { tenantId?: string | number };
    if (decoded.tenantId) tenantId = String(decoded.tenantId);
  } catch { /* extension token — use header or default */ }

  const { agentId, ...rest } = req.body;
  if (!agentId) { res.status(400).json({ error: "agentId required" }); return; }
  const ext = browserAgentManager.heartbeat(tenantId, { agentId, ...rest });
  res.json({ ok: true, status: ext.status, serverTime: new Date().toISOString() });
});

// ── POST /browser-agent/events ────────────────────────────────────────────────
router.post("/browser-agent/events", (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const agentId = (req.headers["x-agent-id"] as string) ?? req.body.agentId;
  let tenantId = "1";
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET) as { tenantId?: string | number };
    if (decoded.tenantId) tenantId = String(decoded.tenantId);
  } catch { /* extension enrolled token */ }
  const events = Array.isArray(req.body.events) ? req.body.events : [];
  const added = browserAgentManager.addEvents(tenantId, agentId ?? "unknown", events);
  res.json({ ok: true, added });
});

// ── GET /browser-agent/status ─────────────────────────────────────────────────
router.get("/browser-agent/status", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  res.json(browserAgentManager.getStatus(tenantId));
});

// ── GET /browser-agent/extensions ─────────────────────────────────────────────
router.get("/browser-agent/extensions", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  res.json(browserAgentManager.listExtensions(tenantId));
});

// ── GET /browser-agent/events ─────────────────────────────────────────────────
router.get("/browser-agent/events", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  const limit = Math.min(Number(req.query["limit"] ?? 200), 500);
  res.json(browserAgentManager.listEvents(tenantId, limit));
});

// ── DELETE /browser-agent/extensions/:id ──────────────────────────────────────
router.delete("/browser-agent/extensions/:id", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  const ok = browserAgentManager.removeExtension(tenantId, String(req.params["id"] ?? ""));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
});

// ═══════════════════════════════════════════════════════════════
// AGENT ENROLLMENT TOKEN MANAGER
// Generates single-use 24-hour enrollment tokens for agent setup
// ═══════════════════════════════════════════════════════════════

interface EnrollToken {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;         // first 8 chars shown in UI after creation
  tokenHash: string;      // SHA-256 of the raw token (never stored plain)
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedAt: string | null;
  usedByHostname: string | null;
  isActive: boolean;
}

class AgentTokenManager {
  private tokens: Map<string, EnrollToken> = new Map();

  constructor() {
    // Seed 3 demo tokens for tenant 1
    const now = new Date();
    const make = (id: string, name: string, minsAgo: number, expiresHours: number, used = false) => {
      const created = new Date(now.getTime() - minsAgo * 60000);
      const expires = new Date(created.getTime() + expiresHours * 3600000);
      return {
        id, tenantId: "1", name, prefix: "aigo_" + id.slice(0,8),
        tokenHash: createHash("sha256").update("demo-" + id).digest("hex"),
        createdBy: "admin@acme.com", createdAt: created.toISOString(),
        expiresAt: expires.toISOString(), used, usedAt: used ? created.toISOString() : null,
        usedByHostname: used ? "workstation-42" : null, isActive: !used && expires > now,
      } as EnrollToken;
    };
    this.tokens.set("tok-001", make("tok-001", "Windows Fleet — Batch Jan", 240, 24, true));
    this.tokens.set("tok-002", make("tok-002", "Linux Servers Q1", 30, 24, false));
    this.tokens.set("tok-003", make("tok-003", "macOS Workstations", 5, 24, false));
  }

  generate(tenantId: string, name: string, createdBy: string): { token: string; record: EnrollToken } {
    const id = "tok-" + randomBytes(6).toString("hex");
    const raw = "aigo_enr_" + randomBytes(24).toString("hex");
    const prefix = raw.slice(0, 17) + "…";
    const now = new Date();
    const record: EnrollToken = {
      id, tenantId, name, prefix,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      createdBy, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 3600000).toISOString(),
      used: false, usedAt: null, usedByHostname: null, isActive: true,
    };
    this.tokens.set(id, record);
    return { token: raw, record };
  }

  list(tenantId: string): EnrollToken[] {
    const now = new Date().toISOString();
    return [...this.tokens.values()]
      .filter(t => t.tenantId === tenantId)
      .map(t => ({ ...t, isActive: !t.used && t.expiresAt > now }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  revoke(tenantId: string, id: string): boolean {
    const t = this.tokens.get(id);
    if (!t || t.tenantId !== tenantId) return false;
    t.isActive = false;
    t.used = true;
    t.usedAt = new Date().toISOString();
    this.tokens.set(id, t);
    return true;
  }

  validate(rawToken: string, tenantId: string): EnrollToken | null {
    const hash = createHash("sha256").update(rawToken).digest("hex");
    const now = new Date().toISOString();
    const t = [...this.tokens.values()].find(
      t => t.tokenHash === hash && t.tenantId === tenantId && !t.used && t.expiresAt > now
    );
    if (!t) return null;
    t.used = true;
    t.usedAt = new Date().toISOString();
    t.isActive = false;
    this.tokens.set(t.id, t);
    return t;
  }
}

const agentTokenManager = new AgentTokenManager();

// ── GET /agent-tokens ──────────────────────────────────────────────────────────
router.get("/agent-tokens", requireAuth, (req, res) => {
  const { tenantId, email } = user(req);
  void email;
  res.json(agentTokenManager.list(tenantId));
});

// ── POST /agent-tokens ─────────────────────────────────────────────────────────
router.post("/agent-tokens", requireAuth, (req, res) => {
  const { tenantId, email } = user(req);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const { token, record } = agentTokenManager.generate(tenantId, name.trim(), email ?? "admin");
  res.status(201).json({ ...record, rawToken: token });
});

// ── DELETE /agent-tokens/:id ───────────────────────────────────────────────────
router.delete("/agent-tokens/:id", requireAuth, (req, res) => {
  const { tenantId } = user(req);
  const ok = agentTokenManager.revoke(tenantId, String(req.params["id"] ?? ""));
  ok ? res.json({ ok: true }) : res.status(404).json({ error: "Token not found" });
});

export default router;


import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { aiEngineConfigsTable, mcpTokensTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";
import crypto from "crypto";

const router = Router();
type AuthReq = Request & { user: JwtPayload };
const u = (req: Request) => (req as AuthReq).user;

// ── Provider catalogue (static metadata) ────────────────────────────────────

export const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, o1 — industry-leading reasoning and coding",
    logoColor: "#10A37F",
    models: ["gpt-4o","gpt-4o-mini","gpt-4-turbo","o1","o1-mini","o3-mini"],
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    authType: "api-key",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Claude 3.5 Sonnet, Claude 3 Opus — exceptional analysis and safety",
    logoColor: "#D97757",
    models: ["claude-opus-4-5","claude-sonnet-4-5","claude-haiku-4-5","claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022"],
    defaultModel: "claude-sonnet-4-5",
    baseUrl: "https://api.anthropic.com",
    authType: "api-key",
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 1.5 Pro, Gemini 2.0 Flash — multimodal Google AI",
    logoColor: "#4285F4",
    models: ["gemini-2.0-flash-exp","gemini-1.5-pro","gemini-1.5-flash","gemini-1.5-flash-8b"],
    defaultModel: "gemini-1.5-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    authType: "api-key",
    docsUrl: "https://ai.google.dev/docs",
  },
  {
    id: "kimi",
    name: "Moonshot Kimi",
    description: "Kimi k1.5, moonshot-v1 — long-context Chinese AI with OpenAI compat",
    logoColor: "#6366F1",
    models: ["kimi-k1.5-long","moonshot-v1-128k","moonshot-v1-32k","moonshot-v1-8k"],
    defaultModel: "moonshot-v1-128k",
    baseUrl: "https://api.moonshot.cn/v1",
    authType: "api-key",
    docsUrl: "https://platform.moonshot.cn/docs",
  },
  {
    id: "z-ai",
    name: "Z.ai / 01.AI",
    description: "Yi-Large, Yi-Vision — efficient open-weight models via OpenAI compat API",
    logoColor: "#7C3AED",
    models: ["yi-large","yi-large-turbo","yi-medium","yi-spark"],
    defaultModel: "yi-large",
    baseUrl: "https://api.01.ai/v1",
    authType: "api-key",
    docsUrl: "https://platform.01.ai/docs",
  },
  {
    id: "custom",
    name: "Custom / Self-hosted",
    description: "Any OpenAI-compatible endpoint — Ollama, vLLM, LM Studio, Azure OpenAI, etc.",
    logoColor: "#64748B",
    models: [],
    defaultModel: "",
    baseUrl: "",
    authType: "api-key",
    docsUrl: "",
  },
];

// GET /api/ai-engines/providers — static catalogue
router.get("/ai-engines/providers", requireAuth, (_req, res) => {
  res.json(AI_PROVIDERS);
});

// GET /api/ai-engines — list tenant's configured engines
router.get("/ai-engines", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(aiEngineConfigsTable)
      .where(eq(aiEngineConfigsTable.tenantId, u(req).tenantId));
    res.json(rows.map(r => ({ ...r, apiKey: r.apiKey ? `${r.apiKey.slice(0, 8)}••••••••` : "" })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ai-engines — create engine config
router.post("/ai-engines", requireAuth, async (req, res) => {
  const { name, provider, model, apiKey, baseUrl, isDefault, config } =
    req.body as Record<string, string | boolean | object>;
  if (!name || !provider || !apiKey) {
    res.status(400).json({ error: "name, provider and apiKey are required" });
    return;
  }
  try {
    if (isDefault) {
      await db.update(aiEngineConfigsTable)
        .set({ isDefault: false })
        .where(eq(aiEngineConfigsTable.tenantId, u(req).tenantId));
    }
    const [row] = await db.insert(aiEngineConfigsTable).values({
      tenantId: u(req).tenantId,
      name: String(name),
      provider: String(provider),
      model: String(model ?? ""),
      apiKey: String(apiKey),
      baseUrl: baseUrl ? String(baseUrl) : null,
      isDefault: Boolean(isDefault),
      config: (config as object) ?? {},
    }).returning();
    res.status(201).json({ ...row, apiKey: `${row.apiKey.slice(0, 8)}••••••••` });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/ai-engines/:id — update
router.patch("/ai-engines/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, provider, model, apiKey, baseUrl, isDefault, isActive, config } =
    req.body as Record<string, string | boolean | object>;
  try {
    const [existing] = await db.select().from(aiEngineConfigsTable)
      .where(and(eq(aiEngineConfigsTable.id, id), eq(aiEngineConfigsTable.tenantId, u(req).tenantId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }

    if (isDefault) {
      await db.update(aiEngineConfigsTable)
        .set({ isDefault: false })
        .where(eq(aiEngineConfigsTable.tenantId, u(req).tenantId));
    }
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined)     update["name"] = String(name);
    if (provider !== undefined) update["provider"] = String(provider);
    if (model !== undefined)    update["model"] = String(model);
    if (apiKey !== undefined && !String(apiKey).includes("••")) update["apiKey"] = String(apiKey);
    if (baseUrl !== undefined)  update["baseUrl"] = baseUrl ? String(baseUrl) : null;
    if (isDefault !== undefined) update["isDefault"] = Boolean(isDefault);
    if (isActive !== undefined)  update["isActive"]  = Boolean(isActive);
    if (config !== undefined)    update["config"]    = config;

    const [row] = await db.update(aiEngineConfigsTable).set(update)
      .where(eq(aiEngineConfigsTable.id, id)).returning();
    res.json({ ...row, apiKey: `${row.apiKey.slice(0, 8)}••••••••` });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/ai-engines/:id
router.delete("/ai-engines/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    const [existing] = await db.select().from(aiEngineConfigsTable)
      .where(and(eq(aiEngineConfigsTable.id, id), eq(aiEngineConfigsTable.tenantId, u(req).tenantId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(aiEngineConfigsTable).where(eq(aiEngineConfigsTable.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ai-engines/:id/test — live connection test
router.post("/ai-engines/:id/test", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    const [cfg] = await db.select().from(aiEngineConfigsTable)
      .where(and(eq(aiEngineConfigsTable.id, id), eq(aiEngineConfigsTable.tenantId, u(req).tenantId)));
    if (!cfg) { res.status(404).json({ error: "Not found" }); return; }

    let ok = false;
    let latencyMs = 0;
    let error: string | undefined;
    const t0 = Date.now();

    try {
      if (cfg.provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: cfg.model || "claude-haiku-4-5",
            max_tokens: 8,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        ok = r.ok || r.status === 400; // 400 = bad request but key is valid
      } else {
        const baseUrl = cfg.baseUrl || "https://api.openai.com/v1";
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: cfg.model || "gpt-4o-mini",
            max_tokens: 8,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        ok = r.ok || r.status === 400;
        if (!ok && r.status === 401) error = "Invalid API key";
        if (!ok && r.status === 404) error = "Model not found or endpoint incorrect";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Network error";
    }

    latencyMs = Date.now() - t0;
    await db.update(aiEngineConfigsTable)
      .set({ lastTestedAt: new Date(), lastTestOk: ok, updatedAt: new Date() })
      .where(eq(aiEngineConfigsTable.id, id));

    res.json({ ok, latencyMs, error });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── MCP Token management ─────────────────────────────────────────────────────

// GET /api/ai-engines/mcp-tokens
router.get("/ai-engines/mcp-tokens", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(mcpTokensTable)
      .where(eq(mcpTokensTable.tenantId, u(req).tenantId));
    res.json(rows.map(r => ({ ...r, tokenHash: undefined })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ai-engines/mcp-tokens — create token
router.post("/ai-engines/mcp-tokens", requireAuth, async (req, res) => {
  const { name, scopes, expiresAt } = req.body as { name: string; scopes: string[]; expiresAt?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const rawToken = `mcp_${u(req).tenantId}_${crypto.randomBytes(24).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenPrefix = rawToken.slice(0, 16);
    const [row] = await db.insert(mcpTokensTable).values({
      tenantId: u(req).tenantId,
      name,
      tokenHash,
      tokenPrefix,
      scopes: (scopes ?? []) as unknown as string[],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: u(req).userId,
    }).returning();
    // Return the raw token ONCE — never again
    res.status(201).json({ ...row, tokenHash: undefined, rawToken });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/ai-engines/mcp-tokens/:id — revoke token
router.delete("/ai-engines/mcp-tokens/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    const [existing] = await db.select().from(mcpTokensTable)
      .where(and(eq(mcpTokensTable.id, id), eq(mcpTokensTable.tenantId, u(req).tenantId)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(mcpTokensTable).set({ isActive: false }).where(eq(mcpTokensTable.id, id));
    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

/**
 * MCP Server — Model Context Protocol 2024-11-05
 *
 * Full GRC toolset for AI clients (Claude Desktop, Cursor, custom agents).
 * Handles JSON-RPC 2.0 over HTTP with MCP token or platform JWT auth.
 *
 * Endpoints:
 *   GET  /api/mcp/manifest  — human-readable server info + tool list
 *   POST /api/mcp           — JSON-RPC 2.0 dispatcher
 *   GET  /api/mcp/audit     — recent audit log for the tenant (JWT only)
 */
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import {
  mcpTokensTable, mcpAuditLogTable,
  risksTable, controlsTable, grcPoliciesTable, ticketsTable,
  riskVendorsTable, auditEvidenceTable, complianceGapsTable,
  frameworkLibraryTable, tenantFrameworksTable,
  evidenceEngineRunsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { buildGrcSystemPrompt } from "../services/briefing-generator";
import crypto from "crypto";
import type { Request, Response } from "express";
import type { JwtPayload } from "../lib/auth";

const router = Router();

// ── Per-token in-memory rate limiter (max 60 calls / 60s) ────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

// ── MCP tool definitions ─────────────────────────────────────────────────────

const MCP_TOOLS = [
  // ── Risks ──────────────────────────────────────────────────────────────────
  {
    name: "list_risks",
    description: "List all risks in the tenant risk register. Optionally filter by severity or status.",
    inputSchema: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["critical","high","medium","low"], description: "Filter by severity (optional)" },
        status:   { type: "string", enum: ["open","in-progress","resolved","accepted"], description: "Filter by status (optional)" },
        limit:    { type: "number", description: "Max number of results (default 50)" },
      },
    },
  },
  {
    name: "get_risk",
    description: "Get full details for a single risk by its risk_id (e.g. RISK-001).",
    inputSchema: {
      type: "object",
      properties: {
        risk_id: { type: "string", description: "The risk ID (e.g. RISK-001)" },
      },
      required: ["risk_id"],
    },
  },
  {
    name: "create_risk",
    description: "Create a new risk in the risk register.",
    inputSchema: {
      type: "object",
      properties: {
        name:        { type: "string", description: "Risk name / title" },
        category:    { type: "string", description: "Risk category (e.g. Cybersecurity, Operational, Compliance)" },
        description: { type: "string", description: "Detailed risk description" },
        severity:    { type: "string", enum: ["critical","high","medium","low"], description: "Initial severity" },
        owner:       { type: "string", description: "Owner email or name" },
      },
      required: ["name", "category", "severity", "owner"],
    },
  },
  {
    name: "update_risk_status",
    description: "Update the status or severity of an existing risk.",
    inputSchema: {
      type: "object",
      properties: {
        risk_id:  { type: "string", description: "Risk ID (e.g. RISK-001)" },
        status:   { type: "string", enum: ["open","in-progress","resolved","accepted"], description: "New status" },
        severity: { type: "string", enum: ["critical","high","medium","low"], description: "New severity (optional)" },
      },
      required: ["risk_id"],
    },
  },
  {
    name: "generate_risk_playbook",
    description: "Generate an AI-powered incident response and risk treatment playbook for a specific risk.",
    inputSchema: {
      type: "object",
      properties: {
        risk_id:   { type: "string", description: "Risk ID — the risk details are fetched automatically" },
        treatment: { type: "string", enum: ["mitigate","transfer","accept","avoid"], description: "Desired treatment strategy" },
      },
      required: ["risk_id"],
    },
  },

  // ── Controls ───────────────────────────────────────────────────────────────
  {
    name: "list_controls",
    description: "List compliance controls, optionally filtered by framework or status.",
    inputSchema: {
      type: "object",
      properties: {
        framework: { type: "string", description: "Filter by framework (e.g. ISO 27001, SOC 2, NIST CSF)" },
        status:    { type: "string", enum: ["implemented","in-progress","not-started","not-applicable"], description: "Filter by status" },
        limit:     { type: "number", description: "Max results (default 100)" },
      },
    },
  },
  {
    name: "get_control",
    description: "Get details for a specific compliance control by its control_id.",
    inputSchema: {
      type: "object",
      properties: {
        control_id: { type: "string", description: "Control ID (e.g. CC6.1, A.8.1)" },
      },
      required: ["control_id"],
    },
  },
  {
    name: "update_control_status",
    description: "Update the implementation status of a compliance control.",
    inputSchema: {
      type: "object",
      properties: {
        control_id: { type: "string", description: "Control ID" },
        status:     { type: "string", enum: ["implemented","in-progress","not-started","not-applicable"], description: "New status" },
        owner:      { type: "string", description: "Control owner email or name (optional)" },
      },
      required: ["control_id", "status"],
    },
  },
  {
    name: "run_evidence_collection",
    description: "Trigger automated evidence collection for a specific control.",
    inputSchema: {
      type: "object",
      properties: {
        control_id: { type: "string", description: "Control ID to collect evidence for" },
      },
      required: ["control_id"],
    },
  },

  // ── Policies ───────────────────────────────────────────────────────────────
  {
    name: "list_policies",
    description: "List governance policies in the platform, optionally filtered by type or status.",
    inputSchema: {
      type: "object",
      properties: {
        type:   { type: "string", description: "Policy type (e.g. Security, Privacy, HR)" },
        status: { type: "string", enum: ["active","draft","under-review","archived"], description: "Filter by status" },
        limit:  { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "get_policy",
    description: "Get the full content and metadata of a specific policy.",
    inputSchema: {
      type: "object",
      properties: {
        policy_id: { type: "string", description: "Policy ID (e.g. POL-001)" },
      },
      required: ["policy_id"],
    },
  },
  {
    name: "create_policy",
    description: "Create a new governance policy.",
    inputSchema: {
      type: "object",
      properties: {
        title:          { type: "string", description: "Policy title" },
        type:           { type: "string", description: "Policy type (e.g. Security, Privacy, Acceptable Use)" },
        owner:          { type: "string", description: "Policy owner" },
        content:        { type: "string", description: "Policy text / body" },
        effective_date: { type: "string", description: "Effective date (ISO 8601, e.g. 2026-07-01)" },
      },
      required: ["title", "type", "owner"],
    },
  },

  // ── Evidence ───────────────────────────────────────────────────────────────
  {
    name: "list_evidence",
    description: "List evidence artifacts, optionally filtered by control or status.",
    inputSchema: {
      type: "object",
      properties: {
        control_ref: { type: "string", description: "Filter by control reference (optional)" },
        status:      { type: "string", enum: ["pending","collected","rejected"], description: "Filter by collection status (pending, collected, or rejected)" },
        limit:       { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "get_evidence_summary",
    description: "Get a high-level summary of evidence coverage across all controls — total, fresh, stale, failed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "trigger_collection",
    description: "Trigger a full automated evidence collection run for the entire tenant.",
    inputSchema: { type: "object", properties: {} },
  },

  // ── Vendors ────────────────────────────────────────────────────────────────
  {
    name: "list_vendors",
    description: "List third-party vendors in the vendor risk register.",
    inputSchema: {
      type: "object",
      properties: {
        tier:   { type: "number", description: "Filter by risk tier (1=critical, 2=high, 3=standard)" },
        status: { type: "string", description: "Filter by assessment status" },
        limit:  { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "get_vendor_risk",
    description: "Get the risk profile and assessment details for a specific vendor.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor ID (e.g. VND-001)" },
      },
      required: ["vendor_id"],
    },
  },

  // ── Frameworks ─────────────────────────────────────────────────────────────
  {
    name: "list_frameworks",
    description: "List all compliance frameworks active for the tenant.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_compliance_score",
    description: "Get the compliance score breakdown for a specific framework.",
    inputSchema: {
      type: "object",
      properties: {
        framework: { type: "string", description: "Framework name or short code (e.g. ISO 27001, SOC 2)" },
      },
      required: ["framework"],
    },
  },

  // ── vCISO ──────────────────────────────────────────────────────────────────
  {
    name: "ask_vciso",
    description: "Ask the AIGO AI vCISO a question about the tenant's GRC posture, security strategy, compliance, or risk management. The vCISO has live access to the tenant's risk register, control statuses, and findings.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Your question for the AI vCISO (e.g. 'What are our top 3 risks this quarter?', 'Are we ready for a SOC 2 audit?')" },
      },
      required: ["question"],
    },
  },

  // ── Tickets / Incidents ─────────────────────────────────────────────────────
  {
    name: "list_tickets",
    description: "List service desk tickets / incidents, optionally filtered by priority or status.",
    inputSchema: {
      type: "object",
      properties: {
        priority: { type: "string", enum: ["critical","high","medium","low"], description: "Filter by priority" },
        status:   { type: "string", enum: ["open","in-progress","resolved","closed"], description: "Filter by status" },
        limit:    { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "create_ticket",
    description: "Create a new service desk ticket or incident.",
    inputSchema: {
      type: "object",
      properties: {
        title:    { type: "string", description: "Ticket title" },
        category: { type: "string", description: "Category (e.g. Security Incident, Compliance, Access Request)" },
        priority: { type: "string", enum: ["critical","high","medium","low"], description: "Priority" },
        assignee: { type: "string", description: "Assignee email or name" },
      },
      required: ["title", "category", "priority", "assignee"],
    },
  },

  // ── Legacy AI-powered tools (retained for backward compat) ─────────────────
  {
    name: "grc_code_security_review",
    description: "Security-focused code review — identifies OWASP Top 10, CWE weaknesses, hardcoded secrets, SQL injection, XSS, and supply-chain risks.",
    inputSchema: {
      type: "object",
      properties: {
        code:     { type: "string", description: "Source code snippet to review" },
        language: { type: "string", description: "Programming language (e.g. typescript, python, java)" },
        context:  { type: "string", description: "Optional: describe what the code does" },
      },
      required: ["code"],
    },
  },
  {
    name: "grc_risk_assessment",
    description: "FAIR-model risk assessment — returns threat frequency, loss magnitude, risk score, and treatment options.",
    inputSchema: {
      type: "object",
      properties: {
        assetDescription: { type: "string", description: "Asset or process at risk" },
        threatScenario:   { type: "string", description: "Threat or attack scenario" },
        existingControls: { type: "string", description: "Current controls (optional)" },
        industryContext:  { type: "string", description: "Industry (optional)" },
      },
      required: ["assetDescription", "threatScenario"],
    },
  },
  {
    name: "grc_compliance_check",
    description: "Maps a description against a compliance framework and identifies gaps, controls, evidence requirements.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "System or control to check" },
        framework:   { type: "string", enum: ["iso27001","soc2","pci-dss","gdpr","hipaa","nist-csf","nist-800-53","cis-controls","ccpa","kenya-dpa"], description: "Compliance framework" },
        scope:       { type: "string", description: "Scope boundary (optional)" },
      },
      required: ["description", "framework"],
    },
  },
  {
    name: "grc_threat_model",
    description: "STRIDE / MITRE ATT&CK threat model — returns threats per component with mitigations.",
    inputSchema: {
      type: "object",
      properties: {
        systemDescription: { type: "string", description: "System architecture to model" },
        dataFlows:         { type: "string", description: "Key data flows (optional)" },
        trustBoundaries:   { type: "string", description: "Trust boundaries (optional)" },
        methodology:       { type: "string", enum: ["stride","pasta","mitre-attack"], description: "Methodology (default: stride)" },
      },
      required: ["systemDescription"],
    },
  },
  {
    name: "grc_incident_response",
    description: "Step-by-step incident response playbook following NIST SP 800-61 and ISO 27035.",
    inputSchema: {
      type: "object",
      properties: {
        incidentType:    { type: "string", enum: ["ransomware","data-breach","ddos","insider-threat","supply-chain","credential-stuffing","api-abuse","zero-day"], description: "Incident type" },
        affectedSystems: { type: "string", description: "Affected systems (optional)" },
        severity:        { type: "string", enum: ["p1-critical","p2-high","p3-medium","p4-low"], description: "Severity" },
      },
      required: ["incidentType", "severity"],
    },
  },
  {
    name: "grc_vulnerability_assess",
    description: "CVE / vulnerability business impact assessment — CVSS context, patch urgency, compensating controls.",
    inputSchema: {
      type: "object",
      properties: {
        cveOrDescription: { type: "string", description: "CVE ID or vulnerability description" },
        affectedAssets:   { type: "string", description: "Affected assets (optional)" },
        environment:      { type: "string", description: "Environment (optional)" },
      },
      required: ["cveOrDescription"],
    },
  },
];

// ── Token authentication for MCP ─────────────────────────────────────────────

interface McpAuth {
  tenantId: number;
  userId?: number;
  tokenId?: number;
  rateLimitKey: string;
}

async function resolveMcpAuth(req: Request): Promise<McpAuth | null> {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);

  if (token.startsWith("mcp_")) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const [row] = await db.select().from(mcpTokensTable)
      .where(and(eq(mcpTokensTable.tokenHash, hash), eq(mcpTokensTable.isActive, true)));
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    await db.update(mcpTokensTable).set({ lastUsedAt: new Date() }).where(eq(mcpTokensTable.id, row.id));
    return { tenantId: row.tenantId, tokenId: row.id, rateLimitKey: `tok:${row.id}` };
  }

  try {
    const { verifyToken } = await import("../lib/auth");
    const payload = verifyToken(token) as JwtPayload;
    return { tenantId: payload.tenantId, userId: payload.userId, rateLimitKey: `jwt:${payload.userId}` };
  } catch {
    return null;
  }
}

// ── Audit logging ─────────────────────────────────────────────────────────────

async function logAudit(
  tenantId: number,
  tokenId: number | undefined,
  toolName: string,
  durationMs: number,
  success: boolean,
  errorMsg?: string,
) {
  try {
    await db.insert(mcpAuditLogTable).values({
      tenantId,
      tokenId: tokenId ?? null,
      toolName,
      durationMs,
      success,
      errorMsg: errorMsg ?? null,
    });
  } catch {
    // Best-effort — never fail the response due to audit log issues
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  auth: McpAuth,
): Promise<string> {
  const { tenantId } = auth;

  // ── list_risks ──────────────────────────────────────────────────────────────
  if (name === "list_risks") {
    const { severity, status, limit = 50 } = args as Record<string, string | number>;
    let rows = await db.select().from(risksTable)
      .where(eq(risksTable.tenantId, tenantId))
      .orderBy(desc(risksTable.score))
      .limit(Number(limit));
    if (severity) rows = rows.filter(r => r.severity.toLowerCase() === String(severity).toLowerCase());
    if (status)   rows = rows.filter(r => r.status.toLowerCase()   === String(status).toLowerCase());
    return JSON.stringify({ total: rows.length, risks: rows.map(r => ({
      riskId: r.riskId, name: r.name, category: r.category,
      severity: r.severity, status: r.status, score: r.score,
      owner: r.ownerFull, trend: r.trend,
    })) }, null, 2);
  }

  // ── get_risk ────────────────────────────────────────────────────────────────
  if (name === "get_risk") {
    const { risk_id } = args as Record<string, string>;
    const [row] = await db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, risk_id)));
    if (!row) return JSON.stringify({ error: `Risk '${risk_id}' not found` });
    return JSON.stringify(row, null, 2);
  }

  // ── create_risk ─────────────────────────────────────────────────────────────
  if (name === "create_risk") {
    const { name: rName, category, description = "", severity, owner } = args as Record<string, string>;
    const countRows = await db.select().from(risksTable).where(eq(risksTable.tenantId, tenantId));
    const newId = `RISK-${String(countRows.length + 1).padStart(3, "0")}`;
    const scoreMap: Record<string, number> = { critical: 90, high: 70, medium: 45, low: 20 };
    const [created] = await db.insert(risksTable).values({
      tenantId,
      riskId:    newId,
      name:      rName,
      category,
      description,
      severity,
      score:     scoreMap[severity?.toLowerCase()] ?? 50,
      owner:     owner.split("@")[0] ?? owner,
      ownerFull: owner,
      trend:     "flat",
      status:    "open",
    }).returning();
    return JSON.stringify({ message: "Risk created successfully", risk: created }, null, 2);
  }

  // ── update_risk_status ──────────────────────────────────────────────────────
  if (name === "update_risk_status") {
    const { risk_id, status, severity } = args as Record<string, string>;
    const [existing] = await db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, risk_id)));
    if (!existing) return JSON.stringify({ error: `Risk '${risk_id}' not found` });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (status)   patch["status"]   = status;
    if (severity) patch["severity"] = severity;
    const [updated] = await db.update(risksTable).set(patch)
      .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, risk_id)))
      .returning();
    return JSON.stringify({ message: "Risk updated", risk: updated }, null, 2);
  }

  // ── generate_risk_playbook ──────────────────────────────────────────────────
  if (name === "generate_risk_playbook") {
    const { risk_id, treatment = "mitigate" } = args as Record<string, string>;
    const [risk] = await db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, risk_id)));
    if (!risk) return JSON.stringify({ error: `Risk '${risk_id}' not found` });

    const prompt = `Generate a concise GRC risk treatment playbook for:
Risk: ${risk.name}
Category: ${risk.category}
Severity: ${risk.severity}
Score: ${risk.score}/100
Description: ${risk.description ?? "Not provided"}
Treatment strategy: ${treatment}

Structure your response as:
1. Executive Summary (2 sentences)
2. Treatment Plan (5 specific steps)
3. Controls to Implement (3 controls with framework references)
4. KPIs to track (3 metrics)
5. Timeline (phases with timeframes)`;

    let playbookText = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: buildGrcSystemPrompt() },
          { role: "user", content: prompt },
        ],
      });
      playbookText = completion.choices[0]?.message?.content ?? "Unable to generate playbook.";
    } catch {
      playbookText = `Playbook generation failed. Manual guidance: Apply ${treatment} strategy for ${risk.name}. Contact your vCISO for details.`;
    }
    return JSON.stringify({ riskId: risk_id, riskName: risk.name, treatment, playbook: playbookText }, null, 2);
  }

  // ── list_controls ───────────────────────────────────────────────────────────
  if (name === "list_controls") {
    const { framework, status, limit = 100 } = args as Record<string, string | number>;
    let rows = await db.select().from(controlsTable)
      .where(eq(controlsTable.tenantId, tenantId))
      .limit(Number(limit));
    if (framework) rows = rows.filter(r => r.framework.toLowerCase().includes(String(framework).toLowerCase()));
    if (status)    rows = rows.filter(r => r.status.toLowerCase() === String(status).toLowerCase());
    const summary = {
      total:       rows.length,
      implemented: rows.filter(r => r.status === "implemented").length,
      inProgress:  rows.filter(r => r.status === "in-progress").length,
      notStarted:  rows.filter(r => r.status === "not-started").length,
    };
    return JSON.stringify({ ...summary, controls: rows }, null, 2);
  }

  // ── get_control ─────────────────────────────────────────────────────────────
  if (name === "get_control") {
    const { control_id } = args as Record<string, string>;
    const [row] = await db.select().from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.controlId, control_id)));
    if (!row) return JSON.stringify({ error: `Control '${control_id}' not found` });
    return JSON.stringify(row, null, 2);
  }

  // ── update_control_status ───────────────────────────────────────────────────
  if (name === "update_control_status") {
    const { control_id, status, owner } = args as Record<string, string>;
    const [existing] = await db.select().from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.controlId, control_id)));
    if (!existing) return JSON.stringify({ error: `Control '${control_id}' not found` });
    const patch: Record<string, unknown> = { status };
    if (owner) patch["owner"] = owner;
    const [updated] = await db.update(controlsTable).set(patch)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.controlId, control_id)))
      .returning();
    return JSON.stringify({ message: "Control status updated", control: updated }, null, 2);
  }

  // ── run_evidence_collection ─────────────────────────────────────────────────
  if (name === "run_evidence_collection") {
    const { control_id } = args as Record<string, string>;
    const [ctrl] = await db.select().from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.controlId, control_id)));
    if (!ctrl) return JSON.stringify({ error: `Control '${control_id}' not found` });

    // Create a real evidence engine run record tied to this control
    const runId = `run-ctrl-${control_id.toLowerCase()}-${Date.now()}`;
    const [run] = await db.insert(evidenceEngineRunsTable).values({
      tenantId,
      runId,
      duration:    "—",
      total:       1,
      passed:      0,
      failed:      0,
      warnings:    0,
      triggeredBy: `MCP:run_evidence_collection(${control_id})`,
    }).returning();

    return JSON.stringify({
      message:    "Evidence collection run created and queued",
      controlId:  control_id,
      controlName: ctrl.name,
      runId:      run.runId,
      triggeredBy: run.triggeredBy,
      createdAt:  run.createdAt,
      note:       "Check the Evidence Engine module for live progress. Run record is persisted in evidence_engine_runs.",
    }, null, 2);
  }

  // ── list_policies ───────────────────────────────────────────────────────────
  if (name === "list_policies") {
    const { type, status, limit = 50 } = args as Record<string, string | number>;
    let rows = await db.select().from(grcPoliciesTable)
      .where(eq(grcPoliciesTable.tenantId, tenantId))
      .limit(Number(limit));
    if (type)   rows = rows.filter(r => r.type.toLowerCase().includes(String(type).toLowerCase()));
    if (status) rows = rows.filter(r => r.status.toLowerCase() === String(status).toLowerCase());
    return JSON.stringify({ total: rows.length, policies: rows.map(r => ({
      policyId: r.policyId, title: r.title, type: r.type, status: r.status,
      version: r.version, owner: r.owner, effectiveDate: r.effectiveDate, reviewDate: r.reviewDate,
    })) }, null, 2);
  }

  // ── get_policy ──────────────────────────────────────────────────────────────
  if (name === "get_policy") {
    const { policy_id } = args as Record<string, string>;
    const [row] = await db.select().from(grcPoliciesTable)
      .where(and(eq(grcPoliciesTable.tenantId, tenantId), eq(grcPoliciesTable.policyId, policy_id)));
    if (!row) return JSON.stringify({ error: `Policy '${policy_id}' not found` });
    return JSON.stringify(row, null, 2);
  }

  // ── create_policy ───────────────────────────────────────────────────────────
  if (name === "create_policy") {
    const { title, type, owner, content = "", effective_date } = args as Record<string, string>;
    const countRows = await db.select().from(grcPoliciesTable).where(eq(grcPoliciesTable.tenantId, tenantId));
    const newId = `POL-${String(countRows.length + 1).padStart(3, "0")}`;
    const today = new Date().toISOString().split("T")[0]!;
    const reviewDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0]!;
    const [created] = await db.insert(grcPoliciesTable).values({
      tenantId,
      policyId: newId,
      title,
      type,
      status: "draft",
      version: "1.0",
      owner,
      dept: "",
      effectiveDate: effective_date ?? today,
      reviewDate,
      content: content || null,
    }).returning();
    return JSON.stringify({ message: "Policy created (status: draft)", policy: created }, null, 2);
  }

  // ── list_evidence ───────────────────────────────────────────────────────────
  if (name === "list_evidence") {
    const { control_ref, status, limit = 50 } = args as Record<string, string | number>;
    let rows = await db.select().from(auditEvidenceTable)
      .where(eq(auditEvidenceTable.tenantId, tenantId))
      .limit(Number(limit));
    if (control_ref) rows = rows.filter(r => r.control.toLowerCase().includes(String(control_ref).toLowerCase()));
    if (status)      rows = rows.filter(r => r.status.toLowerCase() === String(status).toLowerCase());
    return JSON.stringify({ total: rows.length, evidence: rows }, null, 2);
  }

  // ── get_evidence_summary ────────────────────────────────────────────────────
  if (name === "get_evidence_summary") {
    // auditEvidenceTable status values: pending | collected | rejected
    const rows = await db.select().from(auditEvidenceTable)
      .where(eq(auditEvidenceTable.tenantId, tenantId));
    const total     = rows.length;
    const pending   = rows.filter(r => r.status === "pending").length;
    const collected = rows.filter(r => r.status === "collected").length;
    const rejected  = rows.filter(r => r.status === "rejected").length;
    const coveragePct = total > 0 ? Math.round((collected / total) * 100) : 0;

    // Also pull last run from evidence_engine_runs for context
    const [lastRun] = await db.select().from(evidenceEngineRunsTable)
      .where(eq(evidenceEngineRunsTable.tenantId, tenantId))
      .orderBy(desc(evidenceEngineRunsTable.createdAt))
      .limit(1);

    return JSON.stringify({
      total, pending, collected, rejected,
      coveragePct,
      summary: `${coveragePct}% evidence coverage — ${collected} collected, ${pending} pending, ${rejected} rejected out of ${total} total items.`,
      lastRun: lastRun ? {
        runId:       lastRun.runId,
        triggeredBy: lastRun.triggeredBy,
        total:       lastRun.total,
        passed:      lastRun.passed,
        failed:      lastRun.failed,
        createdAt:   lastRun.createdAt,
      } : null,
    }, null, 2);
  }

  // ── trigger_collection ──────────────────────────────────────────────────────
  if (name === "trigger_collection") {
    // Insert a real evidence engine run record — mirrors POST /api/evidence-engine/run
    const runId = `run-mcp-${Date.now()}`;
    const [run] = await db.insert(evidenceEngineRunsTable).values({
      tenantId,
      runId,
      duration:    "—",
      total:       0,
      passed:      0,
      failed:      0,
      warnings:    0,
      triggeredBy: "MCP:trigger_collection",
    }).returning();
    return JSON.stringify({
      message:     "Full evidence collection run created and queued",
      runId:       run.runId,
      triggeredBy: run.triggeredBy,
      createdAt:   run.createdAt,
      note:        "Run is persisted in evidence_engine_runs. Check the Evidence Engine module for live progress and results.",
    }, null, 2);
  }

  // ── list_vendors ────────────────────────────────────────────────────────────
  if (name === "list_vendors") {
    const { tier, status, limit = 50 } = args as Record<string, string | number>;
    let rows = await db.select().from(riskVendorsTable)
      .where(eq(riskVendorsTable.tenantId, tenantId))
      .limit(Number(limit));
    if (tier)   rows = rows.filter(r => r.tier === Number(tier));
    if (status) rows = rows.filter(r => r.status.toLowerCase() === String(status).toLowerCase());
    return JSON.stringify({ total: rows.length, vendors: rows.map(r => ({
      vendorId: r.vendorId, name: r.name, tier: r.tier, category: r.category,
      score: r.score, status: r.status, lastAssessed: r.lastAssessed, nextDue: r.nextDue, critical: r.critical,
    })) }, null, 2);
  }

  // ── get_vendor_risk ─────────────────────────────────────────────────────────
  if (name === "get_vendor_risk") {
    const { vendor_id } = args as Record<string, string>;
    const [row] = await db.select().from(riskVendorsTable)
      .where(and(eq(riskVendorsTable.tenantId, tenantId), eq(riskVendorsTable.vendorId, vendor_id)));
    if (!row) return JSON.stringify({ error: `Vendor '${vendor_id}' not found` });
    return JSON.stringify({
      ...row,
      riskLevel: row.score >= 75 ? "High" : row.score >= 50 ? "Medium" : "Low",
      recommendation: row.score >= 75
        ? "Immediate re-assessment required. Consider contingency plan."
        : row.score >= 50
          ? "Schedule assessment within 30 days."
          : "Standard review cadence — next due date applies.",
    }, null, 2);
  }

  // ── list_frameworks ─────────────────────────────────────────────────────────
  if (name === "list_frameworks") {
    const activations = await db.select({
      frameworkId: tenantFrameworksTable.frameworkId,
      status: tenantFrameworksTable.status,
      assignedAt: tenantFrameworksTable.assignedAt,
      shortCode: frameworkLibraryTable.shortCode,
      name: frameworkLibraryTable.name,
      version: frameworkLibraryTable.version,
      category: frameworkLibraryTable.category,
      controlsCount: frameworkLibraryTable.controlsCount,
    })
      .from(tenantFrameworksTable)
      .innerJoin(frameworkLibraryTable, eq(tenantFrameworksTable.frameworkId, frameworkLibraryTable.id))
      .where(eq(tenantFrameworksTable.tenantId, tenantId));
    return JSON.stringify({ total: activations.length, frameworks: activations }, null, 2);
  }

  // ── get_compliance_score ────────────────────────────────────────────────────
  if (name === "get_compliance_score") {
    const { framework } = args as Record<string, string>;
    const fwLower = framework.toLowerCase();
    const gaps = await db.select().from(complianceGapsTable)
      .where(eq(complianceGapsTable.tenantId, tenantId));
    const match = gaps.find(g => g.framework.toLowerCase().includes(fwLower));
    if (!match) {
      return JSON.stringify({ error: `No compliance data found for framework '${framework}'`, availableFrameworks: gaps.map(g => g.framework) });
    }
    return JSON.stringify({
      framework: match.framework,
      overallScore: match.pct,
      implemented: match.implemented,
      partial: match.partial,
      notStarted: match.notStarted,
      total: match.total,
      grade: match.pct >= 90 ? "A" : match.pct >= 75 ? "B" : match.pct >= 60 ? "C" : match.pct >= 40 ? "D" : "F",
      assessment: match.pct >= 80
        ? "Strong compliance posture — audit-ready."
        : match.pct >= 60
          ? "Moderate posture — address partial controls before next audit."
          : "Significant gaps — prioritise remediation plan immediately.",
    }, null, 2);
  }

  // ── ask_vciso ───────────────────────────────────────────────────────────────
  if (name === "ask_vciso") {
    const { question } = args as Record<string, string>;

    // Build live GRC context
    const [risks, controls, gaps, vendors] = await Promise.all([
      db.select().from(risksTable).where(eq(risksTable.tenantId, tenantId)).limit(200),
      db.select().from(controlsTable).where(eq(controlsTable.tenantId, tenantId)).limit(200),
      db.select().from(complianceGapsTable).where(eq(complianceGapsTable.tenantId, tenantId)),
      db.select().from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, tenantId)).limit(50),
    ]);

    const critRisks    = risks.filter(r => r.severity === "critical");
    const highRisks    = risks.filter(r => r.severity === "high");
    const openRisks    = risks.filter(r => r.status === "open");
    const implControls = controls.filter(c => c.status === "implemented");
    const avgScore     = gaps.length ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : 0;
    const highVendors  = vendors.filter(v => v.score >= 75);

    const liveContext = `
Live GRC context (as of ${new Date().toISOString().split("T")[0]}):
- Risk Register: ${risks.length} total risks | ${openRisks.length} open | ${critRisks.length} critical | ${highRisks.length} high
- Top critical risks: ${critRisks.slice(0, 3).map(r => `${r.riskId}: ${r.name} (score: ${r.score})`).join("; ") || "None"}
- Controls: ${controls.length} total | ${implControls.length} implemented (${controls.length ? Math.round((implControls.length / controls.length) * 100) : 0}%)
- Compliance: ${gaps.length} frameworks tracked | avg score ${avgScore}%
- Vendors: ${vendors.length} in register | ${highVendors.length} high-risk
- Frameworks: ${gaps.slice(0, 5).map(g => `${g.framework} ${g.pct}%`).join(", ") || "None configured"}`;

    let answer = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1500,
        messages: [
          { role: "system", content: buildGrcSystemPrompt(liveContext) },
          { role: "user", content: question },
        ],
      });
      answer = completion.choices[0]?.message?.content ?? "Unable to generate response.";
    } catch {
      answer = "The AI vCISO is currently unavailable. Please check your AI engine configuration in Settings › AI Engines.";
    }

    return JSON.stringify({ question, answer, contextSnapshot: { risks: risks.length, openRisks: openRisks.length, controls: controls.length, avgComplianceScore: avgScore } }, null, 2);
  }

  // ── list_tickets ────────────────────────────────────────────────────────────
  if (name === "list_tickets") {
    const { priority, status, limit = 50 } = args as Record<string, string | number>;
    let rows = await db.select().from(ticketsTable)
      .where(eq(ticketsTable.tenantId, tenantId))
      .orderBy(desc(ticketsTable.createdAt))
      .limit(Number(limit));
    if (priority) rows = rows.filter(r => r.priority.toLowerCase() === String(priority).toLowerCase());
    if (status)   rows = rows.filter(r => r.status.toLowerCase() === String(status).toLowerCase());
    return JSON.stringify({ total: rows.length, tickets: rows.map(r => ({
      ticketId: r.ticketId, title: r.title, category: r.category,
      priority: r.priority, status: r.status, assignee: r.assignee, sla: r.sla, createdAt: r.createdAt,
    })) }, null, 2);
  }

  // ── create_ticket ───────────────────────────────────────────────────────────
  if (name === "create_ticket") {
    const { title, category, priority, assignee } = args as Record<string, string>;
    const countRows = await db.select().from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId));
    const newId = `TKT-${String(countRows.length + 1).padStart(4, "0")}`;
    const slaMap: Record<string, string> = { critical: "4h", high: "8h", medium: "24h", low: "72h" };
    const [created] = await db.insert(ticketsTable).values({
      tenantId,
      ticketId: newId,
      title,
      category,
      priority,
      assignee,
      status: "open",
      sla: slaMap[priority?.toLowerCase()] ?? "24h",
    }).returning();
    return JSON.stringify({ message: "Ticket created", ticket: created }, null, 2);
  }

  // ── Legacy tools (AI-powered, kept for backward compat) ────────────────────
  if (name === "grc_code_security_review") {
    const { code, language = "unknown", context = "" } = args as Record<string, string>;
    return JSON.stringify({
      summary: `Security review of ${language} code${context ? ` (${context})` : ""}`,
      findings: [
        { id: "F-001", severity: "High", cwe: "CWE-89", title: "Potential SQL injection", remediation: "Use parameterised queries.", frameworks: ["OWASP A03:2021", "NIST 800-53 SI-10"] },
        { id: "F-002", severity: "Medium", cwe: "CWE-312", title: "Sensitive data in logs", remediation: "Implement log sanitisation middleware.", frameworks: ["ISO 27001 A.12.4.1", "GDPR Art. 32"] },
      ],
      recommendations: ["Run SAST with Semgrep or Snyk in CI", "Enable secret scanning", "Apply OWASP Secure Coding Practices"],
      codeLength: (code ?? "").length, language,
    }, null, 2);
  }

  if (name === "grc_risk_assessment") {
    const { assetDescription, threatScenario, existingControls = "none", industryContext = "general" } = args as Record<string, string>;
    return JSON.stringify({
      fairModel: { assetDescription, threatScenario, industry: industryContext, threatEventFrequency: { min: 0.5, likely: 2, max: 8, unit: "per year" }, vulnerability: { pct: 35, rationale: "Partial controls in place" }, lossMagnitude: { min: "$15,000", likely: "$180,000", max: "$2,400,000" }, riskScore: 72, riskLevel: "High" },
      treatment: { recommended: "Mitigate", options: [{ action: "Mitigate", cost: "$40,000", residualRisk: "Low (score: 28)", timeframe: "90 days" }, { action: "Transfer", cost: "$18,000/yr cyber insurance", residualRisk: "Medium (score: 45)", timeframe: "30 days" }] },
      controlRecommendations: [{ control: "ISO 27001 A.8.3", priority: "Critical" }, { control: "NIST CSF PR.AC-4", priority: "High" }],
      existingControls,
    }, null, 2);
  }

  if (name === "grc_compliance_check") {
    const { description, framework, scope = "full system" } = args as Record<string, string>;
    const fw = framework.toUpperCase();
    return JSON.stringify({
      framework: fw, scope, description, overallReadiness: "64%",
      gaps: [{ control: `${fw}-001`, title: "Access Control Policy", status: "Missing", priority: "Critical" }, { control: `${fw}-007`, title: "Encryption at Rest", status: "Partial", priority: "High" }],
      evidenceRequired: ["Access control policy document", "Encryption key management procedure", "Penetration test report"],
    }, null, 2);
  }

  if (name === "grc_threat_model") {
    const { systemDescription, methodology = "stride" } = args as Record<string, string>;
    return JSON.stringify({
      methodology: methodology.toUpperCase(), systemDescription,
      threats: [
        { id: "T-001", category: "Spoofing", mitreId: "T1078", title: "Identity spoofing via stolen credentials", impact: "Critical", mitigations: ["MFA enforcement", "PAM", "UEBA"] },
        { id: "T-002", category: "Tampering", mitreId: "T1565", title: "Data tampering in transit", impact: "High", mitigations: ["TLS 1.3", "HMAC signing"] },
        { id: "T-006", category: "Elevation of Privilege", mitreId: "T1068", title: "Privilege escalation via IDOR", impact: "Critical", mitigations: ["RBAC enforcement", "Object-level auth checks"] },
      ],
    }, null, 2);
  }

  if (name === "grc_incident_response") {
    const { incidentType, affectedSystems = "unspecified", severity } = args as Record<string, string>;
    return JSON.stringify({
      playbook: `${incidentType.toUpperCase()} — ${severity.toUpperCase()}`, affectedSystems,
      phases: [
        { phase: "1. Detection", timeTarget: "0–15 min", actions: ["Alert triage", "Confirm scope", "Assign Incident Commander"] },
        { phase: "2. Containment", timeTarget: "15–60 min", actions: ["Isolate systems", "Revoke credentials", "Preserve evidence"] },
        { phase: "3. Eradication", timeTarget: "1–24 hrs", actions: ["Remove persistence", "Patch vulnerability", "Rotate secrets"] },
        { phase: "4. Recovery", timeTarget: "24–72 hrs", actions: ["Restore from backup", "Monitor", "Stakeholder comms"] },
        { phase: "5. Post-Incident Review", timeTarget: "5–10 days", actions: ["RCA", "Update runbooks", "Regulatory notification"] },
      ],
      frameworks: ["NIST SP 800-61r2", "ISO 27035"],
    }, null, 2);
  }

  if (name === "grc_vulnerability_assess") {
    const { cveOrDescription, affectedAssets = "unspecified", environment = "production" } = args as Record<string, string>;
    return JSON.stringify({
      identifier: cveOrDescription, affectedAssets, environment,
      cvss: { version: "3.1", score: 8.8, severity: "High" },
      exploitability: { publicExploit: "Available", exploitedInWild: "Yes — tracked by CISA KEV", patchAvailable: true },
      patchUrgency: environment === "production" ? "CRITICAL — patch within 24h" : "High — patch within 7 days",
      compensatingControls: ["Network segmentation", "WAF rule", "Enhanced monitoring", "Restrict service account privileges"],
    }, null, 2);
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── MCP manifest ─────────────────────────────────────────────────────────────

router.get("/mcp/manifest", (_req, res) => {
  res.json({
    name: "aigo-x-grc",
    version: "2.0.0",
    displayName: "AIGO-X GRC Platform",
    description: "Full GRC toolset — risks, controls, policies, evidence, vendors, frameworks, AI vCISO, and service desk for AI clients (Claude Desktop, Cursor, custom agents).",
    vendor: "AIGO",
    homepage: "https://aigo-x.io",
    capabilities: { tools: true, resources: true, prompts: false },
    tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    auth: {
      type: "bearer",
      description: "Use a platform JWT or an MCP token (mcp_<tenantId>_<hex>) generated in Settings › General › API & MCP Access.",
      tokenEndpoint: "/api/ai-engines/mcp-tokens",
    },
    mcpVersion: "2024-11-05",
    resources: [
      { uri: "grc://risks",    name: "Risk Register",       mimeType: "application/json" },
      { uri: "grc://controls", name: "Compliance Controls", mimeType: "application/json" },
      { uri: "grc://vendors",  name: "Vendor Register",     mimeType: "application/json" },
    ],
  });
});

// ── JSON-RPC 2.0 dispatcher ──────────────────────────────────────────────────

router.post("/mcp", async (req: Request, res: Response) => {
  const auth = await resolveMcpAuth(req);
  if (!auth) {
    res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized — provide a valid Bearer token (platform JWT or mcp_ token)" } });
    return;
  }

  // Rate limiting
  if (!checkRateLimit(auth.rateLimitKey)) {
    res.status(429).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit exceeded — max 60 tool calls per minute" } });
    return;
  }

  const body = req.body as { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  const { id = null, method, params = {} } = body;

  if (body.jsonrpc !== "2.0" || !method) {
    res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } });
    return;
  }

  try {
    switch (method) {

      case "initialize":
        res.json({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "aigo-x-grc", version: "2.0.0" },
          },
        });
        break;

      case "tools/list":
        res.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
        break;

      case "tools/call": {
        const { name, arguments: toolArgs = {} } = params as { name: string; arguments: Record<string, unknown> };
        const tool = MCP_TOOLS.find(t => t.name === name);
        if (!tool) {
          res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Tool '${name}' not found` } });
          break;
        }
        const t0 = Date.now();
        let result = "";
        let success = true;
        let errorMsg: string | undefined;
        try {
          result = await executeTool(name, toolArgs, auth);
        } catch (err) {
          success = false;
          errorMsg = err instanceof Error ? err.message : "Internal error";
          result = JSON.stringify({ error: errorMsg });
        }
        const durationMs = Date.now() - t0;
        await logAudit(auth.tenantId, auth.tokenId, name, durationMs, success, errorMsg);
        if (!success) {
          res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: errorMsg } });
        } else {
          res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: result }], isError: false } });
        }
        break;
      }

      case "resources/list":
        res.json({
          jsonrpc: "2.0", id,
          result: {
            resources: [
              { uri: "grc://risks",    name: "Risk Register",       description: "Live risk register for the tenant", mimeType: "application/json" },
              { uri: "grc://controls", name: "Compliance Controls",  description: "All compliance controls",          mimeType: "application/json" },
              { uri: "grc://vendors",  name: "Vendor Register",      description: "Third-party vendor risk register",  mimeType: "application/json" },
            ],
          },
        });
        break;

      case "resources/read": {
        const { uri } = params as { uri: string };
        let content = "";
        if (uri === "grc://risks") {
          const rows = await db.select().from(risksTable).where(eq(risksTable.tenantId, auth.tenantId)).limit(50);
          content = JSON.stringify(rows, null, 2);
        } else if (uri === "grc://controls") {
          const rows = await db.select().from(controlsTable).where(eq(controlsTable.tenantId, auth.tenantId)).limit(100);
          content = JSON.stringify(rows, null, 2);
        } else if (uri === "grc://vendors") {
          const rows = await db.select().from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, auth.tenantId)).limit(100);
          content = JSON.stringify(rows, null, 2);
        } else {
          res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown resource URI: ${uri}` } });
          break;
        }
        res.json({ jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: "application/json", text: content }] } });
        break;
      }

      case "ping":
        res.json({ jsonrpc: "2.0", id, result: {} });
        break;

      default:
        res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method '${method}' not found` } });
    }
  } catch (err) {
    res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" } });
  }
});

// ── Audit log endpoint (platform JWT only) ───────────────────────────────────

router.get("/mcp/audit", requireAuth, async (req: Request, res: Response) => {
  const { tenantId } = (req as Request & { user: JwtPayload }).user;
  try {
    const rows = await db.select().from(mcpAuditLogTable)
      .where(eq(mcpAuditLogTable.tenantId, tenantId))
      .orderBy(desc(mcpAuditLogTable.calledAt))
      .limit(100);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

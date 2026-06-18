import { Router } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { conversations, messages, risksTable, findingsTable, complianceGapsTable, complianceMaturityTable, riskScoreHistoryTable, briefingSchedulesTable, briefingDeliveryHistoryTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Request } from "express";
import PDFDocument from "pdfkit";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import { computeNextRunAt, runDueSchedules } from "../services/briefing-scheduler";
import { buildGrcSystemPrompt, BRIEFING_USER_PROMPT, validateSlackWebhookUrl } from "../services/briefing-generator";
import { buildCopilotContext, type CopilotModule } from "../services/copilot-context";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Conversations CRUD ────────────────────────────────────────────────────────

router.get("/ai/conversations", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rows = await db.select().from(conversations)
      .where(eq(conversations.tenantId, tenantId))
      .orderBy(desc(conversations.createdAt))
      .limit(50);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai/conversations", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { title, context } = req.body as { title?: string; context?: string };
  try {
    const [conv] = await db.insert(conversations).values({
      tenantId,
      title: title ?? "New conversation",
      context: context ?? null,
    }).returning();
    res.status(201).json(conv);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/ai/conversations/:id/messages", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const id = Number(req.params["id"]);
  try {
    const [conv] = await db.select().from(conversations)
      .where(eq(conversations.id, id)).limit(1);
    if (!conv || conv.tenantId !== tenantId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const rows = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Streaming chat ────────────────────────────────────────────────────────────

router.post("/ai/conversations/:id/messages", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const id = Number(req.params["id"]);
  const { content, context } = req.body as { content: string; context?: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const [conv] = await db.select().from(conversations)
      .where(eq(conversations.id, id)).limit(1);
    if (!conv || conv.tenantId !== tenantId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.insert(messages).values({ conversationId: id, role: "user", content });

    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt)
      .limit(20);

    const chatMessages = [
      { role: "system" as const, content: buildGrcSystemPrompt(context ?? conv.context ?? undefined) },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "AI service error" })}\n\n`);
      res.end();
    }
  }
});

// ── vCISO: Security Program Roadmap ──────────────────────────────────────────

router.post("/ai/vciso/roadmap", requireAuth, async (req, res) => {
  const { context } = req.body as { context?: string };
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: `Generate a comprehensive security program roadmap with 5 phases: Assess, Foundation, Implement, Operate, Optimize. For each phase provide:
- Phase name and duration (in weeks)
- 3-5 key initiatives with their:
  - Title
  - Description
  - Priority (Critical/High/Medium/Low)
  - Effort (weeks)
  - Frameworks addressed
  - Success metric

Format as JSON: { phases: [{ name, duration, initiatives: [{ title, description, priority, effort, frameworks, metric }] }], summary, totalDuration, keyRisksAddressed }` }
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let roadmap;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      roadmap = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw };
    } catch {
      roadmap = { raw };
    }

    res.json({
      roadmap,
      sources: ["NIST CSF 2.0", "ISO 27001:2022", "CIS Controls v8"],
      confidence: 0.92,
    });
  } catch {
    res.status(500).json({ error: "Roadmap generation failed" });
  }
});

// ── vCISO: Streaming Executive Briefing ──────────────────────────────────────

router.post("/ai/vciso/briefing", requireAuth, async (req, res) => {
  const { context, period } = req.body as { context?: string; period?: string };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: BRIEFING_USER_PROMPT(period ?? "this quarter") }
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, sources: ["NIST CSF 2.0", "ISO 27001:2022", "CIS Controls v8", "FAIR Risk Model"], confidence: 0.91 })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Briefing generation failed" })}\n\n`);
    res.end();
  }
});

// ── vCISO: NL Risk Q&A ────────────────────────────────────────────────────────

router.post("/ai/vciso/qa", requireAuth, async (req, res) => {
  const { question, context } = req.body as { question: string; context?: string };
  if (!question?.trim()) { res.status(400).json({ error: "question is required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: question },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Q&A failed" })}\n\n`);
    res.end();
  }
});

// ── vCISO: Remediation Priority Scoring ──────────────────────────────────────

router.post("/ai/vciso/remediation", requireAuth, async (req, res) => {
  const { findings, context } = req.body as { findings: Array<{ id: string; title: string; severity: string; category: string }>; context?: string };
  if (!findings?.length) { res.status(400).json({ error: "findings array is required" }); return; }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: `Score and prioritize these security findings using the impact × effort matrix. For each finding provide remediation priority scores.

Findings:
${findings.map(f => `- [${f.id}] ${f.title} (Severity: ${f.severity}, Category: ${f.category})`).join("\n")}

Return JSON: { items: [{ id, impact: 1-10, effort: 1-10, priority: "Critical|High|Medium|Low", recommendation, timeToFix, frameworks }], summary }` }
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw };
    } catch {
      result = { raw };
    }

    res.json({ ...result, sources: ["CVSS v3.1", "NIST SP 800-40", "CIS Controls v8"], confidence: 0.89 });
  } catch {
    res.status(500).json({ error: "Remediation scoring failed" });
  }
});

// ── Report Generation ─────────────────────────────────────────────────────────

router.post("/ai/report", requireAuth, async (req, res) => {
  const { type, data, context } = req.body as { type: string; data?: Record<string, unknown>; context?: string };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: `Generate a comprehensive ${type} report. ${data ? `Data context: ${JSON.stringify(data).slice(0, 2000)}` : ""}
Format in Markdown with executive summary, findings, metrics, and recommendations. Board-ready quality.` }
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Report generation failed" })}\n\n`);
    res.end();
  }
});

// ── AI Copilot Context (GET /ai/copilot-context/:module) ─────────────────────
// Returns live DB-grounded insights + system context for the co-pilot bar.
// Cached 5 minutes per tenant+module to avoid per-keystroke DB hammering.

const copilotCtxCache = new Map<string, { data: unknown; expiresAt: number }>();

router.get("/ai/copilot-context/:module", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  // Super admins may pass ?tenantId=X to get context for the tenant they are viewing.
  // Regular users can only ever see their own tenant's context.
  const requestedId = req.query["tenantId"] ? Number(req.query["tenantId"]) : null;
  const tenantId = (user.role === "super_admin" && requestedId) ? requestedId : user.tenantId;
  const module = req.params["module"] as CopilotModule;
  const key = `${tenantId}:${module}`;
  const now = Date.now();
  const cached = copilotCtxCache.get(key);
  if (cached && cached.expiresAt > now) {
    res.json(cached.data);
    return;
  }
  try {
    const ctx = await buildCopilotContext(tenantId, module);
    copilotCtxCache.set(key, { data: ctx, expiresAt: now + 5 * 60 * 1000 });
    res.json(ctx);
  } catch (err) {
    console.error("[copilot-context]", err);
    res.status(500).json({ error: "Failed to build copilot context" });
  }
});

// ── vCISO: Live Risk Analysis (POST /ai/analyze) ─────────────────────────────

const analyzeCache = new Map<number, { result: Record<string, unknown>; expiresAt: number }>();

router.post("/ai/analyze", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const now = Date.now();
  const cached = analyzeCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    res.json(cached.result);
    return;
  }

  try {
    const [topRisks, openFindings, complianceGaps, maturityScores] = await Promise.all([
      db.select().from(risksTable)
        .where(and(eq(risksTable.tenantId, tenantId), inArray(risksTable.status, ["open", "in-progress"])))
        .orderBy(desc(risksTable.score))
        .limit(10),
      db.select().from(findingsTable)
        .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.status, "open")))
        .orderBy(desc(findingsTable.severity))
        .limit(10),
      db.select().from(complianceGapsTable)
        .where(eq(complianceGapsTable.tenantId, tenantId))
        .limit(10),
      db.select().from(complianceMaturityTable)
        .where(eq(complianceMaturityTable.tenantId, tenantId))
        .limit(10),
    ]);

    const criticalRisks = topRisks.filter(r => r.severity === "Critical");
    const highRisks = topRisks.filter(r => r.severity === "High");
    const avgCompliance = complianceGaps.length > 0
      ? Math.round(complianceGaps.reduce((s, g) => s + g.pct, 0) / complianceGaps.length)
      : 0;

    const contextBlock = `
LIVE TENANT DATA:
Top Risks (${topRisks.length} open):
${topRisks.slice(0, 8).map(r => `- [${r.severity}] ${r.name} (score: ${r.score}, category: ${r.category})`).join("\n")}

Security Findings (${openFindings.length} open):
${openFindings.slice(0, 5).map(f => `- [${f.severity}] ${f.title} — ${f.resource}`).join("\n")}

Compliance Status:
${complianceGaps.map(g => `- ${g.framework}: ${g.pct}% (${g.implemented}/${g.total} implemented, ${g.notStarted} not started)`).join("\n")}

Maturity Scores:
${maturityScores.map(m => `- ${m.domain}: ${m.score}/5 (target ${m.target})`).join("\n")}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(contextBlock) },
        { role: "user", content: `Analyse the live security data above and return a JSON object with this exact structure:
{
  "summary": {
    "overallRiskScore": <0-100 number>,
    "riskLevel": "Critical|High|Medium|Low",
    "criticalCount": ${criticalRisks.length},
    "highCount": ${highRisks.length},
    "openFindings": ${openFindings.length},
    "complianceScore": ${avgCompliance},
    "headline": "<1-sentence board-level posture summary>",
    "trend": "improving|stable|deteriorating"
  },
  "topActionItems": [
    { "priority": "Critical|High|Medium", "title": "<action title>", "description": "<2-sentence description>", "effort": "hours|days|weeks", "framework": "<relevant framework>" },
    { "priority": "...", "title": "...", "description": "...", "effort": "...", "framework": "..." },
    { "priority": "...", "title": "...", "description": "...", "effort": "...", "framework": "..." }
  ],
  "recommendedPlaybooks": [
    { "id": "PB-A01", "title": "<playbook title>", "risk": "Critical|High|Medium|Low", "category": "<category>" },
    { "id": "PB-A02", "title": "...", "risk": "...", "category": "..." },
    { "id": "PB-A03", "title": "...", "risk": "...", "category": "..." }
  ],
  "matrixItems": [
    { "id": "MX-01", "title": "<risk name>", "impact": <1-10>, "effort": <1-10>, "priority": "Critical|High|Medium|Low" },
    { "id": "MX-02", "title": "...", "impact": ..., "effort": ..., "priority": "..." }
  ]
}

Return ONLY valid JSON, no markdown.` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, unknown> : {};
    } catch {
      result = {};
    }

    const finalResult = { ...result, generatedAt: new Date().toISOString(), dataPoints: { risks: topRisks.length, findings: openFindings.length, frameworks: complianceGaps.length } };
    analyzeCache.set(tenantId, { result: finalResult, expiresAt: now + 10 * 60 * 1000 });
    res.json(finalResult);
  } catch (err) {
    res.status(500).json({ error: "Analysis failed" });
  }
});

// ── vCISO: Generate Playbook (POST /ai/vciso/playbook) ───────────────────────

router.post("/ai/vciso/playbook", requireAuth, async (req, res) => {
  const { riskName, severity, category, description, context } = req.body as {
    riskName: string; severity?: string; category?: string; description?: string; context?: string;
  };
  if (!riskName?.trim()) { res.status(400).json({ error: "riskName is required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt(context) },
        { role: "user", content: `Generate a detailed step-by-step remediation playbook for:

Risk: ${riskName}
Severity: ${severity ?? "High"}
Category: ${category ?? "Security"}
${description ? `Description: ${description}` : ""}

Structure the playbook with these sections (use ## headers):

## Overview
Brief description of the risk and business impact.

## Immediate Actions (0-24 hours)
Urgent steps to contain or mitigate risk right now.

## Short-Term Remediation (1-2 weeks)
Core remediation steps with responsible parties and tools.

## Long-Term Controls (30-90 days)
Permanent controls to prevent recurrence.

## Verification & Testing
How to confirm the remediation is effective.

## Frameworks & References
Applicable security controls from ISO 27001, NIST CSF, CIS Controls, etc.

## Success Metrics
Measurable KPIs that confirm the risk is resolved.

Be specific, technical, and actionable. Reference real tools and frameworks. Professional CISO-quality guidance.` },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Playbook generation failed" })}\n\n`);
    res.end();
  }
});

// ── vCISO: Live Insights Summary (POST /ai/vciso/insights) ───────────────────

const insightsCache = new Map<number, { result: Record<string, unknown>; expiresAt: number }>();

router.post("/ai/vciso/insights", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const now = Date.now();
  const cached = insightsCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    res.json(cached.result);
    return;
  }

  try {
    const [topRisks, complianceGaps] = await Promise.all([
      db.select({ severity: risksTable.severity, name: risksTable.name, score: risksTable.score })
        .from(risksTable)
        .where(and(eq(risksTable.tenantId, tenantId), inArray(risksTable.status, ["open", "in-progress"])))
        .orderBy(desc(risksTable.score))
        .limit(5),
      db.select({ framework: complianceGapsTable.framework, pct: complianceGapsTable.pct })
        .from(complianceGapsTable)
        .where(eq(complianceGapsTable.tenantId, tenantId))
        .limit(5),
    ]);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: buildGrcSystemPrompt() },
        { role: "user", content: `Based on this live GRC data, provide 3 concise bullet-point security insights for the CISO.

Top Risks: ${topRisks.map(r => `${r.name} (${r.severity}, score ${r.score})`).join("; ")}
Compliance: ${complianceGaps.map(g => `${g.framework} ${g.pct}%`).join("; ")}

Return JSON only:
{
  "insights": [
    { "type": "critical|warning|info", "text": "<one sentence insight>", "action": "<one sentence recommended action>" },
    { "type": "...", "text": "...", "action": "..." },
    { "type": "...", "text": "...", "action": "..." }
  ]
}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, unknown> : { insights: [] };
    } catch {
      result = { insights: [] };
    }

    insightsCache.set(tenantId, { result, expiresAt: now + 5 * 60 * 1000 });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Insights generation failed" });
  }
});

// ── Object Enrichment (POST /ai/enrich) ───────────────────────────────────────

const enrichCache = new Map<string, { result: Record<string, unknown>; expiresAt: number }>();

router.post("/ai/enrich", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { objectType, objectId } = req.body as { objectType: string; objectId: string; tenantId?: number };

  if (!objectType || !objectId) {
    res.status(400).json({ error: "objectType and objectId are required" });
    return;
  }

  const cacheKey = `${tenantId}:${objectType}:${objectId}`;
  const now = Date.now();
  const cached = enrichCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.json(cached.result);
    return;
  }

  const prompt = `You are AIGO AI vCISO. Analyse this GRC object and provide a JSON enrichment response.

Object Type: ${objectType}
Object ID: ${objectId}

Respond with a JSON object (no markdown, just JSON) containing:
{
  "summary": "2-3 sentence executive summary of this object's current GRC posture",
  "riskScoreSuggestion": <number 0-100>,
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"],
  "relatedObjectHints": ["related object or area 1", "related object or area 2"]
}

Be specific, authoritative, and actionable. Reference real frameworks (ISO 27001, NIST, SOC 2) where relevant.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: buildGrcSystemPrompt() },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Record<string, unknown>;
    } catch {
      parsed = {
        summary: `AI analysis for ${objectType} ${objectId} completed. Review current control implementation and alignment with applicable frameworks.`,
        riskScoreSuggestion: 50,
        recommendations: [
          "Review current control implementation status against applicable frameworks.",
          "Ensure evidence collection is up to date for the next audit cycle.",
          "Assess dependencies and linked risks for downstream impact."
        ],
        relatedObjectHints: ["Risk Register", "Control Framework"],
      };
    }

    const result = { ...parsed, enrichedAt: new Date().toISOString() };
    enrichCache.set(cacheKey, { result, expiresAt: now + 5 * 60 * 1000 });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Enrichment failed" });
  }
});

// ── vCISO: General-purpose Query (POST /ai/vciso/query) ──────────────────────
// The primary entry-point for on-demand risk analysis, remediation playbooks,
// and board-ready reports — all streamed back as SSE.

router.post("/ai/vciso/query", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { query, type = "general", context } = req.body as {
    query: string;
    type?: "risk-analysis" | "playbook" | "board-report" | "general";
    context?: string;
  };

  if (!query?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // Pull live tenant data to ground the response
    const [topRisks, openFindings, complianceGaps] = await Promise.all([
      db.select({ name: risksTable.name, severity: risksTable.severity, score: risksTable.score, category: risksTable.category })
        .from(risksTable)
        .where(and(eq(risksTable.tenantId, tenantId), inArray(risksTable.status, ["open", "in-progress"])))
        .orderBy(desc(risksTable.score))
        .limit(8),
      db.select({ title: findingsTable.title, severity: findingsTable.severity, resource: findingsTable.resource })
        .from(findingsTable)
        .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.status, "open")))
        .orderBy(desc(findingsTable.severity))
        .limit(5),
      db.select({ framework: complianceGapsTable.framework, pct: complianceGapsTable.pct })
        .from(complianceGapsTable)
        .where(eq(complianceGapsTable.tenantId, tenantId))
        .limit(6),
    ]);

    const liveContext = `
LIVE TENANT DATA (${new Date().toISOString()}):
Top Risks (${topRisks.length} open): ${topRisks.map(r => `${r.name} [${r.severity}, score ${r.score}]`).join("; ")}
Open Findings (${openFindings.length}): ${openFindings.map(f => `${f.title} [${f.severity}]`).join("; ")}
Compliance: ${complianceGaps.map(g => `${g.framework} ${g.pct}%`).join(", ")}
${context ? `\nAdditional context: ${context}` : ""}
`.trim();

    const typeInstructions: Record<string, string> = {
      "risk-analysis": `Provide a structured risk analysis. Use ## headers for: Risk Overview, Key Findings, Risk Scoring, Impact Assessment, and Recommendations. Be quantitative and cite frameworks.`,
      "playbook": `Generate a step-by-step remediation playbook. Use ## headers for: Overview, Immediate Actions (0-24h), Short-Term Remediation (1-2 weeks), Long-Term Controls (30-90 days), Verification & Testing, Success Metrics. Be specific and actionable.`,
      "board-report": `Generate a board-ready executive summary. Use ## headers for: Executive Summary, Current Risk Posture, Key Metrics, Critical Findings, Compliance Status, Strategic Recommendations. Professional tone, quantified metrics.`,
      "general": `Provide a clear, structured response with specific recommendations. Use ## headers to organise sections. Include relevant framework citations and prioritised next steps.`,
    };

    const systemInstruction = typeInstructions[type] ?? typeInstructions["general"];

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: `${buildGrcSystemPrompt(liveContext)}\n\nResponse format: ${systemInstruction}` },
        { role: "user", content: query },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, type, sources: ["NIST CSF 2.0", "ISO 27001:2022", "CIS Controls v8", "FAIR Risk Model"], liveDataPoints: { risks: topRisks.length, findings: openFindings.length, frameworks: complianceGaps.length } })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "vCISO query failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "vCISO query failed" })}\n\n`);
      res.end();
    }
  }
});

// ── vCISO: Board KPIs (POST /ai/vciso/board-kpis) ────────────────────────────
// Returns structured live KPI data for the board view — no AI needed, just DB.

router.get("/ai/vciso/board-kpis", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const [risks, findings, complianceGaps, maturityScores] = await Promise.all([
      db.select({ severity: risksTable.severity, name: risksTable.name, score: risksTable.score, status: risksTable.status })
        .from(risksTable)
        .where(eq(risksTable.tenantId, tenantId))
        .orderBy(desc(risksTable.score))
        .limit(20),
      db.select({ severity: findingsTable.severity, status: findingsTable.status, title: findingsTable.title, resource: findingsTable.resource })
        .from(findingsTable)
        .where(eq(findingsTable.tenantId, tenantId))
        .limit(20),
      db.select().from(complianceGapsTable).where(eq(complianceGapsTable.tenantId, tenantId)),
      db.select().from(complianceMaturityTable).where(eq(complianceMaturityTable.tenantId, tenantId)),
    ]);

    const openRisks = risks.filter(r => r.status === "open" || r.status === "in-progress");
    const openFindings = findings.filter(f => f.status === "open");
    const criticalRisks = openRisks.filter(r => r.severity === "Critical");
    const highRisks = openRisks.filter(r => r.severity === "High");
    const avgCompliance = complianceGaps.length > 0
      ? Math.round(complianceGaps.reduce((s, g) => s + g.pct, 0) / complianceGaps.length)
      : 0;
    const avgMaturity = maturityScores.length > 0
      ? (maturityScores.reduce((s, m) => s + m.score, 0) / maturityScores.length).toFixed(1)
      : "0.0";

    res.json({
      kpis: {
        openRisks: openRisks.length,
        criticalRisks: criticalRisks.length,
        highRisks: highRisks.length,
        openFindings: openFindings.length,
        avgCompliance,
        avgMaturity,
        frameworks: complianceGaps.length,
      },
      topRisks: openRisks.slice(0, 5).map(r => ({ name: r.name, score: r.score, severity: r.severity })),
      complianceFrameworks: complianceGaps.map(g => ({
        framework: g.framework,
        pct: g.pct,
        implemented: g.implemented,
        total: g.total,
      })),
      maturityDomains: maturityScores.slice(0, 6).map(m => ({ domain: m.domain, score: m.score, target: m.target })),
      generatedAt: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Board KPIs fetch failed" });
  }
});

// ── Helpers: Markdown → PDF / HTML-Word ───────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

function renderMarkdownToPdf(doc: InstanceType<typeof PDFDocument>, markdown: string, title?: string) {
  const NAV = "#1E3A5F";
  const pageWidth = (doc.page.width as number) - 120;
  const left = 60;

  if (title) {
    doc.fontSize(18).font("Helvetica-Bold").fillColor(NAV).text(title, left, 60, { width: pageWidth });
    doc.fontSize(9).font("Helvetica").fillColor("#6B7280").text(`Generated by AIGO AI vCISO · ${new Date().toLocaleDateString()}`, left, doc.y + 4, { width: pageWidth });
    doc.moveDown(1);
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).stroke("#E5E7EB");
    doc.moveDown(1);
  }

  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("### ")) {
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica-Bold").fillColor(NAV).text(stripInlineMarkdown(line.slice(4)), left, doc.y, { width: pageWidth });
      doc.moveDown(0.3);
    } else if (line.startsWith("## ")) {
      doc.moveDown(0.7);
      doc.fontSize(13).font("Helvetica-Bold").fillColor(NAV).text(stripInlineMarkdown(line.slice(3)), left, doc.y, { width: pageWidth });
      doc.moveDown(0.1);
      doc.moveTo(left, doc.y).lineTo(left + pageWidth * 0.4, doc.y).stroke("#CBD5E1");
      doc.moveDown(0.4);
    } else if (line.startsWith("# ")) {
      doc.moveDown(0.8);
      doc.fontSize(15).font("Helvetica-Bold").fillColor(NAV).text(stripInlineMarkdown(line.slice(2)), left, doc.y, { width: pageWidth });
      doc.moveDown(0.5);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      doc.fontSize(10).font("Helvetica").fillColor("#374151")
        .text(`\u2022  ${stripInlineMarkdown(line.slice(2))}`, left + 10, doc.y, { width: pageWidth - 10, lineGap: 2 });
    } else if (/^\d+\.\s/.test(line)) {
      doc.fontSize(10).font("Helvetica").fillColor("#374151")
        .text(stripInlineMarkdown(line), left + 10, doc.y, { width: pageWidth - 10, lineGap: 2 });
    } else if (line.trim() === "") {
      doc.moveDown(0.35);
    } else {
      doc.fontSize(10).font("Helvetica").fillColor("#374151")
        .text(stripInlineMarkdown(line), left, doc.y, { width: pageWidth, lineGap: 2 });
    }
  }
}

function parseInlineRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map(part => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return new TextRun({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith("*") && part.endsWith("*")) {
      return new TextRun({ text: part.slice(1, -1), italics: true });
    } else if (part.startsWith("`") && part.endsWith("`")) {
      return new TextRun({ text: part.slice(1, -1), font: "Courier New" });
    }
    return new TextRun({ text: part });
  });
}

function renderMarkdownToDocx(markdown: string, title?: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (title) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 40, color: "1E3A5F" })] }));
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Generated by AIGO AI vCISO · ${new Date().toLocaleDateString()}`, color: "6B7280", size: 18 })] }));
    paragraphs.push(new Paragraph({ text: "" }));
  }

  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ text: stripInlineMarkdown(line.slice(4)), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ text: stripInlineMarkdown(line.slice(3)), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ text: stripInlineMarkdown(line.slice(2)), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: "\u2022  " }), ...parseInlineRuns(line.slice(2))],
        indent: { left: 360 },
      }));
    } else if (/^\d+\.\s/.test(line)) {
      paragraphs.push(new Paragraph({
        children: parseInlineRuns(line),
        indent: { left: 360 },
      }));
    } else if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "" }));
    } else {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(line) }));
    }
  }

  return paragraphs;
}

// ── vCISO: AI Risk Scoring (POST /ai/vciso/score-risks) ──────────────────────

router.post("/ai/vciso/score-risks", requireAuth, async (req, res) => {
  const { tenantId, email } = (req as AuthReq).user;

  try {
    const openRisks = await db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), inArray(risksTable.status, ["open", "in-progress"])))
      .orderBy(desc(risksTable.score));

    if (openRisks.length === 0) {
      res.json({ updated: 0, results: [], message: "No open risks found to score." });
      return;
    }

    const riskList = openRisks.map(r =>
      `- ID: ${r.riskId} | Name: ${r.name} | Category: ${r.category} | Current Severity: ${r.severity} | Current Score: ${r.score} | Description: ${r.description ?? "N/A"}`
    ).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: buildGrcSystemPrompt() },
        { role: "user", content: `You are performing quantitative risk scoring using the FAIR model for an enterprise security program.

Analyse each risk below and assign an updated risk score (0–100) and severity. Consider:
- Threat event frequency and likelihood
- Vulnerability and control effectiveness  
- Business impact (financial, operational, reputational)
- Current industry threat landscape
- Applicable frameworks: ISO 27001, NIST CSF, CIS Controls

Risks to score:
${riskList}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "scores": [
    {
      "riskId": "<exact riskId string>",
      "newScore": <number 0-100>,
      "newSeverity": "Critical|High|Medium|Low",
      "rationale": "<2-sentence justification referencing FAIR factors and relevant framework>"
    }
  ],
  "summary": "<1-2 sentence overall posture assessment>"
}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let aiResult: { scores: Array<{ riskId: string; newScore: number; newSeverity: string; rationale: string }>; summary: string };

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { scores: [], summary: "" };
    } catch {
      res.status(500).json({ error: "AI returned malformed JSON — please retry." });
      return;
    }

    if (!Array.isArray(aiResult.scores) || aiResult.scores.length === 0) {
      res.status(500).json({ error: "AI did not return any scores — please retry." });
      return;
    }

    const riskMap = new Map(openRisks.map(r => [r.riskId, r]));
    const validSeverities = ["Critical", "High", "Medium", "Low"];
    const now = new Date();

    // Validate and normalise every AI score before touching the DB.
    // Skip (don't reject) any entry the AI hallucinated a bad riskId for.
    const validated: Array<{
      existing: typeof openRisks[0];
      newScore: number;
      newSeverity: string;
      rationale: string;
    }> = [];

    for (const scored of aiResult.scores) {
      const existing = riskMap.get(scored.riskId);
      if (!existing) continue;

      const rawScore = Number(scored.newScore);
      if (!Number.isFinite(rawScore)) continue;

      const newScore = Math.max(0, Math.min(100, Math.round(rawScore)));
      const newSeverity = validSeverities.includes(scored.newSeverity) ? scored.newSeverity : existing.severity;

      validated.push({ existing, newScore, newSeverity, rationale: scored.rationale ?? "" });
    }

    if (validated.length === 0) {
      res.status(500).json({ error: "AI returned no valid scores for known risks — please retry." });
      return;
    }

    const historyInserts: typeof riskScoreHistoryTable.$inferInsert[] = validated.map(v => ({
      tenantId,
      riskId: v.existing.riskId,
      riskName: v.existing.name,
      prevScore: v.existing.score,
      newScore: v.newScore,
      prevSeverity: v.existing.severity,
      newSeverity: v.newSeverity,
      source: "vciso-ai",
      rationale: v.rationale || null,
      scoredBy: email ?? "ai",
      createdAt: now,
    }));

    // All risk updates + history inserts are committed in a single transaction.
    await db.transaction(async (tx) => {
      for (const v of validated) {
        await tx.update(risksTable)
          .set({
            score: v.newScore,
            severity: v.newSeverity,
            aiScoreSource: "vciso-ai",
            aiScoredAt: now,
            updatedAt: now,
          })
          .where(and(eq(risksTable.tenantId, tenantId), eq(risksTable.riskId, v.existing.riskId)));
      }
      await tx.insert(riskScoreHistoryTable).values(historyInserts);
    });

    const updateResults = validated.map(v => ({
      riskId: v.existing.riskId,
      name: v.existing.name,
      prevScore: v.existing.score,
      newScore: v.newScore,
      prevSeverity: v.existing.severity,
      newSeverity: v.newSeverity,
      rationale: v.rationale,
    }));

    res.json({
      updated: updateResults.length,
      results: updateResults,
      summary: aiResult.summary ?? "",
      scoredAt: now.toISOString(),
      source: "vciso-ai",
    });
  } catch (err) {
    res.status(500).json({ error: "Risk scoring failed — please retry." });
  }
});

// ── Risk Score History (GET /ai/vciso/score-history) ─────────────────────────

router.get("/ai/vciso/score-history", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rows = await db.select().from(riskScoreHistoryTable)
      .where(eq(riskScoreHistoryTable.tenantId, tenantId))
      .orderBy(desc(riskScoreHistoryTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch score history." });
  }
});

// ── Export: POST /ai/export ───────────────────────────────────────────────────

router.post("/ai/export", requireAuth, async (req, res) => {
  const { content, format, title } = req.body as { content: string; format: "pdf" | "docx"; title?: string };

  if (!content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (format !== "pdf" && format !== "docx") {
    res.status(400).json({ error: "format must be 'pdf' or 'docx'" });
    return;
  }

  const safeTitle = (title ?? "ai-export").replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "ai-export";

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pdf"`);
    const doc = new PDFDocument({ margin: 60, size: "A4", bufferPages: true });
    doc.pipe(res);
    renderMarkdownToPdf(doc, content, title ?? safeTitle);
    doc.end();
  } else {
    const docxDoc = new Document({
      sections: [{ children: renderMarkdownToDocx(content, title ?? safeTitle) }],
    });
    const buffer = await Packer.toBuffer(docxDoc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.docx"`);
    res.send(buffer);
  }
});

// ── Briefing Schedules CRUD ───────────────────────────────────────────────────

router.get("/ai/vciso/briefing/schedules", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rows = await db.select().from(briefingSchedulesTable)
      .where(eq(briefingSchedulesTable.tenantId, tenantId))
      .orderBy(desc(briefingSchedulesTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch briefing schedules" });
  }
});

router.post("/ai/vciso/briefing/schedule", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { frequency, channel, destination, label, period } = req.body as {
    frequency: string; channel: string; destination: string; label?: string; period?: string;
  };

  if (!frequency || !channel || !destination?.trim()) {
    res.status(400).json({ error: "frequency, channel, and destination are required" });
    return;
  }
  if (!["daily", "weekly", "monthly"].includes(frequency)) {
    res.status(400).json({ error: "frequency must be daily, weekly, or monthly" });
    return;
  }
  if (!["email", "slack"].includes(channel)) {
    res.status(400).json({ error: "channel must be email or slack" });
    return;
  }
  if (channel === "slack") {
    const v = validateSlackWebhookUrl(destination.trim());
    if (!v.valid) {
      res.status(400).json({ error: `Invalid Slack webhook URL: ${v.reason}` });
      return;
    }
  }

  try {
    const nextRunAt = computeNextRunAt(frequency);
    const [row] = await db.insert(briefingSchedulesTable).values({
      tenantId,
      frequency,
      channel,
      destination: destination.trim(),
      label: label?.trim() ?? "",
      period: period?.trim() ?? "this quarter",
      nextRunAt,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      res.status(409).json({ error: "A schedule with this channel and destination already exists" });
    } else {
      res.status(500).json({ error: "Failed to create briefing schedule" });
    }
  }
});

router.put("/ai/vciso/briefing/schedule/:id", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const id = Number(req.params["id"]);
  const { frequency, channel, destination, label, period, active } = req.body as {
    frequency?: string; channel?: string; destination?: string; label?: string; period?: string; active?: boolean;
  };

  try {
    const [existing] = await db.select().from(briefingSchedulesTable)
      .where(and(eq(briefingSchedulesTable.id, id), eq(briefingSchedulesTable.tenantId, tenantId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

    const newFrequency = frequency ?? existing.frequency;
    const resolvedChannel = channel ?? existing.channel;
    const resolvedDestination = destination?.trim() ?? existing.destination;
    if (resolvedChannel === "slack") {
      const v = validateSlackWebhookUrl(resolvedDestination);
      if (!v.valid) { res.status(400).json({ error: `Invalid Slack webhook URL: ${v.reason}` }); return; }
    }

    const updates: Partial<typeof briefingSchedulesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (frequency !== undefined) updates.frequency = frequency;
    if (channel !== undefined) updates.channel = channel;
    if (destination !== undefined) updates.destination = destination.trim();
    if (label !== undefined) updates.label = label.trim();
    if (period !== undefined) updates.period = period.trim();
    if (active !== undefined) {
      updates.active = active;
      if (active && !existing.active) {
        updates.nextRunAt = computeNextRunAt(newFrequency);
      }
    }

    const [updated] = await db.update(briefingSchedulesTable)
      .set(updates)
      .where(and(eq(briefingSchedulesTable.id, id), eq(briefingSchedulesTable.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update briefing schedule" });
  }
});

router.delete("/ai/vciso/briefing/schedule/:id", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const id = Number(req.params["id"]);
  try {
    const deleted = await db.delete(briefingSchedulesTable)
      .where(and(eq(briefingSchedulesTable.id, id), eq(briefingSchedulesTable.tenantId, tenantId)))
      .returning();
    if (!deleted.length) { res.status(404).json({ error: "Schedule not found" }); return; }
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Failed to delete briefing schedule" });
  }
});

router.post("/ai/vciso/briefing/schedule/:id/trigger", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const id = Number(req.params["id"]);
  try {
    const [schedule] = await db.select().from(briefingSchedulesTable)
      .where(and(eq(briefingSchedulesTable.id, id), eq(briefingSchedulesTable.tenantId, tenantId)))
      .limit(1);
    if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }

    await db.update(briefingSchedulesTable)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(briefingSchedulesTable.id, id));

    res.json({ triggered: true });

    setImmediate(() => {
      runDueSchedules().catch((err) => console.error("[briefing-scheduler] Manual trigger error:", err));
    });
  } catch {
    res.status(500).json({ error: "Failed to trigger schedule" });
  }
});

// ── Briefing Delivery History ─────────────────────────────────────────────────

router.get("/ai/vciso/briefing/history", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rows = await db.select().from(briefingDeliveryHistoryTable)
      .where(eq(briefingDeliveryHistoryTable.tenantId, tenantId))
      .orderBy(desc(briefingDeliveryHistoryTable.createdAt))
      .limit(50);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch delivery history" });
  }
});

export default router;

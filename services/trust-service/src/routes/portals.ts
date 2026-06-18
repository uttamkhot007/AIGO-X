import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db, requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import {
  portalConfigsTable, portalAccessLogTable, tenantsTable,
  questionnairesTable, ropaRecordsTable,
  questionnaireQuestionsTable, questionnaireAnswersTable,
} from "@workspace/db";
// Cross-domain data is fetched via service-to-service HTTP calls, not direct DB queries.
// Each helper in portal-data-client uses a short-lived internal JWT for auth.
import {
  fetchRisks,
  fetchFindings,
  fetchVendors,
  fetchRiskAppetite,
  fetchControls,
  fetchTickets,
  fetchAttestations,
  fetchFirstControl,
} from "../lib/portal-data-client.js";
// Inter-service write clients for portal-action endpoints (incident + evidence)
import { ServiceClient, signServiceToken } from "@workspace/service-kit";

const aiClient       = new ServiceClient(process.env["AI_SERVICE_URL"]       ?? "http://ai-service:8008");
const evidenceClient = new ServiceClient(process.env["EVIDENCE_SERVICE_URL"] ?? "http://evidence-service:8006");

function svcAuth(tenantId: number) { return `Bearer ${signServiceToken(tenantId)}`; }

const router = Router();

// ── Widget catalogue defaults ──────────────────────────────────────────────────
const PORTAL_DEFAULTS: Record<string, { displayName: string; description: string; accentColor: string; widgetKeys: string[] }> = {
  ciso:     { displayName: "CISO Dashboard",      description: "Executive security posture view for the CISO",          accentColor: "#3B82F6", widgetKeys: ["security_posture_score","top_risks","open_critical_findings","compliance_status","ai_security_briefing","incident_trend"] },
  cro:      { displayName: "CRO Risk Portal",     description: "Board-ready risk intelligence for the Chief Risk Officer", accentColor: "#8B5CF6", widgetKeys: ["risk_appetite_gauge","risk_register_summary","risk_treatment_pipeline","vendor_risk_exposure","pdf_export"] },
  chro:     { displayName: "CHRO People Portal",  description: "People compliance and privacy data for the CHRO",        accentColor: "#EC4899", widgetKeys: ["policy_ack_rate","training_completion","ropa_summary","people_risk_count","attestation_donut"] },
  vendor:   { displayName: "Vendor Portal",       description: "Questionnaire inbox and evidence submission for vendors", accentColor: "#F59E0B", widgetKeys: ["questionnaire_inbox","evidence_upload","assessment_timeline","compliance_badge"] },
  employee: { displayName: "Employee Portal",     description: "Personal compliance tasks and security tips",             accentColor: "#10B981", widgetKeys: ["my_open_tasks","security_tip","report_incident"] },
};

const PORTAL_TYPES = Object.keys(PORTAL_DEFAULTS);

// ── Derive tenantId strictly from authenticated JWT — fail closed if absent ────
function getTenantId(req: Parameters<typeof requireAuth>[0]): number {
  const u = (req as typeof req & { user: JwtPayload }).user;
  if (!u?.tenantId) {
    const err = Object.assign(new Error("Authenticated user has no tenantId — access denied"), { status: 401 });
    throw err;
  }
  return u.tenantId;
}

function ipHash(ip: string | undefined): string {
  return createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 16);
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function newTicketId(): string {
  return `INC-${Date.now().toString(36).toUpperCase()}`;
}

// ── Shared token validator for public portal endpoints ─────────────────────────
// Returns tenantId, portalId, AND the enabled widgetKeys for that portal.
// Callers must check widgetKeys to enforce per-portal capability authorization.
interface PortalTokenCtx { tenantId: number; portalId: number; widgetKeys: string[] }

async function validatePortalToken(type: string, token: string): Promise<PortalTokenCtx | null> {
  if (!token || !PORTAL_TYPES.includes(type)) return null;
  const [portal] = await db
    .select({
      id:             portalConfigsTable.id,
      tenantId:       portalConfigsTable.tenantId,
      tokenExpiresAt: portalConfigsTable.tokenExpiresAt,
      widgetKeys:     portalConfigsTable.widgetKeys,
    })
    .from(portalConfigsTable)
    .where(and(
      eq(portalConfigsTable.portalType, type),
      eq(portalConfigsTable.accessToken, token),
      eq(portalConfigsTable.enabled, true),
    ));
  if (!portal) return null;
  if (portal.tokenExpiresAt && new Date() > new Date(portal.tokenExpiresAt)) return null;
  return {
    tenantId:   portal.tenantId,
    portalId:   portal.id,
    widgetKeys: (portal.widgetKeys as string[]) ?? [],
  };
}

// Checks that a given widget key is enabled for this portal token context.
// Used to enforce server-side capability authorization for public action endpoints
// (frontend hides the widget, backend independently enforces it).
function requireWidget(ctx: PortalTokenCtx, widgetKey: string, res: any): boolean {
  if (!ctx.widgetKeys.includes(widgetKey)) {
    res.status(403).json({ error: `Action '${widgetKey}' is not enabled for this portal` });
    return false;
  }
  return true;
}

// ── Ensure all 5 portal configs exist for a tenant (idempotent) ───────────────
async function ensurePortalDefaults(tenantId: number) {
  for (const [portalType, def] of Object.entries(PORTAL_DEFAULTS)) {
    const [existing] = await db
      .select({ id: portalConfigsTable.id, widgetKeys: portalConfigsTable.widgetKeys })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.portalType, portalType)));
    if (!existing) {
      await db.insert(portalConfigsTable).values({
        tenantId,
        portalType,
        displayName:  def.displayName,
        description:  def.description,
        accentColor:  def.accentColor,
        enabled:      false,
        widgetKeys:   def.widgetKeys as any,
        accessToken:  newToken(),
      });
    } else {
      // Auto-backfill widgetKeys if empty/null (e.g. imported config with no widgets)
      const keys = existing.widgetKeys as string[] | null;
      if (!keys || keys.length === 0) {
        await db
          .update(portalConfigsTable)
          .set({ widgetKeys: def.widgetKeys as any, updatedAt: new Date() })
          .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, existing.id)));
      }
    }
  }
}

// ── GET /portals — list all 5 portal configs for tenant ──────────────────────
router.get("/portals", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    await ensurePortalDefaults(tenantId);
    const portals = await db
      .select()
      .from(portalConfigsTable)
      .where(eq(portalConfigsTable.tenantId, tenantId))
      .orderBy(portalConfigsTable.id);
    const enriched = await Promise.all(portals.map(async (p) => {
      const logs = await db
        .select({ accessedAt: portalAccessLogTable.accessedAt })
        .from(portalAccessLogTable)
        .where(eq(portalAccessLogTable.portalId, p.id))
        .orderBy(desc(portalAccessLogTable.accessedAt))
        .limit(1);
      const [last] = logs;
      return { ...p, lastAccessedAt: last?.accessedAt ?? null };
    }));
    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /portals — create or upsert a portal config by type ─────────────────
router.post("/portals", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { portalType, displayName, description, accentColor, enabled, widgetKeys } = req.body;
    if (!portalType || !PORTAL_TYPES.includes(portalType)) {
      res.status(400).json({ error: `portalType must be one of: ${PORTAL_TYPES.join(", ")}` }); return;
    }
    const defaults = PORTAL_DEFAULTS[portalType];
    const [existing] = await db
      .select({ id: portalConfigsTable.id })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.portalType, portalType)));

    if (existing) {
      const [updated] = await db
        .update(portalConfigsTable)
        .set({
          displayName:  displayName  ?? defaults.displayName,
          description:  description  ?? defaults.description,
          accentColor:  accentColor  ?? defaults.accentColor,
          enabled:      enabled      ?? false,
          widgetKeys:   (widgetKeys ?? defaults.widgetKeys) as any,
          updatedAt:    new Date(),
        })
        .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, existing.id)))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db
        .insert(portalConfigsTable)
        .values({
          tenantId,
          portalType,
          displayName:  displayName  ?? defaults.displayName,
          description:  description  ?? defaults.description,
          accentColor:  accentColor  ?? defaults.accentColor,
          enabled:      enabled      ?? false,
          widgetKeys:   (widgetKeys ?? defaults.widgetKeys) as any,
          accessToken:  newToken(),
        })
        .returning();
      res.status(201).json(created);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /portals/:id — single portal config ───────────────────────────────────
router.get("/portals/:id", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [portal] = await db
      .select()
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))));
    if (!portal) { res.status(404).json({ error: "Portal not found" }); return; }
    res.json(portal);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /portals/:id — update portal config ─────────────────────────────────
router.patch("/portals/:id", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { displayName, description, accentColor, enabled, widgetKeys } = req.body;
    const [portal] = await db
      .select({ id: portalConfigsTable.id })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))));
    if (!portal) { res.status(404).json({ error: "Portal not found" }); return; }
    const [updated] = await db
      .update(portalConfigsTable)
      .set({
        ...(displayName !== undefined && { displayName }),
        ...(description !== undefined && { description }),
        ...(accentColor !== undefined && { accentColor }),
        ...(enabled     !== undefined && { enabled }),
        ...(widgetKeys  !== undefined && { widgetKeys }),
        updatedAt: new Date(),
      })
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))))
      .returning();
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /portals/:id — remove a portal config ──────────────────────────────
router.delete("/portals/:id", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [portal] = await db
      .select({ id: portalConfigsTable.id })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))));
    if (!portal) { res.status(404).json({ error: "Portal not found" }); return; }
    await db
      .delete(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, portal.id)));
    res.json({ deleted: true, id: portal.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /portals/:id/regenerate-token — rotate access token ─────────────────
router.post("/portals/:id/regenerate-token", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [portal] = await db
      .select({ id: portalConfigsTable.id })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))));
    if (!portal) { res.status(404).json({ error: "Portal not found" }); return; }
    const token = newToken();
    const [updated] = await db
      .update(portalConfigsTable)
      .set({ accessToken: token, tokenExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))))
      .returning();
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /portals/:id/access-log — last 10 access log entries ─────────────────
router.get("/portals/:id/access-log", requireAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [portal] = await db
      .select({ id: portalConfigsTable.id })
      .from(portalConfigsTable)
      .where(and(eq(portalConfigsTable.tenantId, tenantId), eq(portalConfigsTable.id, Number(req.params.id))));
    if (!portal) { res.status(404).json({ error: "Portal not found" }); return; }
    const logs = await db
      .select()
      .from(portalAccessLogTable)
      .where(eq(portalAccessLogTable.portalId, portal.id))
      .orderBy(desc(portalAccessLogTable.accessedAt))
      .limit(10);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /portal-view/:type — PUBLIC: validate token, return portal config ──────
router.get("/portal-view/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const token = String(req.query.token ?? "");
    const ctx = await validatePortalToken(type, token);
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }

    const [portal] = await db
      .select({
        portalType:  portalConfigsTable.portalType,
        displayName: portalConfigsTable.displayName,
        description: portalConfigsTable.description,
        accentColor: portalConfigsTable.accentColor,
        widgetKeys:  portalConfigsTable.widgetKeys,
      })
      .from(portalConfigsTable)
      .where(eq(portalConfigsTable.id, ctx.portalId));

    const [tenant] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, ctx.tenantId));

    await db.insert(portalAccessLogTable).values({
      portalId: ctx.portalId,
      ipHash:   ipHash(req.ip ?? req.headers["x-forwarded-for"] as string),
    });

    res.json({
      portalType:  portal.portalType,
      displayName: portal.displayName,
      description: portal.description,
      accentColor: portal.accentColor,
      widgetKeys:  portal.widgetKeys,
      tenantName:  tenant?.name ?? "Your Organization",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /portal-data/:type — PUBLIC: token-gated aggregated widget data ────────
router.get("/portal-data/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const token = String(req.query.token ?? "");
    const ctx = await validatePortalToken(type, token);
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }

    const tenantId = ctx.tenantId;

    // Get widgetKeys to decide what to query
    const [portalRow] = await db
      .select({ widgetKeys: portalConfigsTable.widgetKeys })
      .from(portalConfigsTable)
      .where(eq(portalConfigsTable.id, ctx.portalId));
    const keys = (portalRow?.widgetKeys as string[]) ?? [];

    const result: Record<string, unknown> = {};

    // ── Cross-domain data is fetched via service-to-service HTTP ─────────────
    // Each fetchXxx() call uses a short-lived internal JWT (signServiceToken) so
    // the upstream service filters by tenant automatically. We fetch in parallel
    // only the data the portal's enabled widgetKeys actually need.

    const needsRisks     = keys.some(k => ["top_risks","risk_register_summary","risk_treatment_pipeline","people_risk_count"].includes(k));
    const needsFindings  = keys.some(k => ["open_critical_findings","security_posture_score","security_tip"].includes(k));
    const needsVendors   = keys.includes("vendor_risk_exposure");
    const needsAppetite  = keys.includes("risk_appetite_gauge");
    const needsControls  = keys.includes("compliance_status");
    const needsAttests   = keys.some(k => ["policy_ack_rate","attestation_donut","training_completion"].includes(k));

    const [allRisks, allFindings, allVendors, appetiteRow, allControls, allAttestations] = await Promise.all([
      needsRisks    ? fetchRisks(tenantId)        : Promise.resolve([]),
      needsFindings ? fetchFindings(tenantId)     : Promise.resolve([]),
      needsVendors  ? fetchVendors(tenantId)      : Promise.resolve([]),
      needsAppetite ? fetchRiskAppetite(tenantId) : Promise.resolve(null),
      needsControls ? fetchControls(tenantId)     : Promise.resolve([]),
      needsAttests  ? fetchAttestations(tenantId) : Promise.resolve([]),
    ]);

    // ── Risks (from risk-service) ─────────────────────────────────────────────
    if (needsRisks) {
      result.risks = allRisks.slice(0, 10);
    }

    // ── Cloud findings → open critical count + posture score (from secops-service)
    if (needsFindings) {
      result.findings = allFindings;
      const open  = allFindings.filter((f: any) => f.status === "open").length;
      const total = allFindings.length || 1;
      result.summary = { overallScore: Math.max(30, Math.round(100 - (open / total) * 60)) };
    }

    // ── Vendor risk exposure (from risk-service) ──────────────────────────────
    if (needsVendors) {
      result.vendors = allVendors;
    }

    // ── Risk appetite gauge (from risk-service) ───────────────────────────────
    if (needsAppetite) {
      result.appetite = appetiteRow
        ? { current: Math.round(appetiteRow.current), threshold: Math.round(appetiteRow.threshold), breached: appetiteRow.breached }
        : { current: 68, threshold: 75, breached: false };
    }

    // ── Questionnaire inbox — trust-service owns questionnaires table ─────────
    if (keys.some(k => ["questionnaire_inbox","my_open_tasks","assessment_timeline","compliance_badge"].includes(k))) {
      const rows = await db
        .select({ qId: questionnairesTable.qId, name: questionnairesTable.name, status: questionnairesTable.status, dueDate: questionnairesTable.dueDate, recipient: questionnairesTable.recipient, type: questionnairesTable.type })
        .from(questionnairesTable)
        .where(eq(questionnairesTable.tenantId, tenantId));
      result.questionnaires = rows;
    }

    // ── ROPA summary — trust-service owns ROPA records ────────────────────────
    if (keys.includes("ropa_summary")) {
      const rows = await db
        .select({ ropaId: ropaRecordsTable.ropaId, process: ropaRecordsTable.process, status: ropaRecordsTable.status, riskLevel: ropaRecordsTable.riskLevel })
        .from(ropaRecordsTable)
        .where(eq(ropaRecordsTable.tenantId, tenantId));
      result.ropa = rows;
    }

    // ── Compliance status per framework (from compliance-service) ─────────────
    if (needsControls) {
      const byFw: Record<string, { total: number; pass: number }> = {};
      allControls.forEach((c: any) => {
        if (!byFw[c.framework]) byFw[c.framework] = { total: 0, pass: 0 };
        byFw[c.framework].total++;
        if (c.status === "implemented" || c.status === "passed" || c.status === "compliant") byFw[c.framework].pass++;
      });
      result.compliance = Object.entries(byFw).map(([framework, d]) => ({
        framework,
        score: d.total > 0 ? Math.round((d.pass / d.total) * 100) : 0,
        pass:  d.pass,
        total: d.total,
      }));
    }

    // ── Incident trend (via ai-service tickets endpoint) ──────────────────────
    if (keys.includes("incident_trend")) {
      const since = new Date();
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      const tickets = await fetchTickets(tenantId, since);
      const buckets: Record<string, number> = {};
      for (let i = 0; i < 12; i++) {
        const d = new Date(since);
        d.setMonth(d.getMonth() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets[key] = 0;
      }
      tickets.forEach((t: any) => {
        const d = new Date(t.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in buckets) buckets[key]++;
      });
      result.incidentTrend = Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => {
          const [y, m] = key.split("-");
          const label = new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "short" });
          return { month: label, count };
        });
    }

    // ── Policy acknowledgment rate (from governance-service) ──────────────────
    if (needsAttests) {
      const total = allAttestations.length || 1;
      const done  = allAttestations.filter((a: any) => a.status === "completed").length;
      const byDept: Record<string, { total: number; done: number }> = {};
      allAttestations.forEach((a: any) => {
        if (!byDept[a.dept]) byDept[a.dept] = { total: 0, done: 0 };
        byDept[a.dept].total++;
        if (a.status === "completed") byDept[a.dept].done++;
      });
      result.policyAck = {
        overallPct: Math.round((done / total) * 100),
        byDept: Object.entries(byDept).map(([dept, d]) => ({
          dept,
          pct: Math.round((d.done / d.total) * 100),
        })),
      };
      if (keys.includes("training_completion")) {
        result.training = { pct: Math.round((done / total) * 100), completed: done, total: allAttestations.length };
      }
    }

    // ── AI security briefing (synthesised narrative) ──────────────────────────
    if (keys.includes("ai_security_briefing")) {
      const findingsArr = (result.findings as any[] | undefined) ?? [];
      const risksArr    = (result.risks    as any[] | undefined) ?? [];
      const openCount   = findingsArr.filter((f: any) => f.status === "open").length;
      const critCount   = findingsArr.filter((f: any) => f.severity === "Critical" && f.status === "open").length;
      const highRisks   = risksArr.filter((r: any) => r.severity === "Critical" || r.severity === "High").length;
      result.briefings = [{
        content: `Security posture is ${openCount === 0 ? "clean" : `showing ${openCount} open finding${openCount !== 1 ? "s" : ""}`}${critCount > 0 ? `, including ${critCount} critical` : ""}. ${highRisks > 0 ? `${highRisks} high/critical risk${highRisks !== 1 ? "s" : ""} require attention.` : "Risk register is under control."} Recommend reviewing pending vendor assessments and ensuring all policy attestations are up to date.`,
      }];
    }

    // ── Security tip (context-aware, from live security state) ───────────────
    if (keys.includes("security_tip")) {
      const findingsArr = (result.findings as any[] | undefined) ?? await fetchFindings(tenantId);
      const openCrit  = findingsArr.filter((f: any) => f.severity === "Critical" && f.status === "open").length;
      const openHigh  = findingsArr.filter((f: any) => f.severity === "High"     && f.status === "open").length;
      const totalOpen = findingsArr.filter((f: any) => f.status === "open").length;
      const contextTips: Array<{ condition: boolean; tip: string }> = [
        { condition: openCrit > 0,  tip: `Your organisation has ${openCrit} open critical security finding${openCrit > 1 ? "s" : ""}. Report anything suspicious immediately — every minute counts.` },
        { condition: openHigh > 0,  tip: `${openHigh} high-severity finding${openHigh > 1 ? "s are" : " is"} open. Stay alert and lock your screen whenever you step away.` },
        { condition: totalOpen > 5, tip: `${totalOpen} security findings are open. Enable multi-factor authentication if you haven't — it stops 99% of credential attacks.` },
      ];
      const ctx_tip = contextTips.find(t => t.condition);
      const dailyTips = [
        "Enable MFA on your email account — it's your master key and the single most impactful step you can take.",
        "Use a unique password for every service — a password manager makes this completely effortless.",
        "Lock your screen whenever you step away, even for just a moment.",
        "Never click links in unexpected emails — navigate directly to the site instead.",
        "Report suspicious activity immediately — early detection stops breaches before they escalate.",
        "Keep your devices and software up to date — most breaches exploit known, patchable vulnerabilities.",
        "Be cautious with USB drives from unknown sources — they can introduce malware instantly.",
      ];
      const dayIdx = new Date().getDate() % dailyTips.length;
      result.securityTip = { tip: ctx_tip?.tip ?? dailyTips[dayIdx], source: ctx_tip ? "db" : "static" };
    }

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC PORTAL ACTION ENDPOINTS — token-gated write operations
// Allows unauthenticated portal users to submit data without a platform JWT.
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /portal-action/incident — report a security incident ─────────────────
// Capability-gated: portal must have 'report_incident' widget enabled.
router.post("/portal-action/incident", async (req, res) => {
  try {
    const { portalType, token, description } = req.body;
    if (!description?.trim()) { res.status(400).json({ error: "description is required" }); return; }
    const ctx = await validatePortalToken(portalType ?? "", token ?? "");
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }
    if (!requireWidget(ctx, "report_incident", res)) return;

    // Create ticket via ai-service (service-to-service call — no direct ticketsTable access)
    const ticket = await aiClient.post<{ ticketId: string }>(
      "/api/tickets",
      {
        tenantId:  ctx.tenantId,
        ticketId:  newTicketId(),
        priority:  "High",
        title:     `Portal Incident Report: ${String(description).slice(0, 80)}`,
        category:  "Security Incident",
        assignee:  "security-team",
        status:    "open",
        sla:       "4h",
      },
      svcAuth(ctx.tenantId),
    );

    res.status(201).json({ created: true, ticketId: ticket.ticketId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /portal-action/evidence — submit evidence via service-to-service calls ──
// Capability-gated: portal must have 'evidence_upload' widget enabled.
// Frontend sends: fileName, fileHash (SHA-256), fileSize (bytes), mimeType, note.
//
// The submission is forwarded to TWO upstream services:
//   1. evidence-service (POST /api/evidence/manual) — stores the artifact in the
//      evidence library so it is reviewable by auditors.
//   2. ai-service (POST /api/tickets) — creates a compliance workflow ticket so
//      the compliance team is notified and can follow up with the vendor.
router.post("/portal-action/evidence", async (req, res) => {
  try {
    const { portalType, token, fileName, fileHash, fileSize, mimeType, note } = req.body;
    const ctx = await validatePortalToken(portalType ?? "", token ?? "");
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }
    if (!requireWidget(ctx, "evidence_upload", res)) return;
    if (!fileName) { res.status(400).json({ error: "fileName is required" }); return; }

    const sizeLabel = fileSize ? `${Math.round(Number(fileSize) / 1024)}KB` : "unknown size";
    const hashLabel = fileHash ? `SHA-256: ${String(fileHash).slice(0, 16)}…` : "not provided";
    const metaLine  = `${String(fileName)} · ${mimeType ?? "unknown"} · ${sizeLabel} · ${hashLabel}`;

    // ── 1. Create evidence record via evidence-service (service-to-service) ─────
    // Fetch a control ref from compliance-service for linking, then POST to evidence-service.
    let evidenceArtifactId: string | null = null;
    try {
      const ctrl = await fetchFirstControl(ctx.tenantId);
      if (ctrl) {
        const evidenceResp = await evidenceClient.post<{ artifactId?: string }>(
          "/api/evidence/manual",
          {
            controlId:          ctrl.id,
            controlRef:         ctrl.controlId,
            fileName:           String(fileName),
            fileHash:           fileHash  ?? null,
            fileSize:           fileSize  ?? null,
            mimeType:           mimeType  ?? null,
            note:               note      ?? null,
            portalType,
            submittedViaPortal: true,
          },
          svcAuth(ctx.tenantId),
        );
        evidenceArtifactId = evidenceResp.artifactId ?? null;
      }
    } catch {
      // Non-fatal — continue to ticket creation even if evidence store fails
    }

    // ── 2. Create compliance workflow ticket via ai-service (service-to-service)
    const resolution = `File: ${metaLine}${note ? ` | Note: ${String(note).slice(0, 400)}` : ""}${evidenceArtifactId ? ` | Evidence ref: ${evidenceArtifactId}` : ""}`;
    const ticket = await aiClient.post<{ ticketId: string }>(
      "/api/tickets",
      {
        tenantId:   ctx.tenantId,
        ticketId:   newTicketId(),
        priority:   "Medium",
        title:      `Evidence Submission: ${String(fileName).slice(0, 100)}`,
        category:   "Evidence Upload",
        assignee:   "compliance-team",
        status:     "open",
        sla:        "72h",
        resolution,
      },
      svcAuth(ctx.tenantId),
    );

    res.status(201).json({
      created:           true,
      ticketId:          ticket.ticketId,
      evidenceArtifactId,
      fileHash,
      fileSize,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /portal-action/questionnaire/:qId/start — begin a questionnaire ─────
// Capability-gated: portal must have 'questionnaire_inbox' widget enabled.
// Transitions questionnaire from draft/pending → in_review (fill phase).
router.patch("/portal-action/questionnaire/:qId/start", async (req, res) => {
  try {
    const { qId } = req.params;
    const { portalType, token } = req.body;
    const ctx = await validatePortalToken(portalType ?? "", token ?? "");
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }
    if (!requireWidget(ctx, "questionnaire_inbox", res)) return;

    const [existing] = await db
      .select({ id: questionnairesTable.id, status: questionnairesTable.status })
      .from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, ctx.tenantId), eq(questionnairesTable.qId, qId)));
    if (!existing) { res.status(404).json({ error: "Questionnaire not found" }); return; }
    if (existing.status === "completed") { res.status(409).json({ error: "Questionnaire already completed" }); return; }
    if (existing.status === "in_review")  { res.status(409).json({ error: "Questionnaire already started — use /submit to complete" }); return; }

    const [updated] = await db
      .update(questionnairesTable)
      .set({ status: "in_review", updatedAt: new Date() })
      .where(and(eq(questionnairesTable.tenantId, ctx.tenantId), eq(questionnairesTable.qId, qId)))
      .returning({ qId: questionnairesTable.qId, status: questionnairesTable.status });

    res.json({ updated: true, qId: updated.qId, status: updated.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /portal-action/questionnaire/:qId/questions — load questions & answers ─
// Capability-gated: portal must have 'questionnaire_inbox' widget enabled.
// Returns the question list + any existing answer map for the questionnaire.
router.get("/portal-action/questionnaire/:qId/questions", async (req, res) => {
  try {
    const { qId } = req.params;
    const { token, portalType } = req.query;
    const ctx = await validatePortalToken(String(portalType ?? ""), String(token ?? ""));
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }
    if (!requireWidget(ctx, "questionnaire_inbox", res)) return;

    // Verify questionnaire belongs to this tenant
    const [q] = await db
      .select({ id: questionnairesTable.id, status: questionnairesTable.status })
      .from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, ctx.tenantId), eq(questionnairesTable.qId, qId)));
    if (!q) { res.status(404).json({ error: "Questionnaire not found" }); return; }

    const [questions, answers] = await Promise.all([
      db.select({
          questionId: questionnaireQuestionsTable.questionId,
          number:     questionnaireQuestionsTable.number,
          category:   questionnaireQuestionsTable.category,
          question:   questionnaireQuestionsTable.question,
          source:     questionnaireQuestionsTable.source,
          orderIdx:   questionnaireQuestionsTable.orderIdx,
        })
        .from(questionnaireQuestionsTable)
        .where(and(
          eq(questionnaireQuestionsTable.tenantId, ctx.tenantId),
          eq(questionnaireQuestionsTable.questionnaireId, qId),
        ))
        .orderBy(questionnaireQuestionsTable.orderIdx),
      db.select({ questionId: questionnaireAnswersTable.questionId, answer: questionnaireAnswersTable.answer })
        .from(questionnaireAnswersTable)
        .where(and(
          eq(questionnaireAnswersTable.tenantId, ctx.tenantId),
          eq(questionnaireAnswersTable.questionnaireId, qId),
        )),
    ]);

    const answerMap: Record<string, string> = {};
    answers.forEach(a => { answerMap[a.questionId] = a.answer; });

    res.json({ questions, answerMap });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /portal-action/questionnaire/:qId/submit — fill answers + complete ───
// Capability-gated: portal must have 'questionnaire_inbox' widget enabled.
// Accepts { portalType, token, answers: { [questionId]: string } }.
// Upserts all answers into questionnaireAnswersTable, then marks status = completed.
router.patch("/portal-action/questionnaire/:qId/submit", async (req, res) => {
  try {
    const { qId } = req.params;
    const { portalType, token, answers } = req.body;
    const ctx = await validatePortalToken(portalType ?? "", token ?? "");
    if (!ctx) { res.status(403).json({ error: "Invalid or expired token" }); return; }
    if (!requireWidget(ctx, "questionnaire_inbox", res)) return;

    const [existing] = await db
      .select({ id: questionnairesTable.id, status: questionnairesTable.status })
      .from(questionnairesTable)
      .where(and(eq(questionnairesTable.tenantId, ctx.tenantId), eq(questionnairesTable.qId, qId)));
    if (!existing) { res.status(404).json({ error: "Questionnaire not found" }); return; }
    if (existing.status === "completed") { res.status(409).json({ error: "Questionnaire already completed" }); return; }

    // Upsert all provided answers into the normalised answers table
    if (answers && typeof answers === "object") {
      const entries = Object.entries(answers as Record<string, string>);
      for (const [questionId, answer] of entries) {
        if (!questionId || typeof answer !== "string") continue;
        await db
          .insert(questionnaireAnswersTable)
          .values({
            tenantId:        ctx.tenantId,
            questionnaireId: qId,
            questionId,
            answer:          answer.slice(0, 4000),
            answerSource:    "manual",
            status:          "reviewed",
            updatedAt:       new Date(),
          })
          .onConflictDoUpdate({
            target: [
              questionnaireAnswersTable.tenantId,
              questionnaireAnswersTable.questionnaireId,
              questionnaireAnswersTable.questionId,
            ],
            set: {
              answer:       answer.slice(0, 4000),
              answerSource: "manual",
              status:       "reviewed",
              updatedAt:    new Date(),
            },
          });
      }
    }

    const [updated] = await db
      .update(questionnairesTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(questionnairesTable.tenantId, ctx.tenantId), eq(questionnairesTable.qId, qId)))
      .returning({ qId: questionnairesTable.qId, status: questionnairesTable.status });

    res.json({ updated: true, qId: updated.qId, status: updated.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

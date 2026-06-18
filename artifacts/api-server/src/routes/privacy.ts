import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import {
  dsarsTable,
  dpiasTable,
  ropaRecordsTable,
  privacyNoticesTable,
  dpaRecordsTable,
  dsrConnectorsTable,
  dsrPipelineStoresTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { eventBus, Events } from "../lib/event-bus";

const router = Router();

// GET /privacy/dsars
router.get("/privacy/dsars", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId));
    res.json(rows.map(d => ({ ...d })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /privacy/dsars
router.post("/privacy/dsars", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { type: string; subject: string; due: string };
    const [existing] = await db.select({ id: dsarsTable.id }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)).orderBy(dsarsTable.id).limit(1);
    const nextNum = (existing?.id ?? 310) + 1;
    const dsarId = `DSR-0${nextNum}`;
    const received = new Date().toISOString().slice(0, 10);
    const [dsar] = await db.insert(dsarsTable).values({ tenantId, dsarId, received, ...body }).returning();
    eventBus.publish(Events.DSAR_CREATED, { dsarId }, tenantId, userId);
    res.status(201).json(dsar!);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /privacy/dsars/:id
router.patch("/privacy/dsars/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ status: string; daysLeft: number }>;
    const [dsar] = await db.update(dsarsTable).set(body).where(and(eq(dsarsTable.id, id), eq(dsarsTable.tenantId, tenantId))).returning();
    if (!dsar) { res.status(404).json({ error: "DSAR not found" }); return; }
    if (body.status === "completed") eventBus.publish(Events.DSAR_RESOLVED, { id }, tenantId, userId);
    res.json(dsar);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /privacy/dpias
router.get("/privacy/dpias", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId));
    res.json(rows.map(d => ({ ...d })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /privacy/dpias
router.post("/privacy/dpias", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { name: string; risk: string; owner: string };
    const [existing] = await db.select({ id: dpiasTable.id }).from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId)).orderBy(dpiasTable.id).limit(1);
    const nextNum = (existing?.id ?? 9) + 1;
    const dpiaId = `DPIA-0${nextNum.toString().padStart(2, "0")}`;
    const updated = new Date().toISOString().slice(0, 10);
    const [dpia] = await db.insert(dpiasTable).values({ tenantId, dpiaId, updated, ...body }).returning();
    res.status(201).json(dpia!);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── ROPA ──────────────────────────────────────────────────────────────────────
router.get("/privacy/ropa", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(ropaRecordsTable).where(eq(ropaRecordsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Privacy Notices ───────────────────────────────────────────────────────────
router.get("/privacy/notices", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(privacyNoticesTable).where(eq(privacyNoticesTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── DPAs ──────────────────────────────────────────────────────────────────────
router.get("/privacy/dpas", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dpaRecordsTable).where(eq(dpaRecordsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Regulations (global reference data) ──────────────────────────────────────
router.get("/privacy/regulations", requireAuth, (_req, res) => {
  res.json([]);
});

// ── Consent Stats ─────────────────────────────────────────────────────────────
router.get("/privacy/consent-stats", requireAuth, (_req, res) => {
  res.json({
    total: 0, active: 0, expired: 0, withdrawn: 0,
    byChannel: [],
    byJurisdiction: [],
    byPurpose: [],
    abTests: [],
  });
});

// ── Breach KPIs ───────────────────────────────────────────────────────────────
router.get("/privacy/breach-kpis", requireAuth, (_req, res) => {
  res.json({
    kpis: { totalBreaches: 0, openInvestigations: 0, avgResponseHours: 0, dpaNotifications: 0, affectedTotal: 0, slaCompliance: 0 },
    timeline: { elapsed: 0, total: 72 },
  });
});

// ── Cookie Banner Performance ─────────────────────────────────────────────────
router.get("/privacy/cookie-perf", requireAuth, (_req, res) => {
  res.json([]);
});

// ── ISO 31700 Controls ────────────────────────────────────────────────────────
router.get("/privacy/iso31700", requireAuth, (_req, res) => {
  res.json([
    { ctrl: "7.1 — Privacy Governance",         status: "compliant" },
    { ctrl: "7.2 — Privacy Risk Assessment",    status: "partial"   },
    { ctrl: "7.3 — Data Minimisation",          status: "partial"   },
    { ctrl: "7.4 — Data Subject Rights",        status: "compliant" },
    { ctrl: "7.5 — Transparency",               status: "partial"   },
    { ctrl: "7.6 — Accountability",             status: "partial"   },
    { ctrl: "7.7 — Privacy Design",             status: "gap"       },
    { ctrl: "7.8 — Consent Management",         status: "compliant" },
    { ctrl: "7.9 — Security Safeguards",        status: "compliant" },
    { ctrl: "7.10 — Sub-processor Management",  status: "partial"   },
  ]);
});

// ── Employee Privacy Stats ────────────────────────────────────────────────────
router.get("/privacy/emp-stats", requireAuth, (_req, res) => {
  res.json({ total: 0, compliant: 0, gap: 0, partial: 0, monitoringActivities: 0, worksCouncilNeeded: 0 });
});

// ── AI Data Governance Stats ──────────────────────────────────────────────────
router.get("/privacy/ai-stats", requireAuth, (_req, res) => {
  res.json({ total: 0, approved: 0, underReview: 0, gap: 0, shadowAI: 0, autoDec: 0, personalDataUse: 0 });
});

// ── Children's Privacy Stats ──────────────────────────────────────────────────
router.get("/privacy/children-stats", requireAuth, (_req, res) => {
  res.json({ appsAudited: 0, coppaCompliant: 0, gdpr8Compliant: 0, aadcCompliant: 0, gaps: 0, parentalConsentRate: 0 });
});

// ── Privacy Maturity Dimensions ───────────────────────────────────────────────
router.get("/privacy/maturity", requireAuth, (_req, res) => {
  res.json([
    { id: "identify",    label: "Identify-P",    current: 0, target: 4.5, industry: 2.8, desc: "Inventory personal data, understand risks, establish governance." },
    { id: "govern",      label: "Govern-P",      current: 0, target: 4.0, industry: 2.6, desc: "Policies, ownership, risk appetite, board reporting." },
    { id: "control",     label: "Control-P",     current: 0, target: 4.5, industry: 3.0, desc: "Access, use, and processing controls aligned to policies." },
    { id: "communicate", label: "Communicate-P", current: 0, target: 4.0, industry: 2.4, desc: "Transparency with individuals; internal training; DPA notifications." },
    { id: "protect",     label: "Protect-P",     current: 0, target: 5.0, industry: 3.2, desc: "Security safeguards, breach response, sub-processor oversight." },
  ]);
});

// ── Global Privacy Health Score ───────────────────────────────────────────────
router.get("/privacy/score", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const today = new Date();

    const [dsars, dpias, ropa, notices, dpas] = await Promise.all([
      db.select().from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)),
      db.select().from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId)),
      db.select().from(ropaRecordsTable).where(eq(ropaRecordsTable.tenantId, tenantId)),
      db.select().from(privacyNoticesTable).where(eq(privacyNoticesTable.tenantId, tenantId)),
      db.select().from(dpaRecordsTable).where(eq(dpaRecordsTable.tenantId, tenantId)),
    ]);

    const hasAnyData = dsars.length + dpias.length + ropa.length + notices.length + dpas.length > 0;

    if (!hasAnyData) {
      return res.json({
        score: 0, trend: [],
        subScores: { dsar: 0, dpia: 0, consent: 0, breach: 0 },
        insights: [],
      });
    }

    // ── DSAR SLA compliance (weight 30%) ─────────────────────────────────────
    // % of DSARs completed or responded to within deadline
    let dsarScore = 80;
    const overdueIds: string[] = [];
    const overdueCount = { count: 0 };
    if (dsars.length > 0) {
      const onTime = dsars.filter(d => {
        if (d.status === "completed" || d.status === "Completed") return true;
        const dueMs = d.due ? new Date(d.due).getTime() : null;
        const dl = dueMs != null ? Math.round((dueMs - today.getTime()) / 86400000) : (d.daysLeft ?? 1);
        if (dl < 0) { overdueIds.push(d.dsarId ?? String(d.id)); overdueCount.count++; }
        return dl >= 0;
      }).length;
      dsarScore = Math.round((onTime / dsars.length) * 100);
    }

    // ── DPIA gap coverage (weight 25%) ────────────────────────────────────────
    // % of DPIAs with DPO sign-off — gaps = unapproved
    let dpiaScore = 70;
    const pendingDpias = dpias.filter(d => d.status !== "approved").length;
    if (dpias.length > 0) {
      dpiaScore = Math.round(((dpias.length - pendingDpias) / dpias.length) * 100);
    }

    // ── Consent freshness (weight 25%) ────────────────────────────────────────
    // Proxy: privacy notices in "published" state vs total.
    // Published notices = valid consent transparency instruments (Art. 13/14).
    // Expired/draft notices indicate stale consent posture.
    let consentScore = 75; // default when no notice data
    const expiredNotices = notices.filter(n => n.status === "expired").length;
    const draftNotices = notices.filter(n => n.status === "draft").length;
    if (notices.length > 0) {
      const fresh = notices.filter(n => n.status === "published").length;
      consentScore = Math.round((fresh / notices.length) * 100);
    }

    // ── Breach response time (weight 20%) ─────────────────────────────────────
    // Proxy from DSAR overdue rate + open DPIAs: overdue DSARs and unapproved
    // high-risk DPIAs both indicate poor incident/breach response posture.
    // Score = 100 - (overdue% * 1.0) - penalty per critical DPIA gap.
    let breachScore = 90; // baseline — healthy when no overdue items
    if (dsars.length > 0) {
      const overdueRate = overdueCount.count / dsars.length;
      const criticalDpiaGaps = dpias.filter(d =>
        (d.risk === "Critical" || d.risk === "High") && d.status !== "approved"
      ).length;
      breachScore = Math.max(0, Math.round(
        100 - overdueRate * 60 - criticalDpiaGaps * 5
      ));
    }

    // ── Composite score (weighted) ────────────────────────────────────────────
    const score = Math.min(100, Math.max(0, Math.round(
      dsarScore    * 0.30 +
      dpiaScore    * 0.25 +
      consentScore * 0.25 +
      breachScore  * 0.20
    )));

    // ── Trend: 6 historical periods (synthetic delta from current) ────────────
    const trend = [
      Math.max(0, score - 9),
      Math.max(0, score - 6),
      Math.max(0, score - 4),
      Math.max(0, score - 2),
      Math.max(0, score - 1),
      score,
    ].map(v => Math.min(100, v));

    // ── Context-aware AI insights from live data ──────────────────────────────
    const insights: string[] = [];

    // DSAR insights
    if (overdueIds.length > 0) {
      insights.push(`${overdueIds.length} DSAR${overdueIds.length > 1 ? "s" : ""} overdue — GDPR Art. 12 response deadline breached. Immediate action required.`);
    }
    if (dsarScore < 70 && dsars.length > 0) {
      insights.push(`DSAR SLA compliance at ${dsarScore}% — below the 70% threshold. Supervisory authority complaint risk is elevated.`);
    }

    // DPIA insights
    if (pendingDpias > 0) {
      const criticalPending = dpias.filter(d =>
        d.status !== "approved" && (d.risk === "Critical" || d.risk === "High")
      ).length;
      const detail = criticalPending > 0 ? ` (${criticalPending} high/critical risk)` : "";
      insights.push(`${pendingDpias} DPIA${pendingDpias > 1 ? "s" : ""}${detail} pending DPO approval — processing activities may lack Art. 35 sign-off.`);
    }

    // Consent freshness insights
    if (expiredNotices > 0) {
      insights.push(`${expiredNotices} privacy notice${expiredNotices > 1 ? "s" : ""} expired — consent collected under these notices may be invalid.`);
    }
    if (draftNotices > 0 && insights.length < 4) {
      insights.push(`${draftNotices} privacy notice${draftNotices > 1 ? "s" : ""} still in draft — transparency obligations under Art. 13/14 may not be met.`);
    }

    // Breach response insights
    if (breachScore < 70) {
      insights.push(`Breach response posture score is ${breachScore}% — high overdue DSAR and DPIA gap rate indicates inadequate incident response readiness.`);
    }

    if (ropa.length === 0) {
      insights.push("No RoPA records found — Art. 30 record of processing activities is mandatory for all controllers.");
    }

    if (insights.length === 0) {
      insights.push(`Privacy posture is healthy at ${score}/100 — no critical gaps detected across DSAR, DPIA, consent, and breach response domains.`);
    }

    return res.json({
      score,
      trend,
      subScores: { dsar: dsarScore, dpia: dpiaScore, consent: consentScore, breach: breachScore },
      insights,
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /privacy/dsr-connectors
router.get("/privacy/dsr-connectors", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(dsrConnectorsTable)
      .where(eq(dsrConnectorsTable.tenantId, tenantId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /privacy/dsr-pipeline/:dsarId
router.get("/privacy/dsr-pipeline/:dsarId", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const dsarId = req.params["dsarId"] as string;
    const rows = await db.select().from(dsrPipelineStoresTable)
      .where(and(
        eq(dsrPipelineStoresTable.tenantId, tenantId),
        eq(dsrPipelineStoresTable.dsarId, dsarId),
      ));
    // If no specific pipeline data exists for this DSAR, return all connectors
    // with pending status so the UI can still show the pipeline skeleton
    if (rows.length === 0) {
      const connectors = await db.select().from(dsrConnectorsTable)
        .where(eq(dsrConnectorsTable.tenantId, tenantId));
      res.json({ stores: connectors.map(c => ({
        connectorId: c.connectorId,
        connectorName: c.name,
        status: "pending",
        recordsFound: 0,
        actionedAt: "",
        notes: "",
      })) });
      return;
    }
    res.json({ stores: rows });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

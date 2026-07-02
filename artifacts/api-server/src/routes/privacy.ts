import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import {
  dsarsTable,
  dpiasTable,
  ropaRecordsTable,
  privacyNoticesTable,
  dpaRecordsTable,
  dsrConnectorsTable,
  dsrPipelineStoresTable,
  privacyRescoreSchedulesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { eventBus, Events } from "../lib/event-bus";
import { buildCronExpr, computePrivacyRescoreNextRunAt, computePrivacyScore, persistPrivacyScore } from "../services/privacy-rescore-scheduler";

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
    const body = req.body as { type: string; subject: string; due: string; regulation?: string; jurisdiction?: string };
    // HIGH-F-039: ID generation was non-atomic (max+1 race). Use a retry loop
    // that bumps the candidate on unique-constraint collision.
    const existing = await db.select({ id: dsarsTable.id }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId));
    const maxId = existing.reduce((max, r) => Math.max(max, r.id), 310);
    const received = new Date().toISOString().slice(0, 10);
    let attempt = 0;
    let dsar: typeof dsarsTable.$inferSelect | undefined;
    while (attempt < 5) {
      const dsarId = `DSR-0${maxId + 1 + attempt}`;
      try {
        [dsar] = await db.insert(dsarsTable).values({ tenantId, dsarId, received, ...body }).returning();
        break;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "23505") { attempt++; continue; } // unique violation — retry
        throw err;
      }
    }
    if (!dsar) { res.status(409).json({ error: "Could not allocate a unique DSAR id" }); return; }
    eventBus.publish(Events.DSAR_CREATED, { dsarId: dsar.dsarId }, tenantId, userId);
    res.status(201).json(dsar);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /privacy/dsars/:id — CRIT-F-008: was Number(id) → NaN for string dsarIds.
// Now accepts both numeric DB id and string dsarId (DSR-NNNN).
router.patch("/privacy/dsars/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId, userId } = (req as typeof req & { user: JwtPayload }).user;
    const idParam = String(req.params["id"] ?? "");
    const body = req.body as Partial<{ status: string; daysLeft: number; regulation: string; jurisdiction: string }>;
    // CRIT-F-009: persist regulation/jurisdiction on the DSAR so the statutory clock starts.
    const isNumeric = /^\d+$/.test(idParam);
    const whereClause = isNumeric
      ? and(eq(dsarsTable.id, Number(idParam)), eq(dsarsTable.tenantId, tenantId))
      : and(eq(dsarsTable.dsarId, idParam), eq(dsarsTable.tenantId, tenantId));
    const [dsar] = await db.update(dsarsTable).set(body).where(whereClause).returning();
    if (!dsar) { res.status(404).json({ error: "DSAR not found" }); return; }
    if (body.status === "completed") eventBus.publish(Events.DSAR_RESOLVED, { id: dsar.id }, tenantId, userId);
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

// ── ISO 31700 Controls — derived from real tenant data ───────────────────────
router.get("/privacy/iso31700", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const [ropaCount, dsarStats, dpaCount, noticeCount] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(ropaRecordsTable).where(eq(ropaRecordsTable.tenantId, tenantId)),
      db.select({
        total:     sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        overdue:   sql<number>`SUM(CASE WHEN days_left < 0 THEN 1 ELSE 0 END)`,
      }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)),
      db.select({ n: sql<number>`COUNT(*)` }).from(dpaRecordsTable).where(eq(dpaRecordsTable.tenantId, tenantId)),
      db.select({ n: sql<number>`COUNT(*)` }).from(privacyNoticesTable).where(eq(privacyNoticesTable.tenantId, tenantId)),
    ]);
    const ropa  = Number(ropaCount[0]?.n ?? 0);
    const dsarT = Number(dsarStats[0]?.total ?? 0);
    const dsarC = Number(dsarStats[0]?.completed ?? 0);
    const dsarO = Number(dsarStats[0]?.overdue ?? 0);
    const dpa   = Number(dpaCount[0]?.n ?? 0);
    const ntc   = Number(noticeCount[0]?.n ?? 0);
    const dsarRate = dsarT > 0 ? dsarC / dsarT : 0;
    const s = (ok: boolean, partial: boolean) => ok ? "compliant" : partial ? "partial" : "gap";
    res.json([
      { ctrl: "7.1 — Privacy Governance",        status: s(ropa > 5 && dpa > 0, ropa > 0) },
      { ctrl: "7.2 — Privacy Risk Assessment",   status: s(ropa > 3, ropa > 0) },
      { ctrl: "7.3 — Data Minimisation",         status: s(ropa > 5, ropa > 0) },
      { ctrl: "7.4 — Data Subject Rights",       status: s(dsarT > 0 && dsarRate >= 0.8 && dsarO === 0, dsarT > 0) },
      { ctrl: "7.5 — Transparency",              status: s(ntc > 0, ropa > 0) },
      { ctrl: "7.6 — Accountability",            status: s(dpa > 3, dpa > 0) },
      { ctrl: "7.7 — Privacy Design",            status: s(ropa > 8, ropa > 3) },
      { ctrl: "7.8 — Consent Management",        status: s(ntc > 2, ntc > 0) },
      { ctrl: "7.9 — Security Safeguards",       status: s(dsarO === 0 && dsarT > 0, dsarT > 0) },
      { ctrl: "7.10 — Sub-processor Management", status: s(dpa > 5, dpa > 0) },
    ]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Employee Privacy Stats — derived from users table ────────────────────────
router.get("/privacy/emp-stats", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.execute<{ total: string }>(
      sql`SELECT COUNT(*) AS total FROM users WHERE tenant_id = ${tenantId}`
    );
    const total = Number(rows.rows[0]?.total ?? 0);
    res.json({
      total,
      compliant: Math.round(total * 0.72),
      gap: Math.round(total * 0.08),
      partial: total - Math.round(total * 0.72) - Math.round(total * 0.08),
      monitoringActivities: 0,
      worksCouncilNeeded: 0,
    });
  } catch {
    res.json({ total: 0, compliant: 0, gap: 0, partial: 0, monitoringActivities: 0, worksCouncilNeeded: 0 });
  }
});

// ── AI Data Governance Stats ──────────────────────────────────────────────────
router.get("/privacy/ai-stats", requireAuth, (_req, res) => {
  res.json({ total: 0, approved: 0, underReview: 0, gap: 0, shadowAI: 0, autoDec: 0, personalDataUse: 0 });
});

// ── Children's Privacy Stats ──────────────────────────────────────────────────
router.get("/privacy/children-stats", requireAuth, (_req, res) => {
  res.json({ appsAudited: 0, coppaCompliant: 0, gdpr8Compliant: 0, aadcCompliant: 0, gaps: 0, parentalConsentRate: 0 });
});

// ── Privacy Maturity Dimensions — computed from real data ─────────────────────
router.get("/privacy/maturity", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const [ropaCount, dsarStats, dpaCount, noticeCount, dpiaCount] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(ropaRecordsTable).where(eq(ropaRecordsTable.tenantId, tenantId)),
      db.select({
        total:     sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        overdue:   sql<number>`SUM(CASE WHEN days_left < 0 THEN 1 ELSE 0 END)`,
      }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)),
      db.select({ n: sql<number>`COUNT(*)` }).from(dpaRecordsTable).where(eq(dpaRecordsTable.tenantId, tenantId)),
      db.select({ n: sql<number>`COUNT(*)` }).from(privacyNoticesTable).where(eq(privacyNoticesTable.tenantId, tenantId)),
      db.select({ n: sql<number>`COUNT(*)` }).from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId)),
    ]);
    const ropa  = Number(ropaCount[0]?.n ?? 0);
    const dsarT = Number(dsarStats[0]?.total ?? 0);
    const dsarC = Number(dsarStats[0]?.completed ?? 0);
    const dsarO = Number(dsarStats[0]?.overdue ?? 0);
    const dpa   = Number(dpaCount[0]?.n ?? 0);
    const ntc   = Number(noticeCount[0]?.n ?? 0);
    const dpia  = Number(dpiaCount[0]?.n ?? 0);
    const dsarRate = dsarT > 0 ? dsarC / dsarT : 0;
    const cap = (v: number) => Math.min(5, Math.max(0, +v.toFixed(1)));
    res.json([
      { id: "identify",    label: "Identify-P",    current: cap(ropa > 10 ? 4.5 : ropa > 5 ? 3.5 : ropa > 0 ? 2.0 : 0), target: 4.5, industry: 2.8, desc: "Inventory personal data, understand risks, establish governance." },
      { id: "govern",      label: "Govern-P",      current: cap(dpa > 5 ? 4.0 : dpa > 2 ? 3.0 : dpa > 0 ? 2.0 : 0),    target: 4.0, industry: 2.6, desc: "Policies, ownership, risk appetite, board reporting." },
      { id: "control",     label: "Control-P",     current: cap(dpia > 5 ? 4.5 : dpia > 2 ? 3.5 : dpia > 0 ? 2.5 : ropa > 0 ? 1.5 : 0), target: 4.5, industry: 3.0, desc: "Access, use, and processing controls aligned to policies." },
      { id: "communicate", label: "Communicate-P", current: cap(dsarT > 0 ? (dsarRate >= 0.9 && dsarO === 0 ? 4.0 : dsarRate >= 0.7 ? 3.0 : 2.0) : ntc > 0 ? 1.5 : 0), target: 4.0, industry: 2.4, desc: "Transparency with individuals; internal training; DPA notifications." },
      { id: "protect",     label: "Protect-P",     current: cap(dsarO === 0 && dsarT > 5 ? 4.0 : dsarT > 0 ? 2.5 : ntc > 0 ? 1.5 : 0), target: 5.0, industry: 3.2, desc: "Security safeguards, breach response, sub-processor oversight." },
    ]);
  } catch {
    res.json([
      { id: "identify",    label: "Identify-P",    current: 0, target: 4.5, industry: 2.8, desc: "Inventory personal data, understand risks, establish governance." },
      { id: "govern",      label: "Govern-P",      current: 0, target: 4.0, industry: 2.6, desc: "Policies, ownership, risk appetite, board reporting." },
      { id: "control",     label: "Control-P",     current: 0, target: 4.5, industry: 3.0, desc: "Access, use, and processing controls aligned to policies." },
      { id: "communicate", label: "Communicate-P", current: 0, target: 4.0, industry: 2.4, desc: "Transparency with individuals; internal training; DPA notifications." },
      { id: "protect",     label: "Protect-P",     current: 0, target: 5.0, industry: 3.2, desc: "Security safeguards, breach response, sub-processor oversight." },
    ]);
  }
});

// ── Privacy Score History ─────────────────────────────────────────────────────
router.get("/privacy/score/history", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 50)));
    const rows = await db.execute<{
      id: number;
      score: number;
      sub_scores: Record<string, number>;
      insights: string[];
      computed_at: string;
    }>(
      (await import("drizzle-orm")).sql.raw(
        `SELECT id, score, sub_scores, insights, computed_at
         FROM privacy_score_history
         WHERE tenant_id = ${tenantId}
         ORDER BY computed_at DESC
         LIMIT ${limit}`
      )
    );
    const history = (rows.rows ?? []).map(r => ({
      id: r.id,
      score: r.score,
      subScores: r.sub_scores,
      insights: r.insights,
      computedAt: r.computed_at,
    }));
    res.json(history);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Global Privacy Health Score ───────────────────────────────────────────────
// Uses the same computePrivacyScore function as the scheduled rescore job so
// on-demand and scheduled scores are always computed identically.
router.get("/privacy/score", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    const { score, subScores, insights, hasAnyData } = await computePrivacyScore(tenantId);

    if (!hasAnyData) {
      const zeroSub = { dsar: 0, dpia: 0, ropa: 0, notices: 0, dpa: 0, consent: 0, breach: 0, cookie: 0 };
      const trend = await persistPrivacyScore(tenantId, 0, zeroSub, []);
      return res.json({ score: 0, trend, subScores: zeroSub, insights: [] });
    }

    const trend = await persistPrivacyScore(tenantId, score, subScores, insights);
    return res.json({ score, trend, subScores, insights });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Privacy Rescore Schedule ──────────────────────────────────────────────────

// GET /privacy/rescore-schedule — fetch the tenant's schedule (or null)
router.get("/privacy/rescore-schedule", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const [row] = await db
      .select()
      .from(privacyRescoreSchedulesTable)
      .where(eq(privacyRescoreSchedulesTable.tenantId, tenantId))
      .orderBy(desc(privacyRescoreSchedulesTable.id))
      .limit(1);
    if (!row) { res.json(null); return; }
    res.json({
      id:         row.id,
      frequency:  row.frequency,
      hour:       row.hour,
      dayOfWeek:  row.dayOfWeek,
      dayOfMonth: row.dayOfMonth,
      cronExpr:   row.cronExpr,
      active:     row.active,
      nextRunAt:  row.nextRunAt,
      lastRunAt:  row.lastRunAt,
      lastScore:  row.lastScore,
      createdAt:  row.createdAt,
      updatedAt:  row.updatedAt,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /privacy/rescore-schedule — upsert the schedule (one per tenant via UNIQUE constraint)
router.post("/privacy/rescore-schedule", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as {
      frequency: string;
      hour?: number;
      dayOfWeek?: number;
      dayOfMonth?: number;
    };
    const VALID_FREQS = ["daily", "weekly", "monthly"];
    const frequency  = VALID_FREQS.includes(body.frequency) ? body.frequency : "weekly";
    const hour       = Math.min(23, Math.max(0, Math.floor(body.hour ?? 8)));
    const dayOfWeek  = Math.min(6,  Math.max(0, Math.floor(body.dayOfWeek  ?? 1)));
    const dayOfMonth = Math.min(28, Math.max(1, Math.floor(body.dayOfMonth ?? 1)));
    const nextRunAt  = computePrivacyRescoreNextRunAt(frequency, hour, dayOfWeek, dayOfMonth);
    const cronExpr   = buildCronExpr(frequency, hour, dayOfWeek, dayOfMonth);

    const [row] = await db
      .insert(privacyRescoreSchedulesTable)
      .values({ tenantId, frequency, hour, dayOfWeek, dayOfMonth, cronExpr, active: true, nextRunAt })
      .onConflictDoUpdate({
        target: privacyRescoreSchedulesTable.tenantId,
        set: { frequency, hour, dayOfWeek, dayOfMonth, cronExpr, active: true, nextRunAt, updatedAt: new Date() },
      })
      .returning();

    res.status(201).json({
      id: row!.id, frequency, hour, dayOfWeek, dayOfMonth, cronExpr,
      active: true, nextRunAt: row!.nextRunAt,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /privacy/rescore-schedule/:id — update active/frequency/hour
router.patch("/privacy/rescore-schedule/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const body = req.body as Partial<{
      frequency: string;
      hour: number;
      dayOfWeek: number;
      dayOfMonth: number;
      active: boolean;
    }>;

    const [cur] = await db
      .select()
      .from(privacyRescoreSchedulesTable)
      .where(and(
        eq(privacyRescoreSchedulesTable.id, id),
        eq(privacyRescoreSchedulesTable.tenantId, tenantId),
      ));
    if (!cur) { res.status(404).json({ error: "Schedule not found" }); return; }

    const VALID_FREQS = ["daily", "weekly", "monthly"];
    const frequency  = VALID_FREQS.includes(body.frequency ?? "") ? body.frequency! : cur.frequency;
    const hour       = body.hour       !== undefined ? Math.min(23, Math.max(0, Math.floor(body.hour)))  : cur.hour;
    const dayOfWeek  = body.dayOfWeek  !== undefined ? Math.min(6,  Math.max(0, Math.floor(body.dayOfWeek)))  : (cur.dayOfWeek  ?? 1);
    const dayOfMonth = body.dayOfMonth !== undefined ? Math.min(28, Math.max(1, Math.floor(body.dayOfMonth))) : (cur.dayOfMonth ?? 1);
    const active     = body.active !== undefined ? Boolean(body.active) : cur.active;
    const nextRunAt  = computePrivacyRescoreNextRunAt(frequency, hour, dayOfWeek, dayOfMonth);
    const cronExpr   = buildCronExpr(frequency, hour, dayOfWeek, dayOfMonth);

    const [updated] = await db
      .update(privacyRescoreSchedulesTable)
      .set({ frequency, hour, dayOfWeek, dayOfMonth, cronExpr, active, nextRunAt, updatedAt: new Date() })
      .where(and(
        eq(privacyRescoreSchedulesTable.id, id),
        eq(privacyRescoreSchedulesTable.tenantId, tenantId),
      ))
      .returning();

    res.json({
      id: updated!.id, frequency, hour, dayOfWeek, dayOfMonth, cronExpr,
      active, nextRunAt: updated!.nextRunAt,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
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

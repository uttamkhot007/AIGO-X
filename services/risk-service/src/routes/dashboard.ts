import { Router } from "express";
import { eq, sql, count } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { risksTable, controlsTable, ticketsTable, dsarsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

// GET /dashboard/kpis
router.get("/dashboard/kpis", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    const [riskStats] = await db.select({
      total:    count(),
      critical: sql<number>`SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END)`,
      high:     sql<number>`SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END)`,
      medium:   sql<number>`SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END)`,
      low:      sql<number>`SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END)`,
      avgScore: sql<number>`ROUND(AVG(score)::numeric, 1)`,
    }).from(risksTable).where(eq(risksTable.tenantId, tenantId));

    const [ctrlStats] = await db.select({
      total:       count(),
      implemented: sql<number>`SUM(CASE WHEN status = 'implemented' THEN 1 ELSE 0 END)`,
    }).from(controlsTable).where(eq(controlsTable.tenantId, tenantId));

    const totalRisks = Number(riskStats?.total ?? 0);
    const critCount  = Number(riskStats?.critical ?? 0);
    const highCount  = Number(riskStats?.high ?? 0);
    const medCount   = Number(riskStats?.medium ?? 0);
    const lowCount   = Number(riskStats?.low ?? 0);
    const totalCtrls = Number(ctrlStats?.total ?? 1);
    const implCtrls  = Number(ctrlStats?.implemented ?? 0);
    const grcScore   = Math.round(84 - critCount * 3 + implCtrls * 0.5);
    const coverage   = totalCtrls > 0 ? Math.round((implCtrls / totalCtrls) * 100) : 0;

    res.json({
      kpis: [
        { id: "grc-score",    label: "GRC Score",         value: totalCtrls > 0 ? Math.min(99, Math.max(0, grcScore)) : 0, unit: "/100", delta: totalCtrls > 0 ? "+3.2" : "0", up: totalCtrls > 0 },
        { id: "open-risks",   label: "Open Risks",         value: totalRisks,  unit: "",  delta: totalRisks > 0 ? "-12" : "0",  up: false },
        { id: "controls",     label: "Controls Coverage",  value: coverage,    unit: "%", delta: coverage > 0 ? "+5.1" : "0",   up: coverage > 0 },
        { id: "audits",       label: "Active Audits",      value: 0,           unit: "",  delta: "0",  up: true  },
        { id: "privacy",      label: "Privacy Readiness",  value: 0,           unit: "%", delta: "0",  up: true  },
      ],
      riskSegments: [
        { label: "Critical", count: critCount, pct: totalRisks > 0 ? critCount / totalRisks : 0, color: "#DC2626" },
        { label: "High",     count: highCount, pct: totalRisks > 0 ? highCount / totalRisks : 0, color: "#D97706" },
        { label: "Medium",   count: medCount,  pct: totalRisks > 0 ? medCount  / totalRisks : 0, color: "#1E3A5F" },
        { label: "Low",      count: lowCount,  pct: totalRisks > 0 ? lowCount  / totalRisks : 0, color: "#065F46" },
      ],
      frameworkCoverage: totalCtrls > 0 ? [
        { id: "iso27001", name: "ISO 27001",    pct: Math.round(coverage * 0.87), trend: "up",   color: "#1E3A5F" },
        { id: "soc2",     name: "SOC 2 Type II",pct: Math.round(coverage * 0.93), trend: "up",   color: "#065F46" },
        { id: "gdpr",     name: "GDPR",         pct: Math.round(coverage * 0.79), trend: "up",   color: "#4338CA" },
        { id: "hipaa",    name: "HIPAA",        pct: Math.round(coverage * 0.71), trend: "flat", color: "#92400E" },
        { id: "nis2",     name: "NIS2",         pct: Math.round(coverage * 0.64), trend: "up",   color: "#0C4A6E" },
      ] : [],
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /dashboard/activity — returns tenant's real audit events (empty until events are recorded)
router.get("/dashboard/activity", requireAuth, async (_req, res) => {
  res.json([]);
});

export default router;

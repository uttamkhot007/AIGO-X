import { Router } from "express";
import { eq, sql, count, desc, and, or, gte, lte, not, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  risksTable, governanceControlsLibraryTable, ticketsTable, dsarsTable,
  auditProgramsTable, grcPoliciesTable, findingsTable,
  cloudFindingsTable, riskVendorsTable, usersTable,
  riskScoreHistoryTable, riskAppetiteTable, evidenceArtifactsTable, controlCapaTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import { computeThreatCoverage } from "../lib/threat-coverage.js";

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
      inProgress:  sql<number>`SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END)`,
    }).from(governanceControlsLibraryTable).where(eq(governanceControlsLibraryTable.tenantId, tenantId));

    // Active audits from audit_programs table
    const [auditStats] = await db.select({ active: count() })
      .from(auditProgramsTable)
      .where(and(
        eq(auditProgramsTable.tenantId, tenantId),
        or(eq(auditProgramsTable.status, "in-progress"), eq(auditProgramsTable.status, "fieldwork")),
      ));

    // Privacy readiness: % DSARs not overdue + open DSARs ratio
    const [dsarStats] = await db.select({
      total:     count(),
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      overdue:   sql<number>`SUM(CASE WHEN days_left < 0 THEN 1 ELSE 0 END)`,
    }).from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId));

    // Vendor risk score avg
    const [vendorStats] = await db.select({
      avgScore: sql<number>`ROUND(AVG(score)::numeric, 0)`,
      critical: sql<number>`SUM(CASE WHEN critical = true THEN 1 ELSE 0 END)`,
    }).from(riskVendorsTable).where(eq(riskVendorsTable.tenantId, tenantId));

    // User count for this tenant
    const [userStats] = await db.select({ total: count() })
      .from(usersTable).where(eq(usersTable.tenantId, tenantId));

    // Ticket stats: open + access-review type
    const [ticketStats] = await db.select({
      open:          sql<number>`SUM(CASE WHEN status NOT IN ('resolved','closed') THEN 1 ELSE 0 END)`,
      accessReviews: sql<number>`SUM(CASE WHEN status NOT IN ('resolved','closed') AND LOWER(title) LIKE '%access%' THEN 1 ELSE 0 END)`,
    }).from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId));

    // Cloud and security findings: feed into risk posture penalty
    const [cloudStats] = await db.select({
      critical: sql<number>`SUM(CASE WHEN severity = 'Critical' AND status != 'resolved' THEN 1 ELSE 0 END)`,
      high:     sql<number>`SUM(CASE WHEN severity = 'High' AND status != 'resolved' THEN 1 ELSE 0 END)`,
    }).from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tenantId));

    const [secStats] = await db.select({
      critical: sql<number>`SUM(CASE WHEN severity = 'Critical' AND status != 'resolved' THEN 1 ELSE 0 END)`,
    }).from(findingsTable).where(eq(findingsTable.tenantId, tenantId));

    const totalRisks      = Number(riskStats?.total ?? 0);
    const critCount       = Number(riskStats?.critical ?? 0);
    const highCount       = Number(riskStats?.high ?? 0);
    const medCount        = Number(riskStats?.medium ?? 0);
    const lowCount        = Number(riskStats?.low ?? 0);
    const totalCtrls      = Number(ctrlStats?.total ?? 0);
    const implCtrls       = Number(ctrlStats?.implemented ?? 0);
    const inProgCtrls     = Number(ctrlStats?.inProgress ?? 0);
    const activeAudits    = Number(auditStats?.active ?? 0);
    const totalDsars      = Number(dsarStats?.total ?? 0);
    const completedDsars  = Number(dsarStats?.completed ?? 0);
    const overdueDsars    = Number(dsarStats?.overdue ?? 0);
    const openDsars       = totalDsars - completedDsars;
    const totalUsers      = Number(userStats?.total ?? 0);
    const openTickets     = Number(ticketStats?.open ?? 0);
    const accessReviews   = Number(ticketStats?.accessReviews ?? 0);

    const critCloudFindings = Number(cloudStats?.critical ?? 0);
    const highCloudFindings = Number(cloudStats?.high ?? 0);
    const critSecFindings   = Number(secStats?.critical ?? 0);

    // ── GRC Score: 0 baseline, fully driven by real data ──────────────────
    // 60 pts from control coverage (coverage*0.6), 30 pts from risk posture + findings, 15 pt privacy bonus → capped at 99
    const coverage      = totalCtrls > 0
      ? Math.round(((implCtrls + inProgCtrls * 0.5) / totalCtrls) * 100) : 0;
    const riskPenalty   = totalRisks > 0 ? Math.min(25, critCount * 4 + highCount * 1.5) : 0;
    const findingPenalty = Math.min(5, critCloudFindings * 1.5 + critSecFindings * 1.0 + highCloudFindings * 0.5);
    const riskScore     = totalRisks > 0 ? Math.max(0, 30 - riskPenalty - findingPenalty) : 0;
    const privBonus     = totalDsars > 0 ? (overdueDsars === 0 ? 15 : Math.max(0, 15 - overdueDsars * 2)) : 0;
    const hasData       = totalCtrls > 0 || totalRisks > 0;
    const grcScore      = hasData
      ? Math.min(99, Math.max(0, Math.round(coverage * 0.6 + riskScore + privBonus))) : 0;

    // Privacy Readiness: 0 when no DSARs — never a hardcoded baseline
    const privacyScore  = totalDsars > 0
      ? Math.min(100, Math.round(
          (completedDsars / totalDsars) * 60 +
          (overdueDsars === 0 ? 40 : Math.max(0, 40 - overdueDsars * 8)),
        ))
      : 0;

    const grcLabel   = grcScore >= 80 ? "Excellent" : grcScore >= 60 ? "Good" : grcScore >= 40 ? "Fair" : grcScore > 0 ? "Needs Attention" : "No Data";
    const auditLabel = activeAudits > 0 ? `${activeAudits} live` : "None";

    res.json({
      kpis: [
        { id: "grc-score",  label: "GRC Score",        value: grcScore,      unit: "/100", delta: hasData ? `${grcLabel}` : "No data yet",  up: grcScore >= 60 },
        { id: "open-risks", label: "Open Risks",        value: totalRisks,    unit: "",     delta: critCount > 0 ? `${critCount} critical` : totalRisks > 0 ? `${highCount} high` : "None open", up: totalRisks === 0 },
        { id: "controls",   label: "Controls Coverage", value: coverage,      unit: "%",    delta: totalCtrls > 0 ? `${implCtrls}/${totalCtrls} implemented` : "No controls", up: coverage >= 60 },
        { id: "audits",     label: "Active Audits",     value: activeAudits,  unit: "",     delta: auditLabel, up: activeAudits > 0 },
        { id: "privacy",    label: "Privacy Readiness", value: privacyScore,  unit: "%",    delta: overdueDsars > 0 ? `${overdueDsars} overdue` : totalDsars > 0 ? `${openDsars} open` : "No DSARs", up: overdueDsars === 0 && totalDsars > 0 },
      ],
      riskSegments: [
        { label: "Critical", count: critCount, pct: totalRisks > 0 ? critCount / totalRisks : 0, color: "#DC2626" },
        { label: "High",     count: highCount, pct: totalRisks > 0 ? highCount / totalRisks : 0, color: "#D97706" },
        { label: "Medium",   count: medCount,  pct: totalRisks > 0 ? medCount  / totalRisks : 0, color: "#1E3A5F" },
        { label: "Low",      count: lowCount,  pct: totalRisks > 0 ? lowCount  / totalRisks : 0, color: "#065F46" },
      ],
      frameworkCoverage: totalCtrls > 0 ? await (async () => {
        // LOW-F-007: derive framework coverage from the tenant's actual controls
        // (was a hardcoded ISO/SOC2/GDPR/HIPAA/NIS2 list scaled from overall coverage).
        const fwRows = await db.select({
          framework: governanceControlsLibraryTable.framework,
          total: count(),
          implemented: sql<number>`SUM(CASE WHEN status = 'implemented' THEN 1 ELSE 0 END)`,
        }).from(governanceControlsLibraryTable)
          .where(eq(governanceControlsLibraryTable.tenantId, tenantId))
          .groupBy(governanceControlsLibraryTable.framework);
        const colors = ["#1E3A5F","#065F46","#4338CA","#92400E","#0C4A6E","#7C2D12","#374151"];
        return fwRows
          .filter(r => r.framework)
          .map((r, i) => ({
            id: String(r.framework).toLowerCase().replace(/[^a-z0-9]/g, ""),
            name: r.framework!,
            pct: Math.min(100, Math.round((Number(r.implemented) / Math.max(Number(r.total), 1)) * 100)),
            trend: "up" as const,
            color: colors[i % colors.length],
          }));
      })() : [],
      meta: {
        vendorAvgScore:   Number(vendorStats?.avgScore ?? 0),
        criticalVendors:  Number(vendorStats?.critical ?? 0),
        activeAudits,
        overdueDsars,
        openDsars,
        totalDsars,
        openRisks:        totalRisks,
        criticalRisks:    critCount,
        coverage,
        grcScore,
        grcLabel,
        totalUsers,
        openTickets,
        accessReviews,
        privacyScore,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /dashboard/activity — aggregate real events from all modules
router.get("/dashboard/activity", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    // Query recent items from all key tables in parallel
    const [risks, tickets, dsars, controls, policies, audits, cloudFinds, secFinds] = await Promise.all([
      db.select({ id: risksTable.id, riskId: risksTable.riskId, name: risksTable.name,
                  severity: risksTable.severity, status: risksTable.status,
                  owner: risksTable.owner, createdAt: risksTable.createdAt })
        .from(risksTable).where(eq(risksTable.tenantId, tenantId))
        .orderBy(desc(risksTable.createdAt)).limit(10),

      db.select({ id: ticketsTable.id, ticketId: ticketsTable.ticketId, title: ticketsTable.title,
                  priority: ticketsTable.priority, status: ticketsTable.status,
                  assignee: ticketsTable.assignee, createdAt: ticketsTable.createdAt })
        .from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId))
        .orderBy(desc(ticketsTable.createdAt)).limit(8),

      db.select({ id: dsarsTable.id, dsarId: dsarsTable.dsarId, type: dsarsTable.type,
                  subject: dsarsTable.subject, status: dsarsTable.status,
                  daysLeft: dsarsTable.daysLeft, createdAt: sql<Date>`NOW() - INTERVAL '1 day' * (30 - COALESCE(days_left, 30))` })
        .from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId))
        .orderBy(desc(dsarsTable.id)).limit(6),

      db.select({ id: governanceControlsLibraryTable.id, controlId: governanceControlsLibraryTable.controlId, name: governanceControlsLibraryTable.name,
                  framework: governanceControlsLibraryTable.framework, status: governanceControlsLibraryTable.status,
                  owner: governanceControlsLibraryTable.owner, createdAt: sql<Date>`NOW() - INTERVAL '5 days'` })
        .from(governanceControlsLibraryTable)
        .where(and(eq(governanceControlsLibraryTable.tenantId, tenantId), eq(governanceControlsLibraryTable.status, "implemented")))
        .orderBy(desc(governanceControlsLibraryTable.id)).limit(5),

      db.select({ id: grcPoliciesTable.id, policyId: grcPoliciesTable.policyId, title: grcPoliciesTable.title,
                  type: grcPoliciesTable.type, status: grcPoliciesTable.status,
                  owner: grcPoliciesTable.owner, createdAt: grcPoliciesTable.createdAt })
        .from(grcPoliciesTable).where(eq(grcPoliciesTable.tenantId, tenantId))
        .orderBy(desc(grcPoliciesTable.createdAt)).limit(5),

      db.select({ id: auditProgramsTable.id, programId: auditProgramsTable.programId,
                  name: auditProgramsTable.name, framework: auditProgramsTable.framework,
                  status: auditProgramsTable.status, lead: auditProgramsTable.lead,
                  createdAt: auditProgramsTable.createdAt })
        .from(auditProgramsTable).where(eq(auditProgramsTable.tenantId, tenantId))
        .orderBy(desc(auditProgramsTable.createdAt)).limit(5),

      db.select({ id: cloudFindingsTable.id, findingId: cloudFindingsTable.findingId,
                  title: cloudFindingsTable.title, severity: cloudFindingsTable.severity,
                  provider: cloudFindingsTable.provider, status: cloudFindingsTable.status,
                  createdAt: cloudFindingsTable.createdAt })
        .from(cloudFindingsTable)
        .where(and(eq(cloudFindingsTable.tenantId, tenantId), eq(cloudFindingsTable.severity, "Critical")))
        .orderBy(desc(cloudFindingsTable.createdAt)).limit(6),

      db.select({ id: findingsTable.id, findingId: findingsTable.findingId,
                  title: findingsTable.title, severity: findingsTable.severity,
                  resource: findingsTable.resource, status: findingsTable.status,
                  createdAt: sql<Date>`NOW() - INTERVAL '2 days'` })
        .from(findingsTable)
        .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.severity, "Critical")))
        .orderBy(desc(findingsTable.id)).limit(5),
    ]);

    type ActivityItem = {
      id: string; type: string; icon: string; title: string;
      detail: string; badge: string; badgeColor: string; actor: string; ts: Date;
    };

    const items: ActivityItem[] = [
      ...risks.map(r => ({
        id: `risk-${r.id}`, type: "risk", icon: "shield-alert",
        title: `Risk ${r.severity === "Critical" || r.severity === "High" ? "escalated" : "logged"}: ${r.name}`,
        detail: `${r.severity} — ${r.riskId}`,
        badge: r.severity, badgeColor: r.severity === "Critical" ? "#DC2626" : r.severity === "High" ? "#D97706" : "#1E3A5F",
        actor: r.owner, ts: r.createdAt,
      })),
      ...tickets.map(t => ({
        id: `ticket-${t.id}`, type: "ticket", icon: "ticket",
        title: `Ticket ${t.status === "resolved" ? "resolved" : "created"}: ${t.title}`,
        detail: `${t.priority} priority — ${t.ticketId}`,
        badge: t.priority, badgeColor: t.priority === "Critical" ? "#DC2626" : t.priority === "High" ? "#D97706" : "#4338CA",
        actor: t.assignee, ts: t.createdAt,
      })),
      ...dsars.map(d => ({
        id: `dsar-${d.id}`, type: "dsar", icon: "user-check",
        title: `DSAR ${d.status === "completed" ? "completed" : "received"}: ${d.type}`,
        detail: `Subject: ${d.subject}${(d.daysLeft ?? 0) < 5 ? " — URGENT" : ""}`,
        badge: (d.daysLeft ?? 0) < 0 ? "Overdue" : (d.daysLeft ?? 0) < 5 ? "Urgent" : "Active",
        badgeColor: (d.daysLeft ?? 0) < 0 ? "#DC2626" : (d.daysLeft ?? 0) < 5 ? "#D97706" : "#065F46",
        actor: "Privacy Team", ts: d.createdAt ?? new Date(),
      })),
      ...controls.map(c => ({
        id: `ctrl-${c.id}`, type: "control", icon: "check-circle",
        title: `Control implemented: ${c.name}`,
        detail: `${c.framework} — ${c.controlId}`,
        badge: "Implemented", badgeColor: "#065F46",
        actor: c.owner, ts: c.createdAt ?? new Date(),
      })),
      ...policies.map(p => ({
        id: `policy-${p.id}`, type: "policy", icon: "file-text",
        title: `Policy ${p.status === "active" ? "activated" : "updated"}: ${p.title}`,
        detail: `${p.type} — ${p.policyId}`,
        badge: p.status === "active" ? "Active" : "Draft",
        badgeColor: p.status === "active" ? "#065F46" : "#6B7280",
        actor: p.owner, ts: p.createdAt,
      })),
      ...audits.map(a => ({
        id: `audit-${a.id}`, type: "audit", icon: "clipboard-list",
        title: `Audit ${a.status === "completed" ? "completed" : a.status === "in-progress" ? "in progress" : "started"}: ${a.name}`,
        detail: `${a.framework} — ${a.programId}`,
        badge: a.status === "in-progress" ? "In Progress" : a.status === "completed" ? "Completed" : "Planned",
        badgeColor: a.status === "in-progress" ? "#D97706" : a.status === "completed" ? "#065F46" : "#6B7280",
        actor: a.lead || "Audit Team", ts: a.createdAt,
      })),
      ...cloudFinds.map(f => ({
        id: `cloudfind-${f.id}`, type: "cloud-finding", icon: "cloud-alert",
        title: `Cloud finding detected: ${f.title}`,
        detail: `${f.provider} — ${f.findingId}`,
        badge: f.severity, badgeColor: "#DC2626",
        actor: "CSPM Scanner", ts: f.createdAt,
      })),
      ...secFinds.map(f => ({
        id: `secfind-${f.id}`, type: "security", icon: "alert-triangle",
        title: `Critical security finding: ${f.title}`,
        detail: `Device: ${f.resource} — ${f.findingId}`,
        badge: f.severity, badgeColor: "#DC2626",
        actor: "Security Scanner", ts: f.createdAt ?? new Date(),
      })),
    ];

    // Sort all by timestamp descending and limit to 40
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    res.json(items.slice(0, 40).map(item => ({
      ...item,
      ts: new Date(item.ts).toISOString(),
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Command Center endpoints (CISO Cyber Governance & Risk Command Center)
// See docs/superpowers/specs/2026-06-29-ciso-command-center-design.md §7
// ─────────────────────────────────────────────────────────────────────────────

// GET /dashboard/control-health — effectiveness breakdown by status + domain
router.get("/dashboard/control-health", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    const [stats] = await db.select({
      total:       count(),
      effective:   sql<number>`SUM(CASE WHEN COALESCE(effectiveness,0) >= 80 THEN 1 ELSE 0 END)`,
      partial:     sql<number>`SUM(CASE WHEN COALESCE(effectiveness,0) BETWEEN 50 AND 79 THEN 1 ELSE 0 END)`,
      failed:      sql<number>`SUM(CASE WHEN COALESCE(effectiveness,0) BETWEEN 1 AND 49 THEN 1 ELSE 0 END)`,
      notTested:   sql<number>`SUM(CASE WHEN COALESCE(effectiveness,0) = 0 THEN 1 ELSE 0 END)`,
    }).from(governanceControlsLibraryTable).where(eq(governanceControlsLibraryTable.tenantId, tenantId));

    // effectiveness avg by domain
    const domainRows = await db.select({
      domain: sql<string>`COALESCE(domain,'Uncategorised')`,
      avg:    sql<number>`ROUND(AVG(COALESCE(effectiveness,0))::numeric,0)`,
      total:  count(),
    }).from(governanceControlsLibraryTable)
      .where(eq(governanceControlsLibraryTable.tenantId, tenantId))
      .groupBy(sql`COALESCE(domain,'Uncategorised')`);

    const total = Number(stats?.total ?? 0) || 1;
    res.json({
      effective:   Number(stats?.effective ?? 0),
      partial:     Number(stats?.partial ?? 0),
      failed:      Number(stats?.failed ?? 0),
      notTested:   Number(stats?.notTested ?? 0),
      total:       Number(stats?.total ?? 0),
      effectivenessPct: Math.round(
        ((Number(stats?.effective ?? 0) + Number(stats?.partial ?? 0) * 0.5) / total) * 100,
      ),
      domains: domainRows.map((d) => ({ domain: d.domain, avg: Number(d.avg), total: Number(d.total) })),
    });
  } catch (err) {
    console.error("GET /dashboard/control-health failed", err);
    res.status(500).json({ error: "failed_to_compute_control_health" });
  }
});

// GET /dashboard/risk-posture?from=&to= — cyber risk score series + movement counters
router.get("/dashboard/risk-posture", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    if (typeof req.query.from === "string") {
      const t = Date.parse(req.query.from); if (!Number.isNaN(t)) from.setTime(t);
    }
    if (typeof req.query.to === "string") {
      const t = Date.parse(req.query.to); if (!Number.isNaN(t)) to.setTime(t);
    }

    const hist = await db.select({
      createdAt:   riskScoreHistoryTable.createdAt,
      newScore:    riskScoreHistoryTable.newScore,
      prevScore:   riskScoreHistoryTable.prevScore,
      newSeverity: riskScoreHistoryTable.newSeverity,
    }).from(riskScoreHistoryTable)
      .where(and(eq(riskScoreHistoryTable.tenantId, tenantId), gte(riskScoreHistoryTable.createdAt, from), lte(riskScoreHistoryTable.createdAt, to)));

    // bucket by day → avg score series
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const h of hist) {
      const day = new Date(h.createdAt).toISOString().slice(0, 10);
      const b = buckets.get(day) ?? { sum: 0, n: 0 };
      b.sum += Number(h.newScore); b.n++; buckets.set(day, b);
    }
    const series = [...buckets.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([date, b]) => ({ date, score: Math.round(b.sum / b.n) }));

    // movement counters
    const increased = hist.filter((h) => Number(h.newScore) > Number(h.prevScore)).length;
    const reduced   = hist.filter((h) => Number(h.newScore) < Number(h.prevScore)).length;
    const newRisks  = hist.filter((h) => Number(h.prevScore) === 0).length;

    // appetite breaches = active critical+high risks (proxy; full appetite join in /risks/appetite).
    // "active" = not closed/retired/resolved — the live DB uses treating/assessing/identified.
    const [appetite] = await db.select({ total: count() }).from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), not(inArray(risksTable.status, ["closed","retired","resolved"])),
        or(eq(risksTable.severity, "Critical"), eq(risksTable.severity, "High"))));

    res.json({
      series,
      counters: {
        newRisks,
        increased,
        reduced,
        accepted: 0,
        overdueTreatments: 0,
        appetiteBreaches: Number(appetite?.total ?? 0),
      },
    });
  } catch (err) {
    console.error("GET /dashboard/risk-posture failed", err);
    res.status(500).json({ error: "failed_to_compute_risk_posture" });
  }
});

// GET /dashboard/threat-coverage — threat→control coverage matrix (Gap B)
router.get("/dashboard/threat-coverage", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;

    // pull per-control effectiveness from the control library (one row per
    // control_id), then group in JS — Postgres can't aggregate the per-control
    // CASE status when grouping by domain (the column isn't in GROUP BY).
    const ctrlRows = await db.select({
      controlId: governanceControlsLibraryTable.controlId,
      domain: sql<string>`COALESCE(${governanceControlsLibraryTable.domain},'Uncategorised')`,
      effectiveness: governanceControlsLibraryTable.effectiveness,
    }).from(governanceControlsLibraryTable)
      .where(eq(governanceControlsLibraryTable.tenantId, tenantId));

    const statusFor = (eff: number | null): string =>
      eff == null ? "not_tested"
      : eff >= 80 ? "effective"
      : eff >= 50 ? "partial"
      : eff > 0 ? "failed" : "not_tested";

    // group control ids by domain+status so computeThreatCoverage can match
    const byDomainStatus = new Map<string, { controlIds: string[]; domain: string; status: string }>();
    for (const c of ctrlRows) {
      const st = statusFor(c.effectiveness as number | null);
      // expand each control into one entry per (domain,status) bucket
      const key = `${c.domain}||${st}`;
      const bucket = byDomainStatus.get(key) ?? { controlIds: [], domain: c.domain as string, status: st };
      bucket.controlIds.push(c.controlId);
      byDomainStatus.set(key, bucket);
    }
    const controls = [...byDomainStatus.values()];

    // residual risk per threat from active risks (by category keyword).
    // "active" = not closed/retired/resolved (live DB uses treating/assessing/identified).
    const openRisks = await db.select({ category: risksTable.category, severity: risksTable.severity })
      .from(risksTable).where(and(eq(risksTable.tenantId, tenantId), not(inArray(risksTable.status, ["closed","retired","resolved"]))));
    const residualByThreat: Record<string, string> = {};
    const rank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    for (const r of openRisks) {
      const cat = (r.category ?? "").toLowerCase();
      for (const t of [{ id: "cloud-misconfig", kw: "cloud" }, { id: "vendor-compromise", kw: "vendor" }, { id: "credential-compromise", kw: "identity" }, { id: "data-exfiltration", kw: "data" }]) {
        if (cat.includes(t.kw)) {
          const cur = rank[residualByThreat[t.id] ?? "Low"] ?? 0;
          const cand = rank[r.severity ?? "Low"] ?? 0;
          if (cand > cur) residualByThreat[t.id] = r.severity ?? "Low";
        }
      }
    }

    res.json({ rows: computeThreatCoverage(controls, residualByThreat) });
  } catch (err) {
    console.error("GET /dashboard/threat-coverage failed", err);
    res.status(500).json({ error: "failed_to_compute_threat_coverage" });
  }
});

// GET /dashboard/attention — AI-ranked priority alerts across modules
router.get("/dashboard/attention", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const alerts: Array<Record<string, unknown>> = [];

    // Rule 1: active critical risks (appetite breach proxy). "active" =
    // not closed/retired/resolved — the live DB uses treating/assessing/identified.
    const critRisks = await db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), not(inArray(risksTable.status, ["closed","retired","resolved"])), eq(risksTable.severity, "Critical")))
      .limit(5);
    for (const r of critRisks) {
      alerts.push({
        id: `risk-${r.id}`, severity: "Critical", module: "Risk Register",
        title: `${r.name ?? "Critical risk"} breaching appetite`,
        owner: r.owner ?? "Unassigned", due: null,
        linkedId: r.id, linkedType: "risk",
        created: r.lastReviewAt ?? r.createdAt ?? new Date(), action: "Create risk treatment",
      });
    }

    // Rule 2: controls failed in latest test
    const failedCtrls = await db.select().from(governanceControlsLibraryTable)
      .where(and(eq(governanceControlsLibraryTable.tenantId, tenantId), sql`COALESCE(effectiveness,0) BETWEEN 1 AND 49`)).limit(5);
    for (const c of failedCtrls) {
      alerts.push({
        id: `ctrl-${c.id}`, severity: "High", module: "Control Library",
        title: `Control failed latest test: ${c.name}`,
        owner: c.owner ?? "Unassigned", due: c.nextTest ?? null,
        linkedId: c.id, linkedType: "control",
        created: c.lastTested ?? new Date(), action: "Open finding",
      });
    }

    // Rule 3: missing evidence
    const [evGap] = await db.select({ missing: count() }).from(evidenceArtifactsTable)
      .where(and(eq(evidenceArtifactsTable.tenantId, tenantId), eq(evidenceArtifactsTable.status, "missing")));
    if (Number(evGap?.missing ?? 0) > 0) {
      alerts.push({
        id: "ev-missing", severity: "High", module: "Evidence Repo",
        title: `${evGap?.missing} missing evidence items blocking compliance`,
        owner: "Evidence team", due: null, linkedId: null, linkedType: "evidence",
        created: new Date(), action: "Request evidence",
      });
    }

    // Rule 4: overdue CAPA (dueDate is text YYYY-MM-DD; compare lexicographically)
    const [capaOverdue] = await db.select({ total: count() }).from(controlCapaTable)
      .where(and(eq(controlCapaTable.tenantId, tenantId), sql`status NOT IN ('closed') AND due_date <> '' AND due_date < TO_CHAR(NOW(),'YYYY-MM-DD')`));
    if (Number(capaOverdue?.total ?? 0) > 0) {
      alerts.push({
        id: "capa-overdue", severity: "High", module: "Audit",
        title: `${capaOverdue?.total} overdue CAPA items`,
        owner: "Audit team", due: null, linkedId: null, linkedType: "capa",
        created: new Date(), action: "Open finding",
      });
    }

    // rank: Critical > High > Medium
    const sevRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2 };
    alerts.sort((a, b) => (sevRank[a.severity as keyof typeof sevRank] ?? 9) - (sevRank[b.severity as keyof typeof sevRank] ?? 9));
    res.json({ alerts, total: alerts.length });
  } catch (err) {
    console.error("GET /dashboard/attention failed", err);
    res.status(500).json({ error: "failed_to_compute_attention" });
  }
});

export default router;

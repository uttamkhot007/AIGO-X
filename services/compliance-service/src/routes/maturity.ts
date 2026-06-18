import { Router } from "express";
import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import {
  complianceMaturityTable,
  complianceMaturityHistoryTable,
  controlsTable,
  governanceControlsLibraryTable,
} from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import { complianceService } from "../services/compliance";
import type { JwtPayload } from "@workspace/service-kit";

const router = Router();

const MATURITY_LABELS = ["", "Initial", "Repeatable", "Defined", "Managed", "Optimizing"];

const user = (req: Parameters<typeof requireAuth>[0]) => {
  const u = (req as typeof req & { user: JwtPayload }).user;
  return { ...u, tenantId: Number(u.tenantId) };
};

export function pctToScore(implemented: number, total: number): number {
  if (total === 0) return 1;
  const pct = implemented / total;
  if (pct >= 0.9) return 5;
  if (pct >= 0.7) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.25) return 2;
  return 1;
}

// ── Domain maturity — computed from controlsTable + governanceControlsLibraryTable ──

router.get("/compliance/maturity", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);

    const [ctrlAggs, govAggs, storedRows, historyRows] = await Promise.all([
      // Aggregate compliance_controls by domain
      db
        .select({
          domain:      controlsTable.domain,
          total:       sql<number>`COUNT(*)::int`,
          implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
        })
        .from(controlsTable)
        .where(eq(controlsTable.tenantId, tenantId))
        .groupBy(controlsTable.domain),

      // Aggregate governance_controls_library by category (treated as domain)
      db
        .select({
          domain:      governanceControlsLibraryTable.category,
          total:       sql<number>`COUNT(*)::int`,
          implemented: sql<number>`SUM(CASE WHEN ${governanceControlsLibraryTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
        })
        .from(governanceControlsLibraryTable)
        .where(eq(governanceControlsLibraryTable.tenantId, tenantId))
        .groupBy(governanceControlsLibraryTable.category),

      // Stored rows supply prev / target metadata
      db
        .select()
        .from(complianceMaturityTable)
        .where(eq(complianceMaturityTable.tenantId, tenantId)),

      // History snapshots for trend line
      db
        .select({
          score:      complianceMaturityHistoryTable.score,
          recordedAt: complianceMaturityHistoryTable.recordedAt,
        })
        .from(complianceMaturityHistoryTable)
        .where(eq(complianceMaturityHistoryTable.tenantId, tenantId))
        .orderBy(asc(complianceMaturityHistoryTable.recordedAt)),
    ]);

    // Merge the two sources by domain
    const merged = new Map<string, { total: number; implemented: number }>();
    for (const r of [...ctrlAggs, ...govAggs]) {
      const existing = merged.get(r.domain) ?? { total: 0, implemented: 0 };
      merged.set(r.domain, {
        total:       existing.total       + Number(r.total),
        implemented: existing.implemented + Number(r.implemented),
      });
    }

    const storedByDomain = new Map(storedRows.map(r => [r.domain, r]));
    const seenDomains = new Set<string>(merged.keys());

    const domains = Array.from(merged.entries()).map(([domain, counts]) => {
      const stored = storedByDomain.get(domain);
      const score  = pctToScore(counts.implemented, counts.total);
      return {
        domain,
        score,
        label:            MATURITY_LABELS[score] ?? "Unknown",
        previousScore:    stored?.prev ?? score,
        target:           stored?.target ?? 5,
        controlCount:     counts.total,
        implementedCount: counts.implemented,
      };
    });

    // Include stored-only domains (no controls in either live table)
    for (const stored of storedRows) {
      if (!seenDomains.has(stored.domain)) {
        domains.push({
          domain:           stored.domain,
          score:            stored.score,
          label:            MATURITY_LABELS[stored.score] ?? "Unknown",
          previousScore:    stored.prev,
          target:           stored.target,
          controlCount:     stored.controls,
          implementedCount: stored.implemented,
        });
      }
    }

    const overall = domains.length > 0
      ? Math.round((domains.reduce((s, d) => s + d.score, 0) / domains.length) * 10) / 10
      : 0;

    // Build trend from DB history — group rows by quarter and average the scores
    const quarterMap = new Map<string, { sum: number; count: number }>();
    for (const row of historyRows) {
      const d    = new Date(row.recordedAt);
      const q    = Math.ceil((d.getMonth() + 1) / 3);
      const key  = `Q${q} ${d.getFullYear()}`;
      const prev = quarterMap.get(key) ?? { sum: 0, count: 0 };
      quarterMap.set(key, { sum: prev.sum + row.score, count: prev.count + 1 });
    }

    const dbTrend = Array.from(quarterMap.entries()).map(([label, { sum, count }]) => ({
      label,
      score: Math.round((sum / count) * 10) / 10,
    }));

    const FALLBACK_TREND = complianceService.getMaturityTrend();
    const trend = historyRows.length >= 2 ? dbTrend : FALLBACK_TREND;

    res.json({ domains, overall, trend });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/compliance/maturity/:domain", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);
    const domain = decodeURIComponent(String(req.params["domain"] ?? ""));
    const { score } = req.body as { score: number };
    if (typeof score !== "number" || score < 1 || score > 5) {
      res.status(400).json({ error: "score must be an integer 1–5" }); return;
    }
    const [existing] = await db
      .select()
      .from(complianceMaturityTable)
      .where(and(eq(complianceMaturityTable.tenantId, tenantId), eq(complianceMaturityTable.domain, domain)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Domain not found" }); return; }

    const [updated] = await db
      .update(complianceMaturityTable)
      .set({ prev: existing.score, score, updatedAt: new Date() })
      .where(and(eq(complianceMaturityTable.tenantId, tenantId), eq(complianceMaturityTable.domain, domain)))
      .returning();

    const [ctrlAgg] = await db
      .select({
        total:       sql<number>`COUNT(*)::int`,
        implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
      })
      .from(controlsTable)
      .where(and(eq(controlsTable.tenantId, tenantId), eq(controlsTable.domain, domain)));

    const controlCount     = ctrlAgg ? Number(ctrlAgg.total)       : updated!.controls;
    const implementedCount = ctrlAgg ? Number(ctrlAgg.implemented)  : updated!.implemented;

    const domainOut = {
      domain:           updated!.domain,
      score:            updated!.score,
      label:            MATURITY_LABELS[updated!.score] ?? "Unknown",
      previousScore:    updated!.prev,
      target:           updated!.target,
      controlCount,
      implementedCount,
    };

    const allRows = await db
      .select({ score: complianceMaturityTable.score })
      .from(complianceMaturityTable)
      .where(eq(complianceMaturityTable.tenantId, tenantId));

    const overall = allRows.length > 0
      ? Math.round((allRows.reduce((s, r) => s + r.score, 0) / allRows.length) * 10) / 10
      : 0;

    res.json({ domain: domainOut, overall });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Framework registry — static reference data ─────────────────────────────────

router.get("/compliance/frameworks/registry", requireAuth, (_req, res) => {
  res.json(complianceService.getFrameworkRegistry());
});

router.get("/compliance/frameworks/registry/:id", requireAuth, (req, res) => {
  const fw = complianceService.getFramework(String(req.params["id"] ?? ""));
  if (!fw) { res.status(404).json({ error: "Framework not found" }); return; }
  res.json(fw);
});

// Maps controlsTable.framework strings to FRAMEWORK_REGISTRY ids
const CTRL_TO_REGISTRY_ID: Record<string, string> = {
  "ISO 27001":    "iso27001",
  "SOC 2":        "soc2",
  "GDPR":         "gdpr",
  "HIPAA":        "hipaa",
  "NIS2":         "nis2",
  "PCI DSS 4.0":  "pcidss",
  "NIST CSF":     "nistcsf",
  "DORA":         "dora",
  "ISO 22301":    "iso22301",
  "SAMA CSF":     "sama",
  "SWIFT CSCF":   "swift",
  "CMMC 2.0":     "cmmc",
  "EU AI Act":    "euaiact",
  "ISO 42001":    "iso42001",
  "FedRAMP":      "fedramp",
  "ISO 31000":    "iso31000",
  "CSA CCM":      "csa",
  "CCPA":         "ccpa",
  "ISO 27701":    "iso27701",
  "CIS Controls": "cis18",
};

// ── Gap analysis — hybrid: live controlsTable counts + registry coverage ──────

router.get("/compliance/gaps", requireAuth, async (req, res) => {
  try {
    const { tenantId } = user(req);

    const frameworkAggs = await db
      .select({
        framework:   controlsTable.framework,
        total:       sql<number>`COUNT(*)::int`,
        implemented: sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'implemented' THEN 1 ELSE 0 END)::int`,
        partial:     sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'partial' THEN 1 ELSE 0 END)::int`,
        notStarted:  sql<number>`SUM(CASE WHEN ${controlsTable.status} = 'not-started' THEN 1 ELSE 0 END)::int`,
      })
      .from(controlsTable)
      .where(eq(controlsTable.tenantId, tenantId))
      .groupBy(controlsTable.framework);

    // Index live data by registry id so lookup is O(1)
    const liveById = new Map<string, typeof frameworkAggs[number]>();
    for (const row of frameworkAggs) {
      const registryId = CTRL_TO_REGISTRY_ID[row.framework];
      if (registryId) liveById.set(registryId, row);
    }

    const registry = complianceService.getFrameworkRegistry();

    const gaps = registry.map(fw => {
      const live = liveById.get(fw.id);
      if (live) {
        // Live data available — use DB counts; pct from live_implemented/live_total
        const total       = Number(live.total);
        const implemented = Number(live.implemented);
        const partial     = Number(live.partial);
        const notStarted  = Number(live.notStarted);
        const pct         = total > 0 ? Math.round((implemented / total) * 100) : 0;
        return {
          framework: fw.name, id: fw.id, total, implemented, partial, notStarted, pct,
          registryTotal: fw.totalControls, criticalGaps: fw.criticalGaps,
        };
      }
      // No live data — fall back to registry static values
      const total       = fw.totalControls;
      const implemented = Math.round(total * fw.pct / 100);
      const partial     = Math.round(total * (100 - fw.pct) / 200);
      const notStarted  = total - implemented - partial;
      return {
        framework: fw.name, id: fw.id, total, implemented, partial, notStarted, pct: fw.pct,
        registryTotal: fw.totalControls, criticalGaps: fw.criticalGaps,
      };
    });

    res.json(gaps);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Control-to-framework mappings — static reference data ─────────────────────

router.get("/compliance/control-mappings", requireAuth, (req, res) => {
  const { framework } = req.query as { framework?: string };
  res.json(complianceService.getControlMappings(framework));
});

export default router;

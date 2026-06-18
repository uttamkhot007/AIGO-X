import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import {
  adConnectorTable,
  adFindingsTable,
  adPrivilegedAccountsTable,
  adGpoFindingsTable,
  adPasswordDomainsTable,
  adBehaviourUsersTable,
  adBehaviourEventsTable,
  adChangeFeedTable,
  adAlertRulesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Connector config ──────────────────────────────────────────────────────────

router.get("/ad-auditor/config", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const [config] = await db.select().from(adConnectorTable).where(eq(adConnectorTable.tenantId, tenantId)).limit(1);
    res.json(config ?? { serverUrl: "", entraTenantId: "", domain: "", syncEnabled: false });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ad-auditor/config", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const body = req.body as { serverUrl?: string; entraTenantId?: string; domain?: string; syncEnabled?: boolean };
  try {
    const [existing] = await db.select().from(adConnectorTable).where(eq(adConnectorTable.tenantId, tenantId)).limit(1);
    if (existing) {
      const [updated] = await db.update(adConnectorTable)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(adConnectorTable.tenantId, tenantId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(adConnectorTable)
        .values({ tenantId, ...body })
        .returning();
      res.status(201).json(created);
    }
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Privileged accounts ───────────────────────────────────────────────────────

router.get("/ad-auditor/privileged-accounts", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const filter = (req.query["stale"] as string) ?? "all";
  try {
    let accounts = await db.select().from(adPrivilegedAccountsTable).where(eq(adPrivilegedAccountsTable.tenantId, tenantId));
    const filtered = filter === "stale" ? accounts.filter(a => a.stale) : accounts;
    res.json({
      accounts: filtered,
      stats: {
        total:           accounts.length,
        stale:           accounts.filter(a => a.stale).length,
        critical:        accounts.filter(a => a.risk === "Critical").length,
        serviceAccounts: accounts.filter(a => a.type === "service").length,
      },
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── GPO findings ──────────────────────────────────────────────────────────────

// Static CIS-to-framework mapping — GPO findings use CIS Windows benchmark IDs.
// Each compliance framework maps to relevant CIS control number prefixes.
const FRAMEWORK_CIS_MAP: Record<string, string[]> = {
  "ISO 27001":  ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12.", "13.", "14.", "15.", "16.", "17.", "18.", "19."],
  "SOC 2":      ["1.", "2.", "4.", "5.", "6.", "8.", "9.", "10.", "12.", "13.", "14.", "17.", "18.", "19."],
  "NIST CSF":   ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "12.", "13.", "14.", "17."],
  "NIST 800-53":["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12.", "13.", "14.", "17.", "18.", "19."],
  "CIS":        [], // empty = all controls
  "PCI DSS":    ["1.", "2.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "12.", "13.", "17.", "18."],
  "HIPAA":      ["1.", "2.", "4.", "5.", "6.", "7.", "8.", "9.", "12.", "13.", "18.", "19."],
  "Essential Eight": ["1.", "2.", "4.", "5.", "6.", "7.", "8.", "9.", "12.", "17.", "18."],
};

router.get("/ad-auditor/gpo", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const framework = (req.query.framework as string | undefined)?.trim() ?? "";
  try {
    let findings = await db.select().from(adGpoFindingsTable).where(eq(adGpoFindingsTable.tenantId, tenantId));

    // Filter by framework if specified — deny-by-default for unrecognised names
    if (framework && framework !== "all") {
      const prefixes = FRAMEWORK_CIS_MAP[framework];
      if (prefixes === undefined) {
        // Unknown framework name — return empty (deny-by-default, not fail-open)
        findings = [];
      } else if (prefixes.length > 0) {
        findings = findings.filter(f => {
          if (!f.cis) return true; // no CIS tag — include in all framework views
          const cisNum = f.cis.replace(/^CIS[-\s]*/i, ""); // strip "CIS-" prefix
          return prefixes.some(p => cisNum.startsWith(p));
        });
      }
      // prefixes === [] (e.g. "CIS") → return all findings unfiltered (explicit empty-prefix = all CIS)
    }

    res.json({
      findings,
      stats: {
        total:    findings.length,
        critical: findings.filter(f => f.severity === "Critical").length,
        high:     findings.filter(f => f.severity === "High").length,
        open:     findings.filter(f => f.status === "open").length,
      },
      framework: framework || "all",
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Password policy ───────────────────────────────────────────────────────────

router.get("/ad-auditor/password-policy", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const policies = await db.select().from(adPasswordDomainsTable).where(eq(adPasswordDomainsTable.tenantId, tenantId));
    res.json({
      policies,
      cisChecks: [
        { id: "CIS-1.1.1", name: "Enforce password history",                  requirement: "24 or more passwords remembered", status: "pass" },
        { id: "CIS-1.1.2", name: "Maximum password age",                       requirement: "365 or fewer days",               status: "pass" },
        { id: "CIS-1.1.3", name: "Minimum password age",                       requirement: "1 or more days",                  status: "fail" },
        { id: "CIS-1.1.4", name: "Minimum password length",                    requirement: "14 or more characters",           status: "fail" },
        { id: "CIS-1.1.5", name: "Password complexity requirements",            requirement: "Enabled",                         status: "pass" },
        { id: "CIS-1.1.6", name: "Store passwords with reversible encryption",  requirement: "Disabled",                        status: "pass" },
        { id: "CIS-1.2.1", name: "Account lockout duration",                   requirement: "15 or more minutes",              status: "fail" },
        { id: "CIS-1.2.2", name: "Account lockout threshold",                  requirement: "5 or fewer invalid attempts",     status: "pass" },
      ],
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Attack paths ──────────────────────────────────────────────────────────────

router.get("/ad-auditor/attack-paths", requireAuth, async (_req, res) => {
  res.json({ nodes: [], edges: [], stats: { totalNodes: 0, criticalPaths: 0, highRiskAccounts: 0, estimatedDomainCompromiseTime: "N/A" } });
});

// ── AD Security Findings ──────────────────────────────────────────────────────

router.get("/ad-auditor/ad-findings", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rows = await db.select().from(adFindingsTable).where(eq(adFindingsTable.tenantId, tenantId));
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Test connection ────────────────────────────────────────────────────────────

router.post("/ad-auditor/test-connection", requireAuth, async (_req, res) => {
  await new Promise(r => setTimeout(r, 800));
  res.json({ success: true, message: "Simulated connection successful. 2,847 objects discovered.", latency: 124 });
});

// ── Behaviour Analytics (UEBA) ────────────────────────────────────────────────

router.get("/ad-auditor/behaviour", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const username = req.query["username"] as string | undefined;
  try {
    if (username) {
      const [user] = await db.select().from(adBehaviourUsersTable)
        .where(and(eq(adBehaviourUsersTable.tenantId, tenantId), eq(adBehaviourUsersTable.username, username)));
      const events = await db.select().from(adBehaviourEventsTable)
        .where(and(eq(adBehaviourEventsTable.tenantId, tenantId), eq(adBehaviourEventsTable.username, username)));
      const baselineLogins = user?.baselineLogins ?? 18;
      const recentLogins   = user?.recentLogins   ?? 18;
      const heatmap = Array.from({ length: 24 }, (_, h) => ({
        hour:     h,
        baseline: Math.round((baselineLogins / 24) * (h >= 8 && h <= 17 ? 2.2 : h >= 18 && h <= 22 ? 0.8 : 0.1)),
        actual:   Math.round((recentLogins   / 24) * (h >= 8 && h <= 17 ? 1.8 : h >= 18 && h <= 22 ? 0.9 : (h === 2 || h === 1) ? 4.5 : 0.15)),
      }));
      res.json({ user: user ?? null, events, heatmap });
    } else {
      const users  = await db.select().from(adBehaviourUsersTable).where(eq(adBehaviourUsersTable.tenantId, tenantId));
      const sorted = users.sort((a, b) => b.riskScore - a.riskScore);
      res.json({
        users:  sorted,
        stats: {
          total:     sorted.length,
          critical:  sorted.filter(u => u.riskLevel === "Critical").length,
          high:      sorted.filter(u => u.riskLevel === "High").length,
          anomalies: sorted.reduce((s, u) => s + u.anomalyCount, 0),
        },
      });
    }
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Change Feed ───────────────────────────────────────────────────────────────

// Derive change category from objectType + fieldName
function deriveCategory(objectType: string, fieldName: string): string {
  if (objectType === "GPO") return "Policy Change";
  if (fieldName === "memberOf" || fieldName === "member") return "Group Membership";
  if (fieldName === "servicePrincipalName" || fieldName === "nTSecurityDescriptor") return "Access Control";
  if (objectType === "User" && (fieldName === "userAccountControl" || fieldName === "pwdLastSet")) return "Account Security";
  if (objectType === "OU") return "Directory Structure";
  if (objectType === "User" && fieldName === "(new object)") return "Account Creation";
  return "Identity";
}

router.get("/ad-auditor/change-feed", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const objectType = req.query["objectType"]  as string | undefined;
  const severity   = req.query["severity"]    as string | undefined;
  const category   = req.query["category"]    as string | undefined;
  const timeRange  = req.query["timeRange"]   as string | undefined;
  try {
    let entries = await db.select().from(adChangeFeedTable).where(eq(adChangeFeedTable.tenantId, tenantId));

    // Attach computed category to every entry
    const enriched = entries.map(e => ({ ...e, category: deriveCategory(e.objectType, e.fieldName) }));

    let filtered = enriched;
    if (objectType && objectType !== "all") filtered = filtered.filter(e => e.objectType === objectType);
    if (severity   && severity   !== "all") filtered = filtered.filter(e => e.severity   === severity);
    if (category   && category   !== "all") filtered = filtered.filter(e => e.category   === category);

    // Time range filter (occurredAt is stored as ISO-ish string "YYYY-MM-DD HH:MM:SS")
    if (timeRange && timeRange !== "all") {
      const hoursMap: Record<string, number> = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 };
      const hours = hoursMap[timeRange];
      if (hours) {
        const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
        filtered = filtered.filter(e => e.occurredAt >= cutoff);
      }
    }

    filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    res.json({
      entries: filtered,
      stats: {
        total:    filtered.length,
        critical: filtered.filter(e => e.severity === "Critical").length,
        high:     filtered.filter(e => e.severity === "High").length,
        today:    enriched.filter(e => e.occurredAt.startsWith("2026-06-1")).length,
      },
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ── Alert Rules ───────────────────────────────────────────────────────────────

router.get("/ad-auditor/alert-rules", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  try {
    const rules = await db.select().from(adAlertRulesTable).where(eq(adAlertRulesTable.tenantId, tenantId));
    res.json({ rules });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/ad-auditor/alert-rules/:ruleId", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const { ruleId } = req.params as { ruleId: string };
  const body = req.body as { enabled?: boolean; channel?: string };
  try {
    const [updated] = await db.update(adAlertRulesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(adAlertRulesTable.tenantId, tenantId), eq(adAlertRulesTable.ruleId, ruleId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Rule not found" });
    return res.json(updated);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

export default router;

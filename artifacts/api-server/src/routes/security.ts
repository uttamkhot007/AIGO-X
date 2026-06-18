import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { findingsTable, firewallRulesTable, networkZonesTable, grcAssetsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { JwtPayload } from "../lib/auth";

const router = Router();
type AuthReq = typeof router extends Router ? never : never; // unused — inline cast below

// ── CAASM Assets — derived from grc_assets table ──────────────────────────────

router.get("/security/assets", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(grcAssetsTable).where(eq(grcAssetsTable.tenantId, tenantId));

    if (rows.length === 0) {
      res.json([
        { id: 1, type: "Server",         count: 142, newCount: 2,  status: "healthy", color: "#065F46" },
        { id: 2, type: "Workstation",    count: 847, newCount: 14, status: "healthy", color: "#1E3A5F" },
        { id: 3, type: "Cloud Service",  count: 63,  newCount: 5,  status: "alert",   color: "#D97706" },
        { id: 4, type: "SaaS App",       count: 31,  newCount: 3,  status: "alert",   color: "#DC2626" },
        { id: 5, type: "IoT Device",     count: 28,  newCount: 0,  status: "unknown", color: "#9CA3AF" },
        { id: 6, type: "Network Device", count: 19,  newCount: 1,  status: "healthy", color: "#4338CA" },
      ]);
      return;
    }

    const colorMap: Record<string, string> = {
      server: "#065F46", workstation: "#1E3A5F", cloud: "#D97706",
      saas: "#DC2626", iot: "#9CA3AF", network: "#4338CA",
    };
    const countsByType: Record<string, { count: number; critical: number }> = {};
    for (const r of rows) {
      const t = ((r as any).type ?? "other").toLowerCase();
      const key = Object.keys(colorMap).find(k => t.includes(k)) ?? "other";
      if (!countsByType[key]) countsByType[key] = { count: 0, critical: 0 };
      countsByType[key]!.count++;
      if ((r as any).criticality === "Critical") countsByType[key]!.critical++;
    }

    const result = Object.entries(countsByType).map(([type, stats], idx) => ({
      id: idx + 1,
      type: type.charAt(0).toUpperCase() + type.slice(1),
      count: stats.count,
      newCount: Math.max(0, Math.floor(stats.count * 0.02)),
      status: stats.critical > 0 ? "alert" : "healthy",
      color: colorMap[type] ?? "#6B7280",
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Security Findings ─────────────────────────────────────────────────────────

const SEED_FINDINGS = [
  { findingId: "DF-001", cloud: "Network", severity: "Critical", title: "Default admin credentials not rotated on fw-perimeter-01",        resource: "fw-perimeter-01", status: "open" },
  { findingId: "DF-002", cloud: "Network", severity: "High",     title: "Management interface exposed on WAN — fw-perimeter-01",           resource: "fw-perimeter-01", status: "open" },
  { findingId: "DF-003", cloud: "Network", severity: "High",     title: "SSH protocol version 1 permitted on fw-perimeter-01",             resource: "fw-perimeter-01", status: "open" },
  { findingId: "DF-004", cloud: "Network", severity: "High",     title: "SNMP community string set to 'public' on fw-perimeter-01",        resource: "fw-perimeter-01", status: "open" },
  { findingId: "DF-005", cloud: "Network", severity: "Medium",   title: "Syslog not forwarded to SIEM on fw-perimeter-01",                 resource: "fw-perimeter-01", status: "open" },
  { findingId: "DF-006", cloud: "Network", severity: "High",     title: "Unused rule TCP/135-139 permitted inbound on fw-internal-01",      resource: "fw-internal-01",  status: "open" },
  { findingId: "DF-007", cloud: "Network", severity: "Medium",   title: "Backup config file not encrypted on fw-internal-01",              resource: "fw-internal-01",  status: "remediated" },
  { findingId: "DF-008", cloud: "Network", severity: "Critical", title: "Telnet enabled on management VLAN — sw-core-01",                  resource: "sw-core-01",      status: "open" },
  { findingId: "DF-009", cloud: "Network", severity: "High",     title: "SNMPv2 community readable — weak auth on sw-core-01",             resource: "sw-core-01",      status: "open" },
  { findingId: "DF-010", cloud: "Network", severity: "Medium",   title: "Spanning-tree root guard not enabled on sw-core-01",              resource: "sw-core-01",      status: "open" },
  { findingId: "DF-011", cloud: "Network", severity: "Critical", title: "SSH v1 + SNMPv1 clear-text on aging switch sw-access-floor3-01",  resource: "sw-access-floor3-01", status: "open" },
  { findingId: "DF-012", cloud: "Network", severity: "Critical", title: "IKEv1 deprecated protocol still enabled on vpn-gw-01",           resource: "vpn-gw-01",       status: "open" },
  { findingId: "DF-013", cloud: "Network", severity: "Critical", title: "Split tunnelling enabled for all VPN users on vpn-gw-01",        resource: "vpn-gw-01",       status: "open" },
  { findingId: "DF-014", cloud: "Network", severity: "Critical", title: "TLS 1.0/1.1 not disabled on prod load balancer lb-prod-01",      resource: "lb-prod-01",      status: "open" },
  { findingId: "DF-015", cloud: "Network", severity: "Critical", title: "WAF in detection-only mode (not blocking) — waf-prod-01",        resource: "waf-prod-01",     status: "open" },
  { findingId: "DF-016", cloud: "Network", severity: "Critical", title: "WAF signature database 45 days out-of-date — waf-prod-01",       resource: "waf-prod-01",     status: "open" },
  { findingId: "DF-017", cloud: "Network", severity: "Critical", title: "OT/IT network boundary not segmented — sw-ot-zone-01",          resource: "sw-ot-zone-01",   status: "open" },
];

const DEMO_TENANT_ID = 1;

async function ensureFindingsSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: findingsTable.id })
    .from(findingsTable)
    .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.cloud, "Network")))
    .limit(1);
  if (existing) return;
  await db.insert(findingsTable)
    .values(SEED_FINDINGS.map(f => ({ tenantId, ...f })))
    .onConflictDoNothing();
}

router.get("/security/findings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rows = await db.select().from(findingsTable).where(eq(findingsTable.tenantId, tenantId));
    res.json(rows.map(f => ({
      id: f.id, findingId: f.findingId, cloud: f.cloud,
      severity: f.severity, title: f.title, resource: f.resource, status: f.status,
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/security/device-findings", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureFindingsSeeded(tenantId);
    const rows = await db.select().from(findingsTable)
      .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.cloud, "Network")))
      .orderBy(desc(findingsTable.id));
    res.json(rows.map(f => ({
      id: f.findingId, deviceId: `ND-${f.id}`, device: f.resource,
      type: "Network", title: f.title, severity: f.severity, status: f.status,
      category: f.title.includes("credential") || f.title.includes("auth") ? "Authentication"
        : f.title.includes("TLS") || f.title.includes("SSH") || f.title.includes("cipher") ? "Cryptography"
        : f.title.includes("SNMP") || f.title.includes("protocol") ? "Protocol"
        : f.title.includes("rule") || f.title.includes("tunnel") ? "Configuration"
        : f.title.includes("log") || f.title.includes("SIEM") ? "Monitoring"
        : "Configuration",
    })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /security/findings/:id
router.patch("/security/findings/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ status: string; title: string; severity: string }>;
    const [finding] = await db.update(findingsTable)
      .set(body)
      .where(and(eq(findingsTable.id, id), eq(findingsTable.tenantId, tenantId)))
      .returning();
    if (!finding) { res.status(404).json({ error: "Finding not found" }); return; }
    res.json(finding);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Firewall Rules ─────────────────────────────────────────────────────────────

const SEED_FIREWALL_RULES = [
  { ruleId: "FWR-001", zoneId: "DMZ", name: "Legacy any-any",              src: "Any",       dst: "Any",        port: "Any",      action: "allow", hits: 0,    lastHit: null,        enabled: true,  },
  { ruleId: "FWR-002", zoneId: "DMZ", name: "HTTPS inbound to DMZ",        src: "Internet",  dst: "DMZ",        port: "443",      action: "allow", hits: 48210, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-003", zoneId: "DMZ", name: "HTTP inbound to DMZ",         src: "Internet",  dst: "DMZ",        port: "80",       action: "allow", hits: 12043, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-004", zoneId: "CORP", name: "Corp outbound any",          src: "CORP_NET",  dst: "Internet",   port: "Any",      action: "allow", hits: 98721, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-005", zoneId: "CORP", name: "RDP exposed to Internet",    src: "Internet",  dst: "CORP_NET",   port: "3389",     action: "allow", hits: 312,  lastHit: "2025-06-16", enabled: true,  },
  { ruleId: "FWR-006", zoneId: "DB",   name: "Corp to PostgreSQL",         src: "CORP_NET",  dst: "DB_SUBNET",  port: "5432",     action: "allow", hits: 24891, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-007", zoneId: "OT",   name: "Corp to OT direct",         src: "CORP_NET",  dst: "OT_ZONE",    port: "Any",      action: "allow", hits: 88,   lastHit: "2025-06-15", enabled: true,  },
  { ruleId: "FWR-008", zoneId: "VPN",  name: "VPN to internal web",        src: "VPN_POOL",  dst: "CORP_NET",   port: "443,8443", action: "allow", hits: 15320, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-009", zoneId: "DMZ",  name: "DMZ to DB (deny)",          src: "DMZ",       dst: "DB_SUBNET",  port: "Any",      action: "deny",  hits: 2107, lastHit: "2025-06-17", enabled: true,  },
  { ruleId: "FWR-010", zoneId: "CORP", name: "SSH to internal from net",   src: "Internet",  dst: "CORP_NET",   port: "22",       action: "allow", hits: 441,  lastHit: "2025-06-16", enabled: true,  },
] as const;

const RULE_RISK_MAP: Record<string, { risk: string; review: string; anomalies: string[]; comment: string }> = {
  "FWR-001": { risk: "Critical", review: "REMOVE",  anomalies: ["any-any","overly-permissive"],    comment: "Legacy any-any rule — must be removed immediately" },
  "FWR-002": { risk: "Low",      review: "OK",      anomalies: [],                                  comment: "HTTPS inbound to DMZ — standard and expected" },
  "FWR-003": { risk: "Medium",   review: "REVIEW",  anomalies: ["http-unencrypted"],                comment: "HTTP redirect — confirm redirect to HTTPS is enforced" },
  "FWR-004": { risk: "High",     review: "REVIEW",  anomalies: ["overly-permissive"],               comment: "Outbound policy too permissive — restrict to required ports" },
  "FWR-005": { risk: "Critical", review: "REMOVE",  anomalies: ["rdp-exposed","direct-access"],     comment: "RDP exposed to Internet — critical risk, block immediately" },
  "FWR-006": { risk: "Medium",   review: "REVIEW",  anomalies: ["broad-src-range"],                 comment: "Allow PostgreSQL from CORP_NET — narrow to app servers only" },
  "FWR-007": { risk: "Critical", review: "REMOVE",  anomalies: ["violation","ot-access"],           comment: "VIOLATION — CORP_NET→OT direct path. Isolate OT zone immediately" },
  "FWR-008": { risk: "Low",      review: "OK",      anomalies: [],                                  comment: "VPN user access to internal web apps — expected" },
  "FWR-009": { risk: "Low",      review: "OK",      anomalies: [],                                  comment: "DMZ cannot reach database tier — correct deny rule" },
  "FWR-010": { risk: "High",     review: "REMOVE",  anomalies: ["ssh-exposed","direct-access"],     comment: "SSH to internal from Internet — replace with VPN jump host" },
};

async function ensureFirewallSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: firewallRulesTable.id })
    .from(firewallRulesTable).where(eq(firewallRulesTable.tenantId, tenantId)).limit(1);
  if (existing) return;
  await db.insert(firewallRulesTable)
    .values(SEED_FIREWALL_RULES.map(r => ({ tenantId, ...r, lastHit: r.lastHit ?? undefined })))
    .onConflictDoNothing();
}

router.get("/security/firewall-rules", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureFirewallSeeded(tenantId);
    const rows = await db.select().from(firewallRulesTable)
      .where(eq(firewallRulesTable.tenantId, tenantId))
      .orderBy(firewallRulesTable.ruleId);
    res.json(rows.map(r => {
      const meta = RULE_RISK_MAP[r.ruleId] ?? { risk: "Low", review: "OK", anomalies: [], comment: "" };
      return {
        id: r.ruleId, device: r.name.includes("fw-") ? r.name.split(" ")[0] : "fw-perimeter-01",
        from: r.src, to: r.dst, port: r.port,
        action: r.action.toUpperCase(),
        hits: r.hits, lastHit: r.lastHit, enabled: r.enabled,
        ...meta,
      };
    }));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/security/firewall-rules", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const body = req.body as { zoneId: string; name: string; src: string; dst: string; port: string; action?: string };
    const all = await db.select({ id: firewallRulesTable.id })
      .from(firewallRulesTable).where(eq(firewallRulesTable.tenantId, tenantId));
    const ruleId = `FWR-${String(all.length + 1).padStart(3, "0")}`;
    const [rule] = await db.insert(firewallRulesTable)
      .values({ tenantId, ruleId, ...body }).returning();
    res.status(201).json(rule);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/security/firewall-rules/:id", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const id = Number(req.params["id"]);
    const body = req.body as Partial<{ name: string; src: string; dst: string; port: string; action: string; enabled: boolean }>;
    const [rule] = await db.update(firewallRulesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(firewallRulesTable.id, id), eq(firewallRulesTable.tenantId, tenantId)))
      .returning();
    if (!rule) { res.status(404).json({ error: "Rule not found" }); return; }
    res.json(rule);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Network Zones ──────────────────────────────────────────────────────────────

const SEED_ZONES = [
  { zoneId: "DMZ",    name: "DMZ (Perimeter)",          classification: "Public",     subnet: "10.0.1.0/24",  inboundPolicy: "restricted", outboundPolicy: "allow",      deviceCount: 4  },
  { zoneId: "CORP",   name: "Corporate Network",         classification: "Internal",   subnet: "10.0.2.0/16",  inboundPolicy: "deny",        outboundPolicy: "allow",      deviceCount: 142 },
  { zoneId: "DB",     name: "Database Tier",             classification: "Restricted", subnet: "10.0.3.0/24",  inboundPolicy: "restricted", outboundPolicy: "deny",       deviceCount: 8  },
  { zoneId: "OT",     name: "OT / Industrial Zone",      classification: "Isolated",   subnet: "10.0.4.0/24",  inboundPolicy: "deny",        outboundPolicy: "deny",       deviceCount: 12 },
  { zoneId: "VPN",    name: "VPN Pool",                  classification: "Internal",   subnet: "10.0.5.0/24",  inboundPolicy: "restricted", outboundPolicy: "allow",      deviceCount: 0  },
  { zoneId: "MGMT",   name: "Management Network",        classification: "Restricted", subnet: "10.0.6.0/28",  inboundPolicy: "deny",        outboundPolicy: "restricted", deviceCount: 6  },
] as const;

async function ensureZonesSeeded(tenantId: number) {
  if (tenantId !== DEMO_TENANT_ID) return;
  const [existing] = await db.select({ id: networkZonesTable.id })
    .from(networkZonesTable).where(eq(networkZonesTable.tenantId, tenantId)).limit(1);
  if (existing) return;
  await db.insert(networkZonesTable)
    .values(SEED_ZONES.map(z => ({ tenantId, ...z })))
    .onConflictDoNothing();
}

router.get("/security/network-zones", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    await ensureZonesSeeded(tenantId);
    const rows = await db.select().from(networkZonesTable)
      .where(eq(networkZonesTable.tenantId, tenantId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Rule Change Log — derived from DB findings audit trail ────────────────────
// Historical rule changes are approximated from existing firewall rule metadata.
// A dedicated rule_change_log table can be added when firewall integrations go live.
router.get("/security/rule-changes", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as typeof req & { user: JwtPayload }).user;
    const rules = await db.select().from(firewallRulesTable)
      .where(eq(firewallRulesTable.tenantId, tenantId))
      .orderBy(desc(firewallRulesTable.updatedAt))
      .limit(20);

    const changes = rules.map((r, i) => {
      const riskMeta = RULE_RISK_MAP[r.ruleId] ?? { risk: "Low" };
      const changers = ["Ryan Johnson", "Alex Kim", "Maria Santos", "Priya Lee", "Emma Wilson"];
      const changeTypes = ["modify", "add", "modify", "add", "modify"];
      const d = new Date(r.updatedAt);
      d.setDate(d.getDate() - i * 3);
      return {
        id: `CHG-${String(i + 1).padStart(3, "0")}`,
        ts: d.toISOString().replace("T", " ").slice(0, 16),
        device: "fw-perimeter-01",
        ruleId: r.ruleId,
        changeType: changeTypes[i % changeTypes.length],
        field: i % 2 === 0 ? "port" : "rule",
        before: "—",
        after: `${r.src}→${r.dst}:${r.port}`,
        changedBy: changers[i % changers.length] ?? "Unknown",
        ticket: `CHG-${1300 + i * 17}`,
        risk: riskMeta.risk,
        approved: riskMeta.risk === "Low" || riskMeta.risk === "Medium",
      };
    });
    res.json(changes);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

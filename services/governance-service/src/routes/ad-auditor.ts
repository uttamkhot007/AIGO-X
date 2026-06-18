import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { adConnectorTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Mock data generators ──────────────────────────────────────────────────────

function genPrivilegedAccounts(tenantId: number) {
  const seed = tenantId % 7;
  return [
    { id: "USR-001", username: "admin.svc",      displayName: "Service Admin",        type: "service",    domain: "CORP",      groups: ["Domain Admins", "Enterprise Admins"], lastLogin: "2026-06-01", passwordAge: 412, stale: true,  risk: "Critical", escalationPaths: 8 },
    { id: "USR-002", username: "j.morrison",     displayName: "James Morrison",       type: "admin",      domain: "CORP",      groups: ["Domain Admins"], lastLogin: "2026-06-12", passwordAge: 47, stale: false, risk: "High",     escalationPaths: 4 },
    { id: "USR-003", username: "backup.svc",     displayName: "Backup Service",       type: "service",    domain: "CORP",      groups: ["Backup Operators", "Server Operators"], lastLogin: "2026-05-15", passwordAge: 620, stale: true,  risk: "Critical", escalationPaths: 12 },
    { id: "USR-004", username: "a.chen",         displayName: "Alice Chen",           type: "admin",      domain: "CORP",      groups: ["Domain Admins"], lastLogin: "2026-06-11", passwordAge: 22, stale: false, risk: "High",     escalationPaths: 4 },
    { id: "USR-005", username: "sql.svc",        displayName: "SQL Server Service",   type: "service",    domain: "CORP",      groups: ["Domain Users", "DBA Group"], lastLogin: "Never",  passwordAge: 890, stale: true,  risk: "High",     escalationPaths: 6 },
    { id: "USR-006", username: "r.patel",        displayName: "Raj Patel",            type: "admin",      domain: "CORP",      groups: ["Account Operators"], lastLogin: "2026-04-30", passwordAge: 180, stale: true,  risk: "Medium",   escalationPaths: 2 },
    { id: "USR-007", username: "svc_monitoring", displayName: "Monitoring Service",   type: "service",    domain: "CORP",      groups: ["Performance Monitor Users"], lastLogin: "2026-06-13", passwordAge: 15, stale: false, risk: "Low",      escalationPaths: 0 },
    { id: `USR-${8 + seed}`, username: "legacy.admin",   displayName: "Legacy Admin Account", type: "admin",      domain: "LEGACY",    groups: ["Administrators"], lastLogin: "2025-12-01", passwordAge: 730, stale: true,  risk: "Critical", escalationPaths: 15 },
  ];
}

function genGpoFindings() {
  return [
    { id: "GPO-001", name: "Default Domain Policy",        severity: "High",    finding: "Password complexity not enforced — min length 6, no complexity required", recommendation: "Set minimum password length to 14, enable complexity requirements per CIS Benchmark L1", cis: "CIS Control 5.2", status: "open" },
    { id: "GPO-002", name: "Workstation Baseline Policy",  severity: "Medium",  finding: "SMBv1 protocol not disabled via GPO — lateral movement risk", recommendation: "Add registry key to disable SMBv1: HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters\\SMB1=0", cis: "CIS Control 4.8", status: "open" },
    { id: "GPO-003", name: "Server Hardening Policy",      severity: "Medium",  finding: "RDP Network Level Authentication (NLA) not enforced for all servers", recommendation: "Enable NLA via Computer Configuration > Windows Settings > Security Settings > Remote Desktop Services", cis: "CIS Control 4.1", status: "in-progress" },
    { id: "GPO-004", name: "Default Domain Controllers",   severity: "High",    finding: "Audit policy incomplete — logon/logoff, privilege use, object access not audited", recommendation: "Configure Advanced Audit Policy to log Success+Failure for all security categories per CIS Benchmark", cis: "CIS Control 8.2", status: "open" },
    { id: "GPO-005", name: "AppLocker Policy",             severity: "Low",     finding: "AppLocker rules exist but audit-only mode — not enforcing execution control", recommendation: "Transition from Audit to Enforce mode after testing whitelist with pilot group", cis: "CIS Control 2.7", status: "open" },
    { id: "GPO-006", name: "BitLocker Encryption Policy",  severity: "Low",     finding: "BitLocker pre-boot PIN not required on workstations", recommendation: "Enable TPM+PIN authentication to prevent cold boot attacks: require minimum 6-digit PIN", cis: "CIS Control 3.11", status: "resolved" },
    { id: "GPO-007", name: "Windows Firewall Policy",      severity: "Critical",finding: "Outbound firewall rules not configured — all outbound traffic allowed by default", recommendation: "Define allowlist of required outbound destinations, block all other outbound by default (allow 443, 80, DNS, NTP only)", cis: "CIS Control 4.4", status: "open" },
  ];
}

function genPasswordPolicies() {
  return [
    { domain: "CORP.ACME.LOCAL",   minLength: 12, complexity: true,  maxAge: 90,  lockoutThreshold: 5,  lockoutDuration: 30,  reversibleEncryption: false, score: 78, grade: "B", cisPass: 6, cisFail: 2 },
    { domain: "LEGACY.ACME.LOCAL", minLength: 6,  complexity: false, maxAge: 365, lockoutThreshold: 10, lockoutDuration: 15,  reversibleEncryption: false, score: 31, grade: "F", cisPass: 1, cisFail: 7 },
    { domain: "DEV.ACME.LOCAL",    minLength: 8,  complexity: true,  maxAge: 180, lockoutThreshold: 10, lockoutDuration: 15,  reversibleEncryption: false, score: 55, grade: "C", cisPass: 3, cisFail: 5 },
  ];
}

function genAttackPaths() {
  return {
    nodes: [
      { id: "n1",  type: "user",     label: "admin.svc",          risk: "critical", domain: "CORP" },
      { id: "n2",  type: "group",    label: "Domain Admins",       risk: "critical", domain: "CORP" },
      { id: "n3",  type: "group",    label: "Enterprise Admins",   risk: "critical", domain: "CORP" },
      { id: "n4",  type: "computer", label: "DC-01.CORP",          risk: "critical", domain: "CORP" },
      { id: "n5",  type: "computer", label: "DC-02.CORP",          risk: "high",     domain: "CORP" },
      { id: "n6",  type: "user",     label: "j.morrison",          risk: "high",     domain: "CORP" },
      { id: "n7",  type: "user",     label: "backup.svc",          risk: "critical", domain: "CORP" },
      { id: "n8",  type: "group",    label: "Backup Operators",    risk: "high",     domain: "CORP" },
      { id: "n9",  type: "computer", label: "FS-01.CORP",          risk: "medium",   domain: "CORP" },
      { id: "n10", type: "user",     label: "legacy.admin",        risk: "critical", domain: "LEGACY" },
      { id: "n11", type: "group",    label: "Administrators",      risk: "high",     domain: "LEGACY" },
      { id: "n12", type: "computer", label: "LEGACY-SRV-01",       risk: "high",     domain: "LEGACY" },
      { id: "n13", type: "user",     label: "r.patel",             risk: "medium",   domain: "CORP" },
      { id: "n14", type: "group",    label: "Account Operators",   risk: "medium",   domain: "CORP" },
    ],
    edges: [
      { id: "e1",  source: "n1",  target: "n2",  type: "MemberOf",    label: "MemberOf" },
      { id: "e2",  source: "n2",  target: "n3",  type: "MemberOf",    label: "MemberOf" },
      { id: "e3",  source: "n2",  target: "n4",  type: "AdminTo",     label: "AdminTo" },
      { id: "e4",  source: "n2",  target: "n5",  type: "AdminTo",     label: "AdminTo" },
      { id: "e5",  source: "n6",  target: "n2",  type: "MemberOf",    label: "MemberOf" },
      { id: "e6",  source: "n7",  target: "n8",  type: "MemberOf",    label: "MemberOf" },
      { id: "e7",  source: "n8",  target: "n4",  type: "HasSession",  label: "HasSession" },
      { id: "e8",  source: "n8",  target: "n9",  type: "AdminTo",     label: "AdminTo" },
      { id: "e9",  source: "n10", target: "n11", type: "MemberOf",    label: "MemberOf" },
      { id: "e10", source: "n11", target: "n12", type: "AdminTo",     label: "AdminTo" },
      { id: "e13", target: "n14", source: "n13", type: "MemberOf",    label: "MemberOf" },
    ],
    stats: {
      totalNodes: 14,
      criticalPaths: 5,
      highRiskAccounts: 4,
      estimatedDomainCompromiseTime: "< 2 hours",
    },
  };
}

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

// ── Analysis endpoints ────────────────────────────────────────────────────────

router.get("/ad-auditor/privileged-accounts", requireAuth, async (req, res) => {
  const { tenantId } = (req as AuthReq).user;
  const filter = (req.query["stale"] as string) ?? "all";
  const accounts = genPrivilegedAccounts(tenantId);
  const filtered = filter === "stale" ? accounts.filter(a => a.stale) : accounts;
  res.json({
    accounts: filtered,
    stats: {
      total: accounts.length,
      stale: accounts.filter(a => a.stale).length,
      critical: accounts.filter(a => a.risk === "Critical").length,
      serviceAccounts: accounts.filter(a => a.type === "service").length,
    },
  });
});

router.get("/ad-auditor/gpo", requireAuth, async (_req, res) => {
  const findings = genGpoFindings();
  res.json({
    findings,
    stats: {
      total: findings.length,
      critical: findings.filter(f => f.severity === "Critical").length,
      high: findings.filter(f => f.severity === "High").length,
      open: findings.filter(f => f.status === "open").length,
    },
  });
});

router.get("/ad-auditor/password-policy", requireAuth, async (_req, res) => {
  const policies = genPasswordPolicies();
  res.json({
    policies,
    cisChecks: [
      { id: "CIS-1.1.1", name: "Enforce password history",              requirement: "24 or more passwords remembered", status: "pass" },
      { id: "CIS-1.1.2", name: "Maximum password age",                  requirement: "365 or fewer days", status: "pass" },
      { id: "CIS-1.1.3", name: "Minimum password age",                  requirement: "1 or more days", status: "fail" },
      { id: "CIS-1.1.4", name: "Minimum password length",               requirement: "14 or more characters", status: "fail" },
      { id: "CIS-1.1.5", name: "Password complexity requirements",       requirement: "Enabled", status: "pass" },
      { id: "CIS-1.1.6", name: "Store passwords with reversible encryption", requirement: "Disabled", status: "pass" },
      { id: "CIS-1.2.1", name: "Account lockout duration",              requirement: "15 or more minutes", status: "fail" },
      { id: "CIS-1.2.2", name: "Account lockout threshold",             requirement: "5 or fewer invalid attempts", status: "pass" },
    ],
  });
});

router.get("/ad-auditor/attack-paths", requireAuth, async (_req, res) => {
  res.json(genAttackPaths());
});

// ── Test connection ────────────────────────────────────────────────────────────

router.post("/ad-auditor/test-connection", requireAuth, async (_req, res) => {
  await new Promise(r => setTimeout(r, 800));
  res.json({ success: true, message: "Simulated connection successful. 2,847 objects discovered.", latency: 124 });
});

export default router;

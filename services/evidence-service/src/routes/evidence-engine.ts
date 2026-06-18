import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/service-kit";
import { evidenceEngineRunsTable } from "@workspace/db";
import { requireAuth } from "@workspace/service-kit";
import type { JwtPayload } from "@workspace/service-kit";
import type { Request } from "express";

const router = Router();
type AuthReq = Request & { user: JwtPayload };

// ── Credential presence detection ─────────────────────────────────────────────
// The three evidence-engine integrations that use real API credentials.
// When the secret is missing the integration shows as "simulated" in the UI.

function coreIntegrationStatus(id: "aws" | "github" | "okta"): "connected" | "simulated" {
  if (id === "aws")    return (process.env["AWS_ACCESS_KEY_ID"] && process.env["AWS_SECRET_ACCESS_KEY"]) ? "connected" : "simulated";
  if (id === "github") return process.env["GITHUB_TOKEN"] ? "connected" : "simulated";
  if (id === "okta")   return (process.env["OKTA_DOMAIN"] && process.env["OKTA_API_TOKEN"]) ? "connected" : "simulated";
  return "simulated";
}

// ── Static metadata ───────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { id: "aws",         name: "AWS",                  category: "Cloud",        icon: "☁️",  checksTotal: 24, checksPassing: 21, controlsCovered: 31, status: "connected",    lastSync: "4 min ago",   description: "S3, IAM, CloudTrail, Config, GuardDuty" },
  { id: "github",      name: "GitHub",               category: "SDLC",         icon: "🐱",  checksTotal: 12, checksPassing: 11, controlsCovered: 14, status: "connected",    lastSync: "8 min ago",   description: "Branch protection, SAST, secret scanning" },
  { id: "okta",        name: "Okta",                 category: "IAM",          icon: "🔐",  checksTotal: 16, checksPassing: 14, controlsCovered: 22, status: "connected",    lastSync: "2 min ago",   description: "MFA policy, user lifecycle, SSO apps" },
  { id: "gcp",         name: "Google Cloud",         category: "Cloud",        icon: "🌐",  checksTotal: 18, checksPassing: 15, controlsCovered: 20, status: "connected",    lastSync: "11 min ago",  description: "IAM, logging, DLP, Security Command Center" },
  { id: "azure",       name: "Azure",                category: "Cloud",        icon: "🔵",  checksTotal: 20, checksPassing: 16, controlsCovered: 25, status: "warning",      lastSync: "1 hr ago",    description: "AD, Defender, Policy, Monitor" },
  { id: "crowdstrike", name: "CrowdStrike",          category: "Endpoint",     icon: "🦅",  checksTotal: 10, checksPassing: 10, controlsCovered: 12, status: "connected",    lastSync: "1 min ago",   description: "Sensor coverage, prevention policy, vulnerabilities" },
  { id: "jira",        name: "Jira",                 category: "Ticketing",    icon: "📋",  checksTotal: 8,  checksPassing: 7,  controlsCovered: 9,  status: "connected",    lastSync: "15 min ago",  description: "Vulnerability tickets, SLA compliance" },
  { id: "slack",       name: "Slack",                category: "Collaboration",icon: "💬",  checksTotal: 6,  checksPassing: 6,  controlsCovered: 7,  status: "connected",    lastSync: "3 min ago",   description: "Data retention, audit logs, DLP" },
  { id: "snowflake",   name: "Snowflake",            category: "Data",         icon: "❄️",  checksTotal: 9,  checksPassing: 7,  controlsCovered: 11, status: "warning",      lastSync: "2 hr ago",    description: "Data masking, access controls, MFA" },
  { id: "gsuite",      name: "Google Workspace",     category: "Productivity", icon: "📧",  checksTotal: 11, checksPassing: 9,  controlsCovered: 13, status: "connected",    lastSync: "9 min ago",   description: "MFA, data sharing, retention policy" },
  { id: "pagerduty",   name: "PagerDuty",            category: "IR",           icon: "🚨",  checksTotal: 5,  checksPassing: 5,  controlsCovered: 6,  status: "connected",    lastSync: "5 min ago",   description: "Incident management, escalation policy" },
  { id: "qualys",      name: "Qualys",               category: "Vuln Mgmt",   icon: "🔍",  checksTotal: 14, checksPassing: 11, controlsCovered: 18, status: "connected",    lastSync: "30 min ago",  description: "Scan coverage, critical CVEs, patch SLA" },
  { id: "datadog",     name: "Datadog",              category: "Monitoring",   icon: "📊",  checksTotal: 7,  checksPassing: 7,  controlsCovered: 8,  status: "connected",    lastSync: "6 min ago",   description: "Log retention, alert configuration, APM" },
  { id: "cloudflare",  name: "Cloudflare",           category: "Network",      icon: "🔶",  checksTotal: 6,  checksPassing: 5,  controlsCovered: 8,  status: "connected",    lastSync: "12 min ago",  description: "DDoS, WAF, TLS, access policies" },
  { id: "gitlab",      name: "GitLab",               category: "SDLC",         icon: "🦊",  checksTotal: 0,  checksPassing: 0,  controlsCovered: 0,  status: "disconnected", lastSync: "Never",        description: "Not connected" },
  { id: "azure-ad",    name: "Azure AD (Entra)",     category: "IAM",          icon: "🏢",  checksTotal: 0,  checksPassing: 0,  controlsCovered: 0,  status: "disconnected", lastSync: "Never",        description: "Not connected" },
];

const CHECKS = [
  { id: "aws-001", integrationId: "aws", name: "S3 Public Access Block — All Buckets",            frameworks: ["ISO 27001","SOC 2","NIST CSF"], control: "A.13.1.3", category: "Cloud Config",    status: "pass",    lastRun: "4 min ago",  evidence: "CloudTrail log + Config rule" },
  { id: "aws-002", integrationId: "aws", name: "CloudTrail Enabled in All Regions",               frameworks: ["SOC 2","PCI DSS"],             control: "CC7.2",     category: "Logging",         status: "pass",    lastRun: "4 min ago",  evidence: "AWS Config conformance" },
  { id: "aws-003", integrationId: "aws", name: "IAM MFA Enabled for Root Account",                frameworks: ["ISO 27001","SOC 2","CIS"],      control: "A.9.4.2",   category: "Identity",        status: "pass",    lastRun: "4 min ago",  evidence: "IAM credential report" },
  { id: "aws-004", integrationId: "aws", name: "IAM MFA Enabled for All Console Users",           frameworks: ["ISO 27001","SOC 2"],            control: "A.9.4.2",   category: "Identity",        status: "fail",    lastRun: "4 min ago",  evidence: "3 users missing MFA" },
  { id: "aws-005", integrationId: "aws", name: "GuardDuty Enabled in All Regions",                frameworks: ["SOC 2","NIST CSF"],             control: "CC7.2",     category: "Threat Detection",status: "pass",    lastRun: "4 min ago",  evidence: "GuardDuty status API" },
  { id: "aws-006", integrationId: "aws", name: "EBS Volumes Encrypted at Rest",                   frameworks: ["ISO 27001","HIPAA","PCI DSS"],  control: "A.10.1.1",  category: "Encryption",      status: "pass",    lastRun: "4 min ago",  evidence: "EC2 describe-volumes" },
  { id: "aws-007", integrationId: "aws", name: "RDS Encryption at Rest Enabled",                  frameworks: ["ISO 27001","HIPAA"],            control: "A.10.1.1",  category: "Encryption",      status: "pass",    lastRun: "4 min ago",  evidence: "RDS describe-db-instances" },
  { id: "aws-008", integrationId: "aws", name: "VPC Flow Logs Enabled",                           frameworks: ["SOC 2","NIST CSF"],             control: "CC7.2",     category: "Logging",         status: "warning", lastRun: "4 min ago",  evidence: "2 VPCs missing flow logs" },
  { id: "aws-009", integrationId: "aws", name: "No Unused IAM Credentials (>90 days)",            frameworks: ["ISO 27001","CIS"],              control: "A.9.2.6",   category: "Identity",        status: "fail",    lastRun: "4 min ago",  evidence: "5 stale credentials found" },
  { id: "aws-010", integrationId: "aws", name: "Security Hub Enabled",                            frameworks: ["SOC 2","NIST CSF"],             control: "CC7.1",     category: "Posture",         status: "pass",    lastRun: "4 min ago",  evidence: "Security Hub status" },
  { id: "gh-001",  integrationId: "github", name: "Branch Protection on Default Branch",         frameworks: ["SOC 2","ISO 27001"],            control: "CC8.1",     category: "SDLC",            status: "pass",    lastRun: "8 min ago",  evidence: "GitHub branch protection API" },
  { id: "gh-002",  integrationId: "github", name: "Required Code Review (≥1 Approver)",          frameworks: ["SOC 2"],                        control: "CC8.1",     category: "SDLC",            status: "pass",    lastRun: "8 min ago",  evidence: "Branch protection rules" },
  { id: "gh-003",  integrationId: "github", name: "Secret Scanning Enabled",                     frameworks: ["SOC 2","ISO 27001"],            control: "A.12.6.1",  category: "SDLC",            status: "pass",    lastRun: "8 min ago",  evidence: "Security settings API" },
  { id: "gh-004",  integrationId: "github", name: "Dependabot Alerts Enabled",                   frameworks: ["ISO 27001"],                    control: "A.12.6.1",  category: "SDLC",            status: "warning", lastRun: "8 min ago",  evidence: "12 repos with Dependabot disabled" },
  { id: "gh-005",  integrationId: "github", name: "2FA Required for All Org Members",            frameworks: ["ISO 27001","SOC 2"],            control: "A.9.4.2",   category: "Identity",        status: "pass",    lastRun: "8 min ago",  evidence: "GitHub org settings" },
  { id: "okta-001",integrationId: "okta",  name: "MFA Required for All Users",                   frameworks: ["ISO 27001","SOC 2","NIST CSF"], control: "A.9.4.2",   category: "Identity",        status: "pass",    lastRun: "2 min ago",  evidence: "Okta policy groups" },
  { id: "okta-002",integrationId: "okta",  name: "MFA Phishing-Resistant for Admins",            frameworks: ["ISO 27001","SOC 2"],            control: "A.9.4.2",   category: "Identity",        status: "pass",    lastRun: "2 min ago",  evidence: "Okta admin MFA policy" },
  { id: "okta-003",integrationId: "okta",  name: "Inactive User Auto-Deprovisioning (≤30d)",     frameworks: ["ISO 27001"],                    control: "A.9.2.6",   category: "Identity",        status: "fail",    lastRun: "2 min ago",  evidence: "8 inactive accounts not deprovisioned" },
  { id: "okta-004",integrationId: "okta",  name: "Session Timeout ≤ 8 Hours",                   frameworks: ["ISO 27001","PCI DSS"],          control: "A.9.4.3",   category: "Identity",        status: "pass",    lastRun: "2 min ago",  evidence: "Okta session policy" },
  { id: "okta-005",integrationId: "okta",  name: "Privileged Access Reviews Tracked",            frameworks: ["SOC 2","ISO 27001"],            control: "A.9.2.5",   category: "Identity",        status: "pass",    lastRun: "2 min ago",  evidence: "Access review logs" },
  { id: "cs-001",  integrationId: "crowdstrike", name: "Sensor Coverage ≥ 98% of Fleet",         frameworks: ["SOC 2","NIST CSF"],             control: "CC6.8",     category: "Endpoint",        status: "pass",    lastRun: "1 min ago",  evidence: "Falcon sensor deployment report" },
  { id: "cs-002",  integrationId: "crowdstrike", name: "Real-Time Prevention Mode Enabled",      frameworks: ["SOC 2","ISO 27001"],            control: "A.12.2.1",  category: "Endpoint",        status: "pass",    lastRun: "1 min ago",  evidence: "Prevention policy config" },
  { id: "cs-003",  integrationId: "crowdstrike", name: "No Critical CVEs (>7d Unpatched)",       frameworks: ["ISO 27001","PCI DSS"],          control: "A.12.6.1",  category: "Vuln Mgmt",       status: "warning", lastRun: "1 min ago",  evidence: "4 critical CVEs awaiting patch" },
  { id: "ql-001",  integrationId: "qualys",  name: "Weekly Scan Coverage ≥ 95%",                 frameworks: ["ISO 27001","PCI DSS"],          control: "A.12.6.1",  category: "Vuln Mgmt",       status: "pass",    lastRun: "30 min ago", evidence: "Scan report export" },
  { id: "ql-002",  integrationId: "qualys",  name: "Critical Vulns Remediated ≤ 15 Days",        frameworks: ["ISO 27001","PCI DSS","SOC 2"],  control: "A.12.6.1",  category: "Vuln Mgmt",       status: "warning", lastRun: "30 min ago", evidence: "2 critical vulns past SLA" },
  { id: "ql-003",  integrationId: "qualys",  name: "High Vulns Remediated ≤ 30 Days",            frameworks: ["ISO 27001"],                    control: "A.12.6.1",  category: "Vuln Mgmt",       status: "pass",    lastRun: "30 min ago", evidence: "SLA compliance report" },
  { id: "gsuite-001",integrationId: "gsuite", name: "2-Step Verification Enforcement",            frameworks: ["ISO 27001","SOC 2"],            control: "A.9.4.2",   category: "Identity",        status: "pass",    lastRun: "9 min ago",  evidence: "Admin SDK users API" },
  { id: "gsuite-002",integrationId: "gsuite", name: "External Sharing Restricted to Allowlist",  frameworks: ["ISO 27001","GDPR"],             control: "A.13.2.1",  category: "Data",            status: "pass",    lastRun: "9 min ago",  evidence: "Drive audit log" },
  { id: "gsuite-003",integrationId: "gsuite", name: "Audit Logs Retention ≥ 365 Days",           frameworks: ["SOC 2","GDPR"],                 control: "CC7.2",     category: "Logging",         status: "warning", lastRun: "9 min ago",  evidence: "Retention set to 180 days" },
  { id: "az-001",  integrationId: "azure",   name: "Defender for Cloud Enabled",                  frameworks: ["ISO 27001","SOC 2"],            control: "A.12.4.1",  category: "Posture",         status: "pass",    lastRun: "1 hr ago",   evidence: "Defender status API" },
  { id: "az-002",  integrationId: "azure",   name: "Diagnostic Logging Enabled on Key Vaults",   frameworks: ["ISO 27001","PCI DSS"],          control: "A.12.4.1",  category: "Logging",         status: "fail",    lastRun: "1 hr ago",   evidence: "3 key vaults missing diagnostic logs" },
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/evidence-engine/integrations", requireAuth, (_req, res) => {
  // Override status for the three evidence-engine integrations based on real credentials
  const live = INTEGRATIONS.map(i => {
    if (i.id === "aws" || i.id === "github" || i.id === "okta") {
      const s = coreIntegrationStatus(i.id as "aws" | "github" | "okta");
      return { ...i, status: s, credentialMode: s };
    }
    return i;
  });
  res.json(live);
});

router.get("/evidence-engine/checks", requireAuth, (req, res) => {
  const { integrationId, status, framework } = req.query as Record<string, string>;
  let checks = [...CHECKS];
  if (integrationId) checks = checks.filter(c => c.integrationId === integrationId);
  if (status)        checks = checks.filter(c => c.status === status);
  if (framework)     checks = checks.filter(c => c.frameworks.some(f => f.toLowerCase().includes(framework.toLowerCase())));
  res.json(checks);
});

// ── Runs — DB-backed ──────────────────────────────────────────────────────────

router.get("/evidence-engine/runs", requireAuth, async (req, res) => {
  try {
    const { tenantId } = (req as AuthReq).user;
    const rows = await db.select().from(evidenceEngineRunsTable)
      .where(eq(evidenceEngineRunsTable.tenantId, Number(tenantId)))
      .orderBy(desc(evidenceEngineRunsTable.createdAt))
      .limit(20);
    res.json(rows.map(r => ({
      id:          r.runId,
      timestamp:   r.createdAt.toISOString(),
      duration:    r.duration,
      total:       r.total,
      passed:      r.passed,
      failed:      r.failed,
      warnings:    r.warnings,
      triggeredBy: r.triggeredBy,
    })));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/evidence-engine/run", requireAuth, async (req, res) => {
  try {
    const { tenantId, email } = (req as AuthReq).user;
    const runId = `run-${Date.now()}`;
    const [row] = await db.insert(evidenceEngineRunsTable)
      .values({
        tenantId:    Number(tenantId),
        runId,
        duration:    "1m 26s",
        total:       168,
        passed:      148,
        failed:      8,
        warnings:    12,
        triggeredBy: String(email ?? "User"),
      })
      .returning();
    res.status(201).json({
      id:          row.runId,
      timestamp:   row.createdAt.toISOString(),
      duration:    row.duration,
      total:       row.total,
      passed:      row.passed,
      failed:      row.failed,
      warnings:    row.warnings,
      triggeredBy: row.triggeredBy,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.get("/evidence-engine/coverage", requireAuth, (_req, res) => {
  res.json({
    overall: { covered: 148, total: 168, pct: 88 },
    byFramework: [
      { framework: "ISO 27001", covered: 87, total: 93, pct: 94 },
      { framework: "SOC 2",     covered: 21, total: 23, pct: 91 },
      { framework: "PCI DSS",   covered: 15, total: 18, pct: 83 },
      { framework: "NIST CSF",  covered: 11, total: 13, pct: 85 },
      { framework: "HIPAA",     covered: 12, total: 18, pct: 67 },
      { framework: "GDPR",      covered: 14, total: 21, pct: 67 },
    ],
  });
});

export default router;

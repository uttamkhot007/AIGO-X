/**
 * Integration Pipeline Service
 * Maps connector capabilities → GRC module data ingestion.
 * Each activation/sync generates realistic data and routes it to:
 *   - risksTable          (Risk Register)
 *   - findingsTable       (Security Findings / CSPM)
 *   - controlsTable       (Compliance Controls)
 *   - ticketsTable        (Service Desk)
 *   - caasmService        (Asset Inventory)
 */
import { db } from "@workspace/service-kit";
import { risksTable, findingsTable, controlsTable, ticketsTable } from "@workspace/db";
import { caasmService } from "../caasm";
import { randomUUID } from "crypto";
import type { ConnectorDef, Connection } from "./IntegrationHubService";

// ── Pipeline event log ─────────────────────────────────────────────────────
export interface PipelineEvent {
  id:            string;
  connectionId:  string;
  connectorId:   string;
  connectorName: string;
  tenantId:      string;
  ts:            string;
  duration:      number;
  status:        "success" | "partial" | "failed";
  ingested: {
    risks:     number;
    findings:  number;
    controls:  number;
    tickets:   number;
    assets:    number;
  };
  modules: string[];
  sample:  string[];
}

// tenant → events[]
const pipelineLog = new Map<string, PipelineEvent[]>();

function log(tenantId: string): PipelineEvent[] {
  if (!pipelineLog.has(tenantId)) pipelineLog.set(tenantId, []);
  return pipelineLog.get(tenantId)!;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const ISO  = () => new Date().toISOString();
const DUE  = (days = 30) => {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
};
let _seq = Date.now();
const nextId = (prefix: string) => `${prefix}-${++_seq}`;

const OWNERS   = ["security@acme.com", "it-ops@acme.com", "ciso@acme.com", "compliance@acme.com", "devops@acme.com"];
const OWNERS_F = ["Alex Kim", "Sarah Chen", "Marcus Johnson", "Priya Patel", "Tom Hughes"];
const OWN  = () => { const i = rand(0,4); return { email: OWNERS[i]!, full: OWNERS_F[i]! }; };

// ── CLOUD (CSPM) ───────────────────────────────────────────────────────────
async function ingestCloud(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number; assets:number }> {
  const cloudProvider = connector.id === "aws" ? "AWS" : connector.id === "azure" ? "Azure" : "GCP";

  const FINDING_TEMPLATES = [
    { title:"Public S3 bucket with sensitive data", sev:"Critical", res:`s3://acme-${cloudProvider.toLowerCase()}-data-${rand(1,99)}` },
    { title:"IAM user with AdministratorAccess policy", sev:"Critical", res:`iam/user/svc-legacy-${rand(1,9)}` },
    { title:"Unencrypted EBS volume attached to prod instance", sev:"High", res:`vol-${Math.random().toString(16).slice(2,10)}` },
    { title:"Security group allows 0.0.0.0/0 on port 22 (SSH)", sev:"High", res:`sg-${Math.random().toString(16).slice(2,10)}` },
    { title:"Root account without MFA enabled", sev:"Critical", res:"root/account-settings" },
    { title:"CloudTrail logging disabled in region", sev:"High", res:`cloudtrail/${cloudProvider.toLowerCase()}-region-${rand(1,5)}` },
    { title:"RDS instance publicly accessible", sev:"High", res:`db-${cloudProvider.toLowerCase()}-${rand(1,9)}.cluster.amazonaws.com` },
    { title:"KMS key rotation not enabled", sev:"Medium", res:`kms/key/${randomUUID().slice(0,8)}` },
    { title:"EC2 instance using default VPC", sev:"Medium", res:`i-${Math.random().toString(16).slice(2,10)}` },
    { title:"Lambda function with overly-permissive execution role", sev:"Medium", res:`lambda/acme-${pick(["prod","staging","dev"])}-fn-${rand(1,20)}` },
    { title:"ACR image vulnerability: CVE-2024-${rand(1000,9999)}", sev:"High", res:`registry/${cloudProvider.toLowerCase()}/acme-api:latest` },
    { title:"Unused IAM credentials (>90 days)", sev:"Medium", res:`iam/user/svc-${rand(1,9)}-readonly` },
  ];

  const selected = [...FINDING_TEMPLATES].sort(()=>Math.random()-0.5).slice(0, rand(4, 8));
  await Promise.all(selected.map(f =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("CSPM"), cloud: cloudProvider,
      severity: f.sev, title: f.title, resource: f.res, status: "open",
    }).onConflictDoNothing()
  ));

  // Cloud assets
  const cloudAssets = [
    { hostname:`${connector.id}-api-prod-${rand(1,5)}`, os:"Amazon Linux 2023", category:"Cloud" as const, ip:`10.${rand(0,255)}.${rand(0,255)}.${rand(1,254)}`, manufacturer:`${cloudProvider} EC2` },
    { hostname:`${connector.id}-db-cluster-${rand(1,3)}`, os:"Amazon RDS PostgreSQL", category:"Cloud" as const, ip:`10.${rand(0,255)}.${rand(0,255)}.${rand(1,254)}`, manufacturer:`${cloudProvider} RDS` },
    { hostname:`${connector.id}-lambda-${rand(10,99)}`, os:"Lambda Runtime", category:"Container" as const, ip:"N/A", manufacturer:`${cloudProvider} Lambda` },
  ];
  for (const a of cloudAssets.slice(0, rand(2,3))) {
    caasmService.createAsset(String(tenantId), {
      hostname: a.hostname, category: a.category, confidence: "High", os: a.os,
      ip: a.ip, manufacturer: a.manufacturer, risk: pick(["Medium","High","Low"] as const),
      managed: true, dept: "Engineering", tags: [cloudProvider.toLowerCase(), "cloud", "auto-discovered"],
      antivirus: "N/A", agentVersion: "N/A", lastSeen: ISO(), exposureScore: rand(20,80),
      vulnCount: rand(0,5), critVulns: rand(0,2), environment: "Production", dataSensitivity: "Confidential",
    });
  }

  // Risk for cloud misconfigs
  const o = OWN();
  await db.insert(risksTable).values({
    tenantId, riskId: nextId("RK"), severity: "High", name: `${cloudProvider} Cloud Misconfiguration — Posture Score`,
    category: "Cloud Security", description: `${selected.length} CSPM findings from ${connector.name}: ${selected.slice(0,2).map(f=>f.title).join("; ")}`,
    score: rand(60, 95), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
  }).onConflictDoNothing();

  return { risks: 1, findings: selected.length, assets: cloudAssets.length };
}

// ── IDENTITY (IAM/SSO) ─────────────────────────────────────────────────────
async function ingestIdentity(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; controls:number }> {
  const CTRL_TEMPLATES = [
    { id:"A.9.4.1", fw:"ISO 27001", domain:"Access Control", name:`${connector.name} — Information access restriction enforced`, status:"implemented" },
    { id:"A.9.2.3", fw:"ISO 27001", domain:"Access Control", name:`${connector.name} — Management of privileged access rights`, status:"in-review" },
    { id:"A.9.4.2", fw:"ISO 27001", domain:"Access Control", name:`${connector.name} — Secure log-on procedures (MFA)`, status:"implemented" },
    { id:"CC6.1",   fw:"SOC 2 Type II", domain:"Logical Access", name:`${connector.name} — Logical access controls implemented`, status:"implemented" },
    { id:"CC6.2",   fw:"SOC 2 Type II", domain:"Logical Access", name:`${connector.name} — New user provisioning review`, status:"in-review" },
    { id:"CC6.3",   fw:"SOC 2 Type II", domain:"Logical Access", name:`${connector.name} — Role-based access control active`, status:"implemented" },
    { id:"A.18.1.3",fw:"ISO 27001", domain:"Compliance", name:`${connector.name} — Protection of records`, status:"implemented" },
  ];
  const selected = [...CTRL_TEMPLATES].sort(()=>Math.random()-0.5).slice(0, rand(3,5));
  const o = OWN();
  await Promise.all(selected.map(c =>
    db.insert(controlsTable).values({
      tenantId, controlId: `${c.id}-${connector.id.toUpperCase().slice(0,4)}`, framework: c.fw,
      domain: c.domain, name: c.name, status: c.status, owner: o.email,
      evidence: rand(1,8), dueDate: DUE(rand(30,90)),
    }).onConflictDoNothing()
  ));

  if (connector.capabilities.includes("risky-users") || connector.capabilities.includes("mfa")) {
    await db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "Medium",
      name: `${connector.name} — Users without MFA`,
      category: "Identity & Access",
      description: `${rand(3, 15)} user accounts in ${connector.name} have not enrolled MFA. Risk of account takeover.`,
      score: rand(45, 72), owner: o.email, ownerFull: o.full, trend: "flat", status: "open",
    }).onConflictDoNothing();
    return { risks: 1, controls: selected.length };
  }
  return { risks: 0, controls: selected.length };
}

// ── EDR / XDR ──────────────────────────────────────────────────────────────
async function ingestEdr(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number; assets:number }> {
  const THREAT_TEMPLATES = [
    { title:`Ransomware activity detected: ${pick(["LockBit","BlackCat","Conti","Ryuk"])} variant`, sev:"Critical" },
    { title:`Lateral movement via ${pick(["PsExec","WMI","RDP"])} detected on endpoint`, sev:"High" },
    { title:`Credential harvesting tool (${pick(["Mimikatz","LaZagne","CobaltStrike"])}) detected`, sev:"Critical" },
    { title:`Suspicious PowerShell execution with base64 encoding`, sev:"High" },
    { title:`Known malicious IP communication: ${rand(1,255)}.${rand(1,255)}.${rand(1,255)}.${rand(1,255)}`, sev:"High" },
    { title:`${connector.name} agent offline on ${rand(1,8)} endpoints`, sev:"Medium" },
    { title:`Fileless malware execution in-memory`, sev:"High" },
    { title:`USB device connected — data exfiltration risk`, sev:"Medium" },
  ];
  const selected = THREAT_TEMPLATES.slice(0, rand(3,6));
  const cloud = connector.id === "defender" ? "Azure" : "EDR";
  await Promise.all(selected.map(t =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("EDR"), cloud, severity: t.sev,
      title: t.title, resource: `endpoint-${rand(1,100)}.corp.acme.com`, status: "open",
    }).onConflictDoNothing()
  ));

  // Endpoint assets
  const endpointHostnames = [
    `wks-${pick(["nyc","lon","sg","tok"])}-${rand(100,999)}`,
    `srv-${pick(["app","db","file","print"])}-${rand(10,99)}`,
    `lap-${pick(["mkt","eng","fin","hr"])}-${rand(100,999)}`,
  ];
  for (const h of endpointHostnames.slice(0, rand(2,3))) {
    caasmService.createAsset(String(tenantId), {
      hostname: h, category: h.startsWith("wks") || h.startsWith("lap") ? "Workstation" : "Server",
      confidence: "High", os: pick(["Windows 11 23H2","Windows 10 22H2","macOS 14 Sonoma","Ubuntu 22.04"]),
      ip: `10.${rand(0,5)}.${rand(1,254)}.${rand(1,254)}`, manufacturer: pick(["Dell","HP","Lenovo","Apple"]),
      risk: pick(["High","Medium","Critical"] as const), managed: true,
      dept: pick(["Engineering","Finance","Marketing","HR","Operations"]),
      tags: [connector.id, "edr-managed", "auto-discovered"],
      antivirus: connector.name, agentVersion: `${rand(6,8)}.${rand(0,9)}.${rand(10000,99999)}.0`,
      lastSeen: ISO(), exposureScore: rand(30,90), vulnCount: rand(0,8), critVulns: rand(0,3),
      environment: "Corporate", dataSensitivity: "Internal",
    });
  }

  const o = OWN();
  const crit = selected.filter(t=>t.sev==="Critical");
  if (crit.length > 0) {
    await db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "Critical",
      name: `${connector.name} — Active Threat Detections`,
      category: "Endpoint Security",
      description: `${crit.length} critical threat${crit.length>1?"s":""} detected: ${crit[0]!.title}`,
      score: rand(80, 98), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
    }).onConflictDoNothing();
  }
  return { risks: crit.length > 0 ? 1 : 0, findings: selected.length, assets: endpointHostnames.length };
}

// ── VULN MGMT ──────────────────────────────────────────────────────────────
async function ingestVuln(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number }> {
  const CVES = [
    { title:`CVE-2024-${rand(1000,9999)}: Remote Code Execution in OpenSSL`, sev:"Critical" },
    { title:`CVE-2024-${rand(1000,9999)}: Privilege Escalation in Linux Kernel`, sev:"Critical" },
    { title:`CVE-2024-${rand(1000,9999)}: SQL Injection in Apache Tomcat`, sev:"High" },
    { title:`CVE-2023-${rand(1000,9999)}: Path Traversal in nginx ${rand(1,3)}.${rand(20,30)}.${rand(0,9)}`, sev:"High" },
    { title:`CVE-2024-${rand(1000,9999)}: SSRF in Spring Framework`, sev:"High" },
    { title:`Outdated TLS 1.0/1.1 still enabled on ${rand(2,12)} endpoints`, sev:"Medium" },
    { title:`Default credentials on ${rand(1,5)} network devices`, sev:"High" },
    { title:`Missing security patches: ${rand(15,60)} endpoints >30 days behind`, sev:"Medium" },
  ];
  const selected = CVES.slice(0, rand(4,7));
  await Promise.all(selected.map(v =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("VULN"), cloud: "On-Prem",
      severity: v.sev, title: v.title,
      resource: `host-${rand(1,100)}.corp.acme.com`,
      status: "open",
    }).onConflictDoNothing()
  ));

  const o = OWN();
  const critCount = selected.filter(v=>v.sev==="Critical").length;
  await Promise.all(selected.filter(v=>v.sev==="Critical").map(v =>
    db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "Critical",
      name: `${connector.name} — ${v.title.split(":")[0]}`,
      category: "Vulnerability Management",
      description: `Detected by ${connector.name}: ${v.title}. Affects ${rand(1,20)} assets in production.`,
      score: rand(82, 99), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
    }).onConflictDoNothing()
  ));
  return { risks: critCount, findings: selected.length };
}

// ── SIEM / SOAR ────────────────────────────────────────────────────────────
async function ingestSiem(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number }> {
  const ALERTS = [
    { title:`Brute-force attack: ${rand(200,5000)} failed logins in 1h`, sev:"High" },
    { title:`Anomalous data exfiltration: ${rand(1,50)}GB transferred to external IP`, sev:"Critical" },
    { title:`New admin account created outside change window`, sev:"High" },
    { title:`Impossible travel login: ${pick(["US","UK","CN","RU","BR"])} → ${pick(["JP","AU","DE","FR","IN"])} in 2h`, sev:"High" },
    { title:`Correlation rule triggered: Ransomware kill-chain activity`, sev:"Critical" },
    { title:`Scheduled task created by non-admin user`, sev:"Medium" },
    { title:`Firewall policy bypassed via ${pick(["DNS tunneling","HTTP over port 443","ICMP covert channel"])}`, sev:"High" },
    { title:`${rand(50,500)} failed API authentication attempts`, sev:"Medium" },
  ];
  const selected = ALERTS.slice(0, rand(4,7));
  await Promise.all(selected.map(a =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("SIEM"), cloud: "SIEM",
      severity: a.sev, title: a.title,
      resource: `siem:${connector.id}:${new Date().toISOString().slice(0,10)}`,
      status: "open",
    }).onConflictDoNothing()
  ));
  const o = OWN();
  const crit = selected.filter(a=>a.sev==="Critical");
  await Promise.all(crit.map(a =>
    db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "Critical",
      name: `${connector.name} Alert — ${a.title.split(":")[0]}`,
      category: "Incident Response",
      description: a.title,
      score: rand(78, 99), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
    }).onConflictDoNothing()
  ));
  return { risks: crit.length, findings: selected.length };
}

// ── ITSM (Ticketing) ───────────────────────────────────────────────────────
async function ingestItsm(tenantId: number, connector: ConnectorDef): Promise<{ tickets:number }> {
  const TICKET_TEMPLATES = [
    { title:`[${connector.name}] Critical vulnerability remediation — CVE-2024-${rand(1000,9999)}`, prio:"Critical", cat:"Vulnerability" },
    { title:`[${connector.name}] Access review for privileged accounts`, prio:"High", cat:"Compliance" },
    { title:`[${connector.name}] Patch deployment: ${rand(15,60)} endpoints`, prio:"High", cat:"Patch Management" },
    { title:`[${connector.name}] Security incident investigation`, prio:"Critical", cat:"Incident" },
    { title:`[${connector.name}] MFA rollout — batch ${rand(1,5)}`, prio:"Medium", cat:"Access Management" },
    { title:`[${connector.name}] CSPM finding remediation — S3 public access`, prio:"High", cat:"Cloud Security" },
  ];
  const selected = TICKET_TEMPLATES.slice(0, rand(3,5));
  const o = OWN();
  await Promise.all(selected.map(t =>
    db.insert(ticketsTable).values({
      tenantId, ticketId: nextId("TKT"), priority: t.prio, title: t.title,
      category: t.cat, assignee: o.email, status: "open",
      sla: `${rand(2,14)}d`, aiSeverity: t.prio, aiCategory: t.cat,
      aiConfidence: Math.round(rand(70,98)) / 100,
    }).onConflictDoNothing()
  ));
  return { tickets: selected.length };
}

// ── PAM ────────────────────────────────────────────────────────────────────
async function ingestPam(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; controls:number }> {
  const CTRL_TEMPLATES = [
    { id:"A.9.2.3", fw:"ISO 27001", domain:"Access Control", name:`${connector.name} — Privileged access rights management`, status:"implemented" },
    { id:"A.9.4.4", fw:"ISO 27001", domain:"Access Control", name:`${connector.name} — Session recording for privileged sessions`, status:"implemented" },
    { id:"CC6.3",   fw:"SOC 2 Type II", domain:"Logical Access", name:`${connector.name} — PAM vaulting and rotation policies`, status:"implemented" },
    { id:"PR.AC-4", fw:"NIS2", domain:"Access Management", name:`${connector.name} — Manage access permissions`, status:"in-review" },
  ];
  const o = OWN();
  await Promise.all(CTRL_TEMPLATES.map(c =>
    db.insert(controlsTable).values({
      tenantId, controlId: `${c.id}-PAM`, framework: c.fw,
      domain: c.domain, name: c.name, status: c.status,
      owner: o.email, evidence: rand(3,10), dueDate: DUE(30),
    }).onConflictDoNothing()
  ));

  await db.insert(risksTable).values({
    tenantId, riskId: nextId("RK"), severity: "Medium",
    name: `${connector.name} — Dormant Privileged Accounts`,
    category: "Privileged Access",
    description: `${rand(2,15)} privileged accounts inactive for >90 days detected in ${connector.name} vault.`,
    score: rand(40, 70), owner: o.email, ownerFull: o.full, trend: "flat", status: "open",
  }).onConflictDoNothing();

  return { risks: 1, controls: CTRL_TEMPLATES.length };
}

// ── DEVSECOPS ─────────────────────────────────────────────────────────────
async function ingestDevsecops(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number }> {
  const CODE_FINDINGS = [
    { title:`Secret detected in ${pick([".env","config.yml","docker-compose","src/config"])} file`, sev:"Critical" },
    { title:`SAST: SQL Injection (${rand(1,8)} occurrences in ${pick(["UserController","AuthService","DataRepo"])}.${pick(["ts","js","py","java"])})`, sev:"High" },
    { title:`SAST: XSS vulnerability in template rendering`, sev:"High" },
    { title:`Vulnerable dependency: ${pick(["lodash","axios","express","log4j","spring-core"])} ${rand(1,4)}.${rand(0,9)}.${rand(0,9)} — ${rand(1,8)} CVEs`, sev:"High" },
    { title:`Container image: ${rand(15,80)} OS packages with known vulnerabilities`, sev:"Medium" },
    { title:`IaC misconfiguration: Terraform state file in public S3 bucket`, sev:"Critical" },
    { title:`Dependency confusion attack vector in package registry`, sev:"High" },
    { title:`Hardcoded API key in ${rand(1,5)} source files`, sev:"Critical" },
  ];
  const selected = CODE_FINDINGS.slice(0, rand(4,7));
  await Promise.all(selected.map(f =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("SAST"), cloud: "DevSecOps",
      severity: f.sev, title: f.title,
      resource: `repo/${pick(["acme-api","acme-web","acme-infra","acme-mobile"])}:${pick(["main","dev","feature/auth"])}`,
      status: "open",
    }).onConflictDoNothing()
  ));
  const o = OWN();
  const crit = selected.filter(f=>f.sev==="Critical");
  await Promise.all(crit.map(f =>
    db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "Critical",
      name: `${connector.name} — ${f.title.split(":")[0]}`,
      category: "Application Security",
      description: f.title,
      score: rand(75, 98), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
    }).onConflictDoNothing()
  ));
  return { risks: crit.length, findings: selected.length };
}

// ── NETWORK ───────────────────────────────────────────────────────────────
async function ingestNetwork(tenantId: number, connector: ConnectorDef): Promise<{ risks:number; findings:number; assets:number }> {
  const NET_FINDINGS = [
    { title:`NGFW: ${rand(50,500)} blocked intrusion attempts from ${rand(5,30)} IPs`, sev:"High" },
    { title:`Unencrypted HTTP traffic on internal segment (${rand(5,50)} flows)`, sev:"Medium" },
    { title:`Rogue device detected: MAC ${Array.from({length:6},()=>rand(0,255).toString(16).padStart(2,'0')).join(':')}`, sev:"High" },
    { title:`DNS tunneling activity detected — possible C2 channel`, sev:"Critical" },
    { title:`VPN certificate expiring in ${rand(1,14)} days`, sev:"Medium" },
    { title:`Network scan from internal host ${rand(1,254)}.${rand(1,254)} — possible pivot`, sev:"High" },
  ];
  const selected = NET_FINDINGS.slice(0, rand(3,5));
  await Promise.all(selected.map(f =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("NET"), cloud: "Network",
      severity: f.sev, title: f.title,
      resource: `network/${connector.id}:${pick(["core","dmz","prod","guest","iot"])}`,
      status: "open",
    }).onConflictDoNothing()
  ));

  const o = OWN();
  const crit = selected.filter(f=>f.sev==="Critical");
  if (crit.length > 0) {
    await db.insert(risksTable).values({
      tenantId, riskId: nextId("RK"), severity: "High",
      name: `${connector.name} — Network Anomaly Detected`,
      category: "Network Security",
      description: crit[0]!.title,
      score: rand(60, 88), owner: o.email, ownerFull: o.full, trend: "up", status: "open",
    }).onConflictDoNothing();
  }

  // Network assets
  const netAssets = [
    { hostname:`${connector.id}-fw-${rand(1,4)}`, os:"Firewall OS", category:"Network" as const, manufacturer:connector.name },
    { hostname:`${connector.id}-sw-${rand(1,8)}`, os:"Switch OS", category:"Network" as const, manufacturer:connector.name },
  ];
  for (const a of netAssets.slice(0,rand(1,2))) {
    caasmService.createAsset(String(tenantId), {
      hostname: a.hostname, category: a.category, confidence: "High", os: a.os,
      ip: `10.0.${rand(0,10)}.${rand(1,254)}`, manufacturer: a.manufacturer,
      risk: "Medium", managed: true, dept: "IT Operations",
      tags: ["network", connector.id, "auto-discovered"],
      antivirus: "N/A", agentVersion: "N/A", lastSeen: ISO(),
      exposureScore: rand(20,60), vulnCount: rand(0,3), critVulns: 0,
      environment: "Production", dataSensitivity: "Internal",
    });
  }
  return { risks: crit.length > 0 ? 1 : 0, findings: selected.length, assets: netAssets.length };
}

// ── SAAS / SSPM ───────────────────────────────────────────────────────────
async function ingestSaas(tenantId: number, connector: ConnectorDef): Promise<{ controls:number; findings:number }> {
  const SAAS_FINDINGS = [
    { title:`${connector.name} admin accounts without MFA (${rand(1,8)} users)`, sev:"High" },
    { title:`${connector.name} OAuth app with excessive scopes (${rand(5,30)} apps)`, sev:"Medium" },
    { title:`${connector.name} external sharing enabled on sensitive data`, sev:"High" },
    { title:`${connector.name} inactive users with active licenses (${rand(10,50)} accounts)`, sev:"Low" },
    { title:`${connector.name} audit logging not enabled for ${rand(1,5)} workspaces`, sev:"Medium" },
  ];
  const selected = SAAS_FINDINGS.slice(0, rand(2,4));
  await Promise.all(selected.map(f =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("SSPM"), cloud: "SaaS",
      severity: f.sev, title: f.title,
      resource: `saas/${connector.id}/tenant`,
      status: "open",
    }).onConflictDoNothing()
  ));
  const o = OWN();
  await db.insert(controlsTable).values({
    tenantId, controlId: `CC6.6-${connector.id.toUpperCase().slice(0,4)}`,
    framework: "SOC 2 Type II", domain: "Logical Access",
    name: `${connector.name} — SaaS security configuration reviewed`,
    status: "in-review", owner: o.email, evidence: rand(1,5), dueDate: DUE(45),
  }).onConflictDoNothing();
  return { controls: 1, findings: selected.length };
}

// ── DATA / DSPM ────────────────────────────────────────────────────────────
async function ingestData(tenantId: number, connector: ConnectorDef): Promise<{ controls:number; findings:number }> {
  const DATA_FINDINGS = [
    { title:`Sensitive PII data in unclassified ${connector.name} table (${rand(1000,50000)} rows)`, sev:"High" },
    { title:`${connector.name} query with overly-broad access to production data`, sev:"Medium" },
    { title:`Data shared externally via ${connector.name} without approval`, sev:"High" },
    { title:`Column-level access control not enforced on ${rand(1,20)} objects`, sev:"Medium" },
  ];
  const selected = DATA_FINDINGS.slice(0, rand(2,3));
  await Promise.all(selected.map(f =>
    db.insert(findingsTable).values({
      tenantId, findingId: nextId("DSPM"), cloud: "Data",
      severity: f.sev, title: f.title, resource: `data/${connector.id}/warehouse`, status: "open",
    }).onConflictDoNothing()
  ));
  const o = OWN();
  await Promise.all([
    db.insert(controlsTable).values({
      tenantId, controlId: `A.18.1.3-${connector.id.toUpperCase().slice(0,4)}`,
      framework: "ISO 27001", domain: "Compliance",
      name: `${connector.name} — Data access classification & tagging`,
      status: "in-review", owner: o.email, evidence: rand(1,4), dueDate: DUE(60),
    }).onConflictDoNothing(),
    db.insert(controlsTable).values({
      tenantId, controlId: `Art.30-${connector.id.toUpperCase().slice(0,4)}`,
      framework: "GDPR", domain: "Data Processing",
      name: `${connector.name} — Records of processing activities`,
      status: "in-review", owner: o.email, evidence: rand(0,3), dueDate: DUE(30),
    }).onConflictDoNothing(),
  ]);
  return { controls: 2, findings: selected.length };
}

// ── HR & PEOPLE ────────────────────────────────────────────────────────────
async function ingestHr(tenantId: number, connector: ConnectorDef): Promise<{ controls:number }> {
  const o = OWN();
  const CTRLS = [
    { id:"A.7.1.1", fw:"ISO 27001", domain:"HR Security", name:`${connector.name} — Pre-employment screening documented` },
    { id:"A.7.3.1", fw:"ISO 27001", domain:"HR Security", name:`${connector.name} — Offboarding access revocation process` },
    { id:"CC6.2",   fw:"SOC 2 Type II", domain:"Logical Access", name:`${connector.name} — JML (Joiner/Mover/Leaver) provisioning workflow` },
  ];
  await Promise.all(CTRLS.map(c =>
    db.insert(controlsTable).values({
      tenantId, controlId: `${c.id}-HR`,
      framework: c.fw, domain: c.domain, name: c.name,
      status: pick(["implemented","in-review"]),
      owner: o.email, evidence: rand(2,8), dueDate: DUE(60),
    }).onConflictDoNothing()
  ));
  return { controls: CTRLS.length };
}

// ── Main ingest dispatcher ─────────────────────────────────────────────────
export async function ingestConnection(
  tenantId:  string,
  conn:      Connection,
  connector: ConnectorDef,
): Promise<PipelineEvent> {
  const tid = Number(tenantId);
  const t0 = Date.now();
  let risks=0, findings=0, controls=0, tickets=0, assets=0;
  const modules: string[] = [];
  const sample: string[] = [];
  let status: PipelineEvent["status"] = "success";

  try {
    const caps = new Set(connector.capabilities);
    const cat  = connector.category;

    if (cat === "Cloud" || caps.has("cspm")) {
      const r = await ingestCloud(tid, connector);
      risks += r.risks; findings += r.findings; assets += r.assets;
      modules.push("CSPM", "Asset Inventory", "Risk Register");
      sample.push(`${r.findings} CSPM findings ingested`);
    }
    if (cat === "Identity" || caps.has("sso") || caps.has("mfa") || caps.has("user-lifecycle")) {
      const r = await ingestIdentity(tid, connector);
      risks += r.risks; controls += r.controls;
      modules.push("Compliance", "Risk Register");
      sample.push(`${r.controls} compliance controls updated`);
    }
    if (cat === "EDR/XDR" || caps.has("edr") || caps.has("xdr")) {
      const r = await ingestEdr(tid, connector);
      risks += r.risks; findings += r.findings; assets += r.assets;
      modules.push("Endpoint Security", "Asset Inventory", "Risk Register");
      sample.push(`${r.findings} threat detections ingested`);
    }
    if (cat === "Vuln Mgmt" || caps.has("vulnerability-scan")) {
      const r = await ingestVuln(tid, connector);
      risks += r.risks; findings += r.findings;
      modules.push("Risk Register", "Vulnerability Management");
      sample.push(`${r.findings} vulnerability findings ingested`);
    }
    if (cat === "SIEM/SOAR" || caps.has("siem")) {
      const r = await ingestSiem(tid, connector);
      risks += r.risks; findings += r.findings;
      modules.push("Incident Response", "Risk Register");
      sample.push(`${r.findings} SIEM alerts ingested`);
    }
    if (cat === "ITSM" || caps.has("ticketing") || caps.has("itsm")) {
      const r = await ingestItsm(tid, connector);
      tickets += r.tickets;
      modules.push("Service Desk");
      sample.push(`${r.tickets} tickets synchronized`);
    }
    if (cat === "PAM" || caps.has("pam")) {
      const r = await ingestPam(tid, connector);
      risks += r.risks; controls += r.controls;
      modules.push("Privileged Access", "Compliance");
      sample.push(`${r.controls} PAM controls verified`);
    }
    if (cat === "DevSecOps" || caps.has("sast") || caps.has("code-scanning") || caps.has("secret-scanning")) {
      const r = await ingestDevsecops(tid, connector);
      risks += r.risks; findings += r.findings;
      modules.push("Application Security", "Risk Register");
      sample.push(`${r.findings} code findings ingested`);
    }
    if (cat === "Network" || caps.has("ngfw") || caps.has("ndr")) {
      const r = await ingestNetwork(tid, connector);
      risks += r.risks; findings += r.findings; assets += r.assets;
      modules.push("Network Security", "Asset Inventory");
      sample.push(`${r.findings} network events ingested`);
    }
    if (cat === "SaaS" || caps.has("sspm")) {
      const r = await ingestSaas(tid, connector);
      controls += r.controls; findings += r.findings;
      modules.push("SSPM", "Compliance");
      sample.push(`${r.findings} SaaS misconfigs detected`);
    }
    if (cat === "Data" || caps.has("dspm")) {
      const r = await ingestData(tid, connector);
      controls += r.controls; findings += r.findings;
      modules.push("DSPM", "Compliance");
      sample.push(`${r.findings} data exposure findings`);
    }
    if (cat === "HR & People" || caps.has("hr-sync") || caps.has("joiner-mover-leaver")) {
      const r = await ingestHr(tid, connector);
      controls += r.controls;
      modules.push("HR Security", "Compliance");
      sample.push(`${r.controls} HR controls updated`);
    }

    if (risks + findings + controls + tickets + assets === 0) status = "partial";

  } catch (err) {
    console.error("[Pipeline] Ingestion error:", err);
    status = "failed";
  }

  const event: PipelineEvent = {
    id: randomUUID(), connectionId: conn.id,
    connectorId: connector.id, connectorName: connector.name,
    tenantId, ts: ISO(),
    duration: Date.now() - t0,
    status, ingested: { risks, findings, controls, tickets, assets },
    modules: [...new Set(modules)],
    sample: sample.slice(0, 4),
  };
  log(tenantId).unshift(event);
  if (log(tenantId).length > 200) log(tenantId).splice(200);
  return event;
}

export function getPipelineLog(tenantId: string): PipelineEvent[] {
  return log(tenantId);
}

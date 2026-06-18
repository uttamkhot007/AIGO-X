import { db } from "../lib/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  risksTable, findingsTable, complianceMaturityTable, complianceGapsTable,
  grcPoliciesTable, policyAttestationsTable, riskAppetiteTable, riskTreatmentsTable,
  serviceChangesTable, serviceProblemsTable, slaRecordsTable, cmdbItemsTable,
  cloudFindingsTable, cloudResourcesTable,
  iotDevicesTable, otProtocolsTable, otDiscoveryTable,
  dsarsTable, dpiasTable,
  dataFindingsDspmTable, dataStoresTable,
} from "@workspace/db";

export type CopilotModule =
  | "dashboard" | "govops" | "riskops" | "complianceops"
  | "serviceops" | "secops" | "assetops" | "cloudops"
  | "privacyops" | "dataops" | "analyticsops" | "ai"
  | "peopleops" | "workflows";

export interface CopilotContext {
  insights: string[];
  systemContext: string;
}

function safeJson(s: string): unknown[] {
  try { return JSON.parse(s) as unknown[]; } catch { return []; }
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export async function buildCopilotContext(tenantId: number, module: CopilotModule): Promise<CopilotContext> {
  switch (module) {
    case "riskops":       return buildRiskOpsCtx(tenantId);
    case "complianceops": return buildComplianceCtx(tenantId);
    case "secops":        return buildSecOpsCtx(tenantId);
    case "assetops":      return buildAssetOpsCtx(tenantId);
    case "serviceops":    return buildServiceOpsCtx(tenantId);
    case "cloudops":      return buildCloudOpsCtx(tenantId);
    case "govops":        return buildGovOpsCtx(tenantId);
    case "privacyops":    return buildPrivacyOpsCtx(tenantId);
    case "dataops":       return buildDataOpsCtx(tenantId);
    default:              return buildDashboardCtx(tenantId);
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
function sortBySev<T extends { severity: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0));
}

async function buildDashboardCtx(tenantId: number): Promise<CopilotContext> {
  const [risks, allFindings, maturity, gaps, appetite] = await Promise.all([
    db.select().from(risksTable)
      .where(and(eq(risksTable.tenantId, tenantId), inArray(risksTable.status, ["open", "in-progress"])))
      .orderBy(desc(risksTable.score)).limit(20),
    db.select().from(findingsTable)
      .where(and(eq(findingsTable.tenantId, tenantId), eq(findingsTable.status, "open")))
      .limit(60),
    db.select().from(complianceMaturityTable).where(eq(complianceMaturityTable.tenantId, tenantId)),
    db.select().from(complianceGapsTable).where(eq(complianceGapsTable.tenantId, tenantId)),
    db.select().from(riskAppetiteTable).where(eq(riskAppetiteTable.tenantId, tenantId)),
  ]);

  const findings       = sortBySev(allFindings);
  const criticalRisks  = risks.filter(r => r.severity === "Critical").length;
  const highRisks      = risks.filter(r => r.severity === "High").length;
  const criticalFinds  = findings.filter(f => f.severity === "Critical").length;
  const avgCompliance  = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : 0;
  const avgMaturity    = maturity.length > 0
    ? (maturity.reduce((s, m) => s + m.score, 0) / maturity.length).toFixed(1)
    : "N/A";
  const breachedDomains = appetite.filter(a => a.breached).length;

  const insights = [
    `${criticalRisks} critical + ${highRisks} high risks active — ${breachedDomains} risk appetite ${breachedDomains === 1 ? "threshold" : "thresholds"} breached across the portfolio.`,
    `${criticalFinds} critical security findings open — ${findings.length} total unresolved across all modules.`,
    `Average compliance coverage ${avgCompliance}% across ${gaps.length} frameworks. Maturity average: ${avgMaturity}/5.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Executive Dashboard (Tenant ${tenantId}) ===

RISK POSTURE:
Active open/in-progress risks: ${risks.length}
  Critical: ${criticalRisks} | High: ${highRisks} | Medium: ${risks.filter(r => r.severity === "Medium").length} | Low: ${risks.filter(r => r.severity === "Low").length}
Top risks: ${risks.slice(0, 5).map(r => `${r.name} (${r.severity}, score:${r.score}, owner:${r.owner || "unassigned"})`).join("; ")}
Risk appetite: ${appetite.length} domains | Breached: ${breachedDomains}
${appetite.filter(a => a.breached).map(a => `  - ${a.domain}: current=${a.current} vs threshold=${a.threshold}`).join("\n")}

SECURITY FINDINGS:
Open findings: ${findings.length}
  Critical: ${criticalFinds} | High: ${findings.filter(f => f.severity === "High").length} | Medium: ${findings.filter(f => f.severity === "Medium").length}
Top: ${findings.slice(0, 3).map(f => `${f.title} (${f.severity})`).join("; ")}

COMPLIANCE STATUS:
${gaps.map(g => `  ${g.framework}: ${g.pct}% (${g.implemented}/${g.total} controls, ${g.notStarted ?? 0} not started)`).join("\n")}

MATURITY SCORES:
${maturity.map(m => `  ${m.domain}: ${m.score}/5 (target ${m.target}) ${m.score < m.target ? "below target" : "on target"}`).join("\n")}
`.trim();

  return { insights, systemContext };
}

// ── RiskOps ────────────────────────────────────────────────────────────────────

async function buildRiskOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [risks, appetite, treatments] = await Promise.all([
    db.select().from(risksTable)
      .where(eq(risksTable.tenantId, tenantId))
      .orderBy(desc(risksTable.score)).limit(30),
    db.select().from(riskAppetiteTable).where(eq(riskAppetiteTable.tenantId, tenantId)),
    db.select().from(riskTreatmentsTable).where(eq(riskTreatmentsTable.tenantId, tenantId)).limit(30),
  ]);

  const openRisks     = risks.filter(r => r.status === "open" || r.status === "in-progress");
  const criticalRisks = openRisks.filter(r => r.severity === "Critical");
  const highRisks     = openRisks.filter(r => r.severity === "High");
  const unowned       = openRisks.filter(r => !r.owner || r.owner.trim() === "").length;
  const breachedApp   = appetite.filter(a => a.breached);
  const overdueTx     = treatments.filter(t => t.status === "overdue");

  const topCrit = criticalRisks[0];

  const insights = [
    `${criticalRisks.length} critical + ${highRisks.length} high risks open${topCrit ? ` — top: "${topCrit.name}" (score ${topCrit.score}, owner: ${topCrit.owner || "unassigned"})` : ""}.`,
    `${breachedApp.length} risk appetite ${breachedApp.length === 1 ? "threshold" : "thresholds"} breached: ${breachedApp.map(a => a.domain).join(", ") || "none"}.`,
    `${overdueTx.length} risk treatments overdue — ${unowned} open risks have no assigned owner.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Risk Operations (Tenant ${tenantId}) ===

OPEN RISKS: ${openRisks.length} (of ${risks.length} total)
  Critical: ${criticalRisks.length} | High: ${highRisks.length} | Medium: ${openRisks.filter(r => r.severity === "Medium").length} | Low: ${openRisks.filter(r => r.severity === "Low").length}
  Unowned: ${unowned}

TOP CRITICAL RISKS (score-ranked):
${criticalRisks.slice(0, 6).map(r => `  ${r.riskId}: ${r.name}
    Severity: ${r.severity} | Score: ${r.score} | Category: ${r.category}
    Owner: ${r.owner || "Unassigned"} | Status: ${r.status}`).join("\n")}

HIGH RISKS (top 4):
${highRisks.slice(0, 4).map(r => `  ${r.riskId}: ${r.name} (score:${r.score}, category:${r.category})`).join("\n")}

RISK APPETITE DOMAINS: ${appetite.length}
${appetite.map(a => `  ${a.domain}: appetite=${a.appetite}, current=${a.current}, threshold=${a.threshold}, BREACHED=${a.breached}`).join("\n")}

RISK TREATMENTS: ${treatments.length} total
  Overdue: ${overdueTx.length} | In-progress: ${treatments.filter(t => t.status === "in-progress").length} | Planned: ${treatments.filter(t => t.status === "planned").length} | Completed: ${treatments.filter(t => t.status === "completed").length}

RISK CATEGORIES (open):
${[...new Set(openRisks.map(r => r.category))].map(cat => `  ${cat}: ${openRisks.filter(r => r.category === cat).length}`).join("\n")}
`.trim();

  return { insights, systemContext };
}

// ── ComplianceOps ──────────────────────────────────────────────────────────────

async function buildComplianceCtx(tenantId: number): Promise<CopilotContext> {
  const [maturity, gaps] = await Promise.all([
    db.select().from(complianceMaturityTable).where(eq(complianceMaturityTable.tenantId, tenantId)),
    db.select().from(complianceGapsTable).where(eq(complianceGapsTable.tenantId, tenantId)),
  ]);

  const belowTarget  = maturity.filter(m => m.score < m.target).sort((a, b) => (a.score - a.target) - (b.score - b.target));
  const notStarted   = gaps.reduce((s, g) => s + (g.notStarted ?? 0), 0);
  const avgCompliance = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : 0;
  const poorFrameworks = [...gaps].sort((a, b) => a.pct - b.pct);

  const insights = [
    `${belowTarget.length} maturity domains below target — lowest: ${belowTarget[0]?.domain ?? "none"} at ${belowTarget[0]?.score?.toFixed(1) ?? 0}/5 (target: ${belowTarget[0]?.target ?? 0}).`,
    `${poorFrameworks[0]?.framework ?? "No frameworks"} needs most attention at ${poorFrameworks[0]?.pct ?? 0}% coverage — ${notStarted} controls not yet started across all frameworks.`,
    `Average compliance coverage: ${avgCompliance}% across ${gaps.length} active frameworks. ${maturity.filter(m => m.score >= m.target).length} domains on or above maturity target.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Compliance Operations (Tenant ${tenantId}) ===

FRAMEWORK COVERAGE:
${gaps.map(g => `  ${g.framework}: ${g.pct}% | Implemented: ${g.implemented}/${g.total} | Partial: ${g.partial ?? 0} | Not started: ${g.notStarted ?? 0}`).join("\n")}
  Average: ${avgCompliance}%

MATURITY SCORES vs TARGETS:
${maturity.map(m => {
  const gap = m.target - m.score;
  return `  ${m.domain}: ${m.score}/5 (target: ${m.target}) — ${gap > 0 ? `BELOW by ${gap.toFixed(1)}` : "ON/ABOVE TARGET"}`;
}).join("\n")}

SUMMARY:
  Frameworks tracked: ${gaps.length}
  Domains below maturity target: ${belowTarget.length}/${maturity.length}
  Total controls not started: ${notStarted}
  Total implemented: ${gaps.reduce((s, g) => s + g.implemented, 0)}
  Total controls: ${gaps.reduce((s, g) => s + g.total, 0)}
`.trim();

  return { insights, systemContext };
}

// ── SecOps ─────────────────────────────────────────────────────────────────────

async function buildSecOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [allFindings, cloudFindings] = await Promise.all([
    db.select().from(findingsTable)
      .where(eq(findingsTable.tenantId, tenantId))
      .limit(60),
    db.select().from(cloudFindingsTable)
      .where(and(eq(cloudFindingsTable.tenantId, tenantId), eq(cloudFindingsTable.status, "open")))
      .limit(30),
  ]);

  const openFinds    = sortBySev(allFindings.filter(f => f.status === "open"));
  const critFinds    = openFinds.filter(f => f.severity === "Critical");
  const highFinds    = openFinds.filter(f => f.severity === "High");
  const critCloud    = sortBySev(cloudFindings).filter(f => f.severity === "Critical");
  const categories   = [...new Set(openFinds.map(f => (f as any).category).filter(Boolean))];
  const providers    = [...new Set(cloudFindings.map(f => f.provider).filter(Boolean))];

  const top = critFinds[0];

  const insights = [
    `${critFinds.length} critical security findings open${top ? ` — top: "${top.title}" on ${top.resource} (CVSS ${(top as any).cvss ?? "N/A"})` : ""}.`,
    `${highFinds.length} high-severity findings open${categories.length ? ` across categories: ${categories.slice(0, 4).join(", ")}` : ""}.`,
    `${critCloud.length} critical cloud findings open across ${providers.join(", ") || "N/A"} — ${cloudFindings.length} total cloud issues.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Security Operations (Tenant ${tenantId}) ===

SECURITY FINDINGS: ${allFindings.length} total | ${openFinds.length} open
  Critical: ${critFinds.length} | High: ${highFinds.length} | Medium: ${openFinds.filter(f => f.severity === "Medium").length} | Low: ${openFinds.filter(f => f.severity === "Low").length}

TOP CRITICAL FINDINGS:
${critFinds.slice(0, 6).map(f => `  ${f.findingId}: ${f.title}
    Resource: ${f.resource} | CVSS: ${(f as any).cvss ?? "N/A"} | Category: ${(f as any).category}`).join("\n")}

HIGH FINDINGS (top 4):
${highFinds.slice(0, 4).map(f => `  ${f.findingId}: ${f.title} (${(f as any).category}, CVSS:${(f as any).cvss ?? "N/A"})`).join("\n")}

FINDING CATEGORIES: ${categories.join(", ")}

CLOUD SECURITY FINDINGS: ${cloudFindings.length} open
  Critical: ${critCloud.length} | High: ${cloudFindings.filter(f => f.severity === "High").length}
  By provider: ${providers.map(p => `${p}: ${cloudFindings.filter(f => f.provider === p).length}`).join(", ")}
  Top cloud issues: ${critCloud.slice(0, 3).map(f => `${f.title} (${f.provider})`).join("; ")}
`.trim();

  return { insights, systemContext };
}

// ── AssetOps ───────────────────────────────────────────────────────────────────

async function buildAssetOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [iotDevices, otProtocols, cmdbItems, otDiscovery] = await Promise.all([
    db.select().from(iotDevicesTable).where(eq(iotDevicesTable.tenantId, tenantId)),
    db.select().from(otProtocolsTable).where(eq(otProtocolsTable.tenantId, tenantId)),
    db.select().from(cmdbItemsTable).where(eq(cmdbItemsTable.tenantId, tenantId)),
    db.select().from(otDiscoveryTable).where(eq(otDiscoveryTable.tenantId, tenantId)),
  ]);

  const critIot         = iotDevices.filter(d => d.risk === "Critical").length;
  const highIot         = iotDevices.filter(d => d.risk === "High").length;
  const iotWithCves     = iotDevices.filter(d => safeJson(d.cves).length > 0).length;
  const highExpProto    = otProtocols.filter(p => p.exposure === "High").length;
  const unencryptedProto = otProtocols.filter(p => !p.encrypted).length;
  const outdatedCIs     = cmdbItems.filter(c => c.patch === "Outdated" || c.patch === "Critical").length;
  const vulnCIs         = cmdbItems.filter(c => c.vulnerabilities > 0).length;
  const criticalCIs     = cmdbItems.filter(c => c.criticality === "Critical").length;
  const totalVulns      = cmdbItems.reduce((s, c) => s + c.vulnerabilities, 0);

  const insights = [
    `${critIot + highIot} IoT/OT devices at Critical or High risk — ${iotWithCves} have known CVEs needing immediate patching.`,
    `${highExpProto} OT protocols with High exposure; ${unencryptedProto} of ${otProtocols.length} run unencrypted. Segmentation review recommended.`,
    `${outdatedCIs} CIs with outdated patches — ${vulnCIs} CIs carry ${totalVulns} active vulnerabilities across ${criticalCIs} critical-tier services.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Asset Operations (Tenant ${tenantId}) ===

IOT/OT DEVICES: ${iotDevices.length} total
  Risk: Critical=${critIot} | High=${highIot} | Medium=${iotDevices.filter(d => d.risk === "Medium").length} | Low=${iotDevices.filter(d => d.risk === "Low").length}
  Devices with CVEs: ${iotWithCves}
  Device types: ${[...new Set(iotDevices.map(d => d.type))].join(", ")}
  Critical/High devices: ${iotDevices.filter(d => d.risk === "Critical" || d.risk === "High").slice(0, 5).map(d => `${d.name} (${d.type}, ${d.segment})`).join("; ")}

OT PROTOCOLS: ${otProtocols.length} tracked
${otProtocols.map(p => `  ${p.name} (port ${p.port}): exposure=${p.exposure}, encrypted=${p.encrypted}, devices=${p.devices}, action=${p.action}`).join("\n")}

OT DISCOVERY: ${otDiscovery.length} discovered assets (${otDiscovery.filter(d => d.confidence === "High").length} high-confidence)

CMDB ITEMS: ${cmdbItems.length} CIs
  Criticality: Critical=${criticalCIs} | High=${cmdbItems.filter(c => c.criticality === "High").length} | Medium=${cmdbItems.filter(c => c.criticality === "Medium").length}
  Patch status: Outdated/Critical=${outdatedCIs} | Current=${cmdbItems.filter(c => c.patch === "Current").length}
  Vulnerabilities: ${vulnCIs} CIs with open vulns | Total vuln count: ${totalVulns}
  Non-operational: ${cmdbItems.filter(c => c.status !== "operational").length}
`.trim();

  return { insights, systemContext };
}

// ── ServiceOps ─────────────────────────────────────────────────────────────────

async function buildServiceOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [changes, problems, slaRecords, cmdbItems] = await Promise.all([
    db.select().from(serviceChangesTable).where(eq(serviceChangesTable.tenantId, tenantId)).limit(30),
    db.select().from(serviceProblemsTable).where(eq(serviceProblemsTable.tenantId, tenantId)).limit(20),
    db.select().from(slaRecordsTable).where(eq(slaRecordsTable.tenantId, tenantId)),
    db.select().from(cmdbItemsTable).where(eq(cmdbItemsTable.tenantId, tenantId)).limit(15),
  ]);

  const pendingChanges = changes.filter(c => c.status === "pending" || c.status === "in-review");
  const highRiskChgs   = changes.filter(c => c.risk === "High" || c.risk === "Critical");
  const openProblems   = problems.filter(p => p.status !== "resolved");
  const p1Problems     = openProblems.filter(p => p.priority === "P1");
  const p2Problems     = openProblems.filter(p => p.priority === "P2");
  const breachedSLAs   = slaRecords.filter(s => s.status === "breached");
  const atRiskSLAs     = slaRecords.filter(s => s.status === "at-risk");
  const totalIncidents = problems.reduce((s, p) => s + p.incidents, 0);

  const insights = [
    `${pendingChanges.length} service changes pending approval — ${highRiskChgs.length} rated High/Critical risk requiring CAB review.`,
    `${openProblems.length} open problems (${p1Problems.length} P1, ${p2Problems.length} P2) — ${totalIncidents} linked incidents across all active problems.`,
    `${breachedSLAs.length} SLA ${breachedSLAs.length === 1 ? "breach" : "breaches"} active, ${atRiskSLAs.length} at-risk — ${cmdbItems.filter(c => c.status !== "operational").length} CIs non-operational.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Service Operations (Tenant ${tenantId}) ===

SERVICE CHANGES: ${changes.length} total
  Status: pending=${pendingChanges.filter(c => c.status === "pending").length} | in-review=${pendingChanges.filter(c => c.status === "in-review").length} | approved=${changes.filter(c => c.status === "approved").length} | deployed=${changes.filter(c => c.status === "deployed").length} | completed=${changes.filter(c => c.status === "completed").length}
  Risk: High/Critical=${highRiskChgs.length} | Medium=${changes.filter(c => c.risk === "Medium").length} | Low=${changes.filter(c => c.risk === "Low").length}
  Recent changes: ${changes.slice(0, 5).map(c => `${c.changeId}: ${c.title} (status=${c.status}, risk=${c.risk})`).join("; ")}

SERVICE PROBLEMS: ${problems.length} total | ${openProblems.length} open
  P1: ${p1Problems.length} | P2: ${p2Problems.length} | P3: ${openProblems.filter(p => p.priority === "P3").length}
  Total linked incidents: ${totalIncidents}
  Active problems: ${openProblems.slice(0, 4).map(p => `${p.problemId}: ${p.title} (${p.priority}, ${p.incidents} incidents)`).join("; ")}

SLA STATUS: ${slaRecords.length} services monitored
  Breached: ${breachedSLAs.length} (${breachedSLAs.map(s => s.service).join(", ") || "none"})
  At-risk: ${atRiskSLAs.length} (${atRiskSLAs.map(s => s.service).join(", ") || "none"})
  Met: ${slaRecords.filter(s => s.status === "met").length}

CMDB: ${cmdbItems.length} CIs | Non-operational: ${cmdbItems.filter(c => c.status !== "operational").length}
  Critical-tier: ${cmdbItems.filter(c => c.criticality === "Critical").length}
`.trim();

  return { insights, systemContext };
}

// ── CloudOps ───────────────────────────────────────────────────────────────────

async function buildCloudOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [cloudFindings, resources] = await Promise.all([
    db.select().from(cloudFindingsTable).where(eq(cloudFindingsTable.tenantId, tenantId)).limit(60),
    db.select().from(cloudResourcesTable).where(eq(cloudResourcesTable.tenantId, tenantId)).limit(40),
  ]);

  const openFindings  = cloudFindings.filter(f => f.status === "open");
  const critFindings  = openFindings.filter(f => f.severity === "Critical");
  const highFindings  = openFindings.filter(f => f.severity === "High");
  const providers     = [...new Set(openFindings.map(f => f.provider))];
  const highRiskRes   = resources.filter(r => r.risk === "Critical" || r.risk === "High");
  const rules         = [...new Set(openFindings.map(f => f.rule))].slice(0, 5);

  const insights = [
    `${critFindings.length} critical cloud findings open — ${openFindings.length} total across ${providers.join(", ")} environments.`,
    `Top misconfiguration categories: ${rules.slice(0, 3).join(", ")}. ${highFindings.length} high-severity findings pending remediation.`,
    `${highRiskRes.length} cloud resources at Critical/High risk — ${resources.length} total resources catalogued across all providers.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Cloud Operations (Tenant ${tenantId}) ===

CLOUD FINDINGS: ${cloudFindings.length} total | ${openFindings.length} open
  Critical: ${critFindings.length} | High: ${highFindings.length} | Medium: ${openFindings.filter(f => f.severity === "Medium").length} | Low: ${openFindings.filter(f => f.severity === "Low").length}
  By provider: ${providers.map(p => `${p}: ${openFindings.filter(f => f.provider === p).length}`).join(", ")}
  Top rules/categories: ${rules.join(", ")}

TOP CRITICAL FINDINGS:
${critFindings.slice(0, 5).map(f => `  ${f.findingId}: ${f.title}
    Provider: ${f.provider} | Rule: ${f.rule} | Resource: ${f.resourceId}`).join("\n")}

CLOUD RESOURCES: ${resources.length} total
  By provider: AWS=${resources.filter(r => r.provider === "AWS").length} | Azure=${resources.filter(r => r.provider === "Azure").length} | GCP=${resources.filter(r => r.provider === "GCP").length}
  Risk: Critical/High=${highRiskRes.length} | Medium=${resources.filter(r => r.risk === "Medium").length} | Low=${resources.filter(r => r.risk === "Low").length}
  Avg compliance pct: ${resources.length > 0 ? (resources.reduce((s, r) => s + r.compliancePct, 0) / resources.length).toFixed(1) : 0}%
`.trim();

  return { insights, systemContext };
}

// ── GovOps ─────────────────────────────────────────────────────────────────────

async function buildGovOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [policies, attestations] = await Promise.all([
    db.select().from(grcPoliciesTable).where(eq(grcPoliciesTable.tenantId, tenantId)).limit(60),
    db.select().from(policyAttestationsTable).where(eq(policyAttestationsTable.tenantId, tenantId)).limit(200),
  ]);

  const active        = policies.filter(p => p.status === "active" || p.status === "approved").length;
  const drafts        = policies.filter(p => p.status === "draft").length;
  const pending       = attestations.filter(a => a.status === "pending").length;
  const overdue       = attestations.filter(a => a.status === "overdue").length;
  const completed     = attestations.filter(a => a.status === "completed").length;
  const depts         = [...new Set(attestations.map(a => a.dept))];
  const deptStats     = depts.map(dept => {
    const all  = attestations.filter(a => a.dept === dept);
    const done = all.filter(a => a.status === "completed").length;
    return { dept, pct: pct(done, all.length), total: all.length, done };
  }).sort((a, b) => a.pct - b.pct);

  const lowest = deptStats[0];

  const insights = [
    `${pending} policy attestations pending — ${overdue} overdue across ${depts.length} departments. SLA breach imminent.`,
    `Lowest attestation compliance: ${lowest?.dept ?? "N/A"} at ${lowest?.pct ?? 0}% (${lowest?.done ?? 0}/${lowest?.total ?? 0} completed).`,
    `${active} active policies in force — ${drafts} drafts awaiting approval. ${completed}/${attestations.length} total attestations completed.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Governance Operations (Tenant ${tenantId}) ===

POLICIES: ${policies.length} total
  Active/Approved: ${active} | Draft: ${drafts} | Under Review: ${policies.filter(p => p.status === "review").length}
  Policy types: ${[...new Set(policies.map(p => p.type))].join(", ")}

POLICY ATTESTATIONS: ${attestations.length} total
  Pending: ${pending} | Completed: ${completed} | Overdue: ${overdue}
  Departments: ${depts.length}

DEPARTMENT ATTESTATION COMPLETION (lowest first):
${deptStats.map(d => `  ${d.dept}: ${d.pct}% (${d.done}/${d.total})`).join("\n")}
`.trim();

  return { insights, systemContext };
}

// ── PrivacyOps ─────────────────────────────────────────────────────────────────

async function buildPrivacyOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [dsars, dpias] = await Promise.all([
    db.select().from(dsarsTable).where(eq(dsarsTable.tenantId, tenantId)).limit(30),
    db.select().from(dpiasTable).where(eq(dpiasTable.tenantId, tenantId)).limit(20),
  ]);

  const activeDsars   = dsars.filter(d => d.status === "in-progress" || d.status === "pending").length;
  const overdueDsars  = dsars.filter(d => d.status === "overdue").length;
  const pendingDpias  = dpias.filter(d => d.status === "pending" || d.status === "in-progress").length;
  const overdueDpias  = dpias.filter(d => d.status === "overdue").length;
  const completedDsars = dsars.filter(d => d.status === "completed").length;
  const approvedDpias  = dpias.filter(d => d.status === "approved").length;

  const insights = [
    `${activeDsars} DSARs active — ${overdueDsars} overdue (GDPR 30-day response deadline at risk).`,
    `${pendingDpias} DPIAs pending review — ${overdueDpias} overdue for AI/personal data processing activities.`,
    `${completedDsars} DSARs completed. ${approvedDpias}/${dpias.length} DPIAs approved and compliant.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Privacy Operations (Tenant ${tenantId}) ===

DSARS (Data Subject Access Requests): ${dsars.length} total
  Active/Pending: ${activeDsars} | Overdue: ${overdueDsars} | Completed: ${completedDsars}
  Compliance note: GDPR Art.12 requires response within 30 days

DPIAS (Data Protection Impact Assessments): ${dpias.length} total
  Pending/In-progress: ${pendingDpias} | Overdue: ${overdueDpias} | Approved: ${approvedDpias}
  GDPR Art.35 required for high-risk personal data processing
`.trim();

  return { insights, systemContext };
}

// ── DataOps ────────────────────────────────────────────────────────────────────

async function buildDataOpsCtx(tenantId: number): Promise<CopilotContext> {
  const [dataFindings, dataStores] = await Promise.all([
    db.select().from(dataFindingsDspmTable).where(eq(dataFindingsDspmTable.tenantId, tenantId)).limit(30),
    db.select().from(dataStoresTable).where(eq(dataStoresTable.tenantId, tenantId)).limit(30),
  ]);

  const openFindings  = dataFindings.filter(f => f.status === "open");
  const critFindings  = openFindings.filter(f => f.severity === "Critical");
  const highFindings  = openFindings.filter(f => f.severity === "High");
  const unclassified  = dataStores.filter(s => s.classification === "Unclassified" || s.classification === "Internal").length;
  const unencrypted   = dataStores.filter(s => s.encryptionStatus === "unencrypted").length;
  const piiStores     = dataStores.filter(s => s.piiFields > 0).length;
  const totalPii      = dataStores.reduce((s, st) => s + st.piiFields, 0);

  const insights = [
    `${critFindings.length} critical data findings open — ${openFindings.length} total DSPM findings require classification review.`,
    `${unencrypted} data stores unencrypted — ${piiStores} stores contain ${totalPii} PII fields needing protection review.`,
    `${unclassified} data stores classified as Internal/Unclassified — ${dataStores.length} total stores across ${[...new Set(dataStores.map(s => s.platform))].join(", ")}.`,
  ];

  const systemContext = `
=== LIVE PLATFORM DATA — Data Operations (Tenant ${tenantId}) ===

DSPM FINDINGS: ${dataFindings.length} total | ${openFindings.length} open
  Critical: ${critFindings.length} | High: ${highFindings.length} | Medium: ${openFindings.filter(f => f.severity === "Medium").length}
  Finding types: ${[...new Set(dataFindings.map(f => f.type))].join(", ")}

DATA STORES: ${dataStores.length} total
  Platforms: ${[...new Set(dataStores.map(s => s.platform))].join(", ")}
  Encryption: unencrypted=${unencrypted} | encrypted=${dataStores.filter(s => s.encryptionStatus === "encrypted").length} | partial=${dataStores.filter(s => s.encryptionStatus === "partial").length}
  Classification: Unclassified=${dataStores.filter(s => s.classification === "Unclassified").length} | Internal=${dataStores.filter(s => s.classification === "Internal").length} | Confidential=${dataStores.filter(s => s.classification === "Confidential").length}
  PII exposure: ${piiStores} stores | ${totalPii} total PII fields
  High-risk stores: ${dataStores.filter(s => s.riskScore === "High" || s.riskScore === "Critical").length}
`.trim();

  return { insights, systemContext };
}

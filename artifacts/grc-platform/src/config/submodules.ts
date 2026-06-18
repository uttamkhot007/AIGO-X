/** Sub-module definitions for granular licensing within each parent module.
 *  Keys use dot-notation: "<parent-prefix>.<feature>".
 *  Stored in the same `modules` JSONB column — no schema change needed.
 */
export interface SubmoduleDef {
  key: string;
  label: string;
  description?: string;
}

export const SUBMODULE_MAP: Record<string, SubmoduleDef[]> = {
  govops: [
    { key: "gov.policies",    label: "Policies",    description: "Policy library, drafting & approval workflows" },
    { key: "gov.processes",   label: "Processes",   description: "Process documentation & version control" },
    { key: "gov.procedures",  label: "Procedures",  description: "Step-by-step procedure management" },
    { key: "gov.controls",    label: "Controls",    description: "Control catalogue & ownership mapping" },
    { key: "gov.exceptions",  label: "Exceptions",  description: "Policy exception requests & tracking" },
    { key: "gov.training",    label: "Training",    description: "Awareness training & completion tracking" },
  ],
  riskops: [
    { key: "risk.register",    label: "Risk Register",   description: "Centralised risk inventory" },
    { key: "risk.assessment",  label: "Assessments",     description: "Risk scoring & likelihood/impact analysis" },
    { key: "risk.treatment",   label: "Treatment Plans", description: "Mitigation, acceptance & transfer plans" },
    { key: "risk.monitoring",  label: "Monitoring",      description: "Continuous risk KRI tracking" },
    { key: "risk.scenarios",   label: "Scenarios",       description: "Scenario modelling & simulation" },
  ],
  complyops: [
    { key: "comply.frameworks",   label: "Frameworks",    description: "Framework library & mapping" },
    { key: "comply.audits",       label: "Audits",        description: "Internal & external audit management" },
    { key: "comply.evidence",     label: "Evidence",      description: "Evidence collection & auto-gathering" },
    { key: "comply.gap_analysis", label: "Gap Analysis",  description: "Framework gap assessment & remediation" },
    { key: "comply.reports",      label: "Reports",       description: "Compliance status reporting & exports" },
  ],
  secops: [
    { key: "sec.cspm",        label: "CSPM",        description: "Cloud Security Posture Management" },
    { key: "sec.sspm",        label: "SSPM",        description: "SaaS Security Posture Management" },
    { key: "sec.ciem",        label: "CIEM",        description: "Cloud Identity & Entitlement Management" },
    { key: "sec.cnspm",       label: "CNSPM",       description: "Cloud Native Security Posture Management (containers & K8s)" },
    { key: "sec.asm",         label: "ASM",         description: "Attack Surface Management" },
    { key: "sec.threatintel", label: "Threat Intel",description: "Threat intelligence feeds & alerts" },
    { key: "sec.cwpp",        label: "CWPP",        description: "Cloud Workload Protection Platform" },
    { key: "sec.scpm",        label: "Secrets/Code",description: "Secrets & Code Posture Management" },
    { key: "sec.aispm",       label: "AI-SPM",      description: "AI Security Posture Management" },
  ],
  aisecops: [
    { key: "aisec.models",     label: "Model Inventory",  description: "AI/ML model registry, risk scoring & approval" },
    { key: "aisec.threats",    label: "Threat Detection", description: "AI-specific threat detection & incident response" },
    { key: "aisec.access",     label: "AI Access",        description: "GenAI app discovery, shadow AI & DLP governance" },
    { key: "aisec.posture",    label: "AI Posture",       description: "Continuous AI security posture & vulnerability tracking" },
    { key: "aisec.compliance", label: "AI Compliance",    description: "EU AI Act, NIST AI RMF, ISO 42001 & OWASP LLM coverage" },
  ],
  cloudops: [
    { key: "cloud.inventory", label: "Inventory",         description: "Multi-cloud asset discovery" },
    { key: "cloud.posture",   label: "Posture",           description: "Cloud configuration assessment" },
    { key: "cloud.drift",     label: "Drift Detection",   description: "Configuration drift alerting" },
    { key: "cloud.cost",      label: "Cost Optimisation", description: "Cloud cost & waste analysis" },
  ],
  privacyops: [
    { key: "priv.dpia",      label: "DPIA",          description: "Data Protection Impact Assessments" },
    { key: "priv.consent",   label: "Consent Mgmt",  description: "Consent records & preference centre" },
    { key: "priv.dsr",       label: "DSR Requests",  description: "Data Subject Request automation" },
    { key: "priv.incidents", label: "Incidents",     description: "Privacy breach management & notifications" },
    { key: "priv.vendors",   label: "Vendor Privacy",description: "Vendor DPA & privacy assessments" },
  ],
  dataops: [
    { key: "data.dspm",       label: "DSPM",          description: "Data Security Posture Management" },
    { key: "data.dlp",        label: "DLP",           description: "Data Loss Prevention rules & alerts" },
    { key: "data.lineage",    label: "Data Lineage",  description: "Data flow mapping & lineage tracking" },
    { key: "data.encryption", label: "Encryption",    description: "Encryption key & certificate management" },
    { key: "data.residency",  label: "Residency",     description: "Data residency & sovereignty controls" },
  ],
  assetops: [
    { key: "asset.inventory",        label: "Inventory",       description: "Hardware & software asset registry" },
    { key: "asset.lifecycle",        label: "Lifecycle",       description: "Asset procurement, refresh & disposal" },
    { key: "asset.vulnerabilities",  label: "Vulnerabilities", description: "CVE tracking & patch management" },
    { key: "asset.software",         label: "Software",        description: "Software licence & SBOM management" },
  ],
  serviceops: [
    { key: "svc.tickets",  label: "Tickets",         description: "IT & GRC ticketing system" },
    { key: "svc.sla",      label: "SLA Management",  description: "SLA definition, tracking & breach alerts" },
    { key: "svc.catalog",  label: "Service Catalog", description: "Self-service request catalogue" },
    { key: "svc.changes",  label: "Change Mgmt",     description: "Change advisory board & change controls" },
  ],
  peopleops: [
    { key: "ppl.training",    label: "Training",         description: "Security & compliance training campaigns" },
    { key: "ppl.access",      label: "Access Reviews",   description: "Periodic access certifications" },
    { key: "ppl.background",  label: "Background Checks",description: "Pre-employment screening integrations" },
    { key: "ppl.offboarding", label: "Offboarding",      description: "Automated access revocation workflows" },
  ],
  analyticsops: [
    { key: "analytics.dashboards", label: "Dashboards",  description: "Custom GRC metric dashboards" },
    { key: "analytics.reports",    label: "Reports",     description: "Scheduled & ad-hoc report generation" },
    { key: "analytics.kpi",        label: "KPI Tracking",description: "Key performance & risk indicators" },
    { key: "analytics.trends",     label: "Trends",      description: "Historical trend analysis & forecasting" },
  ],
  aivciso: [
    { key: "aivciso.briefings",       label: "Briefings",        description: "AI-generated executive security briefings" },
    { key: "aivciso.recommendations", label: "Recommendations",  description: "Prioritised AI security recommendations" },
    { key: "aivciso.chat",            label: "CISO Chat",        description: "Conversational AI security advisor" },
    { key: "aivciso.automation",      label: "Automation",       description: "AI-driven automated remediation tasks" },
  ],
};

/** Returns all sub-module keys for a given parent module key */
export function getSubmoduleKeys(parentKey: string): string[] {
  return (SUBMODULE_MAP[parentKey] ?? []).map(s => s.key);
}

/** Returns true if the modules object has ANY sub-module key for the given parent.
 *  No keys = unrestricted (full access to all sub-modules). */
export function hasSubmoduleRestrictions(
  modules: Record<string, boolean | undefined>,
  parentKey: string
): boolean {
  const subKeys = getSubmoduleKeys(parentKey);
  return subKeys.some(k => k in modules);
}

import { useState } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:     "rgb(9,12,18)",
  card:   "var(--secondary)",
  card2:  "var(--secondary)",
  border: "var(--border)",
  text:   "rgba(255,255,255,0.92)",
  muted:  "var(--muted-foreground)",
  blue:   "rgb(147,197,253)",
  green:  "#10B981",
  amber:  "#D97706",
  red:    "#DC2626",
  purple: "#8B5CF6",
  ai:     "#6366F1",
};

const PRI: Record<string, string> = {
  Critical: "#DC2626", High: "#D97706", Medium: "#3B82F6", Low: "#10B981",
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface WFStage {
  key: string;
  label: string;
  icon: string;
  description: string;
  aiAutomated: boolean;
  aiAction: string;
  slaDays: number;
  color: string;
  evidenceSources?: string[];
}

export interface WFItem {
  id: string;
  title: string;
  stage: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  owner: string;
  ownerInitials: string;
  daysInStage: number;
  slaOk: boolean;
  source?: string;
  tags: string[];
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryColor: string;
  stages: WFStage[];
  items: WFItem[];
  aiAgents: string[];
  kpis: { label: string; value: string | number; color: string }[];
}

// ── Pre-built workflow definitions (one per module) ──────────────────────────

export const POLICY_LIFECYCLE_WF: WorkflowDef = {
  id: "policy-lifecycle",
  name: "Policy Lifecycle Workflow",
  description: "End-to-end policy management from request through AI drafting, review, approval, and employee acknowledgement.",
  category: "GovOps",
  categoryColor: "#4338CA",
  aiAgents: ["GRC Agent", "Compliance Agent", "Board Agent"],
  kpis: [
    { label: "Active Policies", value: 23, color: T.blue },
    { label: "Pending Review", value: 4, color: T.amber },
    { label: "Overdue Ack", value: 3, color: T.red },
    { label: "AI-Drafted", value: 11, color: T.ai },
  ],
  stages: [
    { key: "request",       label: "Request",         icon: "📋", description: "New policy request submitted by department head or compliance officer", aiAutomated: false, aiAction: "", slaDays: 2, color: "#6366F1", evidenceSources: ["Jira", "ServiceNow"] },
    { key: "ai_draft",      label: "AI Draft",         icon: "🤖", description: "AI generates policy, SOP, control objectives, and awareness material from prompt", aiAutomated: true, aiAction: "Auto-generate full policy document with mapped controls, SOP, and compliance cross-references using GPT-4o.", slaDays: 1, color: "#8B5CF6", evidenceSources: [] },
    { key: "sme_review",    label: "SME Review",       icon: "🔍", description: "Subject matter expert reviews content and suggests domain-specific refinements", aiAutomated: false, aiAction: "AI highlights conflicting clauses and suggests improvements inline.", slaDays: 5, color: "#3B82F6" },
    { key: "legal_review",  label: "Legal Review",     icon: "⚖️", description: "Legal team validates regulatory alignment (GDPR, NIS2, ISO, DPDPA)", aiAutomated: false, aiAction: "AI performs automated GDPR/NIS2 gap check before legal receives document.", slaDays: 7, color: "#0EA5E9" },
    { key: "approval",      label: "Approval",         icon: "✅", description: "CISO / Board approves final policy version", aiAutomated: false, aiAction: "AI generates executive summary and risk score delta for approver context.", slaDays: 3, color: "#10B981" },
    { key: "publication",   label: "Publication",      icon: "📢", description: "Policy published to policy portal and version-controlled", aiAutomated: true, aiAction: "Auto-publish to policy portal, notify owners, and update compliance control mappings.", slaDays: 1, color: "#059669" },
    { key: "acknowledgement",label: "Acknowledgement", icon: "🖊️", description: "HR assigns policy to employees; acknowledgement tracked per department", aiAutomated: true, aiAction: "Auto-assign to relevant employee groups; send reminders at 3-day intervals.", slaDays: 14, color: "#D97706" },
    { key: "training",      label: "Training",         icon: "🎓", description: "Mandatory training assigned based on policy domain and employee role", aiAutomated: true, aiAction: "AI generates awareness quiz from policy content; auto-assign to role groups.", slaDays: 21, color: "#F59E0B" },
    { key: "monitoring",    label: "Monitoring",       icon: "📊", description: "Continuous monitoring for policy exceptions and upcoming review deadlines", aiAutomated: true, aiAction: "Auto-detect policy exceptions from control evidence; trigger review if deviations found.", slaDays: 365, color: "#6B7280" },
    { key: "retirement",    label: "Retirement",       icon: "🗄️", description: "Policy retired and archived with full audit trail", aiAutomated: false, aiAction: "AI checks for dependent controls and compliance mappings before retirement.", slaDays: 30, color: "#374151" },
  ],
  items: [
    { id: "POL-2041", title: "AI Governance & Acceptable Use Policy",   stage: "ai_draft",      priority: "Critical", owner: "Priya Patel",   ownerInitials: "PP", daysInStage: 1, slaOk: true,  source: "CISO Request",  tags: ["EU AI Act", "ISO 42001"] },
    { id: "POL-2039", title: "Cloud Security Baseline Policy v3.1",     stage: "legal_review",  priority: "High",     owner: "Alex Kim",      ownerInitials: "AK", daysInStage: 6, slaOk: false, source: "Board Directive", tags: ["ISO 27001", "NIS2"] },
    { id: "POL-2037", title: "Data Retention & Disposal Policy",        stage: "approval",      priority: "High",     owner: "Emma Wilson",   ownerInitials: "EW", daysInStage: 2, slaOk: true,  source: "GDPR Review",   tags: ["GDPR", "DPDPA"] },
    { id: "POL-2035", title: "Privileged Access Management Policy",     stage: "sme_review",    priority: "Medium",   owner: "Ryan Johnson",  ownerInitials: "RJ", daysInStage: 3, slaOk: true,  source: "Risk Register",  tags: ["ISO 27001", "SOC 2"] },
    { id: "POL-2033", title: "Incident Response Playbook v4",           stage: "acknowledgement",priority: "High",    owner: "Maria Santos",  ownerInitials: "MS", daysInStage: 11, slaOk: true, source: "Audit Finding", tags: ["NIS2", "ISO 27001"] },
    { id: "POL-2031", title: "Vendor Risk Management Policy",           stage: "monitoring",    priority: "Medium",   owner: "Priya Patel",   ownerInitials: "PP", daysInStage: 120, slaOk: true, source: "TPRM",          tags: ["SOC 2", "Third-Party"] },
    { id: "POL-2029", title: "Business Continuity & DR Policy",         stage: "training",      priority: "High",     owner: "Alex Kim",      ownerInitials: "AK", daysInStage: 8, slaOk: true,  source: "BCP Review",    tags: ["ISO 22301"] },
    { id: "POL-2027", title: "Acceptable Use Policy — BYOD",            stage: "request",       priority: "Low",      owner: "HR Team",       ownerInitials: "HR", daysInStage: 1, slaOk: true,  source: "HR Request",    tags: ["GDPR"] },
  ],
};

export const AUDIT_WORKFLOW_WF: WorkflowDef = {
  id: "audit-workflow",
  name: "Audit Management Workflow",
  description: "Complete audit lifecycle from planning through evidence collection, findings, remediation, and formal closure with AI-generated reports.",
  category: "ComplianceOps",
  categoryColor: "#059669",
  aiAgents: ["Auditor Agent", "Compliance Agent", "GRC Agent"],
  kpis: [
    { label: "Active Audits", value: 6, color: T.blue },
    { label: "Open Findings", value: 14, color: T.red },
    { label: "Evidence Gap", value: 8, color: T.amber },
    { label: "Due This Month", value: 2, color: T.amber },
  ],
  stages: [
    { key: "plan",        label: "Audit Plan",        icon: "📅", description: "Define audit scope, objectives, and schedule. Assign lead auditor.", aiAutomated: true, aiAction: "AI generates audit plan from selected framework, auto-maps controls in scope, and creates SOA.", slaDays: 5, color: "#6366F1", evidenceSources: ["Jira", "Azure DevOps"] },
    { key: "scope",       label: "Scope Definition",  icon: "🎯", description: "Confirm systems, processes, and personnel in scope. Risk-based sampling.", aiAutomated: true, aiAction: "AI performs risk-based sample selection and auto-generates test procedures per control.", slaDays: 3, color: "#3B82F6" },
    { key: "ctrl_map",    label: "Control Mapping",   icon: "🗺️", description: "Map controls to framework requirements. Identify gaps before evidence collection.", aiAutomated: true, aiAction: "Auto-map controls to NIST, ISO, SOC 2 with gap pre-analysis.", slaDays: 3, color: "#0EA5E9" },
    { key: "evidence",    label: "Evidence Collection",icon: "📁", description: "Collect evidence from integrated systems, agents, and manual uploads.", aiAutomated: true, aiAction: "Auto-collect from Azure AD, AWS Config, CrowdStrike, Qualys, Jira, ServiceNow, M365.", slaDays: 14, color: "#F59E0B", evidenceSources: ["Azure AD", "AWS Config", "CrowdStrike", "Qualys", "M365", "GRC Agent"] },
    { key: "testing",     label: "Testing",           icon: "🧪", description: "Execute test procedures. AI validates evidence completeness and quality.", aiAutomated: true, aiAction: "AI validates evidence quality, flags insufficient documentation, and scores control effectiveness.", slaDays: 10, color: "#D97706" },
    { key: "findings",    label: "Finding Creation",  icon: "⚠️",  description: "Document audit findings, observations, and exceptions with risk rating.", aiAutomated: true, aiAction: "AI generates finding descriptions, risk ratings, and recommendation text from test evidence.", slaDays: 5, color: "#EF4444" },
    { key: "mgmt_resp",   label: "Mgmt Response",     icon: "💬", description: "Management provides formal response and remediation commitments.", aiAutomated: false, aiAction: "AI drafts suggested management response based on finding type and historical responses.", slaDays: 7, color: "#8B5CF6" },
    { key: "remediation", label: "Remediation",       icon: "🔧", description: "Remediation actions tracked and evidence collected for resolved findings.", aiAutomated: true, aiAction: "Auto-create remediation tickets in ServiceNow/Jira; track progress against SLA.", slaDays: 30, color: "#10B981" },
    { key: "validation",  label: "Validation",        icon: "✔️", description: "Re-test remediated findings. Validate evidence completeness.", aiAutomated: true, aiAction: "AI re-validates remediation evidence and confirms finding resolution with audit trail.", slaDays: 7, color: "#059669" },
    { key: "closure",     label: "Closure",           icon: "🔒", description: "Issue final audit report, executive summary, and board pack.", aiAutomated: true, aiAction: "AI generates executive summary, board pack, and regulatory submissions automatically.", slaDays: 5, color: "#374151" },
  ],
  items: [
    { id: "AUD-2041", title: "ISO 27001 Annual Surveillance Audit",     stage: "evidence",    priority: "Critical", owner: "Priya Patel",  ownerInitials: "PP", daysInStage: 8, slaOk: true,  source: "Scheduled", tags: ["ISO 27001"] },
    { id: "AUD-2039", title: "SOC 2 Type II — Trust Services",          stage: "testing",     priority: "High",     owner: "Alex Kim",     ownerInitials: "AK", daysInStage: 6, slaOk: true,  source: "External",  tags: ["SOC 2"] },
    { id: "AUD-2037", title: "GDPR Data Processing Audit Q2",           stage: "findings",    priority: "High",     owner: "Emma Wilson",  ownerInitials: "EW", daysInStage: 3, slaOk: true,  source: "Scheduled", tags: ["GDPR"] },
    { id: "AUD-2035", title: "NIS2 Cybersecurity Risk Audit",           stage: "plan",        priority: "High",     owner: "Maria Santos", ownerInitials: "MS", daysInStage: 2, slaOk: true,  source: "Regulatory",tags: ["NIS2"] },
    { id: "AUD-2033", title: "PCI DSS Quarterly Internal Review",       stage: "remediation", priority: "Medium",   owner: "Ryan Johnson", ownerInitials: "RJ", daysInStage: 12, slaOk: true, source: "Scheduled", tags: ["PCI DSS"] },
    { id: "AUD-2031", title: "HIPAA Security Rule Assessment",          stage: "mgmt_resp",   priority: "Medium",   owner: "Priya Patel",  ownerInitials: "PP", daysInStage: 5, slaOk: true,  source: "HIPAA",     tags: ["HIPAA"] },
    { id: "AUD-2029", title: "Vendor Access Rights Review",             stage: "ctrl_map",    priority: "Low",      owner: "Alex Kim",     ownerInitials: "AK", daysInStage: 2, slaOk: true,  source: "TPRM",      tags: ["ISO 27001", "SOC 2"] },
  ],
};

export const RISK_MGMT_WF: WorkflowDef = {
  id: "risk-management",
  name: "Risk Management Workflow",
  description: "Full risk lifecycle — from AI-detected findings through scoring, treatment, board approval, and closure with continuous monitoring.",
  category: "RiskOps",
  categoryColor: "#DC2626",
  aiAgents: ["Risk Agent", "Security Agent", "Remediation Agent"],
  kpis: [
    { label: "Open Risks", value: 47, color: T.red },
    { label: "Critical", value: 7, color: T.red },
    { label: "Treatment Plans", value: 12, color: T.amber },
    { label: "SLA Breaches", value: 3, color: T.red },
  ],
  stages: [
    { key: "detection",   label: "Detection",          icon: "🔎", description: "Risk identified from vulnerability, incident, vendor issue, audit finding, or threat intel", aiAutomated: true, aiAction: "Auto-ingest from Qualys, CrowdStrike, CSPM, SIEM, and create risk record with initial scoring.", slaDays: 1, color: "#EF4444", evidenceSources: ["Qualys", "CrowdStrike", "CSPM", "SIEM", "Threat Intel"] },
    { key: "ai_scoring",  label: "AI Scoring",         icon: "🤖", description: "AI calculates likelihood, impact, and risk score using CVSS, asset criticality, and threat intel", aiAutomated: true, aiAction: "Compute composite risk score using CVSS + asset criticality + exploit availability + business impact.", slaDays: 1, color: "#F97316" },
    { key: "owner_assign",label: "Owner Assignment",   icon: "👤", description: "Risk owner assigned based on domain, asset ownership, and org chart", aiAutomated: true, aiAction: "AI recommends owner based on asset category, department, and historical risk ownership patterns.", slaDays: 2, color: "#F59E0B" },
    { key: "treatment",   label: "Treatment Selection",icon: "🛠️", description: "Owner selects treatment: Mitigate, Transfer, Accept, or Avoid. Defines action plan.", aiAutomated: false, aiAction: "AI suggests optimal treatment based on cost, likelihood reduction, and peer organisation benchmarks.", slaDays: 7, color: "#3B82F6" },
    { key: "approval",    label: "Board Approval",     icon: "✅", description: "Risk treatment plan reviewed and approved by Risk Committee or CISO", aiAutomated: false, aiAction: "AI generates risk brief with cost-benefit analysis and regulatory impact for approver.", slaDays: 5, color: "#8B5CF6" },
    { key: "monitoring",  label: "Active Monitoring",  icon: "📡", description: "Continuous monitoring of residual risk against appetite thresholds", aiAutomated: true, aiAction: "Auto-monitor residual risk; alert when threshold breached; auto-adjust score from new telemetry.", slaDays: 90, color: "#10B981" },
    { key: "closure",     label: "Closure",            icon: "🔒", description: "Risk formally closed with full evidence trail and lessons learned", aiAutomated: false, aiAction: "AI validates closure evidence completeness and checks for related open risks.", slaDays: 3, color: "#374151" },
  ],
  items: [
    { id: "WF-RK-101", title: "Cloud Misconfiguration — S3 Buckets",       stage: "monitoring",  priority: "Critical", owner: "Alex Kim",      ownerInitials: "AK", daysInStage: 12, slaOk: true,  source: "CSPM Scan",    tags: ["Cloud", "CIS"] },
    { id: "WF-RK-102", title: "Privileged Account without MFA",             stage: "treatment",   priority: "High",     owner: "Maria Santos",  ownerInitials: "MS", daysInStage: 4, slaOk: true,  source: "AD Audit",     tags: ["Identity", "ISO 27001"] },
    { id: "WF-RK-103", title: "Unpatched Linux Kernel (3 servers)",         stage: "approval",    priority: "High",     owner: "Ryan Johnson",  ownerInitials: "RJ", daysInStage: 2, slaOk: true,  source: "Qualys",       tags: ["Vulnerability", "CVE-2024-1086"] },
    { id: "WF-RK-104", title: "Vendor Data Processing Agreement Missing",   stage: "owner_assign",priority: "Medium",   owner: "Priya Patel",   ownerInitials: "PP", daysInStage: 1, slaOk: true,  source: "TPRM Review",  tags: ["Third-Party", "GDPR"] },
    { id: "WF-RK-105", title: "DSAR Response SLA Breach Risk",              stage: "monitoring",  priority: "Medium",   owner: "Emma Wilson",   ownerInitials: "EW", daysInStage: 7, slaOk: true,  source: "Privacy Ops",  tags: ["Privacy", "GDPR"] },
    { id: "WF-RK-106", title: "Shadow IT — Unapproved SaaS (7 apps)",      stage: "ai_scoring",  priority: "High",     owner: "Unassigned",    ownerInitials: "AI", daysInStage: 1, slaOk: true,  source: "SSPM Scan",    tags: ["Shadow IT", "Data Loss"] },
    { id: "WF-RK-107", title: "Ransomware Exposure — Backup Gap",           stage: "detection",   priority: "Critical", owner: "AI Agent",      ownerInitials: "AI", daysInStage: 0, slaOk: true,  source: "Threat Intel", tags: ["Ransomware", "BC/DR"] },
  ],
};

export const SEC_FINDINGS_WF: WorkflowDef = {
  id: "sec-findings",
  name: "Security Findings Workflow",
  description: "Security findings from any source through AI triage, risk scoring, control mapping, remediation, and retest to closure.",
  category: "SecOps",
  categoryColor: "#DC2626",
  aiAgents: ["Security Agent", "Remediation Agent", "Risk Agent"],
  kpis: [
    { label: "Open Findings", value: 38, color: T.red },
    { label: "Critical/High", value: 11, color: T.red },
    { label: "In Remediation", value: 14, color: T.amber },
    { label: "Pending Retest", value: 6, color: T.blue },
  ],
  stages: [
    { key: "finding",    label: "Finding",          icon: "🔔", description: "Security finding ingested from scanner, SIEM, agent, or manual report", aiAutomated: true, aiAction: "Auto-ingest from CrowdStrike, Qualys, Defender, Tenable, SIEM with deduplication.", slaDays: 1, color: "#EF4444", evidenceSources: ["CrowdStrike", "Qualys", "Defender", "Tenable", "Cynet", "SIEM"] },
    { key: "validation", label: "Validation",       icon: "🔍", description: "AI validates finding authenticity, deduplicates, and confirms asset ownership", aiAutomated: true, aiAction: "AI validates against asset inventory, deduplicates against existing risks, confirms severity.", slaDays: 2, color: "#F97316" },
    { key: "risk_score", label: "Risk Scoring",     icon: "📊", description: "Composite risk score from CVSS, asset criticality, exploit availability, business impact", aiAutomated: true, aiAction: "Compute adjusted risk score: CVSS × asset criticality × exploit probability × business impact.", slaDays: 1, color: "#F59E0B" },
    { key: "ctrl_map",   label: "Control Mapping",  icon: "🗺️", description: "Map finding to failed/affected compliance controls across all active frameworks", aiAutomated: true, aiAction: "Auto-map to ISO 27001, SOC 2, NIS2, PCI DSS control failures. Create control gaps.", slaDays: 1, color: "#3B82F6" },
    { key: "owner",      label: "Owner Assignment", icon: "👤", description: "Assign remediation owner based on asset, team, and SLA tier", aiAutomated: true, aiAction: "AI assigns owner from asset CMDB owner; creates ticket in ServiceNow/Jira with SLA.", slaDays: 1, color: "#8B5CF6" },
    { key: "remediation",label: "Remediation",      icon: "🔧", description: "Owner executes remediation steps. AI provides step-by-step playbook.", aiAutomated: false, aiAction: "AI generates remediation playbook with patching steps, configuration changes, and verification criteria.", slaDays: 14, color: "#D97706", evidenceSources: ["Jira", "ServiceNow", "Ansible", "GRC Agent"] },
    { key: "retest",     label: "Retest",           icon: "🔄", description: "Automated retest confirms remediation is effective", aiAutomated: true, aiAction: "Auto-trigger retest scan via Qualys/CrowdStrike API; confirm fix with agent telemetry.", slaDays: 5, color: "#10B981" },
    { key: "closure",    label: "Closure",          icon: "✅", description: "Finding closed with evidence trail, risk reduction quantified", aiAutomated: true, aiAction: "AI updates risk register, compliance posture, and generates remediation evidence package.", slaDays: 2, color: "#374151" },
  ],
  items: [
    { id: "SF-3041", title: "CVE-2024-1086 — Kernel Privilege Escalation (3 hosts)", stage: "remediation", priority: "Critical", owner: "Ryan Johnson",  ownerInitials: "RJ", daysInStage: 5, slaOk: true,  source: "Qualys",      tags: ["CVE", "Kernel"] },
    { id: "SF-3039", title: "S3 Bucket Public Access — prod-assets-bucket",          stage: "ctrl_map",    priority: "Critical", owner: "Alex Kim",      ownerInitials: "AK", daysInStage: 2, slaOk: true,  source: "CSPM",        tags: ["AWS", "Misconfiguration"] },
    { id: "SF-3037", title: "Unencrypted RDS Instance — eu-west-2",                  stage: "owner",       priority: "High",     owner: "AI Agent",      ownerInitials: "AI", daysInStage: 1, slaOk: true,  source: "AWS Config",  tags: ["Encryption", "RDS"] },
    { id: "SF-3035", title: "Malware Detected — CrowdStrike — DESKTOP-EU2031",       stage: "finding",     priority: "Critical", owner: "AI Agent",      ownerInitials: "AI", daysInStage: 0, slaOk: true,  source: "CrowdStrike", tags: ["Malware", "Endpoint"] },
    { id: "SF-3033", title: "Outdated TLS 1.0 — api-legacy.acme.com",                stage: "retest",      priority: "High",     owner: "Maria Santos",  ownerInitials: "MS", daysInStage: 3, slaOk: true,  source: "Qualys",      tags: ["TLS", "API"] },
    { id: "SF-3031", title: "Excessive Admin Privileges — ServiceAccount-CI",         stage: "risk_score",  priority: "High",     owner: "AI Agent",      ownerInitials: "AI", daysInStage: 1, slaOk: true,  source: "AD Audit",    tags: ["IAM", "Privilege"] },
    { id: "SF-3029", title: "Missing WAF on api.acme.com",                            stage: "validation",  priority: "Medium",   owner: "AI Agent",      ownerInitials: "AI", daysInStage: 1, slaOk: true,  source: "Defender",    tags: ["WAF", "Web"] },
  ],
};

export const PRIVACY_DSAR_WF: WorkflowDef = {
  id: "privacy-dsar",
  name: "Privacy & DSAR Workflow",
  description: "Privacy operations: DSAR handling, DPIA lifecycle, consent management, and regulatory obligation monitoring with AI-assisted responses.",
  category: "PrivacyOps",
  categoryColor: "#7C3AED",
  aiAgents: ["Privacy Agent", "Regulatory Agent", "GRC Agent"],
  kpis: [
    { label: "Open DSARs", value: 8, color: T.amber },
    { label: "Overdue", value: 3, color: T.red },
    { label: "Active DPIAs", value: 5, color: T.blue },
    { label: "AI-Processed", value: 6, color: T.ai },
  ],
  stages: [
    { key: "request",     label: "Request Received",    icon: "📩", description: "DSAR, DPIA, or privacy request received via portal, email, or integration", aiAutomated: true, aiAction: "Auto-classify request type, create record, assign SLA, and send acknowledgement.", slaDays: 1, color: "#8B5CF6", evidenceSources: ["Portal", "Email", "Jira"] },
    { key: "id_validate", label: "Identity Validation",  icon: "🪪", description: "Confirm requestor identity with adequate verification before processing", aiAutomated: true, aiAction: "AI matches identity against HR database and authentication logs. Flags mismatches.", slaDays: 3, color: "#7C3AED" },
    { key: "discovery",   label: "Data Discovery",       icon: "🔍", description: "Locate all personal data held for the data subject across all systems", aiAutomated: true, aiAction: "Auto-scan across DSPM stores, CRM, HR, Email, Cloud — discover all matching records.", slaDays: 10, color: "#3B82F6", evidenceSources: ["DSPM", "M365", "Salesforce", "HR System", "GRC Agent"] },
    { key: "legal_review",label: "Legal Review",         icon: "⚖️", description: "Legal validates response scope, exemptions, and third-party data handling", aiAutomated: false, aiAction: "AI pre-flags potential exemptions (legal privilege, law enforcement, etc.) for legal review.", slaDays: 5, color: "#0EA5E9" },
    { key: "fulfillment", label: "Fulfilment",           icon: "📦", description: "Data package prepared, anonymised where needed, and delivered to requestor", aiAutomated: true, aiAction: "AI generates data export, redacts third-party data, creates fulfilment package.", slaDays: 5, color: "#10B981" },
    { key: "evidence",    label: "Evidence Archive",     icon: "📁", description: "Full audit trail archived per regulatory retention requirements", aiAutomated: true, aiAction: "Auto-archive with GDPR Article 30 record, timestamp, and regulatory evidence tag.", slaDays: 1, color: "#059669" },
    { key: "closure",     label: "Closure",              icon: "🔒", description: "Request formally closed, metrics updated, regulatory reporting triggered if needed", aiAutomated: true, aiAction: "Auto-update DSAR metrics, trigger regulatory report if breach timeframe exceeded.", slaDays: 1, color: "#374151" },
  ],
  items: [
    { id: "DSR-0312", title: "GDPR Art. 15 — Access Request — J. Smith",          stage: "fulfillment",  priority: "High",   owner: "Emma Wilson",  ownerInitials: "EW", daysInStage: 3, slaOk: true,  source: "Portal",    tags: ["GDPR", "Art.15"] },
    { id: "DSR-0311", title: "GDPR Art. 17 — Erasure Request — A. Müller",        stage: "legal_review", priority: "High",   owner: "Priya Patel",  ownerInitials: "PP", daysInStage: 4, slaOk: true,  source: "Email",     tags: ["GDPR", "Art.17"] },
    { id: "DSR-0310", title: "DPDPA — Data Access Request — R. Sharma",           stage: "discovery",    priority: "High",   owner: "AI Agent",     ownerInitials: "AI", daysInStage: 7, slaOk: false, source: "Portal",    tags: ["DPDPA"] },
    { id: "DSR-0309", title: "GDPR Art. 15 — Access Request — B. Kowalski",       stage: "request",      priority: "Medium", owner: "AI Agent",     ownerInitials: "AI", daysInStage: 1, slaOk: true,  source: "Email",     tags: ["GDPR", "Art.15"] },
    { id: "DPIA-2041",title: "DPIA — AI-Powered HR Screening Tool",               stage: "legal_review", priority: "Critical",owner: "Emma Wilson", ownerInitials: "EW", daysInStage: 6, slaOk: true,  source: "EU AI Act", tags: ["DPIA", "AI"] },
    { id: "DPIA-2039",title: "DPIA — Customer Behaviour Analytics Platform",      stage: "discovery",    priority: "High",   owner: "Priya Patel",  ownerInitials: "PP", daysInStage: 4, slaOk: true,  source: "DPO Review",tags: ["DPIA", "Analytics"] },
    { id: "DSR-0308", title: "CCPA — Right to Opt-Out — Multiple Subjects (12)",  stage: "id_validate",  priority: "Medium", owner: "AI Agent",     ownerInitials: "AI", daysInStage: 2, slaOk: true,  source: "Portal",    tags: ["CCPA"] },
  ],
};

export const EMPLOYEE_LIFECYCLE_WF: WorkflowDef = {
  id: "employee-lifecycle",
  name: "Employee Lifecycle Workflow",
  description: "End-to-end employee journey from onboarding through role changes, policy acknowledgement, access review, and offboarding.",
  category: "PeopleOps",
  categoryColor: "#0EA5E9",
  aiAgents: ["GRC Agent", "Compliance Agent", "Remediation Agent"],
  kpis: [
    { label: "Active Employees", value: 847, color: T.blue },
    { label: "Onboarding", value: 12, color: T.green },
    { label: "Pending Policy Ack", value: 34, color: T.amber },
    { label: "Offboarding", value: 3, color: T.red },
  ],
  stages: [
    { key: "new_joiner",    label: "New Joiner",           icon: "👋", description: "New employee record created from HRIS. Triggers onboarding workflow automatically.", aiAutomated: true, aiAction: "Auto-create user accounts, assign onboarding tasks, and send welcome pack.", slaDays: 1, color: "#10B981", evidenceSources: ["Workday", "Azure AD", "Okta"] },
    { key: "role_assign",   label: "Role Assignment",      icon: "🏷️", description: "Assign platform role, department, and manager. Grant initial access rights.", aiAutomated: true, aiAction: "AI recommends role and access rights based on job title, department, and peer group analysis.", slaDays: 1, color: "#3B82F6" },
    { key: "policy_ack",    label: "Policy Acknowledgement",icon: "🖊️", description: "Employee must acknowledge all mandatory policies for their role", aiAutomated: true, aiAction: "Auto-assign relevant policy set based on role/dept; send acknowledgement tasks via email.", slaDays: 7, color: "#F59E0B" },
    { key: "training",      label: "Security Training",    icon: "🎓", description: "Mandatory security awareness and compliance training completion", aiAutomated: true, aiAction: "AI-generates personalised training path based on role risk level and framework requirements.", slaDays: 14, color: "#D97706" },
    { key: "access_prov",   label: "Access Provisioning",  icon: "🔑", description: "Full access provisioning completed with MFA, least-privilege enforcement", aiAutomated: true, aiAction: "Auto-provision access with MFA enforcement; alert on excessive privilege grants.", slaDays: 2, color: "#8B5CF6", evidenceSources: ["Azure AD", "Okta", "CyberArk"] },
    { key: "monitoring",    label: "Active Monitoring",    icon: "👁️", description: "Continuous behavioural monitoring, dormant account detection, SoD checks", aiAutomated: true, aiAction: "Continuous UBA: detect dormant accounts, SoD violations, privilege escalation, and suspicious access.", slaDays: 365, color: "#6366F1" },
    { key: "review",        label: "Access Review",        icon: "🔄", description: "Periodic (quarterly) access re-certification by line managers", aiAutomated: false, aiAction: "AI pre-populates access review with recommended revoke/retain decisions based on usage data.", slaDays: 90, color: "#0EA5E9" },
    { key: "offboarding",   label: "Offboarding",          icon: "🚪", description: "Revoke all access, archive data, and complete offboarding checklist within 24h", aiAutomated: true, aiAction: "Auto-revoke all accounts, disable SSO, archive mailbox, and create offboarding audit trail.", slaDays: 1, color: "#EF4444" },
  ],
  items: [
    { id: "EMP-3041", title: "Sarah Chen — Senior Security Analyst (Onboarding)",   stage: "training",    priority: "High",   owner: "HR Team",     ownerInitials: "HR", daysInStage: 5, slaOk: true,  source: "Workday",   tags: ["SecOps", "ISO 27001"] },
    { id: "EMP-3039", title: "James Park — Cloud Architect (Onboarding)",           stage: "access_prov", priority: "High",   owner: "IT Team",     ownerInitials: "IT", daysInStage: 1, slaOk: true,  source: "Workday",   tags: ["Cloud", "Privileged"] },
    { id: "EMP-3037", title: "Lucia Fernandez — Privacy Counsel (Policy Ack)",      stage: "policy_ack",  priority: "Medium", owner: "Priya Patel", ownerInitials: "PP", daysInStage: 6, slaOk: true,  source: "HR Ops",    tags: ["GDPR", "DPDPA"] },
    { id: "EMP-3035", title: "Dimitri Voronov — Offboarding (2024-06-28)",          stage: "offboarding", priority: "Critical",owner: "IT Team",    ownerInitials: "IT", daysInStage: 1, slaOk: true,  source: "Workday",   tags: ["Offboarding", "Urgent"] },
    { id: "EMP-3033", title: "Q2 Access Review — Finance Department (23 users)",    stage: "review",      priority: "High",   owner: "Alex Kim",    ownerInitials: "AK", daysInStage: 8, slaOk: false, source: "Quarterly", tags: ["Access Review", "SoD"] },
    { id: "EMP-3031", title: "MFA Enforcement Gap — 6 Privileged Accounts",        stage: "monitoring",  priority: "Critical",owner: "AI Agent",   ownerInitials: "AI", daysInStage: 2, slaOk: true,  source: "UBA",       tags: ["MFA", "Privilege"] },
    { id: "EMP-3029", title: "Policy Ack Overdue — Marketing Dept (11 users)",     stage: "policy_ack",  priority: "Medium", owner: "HR Team",     ownerInitials: "HR", daysInStage: 12, slaOk: false, source: "PeopleOps", tags: ["Policy", "Overdue"] },
  ],
};

// ── Shared pipeline render component ─────────────────────────────────────────

function stageItemsOf(items: WFItem[], key: string) {
  return items.filter(i => i.stage === key);
}

interface PipelineViewProps {
  wf: WorkflowDef;
}

function PipelineView({ wf }: PipelineViewProps) {
  const [activeStage, setActiveStage] = useState<string>(wf.stages[0]?.key ?? "");
  const [aiEnabled, setAiEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(wf.stages.map(s => [s.key, s.aiAutomated]))
  );

  const stageItems   = stageItemsOf(wf.items, activeStage);
  const activeObj    = wf.stages.find(s => s.key === activeStage)!;
  const aiHandled    = wf.items.filter(i => wf.stages.find(s => s.key === i.stage)?.aiAutomated && aiEnabled[i.stage]).length;
  const slaBreaches  = wf.items.filter(i => !i.slaOk).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ background: wf.categoryColor + "22", color: wf.categoryColor, border: `1px solid ${wf.categoryColor}44`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>{wf.category}</span>
            <span style={{ background: "rgba(99,102,241,0.12)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>⚡ AI-Enhanced</span>
            <span style={{ background: "rgba(16,185,129,0.1)", color: T.green, border: "1px solid rgba(16,185,129,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>⬡ Agent-Driven</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 2 }}>{wf.name}</div>
          <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{wf.description}</div>
        </div>
        <button style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 6, padding: "7px 16px", color: "#818CF8", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          + New Instance
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {wf.kpis.map(k => (
          <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 12px", display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: String(k.color) }}>{k.value}</span>
            <span style={{ fontSize: 11, color: T.muted }}>{k.label}</span>
          </div>
        ))}
        <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "6px 12px", display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#818CF8" }}>{aiHandled}</span>
          <span style={{ fontSize: 11, color: T.muted }}>AI Automated</span>
        </div>
        <div style={{ background: slaBreaches > 0 ? "rgba(220,38,38,0.07)" : "rgba(16,185,129,0.07)", border: `1px solid ${slaBreaches > 0 ? "rgba(220,38,38,0.25)" : "rgba(16,185,129,0.2)"}`, borderRadius: 6, padding: "6px 12px", display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: slaBreaches > 0 ? T.red : T.green }}>{slaBreaches}</span>
          <span style={{ fontSize: 11, color: T.muted }}>SLA Breaches</span>
        </div>
      </div>

      {/* Stage Pipeline Strip */}
      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "stretch", minWidth: "max-content", gap: 2 }}>
          {wf.stages.map((stage, idx) => {
            const cnt     = stageItemsOf(wf.items, stage.key).length;
            const isActive = stage.key === activeStage;
            const isAI     = stage.aiAutomated && aiEnabled[stage.key];
            const hasBreaches = stageItemsOf(wf.items, stage.key).some(i => !i.slaOk);
            return (
              <div key={stage.key} style={{ display: "flex", alignItems: "center" }}>
                <button onClick={() => setActiveStage(stage.key)} style={{
                  background: isActive ? `linear-gradient(135deg, ${stage.color}20, ${stage.color}08)` : T.card,
                  border: `1px solid ${isActive ? stage.color + "66" : T.border}`,
                  borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                  textAlign: "left", minWidth: 100, position: "relative",
                  boxShadow: isActive ? `0 0 12px ${stage.color}20` : "none",
                  transition: "all 0.15s",
                }}>
                  {isAI && <div style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: "50%", background: "#6366F1", boxShadow: "0 0 4px #6366F1" }} />}
                  {hasBreaches && <div style={{ position: "absolute", top: 5, left: 5, width: 6, height: 6, borderRadius: "50%", background: T.red }} />}
                  <div style={{ fontSize: 14, marginBottom: 3 }}>{stage.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? stage.color : "var(--muted-foreground)", lineHeight: 1.3, marginBottom: 4 }}>{stage.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: isActive ? T.text : "var(--muted-foreground)", lineHeight: 1 }}>{cnt}</div>
                  {isActive && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: stage.color, borderRadius: "0 0 8px 8px" }} />}
                </button>
                {idx < wf.stages.length - 1 && (
                  <div style={{ color: "rgba(148,163,184,0.25)", fontSize: 12, padding: "0 2px" }}>›</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Detail: Items + AI Panel */}
      {activeObj && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

          {/* Items column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                {activeObj.icon} <span style={{ color: activeObj.color }}>{activeObj.label}</span>
                <span style={{ marginLeft: 8, fontWeight: 400, color: T.muted, fontSize: 11 }}>{activeObj.description}</span>
              </div>
              <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{stageItems.length} item{stageItems.length !== 1 ? "s" : ""}</span>
            </div>

            {stageItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "28px 20px", color: T.muted, fontSize: 12, background: T.card, borderRadius: 8, border: `1px dashed ${T.border}` }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
                <div style={{ fontWeight: 600 }}>No items in this stage</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>SLA compliant</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {stageItems.map(item => (
                  <div key={item.id} style={{ background: T.card, border: `1px solid ${item.slaOk ? T.border : "rgba(220,38,38,0.3)"}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start", transition: "border-color 0.15s" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: T.muted, background: "var(--secondary)", border: `1px solid ${T.border}`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>{item.id}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: PRI[item.priority], background: PRI[item.priority] + "1A", border: `1px solid ${PRI[item.priority]}33`, borderRadius: 3, padding: "1px 5px" }}>{item.priority}</span>
                        {!item.slaOk && <span style={{ fontSize: 10, color: T.red, fontWeight: 700, background: "rgba(220,38,38,0.1)", borderRadius: 3, padding: "1px 5px", border: "1px solid rgba(220,38,38,0.25)" }}>⚠ SLA Breach</span>}
                        {item.source && <span style={{ fontSize: 10, color: T.muted }}>via {item.source}</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6, lineHeight: 1.4 }}>{item.title}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: T.blue, flexShrink: 0 }}>{item.ownerInitials}</div>
                        <span style={{ fontSize: 11, color: T.muted }}>{item.owner}</span>
                        <span style={{ fontSize: 11, color: item.daysInStage > activeObj.slaDays ? T.red : T.muted }}>{item.daysInStage}d / {activeObj.slaDays}d SLA</span>
                        {item.tags.map(tag => (
                          <span key={tag} style={{ fontSize: 9, color: T.muted, background: "var(--secondary)", border: `1px solid ${T.border}`, borderRadius: 3, padding: "1px 5px" }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      <button style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 5, padding: "4px 10px", color: "#818CF8", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Advance →</button>
                      <button style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 5, padding: "4px 10px", color: T.green, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>AI Action</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Automation side panel */}
          <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* AI toggle card */}
            <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#818CF8", marginBottom: 10 }}>⚡ AI Automation</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>{activeObj.label}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.muted }}>Auto-process</span>
                <button onClick={() => setAiEnabled(e => ({ ...e, [activeObj.key]: !e[activeObj.key] }))} style={{
                  width: 36, height: 18, borderRadius: 9,
                  background: aiEnabled[activeObj.key] ? "#6366F1" : "rgba(255,255,255,0.1)",
                  border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}>
                  <div style={{ position: "absolute", top: 2, left: aiEnabled[activeObj.key] ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                </button>
              </div>
              {activeObj.aiAutomated && (
                <div style={{ fontSize: 11, color: "#A5B4FC", background: "rgba(99,102,241,0.1)", borderRadius: 5, padding: "7px 10px", lineHeight: 1.5 }}>
                  {activeObj.aiAction}
                </div>
              )}
              {!activeObj.aiAutomated && (
                <div style={{ fontSize: 11, color: T.muted, background: T.card2, borderRadius: 5, padding: "7px 10px" }}>
                  Manual stage — AI assists but does not auto-process.
                </div>
              )}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>Assigned AI Agents</div>
                {wf.aiAgents.map(a => (
                  <div key={a} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#818CF8" }}>{a}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence sources */}
            {(activeObj.evidenceSources ?? []).length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8 }}>🔌 Auto-Evidence Sources</div>
                {(activeObj.evidenceSources ?? []).map(src => (
                  <div key={src} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.muted, flex: 1 }}>{src}</span>
                    <span style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>Live</span>
                  </div>
                ))}
              </div>
            )}

            {/* SLA indicator */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8 }}>⏱ Stage SLA</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: activeObj.slaDays <= 3 ? T.amber : T.text }}>{activeObj.slaDays}d</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>max in stage</div>
              <div style={{ marginTop: 8, height: 4, background: "var(--border)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${Math.min(100, (stageItems.length / Math.max(1, wf.items.length)) * 100 * 3)}%`, background: activeObj.color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{stageItems.length} of {wf.items.length} items here</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

interface WorkflowPipelineProps {
  workflows: WorkflowDef[];
  defaultWorkflow?: string;
}

export default function WorkflowPipeline({ workflows, defaultWorkflow }: WorkflowPipelineProps) {
  const [activeWf, setActiveWf] = useState<string>(defaultWorkflow ?? workflows[0]?.id ?? "");
  const current = workflows.find(w => w.id === activeWf) ?? workflows[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Workflow selector — only shown if multiple */}
      {workflows.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {workflows.map(w => (
            <button key={w.id} onClick={() => setActiveWf(w.id)} style={{
              background: activeWf === w.id ? `${w.categoryColor}18` : T.card,
              border: `1px solid ${activeWf === w.id ? w.categoryColor + "55" : T.border}`,
              borderRadius: 6, padding: "6px 14px", cursor: "pointer",
              color: activeWf === w.id ? w.categoryColor : T.muted,
              fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}>
              {w.name}
            </button>
          ))}
        </div>
      )}

      {current && <PipelineView wf={current} />}
    </div>
  );
}

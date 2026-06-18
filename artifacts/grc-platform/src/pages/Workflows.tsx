import { useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { ALL_FRAMEWORKS, REGIONS, type RegionalFramework } from "@/lib/regional-frameworks";
import { getFrameworkDetail } from "@/lib/framework-details";
import { useOrg } from "@/context/OrgContext";
import { useTheme } from "@/context/ThemeContext";
import { AICopilotBar } from "@/components/AICopilotBar";

// ── Palette ────────────────────────────────────────────────────────────────
const EME = "#34D399"; const NAV = "#93C5FD"; const AMB = "#FCD34D";
const RED = "#F87171"; const PRP = "#C4B5FD"; const CYN = "#67E8F9";
const ORG = "#FB923C";

// ── Theme token factory ────────────────────────────────────────────────────
function mkT(isDark: boolean) {
  return {
    text:      isDark ? "#ffffff"                    : "rgb(15,23,42)",
    textSub:   isDark ? "rgba(255,255,255,0.82)"     : "rgb(30,41,59)",
    muted:     isDark ? "rgba(148,163,184,0.62)"     : "rgb(71,85,105)",
    muted2:    isDark ? "var(--muted-foreground)"     : "rgba(71,85,105,0.75)",
    cardBg:    isDark ? "var(--secondary)"     : "#ffffff",
    cardBg2:   isDark ? "rgba(255,255,255,0.025)"    : "rgb(249,250,251)",
    border:    isDark ? "rgba(255,255,255,0.09)"     : "rgba(0,0,0,0.10)",
    border2:   isDark ? "var(--border)"     : "rgba(0,0,0,0.07)",
    sep:       isDark ? "var(--border)"     : "rgba(0,0,0,0.07)",
    inputBg:   isDark ? "rgba(255,255,255,0.055)"    : "var(--foreground)",
    inputBdr:  isDark ? "rgba(255,255,255,0.11)"     : "rgba(0,0,0,0.14)",
    tagBg:     isDark ? "rgba(255,255,255,0.055)"    : "rgba(0,0,0,0.04)",
    tagBdr:    isDark ? "rgba(255,255,255,0.09)"     : "rgba(0,0,0,0.09)",
    hoverBg:   isDark ? "var(--secondary)"     : "rgba(0,0,0,0.025)",
    shadow:    isDark ? "none"                        : "0 1px 5px rgba(0,0,0,0.06)",
    tabUnder:  isDark ? "rgb(14,22,34)"              : "var(--foreground)",
    pbBg:      isDark ? "var(--border)"     : "rgba(0,0,0,0.08)",
  };
}

// ── Shared style helpers ───────────────────────────────────────────────────
// mkC builds a theme-aware card style helper for use inside components
function mkC(isDark: boolean) {
  const T = mkT(isDark);
  return (extra?: React.CSSProperties): React.CSSProperties => ({
    background: T.cardBg, border:`1px solid ${T.border}`,
    boxShadow: T.shadow, borderRadius:10, ...extra,
  });
}
const btn = (color: string, bg: string): React.CSSProperties => ({
  padding:"7px 18px", borderRadius:7, border:`1px solid ${color}40`,
  background:bg, color, fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:"inherit",
});

// FRAMEWORKS sourced from @/lib/regional-frameworks (ALL_FRAMEWORKS)

const AUDIT_TYPES = [
  { id:"internal",        label:"Internal Audit",        icon:"🔍", desc:"First-party audit by internal team" },
  { id:"external",        label:"External Audit",        icon:"🏛", desc:"Independent third-party audit" },
  { id:"surveillance",    label:"Surveillance Audit",    icon:"📋", desc:"Ongoing certification surveillance" },
  { id:"certification",   label:"Certification Audit",   icon:"🏆", desc:"Initial certification or recertification" },
  { id:"gap",             label:"Gap Assessment",        icon:"📊", desc:"Identify compliance gaps before formal audit" },
  { id:"readiness",       label:"Readiness Assessment",  icon:"✅", desc:"Pre-certification readiness check" },
];

// ── Workflow catalog data ──────────────────────────────────────────────────
export type WfStatus = "not_started"|"in_progress"|"completed"|"paused";
export type AutoLevel = "manual"|"semi"|"automated";

export interface WorkflowDef {
  id: string;
  category: string;
  icon: string;
  title: string;
  description: string;
  steps: number;
  estimatedDays: number;
  autoLevel: AutoLevel;
  color: string;
  tags: string[];
  featured?: boolean;
}

const WORKFLOW_CATALOG: WorkflowDef[] = [
  // ── Compliance & Audit ──
  { id:"audit_exec",    category:"Compliance & Audit", icon:"🏛", title:"Audit Execution",
    description:"Full end-to-end guided audit — framework selection, SOA, evidence collection, control testing, findings & report closure.",
    steps:12, estimatedDays:30, autoLevel:"semi", color:NAV, tags:["SOA","Evidence","Findings","Report"], featured:true },
  { id:"soa_gen",       category:"Compliance & Audit", icon:"📋", title:"Statement of Applicability (SOA)",
    description:"Generate and maintain a structured SOA with control applicability decisions and implementation status.",
    steps:6, estimatedDays:5, autoLevel:"semi", color:EME, tags:["SOA","Controls","Justification"] },
  { id:"evidence_coll", category:"Compliance & Audit", icon:"🗂", title:"Evidence Collection Campaign",
    description:"Automated and manual evidence gathering mapped to controls across all integrated platforms.",
    steps:5, estimatedDays:7, autoLevel:"automated", color:CYN, tags:["Evidence","Integrations","Agent"] },
  // ── Risk Management ──
  { id:"risk_assess",   category:"Risk Management", icon:"⚠️", title:"Risk Assessment",
    description:"Structured risk identification, analysis, evaluation and treatment planning per ISO 27005.",
    steps:8, estimatedDays:14, autoLevel:"semi", color:AMB, tags:["Risk Register","Treatment","CVSS"], featured:true },
  { id:"vendor_tprm",   category:"Risk Management", icon:"🤝", title:"Vendor TPRM Assessment",
    description:"Third-party risk lifecycle from onboarding questionnaire through contract and continuous monitoring.",
    steps:7, estimatedDays:21, autoLevel:"semi", color:ORG, tags:["Vendor","DPA","Questionnaire"] },
  { id:"vuln_mgmt",     category:"Risk Management", icon:"🐛", title:"Vulnerability Management",
    description:"Scan, triage, prioritise and remediate vulnerabilities with SLA tracking and auto-ticketing.",
    steps:6, estimatedDays:7, autoLevel:"automated", color:RED, tags:["CVE","CVSS","Patching"] },
  // ── Policy Management ──
  { id:"policy_lifecycle", category:"Policy Management", icon:"📜", title:"Policy Lifecycle",
    description:"End-to-end policy lifecycle: create (template/AI/import), assess, approve, publish and assign.",
    steps:8, estimatedDays:10, autoLevel:"semi", color:PRP, tags:["Templates","AI","Approval","Assign"], featured:true },
  { id:"policy_review",    category:"Policy Management", icon:"🔄", title:"Annual Policy Review",
    description:"Scheduled review cycle for all active policies with owner notifications and version control.",
    steps:5, estimatedDays:14, autoLevel:"semi", color:PRP, tags:["Review","Versioning","Notifications"] },
  // ── User & Identity ──
  { id:"user_onboard",  category:"User & Identity", icon:"👤", title:"User Onboarding",
    description:"Import, classify, role-assign, enforce MFA, assign policies and training for new identities.",
    steps:7, estimatedDays:1, autoLevel:"semi", color:EME, tags:["MFA","Classification","Training"] },
  { id:"mfa_enforce",   category:"User & Identity", icon:"🔐", title:"MFA Enforcement Campaign",
    description:"Identify non-MFA accounts, send reminders, enforce policy and track completion.",
    steps:5, estimatedDays:7, autoLevel:"automated", color:AMB, tags:["MFA","Enforcement","Bulk"] },
  // ── Asset & Device ──
  { id:"asset_discovery", category:"Asset & Device", icon:"🔷", title:"Asset Discovery & Classification",
    description:"Deploy AIGO-X Agent, auto-discover assets, classify managed/unmanaged, sync to AssetOps.",
    steps:7, estimatedDays:3, autoLevel:"automated", color:CYN, tags:["Agent","Discovery","CMDB"] },
  { id:"agent_deploy",    category:"Asset & Device", icon:"🤖", title:"AIGO-X Agent Deployment",
    description:"Guided mass deployment of GRC Agent across Windows, Linux, macOS endpoints.",
    steps:6, estimatedDays:2, autoLevel:"semi", color:CYN, tags:["Agent","Windows","Linux","macOS"] },
  // ── Incident Response ──
  { id:"incident_resp", category:"Incident Response", icon:"🚨", title:"Security Incident Response",
    description:"NIST IR lifecycle: detect, triage, contain, eradicate, recover, report and improve.",
    steps:10, estimatedDays:7, autoLevel:"semi", color:RED, tags:["NIST IR","CAPA","Breach Notification"], featured:true },
  { id:"breach_notif",  category:"Incident Response", icon:"📣", title:"Data Breach Notification",
    description:"GDPR/HIPAA breach notification workflow with regulator templates and 72-hour timeline tracking.",
    steps:6, estimatedDays:3, autoLevel:"semi", color:RED, tags:["GDPR","72h","Regulator"] },
];

// ── Detailed step definitions for key workflows ────────────────────────────

interface WfStep {
  id: string;
  title: string;
  icon: string;
  auto: AutoLevel;
  duration: string;
  description: string;
  tasks: { label: string; auto: boolean; done?: boolean }[];
  documents?: string[];
  integrations?: string[];
  template?: string;
  tips?: string[];
}

const AUDIT_STEPS: WfStep[] = [
  { id:"s1", title:"Select Compliance Framework", icon:"🏛", auto:"semi", duration:"~15 min",
    description:"Choose the compliance standard or regulatory framework this audit will assess. The platform will auto-load all associated controls, requirements, evidence templates and checklists.",
    tasks:[
      { label:"Select primary framework (ISO 27001, SOC 2, GDPR, HIPAA, PCI-DSS, NIS2…)", auto:false },
      { label:"Select any secondary/overlapping frameworks", auto:false },
      { label:"Auto-load framework control catalogue", auto:true },
      { label:"Auto-load document templates and checklists", auto:true },
      { label:"Identify framework-specific roles (Lead Auditor, Process Owners)", auto:false },
    ],
    tips:["For ISO 27001 you must cover all 4 mandatory clauses (4–10) plus Annex A","SOC 2 requires a Trust Services Criteria scoping decision first"] },

  { id:"s2", title:"Configure Audit", icon:"⚙", auto:"manual", duration:"~30 min",
    description:"Define audit type, name, objectives, audit period, start/end dates and assign the audit team. This configuration drives all subsequent steps.",
    tasks:[
      { label:"Select audit type (Internal / External / Surveillance / Certification / Gap)", auto:false },
      { label:"Enter audit name and unique reference ID", auto:true },
      { label:"Set audit period and target completion date", auto:false },
      { label:"Assign Lead Auditor and audit team members", auto:false },
      { label:"Assign Management Sponsor", auto:false },
      { label:"Notify assigned team via email", auto:true },
    ],
    documents:["Audit Charter","Audit Plan Template","Team Assignment Form"],
    tips:["Certification audits require an accredited Certification Body (CB)","Surveillance audits typically cover ~⅓ of controls per cycle"] },

  { id:"s3", title:"Define Audit Scope", icon:"🎯", auto:"semi", duration:"~1 hr",
    description:"Identify which systems, departments, locations, processes and data types fall within the audit boundary. Scope decisions directly affect SOA and evidence requirements.",
    tasks:[
      { label:"Define in-scope systems and applications", auto:false },
      { label:"Define in-scope organisational units and locations", auto:false },
      { label:"Auto-import asset inventory from AssetOps", auto:true },
      { label:"Auto-import process register from GovOps", auto:true },
      { label:"Document scope exclusions and justifications", auto:false },
      { label:"Management approval of scope statement", auto:false },
    ],
    documents:["Scope Statement Template","Asset Inventory Export","Process Register"],
    integrations:["AssetOps","GovOps","CloudOps"],
    tips:["ISO 27001 scope must align with the ISMS boundary","Narrow scope = faster audit but risks missing critical areas"] },

  { id:"s4", title:"Statement of Applicability (SOA)", icon:"📋", auto:"semi", duration:"2–4 hrs",
    description:"For each control in the framework, determine applicability, document justification, and record implementation status. The SOA is a mandatory deliverable for ISO 27001 and best practice for all frameworks.",
    tasks:[
      { label:"Auto-populate control list from selected framework", auto:true },
      { label:"Auto-map existing ComplianceOps control statuses", auto:true },
      { label:"Review and confirm each control's applicability (Yes/No)", auto:false },
      { label:"Document inclusion/exclusion justifications", auto:false },
      { label:"Record implementation status (Implemented / Partial / Planned / N/A)", auto:false },
      { label:"Link existing evidence to applicable controls", auto:true },
      { label:"Identify controls with evidence gaps", auto:true },
      { label:"Senior management sign-off on SOA", auto:false },
    ],
    documents:["SOA Template (ISO 27001 Annex A)","SOC 2 TSC Applicability Matrix","Control Implementation Register"],
    integrations:["ComplianceOps","GovOps","RiskOps"],
    template:"ISO 27001 SOA — 114 Annex A controls pre-loaded with applicability columns, justification fields and implementation status dropdowns.",
    tips:["ISO 27001 requires the SOA to be a controlled document","All excluded controls require documented justification"] },

  { id:"s5", title:"Pre-Audit Document Review", icon:"📂", auto:"semi", duration:"2–8 hrs",
    description:"Collect and review all documentation required for the audit. The platform auto-detects linked policies, procedures and records from GovOps and flags gaps against the framework's document requirements.",
    tasks:[
      { label:"Auto-fetch linked policies from GovOps policy register", auto:true },
      { label:"Auto-fetch procedures, work instructions and records", auto:true },
      { label:"Check all mandatory documents against framework checklist", auto:true },
      { label:"Flag missing or expired documents", auto:true },
      { label:"Manually upload any external documents", auto:false },
      { label:"Confirm all documents are current revision and approved", auto:false },
    ],
    documents:["Information Security Policy","ISMS Manual","Risk Assessment Methodology","Business Continuity Plan","Incident Response Plan","Access Control Policy","Asset Management Policy","Supplier Security Policy"],
    integrations:["GovOps","SharePoint","Confluence","Google Drive"],
    tips:["Use the Document Gap Report to prioritise missing items","Documents must show version history and approval signatures"] },

  { id:"s6", title:"Evidence Collection", icon:"🗂", auto:"automated", duration:"Automated + manual review",
    description:"Gather technical and documentary evidence mapped to each applicable control. The AIGO-X Agent and integrations auto-collect the majority of evidence; manual uploads fill remaining gaps.",
    tasks:[
      { label:"Trigger AIGO-X Agent evidence scan across all in-scope endpoints", auto:true },
      { label:"Auto-collect from integrated platforms (AWS, Azure, GCP, Jira, GitHub…)", auto:true },
      { label:"Auto-map collected evidence to applicable SOA controls", auto:true },
      { label:"Generate evidence coverage heatmap", auto:true },
      { label:"Flag controls with insufficient or no evidence", auto:true },
      { label:"Request manual evidence from control owners (auto-notify)", auto:true },
      { label:"Upload and tag manual evidence files", auto:false },
      { label:"Evidence quality review by Lead Auditor", auto:false },
    ],
    documents:["Evidence Collection Checklist","Evidence Register","Screenshot Templates","Log Extracts"],
    integrations:["AIGO-X Agent","AWS","Azure","GCP","Jira","GitHub","Okta","CrowdStrike","Splunk","Qualys"],
    template:"Evidence Register — pre-structured spreadsheet with control ID, evidence type, source, date collected, collector, review status and audit trail.",
    tips:["Evidence must be time-stamped and clearly linked to specific controls","Automated evidence carries stronger weight with external auditors","Aim for ≥2 pieces of evidence per critical control"] },

  { id:"s7", title:"Control Testing", icon:"🧪", auto:"semi", duration:"3–10 days",
    description:"Test each applicable control using appropriate audit procedures: inquiry, observation, inspection and re-performance. AI suggests test procedures based on the framework and control type.",
    tasks:[
      { label:"AI-generate test procedures for each applicable control", auto:true },
      { label:"Execute Inquiry tests (interviews with control owners)", auto:false },
      { label:"Execute Observation tests (watch processes in action)", auto:false },
      { label:"Execute Inspection tests (examine records and settings)", auto:false },
      { label:"Execute Re-performance tests (independently reproduce control)", auto:false },
      { label:"Record test results (Pass / Fail / Partial) per control", auto:false },
      { label:"Auto-calculate control coverage score", auto:true },
      { label:"Flag failed controls for findings workflow", auto:true },
    ],
    documents:["Test Procedure Templates","Interview Guide","Observation Checklist","Sampling Methodology"],
    integrations:["ComplianceOps","RiskOps","AIGO-X Agent"],
    tips:["Sample size should follow audit sampling standards (e.g. ISACA)","Document your test rationale — auditors will be questioned on methodology","Re-performance is the strongest form of evidence but most time-consuming"] },

  { id:"s8", title:"Findings & Non-Conformities", icon:"⚠", auto:"semi", duration:"1–3 days",
    description:"Classify and document all audit findings including non-conformities (Major/Minor), observations and opportunities for improvement. Findings automatically create risk register entries and CAPA tasks.",
    tasks:[
      { label:"Auto-flag failed controls as potential findings", auto:true },
      { label:"Classify each finding: Major NC / Minor NC / Observation / OFI", auto:false },
      { label:"Document objective evidence for each finding", auto:false },
      { label:"Reference applicable clause/control for each finding", auto:false },
      { label:"Auto-create RiskOps risk entries for non-conformities", auto:true },
      { label:"Assign CAPA owners and due dates", auto:false },
      { label:"Auto-notify finding owners via email and ServiceOps ticket", auto:true },
      { label:"Management acknowledgement of findings", auto:false },
    ],
    documents:["Non-Conformity Report Template","CAPA Form","Finding Log","Objective Evidence Record"],
    integrations:["RiskOps","ServiceOps","GovOps"],
    template:"Non-Conformity Report — structured template with finding reference, clause/control citation, objective evidence, root cause field, and CAPA tracking columns.",
    tips:["Major NC = systemic failure; Minor NC = isolated lapse","Observations are not mandatory to fix but should be addressed","Link each finding to its root cause — not just the symptom"] },

  { id:"s9", title:"Audit Report Generation", icon:"📊", auto:"semi", duration:"4–8 hrs",
    description:"AI drafts the full audit report including executive summary, scope, methodology, findings summary and recommendations. The Lead Auditor reviews and finalises before submission.",
    tasks:[
      { label:"AI-generate executive summary from audit data", auto:true },
      { label:"Auto-populate scope, team and methodology sections", auto:true },
      { label:"AI-draft findings section with all NC details", auto:true },
      { label:"Generate visual compliance scorecard and heatmap", auto:true },
      { label:"Review and edit AI-generated draft", auto:false },
      { label:"Add auditor commentary and recommendations", auto:false },
      { label:"Quality review by second auditor (four-eyes)", auto:false },
      { label:"Finalise report version and apply digital signature", auto:false },
    ],
    documents:["Audit Report Template","Executive Summary Template","Compliance Scorecard","Findings Matrix"],
    template:"Full audit report template with pre-populated sections: Cover Page, Management Summary, Scope & Objectives, Methodology, Compliance Status by Domain, Detailed Findings, Recommendations, Appendices.",
    tips:["Executive summary should be max 1 page — written for the board","Include trend analysis if this is a repeat audit","Attach the SOA as Annex A to the report"] },

  { id:"s10", title:"Management Review", icon:"👔", auto:"semi", duration:"1–2 days",
    description:"Present audit findings to senior management for formal review and decision-making on CAPA prioritisation, resource allocation and risk acceptance. This is a mandatory ISO 27001 requirement.",
    tasks:[
      { label:"Schedule management review meeting", auto:false },
      { label:"Auto-generate management review presentation from report", auto:true },
      { label:"Distribute draft report to stakeholders (T-48h)", auto:true },
      { label:"Conduct management review meeting", auto:false },
      { label:"Record management decisions and resource commitments", auto:false },
      { label:"Management sign-off on CAPA action plan", auto:false },
      { label:"Update risk register with management decisions", auto:true },
    ],
    documents:["Management Review Agenda","Board Presentation Template","CAPA Action Plan","Minutes Template"],
    tips:["ISO 27001 Clause 9.3 mandates documented management review","Board must confirm resource availability for all CAPA items","Record all management decisions — auditors will request minutes"] },

  { id:"s11", title:"CAPA & Remediation Tracking", icon:"🔧", auto:"semi", duration:"Ongoing",
    description:"Track corrective and preventive actions (CAPAs) through to verified closure. Automated reminders, escalations and progress reporting keep CAPAs on track.",
    tasks:[
      { label:"Auto-create ServiceOps tickets for all CAPA items", auto:true },
      { label:"Assign CAPA owners and verification owners", auto:false },
      { label:"Set milestone dates and escalation thresholds", auto:false },
      { label:"Automated weekly CAPA status reminders to owners", auto:true },
      { label:"Escalate overdue CAPAs to management (auto)", auto:true },
      { label:"CAPA owner submits closure evidence", auto:false },
      { label:"Verification owner confirms effective closure", auto:false },
      { label:"Auto-update control status upon CAPA closure", auto:true },
    ],
    documents:["CAPA Tracking Register","Closure Evidence Template","Effectiveness Review Checklist"],
    integrations:["ServiceOps","RiskOps","ComplianceOps"],
    tips:["CAPA effectiveness must be verified — not just 'completed'","Set 30/60/90-day milestones for complex CAPAs","Systemic issues require root cause analysis (RCA) before CAPA design"] },

  { id:"s12", title:"Audit Closure & Archival", icon:"✅", auto:"semi", duration:"1 day",
    description:"Formally close the audit, distribute the final report, archive all working papers, update the compliance posture and schedule the next audit cycle.",
    tasks:[
      { label:"Confirm all mandatory deliverables are complete", auto:true },
      { label:"Final report formally issued to auditee", auto:false },
      { label:"Submit report to certification body (if applicable)", auto:false },
      { label:"Archive all audit working papers and evidence", auto:true },
      { label:"Update ComplianceOps framework posture scores", auto:true },
      { label:"Update GRC dashboard metrics", auto:true },
      { label:"Schedule next audit or surveillance review", auto:false },
      { label:"Conduct audit team retrospective / lessons learned", auto:false },
      { label:"Distribute lessons learned to wider team", auto:true },
    ],
    integrations:["ComplianceOps","GovOps","RiskOps"],
    tips:["Working papers must be retained per framework requirements (ISO: 3 yrs min)","Update the SOA immediately if scope or controls changed during audit","Certificate issuance timelines vary by CB — plan 2–4 weeks"] },
];

const POLICY_STEPS: WfStep[] = [
  { id:"p1", title:"Source the Policy", icon:"📥", auto:"semi", duration:"~30 min",
    description:"Choose how to create the policy: use a built-in template, generate with AI wizard, or import an existing document.",
    tasks:[
      { label:"Choose source: Template Library / AI Wizard / Import", auto:false },
      { label:"Select relevant framework for template filter", auto:false },
      { label:"AI wizard: answer guided questions to generate draft", auto:true },
      { label:"Import: upload .docx / .pdf file", auto:false },
      { label:"Auto-classify policy type and assign metadata", auto:true },
    ],
    documents:["150+ Policy Templates","AI Policy Generation Wizard"],
    tips:["AI wizard produces ISO 27001-aligned policies out of the box","Imported policies are auto-parsed for completeness gaps"] },
  { id:"p2", title:"AI Assessment & Enhancement", icon:"◆", auto:"automated", duration:"~5 min",
    description:"AI automatically assesses the draft policy against chosen framework requirements, identifies gaps, and suggests improvements.",
    tasks:[
      { label:"AI scans policy against selected framework requirements", auto:true },
      { label:"Gap report generated: missing clauses highlighted", auto:true },
      { label:"AI suggests specific content additions and rewrites", auto:true },
      { label:"Review and accept/reject AI suggestions", auto:false },
      { label:"Apply accepted suggestions to policy draft", auto:true },
    ] },
  { id:"p3", title:"Internal Review", icon:"👀", auto:"semi", duration:"1–3 days",
    description:"Route the draft policy to subject matter experts for technical review before formal approval.",
    tasks:[
      { label:"Assign reviewers (CISO, Legal, Compliance Officer)", auto:false },
      { label:"Auto-notify reviewers with review deadline", auto:true },
      { label:"Reviewers add inline comments", auto:false },
      { label:"Policy owner resolves comments", auto:false },
      { label:"Confirm review complete", auto:false },
    ] },
  { id:"p4", title:"Approval Workflow", icon:"✍", auto:"semi", duration:"1–5 days",
    description:"Route the reviewed policy through the configured approval chain. Approvals are logged with timestamp and digital signature.",
    tasks:[
      { label:"Apply approval profile (default or custom)", auto:false },
      { label:"Auto-notify approvers in sequence", auto:true },
      { label:"Approver 1: CISO review and sign-off", auto:false },
      { label:"Approver 2: Management / Board sign-off", auto:false },
      { label:"Auto-log approvals with timestamp to audit trail", auto:true },
      { label:"Notify policy owner upon full approval", auto:true },
    ] },
  { id:"p5", title:"Publish & Version Control", icon:"🚀", auto:"semi", duration:"~15 min",
    description:"Publish the approved policy, assign a version number, set the next review date, and make it accessible in the policy portal.",
    tasks:[
      { label:"Auto-assign version number (e.g. v1.0)", auto:true },
      { label:"Set effective date and next review date", auto:false },
      { label:"Publish to policy portal", auto:true },
      { label:"Archive previous version with retention tag", auto:true },
      { label:"Notify all users of new/updated policy", auto:true },
    ] },
  { id:"p6", title:"Employee Assignment", icon:"📤", auto:"semi", duration:"~30 min",
    description:"Assign the policy to employees for acknowledgement — bulk to all, by department, by role, or individually.",
    tasks:[
      { label:"Select assignment scope: All / Department / Role / Individual", auto:false },
      { label:"Set acknowledgement deadline", auto:false },
      { label:"Auto-send acknowledgement requests", auto:true },
      { label:"Track acknowledgement status in PeopleOps", auto:true },
      { label:"Auto-remind non-acknowledged employees (T+3, T+7)", auto:true },
      { label:"Escalate to manager for persistent non-acknowledgement", auto:true },
    ] },
  { id:"p7", title:"Compliance Mapping", icon:"🗺", auto:"automated", duration:"~5 min",
    description:"Auto-map the approved policy to applicable compliance controls across all active frameworks.",
    tasks:[
      { label:"AI maps policy to applicable framework controls", auto:true },
      { label:"Update ComplianceOps control evidence register", auto:true },
      { label:"Flag controls now evidenced by this policy", auto:true },
      { label:"Review and confirm mapping accuracy", auto:false },
    ] },
  { id:"p8", title:"Monitor & Schedule Review", icon:"📅", auto:"automated", duration:"Ongoing",
    description:"Set up automated monitoring for policy validity and schedule the next review cycle.",
    tasks:[
      { label:"Set annual review reminder (T-60 days auto-notify)", auto:true },
      { label:"Monitor for regulatory changes that may require update", auto:true },
      { label:"AI flags if linked framework controls are updated", auto:true },
      { label:"Dashboard shows days until next policy review", auto:true },
    ] },
];

const RISK_STEPS: WfStep[] = [
  { id:"r1", title:"Define Scope & Context", icon:"🎯", auto:"manual", duration:"~2 hrs",
    description:"Establish the internal and external context for the risk assessment per ISO 27005 / ISO 31000.",
    tasks:[
      { label:"Define risk assessment scope and boundaries", auto:false },
      { label:"Identify stakeholders and risk owners", auto:false },
      { label:"Document risk acceptance criteria", auto:false },
      { label:"Select risk scoring methodology (qualitative / quantitative)", auto:false },
    ] },
  { id:"r2", title:"Asset Identification", icon:"⬡", auto:"semi", duration:"~4 hrs",
    description:"Identify and classify all assets within scope that could be affected by information security risks.",
    tasks:[
      { label:"Auto-import asset inventory from AssetOps", auto:true },
      { label:"Auto-classify assets by criticality", auto:true },
      { label:"Manually add assets not in CMDB", auto:false },
      { label:"Assign asset owners", auto:false },
    ],
    integrations:["AssetOps","CloudOps","AIGO-X Agent"] },
  { id:"r3", title:"Threat & Vulnerability Identification", icon:"⚡", auto:"semi", duration:"1–2 days",
    description:"Identify relevant threats and associated vulnerabilities for each asset using MITRE ATT&CK and CVE databases.",
    tasks:[
      { label:"Auto-load MITRE ATT&CK threat catalogue", auto:true },
      { label:"Import vulnerability scan data from SecOps", auto:true },
      { label:"Map threats to assets", auto:false },
      { label:"Map vulnerabilities to threats", auto:false },
    ],
    integrations:["SecOps","CloudOps","Qualys","Tenable"] },
  { id:"r4", title:"Impact & Likelihood Analysis", icon:"📊", auto:"semi", duration:"1–2 days",
    description:"Assess the potential impact and likelihood of each risk scenario materialising.",
    tasks:[
      { label:"Score likelihood (1–5) for each risk scenario", auto:false },
      { label:"Score impact (1–5) on Confidentiality, Integrity, Availability", auto:false },
      { label:"Auto-calculate inherent risk score", auto:true },
      { label:"Validate scores with asset owners", auto:false },
    ] },
  { id:"r5", title:"Risk Evaluation", icon:"⚖", auto:"semi", duration:"~4 hrs",
    description:"Evaluate risks against acceptance criteria and prioritise for treatment.",
    tasks:[
      { label:"Auto-compare risk scores against acceptance thresholds", auto:true },
      { label:"Generate risk heat map", auto:true },
      { label:"Prioritise risks requiring treatment", auto:true },
      { label:"Management review of prioritised risk list", auto:false },
    ] },
  { id:"r6", title:"Risk Treatment Planning", icon:"🔧", auto:"semi", duration:"2–5 days",
    description:"Select and plan treatment options for risks above the acceptance threshold: mitigate, transfer, avoid, accept.",
    tasks:[
      { label:"Select treatment option per risk (Mitigate/Transfer/Avoid/Accept)", auto:false },
      { label:"AI suggest controls for mitigation", auto:true },
      { label:"Map selected controls to ComplianceOps", auto:true },
      { label:"Assign treatment owners and deadlines", auto:false },
      { label:"Management approval of treatment plan", auto:false },
    ] },
  { id:"r7", title:"Implement & Monitor", icon:"📈", auto:"automated", duration:"Ongoing",
    description:"Track control implementation and residual risk levels. Automated alerts when risks exceed thresholds.",
    tasks:[
      { label:"Auto-create ServiceOps tasks for treatment actions", auto:true },
      { label:"Track residual risk after control implementation", auto:true },
      { label:"Alert when risk score exceeds acceptance threshold", auto:true },
      { label:"Quarterly automated risk score recalculation", auto:true },
    ] },
  { id:"r8", title:"Risk Review & Reporting", icon:"📋", auto:"semi", duration:"~1 day",
    description:"Periodic formal review and board-level risk reporting.",
    tasks:[
      { label:"AI-generate risk report and trend analysis", auto:true },
      { label:"Review with risk committee", auto:false },
      { label:"Update risk acceptance decisions", auto:false },
      { label:"Publish to AnalyticsOps dashboard", auto:true },
    ] },
];

const INCIDENT_STEPS: WfStep[] = [
  { id:"i1", title:"Detection & Identification", icon:"🔍", auto:"automated", duration:"Minutes",
    description:"Detect and confirm a security incident through alerts, SIEM, user reports or threat intelligence.",
    tasks:[
      { label:"Receive alert from SIEM / EDR / CSPM", auto:true },
      { label:"Auto-create Incident record in ServiceOps", auto:true },
      { label:"Initial triage: confirm if genuine incident or false positive", auto:false },
      { label:"Assign severity: P1 Critical / P2 High / P3 Medium / P4 Low", auto:false },
    ],
    integrations:["SecOps","ServiceOps","Splunk","CrowdStrike","Sentinel"] },
  { id:"i2", title:"Triage & Initial Assessment", icon:"📊", auto:"semi", duration:"~1 hr",
    description:"Assess the incident scope, affected systems, attack vector and preliminary impact.",
    tasks:[
      { label:"Identify affected systems and users", auto:false },
      { label:"Auto-query AssetOps for affected asset details", auto:true },
      { label:"Determine attack vector and initial indicators of compromise (IoCs)", auto:false },
      { label:"Assess potential data exposure (PII, confidential, regulated)", auto:false },
      { label:"Notify Incident Response Team", auto:true },
    ] },
  { id:"i3", title:"Containment", icon:"🛑", auto:"semi", duration:"1–4 hrs",
    description:"Stop the spread of the incident and isolate affected systems to prevent further damage.",
    tasks:[
      { label:"Isolate affected endpoints (via EDR)", auto:false },
      { label:"Block malicious IPs / domains at firewall", auto:false },
      { label:"Revoke compromised credentials immediately", auto:false },
      { label:"Preserve forensic evidence before remediation", auto:false },
      { label:"Document all containment actions with timestamp", auto:true },
    ] },
  { id:"i4", title:"Evidence Preservation", icon:"🗂", auto:"semi", duration:"1–2 hrs",
    description:"Capture and preserve forensic evidence for investigation, legal proceedings and regulator notifications.",
    tasks:[
      { label:"Capture system memory and disk images", auto:false },
      { label:"Export and preserve relevant logs", auto:true },
      { label:"Document chain of custody", auto:false },
      { label:"Store evidence in tamper-evident archive", auto:true },
    ] },
  { id:"i5", title:"Eradication", icon:"🧹", auto:"semi", duration:"4–24 hrs",
    description:"Remove the root cause of the incident — malware, vulnerabilities, unauthorised access.",
    tasks:[
      { label:"Identify and remove malware / backdoors", auto:false },
      { label:"Patch exploited vulnerabilities", auto:false },
      { label:"Reset all potentially compromised credentials", auto:false },
      { label:"Verify eradication via scan", auto:true },
    ] },
  { id:"i6", title:"Recovery", icon:"🔄", auto:"semi", duration:"4–48 hrs",
    description:"Restore affected systems to normal operation from clean backups and verify integrity.",
    tasks:[
      { label:"Restore from verified clean backup", auto:false },
      { label:"Verify system integrity before reconnecting", auto:false },
      { label:"Monitor closely for 24–72h post-recovery", auto:true },
      { label:"Confirm business operations restored", auto:false },
    ] },
  { id:"i7", title:"Regulatory Notification", icon:"📣", auto:"semi", duration:"Within 72 hrs (GDPR)",
    description:"Assess breach notification obligations and notify regulators, data subjects and partners as required.",
    tasks:[
      { label:"AI-assess notification obligations (GDPR 72h, HIPAA 60d, NIS2 24h)", auto:true },
      { label:"Generate regulator notification draft (auto-template)", auto:true },
      { label:"Legal / DPO review of notification", auto:false },
      { label:"Submit notification to regulator", auto:false },
      { label:"Notify affected data subjects if required", auto:false },
      { label:"Log notification with timestamp to audit trail", auto:true },
    ],
    documents:["GDPR Breach Notification Template (72h)","HIPAA Breach Notification Letter","Data Subject Notification Template"],
    template:"Pre-built GDPR Article 33 notification template with all required fields: nature of breach, categories/volumes of data, likely consequences, measures taken." },
  { id:"i8", title:"Post-Incident Review", icon:"🔍", auto:"semi", duration:"1–2 days",
    description:"Conduct a blameless post-incident review to understand what happened, why, and how to prevent recurrence.",
    tasks:[
      { label:"Schedule post-incident review (within 5 business days)", auto:true },
      { label:"AI-generate timeline from incident log", auto:true },
      { label:"Identify root cause(s) using 5-Whys or fishbone", auto:false },
      { label:"Document contributing factors", auto:false },
      { label:"Identify what worked well and what didn't", auto:false },
    ] },
  { id:"i9", title:"Incident Report", icon:"📊", auto:"semi", duration:"~4 hrs",
    description:"Produce the formal incident report for management, regulators and insurance purposes.",
    tasks:[
      { label:"AI-draft incident report from collected data", auto:true },
      { label:"Review and edit draft", auto:false },
      { label:"Management sign-off", auto:false },
      { label:"Distribute to relevant stakeholders", auto:true },
      { label:"File in evidence archive", auto:true },
    ],
    documents:["Incident Report Template","Executive Summary Template","Technical Findings Appendix"] },
  { id:"i10", title:"Lessons Learned & Improvement", icon:"📈", auto:"semi", duration:"1–2 days",
    description:"Convert lessons learned into concrete improvement actions — new controls, updated procedures, additional training.",
    tasks:[
      { label:"Document lessons learned in GovOps knowledge base", auto:true },
      { label:"Create CAPA items for identified gaps", auto:false },
      { label:"Update Incident Response Plan", auto:false },
      { label:"Schedule follow-up training if required", auto:false },
      { label:"Update risk register with new/modified risks", auto:true },
    ],
    integrations:["GovOps","RiskOps","ComplianceOps","PeopleOps"] },
];

const ASSET_STEPS: WfStep[] = [
  { id:"a1", title:"Deployment Planning", icon:"📐", auto:"manual", duration:"~2 hrs",
    description:"Plan the AIGO-X Agent rollout — identify target endpoints, deployment method, and communication plan.",
    tasks:[
      { label:"Import endpoint list from existing MDM / SCCM / Intune", auto:true },
      { label:"Identify deployment method per OS group (MSI/PKG/DEB/RPM/GPO/MDM)", auto:false },
      { label:"Select target groups for phased rollout", auto:false },
      { label:"Communicate planned maintenance window to stakeholders", auto:false },
    ] },
  { id:"a2", title:"Agent Installation", icon:"🤖", auto:"automated", duration:"~1 hr (bulk)",
    description:"Deploy AIGO-X Agent to endpoints using chosen deployment method. Supports Windows, Linux, macOS.",
    tasks:[
      { label:"Generate tenant-specific deployment package (auto)", auto:true },
      { label:"Deploy via GPO (Windows Domain)", auto:false },
      { label:"Deploy via Intune/JAMF (MDM)", auto:false },
      { label:"Deploy via Ansible/Chef/Puppet (Linux)", auto:false },
      { label:"Monitor deployment progress in real-time", auto:true },
    ],
    integrations:["Microsoft Intune","JAMF","Ansible","GPO","SCCM"] },
  { id:"a3", title:"Asset Discovery", icon:"🔍", auto:"automated", duration:"1–4 hrs",
    description:"Agents perform comprehensive inventory collection — hardware, software, network config, security posture.",
    tasks:[
      { label:"Collect hardware inventory (CPU, RAM, storage, network adapters)", auto:true },
      { label:"Collect installed software inventory", auto:true },
      { label:"Collect OS version, patch level, configuration baseline", auto:true },
      { label:"Collect running services and open ports", auto:true },
      { label:"Discover sensitive data presence (DataOps integration)", auto:true },
      { label:"Collect compliance posture (benchmark results)", auto:true },
    ] },
  { id:"a4", title:"Asset Classification", icon:"🏷", auto:"semi", duration:"~2 hrs",
    description:"Classify discovered assets as Managed or Unmanaged based on agent status, and by criticality, type and owner.",
    tasks:[
      { label:"Auto-classify: Agent installed = Managed; no agent = Unmanaged", auto:true },
      { label:"AI-classify asset type (server/workstation/IoT/cloud/container)", auto:true },
      { label:"AI-classify criticality based on data sensitivity and role", auto:true },
      { label:"Manually assign business owners for critical assets", auto:false },
      { label:"Create Device Groups (by site/BU/OS/criticality)", auto:false },
    ] },
  { id:"a5", title:"Enrichment & Correlation", icon:"⚡", auto:"automated", duration:"~1 hr",
    description:"Enrich asset data with vulnerability scan results, cloud metadata, network context and threat intelligence.",
    tasks:[
      { label:"Correlate with vulnerability scanner results (Qualys/Tenable/Nessus)", auto:true },
      { label:"Enrich cloud assets with cloud provider metadata", auto:true },
      { label:"Map assets to network segments and locations", auto:true },
      { label:"AI risk-score each asset based on exposure and criticality", auto:true },
    ],
    integrations:["Qualys","Tenable","AWS","Azure","GCP","Shodan"] },
  { id:"a6", title:"AssetOps Sync", icon:"🔄", auto:"automated", duration:"~30 min",
    description:"Synchronise all discovered and enriched asset data to AssetOps CMDB and downstream modules.",
    tasks:[
      { label:"Sync to AssetOps CMDB", auto:true },
      { label:"Push relevant data to SecOps (vulnerability posture)", auto:true },
      { label:"Push compliance posture data to ComplianceOps", auto:true },
      { label:"Push sensitive data findings to DataOps", auto:true },
      { label:"Update risk scores in RiskOps for affected assets", auto:true },
    ] },
  { id:"a7", title:"Continuous Monitoring", icon:"📡", auto:"automated", duration:"Ongoing",
    description:"Set up continuous monitoring — new asset alerts, config drift detection, compliance status changes.",
    tasks:[
      { label:"Configure new asset discovery alerts", auto:true },
      { label:"Configure configuration drift detection", auto:true },
      { label:"Set compliance benchmark monitoring schedule", auto:true },
      { label:"Schedule regular agent health checks", auto:true },
      { label:"Dashboard: live unmanaged asset count", auto:true },
    ] },
];

// Step content for other workflows (summary level)
const STEP_MAP: Record<string, WfStep[]> = {
  audit_exec:    AUDIT_STEPS,
  policy_lifecycle: POLICY_STEPS,
  risk_assess:   RISK_STEPS,
  incident_resp: INCIDENT_STEPS,
  asset_discovery: ASSET_STEPS,
};

// ── Active workflow state type ─────────────────────────────────────────────
interface ActiveWorkflow {
  def: WorkflowDef;
  currentStep: number;
  stepStatuses: Record<string, "pending"|"in_progress"|"done"|"skipped">;
  taskChecks: Record<string, boolean>;
  startedAt: string;
  // Audit-specific config
  selectedFramework?: string;
  auditType?: string;
  auditName?: string;
  // Policy config
  policySource?: string;
  // Risk config
  riskScope?: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function AutoBadge({ level, small }: { level: AutoLevel; small?: boolean }) {
  const cfg = {
    manual:    { color:"var(--muted-foreground)", bg:"rgba(148,163,184,0.1)", label:"Manual",    icon:"👤" },
    semi:      { color:AMB,  bg:"rgba(252,211,77,0.1)",  label:"Semi-Auto", icon:"⚡" },
    automated: { color:EME,  bg:"rgba(52,211,153,0.1)",  label:"Automated", icon:"🤖" },
  }[level];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:small?9:10, fontWeight:700,
      padding: small?"1px 5px":"2px 8px", borderRadius:4, color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.color}30` }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StepStatusDot({ status }: { status:"pending"|"in_progress"|"done"|"skipped" }) {
  const col = { pending:"var(--muted-foreground)", in_progress:AMB, done:EME, skipped:"rgba(148,163,184,0.25)" }[status];
  return <div style={{ width:10, height:10, borderRadius:"50%", background:col, flexShrink:0,
    boxShadow: status==="in_progress" ? `0 0 8px ${AMB}80` : status==="done" ? `0 0 6px ${EME}60` : "none" }} />;
}

function ProgressBar({ pct, color=EME, trackColor="var(--border)" }: { pct:number; color?: string; trackColor?: string }) {
  return (
    <div style={{ height:4, background:trackColor, borderRadius:2, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2, transition:"width 0.4s ease" }} />
    </div>
  );
}

// ── Workflow Catalog Card ──────────────────────────────────────────────────
function WfCard({ wf, onStart }: { wf: WorkflowDef; onStart: () => void }) {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);
  const c = mkC(isDark);
  return (
    <div style={{ ...c({ padding:"18px 20px" }), display:"flex", flexDirection:"column", gap:12,
      transition:"border-color 0.15s", cursor:"pointer",
      borderColor: wf.featured ? `${wf.color}30` : T.border }}
      onClick={onStart}
      onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor=`${wf.color}50`; }}
      onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor=wf.featured?`${wf.color}30`:T.border; }}>

      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:`${wf.color}15`,
          border:`1px solid ${wf.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
          {wf.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, fontWeight:800, color:T.text }}>{wf.title}</span>
            {wf.featured && <span style={{ fontSize:9, fontWeight:800, color:ORG, background:"rgba(251,146,60,0.12)", borderRadius:4, padding:"1px 5px", border:`1px solid ${ORG}30` }}>FEATURED</span>}
            <AutoBadge level={wf.autoLevel} small />
          </div>
          <div style={{ fontSize:11, color:T.muted, lineHeight:1.45 }}>{wf.description}</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {wf.tags.map(t => (
          <span key={t} style={{ fontSize:9, padding:"2px 7px", borderRadius:4,
            background:T.tagBg, color:T.muted, border:`1px solid ${T.tagBdr}` }}>
            {t}
          </span>
        ))}
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:6, borderTop:`1px solid ${T.sep}` }}>
        <div style={{ display:"flex", gap:14 }}>
          <span style={{ fontSize:10, color:T.muted }}>
            <span style={{ color:wf.color, fontWeight:700 }}>{wf.steps}</span> steps
          </span>
          <span style={{ fontSize:10, color:T.muted }}>
            ~<span style={{ color:wf.color, fontWeight:700 }}>{wf.estimatedDays}</span>{wf.estimatedDays===1?" day":" days"}
          </span>
        </div>
        <button style={{ ...btn(wf.color, `${wf.color}15`), padding:"4px 14px", fontSize:10 }}
          onClick={e=>{ e.stopPropagation(); onStart(); }}>
          Start ▶
        </button>
      </div>
    </div>
  );
}

// ── Workflow Step Detail Panel ─────────────────────────────────────────────
function StepPanel({ wf, step, stepIdx, totalSteps, taskChecks, onToggleTask, onNext, onPrev, onMarkDone, isLast }:{
  wf: WorkflowDef; step: WfStep; stepIdx: number; totalSteps: number;
  taskChecks: Record<string, boolean>;
  onToggleTask:(k:string)=>void;
  onNext:()=>void; onPrev:()=>void; onMarkDone:()=>void;
  isLast:boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);
  const c = mkC(isDark);
  const doneCount = step.tasks.filter(t => taskChecks[`${step.id}:${t.label}`]).length;
  const pct = step.tasks.length > 0 ? Math.round(doneCount/step.tasks.length*100) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, flex:1, minHeight:0, overflowY:"auto" }}>
      {/* Step header */}
      <div style={{ ...c({ padding:"18px 20px" }) }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:`${wf.color}15`, border:`1px solid ${wf.color}30`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{step.icon}</div>
            <div>
              <div style={{ fontSize:11, color:T.muted2, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:2 }}>Step {stepIdx+1} of {totalSteps}</div>
              <div style={{ fontSize:16, fontWeight:800, color:T.text }}>{step.title}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <AutoBadge level={step.auto} />
            <span style={{ fontSize:10, color:T.muted2 }}>{step.duration}</span>
          </div>
        </div>
        <div style={{ fontSize:12, color:T.muted, lineHeight:1.6, marginBottom:10 }}>{step.description}</div>
        <div style={{ height:4, background:T.pbBg, borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, background:wf.color, borderRadius:2, transition:"width 0.4s ease" }} />
        </div>
        <div style={{ fontSize:10, color:T.muted2, marginTop:5 }}>{doneCount}/{step.tasks.length} tasks complete</div>
      </div>

      {/* Tasks checklist */}
      <div style={{ ...c({ padding:"0" }), overflow:"hidden" }}>
        <div style={{ padding:"12px 16px 10px", borderBottom:`1px solid ${T.sep}`, fontSize:10, fontWeight:800, letterSpacing:"0.08em", color:T.muted, textTransform:"uppercase" }}>
          Tasks & Checklist
        </div>
        <div>
          {step.tasks.map((task, ti) => {
            const key = `${step.id}:${task.label}`;
            const checked = !!taskChecks[key];
            return (
              <div key={ti} onClick={()=>onToggleTask(key)}
                style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 16px", cursor:"pointer",
                  borderBottom:`1px solid ${T.sep}`,
                  background: checked ? "rgba(52,211,153,0.04)" : "transparent",
                  transition:"background 0.12s" }}
                onMouseEnter={e=>{ if(!checked)(e.currentTarget as HTMLDivElement).style.background=T.hoverBg; }}
                onMouseLeave={e=>{ if(!checked)(e.currentTarget as HTMLDivElement).style.background="transparent"; }}>
                <div style={{ width:18, height:18, borderRadius:4, border:`1.5px solid ${checked?EME:T.muted}`,
                  background: checked ? EME : "transparent", display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink:0, marginTop:1, transition:"all 0.15s" }}>
                  {checked && <span style={{ fontSize:10, color:"rgb(10,20,15)" }}>✓</span>}
                </div>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:12, color: checked ? T.muted2 : T.textSub,
                    textDecoration: checked?"line-through":"none", lineHeight:1.4 }}>{task.label}</span>
                </div>
                {task.auto && <span title="Automated" style={{ fontSize:10, color:EME, background:"rgba(52,211,153,0.1)", borderRadius:3, padding:"1px 5px", flexShrink:0 }}>🤖 Auto</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Documents */}
      {step.documents && step.documents.length > 0 && (
        <div style={{ ...c({ padding:"14px 16px" }) }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.07em", color:T.muted, textTransform:"uppercase", marginBottom:10 }}>Required Documents</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {step.documents.map(d => (
              <button key={d} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:6,
                border:"1px solid rgba(147,197,253,0.25)", background:"rgba(147,197,253,0.08)", color:NAV,
                fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                📄 {d}
              </button>
            ))}
          </div>
          {step.template && (
            <div style={{ marginTop:10, padding:"10px 12px", borderRadius:7, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.2)" }}>
              <div style={{ fontSize:10, fontWeight:700, color:EME, marginBottom:4 }}>📋 Available Template</div>
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.4 }}>{step.template}</div>
              <button style={{ ...btn(EME,"rgba(52,211,153,0.1)"), marginTop:8, padding:"4px 12px", fontSize:10 }}>Download Template ↓</button>
            </div>
          )}
        </div>
      )}

      {/* Integrations */}
      {step.integrations && step.integrations.length > 0 && (
        <div style={{ ...c({ padding:"14px 16px" }) }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.07em", color:T.muted, textTransform:"uppercase", marginBottom:10 }}>Auto-collect from Integrations</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {step.integrations.map(i => (
              <span key={i} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 9px", borderRadius:5,
                border:"1px solid rgba(52,211,153,0.2)", background:"rgba(52,211,153,0.07)", color:EME, fontSize:10, fontWeight:600 }}>
                🔗 {i}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {step.tips && step.tips.length > 0 && (
        <div style={{ ...c({ padding:"14px 16px" }), borderColor:"rgba(252,211,77,0.2)", background:"rgba(252,211,77,0.04)" }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.07em", color:AMB, textTransform:"uppercase", marginBottom:8 }}>💡 Auditor Tips</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {step.tips.map((tip, i) => (
              <div key={i} style={{ display:"flex", gap:8, fontSize:11, color:T.muted, lineHeight:1.4 }}>
                <span style={{ color:AMB, flexShrink:0 }}>→</span> {tip}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display:"flex", gap:10, justifyContent:"space-between", alignItems:"center", paddingTop:4 }}>
        <button onClick={onPrev} disabled={stepIdx===0}
          style={{ padding:"8px 18px", borderRadius:7, border:`1px solid ${T.border}`, background:"transparent",
            color: stepIdx===0 ? T.muted2 : T.textSub, fontSize:12, fontWeight:700, cursor:stepIdx===0?"not-allowed":"pointer", fontFamily:"inherit" }}>
          ← Previous
        </button>
        <div style={{ display:"flex", gap:8 }}>
          {pct < 100 && (
            <button onClick={onMarkDone} style={{ ...btn(AMB,"rgba(252,211,77,0.1)"), padding:"8px 16px", fontSize:11 }}>
              Mark Step Done →
            </button>
          )}
          <button onClick={isLast ? onMarkDone : onNext}
            style={{ ...btn(isLast?EME:NAV, isLast?"rgba(52,211,153,0.1)":"rgba(147,197,253,0.1)"), padding:"8px 18px", fontSize:12 }}>
            {isLast ? "✅ Complete Workflow" : "Next Step →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Framework Detail Panel ────────────────────────────────────────────────
function FrameworkDetailPanel({ fw, onBack }: { fw: RegionalFramework; onBack: () => void }) {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);
  const c = mkC(isDark);
  const detail = getFrameworkDetail(fw.id);
  const [activeTab, setActiveTab] = useState<"overview"|"impl"|"checklist"|"templates">("overview");
  const [checkDone, setCheckDone] = useState<Record<string, boolean>>({});
  const [uploads, setUploads] = useState<Record<string, string[]>>({});
  const [expandedPhase, setExpandedPhase] = useState<number>(1);

  const totalItems = detail.auditChecklist.reduce((n, d) => n + d.items.length, 0);
  const doneItems = Object.values(checkDone).filter(Boolean).length;
  const checkPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  function toggleCheck(key: string) {
    setCheckDone(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function toggleDomain(domain: string, items: string[]) {
    const allDone = items.every(item => checkDone[`${domain}::${item}`]);
    const next: Record<string, boolean> = { ...checkDone };
    items.forEach(item => { next[`${domain}::${item}`] = !allDone; });
    setCheckDone(next);
  }
  function handleUpload(tmplName: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map(f => f.name);
    setUploads(prev => ({ ...prev, [tmplName]: [...(prev[tmplName] ?? []), ...names] }));
  }
  function removeUpload(tmplName: string, idx: number) {
    setUploads(prev => ({ ...prev, [tmplName]: (prev[tmplName] ?? []).filter((_, i) => i !== idx) }));
  }

  const typeColor: Record<string, string> = {
    policy:"#93C5FD", form:"#FCD34D", checklist:"#34D399", report:"#C4B5FD",
    plan:"#FB923C", register:"#67E8F9", procedure:"#F87171", assessment:"#A78BFA",
  };

  const TABS = [
    { id:"overview",  label:"Overview",              icon:"📖" },
    { id:"impl",      label:"Implementation Steps",  icon:"🗺" },
    { id:"checklist", label:"Audit Checklist",        icon:"✅" },
    { id:"templates", label:"Templates & Evidence",  icon:"📁" },
  ] as const;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        <button onClick={onBack}
          style={{ padding:"6px 14px", borderRadius:7, border:`1px solid ${T.border}`,
            background:T.cardBg, color:T.muted, fontSize:11,
            fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0 }}>
          ← Frameworks
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:24 }}>{fw.icon}</span>
            <span style={{ fontSize:15, fontWeight:800, color:T.text }}>{fw.label}</span>
            {fw.mandatory && (
              <span style={{ fontSize:8, fontWeight:800, color:RED, background:"rgba(248,113,113,0.12)",
                border:"1px solid rgba(248,113,113,0.3)", borderRadius:4, padding:"2px 6px" }}>MANDATORY</span>
            )}
          </div>
          <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>
            {fw.authority} · Est. {fw.year} · {fw.controls} controls · {fw.category}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em" }}>Duration</div>
          <div style={{ fontSize:11, fontWeight:700, color:fw.color }}>{detail.totalDuration}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.sep}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:"8px 14px", border:"none", borderBottom: activeTab===t.id ? `2px solid ${fw.color}` : "2px solid transparent",
              background:"transparent", color: activeTab===t.id ? fw.color : T.muted,
              fontSize:11, fontWeight: activeTab===t.id ? 700 : 500, cursor:"pointer", fontFamily:"inherit",
              marginBottom:-1, transition:"all 0.15s" }}>
            {t.icon} {t.label}
          </button>
        ))}
        {activeTab === "checklist" && totalItems > 0 && (
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, paddingRight:4 }}>
            <div style={{ fontSize:10, color:T.muted }}>{doneItems}/{totalItems}</div>
            <div style={{ width:80, height:5, borderRadius:3, background:T.pbBg, overflow:"hidden" }}>
              <div style={{ width:`${checkPct}%`, height:"100%", borderRadius:3,
                background: checkPct===100 ? EME : fw.color, transition:"width 0.3s" }} />
            </div>
            <div style={{ fontSize:10, fontWeight:700, color: checkPct===100 ? EME : fw.color }}>{checkPct}%</div>
          </div>
        )}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...c({ padding:"14px 16px" }), borderColor:`${fw.color}25` }}>
            <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>About</div>
            <div style={{ fontSize:12, color:T.muted, lineHeight:1.7 }}>{fw.description}</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div style={{ ...c({ padding:"12px 14px" }) }}>
              <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Scope</div>
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.55 }}>{fw.scope}</div>
            </div>
            <div style={{ ...c({ padding:"12px 14px" }) }}>
              <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Applicable To</div>
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.55 }}>{detail.applicableTo}</div>
            </div>
          </div>
          {detail.certificationBody && (
            <div style={{ ...c({ padding:"12px 14px" }), display:"flex", gap:12, alignItems:"center" }}>
              <span style={{ fontSize:20 }}>🏆</span>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Certification / Audit Body</div>
                <div style={{ fontSize:11, color:T.text, fontWeight:600 }}>{detail.certificationBody}</div>
              </div>
              <div style={{ marginLeft:"auto" }}>
                <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Typical Duration</div>
                <div style={{ fontSize:11, color:fw.color, fontWeight:700 }}>{detail.totalDuration}</div>
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Tags</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {fw.tags.map(tag => (
                <span key={tag} style={{ fontSize:9, padding:"2px 8px", borderRadius:4,
                  background:T.tagBg, color:T.muted, border:`1px solid ${T.tagBdr}` }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, paddingTop:4 }}>
            <button style={{ ...btn(fw.color, `${fw.color}15`), padding:"7px 18px", fontSize:11 }}>
              ◉ Start Framework Implementation Workflow
            </button>
            <button style={{ ...btn(NAV, "rgba(147,197,253,0.1)"), padding:"7px 16px", fontSize:11 }}>
              🏛 Start Audit Workflow
            </button>
          </div>
        </div>
      )}

      {/* ── IMPLEMENTATION STEPS TAB ── */}
      {activeTab === "impl" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {/* Phase progress strip */}
          <div style={{ display:"flex", gap:4, marginBottom:4, overflowX:"auto" }}>
            {detail.implementationPhases.map(p => (
              <div key={p.phase} onClick={() => setExpandedPhase(p.phase)}
                style={{ flex:1, minWidth:80, padding:"8px 10px", borderRadius:8, cursor:"pointer",
                  border:`1px solid ${expandedPhase===p.phase ? `${fw.color}60` : T.border}`,
                  background: expandedPhase===p.phase ? `${fw.color}12` : T.cardBg2, textAlign:"center" }}>
                <div style={{ fontSize:16, marginBottom:2 }}>{p.icon}</div>
                <div style={{ fontSize:8, fontWeight:700, color: expandedPhase===p.phase ? fw.color : T.muted2,
                  lineHeight:1.3, wordBreak:"break-word" }}>Phase {p.phase}</div>
              </div>
            ))}
          </div>

          {/* Phase detail */}
          {detail.implementationPhases.map(p => (
            <div key={p.phase} onClick={() => setExpandedPhase(expandedPhase === p.phase ? 0 : p.phase)}
              style={{ ...c({ padding:"14px 16px" }),
                borderColor: expandedPhase===p.phase ? `${fw.color}35` : T.border, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:`${fw.color}18`,
                  border:`1px solid ${fw.color}30`, display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:16, flexShrink:0 }}>{p.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:fw.color, background:`${fw.color}15`,
                      border:`1px solid ${fw.color}25`, borderRadius:4, padding:"1px 6px" }}>Phase {p.phase}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize:10, color:T.muted2, marginTop:1 }}>{p.timeframe}</div>
                </div>
                <span style={{ color:T.muted2, fontSize:11 }}>{expandedPhase===p.phase ? "▲" : "▼"}</span>
              </div>

              {expandedPhase === p.phase && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${T.sep}`,
                  display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:11, color:T.muted, lineHeight:1.55 }}>{p.description}</div>
                  <div>
                    <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase",
                      letterSpacing:"0.06em", marginBottom:8 }}>Tasks</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {p.tasks.map((task, ti) => (
                        <div key={ti} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                          <span style={{ width:16, height:16, borderRadius:4, border:`1px solid ${fw.color}40`,
                            background:`${fw.color}10`, flexShrink:0, marginTop:1, display:"flex",
                            alignItems:"center", justifyContent:"center", fontSize:9, color:fw.color }}>
                            {ti+1}
                          </span>
                          <span style={{ fontSize:10, color:T.muted, lineHeight:1.5 }}>{task}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, fontWeight:700, color:T.muted2, textTransform:"uppercase",
                      letterSpacing:"0.06em", marginBottom:6 }}>Deliverables</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {p.deliverables.map(d => (
                        <span key={d} style={{ fontSize:9, padding:"3px 8px", borderRadius:5,
                          background:`${fw.color}10`, color:`${fw.color}cc`, border:`1px solid ${fw.color}25` }}>
                          📄 {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── AUDIT CHECKLIST TAB ── */}
      {activeTab === "checklist" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {/* Overall progress */}
          <div style={{ ...c({ padding:"12px 16px" }), borderColor:`${fw.color}25` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.text }}>Overall Checklist Completion</span>
              <span style={{ fontSize:13, fontWeight:800, color: checkPct===100 ? EME : fw.color }}>{checkPct}%</span>
            </div>
            <div style={{ height:7, borderRadius:4, background:T.pbBg, overflow:"hidden" }}>
              <div style={{ width:`${checkPct}%`, height:"100%", borderRadius:4,
                background: checkPct===100 ? EME : fw.color, transition:"width 0.3s" }} />
            </div>
            <div style={{ fontSize:9, color:T.muted2, marginTop:5 }}>{doneItems} of {totalItems} items completed</div>
          </div>

          {detail.auditChecklist.map(domain => {
            const domainDone = domain.items.filter(item => checkDone[`${domain.domain}::${item.item}`]).length;
            const domainPct = domain.items.length > 0 ? Math.round((domainDone / domain.items.length) * 100) : 0;
            return (
              <div key={domain.domain} style={{ ...c({ padding:"14px 16px" }) }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>{domain.icon}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:T.text, flex:1 }}>{domain.domain}</span>
                  <span style={{ fontSize:10, color: domainPct===100 ? EME : T.muted2 }}>
                    {domainDone}/{domain.items.length}
                  </span>
                  <button onClick={() => toggleDomain(domain.domain, domain.items.map(i=>i.item))}
                    style={{ fontSize:9, padding:"2px 8px", borderRadius:4, border:`1px solid ${T.border}`,
                      background:T.tagBg, color:T.muted, cursor:"pointer", fontFamily:"inherit" }}>
                    {domain.items.every(i => checkDone[`${domain.domain}::${i.item}`]) ? "Uncheck All" : "Check All"}
                  </button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {domain.items.map(item => {
                    const key = `${domain.domain}::${item.item}`;
                    const done = !!checkDone[key];
                    return (
                      <div key={item.item} onClick={() => toggleCheck(key)}
                        style={{ display:"flex", alignItems:"flex-start", gap:8, cursor:"pointer",
                          padding:"6px 8px", borderRadius:6,
                          background: done ? `${fw.color}08` : "transparent",
                          transition:"background 0.15s" }}>
                        <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, marginTop:1,
                          border:`1.5px solid ${done ? fw.color : T.muted}`,
                          background: done ? fw.color : "transparent",
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:isDark?"white":"rgb(15,23,42)" }}>
                          {done && "✓"}
                        </div>
                        <span style={{ flex:1, fontSize:10, color: done ? T.muted2 : T.muted,
                          lineHeight:1.5, textDecoration: done ? "line-through" : "none" }}>
                          {item.item}
                        </span>
                        {item.required && (
                          <span style={{ fontSize:8, fontWeight:700, color:RED, flexShrink:0,
                            background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)",
                            borderRadius:3, padding:"1px 5px" }}>REQ</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TEMPLATES & EVIDENCE TAB ── */}
      {activeTab === "templates" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:11, color:T.muted2, marginBottom:2 }}>
            {detail.templateDetails.filter(t=>uploads[t.name]?.length).length} of {detail.templateDetails.length} templates have evidence uploaded
          </div>
          {detail.templateDetails.map((tmpl) => {
            const uploaded = uploads[tmpl.name] ?? [];
            const hasEvidence = uploaded.length > 0;
            const tColor = typeColor[tmpl.type] ?? NAV;
            return (
              <div key={tmpl.name} style={{ ...c({ padding:"13px 15px" }),
                borderColor: hasEvidence ? "rgba(52,211,153,0.25)" : tmpl.required ? "rgba(248,113,113,0.15)" : T.border }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:8, background:`${tColor}15`,
                    border:`1px solid ${tColor}30`, display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:16, flexShrink:0 }}>📄</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:T.text }}>{tmpl.name}</span>
                      <span style={{ fontSize:8, fontWeight:700, color:tColor, background:`${tColor}15`,
                        border:`1px solid ${tColor}25`, borderRadius:3, padding:"1px 6px", textTransform:"uppercase" }}>
                        {tmpl.type}
                      </span>
                      {tmpl.required && (
                        <span style={{ fontSize:8, fontWeight:700, color:RED, background:"rgba(248,113,113,0.1)",
                          border:"1px solid rgba(248,113,113,0.2)", borderRadius:3, padding:"1px 5px" }}>REQUIRED</span>
                      )}
                      {hasEvidence && (
                        <span style={{ fontSize:8, fontWeight:700, color:EME, background:"rgba(52,211,153,0.1)",
                          border:"1px solid rgba(52,211,153,0.2)", borderRadius:3, padding:"1px 6px" }}>✓ Evidence Uploaded</span>
                      )}
                    </div>
                    <div style={{ fontSize:10, color:T.muted, lineHeight:1.4 }}>{tmpl.description}</div>
                  </div>
                </div>

                {/* Uploaded files */}
                {uploaded.length > 0 && (
                  <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:4 }}>
                    {uploaded.map((fname, idx) => (
                      <div key={idx} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 9px",
                        borderRadius:6, background:"rgba(52,211,153,0.07)", border:"1px solid rgba(52,211,153,0.15)" }}>
                        <span style={{ fontSize:11 }}>📎</span>
                        <span style={{ flex:1, fontSize:10, color:T.muted, wordBreak:"break-all" }}>{fname}</span>
                        <button onClick={() => removeUpload(tmpl.name, idx)}
                          style={{ background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)",
                            borderRadius:4, padding:"2px 6px", color:RED, fontSize:9, cursor:"pointer", fontFamily:"inherit" }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button style={{ ...btn(tColor, `${tColor}12`), padding:"5px 12px", fontSize:10 }}>
                    ↓ Download Template
                  </button>
                  <label style={{ display:"inline-flex", alignItems:"center", gap:5,
                    padding:"5px 12px", borderRadius:7, border:`1px solid ${EME}40`,
                    background:"rgba(52,211,153,0.08)", color:EME, fontSize:10, fontWeight:800,
                    cursor:"pointer", fontFamily:"inherit" }}>
                    📎 Upload Evidence
                    <input type="file" multiple style={{ display:"none" }}
                      onChange={e => handleUpload(tmpl.name, e.target.files)} />
                  </label>
                  {!hasEvidence && tmpl.required && (
                    <span style={{ fontSize:9, color:RED, alignSelf:"center" }}>⚠ Evidence required for compliance</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Workflows Page ────────────────────────────────────────────────────
export default function Workflows() {
  const { user: authUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);
  const c = mkC(isDark);

  // Tab: catalog | active | completed | frameworks
  const [tab, setTab] = useState<"catalog"|"active"|"completed"|"frameworks">("catalog");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQ, setSearchQ] = useState("");

  // Active workflow runner state
  const [running, setRunning] = useState<ActiveWorkflow | null>(null);

  // Wizard pre-launch config
  const [launching, setLaunching] = useState<WorkflowDef | null>(null);
  const [launchConfig, setLaunchConfig] = useState<{
    framework?:string; auditType?:string; auditName?:string; policySource?:string;
  }>({});
  const [modalRegion, setModalRegion] = useState("global");
  const [modalSearch, setModalSearch] = useState("");

  // Frameworks catalog browser state
  const [fwRegion, setFwRegion] = useState("all");
  const [fwSearch, setFwSearch] = useState("");
  const [selectedFw, setSelectedFw] = useState<string | null>(null);

  // Completed workflows (history)
  const [completed, setCompleted] = useState<{ def:WorkflowDef; completedAt:string; steps:number }[]>([]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(WORKFLOW_CATALOG.map(w=>w.category)));
    return ["All", ...cats];
  }, []);

  const visibleWorkflows = useMemo(() =>
    WORKFLOW_CATALOG.filter(w =>
      (categoryFilter==="All" || w.category===categoryFilter) &&
      (!searchQ || w.title.toLowerCase().includes(searchQ.toLowerCase()) || w.description.toLowerCase().includes(searchQ.toLowerCase()))
    ), [categoryFilter, searchQ]);

  function startWorkflow(wf: WorkflowDef) {
    // Workflows that need pre-launch config
    if (wf.id === "audit_exec" || wf.id === "soa_gen" || wf.id === "evidence_coll") {
      setLaunching(wf);
      setLaunchConfig({});
    } else {
      launchWorkflow(wf, {});
    }
  }

  function launchWorkflow(wf: WorkflowDef, cfg: typeof launchConfig) {
    const steps = STEP_MAP[wf.id] ?? [];
    const stepStatuses: Record<string, "pending"|"in_progress"|"done"|"skipped"> = {};
    steps.forEach((s, i) => { stepStatuses[s.id] = i===0 ? "in_progress" : "pending"; });
    setRunning({
      def: wf,
      currentStep: 0,
      stepStatuses,
      taskChecks: {},
      startedAt: new Date().toLocaleString(),
      selectedFramework: cfg.framework,
      auditType: cfg.auditType,
      auditName: cfg.auditName,
      policySource: cfg.policySource,
    });
    setLaunching(null);
    setTab("active");
  }

  function toggleTask(key: string) {
    if (!running) return;
    setRunning(prev => prev ? { ...prev, taskChecks:{ ...prev.taskChecks, [key]: !prev.taskChecks[key] } } : prev);
  }

  function goNextStep() {
    if (!running) return;
    const steps = STEP_MAP[running.def.id] ?? [];
    const next = Math.min(running.currentStep + 1, steps.length - 1);
    const newStatuses = { ...running.stepStatuses };
    const curStep = steps[running.currentStep];
    if (curStep) newStatuses[curStep.id] = "done";
    const nextStep = steps[next];
    if (nextStep && newStatuses[nextStep.id] === "pending") newStatuses[nextStep.id] = "in_progress";
    setRunning(prev => prev ? { ...prev, currentStep: next, stepStatuses: newStatuses } : prev);
  }

  function goPrevStep() {
    if (!running) return;
    setRunning(prev => prev ? { ...prev, currentStep: Math.max(0, prev.currentStep - 1) } : prev);
  }

  function markStepDone() {
    if (!running) return;
    const steps = STEP_MAP[running.def.id] ?? [];
    const cur = steps[running.currentStep];
    const autoChecks: Record<string, boolean> = { ...running.taskChecks };
    if (cur) {
      cur.tasks.forEach(t => { autoChecks[`${cur.id}:${t.label}`] = true; });
    }
    const isLast = running.currentStep === steps.length - 1;
    if (isLast) {
      // Complete the workflow
      setCompleted(prev => [{ def:running.def, completedAt:new Date().toLocaleString(), steps:steps.length }, ...prev]);
      setRunning(null);
      setTab("completed");
    } else {
      const newStatuses = { ...running.stepStatuses };
      if (cur) newStatuses[cur.id] = "done";
      const nextStep = steps[running.currentStep + 1];
      if (nextStep) newStatuses[nextStep.id] = "in_progress";
      setRunning(prev => prev ? { ...prev, currentStep: prev.currentStep + 1, stepStatuses: newStatuses, taskChecks: autoChecks } : prev);
    }
  }

  const steps = running ? (STEP_MAP[running.def.id] ?? []) : [];
  const currentStepDef = running ? steps[running.currentStep] : null;

  // ── Pre-launch Config Modal ──────────────────────────────────────────────
  const renderLaunchModal = () => {
    if (!launching) return null;
    const needsFramework = ["audit_exec","soa_gen","evidence_coll"].includes(launching.id);
    const needsAuditType = launching.id === "audit_exec";
    const canLaunch = !needsFramework || launchConfig.framework;
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
        onClick={e=>{ if(e.target===e.currentTarget){ setLaunching(null); } }}>
        <div style={{ background:"rgb(14,22,34)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:14, width:580, maxHeight:"85vh", overflow:"auto",
          boxShadow:"0 32px 80px rgba(0,0,0,0.8)" }}>
          {/* Header */}
          <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:14, color:"var(--muted-foreground)", marginBottom:4 }}>Configure &amp; Launch</div>
              <div style={{ fontSize:18, fontWeight:800, color:"white" }}>{launching.icon} {launching.title}</div>
            </div>
            <button onClick={()=>setLaunching(null)} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, width:28, height:28, cursor:"pointer", color:"var(--muted-foreground)", fontSize:14 }}>✕</button>
          </div>

          <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>
            {needsFramework && (() => {
              const filteredFw = ALL_FRAMEWORKS.filter(f => {
                const matchRegion = f.region === modalRegion;
                const q = modalSearch.toLowerCase();
                const matchSearch = !q || f.label.toLowerCase().includes(q) || f.shortLabel.toLowerCase().includes(q) || f.authority.toLowerCase().includes(q) || f.category.toLowerCase().includes(q);
                return matchRegion && matchSearch;
              });
              return (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 }}>
                    Select Compliance Framework <span style={{ color:RED }}>*</span>
                  </div>
                  {/* Region pill bar */}
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
                    {REGIONS.map(r => (
                      <button key={r.id} onClick={()=>{ setModalRegion(r.id); setModalSearch(""); setLaunchConfig(cfg=>({...cfg, framework:undefined})); }}
                        style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 9px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                          border:`1px solid ${modalRegion===r.id ? r.color+"80" : "rgba(255,255,255,0.1)"}`,
                          background: modalRegion===r.id ? `${r.color}18` : "var(--secondary)",
                          color: modalRegion===r.id ? r.color : "var(--muted-foreground)", fontSize:10, fontWeight: modalRegion===r.id?700:500 }}>
                        <span>{r.flag}</span>
                        <span>{r.id === "global" ? "Global" : r.label.split(" (")[0].split(" / ")[0]}</span>
                      </button>
                    ))}
                  </div>
                  {/* Search within region */}
                  <input value={modalSearch} onChange={e=>setModalSearch(e.target.value)}
                    placeholder={`Search ${REGIONS.find(r=>r.id===modalRegion)?.label ?? ""} frameworks…`}
                    style={{ width:"100%", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6,
                      padding:"7px 12px", fontSize:11, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box", marginBottom:8 }} />
                  {/* Framework grid */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:7, maxHeight:300, overflowY:"auto" }}>
                    {filteredFw.map(f => (
                      <button key={f.id} onClick={()=>setLaunchConfig(cfg=>({...cfg, framework:f.id}))}
                        style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"9px 11px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                          border:`1px solid ${launchConfig.framework===f.id ? f.color+"60" : "var(--border)"}`,
                          background: launchConfig.framework===f.id ? `${f.color}12` : "var(--secondary)" }}>
                        <span style={{ fontSize:16, marginTop:1 }}>{f.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"white", lineHeight:1.3 }}>{f.shortLabel}</div>
                          <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{f.category}</div>
                          <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{f.controls} controls · {f.year}</div>
                          {f.mandatory && <span style={{ fontSize:8, color:RED, fontWeight:700 }}>MANDATORY</span>}
                        </div>
                        {launchConfig.framework===f.id && <span style={{ color:f.color, fontSize:13, flexShrink:0 }}>✓</span>}
                      </button>
                    ))}
                    {filteredFw.length === 0 && (
                      <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"20px 0", fontSize:11, color:"var(--muted-foreground)" }}>
                        No frameworks found for "{modalSearch}"
                      </div>
                    )}
                  </div>
                  {launchConfig.framework && (() => {
                    const sel = ALL_FRAMEWORKS.find(f=>f.id===launchConfig.framework);
                    if (!sel) return null;
                    return (
                      <div style={{ marginTop:8, padding:"10px 12px", borderRadius:8, background:`${sel.color}10`, border:`1px solid ${sel.color}30` }}>
                        <div style={{ fontSize:11, fontWeight:700, color:sel.color }}>{sel.icon} {sel.label}</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{sel.authority} · {sel.year}</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3, lineHeight:1.4 }}>{sel.scope}</div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {needsAuditType && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 }}>Audit Type</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                  {AUDIT_TYPES.map(t => (
                    <button key={t.id} onClick={()=>setLaunchConfig(c=>({...c, auditType:t.id}))}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                        border:`1px solid ${launchConfig.auditType===t.id ? NAV+"60" : "var(--border)"}`,
                        background: launchConfig.auditType===t.id ? "rgba(147,197,253,0.1)" : "var(--secondary)" }}>
                      <span style={{ fontSize:16 }}>{t.icon}</span>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"white" }}>{t.label}</div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{t.desc}</div>
                      </div>
                      {launchConfig.auditType===t.id && <span style={{ marginLeft:"auto", color:NAV }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {needsAuditType && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:8 }}>Audit Name</div>
                <input value={launchConfig.auditName ?? ""} onChange={e=>setLaunchConfig(c=>({...c, auditName:e.target.value}))}
                  placeholder={`e.g. ISO 27001 Internal Audit Q${new Date().getMonth()<6?1:3} ${new Date().getFullYear()}`}
                  style={{ width:"100%", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"9px 14px", fontSize:12, color:"white", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>
            )}
          </div>

          <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={()=>setLaunching(null)} style={{ padding:"8px 16px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"var(--muted-foreground)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
            <button onClick={()=>{ if(canLaunch) launchWorkflow(launching, launchConfig); }}
              disabled={!canLaunch}
              style={{ ...btn(canLaunch?NAV:"rgba(148,163,184,0.3)", canLaunch?"rgba(147,197,253,0.12)":"var(--secondary)"), padding:"8px 22px", opacity:canLaunch?1:0.6 }}>
              Launch Workflow ▶
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Active Workflow Runner ─────────────────────────────────────────────
  const renderActiveWorkflow = () => {
    if (!running || !currentStepDef) {
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}>
          <div style={{ fontSize:48 }}>▶</div>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--muted-foreground)" }}>No workflow in progress</div>
          <button onClick={()=>setTab("catalog")} style={{ ...btn(NAV,"rgba(147,197,253,0.1)"), marginTop:8 }}>Browse Workflow Catalog</button>
        </div>
      );
    }

    const doneCount = steps.filter(s => running.stepStatuses[s.id]==="done").length;
    const pct = steps.length > 0 ? Math.round(doneCount/steps.length*100) : 0;
    const fw = ALL_FRAMEWORKS.find(f=>f.id===running.selectedFramework);

    return (
      <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:16, flex:1, minHeight:0 }}>
        {/* Sidebar: step list */}
        <div style={{ ...c({ padding:"0" }), overflow:"hidden", display:"flex", flexDirection:"column", alignSelf:"start", position:"sticky", top:0 }}>
          <div style={{ padding:"14px 16px", borderBottom:`1px solid ${T.sep}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontSize:18 }}>{running.def.icon}</span>
              <div style={{ fontSize:12, fontWeight:800, color:T.text, lineHeight:1.3 }}>{running.def.title}</div>
            </div>
            {fw && <div style={{ fontSize:10, color:fw.color, fontWeight:700, marginBottom:6 }}>{fw.icon} {fw.label}</div>}
            {running.auditName && <div style={{ fontSize:10, color:T.muted, marginBottom:6 }}>"{running.auditName}"</div>}
            <ProgressBar pct={pct} color={running.def.color} trackColor={T.pbBg} />
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
              <span style={{ fontSize:9, color:T.muted2 }}>Started {running.startedAt}</span>
              <span style={{ fontSize:10, fontWeight:700, color:running.def.color }}>{pct}%</span>
            </div>
          </div>
          <div style={{ overflowY:"auto" }}>
            {steps.map((s, i) => {
              const status = running.stepStatuses[s.id] ?? "pending";
              const isCurrent = running.currentStep === i;
              return (
                <div key={s.id} onClick={()=>setRunning(prev=>prev?({...prev,currentStep:i}):prev)}
                  style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", cursor:"pointer",
                    background: isCurrent ? `${running.def.color}12` : "transparent",
                    borderLeft:`2px solid ${isCurrent ? running.def.color : "transparent"}`,
                    borderBottom:`1px solid ${T.sep}`, transition:"background 0.1s" }}>
                  <StepStatusDot status={status} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:T.muted2, marginBottom:1 }}>Step {i+1}</div>
                    <div style={{ fontSize:11, fontWeight: isCurrent?700:500,
                      color: status==="done" ? T.muted2 : isCurrent ? T.text : T.textSub,
                      textDecoration: status==="done"?"line-through":"none", lineHeight:1.3 }}>{s.title}</div>
                  </div>
                  <AutoBadge level={s.auto} small />
                </div>
              );
            })}
          </div>
          <div style={{ padding:"12px 14px", borderTop:`1px solid ${T.sep}` }}>
            <button onClick={()=>{ if(window.confirm("Pause this workflow? Progress is saved.")) setRunning(null); setTab("catalog"); }}
              style={{ width:"100%", padding:"7px", borderRadius:6, border:"1px solid rgba(248,113,113,0.3)", background:"rgba(248,113,113,0.07)", color:RED, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              ⏸ Pause Workflow
            </button>
          </div>
        </div>

        {/* Main step panel */}
        <StepPanel
          wf={running.def}
          step={currentStepDef}
          stepIdx={running.currentStep}
          totalSteps={steps.length}
          taskChecks={running.taskChecks}
          onToggleTask={toggleTask}
          onNext={goNextStep}
          onPrev={goPrevStep}
          onMarkDone={markStepDone}
          isLast={running.currentStep === steps.length - 1}
        />
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:"24px 28px", display:"flex", flexDirection:"column", gap:20, minHeight:"100vh",
      background:"rgba(0,0,0,0)", color:T.text, fontFamily:"'Plus Jakarta Sans', sans-serif" }}>

      {/* Page header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:T.text, letterSpacing:"-0.5px", marginBottom:4 }}>GRC Workflows</div>
          <div style={{ fontSize:12, color:T.muted }}>
            Guided, semi-automated end-to-end workflows for audits, risk, policy and compliance
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          {running && (
            <button onClick={()=>setTab("active")} style={{ ...btn(AMB,"rgba(252,211,77,0.1)"), position:"relative" }}>
              ▶ Active Workflow
              <span style={{ position:"absolute", top:-4, right:-4, width:8, height:8, borderRadius:"50%", background:AMB, boxShadow:`0 0 8px ${AMB}` }} />
            </button>
          )}
          <button onClick={()=>setTab("catalog")} style={{ ...btn(NAV,"rgba(147,197,253,0.1)") }}>+ New Workflow</button>
        </div>
      </div>

      <AICopilotBar module="workflows" />

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10 }}>
        {[
          { label:"Total Workflows",   value:WORKFLOW_CATALOG.length, color:NAV, icon:"▶" },
          { label:"Automated",         value:WORKFLOW_CATALOG.filter(w=>w.autoLevel==="automated").length, color:EME, icon:"🤖" },
          { label:"Semi-Automated",    value:WORKFLOW_CATALOG.filter(w=>w.autoLevel==="semi").length, color:AMB, icon:"⚡" },
          { label:"Active Now",        value:running?1:0, color:ORG, icon:"⏳" },
          { label:"Completed",         value:completed.length, color:EME, icon:"✅" },
          { label:"Frameworks",        value:ALL_FRAMEWORKS.length, color:PRP, icon:"🌐" },
        ].map(s=>(
          <div key={s.label} style={{ ...c({ padding:"12px 14px" }) }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.08em", color:T.muted, textTransform:"uppercase" }}>{s.label}</span>
              <span style={{ fontSize:16 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize:26, fontWeight:900, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${T.sep}`, paddingBottom:0 }}>
        {(["catalog","active","completed","frameworks"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:"8px 18px", borderRadius:"7px 7px 0 0", border:"1px solid transparent",
              borderBottom: tab===t?`1px solid ${T.tabUnder}`:`1px solid ${T.sep}`,
              background: tab===t ? (isDark?"var(--border)":"rgba(0,0,0,0.04)") : "transparent",
              color: tab===t ? T.text : T.muted,
              fontSize:12, fontWeight: tab===t?700:500, cursor:"pointer", fontFamily:"inherit",
              textTransform:"capitalize" }}>
            {t==="active" ? (running?"▶ Active":"Active") : t==="frameworks" ? "🌐 Frameworks" : t.charAt(0).toUpperCase()+t.slice(1)}
            {t==="active" && running && <span style={{ marginLeft:6, width:6, height:6, borderRadius:"50%", background:AMB, display:"inline-block" }} />}
          </button>
        ))}
      </div>

      {/* ── Catalog Tab ── */}
      {tab==="catalog" && (
        <>
          {/* Search + category filter */}
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search workflows…"
              style={{ background:T.inputBg, border:`1px solid ${T.inputBdr}`, borderRadius:8, padding:"7px 14px", fontSize:12, color:T.text, outline:"none", fontFamily:"inherit", width:220 }} />
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {categories.map(cat=>(
                <button key={cat} onClick={()=>setCategoryFilter(cat)}
                  style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${categoryFilter===cat ? NAV+"50" : T.border}`,
                    background: categoryFilter===cat?"rgba(147,197,253,0.15)":T.tagBg,
                    color: categoryFilter===cat?NAV:T.muted,
                    fontSize:10, fontWeight:categoryFilter===cat?700:500, cursor:"pointer", fontFamily:"inherit" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Featured workflows */}
          {categoryFilter==="All" && !searchQ && (
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:T.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Featured Workflows</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
                {WORKFLOW_CATALOG.filter(w=>w.featured).map(wf=>(
                  <WfCard key={wf.id} wf={wf} onStart={()=>startWorkflow(wf)} />
                ))}
              </div>
            </div>
          )}

          {/* All workflows by category */}
          {(() => {
            const cats = categoryFilter==="All"
              ? Array.from(new Set(visibleWorkflows.map(w=>w.category)))
              : [categoryFilter];
            return cats.map(cat => {
              const wfs = visibleWorkflows.filter(w=>w.category===cat && (categoryFilter!=="All"||!w.featured||!!searchQ));
              if (wfs.length === 0) return null;
              return (
                <div key={cat}>
                  <div style={{ fontSize:10, fontWeight:800, color:T.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>{cat}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                    {wfs.map(wf=><WfCard key={wf.id} wf={wf} onStart={()=>startWorkflow(wf)} />)}
                  </div>
                </div>
              );
            });
          })()}

          {visibleWorkflows.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 0", color:T.muted, fontSize:13 }}>
              No workflows match "{searchQ}"
            </div>
          )}
        </>
      )}

      {/* ── Active Tab ── */}
      {tab==="active" && renderActiveWorkflow()}

      {/* ── Frameworks Catalog Tab ── */}
      {tab==="frameworks" && (() => {
        // Detail view — when a framework card has been clicked
        if (selectedFw) {
          const fw = ALL_FRAMEWORKS.find(f => f.id === selectedFw);
          if (fw) return (
            <FrameworkDetailPanel
              fw={fw}
              onBack={() => setSelectedFw(null)}
            />
          );
        }

        // Grid view
        const filteredFws = ALL_FRAMEWORKS.filter(f => {
          const matchRegion = fwRegion === "all" || f.region === fwRegion;
          const q = fwSearch.toLowerCase();
          const matchSearch = !q || f.label.toLowerCase().includes(q) || f.shortLabel.toLowerCase().includes(q) ||
            f.authority.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) ||
            f.tags.some(t => t.toLowerCase().includes(q));
          return matchRegion && matchSearch;
        });
        const selectedRegionMeta = REGIONS.find(r => r.id === fwRegion);

        // India highlight banner — always show when "all" or "in" filter active
        const indiaFws = ALL_FRAMEWORKS.filter(f => f.region === "in");
        const indiaMeta = REGIONS.find(r => r.id === "in");

        return (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* India spotlight banner when showing "all" regions */}
            {fwRegion === "all" && indiaMeta && (
              <div style={{ ...c({ padding:"12px 16px" }), borderColor:"rgba(255,153,51,0.3)",
                background:"rgba(255,153,51,0.04)", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:28 }}>🇮🇳</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:"#FF9933" }}>India Compliance Frameworks</div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:1 }}>
                    DPDP Act · RBI CSF · SEBI CSCRF · CERT-In · IRDAI · IT Act/SPDI — {indiaFws.length} frameworks
                  </div>
                </div>
                <button onClick={() => setFwRegion("in")}
                  style={{ ...btn("#FF9933", "rgba(255,153,51,0.12)"), padding:"5px 14px", fontSize:10, whiteSpace:"nowrap" }}>
                  View India →
                </button>
              </div>
            )}

            {/* Region selector + search */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                <button onClick={() => setFwRegion("all")}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                    border:`1px solid ${fwRegion==="all" ? NAV+"80" : T.border}`,
                    background: fwRegion==="all" ? "rgba(147,197,253,0.12)" : T.tagBg,
                    color: fwRegion==="all" ? NAV : T.muted, fontSize:10, fontWeight: fwRegion==="all"?700:500 }}>
                  🌐 All ({ALL_FRAMEWORKS.length})
                </button>
                {REGIONS.map(r => {
                  const count = ALL_FRAMEWORKS.filter(f => f.region === r.id).length;
                  if (count === 0) return null;
                  return (
                    <button key={r.id} onClick={() => setFwRegion(r.id)}
                      style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 11px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                        border:`1px solid ${fwRegion===r.id ? r.color+"80" : T.border}`,
                        background: fwRegion===r.id ? `${r.color}15` : T.tagBg,
                        color: fwRegion===r.id ? r.color : T.muted, fontSize:10, fontWeight: fwRegion===r.id?700:500 }}>
                      {r.flag} {r.id==="global"?"Global":r.label.split(" (")[0].split(" / ")[0]} ({count})
                    </button>
                  );
                })}
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input value={fwSearch} onChange={e => setFwSearch(e.target.value)}
                  placeholder="Search frameworks, authority, category, tags…"
                  style={{ flex:1, background:T.inputBg, border:`1px solid ${T.inputBdr}`, borderRadius:8,
                    padding:"8px 14px", fontSize:12, color:T.text, outline:"none", fontFamily:"inherit" }} />
                <div style={{ fontSize:11, color:T.muted2, whiteSpace:"nowrap" }}>
                  {filteredFws.length} frameworks
                </div>
              </div>
            </div>

            {/* Region banner */}
            {fwRegion !== "all" && selectedRegionMeta && (
              <div style={{ ...c({ padding:"14px 18px" }), borderColor:`${selectedRegionMeta.color}30`,
                display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:32 }}>{selectedRegionMeta.flag}</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:selectedRegionMeta.color }}>{selectedRegionMeta.label}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                    {filteredFws.filter(f => f.mandatory).length} mandatory · {filteredFws.length} total frameworks
                  </div>
                </div>
                <div style={{ marginLeft:"auto", fontSize:10, color:T.muted2 }}>
                  Click any framework card to view implementation steps, audit checklist &amp; templates
                </div>
              </div>
            )}

            {/* Framework cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
              {filteredFws.map(f => {
                const regMeta = REGIONS.find(r => r.id === f.region);
                return (
                  <div key={f.id}
                    style={{ ...c({ padding:"14px 16px" }), cursor:"pointer", transition:"border-color 0.15s, background 0.15s" }}
                    onClick={() => setSelectedFw(f.id)}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:11 }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:`${f.color}15`,
                        border:`1px solid ${f.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>
                        {f.icon}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", marginBottom:2 }}>
                          <span style={{ fontSize:11, fontWeight:800, color:T.text }}>{f.shortLabel}</span>
                          {f.mandatory && (
                            <span style={{ fontSize:8, fontWeight:800, color:RED, background:"rgba(248,113,113,0.1)",
                              border:"1px solid rgba(248,113,113,0.25)", borderRadius:4, padding:"1px 5px" }}>MANDATORY</span>
                          )}
                          {regMeta && fwRegion === "all" && (
                            <span style={{ fontSize:9, color:regMeta.color }}>{regMeta.flag}</span>
                          )}
                        </div>
                        <div style={{ fontSize:9, color:T.muted2 }}>{f.authority} · {f.year}</div>
                        <div style={{ fontSize:9, color:`${f.color}bb`, marginTop:1 }}>{f.category} · {f.controls} controls</div>
                      </div>
                      <span style={{ color:`${f.color}60`, fontSize:10, flexShrink:0, marginTop:2 }}>→</span>
                    </div>
                    <div style={{ marginTop:8, fontSize:9, color:T.muted2,
                      display:"flex", gap:8, paddingTop:6, borderTop:`1px solid ${T.sep}` }}>
                      <span>📋 {f.templates.length} templates</span>
                      <span>🗺 Implementation guide</span>
                      <span>✅ Audit checklist</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredFws.length === 0 && (
              <div style={{ ...c({ padding:"40px" }), textAlign:"center", color:T.muted, fontSize:13 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
                No frameworks match "{fwSearch}"
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Completed Tab ── */}
      {tab==="completed" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {completed.length === 0 ? (
            <div style={{ ...c({ padding:"40px" }), textAlign:"center", color:T.muted, fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>✅</div>
              No completed workflows yet. Start one from the catalog!
            </div>
          ) : completed.map((entry, i) => (
            <div key={i} style={{ ...c({ padding:"16px 20px" }), display:"flex", alignItems:"center", gap:14, borderColor:"rgba(52,211,153,0.2)" }}>
              <div style={{ width:40, height:40, borderRadius:10, background:`${entry.def.color}15`, border:`1px solid ${entry.def.color}30`,
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{entry.def.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800, color:T.text, marginBottom:2 }}>{entry.def.title}</div>
                <div style={{ fontSize:10, color:T.muted2 }}>{entry.steps} steps completed · {entry.completedAt}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:EME, background:"rgba(52,211,153,0.12)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:6, padding:"4px 10px" }}>
                ✅ Completed
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pre-launch config modal */}
      {renderLaunchModal()}
    </div>
  );
}

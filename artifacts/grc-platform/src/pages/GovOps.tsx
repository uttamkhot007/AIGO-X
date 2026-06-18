import React, { useState, useMemo, useEffect } from "react";
import { useOrg } from "@/context/OrgContext";
import { useLocation } from "wouter";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import WorkflowPipeline, { POLICY_LIFECYCLE_WF } from "@/components/WorkflowPipeline";
import { AICopilotBar } from "@/components/AICopilotBar";
import { allPolicies as staticPolicies, allProcesses, allProcedures, type Policy, type Process, type Procedure } from "@/lib/grc-data";
import { controlLibrary } from "@/lib/control-library";
import { Drawer, Field, DrawerSection, DrawerBadge } from "@/components/Drawer";
import { OwnerPickerModal, RiskLevelModal, EvidenceUploadModal } from "@/components/QuickEditModals";

// ── Framework lookup helpers ──────────────────────────────────────────────────
const policyFwMap: Record<string, string[]> = Object.fromEntries(
  (staticPolicies as { id: string; frameworks?: string[] }[]).map(p => [p.id, p.frameworks ?? []])
);
const processFwMap: Record<string, string[]> = Object.fromEntries(
  allProcesses.map(p => [p.id, policyFwMap[p.linked] ?? []])
);

// ── Local data (controls, attestation, templates) ─────────────────────────────
const controls = [
  { id: "CTL-001", name: "Multi-Factor Authentication",          ccf: "CCF-IAM-01", frameworks: ["ISO 27001 A.9.4", "SOC 2 CC6.1", "NIST AC-7"],     status: "implemented", owner: "Alex Kim",      evidence: 6, risk: "Low"    },
  { id: "CTL-002", name: "Privileged Access Management",         ccf: "CCF-IAM-02", frameworks: ["ISO 27001 A.9.2", "SOC 2 CC6.3", "CIS 5.4"],        status: "implemented", owner: "Alex Kim",      evidence: 4, risk: "Low"    },
  { id: "CTL-003", name: "Vulnerability Scanning",               ccf: "CCF-VM-01",  frameworks: ["ISO 27001 A.12.6", "SOC 2 CC7.1", "NIST RA-5"],     status: "partial",     owner: "Sarah Chen",    evidence: 2, risk: "Medium" },
  { id: "CTL-004", name: "Security Awareness Training",          ccf: "CCF-HR-01",  frameworks: ["ISO 27001 A.7.2", "SOC 2 CC1.4", "NIST AT-2"],      status: "implemented", owner: "Marcus Johnson",evidence: 8, risk: "Low"    },
  { id: "CTL-005", name: "Incident Detection & Response",        ccf: "CCF-IR-01",  frameworks: ["ISO 27001 A.16", "SOC 2 CC7.3", "NIST IR-4"],       status: "implemented", owner: "Sarah Chen",    evidence: 5, risk: "Low"    },
  { id: "CTL-006", name: "Encryption at Rest",                   ccf: "CCF-DAT-01", frameworks: ["ISO 27001 A.10.1", "SOC 2 CC6.7", "GDPR Art.32"],   status: "partial",     owner: "Priya Patel",   evidence: 3, risk: "Medium" },
  { id: "CTL-007", name: "Network Segmentation",                 ccf: "CCF-NET-01", frameworks: ["ISO 27001 A.13.1", "SOC 2 CC6.6", "NIST SC-7"],     status: "partial",     owner: "Sarah Chen",    evidence: 2, risk: "High"   },
  { id: "CTL-008", name: "Change Management Controls",           ccf: "CCF-CM-01",  frameworks: ["ISO 27001 A.12.1", "SOC 2 CC8.1", "NIST CM-3"],     status: "implemented", owner: "Alex Kim",      evidence: 7, risk: "Low"    },
  { id: "CTL-009", name: "Data Backup & Recovery",               ccf: "CCF-BCP-01", frameworks: ["ISO 27001 A.12.3", "SOC 2 A1.3", "NIST CP-9"],      status: "not-started", owner: "Marcus Johnson",evidence: 0, risk: "High"   },
  { id: "CTL-010", name: "Third Party Security Assessments",     ccf: "CCF-TPR-01", frameworks: ["ISO 27001 A.15.2", "SOC 2 CC9.2", "NIS2 Art.21"],   status: "partial",     owner: "Priya Patel",   evidence: 1, risk: "High"   },
];

const riskC: Record<string, { bg: string; color: string }> = {
  Low: { bg: "rgba(34,197,94,0.08)", color: "#065F46" }, Medium: { bg: "rgba(245,158,11,0.06)", color: "#92400E" }, High: { bg: "rgba(239,68,68,0.06)", color: "#991B1B" },
};

const attestationDepts = [
  { dept: "Engineering",   contact: "Ryan Johnson",    totalPolicies: 12, acknowledged: 11, overdue: 0, lastActivity: "2 hours ago",   color: "rgb(147,197,253)" },
  { dept: "Finance",       contact: "Clara Kim",       totalPolicies: 8,  acknowledged: 8,  overdue: 0, lastActivity: "1 day ago",     color: "#065F46" },
  { dept: "Legal",         contact: "Marcus Thompson", totalPolicies: 10, acknowledged: 9,  overdue: 0, lastActivity: "3 hours ago",   color: "#4338CA" },
  { dept: "HR",            contact: "Sophie Martinez", totalPolicies: 9,  acknowledged: 7,  overdue: 1, lastActivity: "5 hours ago",   color: "#0891B2" },
  { dept: "Sales",         contact: "David Chen",      totalPolicies: 7,  acknowledged: 4,  overdue: 2, lastActivity: "2 days ago",    color: "#D97706" },
  { dept: "Marketing",     contact: "Aisha Patel",     totalPolicies: 7,  acknowledged: 6,  overdue: 1, lastActivity: "1 day ago",     color: "#7C3AED" },
  { dept: "IT Operations", contact: "Alex Kim",        totalPolicies: 14, acknowledged: 14, overdue: 0, lastActivity: "30 min ago",    color: "#059669" },
  { dept: "Operations",    contact: "Lena Schwartz",   totalPolicies: 8,  acknowledged: 5,  overdue: 2, lastActivity: "3 days ago",    color: "#DC2626" },
];

const policyVersionHistory: Record<string, { version: string; changedBy: string; changedAt: string; summary: string; status: string }[]> = {
  "POL-001": [
    { version: "3.2", changedBy: "Sarah Chen",     changedAt: "2024-03-15", summary: "Updated cloud security section to reference AWS CIS Benchmark v2.0", status: "approved" },
    { version: "3.1", changedBy: "Alex Kim",       changedAt: "2023-11-20", summary: "Added AI/ML system classification section", status: "approved" },
    { version: "3.0", changedBy: "Sarah Chen",     changedAt: "2023-06-01", summary: "Major revision — aligned with ISO 27001:2022", status: "approved" },
    { version: "2.4", changedBy: "Marcus Johnson", changedAt: "2022-12-10", summary: "Added remote work controls post-pandemic", status: "archived" },
  ],
  "POL-004": [
    { version: "4.0", changedBy: "Sarah Chen", changedAt: "2024-03-01", summary: "Complete rewrite — 4-hour containment SLA, SIRT restructure", status: "approved" },
    { version: "3.2", changedBy: "Alex Kim",   changedAt: "2023-09-15", summary: "Added ransomware playbook appendix", status: "archived" },
    { version: "3.1", changedBy: "Sarah Chen", changedAt: "2023-01-20", summary: "Updated communication tree and executive notification", status: "archived" },
  ],
};

const templates = [
  { id: "TPL-001", name: "Information Security Policy",          category: "Security",   frameworks: ["ISO 27001","SOC 2","NIST CSF"],   pages: 12, popularity: 98, description: "Master policy governing information security management across the organisation." },
  { id: "TPL-002", name: "Acceptable Use Policy",                category: "Security",   frameworks: ["ISO 27001","SOC 2"],              pages: 8,  popularity: 95, description: "Rules governing acceptable use of company IT resources and systems." },
  { id: "TPL-003", name: "Data Classification Policy",           category: "Data",       frameworks: ["ISO 27001","GDPR","NIST"],        pages: 10, popularity: 92, description: "Framework for classifying data — Public, Internal, Confidential, Restricted." },
  { id: "TPL-004", name: "Incident Response Policy",             category: "Security",   frameworks: ["ISO 27001","NIST CSF","NIS2"],    pages: 14, popularity: 90, description: "Defines roles, process and SLAs for detecting and recovering from incidents." },
  { id: "TPL-005", name: "Access Control Policy",                category: "IAM",        frameworks: ["ISO 27001","SOC 2","CIS 18"],     pages: 11, popularity: 88, description: "Least-privilege access framework covering provisioning and deprovisioning." },
  { id: "TPL-006", name: "Vulnerability Management Policy",      category: "Security",   frameworks: ["ISO 27001","NIST CSF","PCI DSS"],pages: 11, popularity: 87, description: "Defines scanning cadence, SLA for patching, and CVE escalation." },
  { id: "TPL-007", name: "Business Continuity Policy",           category: "BCP",        frameworks: ["ISO 22301","ISO 27001"],          pages: 16, popularity: 85, description: "Strategy and governance for maintaining critical operations during disruption." },
  { id: "TPL-008", name: "Data Breach Response Policy",          category: "Privacy",    frameworks: ["GDPR","HIPAA","NIS2"],           pages: 11, popularity: 85, description: "72-hour notification obligations, containment steps and post-incident review." },
  { id: "TPL-009", name: "Password & Authentication Policy",     category: "IAM",        frameworks: ["ISO 27001","NIST SP 800-63"],    pages: 7,  popularity: 91, description: "Password complexity, rotation, MFA and privileged account rules." },
  { id: "TPL-010", name: "Vendor Risk Management Policy",        category: "Risk",       frameworks: ["ISO 27001","SOC 2","NIS2"],      pages: 13, popularity: 83, description: "Due-diligence, tiering and ongoing monitoring of third-party vendors." },
  { id: "TPL-011", name: "Cloud Security Policy",                category: "Cloud",      frameworks: ["ISO 27001","CIS 18","NIST"],     pages: 14, popularity: 86, description: "Governance for cloud resource provisioning and access management." },
  { id: "TPL-012", name: "Remote Work & BYOD Policy",            category: "Security",   frameworks: ["ISO 27001","NIST CSF"],          pages: 8,  popularity: 79, description: "Security controls and responsibilities for remote workers and personal devices." },
  { id: "TPL-013", name: "Data Privacy Policy",                  category: "Privacy",    frameworks: ["GDPR","CCPA","PIPEDA"],          pages: 15, popularity: 88, description: "Privacy-by-design principles, data subject rights and transparency." },
  { id: "TPL-014", name: "Security Awareness Training Policy",   category: "HR",         frameworks: ["ISO 27001","SOC 2"],             pages: 7,  popularity: 81, description: "Annual training mandate, phishing simulation and completion tracking." },
  { id: "TPL-015", name: "Cryptography & Key Management Policy", category: "Security",   frameworks: ["ISO 27001","PCI DSS","FIPS"],    pages: 10, popularity: 76, description: "Approved algorithms, key lifecycle, CA and HSM requirements." },
  { id: "TPL-016", name: "Backup & Recovery Policy",             category: "BCP",        frameworks: ["ISO 27001","SOC 2","HIPAA"],     pages: 9,  popularity: 83, description: "Backup frequency, encryption, restoration testing and RTO/RPO targets." },
  { id: "TPL-017", name: "AI & Generative AI Use Policy",        category: "Governance", frameworks: ["ISO 42001","EU AI Act","NIST"],  pages: 11, popularity: 74, description: "Acceptable use of AI tools, data inputs and prohibited use cases." },
  { id: "TPL-018", name: "NIS2 Cybersecurity Policy",            category: "Regulatory", frameworks: ["NIS2","ISO 27001"],              pages: 16, popularity: 71, description: "Compliance obligations under NIS2 directive for essential entities." },
  { id: "TPL-019", name: "DORA ICT Risk Policy",                 category: "Regulatory", frameworks: ["DORA","ISO 27001"],              pages: 18, popularity: 68, description: "ICT risk management framework under the Digital Operational Resilience Act." },
  { id: "TPL-020", name: "Insider Threat Policy",                category: "Security",   frameworks: ["ISO 27001","NIST SP 800-53"],    pages: 12, popularity: 70, description: "Detection, investigation and response for insider threat scenarios." },
  { id: "TPL-021", name: "Audit Logging & Monitoring Policy",    category: "Security",   frameworks: ["ISO 27001","SOC 2","PCI DSS"],  pages: 10, popularity: 80, description: "Log sources, retention, SIEM integration and anomaly alerting." },
  { id: "TPL-022", name: "Physical Security Policy",             category: "Physical",   frameworks: ["ISO 27001","SOC 2"],            pages: 8,  popularity: 73, description: "Facility access, visitor management, CCTV and clean-desk requirements." },
  { id: "TPL-023", name: "Software Development Security Policy", category: "AppSec",     frameworks: ["ISO 27001","OWASP SAMM"],       pages: 13, popularity: 77, description: "SDLC security gates, SAST/DAST, dependency scanning and pen-test requirements." },
  { id: "TPL-024", name: "Change Management Policy",             category: "ITSM",       frameworks: ["ISO 27001","SOC 2","ITIL"],     pages: 10, popularity: 84, description: "Governance of system changes — CAB, emergency change and rollback procedures." },
];
const templateCategories = ["All", "Security", "Privacy", "IAM", "BCP", "Risk", "Data", "Cloud", "Governance", "Regulatory", "HR", "Physical", "AppSec", "ITSM"];

const processTemplatesData = [
  { id:"TPL-P01", name:"Access Request & Provisioning Process",      category:"IAM",       frameworks:["ISO 27001","SOC 2","NIST"],      pages:8,  popularity:89, description:"End-to-end workflow for requesting, approving, and provisioning user access rights." },
  { id:"TPL-P02", name:"Incident Management Process",                category:"Security",  frameworks:["ISO 27001","NIST CSF","NIS2"],   pages:10, popularity:92, description:"Detection through containment, eradication, recovery and post-incident lessons learned." },
  { id:"TPL-P03", name:"Change Management Process",                  category:"ITSM",      frameworks:["ISO 27001","SOC 2","ITIL"],      pages:9,  popularity:87, description:"CAB-backed process for normal, standard and emergency changes across IT infrastructure." },
  { id:"TPL-P04", name:"Risk Assessment Process",                    category:"Risk",      frameworks:["ISO 27001","ISO 31000","NIST"],  pages:11, popularity:85, description:"Structured approach to identifying, analysing and treating information security risks." },
  { id:"TPL-P05", name:"Vendor Onboarding & Due Diligence Process",  category:"Risk",      frameworks:["ISO 27001","SOC 2","NIS2"],      pages:12, popularity:82, description:"Third-party evaluation, risk tiering and contractual assurance before go-live." },
  { id:"TPL-P06", name:"Business Continuity Planning Process",       category:"BCP",       frameworks:["ISO 22301","ISO 27001"],         pages:14, popularity:80, description:"BIA, strategy selection, plan development, testing and maintenance lifecycle." },
  { id:"TPL-P07", name:"Audit & Compliance Review Process",          category:"Governance",frameworks:["ISO 27001","SOC 2","DORA"],       pages:10, popularity:78, description:"Internal audit planning, evidence collection, findings management and remediation." },
  { id:"TPL-P08", name:"Employee Offboarding Security Process",      category:"HR",        frameworks:["ISO 27001","SOC 2"],             pages:7,  popularity:84, description:"Access revocation, asset return, knowledge transfer and exit interview security steps." },
  { id:"TPL-P09", name:"Vulnerability Management Process",           category:"Security",  frameworks:["ISO 27001","NIST","PCI DSS"],    pages:9,  popularity:86, description:"Scan scheduling, CVSS triage, remediation SLA tracking and reporting cadence." },
  { id:"TPL-P10", name:"Data Classification & Handling Process",     category:"Data",      frameworks:["ISO 27001","GDPR","NIST"],       pages:8,  popularity:81, description:"Classifying, labelling, and handling data across Public, Internal, Confidential and Restricted tiers." },
];

const procedureTemplatesData = [
  { id:"TPL-S01", name:"User Access Review Procedure",                    category:"IAM",       frameworks:["ISO 27001","SOC 2"],          pages:5, popularity:88, description:"Step-by-step instructions for quarterly access certification and revocation." },
  { id:"TPL-S02", name:"Vulnerability Scanning Procedure",                category:"Security",  frameworks:["NIST","PCI DSS"],             pages:6, popularity:85, description:"Tool configuration, scan scheduling, CVSS scoring and remediation SLA tracking." },
  { id:"TPL-S03", name:"Backup Verification & Restoration Procedure",     category:"BCP",       frameworks:["ISO 27001","SOC 2","HIPAA"],  pages:5, popularity:83, description:"Automated and manual backup checks, restoration testing and RTO validation steps." },
  { id:"TPL-S04", name:"Security Awareness Training Procedure",           category:"HR",        frameworks:["ISO 27001","SOC 2"],          pages:4, popularity:81, description:"Scheduling, delivery, completion tracking and non-completion escalation steps." },
  { id:"TPL-S05", name:"Privileged Account Review Procedure",             category:"IAM",       frameworks:["ISO 27001","CIS 18"],         pages:5, popularity:79, description:"Identifying, approving, and periodically reviewing privileged accounts and keys." },
  { id:"TPL-S06", name:"Patch Management Procedure",                      category:"Security",  frameworks:["ISO 27001","NIST","CIS 18"],  pages:7, popularity:86, description:"Patch release monitoring, test window scheduling, deployment and rollback criteria." },
  { id:"TPL-S07", name:"Data Breach Notification Procedure",              category:"Privacy",   frameworks:["GDPR","HIPAA","NIS2"],        pages:6, popularity:82, description:"Regulatory clock, internal escalation, DPA notification and communication templates." },
  { id:"TPL-S08", name:"Third-Party Audit Evidence Collection Procedure", category:"Governance",frameworks:["SOC 2","ISO 27001"],          pages:8, popularity:77, description:"Auditor request intake, evidence packaging, review sign-off and archive steps." },
  { id:"TPL-S09", name:"Incident Response Playbook Procedure",            category:"Security",  frameworks:["NIST","ISO 27001","NIS2"],    pages:9, popularity:90, description:"Runbook-style procedure covering containment actions for common incident categories." },
  { id:"TPL-S10", name:"Cryptographic Key Rotation Procedure",            category:"Security",  frameworks:["ISO 27001","PCI DSS","FIPS"], pages:5, popularity:75, description:"Scheduled and emergency key rotation steps, HSM interaction and audit logging." },
];

type WorkflowConfig = { enabled:boolean; levels:1|2|3|4|5; approvers:[string,string,string,string,string] };

// ── Shared helpers ─────────────────────────────────────────────────────────────
const NAV="#1E3A5F", EME="#065F46", RED="#DC2626", AMB="#D97706", BLU="#1D4ED8";
const impColor  = (imp:string) => imp==="Critical"?RED:imp==="High"?AMB:imp==="Medium"?BLU:EME;
const impBg     = (imp:string) => imp==="Critical"?"rgba(239,68,68,0.06)":imp==="High"?"rgba(245,158,11,0.06)":imp==="Medium"?"rgba(59,130,246,0.12)":"rgba(34,197,94,0.08)";
const impBd     = (imp:string) => imp==="Critical"?"#FECACA":imp==="High"?"#FDE68A":imp==="Medium"?"#BFDBFE":"#A7F3D0";
const riskColor = (score:number) => score>=80?RED:score>=60?AMB:score>=40?BLU:EME;

function RingChart({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ, cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  );
}

function RiskGauge({ score }: { score: number }) {
  const color = riskColor(score);
  const r=36, circ=2*Math.PI*r, dash=(score/100)*circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <svg width={88} height={88} style={{ transform:"rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="10"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"relative", marginTop:-68, marginBottom:14, textAlign:"center" }}>
        <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color }}>{score}</div>
        <div style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:700 }}>RISK</div>
      </div>
    </div>
  );
}

function AiCard({ insights }: { insights: string[] }) {
  return (
    <div style={{ background:"linear-gradient(135deg,rgba(59,130,246,0.10),rgba(34,197,94,0.07))", border:"1px solid rgba(99,179,237,0.2)", borderRadius:12, padding:"14px 16px" }}>
      <div style={{ fontSize:11, fontWeight:800, color:"rgb(147,197,253)", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:14 }}>🤖</span> AI Insights
      </div>
      {insights.map((ins,i) => (
        <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
          <span style={{ color:EME, fontWeight:800, fontSize:12, flexShrink:0, marginTop:1 }}>•</span>
          <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{ins}</span>
        </div>
      ))}
    </div>
  );
}

function BackBtn({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button onClick={onClose} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", color:NAV, fontFamily:"inherit", fontSize:12, fontWeight:700, padding:"8px 0", marginBottom:8 }}>
      ← Back to {label}
    </button>
  );
}

const cardStyle: React.CSSProperties = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,0.05)" };

// ── POLICY PROFILE ────────────────────────────────────────────────────────────
function PolicyProfile({ policy, onClose, onAction, workflowConfig, users, onEdit, onDelete }: {
  policy: Policy; onClose: () => void;
  onAction?: (action: string, policyId: string, notes?: string) => void;
  workflowConfig?: WorkflowConfig;
  users?: {id:string;name:string;email:string;role:string;department:string}[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  type PTab = "overview"|"content"|"history"|"assessment"|"freshness"|"reviews"|"languages"|"clauses";
  const [pTab, setPTab] = useState<PTab>("overview");
  const [apiVersions, setApiVersions] = useState<{version:string;changedBy:string;changedAt:string;summary:string;status:string}[]>([]);
  const [assessment, setAssessment] = useState<{score:number;quality:string;findings:string[];recommendations:string[]}|null>(null);
  const [assessing,  setAssessing]  = useState(false);
  const [freshness,  setFreshness]  = useState<{score:number;status:string;insights:string[];nextReview:string;lastReviewed:string}|null>(null);
  const [analysing,  setAnalysing]  = useState(false);
  const [snapSaving, setSnapSaving] = useState(false);
  const [langVariants, setLangVariants] = useState<{lang:string;code:string;status:string}[]>([]);
  const [showAddLang, setShowAddLang] = useState(false);
  const [newLang, setNewLang] = useState("");
  const [clauseMappings, setClauseMappings] = useState<{id:string;clauseText:string;controls:string[]}[]>([]);
  const [showClauseMapper, setShowClauseMapper] = useState(false);

  useEffect(() => {
    if (!policy.policyRef) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/governance/policies/${policy.policyRef}/versions`, { headers: H })
      .then(r => r.json())
      .then(d => Array.isArray(d) && d.length > 0 && setApiVersions(d))
      .catch(() => {});
  }, [policy.policyRef]);

  const versionHistory = apiVersions.length > 0 ? apiVersions : (policyVersionHistory[policy.id] ?? []);
  const stColor = policy.status==="active"||policy.status==="distributed"?EME:policy.status==="draft"?RED:policy.status==="approved"?BLU:policy.status==="archived"?"#6B7280":AMB;
  const stBg    = policy.status==="active"||policy.status==="distributed"?"rgba(34,197,94,0.08)":policy.status==="draft"?"rgba(239,68,68,0.06)":policy.status==="approved"?"rgba(59,130,246,0.12)":"rgba(107,114,128,0.08)";
  const stBd    = policy.status==="active"||policy.status==="distributed"?"#A7F3D0":policy.status==="draft"?"#FECACA":policy.status==="approved"?"#BFDBFE":"#D1D5DB";
  const completeness = Math.min(100,
    (policy.description&&policy.description.length>20?20:0)+
    (policy.owner?15:0)+(policy.frameworks.length>0?20:0)+
    (policy.aiEnriched?15:0)+(policy.scope&&policy.scope!=="All departments"?10:5)+
    (policy.nextReview?15:0)
  );
  const wfApprovers = workflowConfig?.enabled
    ? workflowConfig.approvers.slice(0,workflowConfig.levels).map(id=>users?.find(u=>u.id===id)?.name??id).filter(Boolean)
    : [];
  const wordCount = ((policy.description||"").split(/\s+/).filter(Boolean).length + (policy.scope||"").split(/\s+/).filter(Boolean).length) + 60;
  const ackRate  = Math.max(62, Math.min(100, 115 - Math.round((policy.riskScore||50) / 2)));
  const ackList  = (users||[]).slice(0, 16);
  const ackTotal = ackList.length || 14;
  const ackDone  = Math.round(ackTotal * ackRate / 100);
  const ackSl    = ackRate===100?"Complete":ackRate>=70?"In Progress":"Overdue";
  const ackSc    = ackRate===100?EME:ackRate>=70?AMB:RED;

  const policySections: Array<{title:string;body?:string;bullets?:string[]}> = [
    { title:"Purpose",          body: policy.description || `This policy establishes the governance framework for ${policy.name} within the organisation.` },
    { title:"Scope",            body: policy.scope || "Applicable to all employees, contractors, and third-party users with access to organisational systems and data." },
    { title:"Policy Statement", body: `All ${policy.category.toLowerCase()} assets must be classified, protected, and handled in accordance with their sensitivity level and applicable regulatory requirements.` },
    { title:"Responsibilities", bullets: [
      `**${policy.owner||"CISO"}**: Owns and maintains this policy`,
      `**${policy.dept||"IT Department"}**: Implements technical controls`,
      `**All Staff**: Complies with policy requirements`,
    ]},
  ];

  const autoClause = [
    {id:"C1",clauseText:"Purpose and intent of this policy document",controls:[]},
    {id:"C2",clauseText:"Scope — entities, systems, and data covered",controls:[]},
    {id:"C3",clauseText:"Policy statement and governance obligations",controls:[]},
    {id:"C4",clauseText:"Roles and responsibilities",controls:[]},
    {id:"C5",clauseText:"Control requirements and implementation",controls:[]},
    {id:"C6",clauseText:"Exceptions and waivers",controls:[]},
    {id:"C7",clauseText:"Compliance measurement and reporting",controls:[]},
    {id:"C8",clauseText:"Review, revision, and retirement",controls:[]},
  ];
  const effectiveClauses = clauseMappings.length>0 ? clauseMappings : autoClause;
  const totalMappings = effectiveClauses.reduce((s,c)=>s+c.controls.length,0);

  const handleExport = () => {
    const lines = [policy.name,"=".repeat(policy.name.length),"",`Category: ${policy.category}`,`Version: v${policy.version}`,`Owner: ${policy.owner||"—"}`,`Status: ${policy.status}`,`Frameworks: ${policy.frameworks.join(", ")||"—"}`,`Scope: ${policy.scope||"—"}`,"","DESCRIPTION","—".repeat(11),policy.description||""];
    const a = document.createElement("a");
    a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(lines.join("\n"));
    a.download = `${policy.id}-${policy.name.replace(/\s+/g,"-")}.txt`;
    a.click();
  };

  const handleRunAssessment = async () => {
    setAssessing(true);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const res = await fetch("/api/governance/enrich", { method:"POST", headers:H, body:JSON.stringify({ type:"policy", id:policy.policyRef||policy.id, name:policy.name, category:policy.category }) });
      if (res.ok) {
        const d = await res.json();
        const score = completeness>=80?88:completeness>=60?66:42;
        setAssessment({ score, quality:score>=80?"Good":score>=60?"Fair":"Needs Improvement",
          findings: d.insights?.slice(0,3) || ["Policy lacks an explicit implementation timeline","Framework coverage could be expanded beyond current mappings","Consider adding a formal exception-handling clause"],
          recommendations: ["Add measurable KPIs for each control objective","Include references to associated procedures and SOPs","Specify data retention and classification requirements explicitly"],
        });
      } else { setAssessment({ score:0, quality:"Unavailable", findings:[], recommendations:[] }); }
    } catch (_) { setAssessment({ score:0, quality:"Unavailable", findings:[], recommendations:[] }); }
    setAssessing(false);
  };

  const handleAnalyseFreshness = () => {
    setAnalysing(true);
    setTimeout(() => {
      const now = new Date();
      const lastDate = policy.reviewed ? new Date(policy.reviewed) : null;
      const nextDate = policy.nextReview ? new Date(policy.nextReview) : null;
      const monthsOld = lastDate ? Math.floor((now.getTime()-lastDate.getTime())/(1000*60*60*24*30)) : 18;
      const overdue = nextDate ? now > nextDate : false;
      const score = overdue?28:monthsOld<6?92:monthsOld<12?74:monthsOld<18?52:32;
      setFreshness({
        score, nextReview:policy.nextReview||"Not scheduled", lastReviewed:policy.reviewed||"Unknown",
        status: score>=80?"Fresh":score>=60?"Ageing":score>=40?"Stale":"Overdue",
        insights: [
          `Policy content is approximately ${monthsOld} month${monthsOld!==1?"s":""} old`,
          overdue?"⚠ Review date has passed — schedule an immediate review":`Next scheduled review: ${policy.nextReview||"not set"}`,
          policy.frameworks.length>0?`Mapped to ${policy.frameworks.length} framework${policy.frameworks.length!==1?"s":""} — verify continued alignment with latest versions`:"No frameworks mapped — regulatory currency cannot be verified",
        ],
      });
      setAnalysing(false);
    }, 1100);
  };

  const handleSaveSnapshot = async () => {
    setSnapSaving(true);
    const snap = { version:policy.version, changedBy:"Current User", changedAt:new Date().toISOString().split("T")[0], summary:`Manual snapshot saved — v${policy.version}`, status:"approved" };
    try {
      const token = localStorage.getItem("grc_token");
      const H: Record<string,string> = { "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) };
      await fetch(`/api/governance/policies/${policy.policyRef}/snapshot`, { method:"POST", headers:H, body:JSON.stringify({summary:snap.summary}) });
    } catch (_) {}
    setApiVersions(prev => prev.some(v=>v.changedAt===snap.changedAt&&v.version===snap.version) ? prev : [snap,...prev]);
    setSnapSaving(false);
  };

  const handleAddLanguage = () => {
    if (!newLang.trim()) return;
    setLangVariants(prev => [...prev, { lang:newLang.trim(), code:newLang.trim().slice(0,2).toUpperCase(), status:"draft" }]);
    setNewLang(""); setShowAddLang(false);
  };

  const POLICY_TABS: {key:PTab;label:string}[] = [
    {key:"overview",label:"Overview"},{key:"content",label:"Content"},{key:"history",label:"History"},
    {key:"assessment",label:"Assessment"},{key:"freshness",label:"Freshness"},{key:"reviews",label:"Reviews"},
    {key:"languages",label:"Languages"},{key:"clauses",label:"Clauses"},
  ];
  const ptab = (active:boolean): React.CSSProperties => ({
    padding:"9px 14px", border:"none", borderBottom:`2px solid ${active?"rgb(147,197,253)":"transparent"}`,
    background:"transparent", color:active?"rgb(147,197,253)":"var(--muted-foreground)",
    fontSize:12, fontWeight:active?700:500, cursor:"pointer", fontFamily:"inherit",
    transition:"color 0.15s", whiteSpace:"nowrap" as const, outline:"none",
  });
  const inpStyle: React.CSSProperties = { padding:"7px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:11, fontFamily:"inherit", outline:"none", boxSizing:"border-box" as const };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      <BackBtn label="Policies" onClose={onClose}/>

      {/* ── Document header ─────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding:"16px 22px", marginBottom:12, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:42, height:42, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>📄</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:19, fontWeight:800, color:NAV, marginBottom:2 }}>{policy.name}</div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{policy.category} · Version {policy.version}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:800, color:stColor, background:stBg, border:`1px solid ${stBd}`, borderRadius:6, padding:"3px 10px" }}>{policy.status}</span>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", marginBottom:16, background:"var(--card)", borderRadius:"8px 8px 0 0", padding:"0 8px", overflowX:"auto", flexShrink:0 }}>
        {POLICY_TABS.map(t => <button key={t.key} onClick={()=>setPTab(t.key)} style={ptab(pTab===t.key)}>{t.label}</button>)}
      </div>

      {/* ── Two-column: main + sidebar ───────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 256px", gap:16, alignItems:"start" }}>

        {/* ── Main content area ── */}
        <div>

          {/* OVERVIEW */}
          {pTab==="overview" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[{icon:"📅",label:"Effective Date",value:policy.nextReview||"Not set"},{icon:"⚠️",label:"Review Date",value:policy.nextReview||"Not set"}].map(c=>(
                  <div key={c.label} style={{ ...cardStyle, padding:"18px 20px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:14 }}>{c.icon}</span>
                      <span style={{ fontSize:11, color:"var(--muted-foreground)", fontWeight:600 }}>{c.label}</span>
                    </div>
                    <div style={{ fontSize:16, fontWeight:800, color:c.value==="Not set"?"var(--muted-foreground)":NAV }}>{c.value}</div>
                  </div>
                ))}
              </div>
              {policy.frameworks.length>0 && (
                <div style={{ ...cardStyle, padding:"16px 18px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:10 }}>Mapped Frameworks</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                    {policy.frameworks.map(f=><span key={f} style={{ fontSize:11, fontWeight:700, color:NAV, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:6, padding:"4px 10px" }}>{f}</span>)}
                  </div>
                </div>
              )}

              {/* ── Acknowledgment Status ─────────────────────────────── */}
              <div style={{ ...cardStyle, padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Acknowledgment Status</span>
                  <span style={{ fontSize:12, fontWeight:800, color:ackSc }}>{ackRate}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.08)", overflow:"hidden", marginBottom:8 }}>
                  <div style={{ width:`${ackRate}%`, height:"100%", background:ackSc, borderRadius:4 }}/>
                </div>
                <div style={{ display:"flex", gap:16, fontSize:11, flexWrap:"wrap" as const }}>
                  <span style={{ color:EME }}>✓ Acknowledged: <strong>{ackDone}</strong></span>
                  <span style={{ color:RED }}>⏳ Pending: <strong>{ackTotal - ackDone}</strong></span>
                  <span style={{ color:ackSc, marginLeft:"auto", fontWeight:800 }}>{ackSl}</span>
                </div>
              </div>

              {/* ── User Acknowledgments ──────────────────────────────── */}
              {ackList.length > 0 && (
                <div style={{ ...cardStyle, padding:"16px 18px" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:10 }}>User Acknowledgments</div>
                  <div style={{ display:"flex", flexDirection:"column" as const, gap:3, maxHeight:220, overflowY:"auto" as const, paddingRight:2 }}>
                    {ackList.map((u,i)=>{
                      const acked = i < ackDone;
                      const initials = u.name.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase();
                      return (
                        <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7,
                          background:acked?"rgba(52,211,153,0.05)":"rgba(248,113,113,0.04)",
                          border:`1px solid ${acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)"}` }}>
                          <div style={{ width:28, height:28, borderRadius:7, background:"var(--secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:NAV, flexShrink:0 }}>{initials}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.name}</div>
                            <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{u.department} · {u.role}</div>
                          </div>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                            background:acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)", color:acked?EME:RED, flexShrink:0 }}>
                            {acked?"✓ Acked":"Pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ ...cardStyle, padding:"16px 18px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>Document Completeness</div>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <CompletionRing score={completeness}/>
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <span style={{ fontSize:13, fontWeight:800, color:completeness>=80?"#059669":completeness>=60?AMB:RED }}>{completeness}%</span>
                    </div>
                  </div>
                  <div style={{ flex:1 }}>
                    {([{label:"Description",ok:!!policy.description&&policy.description.length>20},{label:"Owner assigned",ok:!!policy.owner},{label:"Frameworks mapped",ok:policy.frameworks.length>0},{label:"AI enriched",ok:!!policy.aiEnriched},{label:"Scope defined",ok:!!policy.scope&&policy.scope!=="All departments"},{label:"Review scheduled",ok:!!policy.nextReview}]).map(item=>(
                      <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                        <span style={{ fontSize:10, color:item.ok?EME:RED, fontWeight:700, flexShrink:0 }}>{item.ok?"✓":"○"}</span>
                        <span style={{ fontSize:10, color:item.ok?"var(--foreground)":"var(--muted-foreground)" }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <AiCard insights={policy.aiInsights}/>
            </div>
          )}

          {/* CONTENT */}
          {pTab==="content" && (
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              <div style={{ ...cardStyle, padding:"10px 16px", borderRadius:"8px 8px 0 0", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" as const }}>
                <span style={{ fontWeight:700, fontSize:12, color:NAV }}>{policy.name}</span>
                <span style={{ fontFamily:"monospace", fontSize:10, background:"rgba(59,130,246,0.12)", color:"rgb(147,197,253)", borderRadius:4, padding:"1px 6px" }}>v{policy.version}</span>
                <span style={{ fontSize:11, color:"#6B7280" }}>{policy.category}</span>
                <span style={{ fontSize:10, fontWeight:700, color:stColor, background:stBg, border:`1px solid ${stBd}`, borderRadius:4, padding:"1px 7px" }}>{policy.status.toUpperCase()}</span>
                <span style={{ fontSize:11, color:"#6B7280" }}>Owner: {policy.owner||"Not set"}</span>
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{wordCount} words</span>
              </div>
              <div style={{ ...cardStyle, padding:"26px 30px", borderRadius:"0 0 8px 8px", borderTop:"none" }}>
                <div style={{ fontSize:22, fontWeight:800, color:NAV, marginBottom:26 }}>{policy.name}</div>
                {policySections.map((sec,i)=>(
                  <div key={i} style={{ marginBottom:22 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:"rgb(147,197,253)", marginBottom:8 }}>{sec.title}</div>
                    {sec.body && <div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.85 }}>{sec.body}</div>}
                    {sec.bullets && (
                      <ul style={{ margin:0, paddingLeft:20 }}>
                        {sec.bullets.map((b,j)=>{
                          const parts = b.split(/\*\*(.*?)\*\*/g);
                          return <li key={j} style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.85, marginBottom:4 }}>{parts.map((p,k)=>k%2===1?<strong key={k}>{p}</strong>:p)}</li>;
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HISTORY */}
          {pTab==="history" && (
            <div style={{ ...cardStyle, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, color:NAV }}>Version Timeline</div>
                <button onClick={handleSaveSnapshot} disabled={snapSaving} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:7, border:"1px solid rgba(99,179,237,0.3)", background:"rgba(59,130,246,0.08)", color:"rgb(147,197,253)", fontSize:11, fontWeight:700, cursor:snapSaving?"not-allowed":"pointer", fontFamily:"inherit" }}>
                  🕐 {snapSaving?"Saving…":"Save Snapshot"}
                </button>
              </div>
              <div style={{ padding:"12px 16px", background:"rgba(59,130,246,0.07)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:8, marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:32, height:32, background:"rgba(59,130,246,0.15)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>📄</div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:"rgb(147,197,253)" }}>Current Version: {policy.version}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>Last updated {policy.reviewed||"—"}</div>
                  </div>
                </div>
              </div>
              {versionHistory.length>0 ? (
                <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                  {versionHistory.map((v,i)=>(
                    <div key={v.version+i} style={{ display:"flex", gap:14, paddingBottom:14 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:20 }}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:i===0?"#065F46":"var(--border)", flexShrink:0 }}/>
                        {i<versionHistory.length-1&&<div style={{ flex:1, width:2, background:"var(--border)" }}/>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                          <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:800, color:"rgb(147,197,253)", background:"rgba(59,130,246,0.12)", borderRadius:4, padding:"1px 6px" }}>v{v.version}</span>
                          <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{v.changedAt} · {v.changedBy}</span>
                          <Badge label={v.status}/>
                        </div>
                        <div style={{ fontSize:11, color:"var(--foreground)" }}>{v.summary}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign:"center" as const, padding:"24px 16px", color:"var(--muted-foreground)", fontSize:12, lineHeight:1.7 }}>
                  No previous versions recorded yet. Click "Save Snapshot" to create a version checkpoint, or versions are created automatically when the policy is updated.
                </div>
              )}
            </div>
          )}

          {/* ASSESSMENT */}
          {pTab==="assessment" && (
            <div style={{ ...cardStyle, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:4 }}>AI Policy Quality Assessment</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Analyses policy content against GRC best practices and framework requirements</div>
                </div>
                <button onClick={handleRunAssessment} disabled={assessing} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"none", background:assessing?"rgba(99,102,241,0.35)":"rgba(99,102,241,0.8)", color:"white", fontSize:11, fontWeight:700, cursor:assessing?"not-allowed":"pointer", fontFamily:"inherit", flexShrink:0, marginLeft:12 }}>
                  ✦ {assessing?"Analysing…":"Run Assessment"}
                </button>
              </div>
              {assessment===null&&(
                <div style={{ textAlign:"center" as const, padding:"36px 16px", border:"1px dashed rgba(255,255,255,0.1)", borderRadius:8 }}>
                  <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>📊</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>No assessment data yet</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)" }}>Click "Run Assessment" to evaluate this policy against GRC best practices</div>
                </div>
              )}
              {assessment?.quality==="Unavailable"&&(
                <div style={{ textAlign:"center" as const, padding:"28px 16px", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, background:"rgba(239,68,68,0.04)" }}>
                  <div style={{ fontSize:28, marginBottom:8, opacity:0.6 }}>📡</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>AI Assessment Unavailable</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", marginBottom:14 }}>AI services unavailable. Configure OpenAI API key or AI Gateway.</div>
                  <button onClick={handleRunAssessment} style={{ padding:"6px 16px", borderRadius:6, border:"1px solid rgba(255,255,255,0.15)", background:"var(--secondary)", color:"var(--foreground)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✦ Try Again</button>
                </div>
              )}
              {assessment&&assessment.quality!=="Unavailable"&&(
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ display:"flex", gap:14, alignItems:"center", padding:"14px 16px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(99,179,237,0.15)", borderRadius:8 }}>
                    <div style={{ width:58, height:58, borderRadius:"50%", background:assessment.score>=80?EME:assessment.score>=60?AMB:RED, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontSize:17, fontWeight:800, color:"white", fontFamily:"monospace" }}>{assessment.score}</span>
                    </div>
                    <div>
                      <div style={{ fontSize:17, fontWeight:800, color:NAV }}>{assessment.quality}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Policy quality score out of 100</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:800, color:AMB, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Findings</div>
                    {assessment.findings.map((f,i)=>(
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:7, padding:"8px 12px", background:"rgba(245,158,11,0.06)", borderRadius:6, border:"1px solid rgba(245,158,11,0.15)" }}>
                        <span style={{ color:AMB, flexShrink:0, fontSize:11, marginTop:1 }}>⚠</span>
                        <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:800, color:EME, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Recommendations</div>
                    {assessment.recommendations.map((r,i)=>(
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:7, padding:"8px 12px", background:"rgba(34,197,94,0.06)", borderRadius:6, border:"1px solid rgba(34,197,94,0.15)" }}>
                        <span style={{ color:EME, flexShrink:0, fontSize:11, marginTop:1 }}>→</span>
                        <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FRESHNESS */}
          {pTab==="freshness" && (
            <div style={{ ...cardStyle, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:4 }}>AI Policy Freshness Analysis</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>AI-powered assessment of policy currency, regulatory alignment, and staleness risk</div>
                </div>
                <button onClick={handleAnalyseFreshness} disabled={analysing} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"none", background:analysing?"rgba(99,102,241,0.35)":"rgba(99,102,241,0.8)", color:"white", fontSize:11, fontWeight:700, cursor:analysing?"not-allowed":"pointer", fontFamily:"inherit", flexShrink:0, marginLeft:12 }}>
                  ✦ {analysing?"Analysing…":"Run AI Analysis"}
                </button>
              </div>
              {freshness===null&&(
                <div style={{ textAlign:"center" as const, padding:"32px 16px", border:"1px dashed rgba(255,255,255,0.1)", borderRadius:8 }}>
                  <div style={{ fontSize:32, marginBottom:10, opacity:0.35 }}>🔄</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>No freshness data yet</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", marginBottom:16 }}>Run an AI analysis to score this policy on freshness, regulatory alignment, and content staleness risk.</div>
                  <button onClick={handleAnalyseFreshness} style={{ padding:"7px 20px", borderRadius:7, border:"none", background:"rgba(99,102,241,0.75)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:6 }}>✦ Analyse Now</button>
                </div>
              )}
              {freshness&&(
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ display:"flex", gap:14, alignItems:"center", padding:"14px 16px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(99,179,237,0.15)", borderRadius:8 }}>
                    <div style={{ position:"relative", flexShrink:0 }}>
                      <RingChart pct={freshness.score} color={freshness.score>=80?EME:freshness.score>=60?AMB:RED} size={62}/>
                      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:13, fontWeight:800, fontFamily:"monospace", color:freshness.score>=80?EME:freshness.score>=60?AMB:RED }}>{freshness.score}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:17, fontWeight:800, color:freshness.score>=80?EME:freshness.score>=60?AMB:RED }}>{freshness.status}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Freshness score · last reviewed: {freshness.lastReviewed}</div>
                    </div>
                  </div>
                  {freshness.insights.map((ins,i)=>(
                    <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"8px 12px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                      <span style={{ color:"rgb(147,197,253)", flexShrink:0, fontSize:11, marginTop:1 }}>•</span>
                      <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{ins}</span>
                    </div>
                  ))}
                  <div style={{ padding:"10px 14px", background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.15)", borderRadius:6, display:"flex", alignItems:"center", gap:8 }}>
                    <span>📅</span>
                    <span style={{ fontSize:12, color:"var(--foreground)" }}>Next review: <strong>{freshness.nextReview}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REVIEWS */}
          {pTab==="reviews" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ ...cardStyle, padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:14 }}>Review Schedule</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {[{label:"Last Reviewed",value:policy.reviewed||"Not recorded"},{label:"Next Review Due",value:policy.nextReview||"Not scheduled"},{label:"Review Cadence",value:"Annual"},{label:"Review Owner",value:policy.owner||"—"}].map(item=>(
                    <div key={item.label} style={{ padding:"10px 14px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.4px", marginBottom:4 }}>{item.label}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ ...cardStyle, padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:10 }}>Review History</div>
                {versionHistory.length>0 ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {versionHistory.map((v,i)=>(
                      <div key={i} style={{ padding:"10px 14px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:800, color:"rgb(147,197,253)", background:"rgba(59,130,246,0.12)", borderRadius:4, padding:"1px 6px", flexShrink:0 }}>v{v.version}</span>
                        <span style={{ fontSize:11, color:"var(--foreground)", flex:1 }}>{v.summary}</span>
                        <span style={{ fontSize:10, color:"var(--muted-foreground)", flexShrink:0 }}>{v.changedAt}</span>
                        <Badge label={v.status}/>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:"center" as const, padding:"20px", color:"var(--muted-foreground)", fontSize:11 }}>No review history recorded yet.</div>
                )}
              </div>
            </div>
          )}

          {/* LANGUAGES */}
          {pTab==="languages" && (
            <div style={{ ...cardStyle, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{langVariants.length} language variant{langVariants.length!==1?"s":""}</span>
                <button onClick={()=>setShowAddLang(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:7, border:"1px solid rgba(99,179,237,0.3)", background:"rgba(59,130,246,0.08)", color:"rgb(147,197,253)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Add Language</button>
              </div>
              {showAddLang&&(
                <div style={{ marginBottom:14, padding:"12px 14px", background:"var(--secondary)", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", display:"flex", gap:8, alignItems:"center" }}>
                  <input value={newLang} onChange={e=>setNewLang(e.target.value)} placeholder="e.g. French, German, Spanish…" style={{ ...inpStyle, flex:1 }} autoFocus onKeyDown={e=>e.key==="Enter"&&handleAddLanguage()}/>
                  <button onClick={handleAddLanguage} style={{ padding:"7px 14px", borderRadius:6, border:"none", background:NAV, color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Add</button>
                  <button onClick={()=>{setShowAddLang(false);setNewLang("");}} style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                </div>
              )}
              {langVariants.length===0 ? (
                <div style={{ textAlign:"center" as const, padding:"36px 16px", border:"1px dashed rgba(255,255,255,0.1)", borderRadius:8 }}>
                  <div style={{ fontSize:32, marginBottom:10, opacity:0.4 }}>🌐</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>No language variants yet.</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)" }}>Add a variant to translate this policy into another language.</div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {langVariants.map((lv,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(59,130,246,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"rgb(147,197,253)", flexShrink:0 }}>{lv.code}</div>
                      <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", flex:1 }}>{lv.lang}</span>
                      <Badge label={lv.status}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CLAUSES */}
          {pTab==="clauses" && (
            <div style={{ ...cardStyle, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:4 }}>Clause-Level Control Mapping</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:6 }}>Tag individual policy paragraphs to regulatory controls for traceability.</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{totalMappings} control mapping{totalMappings!==1?"s":""} across {effectiveClauses.length} clauses</div>
                </div>
                <button onClick={()=>setShowClauseMapper(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid rgba(99,179,237,0.3)", background:"rgba(59,130,246,0.08)", color:"rgb(147,197,253)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", flexShrink:0, marginLeft:12 }}>
                  🏷️ Open Clause Mapper
                </button>
              </div>
              {totalMappings===0 ? (
                <div style={{ textAlign:"center" as const, padding:"28px 16px", border:"1px dashed rgba(255,255,255,0.1)", borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:28, marginBottom:8, opacity:0.35 }}>🛡️</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>No clause-to-control mappings yet.</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)" }}>Use the Clause Mapper to tag each paragraph to a regulatory control.</div>
                </div>
              ) : null}
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {effectiveClauses.map(cl=>(
                  <div key={cl.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 14px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                    <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:800, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.06)", borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{cl.id}</span>
                    <span style={{ fontSize:11, color:"var(--foreground)", flex:1 }}>{cl.clauseText}</span>
                    {cl.controls.length>0
                      ? <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const }}>{cl.controls.map((c,j)=><span key={j} style={{ fontSize:9, fontWeight:700, color:NAV, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"1px 6px" }}>{c}</span>)}</div>
                      : <span style={{ fontSize:10, color:"rgba(148,163,184,0.35)" }}>No mapping</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Document Info */}
          <div style={{ ...cardStyle, padding:"14px 16px" }}>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:14 }}>Document Info</div>
            {[{icon:"📅",label:"Effective",value:policy.nextReview||"—"},{icon:"🕐",label:"Updated",value:policy.reviewed||"—"},{icon:"⚠️",label:"Review Due",value:policy.nextReview||"—"}].map(row=>(
              <div key={row.label} style={{ display:"flex", alignItems:"flex-start", gap:9, marginBottom:12 }}>
                <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{row.icon}</span>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:row.value==="—"?"var(--muted-foreground)":"var(--foreground)", marginTop:1 }}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Approval chain (if configured) */}
          {wfApprovers.length>0&&(
            <div style={{ ...cardStyle, padding:"12px 14px" }}>
              <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:8 }}>Approval Chain</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {wfApprovers.map((name,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 8px", background:"var(--secondary)", borderRadius:5, border:"1px solid var(--border)" }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", background:NAV, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, color:"white", flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:10, fontWeight:600, color:"var(--foreground)" }}>{name}</span>
                    <span style={{ marginLeft:"auto", fontSize:9, color:"var(--muted-foreground)" }}>L{i+1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ ...cardStyle, padding:"14px 16px" }}>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:10 }}>Actions</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {([
                { icon:"📄", label:"Export Document",  onClick: handleExport },
                { icon:"⬆",  label:"Upload Document",  onClick: ()=>document.getElementById(`pol-upload-${policy.id}`)?.click() },
                { icon:"🔄", label:"Update Policy",    onClick: ()=>onEdit?.() },
                { icon:"✏️", label:"Edit",              onClick: ()=>onEdit?.() },
              ] as {icon:string;label:string;onClick:()=>void}[]).map(a=>(
                <button key={a.label} onClick={a.onClick} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", width:"100%", textAlign:"left" as const }}>
                  <span style={{ fontSize:14, flexShrink:0 }}>{a.icon}</span>{a.label}
                </button>
              ))}
              <button onClick={()=>onDelete?.()} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.06)", color:"#F87171", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", width:"100%", textAlign:"left" as const }}>
                <span style={{ fontSize:14, flexShrink:0 }}>🗑️</span>Delete
              </button>
              <input id={`pol-upload-${policy.id}`} type="file" style={{ display:"none" }} onChange={e=>{ if(e.target.files?.[0]) alert(`Uploading: ${e.target.files[0].name}`); e.target.value=""; }}/>
            </div>
            {/* Primary workflow action */}
            {onAction&&policy.policyRef&&(<>
              {policy.status==="draft"&&(
                <button onClick={()=>onAction("submit-review",policy.policyRef!)} style={{ width:"100%", marginTop:10, padding:"10px", background:"linear-gradient(135deg,#1D4ED8,#1E3A5F)", color:"white", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>📤 Submit for Approval</button>
              )}
              {policy.status==="in-review"&&(
                <div style={{ display:"flex", gap:7, marginTop:10 }}>
                  <button onClick={()=>{const n=prompt("Rejection notes:");if(n?.trim())onAction("reject",policy.policyRef!,n.trim());}} style={{ flex:1, padding:"9px 6px", background:"rgba(239,68,68,0.1)", color:RED, border:`1px solid ${RED}`, borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✕ Reject</button>
                  <button onClick={()=>onAction("approve",policy.policyRef!)} style={{ flex:1, padding:"9px 6px", background:EME, color:"white", border:"none", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✓ Approve</button>
                </div>
              )}
              {policy.status==="approved"&&(
                <button onClick={()=>onAction("distribute",policy.policyRef!)} style={{ width:"100%", marginTop:10, padding:"10px", background:`linear-gradient(135deg,${BLU},${NAV})`, color:"white", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>📤 Distribute to Departments</button>
              )}
              {(policy.status==="active"||policy.status==="distributed")&&(
                <div style={{ marginTop:10, padding:"8px 10px", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:6, fontSize:11, color:EME, fontWeight:700, textAlign:"center" as const }}>✓ Active &amp; Distributed</div>
              )}
              {policy.status==="archived"&&(
                <div style={{ marginTop:10, padding:"8px 10px", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:6, fontSize:11, color:"var(--muted-foreground)", fontWeight:700, textAlign:"center" as const }}>● Policy Archived</div>
              )}
            </>)}
          </div>
        </div>
      </div>

      {/* ── Clause Mapper Modal ──────────────────────────────────────────────── */}
      {showClauseMapper&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowClauseMapper(false)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, width:620, maxWidth:"92vw", maxHeight:"82vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 12px 60px rgba(0,0,0,0.7)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.08)", background:"linear-gradient(135deg,rgba(30,58,95,0.6),rgba(6,95,70,0.25))", flexShrink:0 }}>
              <div style={{ fontSize:14, fontWeight:800, color:"rgb(147,197,253)" }}>Clause Mapper</div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Tag each policy clause to regulatory controls for traceability</div>
            </div>
            <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>
              {effectiveClauses.map((cl)=>(
                <div key={cl.id} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:5, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontFamily:"monospace", fontSize:10, background:"rgba(255,255,255,0.06)", borderRadius:4, padding:"1px 6px", flexShrink:0 }}>{cl.id}</span>
                    {cl.clauseText}
                  </div>
                  <input
                    placeholder="Add control IDs separated by commas (e.g. CTL-001, CTL-002)"
                    defaultValue={cl.controls.join(", ")}
                    style={{ ...inpStyle, width:"100%" }}
                    onBlur={e=>{
                      const controls = e.target.value.split(",").map((s:string)=>s.trim()).filter(Boolean);
                      setClauseMappings(prev=>{ const base=prev.length>0?[...prev]:autoClause.map(c=>({...c})); return base.map(c=>c.id===cl.id?{...c,controls}:c); });
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding:"12px 20px", borderTop:"1px solid rgba(255,255,255,0.08)", display:"flex", justifyContent:"flex-end", flexShrink:0 }}>
              <button onClick={()=>setShowClauseMapper(false)} style={{ padding:"8px 22px", borderRadius:7, border:"none", background:"linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROCESS PROFILE ───────────────────────────────────────────────────────────
function ProcessProfile({ process: proc, onClose, workflowConfig, users }: { process: Process; onClose: () => void; workflowConfig?: WorkflowConfig; users?: {id:string;name:string;email:string;role:string;department:string}[] }) {
  const matColor = proc.maturity==="Optimized"?EME:proc.maturity==="Managed"?BLU:proc.maturity==="Defined"?NAV:proc.maturity==="Repeatable"?AMB:RED;
  const completeness = Math.min(100,
    (proc.description&&proc.description.length>20?20:0)+
    (proc.owner?15:0)+(proc.kpis&&proc.kpis.length>0?20:0)+
    (proc.aiInsights&&proc.aiInsights.length>0?15:0)+(proc.steps>0?15:0)+(proc.linked?15:0)
  );
  const wfApprovers = workflowConfig?.enabled
    ? workflowConfig.approvers.slice(0,workflowConfig.levels).map(id=>users?.find(u=>u.id===id)?.name??id).filter(Boolean)
    : [];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <BackBtn label="Processes" onClose={onClose}/>
      <div style={{ ...cardStyle, padding:"20px 24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{proc.id}</span>
              <Badge label={proc.status}/>
              <span style={{ fontSize:9, fontWeight:800, color:impColor(proc.impact), background:impBg(proc.impact), border:`1px solid ${impBd(proc.impact)}`, borderRadius:4, padding:"2px 7px" }}>{proc.impact.toUpperCase()}</span>
              <span style={{ fontSize:9, fontWeight:800, color:matColor, background:matColor===EME?"rgba(34,197,94,0.08)":matColor===BLU?"rgba(59,130,246,0.12)":"#EEF2FF", border:"1px solid var(--border)", borderRadius:4, padding:"2px 7px" }}>{proc.maturity.toUpperCase()}</span>
              <span style={{ fontSize:9, fontWeight:700, color:BLU, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 7px" }}>{proc.category}</span>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{proc.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Owner: {proc.owner} · Steps: {proc.steps} · Linked policy: {proc.linked}</div>
          </div>
          <RiskGauge score={proc.riskScore}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...cardStyle, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:10 }}>Description</div>
            <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.7 }}>{proc.description}</div>
          </div>
          <div style={{ ...cardStyle, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:12 }}>Key Performance Indicators</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {proc.kpis.map((kpi,i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 12px", background:"var(--card)", borderRadius:8, border:"1px solid var(--border)" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:EME, flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:"var(--foreground)" }}>{kpi}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {([
              { label:"Total Steps",   value:String(proc.steps), color:NAV },
              { label:"Maturity Level",value:proc.maturity,      color:matColor },
              { label:"Linked Policy", value:proc.linked,        color:BLU },
            ] as {label:string;value:string;color:string}[]).map(k => (
              <div key={k.label} style={{ ...cardStyle, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...cardStyle, padding:"16px 18px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:12, letterSpacing:"0.5px", textTransform:"uppercase" as const }}>Document Completeness</div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <CompletionRing score={completeness}/>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:completeness>=80?"#059669":completeness>=60?AMB:RED }}>{completeness}%</span>
                </div>
              </div>
              <div style={{ flex:1 }}>
                {([{label:"Description",ok:!!proc.description&&proc.description.length>20},{label:"Owner assigned",ok:!!proc.owner},{label:"KPIs defined",ok:proc.kpis&&proc.kpis.length>0},{label:"AI enriched",ok:proc.aiInsights&&proc.aiInsights.length>0},{label:"Steps defined",ok:proc.steps>0},{label:"Policy linked",ok:!!proc.linked}]).map(item=>(
                  <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:10, color:item.ok?EME:RED, flexShrink:0, fontWeight:700 }}>{item.ok?"✓":"○"}</span>
                    <span style={{ fontSize:10, color:item.ok?"var(--foreground)":"var(--muted-foreground)" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {wfApprovers.length>0 && (
            <div style={{ ...cardStyle, padding:"14px 18px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10, letterSpacing:"0.5px", textTransform:"uppercase" as const }}>Approval Chain</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {wfApprovers.map((name,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:NAV, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"white", flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{name}</span>
                    <span style={{ marginLeft:"auto", fontSize:9, color:"var(--muted-foreground)", fontWeight:700 }}>L{i+1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AiCard insights={proc.aiInsights}/>
        </div>
      </div>
    </div>
  );
}

// ── PROCEDURE PROFILE ─────────────────────────────────────────────────────────
function ProcedureProfile({ procedure: sop, onClose, workflowConfig, users }: { procedure: Procedure; onClose: () => void; workflowConfig?: WorkflowConfig; users?: {id:string;name:string;email:string;role:string;department:string}[] }) {
  const completeness = Math.min(100,
    (sop.description&&sop.description.length>20?20:0)+
    (sop.owner?15:0)+(sop.steps&&sop.steps.length>0?20:0)+
    (sop.aiInsights&&sop.aiInsights.length>0?15:0)+(sop.pages>1?15:0)+(sop.process?15:0)
  );
  const wfApprovers = workflowConfig?.enabled
    ? workflowConfig.approvers.slice(0,workflowConfig.levels).map(id=>users?.find(u=>u.id===id)?.name??id).filter(Boolean)
    : [];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <BackBtn label="Procedures" onClose={onClose}/>
      <div style={{ ...cardStyle, padding:"20px 24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{sop.id}</span>
              <Badge label={sop.status}/>
              <span style={{ fontSize:9, fontWeight:800, color:impColor(sop.impact), background:impBg(sop.impact), border:`1px solid ${impBd(sop.impact)}`, borderRadius:4, padding:"2px 7px" }}>{sop.impact.toUpperCase()}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, fontWeight:700, color:NAV, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 7px" }}>v{sop.version}</span>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{sop.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Owner: {sop.owner} · Process: {sop.process} · Pages: {sop.pages} · Last tested: {sop.lastTested}</div>
          </div>
          <RiskGauge score={sop.riskScore}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...cardStyle, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:10 }}>Description</div>
            <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.7 }}>{sop.description}</div>
          </div>
          <div style={{ ...cardStyle, padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:NAV, marginBottom:14 }}>Procedure Steps</div>
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {sop.steps.map((step, i) => (
                <div key={i} style={{ display:"flex", gap:12, paddingBottom:12, alignItems:"flex-start" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:22, flexShrink:0 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:NAV, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:  "var(--card)" }}>{i+1}</div>
                    {i < sop.steps.length - 1 && <div style={{ width:2, flex:1, background:"rgb(23,30,42)", minHeight:12 }}/>}
                  </div>
                  <div style={{ fontSize:12, color:"var(--foreground)", paddingTop:4, lineHeight:1.5 }}>{step}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ ...cardStyle, padding:"16px 18px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:12, letterSpacing:"0.5px", textTransform:"uppercase" as const }}>Document Completeness</div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <CompletionRing score={completeness}/>
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:completeness>=80?"#059669":completeness>=60?AMB:RED }}>{completeness}%</span>
                </div>
              </div>
              <div style={{ flex:1 }}>
                {([{label:"Description",ok:!!sop.description&&sop.description.length>20},{label:"Owner assigned",ok:!!sop.owner},{label:"Steps documented",ok:sop.steps&&sop.steps.length>0},{label:"AI enriched",ok:sop.aiInsights&&sop.aiInsights.length>0},{label:"Multi-page doc",ok:sop.pages>1},{label:"Process linked",ok:!!sop.process}]).map(item=>(
                  <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:10, color:item.ok?EME:RED, flexShrink:0, fontWeight:700 }}>{item.ok?"✓":"○"}</span>
                    <span style={{ fontSize:10, color:item.ok?"var(--foreground)":"var(--muted-foreground)" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {wfApprovers.length>0 && (
            <div style={{ ...cardStyle, padding:"14px 18px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10, letterSpacing:"0.5px", textTransform:"uppercase" as const }}>Approval Chain</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {wfApprovers.map((name,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"var(--secondary)", borderRadius:6, border:"1px solid var(--border)" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:NAV, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"white", flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{name}</span>
                    <span style={{ marginLeft:"auto", fontSize:9, color:"var(--muted-foreground)", fontWeight:700 }}>L{i+1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AiCard insights={sop.aiInsights}/>
        </div>
      </div>
    </div>
  );
}

// ── SubTabBar helper ──────────────────────────────────────────────────────────
function SubTabBar({ tabs, active, onSelect }: { tabs:{key:string;label:string}[]; active:string; onSelect:(k:string)=>void }) {
  return (
    <div style={{ display:"flex", gap:0, borderBottom:"2px solid var(--border)", marginBottom:4 }}>
      {tabs.map(t=>(
        <button key={t.key} onClick={()=>onSelect(t.key)} style={{ padding:"9px 22px", border:"none", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:active===t.key?700:500, color:active===t.key?"rgb(147,197,253)":"var(--muted-foreground)", borderBottom:`2px solid ${active===t.key?"rgb(147,197,253)":"transparent"}`, marginBottom:-2, transition:"all 0.15s", whiteSpace:"nowrap" as const, outline:"none" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── CompletionRing helper ──────────────────────────────────────────────────────
function CompletionRing({ score, size=64 }: { score:number; size?:number }) {
  const r=(size-8)/2, circ=2*Math.PI*r, dash=(score/100)*circ;
  const color=score>=80?"#059669":score>=60?AMB:RED;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="7"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
    </svg>
  );
}

// ── WorkflowCard helper ────────────────────────────────────────────────────────
function WorkflowCard({ docType, globalWf, onConfigure }: { docType:string; globalWf:WorkflowConfig; onConfigure:()=>void }) {
  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:"rgb(147,197,253)" }}>⚙ Approval Workflow</span>
          <span style={{ fontSize:10, fontWeight:700, color:globalWf.enabled?"#059669":"var(--muted-foreground)", background:globalWf.enabled?"rgba(16,185,129,0.08)":"rgba(148,163,184,0.05)", border:"1px solid", borderColor:globalWf.enabled?"rgba(167,243,208,0.4)":"rgba(148,163,184,0.15)", borderRadius:4, padding:"1px 7px" }}>
            {globalWf.enabled ? `Active · ${globalWf.levels} Level${globalWf.levels>1?"s":""}` : "Not Configured"}
          </span>
        </div>
        <button onClick={onConfigure} style={{ padding:"5px 14px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"rgb(147,197,253)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Configure Global Workflow →</button>
      </div>
      <div style={{ marginTop:9, fontSize:11, color:globalWf.enabled?"var(--muted-foreground)":"var(--muted-foreground)" }}>
        {globalWf.enabled
          ? `Global workflow applies to all ${docType}s · Per-item workflows (⚙ on any row) take priority over this global setting`
          : `No global approval workflow set. Enable to require approvals before any ${docType} becomes active. Use ⚙ on a row to set item-specific workflow.`}
      </div>
    </div>
  );
}

// ── OrgDocSection helper ──────────────────────────────────────────────────────
type TemplateLike = { id:string; name:string; category:string; frameworks:string[]; pages:number; popularity:number; description:string };
function OrgDocSection({ orgName, docType, tpls, onUseTemplate }: { orgName:string; docType:"policy"|"process"|"procedure"; tpls:TemplateLike[]; onUseTemplate:(t:TemplateLike)=>void }) {
  const [search, setSearch] = React.useState("");
  const [cat, setCat] = React.useState("All");
  const label = docType==="policy"?"Policies":docType==="process"?"Processes":"Procedures";
  const cats = ["All",...Array.from(new Set(tpls.map(t=>t.category)))];
  const shown = tpls.filter(t=>(cat==="All"||t.category===cat)&&(!search||t.name.toLowerCase().includes(search.toLowerCase())));
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <span style={{ fontSize:14, fontWeight:800, color:"var(--foreground)" }}>{orgName} {label}</span>
        <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Ready-to-use templates · {shown.length} available</span>
      </div>
      <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" as const, marginBottom:12 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:200, fontFamily:"inherit", background:"var(--card)", color:"var(--foreground)", outline:"none" }}/>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{ padding:"3px 10px", borderRadius:5, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:cat===c?"#1E3A5F":"var(--card)", color:cat===c?"white":"#6B7280", borderColor:cat===c?"#1E3A5F":"rgba(255,255,255,0.1)" }}>{c}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {shown.map(t=>(
          <div key={t.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", cursor:"pointer", transition:"border-color 0.15s" }}
               onMouseEnter={e=>(e.currentTarget.style.borderColor="#1E3A5F")}
               onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
              <span style={{ fontSize:9, fontWeight:700, background:"#EEF2FF", color:"#4338CA", border:"1px solid rgba(165,180,252,0.25)", borderRadius:3, padding:"2px 6px" }}>{t.category}</span>
              <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                <span style={{ fontSize:10, color:"#D97706" }}>★</span>
                <span style={{ fontSize:10, fontWeight:700, color:"#6B7280" }}>{t.popularity}%</span>
              </div>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:"rgb(147,197,253)", marginBottom:5, lineHeight:1.4 }}>{t.name}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:9, lineHeight:1.5 }}>{t.description}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", gap:3, flexWrap:"wrap" as const }}>
                {t.frameworks.slice(0,2).map(f=><span key={f} style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:3, padding:"1px 5px", fontSize:8, fontWeight:700, color:"var(--foreground)" }}>{f}</span>)}
              </div>
              <span onClick={e=>{e.stopPropagation();onUseTemplate(t);}} style={{ fontSize:10, color:"rgb(147,197,253)", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" as const }}>Use Template →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function GovOps() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const [selectedPolicyItem,    setSelectedPolicyItem]    = useState<Policy | null>(null);
  const [selectedProcessItem,   setSelectedProcessItem]   = useState<Process | null>(null);
  const [selectedProcedureItem, setSelectedProcedureItem] = useState<Procedure | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null); // for version history
  const [policySearch, setPolicySearch]     = useState("");
  const [processSearch, setProcessSearch]   = useState("");
  const [procSearch, setProcSearch]         = useState("");
  const [policyStatusFilter, setPolicyStatusFilter] = useState("All");
  const [processCatFilter,   setProcessCatFilter]   = useState("All");

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selPolicy, setSelPolicy] = useState<Policy | null>(null);
  const [dbControls,   setDbControls]   = useState<typeof controls>([]);
  const [dbProcesses,  setDbProcesses]  = useState<typeof allProcesses>([]);
  const [dbProcedures, setDbProcedures] = useState<typeof allProcedures>([]);
  const [ownerPick, setOwnerPick] = useState<{type:string;id:string|number;name:string;owner:string}|null>(null);
  const [riskPick,  setRiskPick]  = useState<{type:string;id:string|number;name:string;level:string;field:string}|null>(null);
  const [evidPick,  setEvidPick]  = useState<{type:string;id:string|number;name:string}|null>(null);
  const afterOwnerSave = (type:string, id:string|number, v:string) => {
    if (type==="policy")    setPolicies(prev=>prev.map(p=>(p.policyRef??p.id)===id?{...p,owner:v}:p));
    else if (type==="process")   setDbProcesses(prev=>prev.map(p=>p.id===id?{...p,owner:v}:p));
    else if (type==="procedure") setDbProcedures(prev=>prev.map(p=>p.id===id?{...p,owner:v}:p));
    else if (type==="control")   setDbControls(prev=>prev.map(c=>c.id===id?{...c,owner:v}:c));
  };
  const afterRiskSave = (type:string, id:string|number, v:string, field:string) => {
    if (type==="process")        setDbProcesses(prev=>prev.map(p=>p.id===id?{...p,[field]:v}:p));
    else if (type==="procedure") setDbProcedures(prev=>prev.map(p=>p.id===id?{...p,[field]:v}:p));
    else if (type==="control")   setDbControls(prev=>prev.map(c=>c.id===id?{...c,[field]:v}:c));
  };
  const [dbAttestDepts,setDbAttestDepts]= useState<typeof attestationDepts>([]);
  const [dbTemplates,  setDbTemplates]  = useState<typeof templates>([]);
  const { orgName, viewTenantId } = useOrg();
  const [users, setUsers] = useState<{id:string;name:string;email:string;role:string;department:string}[]>([]);
  const blankWf = (): WorkflowConfig => ({ enabled:false, levels:1, approvers:["","","","",""] });
  const [globalWorkflow, setGlobalWorkflow] = useState<{policy:WorkflowConfig;process:WorkflowConfig;procedure:WorkflowConfig}>({ policy:{ enabled:false,levels:1,approvers:["","","","",""] }, process:{ enabled:false,levels:1,approvers:["","","","",""] }, procedure:{ enabled:false,levels:1,approvers:["","","","",""] } });
  const [itemWorkflows, setItemWorkflows] = useState<Record<string,WorkflowConfig>>({});
  const [showWfModal, setShowWfModal] = useState<{scope:"global"|"item";docType:"policy"|"process"|"procedure";itemId?:string;itemName?:string}|null>(null);
  const [wfForm, setWfForm] = useState<WorkflowConfig>({ enabled:false, levels:1, approvers:["","","","",""] });
  const [policySubTab,    setPolicySubTab]    = useState<"list"|"templates"|"workflow">("list");
  const [processSubTab,   setProcessSubTab]   = useState<"list"|"templates"|"workflow">("list");
  const [procedureSubTab, setProcedureSubTab] = useState<"list"|"templates"|"workflow">("list");
  const [controlsSubTab,  setControlsSubTab]  = useState<"available"|"applicable"|"frameworks"|"library">("available");
  const [controlsStatusFilter, setControlsStatusFilter] = useState("All");
  const [controlSearch, setControlSearch] = useState("");
  const [ctlLibFwFilter, setCtlLibFwFilter] = useState("All");
  const [ctlLibSearch, setCtlLibSearch] = useState("");

  const blankGovForm = { name:"", category:"Security", owner:"", description:"", frameworks:"", nextReview:"", departmentTargets:"", attestationRequired:false, steps:"5", linked:"", maturity:"Initial" as const, impact:"Medium" as const, pages:"5", ctlType:"technical" as const };
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...blankGovForm });
  const [creating,   setCreating]   = useState(false);
  const cf = (field: string, value: unknown) => setCreateForm(f => ({ ...f, [field]: value }));

  const [showImport,    setShowImport]    = useState(false);
  const [importRows,    setImportRows]    = useState<Record<string,string>[]>([]);
  const [importStep,    setImportStep]    = useState<"upload"|"preview"|"done">("upload");
  const [importResults, setImportResults] = useState<{ok:number;fail:number;errors:string[]}>({ok:0,fail:0,errors:[]});
  const [importing,     setImporting]     = useState(false);
  const [importDragOver,setImportDragOver]= useState(false);

  const openImport = () => { setImportRows([]); setImportStep("upload"); setImportResults({ok:0,fail:0,errors:[]}); setImporting(false); setShowImport(true); };

  const importTemplates: Record<string,{headers:string;example:string}> = {
    policies:   { headers:"name,category,owner,frameworks,nextReview,departmentTargets,description,attestationRequired", example:"\"Endpoint Security Policy\",Security,Sarah Chen,\"ISO 27001;SOC 2\",2026-12-31,\"Engineering;IT\",\"Policy governing endpoint security.\",false" },
    processes:  { headers:"name,category,owner,description,steps,maturity,impact,linked",                                example:"\"Patch Management Process\",Security,Alex Kim,\"Patch release monitoring and deployment.\",5,Defined,High,POL-001" },
    procedures: { headers:"name,owner,description,pages,impact,linked",                                                  example:"\"Patch Deployment Procedure\",Alex Kim,\"Step-by-step patch deployment instructions.\",6,Medium,PRC-001" },
  };

  const downloadTemplate = () => {
    const t = importTemplates[tab as keyof typeof importTemplates];
    if (!t) return;
    const csv = `${t.headers}\n${t.example}`;
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `import-${tab}-template.csv`;
    a.click();
  };

  const parseCsv = (text: string): Record<string,string>[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      const row: Record<string,string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim().replace(/^"|"$/g, ""); });
      return row;
    }).filter(r => r["name"]?.trim());
  };

  const parseImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          const rows = (Array.isArray(parsed) ? parsed : parsed.data ?? []).map((r: any) =>
            Object.fromEntries(Object.entries(r).map(([k,v]) => [k, String(v ?? "")]))
          ).filter((r: Record<string,string>) => r["name"]?.trim());
          setImportRows(rows);
        } else {
          setImportRows(parseCsv(text));
        }
        setImportStep("preview");
      } catch (_) {
        alert("Could not parse file. Please check the format and try again.");
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (!importRows.length) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setImporting(true);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    const newPolicies: Policy[] = [];
    const newProcs: any[] = [];
    const newSops: any[] = [];
    for (const row of importRows) {
      try {
        let url = "", body: Record<string,unknown> = {};
        if (tab === "policies") {
          const fw = (row["frameworks"]||"").split(";").map((s:string)=>s.trim()).filter(Boolean);
          const depts = (row["departmentTargets"]||"").split(";").map((s:string)=>s.trim()).filter(Boolean);
          url = "/api/governance/policies";
          body = { name:row["name"], category:row["category"]||"Security", owner:row["owner"]||"", frameworks:fw, nextReview:row["nextReview"]||"2026-12-31", departmentTargets:depts, attestationRequired:row["attestationRequired"]==="true", description:row["description"]||"" };
        } else if (tab === "processes") {
          url = "/api/governance/processes";
          body = { name:row["name"], category:row["category"]||"Security", owner:row["owner"]||"", description:row["description"]||"", steps:Number(row["steps"])||1, linked:row["linked"]||"", maturity:row["maturity"]||"Initial", impact:row["impact"]||"Medium" };
        } else if (tab === "procedures") {
          url = "/api/governance/procedures";
          body = { name:row["name"], process:row["linked"]||"", owner:row["owner"]||"", description:row["description"]||"", pages:Number(row["pages"])||1, impact:row["impact"]||"Medium" };
        }
        if (!url) continue;
        const res = await fetch(url, { method:"POST", headers:H, body:JSON.stringify(body) });
        if (res.ok) {
          const d = await res.json();
          ok++;
          if (tab === "policies") {
            const fw = (row["frameworks"]||"").split(";").map((s:string)=>s.trim()).filter(Boolean);
            newPolicies.push({ id:d.policyRef||d.id, policyRef:d.policyRef||d.id, name:d.name, category:d.category, owner:d.owner||row["owner"], version:d.version??"1.0", status:d.status, frameworks:d.frameworks??fw, reviewed:"—", nextReview:row["nextReview"]||"2026-12-31", applicable:true, aiEnriched:false, description:row["description"]||`${d.name} policy.`, scope:row["departmentTargets"]||"All departments", riskScore:50, impact:"Medium", dept:(row["departmentTargets"]||"").split(";")[0]?.trim()??"", aiInsights:[] });
          } else if (tab === "processes") {
            newProcs.push({ id:d.id, name:d.name, owner:d.owner, category:d.category, steps:d.steps, linked:d.linked, status:d.status, maturity:d.maturity, riskScore:d.riskScore??50, description:d.description||"", kpis:[], aiInsights:[], impact:d.impact });
          } else if (tab === "procedures") {
            newSops.push({ id:d.id, name:d.name, process:d.process??"", owner:d.owner, version:d.version??"1.0", status:d.status, pages:d.pages, riskScore:d.riskScore??50, lastTested:"—", description:d.description??"", steps:[], aiInsights:[], impact:d.impact });
          }
        } else {
          fail++;
          errors.push(`"${row["name"]}": HTTP ${res.status}`);
        }
      } catch (err: any) {
        fail++;
        errors.push(`"${row["name"]}": ${err?.message||"network error"}`);
      }
    }
    if (newPolicies.length) setPolicies(prev => [...newPolicies, ...prev]);
    if (newProcs.length)    setDbProcesses(prev => [...newProcs, ...prev]);
    if (newSops.length)     setDbProcedures(prev => [...newSops, ...prev]);
    setImportResults({ ok, fail, errors });
    setImporting(false);
    setImportStep("done");
  };

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ ...blankGovForm });
  const [editTarget, setEditTarget] = useState<{type:string;id:string;name:string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState<string|null>(null);
  const [confirmDel, setConfirmDel] = useState<{type:string;id:string;name:string} | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ef = (field: string, value: unknown) => setEditForm(f => ({ ...f, [field]: value }));
  const actBtn: React.CSSProperties = { background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, width:24, height:24, cursor:"pointer", fontSize:11, display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit", flexShrink:0, lineHeight:1, padding:0, color:"rgba(148,163,184,0.8)" };

  const openEdit = (type: string, item: any) => {
    const id = item.policyRef ?? item.id;
    setEditTarget({ type, id, name: item.name });
    if (type === "policy") {
      setEditForm({ ...blankGovForm, name:item.name, category:item.category??"Security", owner:item.owner??"", description:item.description??"", frameworks:(item.frameworks??[]).join(", "), nextReview:item.nextReview??"", departmentTargets:Array.isArray(item.departmentTargets)?item.departmentTargets.join(", "):(item.dept??""), attestationRequired:item.attestationRequired??false });
    } else if (type === "process") {
      setEditForm({ ...blankGovForm, name:item.name, category:item.category??"Security", owner:item.owner??"", description:item.description??"", steps:String(item.steps??5), linked:item.linked??"", maturity:item.maturity??"Initial", impact:item.impact??"Medium" });
    } else if (type === "procedure") {
      setEditForm({ ...blankGovForm, name:item.name, owner:item.owner??"", linked:item.process??"", description:item.description??"", pages:String(item.pages??5), impact:item.impact??"Medium" });
    } else if (type === "control") {
      setEditForm({ ...blankGovForm, name:item.name, category:item.category??"", owner:item.owner??"", description:item.description??"", frameworks:(item.frameworks??[]).join(", "), ctlType:((item.type??"technical") as string) as "technical" });
    }
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!editTarget || !editForm.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setSaving(true);
    try {
      const fw = editForm.frameworks.split(",").map((s:string)=>s.trim()).filter(Boolean);
      let url = "", body: Record<string,unknown> = {};
      if (editTarget.type === "policy") {
        url = `/api/governance/policies/${editTarget.id}`;
        body = { name:editForm.name, category:editForm.category, owner:editForm.owner, frameworks:fw, nextReview:editForm.nextReview||"2026-12-31", departmentTargets:editForm.departmentTargets.split(",").map((s:string)=>s.trim()).filter(Boolean), attestationRequired:editForm.attestationRequired };
      } else if (editTarget.type === "process") {
        url = `/api/governance/processes/${editTarget.id}`;
        body = { name:editForm.name, category:editForm.category, owner:editForm.owner, description:editForm.description, steps:Number(editForm.steps)||1, linked:editForm.linked, maturity:editForm.maturity, impact:editForm.impact };
      } else if (editTarget.type === "procedure") {
        url = `/api/governance/procedures/${editTarget.id}`;
        body = { name:editForm.name, process:editForm.linked, owner:editForm.owner, description:editForm.description, pages:Number(editForm.pages)||1, impact:editForm.impact };
      } else if (editTarget.type === "control") {
        url = `/api/governance/controls/${editTarget.id}`;
        body = { name:editForm.name, category:editForm.category, owner:editForm.owner, description:editForm.description, type:editForm.ctlType, frameworks:fw };
      }
      if (!url) { setSaving(false); return; }
      const res = await fetch(url, { method:"PATCH", headers:H, body:JSON.stringify(body) });
      if (res.ok) {
        if (editTarget.type === "policy") setPolicies(prev => prev.map(p => (p.policyRef??p.id)===editTarget.id ? { ...p, name:editForm.name, category:editForm.category, owner:editForm.owner, frameworks:fw, nextReview:editForm.nextReview||p.nextReview } : p));
        else if (editTarget.type === "process") setDbProcesses(prev => { const base = prev.length>0?prev:allProcesses as any[]; return base.map((p:any)=>p.id===editTarget.id?{...p,...body}:p); });
        else if (editTarget.type === "procedure") setDbProcedures(prev => { const base = prev.length>0?prev:allProcedures as any[]; return base.map((p:any)=>p.id===editTarget.id?{...p,name:editForm.name,process:editForm.linked,owner:editForm.owner,description:editForm.description,pages:Number(editForm.pages)||1,impact:editForm.impact}:p); });
        else if (editTarget.type === "control") setDbControls(prev => { const base = prev.length>0?prev:controls; return base.map((c:any)=>c.id===editTarget.id?{...c,...body}:c); });
        setShowEdit(false); setEditTarget(null);
      }
    } catch (_) {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization:`Bearer ${token}` } : {};
    setDeleting(true);
    try {
      const url = confirmDel.type==="policy"?`/api/governance/policies/${confirmDel.id}`:confirmDel.type==="process"?`/api/governance/processes/${confirmDel.id}`:confirmDel.type==="procedure"?`/api/governance/procedures/${confirmDel.id}`:`/api/governance/controls/${confirmDel.id}`;
      const res = await fetch(url, { method:"DELETE", headers:H });
      if (res.ok || res.status===204) {
        if (confirmDel.type==="policy") setPolicies(prev=>prev.filter(p=>(p.policyRef??p.id)!==confirmDel.id));
        else if (confirmDel.type==="process") setDbProcesses(prev=>{const base=prev.length>0?prev:allProcesses as any[];return base.filter((p:any)=>p.id!==confirmDel.id);});
        else if (confirmDel.type==="procedure") setDbProcedures(prev=>{const base=prev.length>0?prev:allProcedures as any[];return base.filter((p:any)=>p.id!==confirmDel.id);});
        else if (confirmDel.type==="control") setDbControls(prev=>{const base=prev.length>0?prev:controls;return base.filter((c:any)=>c.id!==confirmDel.id);});
        setConfirmDel(null);
      }
    } catch (_) {}
    setDeleting(false);
  };

  const handleEnrich = async (type: string, id: string, name: string, category: string) => {
    setEnriching(id);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const res = await fetch("/api/governance/enrich", { method:"POST", headers:H, body:JSON.stringify({ type, id, name, category }) });
      if (res.ok) {
        const d = await res.json();
        if (type==="policy") setPolicies(prev=>prev.map(p=>(p.policyRef??p.id)===id?{...p,description:d.description||p.description,aiInsights:d.insights||p.aiInsights,frameworks:d.frameworks?.length?d.frameworks:p.frameworks,aiEnriched:true}:p));
        else if (type==="process") setDbProcesses(prev=>{const base=prev.length>0?prev:allProcesses as any[];return base.map((p:any)=>p.id===id?{...p,description:d.description||p.description,aiInsights:d.insights||p.aiInsights,kpis:d.kpis||p.kpis}:p);});
        else if (type==="procedure") setDbProcedures(prev=>{const base=prev.length>0?prev:allProcedures as any[];return base.map((p:any)=>p.id===id?{...p,description:d.description||p.description,aiInsights:d.insights||p.aiInsights}:p);});
        else if (type==="control") setDbControls(prev=>{const base=prev.length>0?prev:controls;return base.map((c:any)=>c.id===id?{...c,description:d.description||c.description}:c);});
      }
    } catch (_) {}
    setEnriching(null);
  };

  const useTemplate = (t: any) => {
    setTab("policies");
    setCreateForm({ ...blankGovForm, name:t.name, category:t.category??"Security", frameworks:(t.frameworks??[]).join(", "), description:t.description??"", pages:String(t.pages??5) });
    setShowCreate(true);
  };

  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch("/api/governance/policies", { headers: H })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setPolicies(d.map((p: any) => ({
            id:          p.policyRef || p.id,
            policyRef:   p.policyRef || p.id,
            name:        p.name,
            category:    p.category,
            owner:       p.owner,
            version:     p.version,
            status:      p.status,
            frameworks:  Array.isArray(p.frameworks) ? p.frameworks : [],
            reviewed:    p.reviewed ?? "",
            nextReview:  p.nextReview ?? "",
            applicable:  p.applicable ?? true,
            aiEnriched:  p.aiEnriched ?? false,
            description: p.description ?? `${p.name} — governance policy for ${p.category}.`,
            scope:       p.scope ?? (Array.isArray(p.departmentTargets) ? p.departmentTargets.join(", ") : "All departments"),
            riskScore:   p.riskScore ?? 55,
            impact:      p.impact ?? "Medium",
            dept:        Array.isArray(p.departmentTargets) ? (p.departmentTargets[0] ?? "") : (p.dept ?? ""),
            aiInsights:  Array.isArray(p.aiInsights) ? p.aiInsights : ["Policy analytics loading — AI enrichment in progress."],
          })));
        }
      })
      .catch(() => {});
    fetch("/api/governance/controls", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbControls(d.map((c: any) => ({
        id:         c.id ?? c.ref,
        name:       c.name,
        ccf:        c.ref ?? c.id,
        frameworks: Array.isArray(c.frameworks) ? c.frameworks : [],
        status:     c.status,
        owner:      c.owner,
        evidence:   Number(c.evidence) || 0,
        risk:       c.effectiveness >= 80 ? "Low" : c.effectiveness >= 60 ? "Medium" : "High",
      }))))
      .catch(() => {});
    fetch("/api/governance/processes", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbProcesses(d.map((p: any) => ({
        id: p.id, name: p.name, owner: p.owner, category: p.category,
        steps: Number(p.steps) || 0, linked: p.linked ?? "",
        status: p.status, maturity: p.maturity,
        riskScore: Number(p.riskScore) || 50, description: p.description ?? "",
        kpis: Array.isArray(p.kpis) ? p.kpis : [],
        aiInsights: Array.isArray(p.aiInsights) ? p.aiInsights : [],
        impact: p.impact ?? "Medium",
      }))))
      .catch(() => {});
    fetch("/api/governance/procedures", { headers: H })
      .then(r => r.json())
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbProcedures(d.map((p: any) => ({
        id: p.id, name: p.name, process: p.process ?? "", owner: p.owner,
        version: p.version ?? "1.0", status: p.status,
        pages: Number(p.pages) || 1, riskScore: Number(p.riskScore) || 50,
        lastTested: p.lastTested ?? "—", description: p.description ?? "",
        steps: Array.isArray(p.steps) ? p.steps : [],
        aiInsights: Array.isArray(p.aiInsights) ? p.aiInsights : [],
        impact: p.impact ?? "Medium",
      }))))
      .catch(() => {});
    fetch("/api/governance/attestations", { headers: H })
      .then(r => r.json())
      .then((d: any) => {
        const depts = Array.isArray(d?.departments) ? d.departments : Array.isArray(d) ? d : [];
        if (depts.length > 0) setDbAttestDepts(depts.map((dept: any) => ({
          dept: dept.dept, contact: dept.contact,
          totalPolicies: Number(dept.totalPolicies) || 0,
          acknowledged:  Number(dept.acknowledged)  || 0,
          overdue:       Number(dept.overdue)        || 0,
          lastActivity:  dept.lastActivity ?? "—",
          color:         dept.color ?? "#1E3A5F",
        })));
      })
      .catch(() => {});
    fetch("/api/governance/templates", { headers: H })
      .then(r => r.json())
      .then((d: any) => {
        const list = Array.isArray(d) ? d : Array.isArray(d?.templates) ? d.templates : [];
        if (list.length > 0) setDbTemplates(list.map((t: any) => ({
          id: t.id, name: t.name, category: t.category,
          frameworks: Array.isArray(t.frameworks) ? t.frameworks : [],
          pages: Number(t.pages) || 1, popularity: Number(t.popularity) || 70,
          description: t.description ?? "",
        })));
      })
      .catch(() => {});
    fetch("/api/users",   { headers: H }).then(r=>r.json()).then((d:any)=>{ const list=Array.isArray(d)?d:Array.isArray(d?.users)?d.users:[]; if(list.length>0) setUsers(list.map((u:any)=>({id:String(u.id),name:u.name??u.email,email:u.email,role:u.role??"",department:u.department??""}))); }).catch(()=>{});
  }, []);
  const lControls    = dbControls.length   > 0 ? dbControls   : (viewTenantId === 1 ? controls      : []);
  const processes    = dbProcesses.length  > 0 ? dbProcesses  : (viewTenantId === 1 ? allProcesses  : []);
  const procedures   = dbProcedures.length > 0 ? dbProcedures : (viewTenantId === 1 ? allProcedures : []);
  const lAttestDepts = dbAttestDepts.length > 0 ? dbAttestDepts : (viewTenantId === 1 ? attestationDepts : []);
  const lTemplates   = dbTemplates.length  > 0 ? dbTemplates  : templates;
  const lPolicyTemplates    = lTemplates;
  const lProcessTemplates   = processTemplatesData;
  const lProcedureTemplates = procedureTemplatesData;

  const openWfModal = (scope:"global"|"item", docType:"policy"|"process"|"procedure", itemId?:string, itemName?:string) => {
    const existing = scope==="global" ? globalWorkflow[docType] : (itemId ? itemWorkflows[itemId] ?? null : null);
    setWfForm(existing ? { ...existing, approvers:[...existing.approvers,"","","","",""].slice(0,5) as [string,string,string,string,string] } : blankWf());
    setShowWfModal({ scope, docType, itemId, itemName });
  };
  const saveWfModal = () => {
    if (!showWfModal) return;
    if (showWfModal.scope === "global") {
      setGlobalWorkflow(prev => ({ ...prev, [showWfModal!.docType]: { ...wfForm, approvers:[...wfForm.approvers] as [string,string,string,string,string] } }));
    } else if (showWfModal.itemId) {
      setItemWorkflows(prev => ({ ...prev, [showWfModal!.itemId!]: { ...wfForm, approvers:[...wfForm.approvers] as [string,string,string,string,string] } }));
    }
    setShowWfModal(null);
  };
  const wf = (field: keyof WorkflowConfig, value: unknown) => setWfForm(f => ({ ...f, [field]: value }));

  const filteredPolicies = useMemo(() => policies.filter(p =>
    (policyStatusFilter==="All" || p.status===policyStatusFilter) &&
    (!policySearch || p.name.toLowerCase().includes(policySearch.toLowerCase()) || p.category.toLowerCase().includes(policySearch.toLowerCase()))
  ), [policySearch, policyStatusFilter, policies]);

  const filteredProcesses = useMemo(() => processes.filter(p =>
    (processCatFilter==="All" || p.category===processCatFilter) &&
    (!processSearch || p.name.toLowerCase().includes(processSearch.toLowerCase()))
  ), [processSearch, processCatFilter, processes]);

  const filteredProcedures = useMemo(() => procedures.filter(p =>
    !procSearch || p.name.toLowerCase().includes(procSearch.toLowerCase())
  ), [procSearch, procedures]);

  const tabs = [
    { key: "overview",    label: "Overview" },
    { key: "policies",    label: "Policies",   count: policies.length },
    { key: "processes",   label: "Processes",  count: processes.length },
    { key: "procedures",  label: "Procedures", count: procedures.length },
    { key: "controls",    label: "Controls",   count: lControls.length, dot: "#D97706" },
    { key: "attestation", label: "Attestation", dot: "#DC2626" },
    { key: "workflow",    label: "⚡ Workflow", dot: "#6366F1" },
  ];

  const totalAck    = lAttestDepts.reduce((s, d) => s + d.acknowledged, 0);
  const totalPol    = lAttestDepts.reduce((s, d) => s + d.totalPolicies, 0);
  const totalOverdue= lAttestDepts.reduce((s, d) => s + d.overdue, 0);
  const activePol   = policies.filter(p => p.status === "active").length;
  const inReviewPol = policies.filter(p => p.status === "in-review").length;
  const draftPol    = policies.filter(p => p.status === "draft").length;
  const aiPol       = policies.filter(p => p.aiEnriched).length;
  const applicPol   = policies.filter(p => p.applicable).length;
  const implementedCtl = lControls.filter(c => c.status === "implemented").length;
  const partialCtl     = lControls.filter(c => c.status === "partial").length;
  const notStartedCtl  = lControls.filter(c => c.status === "not-started").length;
  const activeProc     = processes.filter(p => p.status === "active").length;
  const activeSop      = procedures.filter(p => p.status === "active").length;
  const govFrameworks  = Array.from(new Set(policies.flatMap(p => p.frameworks))).slice(0, 10);


  const processCats = ["All", ...Array.from(new Set(processes.map(p => p.category)))];

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setCreating(true);
    try {
      let url = "", body: Record<string,unknown> = {};
      const fw = createForm.frameworks.split(",").map(s => s.trim()).filter(Boolean);
      if (tab === "policies") {
        url = "/api/governance/policies";
        body = { name:createForm.name, category:createForm.category, owner:createForm.owner, frameworks:fw, nextReview:createForm.nextReview||"2026-12-31", departmentTargets:createForm.departmentTargets.split(",").map(s=>s.trim()).filter(Boolean), attestationRequired:createForm.attestationRequired };
      } else if (tab === "processes") {
        url = "/api/governance/processes";
        body = { name:createForm.name, category:createForm.category, owner:createForm.owner, description:createForm.description, steps:Number(createForm.steps)||1, linked:createForm.linked, maturity:createForm.maturity, impact:createForm.impact };
      } else if (tab === "procedures") {
        url = "/api/governance/procedures";
        body = { name:createForm.name, process:createForm.linked, owner:createForm.owner, description:createForm.description, pages:Number(createForm.pages)||1, impact:createForm.impact };
      } else if (tab === "controls") {
        url = "/api/governance/controls";
        body = { name:createForm.name, category:createForm.category, description:createForm.description, type:createForm.ctlType, frameworks:fw };
      }
      if (!url) { setCreating(false); return; }
      const res = await fetch(url, { method:"POST", headers:H, body:JSON.stringify(body) });
      if (res.ok) {
        const d = await res.json();
        if (tab === "policies") {
          const newP: Policy = { id:d.policyRef||d.id, policyRef:d.policyRef||d.id, name:d.name, category:d.category, owner:d.owner||createForm.owner, version:d.version??"1.0", status:d.status, frameworks:d.frameworks??fw, reviewed:"—", nextReview:createForm.nextReview||"2026-12-31", applicable:true, aiEnriched:false, description:createForm.description||`${d.name} policy.`, scope:createForm.departmentTargets||"All departments", riskScore:50, impact:"Medium", dept:createForm.departmentTargets.split(",")[0]?.trim()??"", aiInsights:[] };
          setPolicies(prev => [newP, ...prev]);
        } else if (tab === "processes") {
          setDbProcesses(prev => [{ id:d.id, name:d.name, owner:d.owner, category:d.category, steps:d.steps, linked:d.linked, status:d.status, maturity:d.maturity, riskScore:d.riskScore??50, description:d.description, kpis:[], aiInsights:[], impact:d.impact }, ...prev]);
        } else if (tab === "procedures") {
          setDbProcedures(prev => [{ id:d.id, name:d.name, process:d.process, owner:d.owner, version:d.version, status:d.status, pages:d.pages, riskScore:d.riskScore??50, lastTested:"—", description:d.description, steps:[], aiInsights:[], impact:d.impact }, ...prev]);
        } else if (tab === "controls") {
          setDbControls(prev => [{ id:d.id||`CTL-${Date.now()}`, name:d.name, ccf:d.id||"", frameworks:d.frameworks??fw, status:"partial", owner:createForm.owner||"Unassigned", evidence:0, risk:"Medium" }, ...prev]);
        }
        setShowCreate(false);
        setCreateForm({ ...blankGovForm });
      }
    } catch (_) {}
    setCreating(false);
  };

  const handlePolicyAction = async (action: string, policyId: string, notes?: string) => {
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
    try {
      const res = await fetch(`/api/governance/policies/${policyId}/${action}`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(notes ? { notes } : {}),
      });
      if (res.ok) {
        const updated = await res.json();
        const newStatus = updated.status as Policy["status"];
        const newVersion = updated.version as string | undefined;
        setPolicies(prev => prev.map(p =>
          (p.policyRef === policyId || p.id === policyId)
            ? { ...p, status: newStatus, ...(newVersion ? { version: newVersion } : {}) }
            : p
        ));
        setSelectedPolicyItem(prev =>
          prev ? { ...prev, status: newStatus, ...(newVersion ? { version: newVersion } : {}) } : null
        );
      }
    } catch (_) {}
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ModuleHeader
        title="GovOps — Governance Operations"
        description={`${policies.length} Policies · ${processes.length} Processes · ${procedures.length} Procedures · Common Control Framework · Attestation · Templates`}
        action={{ label: `+ New ${tab === "policies" ? "Policy" : tab === "processes" ? "Process" : tab === "procedures" ? "Procedure" : tab === "controls" ? "Control" : "Item"}`, onClick: () => { if (["policies","processes","procedures","controls"].includes(tab)) setShowCreate(true); } }}
        secondAction={["policies","processes","procedures"].includes(tab) ? { label: "⬆ Import", onClick: openImport } : undefined}
      />
      <SubNav tabs={tabs} active={tab} onSelect={(t) => { setTab(t); setSelectedPolicyItem(null); setSelectedProcessItem(null); setSelectedProcedureItem(null); setPolicySubTab("list"); setProcessSubTab("list"); setProcedureSubTab("list"); setControlsSubTab("available"); }}/>
      <AICopilotBar module="govops" />
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              {([
                { label: "Total Documents",     value: String(policies.length + processes.length + procedures.length), sub: "Policies · Processes · SOPs", color: "rgb(147,197,253)", onSelect: () => setTab("policies") },
                { label: "Active Policies",      value: `${activePol}/${policies.length}`,  sub: `${draftPol} draft · ${inReviewPol} in review`,  color: "#065F46",  onSelect: () => { setTab("policies"); setPolicyStatusFilter("active"); } },
                { label: "AI Enriched",          value: `${aiPol}/${policies.length}`,      sub: "Policies with AI summaries",                     color: "#4338CA",  onSelect: () => setTab("policies") },
                { label: "Acknowledgement",      value: `${totalAck}/${totalPol}`,           sub: `${totalOverdue} dept${totalOverdue !== 1 ? "s" : ""} overdue`, color: totalOverdue > 0 ? "#DC2626" : "#065F46", onSelect: () => setTab("attestation") },
                { label: "Controls Implemented", value: `${implementedCtl}/${lControls.length}`, sub: `${partialCtl} partial · ${notStartedCtl} gap`, color: notStartedCtl > 0 ? "#D97706" : "#065F46", onSelect: () => { setTab("controls"); setControlsStatusFilter("All"); setControlSearch(""); } },
                { label: "Applicable Policies",  value: String(applicPol),                  sub: `${policies.length - applicPol} not applicable`,  color: "#0891B2",  onSelect: () => setTab("policies") },
              ] as { label: string; value: string; sub: string; color: string; onSelect: () => void }[]).map(k => (
                <div key={k.label} onClick={k.onSelect} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color, marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div onClick={() => setTab("policies")} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 16 }}>Policy Dimensions</div>
                {([
                  { label: "Active",               value: activePol,  total: policies.length, color: "#065F46",          onSelect: () => { setTab("policies"); setPolicyStatusFilter("active"); } },
                  { label: "Applicable",            value: applicPol,  total: policies.length, color: "rgb(147,197,253)", onSelect: () => setTab("policies") },
                  { label: "AI Enriched",           value: aiPol,      total: policies.length, color: "#4338CA",          onSelect: () => setTab("policies") },
                  { label: "Acknowledged (all depts)", value: totalAck, total: totalPol,        color: "#D97706",         onSelect: () => setTab("attestation") },
                ] as { label: string; value: number; total: number; color: string; onSelect: () => void }[]).map(d => (
                  <div key={d.label} onClick={(e) => { e.stopPropagation(); d.onSelect(); }} onMouseEnter={e => (e.currentTarget.style.background = "var(--secondary)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ marginBottom: 13, cursor: "pointer", borderRadius: 6, padding: "2px 4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{d.label}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: d.color }}>{d.value}<span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>/{d.total}</span></span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: "var(--input)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: d.color, width: `${Math.round((d.value / Math.max(d.total, 1)) * 100)}%`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                ))}
              </div>

              <div onClick={() => setTab("controls")} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Control Framework</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {([{ label: "Implemented", count: implementedCtl, color: "#065F46", bg: "rgba(34,197,94,0.08)", statusKey: "implemented" }, { label: "Partial", count: partialCtl, color: "#D97706", bg: "rgba(245,158,11,0.06)", statusKey: "partial" }, { label: "Not Started", count: notStartedCtl, color: "#DC2626", bg: "rgba(239,68,68,0.06)", statusKey: "not-started" }]).map(s => (
                    <div key={s.label} onClick={(e) => { e.stopPropagation(); setTab("controls"); setControlsStatusFilter(s.statusKey); setControlSearch(""); }} onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")} style={{ flex: 1, background: s.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center", cursor: "pointer" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.count}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", gap: 1, marginBottom: 6 }}>
                  <div style={{ flex: implementedCtl, background: "#065F46", borderRadius: "4px 0 0 4px" }} />
                  <div style={{ flex: partialCtl, background: "#D97706" }} />
                  <div style={{ flex: notStartedCtl, background: "#DC2626", borderRadius: "0 4px 4px 0" }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 14 }}>{Math.round((implementedCtl / lControls.length) * 100)}% of controls fully implemented</div>
                {lControls.filter(c => c.status !== "implemented").map(c => (
                  <div key={c.id} onClick={(e) => { e.stopPropagation(); setTab("controls"); setControlSearch(c.name); setControlsStatusFilter("All"); }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(147,197,253,0.05)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F9F8F6", cursor: "pointer" }}>
                    <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, background: c.status === "partial" ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)", color: c.status === "partial" ? "#92400E" : "#991B1B", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{c.status.replace("-", " ")}</span>
                  </div>
                ))}
              </div>

              <div onClick={() => setTab("attestation")} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>Acknowledgement by Dept</div>
                  {totalOverdue > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(252,165,165,0.25)", borderRadius: 4, padding: "2px 7px" }}>⚠ {totalOverdue} overdue</span>}
                </div>
                {lAttestDepts.map(d => (
                  <div key={d.dept} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--foreground)" }}>{d.dept}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {d.overdue > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#DC2626" }}>⚠ {d.overdue}</span>}
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted-foreground)" }}>{d.acknowledged}/{d.totalPolicies}</span>
                      </div>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: "var(--input)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: d.overdue > 0 ? "#DC2626" : d.color, width: `${Math.round((d.acknowledged / d.totalPolicies) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Process & SOP Health</div>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  {([{ label: "Active Processes", value: activeProc, total: processes.length, color: "rgb(147,197,253)" }, { label: "Active SOPs", value: activeSop, total: procedures.length, color: "#065F46" }]).map(item => (
                    <div key={item.label} style={{ flex: 1, background: "#F9F8F6", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: item.color }}>
                        {item.value}<span style={{ fontSize: 14, color: "var(--muted-foreground)", fontWeight: 400 }}>/{item.total}</span>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", marginTop: 3 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>Items requiring attention</div>
                {[
                  ...processes.filter(p => p.status !== "active").slice(0, 4).map(p => ({ id: p.id, name: p.name, status: p.status, kind: "Process" })),
                  ...procedures.filter(p => p.status !== "active").slice(0, 3).map(p => ({ id: p.id, name: p.name, status: p.status, kind: "SOP" })),
                ].map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F9F8F6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, background: "#EEF2FF", color: "#3730A3", borderRadius: 3, padding: "2px 5px" }}>{item.kind}</span>
                      <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500 }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, background: item.status === "draft" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)", color: item.status === "draft" ? "#991B1B" : "#92400E", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase" as const, flexShrink: 0 }}>{item.status.replace("-", " ")}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Governance Coverage by Framework</div>
                {govFrameworks.map(fw => {
                  const fwActive = policies.filter(p => p.frameworks.includes(fw) && p.status === "active").length;
                  const fwTotal  = policies.filter(p => p.frameworks.includes(fw)).length;
                  return (
                    <div key={fw} style={{ marginBottom: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{fw}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted-foreground)" }}>{fwActive}/{fwTotal} active</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: "var(--input)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: "#1E3A5F", width: `${Math.round((fwActive / Math.max(fwTotal, 1)) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── POLICIES ─────────────────────────────────────────────────────── */}
        {tab === "policies" && (selectedPolicyItem ?
          <PolicyProfile
            policy={selectedPolicyItem}
            onClose={() => setSelectedPolicyItem(null)}
            onAction={handlePolicyAction}
            workflowConfig={itemWorkflows[selectedPolicyItem.policyRef??selectedPolicyItem.id] ?? globalWorkflow.policy}
            users={users}
            onEdit={() => openEdit("policy", selectedPolicyItem)}
            onDelete={() => { setConfirmDel({ type:"policy", id:selectedPolicyItem.policyRef??selectedPolicyItem.id, name:selectedPolicyItem.name }); setSelectedPolicyItem(null); }}
          /> : (
          <>
            <SubTabBar
              tabs={[{key:"list",label:`${orgName} Policies`},{key:"templates",label:"Policy Templates"},{key:"workflow",label:"Approval Workflow"}]}
              active={policySubTab} onSelect={k=>setPolicySubTab(k as "list"|"templates"|"workflow")}
            />
            {policySubTab === "list" && (<>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={policySearch} onChange={e=>setPolicySearch(e.target.value)} placeholder="Search policies…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:220, fontFamily:"inherit" }}/>
                {(["All","distributed","approved","active","in-review","draft","archived"] as const).map(s => (
                  <button key={s} onClick={()=>setPolicyStatusFilter(s)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:policyStatusFilter===s?NAV:"var(--card)", color:policyStatusFilter===s?"white":"#6B7280", borderColor:policyStatusFilter===s?NAV:"rgba(255,255,255,0.1)", textTransform:"capitalize" as const }}>{s}</button>
                ))}
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filteredPolicies.length} of {policies.length} shown</span>
              </div>
              <div style={{ ...cardStyle, overflow:"hidden", padding:0 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                      {["ID","Policy Name","Category","Owner","Version","Status","Impact","Frameworks",""].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.map(p => (
                      <tr key={p.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>navigate(`/govops/policies/${p.id}`)}>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{p.id}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ fontWeight:700, color:NAV }}>{p.name}</div>
                          {p.aiEnriched && <span style={{ fontSize:8, fontWeight:700, color:"#4338CA", background:"#EEF2FF", border:"1px solid rgba(165,180,252,0.25)", borderRadius:3, padding:"1px 5px", marginTop:2, display:"inline-block" }}>AI</span>}
                        </td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{p.category}</td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{p.owner}</td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#6B7280" }}>v{p.version}</td>
                        <td style={{ padding:"10px 14px" }}><Badge label={p.status}/></td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:9, fontWeight:800, color:impColor(p.impact), background:impBg(p.impact), border:`1px solid ${impBd(p.impact)}`, borderRadius:4, padding:"2px 6px" }}>{p.impact}</span>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", gap:3, flexWrap:"wrap" as const }}>
                            {p.frameworks.slice(0,2).map(f => <span key={f} style={{ background:"rgba(59,130,246,0.12)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700, whiteSpace:"nowrap" as const }}>{f}</span>)}
                            {p.frameworks.length > 2 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{p.frameworks.length-2}</span>}
                          </div>
                        </td>
                        <td style={{ padding:"8px 14px", whiteSpace:"nowrap" as const }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", gap:3 }}>
                            <button title="Edit" onClick={()=>openEdit("policy",p)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                            <button title="AI Enrich" onClick={()=>handleEnrich("policy",p.policyRef??p.id,p.name,p.category)} disabled={enriching===(p.policyRef??p.id)} style={{...actBtn,color:enriching===(p.policyRef??p.id)?"rgba(99,102,241,0.4)":"#818CF8"}}>{enriching===(p.policyRef??p.id)?"⟳":"✦"}</button>
                            <button title="Approval Workflow" onClick={()=>openWfModal("item","policy",p.policyRef??p.id,p.name)} style={{...actBtn,color:itemWorkflows[p.policyRef??p.id]?.enabled?"#F59E0B":"var(--muted-foreground)"}}>⚙</button>
                            <button title="Delete" onClick={()=>setConfirmDel({type:"policy",id:p.policyRef??p.id,name:p.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                            <button title="Assign Owner" onClick={()=>setOwnerPick({type:"policy",id:p.policyRef??p.id,name:p.name,owner:p.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                            <button title="Set Risk Level" onClick={()=>setRiskPick({type:"policy",id:p.policyRef??p.id,name:p.name,level:(p as any).riskLevel??"Medium",field:"riskLevel"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                            <button title="Upload Evidence" onClick={()=>setEvidPick({type:"policy",id:p.policyRef??p.id,name:p.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            {policySubTab === "templates" && (
              <OrgDocSection orgName={orgName} docType="policy" tpls={lPolicyTemplates} onUseTemplate={useTemplate}/>
            )}
            {policySubTab === "workflow" && (
              <WorkflowCard docType="policy" globalWf={globalWorkflow.policy} onConfigure={()=>openWfModal("global","policy")}/>
            )}
          </>
        ))}

        {/* ── PROCESSES ────────────────────────────────────────────────────── */}
        {tab === "processes" && (selectedProcessItem ?
          <ProcessProfile process={selectedProcessItem} onClose={() => setSelectedProcessItem(null)} workflowConfig={itemWorkflows[selectedProcessItem.id] ?? globalWorkflow.process} users={users}/> : (
          <>
            <SubTabBar
              tabs={[{key:"list",label:`${orgName} Processes`},{key:"templates",label:"Process Templates"},{key:"workflow",label:"Approval Workflow"}]}
              active={processSubTab} onSelect={k=>setProcessSubTab(k as "list"|"templates"|"workflow")}
            />
            {processSubTab === "list" && (<>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={processSearch} onChange={e=>setProcessSearch(e.target.value)} placeholder="Search processes…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:220, fontFamily:"inherit" }}/>
                {processCats.slice(0,10).map(c => (
                  <button key={c} onClick={()=>setProcessCatFilter(c)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:processCatFilter===c?NAV:"var(--card)", color:processCatFilter===c?"white":"#6B7280", borderColor:processCatFilter===c?NAV:"rgba(255,255,255,0.1)", flexShrink:0 }}>{c}</button>
                ))}
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filteredProcesses.length} shown</span>
              </div>
              <div style={{ ...cardStyle, overflow:"hidden", padding:0 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                      {["ID","Process Name","Category","Owner","Steps","Policy","Status","Maturity","Impact","Frameworks",""].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcesses.map(p => {
                      const matColor = p.maturity==="Optimized"?EME:p.maturity==="Managed"?BLU:p.maturity==="Defined"?NAV:p.maturity==="Repeatable"?AMB:RED;
                      return (
                        <tr key={p.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                            onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                            onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                            onClick={()=>navigate(`/govops/processes/${p.id}`)}>
                          <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{p.id}</td>
                          <td style={{ padding:"10px 14px", fontWeight:700, color:NAV }}>{p.name}</td>
                          <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{p.category}</td>
                          <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{p.owner}</td>
                          <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:NAV }}>{p.steps}</td>
                          <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:BLU }}>{p.linked}</td>
                          <td style={{ padding:"10px 14px" }}><Badge label={p.status}/></td>
                          <td style={{ padding:"10px 14px" }}><span style={{ fontSize:10, fontWeight:700, color:matColor }}>{p.maturity}</span></td>
                          <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:impColor(p.impact), background:impBg(p.impact), border:`1px solid ${impBd(p.impact)}`, borderRadius:4, padding:"2px 6px" }}>{p.impact}</span></td>
                          <td style={{ padding:"10px 14px", maxWidth:180 }}>
                            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:3 }}>
                              {(policyFwMap[p.linked] ?? []).slice(0,2).map(fw => (
                                <span key={fw} style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:"rgba(59,130,246,0.1)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.22)", whiteSpace:"nowrap" as const }}>{fw}</span>
                              ))}
                              {(policyFwMap[p.linked] ?? []).length > 2 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{(policyFwMap[p.linked] ?? []).length-2}</span>}
                              {(policyFwMap[p.linked] ?? []).length === 0 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>—</span>}
                            </div>
                          </td>
                          <td style={{ padding:"8px 14px", whiteSpace:"nowrap" as const }} onClick={e=>e.stopPropagation()}>
                            <div style={{ display:"flex", gap:3 }}>
                              <button title="Edit" onClick={()=>openEdit("process",p)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                              <button title="AI Enrich" onClick={()=>handleEnrich("process",p.id,p.name,p.category)} disabled={enriching===p.id} style={{...actBtn,color:enriching===p.id?"rgba(99,102,241,0.4)":"#818CF8"}}>{enriching===p.id?"⟳":"✦"}</button>
                              <button title="Approval Workflow" onClick={()=>openWfModal("item","process",p.id,p.name)} style={{...actBtn,color:itemWorkflows[p.id]?.enabled?"#F59E0B":"var(--muted-foreground)"}}>⚙</button>
                              <button title="Delete" onClick={()=>setConfirmDel({type:"process",id:p.id,name:p.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                              <button title="Assign Owner" onClick={()=>setOwnerPick({type:"process",id:p.id,name:p.name,owner:p.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                              <button title="Set Impact" onClick={()=>setRiskPick({type:"process",id:p.id,name:p.name,level:(p as any).impact??"Medium",field:"impact"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                              <button title="Upload Evidence" onClick={()=>setEvidPick({type:"process",id:p.id,name:p.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>)}
            {processSubTab === "templates" && (
              <OrgDocSection orgName={orgName} docType="process" tpls={lProcessTemplates} onUseTemplate={useTemplate}/>
            )}
            {processSubTab === "workflow" && (
              <WorkflowCard docType="process" globalWf={globalWorkflow.process} onConfigure={()=>openWfModal("global","process")}/>
            )}
          </>
        ))}

        {/* ── PROCEDURES ───────────────────────────────────────────────────── */}
        {tab === "procedures" && (selectedProcedureItem ?
          <ProcedureProfile procedure={selectedProcedureItem} onClose={() => setSelectedProcedureItem(null)} workflowConfig={itemWorkflows[selectedProcedureItem.id] ?? globalWorkflow.procedure} users={users}/> : (
          <>
            <SubTabBar
              tabs={[{key:"list",label:`${orgName} Procedures`},{key:"templates",label:"Procedure Templates"},{key:"workflow",label:"Approval Workflow"}]}
              active={procedureSubTab} onSelect={k=>setProcedureSubTab(k as "list"|"templates"|"workflow")}
            />
            {procedureSubTab === "list" && (<>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={procSearch} onChange={e=>setProcSearch(e.target.value)} placeholder="Search procedures…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:220, fontFamily:"inherit" }}/>
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filteredProcedures.length} shown</span>
              </div>
              <div style={{ ...cardStyle, overflow:"hidden", padding:0 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                      {["ID","Procedure Name","Process","Owner","Version","Pages","Status","Impact","Frameworks",""].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcedures.map(p => (
                      <tr key={p.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>navigate(`/govops/procedures/${p.id}`)}>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{p.id}</td>
                        <td style={{ padding:"10px 14px", fontWeight:700, color:NAV }}>{p.name}</td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:BLU }}>{p.process}</td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{p.owner}</td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>v{p.version}</td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#6B7280" }}>{p.pages}</td>
                        <td style={{ padding:"10px 14px" }}><Badge label={p.status}/></td>
                        <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:impColor(p.impact), background:impBg(p.impact), border:`1px solid ${impBd(p.impact)}`, borderRadius:4, padding:"2px 6px" }}>{p.impact}</span></td>
                        <td style={{ padding:"10px 14px", maxWidth:180 }}>
                          <div style={{ display:"flex", flexWrap:"wrap" as const, gap:3 }}>
                            {(processFwMap[p.process] ?? []).slice(0,2).map(fw => (
                              <span key={fw} style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:"rgba(59,130,246,0.1)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.22)", whiteSpace:"nowrap" as const }}>{fw}</span>
                            ))}
                            {(processFwMap[p.process] ?? []).length > 2 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{(processFwMap[p.process] ?? []).length-2}</span>}
                            {(processFwMap[p.process] ?? []).length === 0 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>—</span>}
                          </div>
                        </td>
                        <td style={{ padding:"8px 14px", whiteSpace:"nowrap" as const }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", gap:3 }}>
                            <button title="Edit" onClick={()=>openEdit("procedure",p)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                            <button title="AI Enrich" onClick={()=>handleEnrich("procedure",p.id,p.name,"Security")} disabled={enriching===p.id} style={{...actBtn,color:enriching===p.id?"rgba(99,102,241,0.4)":"#818CF8"}}>{enriching===p.id?"⟳":"✦"}</button>
                            <button title="Approval Workflow" onClick={()=>openWfModal("item","procedure",p.id,p.name)} style={{...actBtn,color:itemWorkflows[p.id]?.enabled?"#F59E0B":"var(--muted-foreground)"}}>⚙</button>
                            <button title="Delete" onClick={()=>setConfirmDel({type:"procedure",id:p.id,name:p.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                            <button title="Assign Owner" onClick={()=>setOwnerPick({type:"procedure",id:p.id,name:p.name,owner:p.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                            <button title="Set Impact" onClick={()=>setRiskPick({type:"procedure",id:p.id,name:p.name,level:(p as any).impact??"Medium",field:"impact"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                            <button title="Upload Evidence" onClick={()=>setEvidPick({type:"procedure",id:p.id,name:p.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
            {procedureSubTab === "templates" && (
              <OrgDocSection orgName={orgName} docType="procedure" tpls={lProcedureTemplates} onUseTemplate={useTemplate}/>
            )}
            {procedureSubTab === "workflow" && (
              <WorkflowCard docType="procedure" globalWf={globalWorkflow.procedure} onConfigure={()=>openWfModal("global","procedure")}/>
            )}
          </>
        ))}

        {/* ── CONTROLS ─────────────────────────────────────────────────────── */}
        {tab === "controls" && (<>
          <SubTabBar
            tabs={[{key:"available",label:"Available Controls"},{key:"applicable",label:"Applicable Controls"},{key:"frameworks",label:"Common Control Frameworks"},{key:"library",label:"📚 Full Control Library"}]}
            active={controlsSubTab} onSelect={k=>setControlsSubTab(k as "available"|"applicable"|"frameworks"|"library")}
          />
          {controlsSubTab !== "frameworks" && controlsSubTab !== "library" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[{ label: "Total Controls", value: lControls.length, color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE", statusKey: "All" }, { label: "Implemented", value: lControls.filter(c => c.status === "implemented").length, color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0", statusKey: "implemented" }, { label: "Partial", value: lControls.filter(c => c.status === "partial").length, color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A", statusKey: "partial" }, { label: "Not Started", value: lControls.filter(c => c.status === "not-started").length, color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA", statusKey: "not-started" }].map(k => (
                <div key={k.label} onClick={() => { setControlsStatusFilter(k.statusKey); setControlSearch(""); }} onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={e => (e.currentTarget.style.opacity = "1")} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden", cursor: "pointer" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}
          {controlsSubTab !== "frameworks" && controlsSubTab !== "library" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              {(["All","implemented","partial","not-started"] as const).map(s => (
                <button key={s} onClick={() => setControlsStatusFilter(s)}
                  style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", background:"none", fontFamily:"inherit",
                    border:`1.5px solid ${controlsStatusFilter===s?"rgba(99,179,237,0.55)":"rgba(148,163,184,0.22)"}`,
                    color:controlsStatusFilter===s?"rgb(147,197,253)":"rgba(148,163,184,0.75)" }}>
                  {s==="All"?"All":s==="not-started"?"Not Started":s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
              <input value={controlSearch} onChange={e=>setControlSearch(e.target.value)}
                placeholder="Search controls…"
                style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:6, fontSize:11, background:"var(--input)",
                  border:"1px solid rgba(255,255,255,0.12)", color:"var(--foreground)", outline:"none", width:220, fontFamily:"inherit" }} />
              {(controlsStatusFilter!=="All"||controlSearch) && (
                <button onClick={()=>{setControlsStatusFilter("All");setControlSearch("");}}
                  style={{ padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#F87171", fontFamily:"inherit" }}>
                  ✕ Clear
                </button>
              )}
            </div>
          )}
          {controlsSubTab !== "frameworks" && controlsSubTab !== "library" && (
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", padding:0 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                    {["ID","Control Name","CCF Ref","Frameworks","Owner","Evidence","Risk","Status",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let base = controlsSubTab === "applicable" ? lControls.filter(c=>c.status!=="not-started") : lControls;
                    if (controlsStatusFilter !== "All") base = base.filter(c => c.status === controlsStatusFilter);
                    if (controlSearch) base = base.filter(c => c.name.toLowerCase().includes(controlSearch.toLowerCase()) || c.id.toLowerCase().includes(controlSearch.toLowerCase()));
                    return base;
                  })().map(c => (
                    <tr key={c.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                        onClick={()=>navigate(`/complianceops/controls/${c.id}`)}>
                      <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{c.id}</td>
                      <td style={{ padding:"10px 14px", fontWeight:600, color:"rgb(147,197,253)" }}>{c.name}</td>
                      <td style={{ padding:"10px 14px" }}><span style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 6px", fontSize:9, fontWeight:700, color:"#6B7280", fontFamily:"'JetBrains Mono',monospace" }}>{c.ccf}</span></td>
                      <td style={{ padding:"10px 14px" }}><div style={{ display:"flex", gap:3 }}>{c.frameworks.map((f,i)=><span key={i} style={{ background:"rgba(59,130,246,0.12)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:3, padding:"1px 5px", fontSize:8, fontWeight:700 }}>{f.split(" ")[0]}</span>)}</div></td>
                      <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{c.owner}</td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"rgb(147,197,253)" }}>{c.evidence}</span></td>
                      <td style={{ padding:"10px 14px" }}><span style={{ background:riskC[c.risk]!.bg, color:riskC[c.risk]!.color, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{c.risk}</span></td>
                      <td style={{ padding:"10px 14px" }}><Badge label={c.status}/></td>
                      <td style={{ padding:"8px 14px", whiteSpace:"nowrap" as const }} onClick={e=>e.stopPropagation()}>
                        <div style={{ display:"flex", gap:3 }}>
                          <button title="Edit" onClick={()=>openEdit("control",c)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                          <button title="AI Enrich" onClick={()=>handleEnrich("control",c.id,c.name,c.ccf?.split("-")[0]??"Security")} disabled={enriching===c.id} style={{...actBtn,color:enriching===c.id?"rgba(99,102,241,0.4)":"#818CF8"}}>{enriching===c.id?"⟳":"✦"}</button>
                          <button title="Delete" onClick={()=>setConfirmDel({type:"control",id:c.id,name:c.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                          <button title="Assign Owner" onClick={()=>setOwnerPick({type:"control",id:c.id,name:c.name,owner:c.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                          <button title="Set Risk Level" onClick={()=>setRiskPick({type:"control",id:c.id,name:c.name,level:c.risk??"Medium",field:"severity"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                          <button title="Upload Evidence" onClick={()=>setEvidPick({type:"control",id:c.id,name:c.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {controlsSubTab === "frameworks" && (() => {
            const CCF_FAMILIES: Record<string,string> = { IAM:"Identity & Access Management", VM:"Vulnerability Management", HR:"Human Resources Security", IR:"Incident Response", DAT:"Data Protection", NET:"Network Security", CM:"Change Management", BCP:"Business Continuity & Recovery", TPR:"Third Party Risk" };
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {Object.entries(CCF_FAMILIES).map(([fam,label]) => {
                  const fControls = lControls.filter(c=>c.ccf?.includes(`-${fam}-`)||c.ccf?.startsWith(`${fam}-`));
                  if (!fControls.length) return null;
                  const impl = fControls.filter(c=>c.status==="implemented").length;
                  const pct = Math.round((impl/fControls.length)*100);
                  return (
                    <div key={fam} style={{ ...cardStyle, padding:"14px 18px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div>
                          <span style={{ fontSize:11, fontWeight:800, color:"rgb(147,197,253)", letterSpacing:"0.3px" }}>{fam}</span>
                          <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:8 }}>{label}</span>
                        </div>
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          <span style={{ fontSize:10, fontWeight:700, color:pct>=80?EME:pct>=50?AMB:RED }}>{pct}%</span>
                          <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{impl}/{fControls.length} implemented</span>
                        </div>
                      </div>
                      <div style={{ height:6, background:"var(--secondary)", borderRadius:3, overflow:"hidden", marginBottom:10 }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:pct>=80?"#059669":pct>=50?AMB:RED, borderRadius:3 }}/>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
                        {fControls.map(c=>(
                          <span key={c.id} style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, border:"1px solid", color:c.status==="implemented"?EME:c.status==="partial"?AMB:"var(--muted-foreground)", borderColor:c.status==="implemented"?"rgba(5,150,105,0.3)":c.status==="partial"?"rgba(217,119,6,0.3)":"var(--border)", background:c.status==="implemented"?"rgba(5,150,105,0.08)":c.status==="partial"?"rgba(217,119,6,0.06)":"transparent", fontFamily:"'JetBrains Mono',monospace" }}>{c.ccf}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── FULL CONTROL LIBRARY ─────────────────────────────────────── */}
          {controlsSubTab === "library" && (() => {
            const LIB_FRAMEWORKS = ["All","ISO 27001","SOC 2","NIST CSF","PCI DSS","HIPAA","GDPR","NIS2"];
            const statusColor: Record<string,{bg:string;color:string}> = {
              implemented: { bg:"rgba(5,150,105,0.1)",  color:"#059669" },
              partial:     { bg:"rgba(217,119,6,0.1)",  color:"#D97706" },
              planned:     { bg:"rgba(99,102,241,0.1)", color:"#6366F1" },
              "not-started":{ bg:"rgba(239,68,68,0.08)",color:"#DC2626" },
            };
            let libBase = ctlLibFwFilter === "All" ? controlLibrary : controlLibrary.filter(c => c.framework === ctlLibFwFilter);
            if (ctlLibSearch) libBase = libBase.filter(c => c.name.toLowerCase().includes(ctlLibSearch.toLowerCase()) || c.id.toLowerCase().includes(ctlLibSearch.toLowerCase()) || c.domain.toLowerCase().includes(ctlLibSearch.toLowerCase()));
            const impl   = controlLibrary.filter(c=>c.status==="implemented").length;
            const partial = controlLibrary.filter(c=>c.status==="partial").length;
            const planned = controlLibrary.filter(c=>c.status==="planned").length;
            const ns      = controlLibrary.filter(c=>c.status==="not-started").length;
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {/* Stats row */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                  {[
                    { label:"Total Library",    value:controlLibrary.length, color:"rgb(147,197,253)", border:"#BFDBFE" },
                    { label:"Implemented",      value:impl,    color:"#059669", border:"#A7F3D0" },
                    { label:"Partial",          value:partial, color:"#D97706", border:"#FDE68A" },
                    { label:"Planned",          value:planned, color:"#6366F1", border:"#C7D2FE" },
                    { label:"Not Started",      value:ns,      color:"#DC2626", border:"#FECACA" },
                  ].map(k=>(
                    <div key={k.label} style={{ background:"var(--card)", border:`1px solid ${k.border}`, borderRadius:10, padding:"12px 16px", position:"relative", overflow:"hidden" }}>
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, opacity:0.7, borderRadius:"10px 10px 0 0" }}/>
                      <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:5 }}>{k.label}</div>
                      <div style={{ fontSize:24, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {/* Framework filter + search */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, alignItems:"center" }}>
                  {LIB_FRAMEWORKS.map(fw=>(
                    <button key={fw} onClick={()=>setCtlLibFwFilter(fw)}
                      style={{ padding:"4px 11px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", background:"none", fontFamily:"inherit",
                        border:`1.5px solid ${ctlLibFwFilter===fw?"rgba(99,179,237,0.55)":"rgba(148,163,184,0.22)"}`,
                        color:ctlLibFwFilter===fw?"rgb(147,197,253)":"var(--muted-foreground)" }}>
                      {fw}
                    </button>
                  ))}
                  <input value={ctlLibSearch} onChange={e=>setCtlLibSearch(e.target.value)}
                    placeholder="Search by ID, name or domain…"
                    style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:6, fontSize:11, background:"var(--input)",
                      border:"1px solid rgba(255,255,255,0.12)", color:"var(--foreground)", outline:"none", width:260, fontFamily:"inherit" }}/>
                  <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{libBase.length} controls</span>
                  {(ctlLibFwFilter!=="All"||ctlLibSearch) && (
                    <button onClick={()=>{setCtlLibFwFilter("All");setCtlLibSearch("");}}
                      style={{ padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#F87171", fontFamily:"inherit" }}>
                      ✕ Clear
                    </button>
                  )}
                </div>
                {/* Controls table */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                        {["ID","Control Name","Framework","Domain","Cross-References","Status","Evidence","Owner",""].map(h=>(
                          <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {libBase.slice(0,120).map(c=>{
                        const sc = statusColor[c.status] ?? statusColor["not-started"];
                        return (
                          <tr key={c.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                              onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                              onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                              onClick={()=>navigate(`/govops/controls/${encodeURIComponent(c.id)}`)}>
                            <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{c.id}</td>
                            <td style={{ padding:"9px 14px", fontWeight:600, color:"rgb(147,197,253)", maxWidth:280 }}>{c.name}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:"rgba(59,130,246,0.1)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.22)", borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700, whiteSpace:"nowrap" as const }}>{c.framework}</span>
                            </td>
                            <td style={{ padding:"9px 14px", color:"var(--muted-foreground)", fontSize:11, whiteSpace:"nowrap" as const }}>{c.domain}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <div style={{ display:"flex", gap:3, flexWrap:"wrap" as const }}>
                                {c.crossReferences.slice(0,3).map((x,i)=>(
                                  <span key={i} style={{ background:"rgba(99,102,241,0.08)", color:"#818CF8", border:"1px solid rgba(99,102,241,0.2)", borderRadius:3, padding:"1px 5px", fontSize:8, fontWeight:700, whiteSpace:"nowrap" as const }}>{x.split(":")[0]}</span>
                                ))}
                                {c.crossReferences.length > 3 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{c.crossReferences.length-3}</span>}
                              </div>
                            </td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.color}33`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>
                                {c.status==="not-started"?"Not Started":c.status.charAt(0).toUpperCase()+c.status.slice(1)}
                              </span>
                            </td>
                            <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"rgb(147,197,253)" }}>{c.evidence}</td>
                            <td style={{ padding:"9px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{c.owner}</td>
                            <td style={{ padding:"8px 14px" }} onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>navigate(`/govops/controls/${encodeURIComponent(c.id)}`)}
                                style={{ padding:"3px 8px", borderRadius:4, border:"1px solid rgba(99,179,237,0.25)", background:"rgba(59,130,246,0.08)", color:"rgb(147,197,253)", fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>
                                View →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {libBase.length > 120 && (
                    <div style={{ padding:"12px 18px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--muted-foreground)", textAlign:"center" as const }}>
                      Showing 120 of {libBase.length} controls — refine framework filter or search to narrow results
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </>)}

        {/* ── ATTESTATION ──────────────────────────────────────────────────── */}
        {tab === "attestation" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {[{ label: "Total Policies Distributed", value: totalPol, color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" }, { label: "Acknowledged", value: totalAck, color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" }, { label: "Pending", value: totalPol - totalAck, color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" }, { label: "Overdue", value: totalOverdue, color: "#DC2626", bg: "rgba(239,68,68,0.06)", border: "#FECACA" }].map(k => (
                <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)" }}>Organisation-wide Attestation Progress</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#065F46" }}>{Math.round((totalAck / totalPol) * 100)}%</span>
              </div>
              <div style={{ height: 12, background: "var(--input)", borderRadius: 6, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${(totalAck / totalPol) * 100}%`, background: "linear-gradient(90deg, #065F46, #059669)", borderRadius: "6px 0 0 6px" }} />
                {totalOverdue > 0 && <div style={{ width: `${(totalOverdue / totalPol) * 100}%`, background: "#DC2626" }} />}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
                <span style={{ color: "#065F46" }}>● Acknowledged: {totalAck}</span>
                <span style={{ color: "#DC2626" }}>● Overdue: {totalOverdue}</span>
                <span style={{ color: "var(--muted-foreground)" }}>● Pending: {totalPol - totalAck}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
              {lAttestDepts.map(d => {
                const pct = Math.round((d.acknowledged / d.totalPolicies) * 100);
                return (
                  <div key={d.dept} style={{ background: "var(--card)", border: `1px solid ${d.overdue > 0 ? "#FECACA" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <div style={{ position: "relative" }}>
                        <RingChart pct={pct} color={pct === 100 ? "#059669" : d.overdue > 0 ? "#DC2626" : d.color} size={56} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: pct === 100 ? "#065F46" : "var(--foreground)" }}>{pct}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>{d.dept}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{d.contact}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 10, textAlign: "center" }}>
                      <div style={{ background: "var(--card)", borderRadius: 6, padding: "4px 0" }}><div style={{ fontWeight: 800, color: "rgb(147,197,253)" }}>{d.totalPolicies}</div><div style={{ color: "var(--muted-foreground)" }}>Total</div></div>
                      <div style={{ background: "rgba(34,197,94,0.08)", borderRadius: 6, padding: "4px 0" }}><div style={{ fontWeight: 800, color: "#065F46" }}>{d.acknowledged}</div><div style={{ color: "#065F46" }}>Ack'd</div></div>
                      <div style={{ background: d.overdue > 0 ? "rgba(239,68,68,0.06)" : "var(--card)", borderRadius: 6, padding: "4px 0" }}><div style={{ fontWeight: 800, color: d.overdue > 0 ? "#DC2626" : "var(--muted-foreground)" }}>{d.overdue}</div><div style={{ color: d.overdue > 0 ? "#DC2626" : "var(--muted-foreground)" }}>Overdue</div></div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 9, color: "var(--muted-foreground)" }}>Last activity: {d.lastActivity}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)" }}>Policy Version History</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {["POL-001", "POL-004"].map(id => (
                    <button key={id} onClick={() => setSelectedPolicy(id)} style={{ background: selectedPolicy === id ? "#1E3A5F" : "var(--border)", color: selectedPolicy === id ? "white" : "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{id}</button>
                  ))}
                </div>
              </div>
              {selectedPolicy && policyVersionHistory[selectedPolicy] ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {policyVersionHistory[selectedPolicy]!.map((v, i) => (
                    <div key={v.version} style={{ display: "flex", gap: 16, paddingBottom: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: i === 0 ? "#065F46" : "#D1D5DB", flexShrink: 0 }} />
                        {i < policyVersionHistory[selectedPolicy]!.length - 1 && <div style={{ flex: 1, width: 2, background: "rgb(23,30,42)" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: "rgb(147,197,253)", background: "rgba(59,130,246,0.12)", borderRadius: 4, padding: "1px 6px" }}>v{v.version}</span>
                          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{v.changedAt} · {v.changedBy}</span>
                          <Badge label={v.status} />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--foreground)" }}>{v.summary}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "20px 0" }}>Select a policy to view version history</div>}
            </div>
          </>
        )}

        {tab === "workflow" && (
          <WorkflowPipeline workflows={[POLICY_LIFECYCLE_WF]} />
        )}

      </div>

      {/* ── Edit Drawer ────────────────────────────────────────────────── */}
      <Drawer
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditTarget(null); }}
        title={`Edit ${editTarget?.type === "policy" ? "Policy" : editTarget?.type === "process" ? "Process" : editTarget?.type === "procedure" ? "Procedure" : "Control"}`}
        subtitle="Update fields and save changes"
        width={540}
        headerColor="#065F46"
      >
        {(() => {
          const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4, display:"block" };
          const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" };
          const ta:  React.CSSProperties = { ...inp, minHeight:80, resize:"vertical" };
          const row: React.CSSProperties = { marginBottom:16 };
          const grid2: React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 };
          const type = editTarget?.type ?? "";
          return (
            <div>
              <div style={row}>
                <label style={lbl}>Name *</label>
                <input style={inp} value={editForm.name} onChange={e=>ef("name",e.target.value)} autoFocus/>
              </div>

              {type === "policy" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label>
                    <select style={inp} value={editForm.category} onChange={e=>ef("category",e.target.value)}>
                      {["Security","IAM","Data","Privacy","Governance","Risk","Cloud","Compliance","HR"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Owner</label><input style={inp} value={editForm.owner} onChange={e=>ef("owner",e.target.value)}/></div>
                </div>
                <div style={row}><label style={lbl}>Frameworks (comma-separated)</label><input style={inp} value={editForm.frameworks} onChange={e=>ef("frameworks",e.target.value)}/></div>
                <div style={grid2}>
                  <div><label style={lbl}>Next Review Date</label><input style={inp} type="date" value={editForm.nextReview} onChange={e=>ef("nextReview",e.target.value)}/></div>
                  <div><label style={lbl}>Department Targets</label><input style={inp} value={editForm.departmentTargets} onChange={e=>ef("departmentTargets",e.target.value)}/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={editForm.description} onChange={e=>ef("description",e.target.value)}/></div>
                <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
                  <input type="checkbox" id="edit-attest-chk" checked={editForm.attestationRequired} onChange={e=>ef("attestationRequired",e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }}/>
                  <label htmlFor="edit-attest-chk" style={{ ...lbl, marginBottom:0, cursor:"pointer" }}>Requires Attestation</label>
                </div>
              </>)}

              {type === "process" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label>
                    <select style={inp} value={editForm.category} onChange={e=>ef("category",e.target.value)}>
                      {["Security","IAM","ITSM","Risk","Privacy","BCP","AppSec","Data","HR Security","Cloud"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Owner</label><input style={inp} value={editForm.owner} onChange={e=>ef("owner",e.target.value)}/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={editForm.description} onChange={e=>ef("description",e.target.value)}/></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                  <div><label style={lbl}>Steps</label><input style={inp} type="number" min={1} max={30} value={editForm.steps} onChange={e=>ef("steps",e.target.value)}/></div>
                  <div><label style={lbl}>Maturity</label>
                    <select style={inp} value={editForm.maturity} onChange={e=>ef("maturity",e.target.value)}>
                      {["Initial","Repeatable","Defined","Managed","Optimized"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Impact</label>
                    <select style={inp} value={editForm.impact} onChange={e=>ef("impact",e.target.value)}>
                      {["Critical","High","Medium","Low"].map(i=><option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div style={row}><label style={lbl}>Linked Policy Ref</label><input style={inp} value={editForm.linked} onChange={e=>ef("linked",e.target.value)}/></div>
              </>)}

              {type === "procedure" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Owner</label><input style={inp} value={editForm.owner} onChange={e=>ef("owner",e.target.value)}/></div>
                  <div><label style={lbl}>Linked Process ID</label><input style={inp} value={editForm.linked} onChange={e=>ef("linked",e.target.value)}/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={editForm.description} onChange={e=>ef("description",e.target.value)}/></div>
                <div style={grid2}>
                  <div><label style={lbl}>Pages</label><input style={inp} type="number" min={1} max={50} value={editForm.pages} onChange={e=>ef("pages",e.target.value)}/></div>
                  <div><label style={lbl}>Impact</label>
                    <select style={inp} value={editForm.impact} onChange={e=>ef("impact",e.target.value)}>
                      {["Critical","High","Medium","Low"].map(i=><option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
              </>)}

              {type === "control" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label><input style={inp} value={editForm.category} onChange={e=>ef("category",e.target.value)}/></div>
                  <div><label style={lbl}>Control Type</label>
                    <select style={inp} value={editForm.ctlType} onChange={e=>ef("ctlType",e.target.value)}>
                      {["technical","administrative","physical"].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={row}><label style={lbl}>Owner</label><input style={inp} value={editForm.owner} onChange={e=>ef("owner",e.target.value)}/></div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={editForm.description} onChange={e=>ef("description",e.target.value)}/></div>
                <div style={row}><label style={lbl}>Frameworks (comma-separated)</label><input style={inp} value={editForm.frameworks} onChange={e=>ef("frameworks",e.target.value)}/></div>
              </>)}

              <div style={{ marginTop:8, display:"flex", gap:10 }}>
                <button onClick={handleSave} disabled={saving||!editForm.name.trim()} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:saving||!editForm.name.trim()?"rgba(6,95,70,0.35)":"linear-gradient(135deg,#065F46,#059669)", color:"white", fontSize:13, fontWeight:700, cursor:saving||!editForm.name.trim()?"not-allowed":"pointer", fontFamily:"inherit", transition:"background 0.2s" }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button onClick={()=>{setShowEdit(false);setEditTarget(null);}} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Workflow Config Modal ──────────────────────────────────────────── */}
      {showWfModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowWfModal(null)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:14, padding:"28px 32px", width:500, boxShadow:"0 8px 40px rgba(0,0,0,0.65)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:800, color:"rgb(147,197,253)", marginBottom:4 }}>
              {showWfModal.scope==="global"
                ? `Global ${showWfModal.docType.charAt(0).toUpperCase()+showWfModal.docType.slice(1)} Approval Workflow`
                : `Item Workflow — ${showWfModal.itemName}`}
            </div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:20 }}>
              {showWfModal.scope==="item"
                ? "Item-specific workflow takes priority over the global workflow."
                : `Applies to all ${showWfModal.docType}s unless overridden at item level.`}
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"12px 14px", background:"var(--secondary)", borderRadius:8, border:"1px solid var(--border)" }}>
              <button onClick={()=>wf("enabled",!wfForm.enabled)} style={{ width:38, height:20, borderRadius:10, border:"none", cursor:"pointer", background:wfForm.enabled?"#059669":"rgba(148,163,184,0.2)", position:"relative", flexShrink:0, transition:"background 0.2s", outline:"none" }}>
                <span style={{ position:"absolute", top:2, left:wfForm.enabled?18:2, width:16, height:16, borderRadius:"50%", background:"white", transition:"left 0.2s", display:"block" }}/>
              </button>
              <span style={{ fontSize:12, fontWeight:700, color:wfForm.enabled?"var(--foreground)":"var(--muted-foreground)" }}>
                {wfForm.enabled ? "Approval workflow enabled" : "Approval workflow disabled — documents auto-advance"}
              </span>
            </div>

            {wfForm.enabled && (<>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:8 }}>Approval Levels</div>
                <div style={{ display:"flex", gap:8 }}>
                  {([1,2,3,4,5] as const).map(n=>(
                    <button key={n} onClick={()=>wf("levels",n)} style={{ flex:1, padding:"9px", borderRadius:7, border:"2px solid", borderColor:wfForm.levels===n?"#1E3A5F":"rgba(255,255,255,0.1)", background:wfForm.levels===n?"rgba(30,58,95,0.3)":"var(--secondary)", color:wfForm.levels===n?"rgb(147,197,253)":"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", outline:"none" }}>
                      {n}L
                    </button>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:"var(--muted-foreground)" }}>
                  {wfForm.levels===1?"Single approver — document auto-activates after approval.":wfForm.levels===2?"Two-step sequential — L1 approves first, then L2.":wfForm.levels===3?"Three-tier chain — all levels must approve in sequence.":wfForm.levels===4?"Four-tier approval — escalation through department and executive review.":"Five-tier enterprise chain — full governance board sign-off required."}
                </div>
              </div>

              {([0,1,2,3,4] as const).filter(i=>i<wfForm.levels).map(i=>(
                <div key={i} style={{ marginBottom:13 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:6 }}>
                    Level {i+1} Approver {["(Primary)","(Secondary)","(Tertiary)","(Reviewer)","(Final Authority)"][i]}
                  </div>
                  <select value={wfForm.approvers[i]} onChange={e=>{ const a=[...wfForm.approvers] as [string,string,string,string,string]; a[i]=e.target.value; wf("approvers",a); }} style={{ width:"100%", padding:"9px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:wfForm.approvers[i]?"var(--foreground)":"var(--muted-foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}>
                    <option value="">— Select approver from People Ops —</option>
                    {users.length>0 ? users.map(u=>(
                      <option key={u.id} value={u.id}>{u.name}{u.role?` · ${u.role}`:""}{u.department?` (${u.department})`:""}</option>
                    )) : (
                      [["ciso","Sarah Chen","CISO","Security"],["cto","Alex Kim","CTO","Engineering"],["cfo","Clara Kim","CFO","Finance"],["legal","Marcus Thompson","Legal Counsel","Legal"],["dpo","Priya Patel","DPO","Privacy"],["vp-eng","Ryan Johnson","VP Engineering","Engineering"],["vp-ops","Lena Schwartz","VP Operations","Operations"]].map(([id,name,role,dept])=>(
                        <option key={id} value={id}>{name} · {role} ({dept})</option>
                      ))
                    )}
                  </select>
                </div>
              ))}
            </>)}

            {showWfModal.scope==="item" && (
              <div style={{ marginBottom:16, padding:"9px 12px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(253,230,138,0.2)", borderRadius:7 }}>
                <span style={{ fontSize:10, color:"#D97706", fontWeight:700 }}>⚡ Item-specific workflow</span>
                <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:6 }}>This overrides the global {showWfModal.docType} workflow for this item only.</span>
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button onClick={saveWfModal} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Save Workflow</button>
              <button onClick={()=>setShowWfModal(null)} style={{ padding:"10px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Dialog ───────────────────────────────────────── */}
      {confirmDel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setConfirmDel(null)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, padding:"28px 32px", width:420, boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:800, color:"#F87171", marginBottom:8 }}>Delete {confirmDel.type.charAt(0).toUpperCase()+confirmDel.type.slice(1)}?</div>
            <div style={{ fontSize:12, color:"rgba(148,163,184,0.8)", marginBottom:24 }}>
              <strong style={{ color:"var(--foreground)" }}>"{confirmDel.name}"</strong> will be permanently removed. This action cannot be undone.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleDelete} disabled={deleting} style={{ flex:1, padding:"9px", borderRadius:8, border:"none", background:"#991B1B", color:"white", fontSize:13, fontWeight:700, cursor:deleting?"not-allowed":"pointer", fontFamily:"inherit" }}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
              <button onClick={()=>setConfirmDel(null)} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Drawer ──────────────────────────────────────────────── */}
      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateForm({ ...blankGovForm }); }}
        title={`New ${tab === "policies" ? "Policy" : tab === "processes" ? "Process" : tab === "procedures" ? "Procedure" : "Control"}`}
        subtitle={tab === "policies" ? "Create a new governance policy document" : tab === "processes" ? "Create a new operational process entry" : tab === "procedures" ? "Create a new standard procedure (SOP)" : "Create a new control entry"}
        width={540}
        headerColor="#1E3A5F"
      >
        {(() => {
          const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4, display:"block" };
          const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" };
          const ta:  React.CSSProperties = { ...inp, minHeight:80, resize:"vertical" };
          const row: React.CSSProperties = { marginBottom:16 };
          const grid2: React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 };
          return (
            <div>
              {/* Name — common to all */}
              <div style={row}>
                <label style={lbl}>Name *</label>
                <input style={inp} value={createForm.name} onChange={e => cf("name", e.target.value)} placeholder={tab==="policies"?"e.g. Endpoint Security Policy":tab==="processes"?"e.g. Patch Management Process":tab==="procedures"?"e.g. Emergency Access Procedure":"e.g. Multi-Factor Authentication"} autoFocus/>
              </div>

              {/* Policy-specific fields */}
              {tab === "policies" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label>
                    <select style={inp} value={createForm.category} onChange={e => cf("category", e.target.value)}>
                      {["Security","IAM","Data","Privacy","Governance","Risk","Cloud","Compliance","HR"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Owner</label><input style={inp} value={createForm.owner} onChange={e => cf("owner", e.target.value)} placeholder="e.g. Sarah Chen"/></div>
                </div>
                <div style={row}><label style={lbl}>Frameworks (comma-separated)</label><input style={inp} value={createForm.frameworks} onChange={e => cf("frameworks", e.target.value)} placeholder="e.g. ISO 27001, SOC 2, NIST CSF"/></div>
                <div style={grid2}>
                  <div><label style={lbl}>Next Review Date</label><input style={inp} type="date" value={createForm.nextReview} onChange={e => cf("nextReview", e.target.value)}/></div>
                  <div><label style={lbl}>Department Targets</label><input style={inp} value={createForm.departmentTargets} onChange={e => cf("departmentTargets", e.target.value)} placeholder="e.g. Engineering, All"/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={createForm.description} onChange={e => cf("description", e.target.value)} placeholder="Describe the purpose and scope of this policy…"/></div>
                <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
                  <input type="checkbox" id="attest-chk" checked={createForm.attestationRequired} onChange={e => cf("attestationRequired", e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }}/>
                  <label htmlFor="attest-chk" style={{ ...lbl, marginBottom:0, cursor:"pointer" }}>Requires Attestation</label>
                </div>
              </>)}

              {/* Process-specific fields */}
              {tab === "processes" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label>
                    <select style={inp} value={createForm.category} onChange={e => cf("category", e.target.value)}>
                      {["Security","IAM","ITSM","Risk","Privacy","BCP","AppSec","Data","HR Security","Cloud"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Owner</label><input style={inp} value={createForm.owner} onChange={e => cf("owner", e.target.value)} placeholder="e.g. Alex Kim"/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={createForm.description} onChange={e => cf("description", e.target.value)} placeholder="Describe the purpose and objective of this process…"/></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                  <div><label style={lbl}>Steps</label><input style={inp} type="number" min={1} max={30} value={createForm.steps} onChange={e => cf("steps", e.target.value)}/></div>
                  <div><label style={lbl}>Maturity</label>
                    <select style={inp} value={createForm.maturity} onChange={e => cf("maturity", e.target.value)}>
                      {["Initial","Repeatable","Defined","Managed","Optimized"].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Impact</label>
                    <select style={inp} value={createForm.impact} onChange={e => cf("impact", e.target.value)}>
                      {["Critical","High","Medium","Low"].map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div style={row}><label style={lbl}>Linked Policy Ref</label><input style={inp} value={createForm.linked} onChange={e => cf("linked", e.target.value)} placeholder="e.g. POL-001"/></div>
              </>)}

              {/* Procedure-specific fields */}
              {tab === "procedures" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Owner</label><input style={inp} value={createForm.owner} onChange={e => cf("owner", e.target.value)} placeholder="e.g. Sarah Chen"/></div>
                  <div><label style={lbl}>Linked Process ID</label><input style={inp} value={createForm.linked} onChange={e => cf("linked", e.target.value)} placeholder="e.g. PRC-001"/></div>
                </div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={createForm.description} onChange={e => cf("description", e.target.value)} placeholder="Describe the purpose of this procedure…"/></div>
                <div style={grid2}>
                  <div><label style={lbl}>Pages</label><input style={inp} type="number" min={1} max={50} value={createForm.pages} onChange={e => cf("pages", e.target.value)}/></div>
                  <div><label style={lbl}>Impact</label>
                    <select style={inp} value={createForm.impact} onChange={e => cf("impact", e.target.value)}>
                      {["Critical","High","Medium","Low"].map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
              </>)}

              {/* Control-specific fields */}
              {tab === "controls" && (<>
                <div style={grid2}>
                  <div><label style={lbl}>Category</label><input style={inp} value={createForm.category} onChange={e => cf("category", e.target.value)} placeholder="e.g. IAM, Security, Data"/></div>
                  <div><label style={lbl}>Control Type</label>
                    <select style={inp} value={createForm.ctlType} onChange={e => cf("ctlType", e.target.value)}>
                      {["technical","administrative","physical"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={row}><label style={lbl}>Owner</label><input style={inp} value={createForm.owner} onChange={e => cf("owner", e.target.value)} placeholder="e.g. Alex Kim"/></div>
                <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={createForm.description} onChange={e => cf("description", e.target.value)} placeholder="Describe what this control does and how it operates…"/></div>
                <div style={row}><label style={lbl}>Frameworks (comma-separated)</label><input style={inp} value={createForm.frameworks} onChange={e => cf("frameworks", e.target.value)} placeholder="e.g. ISO 27001 A.9.4, SOC 2 CC6.1"/></div>
              </>)}

              <div style={{ marginTop:8, display:"flex", gap:10 }}>
                <button onClick={handleCreate} disabled={creating||!createForm.name.trim()} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:creating||!createForm.name.trim()?"rgba(30,58,95,0.35)":"linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:13, fontWeight:700, cursor:creating||!createForm.name.trim()?"not-allowed":"pointer", fontFamily:"inherit", transition:"background 0.2s" }}>
                  {creating ? "Creating…" : `Create ${tab==="policies"?"Policy":tab==="processes"?"Process":tab==="procedures"?"Procedure":"Control"}`}
                </button>
                <button onClick={() => { setShowCreate(false); setCreateForm({ ...blankGovForm }); }} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Import Modal ────────────────────────────────────────────────── */}
      {showImport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={() => { if (!importing) setShowImport(false); }}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, width:640, maxWidth:"92vw", maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 12px 60px rgba(0,0,0,0.7)", overflow:"hidden" }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding:"18px 24px 14px", borderBottom:"1px solid rgba(255,255,255,0.08)", background:"linear-gradient(135deg,rgba(30,58,95,0.6),rgba(6,95,70,0.3))", flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"rgb(147,197,253)" }}>
                    Import {tab === "policies" ? "Policies" : tab === "processes" ? "Processes" : "Procedures"}
                  </div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>
                    {importStep === "upload" ? "Upload a CSV or JSON file to import multiple records at once" : importStep === "preview" ? `${importRows.length} row${importRows.length !== 1 ? "s" : ""} parsed — review before importing` : importResults.fail === 0 ? `${importResults.ok} record${importResults.ok !== 1 ? "s" : ""} imported successfully` : `${importResults.ok} succeeded · ${importResults.fail} failed`}
                  </div>
                </div>
                {!importing && (
                  <button onClick={() => setShowImport(false)} style={{ background:"none", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, color:"var(--muted-foreground)", fontSize:16, cursor:"pointer", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"inherit" }}>×</button>
                )}
              </div>
              {/* Step indicator */}
              <div style={{ display:"flex", gap:0, marginTop:14 }}>
                {(["upload","preview","done"] as const).map((step, i) => (
                  <div key={step} style={{ display:"flex", alignItems:"center", flex:1 }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flex:1 }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, background: importStep === step ? "#1D4ED8" : (["upload","preview","done"].indexOf(importStep) > i) ? "#065F46" : "var(--secondary)", color: importStep === step || (["upload","preview","done"].indexOf(importStep) > i) ? "white" : "var(--muted-foreground)", border:`1px solid ${importStep === step ? "#3B82F6" : (["upload","preview","done"].indexOf(importStep) > i) ? "#065F46" : "rgba(255,255,255,0.1)"}` }}>{i + 1}</div>
                      <div style={{ fontSize:9, fontWeight:700, color: importStep === step ? "rgb(147,197,253)" : "var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.3px" }}>{step === "upload" ? "Upload" : step === "preview" ? "Preview" : "Done"}</div>
                    </div>
                    {i < 2 && <div style={{ height:1, flex:1, background: (["upload","preview","done"].indexOf(importStep) > i) ? "#065F46" : "rgba(255,255,255,0.1)", marginBottom:16 }}/>}
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>

              {/* ── Step 1: Upload ── */}
              {importStep === "upload" && (() => {
                const tpl = importTemplates[tab as keyof typeof importTemplates];
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {/* Drop zone */}
                    <div
                      onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                      onDragLeave={() => setImportDragOver(false)}
                      onDrop={e => { e.preventDefault(); setImportDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseImportFile(f); }}
                      style={{ border:`2px dashed ${importDragOver ? "#3B82F6" : "rgba(255,255,255,0.15)"}`, borderRadius:10, padding:"36px 24px", textAlign:"center", background: importDragOver ? "rgba(59,130,246,0.06)" : "var(--secondary)", transition:"all 0.15s", cursor:"pointer" }}
                      onClick={() => document.getElementById("grc-import-file")?.click()}
                    >
                      <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>Drop your file here or click to browse</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Accepts CSV (.csv) or JSON (.json) files</div>
                      <input id="grc-import-file" type="file" accept=".csv,.json" style={{ display:"none" }} onChange={e => { const f = e.target.files?.[0]; if (f) parseImportFile(f); e.target.value = ""; }}/>
                    </div>

                    {/* Expected columns */}
                    {tpl && (
                      <div style={{ background:"rgba(30,58,95,0.2)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:8, padding:"12px 16px" }}>
                        <div style={{ fontSize:10, fontWeight:800, color:"rgb(147,197,253)", letterSpacing:"0.5px", marginBottom:8, textTransform:"uppercase" }}>Expected Columns</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {tpl.headers.split(",").map(col => (
                            <span key={col} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, background:"rgba(59,130,246,0.12)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"2px 7px" }}>{col}</span>
                          ))}
                        </div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:8 }}>
                          For <strong>frameworks</strong> {tab === "policies" && "and <strong>departmentTargets</strong> "}: use semicolons (;) to separate multiple values within a cell.
                        </div>
                      </div>
                    )}

                    {/* Download template */}
                    <button onClick={downloadTemplate} style={{ alignSelf:"flex-start", padding:"7px 14px", borderRadius:7, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
                      ⬇ Download CSV Template
                    </button>
                  </div>
                );
              })()}

              {/* ── Step 2: Preview ── */}
              {importStep === "preview" && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Showing first {Math.min(importRows.length, 10)} of {importRows.length} row{importRows.length !== 1 ? "s" : ""}. All rows will be imported.</div>
                  <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr style={{ background:"rgba(30,58,95,0.4)" }}>
                          {Object.keys(importRows[0] ?? {}).map(col => (
                            <th key={col} style={{ padding:"8px 10px", textAlign:"left", fontWeight:800, color:"rgb(147,197,253)", fontSize:10, letterSpacing:"0.4px", textTransform:"uppercase", borderBottom:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap" }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 10).map((row, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} style={{ padding:"7px 10px", color:"var(--foreground)", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={val}>{val || <span style={{ color:"rgba(148,163,184,0.4)" }}>—</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 10 && (
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", fontStyle:"italic" }}>…and {importRows.length - 10} more row{importRows.length - 10 !== 1 ? "s" : ""}</div>
                  )}
                </div>
              )}

              {/* ── Step 3: Done ── */}
              {importStep === "done" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ display:"flex", gap:12 }}>
                    {importResults.ok > 0 && (
                      <div style={{ flex:1, background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:10, padding:"16px 20px", textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, color:"#34D399", fontFamily:"'JetBrains Mono',monospace" }}>{importResults.ok}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#065F46", marginTop:4 }}>Imported Successfully</div>
                      </div>
                    )}
                    {importResults.fail > 0 && (
                      <div style={{ flex:1, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"16px 20px", textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, color:"#F87171", fontFamily:"'JetBrains Mono',monospace" }}>{importResults.fail}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"#991B1B", marginTop:4 }}>Failed</div>
                      </div>
                    )}
                  </div>
                  {importResults.errors.length > 0 && (
                    <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"12px 16px" }}>
                      <div style={{ fontSize:10, fontWeight:800, color:"#F87171", marginBottom:8, letterSpacing:"0.4px", textTransform:"uppercase" }}>Errors</div>
                      {importResults.errors.map((err, i) => (
                        <div key={i} style={{ fontSize:11, color:"rgba(248,113,113,0.8)", marginBottom:4, fontFamily:"'JetBrains Mono',monospace" }}>• {err}</div>
                      ))}
                    </div>
                  )}
                  {importResults.ok > 0 && (
                    <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                      The imported records are now visible in the {tab} list.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:"14px 24px", borderTop:"1px solid rgba(255,255,255,0.08)", display:"flex", justifyContent:"flex-end", gap:10, flexShrink:0 }}>
              {importStep === "upload" && (
                <button onClick={() => setShowImport(false)} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              )}
              {importStep === "preview" && (<>
                <button onClick={() => setImportStep("upload")} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>← Back</button>
                <button onClick={handleImportConfirm} disabled={importing || importRows.length === 0} style={{ padding:"9px 20px", borderRadius:8, border:"none", background: importing ? "rgba(30,58,95,0.4)" : "linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:13, fontWeight:700, cursor: importing ? "not-allowed" : "pointer", fontFamily:"inherit", minWidth:140 }}>
                  {importing ? `Importing… (${importResults.ok + importResults.fail}/${importRows.length})` : `Import ${importRows.length} Record${importRows.length !== 1 ? "s" : ""}`}
                </button>
              </>)}
              {importStep === "done" && (<>
                {importResults.fail > 0 && (
                  <button onClick={() => setImportStep("upload")} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Import More</button>
                )}
                <button onClick={() => setShowImport(false)} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Done</button>
              </>)}
            </div>
          </div>
        </div>
      )}

      {ownerPick && <OwnerPickerModal open={true} objectType={ownerPick.type} objectId={ownerPick.id} objectName={ownerPick.name} currentOwner={ownerPick.owner} onClose={()=>setOwnerPick(null)} onSaved={v=>afterOwnerSave(ownerPick.type,ownerPick.id,v)} />}
      {riskPick  && <RiskLevelModal  open={true} objectType={riskPick.type}  objectId={riskPick.id}  objectName={riskPick.name}  currentLevel={riskPick.level} fieldName={riskPick.field} onClose={()=>setRiskPick(null)}  onSaved={v=>afterRiskSave(riskPick.type,riskPick.id,v,riskPick.field)} />}
      {evidPick  && <EvidenceUploadModal open={true} objectType={evidPick.type} objectId={String(evidPick.id)} objectName={evidPick.name} onClose={()=>setEvidPick(null)} onSaved={()=>setEvidPick(null)} />}
    </div>
  );
}

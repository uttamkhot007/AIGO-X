// @ts-nocheck
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { SubNav, ModuleHeader, Badge, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import WorkflowPipeline, { AUDIT_WORKFLOW_WF } from "@/components/WorkflowPipeline";
import { useComplianceControls, useComplianceFrameworks } from "@/hooks/useGrcApi";
import { Drawer, Field, DrawerSection, DrawerBadge } from "@/components/Drawer";
import { allFrameworks } from "@/lib/grc-data";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";
import { useLicense } from "@/context/LicenseContext";
import EvidenceEngine from "@/pages/EvidenceEngine";
import Questionnaires from "@/pages/Questionnaires";

// ── Existing data (unchanged) ──────────────────────────────────────────────────
const audits: any[] = [];

const evidence: any[] = [];

const gaps: any[] = [];

// ── Maturity model data ───────────────────────────────────────────────────────
// score: current maturity level (1-5)   prev: last quarter's level
// controls: total mapped controls       implemented: fully evidenced controls
// partial: controls with partial evidence  target: next-milestone level
const maturityDomains: any[] = [];
// Overall average: (4+3+4+3+3+2+4+3)/8 = 26/8 = 3.25 → displayed as 3.3

const MATURITY_LABELS = ["", "Initial", "Repeatable", "Defined", "Managed", "Optimizing"];
const MATURITY_COLORS: Record<number, string> = { 1: "#DC2626", 2: "#D97706", 3: "#EAB308", 4: "#059669", 5: "#065F46" };

// Radar / spider chart SVG
function RadarChart({ domains }: { domains: typeof maturityDomains }) {
  const n = domains.length;
  const cx = 160, cy = 155, r = 110;
  const MAX = 5;
  const angles = domains.map((_, i) => (i / n) * 2 * Math.PI - Math.PI / 2);
  const toXY = (val: number, idx: number) => {
    const a = angles[idx]!;
    return [cx + (val / MAX) * r * Math.cos(a), cy + (val / MAX) * r * Math.sin(a)] as [number, number];
  };
  // Grid rings
  const rings = [1,2,3,4,5];
  // Current scores polygon
  const scorePts = domains.map((d, i) => toXY(d.score, i));
  const prevPts  = domains.map((d, i) => toXY(d.prev, i));
  const polyPath = (pts: [number,number][]) => pts.map(([x,y],i) => `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
  return (
    <svg viewBox="0 0 320 310" style={{ width: "100%", maxWidth: 340 }}>
      {/* Grid rings */}
      {rings.map(ring => {
        const pts = angles.map(a => [cx + (ring/MAX)*r*Math.cos(a), cy + (ring/MAX)*r*Math.sin(a)] as [number,number]);
        return <polygon key={ring} points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      {/* Grid spokes */}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={(cx + r*Math.cos(a)).toFixed(1)} y2={(cy + r*Math.sin(a)).toFixed(1)} stroke="var(--border)" strokeWidth="1" />
      ))}
      {/* Previous scores (faded) */}
      <path d={polyPath(prevPts)} fill="rgba(255,255,255,0.1)" fillOpacity="0.3" stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="4 3" />
      {/* Current scores */}
      <path d={polyPath(scorePts)} fill="#1E3A5F" fillOpacity="0.15" stroke="#1E3A5F" strokeWidth="2" />
      {/* Score dots */}
      {scorePts.map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={MATURITY_COLORS[domains[i]!.score]!} stroke="white" strokeWidth="1.5" />
      ))}
      {/* Labels */}
      {domains.map((d, i) => {
        const a = angles[i]!;
        const lx = cx + (r + 24) * Math.cos(a);
        const ly = cy + (r + 24) * Math.sin(a);
        return (
          <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
            fontSize="8.5" fill="var(--foreground)" fontWeight="600">
            {d.domain.length > 12 ? d.domain.slice(0, 12) + "…" : d.domain}
          </text>
        );
      })}
      {/* Ring labels */}
      {rings.map(ring => (
        <text key={ring} x={cx + 4} y={(cy - (ring/MAX)*r + 3).toFixed(1)} fontSize="8" fill="var(--muted-foreground)">{ring}</text>
      ))}
    </svg>
  );
}

// ── NEW: Audit phase Gantt helper ─────────────────────────────────────────────
const auditPhases = [
  { name: "ISO 27001 Surveillance", phases: [100,100,65,0,0], status: "fieldwork",  color: "rgb(147,197,253)" },
  { name: "SOC 2 Type II",          phases: [100,100,100,40,0], status: "reporting", color: "#065F46" },
  { name: "PCI DSS v4.0 SAQ",       phases: [100,100,100,100,100], status: "completed",  color: "#059669" },
];
const PHASE_LABELS = ["Initiation","Planning","Fieldwork","Reporting","Closure"];

// ── Audit framework & workflow constants ──────────────────────────────────────
const AUDIT_FRAMEWORKS = [
  { id:"iso27001", name:"ISO 27001",    flag:"🌐", color:"#3B82F6", types:["ISMS Internal Audit","Supplier Security Audit","Stage 1 Readiness","Stage 2 Readiness","Surveillance Audit","Recertification Audit"] },
  { id:"soc2",     name:"SOC 2",        flag:"🇺🇸", color:"#8B5CF6", types:["Type 1 Readiness","Type 2 Readiness","Bridge Letter Support","Annual SOC 2 Audit"] },
  { id:"rbi",      name:"RBI CSF",      flag:"🇮🇳", color:"#F59E0B", types:["IT Governance Audit","Cybersecurity Audit","IT Outsourcing Audit","Digital Payment Security","DR/BCP Audit"] },
  { id:"sebi",     name:"SEBI CSCRF",   flag:"🇮🇳", color:"#10B981", types:["CSCRF Readiness Audit","Cyber Audit","Cyber Resilience Audit","VAPT Audit","SOC Monitoring Audit"] },
  { id:"pcidss",   name:"PCI DSS v4.0", flag:"🌐", color:"#EF4444", types:["ROC Assessment","SAQ Completion","ASV Scan Review","Penetration Test Review"] },
  { id:"nistcsf",  name:"NIST CSF 2.0", flag:"🇺🇸", color:"#0EA5E9", types:["Current Profile Assessment","Target Profile Gap","Maturity Scorecard","Roadmap Review"] },
  { id:"gdpr",     name:"GDPR / DPDPA", flag:"🇪🇺", color:"#A78BFA", types:["Privacy Audit","DSAR Process Audit","Data Flow Audit","Breach Response Audit","Processor Audit"] },
  { id:"iso42001", name:"ISO 42001",    flag:"🌐", color:"#EC4899", types:["AI Governance Audit","AI Risk Assessment","AI Model Audit","ISO 42001 Readiness"] },
];

const WORKFLOW_STAGES = [
  { n:1,  label:"Framework & Audit Type",         icon:"📋", output:"Audit charter" },
  { n:2,  label:"Scope Definition",               icon:"🎯", output:"Scope document" },
  { n:3,  label:"Audit Plan",                     icon:"🗓", output:"Audit plan" },
  { n:4,  label:"Control Mapping",                icon:"🗺", output:"Control matrix" },
  { n:5,  label:"Owner Assignment (RACI)",        icon:"👥", output:"RACI matrix" },
  { n:6,  label:"Pre-Audit Questionnaire",        icon:"📝", output:"Readiness score" },
  { n:7,  label:"Document Collection",            icon:"📁", output:"Document pack" },
  { n:8,  label:"Technical Evidence",             icon:"🔍", output:"Evidence pack" },
  { n:9,  label:"Control Walkthrough",            icon:"🚶", output:"Walkthrough notes" },
  { n:10, label:"Design Effectiveness Test",      icon:"⚙️", output:"Design test results" },
  { n:11, label:"Operating Effectiveness Test",   icon:"✅", output:"Operating test results" },
  { n:12, label:"Observation Recording",          icon:"📊", output:"Observation log" },
  { n:13, label:"Finding Rating",                 icon:"⚠️", output:"Finding register" },
  { n:14, label:"CAPA Creation",                  icon:"🔧", output:"CAPA register" },
  { n:15, label:"Remediation Validation",         icon:"🔒", output:"Closure evidence" },
  { n:16, label:"Management Review",              icon:"👔", output:"Management review MoM" },
  { n:17, label:"Audit Report Generation",        icon:"📄", output:"Final audit report" },
  { n:18, label:"Certification Readiness",        icon:"🏆", output:"Audit / cert pack" },
  { n:19, label:"Continuous Monitoring",          icon:"📡", output:"Compliance dashboard" },
];

const AUDIT_FW_GUIDANCE: Record<string,string[]> = {
  iso27001:["Confirm ISMS scope & context of organisation","Review risk register and Statement of Applicability (SOA)","Test Annex A controls (Organisational, People, Physical, Technological)","Check competence records & security awareness training","Review incident register, internal audit report & CAPA register","Prepare Stage 1 / Stage 2 evidence pack & certification readiness score"],
  soc2:    ["Define system boundary and system description","Select applicable TSC criteria (Security, Availability, PI, Confidentiality, Privacy)","Map controls to tools — Jira, GitHub, IAM, HRMS, SIEM","Collect Type 1 (design) or Type 2 (operating effectiveness) evidence","Sample tickets, logs, access reviews, change records, vendor reviews","Prepare management assertion and SOC 2 audit pack"],
  rbi:     ["Review board-approved IT strategy and IT Steering Committee minutes","Verify CISO charter, org structure and security governance","Review cyber risk register and IT outsourcing / vendor controls","Check SOC/SIEM reports, incident register and regulator reporting evidence","Review BCP/DR test results, RTO/RPO evidence and IS audit findings","Prepare RBI CSITE thematic review submission and board dashboard"],
  sebi:    ["Classify SEBI regulated entity type (MII / QRE / MRE / SRE)","Review cybersecurity committee charter and board reporting evidence","Verify critical asset inventory and protection controls (MFA, PAM, EDR, DLP, WAF)","Check SIEM/SOC detection and threat intelligence capability","Review cyber drill, tabletop exercise and DR test evidence","Prepare SEBI CSCRF compliance pack with VAPT and cyber audit report"],
  pcidss:  ["Define cardholder data environment (CDE) scope and data flow diagram","Review network segmentation and firewall rule set","Verify card data storage restrictions and encryption configuration","Review ASV vulnerability scan results and penetration test report","Check logging, access control and security testing evidence","Prepare ROC / SAQ evidence pack for QSA submission"],
  nistcsf: ["Assess Govern — policies, risk governance, roles and oversight","Assess Identify — assets, risks, vendors and business context","Assess Protect — access control, awareness training, data security","Assess Detect — SIEM, monitoring and anomaly detection capability","Assess Respond & Recover — IR plan, communication, DR and restoration","Produce current profile, target profile, gap report, maturity score and roadmap"],
  gdpr:    ["Map personal data processing and create data inventory / RoPA","Review data flow diagrams and consent / legal basis register","Verify DSAR process (response time ≤ 30 days) and breach notification procedure","Review processor DPAs, vendor due diligence and adequacy decisions","Conduct DPIA for high-risk AI or large-scale processing activities","Generate privacy compliance audit report and board dashboard"],
  iso42001:["Define AI management system scope and build AI inventory / use-case register","Classify AI risk and conduct AI Impact Assessment (AIIA)","Review AI governance policies and data governance / training data controls","Test model monitoring evidence — drift, bias, hallucination logs","Verify human oversight records, approval workflows and AI vendor risk assessments","Prepare ISO 42001 Stage 1 / Stage 2 certification readiness pack"],
};

const FW_CATEGORIES = ["All","Security","Privacy","Financial","Healthcare","Government","Cloud","AppSec","AI/Emerging","Operational"] as const;
const FW_REGIONS = [
  "All","Global","USA","EU","UK",
  "India","Saudi Arabia","UAE","Bahrain","Kuwait","Qatar","Oman",
  "Kenya","South Africa","Nigeria",
  "Singapore","Australia","Japan","Hong Kong","New Zealand","China",
  "Canada","Germany","France","Netherlands","Switzerland","Spain",
  "Brazil","Israel",
  "APAC","GCC",
] as const;

const REGION_FLAGS: Record<string,string> = {
  "Global":"🌐","USA":"🇺🇸","EU":"🇪🇺","UK":"🇬🇧","Australia":"🇦🇺",
  "India":"🇮🇳","Saudi Arabia":"🇸🇦","UAE":"🇦🇪","Bahrain":"🇧🇭",
  "Kuwait":"🇰🇼","Qatar":"🇶🇦","Oman":"🇴🇲","Kenya":"🇰🇪",
  "South Africa":"🇿🇦","Nigeria":"🇳🇬","Singapore":"🇸🇬","Canada":"🇨🇦",
  "Germany":"🇩🇪","Brazil":"🇧🇷","China":"🇨🇳","Japan":"🇯🇵",
  "Hong Kong":"🇭🇰","Israel":"🇮🇱","France":"🇫🇷","Netherlands":"🇳🇱",
  "New Zealand":"🇳🇿","Spain":"🇪🇸","Switzerland":"🇨🇭",
  "APAC":"🌏","GCC":"🌙",
};
const APAC_SET = new Set(["Singapore","Japan","Australia","Hong Kong","New Zealand","China","India"]);
const GCC_SET  = new Set(["Saudi Arabia","UAE","Bahrain","Kuwait","Qatar","Oman"]);

const FW_DETAIL_META: Record<string, any> = {
  "ISO 27001": {
    icon:"🛡", fullName:"ISO/IEC 27001:2022", subtitle:"Information Security Management System (ISMS)",
    certBody:"Accredited Certification Bodies (BSI, DNV, SGS, Bureau Veritas)", policies:15, sops:10, registers:10, weeks:16,
    certPath:[
      { n:1, label:"Readiness Assessment", time:"1–2 weeks" },
      { n:2, label:"Stage 1 — Documentation Review", time:"1–2 days" },
      { n:3, label:"Stage 2 — On-Site Certification Audit", time:"2–5 days" },
      { n:4, label:"Certificate Issuance", time:"2–4 weeks post-audit" },
      { n:5, label:"Surveillance Audits", time:"1–2 days annually" },
      { n:6, label:"Recertification (Year 3)", time:"2–3 days" },
    ],
    auditTypes:[
      { name:"Stage 1 Audit", desc:"Documentation and readiness review of ISMS scope, policies, risk register, and Statement of Applicability." },
      { name:"Stage 2 Certification Audit", desc:"On-site audit assessing implementation and operating effectiveness of all 93 Annex A controls." },
      { name:"Surveillance Audit (Year 1 & 2)", desc:"Annual check confirming continued ISMS effectiveness and corrective action closure." },
      { name:"Recertification Audit (Year 3)", desc:"Full re-assessment renewing the ISO 27001 certificate for a further 3-year cycle." },
    ],
    coreRegisters:["Asset Register","Risk Register","Incident Register","Vendor Register","Exception Register","Audit Findings Register","CAPA Register","Change Register","Training Register","Access Review Log"],
    policies:["Information Security Policy","Access Control Policy","Cryptography Policy","Physical Security Policy","BYOD & Remote Working Policy","Supplier Security Policy","Incident Management Policy","Business Continuity Policy","Human Resources Security Policy","Acceptable Use Policy","Data Classification Policy","Change Management Policy","Vulnerability Management Policy","Logging & Monitoring Policy","Risk Management Policy"],
    implSteps:[
      { phase:"Phase 1 — Foundation (Weeks 1–4)", items:["Define ISMS scope and boundaries","Appoint CISO / ISMS Manager","Conduct stakeholder interviews","Establish ISMS governance structure","Perform gap assessment vs ISO 27001:2022"] },
      { phase:"Phase 2 — Risk (Weeks 5–8)", items:["Build asset register (all asset classes)","Conduct information security risk assessment","Create risk treatment plan","Draft Statement of Applicability (SOA)","Define risk acceptance criteria and appetite"] },
      { phase:"Phase 3 — Controls (Weeks 9–12)", items:["Implement priority Annex A controls","Deploy technical controls (IAM, MFA, SIEM, DLP)","Establish supplier assessment process","Implement physical security measures","Deploy logging and monitoring infrastructure"] },
      { phase:"Phase 4 — Operations (Weeks 13–16)", items:["Launch security awareness training programme","Conduct internal audit of the ISMS","Hold management review meeting","Complete evidence collection for all in-scope controls","Submit Stage 1 & Stage 2 audit pack to CB"] },
    ],
  },
  "SOC 2": {
    icon:"🔐", fullName:"SOC 2 (AICPA Trust Services)", subtitle:"Trust Services Criteria — Security, Availability, Confidentiality, Processing Integrity, Privacy",
    certBody:"AICPA-licensed CPA Firms (Deloitte, EY, KPMG, Grant Thornton, RSM)", policies:12, sops:8, registers:7, weeks:24,
    certPath:[
      { n:1, label:"Readiness Assessment", time:"2–4 weeks" },
      { n:2, label:"Type 1 — Design Effectiveness", time:"Point-in-time" },
      { n:3, label:"Type 2 Observation Period", time:"6–12 months" },
      { n:4, label:"Type 2 Audit Fieldwork", time:"3–5 days" },
      { n:5, label:"Report Issuance", time:"4–6 weeks post-audit" },
      { n:6, label:"Annual Renewal", time:"Annually" },
    ],
    auditTypes:[
      { name:"SOC 2 Type 1", desc:"Point-in-time assessment of control design confirming controls are suitably designed to meet Trust Services Criteria." },
      { name:"SOC 2 Type 2", desc:"6–12 month observation period assessing design and operating effectiveness of all in-scope controls." },
      { name:"Bridge Letter", desc:"Covers the gap period between the Type 2 report date and the current date for relying parties and customers." },
      { name:"Annual SOC 2 Type 2 Renewal", desc:"Full Type 2 audit repeated annually to maintain continuous compliance certification." },
    ],
    coreRegisters:["Access Review Log","Change Management Register","Incident Register","Vendor Register","Risk Register","Availability SLA Log","Backup & Recovery Log"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–4)", items:["Define system boundary and system description","Select Trust Services Criteria (CC + optional)","Identify all in-scope systems, teams, and tools","Map controls to CC criteria","Conduct SOC 2 readiness assessment"] },
      { phase:"Phase 2 — Controls (Weeks 5–12)", items:["Implement CC6 Logical and Physical Access controls","Deploy CC7 System Operations controls","Establish CC8 Change Management process","Configure CC9 Risk Mitigation controls","Implement availability and confidentiality controls"] },
      { phase:"Phase 3 — Evidence (Weeks 13–20)", items:["Collect evidence for all CC controls","Conduct quarterly access reviews","Document vendor risk assessments","Run tabletop incident response exercise","Prepare system description and management assertion"] },
      { phase:"Phase 4 — Audit (Weeks 21–24)", items:["Engage AICPA-licensed CPA firm","Provide Type 1 or Type 2 evidence pack","Respond to auditor requests and walkthroughs","Review and approve draft SOC 2 report","Distribute report to customers under NDA"] },
    ],
  },
  "GDPR": {
    icon:"🇪🇺", fullName:"General Data Protection Regulation (GDPR) 2016/679", subtitle:"EU Personal Data Protection and Privacy Regulation",
    certBody:"National Data Protection Authorities (ICO, CNIL, BfDI, DPC, AEPD)", policies:10, sops:7, registers:8, weeks:20,
    certPath:[
      { n:1, label:"Data Mapping & Inventory", time:"2–4 weeks" },
      { n:2, label:"Gap Assessment", time:"1–2 weeks" },
      { n:3, label:"Policy & Notice Implementation", time:"3–6 weeks" },
      { n:4, label:"Technical Controls", time:"4–8 weeks" },
      { n:5, label:"DPA Agreements & Vendor Review", time:"2–4 weeks" },
      { n:6, label:"Ongoing Monitoring & DSAR Process", time:"Continuous" },
    ],
    auditTypes:[
      { name:"GDPR Privacy Audit", desc:"Full audit of personal data processing activities, legal bases, consent mechanisms, and data subject rights procedures." },
      { name:"Data Flow Audit", desc:"Review of all data flows including cross-border transfers, adequacy decisions, and processor agreements." },
      { name:"DPIA Review", desc:"Data Protection Impact Assessment for high-risk processing activities involving sensitive or large-scale data." },
      { name:"Breach Readiness Audit", desc:"Assessment of incident detection, 72-hour notification procedures, and breach response capability." },
    ],
    coreRegisters:["Record of Processing Activities (RoPA)","Data Subject Request Log","Breach Register","Consent Register","DPA Register","DPIA Register","Data Inventory","Legitimate Interest Assessment Log"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–4)", items:["Build personal data inventory across all systems","Map data flows (collection → storage → transfer → deletion)","Identify legal bases for all processing activities","Document data categories and sensitive data","Conduct GDPR gap assessment"] },
      { phase:"Phase 2 — Governance (Weeks 5–10)", items:["Appoint / confirm Data Protection Officer (DPO) role","Update privacy notices and cookie policies","Implement consent management platform","Create Record of Processing Activities (RoPA)","Establish DSAR handling process (30-day SLA)"] },
      { phase:"Phase 3 — Controls (Weeks 11–16)", items:["Implement data minimisation and retention controls","Deploy pseudonymisation and encryption","Conduct Data Protection Impact Assessments (DPIAs)","Review and update processor DPAs","Implement cross-border transfer mechanisms (SCCs, BCRs)"] },
      { phase:"Phase 4 — Operations (Weeks 17–20)", items:["Launch data protection training programme","Test breach notification procedure (72-hour window)","Establish ongoing monitoring and annual review","Submit DPO registration where required","Prepare regulator inquiry response playbook"] },
    ],
  },
  "HIPAA": {
    icon:"🏥", fullName:"Health Insurance Portability and Accountability Act (HIPAA)", subtitle:"US Healthcare Data Privacy and Security Requirements",
    certBody:"HHS Office for Civil Rights (OCR) — Self-assessed with external auditor support", policies:9, sops:6, registers:6, weeks:18,
    certPath:[
      { n:1, label:"PHI Scoping & Risk Analysis", time:"2–4 weeks" },
      { n:2, label:"Privacy Rule Implementation", time:"4–6 weeks" },
      { n:3, label:"Security Rule Implementation", time:"6–10 weeks" },
      { n:4, label:"Breach Notification Procedures", time:"2–3 weeks" },
      { n:5, label:"BAA Agreements", time:"2–4 weeks" },
      { n:6, label:"Annual Risk Assessment", time:"Annually" },
    ],
    auditTypes:[
      { name:"HIPAA Security Risk Analysis", desc:"Annual risk assessment of all ePHI systems identifying threats, vulnerabilities, and required safeguards." },
      { name:"Privacy Rule Compliance Audit", desc:"Review of patient rights, minimum necessary standard, Notice of Privacy Practices, and workforce training." },
      { name:"Security Rule Technical Audit", desc:"Technical assessment of access controls, audit controls, integrity controls, and transmission security." },
      { name:"BAA Compliance Review", desc:"Review of Business Associate Agreements and third-party PHI handling and breach notification obligations." },
    ],
    coreRegisters:["PHI Inventory","Risk Analysis Register","Incident & Breach Register","BAA Register","Training Log","Workforce Sanction Policy Log","Access Control Log"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–3)", items:["Identify all PHI and ePHI across systems","Define covered entity and business associate roles","Conduct Security Risk Analysis (SRA)","Map all PHI data flows","Identify workforce members with PHI access"] },
      { phase:"Phase 2 — Privacy (Weeks 4–8)", items:["Implement Notice of Privacy Practices","Establish patient rights procedures (access, amendment, accounting)","Deploy minimum necessary access controls","Create HIPAA workforce training programme","Draft and execute Business Associate Agreements"] },
      { phase:"Phase 3 — Security (Weeks 9–14)", items:["Implement Administrative Safeguards (workforce training, contingency plan)","Deploy Physical Safeguards (facility access, device controls)","Implement Technical Safeguards (unique user ID, automatic logoff, encryption)","Configure audit controls and integrity controls","Establish breach detection and notification workflow"] },
      { phase:"Phase 4 — Ongoing (Weeks 15–18)", items:["Test breach notification procedures (60-day window)","Conduct annual HIPAA risk assessment","Review and update all BAAs","Run tabletop incident response exercise","Document all sanctions and corrective action"] },
    ],
  },
  "PCI DSS 4.0": {
    icon:"💳", fullName:"PCI DSS v4.0", subtitle:"Payment Card Industry Data Security Standard",
    certBody:"PCI Security Standards Council — Qualified Security Assessors (QSA)", policies:11, sops:8, registers:7, weeks:20,
    certPath:[
      { n:1, label:"CDE Scoping", time:"1–2 weeks" },
      { n:2, label:"Gap Assessment", time:"1–2 weeks" },
      { n:3, label:"Remediation", time:"8–16 weeks" },
      { n:4, label:"ASV Vulnerability Scan", time:"Quarterly" },
      { n:5, label:"ROC / SAQ Assessment", time:"2–5 days" },
      { n:6, label:"Annual Revalidation", time:"Annually" },
    ],
    auditTypes:[
      { name:"Report on Compliance (ROC)", desc:"Full on-site QSA assessment for Level 1 merchants processing >6M transactions annually, covering all 12 requirements." },
      { name:"Self-Assessment Questionnaire (SAQ)", desc:"Self-assessment for lower-volume merchants using the applicable SAQ type (A, B, C, D) based on cardholder data environment." },
      { name:"ASV Vulnerability Scan", desc:"Quarterly external network scan by an Approved Scanning Vendor to identify internet-facing vulnerabilities in the CDE." },
      { name:"Penetration Test", desc:"Annual internal and external penetration test of the cardholder data environment and segmentation controls." },
    ],
    coreRegisters:["CDE Asset Inventory","Vulnerability Scan Log","Penetration Test Register","Change Management Log","Firewall Rule Review Log","Access Control Register","Incident Register"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–3)", items:["Define cardholder data environment (CDE) boundaries","Create data flow diagrams for all card data","Validate network segmentation and firewall rules","Identify all in-scope system components","Engage QSA for scoping validation"] },
      { phase:"Phase 2 — Controls (Weeks 4–12)", items:["Implement Requirements 1–4 (Network, Config, CHD Protection, Encryption)","Deploy Requirements 5–8 (Vulnerability Mgmt, Access Control, Auth)","Implement Requirements 9–12 (Physical, Logging, Testing, Policies)","Configure SIEM for CDE logging","Establish quarterly vulnerability management process"] },
      { phase:"Phase 3 — Testing (Weeks 13–17)", items:["Conduct ASV external vulnerability scan","Perform internal vulnerability scan","Execute penetration test (internal + external + segmentation)","Validate all remediated findings","Prepare evidence pack for QSA"] },
      { phase:"Phase 4 — Assessment (Weeks 18–20)", items:["Submit SAQ or engage QSA for ROC","Complete QSA walkthroughs and evidence review","Remediate any QSA findings","Receive and review Report on Compliance","Submit Attestation of Compliance (AOC) to acquiring bank"] },
    ],
  },
  "NIST CSF": {
    icon:"🏛", fullName:"NIST Cybersecurity Framework 2.0", subtitle:"Voluntary Framework for Managing Cybersecurity Risk Across Six Core Functions",
    certBody:"NIST (Self-assessed) — Third-party assessors for formal maturity attestation", policies:13, sops:9, registers:8, weeks:20,
    certPath:[
      { n:1, label:"Current Profile Assessment", time:"2–3 weeks" },
      { n:2, label:"Target Profile Definition", time:"1–2 weeks" },
      { n:3, label:"Gap Analysis", time:"1 week" },
      { n:4, label:"Roadmap Implementation", time:"12–24 weeks" },
      { n:5, label:"Maturity Attestation", time:"1–2 weeks" },
      { n:6, label:"Continuous Improvement", time:"Ongoing" },
    ],
    auditTypes:[
      { name:"Current Profile Assessment", desc:"Evaluate current cybersecurity posture across Govern, Identify, Protect, Detect, Respond, and Recover functions." },
      { name:"Target Profile Gap Analysis", desc:"Define desired maturity level and identify gaps between current and target cybersecurity outcomes." },
      { name:"Maturity Scorecard Review", desc:"Formal scoring against NIST CSF tiers (Partial → Risk-Informed → Repeatable → Adaptive)." },
      { name:"Roadmap Progress Review", desc:"Quarterly review of improvement roadmap execution and Key Risk Indicator trends." },
    ],
    coreRegisters:["Asset Inventory","Risk Register","Threat Intelligence Log","Incident Register","Vulnerability Register","Change Management Log","Supplier Risk Register","Continuity Plan Register"],
    implSteps:[
      { phase:"Phase 1 — Govern & Identify (Weeks 1–4)", items:["Establish cybersecurity governance structure and policy","Define organisational risk tolerance and appetite","Build comprehensive asset inventory (HW, SW, data, services)","Conduct threat and vulnerability assessment","Identify regulatory and contractual cybersecurity obligations"] },
      { phase:"Phase 2 — Protect (Weeks 5–10)", items:["Implement identity and access management controls","Deploy awareness and training programme","Establish data security controls (classification, DLP, encryption)","Configure platform security (hardening, patch management)","Deploy infrastructure protection (network segmentation, FW)"] },
      { phase:"Phase 3 — Detect (Weeks 11–14)", items:["Deploy SIEM and security monitoring platform","Implement anomaly and event detection capabilities","Establish threat intelligence integration","Configure continuous vulnerability scanning","Define detection metrics and alert thresholds"] },
      { phase:"Phase 4 — Respond & Recover (Weeks 15–20)", items:["Develop and test incident response plan","Establish crisis communication procedures","Implement business continuity and DR capabilities","Define recovery time and point objectives","Conduct tabletop exercise and lessons-learned review"] },
    ],
  },
  "NIS2": {
    icon:"🇪🇺", fullName:"NIS2 Directive (EU) 2022/2555", subtitle:"Network and Information Security for EU Essential and Important Entities",
    certBody:"National Competent Authorities (NCAs) per EU Member State", policies:10, sops:7, registers:6, weeks:16,
    certPath:[
      { n:1, label:"Entity Classification", time:"1 week" },
      { n:2, label:"Risk Management Implementation", time:"4–8 weeks" },
      { n:3, label:"Incident Reporting Procedures", time:"2–3 weeks" },
      { n:4, label:"Supply Chain Security", time:"3–6 weeks" },
      { n:5, label:"NCA Registration", time:"Varies by state" },
      { n:6, label:"Annual Compliance Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"NIS2 Risk Management Audit", desc:"Assessment of 10 minimum security measures including access control, encryption, MFA, and incident handling." },
      { name:"Incident Reporting Readiness", desc:"Review of early warning (24h), incident notification (72h), and final report (1 month) procedures." },
      { name:"Supply Chain Security Audit", desc:"Assessment of vendor risk management, SBOM processes, and third-party security requirements." },
      { name:"NCA Supervisory Review", desc:"Formal review by national competent authority including on-site inspections and ad-hoc audits." },
    ],
    coreRegisters:["Risk Register","Incident Register","Supply Chain Risk Register","Asset Register","Vulnerability Register","Business Continuity Register"],
    implSteps:[
      { phase:"Phase 1 — Classification & Governance (Weeks 1–3)", items:["Classify entity as Essential or Important","Identify applicable NCA and national transposition law","Map NIS2 obligations to existing controls","Appoint cybersecurity responsible person (senior management)","Establish NIS2 governance and oversight structure"] },
      { phase:"Phase 2 — Security Measures (Weeks 4–10)", items:["Implement all 10 NIS2 minimum security measures","Deploy MFA and privileged access management","Establish supply chain security requirements and vetting","Implement encryption for data in transit and at rest","Configure SIEM and anomaly detection capabilities"] },
      { phase:"Phase 3 — Incident Procedures (Weeks 11–13)", items:["Establish 24-hour early warning procedure","Implement 72-hour incident notification workflow","Create 1-month final incident report template","Define significant incident thresholds and classification","Test breach notification procedure end-to-end"] },
      { phase:"Phase 4 — Registration & Monitoring (Weeks 14–16)", items:["Register with NCA via national portal","Submit required entity information and contact details","Establish continuous monitoring and KRI programme","Conduct annual risk assessment and management review","Prepare for NCA supervisory inspection"] },
    ],
  },
  "CIS Controls": {
    icon:"🔒", fullName:"CIS Critical Security Controls v18", subtitle:"Prioritised Set of 18 Control Families and 153 Safeguards",
    certBody:"Center for Internet Security (CIS) — CSAT Self-Assessment Tool", policies:8, sops:6, registers:5, weeks:14,
    certPath:[
      { n:1, label:"IG1 Essential Controls (56)", time:"4–8 weeks" },
      { n:2, label:"IG2 Foundational Controls (+74)", time:"8–14 weeks" },
      { n:3, label:"IG3 Organizational Controls (+23)", time:"12–24 weeks" },
      { n:4, label:"CIS CSAT Self-Assessment", time:"2–3 weeks" },
      { n:5, label:"Gap Remediation", time:"Ongoing" },
      { n:6, label:"Annual Reassessment", time:"Annually" },
    ],
    auditTypes:[
      { name:"CIS CSAT Assessment", desc:"CIS Controls Self-Assessment Tool evaluation across all 18 control families and 153 safeguards with scoring." },
      { name:"IG1 Baseline Audit", desc:"Verify implementation of 56 essential safeguards applicable to every organisation regardless of size." },
      { name:"IG2 Foundational Audit", desc:"Assess 74 additional safeguards for organisations with dedicated IT staff and moderate risk exposure." },
      { name:"CIS Benchmark Compliance", desc:"Technical benchmark audit for specific platforms (AWS, Azure, Windows, Linux, Kubernetes, macOS)." },
    ],
    coreRegisters:["Asset Inventory (HW & SW)","Vulnerability Register","Incident Register","Configuration Baseline Register","Account Management Log"],
    implSteps:[
      { phase:"Phase 1 — IG1 Basics (Weeks 1–4)", items:["CIS Control 1: Enterprise Asset Inventory","CIS Control 2: Software Asset Inventory","CIS Control 3: Data Protection (classification & DLP)","CIS Control 4: Secure Configuration","CIS Control 5: Account Management"] },
      { phase:"Phase 2 — IG1 Advanced (Weeks 5–8)", items:["CIS Control 6: Access Control Management","CIS Control 7: Continuous Vulnerability Management","CIS Control 8: Audit Log Management","CIS Control 9: Email and Web Browser Protections","CIS Control 10: Malware Defenses"] },
      { phase:"Phase 3 — IG2 Controls (Weeks 9–12)", items:["CIS Control 11: Data Recovery","CIS Control 12: Network Infrastructure Management","CIS Control 13: Network Monitoring and Defence","CIS Control 14: Security Awareness and Skills Training","CIS Control 15: Service Provider Management"] },
      { phase:"Phase 4 — IG3 & Validation (Weeks 13–14)", items:["CIS Control 16: Application Software Security","CIS Control 17: Incident Response Management","CIS Control 18: Penetration Testing","Complete CSAT self-assessment and score","Develop remediation roadmap for gaps"] },
    ],
  },
  "ISO 22301": {
    icon:"🔄", fullName:"ISO 22301:2019", subtitle:"Business Continuity Management System (BCMS)",
    certBody:"Accredited Certification Bodies (BSI, SGS, DNV, Bureau Veritas)", policies:8, sops:7, registers:7, weeks:16,
    certPath:[
      { n:1, label:"Business Impact Analysis", time:"2–4 weeks" },
      { n:2, label:"Risk Assessment", time:"1–2 weeks" },
      { n:3, label:"BC Strategy & Plans", time:"4–6 weeks" },
      { n:4, label:"Stage 1 Documentation Audit", time:"1–2 days" },
      { n:5, label:"Stage 2 Certification Audit", time:"2–4 days" },
      { n:6, label:"Surveillance & Recertification", time:"Annually / Year 3" },
    ],
    auditTypes:[
      { name:"Stage 1 Audit", desc:"Review of BCMS documentation, BIA, risk assessment, BC strategies, recovery objectives, and scope." },
      { name:"Stage 2 Certification Audit", desc:"Verification of BCMS implementation effectiveness through BC tests, exercises, and evidence review." },
      { name:"BC Exercise / Tabletop", desc:"Scenario-based exercise testing the BC plan, crisis management team response, and communication tree." },
      { name:"Surveillance Audit", desc:"Annual check on continued BCMS effectiveness, corrective action closure, and improvement initiatives." },
    ],
    coreRegisters:["Business Impact Analysis Register","Risk Register","BC Plan Register","Crisis Communication Log","DR Test Register","CAPA Register","Supplier BC Register"],
    implSteps:[
      { phase:"Phase 1 — Analysis (Weeks 1–4)", items:["Define BCMS scope, policy, and objectives","Conduct Business Impact Analysis (BIA)","Identify Maximum Tolerable Period of Disruption (MTPD)","Set Recovery Time Objectives (RTO) and RPOs","Conduct BC risk assessment and treatment"] },
      { phase:"Phase 2 — Strategy (Weeks 5–8)", items:["Define BC strategies for critical functions","Develop Business Continuity Plans (BCPs)","Establish Crisis Management and Communication Plan","Define Disaster Recovery procedures for IT systems","Document dependencies and alternate resources"] },
      { phase:"Phase 3 — Implementation (Weeks 9–12)", items:["Deploy DR infrastructure (failover, backup, replication)","Integrate BC plans into operational procedures","Conduct first BC exercise (tabletop or simulation)","Review lessons learned and update plans","Establish ongoing testing and exercise schedule"] },
      { phase:"Phase 4 — Certification (Weeks 13–16)", items:["Conduct internal BCMS audit","Hold management review meeting","Submit certification application to CB","Stage 1 documentation audit preparation","Stage 2 certification audit — evidence and walkthrough"] },
    ],
  },
  "DORA": {
    icon:"🏦", fullName:"Digital Operational Resilience Act (EU) 2022/2554", subtitle:"ICT Risk, Incident Reporting and Third-Party Risk for Financial Entities",
    certBody:"EBA, ESMA, EIOPA and national financial regulators per EU Member State", policies:10, sops:7, registers:8, weeks:20,
    certPath:[
      { n:1, label:"ICT Risk Framework Setup", time:"4–8 weeks" },
      { n:2, label:"Incident Classification & Reporting", time:"2–4 weeks" },
      { n:3, label:"Digital Resilience Testing", time:"4–8 weeks" },
      { n:4, label:"Third-Party ICT Risk Management", time:"4–6 weeks" },
      { n:5, label:"Information Sharing", time:"2–3 weeks" },
      { n:6, label:"Regulator Submission & Review", time:"Ongoing" },
    ],
    auditTypes:[
      { name:"ICT Risk Management Audit", desc:"Assessment of the ICT risk framework — identification, protection, detection, response, and recovery capabilities." },
      { name:"DORA Incident Reporting Review", desc:"Verification of incident classification thresholds, initial notification, intermediate, and final reporting procedures." },
      { name:"TLPT (Threat-Led Penetration Test)", desc:"Advanced red team exercise required for significant financial entities testing resilience of critical live systems." },
      { name:"Third-Party ICT Risk Assessment", desc:"Review of contractual arrangements, concentration risk, and exit strategy for critical ICT third-party providers." },
    ],
    coreRegisters:["ICT Asset Register","ICT Risk Register","Incident Register","TLPT Register","Third-Party ICT Register","Concentration Risk Register","BC & DR Register","Change Management Log"],
    implSteps:[
      { phase:"Phase 1 — ICT Risk Framework (Weeks 1–5)", items:["Classify entity type and applicable DORA obligations","Establish ICT risk management framework","Build ICT asset inventory and dependency map","Define ICT risk tolerance and appetite","Integrate ICT risk into enterprise risk management"] },
      { phase:"Phase 2 — Incident Management (Weeks 6–9)", items:["Define major incident classification thresholds","Implement 24-hour early warning procedure","Establish 72-hour incident notification workflow","Create 1-month final report template and process","Test incident reporting end-to-end with regulator sandbox"] },
      { phase:"Phase 3 — Resilience Testing (Weeks 10–15)", items:["Develop ICT Business Continuity Policy and DR plan","Conduct annual DR test and tabletop exercise","Plan TLPT engagement if applicable (significant entities)","Implement vulnerability assessment programme","Establish ICT change risk assessment process"] },
      { phase:"Phase 4 — Third-Party Risk (Weeks 16–20)", items:["Register all critical ICT third-party providers","Review contracts for DORA mandatory clauses","Assess concentration risk and sub-outsourcing chains","Develop ICT provider exit strategy","Submit Register of Information to regulator (Jan 2025)"] },
    ],
  },
  "SAMA CSF": {
    icon:"🇸🇦", fullName:"SAMA Cyber Security Framework v1.0", subtitle:"Mandatory Cyber Security Framework for Saudi Financial Sector",
    certBody:"Saudi Central Bank (SAMA) — Annual Self-Assessment Submission", policies:11, sops:7, registers:7, weeks:20,
    certPath:[
      { n:1, label:"Governance & Strategy", time:"2–4 weeks" },
      { n:2, label:"Risk Management", time:"3–6 weeks" },
      { n:3, label:"Compliance & Audit", time:"2–3 weeks" },
      { n:4, label:"Operations & Technology", time:"8–12 weeks" },
      { n:5, label:"Third-Party Management", time:"3–5 weeks" },
      { n:6, label:"SAMA Annual Submission", time:"Annually (Oct)" },
    ],
    auditTypes:[
      { name:"SAMA Cyber Maturity Assessment", desc:"Annual self-assessment across 5 domains and 58 sub-domains, scored 1–5 maturity levels." },
      { name:"SAMA Supervisory Review", desc:"Regulator-led review of submitted cyber security assessment, supporting evidence, and action plans." },
      { name:"Cyber Resilience Audit", desc:"Assessment of incident response capability, BCP/DR effectiveness, and cyber resilience testing results." },
      { name:"Third-Party Risk Review", desc:"Evaluation of vendor cyber security requirements, contract clauses, and ongoing monitoring programmes." },
    ],
    coreRegisters:["Asset Register","Risk Register","Incident Register","Vendor Risk Register","Change Management Log","Audit Findings Register","Cyber KRI Dashboard"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Establish Cyber Security Governance Committee","Define cyber security strategy aligned with SAMA requirements","Appoint Chief Information Security Officer (CISO)","Develop Cyber Security Policy Framework","Map obligations to SAMA CSF 5 domains"] },
      { phase:"Phase 2 — Risk Management (Weeks 5–9)", items:["Conduct cyber risk identification and assessment","Build cyber risk register with quantified ratings","Define risk appetite and treatment options","Implement risk treatment plans and controls","Establish quarterly risk review cadence"] },
      { phase:"Phase 3 — Operations (Weeks 10–16)", items:["Deploy technical controls (IAM, PAM, SIEM, EDR, DLP)","Implement vulnerability management programme","Establish 24/7 SOC monitoring capability","Deploy insider threat detection programme","Implement secure software development lifecycle"] },
      { phase:"Phase 4 — Third-Party & Submission (Weeks 17–20)", items:["Assess all critical vendors against SAMA requirements","Review outsourcing contracts for cybersecurity clauses","Conduct cloud and fintech provider risk assessments","Complete SAMA annual self-assessment questionnaire","Submit evidence pack to SAMA by October deadline"] },
    ],
  },
  "SWIFT CSCF": {
    icon:"🏦", fullName:"SWIFT Customer Security Controls Framework v2024", subtitle:"Security Controls for SWIFT Network Participants",
    certBody:"SWIFT — Verified by SWIFT-Qualified Independent Assessors", policies:8, sops:6, registers:6, weeks:12,
    certPath:[
      { n:1, label:"Architecture Classification (A1/A2/A3/B)", time:"1 week" },
      { n:2, label:"Mandatory Controls (25)", time:"6–10 weeks" },
      { n:3, label:"Advisory Controls (7)", time:"4–8 weeks" },
      { n:4, label:"Independent Assessment", time:"1–2 weeks" },
      { n:5, label:"KYC-SA Portal Submission", time:"By Dec 31" },
      { n:6, label:"Annual Re-attestation", time:"Annually" },
    ],
    auditTypes:[
      { name:"SWIFT Independent Assessment", desc:"Annual verification of CSCF compliance by a SWIFT-qualified assessor covering all mandatory controls for the architecture type." },
      { name:"Mandatory Control Audit", desc:"Assessment of 25 mandatory controls covering secure zone, credential management, and anomaly detection." },
      { name:"Advisory Control Review", desc:"Voluntary assessment of 7 advisory controls for enhanced protection of the SWIFT messaging environment." },
      { name:"KYC-SA Portal Attestation", desc:"Verification of attestation accuracy and completeness submitted to the SWIFT KYC Security Attestation portal by 31 December." },
    ],
    coreRegisters:["SWIFT Asset Register","Credential Management Log","Anomaly Detection Log","Change Management Register","Software Integrity Log","Assessor Findings Register"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–2)", items:["Determine SWIFT architecture type (A1, A2, A3, or B)","Map SWIFT-related components and data flows","Identify mandatory and advisory control applicability","Engage SWIFT-qualified assessor","Review prior KYC-SA attestation findings"] },
      { phase:"Phase 2 — Mandatory Controls (Weeks 3–7)", items:["Implement secure zone around SWIFT infrastructure","Restrict internet access from SWIFT environment","Enforce MFA for all SWIFT operator accounts","Deploy file integrity monitoring on SWIFT systems","Implement anomaly detection and transaction monitoring"] },
      { phase:"Phase 3 — Advisory Controls (Weeks 8–10)", items:["Assess applicability of all 7 advisory controls","Deploy enhanced security features where applicable","Conduct staff security awareness training on SWIFT threats","Review and update SWIFT incident response playbook","Perform internal SWIFT security assessment"] },
      { phase:"Phase 4 — Attestation (Weeks 11–12)", items:["Engage SWIFT-qualified independent assessor","Provide evidence pack for all mandatory controls","Remediate any assessor findings","Complete and submit KYC-SA portal attestation by 31 December","Plan for next annual CSCF version upgrade"] },
    ],
  },
  "CMMC 2.0": {
    icon:"🇺🇸", fullName:"CMMC 2.0 — Cybersecurity Maturity Model Certification", subtitle:"DoD Cybersecurity Requirements for the Defense Industrial Base",
    certBody:"CMMC Third-Party Assessment Organizations (C3PAOs) accredited by Cyber AB", policies:10, sops:8, registers:7, weeks:24,
    certPath:[
      { n:1, label:"CUI Scoping & Data Flow", time:"2–3 weeks" },
      { n:2, label:"NIST SP 800-171 Assessment", time:"3–4 weeks" },
      { n:3, label:"POA&M Remediation", time:"8–16 weeks" },
      { n:4, label:"C3PAO Assessment (Level 2)", time:"2–4 weeks" },
      { n:5, label:"CMMC Certification", time:"4–8 weeks post-audit" },
      { n:6, label:"Triennial Reassessment", time:"Every 3 years" },
    ],
    auditTypes:[
      { name:"CMMC Level 1 Annual Affirmation", desc:"Self-assessment of 17 basic safeguards with annual senior official affirmation submitted to SPRS." },
      { name:"CMMC Level 2 C3PAO Assessment", desc:"Independent assessment by a Cyber AB-accredited C3PAO of all 110 NIST SP 800-171 practices." },
      { name:"CMMC Level 3 DIBCAC Assessment", desc:"DoD DIBCAC-led assessment for Level 3 organisations with additional NIST SP 800-172 enhanced practices." },
      { name:"SPRS Score Submission", desc:"Verification of the Supplier Performance Risk System score and supporting System Security Plan documentation." },
    ],
    coreRegisters:["CUI Asset Register","System Security Plan (SSP)","POA&M Register","Incident Register","Access Control Log","Configuration Management Register","Vulnerability Register"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–4)", items:["Identify all CUI and FCI data and system boundaries","Create data flow diagrams for all CUI flows","Define assessment scope and system components","Conduct NIST SP 800-171 self-assessment (SPRS score)","Develop System Security Plan (SSP) and POA&M"] },
      { phase:"Phase 2 — Remediation (Weeks 5–16)", items:["Implement Domain 1–3: Access Control, Awareness, Audit","Implement Domain 4–6: Config Mgmt, ID & Auth, Incident Response","Implement Domain 7–9: Maintenance, Media, Personnel","Implement Domain 10–14: Risk, Assess, Protect, SI, Recovery","Close all Critical and High POA&M items"] },
      { phase:"Phase 3 — Assessment Prep (Weeks 17–20)", items:["Engage accredited C3PAO assessor","Complete OSA (Objective Score Assessment) preparation","Conduct internal mock assessment walkthrough","Finalise evidence pack for all 110 practices","Submit SPRS score update with current evidence"] },
      { phase:"Phase 4 — Certification (Weeks 21–24)", items:["C3PAO on-site or remote assessment","Respond to assessor findings and requests","Submit POA&M for any remaining practices","Receive CMMC Level 2 certification decision","Plan triennial reassessment schedule"] },
    ],
  },
  "EU AI Act": {
    icon:"🤖", fullName:"EU Artificial Intelligence Act (EU) 2024/1689", subtitle:"Risk-Based Regulatory Framework for AI Systems in the European Union",
    certBody:"National Market Surveillance Authorities + EU AI Office (for GPAI)", policies:8, sops:5, registers:7, weeks:24,
    certPath:[
      { n:1, label:"AI System Inventory & Classification", time:"2–4 weeks" },
      { n:2, label:"Risk Category Assessment", time:"1–2 weeks" },
      { n:3, label:"Conformity Assessment (High-Risk)", time:"6–12 weeks" },
      { n:4, label:"Technical Documentation", time:"4–8 weeks" },
      { n:5, label:"EU Declaration of Conformity", time:"1–2 weeks" },
      { n:6, label:"Post-Market Monitoring", time:"Ongoing" },
    ],
    auditTypes:[
      { name:"AI Risk Classification Audit", desc:"Assessment of AI system risk categories (Unacceptable, High-Risk, Limited, Minimal) and applicable EU AI Act obligations." },
      { name:"Conformity Assessment (High-Risk)", desc:"Formal assessment of Annex III high-risk AI systems including technical documentation, transparency, and human oversight." },
      { name:"GPAI Model Audit", desc:"Assessment of General-Purpose AI models for systemic risk thresholds, capability evaluations, and transparency obligations." },
      { name:"Post-Market Monitoring Review", desc:"Review of ongoing monitoring systems for high-risk AI — incident reporting, corrective action, and serious incident handling." },
    ],
    coreRegisters:["AI System Register","Risk Assessment Register","Training Data Documentation","Incident & Serious Incident Register","Human Oversight Log","GPAI Model Register","Conformity Declaration Register"],
    implSteps:[
      { phase:"Phase 1 — Inventory (Weeks 1–4)", items:["Build comprehensive AI system inventory across the organisation","Classify each AI system by risk category (Unacceptable/High/Limited/Minimal)","Identify Annex III high-risk use cases","Map AI systems to applicable obligations and timelines","Assess GPAI model thresholds and transparency requirements"] },
      { phase:"Phase 2 — Governance (Weeks 5–10)", items:["Establish AI governance framework and oversight structure","Appoint AI risk and compliance roles","Develop AI policies (acceptable use, ethics, transparency)","Implement AI Impact Assessment (AIIA) methodology","Create AI incident reporting and escalation procedures"] },
      { phase:"Phase 3 — Controls (Weeks 11–18)", items:["Implement data governance for AI training datasets","Deploy model monitoring for drift, bias, and accuracy","Establish human oversight mechanisms for high-risk AI","Create technical documentation for all high-risk AI systems","Implement transparency and explainability measures"] },
      { phase:"Phase 4 — Compliance (Weeks 19–24)", items:["Complete conformity assessment for high-risk AI systems","Draft EU Declaration of Conformity documents","Register high-risk AI in EU AI database","Establish post-market monitoring framework","Prepare for market surveillance authority inspection"] },
    ],
  },
  "ISO 42001": {
    icon:"🤖", fullName:"ISO/IEC 42001:2023", subtitle:"Artificial Intelligence Management System (AIMS)",
    certBody:"Accredited Certification Bodies", policies:8, sops:5, registers:6, weeks:20,
    certPath:[
      { n:1, label:"AI Inventory & Use-Case Register", time:"2–3 weeks" },
      { n:2, label:"AI Risk & Impact Assessment", time:"2–4 weeks" },
      { n:3, label:"AIMS Policy Framework", time:"3–5 weeks" },
      { n:4, label:"Data Governance Controls", time:"3–6 weeks" },
      { n:5, label:"Stage 1 Documentation Audit", time:"1–2 days" },
      { n:6, label:"Stage 2 Certification Audit", time:"2–3 days" },
    ],
    auditTypes:[
      { name:"Stage 1 Audit", desc:"Review of AIMS scope, AI system inventory, risk assessment methodology, and policy documentation completeness." },
      { name:"Stage 2 Certification Audit", desc:"Assessment of AIMS implementation including model monitoring, bias testing, and human oversight controls." },
      { name:"AI Impact Assessment Review", desc:"Deep-dive review of AI Impact Assessments (AIIA) for all high-risk AI applications in scope." },
      { name:"Surveillance Audit", desc:"Annual verification of continued AIMS effectiveness, AI governance improvements, and new AI system additions." },
    ],
    coreRegisters:["AI System Register","AI Risk Register","Training Data Register","Model Performance Log","AI Incident Register","Human Oversight Record"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–4)", items:["Define AIMS scope and AI governance objectives","Build AI system inventory and use-case register","Conduct AI risk and impact assessment (AIIA) for each system","Map data sources, training pipelines, and model outputs","Identify AI-related legal and regulatory obligations"] },
      { phase:"Phase 2 — Governance (Weeks 5–9)", items:["Establish AI ethics and governance policy framework","Define AI roles and responsibilities (AI Officer, risk owners)","Implement AI lifecycle management procedures","Create data governance controls for training data quality","Establish AI model approval and deployment gates"] },
      { phase:"Phase 3 — Controls (Weeks 10–16)", items:["Deploy model monitoring for drift, bias, and performance","Implement human oversight controls for high-risk AI","Configure explainability and transparency mechanisms","Establish AI incident detection and response procedures","Conduct supplier AI risk assessments for third-party models"] },
      { phase:"Phase 4 — Certification (Weeks 17–20)", items:["Conduct internal AIMS audit","Hold management review for AI governance","Submit certification application to accredited CB","Stage 1 documentation review preparation","Stage 2 on-site certification audit"] },
    ],
  },
  "FedRAMP": {
    icon:"🏛", fullName:"FedRAMP — Federal Risk and Authorization Management Program", subtitle:"US Federal Cloud Security Authorization (NIST SP 800-53)",
    certBody:"FedRAMP Program Management Office (PMO) and Third-Party Assessment Organizations (3PAOs)", policies:15, sops:12, registers:10, weeks:36,
    certPath:[
      { n:1, label:"Readiness Assessment (RAR)", time:"4–8 weeks" },
      { n:2, label:"System Security Plan (SSP)", time:"8–16 weeks" },
      { n:3, label:"3PAO Security Assessment", time:"4–8 weeks" },
      { n:4, label:"Agency Authorization (ATO)", time:"4–12 weeks" },
      { n:5, label:"Continuous Monitoring (ConMon)", time:"Monthly" },
      { n:6, label:"Annual Assessment", time:"Annually" },
    ],
    auditTypes:[
      { name:"FedRAMP Readiness Assessment", desc:"3PAO assessment confirming the cloud system meets baseline FedRAMP security capabilities before full authorization." },
      { name:"Security Assessment Report (SAR)", desc:"Comprehensive 3PAO testing report covering all NIST SP 800-53 controls for the applicable impact level (Low/Moderate/High)." },
      { name:"Annual Assessment", desc:"Yearly 3PAO reassessment covering a rotating subset of controls and all high-risk changes made during the year." },
      { name:"ConMon Monthly Deliverables", desc:"Monthly continuous monitoring deliverables: vulnerability scans, POA&M updates, inventory changes, and incident reports." },
    ],
    coreRegisters:["System Security Plan (SSP)","POA&M Register","Asset Inventory","Vulnerability Scan Log","Incident Register","Change Management Log","Configuration Baseline","Audit Log Repository","Access Control Register","Continuous Monitoring Dashboard"],
    implSteps:[
      { phase:"Phase 1 — Preparation (Weeks 1–8)", items:["Define cloud system boundary and impact level (Low/Moderate/High)","Select and engage accredited 3PAO","Complete FedRAMP Readiness Assessment Report (RAR)","Identify agency sponsor or pursue Marketplace listing","Begin System Security Plan (SSP) documentation"] },
      { phase:"Phase 2 — SSP Development (Weeks 9–20)", items:["Document all system components and data flows","Implement all applicable NIST SP 800-53 controls","Complete SSP with control implementation statements","Develop POA&M for all open findings","Conduct pre-assessment internal testing"] },
      { phase:"Phase 3 — 3PAO Assessment (Weeks 21–28)", items:["3PAO conducts security assessment (SAR)","Respond to 3PAO findings and provide evidence","Remediate critical and high vulnerabilities","Review and finalise Security Assessment Report","Submit authorization package to agency or JAB"] },
      { phase:"Phase 4 — Authorization & ConMon (Weeks 29–36)", items:["Obtain Agency ATO or JAB Provisional ATO","List in FedRAMP Marketplace","Submit monthly ConMon deliverables","Conduct annual 3PAO reassessment","Manage ongoing POA&M and vulnerability remediation"] },
    ],
  },
  "ISO 31000": {
    icon:"⚖️", fullName:"ISO 31000:2018", subtitle:"Risk Management — Principles, Framework and Guidelines",
    certBody:"No formal certification — Reference standard for enterprise risk management", policies:7, sops:5, registers:5, weeks:12,
    certPath:[
      { n:1, label:"Risk Governance & Context", time:"1–2 weeks" },
      { n:2, label:"Risk Identification", time:"2–3 weeks" },
      { n:3, label:"Risk Analysis & Evaluation", time:"2–3 weeks" },
      { n:4, label:"Risk Treatment", time:"4–8 weeks" },
      { n:5, label:"Monitoring & Review", time:"Ongoing" },
      { n:6, label:"Annual Risk Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"Risk Framework Assessment", desc:"Evaluation of the enterprise risk management framework against ISO 31000 principles, guidelines, and best practices." },
      { name:"Risk Register Audit", desc:"Review of risk identification completeness, rating methodology, treatment plan effectiveness, and residual risk levels." },
      { name:"Risk Appetite Review", desc:"Board-level review of risk appetite statements and tolerance thresholds across all key risk categories." },
      { name:"KRI Monitoring Review", desc:"Assessment of Key Risk Indicator tracking, escalation triggers, reporting cadence, and board dashboard quality." },
    ],
    coreRegisters:["Enterprise Risk Register","Risk Appetite Statement","Risk Treatment Plan","KRI Dashboard","Risk Committee Minutes"],
    implSteps:[
      { phase:"Phase 1 — Principles & Framework (Weeks 1–3)", items:["Obtain board mandate for risk management framework","Define risk management governance and accountability","Establish risk management policy and objectives","Integrate risk management into strategic planning","Define risk categories and taxonomy"] },
      { phase:"Phase 2 — Risk Assessment (Weeks 4–6)", items:["Conduct enterprise-wide risk identification workshops","Apply risk analysis methodology (likelihood × impact)","Evaluate risks against risk appetite and criteria","Prioritise risks requiring treatment","Build enterprise risk register with ownership"] },
      { phase:"Phase 3 — Treatment & Monitoring (Weeks 7–10)", items:["Develop risk treatment plans for priority risks","Define risk response options (avoid/reduce/share/accept)","Implement KRI monitoring and reporting dashboard","Establish risk escalation and committee reporting cadence","Conduct first quarterly risk committee review"] },
      { phase:"Phase 4 — Review & Improvement (Weeks 11–12)", items:["Conduct risk management effectiveness review","Update risk register based on environment changes","Present risk report to board and senior management","Identify improvements to risk framework","Plan annual risk assessment cycle"] },
    ],
  },
  "CSA CCM": {
    icon:"☁️", fullName:"CSA Cloud Controls Matrix v4.0", subtitle:"Cloud Security Alliance Security Controls for Cloud Services",
    certBody:"CSA STAR Program — Self-Assessment, Third-Party Certification, or Continuous Monitoring", policies:10, sops:7, registers:7, weeks:16,
    certPath:[
      { n:1, label:"Cloud Service Scoping", time:"1–2 weeks" },
      { n:2, label:"CCM Domain Assessment (17 domains)", time:"3–5 weeks" },
      { n:3, label:"CAIQ Self-Assessment", time:"2–3 weeks" },
      { n:4, label:"STAR Self-Assessment Submission", time:"1 week" },
      { n:5, label:"STAR Certification (optional)", time:"3PAO audit" },
      { n:6, label:"Annual Renewal", time:"Annually" },
    ],
    auditTypes:[
      { name:"CSA STAR Self-Assessment", desc:"Completion of the Consensus Assessments Initiative Questionnaire (CAIQ) mapped to all CCM v4 controls." },
      { name:"CSA STAR Certification", desc:"Third-party audit of CCM controls combined with ISO 27001 certification for cloud-native environments." },
      { name:"CCM Domain Audit", desc:"Assessment across all 17 CCM domains: A&A, BCR, CCC, CEK, DCS, DSP, GRC, HRS, IAM, IPY, LOG, SEF, STA, TVM, UEM." },
      { name:"STAR Continuous Monitoring", desc:"Real-time compliance monitoring using CSA's STAR+ programme with automated control evidence collection." },
    ],
    coreRegisters:["Cloud Asset Register","Shared Responsibility Matrix","Vendor Risk Register","Encryption Key Register","Incident Register","Vulnerability Register","Change Management Log"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–3)", items:["Define cloud service scope and deployment model (IaaS/PaaS/SaaS)","Map Shared Responsibility across provider and customer","Identify applicable CCM domains for the cloud model","Complete initial CAIQ gap assessment","Establish cloud governance and oversight structure"] },
      { phase:"Phase 2 — Controls (Weeks 4–10)", items:["Implement Audit & Assurance (A&A) controls","Deploy Cryptography & Encryption Key (CEK) management","Implement Data Security & Privacy (DSP) controls","Configure Identity & Access Management (IAM) controls","Establish Logging & Monitoring (LOG) capabilities"] },
      { phase:"Phase 3 — Assessment (Weeks 11–14)", items:["Complete full CAIQ questionnaire for all 17 domains","Document control implementation evidence","Identify and remediate gaps from CAIQ assessment","Prepare STAR Self-Assessment submission package","Engage 3PAO if STAR Certification is targeted"] },
      { phase:"Phase 4 — Submission & Maintenance (Weeks 15–16)", items:["Submit CAIQ to CSA STAR Registry","Publish STAR listing for customer transparency","Establish annual CAIQ update process","Plan STAR Certification if ISO 27001 is available","Monitor CCM version updates and control changes"] },
    ],
  },
  "CCPA": {
    icon:"🌴", fullName:"California Consumer Privacy Act / CPRA 2023", subtitle:"California Consumer Privacy and Data Rights Law",
    certBody:"California Privacy Protection Agency (CPPA) — Regulatory enforcement", policies:7, sops:5, registers:6, weeks:14,
    certPath:[
      { n:1, label:"Data Inventory & Mapping", time:"2–4 weeks" },
      { n:2, label:"Privacy Policy Update", time:"1–2 weeks" },
      { n:3, label:"Consumer Rights Procedures", time:"2–3 weeks" },
      { n:4, label:"Opt-Out Mechanisms", time:"2–4 weeks" },
      { n:5, label:"Service Provider Contracts", time:"2–4 weeks" },
      { n:6, label:"Annual Privacy Audit", time:"Annually" },
    ],
    auditTypes:[
      { name:"CCPA Privacy Audit", desc:"Assessment of CCPA/CPRA obligations including consumer rights, data minimisation, and service provider contracts." },
      { name:"Data Inventory Audit", desc:"Review of personal information categories collected, sources, business purposes, and third-party sharing disclosures." },
      { name:"Consumer Rights Readiness", desc:"Testing of opt-out, deletion, correction, and portability request handling within 45-day response window." },
      { name:"CPPA Enforcement Readiness", desc:"Preparation for CPPA audits including evidence of privacy-by-design and data minimisation practices." },
    ],
    coreRegisters:["Personal Information Inventory","Consumer Request Log","Opt-Out Register","Service Provider Agreement Register","Data Retention Schedule","Privacy Incident Log"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–3)", items:["Map all personal information collected by category","Identify sources, business purposes, and third-party sharing","Classify data by CCPA sensitive personal information categories","Document data retention periods by category","Conduct CCPA compliance gap assessment"] },
      { phase:"Phase 2 — Notices & Rights (Weeks 4–7)", items:["Update Privacy Policy with all required CCPA disclosures","Implement at-collection notices for all PI collection points","Create consumer rights request handling process (45-day SLA)","Deploy Opt-Out of Sale/Sharing mechanism ('Do Not Sell or Share')","Establish opt-out preference signals (GPC) support"] },
      { phase:"Phase 3 — Vendor & Contracts (Weeks 8–11)", items:["Audit all service provider and contractor agreements","Add CCPA-required contractual clauses to all SPs","Assess third-party selling and sharing arrangements","Implement data processing restrictions with all vendors","Create third-party disclosure inventory for privacy notice"] },
      { phase:"Phase 4 — Training & Monitoring (Weeks 12–14)", items:["Train all staff handling consumer requests","Test consumer rights workflows end-to-end","Establish annual CCPA compliance review process","Monitor CPPA regulatory guidance and enforcement actions","Prepare documentation for CPPA audit readiness"] },
    ],
  },
  "ISO 27701": {
    icon:"🔏", fullName:"ISO/IEC 27701:2019", subtitle:"Privacy Information Management System (PIMS) — Extension to ISO 27001/ISO 27002",
    certBody:"Accredited Certification Bodies (requires ISO 27001 base certification)", policies:9, sops:6, registers:7, weeks:18,
    certPath:[
      { n:1, label:"ISO 27001 Prerequisite", time:"Existing ISMS required" },
      { n:2, label:"PII Controller / Processor Scoping", time:"1–2 weeks" },
      { n:3, label:"Privacy Risk Assessment", time:"2–3 weeks" },
      { n:4, label:"PIMS Controls Implementation", time:"6–10 weeks" },
      { n:5, label:"Combined 27001/27701 Audit", time:"2–4 days" },
      { n:6, label:"Annual Surveillance", time:"Annually" },
    ],
    auditTypes:[
      { name:"Combined ISO 27001/27701 Audit", desc:"Joint audit of the ISMS and PIMS, covering both information security and privacy controls in one engagement." },
      { name:"PII Controller Audit", desc:"Assessment of controller obligations: lawful basis, consent, data subject rights, retention, and privacy notices." },
      { name:"PII Processor Audit", desc:"Assessment of processor obligations: controller instructions, sub-processor management, and DPA compliance." },
      { name:"Privacy Risk Assessment Review", desc:"Annual review of the privacy risk assessment, treatment options, and residual risk acceptance decisions." },
    ],
    coreRegisters:["PII Processing Register","Consent Register","Data Subject Request Log","Privacy Incident Register","DPA Register","Sub-processor Register","Privacy Risk Register"],
    implSteps:[
      { phase:"Phase 1 — Scoping (Weeks 1–3)", items:["Confirm ISO 27001 ISMS is in place and certified","Extend ISMS scope to include personal data processing","Classify organisation as PII Controller and/or Processor","Map all PII processing activities to PIMS scope","Identify applicable privacy legislation (GDPR, CCPA, PDPL)"] },
      { phase:"Phase 2 — Privacy Risk (Weeks 4–7)", items:["Conduct privacy-specific risk assessment","Identify privacy threats and controls from ISO 27701 Annex A/B","Update Statement of Applicability to include PIMS controls","Develop privacy risk treatment plan","Define privacy KPIs and measurement framework"] },
      { phase:"Phase 3 — Controls (Weeks 8–14)", items:["Implement Controller controls (Annex A clauses 6–8)","Implement Processor controls (Annex B clauses 6–8)","Establish PII data subject rights procedures","Deploy consent management and lawful basis documentation","Implement data minimisation, accuracy, and retention controls"] },
      { phase:"Phase 4 — Certification (Weeks 15–18)", items:["Conduct internal PIMS audit","Hold combined ISO 27001/27701 management review","Submit combined certification application to CB","Stage 1 documentation review (PIMS extension)","Stage 2 combined on-site certification audit"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // INDIA — 4 Frameworks
  // ═══════════════════════════════════════════════════════
  "RBI Cybersecurity Framework": {
    icon:"🇮🇳", fullName:"RBI Master Directions on IT Framework for Banks 2021", subtitle:"Reserve Bank of India — Cybersecurity Governance, SOC, Risk Management and Incident Reporting",
    certBody:"Reserve Bank of India (RBI) — compliance assessed by CERT-In empanelled auditors", policies:12, sops:8, registers:7, weeks:20,
    certPath:[
      { n:1, label:"Gap Assessment vs RBI CSF", time:"2–3 weeks" },
      { n:2, label:"Governance & SOC Setup", time:"4–6 weeks" },
      { n:3, label:"Technology Controls Implementation", time:"6–8 weeks" },
      { n:4, label:"CERT-In Empanelled Audit", time:"2–3 weeks" },
      { n:5, label:"RBI CSITE Reporting Setup", time:"1 week" },
      { n:6, label:"Annual RBI Compliance Submission", time:"Annually" },
    ],
    auditTypes:[
      { name:"RBI CERT-In Empanelled Audit", desc:"Annual cybersecurity audit by a CERT-In empanelled auditor covering all RBI CSF domains — governance, identification, protection, detection, response and recovery." },
      { name:"Vulnerability Assessment & Penetration Testing", desc:"Quarterly VAPT by a CERT-In empanelled organisation covering internet-facing and internal systems per RBI guidelines." },
      { name:"SOC Maturity Review", desc:"Assessment of the 24x7 Security Operations Centre capability, threat detection, SIEM coverage and escalation procedures." },
      { name:"Third-Party Risk Review", desc:"Annual assessment of IT vendors, cloud providers and outsourced services against RBI outsourcing and cyber risk guidelines." },
    ],
    coreRegisters:["Cyber Risk Register","Incident Register (6-hour reporting)","Change Management Log","VAPT Tracker","Vendor Risk Register","SOC Alert Register","Business Continuity Test Log"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Appoint CISO with direct board reporting line","Establish Board IT Strategy Committee","Draft Cybersecurity Policy per RBI CSF template","Define risk appetite and cyber risk tolerance","Map all critical systems and data flows"] },
      { phase:"Phase 2 — Technology Controls (Weeks 5–10)", items:["Deploy 24x7 Security Operations Centre (SOC)","Implement network segmentation and DMZ architecture","Deploy PAM for privileged accounts","Enable MFA for all critical banking applications","Establish VAPT programme (quarterly cadence)"] },
      { phase:"Phase 3 — Processes & Training (Weeks 11–16)", items:["Develop cyber incident response playbooks","Register with RBI CSITE (incident reporting)","Conduct phishing simulation and security awareness","Deploy DLP for critical customer data","Review and update BCP/DRP to include cyber scenarios"] },
      { phase:"Phase 4 — Audit & Reporting (Weeks 17–20)", items:["Engage CERT-In empanelled auditor for full assessment","Remediate findings within RBI-specified timelines","Submit Cyber Security Framework compliance report to RBI","Establish quarterly VAPT and annual audit calendar","Document continuous monitoring and metrics dashboard"] },
    ],
  },
  "SEBI CSCRF": {
    icon:"🇮🇳", fullName:"SEBI Cyber Security and Cyber Resilience Framework 2023", subtitle:"Securities and Exchange Board of India — Mandatory Cybersecurity for Market Infrastructure Institutions",
    certBody:"Securities and Exchange Board of India (SEBI) — annual audit by CERT-In empanelled organisation", policies:10, sops:7, registers:6, weeks:18,
    certPath:[
      { n:1, label:"Entity Classification (MII / RTA / DP)", time:"1 week" },
      { n:2, label:"Gap Assessment vs CSCRF", time:"2–3 weeks" },
      { n:3, label:"Controls Implementation", time:"8–10 weeks" },
      { n:4, label:"Annual Audit by CERT-In Auditor", time:"2–3 weeks" },
      { n:5, label:"SEBI Compliance Report Submission", time:"1 week" },
      { n:6, label:"Annual Cycle Renewal", time:"Annually" },
    ],
    auditTypes:[
      { name:"Annual SEBI CSCRF Audit", desc:"Mandatory annual audit by a CERT-In empanelled organisation covering all CSCRF controls for MIIs, RTAs, KRAs and Qualified RIAs." },
      { name:"Quarterly VAPT", desc:"Quarterly vulnerability assessment and penetration testing of trading platforms, investor portals and critical market infrastructure." },
      { name:"Cyber Crisis Management Assessment", desc:"Annual review of the Cyber Crisis Management Plan (CCMP) including tabletop exercises and recovery time objective validation." },
      { name:"Third-Party Technology Risk Review", desc:"Assessment of technology vendors, colocation providers and cloud service providers against SEBI outsourcing and cyber resilience requirements." },
    ],
    coreRegisters:["Cyber Incident Register","VAPT Findings Tracker","Access Control Register","Change Management Log","Vendor Risk Register","CCMP Test Log"],
    implSteps:[
      { phase:"Phase 1 — Classification & Gap (Weeks 1–3)", items:["Classify entity type: MII, RTA, KRA or Qualified RIA","Determine applicable CSCRF control tier","Conduct gap assessment against all CSCRF domains","Establish Cyber Security Committee at board level","Draft Cybersecurity Policy and Cyber Crisis Management Plan (CCMP)"] },
      { phase:"Phase 2 — Technology Controls (Weeks 4–10)", items:["Deploy SOC and 24x7 monitoring for trading systems","Implement SIEM with market operations use cases","Establish quarterly VAPT programme","Deploy MFA for all user and admin accounts","Implement DLP and data localisation controls for investor data"] },
      { phase:"Phase 3 — Resilience (Weeks 11–14)", items:["Test BCP/DRP with recovery time and recovery point objectives","Conduct tabletop cyber crisis exercise","Implement automated failover for critical trading systems","Establish SEBI 6-hour incident reporting workflow","Deploy endpoint detection and response (EDR) across all endpoints"] },
      { phase:"Phase 4 — Audit & Certification (Weeks 15–18)", items:["Engage CERT-In empanelled auditor for CSCRF assessment","Collate audit evidence and remediate critical findings","Submit CSCRF compliance report to SEBI","Establish annual audit calendar and continuous monitoring KPIs","Conduct management review and sign off compliance attestation"] },
    ],
  },
  "DPDP Act 2023": {
    icon:"🇮🇳", fullName:"Digital Personal Data Protection Act 2023 (India)", subtitle:"India's Federal Privacy Law — Consent, Data Principal Rights, Fiduciary Obligations and Breach Notification",
    certBody:"Data Protection Board of India (DPBI) — regulatory oversight and enforcement", policies:8, sops:5, registers:6, weeks:14,
    certPath:[
      { n:1, label:"Data Fiduciary Classification", time:"1–2 weeks" },
      { n:2, label:"Personal Data Mapping & Inventory", time:"2–3 weeks" },
      { n:3, label:"Consent & Notice Framework", time:"3–4 weeks" },
      { n:4, label:"Data Principal Rights Implementation", time:"3–4 weeks" },
      { n:5, label:"Breach Notification Workflow", time:"1 week" },
      { n:6, label:"Annual DPBI Compliance Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"Data Fiduciary Compliance Audit", desc:"Assessment of all Data Fiduciary obligations under DPDP Act — consent, notice, purpose limitation, data minimisation, accuracy and security safeguards." },
      { name:"Consent Framework Review", desc:"Technical and operational review of the consent management platform, Consent Manager registration and consent withdrawal workflows." },
      { name:"Data Principal Rights Assessment", desc:"Evaluation of procedures for access, correction, erasure and nomination requests — response timelines, escalation paths and grievance redressal." },
      { name:"Cross-Border Transfer Review", desc:"Assessment of cross-border data transfer controls for compliance with notified countries whitelist and processor agreements." },
    ],
    coreRegisters:["Personal Data Processing Register","Consent Register","Data Principal Request Log","Data Breach Register","Data Processor Agreement Register","Cross-Border Transfer Register"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–3)", items:["Classify organisation as Data Fiduciary and/or Significant Data Fiduciary","Map all personal data processing activities and legal bases","Inventory personal data across systems, clouds and third parties","Identify cross-border data transfers and receiving countries","Register with Consent Manager platform if applicable"] },
      { phase:"Phase 2 — Consent & Notice (Weeks 4–6)", items:["Draft DPDP-compliant privacy notices for all collection points","Implement consent management with granular purpose consent","Enable consent withdrawal without detriment to data principals","Establish procedures for deemed consent scenarios","Create Data Fiduciary obligations register"] },
      { phase:"Phase 3 — Rights & Security (Weeks 7–11)", items:["Implement data principal rights workflows (access, correct, erase, nominate)","Deploy security safeguards appropriate to processing risk","Establish data minimisation and storage limitation controls","Implement cross-border transfer controls for non-notified countries","Set up Data Protection Board grievance redressal mechanism"] },
      { phase:"Phase 4 — Breach & Maintenance (Weeks 12–14)", items:["Create breach detection and DPBI notification workflow","Test breach notification procedures (target: notification within 72 hours)","Conduct data protection awareness training for all staff","Establish annual compliance review and records update cycle","Document all processing activities for DPBI inspection readiness"] },
    ],
  },
  "CERT-In Directions": {
    icon:"🇮🇳", fullName:"CERT-In Directions on Information Security Practices 2022", subtitle:"Ministry of Electronics and IT — Mandatory Incident Reporting, Log Retention and Coordination",
    certBody:"Indian Computer Emergency Response Team (CERT-In) — regulatory body under MeitY", policies:6, sops:5, registers:5, weeks:10,
    certPath:[
      { n:1, label:"CERT-In Contact Registration", time:"1 week" },
      { n:2, label:"Log Retention Infrastructure Setup", time:"2–3 weeks" },
      { n:3, label:"Incident Reporting Workflow", time:"2 weeks" },
      { n:4, label:"VPN & Subscriber Records Compliance", time:"2 weeks" },
      { n:5, label:"Compliance Verification", time:"1–2 weeks" },
      { n:6, label:"Ongoing 6-hour Reporting Cycle", time:"Continuous" },
    ],
    auditTypes:[
      { name:"CERT-In Compliance Verification", desc:"Internal audit verifying compliance with all mandatory CERT-In Directions — incident reporting timelines, log retention periods, system clock synchronization and VPN records." },
      { name:"Incident Reporting Drill", desc:"Simulation exercise to verify the 6-hour incident reporting workflow to CERT-In, including correct categorisation of reportable incidents." },
      { name:"Log Retention Audit", desc:"Technical audit confirming 180-day log retention for all ICT systems, NTP synchronization to IST and integrity of log storage." },
      { name:"Cloud Provider Compliance Check", desc:"Assessment of cloud service providers and VPN operators for compliance with CERT-In Directions applicable to their services." },
    ],
    coreRegisters:["Cyber Incident Register (6-hour reporting)","ICT System Log Repository","Synchronized Clock Register","VPN Subscriber Records (5-year)","Cloud Provider Compliance Register"],
    implSteps:[
      { phase:"Phase 1 — Registration (Weeks 1–2)", items:["Register organisation's cybersecurity point of contact with CERT-In","Identify all reportable incident categories per CERT-In Directions","Map all ICT systems subject to log retention requirements","Audit current log retention periods and storage locations","Identify all VPN services operated for subscribers"] },
      { phase:"Phase 2 — Infrastructure (Weeks 3–5)", items:["Configure centralised log management for 180-day retention","Deploy NTP servers synchronized to Indian Standard Time (IST)","Implement log integrity controls (write-once storage, hash chaining)","Enable log forwarding from all ICT systems to centralised SIEM","Set up VPN subscriber records with 5-year retention"] },
      { phase:"Phase 3 — Incident Workflow (Weeks 6–8)", items:["Define incident categorization framework per CERT-In Directions","Build 6-hour reporting workflow with escalation to CISO","Integrate CERT-In reporting portal credentials into SOC","Develop incident response playbooks for each reportable category","Train SOC and IR team on CERT-In reporting obligations"] },
      { phase:"Phase 4 — Testing & Compliance (Weeks 9–10)", items:["Run incident reporting drill (simulate Category 1 incident)","Verify all log sources are being retained with correct timestamps","Audit VPN subscriber records for completeness","Review cloud service provider compliance with CERT-In Directions","Document compliance status for internal GRC records"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // KSA — 3 Frameworks
  // ═══════════════════════════════════════════════════════
  "NCA ECC": {
    icon:"🇸🇦", fullName:"NCA Essential Cybersecurity Controls (ECC-1:2018)", subtitle:"National Cybersecurity Authority — Baseline Controls for Saudi Government and Private Sector Entities",
    certBody:"National Cybersecurity Authority (NCA) — compliance assessed by NCA-accredited evaluators", policies:11, sops:7, registers:7, weeks:22,
    certPath:[
      { n:1, label:"NCA ECC Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"Governance Framework Setup", time:"3–4 weeks" },
      { n:3, label:"Technical Controls Implementation", time:"8–10 weeks" },
      { n:4, label:"NCA Accredited Assessment", time:"2–3 weeks" },
      { n:5, label:"NCA Compliance Report Submission", time:"1 week" },
      { n:6, label:"Annual NCA Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"NCA ECC Compliance Assessment", desc:"Annual assessment by an NCA-accredited evaluator covering all 4 ECC domains: Cybersecurity Governance, Risk, Compliance; Cybersecurity Defense; Cybersecurity Resilience; and Third-Party/Cloud Security." },
      { name:"Vulnerability Assessment", desc:"Quarterly VAPT of all internet-facing and internal systems by an NCA-approved testing organisation." },
      { name:"Security Awareness Assessment", desc:"Annual evaluation of the cybersecurity awareness programme effectiveness, including phishing simulations and knowledge testing." },
      { name:"Third-Party Security Review", desc:"Annual assessment of technology vendors and cloud providers against NCA ECC third-party security requirements." },
    ],
    coreRegisters:["Cybersecurity Risk Register","Asset Register","Incident Register","Access Management Register","Change Management Log","Vendor Risk Register","Awareness Training Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Establish Cybersecurity Governance Structure per NCA ECC 1.x","Appoint CISO with board-level reporting","Draft Cybersecurity Strategy, Policy and Procedures","Define cyber risk appetite and risk management framework","Establish cybersecurity compliance function"] },
      { phase:"Phase 2 — Identity & Network (Weeks 5–10)", items:["Implement Identity and Access Management framework","Deploy Privileged Access Management (PAM) solution","Establish network segmentation and perimeter security","Deploy Intrusion Detection/Prevention Systems (IDS/IPS)","Implement endpoint protection and EDR across all devices"] },
      { phase:"Phase 3 — Data & Resilience (Weeks 11–16)", items:["Implement data classification and protection scheme","Deploy encryption for data at rest and in transit","Establish Cyber Threat Intelligence capability","Build Cybersecurity Operations Centre (or managed SOC)","Develop and test BCP with cyber scenarios"] },
      { phase:"Phase 4 — Audit & Certification (Weeks 17–22)", items:["Conduct internal NCA ECC readiness assessment","Engage NCA-accredited evaluator for official assessment","Remediate findings per NCA priority classification","Submit ECC compliance report to relevant Saudi authority","Establish annual compliance and continuous monitoring programme"] },
    ],
  },
  "NCA CCC": {
    icon:"🇸🇦", fullName:"NCA Cloud Cybersecurity Controls (CCC-1:2020)", subtitle:"National Cybersecurity Authority — Cloud Security Governance, Data Sovereignty and Access Controls",
    certBody:"National Cybersecurity Authority (NCA) — cloud service provider and consumer compliance", policies:8, sops:5, registers:5, weeks:16,
    certPath:[
      { n:1, label:"Cloud Inventory & Classification", time:"1–2 weeks" },
      { n:2, label:"Cloud Governance Framework", time:"2–3 weeks" },
      { n:3, label:"Data Sovereignty Controls", time:"4–6 weeks" },
      { n:4, label:"Identity & Network Controls", time:"4–5 weeks" },
      { n:5, label:"NCA CCC Assessment", time:"1–2 weeks" },
      { n:6, label:"Annual Cloud Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"NCA CCC Compliance Assessment", desc:"Annual assessment covering all 7 CCC domains: Cloud Governance, Data Protection, Identity Management, Network Security, Incident Response, Business Continuity and Vulnerability Management." },
      { name:"Data Sovereignty Audit", desc:"Technical assessment of data residency and sovereignty controls — verifying that data classified as sensitive remains within Saudi Arabia or approved jurisdictions." },
      { name:"Cloud Provider Due Diligence", desc:"Annual assessment of cloud service providers for NCA ECC and CCC compliance, including contractual obligations and right-to-audit clauses." },
      { name:"Cloud Penetration Test", desc:"Annual penetration test of cloud-hosted systems, APIs and cloud management plane access controls." },
    ],
    coreRegisters:["Cloud Asset Register","Data Sovereignty Register","Cloud Provider Compliance Register","Cloud Incident Register","Cloud Access Management Register"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–3)", items:["Inventory all cloud services (IaaS, PaaS, SaaS) in use","Classify data processed in each cloud environment","Identify cloud service providers and their NCA compliance status","Map data flows to determine sovereignty requirements","Assess current cloud governance and policy gaps"] },
      { phase:"Phase 2 — Governance & Data (Weeks 4–8)", items:["Establish Cloud Governance Policy and Cloud Security Standard","Implement data classification and labelling in cloud environments","Enforce data sovereignty — ensure regulated data in KSA-based regions","Deploy encryption at rest and in transit for all cloud workloads","Establish cloud access management with MFA and PAM"] },
      { phase:"Phase 3 — Network & Operations (Weeks 9–13)", items:["Implement virtual network segmentation (VPCs, subnets, NSGs)","Configure cloud-native firewalls and web application firewall (WAF)","Deploy cloud security posture management (CSPM) tooling","Establish cloud incident response playbooks","Enable cloud vulnerability scanning (containers, VMs, serverless)"] },
      { phase:"Phase 4 — Assessment (Weeks 14–16)", items:["Conduct internal NCA CCC readiness check","Engage NCA-accredited evaluator for CCC compliance assessment","Remediate critical data sovereignty and access control findings","Submit cloud compliance evidence to NCA authority","Establish quarterly cloud security posture review cadence"] },
    ],
  },
  "PDPL Saudi Arabia": {
    icon:"🇸🇦", fullName:"Saudi Arabia Personal Data Protection Law (PDPL) 2021", subtitle:"National Data Management Office — Consent, Data Subject Rights, Cross-Border Transfers and Enforcement",
    certBody:"National Data Management Office (NDMO) — regulatory authority and enforcement", policies:7, sops:5, registers:6, weeks:14,
    certPath:[
      { n:1, label:"Personal Data Inventory", time:"2–3 weeks" },
      { n:2, label:"Consent & Notice Framework", time:"2–3 weeks" },
      { n:3, label:"Data Subject Rights Setup", time:"3–4 weeks" },
      { n:4, label:"Cross-Border Transfer Controls", time:"2 weeks" },
      { n:5, label:"Data Protection Officer Appointment", time:"1 week" },
      { n:6, label:"Annual NDMO Compliance Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"PDPL Controller Compliance Audit", desc:"Annual audit of all Data Controller obligations — consent, lawful basis, privacy notices, data minimisation, accuracy, retention and security safeguards." },
      { name:"Data Subject Rights Assessment", desc:"Evaluation of the organisation's procedures for handling data subject requests — access, rectification, erasure and objection — against NDMO-specified timelines." },
      { name:"Cross-Border Transfer Review", desc:"Assessment of international data transfer safeguards — approved recipient countries, adequacy decisions and contractual protections." },
      { name:"Data Breach Readiness Assessment", desc:"Tabletop exercise validating the 72-hour breach notification workflow to NDMO and affected data subjects." },
    ],
    coreRegisters:["Personal Data Register","Consent Register","Data Subject Request Log","Data Breach Register","Data Processor Agreement Register","Cross-Border Transfer Register"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–3)", items:["Map all personal data processing activities and categories","Identify legal bases for each processing activity","Classify sensitive personal data (health, biometric, financial)","Inventory all data processors and third-party sharing","Assess current privacy notices and consent mechanisms"] },
      { phase:"Phase 2 — Consent & Rights (Weeks 4–7)", items:["Draft NDMO-compliant privacy notices and consent forms","Implement granular consent management with withdrawal capability","Establish data subject rights request intake and response procedures","Create Data Processing Records (Article 13 PDPL requirement)","Appoint Data Protection Officer (where required)"] },
      { phase:"Phase 3 — Security & Transfers (Weeks 8–11)", items:["Implement security safeguards proportionate to processing risk","Apply encryption for sensitive personal data at rest and transit","Establish cross-border transfer controls and approved country list","Draft Data Processing Agreements with all processors","Implement data retention schedules and secure deletion procedures"] },
      { phase:"Phase 4 — Breach & Compliance (Weeks 12–14)", items:["Build NDMO breach notification workflow (72-hour target)","Conduct privacy awareness training for all staff","Register with NDMO data controller registry (where mandated)","Conduct internal PDPL compliance audit","Establish annual compliance review and NDMO inspection readiness"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // BAHRAIN — 2 Frameworks
  // ═══════════════════════════════════════════════════════
  "CBB Cybersecurity": {
    icon:"🇧🇭", fullName:"Central Bank of Bahrain Cybersecurity Framework (Module TM-2)", subtitle:"CBB Volume 4 — Cybersecurity Governance, Technology Controls and Outsourcing for CBB Licensees",
    certBody:"Central Bank of Bahrain (CBB) — supervisory review and external audit requirement", policies:9, sops:6, registers:6, weeks:18,
    certPath:[
      { n:1, label:"CBB TM-2 Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"Governance & Risk Framework", time:"3–4 weeks" },
      { n:3, label:"Technology Controls Implementation", time:"7–9 weeks" },
      { n:4, label:"External Cybersecurity Audit", time:"2–3 weeks" },
      { n:5, label:"CBB Compliance Attestation", time:"1 week" },
      { n:6, label:"Annual CBB Supervisory Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"CBB Cybersecurity Module Audit", desc:"Annual external audit covering all CBB TM-2 cybersecurity domains — governance, ICT risk, access control, network security, incident management and outsourcing." },
      { name:"Penetration Testing", desc:"Annual penetration test of internet-facing systems, banking applications and internal network by a CBB-recognised testing firm." },
      { name:"Third-Party Risk Assessment", desc:"Annual assessment of outsourced service providers and technology vendors against CBB Module FC (Outsourcing) and TM-2 requirements." },
      { name:"Business Continuity Test", desc:"Annual BCP/DRP tabletop exercise and recovery test including cyber attack and ICT failure scenarios." },
    ],
    coreRegisters:["ICT Risk Register","Cyber Incident Register","Access Control Register","Outsourcing Risk Register","Change Management Log","BCP Test Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Establish CBB-aligned Cybersecurity Governance Framework","Appoint CISO with direct board reporting line","Define risk appetite statement per CBB requirements","Draft Cybersecurity Policy, ICT Risk Policy and Acceptable Use Policy","Establish Board IT Risk Committee"] },
      { phase:"Phase 2 — Access & Network (Weeks 5–10)", items:["Deploy PAM for all privileged accounts in banking systems","Implement MFA for remote access and critical applications","Establish network segmentation (banking, admin, DMZ)","Deploy SIEM and 24x7 SOC monitoring","Implement IDS/IPS and next-generation firewall controls"] },
      { phase:"Phase 3 — Resilience & Outsourcing (Weeks 11–14)", items:["Conduct annual BCP/DRP test with cyber failure scenario","Assess all outsourced providers against CBB TM-2 requirements","Implement DLP for customer financial data","Establish vulnerability management with quarterly VAPT","Deploy EDR on all endpoints including banking terminals"] },
      { phase:"Phase 4 — Audit & Reporting (Weeks 15–18)", items:["Engage CBB-recognised firm for TM-2 cybersecurity audit","Remediate all critical and high findings within 30 days","Submit annual cybersecurity compliance report to CBB","Establish continuous monitoring dashboard for CBB KPIs","Conduct annual management review and sign-off"] },
    ],
  },
  "PDPL Bahrain": {
    icon:"🇧🇭", fullName:"Bahrain Personal Data Protection Law (Law No. 30 of 2018)", subtitle:"Personal Data Protection Establishment of Bahrain — Controller Registration, Consent and Data Subject Rights",
    certBody:"Personal Data Protection Establishment (PDPEA) — regulatory oversight and enforcement", policies:6, sops:4, registers:5, weeks:12,
    certPath:[
      { n:1, label:"Data Controller Registration with PDPEA", time:"1–2 weeks" },
      { n:2, label:"Personal Data Mapping", time:"2–3 weeks" },
      { n:3, label:"Consent & Notice Implementation", time:"3–4 weeks" },
      { n:4, label:"Data Subject Rights Procedures", time:"2–3 weeks" },
      { n:5, label:"Breach Notification Workflow", time:"1 week" },
      { n:6, label:"Annual PDPEA Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"PDPL Controller Compliance Review", desc:"Annual internal audit of all data controller obligations — registration, consent, notice, data minimisation, accuracy, retention, security and data subject rights." },
      { name:"Data Subject Rights Audit", desc:"Assessment of DSAR intake, response timelines and fulfilment processes against PDPEA requirements and the 30-day response standard." },
      { name:"Cross-Border Transfer Assessment", desc:"Review of international data transfer safeguards — adequacy determinations, SCCs and PDPEA-approved transfer mechanisms." },
      { name:"Breach Notification Drill", desc:"Tabletop exercise simulating a personal data breach and validating the 72-hour PDPEA notification workflow." },
    ],
    coreRegisters:["Data Processing Register","Consent Register","Data Subject Request Log","Data Breach Register","Cross-Border Transfer Register"],
    implSteps:[
      { phase:"Phase 1 — Registration (Weeks 1–3)", items:["Register as Data Controller with the PDPEA","Map all personal data categories and processing activities","Identify legal bases for all processing","Classify sensitive personal data under PDPL Article 2","Engage legal counsel to review existing contracts for PDPL compliance"] },
      { phase:"Phase 2 — Consent & Notice (Weeks 4–6)", items:["Draft PDPL-compliant privacy notices for all collection channels","Implement consent management with documented withdrawal rights","Create privacy notice for employee personal data processing","Establish data minimisation controls and purpose limitation procedures","Update website, app and service touchpoints with PDPL notices"] },
      { phase:"Phase 3 — Rights & Security (Weeks 7–9)", items:["Implement DSAR workflow (access, rectify, delete, restrict)","Train customer-facing teams on PDPL data subject rights obligations","Deploy security safeguards appropriate to data sensitivity","Implement cross-border transfer controls for non-Bahrain transfers","Update Data Processing Agreements with all processors"] },
      { phase:"Phase 4 — Breach & Maintenance (Weeks 10–12)", items:["Establish breach detection, documentation and PDPEA notification workflow","Test breach notification drill targeting 72-hour notification","Conduct PDPL awareness training for all staff","Perform annual compliance review and data mapping refresh","Submit any required PDPEA notifications or registration updates"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // AUSTRALIA — 4 Frameworks
  // ═══════════════════════════════════════════════════════
  "ASD Essential Eight": {
    icon:"🇦🇺", fullName:"ASD Essential Eight Mitigation Strategies (2023)", subtitle:"Australian Signals Directorate — 8 Baseline Cyber Controls at Maturity Levels 1–3",
    certBody:"Australian Signals Directorate (ASD) — assessed by ASD-certified or IRAP assessors", policies:8, sops:8, registers:5, weeks:20,
    certPath:[
      { n:1, label:"Target Maturity Level Definition", time:"1–2 weeks" },
      { n:2, label:"E8 Gap Assessment", time:"2–3 weeks" },
      { n:3, label:"Prioritised Controls Implementation", time:"10–12 weeks" },
      { n:4, label:"ASD E8 Maturity Assessment", time:"2–3 weeks" },
      { n:5, label:"Remediation and Uplift", time:"2–3 weeks" },
      { n:6, label:"Annual Reassessment", time:"Annually" },
    ],
    auditTypes:[
      { name:"ASD E8 Maturity Assessment", desc:"Annual assessment by an ASD-certified assessor rating the organisation at ML0–ML3 across all 8 strategies — Application Control, Patch Apps, Office Macros, App Hardening, Admin Privileges, Patch OS, MFA and Backups." },
      { name:"Penetration Test", desc:"Annual adversarial simulation testing application control bypass, privilege escalation and backup integrity across all 8 essential eight mitigation domains." },
      { name:"Vulnerability Scan", desc:"Monthly vulnerability scanning aligned to Essential Eight patching requirements — critical patches within 48 hours, non-critical within 2 weeks (ML2/ML3)." },
      { name:"Backup Recovery Test", desc:"Quarterly backup restoration test verifying RTO and RPO for all critical systems as required by Essential Eight Mitigation 8." },
    ],
    coreRegisters:["Application Allow-List Register","Patch Status Register","Admin Privilege Register","MFA Enrolment Register","Backup Test Register"],
    implSteps:[
      { phase:"Phase 1 — Baseline (Weeks 1–4)", items:["Define target maturity level (ML1, ML2 or ML3)","Conduct gap assessment across all 8 mitigation strategies","Prioritise application control and patching (highest impact)","Inventory all applications for allow-listing","Audit all administrative accounts and privileged access"] },
      { phase:"Phase 2 — Application Controls (Weeks 5–9)", items:["Deploy application control solution (ML1: user space; ML2: OS; ML3: full)","Implement application allow-listing for all workstations","Configure Microsoft Office macro restrictions (block untrusted sources)","Harden web browsers (disable Java, Flash, ads) and PDF viewers","Establish 48-hour (critical) and 2-week (non-critical) patching SLAs"] },
      { phase:"Phase 3 — Access & Backup (Weeks 10–15)", items:["Remove unnecessary admin privileges from all end-user accounts","Implement just-in-time privileged access with PAM tooling","Enforce MFA for all remote access and privileged accounts","Patch operating systems within 2-week window for critical patches","Implement offline and immutable backups with quarterly restore tests"] },
      { phase:"Phase 4 — Assessment (Weeks 16–20)", items:["Engage ASD-certified assessor for official maturity assessment","Document maturity level evidence for each of the 8 strategies","Remediate gaps to reach target maturity level","Submit assessment results to ASD (government entities)","Establish continuous monitoring dashboard aligned to E8 KPIs"] },
    ],
  },
  "APRA CPS 234": {
    icon:"🇦🇺", fullName:"APRA Prudential Standard CPS 234 — Information Security (2019)", subtitle:"Australian Prudential Regulation Authority — Security Capability, Governance, Incidents and Third Parties",
    certBody:"Australian Prudential Regulation Authority (APRA) — supervisory review and external audit", policies:9, sops:6, registers:6, weeks:18,
    certPath:[
      { n:1, label:"CPS 234 Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"Board Responsibility Definition", time:"1–2 weeks" },
      { n:3, label:"Information Security Framework", time:"4–6 weeks" },
      { n:4, label:"Third-Party Security Assessment", time:"3–4 weeks" },
      { n:5, label:"Annual Internal/External Audit", time:"2–3 weeks" },
      { n:6, label:"APRA Supervisory Review", time:"Ongoing" },
    ],
    auditTypes:[
      { name:"CPS 234 Internal Audit", desc:"Annual internal audit assessing all CPS 234 obligations — board responsibility, information security capability, policy framework, incident response and third-party management." },
      { name:"CPS 234 External Audit", desc:"Triennial external audit by an APRA-recognised expert assessing the design and operating effectiveness of information security controls." },
      { name:"Third-Party Information Security Review", desc:"Annual assessment of all material third-party arrangements for compliance with CPS 234 security requirements and contractual obligations." },
      { name:"APRA Notification Readiness Test", desc:"Tabletop exercise validating the 72-hour APRA notification workflow for information security incidents with material impact." },
    ],
    coreRegisters:["Information Asset Register","Incident Register (72-hour APRA reporting)","Third-Party Risk Register","Vulnerability Register","Change Management Log","IS Audit Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Define board information security responsibility (CPS 234 Para 15)","Assess information security capability against size and complexity","Develop Information Security Framework aligned to CPS 234","Classify information assets by criticality and sensitivity","Establish Information Security Committee with board representation"] },
      { phase:"Phase 2 — Controls (Weeks 5–10)", items:["Implement controls proportionate to information asset risk","Establish access management and MFA for critical systems","Deploy network security controls and SIEM monitoring","Implement vulnerability management with defined patching SLAs","Establish change management process with security sign-off"] },
      { phase:"Phase 3 — Third Parties (Weeks 11–14)", items:["Identify all material third-party arrangements per CPS 234 Para 36","Conduct information security assessment of all material providers","Include CPS 234 security obligations in all third-party contracts","Monitor third-party security posture via annual review","Establish right-to-audit provisions in all material contracts"] },
      { phase:"Phase 4 — Audit & APRA (Weeks 15–18)", items:["Conduct annual internal IS audit covering all CPS 234 obligations","Notify APRA within 72 hours of material IS incidents","Notify APRA of material control weaknesses as soon as practicable","Engage external auditor for triennial CPS 234 assessment","Establish board reporting dashboard for information security KPIs"] },
    ],
  },
  "Privacy Act 1988 (APPs)": {
    icon:"🇦🇺", fullName:"Privacy Act 1988 — Australian Privacy Principles (APPs)", subtitle:"Office of the Australian Information Commissioner — 13 APPs for Handling Personal Information",
    certBody:"Office of the Australian Information Commissioner (OAIC) — regulatory oversight and enforcement", policies:7, sops:5, registers:5, weeks:12,
    certPath:[
      { n:1, label:"APP Entity Classification", time:"1 week" },
      { n:2, label:"Personal Information Mapping", time:"2–3 weeks" },
      { n:3, label:"APP 1–5 (Governance & Collection)", time:"3–4 weeks" },
      { n:4, label:"APP 6–13 (Use, Disclosure, Rights)", time:"3–4 weeks" },
      { n:5, label:"Privacy Policy Publication", time:"1 week" },
      { n:6, label:"Annual Privacy Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"APPs Compliance Review", desc:"Annual review of all 13 Australian Privacy Principles — collection, use, disclosure, quality, security, access and correction of personal information." },
      { name:"Privacy Impact Assessment (PIA)", desc:"Privacy Impact Assessment for new projects, systems or data practices that involve personal information per OAIC PIA guidelines." },
      { name:"Data Breach Assessment", desc:"Assessment of the Notifiable Data Breaches (NDB) scheme compliance — serious harm threshold, OAIC notification and individual notification procedures." },
      { name:"Direct Marketing Compliance Audit", desc:"Assessment of APP 7 direct marketing controls, opt-out mechanisms and Do Not Contact register compliance." },
    ],
    coreRegisters:["Personal Information Register","Privacy Breach Register (NDB)","Privacy Request Log (Access & Correction)","Third-Party Data Sharing Register","Consent Register"],
    implSteps:[
      { phase:"Phase 1 — Mapping (Weeks 1–3)", items:["Confirm APP entity status (not exempt under Privacy Act)","Map all personal information collected, used and disclosed","Identify all third parties receiving personal information","Audit current privacy policy for APP 1 compliance","Classify sensitive information under Privacy Act Schedule 3"] },
      { phase:"Phase 2 — Collection & Notice (Weeks 4–6)", items:["Update collection notices at all touchpoints (APP 5)","Implement anonymity and pseudonymity options where practicable (APP 2)","Review and update solicited collection practices (APP 3)","Establish procedures for unsolicited personal information (APP 4)","Update privacy policy on website and apps (APP 1 compliance)"] },
      { phase:"Phase 3 — Use, Disclosure & Security (Weeks 7–9)", items:["Document use and disclosure purposes for all information (APP 6)","Review direct marketing practices and opt-out mechanisms (APP 7)","Implement cross-border disclosure safeguards (APP 8)","Deploy security controls for personal information (APP 11)","Establish data quality controls and update procedures (APP 10 & 13)"] },
      { phase:"Phase 4 — Rights & NDB (Weeks 10–12)", items:["Implement access request procedures with 30-day response (APP 12)","Establish correction request procedures (APP 13)","Deploy NDB breach assessment workflow (serious harm threshold)","Test OAIC notification procedure for eligible data breaches","Publish updated APP Privacy Policy and conduct staff training"] },
    ],
  },
  "ISM Australia": {
    icon:"🇦🇺", fullName:"Australian Government Information Security Manual (ISM 2024)", subtitle:"Australian Signals Directorate — Risk-Based Security Controls for Government Agencies and Technology Partners",
    certBody:"Australian Signals Directorate (ASD) — IRAP-assessed; relevant to government and defence partners", policies:12, sops:9, registers:7, weeks:24,
    certPath:[
      { n:1, label:"IRAP Assessor Engagement", time:"1–2 weeks" },
      { n:2, label:"System Security Plan Development", time:"3–4 weeks" },
      { n:3, label:"Essential Eight Controls (Prerequisite)", time:"8–10 weeks" },
      { n:4, label:"ISM Controls Implementation", time:"8–10 weeks" },
      { n:5, label:"IRAP Assessment", time:"2–4 weeks" },
      { n:6, label:"Annual Continuous Monitoring", time:"Ongoing" },
    ],
    auditTypes:[
      { name:"IRAP Assessment", desc:"Formal assessment by an ASD-certified IRAP assessor evaluating the design and effectiveness of ISM controls against the target system security classification." },
      { name:"Security Assessment & Authorisation (SA&A)", desc:"End-to-end SA&A process including threat and risk assessment, security architecture review and authorisation decision by the Authorising Officer." },
      { name:"Continuous Monitoring Review", desc:"Annual review of continuous monitoring activities — log review, vulnerability scanning, access control audits and patch compliance against ISM requirements." },
      { name:"Penetration Test", desc:"Annual penetration test by an IRAP-assessed tester covering network, application and physical security against ISM threat model." },
    ],
    coreRegisters:["System Security Plan Register","Asset Register","Vulnerability Register","Access Management Register","Incident Register","Patch Status Register","Crypto Key Register"],
    implSteps:[
      { phase:"Phase 1 — Planning (Weeks 1–6)", items:["Define system classification level (OFFICIAL, PROTECTED, SECRET)","Engage ASD IRAP assessor for project scoping","Develop System Security Plan (SSP) for target system","Conduct threat and risk assessment per ISM guidelines","Define security architecture meeting classification requirements"] },
      { phase:"Phase 2 — Essential Eight Foundation (Weeks 7–14)", items:["Implement Essential Eight controls as ISM prerequisite","Deploy application control aligned to ISM and E8 requirements","Enforce MFA for all system access at appropriate level","Harden operating systems and applications per ISM hardening guides","Establish privileged access management for admin accounts"] },
      { phase:"Phase 3 — ISM Controls (Weeks 15–20)", items:["Implement cryptographic controls per ISM cryptography guidelines","Deploy log management with 7-year retention for PROTECTED systems","Establish secure network architecture per ISM network guidance","Implement personnel security controls (security clearances, need-to-know)","Configure data-at-rest encryption to ISM cryptographic standards"] },
      { phase:"Phase 4 — Assessment (Weeks 21–24)", items:["Conduct IRAP assessment with ASD-certified assessor","Obtain Authorising Officer (AO) authorisation to operate","Establish continuous monitoring programme per ISM requirements","Submit annual ISM compliance reports as required","Implement annual review cycle for SSP and risk assessment updates"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // UAE — 4 Frameworks
  // ═══════════════════════════════════════════════════════
  "UAE NESA IA Standards": {
    icon:"🇦🇪", fullName:"UAE National Electronic Security Authority IA Standards (2014)", subtitle:"NESA — Information Assurance Standards for UAE Critical Infrastructure and Government Entities",
    certBody:"UAE National Cybersecurity Council (previously NESA) — compliance assessed by NESA-approved auditors", policies:11, sops:7, registers:7, weeks:22,
    certPath:[
      { n:1, label:"NESA IA Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"Information Security Governance Setup", time:"3–4 weeks" },
      { n:3, label:"Technical Controls Implementation", time:"8–10 weeks" },
      { n:4, label:"NESA-Approved Audit", time:"2–3 weeks" },
      { n:5, label:"UAE CIRT Registration", time:"1 week" },
      { n:6, label:"Annual NESA Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"NESA IA Standards Assessment", desc:"Annual assessment by a NESA-approved auditor covering all IA Standard domains — governance, risk, access control, network security, data protection, incident management and BCM." },
      { name:"Vulnerability Assessment & Penetration Test", desc:"Quarterly VAPT of internet-facing systems and annual internal network penetration test by a NESA-recognised testing organisation." },
      { name:"UAE CIRT Incident Reporting Drill", desc:"Annual tabletop exercise simulating a critical infrastructure cyber incident and validating the UAE CIRT incident reporting workflow." },
      { name:"Third-Party and Supply Chain Review", desc:"Annual assessment of critical vendors and supply chain partners against NESA IA security requirements." },
    ],
    coreRegisters:["Information Asset Register","Risk Register","Incident Register (UAE CIRT)","Access Control Register","Change Management Log","Vendor Risk Register","BCP Test Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Establish Information Security Governance Structure per NESA","Appoint CISO with board-level mandate","Draft Information Security Policy, Standards and Procedures","Define risk appetite and information security risk management framework","Register organisation with UAE CIRT as critical infrastructure entity"] },
      { phase:"Phase 2 — Access & Network (Weeks 5–10)", items:["Implement Identity and Access Management framework","Deploy PAM for privileged accounts on all critical systems","Establish network segmentation and perimeter security architecture","Deploy IDS/IPS and SIEM with 24x7 monitoring","Implement endpoint protection and EDR across all estate"] },
      { phase:"Phase 3 — Data & Resilience (Weeks 11–16)", items:["Classify all information assets by NESA criticality levels","Implement cryptographic controls for sensitive data","Deploy DLP for critical national information","Develop and test BCP/DRP for critical infrastructure continuity","Establish cyber threat intelligence capability and UAE CIRT feeds"] },
      { phase:"Phase 4 — Audit & Compliance (Weeks 17–22)", items:["Conduct internal NESA IA readiness assessment","Engage NESA-approved auditor for official assessment","Remediate all critical findings within 30-day timeline","Submit compliance report to UAE National Cybersecurity Council","Establish annual review cycle and continuous monitoring dashboard"] },
    ],
  },
  "CBUAE Cybersecurity": {
    icon:"🇦🇪", fullName:"Central Bank of UAE Cybersecurity Framework 2021", subtitle:"CBUAE — Cybersecurity Governance, ICT Risk, Incident Response for UAE-Licensed Financial Institutions",
    certBody:"Central Bank of UAE (CBUAE) — supervisory review and annual external assessment", policies:10, sops:6, registers:6, weeks:18,
    certPath:[
      { n:1, label:"CBUAE Framework Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"Governance & Risk Framework", time:"3–4 weeks" },
      { n:3, label:"Technology & Threat Controls", time:"7–8 weeks" },
      { n:4, label:"External Cybersecurity Assessment", time:"2–3 weeks" },
      { n:5, label:"CBUAE Compliance Submission", time:"1 week" },
      { n:6, label:"Annual CBUAE Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"CBUAE Annual Cybersecurity Assessment", desc:"Annual assessment against the CBUAE Cybersecurity Framework covering governance, ICT risk, threat intelligence, access management, network security, incident response and third-party risk." },
      { name:"Penetration Testing", desc:"Annual penetration test of banking systems, payment infrastructure, mobile apps and internal networks by a CBUAE-recognised testing firm." },
      { name:"Threat Intelligence Assessment", desc:"Quarterly review of threat intelligence programme effectiveness — intelligence sources, threat actor tracking and integration with SOC operations." },
      { name:"Third-Party Cyber Risk Review", desc:"Annual assessment of all critical fintech partners, cloud providers and technology vendors against CBUAE third-party cyber risk requirements." },
    ],
    coreRegisters:["ICT Risk Register","Cyber Incident Register (CBUAE reporting)","Access Management Register","Threat Intelligence Log","Third-Party Risk Register","Penetration Test Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Establish Cybersecurity Governance Policy per CBUAE Framework","Appoint CISO with direct access to board","Define cyber risk appetite and ICT risk management framework","Establish Board Risk Committee with cybersecurity mandate","Draft Cybersecurity Strategy aligned to CBUAE requirements"] },
      { phase:"Phase 2 — Access & Network (Weeks 5–10)", items:["Deploy PAM for all privileged accounts in banking systems","Enforce MFA for all staff and customer-facing systems","Implement network segmentation for payment processing environments","Build or subscribe to 24x7 SOC with SIEM coverage","Establish threat intelligence feeds (UAE CIRT, FS-ISAC, CBUAE)"] },
      { phase:"Phase 3 — Resilience (Weeks 11–14)", items:["Develop cyber incident response plan per CBUAE requirements","Establish CBUAE incident reporting workflow (notify within timeline)","Conduct annual BCP/DRP test with cyber failure scenarios","Assess all critical fintech and cloud partners for CBUAE compliance","Implement vulnerability management with monthly scanning cadence"] },
      { phase:"Phase 4 — Assessment (Weeks 15–18)", items:["Engage CBUAE-recognised firm for annual cybersecurity assessment","Conduct annual penetration test of critical banking systems","Remediate all critical findings within 30-day CBUAE timeline","Submit annual cybersecurity compliance report to CBUAE","Establish board-level cybersecurity KPI dashboard"] },
    ],
  },
  "DIFC Data Protection": {
    icon:"🇦🇪", fullName:"DIFC Data Protection Law 2020 (Law No. 5 of 2020)", subtitle:"DIFC Commissioner of Data Protection — Controller/Processor Obligations, Rights and Cross-Border Transfers",
    certBody:"DIFC Commissioner of Data Protection (CDP) — regulatory oversight and enforcement", policies:7, sops:5, registers:6, weeks:14,
    certPath:[
      { n:1, label:"DIFC DP Assessment", time:"2 weeks" },
      { n:2, label:"Data Mapping & Controller Register", time:"2–3 weeks" },
      { n:3, label:"Consent & Notice Framework", time:"2–3 weeks" },
      { n:4, label:"Data Subject Rights Implementation", time:"2–3 weeks" },
      { n:5, label:"DPO Appointment", time:"1 week" },
      { n:6, label:"Annual CDP Compliance Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"DIFC PDPR Compliance Audit", desc:"Annual audit of DIFC Data Protection Law obligations — controller/processor registration, consent, notice, data minimisation, security safeguards and data subject rights." },
      { name:"Data Subject Rights Assessment", desc:"Evaluation of DSAR procedures — access, rectification, erasure and restriction requests against the DIFC 30-day response timeline." },
      { name:"Cross-Border Transfer Review", desc:"Assessment of international data transfer mechanisms — adequacy decisions, standard contractual clauses and DIFC CDP binding approvals." },
      { name:"Data Breach Readiness Drill", desc:"Tabletop exercise simulating a personal data breach and validating the 72-hour DIFC CDP notification procedure." },
    ],
    coreRegisters:["Data Processing Activities Register","Consent Register","Data Subject Request Log","Personal Data Breach Register","DPA / Processor Agreement Register","Cross-Border Transfer Register"],
    implSteps:[
      { phase:"Phase 1 — Assessment (Weeks 1–3)", items:["Map all personal data processing activities in DIFC scope","Classify as Data Controller, Processor or both","Identify sensitive personal data categories under DIFC law","Assess current consent and notice mechanisms for DIFC compliance","Engage DIFC CDP-recognised legal counsel for regulatory guidance"] },
      { phase:"Phase 2 — Consent & Notice (Weeks 4–6)", items:["Draft DIFC-compliant privacy notices for all collection touchpoints","Implement consent management with granular purpose tracking","Update terms of service and data processing agreements","Appoint Data Protection Officer (mandatory for large-scale processing)","Register data processing activities with DIFC CDP register"] },
      { phase:"Phase 3 — Rights & Security (Weeks 7–10)", items:["Implement data subject rights workflows (access, rectify, erase, restrict)","Deploy security safeguards appropriate to data sensitivity and volume","Implement cross-border transfer controls with DIFC-approved mechanisms","Update all Data Processing Agreements with DIFC required clauses","Conduct Data Protection Impact Assessments for high-risk processing"] },
      { phase:"Phase 4 — Breach & Maintenance (Weeks 11–14)", items:["Build breach detection and 72-hour DIFC CDP notification workflow","Test breach response procedure with tabletop exercise","Conduct DIFC data protection awareness training for all staff","Perform annual PDPR compliance audit and records refresh","Establish annual review cycle for DPIA, DPAs and privacy notices"] },
    ],
  },
  "UAE PDPL": {
    icon:"🇦🇪", fullName:"UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021)", subtitle:"UAE Federal Privacy Law — Data Controller Obligations, Consent, Cross-Border Transfers and Enforcement",
    certBody:"UAE Data Office — regulatory authority and enforcement (established 2024)", policies:7, sops:5, registers:6, weeks:14,
    certPath:[
      { n:1, label:"UAE PDPL Applicability Assessment", time:"1–2 weeks" },
      { n:2, label:"Personal Data Inventory", time:"2–3 weeks" },
      { n:3, label:"Consent & Notice Framework", time:"3–4 weeks" },
      { n:4, label:"Data Subject Rights Procedures", time:"2–3 weeks" },
      { n:5, label:"DPO Appointment (if required)", time:"1 week" },
      { n:6, label:"Annual UAE Data Office Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"UAE PDPL Controller Compliance Audit", desc:"Annual audit of all UAE PDPL controller obligations — consent, notice, data minimisation, accuracy, retention, security, subject rights and cross-border transfer controls." },
      { name:"Data Subject Rights Assessment", desc:"Assessment of data subject rights procedures — access, correction, erasure, withdrawal — against UAE PDPL timelines and the UAE Data Office requirements." },
      { name:"Cross-Border Transfer Review", desc:"Assessment of international data transfer mechanisms including UAE Data Office approved countries, SCCs and binding corporate rules." },
      { name:"Data Breach Response Drill", desc:"Tabletop exercise simulating a personal data breach and validating UAE PDPL breach notification timelines to affected individuals and the UAE Data Office." },
    ],
    coreRegisters:["Personal Data Processing Register","Consent Register","Data Subject Request Log","Data Breach Register","Cross-Border Transfer Register","Processor Agreement Register"],
    implSteps:[
      { phase:"Phase 1 — Discovery (Weeks 1–3)", items:["Confirm UAE PDPL applicability (established in UAE or processing UAE residents' data)","Map all personal data categories, processing purposes and legal bases","Identify special categories of personal data (health, biometric, financial, children's data)","Inventory all data processors and third-party data recipients","Review existing privacy policies and consent mechanisms for PDPL gaps"] },
      { phase:"Phase 2 — Consent & Notice (Weeks 4–7)", items:["Draft UAE PDPL-compliant privacy notices for all collection touchpoints","Implement consent management with explicit consent for special categories","Enable consent withdrawal without adverse consequences","Update mobile apps, websites and service agreements with PDPL notices","Appoint Data Protection Officer where UAE PDPL requires"] },
      { phase:"Phase 3 — Rights & Security (Weeks 8–11)", items:["Implement data subject rights workflow (access, correct, erase, object)","Deploy security measures appropriate to processing sensitivity and scale","Establish cross-border transfer controls per UAE Data Office approved list","Update Data Processing Agreements with all processors for PDPL compliance","Conduct Data Protection Impact Assessments for high-risk activities"] },
      { phase:"Phase 4 — Compliance (Weeks 12–14)", items:["Build UAE PDPL breach notification workflow to UAE Data Office","Conduct PDPL privacy awareness training for all staff","Perform annual compliance audit against UAE PDPL obligations","Establish records of processing activities for UAE Data Office inspection","Document annual review calendar for DPIA, DPAs and privacy notices"] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // KENYA — 2 Frameworks
  // ═══════════════════════════════════════════════════════
  "Kenya DPA 2019": {
    icon:"🇰🇪", fullName:"Kenya Data Protection Act 2019 (No. 24 of 2019)", subtitle:"Office of the Data Protection Commissioner — Registration, Consent, Data Principal Rights and Breach Notification",
    certBody:"Office of the Data Protection Commissioner (ODPC) — regulatory oversight and enforcement", policies:6, sops:4, registers:5, weeks:12,
    certPath:[
      { n:1, label:"ODPC Controller Registration", time:"1–2 weeks" },
      { n:2, label:"Personal Data Mapping", time:"2–3 weeks" },
      { n:3, label:"Consent & Notice Implementation", time:"2–3 weeks" },
      { n:4, label:"Data Subject Rights Setup", time:"2–3 weeks" },
      { n:5, label:"Breach Notification Workflow", time:"1 week" },
      { n:6, label:"Annual ODPC Compliance Report", time:"Annually" },
    ],
    auditTypes:[
      { name:"Kenya DPA Compliance Audit", desc:"Annual audit covering all Kenya DPA obligations — ODPC registration, consent, notice, data minimisation, accuracy, retention, security and data subject rights." },
      { name:"Data Subject Rights Assessment", desc:"Evaluation of procedures for data subject access, rectification, erasure, restriction and portability requests — response timelines and escalation." },
      { name:"Data Breach Readiness Drill", desc:"Tabletop exercise validating the 72-hour ODPC breach notification workflow and individual notification procedures." },
      { name:"Cross-Border Transfer Compliance Check", desc:"Assessment of cross-border data transfer safeguards — ODPC adequacy assessments, SCCs and approved transfer mechanisms." },
    ],
    coreRegisters:["Personal Data Register","Consent Register","Data Subject Request Log","Data Breach Register","Cross-Border Transfer Register"],
    implSteps:[
      { phase:"Phase 1 — Registration (Weeks 1–3)", items:["Register as Data Controller and/or Processor with ODPC","Appoint Data Protection Officer (required for public bodies and processors)","Map all personal data collected, processed and shared","Identify legal bases for each processing activity","Classify sensitive personal data categories under Kenya DPA"] },
      { phase:"Phase 2 — Consent & Notice (Weeks 4–6)", items:["Draft ODPC-compliant privacy notices for all data collection channels","Implement consent management with documented withdrawal rights","Update website, mobile apps and service forms with Kenya DPA notices","Establish data minimisation and purpose limitation controls","Create records of processing activities for ODPC compliance"] },
      { phase:"Phase 3 — Rights & Security (Weeks 7–9)", items:["Implement data subject rights workflows (access, rectify, erase, port)","Train staff on Kenya DPA obligations and rights request handling","Deploy security safeguards appropriate to data sensitivity","Implement cross-border transfer controls for non-Kenya transfers","Update Data Processing Agreements with all processors"] },
      { phase:"Phase 4 — Breach & Maintenance (Weeks 10–12)", items:["Build ODPC breach notification workflow (target: 72 hours)","Conduct Kenya DPA awareness training for all employees","Submit annual compliance report to ODPC","Conduct internal DPA compliance audit and data mapping refresh","Establish annual review cycle for DPAs and privacy notices"] },
    ],
  },
  "CBK Cybersecurity": {
    icon:"🇰🇪", fullName:"Central Bank of Kenya ICT Security Guidance (2021)", subtitle:"CBK — ICT Risk Governance, Access Control, Incident Response and 24-hour Reporting for CBK-Licensed Institutions",
    certBody:"Central Bank of Kenya (CBK) — supervisory oversight and annual ICT security assessment", policies:8, sops:6, registers:6, weeks:16,
    certPath:[
      { n:1, label:"CBK ICT Gap Assessment", time:"2–3 weeks" },
      { n:2, label:"ICT Governance Framework", time:"3–4 weeks" },
      { n:3, label:"Technology Controls Implementation", time:"6–8 weeks" },
      { n:4, label:"CBK-Approved ICT Security Assessment", time:"2–3 weeks" },
      { n:5, label:"CBK Compliance Submission", time:"1 week" },
      { n:6, label:"Annual CBK Supervisory Review", time:"Annually" },
    ],
    auditTypes:[
      { name:"CBK Annual ICT Security Assessment", desc:"Annual assessment by a CBK-approved assessor covering all CBK cybersecurity guidance domains — governance, access control, network security, incident response, BCP and third-party risk." },
      { name:"Penetration Test", desc:"Annual penetration test of internet banking platforms, mobile apps, API gateways and internal networks by a CBK-recognised testing firm." },
      { name:"Third-Party ICT Risk Review", desc:"Annual assessment of fintech partners, payment processors and technology vendors against CBK outsourcing and ICT risk requirements." },
      { name:"BCP/DR Exercise", desc:"Annual business continuity and disaster recovery exercise including cyber attack scenarios, with recovery time and recovery point objective validation." },
    ],
    coreRegisters:["ICT Risk Register","Cyber Incident Register (24-hour reporting)","Access Control Register","Third-Party Risk Register","BCP Test Register","Vulnerability Register"],
    implSteps:[
      { phase:"Phase 1 — Governance (Weeks 1–4)", items:["Appoint CISO with board-level reporting line","Draft ICT Security Policy, Risk Appetite and Acceptable Use Policy","Establish Board IT Risk Committee per CBK governance requirements","Define ICT risk appetite and escalation thresholds","Map all critical systems and data flows for CBK-regulated activities"] },
      { phase:"Phase 2 — Access & Network (Weeks 5–9)", items:["Implement access control framework with least-privilege enforcement","Deploy MFA for all remote access and critical banking applications","Establish network segmentation for payment and core banking systems","Deploy SIEM and SOC monitoring for banking infrastructure","Implement vulnerability management with monthly scanning"] },
      { phase:"Phase 3 — Resilience (Weeks 10–12)", items:["Develop cyber incident response plan with CBK 24-hour reporting SLA","Test BCP/DRP with cyber failure scenario (annual requirement)","Assess all critical fintech and payment partners for CBK compliance","Deploy endpoint protection and EDR across all banking workstations","Establish threat intelligence feeds for Kenyan banking sector threats"] },
      { phase:"Phase 4 — Audit & Reporting (Weeks 13–16)", items:["Engage CBK-approved assessor for annual ICT security assessment","Remediate all critical findings within CBK-specified timelines","Submit annual ICT security compliance report to CBK","Establish board reporting dashboard for cybersecurity KPIs","Conduct annual management review and sign off compliance attestation"] },
    ],
  },
};

function fwCategory(cat: string): typeof FW_CATEGORIES[number] {
  if (!cat) return "Security";
  const c = cat.toLowerCase();
  if (c.includes("privacy") || c.includes("data protection") || c.includes("gdpr")) return "Privacy";
  if (c.includes("financial") || c.includes("banking") || c.includes("pci") || c.includes("sox") || c.includes("payment")) return "Financial";
  if (c.includes("health") || c.includes("medical") || c.includes("hipaa")) return "Healthcare";
  if (c.includes("government") || c.includes("federal") || c.includes("dod") || c.includes("fedramp")) return "Government";
  if (c.includes("cloud") || c.includes("cspm") || c.includes("aws") || c.includes("azure")) return "Cloud";
  if (c.includes("application") || c.includes("development") || c.includes("devsecops") || c.includes("software")) return "AppSec";
  if (c.includes("ai") || c.includes("machine learning") || c.includes("blockchain") || c.includes("quantum")) return "AI/Emerging";
  if (c.includes("operational") || c.includes("supply chain") || c.includes("continuity") || c.includes("resilience")) return "Operational";
  return "Security";
}

function RingChart({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r, dash = (pct / 100) * circ, cx = size / 2;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#F3F4F6" strokeWidth="7" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color }}>{pct}%</div>
      </div>
    </div>
  );
}

interface StageTask {
  auditId: string; auditName: string; stageN: number; stageLabel: string; stageIcon: string; stageOutput: string;
  status: "not-started"|"in-progress"|"completed"; implementer: string; notes: string;
  evidences: Array<{name:string; size:string; date:string}>;
}

export default function ComplianceOps() {
  const [, navigate] = useLocation();
  const { viewTenantId } = useOrg();
  const { isAuthenticated } = useAuth();
  const { isFrameworkLicensed, frameworkIds, licensedFrameworks, isViewingOwnTenant } = useLicense();
  // Rich framework objects from the SWR-cached /compliance/frameworks endpoint.
  // Use licensedFrameworks from context for IDs/names; use allApiFrameworks for display metadata (color, category, etc.)
  const { data: allApiFrameworks } = useComplianceFrameworks();
  const licensedFwNames = useMemo(
    () => licensedFrameworks.map(fw => fw.name),
    [licensedFrameworks],
  );
  const [tab, setTab] = useState("overview");
  const [selectedFw,   setSelectedFw]   = useState<any | null>(null);
  const [fwDetailTab,  setFwDetailTab]  = useState("overview");
  const [expandedAuditType, setExpandedAuditType] = useState<string | null>(null);
  const [selAudit, setSelAudit] = useState<typeof audits[0] | null>(null);
  const [selEvidence, setSelEvidence] = useState<typeof evidence[0] | null>(null);

  // ── Audit management state ──────────────────────────────────────────────────
  const [createOpen,      setCreateOpen]      = useState(false);
  const [createStep,      setCreateStep]      = useState(1);
  const [createForm,      setCreateForm]      = useState({ fwId:"", fwName:"", auditType:"", entity:"", location:"", process:"", systems:"", auditor:"", auditee:"", name:"", objective:"", startDate:"", endDate:"", sampling:"Random sampling" });
  const [localAudits,     setLocalAudits]     = useState<any[]>([]);
  const [statusOvr,       setStatusOvr]       = useState<Record<string,string>>({});
  const [deletedIds,      setDeletedIds]      = useState<Set<string>>(new Set());
  const [deleteTarget,    setDeleteTarget]    = useState<string|null>(null);
  const [expandedRow,     setExpandedRow]     = useState<string|null>(null);
  const [auditMenuId,     setAuditMenuId]     = useState<string|null>(null);
  const [auditDetailId,   setAuditDetailId]   = useState<string|null>(null);
  const [auditDetailTab,  setAuditDetailTab]  = useState("workflow");
  const [auditPage,       setAuditPage]       = useState(1);
  const [auditFilter,     setAuditFilter]     = useState("All");
  const [auditSubTab,     setAuditSubTab]     = useState("programs");
  const [caSubTab,        setCaSubTab]        = useState("library");
  const [caSearch,        setCaSearch]        = useState("");
  const [caDomain,        setCaDomain]        = useState("All");
  const [ttSubTab,        setTtSubTab]        = useState("library");
  const [ttSearch,        setTtSearch]        = useState("");
  const [ttCat,           setTtCat]           = useState("All");
  const [caAssessModal,   setCaAssessModal]   = useState<null|any>(null);
  const [caLocalRuns,     setCaLocalRuns]     = useState<any[]>([]);
  const [ttExerciseModal, setTtExerciseModal] = useState<null|any>(null);
  const [ttNewExOpen,     setTtNewExOpen]     = useState(false);
  const [ttNewExForm,     setTtNewExForm]     = useState({title:"",category:"Cyber Incident",difficulty:"Intermediate",duration:120,facilitator:"",date:""});
  const [ttLocalEx,       setTtLocalEx]       = useState<any[]>([]);
  const [dbFindings,      setDbFindings]      = useState<any[]>([]);
  const [dbEvidenceReqs,  setDbEvidenceReqs]  = useState<any[]>([]);

  // ── Stage task overrides — persisted in localStorage ──────────────────────
  const [selectedStageN,  setSelectedStageN]  = useState<number|null>(null);
  const [stageOverrides,  setStageOverrides]  = useState<Record<string, Record<number, StageTask>>>(() => {
    try { const d = localStorage.getItem("grc_stage_tasks"); return d ? JSON.parse(d) : {}; } catch { return {}; }
  });
  const updateStageTask = (auditId: string, auditName: string, st: typeof WORKFLOW_STAGES[0], patch: Partial<StageTask>) => {
    setStageOverrides(prev => {
      const existing: StageTask = prev[auditId]?.[st.n] ?? { auditId, auditName, stageN: st.n, stageLabel: st.label, stageIcon: st.icon, stageOutput: st.output, status: "not-started", implementer: "", notes: "", evidences: [] };
      const updated = { ...existing, ...patch };
      const next = { ...prev, [auditId]: { ...(prev[auditId] ?? {}), [st.n]: updated } };
      try { localStorage.setItem("grc_stage_tasks", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [dbAudits,    setDbAudits]    = useState<typeof audits>([]);
  const [dbGaps,      setDbGaps]      = useState<typeof gaps>([]);
  const [dbMaturity,  setDbMaturity]  = useState<typeof maturityDomains>([]);
  const [dbEvidence,  setDbEvidence]  = useState<typeof evidence>([]);
  // isViewingOwnTenant → undefined (all); otherwise licensedFwNames ([] = deny-by-default when none licensed)
  const ctrlParam = isViewingOwnTenant
    ? (licensedFwNames.length > 0 ? licensedFwNames : undefined)
    : licensedFwNames;
  const { data: apiCtrls } = useComplianceControls(ctrlParam);

  // ── Tenant-assigned frameworks: sourced from LicenseContext (no separate fetch) ──────────────
  // licensedFrameworks = [{id, name}] from useLicense(); allApiFrameworks has richer metadata.
  const tenantFrameworks = useMemo(
    () => (allApiFrameworks ?? []).filter((fw: any) => isFrameworkLicensed(fw.libraryId ?? 0)),
    [allApiFrameworks, isFrameworkLicensed],
  );
  // "loaded" once the SWR hook has resolved (undefined = loading, array = loaded)
  const tenantFrameworksLoaded = allApiFrameworks !== undefined;

  // ── Automated evidence panel ─────────────────────────────────────────────────
  const [evidenceSummary,     setEvidenceSummary]     = useState<any>(null);
  const [evidencePanelCtrl,   setEvidencePanelCtrl]   = useState<any>(null);
  const [evidencePanelItems,  setEvidencePanelItems]  = useState<any[]>([]);
  const [evidencePanelLoading,setEvidencePanelLoading]= useState(false);
  const [panelUploading,      setPanelUploading]      = useState(false);
  const [panelUploadError,    setPanelUploadError]    = useState<string|null>(null);
  const panelFileRef = useRef<HTMLInputElement>(null);
  const [collectingNow,       setCollectingNow]       = useState(false);
  const [evFilter,            setEvFilter]            = useState<string>("all");
  const [evSearch,            setEvSearch]            = useState<string>("");
  const [exportingCtrl,       setExportingCtrl]       = useState<string|null>(null);
  const [bulkExporting,       setBulkExporting]       = useState(false);
  const [bulkExportFw,        setBulkExportFw]        = useState<string>("all");

  const evSummaryMap = useMemo<Map<number, any>>(() => {
    if (!evidenceSummary?.controls) return new Map();
    return new Map(evidenceSummary.controls.map((c: any) => [c.controlId, c]));
  }, [evidenceSummary]);

  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch("/api/audit/programs", { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && d.length > 0 && setDbAudits(d.map((a: any) => ({ id: a.id, name: a.name, framework: a.framework ?? "", type: a.auditType ?? a.type ?? "Internal", auditor: a.auditor ?? "", scheduled: a.scheduledAt ?? a.scheduled ?? "", status: a.status, scope: a.scope ?? "", findings: Number(a.findingsCount) || 0 })))).catch(() => {});
    // gaps + maturity are fetched in the framework-aware effect below
    fetch("/api/audit/evidence", { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && d.length > 0 && setDbEvidence(d.map((e: any) => ({ id: e.id ?? `EVD-${e.evidenceId}`, control: e.controlRef ?? e.controlId ?? "", name: e.name ?? e.title ?? "", type: e.fileType ?? e.type ?? "Document", uploaded: e.collectedAt?.slice(0, 10) ?? "—", by: e.collectedBy ?? "—", size: "—", status: e.status ?? "accepted" })))).catch(() => {});
    fetch("/api/audit/findings", { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && setDbFindings(d)).catch(() => {});
    fetch("/api/audit/evidence", { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && setDbEvidenceReqs(d)).catch(() => {});
    fetch("/api/evidence/summary", { headers: H }).then(r => r.json()).then(d => d && setEvidenceSummary(d)).catch(() => {});
  }, []);

  // ── Evidence helpers ──────────────────────────────────────────────────────────
  // ── Clear stale scoped data when framework scope changes (prevents stale data display) ──
  useEffect(() => {
    setDbGaps([]);
    setDbMaturity([]);
  }, [frameworkIds, isViewingOwnTenant]);

  // ── Framework-scoped gaps + maturity fetch (fires once frameworks are loaded) ──
  useEffect(() => {
    if (!tenantFrameworksLoaded) return;
    // Deny-by-default: skip fetch when not on own tenant and no licensed frameworks
    if (!isViewingOwnTenant && frameworkIds.length === 0) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    // Pass frameworkIds from LicenseContext — ID-based gating enforced on the backend
    const qs = frameworkIds.length > 0 ? `?frameworkIds=${frameworkIds.join(",")}` : "";
    fetch(`/api/compliance/gaps${qs}`, { headers: H })
      .then(r => r.json())
      .then(d => Array.isArray(d) && d.length > 0 && setDbGaps(d.map((g: any) => {
        const impl = Number(g.implemented) || 0, part = Number(g.partial) || 0, ns = Number(g.notStarted) || 0;
        const total = Number(g.totalControls) || (impl + part + ns) || 0;
        const pct   = Number(g.pct) || (total > 0 ? Math.round((impl / total) * 100) : 0);
        return { framework: g.framework, total, implemented: impl, partial: part, notStarted: ns, pct };
      }))).catch(() => {});
    fetch(`/api/compliance/maturity${qs}`, { headers: H })
      .then(r => r.json())
      .then(d => Array.isArray(d) && d.length > 0 && setDbMaturity(d.map((m: any) => ({ domain: m.domain, score: Number(m.score) || 0, prev: Number(m.prev) || Number(m.prevScore) || 0, target: Number(m.target) || Number(m.targetScore) || 0, controls: Number(m.controls) || 0, implemented: Number(m.implemented) || 0 })))).catch(() => {});
  }, [tenantFrameworksLoaded, frameworkIds]);

  const evStatusColor = (s: string) =>
    s === "fresh"   ? "#10B981" :
    s === "stale"   ? "#F59E0B" :
    s === "failed"  ? "#DC2626" : "#6B7280";
  const evStatusLabel = (s: string) =>
    s === "fresh"   ? "✓ Collected" :
    s === "stale"   ? "⚠ Stale"    :
    s === "failed"  ? "✕ Failed"   : "— Missing";

  async function openEvidencePanel(ctrl: any) {
    const ctrlDbId = typeof ctrl.dbId === "number" ? ctrl.dbId : ctrl.id;
    setEvidencePanelCtrl(ctrl);
    setEvidencePanelLoading(true);
    setEvidencePanelItems([]);
    try {
      const token = localStorage.getItem("grc_token");
      const H = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/evidence/${ctrlDbId}`, { headers: H as any });
      const data = await res.json();
      setEvidencePanelItems(Array.isArray(data) ? data : []);
    } catch { setEvidencePanelItems([]); }
    finally  { setEvidencePanelLoading(false); }
  }

  async function handleCollectNow() {
    const token = localStorage.getItem("grc_token");
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    setCollectingNow(true);
    try {
      await fetch("/api/evidence/collect", { method: "POST", headers: H as any });
      const res = await fetch("/api/evidence/summary", { headers: H as any });
      const d = await res.json();
      if (d) setEvidenceSummary(d);
    } finally { setCollectingNow(false); }
  }

  async function handlePanelFileUpload(file: File) {
    if (!evidencePanelCtrl || !file) return;
    setPanelUploading(true);
    setPanelUploadError(null);
    try {
      const token = localStorage.getItem("grc_token");
      const ctrlDbId = typeof evidencePanelCtrl.dbId === "number" ? evidencePanelCtrl.dbId : evidencePanelCtrl.id;
      const form = new FormData();
      form.append("file",        file);
      form.append("controlDbId", String(ctrlDbId));
      form.append("controlRef",  evidencePanelCtrl.id ?? "");
      form.append("evidenceType","Manual Upload");
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${res.status})`);
      }
      // Refresh panel items
      const evRes = await fetch(`/api/evidence/${ctrlDbId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await evRes.json();
      setEvidencePanelItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setPanelUploadError(e.message ?? "Upload failed");
    } finally {
      setPanelUploading(false);
      if (panelFileRef.current) panelFileRef.current.value = "";
    }
  }

  async function handleExportSingle(format: "pdf" | "zip") {
    if (!evidencePanelCtrl) return;
    const ctrlDbId = typeof evidencePanelCtrl.dbId === "number" ? evidencePanelCtrl.dbId : evidencePanelCtrl.id;
    const key = `${ctrlDbId}-${format}`;
    setExportingCtrl(key);
    try {
      const token = localStorage.getItem("grc_token");
      const H = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`/api/evidence/${ctrlDbId}/export?format=${format}`, { headers: H as any });
      if (!resp.ok) { alert("Export failed — no evidence data yet."); return; }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      const safeRef = (evidencePanelCtrl.id ?? String(ctrlDbId)).replace(/[^a-z0-9._-]/gi, "_");
      a.download = `evidence_${safeRef}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setExportingCtrl(null); }
  }

  async function handleBulkExport(format: "pdf" | "zip") {
    setBulkExporting(true);
    try {
      const token = localStorage.getItem("grc_token");
      const H = token ? { Authorization: `Bearer ${token}` } : {};
      const fwParam = bulkExportFw !== "all" ? `&framework=${encodeURIComponent(bulkExportFw)}` : "";
      const resp = await fetch(`/api/evidence/bulk-export?format=${format}${fwParam}`, { headers: H as any });
      if (!resp.ok) { alert("Bulk export failed — collect evidence first."); return; }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      const safefw = (bulkExportFw !== "all" ? bulkExportFw : "all_frameworks").replace(/[^a-z0-9._-]/gi, "_");
      a.download = `evidence_pack_${safefw}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setBulkExporting(false); }
  }

  // Frameworks are strictly sourced from the library assignments (tenantFrameworks).
  // allFrameworks is no longer used for rendering — only API-assigned frameworks are shown.
  // Only licensed frameworks (per isFrameworkLicensed) are exposed for selection and reporting.
  const assignedFws = useMemo(() => {
    if (!tenantFrameworks || tenantFrameworks.length === 0) return [];
    return tenantFrameworks
      .filter((fw: any) => isFrameworkLicensed(fw.libraryId ?? 0))
      .map((fw: any) => ({
        id:          fw.shortCode ?? fw.id,
        name:        fw.name,
        category:    fw.category,
        region:      fw.region ?? "Global",
        year:        fw.version ?? "",
        description: fw.description ?? "",
        controls:    fw.controlsCount ?? 0,
        implemented: fw.implemented ?? 0,
        partial:     fw.partial ?? 0,
        pct:         fw.pct ?? 0,
        color:       fw.color ?? "#3B82F6",
        owner:       fw.assignedBy ?? "",
        tags:        [],
      }));
  }, [tenantFrameworks, isFrameworkLicensed]);

  const assignedFwNames = useMemo(() => new Set(assignedFws.map((fw: any) => fw.name as string)), [assignedFws]);

  // Deny-by-default: when no licensed frameworks and not isViewingOwnTenant, always return empty lists
  const noFrameworkAccess = !isViewingOwnTenant && assignedFwNames.size === 0;
  const lAudits   = noFrameworkAccess ? [] : dbAudits
    .filter((a: any) => assignedFwNames.size === 0 || !a.framework || assignedFwNames.has(a.framework));
  const lGaps     = noFrameworkAccess ? [] : dbGaps
    .filter((g: any) => assignedFwNames.size === 0 || assignedFwNames.has(g.framework));
  const lEvidence = noFrameworkAccess ? [] : dbEvidence
    .filter((e: any) => assignedFwNames.size === 0 || !e.framework || assignedFwNames.has(e.framework));

  const lMaturity  = dbMaturity;
  const lCtrls     = (apiCtrls && apiCtrls.length > 0)
    ? apiCtrls.map((c: any) => ({ id: c.controlId ?? c.id, dbId: c.id, framework: c.framework ?? "", domain: c.domain ?? "", name: c.name ?? "", status: c.status, owner: c.owner ?? "", evidence: Number(c.evidence) || 0, dueDate: c.dueDate ?? "" }))
    : [];

  const allAudits  = useMemo(() => [
    ...localAudits,
    ...lAudits.filter(a => !deletedIds.has(String(a.id))),
  ].map(a => ({ ...a, status: statusOvr[String(a.id)] ?? a.status })),
  [localAudits, lAudits, deletedIds, statusOvr]);

  const [fwSearch, setFwSearch]     = useState("");
  const [fwCat, setFwCat]           = useState<typeof FW_CATEGORIES[number]>("All");
  const [fwRegion, setFwRegion]     = useState<typeof FW_REGIONS[number]>("All");

  // ── Interactivity state ──────────────────────────────────────────────────────
  const [expandedGap,          setExpandedGap]          = useState<string | null>(null);
  const [selectedMaturityDomain, setSelectedMaturityDomain] = useState<string | null>(null);

  const filteredFws = useMemo(() => assignedFws.filter(fw => {
    const cat = fwCategory(fw.category);
    if (fwCat !== "All" && cat !== fwCat) return false;
    if (fwRegion !== "All") {
      if      (fwRegion === "APAC") { if (!APAC_SET.has(fw.region)) return false; }
      else if (fwRegion === "GCC")  { if (!GCC_SET.has(fw.region))  return false; }
      else                          { if (fw.region !== fwRegion)   return false; }
    }
    if (fwSearch) {
      const q = fwSearch.toLowerCase();
      if (!fw.name.toLowerCase().includes(q) && !fw.category.toLowerCase().includes(q) && !fw.region.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [assignedFws, fwSearch, fwCat, fwRegion]);

  const tabs = [
    { key: "overview",        label: "Overview" },
    { key: "packs",           label: "📦 Compliance Packs", dot: "#3B82F6" },
    { key: "frameworks",      label: "Frameworks",       count: tenantFrameworks !== null ? tenantFrameworks.length : 0 },
    { key: "audits",          label: "Audit Management", count: allAudits.length, dot: "#D97706" },
    { key: "evidence",        label: "Evidence Engine", dot: "#059669" },
    { key: "questionnaires",  label: "📋 Questionnaires", dot: "#8B5CF6" },
    { key: "gaps",            label: "Gap Analysis",     dot: "#DC2626" },
    { key: "maturity",        label: "Maturity Model",   dot: "#059669" },
    { key: "workflow",        label: "⚡ Workflow",       dot: "#6366F1" },
  ];

  const overallMaturity = (lMaturity.reduce((s, d) => s + d.score, 0) / Math.max(lMaturity.length, 1)).toFixed(1);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ModuleHeader
        title="ComplianceOps — Compliance Management"
        description="Frameworks · Audit Management · Evidence Engine · Gap Analysis · Maturity Model"
        action={{ label: "+ Schedule Audit", onClick: () => {} }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />
      <AICopilotBar module="complianceops" />
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── COMPLIANCE PACKS ─────────────────────────────────────────────── */}
        {tab === "packs" && (() => {
          const packs = [
            { id:"iso27001", name:"ISO/IEC 27001:2022", tagline:"Information Security Management System", color:"#3B82F6", icon:"🛡", controls:93, weeks:16, region:"Global",       flag:"🌐" },
            { id:"soc2",     name:"SOC 2 (AICPA TSC)",  tagline:"Trust Services Criteria — Type 1 & 2",   color:"#8B5CF6", icon:"🔐", controls:64, weeks:24, region:"USA",          flag:"🇺🇸" },
            { id:"rbi",      name:"RBI Cybersecurity Framework", tagline:"RBI Master Directions — Regulated Entities", color:"#F59E0B", icon:"🏛", controls:81, weeks:20, region:"India", flag:"🇮🇳" },
            { id:"sebi",     name:"SEBI CSCRF",          tagline:"Cybersecurity & Cyber Resilience Framework", color:"#10B981", icon:"📈", controls:72, weeks:18, region:"India",    flag:"🇮🇳" },
            { id:"iso42001", name:"ISO/IEC 42001:2023",  tagline:"AI Management System (AIMS)",           color:"#EC4899", icon:"🤖", controls:38, weeks:20, region:"Global",       flag:"🌐" },
          ];
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                <div style={{ fontSize:16, fontWeight:900, color:"rgb(147,197,253)", marginBottom:6 }}>📦 Compliance Packs</div>
                <div style={{ fontSize:13, color:"rgb(148,163,184)", maxWidth:700 }}>Enterprise-grade implementation kits — from planning to certification. Each pack includes policies, controls, SOPs, audit checklists, evidence requirements, gap assessment, RACI matrix, SOA, and timeline.</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:14 }}>
                {packs.map(p => (
                  <div key={p.id} onClick={() => navigate(`/complianceops/packs/${p.id}`)}
                    style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 22px", cursor:"pointer", position:"relative", overflow:"hidden", transition:"border-color 0.15s" }}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor=`${p.color}66`)}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}
                  >
                    <div style={{ position:"absolute", top:0, left:0, width:4, height:"100%", background:p.color, borderRadius:"14px 0 0 14px" }}/>
                    <div style={{ paddingLeft:8 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                        <span style={{ fontSize:22 }}>{p.icon}</span>
                        <span style={{ fontSize:11, fontWeight:700, background:"var(--border)", borderRadius:6, padding:"2px 8px", color:"var(--foreground)", display:"flex", alignItems:"center", gap:5 }}>
                          <span>{p.flag}</span><span>{p.region}</span>
                        </span>
                      </div>
                      <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>{p.name}</div>
                      <div style={{ fontSize:11, color:"rgb(148,163,184)", marginBottom:14, lineHeight:1.5 }}>{p.tagline}</div>
                      <div style={{ display:"flex", gap:14 }}>
                        <span style={{ fontSize:11, color:"rgb(148,163,184)" }}>🛡 {p.controls} controls</span>
                        <span style={{ fontSize:11, color:"rgb(148,163,184)" }}>⏱ {p.weeks} weeks</span>
                      </div>
                      <div style={{ marginTop:14, display:"flex", alignItems:"center", gap:6, fontSize:12, color:p.color, fontWeight:700 }}>Open Pack →</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"rgb(147,197,253)", marginBottom:12 }}>Each pack contains</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:10 }}>
                  {[["🗺","Implementation Guide"],["📋","Policy Library"],["⚙️","Controls & SOPs"],["✅","Audit Checklist"],["🗂","Evidence Requirements"],["📊","Gap Assessment"],["📑","SOA / RACI Matrix"],["📅","Implementation Timeline"],["📁","Document Library"],["⚡","Automation Capabilities"]].map(([icon,label]) => (
                    <div key={label} style={{ display:"flex", gap:8, alignItems:"center", fontSize:12, color:"rgb(148,163,184)" }}>
                      <span style={{ fontSize:16 }}>{icon}</span> {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (() => {
          const overallPct = lGaps.length > 0 ? Math.round(lGaps.reduce((s, g) => s + g.pct, 0) / lGaps.length) : 0;
          const criticalGaps = lGaps.filter(g => g.pct < 50).length;
          const activeAudits = lAudits.filter(a => a.status === "in-progress").length;
          const missingEvidence = lEvidence.filter(e => e.status === "missing").length;
          const ganttStart = new Date("2024-01-01").getTime();
          const ganttEnd   = new Date("2025-01-01").getTime();
          const ganttPct = (d: string) => Math.max(2, Math.min(95, ((new Date(d).getTime() - ganttStart) / (ganttEnd - ganttStart)) * 100));
          const auditStatusColor: Record<string,string> = { scheduled: "#1E3A5F", "in-progress": "#D97706", completed: "#065F46", planned: "var(--muted-foreground)" };
          const quarterLabels = ["Jan", "Apr", "Jul", "Oct"];

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {([
                  { label: "Overall Compliance",  value: `${overallPct}%`,                sub: "Avg across all frameworks",     color: overallPct >= 75 ? "#065F46" : "#D97706", tab: "frameworks" },
                  { label: "Frameworks Tracked",  value: tenantFrameworks !== null ? String(tenantFrameworks.length) : "—",    sub: "Library-assigned frameworks",  color: "#1E3A5F",                                tab: "frameworks" },
                  { label: "Active Audits",        value: String(activeAudits),            sub: `${lAudits.length - activeAudits} scheduled / planned`, color: "#D97706",         tab: "audits"     },
                  { label: "Critical Gaps",        value: String(criticalGaps),            sub: "Frameworks below 50%",          color: criticalGaps > 0 ? "#DC2626" : "#065F46", tab: "gaps"       },
                  { label: "Missing Evidence",     value: String(missingEvidence),         sub: `${lEvidence.length - missingEvidence} evidence items OK`, color: missingEvidence > 0 ? "#DC2626" : "#065F46", tab: "evidence" },
                ] as { label: string; value: string; sub: string; color: string; tab: string }[]).map(k => (
                  <div key={k.label} onClick={() => setTab(k.tab)} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color, marginBottom: 4 }}>{k.value}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>{k.label}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Framework progress + Audit Gantt */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>
                {/* Framework compliance */}
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 16 }}>Compliance by Framework</div>
                  {lGaps.map(g => (
                    <div key={g.framework} onClick={() => setTab("frameworks")} onMouseEnter={e => (e.currentTarget.style.background = "rgba(147,197,253,0.04)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ marginBottom: 14, cursor: "pointer", borderRadius: 6, padding: "2px 4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{g.framework}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{g.implemented}/{g.total}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 13, color: g.pct < 50 ? "#DC2626" : g.pct < 75 ? "#D97706" : "#065F46" }}>{g.pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: "var(--input)", overflow: "hidden", display: "flex" }}>
                        <div style={{ height: "100%", background: "#065F46", width: `${Math.round((g.implemented / g.total) * 100)}%`, transition: "width 0.4s" }} />
                        <div style={{ height: "100%", background: "#FDE68A", width: `${Math.round((g.partial / g.total) * 100)}%` }} />
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 9, color: "var(--muted-foreground)" }}>
                        <span style={{ color: "#065F46" }}>● {g.implemented} implemented</span>
                        <span style={{ color: "#D97706" }}>● {g.partial} partial</span>
                        <span style={{ color: "#DC2626" }}>● {g.notStarted} gap</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Audit Gantt */}
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Audit Schedule — 2024</div>
                  {/* Quarter labels */}
                  <div style={{ display: "flex", paddingLeft: 200, marginBottom: 6 }}>
                    {quarterLabels.map((q, i) => (
                      <div key={q} style={{ position: "relative", left: `${i * 25}%`, fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600, width: "25%" }}>{q}</div>
                    ))}
                  </div>
                  {/* Quarter dividers behind rows */}
                  {lAudits.map(a => (
                    <div key={a.id} onClick={() => setTab("audits")} onMouseEnter={e => (e.currentTarget.style.background = "rgba(147,197,253,0.04)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, cursor: "pointer", borderRadius: 4 }}>
                      <div style={{ width: 192, fontSize: 10, color: "var(--foreground)", fontWeight: 500, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, paddingRight: 8 }}>{a.name}</div>
                      <div style={{ flex: 1, height: 22, background: "var(--secondary)", borderRadius: 4, position: "relative" as const, overflow: "hidden" }}>
                        {/* quarter grid */}
                        {[25,50,75].map(p => <div key={p} style={{ position: "absolute", left: `${p}%`, top: 0, width: 1, height: "100%", background: "rgba(148,163,184,0.2)" }} />)}
                        <div style={{
                          position: "absolute", top: 3, bottom: 3,
                          left: `${ganttPct(a.scheduled)}%`,
                          width: "16%",
                          background: auditStatusColor[a.status] ?? "var(--muted-foreground)",
                          borderRadius: 4,
                          display: "flex", alignItems: "center", paddingLeft: 6, gap: 4,
                          minWidth: 44,
                        }}>
                          <span style={{ fontSize: 8, color: "white", fontWeight: 700, whiteSpace: "nowrap" as const }}>{a.type[0]}</span>
                          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" as const }}>{a.scheduled.slice(5)}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: auditStatusColor[a.status], flexShrink: 0, width: 68, textTransform: "uppercase" as const }}>{a.status}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10 }}>
                    {(["scheduled","in-progress","completed","planned"] as const).map(s => (
                      <span key={s} style={{ display: "flex", alignItems: "center", gap: 4, color: "#6B7280" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: auditStatusColor[s], display: "inline-block" }} />{s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top control gaps */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Top Control Gaps by Domain</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {lMaturity.filter(d => d.implemented < d.controls).slice(0, 8).map(d => {
                    const gap = d.controls - d.implemented;
                    const pct = Math.round((d.implemented / d.controls) * 100);
                    return (
                      <div key={d.domain} style={{ background: "var(--secondary)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>{d.domain}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: MATURITY_COLORS[d.score] }}>{MATURITY_LABELS[d.score]}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: "rgb(23,30,42)", overflow: "hidden", marginBottom: 6 }}>
                          <div style={{ height: "100%", borderRadius: 4, background: MATURITY_COLORS[d.score], width: `${pct}%` }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-foreground)" }}>
                          <span>{d.implemented}/{d.controls} controls</span>
                          <span style={{ color: gap > 3 ? "#DC2626" : "#D97706", fontWeight: 700 }}>{gap} gap{gap !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Cloud Security Posture bridge ────────────────────────────── */}
              {viewTenantId === 1 && (() => {
                const CLOUD_FW_ROWS = [
                  { fw:"CIS AWS v3.0",    provider:"AWS",   color:"#FF9900", score:71, critical:8,  high:4,  total:56 },
                  { fw:"CIS Azure v2.0",  provider:"Azure", color:"#0078D4", score:68, critical:4,  high:10, total:57 },
                  { fw:"CIS GCP v2.0",    provider:"GCP",   color:"#4285F4", score:74, critical:3,  high:8,  total:58 },
                  { fw:"PCI DSS v4.0",    provider:"All",   color:"#8B5CF6", score:80, critical:2,  high:6,  total:59 },
                  { fw:"SOC 2 Type II",   provider:"All",   color:"#EC4899", score:82, critical:1,  high:7,  total:60 },
                  { fw:"NIST CSF v1.1",   provider:"All",   color:"#10B981", score:76, critical:3,  high:11, total:75 },
                  { fw:"ISO 27001:2022",  provider:"All",   color:"#F59E0B", score:83, critical:1,  high:8,  total:70 },
                  { fw:"AWS Well-Arch",   provider:"AWS",   color:"#EF4444", score:69, critical:5,  high:14, total:75 },
                ];
                const totalCritical = CLOUD_FW_ROWS.reduce((s,r) => s + r.critical, 0);
                const avgScore = Math.round(CLOUD_FW_ROWS.reduce((s,r) => s + r.score, 0) / CLOUD_FW_ROWS.length);
                return (
                  <div style={{ background:"var(--card)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:18 }}>☁</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:"rgb(147,197,253)" }}>Cloud Security Posture · Framework Coverage</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>
                            Live data from CloudOps · {totalCritical} critical violations across {CLOUD_FW_ROWS.length} frameworks · Avg score {avgScore}%
                          </div>
                        </div>
                      </div>
                      <a href="/grc-platform/cloudops"
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8,
                          background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)",
                          color:"rgb(147,197,253)", fontSize:11, fontWeight:700, cursor:"pointer", textDecoration:"none" }}>
                        Open Cloud Compliance →
                      </a>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                      {CLOUD_FW_ROWS.map(r => {
                        const scoreColor = r.score >= 80 ? "#34D399" : r.score >= 70 ? "#FCD34D" : "#F87171";
                        return (
                          <div key={r.fw} style={{ background:"var(--secondary)", borderRadius:10, padding:"12px 13px",
                            border:`1px solid ${r.score < 75 ? "rgba(248,113,113,0.2)" : "var(--border)"}` }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", whiteSpace:"nowrap" as const,
                                overflow:"hidden", textOverflow:"ellipsis", maxWidth:90 }}>{r.fw}</span>
                              <span style={{ fontSize:10, fontWeight:900, color:scoreColor,
                                fontFamily:"'JetBrains Mono',monospace" }}>{r.score}%</span>
                            </div>
                            <div style={{ height:5, borderRadius:4, background:"rgb(23,30,42)", overflow:"hidden", marginBottom:7 }}>
                              <div style={{ height:"100%", borderRadius:4, background:r.color, width:`${r.score}%`, opacity:0.85 }} />
                            </div>
                            <div style={{ display:"flex", gap:8, fontSize:9 }}>
                              <span style={{ color:"#F87171", fontWeight:700 }}>⚡ {r.critical} critical</span>
                              <span style={{ color:"#FCD34D" }}>{r.high} high</span>
                              <span style={{ color:"var(--muted-foreground)", marginLeft:"auto" }}>{r.provider}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            </div>
          );
        })()}

        {/* ── FRAMEWORKS ────────────────────────────────────────────────────── */}
        {tab === "frameworks" && (() => {
          /* ── DETAIL VIEW ──────────────────────────────────────────────────── */
          if (selectedFw) {
            const meta = FW_DETAIL_META[selectedFw.name] ?? {};
            const pctColor = selectedFw.pct >= 75 ? "#10B981" : selectedFw.pct >= 50 ? "#F59E0B" : selectedFw.pct > 0 ? "#EF4444" : "#6B7280";
            const cat = fwCategory(selectedFw.category);
            const FW_DETAIL_TABS = ["Overview","Implementation","Policy Library","Controls & SOPs","Audit Checklist","Evidence Req.","Gap Assessment","SOA / RAC"];
            const catColors: Record<string,string> = { Security:"#3B82F6", Privacy:"#8B5CF6", Financial:"#F59E0B", Healthcare:"#10B981", Government:"#6366F1", Cloud:"#0EA5E9", AppSec:"#EC4899", "AI/Emerging":"#A855F7", Operational:"#F97316" };
            const catBg: Record<string,string> = { Security:"rgba(59,130,246,0.12)", Privacy:"rgba(139,92,246,0.12)", Financial:"rgba(245,158,11,0.12)", Healthcare:"rgba(16,185,129,0.12)", Government:"rgba(99,102,241,0.12)", Cloud:"rgba(14,165,233,0.12)", AppSec:"rgba(236,72,153,0.12)", "AI/Emerging":"rgba(168,85,247,0.12)", Operational:"rgba(249,115,22,0.12)" };
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:0, minHeight:0 }}>
                {/* Breadcrumb */}
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--muted-foreground)", marginBottom:16, flexWrap:"wrap" }}>
                  <span style={{ cursor:"pointer", color:"rgb(147,197,253)" }} onClick={() => setSelectedFw(null)}>ComplianceOps</span>
                  <span>›</span>
                  <span style={{ cursor:"pointer", color:"rgb(147,197,253)" }} onClick={() => setSelectedFw(null)}>Compliance Packs</span>
                  <span>›</span>
                  <span style={{ color:"var(--foreground)", fontWeight:600 }}>{selectedFw.name}</span>
                </div>

                {/* Header card */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"24px 28px", marginBottom:16 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      {/* Badges */}
                      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, fontWeight:800, color: catColors[cat] ?? "#3B82F6", background: catBg[cat] ?? "rgba(59,130,246,0.12)", border:`1px solid ${catColors[cat] ?? "#3B82F6"}33`, borderRadius:4, padding:"2px 8px", textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:"#94A3B8", background:"rgba(148,163,184,0.1)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:4, padding:"2px 8px" }}>v{selectedFw.year || "2022"}</span>
                        <span style={{ fontSize:10, fontWeight:600, color:"var(--muted-foreground)", background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 8px", display:"inline-flex", alignItems:"center", gap:3 }}>{REGION_FLAGS[selectedFw.region] ?? "🌐"} {selectedFw.region}</span>
                      </div>
                      {/* Icon + title */}
                      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:6 }}>
                        <div style={{ fontSize:32, width:48, height:48, background:`${selectedFw.color}18`, border:`1px solid ${selectedFw.color}44`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{meta.icon ?? "📋"}</div>
                        <div>
                          <div style={{ fontSize:22, fontWeight:900, color:"var(--foreground)", lineHeight:1.2 }}>{meta.fullName ?? selectedFw.name}</div>
                          <div style={{ fontSize:12, color:"var(--muted-foreground)", marginTop:4 }}>{meta.subtitle ?? selectedFw.description}</div>
                        </div>
                      </div>
                    </div>
                    {/* Stats */}
                    <div style={{ display:"flex", gap:1, flexShrink:0 }}>
                      {[
                        { v: selectedFw.controls, label:"Controls" },
                        { v: meta.policies ?? "—", label:"Policies" },
                        { v: meta.weeks ? `${meta.weeks}w` : "—", label:"Duration" },
                      ].map((s,i) => (
                        <div key={i} style={{ textAlign:"center", padding:"12px 20px", background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)", borderRadius: i===0 ? "10px 0 0 10px" : i===2 ? "0 10px 10px 0" : 0, minWidth:72 }}>
                          <div style={{ fontSize:22, fontWeight:900, color:"var(--foreground)" }}>{s.v}</div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:600, marginTop:2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop:16, display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, height:6, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${selectedFw.pct}%`, background:`linear-gradient(90deg, ${selectedFw.color}, ${pctColor})`, borderRadius:3, transition:"width 0.6s ease" }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:pctColor, minWidth:32 }}>{selectedFw.pct}%</span>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{selectedFw.implemented} implemented · {selectedFw.partial} partial · {selectedFw.controls - selectedFw.implemented - selectedFw.partial} not started</span>
                  </div>
                </div>

                {/* Sub-tab nav */}
                <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:20, overflowX:"auto" }}>
                  {FW_DETAIL_TABS.map(t => (
                    <button key={t} onClick={() => setFwDetailTab(t)}
                      style={{ padding:"10px 16px", fontSize:12, fontWeight:fwDetailTab===t?700:500, color:fwDetailTab===t?"var(--foreground)":"var(--muted-foreground)", background:"transparent", border:"none", borderBottom:fwDetailTab===t?`2px solid ${selectedFw.color}`:"2px solid transparent", cursor:"pointer", whiteSpace:"nowrap", transition:"color 0.15s" }}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
                {fwDetailTab === "Overview" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    {/* Certification / Compliance Path */}
                    {meta.certPath && (
                      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                        <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase", marginBottom:20 }}>Certification / Compliance Path</div>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:0, overflowX:"auto", paddingBottom:4 }}>
                          {meta.certPath.map((step: any, i: number) => (
                            <div key={i} style={{ display:"flex", alignItems:"flex-start", flex:1, minWidth:120 }}>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1 }}>
                                {/* Circle + connector */}
                                <div style={{ display:"flex", alignItems:"center", width:"100%", marginBottom:12 }}>
                                  {i > 0 && <div style={{ flex:1, height:1, background:`${selectedFw.color}44` }} />}
                                  <div style={{ width:36, height:36, borderRadius:"50%", border:`2px solid ${selectedFw.color}`, background:`${selectedFw.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:selectedFw.color, flexShrink:0 }}>{step.n}</div>
                                  {i < meta.certPath.length - 1 && <div style={{ flex:1, height:1, background:`${selectedFw.color}44` }} />}
                                </div>
                                {/* Label + time */}
                                <div style={{ textAlign:"center", paddingInline:4 }}>
                                  <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", lineHeight:1.4, marginBottom:4 }}>{step.label}</div>
                                  <div style={{ fontSize:9, color:"var(--muted-foreground)", lineHeight:1.4 }}>{step.time}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pack Summary + Audit Types (2-col) */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      {/* Pack Summary */}
                      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                        <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase", marginBottom:16 }}>Pack Summary</div>
                        <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                          <tbody>
                            {[
                              ["Framework",           meta.fullName ?? selectedFw.name],
                              ["Version",             selectedFw.year || "Latest"],
                              ["Category",            cat],
                              ["Certification Body",  meta.certBody ?? "—"],
                              ["Implementation Duration", meta.weeks ? `${meta.weeks} weeks` : "—"],
                              ["Controls in Scope",   selectedFw.controls],
                              ["Required Policies",   meta.policies ?? "—"],
                              ["Procedures / SOPs",   meta.sops ?? "—"],
                              ["Core Registers",      meta.registers ?? (meta.coreRegisters?.length ?? "—")],
                            ].map(([k, v]) => (
                              <tr key={k as string} style={{ borderBottom:"1px solid var(--border)" }}>
                                <td style={{ padding:"8px 0", color:"var(--muted-foreground)", fontWeight:500, width:"45%", fontSize:11 }}>{k}</td>
                                <td style={{ padding:"8px 0", color:"var(--foreground)", fontWeight:600, fontSize:11 }}>{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Audit Types */}
                      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px", display:"flex", flexDirection:"column" as const, gap:16 }}>
                        <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase" }}>Audit Types</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          {(meta.auditTypes ?? []).map((at: any) => (
                            <div key={at.name} onClick={() => setExpandedAuditType(expandedAuditType === at.name ? null : at.name)}
                              style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", cursor:"pointer" }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"rgba(255,255,255,0.02)" }}>
                                <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)" }}>{at.name}</span>
                                <span style={{ fontSize:14, color:"var(--muted-foreground)", transform: expandedAuditType===at.name?"rotate(180deg)":"none", transition:"transform 0.2s" }}>›</span>
                              </div>
                              {expandedAuditType === at.name && (
                                <div style={{ padding:"10px 14px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6, background:"rgba(0,0,0,0.1)" }}>{at.desc}</div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Core Registers */}
                        {meta.coreRegisters && (
                          <div>
                            <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase", marginBottom:10 }}>Core Registers</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                              {meta.coreRegisters.map((r: string) => (
                                <span key={r} style={{ fontSize:10, fontWeight:600, color:"var(--foreground)", background:"rgba(255,255,255,0.06)", border:"1px solid var(--border)", borderRadius:6, padding:"4px 10px" }}>{r}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── IMPLEMENTATION TAB ───────────────────────────────────── */}
                {fwDetailTab === "Implementation" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {(meta.implSteps ?? []).map((phase: any, pi: number) => (
                      <div key={pi} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:`${selectedFw.color}20`, border:`2px solid ${selectedFw.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:selectedFw.color, flexShrink:0 }}>{pi+1}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{phase.phase}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {phase.items.map((item: string, ii: number) => (
                            <div key={ii} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                              <div style={{ width:18, height:18, borderRadius:4, border:`1px solid ${selectedFw.color}55`, background:`${selectedFw.color}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                                <div style={{ width:8, height:8, borderRadius:2, background:`${selectedFw.color}88` }} />
                              </div>
                              <span style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.5 }}>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── POLICY LIBRARY TAB ───────────────────────────────────── */}
                {fwDetailTab === "Policy Library" && (
                  <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                    <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase", marginBottom:16 }}>Required Policies — {meta.fullName ?? selectedFw.name}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                      {(Array.isArray(meta.policies) ? meta.policies : Array.from({length: typeof meta.policies === "number" ? meta.policies : 10}, (_,i) => `Policy ${i+1}`)).map((p: string, i: number) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
                          <div style={{ width:28, height:28, borderRadius:6, background:`${selectedFw.color}15`, border:`1px solid ${selectedFw.color}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:selectedFw.color, flexShrink:0 }}>{String(i+1).padStart(2,"0")}</div>
                          <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", flex:1 }}>{p}</span>
                          <span style={{ fontSize:9, color:"rgb(52,211,153)", fontWeight:700, background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:4, padding:"2px 7px" }}>REQUIRED</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── CONTROLS & SOPs TAB ──────────────────────────────────── */}
                {fwDetailTab === "Controls & SOPs" && (
                  <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"20px 24px" }}>
                    <div style={{ fontSize:11, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase", marginBottom:16 }}>Controls & Procedures — {selectedFw.controls} controls in scope</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {lCtrls.filter((c: any) => {
                        const a = (c.framework ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
                        const b = (selectedFw.name ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
                        return a.length > 2 && b.length > 2 && (a.includes(b.slice(0,5)) || b.includes(a.slice(0,5)));
                      }).slice(0,20).map((c: any) => {
                        const sc = { "implemented":"#10B981","partial":"#F59E0B","not-started":"#6B7280" }[c.status as string] ?? "#6B7280";
                        return (
                          <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid var(--border)", borderRadius:8 }}>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", minWidth:70 }}>{c.id}</span>
                            <span style={{ fontSize:12, color:"var(--foreground)", flex:1 }}>{c.name}</span>
                            <span style={{ fontSize:9, fontWeight:700, color:sc, background:`${sc}15`, border:`1px solid ${sc}33`, borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap" }}>{c.status ?? "—"}</span>
                          </div>
                        );
                      })}
                      {lCtrls.filter((c:any) => { const a=(c.framework??"").toLowerCase().replace(/[^a-z0-9]/g,""),b=(selectedFw.name??"").toLowerCase().replace(/[^a-z0-9]/g,"");return a.length>2&&b.length>2&&(a.includes(b.slice(0,5))||b.includes(a.slice(0,5)));}).length === 0 && (
                        <div style={{ textAlign:"center", padding:"32px", color:"var(--muted-foreground)", fontSize:13 }}>Controls data loading — visit the Controls tab for full details.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── OTHER TABS (stubs) ────────────────────────────────────── */}
                {["Audit Checklist","Evidence Req.","Gap Assessment","SOA / RAC"].includes(fwDetailTab) && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                    {fwDetailTab === "Audit Checklist" && [
                      { icon:"📋", title:"Pre-Audit Questionnaire", desc:"Complete self-assessment questionnaire covering all in-scope controls before the audit engagement begins.", status:"Ready" },
                      { icon:"🗂", title:"Document Collection Checklist", desc:"Compile policies, procedures, evidence logs, risk registers and prior audit reports required by the auditor.", status:"Ready" },
                      { icon:"🔍", title:"Technical Evidence Review", desc:"Verify technical control evidence including SIEM logs, access reviews, vulnerability scans and penetration test reports.", status:"Ready" },
                      { icon:"👥", title:"Control Walkthrough Schedule", desc:"Plan and schedule walkthroughs with control owners for each Annex A domain and audit area.", status:"Ready" },
                      { icon:"⚙️", title:"Design Effectiveness Testing", desc:"Test control design against stated objectives. Identify design gaps before operating effectiveness testing.", status:"Ready" },
                      { icon:"✅", title:"Operating Effectiveness Testing", desc:"Sample-based testing of control operation across the audit period. Confirm controls operated consistently.", status:"Ready" },
                    ].map((item,i) => (
                      <div key={i} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ fontSize:22 }}>{item.icon}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{item.title}</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6, flex:1 }}>{item.desc}</div>
                        <span style={{ fontSize:9, fontWeight:700, color:"rgb(147,197,253)", background:"rgba(59,130,246,0.1)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 8px", alignSelf:"flex-start" }}>{item.status}</span>
                      </div>
                    ))}
                    {fwDetailTab === "Evidence Req." && [
                      { icon:"🔐", title:"Access Control Evidence", desc:"Quarterly access reviews, IAM export showing all user accounts and roles, MFA enforcement screenshots, privileged access logs." },
                      { icon:"🛡", title:"Vulnerability Management Evidence", desc:"Quarterly vulnerability scan reports (internal + external), patch management reports, penetration test results." },
                      { icon:"📡", title:"Monitoring & Logging Evidence", desc:"SIEM configuration export, log retention policy, sample alert records, security incident log for the audit period." },
                      { icon:"📄", title:"Policy Evidence Pack", desc:"All required policies with version numbers, approval signatures, and last-reviewed dates within the audit period." },
                      { icon:"🔄", title:"Change Management Evidence", desc:"Change management log, CAB meeting minutes, emergency change records, and post-implementation review evidence." },
                      { icon:"🏥", title:"Incident Response Evidence", desc:"Incident register for the audit period, IR plan test records, tabletop exercise report, lessons-learned documentation." },
                    ].map((item,i) => (
                      <div key={i} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ fontSize:22 }}>{item.icon}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{item.title}</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6, flex:1 }}>{item.desc}</div>
                        <span style={{ fontSize:9, fontWeight:700, color:"#F59E0B", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:4, padding:"2px 8px", alignSelf:"flex-start" }}>COLLECT</span>
                      </div>
                    ))}
                    {fwDetailTab === "Gap Assessment" && [
                      { domain:"Access Control", controls: Math.ceil(selectedFw.controls*0.2), impl: Math.ceil(selectedFw.implemented*0.2), pct: selectedFw.pct },
                      { domain:"Risk Management", controls: Math.ceil(selectedFw.controls*0.15), impl: Math.ceil(selectedFw.implemented*0.15), pct: Math.max(0, selectedFw.pct-8) },
                      { domain:"Incident Response", controls: Math.ceil(selectedFw.controls*0.12), impl: Math.ceil(selectedFw.implemented*0.12), pct: Math.min(100, selectedFw.pct+5) },
                      { domain:"Data Protection", controls: Math.ceil(selectedFw.controls*0.18), impl: Math.ceil(selectedFw.implemented*0.18), pct: Math.max(0, selectedFw.pct-12) },
                      { domain:"Network Security", controls: Math.ceil(selectedFw.controls*0.14), impl: Math.ceil(selectedFw.implemented*0.14), pct: Math.max(0, selectedFw.pct-5) },
                      { domain:"Governance", controls: Math.ceil(selectedFw.controls*0.1), impl: Math.ceil(selectedFw.implemented*0.1), pct: Math.min(100, selectedFw.pct+10) },
                    ].map((row,i) => {
                      const gc = row.pct >= 75 ? "#10B981" : row.pct >= 50 ? "#F59E0B" : "#EF4444";
                      return (
                        <div key={i} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>{row.domain}</span>
                            <span style={{ fontSize:12, fontWeight:800, color:gc }}>{row.pct}%</span>
                          </div>
                          <div style={{ height:5, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                            <div style={{ height:"100%", width:`${row.pct}%`, background:gc, borderRadius:3 }} />
                          </div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{row.impl} of {row.controls} controls implemented</div>
                        </div>
                      );
                    })}
                    {fwDetailTab === "SOA / RAC" && [
                      { code:"6.1", title:"Policies for Information Security", applicable:true, justification:"Board-approved Information Security Policy and supporting policy suite in place.", implemented:true },
                      { code:"6.2", title:"Information Security Roles", applicable:true, justification:"CISO appointed. RACI matrix defined for all security roles and responsibilities.", implemented:true },
                      { code:"6.3", title:"Segregation of Duties", applicable:true, justification:"Role-based access control enforces segregation across all critical system functions.", implemented:selectedFw.pct>50 },
                      { code:"6.4", title:"Management Responsibilities", applicable:true, justification:"Management security responsibilities defined in employment contracts and job descriptions.", implemented:selectedFw.pct>40 },
                      { code:"8.1", title:"User Endpoint Devices", applicable:true, justification:"MDM policy deployed. All endpoints enrolled with EDR, disk encryption, and patch management.", implemented:selectedFw.pct>60 },
                      { code:"8.2", title:"Privileged Access Rights", applicable:true, justification:"PAM solution deployed. Just-in-time privileged access with full audit trail.", implemented:selectedFw.pct>70 },
                    ].map((row,i) => (
                      <div key={i} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{row.code}</span>
                          <div style={{ display:"flex", gap:5 }}>
                            <span style={{ fontSize:9, fontWeight:700, color: row.applicable?"#3B82F6":"#6B7280", background: row.applicable?"rgba(59,130,246,0.1)":"rgba(107,114,128,0.1)", border:`1px solid ${row.applicable?"rgba(59,130,246,0.25)":"rgba(107,114,128,0.25)"}`, borderRadius:4, padding:"1px 6px" }}>{row.applicable?"APPLICABLE":"N/A"}</span>
                            <span style={{ fontSize:9, fontWeight:700, color: row.implemented?"#10B981":"#F59E0B", background: row.implemented?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)", border:`1px solid ${row.implemented?"rgba(16,185,129,0.25)":"rgba(245,158,11,0.25)"}`, borderRadius:4, padding:"1px 6px" }}>{row.implemented?"IMPLEMENTED":"IN PROGRESS"}</span>
                          </div>
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>{row.title}</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.5 }}>{row.justification}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          /* ── GRID VIEW ──────────────────────────────────────────────────── */
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Empty state */}
              {tenantFrameworksLoaded && tenantFrameworks !== null && tenantFrameworks.length === 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "56px 32px", textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)", marginBottom: 8 }}>No Frameworks Assigned</div>
                  <div style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 440, margin: "0 auto 24px", lineHeight: 1.7 }}>
                    Your organisation hasn't been assigned any compliance frameworks yet.
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(147,197,253,0.08)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 8, padding: "10px 18px" }}>
                    <span style={{ fontSize: 12, color: "rgb(147,197,253)", fontWeight: 700 }}>Super Admin Portal → Frameworks → Assign to Tenant</span>
                  </div>
                </div>
              )}

              {tenantFrameworksLoaded && tenantFrameworks !== null && tenantFrameworks.length > 0 && (<>
                {/* Banner */}
                <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10, padding: "10px 16px", fontSize: 12, color: "rgb(52,211,153)", fontWeight: 600 }}>
                  ✓ {tenantFrameworks.length} frameworks assigned to this organisation — showing compliance tracking for all assigned frameworks below.
                </div>

                {/* Toolbar */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                  <input value={fwSearch} onChange={e => setFwSearch(e.target.value)} placeholder="Search frameworks…"
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, width: 240, fontFamily: "inherit", background: "var(--input)", color: "var(--foreground)" }}
                  />
                  <select value={fwRegion} onChange={e => setFwRegion(e.target.value as typeof FW_REGIONS[number])}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--input)", color: "var(--foreground)", fontFamily: "inherit", cursor: "pointer" }}>
                    {FW_REGIONS.map(r => <option key={r} value={r}>{r === "All" ? "🌍 All Regions" : `${REGION_FLAGS[r] ?? ""} ${r}`}</option>)}
                  </select>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF" }}>{filteredFws.length} of {tenantFrameworks.length} shown</span>
                </div>

                {/* Category pills */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  {FW_CATEGORIES.map(c => (
                    <button key={c} onClick={() => setFwCat(c)}
                      style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        background: fwCat === c ? "#1E3A5F" : "transparent",
                        color: fwCat === c ? "white" : "var(--muted-foreground)",
                        borderColor: fwCat === c ? "#1E3A5F" : "var(--border)" }}>
                      {c}
                    </button>
                  ))}
                </div>

                {/* Framework cards grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                  {filteredFws.map(fw => {
                    const pctColor = fw.pct >= 75 ? "#10B981" : fw.pct >= 50 ? "#F59E0B" : fw.pct > 0 ? "#EF4444" : "#6B7280";
                    const cat = fwCategory(fw.category);
                    const catBadgeColor: Record<string,string> = { Security:"#3B82F6", Privacy:"#8B5CF6", Financial:"#F59E0B", Healthcare:"#10B981", Government:"#6366F1", Cloud:"#0EA5E9", AppSec:"#EC4899", "AI/Emerging":"#A855F7", Operational:"#F97316" };
                    const cc = catBadgeColor[cat] ?? "#3B82F6";
                    return (
                      <div key={fw.id}
                        onClick={() => { setSelectedFw(fw); setFwDetailTab("Overview"); setExpandedAuditType(null); }}
                        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" as const, gap: 12,
                          cursor: "pointer", transition: "border-color 0.15s, transform 0.1s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${fw.color}88`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
                      >
                        {/* Top row: badges + ring */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" as const, marginBottom: 10 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, color: "#fff", background: fw.color, borderRadius: 4, padding: "2px 7px", letterSpacing:"0.03em" }}>{fw.id}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: cc, background: `${cc}18`, border: `1px solid ${cc}44`, borderRadius: 4, padding: "2px 7px" }}>{cat}</span>
                              <span style={{ fontSize: 9, fontWeight: 600, color: "var(--muted-foreground)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", display:"inline-flex", alignItems:"center", gap:2 }}>
                                {REGION_FLAGS[fw.region] ?? "🌐"} {fw.region}
                              </span>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.25 }}>{fw.name}</div>
                            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>{fw.category} · {fw.year}</div>
                          </div>
                          <RingChart pct={fw.pct} color={pctColor} size={56} />
                        </div>

                        {/* Description */}
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{fw.description}</div>

                        {/* Bottom: controls + badge */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>{fw.controls} controls</span>
                          <span style={{ fontSize: 9, color: "rgb(52,211,153)", fontWeight: 700, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 5, padding: "3px 8px", letterSpacing:"0.04em" }}>ASSIGNED</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>)}
            </div>
          );
        })()}

        {/* ── AUDIT MANAGEMENT ─────────────────────────────────────────────── */}
        {tab === "audits" && (() => {
          const PAGE_SIZE = 10;
          const sColor: Record<string,string> = { "in-progress":"#F59E0B","completed":"#10B981","scheduled":"#60A5FA","paused":"#94A3B8","suspended":"#EF4444","planned":"#94A3B8" };
          const sBg:    Record<string,string> = { "in-progress":"rgba(245,158,11,0.12)","completed":"rgba(16,185,129,0.1)","scheduled":"rgba(96,165,250,0.1)","paused":"rgba(148,163,184,0.1)","suspended":"rgba(239,68,68,0.1)","planned":"rgba(148,163,184,0.08)" };
          const completedAt: Record<string,number> = { planned:0,scheduled:0,"in-progress":5,paused:5,suspended:3,completed:19 };
          const sevColor: Record<string,string> = { Critical:"#EF4444",High:"#F59E0B",Medium:"#3B82F6",Low:"#10B981" };

          const normFw = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
          const matchesFw = (ctrlFw: string, auditFw: string) => {
            const a = normFw(ctrlFw), b = normFw(auditFw);
            if (a.length < 3 || b.length < 3) return false;
            return a.includes(b.slice(0,6)) || b.includes(a.slice(0,6)) || a.slice(0,5) === b.slice(0,5);
          };

          const doAction = (id:string, action:string) => {
            const ns: Record<string,string> = { pause:"paused", restart:"in-progress", suspend:"suspended", start:"in-progress" };
            const next = ns[action]; if (!next) return;
            if (localAudits.find(a=>String(a.id)===String(id))) setLocalAudits(p=>p.map(a=>String(a.id)===String(id)?{...a,status:next}:a));
            else setStatusOvr(p=>({...p,[String(id)]:next}));
            setAuditMenuId(null);
          };
          const doDelete = (id:string) => {
            if (localAudits.find(a=>String(a.id)===String(id))) setLocalAudits(p=>p.filter(a=>String(a.id)!==String(id)));
            else setDeletedIds(p=>new Set([...p,String(id)]));
            setDeleteTarget(null); setAuditMenuId(null);
            if (auditDetailId === id) setAuditDetailId(null);
          };

          /* ── pagination & filter ─────────────────────────────────────────── */
          const filteredAudits = auditFilter === "All" ? allAudits : allAudits.filter(a => a.status === auditFilter);
          const totalPages = Math.max(1, Math.ceil(filteredAudits.length / PAGE_SIZE));
          const pageAudits = filteredAudits.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

          /* ── detail panel data ───────────────────────────────────────────── */
          const det = auditDetailId ? allAudits.find(a => String(a.id) === auditDetailId) ?? null : null;
          const detFw = det?.framework ?? "";
          const fwCtrls = lCtrls.filter(c => matchesFw(c.framework, detFw));
          const fwGuideKey = (Object.keys(AUDIT_FW_GUIDANCE) as string[]).find(k => normFw(detFw).includes(normFw(k))) ?? "";
          const fwChecklist = AUDIT_FW_GUIDANCE[fwGuideKey] ?? [];
          const detFindings  = dbFindings.filter(f => f.auditId === auditDetailId);
          const detEvReqs    = dbEvidenceReqs.filter(e => e.auditId === auditDetailId);

          const ctrlImpl    = fwCtrls.filter(c => c.status === "implemented").length;
          const ctrlPartial = fwCtrls.filter(c => ["partial","in-progress"].includes(c.status ?? "")).length;
          const ctrlGap     = fwCtrls.filter(c => !["implemented","partial","in-progress"].includes(c.status ?? "")).length;
          const ctrlTotal   = fwCtrls.length;
          const ctrlCovPct  = ctrlTotal > 0 ? Math.round((ctrlImpl + ctrlPartial * 0.5) / ctrlTotal * 100) : 0;

          const evAccepted  = detEvReqs.filter(e => e.status === "accepted").length;
          const evPending   = detEvReqs.filter(e => ["pending","submitted"].includes(e.status ?? "")).length;
          const evRejected  = detEvReqs.filter(e => e.status === "rejected").length;
          const evTotal     = detEvReqs.length;
          const evCovPct    = evTotal > 0 ? Math.round(evAccepted / evTotal * 100) : (ctrlCovPct > 0 ? Math.round(ctrlCovPct * 0.7) : 0);
          const readinessPct = Math.min(100, Math.round(ctrlCovPct * 0.65 + evCovPct * 0.35));

          const domainGroups: Record<string, typeof fwCtrls> = {};
          fwCtrls.forEach(c => { const d = c.domain || "General"; (domainGroups[d] = domainGroups[d] ?? []).push(c); });

          const stageOvrs = auditDetailId ? (stageOverrides[auditDetailId] ?? {}) : {};
          const getStageEff = (n: number): "not-started"|"in-progress"|"completed" => {
            if (stageOvrs[n]) return stageOvrs[n].status;
            const auto = det ? (completedAt[det.status] ?? 0) : 0;
            if (n <= auto) return "completed";
            if (n === auto + 1) return "in-progress";
            return "not-started";
          };
          const detDone   = WORKFLOW_STAGES.filter(s => getStageEff(s.n) === "completed").length;
          const detSColor = sColor[det?.status ?? "planned"] ?? "#94A3B8";
          const detSBg    = sBg[det?.status ?? "planned"]    ?? "rgba(148,163,184,0.08)";

          /* ── suggestions engine ──────────────────────────────────────────── */
          const suggestions: {icon:string; color:string; text:string}[] = [];
          if (ctrlGap > 0)      suggestions.push({ icon:"⚠️", color:"#F59E0B", text:`${ctrlGap} control${ctrlGap!==1?"s":""} in ${detFw} have not been implemented. Complete these before audit to avoid findings.` });
          if (ctrlPartial > 0)  suggestions.push({ icon:"🔶", color:"#F59E0B", text:`${ctrlPartial} control${ctrlPartial!==1?"s":""} are partially implemented. Finalise evidence collection to confirm operating effectiveness.` });
          if (evRejected > 0)   suggestions.push({ icon:"❌", color:"#EF4444", text:`${evRejected} evidence item${evRejected!==1?"s":""} were rejected. Review rejection reasons and resubmit before the audit period closes.` });
          if (evPending > 0)    suggestions.push({ icon:"⏳", color:"#60A5FA", text:`${evPending} evidence request${evPending!==1?"s":""} are still pending. Assign owners and set collection deadlines to avoid audit delays.` });
          const highFindings = detFindings.filter(f => f.severity === "High" || f.severity === "Critical").length;
          if (highFindings > 0) suggestions.push({ icon:"🚨", color:"#EF4444", text:`${highFindings} high/critical finding${highFindings!==1?"s":""} require immediate remediation action before audit closure.` });
          if (suggestions.length === 0 && readinessPct >= 80) suggestions.push({ icon:"✅", color:"#10B981", text:`Audit readiness is strong (${readinessPct}%). Continue collecting evidence and validating controls through the audit period.` });
          if (fwChecklist.length > 0 && ctrlTotal === 0) suggestions.push({ icon:"💡", color:"#A78BFA", text:`No ${detFw} controls found in your control library. Import the ${detFw} compliance pack to auto-map controls to this audit.` });

          return (
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>

              {/* ── Audit Management Sub-nav ─────────────────────────────────── */}
              <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", padding:"4px 24px 0", background:"var(--card)" }}>
                {[
                  { key:"programs",            label:"Audit Programs" },
                  { key:"controls-assessment", label:"Controls Assessment" },
                  { key:"tabletop",            label:"Tabletop Exercises" },
                ].map(st => (
                  <button key={st.key} onClick={() => setAuditSubTab(st.key)}
                    style={{ padding:"10px 18px", fontSize:12, fontWeight:600, border:"none", background:"transparent", cursor:"pointer",
                      color: auditSubTab === st.key ? "rgb(147,197,253)" : "var(--muted-foreground)",
                      borderBottom: auditSubTab === st.key ? "2px solid rgb(147,197,253)" : "2px solid transparent",
                      transition:"all 0.15s", whiteSpace:"nowrap" }}>
                    {st.label}
                  </button>
                ))}
              </div>

              {auditSubTab === "programs" && <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {/* ══════════════════════════════════════════════════════════════
                  FULL-SCREEN AUDIT DETAIL PANEL
              ══════════════════════════════════════════════════════════════ */}
              {det && (
                <div style={{ position:"fixed", inset:0, zIndex:600, background:"#060D18", display:"flex", flexDirection:"column", overflow:"hidden",
                  "--card":"rgba(255,255,255,0.05)", "--border":"rgba(255,255,255,0.09)", "--foreground":"rgb(241,245,249)",
                  "--muted-foreground":"rgb(148,163,184)", "--input":"rgb(14,22,36)", "--secondary":"rgba(255,255,255,0.04)"
                } as React.CSSProperties}>

                  {/* ── Panel header ─────────────────────────────────────── */}
                  <div style={{ background:"rgba(14,22,38,0.98)", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"14px 24px", display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
                    <button onClick={()=>{ setAuditDetailId(null); setAuditDetailTab("workflow"); }}
                      style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color:"rgb(148,163,184)", cursor:"pointer", fontSize:12, fontWeight:700, padding:"6px 14px", display:"flex", alignItems:"center", gap:6 }}>
                      ← Back
                    </button>
                    <div style={{ display:"flex", flexDirection:"column", flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:16, fontWeight:900, color:"var(--foreground)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{det.name}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", flexShrink:0 }}>{det.id}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgb(147,197,253)", background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"2px 8px", flexShrink:0 }}>{detFw}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:detSColor, background:detSBg, border:`1px solid ${detSColor}33`, borderRadius:5, padding:"2px 8px", flexShrink:0 }}>
                          {(det.status ?? "planned")==="in-progress"?"Active":(det.status ?? "planned").charAt(0).toUpperCase()+(det.status ?? "planned").slice(1).replace("-"," ")}
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:14, marginTop:3, fontSize:11, color:"var(--muted-foreground)" }}>
                        {det.type && <span>📋 {det.type}</span>}
                        {det.auditor && <span>👤 {det.auditor}</span>}
                        {det.scheduled && <span>📅 {det.scheduled}</span>}
                        {det.scope && <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🎯 {det.scope}</span>}
                      </div>
                    </div>
                    {/* Readiness ring */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                      <RingChart pct={readinessPct} color={readinessPct>=75?"#10B981":readinessPct>=50?"#F59E0B":"#EF4444"} size={52} />
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>Readiness Score</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Controls 65% · Evidence 35%</div>
                      </div>
                    </div>
                  </div>

                  {/* ── Detail sub-tabs ──────────────────────────────────── */}
                  <div style={{ display:"flex", gap:0, borderBottom:"1px solid rgba(255,255,255,0.08)", background:"rgba(10,16,28,0.9)", flexShrink:0 }}>
                    {[
                      { key:"workflow",    label:"🗺 Workflow",          badge: `${detDone}/19` },
                      { key:"controls",    label:"🛡 Controls",          badge: ctrlTotal > 0 ? `${ctrlImpl}/${ctrlTotal}` : "—" },
                      { key:"evidence",    label:"📁 Evidence",          badge: evTotal > 0 ? `${evAccepted}/${evTotal}` : "—" },
                      { key:"findings",    label:"⚠️ Findings",          badge: detFindings.length > 0 ? String(detFindings.length) : "0" },
                      { key:"checklist",   label:"✅ Audit Checklist",   badge: fwChecklist.length > 0 ? `${fwChecklist.length}` : "—" },
                    ].map(t => (
                      <button key={t.key} onClick={()=>setAuditDetailTab(t.key)}
                        style={{ padding:"11px 18px", background:"transparent", border:"none", borderBottom: auditDetailTab===t.key ? "2px solid rgb(147,197,253)" : "2px solid transparent", color: auditDetailTab===t.key ? "rgb(147,197,253)" : "var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
                        {t.label}
                        <span style={{ fontSize:9, background: auditDetailTab===t.key ? "rgba(147,197,253,0.15)" : "rgba(255,255,255,0.06)", color: auditDetailTab===t.key ? "rgb(147,197,253)" : "var(--muted-foreground)", borderRadius:4, padding:"1px 6px", fontWeight:800 }}>{t.badge}</span>
                      </button>
                    ))}
                  </div>

                  {/* ── Tab content ──────────────────────────────────────── */}
                  <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

                    {/* ─── WORKFLOW TAB ─────────────────────────────────── */}
                    {auditDetailTab === "workflow" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        {/* Progress header */}
                        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 22px" }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"rgb(147,197,253)" }}>📋 Universal Compliance Audit Workflow — 19 Stages</span>
                            <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{detDone} of 19 complete ({Math.round(detDone/19*100)}%)</span>
                          </div>
                          <div style={{ height:8, background:"var(--border)", borderRadius:4, overflow:"hidden", marginBottom:18 }}>
                            <div style={{ height:"100%", width:`${Math.round(detDone/19*100)}%`, background:"linear-gradient(90deg,#3B82F6,#10B981)", borderRadius:4, transition:"width 0.6s" }}/>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>
                            {WORKFLOW_STAGES.map(st => {
                              const eff      = getStageEff(st.n);
                              const isDone   = eff === "completed";
                              const isActive = eff === "in-progress";
                              const isSel    = selectedStageN === st.n;
                              const haOvr    = !!(stageOvrs[st.n]?.implementer);
                              return (
                                <div key={st.n}
                                  onClick={() => setSelectedStageN(isSel ? null : st.n)}
                                  style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"10px 12px", borderRadius:9, cursor:"pointer",
                                    background: isSel ? "rgba(147,197,253,0.12)" : isDone ? "rgba(16,185,129,0.06)" : isActive ? "rgba(147,197,253,0.08)" : "rgba(255,255,255,0.02)",
                                    border:`1px solid ${isSel?"rgba(147,197,253,0.6)":isDone?"rgba(16,185,129,0.22)":isActive?"rgba(147,197,253,0.3)":"rgba(255,255,255,0.06)"}`,
                                    outline: isSel ? "1px solid rgba(147,197,253,0.3)" : "none",
                                    outlineOffset: 2,
                                  }}>
                                  <div style={{ width:24, height:24, borderRadius:"50%", background: isDone?"#059669":isActive?"#1E3A5F":"var(--border)", border: isSel?"2px solid rgb(147,197,253)":isActive?"2px solid rgb(147,197,253)":"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color: isDone?"white":isActive?"rgb(147,197,253)":"var(--muted-foreground)", flexShrink:0 }}>
                                    {isDone?"✓":st.n}
                                  </div>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:600, color: isDone?"rgb(52,211,153)":isActive?"var(--foreground)":"var(--muted-foreground)", lineHeight:1.3 }}>{st.icon} {st.label}</div>
                                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>→ {st.output}</div>
                                    {isDone && <div style={{ fontSize:9, color:"rgba(52,211,153,0.7)", marginTop:2 }}>✓ Completed</div>}
                                    {isActive && !isDone && <div style={{ fontSize:9, color:"rgba(147,197,253,0.8)", marginTop:2 }}>⬤ In Progress</div>}
                                    {haOvr && <div style={{ fontSize:9, color:"rgba(196,181,253,0.7)", marginTop:2 }}>👤 {stageOvrs[st.n].implementer}</div>}
                                    {isSel && <div style={{ fontSize:9, color:"rgb(147,197,253)", marginTop:2, fontWeight:700 }}>▼ Details below</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Stage Detail Panel ─────────────────────────── */}
                        {selectedStageN !== null && auditDetailId && (() => {
                          const st = WORKFLOW_STAGES.find(s => s.n === selectedStageN)!;
                          const ov: StageTask = stageOvrs[selectedStageN] ?? { auditId: auditDetailId, auditName: det?.name ?? "", stageN: selectedStageN, stageLabel: st.label, stageIcon: st.icon, stageOutput: st.output, status: getStageEff(selectedStageN), implementer: "", notes: "", evidences: [] };
                          const stColor = ov.status === "completed" ? "#10B981" : ov.status === "in-progress" ? "#60A5FA" : "#94A3B8";
                          const fileInputId = `ev-up-${auditDetailId}-${selectedStageN}`;
                          return (
                            <div style={{ background:"rgba(9,15,26,0.95)", border:"1px solid rgba(147,197,253,0.35)", borderRadius:12, padding:"20px 24px", marginTop:4 }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                                  <div style={{ width:36, height:36, borderRadius:10, background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{st.icon}</div>
                                  <div>
                                    <div style={{ fontSize:14, fontWeight:800, color:"var(--foreground)" }}>Stage {st.n}: {st.label}</div>
                                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>Deliverable → {st.output}</div>
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:5, background:`${stColor}18`, border:`1px solid ${stColor}44`, color:stColor }}>
                                    {ov.status === "completed" ? "✅ Completed" : ov.status === "in-progress" ? "🔵 In Progress" : "⬜ Not Started"}
                                  </span>
                                </div>
                                <button onClick={() => setSelectedStageN(null)} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"var(--muted-foreground)", fontSize:11, fontWeight:600, padding:"5px 12px", cursor:"pointer" }}>✕ Close</button>
                              </div>

                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:14 }}>
                                <div>
                                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>Status</label>
                                  <select value={ov.status} onChange={e => updateStageTask(auditDetailId, det?.name ?? "", st, { status: e.target.value as StageTask["status"] })}
                                    style={{ width:"100%", background:"rgb(14,20,30)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:7, padding:"8px 12px", fontSize:12, color:"var(--foreground)", outline:"none", cursor:"pointer" }}>
                                    <option value="not-started">⬜ Not Started</option>
                                    <option value="in-progress">🔵 In Progress</option>
                                    <option value="completed">✅ Completed</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>Implementer</label>
                                  <input value={ov.implementer} onChange={e => updateStageTask(auditDetailId, det?.name ?? "", st, { implementer: e.target.value })}
                                    placeholder="Assign to person..."
                                    style={{ width:"100%", boxSizing:"border-box" as const, background:"rgb(14,20,30)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:7, padding:"8px 12px", fontSize:12, color:"var(--foreground)", outline:"none" }} />
                                </div>
                              </div>

                              <div style={{ marginBottom:14 }}>
                                <label style={{ display:"block", fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:6 }}>Notes</label>
                                <textarea value={ov.notes} onChange={e => updateStageTask(auditDetailId, det?.name ?? "", st, { notes: e.target.value })}
                                  placeholder="Add notes, observations, or instructions for this stage..."
                                  rows={3}
                                  style={{ width:"100%", boxSizing:"border-box" as const, background:"rgb(14,20,30)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:7, padding:"8px 12px", fontSize:12, color:"var(--foreground)", outline:"none", resize:"vertical" as const, fontFamily:"inherit" }} />
                              </div>

                              <div>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                  <label style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Evidence Files ({(ov.evidences ?? []).length})</label>
                                  <label htmlFor={fileInputId} style={{ background:"rgba(59,130,246,0.15)", border:"1px solid rgba(59,130,246,0.35)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:"rgb(147,197,253)", cursor:"pointer" }}>
                                    📎 Upload Evidence
                                  </label>
                                  <input id={fileInputId} type="file" style={{ display:"none" }} onChange={e => {
                                    const f = e.target.files?.[0]; if (!f) return;
                                    const sz = f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${(f.size/1024).toFixed(0)} KB`;
                                    updateStageTask(auditDetailId, det?.name ?? "", st, { evidences: [...(ov.evidences ?? []), { name: f.name, size: sz, date: new Date().toISOString().slice(0,10) }] });
                                    e.target.value = "";
                                  }} />
                                </div>
                                {(ov.evidences ?? []).length === 0 ? (
                                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.35)", fontStyle:"italic" as const, padding:"10px 0" }}>No evidence uploaded for this stage yet.</div>
                                ) : (
                                  <div style={{ display:"flex", flexDirection:"column" as const, gap:4 }}>
                                    {(ov.evidences ?? []).map((ev, ei) => (
                                      <div key={ei} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:7 }}>
                                        <span style={{ fontSize:14 }}>📄</span>
                                        <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", flex:1 }}>{ev.name}</span>
                                        <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"monospace" }}>{ev.size}</span>
                                        <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"monospace" }}>{ev.date}</span>
                                        <button onClick={() => updateStageTask(auditDetailId, det?.name ?? "", st, { evidences: (ov.evidences ?? []).filter((_,j)=>j!==ei) })}
                                          style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:5, color:"#F87171", fontSize:10, fontWeight:700, padding:"2px 7px", cursor:"pointer" }}>✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Suggestions */}
                        {suggestions.length > 0 && (
                          <div style={{ background:"rgba(14,22,38,0.8)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:12, padding:"16px 20px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"rgb(147,197,253)", marginBottom:12 }}>💡 AI Audit Advisor — Recommendations</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                              {suggestions.map((sg,i) => (
                                <div key={i} style={{ display:"flex", gap:10, padding:"10px 14px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${sg.color}22` }}>
                                  <span style={{ fontSize:14, flexShrink:0 }}>{sg.icon}</span>
                                  <span style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.5 }}>{sg.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ─── CONTROLS TAB ─────────────────────────────────── */}
                    {auditDetailTab === "controls" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {/* Summary KPIs */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                          {[
                            { label:"Total Controls",   value:ctrlTotal,   color:"rgb(147,197,253)" },
                            { label:"Implemented",      value:ctrlImpl,    color:"#10B981" },
                            { label:"Partial / WIP",    value:ctrlPartial, color:"#F59E0B" },
                            { label:"Gap / Not Started",value:ctrlGap,     color:"#EF4444" },
                          ].map(k => (
                            <div key={k.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                              <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono',monospace" }}>{k.value}</div>
                              <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Coverage bar */}
                        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 18px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:11 }}>
                            <span style={{ fontWeight:700, color:"var(--foreground)" }}>Control Coverage for {detFw}</span>
                            <span style={{ fontWeight:800, color:ctrlCovPct>=75?"#10B981":ctrlCovPct>=50?"#F59E0B":"#EF4444", fontFamily:"'JetBrains Mono',monospace" }}>{ctrlCovPct}%</span>
                          </div>
                          <div style={{ height:10, background:"var(--input)", borderRadius:5, overflow:"hidden", display:"flex" }}>
                            <div style={{ height:"100%", width:`${ctrlTotal>0?Math.round(ctrlImpl/ctrlTotal*100):0}%`, background:"#10B981" }}/>
                            <div style={{ height:"100%", width:`${ctrlTotal>0?Math.round(ctrlPartial/ctrlTotal*100):0}%`, background:"#F59E0B" }}/>
                            <div style={{ height:"100%", width:`${ctrlTotal>0?Math.round(ctrlGap/ctrlTotal*100):0}%`, background:"rgba(239,68,68,0.4)" }}/>
                          </div>
                          <div style={{ display:"flex", gap:14, marginTop:6, fontSize:10 }}>
                            <span style={{ color:"#10B981" }}>● Implemented ({ctrlImpl})</span>
                            <span style={{ color:"#F59E0B" }}>● Partial ({ctrlPartial})</span>
                            <span style={{ color:"#EF4444" }}>● Gap ({ctrlGap})</span>
                          </div>
                        </div>
                        {/* Domain breakdown */}
                        {ctrlTotal === 0 ? (
                          <div style={{ padding:"32px", textAlign:"center", background:"var(--card)", border:"1px solid var(--border)", borderRadius:10 }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>🛡</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>No {detFw} controls found</div>
                            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Import the {detFw} compliance pack to auto-populate controls for this audit.</div>
                          </div>
                        ) : Object.entries(domainGroups).map(([domain, ctrls]) => {
                          const dImpl = ctrls.filter(c=>c.status==="implemented").length;
                          const dPct  = Math.round(dImpl/ctrls.length*100);
                          return (
                            <div key={domain} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
                              <div style={{ padding:"12px 16px", background:"rgba(255,255,255,0.02)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <span style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>{domain}</span>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{dImpl}/{ctrls.length} implemented</span>
                                  <span style={{ fontSize:11, fontWeight:800, color:dPct>=75?"#10B981":dPct>=50?"#F59E0B":"#EF4444", fontFamily:"'JetBrains Mono',monospace" }}>{dPct}%</span>
                                </div>
                              </div>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:0 }}>
                                {ctrls.map(c => {
                                  const cst = c.status ?? "not-started";
                                  const cColor = cst==="implemented"?"#10B981":cst==="partial"||cst==="in-progress"?"#F59E0B":"#EF4444";
                                  const cBg    = cst==="implemented"?"rgba(16,185,129,0.06)":cst==="partial"||cst==="in-progress"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.04)";
                                  const sufficient = cst==="implemented" && (c.evidence ?? 0) > 0;
                                  const evSummRow = evSummaryMap.get(c.dbId);
                                  const evSt = evSummRow?.evidenceStatus ?? "missing";
                                  const evColor = evStatusColor(evSt);
                                  return (
                                    <div key={c.id} onClick={() => openEvidencePanel(c)} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:cBg, cursor:"pointer" }}
                                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(59,130,246,0.05)")}
                                      onMouseLeave={e=>(e.currentTarget.style.background=cBg)}>
                                      <div style={{ width:8, height:8, borderRadius:"50%", background:cColor, marginTop:4, flexShrink:0 }}/>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                                        <div style={{ display:"flex", gap:8, marginTop:3 }}>
                                          <span style={{ fontSize:9, fontWeight:700, color:cColor }}>{cst}</span>
                                          {c.owner && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>👤 {c.owner}</span>}
                                        </div>
                                      </div>
                                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                                        {/* Automated evidence status badge */}
                                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:4, background:`${evColor}18`, color:evColor, border:`1px solid ${evColor}44` }}>
                                          {evStatusLabel(evSt)}
                                        </span>
                                        {(c.evidence ?? 0) > 0 && <span style={{ fontSize:9, background:"rgba(147,197,253,0.1)", color:"rgb(147,197,253)", borderRadius:4, padding:"1px 6px" }}>📁 {c.evidence}</span>}
                                        {!sufficient && <span style={{ fontSize:9, color:"rgba(239,68,68,0.7)", letterSpacing:"-0.2px" }}>⚠ needs evidence</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ─── EVIDENCE TAB ─────────────────────────────────── */}
                    {auditDetailTab === "evidence" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {/* KPIs */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                          {[
                            { label:"Total Requests",  value:evTotal,    color:"rgb(147,197,253)" },
                            { label:"Accepted",        value:evAccepted, color:"#10B981" },
                            { label:"Pending / Draft", value:evPending,  color:"#F59E0B" },
                            { label:"Rejected",        value:evRejected, color:"#EF4444" },
                          ].map(k => (
                            <div key={k.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                              <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono',monospace" }}>{k.value}</div>
                              <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Effectiveness indicator */}
                        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 18px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10 }}>
                            <RingChart pct={evCovPct} color={evCovPct>=75?"#10B981":evCovPct>=50?"#F59E0B":"#EF4444"} size={56} />
                            <div>
                              <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>Evidence Effectiveness Score</div>
                              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>
                                {evCovPct >= 80 ? "✅ Evidence collection is sufficient to support audit assertions." :
                                 evCovPct >= 50 ? "⚠️ Partial evidence coverage — gaps may lead to audit observations." :
                                                  "❌ Evidence coverage is insufficient. Immediate action required."}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Evidence requests list */}
                        {detEvReqs.length === 0 ? (
                          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"32px", textAlign:"center" }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>📁</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>No evidence requests for this audit</div>
                            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Evidence requests will appear here once created for this audit program.</div>
                          </div>
                        ) : (
                          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
                            <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 120px 130px 110px 120px", gap:0, padding:"10px 16px", borderBottom:"1px solid var(--border)", background:"rgba(255,255,255,0.02)" }}>
                              {["Req ID","Title / Control","Type","Requested From","Due Date","Status"].map(h=>(
                                <div key={h} style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</div>
                              ))}
                            </div>
                            {detEvReqs.map(e => {
                              const est = e.status ?? "pending";
                              const ec = est==="accepted"?"#10B981":est==="rejected"?"#EF4444":est==="submitted"?"#60A5FA":"#94A3B8";
                              return (
                                <div key={e.id ?? e.requestId} style={{ display:"grid", gridTemplateColumns:"100px 1fr 120px 130px 110px 120px", gap:0, padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", alignItems:"start" }}>
                                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{e.requestId ?? e.id}</span>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.title ?? "—"}</div>
                                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:1 }}>Control: {e.control ?? "—"}</div>
                                    {e.description && <div style={{ fontSize:9, color:"rgba(148,163,184,0.6)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.description}</div>}
                                  </div>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{e.type ?? "Document"}</span>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{e.requestedFrom ?? e.collectedBy ?? "—"}</span>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{e.dueDate ?? "—"}</span>
                                  <div>
                                    <span style={{ fontSize:10, fontWeight:700, color:ec, background:`${ec}18`, border:`1px solid ${ec}33`, borderRadius:5, padding:"2px 8px" }}>
                                      {est.charAt(0).toUpperCase()+est.slice(1)}
                                    </span>
                                    {e.rejectionReason && <div style={{ fontSize:9, color:"#EF4444", marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>↳ {e.rejectionReason}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Control-evidence gap matrix */}
                        {ctrlGap > 0 && (
                          <div style={{ background:"rgba(239,68,68,0.04)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"14px 18px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"#EF4444", marginBottom:10 }}>🚨 Evidence Gaps — Controls Without Sufficient Evidence</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {fwCtrls.filter(c => !["implemented","partial"].includes(c.status ?? "")).slice(0,8).map(c => (
                                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"rgba(239,68,68,0.06)", borderRadius:7 }}>
                                  <span style={{ fontSize:10 }}>⚠️</span>
                                  <div style={{ flex:1, fontSize:11, color:"var(--foreground)" }}>{c.name}</div>
                                  <span style={{ fontSize:9, color:"#EF4444", background:"rgba(239,68,68,0.1)", borderRadius:4, padding:"1px 7px", fontWeight:700 }}>No evidence</span>
                                </div>
                              ))}
                              {ctrlGap > 8 && <div style={{ fontSize:10, color:"var(--muted-foreground)", textAlign:"center", paddingTop:4 }}>… and {ctrlGap - 8} more controls need attention</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ─── FINDINGS TAB ─────────────────────────────────── */}
                    {auditDetailTab === "findings" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {/* Severity KPIs */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                          {(["Critical","High","Medium","Low"] as const).map(sev => {
                            const n = detFindings.filter(f => f.severity === sev).length;
                            return (
                              <div key={sev} style={{ background:"var(--card)", border:`1px solid ${sevColor[sev]}22`, borderRadius:10, padding:"14px 16px" }}>
                                <div style={{ fontSize:22, fontWeight:800, color:sevColor[sev], fontFamily:"'JetBrains Mono',monospace" }}>{n}</div>
                                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{sev} findings</div>
                              </div>
                            );
                          })}
                        </div>
                        {detFindings.length === 0 ? (
                          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"40px", textAlign:"center" }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                            <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>No findings recorded for this audit</div>
                            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Findings will appear here once observations are raised during fieldwork.</div>
                          </div>
                        ) : (
                          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
                            <div style={{ display:"grid", gridTemplateColumns:"100px 1fr 90px 120px 120px 110px", gap:0, padding:"10px 16px", borderBottom:"1px solid var(--border)", background:"rgba(255,255,255,0.02)" }}>
                              {["Finding ID","Title","Severity","Control","Owner","Status"].map(h=>(
                                <div key={h} style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</div>
                              ))}
                            </div>
                            {detFindings.map(f => {
                              const fst = f.status ?? "open";
                              const fstC = fst==="closed"?"#10B981":fst==="in-progress"?"#F59E0B":"#EF4444";
                              return (
                                <div key={f.id ?? f.findingId} style={{ display:"grid", gridTemplateColumns:"100px 1fr 90px 120px 120px 110px", gap:0, padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", alignItems:"start" }}>
                                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{f.findingId ?? f.id}</span>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", lineHeight:1.4 }}>{f.title}</div>
                                    {f.description && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2, lineHeight:1.4 }}>{f.description}</div>}
                                    {f.recommendation && <div style={{ fontSize:10, color:"rgba(147,197,253,0.7)", marginTop:3 }}>💡 {f.recommendation}</div>}
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, color:sevColor[f.severity]??"#94A3B8", background:`${sevColor[f.severity]??"#94A3B8"}18`, borderRadius:5, padding:"2px 7px" }}>{f.severity ?? "—"}</span>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{f.control ?? "—"}</span>
                                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{f.owner ?? "—"}</span>
                                  <span style={{ fontSize:10, fontWeight:700, color:fstC, background:`${fstC}18`, borderRadius:5, padding:"2px 8px" }}>{fst.charAt(0).toUpperCase()+fst.slice(1).replace("-"," ")}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ─── CHECKLIST TAB ────────────────────────────────── */}
                    {auditDetailTab === "checklist" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 22px" }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"rgb(147,197,253)", marginBottom:4 }}>✅ {detFw} Framework Audit Checklist</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:16 }}>Auto-populated checklist steps for {detFw}. Status is inferred from your implemented controls and evidence library.</div>
                          {fwChecklist.length === 0 ? (
                            <div style={{ padding:"20px", textAlign:"center", color:"var(--muted-foreground)", fontSize:12 }}>No specific checklist guidance available for {detFw || "this framework"}.</div>
                          ) : (
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {fwChecklist.map((item, idx) => {
                                const isChecked = ctrlCovPct >= ((idx + 1) / fwChecklist.length * 100);
                                const evCheck   = evCovPct >= ((idx + 1) / fwChecklist.length * 80);
                                const bothOk    = isChecked && evCheck;
                                const partial   = isChecked || evCheck;
                                const itemColor = bothOk ? "#10B981" : partial ? "#F59E0B" : "#94A3B8";
                                const itemBg    = bothOk ? "rgba(16,185,129,0.06)" : partial ? "rgba(245,158,11,0.05)" : "rgba(255,255,255,0.02)";
                                return (
                                  <div key={idx} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 16px", borderRadius:9, background:itemBg, border:`1px solid ${itemColor}22` }}>
                                    <div style={{ width:24, height:24, borderRadius:"50%", background:bothOk?"#059669":partial?"rgba(245,158,11,0.2)":"var(--border)", border:`2px solid ${itemColor}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:itemColor, flexShrink:0 }}>
                                      {bothOk ? "✓" : partial ? "~" : String(idx + 1)}
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, fontWeight:600, color:"var(--foreground)", lineHeight:1.5 }}>{item}</div>
                                      <div style={{ fontSize:10, color:itemColor, marginTop:3 }}>
                                        {bothOk ? "✓ Controls implemented · Evidence collected" :
                                         isChecked ? "✓ Controls implemented · ⚠ Evidence collection pending" :
                                         evCheck   ? "⚠ Controls in progress · Evidence partially available" :
                                                     "⚠ Requires control implementation and evidence collection"}
                                      </div>
                                    </div>
                                    <span style={{ fontSize:9, fontWeight:700, color:itemColor, background:`${itemColor}18`, borderRadius:4, padding:"2px 8px", flexShrink:0 }}>
                                      {bothOk ? "Complete" : partial ? "Partial" : "Pending"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {/* Suggestions */}
                        {suggestions.length > 0 && (
                          <div style={{ background:"rgba(14,22,38,0.8)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:12, padding:"16px 20px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"rgb(147,197,253)", marginBottom:12 }}>💡 AI Audit Advisor</div>
                            {suggestions.map((sg,i) => (
                              <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${sg.color}22`, marginBottom:6 }}>
                                <span style={{ fontSize:14 }}>{sg.icon}</span>
                                <span style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.5 }}>{sg.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <button
                  onClick={()=>{ setCreateForm({fwId:"",fwName:"",auditType:"",entity:"",location:"",process:"",systems:"",auditor:"",auditee:"",name:"",objective:"",startDate:"",endDate:"",sampling:"Random sampling"}); setCreateStep(1); setCreateOpen(true); }}
                  style={{ background:"linear-gradient(135deg,#1E3A5F,#2563EB)", color:"white", border:"none", borderRadius:8, padding:"9px 18px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6, boxShadow:"0 2px 8px rgba(37,99,235,0.35)" }}>
                  ＋ New Audit
                </button>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {["All","scheduled","in-progress","paused","suspended","completed"].map(s=>(
                    <span key={s}
                      style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:6, border:`1px solid ${s!=="All"?(auditFilter===s?sColor[s]??"":`${sColor[s]??""}44`):"rgba(255,255,255,0.12)"}`, color: s!=="All"?sColor[s]??"var(--foreground)":"var(--foreground)", background: auditFilter===s ? (s==="All"?"rgba(255,255,255,0.06)":`${sColor[s]??""  }18`) : "transparent", cursor:"pointer", transition:"background 0.1s" }}
                      onClick={()=>{ setAuditFilter(s); setAuditPage(1); }}>
                      {s==="All"?"All":s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")}
                      <span style={{ marginLeft:5, color:"var(--muted-foreground)" }}>{s==="All"?allAudits.length:allAudits.filter(a=>a.status===s).length}</span>
                    </span>
                  ))}
                </div>
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filteredAudits.length} audit{filteredAudits.length!==1?"s":""}</span>
              </div>

              {/* ── AUDIT LIST ──────────────────────────────────────────────── */}
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                <div style={{ display:"grid", gridTemplateColumns:"88px 1fr 120px 155px 120px 92px 70px 170px", gap:0, padding:"10px 16px", borderBottom:"1px solid var(--border)", background:"var(--secondary)" }}>
                  {["ID","Audit Name","Framework","Type","Auditor","Start","Findings","Status / Actions"].map(h=>(
                    <div key={h} style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</div>
                  ))}
                </div>

                {filteredAudits.length === 0 && (
                  <div style={{ padding:"48px 24px", textAlign:"center" }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
                    <div style={{ fontSize:14, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>{auditFilter==="All" ? "No audits yet" : `No ${auditFilter} audits`}</div>
                    <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:18 }}>{auditFilter==="All" ? "Create your first audit to begin the compliance journey" : `No audits with status "${auditFilter}" found.`}</div>
                    {auditFilter==="All" && <button onClick={()=>{ setCreateForm({fwId:"",fwName:"",auditType:"",entity:"",location:"",process:"",systems:"",auditor:"",auditee:"",name:"",objective:"",startDate:"",endDate:"",sampling:"Random sampling"}); setCreateStep(1); setCreateOpen(true); }}
                      style={{ background:"#1E3A5F", color:"white", border:"none", borderRadius:8, padding:"9px 20px", fontSize:12, fontWeight:700, cursor:"pointer" }}>＋ New Audit</button>}
                  </div>
                )}

                {pageAudits.map(a => {
                  const s = a.status ?? "scheduled";
                  return (
                    <div key={a.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <div
                        style={{ display:"grid", gridTemplateColumns:"88px 1fr 120px 155px 120px 92px 70px 170px", gap:0, padding:"12px 16px", alignItems:"center", cursor:"pointer", background:"transparent", transition:"background 0.1s" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="rgba(147,197,253,0.03)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                        onClick={()=>{ setAuditDetailId(String(a.id)); setAuditDetailTab("workflow"); }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.id}</span>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"rgb(147,197,253)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:"underline", textDecorationColor:"rgba(147,197,253,0.3)" }}>{a.name}</div>
                          {a.scope && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.scope}</div>}
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color:"rgb(147,197,253)", background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"2px 7px", display:"inline-block", maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.framework}</span>
                        <span style={{ fontSize:11, color:"rgba(148,163,184,0.75)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.type}</span>
                        <span style={{ fontSize:11, color:"rgba(148,163,184,0.75)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.auditor||"—"}</span>
                        <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{a.scheduled||"—"}</span>
                        {a.findings>0
                          ? <span style={{ fontSize:10, fontWeight:700, color:"#F59E0B", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:4, padding:"1px 6px", display:"inline-block" }}>{a.findings}</span>
                          : <span style={{ color:"rgba(148,163,184,0.25)" }}>—</span>}
                        <div style={{ display:"flex", alignItems:"center", gap:6 }} onClick={e=>e.stopPropagation()}>
                          <span style={{ fontSize:10, fontWeight:700, color:sColor[s]??"#94A3B8", background:sBg[s]??"rgba(148,163,184,0.08)", border:`1px solid ${sColor[s]??"#94A3B8"}33`, borderRadius:5, padding:"2px 8px", whiteSpace:"nowrap" }}>
                            {s==="in-progress"?"Active":s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")}
                          </span>
                          <div style={{ position:"relative" }}>
                            <button onClick={()=>setAuditMenuId(auditMenuId===String(a.id)?null:String(a.id))}
                              style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, color:"rgb(148,163,184)", cursor:"pointer", fontSize:14, padding:"1px 7px", lineHeight:1.4 }}>⋯</button>
                            {auditMenuId===String(a.id) && (
                              <div style={{ position:"absolute", right:0, top:"calc(100% + 4px)", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:10, minWidth:155, zIndex:200, boxShadow:"0 12px 36px rgba(0,0,0,0.7)", overflow:"hidden" }}>
                                <button onClick={()=>{ setAuditDetailId(String(a.id)); setAuditDetailTab("workflow"); setAuditMenuId(null); }} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(147,197,253)", fontSize:12, cursor:"pointer", fontWeight:600 }}>🔍 Open Details</button>
                                <div style={{ height:1, background:"var(--border)", margin:"2px 0" }}/>
                                {(s==="scheduled"||s==="planned") && <button onClick={()=>doAction(String(a.id),"start")} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(52,211,153)", fontSize:12, cursor:"pointer", fontWeight:600 }}>▶ Start Audit</button>}
                                {s==="in-progress" && <button onClick={()=>doAction(String(a.id),"pause")} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(251,191,36)", fontSize:12, cursor:"pointer", fontWeight:600 }}>⏸ Pause</button>}
                                {(s==="paused"||s==="suspended") && <button onClick={()=>doAction(String(a.id),"restart")} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(147,197,253)", fontSize:12, cursor:"pointer", fontWeight:600 }}>▶ Restart</button>}
                                {(s==="in-progress"||s==="paused") && <button onClick={()=>doAction(String(a.id),"suspend")} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(248,113,113)", fontSize:12, cursor:"pointer", fontWeight:600 }}>⊘ Suspend</button>}
                                <div style={{ height:1, background:"var(--border)", margin:"2px 0" }}/>
                                <button onClick={()=>setDeleteTarget(String(a.id))} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 16px", background:"transparent", border:"none", color:"rgb(248,113,113)", fontSize:12, cursor:"pointer", fontWeight:600 }}>🗑 Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── PAGINATION ──────────────────────────────────────────────── */}
              {totalPages > 1 && (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 4px" }}>
                  <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                    Showing {(auditPage-1)*PAGE_SIZE+1}–{Math.min(auditPage*PAGE_SIZE, filteredAudits.length)} of {filteredAudits.length} audits
                  </span>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    <button disabled={auditPage===1} onClick={()=>setAuditPage(p=>p-1)}
                      style={{ padding:"5px 12px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color: auditPage===1?"var(--muted-foreground)":"var(--foreground)", fontSize:12, cursor:auditPage===1?"default":"pointer" }}>← Prev</button>
                    {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                      <button key={p} onClick={()=>setAuditPage(p)}
                        style={{ width:28, height:28, borderRadius:6, border:`1px solid ${p===auditPage?"rgb(147,197,253)":"rgba(255,255,255,0.12)"}`, background:p===auditPage?"rgba(147,197,253,0.12)":"transparent", color:p===auditPage?"rgb(147,197,253)":"var(--foreground)", fontSize:11, fontWeight:p===auditPage?700:400, cursor:"pointer" }}>{p}</button>
                    ))}
                    <button disabled={auditPage===totalPages} onClick={()=>setAuditPage(p=>p+1)}
                      style={{ padding:"5px 12px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:auditPage===totalPages?"var(--muted-foreground)":"var(--foreground)", fontSize:12, cursor:auditPage===totalPages?"default":"pointer" }}>Next →</button>
                  </div>
                </div>
              )}

              {/* ── GANTT ───────────────────────────────────────────────────── */}
              {viewTenantId===1 && (
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"rgb(147,197,253)", marginBottom:14 }}>Audit Phase Progress — Gantt View</div>
                  <div style={{ display:"grid", gridTemplateColumns:"160px repeat(5,1fr)", gap:6, marginBottom:8 }}>
                    <div/>
                    {PHASE_LABELS.map(p=><div key={p} style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", textAlign:"center", textTransform:"uppercase" }}>{p}</div>)}
                  </div>
                  {auditPhases.map(ap=>(
                    <div key={ap.name} style={{ display:"grid", gridTemplateColumns:"160px repeat(5,1fr)", gap:6, marginBottom:10, alignItems:"center" }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", paddingRight:8 }}>{ap.name}</div>
                      {ap.phases.map((pct,i)=>(
                        <div key={i} style={{ position:"relative" }}>
                          <div style={{ height:20, background:"var(--input)", borderRadius:4, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:pct===100?ap.color:pct>0?ap.color+"99":"transparent", borderRadius:4, transition:"width 0.6s" }}/>
                          </div>
                          {pct>0&&<div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:pct>50?"white":"var(--foreground)" }}>{pct}%</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:12, marginTop:6, fontSize:10 }}>
                    <span style={{ color:"#065F46" }}>● Complete</span>
                    <span style={{ color:"rgb(147,197,253)" }}>● In Progress</span>
                    <span style={{ color:"#D1D5DB" }}>● Not Started</span>
                  </div>
                </div>
              )}

              {/* ── DELETE CONFIRM ──────────────────────────────────────────── */}
              {deleteTarget && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:700, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setDeleteTarget(null)}>
                  <div style={{ background:"var(--input)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:14, padding:"28px 32px", width:380, boxShadow:"0 24px 64px rgba(0,0,0,0.7)" }} onClick={e=>e.stopPropagation()}>
                    <div style={{ fontSize:16, fontWeight:800, color:"rgb(248,113,113)", marginBottom:10 }}>🗑 Delete Audit</div>
                    <div style={{ fontSize:13, color:"var(--foreground)", marginBottom:24, lineHeight:1.6 }}>This will permanently remove the audit and all associated workflow data. This action cannot be undone.</div>
                    <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                      <button onClick={()=>setDeleteTarget(null)} style={{ padding:"8px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", background:"transparent", color:"var(--foreground)", fontSize:13, cursor:"pointer" }}>Cancel</button>
                      <button onClick={()=>doDelete(deleteTarget)} style={{ padding:"8px 20px", borderRadius:8, border:"none", background:"#DC2626", color:"white", fontSize:13, fontWeight:700, cursor:"pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}

              </div>} {/* end auditSubTab === "programs" */}

              {/* ══════════════════════════════════════════════════════════════
                  CONTROLS ASSESSMENT
              ══════════════════════════════════════════════════════════════ */}
              {auditSubTab === "controls-assessment" && (() => {
                const CA_TEMPLATES = [
                  { id:"CA-001", title:"Access Control Assessment",          desc:"Evaluate identity and access management controls across all systems and applications.",                 frameworks:["ISO27K","SOC2","NIST CSF"],    coverage:["IAM","MFA","RBAC","PAM"],                     domain:"Access Control",     questions:42, uses:8,  posture:78 },
                  { id:"CA-002", title:"Network Security Review",            desc:"Comprehensive assessment of network architecture, segmentation and perimeter controls.",                frameworks:["NIST CSF","CIS","ISO27K"],     coverage:["Firewall","Segmentation","IDS/IPS","DMZ"],    domain:"Network Security",   questions:38, uses:5,  posture:65 },
                  { id:"CA-003", title:"Data Protection Audit",              desc:"Assess data classification, encryption and data loss prevention controls across all environments.",     frameworks:["GDPR","ISO27K","PCI DSS"],     coverage:["Classification","Encryption","DLP","Backup"], domain:"Data Protection",    questions:56, uses:12, posture:82 },
                  { id:"CA-004", title:"Incident Response Readiness",        desc:"Evaluate the organisation's capability to detect, respond to and recover from security incidents.",    frameworks:["ISO27K","NIST CSF"],           coverage:["IR Plan","Detection","Eradication","Recovery"],domain:"Incident Response",  questions:34, uses:6,  posture:71 },
                  { id:"CA-005", title:"Vulnerability Management Programme", desc:"Review vulnerability scanning coverage, SLAs and remediation tracking processes.",                      frameworks:["CIS","ISO27K","NIST CSF"],     coverage:["Scanning","Patching","Risk Scoring","CVSS"],  domain:"Vulnerability Mgmt", questions:29, uses:4,  posture:68 },
                  { id:"CA-006", title:"Cloud Security Posture",             desc:"Assess cloud infrastructure configuration against CIS benchmarks and CSA CCM controls.",               frameworks:["SOC2","CIS","CSA CCM"],        coverage:["Config Mgmt","Cloud IAM","Logging","Secrets"], domain:"Cloud Security",     questions:47, uses:9,  posture:74 },
                  { id:"CA-007", title:"Third-Party Risk Assessment",        desc:"Evaluate vendor security controls, due diligence processes and contractual obligations.",              frameworks:["ISO27K","SOC2","SEBI CSCRF"],  coverage:["Due Diligence","Contracts","SLAs","Monitoring"],domain:"Third-Party Risk",   questions:31, uses:3,  posture:59 },
                  { id:"CA-008", title:"Business Continuity Review",         desc:"Assess BCP/DR capabilities, RTO/RPO targets and resilience testing evidence.",                          frameworks:["ISO 22301","ISO27K"],          coverage:["BCP","DR","RTO/RPO","Crisis Mgmt"],           domain:"Business Continuity",questions:25, uses:2,  posture:80 },
                  { id:"CA-009", title:"Security Awareness & Training",      desc:"Evaluate security culture, training programmes and phishing simulation results.",                       frameworks:["ISO27K","NIST CSF"],           coverage:["Training","Phishing Sims","Policy Accept"],   domain:"People Security",    questions:22, uses:7,  posture:88 },
                  { id:"CA-010", title:"Privileged Access Management",       desc:"Review PAM controls, admin account governance and just-in-time access practices.",                     frameworks:["CIS","NIST CSF","ISO27K"],     coverage:["PAM","Admin Accts","JIT Access","Session Rec"],domain:"Access Control",     questions:33, uses:6,  posture:72 },
                  { id:"CA-011", title:"Cryptography & Key Management",      desc:"Assess cryptographic standards, key lifecycle management and certificate governance.",                  frameworks:["ISO27K","PCI DSS","NIST CSF"], coverage:["Key Mgmt","TLS","HSM","Cert Lifecycle"],      domain:"Cryptography",       questions:28, uses:3,  posture:77 },
                  { id:"CA-012", title:"Physical & Environmental Controls",  desc:"Review physical access controls, environmental monitoring and equipment security.",                    frameworks:["ISO27K","SOC2"],               coverage:["Physical Access","CCTV","Environmental"],     domain:"Physical Security",  questions:20, uses:2,  posture:90 },
                  { id:"CA-013", title:"AI Governance Assessment",           desc:"Assess AI/ML system governance, model risk management and fairness controls per ISO 42001.",           frameworks:["ISO 42001","NIST AI RMF"],     coverage:["Model Risk","Bias Testing","Human Oversight"],domain:"AI Governance",      questions:36, uses:1,  posture:55 },
                  { id:"CA-014", title:"Secure Development Lifecycle",       desc:"Evaluate SDLC security practices including code review, SAST/DAST and security testing.",             frameworks:["ISO27K","CIS","OWASP"],        coverage:["SAST","DAST","Code Review","Secrets Scan"],   domain:"Application Security",questions:44, uses:5, posture:67 },
                  { id:"CA-015", title:"Logging & Monitoring Review",        desc:"Assess SIEM coverage, log retention policies and security monitoring effectiveness.",                   frameworks:["ISO27K","SOC2","NIST CSF"],    coverage:["SIEM","Log Retention","Alerting","Threat Det"],domain:"Security Operations",questions:30, uses:4, posture:73 },
                  { id:"CA-016", title:"Change Management Controls",         desc:"Review change management processes, approval workflows and emergency change procedures.",               frameworks:["ISO27K","SOC2","ITIL"],        coverage:["CAB","Emergency Changes","Rollback","Config"], domain:"IT Governance",      questions:26, uses:6,  posture:83 },
                  { id:"CA-017", title:"Endpoint Security Assessment",       desc:"Evaluate endpoint protection, mobile device management and patch compliance across the estate.",       frameworks:["CIS","ISO27K","NIST CSF"],     coverage:["EDR","MDM","Patch Compliance","Disk Enc"],    domain:"Endpoint Security",  questions:32, uses:3,  posture:76 },
                  { id:"CA-018", title:"Identity Governance & Administration",desc:"Review IGA processes, role mining, entitlement reviews and user lifecycle management.",               frameworks:["ISO27K","SOC2","CIS"],         coverage:["IGA","Role Mining","Entitlement Review"],     domain:"Access Control",     questions:39, uses:4,  posture:69 },
                  { id:"CA-019", title:"Privacy Controls Assessment",        desc:"Evaluate privacy-by-design implementation, DSAR processes and consent management.",                    frameworks:["GDPR","DPDPA","ISO 27701"],    coverage:["Privacy-by-Design","DSAR","Consent Mgmt"],    domain:"Privacy & Data",     questions:48, uses:5,  posture:71 },
                ];

                const CA_Q_BANK: Record<string, Array<{id:string;text:string;ref:string;risk:string}>> = {
                  "Access Control": [
                    {id:"AC1",text:"Are all privileged accounts protected with multi-factor authentication (MFA)?",ref:"ISO27K A.8.2",risk:"Critical"},
                    {id:"AC2",text:"Is just-in-time (JIT) access enforced for all administrative activities?",ref:"ISO27K A.8.18",risk:"High"},
                    {id:"AC3",text:"Are formal user access reviews conducted at least quarterly?",ref:"ISO27K A.5.18",risk:"High"},
                    {id:"AC4",text:"Are dormant accounts automatically disabled after 90 days of inactivity?",ref:"ISO27K A.8.2",risk:"Medium"},
                    {id:"AC5",text:"Is RBAC consistently enforced across all systems and applications?",ref:"ISO27K A.5.15",risk:"Medium"},
                    {id:"AC6",text:"Are service accounts inventoried with named owners and formal approval?",ref:"ISO27K A.8.2",risk:"High"},
                    {id:"AC7",text:"Is a PAM solution in place with session recording for all admin sessions?",ref:"CIS Control 5",risk:"High"},
                    {id:"AC8",text:"Are all default vendor credentials changed on system commissioning?",ref:"CIS Control 4",risk:"Critical"},
                  ],
                  "Network Security": [
                    {id:"NS1",text:"Is network segmentation implemented between all security zones (prod/dev/DMZ)?",ref:"ISO27K A.8.20",risk:"High"},
                    {id:"NS2",text:"Are firewall rule reviews conducted at least quarterly by the security team?",ref:"CIS Control 12",risk:"Medium"},
                    {id:"NS3",text:"Is an IDS/IPS in place monitoring all traffic at the network perimeter?",ref:"ISO27K A.8.16",risk:"High"},
                    {id:"NS4",text:"Are network device configurations backed up and version-controlled?",ref:"CIS Control 11",risk:"Medium"},
                    {id:"NS5",text:"Is the DMZ correctly configured to isolate all public-facing services?",ref:"ISO27K A.8.20",risk:"High"},
                    {id:"NS6",text:"Is network access control (NAC) enforced for all connecting endpoints?",ref:"CIS Control 12",risk:"Medium"},
                    {id:"NS7",text:"Are all wireless networks encrypted using WPA3 or equivalent cipher?",ref:"ISO27K A.8.20",risk:"Medium"},
                    {id:"NS8",text:"Is east-west traffic within the data centre inspected by a next-gen firewall?",ref:"NIST CSF PR.PT",risk:"High"},
                  ],
                  "Data Protection": [
                    {id:"DP1",text:"Is a data classification policy documented and enforced across all business units?",ref:"ISO27K A.5.12",risk:"High"},
                    {id:"DP2",text:"Is data at rest encrypted using AES-256 or an equivalent approved algorithm?",ref:"ISO27K A.8.24",risk:"Critical"},
                    {id:"DP3",text:"Is all data in transit protected using TLS 1.2 or higher?",ref:"ISO27K A.8.24",risk:"Critical"},
                    {id:"DP4",text:"Are DLP controls preventing unauthorised exfiltration via email/USB/cloud?",ref:"ISO27K A.8.12",risk:"High"},
                    {id:"DP5",text:"Are backup processes regularly tested with documented recovery time evidence?",ref:"ISO27K A.8.13",risk:"High"},
                    {id:"DP6",text:"Is a data retention and disposal policy enforced with formal records?",ref:"ISO27K A.5.33",risk:"Medium"},
                    {id:"DP7",text:"Are database access logs monitored for anomalous query patterns?",ref:"ISO27K A.8.15",risk:"High"},
                    {id:"DP8",text:"Is sensitive data masked or anonymised in all non-production environments?",ref:"GDPR Art.25",risk:"High"},
                  ],
                  "Incident Response": [
                    {id:"IR1",text:"Is a formal Incident Response Plan (IRP) documented, approved, and tested?",ref:"ISO27K A.5.26",risk:"Critical"},
                    {id:"IR2",text:"Are IR roles, responsibilities, and escalation paths clearly documented?",ref:"ISO27K A.5.26",risk:"High"},
                    {id:"IR3",text:"Is an incident severity classification matrix defined and communicated?",ref:"NIST SP800-61",risk:"Medium"},
                    {id:"IR4",text:"Were IR procedures tested through a tabletop exercise in the last 12 months?",ref:"ISO27K A.5.36",risk:"High"},
                    {id:"IR5",text:"Are post-incident reviews (PIR) completed and actioned for all P1/P2 incidents?",ref:"ISO27K A.5.27",risk:"Medium"},
                    {id:"IR6",text:"Is the CSIRT/SOC team available 24/7 for critical incident response?",ref:"ISO27K A.5.26",risk:"High"},
                    {id:"IR7",text:"Are communication templates prepared for regulatory and customer notification?",ref:"GDPR Art.33",risk:"High"},
                    {id:"IR8",text:"Is forensic evidence preservation capability documented and tested?",ref:"ISO27K A.5.28",risk:"Medium"},
                  ],
                  "Vulnerability Mgmt": [
                    {id:"VM1",text:"Are vulnerability scans run across all internal and external assets at least monthly?",ref:"CIS Control 7",risk:"High"},
                    {id:"VM2",text:"Are critical vulnerabilities (CVSS 9.0+) remediated within 72 hours of discovery?",ref:"ISO27K A.8.8",risk:"Critical"},
                    {id:"VM3",text:"Is a comprehensive and continuously updated asset inventory maintained?",ref:"CIS Control 1",risk:"High"},
                    {id:"VM4",text:"Is an annual penetration test conducted by an accredited provider?",ref:"ISO27K A.8.8",risk:"High"},
                    {id:"VM5",text:"Are third-party software components tracked for known CVEs (SCA tooling)?",ref:"NIST CSF ID.RA",risk:"Medium"},
                    {id:"VM6",text:"Is risk acceptance for unpatched vulnerabilities formally documented?",ref:"ISO27K A.8.8",risk:"Medium"},
                    {id:"VM7",text:"Are container images scanned in CI/CD pipelines before deployment?",ref:"CIS Control 7",risk:"High"},
                    {id:"VM8",text:"Is a formal SLA defined for vulnerability remediation by severity tier?",ref:"ISO27K A.8.8",risk:"Medium"},
                  ],
                  "Cloud Security": [
                    {id:"CS1",text:"Is cloud infrastructure continuously assessed against CIS Benchmarks?",ref:"CIS Benchmark",risk:"High"},
                    {id:"CS2",text:"Are cloud IAM permissions reviewed quarterly for least-privilege compliance?",ref:"CIS Control 5",risk:"High"},
                    {id:"CS3",text:"Is MFA enforced for all cloud console and API access?",ref:"ISO27K A.8.2",risk:"Critical"},
                    {id:"CS4",text:"Are all cloud storage buckets/blobs audited for public accessibility?",ref:"CIS AWS/Azure",risk:"Critical"},
                    {id:"CS5",text:"Is a CSPM tool providing continuous cloud misconfig detection?",ref:"CSA CCM",risk:"High"},
                    {id:"CS6",text:"Are cloud API keys and secrets rotated regularly (every 90 days or less)?",ref:"CIS Control 5",risk:"High"},
                    {id:"CS7",text:"Are cloud activity logs forwarded to a centralised SIEM for analysis?",ref:"ISO27K A.8.15",risk:"Medium"},
                    {id:"CS8",text:"Is cloud workload protection (CWPP) deployed across all compute instances?",ref:"CSA CCM",risk:"High"},
                  ],
                };

                const CA_RUNS_SEED = [
                  { id:"RUN-001", templateId:"CA-001", template:"Access Control Assessment",       started:"2024-05-20", completed:"2024-05-21", owner:"Nadia Hassan",  status:"completed",   score:82, pass:28, partial:6, fail:5, na:3 },
                  { id:"RUN-002", templateId:"CA-006", template:"Cloud Security Posture",          started:"2024-06-01", completed:null,          owner:"Alex Kim",     status:"in-progress", score:null, pass:12, partial:4, fail:0, na:0 },
                  { id:"RUN-003", templateId:"CA-003", template:"Data Protection Audit",           started:"2024-06-08", completed:null,          owner:"Priya Lee",    status:"in-progress", score:null, pass:18, partial:7, fail:3, na:0 },
                ];

                const fwColor: Record<string,{bg:string;color:string}> = {
                  "ISO27K":     {bg:"rgba(59,130,246,0.12)",  color:"#2563EB"},
                  "SOC2":       {bg:"rgba(139,92,246,0.12)",  color:"#7C3AED"},
                  "NIST CSF":   {bg:"rgba(16,185,129,0.12)",  color:"#059669"},
                  "CIS":        {bg:"rgba(14,165,233,0.12)",  color:"#0284C7"},
                  "GDPR":       {bg:"rgba(236,72,153,0.12)",  color:"#DB2777"},
                  "PCI DSS":    {bg:"rgba(239,68,68,0.12)",   color:"#DC2626"},
                  "ISO 22301":  {bg:"rgba(14,165,233,0.12)",  color:"#0284C7"},
                  "ISO 42001":  {bg:"rgba(251,146,60,0.12)",  color:"#EA580C"},
                  "CSA CCM":    {bg:"rgba(20,184,166,0.12)",  color:"#0D9488"},
                  "SEBI CSCRF": {bg:"rgba(132,204,22,0.12)",  color:"#65A30D"},
                  "DPDPA":      {bg:"rgba(236,72,153,0.12)",  color:"#DB2777"},
                  "ISO 27701":  {bg:"rgba(99,102,241,0.12)",  color:"#4F46E5"},
                  "OWASP":      {bg:"rgba(239,68,68,0.12)",   color:"#DC2626"},
                  "ITIL":       {bg:"rgba(75,85,99,0.12)",    color:"#4B5563"},
                  "NIST AI RMF":{bg:"rgba(251,146,60,0.12)",  color:"#EA580C"},
                };

                const CA_DOMAINS = ["All","Access Control","Network Security","Data Protection","Incident Response","Vulnerability Mgmt","Cloud Security","Application Security","People Security","Physical Security","Privacy & Data","AI Governance","IT Governance","Security Operations","Cryptography","Endpoint Security","Third-Party Risk","Business Continuity"];

                const allRuns = [...CA_RUNS_SEED, ...caLocalRuns];
                const filtered = CA_TEMPLATES.filter(t =>
                  (caDomain === "All" || t.domain === caDomain) &&
                  (caSearch === "" || t.title.toLowerCase().includes(caSearch.toLowerCase()) || t.frameworks.some(f => f.toLowerCase().includes(caSearch.toLowerCase())))
                );
                const inProgress = allRuns.filter(r => r.status === "in-progress").length;
                const avgPosture = Math.round(CA_TEMPLATES.reduce((s,t) => s + t.posture, 0) / CA_TEMPLATES.length);

                const getQuestions = (tmpl: any) => {
                  const bank = CA_Q_BANK[tmpl.domain as string] ?? CA_Q_BANK["Access Control"];
                  return bank;
                };

                const startAssessment = (tmpl: any) => {
                  setCaAssessModal({ template: tmpl, step: 1, config: { scope:"", assessor:"", dueDate:"" }, answers: {} });
                };

                const scoreColor = (s: number) => s >= 80 ? "#059669" : s >= 60 ? "#D97706" : "#DC2626";
                const scoreBg    = (s: number) => s >= 80 ? "rgba(16,185,129,0.1)" : s >= 60 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)";
                const scoreBorder= (s: number) => s >= 80 ? "rgba(16,185,129,0.3)" : s >= 60 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

                /* ── ASSESSMENT WIZARD MODAL ─────────────────────────────────── */
                if (caAssessModal) {
                  const { template: tmpl, step, config, answers } = caAssessModal;
                  const questions = getQuestions(tmpl);
                  const answered  = Object.keys(answers).length;
                  const pct       = Math.round(answered / questions.length * 100);
                  const passCount = Object.values(answers).filter((a:any) => a === "pass").length;
                  const partCount = Object.values(answers).filter((a:any) => a === "partial").length;
                  const failCount = Object.values(answers).filter((a:any) => a === "fail").length;
                  const naCount   = Object.values(answers).filter((a:any) => a === "na").length;
                  const scoreable = questions.length - naCount;
                  const score     = scoreable > 0 ? Math.round((passCount + partCount * 0.5) / scoreable * 100) : 0;

                  const ansBtn = (qid: string, val: string, label: string, col: string, bg: string) => (
                    <button key={val} onClick={() => setCaAssessModal((p:any) => ({...p, answers: {...p.answers, [qid]: val}}))}
                      style={{ flex:1, padding:"6px 0", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.12s",
                        border: answers[qid] === val ? `2px solid ${col}` : "1px solid var(--border)",
                        background: answers[qid] === val ? bg : "transparent",
                        color: answers[qid] === val ? col : "var(--muted-foreground)" }}>
                      {label}
                    </button>
                  );

                  const saveRun = () => {
                    const runId = `RUN-${String(allRuns.length + 1).padStart(3,"0")}`;
                    setCaLocalRuns((p:any[]) => [...p, {
                      id: runId, templateId: tmpl.id, template: tmpl.title,
                      started: new Date().toISOString().slice(0,10),
                      completed: new Date().toISOString().slice(0,10),
                      owner: config.assessor || "Current User",
                      status: "completed", score, pass: passCount, partial: partCount, fail: failCount, na: naCount
                    }]);
                    setCaAssessModal(null);
                    setCaSubTab("runs");
                  };

                  return (
                    <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                      <div style={{ background:"var(--input)", borderRadius:16, width:"100%", maxWidth:660, maxHeight:"90vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>

                        {/* Modal header */}
                        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
                          <div>
                            <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)" }}>{tmpl.title}</div>
                            <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>
                              {step === 1 && "Step 1 of 3 — Configure Assessment"}
                              {step === 2 && `Step 2 of 3 — Answer Questions (${answered}/${questions.length})`}
                              {step === 3 && "Step 3 of 3 — Assessment Results"}
                            </div>
                          </div>
                          <button onClick={() => setCaAssessModal(null)} style={{ background:"transparent", border:"none", fontSize:18, color:"var(--muted-foreground)", cursor:"pointer", padding:4 }}>✕</button>
                        </div>

                        {/* Step progress bar */}
                        <div style={{ height:3, background:"var(--border)", flexShrink:0 }}>
                          <div style={{ height:3, background:"rgb(147,197,253)", width:`${step === 1 ? 33 : step === 2 ? 66 : 100}%`, transition:"width 0.3s" }} />
                        </div>

                        {/* Step 1: Configure */}
                        {step === 1 && (
                          <div style={{ padding:"24px", display:"flex", flexDirection:"column", gap:18, overflow:"auto", flex:1 }}>
                            <div style={{ background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:10, padding:"14px 16px", display:"flex", gap:12 }}>
                              <div style={{ fontSize:13 }}>ℹ️</div>
                              <div style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.6 }}>
                                <strong style={{ color:"var(--foreground)" }}>{tmpl.questions} questions</strong> across {tmpl.coverage.join(", ")} domains.
                                Frameworks: {tmpl.frameworks.join(", ")}. Est. time: {Math.round(tmpl.questions * 1.2)} minutes.
                              </div>
                            </div>
                            {[
                              { key:"scope",     label:"Assessment Scope",   ph:"e.g. All IT systems — Mumbai HQ, AWS ap-south-1", type:"text" },
                              { key:"assessor",  label:"Lead Assessor",      ph:"e.g. Nadia Hassan",                               type:"text" },
                              { key:"dueDate",   label:"Due Date",           ph:"",                                                type:"date" },
                            ].map(f => (
                              <div key={f.key}>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{f.label}</div>
                                <input type={f.type} value={(config as any)[f.key]} placeholder={f.ph}
                                  onChange={e => setCaAssessModal((p:any) => ({...p, config:{...p.config, [f.key]: e.target.value}}))}
                                  style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--foreground)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                              </div>
                            ))}
                            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
                              <button onClick={() => setCaAssessModal(null)} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>Cancel</button>
                              <button onClick={() => setCaAssessModal((p:any) => ({...p, step:2}))} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"rgb(147,197,253)", color:"#0F172A", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                Start Assessment →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step 2: Questions */}
                        {step === 2 && (
                          <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
                            {/* Progress */}
                            <div style={{ padding:"12px 24px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:11 }}>
                                <span style={{ color:"var(--muted-foreground)" }}>Progress</span>
                                <span style={{ fontWeight:700, color:"var(--foreground)" }}>{pct}% complete</span>
                              </div>
                              <div style={{ height:6, background:"var(--border)", borderRadius:3 }}>
                                <div style={{ height:6, background:"rgb(147,197,253)", borderRadius:3, width:`${pct}%`, transition:"width 0.2s" }} />
                              </div>
                            </div>
                            {/* Questions */}
                            <div style={{ flex:1, overflow:"auto", padding:"16px 24px", display:"flex", flexDirection:"column", gap:12 }}>
                              {questions.map((q, i) => (
                                <div key={q.id} style={{ background:"var(--card)", border:`1px solid ${answers[q.id] ? "rgba(147,197,253,0.3)" : "var(--border)"}`, borderRadius:10, padding:"14px 16px", transition:"border-color 0.15s" }}>
                                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                                    <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.5, flex:1, paddingRight:12 }}>
                                      <span style={{ fontWeight:700, color:"var(--muted-foreground)", marginRight:8 }}>Q{i+1}.</span>
                                      {q.text}
                                    </div>
                                    <div style={{ display:"flex", flexDirection:"column", gap:3, flexShrink:0 }}>
                                      <span style={{ fontSize:9, fontWeight:700, color:"#60A5FA", background:"rgba(59,130,246,0.1)", borderRadius:4, padding:"2px 7px", textAlign:"center" }}>{q.ref}</span>
                                      <span style={{ fontSize:9, fontWeight:700, color: q.risk === "Critical" ? "#EF4444" : q.risk === "High" ? "#F59E0B" : "#60A5FA", background: q.risk === "Critical" ? "rgba(239,68,68,0.1)" : q.risk === "High" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)", borderRadius:4, padding:"2px 7px", textAlign:"center" }}>{q.risk}</span>
                                    </div>
                                  </div>
                                  <div style={{ display:"flex", gap:6 }}>
                                    {ansBtn(q.id,"pass","✓ Pass","#059669","rgba(16,185,129,0.12)")}
                                    {ansBtn(q.id,"partial","◑ Partial","#D97706","rgba(245,158,11,0.12)")}
                                    {ansBtn(q.id,"fail","✗ Fail","#DC2626","rgba(239,68,68,0.12)")}
                                    {ansBtn(q.id,"na","— N/A","#6B7280","rgba(107,114,128,0.1)")}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
                              <button onClick={() => setCaAssessModal((p:any) => ({...p, step:1}))} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>← Back</button>
                              <button onClick={() => setCaAssessModal((p:any) => ({...p, step:3}))} disabled={answered < 1}
                                style={{ padding:"9px 20px", borderRadius:8, border:"none", background: answered < 1 ? "rgba(147,197,253,0.3)" : "rgb(147,197,253)", color:"#0F172A", fontSize:12, fontWeight:700, cursor: answered < 1 ? "not-allowed" : "pointer" }}>
                                View Results →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Step 3: Results */}
                        {step === 3 && (
                          <div style={{ flex:1, overflow:"auto", padding:"24px", display:"flex", flexDirection:"column", gap:20 }}>
                            {/* Score hero */}
                            <div style={{ textAlign:"center", padding:"20px 0 8px" }}>
                              <div style={{ fontSize:56, fontWeight:900, fontFamily:"monospace", color:scoreColor(score) }}>{score}%</div>
                              <div style={{ fontSize:13, fontWeight:700, color: score >= 80 ? "#059669" : score >= 60 ? "#D97706" : "#DC2626", marginTop:4 }}>
                                {score >= 80 ? "Good Posture" : score >= 60 ? "Needs Improvement" : "At Risk"}
                              </div>
                              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>Based on {answered} of {questions.length} questions answered</div>
                            </div>

                            {/* Breakdown */}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                              {[
                                {label:"Pass",    value:passCount, color:"#059669", bg:"rgba(16,185,129,0.1)"},
                                {label:"Partial", value:partCount, color:"#D97706", bg:"rgba(245,158,11,0.1)"},
                                {label:"Fail",    value:failCount, color:"#DC2626", bg:"rgba(239,68,68,0.1)"},
                                {label:"N/A",     value:naCount,   color:"#6B7280", bg:"rgba(107,114,128,0.1)"},
                              ].map(b => (
                                <div key={b.label} style={{ background:b.bg, borderRadius:10, padding:"12px 16px", textAlign:"center" }}>
                                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"monospace", color:b.color }}>{b.value}</div>
                                  <div style={{ fontSize:10, fontWeight:700, color:b.color, marginTop:3, textTransform:"uppercase" }}>{b.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* Failed questions */}
                            {failCount > 0 && (
                              <div>
                                <div style={{ fontSize:12, fontWeight:700, color:"#DC2626", marginBottom:8 }}>⚠️ Findings Requiring Remediation ({failCount})</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                  {questions.filter(q => answers[q.id] === "fail").map(q => (
                                    <div key={q.id} style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 12px", fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>
                                      <span style={{ color:"#DC2626", fontWeight:700 }}>✗ </span>{q.text}
                                      <span style={{ marginLeft:8, fontSize:9, color:"#DC2626", fontWeight:700 }}>{q.ref}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
                              <button onClick={() => setCaAssessModal((p:any) => ({...p, step:2}))} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>← Back to Questions</button>
                              <button onClick={saveRun} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#059669", color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Assessment Report</button>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  );
                }

                /* ── MAIN TEMPLATE LIBRARY VIEW ──────────────────────────────── */
                return (
                  <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>

                    {/* KPI row */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                      {[
                        {label:"Library Templates", value:CA_TEMPLATES.length, color:"#2563EB", sub:"Framework-aligned"},
                        {label:"Custom Templates",  value:0,                   color:"#7C3AED", sub:"Organisation-specific"},
                        {label:"In Progress",       value:inProgress,          color:"#D97706", sub:"Active assessments"},
                        {label:"Avg Posture Score", value:`${avgPosture}%`,    color:avgPosture >= 75 ? "#059669" : "#D97706", sub:"Across all templates"},
                      ].map(k => (
                        <div key={k.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, borderRadius:"12px 12px 0 0" }} />
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>{k.label}</div>
                          <div style={{ fontSize:28, fontWeight:900, fontFamily:"monospace", color:k.color }}>{k.value}</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>{k.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sub-tabs */}
                    <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)" }}>
                      {[
                        {key:"library", label:"Template Library", count:CA_TEMPLATES.length},
                        {key:"custom",  label:"My Templates",     count:0},
                        {key:"runs",    label:"Assessment Runs",  count:allRuns.length},
                      ].map(t => (
                        <button key={t.key} onClick={() => setCaSubTab(t.key)}
                          style={{ padding:"10px 18px", fontSize:12, fontWeight:600, border:"none", background:"transparent", cursor:"pointer", transition:"all 0.15s",
                            color: caSubTab === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)",
                            borderBottom: caSubTab === t.key ? "2px solid rgb(147,197,253)" : "2px solid transparent",
                            display:"flex", alignItems:"center", gap:6 }}>
                          {t.label}
                          <span style={{ fontSize:10, fontWeight:700, background: caSubTab === t.key ? "rgba(147,197,253,0.15)" : "rgba(148,163,184,0.1)", color: caSubTab === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)", borderRadius:10, padding:"1px 7px" }}>{t.count}</span>
                        </button>
                      ))}
                    </div>

                    {/* ── Template Library ── */}
                    {caSubTab === "library" && <>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <div style={{ position:"relative", flex:1, maxWidth:300 }}>
                          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"var(--muted-foreground)" }}>🔍</span>
                          <input value={caSearch} onChange={e => setCaSearch(e.target.value)} placeholder="Search templates, frameworks…"
                            style={{ width:"100%", paddingLeft:34, paddingRight:12, height:36, borderRadius:9, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                        </div>
                        <select value={caDomain} onChange={e => setCaDomain(e.target.value)}
                          style={{ height:36, borderRadius:9, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, padding:"0 12px", outline:"none" }}>
                          {CA_DOMAINS.map(d => <option key={d}>{d}</option>)}
                        </select>
                        <div style={{ marginLeft:"auto", fontSize:12, color:"var(--muted-foreground)" }}>{filtered.length} templates</div>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                        {filtered.map(t => (
                          <div key={t.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:10, transition:"all 0.15s", cursor:"default" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(147,197,253,0.4)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                              <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", lineHeight:1.3, flex:1 }}>{t.title}</div>
                              <span style={{ fontSize:11, fontWeight:800, fontFamily:"monospace", color:scoreColor(t.posture), background:scoreBg(t.posture), border:`1px solid ${scoreBorder(t.posture)}`, borderRadius:7, padding:"3px 9px", flexShrink:0 }}>{t.posture}%</span>
                            </div>
                            <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>{t.desc}</div>

                            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                              {t.frameworks.map(fw => {
                                const s = fwColor[fw] ?? {bg:"rgba(148,163,184,0.12)",color:"#6B7280"};
                                return <span key={fw} style={{ fontSize:10, fontWeight:700, background:s.bg, color:s.color, borderRadius:5, padding:"2px 8px" }}>{fw}</span>;
                              })}
                            </div>

                            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                              {t.coverage.map(c => <span key={c} style={{ fontSize:10, color:"var(--muted-foreground)", background:"rgba(148,163,184,0.08)", border:"1px solid var(--border)", borderRadius:5, padding:"2px 7px" }}>{c}</span>)}
                            </div>

                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:8, borderTop:"1px solid var(--border)", marginTop:"auto" }}>
                              <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{t.questions} questions · Used {t.uses}×</div>
                              <button onClick={() => startAssessment(t)} style={{ fontSize:11, fontWeight:700, background:"rgb(147,197,253)", color:"#0F172A", border:"none", borderRadius:7, padding:"7px 16px", cursor:"pointer", transition:"opacity 0.15s" }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                                Start Assessment
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>}

                    {/* ── My Templates ── */}
                    {caSubTab === "custom" && (
                      <div style={{ textAlign:"center", padding:"70px 0" }}>
                        <div style={{ fontSize:40, marginBottom:14 }}>📋</div>
                        <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)", marginBottom:8 }}>No Custom Templates Yet</div>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:360, margin:"0 auto", lineHeight:1.7 }}>
                          Create custom assessment templates tailored to your organisation's specific security requirements, internal policies and control frameworks.
                        </div>
                        <button style={{ marginTop:22, padding:"10px 26px", borderRadius:9, border:"none", background:"rgb(147,197,253)", color:"#0F172A", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                          + Create Template
                        </button>
                      </div>
                    )}

                    {/* ── Assessment Runs ── */}
                    {caSubTab === "runs" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {allRuns.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted-foreground)" }}>
                            <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
                            <div style={{ fontSize:14, fontWeight:700, color:"var(--foreground)" }}>No assessment runs yet</div>
                            <div style={{ fontSize:12, marginTop:6 }}>Start an assessment from the Template Library to see results here.</div>
                          </div>
                        ) : allRuns.map(r => (
                          <div key={r.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
                            <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted-foreground)", width:72, flexShrink:0 }}>{r.id}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.template}</div>
                              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>
                                Started {r.started}
                                {r.owner ? ` · ${r.owner}` : ""}
                                {r.status === "completed" && ` · Pass:${r.pass} Partial:${r.partial} Fail:${r.fail}`}
                              </div>
                            </div>
                            {r.score !== null && r.score !== undefined && (
                              <span style={{ fontSize:15, fontWeight:800, fontFamily:"monospace", color:scoreColor(r.score), minWidth:40, textAlign:"right" }}>{r.score}%</span>
                            )}
                            <span style={{ fontSize:10, fontWeight:700,
                              color: r.status === "completed" ? "#059669" : "#D97706",
                              background: r.status === "completed" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                              border: `1px solid ${r.status === "completed" ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                              borderRadius:7, padding:"4px 11px", flexShrink:0 }}>
                              {r.status === "completed" ? "Completed" : "In Progress"}
                            </span>
                            {r.status === "completed" && (
                              <button style={{ fontSize:11, fontWeight:600, background:"transparent", color:"var(--muted-foreground)", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", cursor:"pointer" }}>
                                View Report
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* ══════════════════════════════════════════════════════════════
                  TABLETOP EXERCISES
              ══════════════════════════════════════════════════════════════ */}
              {auditSubTab === "tabletop" && (() => {
                const TT_SCENARIOS = [
                  {id:"TT-001",title:"Ransomware Attack Response",       desc:"A critical systems ransomware attack has encrypted primary database servers. Test IR plan, escalation chain and business continuity response.",              category:"Cyber Incident",       categoryColor:"#EF4444", categoryBg:"rgba(239,68,68,0.1)",    difficulty:"Advanced",     duration:240, roles:8, controls:14, iso:["A.5.26","A.5.29","A.8.8"],   status:"completed",  score:88},
                  {id:"TT-002",title:"Data Breach Notification",          desc:"PII data of 50,000 customers was exfiltrated. Walk through breach notification obligations under GDPR and DPDPA within the 72-hour window.",                  category:"Privacy",              categoryColor:"#3B82F6", categoryBg:"rgba(59,130,246,0.1)",   difficulty:"Intermediate", duration:180, roles:6, controls:10, iso:["A.5.34","A.8.12","A.6.8"],  status:"scheduled",  score:0},
                  {id:"TT-003",title:"Insider Threat Detection",          desc:"A privileged user is suspected of exfiltrating sensitive IP. Test DLP controls, HR processes and forensic investigation capability.",                          category:"Human Risk",           categoryColor:"#8B5CF6", categoryBg:"rgba(139,92,246,0.1)",   difficulty:"Advanced",     duration:180, roles:5, controls:9,  iso:["A.6.3","A.6.4","A.8.12"],  status:"in-progress",score:0},
                  {id:"TT-004",title:"Critical System Outage",            desc:"Core banking / ERP system is unavailable. Invoke BCP/DR procedures, test RTO targets and validate communication protocols.",                                  category:"Business Continuity",  categoryColor:"#F59E0B", categoryBg:"rgba(245,158,11,0.1)",  difficulty:"Intermediate", duration:240, roles:7, controls:11, iso:["A.5.29","A.5.30","A.8.14"], status:"completed",  score:91},
                  {id:"TT-005",title:"Supply Chain Compromise",           desc:"A critical third-party software vendor has been compromised. Assess supplier security monitoring, incident isolation and recovery procedures.",                category:"Cyber Incident",       categoryColor:"#EF4444", categoryBg:"rgba(239,68,68,0.1)",    difficulty:"Advanced",     duration:210, roles:9, controls:13, iso:["A.5.19","A.5.20","A.5.21"], status:"completed",  score:79},
                  {id:"TT-006",title:"Regulatory Audit Simulation",       desc:"Simulate a surprise regulator visit (RBI CSITE / SEBI CSCRF). Test documentation readiness, escalation protocols and spokesperson capabilities.",            category:"Compliance",           categoryColor:"#6366F1", categoryBg:"rgba(99,102,241,0.1)",   difficulty:"Intermediate", duration:180, roles:4, controls:8,  iso:["A.5.35","A.5.36","A.5.37"], status:"scheduled",  score:0},
                  {id:"TT-007",title:"Physical Intrusion Incident",       desc:"An unauthorised individual has gained access to your data centre. Test physical security response, evidence preservation and law enforcement escalation.",     category:"Physical Security",    categoryColor:"#10B981", categoryBg:"rgba(16,185,129,0.1)",   difficulty:"Beginner",     duration:120, roles:4, controls:7,  iso:["A.7.2","A.7.3","A.7.4"],    status:"completed",  score:85},
                  {id:"TT-008",title:"Cloud Infrastructure Breach",       desc:"Attacker has lateral movement via misconfigured IAM roles. Test cloud IR runbooks, containment procedures and blast radius assessment.",                       category:"Cyber Incident",       categoryColor:"#EF4444", categoryBg:"rgba(239,68,68,0.1)",    difficulty:"Advanced",     duration:270, roles:6, controls:15, iso:["A.8.6","A.8.9","A.8.20"],   status:"scheduled",  score:0},
                  {id:"TT-009",title:"Social Engineering Attack",         desc:"Targeted spear-phishing campaign has compromised an executive's email account. Test security awareness response and account recovery procedures.",              category:"Human Risk",           categoryColor:"#8B5CF6", categoryBg:"rgba(139,92,246,0.1)",   difficulty:"Beginner",     duration:120, roles:3, controls:6,  iso:["A.6.3","A.8.23","A.5.26"],  status:"completed",  score:76},
                  {id:"TT-010",title:"DDoS Attack Response",              desc:"External-facing services are under a sustained DDoS attack. Test CDN failover, WAF rules, ISP escalation and customer communication protocols.",              category:"Business Continuity",  categoryColor:"#F59E0B", categoryBg:"rgba(245,158,11,0.1)",  difficulty:"Intermediate", duration:150, roles:5, controls:8,  iso:["A.8.20","A.8.21","A.5.30"], status:"completed",  score:83},
                  {id:"TT-011",title:"AI System Governance Failure",      desc:"Deployed AI model is producing biased outputs. Test AI governance policies, rollback procedures and stakeholder communication under ISO 42001.",               category:"Compliance",           categoryColor:"#6366F1", categoryBg:"rgba(99,102,241,0.1)",   difficulty:"Intermediate", duration:150, roles:5, controls:7,  iso:["A.5.36","A.5.37"],           status:"completed",  score:80},
                  {id:"TT-012",title:"Healthcare Data Misuse",            desc:"Patient/employee health data has been accessed without authorisation. Test DPDPA breach response, HR processes and regulatory notification.",                 category:"Privacy",              categoryColor:"#3B82F6", categoryBg:"rgba(59,130,246,0.1)",   difficulty:"Intermediate", duration:120, roles:4, controls:8,  iso:["A.5.34","A.6.8"],            status:"completed",  score:87},
                ];

                const TT_INJECTS: Record<string, Array<{time:string;title:string;desc:string;action:string}>> = {
                  "TT-001": [
                    {time:"T+0:00", title:"Initial EDR Alert",      desc:"EDR alert: ransomware signatures detected on 3 endpoints in Finance department. Files with .enc extension appearing.",                              action:"Activate IR team. Isolate affected endpoints immediately."},
                    {time:"T+0:15", title:"Spread to File Servers", desc:"Encryption spreading to FS-FINANCE-01. 40 GB of data encrypted. Network team reports unusual SMB lateral movement.",                               action:"Invoke network segmentation. Block SMB ports 445/139."},
                    {time:"T+0:30", title:"Executive Escalation",   desc:"CFO reports inability to access payroll system. Board requests status update. Media inquiry received from Financial Times.",                        action:"Invoke Crisis Communication Plan. Assign media spokesperson."},
                    {time:"T+1:00", title:"Patient Zero Identified", desc:"IR team identifies patient zero: phishing email opened by Finance Manager. C2 server at known malicious IP identified in firewall logs.",          action:"Block C2 IP. Preserve forensic evidence. Notify legal."},
                    {time:"T+2:00", title:"Recovery Decision",      desc:"Attacker demanding $2.5M ransom. Backups confirmed available for 94% of affected data. Board wants RTO assessment for critical systems.",          action:"Invoke DR plan. Assess backup recovery timeline vs. RTO."},
                  ],
                  "TT-002": [
                    {time:"T+0:00", title:"Breach Discovery",       desc:"DLP alert: bulk export of customer PII (name, email, DOB, NIN) detected from CRM system. 50,000 records potentially exfiltrated.",                action:"Invoke Privacy Incident Response. Notify DPO immediately."},
                    {time:"T+0:30", title:"Forensic Triage",        desc:"Database access logs confirm exfiltration via compromised service account. Attacker accessed system for 72 hours before detection.",                action:"Revoke compromised credentials. Preserve forensic artefacts."},
                    {time:"T+1:00", title:"Regulatory Clock Starts", desc:"DPO confirms GDPR Art.33 72-hour notification window to supervisory authority (ICO/DPDPA) has started. Legal counsel engaged.",                  action:"Draft supervisory authority notification. Identify affected data subjects."},
                    {time:"T+2:00", title:"Media Inquiry",          desc:"BBC Technology correspondent has obtained breach information. Customer social media complaints trending. Stock price declining.",                    action:"Activate customer communication plan. Prepare press statement."},
                    {time:"T+3:00", title:"Regulatory Response",    desc:"ICO acknowledges notification. Requests additional information within 7 days. Class-action law firm contacted by affected customers.",              action:"Prepare supplementary regulatory response. Engage crisis PR firm."},
                  ],
                  "TT-003": [
                    {time:"T+0:00", title:"DLP Alert Triggered",    desc:"DLP solution alerts on bulk download of 2,000 confidential customer contracts to personal USB drive by Senior Database Administrator.",             action:"Do NOT alert suspect. Covertly preserve DLP logs. Engage HR and Legal."},
                    {time:"T+0:30", title:"SIEM Correlation",       desc:"SIEM correlates: same user accessed restricted project folders, emailed files to personal Gmail, and disabled antivirus on workstation.",          action:"Initiate covert monitoring. Block personal email egress. Preserve evidence chain."},
                    {time:"T+1:00", title:"HR Decision Required",   desc:"HR Director requests guidance: suspend the employee now or continue covert monitoring? Legal flags potential unfair dismissal liability.",          action:"Conduct legal risk vs. security risk analysis. Decide monitoring scope."},
                    {time:"T+2:00", title:"Suspect Confrontation",  desc:"Employee confronted by HR with evidence. Denies wrongdoing. Claims data was for personal backup. Laptop seized by IT security.",                   action:"Invoke digital forensics procedure. Secure chain of custody."},
                    {time:"T+3:00", title:"Scope Expands",          desc:"Forensic analysis reveals suspect exfiltrated IP to a competitor. Competitor's logo found in personal documents on seized laptop.",                action:"Engage external forensic firm. Notify board. Consider law enforcement."},
                  ],
                };

                const TT_CATS = ["All","Cyber Incident","Privacy","Human Risk","Business Continuity","Physical Security","Compliance"];

                const diffStyle: Record<string,{color:string;bg:string;border:string}> = {
                  "Advanced":     {color:"#DC2626", bg:"rgba(239,68,68,0.1)",   border:"rgba(239,68,68,0.25)"},
                  "Intermediate": {color:"#D97706", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.25)"},
                  "Beginner":     {color:"#059669", bg:"rgba(16,185,129,0.1)",  border:"rgba(16,185,129,0.25)"},
                };
                const statStyle: Record<string,{color:string;bg:string;border:string}> = {
                  "completed":    {color:"#059669", bg:"rgba(16,185,129,0.1)",  border:"rgba(16,185,129,0.25)"},
                  "in-progress":  {color:"#D97706", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.25)"},
                  "scheduled":    {color:"#2563EB", bg:"rgba(59,130,246,0.1)",  border:"rgba(59,130,246,0.25)"},
                };

                const allScenarios = [...TT_SCENARIOS, ...ttLocalEx];
                const filteredTT   = allScenarios.filter(s =>
                  (ttCat === "All" || s.category === ttCat) &&
                  (ttSearch === "" || s.title.toLowerCase().includes(ttSearch.toLowerCase()) || s.category.toLowerCase().includes(ttSearch.toLowerCase()))
                );
                const kTotal     = allScenarios.length;
                const kScheduled = allScenarios.filter(s => s.status === "scheduled").length;
                const kInProg    = allScenarios.filter(s => s.status === "in-progress").length;
                const kDone      = allScenarios.filter(s => s.status === "completed").length;
                const scores     = allScenarios.filter(s => s.score > 0).map(s => s.score);
                const kAvgScore  = scores.length ? Math.round(scores.reduce((a:number,b:number) => a+b, 0) / scores.length) : 0;

                const fmtDur = (m: number) => m >= 60 ? `${Math.floor(m/60)}h${m%60 > 0 ? ` ${m%60}m` : ""}` : `${m}m`;

                /* ── EXERCISE RUNNER MODAL ──────────────────────────────────── */
                if (ttExerciseModal) {
                  const {scenario: sc, phase, notes, injectIdx, scores: scScores} = ttExerciseModal;
                  const injects = TT_INJECTS[sc.id] ?? [];

                  const setPhase  = (p: string) => setTtExerciseModal((prev:any) => ({...prev, phase:p}));
                  const setNotes  = (n: string) => setTtExerciseModal((prev:any) => ({...prev, notes:n}));
                  const nextInject= () => setTtExerciseModal((prev:any) => ({...prev, injectIdx: Math.min(prev.injectIdx + 1, injects.length - 1)}));
                  const setScore  = (k:string, v:number) => setTtExerciseModal((prev:any) => ({...prev, scores:{...prev.scores, [k]:v}}));

                  const overallScore = Object.keys(scScores).length > 0
                    ? Math.round(Object.values(scScores).reduce((a:any,b:any) => a+b, 0) / Object.keys(scScores).length)
                    : 0;

                  const closeExercise = (save?: boolean) => {
                    if (save && overallScore > 0) {
                      setTtLocalEx((p:any[]) => p.map((s:any) => s.id === sc.id ? {...s, status:"completed", score:overallScore} : s));
                    }
                    setTtExerciseModal(null);
                  };

                  return (
                    <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                      <div style={{ background:"var(--input)", borderRadius:16, width:"100%", maxWidth:700, maxHeight:"92vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>

                        {/* Header */}
                        <div style={{ padding:"18px 24px 0", flexShrink:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                                <span style={{ fontSize:10, fontWeight:700, color:sc.categoryColor, background:sc.categoryBg, borderRadius:5, padding:"2px 8px" }}>{sc.category}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:diffStyle[sc.difficulty]?.color ?? "#D97706", background:diffStyle[sc.difficulty]?.bg ?? "rgba(245,158,11,0.1)", border:`1px solid ${diffStyle[sc.difficulty]?.border ?? "rgba(245,158,11,0.25)"}`, borderRadius:5, padding:"2px 8px" }}>{sc.difficulty}</span>
                              </div>
                              <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>{sc.title}</div>
                              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>{fmtDur(sc.duration)} · {sc.roles} roles · {sc.controls} controls</div>
                            </div>
                            <button onClick={() => closeExercise()} style={{ background:"transparent", border:"none", fontSize:18, color:"var(--muted-foreground)", cursor:"pointer" }}>✕</button>
                          </div>
                          {/* Phase tabs */}
                          <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)" }}>
                            {["brief","injects","score"].map(p => (
                              <button key={p} onClick={() => setPhase(p)}
                                style={{ padding:"8px 18px", fontSize:12, fontWeight:600, border:"none", background:"transparent", cursor:"pointer", transition:"all 0.15s",
                                  color: phase === p ? "rgb(147,197,253)" : "var(--muted-foreground)",
                                  borderBottom: phase === p ? "2px solid rgb(147,197,253)" : "2px solid transparent",
                                  textTransform:"capitalize" }}>
                                {p === "brief" ? "📋 Brief" : p === "injects" ? "⚡ Injects" : "📊 Score"}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>

                          {/* Brief */}
                          {phase === "brief" && (
                            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>Scenario Background</div>
                                <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.7, background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>{sc.desc}</div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>Objectives</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                  {["Test escalation and decision-making procedures under pressure","Validate IR plan completeness and team role clarity","Identify gaps in communication protocols (internal and external)","Assess evidence preservation and forensic readiness","Review regulatory notification timelines and obligations"].map((obj,i) => (
                                    <div key={i} style={{ display:"flex", gap:10, fontSize:12, color:"var(--foreground)", lineHeight:1.5 }}>
                                      <span style={{ color:"rgb(147,197,253)", flexShrink:0, marginTop:1 }}>✓</span>
                                      <span>{obj}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>Participant Roles</div>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                                  {["CISO / Security Lead","IT Operations Manager","Legal & Compliance","HR Director","Communications / PR","Finance Director","SOC / IR Team Lead","Executive Sponsor"].slice(0, sc.roles).map((role,i) => (
                                    <div key={i} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px", fontSize:11, color:"var(--foreground)", display:"flex", alignItems:"center", gap:8 }}>
                                      <span style={{ color:sc.categoryColor }}>👤</span>{role}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>ISO 27001 Controls Tested</div>
                                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                                  {sc.iso.map((clause:string) => (
                                    <span key={clause} style={{ fontSize:10, fontWeight:700, background:"rgba(99,102,241,0.1)", color:"#4F46E5", border:"1px solid rgba(99,102,241,0.25)", borderRadius:5, padding:"3px 9px" }}>{clause}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Injects */}
                          {phase === "injects" && (
                            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                              {injects.length === 0 ? (
                                <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted-foreground)" }}>
                                  <div style={{ fontSize:32, marginBottom:10 }}>⚡</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>No injects available for this scenario yet.</div>
                                </div>
                              ) : injects.map((inj, i) => {
                                const revealed = i <= (injectIdx ?? -1);
                                return (
                                  <div key={i} style={{ background: revealed ? "var(--card)" : "rgba(148,163,184,0.04)", border:`1px solid ${revealed ? sc.categoryColor + "44" : "var(--border)"}`, borderRadius:12, padding:"16px 18px", opacity: revealed ? 1 : 0.4, transition:"all 0.3s" }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                        <span style={{ fontSize:10, fontWeight:700, color:sc.categoryColor, background:sc.categoryBg, borderRadius:5, padding:"2px 8px" }}>{inj.time}</span>
                                        <span style={{ fontSize:13, fontWeight:800, color: revealed ? "var(--foreground)" : "var(--muted-foreground)" }}>{inj.title}</span>
                                      </div>
                                      {!revealed && <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>🔒 Not yet revealed</span>}
                                    </div>
                                    {revealed && <>
                                      <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6, marginBottom:10 }}>{inj.desc}</div>
                                      <div style={{ background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:8, padding:"8px 12px", fontSize:11, color:"rgb(147,197,253)", fontWeight:600 }}>
                                        💬 Facilitator Action: {inj.action}
                                      </div>
                                    </>}
                                  </div>
                                );
                              })}
                              {injects.length > 0 && (
                                <div style={{ display:"flex", gap:10, justifyContent:"center", paddingTop:8 }}>
                                  {(injectIdx ?? -1) < injects.length - 1 && (
                                    <button onClick={nextInject} style={{ padding:"10px 24px", borderRadius:9, border:"none", background:sc.categoryColor, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                                      ⚡ Reveal Next Inject ({(injectIdx ?? -1) + 2}/{injects.length})
                                    </button>
                                  )}
                                  {(injectIdx ?? -1) >= injects.length - 1 && (
                                    <div style={{ fontSize:12, color:"#059669", fontWeight:700 }}>✓ All injects revealed — proceed to Scoring</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Score */}
                          {phase === "score" && (
                            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:12 }}>Rate Performance (1–10)</div>
                                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                                  {[
                                    {key:"escalation",   label:"Escalation & Decision-Making"},
                                    {key:"communication",label:"Internal & External Communication"},
                                    {key:"technical",    label:"Technical Response Quality"},
                                    {key:"documentation",label:"Evidence & Documentation"},
                                    {key:"regulatory",   label:"Regulatory Compliance Awareness"},
                                  ].map(c => (
                                    <div key={c.key}>
                                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:12 }}>
                                        <span style={{ color:"var(--foreground)", fontWeight:600 }}>{c.label}</span>
                                        <span style={{ fontWeight:800, fontFamily:"monospace", color:scScores[c.key] ? (scScores[c.key] >= 8 ? "#059669" : scScores[c.key] >= 5 ? "#D97706" : "#DC2626") : "var(--muted-foreground)" }}>
                                          {scScores[c.key] ? `${scScores[c.key]}/10` : "—"}
                                        </span>
                                      </div>
                                      <div style={{ display:"flex", gap:4 }}>
                                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                          <button key={n} onClick={() => setScore(c.key, n)}
                                            style={{ flex:1, height:28, borderRadius:5, fontSize:10, fontWeight:700, cursor:"pointer", transition:"all 0.1s",
                                              border: scScores[c.key] === n ? "none" : "1px solid var(--border)",
                                              background: scScores[c.key] === n ? (n >= 8 ? "#059669" : n >= 5 ? "#D97706" : "#DC2626") : scScores[c.key] > 0 && n <= scScores[c.key] ? "rgba(147,197,253,0.2)" : "transparent",
                                              color: scScores[c.key] === n ? "white" : "var(--muted-foreground)" }}>
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>Observations & Action Items</div>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Record key findings, gaps identified, action items and lessons learned…"
                                  style={{ width:"100%", minHeight:100, padding:"10px 12px", borderRadius:9, border:"1px solid var(--border)", background:"var(--card)", color:"var(--foreground)", fontSize:12, outline:"none", resize:"vertical", lineHeight:1.6, boxSizing:"border-box" }} />
                              </div>
                              {overallScore > 0 && (
                                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
                                  <div style={{ fontSize:40, fontWeight:900, fontFamily:"monospace", color: overallScore >= 80 ? "#059669" : overallScore >= 60 ? "#D97706" : "#DC2626" }}>
                                    {Math.round(overallScore * 10)}%
                                  </div>
                                  <div>
                                    <div style={{ fontSize:14, fontWeight:800, color:"var(--foreground)" }}>Overall Exercise Score</div>
                                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>
                                      {overallScore >= 8 ? "Excellent — team performed well under pressure" : overallScore >= 6 ? "Good — minor gaps identified for improvement" : "Needs Work — significant gaps require remediation"}
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                                <button onClick={() => closeExercise()} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>Close</button>
                                <button onClick={() => closeExercise(true)} disabled={overallScore === 0}
                                  style={{ padding:"9px 20px", borderRadius:8, border:"none", background: overallScore === 0 ? "rgba(16,185,129,0.3)" : "#059669", color:"white", fontSize:12, fontWeight:700, cursor: overallScore === 0 ? "not-allowed" : "pointer" }}>
                                  Save Exercise Report
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>
                  );
                }

                /* ── NEW EXERCISE MODAL ─────────────────────────────────────── */
                if (ttNewExOpen) {
                  return (
                    <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                      <div style={{ background:"var(--input)", borderRadius:16, width:"100%", maxWidth:520, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>
                        <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)" }}>+ New Tabletop Exercise</div>
                          <button onClick={() => setTtNewExOpen(false)} style={{ background:"transparent", border:"none", fontSize:18, color:"var(--muted-foreground)", cursor:"pointer" }}>✕</button>
                        </div>
                        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
                          {[
                            {key:"title",       label:"Exercise Name",   ph:"e.g. Q3 2024 Cyber Incident Simulation",          type:"text"},
                            {key:"facilitator", label:"Facilitator",     ph:"e.g. Alex Kim — CISO",                             type:"text"},
                            {key:"date",        label:"Scheduled Date",  ph:"",                                                  type:"date"},
                          ].map(f => (
                            <div key={f.key}>
                              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{f.label}</div>
                              <input type={f.type} value={(ttNewExForm as any)[f.key]} placeholder={f.ph}
                                onChange={e => setTtNewExForm(p => ({...p, [f.key]: e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--foreground)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                            </div>
                          ))}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Category</div>
                              <select value={ttNewExForm.category} onChange={e => setTtNewExForm(p => ({...p, category: e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--foreground)", fontSize:12, outline:"none" }}>
                                {["Cyber Incident","Privacy","Human Risk","Business Continuity","Physical Security","Compliance"].map(c => <option key={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Difficulty</div>
                              <select value={ttNewExForm.difficulty} onChange={e => setTtNewExForm(p => ({...p, difficulty: e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--foreground)", fontSize:12, outline:"none" }}>
                                {["Beginner","Intermediate","Advanced"].map(d => <option key={d}>{d}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:4 }}>
                            <button onClick={() => setTtNewExOpen(false)} style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--foreground)", fontSize:12, cursor:"pointer" }}>Cancel</button>
                            <button onClick={() => {
                              if (!ttNewExForm.title) return;
                              const cats: Record<string,string> = {"Cyber Incident":"#EF4444","Privacy":"#3B82F6","Human Risk":"#8B5CF6","Business Continuity":"#F59E0B","Physical Security":"#10B981","Compliance":"#6366F1"};
                              const catBgs: Record<string,string> = {"Cyber Incident":"rgba(239,68,68,0.1)","Privacy":"rgba(59,130,246,0.1)","Human Risk":"rgba(139,92,246,0.1)","Business Continuity":"rgba(245,158,11,0.1)","Physical Security":"rgba(16,185,129,0.1)","Compliance":"rgba(99,102,241,0.1)"};
                              setTtLocalEx(p => [...p, { id:`TT-${String(TT_SCENARIOS.length + p.length + 1).padStart(3,"0")}`, title:ttNewExForm.title, desc:"Custom exercise created by your team.", category:ttNewExForm.category, categoryColor:cats[ttNewExForm.category]??"#6366F1", categoryBg:catBgs[ttNewExForm.category]??"rgba(99,102,241,0.1)", difficulty:ttNewExForm.difficulty, duration:ttNewExForm.duration, roles:4, controls:6, iso:["A.5.36"], status:"scheduled", score:0 }]);
                              setTtNewExForm({title:"",category:"Cyber Incident",difficulty:"Intermediate",duration:120,facilitator:"",date:""});
                              setTtNewExOpen(false);
                              setTtSubTab("exercises");
                            }} style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"rgb(147,197,253)", color:"#0F172A", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              Create Exercise
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                /* ── MAIN TABLETOP VIEW ──────────────────────────────────────── */
                return (
                  <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>

                    {/* Header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>Tabletop Exercises</div>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginTop:3 }}>Scenario-based resilience testing with pre-built ISO 27001-aligned exercises</div>
                      </div>
                      <button onClick={() => setTtNewExOpen(true)} style={{ padding:"9px 20px", borderRadius:9, border:"none", background:"rgb(147,197,253)", color:"#0F172A", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                        + New Exercise
                      </button>
                    </div>

                    {/* KPI row */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                      {[
                        {label:"Total",      value:kTotal,                                       color:"#2563EB"},
                        {label:"Scheduled",  value:kScheduled,                                   color:"#60A5FA"},
                        {label:"In Progress",value:kInProg,                                      color:"#D97706"},
                        {label:"Completed",  value:kDone,                                        color:"#059669"},
                        {label:"Avg Score",  value:`${kAvgScore}%`, color:kAvgScore >= 80 ? "#059669" : "#D97706"},
                      ].map(k => (
                        <div key={k.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 18px", position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, borderRadius:"12px 12px 0 0" }} />
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>{k.label}</div>
                          <div style={{ fontSize:26, fontWeight:900, fontFamily:"monospace", color:k.color }}>{k.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sub-tabs */}
                    <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)" }}>
                      {[
                        {key:"library",   label:"Scenario Library", count:allScenarios.length},
                        {key:"exercises", label:"My Exercises",     count:kScheduled + kInProg},
                        {key:"reports",   label:"Reports",          count:kDone},
                      ].map(t => (
                        <button key={t.key} onClick={() => setTtSubTab(t.key)}
                          style={{ padding:"10px 18px", fontSize:12, fontWeight:600, border:"none", background:"transparent", cursor:"pointer", transition:"all 0.15s",
                            color: ttSubTab === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)",
                            borderBottom: ttSubTab === t.key ? "2px solid rgb(147,197,253)" : "2px solid transparent",
                            display:"flex", alignItems:"center", gap:6 }}>
                          {t.label}
                          <span style={{ fontSize:10, fontWeight:700, background: ttSubTab === t.key ? "rgba(147,197,253,0.15)" : "rgba(148,163,184,0.1)", color: ttSubTab === t.key ? "rgb(147,197,253)" : "var(--muted-foreground)", borderRadius:10, padding:"1px 7px" }}>{t.count}</span>
                        </button>
                      ))}
                    </div>

                    {/* ── Scenario Library ── */}
                    {ttSubTab === "library" && <>
                      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                        <div style={{ position:"relative", flexShrink:0, width:220 }}>
                          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"var(--muted-foreground)" }}>🔍</span>
                          <input value={ttSearch} onChange={e => setTtSearch(e.target.value)} placeholder="Search scenarios…"
                            style={{ width:"100%", paddingLeft:34, paddingRight:12, height:36, borderRadius:9, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", flex:1 }}>
                          {TT_CATS.map(c => (
                            <button key={c} onClick={() => setTtCat(c)}
                              style={{ padding:"5px 13px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s",
                                border: ttCat === c ? "1px solid rgba(147,197,253,0.5)" : "1px solid var(--border)",
                                background: ttCat === c ? "rgba(147,197,253,0.12)" : "transparent",
                                color: ttCat === c ? "rgb(147,197,253)" : "var(--muted-foreground)" }}>
                              {c}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)", whiteSpace:"nowrap" }}>{filteredTT.length} scenarios</div>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                        {filteredTT.map(s => {
                          const dSt = diffStyle[s.difficulty] ?? diffStyle["Intermediate"];
                          const sSt = statStyle[s.status]     ?? statStyle["scheduled"];
                          return (
                            <div key={s.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column", transition:"all 0.15s", cursor:"default" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = s.categoryColor + "66"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>

                              <div style={{ height:4, background:s.categoryColor, flexShrink:0 }} />

                              <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, flex:1 }}>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                                  <span style={{ fontSize:10, fontWeight:700, color:s.categoryColor, background:s.categoryBg, borderRadius:5, padding:"2px 8px" }}>{s.category}</span>
                                  <span style={{ fontSize:10, fontWeight:700, color:sSt.color, background:sSt.bg, border:`1px solid ${sSt.border}`, borderRadius:6, padding:"2px 8px" }}>
                                    {s.status === "in-progress" ? "In Progress" : s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                                  </span>
                                </div>

                                <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", lineHeight:1.3 }}>{s.title}</div>
                                <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>{s.desc}</div>

                                <div style={{ display:"flex", gap:12, fontSize:11, color:"var(--muted-foreground)" }}>
                                  <span>⏱ {fmtDur(s.duration)}</span>
                                  <span>👥 {s.roles} roles</span>
                                  <span>🛡 {s.controls} controls</span>
                                </div>

                                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                                  {s.iso.map((clause: string) => (
                                    <span key={clause} style={{ fontSize:9, fontWeight:700, background:"rgba(99,102,241,0.1)", color:"#4F46E5", border:"1px solid rgba(99,102,241,0.2)", borderRadius:4, padding:"2px 6px" }}>{clause}</span>
                                  ))}
                                </div>

                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:10, borderTop:"1px solid var(--border)", marginTop:"auto" }}>
                                  <span style={{ fontSize:10, fontWeight:700, color:dSt.color, background:dSt.bg, border:`1px solid ${dSt.border}`, borderRadius:6, padding:"3px 9px" }}>{s.difficulty}</span>
                                  {s.score > 0 ? (
                                    <span style={{ fontSize:15, fontWeight:800, fontFamily:"monospace", color: s.score >= 85 ? "#059669" : s.score >= 70 ? "#D97706" : "#DC2626" }}>{s.score}%</span>
                                  ) : (
                                    <button onClick={() => setTtExerciseModal({scenario:s, phase:"brief", notes:"", injectIdx:-1, scores:{}})}
                                      style={{ fontSize:11, fontWeight:700, background:"rgb(147,197,253)", color:"#0F172A", border:"none", borderRadius:7, padding:"7px 16px", cursor:"pointer", transition:"opacity 0.15s" }}
                                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                                      Launch Exercise
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>}

                    {/* ── My Exercises ── */}
                    {ttSubTab === "exercises" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {allScenarios.filter(s => ["in-progress","scheduled"].includes(s.status)).length === 0 ? (
                          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--muted-foreground)" }}>
                            <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
                            <div style={{ fontSize:14, fontWeight:700, color:"var(--foreground)" }}>No active exercises</div>
                            <div style={{ fontSize:12, marginTop:6 }}>Launch a scenario from the library or create a new exercise.</div>
                          </div>
                        ) : allScenarios.filter(s => ["in-progress","scheduled"].includes(s.status)).map(s => {
                          const dSt = diffStyle[s.difficulty] ?? diffStyle["Intermediate"];
                          const sSt = statStyle[s.status]     ?? statStyle["scheduled"];
                          return (
                            <div key={s.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", gap:16 }}>
                              <div style={{ width:4, height:40, borderRadius:2, background:s.categoryColor, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{s.title}</div>
                                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>{s.category} · {fmtDur(s.duration)} · {s.roles} roles</div>
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, color:dSt.color, background:dSt.bg, border:`1px solid ${dSt.border}`, borderRadius:6, padding:"3px 10px" }}>{s.difficulty}</span>
                              <span style={{ fontSize:10, fontWeight:700, color:sSt.color, background:sSt.bg, border:`1px solid ${sSt.border}`, borderRadius:6, padding:"3px 10px" }}>
                                {s.status === "in-progress" ? "In Progress" : "Scheduled"}
                              </span>
                              <button onClick={() => setTtExerciseModal({scenario:s, phase:"brief", notes:"", injectIdx:-1, scores:{}})}
                                style={{ fontSize:11, fontWeight:700, background:"rgb(147,197,253)", color:"#0F172A", border:"none", borderRadius:7, padding:"7px 16px", cursor:"pointer" }}>
                                {s.status === "in-progress" ? "Continue" : "Launch"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Reports ── */}
                    {ttSubTab === "reports" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:4 }}>{kDone} completed exercises</div>
                        {allScenarios.filter(s => s.status === "completed").map(s => {
                          const dSt = diffStyle[s.difficulty] ?? diffStyle["Intermediate"];
                          return (
                            <div key={s.id} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"center", gap:16, transition:"border-color 0.15s" }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(147,197,253,0.3)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}>
                              <div style={{ width:4, height:40, borderRadius:2, background:s.categoryColor, flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{s.title}</div>
                                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>
                                  {s.category} · {s.iso.join(", ")}
                                </div>
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, color:dSt.color, background:dSt.bg, border:`1px solid ${dSt.border}`, borderRadius:6, padding:"3px 10px" }}>{s.difficulty}</span>
                              <div style={{ fontSize:18, fontWeight:900, fontFamily:"monospace", color:s.score >= 85 ? "#059669" : s.score >= 70 ? "#D97706" : "#DC2626", minWidth:52, textAlign:"right" }}>{s.score}%</div>
                              <button style={{ fontSize:11, fontWeight:600, background:"transparent", color:"var(--muted-foreground)", border:"1px solid var(--border)", borderRadius:7, padding:"6px 14px", cursor:"pointer" }}>
                                View Report
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })()}

            </div>
          );
        })()}

        {/* ── EVIDENCE ENGINE — with Collect Now + stale stats ─────────────── */}
        {tab === "evidence" && (() => {
          const intgIcon: Record<string,string> = { github:"🐱", aws:"☁️", okta:"🔐", manual:"📤" };
          const evControls: any[] = evidenceSummary?.controls ?? [];
          const filteredEvCtrls = evControls.filter((c: any) => {
            if (evFilter !== "all" && c.evidenceStatus !== evFilter) return false;
            if (evSearch) {
              const q = evSearch.toLowerCase();
              if (!c.name?.toLowerCase().includes(q) && !c.controlRef?.toLowerCase().includes(q) && !c.framework?.toLowerCase().includes(q)) return false;
            }
            return true;
          });
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Stats + Collect Now bar */}
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                {evidenceSummary?.stats ? [
                  { label:"Collected", key:"fresh",   value:evidenceSummary.stats.fresh,   color:"#10B981" },
                  { label:"Stale",     key:"stale",   value:evidenceSummary.stats.stale,   color:"#F59E0B" },
                  { label:"Failed",    key:"failed",  value:evidenceSummary.stats.failed,   color:"#DC2626" },
                  { label:"Missing",   key:"missing", value:evidenceSummary.stats.missing,  color:"#6B7280" },
                ].map(s => (
                  <button key={s.key} onClick={() => setEvFilter(evFilter === s.key ? "all" : s.key)}
                    style={{ display:"flex", alignItems:"center", gap:6, background:evFilter===s.key?`${s.color}18`:"var(--card)", border:`1px solid ${evFilter===s.key?s.color:"var(--border)"}`, borderRadius:8, padding:"8px 14px", cursor:"pointer" }}>
                    <span style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:s.color }}>{s.value}</span>
                    <span style={{ fontSize:11, color:"var(--muted-foreground)", fontWeight:600 }}>{s.label}</span>
                  </button>
                )) : <span style={{ fontSize:12, color:"var(--muted-foreground)" }}>Loading evidence stats…</span>}
                <button onClick={handleCollectNow} disabled={collectingNow}
                  style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:7, padding:"9px 18px", background:collectingNow?"var(--border)":"#3B82F6", color:"#fff", border:"none", borderRadius:8, cursor:collectingNow?"not-allowed":"pointer", fontSize:13, fontWeight:700, opacity:collectingNow?0.7:1 }}>
                  {collectingNow ? "⟳ Collecting…" : "▶ Collect Now"}
                </button>
              </div>

              {/* Bulk export bar */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"var(--card)", border:"1px solid var(--border)", borderRadius:10 }}>
                <span style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", flexShrink:0 }}>📦 Bulk Export</span>
                <select value={bulkExportFw} onChange={e => setBulkExportFw(e.target.value)}
                  style={{ flex:1, maxWidth:220, height:32, borderRadius:7, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, padding:"0 10px", outline:"none" }}>
                  <option value="all">All Frameworks</option>
                  {Array.from(new Set((evidenceSummary?.controls ?? []).map((c: any) => c.framework).filter(Boolean)))
                    .filter((fw: any) => assignedFwNames.size === 0 || assignedFwNames.has(fw))
                    .sort().map((fw: any) => (
                    <option key={fw} value={fw}>{fw}</option>
                  ))}
                </select>
                <button onClick={() => handleBulkExport("pdf")} disabled={bulkExporting}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", background:bulkExporting?"var(--border)":"#DC2626", color:"#fff", border:"none", borderRadius:7, cursor:bulkExporting?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:bulkExporting?0.6:1, flexShrink:0 }}>
                  {bulkExporting ? "⟳" : "⬇"} PDF
                </button>
                <button onClick={() => handleBulkExport("zip")} disabled={bulkExporting}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", background:bulkExporting?"var(--border)":"#7C3AED", color:"#fff", border:"none", borderRadius:7, cursor:bulkExporting?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:bulkExporting?0.6:1, flexShrink:0 }}>
                  {bulkExporting ? "⟳" : "⬇"} ZIP
                </button>
                <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:4 }}>Export all artifacts for external review</span>
              </div>

              {/* Two-column layout: controls list + legacy EvidenceEngine */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>

                {/* Left: per-control evidence list */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>Evidence by Control</span>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:"auto" }}>{filteredEvCtrls.length} controls</span>
                  </div>
                  <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)" }}>
                    <input value={evSearch} onChange={e => setEvSearch(e.target.value)} placeholder="Search controls…"
                      style={{ width:"100%", padding:"7px 11px", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, color:"var(--foreground)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ maxHeight:480, overflow:"auto" }}>
                    {evControls.length === 0 ? (
                      <div style={{ padding:"32px 20px", textAlign:"center" }}>
                        <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
                        <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>No evidence data yet. Click "Collect Now" to run automated collection.</div>
                      </div>
                    ) : filteredEvCtrls.length === 0 ? (
                      <div style={{ padding:"24px 20px", textAlign:"center", fontSize:12, color:"var(--muted-foreground)" }}>No controls match the current filter.</div>
                    ) : filteredEvCtrls.map((c: any) => {
                      const evSt  = c.evidenceStatus ?? "missing";
                      const evCol = evStatusColor(evSt);
                      const icon  = intgIcon[c.sourceIntegration ?? ""] ?? "🔬";
                      return (
                        <div key={c.controlId} onClick={() => openEvidencePanel({ dbId: c.controlId, id: c.controlRef, name: c.name, framework: c.framework })}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(59,130,246,0.06)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{c.controlRef} · {c.framework}</div>
                          </div>
                          <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${evCol}18`, color:evCol, border:`1px solid ${evCol}44`, flexShrink:0 }}>
                            {evStatusLabel(evSt)}
                          </span>
                          <span style={{ fontSize:12, color:"var(--muted-foreground)", flexShrink:0 }}>›</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: manual upload / legacy evidence engine */}
                <div>
                  <EvidenceEngine />
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── QUESTIONNAIRES ───────────────────────────────────────────────── */}
        {tab === "questionnaires" && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", margin: "-20px -24px", height: "calc(100vh - 160px)" }}>
            <Questionnaires />
          </div>
        )}

        {/* ── GAP ANALYSIS ──────────────────────────────────────────────────── */}
        {tab === "gaps" && (() => {
          const GAP_CATEGORIES: Record<string, { cat: string; impl: number; partial: number; gap: number }[]> = {
            "ISO 27001:2022":  [{ cat:"A.5 Org. Controls", impl:22, partial:3, gap:1 },{ cat:"A.6 People Controls", impl:8, partial:2, gap:0 },{ cat:"A.7 Physical", impl:7, partial:1, gap:0 },{ cat:"A.8 Tech Controls", impl:52, partial:10, gap:8 }],
            "SOC 2 Type II":   [{ cat:"CC1 Control Env.", impl:8, partial:1, gap:0 },{ cat:"CC6 Logical Access", impl:14, partial:3, gap:1 },{ cat:"CC7 System Ops", impl:17, partial:3, gap:1 },{ cat:"CC8–9 Change/Risk", impl:13, partial:2, gap:1 }],
            "GDPR":            [{ cat:"Art. 5–11 Lawfulness", impl:5, partial:2, gap:0 },{ cat:"Art. 12–23 Rights", impl:4, partial:2, gap:1 },{ cat:"Art. 24–43 Controller", impl:6, partial:2, gap:1 },{ cat:"Art. 44–50 Transfers", impl:2, partial:0, gap:0 }],
            "HIPAA":           [{ cat:"Admin Safeguards", impl:14, partial:2, gap:1 },{ cat:"Physical Safeguards", impl:9, partial:1, gap:0 },{ cat:"Tech Safeguards", impl:10, partial:2, gap:1 },{ cat:"Breach Notification", impl:5, partial:0, gap:0 }],
            "NIS2":            [{ cat:"Art.21 Risk Measures", impl:3, partial:3, gap:2 },{ cat:"Art.23 Reporting", impl:2, partial:2, gap:1 },{ cat:"Art.24–26 Supply Chain", impl:2, partial:1, gap:2 },{ cat:"Art.32–36 Enforcement", impl:1, partial:1, gap:1 }],
            "PCI DSS v4.0":    [{ cat:"Req 1–2 Network", impl:14, partial:3, gap:1 },{ cat:"Req 3–4 Cardholder", impl:12, partial:2, gap:1 },{ cat:"Req 7–9 Access", impl:18, partial:3, gap:2 },{ cat:"Req 10–12 Monitor", impl:17, partial:3, gap:2 }],
            "NIST CSF":        [{ cat:"GV Govern", impl:14, partial:5, gap:3 },{ cat:"ID Identify", impl:18, partial:4, gap:3 },{ cat:"PR Protect", impl:21, partial:5, gap:4 },{ cat:"DE Detect", impl:11, partial:4, gap:3 },{ cat:"RS/RC Respond", impl:8, partial:3, gap:2 }],
            "DORA":            [{ cat:"ICT Risk Mgmt", impl:5, partial:4, gap:3 },{ cat:"Incident Reporting", impl:4, partial:3, gap:3 },{ cat:"Resilience Testing", impl:6, partial:3, gap:4 },{ cat:"Third-Party Risk", impl:5, partial:3, gap:3 }],
          };
          const totalImpl  = lGaps.reduce((a, g) => a + g.implemented, 0);
          const totalGaps  = lGaps.reduce((a, g) => a + g.notStarted + g.partial, 0);
          const critCount  = lGaps.filter(g => g.pct < 50).length;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* KPI strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {[
                  { label: "Frameworks Tracked",    value: lGaps.length,  color: "rgb(147,197,253)", border: "#BFDBFE", icon: "📋" },
                  { label: "Controls Implemented",  value: totalImpl,     color: "#059669",           border: "#A7F3D0", icon: "✅" },
                  { label: "Controls with Gaps",    value: totalGaps,     color: "#DC2626",           border: "#FECACA", icon: "⚠️" },
                  { label: "Critical (<50%)",        value: critCount,     color: critCount > 0 ? "#DC2626" : "#059669", border: critCount > 0 ? "#FECACA" : "#A7F3D0", icon: "🔴" },
                ].map(k => (
                  <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{k.icon}</span>
                      <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 11, color: "var(--muted-foreground)", padding: "0 4px" }}>
                <span>Click any row to expand control breakdown</span>
                <span style={{ marginLeft: "auto" }}>
                  <span style={{ color: "#059669" }}>● Implemented</span>
                  {"  "}
                  <span style={{ color: "#F59E0B" }}>● Partial</span>
                  {"  "}
                  <span style={{ color: "#EF4444" }}>● Gap</span>
                </span>
              </div>

              {/* Framework rows */}
              {lGaps.map(g => {
                const isOpen  = expandedGap === g.framework;
                const pctColor = g.pct >= 80 ? "#059669" : g.pct >= 60 ? "#D97706" : "#DC2626";
                const cats = GAP_CATEGORIES[g.framework] ?? [];
                return (
                  <div key={g.framework} style={{ background: "var(--card)", border: `1px solid ${isOpen ? "rgba(147,197,253,0.35)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.15s", boxShadow: isOpen ? "0 4px 20px rgba(0,0,0,0.25)" : "0 2px 8px rgba(0,0,0,0.15)" }}>
                    {/* Header row — always visible */}
                    <div
                      onClick={() => setExpandedGap(isOpen ? null : g.framework)}
                      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "rgba(147,197,253,0.04)"; }}
                      onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      style={{ padding: "14px 20px", cursor: "pointer", userSelect: "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "rgb(147,197,253)" }}>{g.framework}</span>
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{g.total} controls</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#059669", fontWeight: 700, background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 4, padding: "2px 8px" }}>{g.implemented} Impl.</span>
                          <span style={{ fontSize: 11, color: "#D97706", fontWeight: 700, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "2px 8px" }}>{g.partial} Partial</span>
                          <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 4, padding: "2px 8px" }}>{g.notStarted} Gap</span>
                          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: pctColor, minWidth: 40, textAlign: "right" }}>{g.pct}%</span>
                          <span style={{ fontSize: 14, color: "var(--muted-foreground)", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▾</span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${(g.implemented / g.total) * 100}%`, background: "#059669", transition: "width 0.4s" }} />
                        <div style={{ width: `${(g.partial / g.total) * 100}%`, background: "#F59E0B", transition: "width 0.4s" }} />
                        <div style={{ width: `${(g.notStarted / g.total) * 100}%`, background: "#EF4444", transition: "width 0.4s" }} />
                      </div>
                    </div>

                    {/* Expanded breakdown */}
                    {isOpen && (
                      <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", background: "rgba(255,255,255,0.02)" }}>
                        {cats.length > 0 ? (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 10 }}>Control Category Breakdown</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {cats.map(c => {
                                const tot = c.impl + c.partial + c.gap;
                                const catPct = tot > 0 ? Math.round((c.impl / tot) * 100) : 0;
                                const catCol = catPct >= 80 ? "#059669" : catPct >= 60 ? "#D97706" : "#DC2626";
                                return (
                                  <div key={c.cat}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                                      <span style={{ fontWeight: 600 }}>{c.cat}</span>
                                      <div style={{ display: "flex", gap: 10, color: "var(--muted-foreground)" }}>
                                        <span style={{ color: "#059669" }}>✓ {c.impl}</span>
                                        <span style={{ color: "#F59E0B" }}>~ {c.partial}</span>
                                        <span style={{ color: "#EF4444" }}>✗ {c.gap}</span>
                                        <span style={{ fontWeight: 700, color: catCol }}>{catPct}%</span>
                                      </div>
                                    </div>
                                    <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                                      <div style={{ width: `${(c.impl / tot) * 100}%`, background: "#059669" }} />
                                      <div style={{ width: `${(c.partial / tot) * 100}%`, background: "#F59E0B" }} />
                                      <div style={{ width: `${(c.gap / tot) * 100}%`, background: "#EF4444" }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>No category breakdown available for this framework.</div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          <button onClick={() => setTab("evidence")} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid rgba(147,197,253,0.35)", background: "rgba(147,197,253,0.08)", color: "rgb(147,197,253)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            View Controls in Evidence Engine →
                          </button>
                          <button onClick={() => setTab("audits")} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--muted-foreground)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                            View Audit History
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── MATURITY MODEL (new) ──────────────────────────────────────────── */}
        {tab === "maturity" && (
          <>
            {/* KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
              {[
                { label: "Overall Maturity", value: overallMaturity, unit: "/ 5", color: "#059669", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
                { label: "Level 5 (Optimizing)", value: lMaturity.filter(d => d.score === 5).length, unit: " domains", color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#BBF7D0" },
                { label: "Level 4 (Managed)",    value: lMaturity.filter(d => d.score === 4).length, unit: " domains", color: "#059669", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
                { label: "Level 3 (Defined)",    value: lMaturity.filter(d => d.score === 3).length, unit: " domains", color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
                { label: "Improvement Areas",    value: lMaturity.filter(d => d.score < 3).length,   unit: " domains", color: "#DC2626", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted-foreground)" }}>{k.unit}</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
              {/* Radar chart */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 4 }}>Maturity Spider Chart</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 12 }}>Solid = current · Dashed = previous quarter</div>
                <RadarChart domains={lMaturity} />
                <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 8, fontSize: 10 }}>
                  <span style={{ color: "rgb(147,197,253)" }}>— Current</span>
                  <span style={{ color: "var(--muted-foreground)" }}>- - Previous</span>
                </div>
              </div>

              {/* Domain detail table */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 4 }}>Domain Maturity Detail</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 12 }}>Click a domain to see detail</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lMaturity.map(d => {
                    const isSelected = selectedMaturityDomain === d.domain;
                    const improved   = d.score > d.prev;
                    const implPct    = d.controls > 0 ? Math.round((d.implemented / d.controls) * 100) : 0;
                    const partialPct = d.controls > 0 ? Math.round(((d.partial ?? 0) / d.controls) * 100) : 0;
                    const gapPct     = Math.max(0, 100 - implPct - partialPct);
                    const col        = MATURITY_COLORS[d.score]!;
                    const DOMAIN_NOTES: Record<string, { finding: string; recommendation: string }> = {
                      "Access Control":           { finding: "PAM solution partially deployed; 14% of service accounts lack MFA.", recommendation: "Complete CyberArk rollout across all service accounts by Q3." },
                      "Asset Management":         { finding: "CMDB coverage at 87%; cloud-native assets still manually tracked.", recommendation: "Integrate cloud asset discovery API into CMDB for auto-sync." },
                      "Incident Response":         { finding: "Runbooks exist for 9/12 scenario types; tabletop exercise overdue.", recommendation: "Conduct quarterly tabletop and document remaining 3 runbooks." },
                      "Risk Management":          { finding: "Risk register updated monthly; residual risk acceptance workflow manual.", recommendation: "Automate risk acceptance workflow with approval chain integration." },
                      "Vendor Management":        { finding: "72% of critical vendors assessed annually; 8 vendor SLAs unreviewed.", recommendation: "Establish automated SLA monitoring dashboard for tier-1 vendors." },
                      "Data Protection":          { finding: "DLP policies active on email/endpoint; cloud storage coverage gaps.", recommendation: "Extend DLP policy engine to cover S3/Blob storage egress." },
                      "Security Awareness":       { finding: "Monthly phishing simulation at 94% click-rate improvement. Annual training 91% completion.", recommendation: "Add role-based advanced training for finance and IT privileged users." },
                      "Change Management":        { finding: "CAB approval process followed for 98% of changes. Emergency change process undefined.", recommendation: "Define and document emergency change procedure with rollback plan." },
                    };
                    const note = DOMAIN_NOTES[d.domain];
                    return (
                      <div key={d.domain}>
                        <div
                          onClick={() => setSelectedMaturityDomain(isSelected ? null : d.domain)}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(147,197,253,0.04)"; }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          style={{ border: `1px solid ${isSelected ? "rgba(147,197,253,0.35)" : "var(--border)"}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", userSelect: "none", background: isSelected ? "rgba(147,197,253,0.04)" : "transparent", transition: "border-color 0.15s" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                            <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{d.domain}</div>
                            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                              {improved && (
                                <span style={{ background: "#05966920", color: "#059669", border: "1px solid #05966944", borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800 }}>↑ Improved</span>
                              )}
                              <span style={{ background: col + "22", color: col, border: `1px solid ${col}44`, borderRadius: 4, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>
                                L{d.score} {MATURITY_LABELS[d.score]}
                              </span>
                              <span style={{ fontSize: 12, color: "var(--muted-foreground)", transition: "transform 0.2s", transform: isSelected ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▾</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                              <div style={{ width: implPct + "%", height: "100%", background: col, transition: "width .4s" }} />
                              <div style={{ width: partialPct + "%", height: "100%", background: "#FCD34D", transition: "width .4s" }} />
                              <div style={{ width: gapPct + "%", height: "100%", background: "rgba(255,255,255,0.1)" }} />
                            </div>
                            <span style={{ fontSize: 9, color: "var(--muted-foreground)", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {d.implemented}/{d.controls} · Target L{d.target}
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isSelected && (
                          <div style={{ margin: "2px 0 4px 0", border: "1px solid rgba(147,197,253,0.2)", borderRadius: "0 0 10px 10px", borderTop: "none", background: "rgba(147,197,253,0.03)", padding: "14px 16px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
                              {[
                                { label: "Current Level", value: `L${d.score} ${MATURITY_LABELS[d.score]}`, color: col },
                                { label: "Target Level",  value: `L${d.target} ${MATURITY_LABELS[d.target]}`, color: "var(--muted-foreground)" },
                                { label: "Quarter Δ",     value: d.score > d.prev ? `+${(d.score - d.prev).toFixed(1)}` : d.score < d.prev ? (d.score - d.prev).toFixed(1) : "—", color: d.score > d.prev ? "#059669" : d.score < d.prev ? "#DC2626" : "var(--muted-foreground)" },
                              ].map(s => (
                                <div key={s.label} style={{ background: "var(--card)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 4 }}>{s.label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.value}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12, fontSize: 11 }}>
                              <div style={{ padding: "8px 10px", background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#059669", marginBottom: 3 }}>✅ IMPLEMENTED</div>
                                <div style={{ fontWeight: 700 }}>{d.implemented} controls ({implPct}%)</div>
                              </div>
                              <div style={{ padding: "8px 10px", background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#D97706", marginBottom: 3 }}>⚡ PARTIAL</div>
                                <div style={{ fontWeight: 700 }}>{d.partial ?? 0} controls ({partialPct}%)</div>
                              </div>
                              <div style={{ padding: "8px 10px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#DC2626", marginBottom: 3 }}>❌ GAP</div>
                                <div style={{ fontWeight: 700 }}>{d.controls - d.implemented - (d.partial ?? 0)} controls ({gapPct}%)</div>
                              </div>
                            </div>
                            {note && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 11 }}>
                                <div style={{ padding: "10px 12px", background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#DC2626", marginBottom: 5 }}>🔍 AUDIT FINDING</div>
                                  <div style={{ lineHeight: 1.5, color: "var(--foreground)" }}>{note.finding}</div>
                                </div>
                                <div style={{ padding: "10px 12px", background: "rgba(5,150,105,0.04)", border: "1px solid rgba(5,150,105,0.15)", borderRadius: 8 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#059669", marginBottom: 5 }}>💡 RECOMMENDATION</div>
                                  <div style={{ lineHeight: 1.5, color: "var(--foreground)" }}>{note.recommendation}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Maturity trend */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Maturity Score Trend (6 Quarters)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
                {[{q:"Q1 2023",v:2.1},{q:"Q2 2023",v:2.4},{q:"Q3 2023",v:2.7},{q:"Q4 2023",v:2.9},{q:"Q1 2024",v:3.1},{q:"Q2 2024",v:3.3}].map((pt, i, arr) => {
                  const MAX_V = 4, barH = 120;
                  const h = (pt.v / MAX_V) * barH;
                  const isLast = i === arr.length - 1;
                  return (
                    <div key={pt.q} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: isLast ? "#065F46" : "var(--foreground)" }}>{pt.v}</div>
                      <div style={{ width: "100%", height: barH, display: "flex", alignItems: "flex-end" }}>
                        <div style={{ width: "100%", height: h, background: isLast ? "#065F46" : "#1E3A5F", borderRadius: "4px 4px 0 0", opacity: isLast ? 1 : 0.5 + i * 0.1 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted-foreground)", textAlign: "center" }}>{pt.q}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "workflow" && (
          <WorkflowPipeline workflows={[AUDIT_WORKFLOW_WF]} />
        )}

      </div>

    {/* ── CREATE AUDIT MODAL ────────────────────────────────────────────────── */}
    {createOpen && (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.72)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setCreateOpen(false)}>
        <div style={{ background:"var(--card)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, width:"min(720px,100%)", maxHeight:"92vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 32px 96px rgba(0,0,0,0.8)" }} onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:"rgb(147,197,253)" }}>＋ Create New Audit</div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>Universal Compliance Audit Workflow — Step {createStep} of 4</div>
            </div>
            <button onClick={()=>setCreateOpen(false)} style={{ background:"var(--border)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgb(148,163,184)", fontSize:16, cursor:"pointer", padding:"4px 10px", lineHeight:1 }}>✕</button>
          </div>

          {/* Step indicator */}
          <div style={{ padding:"16px 28px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
            {[{n:1,label:"Framework & Type"},{n:2,label:"Scope"},{n:3,label:"Audit Plan"},{n:4,label:"Review & Launch"}].map((st,i,arr) => (
              <div key={st.n} style={{ display:"flex", alignItems:"center", gap:6, flex: i<arr.length-1?1:"auto" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, flexShrink:0 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background: st.n<createStep?"#059669":st.n===createStep?"#1E3A5F":"var(--border)", border: st.n===createStep?"2px solid rgb(147,197,253)":"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color: st.n<createStep?"white":st.n===createStep?"rgb(147,197,253)":"var(--muted-foreground)" }}>
                    {st.n<createStep?"✓":st.n}
                  </div>
                  <span style={{ fontSize:11, fontWeight: st.n===createStep?700:400, color: st.n===createStep?"var(--foreground)":st.n<createStep?"rgb(52,211,153)":"var(--muted-foreground)", whiteSpace:"nowrap" }}>{st.label}</span>
                </div>
                {i<arr.length-1 && <div style={{ flex:1, height:1, background:"var(--border)", marginLeft:4 }}/>}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ padding:"26px 28px", overflowY:"auto", flex:1 }}>

            {/* STEP 1 — Framework & Audit Type */}
            {createStep===1 && (
              <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:14 }}>Select Framework</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                    {AUDIT_FRAMEWORKS.map(fw=>(
                      <div key={fw.id} onClick={()=>setCreateForm(f=>({...f,fwId:fw.id,fwName:fw.name,auditType:""}))}
                        style={{ padding:"14px 12px", borderRadius:10, border:`2px solid ${createForm.fwId===fw.id?fw.color:"var(--border)"}`, background:createForm.fwId===fw.id?fw.color+"18":"var(--secondary)", cursor:"pointer", transition:"all 0.12s", textAlign:"center" }}>
                        <div style={{ fontSize:22, marginBottom:6 }}>{fw.flag}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:createForm.fwId===fw.id?fw.color:"var(--foreground)" }}>{fw.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {createForm.fwId && (
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:10 }}>Audit Type</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {AUDIT_FRAMEWORKS.find(f=>f.id===createForm.fwId)?.types.map(t=>(
                        <label key={t} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:8, border:`1px solid ${createForm.auditType===t?"rgba(147,197,253,0.4)":"var(--border)"}`, background:createForm.auditType===t?"rgba(147,197,253,0.06)":"var(--secondary)", cursor:"pointer" }}>
                          <input type="radio" name="auditType" checked={createForm.auditType===t} onChange={()=>setCreateForm(f=>({...f,auditType:t}))} style={{ accentColor:"rgb(147,197,253)", flexShrink:0 }}/>
                          <span style={{ fontSize:12, color:"var(--foreground)" }}>{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 — Scope */}
            {createStep===2 && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>Define Audit Scope</div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:8, lineHeight:1.5 }}>Specify what is in scope — entity, location, processes and systems. This determines the audit checklist and evidence requirements.</div>
                {[
                  {key:"entity",   label:"Organisation / Entity",  ph:"e.g. Acme Payments Ltd — Mumbai HQ"},
                  {key:"location", label:"Location / Environment",  ph:"e.g. Mumbai DC, AWS ap-south-1, All Branches"},
                  {key:"process",  label:"Processes in Scope",      ph:"e.g. IAM, Change Management, Incident Response, BCP/DR"},
                  {key:"systems",  label:"Systems / Applications",  ph:"e.g. Core Banking, API Gateway, CRM, Payment Switch, HRMS"},
                ].map(f=>(
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", display:"block", marginBottom:6 }}>{f.label}</label>
                    <input value={(createForm as any)[f.key]} onChange={e=>setCreateForm(p=>({...p,[f.key]:e.target.value}))}
                      placeholder={f.ph} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}/>
                  </div>
                ))}
              </div>
            )}

            {/* STEP 3 — Audit Plan */}
            {createStep===3 && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>Audit Plan Details</div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", display:"block", marginBottom:6 }}>Audit Name <span style={{ color:"rgb(248,113,113)" }}>*</span></label>
                  <input value={createForm.name} onChange={e=>setCreateForm(f=>({...f,name:e.target.value}))}
                    placeholder={`${createForm.fwName} — ${createForm.auditType}`}
                    style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", display:"block", marginBottom:6 }}>Audit Objective</label>
                  <textarea value={createForm.objective} onChange={e=>setCreateForm(f=>({...f,objective:e.target.value}))}
                    placeholder="e.g. Assess compliance with ISO 27001:2022 Annex A controls and identify gaps for certification readiness."
                    rows={3} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", outline:"none" }}/>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {[
                    {key:"auditor",   label:"Lead Auditor",          ph:"e.g. Nadia Hassan"},
                    {key:"auditee",   label:"Auditee (Team/Owner)",   ph:"e.g. IT Security Team"},
                    {key:"startDate", label:"Start Date",             ph:"", type:"date"},
                    {key:"endDate",   label:"End Date",               ph:"", type:"date"},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", display:"block", marginBottom:6 }}>{f.label}</label>
                      <input type={f.type??"text"} value={(createForm as any)[f.key]} onChange={e=>setCreateForm(p=>({...p,[f.key]:e.target.value}))}
                        placeholder={f.ph} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none", colorScheme:"dark" }}/>
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", display:"block", marginBottom:8 }}>Sampling Method</label>
                  <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                    {["Random sampling","Judgement sampling","Risk-based sampling","Statistical sampling"].map(m=>(
                      <label key={m} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }}>
                        <input type="radio" name="sampling" checked={createForm.sampling===m} onChange={()=>setCreateForm(f=>({...f,sampling:m}))} style={{ accentColor:"rgb(147,197,253)" }}/>
                        <span style={{ fontSize:12, color:"var(--foreground)" }}>{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4 — Review & Launch */}
            {createStep===4 && (() => {
              const fw = AUDIT_FRAMEWORKS.find(f=>f.id===createForm.fwId);
              const guidance = AUDIT_FW_GUIDANCE[createForm.fwId] ?? [];
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>Review & Launch</div>

                  {/* Summary card */}
                  <div style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {([
                      ["Framework",  `${fw?.flag??""} ${createForm.fwName}`],
                      ["Audit Type", createForm.auditType],
                      ["Name",       createForm.name||`${createForm.fwName} — ${createForm.auditType}`],
                      ["Auditor",    createForm.auditor||"—"],
                      ["Auditee",    createForm.auditee||"—"],
                      ["Sampling",   createForm.sampling],
                      ["Start Date", createForm.startDate||"Not scheduled"],
                      ["End Date",   createForm.endDate||"Open-ended"],
                    ] as [string,string][]).map(([k,v])=>(
                      <div key={k}>
                        <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>{k}</div>
                        <div style={{ fontSize:12, color:"var(--foreground)", fontWeight:600 }}>{v}</div>
                      </div>
                    ))}
                    {(createForm.entity||createForm.location) && (
                      <div style={{ gridColumn:"1/-1" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Scope</div>
                        <div style={{ fontSize:12, color:"var(--foreground)", fontWeight:600 }}>{[createForm.entity,createForm.location,createForm.process].filter(Boolean).join(" · ")}</div>
                      </div>
                    )}
                  </div>

                  {/* Framework-specific checklist */}
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:"rgb(147,197,253)", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                      <span>{fw?.flag}</span> {createForm.fwName} — Key Audit Steps & Guidance
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                      {guidance.map((step,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 14px", background:"rgba(255,255,255,0.025)", border:"1px solid var(--border)", borderRadius:8 }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"rgb(147,197,253)", flexShrink:0, marginTop:1 }}>{i+1}</div>
                          <span style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.55 }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 19-stage workflow preview */}
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10 }}>Universal 19-Stage Audit Workflow — will be tracked after launch</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {WORKFLOW_STAGES.map(st=>(
                        <span key={st.n} style={{ fontSize:10, padding:"3px 9px", borderRadius:5, background:"var(--secondary)", border:"1px solid var(--border)", color:"var(--muted-foreground)" }}>{st.icon} {st.label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Footer */}
          <div style={{ padding:"18px 28px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <button onClick={()=>createStep>1?setCreateStep(s=>s-1):setCreateOpen(false)}
              style={{ padding:"9px 22px", borderRadius:8, border:"1px solid rgba(255,255,255,0.14)", background:"transparent", color:"var(--foreground)", fontSize:13, cursor:"pointer" }}>
              {createStep===1?"Cancel":"← Back"}
            </button>
            {createStep<4
              ? <button onClick={()=>{ if(createStep===1&&(!createForm.fwId||!createForm.auditType))return; setCreateStep(s=>s+1); }}
                  disabled={createStep===1&&(!createForm.fwId||!createForm.auditType)}
                  style={{ padding:"9px 26px", borderRadius:8, border:"none", background:(createStep===1&&(!createForm.fwId||!createForm.auditType))?"var(--border)":"#1E3A5F", color:(createStep===1&&(!createForm.fwId||!createForm.auditType))?"var(--muted-foreground)":"white", fontSize:13, fontWeight:700, cursor:(createStep===1&&(!createForm.fwId||!createForm.auditType))?"not-allowed":"pointer" }}>
                  Next →
                </button>
              : <button onClick={()=>{
                    const id=`AUD-${String(Date.now()).slice(-6)}`;
                    setLocalAudits(p=>[{
                      id, name:createForm.name||`${createForm.fwName} — ${createForm.auditType}`,
                      framework:createForm.fwName, type:createForm.auditType,
                      auditor:createForm.auditor, auditee:createForm.auditee,
                      scheduled:createForm.startDate||"Not scheduled",
                      scope:[createForm.entity,createForm.location,createForm.process].filter(Boolean).join(" · "),
                      status:"scheduled", findings:0,
                      objective:createForm.objective, sampling:createForm.sampling, endDate:createForm.endDate,
                    },...p]);
                    setCreateOpen(false); setTab("audits");
                  }}
                  style={{ padding:"9px 26px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#059669,#10B981)", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(16,185,129,0.35)" }}>
                  🚀 Launch Audit
                </button>
            }
          </div>
        </div>
      </div>
    )}

    {/* ── EVIDENCE ARTIFACT SIDE PANEL ──────────────────────────────────────── */}
    {evidencePanelCtrl && (
      <div style={{ position:"fixed", inset:0, zIndex:600, display:"flex", justifyContent:"flex-end" }} onClick={() => setEvidencePanelCtrl(null)}>
        <div style={{ width:"min(480px,95vw)", height:"100%", background:"var(--card)", border:"1px solid var(--border)", boxShadow:"-8px 0 40px rgba(0,0,0,0.7)", display:"flex", flexDirection:"column", overflow:"hidden" }} onClick={e=>e.stopPropagation()}>
          {/* Panel header */}
          <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#3B82F6", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Evidence Artifacts</div>
                <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)", lineHeight:1.3 }}>{evidencePanelCtrl.name}</div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{evidencePanelCtrl.id}</span>
                  {" · "}{evidencePanelCtrl.framework}
                </div>
              </div>
              <button onClick={() => setEvidencePanelCtrl(null)} style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, color:"var(--muted-foreground)", fontSize:16, cursor:"pointer", padding:"4px 10px", lineHeight:1, flexShrink:0 }}>✕</button>
            </div>
            <button onClick={handleCollectNow} disabled={collectingNow} style={{ marginTop:14, width:"100%", padding:"9px", background:collectingNow?"var(--border)":"#3B82F6", color:"#fff", border:"none", borderRadius:8, cursor:collectingNow?"not-allowed":"pointer", fontSize:13, fontWeight:700, opacity:collectingNow?0.7:1 }}>
              {collectingNow ? "⟳ Collecting…" : "▶ Collect Now"}
            </button>
            {evidencePanelItems.length > 0 && (
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button
                  onClick={() => handleExportSingle("pdf")}
                  disabled={!!exportingCtrl}
                  style={{ flex:1, padding:"8px", background:"#DC2626", color:"#fff", border:"none", borderRadius:7, cursor:exportingCtrl?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:exportingCtrl?0.6:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  {exportingCtrl ? "⟳" : "⬇"} Export PDF
                </button>
                <button
                  onClick={() => handleExportSingle("zip")}
                  disabled={!!exportingCtrl}
                  style={{ flex:1, padding:"8px", background:"#7C3AED", color:"#fff", border:"none", borderRadius:7, cursor:exportingCtrl?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:exportingCtrl?0.6:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  {exportingCtrl ? "⟳" : "⬇"} Export ZIP
                </button>
              </div>
            )}
          </div>
          {/* Upload file section */}
          <div style={{ padding:"12px 24px", borderTop:"1px solid var(--border)", flexShrink:0 }}>
            <input
              ref={panelFileRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.docx,.doc,.txt,.csv,.zip"
              style={{ display:"none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handlePanelFileUpload(f);
              }}
            />
            <button
              onClick={() => { setPanelUploadError(null); panelFileRef.current?.click(); }}
              disabled={panelUploading}
              style={{ width:"100%", padding:"9px", background:panelUploading?"var(--border)":"rgba(59,130,246,0.12)", color:panelUploading?"var(--muted-foreground)":"#93C5FD", border:"1px dashed rgba(59,130,246,0.4)", borderRadius:8, cursor:panelUploading?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:panelUploading?0.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {panelUploading ? <><span style={{ display:"inline-block", width:12, height:12, border:"2px solid #93C5FD", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} /> Uploading…</> : <>📎 Upload File (PDF, DOCX, PNG, ZIP — max 25 MB)</>}
            </button>
            {panelUploadError && (
              <div style={{ marginTop:6, fontSize:11, color:"#F87171", background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:6, padding:"5px 10px" }}>{panelUploadError}</div>
            )}
          </div>

          {/* Panel body */}
          <div style={{ flex:1, overflow:"auto", padding:"16px 24px" }}>
            {evidencePanelLoading ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", paddingTop:48, flexDirection:"column", gap:12 }}>
                <div style={{ width:28, height:28, border:"3px solid #3B82F6", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
                <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Loading evidence…</div>
              </div>
            ) : evidencePanelItems.length === 0 ? (
              <div style={{ textAlign:"center", paddingTop:40 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>📂</div>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6 }}>No evidence collected yet</div>
                <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:20, lineHeight:1.5 }}>Use "Collect Now" for automated evidence, or upload a file directly above.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {evidencePanelItems.map((item: any) => {
                  const evSt  = item.status ?? "missing";
                  const evCol = evStatusColor(evSt);
                  const isFileUpload = item.sourceIntegration === "file-upload";
                  const intgIcon: Record<string,string> = { github:"🐱", aws:"☁️", okta:"🔐", manual:"📤", "file-upload":"📄" };
                  const icon  = intgIcon[item.sourceIntegration] ?? "🔬";
                  const ts    = item.collectedAt ? new Date(item.collectedAt) : null;
                  const payload = item.rawPayload ?? {};
                  return (
                    <div key={item.id} style={{ background:"var(--secondary)", border:`1px solid ${evCol}33`, borderRadius:12, overflow:"hidden" }}>
                      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:18 }}>{icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>
                            {isFileUpload ? (payload.fileName ?? "Uploaded File") : `${item.sourceIntegration} Collector`}
                          </div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>
                            {ts ? ts.toLocaleString() : "—"}
                            {item.expiresAt && <span style={{ marginLeft:8 }}>· expires {new Date(item.expiresAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, background:`${evCol}18`, color:evCol, border:`1px solid ${evCol}44`, flexShrink:0 }}>
                          {evStatusLabel(evSt)}
                        </span>
                      </div>
                      {item.summary && (
                        <div style={{ padding:"10px 16px", fontSize:12, color:"var(--foreground)", lineHeight:1.5, borderBottom:"1px solid var(--border)" }}>
                          {item.summary}
                        </div>
                      )}
                      <div style={{ padding:"10px 16px" }}>
                        {isFileUpload ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                              <span style={{ fontWeight:700, color:"var(--foreground)" }}>Type:</span> {payload.evidenceType ?? "Document"}
                              {payload.fileSize && <span style={{ marginLeft:12 }}><span style={{ fontWeight:700, color:"var(--foreground)" }}>Size:</span> {(payload.fileSize / 1024).toFixed(1)} KB</span>}
                              {payload.mimeType && <span style={{ marginLeft:12 }}><span style={{ fontWeight:700, color:"var(--foreground)" }}>Format:</span> {payload.mimeType}</span>}
                            </div>
                            {payload.description && <div style={{ fontSize:11, color:"var(--muted-foreground)" }}><span style={{ fontWeight:700, color:"var(--foreground)" }}>Notes:</span> {payload.description}</div>}
                            {payload.storageUrl && (
                              <a
                                href="#"
                                onClick={async e => {
                                  e.preventDefault();
                                  const token = localStorage.getItem("grc_token");
                                  const resp = await fetch(`/api${payload.storageUrl}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                  if (!resp.ok) { alert("File not available"); return; }
                                  const blob = await resp.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url; a.download = payload.fileName ?? "evidence"; a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                style={{ fontSize:11, color:"#60A5FA", marginTop:4, display:"inline-flex", alignItems:"center", gap:4 }}>
                                ⬇ Download {payload.fileName}
                              </a>
                            )}
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:6 }}>Raw Payload</div>
                            <pre style={{ margin:0, fontSize:10, color:"#86EFAC", background:"rgba(0,0,0,0.3)", padding:"10px 12px", borderRadius:8, overflow:"auto", maxHeight:180, fontFamily:"'JetBrains Mono',monospace", lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
                              {JSON.stringify(item.rawPayload, null, 2)}
                            </pre>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:6 }}>Collector v{item.collectorVersion} · Run: {item.runId ?? "—"}</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    </div>
  );
}

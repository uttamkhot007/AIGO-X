// ── Compliance Packs — Full Implementation Data ───────────────────────────────
// Covers ISO 27001, SOC 2, RBI, SEBI, ISO 42001

export interface PolicyItem {
  id: string; name: string; mandatory: boolean;
  description: string; owner: string; type: string;
}
export interface ProcedureItem {
  id: string; name: string; category: string; description: string; steps: string[];
}
export interface PhaseTask {
  task: string; automation?: string;
}
export interface Phase {
  phase: number; title: string; icon: string; weeks: string;
  description: string; tasks: PhaseTask[]; deliverables: string[];
}
export interface ChecklistItem { item: string; required: boolean; evidence: string; }
export interface ChecklistDomain { domain: string; icon: string; items: ChecklistItem[]; }
export interface EvidenceItem { control: string; evidenceType: string; examples: string[]; frequency: string; }
export interface GapQuestion { id: string; question: string; domain: string; weight: number; }
export interface GapSection { section: string; questions: GapQuestion[]; }
export interface RaciItem { activity: string; responsible: string; accountable: string; consulted: string; informed: string; }
export interface TimelineWeek { week: string; label: string; milestones: string[]; phase: string; }
export interface SOAControl { id: string; name: string; annex: string; applicable: boolean; justification: string; implStatus: "implemented"|"partial"|"not-applicable"|"planned"; }
export interface Automation { title: string; description: string; source: string; output: string; }
export interface CertStage { stage: number; title: string; description: string; duration: string; criteria: string[]; }
export interface Document { name: string; type: string; description: string; required: boolean; }

export interface CompliancePack {
  id: string; name: string; shortName: string; version: string;
  category: string; tagline: string; certBody: string; certTypes: string[];
  totalWeeks: number; controlCount: number; policyCount: number;
  color: string; region: string; flag: string;
  policies: PolicyItem[];
  procedures: ProcedureItem[];
  registers: string[];
  phases: Phase[];
  auditChecklist: ChecklistDomain[];
  evidenceRequirements: EvidenceItem[];
  gapQuestionnaire: GapSection[];
  raciMatrix: RaciItem[];
  timeline: TimelineWeek[];
  soa?: SOAControl[];
  automations: Automation[];
  certificationStages: CertStage[];
  documents: Document[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO 27001:2022
// ─────────────────────────────────────────────────────────────────────────────
const ISO27001: CompliancePack = {
  id: "iso27001", name: "ISO/IEC 27001:2022", shortName: "ISO 27001",
  version: "2022", category: "Security", color: "#3B82F6",
  region: "Global", flag: "🌐",
  tagline: "Information Security Management System (ISMS)",
  certBody: "Accredited Certification Bodies (BSI, Bureau Veritas, DNV, etc.)",
  certTypes: ["Stage 1 Audit","Stage 2 Certification Audit","Surveillance Audit (Year 1 & 2)","Recertification Audit (Year 3)"],
  totalWeeks: 16, controlCount: 93, policyCount: 15,

  policies: [
    { id:"P-01", name:"Information Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"Top-level board-approved policy establishing ISMS objectives, principles and management commitment." },
    { id:"P-02", name:"Access Control Policy", mandatory:true, owner:"CISO", type:"policy", description:"Governs user provisioning, privilege management, password standards, and access review." },
    { id:"P-03", name:"Asset Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"Defines asset classification, labelling, handling, and acceptable use of information assets." },
    { id:"P-04", name:"Risk Management Policy", mandatory:true, owner:"CRO", type:"policy", description:"Establishes risk assessment methodology, appetite, tolerance levels and treatment approach." },
    { id:"P-05", name:"Incident Response Policy", mandatory:true, owner:"CISO", type:"policy", description:"Governs incident detection, classification, escalation, response, and post-incident review." },
    { id:"P-06", name:"Business Continuity Policy", mandatory:true, owner:"CRO", type:"policy", description:"Ensures continuity of critical processes, defines RTO/RPO targets, and mandates regular DR testing." },
    { id:"P-07", name:"Backup Policy", mandatory:true, owner:"IT Lead", type:"policy", description:"Defines backup schedules, retention, offsite storage, integrity verification, and restoration testing." },
    { id:"P-08", name:"Cryptography Policy", mandatory:true, owner:"CISO", type:"policy", description:"Specifies approved algorithms, key lengths, key management lifecycle, and certificate management." },
    { id:"P-09", name:"Data Classification Policy", mandatory:true, owner:"CISO", type:"policy", description:"Defines classification tiers (Public / Internal / Confidential / Restricted) and handling requirements." },
    { id:"P-10", name:"Change Management Policy", mandatory:true, owner:"IT Lead", type:"policy", description:"Controls the CAB process, emergency change procedures, rollback requirements, and post-change review." },
    { id:"P-11", name:"Vendor Security Policy", mandatory:true, owner:"Procurement", type:"policy", description:"Establishes vendor due diligence, security questionnaires, contractual clauses, and ongoing monitoring." },
    { id:"P-12", name:"Mobile Device & BYOD Policy", mandatory:true, owner:"CISO", type:"policy", description:"Governs corporate and personal devices, MDM enrolment, remote wipe capability, and acceptable use." },
    { id:"P-13", name:"Remote Access Policy", mandatory:true, owner:"CISO", type:"policy", description:"Specifies VPN requirements, MFA enforcement, approved tools, and monitoring of remote sessions." },
    { id:"P-14", name:"Secure Development Policy", mandatory:false, owner:"Dev Lead", type:"policy", description:"Defines SDLC security gates, code review, DAST/SAST requirements, and library management." },
    { id:"P-15", name:"Password Policy", mandatory:true, owner:"CISO", type:"policy", description:"Specifies minimum complexity, rotation intervals, prohibited patterns, and password manager requirements." },
    { id:"P-16", name:"Physical & Environmental Security Policy", mandatory:true, owner:"Facilities", type:"policy", description:"Controls physical access, visitor management, clean desk, and secure disposal of assets." },
    { id:"P-17", name:"Network Security Policy", mandatory:false, owner:"IT Lead", type:"policy", description:"Governs network segmentation, firewall rules, DMZ design, and wireless security standards." },
  ],

  procedures: [
    { id:"SOP-01", name:"User Provisioning SOP", category:"Access Management", description:"Step-by-step procedure for creating user accounts, assigning roles and granting access.", steps:["Receive approved HR onboarding request","Verify manager approval in ITSM ticket","Create account in IAM/AD per role template","Enrol in MFA — mandatory before first login","Send welcome email with security guidelines","Log provisioning in Access Register","Schedule access review at 30-day mark"] },
    { id:"SOP-02", name:"User Deprovisioning SOP", category:"Access Management", description:"Immediate and complete removal of access upon employee departure.", steps:["Receive departure notification from HR (same day)","Disable AD/IAM accounts within 1 hour","Revoke MFA tokens and SSO sessions","Transfer ownership of critical data and shared accounts","Remove from all mailing lists and distribution groups","Archive email and data per retention policy","Complete Access Review Closure Form"] },
    { id:"SOP-03", name:"Password Reset SOP", category:"Access Management", description:"Secure process for authenticating users and resetting credentials.", steps:["User submits reset request via self-service portal","System verifies identity via secondary factor (OTP/Manager approval)","Time-limited reset link sent to verified email","User sets new password meeting policy requirements","Reset event logged in SIEM","Anomalous resets (after hours, bulk) trigger alert to SOC"] },
    { id:"SOP-04", name:"Vulnerability Management SOP", category:"Security Operations", description:"End-to-end process from scan to remediation closure.", steps:["Weekly authenticated scans across all in-scope assets","Auto-import scan results into risk tracker","Triage and classify by CVSS + business context","Assign remediation owner via ticket","SLA: Critical ≤3d, High ≤15d, Medium ≤30d, Low ≤90d","Verify remediation with re-scan","Close ticket with evidence; escalate breached SLAs"] },
    { id:"SOP-05", name:"Patch Management SOP", category:"Security Operations", description:"Systematic patch deployment across all environments with rollback capability.", steps:["Subscribe to vendor security bulletins (automated)","Assess patch impact and schedule in change calendar","Test patch in non-production environment","Deploy via approved change window","Verify patch application and system stability","Update CMDB/asset inventory","Report patching compliance metrics monthly"] },
    { id:"SOP-06", name:"Incident Handling SOP", category:"Incident Management", description:"Structured response from detection through closure and lessons learned.", steps:["Incident detected by SIEM/EDR/user report","Log in Incident Register with timestamp and initial details","Classify severity (P1–P4) using classification matrix","Activate appropriate response team","Contain, investigate, and eradicate threat","Recover affected systems and verify restoration","Document root cause; conduct post-incident review within 5 days"] },
    { id:"SOP-07", name:"Risk Assessment SOP", category:"Risk Management", description:"Quarterly risk identification, analysis, and treatment planning.", steps:["Initiate risk assessment for new projects or annually","Identify threats and vulnerabilities per asset","Calculate inherent risk (Likelihood × Impact)","Identify existing controls and calculate residual risk","Select treatment: Accept / Mitigate / Transfer / Avoid","Document in Risk Register with owner and target date","Present to Risk Committee; update treatment status quarterly"] },
    { id:"SOP-08", name:"Change Management SOP", category:"ITSM", description:"CAB-governed process for all changes to production systems.", steps:["Requester submits RFC with impact assessment","Change Manager reviews for completeness","Low-risk: Standard Change (pre-approved); High-risk: CAB approval","Schedule in change calendar; notify stakeholders","Execute change in approved window with rollback plan","Post-implementation review within 24 hours","Close RFC; update CMDB"] },
    { id:"SOP-09", name:"Vendor Onboarding SOP", category:"Third-Party Risk", description:"Security due diligence before onboarding any new vendor.", steps:["Business owner submits vendor request with business justification","Classify vendor risk tier (Critical / High / Medium / Low)","Send security questionnaire appropriate to tier","Review responses; identify gaps; request remediation","Conduct on-site audit for Critical/High-tier vendors","Include security clauses in contract (DPA, right-to-audit)","Onboard to Vendor Register; set annual review date"] },
    { id:"SOP-10", name:"Backup & Restoration SOP", category:"Business Continuity", description:"Automated backup execution, integrity verification and restoration testing.", steps:["Daily automated backups run per schedule","Backup agent reports success/failure to ITSM","Daily integrity check via restore test (5% sample)","Weekly test restoration to non-production environment","Monthly full restoration drill for Tier-1 systems","Offsite replication verified weekly","Annual DR test with documented RTO/RPO achievement"] },
  ],

  registers: ["Asset Register","Risk Register","Incident Register","Vendor Register","Exception Register","Audit Findings Register","CAPA Register","Access Review Register","Change Register","Training Register"],

  phases: [
    { phase:1, title:"Scoping & Gap Assessment", icon:"🎯", weeks:"Weeks 1–4",
      description:"Define ISMS boundaries, assemble the steering committee, and conduct a baseline gap analysis against ISO 27001:2022 requirements.",
      tasks:[
        { task:"Obtain executive sponsorship and ISMS budget approval" },
        { task:"Define ISMS scope — locations, assets, processes, exclusions" },
        { task:"Establish steering committee and appoint ISMS Manager" },
        { task:"Conduct structured gap assessment against all 93 controls", automation:"AI-powered gap scoring against control library" },
        { task:"Identify applicable Annex A controls for SOA" },
        { task:"Develop risk assessment methodology and risk criteria" },
        { task:"Produce prioritised remediation roadmap" },
      ],
      deliverables:["ISMS Scope Statement","Gap Analysis Report","Remediation Roadmap","Risk Assessment Methodology","Project Plan"] },
    { phase:2, title:"Context, Stakeholders & Risk Assessment", icon:"🔍", weeks:"Weeks 3–6",
      description:"Analyse the organisation's context, identify interested parties, and complete the first full risk assessment.",
      tasks:[
        { task:"Document internal and external context (SWOT / PESTLE)" },
        { task:"Identify and document all interested parties and their requirements" },
        { task:"Build comprehensive Asset Register for all in-scope assets", automation:"Auto-discover assets from AD, CMDB, cloud inventory" },
        { task:"Perform risk assessment — identify threats, vulnerabilities, likelihood, impact" },
        { task:"Calculate inherent and residual risk scores" },
        { task:"Develop Risk Treatment Plan (RTP) with control selections" },
        { task:"Draft Statement of Applicability (SOA) with justifications" },
      ],
      deliverables:["Context Document","Interested Parties Register","Asset Register","Risk Register","Risk Treatment Plan","Statement of Applicability (SOA)"] },
    { phase:3, title:"Policy & Procedure Development", icon:"📝", weeks:"Weeks 5–9",
      description:"Develop all mandatory ISMS policies, procedures, and supporting documents.",
      tasks:[
        { task:"Draft Information Security Policy (board approval required)" },
        { task:"Develop all 17 supporting policies (access, data classification, cryptography, etc.)" },
        { task:"Create 10 core SOPs (provisioning, incident, patching, backup, etc.)" },
        { task:"Establish document management system with version control" },
        { task:"Conduct policy review with legal, HR and business owners" },
        { task:"Obtain formal management approval and publish policies" },
        { task:"Launch staff communication and awareness campaign" },
      ],
      deliverables:["Approved Policy Pack (17 policies)","SOP Library (10+ SOPs)","Document Management Register","Communication Plan"] },
    { phase:4, title:"Control Implementation", icon:"⚙️", weeks:"Weeks 7–13",
      description:"Implement or strengthen all technical, administrative, and physical controls to close gaps.",
      tasks:[
        { task:"Deploy/verify MFA across all critical systems and privileged accounts" },
        { task:"Implement or tune SIEM with required log sources and retention" },
        { task:"Deploy EDR on all endpoints; verify coverage ≥95%", automation:"Auto-inventory endpoints from MDM and AD" },
        { task:"Implement PAM solution for privileged accounts" },
        { task:"Conduct full VAPT on in-scope systems" },
        { task:"Implement data classification and DLP controls" },
        { task:"Complete security awareness training for all staff", automation:"Auto-enrol new joiners; auto-track completion" },
        { task:"Implement backup and verify DR capability" },
        { task:"Deploy vulnerability scanning and remediation workflow" },
      ],
      deliverables:["Control Implementation Tracker","Technical Configuration Baselines","VAPT Report","Training Completion Records","MFA Coverage Report"] },
    { phase:5, title:"Internal Audit", icon:"🔎", weeks:"Week 13",
      description:"Independent internal audit of all ISMS controls and processes to validate effectiveness.",
      tasks:[
        { task:"Develop internal audit programme and schedule" },
        { task:"Execute audit against all Annex A controls and clause requirements" },
        { task:"Collect and review evidence for each control" },
        { task:"Document non-conformities (major/minor) and observations" },
        { task:"Issue non-conformity reports to control owners" },
        { task:"Develop and approve CAPA plans for all findings" },
      ],
      deliverables:["Internal Audit Plan","Evidence Register","Non-Conformity Reports","CAPA Tracker","Internal Audit Report"] },
    { phase:6, title:"Management Review & Certification", icon:"🏆", weeks:"Weeks 14–16",
      description:"Formal management review, close all critical CAPAs, and proceed to Stage 1 and Stage 2 certification audits.",
      tasks:[
        { task:"Conduct management review meeting — review all required inputs" },
        { task:"Close all critical/major CAPAs; document closure evidence" },
        { task:"Prepare certification audit documentation pack" },
        { task:"Host Stage 1 (documentation) audit with certification body" },
        { task:"Address Stage 1 findings; schedule Stage 2 audit" },
        { task:"Host Stage 2 (on-site) audit" },
        { task:"Respond to Stage 2 findings within agreed timeline" },
      ],
      deliverables:["Management Review Minutes","CAPA Closure Evidence","Certification Audit Pack","ISO 27001 Certificate"] },
  ],

  auditChecklist: [
    { domain:"People", icon:"👥", items:[
      { item:"All employees have signed the Acceptable Use Policy and NDA", required:true, evidence:"Signed AUP forms in HR system" },
      { item:"Security awareness training completed by 100% of staff annually", required:true, evidence:"LMS completion report with timestamps" },
      { item:"Role-specific training delivered to privileged users, developers, and executives", required:true, evidence:"Training attendance records, assessment scores" },
      { item:"Background verification conducted for all new joiners", required:true, evidence:"BGV completion certificates" },
      { item:"ISMS roles and responsibilities documented and communicated", required:true, evidence:"RACI matrix, job descriptions" },
      { item:"Phishing simulation exercises conducted at least annually", required:false, evidence:"Phishing platform reports" },
      { item:"Security champion programme exists for development teams", required:false, evidence:"Programme documentation, meeting minutes" },
    ]},
    { domain:"Process", icon:"⚙️", items:[
      { item:"Formal risk assessment completed within the last 12 months", required:true, evidence:"Risk Register dated within 12 months" },
      { item:"Statement of Applicability (SOA) approved and current", required:true, evidence:"SOA document with management approval" },
      { item:"Risk Treatment Plan covers all accepted risks with owners", required:true, evidence:"RTP document linked to Risk Register" },
      { item:"Internal audit conducted and findings tracked to closure", required:true, evidence:"Internal Audit Report, CAPA Tracker" },
      { item:"Annual management review conducted with all required inputs", required:true, evidence:"Management Review Meeting Minutes" },
      { item:"Incident log maintained; all incidents reviewed post-closure", required:true, evidence:"Incident Register; post-incident review reports" },
      { item:"Change management process followed for all production changes", required:true, evidence:"CAB minutes, approved RFCs with evidence" },
      { item:"Vendor security assessments current for all critical suppliers", required:true, evidence:"Vendor risk register with dates" },
      { item:"ISMS objectives set, measured, and reported", required:true, evidence:"ISMS KPI dashboard; management reports" },
      { item:"Continuous improvement log maintained with actioned items", required:false, evidence:"Improvement register" },
    ]},
    { domain:"Technology", icon:"💻", items:[
      { item:"MFA enforced for all user and administrative accounts", required:true, evidence:"IAM/MFA coverage report" },
      { item:"EDR deployed on ≥95% of endpoints", required:true, evidence:"EDR console inventory report" },
      { item:"SIEM operational with log retention ≥12 months", required:true, evidence:"SIEM log source report; retention config" },
      { item:"Monthly vulnerability scans with tracked remediation", required:true, evidence:"Scan reports; remediation tickets with closure dates" },
      { item:"Annual penetration test by qualified third party", required:true, evidence:"Pen test report; remediation evidence" },
      { item:"Encryption applied to all Confidential/Restricted data at rest and in transit", required:true, evidence:"Encryption config; certificate inventory" },
      { item:"Backup tested and RTO/RPO targets met", required:true, evidence:"DR test report with RTO/RPO results" },
      { item:"Privileged access managed via PAM with session recording", required:true, evidence:"PAM console report; session log sample" },
      { item:"Network segmentation implemented; firewall rules reviewed annually", required:true, evidence:"Network diagram; firewall review log" },
      { item:"Patch compliance ≥95% for critical/high vulnerabilities within SLA", required:true, evidence:"Patch compliance dashboard; SLA metrics" },
    ]},
    { domain:"Governance & Documentation", icon:"📋", items:[
      { item:"Board-approved Information Security Policy published and accessible", required:true, evidence:"Policy document with approval signature/date" },
      { item:"All 17 supporting policies current and reviewed within 12 months", required:true, evidence:"Document review log with dates and approvers" },
      { item:"ISMS scope statement is documented and reflects actual operations", required:true, evidence:"Scope document; ISMS boundary diagram" },
      { item:"Asset Register is complete and classified", required:true, evidence:"Asset Register with owner, classification, location" },
      { item:"Supplier contracts include security requirements and DPA clauses", required:true, evidence:"Contract samples; vendor register with contract dates" },
      { item:"CAPA process is defined; all findings tracked to closure", required:true, evidence:"CAPA Tracker; closure evidence per finding" },
    ]},
  ],

  evidenceRequirements: [
    { control:"Access Control", evidenceType:"Access Review Report", examples:["Quarterly access certification screenshots","Role assignment reports from IAM","Access removal confirmations (offboarding tickets)"], frequency:"Quarterly" },
    { control:"Vulnerability Management", evidenceType:"Scan & Remediation Records", examples:["Authenticated scan reports (tool output)","Remediation tickets with closure dates and re-scan","Patch compliance dashboard screenshot"], frequency:"Monthly" },
    { control:"Incident Management", evidenceType:"Incident Register & Reports", examples:["Incident log with classification and timeline","Post-incident review reports","Regulatory notification records (if applicable)"], frequency:"Per incident" },
    { control:"Change Management", evidenceType:"Change Records & CAB Minutes", examples:["RFC with impact assessment and approval","CAB meeting minutes","Post-implementation review (PIR) notes"], frequency:"Per change" },
    { control:"Security Awareness", evidenceType:"Training Records", examples:["LMS completion reports with staff names and dates","Phishing simulation results","Role-specific training attendance sheets"], frequency:"Annual + per event" },
    { control:"Backup & Recovery", evidenceType:"Backup & DR Test Reports", examples:["Automated backup success/failure logs","Monthly restoration test results","Annual DR test report with RTO/RPO achievement"], frequency:"Monthly + Annual DR test" },
    { control:"Risk Management", evidenceType:"Risk Register & Treatment Plan", examples:["Risk Register (dated, owner, status)","Risk Treatment Plan with control mapping","Risk acceptance records with management sign-off"], frequency:"Quarterly review" },
    { control:"Physical Security", evidenceType:"Access Logs & Reviews", examples:["Physical access log (data centre/server room)","Visitor register","CCTV retention confirmation","Clean desk audit results"], frequency:"Monthly" },
  ],

  gapQuestionnaire: [
    { section:"Governance & Leadership", questions:[
      { id:"G1", question:"Has the ISMS scope been formally documented and approved by management?", domain:"Governance", weight:8 },
      { id:"G2", question:"Is there a board-approved Information Security Policy published to all staff?", domain:"Governance", weight:9 },
      { id:"G3", question:"Has a CISO or ISMS Manager role been formally appointed?", domain:"Governance", weight:7 },
      { id:"G4", question:"Has a management review meeting been conducted in the past 12 months?", domain:"Governance", weight:8 },
      { id:"G5", question:"Are ISMS objectives defined, measured, and reported to management?", domain:"Governance", weight:6 },
    ]},
    { section:"Risk Management", questions:[
      { id:"R1", question:"Has a formal risk assessment been completed using a documented methodology?", domain:"Risk", weight:10 },
      { id:"R2", question:"Is a risk register maintained with owners, scores, and treatment status?", domain:"Risk", weight:9 },
      { id:"R3", question:"Has a Statement of Applicability (SOA) been developed for all Annex A controls?", domain:"Risk", weight:10 },
      { id:"R4", question:"Are all risk treatment plans implemented with documented evidence?", domain:"Risk", weight:8 },
      { id:"R5", question:"Is risk reviewed and updated at least annually or upon significant changes?", domain:"Risk", weight:7 },
    ]},
    { section:"Access Control & Identity", questions:[
      { id:"A1", question:"Is MFA enforced for all privileged and remote access accounts?", domain:"Access", weight:9 },
      { id:"A2", question:"Is a formal user provisioning and deprovisioning process in place?", domain:"Access", weight:8 },
      { id:"A3", question:"Are access reviews conducted quarterly for all critical systems?", domain:"Access", weight:7 },
      { id:"A4", question:"Is privileged access managed via a PAM solution?", domain:"Access", weight:8 },
      { id:"A5", question:"Are all user accounts unique, with no shared credentials?", domain:"Access", weight:9 },
    ]},
    { section:"Security Operations & Technology", questions:[
      { id:"T1", question:"Is a SIEM operational with coverage across all critical log sources?", domain:"Technology", weight:8 },
      { id:"T2", question:"Is endpoint protection (EDR/AV) deployed with ≥95% coverage?", domain:"Technology", weight:9 },
      { id:"T3", question:"Is there a vulnerability management programme with tracked SLAs?", domain:"Technology", weight:9 },
      { id:"T4", question:"Has an annual penetration test been conducted by a qualified third party?", domain:"Technology", weight:8 },
      { id:"T5", question:"Is encryption applied to all sensitive data at rest and in transit?", domain:"Technology", weight:9 },
      { id:"T6", question:"Are network zones segmented and firewall rules reviewed annually?", domain:"Technology", weight:7 },
    ]},
    { section:"Incident & Business Continuity", questions:[
      { id:"I1", question:"Is an incident response plan documented, tested, and communicated?", domain:"Incident", weight:9 },
      { id:"I2", question:"Is there a defined incident severity classification and escalation matrix?", domain:"Incident", weight:8 },
      { id:"I3", question:"Are post-incident reviews conducted and actions tracked?", domain:"Incident", weight:7 },
      { id:"I4", question:"Is a BCP/DR plan documented with defined RTO and RPO targets?", domain:"BCP", weight:8 },
      { id:"I5", question:"Is the DR plan tested at least annually with documented results?", domain:"BCP", weight:9 },
    ]},
    { section:"People & Awareness", questions:[
      { id:"P1", question:"Is mandatory security awareness training conducted annually for all staff?", domain:"People", weight:8 },
      { id:"P2", question:"Are role-specific training programmes in place for high-risk roles?", domain:"People", weight:7 },
      { id:"P3", question:"Are background verification checks conducted for all new joiners?", domain:"People", weight:7 },
      { id:"P4", question:"Have all staff signed an Acceptable Use Policy and NDA?", domain:"People", weight:8 },
      { id:"P5", question:"Are phishing simulation exercises conducted to test staff awareness?", domain:"People", weight:6 },
    ]},
  ],

  raciMatrix: [
    { activity:"ISMS Scope Definition", responsible:"ISMS Manager", accountable:"CISO", consulted:"Legal, IT, Business Owners", informed:"Board, Senior Management" },
    { activity:"Risk Assessment", responsible:"Risk Analyst", accountable:"CISO", consulted:"Asset Owners, IT, Legal", informed:"Senior Management" },
    { activity:"Policy Development & Approval", responsible:"ISMS Manager", accountable:"CISO", consulted:"Legal, HR, IT", informed:"All Staff" },
    { activity:"Control Implementation", responsible:"IT Security Team", accountable:"CISO", consulted:"ISMS Manager, System Owners", informed:"Senior Management" },
    { activity:"Security Awareness Training", responsible:"HR / ISMS Manager", accountable:"CISO", consulted:"Department Heads", informed:"All Staff" },
    { activity:"Internal Audit", responsible:"Internal Auditor", accountable:"Head of Audit", consulted:"ISMS Manager, CISO", informed:"Board, Senior Management" },
    { activity:"Incident Response", responsible:"SOC / IR Team", accountable:"CISO", consulted:"Legal, PR, IT", informed:"Management, Regulator (if required)" },
    { activity:"Management Review", responsible:"ISMS Manager", accountable:"CEO / Board", consulted:"CISO, CRO, IT", informed:"All Stakeholders" },
    { activity:"Vendor Risk Assessment", responsible:"Procurement / Security", accountable:"CISO", consulted:"Legal, Business Owner", informed:"Senior Management" },
    { activity:"Certification Audit Coordination", responsible:"ISMS Manager", accountable:"CISO", consulted:"All Department Heads", informed:"Board, Senior Management" },
  ],

  timeline: [
    { week:"W1-2",  label:"Kick-off & Scoping",       milestones:["Executive sponsorship secured","ISMS Manager appointed","Scope boundaries defined","Project plan approved"],                phase:"Phase 1" },
    { week:"W3-4",  label:"Gap Assessment",             milestones:["Control gap assessment complete","Remediation roadmap approved","Budget allocated"],                                     phase:"Phase 1" },
    { week:"W5-6",  label:"Context & Risk Prep",        milestones:["Context document complete","Interested parties register complete","Asset Register v1 published"],                         phase:"Phase 2" },
    { week:"W6-7",  label:"Risk Assessment",            milestones:["Risk assessment methodology approved","Initial risk register complete","RTP drafted"],                                     phase:"Phase 2" },
    { week:"W7-8",  label:"SOA Drafted",                milestones:["SOA drafted — all 93 controls assessed","Applicable controls confirmed","Management review of SOA"],                      phase:"Phase 2" },
    { week:"W8-10", label:"Policy Development",         milestones:["Core information security policy drafted","All 17 policies in review","Legal and HR sign-off obtained"],                  phase:"Phase 3" },
    { week:"W10-11",label:"Policy Approval & Publish",  milestones:["Board-approved policy pack published","Staff communication sent","Document management system live"],                      phase:"Phase 3" },
    { week:"W11-12",label:"Control Implementation I",   milestones:["MFA rollout complete","EDR coverage ≥95%","PAM deployed for privileged accounts"],                                       phase:"Phase 4" },
    { week:"W12-13",label:"Control Implementation II",  milestones:["SIEM tuned & log sources connected","VAPT completed","DLP configured","Backup DR test run"],                            phase:"Phase 4" },
    { week:"W13",   label:"Internal Audit",             milestones:["Internal audit executed","Non-conformities documented","CAPA plans approved by owners"],                                  phase:"Phase 5" },
    { week:"W14",   label:"CAPA Remediation",           milestones:["Critical/major CAPAs closed","Evidence compiled","Management review conducted"],                                         phase:"Phase 5" },
    { week:"W15",   label:"Stage 1 Audit",              milestones:["Stage 1 documentation audit complete","Stage 1 findings addressed","Stage 2 scheduled"],                                 phase:"Phase 6" },
    { week:"W16",   label:"Stage 2 Certification",      milestones:["Stage 2 on-site audit complete","Certification granted 🎉","Surveillance audit schedule set"],                          phase:"Phase 6" },
  ],

  soa: [
    { id:"A.5.1",  name:"Policies for information security",            annex:"A.5 Organisational Controls",  applicable:true,  justification:"Required to establish ISMS governance",                       implStatus:"implemented" },
    { id:"A.5.2",  name:"Information security roles and responsibilities",annex:"A.5 Organisational Controls", applicable:true, justification:"Required by ISO 27001 Clause 5.3",                           implStatus:"implemented" },
    { id:"A.5.3",  name:"Segregation of duties",                        annex:"A.5 Organisational Controls",  applicable:true,  justification:"Reduce risk of fraud and error",                            implStatus:"partial" },
    { id:"A.5.7",  name:"Threat intelligence",                          annex:"A.5 Organisational Controls",  applicable:true,  justification:"Proactive threat awareness for critical systems",            implStatus:"partial" },
    { id:"A.5.23", name:"Information security for use of cloud services",annex:"A.5 Organisational Controls", applicable:true,  justification:"Cloud services used for critical operations",               implStatus:"partial" },
    { id:"A.6.1",  name:"Screening",                                    annex:"A.6 People Controls",          applicable:true,  justification:"Background checks required for all staff",                  implStatus:"implemented" },
    { id:"A.6.3",  name:"Information security awareness, education and training",annex:"A.6 People Controls", applicable:true,  justification:"Annual training mandatory for all staff",                   implStatus:"implemented" },
    { id:"A.6.5",  name:"Responsibilities after termination or change of employment",annex:"A.6 People Controls",applicable:true,"justification":"Access removal on departure is mandatory",               implStatus:"implemented" },
    { id:"A.7.1",  name:"Physical security perimeters",                 annex:"A.7 Physical Controls",        applicable:true,  justification:"Data centre and office perimeter controls required",        implStatus:"implemented" },
    { id:"A.7.4",  name:"Physical security monitoring",                 annex:"A.7 Physical Controls",        applicable:true,  justification:"CCTV monitoring of data centre required",                  implStatus:"implemented" },
    { id:"A.8.1",  name:"User end point devices",                       annex:"A.8 Technological Controls",   applicable:true,  justification:"All endpoints must be managed and protected",              implStatus:"implemented" },
    { id:"A.8.2",  name:"Privileged access rights",                     annex:"A.8 Technological Controls",   applicable:true,  justification:"PAM required for all privileged accounts",                 implStatus:"partial" },
    { id:"A.8.5",  name:"Secure authentication",                        annex:"A.8 Technological Controls",   applicable:true,  justification:"MFA required for all critical system access",              implStatus:"implemented" },
    { id:"A.8.7",  name:"Protection against malware",                   annex:"A.8 Technological Controls",   applicable:true,  justification:"EDR deployed on all endpoints",                            implStatus:"implemented" },
    { id:"A.8.8",  name:"Management of technical vulnerabilities",       annex:"A.8 Technological Controls",   applicable:true,  justification:"Vulnerability management programme operational",           implStatus:"partial" },
    { id:"A.8.11", name:"Data masking",                                  annex:"A.8 Technological Controls",   applicable:false, justification:"No production data used in non-production environments",   implStatus:"not-applicable" },
    { id:"A.8.15", name:"Logging",                                       annex:"A.8 Technological Controls",   applicable:true,  justification:"SIEM operational; log retention 12 months",                implStatus:"partial" },
    { id:"A.8.16", name:"Monitoring activities",                         annex:"A.8 Technological Controls",   applicable:true,  justification:"Continuous monitoring via SIEM and EDR",                   implStatus:"partial" },
    { id:"A.8.24", name:"Use of cryptography",                           annex:"A.8 Technological Controls",   applicable:true,  justification:"AES-256 at rest; TLS 1.2+ in transit mandatory",           implStatus:"implemented" },
    { id:"A.8.25", name:"Secure development life cycle",                 annex:"A.8 Technological Controls",   applicable:true,  justification:"In-house software development requires SDLC controls",     implStatus:"partial" },
  ],

  automations: [
    { title:"Auto-Discovery: Asset Inventory", description:"Pull live asset inventory from Active Directory, CMDB, AWS/Azure/GCP asset APIs, and MDM platforms.", source:"AD, CMDB, Cloud APIs, MDM", output:"Populated Asset Register with classification suggestions" },
    { title:"Auto-Pull: MFA Coverage Report", description:"Query IAM/Azure AD for all accounts; identify accounts without MFA enrolled and generate a non-compliance report.", source:"Azure AD, Okta, IAM platform", output:"MFA coverage % and list of non-compliant accounts" },
    { title:"Auto-Pull: Vulnerability Feed", description:"Import authenticated scan results from Tenable/Qualys/Rapid7; auto-create remediation tickets in ITSM with SLA targets.", source:"Tenable, Qualys, Rapid7", output:"Risk-sorted vulnerability list with ticket assignments" },
    { title:"Auto-Pull: Backup Status", description:"Query backup agents across all servers; verify completion status and flag failures for immediate attention.", source:"Veeam, Commvault, AWS Backup", output:"Backup health dashboard; failed backup alerts" },
    { title:"Auto-Pull: EDR Health", description:"Query EDR console for agent coverage, threat detections, and health status across all endpoints.", source:"CrowdStrike, SentinelOne, Defender ATP", output:"EDR coverage report; active threat detections" },
    { title:"Auto-Pull: Cloud Security Posture", description:"Continuous posture assessment across cloud accounts; import CSPM findings into GRC risk register.", source:"AWS Security Hub, Azure Defender, GCP SCC", output:"Cloud misconfiguration findings mapped to ISO 27001 controls" },
    { title:"Auto-Generate: SOA", description:"Based on completed risk assessment and control implementation data, generate a pre-populated SOA with applicability and status.", source:"Risk Register, Control Library", output:"Draft SOA document ready for management review" },
    { title:"Auto-Generate: Risk Treatment Plan", description:"Auto-generate RTP from risk register data, mapping accepted risks to applicable controls with owner assignments.", source:"Risk Register, Asset Register", output:"Risk Treatment Plan with control linkage" },
    { title:"Auto-Generate: Internal Audit Checklist", description:"Generate domain-specific audit checklists from the control library, pre-populated with last evidence dates.", source:"Control Library, Evidence Register", output:"Personalised audit checklist per auditor scope" },
    { title:"Auto-Generate: CAPA Tracker", description:"Auto-create CAPA records for all internal audit findings; assign to control owners with SLA-based due dates.", source:"Audit Report, ITSM Integration", output:"CAPA Tracker with owner assignments and due dates" },
  ],

  certificationStages: [
    { stage:1, title:"Readiness Assessment", duration:"1–2 weeks", description:"Pre-certification readiness check against all 93 controls and ISO 27001 clauses. Identify remaining gaps.", criteria:["Gap assessment complete","SOA drafted","Risk Register current","Core policies approved","ISMS team trained"] },
    { stage:2, title:"Stage 1 — Documentation Review", duration:"1–2 days", description:"Certification body reviews ISMS documentation off-site. Key documents: scope, SOA, risk assessment, policies, procedures.", criteria:["ISMS scope approved","SOA with justifications","Risk Assessment and RTP","All mandatory policies","Evidence of management review"] },
    { stage:3, title:"Stage 2 — On-Site Certification Audit", duration:"2–5 days", description:"Auditor conducts on-site assessment of control effectiveness through interviews, observation, and evidence review.", criteria:["Stage 1 findings closed","Controls operating effectively","Staff prepared for interviews","Evidence files organised","Audit support team available"] },
    { stage:4, title:"Certificate Issuance", duration:"2–4 weeks post-audit", description:"Certification body deliberates and issues ISO 27001 certificate. Valid for 3 years with annual surveillance audits.", criteria:["All major non-conformities closed","Minor NC correction plans accepted","Certificate application submitted","Registration fee paid"] },
    { stage:5, title:"Surveillance Audits", duration:"1–2 days annually", description:"Annual audits to verify continued compliance and ISMS improvement. Covers approximately 1/3 of controls each year.", criteria:["ISMS continuously maintained","Corrective actions from previous audit closed","New scope changes documented","Management review conducted"] },
    { stage:6, title:"Recertification (Year 3)", duration:"2–3 days", description:"Full recertification audit every 3 years. Equivalent in scope to initial Stage 2 but with focus on improvement and evolution.", criteria:["3 years of evidence maintained","All surveillance findings closed","ISMS objectives reviewed and updated","Recertification application submitted"] },
  ],

  documents: [
    { name:"ISMS Charter", type:"charter", description:"Board-approved charter establishing ISMS authority, objectives, and management commitment.", required:true },
    { name:"ISMS Scope Statement", type:"policy", description:"Formal document defining the boundaries and applicability of the ISMS.", required:true },
    { name:"Statement of Applicability (SOA)", type:"register", description:"Complete list of all 93 Annex A controls with applicability decisions and justifications.", required:true },
    { name:"Risk Assessment Report", type:"report", description:"Full risk assessment methodology, results, and risk owner assignments.", required:true },
    { name:"Risk Treatment Plan", type:"plan", description:"Selected treatments for all identified risks, mapped to Annex A controls.", required:true },
    { name:"Information Security Policy", type:"policy", description:"Board-approved top-level ISMS policy.", required:true },
    { name:"Asset Register Template", type:"register", description:"Spreadsheet/tool template for capturing all in-scope assets with owner, classification, and location.", required:true },
    { name:"Vendor Risk Assessment Questionnaire", type:"form", description:"Security questionnaire for third-party vendors — tiered by risk level.", required:true },
    { name:"Incident Report Form", type:"form", description:"Standard form for logging and classifying information security incidents.", required:true },
    { name:"Change Request Form (RFC)", type:"form", description:"Standard RFC template with impact assessment, rollback plan, and CAB approval workflow.", required:true },
    { name:"Management Review Agenda & Minutes Template", type:"form", description:"Pre-structured agenda covering all mandatory ISO 27001 management review inputs.", required:true },
    { name:"Internal Audit Report Template", type:"report", description:"Standard format for documenting audit scope, findings, non-conformities, and recommendations.", required:true },
    { name:"CAPA Form", type:"form", description:"Corrective and Preventive Action form with root cause analysis and verification fields.", required:true },
    { name:"Access Review Checklist", type:"checklist", description:"Quarterly access certification checklist for system owners to review and confirm user access.", required:true },
    { name:"Data Classification Matrix", type:"checklist", description:"Reference matrix for classifying data types against confidentiality, integrity, and availability requirements.", required:false },
    { name:"Business Impact Analysis Template", type:"assessment", description:"BIA template to identify critical processes, dependencies, and RTO/RPO requirements.", required:false },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SOC 2 (Trust Services Criteria)
// ─────────────────────────────────────────────────────────────────────────────
const SOC2: CompliancePack = {
  id: "soc2", name: "SOC 2 (AICPA TSC)", shortName: "SOC 2",
  version: "2017 (updated 2022)", category: "Security", color: "#8B5CF6",
  region: "USA", flag: "🇺🇸",
  tagline: "Service Organisation Controls — Trust Services Criteria",
  certBody: "AICPA-licensed CPA firms (Deloitte, PwC, EY, KPMG, Schellman, Coalfire, etc.)",
  certTypes: ["SOC 2 Type 1 (Design effectiveness at a point in time)","SOC 2 Type 2 (Operating effectiveness over 3–12 months)"],
  totalWeeks: 24, controlCount: 64, policyCount: 16,

  policies: [
    { id:"P-01", name:"Information Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"Umbrella security policy covering all TSC criteria." },
    { id:"P-02", name:"Access Control Policy", mandatory:true, owner:"CISO", type:"policy", description:"User and privileged access management, least privilege, MFA." },
    { id:"P-03", name:"Change Management Policy", mandatory:true, owner:"CTO", type:"policy", description:"SDLC controls, CAB process, environment separation, rollback." },
    { id:"P-04", name:"Availability & DR Policy", mandatory:true, owner:"CTO", type:"policy", description:"SLA commitments, RTO/RPO, capacity management, incident response." },
    { id:"P-05", name:"Confidentiality Policy", mandatory:true, owner:"CISO", type:"policy", description:"Data classification, NDA requirements, data retention and disposal." },
    { id:"P-06", name:"Privacy Policy", mandatory:false, owner:"DPO", type:"policy", description:"Personal data handling, consent, data subject rights (required for Privacy TSC)." },
    { id:"P-07", name:"Vendor Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"Subservice organisation risk assessment, contractual requirements, monitoring." },
    { id:"P-08", name:"Incident Response & Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"Security incident classification, response, disclosure obligations." },
    { id:"P-09", name:"Acceptable Use Policy", mandatory:true, owner:"HR", type:"policy", description:"Employee obligations, device use, data handling, social media." },
    { id:"P-10", name:"Logging & Monitoring Policy", mandatory:true, owner:"CISO", type:"policy", description:"Log collection requirements, retention (minimum 1 year), alert thresholds." },
    { id:"P-11", name:"Risk Assessment Policy", mandatory:true, owner:"CRO", type:"policy", description:"Annual risk assessment methodology, risk acceptance criteria." },
    { id:"P-12", name:"Encryption & Key Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"Encryption standards, key rotation, certificate lifecycle." },
    { id:"P-13", name:"SDLC & Secure Coding Policy", mandatory:true, owner:"CTO", type:"policy", description:"Security in SDLC, SAST/DAST requirements, code review, dependency management." },
    { id:"P-14", name:"Background Check Policy", mandatory:true, owner:"HR", type:"policy", description:"Pre-employment screening for all staff with system access." },
    { id:"P-15", name:"Backup Policy", mandatory:true, owner:"CTO", type:"policy", description:"Backup frequency, retention, encryption, restoration testing." },
    { id:"P-16", name:"Subservice Organisation Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"Monitoring of critical subservice organisations through SOC reports and assessments." },
  ],

  procedures: [
    { id:"SOP-01", name:"Quarterly Access Review SOP", category:"Access", description:"Manager-led access certification for all user and service accounts.", steps:["Pull access list from IAM for all systems in scope","Assign to respective managers in access review tool","Managers certify or revoke access within 10 business days","IT removes revoked access within 24 hours","Document results; escalate non-participation to CISO","Archive completed review for auditor evidence"] },
    { id:"SOP-02", name:"Change Control SOP", category:"SDLC", description:"All changes to production follow a defined approval and testing workflow.", steps:["Developer creates change request with impact assessment","Peer code review completed; reviewer sign-off documented","QA test in staging with documented test results","Change Manager approves production deployment","Deploy during approved window; monitor post-deployment","Post-implementation review within 24 hours; close ticket with evidence"] },
    { id:"SOP-03", name:"Incident Disclosure SOP", category:"Incident", description:"Structured process for assessing and disclosing security incidents to customers.", steps:["Incident detected and classified by SOC","Assess customer data impact within 1 hour of detection","CISO decision point: customer notification required?","Notify affected customers within contractual/regulatory SLA","Public status page updated if service-affecting","Post-incident report published within 5 business days"] },
    { id:"SOP-04", name:"Evidence Collection SOP", category:"Audit Readiness", description:"Monthly automated evidence collection to support Type 2 audit.", steps:["Run automated evidence collection scripts (monthly)","Collect: access reviews, change records, monitoring alerts, backup logs","Store evidence in labelled folders per TSC criteria","Quality-check evidence completeness and date coverage","Flag any missing evidence for manual collection","Submit evidence package to audit readiness tracker"] },
    { id:"SOP-05", name:"Subservice Organisation Review SOP", category:"Vendor", description:"Annual review of critical subservice organisations for SOC 2 compliance.", steps:["Identify all subservice organisations in scope","Request current SOC 2 report (Type 1 or Type 2)","Review report for exceptions and adverse opinions","Assess complementary user entity controls (CUECs)","Document review in vendor register","Escalate material exceptions to CISO and management"] },
  ],

  registers: ["Access Review Register","Subservice Organisation Register","Incident Register","Change Register","Monitoring Alert Log","Capacity Register","Evidence Repository"],

  phases: [
    { phase:1, title:"Scope & TSC Selection", icon:"🎯", weeks:"Weeks 1–3",
      description:"Define audit scope, select applicable Trust Services Criteria, and identify in-scope systems and subservice organisations.",
      tasks:[
        { task:"Define SOC 2 scope (systems, services, geographies)" },
        { task:"Select applicable TSC: Security (mandatory) + Availability / PI / Confidentiality / Privacy" },
        { task:"Identify all subservice organisations (IaaS, SaaS, payroll, etc.)" },
        { task:"Conduct readiness assessment against selected TSC criteria" },
        { task:"Decide Type 1 vs. Type 2 — set observation period start date" },
      ],
      deliverables:["SOC 2 Scope Definition","TSC Selection Memo","Subservice Org Register","Readiness Assessment"] },
    { phase:2, title:"Gap Assessment & Remediation Planning", icon:"📊", weeks:"Weeks 2–6",
      description:"Map existing controls to TSC criteria and develop a remediation plan for all gaps.",
      tasks:[
        { task:"Map current controls to each CC (Common Criteria) and additional TSC criteria" },
        { task:"Identify control gaps and document remediation owners" },
        { task:"Develop remediation timeline aligned to Type 2 observation period start" },
        { task:"Engage auditor early for pre-assessment (recommended)" },
      ],
      deliverables:["TSC Control Mapping","Gap Analysis Report","Remediation Roadmap"] },
    { phase:3, title:"Policy & Control Implementation", icon:"📝", weeks:"Weeks 4–12",
      description:"Develop all required policies, implement controls, and begin building evidence.",
      tasks:[
        { task:"Develop/update all 16 required policies" },
        { task:"Implement quarterly access review process", automation:"Auto-pull access lists from IdP; auto-assign reviews to managers" },
        { task:"Implement change management workflow (JIRA/ADO/ServiceNow)" },
        { task:"Configure logging and monitoring with required alert rules" },
        { task:"Implement subservice organisation monitoring process" },
        { task:"Begin evidence collection — every control needs 3–12 months of evidence for Type 2" },
      ],
      deliverables:["Policy Pack","Control Implementation Evidence","Monitoring Configuration","Access Review Completion Records"] },
    { phase:4, title:"Type 2 Observation Period", icon:"⏱", weeks:"Weeks 12–24",
      description:"12-month (or minimum 3-month) period during which controls must operate consistently. Evidence collected monthly.",
      tasks:[
        { task:"Monthly automated evidence collection for all controls" },
        { task:"Quarterly access reviews with documented completion" },
        { task:"Monthly review of monitoring alerts and responses" },
        { task:"All changes processed through formal change management" },
        { task:"Subservice organisation SOC reports reviewed annually" },
        { task:"Conduct internal readiness assessment at mid-point" },
      ],
      deliverables:["Monthly Evidence Packages","Quarterly Access Review Records","Monitoring Alert Reviews","Change Records"] },
    { phase:5, title:"Auditor Fieldwork", icon:"🔎", weeks:"Post-observation",
      description:"Auditor conducts testing of controls through inquiry, inspection, observation, and re-performance.",
      tasks:[
        { task:"Submit evidence package to auditor" },
        { task:"Respond to auditor requests for additional information within agreed SLA" },
        { task:"Schedule walkthroughs and interviews for key process owners" },
        { task:"Address exceptions identified during fieldwork" },
      ],
      deliverables:["Evidence Package","Auditor Workpapers","Exception Responses"] },
    { phase:6, title:"Report Issuance & Distribution", icon:"🏆", weeks:"4–8 weeks post-fieldwork",
      description:"CPA firm issues SOC 2 report. Distribute to customers under NDA. Plan continuous improvement.",
      tasks:[
        { task:"Review draft report — verify accuracy of management assertions" },
        { task:"Sign management representation letter" },
        { task:"Receive final SOC 2 Type 2 report" },
        { task:"Distribute to customers under NDA; publish on trust portal" },
        { task:"Address any exceptions; begin next year's observation period" },
      ],
      deliverables:["SOC 2 Type 2 Report","Management Assertion","Exception Remediation Plans","Customer Distribution Log"] },
  ],

  auditChecklist: [
    { domain:"Security (CC)", icon:"🛡", items:[
      { item:"MFA enforced for all logical access to in-scope systems", required:true, evidence:"IAM MFA coverage report" },
      { item:"Access provisioning and de-provisioning process documented and followed", required:true, evidence:"Provisioning/deprovisioning tickets" },
      { item:"Quarterly access reviews completed with evidence of manager approval", required:true, evidence:"Access review completion reports" },
      { item:"SIEM operational; alerts reviewed and responded to with documentation", required:true, evidence:"Alert review log; SIEM configuration" },
      { item:"Annual penetration test conducted and findings remediated", required:true, evidence:"Pen test report; remediation evidence" },
    ]},
    { domain:"Availability (A)", icon:"⚡", items:[
      { item:"Uptime monitoring in place; SLA commitments tracked", required:true, evidence:"Monitoring dashboard; SLA reports" },
      { item:"DR plan documented with tested RTO/RPO", required:true, evidence:"DR test report; RTO/RPO results" },
      { item:"Capacity management process in place", required:true, evidence:"Capacity review records; auto-scaling config" },
      { item:"Incident response plan covers availability incidents", required:true, evidence:"IR plan; availability incident log" },
    ]},
    { domain:"Processing Integrity (PI)", icon:"⚙️", items:[
      { item:"Change management process enforced for all production changes", required:true, evidence:"Change records with approvals; CAB minutes" },
      { item:"SDLC includes security review gates (code review, testing, approval)", required:true, evidence:"Code review records; deployment approvals" },
      { item:"Monitoring in place for processing errors and exceptions", required:true, evidence:"Error monitoring alerts; exception log" },
    ]},
    { domain:"Confidentiality (C)", icon:"🔒", items:[
      { item:"Data classification implemented; Confidential data identified and protected", required:true, evidence:"Data classification policy; DLP reports" },
      { item:"Encryption applied to confidential data at rest and in transit", required:true, evidence:"Encryption configuration; certificate inventory" },
      { item:"NDAs in place for all staff and vendors with access to confidential data", required:true, evidence:"Signed NDA register" },
    ]},
    { domain:"Privacy (P)", icon:"🏷", items:[
      { item:"Privacy notice published and accessible", required:false, evidence:"Privacy policy URL; publication date" },
      { item:"Data subject rights process implemented and tested", required:false, evidence:"DSR request log; response records" },
      { item:"Personal data inventory maintained", required:false, evidence:"Data mapping/RoPA document" },
    ]},
  ],

  evidenceRequirements: [
    { control:"CC6.1 Logical Access", evidenceType:"Access Review Reports", examples:["Quarterly access certification completion with manager sign-off","Provisioning/deprovisioning tickets for sample users","MFA enrolment reports from IAM platform"], frequency:"Quarterly" },
    { control:"CC7.1 Vulnerability Management", evidenceType:"Scan & Pen Test Reports", examples:["Authenticated scan reports","Annual pen test report from qualified third party","Remediation tickets for Critical/High findings"], frequency:"Monthly scans; Annual pen test" },
    { control:"CC8.1 Change Management", evidenceType:"Change Records", examples:["Sample of production change requests with approvals","Code review evidence (PR approvals)","Test results and deployment records"], frequency:"Per change" },
    { control:"A1.1 Availability Monitoring", evidenceType:"Uptime & DR Reports", examples:["Monitoring tool uptime reports","DR test execution report with RTO/RPO results","Incident tickets for availability events"], frequency:"Monthly monitoring; Annual DR test" },
  ],

  gapQuestionnaire: [
    { section:"Security (CC)", questions:[
      { id:"S1", question:"Is MFA enforced for all access to in-scope systems?", domain:"Security", weight:10 },
      { id:"S2", question:"Are quarterly access reviews conducted and documented?", domain:"Security", weight:9 },
      { id:"S3", question:"Is a SIEM or equivalent monitoring tool operational?", domain:"Security", weight:8 },
      { id:"S4", question:"Has an annual penetration test been conducted?", domain:"Security", weight:9 },
      { id:"S5", question:"Is a formal change management process enforced for all production changes?", domain:"Security", weight:9 },
    ]},
    { section:"Availability", questions:[
      { id:"A1", question:"Is uptime/availability monitoring in place with alerting?", domain:"Availability", weight:9 },
      { id:"A2", question:"Has a DR test been conducted with documented RTO/RPO results?", domain:"Availability", weight:10 },
      { id:"A3", question:"Is a capacity management process in place?", domain:"Availability", weight:7 },
    ]},
    { section:"Processing Integrity", questions:[
      { id:"P1", question:"Are all production changes processed through a formal change management workflow?", domain:"PI", weight:9 },
      { id:"P2", question:"Is there monitoring for processing errors and exceptions?", domain:"PI", weight:8 },
    ]},
  ],

  raciMatrix: [
    { activity:"TSC Scope Definition", responsible:"CISO/CTO", accountable:"CEO", consulted:"Legal, Auditor", informed:"Board" },
    { activity:"Control Implementation", responsible:"Security/Engineering Team", accountable:"CISO", consulted:"CTO, Auditor", informed:"Management" },
    { activity:"Quarterly Access Reviews", responsible:"System Owners/Managers", accountable:"CISO", consulted:"IT", informed:"Auditor" },
    { activity:"Evidence Collection", responsible:"GRC/Security Team", accountable:"CISO", consulted:"Engineering, HR", informed:"Auditor" },
    { activity:"Auditor Coordination", responsible:"GRC Manager", accountable:"CISO", consulted:"Legal, CTO", informed:"Board, Customers" },
    { activity:"Report Distribution", responsible:"GRC Manager", accountable:"CEO", consulted:"Legal, CISO", informed:"Customers, Partners" },
  ],

  timeline: [
    { week:"W1-3",   label:"Scope & TSC Selection",       milestones:["Scope defined","TSC selected","Readiness assessment complete"],                         phase:"Phase 1" },
    { week:"W4-6",   label:"Gap Assessment",               milestones:["Control mapping complete","Gaps identified","Remediation plan approved"],               phase:"Phase 2" },
    { week:"W7-12",  label:"Policy & Control Implementation",milestones:["All policies approved","Controls implemented","Evidence collection started"],         phase:"Phase 3" },
    { week:"W12-24", label:"Type 2 Observation Period",    milestones:["Monthly evidence collected","Quarterly access reviews done","Mid-point readiness check"], phase:"Phase 4" },
    { week:"W24+",   label:"Auditor Fieldwork",            milestones:["Evidence submitted","Walkthroughs completed","Draft report reviewed"],                   phase:"Phase 5" },
    { week:"W28+",   label:"Report Issuance",              milestones:["SOC 2 Type 2 report issued","Distributed to customers","Next cycle planning started"],   phase:"Phase 6" },
  ],

  automations: [
    { title:"Auto-Pull: Access Lists", description:"Monthly pull of all user access from IdP (Okta/Azure AD/Google) for access review preparation.", source:"Okta, Azure AD, Google Workspace", output:"Pre-populated access review spreadsheet per system" },
    { title:"Auto-Pull: Change Records", description:"Pull all production deployments from JIRA/GitHub/ADO; verify each has required approvals.", source:"JIRA, GitHub, Azure DevOps", output:"Change compliance report with missing approvals flagged" },
    { title:"Auto-Collect: SIEM Alerts", description:"Monthly report of all SIEM alerts, categorised by severity, with response documentation.", source:"Splunk, Datadog, Elastic SIEM", output:"Alert review log ready for auditor sampling" },
    { title:"Auto-Pull: Uptime Reports", description:"Pull uptime metrics from monitoring tools; calculate SLA compliance automatically.", source:"PagerDuty, Datadog, New Relic", output:"Monthly uptime/SLA report for auditor evidence" },
    { title:"Auto-Collect: Evidence Package", description:"Monthly automated collection of all TSC evidence into an organised audit-ready folder structure.", source:"All integrated tools", output:"Labelled evidence package per TSC criterion" },
  ],

  certificationStages: [
    { stage:1, title:"Readiness Assessment", duration:"2–4 weeks", description:"Internal pre-assessment against all selected TSC criteria.", criteria:["Controls mapped to TSC","Policy pack complete","Evidence collection process running","No known critical gaps"] },
    { stage:2, title:"Type 1 Audit (Optional)", duration:"4–6 weeks", description:"Point-in-time assessment of control design. Useful for fast-track customer trust building.", criteria:["All controls designed and documented","No critical design gaps","Evidence of policy implementation"] },
    { stage:3, title:"Type 2 Observation Period", duration:"3–12 months", description:"Controls must operate consistently throughout the observation period.", criteria:["Continuous evidence collection","No major control failures","Quarterly access reviews completed"] },
    { stage:4, title:"Auditor Fieldwork", duration:"3–6 weeks", description:"CPA firm tests controls through sampling of evidence.", criteria:["Evidence package submitted","Process walkthroughs scheduled","Key personnel available"] },
    { stage:5, title:"Report Issuance", duration:"4–6 weeks", description:"Final SOC 2 Type 2 report issued and ready for customer distribution.", criteria:["Management assertions signed","All exceptions addressed","Report reviewed by legal"] },
  ],

  documents: [
    { name:"System Description", type:"report", description:"Management's description of the service organisation system — required section of SOC 2 report.", required:true },
    { name:"Complementary User Entity Controls (CUECs)", type:"checklist", description:"Controls that customers must implement to complement the service organisation's controls.", required:true },
    { name:"Complementary Subservice Organisation Controls (CSOCs)", type:"checklist", description:"Controls expected of subservice organisations to complement in-scope controls.", required:false },
    { name:"Evidence Collection Playbook", type:"procedure", description:"Step-by-step guide for collecting evidence for each TSC criterion monthly.", required:true },
    { name:"Access Review Template", type:"form", description:"Manager-facing quarterly access certification form.", required:true },
    { name:"Incident Report Template", type:"form", description:"Structured incident report for customer disclosure.", required:true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// RBI Cybersecurity Framework
// ─────────────────────────────────────────────────────────────────────────────
const RBI: CompliancePack = {
  id: "rbi", name: "RBI Cybersecurity Framework", shortName: "RBI CSF",
  version: "2024 Master Directions", category: "Regulatory", color: "#F59E0B",
  region: "India", flag: "🇮🇳",
  tagline: "Reserve Bank of India — IT & Cybersecurity Directions for Regulated Entities",
  certBody: "Reserve Bank of India (RBI) — Regulated Entities self-assess with third-party audit",
  certTypes: ["Annual Cybersecurity Assessment","RBI CSITE Thematic Review","Third-Party IS Audit"],
  totalWeeks: 20, controlCount: 81, policyCount: 14,

  policies: [
    { id:"P-01", name:"IT Governance Policy", mandatory:true, owner:"CTO/CISO", type:"policy", description:"IT strategy, IT Steering Committee charter, CISO mandate, and Board reporting obligations." },
    { id:"P-02", name:"Cybersecurity Policy", mandatory:true, owner:"CISO", type:"policy", description:"Covers the full RBI CSF cyber controls — SOC, SIEM, threat intelligence, vulnerability management." },
    { id:"P-03", name:"Incident Response & Reporting Policy", mandatory:true, owner:"CISO", type:"policy", description:"RBI-mandated incident reporting timelines (within 2 hours for critical incidents to RBI CSITE)." },
    { id:"P-04", name:"Third-Party Risk Management Policy", mandatory:true, owner:"CRO", type:"policy", description:"Vendor due diligence, risk tiering, exit planning, and outsourcing directions compliance." },
    { id:"P-05", name:"Data Localisation Policy", mandatory:true, owner:"CISO/Legal", type:"policy", description:"All payment system data to be stored in India per RBI mandate." },
    { id:"P-06", name:"Network & Perimeter Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"Firewall, IDS/IPS, DDoS mitigation, and network architecture standards." },
    { id:"P-07", name:"Privileged Access Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"PAM controls for all privileged users including vendor access." },
    { id:"P-08", name:"Vulnerability & Patch Management Policy", mandatory:true, owner:"CISO", type:"policy", description:"VAPT requirements, patch SLAs, and red teaming schedule per RBI circular." },
    { id:"P-09", name:"Business Continuity & DR Policy", mandatory:true, owner:"CRO", type:"policy", description:"RBI-mandated RTO/RPO for CBS, payment systems, and critical applications." },
    { id:"P-10", name:"Customer Data Protection Policy", mandatory:true, owner:"CISO/DPO", type:"policy", description:"Protection of customer financial data — storage, access, encryption, and breach notification." },
    { id:"P-11", name:"Outsourcing & Cloud Policy", mandatory:true, owner:"CRO", type:"policy", description:"RBI Outsourcing Guidelines compliance — due diligence, contracts, right-to-audit." },
    { id:"P-12", name:"Fraud Risk Management Policy", mandatory:true, owner:"CRO", type:"policy", description:"Detection and prevention of cyber fraud, UPI fraud, and payment system fraud." },
    { id:"P-13", name:"Cyber Crisis Management Plan", mandatory:true, owner:"CISO", type:"policy", description:"Crisis communication, war room procedures, and stakeholder notification during cyber incidents." },
    { id:"P-14", name:"IT Risk Policy", mandatory:true, owner:"CRO", type:"policy", description:"IT risk appetite, risk assessment methodology, and risk reporting to Board/senior management." },
  ],

  procedures: [
    { id:"SOP-01", name:"RBI Incident Reporting SOP", category:"Incident", description:"Process for reporting cyber incidents to RBI CSITE within prescribed timelines.", steps:["Detect and classify incident using RBI incident categories","Assess impact on customers and banking systems within 30 minutes","Report critical/major incidents to RBI CSITE within 2 hours via COSMOS portal","Activate Crisis Management Plan for P1 incidents","Submit detailed incident report within 24 hours","Conduct post-incident review; submit final report to RBI within agreed timeline"] },
    { id:"SOP-02", name:"VAPT & Red Team Exercise SOP", category:"Security Testing", description:"Annual VAPT and red team exercise as mandated by RBI.", steps:["Scope definition — all internet-facing and core banking systems","Engage CERT-IN empanelled agency for external VAPT","Execute black-box and grey-box penetration testing","Red team exercise at minimum every 2 years for large RE","Classify findings per CVSS; assign remediation owners","Submit VAPT report to Board/Audit Committee","Track remediation; re-test within 30 days of patch"] },
    { id:"SOP-03", name:"SOC Operations SOP", category:"Security Operations", description:"24x7 SOC operation procedures aligned to RBI SOC guidelines.", steps:["SOC analysts monitor SIEM dashboards 24x7","Alert triage and escalation per severity matrix","Investigation of all high/critical alerts within 15 minutes","Threat intelligence feeds ingested and correlated daily","Daily SOC briefing to CISO","Monthly SOC metrics report to CISO; quarterly to Board"] },
  ],

  registers: ["IT Asset Register","IT Incident Register","Vendor Risk Register","VAPT Findings Register","DR Test Register","Change Register","Board Reporting Register"],

  phases: [
    { phase:1, title:"IT Governance Setup", icon:"🏛", weeks:"Weeks 1–4",
      description:"Establish IT Steering Committee, CISO function, and Board-level IT governance.",
      tasks:[
        { task:"Constitute IT Steering Committee (MD/CEO, CISO, CTO, CRO)" },
        { task:"Appoint CISO with direct reporting line to MD/CEO or Board" },
        { task:"Define IT and cyber risk appetite for Board approval" },
        { task:"Develop IT governance framework and reporting structure" },
        { task:"Map all applicable RBI circulars and master directions" },
      ],
      deliverables:["IT Steering Committee Charter","CISO Appointment Letter","IT Risk Appetite Statement","RBI Compliance Mapping Register"] },
    { phase:2, title:"Security Operations Build-Out", icon:"🔭", weeks:"Weeks 3–8",
      description:"Implement SOC, SIEM, threat intelligence, and 24x7 monitoring.",
      tasks:[
        { task:"Implement/upgrade SIEM with all critical log sources" },
        { task:"Stand up 24x7 SOC (in-house or managed)" },
        { task:"Subscribe to threat intelligence feeds (CERT-IN, FS-ISAC, commercial)" },
        { task:"Implement IDS/IPS and DDoS mitigation" },
        { task:"Deploy PAM for all privileged accounts", automation:"Auto-discover privileged accounts from AD and CBS" },
        { task:"Configure real-time alerts for fraud and anomalous transactions" },
      ],
      deliverables:["SOC Operations Runbook","SIEM Architecture Document","Threat Intel Integration Report","DDoS Mitigation Confirmation"] },
    { phase:3, title:"Vulnerability & Patch Management", icon:"🛡", weeks:"Weeks 6–12",
      description:"Implement VAPT programme, patch management, and red team exercise aligned to RBI requirements.",
      tasks:[
        { task:"Engage CERT-IN empanelled firm for external VAPT" },
        { task:"Execute VAPT on all internet-facing and CBS systems" },
        { task:"Implement patch management with RBI-aligned SLAs (Critical ≤24h)" },
        { task:"Schedule red team exercise (TIBER-RBI framework)" },
        { task:"Conduct social engineering assessment (phishing, vishing)" },
        { task:"Track and remediate VAPT findings; re-test within 30 days" },
      ],
      deliverables:["VAPT Report (CERT-IN empanelled)","Patch Compliance Dashboard","Red Team Report","Remediation Tracker"] },
    { phase:4, title:"Third-Party & Outsourcing Risk", icon:"🤝", weeks:"Weeks 8–14",
      description:"Implement vendor risk management aligned to RBI Outsourcing Guidelines.",
      tasks:[
        { task:"Map all outsourced services and critical third parties" },
        { task:"Conduct risk assessment for each critical vendor" },
        { task:"Ensure contracts include right-to-audit, data protection, exit clauses" },
        { task:"Review cloud vendor agreements for RBI data localisation compliance" },
        { task:"Implement vendor monitoring (annual SOC reports, security questionnaires)" },
        { task:"Develop exit management plans for critical vendors" },
      ],
      deliverables:["Vendor Risk Register","Outsourcing Register","Exit Management Plans","Contract Amendment Tracker"] },
    { phase:5, title:"DR & Business Continuity", icon:"🔄", weeks:"Weeks 12–18",
      description:"Validate DR and BCP against RBI-mandated RTO/RPO for critical systems.",
      tasks:[
        { task:"Map RTO/RPO requirements per RBI guidelines for CBS, payment systems" },
        { task:"Conduct DR test with full failover to DR site" },
        { task:"Document DR test results vs. RTO/RPO targets" },
        { task:"Test data restoration for critical applications" },
        { task:"Conduct tabletop exercise for cyber crisis scenario" },
        { task:"Submit DR test report to Board" },
      ],
      deliverables:["DR Test Report","BCP Test Report","RTO/RPO Achievement Evidence","Board DR Report"] },
    { phase:6, title:"Audit & Board Reporting", icon:"📊", weeks:"Weeks 18–20",
      description:"Annual IS audit, Board reporting, and RBI regulatory submission.",
      tasks:[
        { task:"Conduct annual IS Audit (internal + CERT-IN empanelled external auditor)" },
        { task:"Submit Cyber Security Assessment report to Board/Audit Committee" },
        { task:"File required returns to RBI (cyber incident reports, IS audit report)" },
        { task:"Address audit findings with CAPA plans" },
        { task:"Present IT/cyber risk dashboard to Board quarterly" },
      ],
      deliverables:["IS Audit Report","Board Cyber Risk Report","RBI Regulatory Submissions","CAPA Register"] },
  ],

  auditChecklist: [
    { domain:"IT Governance", icon:"🏛", items:[
      { item:"IT Steering Committee constituted and meeting at least quarterly", required:true, evidence:"IT Steering Committee charter and meeting minutes" },
      { item:"CISO appointed with adequate authority and direct reporting to MD/CEO", required:true, evidence:"CISO appointment letter and org chart" },
      { item:"Board-approved IT Risk Appetite Statement in place", required:true, evidence:"Board resolution with IT risk appetite" },
      { item:"IT risk dashboard presented to Board at least quarterly", required:true, evidence:"Board meeting minutes with IT risk agenda" },
      { item:"Annual IS Audit conducted by CERT-IN empanelled firm", required:true, evidence:"IS Audit engagement letter and report" },
    ]},
    { domain:"Security Operations", icon:"🔭", items:[
      { item:"24x7 SOC operational with documented escalation procedures", required:true, evidence:"SOC Operations Runbook; SOC shift logs" },
      { item:"SIEM deployed with all critical log sources integrated", required:true, evidence:"SIEM architecture document; log source inventory" },
      { item:"Threat intelligence feeds integrated and correlated in SIEM", required:true, evidence:"TI feed subscription; correlation rule documentation" },
      { item:"Incidents reported to RBI CSITE within mandated timelines", required:true, evidence:"RBI incident reporting register with timestamps" },
    ]},
    { domain:"Vulnerability Management", icon:"🛡", items:[
      { item:"Annual VAPT conducted by CERT-IN empanelled agency on all in-scope systems", required:true, evidence:"VAPT engagement letter and final report" },
      { item:"Critical/high vulnerabilities patched within RBI-mandated SLAs", required:true, evidence:"Patch compliance report; remediation tickets" },
      { item:"Red team exercise conducted (minimum every 2 years for large REs)", required:true, evidence:"Red team report; remediation tracker" },
    ]},
    { domain:"Third-Party Risk", icon:"🤝", items:[
      { item:"All critical outsourced services assessed and registered", required:true, evidence:"Outsourcing register with risk ratings" },
      { item:"Contracts include right-to-audit, data protection, and exit clauses", required:true, evidence:"Contract review checklist; legal sign-off" },
      { item:"Annual vendor reviews conducted for all critical suppliers", required:true, evidence:"Vendor review records with dates" },
      { item:"Data localisation compliance verified for all payment system data", required:true, evidence:"Data flow map; storage location confirmation" },
    ]},
    { domain:"DR & Business Continuity", icon:"🔄", items:[
      { item:"DR test conducted annually with documented RTO/RPO achievement", required:true, evidence:"Annual DR test report with metrics" },
      { item:"RTO ≤4 hours and RPO ≤1 hour for CBS and critical payment systems", required:true, evidence:"DR test RTO/RPO measurement records" },
      { item:"BCP tested; tabletop cyber crisis exercise conducted", required:true, evidence:"BCP test report; tabletop exercise minutes" },
    ]},
  ],

  evidenceRequirements: [
    { control:"IT Governance", evidenceType:"Board & Committee Records", examples:["IT Steering Committee meeting minutes (quarterly)","Board IT risk dashboard presentations","CISO annual report to Board"], frequency:"Quarterly" },
    { control:"VAPT & Red Team", evidenceType:"Security Testing Reports", examples:["CERT-IN empanelled VAPT report","Red team exercise report","Remediation tracker with closure evidence"], frequency:"Annual" },
    { control:"Incident Management", evidenceType:"RBI CSITE Filings", examples:["RBI CSITE portal incident submission confirmations","Internal incident register","Post-incident review reports"], frequency:"Per incident" },
    { control:"DR & BCP", evidenceType:"DR Test Reports", examples:["Annual DR test report with RTO/RPO measurements","Tabletop exercise documentation","BCP review and approval records"], frequency:"Annual" },
  ],

  gapQuestionnaire: [
    { section:"IT Governance", questions:[
      { id:"G1", question:"Is an IT Steering Committee constituted with Board-level representation?", domain:"Governance", weight:9 },
      { id:"G2", question:"Has a CISO been appointed with formal authority and reporting to MD/CEO?", domain:"Governance", weight:10 },
      { id:"G3", question:"Is the annual IS Audit conducted by a CERT-IN empanelled firm?", domain:"Governance", weight:10 },
    ]},
    { section:"Security Operations", questions:[
      { id:"S1", question:"Is a 24x7 SOC operational with documented procedures?", domain:"SecOps", weight:10 },
      { id:"S2", question:"Has critical/major incident been reported to RBI CSITE within 2 hours?", domain:"Incident", weight:10 },
      { id:"S3", question:"Are all critical payment system logs integrated into SIEM?", domain:"Technology", weight:9 },
    ]},
    { section:"Vulnerability Management", questions:[
      { id:"V1", question:"Has annual VAPT been conducted by CERT-IN empanelled agency?", domain:"VAPT", weight:10 },
      { id:"V2", question:"Are critical vulnerabilities patched within 24 hours as per RBI mandate?", domain:"Patch", weight:10 },
    ]},
  ],

  raciMatrix: [
    { activity:"Board IT Risk Reporting", responsible:"CISO/CTO", accountable:"MD/CEO", consulted:"CRO, Internal Audit", informed:"Board" },
    { activity:"RBI Incident Reporting", responsible:"SOC/CISO", accountable:"MD/CEO", consulted:"Legal, PR", informed:"Board, RBI CSITE" },
    { activity:"Annual VAPT", responsible:"IT Security Team", accountable:"CISO", consulted:"IT, Business", informed:"Board, Audit Committee" },
    { activity:"DR Testing", responsible:"IT/BCP Team", accountable:"CTO", consulted:"Business Continuity Manager", informed:"Board, RBI" },
    { activity:"Vendor Risk Assessment", responsible:"Procurement/Risk", accountable:"CRO", consulted:"Legal, CISO", informed:"Board, Senior Management" },
  ],

  timeline: [
    { week:"W1-4",   label:"IT Governance Setup",          milestones:["IT Steering Committee constituted","CISO appointed","IT risk appetite approved"],         phase:"Phase 1" },
    { week:"W3-8",   label:"SOC & SIEM Build-Out",          milestones:["SIEM live with critical log sources","SOC procedures documented","TI feeds integrated"], phase:"Phase 2" },
    { week:"W6-12",  label:"VAPT & Vulnerability Mgmt",    milestones:["VAPT executed by CERT-IN firm","Critical patches applied","Red team scheduled"],         phase:"Phase 3" },
    { week:"W8-14",  label:"Third-Party Risk",              milestones:["Vendor register complete","Contracts reviewed","Outsourcing register approved"],          phase:"Phase 4" },
    { week:"W12-18", label:"DR & BCP Testing",              milestones:["DR test conducted","RTO/RPO verified","Tabletop exercise complete"],                     phase:"Phase 5" },
    { week:"W18-20", label:"Audit & Regulatory Submission", milestones:["IS Audit complete","Board report submitted","RBI filings made"],                         phase:"Phase 6" },
  ],

  automations: [
    { title:"Auto-Pull: SIEM Alert Summary", description:"Daily automated summary of SIEM alerts categorised by severity for SOC reporting.", source:"Splunk, QRadar, ArcSight", output:"Daily SOC alert digest; monthly regulatory evidence" },
    { title:"Auto-Pull: Patch Compliance", description:"Auto-pull patch status from EDR and patch management tools; identify critical patches >24h overdue.", source:"CrowdStrike, SCCM, Intune", output:"Patch compliance report with RBI SLA tracking" },
    { title:"Auto-Generate: RBI Incident Filing", description:"Auto-generate RBI CSITE incident report template from incident ticket data.", source:"ITSM Platform, SIEM", output:"Pre-filled RBI incident report for CISO review" },
    { title:"Auto-Pull: DR Metrics", description:"Auto-collect DR test results and calculate RTO/RPO achievement for Board reporting.", source:"DR Platform, CBS vendor", output:"RTO/RPO measurement report" },
    { title:"RBI Dashboard", description:"Real-time compliance dashboard mapped to all RBI CSF controls with status and evidence linkage.", source:"All GRC data sources", output:"RBI compliance posture dashboard for Board" },
  ],

  certificationStages: [
    { stage:1, title:"Baseline Assessment", duration:"2–3 weeks", description:"Map controls to all applicable RBI circulars and master directions.", criteria:["All RBI circulars mapped","Gap assessment complete","Remediation plan approved"] },
    { stage:2, title:"Control Implementation", duration:"12–16 weeks", description:"Implement all required technical and governance controls.", criteria:["SOC operational","VAPT complete","DR test conducted","Governance structures in place"] },
    { stage:3, title:"Annual IS Audit", duration:"4–6 weeks", description:"Independent IS audit by CERT-IN empanelled firm.", criteria:["CERT-IN firm engaged","Audit scope agreed","All evidence collected"] },
    { stage:4, title:"Board & RBI Reporting", duration:"2–4 weeks", description:"Board-level sign-off and RBI regulatory submissions.", criteria:["Audit report approved by Board","RBI submissions filed","CAPA plans approved"] },
    { stage:5, title:"Continuous Compliance", duration:"Ongoing", description:"Ongoing monitoring, quarterly Board reporting, and annual reassessment.", criteria:["Quarterly Board reports","Annual VAPT repeat","RBI incident reporting maintained"] },
  ],

  documents: [
    { name:"IT Governance Policy", type:"policy", description:"Board-approved IT governance policy covering RBI IT directions.", required:true },
    { name:"Cyber Crisis Management Plan", type:"plan", description:"Step-by-step cyber crisis response plan with RBI CSITE notification procedures.", required:true },
    { name:"RBI Compliance Mapping Matrix", type:"register", description:"Complete mapping of all RBI CSF controls to implemented policies and evidence.", required:true },
    { name:"VAPT Scope & Schedule", type:"plan", description:"Annual VAPT scope definition and engagement schedule.", required:true },
    { name:"Board IT Risk Report Template", type:"report", description:"Quarterly Board risk dashboard template covering IT and cyber risk.", required:true },
    { name:"Incident Report Template (RBI CSITE)", type:"form", description:"Template aligned to RBI CSITE incident reporting fields.", required:true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SEBI CSCRF
// ─────────────────────────────────────────────────────────────────────────────
const SEBI: CompliancePack = {
  id: "sebi", name: "SEBI Cybersecurity & Cyber Resilience Framework", shortName: "SEBI CSCRF",
  version: "2023 Circular", category: "Regulatory", color: "#10B981",
  region: "India", flag: "🇮🇳",
  tagline: "SEBI CSCRF for Regulated Entities — Stock Brokers, MIIs, AMCs, RTAs",
  certBody: "Securities and Exchange Board of India (SEBI) — Third-party IS Audit",
  certTypes: ["Annual Cybersecurity Audit","SEBI Inspection","Third-Party Audit"],
  totalWeeks: 18, controlCount: 72, policyCount: 12,

  policies: [
    { id:"P-01", name:"Cybersecurity Policy", mandatory:true, owner:"CISO", type:"policy", description:"SEBI-mandated cybersecurity policy covering all governance, technical, and operational requirements." },
    { id:"P-02", name:"IT Governance Policy", mandatory:true, owner:"CTO", type:"policy", description:"Cybersecurity Committee charter, CISO mandate, and Board reporting on cyber risk." },
    { id:"P-03", name:"Asset Classification Policy", mandatory:true, owner:"CISO", type:"policy", description:"Critical asset identification, data classification, and application inventory maintenance." },
    { id:"P-04", name:"Access Control & IAM Policy", mandatory:true, owner:"CISO", type:"policy", description:"MFA, PAM, role-based access, and privileged access controls." },
    { id:"P-05", name:"Incident Response Policy", mandatory:true, owner:"CISO", type:"policy", description:"Cybersecurity incident classification, response, and SEBI reporting obligations." },
    { id:"P-06", name:"Network Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"WAF, SIEM, IDS/IPS, DDoS protection, and network architecture standards." },
    { id:"P-07", name:"Data Loss Prevention Policy", mandatory:true, owner:"CISO", type:"policy", description:"DLP controls for customer and trading data; data exfiltration prevention." },
    { id:"P-08", name:"Vendor & Third-Party Risk Policy", mandatory:true, owner:"CRO", type:"policy", description:"Due diligence for all critical third parties; outsourcing controls." },
    { id:"P-09", name:"Business Continuity & Cyber Resilience Policy", mandatory:true, owner:"CRO", type:"policy", description:"BCP, DR, ransomware preparedness, and SEBI-mandated RTO/RPO targets." },
    { id:"P-10", name:"Cyber Threat Intelligence Policy", mandatory:true, owner:"CISO", type:"policy", description:"CTI integration, threat hunting, and dark web monitoring requirements." },
    { id:"P-11", name:"VAPT & Security Testing Policy", mandatory:true, owner:"CISO", type:"policy", description:"Annual VAPT, continuous scanning, and red team exercise requirements." },
    { id:"P-12", name:"Mobile Security & Endpoint Protection Policy", mandatory:true, owner:"CISO", type:"policy", description:"EDR, DLP, MDM, and secure coding requirements for mobile and endpoints." },
  ],

  procedures: [
    { id:"SOP-01", name:"SEBI Incident Reporting SOP", category:"Incident", description:"Reporting cyber incidents to SEBI within mandated timelines.", steps:["Detect and classify incident using SEBI categories","Assess market and customer impact","Report to SEBI via prescribed format within 6 hours for critical incidents","Notify CERT-IN if required","Submit detailed report within 24 hours","Conduct post-incident review; file final report to SEBI"] },
    { id:"SOP-02", name:"Cyber Threat Hunting SOP", category:"Threat Intelligence", description:"Proactive threat hunt aligned to SEBI CTI requirements.", steps:["Analyse threat intel feeds daily (CERT-IN, FS-ISAC, commercial)","Identify indicators of compromise (IoCs) relevant to securities sector","Hunt for IoCs in SIEM and endpoint telemetry","Escalate confirmed threats to CISO within 1 hour","Document hunt results; update threat intelligence database","Share intelligence with SEBI ISAC if material threat identified"] },
  ],

  registers: ["Critical Asset Register","Cyber Incident Register","Vendor Risk Register","VAPT Register","DR Test Register","CTI Register"],

  phases: [
    { phase:1, title:"Governance & Cybersecurity Committee", icon:"🏛", weeks:"Weeks 1–4",
      description:"Establish Cybersecurity Committee, CISO function, and SEBI compliance programme.",
      tasks:[
        { task:"Constitute Cybersecurity Committee (MD/CEO, CISO, CTO, CRO, Independent Director)" },
        { task:"Appoint CISO with Board-level reporting" },
        { task:"Develop SEBI CSCRF compliance mapping" },
        { task:"Identify critical assets — trading systems, market data feeds, customer data" },
        { task:"Classify all applications per SEBI criticality tiers" },
      ],
      deliverables:["Cybersecurity Committee Charter","CISO Appointment","Critical Asset Register","SEBI Compliance Matrix"] },
    { phase:2, title:"Security Controls Implementation", icon:"🛡", weeks:"Weeks 4–12",
      description:"Implement all SEBI-mandated technical security controls.",
      tasks:[
        { task:"Deploy WAF for all internet-facing trading and customer portals" },
        { task:"Implement SIEM with 24x7 SOC and threat hunting capability" },
        { task:"Deploy PAM for all privileged access to critical systems" },
        { task:"Implement DLP across email, endpoint, and web channels" },
        { task:"Deploy advanced EDR on all endpoints" },
        { task:"Subscribe to SEBI ISAC threat intelligence feeds" },
        { task:"Implement DDoS mitigation for trading platforms" },
      ],
      deliverables:["WAF Configuration","SIEM Deployment","PAM Coverage Report","DLP Configuration","CTI Integration Report"] },
    { phase:3, title:"Cyber Resilience & DR", icon:"🔄", weeks:"Weeks 10–16",
      description:"Build and test cyber resilience capabilities — ransomware preparedness, DR, and BCP.",
      tasks:[
        { task:"Conduct ransomware readiness assessment and implement mitigations" },
        { task:"Implement immutable backup solution for critical systems" },
        { task:"Test DR failover for all Tier-1 systems" },
        { task:"Conduct tabletop cyber crisis exercise with Cybersecurity Committee" },
        { task:"Implement cyber insurance" },
        { task:"Build cyber resilience metrics dashboard for SEBI reporting" },
      ],
      deliverables:["Ransomware Preparedness Report","DR Test Report","Tabletop Exercise Report","Cyber Resilience Dashboard"] },
    { phase:4, title:"Audit & SEBI Reporting", icon:"📋", weeks:"Weeks 16–18",
      description:"Annual cybersecurity audit and SEBI regulatory reporting.",
      tasks:[
        { task:"Conduct annual IS audit by SEBI-empanelled auditor" },
        { task:"Submit annual cybersecurity audit report to Board" },
        { task:"File required cybersecurity returns to SEBI" },
        { task:"Implement audit finding remediation plan" },
      ],
      deliverables:["Cybersecurity Audit Report","SEBI Regulatory Filings","CAPA Register"] },
  ],

  auditChecklist: [
    { domain:"Governance", icon:"🏛", items:[
      { item:"Cybersecurity Committee constituted with appropriate membership", required:true, evidence:"Committee charter and meeting minutes" },
      { item:"CISO appointed and actively managing cybersecurity programme", required:true, evidence:"CISO appointment letter; quarterly reports" },
      { item:"Annual cybersecurity policy reviewed and Board-approved", required:true, evidence:"Policy document with Board resolution" },
      { item:"SEBI CSCRF compliance mapped and tracked", required:true, evidence:"Compliance matrix with evidence linkage" },
    ]},
    { domain:"Security Controls", icon:"🛡", items:[
      { item:"WAF deployed for all internet-facing trading systems", required:true, evidence:"WAF deployment report; rule configuration" },
      { item:"SIEM operational with threat hunting capability", required:true, evidence:"SIEM coverage report; threat hunt logs" },
      { item:"PAM implemented for all privileged access", required:true, evidence:"PAM console coverage report" },
      { item:"DLP deployed across endpoint, email, and web channels", required:true, evidence:"DLP policy configuration; violation report" },
      { item:"EDR deployed on ≥95% of endpoints", required:true, evidence:"EDR console coverage report" },
    ]},
    { domain:"Cyber Resilience", icon:"🔄", items:[
      { item:"Annual DR test conducted; RTO/RPO targets met", required:true, evidence:"DR test report with metrics" },
      { item:"Ransomware preparedness assessed and mitigations implemented", required:true, evidence:"Ransomware assessment report; immutable backup config" },
      { item:"Tabletop cyber crisis exercise conducted annually", required:true, evidence:"Exercise report; Cybersecurity Committee sign-off" },
    ]},
    { domain:"Incident Management", icon:"🚨", items:[
      { item:"Cyber incidents reported to SEBI within mandated timelines", required:true, evidence:"SEBI incident reporting register" },
      { item:"CERT-IN notified for applicable incidents", required:true, evidence:"CERT-IN notification records" },
      { item:"Post-incident reviews conducted and shared with SEBI if required", required:true, evidence:"PIR reports; SEBI submission records" },
    ]},
  ],

  evidenceRequirements: [
    { control:"Governance", evidenceType:"Committee & Board Records", examples:["Cybersecurity Committee meeting minutes","CISO quarterly report","Board-approved cybersecurity policy"], frequency:"Quarterly" },
    { control:"VAPT", evidenceType:"Security Testing Reports", examples:["Annual VAPT report","SEBI-empanelled auditor report","Remediation tracker"], frequency:"Annual" },
    { control:"Incident Reporting", evidenceType:"SEBI Filings", examples:["SEBI incident submission confirmations","Incident register","Post-incident review reports"], frequency:"Per incident" },
    { control:"DR/BCP", evidenceType:"DR Test Reports", examples:["Annual DR test report","Tabletop exercise documentation"], frequency:"Annual" },
  ],

  gapQuestionnaire: [
    { section:"Governance", questions:[
      { id:"G1", question:"Is a Cybersecurity Committee constituted per SEBI CSCRF requirements?", domain:"Governance", weight:10 },
      { id:"G2", question:"Is SEBI CSCRF compliance mapped and tracked with evidence?", domain:"Governance", weight:9 },
    ]},
    { section:"Security Controls", questions:[
      { id:"T1", question:"Is a WAF deployed for all internet-facing trading portals?", domain:"Technology", weight:10 },
      { id:"T2", question:"Is PAM implemented for all privileged access to critical trading systems?", domain:"Technology", weight:9 },
      { id:"T3", question:"Is DLP deployed across email, endpoint, and cloud channels?", domain:"Technology", weight:8 },
    ]},
    { section:"Resilience", questions:[
      { id:"R1", question:"Has ransomware preparedness been assessed and mitigations implemented?", domain:"Resilience", weight:9 },
      { id:"R2", question:"Is immutable backup in place for all critical trading systems?", domain:"Resilience", weight:10 },
    ]},
  ],

  raciMatrix: [
    { activity:"SEBI Compliance Programme", responsible:"CISO/GRC Team", accountable:"MD/CEO", consulted:"CRO, Legal, Internal Audit", informed:"Board, SEBI" },
    { activity:"Cybersecurity Committee", responsible:"Company Secretary/CISO", accountable:"MD/CEO", consulted:"CISO, CTO, CRO", informed:"Board" },
    { activity:"SEBI Incident Reporting", responsible:"SOC/CISO", accountable:"MD/CEO", consulted:"Legal, PR, Compliance", informed:"Board, SEBI, CERT-IN" },
    { activity:"Annual Cybersecurity Audit", responsible:"CISO/GRC Team", accountable:"MD/CEO", consulted:"Auditor, All HODs", informed:"Board, SEBI" },
  ],

  timeline: [
    { week:"W1-4",  label:"Governance Setup",         milestones:["Cybersecurity Committee constituted","CISO appointed","Compliance matrix complete"],            phase:"Phase 1" },
    { week:"W4-12", label:"Security Controls",        milestones:["WAF deployed","SIEM live","PAM implemented","DLP configured","EDR deployed"],                   phase:"Phase 2" },
    { week:"W10-16",label:"Cyber Resilience",         milestones:["Ransomware assessment done","DR test complete","Tabletop exercise conducted"],                  phase:"Phase 3" },
    { week:"W16-18",label:"Audit & SEBI Reporting",   milestones:["IS audit complete","SEBI filings submitted","CAPA plans approved"],                             phase:"Phase 4" },
  ],

  automations: [
    { title:"Auto-Pull: Trading System Logs", description:"Continuous ingestion of trading platform logs into SIEM for anomaly detection.", source:"Trading System APIs, CBS", output:"Real-time alert on trading anomalies; SEBI reportable events" },
    { title:"Auto-Monitor: SEBI ISAC Threat Intel", description:"Automated ingestion of SEBI ISAC threat intel feeds; correlation against internal telemetry.", source:"SEBI ISAC, CERT-IN", output:"Threat intel dashboard; IOC matches in SIEM" },
    { title:"SEBI Compliance Dashboard", description:"Real-time SEBI CSCRF compliance dashboard with control status and evidence linkage.", source:"All GRC data sources", output:"SEBI CSCRF posture dashboard for Board and SEBI inspection" },
  ],

  certificationStages: [
    { stage:1, title:"Baseline Assessment", duration:"2 weeks", description:"Map controls to SEBI CSCRF; identify gaps.", criteria:["SEBI CSCRF mapping complete","Gap assessment done","Critical assets identified"] },
    { stage:2, title:"Control Implementation", duration:"10–14 weeks", description:"Implement all SEBI-mandated technical and governance controls.", criteria:["WAF, SIEM, PAM, DLP, EDR deployed","DR test complete","Governance structures in place"] },
    { stage:3, title:"Annual Cybersecurity Audit", duration:"3–4 weeks", description:"SEBI-empanelled auditor conducts annual IS audit.", criteria:["SEBI-empanelled auditor engaged","Evidence collected","Audit scope agreed"] },
    { stage:4, title:"SEBI Filing & Board Approval", duration:"2 weeks", description:"Board approval and SEBI regulatory submissions.", criteria:["Audit report Board-approved","SEBI filings made","CAPA plans approved"] },
  ],

  documents: [
    { name:"SEBI CSCRF Compliance Matrix", type:"register", description:"Mapping of all SEBI CSCRF requirements to controls and evidence.", required:true },
    { name:"Cybersecurity Policy (SEBI CSCRF aligned)", type:"policy", description:"Board-approved cybersecurity policy covering all SEBI CSCRF requirements.", required:true },
    { name:"Cyber Crisis Communication Plan", type:"plan", description:"Communication plan for cyber incidents to SEBI, CERT-IN, and stakeholders.", required:true },
    { name:"Critical Asset Register", type:"register", description:"Register of all critical trading systems, market data systems, and customer data stores.", required:true },
    { name:"SEBI Incident Report Template", type:"form", description:"Template aligned to SEBI prescribed incident reporting format.", required:true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ISO 42001 — AI Management System
// ─────────────────────────────────────────────────────────────────────────────
const ISO42001: CompliancePack = {
  id: "iso42001", name: "ISO/IEC 42001:2023", shortName: "ISO 42001",
  version: "2023", category: "AI Governance", color: "#EC4899",
  region: "Global", flag: "🌐",
  tagline: "Artificial Intelligence Management System (AIMS)",
  certBody: "Accredited Certification Bodies (BSI, Bureau Veritas, SGS, etc.)",
  certTypes: ["Stage 1 Audit","Stage 2 Certification Audit","Surveillance Audits","Recertification (Year 3)"],
  totalWeeks: 20, controlCount: 38, policyCount: 10,

  policies: [
    { id:"P-01", name:"AI Policy", mandatory:true, owner:"CDO/CAIO", type:"policy", description:"Board-approved top-level AI policy covering responsible AI principles, objectives, and governance." },
    { id:"P-02", name:"AI Governance Framework", mandatory:true, owner:"CDO/CAIO", type:"policy", description:"AI governance structure — AI Committee, CAIO role, Board oversight, and review cadence." },
    { id:"P-03", name:"AI Risk Management Policy", mandatory:true, owner:"CRO", type:"policy", description:"AI-specific risk assessment methodology — bias, fairness, explainability, hallucination, security." },
    { id:"P-04", name:"Responsible AI Policy", mandatory:true, owner:"CDO/CAIO", type:"policy", description:"Ethical AI principles — fairness, transparency, accountability, human oversight, non-maleficence." },
    { id:"P-05", name:"AI Data Governance Policy", mandatory:true, owner:"CDO", type:"policy", description:"Training data quality, provenance, bias assessment, and lineage requirements." },
    { id:"P-06", name:"AI Model Lifecycle Policy", mandatory:true, owner:"CDO/CTO", type:"policy", description:"Model development, validation, deployment, monitoring, deprecation, and audit requirements." },
    { id:"P-07", name:"AI Vendor & Third-Party Policy", mandatory:true, owner:"CISO/Procurement", type:"policy", description:"Due diligence for AI vendors (OpenAI, Anthropic, Google, Azure, AWS, Mistral, etc.)." },
    { id:"P-08", name:"AI Security Policy", mandatory:true, owner:"CISO", type:"policy", description:"Adversarial robustness, prompt injection prevention, model theft, data poisoning controls." },
    { id:"P-09", name:"AI Incident Response Policy", mandatory:true, owner:"CAIO", type:"policy", description:"AI-specific incidents — model failures, bias incidents, hallucination events, privacy breaches." },
    { id:"P-10", name:"Human Oversight Policy", mandatory:true, owner:"CAIO", type:"policy", description:"Human-in-the-loop requirements, override mechanisms, and decision audit trails for AI systems." },
  ],

  procedures: [
    { id:"SOP-01", name:"AI Use Case Request & Approval SOP", category:"AI Governance", description:"End-to-end process for requesting, assessing, and approving new AI use cases.", steps:["Business owner submits AI Use Case Request Form","AI Committee reviews use case for strategic fit and risk","AI Risk Assessment conducted — bias, fairness, explainability, security, privacy","AI Impact Assessment completed for high-risk use cases","CAIO/CDO decision: Approve / Approve with conditions / Reject","Approved use cases added to AI Inventory","Post-deployment review at 30, 90, and 180 days"] },
    { id:"SOP-02", name:"AI Model Validation SOP", category:"AI Model Lifecycle", description:"Pre-deployment validation process for all AI models.", steps:["Define model success criteria and risk thresholds before training","Evaluate model on validation dataset — accuracy, precision, recall, F1","Bias testing — assess performance across demographic subgroups","Explainability check — generate SHAP/LIME explanations for high-risk decisions","Adversarial testing — red team the model for prompt injection and evasion","Security scan — check training data for poisoning","Document validation results; obtain CAIO sign-off before production deployment"] },
    { id:"SOP-03", name:"AI Model Monitoring SOP", category:"AI Operations", description:"Continuous monitoring of deployed AI models for drift, bias, and anomalies.", steps:["Configure monitoring dashboards for all production AI models","Daily check: data drift, concept drift, and model performance degradation","Weekly: bias metric review across all monitored subgroups","Monthly: full model performance report to AI Committee","Alert thresholds defined — trigger review if accuracy drops >5% or bias score increases","On alert: convene model review; decide retrain / rollback / retire","Quarterly: comprehensive model review including new validation dataset"] },
    { id:"SOP-04", name:"AI Vendor Assessment SOP", category:"AI Vendor Risk", description:"Security and ethics due diligence for all AI model and platform vendors.", steps:["Identify all third-party AI models and APIs in use (OpenAI, Anthropic, Google, Azure, etc.)","Complete AI vendor security questionnaire","Review vendor AI policies — responsible AI, data usage, model training practices","Assess data residency — is customer/sensitive data sent to vendor?","Review vendor SOC 2/ISO 27001/AI policy documentation","Document assessment in AI Vendor Register","Annual re-assessment; flag material changes"] },
  ],

  registers: ["AI Inventory","AI Risk Register","AI Incident Register","AI Vendor Register","Training Data Register","Model Validation Register","AI Use Case Approval Register"],

  phases: [
    { phase:1, title:"AI Governance Establishment", icon:"🤖", weeks:"Weeks 1–4",
      description:"Establish AI governance framework, appoint CAIO, build AI Inventory, and define AIMS scope.",
      tasks:[
        { task:"Define AIMS scope — which AI systems and use cases are in scope" },
        { task:"Appoint Chief AI Officer (CAIO) or equivalent AI governance lead" },
        { task:"Constitute AI Governance Committee with cross-functional representation" },
        { task:"Build comprehensive AI Inventory — all AI models, LLMs, training data, vendors", automation:"Auto-discover AI API calls from code repositories and network traffic" },
        { task:"Classify each AI system by risk level (minimal / limited / high / unacceptable)" },
        { task:"Develop AI Policy and have it Board-approved" },
      ],
      deliverables:["AIMS Scope Statement","AI Inventory","CAIO Appointment","AI Governance Committee Charter","AI Policy"] },
    { phase:2, title:"AI Risk Assessment Framework", icon:"⚠️", weeks:"Weeks 3–7",
      description:"Develop and execute AI-specific risk assessment methodology across all in-scope systems.",
      tasks:[
        { task:"Develop AI Risk Assessment methodology (bias, fairness, explainability, security, privacy)" },
        { task:"Complete risk assessment for all high-risk AI systems" },
        { task:"Conduct bias and fairness assessment on all customer-facing AI models" },
        { task:"Assess explainability requirements for all decision-making AI" },
        { task:"Evaluate adversarial robustness — prompt injection, model inversion, data poisoning" },
        { task:"Develop AI Risk Register with treatment plans" },
      ],
      deliverables:["AI Risk Assessment Methodology","AI Risk Register","Bias Assessment Reports","Adversarial Testing Results"] },
    { phase:3, title:"Policy, Procedure & Control Implementation", icon:"📝", weeks:"Weeks 5–12",
      description:"Develop all AI governance policies, procedures, and operational controls.",
      tasks:[
        { task:"Develop all 10 required AI policies" },
        { task:"Create AI Use Case Request and Approval workflow" },
        { task:"Implement AI model validation procedures" },
        { task:"Set up AI monitoring dashboards for all production models", automation:"Auto-monitor model drift, accuracy, and bias metrics" },
        { task:"Implement AI incident response procedures" },
        { task:"Deploy prompt injection and LLM security controls" },
        { task:"Train all AI developers and users on responsible AI" },
      ],
      deliverables:["AI Policy Pack","AI Use Case Workflow","Model Validation Framework","AI Monitoring Dashboard","Training Records"] },
    { phase:4, title:"AI Vendor Due Diligence", icon:"🤝", weeks:"Weeks 8–14",
      description:"Assess all third-party AI vendors and LLM providers for security and ethics.",
      tasks:[
        { task:"Inventory all AI API vendors (OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock, etc.)" },
        { task:"Complete vendor assessment for each AI provider" },
        { task:"Review data usage policies — does vendor train on our data?" },
        { task:"Assess data residency and cross-border transfer implications" },
        { task:"Review vendor responsible AI/ethics frameworks" },
        { task:"Include AI-specific clauses in vendor contracts (data usage, model updates, audit rights)" },
      ],
      deliverables:["AI Vendor Register","Vendor Assessment Reports","Contract AI Clauses","Data Residency Assessment"] },
    { phase:5, title:"Internal Audit & Continuous Monitoring", icon:"🔎", weeks:"Weeks 15–18",
      description:"Internal AIMS audit and establishment of ongoing AI monitoring capabilities.",
      tasks:[
        { task:"Conduct internal AIMS audit against ISO 42001 requirements" },
        { task:"Review AI Inventory completeness and accuracy" },
        { task:"Test model monitoring alert thresholds" },
        { task:"Conduct tabletop AI incident exercise" },
        { task:"Document non-conformities and develop CAPA plans" },
      ],
      deliverables:["Internal Audit Report","CAPA Tracker","AI Monitoring Runbook","AI Incident Exercise Report"] },
    { phase:6, title:"Certification Audit", icon:"🏆", weeks:"Weeks 18–20",
      description:"Stage 1 (documentation) and Stage 2 (on-site) certification audit by accredited body.",
      tasks:[
        { task:"Prepare certification audit documentation pack" },
        { task:"Host Stage 1 audit — documentation review" },
        { task:"Address Stage 1 findings" },
        { task:"Host Stage 2 audit — operational effectiveness assessment" },
        { task:"Respond to Stage 2 findings" },
      ],
      deliverables:["Stage 1 Audit Response","Stage 2 Evidence Pack","ISO 42001 Certificate"] },
  ],

  auditChecklist: [
    { domain:"AI Governance", icon:"🤖", items:[
      { item:"CAIO or equivalent AI governance lead appointed with clear authority", required:true, evidence:"CAIO appointment letter and org chart" },
      { item:"AI Governance Committee constituted and meeting regularly", required:true, evidence:"Committee charter and meeting minutes" },
      { item:"Board-approved AI Policy published and communicated", required:true, evidence:"AI Policy with Board approval signature" },
      { item:"AIMS scope defined and documented", required:true, evidence:"AIMS scope statement" },
      { item:"Comprehensive AI Inventory maintained and current", required:true, evidence:"AI Inventory with model details, vendors, use cases" },
    ]},
    { domain:"AI Risk Management", icon:"⚠️", items:[
      { item:"AI Risk Assessment conducted for all high-risk AI systems", required:true, evidence:"Completed AI Risk Assessments per model" },
      { item:"Bias and fairness assessment completed for customer-facing AI", required:true, evidence:"Bias testing reports with demographic breakdown" },
      { item:"Adversarial robustness testing conducted", required:true, evidence:"Red team / adversarial testing results" },
      { item:"AI Risk Register maintained with treatment plans", required:true, evidence:"AI Risk Register with owner and status" },
    ]},
    { domain:"AI Lifecycle Controls", icon:"⚙️", items:[
      { item:"Model validation procedure followed before production deployment", required:true, evidence:"Validation reports for all production models" },
      { item:"Production AI models continuously monitored for drift and bias", required:true, evidence:"Monitoring dashboard; alert configuration" },
      { item:"AI use cases go through formal approval process", required:true, evidence:"Approval register with AI Committee sign-off" },
      { item:"Human override mechanisms implemented for high-risk AI decisions", required:true, evidence:"Technical documentation; override log" },
    ]},
    { domain:"AI Vendor & Data", icon:"🤝", items:[
      { item:"All AI vendors assessed and registered", required:true, evidence:"AI Vendor Register with assessment dates" },
      { item:"Training data quality and bias assessed before use", required:true, evidence:"Data quality report; bias assessment" },
      { item:"AI vendor contracts include responsible AI and data usage clauses", required:true, evidence:"Contract review checklist" },
    ]},
  ],

  evidenceRequirements: [
    { control:"AI Inventory & Governance", evidenceType:"AI Inventory & Committee Records", examples:["AI Inventory spreadsheet/tool with all models","AI Governance Committee meeting minutes","AI use case approval log"], frequency:"Quarterly update" },
    { control:"Bias & Fairness", evidenceType:"Bias Testing Reports", examples:["Bias assessment reports per model","Demographic subgroup performance metrics","Model card with fairness criteria"], frequency:"Per model deployment; annual re-assessment" },
    { control:"AI Model Monitoring", evidenceType:"Monitoring Dashboards & Reports", examples:["Model drift dashboards","Accuracy degradation alerts","Monthly model performance reports"], frequency:"Monthly" },
    { control:"AI Vendor Assessment", evidenceType:"Vendor Assessment Records", examples:["Completed vendor questionnaires","Data usage policy review","Contract AI clauses"], frequency:"Annual" },
  ],

  gapQuestionnaire: [
    { section:"AI Governance", questions:[
      { id:"G1", question:"Has a Chief AI Officer (CAIO) or AI governance lead been formally appointed?", domain:"Governance", weight:9 },
      { id:"G2", question:"Is a comprehensive AI Inventory maintained covering all AI models and vendors?", domain:"Governance", weight:10 },
      { id:"G3", question:"Is there a formal AI use case approval process before deployment?", domain:"Governance", weight:9 },
    ]},
    { section:"AI Risk & Ethics", questions:[
      { id:"R1", question:"Has bias and fairness assessment been conducted for all customer-facing AI?", domain:"Risk", weight:10 },
      { id:"R2", question:"Has adversarial robustness testing (prompt injection, etc.) been conducted?", domain:"Risk", weight:9 },
      { id:"R3", question:"Are human-in-the-loop controls implemented for high-risk AI decisions?", domain:"Risk", weight:9 },
    ]},
    { section:"AI Operations", questions:[
      { id:"O1", question:"Are production AI models continuously monitored for drift, bias, and anomalies?", domain:"Operations", weight:9 },
      { id:"O2", question:"Is there a documented AI incident response procedure?", domain:"Incident", weight:8 },
    ]},
    { section:"AI Vendors", questions:[
      { id:"V1", question:"Have all AI API vendors been assessed for security and responsible AI practices?", domain:"Vendor", weight:9 },
      { id:"V2", question:"Do vendor contracts prohibit training on customer data without explicit consent?", domain:"Vendor", weight:10 },
    ]},
  ],

  raciMatrix: [
    { activity:"AI Inventory Maintenance", responsible:"AI/Engineering Team", accountable:"CAIO", consulted:"CISO, CTO", informed:"Board" },
    { activity:"AI Use Case Approval", responsible:"CAIO/AI Committee", accountable:"CDO/CEO", consulted:"Legal, CISO, Business", informed:"Stakeholders" },
    { activity:"Bias & Fairness Assessment", responsible:"AI/Data Science Team", accountable:"CAIO", consulted:"Legal, HR, Business", informed:"Regulators (if required)" },
    { activity:"AI Vendor Assessment", responsible:"Procurement/Security", accountable:"CAIO", consulted:"Legal, CTO, CISO", informed:"Senior Management" },
    { activity:"AI Incident Response", responsible:"CAIO/AI Team", accountable:"CDO/CEO", consulted:"Legal, CISO, PR", informed:"Regulators, Board" },
    { activity:"Model Monitoring", responsible:"MLOps/AI Team", accountable:"CAIO", consulted:"Business Owners", informed:"Senior Management" },
  ],

  timeline: [
    { week:"W1-4",  label:"AI Governance Setup",      milestones:["CAIO appointed","AI Committee constituted","AI Inventory v1 complete","AI Policy approved"],            phase:"Phase 1" },
    { week:"W3-7",  label:"AI Risk Assessment",        milestones:["Risk methodology approved","High-risk models assessed","Bias testing complete","AI Risk Register live"], phase:"Phase 2" },
    { week:"W5-12", label:"Policy & Control Impl",    milestones:["All 10 policies approved","Approval workflow live","Model monitoring dashboards live"],                  phase:"Phase 3" },
    { week:"W8-14", label:"Vendor Due Diligence",     milestones:["All AI vendors assessed","Contracts updated","Data residency confirmed"],                               phase:"Phase 4" },
    { week:"W15-18",label:"Internal Audit",           milestones:["AIMS audit complete","CAPAs approved","Tabletop exercise done"],                                        phase:"Phase 5" },
    { week:"W18-20",label:"Certification",            milestones:["Stage 1 complete","Stage 2 complete","ISO 42001 certificate issued 🎉"],                                phase:"Phase 6" },
  ],

  automations: [
    { title:"Auto-Discover: AI Inventory", description:"Scan code repositories and API gateway logs to discover all AI/ML API calls and model usage.", source:"GitHub, GitLab, API Gateway", output:"Comprehensive AI Inventory with vendor, model, and usage data" },
    { title:"Auto-Monitor: Model Drift", description:"Continuous monitoring of production model performance metrics; alert on accuracy or fairness degradation.", source:"MLflow, Seldon, SageMaker Monitor", output:"Model drift alerts; monthly performance reports" },
    { title:"Auto-Monitor: Bias Metrics", description:"Scheduled bias evaluation across all deployed models using fairness metrics (demographic parity, equalized odds).", source:"Model inference logs, Fairlearn, AI Fairness 360", output:"Bias metric trends; alert on threshold breaches" },
    { title:"Auto-Detect: Prompt Leakage", description:"Monitor LLM API responses for prompt injection attempts and system prompt leakage.", source:"LLM API gateway", output:"Real-time alert on potential prompt injection events" },
    { title:"AI Risk Dashboard", description:"Real-time AIMS compliance dashboard with AI Inventory status, model health, and risk register.", source:"All AIMS data sources", output:"AIMS compliance posture for CAIO and Board reporting" },
  ],

  certificationStages: [
    { stage:1, title:"AIMS Readiness Assessment", duration:"2 weeks", description:"Pre-certification gap assessment against all ISO 42001 requirements.", criteria:["AI Inventory complete","AI Policy approved","Risk assessments done","Key controls operational"] },
    { stage:2, title:"Stage 1 — Documentation Review", duration:"1–2 days", description:"Certifier reviews AIMS documentation including AI Inventory, policies, risk assessments.", criteria:["AI Inventory","AI Policy","AIMS Scope","Risk Register","Governance Charter"] },
    { stage:3, title:"Stage 2 — Operational Assessment", duration:"2–3 days", description:"On-site assessment of AIMS operational effectiveness — model monitoring, governance, bias controls.", criteria:["Monitoring dashboards operational","Approval workflow active","Bias assessments documented","Vendor assessments complete"] },
    { stage:4, title:"Certificate Issuance", duration:"2–4 weeks post-audit", description:"ISO 42001 certificate issued — first-mover advantage in AI governance certification.", criteria:["Major non-conformities closed","Certificate application submitted"] },
  ],

  documents: [
    { name:"AI Charter", type:"charter", description:"Board-approved charter establishing AI governance authority and objectives.", required:true },
    { name:"AI Inventory Template", type:"register", description:"Comprehensive template for logging all AI models, LLMs, training data, and vendors.", required:true },
    { name:"AI Impact Assessment Template", type:"assessment", description:"Structured template for assessing the impact of AI systems on stakeholders and society.", required:true },
    { name:"AI Use Case Request Form", type:"form", description:"Standardised form for business owners to request new AI use cases.", required:true },
    { name:"AI Risk Assessment Template", type:"assessment", description:"Template covering bias, fairness, explainability, security, and privacy risk dimensions.", required:true },
    { name:"AI Vendor Assessment Questionnaire", type:"form", description:"Security and ethics questionnaire for AI model vendors and platform providers.", required:true },
    { name:"Model Card Template", type:"report", description:"Standard model documentation template covering intended use, training data, performance, and limitations.", required:false },
    { name:"AI Incident Report Form", type:"form", description:"Form for reporting AI-specific incidents — hallucinations, bias events, model failures.", required:true },
    { name:"Bias Testing Report Template", type:"report", description:"Structured report template for documenting bias testing methodology and results.", required:false },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────
export const COMPLIANCE_PACKS: CompliancePack[] = [ISO27001, SOC2, RBI, SEBI, ISO42001];

export function getCompliancePack(id: string): CompliancePack | undefined {
  return COMPLIANCE_PACKS.find(p => p.id === id);
}

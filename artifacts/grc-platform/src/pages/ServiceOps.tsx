// @ts-nocheck
import { useState, useEffect } from "react";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { Drawer, Field, DrawerSection, AiInsightBox } from "@/components/Drawer";
import { useOrg } from "@/context/OrgContext";
import { useTickets } from "@/hooks/useGrcApi";
import { getStoredToken } from "@/lib/auth-utils";
import { ReactFlow, Background, Controls, MiniMap, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const C = {
  bg:  "var(--card)", bg2: "var(--input)",
  border: "var(--border)", text: "var(--foreground)",
  accent: "rgb(147,197,253)", muted: "var(--muted-foreground)",
  green: "#34D399", warn: "#FBBF24", danger: "#F87171",
  purple: "#A78BFA", teal: "#2DD4BF",
};
const card: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)" };

// ── Incident data ─────────────────────────────────────────────────────────────
const incidents: any[] = [];

// ── Playbooks data ────────────────────────────────────────────────────────────
const incidentPlaybooks = [
  { id:"PB-001", name:"Ransomware Response Playbook",             priority:"P1 - Critical", steps:9, type:"Malware",
    description:"Step-by-step playbook for responding to ransomware and crypto-locker incidents. Based on NIST SP 800-61r2 and ISO 27035.",
    trigger:"P1 - Critical",
    steps:[
      { n:1, phase:"Detection",    owner:"SOC Analyst",   sla:"5 min",   desc:"Verify alert from EDR/SIEM. Confirm ransomware IOCs." },
      { n:2, phase:"Containment",  owner:"SOC Lead",      sla:"10 min",  desc:"Immediately isolate affected host(s) from network at switch level." },
      { n:3, phase:"Containment",  owner:"IAM Team",      sla:"15 min",  desc:"Disable compromised user accounts. Rotate affected credentials." },
      { n:4, phase:"Assessment",   owner:"IR Lead",       sla:"30 min",  desc:"Determine blast radius — identify other potentially affected systems." },
      { n:5, phase:"Eradication",  owner:"DFIR Team",     sla:"1 hour",  desc:"Acquire memory dump and forensic image of affected system(s)." },
      { n:6, phase:"Eradication",  owner:"DFIR Team",     sla:"4 hours", desc:"Identify patient zero and infection vector via DFIR analysis." },
      { n:7, phase:"Recovery",     owner:"IT Ops",        sla:"24 hours",desc:"Restore from verified clean backup after full IOC sweep." },
      { n:8, phase:"Post-Incident",owner:"CISO",          sla:"48 hours",desc:"Executive briefing. Determine regulatory notification requirements." },
      { n:9, phase:"Post-Incident",owner:"IR Lead",       sla:"7 days",  desc:"Lessons learned document. Update playbook and detection rules." },
    ],
  },
  { id:"PB-002", name:"Data Breach Response Playbook",            priority:"P1 - Critical / P2 - High", steps:7, type:"Data Breach",
    description:"Structured response playbook for confirmed or suspected data breaches involving personal or sensitive data. Covers regulatory notification timelines.",
    trigger:"P1 - Critical / P2 - High",
    steps:[
      { n:1, phase:"Detection",    owner:"SOC Analyst",   sla:"15 min",  desc:"Confirm data exfiltration — validate via DLP, SIEM, or CloudTrail." },
      { n:2, phase:"Containment",  owner:"Cloud Security",sla:"30 min",  desc:"Revoke access, block exfil path, preserve evidence before remediation." },
      { n:3, phase:"Assessment",   owner:"DPO",           sla:"1 hour",  desc:"Classify data types affected. Determine regulatory notification obligation." },
      { n:4, phase:"Notification", owner:"Legal & DPO",   sla:"4 hours", desc:"Notify supervisory authority if GDPR/PDPB/PDPA threshold met. Prepare subject notification." },
      { n:5, phase:"Eradication",  owner:"IR Lead",       sla:"24 hours",desc:"Remove access vector. Confirm no further exfiltration." },
      { n:6, phase:"Recovery",     owner:"IT Ops",        sla:"48 hours",desc:"Restore affected systems. Validate data integrity." },
      { n:7, phase:"Post-Incident",owner:"CISO",          sla:"30 days", desc:"Full post-incident report. Control improvement actions tracked to closure." },
    ],
  },
  { id:"PB-003", name:"DDoS Attack Response Playbook",            priority:"P2 - High", steps:6, type:"DDoS",
    description:"Response playbook for volumetric, protocol, and application-layer DDoS attacks. Covers WAF, CDN scrubbing, and ISP-level mitigation.",
    trigger:"P2 - High",
    steps:[
      { n:1, phase:"Detection",    owner:"SOC Analyst",   sla:"5 min",   desc:"Confirm DDoS attack via WAF/flow telemetry. Classify: volumetric / protocol / app-layer." },
      { n:2, phase:"Containment",  owner:"Network Ops",   sla:"10 min",  desc:"Enable CDN scrubbing. Apply rate limiting. Activate upstream ISP null-routing if needed." },
      { n:3, phase:"Assessment",   owner:"IR Lead",       sla:"20 min",  desc:"Determine attack source. Check threat intel for known DDoS-for-hire campaigns." },
      { n:4, phase:"Mitigation",   owner:"Network Ops",   sla:"30 min",  desc:"Tune WAF rules. Deploy geo-blocking if attack concentrated to specific regions." },
      { n:5, phase:"Recovery",     owner:"IT Ops",        sla:"1 hour",  desc:"Confirm service restored. Remove emergency rules that may affect legitimate traffic." },
      { n:6, phase:"Post-Incident",owner:"CISO",          sla:"24 hours",desc:"Capacity review. Update DDoS response runbook with new attack signatures." },
    ],
  },
  { id:"PB-004", name:"Phishing Response Playbook",               priority:"P3 - Medium", steps:5, type:"Phishing",
    description:"Response playbook for phishing, spear-phishing, and business email compromise incidents.",
    trigger:"P3 - Medium",
    steps:[
      { n:1, phase:"Detection",    owner:"SOC Analyst",   sla:"15 min",  desc:"Confirm phishing email — analyze headers, URLs, attachments. Check VirusTotal." },
      { n:2, phase:"Containment",  owner:"Email Security",sla:"30 min",  desc:"Block sender, quarantine similar emails, issue phishing alert to all staff." },
      { n:3, phase:"Assessment",   owner:"IR Lead",       sla:"1 hour",  desc:"Identify users who clicked/opened. Check for credential entry on phishing site." },
      { n:4, phase:"Eradication",  owner:"IAM Team",      sla:"2 hours", desc:"Reset credentials for impacted users. Enable MFA step-up. Revoke active sessions." },
      { n:5, phase:"Post-Incident",owner:"Security Awareness", sla:"7 days", desc:"Targeted security awareness training for affected users. Update email gateway rules." },
    ],
  },
  { id:"PB-005", name:"Service Disruption Playbook",              priority:"P2 - High / P3 - Medium", steps:5, type:"Service Disruption",
    description:"Response playbook for major service outages and degradation events affecting business operations.",
    trigger:"P2 - High / P3 - Medium",
    steps:[
      { n:1, phase:"Detection",    owner:"Monitoring",    sla:"5 min",   desc:"Confirm outage via monitoring. Classify P1/P2/P3. Notify on-call engineer." },
      { n:2, phase:"Containment",  owner:"IT Ops",        sla:"15 min",  desc:"Activate incident bridge. Engage service owners. Check for related changes." },
      { n:3, phase:"Assessment",   owner:"IR Lead",       sla:"30 min",  desc:"Root cause hypothesis. Blast radius assessment. Customer impact determination." },
      { n:4, phase:"Recovery",     owner:"IT Ops",        sla:"2 hours", desc:"Apply fix or rollback. Confirm service restoration via synthetic monitoring." },
      { n:5, phase:"Post-Incident",owner:"CISO",          sla:"48 hours",desc:"Post-incident review. Update runbooks and monitoring thresholds." },
    ],
  },
  { id:"PB-006", name:"Insider Threat Response Playbook",         priority:"P2 - High", steps:6, type:"Insider Threat",
    description:"Response playbook for confirmed or suspected insider threat incidents including data theft, sabotage, and policy violations.",
    trigger:"P2 - High",
    steps:[
      { n:1, phase:"Detection",    owner:"DLP/SIEM",      sla:"15 min",  desc:"Confirm insider activity via DLP alert, UEBA anomaly, or manager report." },
      { n:2, phase:"Containment",  owner:"IAM Team",      sla:"30 min",  desc:"Revoke system access. Preserve evidence — do NOT alert the insider." },
      { n:3, phase:"Assessment",   owner:"HR & Legal",    sla:"2 hours", desc:"Coordinate with HR and Legal. Determine employment and legal implications." },
      { n:4, phase:"Evidence",     owner:"DFIR Team",     sla:"24 hours",desc:"Forensic imaging of all accessed devices and systems. Chain of custody maintained." },
      { n:5, phase:"Notification", owner:"Legal",         sla:"48 hours",desc:"Regulatory notification assessment. Law enforcement referral if criminal activity suspected." },
      { n:6, phase:"Post-Incident",owner:"CISO",          sla:"30 days", desc:"Access control review. De-provisioning process improvement. HR policy update." },
    ],
  },
  { id:"PB-007", name:"Supply Chain Attack Response Playbook",    priority:"P1 - Critical / P2 - High", steps:5, type:"Supply Chain",
    description:"Response playbook for supply chain compromise incidents including malicious software updates and vendor breaches.",
    trigger:"P1 - Critical / P2 - High",
    steps:[
      { n:1, phase:"Detection",    owner:"Threat Intel",  sla:"30 min",  desc:"Confirm affected vendor/version. Cross-reference SBOM for exposure." },
      { n:2, phase:"Containment",  owner:"IT Ops",        sla:"1 hour",  desc:"Isolate affected systems. Block malicious update server/repository." },
      { n:3, phase:"Assessment",   owner:"DFIR Team",     sla:"4 hours", desc:"Forensic analysis of affected systems. Determine if payload executed." },
      { n:4, phase:"Eradication",  owner:"IR Lead",       sla:"24 hours",desc:"Remove malicious components. Deploy clean vendor-verified build." },
      { n:5, phase:"Post-Incident",owner:"CISO",          sla:"7 days",  desc:"SBOM remediation. Vendor security assessment. Multi-reg notification assessment." },
    ],
  },
  { id:"PB-008", name:"Unauthorized Access Response Playbook",    priority:"P1 - Critical / P2 - High", steps:5, type:"Unauthorized Access",
    description:"Response playbook for unauthorized access to systems, accounts, and data including brute force, credential theft, and privilege escalation.",
    trigger:"P1 - Critical / P2 - High",
    steps:[
      { n:1, phase:"Detection",    owner:"SOC Analyst",   sla:"10 min",  desc:"Confirm unauthorized access — validate IOCs against SIEM alerts." },
      { n:2, phase:"Containment",  owner:"IAM Team",      sla:"15 min",  desc:"Suspend affected accounts. Terminate active sessions. Enable conditional access." },
      { n:3, phase:"Assessment",   owner:"IR Lead",       sla:"1 hour",  desc:"Determine access scope — what data/systems were accessed. Lateral movement check." },
      { n:4, phase:"Eradication",  owner:"IR Lead",       sla:"4 hours", desc:"Remove persistence mechanisms. Rotate all potentially compromised credentials." },
      { n:5, phase:"Post-Incident",owner:"CISO",          sla:"48 hours",desc:"MFA gap analysis. Privileged access management review. Notification assessment." },
    ],
  },
];

// ── Regional templates data ───────────────────────────────────────────────────
const regionalTemplates = [
  {
    id:"RT-001", region:"KSA", regionFlag:"🇸🇦",
    name:"KSA — SAMA & NCA Incident Response Template",
    description:"Incident response template aligned with Saudi Arabia's SAMA Cyber Security Framework and NCA Essential Cybersecurity Controls (ECC). Covers mandatory reporting to NCA-CSCC.",
    frameworks:["SAMA CSF","NCA ECC","NCA CSCC","PDPL KSA"],
    languages:"Arabic / English",
    notifications:[
      { authority:"NCA-CSCC (National Cybersecurity Authority)", deadline:"12h", deadlineColor:"#F87171", type:"Cyber Incident",
        email:"cscc@nca.gov.sa", portal:true, followUp:"72 hours — full incident report",
        requiredFields:["incident_type","affected_systems","impact_scope","initial_response_taken"] },
      { authority:"SAMA (Financial Sector Only)", deadline:"12h", deadlineColor:"#F87171", type:"Financial Sector",
        email:"cybersecurity@sama.gov.sa", portal:true, followUp:"30 days — root cause and lessons learned",
        requiredFields:["incident_type","financial_impact","customer_impact","systems_affected"] },
      { authority:"PDPL DPA (Personal Data)", deadline:"72h", deadlineColor:"#FBBF24", type:"Data Breach",
        email:"pdpl@ndmo.gov.sa", portal:false, followUp:"Per NDMO guidance",
        requiredFields:["data_subjects_count","data_categories","breach_nature"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"12 hours" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"12 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"72 hours" },
    ],
    requiredActions:[
      "Activate incident response team within 15 minutes",
      "Isolate affected systems from SCADA/OT networks if applicable",
      "Notify NCA-CSCC within 12 hours (CSCC Article 3-5-1)",
      "Preserve all forensic evidence (chain of custody)",
      "Conduct Arabic-language stakeholder briefings for executive team",
      "PDPL assessment — determine if personal data of KSA residents affected",
      "Coordinate with CERT-SA for technical assistance if needed",
      "Submit post-incident report within 72 hours",
    ],
    keyContacts:[
      { label:"NCA CSCC Hotline",   value:"920033432" },
      { label:"CERT-SA",            value:"cert@cert.gov.sa" },
      { label:"SAMA Supervisory",   value:"+966-11-462-2300" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any confirmed incident",        notify:"CISO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"P1 or P2 incident",             notify:"CEO, Board Risk Committee, NCA-CSCC" },
      { level:"L3", color:"#F87171",          trigger:"Critical infrastructure impact", notify:"Regulatory Authorities, Ministry of Communications" },
    ],
  },
  {
    id:"RT-002", region:"India", regionFlag:"🇮🇳",
    name:"India — CERT-In Incident Response Template",
    description:"Incident response template aligned with CERT-In Directions 2022. Mandatory 6-hour reporting requirement for all cybersecurity incidents. Covers IT Act 2000, PDPB, and RBI guidelines.",
    frameworks:["CERT-In Directions 2022","IT Act 2000","PDPB India","RBI Cybersecurity Framework"],
    languages:"English / Hindi",
    notifications:[
      { authority:"CERT-In (Indian Computer Emergency Response Team)", deadline:"6h", deadlineColor:"#F87171", type:"Cyber Incident",
        email:"incident@cert-in.org.in", phone:"1800-11-4949", portal:true, followUp:"30 days — detailed incident analysis",
        requiredFields:["incident_type","date_time","impact_assessment","affected_systems","actions_taken"] },
      { authority:"RBI (Financial Sector)", deadline:"2h", deadlineColor:"#F87171", type:"Financial Sector",
        email:"co.dpss@rbi.org.in", portal:false, followUp:"Per RBI guidance",
        requiredFields:["incident_type","payment_systems_affected","financial_impact"] },
      { authority:"SEBI (Capital Markets)", deadline:"6h", deadlineColor:"#F87171", type:"Capital Markets",
        email:"sebi@sebi.gov.in", portal:false, followUp:"72 hours",
        requiredFields:["incident_type","market_impact","systems_affected"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"6 hours" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"6 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"6 hours" },
    ],
    requiredActions:[
      "Report to CERT-In within 6 hours — MANDATORY (non-compliance: criminal liability)",
      "Preserve system logs for minimum 180 days (CERT-In Directions)",
      "Maintain synchronised ICT system clocks with NTP (mandatory requirement)",
      "Designate a Point of Contact (PoC) for CERT-In coordination",
      "Conduct forensic investigation and preserve chain of evidence",
      "Assess PDPB notification obligations for personal data incidents",
      "Notify RBI within 2 hours if payment infrastructure affected",
      "Submit 30-day post-incident detailed report to CERT-In",
    ],
    keyContacts:[
      { label:"CERT-In Helpdesk",            value:"1800-11-4949" },
      { label:"CERT-In Email",               value:"incident@cert-in.org.in" },
      { label:"NCIIPC (Critical Infra)",     value:"info@nciipc.gov.in" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any cyber incident",                          notify:"CERT-In PoC, CISO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"P1 incident or data breach",                  notify:"CEO, Board, CERT-In, Legal" },
      { level:"L3", color:"#F87171",          trigger:"Critical infrastructure or financial system impact", notify:"RBI, SEBI, NCIIPC" },
    ],
  },
  {
    id:"RT-003", region:"Malaysia", regionFlag:"🇲🇾",
    name:"Malaysia — CyberSecurity Malaysia Incident Response Template",
    description:"Incident response template aligned with CyberSecurity Malaysia guidelines, PDPA Malaysia, and Bank Negara Malaysia (BNM) RMIT framework.",
    frameworks:["PDPA Malaysia 2010","CyberSecurity Malaysia","BNM RMIT","MCMC Act"],
    languages:"Bahasa Malaysia / English",
    notifications:[
      { authority:"CyberSecurity Malaysia (MyCERT)", deadline:"72h", deadlineColor:"#FBBF24", type:"Cyber Incident",
        email:"mycert@cybersecurity.my", portal:true, followUp:"30 days — full incident report",
        requiredFields:["incident_type","systems_affected","impact_assessment","actions_taken"] },
      { authority:"PDPA Commissioner (Personal Data)", deadline:"72h", deadlineColor:"#FBBF24", type:"Data Breach",
        email:"aduan@pdp.gov.my", portal:false, followUp:"Per PDPA guidelines",
        requiredFields:["data_subjects_count","data_categories","breach_nature","measures_taken"] },
      { authority:"Bank Negara Malaysia (Financial Sector)", deadline:"2h", deadlineColor:"#F87171", type:"Financial Sector",
        email:"telelink@bnm.gov.my", portal:false, followUp:"14 days — root cause report",
        requiredFields:["incident_type","financial_impact","payment_systems_affected"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"8 hours" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"24 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"72 hours" },
    ],
    requiredActions:[
      "Notify MyCERT within 72 hours (CyberSecurity Malaysia guidelines)",
      "Isolate affected systems and preserve forensic evidence",
      "Assess PDPA 2010 notification obligations for personal data incidents",
      "Notify Bank Negara Malaysia within 2 hours if financial services affected",
      "Document incident timeline in Bahasa Malaysia for regulatory submissions",
      "Engage NACSA for critical national information infrastructure incidents",
      "Conduct post-incident review and remediation within 30 days",
      "Submit final incident report to MyCERT and relevant authorities",
    ],
    keyContacts:[
      { label:"MyCERT Hotline",    value:"+603-8992-6969" },
      { label:"BNM Contact",       value:"telelink@bnm.gov.my" },
      { label:"NACSA",             value:"info@nacsa.gov.my" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any cyber incident",            notify:"MyCERT PoC, CISO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"P1 incident or personal data breach", notify:"CEO, Board, BNM, Legal" },
      { level:"L3", color:"#F87171",          trigger:"Critical national infrastructure",     notify:"NACSA, Ministry of Communications" },
    ],
  },
  {
    id:"RT-004", region:"Kenya", regionFlag:"🇰🇪",
    name:"Kenya — Communications Authority Incident Response Template",
    description:"Incident response template aligned with Kenya's Communications Authority (CA) Cybersecurity Regulations 2022 and Kenya Data Protection Act 2019.",
    frameworks:["CA Kenya Cybersecurity Regulations 2022","Kenya Data Protection Act 2019","CBK Guidance"],
    languages:"English / Swahili",
    notifications:[
      { authority:"Communications Authority Kenya (CA)", deadline:"72h", deadlineColor:"#FBBF24", type:"Cyber Incident",
        email:"cybersecurity@ca.go.ke", portal:true, followUp:"14 days — incident closure report",
        requiredFields:["incident_type","affected_systems","impact_assessment","actions_taken"] },
      { authority:"ODPC (Data Protection Commissioner)", deadline:"72h", deadlineColor:"#FBBF24", type:"Data Breach",
        email:"info@odpc.go.ke", portal:false, followUp:"Per DPC guidelines",
        requiredFields:["data_subjects_count","data_categories","breach_nature","risk_assessment"] },
      { authority:"CBK (Central Bank — Financial Sector)", deadline:"24h", deadlineColor:"#FBBF24", type:"Financial Sector",
        email:"info@centralbank.go.ke", portal:false, followUp:"30 days — root cause report",
        requiredFields:["incident_type","financial_impact","payment_systems_affected"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"24 hours" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"48 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"72 hours" },
    ],
    requiredActions:[
      "Notify Communications Authority within 72 hours (CA Cybersecurity Regulations 2022)",
      "Report personal data breaches to ODPC within 72 hours (Data Protection Act 2019)",
      "Preserve all digital evidence in accordance with Kenya Evidence Act",
      "Notify CBK within 24 hours if banking or payment systems are affected",
      "Engage KE-CIRT/CC for national-level incident coordination",
      "Document incident in both English and Swahili for local regulatory submissions",
      "Conduct post-incident forensic analysis and remediation within 30 days",
      "File final incident report with CA within 14 days of resolution",
    ],
    keyContacts:[
      { label:"CA Kenya",        value:"+254-20-499-0000" },
      { label:"KE-CIRT/CC",     value:"cirt@ke-cirt.go.ke" },
      { label:"ODPC",           value:"info@odpc.go.ke" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any confirmed cyber incident", notify:"CISO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"P1 or personal data breach",  notify:"CEO, Board, CA Kenya, Legal" },
      { level:"L3", color:"#F87171",          trigger:"Critical infrastructure impact", notify:"CA Kenya, ODPC, Central Bank" },
    ],
  },
  {
    id:"RT-005", region:"EU", regionFlag:"🇪🇺",
    name:"EU — NIS2 / GDPR Incident Response Template",
    description:"Incident response template for EU operations covering NIS2 Directive requirements for essential entities and GDPR Article 33/34 data breach notification obligations.",
    frameworks:["NIS2 Directive","GDPR","DORA (Financial)","ENISA Guidelines"],
    languages:"English (+ local language)",
    notifications:[
      { authority:"National Competent Authority (NIS2 — Early Warning)", deadline:"24h", deadlineColor:"#FBBF24", type:"Early Warning",
        email:"nis2-notify@enisa.europa.eu", portal:true, followUp:"72h — full incident notification",
        requiredFields:["incident_type","affected_services","initial_impact","cross_border_indicator"] },
      { authority:"National Competent Authority (NIS2 — Notification)", deadline:"72h", deadlineColor:"#FBBF24", type:"Incident Notification",
        email:"nis2-notify@enisa.europa.eu", portal:true, followUp:"1 month — final report",
        requiredFields:["incident_type","root_cause","duration","affected_users","cross_border_impact"] },
      { authority:"Supervisory Authority (GDPR Art. 33)", deadline:"72h", deadlineColor:"#FBBF24", type:"Data Breach",
        email:"Per national DPA", portal:true, followUp:"Per supervisory authority",
        requiredFields:["data_subjects_count","data_categories","likely_consequences","measures_taken"] },
      { authority:"Affected Data Subjects (GDPR Art. 34)", deadline:"ASAP", deadlineColor:"#F87171", type:"High-Risk Data Breach",
        email:"Direct communication", portal:false, followUp:"N/A — direct obligation",
        requiredFields:["breach_description","recommendations_to_subjects","dpo_contact"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"24 hours" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"72 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"30 days" },
    ],
    requiredActions:[
      "Submit NIS2 early warning to competent authority within 24 hours",
      "Notify GDPR supervisory authority within 72 hours of confirmed personal data breach",
      "Document incident using ENISA-compliant taxonomy and classification",
      "Assess cross-border impact — notify other EU member state authorities if applicable",
      "Conduct DPIA for high-risk processing impacts (GDPR Art. 35)",
      "Notify affected data subjects directly if high risk to rights and freedoms",
      "Engage CERT-EU and ENISA for critical infrastructure or systemic incidents",
      "Submit comprehensive NIS2 final report to competent authority within 1 month",
    ],
    keyContacts:[
      { label:"ENISA",    value:"info@enisa.europa.eu" },
      { label:"CERT-EU",  value:"cert-eu@ec.europa.eu" },
      { label:"EDPB",     value:"edpb@edpb.europa.eu" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any NIS2-significant incident", notify:"CISO, DPO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"GDPR breach or P1 incident",    notify:"CEO, Legal, National DPA, Board" },
      { level:"L3", color:"#F87171",          trigger:"Critical infrastructure impact", notify:"National Authority, ENISA, CERT-EU" },
    ],
  },
  {
    id:"RT-006", region:"Global", regionFlag:"🌐",
    name:"Global — ISO 27035 Incident Response Template",
    description:"Generic incident response template aligned with ISO/IEC 27035 information security incident management standard. Suitable for jurisdictions without specific mandatory regulatory requirements.",
    frameworks:["ISO/IEC 27035","ISO/IEC 27001","NIST SP 800-61r2"],
    languages:"English",
    notifications:[
      { authority:"Internal CISO / Management", deadline:"1h", deadlineColor:"#F87171", type:"P1-P2 Incidents",
        email:"ciso@acme.corp", portal:false, followUp:"4h — status update",
        requiredFields:["incident_type","severity_assessment","initial_impact","containment_status"] },
      { authority:"Board / Executive Committee", deadline:"4h", deadlineColor:"#FBBF24", type:"Critical Incidents",
        email:"board-ir@acme.corp", portal:false, followUp:"Daily updates until resolution",
        requiredFields:["business_impact","recovery_timeline","resource_requirements","reputational_risk"] },
      { authority:"Legal Counsel", deadline:"24h", deadlineColor:"#FBBF24", type:"Potential Breach",
        email:"legal@acme.corp", portal:false, followUp:"Per legal guidance",
        requiredFields:["potential_liability","affected_parties","breach_scope","jurisdiction"] },
    ],
    severitySLAs:[
      { level:"P1", color:"#F87171", response:"15 min", contain:"2 hours",  notify:"1 hour" },
      { level:"P2", color:"#FBBF24", response:"30 min", contain:"4 hours",  notify:"4 hours" },
      { level:"P3", color:"rgb(147,197,253)", response:"2 hours", contain:"24 hours", notify:"24 hours" },
    ],
    requiredActions:[
      "Activate incident response team per IRP within 15 minutes",
      "Classify incident according to ISO/IEC 27035 taxonomy",
      "Contain and begin eradication of the threat",
      "Notify internal stakeholders per escalation matrix",
      "Preserve and collect forensic evidence with chain of custody",
      "Assess regulatory notification requirements for all relevant jurisdictions",
      "Document all response activities with timestamps (ISO 27035 Phase 3)",
      "Conduct post-incident review within 30 days (ISO 27035 Phase 5)",
    ],
    keyContacts:[
      { label:"Internal CISO",  value:"ciso@acme.corp" },
      { label:"IR Team Lead",   value:"ir-team@acme.corp" },
      { label:"Legal Counsel",  value:"legal@acme.corp" },
    ],
    escalation:[
      { level:"L1", color:"rgb(147,197,253)", trigger:"Any confirmed incident",           notify:"CISO, IR Team" },
      { level:"L2", color:"#FBBF24",          trigger:"High/Critical or data breach",      notify:"CEO, Board, Legal" },
      { level:"L3", color:"#F87171",          trigger:"Systemic or regulatory impact",     notify:"Board, External Counsel, Regulators" },
    ],
  },
];

// ── Existing ITSM data ────────────────────────────────────────────────────────
const tickets: any[] = [];

const changes: any[] = [];
const problems: any[] = [];
const cmdb: any[] = [];
const slas: any[] = [];
const kbArticles: any[] = [];


// ── Badge helpers ─────────────────────────────────────────────────────────────
const pBadge: Record<string,{bg:string;color:string;border:string}> = {
  P1:{bg:"rgba(239,68,68,0.08)", color:"#F87171", border:"rgba(239,68,68,0.3)"},
  P2:{bg:"rgba(251,191,36,0.08)",color:"#FBBF24", border:"rgba(251,191,36,0.3)"},
  P3:{bg:"rgba(99,179,237,0.10)",color:"rgb(147,197,253)", border:"rgba(99,179,237,0.3)"},
  P4:{bg:"rgba(148,163,184,0.08)",color:"rgba(148,163,184,0.8)", border:"rgba(148,163,184,0.2)"},
};

function incPriorityBadge(priority: string) {
  const p = priority.startsWith("P1") ? "P1" : priority.startsWith("P2") ? "P2" : priority.startsWith("P3") ? "P3" : "P4";
  const b = pBadge[p];
  return <span style={{ background:b.bg, color:b.color, border:`1px solid ${b.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{priority}</span>;
}

function incStatusBadge(status: string) {
  const map: Record<string,{bg:string;color:string}> = {
    open:          { bg:"rgba(239,68,68,0.08)",   color:"#F87171" },
    investigating: { bg:"rgba(59,130,246,0.10)",  color:"rgb(147,197,253)" },
    contained:     { bg:"rgba(251,191,36,0.08)",  color:"#FBBF24" },
    resolved:      { bg:"rgba(52,211,153,0.08)",  color:"#34D399" },
    closed:        { bg:"rgba(148,163,184,0.08)", color:"var(--muted-foreground)" },
  };
  const s = map[status] ?? { bg:"rgba(148,163,184,0.08)", color:"var(--muted-foreground)" };
  return <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.color}33`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{status}</span>;
}

function phaseBadge(phase: string) {
  const map: Record<string,string> = {
    Detection:"rgba(59,130,246,0.8)", Containment:"rgba(251,191,36,0.8)", Assessment:"rgba(167,139,250,0.8)",
    Eradication:"rgba(239,68,68,0.8)", Recovery:"rgba(52,211,153,0.8)", "Post-Incident":"var(--muted-foreground)",
    Notification:"rgba(245,158,11,0.8)", Evidence:"rgba(45,212,191,0.8)", Mitigation:"rgba(99,179,237,0.8)",
  };
  const c = map[phase] ?? "var(--muted-foreground)";
  return <span style={{ background:`${c}18`, color:c, border:`1px solid ${c}40`, borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{phase}</span>;
}

// ── Incident Detail Page ──────────────────────────────────────────────────────
type IncidentType = typeof incidents[0];

function IncidentDetailPage({ incident, onBack }: { incident: IncidentType; onBack: () => void }) {
  const [dTab, setDTab] = useState("overview");
  const [incStatus, setIncStatus] = useState(incident.status);
  const [escalationReason, setEscalationReason] = useState("");
  const [watcherEmail, setWatcherEmail] = useState("");

  const detailTabs = [
    { key:"overview",      label:"Overview" },
    { key:"sla",           label:"SLA Tracker" },
    { key:"timeline",      label:`Timeline ${incident.timeline.length}` },
    { key:"response",      label:"Response" },
    { key:"activities",    label:"Activities" },
    { key:"evidence",      label:"Evidence" },
    { key:"communications",label:"Communications" },
    { key:"escalation",    label:"Escalation" },
    { key:"lessons",       label:"Lessons Learned" },
  ];

  const statusOptions = ["open","investigating","contained","resolved","closed"];

  return (
    <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"14px 24px", background:C.bg, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
          <button onClick={onBack} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 10px", color:C.accent, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>← Back</button>
          <Mono>{incident.id}</Mono>
          {incPriorityBadge(incident.priority)}
          {incStatusBadge(incStatus)}
          <span style={{ background:"rgba(239,68,68,0.08)", color:"#F87171", border:"1px solid rgba(239,68,68,0.3)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{incident.type}</span>
          <span style={{ fontSize:13 }}>{incident.regionFlag}</span>
          <span style={{ fontSize:10, color:C.muted }}>{incident.region}</span>
          {incident.dataBreach && <span style={{ background:"rgba(239,68,68,0.08)", color:"#F87171", border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>Data Compromised</span>}
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.accent, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>📋 Playbook</button>
            <button style={{ padding:"6px 16px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#D97706,#B45309)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✓ Acknowledge</button>
          </div>
        </div>
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:3 }}>{incident.title}</div>
          <div style={{ fontSize:11, color:C.muted }}>Owner: <span style={{ color:C.accent }}>{incident.owner}</span> · Reporter: <span style={{ color:C.text }}>{incident.reporter}</span></div>
        </div>
        {/* Alert banners */}
        {incident.slaAtRisk && (
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:7, padding:"7px 12px", marginBottom:6, fontSize:11 }}>
            <span style={{ color:"#FBBF24" }}>⚠</span>
            <span style={{ color:"#FBBF24", fontWeight:700 }}>SLA at risk — response time approaching limit</span>
          </div>
        )}
        {incident.notifyPending && (
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:7, padding:"7px 12px", fontSize:11 }}>
            <span style={{ color:"#F87171" }}>🔔</span>
            <span style={{ color:"#F87171", fontWeight:700 }}>Regulatory notification pending — review notification requirements</span>
          </div>
        )}
        {/* Sub-tabs */}
        <div style={{ display:"flex", gap:0, marginTop:12, borderBottom:`1px solid ${C.border}` }}>
          {detailTabs.map(t => (
            <button key={t.key} onClick={() => setDTab(t.key)} style={{
              padding:"8px 16px", background:"none", border:"none", borderBottom:`2px solid ${dTab===t.key?"rgb(147,197,253)":"transparent"}`,
              color:dTab===t.key?C.accent:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
              marginBottom:-1, whiteSpace:"nowrap",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>

        {/* ── OVERVIEW ── */}
        {dTab === "overview" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:10 }}>Description</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{incident.description}</div>
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:10 }}>Impact Assessment</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{incident.impact}</div>
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:10 }}>Root Cause</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{incident.rootCause}</div>
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:12 }}>Affected Systems</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {incident.affectedSystems.map((s,i) => (
                    <span key={i} style={{ background:"rgba(59,130,246,0.10)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono', monospace" }}>{s}</span>
                  ))}
                </div>
              </div>
              {incident.aiInsights && (
                <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.08),rgba(59,130,246,0.06))", border:"1px solid rgba(167,139,250,0.25)", borderRadius:12, padding:"14px 18px" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:C.purple, marginBottom:10, letterSpacing:"0.4px", textTransform:"uppercase" }}>✦ AI Analysis</div>
                  {incident.aiInsights.map((ins,i) => (
                    <div key={i} style={{ display:"flex", gap:8, marginBottom:8, fontSize:11, color:C.text, lineHeight:1.5 }}>
                      <span style={{ color:C.purple, flexShrink:0 }}>◆</span>{ins}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* Status */}
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:12 }}>Status</div>
                {statusOptions.map(s => (
                  <div key={s} onClick={() => setIncStatus(s)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:7, marginBottom:4, cursor:"pointer", background:incStatus===s?"rgba(239,68,68,0.06)":"var(--secondary)", border:`1px solid ${incStatus===s?"rgba(239,68,68,0.25)":C.border}` }}>
                    <div style={{ width:12, height:12, borderRadius:"50%", border:`2px solid ${incStatus===s?"#F87171":C.muted}`, background:incStatus===s?"#F87171":"transparent", flexShrink:0 }} />
                    <span style={{ fontSize:12, fontWeight:700, color:incStatus===s?C.text:C.muted, textTransform:"capitalize" }}>{s}</span>
                    {incStatus===s && <span style={{ marginLeft:"auto", width:8, height:8, borderRadius:"50%", background:"#F87171" }} />}
                  </div>
                ))}
              </div>
              {/* Details */}
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:12 }}>Details</div>
                {[
                  ["Severity",        incident.priority],
                  ["Priority",        incident.priority.startsWith("P1") ? "Critical" : incident.priority.startsWith("P2") ? "High" : "Medium"],
                  ["Escalation Level",`Level ${incident.escalationLevel}`],
                  ["Started",         incident.started],
                  ["Detected",        incident.detected],
                  ["Contained",       incident.contained],
                  ["Resolved",        incident.resolved],
                  ["MTTR",            incident.mttr],
                  ["MTTD",            incident.mttd],
                  ["Affected Users",  String(incident.usersAffected)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                    <span style={{ color:C.muted }}>{label}</span>
                    <span style={{ color:C.text, fontWeight:600, fontFamily:label==="Started"||label==="Detected"||label==="Contained"||label==="Resolved"?"'JetBrains Mono', monospace":"inherit", fontSize:label==="Started"||label==="Detected"?"10":"11" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SLA TRACKER ── */}
        {dTab === "sla" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              {[
                { label:"Time to Acknowledge (TTA)", breached:true,  elapsed:"171153 min" },
                { label:"Time to Contain (TTC)",     breached:true,  elapsed:"171108 min" },
                { label:"Time to Resolve (TTR)",     breached:true,  elapsed:"170928 min" },
              ].map(s => (
                <div key={s.label} style={{ ...card }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:10 }}>{s.label}</div>
                  <div style={{ height:8, borderRadius:4, background:C.bg2, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ height:"100%", width:"100%", background:"linear-gradient(90deg,#DC2626,#EF4444)", borderRadius:4 }} />
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:"#F87171" }}>Breached {s.elapsed} ago</div>
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>SLA Timeline</div>
              {[
                { label:"Incident Detected",    time:incident.detected, done:true },
                { label:"Incident Acknowledged", time:"—",              done:false },
                { label:"Incident Contained",    time:"—",              done:false },
                { label:"Incident Resolved",     time:"—",              done:false },
              ].map(item => (
                <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:item.done?"#F87171":C.border, flexShrink:0 }} />
                    <span style={{ color:item.done?C.text:C.muted, fontWeight:item.done?700:400 }}>{item.label}</span>
                  </div>
                  <span style={{ color:item.done?C.accent:C.muted, fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{item.time}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <span style={{ fontSize:13 }}>👁</span>
                <span style={{ fontSize:12, fontWeight:800, color:C.accent }}>Watchers</span>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                <input value={watcherEmail} onChange={e=>setWatcherEmail(e.target.value)} placeholder="email@org.com" style={{ flex:1, padding:"8px 12px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }} />
                <button style={{ padding:"8px 14px", borderRadius:6, border:"none", background:"rgb(147,197,253)", color:"var(--card)", fontWeight:800, fontSize:13, cursor:"pointer" }}>+</button>
              </div>
              <div style={{ fontSize:11, color:C.muted, textAlign:"center", padding:"8px 0" }}>No watchers yet</div>
            </div>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {dTab === "timeline" && (
          <div style={{ ...card }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>{incident.timeline.length} events recorded</div>
            {incident.timeline.map((e,i) => (
              <div key={i} style={{ display:"flex", gap:14, padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:8 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:"rgb(147,197,253)", flexShrink:0 }} />
                  {i < incident.timeline.length - 1 && <div style={{ width:2, flex:1, background:`${C.border}`, minHeight:20 }} />}
                </div>
                <div style={{ flex:1, paddingBottom:i < incident.timeline.length - 1 ? 4 : 0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                    <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:10, color:C.muted }}>{e.time}</span>
                    <span style={{ background:"rgba(99,179,237,0.12)", color:"rgb(147,197,253)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{e.team}</span>
                    {phaseBadge(e.phase)}
                  </div>
                  <div style={{ fontSize:12, color:C.text, fontWeight:600 }}>{e.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RESPONSE ── */}
        {dTab === "response" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {[
                { phase:"Detect",    status:"Complete", icon:"△", color:"#34D399", bg:"rgba(52,211,153,0.08)" },
                { phase:"Contain",   status:"Pending",  icon:"◯", color:C.muted,   bg:"var(--secondary)" },
                { phase:"Eradicate", status:"Pending",  icon:"◯", color:C.muted,   bg:"var(--secondary)" },
                { phase:"Recover",   status:"Pending",  icon:"◯", color:C.muted,   bg:"var(--secondary)" },
              ].map(p => (
                <div key={p.phase} style={{ background:p.bg, border:`1px solid ${p.color}25`, borderRadius:10, padding:"18px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, color:p.color, marginBottom:8 }}>{p.icon}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{p.phase}</div>
                  <div style={{ fontSize:11, color:p.color, fontWeight:700, marginTop:3 }}>{p.status}</div>
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:12 }}>Response Activities ({incident.responseActivities.length} events)</div>
              {incident.responseActivities.map((a,i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  {phaseBadge(a.phase)}
                  <span style={{ flex:1, fontSize:12, color:C.text }}>{a.desc}</span>
                  <span style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{a.team}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"space-between" }}>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <span style={{ fontSize:16 }}>📋</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:C.accent }}>Linked Playbook</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{incident.linkedPlaybook.toLowerCase().replace(/ /g,"-")}</div>
                  </div>
                </div>
                <button style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.accent, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>View Playbook</button>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITIES ── */}
        {dTab === "activities" && (
          <div style={{ ...card }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontSize:12, color:C.muted }}>0 response activities</span>
              <button style={{ padding:"7px 14px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#1D4ED8,#7C3AED)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Add Activity</button>
            </div>
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ fontSize:28, marginBottom:12 }}>☑</div>
              <div style={{ fontSize:12, color:C.muted }}>No activities yet. Add checklist items to track the response.</div>
            </div>
          </div>
        )}

        {/* ── EVIDENCE ── */}
        {dTab === "evidence" && (
          <div style={{ ...card }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontSize:12, color:C.muted }}>0 evidence files</span>
              <button style={{ padding:"7px 14px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#7C3AED,#0891B2)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⬆ Upload Evidence</button>
            </div>
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ fontSize:28, marginBottom:12 }}>📎</div>
              <div style={{ fontSize:12, color:C.muted }}>No evidence files uploaded yet</div>
            </div>
          </div>
        )}

        {/* ── COMMUNICATIONS ── */}
        {dTab === "communications" && (
          <div style={{ ...card }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontSize:12, color:C.muted }}>0 communications logged</span>
              <button style={{ padding:"7px 14px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#065F46,#059669)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Log Communication</button>
            </div>
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ fontSize:28, marginBottom:12 }}>💬</div>
              <div style={{ fontSize:12, color:C.muted }}>No communications logged yet</div>
            </div>
          </div>
        )}

        {/* ── ESCALATION ── */}
        {dTab === "escalation" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ ...card, background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.2)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#FBBF24", marginBottom:12 }}>Current Level: {incident.escalationLevel} / 3</div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={escalationReason} onChange={e=>setEscalationReason(e.target.value)} placeholder="Escalation reason (required)…" style={{ flex:1, padding:"9px 12px", borderRadius:6, border:`1px solid rgba(251,191,36,0.3)`, background:"rgba(251,191,36,0.05)", color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }} />
                <button style={{ padding:"9px 16px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#D97706,#B45309)", color:"white", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>↑ Escalate</button>
              </div>
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>Escalation History</div>
              <div style={{ textAlign:"center", padding:"20px", fontSize:11, color:C.muted }}>No escalations recorded</div>
            </div>
          </div>
        )}

        {/* ── LESSONS LEARNED ── */}
        {dTab === "lessons" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {[
                { label:"What Happened",       placeholder:"Describe the incident timeline and impact…" },
                { label:"Root Cause Analysis", placeholder:"Identify the root cause(s)…" },
                { label:"What Worked Well",    placeholder:"Controls and processes that worked effectively…" },
                { label:"What Failed / Gaps",  placeholder:"Controls that failed or gaps identified…" },
              ].map(f => (
                <div key={f.label} style={{ ...card }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8 }}>{f.label}</div>
                  <textarea placeholder={f.placeholder} style={{ width:"100%", minHeight:100, padding:"9px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:14 }}>🎯</span>
                <span style={{ fontSize:12, fontWeight:800, color:C.accent }}>SMART Action Items</span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input placeholder="Add improvement action item…" style={{ flex:1, padding:"8px 12px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }} />
                <button style={{ padding:"8px 14px", borderRadius:6, border:"none", background:"rgb(147,197,253)", color:"var(--card)", fontWeight:800, fontSize:14, cursor:"pointer" }}>+</button>
              </div>
            </div>
            <button style={{ alignSelf:"flex-start", padding:"10px 20px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#1D4ED8,#065F46)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 }}>
              📋 Save Lessons Learned
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Report Incident Wizard ────────────────────────────────────────────────────
function ReportIncidentWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ title:"", type:"Malware", reporter:"", description:"", owner:"", severity:"P1-Critical", region:"Global", template:"", team:"", playbook:"", systems:"" });
  const steps = [
    { n:1, label:"Incident Info",    sub:"Title, type, description" },
    { n:2, label:"Classification",   sub:"Severity, region, template" },
    { n:3, label:"Response Plan",    sub:"Team, playbook, systems" },
    { n:4, label:"Review & Submit",  sub:"Final review" },
  ];
  const updateForm = (k: string, v: string) => setForm(f => ({ ...f, [k]:v }));

  return (
    <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>
      {/* Back */}
      <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 10px", color:C.accent, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", marginBottom:20 }}>← Cancel</button>
      {/* Step indicators */}
      <div style={{ display:"flex", gap:0, alignItems:"flex-start", marginBottom:32 }}>
        {steps.map((s,i) => (
          <div key={s.n} style={{ display:"flex", alignItems:"flex-start", flex:1 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:step===s.n?"#DC2626":step>s.n?"#1D4ED8":C.border, border:`2px solid ${step===s.n?"#DC2626":step>s.n?"#1D4ED8":C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"white", marginBottom:6 }}>{s.n}</div>
              <div style={{ fontSize:11, fontWeight:700, color:step===s.n?C.text:C.muted, textAlign:"center" }}>{s.label}</div>
              <div style={{ fontSize:9, color:C.muted, textAlign:"center" }}>{s.sub}</div>
            </div>
            {i < steps.length - 1 && <div style={{ height:2, flex:1, background:step>s.n?"#1D4ED8":C.border, marginTop:13 }} />}
          </div>
        ))}
      </div>
      {/* Step content */}
      <div style={{ maxWidth:680, margin:"0 auto" }}>
        {step === 1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Incident Information</div>
            {[
              { label:"Incident Title *", key:"title", placeholder:"Brief summary of what happened" },
              { label:"Reporter *",       key:"reporter", placeholder:"System or person who detected this" },
              { label:"Incident Owner / Responder", key:"owner", placeholder:"Assigned team or person" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{f.label}</div>
                <input value={form[f.key as keyof typeof form]} onChange={e=>updateForm(f.key,e.target.value)} placeholder={f.placeholder} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Incident Type</div>
              <select value={form.type} onChange={e=>updateForm("type",e.target.value)} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }}>
                {["Malware","Unauthorized Access","Insider Threat","Data Breach","DDoS","Phishing","Supply Chain","Crypto Mining","Service Disruption","Other"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Description *</div>
              <textarea value={form.description} onChange={e=>updateForm("description",e.target.value)} placeholder="Describe what happened, when it was detected, initial observations, and scope…" style={{ width:"100%", minHeight:110, padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
            </div>
          </div>
        )}
        {step === 2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Classification</div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Severity *</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {["P1-Critical","P2-High","P3-Medium","P4-Low"].map(s => (
                  <div key={s} onClick={() => updateForm("severity",s)} style={{ padding:"10px 14px", borderRadius:7, border:`1px solid ${form.severity===s?"rgba(239,68,68,0.5)":C.border}`, background:form.severity===s?"rgba(239,68,68,0.06)":C.bg2, cursor:"pointer" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:form.severity===s?"#F87171":C.text }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Region</div>
              <select value={form.region} onChange={e=>updateForm("region",e.target.value)} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }}>
                {["Global","KSA","India","Malaysia","Kenya","EU"].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Regional Template</div>
              <select value={form.template} onChange={e=>updateForm("template",e.target.value)} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }}>
                <option value="">Select template…</option>
                {regionalTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>Response Plan</div>
            {[
              { label:"Response Team", key:"team", placeholder:"IR Team, SOC Lead, DFIR Team…" },
              { label:"Affected Systems", key:"systems", placeholder:"List affected systems / hostnames…" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>{f.label}</div>
                <input value={form[f.key as keyof typeof form]} onChange={e=>updateForm(f.key,e.target.value)} placeholder={f.placeholder} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>Response Playbook</div>
              <select value={form.playbook} onChange={e=>updateForm("playbook",e.target.value)} style={{ width:"100%", padding:"10px 14px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none" }}>
                <option value="">Select playbook…</option>
                {incidentPlaybooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {step === 4 && (
          <div style={{ ...card }}>
            <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:16 }}>Review & Submit</div>
            {[
              ["Title",      form.title      || "—"],
              ["Type",       form.type],
              ["Reporter",   form.reporter   || "—"],
              ["Owner",      form.owner      || "—"],
              ["Severity",   form.severity],
              ["Region",     form.region],
              ["Team",       form.team       || "—"],
              ["Systems",    form.systems    || "—"],
            ].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                <span style={{ color:C.muted, fontWeight:600 }}>{k}</span>
                <span style={{ color:C.text }}>{v}</span>
              </div>
            ))}
            {form.description && (
              <div style={{ marginTop:12, padding:"10px 12px", background:C.bg2, borderRadius:7, fontSize:11, color:C.muted, lineHeight:1.5 }}>{form.description}</div>
            )}
          </div>
        )}
        {/* Navigation */}
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:28 }}>
          <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:7, border:`1px solid ${C.border}`, background:"none", color:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>← Cancel</button>
          <div style={{ display:"flex", gap:10 }}>
            {step > 1 && <button onClick={()=>setStep(s=>s-1)} style={{ padding:"9px 20px", borderRadius:7, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Back</button>}
            {step < 4
              ? <button onClick={()=>setStep(s=>s+1)} style={{ padding:"9px 24px", borderRadius:7, border:"none", background:"linear-gradient(135deg,#DC2626,#B91C1C)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Next →</button>
              : <button onClick={onClose} style={{ padding:"9px 24px", borderRadius:7, border:"none", background:"linear-gradient(135deg,#1D4ED8,#065F46)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Submit Incident</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CMDB static dependency data ───────────────────────────────────────────────
const CI_POSITIONS: Record<string,{x:number,y:number}> = {
  "CI-009":{ x:520, y:10  }, "CI-016":{ x:180, y:130 }, "CI-008":{ x:620, y:130 },
  "CI-010":{ x:30,  y:260 }, "CI-015":{ x:240, y:260 }, "CI-001":{ x:520, y:260 },
  "CI-013":{ x:740, y:260 }, "CI-014":{ x:920, y:260 }, "CI-011":{ x:30,  y:390 },
  "CI-002":{ x:380, y:390 }, "CI-007":{ x:580, y:390 }, "CI-003":{ x:760, y:390 },
  "CI-004":{ x:240, y:510 }, "CI-005":{ x:430, y:510 }, "CI-006":{ x:620, y:510 },
  "CI-017":{ x:80,  y:510 }, "CI-018":{ x:120, y:640 }, "CI-019":{ x:320, y:640 },
  "CI-020":{ x:540, y:640 }, "CI-012":{ x:780, y:640 },
};
const CI_TYPE_COLORS: Record<string,string> = {
  Application:"#3B82F6", Database:"#8B5CF6", Server:"rgb(147,197,253)", Network:"#34D399",
};



// ── Main component ────────────────────────────────────────────────────────────
export default function ServiceOps() {
  const { viewTenantId } = useOrg();
  const { data: apiTickets, isLoading: ticketsLoading, isError: ticketsError } = useTickets();
  const tickets = apiTickets ?? [];
  const [changes,    setChanges]    = useState<any[]>([]);
  const [problems,   setProblems]   = useState<any[]>([]);
  const [cmdb,       setCmdb]       = useState<any[]>([]);
  const [slas,       setSlas]       = useState<any[]>([]);
  const [kbArticles,    setKbArticles]    = useState<any[]>([]);
  const [ciEdges,       setCiEdges]       = useState<{id:string;source:string;target:string}[]>([]);
  const [ciChangeLinks, setCiChangeLinks] = useState<Record<string,string[]>>({});
  const effectiveSlas = viewTenantId === 1 ? slas : slas.map(s => ({ ...s, count: 0, breached: 0 }));
  const [tab, setTab] = useState("overview");
  const [incTab, setIncTab] = useState("dashboard");
  const [changeTab, setChangeTab] = useState("changes");
  const [workflowType, setWorkflowType] = useState("normal");
  const [selectedIncident, setSelectedIncident] = useState<typeof incidents[0] | null>(null);
  const [selTicket, setSelTicket]     = useState<(typeof tickets)[0]|null>(null);
  const [selChange, setSelChange]     = useState<(typeof changes)[0]|null>(null);
  const [selProblem, setSelProblem]   = useState<(typeof problems)[0]|null>(null);
  const [selCI, setSelCI]             = useState<(typeof cmdb)[0]|null>(null);
  const [kbSearch, setKbSearch]       = useState("");
  const [kbTag,    setKbTag]          = useState("All");
  const [kbModule, setKbModule]       = useState("All");
  const [kbFw,     setKbFw]           = useState("All");
  const [selKbArticle, setSelKbArticle] = useState<any>(null);
  const [cmdbSubTab, setCmdbSubTab]   = useState("list");
  const [impactCI,   setImpactCI]     = useState("");
  const [impactType, setImpactType]   = useState("Patch");
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState("All");
  const [incSevFilter, setIncSevFilter] = useState("All");
  const [incStatusFilter, setIncStatusFilter] = useState("All");
  const [incRegionFilter, setIncRegionFilter] = useState("All");
  const [dbIncidents, setDbIncidents] = useState<any[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    const H = { Authorization: `Bearer ${token}` };
    fetch("/api/incidents", { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => Array.isArray(d) && d.length > 0 && setDbIncidents(d))
      .catch(() => {});
    fetch("/api/service/changes",  { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setChanges(d)).catch(()=>{});
    fetch("/api/service/problems", { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setProblems(d)).catch(()=>{});
    fetch("/api/service/cmdb",     { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setCmdb(d)).catch(()=>{});
    fetch("/api/service/sla",      { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setSlas(d)).catch(()=>{});
    fetch("/api/service/kb",       { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setKbArticles(d)).catch(()=>{});
    fetch("/api/service/cmdb/deps",         { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&setCiEdges(d)).catch(()=>{});
    fetch("/api/service/cmdb/change-links", { headers: H }).then(r=>r.ok?r.json():{}).then((d:any)=>d&&typeof d==="object"&&!Array.isArray(d)&&setCiChangeLinks(d)).catch(()=>{});
  }, []);
  const [selPlaybook, setSelPlaybook] = useState(incidentPlaybooks[0]);
  const [rtRegion, setRtRegion]             = useState("All");
  const [expandedTemplate, setExpandedTemplate] = useState<string|null>("RT-001");

  const openTickets    = tickets.filter(t=>t.status==="open").length;
  const p1Open         = tickets.filter(t=>t.priority==="P1"&&t.status!=="resolved").length;
  const inProgressT    = tickets.filter(t=>t.status==="in-progress").length;
  const changesPending = changes.filter(c=>c.status==="pending"||c.status==="in-review").length;
  const slaBreaches    = effectiveSlas.reduce((s,sl)=>s+sl.breached,0);
  const ticketsByCat   = Array.from(new Set(tickets.map(t=>t.cat))).map(cat=>({cat,count:tickets.filter(t=>t.cat===cat).length}));
  const catColors:Record<string,string> = { Incident:"#F87171", Access:"rgb(147,197,253)", Compliance:"#34D399", Privacy:"#A78BFA", Maintenance:"var(--muted-foreground)" };
  const filteredKb     = kbArticles.filter(a=>a.title.toLowerCase().includes(kbSearch.toLowerCase())||a.category.toLowerCase().includes(kbSearch.toLowerCase()));

  const lIncidents = dbIncidents.length > 0 ? dbIncidents : incidents;

  // Incident filters
  const incP1 = lIncidents.filter(i=>i.priority.startsWith("P1")).length;
  const incP2 = lIncidents.filter(i=>i.priority.startsWith("P2")).length;
  const incP3 = lIncidents.filter(i=>i.priority.startsWith("P3")).length;
  const incDataBreaches = lIncidents.filter(i=>i.dataBreach).length;
  const incNotifyPending = lIncidents.filter(i=>i.notifyPending).length;
  const incSlaRisk = lIncidents.filter(i=>i.slaAtRisk).length;
  const incOpen = lIncidents.filter(i=>i.status==="open"||i.status==="investigating").length;
  const avgMttr = "13.12";

  const filteredInc = lIncidents.filter(i => {
    if (incSevFilter !== "All" && !i.priority.startsWith(incSevFilter)) return false;
    if (incStatusFilter !== "All" && i.status !== incStatusFilter) return false;
    if (incRegionFilter !== "All" && i.region !== incRegionFilter) return false;
    return true;
  });

  const tabs = [
    { key:"overview",  label:"Overview" },
    { key:"incidents", label:"Incidents", count:lIncidents.filter(i=>i.status==="open"||i.status==="investigating").length, dot:"#F87171" },
    { key:"tickets",   label:"Tickets",   count:tickets.filter(t=>t.status!=="resolved").length, dot:"#FBBF24" },
    { key:"changes",   label:"Changes",   count:changes.length },
    { key:"problems",  label:"Problems",  count:problems.length },
    { key:"cmdb",      label:"CMDB",      count:cmdb.length },
    { key:"sla",       label:"SLA" },
    { key:"kb",        label:"Knowledge Base", count:kbArticles.length },
  ];

  const incidentSubTabs = [
    { key:"dashboard", label:"Dashboard", count:incOpen, dot:"#F87171" },
    { key:"report",    label:"Report Incident" },
    { key:"playbooks", label:"Playbooks", count:incidentPlaybooks.length },
    { key:"regional",  label:"Regional Templates", count:regionalTemplates.length },
  ];

  const changeSubTabs = [
    { key:"changes",   label:"Changes",         count:changes.length },
    { key:"cab",       label:"CAB Committee" },
    { key:"tracker",   label:"Change Tracker" },
    { key:"scenarios", label:"Change Scenarios" },
    { key:"workflows", label:"Workflows" },
  ];

  const rtRegions = ["All","KSA","India","Malaysia","Kenya","EU","Global"];
  const filteredRt = rtRegion === "All" ? regionalTemplates : regionalTemplates.filter(t=>t.region===rtRegion);

  // Full-page views
  if (selectedIncident && tab === "incidents") {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
        <ModuleHeader title="ServiceOps — Incident Management" description="Incidents · Playbooks · Regional Templates · Overview" />
        <IncidentDetailPage incident={selectedIncident} onBack={() => setSelectedIncident(null)} />
      </div>
    );
  }
  if (tab === "incidents" && incTab === "report") {
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
        <ModuleHeader title="Report New Incident" description="Document a security or operational incident with regional compliance tracking" />
        <ReportIncidentWizard onClose={() => { setIncTab("dashboard"); }} />
      </div>
    );
  }
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <ModuleHeader
        title="ServiceOps — IT Service Management"
        description="Overview · Incidents · Changes · Tickets · Problems · CMDB · SLA · Knowledge Base"
        action={tab==="incidents" ? { label:"+ Report Incident", onClick:()=>setIncTab("report") } : undefined}
      />
      <SubNav tabs={tabs} active={tab} onSelect={(t)=>{ setTab(t); }} />
      <AICopilotBar module="serviceops" />
      {ticketsError && (
        <div style={{ margin:"8px 20px 0", padding:"8px 14px", background:"rgba(220,38,38,0.08)", border:"1px solid #FECACA", borderRadius:8, fontSize:13, color:"#DC2626", display:"flex", alignItems:"center", gap:8 }}>
          <span>⚠</span> Failed to load ticket data from the API. Please check your connection.
        </div>
      )}
      {tab==="incidents" && (
        <div style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgb(9,12,18)", paddingLeft:24 }}>
          <SubNav tabs={incidentSubTabs} active={incTab} onSelect={setIncTab} />
        </div>
      )}
      {tab==="changes" && (
        <div style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgb(9,12,18)", paddingLeft:24 }}>
          <SubNav tabs={changeSubTabs} active={changeTab} onSelect={setChangeTab} />
        </div>
      )}

      {/* ── Ticket Drawer ── */}
      {selTicket && (
        <Drawer open title={`${selTicket.id} — ${selTicket.title}`}
          subtitle={`${selTicket.cat} · ${selTicket.priority} · SLA ${selTicket.sla}`}
          onClose={()=>setSelTicket(null)}
          headerColor={selTicket.priority==="P1"?"#991B1B":selTicket.priority==="P2"?"#92400E":"#1E3A5F"}>
          <DrawerSection title="Ticket Details" />
          <Field label="Ticket ID"    value={selTicket.ticketId ?? selTicket.id} mono />
          <Field label="Category"     value={selTicket.category ?? selTicket.cat} />
          <Field label="Priority"     value={selTicket.priority} />
          <Field label="SLA Target"   value={selTicket.sla} />
          <Field label="Assignee"     value={selTicket.assignee} />
          <Field label="Status"       value={selTicket.status} />
          <Field label="Created"      value={selTicket.createdAt ? new Date(selTicket.createdAt).toLocaleDateString() : selTicket.created} />
          <DrawerSection title="Description" />
          <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{selTicket.desc}</div>
          <AiInsightBox insights={selTicket.aiInsights} />
          <DrawerSection title="Actions" />
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {["Assign to me","Escalate","Link to Problem","Close Ticket"].map(a=>(
              <button key={a} onClick={()=>setSelTicket(null)} style={{ background:"rgba(99,179,237,0.08)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, color:"rgb(147,197,253)", cursor:"pointer", fontFamily:"inherit" }}>{a}</button>
            ))}
          </div>
        </Drawer>
      )}
      {/* ── Change Drawer ── */}
      {selChange && (
        <Drawer open title={`${selChange.changeId} — ${selChange.title}`}
          subtitle={`${selChange.type} · Impact: ${selChange.impact} · Risk: ${selChange.risk}`}
          onClose={()=>setSelChange(null)}
          headerColor={selChange.risk==="High"?"#991B1B":selChange.risk==="Medium"?"#92400E":"#065F46"}>
          <DrawerSection title="Change Details" />
          <Field label="Change ID"    value={selChange.changeId} mono />
          <Field label="Type"         value={selChange.type} />
          <Field label="Impact"       value={selChange.impact} />
          <Field label="Risk"         value={selChange.risk} />
          <Field label="Approver"     value={selChange.approver} />
          <Field label="Scheduled"    value={selChange.scheduled} />
          <Field label="Status"       value={selChange.status} />
          <DrawerSection title="Description" />
          <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{selChange.desc}</div>
          <AiInsightBox insights={selChange.aiInsights} />
        </Drawer>
      )}
      {/* ── Problem Drawer ── */}
      {selProblem && (
        <Drawer open title={`${selProblem.id} — ${selProblem.title}`}
          subtitle={`${selProblem.category} · ${selProblem.affected} services affected`}
          onClose={()=>setSelProblem(null)} headerColor="#92400E">
          <DrawerSection title="Problem Details" />
          <Field label="Problem ID"      value={selProblem.id} mono />
          <Field label="Category"        value={selProblem.category} />
          <Field label="Opened"          value={selProblem.opened} />
          <Field label="Affected Svcs"   value={String(selProblem.affected)} />
          <Field label="Status"          value={selProblem.status} />
          <DrawerSection title="Root Cause Analysis" />
          <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{selProblem.rootCause}</div>
          <DrawerSection title="Workaround" />
          <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{selProblem.workaround}</div>
          <AiInsightBox insights={selProblem.aiInsights} />
        </Drawer>
      )}
      {/* ── CI Drawer ── */}
      {selCI && (
        <Drawer open title={`${selCI.id} — ${selCI.name}`}
          subtitle={`${selCI.type} · ${selCI.env} · ${selCI.criticality}`}
          onClose={()=>setSelCI(null)}
          headerColor={selCI.criticality==="Critical"?"#991B1B":selCI.criticality==="High"?"#92400E":"#1E3A5F"}>
          <DrawerSection title="Configuration Item" />
          <Field label="CI ID"          value={selCI.id} mono />
          <Field label="Hostname"       value={selCI.name} mono />
          <Field label="Type"           value={selCI.type} />
          <Field label="OS / Version"   value={selCI.os} />
          <Field label="Owner"          value={selCI.owner} />
          <Field label="Environment"    value={selCI.env} />
          <Field label="IP / Endpoint"  value={selCI.ip||"—"} mono />
          <Field label="Criticality"    value={selCI.criticality} />
          <Field label="Patch Status"   value={selCI.patch} />
          {Array.isArray(selCI.risks) && selCI.risks.length > 0 && (
            <>
              <DrawerSection title="Open Risks" />
              {selCI.risks.map((r:any,i:number)=>(
                <div key={i} style={{ fontSize:12, color:"#FBBF24", background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:6, padding:"7px 10px", marginBottom:4 }}>⚠ {r}</div>
              ))}
            </>
          )}
        </Drawer>
      )}

      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── INCIDENT DASHBOARD ─────────────────────────────────────────── */}
        {tab === "incidents" && incTab === "dashboard" && (
          <>
            {/* SLA breach banner */}
            {incSlaRisk > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"12px 18px" }}>
                <span style={{ fontSize:18, color:"#F87171" }}>⚠</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:"#F87171" }}>{incSlaRisk} SLA Breaches Detected</div>
                  <div style={{ fontSize:11, color:C.muted }}>{incSlaRisk} incidents require immediate attention</div>
                </div>
                <button style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:6, border:"1px solid rgba(239,68,68,0.4)", background:"rgba(239,68,68,0.08)", color:"#F87171", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>View Breached</button>
              </div>
            )}
            {/* Stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:10 }}>
              {[
                { label:"Total",          value:lIncidents.length,   icon:"📋", color:C.accent },
                { label:"Open / Active",  value:incOpen,            icon:"🔥", color:"#F87171" },
                { label:"Critical P1",    value:incP1,              icon:"🔴", color:"#F87171" },
                { label:"High P2",        value:incP2,              icon:"🟠", color:"#FBBF24" },
                { label:"Data Breaches",  value:incDataBreaches,    icon:"💾", color:"#A78BFA" },
                { label:"Notify Pending", value:incNotifyPending,   icon:"🔔", color:"#FBBF24" },
                { label:"SLA At Risk",    value:incSlaRisk,         icon:"⏱",  color:"#F87171" },
                { label:"Avg MTTR (h)",   value:avgMttr,            icon:"📈", color:"#34D399" },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:9, color:C.muted, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:C.muted, marginTop:3, lineHeight:1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Filters */}
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {[
                { label:`All Severities (${lIncidents.length})`, key:"All" },
                { label:`P1 Critical (${incP1})`, key:"P1" },
                { label:`P2 High (${incP2})`, key:"P2" },
                { label:`P3 Medium (${incP3})`, key:"P3" },
                { label:`P4 Low (0)`, key:"P4" },
              ].map(f => (
                <button key={f.key} onClick={()=>setIncSevFilter(f.key)} style={{ padding:"5px 13px", borderRadius:6, border:`1px solid ${incSevFilter===f.key?"rgba(147,197,253,0.5)":C.border}`, background:incSevFilter===f.key?"rgba(99,179,237,0.10)":C.bg2, color:incSevFilter===f.key?C.accent:C.muted, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{f.label}</button>
              ))}
              <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                <select value={incStatusFilter} onChange={e=>setIncStatusFilter(e.target.value)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:11, fontFamily:"inherit", outline:"none" }}>
                  <option value="All">All Statuses</option>
                  {["open","investigating","contained","resolved","closed"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={incRegionFilter} onChange={e=>setIncRegionFilter(e.target.value)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:11, fontFamily:"inherit", outline:"none" }}>
                  <option value="All">All Regions</option>
                  {["Kenya","Malaysia","India","EU","KSA","Global"].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize:11, color:C.muted }}>{filteredInc.length} incidents</div>
            {/* Incident list */}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {filteredInc.map(inc => (
                <div key={inc.id} onClick={()=>setSelectedIncident(inc)} style={{ ...card, padding:"14px 18px", cursor:"pointer", transition:"border-color 0.15s" }}
                  onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(147,197,253,0.35)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=C.border}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                    <Mono>{inc.id}</Mono>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{inc.title}</span>
                        {incPriorityBadge(inc.priority)}
                        {incStatusBadge(inc.status)}
                        <span style={{ background:"var(--border)", color:C.muted, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{inc.type}</span>
                        <span style={{ fontSize:12 }}>{inc.regionFlag}</span>
                        <span style={{ fontSize:10, color:C.muted }}>{inc.region}</span>
                        {inc.tags.map((tag,i) => (
                          <span key={i} style={{ background:"rgba(239,68,68,0.07)", color:"#F87171", border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{tag}</span>
                        ))}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, lineHeight:1.4 }}>{inc.description.substring(0,120)}…</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>Owner: <span style={{ color:C.accent }}>{inc.owner}</span> · {inc.started}</div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
                      {inc.slaAtRisk && <span style={{ background:"rgba(239,68,68,0.08)", color:"#F87171", border:"1px solid rgba(239,68,68,0.25)", borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>SLA at risk</span>}
                      {inc.notifyPending && <button onClick={e=>{e.stopPropagation();}} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid rgba(251,191,36,0.35)", background:"rgba(251,191,36,0.07)", color:"#FBBF24", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Notify</button>}
                      <span style={{ color:C.muted, fontSize:14 }}>›</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── RESPONSE PLAYBOOKS ─────────────────────────────────────────── */}
        {tab === "incidents" && incTab === "playbooks" && (
          <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16, flex:1, minHeight:0 }}>
            {/* Left list */}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {incidentPlaybooks.map(pb => (
                <div key={pb.id} onClick={()=>setSelPlaybook(pb)}
                  style={{ ...card, padding:"12px 14px", cursor:"pointer", borderColor: selPlaybook.id===pb.id ? "rgba(147,197,253,0.5)" : C.border, background: selPlaybook.id===pb.id ? "rgba(99,179,237,0.06)" : C.bg }}>
                  <div style={{ fontSize:11, fontWeight:800, color:selPlaybook.id===pb.id?C.accent:C.text, lineHeight:1.3, marginBottom:4 }}>{pb.name}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{pb.priority}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{pb.steps.length} steps</div>
                </div>
              ))}
            </div>
            {/* Right detail */}
            <div style={{ ...card, overflow:"auto" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:C.text, marginBottom:4 }}>{selPlaybook.name}</div>
                  <span style={{ background:"rgba(239,68,68,0.08)", color:"#F87171", border:"1px solid rgba(239,68,68,0.25)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{selPlaybook.type}</span>
                </div>
              </div>
              <div style={{ fontSize:12, color:C.muted, lineHeight:1.5, marginBottom:16 }}>{selPlaybook.description}</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>Trigger: <span style={{ color:C.text, fontWeight:600 }}>{selPlaybook.trigger}</span></div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {selPlaybook.steps.map(s => (
                  <div key={s.n} style={{ display:"flex", gap:14, alignItems:"flex-start", padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(99,179,237,0.12)", border:"1px solid rgba(99,179,237,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:C.accent, flexShrink:0 }}>{s.n}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:5 }}>
                        {phaseBadge(s.phase)}
                        <span style={{ fontSize:10, color:C.muted }}>Owner: <span style={{ color:C.text, fontWeight:600 }}>{s.owner}</span></span>
                        <span style={{ fontSize:10, color:C.muted }}>SLA: <span style={{ color:C.accent, fontWeight:700, fontFamily:"'JetBrains Mono', monospace" }}>{s.sla}</span></span>
                      </div>
                      <div style={{ fontSize:12, color:C.text }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REGIONAL TEMPLATES ─────────────────────────────────────────── */}
        {tab === "incidents" && incTab === "regional" && (
          <>
            {/* Region filter pills */}
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {rtRegions.map(r => (
                <button key={r} onClick={()=>setRtRegion(r)} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${rtRegion===r?"rgba(147,197,253,0.5)":C.border}`, background:rtRegion===r?"rgba(99,179,237,0.10)":C.bg2, color:rtRegion===r?C.accent:C.muted, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  {r}{r==="All"?` (${regionalTemplates.length})`:""}
                </button>
              ))}
            </div>

            {/* Template accordion list */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {filteredRt.map(t => {
                const isOpen = expandedTemplate === t.id;
                return (
                  <div key={t.id} style={{ ...card, padding:0, overflow:"hidden" }}>

                    {/* ── Accordion header ── */}
                    <div
                      onClick={() => setExpandedTemplate(isOpen ? null : t.id)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", cursor:"pointer", userSelect:"none" }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:22 }}>{t.regionFlag}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{t.name}</div>
                          <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                            <span style={{ background:"rgba(99,179,237,0.10)", color:C.accent, border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{t.region}</span>
                            {t.frameworks.map((f,i)=>(
                              <span key={i} style={{ background:"var(--secondary)", color:C.muted, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:600 }}>{f}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>{t.languages}</span>
                        <span style={{ color:C.muted, fontSize:14, fontWeight:700, transition:"transform 0.2s", display:"inline-block", transform:isOpen?"rotate(180deg)":"rotate(0deg)" }}>⌄</span>
                      </div>
                    </div>

                    {/* ── Deadline pill strip (always visible) ── */}
                    <div style={{ display:"flex", gap:8, padding:"0 18px 12px", flexWrap:"wrap" }}>
                      {t.notifications.map((n,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:6, padding:"4px 10px" }}>
                          <span style={{ fontSize:11 }}>🔔</span>
                          <span style={{ fontSize:10, fontWeight:700, color:C.text }}>{n.authority}</span>
                          <span style={{ background:n.deadlineColor==="#F87171"?"rgba(239,68,68,0.15)":"rgba(251,191,36,0.15)", color:n.deadlineColor, border:`1px solid ${n.deadlineColor==="#F87171"?"rgba(239,68,68,0.3)":"rgba(251,191,36,0.3)"}`, borderRadius:20, padding:"1px 8px", fontSize:10, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", marginLeft:2 }}>{n.deadline}</span>
                        </div>
                      ))}
                    </div>

                    {/* ── Expanded detail ── */}
                    {isOpen && (
                      <div style={{ padding:"0 18px 20px", borderTop:`1px solid ${C.border}` }}>

                        {/* Description */}
                        <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, padding:"12px 0 16px" }}>{t.description}</div>

                        {/* Notification Authorities */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                          <span style={{ fontSize:13 }}>🔔</span>
                          <span style={{ fontSize:12, fontWeight:800, color:C.text }}>Notification Authorities</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                          {t.notifications.map((n,i)=>(
                            <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6 }}>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:3 }}>{n.authority}</div>
                                  <div style={{ fontSize:11, color:C.muted }}>{n.type === "Financial Sector" ? `${n.deadline === "2h" || n.deadline === "12h" ? n.deadline + " hours" : n.deadline} for ${n.type.toLowerCase()} incidents` : n.type === "Cyber Incident" ? `${n.deadline} from detection — mandatory for all cyber incidents affecting critical infrastructure` : n.type === "Data Breach" ? `${n.deadline} for personal data breaches` : n.type === "Early Warning" ? `${n.deadline} — early warning to competent authority` : n.type === "Incident Notification" ? `${n.deadline} — full incident notification` : n.type === "High-Risk Data Breach" ? `${n.deadline} — notify affected data subjects` : n.type === "P1-P2 Incidents" ? `${n.deadline} — notify CISO and management` : n.type === "Critical Incidents" ? `${n.deadline} — board-level escalation` : n.type === "Potential Breach" ? `Within ${n.deadline} — engage legal counsel` : `${n.deadline} — ${n.type}`}</div>
                                </div>
                                <span style={{ background:n.deadlineColor==="#F87171"?"rgba(239,68,68,0.14)":"rgba(251,191,36,0.14)", color:n.deadlineColor, border:`1px solid ${n.deadlineColor==="#F87171"?"rgba(239,68,68,0.35)":"rgba(251,191,36,0.35)"}`, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", whiteSpace:"nowrap", flexShrink:0, marginLeft:12 }}>{n.deadline} deadline</span>
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:8, fontSize:11, color:C.muted }}>
                                <span>✉ {n.email}</span>
                                {"phone" in n && n.phone && <span>📞 {n.phone as string}</span>}
                                {n.portal && <span style={{ color:C.accent, cursor:"pointer" }}>↗ Portal</span>}
                                <span>Follow-up: {n.followUp}</span>
                              </div>
                              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                                {n.requiredFields.map((f,fi)=>(
                                  <span key={fi} style={{ background:"var(--secondary)", color:C.muted, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontFamily:"'JetBrains Mono', monospace" }}>{f}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Severity Response SLAs */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                          <span style={{ fontSize:13, color:C.warn }}>⚠</span>
                          <span style={{ fontSize:12, fontWeight:800, color:C.text }}>Severity Response SLAs</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
                          {t.severitySLAs.map((s,i)=>(
                            <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px" }}>
                              <div style={{ marginBottom:8 }}>
                                <span style={{ background:s.color==="#F87171"?"rgba(239,68,68,0.18)":s.color==="#FBBF24"?"rgba(251,191,36,0.18)":"rgba(147,197,253,0.18)", color:s.color, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:800 }}>{s.level}</span>
                              </div>
                              <div style={{ fontSize:11, color:C.muted, lineHeight:1.8 }}>
                                <div>Response: <span style={{ color:C.text, fontWeight:700 }}>{s.response}</span></div>
                                <div>Contain: <span style={{ color:C.text, fontWeight:700 }}>{s.contain}</span></div>
                                <div>Notify: <span style={{ color:s.color, fontWeight:700 }}>{s.notify}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Required Actions */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                          <span style={{ fontSize:13, color:C.green }}>✓</span>
                          <span style={{ fontSize:12, fontWeight:800, color:C.text }}>Required Actions</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:20 }}>
                          {t.requiredActions.map((action,i)=>(
                            <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                              <span style={{ fontSize:11, fontWeight:800, color:C.muted, fontFamily:"'JetBrains Mono', monospace", flexShrink:0, marginTop:1, minWidth:14, textAlign:"right" }}>{i+1}</span>
                              <span style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>{action}</span>
                            </div>
                          ))}
                        </div>

                        {/* Key Contacts + Escalation Matrix side-by-side */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                          {/* Key Contacts */}
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:10 }}>Key Contacts</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                              {t.keyContacts.map((kc,i)=>(
                                <div key={i} style={{ fontSize:11, color:C.muted, display:"flex", gap:6, alignItems:"center" }}>
                                  <span style={{ minWidth:160, color:C.muted }}>{kc.label}:</span>
                                  <span style={{ color:C.text, fontWeight:700 }}>{kc.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Escalation Matrix */}
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:10 }}>Escalation Matrix</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {t.escalation.map((e,i)=>(
                                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                                  <span style={{ background:e.color==="rgb(147,197,253)"?"rgba(147,197,253,0.15)":e.color==="#FBBF24"?"rgba(251,191,36,0.15)":"rgba(239,68,68,0.15)", color:e.color, borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:800, flexShrink:0 }}>{e.level}</span>
                                  <div>
                                    <div style={{ fontSize:11, color:C.text, fontWeight:600 }}>{e.trigger}</div>
                                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Notify: {e.notify}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* CTA button */}
                        <button
                          onClick={() => setIncTab("report")}
                          style={{ background:"linear-gradient(135deg,#0D9488,#0891B2)", color:"#fff", border:"none", borderRadius:8, padding:"11px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.2px" }}
                        >
                          Use This Template — Report Incident
                        </button>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        {tab==="overview" && (
          <>
            <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.10),rgba(59,130,246,0.08))", border:"1px solid rgba(167,139,250,0.28)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13 }}>◆</span>
                <span style={{ fontSize:11, fontWeight:800, color:C.purple, letterSpacing:"0.4px", textTransform:"uppercase" }}>AI ITSM Intelligence</span>
                <span style={{ background:"rgba(167,139,250,0.18)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, padding:"1px 8px", fontSize:9, fontWeight:700, marginLeft:"auto" }}>Live Analysis</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { icon:"⚠", color:C.danger, text:`${p1Open} P1 tickets exceed resolution SLA. MTTR trending 18% above target — incident response playbook review recommended.` },
                  { icon:"◬", color:C.warn,   text:`${problems.filter(p=>p.status==="open").length} open problems represent systemic risk. Root cause analysis completion rate: 62%.` },
                  { icon:"⬡", color:C.teal,   text:`${changes.filter(c=>c.status==="pending"||c.status==="in-review").length} changes in CAB review. AI risk scoring flags CHG-0198 (DB migration) as highest blast-radius change this quarter.` },
                  { icon:"◈", color:C.accent, text:`SLA breach count: ${slaBreaches} this period. AI predicts P2 breach risk on 6 tickets based on current assignee workload.` },
                ].map((ins,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px" }}>
                    <span style={{ color:ins.color, fontSize:13, flexShrink:0, marginTop:1 }}>{ins.icon}</span>
                    <span style={{ fontSize:11, color:C.text, lineHeight:1.5 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:12 }}>
              {([
                { label:"Open Tickets",    value:String(openTickets),    sub:`${tickets.length} total inc. resolved`, color:C.danger, onSelect:()=>setTab("tickets") },
                { label:"P1 Open",         value:String(p1Open),         sub:"Critical — 4h resolution SLA", color:p1Open>0?C.danger:C.green, onSelect:()=>setTab("tickets") },
                { label:"In Progress",     value:String(inProgressT),    sub:"Actively being worked", color:C.warn, onSelect:()=>setTab("tickets") },
                { label:"Changes Pending", value:String(changesPending), sub:`${changes.length-changesPending} approved/done`, color:C.purple, onSelect:()=>setTab("changes") },
                { label:"SLA Breaches",    value:String(slaBreaches),    sub:"Tickets past resolution SLA", color:slaBreaches>0?C.danger:C.green, onSelect:()=>setTab("sla") },
                { label:"Open Problems",   value:String(problems.filter(p=>p.status==="open").length), sub:`${problems.length} total problem records`, color:C.warn, onSelect:()=>setTab("problems") },
              ] as {label:string;value:string;sub:string;color:string;onSelect:()=>void}[]).map(k=>(
                <div key={k.label} onClick={k.onSelect} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.35)")} onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)} style={{ ...card, cursor:"pointer" }}>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:k.color, marginBottom:4 }}>{k.value}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:3 }}>{k.label}</div>
                  <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>Tickets by Category</div>
                {ticketsByCat.map(item=>{
                  const color = catColors[item.cat]??"#9CA3AF";
                  const pct = Math.round((item.count/tickets.length)*100);
                  return (
                    <div key={item.cat} style={{ marginBottom:11 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                        <span style={{ fontWeight:600, color }}>{item.cat}</span>
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:10, color:C.muted }}>{item.count} · {pct}%</span>
                      </div>
                      <div style={{ height:6, borderRadius:4, background:C.bg2, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:4, background:color, width:`${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>SLA Compliance</div>
                {effectiveSlas.map(s=>{
                  const compliance = s.count === 0 ? 100 : 100-Math.round((s.breached/s.count)*100);
                  const ok = compliance >= s.target;
                  return (
                    <div key={s.id} style={{ marginBottom:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                        <div>
                          <span style={{ fontFamily:"'JetBrains Mono', monospace", fontWeight:800, fontSize:12, color:s.color }}>{s.priority}</span>
                          <span style={{ fontSize:10, color:C.text, marginLeft:6, fontWeight:500 }}>{s.name}</span>
                        </div>
                        <span style={{ fontFamily:"'JetBrains Mono', monospace", fontWeight:800, fontSize:13, color:ok?C.green:C.danger }}>{compliance}%</span>
                      </div>
                      <div style={{ height:6, borderRadius:4, background:C.bg2, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:4, background:ok?C.green:C.danger, width:`${compliance}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>Incident Volume — 12 Weeks</div>
                {(()=>{
                  const wkVol = [8,12,7,15,9,11,13,10,8,14,11,9];
                  const wkLabels = ["W1","W2","W3","W4","W5","W6","W7","W8","W9","W10","W11","W12"];
                  const maxV = Math.max(...wkVol);
                  const barH = 72;
                  return (
                    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:barH+24, marginBottom:10 }}>
                      {wkVol.map((v,i)=>{
                        const h = Math.round((v/maxV)*barH);
                        const isCur = i===wkVol.length-1;
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                            <div title={`${wkLabels[i]}: ${v} incidents`} style={{ width:"100%", height:h, borderRadius:"3px 3px 0 0",
                              background:isCur?`linear-gradient(180deg,${C.accent},rgba(147,197,253,0.35))`:v>10?"rgba(251,191,36,0.4)":"rgba(99,179,237,0.22)",
                              border:`1px solid ${isCur?C.accent+"50":v>10?"rgba(251,191,36,0.2)":"rgba(99,179,237,0.12)"}` }} />
                            <span style={{ fontSize:7, color:C.muted }}>{wkLabels[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ display:"flex", gap:10, fontSize:10 }}>
                  <span style={{ color:C.muted }}>Avg: <span style={{ color:C.accent, fontWeight:700 }}>10.6/wk</span></span>
                  <span style={{ color:C.muted }}>Peak: <span style={{ color:C.warn, fontWeight:700 }}>15 (W4)</span></span>
                  <span style={{ color:C.muted, marginLeft:"auto" }}>MTTR: <span style={{ color:C.green, fontWeight:700 }}>4.2h</span></span>
                </div>
              </div>

              <div style={{ ...card, gridColumn:"span 2" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:C.accent }}>MTTR Trend — 12 Months</div>
                  <span style={{ fontSize:10, color:C.green, fontWeight:700 }}>↓ 18% improvement YTD</span>
                </div>
                {(()=>{
                  const mttrData = [6.8,7.1,6.5,5.9,6.2,5.8,5.4,5.1,4.9,4.7,4.4,4.2];
                  const mLabels = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
                  const maxMt = Math.max(...mttrData), minMt = Math.min(...mttrData), rng = maxMt-minMt||1;
                  const w=600, h=60, padL=8, padR=8;
                  const usableW = w-padL-padR;
                  const pts = mttrData.map((v,i)=>`${padL+(i/(mttrData.length-1))*usableW},${h-4-((v-minMt)/rng)*(h-12)}`).join(" ");
                  const areaPath = `M${padL},${h} ${pts.split(" ").map((p,i)=>i===0?`L${p}`:p).join(" ")} L${padL+usableW},${h} Z`;
                  return (
                    <div>
                      <svg width="100%" height={h+24} viewBox={`0 0 ${w} ${h+24}`} preserveAspectRatio="none">
                        {/* Target line at 4h = (4-minMt)/rng */}
                        <line x1={padL} y1={h-4-((4-minMt)/rng)*(h-12)} x2={padL+usableW} y2={h-4-((4-minMt)/rng)*(h-12)}
                          stroke="rgba(52,211,153,0.4)" strokeWidth="1" strokeDasharray="6 4"/>
                        {/* Area fill */}
                        <path d={areaPath} fill="rgba(147,197,253,0.06)"/>
                        {/* Line */}
                        <polyline points={pts} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        {/* Points */}
                        {mttrData.map((v,i)=>{
                          const cx = padL+(i/(mttrData.length-1))*usableW;
                          const cy = h-4-((v-minMt)/rng)*(h-12);
                          return <circle key={i} cx={cx} cy={cy} r="3" fill={C.accent} stroke="var(--card)" strokeWidth="1.5"/>;
                        })}
                        {/* Month labels */}
                        {mLabels.map((m,i)=>{
                          const cx = padL+(i/(mLabels.length-1))*usableW;
                          return <text key={i} x={cx} y={h+18} textAnchor="middle" style={{ fontSize:9, fill:"var(--muted-foreground)" }}>{m}</text>;
                        })}
                      </svg>
                      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, fontSize:9, color:C.muted }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="rgba(52,211,153,0.5)" strokeWidth="1" strokeDasharray="4 3"/></svg>
                          SLA target (4h)
                        </span>
                        <span>Current MTTR: <span style={{ color:C.green, fontWeight:700 }}>4.2h</span></span>
                        <span>Jul baseline: <span style={{ color:C.danger, fontWeight:700 }}>6.8h</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>Change Pipeline</div>
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {([
                    { label:"Approved",  count:changes.filter(c=>c.status==="approved").length,  color:C.green,  bg:"rgba(52,211,153,0.08)" },
                    { label:"In Review", count:changes.filter(c=>c.status==="in-review").length, color:C.warn,   bg:"rgba(251,191,36,0.08)" },
                    { label:"Pending",   count:changes.filter(c=>c.status==="pending").length,   color:C.danger, bg:"rgba(239,68,68,0.08)" },
                    { label:"Done",      count:changes.filter(c=>c.status==="completed").length, color:C.muted,  bg:"var(--secondary)" },
                  ] as {label:string;count:number;color:string;bg:string}[]).map(s=>(
                    <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.color }}>{s.count}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:s.color, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {changes.filter(c=>c.status!=="completed").slice(0,4).map(c=>(
                  <div key={c.id} style={{ padding:"7px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer" }} onClick={()=>setSelChange(c)}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <span style={{ fontSize:11, fontWeight:600, color:C.accent, flex:1 }}>{c.title}</span>
                      <span style={{ fontSize:9, fontWeight:700, background:c.risk==="High"?"rgba(239,68,68,0.08)":c.risk==="Medium"?"rgba(251,191,36,0.08)":"rgba(52,211,153,0.08)", color:c.risk==="High"?C.danger:c.risk==="Medium"?C.warn:C.green, borderRadius:4, padding:"1px 5px", flexShrink:0 }}>{c.risk}</span>
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{c.type} · {c.scheduled}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── TICKETS ─────────────────────────────────────────────────── */}
        {tab==="tickets" && (() => {
          const ft = ticketPriorityFilter === "All" ? tickets : tickets.filter(t => t.priority === ticketPriorityFilter);
          return (
            <>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                {(["All","P1","P2","P3"] as const).map(p=>(
                  <button key={p} onClick={()=>setTicketPriorityFilter(p)}
                    style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", background:"none", fontFamily:"inherit",
                      border:`1.5px solid ${ticketPriorityFilter===p?(p==="P1"?"rgba(239,68,68,0.6)":p==="P2"?"rgba(251,191,36,0.6)":"rgba(99,179,237,0.55)"):"rgba(148,163,184,0.22)"}`,
                      color:ticketPriorityFilter===p?(p==="P1"?"#F87171":p==="P2"?"#FBBF24":"rgb(147,197,253)"):"rgba(148,163,184,0.75)" }}>
                    {p}
                  </button>
                ))}
                {ticketPriorityFilter !== "All" && (
                  <button onClick={()=>setTicketPriorityFilter("All")}
                    style={{ padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#F87171", fontFamily:"inherit" }}>
                    ✕ Clear
                  </button>
                )}
              </div>
              <TableShell
                onRowClick={i=>setSelTicket(ft[i])}
                cols={["ID","Title","Category","Assignee","Priority","SLA","Created","Status"]}
                rows={ft.map(t=>[
                  <Mono>{t.ticketId ?? t.id}</Mono>,
                  <span style={{ fontWeight:600, color:C.accent, fontSize:12 }}>{t.title}</span>,
                  <span style={{ fontSize:11, color:C.muted }}>{t.category ?? t.cat}</span>,
                  t.assignee,
                  (() => { const raw=t.priority??"P4"; const p = raw.startsWith("P1")?"P1":raw.startsWith("P2")?"P2":raw.startsWith("P3")?"P3":"P4"; const b=pBadge[p]; return <span style={{ background:b.bg, color:b.color, border:`1px solid ${b.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{raw}</span>; })(),
                  <Mono>{t.sla}</Mono>,
                  <span style={{ fontSize:11, color:C.muted }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : t.created}</span>,
                  <Badge label={t.status} />,
                ])}
              />
            </>
          );
        })()}

        {/* ── CHANGES — Changes list ─────────────────────────────────── */}
        {tab==="changes" && changeTab==="changes" && (
          <TableShell
            onRowClick={i=>setSelChange(changes[i])}
            cols={["ID","Title","Type","Impact","Risk","Approver","Scheduled","Status"]}
            rows={changes.map(c=>[
              <Mono>{c.changeId}</Mono>,
              <span style={{ fontWeight:600, color:C.accent }}>{c.title}</span>,
              <span style={{ fontSize:11, color:C.muted }}>{c.type}</span>,
              <SevBadge label={c.impact} />,
              <SevBadge label={c.risk} />,
              c.approver,
              <Mono>{c.scheduled}</Mono>,
              <Badge label={c.status} />,
            ])}
          />
        )}

        {/* ── CHANGES — CAB Committee ────────────────────────────────── */}
        {tab==="changes" && changeTab==="cab" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                { label:"Upcoming Reviews", value:"3",  icon:"📋", color:C.accent },
                { label:"Approved This Month", value:"12", icon:"✅", color:C.green },
                { label:"Pending Approval",  value:"5",  icon:"⏳", color:C.warn },
                { label:"Emergency CABs",    value:"1",  icon:"🚨", color:C.danger },
              ].map(s=>(
                <div key={s.label} style={{ ...card, padding:"14px 16px", textAlign:"center" }}>
                  <div style={{ fontSize:11, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginTop:3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                  <span>📅</span> Upcoming CAB Meetings
                </div>
                {[
                  { date:"16 Jun 2026", time:"10:00 AM GST", type:"Standard CAB", chair:"Sarah Chen", changes:3, status:"scheduled" },
                  { date:"23 Jun 2026", time:"02:00 PM GST", type:"Emergency CAB", chair:"Raj Patel", changes:1, status:"scheduled" },
                  { date:"30 Jun 2026", time:"10:00 AM GST", type:"Standard CAB", chair:"Sarah Chen", changes:5, status:"planned" },
                ].map((m,i)=>(
                  <div key={i} style={{ padding:"11px 0", borderBottom:`1px solid ${C.border}`, display:"flex", gap:12, alignItems:"flex-start" }}>
                    <div style={{ background:"rgba(99,179,237,0.10)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:8, padding:"6px 10px", textAlign:"center", flexShrink:0 }}>
                      <div style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:C.accent }}>{m.date.split(" ")[0]}</div>
                      <div style={{ fontSize:9, color:C.muted, fontWeight:700 }}>{m.date.split(" ")[1]} {m.date.split(" ")[2]}</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:m.type.includes("Emergency")?C.danger:C.text, marginBottom:3 }}>{m.type}</div>
                      <div style={{ fontSize:11, color:C.muted }}>Chair: <span style={{ color:C.text }}>{m.chair}</span></div>
                      <div style={{ fontSize:11, color:C.muted }}>{m.time} · {m.changes} change{m.changes>1?"s":""} on agenda</div>
                    </div>
                    <Badge label={m.status} />
                  </div>
                ))}
              </div>
              <div style={{ ...card }}>
                <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                  <span>👥</span> CAB Members
                </div>
                {[
                  { name:"Sarah Chen",     role:"CAB Chair / CISO",          dept:"Security",    status:"active" },
                  { name:"Raj Patel",      role:"IT Director",                dept:"IT Ops",      status:"active" },
                  { name:"Aisha Nakamura", role:"Change Manager",             dept:"ITSM",        status:"active" },
                  { name:"David Kim",      role:"Infrastructure Lead",        dept:"Infra",       status:"active" },
                  { name:"Priya Patel",    role:"DPO / Compliance",           dept:"Legal",       status:"active" },
                  { name:"Marco Rossi",    role:"Software Dev Lead",          dept:"Engineering", status:"active" },
                  { name:"Fatima Al-Sayed",role:"Business Representative",    dept:"Finance",     status:"active" },
                ].map((m,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(99,179,237,0.15)", border:"1px solid rgba(99,179,237,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:C.accent, flexShrink:0 }}>{m.name.split(" ").map(n=>n[0]).join("").slice(0,2)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{m.name}</div>
                      <div style={{ fontSize:10, color:C.muted }}>{m.role} · {m.dept}</div>
                    </div>
                    <Badge label={m.status} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>📋 Changes Pending CAB Approval</div>
              <TableShell
                onRowClick={i=>setSelChange(changes.filter(c=>c.status==="pending"||c.status==="in-review")[i])}
                cols={["ID","Title","Type","Risk","Requester","Scheduled","Status"]}
                rows={changes.filter(c=>c.status==="pending"||c.status==="in-review").map(c=>[
                  <Mono>{c.changeId}</Mono>,
                  <span style={{ fontWeight:600, color:C.accent }}>{c.title}</span>,
                  <span style={{ fontSize:11, color:C.muted }}>{c.type}</span>,
                  <SevBadge label={c.risk} />,
                  c.approver,
                  <Mono>{c.scheduled}</Mono>,
                  <Badge label={c.status} />,
                ])}
              />
            </div>
          </>
        )}

        {/* ── CHANGES — Change Tracker ───────────────────────────────── */}
        {tab==="changes" && changeTab==="tracker" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              {[
                { label:"Total Changes",  value:changes.length, icon:"📊", color:C.accent },
                { label:"Approved",       value:changes.filter(c=>c.status==="approved").length,   icon:"✅", color:C.green },
                { label:"In Review",      value:changes.filter(c=>c.status==="in-review").length,  icon:"🔍", color:C.accent },
                { label:"Pending",        value:changes.filter(c=>c.status==="pending").length,    icon:"⏳", color:C.warn },
                { label:"Completed",      value:changes.filter(c=>c.status==="completed").length,  icon:"🏁", color:C.muted },
              ].map(s=>(
                <div key={s.label} style={{ ...card, padding:"14px 16px", textAlign:"center" }}>
                  <div style={{ fontSize:11, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginTop:3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:16 }}>Change Pipeline — Live Status</div>
              <div style={{ display:"flex", gap:2, marginBottom:20 }}>
                {([
                  { stage:"Submitted",      count:8,  color:"var(--muted-foreground)" },
                  { stage:"CAB Review",     count:5,  color:C.accent },
                  { stage:"Approved",       count:changes.filter(c=>c.status==="approved").length, color:C.green },
                  { stage:"Scheduled",      count:3,  color:"#2DD4BF" },
                  { stage:"In Progress",    count:2,  color:C.warn },
                  { stage:"Completed",      count:changes.filter(c=>c.status==="completed").length, color:"rgba(52,211,153,0.5)" },
                ] as {stage:string;count:number;color:string}[]).map((s,i,arr)=>(
                  <div key={s.stage} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
                    <div style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.color, marginBottom:6 }}>{s.count}</div>
                    <div style={{ width:"100%", height:8, borderRadius:4, background:s.color, opacity:0.85 }} />
                    {i < arr.length-1 && <div style={{ position:"absolute", right:-8, top:26, width:16, height:2, background:C.border, zIndex:1 }} />}
                    <div style={{ fontSize:9, fontWeight:700, color:C.muted, marginTop:6, textAlign:"center" }}>{s.stage}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:14 }}>All Changes — Tracker View</div>
              <TableShell
                onRowClick={i=>setSelChange(changes[i])}
                cols={["ID","Title","Type","Impact","Risk","Approver","Scheduled","Status"]}
                rows={changes.map(c=>[
                  <Mono>{c.changeId}</Mono>,
                  <span style={{ fontWeight:600, color:C.accent }}>{c.title}</span>,
                  <span style={{ fontSize:11, color:C.muted }}>{c.type}</span>,
                  <SevBadge label={c.impact} />,
                  <SevBadge label={c.risk} />,
                  c.approver,
                  <Mono>{c.scheduled}</Mono>,
                  <Badge label={c.status} />,
                ])}
              />
            </div>
          </>
        )}

        {/* ── CHANGES — Change Scenarios ─────────────────────────────── */}
        {tab==="changes" && changeTab==="scenarios" && (
          <>
            <div style={{ background:"linear-gradient(135deg,rgba(45,212,191,0.08),rgba(59,130,246,0.06))", border:"1px solid rgba(45,212,191,0.2)", borderRadius:12, padding:"14px 18px", marginBottom:4 }}>
              <div style={{ fontSize:11, fontWeight:800, color:C.teal, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.4px" }}>◈ Pre-Approved Change Scenarios</div>
              <div style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>Standardised, pre-approved change templates for common, low-risk operations. Use these to bypass full CAB review for routine changes. Each scenario includes pre-defined risk controls, rollback procedures, and approval chains.</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {[
                { id:"CS-001", name:"Patch Tuesday — OS Security Updates",  dept:"IT Operations", risk:"Low",   approvals:"Auto-approved", freq:"Monthly",  icon:"🔒", desc:"Monthly Microsoft/Linux OS patch cycle for all managed endpoints and servers. Tested in staging for 48h before production rollout. Automated rollback via WSUS/Ansible.", controls:["Staging validation 48h prior","Automated rollback","Post-patch health checks","Change window: Sat 02:00-06:00 GST"] },
                { id:"CS-002", name:"SSL Certificate Renewal",               dept:"IT Operations", risk:"Low",   approvals:"Change Manager", freq:"Quarterly",icon:"🔐", desc:"Renewal of SSL/TLS certificates across all production domains. Automated via Let's Encrypt / DigiCert. Zero-downtime deployment with pre/post validation checks.", controls:["72h pre-expiry alert","Automated renewal script","DNS validation check","Rollback: restore previous cert"] },
                { id:"CS-003", name:"Cloud Infrastructure Scaling Event",    dept:"Infrastructure",risk:"Medium",approvals:"Infra Lead + CM",   freq:"On-demand",icon:"☁",  desc:"Horizontal scaling of cloud compute resources in response to load or capacity planning. Uses auto-scaling groups with defined min/max bounds. Reversible within 10 minutes.", controls:["Cost ceiling alert","Load monitoring during scale","Max +50% capacity per event","Auto-revert if health check fails"] },
                { id:"CS-004", name:"Application Configuration Update",      dept:"Engineering",   risk:"Low",   approvals:"Dev Lead + CM",    freq:"As needed",icon:"⚙",  desc:"Non-code configuration changes (feature flags, environment variables, rate limits). Deployed via GitOps pipeline with automated CI validation and blue/green rollout.", controls:["CI pipeline gate","Canary release 5% traffic first","Automated smoke tests","Rollback: git revert + redeploy"] },
                { id:"CS-005", name:"Database Read Replica Promotion",       dept:"Engineering",   risk:"Medium",approvals:"DBA + Infra Lead",  freq:"On-demand",icon:"🗄",  desc:"Promotion of a read replica to primary during failover or planned maintenance. Automated via RDS/PostgreSQL replication with sub-2-minute RTO target.", controls:["Replication lag < 30s","Pre-failover health check","DNS failover automation","Post-promotion integrity check"] },
                { id:"CS-006", name:"User Access Provisioning — New Joiner", dept:"HR/IT",         risk:"Low",   approvals:"HR + Line Manager", freq:"Continuous",icon:"👤", desc:"Standard onboarding access provisioning for new employees. Role-based access via Okta. Follows JIT provisioning policy. Automatically expires temp access at 90-day review.", controls:["RBAC policy enforcement","MFA mandatory on first login","Privileged access requires extra approval","90-day review trigger"] },
                { id:"CS-007", name:"WAF Rule Update — Threat Intelligence", dept:"Security",      risk:"Low",   approvals:"Security Lead",    freq:"Weekly",   icon:"🛡",  desc:"Automated update of WAF deny rules from threat intelligence feeds (MISP, CrowdStrike). Applied in detection mode first for 24h before enforcement mode.", controls:["24h detection-before-block","False positive monitoring","Rollback: disable new rule set","IOC source validation"] },
                { id:"CS-008", name:"Data Retention Policy Execution",       dept:"Compliance",    risk:"Medium",approvals:"DPO + Legal",       freq:"Monthly",  icon:"📁", desc:"Automated deletion/archiving of data past retention period per GDPR/regional policy. Executes via Data Lifecycle Manager with full audit trail and DPO sign-off.", controls:["DPO sign-off required","Full audit log","Soft-delete with 30-day recovery window","ROPA cross-reference validation"] },
              ].map(sc=>(
                <div key={sc.id} style={{ ...card }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:"rgba(45,212,191,0.10)", border:"1px solid rgba(45,212,191,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{sc.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                        <Mono>{sc.id}</Mono>
                        <span style={{ fontSize:12, fontWeight:800, color:C.text }}>{sc.name}</span>
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <span style={{ background:"rgba(45,212,191,0.08)", color:C.teal, border:"1px solid rgba(45,212,191,0.2)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{sc.dept}</span>
                        <SevBadge label={sc.risk} />
                        <span style={{ background:"var(--secondary)", color:C.muted, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{sc.freq}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, lineHeight:1.5, marginBottom:12 }}>{sc.desc}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6 }}>CONTROLS & GUARDRAILS</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {sc.controls.map((ctrl,i)=>(
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"center", fontSize:10, color:C.text }}>
                        <span style={{ color:C.green, fontSize:9 }}>✔</span>{ctrl}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:12, paddingTop:10, borderTop:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:10, color:C.muted }}>Approvals: <span style={{ color:C.text }}>{sc.approvals}</span></span>
                    <button style={{ padding:"4px 12px", borderRadius:5, border:"1px solid rgba(45,212,191,0.35)", background:"rgba(45,212,191,0.07)", color:C.teal, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Use Scenario</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CHANGES — Workflows ────────────────────────────────────── */}
        {tab==="changes" && changeTab==="workflows" && (() => {
          const wfTypes = [
            { key:"normal",    label:"Normal Change — IT",       color:"#FBBF24", icon:"📋" },
            { key:"standard",  label:"Standard Change — IT",     color:"#34D399", icon:"⚡" },
            { key:"emergency", label:"Emergency Change — IT",    color:"#F87171", icon:"🚨" },
            { key:"software",  label:"Software Development",     color:"#A78BFA", icon:"💻" },
            { key:"infra",     label:"Infrastructure",           color:"#2DD4BF", icon:"🏗" },
            { key:"finance",   label:"Finance & Operations",     color:"rgb(147,197,253)", icon:"💰" },
            { key:"hr",        label:"HR & Compliance",          color:"#F9A8D4", icon:"👥" },
          ];
          const workflows: Record<string, { title:string; description:string; sla:string; approvers:string[]; steps:{n:number;phase:string;desc:string;owner:string;sla:string;}[]; riskControls:string[]; rollback:string; }> = {
            normal: {
              title:"Normal Change Workflow — IT",
              description:"Full CAB-reviewed change for significant, non-routine IT changes with medium-to-high impact. Requires planning, risk assessment, and CAB approval before implementation.",
              sla:"5–10 business days",
              approvers:["Change Requester","Change Manager","CAB","IT Director (High risk)"],
              steps:[
                { n:1, phase:"Initiation",   desc:"Change request submitted via ServiceOps. Impact, risk, and rollback plan documented.", owner:"Change Requester", sla:"D0" },
                { n:2, phase:"Assessment",   desc:"Change Manager reviews and assigns risk rating (Low/Medium/High/Critical). Peer technical review scheduled.", owner:"Change Manager", sla:"D0–D1" },
                { n:3, phase:"Planning",     desc:"Full change plan: test plan, rollback procedure, resource requirements, downtime window defined.", owner:"Technical Lead", sla:"D1–D3" },
                { n:4, phase:"CAB Review",   desc:"Presented to Change Advisory Board. Stakeholder impact review. Approval or rejection with documented rationale.", owner:"CAB Chair", sla:"D3–D5" },
                { n:5, phase:"Scheduling",   desc:"Change window confirmed, comms sent to affected users, rollback team on standby.", owner:"Change Manager", sla:"D5–D7" },
                { n:6, phase:"Implementation",desc:"Change executed per approved plan. Live monitoring. Any deviation triggers immediate escalation.", owner:"Technical Lead", sla:"Change Window" },
                { n:7, phase:"Validation",   desc:"Post-implementation review: smoke tests, health checks, user acceptance. Min 1-hour observation window.", owner:"Technical Lead + QA", sla:"Post-change" },
                { n:8, phase:"Closure",      desc:"Change closed in ServiceOps. Lessons learned documented. CMDB updated.", owner:"Change Manager", sla:"D+1" },
              ],
              riskControls:["Mandatory rollback plan","CAB sign-off","Change freeze windows respected","CMDB updated pre/post","Communications 48h prior"],
              rollback:"Documented rollback plan mandatory. Tested in staging. Rollback must complete within 30 minutes of decision.",
            },
            standard: {
              title:"Standard Change Workflow — IT",
              description:"Pre-approved, low-risk, repeatable change from the Change Scenarios catalogue. No CAB review required. Uses a pre-defined, tested procedure with automated controls.",
              sla:"1–2 business days",
              approvers:["Change Manager","Technical Lead (for first use)"],
              steps:[
                { n:1, phase:"Initiation",    desc:"Select matching Standard Change scenario from catalogue. Confirm pre-conditions are met.", owner:"Change Requester", sla:"D0" },
                { n:2, phase:"Auto-Validation",desc:"System validates pre-conditions: environment health, maintenance window availability, no conflicting changes.", owner:"System / Change Manager", sla:"D0 (automated)" },
                { n:3, phase:"Scheduling",    desc:"Confirm change window. Notify stakeholders per template. No individual CAB approval required.", owner:"Change Manager", sla:"D0–D1" },
                { n:4, phase:"Implementation",desc:"Execute using pre-approved runbook. Automated controls enforced (rollback triggers, health checks).", owner:"Technical Executor", sla:"Change Window" },
                { n:5, phase:"Closure",       desc:"Automated post-checks. Change record closed. Any deviations trigger upgrade to Normal Change.", owner:"System + Change Manager", sla:"Post-change" },
              ],
              riskControls:["Pre-conditions must be met","Automated rollback triggers","No conflicting changes in window","Deviation = upgrade to Normal Change"],
              rollback:"Automated rollback triggered if health check fails. Manual rollback option available. Completes within 10 minutes.",
            },
            emergency: {
              title:"Emergency Change Workflow — IT",
              description:"Break-glass procedure for urgent changes required to restore service or prevent critical business impact. Expedited approval with post-implementation review mandatory.",
              sla:"< 4 hours (implementation)",
              approvers:["IT Director or CISO","Emergency CAB (virtual, minimum 2 members)"],
              steps:[
                { n:1, phase:"Declaration",   desc:"Incident or critical risk documented. IT Director or CISO declares Emergency Change. P1/P2 incident ticket linked.", owner:"IT Director / CISO", sla:"Immediate" },
                { n:2, phase:"Emergency CAB", desc:"Virtual Emergency CAB convened (phone/Teams). Minimum 2 CAB members + Change Manager. Risk vs. inaction assessed.", owner:"Emergency CAB", sla:"< 1 hour" },
                { n:3, phase:"Approval",      desc:"Emergency approval granted or denied. If denied, alternative mitigation required. All decisions logged.", owner:"Emergency CAB Chair", sla:"< 1 hour" },
                { n:4, phase:"Implementation",desc:"Change executed immediately. Senior engineer on call. Screen recording / runbook log mandatory.", owner:"Senior Technical Lead", sla:"< 2 hours" },
                { n:5, phase:"Stabilisation", desc:"Enhanced monitoring for 24 hours post-change. SIEM/APM alerts adjusted. On-call engineer remains available.", owner:"Operations Team", sla:"24h post-change" },
                { n:6, phase:"PIR",           desc:"Post-Implementation Review mandatory within 48h. Root cause, timeline, and process improvement documented.", owner:"Change Manager + Team", sla:"D+2" },
              ],
              riskControls:["CEO / CISO awareness for Sev-1","Screen recording mandatory","PIR mandatory within 48h","SIEM alert suppression logged","Change freeze exceptions documented"],
              rollback:"Rollback plan must exist before Emergency CAB approval. Senior engineer on standby. Escalate to CISO if rollback fails.",
            },
            software: {
              title:"Software Development Change Workflow",
              description:"End-to-end change workflow for software releases — features, fixes, and deployments. Follows CI/CD pipeline gates with security scanning, code review, and staged rollout.",
              sla:"Sprint-aligned (2-week cycle) or hotfix < 24h",
              approvers:["Tech Lead / Peer Reviewer","QA Lead","Release Manager","Security (SAST gate)"],
              steps:[
                { n:1, phase:"Development",   desc:"Feature/fix developed in feature branch. Unit tests written. Code coverage minimum 80%.", owner:"Developer", sla:"Sprint" },
                { n:2, phase:"Code Review",   desc:"Peer code review via PR. Security-aware review checklist. Minimum 1 approver (2 for security-sensitive changes).", owner:"Tech Lead / Peer", sla:"1–2 days" },
                { n:3, phase:"CI Pipeline",   desc:"Automated: unit tests, integration tests, SAST scan (SonarQube/Snyk), dependency vulnerability check, container scan.", owner:"CI System", sla:"Automated" },
                { n:4, phase:"Staging Deploy",desc:"Deploy to staging environment. QA team executes functional, regression, and performance tests.", owner:"QA Team", sla:"1–3 days" },
                { n:5, phase:"Security Review",desc:"DAST scan on staging. Critical/High findings must be resolved before production approval. OWASP Top 10 check.", owner:"Security Team", sla:"1–2 days" },
                { n:6, phase:"Release Approval",desc:"Release Manager reviews test results, security sign-off, and business readiness. Go/No-Go decision.", owner:"Release Manager", sla:"D-1" },
                { n:7, phase:"Production Deploy",desc:"Blue/green or canary deployment. Traffic shifted 5% → 25% → 100% over 30 minutes. Automated rollback on error rate spike.", owner:"DevOps / SRE", sla:"Deployment window" },
                { n:8, phase:"Post-Deploy",   desc:"SLO monitoring for 2 hours. Feature flags enable gradual user exposure. Runbook published in KB.", owner:"SRE + PM", sla:"2h post-deploy" },
              ],
              riskControls:["SAST gate — no Critical/High findings","Peer review mandatory","Staging sign-off","Blue/green deployment","Feature flags for gradual rollout","DAST on staging"],
              rollback:"Automated: error rate > 1% triggers canary rollback. Manual: blue/green instant switch. Hotfix path available for critical production issues.",
            },
            infra: {
              title:"Infrastructure Change Workflow",
              description:"Workflow for infrastructure changes: cloud provisioning, network topology, data centre modifications, and platform upgrades. Includes capacity planning and DR validation.",
              sla:"5–15 business days depending on scope",
              approvers:["Infrastructure Lead","Change Manager","CAB","Cloud Architect (cloud-native changes)"],
              steps:[
                { n:1, phase:"Initiation",    desc:"Infrastructure change request. Scope: IaC diff, capacity impact, cost estimate, DR impact documented.", owner:"Infrastructure Engineer", sla:"D0" },
                { n:2, phase:"Architecture Review",desc:"Cloud architect or infra lead reviews design. DR/HA impact assessed. Redundancy and failover validated.", owner:"Cloud Architect", sla:"D1–D3" },
                { n:3, phase:"IaC Validation",desc:"Terraform/Ansible plan reviewed. Drift detection run. Cost impact validated against budget. Security group/policy check.", owner:"DevOps / SRE", sla:"D2–D4" },
                { n:4, phase:"CAB Approval",  desc:"CAB review with infra and security representation. Network changes require CISO sign-off.", owner:"CAB", sla:"D4–D6" },
                { n:5, phase:"Staging Apply", desc:"IaC applied to non-production first. Functional and connectivity tests validated.", owner:"Infrastructure Team", sla:"D6–D8" },
                { n:6, phase:"Production Apply",desc:"Change executed in maintenance window. Monitoring dashboards watched live. DR test post-major changes.", owner:"Infrastructure Team", sla:"Change Window" },
                { n:7, phase:"Validation",    desc:"Health checks: connectivity, latency, throughput. CMDB updated. Cost actuals reviewed vs. estimate.", owner:"SRE + Infra Lead", sla:"Post-change" },
              ],
              riskControls:["IaC-only changes (no console cowboying)","Drift detection before apply","Cost ceiling alerts","DR impact assessment","Change freeze: end of quarter","Network changes require CISO approval"],
              rollback:"IaC state rollback via `terraform apply` previous state. Network changes: automated BGP failback. Data volume changes require DBA supervision.",
            },
            finance: {
              title:"Finance & Operations Change Workflow",
              description:"Workflow for finance system changes: ERP updates, payment gateway modifications, reporting configuration, and financial data migrations. Requires SOX / audit compliance.",
              sla:"10–20 business days",
              approvers:["Finance Director","CFO (high impact)","External Auditor (SOX changes)","Change Manager"],
              steps:[
                { n:1, phase:"Business Case",  desc:"Finance team submits change with business justification, regulatory impact, and SOX/audit implications documented.", owner:"Finance Analyst", sla:"D0–D2" },
                { n:2, phase:"Compliance Check",desc:"DPO and Compliance team review for GDPR, SOX, local tax law implications. External auditor notified for material changes.", owner:"DPO / Compliance", sla:"D2–D5" },
                { n:3, phase:"Technical Review",desc:"IT team reviews ERP/payment system impact. Data integrity controls confirmed. Reconciliation plan documented.", owner:"IT + Finance IT", sla:"D3–D6" },
                { n:4, phase:"UAT",            desc:"User Acceptance Testing by Finance team in UAT environment. Test scenarios cover all regulatory reporting requirements.", owner:"Finance Team + QA", sla:"D5–D10" },
                { n:5, phase:"Dual Approval",  desc:"Finance Director + CFO approval for high-impact. External sign-off for SOX-material changes.", owner:"Finance Director / CFO", sla:"D10–D12" },
                { n:6, phase:"Implementation", desc:"Change window during off-peak (weekend/month-end blackout respected). Finance team on standby.", owner:"IT + Finance", sla:"Change Window" },
                { n:7, phase:"Reconciliation", desc:"Financial reconciliation run pre/post change. Any discrepancy pauses rollout. Audit trail locked.", owner:"Finance Controller", sla:"Post-change" },
              ],
              riskControls:["SOX material change documentation","Month-end / quarter-end blackout periods","Dual control for financial data changes","External auditor notification","Reconciliation pre/post mandatory","Full audit trail"],
              rollback:"Financial rollback requires Finance Director approval. Data rollback from pre-change snapshot. External auditor notified if live data affected.",
            },
            hr: {
              title:"HR & Compliance Change Workflow",
              description:"Workflow for HR system changes, compliance policy updates, and people-data modifications. Covers HRIS updates, policy rollouts, and regulatory compliance changes.",
              sla:"5–15 business days",
              approvers:["CHRO / HR Director","DPO (people data changes)","Legal (policy changes)","Change Manager"],
              steps:[
                { n:1, phase:"HR Initiation",  desc:"HR team submits change request. People data scope, legal basis, and affected employee groups documented.", owner:"HR Business Partner", sla:"D0" },
                { n:2, phase:"Legal & DPO Review",desc:"Legal team reviews for employment law compliance. DPO reviews for GDPR / local data protection law. DPIA if required.", owner:"Legal + DPO", sla:"D1–D4" },
                { n:3, phase:"Policy Approval", desc:"CHRO or HR Director approves policy-level changes. Works council/union consultation where legally required.", owner:"CHRO / HR Director", sla:"D3–D7" },
                { n:4, phase:"System Config",  desc:"HRIS/ATS/payroll system configuration updated in non-production. HR Ops team validates data accuracy.", owner:"HR Ops + IT", sla:"D5–D9" },
                { n:5, phase:"Communication",  desc:"Affected employees notified per employment law requirements. Training materials prepared. Manager briefing scheduled.", owner:"HR Comms", sla:"D8–D11" },
                { n:6, phase:"Go-Live",        desc:"HRIS change activated. Payroll validation run. Employee self-service portal updated.", owner:"HR Ops + IT", sla:"Change Window" },
                { n:7, phase:"Review",         desc:"30-day post-implementation review. Employee feedback collected. Compliance evidence packaged for audit.", owner:"HR + Compliance", sla:"D+30" },
              ],
              riskControls:["GDPR / PDPA employee data controls","Works council consultation where required","DPIA for people analytics changes","Employment law compliance check","Payroll validation pre-go-live","30-day review mandatory"],
              rollback:"Policy rollback requires CHRO approval. HRIS data rollback from backup. Employee notification required for data changes. Legal review of rollback communication.",
            },
          };
          const wf = workflows[workflowType] ?? workflows.normal;
          const wfType = wfTypes.find(w=>w.key===workflowType) ?? wfTypes[0];
          return (
            <>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {wfTypes.map(w=>(
                  <button key={w.key} onClick={()=>setWorkflowType(w.key)} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${workflowType===w.key?`${w.color}55`:C.border}`, background:workflowType===w.key?`${w.color}14`:C.bg2, color:workflowType===w.key?w.color:C.muted, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
                    <span>{w.icon}</span>{w.label}
                  </button>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                <div style={{ ...card, padding:"12px 16px" }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>SLA / Timeline</div>
                  <div style={{ fontSize:13, fontWeight:800, color:wfType.color, fontFamily:"'JetBrains Mono', monospace" }}>{wf.sla}</div>
                </div>
                <div style={{ ...card, padding:"12px 16px" }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Steps</div>
                  <div style={{ fontSize:13, fontWeight:800, color:wfType.color, fontFamily:"'JetBrains Mono', monospace" }}>{wf.steps.length} phases</div>
                </div>
                <div style={{ ...card, padding:"12px 16px" }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Approvers</div>
                  <div style={{ fontSize:13, fontWeight:800, color:wfType.color, fontFamily:"'JetBrains Mono', monospace" }}>{wf.approvers.length} required</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
                <div style={{ ...card }}>
                  <div style={{ fontSize:12, fontWeight:800, color:wfType.color, marginBottom:4 }}>{wfType.icon} {wf.title}</div>
                  <div style={{ fontSize:11, color:C.muted, lineHeight:1.5, marginBottom:16 }}>{wf.description}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                    {wf.steps.map((s,i)=>(
                      <div key={s.n} style={{ display:"flex", gap:14, alignItems:"flex-start", position:"relative" }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:`${wfType.color}22`, border:`2px solid ${wfType.color}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:wfType.color, zIndex:1 }}>{s.n}</div>
                          {i < wf.steps.length-1 && <div style={{ width:2, height:28, background:`${wfType.color}22` }} />}
                        </div>
                        <div style={{ flex:1, paddingBottom:i < wf.steps.length-1 ? 0 : 0, paddingTop:4, paddingLeft:0, marginBottom:12 }}>
                          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                            <span style={{ fontSize:10, fontWeight:800, color:wfType.color, background:`${wfType.color}14`, border:`1px solid ${wfType.color}33`, borderRadius:4, padding:"1px 7px" }}>{s.phase}</span>
                            <span style={{ fontSize:10, color:C.muted }}>Owner: <span style={{ color:C.text, fontWeight:600 }}>{s.owner}</span></span>
                            <span style={{ fontSize:10, fontFamily:"'JetBrains Mono', monospace", color:wfType.color, fontWeight:700 }}>{s.sla}</span>
                          </div>
                          <div style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ ...card }}>
                    <div style={{ fontSize:11, fontWeight:800, color:C.accent, marginBottom:10 }}>Approval Chain</div>
                    {wf.approvers.map((a,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background:"rgba(99,179,237,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:C.accent, flexShrink:0 }}>{i+1}</div>
                        <span style={{ fontSize:11, color:C.text }}>{a}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...card }}>
                    <div style={{ fontSize:11, fontWeight:800, color:C.green, marginBottom:10 }}>Risk Controls</div>
                    {wf.riskControls.map((rc,i)=>(
                      <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:11, color:C.text }}>
                        <span style={{ color:C.green, flexShrink:0, marginTop:1 }}>✔</span>{rc}
                      </div>
                    ))}
                  </div>
                  <div style={{ ...card }}>
                    <div style={{ fontSize:11, fontWeight:800, color:C.warn, marginBottom:8 }}>⏪ Rollback Procedure</div>
                    <div style={{ fontSize:11, color:C.text, lineHeight:1.6 }}>{wf.rollback}</div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ── PROBLEMS ────────────────────────────────────────────────── */}
        {tab==="problems" && (
          <TableShell
            onRowClick={i=>setSelProblem(problems[i])}
            cols={["ID","Problem","Category","Root Cause","Affected","Opened","Status"]}
            rows={problems.map(p=>[
              <Mono>{p.id}</Mono>,
              <span style={{ fontWeight:600, color:C.accent }}>{p.title}</span>,
              <span style={{ fontSize:11, color:C.muted }}>{p.category}</span>,
              <span style={{ fontSize:11, color:C.text, maxWidth:280, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.rootCause}</span>,
              <Mono>{p.affected}</Mono>,
              <Mono>{p.opened}</Mono>,
              <Badge label={p.status} />,
            ])}
          />
        )}

        {/* ── CMDB ────────────────────────────────────────────────────── */}
        {tab==="cmdb" && (
          <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
            {/* CMDB sub-tabs */}
            <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, background:"rgba(0,0,0,0.2)" }}>
              {[{k:"list",l:"CI List"},{k:"graph",l:"Dependency Graph"},{k:"impact",l:"Change Impact"}].map(t=>(
                <button key={t.k} onClick={()=>setCmdbSubTab(t.k)} style={{ padding:"8px 18px", background:"none", border:"none", borderBottom:`2px solid ${cmdbSubTab===t.k?C.accent:"transparent"}`, color:cmdbSubTab===t.k?C.accent:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"color 0.15s" }}>{t.l}</button>
              ))}
            </div>

            {/* CI List sub-tab */}
            {cmdbSubTab==="list" && (
              <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
                <div style={{ flex:1, overflow:"auto" }}>
                  <TableShell
                    onRowClick={i=>setSelCI(selCI?.id===cmdb[i]?.id?null:cmdb[i])}
                    cols={["CI ID","Name","Type","OS / Version","Owner","Env","Criticality","Vulns","Patch","Status"]}
                    rows={cmdb.map(ci=>[
                      <Mono>{ci.id}</Mono>,
                      <span style={{ fontWeight:700, color:C.accent, fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{ci.name}</span>,
                      <span style={{ fontSize:11, color:C.muted }}>{ci.type}</span>,
                      <span style={{ fontSize:11, color:C.text }}>{ci.os}</span>,
                      ci.owner,
                      <span style={{ background:ci.env==="Production"?"rgba(59,130,246,0.12)":"var(--secondary)", color:ci.env==="Production"?C.accent:C.muted, border:`1px solid ${ci.env==="Production"?"rgba(99,179,237,0.3)":C.border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{ci.env}</span>,
                      <SevBadge label={ci.criticality} />,
                      <span style={{ color:ci.vulnerabilities>0?C.danger:C.green, fontWeight:700, fontSize:11 }}>{ci.vulnerabilities}</span>,
                      <span style={{ fontSize:10, color:ci.patch==="Current"?C.green:ci.patch==="Pending"?C.warn:C.danger, fontWeight:700 }}>{ci.patch}</span>,
                      <Badge label={ci.status} />,
                    ])}
                  />
                </div>
                {selCI && (
                  <div style={{ width:280, borderLeft:`1px solid ${C.border}`, overflowY:"auto", padding:"16px", flexShrink:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:C.accent }}>{selCI.name}</div>
                      <button onClick={()=>setSelCI(null)} style={{ width:22, height:22, borderRadius:4, border:`1px solid ${C.border}`, background:"none", cursor:"pointer", color:C.muted, fontSize:14, fontWeight:800, lineHeight:1 }}>×</button>
                    </div>
                    {[["CI ID",selCI.id],["Type",selCI.type],["OS / Version",selCI.os],["Environment",selCI.env],["Owner",selCI.owner],["Criticality",selCI.criticality],["Vulnerabilities",selCI.vulnerabilities],["Patch Status",selCI.patch],["Status",selCI.status]].map(([k,v])=>(
                      <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                        <span style={{ color:C.muted, fontWeight:600 }}>{k}</span>
                        <span style={{ color:C.text, fontWeight:700, textAlign:"right", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", fontFamily:String(v).startsWith("CI-")?"'JetBrains Mono',monospace":"inherit" }}>{String(v)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:14 }}>
                      <div style={{ fontSize:10, fontWeight:800, color:C.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.6px" }}>Downstream Dependencies</div>
                      {ciEdges.filter(e=>e.source===selCI.id).length===0
                        ? <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>No downstream CIs</div>
                        : ciEdges.filter(e=>e.source===selCI.id).map(e=>(
                          <div key={e.id} style={{ display:"flex", gap:6, padding:"3px 0", fontSize:11 }}>
                            <span style={{ color:C.accent, fontSize:9 }}>→</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.accent }}>{e.target}</span>
                            <span style={{ fontSize:10, color:C.muted }}>({cmdb.find(c=>c.id===e.target)?.name||"?"})</span>
                          </div>
                        ))}
                    </div>
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:10, fontWeight:800, color:C.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.6px" }}>Upstream Dependencies</div>
                      {ciEdges.filter(e=>e.target===selCI.id).length===0
                        ? <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>No upstream CIs</div>
                        : ciEdges.filter(e=>e.target===selCI.id).map(e=>(
                          <div key={e.id} style={{ display:"flex", gap:6, padding:"3px 0", fontSize:11 }}>
                            <span style={{ color:"#A78BFA", fontSize:9 }}>←</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#A78BFA" }}>{e.source}</span>
                            <span style={{ fontSize:10, color:C.muted }}>({cmdb.find(c=>c.id===e.source)?.name||"?"})</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dependency Graph sub-tab */}
            {cmdbSubTab==="graph" && (
              <div style={{ flex:1, position:"relative", minHeight:650 }}>
                <ReactFlow
                  nodes={cmdb.map(ci=>({
                    id: ci.id,
                    position: CI_POSITIONS[ci.id]??{x:0,y:0},
                    data: { label: (
                      <div style={{ textAlign:"left" }}>
                        <div style={{ fontSize:8, color:CI_TYPE_COLORS[ci.type]||C.muted, fontWeight:800, marginBottom:1 }}>{ci.type.toUpperCase()}</div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.text, whiteSpace:"nowrap" }}>{ci.name}</div>
                        <div style={{ fontSize:8, color:C.muted }}>{ci.id}</div>
                      </div>
                    )},
                    style:{ background:"var(--card)", border:`2px solid ${(CI_TYPE_COLORS[ci.type]||"#6B7280")+"44"}`, borderRadius:8, padding:"6px 10px", minWidth:135, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" },
                  }))}
                  edges={ciEdges.map(e=>({...e, animated:false, style:{stroke:"rgba(147,197,253,0.3)",strokeWidth:1.5}, markerEnd:{type:MarkerType.ArrowClosed,color:"rgba(147,197,253,0.4)"}}))}
                  onNodeClick={(_,node)=>{ const ci=cmdb.find(c=>c.id===node.id); if(ci) setSelCI(ci); }}
                  fitView fitViewOptions={{ padding:0.12 }}
                >
                  <Background color="rgba(255,255,255,0.04)" gap={22} />
                  <Controls />
                  <MiniMap style={{ background:"var(--secondary)", border:`1px solid ${C.border}` }} nodeColor={n=>CI_TYPE_COLORS[cmdb.find(c=>c.id===n.id)?.type||""]||"#6B7280"} />
                </ReactFlow>
                {selCI && (
                  <div style={{ position:"absolute", right:16, top:16, width:240, background:"var(--card)", border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px", zIndex:10, boxShadow:"0 4px 20px rgba(0,0,0,0.6)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:C.accent }}>{selCI.name}</div>
                      <button onClick={()=>setSelCI(null)} style={{ width:20, height:20, borderRadius:3, border:"none", background:"none", cursor:"pointer", color:C.muted, fontSize:14, fontWeight:800, lineHeight:1 }}>×</button>
                    </div>
                    {[["ID",selCI.id],["Type",selCI.type],["Env",selCI.env],["Owner",selCI.owner],["Criticality",selCI.criticality],["Status",selCI.status]].map(([k,v])=>(
                      <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}`, fontSize:10 }}>
                        <span style={{ color:C.muted }}>{k}</span><span style={{ color:C.text, fontWeight:700 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Change Impact Analysis sub-tab */}
            {cmdbSubTab==="impact" && (() => {
              function getDownstream(id, visited = new Set()) {
                if (visited.has(id)) return [];
                visited.add(id);
                const direct = ciEdges.filter(e=>e.source===id).map(e=>e.target);
                return [...direct, ...direct.flatMap(d=>getDownstream(d, new Set(visited)))];
              }
              const downstream = impactCI ? [...new Set(getDownstream(impactCI))] : [];
              const sourceCI = cmdb.find(ci=>ci.id===impactCI);
              return (
                <div style={{ flex:1, overflow:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ ...card, display:"flex", gap:16, alignItems:"flex-end" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>Select Configuration Item</div>
                      <select value={impactCI} onChange={e=>setImpactCI(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:12, background:C.bg2, color:C.text, fontFamily:"inherit", outline:"none" }}>
                        <option value="">— Select a CI —</option>
                        {cmdb.map(ci=><option key={ci.id} value={ci.id}>{ci.id} — {ci.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>Change Type</div>
                      <select value={impactType} onChange={e=>setImpactType(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:7, border:`1px solid ${C.border}`, fontSize:12, background:C.bg2, color:C.text, fontFamily:"inherit", outline:"none" }}>
                        {["Patch","Config Change","Upgrade","Restart","Decommission"].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {impactCI && sourceCI && (
                    <>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                        {[{l:"Downstream CIs",v:downstream.length,c:downstream.length>5?C.danger:downstream.length>2?C.warn:C.green},{l:"Blast Radius",v:downstream.length>5?"Critical":downstream.length>2?"High":"Low",c:downstream.length>5?C.danger:downstream.length>2?C.warn:C.green},{l:"CI Criticality",v:sourceCI.criticality,c:sourceCI.criticality==="Critical"?C.danger:sourceCI.criticality==="High"?C.warn:C.green}].map(s=>(
                          <div key={s.l} style={{ ...card, textAlign:"center" }}>
                            <div style={{ fontSize:22, fontWeight:800, color:s.c, marginBottom:4 }}>{s.v}</div>
                            <div style={{ fontSize:11, color:C.muted }}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                      {downstream.length > 0 && (
                        <div style={{ ...card }}>
                          <div style={{ fontSize:11, fontWeight:800, color:C.accent, marginBottom:12 }}>Affected Downstream Services — {impactType} on {sourceCI.name}</div>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                            <thead>
                              <tr style={{ background:"var(--secondary)" }}>
                                {["CI ID","Name","Type","Criticality","Impact from "+impactType].map(h=>(
                                  <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {downstream.map(id=>{
                                const ci = cmdb.find(c=>c.id===id);
                                const impact = impactType==="Decommission"?"Service unavailable":impactType==="Restart"?"Temporary service interruption":impactType==="Upgrade"?"Potential compatibility break":impactType==="Config Change"?"Config drift possible":"Maintenance window required";
                                return ci ? (
                                  <tr key={id} style={{ borderBottom:`1px solid ${C.border}` }}>
                                    <td style={{ padding:"7px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.accent }}>{ci.id}</td>
                                    <td style={{ padding:"7px 12px", fontWeight:600 }}>{ci.name}</td>
                                    <td style={{ padding:"7px 12px", color:C.muted }}>{ci.type}</td>
                                    <td style={{ padding:"7px 12px" }}><SevBadge label={ci.criticality} /></td>
                                    <td style={{ padding:"7px 12px", color:impactType==="Decommission"||impactType==="Restart"?C.danger:C.warn, fontWeight:600 }}>{impact}</td>
                                  </tr>
                                ) : null;
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {downstream.length === 0 && (
                        <div style={{ ...card, textAlign:"center", padding:"32px", color:C.green }}>
                          <div style={{ fontSize:22, marginBottom:8 }}>✓</div>
                          <div style={{ fontSize:13, fontWeight:700 }}>No Downstream Dependencies</div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{sourceCI.name} has no downstream CI dependencies. Impact is isolated to this CI only.</div>
                        </div>
                      )}
                      {(() => {
                        const allCIs = [impactCI, ...downstream];
                        const related = changes.filter(ch => allCIs.some(id => (ciChangeLinks[id]||[]).includes(ch.changeId)));
                        if (related.length === 0) return null;
                        return (
                          <div style={{ ...card }}>
                            <div style={{ fontSize:11, fontWeight:800, color:C.warn, marginBottom:12 }}>⚡ Open Change Requests Touching Affected CIs ({related.length})</div>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                              <thead>
                                <tr style={{ background:"var(--secondary)" }}>
                                  {["Change ID","Title","Type","Impact","Risk","Status","Approver","Scheduled"].map(h=>(
                                    <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" as const }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {related.map(ch=>(
                                  <tr key={ch.changeId} style={{ borderBottom:`1px solid ${C.border}` }}>
                                    <td style={{ padding:"7px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.accent, fontWeight:700 }}>{ch.changeId}</td>
                                    <td style={{ padding:"7px 12px", fontWeight:600, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{ch.title}</td>
                                    <td style={{ padding:"7px 12px", color:C.muted }}>{ch.type}</td>
                                    <td style={{ padding:"7px 12px" }}><SevBadge label={ch.impact} /></td>
                                    <td style={{ padding:"7px 12px" }}><Badge label={ch.risk} /></td>
                                    <td style={{ padding:"7px 12px" }}>
                                      <span style={{ background:ch.status==="approved"?"rgba(52,211,153,0.08)":ch.status==="pending"?"rgba(245,158,11,0.07)":ch.status==="in-review"?"rgba(99,179,237,0.08)":"rgba(107,114,128,0.08)", color:ch.status==="approved"?C.green:ch.status==="pending"?C.warn:ch.status==="in-review"?C.accent:C.muted, border:`1px solid ${ch.status==="approved"?"#A7F3D0":ch.status==="pending"?"#FDE68A":ch.status==="in-review"?"rgba(99,179,237,0.3)":C.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, textTransform:"capitalize" as const }}>{ch.status}</span>
                                    </td>
                                    <td style={{ padding:"7px 12px", color:C.muted }}>{ch.approver}</td>
                                    <td style={{ padding:"7px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.muted }}>{ch.scheduled}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── SLA ─────────────────────────────────────────────────────── */}
        {tab==="sla" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {effectiveSlas.map(s=>{
              const compliance = s.count === 0 ? 100 : 100-Math.round((s.breached/s.count)*100);
              const ok = compliance >= s.target;
              return (
                <div key={s.id} style={{ ...card, display:"flex", alignItems:"center", gap:24 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:`${s.color}22`, border:`1px solid ${s.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:s.color, flexShrink:0 }}>{s.priority}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:4 }}>{s.name}</div>
                    <div style={{ display:"flex", gap:16, fontSize:11, color:C.muted, marginBottom:8 }}>
                      <span>Response: <strong style={{ color:C.text, fontFamily:"'JetBrains Mono', monospace" }}>{s.response}</strong></span>
                      <span>Resolution: <strong style={{ color:C.text, fontFamily:"'JetBrains Mono', monospace" }}>{s.resolution}</strong></span>
                      <span>Total: <strong style={{ color:C.text }}>{s.count}</strong> tickets</span>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:C.bg2, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:4, background:ok?C.green:C.danger, width:`${compliance}%`, transition:"width 0.4s" }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:10, color:C.muted }}>
                      <span>Target: {s.target}%</span>
                      <span>Actual: <strong style={{ color:ok?C.green:C.danger }}>{compliance}%</strong></span>
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, minWidth:90 }}>
                    <div style={{ fontSize:24, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:s.breached>0?C.danger:C.green }}>{s.breached}</div>
                    <div style={{ fontSize:10, color:C.muted }}>SLA Breaches</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, minWidth:70 }}>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:ok?C.green:C.danger }}>{compliance}%</div>
                    <div style={{ fontSize:10, color:C.muted }}>Compliance</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── KNOWLEDGE BASE ───────────────────────────────────────────── */}
        {tab==="kb" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {selKbArticle ? (
              <div style={{ flex:1, overflow:"auto", padding:"16px 24px", display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <button onClick={()=>setSelKbArticle(null)} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${C.border}`, background:"none", color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>← Back to Library</button>
                  <span style={{ background:"rgba(99,179,237,0.10)", color:C.accent, border:"1px solid rgba(99,179,237,0.2)", borderRadius:6, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{selKbArticle.category}</span>
                  <span style={{ fontSize:11, color:C.muted, marginLeft:"auto" }}>{(selKbArticle.views||0).toLocaleString()} views · {selKbArticle.helpful||0}% helpful</span>
                </div>
                <div style={{ ...card }}>
                  <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:10, lineHeight:1.3 }}>{selKbArticle.title}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:16 }}>
                    {(selKbArticle.tags||"").split(",").filter(Boolean).map(tag=>(
                      <span key={tag} style={{ background:"rgba(124,58,237,0.08)", color:C.purple, border:"1px solid rgba(124,58,237,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:600 }}>{tag.trim()}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.8 }}>{selKbArticle.content||selKbArticle.excerpt}</div>
                </div>
                <div style={{ ...card, display:"flex", gap:12, alignItems:"center" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.text }}>Was this article helpful?</div>
                  <button style={{ padding:"6px 16px", borderRadius:6, border:`1px solid ${C.green}44`, background:"rgba(52,211,153,0.08)", color:C.green, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>👍 Yes</button>
                  <button style={{ padding:"6px 16px", borderRadius:6, border:`1px solid ${C.border}`, background:"none", color:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>👎 No</button>
                  <div style={{ marginLeft:"auto", fontSize:11, color:C.muted }}>{selKbArticle.helpful||0}% found this helpful · <Mono>{selKbArticle.articleId||selKbArticle.id}</Mono></div>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:C.accent, marginBottom:10 }}>Related Articles</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                    {kbArticles.filter(a=>a.id!==selKbArticle.id&&a.category===selKbArticle.category).slice(0,3).map(a=>(
                      <div key={a.id} onClick={()=>setSelKbArticle(a)} style={{ ...card, cursor:"pointer", padding:"12px 14px" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(99,179,237,0.35)"}
                        onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=C.border}>
                        <div style={{ fontSize:10, fontWeight:700, color:C.accent, marginBottom:5 }}>{a.category}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:C.text, lineHeight:1.4 }}>{a.title}</div>
                        <div style={{ fontSize:10, color:C.muted, marginTop:5 }}>{(a.views||0).toLocaleString()} views · {a.helpful||0}% helpful</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex:1, overflow:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
                {(() => {
                  const allModules = ["All",...[...new Set(kbArticles.map((a:any)=>a.module||"").filter(Boolean))]].sort((a,b)=>a==="All"?-1:b==="All"?1:a.localeCompare(b));
                  const allFws = ["All",...[...new Set(kbArticles.flatMap((a:any)=>(a.framework||"").split(",").map((s:string)=>s.trim()).filter(Boolean)))]].sort((a,b)=>a==="All"?-1:b==="All"?1:a.localeCompare(b));
                  const displayed = filteredKb.filter(a=>{
                    const fws = (a.framework||"").split(",").map((s:string)=>s.trim()).filter(Boolean);
                    const catOk = kbTag==="All"||a.category===kbTag;
                    const modOk = kbModule==="All"||a.module===kbModule;
                    const fwOk  = kbFw==="All"||fws.includes(kbFw);
                    return catOk && modOk && fwOk;
                  });
                  return (
                    <>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <input value={kbSearch} onChange={e=>setKbSearch(e.target.value)} placeholder="Search knowledge base articles…"
                          style={{ flex:1, padding:"9px 14px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit", background:C.bg2, color:C.text, outline:"none" }}
                        />
                        <span style={{ fontSize:12, color:C.muted, whiteSpace:"nowrap" }}>{displayed.length} articles</span>
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Category</div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                          {(["All",...[...new Set(kbArticles.map(a=>a.category))]]).filter(Boolean).map(cat=>(
                            <button key={cat} onClick={()=>setKbTag(cat)} style={{ padding:"3px 11px", borderRadius:20, border:`1px solid ${kbTag===cat?C.accent:C.border}`, background:kbTag===cat?"rgba(99,179,237,0.12)":"none", color:kbTag===cat?C.accent:C.muted, fontSize:10, fontWeight:kbTag===cat?700:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>{cat}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Module</div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                          {allModules.map(mod=>(
                            <button key={mod} onClick={()=>setKbModule(mod)} style={{ padding:"3px 11px", borderRadius:20, border:`1px solid ${kbModule===mod?"#A78BFA":C.border}`, background:kbModule===mod?"rgba(124,58,237,0.10)":"none", color:kbModule===mod?"#A78BFA":C.muted, fontSize:10, fontWeight:kbModule===mod?700:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>{mod}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Framework</div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                          {allFws.map(fw=>(
                            <button key={fw} onClick={()=>setKbFw(fw)} style={{ padding:"3px 11px", borderRadius:20, border:`1px solid ${kbFw===fw?"#34D399":C.border}`, background:kbFw===fw?"rgba(52,211,153,0.08)":"none", color:kbFw===fw?C.green:C.muted, fontSize:10, fontWeight:kbFw===fw?700:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>{fw}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        {displayed.map(a=>(
                          <div key={a.id} onClick={()=>setSelKbArticle(a)} style={{ ...card, cursor:"pointer", transition:"border-color 0.15s" }}
                            onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(99,179,237,0.35)"}
                            onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=C.border}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                              <span style={{ background:"rgba(99,179,237,0.10)", color:C.accent, border:"1px solid rgba(99,179,237,0.2)", borderRadius:6, padding:"2px 8px", fontSize:9, fontWeight:700 }}>{a.category}</span>
                              <span style={{ fontSize:9, color:C.muted, marginLeft:"auto" }}>{(a.views||0).toLocaleString()} views · {a.helpful||0}% helpful</span>
                            </div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:6, lineHeight:1.4 }}>{a.title}</div>
                            <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{a.excerpt}</div>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}` }}>
                              <Mono>{a.articleId||a.id}</Mono>
                              <span style={{ fontSize:10, color:C.muted }}>Updated {a.lastUpdated||""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

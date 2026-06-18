// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { SubNav, ModuleHeader, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { Drawer, Field, DrawerSection, AiInsightBox } from "@/components/Drawer";
import { useOrg } from "@/context/OrgContext";

const BLU = "rgb(147,197,253)";
const EME = "#34D399";
const AMB = "#FBBF24";
const RED = "#F87171";
const PRP = "#C084FC";
const ORG = "#FB923C";
const CARD = "var(--card)";

function apiUrl(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H() { return { Authorization: `Bearer ${tok()}` }; }

/* ─── Interfaces ─── */
interface AuditFinding {
  id: string; title: string; severity: string; status: string; category: string;
  control?: string; auditPlan?: string; owner?: string; dueDate?: string;
  description?: string; recommendation?: string; management_response?: string;
  aiInsights?: string[];
}
interface AuditPlan {
  id: string; name: string; type: string; status: string; scope?: string;
  startDate?: string; endDate?: string; auditor?: string; framework?: string;
  progress?: number; findings?: number; aiInsights?: string[];
}
interface ReportTemplate {
  id: string; name: string; framework: string; region: string; category: string;
  description: string; sections: string[]; estimatedPages: number;
  formats: string[]; tags: string[]; popular?: boolean;
}
interface MyReport {
  id: string; name: string; framework: string; region: string; generatedBy: string;
  generatedAt: string; format: string; size: string;
  status: "completed" | "failed" | "in-progress" | "pending" | "overdue";
  error?: string; recipients: string[]; audience: string; freq: string;
  nextDue?: string; progress?: number;
}
interface ScheduledReport {
  id: string; name: string; templateId: string; framework: string;
  frequency: string; nextRun: string; lastRun?: string;
  lastStatus?: "completed" | "failed"; status: "active" | "paused" | "error";
  recipients: string[]; format: string; createdBy: string;
}

/* ─── Static Data ─── */
const STATIC_FINDINGS: AuditFinding[] = [
  { id:"AF-001", title:"MFA not enforced on 12 privileged accounts", severity:"Critical", status:"open", category:"IAM", control:"A.8.5", auditPlan:"AUD-Q1-2026", owner:"IT Security", dueDate:"2026-06-30", description:"Privileged account review identified 12 admin accounts without MFA enabled, violating IAM policy and ISO 27001 A.8.5.", recommendation:"Enforce MFA via Conditional Access policy within 14 days.", management_response:"IT Security team to deploy MFA rollout by 28 June. Compensating control: enhanced monitoring active.", aiInsights:["12 accounts represent 8% of privileged users — critical attack surface.","Historical pattern: 3 similar findings in past 18 months — systematic control gap.","AI: automated MFA enforcement via policy engine would prevent recurrence.","Risk if unresolved: estimated 74% credential-based attack success rate."] },
  { id:"AF-002", title:"AWS S3 bucket acme-backups-prod publicly accessible", severity:"Critical", status:"open", category:"Cloud", control:"A.5.14", auditPlan:"AUD-Q1-2026", owner:"Cloud Ops", dueDate:"2026-06-18", description:"CSPM scan detected public ACL on production backup bucket. Data classification: Confidential.", recommendation:"Remove public ACL immediately, apply bucket policy restricting to VPC endpoints only.", management_response:"Cloud team investigating scope. Remediation expected within 72 hours.", aiInsights:["Bucket contains 847 GB of encrypted backup data — exposure window: 34 days.","GDPR Article 32 violation risk if personal data included — DPO notified.","AI: automated S3 bucket policy enforcement via IaC would prevent this class of finding.","Similar finding on 2 dev buckets resolved in March 2026."] },
  { id:"AF-003", title:"Incomplete SOC 2 evidence for CC6.1 control", severity:"High", status:"in-review", category:"Compliance", control:"CC6.1", auditPlan:"AUD-SOC2-2026", owner:"Compliance", dueDate:"2026-07-15", description:"SOC 2 Type II audit evidence package for CC6.1 is missing 4 of 12 required artefacts.", recommendation:"Complete evidence collection and upload to audit portal.", management_response:"Priya Patel assigned as evidence owner. Collection deadline: 12 July 2026.", aiInsights:["4 missing artefacts represent 33% of CC6.1 evidence — auditor may qualify opinion.","SOC 2 audit report scheduled for 31 July 2026 — 16 days to close.","AI: automated evidence collection from SIEM and IAM tools would address 3 of 4 gaps."] },
  { id:"AF-004", title:"Patch cycle SLA breach — 47 servers >90 days unpatched", severity:"High", status:"open", category:"Vulnerability", control:"A.8.8", auditPlan:"AUD-Q1-2026", owner:"IT Ops", dueDate:"2026-06-25", description:"Vulnerability scan identified 47 servers with critical patches outstanding for more than 90 days, exceeding the 30-day SLA.", recommendation:"Prioritise and schedule emergency patching for all 47 servers.", management_response:"IT Ops scheduling emergency maintenance windows. 12 servers patched as of 14 June.", aiInsights:["47 servers include 3 domain controllers and 2 Tier-1 applications — highest priority.","CVE-2024-21338 (CVSS 9.8) present on 8 servers — actively exploited in the wild.","AI: automated patching pipeline would reduce mean-time-to-patch by 68%."] },
  { id:"AF-005", title:"GDPR DPIA not completed for Customer Analytics Platform", severity:"High", status:"open", category:"Privacy", control:"GDPR Art.35", auditPlan:"AUD-GDPR-2026", owner:"DPO", dueDate:"2026-07-01", description:"Customer Analytics Platform v2 launched without a Data Protection Impact Assessment.", recommendation:"Conduct DPIA immediately. Engage DPO and Legal.", management_response:"DPO Priya Patel has initiated DPIA process. Workshops scheduled for 18-19 June 2026.", aiInsights:["DPIA is required for large-scale processing of behavioural data — regulatory obligation.","ICO supervisory authority notification risk if data breach occurs before DPIA complete."] },
  { id:"AF-006", title:"Vendor SLA reporting absent for 8 critical suppliers", severity:"Medium", status:"open", category:"3rd Party", control:"A.5.19", auditPlan:"AUD-Q1-2026", owner:"Procurement", dueDate:"2026-07-30", description:"8 critical-tier vendors have not submitted SLA performance reports for Q1 2026.", recommendation:"Issue formal notice to 8 vendors. Update vendor management framework.", management_response:"Procurement team issuing notices. Vendor portal to be updated with automated reporting.", aiInsights:["8 vendors include 2 cloud infrastructure providers and 1 SOC provider — high impact.","AI: vendor portal with automated SLA data ingestion would reduce overhead by ~40%."] },
  { id:"AF-007", title:"Business Continuity Plan not tested in 18 months", severity:"Medium", status:"in-review", category:"BCP", control:"A.5.30", auditPlan:"AUD-BCP-2026", owner:"IT Ops", dueDate:"2026-08-01", description:"Last BCP tabletop exercise was conducted in November 2024. ISO 27001 requires annual testing.", recommendation:"Schedule BCP tabletop exercise within 30 days.", management_response:"BCP exercise scheduled for 25 July 2026.", aiInsights:["18 months without testing exceeds ISO 27001 and internal policy requirements.","Infrastructure changes since last test: migration to AWS (3 systems), new SaaS tools (7)."] },
  { id:"AF-008", title:"Privileged access review not completed for Q1 2026", severity:"Medium", status:"closed", category:"IAM", control:"A.8.2", auditPlan:"AUD-Q1-2026", owner:"IT Security", dueDate:"2026-04-30", description:"Quarterly privileged access review for Q1 2026 was 12 days late. 4 accounts identified for revocation.", management_response:"Access review completed. 4 accounts revoked. Process updated.", aiInsights:["Late completion creates an access risk window.","AI: automated access certification workflow would eliminate manual review delays."] },
  { id:"AF-009", title:"Security awareness training completion below 85% target", severity:"Low", status:"in-review", category:"Awareness", control:"A.6.3", auditPlan:"AUD-Q1-2026", owner:"HR Security", dueDate:"2026-07-31", description:"Annual security awareness training completion rate is 81% as of June 2026, below the 85% target.", recommendation:"Issue manager escalation. Consider mandatory completion before access renewal.", management_response:"HR team issuing reminders. Manager escalation email dispatched 13 June 2026.", aiInsights:["Operations (74%) and Sales (77%) have lowest completion rates.","Phishing simulation click rate: 8% — industry average 11% — positive indicator."] },
];

const STATIC_PLANS: AuditPlan[] = [
  { id:"AUD-Q1-2026",   name:"Q1 2026 Internal Audit",          type:"Internal",  status:"in-progress", scope:"ISO 27001 Controls A.5–A.8",           startDate:"2026-03-01", endDate:"2026-06-30", auditor:"Sarah Chen",       framework:"ISO 27001",    progress:78, findings:6, aiInsights:["6 findings raised — 2 critical, 2 high, 2 medium.","Evidence collection 78% complete — on track for Q2 close.","AI: 3 control areas trending to failure — proactive review recommended."] },
  { id:"AUD-SOC2-2026", name:"SOC 2 Type II Audit 2026",         type:"External",  status:"in-progress", scope:"Trust Service Criteria CC1–CC9",         startDate:"2026-01-01", endDate:"2026-12-31", auditor:"Ernst & Young",    framework:"SOC 2",        progress:45, findings:1, aiInsights:["1 open finding: incomplete evidence for CC6.1 — must close before 31 July.","Last year's Type II opinion: Qualified — target unqualified for 2026."] },
  { id:"AUD-GDPR-2026", name:"GDPR Compliance Review Q2 2026",   type:"Internal",  status:"in-progress", scope:"GDPR Articles 12–49, DPIA, RoPA",       startDate:"2026-04-01", endDate:"2026-06-30", auditor:"Priya Patel",      framework:"GDPR",         progress:60, findings:2, aiInsights:["2 open findings including unresolved DPIA gap.","ICO engagement planned for Q3 2026 — all findings must be closed."] },
  { id:"AUD-BCP-2026",  name:"BCP & DR Readiness Assessment",    type:"Internal",  status:"planned",     scope:"Business Continuity Plan v1.4, DR",      startDate:"2026-07-01", endDate:"2026-08-31", auditor:"Alex Kim",         framework:"ISO 22301",    progress:0,  findings:1, aiInsights:["BCP not tested in 18 months — audit will focus on test execution.","RTO/RPO targets to be validated against current cloud architecture."] },
  { id:"AUD-PEN-2026",  name:"Annual Penetration Test 2026",     type:"External",  status:"planned",     scope:"External perimeter, web apps, internal", startDate:"2026-07-15", endDate:"2026-08-15", auditor:"NCC Group",        framework:"OWASP / PTES", progress:0,  findings:0, aiInsights:["Scope includes 4 new cloud-native applications deployed in H1 2026.","Red team exercise component scoped for critical infrastructure."] },
  { id:"AUD-SUP-2026",  name:"Supplier Security Audit 2026",     type:"Internal",  status:"planned",     scope:"Top 10 critical vendors",                startDate:"2026-08-01", endDate:"2026-09-30", auditor:"Marcus Johnson",   framework:"ISO 27001/SIG", progress:0, findings:0, aiInsights:["Focus on 3 Tier-1 vendors not audited since 2024.","Right-to-audit clauses confirmed active for all 10 selected vendors."] },
];

const LOG_LEVELS = ["CRITICAL","ERROR","WARN","INFO"] as const;
const STATIC_LOGS: any[] = [
  { id:"LOG-8841", ts:"2026-06-16 09:42:17", level:"CRITICAL", source:"EDR",          user:"SYSTEM",           event:"Ransomware execution blocked on KE-FIN-WS-019 — LockBit 3.0 variant quarantined",        ip:"10.12.4.19"   },
  { id:"LOG-8840", ts:"2026-06-16 09:38:02", level:"CRITICAL", source:"DLP",          user:"m.ochieng",        event:"Bulk PII export attempt detected — 4,200 records flagged on USB write",                  ip:"10.12.4.21"   },
  { id:"LOG-8839", ts:"2026-06-16 08:55:44", level:"ERROR",    source:"IAM",          user:"SYSTEM",           event:"Failed MFA enrollment for 3 new user accounts — FIDO2 token provisioning error",          ip:"10.0.1.5"     },
  { id:"LOG-8838", ts:"2026-06-16 08:47:30", level:"WARN",     source:"CSPM",         user:"SYSTEM",           event:"S3 bucket acme-dev-logs public read ACL detected — auto-remediation triggered",            ip:"AWS-ap-south-1"},
  { id:"LOG-8837", ts:"2026-06-16 08:33:15", level:"INFO",     source:"IAM",          user:"admin@acme.com",   event:"User role elevated to Security Analyst — approved by CISO",                               ip:"10.0.0.1"     },
  { id:"LOG-8836", ts:"2026-06-16 08:14:09", level:"ERROR",    source:"API Gateway",  user:"SA-PORTAL-09",     event:"Rate limit exceeded on /api/reports — 1,203 req/min (threshold: 1,000)",                  ip:"10.0.2.44"    },
  { id:"LOG-8835", ts:"2026-06-16 07:58:22", level:"INFO",     source:"Compliance",   user:"s.chen@acme.com",  event:"ISO 27001 control AC-6 evidence uploaded — 3 files attached",                            ip:"10.0.0.12"    },
  { id:"LOG-8834", ts:"2026-06-16 07:44:51", level:"WARN",     source:"Vulnerability","user":"SYSTEM",         event:"CVE-2026-1721 (CVSS 9.1) detected on 7 unpatched servers — SLA breach in 18 hours",       ip:"10.0.3.0/24"  },
  { id:"LOG-8833", ts:"2026-06-16 07:30:00", level:"INFO",     source:"GRC Platform", user:"p.patel@acme.com", event:"GDPR processing activity record updated — vendor Orion Tech marked as high-risk",          ip:"10.0.0.14"    },
  { id:"LOG-8832", ts:"2026-06-16 07:21:14", level:"INFO",     source:"Identity",     user:"SYSTEM",           event:"Weekly PAM credential rotation completed — 142 privileged accounts rotated",               ip:"10.0.1.10"    },
  { id:"LOG-8831", ts:"2026-06-15 23:14:58", level:"ERROR",    source:"SIEM",         user:"SYSTEM",           event:"Log ingestion pipeline timeout — 4,112 events dropped from FortiGate-TMA-NAIROBI",         ip:"10.12.0.1"    },
  { id:"LOG-8830", ts:"2026-06-15 22:49:03", level:"WARN",     source:"Network",      user:"SYSTEM",           event:"IKEv1 negotiation attempt detected on VPN tunnel TUN-KE-02 — blocked by policy",            ip:"41.222.33.121"},
  { id:"LOG-8829", ts:"2026-06-15 21:00:00", level:"INFO",     source:"Backup",       user:"SYSTEM",           event:"Nightly backup completed — 47 systems, 2.1 TB, SHA-256 integrity verified",                ip:"10.0.5.50"    },
  { id:"LOG-8828", ts:"2026-06-15 20:31:47", level:"CRITICAL", source:"WAF",          user:"SYSTEM",           event:"SQL injection attack blocked — 847 requests in 2 min from 185.220.101.47",                 ip:"185.220.101.47"},
  { id:"LOG-8827", ts:"2026-06-15 18:12:35", level:"WARN",     source:"IAM",          user:"j.mwangi",         event:"Account locked after 5 failed login attempts — possible brute force",                      ip:"196.201.4.73" },
  { id:"LOG-8826", ts:"2026-06-15 17:44:18", level:"INFO",     source:"Risk",         user:"m.johnson@acme.com","event":"Risk register updated — RISK-047 residual score downgraded from High to Medium after control implementation", ip:"10.0.0.18" },
  { id:"LOG-8825", ts:"2026-06-15 16:55:09", level:"INFO",     source:"GRC Platform", user:"a.kim@acme.com",   event:"SAMA CSF quarterly report generation started — template TPL-001 selected",                 ip:"10.0.0.22"    },
  { id:"LOG-8824", ts:"2026-06-15 15:23:44", level:"ERROR",    source:"Database",     user:"SYSTEM",           event:"Connection pool exhausted on customers-db-prod — 12 queries queued, 3 timed out",           ip:"10.0.4.10"    },
  { id:"LOG-8823", ts:"2026-06-15 14:47:29", level:"INFO",     source:"Compliance",   user:"p.patel@acme.com", event:"GDPR DSAR completed for data subject DS-2026-0441 — response dispatched within 30-day SLA", ip:"10.0.0.14"    },
  { id:"LOG-8822", ts:"2026-06-15 14:00:00", level:"INFO",     source:"Patch Mgmt",   user:"SYSTEM",           event:"Patch cycle June-W3 initiated — 94 servers queued for OS patching (Tue maintenance window)", ip:"10.0.3.0/24"  },
  { id:"LOG-8821", ts:"2026-06-15 13:22:11", level:"WARN",     source:"CSPM",         user:"SYSTEM",           event:"EC2 instance i-0a9b7c6d5e4f3a2b1 running with IMDSv1 — migration to IMDSv2 required",        ip:"AWS-eu-west-1"},
  { id:"LOG-8820", ts:"2026-06-15 12:55:00", level:"INFO",     source:"Identity",     user:"SYSTEM",           event:"Access review campaign Q2-2026 completed — 18 accounts revoked, 34 roles downgraded",        ip:"10.0.1.5"     },
  { id:"LOG-8819", ts:"2026-06-15 11:44:55", level:"ERROR",    source:"EDR",          user:"SYSTEM",           event:"EDR agent offline on 9 endpoints >24h — last check-in missed; helpdesk tickets raised",       ip:"10.12.0.0/16" },
  { id:"LOG-8818", ts:"2026-06-15 10:30:41", level:"CRITICAL", source:"Network",      user:"SYSTEM",           event:"DDoS pre-cursor traffic pattern detected on portal.acme.sa — Cloudflare alert raised",         ip:"185.7.1.0/24" },
  { id:"LOG-8817", ts:"2026-06-15 09:15:28", level:"INFO",     source:"GRC Platform", user:"s.chen@acme.com",  event:"Board Security Briefing Pack June-2026 exported as PDF+PPTX — distributed to Board DL",       ip:"10.0.0.12"    },
  { id:"LOG-8816", ts:"2026-06-15 08:47:00", level:"WARN",     source:"Vulnerability","user":"SYSTEM",         event:"14 unresolved Critical CVEs past 7-day SLA — escalated to Security Manager",                  ip:"10.0.0.0/8"   },
  { id:"LOG-8815", ts:"2026-06-14 23:58:12", level:"INFO",     source:"Backup",       user:"SYSTEM",           event:"DR backup replication to secondary region (eu-central-1) completed — RPO target met",          ip:"10.0.5.51"    },
  { id:"LOG-8814", ts:"2026-06-14 21:11:44", level:"ERROR",    source:"API Gateway",  user:"SYSTEM",           event:"JWT signing key rotation failed — fallback to previous key; immediate retry scheduled",         ip:"10.0.2.1"     },
  { id:"LOG-8813", ts:"2026-06-14 18:03:19", level:"INFO",     source:"IAM",          user:"e.wilson@acme.com","event":"Privileged access review completed — 6 dormant admin accounts identified for deprovisioning",  ip:"10.0.0.9"     },
  { id:"LOG-8812", ts:"2026-06-14 15:30:00", level:"WARN",     source:"Compliance",   user:"SYSTEM",           event:"NCA ECC control check 4.3 evidence gap detected — remediation task created TASK-7741",          ip:"10.0.0.1"     },
  { id:"LOG-8811", ts:"2026-06-14 12:00:00", level:"INFO",     source:"GRC Platform", user:"SYSTEM",           event:"Scheduled SAMA CSF Q2 report auto-generation triggered — estimated completion 4h",              ip:"10.0.0.1"     },
  { id:"LOG-8810", ts:"2026-06-14 09:22:05", level:"ERROR",    source:"SIEM",         user:"SYSTEM",           event:"Threat intelligence feed update failed — OTX API timeout; retry in 60 min",                     ip:"10.0.0.1"     },
  { id:"LOG-8809", ts:"2026-06-13 16:44:31", level:"INFO",     source:"Pentest",      user:"ncc.group",        event:"External penetration test session started — scope: portal.acme.com perimeter + web apps",        ip:"89.114.50.100"},
  { id:"LOG-8808", ts:"2026-06-13 14:20:17", level:"WARN",     source:"Identity",     user:"SYSTEM",           event:"Service account SA-MONITOR-01 last rotation 14 months ago — rotation overdue (policy: 12M)",     ip:"10.0.1.5"     },
];

/* ─── Report Templates ─── */
const REPORT_TEMPLATES: ReportTemplate[] = [
  // KSA Regulatory
  { id:"TPL-001", name:"SAMA CSF Cybersecurity Assessment", framework:"SAMA CSF", region:"Saudi Arabia", category:"KSA Regulatory", description:"Comprehensive compliance report against the Saudi Arabian Monetary Authority Cybersecurity Framework covering all five domains: Leadership, Identify, Protect, Detect, Respond & Recover.", sections:["Executive Summary","SAMA CSF Domain Coverage","Control Maturity Assessment","Gap Analysis","Regulatory Breach Register","Remediation Roadmap","Evidence Annex"], estimatedPages:45, formats:["PDF","XLSX"], tags:["SAMA","Banking","KSA"], popular:true },
  { id:"TPL-002", name:"NCA ECC-2:2020 Annual Compliance", framework:"NCA ECC", region:"Saudi Arabia", category:"KSA Regulatory", description:"Annual compliance assessment against the National Cybersecurity Authority Essential Cybersecurity Controls 2:2020 for Saudi critical national infrastructure.", sections:["Executive Summary","NCA ECC Domain Coverage","Critical CNI Controls Status","Incident Response Readiness","Supply Chain Security","Submission Package"], estimatedPages:38, formats:["PDF","DOCX"], tags:["NCA","ECC","KSA"], popular:true },
  { id:"TPL-003", name:"PDPL Privacy Impact Assessment", framework:"PDPL", region:"Saudi Arabia", category:"KSA Regulatory", description:"Privacy Impact Assessment report aligned with Saudi Arabia's Personal Data Protection Law — covers data collection, processing, cross-border transfer, and individual rights.", sections:["Executive Summary","Data Processing Inventory","Consent & Legal Basis","Cross-Border Transfer Assessment","Data Subject Rights","Breach Notification Procedures","NDMO Submission Package"], estimatedPages:32, formats:["PDF","DOCX"], tags:["PDPL","Privacy","KSA"] },
  { id:"TPL-004", name:"CITC Cybersecurity Annual Report", framework:"CITC", region:"Saudi Arabia", category:"KSA Regulatory", description:"Annual cybersecurity compliance report for telecommunications and ICT organisations regulated by the Communications, Space & Technology Commission.", sections:["Executive Summary","Telecom Sector Controls","Network Security Assessment","Incident Reporting Summary","Business Continuity Status","CITC Submission Annex"], estimatedPages:28, formats:["PDF"], tags:["CITC","Telecom","KSA"] },
  { id:"TPL-005", name:"ZATCA E-Invoicing Security Audit", framework:"ZATCA", region:"Saudi Arabia", category:"KSA Regulatory", description:"Security audit report for Phase 2 E-Invoicing integration with ZATCA, covering cryptographic requirements, data integrity, and API security controls.", sections:["Integration Security Assessment","Cryptographic Controls Review","API Security Testing","Data Integrity Verification","Compliance Attestation"], estimatedPages:22, formats:["PDF","XLSX"], tags:["ZATCA","E-Invoicing","KSA"] },
  { id:"TPL-006", name:"NCA CCC Cloud Security Compliance", framework:"NCA CCC", region:"Saudi Arabia", category:"KSA Regulatory", description:"Cloud computing security compliance report per NCA Cloud Cybersecurity Controls — covering cloud service provider assessment, shared responsibility, and data residency.", sections:["Cloud Infrastructure Overview","NCA CCC Control Mapping","Cloud Provider Assessment","Data Residency Verification","Encryption & Key Management","CSPM Findings Summary"], estimatedPages:35, formats:["PDF","XLSX"], tags:["NCA","Cloud","KSA"] },
  { id:"TPL-007", name:"NDMO Data Governance Compliance", framework:"NDMO", region:"Saudi Arabia", category:"KSA Regulatory", description:"Data governance compliance report aligned with the National Data Management Office framework — covers data classification, retention, quality, and interoperability.", sections:["Data Governance Framework","Data Classification Status","Retention & Disposal Assessment","Data Quality Metrics","Interoperability Controls","NDMO Regulatory Submission"], estimatedPages:30, formats:["PDF","DOCX"], tags:["NDMO","Data Governance","KSA"] },
  // EU / Global Compliance
  { id:"TPL-008", name:"ISO 27001 Controls Dashboard", framework:"ISO 27001", region:"Global", category:"Compliance", description:"Comprehensive ISO 27001:2022 compliance dashboard covering all 93 Annex A controls across 4 themes — Organisational, People, Physical, and Technological.", sections:["ISMS Scope & Objectives","Risk Assessment Summary","Annex A Control Status (93 controls)","Internal Audit Results","Management Review","Continual Improvement Register","Evidence Appendix"], estimatedPages:52, formats:["PDF","XLSX","PPTX"], tags:["ISO27001","ISMS","Global"], popular:true },
  { id:"TPL-009", name:"SOC 2 Type II Evidence Summary", framework:"SOC 2", region:"USA", category:"Compliance", description:"Complete SOC 2 Type II evidence package for external auditors covering Trust Service Criteria — Security, Availability, Processing Integrity, Confidentiality, and Privacy.", sections:["Management Assertion","System Description","Trust Service Criteria Mapping","Control Evidence Package","Exception Register","Auditor Communication Pack"], estimatedPages:68, formats:["PDF"], tags:["SOC2","AICPA","USA"], popular:true },
  { id:"TPL-010", name:"GDPR Processing Activities Report", framework:"GDPR", region:"EU", category:"Privacy", description:"GDPR Article 30 Records of Processing Activities (RoPA) and annual data protection compliance report for the EU Data Protection Authority.", sections:["Controller Details","Processing Activities Register (RoPA)","Legal Basis Assessment","Data Subject Rights Log","DPIA Register","Cross-Border Transfers","Breach Register","DPA Notification Status"], estimatedPages:40, formats:["PDF","XLSX","DOCX"], tags:["GDPR","Privacy","EU"] },
  { id:"TPL-011", name:"NIS2 Readiness Assessment", framework:"NIS2", region:"EU", category:"Compliance", description:"NIS2 Directive compliance readiness report for essential and important entities — covers governance, risk management, supply chain, incident reporting, and technical measures.", sections:["Entity Classification","Governance & Accountability","Risk Management Assessment","Supply Chain Security","Incident Reporting Capability","Business Continuity","Technical Measures Coverage"], estimatedPages:36, formats:["PDF","DOCX"], tags:["NIS2","EU","Cybersecurity"] },
  { id:"TPL-012", name:"DORA Operational Resilience Report", framework:"DORA", region:"EU", category:"Financial", description:"Digital Operational Resilience Act compliance report for EU financial entities — covers ICT risk management, incident classification, TLPT, and third-party risk.", sections:["ICT Risk Management Framework","Incident Classification & Reporting","Digital Resilience Testing","Third-Party ICT Provider Register","Threat Intelligence","Regulatory Submission Package"], estimatedPages:42, formats:["PDF","XLSX"], tags:["DORA","EU","Financial"] },
  // Security
  { id:"TPL-013", name:"Vulnerability Management Report", framework:"Internal", region:"Global", category:"Security", description:"Comprehensive vulnerability management report covering scan results, CVSS scoring, patch SLA compliance, and remediation tracking across the entire asset inventory.", sections:["Executive Summary","Vulnerability KPIs","Critical/High CVE Detail","Asset Risk Heatmap","Patch SLA Compliance","Remediation Tracker","Trend Analysis (6M)"], estimatedPages:28, formats:["PDF","XLSX"], tags:["Vulnerability","Patching","Security"], popular:true },
  { id:"TPL-014", name:"Penetration Test Executive Summary", framework:"OWASP/PTES", region:"Global", category:"Security", description:"Executive and technical summary of penetration test results — external perimeter, web applications, and internal network — with CVSS-scored findings and remediation priorities.", sections:["Engagement Scope","Executive Summary","Critical Findings","High/Medium/Low Findings","OWASP Top 10 Mapping","Attack Chain Narratives","Remediation Priorities","Retest Schedule"], estimatedPages:34, formats:["PDF","DOCX"], tags:["PenTest","OWASP","Security"] },
  { id:"TPL-015", name:"Incident Response Summary Report", framework:"ISO 27035", region:"Global", category:"Security", description:"Post-incident analysis report documenting timeline, impact assessment, root cause analysis, containment actions, and lessons learned per ISO 27035 requirements.", sections:["Incident Timeline","Scope & Impact Assessment","Root Cause Analysis","Containment & Eradication","Evidence Chain of Custody","Regulatory Notifications","Lessons Learned","Control Improvements"], estimatedPages:20, formats:["PDF","DOCX"], tags:["Incident","IR","Security"] },
  { id:"TPL-016", name:"Threat Intelligence Briefing", framework:"MITRE ATT&CK", region:"Global", category:"Security", description:"Monthly threat intelligence briefing for CISO and security leadership — covering active threat actors, TTPs, IOCs, and defensive coverage mapped to MITRE ATT&CK.", sections:["Threat Landscape Overview","Active Threat Actors","TTP Analysis (MITRE ATT&CK)","IOC Summary","Defensive Coverage Gaps","Sector-Specific Threats","Strategic Recommendations"], estimatedPages:18, formats:["PDF","PPTX"], tags:["Threat Intel","MITRE","Security"] },
  // Risk
  { id:"TPL-017", name:"Risk Register Executive Summary", framework:"ISO 31000", region:"Global", category:"Risk", description:"Board-level risk register executive summary showing top risks by likelihood × impact, treatment status, risk appetite alignment, and trend analysis.", sections:["Risk Heatmap","Top 10 Risks (Residual)","Risk Appetite vs Tolerance","Treatment Plan Status","Emerging Risks","Risk Trend (12M)","Board Assurance Statement"], estimatedPages:16, formats:["PDF","PPTX","XLSX"], tags:["Risk","Board","ISO31000"], popular:true },
  { id:"TPL-018", name:"Third-Party Risk Assessment", framework:"ISO 27036", region:"Global", category:"Risk", description:"Comprehensive third-party and supply chain risk assessment covering vendor criticality tiering, security posture, contractual compliance, and continuous monitoring status.", sections:["Vendor Population Overview","Tier 1/2/3 Risk Profiles","Security Questionnaire Results","Contractual Compliance","Right-to-Audit Findings","Remediation Tracker","Emerging Supply Chain Risks"], estimatedPages:30, formats:["PDF","XLSX"], tags:["Third Party","Vendor","Supply Chain"] },
  { id:"TPL-019", name:"Business Continuity Readiness", framework:"ISO 22301", region:"Global", category:"Risk", description:"Business continuity and disaster recovery readiness assessment — BIA results, RTO/RPO targets vs actuals, test exercise outcomes, and improvement actions.", sections:["Business Impact Analysis","RTO/RPO Status Dashboard","BCP Test Exercise Results","DR Systems Validation","Crisis Communication Review","Improvement Actions Register"], estimatedPages:26, formats:["PDF","DOCX"], tags:["BCP","DR","ISO22301"] },
  // Privacy
  { id:"TPL-020", name:"DSAR Fulfilment Metrics", framework:"GDPR", region:"EU", category:"Privacy", description:"Data Subject Access Request fulfilment metrics report — tracks volumes, response times, compliance with 30-day statutory deadline, and quality of responses.", sections:["DSAR Volume & Trend","Response Time SLA Compliance","Request Type Breakdown","Exemptions Applied","Process Efficiency Metrics","Improvement Actions"], estimatedPages:14, formats:["PDF","XLSX"], tags:["DSAR","Privacy","GDPR"] },
  { id:"TPL-021", name:"Data Breach Notification Pack", framework:"GDPR / PDPL", region:"Global", category:"Privacy", description:"Regulatory data breach notification package for DPA/NDMO submission — includes breach details, affected data subjects, risk assessment, and remediation measures.", sections:["Breach Summary","Timeline & Discovery","Affected Data & Subjects","Risk Assessment (Art.33/34)","Containment Actions","Regulatory Notification Forms","Post-Breach Improvements"], estimatedPages:12, formats:["PDF","DOCX"], tags:["Breach","Notification","Privacy"] },
  // Executive
  { id:"TPL-022", name:"Board Security Briefing Pack", framework:"Internal", region:"Global", category:"Executive", description:"Monthly board-level security briefing deck — KPI dashboard, top risks, regulatory status, open audit findings, and strategic initiatives progress.", sections:["Security KPI Dashboard","Top 5 Risks (Residual)","Regulatory Compliance Status","Open Audit Findings","Incident Summary","Strategic Initiative Progress","CISO Recommendations"], estimatedPages:12, formats:["PDF","PPTX"], tags:["Board","Executive","CISO"], popular:true },
  { id:"TPL-023", name:"CISO Monthly Dashboard Report", framework:"Internal", region:"Global", category:"Executive", description:"Detailed monthly CISO dashboard — asset risk posture, vulnerability trends, compliance scores, audit status, team performance, and budget utilisation.", sections:["Asset Risk Posture","Vulnerability Metrics","Compliance Scores (All Frameworks)","Audit & Findings Status","Security Operations Metrics","Team KPIs","Budget Utilisation"], estimatedPages:20, formats:["PDF","XLSX","PPTX"], tags:["CISO","Dashboard","Monthly"] },
  // Financial
  { id:"TPL-024", name:"PCI DSS Quarterly Self-Assessment", framework:"PCI DSS v4.0", region:"Global", category:"Financial", description:"Quarterly PCI DSS v4.0 self-assessment questionnaire results — cardholder data environment scope, control compliance, and remediation tracking.", sections:["CDE Scope Definition","SAQ Results by Requirement","Compensating Controls","Vulnerability Scan Results","Penetration Test Status","Remediation Tracker","QSA Submission Package"], estimatedPages:38, formats:["PDF","XLSX"], tags:["PCI","Payment","Financial"] },

  /* ─── UAE ─── */
  { id:"TPL-025", name:"UAE NESA IAS Compliance Assessment", framework:"NESA IAS", region:"UAE", category:"Compliance", description:"Compliance assessment against the UAE National Electronic Security Authority Information Assurance Standards — covering all 188 controls across 7 sub-standards for critical information infrastructure.", sections:["Executive Summary","NESA IAS Domain Coverage","Control Implementation Status","Critical Information Infrastructure Assessment","Gap Analysis","Remediation Roadmap","NESA Submission Package"], estimatedPages:48, formats:["PDF","XLSX"], tags:["NESA","UAE","IAS"], popular:true },
  { id:"TPL-026", name:"UAE IA Regulation Compliance Report", framework:"UAE IA", region:"UAE", category:"Compliance", description:"Compliance report against UAE Information Assurance Regulation for government entities — covers asset classification, risk management, and mandatory security controls.", sections:["Entity Classification","Asset Register","Risk Management Assessment","Mandatory Controls Status","Third-Party Management","Incident Reporting","TRA Submission Package"], estimatedPages:36, formats:["PDF","DOCX"], tags:["UAE","IA","Government"] },
  { id:"TPL-027", name:"UAE PDPL Privacy Compliance Report", framework:"UAE PDPL", region:"UAE", category:"Privacy", description:"Privacy compliance report under the UAE Federal Decree-Law on Personal Data Protection — covers consent framework, cross-border transfers, and UAEDPD notification requirements.", sections:["Data Processing Inventory","Consent & Legal Basis","Data Subject Rights","Cross-Border Transfer Controls","Breach Notification Register","UAEDPD Submission"], estimatedPages:28, formats:["PDF","DOCX"], tags:["PDPL","Privacy","UAE"] },

  /* ─── UK ─── */
  { id:"TPL-028", name:"UK GDPR & DPA 2018 Compliance Report", framework:"UK GDPR", region:"UK", category:"Privacy", description:"UK GDPR and Data Protection Act 2018 annual compliance report — adapted for post-Brexit requirements, covering ICO obligations, Article 30 records, and cross-border UK-EU transfers.", sections:["Controller Details","Records of Processing","Lawful Basis Assessment","International Transfer Mechanisms","Data Subject Rights Log","Breach Notification Register","ICO Accountability Evidence"], estimatedPages:42, formats:["PDF","XLSX","DOCX"], tags:["UK GDPR","DPA","Privacy"], popular:true },
  { id:"TPL-029", name:"Cyber Essentials Plus Readiness Report", framework:"Cyber Essentials+", region:"UK", category:"Compliance", description:"Cyber Essentials Plus certification readiness assessment — covers all five control themes: firewalls, secure configuration, access control, malware protection, and patch management.", sections:["Boundary Firewalls & Internet Gateways","Secure Configuration","User Access Control","Malware Protection","Patch Management","Technical Verification Evidence","IASME Submission Package"], estimatedPages:24, formats:["PDF"], tags:["Cyber Essentials","UK","NCSC"] },
  { id:"TPL-030", name:"FCA SYSC Operational Resilience Report", framework:"FCA SYSC", region:"UK", category:"Financial", description:"FCA SYSC 15A Operational Resilience compliance report — mapping important business services, impact tolerances, and scenario testing results for FCA-regulated financial firms.", sections:["Important Business Services Register","Impact Tolerance Assessment","Scenario Testing Results","Third-Party Dependencies","Mapping & Connectivity Analysis","FCA Self-Assessment Package"], estimatedPages:34, formats:["PDF","XLSX"], tags:["FCA","SYSC","Financial"] },

  /* ─── India ─── */
  { id:"TPL-031", name:"DPDP Act Compliance Report", framework:"DPDP Act 2023", region:"India", category:"Privacy", description:"India Digital Personal Data Protection Act 2023 compliance report — covering consent management, data fiduciary obligations, Data Protection Board notifications, and cross-border transfer controls.", sections:["Data Fiduciary Assessment","Personal Data Inventory","Consent & Notice Framework","Data Principal Rights","Cross-Border Transfer Controls","Data Protection Board Obligations","Significant Data Fiduciary Assessment"], estimatedPages:38, formats:["PDF","DOCX"], tags:["DPDP","Privacy","India"], popular:true },
  { id:"TPL-032", name:"RBI CSCF Cybersecurity Assessment", framework:"RBI CSCF", region:"India", category:"Compliance", description:"RBI Cyber Security Framework compliance assessment for Indian banks and NBFCs — covering baseline cybersecurity controls, SOC requirements, and RBI CSITE submission readiness.", sections:["Executive Summary","RBI CSCF Baseline Controls","Advanced Security Controls","Security Operations Centre","Vulnerability & Patch Management","Third-Party Risk","RBI Reporting Package"], estimatedPages:44, formats:["PDF","XLSX"], tags:["RBI","CSCF","Banking"] },
  { id:"TPL-033", name:"SEBI Cybersecurity & Cyber Resilience", framework:"SEBI CSCRF", region:"India", category:"Compliance", description:"SEBI Cybersecurity and Cyber Resilience Framework compliance report for market infrastructure institutions and regulated entities.", sections:["CSCRF Governance Structure","Asset Classification","Network Security","Threat Intelligence","Incident Response Capability","Recovery Testing","SEBI Submission Package"], estimatedPages:32, formats:["PDF","XLSX"], tags:["SEBI","CSCRF","India"] },

  /* ─── Singapore ─── */
  { id:"TPL-034", name:"MAS TRM Compliance Assessment", framework:"MAS TRM", region:"Singapore", category:"Compliance", description:"Monetary Authority of Singapore Technology Risk Management Guidelines compliance assessment — covering IT governance, access management, system resilience, and cyber hygiene for FIs.", sections:["IT Risk Governance","IT Service Management","Access Control Assessment","Cryptography Controls","System Resilience & Recovery","Cyber Hygiene","MAS Notification Readiness"], estimatedPages:46, formats:["PDF","XLSX"], tags:["MAS","TRM","Singapore"], popular:true },
  { id:"TPL-035", name:"Singapore PDPA Compliance Report", framework:"PDPA", region:"Singapore", category:"Privacy", description:"Singapore Personal Data Protection Act compliance report — covering data protection obligations, notification obligations, data protection officer requirements, and PDPC self-assessment.", sections:["Data Protection Policy Review","Consent Obligation","Purpose Limitation","Notification Obligation","Access & Correction Rights","Data Breach Notification","PDPC Submission Package"], estimatedPages:28, formats:["PDF","DOCX"], tags:["PDPA","Privacy","Singapore"] },

  /* ─── Australia ─── */
  { id:"TPL-036", name:"ASD ISM Compliance Assessment", framework:"ASD ISM", region:"Australia", category:"Compliance", description:"Australian Signals Directorate Information Security Manual compliance assessment — covering the Essential Eight strategies, system hardening, and government security controls.", sections:["Essential Eight Maturity Assessment","Access Control","Application Control","Patch Management","Multi-Factor Authentication","Backup & Recovery","ASD Reporting Package"], estimatedPages:40, formats:["PDF","XLSX"], tags:["ASD","ISM","Australia"], popular:true },
  { id:"TPL-037", name:"APRA CPS 234 Information Security", framework:"APRA CPS 234", region:"Australia", category:"Compliance", description:"APRA Prudential Standard CPS 234 compliance report for APRA-regulated financial entities — covering information security capability, controls testing, and APRA notification obligations.", sections:["Information Security Capability","Policy Framework","Control Testing Program","Control Deficiency Register","Incident Response Readiness","Third-Party Dependencies","APRA Notification Assessment"], estimatedPages:36, formats:["PDF","XLSX"], tags:["APRA","CPS234","Australia"] },

  /* ─── Canada ─── */
  { id:"TPL-038", name:"PIPEDA Privacy Compliance Report", framework:"PIPEDA", region:"Canada", category:"Privacy", description:"Canada's Personal Information Protection and Electronic Documents Act compliance report — covering the 10 fair information principles, breach of security safeguards reporting, and OPC accountability.", sections:["Fair Information Principles Assessment","Consent Framework","Accountability Structures","Safeguard Controls","Access & Correction Rights","Breach Reporting Register","OPC Compliance Evidence"], estimatedPages:30, formats:["PDF","DOCX"], tags:["PIPEDA","Privacy","Canada"] },
  { id:"TPL-039", name:"OSFI B-10 Third-Party Risk Report", framework:"OSFI B-10", region:"Canada", category:"Risk", description:"OSFI Guideline B-10 Technology and Cyber Risk Management compliance report for Canadian federally regulated financial institutions — covering technology risk governance and third-party arrangements.", sections:["Technology Risk Governance","Cyber Risk Appetite","Third-Party Arrangement Inventory","Concentration Risk Assessment","Incident Reporting Capability","OSFI Regulatory Submission"], estimatedPages:38, formats:["PDF","XLSX"], tags:["OSFI","B-10","Canada"] },

  /* ─── Qatar ─── */
  { id:"TPL-040", name:"NIA Qatar Cybersecurity Framework", framework:"NIA QCF", region:"Qatar", category:"Compliance", description:"Qatar National Information Assurance (NIA) Cybersecurity Framework compliance assessment for Qatari government entities and critical national infrastructure operators.", sections:["Governance & Risk Management","Asset Management","Access Control","Operational Security","Communications Security","Incident Management","NIA Submission Package"], estimatedPages:34, formats:["PDF","XLSX"], tags:["NIA","Qatar","CNI"] },

  /* ─── Bahrain ─── */
  { id:"TPL-041", name:"BCB Cybersecurity Framework Assessment", framework:"BCB CSF", region:"Bahrain", category:"Compliance", description:"Central Bank of Bahrain Cybersecurity Framework compliance assessment for licensed financial institutions — covering all five BCB CSF functions and regulatory submission requirements.", sections:["Governance Structure","Identify Function","Protect Function","Detect Function","Respond & Recover","BCB Regulatory Submission"], estimatedPages:32, formats:["PDF","XLSX"], tags:["BCB","Bahrain","Banking"] },

  /* ─── Pakistan ─── */
  { id:"TPL-042", name:"PECA & PTA Cybersecurity Compliance", framework:"PECA / PTA", region:"Pakistan", category:"Compliance", description:"Pakistan Electronic Crimes Act and PTA cybersecurity directions compliance report for licensed telecom and digital service providers in Pakistan.", sections:["Regulatory Scope Assessment","PECA Obligations","PTA Directions Compliance","Incident Reporting Procedures","Data Localisation Controls","Regulator Submission Package"], estimatedPages:26, formats:["PDF","DOCX"], tags:["PECA","PTA","Pakistan"] },

  /* ─── Hong Kong ─── */
  { id:"TPL-043", name:"HKMA CSAP Cybersecurity Assessment", framework:"HKMA CSAP", region:"Hong Kong", category:"Compliance", description:"Hong Kong Monetary Authority Cybersecurity Assessment Programme compliance report for authorized institutions — covering all nine cybersecurity domains and HKMA supervisory submission.", sections:["Cyber Risk Governance","IT Asset Management","Security Operations","Access Management","Encryption Controls","Third-Party Risk","Incident Response","Penetration Testing","HKMA Submission Package"], estimatedPages:50, formats:["PDF","XLSX"], tags:["HKMA","CSAP","Hong Kong"], popular:true },
  { id:"TPL-044", name:"Hong Kong PDPO Compliance Report", framework:"PDPO", region:"Hong Kong", category:"Privacy", description:"Hong Kong Personal Data (Privacy) Ordinance compliance report — covering data protection principles, PICS requirements, direct marketing, and PCPD regulatory submission.", sections:["Data Protection Principles","Personal Information Collection Statement","Data Access & Correction","Direct Marketing Compliance","Data Processor Controls","PCPD Accountability Evidence"], estimatedPages:24, formats:["PDF","DOCX"], tags:["PDPO","Privacy","Hong Kong"] },
];

/* ─── My Reports ─── */
const MY_REPORTS: MyReport[] = [
  { id:"RPT-001", name:"ISO 27001 Controls Dashboard — June 2026",        framework:"ISO 27001", region:"Global",       generatedBy:"Sarah Chen",     generatedAt:"2026-06-01 09:15", format:"PDF+XLSX", size:"4.2 MB", status:"completed",   recipients:["CISO","Board"],            audience:"CISO + Board",       freq:"Monthly",   nextDue:"2026-07-01" },
  { id:"RPT-002", name:"SOC 2 Type II Evidence Summary — Q2 2026",        framework:"SOC 2",     region:"USA",          generatedBy:"Priya Patel",    generatedAt:"2026-05-31 14:30", format:"PDF",      size:"8.7 MB", status:"completed",   recipients:["External Auditor"],        audience:"External Auditor",   freq:"Quarterly", nextDue:"2026-08-31" },
  { id:"RPT-003", name:"GDPR Processing Activities Report — June 2026",   framework:"GDPR",      region:"EU",           generatedBy:"Priya Patel",    generatedAt:"2026-06-01 10:00", format:"PDF",      size:"3.1 MB", status:"completed",   recipients:["DPO","Legal"],             audience:"DPO + Legal",        freq:"Monthly",   nextDue:"2026-07-01" },
  { id:"RPT-004", name:"Risk Register Executive Summary — June 2026",     framework:"Internal",  region:"Global",       generatedBy:"Marcus Johnson", generatedAt:"2026-06-10 08:00", format:"PDF+PPTX", size:"2.8 MB", status:"completed",   recipients:["Board","CRO"],             audience:"Board + CRO",        freq:"Weekly",    nextDue:"2026-06-17" },
  { id:"RPT-005", name:"Vulnerability Management Report — 3 June 2026",  framework:"Internal",  region:"Global",       generatedBy:"Alex Kim",       generatedAt:"2026-06-03 07:45", format:"PDF+XLSX", size:"5.3 MB", status:"overdue",     recipients:["IT Security"],             audience:"IT Security",        freq:"Weekly",    nextDue:"2026-06-17" },
  { id:"RPT-006", name:"DSAR Fulfilment Metrics — May 2026",             framework:"GDPR",      region:"EU",           generatedBy:"Priya Patel",    generatedAt:"2026-05-31 11:20", format:"PDF",      size:"1.4 MB", status:"completed",   recipients:["DPO","Legal"],             audience:"DPO + Legal",        freq:"Monthly",   nextDue:"2026-06-30" },
  { id:"RPT-007", name:"NIS2 Readiness Assessment — Q1 2026",            framework:"NIS2",      region:"EU",           generatedBy:"Sarah Chen",     generatedAt:"2026-03-31 16:00", format:"PDF",      size:"3.8 MB", status:"completed",   recipients:["CISO","Legal"],            audience:"CISO + Legal",       freq:"Quarterly", nextDue:"2026-09-30" },
  { id:"RPT-008", name:"Board Security Briefing Pack — June 2026",       framework:"Internal",  region:"Global",       generatedBy:"Emma Wilson",    generatedAt:"2026-06-01 07:30", format:"PDF+PPTX", size:"6.2 MB", status:"completed",   recipients:["Board"],                   audience:"Board",              freq:"Monthly",   nextDue:"2026-07-01" },
  { id:"RPT-009", name:"PCI DSS Quarterly Self-Assessment — Q1 2026",    framework:"PCI DSS",   region:"Global",       generatedBy:"Ryan Johnson",   generatedAt:"2026-03-31 12:00", format:"PDF",      size:"2.6 MB", status:"overdue",     recipients:["Finance","CISO"],          audience:"Finance + CISO",     freq:"Quarterly", nextDue:"2026-06-30" },
  { id:"RPT-010", name:"Cyber Insurance Evidence Pack — Annual 2026",    framework:"Internal",  region:"Global",       generatedBy:"Marcus Johnson", generatedAt:"2026-01-15 09:00", format:"PDF+XLSX", size:"9.1 MB", status:"completed",   recipients:["CFO","CISO"],              audience:"CFO + CISO",         freq:"Annual",    nextDue:"2027-01-15" },
  { id:"RPT-011", name:"SAMA CSF Q1 2026 Cybersecurity Report",          framework:"SAMA CSF",  region:"Saudi Arabia", generatedBy:"Sarah Chen",     generatedAt:"2026-05-20 14:00", format:"PDF",      size:"0.0 MB", status:"in-progress", recipients:["CISO","SAMA"],             audience:"CISO + Regulator",   freq:"Quarterly", nextDue:"2026-06-30", progress:35 },
  { id:"RPT-012", name:"NCA ECC 2025 Annual Compliance Report",          framework:"NCA ECC",   region:"Saudi Arabia", generatedBy:"Priya Patel",    generatedAt:"2026-01-31 10:30", format:"PDF+DOCX", size:"7.4 MB", status:"completed",   recipients:["CISO","NCA"],              audience:"CISO + NCA",         freq:"Annual",    nextDue:"2027-01-31" },
  { id:"RPT-013", name:"PDPL Privacy Impact Assessment — Q2 2026",       framework:"PDPL",      region:"Saudi Arabia", generatedBy:"Priya Patel",    generatedAt:"2026-05-15 11:00", format:"PDF+DOCX", size:"2.9 MB", status:"completed",   recipients:["DPO","NDMO"],              audience:"DPO + NDMO",         freq:"Quarterly", nextDue:"2026-09-15" },
  { id:"RPT-014", name:"CITC Annual Cybersecurity Report 2025",          framework:"CITC",      region:"Saudi Arabia", generatedBy:"Alex Kim",       generatedAt:"2025-12-31 15:00", format:"PDF",      size:"5.1 MB", status:"completed",   recipients:["CISO","CITC"],             audience:"CISO + CITC",        freq:"Annual",    nextDue:"2026-12-31" },
  { id:"RPT-015", name:"ZATCA E-Invoicing Phase 2 — Security Audit",     framework:"ZATCA",     region:"Saudi Arabia", generatedBy:"Ryan Johnson",   generatedAt:"2026-02-15 09:00", format:"PDF",      size:"3.3 MB", status:"completed",   recipients:["Finance","IT Security"],   audience:"Finance + IT",       freq:"Annual",    nextDue:"2027-02-15" },
  { id:"RPT-016", name:"NCA CCC Cloud Security Compliance — Q2 2026",    framework:"NCA CCC",   region:"Saudi Arabia", generatedBy:"Alex Kim",       generatedAt:"2026-06-10 08:30", format:"PDF+XLSX", size:"0.0 MB", status:"failed",      error:"Report generation failed: CAASM asset inventory sync timeout. Retry or contact support.",  recipients:["CISO","NCA"],  audience:"CISO + NCA",  freq:"Quarterly", nextDue:"2026-06-30" },
];

/* ─── Scheduled Reports ─── */
const SCHEDULED_REPORTS: ScheduledReport[] = [
  { id:"SCH-001", name:"ISO 27001 Monthly Controls Dashboard",    templateId:"TPL-008", framework:"ISO 27001",  frequency:"Monthly",   nextRun:"2026-07-01", lastRun:"2026-06-01", lastStatus:"completed", status:"active",  recipients:["CISO","Board"],          format:"PDF+XLSX", createdBy:"Sarah Chen" },
  { id:"SCH-002", name:"SOC 2 Evidence Summary",                  templateId:"TPL-009", framework:"SOC 2",      frequency:"Quarterly", nextRun:"2026-08-31", lastRun:"2026-05-31", lastStatus:"completed", status:"active",  recipients:["External Auditor"],      format:"PDF",      createdBy:"Priya Patel" },
  { id:"SCH-003", name:"GDPR Processing Activities Report",       templateId:"TPL-010", framework:"GDPR",       frequency:"Monthly",   nextRun:"2026-07-01", lastRun:"2026-06-01", lastStatus:"completed", status:"active",  recipients:["DPO","Legal"],           format:"PDF",      createdBy:"Priya Patel" },
  { id:"SCH-004", name:"Risk Register Executive Summary",         templateId:"TPL-017", framework:"Internal",   frequency:"Weekly",    nextRun:"2026-06-17", lastRun:"2026-06-10", lastStatus:"completed", status:"active",  recipients:["Board","CRO"],           format:"PDF+PPTX", createdBy:"Marcus Johnson" },
  { id:"SCH-005", name:"Board Security Briefing Pack",            templateId:"TPL-022", framework:"Internal",   frequency:"Monthly",   nextRun:"2026-07-01", lastRun:"2026-06-01", lastStatus:"completed", status:"active",  recipients:["Board"],                 format:"PDF+PPTX", createdBy:"Emma Wilson" },
  { id:"SCH-006", name:"SAMA CSF Quarterly Assessment",           templateId:"TPL-001", framework:"SAMA CSF",   frequency:"Quarterly", nextRun:"2026-09-30", lastRun:"2026-05-20", lastStatus:"failed",    status:"error",   recipients:["CISO","SAMA"],           format:"PDF",      createdBy:"Sarah Chen" },
  { id:"SCH-007", name:"Weekly Vulnerability Management",         templateId:"TPL-013", framework:"Internal",   frequency:"Weekly",    nextRun:"2026-06-17", lastRun:"2026-06-03", lastStatus:"failed",    status:"error",   recipients:["IT Security"],           format:"PDF+XLSX", createdBy:"Alex Kim" },
  { id:"SCH-008", name:"NCA ECC Annual Report",                   templateId:"TPL-002", framework:"NCA ECC",    frequency:"Annual",    nextRun:"2027-01-31", lastRun:"2026-01-31", lastStatus:"completed", status:"paused",  recipients:["CISO","NCA"],            format:"PDF",      createdBy:"Priya Patel" },
  { id:"SCH-009", name:"NIS2 Quarterly Readiness",                templateId:"TPL-011", framework:"NIS2",       frequency:"Quarterly", nextRun:"2026-09-30", lastRun:"2026-03-31", lastStatus:"completed", status:"active",  recipients:["CISO","Legal"],          format:"PDF",      createdBy:"Sarah Chen" },
  { id:"SCH-010", name:"DSAR Fulfilment Metrics",                 templateId:"TPL-020", framework:"GDPR",       frequency:"Monthly",   nextRun:"2026-06-30", lastRun:"2026-05-31", lastStatus:"completed", status:"active",  recipients:["DPO","Legal"],           format:"PDF+XLSX", createdBy:"Priya Patel" },
];

/* ─── Style Maps ─── */
const sev: Record<string, { bg: string; color: string; border: string }> = {
  Critical: { bg:"rgba(239,68,68,0.08)",  color:RED, border:"rgba(239,68,68,0.3)"  },
  High:     { bg:"rgba(251,191,36,0.08)", color:AMB, border:"rgba(251,191,36,0.3)" },
  Medium:   { bg:"rgba(99,179,237,0.10)", color:BLU, border:"rgba(99,179,237,0.3)" },
  Low:      { bg:"rgba(52,211,153,0.08)", color:EME, border:"rgba(52,211,153,0.3)" },
};
const statusStyle: Record<string, { bg: string; color: string; border: string }> = {
  "open":         { bg:"rgba(239,68,68,0.08)",   color:RED, border:"rgba(239,68,68,0.3)"   },
  "in-review":    { bg:"rgba(251,191,36,0.08)",  color:AMB, border:"rgba(251,191,36,0.3)"  },
  "closed":       { bg:"rgba(52,211,153,0.08)",  color:EME, border:"rgba(52,211,153,0.3)"  },
  "in-progress":  { bg:"rgba(99,179,237,0.10)",  color:BLU, border:"rgba(99,179,237,0.3)"  },
  "planned":      { bg:"rgba(148,163,184,0.08)", color:"rgba(148,163,184,0.8)", border:"rgba(148,163,184,0.2)" },
  "completed":    { bg:"rgba(52,211,153,0.08)",  color:EME, border:"rgba(52,211,153,0.3)"  },
  "generated":    { bg:"rgba(52,211,153,0.08)",  color:EME, border:"rgba(52,211,153,0.3)"  },
  "overdue":      { bg:"rgba(239,68,68,0.08)",   color:RED, border:"rgba(239,68,68,0.3)"   },
  "scheduled":    { bg:"rgba(99,179,237,0.10)",  color:BLU, border:"rgba(99,179,237,0.3)"  },
  "failed":       { bg:"rgba(239,68,68,0.08)",   color:RED, border:"rgba(239,68,68,0.3)"   },
  "pending":      { bg:"rgba(251,191,36,0.08)",  color:AMB, border:"rgba(251,191,36,0.3)"  },
  "active":       { bg:"rgba(52,211,153,0.08)",  color:EME, border:"rgba(52,211,153,0.3)"  },
  "paused":       { bg:"rgba(148,163,184,0.08)", color:"rgba(148,163,184,0.8)", border:"rgba(148,163,184,0.2)" },
  "error":        { bg:"rgba(239,68,68,0.08)",   color:RED, border:"rgba(239,68,68,0.3)"   },
};
const levelColor: Record<string, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg:"rgba(239,68,68,0.08)",  color:RED, border:"rgba(239,68,68,0.3)"  },
  ERROR:    { bg:"rgba(251,191,36,0.08)", color:AMB, border:"rgba(251,191,36,0.3)" },
  WARN:     { bg:"rgba(251,191,36,0.06)", color:AMB, border:"rgba(251,191,36,0.25)"},
  INFO:     { bg:"rgba(99,179,237,0.10)", color:BLU, border:"rgba(99,179,237,0.25)"},
};
const catColors: Record<string, string> = {
  "KSA Regulatory": "#F59E0B",
  "Compliance":     BLU,
  "Security":       RED,
  "Privacy":        PRP,
  "Risk":           AMB,
  "Executive":      EME,
  "Financial":      ORG,
};
const regionColors: Record<string, string> = {
  "Saudi Arabia": "#10B981",
  "EU":           BLU,
  "USA":          AMB,
  "Global":       "rgba(148,163,184,0.9)",
  "UK":           PRP,
  "UAE":          "#F97316",
  "India":        "#EF4444",
  "Singapore":    "#06B6D4",
  "Australia":    "#FACC15",
  "Canada":       "#E879F9",
  "Qatar":        "#34D399",
  "Bahrain":      "#FB7185",
  "Pakistan":     "#4ADE80",
  "Hong Kong":    "#818CF8",
};

/* ─── Shared UI Components ─── */
function StatusBadge({ status }: { status: string }) {
  const s = statusStyle[status] ?? statusStyle["planned"];
  return <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{status.replace(/-/g," ").toUpperCase()}</span>;
}
function SevBadge({ severity }: { severity: string }) {
  const s = sev[severity] ?? sev.Low;
  return <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{severity.toUpperCase()}</span>;
}
function KpiBar({ label, value, color, border, sub }: { label:string; value:number|string; color:string; border:string; sub?:string }) {
  return (
    <div style={{ background:CARD, border:`1px solid ${border}`, borderRadius:12, padding:"14px 18px", position:"relative", overflow:"hidden", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color, opacity:0.7, borderRadius:"12px 12px 0 0" }} />
      <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{sub}</div>}
    </div>
  );
}
function FmtChip({ fmt }: { fmt: string }) {
  return <span style={{ background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700, color:"var(--foreground)", marginRight:4 }}>{fmt}</span>;
}
function CatChip({ cat }: { cat: string }) {
  const c = catColors[cat] ?? BLU;
  return <span style={{ background:`${c}18`, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{cat}</span>;
}
function RegionChip({ region }: { region: string }) {
  const c = regionColors[region] ?? "rgba(148,163,184,0.8)";
  return <span style={{ background:`${c}18`, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{region}</span>;
}
function FilterBtn({ active, label, color, onClick }: { active:boolean; label:string; color?:string; onClick:()=>void }) {
  const c = color ?? BLU;
  return (
    <button onClick={onClick} style={{
      padding:"4px 12px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderRadius:6, border:"1px solid",
      background: active ? `${c}20` : CARD,
      color: active ? c : "var(--muted-foreground)",
      borderColor: active ? `${c}60` : "var(--border)",
      transition:"all 0.15s",
    }}>{label}</button>
  );
}
function ActionBtn({ label, color, onClick }: { label:string; color?:string; onClick?:()=>void }) {
  const c = color ?? BLU;
  return (
    <button onClick={e => { e.stopPropagation(); onClick?.(); }} style={{
      padding:"3px 10px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
      borderRadius:5, border:`1px solid ${c}50`, background:`${c}15`, color:c,
      transition:"background 0.15s",
    }}>{label}</button>
  );
}

/* ─── Template Card ─── */
function TemplateCard({ tpl, onClick }: { tpl: ReportTemplate; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const c = catColors[tpl.category] ?? BLU;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:CARD, border:`1px solid ${hov ? c+"50" : "var(--border)"}`,
        borderRadius:12, padding:"18px 20px", cursor:"pointer",
        boxShadow: hov ? `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${c}30` : "0 2px 12px rgba(0,0,0,0.4)",
        transition:"all 0.2s", position:"relative", overflow:"hidden",
      }}
    >
      {tpl.popular && (
        <div style={{ position:"absolute", top:12, right:12, background:`${EME}20`, border:`1px solid ${EME}50`, color:EME, fontSize:9, fontWeight:800, borderRadius:4, padding:"1px 6px" }}>POPULAR</div>
      )}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:c, opacity:0.6, borderRadius:"12px 12px 0 0" }} />
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        <CatChip cat={tpl.category} />
        <RegionChip region={tpl.region} />
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:6, lineHeight:1.35 }}>{tpl.name}</div>
      <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.55, marginBottom:12, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const }}>{tpl.description}</div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>~{tpl.estimatedPages}p</span>
          <span style={{ color:"rgba(255,255,255,0.15)", fontSize:10 }}>·</span>
          {tpl.formats.map(f => <FmtChip key={f} fmt={f} />)}
        </div>
        <span style={{ fontSize:10, fontWeight:700, color:c, background:`${c}15`, border:`1px solid ${c}40`, borderRadius:5, padding:"3px 10px", transition:"background 0.15s" }}>Generate →</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AnalyticsOps() {
  const [tab, setTab]                       = useState("dashboard");
  const [reportSubTab, setReportSubTab]     = useState("myreports");
  const [levelFilter, setLevelFilter]       = useState("ALL");
  const [sevFilter, setSevFilter]           = useState("ALL");
  const [statusFilter, setStatusFilter]     = useState("ALL");
  const [findings, setFindings]             = useState<AuditFinding[]>([]);
  const [plans, setPlans]                   = useState<AuditPlan[]>([]);
  const [loading, setLoading]               = useState(false);

  // Report-specific state
  const [tplCategory, setTplCategory]       = useState("All");
  const [tplRegion, setTplRegion]           = useState("All");
  const [tplSearch, setTplSearch]           = useState("");
  const [myRptFilter, setMyRptFilter]       = useState("All");
  const [myRptSearch, setMyRptSearch]       = useState("");
  const [schedFilter, setSchedFilter]       = useState("All");

  // Drawer selection state
  const [selFinding, setSelFinding]         = useState<AuditFinding | null>(null);
  const [selPlan, setSelPlan]               = useState<AuditPlan | null>(null);
  const [selTemplate, setSelTemplate]       = useState<ReportTemplate | null>(null);
  const [selMyReport, setSelMyReport]       = useState<MyReport | null>(null);
  const [selSchedule, setSelSchedule]       = useState<ScheduledReport | null>(null);
  const [generating, setGenerating]         = useState<string | null>(null);
  const [previewReport, setPreviewReport]   = useState<MyReport | null>(null);
  const [shareReport, setShareReport]       = useState<MyReport | null>(null);
  const [shareEmail, setShareEmail]         = useState("");
  const [shareCopied, setShareCopied]       = useState(false);

  function handleDownload(r: MyReport) {
    const lines = [
      `AIGO-X GRC Platform — Report Export`,
      `${"=".repeat(60)}`,
      `Report ID:    ${r.id}`,
      `Report Name:  ${r.name}`,
      `Framework:    ${r.framework}`,
      `Region:       ${r.region}`,
      `Generated By: ${r.generatedBy}`,
      `Generated At: ${r.generatedAt}`,
      `Format:       ${r.format}`,
      `Audience:     ${r.audience}`,
      `Recipients:   ${r.recipients.join(", ")}`,
      `Frequency:    ${r.freq}`,
      `Next Due:     ${r.nextDue ?? "—"}`,
      ``,
      `${"=".repeat(60)}`,
      `Report Content (Preview)`,
      `${"=".repeat(60)}`,
      `This is an exported summary of the ${r.name}.`,
      ``,
      `In the full production environment, this file would contain:`,
      `• Full compliance control assessment results`,
      `• Evidence matrices and supporting documentation`,
      `• Executive summary and recommendations`,
      `• Regulatory mapping and gap analysis`,
      `• Remediation roadmap with priorities`,
      ``,
      `Generated by AIGO-X GRC Platform`,
      `Export timestamp: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([lines], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${r.id}-${r.name.replace(/[^a-z0-9]/gi,"_").slice(0,40)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  function handleCopyLink(r: MyReport) {
    const link = `https://app.aigo-x.io/reports/${r.id}?token=preview`;
    navigator.clipboard.writeText(link).catch(()=>{});
    setShareCopied(true);
    setTimeout(()=>setShareCopied(false), 2000);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fr, pr] = await Promise.all([
        fetch(apiUrl("/audit/findings"), { headers: H() }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(apiUrl("/audit/plans"),    { headers: H() }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (Array.isArray(fr) && fr.length > 0) setFindings(fr);
      if (Array.isArray(pr) && pr.length > 0) setPlans(pr);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const tabs = [
    { key:"dashboard", label:"Dashboard",                                 dot: "#34D399"            },
    { key:"findings",  label:"Audit Findings", count: findings.length                               },
    { key:"plans",     label:"Audit Plans",    count: plans.length                                  },
    { key:"logs",      label:"Audit Logs",     count: STATIC_LOGS.length                            },
    { key:"reports",   label:"Reports",        count: MY_REPORTS.length                             },
  ];

  const filteredFindings = findings.filter(f =>
    (sevFilter === "ALL" || f.severity === sevFilter) &&
    (statusFilter === "ALL" || f.status === statusFilter)
  );
  const filteredLogs = levelFilter === "ALL" ? STATIC_LOGS : STATIC_LOGS.filter(l => l.level === levelFilter);

  /* Report filters */
  const filteredTemplates = useMemo(() => REPORT_TEMPLATES.filter(t =>
    (tplCategory === "All" || t.category === tplCategory) &&
    (tplRegion === "All" || t.region === tplRegion) &&
    (tplSearch === "" || t.name.toLowerCase().includes(tplSearch.toLowerCase()) || t.framework.toLowerCase().includes(tplSearch.toLowerCase()) || t.tags.some(tg => tg.toLowerCase().includes(tplSearch.toLowerCase())))
  ), [tplCategory, tplRegion, tplSearch]);

  const filteredMyReports = useMemo(() => MY_REPORTS.filter(r =>
    (myRptFilter === "All" || r.status === myRptFilter.toLowerCase() || (myRptFilter === "Failed" && r.status === "failed")) &&
    (myRptSearch === "" || r.name.toLowerCase().includes(myRptSearch.toLowerCase()) || r.framework.toLowerCase().includes(myRptSearch.toLowerCase()))
  ), [myRptFilter, myRptSearch]);

  const filteredSchedules = useMemo(() => SCHEDULED_REPORTS.filter(s =>
    schedFilter === "All" || s.status === schedFilter.toLowerCase()
  ), [schedFilter]);

  const fKpis = [
    { label:"Total Findings",  value:findings.length,                                                         color:BLU, border:"rgba(99,179,237,0.3)"  },
    { label:"Critical / High", value:findings.filter(f=>f.severity==="Critical"||f.severity==="High").length, color:RED, border:"rgba(239,68,68,0.3)"   },
    { label:"Open",            value:findings.filter(f=>f.status==="open").length,                            color:AMB, border:"rgba(251,191,36,0.3)"  },
    { label:"In Review",       value:findings.filter(f=>f.status==="in-review").length,                       color:BLU, border:"rgba(99,179,237,0.3)"  },
    { label:"Closed (MTD)",    value:findings.filter(f=>f.status==="closed").length,                          color:EME, border:"rgba(52,211,153,0.3)"  },
  ];
  const pKpis = [
    { label:"Total Audits",   value:plans.length,                                                 color:BLU, border:"rgba(99,179,237,0.3)"  },
    { label:"In Progress",    value:plans.filter(p=>p.status==="in-progress").length,             color:AMB, border:"rgba(251,191,36,0.3)"  },
    { label:"Planned",        value:plans.filter(p=>p.status==="planned").length,                 color:"rgba(148,163,184,0.8)", border:"rgba(148,163,184,0.2)" },
    { label:"Total Findings", value:plans.reduce((s,p)=>s+(p.findings??0),0),                     color:RED, border:"rgba(239,68,68,0.3)"   },
    { label:"Avg Completion", value:`${Math.round(plans.reduce((s,p)=>s+(p.progress??0),0)/Math.max(plans.length,1))}%`, color:EME, border:"rgba(52,211,153,0.3)"  },
  ];

  function handleGenerate(tpl: ReportTemplate) {
    setGenerating(tpl.id);
    setTimeout(() => setGenerating(null), 2500);
  }

  const tplCategories = ["All","KSA Regulatory","Compliance","Security","Privacy","Risk","Executive","Financial"];
  const tplRegions    = ["All","Global","Saudi Arabia","EU","USA","UK","UAE","India","Singapore","Australia","Canada","Qatar","Bahrain","Pakistan","Hong Kong"];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>

      {/* ── Finding Drawer ── */}
      {selFinding && (
        <Drawer open title={`${selFinding.id} — ${selFinding.title}`} subtitle={`${selFinding.severity} · ${selFinding.category} · ${selFinding.status}`}
          onClose={() => setSelFinding(null)} headerColor={selFinding.severity==="Critical"?"#7F1D1D":selFinding.severity==="High"?"#78350F":"#1E3A5F"} width={560}>
          <DrawerSection title="Finding Details" />
          <Field label="Finding ID"      value={selFinding.id} mono />
          <Field label="Title"           value={selFinding.title} />
          <Field label="Severity"        value={<SevBadge severity={selFinding.severity} />} />
          <Field label="Status"          value={<StatusBadge status={selFinding.status} />} />
          <Field label="Category"        value={selFinding.category} />
          <Field label="Related Control" value={selFinding.control} mono />
          <Field label="Audit Plan"      value={selFinding.auditPlan} mono />
          <Field label="Owner"           value={selFinding.owner} />
          <Field label="Due Date"        value={selFinding.dueDate} />
          {selFinding.description && (<><DrawerSection title="Description" /><div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.65 }}>{selFinding.description}</div></>)}
          {selFinding.recommendation && (<><DrawerSection title="Recommendation" /><div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.65, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:8, padding:"10px 12px" }}>{selFinding.recommendation}</div></>)}
          {selFinding.management_response && (<><DrawerSection title="Management Response" /><div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.65, background:"rgba(99,179,237,0.06)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:8, padding:"10px 12px" }}>{selFinding.management_response}</div></>)}
          {selFinding.aiInsights && <><DrawerSection title="AI Analysis" /><AiInsightBox insights={selFinding.aiInsights} /></>}
        </Drawer>
      )}

      {/* ── Plan Drawer ── */}
      {selPlan && (
        <Drawer open title={`${selPlan.id} — ${selPlan.name}`} subtitle={`${selPlan.type} Audit · ${selPlan.framework}`}
          onClose={() => setSelPlan(null)} headerColor="#1E3A5F" width={560}>
          <DrawerSection title="Audit Plan" />
          <Field label="Plan ID"       value={selPlan.id} mono />
          <Field label="Name"          value={selPlan.name} />
          <Field label="Type"          value={selPlan.type} />
          <Field label="Status"        value={<StatusBadge status={selPlan.status} />} />
          <Field label="Framework"     value={selPlan.framework} />
          <Field label="Auditor"       value={selPlan.auditor} />
          <Field label="Scope"         value={selPlan.scope} />
          <Field label="Start Date"    value={selPlan.startDate} />
          <Field label="End Date"      value={selPlan.endDate} />
          <Field label="Open Findings" value={selPlan.findings ?? 0} mono />
          <DrawerSection title="Completion Progress" />
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Progress</span>
              <span style={{ fontSize:13, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:BLU }}>{selPlan.progress ?? 0}%</span>
            </div>
            <div style={{ height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${selPlan.progress ?? 0}%`, background:`linear-gradient(90deg,${BLU},${EME})`, borderRadius:4, transition:"width 0.8s ease" }} />
            </div>
          </div>
          {selPlan.aiInsights && <><DrawerSection title="AI Analysis" /><AiInsightBox insights={selPlan.aiInsights} /></>}
        </Drawer>
      )}

      {/* ── Template Drawer ── */}
      {selTemplate && (
        <Drawer open title={selTemplate.name} subtitle={`${selTemplate.framework} · ${selTemplate.category} · ${selTemplate.region}`}
          onClose={() => setSelTemplate(null)} headerColor="#0F172A" width={580}>
          <DrawerSection title="Template Overview" />
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <CatChip cat={selTemplate.category} />
            <RegionChip region={selTemplate.region} />
            {selTemplate.popular && <span style={{ background:`${EME}20`, color:EME, border:`1px solid ${EME}50`, fontSize:10, fontWeight:800, borderRadius:4, padding:"2px 8px" }}>POPULAR</span>}
          </div>
          <Field label="Framework"        value={selTemplate.framework} />
          <Field label="Region"           value={selTemplate.region} />
          <Field label="Category"         value={selTemplate.category} />
          <Field label="Estimated Pages"  value={`~${selTemplate.estimatedPages} pages`} />
          <Field label="Output Formats"   value={selTemplate.formats.join(" · ")} />
          <DrawerSection title="Description" />
          <div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.65, marginBottom:4 }}>{selTemplate.description}</div>
          <DrawerSection title="Report Sections" />
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {selTemplate.sections.map((s, i) => (
              <div key={s} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:7 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", minWidth:20 }}>{String(i+1).padStart(2,"0")}</span>
                <span style={{ fontSize:12, color:"var(--foreground)" }}>{s}</span>
              </div>
            ))}
          </div>
          <DrawerSection title="Tags" />
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {selTemplate.tags.map(t => <span key={t} style={{ background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:4, padding:"2px 8px", fontSize:10, color:"rgba(148,163,184,0.8)" }}>{t}</span>)}
          </div>
          <DrawerSection title="Actions" />
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button onClick={() => { handleGenerate(selTemplate); setSelTemplate(null); }} style={{ flex:1, padding:"10px 20px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${BLU},${EME})`, color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              ⚡ Generate Report Now
            </button>
            <button onClick={() => setSelTemplate(null)} style={{ padding:"10px 18px", borderRadius:8, border:`1px solid ${PRP}50`, background:`${PRP}15`, color:PRP, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              🗓 Schedule
            </button>
          </div>
        </Drawer>
      )}

      {/* ── My Report Drawer ── */}
      {selMyReport && (
        <Drawer open title={selMyReport.name} subtitle={`${selMyReport.framework} · ${selMyReport.freq}`}
          onClose={() => setSelMyReport(null)} headerColor={selMyReport.status==="failed"?"#7F1D1D":selMyReport.status==="overdue"?"#78350F":"#0F2040"} width={560}>
          <DrawerSection title="Report Details" />
          <Field label="Report ID"     value={selMyReport.id} mono />
          <Field label="Status"        value={<StatusBadge status={selMyReport.status} />} />
          <Field label="Framework"     value={selMyReport.framework} />
          <Field label="Region"        value={selMyReport.region} />
          <Field label="Generated By"  value={selMyReport.generatedBy} />
          <Field label="Generated At"  value={selMyReport.generatedAt} mono />
          <Field label="Format"        value={selMyReport.format} />
          <Field label="File Size"     value={selMyReport.size || "—"} mono />
          <Field label="Frequency"     value={selMyReport.freq} />
          <Field label="Next Due"      value={selMyReport.nextDue ?? "—"} />
          <Field label="Audience"      value={selMyReport.audience} />
          <Field label="Recipients"    value={selMyReport.recipients.join(", ")} />
          {selMyReport.status === "in-progress" && selMyReport.progress !== undefined && (
            <><DrawerSection title="Generation Progress" />
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Progress</span>
                <span style={{ fontSize:13, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:BLU }}>{selMyReport.progress}%</span>
              </div>
              <div style={{ height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${selMyReport.progress}%`, background:`linear-gradient(90deg,${BLU},${AMB})`, borderRadius:4 }} />
              </div>
            </div></>
          )}
          {selMyReport.error && (
            <><DrawerSection title="Error Details" />
            <div style={{ fontSize:12, color:RED, lineHeight:1.6, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"10px 12px" }}>{selMyReport.error}</div></>
          )}
          {selMyReport.status === "completed" && (
            <><DrawerSection title="Actions" />
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <button onClick={()=>handleDownload(selMyReport)} style={{ flex:1, padding:"9px 16px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${BLU},${EME})`, color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>⬇ Download Report</button>
              <button onClick={()=>{setPreviewReport(selMyReport);setSelMyReport(null);}} style={{ padding:"9px 14px", borderRadius:8, border:`1px solid rgba(255,255,255,0.12)`, background:"var(--secondary)", color:"var(--foreground)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>👁 Preview</button>
              <button onClick={()=>{setShareReport(selMyReport);setShareEmail("");setShareCopied(false);setSelMyReport(null);}} style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${PRP}50`, background:`${PRP}15`, color:PRP, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✉ Share</button>
            </div></>
          )}
          {selMyReport.status === "failed" && (
            <><DrawerSection title="Actions" />
            <button onClick={()=>{}} style={{ width:"100%", padding:"9px 16px", borderRadius:8, border:`1px solid ${AMB}50`, background:`${AMB}15`, color:AMB, fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>↺ Retry Generation</button></>
          )}
        </Drawer>
      )}

      {/* ── Schedule Drawer ── */}
      {selSchedule && (
        <Drawer open title={selSchedule.name} subtitle={`${selSchedule.framework} · ${selSchedule.frequency}`}
          onClose={() => setSelSchedule(null)} headerColor={selSchedule.status==="error"?"#7F1D1D":selSchedule.status==="paused"?"#1E293B":"#0F2040"} width={540}>
          <DrawerSection title="Schedule Details" />
          <Field label="Schedule ID"    value={selSchedule.id} mono />
          <Field label="Status"         value={<StatusBadge status={selSchedule.status} />} />
          <Field label="Framework"      value={selSchedule.framework} />
          <Field label="Frequency"      value={selSchedule.frequency} />
          <Field label="Next Run"       value={selSchedule.nextRun} mono />
          <Field label="Last Run"       value={selSchedule.lastRun ?? "Never"} mono />
          <Field label="Last Run Status" value={selSchedule.lastStatus ? <StatusBadge status={selSchedule.lastStatus} /> : "—"} />
          <Field label="Output Format"  value={selSchedule.format} />
          <Field label="Created By"     value={selSchedule.createdBy} />
          <Field label="Recipients"     value={selSchedule.recipients.join(", ")} />
          <DrawerSection title="Run History" />
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {[
              { date: selSchedule.lastRun ?? "—", status: selSchedule.lastStatus ?? "pending", note:"Latest run" },
              { date:"2026-03-31", status:"completed", note:"Previous run" },
              { date:"2025-12-31", status:"completed", note:"Earlier run" },
            ].map((h, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:7 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)", flex:1 }}>{h.date}</span>
                <StatusBadge status={h.status} />
                <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{h.note}</span>
              </div>
            ))}
          </div>
          <DrawerSection title="Actions" />
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button style={{ flex:1, padding:"9px 16px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${BLU},${EME})`, color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>▶ Run Now</button>
            <button style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${AMB}50`, background:`${AMB}15`, color:AMB, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              {selSchedule.status === "paused" ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button style={{ padding:"9px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✎ Edit</button>
            <button style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${RED}50`, background:`${RED}15`, color:RED, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✕ Delete</button>
          </div>
        </Drawer>
      )}

      {/* ── Preview Report Modal ── */}
      {previewReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setPreviewReport(null)}>
          <div style={{ background:"var(--card)", border:`1px solid ${BLU}40`, borderRadius:16, padding:"28px 32px", width:600, maxHeight:"80vh", overflowY:"auto", display:"flex", flexDirection:"column", gap:14, boxShadow:`0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px ${BLU}20` }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:"var(--foreground)", marginBottom:4, lineHeight:1.3 }}>{previewReport.name}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <span style={{ background:`${BLU}18`, color:BLU, border:`1px solid ${BLU}40`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{previewReport.framework}</span>
                  <span style={{ background:`${EME}18`, color:EME, border:`1px solid ${EME}40`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{previewReport.region}</span>
                  <StatusBadge status={previewReport.status} />
                </div>
              </div>
              <button onClick={()=>setPreviewReport(null)} style={{ background:"none", border:"none", color:"var(--muted-foreground)", fontSize:18, cursor:"pointer", padding:"2px 6px", lineHeight:1 }}>✕</button>
            </div>
            <div style={{ height:1, background:"var(--border)" }} />
            {[
              ["Report ID",    previewReport.id],
              ["Generated By", previewReport.generatedBy],
              ["Generated At", previewReport.generatedAt],
              ["Format",       previewReport.format],
              ["File Size",    previewReport.size],
              ["Audience",     previewReport.audience],
              ["Recipients",   previewReport.recipients.join(", ")],
              ["Frequency",    previewReport.freq],
              ["Next Due",     previewReport.nextDue ?? "—"],
            ].map(([k,v])=>(
              <div key={k} style={{ display:"flex", gap:12, alignItems:"baseline" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", minWidth:110 }}>{k}</span>
                <span style={{ fontSize:12, color:"var(--foreground)", fontFamily: k==="Report ID"||k==="Generated At"||k==="File Size"?"'JetBrains Mono',monospace":"inherit" }}>{v}</span>
              </div>
            ))}
            <div style={{ height:1, background:"var(--border)" }} />
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6 }}>REPORT CONTENT PREVIEW</div>
            <div style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:BLU, marginBottom:10 }}>Executive Summary</div>
              <div style={{ fontSize:12, color:"rgba(203,213,225,0.85)", lineHeight:1.7 }}>
                This {previewReport.framework} compliance report covers the period ending {previewReport.generatedAt.slice(0,10)}. The assessment was conducted by {previewReport.generatedBy} and distributed to {previewReport.audience}.
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:BLU, margin:"14px 0 8px" }}>Compliance Status</div>
              {[
                ["Controls Assessed",  "94"],
                ["Controls Passed",    "87"],
                ["Controls Failed",    "7"],
                ["Compliance Score",   "92.6%"],
                ["Risk Rating",        "Medium"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11 }}>
                  <span style={{ color:"var(--muted-foreground)" }}>{k}</span>
                  <span style={{ color:"var(--foreground)", fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>handleDownload(previewReport)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${BLU},${EME})`, color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>⬇ Download Full Report</button>
              <button onClick={()=>{setShareReport(previewReport);setPreviewReport(null);setShareEmail("");setShareCopied(false);}} style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${PRP}50`, background:`${PRP}15`, color:PRP, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>✉ Share</button>
              <button onClick={()=>setPreviewReport(null)} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"rgba(148,163,184,0.8)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Report Modal ── */}
      {shareReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShareReport(null)}>
          <div style={{ background:"var(--card)", border:`1px solid ${PRP}40`, borderRadius:16, padding:"28px 32px", width:480, display:"flex", flexDirection:"column", gap:16, boxShadow:`0 24px 80px rgba(0,0,0,0.9)` }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>✉ Share Report</div>
              <button onClick={()=>setShareReport(null)} style={{ background:"none", border:"none", color:"var(--muted-foreground)", fontSize:18, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ fontSize:12, color:"rgba(148,163,184,0.8)", lineHeight:1.5 }}>Share <strong style={{ color:BLU }}>{shareReport.name}</strong></div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6 }}>SHAREABLE LINK</div>
              <div style={{ display:"flex", gap:8 }}>
                <div style={{ flex:1, padding:"8px 12px", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  https://app.aigo-x.io/reports/{shareReport.id}
                </div>
                <button onClick={()=>handleCopyLink(shareReport)} style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${shareCopied?EME+"60":BLU+"40"}`, background:shareCopied?`${EME}18`:`${BLU}15`, color:shareCopied?EME:BLU, fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.2s" }}>
                  {shareCopied?"✓ Copied!":"Copy Link"}
                </button>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6 }}>EMAIL TO RECIPIENT</div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="recipient@company.com" style={{ flex:1, padding:"8px 12px", background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
                <button onClick={()=>{if(shareEmail.trim()){setShareEmail("");alert(`Report link sent to ${shareEmail}`);setShareReport(null);}}} style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${PRP}40`, background:`${PRP}15`, color:PRP, fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>Send</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>CURRENT RECIPIENTS</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {shareReport.recipients.map(rec=>(
                  <span key={rec} style={{ background:`${EME}18`, color:EME, border:`1px solid ${EME}40`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{rec}</span>
                ))}
              </div>
            </div>
            <button onClick={()=>setShareReport(null)} style={{ padding:"10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--muted-foreground)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Close</button>
          </div>
        </div>
      )}

      {/* ── Generate Toast ── */}
      {generating && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"rgba(13,17,26,0.97)", border:`1px solid ${EME}50`, borderRadius:12, padding:"14px 20px", boxShadow:`0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${EME}30`, zIndex:9999, display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:18, height:18, border:`2px solid ${EME}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
          <span style={{ fontSize:12, fontWeight:700, color:EME }}>Generating report…</span>
        </div>
      )}

      <ModuleHeader
        title="AnalyticsOps — GRC Analytics & Reporting"
        description="Dashboard · Audit Findings · Plans · Logs · Reports · Templates · Scheduler"
        action={{ label:"+ Generate Report", onClick:() => { setTab("reports"); setReportSubTab("templates"); } }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />
      <AICopilotBar module="analyticsops" />
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Row 1: GRC Composite Score + Module Health Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"20px 16px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:12 }}>GRC Health Score</div>
                <svg width="160" height="96" viewBox="0 0 160 96" style={{ overflow:"visible" }}>
                  <defs>
                    <linearGradient id="grcGradA" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F87171"/><stop offset="50%" stopColor="#FBBF24"/><stop offset="100%" stopColor="#34D399"/>
                    </linearGradient>
                  </defs>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="var(--input)" strokeWidth="10" strokeLinecap="round"/>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="url(#grcGradA)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${0.81*195} 195`}/>
                  <text x="80" y="80" textAnchor="middle" style={{ fontSize:28, fontWeight:800, fill:"rgb(147,197,253)", fontFamily:"'JetBrains Mono', monospace" }}>81</text>
                  <text x="80" y="94" textAnchor="middle" style={{ fontSize:9, fill:"var(--muted-foreground)" }}>/ 100</text>
                </svg>
                <div style={{ fontSize:10, color:EME, fontWeight:700, marginTop:2 }}>↑ +3 vs last month</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:6, textAlign:"center", lineHeight:1.4 }}>Composite across all GRC modules</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:14, width:"100%" }}>
                  {[{ l:"Risk", v:"74", c:AMB },{ l:"Compliance", v:"87", c:EME },{ l:"Cloud", v:"71", c:BLU },{ l:"People", v:"82", c:PRP }].map(m=>(
                    <div key={m.l} style={{ background:"var(--secondary)", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.v}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {([
                  { module:"ComplianceOps", score:87, trend:3,  up:true,  color:EME, sp:[80,82,85,83,86,87] },
                  { module:"RiskOps",       score:74, trend:2,  up:false, color:AMB, sp:[78,77,76,75,74,74] },
                  { module:"CloudOps",      score:71, trend:5,  up:true,  color:BLU, sp:[62,65,67,68,70,71] },
                  { module:"PeopleOps",     score:82, trend:1,  up:true,  color:PRP, sp:[79,80,80,81,82,82] },
                  { module:"DataOps",       score:68, trend:4,  up:false, color:RED, sp:[74,73,72,70,69,68] },
                  { module:"SecOps",        score:79, trend:2,  up:true,  color:BLU, sp:[74,75,76,77,78,79] },
                ] as const).map(m=>{
                  const max=Math.max(...(m.sp as number[])), min=Math.min(...(m.sp as number[])), rng=max-min||1;
                  const pts=(m.sp as number[]).map((v,i)=>`${(i/5)*58},${19-((v-min)/rng)*16}`).join(" ");
                  const lastY=19-((m.sp[m.sp.length-1]-min)/rng)*16;
                  return (
                    <div key={m.module} style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px", cursor:"pointer" }}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.3)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:600 }}>{m.module}</div>
                          <div style={{ fontSize:24, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.color, marginTop:2 }}>{m.score}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <span style={{ fontSize:9, fontWeight:700, color:m.up?"#34D399":"#F87171", background:m.up?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)", borderRadius:4, padding:"1px 5px" }}>
                            {m.up?"↑":"↓"}{m.trend}
                          </span>
                          <svg width="60" height="22" viewBox="0 0 60 22" style={{ overflow:"visible" }}>
                            <polyline points={pts} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
                            <circle cx={58} cy={lastY} r="2.5" fill={m.color}/>
                          </svg>
                        </div>
                      </div>
                      <div style={{ height:3, borderRadius:2, background:"var(--input)", overflow:"hidden", marginTop:8 }}>
                        <div style={{ height:"100%", width:`${m.score}%`, background:`linear-gradient(90deg,${m.color}70,${m.color})`, borderRadius:2 }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Finding Trend | Framework Coverage | Audit Pipeline */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:BLU, marginBottom:4 }}>Finding Trend — 12 Months</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Audit findings opened per month</div>
                {(()=>{
                  const data=[42,38,51,47,55,44,39,48,52,46,40,35];
                  const mon=["J","A","S","O","N","D","J","F","M","A","M","J"];
                  const maxV=Math.max(...data);
                  return (
                    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:104 }}>
                      {data.map((v,i)=>{
                        const h=Math.round((v/maxV)*80);
                        const isCur=i===data.length-1;
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                            <div title={`${mon[i]}: ${v}`} style={{ width:"100%", height:h, borderRadius:"3px 3px 0 0",
                              background:isCur?`linear-gradient(180deg,${BLU},rgba(147,197,253,0.35))`:"rgba(99,179,237,0.22)",
                              border:`1px solid ${isCur?BLU+"50":"rgba(99,179,237,0.12)"}` }}/>
                            <span style={{ fontSize:7, color:"var(--muted-foreground)" }}>{mon[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:10 }}>
                  <span style={{ color:"var(--muted-foreground)" }}>Peak: <span style={{ color:RED, fontWeight:700 }}>55 Nov</span></span>
                  <span style={{ color:EME, fontWeight:700 }}>↓ 36% from peak</span>
                </div>
              </div>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:4 }}>Framework Coverage</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Controls implemented vs total</div>
                {[
                  { name:"ISO 27001",    covered:89,  total:114, color:EME },
                  { name:"SOC 2",        covered:112, total:120, color:BLU },
                  { name:"PCI DSS v4",   covered:287, total:320, color:AMB },
                  { name:"NIST CSF",     covered:76,  total:98,  color:PRP },
                  { name:"CIS Controls", covered:153, total:171, color:"#2DD4BF" },
                  { name:"NCA ECC",      covered:68,  total:84,  color:ORG },
                ].map(fw=>{
                  const pct=Math.round((fw.covered/fw.total)*100);
                  return (
                    <div key={fw.name} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                        <span style={{ fontWeight:600, color:"var(--foreground)" }}>{fw.name}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", color:fw.color, fontWeight:700 }}>{fw.covered}/{fw.total} <span style={{ color:"var(--muted-foreground)", fontWeight:400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${fw.color}70,${fw.color})`, borderRadius:3 }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:PRP, marginBottom:14 }}>Audit Pipeline by Phase</div>
                {[
                  { phase:"Planning",  count:3, color:BLU, pct:100 },
                  { phase:"Fieldwork", count:2, color:AMB, pct:67  },
                  { phase:"Review",    count:2, color:PRP, pct:33  },
                  { phase:"Reporting", count:1, color:EME, pct:22  },
                  { phase:"Closed",    count:4, color:"var(--muted-foreground)", pct:100 },
                ].map(p=>(
                  <div key={p.phase} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)", width:64, flexShrink:0 }}>{p.phase}</span>
                    <div style={{ flex:1, height:7, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${p.pct}%`, background:p.color, borderRadius:4, opacity:0.85 }}/>
                    </div>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:800, color:p.color, width:16, textAlign:"right" }}>{p.count}</span>
                  </div>
                ))}
                <div style={{ borderTop:"1px solid var(--border)", marginTop:10, paddingTop:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:8 }}>Upcoming Deadlines</div>
                  {[
                    { name:"ISO 27001 Surveillance", date:"Jul 15", color:AMB },
                    { name:"PCI DSS SAQ",            date:"Jul 28", color:RED },
                    { name:"SOC 2 Type II Close",    date:"Aug 12", color:EME },
                    { name:"NCA ECC Annual Review",  date:"Aug 31", color:BLU },
                  ].map(d=>(
                    <div key={d.name} style={{ display:"flex", justifyContent:"space-between", fontSize:10, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ color:"var(--foreground)" }}>{d.name}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:d.color, flexShrink:0, marginLeft:8 }}>{d.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Critical Findings | Platform Health */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:RED }}>Open Critical / High Findings</div>
                  <span style={{ background:"rgba(239,68,68,0.08)", color:RED, border:"1px solid rgba(252,165,165,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                    {findings.filter(f=>(f.severity==="Critical"||f.severity==="High")&&f.status==="open").length} open
                  </span>
                </div>
                {findings.filter(f=>(f.severity==="Critical"||f.severity==="High")&&f.status==="open").slice(0,6).map(f=>(
                  <div key={f.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                    onClick={()=>setSelFinding(f)}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:f.severity==="Critical"?RED:AMB, flexShrink:0 }}/>
                    <span style={{ flex:1, fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{f.title}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"var(--muted-foreground)", flexShrink:0 }}>{f.id}</span>
                  </div>
                ))}
                {findings.filter(f=>(f.severity==="Critical"||f.severity==="High")&&f.status==="open").length===0&&(
                  <div style={{ textAlign:"center", padding:"24px 0", fontSize:11, color:"var(--muted-foreground)" }}>✓ No open critical/high findings</div>
                )}
                <button onClick={()=>setTab("findings")} style={{ marginTop:12, background:"rgba(99,179,237,0.08)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:BLU, cursor:"pointer", fontFamily:"inherit" }}>
                  View All Findings →
                </button>
              </div>
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:14 }}>Platform Data Health</div>
                {([
                  { label:"Control Coverage",   value:"84%",  sub:"+2% vs last month",  color:EME, up:true  as boolean|null },
                  { label:"Evidence Complete",  value:"98%",  sub:"1,204 items tracked", color:EME, up:null  as boolean|null },
                  { label:"Policy Ack Rate",    value:"91%",  sub:"+5% vs last month",  color:PRP, up:true  as boolean|null },
                  { label:"Open Treatments",    value:"23",   sub:"6 past due",          color:AMB, up:false as boolean|null },
                  { label:"Vendor Assessments", value:"14",   sub:"2 overdue",           color:RED, up:false as boolean|null },
                  { label:"Data Freshness",     value:"Live", sub:"Last sync 2 min ago", color:EME, up:null  as boolean|null },
                ] as {label:string;value:string;sub:string;color:string;up:boolean|null}[]).map(item=>(
                  <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{item.label}</span>
                      {item.up !== null && <span style={{ fontSize:9, fontWeight:700, color:item.up?"#34D399":"#F87171" }}>{item.up?"↑":"↓"}</span>}
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:800, color:item.color }}>{item.value}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ══ FINDINGS ══ */}
        {tab === "findings" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {fKpis.map(k => <KpiBar key={k.label} {...k} />)}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>SEV:</span>
              {["ALL","Critical","High","Medium","Low"].map(s => (
                <FilterBtn key={s} label={s} active={sevFilter===s} color={sev[s]?.color ?? BLU} onClick={()=>setSevFilter(s)} />
              ))}
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)", marginLeft:8 }}>STATUS:</span>
              {["ALL","open","in-review","closed"].map(s => (
                <FilterBtn key={s} label={s.replace("-"," ").toUpperCase()} active={statusFilter===s} color={statusStyle[s]?.color ?? BLU} onClick={()=>setStatusFilter(s)} />
              ))}
              {loading && <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:8 }}>↻ syncing…</span>}
            </div>
            <TableShell
              cols={["ID","Severity","Title","Category","Control","Plan","Owner","Due","Status"]}
              rows={filteredFindings.map(f => [
                <Mono>{f.id}</Mono>,
                <SevBadge severity={f.severity} />,
                <span style={{ fontSize:12, fontWeight:600, color:"var(--foreground)" }}>{f.title}</span>,
                <span style={{ background:"rgba(99,179,237,0.10)", color:BLU, border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 6px", fontSize:10, fontWeight:700 }}>{f.category}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{f.control ?? "—"}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{f.auditPlan ?? "—"}</span>,
                <span style={{ fontSize:11, color:"var(--foreground)" }}>{f.owner ?? "—"}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{f.dueDate ?? "—"}</span>,
                <StatusBadge status={f.status} />,
              ])}
              onRowClick={i => setSelFinding(filteredFindings[i])}
            />
            <div style={{ fontSize:11, color:"var(--muted-foreground)", textAlign:"right" }}>Click any row to view full finding detail, recommendation & AI analysis</div>
          </>
        )}

        {/* ══ AUDIT PLANS ══ */}
        {tab === "plans" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {pKpis.map(k => <KpiBar key={k.label} {...k} />)}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {plans.map(p => (
                <div key={p.id} onClick={() => setSelPlan(p)}
                  style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", cursor:"pointer", transition:"border-color 0.15s, box-shadow 0.15s", boxShadow:"0 2px 12px rgba(0,0,0,0.4)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor="rgba(99,179,237,0.3)"; (e.currentTarget as HTMLDivElement).style.boxShadow="0 4px 24px rgba(0,0,0,0.6)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor="var(--border)"; (e.currentTarget as HTMLDivElement).style.boxShadow="0 2px 12px rgba(0,0,0,0.4)"; }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:10 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)", fontWeight:700 }}>{p.id}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:"rgba(99,179,237,0.1)", color:BLU, border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"1px 6px" }}>{p.type}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:"rgba(148,163,184,0.08)", color:"rgba(148,163,184,0.8)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:4, padding:"1px 6px" }}>{p.framework}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:"var(--foreground)" }}>{p.name}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{p.auditor} · {p.startDate} → {p.endDate} · Scope: {p.scope}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                      {(p.findings ?? 0) > 0 && <span style={{ background:"rgba(239,68,68,0.08)", color:RED, border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{p.findings} finding{p.findings!==1?"s":""}</span>}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, height:6, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${p.progress ?? 0}%`, background:`linear-gradient(90deg,${BLU},${EME})`, borderRadius:3, transition:"width 0.8s" }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:BLU, minWidth:36, textAlign:"right" }}>{p.progress ?? 0}%</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ AUDIT LOGS ══ */}
        {tab === "logs" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {LOG_LEVELS.map(l => {
                const count = STATIC_LOGS.filter(x=>x.level===l).length;
                const s = levelColor[l];
                return <KpiBar key={l} label={l} value={count} color={s.color} border={s.border} />;
              })}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>LEVEL:</span>
              {["ALL","CRITICAL","ERROR","WARN","INFO"].map(level => (
                <FilterBtn key={level} label={level} active={levelFilter===level} color={levelColor[level]?.color ?? BLU} onClick={()=>setLevelFilter(level)} />
              ))}
            </div>
            <TableShell
              cols={["ID","Timestamp","Level","Source","User","Event","IP"]}
              rows={filteredLogs.map(l => [
                <Mono>{l.id}</Mono>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", whiteSpace:"nowrap" }}>{l.ts}</span>,
                <span style={{ background:levelColor[l.level].bg, color:levelColor[l.level].color, border:`1px solid ${levelColor[l.level].border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{l.level}</span>,
                <span style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{l.source}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:BLU }}>{l.user}</span>,
                <span style={{ fontSize:12, color:"var(--foreground)" }}>{l.event}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{l.ip}</span>,
              ])}
            />
          </>
        )}

        {/* ══ REPORTS (sub-nav) ══ */}
        {tab === "reports" && (
          <>
            {/* Sub-navigation */}
            <div style={{ display:"flex", gap:2, background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:4, width:"fit-content" }}>
              {[
                { key:"myreports",  label:"My Reports",       count: MY_REPORTS.length },
                { key:"templates",  label:"Report Templates", count: REPORT_TEMPLATES.length },
                { key:"scheduler",  label:"Report Scheduler", count: SCHEDULED_REPORTS.length },
              ].map(st => (
                <button key={st.key} onClick={() => setReportSubTab(st.key)}
                  style={{
                    padding:"7px 16px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700,
                    background: reportSubTab===st.key ? "rgba(99,179,237,0.15)" : "transparent",
                    color: reportSubTab===st.key ? BLU : "var(--muted-foreground)",
                    boxShadow: reportSubTab===st.key ? `0 0 0 1px rgba(99,179,237,0.3)` : "none",
                    transition:"all 0.15s",
                  }}>
                  {st.label}
                  <span style={{ marginLeft:7, background: reportSubTab===st.key ? "rgba(99,179,237,0.2)" : "var(--border)", borderRadius:10, padding:"1px 6px", fontSize:10, color: reportSubTab===st.key ? BLU : "var(--muted-foreground)" }}>{st.count}</span>
                </button>
              ))}
            </div>

            {/* ─── MY REPORTS ─── */}
            {reportSubTab === "myreports" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                  {[
                    { label:"Total Reports",  value:MY_REPORTS.length,                                     color:BLU, border:"rgba(99,179,237,0.3)"  },
                    { label:"Completed",      value:MY_REPORTS.filter(r=>r.status==="completed").length,   color:EME, border:"rgba(52,211,153,0.3)"  },
                    { label:"In Progress",    value:MY_REPORTS.filter(r=>r.status==="in-progress").length, color:AMB, border:"rgba(251,191,36,0.3)"  },
                    { label:"Overdue",        value:MY_REPORTS.filter(r=>r.status==="overdue").length,     color:RED, border:"rgba(239,68,68,0.3)"   },
                    { label:"Failed",         value:MY_REPORTS.filter(r=>r.status==="failed").length,      color:RED, border:"rgba(239,68,68,0.3)"   },
                  ].map(k => <KpiBar key={k.label} {...k} />)}
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ position:"relative", flex:1, minWidth:200 }}>
                    <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--muted-foreground)" }}>🔍</span>
                    <input value={myRptSearch} onChange={e=>setMyRptSearch(e.target.value)} placeholder="Search reports…"
                      style={{ width:"100%", paddingLeft:34, paddingRight:12, paddingTop:8, paddingBottom:8, background:CARD, border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)", alignSelf:"center" }}>STATUS:</span>
                    {["All","completed","in-progress","overdue","failed"].map(s => (
                      <FilterBtn key={s} label={s==="All"?s:s.replace(/-/g," ").toUpperCase()} active={myRptFilter===s}
                        color={statusStyle[s]?.color ?? BLU} onClick={()=>setMyRptFilter(s)} />
                    ))}
                  </div>
                </div>
                <TableShell
                  cols={["ID","Report Name","Framework","Region","Generated By","Generated At","Format","Status","Actions"]}
                  rows={filteredMyReports.map(r => [
                    <Mono>{r.id}</Mono>,
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:BLU, marginBottom:1 }}>{r.name}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{r.audience} · {r.freq}</div>
                    </div>,
                    <span style={{ background:"rgba(99,179,237,0.1)", color:BLU, border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{r.framework}</span>,
                    <RegionChip region={r.region} />,
                    <span style={{ fontSize:11, color:"var(--foreground)" }}>{r.generatedBy}</span>,
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", whiteSpace:"nowrap" }}>{r.generatedAt}</span>,
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--foreground)" }}>{r.format}</span>,
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <StatusBadge status={r.status} />
                      {r.status==="in-progress" && r.progress !== undefined && (
                        <div style={{ width:64, height:3, background:"rgba(255,255,255,0.1)", borderRadius:2, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${r.progress}%`, background:BLU, borderRadius:2 }} />
                        </div>
                      )}
                    </div>,
                    <div style={{ display:"flex", gap:5 }} onClick={e=>e.stopPropagation()}>
                      {r.status==="completed" && <ActionBtn label="⬇" color={EME} onClick={()=>handleDownload(r)} />}
                      {r.status==="completed" && <ActionBtn label="👁" color={BLU} onClick={()=>{setPreviewReport(r);}} />}
                      {r.status==="completed" && <ActionBtn label="✉" color={PRP} onClick={()=>{setShareReport(r);setShareEmail("");setShareCopied(false);}} />}
                      {r.status==="failed"    && <ActionBtn label="↺" color={AMB} />}
                      <ActionBtn label="…" color="var(--muted-foreground)" onClick={()=>setSelMyReport(r)} />
                    </div>,
                  ])}
                  onRowClick={i => setSelMyReport(filteredMyReports[i])}
                />
                <div style={{ fontSize:11, color:"var(--muted-foreground)", textAlign:"right" }}>Click any row to view report details, download, preview, or share</div>
              </>
            )}

            {/* ─── REPORT TEMPLATES ─── */}
            {reportSubTab === "templates" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[
                    { label:"Total Templates",  value:REPORT_TEMPLATES.length,                                          color:BLU, border:"rgba(99,179,237,0.3)"  },
                    { label:"KSA Regulatory",   value:REPORT_TEMPLATES.filter(t=>t.category==="KSA Regulatory").length, color:"#F59E0B", border:"rgba(245,158,11,0.3)" },
                    { label:"Frameworks",        value:[...new Set(REPORT_TEMPLATES.map(t=>t.framework))].length,        color:EME, border:"rgba(52,211,153,0.3)"  },
                    { label:"Regions Covered",  value:[...new Set(REPORT_TEMPLATES.map(t=>t.region))].length,           color:PRP, border:"rgba(192,132,252,0.3)"  },
                  ].map(k => <KpiBar key={k.label} {...k} />)}
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ position:"relative", flex:1, minWidth:200 }}>
                    <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--muted-foreground)" }}>🔍</span>
                    <input value={tplSearch} onChange={e=>setTplSearch(e.target.value)} placeholder="Search templates, frameworks, tags…"
                      style={{ width:"100%", paddingLeft:34, paddingRight:12, paddingTop:8, paddingBottom:8, background:CARD, border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>CATEGORY:</span>
                  {tplCategories.map(c => <FilterBtn key={c} label={c} active={tplCategory===c} color={catColors[c] ?? BLU} onClick={()=>setTplCategory(c)} />)}
                </div>
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>REGION:</span>
                  {tplRegions.map(r => <FilterBtn key={r} label={r} active={tplRegion===r} color={regionColors[r] ?? BLU} onClick={()=>setTplRegion(r)} />)}
                </div>
                {filteredTemplates.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted-foreground)", fontSize:13 }}>No templates match your filters. <button onClick={()=>{setTplCategory("All");setTplRegion("All");setTplSearch("");}} style={{ background:"none",border:"none",color:BLU,cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>Clear filters</button></div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:14 }}>
                    {filteredTemplates.map(t => (
                      <TemplateCard key={t.id} tpl={t} onClick={() => setSelTemplate(t)} />
                    ))}
                  </div>
                )}
                <div style={{ fontSize:11, color:"var(--muted-foreground)", textAlign:"right" }}>
                  Showing {filteredTemplates.length} of {REPORT_TEMPLATES.length} templates · Click any card to view details and generate
                </div>
              </>
            )}

            {/* ─── REPORT SCHEDULER ─── */}
            {reportSubTab === "scheduler" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[
                    { label:"Active Schedules", value:SCHEDULED_REPORTS.filter(s=>s.status==="active").length,  color:EME, border:"rgba(52,211,153,0.3)" },
                    { label:"Next 7 Days",       value:SCHEDULED_REPORTS.filter(s=>{
                        const d = new Date(s.nextRun); const now = new Date("2026-06-14"); const diff = (d.getTime()-now.getTime())/(1000*60*60*24);
                        return diff >= 0 && diff <= 7;
                      }).length, color:BLU, border:"rgba(99,179,237,0.3)" },
                    { label:"Paused",            value:SCHEDULED_REPORTS.filter(s=>s.status==="paused").length, color:"rgba(148,163,184,0.8)", border:"rgba(148,163,184,0.2)" },
                    { label:"Errors",            value:SCHEDULED_REPORTS.filter(s=>s.status==="error").length,  color:RED, border:"rgba(239,68,68,0.3)" },
                  ].map(k => <KpiBar key={k.label} {...k} />)}
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>STATUS:</span>
                  {[
                    { key:"All",    color:BLU },
                    { key:"active", color:EME },
                    { key:"paused", color:"rgba(148,163,184,0.8)" },
                    { key:"error",  color:RED },
                  ].map(f => (
                    <FilterBtn key={f.key} label={f.key.toUpperCase()} active={schedFilter===f.key} color={f.color} onClick={()=>setSchedFilter(f.key)} />
                  ))}
                  <button onClick={()=>setSelSchedule(null)} style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:7, border:`1px solid ${BLU}40`, background:`${BLU}15`, color:BLU, fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                    + New Schedule
                  </button>
                </div>
                <TableShell
                  cols={["ID","Report Name","Framework","Frequency","Next Run","Last Run","Last Status","Recipients","Schedule Status","Actions"]}
                  rows={filteredSchedules.map(s => [
                    <Mono>{s.id}</Mono>,
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:BLU }}>{s.name}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:1 }}>{s.createdBy}</div>
                    </div>,
                    <span style={{ background:"rgba(99,179,237,0.1)", color:BLU, border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{s.framework}</span>,
                    <span style={{ fontSize:11, color:"var(--foreground)" }}>{s.frequency}</span>,
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color: (() => {
                      const d=new Date(s.nextRun); const now=new Date("2026-06-14"); const diff=(d.getTime()-now.getTime())/(1000*60*60*24);
                      return diff<=7 && s.status==="active" ? AMB : "var(--muted-foreground)";
                    })(), whiteSpace:"nowrap" }}>{s.nextRun}</span>,
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)", whiteSpace:"nowrap" }}>{s.lastRun ?? "—"}</span>,
                    s.lastStatus ? <StatusBadge status={s.lastStatus} /> : <span style={{ color:"var(--muted-foreground)", fontSize:11 }}>—</span>,
                    <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{s.recipients.join(", ")}</span>,
                    <StatusBadge status={s.status} />,
                    <div style={{ display:"flex", gap:5 }} onClick={e=>e.stopPropagation()}>
                      <ActionBtn label="▶" color={EME} />
                      <ActionBtn label={s.status==="paused"?"▶":"⏸"} color={AMB} />
                      <ActionBtn label="…" color="var(--muted-foreground)" onClick={()=>setSelSchedule(s)} />
                    </div>,
                  ])}
                  onRowClick={i => setSelSchedule(filteredSchedules[i])}
                />
                <div style={{ fontSize:11, color:"var(--muted-foreground)", textAlign:"right" }}>Click any row to view schedule details, run history & manage</div>
              </>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

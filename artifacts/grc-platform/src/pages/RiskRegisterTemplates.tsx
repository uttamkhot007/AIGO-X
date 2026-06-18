// @ts-nocheck
import React, { useState, useRef } from "react";

export interface TemplateColumn {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "date";
  options?: string[];
  width?: number;
}

export interface RiskTemplate {
  id: string;
  name: string;
  standard: string;
  version?: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  badgeColor: string;
  tags: string[];
  columns: TemplateColumn[];
  exampleRisks: Record<string, string>[];
  isCustom?: boolean;
}

const BUILTIN_TEMPLATES: RiskTemplate[] = [
  {
    id: "iso27001-2022",
    name: "ISO 27001:2022 Risk Register",
    standard: "ISO 27001",
    version: "2022",
    category: "Information Security",
    description: "Annex A-aligned risk assessment register for ISMS implementation covering information assets, threat/vulnerability pairs, and treatment tracking.",
    icon: "🛡️",
    color: "#1E3A5F",
    badgeColor: "rgba(30,58,95,0.12)",
    tags: ["ISO 27001", "ISMS", "Annex A", "Information Security"],
    columns: [
      { key: "riskId",       label: "Risk ID",              type: "text" },
      { key: "asset",        label: "Information Asset",    type: "text" },
      { key: "assetOwner",   label: "Asset Owner",          type: "text" },
      { key: "threat",       label: "Threat",               type: "text" },
      { key: "vulnerability",label: "Vulnerability",        type: "text" },
      { key: "existingCtrl", label: "Existing Controls",    type: "text" },
      { key: "likelihood",   label: "Likelihood (1–5)",     type: "number" },
      { key: "impact",       label: "Impact (1–5)",         type: "number" },
      { key: "riskScore",    label: "Risk Score",           type: "number" },
      { key: "riskLevel",    label: "Risk Level",           type: "select", options: ["Critical","High","Medium","Low","Acceptable"] },
      { key: "treatment",    label: "Treatment Option",     type: "select", options: ["Mitigate","Transfer","Accept","Avoid"] },
      { key: "treatmentPlan",label: "Treatment Plan",       type: "text" },
      { key: "residualRisk", label: "Residual Risk",        type: "select", options: ["Critical","High","Medium","Low","Acceptable"] },
      { key: "owner",        label: "Risk Owner",           type: "text" },
      { key: "reviewDate",   label: "Review Date",          type: "date" },
      { key: "status",       label: "Status",               type: "select", options: ["Open","In Treatment","Accepted","Closed","Under Review"] },
    ],
    exampleRisks: [
      { riskId:"ISO-001", asset:"Identity & Access Management System", assetOwner:"CISO", threat:"Unauthorised access by external attacker", vulnerability:"Weak password policy; no MFA enforced", existingCtrl:"Password policy; basic IAM", likelihood:"4", impact:"5", riskScore:"20", riskLevel:"Critical", treatment:"Mitigate", treatmentPlan:"Deploy MFA; enforce PAM solution; quarterly access reviews", residualRisk:"Medium", owner:"A. Kim", reviewDate:"2025-03-31", status:"In Treatment" },
      { riskId:"ISO-002", asset:"Third-party software supply chain", assetOwner:"Engineering Lead", threat:"Compromised open-source dependency", vulnerability:"No SBOM; unvetted third-party libraries", existingCtrl:"Basic dependency scanning", likelihood:"3", impact:"5", riskScore:"15", riskLevel:"High", treatment:"Mitigate", treatmentPlan:"Implement SBOM; deploy SCA tool in CI/CD pipeline", residualRisk:"Low", owner:"Dev Lead", reviewDate:"2025-06-30", status:"Open" },
      { riskId:"ISO-003", asset:"Cloud data backup system", assetOwner:"Ops Manager", threat:"Ransomware encryption of backups", vulnerability:"Backups stored on same network segment", existingCtrl:"Daily backups", likelihood:"3", impact:"4", riskScore:"12", riskLevel:"High", treatment:"Mitigate", treatmentPlan:"Air-gap backups; implement immutable object storage", residualRisk:"Low", owner:"Ops Manager", reviewDate:"2025-04-15", status:"Open" },
      { riskId:"ISO-004", asset:"Customer PII database", assetOwner:"DPO", threat:"Internal data exfiltration by privileged user", vulnerability:"Excessive DB access permissions; no DLP", existingCtrl:"Role-based DB access", likelihood:"2", impact:"5", riskScore:"10", riskLevel:"High", treatment:"Mitigate", treatmentPlan:"Implement DLP; apply least-privilege DB roles; enable audit logging", residualRisk:"Low", owner:"DPO", reviewDate:"2025-05-01", status:"In Treatment" },
    ],
  },
  {
    id: "nist-800-30",
    name: "NIST SP 800-30 Risk Register",
    standard: "NIST SP 800-30",
    version: "Rev 1",
    category: "Cybersecurity",
    description: "Guide for Conducting Risk Assessments aligned to NIST 800-30. Covers threat sources, threat events, and organizational risk tolerance.",
    icon: "🇺🇸",
    color: "#065F46",
    badgeColor: "rgba(6,95,70,0.10)",
    tags: ["NIST", "800-30", "Federal", "Risk Assessment"],
    columns: [
      { key: "riskId",         label: "Risk ID",                   type: "text" },
      { key: "system",         label: "System / Component",        type: "text" },
      { key: "threatSource",   label: "Threat Source",             type: "select", options: ["Adversarial","Accidental","Structural","Environmental"] },
      { key: "threatEvent",    label: "Threat Event",              type: "text" },
      { key: "vulnerability",  label: "Predisposing Condition",    type: "text" },
      { key: "severity",       label: "Severity",                  type: "select", options: ["Very High","High","Moderate","Low","Very Low"] },
      { key: "likelihood",     label: "Likelihood (Initiation)",   type: "select", options: ["Very High","High","Moderate","Low","Very Low"] },
      { key: "impact",         label: "Adverse Impact",            type: "select", options: ["Very High","High","Moderate","Low","Very Low"] },
      { key: "riskLevel",      label: "Overall Risk Level",        type: "select", options: ["Very High","High","Moderate","Low","Very Low"] },
      { key: "currentControls",label: "Current Controls",          type: "text" },
      { key: "recommendations",label: "Recommended Controls",      type: "text" },
      { key: "residualRisk",   label: "Residual Risk",             type: "select", options: ["Very High","High","Moderate","Low","Very Low"] },
      { key: "priority",       label: "Priority",                  type: "select", options: ["P1 - Immediate","P2 - High","P3 - Moderate","P4 - Low"] },
      { key: "owner",          label: "Risk Owner",                type: "text" },
      { key: "status",         label: "Status",                    type: "select", options: ["Open","In Progress","Closed","Accepted"] },
    ],
    exampleRisks: [
      { riskId:"NIST-001", system:"Enterprise VPN Gateway", threatSource:"Adversarial", threatEvent:"Nation-state APT targeting credential theft via phishing", vulnerability:"Employees lack security awareness training; no EDR on endpoints", severity:"Very High", likelihood:"Moderate", impact:"Very High", riskLevel:"High", currentControls:"Perimeter firewall; email spam filter", recommendations:"Deploy EDR; mandatory phishing simulation; MFA on VPN", residualRisk:"Moderate", priority:"P1 - Immediate", owner:"CISO", status:"Open" },
      { riskId:"NIST-002", system:"CI/CD Pipeline", threatSource:"Adversarial", threatEvent:"Insider threat — malicious code injection by developer", vulnerability:"Insufficient code review controls; shared pipeline credentials", severity:"High", likelihood:"Low", impact:"High", riskLevel:"Moderate", currentControls:"Basic peer review", recommendations:"4-eyes code review; signed commits; SAST in pipeline", residualRisk:"Low", priority:"P2 - High", owner:"DevSecOps", status:"In Progress" },
      { riskId:"NIST-003", system:"Data Centre (Primary)", threatSource:"Environmental", threatEvent:"Power outage causing extended service disruption", vulnerability:"Single power feed; UPS rated for <30 min", severity:"High", likelihood:"Low", impact:"High", riskLevel:"Moderate", currentControls:"Basic UPS; diesel generator", recommendations:"Dual power feed; test DR failover quarterly", residualRisk:"Low", priority:"P2 - High", owner:"IT Ops", status:"Open" },
    ],
  },
  {
    id: "soc2-typeii",
    name: "SOC 2 Type II Risk Register",
    standard: "SOC 2",
    version: "AICPA TSC 2017",
    category: "Trust & Compliance",
    description: "Maps risks to AICPA Trust Service Criteria (CC, A, PI, C, P). Tracks control effectiveness for annual SOC 2 audits.",
    icon: "✅",
    color: "#5B21B6",
    badgeColor: "rgba(91,33,182,0.10)",
    tags: ["SOC 2", "AICPA", "Trust Service Criteria", "Audit"],
    columns: [
      { key: "riskId",       label: "Risk ID",              type: "text" },
      { key: "tscRef",       label: "TSC Reference",        type: "text" },
      { key: "trustCriteria",label: "Trust Criteria",       type: "select", options: ["CC - Common Criteria","A - Availability","PI - Processing Integrity","C - Confidentiality","P - Privacy"] },
      { key: "riskDesc",     label: "Risk Description",     type: "text" },
      { key: "relatedCtrl",  label: "Related Control ID",   type: "text" },
      { key: "ctrlDesc",     label: "Control Description",  type: "text" },
      { key: "likelihood",   label: "Likelihood",           type: "select", options: ["High","Medium","Low"] },
      { key: "impact",       label: "Impact",               type: "select", options: ["High","Medium","Low"] },
      { key: "riskScore",    label: "Risk Score",           type: "number" },
      { key: "ctrlEffective",label: "Control Effectiveness",type: "select", options: ["Effective","Partially Effective","Ineffective","Not Tested"] },
      { key: "testing",      label: "Testing Method",       type: "select", options: ["Inquiry","Observation","Inspection","Re-performance"] },
      { key: "deficiency",   label: "Deficiency Noted",     type: "select", options: ["None","Minor Deficiency","Significant Deficiency","Material Weakness"] },
      { key: "remediation",  label: "Remediation Plan",     type: "text" },
      { key: "owner",        label: "Control Owner",        type: "text" },
      { key: "targetDate",   label: "Target Remediation",   type: "date" },
      { key: "status",       label: "Status",               type: "select", options: ["Open","Remediation In Progress","Remediated","Accepted","Closed"] },
    ],
    exampleRisks: [
      { riskId:"SOC-001", tscRef:"CC6.1", trustCriteria:"CC - Common Criteria", riskDesc:"Unauthorised logical access to production environment", relatedCtrl:"CC-06", ctrlDesc:"Access provisioning requires manager + security approval", likelihood:"Medium", impact:"High", riskScore:"12", ctrlEffective:"Partially Effective", testing:"Inspection", deficiency:"Minor Deficiency", remediation:"Implement automated access request workflow; quarterly access reviews", owner:"IT Security", targetDate:"2025-04-30", status:"Remediation In Progress" },
      { riskId:"SOC-002", tscRef:"A1.2", trustCriteria:"A - Availability", riskDesc:"Service outage exceeding 99.9% SLA due to infrastructure failure", relatedCtrl:"AV-03", ctrlDesc:"Multi-AZ deployment with automated failover", likelihood:"Low", impact:"High", riskScore:"9", ctrlEffective:"Effective", testing:"Observation", deficiency:"None", remediation:"None required — control effective", owner:"SRE Lead", targetDate:"", status:"Closed" },
      { riskId:"SOC-003", tscRef:"CC6.7", trustCriteria:"CC - Common Criteria", riskDesc:"Encryption key exposure leading to confidentiality breach", relatedCtrl:"CC-09", ctrlDesc:"KMS with hardware HSM; key rotation every 90 days", likelihood:"Low", impact:"High", riskScore:"9", ctrlEffective:"Effective", testing:"Inspection", deficiency:"None", remediation:"None required", owner:"CISO", targetDate:"", status:"Closed" },
    ],
  },
  {
    id: "pci-dss-v4",
    name: "PCI DSS v4.0 Risk Register",
    standard: "PCI DSS",
    version: "v4.0",
    category: "Payment Card Security",
    description: "Risk tracking aligned to PCI DSS v4.0 requirements covering CDE scope, cardholder data flows, and compensating controls.",
    icon: "💳",
    color: "#1D4ED8",
    badgeColor: "rgba(29,78,216,0.10)",
    tags: ["PCI DSS", "Payment Card", "CDE", "Cardholder Data"],
    columns: [
      { key: "riskId",        label: "Risk ID",              type: "text" },
      { key: "pciReq",        label: "PCI Requirement",      type: "text" },
      { key: "cdeComponent",  label: "CDE Component",        type: "text" },
      { key: "riskDesc",      label: "Risk Description",     type: "text" },
      { key: "inherentRisk",  label: "Inherent Risk Rating", type: "select", options: ["Critical","High","Medium","Low"] },
      { key: "ctrlStatus",    label: "Control Status",       type: "select", options: ["Implemented","Partially Implemented","Not Implemented","Compensating Control","N/A"] },
      { key: "compCtrl",      label: "Compensating Control", type: "text" },
      { key: "residualRisk",  label: "Residual Risk",        type: "select", options: ["Critical","High","Medium","Low","Accepted"] },
      { key: "cvss",          label: "CVSS Score",           type: "number" },
      { key: "scanResult",    label: "Last Scan Result",     type: "select", options: ["Pass","Fail","Not Scanned","Pending"] },
      { key: "remediation",   label: "Remediation Steps",    type: "text" },
      { key: "owner",         label: "Responsible Team",     type: "text" },
      { key: "remediationDate",label: "Remediation Date",    type: "date" },
      { key: "qsaNote",       label: "QSA Notes",            type: "text" },
      { key: "status",        label: "Status",               type: "select", options: ["Open","In Remediation","Remediated","Accepted","Closed"] },
    ],
    exampleRisks: [
      { riskId:"PCI-001", pciReq:"Req 4.2.1", cdeComponent:"Payment API Gateway", riskDesc:"Cardholder data transmitted over unencrypted channel for legacy clients", inherentRisk:"Critical", ctrlStatus:"Partially Implemented", compCtrl:"Encrypted tunnel for new clients; legacy migration in progress", residualRisk:"High", cvss:"8.5", scanResult:"Fail", remediation:"Deprecate TLS 1.0/1.1; enforce TLS 1.3 for all connections by Q2", owner:"API Team", remediationDate:"2025-06-30", qsaNote:"Remediation plan approved by QSA. Monthly progress review.", status:"In Remediation" },
      { riskId:"PCI-002", pciReq:"Req 8.3.6", cdeComponent:"CDE Admin Portal", riskDesc:"Weak multi-factor authentication for administrative CDE access", inherentRisk:"High", ctrlStatus:"Not Implemented", compCtrl:"", residualRisk:"High", cvss:"7.2", scanResult:"Fail", remediation:"Deploy FIDO2 hardware tokens for all CDE admins", owner:"IT Security", remediationDate:"2025-04-01", qsaNote:"Finding raised during 2024 assessment. P1 priority.", status:"Open" },
      { riskId:"PCI-003", pciReq:"Req 11.3.1", cdeComponent:"Network Perimeter", riskDesc:"External vulnerability scanning not conducted quarterly per requirement", inherentRisk:"Medium", ctrlStatus:"Not Implemented", compCtrl:"", residualRisk:"Medium", cvss:"5.0", scanResult:"Not Scanned", remediation:"Engage ASV for quarterly external scanning; automate scheduling", owner:"Security Ops", remediationDate:"2025-03-01", qsaNote:"", status:"In Remediation" },
    ],
  },
  {
    id: "gdpr-dpia",
    name: "GDPR / DPIA Risk Register",
    standard: "GDPR",
    version: "EU 2016/679",
    category: "Data Privacy",
    description: "Data Protection Impact Assessment-aligned risk register for GDPR compliance. Maps risks to data subjects, processing activities, and Article references.",
    icon: "🔏",
    color: "#0E7490",
    badgeColor: "rgba(14,116,144,0.10)",
    tags: ["GDPR", "DPIA", "Privacy", "Data Protection", "EU"],
    columns: [
      { key: "riskId",         label: "Risk ID",              type: "text" },
      { key: "articleRef",     label: "GDPR Article Ref",     type: "text" },
      { key: "dataCategory",   label: "Personal Data Category",type: "select", options: ["Basic PII","Special Category","Children's Data","Criminal Records","Financial Data","Health Data","Biometric Data"] },
      { key: "dataSubjects",   label: "Data Subjects",        type: "text" },
      { key: "processingAct",  label: "Processing Activity",  type: "text" },
      { key: "lawfulBasis",    label: "Lawful Basis",         type: "select", options: ["Consent","Contract","Legal Obligation","Vital Interests","Public Task","Legitimate Interests","None Identified"] },
      { key: "threat",         label: "Threat / Risk Scenario",type: "text" },
      { key: "likelihood",     label: "Likelihood",           type: "select", options: ["High","Medium","Low"] },
      { key: "severity",       label: "Severity to Rights",   type: "select", options: ["Severe","Significant","Moderate","Minor"] },
      { key: "riskLevel",      label: "Risk Level",           type: "select", options: ["Unacceptable","High","Moderate","Low"] },
      { key: "mitigation",     label: "Mitigation Measure",   type: "text" },
      { key: "dpiaRequired",   label: "DPIA Required",        type: "select", options: ["Yes","No","Pending Assessment"] },
      { key: "dpoReview",      label: "DPO Review Notes",     type: "text" },
      { key: "supervisoryRef", label: "Supervisory Authority Referral",type: "select", options: ["Not Required","Required","Completed"] },
      { key: "owner",          label: "Data Controller",      type: "text" },
      { key: "reviewDate",     label: "Review Date",          type: "date" },
      { key: "status",         label: "Status",               type: "select", options: ["Open","Mitigated","Accepted","Under DPIA","Notified","Closed"] },
    ],
    exampleRisks: [
      { riskId:"GDPR-001", articleRef:"Art. 32, Art. 5(1)(f)", dataCategory:"Health Data", dataSubjects:"Patients (EU residents)", processingAct:"Electronic health record processing", lawfulBasis:"Legal Obligation", threat:"Unauthorised access to health records via stolen employee credentials", likelihood:"Medium", severity:"Severe", riskLevel:"High", mitigation:"MFA; role-based access; audit logging; breach notification procedure", dpiaRequired:"Yes", dpoReview:"DPIA completed 2024-10. Controls adequate. Annual review required.", supervisoryRef:"Not Required", owner:"Healthcare Controller", reviewDate:"2025-10-01", status:"Mitigated" },
      { riskId:"GDPR-002", articleRef:"Art. 6, Art. 13", dataCategory:"Basic PII", dataSubjects:"Website visitors", processingAct:"Marketing analytics and cookie tracking", lawfulBasis:"Consent", threat:"Processing without valid consent; consent management platform failure", likelihood:"Medium", severity:"Moderate", riskLevel:"Moderate", mitigation:"Deploy compliant CMP; audit consent records quarterly; update privacy notice", dpiaRequired:"No", dpoReview:"Consent mechanism reviewed. Banner re-designed for clarity.", supervisoryRef:"Not Required", owner:"Marketing DPO", reviewDate:"2025-06-01", status:"Open" },
      { riskId:"GDPR-003", articleRef:"Art. 44-49", dataCategory:"Basic PII", dataSubjects:"Employees (EU)", processingAct:"HR data transfer to US-based HRIS", lawfulBasis:"Contract", threat:"Inadequate transfer mechanism post-Schrems II; SCC not updated", likelihood:"High", severity:"Significant", riskLevel:"High", mitigation:"Execute updated SCCs; conduct TIA; consider EU data residency option", dpiaRequired:"Yes", dpoReview:"Legal review in progress. Transfer temporarily suspended pending SCCs.", supervisoryRef:"Not Required", owner:"HR / Legal", reviewDate:"2025-02-28", status:"Open" },
    ],
  },
  {
    id: "hipaa-security",
    name: "HIPAA Security Rule Register",
    standard: "HIPAA",
    version: "45 CFR Part 164",
    category: "Healthcare",
    description: "Risk analysis aligned to HIPAA Security Rule safeguards (Administrative, Physical, Technical). Covers ePHI confidentiality, integrity, and availability.",
    icon: "🏥",
    color: "#9F1239",
    badgeColor: "rgba(159,18,57,0.10)",
    tags: ["HIPAA", "ePHI", "PHI", "Healthcare", "Security Rule"],
    columns: [
      { key: "riskId",        label: "Risk ID",              type: "text" },
      { key: "cfrRef",        label: "CFR Reference",        type: "text" },
      { key: "safeguardType", label: "Safeguard Type",       type: "select", options: ["Administrative","Physical","Technical"] },
      { key: "phiCategory",   label: "PHI/ePHI Category",    type: "select", options: ["Clinical Records","Billing Records","Lab Results","Prescriptions","Mental Health Records","All ePHI"] },
      { key: "threatSource",  label: "Threat Source",        type: "select", options: ["Internal Employee","External Attacker","Business Associate","Environmental","System Failure"] },
      { key: "vulnerability", label: "Vulnerability",        type: "text" },
      { key: "likelihood",    label: "Likelihood",           type: "select", options: ["High","Medium","Low"] },
      { key: "impact",        label: "Impact",               type: "select", options: ["High","Medium","Low"] },
      { key: "riskLevel",     label: "Risk Level",           type: "select", options: ["High","Medium","Low"] },
      { key: "adminSafeguard",label: "Administrative Safeguard",type: "text" },
      { key: "physSafeguard", label: "Physical Safeguard",   type: "text" },
      { key: "techSafeguard", label: "Technical Safeguard",  type: "text" },
      { key: "baRequired",    label: "BAA Required",         type: "select", options: ["Yes","No","In Place"] },
      { key: "responsibleParty",label: "Responsible Party",  type: "text" },
      { key: "reviewDate",    label: "Review Date",          type: "date" },
      { key: "status",        label: "Status",               type: "select", options: ["Open","In Remediation","Remediated","Accepted","Closed"] },
    ],
    exampleRisks: [
      { riskId:"HIPAA-001", cfrRef:"§164.312(a)(2)(iv)", safeguardType:"Technical", phiCategory:"All ePHI", threatSource:"External Attacker", vulnerability:"ePHI transmitted via unencrypted email; staff lack awareness", likelihood:"High", impact:"High", riskLevel:"High", adminSafeguard:"Annual workforce HIPAA training; sanction policy for policy violations", physSafeguard:"Workstation use policy", techSafeguard:"Email DLP solution; encrypted email gateway", baRequired:"No", responsibleParty:"Privacy Officer", reviewDate:"2025-06-30", status:"In Remediation" },
      { riskId:"HIPAA-002", cfrRef:"§164.308(a)(3)", safeguardType:"Administrative", phiCategory:"Clinical Records", threatSource:"Internal Employee", vulnerability:"Workforce access not reviewed after role changes; orphaned accounts", likelihood:"Medium", impact:"High", riskLevel:"Medium", adminSafeguard:"Implement quarterly access reviews; automate deprovisioning on HR system change", physSafeguard:"Physical badge deactivation on termination", techSafeguard:"IAM audit reports; SIEM alerts on dormant account activity", baRequired:"No", responsibleParty:"HR / IT", reviewDate:"2025-04-30", status:"Open" },
      { riskId:"HIPAA-003", cfrRef:"§164.308(b)(1)", safeguardType:"Administrative", phiCategory:"Billing Records", threatSource:"Business Associate", vulnerability:"Cloud billing vendor without executed BAA; unclear data handling", likelihood:"High", impact:"High", riskLevel:"High", adminSafeguard:"Execute BAA before any PHI sharing; include breach notification requirements", physSafeguard:"Vendor physical security review", techSafeguard:"Encryption in transit and at rest for BA-shared data", baRequired:"Yes", responsibleParty:"Legal / Compliance", reviewDate:"2025-03-01", status:"Open" },
    ],
  },
  {
    id: "nist-csf-2",
    name: "NIST CSF 2.0 Risk Register",
    standard: "NIST CSF",
    version: "2.0",
    category: "Cybersecurity Framework",
    description: "Risk tracking across all six CSF 2.0 Functions: Govern, Identify, Protect, Detect, Respond, and Recover. Includes maturity tier progression.",
    icon: "🏛️",
    color: "#B45309",
    badgeColor: "rgba(180,83,9,0.10)",
    tags: ["NIST CSF", "CSF 2.0", "Cybersecurity", "Maturity"],
    columns: [
      { key: "riskId",       label: "Risk ID",               type: "text" },
      { key: "csfFunction",  label: "CSF Function",          type: "select", options: ["GV - Govern","ID - Identify","PR - Protect","DE - Detect","RS - Respond","RC - Recover"] },
      { key: "csfCategory",  label: "CSF Category",          type: "text" },
      { key: "csfSubcat",    label: "Subcategory (e.g. ID.AM-1)", type: "text" },
      { key: "riskDesc",     label: "Risk Description",      type: "text" },
      { key: "currentTier",  label: "Current Tier (1–4)",    type: "select", options: ["Tier 1 - Partial","Tier 2 - Risk Informed","Tier 3 - Repeatable","Tier 4 - Adaptive"] },
      { key: "targetTier",   label: "Target Tier (1–4)",     type: "select", options: ["Tier 1 - Partial","Tier 2 - Risk Informed","Tier 3 - Repeatable","Tier 4 - Adaptive"] },
      { key: "gap",          label: "Gap Description",       type: "text" },
      { key: "likelihood",   label: "Likelihood (1–5)",      type: "number" },
      { key: "impact",       label: "Impact (1–5)",          type: "number" },
      { key: "riskScore",    label: "Risk Score",            type: "number" },
      { key: "investmentReq",label: "Investment Required",   type: "select", options: ["< $10K","$10K–$50K","$50K–$250K","$250K+","TBD"] },
      { key: "milestone",    label: "Milestone / Sprint",    type: "text" },
      { key: "owner",        label: "Owner",                 type: "text" },
      { key: "targetDate",   label: "Target Date",           type: "date" },
      { key: "status",       label: "Status",                type: "select", options: ["Open","In Progress","Completed","Deferred","Accepted"] },
    ],
    exampleRisks: [
      { riskId:"CSF-001", csfFunction:"ID - Identify", csfCategory:"Asset Management", csfSubcat:"ID.AM-1", riskDesc:"Incomplete IT asset inventory preventing accurate risk scoping", currentTier:"Tier 1 - Partial", targetTier:"Tier 3 - Repeatable", gap:"No automated discovery; manual spreadsheet out of date by >30%", likelihood:"4", impact:"4", riskScore:"16", investmentReq:"$10K–$50K", milestone:"Q1 2025 — Deploy asset discovery tooling", owner:"IT Ops", targetDate:"2025-03-31", status:"In Progress" },
      { riskId:"CSF-002", csfFunction:"PR - Protect", csfCategory:"Identity Management & Access Control", csfSubcat:"PR.AA-02", riskDesc:"Privileged access management not implemented for cloud infrastructure", currentTier:"Tier 2 - Risk Informed", targetTier:"Tier 4 - Adaptive", gap:"No PAM solution; shared admin credentials in use", likelihood:"4", impact:"5", riskScore:"20", investmentReq:"$50K–$250K", milestone:"Q2 2025 — PAM platform rollout", owner:"CISO", targetDate:"2025-06-30", status:"Open" },
      { riskId:"CSF-003", csfFunction:"RS - Respond", csfCategory:"Incident Response Management", csfSubcat:"RS.MA-01", riskDesc:"Incident response plan not tested; no tabletop exercise conducted", currentTier:"Tier 1 - Partial", targetTier:"Tier 3 - Repeatable", gap:"IRP exists but not exercised; no defined RACI for cyber incidents", likelihood:"3", impact:"4", riskScore:"12", investmentReq:"< $10K", milestone:"Q1 2025 — Run tabletop exercise", owner:"SOC Lead", targetDate:"2025-02-28", status:"Open" },
      { riskId:"CSF-004", csfFunction:"GV - Govern", csfCategory:"Cybersecurity Strategy", csfSubcat:"GV.OC-05", riskDesc:"No formal cybersecurity strategy aligned to business objectives", currentTier:"Tier 1 - Partial", targetTier:"Tier 3 - Repeatable", gap:"Ad-hoc security decisions; no board-level reporting", likelihood:"3", impact:"5", riskScore:"15", investmentReq:"< $10K", milestone:"Q1 2025 — Develop 3-year security roadmap", owner:"CISO / Board", targetDate:"2025-03-15", status:"In Progress" },
    ],
  },
  {
    id: "cobit-2019",
    name: "COBIT 2019 IT Risk Register",
    standard: "COBIT",
    version: "2019",
    category: "IT Governance",
    description: "Enterprise IT risk register aligned to COBIT 2019 governance objectives. Covers EDM, APO, BAI, DSS, and MEA domains.",
    icon: "⚙️",
    color: "#4338CA",
    badgeColor: "rgba(67,56,202,0.10)",
    tags: ["COBIT", "IT Governance", "ISACA", "Enterprise"],
    columns: [
      { key: "riskId",        label: "Risk ID",              type: "text" },
      { key: "domain",        label: "COBIT Domain",         type: "select", options: ["EDM - Governance","APO - Align, Plan & Organise","BAI - Build, Acquire & Implement","DSS - Deliver, Service & Support","MEA - Monitor, Evaluate & Assess"] },
      { key: "mgmtObjective", label: "Management Objective", type: "text" },
      { key: "riskScenario",  label: "Risk Scenario",        type: "text" },
      { key: "riskType",      label: "Risk Type",            type: "select", options: ["Strategic","Operational","Financial","Compliance","Technology","Reputational"] },
      { key: "frequency",     label: "Frequency",            type: "select", options: ["Very High","High","Medium","Low","Rare"] },
      { key: "magnitude",     label: "Magnitude",            type: "select", options: ["Catastrophic","Major","Moderate","Minor","Negligible"] },
      { key: "riskRating",    label: "Risk Rating",          type: "select", options: ["Critical","High","Medium","Low"] },
      { key: "ctrlActivity",  label: "Control Activity",     type: "text" },
      { key: "ctrlEffective", label: "Control Effectiveness",type: "select", options: ["Effective","Partially Effective","Ineffective","Not In Place"] },
      { key: "residualRisk",  label: "Residual Risk",        type: "select", options: ["Critical","High","Medium","Low","Acceptable"] },
      { key: "kri",           label: "Key Risk Indicator",   type: "text" },
      { key: "owner",         label: "Risk Owner",           type: "text" },
      { key: "targetDate",    label: "Target Date",          type: "date" },
      { key: "status",        label: "Status",               type: "select", options: ["Open","Mitigating","Accepted","Closed"] },
    ],
    exampleRisks: [
      { riskId:"COB-001", domain:"APO - Align, Plan & Organise", mgmtObjective:"APO02 - IT Strategy Management", riskScenario:"IT investments misaligned with business strategy leading to capability gaps", riskType:"Strategic", frequency:"Medium", magnitude:"Major", riskRating:"High", ctrlActivity:"Annual IT strategy review with business stakeholder sign-off; portfolio management process", ctrlEffective:"Partially Effective", residualRisk:"Medium", kri:"% of IT projects aligned to strategic objectives < 80%", owner:"CIO", targetDate:"2025-06-30", status:"Mitigating" },
      { riskId:"COB-002", domain:"BAI - Build, Acquire & Implement", mgmtObjective:"BAI06 - Change Enablement", riskScenario:"Uncontrolled IT changes causing production incidents and service disruption", riskType:"Operational", frequency:"High", magnitude:"Moderate", riskRating:"High", ctrlActivity:"Change Advisory Board (CAB) review; change freeze windows; automated rollback capability", ctrlEffective:"Partially Effective", residualRisk:"Medium", kri:"Failed changes per month > 5", owner:"Change Manager", targetDate:"2025-04-01", status:"Mitigating" },
      { riskId:"COB-003", domain:"DSS - Deliver, Service & Support", mgmtObjective:"DSS04 - Business Continuity Management", riskScenario:"Business continuity plan not exercised; recovery capabilities unvalidated", riskType:"Operational", frequency:"Low", magnitude:"Catastrophic", riskRating:"High", ctrlActivity:"Annual BCP tabletop exercise; DR failover test every 6 months", ctrlEffective:"Ineffective", residualRisk:"High", kri:"Last BCP test > 12 months ago", owner:"BCP Manager", targetDate:"2025-03-31", status:"Open" },
    ],
  },
];

interface Props {
  onUseTemplate: (template: RiskTemplate) => void;
  activeTemplateId?: string;
}

export default function RiskRegisterTemplates({ onUseTemplate, activeTemplateId }: Props) {
  const [selected, setSelected]       = useState<RiskTemplate | null>(null);
  const [previewTab, setPreviewTab]   = useState<"columns" | "sample">("columns");
  const [searchQ, setSearchQ]         = useState("");
  const [catFilter, setCatFilter]     = useState("All");
  const [showUpload, setShowUpload]   = useState(false);
  const [customTemplates, setCustomTemplates] = useState<RiskTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("grc_custom_templates") || "[]"); } catch { return []; }
  });
  const [uploadStep, setUploadStep]   = useState<"idle" | "parsed" | "naming">("idle");
  const [uploadCols,  setUploadCols]  = useState<TemplateColumn[]>([]);
  const [uploadRows,  setUploadRows]  = useState<Record<string,string>[]>([]);
  const [uploadName,  setUploadName]  = useState("");
  const [uploadStd,   setUploadStd]   = useState("");
  const [uploadErr,   setUploadErr]   = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];
  const categories = ["All", ...Array.from(new Set(allTemplates.map(t => t.category)))];

  const filtered = allTemplates.filter(t => {
    const q = searchQ.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.standard.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q));
    const matchCat = catFilter === "All" || t.category === catFilter;
    return matchQ && matchCat;
  });

  function exportSample(template: RiskTemplate) {
    const headers = template.columns.map(c => `"${c.label}"`).join(",");
    const rows = template.exampleRisks.map(r =>
      template.columns.map(c => `"${(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${template.id}-sample.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function parseUploadedCsv(text: string) {
    function splitLine(line: string): string[] {
      const out: string[] = []; let cur = ""; let inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; } else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ""; } else { cur += ch; }
      }
      out.push(cur.trim());
      return out.map(v => v.replace(/^"|"$/g, ""));
    }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length < 1) return { cols: [], rows: [] };
    const headers = splitLine(lines[0]!);
    const cols: TemplateColumn[] = headers.map((h, i) => ({
      key: `col_${i}`,
      label: h,
      type: "text" as const,
    }));
    const rows: Record<string, string>[] = lines.slice(1).map(line => {
      const vals = splitLine(line);
      const obj: Record<string, string> = {};
      cols.forEach((c, i) => { obj[c.key] = vals[i] ?? ""; });
      return obj;
    });
    return { cols, rows };
  }

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadErr(""); setUploadStep("idle");
    file.text().then(text => {
      const { cols, rows } = parseUploadedCsv(text);
      if (cols.length === 0) { setUploadErr("Could not parse file. Ensure the first row contains column headers."); return; }
      setUploadCols(cols); setUploadRows(rows);
      setUploadName(file.name.replace(/\.(csv|xlsx?)$/i, ""));
      setUploadStep("parsed");
    }).catch(() => setUploadErr("Failed to read file."));
    e.target.value = "";
  }

  function saveCustomTemplate() {
    if (!uploadName.trim()) { setUploadErr("Please enter a template name."); return; }
    const newT: RiskTemplate = {
      id: `custom-${Date.now()}`,
      name: uploadName.trim(),
      standard: uploadStd.trim() || "Custom",
      version: "",
      category: "Custom",
      description: `Custom template uploaded from ${uploadName}.`,
      icon: "📋",
      color: "#374151",
      badgeColor: "rgba(55,65,81,0.10)",
      tags: ["Custom"],
      columns: uploadCols,
      exampleRisks: uploadRows.slice(0, 5),
      isCustom: true,
    };
    const updated = [...customTemplates, newT];
    setCustomTemplates(updated);
    localStorage.setItem("grc_custom_templates", JSON.stringify(updated));
    setShowUpload(false); setUploadStep("idle"); setUploadCols([]); setUploadRows([]);
    setUploadName(""); setUploadStd(""); setUploadErr("");
  }

  function deleteCustomTemplate(id: string) {
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    localStorage.setItem("grc_custom_templates", JSON.stringify(updated));
    if (selected?.id === id) setSelected(null);
  }

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--foreground)", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <i className="bi bi-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--muted-foreground)" }} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search templates by name, standard, or tag…"
            style={{ ...inp, paddingLeft: 30 }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${catFilter === cat ? "rgba(99,102,241,0.5)" : "var(--border)"}`, background: catFilter === cat ? "rgba(99,102,241,0.10)" : "transparent", color: catFilter === cat ? "#A5B4FC" : "var(--muted-foreground)" }}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={() => setShowUpload(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)", color: "#34D399", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          ⬆ Upload Custom Template
        </button>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
        {filtered.length} template{filtered.length !== 1 ? "s" : ""} available · {customTemplates.length} custom
      </div>

      {/* ── Template Grid ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {filtered.map(t => {
          const isActive = t.id === activeTemplateId;
          const isSelected = selected?.id === t.id;
          return (
            <div key={t.id}
              onClick={() => setSelected(isSelected ? null : t)}
              style={{
                background: "var(--card)", border: `1.5px solid ${isActive ? t.color : isSelected ? "rgba(147,197,253,0.4)" : "var(--border)"}`,
                borderRadius: 12, padding: "18px 20px", cursor: "pointer",
                boxShadow: isSelected ? "0 4px 20px rgba(0,0,0,0.15)" : "0 2px 8px rgba(0,0,0,0.05)",
                transition: "all 0.15s", position: "relative",
              }}
              onMouseEnter={e => { if (!isSelected && !isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(147,197,253,0.3)"; }}
              onMouseLeave={e => { if (!isSelected && !isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
            >
              {isActive && (
                <div style={{ position: "absolute", top: 10, right: 10, background: t.color, color: "white", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.5px" }}>ACTIVE</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: t.badgeColor, border: `1px solid ${t.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{t.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.3, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ background: t.badgeColor, color: t.color, border: `1px solid ${t.color}33`, borderRadius: 4, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{t.standard}</span>
                    {t.version && <span style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 8px", fontSize: 10 }}>{t.version}</span>}
                    {t.isCustom && <span style={{ background: "rgba(34,197,94,0.08)", color: "#34D399", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>Custom</span>}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6, margin: "0 0 12px" }}>{t.description}</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                  {t.columns.length} columns · {t.exampleRisks.length} examples
                </span>
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  {t.isCustom && (
                    <button onClick={() => deleteCustomTemplate(t.id)}
                      style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#F87171", fontFamily: "inherit" }}>
                      Delete
                    </button>
                  )}
                  <button onClick={() => exportSample(t)}
                    style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)", fontFamily: "inherit" }}>
                    ↓ Sample
                  </button>
                  <button onClick={() => { onUseTemplate(t); }}
                    style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", border: `1px solid ${t.color}55`, background: t.badgeColor, color: t.color, fontFamily: "inherit" }}>
                    {t.id === activeTemplateId ? "✓ Active" : "Use Template"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Template Detail Panel ──────────────────────────────────────── */}
      {selected && (
        <div style={{ background: "var(--card)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 14, padding: "24px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", animation: "fade-up 0.2s ease both" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selected.badgeColor, border: `1px solid ${selected.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{selected.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)", marginBottom: 6 }}>{selected.name}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ background: selected.badgeColor, color: selected.color, border: `1px solid ${selected.color}33`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{selected.standard} {selected.version}</span>
                  <span style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 10px", fontSize: 11 }}>{selected.category}</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => exportSample(selected)}
                style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                ↓ Export Sample CSV
              </button>
              <button onClick={() => { onUseTemplate(selected); }}
                style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: `linear-gradient(135deg, ${selected.color}, ${selected.color}cc)`, color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {selected.id === activeTemplateId ? "✓ Already Active" : "▶ Use This Template"}
              </button>
              <button onClick={() => setSelected(null)}
                style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)", cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>×</button>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7, marginBottom: 18 }}>{selected.description}</p>

          {/* Tags */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {selected.tags.map(tag => (
              <span key={tag} style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: 20, padding: "2px 10px", fontSize: 10 }}>{tag}</span>
            ))}
          </div>

          {/* Preview tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
            {(["columns", "sample"] as const).map(t => (
              <button key={t} onClick={() => setPreviewTab(t)}
                style={{ padding: "7px 18px", border: "none", borderRadius: "6px 6px 0 0", background: previewTab === t ? "rgba(147,197,253,0.1)" : "transparent", color: previewTab === t ? "rgb(147,197,253)" : "var(--muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", borderBottom: previewTab === t ? "2px solid rgb(147,197,253)" : "2px solid transparent" }}>
                {t === "columns" ? `📋 Columns (${selected.columns.length})` : `📄 Sample Data (${selected.exampleRisks.length} rows)`}
              </button>
            ))}
          </div>

          {/* Columns list */}
          {previewTab === "columns" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {selected.columns.map((col, i) => (
                <div key={col.key} style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-foreground)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", flexShrink: 0, marginTop: 1 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", marginBottom: 2 }}>{col.label}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <span style={{ fontSize: 9, background: col.type === "select" ? "rgba(99,102,241,0.1)" : col.type === "number" ? "rgba(34,197,94,0.08)" : col.type === "date" ? "rgba(245,158,11,0.08)" : "rgba(147,197,253,0.1)", color: col.type === "select" ? "#A5B4FC" : col.type === "number" ? "#34D399" : col.type === "date" ? "#FBBF24" : "rgb(147,197,253)", borderRadius: 3, padding: "1px 6px", fontWeight: 700 }}>
                        {col.type}
                      </span>
                      {col.options && <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontStyle: "italic" }}>{col.options.length} options</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sample data */}
          {previewTab === "sample" && selected.exampleRisks.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "var(--secondary)", borderBottom: "1px solid var(--border)" }}>
                    {selected.columns.slice(0, 8).map(col => (
                      <th key={col.key} style={{ padding: "8px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{col.label}</th>
                    ))}
                    {selected.columns.length > 8 && <th style={{ padding: "8px 10px", fontSize: 9, color: "var(--muted-foreground)" }}>+{selected.columns.length - 8} more</th>}
                  </tr>
                </thead>
                <tbody>
                  {selected.exampleRisks.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      {selected.columns.slice(0, 8).map(col => (
                        <td key={col.key} style={{ padding: "8px 10px", color: "var(--foreground)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[col.key]}>
                          {row[col.key] || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>—</span>}
                        </td>
                      ))}
                      {selected.columns.length > 8 && <td style={{ padding: "8px 10px", color: "var(--muted-foreground)" }}>…</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Upload Custom Template Modal ─────────────────────────────── */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { setShowUpload(false); setUploadStep("idle"); setUploadErr(""); }}>
          <div style={{ background: "var(--card)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 14, padding: "28px 32px", width: 600, maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.7)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#34D399", marginBottom: 4 }}>Upload Custom Template</div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 20 }}>
              Upload a CSV file where the first row is column headers. Subsequent rows become example risk entries.
            </div>

            {uploadStep === "idle" && (
              <div>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: "2px dashed rgba(34,197,94,0.35)", borderRadius: 10, padding: "32px", textAlign: "center", cursor: "pointer", background: "rgba(34,197,94,0.04)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(34,197,94,0.6)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(34,197,94,0.35)"}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>Click to select a CSV file</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Supported formats: .csv · First row must be column headers</div>
                </div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleUploadFile} />
                {uploadErr && <div style={{ marginTop: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#EF4444" }}>{uploadErr}</div>}
              </div>
            )}

            {uploadStep === "parsed" && (
              <div>
                <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#34D399", fontWeight: 700 }}>
                  ✓ Parsed {uploadCols.length} columns · {uploadRows.length} example row{uploadRows.length !== 1 ? "s" : ""}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>Template Name *</div>
                    <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. My Company Risk Template" style={inp} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>Standard / Framework (optional)</div>
                    <input value={uploadStd} onChange={e => setUploadStd(e.target.value)} placeholder="e.g. Internal, ISO 27001, Custom" style={inp} />
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Detected Columns</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {uploadCols.map(col => (
                    <span key={col.key} style={{ background: "var(--secondary)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 9px", fontSize: 11, color: "var(--foreground)" }}>{col.label}</span>
                  ))}
                </div>

                {uploadErr && <div style={{ marginBottom: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#EF4444" }}>{uploadErr}</div>}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={saveCustomTemplate}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #065F46, #059669)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Save Custom Template
                  </button>
                  <button onClick={() => { setUploadStep("idle"); setUploadCols([]); setUploadRows([]); setUploadErr(""); }}
                    style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => { setShowUpload(false); setUploadStep("idle"); setUploadErr(""); }}
                style={{ padding: "7px 16px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--secondary)", color: "var(--muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

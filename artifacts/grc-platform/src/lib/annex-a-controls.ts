// ISO 27001:2022 Annex A — master control dictionary used by the Journey dashboard.
// Controls are referenced by ID from each step. Keeping them separate from
// journey-data.ts avoids bloating that already-large file.

export type AnnexDomain = "Organisational" | "People" | "Physical" | "Technological";

export interface AnnexControl {
  id: string;
  name: string;
  description: string;
  domain: AnnexDomain;
  purpose: string;
  implementation: string[];
  testingGuidance: string;
  commonGaps: string[];
}

export type ControlImplStatus = "not-started" | "in-progress" | "partial" | "implemented";

export const CTRL_STATUS_CFG: Record<ControlImplStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  "not-started": { label: "Not Started",   color: "#94A3B8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)",  dot: "#94A3B8" },
  "in-progress":  { label: "In Progress",  color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)", dot: "#F59E0B" },
  "partial":      { label: "Partial",      color: "#F97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.25)", dot: "#F97316" },
  "implemented":  { label: "Implemented",  color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)", dot: "#10B981" },
};

export const ISO27001_CONTROLS: Record<string, AnnexControl> = {
  "5.1": {
    id: "5.1", domain: "Organisational",
    name: "Policies for information security",
    description: "Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel and relevant interested parties, and reviewed at planned intervals or if significant changes occur.",
    purpose: "Establishes management direction and support for information security across the organisation. The top-level policy is the cornerstone of the ISMS and demonstrates leadership commitment.",
    implementation: [
      "Draft a top-level Information Security Policy covering scope, objectives, principles, and management commitment",
      "Define topic-specific supporting policies for each key control domain (access control, cryptography, backup, etc.)",
      "Obtain formal management sign-off on all policies before publication",
      "Distribute policies to all relevant staff and record acknowledgement in PeopleOps",
      "Establish an annual review cycle and assign a policy owner for each document",
    ],
    testingGuidance: "Verify management approval signatures and version history. Check that all staff have acknowledged current policy versions. Confirm review dates are within the last 12 months.",
    commonGaps: [
      "Policies exist but have not been reviewed in >12 months",
      "No formal management approval records",
      "Staff acknowledgement records incomplete",
      "Topic-specific policies missing for key domains (cryptography, backup, mobile)",
    ],
  },
  "5.2": {
    id: "5.2", domain: "Organisational",
    name: "Information security roles and responsibilities",
    description: "Information security roles and responsibilities shall be defined and allocated according to the needs of the organisation.",
    purpose: "Ensures every aspect of the ISMS has a named accountable owner. Without clear role assignment, controls fall through the cracks and accountability is impossible to enforce.",
    implementation: [
      "Define an ISMS responsibility matrix covering all ISO 27001 clauses and Annex A controls",
      "Assign a named ISMS Manager (day-to-day ISMS operations) and CISO (strategic oversight)",
      "Assign control owners for all applicable Annex A controls in GovOps",
      "Document roles in the RACI matrix and include in the Information Security Policy",
      "Include ISMS responsibilities in relevant job descriptions",
    ],
    testingGuidance: "Check that every Annex A control has a named owner in GovOps. Verify RACI matrix covers all clauses 4-10. Confirm job descriptions reference IS responsibilities.",
    commonGaps: [
      "Controls assigned to teams rather than named individuals",
      "RACI matrix not updated after organisational changes",
      "Responsibilities informal and undocumented",
    ],
  },
  "5.4": {
    id: "5.4", domain: "Organisational",
    name: "Management responsibilities",
    description: "Management shall require all personnel to apply information security in accordance with the established information security policy, topic-specific policies and procedures of the organisation.",
    purpose: "Holds management accountable for enforcing information security requirements across the workforce. Management direction is a prerequisite for a functioning ISMS.",
    implementation: [
      "Ensure management communicates IS policy at team meetings and all-hands",
      "Include IS responsibilities in performance reviews for all managers",
      "Establish an escalation path for IS issues to senior management",
      "Ensure management actively participates in the annual management review",
      "Require managers to confirm their team members have completed IS training",
    ],
    testingGuidance: "Request evidence of management communications (emails, meeting minutes). Check performance review criteria include IS responsibilities. Verify management review meeting took place annually.",
    commonGaps: [
      "No documented evidence of management IS communications",
      "IS responsibilities absent from performance review criteria",
      "Management review not held or minutes not retained",
    ],
  },
  "5.7": {
    id: "5.7", domain: "Organisational",
    name: "Threat intelligence",
    description: "Information relating to information security threats shall be collected and analysed to produce threat intelligence.",
    purpose: "Provides the organisation with awareness of evolving threats so that risk assessments and controls remain current and effective.",
    implementation: [
      "Subscribe to at least 2-3 threat intelligence feeds relevant to your sector (NCSC, CERT, ISAC)",
      "Assign a threat intelligence owner responsible for reviewing and disseminating intelligence",
      "Establish a monthly threat review process and link findings to the risk register in RiskOps",
      "Document how threat intelligence is incorporated into risk assessments",
      "Record intelligence sources and review dates as evidence",
    ],
    testingGuidance: "Verify active subscription to threat feeds. Check risk register for links to threat intelligence findings. Confirm monthly review records exist.",
    commonGaps: [
      "No formal threat intelligence process — relying on ad-hoc news",
      "Intelligence gathered but not linked to risk assessments",
      "No documented owner for threat intelligence review",
    ],
  },
  "5.14": {
    id: "5.14", domain: "Organisational",
    name: "Information transfer",
    description: "Information transfer rules, procedures, or agreements shall be in place for all types of transfer facilities within the organisation and between the organisation and other parties.",
    purpose: "Prevents unauthorised disclosure of information during transfer both internally and to external parties, including suppliers and customers.",
    implementation: [
      "Define an Information Transfer Policy covering email, file sharing, physical media, and verbal disclosure",
      "Implement email encryption for sensitive data transfers (TLS minimum, end-to-end for classified)",
      "Restrict use of personal cloud storage for work data",
      "Include information transfer requirements in supplier contracts",
      "Train staff on information classification and transfer rules annually",
    ],
    testingGuidance: "Review Information Transfer Policy coverage. Test email TLS configuration. Verify supplier contracts include data handling requirements. Check training completion records.",
    commonGaps: [
      "No formal information transfer policy",
      "Email encryption not enforced for sensitive categories",
      "Supplier contracts missing data transfer obligations",
    ],
  },
  "5.31": {
    id: "5.31", domain: "Organisational",
    name: "Legal, statutory, regulatory and contractual requirements",
    description: "Legal, statutory, regulatory and contractual requirements relevant to information security and the organisation's approach to meet these requirements shall be identified, documented and kept up to date.",
    purpose: "Ensures the ISMS is designed to meet all applicable legal obligations, preventing regulatory fines and contractual breaches.",
    implementation: [
      "Conduct a legal requirements mapping exercise covering GDPR, sector regulations, and contractual obligations",
      "Document each requirement with its source, applicability, and how the ISMS addresses it",
      "Assign a Legal Counsel reviewer to maintain the requirements register",
      "Link each requirement to the relevant ISMS controls in GovOps",
      "Review requirements register at least annually and after any regulatory change",
    ],
    testingGuidance: "Verify requirements register is current (reviewed within 12 months). Check that all applicable regulations are listed. Confirm ISMS controls are linked to requirements.",
    commonGaps: [
      "Requirements register not updated after regulatory changes",
      "GDPR obligations not fully captured",
      "No linkage between legal requirements and ISMS controls",
    ],
  },
  "5.33": {
    id: "5.33", domain: "Organisational",
    name: "Protection of records",
    description: "Records shall be protected from loss, destruction, falsification, unauthorised access and unauthorised release.",
    purpose: "Preserves the integrity and availability of records needed for legal compliance, audit evidence, and business continuity.",
    implementation: [
      "Define record retention periods for each record category (ISMS records, audit evidence, policies)",
      "Implement access controls to prevent unauthorised modification of records",
      "Protect records from deletion — use append-only storage or WORM for critical records",
      "Back up all ISMS records with tested restoration capability",
      "Document the records management procedure in GovOps",
    ],
    testingGuidance: "Check retention schedule is documented and followed. Test record access controls. Verify backup and restoration test records for ISMS record storage.",
    commonGaps: [
      "No formal retention schedule",
      "ISMS records stored in systems without adequate access controls",
      "Backup not tested for ISMS record storage",
    ],
  },
  "5.35": {
    id: "5.35", domain: "Organisational",
    name: "Independent review of information security",
    description: "The organisation's approach to managing information security and its implementation (including people, processes and technologies) shall be reviewed independently at planned intervals or when significant changes occur.",
    purpose: "Provides an objective assessment of ISMS effectiveness, identifying gaps that internal teams may miss due to familiarity bias.",
    implementation: [
      "Commission an independent internal or external ISMS audit annually",
      "Ensure the auditor has no operational ISMS responsibilities (independence requirement)",
      "Scope the review to cover all applicable ISO 27001 clauses and Annex A controls",
      "Document audit findings and management responses",
      "Track corrective actions to closure in ComplianceOps or SecOps",
    ],
    testingGuidance: "Verify auditor independence. Check audit scope covers all clauses and applicable controls. Confirm findings register is complete and corrective actions tracked.",
    commonGaps: [
      "Audit conducted by the ISMS Manager (lack of independence)",
      "Scope too narrow — misses several Annex A domains",
      "Findings not formally tracked through to closure",
    ],
  },
  "5.36": {
    id: "5.36", domain: "Organisational",
    name: "Compliance with policies, rules and standards for information security",
    description: "Compliance with the organisation's information security policy, topic-specific policies, rules and standards shall be regularly reviewed.",
    purpose: "Ensures that the ISMS controls defined in policy are actually being followed in practice, not just documented on paper.",
    implementation: [
      "Define a compliance review schedule for all IS policies (at least annual)",
      "Use technical controls (SIEM, DLP, vulnerability scanning) to automate compliance checks where possible",
      "Conduct manual compliance spot-checks for non-automatable controls",
      "Record review findings and any non-compliances in ComplianceOps",
      "Escalate non-compliances for corrective action within defined SLAs",
    ],
    testingGuidance: "Check that compliance reviews are documented for all topic-specific policies. Verify technical controls are active and producing compliance data. Confirm non-compliances have corrective actions.",
    commonGaps: [
      "Compliance reviews undocumented or ad-hoc",
      "Technical compliance monitoring not configured",
      "Non-compliances raised but not tracked to closure",
    ],
  },
  "5.37": {
    id: "5.37", domain: "Organisational",
    name: "Documented operating procedures",
    description: "Operating procedures for information processing facilities shall be documented and made available to all users who need them.",
    purpose: "Ensures consistency in the execution of security-critical operations, reduces human error, and provides evidence of procedural controls.",
    implementation: [
      "Document operating procedures for all security-critical processes (backup, patch, incident response, access provisioning)",
      "Store procedures in GovOps and ensure they are version-controlled",
      "Assign a procedure owner responsible for annual review",
      "Make procedures accessible to all staff who need them",
      "Include procedure references in staff onboarding and training",
    ],
    testingGuidance: "Verify procedures exist for all security-critical operations. Check version control and review dates. Confirm staff can access procedures they need. Test that procedures match actual practice.",
    commonGaps: [
      "Procedures exist informally but are not documented",
      "Outdated procedures that no longer match actual operations",
      "Procedures inaccessible to the staff who need them",
    ],
  },
  "6.1": {
    id: "6.1", domain: "People",
    name: "Screening",
    description: "Background verification checks on all candidates to become personnel shall be carried out prior to joining the organisation and on an ongoing basis taking into consideration applicable laws, regulations and ethics and be proportional to the business requirements, the classification of the information to be accessed and the perceived risks.",
    purpose: "Reduces the insider threat risk by verifying the background of staff before granting access to sensitive information and systems.",
    implementation: [
      "Define a screening policy specifying checks required per role classification (basic, enhanced, financial)",
      "Implement pre-employment screening: identity, right-to-work, employment history, criminal record (where legally permitted)",
      "Include screening requirements in job offers and employment contracts",
      "Store screening records securely in HR systems with defined retention periods",
      "Review screening requirements periodically — especially for staff in privileged access roles",
    ],
    testingGuidance: "Verify screening policy exists and is applied to all relevant roles. Check records of screening conducted for a sample of recent hires. Confirm screening records are retained as required.",
    commonGaps: [
      "Screening policy not consistently applied across all role types",
      "No screening records retained",
      "Privileged access roles not subject to enhanced screening",
    ],
  },
  "6.2": {
    id: "6.2", domain: "People",
    name: "Terms and conditions of employment",
    description: "The employment contractual agreements shall state the personnel's and the organisation's responsibilities for information security.",
    purpose: "Creates a legal obligation for staff to comply with IS requirements and establishes the basis for disciplinary action in the event of policy violations.",
    implementation: [
      "Include information security responsibilities in all employment contracts",
      "Reference the Information Security Policy, Acceptable Use Policy, and confidentiality obligations in contracts",
      "Obtain signed acknowledgement of IS responsibilities from all staff",
      "Update contracts when responsibilities materially change",
      "Extend requirements to contractors and third parties via separate agreements",
    ],
    testingGuidance: "Review a sample of employment contracts for IS obligation clauses. Verify confidentiality obligations are present. Check contractor agreements for equivalent requirements.",
    commonGaps: [
      "IS responsibilities absent from older employment contracts",
      "Contractors not required to sign IS obligations",
      "No signed acknowledgement records retained",
    ],
  },
  "6.3": {
    id: "6.3", domain: "People",
    name: "Information security awareness, education and training",
    description: "Personnel of the organisation and, where relevant, interested parties shall receive appropriate information security awareness education and training and regular updates in the organisation's information security policy, topic-specific policies and procedures.",
    purpose: "Reduces human-factor risk by ensuring all staff understand their IS responsibilities and can recognise common threats such as phishing and social engineering.",
    implementation: [
      "Implement an annual mandatory security awareness training programme for all staff",
      "Include: phishing recognition, password security, data handling, incident reporting, acceptable use",
      "Track completion rates in PeopleOps and follow up non-completers",
      "Supplement with phishing simulation campaigns at least quarterly",
      "Provide role-specific training for staff in high-risk roles (IT, Finance, HR)",
    ],
    testingGuidance: "Check training completion records show ≥95% of staff. Review training content for currency. Verify phishing simulation results and improvement trends. Check follow-up actions for repeated failures.",
    commonGaps: [
      "Training completion rates below 90%",
      "No phishing simulation programme",
      "Training content not updated to reflect new threats",
      "Role-specific training absent for high-risk roles",
    ],
  },
  "8.2": {
    id: "8.2", domain: "Technological",
    name: "Privileged access rights",
    description: "The allocation and use of privileged access rights shall be restricted and managed.",
    purpose: "Limits the blast radius of insider threats and compromised accounts by ensuring privileged access is granted only to those who need it and is regularly reviewed.",
    implementation: [
      "Implement a formal process for requesting, approving, and provisioning privileged access",
      "Apply least-privilege principles — grant minimum access required for the role",
      "Enforce MFA for all privileged accounts (admin, root, service accounts)",
      "Review all privileged access quarterly and revoke access no longer required",
      "Log all privileged account activity and alert on anomalous behaviour via SIEM",
    ],
    testingGuidance: "Check privileged access list against role requirements (look for over-provisioned accounts). Verify MFA is enforced. Review access log samples for anomalies. Confirm quarterly review was completed.",
    commonGaps: [
      "Shared privileged accounts with no individual accountability",
      "MFA not enforced for all admin accounts",
      "Access review not completed or not documented",
      "Stale privileged accounts from former employees or contractors",
    ],
  },
  "8.3": {
    id: "8.3", domain: "Technological",
    name: "Information access restriction",
    description: "Access to information and other associated assets shall be restricted in accordance with the established topic-specific policy on access control.",
    purpose: "Enforces the need-to-know principle, ensuring sensitive data is accessible only to authorised personnel.",
    implementation: [
      "Implement role-based access control (RBAC) aligned to job functions",
      "Apply data classification labels and enforce access by classification level",
      "Use technical access controls (ACLs, file permissions, DLP) to enforce policy",
      "Conduct quarterly access reviews for all systems holding sensitive data",
      "Remove access immediately upon role change or termination (joiner/mover/leaver process)",
    ],
    testingGuidance: "Test access controls by attempting to access sensitive resources with non-privileged accounts. Verify RBAC is consistently applied. Check joiner/mover/leaver process records.",
    commonGaps: [
      "Excessive access granted at role creation and never reviewed",
      "No formal joiner/mover/leaver process",
      "Data classification not enforced by technical controls",
    ],
  },
  "8.8": {
    id: "8.8", domain: "Technological",
    name: "Management of technical vulnerabilities",
    description: "Information about technical vulnerabilities of information systems in use shall be obtained in a timely manner, the organisation's exposure to such vulnerabilities evaluated, and appropriate measures taken.",
    purpose: "Reduces the attack surface by identifying and remediating exploitable vulnerabilities before threat actors can weaponise them.",
    implementation: [
      "Implement a vulnerability scanning programme covering all in-scope systems (weekly minimum for internet-facing)",
      "Subscribe to vendor security advisories and CVE feeds",
      "Define patch SLAs: Critical 7 days, High 30 days, Medium 90 days",
      "Track vulnerability remediation in SecOps with assigned owners and target dates",
      "Report patch SLA compliance as an ISMS KPI monthly",
    ],
    testingGuidance: "Review vulnerability scan reports for completeness of coverage. Check patch SLA compliance rates. Verify Critical and High vulnerabilities are within SLA. Confirm tracking in SecOps.",
    commonGaps: [
      "Vulnerability scanning not covering all in-scope systems",
      "No formal patch SLAs defined",
      "Critical vulnerabilities older than 30 days unpatched",
      "No tracking or KPI reporting for patch compliance",
    ],
  },
  "8.9": {
    id: "8.9", domain: "Technological",
    name: "Configuration management",
    description: "Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.",
    purpose: "Prevents configuration drift and insecure default settings, which are among the most commonly exploited attack vectors.",
    implementation: [
      "Define security baseline configurations for all system types (servers, endpoints, network devices, cloud services)",
      "Use a configuration management tool (Ansible, Puppet, SCCM) to enforce baselines at scale",
      "Scan for configuration drift against baselines at least monthly",
      "Document all configuration changes through the change management process",
      "Review and update baselines annually or after major platform changes",
    ],
    testingGuidance: "Compare system configurations against documented baselines. Check for hardened settings (disabled unnecessary services, strong cipher suites). Review change management records for recent configuration changes.",
    commonGaps: [
      "No documented security baseline configurations",
      "Configuration management not applied to cloud workloads",
      "Configuration changes made outside change management process",
    ],
  },
  "8.16": {
    id: "8.16", domain: "Technological",
    name: "Monitoring activities",
    description: "Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.",
    purpose: "Enables detection of security incidents and anomalous behaviour in a timely manner, reducing the mean time to detect (MTTD) and contain threats.",
    implementation: [
      "Deploy a SIEM or centralised log management platform covering all in-scope systems",
      "Define use cases and alert rules for common attack patterns (brute force, lateral movement, data exfiltration)",
      "Establish a 24/7 or business-hours monitoring capability with defined escalation paths",
      "Retain logs for a minimum of 12 months (90 days hot, 12 months cold)",
      "Review SIEM alerts and escalate to incident response within defined SLAs",
    ],
    testingGuidance: "Verify SIEM coverage includes all critical systems. Test alert rules by generating sample events. Check log retention settings. Review incident response escalation records.",
    commonGaps: [
      "SIEM not covering all in-scope systems (gaps in cloud or OT)",
      "Alert rules not tuned — either too noisy or missing key patterns",
      "Log retention shorter than 12 months",
      "No defined escalation path for SIEM alerts",
    ],
  },
};

// ── Per-step Annex A control references ───────────────────────────────────────
export const ISO27001_STEP_CONTROL_IDS: Record<number, string[]> = {
  1:  ["5.1", "5.2", "5.4", "5.36"],
  2:  ["5.31", "5.36", "5.2", "5.33"],
  3:  ["5.1", "5.31", "5.33", "5.36"],
  4:  ["5.1", "5.2", "5.37", "5.36"],
  5:  ["5.4", "5.2", "6.3", "6.2"],
  6:  ["5.2", "5.4", "6.1", "6.2"],
  7:  ["5.35", "5.36", "5.7", "5.1"],
  8:  ["5.36", "5.37", "8.16", "8.8"],
  9:  ["5.7", "8.2", "8.3", "8.9"],
  10: ["5.1", "5.31", "5.35", "5.36"],
  11: ["5.1", "5.31", "5.33", "5.36"],
  12: ["5.7", "8.8", "8.9", "8.2"],
  13: ["5.1", "5.36", "5.37", "6.2"],
  14: ["5.33", "8.16", "5.35", "5.36"],
  15: ["5.36", "8.16", "5.35"],
  16: ["8.8", "5.35", "5.7", "8.16"],
  17: ["5.36", "5.35", "5.4"],
  18: ["5.35", "8.16", "6.3", "5.36"],
  19: ["5.35", "5.36", "5.33", "5.1"],
};

export function getStepControls(stepNum: number): AnnexControl[] {
  const ids = ISO27001_STEP_CONTROL_IDS[stepNum] ?? [];
  return ids.map(id => ISO27001_CONTROLS[id]).filter(Boolean) as AnnexControl[];
}

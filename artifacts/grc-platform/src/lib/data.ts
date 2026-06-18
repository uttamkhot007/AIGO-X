export const kpis = [
  { id: "grc-score",     label: "GRC Score",         value: 84,  unit: "/100", delta: "+3.2", up: true,  color: "#1E3A5F", bg: "#EFF6FF", border: "#BFDBFE" },
  { id: "open-risks",    label: "Open Risks",         value: 47,  unit: "",     delta: "-12",  up: false, color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
  { id: "controls",      label: "Controls Coverage",  value: 91,  unit: "%",    delta: "+5.1", up: true,  color: "#065F46", bg: "#ECFDF5", border: "#A7F3D0" },
  { id: "audits",        label: "Active Audits",      value: 6,   unit: "",     delta: "0",    up: true,  color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
  { id: "privacy",       label: "Privacy Readiness",  value: 78,  unit: "%",    delta: "+8.4", up: true,  color: "#065F46", bg: "#F0FDF4", border: "#BBF7D0" },
];

export const riskSegments = [
  { label: "Critical", count: 7,  pct: 0.12, color: "#DC2626" },
  { label: "High",     count: 14, pct: 0.23, color: "#D97706" },
  { label: "Medium",   count: 19, pct: 0.38, color: "#1E3A5F" },
  { label: "Low",      count: 7,  pct: 0.27, color: "#065F46" },
];

export const frameworks = [
  { id: "iso27001",  name: "ISO 27001:2022",      pct: 78,  trend: "up",   color: "#1E3A5F", scope: "Full ISMS",              controls: 114, owner: "Priya Lee",     nextReview: "2024-10-14" },
  { id: "soc2",      name: "SOC 2 Type II",        pct: 81,  trend: "up",   color: "#065F46", scope: "Trust Services",          controls: 64,  owner: "Marcus Johnson",nextReview: "2024-09-30" },
  { id: "gdpr",      name: "GDPR",                 pct: 68,  trend: "up",   color: "#4338CA", scope: "Data Processing",         controls: 25,  owner: "Emma Wilson",   nextReview: "2024-07-15" },
  { id: "hipaa",     name: "HIPAA",                pct: 84,  trend: "flat", color: "#92400E", scope: "ePHI Systems",            controls: 45,  owner: "Ryan Johnson",  nextReview: "2024-07-01" },
  { id: "nis2",      name: "NIS2 Directive",        pct: 38,  trend: "up",   color: "#0C4A6E", scope: "Essential Services",      controls: 21,  owner: "Maria Santos",  nextReview: "2024-08-20" },
  { id: "pcidss",    name: "PCI DSS v4.0",          pct: 78,  trend: "up",   color: "#B45309", scope: "Cardholder Data",         controls: 78,  owner: "Alex Kim",      nextReview: "2024-09-15" },
  { id: "nistcsf",   name: "NIST CSF v2.0",         pct: 67,  trend: "up",   color: "#1D4ED8", scope: "Critical Infrastructure", controls: 108, owner: "Priya Lee",     nextReview: "2024-11-01" },
  { id: "cis18",     name: "CIS Controls v18",      pct: 72,  trend: "flat", color: "#065F46", scope: "Enterprise IT",           controls: 18,  owner: "Marcus Johnson",nextReview: "2024-10-01" },
  { id: "iso22301",  name: "ISO 22301:2019",        pct: 61,  trend: "up",   color: "#7C3AED", scope: "BCM Programme",           controls: 34,  owner: "Alex Kim",      nextReview: "2024-12-01" },
  { id: "dora",      name: "DORA",                  pct: 44,  trend: "up",   color: "#9D174D", scope: "Financial ICT Risk",      controls: 46,  owner: "Emma Wilson",   nextReview: "2025-01-17" },
  { id: "sama",      name: "SAMA CSF",              pct: 55,  trend: "flat", color: "#065F46", scope: "Banking & Insurance",     controls: 85,  owner: "Maria Santos",  nextReview: "2025-01-01" },
  { id: "swift",     name: "SWIFT CSCF",            pct: 91,  trend: "up",   color: "#1E3A5F", scope: "SWIFT Messaging",         controls: 32,  owner: "Ryan Johnson",  nextReview: "2025-01-01" },
  { id: "cmmc",      name: "CMMC 2.0 Level 2",      pct: 48,  trend: "up",   color: "#7C3AED", scope: "Defense Contracts",       controls: 110, owner: "Alex Kim",      nextReview: "2025-06-01" },
  { id: "euaiact",   name: "EU AI Act",             pct: 31,  trend: "up",   color: "#4338CA", scope: "High-Risk AI Systems",    controls: 18,  owner: "Emma Wilson",   nextReview: "2025-08-02" },
  { id: "iso42001",  name: "ISO 42001:2023",        pct: 27,  trend: "up",   color: "#0891B2", scope: "AI Management System",    controls: 26,  owner: "Priya Lee",     nextReview: "2025-01-01" },
  { id: "fedramp",   name: "FedRAMP Moderate",      pct: 52,  trend: "flat", color: "#DC2626", scope: "Federal Cloud Systems",   controls: 325, owner: "Marcus Johnson",nextReview: "2025-03-01" },
  { id: "iso31000",  name: "ISO 31000:2018",        pct: 73,  trend: "up",   color: "#065F46", scope: "Enterprise Risk",         controls: 22,  owner: "Maria Santos",  nextReview: "2024-12-01" },
  { id: "csa",       name: "CSA CCM v4.0",          pct: 59,  trend: "up",   color: "#0C4A6E", scope: "Cloud Infrastructure",    controls: 197, owner: "Alex Kim",      nextReview: "2024-11-15" },
  { id: "ccpa",      name: "CCPA / CPRA",           pct: 74,  trend: "flat", color: "#7C3AED", scope: "California Consumers",    controls: 20,  owner: "Emma Wilson",   nextReview: "2025-01-01" },
  { id: "iso27701",  name: "ISO 27701:2019",        pct: 62,  trend: "up",   color: "#9D174D", scope: "Privacy Info Mgmt",       controls: 49,  owner: "Priya Lee",     nextReview: "2024-09-01" },
];

export type Severity = "Critical" | "High" | "Medium" | "Low";

export type RiskStatus = "open" | "in-progress" | "accepted" | "closed";

export interface Risk {
  id: string;
  severity: Severity;
  name: string;
  owner: string;
  ownerFull: string;
  score: number;
  trend: string;
  category: string;
  status: RiskStatus;
  description: string;
  created: string;
  updated: string;
}

export const risks: Risk[] = [
  { id: "RK-2041", severity: "Critical",  name: "Unpatched RCE in Core API",                      owner: "AK", ownerFull: "Alex Kim",      score: 9.8,  trend: "up",   category: "Vulnerability",     status: "open",        description: "CVE-2024-1234: Remote code execution vulnerability in the authentication API endpoint. CVSS 9.8. Patch available; deployment blocked by change freeze.", created: "2024-06-01", updated: "2024-06-10" },
  { id: "RK-2039", severity: "Critical",  name: "Privileged Account without MFA",                  owner: "PL", ownerFull: "Priya Lee",     score: 9.2,  trend: "flat", category: "Identity",          status: "open",        description: "3 privileged service accounts accessing production systems are not enrolled in MFA, violating CIS Control 6.3 and SOC 2 CC6.1.", created: "2024-05-14", updated: "2024-06-08" },
  { id: "RK-2037", severity: "High",      name: "SaaS Data Residency Violation",                   owner: "EW", ownerFull: "Emma Wilson",   score: 8.7,  trend: "up",   category: "Privacy",           status: "open",        description: "EU personal data processed by a US-hosted SaaS vendor without SCCs or BCRs in place, creating GDPR Art. 46 exposure.", created: "2024-04-22", updated: "2024-06-05" },
  { id: "RK-2035", severity: "Medium",   name: "Vendor Data Processing Agreement Missing",          owner: "PL", ownerFull: "Priya Lee",     score: 9.1,  trend: "up",   category: "Third-Party Risk",  status: "open",        description: "Vendor Accenture lacks signed DPA for processing EU personal data in scope of GDPR.", created: "2024-01-10", updated: "2024-06-01" },
  { id: "RK-2033", severity: "Medium",   name: "DSAR Response SLA Breach Risk",                    owner: "EW", ownerFull: "Emma Wilson",   score: 7.6,  trend: "flat", category: "Privacy",           status: "open",        description: "3 open data subject access requests approaching 30-day SLA. Risk of non-compliance with GDPR Art. 15.", created: "2023-12-20", updated: "2024-05-30" },
];

export const controls = [
  { id: "A.9.4.2",   framework: "ISO 27001", domain: "Access Control",    name: "Secure log-on procedures",             status: "implemented", owner: "AK", evidence: 4, dueDate: "2024-12-31" },
  { id: "A.12.6.1",  framework: "ISO 27001", domain: "Vulnerability Mgmt",name: "Management of technical vulnerabilities",status: "partial",    owner: "RJ", evidence: 2, dueDate: "2024-09-30" },
  { id: "CC6.1",     framework: "SOC 2",     domain: "Logical Access",    name: "Logical and physical access controls",  status: "implemented", owner: "MS", evidence: 6, dueDate: "2024-12-31" },
  { id: "CC7.2",     framework: "SOC 2",     domain: "System Operations", name: "Monitors system components for anomalies",status: "implemented", owner: "RJ", evidence: 3, dueDate: "2024-12-31" },
  { id: "ART-30",    framework: "GDPR",      domain: "Records",           name: "Records of processing activities (RoPA)",status: "implemented", owner: "EW", evidence: 5, dueDate: "2024-12-31" },
  { id: "ART-32",    framework: "GDPR",      domain: "Security",          name: "Security of processing",               status: "partial",     owner: "PL", evidence: 1, dueDate: "2024-08-15" },
  { id: "164.312.a", framework: "HIPAA",     domain: "Technical",         name: "Access control standard",              status: "implemented", owner: "AK", evidence: 4, dueDate: "2024-12-31" },
  { id: "164.312.b", framework: "HIPAA",     domain: "Technical",         name: "Audit controls",                       status: "planned",     owner: "MS", evidence: 0, dueDate: "2024-10-01" },
  { id: "NIS2-ART21",framework: "NIS2",      domain: "Security",          name: "Cybersecurity risk measures",          status: "partial",     owner: "RJ", evidence: 2, dueDate: "2024-10-17" },
  { id: "NIS2-ART23",framework: "NIS2",      domain: "Incident Reporting",name: "Incident notification obligations",     status: "not-started", owner: "EW", evidence: 0, dueDate: "2024-10-17" },
];

export const recentActivity = [
  { id: "1", module: "RiskOps",       action: "Escalated",  item: "Unpatched RCE in Core API",            user: "Alex Kim",     time: "5 min ago"   },
  { id: "2", module: "ComplianceOps", action: "Completed",  item: "ISO 27001 Surveillance Audit",          user: "Priya Lee",    time: "18 min ago"  },
  { id: "3", module: "PrivacyOps",    action: "Submitted",  item: "DSAR #DS-0041 — Right to Erasure",      user: "Emma Wilson",  time: "42 min ago"  },
  { id: "4", module: "GovOps",        action: "Published",  item: "Access Control Policy v3.2",            user: "Marcus Johnson",time: "1 hr ago"    },
  { id: "5", module: "SecOps",        action: "Resolved",   item: "Crowdstrike Alert — Lateral Movement",  user: "Ryan Johnson", time: "2 hrs ago"   },
];

export const aiInsights = [
  { id: "ai1", category: "Risk",        insight: "3 critical risks have been open >30 days without treatment update. Escalation recommended to Risk Committee.",                 confidence: 87, action: "View Risks" },
  { id: "ai2", category: "Compliance",  insight: "ISO 27001 certification at 87% readiness. 6 controls in 'partial' status are blocking full certification.",                    confidence: 91, action: "View Controls" },
  { id: "ai3", category: "Privacy",     insight: "2 DSARs approaching 30-day SLA deadline. Auto-extension letter templates available.",                                          confidence: 94, action: "Manage DSARs" },
  { id: "ai4", category: "Threat Intel",insight: "New CVE affecting Node.js runtime detected in CISA KEV catalogue. 4 of your services may be affected.",                       confidence: 89, action: "Assess Impact" },
];

export const notifications = [
  { id: "n1", title: "Critical Risk Escalated",      body: "RK-2041: Unpatched RCE flagged for board reporting.",            time: "5 min ago",   read: false, severity: "critical" },
  { id: "n2", title: "ISO 27001 Audit Completed",    body: "Surveillance audit passed with 94% score.",                      time: "18 min ago",  read: false, severity: "low" },
  { id: "n3", title: "Policy Approved",              body: "Access Control Policy v3.2 approved by CISO.",                   time: "1 hour ago",  read: true  },
  { id: "n4", title: "DSAR Approaching SLA",         body: "DS-0041 response due in 3 days. Action required.",               time: "2 hours ago", read: false, severity: "medium" },
  { id: "n5", title: "Evidence Collection Complete", body: "Evidence Engine collected 168 artifacts across 14 integrations.", time: "3 hours ago", read: true  },
];

export const navItems = [
  { id: "home",          path: "/",               icon: "🏠",  label: "Command Centre" },
  { id: "govops",        path: "/govops",          icon: "📋",  label: "GovOps" },
  { id: "riskops",       path: "/riskops",         icon: "⚠️",  label: "RiskOps" },
  { id: "complianceops", path: "/complianceops",   icon: "✅",  label: "ComplianceOps" },
  { id: "secops",        path: "/secops",          icon: "🛡️",  label: "SecOps" },
  { id: "cloudops",      path: "/cloudops",        icon: "☁️",  label: "CloudOps" },
  { id: "aisecops",      path: "/aisecops",        icon: "🤖",  label: "AISecOps" },
  { id: "privacyops",    path: "/privacyops",      icon: "🔒",  label: "PrivacyOps" },
  { id: "dataops",       path: "/dataops",         icon: "🗄️",  label: "DataOps" },
  { id: "assetops",      path: "/assetops",        icon: "💻",  label: "AssetOps" },
  { id: "serviceops",    path: "/serviceops",      icon: "🎫",  label: "ServiceOps" },
  { id: "peopleops",     path: "/peopleops",       icon: "👥",  label: "PeopleOps" },
  { id: "maturity",      path: "/maturity",         icon: "📈",  label: "Maturity Model" },
  { id: "analyticsops",  path: "/analyticsops",    icon: "📊",  label: "AnalyticsOps" },
  { id: "ai",            path: "/ai",              icon: "🤖",  label: "AI vCISO" },
  { id: "workflows",     path: "/workflows",       icon: "⚡",  label: "Workflows" },
  { id: "settings",      path: "/settings",        icon: "⚙️",  label: "Settings" },
];

export interface ComplianceControl {
  id: string;
  framework: string;
  domain: string;
  name: string;
  status: "implemented" | "partial" | "planned" | "not-started";
  owner: string;
  evidence: number;
  dueDate: string;
  crossReferences?: string[];
  description?: string;
  _dbId?: number;
}

export interface ActivityItem {
  id: string;
  module: string;
  action: string;
  item: string;
  user: string;
  time: string;
  severity?: string;
}

export interface NavModule {
  id: string;
  path: string;
  icon: string;
  label: string;
  badge?: number;
}

export const modules: NavModule[] = [
  { id: "home",          path: "/",              icon: "🏠",  label: "Home" },
  { id: "govops",        path: "/govops",         icon: "🏛️",  label: "GovOps" },
  { id: "riskops",       path: "/riskops",        icon: "⚠️",  label: "RiskOps" },
  { id: "complianceops", path: "/complianceops",  icon: "✅",  label: "ComplyOps" },
  { id: "serviceops",    path: "/serviceops",     icon: "🎫",  label: "ServiceOps" },
  { id: "secops",        path: "/secops",         icon: "🛡️",  label: "SecOps" },
  { id: "assetops",      path: "/assetops",       icon: "💻",  label: "AssetOps" },
  { id: "cloudops",      path: "/cloudops",       icon: "☁️",  label: "CloudOps" },
  { id: "aisecops",      path: "/aisecops",       icon: "🤖",  label: "AISecOps" },
  { id: "privacyops",    path: "/privacyops",     icon: "🔒",  label: "PrivacyOps" },
  { id: "dataops",       path: "/dataops",        icon: "🗄️",  label: "DataOps" },
  { id: "maturity",      path: "/maturity",        icon: "📈",  label: "Maturity" },
  { id: "analyticsops",  path: "/analyticsops",   icon: "📊",  label: "Analytics" },
  { id: "ai",            path: "/ai",             icon: "🤖",  label: "AI vCISO" },
  { id: "peopleops",     path: "/peopleops",      icon: "👥",  label: "PeopleOps" },
  { id: "workflows",     path: "/workflows",      icon: "🔄",  label: "Flows" },
  { id: "settings",      path: "/settings",       icon: "⚙️",  label: "Settings" },
];

export const adminModule: NavModule = {
  id: "admin", path: "/admin", icon: "🔑", label: "Admin",
};

export const deploymentModule: NavModule = {
  id: "deployment", path: "/deployment", icon: "🚀", label: "Deploy",
};

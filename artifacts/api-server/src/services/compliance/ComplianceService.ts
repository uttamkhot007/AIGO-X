export interface DomainMaturity {
  domain: string; score: number; label: string; previousScore: number;
  target: number; controlCount: number; implementedCount: number;
}
export interface FrameworkRegistryEntry {
  id: string; name: string; version: string; category: string;
  totalControls: number; pct: number; trend: "up" | "flat" | "down";
  color: string; scope: string; owner: string; nextReview: string;
  criticalGaps: string[];
}
export interface ControlMapping { controlId: string; controlName: string; frameworks: string[]; status: string; }

const MATURITY_LABELS = ["","Initial","Repeatable","Defined","Managed","Optimizing"];

const DOMAIN_MATURITY_SEED: Omit<DomainMaturity, "label">[] = [
  { domain:"Governance",           score:4, previousScore:3, target:5, controlCount:18, implementedCount:14 },
  { domain:"Risk Management",      score:3, previousScore:3, target:4, controlCount:24, implementedCount:16 },
  { domain:"Asset Management",     score:4, previousScore:3, target:5, controlCount:15, implementedCount:12 },
  { domain:"Access Control",       score:5, previousScore:4, target:5, controlCount:21, implementedCount:21 },
  { domain:"Cryptography",         score:4, previousScore:4, target:5, controlCount:10, implementedCount:9  },
  { domain:"Physical Security",    score:4, previousScore:3, target:4, controlCount:12, implementedCount:10 },
  { domain:"Operations Security",  score:3, previousScore:2, target:4, controlCount:22, implementedCount:14 },
  { domain:"Communication Sec",    score:3, previousScore:3, target:4, controlCount:9,  implementedCount:6  },
  { domain:"Supply Chain",         score:2, previousScore:2, target:4, controlCount:11, implementedCount:5  },
  { domain:"Incident Response",    score:4, previousScore:3, target:5, controlCount:14, implementedCount:11 },
  { domain:"Business Continuity",  score:3, previousScore:2, target:4, controlCount:8,  implementedCount:5  },
  { domain:"Compliance",           score:4, previousScore:3, target:5, controlCount:16, implementedCount:13 },
];

const FRAMEWORK_REGISTRY: FrameworkRegistryEntry[] = [
  { id:"iso27001", name:"ISO 27001:2022",     version:"2022", category:"Security",    totalControls:93,  pct:82, trend:"up",   color:"#1E3A5F", scope:"Full ISMS",             owner:"Priya Lee",     nextReview:"2024-10-14", criticalGaps:["A.12.6.1 Vulnerability Mgmt","A.13.1 Network Controls"] },
  { id:"soc2",     name:"SOC 2 Type II",      version:"2017", category:"Security",    totalControls:23,  pct:87, trend:"up",   color:"#065F46", scope:"Trust Services",        owner:"Marcus Johnson",nextReview:"2024-09-30", criticalGaps:["CC7.1 System Monitoring"] },
  { id:"gdpr",     name:"GDPR",               version:"2018", category:"Privacy",     totalControls:21,  pct:67, trend:"up",   color:"#4338CA", scope:"Data Processing",       owner:"Emma Wilson",   nextReview:"2024-07-15", criticalGaps:["Art.32 Security of Processing","Art.35 DPIA"] },
  { id:"hipaa",    name:"HIPAA",              version:"2013", category:"Healthcare",  totalControls:18,  pct:89, trend:"flat", color:"#92400E", scope:"ePHI Systems",          owner:"Ryan Johnson",  nextReview:"2024-07-01", criticalGaps:["164.312(b) Audit Controls"] },
  { id:"nis2",     name:"NIS2 Directive",     version:"2022", category:"Regulatory",  totalControls:11,  pct:73, trend:"up",   color:"#0C4A6E", scope:"Essential Services",    owner:"Maria Santos",  nextReview:"2024-08-20", criticalGaps:["Art.21 Risk Measures","Art.23 Incident Reporting","Art.24 ICT Standards"] },
  { id:"pcidss",   name:"PCI DSS v4.0",       version:"4.0",  category:"Payment",     totalControls:18,  pct:83, trend:"up",   color:"#B45309", scope:"Cardholder Data",       owner:"Alex Kim",      nextReview:"2024-09-15", criticalGaps:["Req 6.3 Security Vulnerabilities","Req 10.2 Audit Logs"] },
  { id:"nistcsf",  name:"NIST CSF v2.0",      version:"2.0",  category:"Security",    totalControls:13,  pct:54, trend:"up",   color:"#1D4ED8", scope:"Critical Infrastructure",owner:"Priya Lee",     nextReview:"2024-11-01", criticalGaps:["DE.AE Anomaly Detection","RS.MI Incident Mitigation"] },
  { id:"cis18",    name:"CIS Controls v18",   version:"18",   category:"Security",    totalControls:18,  pct:72, trend:"flat", color:"#065F46", scope:"Enterprise IT",         owner:"Marcus Johnson",nextReview:"2024-10-01", criticalGaps:["CIS 12 Network Infrastructure Mgmt"] },
  { id:"iso22301", name:"ISO 22301:2019",     version:"2019", category:"BCP",         totalControls:18,  pct:61, trend:"up",   color:"#7C3AED", scope:"BCM Programme",         owner:"Alex Kim",      nextReview:"2024-12-01", criticalGaps:["8.4.2 BIA","8.4.3 Business Continuity Plans"] },
  { id:"dora",     name:"DORA",               version:"2022", category:"Regulatory",  totalControls:18,  pct:44, trend:"up",   color:"#9D174D", scope:"Financial ICT Risk",    owner:"Emma Wilson",   nextReview:"2025-01-17", criticalGaps:["Art.5 ICT Risk Framework","Art.11 ICT BC Policy","Art.17 ICT Incident Response"] },
  { id:"sama",     name:"SAMA CSF",           version:"2017", category:"Financial",   totalControls:19,  pct:47, trend:"flat", color:"#065F46", scope:"Banking & Insurance",   owner:"Maria Santos",  nextReview:"2025-01-01", criticalGaps:["3.3 Compliance","4.2 HR","4.3 Operations"] },
  { id:"swift",    name:"SWIFT CSCF",         version:"2024", category:"Financial",   totalControls:23,  pct:91, trend:"up",   color:"#1E3A5F", scope:"SWIFT Messaging",       owner:"Ryan Johnson",  nextReview:"2025-01-01", criticalGaps:[] },
  { id:"cmmc",     name:"CMMC 2.0 Level 2",   version:"2.0",  category:"Defense",     totalControls:21,  pct:43, trend:"up",   color:"#7C3AED", scope:"Defense Contracts",     owner:"Alex Kim",      nextReview:"2025-06-01", criticalGaps:["SI Security Integrity","IR Incident Response","MA Maintenance"] },
  { id:"euaiact",  name:"EU AI Act",          version:"2024", category:"AI",          totalControls:19,  pct:26, trend:"up",   color:"#4338CA", scope:"High-Risk AI Systems",  owner:"Emma Wilson",   nextReview:"2025-08-02", criticalGaps:["Art.9 Risk Management","Art.10 Data Governance","Art.17 Quality Management"] },
  { id:"iso42001", name:"ISO 42001:2023",     version:"2023", category:"AI",          totalControls:16,  pct:19, trend:"up",   color:"#0891B2", scope:"AI Management System",  owner:"Priya Lee",     nextReview:"2025-01-01", criticalGaps:["Annex A AI Risk","Annex B AI Impact"] },
  { id:"fedramp",  name:"FedRAMP Moderate",   version:"2024", category:"Government",  totalControls:25,  pct:60, trend:"flat", color:"#DC2626", scope:"Federal Cloud Systems", owner:"Marcus Johnson",nextReview:"2025-03-01", criticalGaps:["AC-2 Account Mgmt","SI-2 Flaw Remediation","IR-4 Incident Handling"] },
  { id:"iso31000", name:"ISO 31000:2018",     version:"2018", category:"Risk",        totalControls:22,  pct:68, trend:"up",   color:"#065F46", scope:"Enterprise Risk",       owner:"Maria Santos",  nextReview:"2024-12-01", criticalGaps:["6.5 Monitoring","6.7 Communication"] },
  { id:"csa",      name:"CSA CCM v4.0",       version:"4.0",  category:"Cloud",       totalControls:22,  pct:64, trend:"up",   color:"#0C4A6E", scope:"Cloud Infrastructure",  owner:"Alex Kim",      nextReview:"2024-11-15", criticalGaps:["IVS-06 Network Security","IAM-01 Identity","LOG-08 Audit Logging"] },
  { id:"ccpa",     name:"CCPA / CPRA",        version:"2023", category:"Privacy",     totalControls:20,  pct:75, trend:"flat", color:"#7C3AED", scope:"California Consumers",  owner:"Emma Wilson",   nextReview:"2025-01-01", criticalGaps:["Right to Opt-Out of Sale","Sensitive PI Processing"] },
  { id:"iso27701", name:"ISO 27701:2019",     version:"2019", category:"Privacy",     totalControls:20,  pct:60, trend:"up",   color:"#9D174D", scope:"Privacy Info Mgmt",     owner:"Priya Lee",     nextReview:"2024-09-01", criticalGaps:["7.2.1 PIMS-specific Controls","7.4.8 PII Disclosure"] },
];

const CONTROL_MAPPINGS: ControlMapping[] = [
  { controlId:"A.9.4.2",    controlName:"Secure log-on procedures",            frameworks:["ISO 27001","CIS 18","NIST SP 800-53"],          status:"implemented" },
  { controlId:"A.12.6.1",   controlName:"Management of technical vulnerabilities",frameworks:["ISO 27001","PCI DSS","NIST SP 800-53"],      status:"partial" },
  { controlId:"CC6.1",      controlName:"Logical and physical access controls", frameworks:["SOC 2","ISO 27001","NIST"],                    status:"implemented" },
  { controlId:"CC7.2",      controlName:"Monitors system components for anomalies",frameworks:["SOC 2","ISO 27001"],                        status:"implemented" },
  { controlId:"ART-30",     controlName:"Records of processing activities",     frameworks:["GDPR","ISO 27701"],                            status:"implemented" },
  { controlId:"ART-32",     controlName:"Security of processing",               frameworks:["GDPR","ISO 27001","ISO 27701"],                status:"partial" },
  { controlId:"164.312.a",  controlName:"Access control standard",              frameworks:["HIPAA","ISO 27001","NIST SP 800-53"],          status:"implemented" },
  { controlId:"164.312.b",  controlName:"Audit controls",                       frameworks:["HIPAA","SOC 2","ISO 27001"],                   status:"planned" },
  { controlId:"NIS2-ART21", controlName:"Cybersecurity risk measures",          frameworks:["NIS2","ISO 27001","DORA"],                     status:"partial" },
  { controlId:"NIS2-ART23", controlName:"Incident notification obligations",    frameworks:["NIS2","GDPR","DORA"],                          status:"not-started" },
  { controlId:"PCI-REQ6.5", controlName:"Addressing common vulnerabilities",    frameworks:["PCI DSS","ISO 27001","OWASP"],                 status:"implemented" },
  { controlId:"CC8.1",      controlName:"Change management controls",           frameworks:["SOC 2","ISO 27001","CIS 18"],                  status:"implemented" },
  { controlId:"A1.3",       controlName:"Backup and recovery procedures",       frameworks:["SOC 2","ISO 27001","ISO 22301"],               status:"partial" },
  { controlId:"DORA-ART5",  controlName:"ICT risk management framework",        frameworks:["DORA","ISO 27001","ISO 22301"],                status:"partial" },
  { controlId:"DORA-ART11", controlName:"Business continuity policy",           frameworks:["DORA","ISO 22301","ISO 27001"],                status:"not-started" },
];

// Per-tenant maturity store
const maturityStore = new Map<string, DomainMaturity[]>();

function tenantMaturity(tenantId: string): DomainMaturity[] {
  if (!maturityStore.has(tenantId)) {
    maturityStore.set(tenantId, tenantId === "1" ? DOMAIN_MATURITY_SEED.map(d => ({ ...d, label: MATURITY_LABELS[d.score]! })) : []);
  }
  return maturityStore.get(tenantId)!;
}

export class ComplianceService {
  getDomainMaturity(tenantId: string): DomainMaturity[] { return tenantMaturity(tenantId); }

  updateDomainMaturity(tenantId: string, domain: string, score: number): DomainMaturity | null {
    const d = tenantMaturity(tenantId).find(x => x.domain === domain);
    if (!d) return null;
    d.previousScore = d.score;
    d.score = Math.max(1, Math.min(5, score));
    d.label = MATURITY_LABELS[d.score]!;
    return d;
  }

  getOverallMaturity(tenantId: string): number {
    const domains = tenantMaturity(tenantId);
    return Math.round((domains.reduce((s, d) => s + d.score, 0) / domains.length) * 10) / 10;
  }

  getFrameworkRegistry(): FrameworkRegistryEntry[] { return FRAMEWORK_REGISTRY; }
  getFramework(id: string): FrameworkRegistryEntry | undefined { return FRAMEWORK_REGISTRY.find(f => f.id === id); }

  getControlMappings(framework?: string): ControlMapping[] {
    if (!framework) return CONTROL_MAPPINGS;
    return CONTROL_MAPPINGS.filter(c => c.frameworks.some(f => f.toLowerCase().includes(framework.toLowerCase())));
  }

  getFrameworkGaps() {
    return FRAMEWORK_REGISTRY.map(fw => ({
      framework: fw.name,
      total:       fw.totalControls,
      implemented: Math.round(fw.totalControls * fw.pct / 100),
      partial:     Math.round(fw.totalControls * (100 - fw.pct) / 200),
      notStarted:  Math.round(fw.totalControls * (100 - fw.pct) / 100) - Math.round(fw.totalControls * (100 - fw.pct) / 200),
      pct:         fw.pct,
      criticalGaps:fw.criticalGaps,
    }));
  }

  getMaturityTrend(): { label: string; score: number }[] {
    return [
      { label:"Q1 2023", score:2.1 }, { label:"Q2 2023", score:2.4 },
      { label:"Q3 2023", score:2.7 }, { label:"Q4 2023", score:2.9 },
      { label:"Q1 2024", score:3.1 }, { label:"Q2 2024", score:3.4 },
    ];
  }
}

export const complianceService = new ComplianceService();

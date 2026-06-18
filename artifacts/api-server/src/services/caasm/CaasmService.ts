import { randomUUID } from "crypto";

export type AssetCategory = "Server"|"Workstation"|"IoT"|"Mobile"|"Network"|"OT"|"Cloud"|"Container"|"Unknown"|"SaaS";
export type AssetConfidence = "High"|"Medium"|"Low";
export type AssetRisk = "Critical"|"High"|"Medium"|"Low";
export type AssetEnv = "Production"|"Corporate"|"Development"|"DR";
export type AssetSensitivity = "Restricted"|"Confidential"|"Internal"|"Public";
export type RelType = "network"|"app-dependency"|"identity"|"management"|"data-flow";

export interface AssetSource {
  name: string; lastSeen: string; confidence: AssetConfidence; data: Record<string, string>;
}
export interface AssetTimeline {
  ts: string; field: string; from: string; to: string; source: string;
}
export interface Asset {
  id: string; hostname: string; category: AssetCategory; confidence: AssetConfidence;
  os: string; ip: string; mac?: string; manufacturer: string;
  risk: AssetRisk; managed: boolean; dept: string;
  sources: AssetSource[]; tags: string[];
  antivirus: string; agentVersion: string; lastSeen: string;
  exposureScore: number;
  vulnCount: number; critVulns: number;
  location?: string; serialNumber?: string;
  // Enriched fields (shared with Settings)
  environment: AssetEnv;
  dataSensitivity: AssetSensitivity;
  timeline: AssetTimeline[];
  createdAt: string; updatedAt: string;
}
export interface AssetRelationship {
  id: string; source: string; target: string;
  type: RelType; label: string; strength: number;
  discoveredBy: string; createdAt: string;
}
export interface FilterCondition {
  field: string; op: "eq"|"neq"|"contains"|"gt"|"lt"|"in"; value: string | string[];
}
export interface FilterQuery { logic: "AND"|"OR"; conditions: FilterCondition[]; }

// ── Source list ────────────────────────────────────────────────────────────────
const SRC_LIST = [
  { name:"Microsoft Defender",   color:"#1D4ED8", icon:"⬡" },
  { name:"Active Directory",     color:"#7C3AED", icon:"◈" },
  { name:"Intune",               color:"#0891B2", icon:"◎" },
  { name:"CrowdStrike Falcon",   color:"#D97706", icon:"◆" },
  { name:"SentinelOne Ranger",   color:"#065F46", icon:"◉" },
  { name:"SCCM",                 color:"#6B7280", icon:"⚙" },
  { name:"Tenable.sc",           color:"#DC2626", icon:"◑" },
  { name:"Qualys VMDR",          color:"#065F46", icon:"◐" },
  { name:"Azure Resource Graph", color:"#1E3A5F", icon:"☁" },
  { name:"AWS Systems Manager",  color:"#D97706", icon:"⚡" },
  { name:"ServiceNow CMDB",      color:"#4338CA", icon:"◈" },
  { name:"Jamf",                 color:"#0891B2", icon:"◉" },
  { name:"VMware vCenter",       color:"#3B82F6", icon:"▣" },
];

function randomSources(count: number, now: string): AssetSource[] {
  const shuffled = [...SRC_LIST].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map(s => ({
    name: s.name, lastSeen: now,
    confidence: (Math.random() > 0.4 ? "High" : Math.random() > 0.5 ? "Medium" : "Low") as AssetConfidence,
    data: { "IP": "Dynamic", "Hostname": "synced", "OS": "synced" },
  }));
}

function buildTimeline(now: string): AssetTimeline[] {
  const days = (d: number) => {
    const dt = new Date(now); dt.setDate(dt.getDate() - d);
    return dt.toISOString().slice(0, 10);
  };
  return [
    { ts: days(1),  field: "agentVersion", from: "10.7.0",            to: "10.8.0",            source: "Microsoft Defender" },
    { ts: days(5),  field: "ip",           from: "192.168.0.99",       to: "192.168.0.100",     source: "Active Directory"   },
    { ts: days(12), field: "os",           from: "Windows 10 21H2",    to: "Windows 11 23H2",   source: "Intune"             },
    { ts: days(30), field: "risk",         from: "Low",                to: "Medium",             source: "Tenable.sc"         },
  ];
}

// ── Canonical asset seed — single source of truth shared with all modules ─────
// IDs match grc-data.ts allAssets so Settings + CAASM show the same inventory.
type SeedAsset = Omit<Asset,"sources"|"timeline"|"createdAt"|"updatedAt">;

const SEED_ASSETS: SeedAsset[] = [
  { id:"AST-001", hostname:"api-gateway-prod-01",        category:"Server",      confidence:"High",   os:"Ubuntu 22.04 LTS",         ip:"10.0.1.10",        manufacturer:"AWS EC2",         risk:"Critical", managed:true,  dept:"Engineering",   antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"Active",      exposureScore:82, vulnCount:3, critVulns:1, tags:["production","api","gateway"],             environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-002", hostname:"db-postgres-prod-01",        category:"Server",      confidence:"High",   os:"PostgreSQL 15 / AWS RDS",   ip:"10.0.2.5",         manufacturer:"AWS RDS",         risk:"Critical", managed:true,  dept:"Engineering",   antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"Active",      exposureScore:88, vulnCount:5, critVulns:2, tags:["production","database","pii"],            environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-003", hostname:"k8s-cluster-prod",           category:"Container",   confidence:"High",   os:"EKS / Kubernetes 1.29",     ip:"10.0.3.0/24",      manufacturer:"AWS EKS",         risk:"Critical", managed:true,  dept:"Engineering",   antivirus:"Falco",          agentVersion:"1.29.4",             lastSeen:"Active",      exposureScore:75, vulnCount:8, critVulns:3, tags:["production","kubernetes","containers"],   environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-004", hostname:"ad-domain-controller-01",    category:"Server",      confidence:"High",   os:"Windows Server 2022",       ip:"192.168.1.10",     manufacturer:"Dell",            risk:"Critical", managed:true,  dept:"IT Ops",        antivirus:"MS Defender",    agentVersion:"10.8040.18362.215",  lastSeen:"Active",      exposureScore:85, vulnCount:4, critVulns:2, tags:["corporate","AD","identity","critical"],   environment:"Corporate",  dataSensitivity:"Restricted" },
  { id:"AST-005", hostname:"firewall-perimeter-01",      category:"Network",     confidence:"High",   os:"Palo Alto PAN-OS 11.1.2",   ip:"192.168.0.1",      manufacturer:"Palo Alto",       risk:"Critical", managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"11.1.2",             lastSeen:"Active",      exposureScore:70, vulnCount:2, critVulns:0, tags:["network","firewall","perimeter"],         environment:"Production", dataSensitivity:"Confidential" },
  { id:"AST-006", hostname:"eks-node-group-web",         category:"Cloud",       confidence:"High",   os:"Amazon Linux 2023",         ip:"10.0.3.10",        manufacturer:"AWS EC2",         risk:"High",     managed:true,  dept:"Engineering",   antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"Active",      exposureScore:65, vulnCount:3, critVulns:1, tags:["production","eks","web"],                 environment:"Production", dataSensitivity:"Confidential" },
  { id:"AST-007", hostname:"s3-data-lake-prod",          category:"Cloud",       confidence:"High",   os:"AWS S3",                    ip:"—",                manufacturer:"AWS S3",          risk:"Critical", managed:true,  dept:"Data",          antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:90, vulnCount:6, critVulns:3, tags:["production","s3","data-lake","pii"],      environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-008", hostname:"gitlab-runner-prod",         category:"Server",      confidence:"High",   os:"Ubuntu 22.04 / Docker",     ip:"10.0.5.20",        manufacturer:"AWS EC2",         risk:"High",     managed:true,  dept:"Engineering",   antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"Active",      exposureScore:68, vulnCount:4, critVulns:1, tags:["production","cicd","devops"],             environment:"Production", dataSensitivity:"Confidential" },
  { id:"AST-009", hostname:"okta-sso",                   category:"SaaS",        confidence:"High",   os:"Okta Cloud",                ip:"—",                manufacturer:"Okta",            risk:"Critical", managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"2024.03",            lastSeen:"Active",      exposureScore:80, vulnCount:2, critVulns:1, tags:["saas","sso","identity","okta"],           environment:"Corporate",  dataSensitivity:"Restricted" },
  { id:"AST-010", hostname:"salesforce-crm",             category:"SaaS",        confidence:"High",   os:"Salesforce Spring '24",     ip:"—",                manufacturer:"Salesforce",      risk:"High",     managed:true,  dept:"Sales",         antivirus:"N/A",            agentVersion:"Spring '24",         lastSeen:"Active",      exposureScore:55, vulnCount:1, critVulns:0, tags:["saas","crm","salesforce"],                environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-011", hostname:"slack-corporate",            category:"SaaS",        confidence:"High",   os:"Slack Cloud",               ip:"—",                manufacturer:"Slack",           risk:"Medium",   managed:true,  dept:"HR",            antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:45, vulnCount:0, critVulns:0, tags:["saas","collaboration","slack"],           environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-012", hostname:"jira-software",              category:"SaaS",        confidence:"High",   os:"Jira Cloud",                ip:"—",                manufacturer:"Atlassian",       risk:"Medium",   managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:42, vulnCount:0, critVulns:0, tags:["saas","jira","atlassian"],                environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-013", hostname:"vault-secrets-prod",         category:"Server",      confidence:"High",   os:"HashiCorp Vault 1.15.5",    ip:"10.0.1.50",        manufacturer:"HashiCorp",       risk:"Critical", managed:true,  dept:"IT Ops",        antivirus:"CrowdStrike",    agentVersion:"1.15.5",             lastSeen:"Active",      exposureScore:75, vulnCount:1, critVulns:0, tags:["production","vault","secrets","pam"],     environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-014", hostname:"siem-splunk-cloud",          category:"SaaS",        confidence:"High",   os:"Splunk Cloud 9.2",          ip:"—",                manufacturer:"Splunk",          risk:"Critical", managed:true,  dept:"Security",      antivirus:"N/A",            agentVersion:"9.2",                lastSeen:"Active",      exposureScore:60, vulnCount:0, critVulns:0, tags:["security","siem","splunk","monitoring"],  environment:"Corporate",  dataSensitivity:"Restricted" },
  { id:"AST-015", hostname:"endpoint-edr-crowdstrike",   category:"SaaS",        confidence:"High",   os:"CrowdStrike Falcon 7.14",   ip:"—",                manufacturer:"CrowdStrike",     risk:"High",     managed:true,  dept:"Security",      antivirus:"N/A",            agentVersion:"7.14",               lastSeen:"Active",      exposureScore:55, vulnCount:0, critVulns:0, tags:["security","edr","crowdstrike","endpoint"], environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-016", hostname:"laptop-dev-fleet",           category:"Workstation", confidence:"Medium", os:"macOS 14.5 / Windows 11",   ip:"DHCP",             manufacturer:"Apple/Lenovo",    risk:"Medium",   managed:true,  dept:"IT Ops",        antivirus:"MS Defender",    agentVersion:"Jamf/Intune",        lastSeen:"1 day ago",   exposureScore:45, vulnCount:7, critVulns:0, tags:["hardware","endpoint","laptop","fleet"],   environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-017", hostname:"backup-veeam-prod",          category:"Server",      confidence:"High",   os:"Veeam Backup 12.1",         ip:"192.168.10.5",     manufacturer:"Dell",            risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"MS Defender",    agentVersion:"12.1",               lastSeen:"Active",      exposureScore:65, vulnCount:2, critVulns:0, tags:["backup","dr","veeam"],                    environment:"DR",         dataSensitivity:"Restricted" },
  { id:"AST-018", hostname:"cdn-cloudflare",             category:"Cloud",       confidence:"High",   os:"Cloudflare Edge",           ip:"—",                manufacturer:"Cloudflare",      risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:50, vulnCount:1, critVulns:0, tags:["production","cdn","waf","cloudflare"],    environment:"Production", dataSensitivity:"Public" },
  { id:"AST-019", hostname:"redis-cache-prod",           category:"Server",      confidence:"High",   os:"AWS ElastiCache / Redis 7.2",ip:"10.0.2.20",        manufacturer:"AWS",             risk:"High",     managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"7.2",                lastSeen:"Active",      exposureScore:60, vulnCount:2, critVulns:0, tags:["production","cache","redis"],             environment:"Production", dataSensitivity:"Confidential" },
  { id:"AST-020", hostname:"vpn-openvpn-prod",           category:"Network",     confidence:"High",   os:"OpenVPN Access Server 2.13", ip:"192.168.0.20",    manufacturer:"OpenVPN",         risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"2.13.1",             lastSeen:"Active",      exposureScore:62, vulnCount:1, critVulns:0, tags:["network","vpn","remote-access"],          environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-021", hostname:"monitoring-datadog",         category:"SaaS",        confidence:"High",   os:"Datadog Cloud",             ip:"—",                manufacturer:"Datadog",         risk:"Medium",   managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:40, vulnCount:0, critVulns:0, tags:["monitoring","observability","datadog"],   environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-022", hostname:"mail-microsoft365",          category:"SaaS",        confidence:"High",   os:"Microsoft Exchange Online", ip:"—",                manufacturer:"Microsoft",       risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"MS Defender",    agentVersion:"—",                  lastSeen:"Active",      exposureScore:58, vulnCount:3, critVulns:1, tags:["email","m365","microsoft"],               environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-023", hostname:"dns-route53",                category:"Cloud",       confidence:"High",   os:"AWS Route 53",              ip:"—",                manufacturer:"AWS",             risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:48, vulnCount:0, critVulns:0, tags:["production","dns","route53"],             environment:"Production", dataSensitivity:"Internal" },
  { id:"AST-024", hostname:"nas-storage-prod",           category:"Server",      confidence:"Medium", os:"Synology DSM 7.2",          ip:"192.168.5.10",     manufacturer:"Synology",        risk:"Medium",   managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"DSM 7.2",            lastSeen:"2 days ago",  exposureScore:62, vulnCount:2, critVulns:0, tags:["hardware","storage","nas"],               environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-025", hostname:"github-enterprise",          category:"SaaS",        confidence:"High",   os:"GitHub Enterprise Cloud",   ip:"—",                manufacturer:"GitHub",          risk:"High",     managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:55, vulnCount:4, critVulns:1, tags:["code","repository","github","devops"],    environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-026", hostname:"erp-sap",                    category:"SaaS",        confidence:"High",   os:"SAP S/4HANA 2023.3",        ip:"—",                manufacturer:"SAP",             risk:"Critical", managed:true,  dept:"Finance",       antivirus:"N/A",            agentVersion:"2023.3",             lastSeen:"Active",      exposureScore:70, vulnCount:2, critVulns:1, tags:["erp","sap","finance"],                    environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-027", hostname:"container-registry-ecr",     category:"Cloud",       confidence:"High",   os:"AWS ECR",                   ip:"—",                manufacturer:"AWS",             risk:"High",     managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:58, vulnCount:3, critVulns:2, tags:["production","container","ecr","registry"],environment:"Production", dataSensitivity:"Confidential" },
  { id:"AST-028", hostname:"waf-aws",                    category:"Cloud",       confidence:"High",   os:"AWS WAF",                   ip:"—",                manufacturer:"AWS",             risk:"High",     managed:true,  dept:"Security",      antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:52, vulnCount:2, critVulns:0, tags:["production","waf","aws","appsec"],        environment:"Production", dataSensitivity:"Public" },
  { id:"AST-029", hostname:"iot-building-sensors",       category:"IoT",         confidence:"Medium", os:"Various / Proprietary",     ip:"192.168.100.0/24", manufacturer:"Various",         risk:"Medium",   managed:false, dept:"Facilities",    antivirus:"None",           agentVersion:"—",                  lastSeen:"3 hrs ago",   exposureScore:65, vulnCount:5, critVulns:2, tags:["hardware","iot","physical","unmanaged"],  environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-030", hostname:"data-warehouse-snowflake",   category:"Cloud",       confidence:"High",   os:"Snowflake",                 ip:"—",                manufacturer:"Snowflake",       risk:"High",     managed:true,  dept:"Data",          antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:72, vulnCount:3, critVulns:1, tags:["production","data-warehouse","snowflake"],environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-031", hostname:"terraform-cloud",            category:"SaaS",        confidence:"High",   os:"Terraform Cloud",           ip:"—",                manufacturer:"HashiCorp",       risk:"High",     managed:true,  dept:"Engineering",   antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:55, vulnCount:2, critVulns:0, tags:["devops","iac","terraform"],               environment:"Corporate",  dataSensitivity:"Confidential" },
  { id:"AST-032", hostname:"pagerduty-oncall",           category:"SaaS",        confidence:"High",   os:"PagerDuty Cloud",           ip:"—",                manufacturer:"PagerDuty",       risk:"Medium",   managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:35, vulnCount:0, critVulns:0, tags:["incident","oncall","pagerduty"],          environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-033", hostname:"proxy-zscaler",              category:"Network",     confidence:"High",   os:"Zscaler ZIA",               ip:"—",                manufacturer:"Zscaler",         risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:48, vulnCount:1, critVulns:0, tags:["network","proxy","zscaler","ztna"],       environment:"Corporate",  dataSensitivity:"Internal" },
  { id:"AST-034", hostname:"pentest-kali-lab",           category:"Server",      confidence:"High",   os:"Kali Linux 2024.2",         ip:"192.168.200.10",   manufacturer:"VMware",          risk:"Low",      managed:true,  dept:"Security",      antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"1 week ago",  exposureScore:28, vulnCount:0, critVulns:0, tags:["security","pentesting","lab"],            environment:"Development",dataSensitivity:"Internal" },
  { id:"AST-035", hostname:"siem-log-shipper",           category:"Server",      confidence:"High",   os:"Fluentd / Ubuntu 22.04",    ip:"10.0.6.10",        manufacturer:"AWS EC2",         risk:"Medium",   managed:true,  dept:"Security",      antivirus:"CrowdStrike",    agentVersion:"7.14.16202.0",       lastSeen:"Active",      exposureScore:45, vulnCount:1, critVulns:0, tags:["logging","siem","fluentd"],               environment:"Production", dataSensitivity:"Internal" },
  { id:"AST-036", hostname:"smtp-sendgrid",              category:"SaaS",        confidence:"High",   os:"SendGrid Cloud",            ip:"—",                manufacturer:"SendGrid",        risk:"Low",      managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:32, vulnCount:0, critVulns:0, tags:["email","sendgrid","transactional"],        environment:"Production", dataSensitivity:"Public" },
  { id:"AST-037", hostname:"privileged-cyberark",        category:"Server",      confidence:"High",   os:"CyberArk PAS 13.2",         ip:"192.168.1.20",     manufacturer:"CyberArk",        risk:"Critical", managed:true,  dept:"IT Ops",        antivirus:"MS Defender",    agentVersion:"13.2",               lastSeen:"Active",      exposureScore:68, vulnCount:1, critVulns:0, tags:["pam","cyberark","privileged"],            environment:"Production", dataSensitivity:"Restricted" },
  { id:"AST-038", hostname:"ddos-imperva",               category:"SaaS",        confidence:"High",   os:"Imperva Cloud WAF",         ip:"—",                manufacturer:"Imperva",         risk:"High",     managed:true,  dept:"IT Ops",        antivirus:"N/A",            agentVersion:"—",                  lastSeen:"Active",      exposureScore:45, vulnCount:0, critVulns:0, tags:["ddos","imperva","waf"],                   environment:"Production", dataSensitivity:"Public" },
  { id:"AST-039", hostname:"monitoring-alertmanager",    category:"Server",      confidence:"High",   os:"Prometheus Alertmanager 0.27",ip:"10.0.6.30",       manufacturer:"AWS EC2",         risk:"Medium",   managed:true,  dept:"Engineering",   antivirus:"CrowdStrike",    agentVersion:"0.27.0",             lastSeen:"Active",      exposureScore:38, vulnCount:0, critVulns:0, tags:["monitoring","prometheus","alerting"],     environment:"Production", dataSensitivity:"Internal" },
  { id:"AST-040", hostname:"grc-platform-prod",          category:"SaaS",        confidence:"High",   os:"AIGO-X GRC 2.4.1",          ip:"—",                manufacturer:"AIGO-X",          risk:"Critical", managed:true,  dept:"Compliance",    antivirus:"CrowdStrike",    agentVersion:"2.4.1",              lastSeen:"Active",      exposureScore:55, vulnCount:0, critVulns:0, tags:["grc","compliance","platform"],            environment:"Production", dataSensitivity:"Restricted" },
];

const SEED_RELATIONSHIPS: Omit<AssetRelationship,"id"|"createdAt">[] = [
  { source:"AST-004", target:"AST-001", type:"management",    label:"WinRM Mgmt",    strength:0.88, discoveredBy:"SCCM"                },
  { source:"AST-001", target:"AST-002", type:"app-dependency",label:"DB Connection", strength:0.99, discoveredBy:"Tenable.sc"          },
  { source:"AST-005", target:"AST-001", type:"network",       label:"FW→API",        strength:0.92, discoveredBy:"ServiceNow CMDB"     },
  { source:"AST-005", target:"AST-002", type:"network",       label:"FW→DB",         strength:0.92, discoveredBy:"ServiceNow CMDB"     },
  { source:"AST-020", target:"AST-005", type:"network",       label:"VPN Tunnel",    strength:0.95, discoveredBy:"SCCM"                },
  { source:"AST-004", target:"AST-009", type:"identity",      label:"AD→Okta SCIM",  strength:0.95, discoveredBy:"Active Directory"    },
  { source:"AST-003", target:"AST-001", type:"app-dependency",label:"K8s→API",       strength:0.98, discoveredBy:"VMware vCenter"      },
  { source:"AST-003", target:"AST-002", type:"data-flow",     label:"K8s→DB",        strength:0.90, discoveredBy:"ServiceNow CMDB"     },
  { source:"AST-030", target:"AST-002", type:"data-flow",     label:"Analytics ETL", strength:0.82, discoveredBy:"AWS Systems Manager" },
  { source:"AST-013", target:"AST-004", type:"management",    label:"PAM→DC",        strength:0.88, discoveredBy:"CrowdStrike Falcon"  },
  { source:"AST-009", target:"AST-001", type:"identity",      label:"SSO→API",       strength:0.85, discoveredBy:"Active Directory"    },
  { source:"AST-005", target:"AST-003", type:"network",       label:"FW→K8s",        strength:0.90, discoveredBy:"ServiceNow CMDB"     },
  { source:"AST-029", target:"AST-004", type:"network",       label:"IoT→DC",        strength:0.40, discoveredBy:"SentinelOne Ranger"  },
  { source:"AST-027", target:"AST-003", type:"data-flow",     label:"Registry→K8s",  strength:0.95, discoveredBy:"AWS Systems Manager" },
];

// ── Deterministic 12,529-asset generator ─────────────────────────────────────
function seedRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return (): number => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}
function pa<T>(arr: readonly T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]; }
function genSrc(g: number, cnt: number, now: string): AssetSource[] {
  const rng = seedRng(g * 31337);
  return [...SRC_LIST].sort(() => rng() - 0.5).slice(0, Math.min(cnt, SRC_LIST.length)).map(s => ({
    name: s.name, lastSeen: now,
    confidence: (rng() > 0.4 ? "High" : rng() > 0.5 ? "Medium" : "Low") as AssetConfidence,
    data: { IP: "Dynamic", Hostname: "synced", OS: "synced" },
  }));
}
function lsStr(rng: () => number): string {
  const v = rng();
  return v < 0.3 ? "Active" : v < 0.45 ? `${1 + Math.floor(rng() * 2)} hr ago` : v < 0.65 ? `${2 + Math.floor(rng() * 22)} hrs ago` : v < 0.82 ? `${1 + Math.floor(rng() * 7)} days ago` : `${8 + Math.floor(rng() * 30)} days ago`;
}
function rskFor(rng: () => number, w: [number, number, number, number]): AssetRisk {
  const v = rng() * 100;
  return v < w[0] ? "Critical" : v < w[0] + w[1] ? "High" : v < w[0] + w[1] + w[2] ? "Medium" : "Low";
}
function expFor(r: AssetRisk, rng: () => number): number {
  const b: Record<AssetRisk, [number, number]> = { Critical: [70, 95], High: [45, 72], Medium: [20, 50], Low: [5, 22] };
  const [lo, hi] = b[r]; return lo + Math.floor(rng() * (hi - lo + 1));
}
function vulFor(r: AssetRisk, rng: () => number): [number, number] {
  return r === "Critical" ? [3 + Math.floor(rng() * 12), 1 + Math.floor(rng() * 4)]
    : r === "High" ? [1 + Math.floor(rng() * 8), Math.floor(rng() * 2)]
    : r === "Medium" ? [Math.floor(rng() * 4), 0] : [0, 0];
}
const GD = ["Engineering","IT Ops","Finance","HR","Sales","Marketing","Operations","Security","Data","Compliance","Facilities"] as const;

function buildFullAssetList(now: string): Asset[] {
  const result: Asset[] = SEED_ASSETS.map(a => ({
    ...a,
    sources:  randomSources(Math.min(a.category === "Server" ? 6 : a.category === "Unknown" ? 2 : 3, SRC_LIST.length), now),
    timeline: buildTimeline(now), createdAt: now, updatedAt: now,
  }));

  let g = 41;

  const gen = (
    cat: AssetCategory, count: number,
    hn:    (i: number, rng: () => number) => string,
    osF:   (rng: () => number) => string,
    ipF:   (rng: () => number) => string,
    mfgF:  (rng: () => number) => string,
    avF:   (os: string, rng: () => number) => string,
    deptF: (rng: () => number) => string,
    agentF:(rng: () => number) => string,
    rw: [number, number, number, number],
    mr: number,
    envF:  (rng: () => number) => AssetEnv,
    sensF: (rng: () => number) => AssetSensitivity,
    cr: number, sc: number,
  ) => {
    for (let i = 1; i <= count; i++, g++) {
      const rng  = seedRng(g * 17239 + cat.length);
      const osV  = osF(rng);
      const risk = rskFor(rng, rw);
      const [vulnCount, critVulns] = vulFor(risk, rng);
      result.push({
        id: `GEN-${String(g).padStart(5, "0")}`,
        hostname: hn(i, rng), category: cat,
        confidence: (rng() < cr ? "High" : rng() < 0.7 ? "Medium" : "Low") as AssetConfidence,
        os: osV, ip: ipF(rng), manufacturer: mfgF(rng), risk,
        managed: rng() < mr, dept: deptF(rng),
        antivirus: avF(osV, rng), agentVersion: agentF(rng),
        lastSeen: lsStr(rng), exposureScore: expFor(risk, rng),
        vulnCount, critVulns, tags: [cat.toLowerCase()],
        environment: envF(rng), dataSensitivity: sensF(rng),
        sources: genSrc(g, Math.min(sc + Math.floor(rng() * 3), SRC_LIST.length), now),
        timeline: [], createdAt: now, updatedAt: now,
      });
    }
  };

  // Workstation: 7150 - 1 seed = 7149
  gen("Workstation", 7149,
    (i, r) => `${pa(["eng","fin","hr","sls","mkt","ops","sec"] as const, r)}-ws-${String(i).padStart(5, "0")}`,
    r => pa(["Windows 11 23H2","Windows 11 22H2","Windows 10 22H2","Windows 10 21H2","macOS 14.5 Sonoma","macOS 13.6 Ventura","Ubuntu 22.04 LTS"] as const, r),
    r => r() > 0.25 ? `172.16.${1 + Math.floor(r() * 9)}.${1 + Math.floor(r() * 253)}` : "DHCP",
    r => pa(["Dell","HP","Lenovo","Apple","HP","Lenovo"] as const, r),
    (o) => o.includes("macOS") ? "CrowdStrike" : "MS Defender",
    r => pa(GD, r),
    r => pa(["10.8040.18362.215","10.7740.18362.164","10.8750.22631.388","10.8040.18362.440"] as const, r),
    [2, 13, 45, 40], 0.94, () => "Corporate", () => "Internal", 0.85, 5,
  );

  // Server: 1058 - 12 seeds = 1046
  gen("Server", 1046,
    (i, r) => `srv-${pa(["web","api","db","app","svc","auth","cache","batch"] as const, r)}-${pa(["prod","dev","stg","dr"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["Windows Server 2022","Windows Server 2019","Ubuntu 22.04 LTS","Rocky Linux 9","RHEL 9.3","Debian 12","CentOS Stream 9"] as const, r),
    r => `10.${Math.floor(r() * 3)}.${1 + Math.floor(r() * 10)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["Dell PowerEdge","HP ProLiant","AWS EC2","Azure VM","VMware","Lenovo ThinkSystem"] as const, r),
    (o) => o.includes("Windows") ? "MS Defender" : "CrowdStrike",
    r => pa(["Engineering","IT Ops","Data","Security"] as const, r),
    r => pa(["7.14.16202.0","7.15.18502.0","7.16.19101.0"] as const, r),
    [12, 28, 38, 22], 0.97,
    r => pa(["Production","Production","Corporate","Development","DR"] as const, r),
    r => pa(["Restricted","Confidential","Internal"] as const, r),
    0.92, 6,
  );

  // Mobile: 1975 - 0 seeds = 1975
  gen("Mobile", 1975,
    (i, r) => `${pa(["iPhone","Galaxy","Pixel","iPad","Surface"] as const, r)}-${pa(["14","15","Pro","Ultra","S24","S23","A54"] as const, r)}-${String(i).padStart(5, "0")}`,
    r => pa(["iOS 17.5","iOS 17.4","iOS 16.7","Android 14","Android 13","iPadOS 17.5"] as const, r),
    () => "DHCP",
    r => pa(["Apple","Samsung","Google","OnePlus","Microsoft"] as const, r),
    (o) => (o.startsWith("iOS") || o.startsWith("iPadOS")) ? "Jamf Protect" : "MS Defender",
    r => pa(GD, r),
    () => "—",
    [0, 5, 20, 75], 0.90, () => "Corporate", () => "Internal", 0.75, 2,
  );

  // Network: 623 - 3 seeds = 620
  gen("Network", 620,
    (i, r) => `${pa(["sw","rtr","ap","fw","lb","vpn"] as const, r)}-${pa(["bldg1","bldg2","dc","branch","edge"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["Cisco IOS 17.x","Cisco IOS 15.x","Juniper JunOS 21.x","Aruba AOS 10.x","Palo Alto PAN-OS 11.x","Fortinet FortiOS 7.x"] as const, r),
    r => r() > 0.5 ? `10.${Math.floor(r() * 5)}.${1 + Math.floor(r() * 10)}.${1 + Math.floor(r() * 253)}` : `192.168.${Math.floor(r() * 5)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["Cisco","Juniper","Aruba","Palo Alto","Fortinet","F5"] as const, r),
    () => "N/A", () => "IT Ops", () => "—",
    [5, 30, 45, 20], 0.85,
    r => pa(["Production","Corporate"] as const, r),
    () => "Internal", 0.65, 3,
  );

  // IoT: 380 - 1 seed = 379
  gen("IoT", 379,
    (i, r) => `iot-${pa(["sensor","camera","badge","hvac","lock","printer","reader"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["Embedded / RTOS","Embedded / Linux","Proprietary Firmware","Various / Embedded","FreeRTOS 10.x"] as const, r),
    r => `192.168.${50 + Math.floor(r() * 50)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["HID","Honeywell","Axis","Zebra","Various","Siemens","Bosch"] as const, r),
    () => "None",
    r => pa(["Facilities","Operations","IT Ops"] as const, r),
    () => "—",
    [3, 25, 45, 27], 0.25, () => "Corporate", () => "Internal", 0.45, 2,
  );

  // Cloud: 390 - 7 seeds = 383
  gen("Cloud", 383,
    (i, r) => `${pa(["ec2","rds","s3","lambda","az-vm","aks","eks","gke","functions"] as const, r)}-${pa(["prod","dev","stg"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["Amazon Linux 2023","AWS EC2","AWS S3","Azure VM — Windows Server 2022","Azure VM — Ubuntu 22.04","GCP Compute — Debian 12","AWS EKS / Kubernetes 1.29","Azure AKS 1.28"] as const, r),
    r => `10.${30 + Math.floor(r() * 20)}.${Math.floor(r() * 10)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["AWS","Azure","GCP","AWS","AWS","Azure"] as const, r),
    (o) => o.includes("Windows") ? "MS Defender" : (o.includes("S3") || o.includes("Lambda")) ? "N/A" : "CrowdStrike",
    r => pa(["Engineering","IT Ops","Data","Security"] as const, r),
    r => pa(["7.14.16202.0","7.15.18502.0"] as const, r),
    [8, 22, 42, 28], 0.98,
    r => pa(["Production","Production","Development"] as const, r),
    r => pa(["Restricted","Confidential","Internal","Public"] as const, r),
    0.90, 4,
  );

  // OT: 248 - 0 seeds = 248
  gen("OT", 248,
    (i, r) => `ot-${pa(["plc","scada","hmi","dcs","rtu","historian"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["Siemens S7-1500","Siemens S7-300","Allen Bradley PLC5","Rockwell FactoryTalk","GE iFIX","Honeywell DeltaV","ABB 800xA"] as const, r),
    r => `192.168.${100 + Math.floor(r() * 50)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["Siemens","Rockwell","GE","Honeywell","ABB","Schneider Electric"] as const, r),
    () => "None", () => "Operations", () => "—",
    [15, 35, 35, 15], 0.15, () => "Production", () => "Restricted", 0.35, 1,
  );

  // Container: 82 - 1 seed = 81
  gen("Container", 81,
    (i, r) => `${pa(["k8s-node","pod","ecs-task","fargate"] as const, r)}-${pa(["prod","dev","stg"] as const, r)}-${String(i).padStart(4, "0")}`,
    r => pa(["containerd / k8s 1.29","containerd / k8s 1.28","Docker Engine 24.x","ECS / Fargate","Kubernetes 1.27 / CRI-O"] as const, r),
    r => `10.${40 + Math.floor(r() * 10)}.${Math.floor(r() * 5)}.${1 + Math.floor(r() * 253)}`,
    r => pa(["AWS EKS","GKE","AKS","Docker","VMware Tanzu"] as const, r),
    () => "Falco", () => "Engineering",
    r => `${1 + Math.floor(r() * 2)}.${28 + Math.floor(r() * 5)}.${Math.floor(r() * 10)}`,
    [5, 20, 55, 20], 0.98,
    r => pa(["Production","Development"] as const, r),
    r => pa(["Confidential","Internal"] as const, r),
    0.88, 3,
  );

  // Unknown: 623 - 15 seeds = 608
  gen("Unknown", 608,
    (i, r) => r() > 0.4
      ? `${pa(["saas","cloud-svc","unidentified"] as const, r)}-${String(i).padStart(5, "0")}`
      : `${pa(["00","AA","FF"] as const, r)}:${Math.floor(r() * 255).toString(16).padStart(2, "0").toUpperCase()}:${Math.floor(r() * 255).toString(16).padStart(2, "0").toUpperCase()}:xx:${String(i).padStart(2, "0")}`,
    r => pa(["Unknown","SaaS Platform","Cloud Service","Various","Proprietary"] as const, r),
    r => r() > 0.6 ? `10.${Math.floor(r() * 254)}.${Math.floor(r() * 254)}.${1 + Math.floor(r() * 253)}` : "—",
    r => pa(["Unknown","Various","Unidentified","SaaS Vendor"] as const, r),
    () => "Unknown",
    r => r() > 0.3 ? pa(GD, r) : "—",
    () => "—",
    [8, 28, 40, 24], 0.30,
    r => pa(["Corporate","Production"] as const, r),
    r => pa(["Internal","Confidential"] as const, r),
    0.25, 1,
  );

  return result; // 40 seeds + 12,489 generated = 12,529
}

const assetStore = new Map<string, Asset[]>();
const relStore   = new Map<string, AssetRelationship[]>();

function tenantAssets(tenantId: string): Asset[] {
  if (!assetStore.has(tenantId)) {
    if (tenantId === "1") {
      const now = new Date().toISOString().slice(0, 10);
      assetStore.set(tenantId, buildFullAssetList(now));
    } else {
      assetStore.set(tenantId, []);
    }
  }
  return assetStore.get(tenantId)!;
}

function tenantRels(tenantId: string): AssetRelationship[] {
  if (!relStore.has(tenantId)) {
    if (tenantId === "1") {
      const now = new Date().toISOString().slice(0, 10);
      relStore.set(tenantId, SEED_RELATIONSHIPS.map(r => ({ ...r, id: randomUUID(), createdAt: now })));
    } else {
      relStore.set(tenantId, []);
    }
  }
  return relStore.get(tenantId)!;
}

export class CaasmService {
  // ── Assets ─────────────────────────────────────────────────────────────────
  getAssets(tenantId: string): Asset[] { return tenantAssets(tenantId); }

  getAssetsPaginated(tenantId: string, opts: { page: number; pageSize: number; search?: string; category?: string }) {
    let list = tenantAssets(tenantId);
    if (opts.category && opts.category !== "All") {
      list = list.filter(a => a.category === opts.category);
    }
    if (opts.search) {
      const s = opts.search.toLowerCase();
      list = list.filter(a =>
        a.hostname.toLowerCase().includes(s) ||
        a.ip.toLowerCase().includes(s) ||
        a.dept.toLowerCase().includes(s) ||
        a.os.toLowerCase().includes(s)
      );
    }
    const total = list.length;
    const pageSize = opts.pageSize;
    const pages = Math.ceil(total / pageSize);
    const page = Math.min(Math.max(1, opts.page), pages || 1);
    const start = (page - 1) * pageSize;
    return { items: list.slice(start, start + pageSize), total, page, pageSize, pages };
  }

  getAsset(tenantId: string, id: string): Asset | undefined {
    return tenantAssets(tenantId).find(a => a.id === id);
  }

  createAsset(tenantId: string, data: Omit<Asset,"id"|"sources"|"timeline"|"createdAt"|"updatedAt">): Asset {
    const now = new Date().toISOString().slice(0, 10);
    const list = tenantAssets(tenantId);
    const idx = list.length + 1;
    const id = `AST-${String(idx + 100).padStart(3, "0")}`;
    const asset: Asset = { ...data, id, sources: randomSources(2, now), timeline: [], createdAt: now, updatedAt: now };
    list.push(asset);
    return asset;
  }

  updateAsset(tenantId: string, id: string, data: Partial<Omit<Asset,"id"|"createdAt">>): Asset | null {
    const a = tenantAssets(tenantId).find(x => x.id === id);
    if (!a) return null;
    Object.assign(a, data, { updatedAt: new Date().toISOString().slice(0, 10) });
    return a;
  }

  deleteAsset(tenantId: string, id: string): boolean {
    const list = tenantAssets(tenantId);
    const i = list.findIndex(a => a.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  // ── Filter engine ──────────────────────────────────────────────────────────
  filterAssets(tenantId: string, query: FilterQuery): Asset[] {
    const list = tenantAssets(tenantId);
    const match = (a: Asset, c: FilterCondition): boolean => {
      const val = String((a as unknown as Record<string,unknown>)[c.field] ?? "").toLowerCase();
      const v = String(c.value).toLowerCase();
      switch (c.op) {
        case "eq":       return val === v;
        case "neq":      return val !== v;
        case "contains": return val.includes(v);
        case "gt":       return Number(val) > Number(v);
        case "lt":       return Number(val) < Number(v);
        case "in":       return (c.value as string[]).map(x => x.toLowerCase()).includes(val);
        default:         return true;
      }
    };
    return list.filter(a =>
      query.logic === "AND"
        ? query.conditions.every(c => match(a, c))
        : query.conditions.some(c => match(a, c))
    );
  }

  // ── Relationships ──────────────────────────────────────────────────────────
  getRelationships(tenantId: string, assetId?: string): AssetRelationship[] {
    const rels = tenantRels(tenantId);
    if (!assetId) return rels;
    return rels.filter(r => r.source === assetId || r.target === assetId);
  }

  createRelationship(tenantId: string, data: Omit<AssetRelationship,"id"|"createdAt">): AssetRelationship {
    const now = new Date().toISOString().slice(0, 10);
    const rel: AssetRelationship = { ...data, id: randomUUID(), createdAt: now };
    tenantRels(tenantId).push(rel);
    return rel;
  }

  deleteRelationship(tenantId: string, id: string): boolean {
    const list = tenantRels(tenantId);
    const i = list.findIndex(r => r.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  // ── Timeline ───────────────────────────────────────────────────────────────
  getTimeline(tenantId: string, assetId: string): AssetTimeline[] {
    return this.getAsset(tenantId, assetId)?.timeline ?? [];
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  getStats(tenantId: string) {
    const list = tenantAssets(tenantId);
    const byCategory = {} as Record<string, number>;
    const byRisk     = {} as Record<string, number>;
    const byEnv      = {} as Record<string, number>;
    const bySource   = {} as Record<string, number>;
    list.forEach(a => {
      byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
      byRisk[a.risk]         = (byRisk[a.risk] ?? 0) + 1;
      byEnv[a.environment]   = (byEnv[a.environment] ?? 0) + 1;
      a.sources.forEach(s => { bySource[s.name] = (bySource[s.name] ?? 0) + 1; });
    });
    return {
      total:       list.length,
      managed:     list.filter(a => a.managed).length,
      unmanaged:   list.filter(a => !a.managed).length,
      byCategory, byRisk, byEnv,
      avgExposure: Math.round(list.reduce((s, a) => s + a.exposureScore, 0) / list.length),
      totalVulns:  list.reduce((s, a) => s + a.vulnCount, 0),
      critVulns:   list.reduce((s, a) => s + a.critVulns, 0),
      bySource: Object.entries(bySource).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }

  // ── Exposure paths ─────────────────────────────────────────────────────────
  getExposurePaths(tenantId: string) {
    const assets = tenantAssets(tenantId);
    const rels   = tenantRels(tenantId);
    const critIds = new Set(assets.filter(a => a.risk === "Critical").map(a => a.id));
    return rels.filter(r => critIds.has(r.source) || critIds.has(r.target)).map(r => ({
      ...r,
      sourceAsset:  assets.find(a => a.id === r.source),
      targetAsset:  assets.find(a => a.id === r.target),
      exposureRisk: critIds.has(r.source) && critIds.has(r.target) ? "Critical" : "High",
    }));
  }
}

export const caasmService = new CaasmService();

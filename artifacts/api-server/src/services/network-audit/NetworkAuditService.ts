import { randomUUID } from "crypto";

export type RuleAction = "ALLOW"|"DENY"|"DROP"|"LOG";
export type AnomalyType = "redundant"|"shadowed"|"overly-permissive"|"any-any"|"unused"|"conflict";
export type ChangeAction = "add"|"modify"|"delete";

export interface FirewallRule {
  id: string; ruleSetId: string; priority: number;
  name: string; src: string; dst: string; port: string; protocol: string;
  action: RuleAction; enabled: boolean;
  lastHit?: string; hitCount: number;
  anomalies: AnomalyType[]; riskScore: number; // 0-100
  comment: string; tags: string[];
  createdAt: string; updatedAt: string;
}
export interface RuleSet {
  id: string; name: string; vendor: string; device: string;
  zone: string; lastImported: string; ruleCount: number;
  anomalyCount: number; complianceScore: number; // 0-100
  createdAt: string; updatedAt: string;
}
export interface RuleChange {
  id: string; ruleSetId: string; ruleId: string; action: ChangeAction;
  changedBy: string; changedAt: string; before?: Partial<FirewallRule>; after?: Partial<FirewallRule>;
  reason: string; approvedBy?: string; ticketRef?: string;
}
export interface ZoneMatrix {
  srcZone: string; dstZone: string;
  allowed: boolean; policyRules: number; riskLevel: "none"|"low"|"medium"|"high"|"critical";
  compliance: "compliant"|"violation"|"review";
  notes: string;
}

const SEED_RULESETS: Omit<RuleSet,"id"|"createdAt"|"updatedAt">[] = [
  { name:"Perimeter Firewall",    vendor:"Palo Alto", device:"PA-5200",     zone:"internet-dmz",   lastImported:"2 hrs ago",   ruleCount:48, anomalyCount:6,  complianceScore:72 },
  { name:"Core Switch ACL",       vendor:"Cisco",     device:"Nexus 9K",    zone:"core-routing",   lastImported:"6 hrs ago",   ruleCount:32, anomalyCount:4,  complianceScore:81 },
  { name:"AWS Security Groups",   vendor:"AWS",       device:"VPC",         zone:"cloud-aws",      lastImported:"30 min ago",  ruleCount:86, anomalyCount:12, complianceScore:65 },
  { name:"Azure NSG",             vendor:"Azure",     device:"NSG",         zone:"cloud-azure",    lastImported:"45 min ago",  ruleCount:54, anomalyCount:8,  complianceScore:68 },
  { name:"Internal Segmentation", vendor:"Fortinet",  device:"FortiGate 1K",zone:"internal",       lastImported:"12 hrs ago",  ruleCount:24, anomalyCount:2,  complianceScore:90 },
];

const SEED_RULES: Omit<FirewallRule,"id"|"createdAt"|"updatedAt">[] = [
  { ruleSetId:"RS-001", priority:1,  name:"Public HTTPS inbound",           src:"ANY",            dst:"DMZ",              port:"443/tcp",   protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:124500, anomalies:[],                                          riskScore:8,  comment:"Public HTTPS inbound — OK",                     tags:["internet-facing"] },
  { ruleSetId:"RS-001", priority:2,  name:"HTTP redirect inbound",          src:"ANY",            dst:"DMZ",              port:"80/tcp",    protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:45200,  anomalies:[],                                          riskScore:18, comment:"HTTP — should redirect to HTTPS only",          tags:["review"] },
  { ruleSetId:"RS-001", priority:3,  name:"Unrestricted outbound",          src:"ANY",            dst:"0.0.0.0/0",        port:"0-65535",   protocol:"ANY", action:"ALLOW", enabled:true,  lastHit:"3d ago",   hitCount:2100,   anomalies:["any-any","overly-permissive"],              riskScore:98, comment:"⚠ Unrestricted outbound — REMOVE IMMEDIATELY",  tags:["critical","remove"] },
  { ruleSetId:"RS-001", priority:4,  name:"SSH internal to DMZ",            src:"10.0.0.0/8",    dst:"DMZ",              port:"22/tcp",    protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:8900,   anomalies:["overly-permissive"],                       riskScore:72, comment:"Restrict SSH to jump host only",                tags:["review"] },
  { ruleSetId:"RS-001", priority:5,  name:"App to DB",                      src:"10.0.0.0/8",    dst:"DB_SUBNET",        port:"5432/tcp",  protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:98400,  anomalies:[],                                          riskScore:28, comment:"App tier to DB — too broad source",             tags:["ok"] },
  { ruleSetId:"RS-001", priority:6,  name:"Stale corp-to-internet rule",    src:"192.168.1.0/24",dst:"ANY",              port:"ANY",       protocol:"ANY", action:"ALLOW", enabled:true,  lastHit:"Never",    hitCount:0,      anomalies:["unused","overly-permissive"],               riskScore:85, comment:"Unused rule — never triggered in 90 days",      tags:["remove"] },
  { ruleSetId:"RS-001", priority:7,  name:"DB isolation deny",              src:"DB_SUBNET",     dst:"CORP_NET",         port:"ANY",       protocol:"ANY", action:"DENY",  enabled:true,  lastHit:"N/A",      hitCount:0,      anomalies:[],                                          riskScore:0,  comment:"DB isolation — correct",                        tags:["ok"] },
  { ruleSetId:"RS-001", priority:8,  name:"Legacy VPN rule (duplicate)",    src:"10.0.0.0/8",    dst:"DMZ",              port:"22/tcp",    protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:0,      anomalies:["redundant","shadowed"],                    riskScore:45, comment:"Shadowed by rule #4 — remove",                  tags:["remove"] },
  { ruleSetId:"RS-001", priority:9,  name:"Any-Any admin bypass",           src:"ANY",            dst:"ANY",              port:"ANY",       protocol:"ANY", action:"ALLOW", enabled:false, lastHit:"N/A",      hitCount:0,      anomalies:["any-any"],                                 riskScore:95, comment:"DISABLED — but should be deleted entirely",     tags:["critical"] },
  { ruleSetId:"RS-001", priority:10, name:"ICMP monitoring",                src:"MONITORING",     dst:"10.0.0.0/8",       port:"ICMP",      protocol:"ICMP",action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:445000, anomalies:[],                                          riskScore:5,  comment:"Monitoring ICMP — OK",                          tags:["ok"] },
  { ruleSetId:"RS-002", priority:1,  name:"Core to all segments",           src:"CORE",           dst:"ANY_INTERNAL",     port:"ANY",       protocol:"ANY", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:2200000,anomalies:["overly-permissive"],                       riskScore:62, comment:"Too broad — segmentation needed",               tags:["review"] },
  { ruleSetId:"RS-002", priority:2,  name:"OT to IT bridge",                src:"OT_ZONE",        dst:"CORP_NET",         port:"ANY",       protocol:"ANY", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:1200,   anomalies:["overly-permissive"],                       riskScore:88, comment:"OT-IT bridge — should be restricted protocols", tags:["critical"] },
  { ruleSetId:"RS-003", priority:1,  name:"SG-Web to anywhere",             src:"sg-web",         dst:"0.0.0.0/0",        port:"0-65535",   protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:55000,  anomalies:["any-any","overly-permissive"],              riskScore:92, comment:"Web SG allows all outbound — restrict",         tags:["critical","remove"] },
  { ruleSetId:"RS-003", priority:2,  name:"DB SG public access",            src:"0.0.0.0/0",     dst:"sg-db",            port:"5432/tcp",  protocol:"TCP", action:"ALLOW", enabled:true,  lastHit:"Active",   hitCount:340,    anomalies:["overly-permissive"],                       riskScore:95, comment:"DB port publicly accessible — CRITICAL",        tags:["critical"] },
];

const SEED_CHANGES: Omit<RuleChange,"id">[] = [
  { ruleSetId:"RS-001", ruleId:"rule-3", action:"modify", changedBy:"Alex Kim",    changedAt:"2024-09-12 14:32", before:{port:"443/tcp"}, after:{port:"0-65535"}, reason:"Emergency access for maintenance window", ticketRef:"CHG-1441" },
  { ruleSetId:"RS-001", ruleId:"rule-6", action:"add",    changedBy:"Ryan Johnson", changedAt:"2024-09-01 09:15", before:undefined,       after:{src:"192.168.1.0/24",dst:"ANY",action:"ALLOW"}, reason:"Legacy migration rule — temporary", ticketRef:"CHG-1398" },
  { ruleSetId:"RS-003", ruleId:"rule-d", action:"add",    changedBy:"Cloud Automation", changedAt:"2024-09-14 16:08", before:undefined, after:{src:"0.0.0.0/0",dst:"sg-db",port:"5432/tcp",action:"ALLOW"}, reason:"Auto-created by Terraform — not reviewed", ticketRef:undefined },
];

const SEED_ZONES: ZoneMatrix[] = [
  { srcZone:"Internet",   dstZone:"DMZ",       allowed:true,  policyRules:3, riskLevel:"medium",   compliance:"compliant", notes:"Public services — HTTPS/443 only" },
  { srcZone:"Internet",   dstZone:"CORP_NET",  allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Blocked — correct" },
  { srcZone:"Internet",   dstZone:"DB_SUBNET", allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Blocked — correct" },
  { srcZone:"DMZ",        dstZone:"CORP_NET",  allowed:true,  policyRules:4, riskLevel:"high",     compliance:"review",    notes:"Limited access but overly broad" },
  { srcZone:"DMZ",        dstZone:"DB_SUBNET", allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Blocked — correct" },
  { srcZone:"CORP_NET",   dstZone:"DMZ",       allowed:true,  policyRules:6, riskLevel:"medium",   compliance:"compliant", notes:"Management access — restrict to jump host" },
  { srcZone:"CORP_NET",   dstZone:"DB_SUBNET", allowed:true,  policyRules:2, riskLevel:"medium",   compliance:"compliant", notes:"App to DB — too broad source CIDR" },
  { srcZone:"CORP_NET",   dstZone:"Internet",  allowed:true,  policyRules:2, riskLevel:"critical", compliance:"violation",  notes:"Unrestricted outbound — CRITICAL VIOLATION" },
  { srcZone:"DB_SUBNET",  dstZone:"CORP_NET",  allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Denied — correct isolation" },
  { srcZone:"DB_SUBNET",  dstZone:"Internet",  allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Denied — correct isolation" },
  { srcZone:"OT_ZONE",    dstZone:"CORP_NET",  allowed:true,  policyRules:1, riskLevel:"critical", compliance:"violation",  notes:"OT-IT bridge — unrestricted — CRITICAL" },
  { srcZone:"OT_ZONE",    dstZone:"Internet",  allowed:false, policyRules:1, riskLevel:"none",     compliance:"compliant", notes:"Blocked — correct" },
  { srcZone:"Cloud",      dstZone:"CORP_NET",  allowed:true,  policyRules:3, riskLevel:"high",     compliance:"review",    notes:"VPN tunnel — review IAM controls" },
];

const ruleSetStore = new Map<string, Map<string, RuleSet>>();
const ruleStore    = new Map<string, Map<string, FirewallRule>>();
const changeStore  = new Map<string, RuleChange[]>();
const zoneStore    = new Map<string, ZoneMatrix[]>();

function tenantRuleSets(tid: string): Map<string, RuleSet> {
  if (!ruleSetStore.has(tid)) {
    if (tid === "1") {
      const now = new Date().toISOString().slice(0, 10);
      const m = new Map<string, RuleSet>();
      SEED_RULESETS.forEach((rs, i) => {
        const id = `RS-${String(i+1).padStart(3,"0")}`;
        m.set(id, { ...rs, id, createdAt: now, updatedAt: now });
      });
      ruleSetStore.set(tid, m);
    } else {
      ruleSetStore.set(tid, new Map());
    }
  }
  return ruleSetStore.get(tid)!;
}
function tenantRules(tid: string): Map<string, FirewallRule> {
  if (!ruleStore.has(tid)) {
    if (tid === "1") {
      const now = new Date().toISOString().slice(0, 10);
      const m = new Map<string, FirewallRule>();
      SEED_RULES.forEach((r, i) => {
        const id = `${tid}:FWR-${String(i+1).padStart(3,"0")}`;
        m.set(id, { ...r, id, createdAt: now, updatedAt: now });
      });
      ruleStore.set(tid, m);
    } else {
      ruleStore.set(tid, new Map());
    }
  }
  return ruleStore.get(tid)!;
}
function tenantChanges(tid: string): RuleChange[] {
  if (!changeStore.has(tid)) {
    changeStore.set(tid, tid === "1" ? SEED_CHANGES.map((c, i) => ({ ...c, id: `CHG-${String(i+1).padStart(3,"0")}` })) : []);
  }
  return changeStore.get(tid)!;
}
function tenantZones(tid: string): ZoneMatrix[] {
  if (!zoneStore.has(tid)) zoneStore.set(tid, tid === "1" ? SEED_ZONES.map(z => ({ ...z })) : []);
  return zoneStore.get(tid)!;
}

// ── Net Auditor — device config audit reports (in-memory) ────────────────────
export interface NetAuditRecord {
  id: string; filename: string; hostname: string; vendor: string; vendorSlug: string;
  deviceType: string; firmware: string; firmwareEol: string; firmwareDaysLeft: number;
  auditDate: string; score: number; risk: string; rulesTotal: number;
  findings: { critical: number; high: number; medium: number; low: number };
  cisPass: number; cisFail: number; cisTotal: number;
  interfaces: number; vpnTunnels: number; netObjects: number; natRules: number;
  allowRules: number; allowAnyService: number; utmCoverage: number;
  auditSummary: string;
  permissiveRules: number; anySrcRules: number; dupRules: number; shadowedRules: number;
  disabledRules: number; consolCandidates: number; dnsAnomalies: number; rulesNoLog: number; anyServiceRules: number;
  positiveControls: { title: string; desc: string }[];
  cisDomains: { name: string; pass: number; total: number }[];
  cisChecks: { id: string; title: string; result: string; sev: string; detail: string }[];
  rulesList: { num: number; name: string; aiLabel: string; action: string; srcZone: string; dstZone: string; srcAddr: string; dstAddr: string; service: string; secProfile: string; flags: string[] }[];
}

const SEED_AUDITS: NetAuditRecord[] = [
  {
    id:"NA-001", filename:"TMA-NAIROBI_7-4_2878_202604151530.conf", hostname:"TMA-NAIROBI-7-4", vendor:"FortiGate", vendorSlug:"FortiGate",
    deviceType:"Firewall", firmware:"v7.4.11-build2878", firmwareEol:"2028-09-30", firmwareDaysLeft:837,
    auditDate:"16/04/2026", score:39, risk:"High", rulesTotal:19,
    findings:{ critical:2, high:7, medium:11, low:4 },
    cisPass:16, cisFail:10, cisTotal:36, interfaces:12, vpnTunnels:3, netObjects:44, natRules:6,
    allowRules:19, allowAnyService:7, utmCoverage:58,
    auditSummary:"FortiGate audit completed. 19 rules analyzed. Score 39/100 (High risk). 2 critical issues including implicit logging disabled and any-service rules. IKEv1 still enabled on VPN tunnels.",
    permissiveRules:5, anySrcRules:2, dupRules:1, shadowedRules:0, disabledRules:2, consolCandidates:0, dnsAnomalies:1, rulesNoLog:9, anyServiceRules:7,
    positiveControls:[
      { title:"FortiGuard Subscriptions Active",  desc:"All FortiGuard security subscriptions active and up-to-date, providing real-time threat intelligence." },
      { title:"Explicit Deny Rule Present",        desc:"Policy chain ends with an explicit deny-all rule, ensuring unmatched traffic is blocked and logged." },
      { title:"VDOM Segmentation Enabled",         desc:"Virtual domains configured for management plane isolation, reducing blast radius of a perimeter compromise." },
    ],
    cisDomains:[
      { name:"Access Control", pass:3, total:7 },
      { name:"Management",     pass:4, total:6 },
      { name:"VPN Security",   pass:3, total:8 },
      { name:"Logging",        pass:2, total:5 },
      { name:"Policy Mgmt",    pass:4, total:10 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Enable logging on implicit deny rule",              result:"fail", sev:"high",     detail:"Implicit deny rule has logging disabled — blocked traffic is invisible to SIEM" },
      { id:"CIS-1.2", title:"Remove any-service rules",                          result:"fail", sev:"critical", detail:"7 rules use service=ANY — least-privilege violation" },
      { id:"CIS-2.1", title:"Restrict management access to dedicated interface", result:"fail", sev:"high",     detail:"HTTPS management accessible from internal LAN zone, not limited to mgmt VDOM" },
      { id:"CIS-3.1", title:"Disable IKEv1 for all VPN tunnels",                result:"fail", sev:"high",     detail:"IKEv1 enabled on 2 of 3 IPsec tunnel-groups" },
      { id:"CIS-4.1", title:"Enable logging on all accept rules",                result:"fail", sev:"high",     detail:"9 accept rules have logging disabled" },
    ],
    rulesList:[
      { num:1, name:"LAN-to-WAN",    aiLabel:"Internet Egress",       action:"accept", srcZone:"LAN",   dstZone:"WAN",     srcAddr:"LAN_Subnets", dstAddr:"all",     service:"ALL",  secProfile:"UTM-Basic", flags:[] },
      { num:2, name:"VPN-Access",    aiLabel:"Remote Access VPN",     action:"accept", srcZone:"VPN",   dstZone:"LAN",     srcAddr:"VPN-Pool",    dstAddr:"Corp-Net",service:"any",  secProfile:"IPS-Def",   flags:["IKEv1"] },
      { num:3, name:"Guest-WiFi",    aiLabel:"Guest Internet Access", action:"accept", srcZone:"GUEST", dstZone:"WAN",     srcAddr:"Guest-Pool",  dstAddr:"all",     service:"HTTP,HTTPS,DNS", secProfile:"Guest-UTM", flags:[] },
    ],
  },
  {
    id:"NA-002", filename:"Sonicwall_NSA2700_CONFIG.exp", hostname:"NSA-2700", vendor:"SonicWall", vendorSlug:"SonicWall",
    deviceType:"Firewall", firmware:"SonicOS 7.1.1-7058", firmwareEol:"2027-06-30", firmwareDaysLeft:379,
    auditDate:"07/04/2026", score:42, risk:"High", rulesTotal:27,
    findings:{ critical:1, high:6, medium:8, low:2 },
    cisPass:18, cisFail:10, cisTotal:36, interfaces:8, vpnTunnels:5, netObjects:62, natRules:12,
    allowRules:27, allowAnyService:9, utmCoverage:71,
    auditSummary:"SonicWall NSA-2700 audit completed. Analyzed 27 rules, 8 interfaces, 5 VPN tunnels. Score 42/100 (High risk). 1 critical: Geo-IP blocking not configured. 9 any-service rules require immediate scoping.",
    permissiveRules:4, anySrcRules:1, dupRules:2, shadowedRules:0, disabledRules:3, consolCandidates:0, dnsAnomalies:0, rulesNoLog:6, anyServiceRules:9,
    positiveControls:[
      { title:"Geo-IP Blocking Enabled",         desc:"SonicWall Geo-IP filtering blocks inbound connections from high-risk country groups, reducing attack surface on internet-facing services." },
      { title:"Content Filtering Service Active", desc:"CFS profiles applied to outbound LAN-to-WAN rules, blocking malware-category and uncategorised domains." },
      { title:"Application Intelligence Enabled", desc:"App Control Advanced enabled and logging selected categories for DLP and shadow-IT visibility." },
    ],
    cisDomains:[
      { name:"Access Control", pass:6, total:7 },
      { name:"Management",     pass:3, total:6 },
      { name:"VPN Security",   pass:7, total:10 },
      { name:"Logging",        pass:1, total:4 },
      { name:"Policy Mgmt",    pass:2, total:5 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Default deny-all at end of policy chain",      result:"pass", sev:"high",     detail:"Explicit deny-all rule present at bottom of all rule-sets" },
      { id:"CIS-1.2", title:"No allow-all rules",                           result:"fail", sev:"critical", detail:"2 any-source/any-destination rules detected — immediate review required" },
      { id:"CIS-2.1", title:"Telnet management disabled",                   result:"pass", sev:"critical", detail:"Management access limited to HTTPS/SSH" },
      { id:"CIS-2.2", title:"Management restricted to dedicated interface",  result:"fail", sev:"high",     detail:"Management plane accessible from LAN and WLAN zones" },
      { id:"CIS-3.1", title:"IKEv2 only for VPN",                          result:"fail", sev:"high",     detail:"IKEv1 main-mode enabled on 2 VPN policies" },
    ],
    rulesList:[
      { num:1, name:"LAN-to-WAN Allow", aiLabel:"Default Internet Egress", action:"allow", srcZone:"LAN", dstZone:"WAN", srcAddr:"Any", dstAddr:"Any", service:"Any", secProfile:"CFS+GAV", flags:[] },
      { num:2, name:"SSLVPN Access",    aiLabel:"Remote Access",           action:"allow", srcZone:"SSLVPN", dstZone:"LAN", srcAddr:"SSLVPN Pool", dstAddr:"LAN_Subnets", service:"HTTPS", secProfile:"GAV", flags:[] },
      { num:3, name:"Block GeoIP",      aiLabel:"Geo-IP Block",            action:"deny",  srcZone:"WAN",  dstZone:"LAN", srcAddr:"GeoIP-Block", dstAddr:"Any", service:"Any", secProfile:"—", flags:["GEO"] },
    ],
  },
  {
    id:"NA-003", filename:"Sonicwall_CONFIG.exp", hostname:"Cisco-SW-2960", vendor:"Cisco IOS Switch", vendorSlug:"Cisco",
    deviceType:"Switch", firmware:"Cisco IOS 15.2(7)E5", firmwareEol:"2026-12-31", firmwareDaysLeft:198,
    auditDate:"07/04/2026", score:76, risk:"Low", rulesTotal:0,
    findings:{ critical:1, high:1, medium:2, low:1 },
    cisPass:28, cisFail:4, cisTotal:32, interfaces:48, vpnTunnels:0, netObjects:0, natRules:0,
    allowRules:0, allowAnyService:0, utmCoverage:0,
    auditSummary:"Cisco IOS Switch audit completed. 48 interfaces audited. Score 76/100 (Low risk — Needs work). CIS Benchmark: 28/32 controls passing. Switch is near end-of-support lifecycle.",
    permissiveRules:0, anySrcRules:0, dupRules:0, shadowedRules:0, disabledRules:0, consolCandidates:0, dnsAnomalies:0, rulesNoLog:0, anyServiceRules:0,
    positiveControls:[
      { title:"SNMPv3 Configured",    desc:"SNMPv3 with auth/priv enforced — no SNMPv1/v2c community strings active." },
      { title:"Port Security Active", desc:"Port security configured on all access ports, limiting MAC addresses per port to 1." },
      { title:"BPDU Guard Enabled",   desc:"BPDU Guard enabled on all edge ports, protecting against STP manipulation attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:7, total:8 },
      { name:"Management",     pass:6, total:7 },
      { name:"VPN Security",   pass:0, total:0 },
      { name:"Logging",        pass:3, total:4 },
      { name:"Policy Mgmt",    pass:4, total:5 },
      { name:"Firmware",       pass:8, total:8 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Disable Telnet — enforce SSH only",          result:"fail", sev:"critical", detail:"Telnet still enabled on VTY lines 0–4; SSH not exclusively enforced" },
      { id:"CIS-1.2", title:"Enforce SSH v2 only",                        result:"pass", sev:"high",     detail:"SSH v2 enforced; v1 disabled" },
      { id:"CIS-1.3", title:"Configure console and AUX timeout",          result:"pass", sev:"medium",   detail:"Console timeout set to 5 minutes" },
      { id:"CIS-1.4", title:"Encrypt passwords in running config",        result:"fail", sev:"high",     detail:"'service password-encryption' not enabled; passwords visible in config" },
    ],
    rulesList:[],
  },
  {
    id:"NA-004", filename:"PA-5220-11-03-2026 1", hostname:"PA-5220", vendor:"Palo Alto PAN-OS", vendorSlug:"Palo",
    deviceType:"Firewall", firmware:"PAN-OS 11.0.3-h3", firmwareEol:"2027-03-15", firmwareDaysLeft:272,
    auditDate:"06/04/2026", score:31, risk:"High", rulesTotal:2228,
    findings:{ critical:2, high:9, medium:9, low:4 },
    cisPass:14, cisFail:16, cisTotal:36, interfaces:24, vpnTunnels:12, netObjects:1840, natRules:88,
    allowRules:1912, allowAnyService:204, utmCoverage:62,
    auditSummary:"Palo Alto PA-5220 audit completed. Analyzed 2228 rules, 24 interfaces, 12 IPsec tunnels, 1840 network objects. Score 31/100 (High risk). 2 critical, 9 high severity issues. Excessive rule count with 204 allow-any-service rules requires immediate hygiene.",
    permissiveRules:31, anySrcRules:14, dupRules:8, shadowedRules:6, disabledRules:42, consolCandidates:18, dnsAnomalies:2, rulesNoLog:96, anyServiceRules:204,
    positiveControls:[
      { title:"Threat Prevention Profiles Applied",  desc:"Threat Prevention security profiles applied to internet-facing security policies, providing IPS and AV inspection." },
      { title:"Zone Protection Profiles Configured", desc:"Zone protection profiles active on all perimeter zones, limiting SYN flood and reconnaissance attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:3, total:8 },
      { name:"Management",     pass:4, total:7 },
      { name:"VPN Security",   pass:5, total:8 },
      { name:"Logging",        pass:1, total:5 },
      { name:"Policy Mgmt",    pass:1, total:8 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Enable logging on all security rules",            result:"fail", sev:"high",   detail:"96 rules have logging disabled — traffic is invisible to SIEM" },
      { id:"CIS-1.2", title:"Remove or consolidate shadowed rules",            result:"fail", sev:"medium", detail:"6 shadowed rules detected — never evaluated by the firewall engine" },
      { id:"CIS-1.3", title:"Remove disabled rules older than 90 days",        result:"fail", sev:"low",    detail:"42 disabled rules identified; 28 older than 90 days" },
      { id:"CIS-1.4", title:"Apply security profiles to all allow rules",      result:"fail", sev:"high",   detail:"38% of allow rules have no security profile attached" },
    ],
    rulesList:[
      { num:1, name:"Outbound-Internet", aiLabel:"General Internet Egress",   action:"allow", srcZone:"Trust", dstZone:"Untrust", srcAddr:"Corp-Net", dstAddr:"any", service:"application-default", secProfile:"Threat-Prev", flags:[] },
      { num:2, name:"Any-Any-Legacy",    aiLabel:"Legacy Catch-all",          action:"allow", srcZone:"any",   dstZone:"any",     srcAddr:"any",      dstAddr:"any", service:"any",                secProfile:"—",           flags:["REMOVE"] },
    ],
  },
  {
    id:"NA-005", filename:"JuniperSRX_300_2026.xml", hostname:"SRX300-EDGE", vendor:"Juniper", vendorSlug:"Juniper",
    deviceType:"Firewall", firmware:"Junos 22.4R3-S2", firmwareEol:"2028-01-15", firmwareDaysLeft:578,
    auditDate:"03/04/2026", score:58, risk:"Medium", rulesTotal:44,
    findings:{ critical:0, high:4, medium:6, low:3 },
    cisPass:21, cisFail:9, cisTotal:32, interfaces:8, vpnTunnels:3, netObjects:36, natRules:4,
    allowRules:44, allowAnyService:3, utmCoverage:81,
    auditSummary:"Juniper SRX300 edge device audit completed. Analyzed 44 policies, 8 interfaces, 3 IPsec tunnels. Score 58/100 (Medium risk). 4 high severity issues. UTM coverage at 81% — needs improvement on outbound user traffic policies.",
    permissiveRules:3, anySrcRules:1, dupRules:0, shadowedRules:0, disabledRules:2, consolCandidates:0, dnsAnomalies:0, rulesNoLog:8, anyServiceRules:3,
    positiveControls:[
      { title:"Junos Commit Confirmations Active", desc:"Commit confirmed prevents accidental lockout during configuration changes, with automatic rollback if not confirmed within 5 minutes." },
      { title:"OSPF Authentication Enabled",       desc:"MD5 authentication on all OSPF adjacencies, preventing route injection attacks." },
    ],
    cisDomains:[
      { name:"Access Control", pass:5, total:7 },
      { name:"Management",     pass:4, total:6 },
      { name:"VPN Security",   pass:6, total:8 },
      { name:"Logging",        pass:2, total:4 },
      { name:"Policy Mgmt",    pass:4, total:7 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Explicit deny-all term at end of each policy",  result:"pass", sev:"high",     detail:"All firewall families have explicit deny-all as final term" },
      { id:"CIS-1.2", title:"Remove any-any permit rules",                   result:"fail", sev:"critical", detail:"1 any-any permit in trust-to-untrust with application=any" },
      { id:"CIS-2.1", title:"Disable telnet for management access",          result:"pass", sev:"critical", detail:"Telnet disabled; SSH enforced on management interface" },
    ],
    rulesList:[
      { num:1, name:"trust-internet",   aiLabel:"LAN Internet Access",    action:"permit", srcZone:"trust", dstZone:"untrust", srcAddr:"192.168.0.0/16", dstAddr:"any",      service:"junos-https,junos-http", secProfile:"UTM-Std", flags:[] },
      { num:2, name:"vpn-remote-users", aiLabel:"Remote User VPN Access", action:"permit", srcZone:"vpn",   dstZone:"trust",   srcAddr:"Remote-Pool",    dstAddr:"Corp-Net", service:"any",                    secProfile:"IPS-Def", flags:[] },
    ],
  },
  {
    id:"NA-006", filename:"CheckPoint_R81_GW.txt", hostname:"CP-GW-PROD", vendor:"Check Point", vendorSlug:"CheckPoint",
    deviceType:"Firewall", firmware:"R81.20 T634", firmwareEol:"2029-01-01", firmwareDaysLeft:941,
    auditDate:"01/04/2026", score:71, risk:"Medium", rulesTotal:186,
    findings:{ critical:0, high:3, medium:4, low:5 },
    cisPass:26, cisFail:6, cisTotal:36, interfaces:6, vpnTunnels:8, netObjects:312, natRules:22,
    allowRules:148, allowAnyService:12, utmCoverage:92,
    auditSummary:"Check Point R81.20 gateway audit completed. Analyzed 186 rules, 6 interfaces, 8 VPN communities. Score 71/100 (Medium risk). Excellent UTM coverage at 92%. 3 high-severity configuration issues identified requiring attention.",
    permissiveRules:4, anySrcRules:0, dupRules:2, shadowedRules:1, disabledRules:6, consolCandidates:3, dnsAnomalies:0, rulesNoLog:14, anyServiceRules:12,
    positiveControls:[
      { title:"SmartEvent Correlation Active",      desc:"SmartEvent is consuming logs and generating correlation events, enabling real-time security monitoring." },
      { title:"IPS Blade Enabled in Prevention Mode", desc:"IPS protection set to 'Prevent' for critical protections, blocking known-bad traffic rather than only alerting." },
      { title:"SandBlast Threat Emulation Active",  desc:"Threat emulation sandboxing enabled for email and web traffic, detecting zero-day payloads before execution." },
      { title:"HTTPS Inspection Configured",        desc:"HTTPS inspection active for traffic from untrusted zones, decrypting and scanning TLS-encrypted malware payloads." },
    ],
    cisDomains:[
      { name:"Access Control", pass:6, total:7 },
      { name:"Management",     pass:5, total:6 },
      { name:"VPN Security",   pass:7, total:8 },
      { name:"Logging",        pass:3, total:5 },
      { name:"Policy Mgmt",    pass:5, total:8 },
      { name:"Firmware",       pass:0, total:2 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Ensure Stealth rule exists",               result:"pass", sev:"high",   detail:"Stealth rule blocking direct access to gateway is present and enabled" },
      { id:"CIS-1.2", title:"Ensure Cleanup rule with logging exists",  result:"pass", sev:"medium", detail:"Cleanup rule present with logging enabled" },
      { id:"CIS-1.3", title:"Enable anti-spoofing on all interfaces",  result:"fail", sev:"high",   detail:"Anti-spoofing disabled on DMZ interface — spoof source attacks possible" },
      { id:"CIS-2.1", title:"Restrict GUI access to management subnet", result:"pass", sev:"high",   detail:"SmartConsole access restricted to 10.0.0.0/24 management network" },
    ],
    rulesList:[
      { num:1, name:"Stealth",         aiLabel:"Gateway Protection", action:"drop",   srcZone:"Any",      dstZone:"CP-GW",  srcAddr:"Any",      dstAddr:"GW-Object",  service:"Any",         secProfile:"—",    flags:["STEALTH"] },
      { num:2, name:"VPN-Communities", aiLabel:"Site-to-Site VPN",   action:"accept", srcZone:"Internal", dstZone:"VPN",    srcAddr:"Corp-Net", dstAddr:"Remote-Net", service:"VPN-Traffic", secProfile:"IPS",  flags:[] },
    ],
  },
  {
    id:"NA-007", filename:"Cisco_ASA_5516X_vpn.cfg", hostname:"ASA-5516-VPN", vendor:"Cisco ASA", vendorSlug:"Cisco",
    deviceType:"Firewall", firmware:"ASA 9.18(4)21", firmwareEol:"2026-09-30", firmwareDaysLeft:106,
    auditDate:"28/03/2026", score:44, risk:"High", rulesTotal:91,
    findings:{ critical:3, high:5, medium:7, low:2 },
    cisPass:15, cisFail:12, cisTotal:32, interfaces:6, vpnTunnels:14, netObjects:88, natRules:16,
    allowRules:91, allowAnyService:22, utmCoverage:55,
    auditSummary:"Cisco ASA 5516-X VPN gateway audit completed. Score 44/100 (High risk). IKEv1 enabled on 9 of 14 VPN tunnels. Split tunnelling active. Firmware approaching end-of-support in 106 days. Immediate remediation required for 3 critical findings.",
    permissiveRules:6, anySrcRules:3, dupRules:1, shadowedRules:0, disabledRules:4, consolCandidates:0, dnsAnomalies:1, rulesNoLog:24, anyServiceRules:22,
    positiveControls:[
      { title:"AAA Authentication Configured",  desc:"RADIUS/TACACS+ authentication enforced for all administrator logins — no local-only accounts with CLI access." },
      { title:"Syslog Forwarding to SIEM",      desc:"Syslog level 6 (informational) forwarding active to SIEM collector on management network." },
    ],
    cisDomains:[
      { name:"Access Control", pass:4, total:8 },
      { name:"Management",     pass:3, total:6 },
      { name:"VPN Security",   pass:4, total:10 },
      { name:"Logging",        pass:2, total:4 },
      { name:"Policy Mgmt",    pass:2, total:4 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Disable IKEv1 for all VPN tunnels",             result:"fail", sev:"high",   detail:"IKEv1 active on 9 of 14 IPsec tunnel-groups — deprecated protocol" },
      { id:"CIS-1.2", title:"Disable split tunnelling for remote access VPN", result:"fail", sev:"high",   detail:"Split tunnelling enabled for all AnyConnect groups" },
      { id:"CIS-1.3", title:"Enforce AES-256 for all IPsec phase-2",         result:"fail", sev:"high",   detail:"3DES still in phase-2 proposal of 4 tunnel groups" },
      { id:"CIS-2.1", title:"Disable HTTP server if not required",           result:"fail", sev:"medium", detail:"HTTP management enabled on inside interface — should be HTTPS only" },
    ],
    rulesList:[
      { num:1, name:"Outside-to-DMZ", aiLabel:"Web Server Access", action:"permit", srcZone:"outside", dstZone:"DMZ",    srcAddr:"any",     dstAddr:"WebServers", service:"https", secProfile:"—", flags:[] },
      { num:2, name:"Split-Tunnel",   aiLabel:"VPN Split Tunnel",  action:"permit", srcZone:"vpn",     dstZone:"inside", srcAddr:"VPN-Pool",dstAddr:"Corp-Net",  service:"any",   secProfile:"—", flags:["SPLIT"] },
    ],
  },
  {
    id:"NA-008", filename:"FortiGate_100F_Nairobi_HQ.conf", hostname:"FG-100F-HQ", vendor:"FortiGate", vendorSlug:"FortiGate",
    deviceType:"Firewall", firmware:"v7.4.4-build2662", firmwareEol:"2028-09-30", firmwareDaysLeft:837,
    auditDate:"15/03/2026", score:85, risk:"Low", rulesTotal:32,
    findings:{ critical:0, high:1, medium:2, low:4 },
    cisPass:31, cisFail:3, cisTotal:36, interfaces:18, vpnTunnels:4, netObjects:64, natRules:8,
    allowRules:32, allowAnyService:2, utmCoverage:97,
    auditSummary:"FortiGate 100F HQ audit completed. Score 85/100 (Low risk — Best performer in fleet). 32 rules analyzed. Excellent security posture with 97% UTM coverage. 3 minor CIS benchmark findings require attention.",
    permissiveRules:1, anySrcRules:0, dupRules:0, shadowedRules:0, disabledRules:1, consolCandidates:0, dnsAnomalies:0, rulesNoLog:0, anyServiceRules:2,
    positiveControls:[
      { title:"All Rules Have Security Profiles",      desc:"100% of allow rules carry anti-virus, web filter, and IPS security profiles — comprehensive UTM coverage." },
      { title:"FortiGuard Subscriptions Current",      desc:"All FortiGuard security subscriptions (AV, IPS, Web Filter, DNS) active and up-to-date." },
      { title:"SD-WAN Performance Monitoring Active",  desc:"SD-WAN health checks monitoring all WAN links — automatic failover configured." },
      { title:"Zero-Trust Network Access Configured",  desc:"ZTNA access proxy configured for application access, replacing legacy VPN for internal resources." },
    ],
    cisDomains:[
      { name:"Access Control", pass:7, total:7 },
      { name:"Management",     pass:6, total:6 },
      { name:"VPN Security",   pass:9, total:10 },
      { name:"Logging",        pass:4, total:4 },
      { name:"Policy Mgmt",    pass:5, total:9 },
    ],
    cisChecks:[
      { id:"CIS-1.1", title:"Default deny-all at end of policy chain",       result:"pass", sev:"high",   detail:"Explicit deny-all with logging as final rule in all VDOM policies" },
      { id:"CIS-1.2", title:"All rules have comments",                       result:"fail", sev:"low",    detail:"3 rules missing business-justification comments" },
      { id:"CIS-1.3", title:"Enable logging on all accept rules",            result:"pass", sev:"high",   detail:"All 32 accept rules have logging enabled" },
      { id:"CIS-2.1", title:"Restrict admin access to management VDOM only", result:"pass", sev:"high",   detail:"Management VDOM configured; production VDOMs have no admin access" },
      { id:"CIS-2.2", title:"Admin idle timeout ≤ 10 minutes",              result:"fail", sev:"medium", detail:"Admin timeout set to 20 minutes — reduce to 10 minutes" },
    ],
    rulesList:[
      { num:1, name:"LAN-Internet", aiLabel:"Outbound Internet Access", action:"accept", srcZone:"LAN",   dstZone:"WAN", srcAddr:"LAN_All",    dstAddr:"all", service:"ALL",              secProfile:"UTM-Strict", flags:[] },
      { num:2, name:"Guest-WiFi",   aiLabel:"Guest WLAN Internet",      action:"accept", srcZone:"GUEST", dstZone:"WAN", srcAddr:"Guest-Pool", dstAddr:"all", service:"HTTP,HTTPS,DNS",    secProfile:"Guest-UTM",  flags:[] },
    ],
  },
];

export class NetworkAuditService {
  // ── Rule Sets ──────────────────────────────────────────────────────────────
  getRuleSets(tenantId: string): RuleSet[] { return [...tenantRuleSets(tenantId).values()]; }
  getRuleSet(tenantId: string, id: string): RuleSet | undefined { return tenantRuleSets(tenantId).get(id); }

  // ── Rules ──────────────────────────────────────────────────────────────────
  getRules(tenantId: string, ruleSetId?: string, anomaly?: AnomalyType): FirewallRule[] {
    let list = [...tenantRules(tenantId).values()];
    if (ruleSetId) list = list.filter(r => r.ruleSetId === ruleSetId);
    if (anomaly)   list = list.filter(r => r.anomalies.includes(anomaly));
    return list.sort((a, b) => a.priority - b.priority);
  }
  getRule(tenantId: string, id: string): FirewallRule | null {
    return tenantRules(tenantId).get(id) ?? null;
  }
  updateRule(tenantId: string, id: string, data: Partial<Omit<FirewallRule,"id"|"createdAt">>): FirewallRule | null {
    const r = tenantRules(tenantId).get(id);
    if (!r) return null;
    Object.assign(r, data, { updatedAt: new Date().toISOString().slice(0, 10) });
    return r;
  }

  // ── Anomaly detection ──────────────────────────────────────────────────────
  detectAnomalies(tenantId: string) {
    const rules = [...tenantRules(tenantId).values()];
    const findings = { "any-any":0, "overly-permissive":0, "redundant":0, "shadowed":0, "unused":0, "conflict":0, total:0 };
    rules.forEach(r => r.anomalies.forEach(a => { findings[a]++; findings.total++; }));
    const critical = rules.filter(r => r.anomalies.some(a => ["any-any","overly-permissive"].includes(a)));
    return { findings, criticalRules: critical.length, highRiskRules: rules.filter(r=>r.riskScore>70).length };
  }

  // ── Change management ──────────────────────────────────────────────────────
  getChanges(tenantId: string, ruleSetId?: string): RuleChange[] {
    const list = tenantChanges(tenantId);
    return ruleSetId ? list.filter(c => c.ruleSetId === ruleSetId) : list;
  }
  addChange(tenantId: string, data: Omit<RuleChange,"id">): RuleChange {
    const change: RuleChange = { ...data, id: randomUUID() };
    tenantChanges(tenantId).push(change);
    return change;
  }

  // ── Zone matrix ────────────────────────────────────────────────────────────
  getZoneMatrix(tenantId: string): ZoneMatrix[] { return tenantZones(tenantId); }
  getZonePolicies(tenantId: string, src: string, dst: string): ZoneMatrix | undefined {
    return tenantZones(tenantId).find(z => z.srcZone === src && z.dstZone === dst);
  }

  // ── Net Auditor — device config audit reports ──────────────────────────────
  getAudits(tenantId: string): NetAuditRecord[] {
    return tenantId === "1" ? SEED_AUDITS : [];
  }
  getAuditById(tenantId: string, id: string): NetAuditRecord | null {
    return this.getAudits(tenantId).find(a => a.id === id) ?? null;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  getStats(tenantId: string) {
    const rules    = [...tenantRules(tenantId).values()];
    const ruleSets = [...tenantRuleSets(tenantId).values()];
    const zones    = tenantZones(tenantId);
    const changes  = tenantChanges(tenantId);
    return {
      totalRules:     rules.length,
      totalRuleSets:  ruleSets.length,
      anomalyCount:   rules.filter(r=>r.anomalies.length>0).length,
      criticalRules:  rules.filter(r=>r.riskScore>=90).length,
      unusedRules:    rules.filter(r=>r.anomalies.includes("unused")).length,
      anyAnyRules:    rules.filter(r=>r.anomalies.includes("any-any")).length,
      zoneViolations: zones.filter(z=>z.compliance==="violation").length,
      recentChanges:  changes.length,
      avgCompliance:  Math.round(ruleSets.reduce((s,rs)=>s+rs.complianceScore,0)/ruleSets.length),
    };
  }
}
export const networkAuditService = new NetworkAuditService();

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

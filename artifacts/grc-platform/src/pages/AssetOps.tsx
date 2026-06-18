import { useState, useMemo, useEffect } from "react";
import { useCaasmStats, useCaasmAssets } from "@/hooks/useGrcApi";
import { SubNav, ModuleHeader, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { getStoredToken } from "@/lib/auth-utils";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useOrg } from "@/context/OrgContext";

type Category   = "Server"|"Workstation"|"IoT"|"Mobile"|"Network"|"OT"|"Cloud"|"Container"|"Unknown"|"SaaS"|"Security"|"Identity";
type Confidence = "High"|"Medium"|"Low";
type RiskLevel  = "Critical"|"High"|"Medium"|"Low";
type EolStatus  = "Current"|"Warning"|"EOL"|"EOS"|"Unknown";

interface IotDevice {
  id:string; name:string; type:string; icon:string;
  manufacturer:string; model:string; firmware:string; fwDate:string;
  ip:string; segment:string; risk:RiskLevel; status:string;
  lastSeen:string; openPorts:number[]; protocols:string[];
  cves:{id:string;sev:string;cvss:number;desc:string}[];
  commPeers:string[]; isolationAction:string; location:string;
  confidence:Confidence;
}

// ── Theme ──────────────────────────────────────────────────────────────────────
const NAV = "#1E3A5F", EME = "#065F46", RED = "#DC2626", AMB = "#D97706";
const BLU = "#1D4ED8", CYN = "#0891B2", PRP = "#7C3AED", GRN = "#059669";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background:"var(--card)", borderRadius:12, border:"1px solid var(--border)",
  boxShadow:"0 2px 12px rgba(0,0,0,0.40)", ...extra,
});

// ── Data sources ───────────────────────────────────────────────────────────────
const dataSources: any[] = [];

const categories: { label: Category; count: number; color: string }[] = [
  { label:"Workstation", count:7150, color:NAV  },
  { label:"Server",      count:1058, color:EME  },
  { label:"Mobile",      count:1975, color:CYN  },
  { label:"Network",     count:623,  color:PRP  },
  { label:"IoT",         count:380,  color:AMB  },
  { label:"Cloud",       count:390,  color:GRN  },
  { label:"OT",          count:248,  color:"#4338CA" },
  { label:"Container",   count:82,   color:"#0891B2" },
  { label:"SaaS",        count:142,  color:CYN  },
  { label:"Unknown",     count:623,  color:RED  },
];
const totalCatAssets = categories.reduce((s, c) => s + c.count, 0);

// ── Inventory ──────────────────────────────────────────────────────────────────
interface AssetEntry {
  id:string; hostname:string; category:Category; confidence:Confidence;
  os:string; lastSeen:string; antivirus:string; ip:string; manufacturer:string;
  agentVersion:string; sources:number; managed:boolean; risk:RiskLevel;
  dept:string; exposureScore:number; vulnCount:number; critVulns:number; tags:string[];
}

// ── Bulk inventory generator ────────────────────────────────────────────────
function ri(n: number): number {
  let v = (n ^ 0xdeadbeef) >>> 0;
  v = (Math.imul(v ^ (v >>> 16), 0x45d9f3b)) >>> 0;
  v = (Math.imul(v ^ (v >>> 13), 0xc2b2ae35)) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}
function pick(a: string[], s: number): string { return a[ri(s) % a.length]; }

const G_MFR: Record<string, string[]> = {
  Workstation:["Dell","HP","Lenovo","Apple","ASUS","Microsoft Surface"],
  Server:["Dell PowerEdge","HP ProLiant","AWS EC2","Azure VM","Supermicro","GCP Compute"],
  Mobile:["Apple","Samsung","Google","OnePlus","Motorola"],
  Network:["Cisco","Palo Alto","Juniper","Fortinet","Aruba","Ubiquiti"],
  IoT:["HID","Honeywell","Axis","Bosch","Hikvision","Verkada"],
  Cloud:["AWS EC2","Azure VM","GCP Compute","AWS Fargate","Azure Functions"],
  OT:["Siemens","Rockwell","ABB","Schneider Electric","Emerson"],
  Container:["GKE","AKS","EKS","OpenShift","Rancher"],
  SaaS:["Microsoft","Google","Atlassian","ServiceNow","Zoom","SAP"],
  Security:["Splunk","CrowdStrike","Palo Alto","SentinelOne","Darktrace","Tenable"],
  Identity:["Okta","Microsoft","Ping Identity","CyberArk","SailPoint","ForgeRock"],
  Unknown:["Unknown"],
};
const G_OS: Record<string, string[]> = {
  Workstation:["Windows 11 23H2","Windows 10 22H2","macOS 14 Sonoma","macOS 13 Ventura","Ubuntu 22.04","Windows 7 SP1","Windows 8.1","macOS 12 Monterey","macOS 11 Big Sur"],
  Server:["Windows Server 2022","Ubuntu 22.04 LTS","Rocky Linux 9","RHEL 9","Amazon Linux 2023","Debian 12","Windows Server 2012 R2","CentOS 7","Ubuntu 18.04 LTS"],
  Mobile:["iOS 17.4","iOS 16.7","Android 14","Android 13","iPadOS 17.4","iOS 14.8","Android 11"],
  Network:["Cisco IOS 17.x","Palo Alto PAN-OS 11","Juniper JunOS","FortiOS 7.4","Cisco NX-OS","Cisco IOS 15.2","Cisco ASA 9.x"],
  IoT:["Embedded / RTOS","FreeRTOS","Linux Embedded","Proprietary Firmware","Unknown"],
  Cloud:["Amazon Linux 2023","Ubuntu 22.04 LTS","Windows Server 2022","Container OS","Debian 12"],
  OT:["Siemens S7-300","Rockwell Studio 5000","SCADA Linux","PLC Firmware","Unknown"],
  Container:["containerd / k8s 1.28","k8s 1.29","Docker 24.x","Podman 4.x","OCI Runtime"],
  SaaS:["Cloud SaaS","SaaS Platform","Web Service"],
  Security:["SIEM Cloud","EDR Platform","Security Cloud","XDR Platform","SOAR Cloud"],
  Identity:["Identity Cloud","IAM Platform","SSO Cloud","Directory Service","PAM Platform"],
  Unknown:["Unknown","N/A","Unidentified"],
};
const G_DEPT = ["IT Ops","Engineering","Finance","Sales","HR","Marketing","Operations","Security","Data","Facilities","Legal","Management"];
const G_LS   = ["Active","1 hr ago","4 hrs ago","12 hrs ago","1 day ago","2 days ago","3 days ago","1 week ago","2 weeks ago","30 days ago"];
const G_IPS  = ["10.10","10.20","10.30","172.16.0","172.16.5","192.168.1","192.168.2","10.40","10.50","10.60"];

function genHostname(cat: Category, s: number, i: number): string {
  const n4 = String(i+1).padStart(4,"0");
  switch(cat) {
    case "Workstation": return `${pick(["ws","lt","dt","pc","mb"],s)}-${pick(["dell","hp","len","apple","ms"],s*3)}-${n4.slice(-3)}.acme.corp`;
    case "Server":      return `${pick(["srv","prod","dev","app","db","api","web"],s)}-${pick(["01","02","03","node","core"],s*3)}-${n4}.acme.int`;
    case "Mobile":      return `${pick(["iPhone","Galaxy","Pixel","iPad","Moto"],s)}-${String(ri(s*7)%999+1).padStart(3,"0")}`;
    case "Network":     return `${pick(["sw","rtr","ap","fw","lb","vpn"],s)}-${pick(["core","edge","floor","dmz","dist"],s*3)}${ri(s*7)%8+1}-${n4.slice(-2)}.acme.int`;
    case "IoT":         return `iot-${pick(["cam","hvac","badge","sensor","lock","prtr"],s)}-${String(ri(s*3)%999+1).padStart(3,"0")}`;
    case "Cloud":       return `${pick(["vm","ec2","az","gcp","fn"],s)}-${pick(["prod","dev","stg","dr","test"],s*3)}-${n4.slice(-2)}.cloud`;
    case "OT":          return `${pick(["plc","hmi","rtu","scada","dcs"],s)}-${pick(["plant","floor","zone","prod"],s*3)}${ri(s*7)%8+1}-${n4.slice(-2)}`;
    case "Container":   return `${pick(["pod","node","svc","deploy","ctr"],s)}-${pick(["prod","dev","stg","test"],s*3)}-${n4.slice(-2)}`;
    case "SaaS":        return `saas-${pick(["app","svc","mgmt","ent","corp"],s)}-${String(ri(s*13)%999+1).padStart(3,"0")}`;
    case "Security":    return `sec-${pick(["siem","edr","soar","xdr","dlp"],s)}-${pick(["prod","cloud","corp","ent"],s*3)}-${n4.slice(-3)}`;
    case "Identity":    return `iam-${pick(["sso","dir","pam","mfa","idp"],s)}-${pick(["prod","cloud","corp","ent"],s*3)}-${n4.slice(-3)}`;
    default:            return `unk-${String(ri(s*17)%999).padStart(3,"0")}-${n4.slice(-2)}`;
  }
}

const SEED_ASSETS: AssetEntry[] = [];

function buildInventory(): AssetEntry[] {
  const TARGETS: [Category,number][] = [];
  const result = [...SEED_ASSETS];
  const have: Partial<Record<Category,number>> = {};
  for (const a of SEED_ASSETS) have[a.category] = (have[a.category]??0)+1;
  let id = 200;
  for (const [cat, target] of TARGETS) {
    const need = target - (have[cat]??0);
    const mfrs = G_MFR[cat]??["Unknown"];
    const oses = G_OS[cat]??["Unknown"];
    for (let i = 0; i < need; i++, id++) {
      const s = id;
      const r100 = ri(s*11)%100;
      const isHR = cat==="OT"||cat==="Unknown"||cat==="IoT";
      const risk: RiskLevel = isHR
        ? (r100<12?"Critical":r100<40?"High":r100<72?"Medium":"Low")
        : (r100<3?"Critical":r100<18?"High":r100<55?"Medium":"Low");
      const managed = cat==="Cloud"||cat==="SaaS" ? true
                    : cat==="Unknown"||cat==="OT" ? ri(s*13)%10<2
                    : ri(s*13)%10>2;
      const conf: Confidence = managed?(ri(s*17)%10>2?"High":"Medium"):(ri(s*17)%10>5?"Medium":"Low");
      const ip = (cat==="SaaS"||cat==="Security"||cat==="Identity"||cat==="Cloud")&&!["cdn-cloudflare","dns-route53"].includes(genHostname(cat,s,i))?"—":cat==="Mobile"?"DHCP":`${pick(G_IPS,s*19)}.${ri(s*23)%254+1}`;
      const exp = risk==="Critical"?70+ri(s)%25:risk==="High"?45+ri(s*3)%25:risk==="Medium"?20+ri(s*5)%25:ri(s*7)%20;
      const vulns = risk==="Critical"?ri(s)%15+3:risk==="High"?ri(s)%8+1:ri(s)%4;
      result.push({
        id:`AST-${String(s).padStart(4,"0")}`,
        hostname:genHostname(cat,s,i),
        category:cat, confidence:conf,
        os:pick(oses,s*5), lastSeen:pick(G_LS,s*29),
        antivirus:cat==="Network"||cat==="IoT"||cat==="OT"||cat==="SaaS"||cat==="Security"||cat==="Identity"?"N/A":managed?"CrowdStrike":"None",
        ip, manufacturer:pick(mfrs,s*3),
        agentVersion:managed?`10.${ri(s)%9999}.${ri(s*3)%9999}.${ri(s*7)%9999}`:"—",
        sources:ri(s*31)%5+1, managed, risk, dept:pick(G_DEPT,s*7),
        exposureScore:exp, vulnCount:vulns,
        critVulns:risk==="Critical"?ri(s*3)%4+1:risk==="High"?ri(s*3)%2:0,
        tags:[cat.toLowerCase(),managed?"managed":"unmanaged"],
      });
    }
  }
  return result;
}
const inventory = buildInventory();

// ── EOL / EOS Detection ──────────────────────────────────────────────────────────
interface EolMatch { label:string; eolDate:string; status:EolStatus; severity:"critical"|"high"|"medium" }
const EOL_PATTERNS: { re:RegExp; match:EolMatch }[] = [
  { re:/Windows 7/i,          match:{label:"Windows 7 SP1",      eolDate:"Jan 2020",status:"EOL",severity:"critical"} },
  { re:/Windows 8\.1/i,       match:{label:"Windows 8.1",        eolDate:"Jan 2023",status:"EOL",severity:"critical"} },
  { re:/macOS 11/i,           match:{label:"macOS 11 Big Sur",   eolDate:"Sep 2024",status:"EOL",severity:"high"} },
  { re:/macOS 12/i,           match:{label:"macOS 12 Monterey",  eolDate:"Sep 2025",status:"EOS",severity:"medium"} },
  { re:/Server 2012/i,        match:{label:"Windows Server 2012",eolDate:"Oct 2023",status:"EOL",severity:"critical"} },
  { re:/Ubuntu 18/i,          match:{label:"Ubuntu 18.04 LTS",   eolDate:"Apr 2023",status:"EOL",severity:"critical"} },
  { re:/CentOS 7/i,           match:{label:"CentOS 7",           eolDate:"Jun 2024",status:"EOL",severity:"high"} },
  { re:/Android 11/i,         match:{label:"Android 11",         eolDate:"Mar 2023",status:"EOL",severity:"high"} },
  { re:/iOS 14/i,             match:{label:"iOS 14",             eolDate:"Oct 2023",status:"EOL",severity:"high"} },
  { re:/Cisco IOS 15/i,       match:{label:"Cisco IOS 15.x",     eolDate:"Jan 2022",status:"EOL",severity:"high"} },
  { re:/Cisco ASA 9/i,        match:{label:"Cisco ASA 9.x",      eolDate:"Dec 2024",status:"EOS",severity:"medium"} },
  { re:/Siemens S7-300/i,     match:{label:"Siemens S7-300",     eolDate:"Oct 2023",status:"EOL",severity:"critical"} },
];
function detectEol(os:string): EolMatch|null {
  for (const p of EOL_PATTERNS) if(p.re.test(os)) return p.match;
  return null;
}

// ── Installed Software Generator ─────────────────────────────────────────────────
const SW_BY_CAT: Record<string,string[]> = {
  Workstation:"Microsoft 365,Chrome 124,Teams,Slack,Zoom,Adobe Reader,Git 2.44,Python 3.12,VSCode,7-Zip,VLC,OneDrive,Notepad++,Docker Desktop,Postman".split(","),
  Server:     "nginx 1.26,PostgreSQL 16,Redis 7.2,Node.js 20,OpenJDK 21,Git 2.44,Python 3.12,Ansible,Terraform,Docker 25,Prometheus,Grafana,Elasticsearch,MySQL 8.0".split(","),
  Cloud:      "AWS CLI 2,kubectl 1.29,Terraform 1.7,Docker 25,Python 3.12,Node.js 20,Prometheus,Datadog Agent,Helm 3.14,AWS SSM Agent".split(","),
  Container:  "containerd 1.7,Kubernetes 1.29,Helm 3.14,Istio 1.21,Prometheus,Fluentd,Calico,cert-manager,OPA Gatekeeper,Falco".split(","),
  Mobile:     "MS Authenticator,Teams,Outlook,OneDrive,CrowdStrike,InTune Portal,Chrome,Slack,Zoom,1Password,Company Portal".split(","),
  Network:    "SNMP Agent,NetFlow Exporter,Syslog Forwarder,SSH Server,NTP Client,RESTCONF,gNMI Telemetry".split(","),
  IoT:        "Embedded FW,MQTT Client,TLS 1.2 Stack,OTA Updater,CoAP Stack".split(","),
  OT:         "SCADA Runtime,PLC Firmware,Historian Client,OPC-UA Server,Modbus Stack,DNP3 Stack".split(","),
  SaaS:       "SAML 2.0,SCIM 2.0,OAuth 2.0,REST API Client,Webhook Relay,SIEM Connector".split(","),
  Unknown:    "Unknown Software,Unidentified Process".split(","),
};
function getInstalledSoftware(a: AssetEntry): string[] {
  const pool = SW_BY_CAT[a.category] ?? SW_BY_CAT.Unknown;
  const seed = hashCode(a.id + "sw");
  const cnt  = 4 + ri(seed) % 5;
  const out: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < cnt; i++) {
    let idx = ri(seed + i * 7) % pool.length, t = 0;
    while (used.has(idx) && t++ < pool.length) idx = (idx+1) % pool.length;
    used.add(idx); out.push(pool[idx]);
  }
  return out;
}

// ── Attack surface ─────────────────────────────────────────────────────────────
const attackSurface: any[] = [];

// ── IoT/OT Static Device Inventory ────────────────────────────────────────────


const statusMap: Record<string,string> = { ok:EME, warning:AMB, critical:RED };
const confidenceColor: Record<Confidence,{bg:string;color:string;border:string}> = {
  High:  {bg:"rgba(34,197,94,0.08)",  color:EME, border:"#A7F3D0"},
  Medium:{bg:"rgba(245,158,11,0.06)", color:AMB, border:"#FDE68A"},
  Low:   {bg:"rgba(239,68,68,0.06)",  color:RED, border:"#FECACA"},
};
const catColor: Record<string,string> = {
  Server:NAV, Workstation:NAV, IoT:AMB, Mobile:CYN, Network:PRP, OT:"#4338CA", Cloud:GRN, Container:CYN, Unknown:RED, SaaS:"#0891B2", Security:"#DC2626", Identity:"#7C3AED",
};

// ── Helper components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color=NAV, icon }: { label:string; value:string|number; sub?:string; color?:string; icon:string }) {
  return (
    <div style={card({ padding:"16px 20px", display:"flex", alignItems:"center", gap:14 })}>
      <div style={{ width:40, height:40, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:NAV, letterSpacing:"-0.5px" }}>{value}</div>
        <div style={{ fontSize:11, fontWeight:700, color:"#6B7280" }}>{label}</div>
        {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level:string }) {
  const map: Record<string,{bg:string;color:string;border:string}> = {
    Critical:{bg:"rgba(239,68,68,0.06)",  color:RED, border:"#FECACA"},
    High:    {bg:"rgba(245,158,11,0.06)", color:AMB, border:"#FDE68A"},
    Medium:  {bg:"rgba(59,130,246,0.12)", color:BLU, border:"#BFDBFE"},
    Low:     {bg:"rgba(34,197,94,0.08)",  color:EME, border:"#A7F3D0"},
  };
  const s = map[level] ?? {bg:"var(--border)",color:"#6B7280",border:"rgba(255,255,255,0.1)"};
  return <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{level}</span>;
}

function SourceCluster({ count }: { count:number }) {
  const shown = Math.min(count, 5);
  const srcColors = [BLU, PRP, CYN, AMB, EME, RED, NAV];
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      {Array.from({ length:shown }).map((_,i) => (
        <div key={i} style={{ width:18, height:18, borderRadius:"50%", background:srcColors[i%srcColors.length], border:"2px solid white", marginLeft:i>0?-6:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"var(--card)", fontWeight:800, position:"relative", zIndex:shown-i }}>
          {["⬡","◈","◎","◆","◉","⚙","◑"][i]}
        </div>
      ))}
      {count>5 && <span style={{ marginLeft:4, fontSize:9, fontWeight:700, color:"var(--muted-foreground)" }}>+{count-5}</span>}
      <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:NAV }}>{count}</span>
    </div>
  );
}

function Chip({ children, onClick }: { children:React.ReactNode; onClick:()=>void }) {
  const [hov, setHov] = useState(false);
  return (
    <span onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ cursor:"pointer", color:hov?CYN:"var(--foreground)", background:hov?"rgba(8,145,178,0.08)":"transparent",
        borderBottom:`1px dashed ${hov?CYN:"rgba(148,163,184,0.3)"}`, borderRadius:3, padding:"0 2px",
        transition:"all 0.15s", fontFamily:"'JetBrains Mono',monospace", fontSize:"inherit" }}>
      {children}
    </span>
  );
}

function EolBadge({ status, date }: { status:EolStatus; date?:string|null }) {
  const map: Record<EolStatus,{bg:string;color:string;border:string;label:string}> = {
    Current:{ bg:"rgba(34,197,94,0.08)",   color:EME, border:"#A7F3D0", label:"Current" },
    Warning:{ bg:"rgba(245,158,11,0.06)",  color:AMB, border:"#FDE68A", label:"EOL Soon" },
    EOL:    { bg:"rgba(239,68,68,0.06)",   color:RED, border:"#FECACA", label:"EOL" },
    EOS:    { bg:"rgba(239,68,68,0.06)",   color:RED, border:"#FECACA", label:"EOS" },
    Unknown:{ bg:"var(--secondary)", color:"#6B7280", border:"rgba(255,255,255,0.1)", label:"Unknown" },
  };
  const s = map[status];
  return (
    <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>
      {s.label}{date&&status!=="Current"?` · ${date}`:""}</span>
  );
}

// ── Filter builder ─────────────────────────────────────────────────────────────
interface FilterCondition { field:string; op:string; value:string; }
const FILTER_FIELDS = ["category","risk","confidence","dept","managed","os","manufacturer"];
const FILTER_OPS    = ["equals","contains","not equals"];

function FilterBuilder({ conditions, onChange }: { conditions:FilterCondition[]; onChange:(c:FilterCondition[])=>void }) {
  const add    = () => onChange([...conditions, { field:"risk", op:"equals", value:"Critical" }]);
  const remove = (i:number) => onChange(conditions.filter((_,j)=>j!==i));
  const update = (i:number, k:keyof FilterCondition, v:string) => onChange(conditions.map((c,j)=>j===i?{...c,[k]:v}:c));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {conditions.map((c,i) => (
        <div key={i} style={{ display:"flex", gap:6, alignItems:"center" }}>
          {i>0 && <span style={{ fontSize:10, fontWeight:800, color:BLU, width:28 }}>AND</span>}
          {i===0 && <span style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", width:28 }}>WHERE</span>}
          <select value={c.field} onChange={e=>update(i,"field",e.target.value)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, fontFamily:"inherit" }}>
            {FILTER_FIELDS.map(f=><option key={f}>{f}</option>)}
          </select>
          <select value={c.op} onChange={e=>update(i,"op",e.target.value)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, fontFamily:"inherit" }}>
            {FILTER_OPS.map(o=><option key={o}>{o}</option>)}
          </select>
          <input value={c.value} onChange={e=>update(i,"value",e.target.value)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:120, fontFamily:"inherit" }} />
          <button onClick={()=>remove(i)} style={{ width:22, height:22, borderRadius:4, border:"1px solid var(--border)", background:"var(--card)", cursor:"pointer", color:RED, fontWeight:800, fontSize:13 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf:"flex-start", padding:"4px 10px", borderRadius:6, border:`1px dashed ${BLU}`, background:"rgba(59,130,246,0.12)", color:BLU, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Add condition</button>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────────
function hashCode(str:string):number {
  let h=0;
  for(let i=0;i<str.length;i++) h=(Math.imul(31,h)+str.charCodeAt(i))|0;
  return Math.abs(h);
}

// ── Detail Popup data types ────────────────────────────────────────────────────
interface PopupState { type:string; title:string; data:Record<string,unknown>; }

// ── Detail Popup ───────────────────────────────────────────────────────────────
function DetailPopup({ popup, onClose, allAssets }: { popup:PopupState; onClose:()=>void; allAssets:AssetEntry[] }) {
  const sHdr = (label:string) => (
    <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", marginBottom:8, textTransform:"uppercase" as const }}>{label}</div>
  );
  const row = (k:string, v:React.ReactNode) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11, gap:8 }}>
      <span style={{ color:"var(--muted-foreground)", fontWeight:600, whiteSpace:"nowrap" as const }}>{k}</span>
      <span style={{ color:"var(--foreground)", fontWeight:700, textAlign:"right" as const }}>{v}</span>
    </div>
  );

  const renderContent = () => {
    const { type, data } = popup;

    if (type === "ip") {
      const ip = data.ip as string;
      const isPublic = !ip.startsWith("10.") && !ip.startsWith("192.168.") && !ip.startsWith("172.16.") && ip !== "DHCP" && ip !== "—";
      const subnet = ip.includes(".")?`${ip.split(".").slice(0,3).join(".")}.0/24`:"N/A";
      const vlanId  = ip.startsWith("10.10")?"VLAN-10 (Corporate)":ip.startsWith("10.30")?"VLAN-30 (Cloud-VPC)":ip.startsWith("192.168.50")?"VLAN-100 (IoT Isolated)":ip.startsWith("192.168.100")?"VLAN-200 (OT Isolated)":"VLAN-10 (Corporate)";
      const openPorts = isPublic ? ["443","80","8080"] : ["445","135","139","3389","5985"];
      const related = allAssets.filter(a=>a.ip!=="DHCP"&&a.ip!=="—"&&a.ip.split(".").slice(0,3).join(".")===ip.split(".").slice(0,3).join(".")&&a.ip!==ip).slice(0,4);
      const h = hashCode(ip);
      return (
        <div>
          <div style={{ background:"rgba(8,145,178,0.08)", border:"1px solid rgba(8,145,178,0.25)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:24, fontWeight:800, color:CYN, marginBottom:4 }}>{ip}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{isPublic?"Public IP Address":"Private IP Address (RFC 1918)"}</div>
          </div>
          {sHdr("Network Info")}
          {row("Subnet", <Chip onClick={()=>{}}>{subnet}</Chip>)}
          {row("VLAN", vlanId)}
          {row("Gateway", `${ip.split(".").slice(0,3).join(".")}.1`)}
          {row("PTR Record", `${(data.hostname as string)||ip.split(".").reverse().join(".")}.acme.int`)}
          {row("DNS (Primary)",   "10.0.0.53 (Internal)")}
          {row("DNS (Secondary)", "10.0.0.54 (Internal)")}
          {row("Ping Latency", `${2+(h%8)} ms`)}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Open Ports")}
          <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5, marginBottom:14 }}>
            {openPorts.map(p=>(
              <span key={p} style={{ background:"rgba(29,78,216,0.1)", color:BLU, border:"1px solid rgba(59,130,246,0.25)", borderRadius:4, padding:"3px 9px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{p}</span>
            ))}
          </div>
          {sHdr("Threat Intelligence")}
          {row("Reputation", <span style={{ color:EME, fontWeight:800 }}>✓ CLEAN</span>)}
          {row("Seen in Threat Feeds", "No")}
          {row("IP Geolocation", isPublic?"United States — AWS us-east-1":"Private / Internal Network")}
          {related.length>0&&<>
            <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
            {sHdr(`Other Assets on ${subnet} (${related.length})`)}
            {related.map(a=>(
              <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <Mono>{a.ip}</Mono>
                <span style={{ flex:1, fontSize:10, fontWeight:600, color:"var(--foreground)" }}>{a.hostname.split(".")[0]}</span>
                <RiskBadge level={a.risk} />
              </div>
            ))}
          </>}
        </div>
      );
    }

    if (type === "vlan") {
      const vid = data.vlanId as string;
      const vmap: Record<string,{purpose:string;gw:string;dhcp:string;devices:number;zone:string;acl:string[]}> = {
        "VLAN-10":{ purpose:"Corporate Workstations & Servers",  gw:"10.10.0.1",      dhcp:"10.10.0.100–200", devices:47, zone:"Internal Corporate", acl:["Allow TCP 443 outbound","Allow TCP 80 outbound","Deny all to VLAN-100","Deny all to VLAN-200"] },
        "VLAN-30":{ purpose:"Cloud VPC Interconnect",           gw:"10.30.0.1",      dhcp:"10.30.0.10–50",   devices:12, zone:"Cloud DMZ",          acl:["Allow TCP 443 bidirectional","Deny all to VLAN-200"] },
        "VLAN-100":{ purpose:"IoT Device Isolation",            gw:"192.168.50.1",   dhcp:"192.168.50.10–99",devices:23, zone:"IoT Isolated",       acl:["Deny all to Corporate","Allow TCP 8883 to IoT hub","Allow ICMP to gateway only"] },
        "VLAN-200":{ purpose:"OT / Industrial Control Systems", gw:"192.168.100.1",  dhcp:"Static only",     devices:8,  zone:"OT Air-Gap",         acl:["Deny all inbound","Deny all outbound","Allow serial-only via jump server"] },
      };
      const v = vmap[vid] ?? vmap["VLAN-10"];
      return (
        <div>
          <div style={{ background:"rgba(124,58,237,0.08)", border:"1px solid rgba(124,58,237,0.25)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:800, color:PRP, marginBottom:4 }}>{vid}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{v.purpose}</div>
          </div>
          {sHdr("VLAN Configuration")}
          {row("Gateway", <Mono>{v.gw}</Mono>)}
          {row("DHCP Range", <Mono style={{ fontSize:10 }}>{v.dhcp}</Mono>)}
          {row("Device Count", v.devices)}
          {row("Security Zone", v.zone)}
          {row("Segmentation", <span style={{ color:EME, fontWeight:800 }}>✓ Enforced</span>)}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr(`ACL Rules (${v.acl.length})`)}
          {v.acl.map((rule,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ width:16, height:16, borderRadius:4, background:rule.startsWith("Deny")?"rgba(239,68,68,0.1)":"rgba(34,197,94,0.1)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:8, color:rule.startsWith("Deny")?RED:EME, fontWeight:800, flexShrink:0 }}>{rule.startsWith("Deny")?"✗":"✓"}</span>
              <span style={{ fontSize:10, color:"var(--foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{rule}</span>
            </div>
          ))}
        </div>
      );
    }

    if (type === "app") {
      const app = data as {name:string;version:string;publisher:string;eolDate:string|null;eolStatus:EolStatus;category:string;cveCount?:number;latestVersion?:string;installDate:string;fleetCount?:number;license?:string};
      const isOutdated = app.latestVersion && app.latestVersion !== app.version;
      return (
        <div>
          <div style={{ background:"rgba(29,78,216,0.07)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>{app.name}</div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:CYN }}>{app.version}</span>
              {isOutdated && <span style={{ fontSize:9, fontWeight:700, color:AMB, background:"rgba(245,158,11,0.06)", border:"1px solid #FDE68A", borderRadius:4, padding:"1px 6px" }}>UPDATE AVAILABLE</span>}
              <EolBadge status={app.eolStatus} date={app.eolDate} />
            </div>
          </div>
          {sHdr("Software Details")}
          {row("Publisher", app.publisher)}
          {row("Category", app.category)}
          {row("Install Date", app.installDate)}
          {row("License Type", app.license ?? "Commercial")}
          {row("Fleet Presence", <span style={{ color:BLU, fontWeight:800 }}>{app.fleetCount??1} asset{(app.fleetCount??1)!==1?"s":""}</span>)}
          {app.latestVersion && row("Latest Version", <span style={{ color:isOutdated?AMB:EME, fontWeight:800 }}>{app.latestVersion}</span>)}
          {app.eolDate && (
            <>
              <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
              {sHdr("End of Life")}
              {row("EOL / EOS Date", <span style={{ color:app.eolStatus==="EOL"?RED:AMB, fontFamily:"'JetBrains Mono',monospace" }}>{app.eolDate}</span>)}
              {row("Status", <EolBadge status={app.eolStatus} />)}
              {app.eolStatus==="EOL"&&<div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(252,165,165,0.2)", borderRadius:6, padding:"8px 12px", marginTop:8, fontSize:10, color:RED }}>⚠ This software has reached end-of-life and no longer receives security patches. Immediate upgrade required.</div>}
            </>
          )}
          {(app.cveCount??0)>0&&(
            <>
              <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
              {sHdr("Known CVEs")}
              <div style={{ background:"rgba(239,68,68,0.04)", border:"1px solid rgba(252,165,165,0.15)", borderRadius:6, padding:"8px 12px", fontSize:11, color:RED }}>{app.cveCount} CVE{(app.cveCount??0)!==1?"s":""} affecting this version</div>
            </>
          )}
        </div>
      );
    }

    if (type === "cve") {
      const cve = data as {id:string;cvss:number;severity:string;component:string;desc:string;epss?:number;patch?:string;cisaKev?:boolean;published?:string};
      const sc = cve.severity==="Critical"?RED:cve.severity==="High"?AMB:BLU;
      const epss = cve.epss ?? Math.round((cve.cvss/10)*45+Math.random()*15);
      const affected = allAssets.filter(a=>a.vulnCount>0).slice(0,3);
      return (
        <div>
          <div style={{ background:`${sc}0d`, border:`1px solid ${sc}44`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:800, color:sc, marginBottom:4 }}>{cve.id}</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:22, fontWeight:800, color:sc }}>{cve.cvss}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{cve.severity}</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>CVSS v3.1</div>
              </div>
              {cve.cisaKev&&<span style={{ marginLeft:"auto", background:"rgba(239,68,68,0.1)", color:RED, border:"1px solid #FECACA", borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:800 }}>CISA KEV</span>}
            </div>
          </div>
          {sHdr("Vulnerability Details")}
          {row("Component", cve.component)}
          {row("Published", cve.published ?? "2024-01-31")}
          {row("EPSS Score", <span style={{ color:epss>40?RED:AMB, fontFamily:"'JetBrains Mono',monospace" }}>{epss}% exploit probability</span>)}
          {row("Patch Available", cve.patch?<span style={{ color:EME }}>✓ {cve.patch}</span>:<span style={{ color:RED }}>Not yet available</span>)}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Description")}
          <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7, marginBottom:14 }}>{cve.desc}</div>
          {sHdr("Remediation")}
          <div style={{ background:"rgba(34,197,94,0.05)", border:"1px solid rgba(167,243,208,0.15)", borderRadius:6, padding:"8px 12px", fontSize:11, color:EME, marginBottom:12 }}>
            {cve.patch?`Upgrade ${cve.component} to ${cve.patch} or later.`:"Apply vendor advisory mitigations and monitor for patch availability."}
          </div>
          {affected.length>0&&<>
            {sHdr(`Affected Assets (${affected.length})`)}
            {affected.map(a=>(
              <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <Mono style={{ fontSize:9 }}>{a.id}</Mono>
                <span style={{ flex:1, fontSize:10, color:"var(--foreground)" }}>{a.hostname.split(".")[0]}</span>
                <RiskBadge level={a.risk} />
              </div>
            ))}
          </>}
        </div>
      );
    }

    if (type === "dns") {
      const fqdn = data.fqdn as string;
      const ip   = data.ip as string;
      return (
        <div>
          <div style={{ background:"rgba(6,95,70,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:EME, marginBottom:4 }}>{fqdn}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>DNS Record Detail</div>
          </div>
          {sHdr("DNS Records")}
          {row("A Record",    <Mono>{ip}</Mono>)}
          {row("PTR Record",  <Mono>{ip.split(".").reverse().join(".")}.in-addr.arpa</Mono>)}
          {row("CNAME",       "—")}
          {row("TTL",         "300 seconds")}
          {row("DNS Zone",    "acme.int (Internal)")}
          {row("DNS (Primary)",   "10.0.0.53 (dns-primary.acme.int)")}
          {row("DNS (Secondary)", "10.0.0.54 (dns-secondary.acme.int)")}
          {row("Last Change", "2026-06-08")}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Security")}
          {row("DNSSEC", <span style={{ color:AMB }}>Not configured</span>)}
          {row("Split-horizon", <span style={{ color:EME }}>✓ Active</span>)}
        </div>
      );
    }

    if (type === "subnet") {
      const cidr = data.cidr as string;
      const gw   = data.gw as string;
      const net  = cidr.split("/")[0];
      const h    = hashCode(cidr);
      const total = 254, used = 30 + (h % 120);
      return (
        <div>
          <div style={{ background:"rgba(8,145,178,0.07)", border:"1px solid rgba(8,145,178,0.22)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:800, color:CYN, marginBottom:4 }}>{cidr}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{net.startsWith("10.")?"Private — Class A":"Private — Class C"} Subnet</div>
          </div>
          {sHdr("Subnet Info")}
          {row("Network Address", <Mono>{net}</Mono>)}
          {row("Broadcast",       <Mono>{net.split(".").slice(0,3).join(".")}.255</Mono>)}
          {row("Gateway",         <Chip onClick={()=>{}}><span style={{ color:CYN }}>{gw}</span></Chip>)}
          {row("DNS Servers",     "10.0.0.53, 10.0.0.54")}
          {row("IP Utilization",  <span style={{ color:used/total>0.8?RED:used/total>0.5?AMB:EME }}>{used}/{total} ({Math.round(used/total*100)}%)</span>)}
          {row("DHCP Lease Time", "8 hours")}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          <div style={{ height:8, borderRadius:4, background:"var(--input)", overflow:"hidden", marginBottom:6 }}>
            <div style={{ width:`${Math.round(used/total*100)}%`, height:"100%", background:used/total>0.8?RED:CYN, borderRadius:4 }} />
          </div>
          <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{used} of {total} addresses in use · {total-used} available</div>
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Network Zone")}
          {row("Zone", net.startsWith("10.10")?"Corporate Internal":net.startsWith("192.168.50")?"IoT Isolated":net.startsWith("192.168.100")?"OT Air-Gap":"Corporate")}
          {row("Firewall Policy", "fw-perimeter-01.acme.int")}
          {row("Traffic Monitoring", <span style={{ color:EME }}>✓ NetFlow active</span>)}
        </div>
      );
    }

    if (type === "category") {
      const cat   = data.category as string;
      const count = allAssets.filter(a=>a.category===cat).length;
      const crit  = allAssets.filter(a=>a.category===cat&&a.risk==="Critical").length;
      const unman = allAssets.filter(a=>a.category===cat&&!a.managed).length;
      const assets = allAssets.filter(a=>a.category===cat).slice(0,6);
      return (
        <div>
          <div style={{ background:`${catColor[cat]||NAV}12`, border:`1px solid ${catColor[cat]||NAV}33`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:800, color:catColor[cat]||NAV, marginBottom:4 }}>{cat}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Asset Category Overview</div>
          </div>
          {sHdr("Category Stats")}
          {row("Total in Inventory",  count)}
          {row("Critical Risk",       <span style={{ color:crit>0?RED:EME }}>{crit}</span>)}
          {row("Unmanaged",           <span style={{ color:unman>0?RED:EME }}>{unman}</span>)}
          {row("Avg Exposure Score",  Math.round(allAssets.filter(a=>a.category===cat).reduce((s,a)=>s+a.exposureScore,0)/(count||1)))}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Assets in Category")}
          {assets.map(a=>(
            <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <Mono style={{ fontSize:9 }}>{a.id}</Mono>
              <span style={{ flex:1, fontSize:10, color:"var(--foreground)" }}>{a.hostname.split(".")[0]}</span>
              <RiskBadge level={a.risk} />
            </div>
          ))}
          {count>6&&<div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:6 }}>…and {count-6} more</div>}
        </div>
      );
    }

    if (type === "deploy") {
      return (
        <div>
          <div style={{ background:"rgba(6,149,105,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:800, color:GRN, marginBottom:4 }}>{data.target as string}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Deployment Target</div>
          </div>
          {sHdr("Infrastructure")}
          {row("Type",         data.type as string)}
          {row("Region",       data.region as string ?? "us-east-1")}
          {row("Provider",     data.provider as string ?? "On-Premises")}
          {row("Datacenter",   data.dc as string ?? "DC1 — Primary")}
          {row("Rack",         data.rack as string ?? `R${(hashCode(data.target as string)%12)+1}-U${(hashCode(data.target as string)%24)+1}`)}
          {row("Power Zone",   "Zone A / UPS-A")}
          {row("Availability", "99.98% (6mo)")}
        </div>
      );
    }

    if (type === "user") {
      const u = data as {name:string;email:string;unit:string;dept:string};
      return (
        <div>
          <div style={{ background:"rgba(29,78,216,0.07)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`${BLU}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, marginBottom:8 }}>👤</div>
            <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{u.name}</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{u.email}</div>
          </div>
          {sHdr("Identity")}
          {row("Display Name",  u.name)}
          {row("Email",         u.email)}
          {row("Department",    u.dept)}
          {row("Business Unit", u.unit)}
          {row("User Role",     "Asset Owner / Data Custodian")}
          <div style={{ height:1, background:"var(--secondary)", margin:"12px 0" }} />
          {sHdr("Access & Security")}
          {row("MFA Enabled",   <span style={{ color:EME }}>✓ Enforced (MS Authenticator)</span>)}
          {row("Last Login",    "2026-06-14 08:22:15")}
          {row("Risk Score",    <span style={{ color:EME }}>Low (12/100)</span>)}
          {row("Privileged",    "No")}
        </div>
      );
    }

    return <div style={{ color:"var(--muted-foreground)", fontSize:12, padding:"20px 0", textAlign:"center" as const }}>No data available</div>;
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(2px)" }} />
      <div style={{ position:"absolute", right:0, top:0, bottom:0, width:460, background:"var(--card)", borderLeft:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.5)" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>{popup.title}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>AIGO-X CAASM · Click-through Detail</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", cursor:"pointer", fontSize:16, color:"var(--muted-foreground)", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// ── SaaS helpers ───────────────────────────────────────────────────────────────
function getSaasLogoUrl(manufacturer: string, hostname: string): string {
  const m = manufacturer.toLowerCase(); const hn = hostname.toLowerCase();
  if (m.includes("okta")       || hn.includes("okta"))                            return "https://logo.clearbit.com/okta.com";
  if (m.includes("salesforce") || hn.includes("salesforce"))                      return "https://logo.clearbit.com/salesforce.com";
  if (m.includes("slack")      || hn.includes("slack"))                           return "https://logo.clearbit.com/slack.com";
  if (m.includes("atlassian")  || hn.includes("jira")||hn.includes("confluence")) return "https://logo.clearbit.com/atlassian.com";
  if (m.includes("hashicorp")  || hn.includes("vault")||hn.includes("terraform")) return "https://logo.clearbit.com/hashicorp.com";
  if (m.includes("github")     || hn.includes("github"))                          return "https://logo.clearbit.com/github.com";
  if (m.includes("zoom")       || hn.includes("zoom"))                            return "https://logo.clearbit.com/zoom.us";
  if (m.includes("workday")    || hn.includes("workday"))                         return "https://logo.clearbit.com/workday.com";
  if (m.includes("servicenow") || hn.includes("servicenow"))                      return "https://logo.clearbit.com/servicenow.com";
  if (m.includes("microsoft")  || hn.includes("m365")||hn.includes("office365")) return "https://logo.clearbit.com/microsoft.com";
  if (m.includes("google")     || hn.includes("gworkspace")||hn.includes("gsuite")) return "https://logo.clearbit.com/google.com";
  if (m.includes("splunk")      || hn.includes("splunk"))                         return "https://logo.clearbit.com/splunk.com";
  if (m.includes("crowdstrike")|| hn.includes("falcon")||hn.includes("crowdstrike")) return "https://logo.clearbit.com/crowdstrike.com";
  if (m.includes("datadog")    || hn.includes("datadog")||hn.includes("monitoring-datadog")) return "https://logo.clearbit.com/datadoghq.com";
  if (m.includes("cloudflare") || hn.includes("cloudflare"))                      return "https://logo.clearbit.com/cloudflare.com";
  if (m.includes("openssl")    || hn.includes("openvpn"))                         return "https://logo.clearbit.com/openvpn.net";
  if (m.includes("synology")   || hn.includes("synology")||hn.includes("nas-storage")) return "https://logo.clearbit.com/synology.com";
  if (m.includes("pagerduty")  || hn.includes("pagerduty"))                       return "https://logo.clearbit.com/pagerduty.com";
  if (m.includes("zendesk")    || hn.includes("zendesk"))                         return "https://logo.clearbit.com/zendesk.com";
  if (m.includes("docusign")   || hn.includes("docusign"))                        return "https://logo.clearbit.com/docusign.com";
  if (m.includes("hubspot")    || hn.includes("hubspot"))                         return "https://logo.clearbit.com/hubspot.com";
  if (m.includes("dropbox")    || hn.includes("dropbox"))                         return "https://logo.clearbit.com/dropbox.com";
  if (m.includes("box")        || hn.includes("box-cloud"))                       return "https://logo.clearbit.com/box.com";
  return "";
}

interface SaaSMeta { serviceUrl:string; tenantId:string; plan:string; licensedUsers:number; activeUsers:number; dataRegion:string; ssoEnabled:boolean; mfaEnforced:boolean; apiIntegrations:number; renewalDate:string; contractValue:string; adminContact:string; adminEmail:string; certifications:string[]; uptime:string; }
function getSaaSMeta(asset: AssetEntry): SaaSMeta {
  const h2 = hashCode(asset.id);
  const m = asset.manufacturer.toLowerCase(); const hn = asset.hostname.toLowerCase();
  const urlMap: Record<string,string> = {
    okta:"https://acme.okta.com", salesforce:"https://acme.my.salesforce.com",
    slack:"https://acme.slack.com", atlassian:"https://acme.atlassian.net",
    hashicorp:"https://vault.acme-prod.aws.hashicorp.cloud",
    github:"https://github.com/acme-corp", zoom:"https://acme.zoom.us",
    workday:"https://wd5.myworkday.com/acme",
    splunk:"https://acme.splunkcloud.com", crowdstrike:"https://falcon.crowdstrike.com",
    datadog:"https://app.datadoghq.com", microsoft:"https://portal.microsoft.com",
    cloudflare:"https://dash.cloudflare.com", servicenow:"https://acme.service-now.com",
  };
  const certMap: Record<string,string[]> = {
    okta:["SOC 2 Type II","ISO 27001","ISO 27018","FedRAMP","GDPR"],
    salesforce:["SOC 2 Type II","ISO 27001","ISO 27018","SOC 1","PCI DSS","GDPR"],
    slack:["SOC 2 Type II","ISO 27001","ISO 27017","GDPR"],
    atlassian:["SOC 2 Type II","ISO 27001","ISO 27018","GDPR"],
    hashicorp:["SOC 2 Type II","ISO 27001","GDPR"],
    github:["SOC 2 Type II","ISO 27001","GDPR","FedRAMP"],
    zoom:["SOC 2 Type II","ISO 27001","GDPR","HIPAA"],
    workday:["SOC 2 Type II","ISO 27001","ISO 27018","GDPR","SOC 1"],
    splunk:["SOC 2 Type II","ISO 27001","FedRAMP","HIPAA","GDPR","PCI DSS"],
    crowdstrike:["SOC 2 Type II","ISO 27001","FedRAMP","PCI DSS","HIPAA","GDPR"],
    datadog:["SOC 2 Type II","ISO 27001","ISO 27017","GDPR","HIPAA"],
    microsoft:["SOC 2 Type II","ISO 27001","ISO 27018","SOC 1","PCI DSS","GDPR","FedRAMP","HIPAA"],
  };
  let serviceUrl = "", certs = ["SOC 2 Type II","ISO 27001"];
  for (const [k,v] of Object.entries(urlMap))  { if (m.includes(k)||hn.includes(k)) { serviceUrl=v; break; } }
  for (const [k,v] of Object.entries(certMap)) { if (m.includes(k)||hn.includes(k)) { certs=v; break; } }
  const userBases = [1200,850,2100,320,95,450,900,750];
  const userBase = userBases[h2 % userBases.length];
  const activeUsers = Math.round(userBase * (0.6 + (h2 % 40) * 0.01));
  const renewYear = 2026 + (h2 % 2);
  const renewMon  = String(((h2+3)%12)+1).padStart(2,"0");
  const renewDay  = String(((h2+7)%28)+1).padStart(2,"0");
  const adminNames = ["Sarah Chen","Marcus Johnson","Priya Patel","David Kim","Alex Rivera"];
  const adminDomains = ["it.acme.corp","ops.acme.corp","eng.acme.corp"];
  const adminName = adminNames[h2 % adminNames.length];
  const aFirst = adminName.split(" ")[0].toLowerCase();
  const aLast  = adminName.split(" ")[1].toLowerCase();
  const regions = ["US-East (Virginia)","EU-West (Frankfurt)","US-West (Oregon)","APAC (Singapore)"];
  return {
    serviceUrl,
    tenantId:`${m.replace(/\s+/g,"")}-acme-${String(h2%9999).padStart(4,"0")}`,
    plan:["Enterprise","Business+","Professional","Enterprise Plus"][h2%4],
    licensedUsers:userBase, activeUsers,
    dataRegion:regions[h2%regions.length],
    ssoEnabled:true, mfaEnforced:asset.managed,
    apiIntegrations:3+(h2%8),
    renewalDate:`${renewYear}-${renewMon}-${renewDay}`,
    contractValue:`$${(userBase*(12+h2%40)).toLocaleString()}/yr`,
    adminContact:adminName,
    adminEmail:`${aFirst}.${aLast}@${adminDomains[h2%adminDomains.length]}`,
    certifications:certs,
    uptime:`99.${90+(h2%10)}% (30-day SLA)`,
  };
}

// ── Hardware data generator ────────────────────────────────────────────────────
function getHardwareData(asset: AssetEntry) {
  const h = hashCode(asset.id);
  const cpuMap: Record<string,string[]> = {
    Server:["Intel Xeon Gold 6254 3.1GHz","AMD EPYC 7502 2.5GHz","Intel Xeon Platinum 8380 2.3GHz","Intel Xeon E5-2690 v4 2.6GHz"],
    Workstation:["Intel Core i7-13700K 3.4GHz","AMD Ryzen 9 5950X 3.4GHz","Apple M2 Pro 3.5GHz","Intel Core i9-13900K 3.0GHz"],
    Cloud:["Intel Xeon Platinum 8124M 3.0GHz","AMD EPYC 7R13 2.65GHz","Intel Xeon E5-2686 v4 2.3GHz"],
    Network:["Intel Atom C3558 2.2GHz","ARM Cortex-A72 1.8GHz","MIPS M14KEc 500MHz"],
    IoT:["ARM Cortex-A53 1.4GHz","Qualcomm MDM9607 1.2GHz"],
    Mobile:["Apple A16 Bionic","Apple M2","Qualcomm Snapdragon 8 Gen 2"],
    OT:["MIPS 24KEc 400MHz","ARM Cortex-M4 168MHz"],
    Container:["Intel Xeon Platinum 8124M 3.0GHz","AMD EPYC 7R32 2.8GHz"],
    Unknown:["Unknown CPU"],
  };
  const ramMap: Record<string,string[]> = {
    Server:["128 GB","256 GB","512 GB","64 GB"],
    Workstation:["16 GB","32 GB","64 GB"],
    Cloud:["32 GB","64 GB","128 GB"],
    IoT:["512 MB","1 GB","2 GB"],
    Mobile:["8 GB","12 GB","16 GB"],
    OT:["256 MB","512 MB"],
    Network:["4 GB","8 GB"],
    Container:["64 GB","128 GB"],
    Unknown:["Unknown"],
  };
  const coreMap: Record<string,[number,number][]> = {
    Server:[[16,32],[24,48],[28,56],[32,64]],
    Workstation:[[8,16],[12,24],[16,32]],
    Cloud:[[8,16],[16,32],[32,64]],
    IoT:[[4,4],[2,2]],
    Mobile:[[8,8],[6,6]],
    OT:[[1,1],[2,2]],
    Network:[[4,4],[8,8]],
    Container:[[16,32],[32,64]],
    Unknown:[[2,2]],
  };
  const cpuList  = cpuMap[asset.category]  ?? cpuMap.Server;
  const ramList  = ramMap[asset.category]  ?? ramMap.Server;
  const coreList = coreMap[asset.category] ?? coreMap.Server;
  const cpu = cpuList[h % cpuList.length];
  const ram = ramList[h % ramList.length];
  const [cores, threads] = coreList[h % coreList.length];
  const ramPct = 30 + (h % 51);
  const ramUsed = ram==="Unknown"?ram:(() => { const n=parseFloat(ram); return `${Math.round(n*ramPct/100)} ${ram.includes("GB")?"GB":"MB"}`; })();
  const storageTypes = asset.category==="Server"||asset.category==="Cloud"
    ? [{ name:"nvme0n1",type:"NVMe SSD",size:"2 TB",usagePct:35+(h%40),health:"Good" as "Good" },{ name:"sdb",type:"HDD",size:"4 TB",usagePct:55+(h%30),health:(h%5===0?"Warning":"Good") as "Warning"|"Good" }]
    : asset.category==="Workstation"
    ? [{ name:"nvme0n1",type:"NVMe SSD",size:"512 GB",usagePct:40+(h%40),health:"Good" as const }]
    : [{ name:"mmcblk0",type:"eMMC Flash",size:"64 GB",usagePct:20+(h%40),health:"Good" as const }];
  const nics = [
    { name:"eth0",mac:`${["00:1A","00:2B","00:4C","00:5D","00:6E"][h%5]}:${String(h%256).padStart(2,"0").toUpperCase()}:${String((h>>8)%256).padStart(2,"0").toUpperCase()}:${String((h>>16)%256).padStart(2,"0").toUpperCase()}`, speed:asset.category==="Server"?"10 GbE":asset.category==="Workstation"?"1 GbE":"100 MbE", ip:asset.ip!=="DHCP"?asset.ip:"DHCP", status:"Up" as const, vlan:asset.category==="IoT"?"VLAN-100":asset.category==="OT"?"VLAN-200":"VLAN-10" },
    ...(asset.category==="Server"||asset.category==="Cloud"?[{ name:"eth1",mac:`FF:${String(h%256).padStart(2,"0").toUpperCase()}:${String((h>>4)%256).padStart(2,"0").toUpperCase()}:00:00:00`,speed:"10 GbE",ip:"—",status:"Down" as const,vlan:"N/A" }]:[]),
  ];
  const biosVendors: Record<string,string> = { Dell:"Dell Inc.", HP:"HP Inc.", Apple:"Apple Inc.", Lenovo:"Lenovo", Cisco:"Cisco Systems", "Palo Alto":"Palo Alto Networks", Siemens:"Siemens AG", "AWS EC2":"Amazon Web Services", "Azure VM":"Microsoft Azure", GKE:"Google Cloud" };
  return {
    cpu: { model:cpu, cores, threads, speed:cpu.split(" ").slice(-1)[0]||"N/A", usage:10+(h%65) },
    ram: { total:ram, used:ramUsed, usagePct:ramPct, type:asset.category==="Mobile"?"LPDDR5":"DDR4 ECC", speed:"3200 MHz" },
    storage: storageTypes,
    network: nics,
    bios: { vendor:biosVendors[asset.manufacturer]??asset.manufacturer, version:`${2+(h%3)}.${h%10}.${(h%99)+1}`, releaseDate:`202${3+(h%3)}-${String((h%12)+1).padStart(2,"0")}-${String((h%28)+1).padStart(2,"0")}` },
    serialNumber:`SN${String(h%900000000+100000000)}`,
    assetTag: `AT-${asset.id}`,
  };
}

// ── Software data generator ────────────────────────────────────────────────────
interface SwEntry { name:string; version:string; publisher:string; installDate:string; eolDate:string|null; eolStatus:EolStatus; category:string; cveCount:number; latestVersion:string; license:string; fleetCount:number; }

function getSoftwareList(asset: AssetEntry): SwEntry[] {
  const h = hashCode(asset.id);
  const os = asset.os;
  const winBase: SwEntry[] = [
    { name:"Microsoft Windows",          version:os.includes("2022")?"10.0.20348.2340":os.includes("2019")?"10.0.17763.5820":"10.0.19045.4412", publisher:"Microsoft Corporation",    installDate:"2024-01-15", eolDate:os.includes("2022")?"2031-10-14":"2029-01-09", eolStatus:"Current",  category:"OS",           cveCount:0, latestVersion:os, license:"OEM", fleetCount:312 },
    { name:"Microsoft 365 Apps",         version:"16.0.17628.20144",                                                                             publisher:"Microsoft Corporation",    installDate:"2024-02-01", eolDate:null,              eolStatus:"Current",  category:"Productivity", cveCount:0, latestVersion:"Current", license:"Subscription", fleetCount:4820 },
    { name:"Google Chrome",              version:"124.0.6367.118",                                                                               publisher:"Google LLC",               installDate:"2024-04-15", eolDate:null,              eolStatus:"Current",  category:"Browser",      cveCount:0, latestVersion:"125.0.6422.60", license:"Freeware", fleetCount:6100 },
    { name:"Microsoft Edge",             version:"124.0.2478.105",                                                                               publisher:"Microsoft Corporation",    installDate:"2024-04-20", eolDate:null,              eolStatus:"Current",  category:"Browser",      cveCount:0, latestVersion:"Current", license:"Freeware", fleetCount:5200 },
    { name:"Python 3.8",                 version:"3.8.18",                                                                                       publisher:"Python Software Foundation",installDate:"2022-01-10",eolDate:"2024-10-14",     eolStatus:"EOL",      category:"Runtime",      cveCount:3, latestVersion:"3.12.4", license:"PSF License", fleetCount:84 },
    { name:"OpenSSL 1.1.1",              version:"1.1.1w",                                                                                       publisher:"OpenSSL Foundation",       installDate:"2023-06-01", eolDate:"2023-09-11",     eolStatus:"EOS",      category:"Security",     cveCount:7, latestVersion:"3.3.0",  license:"Apache 2.0", fleetCount:127 },
    { name:"7-Zip",                      version:"23.01",                                                                                        publisher:"Igor Pavlov",              installDate:"2024-03-10", eolDate:null,              eolStatus:"Current",  category:"Utility",      cveCount:0, latestVersion:"24.01",  license:"LGPL", fleetCount:3800 },
    { name:"CrowdStrike Falcon Sensor",  version:asset.agentVersion!=="—"?asset.agentVersion:"7.14.16202.0",                                     publisher:"CrowdStrike Inc.",         installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Security",     cveCount:0, latestVersion:"Current", license:"Commercial", fleetCount:3318 },
    { name:"Tenable Nessus Agent",       version:"10.6.4",                                                                                       publisher:"Tenable Inc.",             installDate:"2024-02-01", eolDate:null,              eolStatus:"Current",  category:"Security",     cveCount:0, latestVersion:"Current", license:"Commercial", fleetCount:2936 },
    { name:"Visual C++ Redistributable", version:"14.40.33810.0",                                                                               publisher:"Microsoft Corporation",    installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Runtime",      cveCount:0, latestVersion:"Current", license:"Proprietary", fleetCount:7100 },
    { name:"Java SE Runtime 8",          version:"8u401",                                                                                        publisher:"Oracle Corporation",       installDate:"2021-03-15", eolDate:"2030-01-01",     eolStatus:"Warning",  category:"Runtime",      cveCount:2, latestVersion:"21.0.3 LTS", license:"Commercial", fleetCount:210 },
    { name:"Adobe Acrobat Reader",       version:"24.001.20604",                                                                                 publisher:"Adobe Inc.",               installDate:"2024-04-01", eolDate:null,              eolStatus:"Current",  category:"Productivity", cveCount:0, latestVersion:"Current", license:"Freeware", fleetCount:4200 },
  ];
  const linBase: SwEntry[] = [
    { name:"Linux Kernel",               version:os.includes("Ubuntu")?"6.5.0-35-generic":os.includes("Rocky")?"5.14.0-362.18.1.el9_3":"5.15.0-107-generic", publisher:"kernel.org",                installDate:"2024-01-15", eolDate:os.includes("Ubuntu 22.04")?"2027-04-01":"2032-05-31", eolStatus:"Current", category:"OS Kernel",    cveCount:0, latestVersion:"6.9.0", license:"GPL v2", fleetCount:320 },
    { name:"glibc",                      version:"2.35",                                                                                         publisher:"GNU Project",              installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"System Library",cveCount:0, latestVersion:"2.39",  license:"LGPL v2.1", fleetCount:1200 },
    { name:"OpenSSH",                    version:"8.9p1",                                                                                        publisher:"OpenBSD Project",          installDate:"2024-01-15", eolDate:null,              eolStatus:"Warning",  category:"Remote Access", cveCount:1, latestVersion:"9.7p1", license:"BSD", fleetCount:890 },
    { name:"Python 3.8",                 version:"3.8.18",                                                                                       publisher:"Python Software Foundation",installDate:"2021-09-01",eolDate:"2024-10-14",     eolStatus:"EOL",      category:"Runtime",      cveCount:3, latestVersion:"3.12.4", license:"PSF License", fleetCount:84 },
    { name:"Docker Engine",              version:"24.0.7",                                                                                       publisher:"Docker Inc.",              installDate:"2023-11-01", eolDate:null,              eolStatus:"Current",  category:"Container",    cveCount:0, latestVersion:"26.1.1", license:"Apache 2.0", fleetCount:218 },
    { name:"nginx",                      version:"1.24.0",                                                                                       publisher:"NGINX Inc.",               installDate:"2023-05-20", eolDate:null,              eolStatus:"Current",  category:"Web Server",   cveCount:0, latestVersion:"1.26.0", license:"BSD", fleetCount:342 },
    { name:"OpenSSL 3.0",                version:"3.0.11",                                                                                       publisher:"OpenSSL Foundation",       installDate:"2024-01-15", eolDate:"2026-09-07",     eolStatus:"Warning",  category:"Security",     cveCount:1, latestVersion:"3.3.0",  license:"Apache 2.0", fleetCount:600 },
    { name:"runc",                       version:"1.1.4",                                                                                        publisher:"Open Containers",          installDate:"2023-01-10", eolDate:null,              eolStatus:"EOL",      category:"Container",    cveCount:1, latestVersion:"1.1.12", license:"Apache 2.0", fleetCount:45 },
    { name:"CrowdStrike Falcon Sensor",  version:asset.agentVersion!=="—"?asset.agentVersion:"7.14.16202.0",                                     publisher:"CrowdStrike Inc.",         installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Security",     cveCount:0, latestVersion:"Current", license:"Commercial", fleetCount:3318 },
    { name:"systemd",                    version:"249.11",                                                                                       publisher:"systemd project",          installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"System",       cveCount:0, latestVersion:"255",   license:"LGPL v2.1", fleetCount:1200 },
    { name:"curl",                       version:"7.81.0",                                                                                       publisher:"curl project",             installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Utility",      cveCount:0, latestVersion:"8.7.1", license:"MIT/curl", fleetCount:1500 },
    { name:"Log4j 1.x",                 version:"1.2.17",                                                                                       publisher:"Apache Software Foundation",installDate:"2018-03-01",eolDate:"2015-08-05",     eolStatus:"EOL",      category:"Library",      cveCount:5, latestVersion:"2.23.1", license:"Apache 2.0", fleetCount:28 },
  ];
  const macBase: SwEntry[] = [
    { name:"macOS",                      version:os,                                                                                             publisher:"Apple Inc.",               installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"OS",           cveCount:0, latestVersion:"Current", license:"Commercial", fleetCount:512 },
    { name:"Safari",                     version:"17.4.1",                                                                                       publisher:"Apple Inc.",               installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Browser",      cveCount:0, latestVersion:"Current", license:"Freeware", fleetCount:512 },
    { name:"Xcode",                      version:"15.3",                                                                                         publisher:"Apple Inc.",               installDate:"2024-02-10", eolDate:null,              eolStatus:"Current",  category:"Development",  cveCount:0, latestVersion:"15.4",  license:"Commercial", fleetCount:48 },
    { name:"Homebrew",                   version:"4.2.21",                                                                                       publisher:"Homebrew Project",         installDate:"2024-03-01", eolDate:null,              eolStatus:"Current",  category:"Package Manager",cveCount:0,latestVersion:"Current",license:"BSD",fleetCount:320 },
    { name:"Docker Desktop",             version:"4.29.0",                                                                                       publisher:"Docker Inc.",              installDate:"2024-04-01", eolDate:null,              eolStatus:"Current",  category:"Container",    cveCount:0, latestVersion:"4.30.0", license:"Commercial", fleetCount:280 },
    { name:"Python 3.8",                 version:"3.8.18",                                                                                       publisher:"Python Software Foundation",installDate:"2021-09-01",eolDate:"2024-10-14",     eolStatus:"EOL",      category:"Runtime",      cveCount:3, latestVersion:"3.12.4", license:"PSF License", fleetCount:84 },
    { name:"CrowdStrike Falcon",         version:"7.14.16202.0",                                                                                 publisher:"CrowdStrike Inc.",         installDate:"2024-01-15", eolDate:null,              eolStatus:"Current",  category:"Security",     cveCount:0, latestVersion:"Current", license:"Commercial", fleetCount:3318 },
    { name:"OpenSSL 3.3",                version:"3.3.0",                                                                                       publisher:"OpenSSL Foundation",       installDate:"2024-04-10", eolDate:null,              eolStatus:"Current",  category:"Security",     cveCount:0, latestVersion:"Current", license:"Apache 2.0", fleetCount:600 },
    { name:"Node.js 18 LTS",             version:"18.20.2",                                                                                      publisher:"OpenJS Foundation",        installDate:"2023-11-01", eolDate:"2025-04-30",     eolStatus:"Warning",  category:"Runtime",      cveCount:0, latestVersion:"20.13.1",license:"MIT", fleetCount:145 },
    { name:"iTerm2",                     version:"3.5.2",                                                                                        publisher:"George Nachman",           installDate:"2024-02-20", eolDate:null,              eolStatus:"Current",  category:"Utility",      cveCount:0, latestVersion:"Current", license:"GPL v2", fleetCount:190 },
  ];
  const baseList = os.includes("macOS")?"mac":os.includes("Windows")?"win":"lin";
  const list = baseList==="mac"?macBase:baseList==="win"?winBase:linBase;
  return list.slice(0, 8 + (h % 4));
}

// ── Security tools data ────────────────────────────────────────────────────────
interface SecToolEntry { name:string; version:string; vendor:string; policy:string; lastScan:string; lastUpdate:string; status:"Active"|"Inactive"|"Warning"; type:string; findings:number; }

function getSecTools(asset: AssetEntry): SecToolEntry[] {
  const h = hashCode(asset.id);
  const base: SecToolEntry[] = [];

  // ── Network devices (firewall, switch, router, VPN): NO traditional agents ──
  // Agents require an OS process context that network OS (PAN-OS, IOS, FortiOS)
  // does not expose. Scanning is done agentlessly via network probes / vendor API.
  if (asset.category === "Network") {
    const hn2 = asset.hostname.toLowerCase();
    const mfr2 = asset.manufacturer;
    const isFW  = hn2.includes("fw")||hn2.includes("firewall")||mfr2.includes("Palo Alto")||mfr2.includes("Fortinet")||mfr2.includes("Check Point");
    const isVPN = hn2.includes("vpn")||hn2.includes("gateway");
    // Agentless network scanning — works by sending probes over the network
    base.push({ name:"Tenable Nessus — Agentless Network Scan", version:`10.${6+(h%2)}.${h%8}`, vendor:"Tenable Inc.", policy:"Network Device Scan — Weekly (credentialed SSH)", lastScan:"2026-06-13 22:00:00", lastUpdate:"2026-06-12 08:00:00", status:"Active", type:"Agentless Network Scanner", findings:asset.vulnCount });
    base.push({ name:"Qualys Network Passive Sensor (NPS)", version:`4.${h%3}.${100+(h%50)}`, vendor:"Qualys Inc.", policy:"Network Device Scan Profile — v2 (SNMP + SSH)", lastScan:"2026-06-14 01:30:00", lastUpdate:"2026-06-10 12:00:00", status:"Active", type:"Agentless Network Scanner", findings:asset.vulnCount });
    if (isFW) {
      if (mfr2.includes("Palo Alto")) {
        base.push({ name:"Palo Alto Panorama", version:`${11+(h%1)}.${h%2}.${1+(h%3)}`, vendor:"Palo Alto Networks", policy:"Centralized Policy & Configuration Management", lastScan:"Continuous", lastUpdate:"2026-06-14 06:00:00", status:"Active", type:"Centralized Management", findings:0 });
        base.push({ name:"PAN-DB Threat Intelligence", version:"Cloud", vendor:"Palo Alto Networks", policy:"URL / DNS Threat Feed — Real-time updates", lastScan:"Continuous", lastUpdate:"2026-06-14 07:10:00", status:"Active", type:"Threat Intelligence Feed", findings:0 });
        base.push({ name:"WildFire Cloud Sandbox", version:"Cloud", vendor:"Palo Alto Networks", policy:"File & Session Analysis — All unknown sessions", lastScan:"Continuous", lastUpdate:"2026-06-14 07:30:00", status:asset.critVulns>0?"Warning":"Active", type:"Sandbox / Malware Analysis", findings:asset.critVulns });
      } else if (mfr2.includes("Fortinet")) {
        base.push({ name:"FortiManager", version:`7.${4+(h%2)}.${h%5}`, vendor:"Fortinet Inc.", policy:"Centralized Policy Management", lastScan:"Continuous", lastUpdate:"2026-06-14 06:00:00", status:"Active", type:"Centralized Management", findings:0 });
        base.push({ name:"FortiGuard Threat Intelligence", version:"Cloud", vendor:"Fortinet Inc.", policy:"Threat Feed — Real-time", lastScan:"Continuous", lastUpdate:"2026-06-14 07:00:00", status:"Active", type:"Threat Intelligence Feed", findings:0 });
      } else if (mfr2.includes("Check Point")) {
        base.push({ name:"Check Point SmartConsole", version:`R${81+(h%2)}.${10+(h%20)}`, vendor:"Check Point Software", policy:`Security Policy — v${4+(h%3)}`, lastScan:"Continuous", lastUpdate:"2026-06-14 06:00:00", status:"Active", type:"Centralized Management", findings:0 });
        base.push({ name:"Check Point ThreatCloud", version:"Cloud", vendor:"Check Point Software", policy:"Threat Intelligence — Real-time", lastScan:"Continuous", lastUpdate:"2026-06-14 07:00:00", status:"Active", type:"Threat Intelligence Feed", findings:0 });
      }
    }
    if (isVPN) {
      base.push({ name:"Cisco SecureX / Umbrella", version:`4.${h%3}.${h%10}`, vendor:"Cisco Systems", policy:"VPN Client Posture Assessment", lastScan:"2026-06-14 04:00:00", lastUpdate:"2026-06-13 20:00:00", status:"Active", type:"Network Security", findings:asset.critVulns });
    }
    base.push({ name:"SolarWinds NPM — SNMP v3 Monitoring", version:`2024.${1+(h%4)}`, vendor:"SolarWinds Inc.", policy:"Device Health Poll — 5 min interval", lastScan:"Continuous", lastUpdate:"2026-06-14 07:55:00", status:"Active", type:"Network Monitoring", findings:0 });
    return base;
  }

  const av = asset.antivirus;
  if (av==="CrowdStrike"||av==="MS Defender"||av==="Jamf Protect"||av==="Falco") {
    if (av==="CrowdStrike") base.push({ name:"CrowdStrike Falcon", version:`7.${14+(h%3)}.${16000+(h%500)}.0`, vendor:"CrowdStrike Inc.", policy:"Corporate Prevention Policy v4.2", lastScan:"2026-06-14 03:42:18", lastUpdate:"2026-06-13 21:00:00", status:"Active", type:"EDR/EPP", findings:asset.critVulns });
    if (av==="MS Defender") base.push({ name:"Microsoft Defender for Endpoint", version:`4.18.${2403+(h%12)}.${h%100}`, vendor:"Microsoft Corporation", policy:"ATP Policy — CIS Hardened", lastScan:"2026-06-14 06:15:00", lastUpdate:"2026-06-14 04:00:00", status:"Active", type:"EDR/EPP", findings:asset.critVulns });
    if (av==="Jamf Protect") base.push({ name:"Jamf Protect", version:`5.${1+(h%3)}.1`, vendor:"Jamf Inc.", policy:"Executive Device Policy", lastScan:"2026-06-14 01:00:00", lastUpdate:"2026-06-13 18:00:00", status:"Active", type:"Mobile Security", findings:0 });
    if (av==="Falco") base.push({ name:"Falco Runtime Security", version:`0.${37+(h%3)}.0`, vendor:"CNCF / Sysdig", policy:"MITRE ATT&CK Container Policy", lastScan:"Continuous", lastUpdate:"2026-06-14 00:00:00", status:"Active", type:"Runtime Security", findings:asset.vulnCount });
  }
  if (asset.managed) {
    base.push({ name:"Tenable Vulnerability Management", version:`10.${6+(h%2)}.${h%8}`, vendor:"Tenable Inc.", policy:"Enterprise Full Scan — Weekly", lastScan:"2026-06-13 22:00:00", lastUpdate:"2026-06-12 08:00:00", status:"Active", type:"Vulnerability Scanner", findings:asset.vulnCount });
    base.push({ name:"Qualys VMDR Agent", version:`3.${1+(h%2)}.0.${200+(h%100)}`, vendor:"Qualys Inc.", policy:"Asset Scan Profile — v3", lastScan:"2026-06-14 01:30:00", lastUpdate:"2026-06-10 12:00:00", status:"Active", type:"Vulnerability Scanner", findings:asset.vulnCount });
    if (asset.category==="Server"||asset.category==="Workstation"||asset.category==="Cloud") {
      base.push({ name:"SCCM Client / Patch Management", version:`5.0.${9068+(h%200)}`, vendor:"Microsoft Corporation", policy:"Monthly Patch Cycle — T+14 days", lastScan:"2026-06-02 03:00:00", lastUpdate:"2026-06-01 00:00:00", status:asset.risk==="Critical"?"Warning":"Active", type:"Patch Management", findings:asset.vulnCount });
      base.push({ name:"Trellix DLP Agent", version:`15.${8+(h%3)}.${h%10}.${100+(h%200)}`, vendor:"Trellix (McAfee)", policy:`Data Protection — ${asset.dept} Classification`, lastScan:"2026-06-14 00:00:00", lastUpdate:"2026-06-10 08:00:00", status:"Active", type:"DLP", findings:0 });
    }
    if (asset.category==="Server"||asset.category==="Cloud") {
      base.push({ name:"CIS-CAT Pro (Benchmark Scanner)", version:`4.${35+(h%10)}.0`, vendor:"CIS — Center for Internet Security", policy:`CIS ${asset.os.includes("Windows")?"Windows Server 2022":"Ubuntu 22.04"} Benchmark L2`, lastScan:"2026-06-07 05:00:00", lastUpdate:"2026-05-20 00:00:00", status:"Active", type:"Config Compliance", findings:Math.max(0, asset.vulnCount-1) });
    }
  }
  if (base.length===0) {
    base.push({ name:"No security tools detected", version:"—", vendor:"—", policy:"—", lastScan:"Never", lastUpdate:"—", status:"Inactive", type:"—", findings:0 });
  }
  return base;
}

// ── Asset detail page ──────────────────────────────────────────────────────────
// ── Network device configuration generator ─────────────────────────────────
function getNetworkDeviceConfig(asset: AssetEntry) {
  const h   = hashCode(asset.id);
  const hn  = asset.hostname.toLowerCase();
  const mfr = asset.manufacturer;
  const isFirewall = hn.includes("fw")||hn.includes("firewall")||mfr.includes("Palo Alto")||mfr.includes("Fortinet")||mfr.includes("Check Point");
  const isSwitch   = (hn.includes("sw-")||hn.includes("switch")||hn.includes("access"))&&!isFirewall;
  const isVpn      = hn.includes("vpn")||hn.includes("gateway");

  const platform = isFirewall
    ? (mfr.includes("Palo Alto")?"PAN-OS 11.1.3":mfr.includes("Fortinet")?"FortiOS 7.4.2":mfr.includes("Check Point")?"R81.20":"Cisco ASA 9.18.4")
    : isSwitch?(hn.includes("core")?"Cisco IOS-XE 17.9.4a":"Cisco IOS 15.2(7)E6"):"Cisco IOS-XE 17.9.4a";
  const model = isFirewall
    ? (mfr.includes("Palo Alto")?"PA-3250":mfr.includes("Fortinet")?"FortiGate 200F":mfr.includes("Check Point")?"6200":"ASA 5515-X")
    : isSwitch?(hn.includes("core")?"Catalyst 9300-48P":"Catalyst 2960-48TT"):isVpn?"ASA 5506-X":"ISR 4331";

  const totalPorts = isFirewall?8:isSwitch?(hn.includes("core")?52:48):6;
  const upPorts    = isFirewall?4:isSwitch?(32+(h%10)):4;

  const ifaces = isFirewall ? [
    {name:"ethernet1/1",  ip:asset.ip||"203.0.113.1", mask:"/30", zone:"untrust",   speed:"1G",    status:"up"         as const, desc:"ISP Uplink — Primary",   rxPkts:`${(h%9+1)*1.2}M`,  txPkts:`${(h%7+1)*0.8}M`},
    {name:"ethernet1/2",  ip:"10.10.0.1",              mask:"/24", zone:"trust",     speed:"1G",    status:"up"         as const, desc:"Corp LAN Segment",       rxPkts:`${(h%12+2)*2.1}M`, txPkts:`${(h%8+1)*1.4}M`},
    {name:"ethernet1/3",  ip:"10.20.0.1",              mask:"/24", zone:"dmz",       speed:"1G",    status:"up"         as const, desc:"DMZ — Public Services",  rxPkts:`${(h%5+1)*0.4}M`,  txPkts:`${(h%4+1)*0.3}M`},
    {name:"ethernet1/4",  ip:"10.30.0.1",              mask:"/28", zone:"mgmt",      speed:"1G",    status:"up"         as const, desc:"OOB Management VLAN",    rxPkts:"12.4K",             txPkts:"8.2K"},
    {name:"ethernet1/5",  ip:"—",                      mask:"—",   zone:"—",         speed:"1G",    status:"admin-down" as const, desc:"(reserved)",             rxPkts:"—",                 txPkts:"—"},
    {name:"mgmt",         ip:"192.168.1.1",            mask:"/24", zone:"mgmt",      speed:"100M",  status:"up"         as const, desc:"OOB Console Port",       rxPkts:"2.1K",              txPkts:"1.8K"},
  ] : isSwitch ? [
    {name:"GigabitEthernet0/1",    ip:"—", mask:"—", zone:"VLAN-10",    speed:"1G",  status:"up"         as const, desc:"corp-dc-01",           rxPkts:`${(h%9+2)*1.1}M`,  txPkts:`${(h%6+1)*0.9}M`},
    {name:"GigabitEthernet0/2",    ip:"—", mask:"—", zone:"VLAN-10",    speed:"1G",  status:"up"         as const, desc:"prod-api-01",          rxPkts:`${(h%7+1)*0.8}M`,  txPkts:`${(h%5+1)*0.6}M`},
    {name:"GigabitEthernet0/3",    ip:"—", mask:"—", zone:"VLAN-100",   speed:"1G",  status:"up"         as const, desc:"iot-hub-01",           rxPkts:"4.2M",              txPkts:"3.1M"},
    {name:"GigabitEthernet0/4",    ip:"—", mask:"—", zone:"VLAN-10",    speed:"1G",  status:"up"         as const, desc:"HR-workstations",      rxPkts:"2.8M",              txPkts:"2.1M"},
    {name:"GigabitEthernet0/5",    ip:"—", mask:"—", zone:"VLAN-20",    speed:"1G",  status:"down"       as const, desc:"(unoccupied)",         rxPkts:"—",                 txPkts:"—"},
    {name:"GigabitEthernet0/6",    ip:"—", mask:"—", zone:"VLAN-20",    speed:"1G",  status:"down"       as const, desc:"(unoccupied)",         rxPkts:"—",                 txPkts:"—"},
    {name:"TenGigabitEthernet0/1", ip:"—", mask:"—", zone:"VLAN-trunk", speed:"10G", status:"up"         as const, desc:"Core uplink (trunk)",  rxPkts:`${(h%15+5)*3.2}M`, txPkts:`${(h%12+4)*2.8}M`},
    {name:"TenGigabitEthernet0/2", ip:"—", mask:"—", zone:"VLAN-trunk", speed:"10G", status:"admin-down" as const, desc:"Uplink standby",       rxPkts:"—",                 txPkts:"—"},
    {name:"Vlan10",                ip:"10.10.0.2", mask:"/24", zone:"VLAN-10", speed:"—", status:"up"   as const, desc:"SVI — Corp VLAN",      rxPkts:"—",                 txPkts:"—"},
  ] : [
    {name:"GigabitEthernet0/0", ip:asset.ip||"203.0.113.5", mask:"/30", zone:"outside", speed:"1G",   status:"up" as const, desc:"ISP Link (outside)",     rxPkts:`${(h%8+2)*0.9}M`,  txPkts:`${(h%6+1)*0.7}M`},
    {name:"GigabitEthernet0/1", ip:"10.0.0.5",              mask:"/24", zone:"inside",  speed:"1G",   status:"up" as const, desc:"Internal Network",       rxPkts:`${(h%10+3)*1.4}M`, txPkts:`${(h%8+2)*1.1}M`},
    {name:"Tunnel0",            ip:"10.100.0.1",            mask:"/30", zone:"vpn",     speed:"—",    status:"up" as const, desc:"VPN Tunnel — Branch A",  rxPkts:"892K",             txPkts:"671K"},
    {name:"Tunnel1",            ip:"10.100.0.5",            mask:"/30", zone:"vpn",     speed:"—",    status:"up" as const, desc:"VPN Tunnel — Branch B",  rxPkts:"234K",             txPkts:"182K"},
    {name:"mgmt",               ip:"192.168.2.1",           mask:"/24", zone:"mgmt",    speed:"100M", status:"up" as const, desc:"OOB Management",         rxPkts:"1.2K",             txPkts:"0.9K"},
  ];

  const routing = isFirewall ? [
    {dest:"0.0.0.0/0",        nextHop:"203.0.113.254", iface:"ethernet1/1", proto:"Static"    as const, metric:1,   age:"3d 12h"},
    {dest:"10.10.0.0/24",     nextHop:"—",             iface:"ethernet1/2", proto:"Connected" as const, metric:0,   age:"14d 6h"},
    {dest:"10.20.0.0/24",     nextHop:"—",             iface:"ethernet1/3", proto:"Connected" as const, metric:0,   age:"14d 6h"},
    {dest:"10.30.0.0/28",     nextHop:"—",             iface:"ethernet1/4", proto:"Connected" as const, metric:0,   age:"14d 6h"},
    {dest:"192.168.100.0/24", nextHop:"10.10.0.254",   iface:"ethernet1/2", proto:"OSPF"      as const, metric:110, age:"6h 22m"},
    {dest:"172.16.0.0/12",    nextHop:"10.10.0.1",     iface:"ethernet1/2", proto:"Static"    as const, metric:5,   age:"3d 12h"},
  ] : isSwitch ? [
    {dest:"10.10.0.0/24", nextHop:"—",         iface:"Vlan10",                proto:"Connected" as const, metric:0, age:"14d 2h"},
    {dest:"10.20.0.0/24", nextHop:"—",         iface:"Vlan20",                proto:"Connected" as const, metric:0, age:"14d 2h"},
    {dest:"0.0.0.0/0",    nextHop:"10.10.0.1", iface:"TenGigabitEthernet0/1", proto:"Static"    as const, metric:1, age:"2d 8h"},
  ] : [
    {dest:"0.0.0.0/0",       nextHop:"203.0.113.254", iface:"GigabitEthernet0/0", proto:"Static"    as const, metric:1, age:"5d 4h"},
    {dest:"10.0.0.0/24",     nextHop:"—",             iface:"GigabitEthernet0/1", proto:"Connected" as const, metric:0, age:"12d 1h"},
    {dest:"10.100.0.0/30",   nextHop:"—",             iface:"Tunnel0",            proto:"Connected" as const, metric:0, age:"12d 1h"},
    {dest:"10.100.0.4/30",   nextHop:"—",             iface:"Tunnel1",            proto:"Connected" as const, metric:0, age:"8d 3h"},
    {dest:"192.168.50.0/24", nextHop:"10.100.0.2",    iface:"Tunnel0",            proto:"Static"    as const, metric:1, age:"5d 4h"},
    {dest:"192.168.60.0/24", nextHop:"10.100.0.6",    iface:"Tunnel1",            proto:"Static"    as const, metric:1, age:"8d 3h"},
  ];

  const nat = isFirewall ? [
    {type:"Source NAT",      zone:"trust → untrust",   origSrc:"10.0.0.0/8",    origDst:"any",          transSrc:"203.0.113.1", transDst:"—",          hits:124892+(h%10000)},
    {type:"Source NAT",      zone:"dmz → untrust",     origSrc:"10.20.0.0/24",  origDst:"any",          transSrc:"203.0.113.2", transDst:"—",          hits:8234+(h%2000)},
    {type:"Destination NAT", zone:"untrust → dmz",     origSrc:"any",           origDst:"203.0.113.5",  transSrc:"—",           transDst:"10.20.0.10", hits:432+(h%200)},
    {type:"Destination NAT", zone:"untrust → trust",   origSrc:"any",           origDst:"203.0.113.10", transSrc:"—",           transDst:"10.10.0.20", hits:89+(h%50)},
  ] : !isSwitch ? [
    {type:"Source NAT", zone:"inside → outside", origSrc:"10.0.0.0/24", origDst:"any", transSrc:asset.ip||"203.0.113.5", transDst:"—", hits:56221+(h%5000)},
  ] : [];

  const fwInfo = mfr.includes("Palo Alto")
    ? {ver:"PAN-OS 11.1.3",  prev:"PAN-OS 11.1.2", date:"2025-11-15", avail:"PAN-OS 11.1.4"  as string|null, cves:1}
    : mfr.includes("Fortinet")
    ? {ver:"FortiOS 7.4.2",  prev:"FortiOS 7.4.1",  date:"2025-09-20", avail:null             as string|null, cves:0}
    : mfr.includes("Juniper")
    ? {ver:"Junos 23.4R1",   prev:"Junos 23.2R1",   date:"2025-07-10", avail:"Junos 24.1R1"  as string|null, cves:0}
    : {ver:isSwitch?"17.9.4a":"9.18.4", prev:isSwitch?"17.9.4":"9.18.3", date:"2025-08-12", avail:"17.12.1" as string|null, cves:2};

  return {
    model, platform, isFirewall, isSwitch, isVpn,
    totalPorts, upPorts, downPorts: totalPorts - upPorts,
    ifaces, routing, nat,
    asic: isFirewall?(mfr.includes("Palo Alto")?"Cavium Octeon III (CN78xx)":"Custom Security ASIC"):isSwitch?"Cisco UADP 3.0 ASIC":"Custom NPU",
    sysMem: isFirewall?(mfr.includes("Palo Alto")?"16 GB DDR4":"8 GB DDR3"):isSwitch?"4 GB DDR4":"8 GB DDR3",
    pktMem: isFirewall?"8 GB dedicated DRAM":"2 GB shared",
    psu: isFirewall?"2× 400W AC (HA redundant)":isSwitch&&hn.includes("core")?"2× 715W PoE+ (redundant)":"1× 250W AC",
    fwVer:fwInfo.ver, fwPrev:fwInfo.prev, fwDate:fwInfo.date, fwAvail:fwInfo.avail, fwCVEs:fwInfo.cves,
    formFactor: isFirewall?"2U Rack (19-inch)":isSwitch&&hn.includes("core")?"1U Rack (48P + 4×SFP+)":"1U Rack (48-port)",
    throughput: isFirewall?(mfr.includes("Palo Alto")?"5 Gbps FW / 2 Gbps NGFW":"1.8 Gbps FW"):isSwitch&&hn.includes("core")?"176 Gbps switching":"88 Gbps switching",
    supportUntil:`${2025+(h%3)}-${String((h%12)+1).padStart(2,"0")}-${String((h%28)+1).padStart(2,"0")}`,
  };
}

function AssetDetailPage({ asset, onBack, allAssets }: { asset:AssetEntry; onBack:()=>void; allAssets:AssetEntry[] }) {
  const [dTab, setDTab] = useState("overview");
  const [popup, setPopup]     = useState<PopupState|null>(null);
  const [assetTags, setAssetTags] = useState<string[]>(asset.tags);
  const [tagInput, setTagInput]   = useState("");
  const [swFilter, setSwFilter]   = useState<EolStatus|"All">("All");
  const [simManaged, setSimManaged] = useState(asset.managed);
  const [simPatched, setSimPatched] = useState(false);
  const [simAv, setSimAv]           = useState(asset.antivirus!=="None"&&asset.antivirus!=="N/A");
  const h = hashCode(asset.id);
  const conf = confidenceColor[asset.confidence];
  const hw     = getHardwareData(asset);
  const sw     = getSoftwareList(asset);
  const sec    = getSecTools(asset);
  const ndConf = asset.category === "Network" ? getNetworkDeviceConfig(asset) : null;

  // ── Applicability assessment ─────────────────────────────────────────────
  const isSaaS          = asset.category === "SaaS";
  const isSecurity      = asset.category === "Security";
  const isIdentity      = asset.category === "Identity";
  const isCloudApp      = isSaaS || isSecurity || isIdentity;
  const isNetworkDevice = asset.category === "Network";
  const isIoTorOT       = asset.category === "IoT" || asset.category === "OT";
  const isContainer     = asset.category === "Container";
  const hasSoftware     = !isNetworkDevice && !isIoTorOT && !isCloudApp;
  const hasFirmware     = isNetworkDevice || isIoTorOT;
  const hasHardware     = !isContainer && !isCloudApp;
  const hasAgent        = asset.category==="Server" || asset.category==="Workstation" || (asset.category==="Cloud" && (asset.os.includes("Linux")||asset.os.includes("Windows")||asset.os.includes("Amazon")||asset.os.includes("Ubuntu")||asset.os.includes("Rocky")||asset.os.includes("Debian")||asset.os.includes("macOS")));

  // ── AIGO-X Agent derived state ─────────────────────────────────────────────
  const agentInstalled  = hasAgent && asset.managed && asset.agentVersion !== "—";
  const agentOnline     = agentInstalled && asset.lastSeen === "Active";
  const agentStatus     = !agentInstalled ? "Not Installed" : agentOnline ? "Online" : asset.lastSeen.includes("hour") ? "Stale" : "Offline";
  const agentStatusColor = agentStatus==="Online"?EME:agentStatus==="Stale"?AMB:RED;
  const agentVer        = agentInstalled ? asset.agentVersion : `5.${1+(h%4)}.${h%20}.${1000+(h%8000)}`;
  const agentCheckIn    = agentOnline ? `2026-06-14 0${7+(h%8)}:${String(h%60).padStart(2,"0")}:${String((h*3)%60).padStart(2,"0")}` : asset.lastSeen==="Active"?"2026-06-14 06:00:00":"2026-06-10 14:22:11";
  const agentUptime     = agentOnline ? `${(h%89)+1} days ${(h%23)} hrs` : "—";
  const agentCPU        = agentOnline ? `${(0.2+(h%12)/10).toFixed(1)}%` : "—";
  const agentMemMB      = agentOnline ? `${38+(h%80)} MB` : "—";
  const agentEvtSec     = agentOnline ? `${12+(h%88)}/s` : "—";
  const agentNetKBs     = agentOnline ? `${2+(h%14)} KB/s` : "—";

  const agentModules = [
    { name:"ComplyOps",  icon:"📋", desc:"Compliance posture & evidence collection", active:agentInstalled, lastSync:agentOnline?"2026-06-14 06:00:00":"—", events:agentOnline?`${120+(h%400)}`:"—" },
    { name:"AssetOps",   icon:"🖥", desc:"CAASM inventory sync & fingerprinting",    active:agentInstalled, lastSync:agentOnline?"2026-06-14 07:01:00":"—", events:agentOnline?`${200+(h%300)}`:"—" },
    { name:"DataOps",    icon:"🗄", desc:"DSPM data store discovery & tagging",      active:agentInstalled && (asset.dept==="Data"||asset.dept==="Engineering"||asset.dept==="Finance"||asset.dept==="Legal"), lastSync:agentOnline?"2026-06-14 05:30:00":"—", events:agentOnline?`${50+(h%150)}`:"—" },
    { name:"SecOps",     icon:"🔐", desc:"EDR telemetry, threat & vulnerability",    active:agentInstalled, lastSync:agentOnline?"Continuous":"—", events:agentOnline?`${500+(h%2000)}`:"—" },
    { name:"ServiceOps", icon:"🎫", desc:"Service desk event correlation",           active:agentInstalled && asset.managed, lastSync:agentOnline?"2026-06-14 04:15:00":"—", events:agentOnline?`${10+(h%60)}`:"—" },
  ];

  const agentPolicies = [
    { name:"Endpoint Prevention Policy",         type:"Prevention",      priority:"P1", status:"Active", applied:`2026-0${5+(h%2)}-${String(1+(h%28)).padStart(2,"0")}`, scope:"All Managed Endpoints" },
    { name:`${asset.dept} DLP Classification`,   type:"Data Protection", priority:"P2", status:"Active", applied:"2026-06-01", scope:`${asset.dept} Department` },
    { name:"Vulnerability Scan — Weekly",        type:"Vuln Mgmt",       priority:"P2", status:"Active", applied:"2026-05-12", scope:"Full Fleet" },
    { name:asset.os.includes("Windows")?"CIS Windows Server 2022 Benchmark":asset.os.includes("macOS")?"CIS macOS Sonoma Benchmark":"CIS Ubuntu 22.04 LTS Benchmark", type:"Config Compliance", priority:"P2", status:"Active", applied:"2026-04-20", scope:`${asset.category}s` },
    { name:"Incident Response Playbook v3",      type:"IR",              priority:"P3", status:"Active", applied:"2026-03-01", scope:"All Assets" },
    ...(asset.risk==="Critical"||asset.risk==="High"?[{ name:"High-Risk Endpoint Monitoring", type:"Threat Detection", priority:"P1", status:"Active", applied:"2026-06-10", scope:"High+Critical Assets" }]:[]),
  ];

  const detailTabs = [
    { key:"overview",     label:"Overview" },
    ...(hasHardware ? [{ key:"hardware", label:"Hardware" }] : []),
    ...(hasSoftware ? [{ key:"software", label:"Software", dot:sw.some(s=>s.eolStatus==="EOL"||s.eolStatus==="EOS")?"#DC2626":undefined }] : []),
    ...(hasFirmware ? [{ key:"firmware", label:"Firmware", dot:ndConf&&ndConf.fwCVEs>0?"#DC2626":undefined }] : []),
    ...(!isCloudApp ? [{ key:"network", label:isNetworkDevice?"Net Config":"Network" }] : []),
    { key:"lifecycle",    label:"Lifecycle" },
    { key:"risk",         label:"Risk",  dot:asset.critVulns>0?"#DC2626":undefined },
    { key:"controls",     label:"Controls" },
    ...(hasAgent ? [{ key:"agent", label:"AIGO-X Agent", dot:agentStatus!=="Online"&&agentInstalled?"#EF4444":undefined }] : []),
    { key:"compliance",   label:"Compliance" },
    { key:"dependencies", label:"Dependencies" },
    { key:"ai",           label:"AI Analysis" },
    { key:"history",      label:"History" },
  ];

  const purchaseDate = `${2020+(h%4)}-${String((h%12)+1).padStart(2,"0")}-${String((h%28)+1).padStart(2,"0")}`;
  const deployDate   = `${2021+((h+1)%4)}-${String(((h+3)%12)+1).padStart(2,"0")}-${String(((h+7)%28)+1).padStart(2,"0")}`;
  const warrantyDate = `${2026+(h%3)}-${String((h%12)+1).padStart(2,"0")}-${String((h%28)+1).padStart(2,"0")}`;
  const nextReview   = `2026-${String(((h+5)%12)+1).padStart(2,"0")}-${String(((h+11)%28)+1).padStart(2,"0")}`;

  const fwMap: Record<string,string[]> = {
    Server:["SOC 2 Type II","ISO 27001","NIST CSF"],
    Workstation:["CIS Benchmarks","ISO 27001","NIST SP 800-53"],
    IoT:["NIST SP 800-213","IEC 62443","ISO 27001"],
    Mobile:["SOC 2 Type II","CIS Benchmarks","GDPR"],
    Network:["NIST CSF","PCI DSS v4.0","CIS Benchmarks"],
    OT:["IEC 62443","NIST SP 800-82","NERC CIP"],
    Cloud:["SOC 2 Type II","ISO 27001","CSA CCM"],
    Container:["CIS Benchmarks","NIST SP 800-190","SOC 2 Type II"],
    Unknown:["ISO 27001","NIST CSF","SOC 2 Type II"],
  };
  const fwNames = fwMap[asset.category] ?? ["ISO 27001","NIST CSF"];
  const fwCompliance = fwNames.map((name,i) => {
    const base = Math.max(32, 100-asset.exposureScore+((h+i*13)%20)-8);
    const controls = 12+(h%8);
    const passed = Math.round((base/100)*controls);
    return { name, pct:base, controls, passed, status:base>=80?"Compliant":base>=55?"Partially Compliant":"Non-Compliant" };
  });

  const cvePool = [
    { id:"CVE-2024-21626", cvss:9.0, severity:"Critical", component:"runc 1.1.4",   desc:"Container escape via /proc/self/cwd symlink", epss:48, patch:"runc v1.1.12", cisaKev:true, published:"2024-01-31" },
    { id:"CVE-2023-44487", cvss:7.5, severity:"High",     component:"HTTP/2 stack", desc:"Rapid Reset attack — distributed DoS vulnerability", epss:32, patch:"Apply vendor HTTP/2 mitigations", cisaKev:true, published:"2023-10-10" },
    { id:"CVE-2024-3094",  cvss:10.0,severity:"Critical", component:"XZ Utils 5.6", desc:"Supply chain backdoor in liblzma affecting SSH", epss:72, patch:"Downgrade to XZ Utils 5.4.x", cisaKev:true, published:"2024-03-29" },
    { id:"CVE-2023-4911",  cvss:7.8, severity:"High",     component:"glibc 2.37",   desc:"Buffer overflow in glibc dynamic loader (Looney Tunables)", epss:55, patch:"glibc 2.38+", cisaKev:false, published:"2023-10-03" },
    { id:"CVE-2024-0727",  cvss:5.5, severity:"Medium",   component:"OpenSSL 3.0",  desc:"NULL pointer deref in PKCS12 parsing", epss:8, patch:"OpenSSL 3.0.14+", cisaKev:false, published:"2024-01-25" },
    { id:"CVE-2024-21893", cvss:8.2, severity:"High",     component:"Ivanti ICS",   desc:"SSRF vulnerability in Ivanti Connect Secure SAML component", epss:63, patch:"Vendor patch KB-CVE-2024-21893", cisaKev:true, published:"2024-01-31" },
    { id:"CVE-2024-1709",  cvss:10.0,severity:"Critical", component:"ConnectWise",  desc:"Authentication bypass — unauthenticated RCE", epss:88, patch:"ConnectWise ScreenConnect 23.9.10", cisaKev:true, published:"2024-02-21" },
    { id:"CVE-2024-6387",  cvss:8.1, severity:"High",     component:"OpenSSH 8.9",  desc:"Race condition in OpenSSH signal handler (regreSSHion)", epss:44, patch:"OpenSSH 9.8p1", cisaKev:false, published:"2024-07-01" },
  ];
  const vulns = cvePool.slice(0, Math.min(asset.vulnCount, cvePool.length));

  const ctrlMap: Record<string,{name:string;status:"Implemented"|"Partial"|"Not Implemented";eff:number}[]> = {
    Server:     [{ name:"Endpoint Detection & Response", status:"Implemented", eff:88 },{ name:"Patch Management", status:"Partial", eff:62 },{ name:"CIS Configuration Hardening", status:"Implemented", eff:75 },{ name:"File Integrity Monitoring", status:"Partial", eff:55 },{ name:"Privileged Access Management", status:"Not Implemented", eff:0 }],
    Workstation:[{ name:"Endpoint Detection & Response", status:"Implemented", eff:91 },{ name:"Full Disk Encryption", status:"Implemented", eff:100 },{ name:"Mobile Device Management", status:"Implemented", eff:85 },{ name:"Application Whitelisting", status:"Not Implemented", eff:0 }],
    Network:    [{ name:"Network Segmentation", status:"Implemented", eff:80 },{ name:"Firmware Update Management", status:"Partial", eff:50 },{ name:"SNMP v3 / Secure Management", status:"Implemented", eff:82 },{ name:"Flow Monitoring (NetFlow)", status:"Partial", eff:60 }],
    IoT:        [{ name:"Network Isolation / VLAN", status:"Partial", eff:45 },{ name:"Firmware Management", status:"Not Implemented", eff:0 },{ name:"Device Authentication", status:"Not Implemented", eff:0 },{ name:"Anomaly Detection", status:"Partial", eff:35 }],
    Mobile:     [{ name:"MDM Enrollment", status:"Implemented", eff:92 },{ name:"App Compliance Policy", status:"Implemented", eff:80 },{ name:"Remote Wipe Capability", status:"Implemented", eff:100 },{ name:"Certificate-based Auth", status:"Partial", eff:60 }],
    Cloud:      [{ name:"Cloud Security Posture Mgmt", status:"Implemented", eff:82 },{ name:"IAM Least Privilege", status:"Partial", eff:68 },{ name:"Encryption at Rest & Transit", status:"Implemented", eff:95 },{ name:"Security Groups / NACLs", status:"Implemented", eff:80 }],
    Container:  [{ name:"Image Vulnerability Scanning", status:"Implemented", eff:78 },{ name:"Runtime Security (Falco)", status:"Implemented", eff:82 },{ name:"Network Policies", status:"Partial", eff:58 },{ name:"Secrets Management", status:"Partial", eff:65 }],
    OT:         [{ name:"Network Isolation", status:"Partial", eff:50 },{ name:"Change Management Controls", status:"Partial", eff:45 },{ name:"Remote Access Security", status:"Not Implemented", eff:0 },{ name:"Safety System Protection", status:"Implemented", eff:70 }],
    Unknown:    [{ name:"Access Control Policy", status:"Partial", eff:60 },{ name:"Data Loss Prevention", status:"Partial", eff:45 },{ name:"Activity Logging / SIEM", status:"Implemented", eff:72 },{ name:"Third-party Risk Assessment", status:"Not Implemented", eff:0 }],
  };
  const controls = (ctrlMap[asset.category] ?? ctrlMap.Server).map(c => ({
    ...c, eff:simManaged?c.eff:Math.max(0,c.eff-30),
    status:(simManaged?c.status:c.status==="Implemented"?"Partial":"Not Implemented") as "Implemented"|"Partial"|"Not Implemented",
  }));

  const lifecycleStages = ["Procurement","Onboarding","Active","Periodic Review","Decommission"];
  const stageIdx = asset.managed ? (asset.lastSeen === "Active" ? 3 : 2) : 1;

  const ownerMap: Record<string,{name:string;email:string;unit:string}> = {
    "IT Ops":    {name:"Alex Thompson",email:"a.thompson@acme.com",unit:"CTO Office"},
    "Engineering":{name:"Sarah Chen",email:"s.chen@acme.com",unit:"VP Engineering"},
    "Finance":   {name:"Michael Ross",email:"m.ross@acme.com",unit:"CFO Office"},
    "Security":  {name:"James Wilson",email:"j.wilson@acme.com",unit:"CISO"},
    "Sales":     {name:"Emma Davis",email:"e.davis@acme.com",unit:"VP Sales"},
    "Data":      {name:"Priya Patel",email:"p.patel@acme.com",unit:"CDO Office"},
    "Facilities":{name:"Robert Kim",email:"r.kim@acme.com",unit:"COO Office"},
    "Operations":{name:"Carlos Ruiz",email:"c.ruiz@acme.com",unit:"VP Operations"},
    "HR":        {name:"Lisa Anderson",email:"l.anderson@acme.com",unit:"CHRO Office"},
    "Marketing": {name:"Tom Brown",email:"t.brown@acme.com",unit:"CMO Office"},
    "Management":{name:"Jennifer Lee",email:"j.lee@acme.com",unit:"CEO Office"},
    "Compliance":{name:"Karen White",email:"k.white@acme.com",unit:"General Counsel"},
  };
  const owner = ownerMap[asset.dept] ?? {name:"Unassigned",email:"—",unit:"—"};

  const sensLabels = ["Restricted","Confidential","Internal","Public"];
  const envLabels  = ["Production","Corporate","Development","DR"];
  const dataSens   = sensLabels[h%4];
  const envLabel   = asset.category==="Cloud"?"Production":envLabels[(h+1)%4];

  const deployTarget = asset.category==="Cloud"
    ? {target:asset.manufacturer,type:"Cloud VM / PaaS",region:asset.manufacturer.includes("AWS")?"us-east-1":"westeurope",provider:asset.manufacturer.includes("AWS")?"Amazon Web Services":"Microsoft Azure",dc:"Cloud-hosted",rack:"N/A (Cloud)"}
    : {target:"DC1 — Primary Datacenter",type:"Physical / On-Premises",region:"US East",provider:"On-Premises",dc:"DC1 — Acme HQ",rack:`Rack R${(h%12)+1}-U${(h%24)+1}`};

  const subnet    = asset.ip!=="DHCP"&&asset.ip!=="—"?`${asset.ip.split(".").slice(0,3).join(".")}.0/24`:"Cloud / Dynamic";
  const vlanId    = asset.category==="IoT"?"VLAN-100":asset.category==="OT"?"VLAN-200":asset.category==="Cloud"?"VLAN-30":"VLAN-10";
  const dnsRecord = asset.ip==="—"||asset.ip==="DHCP"?"Cloud-managed":`${asset.hostname}.acme.int`;

  const openPorts = asset.category==="Server"    ? [22,80,443,3306,5432,8080].slice(0,3+(h%3))
    : asset.category==="Network"   ? [22,23,80,443,161,162].slice(0,3+(h%2))
    : asset.category==="Workstation"? [3389,445,135,139].slice(0,2+(h%2))
    : asset.category==="Cloud"     ? [22,443,8080,8443].slice(0,2+(h%2))
    : [80,443];

  const deps = [
    { dir:"upstream"   as const, target:asset.category==="Cloud"?"cloudflare-cdn.acme.int":"fw-perimeter-01.acme.int", type:"network",       label:"Network Route" },
    { dir:"upstream"   as const, target:"ad-domain-controller-01.acme.int",                                            type:"identity",      label:"AD Authentication" },
    { dir:"downstream" as const, target:asset.vulnCount>2?"siem-splunk-cloud":"monitoring-datadog",                   type:"management",    label:"Log Forwarding" },
    { dir:"downstream" as const, target:"vault-secrets-prod.acme.int",                                                type:"app-dependency",label:"Secrets Fetch" },
  ];

  const timeline = [
    { ts:"2026-06-13", field:"agentVersion", from:"prev version",to:asset.agentVersion,source:asset.antivirus },
    { ts:"2026-06-08", field:"ip",           from:`${asset.ip.split(".").slice(0,3).join(".")}.99`,to:asset.ip,source:"Active Directory" },
    { ts:"2026-05-31", field:"risk",         from:"Low",to:asset.risk,source:"Tenable.sc" },
    { ts:"2026-05-15", field:"os",           from:"Previous version",to:asset.os,source:"SCCM" },
    { ts:"2026-04-20", field:"managed",      from:"false",to:String(asset.managed),source:"ServiceNow CMDB" },
  ];

  const recs: {priority:string;text:string;effort:string}[] = [];
  if (asset.critVulns>0) recs.push({priority:"Critical",text:`Patch ${asset.critVulns} critical CVE(s) immediately — schedule emergency change window`,effort:"High"});
  if (!asset.managed)    recs.push({priority:"High",text:"Enroll asset in management platform (MDM/EDR) to restore full visibility",effort:"Medium"});
  if (asset.exposureScore>70) recs.push({priority:"High",text:"Reduce attack surface — review firewall rules and network access controls",effort:"High"});
  if (asset.vulnCount>3) recs.push({priority:"Medium",text:`Remediate ${asset.vulnCount} open vulnerabilities per quarterly patch schedule`,effort:"Medium"});
  if (asset.risk==="Critical"||asset.risk==="High") recs.push({priority:"Medium",text:"Schedule risk re-assessment within 30 days",effort:"Low"});
  recs.push({priority:"Low",text:"Verify asset owner and classification accuracy in CMDB",effort:"Low"});

  // ── Dynamic risk score ──
  const computeRiskScore = (managed:boolean, patched:boolean, av:boolean) => {
    let s = 0;
    s += (patched?0:asset.critVulns) * 18;
    s += (patched?0:Math.max(0,asset.vulnCount-asset.critVulns)) * 4;
    s += managed?0:22;
    s += asset.exposureScore * 0.35;
    s += av?0:12;
    return Math.min(100,Math.round(s));
  };
  const simScore     = computeRiskScore(simManaged,simPatched,simAv);
  const baseScore    = computeRiskScore(asset.managed,false,asset.antivirus!=="None"&&asset.antivirus!=="N/A");
  const scoreColor   = simScore>70?RED:simScore>40?AMB:EME;

  const sHdr = (label:string) => (
    <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", marginBottom:10, textTransform:"uppercase" as const }}>{label}</div>
  );
  const infoRow = (k:string, v:React.ReactNode) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11, gap:8 }}>
      <span style={{ color:"var(--muted-foreground)", fontWeight:600, whiteSpace:"nowrap" as const }}>{k}</span>
      <span style={{ color:"var(--foreground)", fontWeight:700, textAlign:"right" as const }}>{v}</span>
    </div>
  );

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {popup && <DetailPopup popup={popup} onClose={()=>setPopup(null)} allAssets={allAssets} />}

      {/* ── Header ── */}
      <div style={{ padding:"12px 20px", background:"var(--card)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
        <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", cursor:"pointer", fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", flexShrink:0 }}>← Back</button>
        <div style={{ width:1, height:24, background:"var(--border)", flexShrink:0 }} />
        <Mono>{asset.id}</Mono>
        {isCloudApp && (() => { const lu = getSaasLogoUrl(asset.manufacturer, asset.hostname); return lu ? <img src={lu} alt={asset.manufacturer} onError={e=>{(e.target as HTMLImageElement).style.display="none"}} style={{ width:36, height:36, borderRadius:8, objectFit:"contain", background:"white", padding:4, border:"1px solid rgba(255,255,255,0.1)", flexShrink:0 }} /> : null; })()}
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:"var(--foreground)", lineHeight:1.2 }}>{asset.hostname}</div>
          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{asset.category} · {asset.dept} · {asset.manufacturer}</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          <RiskBadge level={asset.risk} />
          <span style={{ background:conf.bg, color:conf.color, border:`1px solid ${conf.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{asset.confidence} Confidence</span>
          <span style={{ background:asset.managed?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", color:asset.managed?EME:RED, border:`1px solid ${asset.managed?"#A7F3D0":"#FECACA"}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{asset.managed?"Managed":"Unmanaged"}</span>
          <button onClick={()=>setDTab("ai")} style={{ padding:"5px 14px", borderRadius:6, border:"none", background:"linear-gradient(135deg,#1D4ED8,#7C3AED)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>✦ Run AI Analysis</button>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ background:"var(--card)", borderBottom:"2px solid var(--border)", display:"flex", flexShrink:0, overflowX:"auto" }}>
        {detailTabs.map(t => (
          <button key={t.key} onClick={()=>setDTab(t.key)} style={{ padding:"11px 18px", border:"none", borderBottom:`2px solid ${dTab===t.key?NAV:"transparent"}`, marginBottom:-2, background:"none", cursor:"pointer", fontSize:12, fontWeight:dTab===t.key?700:500, color:dTab===t.key?"var(--foreground)":"var(--muted-foreground)", whiteSpace:"nowrap" as const, transition:"color 0.15s", display:"flex", alignItems:"center", gap:5 }}>
            {t.label}
            {t.dot && <span style={{ width:6, height:6, borderRadius:"50%", background:t.dot, flexShrink:0 }} />}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex:1, overflow:"auto", padding:"20px 20px 32px" }}>

        {/* ════════════════ OVERVIEW ════════════════ */}
        {dTab==="overview" && !isCloudApp && (
          <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
            <div style={{ flex:"0 0 auto", width:"calc(65% - 10px)", display:"flex", flexDirection:"column", gap:14 }}>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Asset Summary")}
                <p style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.75, margin:0 }}>
                  <strong>{asset.hostname}</strong> is a <strong>{asset.managed?"managed":"unmanaged"}</strong> {asset.category.toLowerCase()} running <strong>{asset.os}</strong> in the <strong>{asset.dept}</strong> department. Classified as <strong style={{ color:asset.risk==="Critical"?RED:asset.risk==="High"?AMB:EME }}>{asset.risk} risk</strong> with an exposure score of <strong>{asset.exposureScore}/100</strong>. {asset.critVulns>0?`The system has ${asset.critVulns} critical CVE(s) requiring immediate remediation.`:asset.vulnCount>0?`${asset.vulnCount} open vulnerabilities detected.`:"No critical vulnerabilities detected."} {!asset.managed?"⚠ Operating outside the managed fleet — visibility gaps exist.":""}
                </p>
              </div>

              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Technical Details — Click Any Field to Explore")}
                {infoRow("Asset ID",         <Mono>{asset.id}</Mono>)}
                {infoRow("Hostname / FQDN",  <Chip onClick={()=>setPopup({type:"dns",title:`DNS: ${dnsRecord}`,data:{fqdn:dnsRecord,ip:asset.ip,hostname:asset.hostname}})}>{asset.hostname}</Chip>)}
                {infoRow("Category",         <Chip onClick={()=>setPopup({type:"category",title:`Category: ${asset.category}`,data:{category:asset.category}})}>{asset.category}</Chip>)}
                {infoRow("Operating System", asset.os)}
                {infoRow("IP Address",       asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:"var(--muted-foreground)" }}>{asset.ip}</span>:<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${asset.ip}`,data:{ip:asset.ip,hostname:asset.hostname}})}>{asset.ip}</Chip>)}
                {infoRow("Subnet",           asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:"var(--muted-foreground)" }}>Dynamic</span>:<Chip onClick={()=>setPopup({type:"subnet",title:`Subnet: ${subnet}`,data:{cidr:subnet,gw:`${asset.ip.split(".").slice(0,3).join(".")}.1`}})}>{subnet}</Chip>)}
                {infoRow("VLAN",             <Chip onClick={()=>setPopup({type:"vlan",title:vlanId,data:{vlanId:vlanId.split(" ")[0]}})}>{vlanId}</Chip>)}
                {infoRow("DNS Record",       <Chip onClick={()=>setPopup({type:"dns",title:`DNS: ${dnsRecord}`,data:{fqdn:dnsRecord,ip:asset.ip,hostname:asset.hostname}})}>{dnsRecord}</Chip>)}
                {infoRow("Manufacturer / Vendor", asset.manufacturer)}
                {infoRow("Deployed On",      <Chip onClick={()=>setPopup({type:"deploy",title:`Deploy Target: ${deployTarget.target}`,data:deployTarget})}>{deployTarget.target}</Chip>)}
                {infoRow("Antivirus / EDR",  asset.antivirus!=="None"&&asset.antivirus!=="N/A"?<Chip onClick={()=>{const s=sec.find(t=>t.name.includes(asset.antivirus.split(" ")[0]));setPopup({type:"app",title:asset.antivirus,data:{name:s?.name??asset.antivirus,version:s?.version??"N/A",publisher:s?.vendor??"Unknown",eolDate:null,eolStatus:"Current" as EolStatus,category:"Security / EDR",cveCount:0,latestVersion:"Current",installDate:"2024-01-15",fleetCount:3318,license:"Commercial"}});}}>{asset.antivirus}</Chip>:<span style={{ color:RED }}>⚠ {asset.antivirus}</span>)}
                {infoRow("Agent Version",    <Mono style={{ fontSize:10 }}>{asset.agentVersion}</Mono>)}
                {infoRow("Last Seen",        asset.lastSeen)}
                {infoRow("Data Sources",     `${asset.sources} integrated sources`)}
                {infoRow("Vulnerabilities",  <span style={{ color:asset.critVulns>0?RED:asset.vulnCount>0?AMB:EME }}>{asset.vulnCount} total · {asset.critVulns} critical</span>)}
              </div>

              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Key Dates")}
                {infoRow("Purchase / Onboarding", purchaseDate)}
                {infoRow("Deployment Date",        deployDate)}
                {infoRow("Warranty / Support Expiry", warrantyDate)}
                {infoRow("Next Scheduled Review",  nextReview)}
                {infoRow("Record Last Updated",    "2026-06-13")}
              </div>

              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Compliance Frameworks in Scope")}
                {fwCompliance.map(fw => {
                  const fc = fw.pct>=80?EME:fw.pct>=55?AMB:RED;
                  return (
                    <div key={fw.name} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>{fw.name}</span>
                          <span style={{ fontSize:9, fontWeight:700, color:fw.status==="Compliant"?EME:fw.status==="Partially Compliant"?AMB:RED, background:fw.status==="Compliant"?"rgba(34,197,94,0.08)":fw.status==="Partially Compliant"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)", padding:"1px 6px", borderRadius:3 }}>{fw.status}</span>
                        </div>
                        <span style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:fc }}>{fw.pct}%</span>
                      </div>
                      <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:4 }}>
                        <div style={{ width:`${fw.pct}%`, height:"100%", background:fc, borderRadius:3 }} />
                      </div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{fw.passed}/{fw.controls} controls passing</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ flex:"0 0 auto", width:"calc(35% - 10px)", display:"flex", flexDirection:"column", gap:12 }}>
              <div style={card({ padding:"16px 18px" })}>
                {sHdr("Risk & Classification")}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", marginBottom:6 }}>
                  <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Risk Level</span>
                  <RiskBadge level={asset.risk} />
                </div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                    <span style={{ color:"var(--muted-foreground)" }}>Exposure Score</span>
                    <span style={{ fontWeight:800, color:asset.exposureScore>70?RED:asset.exposureScore>40?AMB:EME }}>{asset.exposureScore}/100</span>
                  </div>
                  <div style={{ height:5, borderRadius:3, background:"var(--input)" }}>
                    <div style={{ width:`${asset.exposureScore}%`, height:"100%", background:asset.exposureScore>70?RED:asset.exposureScore>40?AMB:EME, borderRadius:3 }} />
                  </div>
                </div>
                {infoRow("Detection Confidence", asset.confidence)}
                {infoRow("Data Sensitivity",     dataSens)}
                {infoRow("Environment",          envLabel)}
                {infoRow("Management Status",    asset.managed?"✓ Managed":"⚠ Unmanaged")}
              </div>

              <div style={card({ padding:"16px 18px" })}>
                {sHdr("Ownership")}
                {infoRow("Asset Owner",   <Chip onClick={()=>setPopup({type:"user",title:`Owner: ${owner.name}`,data:{...owner,dept:asset.dept}})}>{owner.name}</Chip>)}
                {infoRow("Contact",       <span style={{ fontSize:10 }}>{owner.email}</span>)}
                {infoRow("Department",    asset.dept)}
                {infoRow("Business Unit", owner.unit)}
              </div>

              <div style={card({ padding:"16px 18px" })}>
                {sHdr("Asset Value")}
                {infoRow("Business Criticality", asset.risk==="Critical"?"Mission Critical":asset.risk==="High"?"Business Critical":asset.risk==="Medium"?"Important":"Standard")}
                {infoRow("Impact if Compromised",asset.risk==="Critical"?"Catastrophic":asset.risk==="High"?"Major":"Moderate")}
                {infoRow("Est. Asset Value",     `$${(asset.exposureScore*1200+h%50000).toLocaleString()}`)}
              </div>

              {/* Dynamic Tags */}
              <div style={card({ padding:"16px 18px" })}>
                {sHdr("Tags — Click × to Remove")}
                <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5, marginBottom:10 }}>
                  {assetTags.map(t=>(
                    <span key={t} style={{ background:"var(--input)", color:"var(--foreground)", borderRadius:4, padding:"3px 8px 3px 9px", fontSize:10, fontWeight:600, border:"1px solid rgba(255,255,255,0.1)", display:"inline-flex", alignItems:"center", gap:5 }}>
                      {t}
                      <button onClick={()=>setAssetTags(prev=>prev.filter(x=>x!==t))} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted-foreground)", fontSize:12, lineHeight:1, padding:0 }}>×</button>
                    </span>
                  ))}
                  {assetTags.length===0&&<span style={{ fontSize:10, color:"var(--muted-foreground)" }}>No tags</span>}
                </div>
                <div style={{ display:"flex", gap:5 }}>
                  <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&tagInput.trim()){setAssetTags(p=>[...p,tagInput.trim()]);setTagInput("");}}} placeholder="Add tag…" style={{ flex:1, padding:"5px 8px", borderRadius:5, border:"1px solid rgba(255,255,255,0.1)", background:"var(--input)", fontSize:10, color:"var(--foreground)", fontFamily:"inherit" }} />
                  <button onClick={()=>{if(tagInput.trim()){setAssetTags(p=>[...p,tagInput.trim()]);setTagInput("");}}} style={{ padding:"5px 10px", borderRadius:5, border:"none", background:NAV, color:"white", fontSize:10, fontWeight:700, cursor:"pointer" }}>+</button>
                </div>
              </div>

              <div style={card({ padding:"16px 18px" })}>
                {sHdr("Open Ports")}
                <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
                  {openPorts.map(p=>(
                    <span key={p} onClick={()=>setPopup({type:"port",title:`Port ${p}`,data:{port:p,ip:asset.ip}})} style={{ background:"rgba(29,78,216,0.1)", color:BLU, border:"1px solid rgba(59,130,246,0.25)", borderRadius:4, padding:"4px 10px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, cursor:"pointer" }}>{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ SaaS APPLICATION OVERVIEW ════════════════ */}
        {dTab==="overview" && isCloudApp && (() => {
          const sm = getSaaSMeta(asset);
          const logoUrl = getSaasLogoUrl(asset.manufacturer, asset.hostname);
          const utilizePct = Math.round(sm.activeUsers/sm.licensedUsers*100);
          return (
            <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
              {/* ─── Left 65% ─── */}
              <div style={{ flex:"0 0 auto", width:"calc(65% - 10px)", display:"flex", flexDirection:"column", gap:14 }}>
                {/* Hero */}
                <div style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
                    {logoUrl && <img src={logoUrl} alt={asset.manufacturer} onError={e=>{(e.target as HTMLImageElement).style.display="none"}} style={{ width:60, height:60, borderRadius:10, objectFit:"contain", background:"white", padding:7, border:"1px solid rgba(255,255,255,0.12)", flexShrink:0 }} />}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>{asset.manufacturer}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:6 }}>{asset.os}</div>
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
                        {sm.ssoEnabled && <span style={{ fontSize:9, fontWeight:700, background:"rgba(34,197,94,0.1)", color:EME, border:"1px solid rgba(34,197,94,0.3)", borderRadius:4, padding:"2px 7px" }}>✓ SSO Active</span>}
                        {sm.mfaEnforced && <span style={{ fontSize:9, fontWeight:700, background:"rgba(34,197,94,0.1)", color:EME, border:"1px solid rgba(34,197,94,0.3)", borderRadius:4, padding:"2px 7px" }}>✓ MFA Enforced</span>}
                        <span style={{ fontSize:9, fontWeight:700, background:"rgba(29,78,216,0.1)", color:BLU, border:"1px solid rgba(59,130,246,0.3)", borderRadius:4, padding:"2px 7px" }}>{sm.plan}</span>
                        <span style={{ fontSize:9, fontWeight:700, background:"rgba(8,145,178,0.1)", color:CYN, border:"1px solid rgba(8,145,178,0.3)", borderRadius:4, padding:"2px 7px" }}>☁ {sm.dataRegion}</span>
                        <span style={{ fontSize:9, fontWeight:700, background:"rgba(5,150,105,0.1)", color:GRN, border:"1px solid rgba(5,150,105,0.3)", borderRadius:4, padding:"2px 7px" }}>↑ {sm.uptime}</span>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.75, margin:0 }}>
                    {isSecurity ? (
                      <><strong>{asset.hostname}</strong> is a sanctioned <strong>{asset.category === "Security" ? (asset.os.toLowerCase().includes("splunk")||asset.os.toLowerCase().includes("siem") ? "SIEM" : asset.os.toLowerCase().includes("crowdstrike")||asset.os.toLowerCase().includes("edr")||asset.os.toLowerCase().includes("falcon") ? "EDR" : "Security") : "Security"} platform</strong> by <strong>{asset.manufacturer}</strong> ({asset.os}), managed by the <strong>{asset.dept}</strong> team. Provides security monitoring and threat detection across the enterprise. Classified as <strong style={{ color:asset.risk==="Critical"?RED:asset.risk==="High"?AMB:EME }}>{asset.risk} risk</strong> — exposure score <strong>{asset.exposureScore}/100</strong>.</>
                    ) : isIdentity ? (
                      <><strong>{asset.hostname}</strong> is the enterprise <strong>Identity & Access Management</strong> platform by <strong>{asset.manufacturer}</strong> ({asset.os}), serving <strong style={{ color:BLU }}>{sm.activeUsers.toLocaleString()}</strong> active users in <strong>{sm.dataRegion}</strong>. Provides SSO, MFA, and lifecycle management for all enterprise applications. Classified as <strong style={{ color:asset.risk==="Critical"?RED:asset.risk==="High"?AMB:EME }}>{asset.risk} risk</strong> — exposure score <strong>{asset.exposureScore}/100</strong>.</>
                    ) : (
                      <><strong>{asset.hostname}</strong> is a sanctioned <strong>{sm.plan}</strong> SaaS application by <strong>{asset.manufacturer}</strong>, serving <strong style={{ color:BLU }}>{sm.activeUsers.toLocaleString()}</strong> active users ({sm.licensedUsers.toLocaleString()} licensed) in the <strong>{asset.dept}</strong> department. Data is hosted in <strong>{sm.dataRegion}</strong>. Classified as <strong style={{ color:asset.risk==="Critical"?RED:asset.risk==="High"?AMB:EME }}>{asset.risk} risk</strong> — exposure score <strong>{asset.exposureScore}/100</strong>.</>
                    )}
                  </p>
                </div>
                {/* Service Details */}
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Service Details")}
                  {infoRow("Service URL",      <a href={sm.serviceUrl} target="_blank" rel="noopener noreferrer" style={{ color:CYN, fontFamily:"'JetBrains Mono',monospace", fontSize:10, textDecoration:"none" }}>{sm.serviceUrl||"—"}</a>)}
                  {infoRow("Tenant / Org ID",  <Mono style={{ fontSize:10 }}>{sm.tenantId}</Mono>)}
                  {infoRow("Plan Tier",        <span style={{ color:BLU, fontWeight:700 }}>{sm.plan}</span>)}
                  {infoRow("Data Region",      sm.dataRegion)}
                  {infoRow("Uptime SLA",       <span style={{ color:EME, fontWeight:700 }}>{sm.uptime}</span>)}
                  {infoRow("API Integrations", `${sm.apiIntegrations} connected systems`)}
                  {infoRow("Last Seen",        asset.lastSeen)}
                  {infoRow("Data Sources",     `${asset.sources} integrated source${asset.sources!==1?"s":""}`)}
                </div>
                {/* Identity & Access Control */}
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Identity & Access Control")}
                  {infoRow("SSO",              sm.ssoEnabled ? <span style={{ color:EME }}>✓ Configured — SAML 2.0 via Okta</span> : <span style={{ color:RED }}>⚠ Not configured</span>)}
                  {infoRow("MFA Enforcement",  sm.mfaEnforced ? <span style={{ color:EME }}>✓ Enforced for all users</span> : <span style={{ color:AMB }}>⚠ Enabled, not enforced</span>)}
                  {infoRow("SCIM Provisioning",asset.managed ? <span style={{ color:EME }}>✓ Active — Okta → {asset.manufacturer}</span> : <span style={{ color:RED }}>⚠ Manual provisioning</span>)}
                  {infoRow("API Auth Method",  "OAuth 2.0 / Service Account tokens")}
                  {infoRow("Admin Contact",    <Chip onClick={()=>setPopup({type:"user",title:`Admin: ${sm.adminContact}`,data:{name:sm.adminContact,email:sm.adminEmail,dept:asset.dept,unit:"IT Administration",phone:"+1 (415) 555-0199",role:"SaaS Application Owner"}})}>{sm.adminContact}</Chip>)}
                  {infoRow("Admin Email",      <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>{sm.adminEmail}</span>)}
                </div>
                {/* Licenses & Usage */}
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Licenses & Usage")}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5 }}>
                      <span style={{ color:"var(--muted-foreground)" }}>License Utilization</span>
                      <span style={{ fontWeight:800, color:BLU, fontFamily:"'JetBrains Mono',monospace" }}>{sm.activeUsers.toLocaleString()} / {sm.licensedUsers.toLocaleString()}</span>
                    </div>
                    <div style={{ height:7, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                      <div style={{ width:`${utilizePct}%`, height:"100%", background:utilizePct>85?AMB:BLU, borderRadius:4 }} />
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>{utilizePct}% utilized · {sm.licensedUsers-sm.activeUsers} unused seats</div>
                  </div>
                  {infoRow("Licensed Users",  sm.licensedUsers.toLocaleString())}
                  {infoRow("Active Users",    sm.activeUsers.toLocaleString())}
                  {infoRow("Admin Users",     String(3+(h%5)))}
                  {infoRow("Guest / External",String(12+(h%30)))}
                </div>
                {/* ── Security Tool Details (SIEM / EDR) ── */}
                {isSecurity && (() => {
                  const isSIEM = asset.os.toLowerCase().includes("splunk")||asset.hostname.toLowerCase().includes("siem")||asset.hostname.toLowerCase().includes("splunk");
                  const isEDR  = asset.os.toLowerCase().includes("crowdstrike")||asset.os.toLowerCase().includes("falcon")||asset.hostname.toLowerCase().includes("crowdstrike")||asset.hostname.toLowerCase().includes("edr");
                  const enrolledEndpoints = 7150 + (h%200);
                  const coveragePct = 94 + (h%5);
                  const detectionRate = 99 + (h%1);
                  return (
                    <>
                      {isSIEM && (
                        <div style={card({ padding:"18px 20px" })}>
                          {sHdr("SIEM Platform Details")}
                          {infoRow("Platform",        <span style={{ color:NAV, fontWeight:700 }}>{asset.os}</span>)}
                          {infoRow("Deployment",      <span style={{ color:EME }}>Cloud-Managed (SaaS)</span>)}
                          {infoRow("Log Sources",     <span style={{ color:BLU, fontWeight:700 }}>{320+(h%80)} connected sources</span>)}
                          {infoRow("Events/Day",      <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{(2.4+(h%10)*0.1).toFixed(1)}B events/day</span>)}
                          {infoRow("Alerts/Day",      <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{80+(h%120)} alerts · {3+(h%5)} P1 critical</span>)}
                          {infoRow("Detection Rules", <span style={{ color:CYN }}>{1200+(h%400)} active rules</span>)}
                          {infoRow("MITRE ATT&CK",   <span style={{ color:EME }}>✓ {68+(h%20)}% technique coverage</span>)}
                          {infoRow("Data Retention",  `${90+(h%275)} days (hot) · 1 year (cold)`)}
                          {infoRow("Compliance Feeds",<span style={{ color:EME }}>ISO 27001 · PCI DSS · SOC 2 · GDPR</span>)}
                          {infoRow("Admin Contact",   <Chip onClick={()=>setPopup({type:"user",title:`Admin: ${sm.adminContact}`,data:{name:sm.adminContact,email:sm.adminEmail,dept:asset.dept,unit:"Security Operations",phone:"+1 (415) 555-0210",role:"SIEM Platform Owner"}})}>{sm.adminContact}</Chip>)}
                        </div>
                      )}
                      {isEDR && (
                        <div style={card({ padding:"18px 20px" })}>
                          {sHdr("EDR Platform Details")}
                          {infoRow("Platform",             <span style={{ color:NAV, fontWeight:700 }}>{asset.os}</span>)}
                          {infoRow("Deployment",           <span style={{ color:EME }}>Cloud-Managed SaaS</span>)}
                          {infoRow("Enrolled Endpoints",   <span style={{ color:BLU, fontWeight:700 }}>{enrolledEndpoints.toLocaleString()} devices</span>)}
                          {infoRow("Fleet Coverage",       <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ flex:1, height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}><div style={{ width:`${coveragePct}%`, height:"100%", background:coveragePct>90?EME:AMB, borderRadius:3 }} /></div><span style={{ fontWeight:700, color:coveragePct>90?EME:AMB, fontSize:10 }}>{coveragePct}%</span></div>)}
                          {infoRow("Active Policies",      `${28+(h%12)} prevention policies`)}
                          {infoRow("Threat Detection",     <span style={{ color:EME }}>✓ {detectionRate}% detection rate (30-day)</span>)}
                          {infoRow("Response SLA",         <span style={{ color:EME }}>Mean time to detect: {3+(h%8)} min</span>)}
                          {infoRow("Threat Intelligence",  <span style={{ color:CYN }}>Intel Graph · Indicator Graph · Overwatch</span>)}
                          {infoRow("Zero-Day Coverage",    <span style={{ color:EME }}>✓ Behavioral AI + ML models</span>)}
                          {infoRow("Platforms Covered",    "Windows · macOS · Linux · Mobile")}
                          {infoRow("Admin Contact",        <Chip onClick={()=>setPopup({type:"user",title:`Admin: ${sm.adminContact}`,data:{name:sm.adminContact,email:sm.adminEmail,dept:asset.dept,unit:"Security Operations",phone:"+1 (415) 555-0210",role:"EDR Platform Owner"}})}>{sm.adminContact}</Chip>)}
                        </div>
                      )}
                      {!isSIEM && !isEDR && (
                        <div style={card({ padding:"18px 20px" })}>
                          {sHdr("Security Tool Details")}
                          {infoRow("Platform",        <span style={{ color:NAV, fontWeight:700 }}>{asset.os}</span>)}
                          {infoRow("Coverage",        <span style={{ color:EME }}>{coveragePct}% of fleet</span>)}
                          {infoRow("Managed Targets", `${enrolledEndpoints.toLocaleString()} assets monitored`)}
                          {infoRow("Admin Contact",   <Chip onClick={()=>setPopup({type:"user",title:`Admin: ${sm.adminContact}`,data:{name:sm.adminContact,email:sm.adminEmail,dept:asset.dept,unit:"Security Operations",phone:"+1 (415) 555-0210",role:"Security Tool Owner"}})}>{sm.adminContact}</Chip>)}
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* ── Identity Platform Details (IAM / Okta) ── */}
                {isIdentity && (() => {
                  const totalUsers   = sm.licensedUsers;
                  const privAccounts = 12 + (h%8);
                  const staleAccts   = 23 + (h%30);
                  const mfaCoverage  = 92 + (h%7);
                  const connectedApps= 48 + (h%25);
                  const groups       = 85 + (h%40);
                  const caPolicies   = 18 + (h%10);
                  return (
                    <>
                      <div style={card({ padding:"18px 20px" })}>
                        {sHdr("IAM Platform Statistics")}
                        {infoRow("Total Users",           <span style={{ color:BLU, fontWeight:700 }}>{totalUsers.toLocaleString()}</span>)}
                        {infoRow("Active Users (30d)",    sm.activeUsers.toLocaleString())}
                        {infoRow("Groups / Roles",        `${groups} groups · ${14+(h%6)} roles`)}
                        {infoRow("Privileged Accounts",   <span style={{ color:AMB, fontWeight:700 }}>{privAccounts} (admin/super-admin)</span>)}
                        {infoRow("Stale Accounts (90d)",  <span style={{ color:staleAccts>30?RED:AMB }}>{staleAccts} accounts need review</span>)}
                        {infoRow("MFA Coverage",          <div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ flex:1, height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}><div style={{ width:`${mfaCoverage}%`, height:"100%", background:mfaCoverage>90?EME:AMB, borderRadius:3 }} /></div><span style={{ fontWeight:700, color:mfaCoverage>90?EME:AMB, fontSize:10 }}>{mfaCoverage}%</span></div>)}
                        {infoRow("SSO Connected Apps",    <span style={{ color:EME }}>✓ {connectedApps} applications integrated</span>)}
                        {infoRow("SCIM Provisioning",     <span style={{ color:EME }}>✓ Automated lifecycle management</span>)}
                        {infoRow("Cond. Access Policies", `${caPolicies} active policies`)}
                        {infoRow("Passwordless Auth",     <span style={{ color:EME }}>✓ WebAuthn / FIDO2 enabled</span>)}
                      </div>
                      <div style={card({ padding:"18px 20px" })}>
                        {sHdr("Directory Integration")}
                        {infoRow("Source Directory",   "Active Directory + HR System (Workday)")}
                        {infoRow("Sync Method",        <span style={{ color:EME }}>✓ Real-time SCIM push</span>)}
                        {infoRow("Domain Controllers", `${2+(h%2)} DCs synced`)}
                        {infoRow("Domains",            `${1+(h%2)} domain${h%2===0?"":"s"} federated`)}
                        {infoRow("Attribute Mapping",  <span style={{ color:EME }}>✓ Custom attributes synced</span>)}
                        {infoRow("Password Policy",    "Min 12 chars · Complexity + History")}
                        {infoRow("Session Policy",     `${4+(h%12)}h idle timeout · Re-auth on risky`)}
                        {infoRow("Audit Logs",         <span style={{ color:EME }}>✓ All events forwarded to SIEM</span>)}
                      </div>
                    </>
                  );
                })()}
                {/* Vendor Compliance Certifications */}
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Vendor Compliance Certifications")}
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
                    {sm.certifications.map(c=>(
                      <span key={c} style={{ fontSize:10, fontWeight:700, background:"rgba(34,197,94,0.08)", color:EME, border:"1px solid rgba(34,197,94,0.25)", borderRadius:4, padding:"4px 10px" }}>{c}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* ─── Right 35% ─── */}
              <div style={{ flex:"0 0 auto", width:"calc(35% - 10px)", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Risk & Classification")}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", marginBottom:6 }}>
                    <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Risk Level</span>
                    <RiskBadge level={asset.risk} />
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                      <span style={{ color:"var(--muted-foreground)" }}>Exposure Score</span>
                      <span style={{ fontWeight:800, color:asset.exposureScore>70?RED:asset.exposureScore>40?AMB:EME }}>{asset.exposureScore}/100</span>
                    </div>
                    <div style={{ height:5, borderRadius:3, background:"var(--input)" }}>
                      <div style={{ width:`${asset.exposureScore}%`, height:"100%", background:asset.exposureScore>70?RED:asset.exposureScore>40?AMB:EME, borderRadius:3 }} />
                    </div>
                  </div>
                  {infoRow("Data Sensitivity",    asset.risk==="Critical"?"PII + Secrets":asset.risk==="High"?"Confidential":"Internal")}
                  {infoRow("Business Criticality",asset.risk==="Critical"?"Mission Critical":asset.risk==="High"?"Business Critical":"Important")}
                  {infoRow("Shadow IT Risk",       asset.managed ? <span style={{ color:EME }}>✓ Sanctioned</span> : <span style={{ color:RED }}>⚠ Unsanctioned</span>)}
                  {infoRow("Detection Confidence", asset.confidence)}
                </div>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Contract & Renewal")}
                  {infoRow("Contract Value", <span style={{ color:EME, fontWeight:700 }}>{sm.contractValue}</span>)}
                  {infoRow("Renewal Date",   sm.renewalDate)}
                  {infoRow("Billing Cycle",  "Annual")}
                  {infoRow("Department",     asset.dept)}
                  {infoRow("Procurement",    "IT / Procurement")}
                </div>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Tags — Click × to Remove")}
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5, marginBottom:10 }}>
                    {assetTags.map(t=>(
                      <span key={t} style={{ background:"var(--input)", color:"var(--foreground)", borderRadius:4, padding:"3px 8px 3px 9px", fontSize:10, fontWeight:600, border:"1px solid rgba(255,255,255,0.1)", display:"inline-flex", alignItems:"center", gap:5 }}>
                        {t}<button onClick={()=>setAssetTags(prev=>prev.filter(x=>x!==t))} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted-foreground)", fontSize:12, lineHeight:1, padding:0 }}>×</button>
                      </span>
                    ))}
                    {assetTags.length===0&&<span style={{ fontSize:10, color:"var(--muted-foreground)" }}>No tags</span>}
                  </div>
                  <div style={{ display:"flex", gap:5 }}>
                    <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&tagInput.trim()){setAssetTags(p=>[...p,tagInput.trim()]);setTagInput("");}}} placeholder="Add tag…" style={{ flex:1, padding:"5px 8px", borderRadius:5, border:"1px solid rgba(255,255,255,0.1)", background:"var(--input)", fontSize:10, color:"var(--foreground)", fontFamily:"inherit" }} />
                    <button onClick={()=>{if(tagInput.trim()){setAssetTags(p=>[...p,tagInput.trim()]);setTagInput("");}}} style={{ padding:"5px 10px", borderRadius:5, border:"none", background:NAV, color:"white", fontSize:10, fontWeight:700, cursor:"pointer" }}>+</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ════════════════ HARDWARE ════════════════ */}
        {dTab==="hardware" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* ── Network device hardware ── */}
            {isNetworkDevice && ndConf && (<>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Chassis Identity")}
                  {infoRow("Model",         ndConf.model)}
                  {infoRow("Platform / OS", ndConf.platform)}
                  {infoRow("Form Factor",   ndConf.formFactor)}
                  {infoRow("Serial Number", <Mono style={{ fontSize:10 }}>{hw.serialNumber}</Mono>)}
                  {infoRow("Asset Tag",     <Mono style={{ fontSize:10 }}>{hw.assetTag}</Mono>)}
                  {infoRow("Manufacturer",  asset.manufacturer)}
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Interface Inventory")}
                  <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                    {([{label:"Total Ports",value:ndConf.totalPorts,color:"var(--foreground)"},{label:"Active / Up",value:ndConf.upPorts,color:EME},{label:"Down / Admin-Down",value:ndConf.downPorts,color:RED}]).map(p=>(
                      <div key={p.label} style={{ flex:1, background:"var(--input)", borderRadius:8, padding:"10px 8px", textAlign:"center" as const }}>
                        <div style={{ fontSize:22, fontWeight:800, color:p.color, marginBottom:3 }}>{p.value}</div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.5px", lineHeight:1.3 }}>{p.label}</div>
                      </div>
                    ))}
                  </div>
                  {infoRow("Max Throughput", ndConf.throughput)}
                  {infoRow("Forwarding ASIC",ndConf.asic)}
                  {infoRow("System Memory",  ndConf.sysMem)}
                  {infoRow("Packet Memory",  ndConf.pktMem)}
                </div>
              </div>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Physical Interfaces")}
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Interface","IP / Prefix","Zone / VLAN","Speed","Status","Description","RX Pkts","TX Pkts"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"7px 12px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, letterSpacing:"0.3px" }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ndConf.ifaces.map(ifc=>{
                      const sc = ifc.status==="up"?EME:ifc.status==="admin-down"?"var(--muted-foreground)":RED;
                      const sb = ifc.status==="up"?"rgba(34,197,94,0.08)":ifc.status==="admin-down"?"var(--secondary)":"rgba(239,68,68,0.06)";
                      return (
                        <tr key={ifc.name} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"8px 12px" }}><Mono style={{ fontSize:10 }}>{ifc.name}</Mono></td>
                          <td style={{ padding:"8px 12px" }}>{ifc.ip!=="—"?<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${ifc.ip}`,data:{ip:ifc.ip,hostname:asset.hostname}})}>{ifc.ip}{ifc.mask!=="—"?` ${ifc.mask}`:""}</Chip>:<span style={{ color:"rgba(148,163,184,0.3)" }}>—</span>}</td>
                          <td style={{ padding:"8px 12px", color:"var(--muted-foreground)", fontSize:10 }}>{ifc.zone}</td>
                          <td style={{ padding:"8px 12px", color:"var(--muted-foreground)", fontSize:10 }}>{ifc.speed||"—"}</td>
                          <td style={{ padding:"8px 12px" }}><span style={{ background:sb, color:sc, border:`1px solid ${sc}44`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>{ifc.status}</span></td>
                          <td style={{ padding:"8px 12px", color:"var(--muted-foreground)", fontSize:10 }}>{ifc.desc}</td>
                          <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{ifc.rxPkts}</td>
                          <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{ifc.txPkts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Processing & Memory")}
                  {infoRow("Forwarding ASIC",  ndConf.asic)}
                  {infoRow("System Memory",    ndConf.sysMem)}
                  {infoRow("Packet Memory",    ndConf.pktMem)}
                  {infoRow("Max Throughput",   ndConf.throughput)}
                </div>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Power & Support")}
                  {infoRow("Power Supplies",   ndConf.psu)}
                  {infoRow("Procurement",      purchaseDate)}
                  {infoRow("Warranty Expiry",  warrantyDate)}
                  {infoRow("Vendor Support",   ndConf.supportUntil)}
                </div>
              </div>
            </>)}

            {/* ── IoT / OT hardware ── */}
            {isIoTorOT && (<>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Chipset & Processing")}
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:"rgba(8,145,178,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚙️</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{asset.category==="OT"?"ARM Cortex-M4":"ARM Cortex-A53"}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{asset.category==="OT"?"168 MHz, single-core":"1.4 GHz, quad-core"}</div>
                    </div>
                  </div>
                  {infoRow("Architecture",   "ARM")}
                  {infoRow("Clock Speed",    asset.category==="OT"?"168 MHz":"1.4 GHz")}
                  {infoRow("Cores",          asset.category==="OT"?"1 (Cortex-M4)":"4 (Cortex-A53)")}
                  {infoRow("Secure Element", asset.category==="OT"?<span style={{ color:RED }}>Not present</span>:"ATECC608B")}
                  {infoRow("Trusted Boot",   asset.managed?<span style={{ color:EME }}>Enabled</span>:<span style={{ color:AMB }}>Unknown</span>)}
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Memory & Flash Storage")}
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:"rgba(6,95,70,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🧠</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{asset.category==="OT"?"512 KB SRAM":"512 MB LPDDR4"}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{asset.category==="OT"?"1 MB Flash":"4 GB eMMC"}</div>
                    </div>
                  </div>
                  {infoRow("RAM",          asset.category==="OT"?"512 KB SRAM":"512 MB LPDDR4")}
                  {infoRow("Flash / NVM",  asset.category==="OT"?"1 MB Flash":"4 GB eMMC")}
                  {infoRow("Boot Storage", asset.category==="OT"?"Internal ROM":"MicroSD / eMMC")}
                  {infoRow("Log Buffer",   <span style={{ color:AMB }}>Circular (volatile, limited)</span>)}
                </div>
              </div>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Communication Interfaces")}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                  {(asset.category==="OT"
                    ? ["RS-485 / Modbus RTU","Ethernet 10/100 (IEEE 802.3)","Profibus DP","GPIO — 24× digital I/O","Analog In — 4× 4–20 mA","USB 2.0 (programming only)"]
                    : ["Ethernet 10/100 (IEEE 802.3)","Wi-Fi 802.11 b/g/n (2.4 GHz)","Bluetooth 4.2 LE","Zigbee 3.0 (IEEE 802.15.4)","USB 2.0 Host","MQTT over TLS (application)"]
                  ).map(proto=>(
                    <span key={proto} style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:6, padding:"6px 12px", fontSize:10, fontWeight:700, color:"var(--foreground)" }}>{proto}</span>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Physical Characteristics")}
                  {infoRow("Form Factor",   asset.category==="OT"?"DIN rail mount":"Wall-mount enclosure")}
                  {infoRow("Power Input",   asset.category==="OT"?"24V DC":"5V DC (PoE / USB)")}
                  {infoRow("Power Draw",    asset.category==="OT"?"3.2 W":"2.5 W")}
                  {infoRow("Ingress Prot.", asset.category==="OT"?"IP67":"IP54")}
                  {infoRow("Temp. Range",   asset.category==="OT"?"-40°C to +85°C":"0°C to +60°C")}
                </div>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Asset Identity")}
                  {infoRow("Serial Number", <Mono style={{ fontSize:10 }}>{hw.serialNumber}</Mono>)}
                  {infoRow("Asset Tag",     <Mono style={{ fontSize:10 }}>{hw.assetTag}</Mono>)}
                  {infoRow("Manufacturer",  asset.manufacturer)}
                  {infoRow("Procurement",   purchaseDate)}
                  {infoRow("Warranty",      warrantyDate)}
                </div>
              </div>
            </>)}

            {/* ── Server / Workstation / Mobile / Cloud hardware (default) ── */}
            {!isNetworkDevice && !isIoTorOT && (<>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Processor (CPU)")}
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:"rgba(29,78,216,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚙️</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{hw.cpu.model.split(" ").slice(0,-1).join(" ")}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{hw.cpu.speed} · {hw.cpu.cores}C / {hw.cpu.threads}T</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                      <span style={{ color:"var(--muted-foreground)" }}>CPU Utilization</span>
                      <span style={{ fontWeight:800, color:hw.cpu.usage>80?RED:hw.cpu.usage>60?AMB:EME }}>{hw.cpu.usage}%</span>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:"var(--input)" }}>
                      <div style={{ width:`${hw.cpu.usage}%`, height:"100%", background:hw.cpu.usage>80?RED:hw.cpu.usage>60?AMB:CYN, borderRadius:3, transition:"width 0.6s ease" }} />
                    </div>
                  </div>
                  {infoRow("Cores",   hw.cpu.cores)}
                  {infoRow("Threads", hw.cpu.threads)}
                  {infoRow("Speed",   hw.cpu.speed)}
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Memory (RAM)")}
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:"rgba(6,95,70,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🧠</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{hw.ram.total}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{hw.ram.type} @ {hw.ram.speed}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                      <span style={{ color:"var(--muted-foreground)" }}>Memory Usage</span>
                      <span style={{ fontWeight:800, color:hw.ram.usagePct>85?RED:hw.ram.usagePct>65?AMB:EME }}>{hw.ram.usagePct}%</span>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:"var(--input)" }}>
                      <div style={{ width:`${hw.ram.usagePct}%`, height:"100%", background:hw.ram.usagePct>85?RED:hw.ram.usagePct>65?AMB:GRN, borderRadius:3, transition:"width 0.6s ease" }} />
                    </div>
                  </div>
                  {infoRow("Total RAM",  hw.ram.total)}
                  {infoRow("Used",       hw.ram.used)}
                  {infoRow("Type",       hw.ram.type)}
                  {infoRow("Speed",      hw.ram.speed)}
                </div>
              </div>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Storage Devices")}
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Device","Type","Capacity","Usage","Health"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"7px 12px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, letterSpacing:"0.4px" }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hw.storage.map(s=>{
                      const hc=(s.health as string)==="Critical"?RED:s.health==="Warning"?AMB:EME;
                      return (
                        <tr key={s.name} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 12px" }}><Mono>{s.name}</Mono></td>
                          <td style={{ padding:"9px 12px", color:"var(--foreground)" }}>{s.type}</td>
                          <td style={{ padding:"9px 12px", fontFamily:"'JetBrains Mono',monospace" }}>{s.size}</td>
                          <td style={{ padding:"9px 12px", width:160 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, height:5, borderRadius:3, background:"var(--input)", overflow:"hidden" }}>
                                <div style={{ width:`${s.usagePct}%`, height:"100%", background:s.usagePct>85?RED:s.usagePct>65?AMB:CYN, borderRadius:3 }} />
                              </div>
                              <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)", width:32 }}>{s.usagePct}%</span>
                            </div>
                          </td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:`${hc}12`, color:hc, border:`1px solid ${hc}44`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>{s.health}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("BIOS / Firmware")}
                  {infoRow("Vendor",        hw.bios.vendor)}
                  {infoRow("Version",       <Mono>{hw.bios.version}</Mono>)}
                  {infoRow("Release Date",  hw.bios.releaseDate)}
                  {infoRow("Secure Boot",   asset.os.includes("Windows")?"Enabled":"N/A")}
                  {infoRow("TPM",           asset.category==="Workstation"||asset.category==="Server"?"TPM 2.0":"N/A")}
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Asset Identity")}
                  {infoRow("Serial Number", <Mono style={{ fontSize:10 }}>{hw.serialNumber}</Mono>)}
                  {infoRow("Asset Tag",     <Mono style={{ fontSize:10 }}>{hw.assetTag}</Mono>)}
                  {infoRow("Model",         `${asset.manufacturer} ${asset.category}`)}
                  {infoRow("Form Factor",   asset.category==="Server"?"1U Rack Server":asset.category==="Workstation"?"Desktop/Laptop":asset.category==="Mobile"?"Smartphone":asset.category)}
                  {infoRow("Procurement",   purchaseDate)}
                </div>
              </div>
            </>)}

          </div>
        )}

        {/* ════════════════ SOFTWARE ════════════════ */}
        {dTab==="software" && hasSoftware && (() => {
          const eolCounts = { EOL:sw.filter(s=>s.eolStatus==="EOL").length, EOS:sw.filter(s=>s.eolStatus==="EOS").length, Warning:sw.filter(s=>s.eolStatus==="Warning").length, Current:sw.filter(s=>s.eolStatus==="Current").length };
          const filtered  = swFilter==="All"?sw:sw.filter(s=>s.eolStatus===swFilter);
          return (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* KPI row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {([
                  {label:"Total Packages",  value:sw.length,           color:NAV, icon:"📦"},
                  {label:"EOL / EOS",       value:eolCounts.EOL+eolCounts.EOS, color:RED, icon:"⚠"},
                  {label:"Upcoming EOL",    value:eolCounts.Warning,   color:AMB, icon:"⏰"},
                  {label:"Current",         value:eolCounts.Current,   color:EME, icon:"✓"},
                ] as {label:string;value:number;color:string;icon:string}[]).map(k=>(
                  <div key={k.label} style={card({ padding:"14px 16px" })}>
                    <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.icon} {k.value}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Filter pills */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                {(["All","Current","Warning","EOL","EOS"] as const).map(f=>(
                  <button key={f} onClick={()=>setSwFilter(f)} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", background:swFilter===f?"rgba(29,78,216,0.15)":"var(--input)", color:swFilter===f?BLU:"var(--muted-foreground)", borderColor:swFilter===f?BLU:"var(--border)" }}>{f} {f!=="All"?`(${eolCounts[f]??sw.length})`:""}</button>
                ))}
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filtered.length} packages</span>
              </div>

              {/* Software table */}
              <div style={card({})}>
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Package Name","Installed Version","Latest","Publisher","Category","EOL / EOS","CVEs","Fleet"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, letterSpacing:"0.4px" }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s,i)=>{
                      const isOutdated = s.latestVersion&&s.latestVersion!=="Current"&&s.latestVersion!==s.version;
                      return (
                        <tr key={i} onClick={()=>setPopup({type:"app",title:s.name,data:{...s}})} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <td style={{ padding:"10px 14px" }}>
                            <div style={{ fontWeight:700, color:s.eolStatus==="EOL"||s.eolStatus==="EOS"?RED:s.eolStatus==="Warning"?AMB:"var(--foreground)" }}>{s.name}</div>
                            <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>{s.installDate}</div>
                          </td>
                          <td style={{ padding:"10px 14px" }}><Mono style={{ fontSize:10 }}>{s.version}</Mono></td>
                          <td style={{ padding:"10px 14px" }}><span style={{ fontSize:10, color:isOutdated?AMB:EME, fontFamily:"'JetBrains Mono',monospace" }}>{s.latestVersion==="Current"?"✓":s.latestVersion}</span></td>
                          <td style={{ padding:"10px 14px", color:"var(--muted-foreground)", fontSize:10 }}>{s.publisher}</td>
                          <td style={{ padding:"10px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{s.category}</td>
                          <td style={{ padding:"10px 14px" }}><EolBadge status={s.eolStatus} date={s.eolDate} /></td>
                          <td style={{ padding:"10px 14px" }}>
                            {s.cveCount>0?<span style={{ color:RED, fontWeight:700, fontSize:11 }}>{s.cveCount} CVE{s.cveCount!==1?"s":""}</span>:<span style={{ color:EME, fontSize:10 }}>—</span>}
                          </td>
                          <td style={{ padding:"10px 14px", fontSize:10, color:BLU, fontWeight:700 }}>{s.fleetCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* EOL timeline */}
              {sw.filter(s=>s.eolDate&&s.eolStatus!=="Current").length>0&&(
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("EOL / EOS Timeline")}
                  <div style={{ position:"relative" as const, paddingLeft:18 }}>
                    {sw.filter(s=>s.eolDate).sort((a,b)=>(a.eolDate!>"")?(a.eolDate!<b.eolDate!?-1:1):0).map((s,i)=>{
                      const sc=s.eolStatus==="EOL"||s.eolStatus==="EOS"?RED:s.eolStatus==="Warning"?AMB:EME;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10, position:"relative" as const }}>
                          <div style={{ width:10, height:10, borderRadius:"50%", background:sc, border:`2px solid ${sc}44`, flexShrink:0, marginTop:2 }} />
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{s.name} <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>v{s.version}</span></span>
                              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:sc }}>{s.eolDate}</span>
                            </div>
                            <EolBadge status={s.eolStatus} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ════════════════ FIRMWARE ════════════════ */}
        {dTab==="firmware" && hasFirmware && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Network device firmware */}
            {isNetworkDevice && ndConf && (<>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Installed OS / Firmware")}
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:"rgba(29,78,216,0.10)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🖥️</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{ndConf.fwVer}</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Installed {ndConf.fwDate}</div>
                    </div>
                  </div>
                  {infoRow("Current Version",  <Mono style={{ fontSize:10 }}>{ndConf.fwVer}</Mono>)}
                  {infoRow("Previous Version", <Mono style={{ fontSize:10 }}>{ndConf.fwPrev}</Mono>)}
                  {infoRow("Release Date",     ndConf.fwDate)}
                  {infoRow("Update Channel",   "Vendor-direct (manual change window)")}
                  {infoRow("Signature Verify", <span style={{ color:EME }}>✓ Digitally signed — verified</span>)}
                  {infoRow("Vendor Support",   ndConf.supportUntil)}
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Update Status")}
                  {ndConf.fwAvail ? (
                    <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:AMB, marginBottom:4 }}>⬆ Update Available</div>
                      <div style={{ fontSize:11, color:"var(--foreground)" }}>{ndConf.fwAvail}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>Schedule via maintenance window — requires reload</div>
                    </div>
                  ) : (
                    <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:4 }}>✓ Up to Date</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>No updates available for current channel</div>
                    </div>
                  )}
                  {infoRow("Known CVEs in FW",  ndConf.fwCVEs>0?<span style={{ color:RED, fontWeight:800 }}>{ndConf.fwCVEs} CVE{ndConf.fwCVEs!==1?"s":""} — patch required</span>:<span style={{ color:EME }}>None known</span>)}
                  {infoRow("Boot Integrity",    asset.managed?<span style={{ color:EME }}>✓ Secure boot active</span>:<span style={{ color:AMB }}>Unknown</span>)}
                  {infoRow("Config Backup",     `Last: ${deployDate}`)}
                  {infoRow("Rollback Version",  ndConf.fwPrev)}
                </div>
              </div>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Firmware History")}
                {[
                  {ver:ndConf.fwVer,  date:ndConf.fwDate,                          note:"Installed — current",  status:"current"},
                  {ver:ndConf.fwPrev, date:`${2025+(h%2)}-${String((h%10)+1).padStart(2,"0")}-01`, note:"Previous stable",       status:"prev"},
                  {ver:ndConf.fwPrev.replace(/\d+$/,v=>String(Math.max(0,parseInt(v)-1))), date:`${2024+(h%2)}-${String((h%10)+3).padStart(2,"0")}-15`, note:"EOL — no longer supported", status:"eol"},
                ].map((fw,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:14, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:fw.status==="current"?EME:fw.status==="prev"?BLU:RED, flexShrink:0 }} />
                    <Mono style={{ fontSize:11, minWidth:180 }}>{fw.ver}</Mono>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)", minWidth:90 }}>{fw.date}</span>
                    <span style={{ fontSize:10, color:fw.status==="current"?EME:fw.status==="prev"?"var(--foreground)":"var(--muted-foreground)" }}>{fw.note}</span>
                  </div>
                ))}
              </div>
            </>)}

            {/* IoT / OT firmware */}
            {isIoTorOT && (<>
              {(() => {
                const iotFwVer   = `${1+(h%2)}.${(h%8)+1}.${h%4}`;
                const iotFwDate  = `${2023+(h%3)}-${String((h%12)+1).padStart(2,"0")}-${String((h%20)+1).padStart(2,"0")}`;
                const iotFwAvail = (h%3===0)?`${1+(h%2)}.${(h%8)+2}.0`:null;
                const iotFwCVEs  = 1 + (h%3);
                return (
                  <>
                    <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"14px 18px" }}>
                      <div style={{ fontWeight:800, color:RED, fontSize:12, marginBottom:4 }}>⚠ Firmware Visibility Warning</div>
                      <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>
                        {asset.category==="OT"
                          ? "OT devices typically cannot be patched without engineering approval and a scheduled maintenance window. Firmware updates may impact operational processes. Coordinate with OT/ICS team before any changes."
                          : "IoT device firmware is managed by the vendor — auto-update is not available. Manual updates require physical access or vendor-controlled update channel. Many IoT devices run EOL firmware indefinitely."}
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <div style={card({ padding:"18px 20px" })}>
                        {sHdr("Installed Firmware")}
                        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                          <div style={{ width:44, height:44, borderRadius:10, background:"rgba(124,58,237,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚙️</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>v{iotFwVer}</div>
                            <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Installed {iotFwDate}</div>
                          </div>
                        </div>
                        {infoRow("Firmware Version",  <Mono style={{ fontSize:10 }}>v{iotFwVer}</Mono>)}
                        {infoRow("Build Type",        "Production / Release")}
                        {infoRow("Install Date",      iotFwDate)}
                        {infoRow("Update Mechanism",  asset.category==="OT"?"Vendor-direct (manual, scheduled outage)":"Vendor app (manual trigger)")}
                        {infoRow("Auto-Update",       <span style={{ color:RED }}>Disabled / Not supported</span>)}
                        {infoRow("Signature Check",   <span style={{ color:AMB }}>Not verifiable remotely</span>)}
                      </div>
                      <div style={card({ padding:"18px 20px" })}>
                        {sHdr("Update & Vulnerability Status")}
                        {iotFwAvail ? (
                          <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                            <div style={{ fontSize:12, fontWeight:800, color:AMB, marginBottom:4 }}>⬆ Update Available</div>
                            <div style={{ fontSize:11, color:"var(--foreground)" }}>v{iotFwAvail}</div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>{asset.category==="OT"?"Requires ICS/OT team approval":"Requires physical access or vendor console"}</div>
                          </div>
                        ) : (
                          <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                            <div style={{ fontSize:12, fontWeight:800, color:EME }}>✓ Latest Available</div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>No newer firmware from vendor</div>
                          </div>
                        )}
                        {infoRow("Known FW CVEs",   <span style={{ color:iotFwCVEs>0?RED:EME, fontWeight:800 }}>{iotFwCVEs>0?`${iotFwCVEs} CVE${iotFwCVEs!==1?"s":""} in current build`:"None known"}</span>)}
                        {infoRow("Last Patched",     iotFwDate)}
                        {infoRow("Patch Age",        `${Math.floor((new Date().getTime()-new Date(iotFwDate).getTime())/(1000*60*60*24*30))} months`)}
                        {infoRow("EOL Firmware Risk",<span style={{ color:AMB }}>High — patching limited by vendor</span>)}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>)}
          </div>
        )}

        {/* ════════════════ NETWORK / NET CONFIG ════════════════ */}
        {dTab==="network" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* ── Network device: rich config view ── */}
            {isNetworkDevice && ndConf && (<>
              {/* Interface IP table */}
              <div style={card({ padding:"18px 20px" })}>
                {sHdr(`Interfaces — ${ndConf.ifaces.filter(i=>i.ip!=="—").length} with IP · ${ndConf.upPorts} up · ${ndConf.downPorts} down`)}
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Interface","IP Address","Prefix","Zone / VLAN","Speed","Status","Description"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"7px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ndConf.ifaces.map(ifc=>{
                      const sc = ifc.status==="up"?EME:ifc.status==="admin-down"?"var(--muted-foreground)":RED;
                      const sb = ifc.status==="up"?"rgba(34,197,94,0.08)":ifc.status==="admin-down"?"var(--secondary)":"rgba(239,68,68,0.06)";
                      return (
                        <tr key={ifc.name} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{ifc.name}</Mono></td>
                          <td style={{ padding:"9px 14px" }}>{ifc.ip!=="—"?<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${ifc.ip}`,data:{ip:ifc.ip,hostname:asset.hostname}})}>{ifc.ip}</Chip>:<span style={{ color:"rgba(148,163,184,0.3)" }}>—</span>}</td>
                          <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10, color:"var(--muted-foreground)" }}>{ifc.mask!=="—"?ifc.mask:"—"}</Mono></td>
                          <td style={{ padding:"9px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{ifc.zone}</td>
                          <td style={{ padding:"9px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{ifc.speed||"—"}</td>
                          <td style={{ padding:"9px 14px" }}><span style={{ background:sb, color:sc, border:`1px solid ${sc}44`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>{ifc.status}</span></td>
                          <td style={{ padding:"9px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{ifc.desc}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Routing table */}
              <div style={card({ padding:"18px 20px" })}>
                {sHdr(`Routing Table — ${ndConf.routing.length} routes`)}
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Destination","Next Hop","Interface","Protocol","Metric","Age"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"7px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ndConf.routing.map((r: any,i: number)=>{
                      const pc = r.proto==="Static"?BLU:r.proto==="Connected"?EME:r.proto==="OSPF"?PRP:r.proto==="BGP"?AMB:CYN;
                      return (
                        <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{r.dest}</Mono></td>
                          <td style={{ padding:"9px 14px" }}>{r.nextHop!=="—"?<Chip onClick={()=>setPopup({type:"ip",title:`Next Hop: ${r.nextHop}`,data:{ip:r.nextHop,hostname:"next-hop"}})}>{r.nextHop}</Chip>:<span style={{ color:"var(--muted-foreground)", fontSize:10 }}>directly connected</span>}</td>
                          <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10, color:"var(--muted-foreground)" }}>{r.iface}</Mono></td>
                          <td style={{ padding:"9px 14px" }}><span style={{ background:`${pc}12`, color:pc, border:`1px solid ${pc}33`, borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700 }}>{r.proto}</span></td>
                          <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{r.metric}</td>
                          <td style={{ padding:"9px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{r.age}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* NAT table (if applicable) */}
              {ndConf.nat.length > 0 && (
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr(`NAT Rules — ${ndConf.nat.length} active`)}
                  <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid var(--border)" }}>
                        {["Type","Zone","Original Source","Original Dest","Translated Src","Translated Dst","Hits"].map(c=>(
                          <th key={c} style={{ textAlign:"left" as const, padding:"7px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10 }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ndConf.nat.map((n,i)=>{
                        const tc = n.type.startsWith("Source")?"rgba(29,78,216,0.08)":"rgba(124,58,237,0.08)";
                        const tcc = n.type.startsWith("Source")?BLU:PRP;
                        return (
                          <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding:"9px 14px" }}><span style={{ background:tc, color:tcc, border:`1px solid ${tcc}33`, borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700 }}>{n.type}</span></td>
                            <td style={{ padding:"9px 14px", fontSize:10, color:"var(--muted-foreground)" }}>{n.zone}</td>
                            <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{n.origSrc}</Mono></td>
                            <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{n.origDst}</Mono></td>
                            <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{n.transSrc!=="—"?n.transSrc:"—"}</Mono></td>
                            <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{n.transDst!=="—"?n.transDst:"—"}</Mono></td>
                            <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:EME }}>{n.hits.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* DNS + management info */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("DNS & Management")}
                  {infoRow("FQDN",         <Chip onClick={()=>setPopup({type:"dns",title:`DNS: ${dnsRecord}`,data:{fqdn:dnsRecord,ip:asset.ip,hostname:asset.hostname}})}>{dnsRecord}</Chip>)}
                  {infoRow("DNS (Primary)",   <Chip onClick={()=>setPopup({type:"ip",title:"Primary DNS: 10.0.0.53",data:{ip:"10.0.0.53",hostname:"dns-primary.acme.int"}})}><span>10.0.0.53</span></Chip>)}
                  {infoRow("DNS (Secondary)", <Chip onClick={()=>setPopup({type:"ip",title:"Secondary DNS: 10.0.0.54",data:{ip:"10.0.0.54",hostname:"dns-secondary.acme.int"}})}><span>10.0.0.54</span></Chip>)}
                  {ndConf.isFirewall && infoRow("DNS (External fallback)", <Chip onClick={()=>setPopup({type:"ip",title:"External DNS: 8.8.8.8",data:{ip:"8.8.8.8",hostname:"dns.google"}})}><span style={{ color:"var(--muted-foreground)" }}>8.8.8.8</span></Chip>)}
                  {infoRow("Mgmt Protocol",ndConf.isFirewall?"SSH + HTTPS (GUI/REST API)":"SSH + SNMP v3")}
                  {infoRow("NTP Server",   "10.0.0.123 (primary) / 10.0.0.124 (secondary)")}
                  {infoRow("Syslog",       "10.0.0.200:514 (SIEM)")}
                  {infoRow("SNMP",         "v3 — AuthPriv (AES-128)")}
                </div>
                <div style={card({ padding:"16px 18px" })}>
                  {sHdr("Network Segmentation")}
                  {infoRow("VLAN",         <Chip onClick={()=>setPopup({type:"vlan",title:vlanId,data:{vlanId:vlanId.split(" ")[0]}})}>{vlanId}</Chip>)}
                  {infoRow("Firewall Zone",ndConf.isFirewall?"Perimeter / Edge":"Corporate-Internal")}
                  {infoRow("HA / Redundancy",ndConf.isFirewall?"Active-Passive HA pair":"STP — root bridge")}
                  {infoRow("Zero Trust",   asset.managed?<span style={{ color:EME }}>✓ Policy Active</span>:<span style={{ color:RED }}>⚠ Not applied</span>)}
                  {infoRow("Monitoring",   <span style={{ color:EME }}>✓ NetFlow + SNMP traps</span>)}
                </div>
              </div>
            </>)}

            {/* ── IoT / OT network (simplified) ── */}
            {isIoTorOT && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:10, padding:"12px 16px" }}>
                  <span style={{ fontWeight:800, color:AMB, fontSize:11 }}>⚠ {asset.category} Isolation Policy: </span>
                  <span style={{ fontSize:11, color:"var(--foreground)" }}>{asset.category==="IoT"?"Device is in dedicated IoT VLAN-100 (partial isolation). Direct internet access blocked. Limited lateral movement capability.":"Device is in OT/ICS air-gapped segment VLAN-200. No internet connectivity. Modbus/RS-485 only within OT zone."}</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("IP Configuration")}
                    {infoRow("IP Address",  asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:AMB }}>DHCP / Dynamic</span>:<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${asset.ip}`,data:{ip:asset.ip,hostname:asset.hostname}})}>{asset.ip}</Chip>)}
                    {infoRow("Subnet",      asset.ip!=="DHCP"&&asset.ip!=="—"?subnet:"Dynamic")}
                    {infoRow("Gateway",     asset.ip!=="DHCP"&&asset.ip!=="—"?`${asset.ip.split(".").slice(0,3).join(".")}.1`:"N/A")}
                    {infoRow("DHCP Lease",  asset.ip==="DHCP"?"24h (dynamic)":"Static assignment")}
                    {infoRow("IPv6",        "Not supported")}
                  </div>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("Protocol Stack")}
                    {(asset.category==="OT"?[
                      {k:"L7 Protocol",  v:"Modbus/TCP, PROFINET"},
                      {k:"L4",           v:"TCP/UDP over Ethernet"},
                      {k:"Management",   v:"RS-485 (local only)"},
                      {k:"Time Sync",    v:"IEEE 1588 PTP"},
                      {k:"Internet",     v:<span style={{ color:RED }}>Blocked (air-gap policy)</span>},
                    ]:[
                      {k:"L7 Protocol",  v:"MQTT over TLS 1.2"},
                      {k:"L4",           v:"TCP / UDP"},
                      {k:"Management",   v:"HTTPS (port 443)"},
                      {k:"Time Sync",    v:"NTP (pool.ntp.org)"},
                      {k:"Internet",     v:<span style={{ color:AMB }}>Outbound only (blocked inbound)</span>},
                    ]).map(({k,v})=>infoRow(k,v))}
                  </div>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("Isolation & Controls")}
                    {infoRow("VLAN",         <Chip onClick={()=>setPopup({type:"vlan",title:vlanId,data:{vlanId:vlanId.split(" ")[0]}})}>{vlanId}</Chip>)}
                    {infoRow("Zone",         asset.category==="IoT"?"IoT-Isolated":"OT-AirGap")}
                    {infoRow("Inter-VLAN",   <span style={{ color:RED }}>Blocked by ACL</span>)}
                    {infoRow("Segmented",    <span style={{ color:asset.managed?EME:AMB }}>{asset.managed?"✓ Fully isolated":"Partial isolation"}</span>)}
                    {infoRow("Zero Trust",   <span style={{ color:RED }}>⚠ Policy not applicable — isolated net</span>)}
                  </div>
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Open Ports & Services")}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                    {openPorts.map(port=>{
                      const svcMap: Record<number,{name:string;risk:string}> = {22:{name:"SSH",risk:"Medium"},80:{name:"HTTP",risk:"Low"},443:{name:"HTTPS",risk:"Low"},1883:{name:"MQTT",risk:"Medium"},8883:{name:"MQTT-TLS",risk:"Low"},502:{name:"Modbus",risk:"High"},20000:{name:"DNP3",risk:"High"},161:{name:"SNMP",risk:"Medium"}};
                      const svc = svcMap[port] ?? {name:"Unknown",risk:"Unknown"};
                      const rc  = svc.risk==="Critical"?RED:svc.risk==="High"?AMB:svc.risk==="Medium"?BLU:EME;
                      return (
                        <div key={port} onClick={()=>setPopup({type:"port",title:`Port ${port} — ${svc.name}`,data:{port,service:svc.name,risk:svc.risk,ip:asset.ip}})} style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", cursor:"pointer", minWidth:100, textAlign:"center" as const }} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.3)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:rc, marginBottom:3 }}>{port}</div>
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>{svc.name}</div>
                          <span style={{ background:`${rc}12`, color:rc, border:`1px solid ${rc}33`, borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{svc.risk}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Default: Server / Workstation / Mobile / Cloud ── */}
            {!isNetworkDevice && !isIoTorOT && (
              <>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Network Interfaces")}
                  <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid var(--border)" }}>
                        {["Interface","MAC Address","Speed","IP Address","VLAN","Status"].map(c=>(
                          <th key={c} style={{ textAlign:"left" as const, padding:"7px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10 }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hw.network.map(nic=>(
                        <tr key={nic.name} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding:"9px 14px" }}><Mono>{nic.name}</Mono></td>
                          <td style={{ padding:"9px 14px" }}><Mono style={{ fontSize:10 }}>{nic.mac}</Mono></td>
                          <td style={{ padding:"9px 14px", color:"var(--muted-foreground)" }}>{nic.speed}</td>
                          <td style={{ padding:"9px 14px" }}>
                            {nic.ip!=="—"&&nic.ip!=="DHCP"
                              ? <Chip onClick={()=>setPopup({type:"ip",title:`IP: ${nic.ip}`,data:{ip:nic.ip,hostname:asset.hostname}})}>{nic.ip}</Chip>
                              : <span style={{ color:"var(--muted-foreground)" }}>{nic.ip}</span>}
                          </td>
                          <td style={{ padding:"9px 14px" }}>
                            <Chip onClick={()=>setPopup({type:"vlan",title:nic.vlan,data:{vlanId:nic.vlan.split(" ")[0]}})}>{nic.vlan}</Chip>
                          </td>
                          <td style={{ padding:"9px 14px" }}><span style={{ background:nic.status==="Up"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", color:nic.status==="Up"?EME:RED, border:`1px solid ${nic.status==="Up"?"#A7F3D0":"#FECACA"}`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700 }}>{nic.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("IP Configuration")}
                    {infoRow("Primary IP",  asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:"var(--muted-foreground)" }}>{asset.ip}</span>:<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${asset.ip}`,data:{ip:asset.ip,hostname:asset.hostname}})}>{asset.ip}</Chip>)}
                    {infoRow("Subnet",      asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:"var(--muted-foreground)" }}>Dynamic</span>:<Chip onClick={()=>setPopup({type:"subnet",title:`Subnet: ${subnet}`,data:{cidr:subnet,gw:`${asset.ip.split(".").slice(0,3).join(".")}.1`}})}>{subnet}</Chip>)}
                    {infoRow("Gateway",     asset.ip==="DHCP"||asset.ip==="—"?"—":<Chip onClick={()=>setPopup({type:"ip",title:`Gateway`,data:{ip:`${asset.ip.split(".").slice(0,3).join(".")}.1`,hostname:"gateway"}})}>{asset.ip.split(".").slice(0,3).join(".")}.1</Chip>)}
                    {infoRow("IP Type",     asset.ip.startsWith("10.")||asset.ip.startsWith("192.168.")||asset.ip.startsWith("172.16.")?"Private (RFC 1918)":"Public / Cloud")}
                    {infoRow("IPv6",        "Not configured")}
                  </div>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("DNS")}
                    {infoRow("FQDN",       <Chip onClick={()=>setPopup({type:"dns",title:`DNS: ${dnsRecord}`,data:{fqdn:dnsRecord,ip:asset.ip,hostname:asset.hostname}})}>{dnsRecord}</Chip>)}
                    {infoRow("DNS Server (Primary)",   <Chip onClick={()=>setPopup({type:"ip",title:"Primary DNS: 10.0.0.53",data:{ip:"10.0.0.53",hostname:"dns-primary.acme.int"}})}><span>10.0.0.53</span></Chip>)}
                    {infoRow("DNS Server (Secondary)", <Chip onClick={()=>setPopup({type:"ip",title:"Secondary DNS: 10.0.0.54",data:{ip:"10.0.0.54",hostname:"dns-secondary.acme.int"}})}><span>10.0.0.54</span></Chip>)}
                    {isNetworkDevice && infoRow("DNS Server (External)", <Chip onClick={()=>setPopup({type:"ip",title:"External DNS Fallback: 8.8.8.8",data:{ip:"8.8.8.8",hostname:"dns.google"}})}><span style={{ color:"var(--muted-foreground)" }}>8.8.8.8 (Google — fallback)</span></Chip>)}
                    {infoRow("DNS Zone",   "acme.int (Internal)")}
                    {infoRow("DNSSEC",     <span style={{ color:AMB }}>Not configured</span>)}
                    {infoRow("PTR Record", asset.ip==="DHCP"||asset.ip==="—"?"—":`${asset.ip.split(".").reverse().join(".")}.in-addr.arpa`)}
                  </div>
                  <div style={card({ padding:"16px 18px" })}>
                    {sHdr("Network Segmentation")}
                    {infoRow("VLAN",         <Chip onClick={()=>setPopup({type:"vlan",title:vlanId,data:{vlanId:vlanId.split(" ")[0]}})}>{vlanId}</Chip>)}
                    {infoRow("Firewall Zone","Corporate-Internal")}
                    {infoRow("Environment",  envLabel)}
                    {infoRow("Segmented",    <span style={{ color:EME }}>✓ Yes</span>)}
                    {infoRow("Zero Trust",   asset.managed?<span style={{ color:EME }}>✓ Policy Active</span>:<span style={{ color:RED }}>⚠ Not applied</span>)}
                  </div>
                </div>
                <div style={card({ padding:"18px 20px" })}>
                  {sHdr("Open Ports & Services")}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                    {openPorts.map(port=>{
                      const svcMap: Record<number,{name:string;risk:string}> = {22:{name:"SSH",risk:"Medium"},80:{name:"HTTP",risk:"Low"},443:{name:"HTTPS",risk:"Low"},3306:{name:"MySQL",risk:"High"},5432:{name:"PostgreSQL",risk:"High"},8080:{name:"HTTP-Alt",risk:"Medium"},3389:{name:"RDP",risk:"Critical"},445:{name:"SMB",risk:"High"},135:{name:"MSRPC",risk:"Medium"},139:{name:"NetBIOS",risk:"High"},23:{name:"Telnet",risk:"Critical"},161:{name:"SNMP",risk:"Medium"},162:{name:"SNMP Trap",risk:"Low"},8443:{name:"HTTPS-Alt",risk:"Low"}};
                      const svc = svcMap[port] ?? {name:"Unknown",risk:"Unknown"};
                      const rc  = svc.risk==="Critical"?RED:svc.risk==="High"?AMB:svc.risk==="Medium"?BLU:EME;
                      return (
                        <div key={port} onClick={()=>setPopup({type:"port",title:`Port ${port} — ${svc.name}`,data:{port,service:svc.name,risk:svc.risk,ip:asset.ip}})} style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", cursor:"pointer", minWidth:100, textAlign:"center" as const }} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.3)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:rc, marginBottom:3 }}>{port}</div>
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>{svc.name}</div>
                          <span style={{ background:`${rc}12`, color:rc, border:`1px solid ${rc}33`, borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{svc.risk}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        {/* ════════════════ LIFECYCLE ════════════════ */}
        {dTab==="lifecycle" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={card({ padding:"20px 24px" })}>
              {sHdr("Asset Lifecycle Stage")}
              <div style={{ display:"flex", alignItems:"flex-start", gap:0, marginBottom:20, marginTop:8 }}>
                {lifecycleStages.map((stage,i) => {
                  const active=i===stageIdx, done=i<stageIdx;
                  return (
                    <div key={stage} style={{ display:"flex", alignItems:"center", flex:i<lifecycleStages.length-1?1:"none" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, minWidth:80 }}>
                        <div style={{ width:36, height:36, borderRadius:"50%", background:active?NAV:done?"rgba(34,197,94,0.12)":"var(--input)", border:active?`2px solid ${NAV}`:done?`2px solid ${EME}`:"2px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, color:active?"white":done?EME:"rgba(255,255,255,0.2)", boxShadow:active?`0 0 14px rgba(29,78,216,0.4)`:"none" }}>
                          {done?"✓":active?"◉":"○"}
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, color:active?"var(--foreground)":done?EME:"var(--muted-foreground)", textAlign:"center" as const, lineHeight:1.3, maxWidth:72 }}>{stage}</span>
                      </div>
                      {i<lifecycleStages.length-1&&<div style={{ flex:1, height:2, background:i<stageIdx?EME:"var(--border)", margin:"0 0 24px" }} />}
                    </div>
                  );
                })}
              </div>
              <div style={{ background:"rgba(29,78,216,0.07)", border:"1px solid rgba(59,130,246,0.18)", borderRadius:8, padding:"10px 14px" }}>
                <span style={{ fontWeight:700, color:BLU, fontSize:11 }}>Current Stage: </span>
                <span style={{ color:"var(--foreground)", fontSize:11 }}>{lifecycleStages[stageIdx]}</span>
                <span style={{ color:"var(--muted-foreground)", fontSize:11 }}> · Entered {deployDate}</span>
              </div>
            </div>
            {[
              { stage:"Procurement",       items:[{t:"Asset purchase order approved",done:true},{t:"Vendor security assessment completed",done:true},{t:"Asset registered in CMDB",done:true}] },
              { stage:"Onboarding",        items:[{t:"Device enrolled in MDM / management platform",done:asset.managed},{t:"Security agent (EDR/AV) installed",done:asset.antivirus!=="None"&&asset.antivirus!=="N/A"},{t:"Initial vulnerability scan completed",done:true},{t:"Asset owner assigned and confirmed",done:true},{t:"Baseline security configuration applied",done:asset.managed}] },
              { stage:"Active Operations", items:[{t:"Patch management schedule established",done:asset.managed},{t:"Compliance scan completed — Q1 2026",done:asset.managed},{t:"Risk assessment performed",done:true},{t:"Annual security review scheduled",done:asset.risk!=="Critical"},{t:"Data classification applied",done:true}] },
              { stage:"Periodic Review",   items:[{t:"Q1 2026 risk review completed",done:stageIdx>=3},{t:"Vulnerability scan — Q2 2026",done:false},{t:"Compliance audit — H1 2026",done:false},{t:"Asset recertification by owner",done:false}] },
            ].map(s=>(
              <div key={s.stage} style={card({ padding:"16px 20px" })}>
                {sHdr(s.stage)}
                {s.items.map((item,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:17, height:17, borderRadius:4, background:item.done?"rgba(34,197,94,0.12)":"var(--input)", border:`1px solid ${item.done?EME:"rgba(255,255,255,0.09)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {item.done&&<span style={{ color:EME, fontSize:10, fontWeight:900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:11, color:item.done?"var(--foreground)":"var(--muted-foreground)" }}>{item.t}</span>
                    <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, color:item.done?EME:"var(--muted-foreground)" }}>{item.done?"Complete":"Pending"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ════════════════ RISK ════════════════ */}
        {dTab==="risk" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Dynamic risk score simulator */}
            <div style={card({ padding:"20px 24px" })}>
              {sHdr("Dynamic Risk Score — Simulate Environment Changes")}
              <div style={{ display:"flex", gap:24, alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  {/* Score gauge */}
                  <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:18 }}>
                    <div style={{ position:"relative" as const, width:100, height:100, flexShrink:0 }}>
                      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform:"rotate(-90deg)" }}>
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--input)" strokeWidth="10" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={scoreColor} strokeWidth="10"
                          strokeDasharray={`${simScore*2.513} 251.3`} strokeLinecap="round"
                          style={{ transition:"stroke-dasharray 0.6s ease, stroke 0.4s ease" }} />
                      </svg>
                      <div style={{ position:"absolute" as const, inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:900, color:scoreColor, lineHeight:1 }}>{simScore}</span>
                        <span style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>/ 100</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800, color:scoreColor, marginBottom:4 }}>
                        {simScore>70?"High Risk":simScore>40?"Medium Risk":"Low Risk"}
                        {simScore<baseScore&&<span style={{ fontSize:11, color:EME, marginLeft:8 }}>↓ {baseScore-simScore} pts simulated</span>}
                      </div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12 }}>Composite risk score across all factors</div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                        {[
                          {label:"Mark Managed",      active:simManaged,  toggle:()=>setSimManaged(v=>!v),  impact:"-22 pts"},
                          {label:"Apply Patches",     active:simPatched,  toggle:()=>setSimPatched(v=>!v),  impact:`-${asset.critVulns*18+Math.max(0,asset.vulnCount-asset.critVulns)*4} pts`},
                          {label:"Enable AV",         active:simAv,       toggle:()=>setSimAv(v=>!v),       impact:"-12 pts"},
                        ].map(t=>(
                          <button key={t.label} onClick={t.toggle} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${t.active?EME:"rgba(255,255,255,0.1)"}`, background:t.active?"rgba(34,197,94,0.08)":"var(--input)", color:t.active?EME:"var(--muted-foreground)", fontSize:10, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                            <span>{t.active?"✓ ":""}{t.label}</span>
                            <span style={{ fontSize:9, color:EME }}>{t.impact}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Breakdown bars */}
                  {sHdr("Score Breakdown")}
                  {[
                    {label:"Critical CVE Impact",    val:Math.min(100,(simPatched?0:asset.critVulns)*18), max:54,  desc:`${simPatched?0:asset.critVulns} critical CVE(s) × 18 pts each`},
                    {label:"Vulnerability Count",    val:Math.min(100,(simPatched?0:Math.max(0,asset.vulnCount-asset.critVulns))*4), max:40, desc:`${simPatched?0:Math.max(0,asset.vulnCount-asset.critVulns)} other vulns × 4 pts`},
                    {label:"Management Coverage",    val:simManaged?0:22, max:22,   desc:simManaged?"Asset enrolled in management platform":"No MDM/EDR — +22 pts penalty"},
                    {label:"External Exposure",      val:Math.round(asset.exposureScore*0.35), max:35, desc:`${asset.exposureScore}/100 exposure × 0.35 weight`},
                    {label:"AV/EDR Coverage",        val:simAv?0:12, max:12,        desc:simAv?"Active protection":"No AV/EDR installed — +12 pts penalty"},
                  ].map(f=>{
                    const fc=f.val>25?RED:f.val>12?AMB:EME;
                    return (
                      <div key={f.label} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <span style={{ fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{f.label}</span>
                          <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:fc }}>+{f.val}</span>
                        </div>
                        <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:3 }}>
                          <div style={{ width:`${(f.val/f.max)*100}%`, height:"100%", background:fc, borderRadius:3, transition:"width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{f.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CVE table */}
            <div style={card({ padding:"18px 20px" })}>
              {sHdr(`Vulnerabilities (${asset.vulnCount}) — Click Row for Details`)}
              {vulns.length===0?(
                <div style={{ padding:"20px 0", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>✓ No vulnerabilities detected</div>
              ):(
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["CVE ID","CVSS","Severity","Component","Description","CISA KEV","Action"].map(c=>(
                        <th key={c} style={{ textAlign:"left" as const, padding:"7px 12px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vulns.map(v=>{
                      const vc=v.severity==="Critical"?RED:v.severity==="High"?AMB:BLU;
                      return (
                        <tr key={v.id} onClick={()=>setPopup({type:"cve",title:`CVE Detail: ${v.id}`,data:{...v}})} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <td style={{ padding:"9px 12px" }}><Mono style={{ color:vc }}>{v.id}</Mono></td>
                          <td style={{ padding:"9px 12px", fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:vc }}>{v.cvss}</td>
                          <td style={{ padding:"9px 12px" }}><span style={{ background:`${vc}18`, color:vc, border:`1px solid ${vc}44`, borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>{v.severity}</span></td>
                          <td style={{ padding:"9px 12px", color:"var(--foreground)" }}>{v.component}</td>
                          <td style={{ padding:"9px 12px", color:"var(--muted-foreground)", maxWidth:220 }}>{v.desc}</td>
                          <td style={{ padding:"9px 12px" }}>{v.cisaKev?<span style={{ color:RED, fontWeight:800, fontSize:10 }}>KEV</span>:<span style={{ color:"var(--muted-foreground)" }}>—</span>}</td>
                          <td style={{ padding:"9px 12px" }}><button style={{ padding:"2px 8px", borderRadius:4, border:`1px solid ${NAV}55`, background:"rgba(30,58,95,0.2)", fontSize:9, fontWeight:700, color:NAV, cursor:"pointer" }}>Remediate</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={card({ padding:"18px 20px" })}>
              {sHdr("AI-Generated Remediation Plan")}
              {recs.map((r,i)=>{
                const pc=r.priority==="Critical"?RED:r.priority==="High"?AMB:r.priority==="Medium"?BLU:EME;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize:9, fontWeight:700, color:pc, background:`${pc}18`, border:`1px solid ${pc}33`, borderRadius:4, padding:"2px 7px", flexShrink:0, marginTop:1 }}>{r.priority}</span>
                    <span style={{ flex:1, fontSize:11, color:"var(--foreground)", lineHeight:1.55 }}>{r.text}</span>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", flexShrink:0 }}>Effort: {r.effort}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════ CONTROLS ════════════════ */}
        {dTab==="controls" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Security tools */}
            <div style={card({ padding:"18px 20px" })}>
              {sHdr(`Installed Security Tools (${sec.length})`)}
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {sec.map((tool,i)=>{
                  const sc=tool.status==="Active"?EME:tool.status==="Warning"?AMB:RED;
                  return (
                    <div key={i} style={{ background:"var(--input)", border:`1px solid ${sc}22`, borderRadius:10, padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
                        <div style={{ width:38, height:38, borderRadius:9, background:`${sc}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>🛡</div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>{tool.name}</span>
                            <span style={{ background:`${sc}12`, color:sc, border:`1px solid ${sc}33`, borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700 }}>{tool.status}</span>
                          </div>
                          <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
                            <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Version: <Mono style={{ fontSize:10, color:CYN }}>{tool.version}</Mono></span>
                            <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Vendor: {tool.vendor}</span>
                            <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Type: {tool.type}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize:10 }}>
                          <span style={{ color:"var(--muted-foreground)" }}>Policy: </span>
                          <span style={{ color:"var(--foreground)", fontWeight:600 }}>{tool.policy}</span>
                        </div>
                        <div style={{ fontSize:10 }}>
                          <span style={{ color:"var(--muted-foreground)" }}>Last Scan: </span>
                          <Mono style={{ fontSize:10, color:EME }}>{tool.lastScan}</Mono>
                        </div>
                        <div style={{ fontSize:10 }}>
                          <span style={{ color:"var(--muted-foreground)" }}>Last Update: </span>
                          <Mono style={{ fontSize:10 }}>{tool.lastUpdate}</Mono>
                        </div>
                        <div style={{ fontSize:10 }}>
                          <span style={{ color:"var(--muted-foreground)" }}>Findings: </span>
                          <span style={{ color:tool.findings>0?RED:EME, fontWeight:700 }}>{tool.findings>0?`${tool.findings} finding${tool.findings!==1?"s":""}`:tool.name==="No security tools detected"?"—":"Clean"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Framework controls */}
            <div style={card({ padding:"18px 20px" })}>
              {sHdr("Security Control Framework Status")}
              {controls.map(c=>{
                const cc=c.status==="Implemented"?EME:c.status==="Partial"?AMB:RED;
                return (
                  <div key={c.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ flex:1, fontSize:11, color:"var(--foreground)", fontWeight:600 }}>{c.name}</span>
                    <span style={{ fontSize:9, fontWeight:700, color:cc, background:`${cc}18`, border:`1px solid ${cc}33`, borderRadius:4, padding:"2px 8px", flexShrink:0 }}>{c.status}</span>
                    <div style={{ width:80, height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", flexShrink:0 }}>
                      <div style={{ width:`${c.status==="Not Implemented"?0:c.eff}%`, height:"100%", background:cc, borderRadius:3, transition:"width 0.5s" }} />
                    </div>
                    <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)", width:30, textAlign:"right" as const, flexShrink:0 }}>{c.status==="Not Implemented"?"—":`${c.eff}%`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════ AIGO-X AGENT ════════════════ */}
        {dTab==="agent" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* ── Status banner ── */}
            <div style={{ background:agentInstalled?`${agentStatusColor}10`:"rgba(239,68,68,0.06)", border:`1px solid ${agentInstalled?agentStatusColor:RED}33`, borderRadius:12, padding:"18px 22px", display:"flex", alignItems:"center", gap:20 }}>
              <div style={{ width:56, height:56, borderRadius:14, background:agentInstalled?`${agentStatusColor}18`:"rgba(239,68,68,0.1)", border:`2px solid ${agentInstalled?agentStatusColor:RED}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>
                {agentStatus==="Online"?"🟢":agentStatus==="Stale"?"🟡":agentStatus==="Offline"?"🔴":"⬜"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:4 }}>
                  <span style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>AIGO-X Agent</span>
                  <span style={{ background:`${agentStatusColor}18`, color:agentStatusColor, border:`1px solid ${agentStatusColor}44`, borderRadius:5, padding:"2px 10px", fontSize:11, fontWeight:800 }}>{agentStatus}</span>
                  {agentInstalled && <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"monospace" }}>v{agentVer}</span>}
                </div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                  {agentInstalled
                    ? `AIGO-X endpoint agent managing ${agentModules.filter(m=>m.active).length}/5 modules on ${asset.os} · Last check-in: ${agentCheckIn} · Uptime: ${agentUptime}`
                    : `No AIGO-X Agent installed on this endpoint. Deploy the agent to enable full 5-module GRC coverage.`}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                {agentInstalled ? (
                  <>
                    <button style={{ padding:"7px 14px", borderRadius:7, border:`1px solid ${EME}44`, background:`${EME}10`, color:EME, fontSize:11, fontWeight:700, cursor:"pointer" }}>↻ Restart</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, border:`1px solid ${NAV}44`, background:`${NAV}10`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>↑ Update</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, border:`1px solid rgba(255,255,255,0.1)`, background:"rgba(255,255,255,0.04)", color:"var(--muted-foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>📋 View Logs</button>
                  </>
                ) : (
                  <button style={{ padding:"9px 20px", borderRadius:7, border:"none", background:NAV, color:"#000", fontSize:12, fontWeight:800, cursor:"pointer" }}>⬇ Deploy Agent</button>
                )}
              </div>
            </div>

            {/* ── Health telemetry ── */}
            {agentInstalled && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  { label:"Agent CPU",      value:agentCPU,    icon:"⚡", color:NAV },
                  { label:"Memory",         value:agentMemMB,  icon:"💾", color:CYN },
                  { label:"Events/sec",     value:agentEvtSec, icon:"📡", color:PRP },
                  { label:"Network I/O",    value:agentNetKBs, icon:"🌐", color:EME },
                ].map(m=>(
                  <div key={m.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:`${m.color}14`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{m.icon}</div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:m.color, fontFamily:"monospace" }}>{m.value}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{m.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Module status ── */}
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
              <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", marginBottom:14, letterSpacing:"0.08em" }}>ACTIVE MODULES (5-MODULE GRC PIPELINE)</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                {agentModules.map(mod=>{
                  const mc = mod.active ? EME : RED;
                  return (
                    <div key={mod.name} style={{ background:`${mc}08`, border:`1px solid ${mc}22`, borderRadius:10, padding:"14px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:18 }}>{mod.icon}</span>
                        <span style={{ background:`${mc}18`, color:mc, border:`1px solid ${mc}33`, borderRadius:4, padding:"1px 6px", fontSize:8, fontWeight:800 }}>{mod.active?"ACTIVE":"INACTIVE"}</span>
                      </div>
                      <div style={{ fontSize:11, fontWeight:800, color:"var(--foreground)" }}>{mod.name}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", lineHeight:1.5 }}>{mod.desc}</div>
                      <div style={{ borderTop:"1px solid rgba(255,255,255,0.04)", paddingTop:6, marginTop:2 }}>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Last sync: <span style={{ color:mc, fontFamily:"monospace" }}>{mod.lastSync}</span></div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>Events: <span style={{ color:"var(--foreground)", fontWeight:700 }}>{mod.events}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Agent details row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {/* Installation details */}
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", marginBottom:12, letterSpacing:"0.08em" }}>INSTALLATION DETAILS</div>
                {[
                  ["Agent Version",      agentInstalled?agentVer:"Not Installed"],
                  ["Agent Status",       agentStatus],
                  ["Install Method",     agentInstalled?asset.os.includes("Windows")?"Group Policy (GPO)":asset.os.includes("macOS")?"Jamf MDM":"Ansible Playbook":"—"],
                  ["Platform",          asset.os],
                  ["Architecture",      asset.os.includes("Windows")?"x86_64 / AMD64":asset.os.includes("macOS")?"ARM64 (Apple Silicon)":"x86_64"],
                  ["Install Path",      asset.os.includes("Windows")?"C:\\Program Files\\AIGO-X\\Agent":asset.os.includes("macOS")?"/Applications/AIGO-X.app":"/opt/aigox/agent"],
                  ["Config Profile",    agentInstalled?`${asset.category}-${asset.dept.replace(" ","-").toLowerCase()}-v3`:"—"],
                  ["Last Check-in",     agentCheckIn],
                  ["Uptime",            agentUptime],
                  ["Tenant ID",         "acme-corp-prod-001"],
                ].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:10 }}>
                    <span style={{ color:"var(--muted-foreground)" }}>{k}</span>
                    <span style={{ fontWeight:700, color:k==="Agent Status"?agentStatusColor:NAV, fontFamily:k==="Agent Version"||k==="Install Path"||k==="Last Check-in"?"monospace":"inherit", fontSize:k==="Install Path"?9:10, maxWidth:200, textAlign:"right" as const }}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Connectivity & diagnostics */}
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", marginBottom:12, letterSpacing:"0.08em" }}>CONNECTIVITY & DIAGNOSTICS</div>
                {[
                  ["Cloud Gateway",     agentInstalled?"gateway.aigox.io:443":"—",               agentInstalled?EME:RED],
                  ["mTLS Certificate",  agentInstalled?"Valid — expires 2027-01-15":"Not issued",  agentInstalled?EME:RED],
                  ["Config Channel",    agentInstalled?"QUIC/gRPC — Connected":"—",               agentInstalled?EME:RED],
                  ["Telemetry Channel", agentOnline?"Active — 128-bit AES-GCM":"Disconnected",   agentOnline?EME:AMB],
                  ["DNS Resolution",    agentInstalled?"gateway.aigox.io → 104.21.44.8":"—",      agentInstalled?EME:RED],
                  ["Proxy",             agentInstalled?"Direct (no proxy)":"—",                   "var(--muted-foreground)"],
                  ["Firewall Status",   agentInstalled?"Port 443 open outbound":"Unknown",        agentInstalled?EME:AMB],
                  ["Last Self-Test",    agentInstalled?agentCheckIn:"—",                          agentInstalled?EME:RED],
                ].map(([k,v,c])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:10, gap:8 }}>
                    <span style={{ color:"var(--muted-foreground)", flexShrink:0 }}>{k}</span>
                    <span style={{ fontWeight:700, color:String(c), textAlign:"right" as const, fontSize:9, fontFamily:"monospace" }}>{String(v)}</span>
                  </div>
                ))}
                {agentInstalled && (
                  <button style={{ marginTop:10, width:"100%", padding:"7px", borderRadius:7, border:`1px solid ${NAV}44`, background:`${NAV}10`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    ↺ Run Diagnostics
                  </button>
                )}
              </div>
            </div>

            {/* ── Assigned policies ── */}
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
              <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", marginBottom:12, letterSpacing:"0.08em" }}>ASSIGNED POLICIES ({agentPolicies.length})</div>
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 0.5fr 0.5fr 1fr 1fr", gap:8, padding:"6px 8px", background:"rgba(255,255,255,0.03)", borderRadius:6, marginBottom:4 }}>
                  {["Policy Name","Type","Priority","Status","Applied","Scope"].map(h2=>(
                    <span key={h2} style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.06em" }}>{h2}</span>
                  ))}
                </div>
                {agentPolicies.map((p,i)=>(
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 0.5fr 0.5fr 1fr 1fr", gap:8, padding:"9px 8px", borderBottom:"1px solid rgba(255,255,255,0.04)", alignItems:"center" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{p.name}</span>
                    <span style={{ fontSize:9, background:`${BLU}12`, color:BLU, border:`1px solid ${BLU}22`, borderRadius:4, padding:"2px 6px", width:"fit-content" }}>{p.type}</span>
                    <span style={{ fontSize:9, fontWeight:800, color:p.priority==="P1"?RED:p.priority==="P2"?AMB:EME }}>{p.priority}</span>
                    <span style={{ fontSize:9, fontWeight:800, color:EME }}>{p.status}</span>
                    <span style={{ fontSize:9, fontFamily:"monospace", color:"var(--muted-foreground)" }}>{p.applied}</span>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{p.scope}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Uninstall / enrol actions ── */}
            {!agentInstalled && (
              <div style={{ background:"rgba(147,197,253,0.04)", border:"1px solid rgba(147,197,253,0.14)", borderRadius:12, padding:"18px 22px" }}>
                <div style={{ fontSize:12, fontWeight:800, color:NAV, marginBottom:8 }}>🚀 Deploy AIGO-X Agent to this Endpoint</div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:14, lineHeight:1.7 }}>
                  This endpoint has no AIGO-X agent installed. Install the agent to enable full-spectrum GRC coverage across ComplyOps, AssetOps, DataOps, SecOps and ServiceOps modules.
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button style={{ padding:"9px 20px", borderRadius:7, border:"none", background:NAV, color:"#000", fontSize:12, fontWeight:800, cursor:"pointer" }}>⬇ Install via {asset.os.includes("Windows")?"GPO":asset.os.includes("macOS")?"Jamf":"Ansible"}</button>
                  <button style={{ padding:"9px 20px", borderRadius:7, border:`1px solid ${NAV}44`, background:"transparent", color:NAV, fontSize:12, fontWeight:700, cursor:"pointer" }}>📋 Copy Install Command</button>
                  <button style={{ padding:"9px 20px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer" }}>📖 Documentation</button>
                </div>
              </div>
            )}

            {agentInstalled && (
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:4 }}>
                <button style={{ padding:"7px 16px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>🔄 Re-enroll Agent</button>
                <button style={{ padding:"7px 16px", borderRadius:7, border:`1px solid ${RED}44`, background:`${RED}08`, color:RED, fontSize:11, fontWeight:700, cursor:"pointer" }}>⊗ Uninstall Agent</button>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ COMPLIANCE ════════════════ */}
        {dTab==="compliance" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
              {fwCompliance.map(fw=>{
                const fc=fw.pct>=80?EME:fw.pct>=55?AMB:RED;
                return (
                  <div key={fw.name} style={card({ padding:"18px 20px" })}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)", marginBottom:5 }}>{fw.name}</div>
                        <span style={{ fontSize:9, fontWeight:700, color:fw.status==="Compliant"?EME:fw.status==="Partially Compliant"?AMB:RED, background:fw.status==="Compliant"?"rgba(34,197,94,0.08)":fw.status==="Partially Compliant"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)", padding:"1px 7px", borderRadius:3 }}>{fw.status}</span>
                      </div>
                      <div style={{ textAlign:"right" as const }}>
                        <div style={{ fontSize:24, fontWeight:800, color:fc, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>{fw.pct}%</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{fw.passed}/{fw.controls} controls</div>
                      </div>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:14 }}>
                      <div style={{ width:`${fw.pct}%`, height:"100%", background:fc, borderRadius:3 }} />
                    </div>
                    {Array.from({ length:Math.min(fw.controls,8) }).map((_,ci)=>{
                      const pass=ci<fw.passed;
                      return (
                        <div key={ci} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.03)", fontSize:10 }}>
                          <div style={{ width:13, height:13, borderRadius:3, background:pass?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.06)", border:`1px solid ${pass?EME:RED}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ color:pass?EME:RED, fontSize:8, fontWeight:800 }}>{pass?"✓":"✗"}</span>
                          </div>
                          <span style={{ color:pass?"var(--foreground)":"var(--muted-foreground)", flex:1 }}>Control {String(ci+1).padStart(2,"0")}</span>
                          <span style={{ color:pass?EME:RED, fontWeight:700, fontSize:9 }}>{pass?"Pass":"Fail"}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════ DEPENDENCIES ════════════════ */}
        {dTab==="dependencies" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={card({ padding:"18px 20px" })}>
              {sHdr("Asset Relationships & Dependencies")}
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {deps.map((d,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"var(--input)", borderRadius:8, border:"1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize:10, fontWeight:700, color:d.dir==="upstream"?CYN:PRP, background:d.dir==="upstream"?"rgba(8,145,178,0.1)":"rgba(124,58,237,0.1)", padding:"2px 9px", borderRadius:4, flexShrink:0 }}>{d.dir==="upstream"?"↑ Upstream":"↓ Downstream"}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{d.target}</span>
                    <span style={{ marginLeft:"auto", fontSize:10, color:"var(--muted-foreground)", background:"var(--secondary)", padding:"2px 8px", borderRadius:4 }}>{d.label}</span>
                    <span style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", border:"1px solid var(--border)", padding:"2px 7px", borderRadius:3 }}>{d.type}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Network Location")}
                {infoRow("IP Address", asset.ip==="DHCP"||asset.ip==="—"?<span style={{ color:"var(--muted-foreground)" }}>{asset.ip}</span>:<Chip onClick={()=>setPopup({type:"ip",title:`IP: ${asset.ip}`,data:{ip:asset.ip,hostname:asset.hostname}})}>{asset.ip}</Chip>)}
                {infoRow("Subnet",     <Chip onClick={()=>setPopup({type:"subnet",title:`Subnet: ${subnet}`,data:{cidr:subnet,gw:`${asset.ip.split(".").slice(0,3).join(".")}.1`}})}>{subnet}</Chip>)}
                {infoRow("Environment",envLabel)}
                {infoRow("VLAN",       <Chip onClick={()=>setPopup({type:"vlan",title:vlanId,data:{vlanId:vlanId.split(" ")[0]}})}>{vlanId}</Chip>)}
                {infoRow("DNS Record", <Chip onClick={()=>setPopup({type:"dns",title:`DNS: ${dnsRecord}`,data:{fqdn:dnsRecord,ip:asset.ip,hostname:asset.hostname}})}>{dnsRecord}</Chip>)}
              </div>
              <div style={card({ padding:"18px 20px" })}>
                {sHdr("Compliance Scope")}
                {fwCompliance.map(fw=>(
                  <div key={fw.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11 }}>
                    <span style={{ color:EME }}>◉</span>
                    <span style={{ color:"var(--foreground)", fontWeight:600, flex:1 }}>{fw.name}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{fw.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ AI ANALYSIS ════════════════ */}
        {dTab==="ai" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"linear-gradient(135deg,rgba(29,78,216,0.07),rgba(124,58,237,0.05))", border:"1px solid rgba(99,102,241,0.18)", borderRadius:12, padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>✦</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>AIGO-X AI Security Analysis</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Generated 2026-06-14 · Confidence: High · Model: AIGO-X Security LLM v3.2</div>
                </div>
                <button style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:6, border:"1px solid rgba(99,102,241,0.3)", background:"rgba(99,102,241,0.09)", color:"#818CF8", fontSize:11, fontWeight:700, cursor:"pointer" }}>↻ Re-analyze</button>
              </div>
              <p style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.8, margin:0 }}>
                Based on analysis of <strong>{asset.sources}</strong> integrated data sources, <strong>{asset.hostname}</strong> presents a{" "}
                <strong style={{ color:asset.risk==="Critical"?RED:asset.risk==="High"?AMB:EME }}>{asset.risk.toLowerCase()} risk profile</strong> with an exposure score of {asset.exposureScore}/100.
                {asset.critVulns>0&&` The presence of ${asset.critVulns} critical CVE(s) significantly elevates the threat posture and requires immediate remediation priority.`}
                {!asset.managed&&" The asset's unmanaged status creates a significant visibility gap in the security program — full EDR enrollment is recommended immediately."}
                {asset.managed&&asset.critVulns===0&&" Current security controls are functioning within expected parameters. Continued monitoring and patch cadence maintenance recommended."}
                {sw.some(s=>s.eolStatus==="EOL"||s.eolStatus==="EOS")&&` Software inventory analysis identified ${sw.filter(s=>s.eolStatus==="EOL"||s.eolStatus==="EOS").length} end-of-life package(s) requiring urgent upgrade.`}
              </p>
            </div>
            <div style={card({ padding:"18px 20px" })}>
              {sHdr("AI-Identified Risk Factors")}
              {[
                {factor:"Vulnerability Exposure",   score:asset.critVulns>0?90:asset.vulnCount>3?65:22, detail:asset.critVulns>0?`${asset.critVulns} critical CVEs unpatched`:asset.vulnCount>0?`${asset.vulnCount} open vulnerabilities`:"No known vulnerabilities"},
                {factor:"Management Coverage",      score:asset.managed?18:88, detail:asset.managed?"Enrolled in management platform — good visibility":"No MDM/EDR coverage — significant blind spot"},
                {factor:"Software EOL Risk",        score:sw.filter(s=>s.eolStatus==="EOL"||s.eolStatus==="EOS").length>0?72:sw.filter(s=>s.eolStatus==="Warning").length>0?38:10, detail:`${sw.filter(s=>s.eolStatus==="EOL"||s.eolStatus==="EOS").length} EOL packages · ${sw.filter(s=>s.eolStatus==="Warning").length} expiring soon`},
                {factor:"Configuration Compliance", score:Math.round(asset.exposureScore*0.72), detail:`${100-Math.round(asset.exposureScore*0.72)}% of security benchmarks passing`},
                {factor:"Network Exposure",         score:asset.exposureScore, detail:`Exposure score ${asset.exposureScore}/100 across ${asset.sources} data sources`},
                {factor:"Identity & Access Risk",   score:asset.risk==="Critical"?76:asset.risk==="High"?52:26, detail:"Privileged access review recommended per quarterly cycle"},
              ].map(f=>{
                const fc=f.score>70?RED:f.score>40?AMB:EME;
                return (
                  <div key={f.factor} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <span style={{ fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{f.factor}</span>
                      <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:fc }}>{f.score}/100</span>
                    </div>
                    <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:4 }}>
                      <div style={{ width:`${f.score}%`, height:"100%", background:fc, borderRadius:3 }} />
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{f.detail}</div>
                  </div>
                );
              })}
            </div>
            <div style={card({ padding:"18px 20px" })}>
              {sHdr("AI-Generated Remediation Plan")}
              {recs.map((r,i)=>{
                const pc=r.priority==="Critical"?RED:r.priority==="High"?AMB:r.priority==="Medium"?BLU:EME;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:22, height:22, borderRadius:6, background:`${pc}18`, border:`1px solid ${pc}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:pc }}>{i+1}</span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:3 }}>{r.text}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Priority: <span style={{ color:pc, fontWeight:700 }}>{r.priority}</span> · Effort: {r.effort} · Est. resolution: {r.effort==="High"?"2–4 weeks":r.effort==="Medium"?"3–7 days":"1–2 days"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════ HISTORY ════════════════ */}
        {dTab==="history" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={card({ padding:"18px 20px" })}>
              {sHdr(`Change History (${timeline.length} events)`)}
              <div style={{ marginTop:4 }}>
                {timeline.map((e,i)=>(
                  <div key={i} style={{ display:"flex", gap:16, padding:"14px 0", borderBottom:i<timeline.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:NAV, border:"2px solid rgba(29,78,216,0.4)", flexShrink:0 }} />
                      {i<timeline.length-1&&<div style={{ width:1, flex:1, background:"var(--border)", margin:"4px 0" }} />}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>Field <Mono>{e.field}</Mono> updated</span>
                        <span style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{e.ts}</span>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:5, flexWrap:"wrap" as const }}>
                        <span style={{ fontSize:10, color:"var(--muted-foreground)", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(252,165,165,0.15)", borderRadius:4, padding:"1px 7px" }}>from: {e.from}</span>
                        <span style={{ color:"var(--muted-foreground)", fontSize:13 }}>→</span>
                        <span style={{ fontSize:10, color:"rgba(148,163,184,0.8)", background:"rgba(34,197,94,0.06)", border:"1px solid rgba(167,243,208,0.2)", borderRadius:4, padding:"1px 7px" }}>to: {e.to}</span>
                      </div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Source: {e.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Topology Graph ─────────────────────────────────────────────────────────────
const catIcon: Record<string,string> = { Server:"🖥", Workstation:"💻", IoT:"📡", Mobile:"📱", Network:"🔀", OT:"⚙", Cloud:"☁", Container:"📦", Unknown:"❓", SaaS:"🌐", Security:"🛡", Identity:"🔑" };

function mkCluster(id:string, x:number, y:number, cat:Category, cnt:number, color:string): Node {
  return {
    id, type:"default", position:{x,y},
    style:{background:`${color}10`,border:`2px solid ${color}35`,borderRadius:14,padding:"8px 14px",width:188,height:90,fontFamily:"inherit",boxShadow:`0 4px 24px ${color}18`},
    data:{label:(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:3}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:20}}>{catIcon[cat]}</span>
          <span style={{fontSize:22,fontWeight:800,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{cnt.toLocaleString()}</span>
        </div>
        <span style={{fontSize:9,fontWeight:800,color:"var(--card)",background:color,padding:"2px 10px",borderRadius:10}}>{cat.toUpperCase()}</span>
        <span style={{fontSize:9,color:"rgba(100,116,139,0.8)"}}>assets · fleet-wide</span>
      </div>
    )}
  };
}

function mkInfra(id:string, x:number, y:number, icon:string, name:string, tag:string, ip:string, color:string, alert=false): Node {
  return {
    id, type:"default", position:{x,y},
    style:{background:alert?"rgba(239,68,68,0.06)":"white",border:`2px solid ${alert?RED:color}`,borderRadius:10,padding:"8px 12px",width:164,height:74,fontFamily:"inherit",boxShadow:alert?`0 0 16px ${RED}40`:`0 2px 10px ${color}20`},
    data:{label:(
      <div style={{display:"flex",flexDirection:"column",gap:2,height:"100%",justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:15}}>{icon}</span>
          <span style={{fontWeight:800,fontSize:10,color:NAV,maxWidth:115,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{fontSize:8,fontWeight:800,color:"var(--card)",background:color,padding:"1px 5px",borderRadius:3,flexShrink:0}}>{tag}</span>
          {alert&&<span style={{fontSize:8,fontWeight:800,color:RED}}>⚠ CRITICAL</span>}
        </div>
        <span style={{fontSize:9,color:"var(--muted-foreground)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ip}</span>
      </div>
    )}
  };
}

function mkSynth(id:string, x:number, y:number, icon:string, name:string, sub:string, tag:string, color:string): Node {
  return {
    id, type:"default", position:{x,y},
    style:{background:"white",border:`2px solid ${color}`,borderRadius:10,padding:"8px 12px",width:164,height:74,fontFamily:"inherit",boxShadow:`0 2px 10px ${color}20`},
    data:{label:(
      <div style={{display:"flex",flexDirection:"column",gap:2,height:"100%",justifyContent:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:15}}>{icon}</span>
          <span style={{fontWeight:800,fontSize:10,color:NAV}}>{name}</span>
        </div>
        <span style={{fontSize:8,fontWeight:800,color:"var(--card)",background:color,padding:"1px 5px",borderRadius:3,alignSelf:"flex-start"}}>{tag}</span>
        <span style={{fontSize:9,color:"var(--muted-foreground)"}}>{sub}</span>
      </div>
    )}
  };
}

function mkEdge2(id:string,s:string,t:string,lbl:string,color:string,exp=false,ani=false):Edge{
  return{id,source:s,target:t,label:lbl,
    style:{stroke:exp?RED:color,strokeWidth:exp?2.5:1.5,strokeDasharray:exp?"6,3":undefined},
    markerEnd:{type:MarkerType.ArrowClosed,color:exp?RED:color,width:12,height:12},
    labelStyle:{fontSize:9,fontWeight:700,fill:exp?RED:"#6B7280",fontFamily:"'JetBrains Mono',monospace"},
    animated:ani||exp};
}

function buildDepGraph(asset:AssetEntry, allAssets:AssetEntry[]) {
  const seed = hashCode(asset.id);
  const sw   = getInstalledSoftware(asset);

  const infraMap:Record<string,string[]> = {
    Workstation:["AST-0101","AST-0119","AST-0108"],
    Server:     ["AST-0108","AST-0101","AST-0103"],
    Mobile:     ["AST-0120","AST-0101","AST-0108"],
    Cloud:      ["AST-0112","AST-0108","AST-0101"],
    Container:  ["AST-0114","AST-0112","AST-0108"],
    IoT:        ["AST-0108","AST-0106","AST-0101"],
    OT:         ["AST-0109","AST-0108"],
    Network:    ["AST-0111","AST-0108","AST-0101"],
    SaaS:       ["AST-009","AST-0111"],
    Security:   ["AST-014","AST-015","AST-0111"],
    Identity:   ["AST-009","AST-0101","AST-0111"],
    Unknown:    ["AST-0108"],
  };
  const infraIds   = (infraMap[asset.category]??["AST-0108"]).filter(id=>id!==asset.id);
  const infraAssets= infraIds.map(id=>SEED_ASSETS.find(a=>a.id===id)).filter((a):a is AssetEntry=>!!a);

  const catPeers = allAssets.filter(a=>a.id!==asset.id&&a.category===asset.category);
  const pStart   = seed % Math.max(1, catPeers.length);
  const step     = Math.max(1, Math.floor(catPeers.length/4));
  const peers    = [0,1,2,3]
    .map(i=>catPeers[(pStart+i*step)%Math.max(1,catPeers.length)])
    .filter((a,i,arr):a is AssetEntry=>!!a&&arr.findIndex(x=>x?.id===a.id)===i)
    .slice(0,4);

  const mkD=(nid:string,a:AssetEntry,x:number,y:number,center=false):Node=>({
    id:nid,type:"default",position:{x,y},
    style:{
      background:center?(a.risk==="Critical"?"rgba(239,68,68,0.10)":a.risk==="High"?"rgba(245,158,11,0.07)":"rgba(29,78,216,0.06)"):"white",
      border:`${center?3:2}px solid ${a.risk==="Critical"?RED:a.risk==="High"?AMB:center?NAV:CYN}`,
      borderRadius:center?14:9,padding:center?"12px 16px":"8px 10px",
      width:center?205:158,fontFamily:"inherit",
      boxShadow:center?`0 0 24px ${a.risk==="Critical"?RED:NAV}28`:`0 2px 8px rgba(0,0,0,0.10)`,
    },
    data:{label:(
      <div style={{display:"flex",flexDirection:"column",gap:center?4:2}}>
        {center&&<span style={{fontSize:18}}>{catIcon[a.category]??"🖥"}</span>}
        <span style={{fontWeight:800,fontSize:center?12:10,color:NAV,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"as const}}>{a.hostname}</span>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"as const}}>
          <span style={{fontSize:8,fontWeight:800,color:"white",background:catColor[a.category]??NAV,padding:"1px 5px",borderRadius:3}}>{a.category}</span>
          <span style={{fontSize:8,fontWeight:700,color:a.risk==="Critical"?RED:a.risk==="High"?AMB:EME}}>{a.risk}</span>
        </div>
        {center&&<span style={{fontSize:9,color:"var(--muted-foreground)",fontFamily:"'JetBrains Mono',monospace"}}>{a.ip}</span>}
        {center&&<span style={{fontSize:9,color:"var(--muted-foreground)"}}>{a.dept} · {a.os}</span>}
        {center&&a.vulnCount>0&&<span style={{fontSize:9,color:AMB,fontWeight:700}}>{a.vulnCount} vulns · score {a.exposureScore}</span>}
      </div>
    )},
  });

  const swSpacing = Math.min(150,Math.floor(900/Math.max(1,sw.length)));
  const mkSW=(nid:string,name:string,i:number):Node=>({
    id:nid,type:"default",position:{x:80+i*swSpacing,y:560},
    style:{background:"rgba(59,130,246,0.07)",border:"1px solid rgba(59,130,246,0.22)",borderRadius:7,padding:"7px 10px",width:128,fontFamily:"inherit"},
    data:{label:(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <span style={{fontSize:14}}>📦</span>
        <span style={{fontSize:9,fontWeight:700,color:BLU,textAlign:"center"as const,lineHeight:1.2}}>{name}</span>
      </div>
    )},
  });

  const CX=450,CY=280;
  const nodes:Node[]=[
    mkD("center",asset,CX,CY,true),
    ...infraAssets.map((a,i)=>mkD(`infra-${i}`,a,80,50+i*130)),
    ...peers.map((a,i)=>mkD(`peer-${i}`,a,830,50+i*130)),
    ...sw.map((s,i)=>mkSW(`sw-${i}`,s,i)),
  ];
  const edges:Edge[]=[
    ...infraAssets.map((_,i)=>mkEdge2(`de-${i}`,`infra-${i}`,"center","depends on",NAV)),
    ...peers.map((_,i)=>mkEdge2(`pe-${i}`,"center",`peer-${i}`,"fleet peer",CYN)),
    ...sw.map((_,i)=>mkEdge2(`swe-${i}`,"center",`sw-${i}`,"installs",BLU)),
  ];
  return {nodes,edges};
}

function buildGraph(assets: AssetEntry[]) {
  if (assets.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };
  const cnt = (c: Category) => assets.filter(a => a.category === c).length;

  const nodes: Node[] = [
    // ── Internet / External ─────────────────────────────────────────────────
    { id:"inet", type:"default", position:{x:900,y:0},
      style:{background:"rgba(59,130,246,0.08)",border:"2px solid rgba(59,130,246,0.3)",borderRadius:40,padding:"10px 20px",width:184,height:60,fontFamily:"inherit"},
      data:{label:<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,height:"100%",fontWeight:800,color:BLU,fontSize:13}}>🌍 Internet</div>} },
    mkCluster("c-saas", 1720, 0,    "SaaS",       cnt("SaaS"),      "#0891B2"),
    // ── Perimeter ──────────────────────────────────────────────────────────
    mkInfra("AST-0111", 740,  200, "🔥","fw-perimeter-01",   "Network",      "203.0.113.1",  RED),
    mkInfra("AST-0120", 530,  200, "🔒","vpn-gateway-01",    "Network",      "203.0.113.5",  PRP),
    mkSynth("waf-01",   1050, 200, "🛡","waf-cloudflare",    "Cloudflare CDN","WAF/Proxy",   CYN),
    // ── DMZ ────────────────────────────────────────────────────────────────
    mkSynth("lb-01",    850,  390, "⚖","lb-prod-01",        "10.0.0.100 · NGINX","Load Balancer",EME),
    mkSynth("dmz-fw",   1060, 390, "🔀","dmz-fw-01",         "10.0.0.2 · FortiGate","DMZ FW",  AMB),
    // ── Core Network ───────────────────────────────────────────────────────
    mkInfra("AST-0108", 840,  570, "🔀","sw-core-01",        "Network",      "10.0.0.1",     PRP),
    mkSynth("sw-core2", 1060, 570, "🔀","sw-core-02",        "10.0.0.2 · Cisco Nexus","Network",PRP),
    // ── Corporate LAN ──────────────────────────────────────────────────────
    mkInfra("AST-0119", 510,  760, "🔀","access-sw-floor3",  "Network",      "10.3.0.2",     PRP),
    mkCluster("c-ws",   280,  930, "Workstation", cnt("Workstation"),NAV),
    mkCluster("c-mob",  540,  930, "Mobile",      cnt("Mobile"),     CYN),
    // ── Server Farm ────────────────────────────────────────────────────────
    mkInfra("AST-0101", 1100, 710, "🏛","corp-dc-01",         "Server",      "10.10.0.5",    NAV, true),
    mkInfra("AST-0103", 1050, 910, "🚀","prod-api-01",        "Server",      "10.10.1.12",   EME),
    mkInfra("AST-0104", 1260, 910, "🗄","prod-db-pg-01",      "Server",      "10.10.2.50",   EME),
    mkCluster("c-srv",  1155, 1090,"Server",       cnt("Server")-3,  NAV),
    // ── Cloud & Container ──────────────────────────────────────────────────
    mkInfra("AST-0112", 1520, 710, "☁","vm-prod-az-westeu",  "Cloud",       "10.20.4.11",   BLU),
    mkCluster("c-cld",  1720, 710, "Cloud",        cnt("Cloud")-2,   BLU),
    mkInfra("AST-0114", 1520, 910, "📦","k8s-node-01",        "Container",   "10.40.0.1",    CYN),
    mkInfra("AST-0113", 1720, 910, "☁","ec2-analytics-01",   "Cloud",       "10.30.1.5",    AMB),
    mkCluster("c-ctr",  1620, 1090,"Container",    cnt("Container")-1,CYN),
    // ── IoT Isolated VLAN ──────────────────────────────────────────────────
    mkInfra("AST-0106", 310,  1130,"📡","badge-rdr-BCN-12",   "IoT",         "192.168.50.12",AMB, true),
    mkInfra("AST-0115", 120,  1130,"📡","iot-hvac-ctrl-01",   "IoT",         "192.168.60.5", AMB),
    mkCluster("c-iot",  205,  1290,"IoT",           cnt("IoT")-2,     AMB),
    // ── OT Air-Gap ─────────────────────────────────────────────────────────
    mkInfra("AST-0109", 580,  1130,"⚙","scada-plc-prod-01",  "OT",          "192.168.100.5","#4338CA",true),
    mkCluster("c-ot",   770,  1130,"OT",            cnt("OT")-1,      "#4338CA"),
    // ── Unknown / Rogue ────────────────────────────────────────────────────
    mkInfra("AST-0118", 970,  1050,"❓","00:e0:73:63:82:99",  "Unknown",     "10.10.99.201", RED, true),
    mkCluster("c-unk",  1100, 1130,"Unknown",       cnt("Unknown")-1, RED),
    // ── Branch / SD-WAN ────────────────────────────────────────────────────────
    mkInfra("branch-fw",  90,  200,"🏢","branch-fw-atlanta",  "Network",     "192.0.2.1",   PRP),
    mkSynth("sdwan-hub",  270,  100,"🔗","sdwan-hub-01",       "10.100.0.1 · MPLS","SD-WAN",PRP),
    // ── More DMZ ────────────────────────────────────────────────────────────────
    mkSynth("mailgw-01",  1270, 200,"📧","mailgw-smtp-01",     "10.0.0.50 · Proofpoint","Mail GW",AMB),
    mkSynth("revproxy",   1490, 200,"🔁","revproxy-nginx-01",  "10.0.0.80 · NGINX","Rev Proxy",CYN),
    mkSynth("sftp-srv",   1270, 390,"📁","sftp-secure-01",     "10.0.0.90",   "SFTP",        NAV),
    // ── More Corp Floors ────────────────────────────────────────────────────────
    mkInfra("dist-sw-1",  200,  760,"🔀","dist-sw-floor1-01", "Network",     "10.1.0.1",    PRP),
    mkInfra("dist-sw-2",  380,  760,"🔀","dist-sw-floor2-01", "Network",     "10.2.0.1",    PRP),
    // ── DNS / Identity ──────────────────────────────────────────────────────────
    mkInfra("dns-01",     1060, 710,"🌐","dns-corp-01",        "Server",      "10.10.0.20",  NAV),
    mkInfra("adfs-01",    1360,1130,"🔐","adfs-prod-01",       "Server",      "10.10.0.10",  NAV),
    // ── Security Operations Center ──────────────────────────────────────────────
    mkInfra("siem-01",    1360, 710,"📊","splunk-siem-prod",   "Server",      "10.10.8.100", PRP, true),
    mkInfra("pam-01",     1360, 850,"🔒","cyberark-pam-01",   "Server",      "10.10.8.200", NAV),
    mkInfra("va-01",      1360, 990,"🔍","qualys-scanner-01",  "Server",      "10.10.8.150", AMB),
    // ── Extended Cloud / Backup ─────────────────────────────────────────────────
    mkSynth("azure-ad",   1940, 500,"🆔","azure-entra-id",     "Entra ID",    "Cloud IdP",   BLU),
    mkSynth("aws-vpc",    1940, 700,"⚡","aws-vpc-prod-us",    "10.30.0.0/16","AWS VPC",     AMB),
    mkSynth("backup-srv", 1940, 900,"💾","veeam-backup-01",    "10.10.9.100", "Backup/DR",   GRN),
  ];

  const mkEdge = (id:string, s:string, t:string, label:string, color:string, exp=false, ani=false): Edge => ({
    id, source:s, target:t, label,
    style:{stroke:exp?RED:color, strokeWidth:exp?2.5:1.5, strokeDasharray:exp?"6,3":undefined},
    markerEnd:{type:MarkerType.ArrowClosed, color:exp?RED:color, width:14, height:14},
    labelStyle:{fontSize:9,fontWeight:700,fill:exp?RED:"#6B7280",fontFamily:"'JetBrains Mono',monospace"},
    animated:ani||exp,
  });

  const edges: Edge[] = [
    mkEdge("e1",  "inet",     "AST-0111","HTTPS / BGP",        NAV),
    mkEdge("e2",  "inet",     "waf-01",  "CDN / TLS",          CYN),
    mkEdge("e3",  "c-saas",   "inet",    "SaaS Traffic",       CYN),
    mkEdge("e4",  "AST-0120", "AST-0111","VPN Tunnel",          PRP),
    mkEdge("e5",  "AST-0111", "lb-01",   "FW → LB",            NAV),
    mkEdge("e6",  "waf-01",   "lb-01",   "WAF → LB",           CYN),
    mkEdge("e7",  "AST-0111", "dmz-fw",  "FW → DMZ",           NAV),
    mkEdge("e8",  "lb-01",    "AST-0108","L3 Route",            NAV),
    mkEdge("e9",  "dmz-fw",   "AST-0108","L3 Route",            NAV),
    mkEdge("e10", "dmz-fw",   "sw-core2","L3 Route",            NAV),
    mkEdge("e11", "AST-0108", "sw-core2","Core Uplink",         PRP),
    mkEdge("e12", "AST-0108", "AST-0119","Access L3",           NAV),
    mkEdge("e13", "AST-0108", "AST-0101","BinRM / AD",          NAV),
    mkEdge("e14", "sw-core2", "AST-0112","Azure ExpressRoute",  BLU),
    mkEdge("e15", "AST-0119", "c-ws",    "Corp LAN · 7,150",    NAV),
    mkEdge("e16", "AST-0119", "c-mob",   "WiFi / MDM · 1,975",  CYN),
    mkEdge("e17", "AST-0101", "AST-0103","WinRM Mgmt",          NAV),
    mkEdge("e18", "AST-0103", "AST-0104","DB Connection",       EME),
    mkEdge("e19", "AST-0103", "c-srv",   `Server Fleet · ${(cnt("Server")-3).toLocaleString()}`, EME),
    mkEdge("e20", "AST-0112", "c-cld",   `Cloud Fleet · ${(cnt("Cloud")-2).toLocaleString()}`,   BLU),
    mkEdge("e21", "AST-0112", "AST-0114","AKS Node",            CYN),
    mkEdge("e22", "AST-0113", "AST-0104","Analytics ETL",       AMB),
    mkEdge("e23", "AST-0114", "AST-0103","K8s → API",           CYN),
    mkEdge("e24", "AST-0114", "c-ctr",   `K8s Fleet · ${(cnt("Container")-1).toLocaleString()}`,CYN),
    mkEdge("e25", "AST-0108", "AST-0106","IoT VLAN",            AMB, true),
    mkEdge("e26", "AST-0106", "AST-0101","Badge → DC",          AMB, true),
    mkEdge("e27", "AST-0108", "c-iot",   `IoT Segment · ${(cnt("IoT")-2).toLocaleString()}`,    AMB),
    mkEdge("e28", "c-iot",    "AST-0115","HVAC Fleet",          AMB),
    mkEdge("e29", "AST-0109", "AST-0108","OT–IT Bridge",        "#4338CA", true, true),
    mkEdge("e30", "c-ot",     "AST-0109","OT Fleet",            "#4338CA"),
    mkEdge("e31", "AST-0118", "AST-0108","Rogue Device",        RED, true, true),
    mkEdge("e32", "c-unk",    "AST-0108","Unknown Traffic",     RED, true),
    // ── Branch / SD-WAN ──────────────────────────────────────────────────────
    mkEdge("e33", "branch-fw","sdwan-hub","MPLS Branch",        PRP),
    mkEdge("e34", "sdwan-hub","AST-0111", "SD-WAN Uplink",      PRP),
    // ── More DMZ ─────────────────────────────────────────────────────────────
    mkEdge("e35", "inet",     "mailgw-01","SMTP Inbound",       AMB),
    mkEdge("e36", "inet",     "revproxy", "HTTPS",              CYN),
    mkEdge("e37", "revproxy", "lb-01",    "Proxied Traffic",    CYN),
    mkEdge("e38", "dmz-fw",   "sftp-srv", "DMZ → SFTP",        NAV),
    mkEdge("e39", "sftp-srv", "AST-0108", "Internal",           NAV),
    mkEdge("e40", "mailgw-01","dmz-fw",   "Mail → DMZ FW",     AMB),
    // ── Corp Floors ──────────────────────────────────────────────────────────
    mkEdge("e41", "AST-0108", "dist-sw-1","Floor 1 Access",     PRP),
    mkEdge("e42", "AST-0108", "dist-sw-2","Floor 2 Access",     PRP),
    mkEdge("e43", "dist-sw-1","c-ws",     "Workstations Floor1",NAV),
    mkEdge("e44", "dist-sw-2","c-mob",    "MDM / Mobile Floor2",CYN),
    // ── DNS / Identity ────────────────────────────────────────────────────────
    mkEdge("e45", "AST-0101", "dns-01",   "DNS Primary",        NAV),
    mkEdge("e46", "AST-0101", "adfs-01",  "AD Federation",      NAV),
    mkEdge("e47", "adfs-01",  "azure-ad", "Entra ID Sync",      BLU),
    // ── Security Operations ───────────────────────────────────────────────────
    mkEdge("e48", "sw-core2", "siem-01",  "Log Stream",         PRP, false, false),
    mkEdge("e49", "AST-0101", "siem-01",  "DC Events",          PRP),
    mkEdge("e50", "pam-01",   "AST-0101", "PAM → DC",           NAV),
    mkEdge("e51", "va-01",    "AST-0103", "Vuln Scan",          AMB),
    mkEdge("e52", "siem-01",  "pam-01",   "SIEM → PAM",         PRP),
    // ── Cloud ─────────────────────────────────────────────────────────────────
    mkEdge("e53", "azure-ad", "AST-0112", "Entra ID → VM",      BLU),
    mkEdge("e54", "aws-vpc",  "AST-0113", "VPC → EC2",          AMB),
    mkEdge("e55", "backup-srv","AST-0101","Backup DC",          GRN),
    mkEdge("e56", "backup-srv","AST-0104","Backup DB",          GRN),
  ];

  return { nodes, edges };
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AssetOps() {
  const { viewTenantId } = useOrg();
  const [dataSources,   setDataSources]   = useState<any[]>([]);
  const [attackSurface, setAttackSurface] = useState<any[]>([]);
  const [iotDevices,    setIotDevices]    = useState<IotDevice[]>([]);
  const [otDiscovery,   setOtDiscovery]   = useState<any[]>([]);
  const [otProtocols,   setOtProtocols]   = useState<any[]>([]);

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    fetch("/api/assetops/data-sources",   { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setDataSources(d)).catch(()=>{});
    fetch("/api/assetops/attack-surface", { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setAttackSurface(d)).catch(()=>{});
    fetch("/api/asset/iot-devices",  { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&setIotDevices(d)).catch(()=>{});
    fetch("/api/asset/ot-discovery", { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&setOtDiscovery(d)).catch(()=>{});
    fetch("/api/asset/ot-protocols", { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&setOtProtocols(d)).catch(()=>{});
  }, []);

  const [tab, setTab]       = useState("overview");
  const [selectedAsset, setSelectedAsset] = useState<AssetEntry|null>(null);
  const [selSurface, setSelSurface] = useState<(typeof attackSurface)[0]|null>(null);
  const [catFilter, setCatFilter]   = useState<Category|"All">("All");
  const [riskFilter, setRiskFilter] = useState<RiskLevel|"All">("All");
  const [confFilter, setConfFilter] = useState<Confidence|"All">("All");
  const [filterConds, setFilterConds] = useState<FilterCondition[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [depAsset, setDepAsset] = useState<AssetEntry|null>(null);
  const [iotSubTab, setIotSubTab] = useState("inventory");
  const [selIotDevice, setSelIotDevice] = useState<IotDevice|null>(null);
  const [iotSearch, setIotSearch] = useState("");
  const [search, setSearch] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(100);
  const { data: caasmStatsData, isError: statsError } = useCaasmStats();
  const { data: caasmAssetsData, isLoading: assetsLoading, isError: assetsError } = useCaasmAssets({
    page: inventoryPage,
    pageSize: inventoryPageSize,
    search: search || undefined,
    category: catFilter !== "All" ? catFilter : undefined,
  });

  const apiStats = caasmStatsData?.total ? caasmStatsData : null;
  const inventoryItems: AssetEntry[] = (caasmAssetsData?.items ?? []).map((a: any) => ({
    id: a.id, hostname: a.hostname, category: a.category as Category,
    confidence: a.confidence as Confidence, os: a.os, lastSeen: a.lastSeen,
    antivirus: a.antivirus, ip: a.ip, manufacturer: a.manufacturer,
    agentVersion: a.agentVersion,
    sources: Array.isArray(a.sources) ? a.sources.length : (Number(a.sources) || 1),
    managed: a.managed, risk: a.risk as RiskLevel, dept: a.dept,
    exposureScore: Number(a.exposureScore) || 0, vulnCount: Number(a.vulnCount) || 0,
    critVulns: Number(a.critVulns) || 0, tags: Array.isArray(a.tags) ? a.tags : [],
  }));
  const inventoryTotal = caasmAssetsData?.total ?? 0;
  const inventoryPages = caasmAssetsData?.pages ?? 0;

  const lInventory = inventoryItems;
  const filtered   = useMemo(()=>lInventory.filter((a): boolean =>{
    if(riskFilter!=="All"&&a.risk!==riskFilter)    return false;
    if(confFilter!=="All"&&a.confidence!==confFilter) return false;
    for(const c of filterConds){
      const val=String((a as unknown as Record<string,unknown>)[c.field]??"").toLowerCase();
      const cv=c.value.toLowerCase();
      if(c.op==="equals"&&val!==cv)         return false;
      if(c.op==="contains"&&!val.includes(cv)) return false;
      if(c.op==="not equals"&&val===cv)     return false;
    }
    return true;
  }),[riskFilter,confFilter,filterConds,lInventory]);

  const { nodes, edges } = useMemo(()=>buildGraph(inventory),[inventory]);
  const depGraph = useMemo(()=>depAsset ? buildDepGraph(depAsset, lInventory) : null,[depAsset,lInventory]);

  const globalTotal  = apiStats?.total ?? (viewTenantId === 1 ? inventory.length : 0);
  const lDataSources  = viewTenantId === 1 ? dataSources  : [] as typeof dataSources;
  const lAttackSurface = viewTenantId === 1 ? attackSurface : [] as typeof attackSurface;
  const queryTotal   = inventoryTotal;

  const tabs = [
    { key:"overview",    label:"Overview",         count:globalTotal },
    { key:"inventory",   label:"Asset Inventory",  count:globalTotal },
    { key:"topology",    label:"Topology Graph",   count:nodes.length },
    { key:"dependency",  label:"Dependency Graph", count:0 },
    { key:"sources",     label:"Data Sources",     count:lDataSources.length },
    { key:"exposure",    label:"Attack Surface",   count:lAttackSurface.filter(e=>e.status!=="ok").length, dot:lAttackSurface.some(e=>e.status!=="ok")?"#DC2626":undefined },
    { key:"iot",         label:"IoT/OT Devices",   count:iotDevices.length, dot:iotDevices.some(d=>d.risk==="Critical")?"#DC2626":undefined },
  ];

  const totalManaged   = apiStats?.managed   ?? lInventory.filter(a=>a.managed).length;
  const totalUnmanaged = apiStats?.unmanaged ?? lInventory.filter(a=>!a.managed).length;
  const critRisk       = apiStats?.byRisk?.["Critical"] ?? lInventory.filter(a=>a.risk==="Critical").length;
  const totalVulns     = apiStats?.totalVulns ?? lInventory.reduce((s,a)=>s+a.vulnCount,0);
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#F9F8F6", overflow:"hidden" }}>
      {(assetsError || statsError) && (
        <div style={{ background:"rgba(220,38,38,0.08)", borderBottom:"1px solid rgba(220,38,38,0.2)", padding:"8px 20px", fontSize:12, color:"#DC2626", fontWeight:600 }}>
          ⚠ Failed to load asset data — check API connectivity
        </div>
      )}
      <ModuleHeader
        title="CAASM — Asset Management"
        description="Cyber Asset Attack Surface Management — multi-source asset inventory, topology, and exposure analysis"
        badge={{ label:"CAASM", color:NAV, bg:"rgba(59,130,246,0.12)" }}
        action={{ label:"+ Import Assets", onClick:()=>{} }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={t=>{ setTab(t); setSelectedAsset(null); }} />
      <AICopilotBar module="assetops" />
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>

        {/* ── Overview ── */}
        {tab==="overview" && (()=>{
          const managed    = apiStats?.managed    ?? lInventory.filter(a=>a.managed).length;
          const unmanaged  = apiStats?.unmanaged  ?? lInventory.filter(a=>!a.managed).length;
          const critAssets = apiStats?.byRisk?.["Critical"] ?? lInventory.filter(a=>a.risk==="Critical").length;
          const highAssets = apiStats?.byRisk?.["High"]     ?? lInventory.filter(a=>a.risk==="High").length;
          const critVulns2 = apiStats?.critVulns  ?? lInventory.reduce((s,a)=>s+a.critVulns,0);
          const totalVulns2= apiStats?.totalVulns ?? lInventory.reduce((s,a)=>s+a.vulnCount,0);
          const totalAll   = globalTotal;
          const exposureSurf=lAttackSurface.filter(e=>e.status!=="ok").length;
          const byRisk=(["Critical","High","Medium","Low"] as const).map(r=>({r,count:apiStats?.byRisk?.[r]??lInventory.filter(a=>a.risk===r).length,color:r==="Critical"?RED:r==="High"?AMB:r==="Medium"?BLU:EME}));
          // Top 10 Risky
          const top10Risk=lInventory.filter(a=>a.risk==="Critical"||a.risk==="High").sort((a,b)=>b.exposureScore-a.exposureScore).slice(0,10);
          // EOL/EOS assets
          const eolAssets=lInventory.map(a=>{const m=detectEol(a.os);return m?{a,match:m}:null}).filter((x):x is {a:AssetEntry;match:EolMatch}=>!!x).sort((x,y)=>y.match.severity===x.match.severity?0:y.match.severity==="critical"?1:-1);
          // Duplicate groups
          const _bases:Record<string,AssetEntry[]>={};
          for(const a of lInventory){
            const base=a.hostname.replace(/\.(acme\.(corp|int)|cloud)$/,"").replace(/[-_]\d{2,4}$/,"");
            if(!_bases[base])_bases[base]=[];
            _bases[base].push(a);
          }
          const dupGroups=Object.entries(_bases).filter(([,v])=>v.length>=2).map(([base,assets])=>({base,assets,maxRisk:(assets.some(a=>a.risk==="Critical")?"Critical":assets.some(a=>a.risk==="High")?"High":assets.some(a=>a.risk==="Medium")?"Medium":"Low") as RiskLevel})).sort((a,b)=>b.assets.length-a.assets.length).slice(0,10);
          return (
            <div style={{ flex:1, overflow:"auto", padding:"0 4px", display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
                {([
                  { label:"Total Assets",       value:totalAll.toLocaleString(),            sub:`${lDataSources.length} data sources`,  color:NAV, tab:"inventory" },
                  { label:"Managed",            value:String(managed),                       sub:"Agent / MDM enrolled",               color:EME, tab:"inventory" },
                  { label:"Unmanaged / Shadow", value:String(unmanaged),                     sub:"No agent — visibility gap",          color:RED, tab:"inventory" },
                  { label:"Critical Risk",      value:String(critAssets),                    sub:`${highAssets} high risk`,            color:RED, tab:"inventory" },
                  { label:"Total Vulns",        value:String(totalVulns2),                   sub:`${critVulns2} critical vulns`,       color:AMB, tab:"inventory" },
                  { label:"Attack Surface",     value:String(exposureSurf),                  sub:"Exposed external assets",            color:RED, tab:"exposure"  },
                ] as {label:string;value:string;sub:string;color:string;tab:string}[]).map(k=>(
                  <div key={k.label} onClick={()=>setTab(k.tab)} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.35)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px", cursor:"pointer" }}>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color, marginBottom:4 }}>{k.value}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:3 }}>{k.label}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.4 }}>{k.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Assets by Category</div>
                  {(["Server","Cloud","Container","Network","Workstation","IoT","Mobile","OT","SaaS","Security","Identity","Unknown"] as const).map(label=>({ label, count:apiStats?.byCategory?.[label]??lInventory.filter(a=>a.category===label).length, color:catColor[label]??"#6B7280" })).filter(c=>c.count>0).map(c=>{
                    const pct=totalAll>0?Math.round((c.count/totalAll)*100):0;
                    return (
                      <div key={c.label} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                          <span style={{ fontWeight:600, color:c.color }}>{c.label}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{c.count} · {pct}%</span>
                        </div>
                        <div style={{ height:7, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:4, background:c.color, width:`${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Risk Distribution</div>
                  {byRisk.map(r=>{
                    const pct=totalAll>0?Math.round((r.count/totalAll)*100):0;
                    return (
                      <div key={r.r} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:r.color }}>{r.r}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:14, color:r.color }}>{r.count}</span>
                        </div>
                        <div style={{ height:9, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:4, background:r.color, width:`${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ borderTop:"1px solid var(--border)", paddingTop:12, marginTop:2 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:8 }}>Management Status</div>
                    {([{label:"Managed",count:managed,color:EME,bg:"rgba(34,197,94,0.08)"},{label:"Unmanaged",count:unmanaged,color:RED,bg:"rgba(239,68,68,0.06)"}] as {label:string;count:number;color:string;bg:string}[]).map(s=>(
                      <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:s.bg, borderRadius:6, marginBottom:4 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:s.color }}>{s.label}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:16, color:s.color }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>External Attack Surface</div>
                  {lAttackSurface.map(a=>(
                    <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)" }}>{a.asset}</div>
                        {a.finding&&<div style={{ fontSize:9, color:RED, marginTop:1 }}>{a.finding}</div>}
                      </div>
                      <span style={{ fontSize:9, fontWeight:800, background:a.status==="critical"?"rgba(239,68,68,0.06)":a.status==="warning"?"rgba(245,158,11,0.06)":"rgba(34,197,94,0.08)", color:statusMap[a.status], border:`1px solid ${a.status==="critical"?"#FECACA":a.status==="warning"?"#FDE68A":"#A7F3D0"}`, borderRadius:4, padding:"2px 7px", flexShrink:0, marginLeft:8, textTransform:"uppercase" as const }}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* ── 3-column intel row ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
                {/* Top 10 Risky Assets */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:RED }}>🔴 Top 10 Risky Assets</span>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>by exposure score</span>
                  </div>
                  {top10Risk.map(a=>(
                    <div key={a.id} onClick={()=>{setTab("inventory");setSelectedAsset(a);}} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"var(--muted-foreground)",flexShrink:0,width:70 }}>{a.id}</span>
                      <div style={{ width:7,height:7,borderRadius:"50%",background:a.risk==="Critical"?RED:AMB,flexShrink:0 }} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:10,fontWeight:700,color:"var(--foreground)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const }}>{a.hostname}</div>
                        <div style={{ fontSize:9,color:"var(--muted-foreground)" }}>{a.category} · {a.dept}</div>
                      </div>
                      {!a.managed&&<span style={{ fontSize:8,fontWeight:700,color:RED,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:3,padding:"1px 5px",flexShrink:0 }}>UNMANAGED</span>}
                      <div style={{ textAlign:"right" as const,flexShrink:0 }}>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14,color:a.risk==="Critical"?RED:AMB }}>{a.exposureScore}</div>
                        {a.vulnCount>0&&<div style={{ fontSize:8,color:AMB }}>{a.vulnCount} vulns</div>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* EOL/EOS Software */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:AMB }}>⚠ EOL / EOS Software</span>
                    <span style={{ fontSize:10, color:RED, fontWeight:700 }}>{eolAssets.length} assets</span>
                  </div>
                  {eolAssets.slice(0,10).map(({a,match})=>(
                    <div key={a.id} onClick={()=>{setTab("inventory");setSelectedAsset(a);}} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:10,fontWeight:700,color:"var(--foreground)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const }}>{a.hostname}</div>
                        <div style={{ fontSize:9,color:match.severity==="critical"?RED:AMB }}>{match.label} · EOL {match.eolDate}</div>
                      </div>
                      <span style={{ fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:3,background:match.status==="EOL"?"rgba(239,68,68,0.08)":"rgba(245,158,11,0.08)",color:match.status==="EOL"?RED:AMB,border:`1px solid ${match.status==="EOL"?"rgba(252,165,165,0.2)":"rgba(253,230,138,0.2)"}`,flexShrink:0 }}>{match.status}</span>
                    </div>
                  ))}
                  {eolAssets.length>10&&<div style={{ fontSize:10,color:"var(--muted-foreground)",marginTop:8,textAlign:"center" as const }}>+{eolAssets.length-10} more EOL assets</div>}
                </div>
                {/* Top 10 Duplicate Assets */}
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:BLU }}>🔁 Top 10 Duplicate Assets</span>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>by hostname pattern</span>
                  </div>
                  {dupGroups.map(g=>(
                    <div key={g.base} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:10,fontWeight:700,color:"var(--foreground)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,fontFamily:"'JetBrains Mono',monospace" }}>{g.base}*</div>
                        <div style={{ fontSize:9,color:"var(--muted-foreground)" }}>{g.assets[0]?.category} · {g.assets[0]?.dept}</div>
                      </div>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14,color:BLU,flexShrink:0 }}>{g.assets.length}×</span>
                      <RiskBadge level={g.maxRisk} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Asset Inventory ── */}
        {tab==="inventory" && (selectedAsset?(
          <AssetDetailPage asset={selectedAsset} onBack={()=>setSelectedAsset(null)} allAssets={lInventory} />
        ):(
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"12px 20px 0", display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              <StatCard label="Total Assets"  value={globalTotal.toLocaleString()}     sub="Across all sources"   color={NAV} icon="🖥" />
              <StatCard label="Managed"       value={totalManaged.toLocaleString()}     sub="With agent / managed" color={EME} icon="✅" />
              <StatCard label="Unmanaged"     value={totalUnmanaged.toLocaleString()}   sub="No agent / shadow"    color={RED} icon="⚠" />
              <StatCard label="Critical Risk" value={critRisk}                          sub="Immediate attention"  color={RED} icon="🔴" />
              <StatCard label="Total Vulns"   value={totalVulns}                        sub="Across managed fleet" color={AMB} icon="🛡" />
            </div>
            <div style={{ padding:"10px 20px", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
              <input value={search} onChange={e=>{setSearch(e.target.value);setInventoryPage(1);}} placeholder="Search hostname, IP, dept…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:220, fontFamily:"inherit" }} />
              {(["All","Server","Workstation","IoT","Mobile","Network","OT","Cloud","Container","SaaS","Security","Identity","Unknown"] as const).map(c=>(
                <button key={c} onClick={()=>{setCatFilter(c);setInventoryPage(1);}} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", background:catFilter===c?(catColor[c]??NAV):"var(--input)", color:catFilter===c?"white":"#6B7280", borderColor:catFilter===c?(catColor[c]??NAV):"rgba(255,255,255,0.1)" }}>{c}</button>
              ))}
              <span style={{ borderLeft:"1px solid var(--border)", height:20, margin:"0 4px" }} />
              {(["All","Critical","High","Medium","Low"] as const).map(r=>(
                <button key={r} onClick={()=>setRiskFilter(r)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", background:riskFilter===r?"#1E3A5F":"var(--card)", color:riskFilter===r?"white":"#6B7280", borderColor:riskFilter===r?"#1E3A5F":"rgba(255,255,255,0.1)" }}>{r}</button>
              ))}
              <button onClick={()=>setShowFilterBuilder(b=>!b)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${showFilterBuilder?BLU:"rgba(255,255,255,0.1)"}`, fontSize:11, fontWeight:700, cursor:"pointer", background:showFilterBuilder?"rgba(59,130,246,0.12)":"var(--card)", color:showFilterBuilder?BLU:"#6B7280" }}>🔧 Filter builder {filterConds.length>0&&`(${filterConds.length})`}</button>
              {bulkSelected.size>0&&(
                <>
                  <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{bulkSelected.size} selected</span>
                  <button style={{ padding:"4px 10px", borderRadius:6, border:"none", background:NAV, color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>Tag</button>
                  <button style={{ padding:"4px 10px", borderRadius:6, border:"none", background:EME, color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>Export</button>
                  <button style={{ padding:"4px 10px", borderRadius:6, border:"none", background:RED, color:"white", fontSize:11, fontWeight:700, cursor:"pointer" }}>Retire</button>
                </>
              )}
              <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>
                {queryTotal > 0
                  ? `Page ${inventoryPage} of ${inventoryPages} · ${queryTotal.toLocaleString()} ${queryTotal < globalTotal ? "matching" : ""} assets`
                  : `${filtered.length} assets`}
              </span>
            </div>
            {showFilterBuilder&&(
              <div style={{ padding:"0 20px 10px" }}>
                <div style={card({ padding:14 })}>
                  <FilterBuilder conditions={filterConds} onChange={setFilterConds} />
                </div>
              </div>
            )}
            <div style={{ flex:1, overflow:"hidden", display:"flex" }}>
              <div style={{ flex:1, overflow:"auto", padding:"0 20px 20px" }}>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"var(--card)", borderBottom:"1px solid var(--border)" }}>
                        <th style={{ padding:"10px 14px", textAlign:"left" as const }}>
                          <input type="checkbox" onChange={e=>setBulkSelected(e.target.checked?new Set(filtered.map(a=>a.id)):new Set())} checked={bulkSelected.size===filtered.length&&filtered.length>0} style={{ cursor:"pointer" }} />
                        </th>
                        {["ID","Hostname","Category","OS","IP","Sources","Confidence","Last Seen","Risk","Dept","Action"].map(c=>(
                          <th key={c} style={{ textAlign:"left" as const, padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, letterSpacing:"0.5px", textTransform:"uppercase" as const }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((_a)=>{const a:AssetEntry=_a as unknown as AssetEntry;const aId=a.id;const aSel=selectedAsset as AssetEntry|null;return(
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        <tr key={aId} onClick={()=>setSelectedAsset(aSel?.id===aId?null:a)} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", background:aSel?.id===aId?"rgba(59,130,246,0.08)":bulkSelected.has(aId)?"rgba(34,197,94,0.08)":"var(--card)" }} onMouseEnter={e=>{if(aSel?.id!==aId)e.currentTarget.style.background="var(--secondary)"}} onMouseLeave={e=>{if(aSel?.id!==aId)e.currentTarget.style.background=bulkSelected.has(aId)?"rgba(34,197,94,0.08)":"var(--card)"}}>
                          <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                            <input type="checkbox" checked={bulkSelected.has(a.id)} onChange={e=>{const n=new Set(bulkSelected);e.target.checked?n.add(a.id):n.delete(a.id);setBulkSelected(n);}} style={{ cursor:"pointer" }} />
                          </td>
                          <td style={{ padding:"11px 14px" }}><Mono>{a.id}</Mono></td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              {(a.category==="SaaS"||a.category==="Security"||a.category==="Identity") && getSaasLogoUrl(a.manufacturer,a.hostname) ? (
                                <img src={getSaasLogoUrl(a.manufacturer,a.hostname)} alt={a.manufacturer} onError={e=>{(e.target as HTMLImageElement).style.display="none"}} style={{ width:24, height:24, borderRadius:4, objectFit:"contain", background:"white", padding:2, flexShrink:0 }} />
                              ) : (
                                <span style={{ fontSize:14 }}>{catIcon[a.category]??"🖥"}</span>
                              )}
                              <div>
                                <div style={{ fontWeight:700, color:"var(--foreground)", fontSize:11 }}>{a.hostname}</div>
                                <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{a.manufacturer}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:"11px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:"white", background:catColor[a.category]??NAV, padding:"2px 6px", borderRadius:3 }}>{a.category}</span></td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--foreground)" }}>{a.os}</td>
                          <td style={{ padding:"11px 14px" }}><Mono>{a.ip}</Mono></td>
                          <td style={{ padding:"11px 14px" }}><SourceCluster count={a.sources} /></td>
                          <td style={{ padding:"11px 14px" }}><span style={{ background:confidenceColor[a.confidence as Confidence].bg, color:confidenceColor[a.confidence as Confidence].color, border:`1px solid ${confidenceColor[a.confidence as Confidence].border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{a.confidence}</span></td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{a.lastSeen}</td>
                          <td style={{ padding:"11px 14px" }}><RiskBadge level={a.risk} /></td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--foreground)" }}>{a.dept}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <button onClick={e=>{e.stopPropagation();setSelectedAsset(a);}} style={{ padding:"3px 8px", borderRadius:5, border:"1px solid var(--border)", background:"var(--input)", fontSize:10, fontWeight:700, cursor:"pointer", color:CYN }}>Details →</button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                {inventoryPages > 1 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderTop:"1px solid var(--border)", background:"var(--card)", borderRadius:"0 0 12px 12px" }}>
                    <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>
                      Showing <span style={{ color:"var(--foreground)", fontWeight:700 }}>{(inventoryPage-1)*inventoryPageSize+1}–{Math.min(inventoryPage*inventoryPageSize, inventoryTotal)}</span> of <span style={{ color:NAV, fontWeight:700 }}>{inventoryTotal.toLocaleString()}</span> assets
                    </span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <button onClick={()=>setInventoryPage(1)} disabled={inventoryPage===1} style={{ padding:"4px 8px", borderRadius:5, border:"1px solid var(--border)", background:inventoryPage===1?"var(--card)":"var(--input)", color:inventoryPage===1?"rgba(148,163,184,0.3)":"var(--foreground)", fontSize:11, fontWeight:700, cursor:inventoryPage===1?"default":"pointer" }}>«</button>
                      <button onClick={()=>setInventoryPage(p=>Math.max(1,p-1))} disabled={inventoryPage===1} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid var(--border)", background:inventoryPage===1?"var(--card)":"var(--input)", color:inventoryPage===1?"rgba(148,163,184,0.3)":"var(--foreground)", fontSize:11, fontWeight:700, cursor:inventoryPage===1?"default":"pointer" }}>‹ Prev</button>
                      {Array.from({length:Math.min(7,inventoryPages)},(_,i)=>{
                        let pg=i+1;
                        if(inventoryPages>7){
                          if(inventoryPage<=4) pg=i+1;
                          else if(inventoryPage>=inventoryPages-3) pg=inventoryPages-6+i;
                          else pg=inventoryPage-3+i;
                        }
                        return (
                          <button key={pg} onClick={()=>setInventoryPage(pg)} style={{ padding:"4px 9px", borderRadius:5, border:`1px solid ${pg===inventoryPage?NAV:"var(--border)"}`, background:pg===inventoryPage?NAV:"var(--input)", color:pg===inventoryPage?"white":"var(--foreground)", fontSize:11, fontWeight:pg===inventoryPage?800:600, cursor:"pointer", minWidth:32 }}>{pg}</button>
                        );
                      })}
                      <button onClick={()=>setInventoryPage(p=>Math.min(inventoryPages,p+1))} disabled={inventoryPage===inventoryPages} style={{ padding:"4px 10px", borderRadius:5, border:"1px solid var(--border)", background:inventoryPage===inventoryPages?"var(--card)":"var(--input)", color:inventoryPage===inventoryPages?"rgba(148,163,184,0.3)":"var(--foreground)", fontSize:11, fontWeight:700, cursor:inventoryPage===inventoryPages?"default":"pointer" }}>Next ›</button>
                      <button onClick={()=>setInventoryPage(inventoryPages)} disabled={inventoryPage===inventoryPages} style={{ padding:"4px 8px", borderRadius:5, border:"1px solid var(--border)", background:inventoryPage===inventoryPages?"var(--card)":"var(--input)", color:inventoryPage===inventoryPages?"rgba(148,163,184,0.3)":"var(--foreground)", fontSize:11, fontWeight:700, cursor:inventoryPage===inventoryPages?"default":"pointer" }}>»</button>
                      <select value={inventoryPageSize} onChange={e=>{setInventoryPageSize(Number(e.target.value));setInventoryPage(1);}} style={{ padding:"3px 6px", borderRadius:5, border:"1px solid var(--border)", background:"var(--input)", color:"#94A3B8", fontSize:11, cursor:"pointer", marginLeft:8 }}>
                        {[25,50,100,250,500].map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* ── Topology Graph ── */}
        {tab==="topology" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"10px 20px", display:"flex", gap:16, alignItems:"center", background:"var(--card)", borderBottom:"1px solid var(--border)" }}>
              {[{dot:RED,label:"Critical asset"},{line:RED,label:"Exposure path"},{line:NAV,label:"Network connection"},{line:PRP,label:"VPN / encrypted"}].map((l,i)=>(
                <div key={i} style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {"dot" in l?<div style={{ width:10, height:10, borderRadius:"50%", background:l.dot, border:`2px solid ${l.dot}55` }} />:<div style={{ width:24, height:2, background:l.line, borderRadius:1 }} />}
                  <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{l.label}</span>
                </div>
              ))}
              <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{globalTotal.toLocaleString()} assets · {edges.length} relationships</span>
            </div>
            <div style={{ flex:1, minHeight:0, position:"relative" as const }}>
              <div style={{ position:"absolute" as const, inset:0 }}>
                <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right" proOptions={{ hideAttribution:true }}
                  onNodeClick={(_,node)=>{ const a=lInventory.find(x=>x.id===node.id); if(a){setDepAsset(a);setTab("dependency");} }}>
                  <Background gap={20} size={1} color="var(--border)" />
                  <Controls />
                  <MiniMap nodeColor={n=>{ const a=lInventory.find(x=>x.id===n.id); return a?.risk==="Critical"?RED:a?.risk==="High"?AMB:NAV; }} style={{ background:"var(--card)", border:"1px solid var(--border)" }} />
                </ReactFlow>
              </div>
            </div>
          </div>
        )}

        {/* ── Dependency Graph ── */}
        {tab==="dependency" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {/* Header bar */}
            <div style={{ padding:"10px 20px", background:"var(--card)", borderBottom:"1px solid var(--border)", display:"flex", gap:12, alignItems:"center", flexShrink:0, flexWrap:"wrap" as const }}>
              {depAsset ? (
                <>
                  <span style={{ fontSize:16 }}>{catIcon[depAsset.category]??"🖥"}</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{depAsset.id}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--foreground)" }}>{depAsset.hostname}</span>
                  <span style={{ fontSize:9, fontWeight:800, color:"white", background:catColor[depAsset.category]??NAV, padding:"2px 7px", borderRadius:3 }}>{depAsset.category}</span>
                  <RiskBadge level={depAsset.risk} />
                  <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{depAsset.dept} · {depAsset.os}</span>
                  <button onClick={()=>setDepAsset(null)} style={{ padding:"3px 10px", borderRadius:5, border:"1px solid rgba(255,255,255,0.1)", background:"var(--input)", color:"var(--muted-foreground)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>✕ Clear</button>
                </>
              ) : (
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Select an asset below, or click any node in the Topology Graph</span>
              )}
              <div style={{ marginLeft:"auto", display:"flex", gap:14, alignItems:"center" }}>
                {([["Upstream Deps",NAV],["Fleet Peers",CYN],["Installed Software",BLU]] as const).map(([lbl,col])=>(
                  <span key={lbl} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, fontWeight:600, color:"var(--muted-foreground)" }}>
                    <div style={{ width:20, height:2, background:col, borderRadius:1 }} />{lbl}
                  </span>
                ))}
              </div>
            </div>
            {depAsset && depGraph ? (
              <div style={{ flex:1, minHeight:0, position:"relative" as const }}>
                <div style={{ position:"absolute" as const, inset:0 }}>
                  <ReactFlow nodes={depGraph.nodes} edges={depGraph.edges} fitView attributionPosition="bottom-right" proOptions={{ hideAttribution:true }}
                    onNodeClick={(_,n)=>{const found=lInventory.find(x=>x.id===n.id.replace(/^(infra|peer)-\d+$/,""));if(!found)return;setDepAsset(found);}}>
                    <Background gap={20} size={1} color="var(--border)" />
                    <Controls />
                    <MiniMap style={{ background:"var(--card)", border:"1px solid var(--border)" }} />
                  </ReactFlow>
                </div>
              </div>
            ) : (
              <div style={{ flex:1, overflow:"auto", padding:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"var(--muted-foreground)", marginBottom:14 }}>Select an asset to explore its dependency graph:</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
                  {lInventory.filter(a=>a.risk==="Critical"||a.risk==="High").sort((a,b)=>b.exposureScore-a.exposureScore).slice(0,24).map(a=>(
                    <div key={a.id} onClick={()=>setDepAsset(a)} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, transition:"border-color 0.15s" }} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(147,197,253,0.3)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                      <span style={{ fontSize:20, flexShrink:0 }}>{catIcon[a.category]??"🖥"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{a.hostname}</div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{a.id} · {a.dept} · {a.os}</div>
                      </div>
                      <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                        <RiskBadge level={a.risk} />
                        <span style={{ fontSize:9, color:AMB }}>{a.vulnCount>0?`${a.vulnCount} vulns`:""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Data Sources ── */}
        {tab==="sources" && (
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16, overflow:"auto", flex:1 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              <StatCard label="Active Sources"   value={lDataSources.length}                                        sub="Integrated platforms"    color={NAV} icon="🔌" />
              <StatCard label="Total Synced"     value={lDataSources.reduce((s,d)=>s+d.assets,0).toLocaleString()} sub="Records across all sources" color={EME} icon="🔄" />
              <StatCard label="Unique Assets"    value={totalCatAssets.toLocaleString()}                          sub="After deduplication"    color={BLU} icon="🎯" />
              <StatCard label="Correlation Rate" value="97.4%"                                                    sub="Successfully correlated" color={EME} icon="📊" />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              {lDataSources.map(s=>(
                <div key={s.name} style={card({ padding:16 })}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:`${s.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontWeight:800, color:"var(--foreground)", fontSize:12 }}>{s.name}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Last sync: {s.lastSync}</div>
                    </div>
                    <span style={{ marginLeft:"auto", background:"rgba(34,197,94,0.08)", color:EME, border:"1px solid rgba(52,211,153,0.25)", borderRadius:4, padding:"2px 6px", fontSize:9, fontWeight:700 }}>LIVE</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:18, fontWeight:800, color:"var(--foreground)" }}>{s.assets.toLocaleString()}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>assets synced</div>
                    </div>
                    <div style={{ width:80, height:6, background:"var(--input)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${Math.round((s.assets/totalCatAssets)*100)}%`, height:"100%", background:s.color, borderRadius:4 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Attack Surface ── */}
        {tab==="exposure" && (
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16, overflow:"auto", flex:1 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              <StatCard label="Exposed Surfaces" value={lAttackSurface.length}                                             sub="Domains, IPs & subdomains" color={NAV} icon="🌐" />
              <StatCard label="Critical Issues"  value={lAttackSurface.filter(e=>e.status==="critical").length}           sub="Immediate action"          color={RED} icon="🔴" />
              <StatCard label="Warnings"         value={lAttackSurface.filter(e=>e.status==="warning").length}            sub="Review recommended"        color={AMB} icon="⚠" />
              <StatCard label="Open Ports"       value={lAttackSurface.reduce((s,e)=>s+e.open.length,0)}                  sub="Across all surfaces"       color={NAV} icon="🔌" />
            </div>
            <TableShell
              onRowClick={i=>setSelSurface(lAttackSurface[i])}
              cols={["ID","Type","Asset","Open Ports","DNS","Certificate","Status","Finding"]}
              rows={lAttackSurface.map(e=>[
                <Mono>{e.id}</Mono>,
                <span style={{ fontSize:10, fontWeight:700, color:"#6B7280" }}>{e.type}</span>,
                <span style={{ fontWeight:700, color:"var(--foreground)", fontSize:12 }}>{e.asset}</span>,
                <div style={{ display:"flex", gap:3 }}>{e.open.map((p: string)=><Mono key={p}>{p}</Mono>)}</div>,
                <span style={{ fontSize:11 }}>{e.dns}</span>,
                <span style={{ fontSize:11, color:e.cert.includes("Expired")?"#DC2626":e.cert==="None"?"#D97706":"#065F46" }}>{e.cert}</span>,
                <span style={{ background:`${statusMap[e.status]}18`, color:statusMap[e.status], border:`1px solid ${statusMap[e.status]}44`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, textTransform:"capitalize" as const }}>{e.status}</span>,
                <span style={{ fontSize:11, color:e.finding?RED:"var(--muted-foreground)" }}>{e.finding||"—"}</span>,
              ])}
            />
          </div>
        )}

        {/* ── Attack Surface Detail Panel ── */}
        {selSurface && (
          <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex" }}>
            <div onClick={()=>setSelSurface(null)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(2px)" }} />
            <div style={{ position:"absolute", right:0, top:0, bottom:0, width:480, background:"var(--card)", borderLeft:"1px solid rgba(255,255,255,0.1)", display:"flex", flexDirection:"column", boxShadow:"-8px 0 40px rgba(0,0,0,0.5)" }}>
              {/* Header */}
              <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>{selSurface.asset}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>CAASM · Attack Surface Detail · {selSurface.id}</div>
                </div>
                <button onClick={()=>setSelSurface(null)} style={{ width:28, height:28, borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", cursor:"pointer", fontSize:16, color:"var(--muted-foreground)", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
              <div style={{ flex:1, overflow:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>
                {/* Status banner */}
                <div style={{ background:selSurface.status==="critical"?"rgba(239,68,68,0.06)":selSurface.status==="warning"?"rgba(245,158,11,0.06)":"rgba(34,197,94,0.06)", border:`1px solid ${selSurface.status==="critical"?"rgba(252,165,165,0.3)":selSurface.status==="warning"?"rgba(253,230,138,0.3)":"rgba(167,243,208,0.3)"}`, borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:22 }}>{selSurface.status==="critical"?"🔴":selSurface.status==="warning"?"⚠":"✅"}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:statusMap[selSurface.status], textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{selSurface.status}</div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{selSurface.finding||"No issues detected"}</div>
                  </div>
                </div>

                {/* Surface details */}
                <div style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", marginBottom:10, textTransform:"uppercase" as const }}>Surface Details</div>
                  {([
                    ["ID",           <Mono style={{ fontSize:11 }}>{selSurface.id}</Mono>],
                    ["Type",         <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{selSurface.type}</span>],
                    ["Asset",        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:CYN, fontWeight:700 }}>{selSurface.asset}</span>],
                    ["DNS Record",   <span style={{ fontSize:11, color:"var(--foreground)" }}>{selSurface.dns}</span>],
                    ["Certificate",  <span style={{ fontSize:11, fontWeight:700, color:selSurface.cert.includes("Expired")?"#DC2626":selSurface.cert==="None"?"#D97706":"#34D399" }}>{selSurface.cert}</span>],
                  ] as [string, React.ReactNode][]).map(([k,v])=>(
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:11, gap:8 }}>
                      <span style={{ color:"var(--muted-foreground)", fontWeight:600, whiteSpace:"nowrap" as const }}>{k}</span>
                      <span style={{ textAlign:"right" as const }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Open ports */}
                <div style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", marginBottom:10, textTransform:"uppercase" as const }}>Open Ports ({selSurface.open.length})</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                    {selSurface.open.map((port: string) => {
                      const portInfo: Record<string,{name:string;risk:string}> = {"443":{name:"HTTPS",risk:"Low"},"80":{name:"HTTP",risk:"Medium"},"22":{name:"SSH",risk:"High"},"8080":{name:"HTTP-Alt",risk:"Medium"},"25":{name:"SMTP",risk:"Low"},"465":{name:"SMTPS",risk:"Low"},"993":{name:"IMAPS",risk:"Low"},"3389":{name:"RDP",risk:"Critical"},"5432":{name:"PostgreSQL",risk:"High"}};
                      const pi = portInfo[port] ?? {name:"Unknown",risk:"Unknown"};
                      const rc = pi.risk==="Critical"?RED:pi.risk==="High"?AMB:pi.risk==="Medium"?BLU:EME;
                      return (
                        <div key={port} style={{ background:"var(--card)", border:`1px solid ${rc}33`, borderRadius:8, padding:"8px 12px", textAlign:"center" as const, minWidth:72 }}>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:rc, marginBottom:2 }}>{port}</div>
                          <div style={{ fontSize:9, fontWeight:700, color:"var(--foreground)" }}>{pi.name}</div>
                          <div style={{ fontSize:9, color:rc, marginTop:2, fontWeight:700 }}>{pi.risk}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Remediation */}
                <div style={{ background:"var(--input)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", marginBottom:10, textTransform:"uppercase" as const }}>Remediation Guidance</div>
                  {selSurface.status==="critical"?(
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {selSurface.finding?.includes("SSH")&&<div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>1. Immediately close SSH port 22 on external firewall. Restrict to VPN / jump-box only.<br/>2. Enforce SSH key-based authentication — disable password login.<br/>3. Enable TLS/HTTPS on all external-facing web services.</div>}
                      {selSurface.finding?.includes("SSL")&&<div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>1. Renew SSL certificate immediately via your CA.<br/>2. Enable auto-renewal using Let's Encrypt or ACM.<br/>3. Redirect all HTTP traffic to HTTPS.</div>}
                      {selSurface.finding?.includes("RDP")&&<div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>1. Close RDP port 3389 immediately on the perimeter firewall.<br/>2. Route all remote access through VPN or Azure Bastion.<br/>3. Enable NLA and MFA for all RDP sessions.</div>}
                      {!selSurface.finding&&<div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>Investigate the reported issue immediately and apply vendor-recommended patches.</div>}
                    </div>
                  ):selSurface.status==="warning"?(
                    <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>
                      {selSurface.finding?.includes("8080")&&"Remove or restrict port 8080 — use port 443 with TLS only for external services."}
                      {selSurface.finding?.includes("cert")&&"Renew TLS certificate before expiry. Consider enabling automated certificate management (ACM / Let's Encrypt)."}
                      {selSurface.finding?.includes("5432")&&"Block PostgreSQL port 5432 on external firewall. Database ports must never be internet-accessible."}
                      {!selSurface.finding&&"Review the flagged configuration and apply hardening per CIS benchmarks."}
                    </div>
                  ):(
                    <div style={{ fontSize:11, color:EME, lineHeight:1.7 }}>✓ No issues detected. Continue monitoring and renew certificates ahead of expiry.</div>
                  )}
                </div>

                {/* AI insight */}
                <div style={{ background:"linear-gradient(135deg,rgba(124,58,237,0.07),rgba(29,78,216,0.05))", border:"1px solid rgba(124,58,237,0.2)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:13, color:PRP }}>✦</span>
                    <span style={{ fontSize:10, fontWeight:800, color:PRP, letterSpacing:"0.4px" }}>AIGO-X AI Insight</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.7 }}>
                    {selSurface.status==="critical"
                      ?`${selSurface.asset} represents an active high-priority exposure. Threat actors routinely scan for ${selSurface.finding?.includes("RDP")?"exposed RDP ports":selSurface.finding?.includes("SSH")?"open SSH services":"expired certificates"} — exploitation risk is elevated. Immediate remediation is required to prevent unauthorized access.`
                      :selSurface.status==="warning"
                      ?`${selSurface.asset} has a minor but trackable exposure. Left unresolved, this can escalate — particularly if combined with other vulnerabilities in the same network segment. Recommend scheduling remediation within 7 days.`
                      :`${selSurface.asset} is within acceptable security parameters. AI continuous monitoring is active with no anomalous traffic patterns detected in the last 72 hours.`
                    }
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
                  {["Create Ticket","Assign Remediation","Export Finding","Suppress 30d"].map(a=>(
                    <button key={a} onClick={()=>setSelSurface(null)} style={{ padding:"7px 14px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"var(--secondary)", color:"var(--foreground)", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{a}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── IoT/OT Devices ────────────────────────────────────────────── */}
        {tab==="iot" && (() => {
          const critCount = iotDevices.filter(d=>d.risk==="Critical").length;
          const totalCves = iotDevices.reduce((s,d)=>s+d.cves.length,0);
          const critWithCves = iotDevices.filter(d=>d.cves.length>0).length;
          return (
            <div style={{ flex:1, overflow:"auto", padding:"16px 20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
              {/* Stats row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  { label:"IoT/OT Devices", value:iotDevices.length, icon:"📡", color:AMB, sub:`Across ${[...new Set(iotDevices.map(d=>d.segment))].length} segments` },
                  { label:"Critical Risk", value:critCount, icon:"🔴", color:RED, sub:"Requires immediate action" },
                  { label:"CVE-Exposed Devices", value:critWithCves, icon:"⚠️", color:RED, sub:`${totalCves} total CVEs` },
                  { label:"OT Protocols Detected", value:otProtocols.length, icon:"⚙️", color:PRP, sub:"Industrial protocols" },
                ].map(s=>(
                  <div key={s.label} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", boxShadow:"0 2px 12px rgba(0,0,0,0.35)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{s.icon}</span>
                      <div style={{ fontSize:26, fontWeight:800, color:s.color, fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>{s.label}</div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Sub-tabs */}
              <div style={{ display:"flex", borderBottom:"1px solid var(--border)" }}>
                {[{k:"inventory",l:"Device Inventory"},{k:"discovery",l:"Discovery Scan"},{k:"protocols",l:"OT Protocol Risk"}].map(t=>(
                  <button key={t.k} onClick={()=>{ setIotSubTab(t.k); setSelIotDevice(null); }} style={{ padding:"8px 18px", border:"none", borderBottom:`2px solid ${iotSubTab===t.k?AMB:"transparent"}`, background:"none", cursor:"pointer", fontSize:12, fontWeight:iotSubTab===t.k?700:500, color:iotSubTab===t.k?"var(--foreground)":"var(--muted-foreground)", transition:"color 0.15s", fontFamily:"inherit" }}>{t.l}</button>
                ))}
              </div>

              {/* Inventory sub-tab */}
              {iotSubTab==="inventory" && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <input placeholder="Search devices by name, type, or manufacturer…" value={iotSearch} onChange={e=>setIotSearch(e.target.value)} style={{ padding:"8px 14px", borderRadius:7, border:"1px solid var(--border)", fontSize:12, background:"var(--input)", color:"var(--foreground)", outline:"none", fontFamily:"inherit" }} />
                  <div style={{ overflow:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr style={{ background:"var(--secondary)" }}>
                          {["","Device ID","Name","Type","Manufacturer","Firmware","IP Address","Segment","CVEs","Risk"].map(h=>(
                            <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontWeight:700, color:"var(--muted-foreground)", fontSize:10, whiteSpace:"nowrap" as const, borderBottom:"1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {iotDevices.filter(d=>!iotSearch||[d.name,d.type,d.manufacturer,d.ip].some(f=>f.toLowerCase().includes(iotSearch.toLowerCase()))).map(d=>(
                          <>
                            <tr key={d.id} onClick={()=>setSelIotDevice(selIotDevice?.id===d.id?null:d)} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", background:selIotDevice?.id===d.id?"var(--secondary)":"transparent" }} onMouseEnter={e=>{if(selIotDevice?.id!==d.id)(e.currentTarget as HTMLTableRowElement).style.background="rgba(255,255,255,0.02)"}} onMouseLeave={e=>{if(selIotDevice?.id!==d.id)(e.currentTarget as HTMLTableRowElement).style.background="transparent"}}>
                              <td style={{ padding:"8px 12px", textAlign:"center" }}><span style={{ fontSize:16 }}>{d.icon}</span></td>
                              <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:AMB, fontWeight:700 }}>{d.id}</td>
                              <td style={{ padding:"8px 12px", fontWeight:600, color:"var(--foreground)" }}>{d.name}</td>
                              <td style={{ padding:"8px 12px", color:"var(--muted-foreground)" }}>{d.type}</td>
                              <td style={{ padding:"8px 12px", color:"var(--muted-foreground)" }}>{d.manufacturer}</td>
                              <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:d.fwDate<"2022"?RED:"var(--foreground)" }}>{d.firmware} <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>({d.fwDate})</span></td>
                              <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>{d.ip}</td>
                              <td style={{ padding:"8px 12px" }}><span style={{ background:"rgba(124,58,237,0.07)", color:PRP, border:"1px solid rgba(124,58,237,0.18)", borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:600 }}>{d.segment}</span></td>
                              <td style={{ padding:"8px 12px" }}><span style={{ color:d.cves.length>0?RED:"var(--muted-foreground)", fontWeight:700 }}>{d.cves.length}</span></td>
                              <td style={{ padding:"8px 12px" }}><RiskBadge level={d.risk} /></td>
                            </tr>
                            {selIotDevice?.id===d.id && (
                              <tr key={d.id+"-detail"}>
                                <td colSpan={10} style={{ padding:0 }}>
                                  <div style={{ background:"rgba(8,145,178,0.04)", border:"1px solid rgba(8,145,178,0.15)", borderRadius:8, margin:"4px 12px 8px", padding:"16px 18px" }}>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
                                      <div>
                                        <div style={{ fontSize:10, fontWeight:800, color:CYN, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.6px" }}>Open Ports</div>
                                        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4, marginBottom:10 }}>
                                          {d.openPorts.map(p=><span key={p} style={{ background:"rgba(8,145,178,0.08)", color:CYN, border:"1px solid rgba(8,145,178,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{p}</span>)}
                                        </div>
                                        <div style={{ fontSize:10, fontWeight:800, color:PRP, marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.6px" }}>Protocols</div>
                                        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4 }}>
                                          {d.protocols.map(p=><span key={p} style={{ background:"rgba(124,58,237,0.08)", color:PRP, border:"1px solid rgba(124,58,237,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:600 }}>{p}</span>)}
                                        </div>
                                        <div style={{ marginTop:10, fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>Location: <span style={{ color:"var(--foreground)" }}>{d.location}</span></div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize:10, fontWeight:800, color:RED, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.6px" }}>CVE Exposure ({d.cves.length})</div>
                                        {d.cves.length===0
                                          ? <div style={{ fontSize:11, color:GRN }}>✓ No known CVEs for this firmware</div>
                                          : d.cves.map(c=>(
                                            <div key={c.id} style={{ marginBottom:6, padding:"7px 10px", background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.18)", borderRadius:6 }}>
                                              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                                                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:RED, fontWeight:700 }}>{c.id}</span>
                                                <span style={{ background:"rgba(220,38,38,0.08)", color:RED, border:"1px solid rgba(220,38,38,0.25)", borderRadius:3, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{c.sev}</span>
                                                <span style={{ fontSize:9, color:"var(--muted-foreground)", marginLeft:"auto" }}>CVSS {c.cvss}</span>
                                              </div>
                                              <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.4 }}>{c.desc}</div>
                                            </div>
                                          ))}
                                      </div>
                                      <div>
                                        <div style={{ fontSize:10, fontWeight:800, color:AMB, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.6px" }}>Communication Peers</div>
                                        <div style={{ display:"flex", flexDirection:"column" as const, gap:3, marginBottom:12 }}>
                                          {d.commPeers.map(p=><span key={p} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--foreground)" }}>→ {p}</span>)}
                                        </div>
                                        <div style={{ fontSize:10, fontWeight:800, color:GRN, marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.6px" }}>Recommended Isolation Action</div>
                                        <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5, padding:"8px 10px", background:"rgba(5,150,105,0.06)", border:"1px solid rgba(5,150,105,0.2)", borderRadius:6 }}>{d.isolationAction}</div>
                                        <div style={{ marginTop:10, display:"flex", gap:6 }}>
                                          {["Create Ticket","Isolate","Export"].map(a=>(
                                            <button key={a} style={{ padding:"5px 10px", borderRadius:5, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{a}</button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Discovery Scan sub-tab */}
              {iotSubTab==="discovery" && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ display:"flex", gap:12 }}>
                    <div style={{ flex:1, padding:"10px 16px", background:"rgba(8,145,178,0.05)", border:"1px solid rgba(8,145,178,0.2)", borderRadius:8, display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:16 }}>📡</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:CYN }}>Passive Network Discovery Active</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Last scan: 2 hours ago · Next: in 4 hours · Segments: VLAN-50, VLAN-100, VLAN-150, VLAN-200</div>
                      </div>
                    </div>
                    <div style={{ padding:"10px 20px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, textAlign:"center" }}>
                      <div style={{ fontSize:24, fontWeight:800, color:AMB }}>{otDiscovery.filter(d=>d.action.startsWith("URGENT")||d.action.startsWith("CRITICAL")).length}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Urgent Items</div>
                    </div>
                    <div style={{ padding:"10px 20px", background:"rgba(8,145,178,0.05)", border:"1px solid rgba(8,145,178,0.15)", borderRadius:8, textAlign:"center" }}>
                      <div style={{ fontSize:24, fontWeight:800, color:CYN }}>{otDiscovery.length}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>New Devices</div>
                    </div>
                  </div>
                  <div style={{ overflow:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                      <thead>
                        <tr style={{ background:"var(--secondary)" }}>
                          {["IP Address","Hostname","Type","Confidence","First Seen","Open Ports","Recommended Action"].map(h=>(
                            <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontWeight:700, color:"var(--muted-foreground)", fontSize:10, whiteSpace:"nowrap" as const, borderBottom:"1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {otDiscovery.map((d,i)=>(
                          <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                            <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:CYN, fontWeight:700 }}>{d.ip}</td>
                            <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>{d.hostname}</td>
                            <td style={{ padding:"8px 12px", color:"var(--muted-foreground)" }}>{d.type}</td>
                            <td style={{ padding:"8px 12px" }}>
                              <span style={{ background:d.confidence==="High"?"rgba(34,197,94,0.08)":d.confidence==="Medium"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)", color:d.confidence==="High"?GRN:d.confidence==="Medium"?AMB:RED, border:`1px solid ${d.confidence==="High"?"#A7F3D0":d.confidence==="Medium"?"#FDE68A":"#FECACA"}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{d.confidence}</span>
                            </td>
                            <td style={{ padding:"8px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{d.firstSeen}</td>
                            <td style={{ padding:"8px 12px" }}>
                              <div style={{ display:"flex", gap:3 }}>
                                {d.openPorts.map((p: string)=><span key={p} style={{ background:"rgba(8,145,178,0.08)", color:CYN, border:"1px solid rgba(8,145,178,0.2)", borderRadius:3, padding:"1px 6px", fontSize:9, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{p}</span>)}
                              </div>
                            </td>
                            <td style={{ padding:"8px 12px", fontSize:10, maxWidth:320 }}>
                              {d.action.startsWith("URGENT")||d.action.startsWith("CRITICAL")
                                ? <span style={{ color:RED, fontWeight:700 }}>{d.action}</span>
                                : <span style={{ color:"var(--muted-foreground)" }}>{d.action}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* OT Protocol Risk sub-tab */}
              {iotSubTab==="protocols" && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ padding:"10px 16px", background:"rgba(124,58,237,0.04)", border:"1px solid rgba(124,58,237,0.15)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>
                    <span style={{ color:PRP, fontWeight:700 }}>⚡ Industrial Protocol Analysis — </span>
                    Protocols detected via passive network analysis across OT/IoT segments. Unencrypted protocols represent significant attack surface in ICS/SCADA environments and often lack any authentication mechanism.
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {otProtocols.map(p=>(
                      <div key={p.name} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px", boxShadow:"0 2px 12px rgba(0,0,0,0.35)", borderLeft:`3px solid ${p.color}` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                              <span style={{ fontSize:14, fontWeight:800, color:"var(--foreground)" }}>{p.name}</span>
                              <span style={{ background:p.encrypted?"rgba(34,197,94,0.08)":p.exposure==="Critical"?"rgba(220,38,38,0.08)":p.exposure==="High"?"rgba(220,38,38,0.06)":"rgba(245,158,11,0.06)", color:p.encrypted?GRN:p.exposure==="Critical"||p.exposure==="High"?RED:AMB, border:`1px solid ${p.encrypted?"#A7F3D0":p.exposure==="Critical"||p.exposure==="High"?"#FECACA":"#FDE68A"}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{p.encrypted?"Encrypted":p.exposure+" Exposure"}</span>
                            </div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Port {p.port} · {p.devices} device{p.devices!==1?"s":""} detected</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:26, fontWeight:800, color:p.color, fontFamily:"'JetBrains Mono',monospace" }}>{p.devices}</div>
                            <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>devices</div>
                          </div>
                        </div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:10, lineHeight:1.5 }}>{p.desc}</div>
                        <div style={{ background:"rgba(5,150,105,0.06)", border:"1px solid rgba(5,150,105,0.15)", borderRadius:6, padding:"8px 10px", fontSize:11, color:"var(--foreground)" }}>
                          <span style={{ fontWeight:700, color:GRN }}>Action: </span>{p.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}

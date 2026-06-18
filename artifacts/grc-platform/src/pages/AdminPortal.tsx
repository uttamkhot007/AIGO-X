// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import FrameworkLibrary from "@/pages/FrameworkLibrary";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { Drawer, Field, DrawerSection, AiInsightBox } from "@/components/Drawer";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";
import { SUBMODULE_MAP, getSubmoduleKeys } from "@/config/submodules";

function apiUrl(path: string) {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${path}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H() { return { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` }; }

const C = {
  bg:"var(--card)", bg2:"var(--input)", bg3:"var(--secondary)",
  border:"var(--border)", border2:"rgba(255,255,255,0.14)",
  text:"var(--foreground)", accent:"rgb(147,197,253)", muted:"var(--muted-foreground)",
  green:"#34D399", warn:"#FBBF24", danger:"#F87171", purple:"#A78BFA",
};
const card: React.CSSProperties = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" };

const STATIC_TENANTS = [
  { id:1,  name:"Acme Corporation",    slug:"acme",     domain:"acme.com",           plan:"enterprise",users:48, status:"active",   created:"2023-01-15",storage:"4.2 GB",   mrr:"$1,299", modules:["All"],          sso:"Okta SAML", mfa:true,  aiInsights:["48 of 50 seats used — 96% utilisation. Upgrade conversation recommended.","MFA coverage: 94% — 3 users without MFA. Remediation email sent.","AI: automated seat utilisation alert at 90% would flag upgrade opportunity earlier.","Last login: 2h ago — active tenant."] },
  { id:2,  name:"Globex Industries",   slug:"globex",   domain:"globex.io",          plan:"pro",       users:21, status:"active",   created:"2023-06-20",storage:"1.8 GB",   mrr:"$499",  modules:["Core GRC","RiskOps","ComplianceOps"], sso:"None", mfa:false, aiInsights:["21 of 25 seats used — 84% utilisation.","No SSO configured — recommend Okta/Entra ID integration.","AI: enabling AI vCISO add-on could increase MRR by $300/month."] },
  { id:3,  name:"Umbrella Health",     slug:"umbrella", domain:"umbrella-health.com", plan:"enterprise",users:87, status:"active",   created:"2022-11-01",storage:"9.1 GB",   mrr:"$2,499",modules:["All","HIPAA Pack","AI vCISO"], sso:"Entra ID", mfa:true,  aiInsights:["87 of 100 seats — 87% utilisation. HIPAA Pack renewal due in 3 months.","SOC 2 audit scheduled — evidence collection in progress.","AI: automated HIPAA compliance report scheduled monthly would reduce manual effort."] },
  { id:4,  name:"Initech LLC",         slug:"initech",  domain:"initech.net",        plan:"starter",   users:5,  status:"active",   created:"2024-01-05",storage:"0.3 GB",   mrr:"$149",  modules:["GovOps","RiskOps","ComplianceOps"], sso:"None", mfa:false, aiInsights:["5 of 10 seats — low utilisation. Churn risk: medium.","No SSO, no MFA — security posture guidance email scheduled.","AI: personalised onboarding follow-up could improve activation."] },
  { id:5,  name:"Soylent Corp",        slug:"soylent",  domain:"soylent.co",         plan:"pro",       users:34, status:"suspended",created:"2023-08-12",storage:"2.4 GB",   mrr:"$0",    modules:["Core GRC"],     sso:"None", mfa:false, aiInsights:["Account suspended — payment failure 3 consecutive months.","$1,497 outstanding balance. Dunning sequence completed.","AI: proactive churn detection flagged payment risk 45 days before suspension."] },
  { id:6,  name:"Massive Dynamic",     slug:"massive",  domain:"massive-dynamic.com", plan:"enterprise",users:112,status:"active",   created:"2022-03-14",storage:"18.7 GB",  mrr:"$3,999",modules:["All","Custom SSO","SLA 99.99%"], sso:"Custom SAML", mfa:true,  aiInsights:["112 of 150 seats — 75% utilisation. Enterprise+ upsell potential.","Custom SSO and 99.99% SLA customer — high-value, low churn risk.","18.7 GB storage — approaching archival policy threshold (20 GB)."] },
];

const platformUsers = [
  { id:1, name:"Alex Kim",        email:"admin@acme.com",       role:"tenant_admin",     tenant:"Acme",     status:"active",    mfa:true,  lastLogin:"2h ago",   aiInsights:["Admin user — full tenant access.","MFA enabled. Last password change: 45 days ago.","AI: privileged access review due in 15 days."] },
  { id:2, name:"Sarah Chen",      email:"ciso@acme.com",        role:"ciso",             tenant:"Acme",     status:"active",    mfa:true,  lastLogin:"3h ago",   aiInsights:["CISO role — all modules read/write.","High-value user — 3 executive reports generated this week.","MFA: Okta Verify enrolled."] },
  { id:3, name:"Marcus Johnson",  email:"analyst@acme.com",     role:"security_analyst", tenant:"Acme",     status:"active",    mfa:false, lastLogin:"1d ago",   aiInsights:["MFA not enrolled — security policy violation. Escalation triggered.","Last login: 1 day ago. Login frequency: moderate.","AI: automated MFA enrolment reminder sent 12 June."] },
  { id:4, name:"Priya Patel",     email:"auditor@acme.com",     role:"compliance_analyst",tenant:"Acme",   status:"active",    mfa:true,  lastLogin:"5h ago",   aiInsights:["Compliance analyst — evidence collection activity high this week.","SOC 2 audit support user — 12 evidence uploads this week."] },
  { id:5, name:"Tom Hughes",      email:"tom@globex.io",        role:"tenant_admin",     tenant:"Globex",   status:"active",    mfa:true,  lastLogin:"1d ago",   aiInsights:["Globex admin — recommend SSO enablement.","2 open P2 tickets assigned."] },
  { id:6, name:"Emma Watson",     email:"emma@umbrella.com",    role:"ciso",             tenant:"Umbrella", status:"active",    mfa:true,  lastLogin:"4h ago",   aiInsights:["HIPAA-compliant tenant CISO.","HIPAA Pack renewal owner — renewal due September 2026."] },
  { id:7, name:"System Admin",    email:"admin@aigo-x.io",      role:"super_admin",      tenant:"Platform", status:"active",    mfa:true,  lastLogin:"1h ago",   aiInsights:["Super admin — maximum privilege level.","All session activity logged to immutable audit trail.","AI: privileged access review recommended quarterly."] },
];

const roles = [
  { role:"super_admin",        label:"Super Administrator",              users:1,  permissions:["All platform operations","Tenant management","System config"], risk:"Critical" },
  { role:"tenant_admin",       label:"Tenant Administrator",            users:2,  permissions:["Tenant settings","User management","Integrations"],            risk:"High"     },
  { role:"ciso",               label:"Chief Information Security Officer",users:3,permissions:["All modules read/write","Security strategy","Reporting"],      risk:"High"     },
  { role:"cro",                label:"Chief Risk Officer",               users:0,  permissions:["Risk management full","Risk appetite","Board reporting"],       risk:"High"     },
  { role:"cdpo",               label:"Data Protection Officer",          users:1,  permissions:["Privacy modules","ROPA","DSAR management"],                    risk:"Medium"   },
  { role:"security_analyst",   label:"Security Analyst",                 users:4,  permissions:["SecOps read/write","AssetOps","DataOps read"],                 risk:"Medium"   },
  { role:"compliance_analyst", label:"Compliance Analyst",               users:3,  permissions:["ComplianceOps","GovOps read","Evidence management"],           risk:"Medium"   },
  { role:"privacy_analyst",    label:"Privacy Analyst",                  users:2,  permissions:["PrivacyOps","DataOps read","ROPA management"],                 risk:"Medium"   },
  { role:"risk_analyst",       label:"Risk Analyst",                     users:2,  permissions:["RiskOps","TPRM","Reports"],                                   risk:"Medium"   },
  { role:"it_admin",           label:"IT Administrator",                 users:5,  permissions:["ServiceOps","AssetOps","CMDB management"],                    risk:"Medium"   },
  { role:"management",         label:"Management",                       users:8,  permissions:["All modules read-only","Executive dashboards"],                risk:"Low"      },
  { role:"employee",           label:"Employee",                         users:47, permissions:["Service desk tickets","Own data requests"],                    risk:"Low"      },
  { role:"vendor",             label:"Vendor / Auditor",                 users:3,  permissions:["Assigned module read-only","Evidence upload"],                 risk:"Low"      },
];

const licenses = [
  { id:"LIC-001", tenant:"Acme Corporation",  plan:"enterprise",seats:50,  used:48, features:["All modules","AI vCISO","TPRM","CAASM"],renewsAt:"2025-01-15",mrr:"$1,299" },
  { id:"LIC-002", tenant:"Globex Industries", plan:"pro",       seats:25,  used:21, features:["Core GRC","RiskOps","ComplianceOps"],  renewsAt:"2024-12-20",mrr:"$499"   },
  { id:"LIC-003", tenant:"Umbrella Health",   plan:"enterprise",seats:100, used:87, features:["All modules","HIPAA Pack","AI vCISO"], renewsAt:"2025-03-01",mrr:"$2,499" },
  { id:"LIC-004", tenant:"Initech LLC",       plan:"starter",   seats:10,  used:5,  features:["GovOps","RiskOps","ComplianceOps"],    renewsAt:"2024-12-05",mrr:"$149"   },
  { id:"LIC-005", tenant:"Massive Dynamic",   plan:"enterprise",seats:150, used:112,features:["All modules","Custom SSO","SLA 99.99%"],renewsAt:"2025-06-14",mrr:"$3,999"},
];


const perf = [
  { service:"API Server",       uptime:"99.97%",p50:"42ms", p95:"180ms",p99:"410ms",rps:"847",  errors:"0.02%",status:"healthy" },
  { service:"Auth Service",     uptime:"99.99%",p50:"28ms", p95:"95ms", p99:"220ms",rps:"312",  errors:"0.01%",status:"healthy" },
  { service:"Frontend (CDN)",   uptime:"100%",  p50:"18ms", p95:"65ms", p99:"110ms",rps:"1,840",errors:"0.00%",status:"healthy" },
  { service:"PostgreSQL",       uptime:"99.95%",p50:"8ms",  p95:"42ms", p99:"98ms", rps:"2,100",errors:"0.05%",status:"healthy" },
  { service:"Event Bus",        uptime:"99.91%",p50:"12ms", p95:"85ms", p99:"310ms",rps:"450",  errors:"0.09%",status:"warning" },
  { service:"Notification Svc", uptime:"99.80%",p50:"55ms", p95:"320ms",p99:"1,100ms",rps:"89",errors:"0.20%",status:"warning" },
];

const deps = [
  { name:"node",       type:"Runtime",   version:"20.11.1",latest:"22.2.0", status:"outdated",critical:false },
  { name:"drizzle-orm",type:"ORM",       version:"0.30.4", latest:"0.31.0", status:"ok",      critical:false },
  { name:"express",    type:"Framework", version:"4.19.2", latest:"5.0.0",  status:"outdated",critical:false },
  { name:"jsonwebtoken",type:"Auth",     version:"9.0.2",  latest:"9.0.2",  status:"ok",      critical:true  },
  { name:"bcryptjs",   type:"Auth",      version:"2.4.3",  latest:"2.4.3",  status:"ok",      critical:true  },
  { name:"otplib",     type:"Auth",      version:"12.0.1", latest:"12.0.1", status:"ok",      critical:true  },
  { name:"react",      type:"UI",        version:"18.3.1", latest:"18.3.1", status:"ok",      critical:false },
  { name:"vite",       type:"Build",     version:"7.3.3",  latest:"7.3.3",  status:"ok",      critical:false },
  { name:"pg",         type:"Database",  version:"8.11.5", latest:"8.12.0", status:"ok",      critical:true  },
];

const auditLog = [
  { id:"AUD-10042", ts:"2026-06-13 16:30:11", actor:"admin@aigo-x.io",  action:"SYSTEM RESTART",          resource:"API Server",              ip:"system",      severity:"Info",   outcome:"success" },
  { id:"AUD-10041", ts:"2026-06-13 16:25:09", actor:"admin@acme.com",   action:"TENANT LOGIN",            resource:"Acme Corporation",        ip:"10.11.12.13", severity:"Info",   outcome:"success" },
  { id:"AUD-10040", ts:"2026-06-13 15:58:22", actor:"185.220.12.77",    action:"FAILED LOGIN x5",         resource:"admin@acme.com",          ip:"185.220.12.77",severity:"Critical","outcome":"failure" },
  { id:"AUD-10039", ts:"2026-06-13 15:41:05", actor:"tom.h@acme.com",   action:"DLP BLOCK",               resource:"Confidential doc",        ip:"10.0.5.21",   severity:"High",   outcome:"blocked" },
  { id:"AUD-10038", ts:"2026-06-13 14:22:44", actor:"admin@aigo-x.io",  action:"TENANT CREATED",          resource:"Initech LLC",             ip:"admin-panel",  severity:"Info",   outcome:"success" },
  { id:"AUD-10037", ts:"2026-06-13 13:15:30", actor:"sarah@acme.com",   action:"POLICY UPDATED",          resource:"ISO 27001 Policy v3.2",   ip:"10.0.1.5",    severity:"Medium", outcome:"success" },
  { id:"AUD-10036", ts:"2026-06-13 12:08:19", actor:"admin@aigo-x.io",  action:"LICENSE MODIFIED",        resource:"Umbrella Health LIC-003", ip:"admin-panel",  severity:"Medium", outcome:"success" },
  { id:"AUD-10035", ts:"2026-06-13 11:44:55", actor:"priya@acme.com",   action:"EVIDENCE UPLOADED",       resource:"SOC 2 CC6.1",             ip:"10.0.1.8",    severity:"Info",   outcome:"success" },
  { id:"AUD-10034", ts:"2026-06-13 10:30:02", actor:"alex@acme.com",    action:"USER ROLE CHANGED",       resource:"marcus@acme.com (analyst→senior)", ip:"10.0.1.10",severity:"High","outcome":"success" },
  { id:"AUD-10033", ts:"2026-06-13 09:15:44", actor:"admin@aigo-x.io",  action:"RATE LIMITER UPDATED",    resource:"globalLimiter (skip:all)", ip:"system",      severity:"Medium", outcome:"success" },
  { id:"AUD-10032", ts:"2026-06-13 08:02:11", actor:"system",           action:"SCHEDULED BACKUP",        resource:"PostgreSQL prod-db-pg-01",ip:"system",      severity:"Info",   outcome:"success" },
  { id:"AUD-10031", ts:"2026-06-12 23:58:01", actor:"system",           action:"COMPLIANCE SCAN",         resource:"ISO 27001 gap analysis",  ip:"system",      severity:"Info",   outcome:"success" },
  { id:"AUD-10030", ts:"2026-06-12 18:30:45", actor:"admin@acme.com",   action:"SSO CONFIG UPDATED",      resource:"Okta SAML config",        ip:"10.0.1.10",   severity:"High",   outcome:"success" },
  { id:"AUD-10029", ts:"2026-06-12 14:20:33", actor:"admin@aigo-x.io",  action:"TENANT SUSPENDED",        resource:"Soylent Corp",            ip:"admin-panel",  severity:"High",   outcome:"success" },
  { id:"AUD-10028", ts:"2026-06-12 11:05:18", actor:"emma@umbrella.com",action:"HIPAA REPORT GENERATED",  resource:"HIPAA Q2 2026 report",    ip:"10.5.1.20",   severity:"Info",   outcome:"success" },
];

const sevColor: Record<string,{bg:string;color:string;border:string}> = {
  Critical:{ bg:"rgba(239,68,68,0.08)", color:"#F87171", border:"rgba(239,68,68,0.3)" },
  High:    { bg:"rgba(251,191,36,0.08)",color:"#FBBF24", border:"rgba(251,191,36,0.3)" },
  Medium:  { bg:"rgba(99,179,237,0.10)",color:"rgb(147,197,253)", border:"rgba(99,179,237,0.3)" },
  Info:    { bg:"rgba(52,211,153,0.06)",color:"#34D399", border:"rgba(52,211,153,0.2)" },
};

const PLANS = ["starter","pro","enterprise"];
const INP: React.CSSProperties = { width:"100%", padding:"8px 12px", background:"var(--input)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
const LBL: React.CSSProperties = { fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.8)", marginBottom:4, display:"block" };
const BTN = (color = C.accent, bg = "rgba(147,197,253,0.08)", border = "rgba(147,197,253,0.25)"): React.CSSProperties => ({
  padding:"7px 14px", background:bg, border:`1px solid ${border}`,
  borderRadius:7, color, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
});

const AI_PROVIDERS = [
  { id:"openai",    name:"OpenAI",           logo:"◈", color:"#10A37F", description:"GPT-4o, o1, o3-mini — industry-leading reasoning",    models:["gpt-4o","gpt-4o-mini","gpt-4-turbo","o1","o1-mini","o3-mini"],                         defaultBase:"https://api.openai.com/v1" },
  { id:"anthropic", name:"Anthropic Claude", logo:"⊕", color:"#D97757", description:"Claude 3.5 Sonnet, Opus — exceptional analysis",        models:["claude-opus-4-5","claude-sonnet-4-5","claude-haiku-4-5","claude-3-5-sonnet-20241022"], defaultBase:"https://api.anthropic.com" },
  { id:"gemini",    name:"Google Gemini",    logo:"◎", color:"#4285F4", description:"Gemini 1.5 Pro, 2.0 Flash — multimodal Google AI",      models:["gemini-2.0-flash-exp","gemini-1.5-pro","gemini-1.5-flash"],                          defaultBase:"https://generativelanguage.googleapis.com/v1beta/openai" },
  { id:"kimi",      name:"Moonshot Kimi",    logo:"◐", color:"#6366F1", description:"Kimi k1.5, moonshot-v1 — 128K context",                models:["kimi-k1.5-long","moonshot-v1-128k","moonshot-v1-32k"],                               defaultBase:"https://api.moonshot.cn/v1" },
  { id:"z-ai",      name:"Z.ai / 01.AI",     logo:"◑", color:"#7C3AED", description:"Yi-Large, Yi-Vision — efficient open-weight models",    models:["yi-large","yi-large-turbo","yi-medium"],                                             defaultBase:"https://api.01.ai/v1" },
  { id:"custom",    name:"Custom Endpoint",  logo:"⊙", color:"#64748B", description:"Any OpenAI-compatible API — Ollama, vLLM, Azure, etc.", models:[],                                                                                     defaultBase:"" },
];
const MCP_TOOLS = [
  { name:"grc_code_security_review", desc:"OWASP/CWE security code review",    icon:"🔍", tags:["DevSecOps","SAST"] },
  { name:"grc_devsecops_scan",        desc:"Pipeline/IaC/Dockerfile analysis",  icon:"🔧", tags:["DevSecOps","CI/CD"] },
  { name:"grc_risk_assessment",       desc:"FAIR model risk quantification",     icon:"⚖",  tags:["Risk","FAIR"] },
  { name:"grc_compliance_check",      desc:"Framework gap analysis",             icon:"✓",  tags:["Compliance","ISO/SOC"] },
  { name:"grc_threat_model",          desc:"STRIDE / MITRE ATT&CK threat model", icon:"🛡",  tags:["Security","MITRE"] },
  { name:"grc_incident_response",     desc:"IR playbook generation",             icon:"🚨", tags:["IR","NIST 800-61"] },
  { name:"grc_policy_lookup",         desc:"Governance policy search",           icon:"📋", tags:["GRC","Policy"] },
  { name:"grc_vulnerability_assess",  desc:"CVE/vuln impact + patch urgency",    icon:"🔴", tags:["Vuln","CVE"] },
];

type ApiTenant = {
  id: number; name: string; slug: string; domain: string|null; plan: string;
  status: string; seats: number; licenseExpiry: string|null;
  userCount: number; createdAt: string;
};

function SeatConsumptionPanel({ tenantId, tenantUsers, onLoad, C, Mono }: any) {
  if (tenantUsers.length === 0) {
    return (
      <div style={{ textAlign:"center" as const, padding:"16px 0" }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Load users to see seat consumption</div>
        <button onClick={onLoad} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:6, padding:"5px 14px", fontSize:11, fontWeight:700, color:C.accent, cursor:"pointer", fontFamily:"inherit" }}>◈ Load Users</button>
      </div>
    );
  }
  const ROLE_COLOR: Record<string,string> = {
    super_admin:"#F87171", tenant_admin:"#FBBF24", ciso:"#A78BFA", cro:"#A78BFA",
    security_analyst:C.accent, compliance_analyst:C.accent,
  };
  function fmtLogin(ts: string|null): string {
    if (!ts) return "Never";
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff/3600000);
    if (h < 1) return "< 1h ago";
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h/24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" as const }}>
      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:4 }}>{tenantUsers.length} USERS · EACH CONSUMING 1 SEAT</div>
      {tenantUsers.map((u: any, i: number) => (
        <div key={u.id ?? i} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--input)", borderRadius:7, padding:"7px 10px" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:`${ROLE_COLOR[u.role]??C.muted}20`, border:`1px solid ${ROLE_COLOR[u.role]??C.muted}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:ROLE_COLOR[u.role]??C.muted, flexShrink:0 }}>
            {(u.name||"?").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.name}</div>
            <div style={{ fontSize:10, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.email}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"flex-end", gap:3, flexShrink:0 }}>
            <span style={{ background:`${ROLE_COLOR[u.role]??C.muted}12`, color:ROLE_COLOR[u.role]??C.muted, border:`1px solid ${ROLE_COLOR[u.role]??C.muted}30`, borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700 }}>{u.role}</span>
            <span style={{ fontSize:9, color:C.muted }}>⏱ {fmtLogin(u.lastLogin)}</span>
          </div>
          <span style={{ color:"#34D399", fontSize:11, flexShrink:0, title:"Seat consumed" }}>●</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminPortal() {
  const { user, setToken } = useAuth();
  const [tab, setTab]               = useState("overview");
  const [tenantList, setTenantList] = useState<ApiTenant[]>([]);
  const [selTenant, setSelTenant]   = useState<ApiTenant|null>(null);
  const [selUser, setSelUser]       = useState<(typeof platformUsers)[0]|null>(null);

  // Tenant CRUD state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name:"", slug:"", domain:"", plan:"starter" });
  const [editTenant, setEditTenant] = useState<ApiTenant|null>(null);
  const [editForm, setEditForm]     = useState({ name:"", domain:"", plan:"", status:"active", seats:50, licenseExpiry:"" });
  const [confirmDelete, setConfirmDelete] = useState<ApiTenant|null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [saving, setSaving]         = useState(false);
  const [crudError, setCrudError]   = useState("");

  // ── AI Engines state ──────────────────────────────────────────────────────
  const [aiEngines, setAiEngines]     = useState<any[]>([]);
  const [mcpTokens, setMcpTokens]     = useState<any[]>([]);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiSubTab, setAiSubTab]       = useState("engines");
  const [showAddEng, setShowAddEng]   = useState(false);
  const [addProvider, setAddProvider] = useState("openai");
  const [addEngForm, setAddEngForm]   = useState({ name:"", model:"", apiKey:"", baseUrl:"", isDefault:false });
  const [addEngSaving, setAddEngSaving] = useState(false);
  const [addEngError, setAddEngError]   = useState("");
  const [testingEng, setTestingEng]   = useState<number|null>(null);
  const [testResultEng, setTestResultEng] = useState<Record<number,{ok:boolean;latencyMs:number;error?:string}>>({});
  const [deleteEngId, setDeleteEngId] = useState<number|null>(null);
  const [showMcpCreate, setShowMcpCreate] = useState(false);
  const [mcpForm, setMcpForm]         = useState({ name:"", scopes:["tools"], expiresAt:"" });
  const [newRawToken, setNewRawToken] = useState("");
  const [mcpSaving, setMcpSaving]     = useState(false);
  const [mcpError, setMcpError]       = useState("");

  // ── License state ──────────────────────────────────────────────────────────
  const [tenantLicenses, setTenantLicenses] = useState<Record<number,any>>({});
  const [licSubTab, setLicSubTab]     = useState<"usage"|"pricing"|"manage">("usage");
  const [licEditTenant, setLicEditTenant] = useState<ApiTenant|null>(null);
  const [licForm, setLicForm]         = useState<any>({ plan:"starter", seats:10, modules:{}, frameworkIds:[], expiresAt:"" });
  const [licSaving, setLicSaving]     = useState(false);
  const [licError, setLicError]       = useState("");
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [tenantUsersFor, setTenantUsersFor] = useState<number|null>(null);
  const [drawerLicTab, setDrawerLicTab] = useState<"overview"|"seats">("overview");
  const [frameworkList, setFrameworkList] = useState<{id:number;shortCode:string;name:string}[]>([]);

  async function reloadTenants() {
    let res = await fetch(apiUrl("/tenants"), { headers: H() }).catch(() => null);
    if (res?.status === 403) {
      // JWT role is stale — fetch a fresh token from the DB and retry once
      const ref = await fetch(apiUrl("/auth/refresh"), { headers: H() }).catch(() => null);
      if (ref?.ok) {
        const { token } = await ref.json();
        setToken(token);
      }
    }
    // Re-read token (may have just been refreshed) and retry
    res = await fetch(apiUrl("/tenants"), { headers: H() }).catch(() => null);
    if (res?.ok) {
      const data: ApiTenant[] = await res.json();
      setTenantList(data);
    }
  }

  useEffect(() => { reloadTenants(); }, []);

  const openCreate = useCallback(() => {
    setCreateForm({ name:"", slug:"", domain:"", plan:"starter" });
    setCrudError("");
    setShowCreate(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.slug.trim()) { setCrudError("Name and slug are required."); return; }
    setSaving(true); setCrudError("");
    try {
      const r = await fetch(apiUrl("/tenants"), { method:"POST", headers:H(), body:JSON.stringify(createForm) });
      const data = await r.json();
      if (!r.ok) { setCrudError(data.error ?? "Failed to create tenant"); return; }
      setShowCreate(false);
      reloadTenants();
    } catch { setCrudError("Network error — please retry."); }
    finally { setSaving(false); }
  }, [createForm]);

  const openEdit = useCallback((t: ApiTenant) => {
    setEditForm({ name:t.name, domain:t.domain ?? "", plan:t.plan, status:t.status, seats:t.seats, licenseExpiry:t.licenseExpiry ?? "" });
    setCrudError("");
    setEditTenant(t);
    setSelTenant(null);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!editTenant) return;
    if (!editForm.name.trim()) { setCrudError("Name is required."); return; }
    setSaving(true); setCrudError("");
    try {
      const r = await fetch(apiUrl(`/tenants/${editTenant.id}`), { method:"PATCH", headers:H(), body:JSON.stringify(editForm) });
      const data = await r.json();
      if (!r.ok) { setCrudError(data.error ?? "Failed to update tenant"); return; }
      setTenantList(prev => prev.map(t => t.id === editTenant.id ? { ...t, ...editForm } : t));
      setEditTenant(null);
    } catch { setCrudError("Network error — please retry."); }
    finally { setSaving(false); }
  }, [editTenant, editForm]);

  const openDeleteConfirm = useCallback((t) => {
    setConfirmDelete(t);
    setDeleteConfirmText("");
    setCrudError("");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    if (deleteConfirmText !== confirmDelete.name) { setCrudError("Confirmation text does not match. Please type the tenant name exactly."); return; }
    setSaving(true); setCrudError("");
    try {
      const r = await fetch(apiUrl(`/tenants/${confirmDelete.id}`), { method:"DELETE", headers:H() });
      const data = await r.json();
      if (!r.ok) { setCrudError(data.error ?? "Failed to delete tenant"); return; }
      setConfirmDelete(null);
      setDeleteConfirmText("");
      reloadTenants();
    } catch { setCrudError("Network error — please retry."); }
    finally { setSaving(false); }
  }, [confirmDelete, deleteConfirmText]);

  // ── AI Engines handlers ──────────────────────────────────────────────────
  const loadAI = useCallback(async () => {
    setAiLoading(true);
    const [eRes, tRes] = await Promise.all([
      fetch(apiUrl("/ai-engines"), { headers:H() }).catch(()=>null),
      fetch(apiUrl("/ai-engines/mcp-tokens"), { headers:H() }).catch(()=>null),
    ]);
    if (eRes?.ok) setAiEngines(await eRes.json());
    if (tRes?.ok) setMcpTokens(await tRes.json());
    setAiLoading(false);
  }, []);

  useEffect(() => { loadAI(); }, [loadAI]);

  // ── License load functions ─────────────────────────────────────────────────
  const loadLicenses = useCallback(async () => {
    const tenants: ApiTenant[] = await fetch(apiUrl("/tenants"), { headers:H() }).then(r=>r.ok?r.json():[]).catch(()=>[]);
    const entries = await Promise.all(tenants.map(async (t) => {
      const r = await fetch(apiUrl(`/tenants/${t.id}/license`), { headers:H() }).catch(()=>null);
      if (r?.ok) return [t.id, await r.json()];
      return [t.id, null];
    }));
    setTenantLicenses(Object.fromEntries(entries.filter(([,v])=>v!==null)));
  }, []);

  const loadFrameworks = useCallback(async () => {
    if (frameworkList.length > 0) return;
    const r = await fetch(apiUrl("/admin/frameworks?limit=200"), { headers:H() }).catch(()=>null);
    if (r?.ok) {
      const payload = await r.json();
      const rows = Array.isArray(payload) ? payload : (payload.data ?? payload.items ?? []);
      setFrameworkList(rows.map((f:any)=>({ id:f.id, shortCode:f.shortCode, name:f.name })));
    }
  }, [frameworkList.length]);

  const loadTenantUsers = useCallback(async (tenantId: number) => {
    if (tenantUsersFor === tenantId) return;
    const r = await fetch(apiUrl(`/tenants/${tenantId}/users`), { headers:H() }).catch(()=>null);
    if (r?.ok) { setTenantUsers(await r.json()); setTenantUsersFor(tenantId); }
  }, [tenantUsersFor]);

  const openLicEdit = useCallback((t: ApiTenant) => {
    const lic = tenantLicenses[t.id];
    setLicForm({
      plan: lic?.plan ?? t.plan ?? "starter",
      seats: lic?.seats ?? t.seats ?? 10,
      modules: lic?.modules ?? {},
      frameworkIds: Array.isArray(lic?.frameworkIds) ? lic.frameworkIds : [],
      expiresAt: lic?.expiresAt ?? "",
    });
    setLicError("");
    setLicEditTenant(t);
    loadTenantUsers(t.id);
    loadFrameworks();
  }, [tenantLicenses, loadTenantUsers, loadFrameworks]);

  const handleLicSave = useCallback(async () => {
    if (!licEditTenant) return;
    setLicSaving(true); setLicError("");
    const r = await fetch(apiUrl(`/tenants/${licEditTenant.id}/license`), {
      method:"PUT", headers:H(), body:JSON.stringify(licForm)
    }).catch(()=>null);
    if (!r?.ok) {
      const d = await r?.json().catch(()=>({}));
      setLicError(d?.error ?? "Failed to save license");
      setLicSaving(false); return;
    }
    const updated = await r.json();
    setTenantLicenses(prev=>({...prev,[licEditTenant.id]:updated}));
    setLicSaving(false); setLicEditTenant(null);
    reloadTenants();
  }, [licEditTenant, licForm]);

  const applyPlanDefaults = useCallback(async (tenantId: number, plan: string) => {
    const r = await fetch(apiUrl(`/tenants/${tenantId}/license/apply-plan`), {
      method:"POST", headers:H(), body:JSON.stringify({ plan })
    }).catch(()=>null);
    if (r?.ok) {
      const d = await r.json();
      setTenantLicenses(prev=>({...prev,[tenantId]:{...prev[tenantId],...d}}));
      setLicForm((f: any)=>({...f,modules:d.modules,seats:d.seats,plan:d.plan}));
    }
  }, []);

  useEffect(() => { loadLicenses(); }, [loadLicenses]);

  const MODULE_GROUPS = [
    { label:"Core", icon:"🏠", keys:["govops","riskops","complyops"], alwaysOn:true },
    { label:"Security", icon:"🛡", keys:["secops","cloudops","aisecops"] },
    { label:"Privacy", icon:"🔒", keys:["privacyops","dataops"] },
    { label:"Operations", icon:"⚙", keys:["assetops","serviceops","peopleops"] },
    { label:"Insights", icon:"📊", keys:["analyticsops","aivciso"] },
  ];
  const MODULE_LABEL: Record<string,string> = {
    govops:"GovOps",riskops:"RiskOps",complyops:"ComplyOps",
    secops:"SecOps",cloudops:"CloudOps",aisecops:"AISecOps",
    privacyops:"PrivacyOps",dataops:"DataOps",
    assetops:"AssetOps",serviceops:"ServiceOps",peopleops:"PeopleOps",
    analyticsops:"AnalyticsOps",aivciso:"AI vCISO",
    // Sub-module labels (dot-notation keys)
    ...Object.values(SUBMODULE_MAP).flat().reduce((acc, s) => { acc[s.key] = s.label; return acc; }, {} as Record<string,string>),
  };

  // Toggle all sub-modules for a parent ON or OFF
  const toggleAllSubmodules = (parentKey: string, on: boolean) => {
    const subKeys = getSubmoduleKeys(parentKey);
    setLicForm((f: any) => {
      const mods = { ...f.modules };
      subKeys.forEach(k => { mods[k] = on; });
      return { ...f, modules: mods };
    });
  };

  // Clear all sub-module keys for a parent (restores "full access" / unrestricted)
  const clearSubmodules = (parentKey: string) => {
    const subKeys = getSubmoduleKeys(parentKey);
    setLicForm((f: any) => {
      const mods = { ...f.modules };
      subKeys.forEach(k => { delete mods[k]; });
      return { ...f, modules: mods };
    });
  };

  // Check if any sub-module key is set for a parent
  const hasSubRestrictions = (parentKey: string) => {
    const subKeys = getSubmoduleKeys(parentKey);
    return subKeys.some(k => k in (licForm.modules ?? {}));
  };
  const PRICING_TIERS = [
    { plan:"starter",  label:"Starter",    price:"$149",  seats:10,  fwSlots:3,   color:"#64748B", features:["Core GRC (GovOps, RiskOps, ComplyOps)","ServiceOps module","10 provisioned seats","3 framework slots","Community support"] },
    { plan:"pro",      label:"Pro",        price:"$499",  seats:25,  fwSlots:15,  color:C.accent,  features:["All Starter features","SecOps + CloudOps","PrivacyOps + DataOps","AssetOps + PeopleOps","25 provisioned seats","15 framework slots","Priority support"] },
    { plan:"enterprise",label:"Enterprise",price:"$1,299",seats:50,  fwSlots:-1,  color:C.purple,  features:["All Pro modules","AnalyticsOps + AI vCISO","50+ provisioned seats","Unlimited framework slots","24/7 dedicated CSM","Custom SSO + SLA 99.99%"] },
  ];

  const aiProvMeta = (id: string) => AI_PROVIDERS.find(p => p.id === id) ?? AI_PROVIDERS[AI_PROVIDERS.length-1];

  const openAddEng = (providerId: string) => {
    const p = aiProvMeta(providerId);
    setAddProvider(providerId);
    setAddEngForm({ name:p.name, model:p.models[0]??"", apiKey:"", baseUrl:p.defaultBase, isDefault:aiEngines.length===0 });
    setAddEngError("");
    setShowAddEng(true);
  };

  const handleAddEng = async () => {
    if (!addEngForm.apiKey.trim()) { setAddEngError("API key is required."); return; }
    setAddEngSaving(true); setAddEngError("");
    const r = await fetch(apiUrl("/ai-engines"), { method:"POST", headers:H(), body:JSON.stringify({ ...addEngForm, provider:addProvider }) });
    const data = await r.json();
    if (!r.ok) { setAddEngError(data.error ?? "Failed to save"); setAddEngSaving(false); return; }
    setShowAddEng(false); setAddEngSaving(false); loadAI();
  };

  const handleTestEng = async (id: number) => {
    setTestingEng(id);
    const r = await fetch(apiUrl(`/ai-engines/${id}/test`), { method:"POST", headers:H() });
    if (r.ok) { const d = await r.json(); setTestResultEng(prev=>({...prev,[id]:d})); }
    setTestingEng(null);
  };

  const handleSetDefaultEng = async (id: number) => {
    await fetch(apiUrl(`/ai-engines/${id}`), { method:"PATCH", headers:H(), body:JSON.stringify({ isDefault:true }) });
    loadAI();
  };

  const handleDeleteEng = async (id: number) => {
    await fetch(apiUrl(`/ai-engines/${id}`), { method:"DELETE", headers:H() });
    setDeleteEngId(null); loadAI();
  };

  const mcpServerUrl = (() => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    return `${window.location.origin}${base.replace("/grc-platform","")}/api/mcp`;
  })();

  const handleMcpCreate = async () => {
    if (!mcpForm.name.trim()) { setMcpError("Token name is required."); return; }
    setMcpSaving(true); setMcpError("");
    const r = await fetch(apiUrl("/ai-engines/mcp-tokens"), { method:"POST", headers:H(), body:JSON.stringify(mcpForm) });
    const data = await r.json();
    if (!r.ok) { setMcpError(data.error ?? "Failed to create"); setMcpSaving(false); return; }
    setNewRawToken(data.rawToken);
    setMcpSaving(false); setMcpError(""); loadAI();
  };

  const handleRevokeMcp = async (id: number) => {
    await fetch(apiUrl(`/ai-engines/mcp-tokens/${id}`), { method:"DELETE", headers:H() });
    loadAI();
  };

  if (user?.role !== "super_admin") {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:16 }}>
        <div style={{ fontSize:48, opacity:0.3 }}>◈</div>
        <h2 style={{ fontSize:18, fontWeight:700, color:C.accent, margin:0 }}>Super Admin Access Required</h2>
        <p style={{ fontSize:13, color:C.muted, margin:0 }}>This portal requires the <strong>super_admin</strong> role.</p>
      </div>
    );
  }

  const activeTenants  = tenantList.filter(t=>t.status==="active").length;
  const totalUsers     = tenantList.reduce((s,t)=>s+Number(t.userCount||0),0);
  const totalMRR       = licenses.reduce((s,l)=>s+parseInt(l.mrr.replace(/[$,]/g,"")||"0"),0);
  const seatUtil       = Math.round((licenses.reduce((s,l)=>s+l.used,0)/licenses.reduce((s,l)=>s+l.seats,0))*100);
  const noMFA          = platformUsers.filter(u=>!u.mfa).length;
  const degradedSvc    = perf.filter(p=>p.status==="warning").length;

  const tabs = [
    { key:"overview",     label:"Overview" },
    { key:"tenants",      label:"Tenants",      count:tenantList.length },
    { key:"users",        label:"Users",         count:platformUsers.length },
    { key:"roles",        label:"Roles",         count:roles.length },
    { key:"licenses",     label:"Licenses",      count:licenses.length },
    { key:"frameworks",   label:"Frameworks",    dot:"#34D399" },
    { key:"ai-engines",   label:"AI Engines",    count:aiEngines.length||undefined },
    { key:"performance",  label:"Performance",   dot:degradedSvc>0?"#FBBF24":undefined },
    { key:"dependencies", label:"Dependencies",  count:deps.filter(d=>d.status==="outdated").length, dot:"#FBBF24" },
    { key:"auditlog",     label:"Audit Log",     count:auditLog.length },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <ModuleHeader
        title="Super Admin Portal — Platform Administration"
        description="Tenants · Users · Roles · Licenses · AI Engines · Performance · Audit Log"
        badge={{ label:"SUPER ADMIN", color:"#F87171", bg:"rgba(239,68,68,0.06)" }}
        action={{ label:"+ New Tenant", onClick:openCreate }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />

      {/* ── Create Tenant Modal ── */}
      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--input)", border:"1px solid rgba(99,179,237,0.3)", borderRadius:16, padding:"28px 32px", width:460, display:"flex", flexDirection:"column", gap:16, boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>Create New Tenant</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label style={LBL}>Tenant Name *</label><input style={INP} value={createForm.name} onChange={e=>setCreateForm(f=>({...f, name:e.target.value}))} placeholder="Acme Corporation" /></div>
              <div><label style={LBL}>Slug * (unique, lowercase)</label><input style={INP} value={createForm.slug} onChange={e=>setCreateForm(f=>({...f, slug:e.target.value.toLowerCase().replace(/\s+/g,"-")}))} placeholder="acme" /></div>
              <div><label style={LBL}>Domain</label><input style={INP} value={createForm.domain} onChange={e=>setCreateForm(f=>({...f, domain:e.target.value}))} placeholder="acme.com" /></div>
              <div><label style={LBL}>Plan</label>
                <select style={INP} value={createForm.plan} onChange={e=>setCreateForm(f=>({...f, plan:e.target.value}))}>
                  {PLANS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            {crudError && <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 12px", fontSize:11, color:C.danger }}>{crudError}</div>}
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={handleCreate} disabled={saving} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:"linear-gradient(135deg,rgb(147,197,253),#34D399)", color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.6:1 }}>{saving?"Creating…":"Create Tenant"}</button>
              <button onClick={()=>{setShowCreate(false);setCrudError("");}} style={{ padding:"10px 18px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"rgb(148,163,184)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Tenant Modal ── */}
      {editTenant && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--input)", border:"1px solid rgba(251,191,36,0.3)", borderRadius:16, padding:"28px 32px", width:500, display:"flex", flexDirection:"column", gap:16, boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>Edit Tenant — <span style={{ color:C.accent }}>{editTenant.name}</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ gridColumn:"1 / -1" }}><label style={LBL}>Tenant Name *</label><input style={INP} value={editForm.name} onChange={e=>setEditForm(f=>({...f, name:e.target.value}))} /></div>
              <div style={{ gridColumn:"1 / -1" }}><label style={LBL}>Domain</label><input style={INP} value={editForm.domain} onChange={e=>setEditForm(f=>({...f, domain:e.target.value}))} placeholder="acme.com" /></div>
              <div><label style={LBL}>Plan</label>
                <select style={INP} value={editForm.plan} onChange={e=>setEditForm(f=>({...f, plan:e.target.value}))}>
                  {PLANS.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Status</label>
                <select style={INP} value={editForm.status} onChange={e=>setEditForm(f=>({...f, status:e.target.value}))}>
                  {["active","suspended","trial","cancelled"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Licensed Seats</label><input style={INP} type="number" min={1} value={editForm.seats} onChange={e=>setEditForm(f=>({...f, seats:Number(e.target.value)}))} /></div>
              <div><label style={LBL}>License Expiry</label><input style={INP} type="date" value={editForm.licenseExpiry} onChange={e=>setEditForm(f=>({...f, licenseExpiry:e.target.value}))} /></div>
            </div>
            {crudError && <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 12px", fontSize:11, color:C.danger }}>{crudError}</div>}
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={handleEdit} disabled={saving} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#FBBF24,#F59E0B)", color:"rgb(15,23,42)", fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.6:1 }}>{saving?"Saving…":"Save Changes"}</button>
              <button onClick={()=>{setEditTenant(null);setCrudError("");}} style={{ padding:"10px 18px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"rgb(148,163,184)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--input)", border:"1px solid rgba(239,68,68,0.45)", borderRadius:16, padding:"28px 32px", width:460, display:"flex", flexDirection:"column", gap:16, boxShadow:"0 24px 80px rgba(0,0,0,0.9)" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚠</div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:C.danger }}>Delete Tenant</div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>This action is permanent and cannot be undone</div>
              </div>
            </div>
            {/* Warning text */}
            <div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.7 }}>
              You are about to permanently delete <strong style={{ color:"#fff" }}>{confirmDelete.name}</strong>. All tenant data, users, and configurations will be destroyed.
            </div>
            {/* Note about users */}
            <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"10px 12px", fontSize:11, color:"var(--foreground)", display:"flex", gap:8, alignItems:"flex-start" }}>
              <span style={{ color:"#FBBF24", flexShrink:0 }}>⚠</span>
              <span>Deletion will fail if the tenant has active users. Remove all users from this tenant first.</span>
            </div>
            {/* Typed confirmation */}
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"rgba(148,163,184,0.8)" }}>
                To confirm, type <span style={{ color:"#fff", fontFamily:"'JetBrains Mono',monospace", background:"var(--border)", padding:"1px 6px", borderRadius:4 }}>{confirmDelete.name}</span> below:
              </label>
              <input
                autoFocus
                value={deleteConfirmText}
                onChange={e => { setDeleteConfirmText(e.target.value); setCrudError(""); }}
                onKeyDown={e => { if (e.key === "Enter" && deleteConfirmText === confirmDelete.name) handleDelete(); }}
                placeholder={`Type "${confirmDelete.name}" to confirm`}
                style={{ padding:"9px 12px", borderRadius:8, border:`1px solid ${deleteConfirmText === confirmDelete.name ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.12)"}`, background:"var(--card)", color:"var(--foreground)", fontSize:13, fontFamily:"inherit", outline:"none", transition:"border-color 0.2s" }}
              />
              {deleteConfirmText.length > 0 && deleteConfirmText !== confirmDelete.name && (
                <div style={{ fontSize:11, color:"rgba(239,68,68,0.8)" }}>Name does not match — type exactly as shown above</div>
              )}
            </div>
            {crudError && <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"8px 12px", fontSize:11, color:C.danger }}>{crudError}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={handleDelete}
                disabled={saving || deleteConfirmText !== confirmDelete.name}
                style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background: deleteConfirmText === confirmDelete.name ? "rgba(239,68,68,0.85)" : "rgba(239,68,68,0.25)", color: deleteConfirmText === confirmDelete.name ? "#fff" : "rgba(255,255,255,0.35)", fontWeight:800, fontSize:12, cursor: deleteConfirmText === confirmDelete.name ? "pointer" : "not-allowed", fontFamily:"inherit", transition:"all 0.2s" }}
              >
                {saving ? "Deleting…" : "Delete Permanently"}
              </button>
              <button onClick={()=>{setConfirmDelete(null);setDeleteConfirmText("");setCrudError("");}} style={{ padding:"11px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"rgb(148,163,184)", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Drawer */}
      {selTenant && (
        <Drawer open title={`${selTenant.name}`} subtitle={`${selTenant.plan} · ${selTenant.domain ?? "—"}`}
          onClose={()=>setSelTenant(null)}
          headerColor={selTenant.plan==="enterprise"?"#4C1D95":selTenant.plan==="pro"?"#1E3A5F":"#065F46"}>
          <DrawerSection title="Tenant Profile" />
          <Field label="Tenant ID"       value={String(selTenant.id)} mono />
          <Field label="Slug"            value={selTenant.slug} mono />
          <Field label="Domain"          value={selTenant.domain ?? "—"} />
          <Field label="Plan"            value={selTenant.plan} />
          <Field label="Status"          value={selTenant.status} />
          <Field label="Created"         value={selTenant.createdAt?.slice(0,10) ?? "—"} />
          <DrawerSection title="License & Seats" />
          {(() => {
            const lic = tenantLicenses[selTenant.id];
            const used = lic?.seatsUsed ?? Number(selTenant.userCount);
            const seats = lic?.seats ?? selTenant.seats;
            const util = seats > 0 ? Math.round((used/seats)*100) : 0;
            const mods = lic?.modules ? Object.entries(lic.modules as Record<string,boolean>) : [];
            const onMods = mods.filter(([,v])=>v);
            const planColor = lic?.plan==="enterprise"?"#A78BFA":lic?.plan==="pro"?C.accent:C.muted;
            return (
              <>
                <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                  {(["overview","seats"] as const).map(k=>(
                    <button key={k} onClick={()=>setDrawerLicTab(k)} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${drawerLicTab===k?C.accent:C.border}`, background:drawerLicTab===k?"rgba(147,197,253,0.10)":C.bg3, color:drawerLicTab===k?C.accent:C.muted, fontWeight:700, fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>{k==="overview"?"Overview":"Seat Consumption"}</button>
                  ))}
                </div>
                {drawerLicTab==="overview" && (
                  <>
                    <Field label="Plan" value={<span style={{ color:planColor, fontWeight:700, textTransform:"capitalize" as const }}>{lic?.plan ?? selTenant.plan}</span>} />
                    <Field label="Licensed Seats" value={String(seats)} />
                    <Field label="Seats Used" value={`${used} / ${seats} (${util}%)`} />
                    <Field label="Expiry" value={lic?.expiresAt ?? "—"} />
                    <div style={{ marginTop:8, marginBottom:4 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:6 }}>ACTIVE MODULES ({onMods.length}/20)</div>
                      {onMods.length === 0 && <div style={{ fontSize:11, color:C.muted }}>No modules licensed yet</div>}
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4 }}>
                        {onMods.map(([key])=>(
                          <span key={key} style={{ background:"rgba(52,211,153,0.08)", color:C.green, border:"1px solid rgba(52,211,153,0.25)", borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:600 }}>{MODULE_LABEL[key]??key}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ height:5, background:C.bg2, borderRadius:3, marginTop:8 }}>
                      <div style={{ height:"100%", width:`${Math.min(util,100)}%`, background:util>90?C.danger:util>70?C.warn:C.green, borderRadius:3, transition:"width 0.4s" }} />
                    </div>
                  </>
                )}
                {drawerLicTab==="seats" && (
                  <SeatConsumptionPanel tenantId={selTenant.id} tenantUsers={tenantUsersFor===selTenant.id?tenantUsers:[]} onLoad={()=>loadTenantUsers(selTenant.id)} C={C} Mono={Mono} />
                )}
              </>
            );
          })()}
          <DrawerSection title="Actions" />
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={()=>{openLicEdit(selTenant);setSelTenant(null);}} style={{ background:"rgba(99,179,237,0.08)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, color:C.accent, cursor:"pointer", fontFamily:"inherit" }}>◈ License</button>
            <button onClick={()=>openEdit(selTenant)} style={{ background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, color:C.warn, cursor:"pointer", fontFamily:"inherit" }}>✎ Edit</button>
            <button onClick={()=>{openDeleteConfirm(selTenant);setSelTenant(null);}} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, color:C.danger, cursor:"pointer", fontFamily:"inherit" }}>✕ Delete</button>
          </div>
        </Drawer>
      )}

      {/* User Drawer */}
      {selUser && (
        <Drawer open title={selUser.name} subtitle={`${selUser.role} · ${selUser.tenant}`}
          onClose={()=>setSelUser(null)}
          headerColor={selUser.role==="super_admin"?"#991B1B":selUser.role.includes("admin")?"#92400E":"#1E3A5F"}>
          <DrawerSection title="User Profile" />
          <Field label="User ID"   value={String(selUser.id)} mono />
          <Field label="Email"     value={selUser.email} mono />
          <Field label="Role"      value={selUser.role} />
          <Field label="Tenant"    value={selUser.tenant} />
          <Field label="Status"    value={selUser.status} />
          <Field label="MFA"       value={selUser.mfa?"Enrolled":"Not enrolled"} />
          <Field label="Last Login" value={selUser.lastLogin} />
          {!selUser.mfa && (
            <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, padding:"9px 12px", fontSize:11, color:C.danger, marginTop:6 }}>
              ⚠ MFA not enrolled — security policy violation. Enforcement deadline: 7 days.
            </div>
          )}
          <AiInsightBox insights={selUser.aiInsights} />
        </Drawer>
      )}

      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {tab==="overview" && (
          <>
            {/* AI Platform Intelligence */}
            <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.10),rgba(59,130,246,0.08))", border:"1px solid rgba(167,139,250,0.28)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13 }}>◆</span>
                <span style={{ fontSize:11, fontWeight:800, color:C.purple, letterSpacing:"0.4px", textTransform:"uppercase" }}>AI Platform Intelligence</span>
                <span style={{ background:"rgba(167,139,250,0.18)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, padding:"1px 8px", fontSize:9, fontWeight:700, marginLeft:"auto" }}>Live Analysis</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { icon:"◈", color:C.accent, text:`${activeTenants} active tenants, ${totalUsers} users. Seat utilisation: ${seatUtil}% — 2 tenants above 90%.` },
                  { icon:"⚠", color:C.warn,   text:`${noMFA} platform users without MFA. Privileged role users (super_admin, tenant_admin) must enrol — enforcement email sent.` },
                  { icon:"◎", color:C.danger, text:`${degradedSvc} platform services degraded (Event Bus, Notification Svc). P95 latency trend: +12% over 7 days.` },
                  { icon:"◆", color:C.purple, text:`Monthly recurring revenue: $${totalMRR.toLocaleString()}. Soylent Corp suspended ($499 MRR at risk). Enterprise tier: 60% of MRR.` },
                ].map((ins,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px" }}>
                    <span style={{ color:ins.color, fontSize:13, flexShrink:0, marginTop:1 }}>{ins.icon}</span>
                    <span style={{ fontSize:11, color:C.text, lineHeight:1.5 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:12 }}>
              {[
                { label:"Active Tenants",  value:activeTenants,     color:C.accent,  border:"#BFDBFE" },
                { label:"Total Users",     value:totalUsers,        color:C.text,    border:C.border  },
                { label:"MRR",             value:`$${totalMRR.toLocaleString()}`, color:"#A78BFA", border:"#DDD6FE" },
                { label:"Seat Util",       value:`${seatUtil}%`,    color:seatUtil>90?C.warn:C.green, border:seatUtil>90?"rgba(251,191,36,0.3)":"rgba(52,211,153,0.3)" },
                { label:"Without MFA",     value:noMFA,             color:noMFA>0?C.warn:C.green, border:noMFA>0?"rgba(251,191,36,0.3)":"rgba(52,211,153,0.3)" },
              ].map(k=>(
                <div key={k.label} style={{ ...card, borderColor:k.border, position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, opacity:0.6, borderRadius:"12px 12px 0 0" }} />
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:6 }}>{k.label}</div>
                  <div style={{ fontSize:26, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Tenant overview grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
              {tenantList.map(t=>{
                const util = t.seats > 0 ? Math.round((Number(t.userCount)/t.seats)*100) : 0;
                return (
                  <div key={t.id} onClick={()=>setSelTenant(t)} style={{ ...card, cursor:"pointer", transition:"border-color 0.15s" }}
                    onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor="rgba(99,179,237,0.35)"}
                    onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=C.border}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{t.name}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{t.domain ?? t.slug}</div>
                      </div>
                      <Badge label={t.status} />
                    </div>
                    <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                      <span style={{ background:t.plan==="enterprise"?"rgba(124,58,237,0.12)":t.plan==="pro"?"rgba(99,179,237,0.10)":"var(--secondary)", color:t.plan==="enterprise"?"#A78BFA":t.plan==="pro"?C.accent:C.muted, borderRadius:5, padding:"2px 8px", fontSize:9, fontWeight:700, border:`1px solid ${t.plan==="enterprise"?"rgba(167,139,250,0.3)":t.plan==="pro"?"rgba(99,179,237,0.25)":C.border}` }}>{t.plan}</span>
                      <span style={{ fontSize:10, color:C.muted }}>{t.userCount} users · {t.seats} seats</span>
                    </div>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.muted, marginBottom:3 }}>
                        <span>Seat utilisation</span>
                        <span style={{ color:util>90?C.warn:C.green, fontWeight:700 }}>{util}%</span>
                      </div>
                      <div style={{ height:4, background:C.bg2, borderRadius:3 }}>
                        <div style={{ height:"100%", width:`${Math.min(util,100)}%`, background:util>90?C.warn:C.green, borderRadius:3 }} />
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:8 }}>Created: <strong style={{ color:C.text }}>{t.createdAt?.slice(0,10)??"-"}</strong>{t.licenseExpiry && <> · Expires: <strong style={{ color:util>90?C.warn:C.text }}>{t.licenseExpiry}</strong></>}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── TENANTS ──────────────────────────────────────────────────── */}
        {tab==="tenants" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
              {[
                { label:"Total Tenants", value:tenantList.length,     color:C.accent,  border:"#BFDBFE" },
                { label:"Active",        value:activeTenants,      color:C.green,   border:"rgba(52,211,153,0.3)" },
                { label:"Total Users",   value:totalUsers,         color:C.text,    border:C.border },
                { label:"Enterprise",    value:tenantList.filter(t=>t.plan==="enterprise").length, color:"#A78BFA", border:"rgba(167,139,250,0.3)" },
              ].map(k=>(
                <div key={k.label} style={{ ...card, borderColor:k.border, position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, opacity:0.7, borderRadius:"12px 12px 0 0" }} />
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:6 }}>{k.label}</div>
                  <div style={{ fontSize:26, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <TableShell
              onRowClick={i=>setSelTenant(tenantList[i])}
              cols={["ID","Tenant","Slug","Plan","Users / Seats","Status","License Expiry","Created","Actions"]}
              rows={tenantList.map(t=>{
                const util = t.seats > 0 ? Math.round((Number(t.userCount)/t.seats)*100) : 0;
                return [
                  <Mono>{t.id}</Mono>,
                  <div><div style={{ fontWeight:700, color:C.accent }}>{t.name}</div><div style={{ fontSize:10, color:C.muted }}>{t.domain ?? "—"}</div></div>,
                  <Mono>{t.slug}</Mono>,
                  <span style={{ background:t.plan==="enterprise"?"rgba(124,58,237,0.12)":t.plan==="pro"?"rgba(99,179,237,0.10)":"var(--secondary)", color:t.plan==="enterprise"?"#A78BFA":t.plan==="pro"?C.accent:C.muted, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, border:`1px solid ${t.plan==="enterprise"?"rgba(167,139,250,0.3)":t.plan==="pro"?"rgba(99,179,237,0.25)":C.border}`, textTransform:"capitalize" as const }}>{t.plan}</span>,
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:48, height:4, background:"var(--border)", borderRadius:3 }}>
                      <div style={{ height:"100%", width:`${Math.min(util,100)}%`, background:util>90?C.danger:util>70?C.warn:C.green, borderRadius:3 }} />
                    </div>
                    <Mono style={{ fontSize:10 }}>{t.userCount}/{t.seats}</Mono>
                  </div>,
                  <Badge label={t.status} />,
                  <Mono style={{ fontSize:10 }}>{t.licenseExpiry ?? "—"}</Mono>,
                  <Mono style={{ fontSize:10 }}>{t.createdAt?.slice(0,10) ?? "—"}</Mono>,
                  <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>openEdit(t)} style={{ padding:"3px 10px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderRadius:5, border:`1px solid rgba(251,191,36,0.4)`, background:"rgba(251,191,36,0.08)", color:C.warn }}>✎ Edit</button>
                    <button onClick={()=>openDeleteConfirm(t)} style={{ padding:"3px 10px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderRadius:5, border:`1px solid rgba(239,68,68,0.35)`, background:"rgba(239,68,68,0.07)", color:C.danger }}>✕</button>
                  </div>,
                ];
              })}
            />
          </>
        )}

        {/* ── USERS ────────────────────────────────────────────────────── */}
        {tab==="users" && (
          <TableShell
            onRowClick={i=>setSelUser(platformUsers[i])}
            cols={["ID","Name","Email","Role","Tenant","MFA","Last Login","Status"]}
            rows={platformUsers.map(u=>[
              <Mono>{u.id}</Mono>,
              <span style={{ fontWeight:700, color:C.accent }}>{u.name}</span>,
              <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:11, color:C.muted }}>{u.email}</span>,
              <span style={{ background:u.role==="super_admin"?"rgba(239,68,68,0.08)":u.role.includes("admin")?"rgba(251,191,36,0.08)":"var(--secondary)", color:u.role==="super_admin"?C.danger:u.role.includes("admin")?C.warn:C.muted, border:`1px solid ${u.role==="super_admin"?"rgba(239,68,68,0.3)":u.role.includes("admin")?"rgba(251,191,36,0.3)":C.border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{u.role}</span>,
              <span style={{ fontSize:11, color:C.text }}>{u.tenant}</span>,
              u.mfa?<span style={{ color:C.green, fontWeight:700, fontSize:11 }}>✓ MFA</span>:<span style={{ color:C.danger, fontWeight:700, fontSize:11 }}>✗ No MFA</span>,
              <span style={{ fontSize:11, color:C.muted }}>{u.lastLogin}</span>,
              <Badge label={u.status} />,
            ])}
          />
        )}

        {/* ── ROLES ────────────────────────────────────────────────────── */}
        {tab==="roles" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {roles.map(r=>(
              <div key={r.role} style={{ ...card, display:"flex", alignItems:"center", gap:20 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>{r.label}</span>
                    <Mono>{r.role}</Mono>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                    {r.permissions.map(p=><span key={p} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:600, color:C.muted }}>{p}</span>)}
                  </div>
                </div>
                <div style={{ flexShrink:0, textAlign:"center" as const }}>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:C.accent }}>{r.users}</div>
                  <div style={{ fontSize:10, color:C.muted }}>users</div>
                </div>
                <div style={{ flexShrink:0 }}>
                  <SevBadge label={r.risk} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LICENSES ─────────────────────────────────────────────────── */}
        {tab==="licenses" && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* Sub-nav */}
            <div style={{ display:"flex", gap:6 }}>
              {([["usage","Usage Dashboard"],["pricing","Pricing Tiers"],["manage","Module Manager"]] as const).map(([k,l])=>(
                <button key={k} onClick={()=>setLicSubTab(k)} style={{ padding:"6px 16px", borderRadius:7, border:`1px solid ${licSubTab===k?C.accent:C.border}`, background:licSubTab===k?"rgba(147,197,253,0.10)":C.bg3, color:licSubTab===k?C.accent:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
              ))}
            </div>

            {/* ── Usage Dashboard ── */}
            {licSubTab==="usage" && (
              <>
                {/* KPI row */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[
                    { label:"Active Licenses",  value:Object.keys(tenantLicenses).length,         color:C.accent, border:"#BFDBFE" },
                    { label:"Enterprise",         value:Object.values(tenantLicenses).filter((l:any)=>l.plan==="enterprise").length, color:C.purple, border:"rgba(167,139,250,0.3)" },
                    { label:"Total Seats",        value:Object.values(tenantLicenses).reduce((s:number,l:any)=>s+(l.seats||0),0), color:C.text,  border:C.border },
                    { label:"Seats Provisioned",   value:Object.values(tenantLicenses).reduce((s:number,l:any)=>s+(l.seatsUsed||0),0), color:C.green, border:"rgba(52,211,153,0.3)" },
                  ].map(k=>(
                    <div key={k.label} style={{ ...card, borderColor:k.border, position:"relative", overflow:"hidden" }}>
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:k.color, opacity:0.6, borderRadius:"12px 12px 0 0" }} />
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:6 }}>{k.label}</div>
                      <div style={{ fontSize:26, fontWeight:800, fontFamily:"'JetBrains Mono', monospace", color:k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {/* Live license table */}
                <TableShell
                  cols={["Tenant","Plan","Seats","Utilisation","Modules","Frameworks","Expires","Actions"]}
                  rows={tenantList.map(t=>{
                    const lic = tenantLicenses[t.id];
                    const used = lic?.seatsUsed ?? 0;
                    const seats = lic?.seats ?? t.seats ?? 0;
                    const util = seats > 0 ? Math.round((used/seats)*100) : 0;
                    const mods = lic?.modules ? Object.values(lic.modules).filter(Boolean).length : 0;
                    const fwCount = Array.isArray(lic?.frameworkIds) ? lic.frameworkIds.length : 0;
                    const planColor = lic?.plan==="enterprise"?"#A78BFA":lic?.plan==="pro"?C.accent:C.muted;
                    const planBg = lic?.plan==="enterprise"?"rgba(124,58,237,0.12)":lic?.plan==="pro"?"rgba(99,179,237,0.10)":"var(--secondary)";
                    const planBorder = lic?.plan==="enterprise"?"rgba(167,139,250,0.3)":lic?.plan==="pro"?"rgba(99,179,237,0.25)":C.border;
                    return [
                      <div><div style={{ fontWeight:700, color:C.accent }}>{t.name}</div><div style={{ fontSize:10, color:C.muted }}>{t.domain??t.slug}</div></div>,
                      <span style={{ background:planBg, color:planColor, border:`1px solid ${planBorder}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, textTransform:"capitalize" as const }}>{lic?.plan??t.plan}</span>,
                      <Mono>{used}/{seats}</Mono>,
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <div style={{ width:56, height:5, background:C.bg2, borderRadius:3 }}><div style={{ height:"100%", width:`${Math.min(util,100)}%`, background:util>90?C.danger:util>70?C.warn:C.green, borderRadius:3 }} /></div>
                        <span style={{ fontSize:10, fontWeight:700, color:util>90?C.danger:util>70?C.warn:C.green }}>{util}%</span>
                      </div>,
                      <span style={{ fontSize:11, color:C.muted }}>{mods}/20</span>,
                      <span style={{ fontSize:11, color:fwCount===0?C.green:C.accent }}>{fwCount===0?"All":""+fwCount+" locked"}</span>,
                      <Mono style={{ fontSize:10 }}>{lic?.expiresAt ?? "—"}</Mono>,
                      <div style={{ display:"flex", gap:5 }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openLicEdit(t)} style={{ ...BTN(C.accent,"rgba(147,197,253,0.08)","rgba(147,197,253,0.25)"), padding:"3px 10px", fontSize:10 }}>✎ Edit</button>
                      </div>,
                    ];
                  })}
                />
              </>
            )}

            {/* ── Pricing Tiers ── */}
            {licSubTab==="pricing" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.08),rgba(59,130,246,0.06))", border:"1px solid rgba(167,139,250,0.2)", borderRadius:12, padding:"14px 18px" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:C.purple, letterSpacing:"0.4px", textTransform:"uppercase" as const, marginBottom:4 }}>◆ AIGO-X GRC Pricing Plans</div>
                  <div style={{ fontSize:12, color:C.muted }}>Configure the right plan for each tenant. Click a plan card to apply it to a tenant.</div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
                  {PRICING_TIERS.map(tier=>(
                    <div key={tier.plan} style={{ ...card, borderColor:tier.plan==="enterprise"?"rgba(167,139,250,0.35)":tier.plan==="pro"?"rgba(99,179,237,0.3)":C.border, position:"relative", overflow:"hidden" }}>
                      {tier.plan==="enterprise" && <div style={{ position:"absolute", top:12, right:14, background:"rgba(167,139,250,0.18)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:8, padding:"2px 9px", fontSize:9, fontWeight:800 }}>RECOMMENDED</div>}
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:tier.color, borderRadius:"12px 12px 0 0" }} />
                      <div style={{ marginTop:4, marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:tier.color, marginBottom:4, textTransform:"capitalize" as const }}>{tier.label}</div>
                        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                          <span style={{ fontSize:28, fontWeight:900, color:C.text, fontFamily:"'JetBrains Mono', monospace" }}>{tier.price}</span>
                          <span style={{ fontSize:11, color:C.muted }}>/month</span>
                        </div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Up to {tier.seats} seats · {tier.fwSlots===-1?"Unlimited":tier.fwSlots} framework slots</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
                        {tier.features.map(f=>(
                          <div key={f} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.text }}>
                            <span style={{ color:tier.color, flexShrink:0 }}>✓</span>{f}
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:8 }}>Tenants on this plan</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          {tenantList.filter(t=>(tenantLicenses[t.id]?.plan??t.plan)===tier.plan).map(t=>(
                            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg2, borderRadius:6, padding:"5px 10px" }}>
                              <span style={{ fontSize:11, color:C.text, fontWeight:600 }}>{t.name}</span>
                              <button onClick={()=>openLicEdit(t)} style={{ ...BTN(tier.color,`${tier.color}10`,`${tier.color}35`), padding:"2px 8px", fontSize:10 }}>Manage</button>
                            </div>
                          ))}
                          {tenantList.filter(t=>(tenantLicenses[t.id]?.plan??t.plan)===tier.plan).length===0 && (
                            <div style={{ fontSize:11, color:C.muted, padding:"6px 0" }}>No tenants on this plan</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Module Manager ── */}
            {licSubTab==="manage" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {tenantList.map(t=>{
                  const lic = tenantLicenses[t.id];
                  const mods = (lic?.modules ?? {}) as Record<string,boolean>;
                  const on = Object.values(mods).filter(Boolean).length;
                  const planColor = lic?.plan==="enterprise"?"#A78BFA":lic?.plan==="pro"?C.accent:C.muted;
                  return (
                    <div key={t.id} style={{ ...card }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{t.name}</div>
                          <div style={{ fontSize:10, color:C.muted }}>{t.domain??t.slug} · <span style={{ color:planColor, fontWeight:700, textTransform:"capitalize" as const }}>{lic?.plan??t.plan}</span></div>
                        </div>
                        <span style={{ fontSize:11, color:C.muted }}>{on}/20 modules on</span>
                        <button onClick={()=>openLicEdit(t)} style={BTN(C.accent,"rgba(147,197,253,0.08)","rgba(147,197,253,0.25)")}>✎ Configure</button>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5 }}>
                        {Object.entries(mods).map(([key,enabled])=>(
                          <span key={key} style={{ background:enabled?"rgba(52,211,153,0.08)":"var(--secondary)", color:enabled?C.green:C.muted, border:`1px solid ${enabled?"rgba(52,211,153,0.25)":C.border}`, borderRadius:5, padding:"2px 9px", fontSize:10, fontWeight:600 }}>
                            {MODULE_LABEL[key]??key}
                          </span>
                        ))}
                        {Object.keys(mods).length===0 && <span style={{ fontSize:11, color:C.muted }}>No license configured — click Configure to set up</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FRAMEWORK LIBRARY ────────────────────────────────────────── */}
        {tab==="frameworks" && <FrameworkLibrary />}

        {/* ── AI ENGINES ───────────────────────────────────────────────── */}
        {tab==="ai-engines" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Sub-tabs */}
            <div style={{ display:"flex", gap:6 }}>
              {[{key:"engines",label:"AI Engines"},{key:"mcp",label:"MCP Server"}].map(t=>(
                <button key={t.key} onClick={()=>setAiSubTab(t.key)} style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${aiSubTab===t.key?"rgba(167,139,250,0.4)":C.border}`, background:aiSubTab===t.key?"rgba(167,139,250,0.12)":C.bg3, color:aiSubTab===t.key?C.purple:C.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{t.label}</button>
              ))}
            </div>

            {aiSubTab==="engines" && (
              <>
                {/* Stats */}
                {aiEngines.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                    {[
                      { label:"Configured",     value:aiEngines.length,                                        color:C.accent },
                      { label:"Active",         value:aiEngines.filter(e=>e.isActive).length,                  color:C.green },
                      { label:"Tested OK",      value:aiEngines.filter(e=>e.lastTestOk).length,                color:C.green },
                      { label:"Default Engine", value:aiEngines.find(e=>e.isDefault)?.name??"None",            color:C.purple },
                    ].map(k=>(
                      <div key={k.label} style={{ ...card, padding:"12px 16px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:4 }}>{k.label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:k.color, fontFamily:"'JetBrains Mono', monospace" }}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Configured engines list */}
                {aiEngines.length > 0 && (
                  <div style={{ ...card }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:14 }}>◈ Configured Engines</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {aiEngines.map(e=>{
                        const p = aiProvMeta(e.provider);
                        const tr = testResultEng[e.id];
                        return (
                          <div key={e.id} style={{ background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:14 }}>
                            <div style={{ width:36, height:36, borderRadius:9, background:`${p.color}18`, border:`1px solid ${p.color}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:p.color, flexShrink:0 }}>{p.logo}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                                <span style={{ fontWeight:700, color:C.text, fontSize:13 }}>{e.name}</span>
                                {e.isDefault && <span style={{ background:"rgba(167,139,250,0.15)", color:C.purple, border:"1px solid rgba(167,139,250,0.3)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700 }}>DEFAULT</span>}
                              </div>
                              <div style={{ fontSize:11, color:C.muted }}>{p.name} · {e.model||"no model"} · {e.apiKey}</div>
                              {tr && <div style={{ fontSize:10, color:tr.ok?C.green:C.danger, marginTop:2 }}>{tr.ok?`✓ Connected — ${tr.latencyMs}ms`:`✗ ${tr.error??"Failed"}`}</div>}
                              {!tr && e.lastTestedAt && <div style={{ fontSize:10, color:e.lastTestOk?C.green:C.danger, marginTop:2 }}>{e.lastTestOk?"✓ Last test passed":"✗ Last test failed"} · {new Date(e.lastTestedAt).toLocaleString()}</div>}
                            </div>
                            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                              <button onClick={()=>handleTestEng(e.id)} disabled={testingEng===e.id} style={{ ...BTN(C.accent,"rgba(147,197,253,0.08)","rgba(147,197,253,0.25)"), opacity:testingEng===e.id?0.5:1 }}>{testingEng===e.id?"…":"Test"}</button>
                              {!e.isDefault && <button onClick={()=>handleSetDefaultEng(e.id)} style={BTN(C.purple,"rgba(167,139,250,0.08)","rgba(167,139,250,0.25)")}>Set Default</button>}
                              <button onClick={()=>setDeleteEngId(e.id)} style={BTN(C.danger,"rgba(239,68,68,0.08)","rgba(239,68,68,0.2)")}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Provider gallery */}
                <div style={{ ...card }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:14 }}>◆ Add AI Engine</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                    {AI_PROVIDERS.map(p=>{
                      const connected = aiEngines.filter(e=>e.provider===p.id);
                      return (
                        <div key={p.id} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:10, padding:"16px", cursor:"pointer" }}
                          onClick={()=>openAddEng(p.id)}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor=p.color+"60")}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <div style={{ width:34, height:34, borderRadius:8, background:`${p.color}18`, border:`1px solid ${p.color}35`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:p.color }}>{p.logo}</div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{p.name}</div>
                              {connected.length>0 && <div style={{ fontSize:10, color:C.green }}>✓ {connected.length} configured</div>}
                            </div>
                          </div>
                          <div style={{ fontSize:11, color:C.muted, lineHeight:1.5, marginBottom:10 }}>{p.description}</div>
                          {p.models.length>0 && (
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const, marginBottom:10 }}>
                              {p.models.slice(0,3).map(m=><span key={m} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:600, color:C.muted }}>{m}</span>)}
                              {p.models.length>3 && <span style={{ fontSize:9, color:C.muted }}>+{p.models.length-3}</span>}
                            </div>
                          )}
                          <button style={{ ...BTN(p.color,`${p.color}14`,`${p.color}40`), width:"100%", textAlign:"center" as const }}>+ Connect</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {aiSubTab==="mcp" && (
              <>
                {/* Server info */}
                <div style={{ background:"linear-gradient(135deg,rgba(167,139,250,0.08),rgba(59,130,246,0.06))", border:"1px solid rgba(167,139,250,0.25)", borderRadius:12, padding:"18px 20px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                    <span style={{ fontSize:16, color:C.purple }}>⊕</span>
                    <span style={{ fontSize:14, fontWeight:800, color:C.purple }}>MCP Server — Model Context Protocol 2024-11-05</span>
                    <span style={{ background:"rgba(52,211,153,0.15)", color:C.green, border:"1px solid rgba(52,211,153,0.3)", borderRadius:10, padding:"2px 9px", fontSize:9, fontWeight:700, marginLeft:"auto" }}>LIVE</span>
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:14, lineHeight:1.7 }}>
                    Connect Claude Desktop, Cursor, VS Code, or any MCP-compatible client to perform GRC operations directly from your development environment.
                  </div>
                  <div style={{ background:C.bg2, borderRadius:8, padding:"10px 14px", display:"flex", alignItems:"center", gap:12, border:`1px solid ${C.border2}` }}>
                    <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.5px", flexShrink:0 }}>SERVER URL</span>
                    <code style={{ flex:1, fontSize:11, color:C.accent, fontFamily:"'JetBrains Mono', monospace", wordBreak:"break-all" as const }}>{mcpServerUrl}</code>
                    <button onClick={()=>navigator.clipboard?.writeText(mcpServerUrl)} style={{ ...BTN(C.muted,"transparent",C.border), padding:"4px 10px", fontSize:10 }}>Copy</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:12 }}>
                    {[{label:"Protocol",value:"JSON-RPC 2.0 over HTTP"},{label:"Auth",value:"Bearer (JWT or MCP Token)"},{label:"Transport",value:"Streamable HTTP"}].map(i=>(
                      <div key={i.label} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{i.label}</div>
                        <div style={{ fontSize:11, fontWeight:600, color:C.text }}>{i.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Quick start */}
                <div style={{ ...card }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:12 }}>◈ Quick Start — Claude Desktop</div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Add to <code style={{ background:C.bg2, padding:"1px 5px", borderRadius:3, color:C.accent }}>claude_desktop_config.json</code>:</div>
                  <pre style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", fontSize:11, color:C.text, overflow:"auto", lineHeight:1.6, margin:0 }}>{`{
  "mcpServers": {
    "aigo-x-grc": {
      "type": "http",
      "url": "${mcpServerUrl}",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}`}</pre>
                </div>
                {/* Tools grid */}
                <div style={{ ...card }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:14 }}>◆ {MCP_TOOLS.length} Available Tools</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {MCP_TOOLS.map(t=>(
                      <div key={t.name} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:9, padding:"12px 14px", display:"flex", gap:10, alignItems:"flex-start" }}>
                        <span style={{ fontSize:18, flexShrink:0 }}>{t.icon}</span>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:C.text, fontFamily:"'JetBrains Mono', monospace", marginBottom:3 }}>{t.name}</div>
                          <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>{t.desc}</div>
                          <div style={{ display:"flex", gap:4 }}>
                            {t.tags.map(tag=><span key={tag} style={{ background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:600, color:C.accent }}>{tag}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* MCP Tokens */}
                <div style={{ ...card }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.accent }}>🔑 MCP Access Tokens</div>
                    <button onClick={()=>{setShowMcpCreate(true);setNewRawToken("");setMcpError("");setMcpForm({name:"",scopes:["tools"],expiresAt:""});}} style={BTN(C.green,"rgba(52,211,153,0.08)","rgba(52,211,153,0.25)")}>+ New Token</button>
                  </div>
                  {newRawToken && (
                    <div style={{ background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.3)", borderRadius:8, padding:"12px 16px", marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.green, marginBottom:6 }}>✓ Token created — copy it now, it won't be shown again</div>
                      <code style={{ fontSize:11, color:C.text, fontFamily:"'JetBrains Mono', monospace", wordBreak:"break-all" as const }}>{newRawToken}</code>
                      <button onClick={()=>navigator.clipboard?.writeText(newRawToken)} style={{ ...BTN(C.green,"rgba(52,211,153,0.08)","rgba(52,211,153,0.3)"), marginTop:8, display:"block" as const, fontSize:10 }}>Copy Token</button>
                    </div>
                  )}
                  {mcpTokens.length===0 ? (
                    <div style={{ textAlign:"center" as const, padding:"24px 0", color:C.muted, fontSize:12 }}>No MCP tokens yet. Create one to connect external clients.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {mcpTokens.map(t=>(
                        <div key={t.id} style={{ background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:9, padding:"12px 16px", display:"flex", alignItems:"center", gap:14 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.text, marginBottom:2 }}>{t.name}</div>
                            <div style={{ fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:C.muted }}>{t.tokenPrefix}••••••••</div>
                            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                              Created {new Date(t.createdAt).toLocaleDateString()}
                              {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleString()}`}
                              {t.expiresAt && ` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
                            <span style={{ background:t.isActive?"rgba(52,211,153,0.1)":"rgba(239,68,68,0.1)", color:t.isActive?C.green:C.danger, border:`1px solid ${t.isActive?"rgba(52,211,153,0.3)":"rgba(239,68,68,0.3)"}`, borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700 }}>
                              {t.isActive?"ACTIVE":"REVOKED"}
                            </span>
                            {t.isActive && <button onClick={()=>handleRevokeMcp(t.id)} style={BTN(C.danger,"rgba(239,68,68,0.06)","rgba(239,68,68,0.2)")}>Revoke</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── PERFORMANCE ──────────────────────────────────────────────── */}
        {tab==="performance" && (
          <TableShell
            cols={["Service","Uptime","p50","p95","p99","RPS","Error Rate","Status"]}
            rows={perf.map(p=>[
              <span style={{ fontWeight:700, color:C.accent }}>{p.service}</span>,
              <span style={{ fontFamily:"'JetBrains Mono', monospace", fontWeight:700, color:C.green }}>{p.uptime}</span>,
              <Mono>{p.p50}</Mono>,<Mono>{p.p95}</Mono>,<Mono>{p.p99}</Mono>,
              <Mono>{p.rps}</Mono>,
              <span style={{ fontFamily:"'JetBrains Mono', monospace", color:parseFloat(p.errors)>0.1?C.warn:C.green, fontWeight:700 }}>{p.errors}</span>,
              <Badge label={p.status==="healthy"?"active":p.status} />,
            ])}
          />
        )}

        {/* ── DEPENDENCIES ─────────────────────────────────────────────── */}
        {tab==="dependencies" && (
          <TableShell
            cols={["Package","Type","Current","Latest","Critical","Status"]}
            rows={deps.map(d=>[
              <span style={{ fontWeight:700, color:C.accent, fontFamily:"'JetBrains Mono', monospace" }}>{d.name}</span>,
              <span style={{ fontSize:11, color:C.muted }}>{d.type}</span>,
              <Mono>{d.version}</Mono>,
              <span style={{ fontFamily:"'JetBrains Mono', monospace", color:d.status==="outdated"?C.warn:C.muted }}>{d.latest}</span>,
              d.critical?<span style={{ background:"rgba(239,68,68,0.08)", color:C.danger, border:"1px solid rgba(239,68,68,0.3)", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>Yes</span>:<span style={{ color:C.muted }}>—</span>,
              <Badge label={d.status==="ok"?"active":d.status==="outdated"?"in-review":d.status} />,
            ])}
          />
        )}

        {/* ── AUDIT LOG ────────────────────────────────────────────────── */}
        {tab==="auditlog" && (
          <>
            <div style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"10px 16px", fontSize:11, color:C.text }}>
              <strong style={{ color:C.danger }}>🔒 Immutable Audit Trail</strong> — All events are cryptographically signed and write-once. Tampering is detected automatically.
            </div>
            <TableShell
              cols={["Event ID","Timestamp","Actor","Action","Resource","IP","Severity","Outcome"]}
              rows={auditLog.map(a=>{
                const ss = sevColor[a.severity]??sevColor.Info;
                return [
                  <Mono>{a.id}</Mono>,
                  <Mono style={{ fontSize:10 }}>{a.ts}</Mono>,
                  <span style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:10, color:a.actor.startsWith("admin@aigo-x")?C.danger:C.accent }}>{a.actor}</span>,
                  <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{a.action}</span>,
                  <span style={{ fontSize:11, color:C.muted, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block" }}>{a.resource}</span>,
                  <Mono style={{ fontSize:10 }}>{a.ip}</Mono>,
                  <span style={{ background:ss.bg, color:ss.color, border:`1px solid ${ss.border}`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{a.severity}</span>,
                  <span style={{ fontSize:10, fontWeight:700, color:a.outcome==="success"?C.green:a.outcome==="failure"?C.danger:C.warn, textTransform:"uppercase" as const }}>{a.outcome}</span>,
                ];
              })}
            />
          </>
        )}
      </div>

      {/* ── ADD ENGINE MODAL ──────────────────────────────────────────────── */}
      {showAddEng && (() => {
        const sp = aiProvMeta(addProvider);
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
            <div style={{ ...card, width:480, maxHeight:"90vh", overflow:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <span style={{ fontSize:20, color:sp.color }}>{sp.logo}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:C.text }}>Connect {sp.name}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{sp.description}</div>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div><label style={LBL}>Display Name</label><input style={INP} value={addEngForm.name} onChange={e=>setAddEngForm(f=>({...f,name:e.target.value}))} placeholder={sp.name} /></div>
                <div><label style={LBL}>API Key</label><input style={INP} type="password" value={addEngForm.apiKey} onChange={e=>setAddEngForm(f=>({...f,apiKey:e.target.value}))} placeholder={sp.id==="anthropic"?"sk-ant-...":sp.id==="gemini"?"AIza...":"sk-..."} /></div>
                <div><label style={LBL}>Model</label>
                  {sp.models.length>0
                    ? <select style={INP} value={addEngForm.model} onChange={e=>setAddEngForm(f=>({...f,model:e.target.value}))}>{sp.models.map(m=><option key={m} value={m}>{m}</option>)}</select>
                    : <input style={INP} value={addEngForm.model} onChange={e=>setAddEngForm(f=>({...f,model:e.target.value}))} placeholder="e.g. llama3.2, mistral" />}
                </div>
                {(sp.id==="custom"||sp.id==="kimi"||sp.id==="z-ai") && (
                  <div><label style={LBL}>Base URL</label><input style={INP} value={addEngForm.baseUrl} onChange={e=>setAddEngForm(f=>({...f,baseUrl:e.target.value}))} placeholder="https://api.example.com/v1" /></div>
                )}
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:12, color:C.muted }}>
                  <input type="checkbox" checked={addEngForm.isDefault} onChange={e=>setAddEngForm(f=>({...f,isDefault:e.target.checked}))} />
                  Set as default AI engine for copilots
                </label>
                {addEngError && <div style={{ fontSize:11, color:C.danger }}>{addEngError}</div>}
              </div>
              <div style={{ display:"flex", gap:10, marginTop:20 }}>
                <button onClick={handleAddEng} disabled={addEngSaving} style={{ ...BTN(C.green,"rgba(52,211,153,0.1)","rgba(52,211,153,0.3)"), flex:1, opacity:addEngSaving?0.5:1 }}>{addEngSaving?"Saving…":"Connect Engine"}</button>
                <button onClick={()=>setShowAddEng(false)} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DELETE ENGINE CONFIRM ─────────────────────────────────────────── */}
      {deleteEngId !== null && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ ...card, width:360 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.danger, marginBottom:10 }}>Remove AI Engine?</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>This will remove the engine config and API key from the platform.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>handleDeleteEng(deleteEngId)} style={{ ...BTN(C.danger,"rgba(239,68,68,0.1)","rgba(239,68,68,0.3)"), flex:1 }}>Remove</button>
              <button onClick={()=>setDeleteEngId(null)} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LICENSE EDIT MODAL ────────────────────────────────────────────── */}
      {licEditTenant && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ ...card, width:600, maxHeight:"88vh", overflow:"auto", display:"flex", flexDirection:"column", gap:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:800, color:C.accent }}>◈ License Manager</div>
                <div style={{ fontSize:11, color:C.muted }}>{licEditTenant.name} · {licEditTenant.domain ?? licEditTenant.slug}</div>
              </div>
              <button onClick={()=>setLicEditTenant(null)} style={{ ...BTN(C.muted,"transparent","transparent"), padding:"4px 8px", fontSize:14 }}>✕</button>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={LBL}>Plan</label>
              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                {PRICING_TIERS.map(tier=>(
                  <button key={tier.plan} onClick={()=>setLicForm((f: any)=>({...f,plan:tier.plan}))}
                    style={{ flex:1, padding:"10px 8px", borderRadius:8, border:`2px solid ${licForm.plan===tier.plan?tier.color:C.border}`, background:licForm.plan===tier.plan?`${tier.color}14`:"var(--secondary)", color:licForm.plan===tier.plan?tier.color:C.muted, fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", textTransform:"capitalize" as const }}>
                    {tier.label}<br/><span style={{ fontSize:9, fontWeight:500, opacity:0.8 }}>{tier.price}/mo</span>
                  </button>
                ))}
              </div>
              <button onClick={()=>applyPlanDefaults(licEditTenant.id, licForm.plan)} style={{ ...BTN(C.green,"rgba(52,211,153,0.08)","rgba(52,211,153,0.25)"), fontSize:11 }}>
                ↺ Apply {licForm.plan} default modules &amp; seats
              </button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <div><label style={LBL}>Licensed Seats</label><input style={INP} type="number" min={1} value={licForm.seats} onChange={e=>setLicForm((f: any)=>({...f,seats:parseInt(e.target.value)||1}))} /></div>
              <div><label style={LBL}>Expiry Date (optional)</label><input style={INP} type="date" value={licForm.expiresAt??""} onChange={e=>setLicForm((f: any)=>({...f,expiresAt:e.target.value}))} /></div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={LBL}>Module Access</label>
              {MODULE_GROUPS.map(group=>(
                <div key={group.label} style={{ marginBottom:14 }}>
                  {/* Group header */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.4px" }}>{group.icon} {group.label.toUpperCase()}</span>
                    {(group as any).alwaysOn && <span style={{ fontSize:9, fontWeight:600, color:C.green, background:"rgba(52,211,153,0.10)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:4, padding:"1px 6px" }}>Always On</span>}
                  </div>

                  {/* Parent module toggles */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:4 }}>
                    {group.keys.map(key=>{
                      const alwaysOn = !!(group as any).alwaysOn;
                      const on = alwaysOn || !!(licForm.modules?.[key]);
                      return (
                        <button key={key}
                          onClick={alwaysOn ? undefined : ()=>{
                            const nextOn = !on;
                            setLicForm((f: any)=>({...f,modules:{...f.modules,[key]:nextOn}}));
                            // When turning OFF a parent, also clear its sub-module keys
                            if (!nextOn) clearSubmodules(key);
                          }}
                          style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${on?"rgba(52,211,153,0.35)":C.border}`, background:on?"rgba(52,211,153,0.10)":"var(--secondary)", color:on?C.green:C.muted, fontWeight:700, fontSize:11, cursor:alwaysOn?"default":"pointer", fontFamily:"inherit", transition:"all 0.15s", opacity:alwaysOn?0.7:1 }}>
                          {on?"✓ ":""}{MODULE_LABEL[key]??key}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-module controls for each enabled parent in this group */}
                  {group.keys.map(key=>{
                    const alwaysOn = !!(group as any).alwaysOn;
                    const on = alwaysOn || !!(licForm.modules?.[key]);
                    const subDefs = SUBMODULE_MAP[key] ?? [];
                    if (!on || subDefs.length === 0) return null;
                    const restricted = hasSubRestrictions(key);
                    return (
                      <div key={`sub-${key}`} style={{ marginTop:8, marginLeft:8, paddingLeft:12, borderLeft:`2px solid rgba(52,211,153,0.2)` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.5px", textTransform:"uppercase" }}>
                            {MODULE_LABEL[key]} sub-modules
                          </span>
                          {!restricted
                            ? <span style={{ fontSize:9, color:C.green, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:4, padding:"1px 6px", fontWeight:600 }}>Full access</span>
                            : <span style={{ fontSize:9, color:C.warn, background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:4, padding:"1px 6px", fontWeight:600 }}>Restricted</span>
                          }
                          {!restricted
                            ? <button onClick={()=>toggleAllSubmodules(key, false)} style={{ fontSize:9, fontWeight:700, color:C.muted, background:"none", border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 7px", cursor:"pointer", fontFamily:"inherit" }}>Restrict…</button>
                            : <button onClick={()=>clearSubmodules(key)} style={{ fontSize:9, fontWeight:700, color:C.accent, background:"none", border:`1px solid rgba(147,197,253,0.3)`, borderRadius:4, padding:"1px 7px", cursor:"pointer", fontFamily:"inherit" }}>Clear (full access)</button>
                          }
                          {restricted && (
                            <button onClick={()=>toggleAllSubmodules(key, true)} style={{ fontSize:9, fontWeight:700, color:C.green, background:"none", border:`1px solid rgba(52,211,153,0.3)`, borderRadius:4, padding:"1px 7px", cursor:"pointer", fontFamily:"inherit" }}>All on</button>
                          )}
                        </div>
                        {restricted && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                            {subDefs.map(sub=>{
                              const subOn = !!(licForm.modules?.[sub.key]);
                              return (
                                <button key={sub.key}
                                  title={sub.description}
                                  onClick={()=>setLicForm((f: any)=>({...f,modules:{...f.modules,[sub.key]:!subOn}}))}
                                  style={{ padding:"3px 10px", borderRadius:5, border:`1px solid ${subOn?"rgba(52,211,153,0.3)":C.border}`, background:subOn?"rgba(52,211,153,0.08)":"var(--secondary)", color:subOn?C.green:C.muted, fontWeight:600, fontSize:10, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s" }}>
                                  {subOn?"✓ ":""}{sub.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* ── Framework Licensing ── */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <label style={{ ...LBL, marginBottom:0 }}>Licensed Frameworks</label>
                <span style={{ fontSize:10, color:C.muted }}>
                  {(licForm.frameworkIds??[]).length === 0
                    ? "— All frameworks accessible (unrestricted)"
                    : `— ${(licForm.frameworkIds??[]).length} framework${(licForm.frameworkIds??[]).length!==1?"s":""} locked to this tenant`}
                </span>
                {(licForm.frameworkIds??[]).length > 0 && (
                  <button onClick={()=>setLicForm((f: any)=>({...f,frameworkIds:[]}))}
                    style={{ ...BTN(C.muted,"transparent","transparent"), padding:"1px 8px", fontSize:10, marginLeft:"auto" }}>
                    Clear all
                  </button>
                )}
              </div>
              <div style={{ fontSize:10, color:C.muted, marginBottom:8, background:"rgba(147,197,253,0.04)", borderRadius:6, padding:"5px 10px", border:"1px solid rgba(147,197,253,0.12)" }}>
                Leave empty to allow all frameworks. Select specific frameworks to restrict access to only those frameworks.
              </div>
              {frameworkList.length === 0
                ? <div style={{ fontSize:11, color:C.muted }}>Loading frameworks…</div>
                : (
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:5, maxHeight:180, overflowY:"auto" as const, padding:"2px 0" }}>
                    {frameworkList.map(fw=>{
                      const sel = (licForm.frameworkIds??[]).includes(fw.id);
                      return (
                        <button key={fw.id}
                          onClick={()=>setLicForm((f: any)=>{
                            const ids: number[] = f.frameworkIds ?? [];
                            return {...f, frameworkIds: sel ? ids.filter((id: number)=>id!==fw.id) : [...ids, fw.id]};
                          })}
                          style={{ padding:"3px 9px", borderRadius:5, border:`1px solid ${sel?"rgba(99,179,237,0.45)":C.border}`, background:sel?"rgba(99,179,237,0.12)":"var(--secondary)", color:sel?C.accent:C.muted, fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s" }}>
                          {sel ? "✓ " : ""}{fw.shortCode || fw.name.slice(0,20)}
                        </button>
                      );
                    })}
                  </div>
                )
              }
            </div>
            {/* ── Seat Consumption bar ── */}
            {tenantUsersFor === licEditTenant.id && tenantUsers.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <label style={LBL}>Seat Consumption ({tenantUsers.length} / {licForm.seats} seats used)</label>
                <div style={{ height:6, background:C.bg2, borderRadius:3 }}>
                  <div style={{ height:"100%", width:`${Math.min(100,(tenantUsers.length/licForm.seats)*100)}%`, background:tenantUsers.length>licForm.seats?C.danger:C.green, borderRadius:3 }} />
                </div>
              </div>
            )}
            {licError && <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:7, padding:"9px 12px", fontSize:11, color:C.danger, marginBottom:12 }}>{licError}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleLicSave} disabled={licSaving} style={{ ...BTN(C.green,"rgba(52,211,153,0.1)","rgba(52,211,153,0.3)"), flex:1, opacity:licSaving?0.6:1 }}>{licSaving?"Saving…":"Save License"}</button>
              <button onClick={()=>setLicEditTenant(null)} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE MCP TOKEN ──────────────────────────────────────────────── */}
      {showMcpCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ ...card, width:420 }}>
            <div style={{ fontSize:14, fontWeight:800, color:C.purple, marginBottom:16 }}>⊕ New MCP Access Token</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label style={LBL}>Token Name</label><input style={INP} value={mcpForm.name} onChange={e=>setMcpForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Claude Desktop — Dev Laptop" /></div>
              <div><label style={LBL}>Expires (optional)</label><input style={INP} type="date" value={mcpForm.expiresAt} onChange={e=>setMcpForm(f=>({...f,expiresAt:e.target.value}))} /></div>
              {mcpError && <div style={{ fontSize:11, color:C.danger }}>{mcpError}</div>}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={handleMcpCreate} disabled={mcpSaving} style={{ ...BTN(C.purple,"rgba(167,139,250,0.1)","rgba(167,139,250,0.3)"), flex:1, opacity:mcpSaving?0.5:1 }}>{mcpSaving?"Creating…":"Generate Token"}</button>
              <button onClick={()=>setShowMcpCreate(false)} style={BTN(C.muted,C.bg3,C.border)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

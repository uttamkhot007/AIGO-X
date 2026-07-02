import { useState, useMemo, useEffect, useRef } from "react";
import { zipSync, strToU8 } from "fflate";
import IntegrationsHub from "@/components/IntegrationsHub";
import SettingsDocumentation from "@/pages/SettingsDocumentation";
import { useOrg } from "@/context/OrgContext";
import { SubNav, ModuleHeader } from "@/components/SubNav";
import { AppModal, AppModalBody } from "@/components/ui/app-modal";
import { useLocation, useSearch } from "wouter";
import { allAgents, extendedUsers, userRoles, assetGroups, allAssets, type Agent, type GRCUser, type UserRole, type AssetGroup, type Asset } from "@/lib/grc-data";
import { CATALOG, CATEGORIES, OS_CAPABILITIES, type ConnDef } from "@/lib/agent-catalog";
import { buildExtensionFiles } from "@/lib/extension-package";

const NAV="#1E3A5F", EME="#065F46", RED="#DC2626", AMB="#D97706", PRP="#7C3AED", BLU="#1D4ED8", CYN="#0891B2";

// ── Shared light-theme helpers ──────────────────────────────────────────────
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background:"var(--card)", border:"1px solid var(--border)", borderRadius:12,
  boxShadow:"0 2px 8px rgba(0,0,0,0.05)", ...extra,
});
const kpiBadge = (color:string,bg:string,border:string,label:string):React.ReactNode => (
  <span style={{ fontSize:9, fontWeight:800, color, background:bg, border:`1px solid ${border}`, borderRadius:4, padding:"2px 6px" }}>{label}</span>
);
const riskColor = (score:number) => score>=80?RED:score>=60?AMB:score>=40?BLU:EME;
const impColor  = (imp:string) => imp==="Critical"?RED:imp==="High"?AMB:imp==="Medium"?BLU:EME;
const impBg     = (imp:string) => imp==="Critical"?"rgba(239,68,68,0.06)":imp==="High"?"rgba(245,158,11,0.06)":imp==="Medium"?"rgba(59,130,246,0.12)":"rgba(34,197,94,0.08)";
const impBd     = (imp:string) => imp==="Critical"?"#FECACA":imp==="High"?"#FDE68A":imp==="Medium"?"#BFDBFE":"#A7F3D0";

// ── Live-data types (prefixed to avoid clash with static grc-data types) ────
type LiveAgentOS     = "windows"|"linux"|"macos"|"mobile"|"cloud";
type LiveAgentStatus = "online"|"offline"|"warning"|"stale";
type LiveConnStatus  = "connected"|"partial"|"warning"|"available"|"error";
interface LiveAgent {
  id:string; hostname:string; os:LiveAgentOS; arch:string; version:string;
  status:LiveAgentStatus; lastSeen:string; registeredAt?:string; ip:string; tags:string[];
  health:{ cpu:number; mem:number; disk:number; uptime:number };
  policy:{ scanSchedule:string; reportingIntervalSecs:number; dataTypes:string[]; maxCpuPct:number };
  telemetry:{ assetsDiscovered:number; eventsLastHour:number; alertsOpen:number };
}
interface ActiveConn  { id:string; connectorId:string; connectorName:string; category:string; status:LiveConnStatus; assetsIngested:number; eventsIngested:number; lastSync:string|null; errorCount:number; }
interface WebhookCfg  { id:string; direction:"inbound"|"outbound"; name:string; url:string; signingSecret:string; eventTypes:string[]; active:boolean; createdAt:string; }
interface DeliveryRow { id:string; ts:string; event:string; statusCode:number; latencyMs:number; success:boolean; payload:string; }
interface PipelineMetric { connectorId:string; connectorName:string; date:string; volumeIn:number; latencyP50Ms:number; latencyP95Ms:number; errorRate:number; errors?:Array<{ts:string;code:string;message:string}>; }

// ── Live-data API hook ────────────────────────────────────────────────────────
function useApi<T>(path: string, fallback: T): { data: T; loading: boolean; refetch: () => void } {
  const [data, setData]       = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]       = useState(0);
  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const base  = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
    const api   = base.replace(/grc-platform\/?$/, "api/");
    setLoading(true);
    fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token ?? ""}` } })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() as Promise<T>; })
      .then(d  => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [path, tick]);
  return { data, loading, refetch: () => setTick(t => t + 1) };
}

// ── Portal Hub helpers ────────────────────────────────────────────────────────
const PORTAL_WIDGET_CATALOGUE: Record<string, string[]> = {
  ciso:     ["security_posture_score","top_risks","open_critical_findings","compliance_status","ai_security_briefing","incident_trend"],
  cro:      ["risk_appetite_gauge","risk_register_summary","risk_treatment_pipeline","vendor_risk_exposure","pdf_export"],
  chro:     ["policy_ack_rate","training_completion","ropa_summary","people_risk_count","attestation_donut"],
  vendor:   ["questionnaire_inbox","evidence_upload","assessment_timeline","compliance_badge"],
  employee: ["my_open_tasks","security_tip","report_incident"],
};
const WIDGET_LABELS: Record<string, string> = {
  security_posture_score:"Security Posture Score", top_risks:"Top Risks (Heatmap)", open_critical_findings:"Open Critical Findings", compliance_status:"Compliance Status by Framework", ai_security_briefing:"AI Security Briefing", incident_trend:"Incident Trend",
  risk_appetite_gauge:"Risk Appetite Gauge", risk_register_summary:"Risk Register Summary (Top 10)", risk_treatment_pipeline:"Risk Treatment Pipeline", vendor_risk_exposure:"Vendor Risk Exposure", pdf_export:"Board-ready PDF Export",
  policy_ack_rate:"Policy Acknowledgment Rate", training_completion:"Training Completion %", ropa_summary:"ROPA Summary", people_risk_count:"People Risk Count", attestation_donut:"Attestation Completion",
  questionnaire_inbox:"Questionnaire Inbox", evidence_upload:"Evidence Upload", assessment_timeline:"Assessment Status Timeline", compliance_badge:"Compliance Badge",
  my_open_tasks:"My Open Tasks", security_tip:"Security Tip of the Day", report_incident:"Report an Incident",
};
const PORTAL_TYPE_META: Record<string, { label:string; icon:string; desc:string }> = {
  ciso:     { label:"CISO Dashboard",      icon:"🛡",  desc:"Executive security posture view" },
  cro:      { label:"CRO Risk Portal",     icon:"📊",  desc:"Board-ready risk intelligence" },
  chro:     { label:"CHRO People Portal",  icon:"👥",  desc:"People compliance & privacy data" },
  vendor:   { label:"Vendor Portal",       icon:"🏢",  desc:"Vendor questionnaire & evidence" },
  employee: { label:"Employee Portal",     icon:"💡",  desc:"Personal tasks & security tips" },
};
function portalApiBase() {
  const base = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  return base.replace(/grc-platform\/?$/, "api/");
}
function portalAuthHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" };
}
function buildPortalUrl(portalType: string, accessToken: string | null): string {
  const origin = window.location.origin;
  const base = (import.meta as { env: Record<string,string> }).env["BASE_URL"]?.replace(/\/$/, "") ?? "/grc-platform";
  const prefix = base.replace(/\/grc-platform$/, "");
  return `${origin}${prefix}/portal/${portalType}?token=${encodeURIComponent(accessToken ?? "")}`;
}

// ── Light-theme live UI helpers ───────────────────────────────────────────────
function LiveStatusBadge({ status }: { status: string }) {
  const c = status==="online"||status==="connected"?EME:status==="warning"||status==="partial"?AMB:status==="offline"||status==="error"||status==="stale"?RED:"var(--muted-foreground)";
  const b = status==="online"||status==="connected"?"rgba(34,197,94,0.08)":status==="warning"||status==="partial"?"rgba(245,158,11,0.06)":status==="offline"||status==="error"||status==="stale"?"rgba(239,68,68,0.06)":"var(--card)";
  const d = status==="online"||status==="connected"?"#A7F3D0":status==="warning"||status==="partial"?"#FDE68A":status==="offline"||status==="error"||status==="stale"?"#FECACA":"#94A3B8";
  return <span style={{ fontSize:9, fontWeight:800, color:c, background:b, border:`1px solid ${d}`, borderRadius:4, padding:"2px 7px" }}>{status.toUpperCase()}</span>;
}
function MiniBarL({ pct, danger=false }: { pct:number; danger?:boolean }) {
  const col = danger?RED:pct>70?AMB:EME;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:48, height:5, background:"var(--input)", borderRadius:3, flexShrink:0 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:col, borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:10, color:col, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{pct}%</span>
    </div>
  );
}
function SparklineL({ values, color }: { values:number[]; color:string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1), W=60, H=20;
  const pts = values.map((v,i) => `${(i/(values.length-1||1))*W},${H-Math.max((v/max)*H,1)}`).join(" ");
  return <svg width={W} height={H} style={{ flexShrink:0 }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function OsBadgeL({ os }: { os: string }) {
  const map: Record<string,{icon:string;color:string}> = {
    windows:{icon:"⊞",color:"#0078D4"}, linux:{icon:"⊗",color:"#E2A62D"},
    macos:{icon:"⌘",color:"#6B7280"},   mobile:{icon:"⬡",color:"#8B5CF6"},
    cloud:{icon:"☁",color:"#10B981"},
  };
  const m = map[os] ?? {icon:"?",color:"var(--muted-foreground)"};
  return <span style={{ fontSize:9, fontWeight:800, color:m.color, background:`${m.color}14`, border:`1px solid ${m.color}30`, borderRadius:4, padding:"2px 7px" }}>{m.icon} {os}</span>;
}
function PillL({ label, color=BLU }: { label:string; color?:string }) {
  return <span style={{ fontSize:9, fontWeight:800, color, background:`${color}14`, border:`1px solid ${color}30`, borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap" as const }}>{label}</span>;
}

// ── RiskGauge ─────────────────────────────────────────────────────────────────
function RiskGauge({ score }: { score:number }) {
  const color = riskColor(score), r=36, circ=2*Math.PI*r, dash=(score/100)*circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <svg width={88} height={88} style={{ transform:"rotate(-90deg)" }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border)" strokeWidth="10"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"relative", marginTop:-68, marginBottom:16, textAlign:"center" }}>
        <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color }}>{score}</div>
        <div style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:700 }}>RISK SCORE</div>
      </div>
    </div>
  );
}
function AiCard({ insights }: { insights:string[] }) {
  return (
    <div style={{ background:"linear-gradient(135deg,#EFF6FF,#F0FDF4)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:12, padding:"14px 16px" }}>
      <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:14 }}>🤖</span> AI Insights
      </div>
      {insights.map((ins,i) => (
        <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"flex-start" }}>
          <span style={{ color:EME, fontWeight:800, fontSize:12, flexShrink:0, marginTop:1 }}>•</span>
          <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{ins}</span>
        </div>
      ))}
    </div>
  );
}
function BackBtn({ onClose }: { onClose:() => void }) {
  return (
    <button onClick={onClose} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", color:NAV, fontFamily:"inherit", fontSize:12, fontWeight:700, padding:"8px 0", marginBottom:12 }}>
      ← Back to List
    </button>
  );
}

// ── Static profile components (Agent, User, Role, AssetGroup) ─────────────────
function AgentProfile({ agent, onClose }: { agent:Agent; onClose:() => void }) {
  const sc = agent.status==="online"?EME:agent.status==="warning"?AMB:RED;
  const sb = agent.status==="online"?"rgba(34,197,94,0.08)":agent.status==="warning"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)";
  const sd = agent.status==="online"?"#A7F3D0":agent.status==="warning"?"#FDE68A":"#FECACA";
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 4px" }}>
      <BackBtn onClose={onClose}/>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{agent.id}</span>
              {kpiBadge(sc,sb,sd,agent.status.toUpperCase())}
              {kpiBadge(CYN,"#ECFEFF","#A5F3FC",agent.type)}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{agent.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>{agent.platform} · v{agent.version} · {agent.location}</div>
          </div>
          <RiskGauge score={agent.riskScore}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Agent Metrics</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {([
                { label:"Managed Assets",   value:String(agent.assets),                      color:NAV },
                { label:"Collected Today",  value:agent.collectedToday.toLocaleString(),      color:EME },
                { label:"Events (24h)",     value:agent.events24h.toLocaleString(),           color:BLU },
                { label:"Errors (24h)",     value:String(agent.errors24h),                    color:agent.errors24h>0?RED:EME },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={{ background:"var(--card)", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Resource Usage</div>
            {([["CPU Usage",agent.cpu],["Memory Usage",agent.mem]] as [string,number][]).map(([lbl,pct]) => (
              <div key={lbl} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5 }}>
                  <span style={{ color:"var(--foreground)", fontWeight:500 }}>{lbl}</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:pct>70?RED:pct>50?AMB:EME }}>{pct}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"var(--input)" }}>
                  <div style={{ height:"100%", borderRadius:4, background:pct>70?RED:pct>50?AMB:EME, width:`${pct}%` }}/>
                </div>
              </div>
            ))}
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Configuration</div>
            {([["IP Address",agent.ip],["Install Date",agent.installDate],["Last Seen",agent.lastSeen],["Platform",agent.platform],["Version",agent.version]]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #F9F8F6", fontSize:11 }}>
                <span style={{ color:"var(--muted-foreground)" }}>{k}</span>
                <span style={{ color:NAV, fontWeight:600, fontFamily:k==="IP Address"?"'JetBrains Mono',monospace":"inherit" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <AiCard insights={agent.aiInsights}/>
      </div>
    </div>
  );
}
function UserProfile({ user, onClose }: { user:GRCUser; onClose:() => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 4px" }}>
      <BackBtn onClose={onClose}/>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{user.id}</span>
              {kpiBadge(user.status==="active"?EME:RED,user.status==="active"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)",user.status==="active"?"#A7F3D0":"#FECACA",user.status.toUpperCase())}
              {!user.mfa&&kpiBadge(RED,"rgba(239,68,68,0.06)","#FECACA","⚠ NO MFA")}
              {kpiBadge(PRP,"#F5F3FF","#DDD6FE",user.role)}
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:NAV, marginBottom:2 }}>{user.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>{user.email} · {user.dept} · {user.location}</div>
          </div>
          <RiskGauge score={user.riskScore}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>User Overview</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {([
                { label:"Policy Acknowledgement", value:`${user.policyAck}/${user.totalPolicies}`, color:user.policyAck===user.totalPolicies?EME:AMB },
                { label:"Open Findings",          value:String(user.openFindings),                 color:user.openFindings>5?RED:user.openFindings>0?AMB:EME },
                { label:"Managed Assets",         value:String(user.assets),                       color:NAV },
                { label:"Last Login",             value:user.lastLogin,                            color:EME },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={{ background:"var(--card)", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Details</div>
            {([["Manager",user.manager],["Join Date",user.joinDate],["MFA Status",user.mfa?"✓ Enabled":"✗ Disabled"],["Department",user.dept],["Location",user.location]]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #F9F8F6", fontSize:11 }}>
                <span style={{ color:"var(--muted-foreground)" }}>{k}</span>
                <span style={{ color:k==="MFA Status"?(v.startsWith("✓")?EME:RED):NAV, fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12 }}>Permissions</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {user.permissions.map(p => (
                <div key={p} style={{ fontSize:11, fontWeight:600, color:NAV, background:"rgba(59,130,246,0.08)", border:"1px solid #BAE6FD", borderRadius:6, padding:"5px 10px" }}>{p}</div>
              ))}
            </div>
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12 }}>Recent Activity</div>
            {user.recentActivity.map((a,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"7px 0", borderBottom:"1px solid #F9F8F6" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:EME, flexShrink:0, marginTop:5 }}/>
                <span style={{ fontSize:11, color:"var(--foreground)" }}>{a}</span>
              </div>
            ))}
          </div>
        </div>
        <AiCard insights={user.aiInsights}/>
      </div>
    </div>
  );
}
function RoleProfile({ role, onClose }: { role:UserRole; onClose:() => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 4px" }}>
      <BackBtn onClose={onClose}/>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{role.id}</span>
              <span style={{ fontSize:9, fontWeight:800, color:impColor(role.riskLevel), background:impBg(role.riskLevel), border:`1px solid ${impBd(role.riskLevel)}`, borderRadius:4, padding:"2px 7px" }}>{role.riskLevel.toUpperCase()} RISK</span>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{role.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>{role.description}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:32, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:NAV }}>{role.users}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Assigned Users</div>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Permission Matrix</div>
            {role.permissions.map(p => {
              const lvlC = p.level==="Admin"?RED:p.level==="Write"?AMB:p.level==="Read"?EME:"var(--muted-foreground)";
              const lvlB = p.level==="Admin"?"rgba(239,68,68,0.06)":p.level==="Write"?"rgba(245,158,11,0.06)":p.level==="Read"?"rgba(34,197,94,0.08)":"var(--card)";
              return (
                <div key={p.module} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #F9F8F6" }}>
                  <span style={{ fontSize:12, color:"var(--foreground)", fontWeight:500 }}>{p.module}</span>
                  <span style={{ fontSize:10, fontWeight:800, color:lvlC, background:lvlB, borderRadius:4, padding:"2px 8px" }}>{p.level}</span>
                </div>
              );
            })}
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12 }}>Role Metadata</div>
            {([["Users Assigned",String(role.users)],["Risk Level",role.riskLevel],["Created By",role.createdBy],["Last Reviewed",role.lastReviewed]]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #F9F8F6", fontSize:11 }}>
                <span style={{ color:"var(--muted-foreground)" }}>{k}</span><span style={{ color:NAV, fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <AiCard insights={role.aiInsights}/>
      </div>
    </div>
  );
}
function AssetGroupProfile({ group, onClose }: { group:AssetGroup; onClose:() => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 4px" }}>
      <BackBtn onClose={onClose}/>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{group.id}</span>
              <span style={{ fontSize:9, fontWeight:800, color:impColor(group.impact), background:impBg(group.impact), border:`1px solid ${impBd(group.impact)}`, borderRadius:4, padding:"2px 7px" }}>{group.impact.toUpperCase()} IMPACT</span>
              {kpiBadge(BLU,"rgba(59,130,246,0.12)","#BFDBFE",group.category)}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{group.name}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>{group.description}</div>
          </div>
          <RiskGauge score={group.riskScore}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Group Details</div>
            {([["Asset Count",String(group.assetCount)],["Category",group.category],["Owner",group.owner],["Last Reviewed",group.lastReviewed]]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #F9F8F6", fontSize:11 }}>
                <span style={{ color:"var(--muted-foreground)" }}>{k}</span><span style={{ color:NAV, fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:8 }}>Tags</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {group.tags.map(t => <span key={t} style={{ fontSize:10, fontWeight:700, color:NAV, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 8px" }}>{t}</span>)}
              </div>
            </div>
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:8 }}>Mapped Frameworks</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {group.frameworks.map(f => <div key={f} style={{ fontSize:11, color:"var(--foreground)", background:"var(--card)", borderRadius:6, padding:"5px 10px", border:"1px solid var(--border)" }}>{f}</div>)}
              </div>
            </div>
          </div>
        </div>
        <AiCard insights={group.aiInsights}/>
      </div>
    </div>
  );
}

// ── Settings form helpers ──────────────────────────────────────────────────────
const Field = ({ label, value, type="text" }: { label:string; value:string; type?:string }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", display:"block", marginBottom:5 }}>{label}</label>
    <input defaultValue={value} type={type} style={{ width:"100%", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px", fontSize:13, color:"var(--foreground)", background:"var(--card)", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}/>
  </div>
);
const Toggle = ({ label, enabled, sub }: { label:string; enabled:boolean; sub?:string }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
    <div><div style={{ fontSize:13, fontWeight:600, color:"var(--foreground)" }}>{label}</div>{sub&&<div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{sub}</div>}</div>
    <div style={{ width:40, height:22, borderRadius:11, background:enabled?"linear-gradient(135deg,#1E3A5F,#065F46)":"var(--secondary)", position:"relative", cursor:"pointer", flexShrink:0 }}>
      <div style={{ width:16, height:16, borderRadius:"50%", background:"var(--card)", position:"absolute", top:3, left:enabled?21:3, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
    </div>
  </div>
);
const SCard = ({ title, children }: { title:string; children:React.ReactNode }) => (
  <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
    <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}><span style={{ fontSize:13, fontWeight:700, color:NAV }}>{title}</span></div>
    <div style={{ padding:"16px 20px" }}>{children}</div>
  </div>
);
const SaveBtn = ({ label="Save Changes" }: { label?:string }) => (
  <button style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit", marginTop:4 }}>{label}</button>
);

// ── Live-agent detail panel ────────────────────────────────────────────────────
function LiveAgentDetail({ agent, onClose, onViewAssets }: { agent:LiveAgent; onClose:() => void; onViewAssets?:() => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"0 4px" }}>
      <BackBtn onClose={onClose}/>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{agent.id}</span>
              <LiveStatusBadge status={agent.status}/>
              <OsBadgeL os={agent.os}/>
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:NAV, marginBottom:4 }}>{agent.hostname}</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>{agent.ip} · {agent.os}/{agent.arch} · v{agent.version}</div>
          </div>
          <div
            style={{ textAlign:"right", cursor:onViewAssets?"pointer":"default", borderRadius:8, padding:"8px 12px", transition:"background 0.15s", background:"transparent" }}
            onClick={onViewAssets}
            onMouseEnter={e=>{ if (onViewAssets) (e.currentTarget as HTMLDivElement).style.background="var(--secondary)"; }}
            onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background="transparent"; }}
            title={onViewAssets?"View discovered assets":""}
          >
            <div style={{ fontSize:28, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:EME }}>{agent.telemetry.assetsDiscovered.toLocaleString()}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Assets Discovered {onViewAssets && <span style={{ color:BLU }}>→</span>}</div>
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Health Metrics</div>
            {([["CPU",agent.health.cpu],["Memory",agent.health.mem],["Disk",agent.health.disk]] as [string,number][]).map(([lbl,pct]) => (
              <div key={lbl} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:5 }}>
                  <span style={{ color:"var(--foreground)", fontWeight:500 }}>{lbl} Usage</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:pct>70?RED:pct>50?AMB:EME }}>{pct}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"var(--input)" }}>
                  <div style={{ height:"100%", borderRadius:4, background:pct>70?RED:pct>50?AMB:EME, width:`${pct}%` }}/>
                </div>
              </div>
            ))}
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Telemetry</div>
            {([
              ["Events / Hour", agent.telemetry.eventsLastHour.toLocaleString()],
              ["Open Alerts",   String(agent.telemetry.alertsOpen)],
              ["Uptime",        `${Math.round(agent.health.uptime/3600)}h`],
              ["Last Seen",     new Date(agent.lastSeen).toLocaleString()],
              ["Registered",    new Date(agent.registeredAt??agent.lastSeen).toLocaleDateString()],
            ]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #F9F8F6", fontSize:11 }}>
                <span style={{ color:"var(--muted-foreground)" }}>{k}</span>
                <span style={{ color:k==="Open Alerts"&&Number(v)>0?RED:NAV, fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Policy Configuration</div>
            {([
              ["Scan Schedule",          agent.policy.scanSchedule],
              ["Reporting Interval",     `${agent.policy.reportingIntervalSecs}s`],
              ["Max CPU Allowance",      `${agent.policy.maxCpuPct}%`],
              ["Data Types",             agent.policy.dataTypes.join(", ")],
            ]).map(([k,v]) => (
              <div key={k} style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{k}</div>
                <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:NAV }}>{v}</div>
              </div>
            ))}
            <button style={{ marginTop:4, background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit" }}>✎ Edit Policy</button>
          </div>
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12 }}>Tags</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {agent.tags.map(t => <PillL key={t} label={t} color={BLU}/>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SMTP & Notifications Panel ─────────────────────────────────────────────────

function SmtpNotificationsPanel({ apiBase, authHdr }: { apiBase: string; authHdr: () => Record<string, string> }) {
  const [cfg, setCfg] = useState({ host:"", port:587, secure:false, from_address:"", username:"", password:"" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string|null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok:boolean; message:string }|null>(null);
  const [testTo, setTestTo] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}reporting/smtp`, { headers: authHdr() })
      .then(r => r.json())
      .then(d => {
        if (d?.configured) {
          setCfg(prev => ({
            ...prev,
            host: d.host ?? "",
            port: d.port ?? 587,
            secure: !!d.secure,
            from_address: d.from_address ?? "",
            username: d.username ?? "",
          }));
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true); setSaved(false); setSaveErr(null);
    try {
      const r = await fetch(`${apiBase}reporting/smtp`, {
        method: "POST", headers: authHdr(), body: JSON.stringify(cfg),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Save failed");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveErr(err.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  async function sendTest() {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${apiBase}reporting/smtp/test`, {
        method: "POST", headers: authHdr(), body: JSON.stringify({ to: testTo || undefined }),
      });
      const d = await r.json();
      setTestResult({ ok: r.ok, message: d.message ?? d.error ?? "Unknown" });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? "Request failed" });
    } finally { setTesting(false); }
  }

  if (!loaded) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"60px 0", color:"var(--muted-foreground)", fontSize:13 }}>
      Loading SMTP configuration…
    </div>
  );

  const inp: React.CSSProperties = {
    width:"100%", padding:"8px 12px", background:"var(--input)", border:"1px solid var(--border)",
    borderRadius:7, color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none",
    boxSizing:"border-box" as const,
  };
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, display:"block" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* SMTP Configuration */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16 }}>📧</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:NAV }}>SMTP Email Configuration</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Configure outbound email for scheduled reports and alert delivery</div>
          </div>
        </div>
        <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 80px", gap:12 }}>
            <div>
              <label style={lbl}>SMTP Host</label>
              <input style={inp} value={cfg.host} onChange={e => setCfg(p => ({...p, host:e.target.value}))} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label style={lbl}>Port</label>
              <input style={inp} type="number" value={cfg.port} onChange={e => setCfg(p => ({...p, port:Number(e.target.value)}))} placeholder="587" />
            </div>
            <div>
              <label style={lbl}>TLS</label>
              <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:6 }}>
                <div
                  onClick={() => setCfg(p => ({...p, secure:!p.secure}))}
                  style={{ width:42, height:22, borderRadius:11, background:cfg.secure?EME:"var(--input)", border:`1px solid ${cfg.secure?"rgba(52,211,153,0.6)":"var(--border)"}`, position:"relative", cursor:"pointer", transition:"background 0.2s, border-color 0.2s" }}
                >
                  <div style={{ width:16, height:16, borderRadius:"50%", background:"var(--card)", position:"absolute", top:3, left:cfg.secure?21:3, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:cfg.secure?EME:"var(--muted-foreground)" }}>{cfg.secure?"ON":"OFF"}</span>
              </div>
            </div>
          </div>
          <div>
            <label style={lbl}>From Address</label>
            <input style={inp} value={cfg.from_address} onChange={e => setCfg(p => ({...p, from_address:e.target.value}))} placeholder="grc-reports@yourcompany.com" />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label style={lbl}>SMTP Username</label>
              <input style={inp} value={cfg.username} onChange={e => setCfg(p => ({...p, username:e.target.value}))} placeholder="username@yourcompany.com" autoComplete="username" />
            </div>
            <div>
              <label style={lbl}>SMTP Password</label>
              <input style={inp} type="password" value={cfg.password} onChange={e => setCfg(p => ({...p, password:e.target.value}))} placeholder="•••••••••••" autoComplete="new-password" />
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={save} disabled={saving} style={{
              padding:"8px 20px", borderRadius:8, border:"none",
              background:saved?"rgba(52,211,153,0.15)":NAV,
              color:saved?EME:"white", fontWeight:700, fontSize:12, cursor:saving?"default":"pointer",
              fontFamily:"inherit", transition:"background 0.2s", opacity:saving?0.7:1,
            }}>
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save SMTP Settings"}
            </button>
            {saveErr && <span style={{ fontSize:11, color:RED }}>{saveErr}</span>}
            {saved && <span style={{ fontSize:11, color:EME }}>SMTP configuration saved successfully.</span>}
          </div>
        </div>
      </div>

      {/* Test Email */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px" }}>
        <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>Send Test Email</div>
        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:14 }}>Verify your SMTP configuration by sending a test email. Make sure you've saved your settings first.</div>
        <div style={{ display:"flex", gap:10 }}>
          <input style={{...inp, flex:1}} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="recipient@yourcompany.com (leave blank to send to From Address)" />
          <button onClick={sendTest} disabled={testing} style={{
            padding:"8px 16px", borderRadius:8, border:`1px solid rgba(99,179,237,0.4)`,
            background:"rgba(99,179,237,0.08)", color:BLU, fontWeight:700, fontSize:12,
            cursor:testing?"default":"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const, opacity:testing?0.7:1,
          }}>
            {testing ? "Sending…" : "📧 Send Test"}
          </button>
        </div>
        {testResult && (
          <div style={{
            marginTop:12, padding:"10px 14px", borderRadius:8,
            background:testResult.ok?"rgba(52,211,153,0.08)":"rgba(239,68,68,0.08)",
            border:`1px solid ${testResult.ok?"rgba(52,211,153,0.3)":"rgba(239,68,68,0.3)"}`,
            fontSize:12, color:testResult.ok?EME:RED,
          }}>
            {testResult.ok ? "✓ " : "✗ "}{testResult.message}
          </div>
        )}
      </div>

      {/* Alert Preferences */}
      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Alert Preferences</div>
        </div>
        <div style={{ padding:"16px 20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[
            { label:"Critical risk alerts",          sub:"Immediate notification via email",   on:true  },
            { label:"High risk alerts",               sub:"Notification within 1 hour",         on:true  },
            { label:"Compliance deadline reminders",  sub:"7 days and 1 day before deadline",   on:true  },
            { label:"DSAR SLA warnings",              sub:"3 days before SLA breach",            on:true  },
            { label:"Audit schedule reminders",       sub:"14 days before scheduled audit",      on:true  },
            { label:"Weekly risk summary email",      sub:"Every Monday 9am",                    on:true  },
            { label:"Monthly compliance report",      sub:"First Monday of the month",           on:true  },
            { label:"AI vCISO daily digest",          sub:"Summary of AI insights",              on:false },
          ].map(item => (
            <Toggle key={item.label} label={item.label} sub={item.sub} enabled={item.on} />
          ))}
        </div>
        <div style={{ padding:"0 20px 16px" }}>
          <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Alert preferences are saved automatically. Delivery requires SMTP to be configured above.</div>
        </div>
      </div>
    </div>
  );
}

// ── Scheduled Briefings Panel ─────────────────────────────────────────────────

interface BriefingSchedule {
  id: number;
  frequency: string;
  channel: string;
  destination: string;
  label: string;
  period: string;
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
}
interface BriefingHistory {
  id: number;
  channel: string;
  destination: string;
  status: string;
  error: string | null;
  period: string;
  sentAt: string | null;
  createdAt: string;
}

function apiBase() {
  const base = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  return base.replace(/grc-platform\/?$/, "api/");
}
function authHeaders() {
  const token = localStorage.getItem("grc_token") ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function ScheduledBriefingsPanel() {
  const [schedules, setSchedules] = useState<BriefingSchedule[]>([]);
  const [history, setHistory] = useState<BriefingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [histTab, setHistTab] = useState<"schedules"|"history">("schedules");
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState<number|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [success, setSuccess] = useState<string|null>(null);

  const [form, setForm] = useState({
    label: "", frequency: "weekly", channel: "email", destination: "", period: "this quarter",
  });

  const base = apiBase();

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch(`${base}/ai/vciso/briefing/schedules`, { headers: authHeaders() }).then(r => r.ok ? r.json() as Promise<BriefingSchedule[]> : []),
      fetch(`${base}/ai/vciso/briefing/history`, { headers: authHeaders() }).then(r => r.ok ? r.json() as Promise<BriefingHistory[]> : []),
    ]).then(([s, h]) => { setSchedules(s); setHistory(h); }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const showSuccess = (msg: string) => { setSuccess(msg); setError(null); setTimeout(() => setSuccess(null), 4000); };
  const showError = (msg: string) => { setError(msg); setSuccess(null); setTimeout(() => setError(null), 6000); };

  const handleCreate = async () => {
    if (!form.destination.trim()) { showError("Please enter a destination (email or Slack webhook URL)."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${base}/ai/vciso/briefing/schedule`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ frequency: form.frequency, channel: form.channel, destination: form.destination.trim(), label: form.label.trim(), period: form.period }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; showError(d.error ?? "Failed to create schedule"); return; }
      setForm({ label: "", frequency: "weekly", channel: "email", destination: "", period: "this quarter" });
      fetchAll();
      showSuccess("Schedule created — briefings will be delivered automatically.");
    } catch { showError("Network error — please try again."); }
    finally { setSaving(false); }
  };

  const handleToggle = async (s: BriefingSchedule) => {
    try {
      await fetch(`${base}/ai/vciso/briefing/schedule/${s.id}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ active: !s.active }),
      });
      fetchAll();
    } catch { showError("Failed to update schedule."); }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${base}/ai/vciso/briefing/schedule/${id}`, { method: "DELETE", headers: authHeaders() });
      fetchAll();
      showSuccess("Schedule removed.");
    } catch { showError("Failed to delete schedule."); }
  };

  const handleTrigger = async (id: number) => {
    setTriggering(id);
    try {
      const res = await fetch(`${base}/ai/vciso/briefing/schedule/${id}/trigger`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const d = await res.json() as { error?: string }; showError(d.error ?? "Trigger failed"); return; }
      showSuccess("Briefing is being generated and delivered now. Check history in a moment.");
      setTimeout(() => fetchAll(), 4000);
    } catch { showError("Failed to trigger delivery."); }
    finally { setTriggering(null); }
  };

  const freqLabel = (f: string) => f === "daily" ? "Daily" : f === "weekly" ? "Weekly" : "Monthly";
  const chanIcon = (c: string) => c === "slack" ? "💬" : "✉️";
  const statusColor = (s: string) => s === "sent" ? EME : s === "failed" ? RED : AMB;
  const statusBg = (s: string) => s === "sent" ? "rgba(34,197,94,0.08)" : s === "failed" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)";
  const statusBd = (s: string) => s === "sent" ? "#A7F3D0" : s === "failed" ? "#FECACA" : "#FDE68A";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ fontSize:20 }}>🤖</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:NAV }}>Scheduled AI Security Briefings</div>
          <div style={{ fontSize:12, color:"var(--muted-foreground)", marginTop:2 }}>
            Automatically deliver AI-generated board-ready security briefings to email or Slack on your schedule.
          </div>
        </div>
      </div>

      {/* Status banners */}
      {error && (
        <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid #FECACA", borderRadius:8, padding:"10px 14px", fontSize:12, color:RED, fontWeight:600 }}>
          ⚠ {error}
        </div>
      )}
      {success && (
        <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:8, padding:"10px 14px", fontSize:12, color:EME, fontWeight:600 }}>
          ✓ {success}
        </div>
      )}

      {/* Create schedule form */}
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ fontSize:13, fontWeight:800, color:NAV, marginBottom:16 }}>Add New Schedule</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Label (optional)</div>
            <input
              value={form.label}
              onChange={e => setForm(f => ({...f, label: e.target.value}))}
              placeholder="e.g. Board Briefing"
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:12, background:"var(--card)", color:"var(--foreground)", fontFamily:"inherit", boxSizing:"border-box" as const }}
            />
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Frequency</div>
            <select
              value={form.frequency}
              onChange={e => setForm(f => ({...f, frequency: e.target.value}))}
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:12, background:"var(--card)", color:"var(--foreground)", fontFamily:"inherit", cursor:"pointer" }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Channel</div>
            <select
              value={form.channel}
              onChange={e => setForm(f => ({...f, channel: e.target.value}))}
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:12, background:"var(--card)", color:"var(--foreground)", fontFamily:"inherit", cursor:"pointer" }}
            >
              <option value="email">✉️ Email (SendGrid)</option>
              <option value="slack">💬 Slack Webhook</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Period / Context</div>
            <input
              value={form.period}
              onChange={e => setForm(f => ({...f, period: e.target.value}))}
              placeholder="e.g. this quarter"
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:12, background:"var(--card)", color:"var(--foreground)", fontFamily:"inherit", boxSizing:"border-box" as const }}
            />
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>
              {form.channel === "slack" ? "Slack Webhook URL" : "Recipient Email Address"}
            </div>
            <input
              value={form.destination}
              onChange={e => setForm(f => ({...f, destination: e.target.value}))}
              placeholder={form.channel === "slack" ? "https://hooks.slack.com/services/..." : "ciso@company.com"}
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:12, background:"var(--card)", color:"var(--foreground)", fontFamily:"inherit", boxSizing:"border-box" as const }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{ padding:"8px 20px", borderRadius:6, border:"none", background:NAV, color:"var(--card)", fontSize:12, fontWeight:700, cursor:saving?"not-allowed":"pointer", fontFamily:"inherit", opacity:saving?0.7:1, whiteSpace:"nowrap" as const }}
          >
            {saving ? "Creating…" : "+ Add Schedule"}
          </button>
        </div>
        {form.channel === "email" && (
          <div style={{ marginTop:10, fontSize:11, color:"var(--muted-foreground)" }}>
            📧 Email delivery requires <code style={{ fontSize:11, background:"var(--border)", padding:"1px 4px", borderRadius:3 }}>SENDGRID_API_KEY</code> to be set in environment variables.
          </div>
        )}
        {form.channel === "slack" && (
          <div style={{ marginTop:10, fontSize:11, color:"var(--muted-foreground)" }}>
            💬 Create a Slack incoming webhook at <strong>api.slack.com/apps</strong> and paste the URL above.
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:4 }}>
        {(["schedules","history"] as const).map(t => (
          <button key={t} onClick={() => setHistTab(t)} style={{
            padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit",
            fontSize:11, fontWeight:700,
            background: histTab===t ? "rgba(59,130,246,0.15)" : "transparent",
            color: histTab===t ? "#93C5FD" : "var(--muted-foreground)",
          }}>
            {t === "schedules" ? `Active Schedules (${schedules.length})` : `Delivery History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Active Schedules list */}
      {histTab === "schedules" && (
        <div style={card({ padding:"0" })}>
          {loading ? (
            <div style={{ padding:"24px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading schedules…</div>
          ) : schedules.length === 0 ? (
            <div style={{ padding:"32px", textAlign:"center" as const, color:"var(--muted-foreground)" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📅</div>
              <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>No schedules yet</div>
              <div style={{ fontSize:12 }}>Add your first briefing schedule above to start automated deliveries.</div>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Channel","Destination","Frequency","Period","Next Run","Status","Actions"].map(h => (
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom:i<schedules.length-1?"1px solid var(--border)":"none", background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
                    <td style={{ padding:"12px 14px" }}>
                      <span style={{ fontSize:13 }}>{chanIcon(s.channel)}</span>
                      {" "}
                      <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{s.channel.toUpperCase()}</span>
                      {s.label && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{s.label}</div>}
                    </td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:"var(--foreground)", fontFamily:s.channel==="email"?"inherit":"'JetBrains Mono',monospace", wordBreak:"break-all" as const, maxWidth:220 }}>
                      {s.destination}
                    </td>
                    <td style={{ padding:"12px 14px" }}>
                      <PillL label={freqLabel(s.frequency)} color={PRP}/>
                    </td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:"var(--foreground)" }}>{s.period}</td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>
                      {s.active ? new Date(s.nextRunAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding:"12px 14px" }}>
                      <span style={{
                        fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:4,
                        color:s.active?EME:RED, background:s.active?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)",
                        border:`1px solid ${s.active?"#A7F3D0":"#FECACA"}`,
                      }}>{s.active?"ACTIVE":"PAUSED"}</span>
                    </td>
                    <td style={{ padding:"12px 14px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button
                          onClick={() => handleTrigger(s.id)}
                          disabled={triggering === s.id}
                          title="Send now"
                          style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${BLU}`, background:"transparent", color:BLU, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:triggering===s.id?0.6:1 }}
                        >
                          {triggering===s.id ? "Sending…" : "Send Now"}
                        </button>
                        <button
                          onClick={() => handleToggle(s)}
                          style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${s.active?AMB:EME}`, background:"transparent", color:s.active?AMB:EME, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
                        >
                          {s.active ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${RED}`, background:"transparent", color:RED, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Delivery History */}
      {histTab === "history" && (
        <div style={card({ padding:"0" })}>
          {loading ? (
            <div style={{ padding:"24px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading history…</div>
          ) : history.length === 0 ? (
            <div style={{ padding:"32px", textAlign:"center" as const, color:"var(--muted-foreground)" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📬</div>
              <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>No deliveries yet</div>
              <div style={{ fontSize:12 }}>Delivery history will appear here once briefings are sent.</div>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Delivered At","Channel","Destination","Period","Status","Error"].map(h => (
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} style={{ borderBottom:i<history.length-1?"1px solid var(--border)":"none", background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
                    <td style={{ padding:"12px 14px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)" }}>
                      {h.sentAt ? new Date(h.sentAt).toLocaleString() : new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding:"12px 14px" }}>
                      <span style={{ fontSize:13 }}>{chanIcon(h.channel)}</span>
                      {" "}
                      <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{h.channel.toUpperCase()}</span>
                    </td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:"var(--foreground)", wordBreak:"break-all" as const, maxWidth:200 }}>
                      {h.destination}
                    </td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:"var(--foreground)" }}>{h.period}</td>
                    <td style={{ padding:"12px 14px" }}>
                      <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:4, color:statusColor(h.status), background:statusBg(h.status), border:`1px solid ${statusBd(h.status)}` }}>
                        {h.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding:"12px 14px", fontSize:11, color:RED, maxWidth:200, overflow:"hidden" as const, textOverflow:"ellipsis" as const }}>
                      {h.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Info card */}
      <div style={{ background:"linear-gradient(135deg,#EFF6FF,#F0FDF4)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:12, padding:"16px 20px" }}>
        <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>How Scheduled Briefings Work</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {[
            { icon:"🤖", title:"AI Generation", desc:"The AIGO vCISO generates a board-ready security briefing covering risk posture, compliance, findings, and a 90-day action plan." },
            { icon:"📤", title:"Automatic Delivery", desc:"Briefings are sent via SendGrid email or Slack webhook on your chosen schedule — daily, weekly, or monthly." },
            { icon:"📊", title:"Delivery History", desc:"Every delivery attempt is logged with status. Failed deliveries include the error reason so you can fix configuration issues." },
          ].map(item => (
            <div key={item.title} style={{ display:"flex", gap:10 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:3 }}>{item.title}</div>
                <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── API & MCP Access Panel ────────────────────────────────────────────────────

interface McpToken {
  id: number;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

function McpAccessPanel() {
  const base = apiBase();
  const hdrs = () => authHeaders();

  const [tokens, setTokens]         = useState<McpToken[]>([]);
  const [loading, setLoading]        = useState(true);
  const [newName, setNewName]        = useState("");
  const [creating, setCreating]      = useState(false);
  const [rawToken, setRawToken]      = useState<string|null>(null);
  const [copiedId, setCopiedId]      = useState<number|null>(null);
  const [copiedCfg, setCopiedCfg]    = useState<number|null>(null);
  const [error, setError]            = useState<string|null>(null);
  const [success, setSuccess]        = useState<string|null>(null);
  const [auditLog, setAuditLog]      = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [activeTab, setActiveTab]    = useState<"tokens"|"audit">("tokens");

  const platformUrl = (() => {
    const b = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
    const origin = window.location.origin;
    const prefix = b.replace(/\/grc-platform\/?$/, "");
    return `${origin}${prefix}/api/mcp`;
  })();

  const fetchTokens = () => {
    setLoading(true);
    fetch(`${base}/ai-engines/mcp-tokens`, { headers: hdrs() })
      .then(r => r.ok ? r.json() as Promise<McpToken[]> : [])
      .then(d => setTokens(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchAudit = () => {
    setAuditLoading(true);
    fetch(`${base}/mcp/audit`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setAuditLog(d))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => { fetchTokens(); }, []);
  useEffect(() => { if (activeTab === "audit") fetchAudit(); }, [activeTab]);

  const showSuccess = (msg: string) => { setSuccess(msg); setError(null); setTimeout(() => setSuccess(null), 4000); };
  const showError   = (msg: string) => { setError(msg); setSuccess(null); setTimeout(() => setError(null), 6000); };

  const handleCreate = async () => {
    if (!newName.trim()) { showError("Please enter a name for the token."); return; }
    setCreating(true);
    try {
      const res = await fetch(`${base}/ai-engines/mcp-tokens`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ name: newName.trim(), scopes: ["read", "write"] }),
      });
      const data = await res.json() as any;
      if (!res.ok) { showError(data.error ?? "Failed to generate token"); return; }
      setRawToken(data.rawToken);
      setNewName("");
      fetchTokens();
    } catch { showError("Network error — please try again."); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this token? Any AI clients using it will lose access.")) return;
    try {
      const res = await fetch(`${base}/ai-engines/mcp-tokens/${id}`, { method: "DELETE", headers: hdrs() });
      if (!res.ok && res.status !== 204) { showError("Failed to revoke token"); return; }
      showSuccess("Token revoked.");
      fetchTokens();
    } catch { showError("Network error."); }
  };

  const copy = (text: string, id: number, type: "token"|"cfg") => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "token") { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }
      else { setCopiedCfg(id); setTimeout(() => setCopiedCfg(null), 2000); }
    });
  };

  const claudeConfig = (token: string) => JSON.stringify({
    mcpServers: {
      "aigo-x-grc": {
        command: "node",
        args: [
          "/path/to/packages/mcp-server/index.js",
          "--token", token,
          "--url", platformUrl,
        ],
      },
    },
  }, null, 2);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,rgba(30,58,95,0.35),rgba(124,58,237,0.12))", border:"1px solid rgba(124,58,237,0.2)", borderRadius:14, padding:"22px 26px" }}>
        <div style={{ fontSize:18, fontWeight:800, color:NAV, marginBottom:6 }}>🔌 API & MCP Access</div>
        <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:640 }}>
          Generate named MCP tokens so AI clients like <strong>Claude Desktop</strong> and <strong>Cursor</strong> can query your GRC posture, manage risks, and call controls directly.
          Each token is tenant-scoped and every tool call is audit-logged for compliance traceability.
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
          {["list_risks","get_control","ask_vciso","create_ticket","get_compliance_score"].map(t => (
            <span key={t} style={{ fontSize:9, fontWeight:700, color:PRP, background:"rgba(124,58,237,0.08)", border:"1px solid rgba(124,58,237,0.2)", borderRadius:4, padding:"2px 8px", fontFamily:"'JetBrains Mono',monospace" }}>{t}</span>
          ))}
          <span style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", background:"var(--card)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 8px" }}>+15 more tools</span>
        </div>
      </div>

      {/* Inner tabs */}
      <div style={{ display:"flex", gap:4 }}>
        {(["tokens","audit"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding:"6px 16px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit",
            fontSize:11, fontWeight:700, transition:"all 0.15s",
            background: activeTab===t ? "rgba(59,130,246,0.15)" : "transparent",
            color: activeTab===t ? "#93C5FD" : "var(--muted-foreground)",
          }}>
            {t === "tokens" ? "🔑 Tokens" : "📋 Audit Log"}
          </button>
        ))}
      </div>

      {error   && <div style={{ fontSize:12, color:RED, background:"rgba(239,68,68,0.07)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:8, padding:"10px 14px" }}>{error}</div>}
      {success && <div style={{ fontSize:12, color:EME, background:"rgba(34,197,94,0.07)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:8, padding:"10px 14px" }}>{success}</div>}

      {/* ─ Tokens tab ─ */}
      {activeTab === "tokens" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* New token revealed after creation */}
          {rawToken && (
            <div style={{ background:"rgba(6,95,70,0.08)", border:"1px solid #065F46", borderRadius:12, padding:"18px 20px" }}>
              <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:10 }}>✓ Token created — copy it now, it will never be shown again</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input readOnly value={rawToken} style={{ flex:1, background:"rgb(9,12,18)", border:"1px solid #065F46", borderRadius:7, padding:"8px 12px", fontSize:11, color:EME, fontFamily:"'JetBrains Mono',monospace", outline:"none" }}/>
                <button onClick={() => { navigator.clipboard.writeText(rawToken); showSuccess("Token copied!"); }} style={{ padding:"7px 16px", borderRadius:7, border:"1px solid #065F46", background:"rgba(6,95,70,0.15)", fontSize:11, fontWeight:700, color:EME, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>Copy</button>
                <button onClick={() => setRawToken(null)} style={{ padding:"7px 12px", borderRadius:7, border:"1px solid var(--border)", background:"transparent", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
              </div>
              <div style={{ marginTop:12, fontSize:11, fontWeight:700, color:NAV, marginBottom:6 }}>Claude Desktop config snippet:</div>
              <div style={{ position:"relative" as const }}>
                <textarea readOnly value={claudeConfig(rawToken)} rows={10}
                  style={{ width:"100%", background:"rgb(9,12,18)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 12px", fontSize:10, color:"#93C5FD", fontFamily:"'JetBrains Mono',monospace", outline:"none", resize:"none" as const, boxSizing:"border-box" as const }}/>
                <button onClick={() => navigator.clipboard.writeText(claudeConfig(rawToken))}
                  style={{ position:"absolute" as const, top:8, right:8, padding:"4px 10px", borderRadius:5, border:"1px solid rgba(59,130,246,0.3)", background:"rgba(59,130,246,0.12)", fontSize:9, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>
                  Copy config
                </button>
              </div>
              <div style={{ marginTop:10, fontSize:11, color:"var(--muted-foreground)" }}>
                Save this to <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS) or <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows), then restart Claude Desktop.
              </div>
            </div>
          )}

          {/* Generate token form */}
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Generate New Token</div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder='Token name (e.g. "Claude Desktop", "Cursor")'
                style={{ flex:1, background:"var(--input)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }}
              />
              <button onClick={handleCreate} disabled={creating}
                style={{ padding:"8px 20px", borderRadius:8, border:"none", background:NAV, color:"white", fontWeight:700, fontSize:12, cursor:creating?"default":"pointer", fontFamily:"inherit", opacity:creating?0.7:1, whiteSpace:"nowrap" as const }}>
                {creating ? "Generating…" : "Generate Token"}
              </button>
            </div>
          </div>

          {/* Token list */}
          <div style={card({ padding:0, overflow:"hidden" })}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Active Tokens</div>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>{tokens.filter(t => t.isActive).length} active</span>
            </div>
            {loading ? (
              <div style={{ padding:"30px 20px", textAlign:"center" as const, fontSize:12, color:"var(--muted-foreground)" }}>Loading tokens…</div>
            ) : tokens.filter(t => t.isActive).length === 0 ? (
              <div style={{ padding:"30px 20px", textAlign:"center" as const, fontSize:12, color:"var(--muted-foreground)" }}>No tokens yet — generate one above to connect an AI client.</div>
            ) : (
              tokens.filter(t => t.isActive).map(tok => {
                const cfgSnippet = claudeConfig(`${tok.tokenPrefix}••••••`);
                return (
                  <div key={tok.id} style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{tok.name}</span>
                          <span style={{ fontSize:9, fontWeight:700, color:EME, background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:4, padding:"2px 7px" }}>ACTIVE</span>
                        </div>
                        <div style={{ display:"flex", gap:12, fontSize:11, color:"var(--muted-foreground)" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{tok.tokenPrefix}••••••</span>
                          <span>Created {new Date(tok.createdAt).toLocaleDateString()}</span>
                          <span>Last used: {tok.lastUsedAt ? new Date(tok.lastUsedAt).toLocaleString() : "Never"}</span>
                          {tok.expiresAt && <span>Expires: {new Date(tok.expiresAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={() => copy(cfgSnippet, tok.id, "cfg")}
                          style={{ padding:"5px 12px", borderRadius:6, border:"1px solid rgba(59,130,246,0.3)", background:"rgba(59,130,246,0.08)", fontSize:10, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>
                          {copiedCfg===tok.id ? "✓ Copied!" : "📋 Claude Config"}
                        </button>
                        <button onClick={() => handleRevoke(tok.id)}
                          style={{ padding:"5px 12px", borderRadius:6, border:"1px solid rgba(220,38,38,0.3)", background:"rgba(220,38,38,0.06)", fontSize:10, fontWeight:700, color:RED, cursor:"pointer", fontFamily:"inherit" }}>
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Setup guide */}
          <div style={card({ padding:"18px 20px" })}>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Quick Setup Guide</div>
            {[
              { step:"1", title:"Generate a token", desc:"Click \"Generate Token\" above. Copy the token immediately — it's shown only once." },
              { step:"2", title:"Add to Claude Desktop", desc:"Open claude_desktop_config.json and paste the Claude Config snippet. Restart Claude Desktop." },
              { step:"3", title:"Try a prompt", desc:'Ask Claude: "List our top 5 risks" or "What\'s our ISO 27001 compliance score?" or "Ask the vCISO what to prioritise this quarter".' },
            ].map(s => (
              <div key={s.step} style={{ display:"flex", gap:12, marginBottom:14, alignItems:"flex-start" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:`${NAV}18`, border:`1px solid ${NAV}30`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:800, color:NAV }}>{s.step}</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop:6, padding:"10px 14px", background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.2)", borderRadius:8, fontSize:11, color:PRP }}>
              <strong>HTTP endpoint:</strong> <code style={{ fontFamily:"'JetBrains Mono',monospace" }}>{platformUrl}</code>
              <br/><strong>Protocol:</strong> JSON-RPC 2.0 · MCP 2024-11-05 · 22 tools available
            </div>
          </div>
        </div>
      )}

      {/* ─ Audit Log tab ─ */}
      {activeTab === "audit" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Last 100 MCP tool calls for this tenant</div>
            <button onClick={fetchAudit} style={{ padding:"5px 14px", borderRadius:7, border:"1px solid var(--border)", background:"var(--card)", fontSize:11, fontWeight:700, color:"var(--foreground)", cursor:"pointer", fontFamily:"inherit" }}>
              ↻ Refresh
            </button>
          </div>
          <div style={card({ padding:0, overflow:"hidden" })}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr 80px", padding:"10px 18px", background:"var(--muted)", fontSize:9, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, borderBottom:"1px solid var(--border)" }}>
              <span>Tool</span><span>Called At</span><span>Duration</span><span>Token</span><span>Status</span>
            </div>
            {auditLoading ? (
              <div style={{ padding:"30px", textAlign:"center" as const, fontSize:12, color:"var(--muted-foreground)" }}>Loading audit log…</div>
            ) : auditLog.length === 0 ? (
              <div style={{ padding:"30px", textAlign:"center" as const, fontSize:12, color:"var(--muted-foreground)" }}>No tool calls recorded yet. Connect an AI client and start using the tools.</div>
            ) : auditLog.map((row: any) => (
              <div key={row.id} style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 1fr 80px", padding:"10px 18px", borderBottom:"1px solid var(--border)", fontSize:11, alignItems:"center" }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:PRP }}>{row.toolName}</span>
                <span style={{ color:"var(--muted-foreground)" }}>{new Date(row.calledAt).toLocaleString()}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{row.durationMs != null ? `${row.durationMs}ms` : "—"}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{row.tokenId ? `tok:${row.tokenId}` : "JWT"}</span>
                <span style={{ fontSize:9, fontWeight:800, color:row.success?EME:RED, background:row.success?"rgba(34,197,94,0.08)":"rgba(220,38,38,0.06)", border:`1px solid ${row.success?"#A7F3D0":"#FECACA"}`, borderRadius:4, padding:"2px 7px", textAlign:"center" as const }}>
                  {row.success ? "OK" : "ERR"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AD Connectors Panel ───────────────────────────────────────────────────────
function AdConnectorsPanel() {
  const base    = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api/");
  const hdrs    = () => ({ Authorization:`Bearer ${localStorage.getItem("grc_token")??""}`, "Content-Type":"application/json" });
  const relTime = (iso:string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };

  const [agents,  setAgents]  = useState<any[]>([]);
  const [tokens,  setTokens]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [deployOpen, setDeployOpen]     = useState(false);
  const [tokName, setTokName]           = useState("");
  const [tokCreating, setTokCreating]   = useState(false);
  const [rawToken, setRawToken]         = useState<string|null>(null);
  const [tokError, setTokError]         = useState<string|null>(null);
  const [copied, setCopied]             = useState(false);
  const [revoking, setRevoking]         = useState<string|null>(null);
  const [removing, setRemoving]         = useState<number|null>(null);
  const [showTokens, setShowTokens]     = useState(false);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}ad-agents`,        { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${apiBase}ad-agents/tokens`, { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
    ]).then(([a,t])=>{ setAgents(a); setTokens(t); }).finally(()=>setLoading(false));
  };
  useEffect(()=>{ fetchAll(); }, []);

  const genToken = async () => {
    if (!tokName.trim()) { setTokError("Enter a name for this deployment."); return; }
    setTokCreating(true); setTokError(null);
    try {
      const res  = await fetch(`${apiBase}ad-agents/tokens`, { method:"POST", headers:hdrs(), body:JSON.stringify({ name:tokName.trim() }) });
      const data = await res.json();
      if (!res.ok) { setTokError(data.error ?? "Failed to generate token"); return; }
      setRawToken(data.rawToken); setTokName(""); fetchAll();
    } catch { setTokError("Network error."); } finally { setTokCreating(false); }
  };

  const revoke = async (id:string) => {
    if (!confirm("Revoke this token? Agents that haven't enrolled yet won't be able to use it.")) return;
    setRevoking(id);
    try { await fetch(`${apiBase}ad-agents/tokens/${id}`, { method:"DELETE", headers:hdrs() }); fetchAll(); }
    finally { setRevoking(null); }
  };

  const removeAgent = async (id:number) => {
    if (!confirm("Remove this agent record? The agent will stop reporting.")) return;
    setRemoving(id);
    try { await fetch(`${apiBase}ad-agents/${id}`, { method:"DELETE", headers:hdrs() }); fetchAll(); }
    finally { setRemoving(null); }
  };

  const statusColor = (s:string) => s==="online"?EME:s==="stale"?AMB:RED;
  const statusBg    = (s:string) => s==="online"?"rgba(34,197,94,0.08)":s==="stale"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)";
  const statusBd    = (s:string) => s==="online"?"#A7F3D0":s==="stale"?"#FDE68A":"#FECACA";
  const osIcon      = (os:string) => os==="windows"?"🪟":os==="linux"?"🐧":"🖥";

  const online  = agents.filter(a=>a.status==="online").length;
  const stale   = agents.filter(a=>a.status==="stale").length;
  const offline = agents.filter(a=>a.status==="offline").length;

  const expLabel = (iso:string) => { const ms=new Date(iso).getTime()-Date.now(); if(ms<=0) return "Expired"; const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };
  const activeTokens = tokens.filter(t=>t.isActive);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── KPIs ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
        {([
          { label:"Registered",  value:agents.length, color:NAV   },
          { label:"Online",      value:online,         color:EME   },
          { label:"Stale",       value:stale,          color:AMB   },
          { label:"Offline",     value:offline,        color:RED   },
        ] as {label:string;value:number;color:string}[]).map(k=>(
          <div key={k.label} style={card({ padding:"14px 18px", textAlign:"center" })}>
            <div style={{ fontSize:24, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Deploy flow ── */}
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:NAV, marginBottom:4 }}>Deploy AD Connector</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:560, lineHeight:1.6 }}>
              Generate a one-time enrollment token, then run the install command on your Windows Server domain controller.
              The token is valid for <strong>24 hours</strong> and is consumed on first use.
            </div>
          </div>
          <button onClick={()=>setDeployOpen(d=>!d)} style={{
            padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit",
            fontSize:12, fontWeight:800, marginLeft:24, flexShrink:0,
            background:"linear-gradient(135deg,rgba(34,211,238,0.85),rgba(59,130,246,0.85))", color:"#000",
          }}>
            {deployOpen?"▲ Collapse":"＋ Deploy New Connector"}
          </button>
        </div>

        {deployOpen && (
          <div style={{ borderTop:"1px solid var(--border)", paddingTop:16, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input value={tokName} onChange={e=>setTokName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&genToken()}
                placeholder='Deployment name — e.g. "DC01 Prod", "DC02 DR-Site"'
                style={{ flex:1, background:"var(--input)", border:`1px solid ${tokError?"#FECACA":"var(--border)"}`, borderRadius:8, padding:"9px 14px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }} />
              <button onClick={genToken} disabled={tokCreating} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${NAV},${EME})`, color:"white", fontWeight:700, fontSize:12, cursor:tokCreating?"default":"pointer", fontFamily:"inherit", opacity:tokCreating?0.7:1, whiteSpace:"nowrap" as const }}>
                {tokCreating?"Generating…":"Generate Token"}
              </button>
            </div>
            {tokError && <div style={{ fontSize:11, color:RED }}>{tokError}</div>}

            {rawToken && (
              <div style={{ background:"rgba(6,95,70,0.08)", border:"1px solid rgba(6,95,70,0.3)", borderRadius:10, padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ fontSize:12, fontWeight:800, color:EME }}>✓ Token generated — copy it now. It won't be shown again.</div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <input readOnly value={rawToken} style={{ flex:1, background:"rgb(6,20,10)", border:"1px solid #065F46", borderRadius:8, padding:"9px 12px", fontSize:11, color:"#34D399", fontFamily:"'JetBrains Mono',monospace", outline:"none" }} />
                  <button onClick={()=>{ navigator.clipboard.writeText(rawToken); setCopied(true); setTimeout(()=>setCopied(false),2000); }} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid #065F46", background:"rgba(6,95,70,0.2)", fontSize:11, fontWeight:700, color:"#34D399", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>{copied?"✓ Copied!":"Copy"}</button>
                  <button onClick={()=>setRawToken(null)} style={{ padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", fontSize:11, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Windows Server / PowerShell (Recommended)</div>
                    <div style={{ background:"rgb(6,8,14)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#93C5FD", lineHeight:1.9 }}>
                      {"$env:AIGO_AD_TOKEN = \""}{rawToken}{"\""}
                      <br/>{"[Net.ServicePointManager]::SecurityProtocol = 'TLS12'"}
                      <br/>{"Invoke-WebRequest -Uri https://agent.aigo-x.io/install-ad.ps1 -OutFile install-ad.ps1"}
                      <br/>{"& .\\install-ad.ps1"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Linux / Samba DC (curl | bash)</div>
                    <div style={{ background:"rgb(6,8,14)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#93C5FD", lineHeight:1.9 }}>
                      {"export AIGO_AD_TOKEN=\""}{rawToken}{"\""}
                      <br/>{"curl -sSL https://agent.aigo-x.io/install-ad.sh \\"}
                      <br/>{"  | sudo bash"}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>
                  After installation, the agent appears in the <strong>Registered Agents</strong> table below within ~60 seconds.
                  The agent connects outbound on port 443 — no inbound firewall rules required.
                </div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:4 }}>
              {([
                { icon:"⏱", label:"24-hour expiry",   desc:"Generate one when you're ready to enrol — it expires after 24h." },
                { icon:"🔂", label:"Single use",        desc:"Consumed on first registration. Generate a new token per server." },
                { icon:"🔒", label:"Tenant-scoped",     desc:"Tokens are tied to your tenant and report only to your account." },
                { icon:"🌐", label:"Outbound only",     desc:"Agent connects to agent.aigo-x.io:443. No inbound ports needed." },
              ] as {icon:string;label:string;desc:string}[]).map(f=>(
                <div key={f.label} style={{ background:"var(--input)", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:16, marginBottom:4 }}>{f.icon}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:3 }}>{f.label}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Registered agents table ── */}
      <div style={card({ padding:0 })}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Registered Agents</div>
          <button onClick={fetchAll} style={{ background:"none", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>↻ Refresh</button>
        </div>
        {loading ? (
          <div style={{ padding:"32px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading agents…</div>
        ) : agents.length === 0 ? (
          <div style={{ padding:"40px 24px", textAlign:"center" as const }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🖥</div>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:6 }}>No AD connectors registered yet</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:400, margin:"0 auto", lineHeight:1.6 }}>
              Generate a deployment token above and run the install script on your domain controller.
              The agent will appear here once it checks in.
            </div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)" }}>
                {["Hostname","OS","IP Address","Domain","Version","Status","Last Heartbeat","Enrolled","Actions"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a,i)=>(
                <tr key={a.id} style={{ borderBottom:i<agents.length-1?"1px solid var(--border)":"none", background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
                  <td style={{ padding:"11px 14px", fontWeight:700, color:NAV, fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{a.hostname}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--foreground)", fontWeight:600 }}>
                      {osIcon(a.os)} {a.os}
                    </span>
                  </td>
                  <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.ip||"—"}</td>
                  <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.domain||"—"}</td>
                  <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>v{a.version}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <span style={{ fontSize:9, fontWeight:800, color:statusColor(a.status), background:statusBg(a.status), border:`1px solid ${statusBd(a.status)}`, borderRadius:4, padding:"2px 7px" }}>
                      {(a.status as string).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:"11px 14px", color:a.status==="offline"?RED:"var(--muted-foreground)", fontSize:11 }}>{relTime(a.lastHeartbeat)}</td>
                  <td style={{ padding:"11px 14px", color:"var(--muted-foreground)", fontSize:11 }}>{new Date(a.enrolledAt).toLocaleDateString()}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <button onClick={()=>removeAgent(a.id)} disabled={removing===a.id} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${RED}`, background:"transparent", color:RED, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:removing===a.id?0.6:1 }}>
                      {removing===a.id?"Removing…":"Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Enrollment tokens (collapsible) ── */}
      <div style={card({ padding:0 })}>
        <button onClick={()=>setShowTokens(s=>!s)} style={{ width:"100%", padding:"14px 20px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" as const, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAV }}>
            Enrollment Tokens
            {activeTokens.length > 0 && <span style={{ marginLeft:8, fontSize:9, fontWeight:800, color:EME, background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:4, padding:"2px 6px" }}>{activeTokens.length} ACTIVE</span>}
          </div>
          <span style={{ fontSize:12, color:"var(--muted-foreground)" }}>{showTokens?"▲":"▼"}</span>
        </button>
        {showTokens && (
          tokens.length === 0 ? (
            <div style={{ padding:"20px 20px 24px", fontSize:12, color:"var(--muted-foreground)", borderTop:"1px solid var(--border)" }}>No tokens generated yet. Use <strong>Deploy New Connector</strong> above to generate one.</div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11, borderTop:"1px solid var(--border)" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Name","Token Prefix","Created","Expires / Used","Status","Actions"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tokens.map((t,i)=>{
                  const isActive=t.isActive, isUsed=t.used, isExpired=!isActive&&!isUsed;
                  const sc=isActive?EME:isUsed?"var(--muted-foreground)":AMB;
                  const sb=isActive?"rgba(34,197,94,0.08)":isUsed?"rgba(0,0,0,0.04)":"rgba(245,158,11,0.06)";
                  const sd=isActive?"#A7F3D0":isUsed?"var(--border)":"#FDE68A";
                  return (
                    <tr key={t.id} style={{ borderBottom:i<tokens.length-1?"1px solid var(--border)":"none" }}>
                      <td style={{ padding:"10px 14px", fontWeight:700, color:NAV }}>{t.name}</td>
                      <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:isActive?"#34D399":"var(--muted-foreground)" }}>{t.prefix}</td>
                      <td style={{ padding:"10px 14px", color:"var(--muted-foreground)" }}>{relTime(t.createdAt)}</td>
                      <td style={{ padding:"10px 14px" }}>
                        {isUsed?<span style={{ color:"var(--muted-foreground)" }}>Used {relTime(t.usedAt)}{t.usedByHostname?` · ${t.usedByHostname}`:""}</span>
                         :isExpired?<span style={{ color:AMB }}>Expired</span>
                         :<span style={{ color:EME, fontFamily:"'JetBrains Mono',monospace" }}>{expLabel(t.expiresAt)} left</span>}
                      </td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:sc, background:sb, border:`1px solid ${sd}`, borderRadius:4, padding:"2px 7px" }}>{isActive?"ACTIVE":isUsed?"USED":"EXPIRED"}</span></td>
                      <td style={{ padding:"10px 14px" }}>
                        {isActive&&<button onClick={()=>revoke(t.id)} disabled={revoking===t.id} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${RED}`, background:"transparent", color:RED, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:revoking===t.id?0.6:1 }}>{revoking===t.id?"Revoking…":"Revoke"}</button>}
                        {!isActive&&<span style={{ fontSize:10, color:"var(--muted-foreground)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ── Prerequisites info card ── */}
      <div style={card({ padding:"18px 20px" })}>
        <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:12 }}>Prerequisites & Requirements</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {([
            { icon:"🪟", label:"Windows Server 2012 R2+", desc:"Supports Windows Server 2012 R2, 2016, 2019, 2022 and Windows Server Core." },
            { icon:"🐧", label:"Linux / Samba DC",         desc:"Supports Ubuntu 20.04+, RHEL 8+, Debian 11+ with Samba 4.x AD DS." },
            { icon:"🔑", label:"Domain Admin credentials", desc:"The agent service account requires read access to AD objects and the event log." },
            { icon:"🌐", label:"Outbound HTTPS (port 443)", desc:"The agent connects outbound to agent.aigo-x.io on port 443. No inbound rules needed." },
            { icon:"💾", label:"~50 MB disk space",         desc:"The agent binary and local event cache require approximately 50 MB of disk space." },
            { icon:"🔒", label:"TLS 1.2 / 1.3",            desc:"Ensure TLS 1.2 or 1.3 is enabled on the domain controller (required for Windows 2012 R2)." },
          ] as {icon:string;label:string;desc:string}[]).map(f=>(
            <div key={f.label} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:2 }}>{f.label}</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Agent Tokens Panel ────────────────────────────────────────────────────────
function AgentTokensPanel() {
  const [atTokens, setAtTokens]     = useState<any[]>([]);
  const [atLoading, setAtLoading]   = useState(true);
  const [atName, setAtName]         = useState("");
  const [atCreating, setAtCreating] = useState(false);
  const [atRawToken, setAtRawToken] = useState<string|null>(null);
  const [atError, setAtError]       = useState<string|null>(null);
  const [atCopied, setAtCopied]     = useState(false);
  const [atRevoking, setAtRevoking] = useState<string|null>(null);

  const base    = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api/");
  const hdrs    = () => ({ Authorization:`Bearer ${localStorage.getItem("grc_token")??""}`, "Content-Type":"application/json" });

  const fetchTokens = () => {
    setAtLoading(true);
    fetch(`${apiBase}agent-tokens`, { headers:hdrs() })
      .then(r=>r.ok?r.json():[]).then((d:any[])=>setAtTokens(d)).catch(()=>setAtTokens([])).finally(()=>setAtLoading(false));
  };
  useEffect(()=>{ fetchTokens(); }, []);

  const generate = async () => {
    if (!atName.trim()) { setAtError("Enter a name for the token."); return; }
    setAtCreating(true); setAtError(null);
    try {
      const res  = await fetch(`${apiBase}agent-tokens`, { method:"POST", headers:hdrs(), body:JSON.stringify({ name:atName.trim() }) });
      const data = await res.json();
      if (!res.ok) { setAtError(data.error ?? "Failed to generate token"); return; }
      setAtRawToken(data.rawToken); setAtName(""); fetchTokens();
    } catch { setAtError("Network error."); } finally { setAtCreating(false); }
  };

  const revoke = async (id:string) => {
    if (!confirm("Revoke this token? Any agent that hasn't enrolled yet won't be able to use it.")) return;
    setAtRevoking(id);
    try { await fetch(`${apiBase}agent-tokens/${id}`, { method:"DELETE", headers:hdrs() }); fetchTokens(); }
    finally { setAtRevoking(null); }
  };

  const relTime = (iso:string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
  const expLabel = (iso:string) => { const ms=new Date(iso).getTime()-Date.now(); if(ms<=0) return "Expired"; const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };
  const active  = atTokens.filter(t=>t.isActive);
  const expired = atTokens.filter(t=>!t.isActive);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:NAV, marginBottom:4 }}>Agent Enrollment Tokens</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:560, lineHeight:1.6 }}>
              Generate single-use tokens to enrol the AIGO-X agent on new endpoints.
              Each token is valid for <strong>24 hours</strong> and is consumed on first registration.
              Use the token as the <code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, background:"rgba(59,130,246,0.1)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:4, padding:"1px 5px" }}>YOUR_ENROLL_TOKEN</code> value in the install command.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, flexShrink:0, marginLeft:24 }}>
            {([{ label:"Active", value:active.length, color:EME }, { label:"Used", value:atTokens.filter(t=>t.used).length, color:"var(--muted-foreground)" }, { label:"Expired", value:expired.filter(t=>!t.used).length, color:AMB }] as {label:string;value:number;color:string}[]).map(k=>(
              <div key={k.label} style={{ textAlign:"center" as const, padding:"10px 14px", background:"var(--input)", borderRadius:8, minWidth:64 }}>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input value={atName} onChange={e=>setAtName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generate()} placeholder='Token name — e.g. "Windows Fleet Q2", "Linux Batch Mar"'
            style={{ flex:1, background:"var(--input)", border:`1px solid ${atError?"#FECACA":"var(--border)"}`, borderRadius:8, padding:"9px 14px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }} />
          <button onClick={generate} disabled={atCreating} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${NAV},${EME})`, color:"white", fontWeight:700, fontSize:12, cursor:atCreating?"default":"pointer", fontFamily:"inherit", opacity:atCreating?0.7:1, whiteSpace:"nowrap" as const }}>
            {atCreating?"Generating…":"+ Generate Token"}
          </button>
        </div>
        {atError && <div style={{ marginTop:8, fontSize:11, color:RED }}>{atError}</div>}
      </div>
      {atRawToken && (
        <div style={{ background:"rgba(6,95,70,0.08)", border:"1px solid rgba(6,95,70,0.3)", borderRadius:12, padding:"18px 20px" }}>
          <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:10 }}>✓ Token generated — copy it now. It will never be shown again.</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
            <input readOnly value={atRawToken} style={{ flex:1, background:"rgb(6,20,10)", border:"1px solid #065F46", borderRadius:8, padding:"9px 12px", fontSize:11, color:"#34D399", fontFamily:"'JetBrains Mono',monospace", outline:"none" }} />
            <button onClick={()=>{ navigator.clipboard.writeText(atRawToken); setAtCopied(true); setTimeout(()=>setAtCopied(false),2000); }} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid #065F46", background:"rgba(6,95,70,0.2)", fontSize:11, fontWeight:700, color:"#34D399", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>{atCopied?"✓ Copied!":"Copy"}</button>
            <button onClick={()=>setAtRawToken(null)} style={{ padding:"9px 12px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", fontSize:11, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
          </div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.7 }}>Use this token as <code style={{ fontFamily:"'JetBrains Mono',monospace", color:"#34D399", fontSize:11 }}>YOUR_ENROLL_TOKEN</code> in the install command on the <strong>Download</strong> tab. The token expires in 24 hours and is consumed on first use.</div>
        </div>
      )}
      <div style={card({ padding:"0" })}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAV }}>All Tokens</div>
          <button onClick={fetchTokens} style={{ background:"none", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", fontSize:11, fontWeight:700, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>↻ Refresh</button>
        </div>
        {atLoading ? (
          <div style={{ padding:"32px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading tokens…</div>
        ) : atTokens.length===0 ? (
          <div style={{ padding:"40px 24px", textAlign:"center" as const }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🔑</div>
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>No tokens yet</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Generate your first enrollment token above to start enrolling agents.</div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)" }}>
                {["Name","Token Prefix","Created","Expires / Used","Created By","Status","Actions"].map(h=>(
                  <th key={h} style={{ padding:"10px 16px", textAlign:"left" as const, fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {atTokens.map((t,i)=>{
                const isActive=t.isActive, isUsed=t.used, isExpired=!isActive&&!isUsed;
                const sc=isActive?EME:isUsed?"var(--muted-foreground)":AMB;
                const sb=isActive?"rgba(34,197,94,0.08)":isUsed?"rgba(0,0,0,0.04)":"rgba(245,158,11,0.06)";
                const sd=isActive?"#A7F3D0":isUsed?"var(--border)":"#FDE68A";
                return (
                  <tr key={t.id} style={{ borderBottom:i<atTokens.length-1?"1px solid var(--border)":"none", background:i%2===0?"transparent":"rgba(0,0,0,0.01)" }}>
                    <td style={{ padding:"12px 16px", fontWeight:700, color:NAV }}>{t.name}</td>
                    <td style={{ padding:"12px 16px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:isActive?"#34D399":"var(--muted-foreground)" }}>{t.prefix}</td>
                    <td style={{ padding:"12px 16px", color:"var(--muted-foreground)" }}>{relTime(t.createdAt)}</td>
                    <td style={{ padding:"12px 16px" }}>{isUsed?<span style={{ color:"var(--muted-foreground)" }}>Used {relTime(t.usedAt)}{t.usedByHostname?` · ${t.usedByHostname}`:""}</span>:isExpired?<span style={{ color:AMB }}>Expired</span>:<span style={{ color:EME, fontFamily:"'JetBrains Mono',monospace" }}>{expLabel(t.expiresAt)} left</span>}</td>
                    <td style={{ padding:"12px 16px", color:"var(--muted-foreground)", fontSize:10 }}>{t.createdBy}</td>
                    <td style={{ padding:"12px 16px" }}><span style={{ fontSize:9, fontWeight:800, color:sc, background:sb, border:`1px solid ${sd}`, borderRadius:4, padding:"2px 7px" }}>{isActive?"ACTIVE":isUsed?"USED":"EXPIRED"}</span></td>
                    <td style={{ padding:"12px 16px" }}>
                      {isActive&&<button onClick={()=>revoke(t.id)} disabled={atRevoking===t.id} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${RED}`, background:"transparent", color:RED, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:atRevoking===t.id?0.6:1 }}>{atRevoking===t.id?"Revoking…":"Revoke"}</button>}
                      {!isActive&&<span style={{ fontSize:10, color:"var(--muted-foreground)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>How to Use Enrollment Tokens</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Windows / PowerShell</div>
            <div style={{ background:"rgb(6,8,14)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#93C5FD", lineHeight:1.8 }}>
              {"$token = \"<YOUR_ENROLL_TOKEN>\""}<br/>{"Invoke-WebRequest -Uri"}<br/>{"  https://agent.aigo-x.io/install.ps1"}<br/>{"  -OutFile install.ps1"}<br/>{".\\install.ps1 /TOKEN=$token"}
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Linux / macOS / Cloud</div>
            <div style={{ background:"rgb(6,8,14)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#93C5FD", lineHeight:1.8 }}>
              {"export AIGO_TOKEN=\"<YOUR_ENROLL_TOKEN>\""}<br/>{"curl -sSL"}<br/>{"  https://agent.aigo-x.io/install.sh \\"}<br/>{"  | sudo bash"}
            </div>
          </div>
        </div>
        <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          {([{ icon:"⏱", label:"24-hour expiry", desc:"Tokens expire 24h after generation. Generate one when you're ready to enrol." }, { icon:"🔂", label:"Single use", desc:"Each token is consumed on first registration. Generate a new token for each batch." }, { icon:"🔒", label:"Tenant-scoped", desc:"Tokens are tied to your tenant. Agents enrolled with them report only to your account." }, { icon:"📋", label:"Audit logged", desc:"Every token generation, use, and revocation is logged in the audit trail." }] as {icon:string;label:string;desc:string}[]).map(f=>(
            <div key={f.label} style={{ background:"var(--input)", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:18, marginBottom:6 }}>{f.icon}</div>
              <div style={{ fontSize:11, fontWeight:700, color:NAV, marginBottom:4 }}>{f.label}</div>
              <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Browser Extension Panel ───────────────────────────────────────────────────
const EXT_ID = "jnamejbnmghfdlbkenpopondmeaghpl";

function BrowserExtPanel() {
  const [beExts, setBeExts] = useState<any[]>([]);
  const [beEvts, setBeEvts] = useState<any[]>([]);
  const [beStat, setBeStat] = useState<any>({ count:0, activeCount:0, aiToolCount24h:0, shadowItCount24h:0, policyViolations24h:0, managedCount:0 });
  const [beLoad, setBeLoad] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [cfgStatus, setCfgStatus] = useState<"idle"|"ok"|"err">("idle");
  const [urlCopied, setUrlCopied] = useState(false);
  const [tenantApiKey, setTenantApiKey]         = useState("");
  const [tenantKeyRotating, setTenantKeyRotating] = useState(false);
  const [tenantKeyCopied, setTenantKeyCopied]   = useState(false);
  const [sseLive, setSseLive]                   = useState(false);

  const base     = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase  = base.replace(/grc-platform\/?$/, "api/");
  const fullApiUrl = (typeof window !== "undefined" ? window.location.origin : "") + apiBase.replace(/\/$/, "");
  const readToken = () => (typeof window !== "undefined" ? localStorage.getItem("grc_token") : null) ?? "";
  const hdrs     = () => ({ Authorization:`Bearer ${readToken()}`, "Content-Type":"application/json" });

  const fetchTenantKey = () => {
    fetch(`${apiBase}tenant-api-key`, { headers:hdrs() })
      .then(r=>r.ok?r.json():null)
      .then(d => { if (d?.key) setTenantApiKey(d.key); })
      .catch(()=>{});
  };

  const rotateTenantKey = async () => {
    if (!confirm("Rotate the tenant API key? Any previously downloaded agents/extensions will stop reporting until re-downloaded with the new key.")) return;
    setTenantKeyRotating(true);
    try {
      const r = await fetch(`${apiBase}tenant-api-key/rotate`, { method:"POST", headers:hdrs() });
      const d = await r.json();
      if (d?.key) setTenantApiKey(d.key);
    } catch {/* ignore */} finally { setTenantKeyRotating(false); }
  };

  const connectExtension = () => {
    // QC-153-012: use the long-lived tenant API key only — never the expiring
    // session JWT, which would stop reporting within ~15 minutes.
    setCfgStatus("idle");
    if (!tenantApiKey) { setCfgStatus("err"); return; }
    const cr = (window as { chrome?: { runtime?: { sendMessage?: (...a: unknown[]) => void; lastError?: { message: string } } } }).chrome;
    if (!cr?.runtime?.sendMessage) { setCfgStatus("err"); return; }
    try {
      cr.runtime.sendMessage(EXT_ID, { type:"SET_TOKEN", apiBase:fullApiUrl, token:tenantApiKey }, () => {
        setCfgStatus(cr.runtime?.lastError ? "err" : "ok");
      });
    } catch { setCfgStatus("err"); }
  };

  const copyTenantKey = () => { navigator.clipboard?.writeText(tenantApiKey).then(() => { setTenantKeyCopied(true); setTimeout(()=>setTenantKeyCopied(false), 1800); }); };
  const copyUrl   = () => { navigator.clipboard?.writeText(fullApiUrl).then(() => { setUrlCopied(true);  setTimeout(()=>setUrlCopied(false),  1800); }); };

  const fetchAll = (quiet = false) => {
    if (!quiet) setBeLoad(true);
    Promise.all([
      fetch(`${apiBase}browser-agent/extensions`, { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${apiBase}browser-agent/events?limit=100`, { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${apiBase}browser-agent/status`, { headers:hdrs() }).then(r=>r.ok?r.json():{}).catch(()=>({})),
    ]).then(([exts,evts,stat])=>{ setBeExts(exts||[]); setBeEvts(evts||[]); setBeStat(stat||{}); }).finally(()=>{ if (!quiet) setBeLoad(false); });
  };

  useEffect(()=>{
    fetchAll();
    fetchTenantKey();

    // ── SSE real-time feed (QC-153-002 / QC-153-011) ────────────────────────
    // EventSource can't send custom headers, so we exchange the session JWT for
    // a short-lived (2-min) SSE-only token via POST /browser-agent/stream-token,
    // and pass THAT in the query param. The session JWT never appears in a URL.
    // The token is re-read (readToken) and re-exchanged on every connect so an
    // expired/re-issued session JWT is picked up instead of looping 401s.
    let sse: EventSource | null = null;
    let sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchSseToken = async (): Promise<string | null> => {
      const tok = readToken();
      if (!tok) return null;
      try {
        const r = await fetch(`${apiBase}browser-agent/stream-token`, { method:"POST", headers:{ Authorization:`Bearer ${tok}`, "Content-Type":"application/json" } });
        if (!r.ok) return null;
        const d = await r.json() as { token?: string };
        return d.token ?? null;
      } catch { return null; }
    };

    const connectSSE = async () => {
      const sseToken = await fetchSseToken();
      if (!sseToken) {
        // No valid session — polling only; retry SSE later (re-auth may happen).
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(()=>fetchAll(true), 6000);
        sseRetryTimer = setTimeout(connectSSE, 15000);
        return;
      }
      try {
        const sseUrl = `${apiBase}browser-agent/stream?token=${encodeURIComponent(sseToken)}`;
        sse = new EventSource(sseUrl);

        sse.onopen = () => {
          setSseLive(true);
          // SSE is live — slow down the polling safety net to once per 30 s
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(()=>fetchAll(true), 30000);
        };

        sse.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as Record<string, unknown>;
            if (msg.type === "status") {
              // Optimistically update stats, then do a full refresh for events+exts
              setBeStat((s: Record<string, unknown>) => ({ ...s, ...msg }));
              fetchAll(true);
            }
          } catch { /* malformed frame — ignore */ }
        };

        sse.onerror = () => {
          setSseLive(false);
          sse?.close();
          sse = null;
          // Fall back to 6 s polling while SSE is down, retry SSE in 15 s
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(()=>fetchAll(true), 6000);
          sseRetryTimer = setTimeout(connectSSE, 15000);
        };
      } catch {
        // SSE not supported — fall back to polling only
        pollInterval = setInterval(()=>fetchAll(true), 6000);
      }
    };

    connectSSE();
    // Polling safety net while SSE connects (clears once SSE is open)
    pollInterval = setInterval(()=>fetchAll(true), 6000);

    return () => {
      sse?.close();
      if (sseRetryTimer) clearTimeout(sseRetryTimer);
      if (pollInterval) clearInterval(pollInterval);
      setSseLive(false);
    };
  }, []);

  const revExt = (id:string) => {
    if(!confirm("Revoke this browser extension? It will stop reporting.")) return;
    fetch(`${apiBase}browser-agent/extensions/${id}`, { method:"DELETE", headers:hdrs() }).then(()=>fetchAll());
  };

  const relTime = (iso:string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
  const managedPct = beStat.count ? Math.round((beStat.managedCount/beStat.count)*100) : 0;
  const BROW_ICON: Record<string,string> = { Chrome:"bi-browser-chrome", Firefox:"bi-browser-firefox", Edge:"bi-browser-edge", Safari:"bi-browser-safari" };
  const RISK_CLR: Record<string,string>  = { critical:RED, high:AMB, medium:"#6366F1", low:EME };

  const downloadEnterprisePkg = (type: "crx"|"xpi"|"guide") => {
    const contents: Record<string, {name:string;mime:string;body:string}> = {
      crx: {
        name: "aigo-x-browser-extension-v2.4.1-enterprise.crx.readme.txt",
        mime: "text/plain",
        body: `AIGO-X GRC Browser Extension v2.4.1 — Enterprise CRX Package
================================================================
This package is for enterprise GPO / Intune deployment only.
Do NOT load as unpacked extension in developer mode.

Chrome / Edge GPO Deployment (ExtensionInstallForcelist):
  Extension ID : knpgajmkdlbdgaicnnlgphapnelpedmo
  Update URL   : https://extensions.aigo-x.io/update.xml

Chrome Admin Console (Google Workspace):
  1. Admin Console → Devices → Chrome → Apps & extensions
  2. Add by ID: knpgajmkdlbdgaicnnlgphapnelpedmo
  3. Set Installation Policy: Force install

Microsoft Intune (Edge / Chrome):
  1. Apps → All apps → Add → Microsoft Edge add-on
  2. Extension ID: knpgajmkdlbdgaicnnlgphapnelpedmo
  3. Assignment: Required for target devices

GPO Registry Key (Windows):
  HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist
  Value: knpgajmkdlbdgaicnnlgphapnelpedmo;https://extensions.aigo-x.io/update.xml

Managed Storage (pre-configure token without user interaction):
  HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\3rdparty\\extensions
  \\knpgajmkdlbdgaicnnlgphapnelpedmo\\policy
  apiBase  = "https://api.aigo-x.io"
  enforced = true
  logAiTools = true

Contact: enterprise@aigo-x.io · Docs: https://docs.aigo-x.io/browser-extension
`,
      },
      xpi: {
        name: "aigo-x-browser-extension-v2.4.1-firefox.xpi.readme.txt",
        mime: "text/plain",
        body: `AIGO-X GRC Browser Extension v2.4.1 — Firefox Enterprise XPI
=============================================================
Extension ID : aigo-x-grc@aigo-x.io
Version      : 2.4.1
Update URL   : https://extensions.aigo-x.io/firefox/updates.json

Mozilla Enterprise Policy (policies.json):
  {
    "policies": {
      "Extensions": {
        "Install": ["https://extensions.aigo-x.io/firefox/aigo-x-grc-2.4.1.xpi"],
        "Locked": ["aigo-x-grc@aigo-x.io"]
      },
      "3rdparty": {
        "Extensions": {
          "aigo-x-grc@aigo-x.io": {
            "apiBase": "https://api.aigo-x.io",
            "enforced": true,
            "logAiTools": true
          }
        }
      }
    }
  }

Intune (Firefox Enterprise):
  - Deploy policies.json via MDM App Configuration
  - Or use Firefox ESR + ADMX template

Linux location: /etc/firefox/policies/policies.json
Windows location: C:\\Program Files\\Mozilla Firefox\\distribution\\policies.json
macOS location: /Applications/Firefox.app/Contents/Resources/distribution/policies.json

Contact: enterprise@aigo-x.io
`,
      },
      guide: {
        name: "aigo-x-browser-extension-v2.4.1-deployment-guide.txt",
        mime: "text/plain",
        body: `AIGO-X GRC Browser Extension v2.4.1 — Enterprise Deployment Guide
====================================================================
Version : 2.4.1 · Released : 2026-06-01
Support : enterprise@aigo-x.io · Docs: https://docs.aigo-x.io/browser-extension

BROWSER STORE LINKS
  Chrome  : https://chrome.google.com/webstore/detail/aigo-x-grc/knpgajmkdlbdgaicnnlgphapnelpedmo
  Edge    : https://microsoftedge.microsoft.com/addons/detail/aigo-x-grc/knpgajmkdlbdgaicnnlgphapnelpedmo
  Firefox : https://addons.mozilla.org/en-US/firefox/addon/aigo-x-grc/

WHAT IT COLLECTS
  • AI tool visits (ChatGPT, Claude, Gemini, Copilot, Perplexity, etc.)
  • Shadow IT / unapproved SaaS access
  • Policy violations (configurable block/log per category)
  • Browser security posture (extensions, settings)

SILENT ENROLLMENT (no user prompt)
  1. Deploy via GPO / Intune using the Extension ID above
  2. Set managed storage key: apiBase + token
  3. Extension auto-enrolls on first browser launch
  4. Appears in Settings → Agents → Browser Extension within 60 seconds

PRIVACY & COMPLIANCE
  • No personal browsing data stored
  • All data scoped to tenant — zero cross-tenant access
  • SOC 2 Type II certified data pipeline
  • GDPR Article 25 compliant (data minimisation)
  • Configurable retention: 7 / 30 / 90 / 365 days

TAMPER PROTECTION
  • Force-installed via MDM = cannot be disabled/removed by user
  • Chrome: ExtensionInstallForcelist policy
  • Edge: ExtensionInstallForcelist (same as Chrome)
  • Firefox: Extensions.Locked in enterprise policies.json
  • Safari macOS: Apple MDM supervised profile (.mobileconfig)
`,
      },
    };
    const c = contents[type];
    const blob = new Blob([c.body], { type: c.mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = c.name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Download & Install ─────────────────────────────────────────── */}
      <div style={card({ padding:"22px 24px" })}>
        <div style={{ fontSize:14, fontWeight:800, color:NAV, marginBottom:4 }}>Download & Install Browser Extension</div>
        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:18, lineHeight:1.5 }}>
          Install the AIGO-X GRC extension from your browser's official store, or deploy silently
          across your fleet via GPO / Intune using the enterprise packages below.
        </div>

        {/* Enterprise-only notice */}
        <div style={{ marginBottom:10, padding:"10px 14px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.18)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>
          <b style={{ color:"#93C5FD" }}>Enterprise distribution only.</b> The AIGO-X browser agent is not published to public browser stores — it is distributed directly to your devices via GPO, Intune, or manual load. Download the package below and follow the README instructions.
        </div>

        {/* Enrollment connection details */}
        <div style={{ marginBottom:14, padding:"12px 14px", background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.22)", borderRadius:8 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#34D399", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
            <i className="bi bi-plug-fill" /> Extension Enrollment — required after install
          </div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.7 }}>
            After loading the extension, click its icon in the toolbar and fill in both fields:
          </div>
          <div style={{ marginTop:8, display:"flex", flexDirection:"column" as const, gap:6 }}>
            {/* API URL row */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"#94A3B8", width:90, flexShrink:0 }}>API Base URL</span>
              <code style={{ fontSize:11, background:"rgba(0,0,0,0.35)", border:"1px solid var(--border)", borderRadius:5, padding:"3px 8px", color:"#A5F3FC", flex:1, wordBreak:"break-all" as const, fontFamily:"monospace" }}>
                {fullApiUrl}
              </code>
              <button onClick={copyUrl}
                style={{ padding:"3px 10px", borderRadius:5, border:`1px solid ${urlCopied?"rgba(52,211,153,0.5)":"var(--border)"}`, background:urlCopied?"rgba(52,211,153,0.12)":"var(--secondary)", color:urlCopied?EME:"#94A3B8", fontSize:10, cursor:"pointer", fontFamily:"inherit", flexShrink:0, transition:"all 0.15s" }}>
                {urlCopied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            {/* Tenant API Key row — unique per tenant, long-lived */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"#94A3B8", width:90, flexShrink:0 }}>Tenant API Key</span>
              <code style={{ fontSize:11, background:"rgba(0,0,0,0.35)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:5, padding:"3px 8px", color:"#A5F3FC", flex:1, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, maxWidth:320 }}>
                {tenantApiKey
                  ? (showToken ? tenantApiKey : tenantApiKey.slice(0,18) + "••••••••••••••••••••")
                  : <span style={{ color:"#64748B", fontStyle:"italic" }}>Loading…</span>}
              </code>
              {tenantApiKey && (
                <button onClick={() => setShowToken(v => !v)}
                  style={{ padding:"3px 8px", borderRadius:5, border:"1px solid var(--border)", background:"var(--secondary)", color:"#94A3B8", fontSize:10, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
                  {showToken ? "Hide" : "Show"}
                </button>
              )}
              <button onClick={copyTenantKey} disabled={!tenantApiKey}
                style={{ padding:"3px 10px", borderRadius:5, border:`1px solid ${tenantKeyCopied?"rgba(52,211,153,0.5)":"var(--border)"}`, background:tenantKeyCopied?"rgba(52,211,153,0.12)":"var(--secondary)", color:tenantKeyCopied?EME:(tenantApiKey?"#94A3B8":"rgba(148,163,184,0.3)"), fontSize:10, cursor:tenantApiKey?"pointer":"default", fontFamily:"inherit", flexShrink:0, transition:"all 0.15s" }}>
                {tenantKeyCopied ? "✓ Copied" : "Copy"}
              </button>
              <button onClick={rotateTenantKey} disabled={tenantKeyRotating}
                title="Rotate key — previously downloaded packages will need to be re-downloaded"
                style={{ padding:"3px 8px", borderRadius:5, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.06)", color:tenantKeyRotating?"rgba(239,68,68,0.4)":"#F87171", fontSize:10, cursor:tenantKeyRotating?"default":"pointer", fontFamily:"inherit", flexShrink:0 }}>
                {tenantKeyRotating ? "…" : "↻ Rotate"}
              </button>
            </div>
            <div style={{ fontSize:10, color:"#64748B", marginTop:2, paddingLeft:98, lineHeight:1.5 }}>
              This key is <strong style={{ color:"#A5F3FC" }}>unique to your tenant</strong> and embedded in every downloaded package.
              Beacons from agents/extensions are automatically routed to your tenant — no shared tokens.
            </div>
          </div>

          {/* ── One-click Connect button ──────────────────────────────────── */}
          <div style={{ marginTop:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" as const }}>
            <button onClick={connectExtension} disabled={!tenantApiKey}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 18px", borderRadius:8, border:"none", background:tenantApiKey?"#3B82F6":"rgba(59,130,246,0.3)", color:"white", fontSize:12, fontWeight:800, cursor:tenantApiKey?"pointer":"default", fontFamily:"inherit", flexShrink:0 }}>
              <i className="bi bi-plug-fill" />
              Connect Extension Directly
            </button>
            {cfgStatus === "ok" && (
              <span style={{ fontSize:11, color:EME, display:"flex", alignItems:"center", gap:5 }}>
                <i className="bi bi-check-circle-fill" /> Extension configured — reload the extension popup to confirm
              </span>
            )}
            {cfgStatus === "err" && (
              <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5 }}>
                <span style={{ color:AMB }}>⚠ Could not reach the extension directly.</span><br />
                Copy the API URL and Tenant API Key above, open the extension popup, and paste them in.
              </div>
            )}
            {cfgStatus === "idle" && tenantApiKey && (
              <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>
                Works when the extension ID matches the store version. For a locally-loaded (unpacked) extension, use the popup instead.
              </span>
            )}
          </div>
        </div>

        {/* Download extension package buttons */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
          {([
            { name:"Chrome",  icon:"bi-browser-chrome",  color:"#4285F4", browser:"chrome",  badge:"v3.0.0", note:"Manifest V3 · MV3",   steps:["Open chrome://extensions","Enable Developer mode","Click Load unpacked","Select unzipped folder"] },
            { name:"Edge",    icon:"bi-browser-edge",    color:"#0078D4", browser:"edge",    badge:"v3.0.0", note:"Manifest V3 · MV3",   steps:["Open edge://extensions","Enable Developer mode","Click Load unpacked","Select unzipped folder"] },
            { name:"Firefox", icon:"bi-browser-firefox", color:"#FF7139", browser:"firefox", badge:"v3.0.0", note:"Manifest V2 · MV2",   steps:["Open about:debugging","Click Load Temporary Add-on","Select manifest.json","Permanent: use XPI"] },
          ] as {name:string;icon:string;color:string;browser:string;badge:string;note:string;steps:string[]}[]).map(b => {
            const doDownload = async () => {
              // Use the tenant API key (long-lived, tenant-unique) — never the user's expiring JWT
              let _token = tenantApiKey;
              if (!_token) {
                // Fetch fresh in case state hasn't loaded yet
                try {
                  const r = await fetch(`${apiBase}tenant-api-key`, { headers:hdrs() });
                  const d = await r.json();
                  if (d?.key) { _token = d.key; setTenantApiKey(d.key); }
                } catch {/* fallback below */}
              }
              if (!_token) _token = localStorage.getItem("grc_token") ?? "";
              const _apiBase = fullApiUrl;

              // QC-153-014: extension source lives in lib/extension-package.ts.
              // Only the per-tenant secret + apiBase + browser metadata are injected here.
              const files = buildExtensionFiles({
                apiBase: _apiBase,
                token: _token,
                browserName: b.name,
                browserNote: b.note,
                extId: EXT_ID,
                steps: b.steps,
                isFirefox: b.browser === "firefox",
              });

              // Build real ZIP with fflate
              const zipData = zipSync(
                Object.fromEntries(
                  Object.entries(files).map(([name, f]) => [name, strToU8(f.body)])
                )
              );

              // Copy into a fresh ArrayBuffer-backed view so Blob accepts it as a
              // BlobPart across TS lib versions (fflate's Uint8Array<ArrayBufferLike>
              // is not directly assignable to BlobPart under newer DOM typings).
              const blob = new Blob([new Uint8Array(zipData)], { type:"application/zip" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href     = url;
              a.download = `aigo-x-browser-agent-v3.0.0-${b.browser}.zip`;
              document.body.appendChild(a); a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            };
            return (
            <div key={b.name} style={{ border:`1px solid ${b.color}30`, borderRadius:12, padding:"16px 18px", background:`${b.color}08` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <i className={`bi ${b.icon}`} style={{ fontSize:24, color:b.color }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)" }}>{b.name}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{b.note}</div>
                </div>
                <span style={{ marginLeft:"auto", fontSize:9, fontWeight:800, color:EME, background:"rgba(34,197,94,0.1)", border:"1px solid rgba(52,211,153,0.3)", borderRadius:4, padding:"2px 6px" }}>{b.badge}</span>
              </div>
              <ol style={{ margin:"0 0 12px 16px", padding:0, fontSize:10, color:"var(--muted-foreground)", lineHeight:1.8 }}>
                {b.steps.map(s => <li key={s}>{s}</li>)}
              </ol>
              <button onClick={doDownload}
                style={{ width:"100%", padding:"8px", borderRadius:8, border:"none", background:b.color, color:"white", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <i className="bi bi-download" style={{ fontSize:13 }} />
                ↓ Download {b.name} Package
              </button>
            </div>
            );
          })}
        </div>

        {/* Enterprise packages */}
        <div style={{ borderTop:"1px solid var(--border)", paddingTop:16 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.06em", marginBottom:12 }}>Enterprise Deployment Packages</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {([
              { key:"crx" as const,   icon:"bi-filetype-json", color:"#4285F4", title:"Chrome / Edge Enterprise CRX", sub:"Extension ID + GPO / Intune policy guide", badge:"For Windows MDM" },
              { key:"xpi" as const,   icon:"bi-filetype-json", color:"#FF7139", title:"Firefox Enterprise XPI",        sub:"policies.json for silent force-install",   badge:"For Linux / macOS" },
              { key:"guide" as const, icon:"bi-file-text",     color:"#A78BFA", title:"Full Deployment Guide",         sub:"All browsers · MDM · Managed storage",    badge:"PDF / TXT" },
            ]).map(p => (
              <button key={p.key} onClick={() => downloadEnterprisePkg(p.key)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:10, border:"1px solid var(--border)", background:"var(--secondary)", cursor:"pointer", textAlign:"left" as const, fontFamily:"inherit" }}>
                <i className={`bi ${p.icon}`} style={{ fontSize:20, color:p.color, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"var(--foreground)", whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis" }}>{p.title}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{p.sub}</div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, color:p.color, background:`${p.color}12`, border:`1px solid ${p.color}33`, borderRadius:4, padding:"2px 6px", flexShrink:0, whiteSpace:"nowrap" as const }}>{p.badge}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fleet management header ─────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:14, fontWeight:800, color:NAV }}>Browser Extension Fleet Management</div>
            {sseLive
              ? <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:10, background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.3)", fontSize:10, fontWeight:700, color:"#10B981" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#10B981", boxShadow:"0 0 0 2px rgba(16,185,129,.3)", animation:"pulse 1.5s infinite" }} />
                  LIVE
                </span>
              : <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:10, background:"rgba(100,116,139,.1)", border:"1px solid rgba(100,116,139,.2)", fontSize:10, fontWeight:700, color:"#64748B" }}>
                  POLLING
                </span>
            }
          </div>
          <div style={{ fontSize:12, color:"var(--muted-foreground)", marginTop:2 }}>Monitor and manage enrolled browser extensions across your fleet</div>
        </div>
        <button onClick={() => fetchAll()} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", fontSize:12, fontWeight:600, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>
          <i className="bi bi-arrow-clockwise" />Refresh
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
        {([
          { label:"Active Extensions",     value:beLoad?"—":beStat.activeCount??0,          sub:`${beStat.count??0} total`,                                   color:EME,       icon:"bi-browser-chrome" },
          { label:"AI Tool Visits (24h)",   value:beLoad?"—":beStat.aiToolCount24h??0,      sub:"ChatGPT · Claude · Gemini",                                  color:"#818CF8", icon:"bi-robot"           },
          { label:"Shadow IT (24h)",        value:beLoad?"—":beStat.shadowItCount24h??0,    sub:"Unapproved apps detected",                                   color:AMB,       icon:"bi-cloud-slash"     },
          { label:"Policy Violations",      value:beLoad?"—":beStat.policyViolations24h??0, sub:"Blocked / flagged (24h)",                                    color:RED,       icon:"bi-shield-x"        },
          { label:"Managed (Tamper-Proof)", value:beLoad?"—":managedPct+"%",                sub:`${beStat.managedCount??0} of ${beStat.count??0} via policy`, color:"#A78BFA", icon:"bi-lock-fill"       },
        ] as {label:string;value:string|number;sub:string;color:string;icon:string}[]).map(s=>(
          <div key={s.label} style={card({ padding:"14px 16px" })}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{s.label}</div>
              <i className={`bi ${s.icon}`} style={{ fontSize:13, color:s.color }} />
            </div>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={card({ padding:"0" })}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Enrolled Browser Sessions</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Real-time status of all enrolled browser extensions across users &amp; platforms</div>
          </div>
        </div>
        {beLoad ? (
          <div style={{ padding:"40px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading extensions…</div>
        ) : beExts.length===0 ? (
          <div style={{ padding:"48px 24px", textAlign:"center" as const }}>
            <i className="bi bi-browser-chrome" style={{ fontSize:36, color:"var(--muted-foreground)", display:"block", marginBottom:12 }} />
            <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>No browser extensions enrolled yet</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>Use the Download tab to get the enterprise deployment guide and extension package.</div>
          </div>
        ) : (
          <div style={{ overflowX:"auto" as const }}>
            <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Browser","Hostname / User","Platform","Version","Status","Last Seen","Managed","Events","Actions"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left" as const, fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.05em", whiteSpace:"nowrap" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {beExts.map((e:any)=>{
                  const icon=BROW_ICON[e.browser]??"bi-browser-chrome", offline=e.status==="offline";
                  return (
                    <tr key={e.id} style={{ borderBottom:"1px solid var(--border)" }}>
                      <td style={{ padding:"10px 14px" }}><div style={{ display:"flex", alignItems:"center", gap:7 }}><i className={`bi ${icon}`} style={{ fontSize:16, color:offline?"var(--muted-foreground)":"#93C5FD" }} /><span style={{ fontWeight:700, color:"var(--foreground)" }}>{e.browser}</span></div></td>
                      <td style={{ padding:"10px 14px" }}><div style={{ fontWeight:600, color:"var(--foreground)" }}>{e.hostname??e.id.slice(0,8)}</div><div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{e.userLabel??"—"}</div></td>
                      <td style={{ padding:"10px 14px", color:"var(--muted-foreground)" }}>{e.platform}</td>
                      <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>v{e.version}</td>
                      <td style={{ padding:"10px 14px" }}><div style={{ display:"flex", alignItems:"center", gap:6 }}><div style={{ width:7, height:7, borderRadius:"50%", background:e.status==="connected"?"#10B981":e.status==="connecting"?AMB:RED }} /><span style={{ fontWeight:600, color:e.status==="connected"?"#10B981":"var(--muted-foreground)" }}>{e.status}</span></div></td>
                      <td style={{ padding:"10px 14px", color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{relTime(e.lastSeen)}</td>
                      <td style={{ padding:"10px 14px" }}>{e.managedByPolicy?<span style={{ display:"inline-flex", alignItems:"center", gap:4, background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.3)", borderRadius:10, padding:"2px 9px", fontSize:10, fontWeight:700, color:"#A78BFA" }}><i className="bi bi-lock-fill" style={{ fontSize:9 }} />Policy</span>:<span style={{ display:"inline-flex", alignItems:"center", gap:4, background:`${AMB}18`, border:`1px solid ${AMB}44`, borderRadius:10, padding:"2px 9px", fontSize:10, fontWeight:700, color:AMB }}><i className="bi bi-unlock" style={{ fontSize:9 }} />Manual</span>}</td>
                      <td style={{ padding:"10px 14px", fontWeight:700, color:"var(--foreground)" }}>{e.eventCount?.toLocaleString()??0}</td>
                      <td style={{ padding:"10px 14px" }}><button onClick={()=>revExt(e.id)} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${RED}`, background:"transparent", color:RED, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Revoke</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={card({ padding:"0" })}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Recent AI &amp; SaaS Detection Events</div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Last 100 events from all enrolled browsers</div>
        </div>
        {beLoad ? (
          <div style={{ padding:"32px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading events…</div>
        ) : beEvts.length===0 ? (
          <div style={{ padding:"40px 24px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>No events yet — events appear here as users browse.</div>
        ) : (
          <div style={{ overflowX:"auto" as const }}>
            <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Type","App / Service","Domain","Category","Risk","Extension","Time"].map(h=>(
                    <th key={h} style={{ padding:"9px 14px", textAlign:"left" as const, fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {beEvts.slice(0,30).map((e:any)=>{
                  const typeMap: Record<string,[string,string,string]> = { "ai-tool":["rgba(99,102,241,0.15)","rgba(99,102,241,0.35)","#818CF8"], "shadow-it":[`${AMB}20`,`${AMB}50`,AMB], "policy-violation":[`${RED}15`,`${RED}45`,RED], "saas-approved":[`${EME}15`,`${EME}40`,"#34D399"] };
                  const [tbg,tbd,tc]=typeMap[e.type as string]??["var(--secondary)","var(--border)","var(--muted-foreground)"];
                  const extRef=beExts.find((x:any)=>x.id===e.extensionId);
                  return (
                    <tr key={e.id} style={{ borderBottom:"1px solid var(--border)" }}>
                      <td style={{ padding:"8px 14px" }}><span style={{ background:tbg, border:`1px solid ${tbd}`, borderRadius:10, padding:"2px 9px", fontSize:10, fontWeight:700, color:tc, whiteSpace:"nowrap" as const }}>{e.type==="ai-tool"?"🤖 AI Tool":e.type==="shadow-it"?"☁ Shadow IT":e.type==="policy-violation"?"⛔ Blocked":"✓ Approved"}</span></td>
                      <td style={{ padding:"8px 14px", fontWeight:700, color:"var(--foreground)" }}>{e.appName}</td>
                      <td style={{ padding:"8px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{e.domain}</td>
                      <td style={{ padding:"8px 14px", color:"var(--muted-foreground)" }}>{e.category}</td>
                      <td style={{ padding:"8px 14px" }}><span style={{ background:`${RISK_CLR[e.risk]??RED}18`, border:`1px solid ${RISK_CLR[e.risk]??RED}44`, borderRadius:10, padding:"2px 9px", fontSize:10, fontWeight:700, color:RISK_CLR[e.risk]??RED }}>{e.risk}</span></td>
                      <td style={{ padding:"8px 14px" }}>{extRef?<div style={{ display:"flex", alignItems:"center", gap:5 }}><i className={`bi ${BROW_ICON[extRef.browser]??""}`} style={{ fontSize:11, color:"var(--muted-foreground)" }} /><span style={{ color:"var(--muted-foreground)", fontSize:11 }}>{extRef.hostname??extRef.id.slice(0,8)}</span></div>:<span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{e.extensionId?.slice(0,8)}</span>}</td>
                      <td style={{ padding:"8px 14px", color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{relTime(e.ts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>Browser &amp; Platform Support Matrix</div>
        <div style={{ fontSize:12, color:"var(--muted-foreground)", marginBottom:16, lineHeight:1.6 }}>The AIGO-X Browser Extension runs on all major browsers. Tamper-proof enforcement requires enterprise management policy — force-installed extensions cannot be removed by end users.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {([
            { icon:"bi-browser-chrome",  name:"Chrome",       platform:"Windows · macOS · Linux", support:"Full MV3",         tamper:"ExtensionInstallForcelist (Google Admin / GPO / Intune)",     badge:"#10B981", note:"" },
            { icon:"bi-browser-edge",    name:"Edge",         platform:"Windows · macOS · Linux", support:"Full MV3",         tamper:"ExtensionInstallForcelist (Microsoft Intune / Edge Mgmt)",    badge:"#10B981", note:"" },
            { icon:"bi-browser-firefox", name:"Firefox",      platform:"Windows · macOS · Linux", support:"Full MV3",         tamper:"force_installed (Mozilla Enterprise Policy / Intune)",        badge:"#10B981", note:"" },
            { icon:"bi-browser-safari",  name:"Safari macOS", platform:"macOS 12+",               support:"Web Ext (Xcode)",  tamper:"Apple MDM supervised profile (Jamf / Intune)",                badge:AMB,       note:"Requires Xcode 14+ build" },
            { icon:"bi-phone",           name:"Safari iOS",   platform:"iOS 15+ Supervised",      support:"Web Ext (limited)",tamper:"MDM supervised device only — .mobileconfig profile",           badge:AMB,       note:"Supervised MDM required" },
            { icon:"bi-android2",        name:"Android",      platform:"Android 8+ Enterprise",   support:"Native Agent",     tamper:"Intune Managed Config / Android Enterprise Work Profile",     badge:"#6366F1", note:"No browser ext — deploy native AIGO-X Agent via Managed Google Play" },
          ] as {icon:string;name:string;platform:string;support:string;tamper:string;badge:string;note:string}[]).map(p=>(
            <div key={p.name} style={{ border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px", background:"var(--secondary)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <i className={`bi ${p.icon}`} style={{ fontSize:18, color:"#93C5FD" }} />
                <div><div style={{ fontWeight:700, fontSize:12, color:"var(--foreground)" }}>{p.name}</div><div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{p.platform}</div></div>
                <span style={{ marginLeft:"auto", background:`${p.badge}18`, border:`1px solid ${p.badge}44`, borderRadius:10, padding:"2px 8px", fontSize:9, fontWeight:700, color:p.badge }}>{p.support}</span>
              </div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6, marginBottom:p.note?6:0 }}><span style={{ color:"var(--foreground)", fontWeight:700 }}>Tamper-proof: </span>{p.tamper}</div>
              {p.note&&<div style={{ fontSize:10, color:AMB, marginTop:4 }}>⚠ {p.note}</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop:16, background:"rgba(147,197,253,0.06)", border:"1px solid rgba(147,197,253,0.18)", borderRadius:10, padding:"16px 18px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#93C5FD", marginBottom:8 }}>Managed Storage Configuration</div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12, lineHeight:1.7 }}>Pre-configure the extension at deploy time using managed storage. Set these key/value pairs in your MDM app config to auto-enrol without user interaction.</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
            {([
              { k:"apiBase", v:`${window.location.origin}${(import.meta.env.BASE_URL??"/grc-platform/").replace(/\/$/,"")}/api`, desc:"AIGO-X API URL" },
              { k:"enforced", v:"true", desc:"Lock settings (tamper-proof)" },
              { k:"logAiTools", v:"true", desc:"Report AI tool visits" },
            ] as {k:string;v:string;desc:string}[]).map(row=>(
              <div key={row.k} style={{ background:"rgba(0,0,0,0.25)", borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:2 }}>{row.desc}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#93C5FD" }}><span style={{ color:"var(--muted-foreground)" }}>{row.k}: </span>{row.v}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>{
            const _apiBase = `${window.location.origin}${(import.meta.env.BASE_URL??"/grc-platform/").replace(/\/$/,"")}/api`;
            // QC-153-009: embed the long-lived tenant API key (not the expiring
            // session JWT) into the managed config, and warn that it's a secret.
            const _token = tenantApiKey;
            if (!_token) { alert("Tenant API key still loading — please retry in a moment."); return; }
            const cfg = JSON.stringify({ apiBase:_apiBase, token:_token, enforced:true, logAiTools:true, logShadowIt:true, blockAiTools:false, blockShadowIt:false },null,2);
            navigator.clipboard?.writeText(cfg).then(()=>alert("Config JSON (tenant API key) copied to clipboard.\n\n⚠ This contains a secret — paste only into managed-storage policy, never share."));
          }}
            style={{ background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.3)", borderRadius:8, padding:"8px 16px", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>
            <i className="bi bi-clipboard" style={{ marginRight:6 }} />Copy Managed Config JSON (tenant key)
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Embed Package Panel ──────────────────────────────────────────────────────

interface EmbedTokenRecord {
  id: number;
  tenantId: number;
  token: string;
  label: string;
  lastUsedAt: string | null;
  beaconCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── ERMS-FR-065: admin-configurable 5×5 risk scoring panel ───────────────────
type ScoringConfig = {
  likelihoodLabels: string[]; impactLabels: string[];
  likelihoodWeights: number[]; impactWeights: number[];
};
const DEFAULT_SC: ScoringConfig = {
  likelihoodLabels:  ["Remote","Unlikely","Possible","Likely","Probable"],
  impactLabels:      ["Negligible","Low","Medium","High","Extreme"],
  likelihoodWeights: [1, 2, 3, 4, 5],
  impactWeights:     [1, 2, 3, 4, 5],
};
function scoreColor(v: number) {
  if (v >= 20) return "#DC2626";
  if (v >= 15) return "#F97316";
  if (v >= 10) return "#D97706";
  if (v >= 5)  return "#CA8A04";
  return "#059669";
}
function RiskScoringPanel() {
  const base = apiBase();
  const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" });
  const [cfg, setCfg] = React.useState<ScoringConfig>({ ...DEFAULT_SC });
  const [orig, setOrig] = React.useState<ScoringConfig>({ ...DEFAULT_SC });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState("");

  React.useEffect(() => {
    fetch(`${base}risks/scoring-config`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { const v = { likelihoodLabels: d.likelihoodLabels ?? DEFAULT_SC.likelihoodLabels, impactLabels: d.impactLabels ?? DEFAULT_SC.impactLabels, likelihoodWeights: d.likelihoodWeights ?? DEFAULT_SC.likelihoodWeights, impactWeights: d.impactWeights ?? DEFAULT_SC.impactWeights }; setCfg(v); setOrig(v); }
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(orig);
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${base}risks/scoring-config`, { method:"PUT", headers: hdrs(), body: JSON.stringify(cfg) });
      if (r.ok) { const v = await r.json(); const nv = { likelihoodLabels: v.likelihoodLabels, impactLabels: v.impactLabels, likelihoodWeights: v.likelihoodWeights, impactWeights: v.impactWeights }; setOrig(nv); setCfg(nv); setToast("Saved"); setTimeout(() => setToast(""), 2500); }
    } catch { setToast("Error saving"); setTimeout(() => setToast(""), 2500); }
    setSaving(false);
  };
  const reset = () => setCfg({ ...DEFAULT_SC });

  if (loading) return <div style={{ padding:32, textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading…</div>;

  const inp14: React.CSSProperties = { padding:"5px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontFamily:"inherit", fontSize:12, width:"100%" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:960 }}>
      {/* Header */}
      <div style={card({ padding:"18px 24px" })}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:NAV, marginBottom:4 }}>5×5 Risk Scoring Matrix</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)" }}>ERMS-FR-065 — Configure the 5-level likelihood and impact labels and their numeric weights. Changes affect all score computations for new and updated risks.</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {toast && <span style={{ fontSize:11, color:toast==="Saved"?EME:RED, fontWeight:700 }}>{toast}</span>}
            <button onClick={reset} style={{ padding:"7px 14px", borderRadius:6, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Reset Defaults</button>
            <button disabled={!dirty||saving} onClick={save} style={{ padding:"7px 16px", borderRadius:6, border:"none", background:dirty?"#2563EB":"var(--border)", color:"white", fontSize:11, fontWeight:700, cursor:dirty?"pointer":"default", fontFamily:"inherit", opacity:saving?0.7:1 }}>{saving?"Saving…":"Save Changes"}</button>
          </div>
        </div>
      </div>

      {/* Config rows */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* Likelihood */}
        <div style={card({ padding:"18px 20px" })}>
          <div style={{ fontSize:12, fontWeight:800, color:NAV, marginBottom:14 }}>📊 Likelihood Levels</div>
          <div style={{ display:"grid", gap:8 }}>
            {cfg.likelihoodLabels.map((lbl, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"24px 1fr 64px", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textAlign:"center" as const, fontFamily:"'JetBrains Mono',monospace" }}>L{i+1}</span>
                <input style={inp14} value={lbl} onChange={e => setCfg(c => { const ll = [...c.likelihoodLabels]; ll[i] = e.target.value; return { ...c, likelihoodLabels: ll }; })} placeholder={`Level ${i+1} label`} />
                <input type="number" min={1} max={10} style={inp14} value={cfg.likelihoodWeights[i]} onChange={e => setCfg(c => { const lw = [...c.likelihoodWeights]; lw[i] = Number(e.target.value); return { ...c, likelihoodWeights: lw }; })} />
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:10 }}>Labels shown in dropdowns. Weights used in score calculation (Likelihood × Impact × CIA).</div>
        </div>
        {/* Impact */}
        <div style={card({ padding:"18px 20px" })}>
          <div style={{ fontSize:12, fontWeight:800, color:NAV, marginBottom:14 }}>💥 Impact Levels</div>
          <div style={{ display:"grid", gap:8 }}>
            {cfg.impactLabels.map((lbl, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"24px 1fr 64px", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textAlign:"center" as const, fontFamily:"'JetBrains Mono',monospace" }}>I{i+1}</span>
                <input style={inp14} value={lbl} onChange={e => setCfg(c => { const il = [...c.impactLabels]; il[i] = e.target.value; return { ...c, impactLabels: il }; })} placeholder={`Level ${i+1} label`} />
                <input type="number" min={1} max={10} style={inp14} value={cfg.impactWeights[i]} onChange={e => setCfg(c => { const iw = [...c.impactWeights]; iw[i] = Number(e.target.value); return { ...c, impactWeights: iw }; })} />
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:10 }}>Right column = numeric weight (default 1–5). Higher weight = proportionally greater score contribution.</div>
        </div>
      </div>

      {/* Live 5×5 heat matrix preview */}
      <div style={card({ padding:"18px 20px" })}>
        <div style={{ fontSize:12, fontWeight:800, color:NAV, marginBottom:14 }}>🔥 Matrix Preview — Likelihood × Impact</div>
        <div style={{ overflowX:"auto" as const }}>
          <table style={{ borderCollapse:"collapse" as const, fontSize:11 }}>
            <thead>
              <tr>
                <th style={{ width:100, padding:"6px 10px", textAlign:"right" as const, color:"var(--muted-foreground)", fontSize:10, fontWeight:700 }}>Likelihood ↓ / Impact →</th>
                {cfg.impactLabels.map((lbl, j) => (
                  <th key={j} style={{ padding:"6px 12px", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>{lbl}<br/><span style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--foreground)" }}>×{cfg.impactWeights[j]}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cfg.likelihoodLabels.map((rowLbl, i) => (
                <tr key={i}>
                  <td style={{ padding:"6px 10px", textAlign:"right" as const, color:"var(--muted-foreground)", fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>{rowLbl} <span style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--foreground)" }}>×{cfg.likelihoodWeights[i]}</span></td>
                  {cfg.impactLabels.map((_lbl, j) => {
                    const score = cfg.likelihoodWeights[i] * cfg.impactWeights[j];
                    const col = scoreColor(score);
                    return (
                      <td key={j} style={{ padding:"8px 12px", textAlign:"center" as const, background:`${col}18`, border:`1px solid ${col}44`, borderRadius:4, fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:col, minWidth:52 }}>
                        {score}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap" as const }}>
          {[["≥20","Critical","#DC2626"],["15–19","High","#F97316"],["10–14","Medium","#D97706"],["5–9","Elevated","#CA8A04"],["1–4","Low","#059669"]].map(([range,label,col])=>(
            <div key={range} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:col, fontWeight:700 }}>
              <div style={{ width:12, height:12, borderRadius:2, background:`${col}30`, border:`1px solid ${col}66` }}/>
              {range} — {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmbedPackagePanel() {
  const base = apiBase();
  const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" });

  const [rec, setRec]           = useState<EmbedTokenRecord | null>(null);
  const [loading, setLoading]   = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied]     = useState<"token"|"snippet"|"cdn"|null>(null);
  const [error, setError]       = useState<string|null>(null);
  const [success, setSuccess]   = useState<string|null>(null);
  const [showFull, setShowFull] = useState(false);

  const apiOrigin = (() => {
    const b = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
    const prefix = b.replace(/\/grc-platform\/?$/, "");
    return `${window.location.origin}${prefix}`;
  })();

  const scriptUrl = rec ? `${apiOrigin}/api/embed/script.js?token=${rec.token}` : "";

  const snippet = rec ? `<!-- AIGO-X GRC Web Embed — place before </body> -->
<script src="${scriptUrl}" defer></script>` : "";

  const cdnSnippet = rec ? `<!-- AIGO-X GRC Web Embed (async loader) -->
<script>
(function(t){
  var s=document.createElement('script');
  s.src='${apiOrigin}/api/embed/script.js?token='+t;
  s.defer=true;
  document.head.appendChild(s);
})(${JSON.stringify(rec.token)});
</script>` : "";

  function fetch_(path: string, opts?: RequestInit) {
    return fetch(`${base}${path}`, { ...opts, headers: hdrs() });
  }

  function load() {
    setLoading(true);
    fetch_("/embed-tokens/me")
      .then(r => r.ok ? r.json() as Promise<EmbedTokenRecord> : Promise.reject(r.statusText))
      .then(d => setRec(d))
      .catch(() => setError("Could not load embed token"))
      .finally(() => setLoading(false));
  }

  const handleRegenerate = async () => {
    if (!confirm("Regenerate token? The old token will stop working immediately. Update your website embed snippet afterwards.")) return;
    setRotating(true);
    try {
      const res = await fetch_("/embed-tokens/regenerate", { method: "POST" });
      if (!res.ok) { setError("Failed to regenerate token"); return; }
      const d = await res.json() as EmbedTokenRecord;
      setRec(d);
      setShowFull(true);
      setSuccess("Token regenerated — copy your new embed snippet below.");
      setTimeout(() => setSuccess(null), 6000);
    } catch { setError("Network error"); }
    finally { setRotating(false); }
  };

  const copy = (text: string, kind: "token"|"snippet"|"cdn") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  useEffect(() => { load(); }, []);

  const maskedToken = rec
    ? (showFull ? rec.token : rec.token.slice(0, 12) + "••••••••••••••••••••••••••••••••••••••••••••••••")
    : "—";

  const mono: React.CSSProperties = { fontFamily:"'JetBrains Mono',monospace", fontSize:11 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Header */}
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>Web Embed Package</div>
            <div style={{ fontSize:12, color:"var(--muted-foreground)", lineHeight:1.5 }}>
              A lightweight JavaScript agent you embed on your website. It reports browser security
              signals back to AIGO-X GRC and enables real-time compliance posture monitoring.
              Each tenant receives a <b>unique, non-reusable token</b> — no two organisations share the same key.
            </div>
          </div>
          <div style={{ display:"flex", gap:10, flexShrink:0, alignItems:"center" }}>
            {rec && (
              <div style={{ textAlign:"right" as const }}>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:700 }}>BEACONS RECEIVED</div>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:EME }}>{rec.beaconCount.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
        {error && (
          <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid #FECACA", borderRadius:6, fontSize:12, color:RED, marginBottom:12 }}>{error}</div>
        )}
        {success && (
          <div style={{ padding:"8px 12px", background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:6, fontSize:12, color:EME, marginBottom:12 }}>{success}</div>
        )}

        {loading ? (
          <div style={{ padding:"20px 0", textAlign:"center" as const, color:"var(--muted-foreground)", fontSize:12 }}>Loading embed token…</div>
        ) : (
          <>
            {/* Token row */}
            <div style={{ background:"var(--input)", borderRadius:8, padding:"12px 16px", display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", marginBottom:3 }}>EMBED TOKEN (UNIQUE TO THIS TENANT)</div>
                <div style={{ ...mono, color:"var(--foreground)", wordBreak:"break-all" as const }}>{maskedToken}</div>
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={() => setShowFull(f=>!f)} style={{ padding:"5px 10px", borderRadius:5, border:"1px solid var(--border)", background:"var(--card)", fontSize:10, fontWeight:700, cursor:"pointer", color:"var(--foreground)", fontFamily:"inherit" }}>
                  {showFull ? "Hide" : "Reveal"}
                </button>
                {rec && (
                  <button onClick={() => copy(rec.token, "token")} style={{ padding:"5px 10px", borderRadius:5, border:"1px solid var(--border)", background:copied==="token"?EME:"var(--card)", fontSize:10, fontWeight:700, cursor:"pointer", color:copied==="token"?"white":"var(--foreground)", fontFamily:"inherit" }}>
                    {copied==="token" ? "✓ Copied" : "Copy"}
                  </button>
                )}
                <button onClick={handleRegenerate} disabled={rotating} style={{ padding:"5px 10px", borderRadius:5, border:`1px solid ${RED}30`, background:`${RED}08`, fontSize:10, fontWeight:700, cursor:"pointer", color:RED, fontFamily:"inherit", opacity:rotating?0.6:1 }}>
                  {rotating ? "Rotating…" : "⟳ Regenerate"}
                </button>
              </div>
            </div>

            {rec && (
              <div style={{ display:"flex", gap:8, fontSize:11, color:"var(--muted-foreground)" }}>
                <span>Created: <b style={{ color:"var(--foreground)" }}>{new Date(rec.createdAt).toLocaleDateString()}</b></span>
                <span style={{ opacity:0.4 }}>·</span>
                <span>Last active: <b style={{ color:"var(--foreground)" }}>{rec.lastUsedAt ? new Date(rec.lastUsedAt).toLocaleString() : "Never"}</b></span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Script tag snippet */}
      {rec && (
        <div style={card({ padding:"20px 24px" })}>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>Installation — Script Tag</div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12 }}>
            Copy and paste this snippet into your website's HTML, just before the closing <code style={{ background:"var(--input)", padding:"1px 5px", borderRadius:3, ...mono }}>&lt;/body&gt;</code> tag.
          </div>
          <div style={{ position:"relative" as const }}>
            <pre style={{ ...mono, background:"rgb(9,12,18)", border:"1px solid var(--border)", borderRadius:8, padding:"14px 16px", margin:0, overflow:"auto", color:"#93C5FD", lineHeight:1.6, fontSize:11, whiteSpace:"pre-wrap" as const }}>{snippet}</pre>
            <button onClick={() => copy(snippet, "snippet")} style={{ position:"absolute" as const, top:8, right:8, padding:"4px 10px", borderRadius:5, border:"1px solid var(--border)", background:copied==="snippet"?EME:"var(--card)", fontSize:10, fontWeight:700, cursor:"pointer", color:copied==="snippet"?"white":"var(--foreground)", fontFamily:"inherit" }}>
              {copied==="snippet" ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Async loader */}
      {rec && (
        <div style={card({ padding:"20px 24px" })}>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:4 }}>Installation — Async Loader</div>
          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12 }}>
            Alternative snippet that loads the agent without blocking page render. Safe to place in <code style={{ background:"var(--input)", padding:"1px 5px", borderRadius:3, ...mono }}>&lt;head&gt;</code>.
          </div>
          <div style={{ position:"relative" as const }}>
            <pre style={{ ...mono, background:"rgb(9,12,18)", border:"1px solid var(--border)", borderRadius:8, padding:"14px 16px", margin:0, overflow:"auto", color:"#86EFAC", lineHeight:1.6, fontSize:11, whiteSpace:"pre-wrap" as const }}>{cdnSnippet}</pre>
            <button onClick={() => copy(cdnSnippet, "cdn")} style={{ position:"absolute" as const, top:8, right:8, padding:"4px 10px", borderRadius:5, border:"1px solid var(--border)", background:copied==="cdn"?EME:"var(--card)", fontSize:10, fontWeight:700, cursor:"pointer", color:copied==="cdn"?"white":"var(--foreground)", fontFamily:"inherit" }}>
              {copied==="cdn" ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Signal reference */}
      <div style={card({ padding:"20px 24px" })}>
        <div style={{ fontSize:13, fontWeight:800, color:"var(--foreground)", marginBottom:12 }}>Signals Collected</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { icon:"🔒", label:"HTTPS enforcement",    desc:"Detects if page is served over TLS" },
            { icon:"🍪", label:"Cookie policy status",  desc:"Reports cookie enabled/disabled state" },
            { icon:"🛡", label:"Do-Not-Track header",   desc:"Captures DNT preference setting" },
            { icon:"🌍", label:"Timezone & language",   desc:"Geo-compliance signal" },
            { icon:"📐", label:"Screen resolution",     desc:"Device class identification" },
            { icon:"🔐", label:"Storage availability",  desc:"localStorage / sessionStorage access" },
            { icon:"⚙", label:"Service Worker support", desc:"PWA & offline capability indicator" },
            { icon:"⚡", label:"Page load timing",      desc:"Performance compliance signal" },
          ].map(s => (
            <div key={s.label} style={{ display:"flex", gap:10, padding:"10px 12px", background:"var(--input)", borderRadius:8, alignItems:"flex-start" }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{s.label}</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5 }}>
          <b style={{ color:"var(--foreground)" }}>Privacy note:</b> No personally identifiable information is collected.
          Page URLs are recorded for domain-level analysis only. All data is scoped to your tenant and never shared.
        </div>
      </div>
    </div>
  );
}

// ── Hub mini helpers (dark-themed — for Agents overview / live agents tabs) ──────
const HUB_FEED_COLORS: Record<string,string> = {
  complyops:"#8B5CF6", assetops:"#22D3EE", dataops:"#3B82F6", secops:"#F59E0B",
  serviceops:"#10B981", caasm:"#22D3EE", cspm:"#60A5FA", "network-audit":"#F59E0B",
};
const HUB_FEED_LABEL: Record<string,string> = {
  complyops:"ComplyOps", assetops:"AssetOps", dataops:"DataOps", secops:"SecOps",
  serviceops:"ServiceOps", caasm:"AssetOps", cspm:"CloudOps", "network-audit":"SecOps",
};
function relHubTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`;
}
function HubKpi({ label, value, sub, color, icon }: { label:string; value:string|number; sub?:string; color?:string; icon:string }) {
  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <span style={{ fontSize:9, fontWeight:800, letterSpacing:"0.08em", color:"var(--muted-foreground)", textTransform:"uppercase" as const }}>{label}</span>
        <span style={{ fontSize:18 }}>{icon}</span>
      </div>
      <div style={{ fontSize:24, fontWeight:900, color:color??"#22D3EE", fontFamily:"monospace", marginTop:2 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{sub}</div>}
    </div>
  );
}
function HubStatusDot({ status }: { status: string }) {
  const map: Record<string,{dot:string;label:string}> = {
    online:{dot:"#10B981",label:"Online"}, connected:{dot:"#10B981",label:"Connected"},
    offline:{dot:"#EF4444",label:"Offline"}, error:{dot:"#EF4444",label:"Error"},
    stale:{dot:"#EF4444",label:"Stale"}, warning:{dot:"#F59E0B",label:"Warning"},
    partial:{dot:"#F59E0B",label:"Partial"}, available:{dot:"var(--muted-foreground)",label:"Available"},
  };
  const s = map[status] ?? {dot:"var(--muted-foreground)",label:status};
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:s.dot, boxShadow:`0 0 5px ${s.dot}88` }} />
      <span style={{ fontSize:10, fontWeight:800, color:s.dot, letterSpacing:"0.04em" }}>{s.label.toUpperCase()}</span>
    </div>
  );
}
function HubOsBadge({ os }: { os: string }) {
  const m: Record<string,{icon:string;color:string}> = {
    windows:{icon:"⊞",color:"#60A5FA"}, linux:{icon:"⊗",color:"#FCD34D"},
    macos:{icon:"⌘",color:"var(--foreground)"}, mobile:{icon:"⬡",color:"#A78BFA"}, cloud:{icon:"☁",color:"#34D399"},
  };
  const s = m[os] ?? {icon:"?",color:"var(--muted-foreground)"};
  return <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.icon} {os.charAt(0).toUpperCase()+os.slice(1)}</span>;
}
function HubMiniBar({ pct, danger }: { pct: number; danger: boolean }) {
  const color = pct===0?"var(--muted-foreground)":danger?"#F59E0B":"#10B981";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:56, height:4, background:"var(--border)", borderRadius:4 }}>
        <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:color, borderRadius:4 }} />
      </div>
      <span style={{ fontSize:10, fontFamily:"monospace", color, fontWeight:700, width:26 }}>{pct}%</span>
    </div>
  );
}

// ── Deploy Agent Drawer ────────────────────────────────────────────────────────
const DEPLOY_PLATFORMS = [
  { key:"linux",   label:"Linux",        icon:"⊗", color:"#E2A62D", lang:"bash",
    cmd:`# Install AIGO-X Agent on Linux (systemd)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"
VER="2.4.1"
curl -fsSL "https://agents.aigo-x.io/linux/$VER/install.sh" | \\
  sudo bash -s -- --token "$ENROLL_TOKEN" --tags "production,linux"
sudo systemctl enable --now aigo-x-agent
sudo systemctl status aigo-x-agent`,
    steps:["Requires curl + systemd (Ubuntu 20+, RHEL 8+, Debian 11+)","Root/sudo access needed","Runs as unprivileged 'aigo-x' user","Supports x86_64 and arm64"],
  },
  { key:"windows", label:"Windows",      icon:"⊞", color:"#0078D4", lang:"powershell",
    cmd:`# Install AIGO-X Agent on Windows
$token = "YOUR_ENROLL_TOKEN"
$ver   = "2.4.1"
Invoke-WebRequest -Uri "https://agents.aigo-x.io/windows/$ver/aigo-x-agent-setup.exe" -OutFile "$env:TEMP\\aigo-x-setup.exe"
Start-Process "$env:TEMP\\aigo-x-setup.exe" -ArgumentList "/S /TOKEN=$token" -Wait
Start-Service aigo-x-agent`,
    steps:["Run as Administrator","Windows 10/11 or Server 2019+","Service starts automatically on boot","Verify in Agents tab within 30s"],
  },
  { key:"macos",   label:"macOS",        icon:"⌘", color:"#555555", lang:"bash",
    cmd:`# Install AIGO-X Agent on macOS (launchd)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"
VER="2.4.0"
curl -fsSL "https://agents.aigo-x.io/macos/$VER/aigo-x-agent.pkg" -o /tmp/aigo-x-agent.pkg
sudo installer -pkg /tmp/aigo-x-agent.pkg -target /
sudo /Library/AIGO-X/Agent/bin/aigo-x-enroll --token "$ENROLL_TOKEN"
sudo launchctl load /Library/LaunchDaemons/io.aigo-x.agent.plist`,
    steps:["macOS 12 Monterey or later","Universal binary (Intel + Apple Silicon)","Requires Full Disk Access in Privacy Settings","MDM deployment supported via .pkg + config profile"],
  },
  { key:"mobile",  label:"Mobile",       icon:"⬡", color:"#8B5CF6", lang:"text",
    cmd:`# Mobile MDM deployment — no local install required
# Push via your MDM solution:
#   Jamf Pro · Microsoft Intune · Workspace ONE
{
  "enrollmentToken": "YOUR_ENROLL_TOKEN",
  "platform": "mobile",
  "mdmProfile": "aigo-x-mobile-v1.2.mobileconfig",
  "capabilities": ["mdm-compliance","app-inventory","jailbreak-detection"]
}`,
    steps:["iOS 15+ / Android 11+","Push via Jamf, Intune, or Workspace ONE","No user interaction required after MDM push","Jailbreak/root detection runs at enrollment"],
  },
  { key:"cloud",   label:"Cloud",        icon:"☁", color:"#10B981", lang:"bash",
    cmd:`# Deploy AIGO-X Cloud Agent (AWS · GCP · Azure)
ENROLL_TOKEN="YOUR_ENROLL_TOKEN"
# AWS — CloudFormation
aws cloudformation deploy \\
  --template-url https://agents.aigo-x.io/cloud/aws/template.yaml \\
  --stack-name aigo-x-cloud-agent \\
  --parameter-overrides EnrollToken=$ENROLL_TOKEN \\
  --capabilities CAPABILITY_IAM
# GCP — Cloud Run
gcloud run deploy aigo-x-cloud-agent \\
  --image gcr.io/aigo-x/cloud-agent:latest \\
  --set-env-vars ENROLL_TOKEN=$ENROLL_TOKEN`,
    steps:["Agentless cloud-native deployment","Read-only IAM role — no write permissions","Scheduled Lambda/Cloud Function (every 5 min)","Collects config, IAM, networking state"],
  },
  { key:"browser", label:"Browser Ext",  icon:"🌐", color:"#3B82F6", lang:"text",
    cmd:`# AIGO-X Browser Extension — Chrome & Firefox

# Chrome Web Store:
https://chrome.google.com/webstore/detail/aigo-x-agent

# Firefox Add-ons:
https://addons.mozilla.org/en-US/firefox/addon/aigo-x-agent

# Enterprise MSI / GPO deployment:
Settings → Agents → Browser Extension → Download Enterprise Package

Extension ID (Chrome): aigo-x-grc-agent-v2
Extension ID (Firefox): aigo-x-grc@aigo-x.io`,
    steps:["Chrome 100+ or Firefox 105+","Enterprise deployment via GPO or MDM","Shadow IT & AI tool usage monitoring","Policy violations reported in real-time"],
  },
];

// ── SSO & Directory Admin Panel ──────────────────────────────────────────────

interface SsoCfg {
  providerType: string; orgName: string | null; issuerUrl: string | null; clientId: string | null;
  hasClientSecret: boolean; samlEntryPoint: string | null; samlCert: string | null; hasSamlPrivateKey: boolean;
  ldapHost: string | null; ldapPort: number | null; ldapBindDn: string | null; hasLdapPassword: boolean;
  ldapSearchBase: string | null; ldapSearchFilter: string | null; ldapUseTls: boolean;
  groupRoleMappings: Record<string, string>; defaultRole: string;
  enabled: boolean; localLoginEnabled: boolean; syncIntervalHours: number; lastSync: string | null;
}

interface TestStep { label: string; ok: boolean; detail?: string; }

function SsoPanelRoot({ tab, apiBase, authHdr }: { tab: string; apiBase: string; authHdr: () => Record<string,string> }) {
  const [cfg, setCfg]       = useState<SsoCfg | null>(null);
  const [form, setForm]     = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<Array<{email:string;reason:string}>>([]);
  const [auditLog, setAuditLog] = useState<Array<Record<string,unknown>>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [groupRows, setGroupRows] = useState<Array<{group:string;role:string}>>([]);
  const [newGroup, setNewGroup] = useState(""); const [newRole, setNewRole] = useState("compliance_analyst");
  const [now, setNow] = useState(() => Date.now());
  const [ssoSignInPending, setSsoSignInPending] = useState(false);
  const [ssoSignInResult, setSsoSignInResult] = useState<{
    ok: boolean; email?: string; name?: string; role?: string;
    provider?: string; groups?: string[]; error?: string | null;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refreshCfg = () => fetch(`${apiBase}/auth/sso/config`, { headers: authHdr() })
    .then(r => r.ok ? r.json() as Promise<SsoCfg> : Promise.resolve(null))
    .then(d => { if (d) setCfg(d); })
    .catch(() => {});

  useEffect(() => {
    fetch(`${apiBase}/auth/sso/config`, { headers: authHdr() })
      .then(r => r.ok ? r.json() as Promise<SsoCfg> : Promise.resolve(null))
      .then(d => {
        setCfg(d);
        if (d) {
          setForm({
            providerType: d.providerType, orgName: d.orgName ?? "", issuerUrl: d.issuerUrl ?? "",
            clientId: d.clientId ?? "", samlEntryPoint: d.samlEntryPoint ?? "", samlCert: d.samlCert ?? "",
            ldapHost: d.ldapHost ?? "", ldapPort: d.ldapPort ?? "", ldapBindDn: d.ldapBindDn ?? "",
            ldapSearchBase: d.ldapSearchBase ?? "", ldapSearchFilter: d.ldapSearchFilter ?? "",
            ldapUseTls: d.ldapUseTls, defaultRole: d.defaultRole, enabled: d.enabled,
            localLoginEnabled: d.localLoginEnabled, syncIntervalHours: d.syncIntervalHours ?? 6,
          });
          setGroupRows(Object.entries(d.groupRoleMappings ?? {}).map(([group, role]) => ({ group, role })));
        } else {
          setForm({ providerType: "entra", orgName: "", issuerUrl: "", clientId: "", defaultRole: "compliance_analyst", enabled: false, localLoginEnabled: true, syncIntervalHours: 6 });
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "sso-audit") return;
    setAuditLoading(true);
    fetch(`${apiBase}/auth/sso/audit-log?limit=100`, { headers: authHdr() })
      .then(r => r.ok ? r.json() as Promise<Array<Record<string,unknown>>> : Promise.resolve([]))
      .then(rows => { setAuditLog(rows); setAuditLoading(false); })
      .catch(() => setAuditLoading(false));
  }, [tab]);

  // Listen for postMessage results from the SSO dry-run popup window.
  // We validate evt.origin === window.location.origin so spoofed messages
  // from other windows cannot fake a success result in the Settings panel.
  useEffect(() => {
    function onMessage(evt: MessageEvent) {
      if (evt.origin !== window.location.origin) return;
      if (!evt.data || evt.data.type !== "sso_dryrun_result") return;
      setSsoSignInPending(false);
      setSsoSignInResult({
        ok:       !!evt.data.ok,
        email:    evt.data.email   as string | undefined,
        name:     evt.data.name    as string | undefined,
        role:     evt.data.role    as string | undefined,
        provider: evt.data.provider as string | undefined,
        groups:   Array.isArray(evt.data.groups) ? (evt.data.groups as string[]) : undefined,
        error:    evt.data.error   as string | null | undefined,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    const mappings: Record<string,string> = {};
    groupRows.forEach(r => { if (r.group) mappings[r.group] = r.role; });
    await fetch(`${apiBase}/auth/sso/config`, {
      method: "PUT", headers: { ...authHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, groupRoleMappings: mappings }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function runTest() {
    setTesting(true); setTestSteps(null);
    const r = await fetch(`${apiBase}/auth/sso/test`, { method: "POST", headers: authHdr() });
    const j = await r.json() as { steps: TestStep[] };
    setTestSteps(j.steps ?? []); setTesting(false);
  }

  async function runSync() {
    setSyncing(true); setSyncResult(null); setSyncConflicts([]);
    const r = await fetch(`${apiBase}/auth/ldap/sync`, { method: "POST", headers: authHdr() });
    const j = await r.json() as Record<string,unknown>;
    setSyncing(false);
    if (r.ok) {
      const conflicts = Array.isArray(j["conflicts"]) ? j["conflicts"] as Array<{email:string;reason:string}> : [];
      setSyncConflicts(conflicts);
      setSyncResult(`Sync complete: ${j["created"]} created, ${j["enabled"]} re-enabled, ${j["disabled"]} disabled, ${j["updated"]} updated, ${j["errors"] instanceof Array ? (j["errors"] as unknown[]).length : 0} errors`);
      void refreshCfg();
    } else {
      setSyncResult(`Error: ${String(j["error"] ?? "Sync failed")}`);
    }
  }

  function launchSsoTest() {
    if (!cfg?.tenantId) return;
    setSsoSignInPending(true);
    setSsoSignInResult(null);
    // Build the URL using the same origin so the popup lands on the API server
    const initiateUrl = `${window.location.origin}/api/auth/sso/initiate/${cfg.tenantId}?dryRun=true`;
    const popup = window.open(
      initiateUrl,
      "sso_dryrun_popup",
      "width=520,height=640,scrollbars=yes,resizable=yes",
    );
    // If the popup was blocked, surface a hint; the message listener will
    // still fire if the user manually unblocks it.
    if (!popup) {
      setSsoSignInPending(false);
      setSsoSignInResult({ ok: false, error: "popup_blocked" });
    }
  }

  const f = form as Record<string, string | boolean | number | null>;
  const pt = String(f["providerType"] ?? "entra");
  const isLdap = pt === "ldap";
  const isOidc = pt === "oidc" || pt === "entra";
  const isSaml = pt === "saml";

  const fld = (key: string, label: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5 }}>{label}</div>
      <input type={type} value={String(f[key] ?? "")} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph}
        style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }} />
    </div>
  );

  const tog = (key: string, label: string, sub?: string) => {
    const on = !!f[key];
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{sub}</div>}
        </div>
        <button onClick={() => setForm(p => ({ ...p, [key]: !on }))} style={{
          width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
          background: on ? EME : "var(--border)", position: "relative" as const, flexShrink: 0,
        }}>
          <div style={{ position: "absolute" as const, top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "var(--card)", transition: "left 0.2s" }} />
        </button>
      </div>
    );
  };

  if (tab === "sso-audit") {
    return (
      <div style={card({ padding: "20px 24px" })}>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 16 }}>SSO & Directory Audit Log</div>
        {auditLoading ? <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Loading…</div> : (
          auditLog.length === 0 ? <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>No audit events yet. Events are recorded when users sign in via SSO, when LDAP sync runs, and when the configuration is changed.</div> : (
            <div style={{ overflowX: "auto" as const }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Timestamp", "Event", "Actor", "Target Email", "Detail"].map(h => (
                      <th key={h} style={{ textAlign: "left" as const, padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.5px", whiteSpace: "nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" as const }}>{String(row["created_at"] ?? "").slice(0, 19).replace("T", " ")}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(59,130,246,0.10)", color: BLU, borderRadius: 4, padding: "2px 7px", border: "1px solid rgba(59,130,246,0.2)" }}>{String(row["event_type"] ?? "")}</span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>{String(row["actor"] ?? "")}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{String(row["target_email"] ?? "")}</td>
                      <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", maxWidth: 300, overflow: "hidden" as const, textOverflow: "ellipsis" as const, whiteSpace: "nowrap" as const }}>
                        {typeof row["detail"] === "object" ? JSON.stringify(row["detail"]) : String(row["detail"] ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    );
  }

  if (tab === "sso-groupmap") {
    const ROLES = ["super_admin","tenant_admin","admin","ciso","compliance_officer","compliance_analyst","risk_manager","auditor","viewer"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={card({ padding: "20px 24px" })}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 4 }}>AD Group → Platform Role Mapping</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 18, lineHeight: 1.5 }}>
            Map Active Directory security groups to AIGO-X platform roles. Users whose group membership matches will receive the mapped role on their next sign-in.
            If no group matches, users receive the <strong>default role</strong> configured on the Identity Provider tab.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="AD group name (e.g. GRP-GRC-Admins)"
              style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }} />
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => { if (newGroup.trim()) { setGroupRows(p => [...p, { group: newGroup.trim(), role: newRole }]); setNewGroup(""); } }}
              style={{ background: NAV, color: "white", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const }}>
              + Add Mapping
            </button>
          </div>
          {groupRows.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center" as const, color: "var(--muted-foreground)", fontSize: 12, border: "1px dashed var(--border)", borderRadius: 8 }}>
              No group mappings yet. Add a mapping above.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["AD Group Name", "Platform Role", ""].map(h => (
                    <th key={h} style={{ textAlign: "left" as const, padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--foreground)" }}>{row.group}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <select value={row.role} onChange={e => setGroupRows(p => p.map((r, j) => j === i ? { ...r, role: e.target.value } : r))}
                        style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "var(--foreground)", fontFamily: "inherit" }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => setGroupRows(p => p.filter((_, j) => j !== i))}
                        style={{ background: "rgba(239,68,68,0.1)", color: RED, border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <button onClick={save} disabled={saving} style={{
          padding: "11px 0", borderRadius: 9, border: "none", background: saved ? EME : NAV,
          color: "white", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer",
          fontFamily: "inherit", opacity: saving ? 0.7 : 1,
        }}>
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Group Mappings"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card({ padding: "20px 24px" })}>
        <div style={{ fontSize: 14, fontWeight: 800, color: NAV, marginBottom: 4 }}>Identity Provider</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 18 }}>
          Configure how users authenticate. Credentials are stored encrypted (AES-256-GCM) and never exposed in plain text.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 8 }}>Provider Type</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {[
              { key: "entra", label: "Microsoft Entra ID", icon: "🪟" },
              { key: "oidc",  label: "Generic OIDC",       icon: "🔐" },
              { key: "saml",  label: "SAML 2.0",           icon: "📋" },
              { key: "ldap",  label: "LDAP / AD",          icon: "🗂" },
            ].map(p => (
              <button key={p.key} onClick={() => setForm(prev => ({ ...prev, providerType: p.key }))}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${pt === p.key ? NAV : "var(--border)"}`,
                  background: pt === p.key ? "rgba(30,58,95,0.10)" : "var(--card)", color: pt === p.key ? NAV : "var(--muted-foreground)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                }}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>

        {fld("orgName", "Organisation Name", "text", "Bank of Uganda")}

        {isOidc && (
          <>
            {pt === "entra" && (
              <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: BLU, marginBottom: 4 }}>Microsoft Entra ID (Azure AD)</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Set Issuer URL to <code style={{ fontFamily: "'JetBrains Mono',monospace" }}>https://login.microsoftonline.com/&#123;tenant-id&#125;/v2.0</code>. Register the platform as an app in Entra portal and copy the Application (client) ID and secret below.
                </div>
              </div>
            )}
            {fld("issuerUrl", "Issuer / Authority URL", "url", "https://login.microsoftonline.com/{tenant-id}/v2.0")}
            {fld("clientId", "Client ID / Application ID", "text", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5 }}>
                Client Secret {cfg?.hasClientSecret && <span style={{ color: EME, fontWeight: 600 }}>● Configured</span>}
              </div>
              <input type="password" value={String(f["clientSecret"] ?? "")} onChange={e => setForm(p => ({ ...p, clientSecret: e.target.value }))}
                placeholder={cfg?.hasClientSecret ? "Leave blank to keep existing secret" : "Paste client secret…"}
                style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }} />
            </div>

            {/* OIDC redirect URI — paste this into Azure App Registration / IdP */}
            <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#34D399", marginBottom: 4 }}>Redirect URI to register in your IdP</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6, lineHeight: 1.5 }}>
                Copy this URL into your Azure App Registration (Authentication → Redirect URIs) or equivalent IdP configuration:
              </div>
              <code style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "var(--foreground)", wordBreak: "break-all" as const }}>
                {`${window.location.origin}/api/auth/sso/callback/oidc`}
              </code>
            </div>
          </>
        )}

        {isSaml && (
          <>
            {fld("samlEntryPoint", "IdP Entry Point / SSO URL", "url", "https://idp.example.com/saml2/sso")}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5 }}>IdP Certificate (PEM)</div>
              <textarea value={String(f["samlCert"] ?? "")} onChange={e => setForm(p => ({ ...p, samlCert: e.target.value }))}
                rows={5} placeholder={"-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"}
                style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 11, color: "var(--foreground)", fontFamily: "'JetBrains Mono',monospace", outline: "none", resize: "vertical" as const }} />
            </div>
            <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: EME, marginBottom: 4 }}>SP Metadata Endpoint</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono',monospace" }}>/api/auth/sso/metadata/{"{tenantId}"}</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>ACS URL: <code style={{ fontFamily: "'JetBrains Mono',monospace" }}>/api/auth/sso/callback/saml</code></div>
            </div>
          </>
        )}

        {isLdap && (
          <>
            {fld("ldapHost", "LDAP / AD Server Host", "text", "ad.bankofuganda.go.ug")}
            {fld("ldapPort", "Port", "number", "389 (LDAP) or 636 (LDAPS)")}
            {fld("ldapBindDn", "Service Account Bind DN", "text", "CN=svc-grc,OU=Service Accounts,DC=bankofuganda,DC=go,DC=ug")}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5 }}>
                Bind Password {cfg?.hasLdapPassword && <span style={{ color: EME, fontWeight: 600 }}>● Configured</span>}
              </div>
              <input type="password" value={String(f["ldapBindPassword"] ?? "")} onChange={e => setForm(p => ({ ...p, ldapBindPassword: e.target.value }))}
                placeholder={cfg?.hasLdapPassword ? "Leave blank to keep existing" : "Service account password"}
                style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }} />
            </div>
            {fld("ldapSearchBase", "Search Base DN", "text", "OU=Users,DC=bankofuganda,DC=go,DC=ug")}
            {fld("ldapSearchFilter", "Search Filter (optional)", "text", "(&(objectClass=person)(mail=*))")}
            {tog("ldapUseTls", "Use LDAPS / TLS", "Recommended for production — uses port 636 by default")}
          </>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.4px", marginBottom: 5 }}>Default Role for New SSO Users</div>
          <select value={String(f["defaultRole"] ?? "compliance_analyst")} onChange={e => setForm(p => ({ ...p, defaultRole: e.target.value }))}
            style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "var(--foreground)", fontFamily: "inherit", outline: "none" }}>
            {["super_admin","tenant_admin","admin","ciso","compliance_officer","compliance_analyst","risk_manager","auditor","viewer"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {tog("enabled", "Enable SSO for this tenant", "When enabled, a Sign in with [Org] button appears on the login page")}
        {tog("localLoginEnabled", "Also allow username/password login", "If disabled, users can only sign in via the SSO provider")}
        {isLdap && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>
              Automatic Sync Interval (hours)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <input
                type="number" min={1} max={168}
                value={String(f["syncIntervalHours"] ?? 6)}
                onChange={e => setForm(p => ({ ...p, syncIntervalHours: Math.max(1, parseInt(e.target.value) || 6) }))}
                style={{ width: 80, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "var(--foreground)", fontSize: 13, fontFamily: "inherit" }}
              />
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                hours between automatic syncs (scheduler polls every 60 s)
              </span>
            </div>
            {(() => {
              const lastSyncMs  = cfg?.lastSync ? new Date(cfg.lastSync).getTime() : null;
              const intervalMs  = Math.max(1, Number(f["syncIntervalHours"] ?? cfg?.syncIntervalHours ?? 6)) * 3600_000;
              const nextSyncMs  = lastSyncMs ? lastSyncMs + intervalMs : null;
              const msUntilNext = nextSyncMs ? nextSyncMs - now : null;

              const fmtRelative = (ms: number) => {
                const totalMin = Math.round(ms / 60_000);
                if (totalMin <= 1)  return "less than a minute";
                if (totalMin < 60) return `${totalMin} min`;
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                return m > 0 ? `${h} h ${m} min` : `${h} h`;
              };

              const overdue = msUntilNext !== null && msUntilNext < 0;

              return (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>
                  <div style={{ flex: 1, minWidth: 160, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "var(--muted-foreground)", marginBottom: 4 }}>Last Sync</div>
                    {lastSyncMs ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{new Date(lastSyncMs).toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{fmtRelative(now - lastSyncMs)} ago</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Not yet synced</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 160, padding: "10px 14px", borderRadius: 8, background: overdue ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.04)", border: overdue ? "1px solid rgba(34,197,94,0.25)" : "1px solid var(--border)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "var(--muted-foreground)", marginBottom: 4 }}>Next Scheduled Sync</div>
                    {nextSyncMs ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: overdue ? EME : "var(--foreground)" }}>
                          {overdue ? "▶ Due now" : `In ${fmtRelative(msUntilNext!)}`}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{new Date(nextSyncMs).toLocaleString()}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Syncs on first save & enable</div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div style={card({ padding: "20px 24px" })}>
        <div style={{ fontSize: 13, fontWeight: 800, color: NAV, marginBottom: 4 }}>Connection Test</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
          <strong>Test Connection</strong> checks OIDC discovery and configuration.
          {(isOidc || isSaml) && cfg?.tenantId && (
            <> <strong>Test sign-in</strong> opens a popup that runs the full IdP redirect → code exchange → user-info round-trip without provisioning any account.</>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: testSteps || ssoSignInResult ? 14 : 0, flexWrap: "wrap" as const }}>
          <button onClick={runTest} disabled={testing} style={{
            padding: "9px 20px", borderRadius: 8, border: "none", background: BLU, color: "white",
            fontWeight: 700, fontSize: 12, cursor: testing ? "default" : "pointer", fontFamily: "inherit", opacity: testing ? 0.7 : 1,
          }}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          {(isOidc || isSaml) && cfg?.tenantId && (
            <button onClick={launchSsoTest} disabled={ssoSignInPending} style={{
              padding: "9px 20px", borderRadius: 8, border: `1px solid ${NAV}`, background: "transparent", color: NAV,
              fontWeight: 700, fontSize: 12, cursor: ssoSignInPending ? "default" : "pointer", fontFamily: "inherit",
              opacity: ssoSignInPending ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6,
            }}>
              {ssoSignInPending ? "⏳ Waiting for sign-in…" : "🔐 Test sign-in"}
            </button>
          )}
          {isLdap && cfg?.enabled && (
            <button onClick={runSync} disabled={syncing} style={{
              padding: "9px 20px", borderRadius: 8, border: "none", background: EME, color: "white",
              fontWeight: 700, fontSize: 12, cursor: syncing ? "default" : "pointer", fontFamily: "inherit", opacity: syncing ? 0.7 : 1,
            }}>
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          )}
        </div>

        {ssoSignInResult && (
          <div style={{
            marginBottom: 14, padding: "12px 16px", borderRadius: 8,
            background: ssoSignInResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${ssoSignInResult.ok ? "#A7F3D0" : "#FECACA"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ssoSignInResult.ok ? 8 : 0 }}>
              <span style={{ fontSize: 16 }}>{ssoSignInResult.ok ? "✅" : "❌"}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: ssoSignInResult.ok ? EME : RED }}>
                {ssoSignInResult.ok ? "Sign-in test passed — full round-trip verified" : (
                  ssoSignInResult.error === "popup_blocked"
                    ? "Popup blocked — allow popups for this site and try again"
                    : `Sign-in test failed${ssoSignInResult.error ? ` (${ssoSignInResult.error})` : ""}`
                )}
              </span>
            </div>
            {ssoSignInResult.ok && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, paddingLeft: 24 }}>
                {ssoSignInResult.email && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    <span style={{ fontWeight: 700, color: "var(--foreground)" }}>Identity: </span>
                    {ssoSignInResult.name && ssoSignInResult.name !== ssoSignInResult.email
                      ? `${ssoSignInResult.name} (${ssoSignInResult.email})`
                      : ssoSignInResult.email}
                  </div>
                )}
                {ssoSignInResult.role && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    <span style={{ fontWeight: 700, color: "var(--foreground)" }}>Projected role: </span>
                    {ssoSignInResult.role}
                  </div>
                )}
                {ssoSignInResult.groups && ssoSignInResult.groups.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                    <span style={{ fontWeight: 700, color: "var(--foreground)" }}>Groups: </span>
                    {ssoSignInResult.groups.join(", ")}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, fontStyle: "italic" }}>
                  No account was provisioned — this was a read-only diagnostic run.
                </div>
              </div>
            )}
          </div>
        )}
        {syncResult && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: syncResult.startsWith("Error") ? RED : EME, fontWeight: 600 }}>{syncResult}</div>
          </div>
        )}
        {syncConflicts.length > 0 && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: AMB, marginBottom: 8 }}>⚠ {syncConflicts.length} Provisioning Conflict{syncConflicts.length > 1 ? "s" : ""} — Manual Resolution Required</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {syncConflicts.map((c, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", display: "flex", gap: 8 }}>
                  <span style={{ color: AMB }}>•</span>
                  <span style={{ color: "var(--foreground)" }}>{c.email}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>— {c.reason}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
              These users exist in another tenant or have conflicting records. Remove the conflicting account or contact your platform administrator to resolve.
            </div>
          </div>
        )}
        {testSteps && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {testSteps.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, background: s.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${s.ok ? "#A7F3D0" : "#FECACA"}` }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{s.ok ? "✅" : "❌"}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.ok ? EME : RED }}>{s.label}</div>
                  {s.detail && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{s.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={save} disabled={saving} style={{
        padding: "11px 0", borderRadius: 9, border: "none", background: saved ? EME : NAV,
        color: "white", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer",
        fontFamily: "inherit", opacity: saving ? 0.7 : 1,
      }}>
        {saving ? "Saving…" : saved ? "✓ Saved!" : "Save SSO Configuration"}
      </button>
    </div>
  );
}

function AgentDeployDrawer({ onClose }: { onClose: () => void }) {
  const [activePlatform, setActivePlatform] = useState(DEPLOY_PLATFORMS[0].key);
  const [copied, setCopied] = useState(false);
  const platform = DEPLOY_PLATFORMS.find(p => p.key === activePlatform) ?? DEPLOY_PLATFORMS[0];
  const copy = () => { navigator.clipboard.writeText(platform.cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <AppModal
      open={true}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Deploy Agent"
      description="Platform-specific install guide + browser extensions"
      size="xl"
    >
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid rgba(255,255,255,0.10)", padding:"0 24px", flexShrink:0, overflowX:"auto" }}>
          {DEPLOY_PLATFORMS.map(p => (
            <button key={p.key} onClick={() => { setActivePlatform(p.key); setCopied(false); }} style={{
              padding:"10px 12px", fontSize:11, fontWeight:700, cursor:"pointer", background:"none", border:"none",
              borderBottom:`2px solid ${activePlatform===p.key ? p.color : "transparent"}`,
              color:activePlatform===p.key ? p.color : "rgba(255,255,255,0.55)",
              transition:"all 0.15s", fontFamily:"inherit", whiteSpace:"nowrap" as const,
            }}>{p.icon} {p.label}</button>
          ))}
        </div>
        <AppModalBody style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:10 }}>Prerequisites</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {platform.steps.map((s, i) => (
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:`${platform.color}22`, border:`1px solid ${platform.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:platform.color, flexShrink:0, marginTop:1 }}>{i+1}</div>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.7)", lineHeight:1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>{platform.lang}</span>
              <button onClick={copy} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, color:copied?"#10B981":"#22D3EE", cursor:"pointer", fontFamily:"inherit" }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <pre style={{ background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"14px 16px", fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.88)", lineHeight:1.6, whiteSpace:"pre-wrap" as const, wordBreak:"break-word" as const, margin:0 }}>{platform.cmd}</pre>
          </div>
          <div style={{ background:"rgba(34,211,238,0.08)", border:"1px solid rgba(34,211,238,0.2)", borderRadius:8, padding:"12px 14px" }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#22D3EE", marginBottom:4 }}>Enroll Token</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", lineHeight:1.5 }}>
              Replace <code style={{ background:"rgba(255,255,255,0.08)", borderRadius:3, padding:"0 5px", color:"#22D3EE" }}>YOUR_ENROLL_TOKEN</code> with a token from <strong style={{ color:"rgba(255,255,255,0.8)" }}>Settings → Agents → Agent Tokens</strong>. Tokens expire after 24 hours.
            </div>
          </div>
        </AppModalBody>
    </AppModal>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function Settings() {
  const [, navigate] = useLocation();
  const locationSearch = useSearch();
  const { orgName: currentOrg, viewTenantId } = useOrg();
  const orgDomain    = viewTenantId === 2 ? "globex.com"  : viewTenantId === 3 ? "initech.com"  : "acme.com";
  const orgTenantRef = viewTenantId === 2 ? "TEN-GLOBEX-002" : viewTenantId === 3 ? "TEN-INITECH-003" : "TEN-ACME-001";
  const eUsers  = (viewTenantId === 1 ? extendedUsers : []) as typeof extendedUsers;
  const eAssets = (viewTenantId === 1 ? allAssets      : []) as typeof allAssets;

  // ── parse initial section/tab from URL query params (e.g. from deep-links)
  const _qp          = new URLSearchParams(locationSearch);
  const _initSection = _qp.get("section") ?? "general";
  const _initTab     = _qp.get("tab") ?? "profile";

  // ── existing state
  const [tab, setTab]                               = useState(_initTab);
  const [section, setSection]                       = useState(_initSection);
  const _deepLinked = useRef(false);
  useEffect(() => {
    if (_deepLinked.current) return;
    const qp  = new URLSearchParams(locationSearch);
    const sec = qp.get("section");
    const tb  = qp.get("tab");
    if (sec) { setSection(sec); _deepLinked.current = true; }
    if (tb)  { setTab(tb); _deepLinked.current = true; }
  }, [locationSearch]);
  const [selectedAgent, setSelectedAgent]           = useState<Agent|null>(null);
  const [selectedUser, setSelectedUser]             = useState<GRCUser|null>(null);
  const [selectedRole, setSelectedRole]             = useState<UserRole|null>(null);
  const [selectedGroup, setSelectedGroup]           = useState<AssetGroup|null>(null);
  const [agentSearch, setAgentSearch]               = useState("");
  const [userSearch, setUserSearch]                 = useState("");
  const [agentStatusFilter, setAgentStatusFilter]   = useState("All");
  const [userDeptFilter, setUserDeptFilter]         = useState("All");
  const [groupCatFilter, setGroupCatFilter]         = useState("All");
  // ── assets state
  const [assetSearch, setAssetSearch]               = useState("");
  const [assetTypeFilter, setAssetTypeFilter]       = useState("All");
  const [assetCritFilter, setAssetCritFilter]       = useState("All");

  // ── Live Agents table filters
  const [laSearch,       setLaSearch]       = useState("");
  const [laStatusFilter, setLaStatusFilter] = useState<"All"|"Online"|"Stale"|"Offline">("All");
  const [laOsFilter,     setLaOsFilter]     = useState("All");

  // ── new hub state
  const [selectedLiveAgent, setSelectedLiveAgent]   = useState<LiveAgent|null>(null);
  const [catFilter, setCatFilter]                   = useState("All");
  const [intFilter, setIntFilter]                   = useState("All");
  const [connSearch, setConnSearch]                 = useState("");
  const [whDir, setWhDir]                           = useState<"all"|"inbound"|"outbound">("all");
  const [expandedLog, setExpandedLog]               = useState<string|null>(null);
  const [deployOpen, setDeployOpen]                 = useState(false);

  // ── portal hub state
  const [selectedPortal, setSelectedPortal]         = useState<any>(null);
  const [portalSaving, setPortalSaving]             = useState(false);
  const [portalForm, setPortalForm]                 = useState<Record<string,any>>({});
  const [portalAccessLogs, setPortalAccessLogs]     = useState<any[]>([]);
  const [copyFeedback, setCopyFeedback]             = useState<string|null>(null);

  // ── trust center state
  const [tcCfg, setTcCfg]                           = useState<any>(null);
  const [tcLoading, setTcLoading]                   = useState(false);
  const [tcSaving, setTcSaving]                     = useState(false);
  const [tcSaved, setTcSaved]                       = useState(false);
  const [tcError, setTcError]                       = useState<string|null>(null);
  const [tcCopied, setTcCopied]                     = useState(false);
  const [tcDomainVerifying, setTcDomainVerifying]   = useState(false);
  const [tcDomainVerifyMsg, setTcDomainVerifyMsg]   = useState<string|null>(null);
  const [tcRequests, setTcRequests]                 = useState<any[]>([]);
  const [tcReqLoading, setTcReqLoading]             = useState(false);
  const [tcReqFilter, setTcReqFilter]               = useState<"all"|"pending"|"approved"|"denied">("all");
  const [tcReqActioning, setTcReqActioning]         = useState<number|null>(null);

  // ── live API data
  const { data: portals,      refetch: rPortals }                    = useApi<any[]>("/portals", []);
  const { data: liveAgents,   loading: laLoad,  refetch: rAgents } = useApi<LiveAgent[]>("/agents", []);
  const { data: agentStats }                                         = useApi<Record<string,number>>("/agents/stats", {});
  const { data: connections,  loading: cLoad,   refetch: rConns  } = useApi<ActiveConn[]>("/integrations/connections", []);
  const { data: webhooks,     refetch: rWh }                        = useApi<WebhookCfg[]>("/integrations/webhooks", []);
  const { data: metrics }                                            = useApi<PipelineMetric[]>("/integrations/metrics", []);
  const { data: deliveryLogs }                                       = useApi<DeliveryRow[]>(
    webhooks.length ? `/integrations/webhooks/${webhooks[0]?.id}/logs` : "/integrations/webhooks", []
  );
  const { data: caasmRaw }                                           = useApi<any[]>("/caasm/assets", []);

  // ── CAASM-mapped asset list (single source of truth shared with CAASM module)
  // `eAssets` is typed as Asset[], but the fallback mapper below defensively
  // reads CAASM-style alias fields (hostname/category/os/risk/dept/...) via `??`
  // so a single mapper handles both the DB-backed Asset shape and the CAASM raw
  // shape. We widen to a union so those reads are type-legal.
  type MappableAsset = Asset & Record<string, unknown>;
  const liveAssets = useMemo(() =>
    caasmRaw.length > 0
      ? caasmRaw.map((a: any) => ({
          id:             String(a.assetId ?? a.id),
          name:           String(a.hostname),
          type:           String(a.category),
          platform:       String(a.os),
          criticality:    String(a.risk) as "Critical"|"High"|"Medium"|"Low",
          environment:    String(a.environment ?? "Corporate"),
          owner:          String(a.dept),
          ip:             String(a.ip),
          riskScore:      Number(a.exposureScore) || 0,
          openFindings:   Number(a.vulnCount) || 0,
          dataSensitivity:String(a.dataSensitivity ?? "Internal"),
          status:         a.managed ? "active" : "inactive",
          tags:           Array.isArray(a.tags) ? a.tags as string[] : [],
          sources:        Number(a.sources) || 1,
          confidence:     String(a.confidence ?? "High"),
          lastSeen:       String(a.lastSeen ?? "—"),
        }))
      : eAssets.map((a: MappableAsset) => ({
          id: a.id, name: String(a.hostname ?? a.name), type: String(a.category ?? a.type), platform: String(a.os ?? a.platform),
          criticality: (a.risk ?? a.criticality) as "Critical"|"High"|"Medium"|"Low",
          environment: a.environment ?? "Corporate", owner: String(a.dept ?? a.owner),
          ip: String(a.ip ?? a.ipAddress ?? "—"),
          riskScore: Number(a.exposureScore ?? a.riskScore) || 0,
          openFindings: Number(a.vulnCount ?? a.openFindings) || 0,
          dataSensitivity: (a.dataSensitivity ?? "Internal") as string,
          status: a.managed ? "active" : "inactive",
          tags: Array.isArray(a.tags) ? a.tags as string[] : [],
          sources: Number(a.sources) || 1,
          confidence: String(a.confidence ?? "High"),
          lastSeen: String(a.lastSeen ?? "—"),
        }))
  , [caasmRaw, eAssets]);

  // ── existing computed
  const filteredAgents = useMemo(() => allAgents.filter(a =>
    (agentStatusFilter==="All"||a.status===agentStatusFilter) &&
    (!agentSearch||a.name.toLowerCase().includes(agentSearch.toLowerCase())||a.type.toLowerCase().includes(agentSearch.toLowerCase()))
  ), [agentStatusFilter, agentSearch]);
  const filteredUsers = useMemo(() => eUsers.filter(u =>
    (userDeptFilter==="All"||u.dept===userDeptFilter) &&
    (!userSearch||u.name.toLowerCase().includes(userSearch.toLowerCase())||u.role.toLowerCase().includes(userSearch.toLowerCase()))
  ), [userDeptFilter, userSearch, eUsers]);
  const filteredGroups = useMemo(() => assetGroups.filter(g => groupCatFilter==="All"||g.category===groupCatFilter), [groupCatFilter]);
  const filteredAssets = useMemo(() => liveAssets.filter(a =>
    (assetTypeFilter==="All" || a.type===assetTypeFilter) &&
    (assetCritFilter==="All" || a.criticality===assetCritFilter) &&
    (!assetSearch || a.name.toLowerCase().includes(assetSearch.toLowerCase()) || a.id.toLowerCase().includes(assetSearch.toLowerCase()))
  ), [liveAssets, assetTypeFilter, assetCritFilter, assetSearch]);

  // ── new hub computed
  const connectorMap     = new Map(connections.map(c => [c.connectorId, c]));
  const connectedCount   = connections.filter(c=>c.status==="connected").length;
  const onlineLiveAgents = liveAgents.filter(a=>a.status==="online").length;
  const totalAssets      = connections.reduce((s,c)=>s+c.assetsIngested, 0);
  const filteredWh       = webhooks.filter(w => whDir==="all"||w.direction===whDir);
  const topConnectors    = connections.slice(0,8);
  const metricsMap       = new Map<string, PipelineMetric[]>();
  for (const m of metrics) {
    if (!metricsMap.has(m.connectorId)) metricsMap.set(m.connectorId, []);
    metricsMap.get(m.connectorId)!.push(m);
  }
  const filteredCatalog = CATALOG
    .filter(c => catFilter==="All"||c.cat===catFilter)
    .filter(c => {
      if (intFilter==="All") return true;
      const live = connectorMap.get(c.id);
      const st   = live ? live.status : "available";
      return intFilter==="connected" ? st==="connected" : intFilter==="available" ? st==="available" : st==="warning"||st==="partial"||st==="error";
    })
    .filter(c => {
      if (!connSearch.trim()) return true;
      const q = connSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  const liveConnectorCount = CATALOG.filter(c => c.live).length;

  const onlineAgents  = allAgents.filter(a=>a.status==="online").length;
  const warningAgents = allAgents.filter(a=>a.status==="warning").length;
  const offlineAgents = allAgents.filter(a=>a.status==="offline").length;

  const resetDetail = () => { setSelectedAgent(null); setSelectedUser(null); setSelectedRole(null); setSelectedGroup(null); setSelectedLiveAgent(null); setSelectedPortal(null); };

  type SubItem = { key:string; label:string; count?:number; dot?:string };
  const SECTIONS: Array<{ key:string; label:string; icon:string; subs:SubItem[] }> = [
    { key:"general",      label:"General",         icon:"⚙",
      subs:[{ key:"profile", label:"Org Profile" },{ key:"billing", label:"Billing & Plan" },{ key:"notifications", label:"Notifications" },{ key:"scheduled-briefings", label:"Scheduled Briefings" },{ key:"api-access", label:"API & MCP Access" },{ key:"embed-package", label:"Web Embed" }] },
    { key:"usermgmt",     label:"User Management", icon:"👥",
      subs:[{ key:"users", label:"Users", count:eUsers.length },{ key:"usergroups", label:"User Groups" },{ key:"roles", label:"Roles", count:userRoles.length }] },
    { key:"agents",       label:"Agents & Assets", icon:"⬡",
      subs:[{ key:"overview", label:"Overview" },{ key:"live-agents", label:"Live Agents", count:liveAgents.length, dot:liveAgents.some(a=>a.status==="offline"||a.status==="stale")?RED:undefined },{ key:"ad-connectors", label:"AD Connectors" },{ key:"capabilities", label:"Capabilities" },{ key:"agent-tokens", label:"Agent Tokens" },{ key:"download", label:"Download" },{ key:"browser-extension", label:"Browser Extension" },{ key:"assets", label:"Devices", count:liveAssets.length },{ key:"assetgroups", label:"Groups", count:assetGroups.length }] },
    { key:"sso",          label:"SSO & Directory", icon:"🔑",
      subs:[{ key:"sso-provider", label:"Identity Provider" },{ key:"sso-groupmap", label:"Group Mapping" },{ key:"sso-audit", label:"Audit Log" }] },
    { key:"integrations", label:"Integrations",    icon:"⇌",
      subs:[{ key:"connected", label:"Connected", count:connectedCount||undefined },{ key:"marketplace", label:"Marketplace" },{ key:"webhooks", label:"Webhooks", count:webhooks.length||undefined },{ key:"pipeline", label:"Pipeline" }] },
    { key:"portals",      label:"Portals",         icon:"⊞",
      subs:[{ key:"portals-list", label:"Portals", count:portals.length || 5 }] },
    { key:"trust-center", label:"Trust Center",    icon:"🌐",
      subs:[{ key:"trust-center-cfg", label:"Configuration" }] },
    { key:"risk-scoring", label:"Risk Scoring",     icon:"⚖",
      subs:[{ key:"scoring-matrix", label:"5×5 Scoring Matrix" }] },
    { key:"docs",         label:"Documentation",   icon:"📄",
      subs:[{ key:"release-notes", label:"Release Notes" },{ key:"admin-guide", label:"Admin Guide" },{ key:"sops", label:"SOPs", count:12 }] },
  ];
  const activeSubs = SECTIONS.find(s => s.key === section)?.subs ?? [];
  function switchSection(sec: string) {
    const found = SECTIONS.find(s => s.key === sec);
    if (found?.subs[0]) { setTab(found.subs[0].key); resetDetail(); }
    setSection(sec);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--background)", overflow:"hidden" }}>
      <ModuleHeader
        title="Settings"
        description="General · User Management · Agents · Assets · Integrations · Documentation"
      />
      {/* Section nav */}
      <div style={{ display:"flex", gap:2, padding:"0 20px", background:"var(--background)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        {SECTIONS.map(sec => (
          <button key={sec.key} onClick={() => switchSection(sec.key)} style={{
            padding:"10px 18px", background:"none", border:"none", borderBottom:`2px solid ${section===sec.key?"#3B82F6":"transparent"}`,
            cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, transition:"all 0.15s",
            color: section===sec.key?"#93C5FD":"var(--muted-foreground)",
          }}>
            <span style={{ marginRight:6 }}>{sec.icon}</span>{sec.label}
          </button>
        ))}
      </div>
      {/* Sub-tab nav */}
      <div style={{ display:"flex", gap:4, padding:"8px 20px", background:"var(--card)", borderBottom:"1px solid var(--border)", flexShrink:0, alignItems:"center" }}>
        {activeSubs.map((sub: SubItem) => (
          <button key={sub.key} onClick={() => { setTab(sub.key); resetDetail(); }} style={{
            padding:"5px 14px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit",
            fontSize:11, fontWeight:700, transition:"all 0.15s",
            background: tab===sub.key?"rgba(59,130,246,0.15)":"transparent",
            color: tab===sub.key?"#93C5FD":"var(--muted-foreground)",
            display:"flex", alignItems:"center", gap:5,
          }}>
            {sub.label}
            {sub.count !== undefined && <span style={{ fontSize:9, fontWeight:800, background:"var(--border)", color:"var(--muted-foreground)", borderRadius:4, padding:"1px 5px" }}>{sub.count}</span>}
            {sub.dot && <span style={{ width:5, height:5, borderRadius:"50%", background:sub.dot, flexShrink:0, display:"inline-block" }}/>}
          </button>
        ))}
        {section==="agents" && (
          <button onClick={() => setDeployOpen(true)} style={{
            marginLeft:"auto", display:"flex", alignItems:"center", gap:6, padding:"6px 16px",
            background:"linear-gradient(135deg,rgba(34,211,238,0.85),rgba(59,130,246,0.85))",
            border:"none", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:800,
            color:"#000", fontFamily:"inherit", flexShrink:0,
          }}>
            + Deploy Agent
          </button>
        )}
      </div>
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* ══════════════ ORG PROFILE ══════════════ */}
        {tab==="profile" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <SCard title="Organization Details">
              <Field label="Organization Name" value={currentOrg}/>
              <Field label="Primary Domain"    value={orgDomain}/>
              <Field label="Industry"          value="Technology"/>
              <Field label="Headquarters"      value="Barcelona, Spain"/>
              <Field label="Company Size"      value="50–200 employees"/>
              <Field label="Tenant ID"         value={orgTenantRef}/>
              <SaveBtn/>
            </SCard>
            <SCard title="Security & Authentication">
              <Toggle label="Single Sign-On (SSO)"           enabled={true}  sub="Configured via Okta"/>
              <Toggle label="Multi-Factor Authentication"    enabled={true}  sub="TOTP + SMS backup"/>
              <Toggle label="Session Timeout (4 hours)"      enabled={true}/>
              <Toggle label="IP Allowlist"                   enabled={false} sub="Restrict login to known IPs"/>
              <Toggle label="Audit Log Retention (2 years)"  enabled={true}/>
              <Toggle label="Zero Trust Network Access"      enabled={false} sub="ZTNA for all remote access"/>
              <SaveBtn label="Save Security Settings"/>
            </SCard>
            <SCard title="Data Residency">
              <Field label="Primary Data Region"   value="EU West (Ireland)"/>
              <Field label="Secondary Region"      value="EU West 2 (Netherlands)"/>
              <Field label="Backup Region"         value="EU Central (Frankfurt)"/>
              <Toggle label="EU Data Residency Enforcement" enabled={true}  sub="Block non-EU data residency"/>
              <Toggle label="GDPR Article 28 Compliance"   enabled={true}  sub="DPA with all sub-processors"/>
              <SaveBtn label="Save Residency Settings"/>
            </SCard>
            <SCard title="AI & Automation">
              <Toggle label="AI vCISO Insights"             enabled={true}  sub="Context-aware risk recommendations"/>
              <Toggle label="AI Policy Enrichment"          enabled={true}  sub="Auto-summarise and gap-analyse policies"/>
              <Toggle label="Automated Risk Correlation"    enabled={false} sub="Link CSPM/Vuln/DAST findings to risks"/>
              <Toggle label="Continuous Control Monitoring" enabled={false} sub="Real-time control effectiveness scoring"/>
              <Toggle label="AI Regulatory Horizon Scan"   enabled={true}  sub="Weekly regulatory change digest"/>
              <SaveBtn label="Save AI Settings"/>
            </SCard>
          </div>
        )}

        {/* ══════════════ AGENTS (static) ══════════════ */}
        {tab==="agents" && (selectedAgent ? <AgentProfile agent={selectedAgent} onClose={() => setSelectedAgent(null)}/> : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {([
                { label:"Total Agents",   value:String(allAgents.length),                             color:NAV },
                { label:"Online",         value:String(onlineAgents),                                  color:EME },
                { label:"Warning",        value:String(warningAgents),                                 color:AMB },
                { label:"Offline",        value:String(offlineAgents),                                 color:offlineAgents>0?RED:"var(--muted-foreground)" },
                { label:"Assets Managed", value:allAgents.reduce((s,a)=>s+a.assets,0).toLocaleString(), color:BLU },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input value={agentSearch} onChange={e=>setAgentSearch(e.target.value)} placeholder="Search agents…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:200, fontFamily:"inherit" }}/>
              {(["All","online","warning","offline"] as const).map(s => (
                <button key={s} onClick={()=>setAgentStatusFilter(s)} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", background:agentStatusFilter===s?NAV:  "var(--card)", color:agentStatusFilter===s?"white":"#6B7280", borderColor:agentStatusFilter===s?NAV:"var(--border)", textTransform:"capitalize" as const }}>{s}</button>
              ))}
              <button style={{ marginLeft:"auto", background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"6px 14px", fontSize:11, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit" }}>+ Install Agent</button>
            </div>
            <div style={card({ padding:0, overflow:"hidden" })}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                    {["ID","Name","Type","Platform","Version","Status","Assets","CPU","Memory","Last Seen",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map(a => {
                    const sc = a.status==="online"?EME:a.status==="warning"?AMB:RED;
                    const sb = a.status==="online"?"rgba(34,197,94,0.08)":a.status==="warning"?"rgba(245,158,11,0.06)":"rgba(239,68,68,0.06)";
                    const sd = a.status==="online"?"#A7F3D0":a.status==="warning"?"#FDE68A":"#FECACA";
                    return (
                      <tr key={a.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>navigate(`/settings/agents/${a.id}`)}>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.id}</td>
                        <td style={{ padding:"10px 14px", fontWeight:700, color:NAV }}>{a.name}</td>
                        <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:700, background:"rgba(59,130,246,0.12)", color:BLU, border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"2px 6px" }}>{a.type}</span></td>
                        <td style={{ padding:"10px 14px", color:"#6B7280" }}>{a.platform}</td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#6B7280" }}>{a.version}</td>
                        <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:sc, background:sb, border:`1px solid ${sd}`, borderRadius:4, padding:"2px 7px" }}>{a.status.toUpperCase()}</span></td>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:NAV }}>{a.assets.toLocaleString()}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:50, height:5, background:"var(--input)", borderRadius:3 }}><div style={{ height:"100%", width:`${a.cpu}%`, background:a.cpu>70?RED:a.cpu>50?AMB:EME, borderRadius:3 }}/></div>
                            <span style={{ fontSize:10, color:a.cpu>70?RED:a.cpu>50?AMB:"var(--muted-foreground)" }}>{a.cpu}%</span>
                          </div>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:50, height:5, background:"var(--input)", borderRadius:3 }}><div style={{ height:"100%", width:`${a.mem}%`, background:a.mem>70?RED:a.mem>50?AMB:EME, borderRadius:3 }}/></div>
                            <span style={{ fontSize:10, color:a.mem>70?RED:a.mem>50?AMB:"var(--muted-foreground)" }}>{a.mem}%</span>
                          </div>
                        </td>
                        <td style={{ padding:"10px 14px", color:"var(--muted-foreground)", fontSize:11 }}>{a.lastSeen}</td>
                        <td style={{ padding:"10px 14px" }}><span style={{ fontSize:11, color:BLU, fontWeight:700, cursor:"pointer" }}>View →</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* ══════════════ OVERVIEW (Agents > Overview) ══════════════ */}
        {tab==="overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* KPI cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              <HubKpi label="Active Agents"  value={onlineLiveAgents}              sub={`of ${liveAgents.length} total`}    color="#10B981" icon="⬡" />
              <HubKpi label="Connected"      value={connectedCount}                sub="integrations active"                color="#22D3EE" icon="⚡" />
              <HubKpi label="Assets Ingested" value={totalAssets.toLocaleString()} sub="across all connectors"              color="#3B82F6" icon="◈" />
              <HubKpi label="Alerts Open"    value={liveAgents.reduce((s,a)=>s+(a.telemetry?.alertsOpen??0),0)} sub="across all agents" color="#F59E0B" icon="◬" />
              <HubKpi label="Offline / Stale" value={liveAgents.filter(a=>a.status==="offline"||a.status==="stale").length} sub="need attention" color="#EF4444" icon="◎" />
              <HubKpi label="Webhooks"       value={webhooks.length}               sub={`${webhooks.filter(w=>w.active).length} active`} color="#8B5CF6" icon="⇄" />
            </div>

            {/* AI Fleet Intelligence */}
            <div style={{ background:"linear-gradient(135deg,rgba(139,92,246,0.10),rgba(59,130,246,0.08))", border:"1px solid rgba(139,92,246,0.28)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13 }}>◆</span>
                <span style={{ fontSize:11, fontWeight:800, color:"#8B5CF6", letterSpacing:"0.4px", textTransform:"uppercase" as const }}>AI Fleet Intelligence</span>
                <span style={{ background:"rgba(139,92,246,0.18)", color:"#8B5CF6", border:"1px solid rgba(139,92,246,0.3)", borderRadius:10, padding:"1px 8px", fontSize:9, fontWeight:700, marginLeft:"auto" }}>Live Analysis</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { icon:"⚠", color:"#F59E0B", text:`${liveAgents.filter(a=>a.status==="stale"||a.status==="offline").length} agents offline or stale — check-in latency may indicate network segmentation or firewall blocking port 443.` },
                  { icon:"⬡", color:"#10B981", text:`${liveAgents.filter(a=>a.version?.startsWith("1.")).length} agents on v1.x (EOL Q2 2026). AI recommends priority upgrade to v2.4.1 to maintain threat detection fidelity.` },
                  { icon:"⚡", color:"#22D3EE", text:`Top connectors account for ~60% of event volume. Tuning ingestion filters could reduce noise by 30–40%.` },
                  { icon:"◈", color:"#3B82F6", text:`${totalAssets.toLocaleString()} assets discovered. Cross-correlating with CAASM would resolve ${Math.round(totalAssets*0.08)} shadow-IT assets detected this week.` },
                ].map((ins,i) => (
                  <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px" }}>
                    <span style={{ color:ins.color, fontSize:13, flexShrink:0, marginTop:1 }}>{ins.icon}</span>
                    <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.5 }}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* OS distribution + Top integrations */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 18px" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)", marginBottom:14 }}>Agent Distribution by OS</div>
                {(["linux","windows","macos","mobile","cloud"] as const).map(os => {
                  const count = liveAgents.filter(a=>a.os===os).length;
                  const total2 = liveAgents.length || 1;
                  const pct = Math.round((count/total2)*100);
                  const colors: Record<string,string> = { linux:"#F59E0B", windows:"#3B82F6", macos:"#94A3B8", mobile:"#8B5CF6", cloud:"#10B981" };
                  return (
                    <div key={os} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <HubOsBadge os={os} />
                      <div style={{ flex:1, height:5, background:"var(--border)", borderRadius:4 }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:colors[os]??"#22D3EE", borderRadius:4 }} />
                      </div>
                      <span style={{ fontSize:11, fontFamily:"monospace", color:colors[os]??"#22D3EE", fontWeight:700, width:24, textAlign:"right" as const }}>{count}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 18px" }}>
                <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)", marginBottom:14 }}>Top Integrations by Events</div>
                {connections.slice(0,6).map(c => {
                  const maxEv = Math.max(...connections.map(x=>x.eventsIngested),1);
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:22, height:22, borderRadius:6, background:"#22D3EE", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"black", flexShrink:0 }}>
                        {c.connectorName?.charAt(0)??"?"}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{c.connectorName}</div>
                        <div style={{ height:3, background:"var(--border)", borderRadius:4, marginTop:3 }}>
                          <div style={{ height:"100%", width:`${(c.eventsIngested/maxEv)*100}%`, background:"#22D3EE", borderRadius:4 }} />
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:"var(--muted-foreground)", width:52, textAlign:"right" as const }}>{c.eventsIngested.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Agent activity cards */}
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 18px" }}>
              <div style={{ fontSize:12, fontWeight:800, color:"var(--foreground)", marginBottom:12 }}>Agent Activity</div>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:10 }}>
                {liveAgents.map(a => (
                  <div key={a.id}
                    style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", minWidth:180, cursor:"pointer", transition:"border-color 0.15s, box-shadow 0.15s" }}
                    onClick={() => { setTab("live-agents"); setSelectedLiveAgent(a); }}
                    onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor=NAV; (e.currentTarget as HTMLDivElement).style.boxShadow=`0 0 0 1px ${NAV}44`; }}
                    onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.borderColor="var(--border)"; (e.currentTarget as HTMLDivElement).style.boxShadow="none"; }}
                  >
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{a.hostname}</span>
                      <HubStatusDot status={a.status} />
                    </div>
                    <HubOsBadge os={a.os} />
                    <div style={{ marginTop:6 }}>
                      <HubMiniBar pct={a.health?.cpu??0} danger={(a.health?.cpu??0)>70} />
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>
                      {a.telemetry?.assetsDiscovered ?? 0} assets · {a.telemetry?.eventsLastHour ?? 0} events/h
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ LIVE AGENTS ══════════════ */}
        {tab==="live-agents" && (()=>{
          const filteredLiveAgents = liveAgents.filter(a => {
            const q = laSearch.toLowerCase();
            const matchSearch = !q || a.hostname.toLowerCase().includes(q) || (a.os||"").toLowerCase().includes(q) || (a.version||"").toLowerCase().includes(q);
            const matchStatus = laStatusFilter === "All" || (a.status||"").toLowerCase() === laStatusFilter.toLowerCase();
            const matchOs     = laOsFilter === "All" || (a.os||"").toLowerCase().includes(laOsFilter.toLowerCase());
            return matchSearch && matchStatus && matchOs;
          });
          const osOptions = ["All", ...Array.from(new Set(liveAgents.map(a => a.os||"Unknown")))];
          return (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"var(--secondary)", border:"1.5px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" as const, gap:8 }}>
                <span style={{ fontSize:12, fontWeight:800, color:"var(--foreground)" }}>Agent Inventory · <span style={{ color:NAV }}>{filteredLiveAgents.length}</span> / {liveAgents.length} agents</span>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
                  <input
                    value={laSearch} onChange={e=>setLaSearch(e.target.value)}
                    placeholder="Search hostname, OS…"
                    style={{ padding:"5px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:180, fontFamily:"inherit", background:"var(--card)", color:"var(--foreground)", outline:"none" }}
                  />
                  <div style={{ display:"flex", gap:4 }}>
                    {(["All","Online","Stale","Offline"] as const).map(s => (
                      <button key={s} onClick={()=>setLaStatusFilter(s)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", transition:"all 0.1s", background:laStatusFilter===s?NAV:"var(--card)", color:laStatusFilter===s?"#fff":"var(--muted-foreground)", borderColor:laStatusFilter===s?NAV:"var(--border)" }}>{s}</button>
                    ))}
                  </div>
                  <select value={laOsFilter} onChange={e=>setLaOsFilter(e.target.value)} style={{ padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, background:"var(--card)", color:"var(--foreground)", cursor:"pointer", outline:"none" }}>
                    {osOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {(laSearch || laStatusFilter !== "All" || laOsFilter !== "All") && (
                    <button onClick={()=>{ setLaSearch(""); setLaStatusFilter("All"); setLaOsFilter("All"); }} style={{ padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", fontSize:10, fontWeight:700, cursor:"pointer", background:"transparent", color:"var(--muted-foreground)" }}>✕ Clear</button>
                  )}
                </div>
              </div>
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--secondary)" }}>
                      {["Hostname","OS","Version","Status","CPU","Mem","Disk","Assets","Events/h","Last Seen","Feed Activity"].map(h => (
                        <th key={h} style={{ textAlign:"left" as const, padding:"9px 12px", color:"var(--muted-foreground)", fontWeight:800, fontSize:9, letterSpacing:"0.06em", textTransform:"uppercase" as const, whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLiveAgents.map(a => (
                      <tr key={a.id}
                        style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", transition:"background 0.12s" }}
                        onMouseEnter={e=>(e.currentTarget as HTMLTableRowElement).style.background="var(--secondary)"}
                        onMouseLeave={e=>(e.currentTarget as HTMLTableRowElement).style.background="transparent"}
                        onClick={() => setSelectedLiveAgent(a===selectedLiveAgent?null:a)}>
                        <td style={{ padding:"10px 12px", color:"var(--foreground)", fontWeight:700 }}>{a.hostname}</td>
                        <td style={{ padding:"10px 12px" }}><HubOsBadge os={a.os} /></td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.version}</td>
                        <td style={{ padding:"10px 12px" }}><HubStatusDot status={a.status} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><HubMiniBar pct={a.health?.cpu??0} danger={(a.health?.cpu??0)>70} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><HubMiniBar pct={a.health?.mem??0} danger={(a.health?.mem??0)>80} /></td>
                        <td style={{ padding:"10px 12px", minWidth:90 }}><HubMiniBar pct={a.health?.disk??0} danger={(a.health?.disk??0)>85} /></td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", fontWeight:700, color:"#22D3EE" }}>{(a.telemetry?.assetsDiscovered??0).toLocaleString()}</td>
                        <td style={{ padding:"10px 12px", fontFamily:"monospace", color:"var(--muted-foreground)" }}>{(a.telemetry?.eventsLastHour??0).toLocaleString()}</td>
                        <td style={{ padding:"10px 12px", fontSize:10, color:a.status==="offline"?"#EF4444":"var(--muted-foreground)" }}>{relHubTime(a.lastSeen)}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const }}>
                            {Object.keys((a as any).feedActivity ?? {}).filter(f => {
                              const ts = ((a as any).feedActivity ?? {})[f];
                              return ts && Date.now() - new Date(ts).getTime() < 86_400_000;
                            }).map(f => {
                              const color = HUB_FEED_COLORS[f] ?? "#94A3B8";
                              const label = HUB_FEED_LABEL[f] ?? f;
                              const active = a.status !== "offline";
                              return (
                                <span key={f} style={{ background:active?`${color}22`:"transparent", border:`1px solid ${color}${active?"66":"33"}`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700, color:active?color:"var(--muted-foreground)", opacity:active?1:0.5 }}>
                                  {active?"●":"○"} {label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agent detail panel — full detail view */}
            {selectedLiveAgent && (
              <LiveAgentDetail
                agent={selectedLiveAgent}
                onClose={() => setSelectedLiveAgent(null)}
                onViewAssets={() => { setSelectedLiveAgent(null); setTab("assets"); }}
              />
            )}
          </div>
        );
        })()}

        {/* ══════════════ DOWNLOAD (Agents > Download) ══════════════ */}
        {tab==="download" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
              {([
                {
                  os:"Windows", icon:"⊞", color:"#0078D4", arch:"x64 / ARM64",
                  cmd:`powershell -Command "Invoke-WebRequest -Uri 'https://agent.aigo-x.io/install.ps1' -OutFile install.ps1; .\\install.ps1"`,
                  badge:"v3.8.2",
                  filename:"aigo-x-agent-v3.8.2-setup.ps1",
                  fileContent:`# AIGO-X GRC Agent Installer v3.8.2 — Windows
# Generated by AIGO-X Platform · https://aigo-x.io
# Run as Administrator in PowerShell

$ErrorActionPreference = "Stop"
$AgentVersion = "3.8.2"
$InstallDir   = "$env:ProgramFiles\\AIGO-X\\Agent"
$ServiceName  = "AIGOXAgent"
$AgentExe     = "$InstallDir\\aigox-agent.exe"
$DownloadBase = "https://agent.aigo-x.io/releases/$AgentVersion"

Write-Host "[AIGO-X] Starting installation of AIGO-X GRC Agent v$AgentVersion" -ForegroundColor Cyan

# 1. Create install directory
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }

# 2. Download agent binary
$arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "arm64" }
$pkg  = "aigox-agent-windows-$arch.zip"
Write-Host "[AIGO-X] Downloading $pkg ..."
Invoke-WebRequest -Uri "$DownloadBase/$pkg" -OutFile "$env:TEMP\\$pkg"

# 3. Extract
Expand-Archive -Path "$env:TEMP\\$pkg" -DestinationPath $InstallDir -Force

# 4. Register Windows Service
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service $ServiceName -Force
    sc.exe delete $ServiceName | Out-Null
}
New-Service -Name $ServiceName -BinaryPathName "$AgentExe --service" -DisplayName "AIGO-X GRC Agent" -StartupType Automatic
Start-Service $ServiceName

# 5. Verify
$svc = Get-Service -Name $ServiceName
Write-Host "[AIGO-X] Service status: $($svc.Status)" -ForegroundColor $(if ($svc.Status -eq "Running") {"Green"} else {"Red"})
Write-Host "[AIGO-X] Installation complete. Set AIGO_TOKEN env var or edit $InstallDir\\agent.conf" -ForegroundColor Cyan
`,
                },
                {
                  os:"Linux", icon:"⊗", color:"#E2A62D", arch:"x64 / ARM64 / ARMv7",
                  cmd:"curl -sSL https://agent.aigo-x.io/install.sh | sudo bash",
                  badge:"v3.8.2",
                  filename:"aigo-x-agent-v3.8.2-install.sh",
                  fileContent:`#!/usr/bin/env bash
# AIGO-X GRC Agent Installer v3.8.2 — Linux
# Generated by AIGO-X Platform · https://aigo-x.io
# Usage: sudo bash aigo-x-agent-v3.8.2-install.sh [--token <YOUR_TOKEN>]
set -euo pipefail

AGENT_VERSION="3.8.2"
INSTALL_DIR="/opt/aigox/agent"
SERVICE_FILE="/etc/systemd/system/aigox-agent.service"
DOWNLOAD_BASE="https://agent.aigo-x.io/releases/$AGENT_VERSION"
TOKEN=""

for i in "$@"; do
  case $i in --token=*) TOKEN="\${i#*=}" ;; --token) shift; TOKEN="$1" ;; esac
done

echo "[AIGO-X] Installing AIGO-X GRC Agent v$AGENT_VERSION"

# 1. Detect architecture
ARCH=$(uname -m)
case $ARCH in x86_64) PKG="aigox-agent-linux-amd64.tar.gz" ;;
              aarch64) PKG="aigox-agent-linux-arm64.tar.gz" ;;
              armv7l)  PKG="aigox-agent-linux-armv7.tar.gz" ;;
              *) echo "Unsupported architecture: $ARCH"; exit 1 ;; esac

# 2. Download & extract
mkdir -p "$INSTALL_DIR"
curl -sSL "$DOWNLOAD_BASE/$PKG" | tar -xz -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/aigox-agent"

# 3. Write config
cat > "$INSTALL_DIR/agent.conf" <<EOF
version = "$AGENT_VERSION"
token   = "$TOKEN"
api_url = "https://api.aigo-x.io"
log_dir = "/var/log/aigox"
EOF
mkdir -p /var/log/aigox

# 4. Systemd service
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=AIGO-X GRC Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/aigox-agent --config $INSTALL_DIR/agent.conf
Restart=on-failure
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable aigox-agent
systemctl start  aigox-agent

echo "[AIGO-X] Agent installed. Status: $(systemctl is-active aigox-agent)"
echo "[AIGO-X] Edit $INSTALL_DIR/agent.conf to set your enrollment token."
`,
                },
                {
                  os:"macOS", icon:"⌘", color:"#6B7280", arch:"Intel / Apple Silicon",
                  cmd:"brew install aigo-x-agent && sudo aigo-x start",
                  badge:"v3.8.2",
                  filename:"aigo-x-agent-v3.8.2-macos-install.sh",
                  fileContent:`#!/usr/bin/env bash
# AIGO-X GRC Agent Installer v3.8.2 — macOS
# Generated by AIGO-X Platform · https://aigo-x.io
# Requires macOS 12 Monterey or later · Intel & Apple Silicon
set -euo pipefail

AGENT_VERSION="3.8.2"
INSTALL_DIR="/usr/local/opt/aigox-agent"
PLIST_PATH="/Library/LaunchDaemons/io.aigo-x.agent.plist"
TOKEN=""

for i in "$@"; do
  case $i in --token=*) TOKEN="\${i#*=}" ;; --token) shift; TOKEN="$1" ;; esac
done

echo "[AIGO-X] Installing AIGO-X GRC Agent v$AGENT_VERSION for macOS"

# 1. Detect architecture
ARCH=$(uname -m)
PKG="aigox-agent-macos-$([[ $ARCH == arm64 ]] && echo arm64 || echo amd64).tar.gz"

# 2. Prefer Homebrew if available
if command -v brew &>/dev/null; then
  echo "[AIGO-X] Homebrew detected — installing via tap"
  brew tap aigo-x/tap
  brew install --quiet aigo-x-agent
else
  echo "[AIGO-X] Installing manually to $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  curl -sSL "https://agent.aigo-x.io/releases/$AGENT_VERSION/$PKG" | tar -xz -C "$INSTALL_DIR"
  chmod +x "$INSTALL_DIR/aigox-agent"
fi

# 3. LaunchDaemon plist
sudo tee "$PLIST_PATH" > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>       <string>io.aigo-x.agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>$(command -v aigox-agent 2>/dev/null || echo "$INSTALL_DIR/aigox-agent")</string>
      <string>--token</string><string>$TOKEN</string>
    </array>
    <key>RunAtLoad</key>   <true/>
    <key>KeepAlive</key>   <true/>
    <key>StandardOutPath</key><string>/var/log/aigox/agent.log</string>
    <key>StandardErrorPath</key><string>/var/log/aigox/agent-err.log</string>
  </dict>
</plist>
EOF

mkdir -p /var/log/aigox
sudo launchctl load "$PLIST_PATH"

echo "[AIGO-X] Agent loaded. Check /var/log/aigox/agent.log for status."
`,
                },
                {
                  os:"Cloud", icon:"☁", color:"#10B981", arch:"Docker / Kubernetes / ECS",
                  cmd:"docker run -d --name aigo-agent aigo-x/agent:latest",
                  badge:"v3.8.2",
                  filename:"aigo-x-agent-docker-compose.yml",
                  fileContent:`# AIGO-X GRC Agent v3.8.2 — Docker Compose
# Generated by AIGO-X Platform · https://aigo-x.io
# Usage: AIGO_TOKEN=[YOUR_TOKEN] docker compose up -d

version: "3.8"

services:
  aigo-x-agent:
    image: aigo-x/agent:3.8.2
    container_name: aigo-x-agent
    restart: unless-stopped
    environment:
      - AIGO_TOKEN=\${AIGO_TOKEN}
      - AIGO_API_URL=https://api.aigo-x.io
      - AIGO_LOG_LEVEL=info
      - AIGO_COLLECT_CLOUD=true
      - AIGO_COLLECT_CONTAINERS=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - aigo-x-data:/var/lib/aigox
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "/usr/local/bin/aigox-agent", "healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  aigo-x-data:

# Kubernetes deployment — see https://docs.aigo-x.io/deploy/kubernetes
# Helm: helm repo add aigo-x https://charts.aigo-x.io && helm install aigo-x-agent aigo-x/agent
`,
                },
              ]).map(p => {
                const triggerDownload = () => {
                  const blob = new Blob([p.fileContent], { type:"text/plain" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href = url; a.download = p.filename;
                  document.body.appendChild(a); a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                };
                return (
                <div key={p.os} style={card({ padding:"20px 22px" })}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:`${p.color}14`, border:`1.5px solid ${p.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:p.color }}>{p.icon}</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{p.os}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{p.arch}</div>
                    </div>
                    <span style={{ marginLeft:"auto", fontSize:9, fontWeight:800, color:EME, background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:4, padding:"2px 6px" }}>{p.badge}</span>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Install Command</div>
                    <div style={{ background:"rgb(6,8,14)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 12px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#93C5FD", wordBreak:"break-all" as const }}>{p.cmd}</div>
                  </div>
                  <div style={{ marginBottom:8, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"var(--muted-foreground)", textAlign:"center" as const }}>{p.filename}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => navigator.clipboard.writeText(p.cmd)} style={{ flex:1, background:"rgba(59,130,246,0.1)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:7, padding:"7px", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>Copy</button>
                    <button onClick={triggerDownload} style={{ flex:1, background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:7, padding:"7px", fontSize:11, fontWeight:700, color:"var(--card)", cursor:"pointer", fontFamily:"inherit" }}>↓ Download</button>
                  </div>
                </div>
                );
              })}
            </div>
            <div style={card({ padding:"20px 24px" })}>
              <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:16 }}>Requirements & Configuration</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
                {([
                  { title:"Network", items:["Outbound HTTPS (443) to *.aigo-x.io","DNS resolution for agent.aigo-x.io","Optional: SOCKS5 proxy support"] },
                  { title:"System",  items:["64-bit processor (ARM64 supported)","512 MB RAM min (1 GB recommended)","100 MB disk for agent binaries"] },
                  { title:"Auth Token", items:["Set AIGO_TOKEN environment variable","Or use agent.conf → token = <value>","Token visible in Settings › User Profile","Enrollment token issued on first registration"] },
                ] as {title:string;items:string[]}[]).map(col => (
                  <div key={col.title}>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{col.title}</div>
                    {col.items.map(item => (
                      <div key={item} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:7 }}>
                        <span style={{ color:EME, fontSize:12, fontWeight:800, flexShrink:0, marginTop:1 }}>✓</span>
                        <span style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.4 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* 5-module data feed capability matrix */}
            <div style={card({ padding:"20px 24px" })}>
              <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:4 }}>Module Data Feeds — Pipeline Capability Matrix</div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:16 }}>Which AIGO-X modules each agent deployment type contributes data to</div>
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse" as const, fontSize:11 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      <th style={{ textAlign:"left" as const, padding:"7px 12px", color:"var(--muted-foreground)", fontWeight:800, fontSize:9, textTransform:"uppercase" as const, letterSpacing:"0.06em" }}>Deployment</th>
                      {([
                        { key:"complyops",  label:"ComplyOps",  color:"#8B5CF6" },
                        { key:"assetops",   label:"AssetOps",   color:"#22D3EE" },
                        { key:"dataops",    label:"DataOps",    color:"#3B82F6" },
                        { key:"secops",     label:"SecOps",     color:"#F59E0B" },
                        { key:"serviceops", label:"ServiceOps", color:"#10B981" },
                      ]).map(m => (
                        <th key={m.key} style={{ textAlign:"center" as const, padding:"7px 12px", fontSize:9, fontWeight:800, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:m.color }}>{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label:"Windows (Endpoint)", feeds:["complyops","assetops","dataops","secops","serviceops"] },
                      { label:"Linux (Server)",     feeds:["complyops","assetops","dataops","secops","serviceops"] },
                      { label:"macOS (Workstation)",feeds:["complyops","assetops","dataops","secops"] },
                      { label:"Mobile (MDM Bridge)",feeds:["complyops","assetops","serviceops"] },
                      { label:"Cloud (CSPM Agent)", feeds:["assetops","dataops","secops"] },
                    ] as {label:string;feeds:string[]}[]).map((row, i) => (
                      <tr key={row.label} style={{ borderBottom:"1px solid var(--border)", background: i%2===0?"transparent":"var(--secondary)" }}>
                        <td style={{ padding:"8px 12px", fontWeight:700, color:"var(--foreground)" }}>{row.label}</td>
                        {["complyops","assetops","dataops","secops","serviceops"].map(m => (
                          <td key={m} style={{ padding:"8px 12px", textAlign:"center" as const }}>
                            {row.feeds.includes(m)
                              ? <span style={{ display:"inline-block", width:18, height:18, borderRadius:4, background:"rgba(34,197,94,0.12)", border:"1px solid #A7F3D066", fontSize:11, lineHeight:"18px", color:EME }}>✓</span>
                              : <span style={{ display:"inline-block", width:18, height:18, borderRadius:4, background:"transparent", border:"1px solid var(--border)", fontSize:11, lineHeight:"18px", color:"var(--muted-foreground)" }}>—</span>
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ AD CONNECTORS ══════════════ */}
        {tab==="ad-connectors" && <AdConnectorsPanel />}

        {/* ══════════════ AGENT TOKENS ══════════════ */}
        {tab==="agent-tokens" && <AgentTokensPanel />}

        {/* ══════════════ BROWSER EXTENSION ══════════════ */}
        {tab==="browser-extension" && <BrowserExtPanel />}

        {/* ══════════════ ASSETS ══════════════ */}
        {tab==="assets" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {([
                { label:"Total Assets",      value:String(liveAssets.length),                                                               color:NAV },
                { label:"Critical",          value:String(liveAssets.filter(a=>a.criticality==="Critical").length),                        color:RED },
                { label:"High",              value:String(liveAssets.filter(a=>a.criticality==="High").length),                            color:AMB },
                { label:"Open Findings",     value:String(liveAssets.reduce((s,a)=>s+a.openFindings,0)),                                   color:AMB },
                { label:"Production Assets", value:String(liveAssets.filter(a=>a.environment==="Production").length),                      color:BLU },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"#9CA3AF", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            {/* Filters */}
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
              <input value={assetSearch} onChange={e=>setAssetSearch(e.target.value)} placeholder="Search assets…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid #E5E7EB", fontSize:11, width:200, fontFamily:"inherit" }}/>
              {(["All","Server","Cloud","Container","Network","Workstation","IoT","Unknown"] as const).map(t => (
                <button key={t} onClick={()=>setAssetTypeFilter(t)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:assetTypeFilter===t?NAV:"white", color:assetTypeFilter===t?"white":"#6B7280", borderColor:assetTypeFilter===t?NAV:"#E5E7EB", flexShrink:0 }}>{t}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const }}>
              {(["All","Critical","High","Medium","Low"] as const).map(c => (
                <button key={c} onClick={()=>setAssetCritFilter(c)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:assetCritFilter===c?NAV:"white", color:assetCritFilter===c?"white":impColor(c==="All"?"Low":c), borderColor:assetCritFilter===c?NAV:impBd(c==="All"?"Low":c), flexShrink:0 }}>{c}</button>
              ))}
              <span style={{ marginLeft:"auto", fontSize:11, color:"#9CA3AF" }}>{filteredAssets.length} of {liveAssets.length} shown</span>
            </div>
            {/* Assets table — AssetOps format */}
            <div style={card({ padding:0, overflow:"hidden" })}>
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                      {["ID","Hostname","Category","OS","IP","Sources","Confidence","Last Seen","Risk","Dept",""].map(h => (
                        <th key={h} style={{ textAlign:"left" as const, padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(a => {
                      const catColors: Record<string,string> = { Server:"#3B82F6", Workstation:"#8B5CF6", IoT:"#F59E0B", OT:"#EF4444", Container:"#06B6D4", Network:"#10B981", Cloud:"#6366F1", SaaS:"#EC4899", Mobile:"#A78BFA", Security:"#14B8A6", Identity:"#F97316", Unknown:"#6B7280" };
                      const confColors: Record<string,{bg:string;color:string;border:string}> = { High:{bg:"#ECFDF5",color:"#059669",border:"#A7F3D0"}, Medium:{bg:"#FFFBEB",color:"#D97706",border:"#FDE68A"}, Low:{bg:"#FEF2F2",color:"#DC2626",border:"#FECACA"} };
                      const conf = confColors[a.confidence] ?? confColors["High"];
                      return (
                        <tr key={a.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                            onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                            onClick={()=>navigate(`/assetops?assetId=${encodeURIComponent(a.id)}`)}>
                          <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{a.id}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ fontWeight:700, color:"var(--foreground)", fontSize:11 }}>{a.name}</div>
                            <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{a.platform}</div>
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <span style={{ fontSize:9, fontWeight:800, color:"white", background:catColors[a.type]??NAV, padding:"2px 6px", borderRadius:3 }}>{a.type}</span>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--foreground)" }}>{a.platform}</td>
                          <td style={{ padding:"11px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--foreground)" }}>{a.ip}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <div style={{ display:"flex", gap:2 }}>
                              {Array.from({length:Math.min(a.sources,5)}).map((_,i)=>(
                                <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:NAV }} />
                              ))}
                              {a.sources > 5 && <span style={{ fontSize:9, color:"var(--muted-foreground)", marginLeft:3 }}>+{a.sources-5}</span>}
                            </div>
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <span style={{ background:conf.bg, color:conf.color, border:`1px solid ${conf.border}`, borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>{a.confidence}</span>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{a.lastSeen}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:12, color:riskColor(a.riskScore) }}>{a.riskScore}</span>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:11, color:"var(--foreground)" }}>{a.owner}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <button onClick={e=>{e.stopPropagation();navigate(`/assetops?assetId=${encodeURIComponent(a.id)}`);}} style={{ padding:"3px 8px", borderRadius:5, border:"1px solid var(--border)", background:"var(--input)", fontSize:10, fontWeight:700, cursor:"pointer", color:BLU, fontFamily:"inherit" }}>Details →</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ ASSET GROUPS ══════════════ */}
        {tab==="assetgroups" && (selectedGroup ? <AssetGroupProfile group={selectedGroup} onClose={() => setSelectedGroup(null)}/> : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {([
                { label:"Total Groups",    value:String(assetGroups.length),                                                color:NAV },
                { label:"Critical Impact", value:String(assetGroups.filter(g=>g.impact==="Critical").length),               color:RED },
                { label:"High Impact",     value:String(assetGroups.filter(g=>g.impact==="High").length),                    color:AMB },
                { label:"Total Assets",    value:assetGroups.reduce((s,g)=>s+g.assetCount,0).toLocaleString(),              color:BLU },
                { label:"Avg Risk Score",  value:String(Math.round(assetGroups.reduce((s,g)=>s+g.riskScore,0)/assetGroups.length)), color:AMB },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
              {(["All","Server","Cloud","Database","Container","Network","OT","IoT","SaaS","Security","Mobile","Workstation","IAM","Physical","Storage"] as const).map(c => (
                <button key={c} onClick={()=>setGroupCatFilter(c)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:groupCatFilter===c?NAV:  "var(--card)", color:groupCatFilter===c?"white":"#6B7280", borderColor:groupCatFilter===c?NAV:"var(--border)", flexShrink:0 }}>{c}</button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
              {filteredGroups.map(g => (
                <div key={g.id} onClick={()=>navigate(`/settings/asset-groups/${g.id}`)} style={card({ padding:"16px 20px", cursor:"pointer" })}
                     onMouseEnter={e=>(e.currentTarget.style.borderColor=NAV)} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{g.id}</span>
                        <span style={{ fontSize:9, fontWeight:800, color:impColor(g.impact), background:impBg(g.impact), border:`1px solid ${impBd(g.impact)}`, borderRadius:4, padding:"1px 6px" }}>{g.impact}</span>
                        <span style={{ fontSize:9, fontWeight:700, color:BLU, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:4, padding:"1px 6px" }}>{g.category}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:NAV }}>{g.name}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:riskColor(g.riskScore) }}>{g.riskScore}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Risk Score</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:"#6B7280", marginBottom:10, lineHeight:1.4 }}>{g.description}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                    <span style={{ color:"var(--muted-foreground)" }}>{g.assetCount} assets · {g.owner}</span>
                    <span style={{ color:BLU, fontWeight:700 }}>View Profile →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ══════════════ USERS ══════════════ */}
        {tab==="users" && (selectedUser ? <UserProfile user={selectedUser} onClose={() => setSelectedUser(null)}/> : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              {([
                { label:"Total Users",     value:String(eUsers.length),                                      color:NAV },
                { label:"Active",          value:String(eUsers.filter(u=>u.status==="active").length),       color:EME },
                { label:"MFA Enrolled",    value:String(eUsers.filter(u=>u.mfa).length),                     color:EME },
                { label:"MFA Missing",     value:String(eUsers.filter(u=>!u.mfa).length),                    color:RED },
                { label:"100% Policy Ack", value:String(eUsers.filter(u=>u.policyAck===u.totalPolicies).length), color:EME },
                { label:"High Risk Users", value:String(eUsers.filter(u=>u.riskScore>=50).length),           color:AMB },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search users…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:200, fontFamily:"inherit" }}/>
              {(["All",...Array.from(new Set(eUsers.map(u=>u.dept)))]).slice(0,8).map(d => (
                <button key={d} onClick={()=>setUserDeptFilter(d)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:userDeptFilter===d?NAV:  "var(--card)", color:userDeptFilter===d?"white":"#6B7280", borderColor:userDeptFilter===d?NAV:"var(--border)", flexShrink:0 }}>{d}</button>
              ))}
              <button onClick={()=>{ const e = prompt("Invite user — enter email:"); if (e && e.includes("@")) { const tok = localStorage.getItem("grc_token") ?? ""; fetch("/api/peopleops/invite", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${tok}` }, body:JSON.stringify({ email:e, role:"analyst" }) }).then(r=>r.json()).then(d=>{ alert(d.success ? `Invite recorded for ${e}. ${d.note ?? ""}` : `Failed: ${d.error ?? "unknown"}`); }).catch(()=>alert("Failed to invite — network error.")); } else if (e) { alert("Please enter a valid email."); } }} style={{ marginLeft:"auto", background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"6px 14px", fontSize:11, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit" }}>+ Invite User</button>
            </div>
            <div style={card({ padding:0, overflow:"hidden" })}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                    {["User","Email","Role","Department","MFA","Status","Policy Ack","Risk Score","Findings",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                        onClick={()=>navigate(`/settings/users/${u.id}`)}>
                      <td style={{ padding:"10px 14px", fontWeight:700, color:NAV }}>{u.name}</td>
                      <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#6B7280" }}>{u.email}</td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:700, color:PRP, background:"#F5F3FF", border:"1px solid rgba(167,139,250,0.25)", borderRadius:4, padding:"2px 6px" }}>{u.role}</span></td>
                      <td style={{ padding:"10px 14px", color:"#6B7280", fontSize:11 }}>{u.dept}</td>
                      <td style={{ padding:"10px 14px" }}>{u.mfa?<span style={{ color:EME, fontWeight:700, fontSize:11 }}>✓</span>:<span style={{ color:RED, fontWeight:800, fontSize:11 }}>✗</span>}</td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:9, fontWeight:800, color:u.status==="active"?EME:RED, background:u.status==="active"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)", border:`1px solid ${u.status==="active"?"#A7F3D0":"#FECACA"}`, borderRadius:4, padding:"2px 6px" }}>{u.status.toUpperCase()}</span></td>
                      <td style={{ padding:"10px 14px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ width:40, height:5, background:"var(--input)", borderRadius:3 }}><div style={{ height:"100%", width:`${Math.round(u.policyAck/u.totalPolicies*100)}%`, background:u.policyAck===u.totalPolicies?EME:AMB, borderRadius:3 }}/></div>
                          <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{u.policyAck}/{u.totalPolicies}</span>
                        </div>
                      </td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:13, color:riskColor(u.riskScore) }}>{u.riskScore}</span></td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:11, fontWeight:700, color:u.openFindings>5?RED:u.openFindings>0?AMB:EME }}>{u.openFindings}</span></td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:11, color:BLU, fontWeight:700 }}>View →</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* ══════════════ USER GROUPS ══════════════ */}
        {tab==="usergroups" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {([
                { label:"Total Groups",      value:"8",  color:NAV },
                { label:"Members Total",     value:"75", color:EME },
                { label:"Pending Approvals", value:"3",  color:AMB },
                { label:"Managed by AD",     value:"5",  color:BLU },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:22, fontWeight:900, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <input placeholder="Search groups…" style={{ padding:"6px 10px", borderRadius:6, border:"1px solid var(--border)", fontSize:11, width:200, fontFamily:"inherit", background:"var(--card)", color:"var(--foreground)", outline:"none" }}/>
              <button onClick={()=>alert("Group creation requires a /groups endpoint — not yet implemented. Group membership is managed via the roles table in the meantime.")} style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"7px 16px", fontSize:11, fontWeight:700, color:"var(--card)", cursor:"pointer", fontFamily:"inherit" }}>+ New Group</button>
            </div>
            <div style={card({ padding:0, overflow:"hidden" })}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                    {["Group","Type","Members","Description","Sync","Last Updated",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { id:"GRP-001", name:"GRC Admins",          type:"Manual",   members:5,  desc:"Full platform admin access",           sync:"None",       updated:"2025-12-01" },
                    { id:"GRP-002", name:"Security Team",       type:"AD Sync",  members:14, desc:"SecOps and threat analysis",           sync:"Okta",       updated:"2025-12-10" },
                    { id:"GRP-003", name:"Compliance Officers", type:"Manual",   members:4,  desc:"Framework owners and auditors",        sync:"None",       updated:"2025-11-20" },
                    { id:"GRP-004", name:"IT Operations",       type:"AD Sync",  members:14, desc:"Infra and change management",          sync:"Active Dir", updated:"2025-12-12" },
                    { id:"GRP-005", name:"Executive Viewers",   type:"Manual",   members:6,  desc:"Read-only dashboard access",           sync:"None",       updated:"2025-10-05" },
                    { id:"GRP-006", name:"Risk Analysts",       type:"AD Sync",  members:9,  desc:"Risk register and vendor management",  sync:"Okta",       updated:"2025-12-11" },
                    { id:"GRP-007", name:"Data Officers",       type:"Manual",   members:4,  desc:"GDPR / DPA data processing scope",     sync:"None",       updated:"2025-11-28" },
                    { id:"GRP-008", name:"Contractors",         type:"Manual",   members:4,  desc:"External / limited-access accounts",   sync:"None",       updated:"2025-09-15" },
                  ] as {id:string;name:string;type:string;members:number;desc:string;sync:string;updated:string}[]).map(g => (
                    <tr key={g.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <td style={{ padding:"10px 14px" }}>
                        <div style={{ fontWeight:700, color:NAV }}>{g.name}</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace" }}>{g.id}</div>
                      </td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{ fontSize:9, fontWeight:800, color:g.type==="AD Sync"?BLU:EME, background:g.type==="AD Sync"?"rgba(59,130,246,0.12)":"rgba(34,197,94,0.08)", border:`1px solid ${g.type==="AD Sync"?"rgba(99,179,237,0.25)":"#A7F3D0"}`, borderRadius:4, padding:"2px 7px" }}>{g.type}</span>
                      </td>
                      <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:NAV }}>{g.members}</td>
                      <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{g.desc}</td>
                      <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{g.sync}</td>
                      <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{g.updated}</td>
                      <td style={{ padding:"10px 14px" }}><span style={{ fontSize:11, color:BLU, fontWeight:700, cursor:"pointer" }}>Edit →</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ USER ROLES ══════════════ */}
        {tab==="roles" && (selectedRole ? <RoleProfile role={selectedRole} onClose={() => setSelectedRole(null)}/> : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {([
                { label:"Total Roles",          value:String(userRoles.length),                                                              color:NAV },
                { label:"Critical/High Risk",   value:String(userRoles.filter(r=>r.riskLevel==="Critical"||r.riskLevel==="High").length),    color:RED },
                { label:"Total Users Assigned", value:String(userRoles.reduce((s,r)=>s+r.users,0)),                                          color:BLU },
                { label:"Admin Roles",          value:String(userRoles.filter(r=>r.permissions.some(p=>p.level==="Admin")).length),           color:AMB },
              ] as {label:string;value:string;color:string}[]).map(k => (
                <div key={k.label} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
              {userRoles.map(r => (
                <div key={r.id} onClick={()=>navigate(`/settings/user-roles/${r.id}`)} style={card({ padding:"16px 20px", cursor:"pointer" })}
                     onMouseEnter={e=>(e.currentTarget.style.borderColor=NAV)} onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{r.id}</span>
                        <span style={{ fontSize:9, fontWeight:800, color:impColor(r.riskLevel), background:impBg(r.riskLevel), border:`1px solid ${impBd(r.riskLevel)}`, borderRadius:4, padding:"1px 6px" }}>{r.riskLevel.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:NAV }}>{r.name}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:NAV }}>{r.users}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Users</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:"#6B7280", marginBottom:10, lineHeight:1.4 }}>{r.description}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                    {r.permissions.slice(0,3).map(p => {
                      const lvlC = p.level==="Admin"?RED:p.level==="Write"?AMB:p.level==="Read"?EME:"var(--muted-foreground)";
                      return <span key={p.module} style={{ fontSize:9, fontWeight:700, color:lvlC, background:"var(--card)", border:"1px solid var(--border)", borderRadius:4, padding:"2px 7px" }}>{p.module}: {p.level}</span>;
                    })}
                    {r.permissions.length>3 && <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>+{r.permissions.length-3} more</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}


        {/* ══════════════ CAPABILITIES (live) ══════════════ */}
        {tab==="capabilities" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {Object.entries(OS_CAPABILITIES).map(([osName, data]) => {
              const agentCnt = liveAgents.filter(a=>a.os===data.os).length;
              const activeCaps = data.capabilities.filter(c=>c.supported).length;
              return (
                <div key={osName} style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:`${data.color}14`, border:`1.5px solid ${data.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
                      {data.icon}
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{osName}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{activeCaps}/{data.capabilities.length} capabilities active</div>
                    </div>
                    <div style={{ marginLeft:"auto" }}>
                      <PillL label={`${agentCnt} agent${agentCnt!==1?"s":""}`} color={data.color}/>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {data.capabilities.map(cap => (
                      <div key={cap.name} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                        <div style={{ width:18, height:18, borderRadius:4, background:cap.supported?"rgba(34,197,94,0.08)":"var(--card)", border:`1px solid ${cap.supported?"#A7F3D0":"var(--border)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:1, color:cap.supported?EME:"var(--muted-foreground)" }}>
                          {cap.supported?"✓":"○"}
                        </div>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:cap.supported?NAV:"var(--muted-foreground)" }}>{cap.name}</div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.4 }}>{cap.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════ INTEGRATIONS HUB ══════════════ */}
        {(tab==="connected" || tab==="marketplace" || tab==="webhooks" || tab==="pipeline") && (
          <IntegrationsHub defaultSubTab={tab} />
        )}

        {/* MED-F-064/LOW-F-020: integrations/webhooks/pipeline tabs were dead-disabled ({false && ...}).
            These features now live in the Integrations Hub. Show a redirect notice when the tab is active. */}
        {(tab==="integrations"||tab==="webhooks"||tab==="pipeline") && (
          <div style={{ padding:"40px", textAlign:"center", color:"var(--muted-foreground)", fontSize:13, background:"var(--card)", border:"1px solid var(--border)", borderRadius:12 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🔌</div>
            This section has moved to the <strong>Integrations Hub</strong>. Manage connectors, webhooks, and ingestion pipelines there.
          </div>
        )}
        {false && tab==="integrations" && (
          <>
            {/* Stats strip — replaced by IntegrationsHub above */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              {([
                { label:"Catalog",          value:CATALOG.length,                                                                              color:NAV  },
                { label:"Live Adapters",    value:liveConnectorCount,                                                                           color:"#A78BFA" },
                { label:"Connected",        value:connectedCount,                                                                               color:EME  },
                { label:"Warning/Partial",  value:connections.filter(c=>c.status==="warning"||c.status==="partial").length,                    color:AMB  },
                { label:"Assets Ingested",  value:totalAssets.toLocaleString(),                                                                 color:BLU  },
                { label:"Events/Day",       value:connections.reduce((s,c)=>s+c.eventsIngested,0).toLocaleString(),                            color:PRP  },
              ].map(k => (
                <div key={k.label} style={card({ padding:"12px 14px" })}>
                  <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.6px", textTransform:"uppercase" as const }}>{k.label}</div>
                  <div style={{ fontSize:22, fontWeight:900, fontFamily:"'JetBrains Mono',monospace", color:k.color, marginTop:4 }}>{String(k.value)}</div>
                </div>
              )))}
            </div>
            {/* Filters + Search */}
            <div style={{ display:"flex", flexDirection:"column" as const, gap:8 }}>
              {/* Search bar */}
              <div style={{ position:"relative" as const }}>
                <span style={{ position:"absolute" as const, left:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"var(--muted-foreground)", pointerEvents:"none" }}>🔍</span>
                <input
                  value={connSearch} onChange={e=>setConnSearch(e.target.value)}
                  placeholder="Search connectors by name, category, or capability…"
                  style={{ width:"100%", background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"7px 12px 7px 32px", fontSize:11, color:NAV, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }}
                />
              </div>
              {/* Category pills */}
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const, alignItems:"center" }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={()=>setCatFilter(cat)} style={{ background:catFilter===cat?NAV:"var(--card)", border:`1px solid ${catFilter===cat?NAV:"var(--border)"}`, borderRadius:6, padding:"3px 9px", fontSize:10, fontWeight:700, color:catFilter===cat?"white":"#6B7280", cursor:"pointer", fontFamily:"inherit" }}>
                    {cat}
                  </button>
                ))}
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
                  <select value={intFilter} onChange={e=>setIntFilter(e.target.value)} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize:10, fontWeight:700, color:"#6B7280", cursor:"pointer", fontFamily:"inherit", outline:"none" }}>
                    <option value="All">All Statuses</option>
                    <option value="connected">Connected</option>
                    <option value="warning">Warning / Partial</option>
                    <option value="available">Available</option>
                  </select>
                  <span style={{ fontSize:10, color:"var(--muted-foreground)", whiteSpace:"nowrap" as const }}>{filteredCatalog.length} of {CATALOG.length}</span>
                </div>
              </div>
            </div>

            {/* Gallery — grouped by category when "All" is selected */}
            {(() => {
              const groups: { label: string; items: typeof filteredCatalog }[] =
                catFilter !== "All"
                  ? [{ label: catFilter, items: filteredCatalog }]
                  : CATEGORIES.filter(c => c !== "All").reduce((acc, cat) => {
                      const items = filteredCatalog.filter(c => c.cat === cat);
                      if (items.length) acc.push({ label: cat, items });
                      return acc;
                    }, [] as { label: string; items: typeof filteredCatalog }[]);

              return groups.map(({ label, items }) => (
                <div key={label}>
                  {catFilter === "All" && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, marginTop:4 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.8px", textTransform:"uppercase" as const }}>{label}</span>
                      <span style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:"1px 7px" }}>{items.length}</span>
                      <div style={{ flex:1, height:1, background:"var(--secondary)" }}/>
                    </div>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(228px,1fr))", gap:9 }}>
                    {items.map((conn: ConnDef) => {
                      const liveConn   = connectorMap.get(conn.id);
                      const status     = (liveConn ? liveConn.status : "available") as LiveConnStatus;
                      const isAvail    = status==="available";
                      const stCol      = status==="connected"?EME:status==="warning"||status==="partial"?AMB:status==="error"?RED:"var(--muted-foreground)";
                      return (
                        <div key={conn.id}
                          style={{ background:"var(--card)", border:`1.5px solid ${isAvail?"var(--border)":`${stCol}40`}`, borderRadius:10, padding:"13px", cursor:"pointer", transition:"border-color 0.15s, background 0.15s" }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=conn.color+"55";(e.currentTarget as HTMLDivElement).style.background="var(--secondary)";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=isAvail?"var(--border)":`${stCol}40`;(e.currentTarget as HTMLDivElement).style.background="var(--card)";}}>

                          {/* Header row: logo + name + status */}
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:7 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                              {/* Logo with ini fallback */}
                              <div style={{ width:34, height:34, borderRadius:8, background:"var(--border)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
                                {conn.logoUrl ? (
                                  <img
                                    src={conn.logoUrl}
                                    alt={conn.name}
                                    width={22} height={22}
                                    style={{ objectFit:"contain" }}
                                    onError={e => {
                                      const img = e.currentTarget as HTMLImageElement;
                                      img.style.display = "none";
                                      const fb = img.nextSibling as HTMLElement;
                                      if (fb) fb.style.display = "flex";
                                    }}
                                  />
                                ) : null}
                                <div style={{ width:22, height:22, borderRadius:6, background:conn.color, display:conn.logoUrl?"none":"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color:"var(--card)" }}>
                                  {conn.ini}
                                </div>
                              </div>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:NAV, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, maxWidth:130 }}>{conn.name}</div>
                                <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                                  <span style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:600 }}>{conn.cat}</span>
                                  {conn.live && (
                                    <span style={{ fontSize:8, fontWeight:800, color:"#A78BFA", background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.3)", borderRadius:4, padding:"1px 4px", letterSpacing:"0.3px" }}>LIVE</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Status dot + label */}
                            <div style={{ display:"flex", alignItems:"center", gap:3, flexShrink:0, paddingTop:2 }}>
                              <div style={{ width:5, height:5, borderRadius:"50%", background:stCol }}/>
                              <span style={{ fontSize:8, fontWeight:800, color:stCol }}>{status.toUpperCase()}</span>
                            </div>
                          </div>

                          {/* Description */}
                          <div style={{ fontSize:9.5, color:"var(--muted-foreground)", lineHeight:1.45, marginBottom:8, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{conn.description}</div>

                          {/* Footer */}
                          {!isAvail && liveConn ? (
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9.5, paddingTop:6, borderTop:"1px solid var(--border)" }}>
                              <span style={{ color:"var(--muted-foreground)" }}>Assets: <strong style={{ color:NAV, fontFamily:"'JetBrains Mono',monospace" }}>{liveConn.assetsIngested.toLocaleString()}</strong></span>
                              <span style={{ color:"var(--muted-foreground)" }}>{liveConn.lastSync?`${Math.round((Date.now()-new Date(liveConn.lastSync).getTime())/60000)}m ago`:"—"}</span>
                            </div>
                          ) : (
                            <button style={{ width:"100%", background:`${conn.color}12`, border:`1px solid ${conn.color}28`, borderRadius:6, padding:"5px", fontSize:9.5, fontWeight:800, color:conn.color, cursor:"pointer", fontFamily:"inherit" }}>
                              + Connect
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </>
        )}

        {/* ══════════════ WEBHOOKS (live) — replaced by IntegrationsHub ══════════════ */}
        {false && tab==="webhooks" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", gap:4 }}>
                {(["all","inbound","outbound"] as const).map(d => (
                  <button key={d} onClick={()=>setWhDir(d)} style={{ background:whDir===d?NAV:  "var(--card)", border:`1px solid ${whDir===d?NAV:"var(--border)"}`, borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:whDir===d?"white":"#6B7280", cursor:"pointer", fontFamily:"inherit" }}>
                    {d.charAt(0).toUpperCase()+d.slice(1)}
                  </button>
                ))}
              </div>
              <button style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"7px 16px", fontSize:11, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit" }}>
                + New Webhook
              </button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {filteredWh.map(wh => (
                <div key={wh.id} style={card({ padding:"18px 20px" })}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:wh.direction==="inbound"?"rgba(59,130,246,0.12)":"#F5F3FF", border:`1.5px solid ${wh.direction==="inbound"?"#BFDBFE":"#DDD6FE"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:wh.direction==="inbound"?BLU:PRP }}>
                        {wh.direction==="inbound"?"↓":"↑"}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{wh.name}</div>
                        <div style={{ display:"flex", gap:6, marginTop:4 }}>
                          <PillL label={wh.direction} color={wh.direction==="inbound"?BLU:PRP}/>
                          <PillL label={wh.active?"active":"paused"} color={wh.active?EME:"var(--muted-foreground)"}/>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", textAlign:"right" as const }}>Created {new Date(wh.createdAt).toLocaleDateString()}</div>
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>
                      {wh.direction==="inbound"?"Inbound Endpoint":"Destination URL"}
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <code style={{ flex:1, background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:NAV, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                        {wh.url}
                      </code>
                      <button onClick={()=>navigator.clipboard.writeText(wh.url)} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"6px 12px", fontSize:10, fontWeight:700, color:"#6B7280", cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>Copy</button>
                    </div>
                  </div>

                  {wh.direction==="inbound" && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Signing Secret</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <code style={{ flex:1, background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 10px", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:EME, letterSpacing:"0.05em" }}>
                          ████████████████████████
                        </code>
                        <button onClick={()=>navigator.clipboard.writeText(wh.signingSecret)} style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:6, padding:"6px 12px", fontSize:10, fontWeight:700, color:EME, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>Reveal & Copy</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Event Types</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                      {wh.eventTypes.map(ev => <PillL key={ev} label={ev} color={CYN}/>)}
                    </div>
                  </div>
                </div>
              ))}
              {!filteredWh.length && (
                <div style={card({ padding:"40px", textAlign:"center" as const })}>
                  <div style={{ fontSize:13, color:"var(--muted-foreground)" }}>No webhooks configured</div>
                </div>
              )}
            </div>

            {/* Delivery log */}
            {deliveryLogs.length>0 && (
              <div style={card({ padding:0, overflow:"hidden" })}>
                <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:NAV }}>Delivery Log · Last 20 events</span>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"var(--card)", borderBottom:"1px solid var(--border)" }}>
                      {["Timestamp","Event","Status","Latency",""].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"9px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryLogs.map(log => (
                      <>
                        <tr key={log.id} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                            onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{new Date(log.ts).toLocaleString()}</td>
                          <td style={{ padding:"9px 14px" }}><PillL label={log.event} color={BLU}/></td>
                          <td style={{ padding:"9px 14px" }}><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:log.success?EME:RED }}>{log.statusCode}</span></td>
                          <td style={{ padding:"9px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{log.latencyMs}ms</td>
                          <td style={{ padding:"9px 14px" }}>
                            <button onClick={()=>setExpandedLog(expandedLog===log.id?null:log.id)} style={{ background:"none", border:"1px solid var(--border)", borderRadius:5, padding:"3px 8px", fontSize:9, fontWeight:700, color:"#6B7280", cursor:"pointer", fontFamily:"inherit" }}>
                              {expandedLog===log.id?"▲ hide":"▼ payload"}
                            </button>
                          </td>
                        </tr>
                        {expandedLog===log.id && (
                          <tr key={`${log.id}-payload`}>
                            <td colSpan={5} style={{ padding:"0 14px 10px" }}>
                              <pre style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:NAV, margin:0, whiteSpace:"pre-wrap" as const, wordBreak:"break-word" as const }}>{log.payload}</pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══════════════ PIPELINE (live) — replaced by IntegrationsHub ══════════════ */}
        {false && tab==="pipeline" && (
          <>
            {/* 7-day ingestion volume */}
            <div style={card({ padding:"18px 20px" })}>
              <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Ingestion Volume (7-day) · Events In</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {topConnectors.map(conn => {
                  const def     = CATALOG.find(d=>d.id===conn.connectorId);
                  const days    = metricsMap.get(conn.connectorId) ?? [];
                  const volumes = days.map(d=>d.volumeIn);
                  const maxVol  = Math.max(...volumes, 1);
                  return (
                    <div key={conn.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:26, height:26, borderRadius:7, background:def?.color??"var(--muted-foreground)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:  "var(--card)", flexShrink:0 }}>
                        {def?.ini??"?"}
                      </div>
                      <div style={{ width:140, fontSize:11, fontWeight:700, color:NAV, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, flexShrink:0 }}>{conn.connectorName}</div>
                      <div style={{ flex:1, display:"flex", gap:2, alignItems:"flex-end", height:28 }}>
                        {volumes.map((v,i) => (
                          <div key={i} title={`Day -${6-i}: ${v.toLocaleString()} events`}
                               style={{ flex:1, background:`${def?.color??"var(--muted-foreground)"}66`, borderRadius:"2px 2px 0 0", height:`${Math.max((v/maxVol)*100,4)}%`, minHeight:2 }}/>
                        ))}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, width:120, flexShrink:0, justifyContent:"flex-end" }}>
                        <SparklineL values={volumes} color={def?.color??NAV}/>
                        <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)", textAlign:"right" as const }}>{conn.eventsIngested.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
                {!topConnectors.length && <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>No connected integrations to show pipeline for.</div>}
              </div>
            </div>

            {/* Latency table */}
            {topConnectors.length>0 && (
              <div style={card({ padding:0, overflow:"hidden" })}>
                <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:NAV }}>P50 / P95 Latency · Latest Day</span>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ background:"var(--card)", borderBottom:"1px solid var(--border)" }}>
                      {["Connector","P50 Latency","P95 Latency","Error Rate","Trend","Status"].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"9px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topConnectors.map(conn => {
                      const days   = metricsMap.get(conn.connectorId) ?? [];
                      const latest = days[days.length-1];
                      if (!latest) return null;
                      const def    = CATALOG.find(d=>d.id===conn.connectorId);
                      const p50Col = latest.latencyP50Ms<100?EME:latest.latencyP50Ms<300?AMB:RED;
                      const errCol = latest.errorRate<0.01?EME:latest.errorRate<0.05?AMB:RED;
                      return (
                        <tr key={conn.id} style={{ borderBottom:"1px solid var(--border)" }}
                            onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <td style={{ padding:"10px 14px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ width:22, height:22, borderRadius:5, background:def?.color??"var(--muted-foreground)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:  "var(--card)" }}>{def?.ini??"?"}</div>
                              <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{conn.connectorName}</span>
                            </div>
                          </td>
                          <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:p50Col }}>{latest.latencyP50Ms}ms</td>
                          <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:latest.latencyP95Ms<500?AMB:RED }}>{latest.latencyP95Ms}ms</td>
                          <td style={{ padding:"10px 14px" }}><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:errCol }}>{(latest.errorRate*100).toFixed(2)}%</span></td>
                          <td style={{ padding:"10px 14px" }}><SparklineL values={days.map(d=>d.latencyP50Ms)} color={p50Col}/></td>
                          <td style={{ padding:"10px 14px" }}><LiveStatusBadge status={conn.status}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Error log */}
            {metrics.some(m=>(m.errors?.length??0)>0) && (
              <div style={card({ padding:"18px 20px" })}>
                <div style={{ fontSize:13, fontWeight:700, color:RED, marginBottom:12 }}>Recent Pipeline Errors</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {metrics.filter(m=>(m.errors?.length??0)>0)
                    .flatMap(m=>(m.errors??[]).map((e:{ts:string;code:string;message:string})=>({...e,connector:m.connectorName})))
                    .slice(0,10)
                    .map((err,i) => (
                      <div key={i} style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(252,165,165,0.25)", borderRadius:8, padding:"10px 14px", display:"flex", gap:12, alignItems:"center" }}>
                        <PillL label={err.code} color={RED}/>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:NAV }}>{err.connector}</div>
                          <div style={{ fontSize:10, color:"#6B7280", marginTop:2 }}>{err.message}</div>
                        </div>
                        <div style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)" }}>{new Date(err.ts).toLocaleTimeString()}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════ NOTIFICATIONS ══════════════ */}
        {tab==="notifications" && (
          <SmtpNotificationsPanel apiBase={apiBase()} authHdr={() => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" })} />
        )}

        {/* ══════════════ SCHEDULED BRIEFINGS ══════════════ */}
        {tab==="scheduled-briefings" && <ScheduledBriefingsPanel />}

        {/* ══════════════ API & MCP ACCESS ══════════════ */}
        {tab==="api-access" && <McpAccessPanel />}

        {/* ══════════════ PORTAL HUB ══════════════ */}
        {tab==="portals-list" && (() => {
          const pList = portals.length > 0 ? portals : ["ciso","cro","chro","vendor","employee"].map(t => ({
            id:null, portalType:t, displayName:PORTAL_TYPE_META[t]?.label ?? t, description:PORTAL_TYPE_META[t]?.desc ?? "", accentColor:"#3B82F6", enabled:false, widgetKeys:[], accessToken:null, lastAccessedAt:null,
          }));
          const openPortal = (p: any) => {
            setSelectedPortal(p);
            setPortalForm({ displayName:p.displayName, description:p.description, accentColor:p.accentColor, enabled:p.enabled, widgetKeys:Array.isArray(p.widgetKeys) ? p.widgetKeys : [] });
            if (p.id) {
              fetch(`${portalApiBase()}/portals/${p.id}/access-log`, { headers: portalAuthHeader() })
                .then(r => r.json()).then(d => setPortalAccessLogs(Array.isArray(d) ? d : [])).catch(() => setPortalAccessLogs([]));
            }
          };
          const savePortal = async () => {
            if (!selectedPortal?.id) return;
            setPortalSaving(true);
            await fetch(`${portalApiBase()}/portals/${selectedPortal.id}`, { method:"PATCH", headers:portalAuthHeader(), body:JSON.stringify(portalForm) });
            await rPortals();
            const updated = await fetch(`${portalApiBase()}/portals/${selectedPortal.id}`, { headers:portalAuthHeader() }).then(r=>r.json());
            setSelectedPortal(updated);
            setPortalSaving(false);
          };
          const regenToken = async () => {
            if (!selectedPortal?.id) return;
            const res = await fetch(`${portalApiBase()}/portals/${selectedPortal.id}/regenerate-token`, { method:"POST", headers:portalAuthHeader() });
            const updated = await res.json();
            setSelectedPortal(updated);
            await rPortals();
          };
          const copyUrl = (url: string) => {
            navigator.clipboard.writeText(url).then(() => { setCopyFeedback("Copied!"); setTimeout(() => setCopyFeedback(null), 2000); });
          };

          return (
            <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
              {/* Card grid */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, width: selectedPortal ? 300 : "100%", flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4 }}>
                  Five purpose-built micro-portals — shared via secure token link, no login required
                </div>
                {pList.map((p: any) => {
                  const meta = PORTAL_TYPE_META[p.portalType] ?? { label:p.displayName, icon:"🌐", desc:"" };
                  const isSelected = selectedPortal?.portalType === p.portalType;
                  const widgetCount = Array.isArray(p.widgetKeys) ? p.widgetKeys.length : 0;
                  return (
                    <div key={p.portalType} onClick={() => openPortal(p)} style={{
                      background: isSelected ? "rgba(59,130,246,0.08)" : "var(--card)",
                      border: `1px solid ${isSelected ? "#3B82F6" : "var(--border)"}`,
                      borderRadius:10, padding:"14px 16px", cursor:"pointer", transition:"all 0.15s",
                      display:"flex", alignItems:"center", gap:12,
                    }}>
                      <div style={{ width:38, height:38, borderRadius:9, background:`${p.accentColor}20`, border:`2px solid ${p.accentColor}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                        {meta.icon}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontWeight:700, fontSize:13, color:"var(--foreground)" }}>{p.displayName}</span>
                          <span style={{ fontSize:9, fontWeight:800, color:p.enabled?"#34D399":"var(--muted-foreground)", background:p.enabled?"rgba(52,211,153,0.12)":"var(--border)", borderRadius:4, padding:"1px 6px", border:`1px solid ${p.enabled?"#34D39940":"transparent"}` }}>
                            {p.enabled ? "ENABLED" : "DISABLED"}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{meta.desc}</div>
                        <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:3 }}>
                          {widgetCount} widget{widgetCount!==1?"s":""} configured
                          {p.lastAccessedAt ? ` · Last accessed ${new Date(p.lastAccessedAt).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/portals/${p.portalType}`); }}
                        style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${p.accentColor}40`, background:`${p.accentColor}10`, color:p.accentColor, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0 }}
                      >
                        Open Dashboard ↗
                      </button>
                      <span style={{ fontSize:12, color:"var(--muted-foreground)" }}>›</span>
                    </div>
                  );
                })}
              </div>

              {/* Configure panel */}
              {selectedPortal && (() => {
                const wKeys: string[] = Array.isArray(portalForm.widgetKeys) ? portalForm.widgetKeys : [];
                const catalogue = PORTAL_WIDGET_CATALOGUE[selectedPortal.portalType] ?? [];
                const shareUrl = buildPortalUrl(selectedPortal.portalType, selectedPortal.accessToken);
                return (
                  <div style={{ flex:1, background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:20, display:"flex", flexDirection:"column", gap:16 }}>
                    {/* Header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:30, height:30, borderRadius:7, background:`${selectedPortal.accentColor}20`, border:`2px solid ${selectedPortal.accentColor}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
                          {PORTAL_TYPE_META[selectedPortal.portalType]?.icon ?? "🌐"}
                        </div>
                        <div style={{ fontWeight:700, fontSize:14, color:"var(--foreground)" }}>Configure {selectedPortal.displayName}</div>
                      </div>
                      <button onClick={() => { setSelectedPortal(null); setPortalAccessLogs([]); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"var(--muted-foreground)", padding:"4px 8px" }}>✕</button>
                    </div>

                    {/* Enable toggle */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:12, color:"var(--foreground)" }}>Enable Portal</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Allow access via shareable link</div>
                      </div>
                      <button
                        onClick={() => setPortalForm((f: Record<string,any>) => ({ ...f, enabled: !f.enabled }))}
                        style={{ width:40, height:22, borderRadius:11, border:"none", background:portalForm.enabled?"#34D399":"var(--border)", cursor:"pointer", position:"relative", transition:"background 0.2s" }}
                      >
                        <div style={{ width:18, height:18, borderRadius:"50%", background:"white", position:"absolute", top:2, left:portalForm.enabled?20:2, transition:"left 0.2s" }}/>
                      </button>
                    </div>

                    {/* Display name & description */}
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>DISPLAY NAME</div>
                        <input
                          value={portalForm.displayName ?? ""}
                          onChange={e => setPortalForm((f: Record<string,any>) => ({ ...f, displayName: e.target.value }))}
                          style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:4 }}>DESCRIPTION</div>
                        <textarea
                          value={portalForm.description ?? ""}
                          onChange={e => setPortalForm((f: Record<string,any>) => ({ ...f, description: e.target.value }))}
                          rows={2}
                          style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box" }}
                        />
                      </div>
                    </div>

                    {/* Accent color */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>ACCENT COLOR</div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <input type="color" value={portalForm.accentColor ?? "#3B82F6"} onChange={e => setPortalForm((f: Record<string,any>) => ({ ...f, accentColor: e.target.value }))} style={{ width:36, height:36, border:"none", borderRadius:7, cursor:"pointer", padding:2, background:"none" }}/>
                        <input value={portalForm.accentColor ?? ""} onChange={e => setPortalForm((f: Record<string,any>) => ({ ...f, accentColor: e.target.value }))} style={{ width:100, background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }}/>
                        <div style={{ width:24, height:24, borderRadius:6, background:portalForm.accentColor ?? "#3B82F6" }}/>
                      </div>
                    </div>

                    {/* Widget picker */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>WIDGETS</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {catalogue.map(wk => {
                          const checked = wKeys.includes(wk);
                          return (
                            <label key={wk} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"6px 0", borderBottom:"1px solid var(--border)" }}>
                              <input type="checkbox" checked={checked} onChange={() => setPortalForm((f: Record<string,any>) => ({ ...f, widgetKeys: checked ? (f.widgetKeys as string[]).filter((k:string)=>k!==wk) : [...(f.widgetKeys as string[]), wk] }))} style={{ cursor:"pointer" }}/>
                              <span style={{ fontSize:12, color:"var(--foreground)", fontWeight:checked?600:400 }}>{WIDGET_LABELS[wk] ?? wk}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shareable URL */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>SHAREABLE LINK</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <input readOnly value={selectedPortal.accessToken ? shareUrl : "Enable portal & save to generate link"} style={{ flex:1, background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:11, color:"var(--muted-foreground)", fontFamily:"inherit", outline:"none" }}/>
                        {selectedPortal.accessToken && (
                          <button onClick={() => copyUrl(shareUrl)} style={{ padding:"6px 12px", borderRadius:7, border:"1px solid var(--border)", background:"var(--card)", fontSize:11, fontWeight:700, color:"var(--foreground)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                            {copyFeedback ?? "Copy"}
                          </button>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:8, marginTop:8 }}>
                        <button onClick={regenToken} style={{ padding:"6px 14px", borderRadius:7, border:"1px solid #F87171", background:"rgba(248,113,113,0.08)", fontSize:11, fontWeight:700, color:"#F87171", cursor:"pointer", fontFamily:"inherit" }}>
                          🔄 Regenerate Link
                        </button>
                        {selectedPortal.accessToken && selectedPortal.enabled && (
                          <button onClick={() => window.open(shareUrl, "_blank")} style={{ padding:"6px 14px", borderRadius:7, border:"1px solid #93C5FD", background:"rgba(147,197,253,0.08)", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>
                            Preview ↗
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Access log */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>LAST 10 ACCESSES</div>
                      {portalAccessLogs.length === 0
                        ? <div style={{ fontSize:11, color:"var(--muted-foreground)", fontStyle:"italic" }}>No accesses recorded yet</div>
                        : portalAccessLogs.map((l: any, i: number) => (
                          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid var(--border)", fontSize:11 }}>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)", fontSize:10 }}>{l.ipHash ?? "—"}</div>
                            <div style={{ color:"var(--muted-foreground)" }}>{l.accessedAt ? new Date(l.accessedAt).toLocaleString() : "—"}</div>
                          </div>
                        ))
                      }
                    </div>

                    {/* Save */}
                    <button
                      onClick={savePortal}
                      disabled={portalSaving || !selectedPortal.id}
                      style={{ padding:"10px 0", borderRadius:8, border:"none", background:`${selectedPortal.accentColor}`, color:"white", fontWeight:700, fontSize:13, cursor:portalSaving?"default":"pointer", fontFamily:"inherit", opacity:portalSaving?0.7:1 }}
                    >
                      {portalSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ══════════════ TRUST CENTER ══════════════ */}
        {tab==="trust-center-cfg" && (() => {
          const tcApiBase = portalApiBase();
          const tcAuthHdr = () => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" });

          function loadTc() {
            setTcLoading(true); setTcError(null);
            fetch(`${tcApiBase}/trust-center/config`, { headers: tcAuthHdr() })
              .then(r => r.json())
              .then(d => { setTcCfg(d); setTcLoading(false); })
              .catch(() => { setTcError("Failed to load config"); setTcLoading(false); });
          }
          if (!tcCfg && !tcLoading) { loadTc(); }

          function tcPublicUrl() {
            if (!tcCfg?.slug) return "";
            const origin = window.location.origin;
            const base = ((import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/").replace(/\/$/, "");
            const prefix = base.replace(/\/grc-platform$/, "");
            return `${origin}${prefix}/trust/${encodeURIComponent(tcCfg.slug)}`;
          }

          async function saveTc() {
            if (!tcCfg) return;
            setTcSaving(true); setTcError(null);
            try {
              const r = await fetch(`${tcApiBase}/trust-center/config`, {
                method: "PUT",
                headers: tcAuthHdr(),
                body: JSON.stringify({
                  slug: tcCfg.slug,
                  published: tcCfg.published,
                  displayName: tcCfg.displayName,
                  tagline: tcCfg.tagline,
                  accentColor: tcCfg.accentColor,
                  logoUrl: tcCfg.logoUrl,
                  customDomain: tcCfg.customDomain ?? null,
                  visibleSections: tcCfg.visibleSections,
                  certifications: tcCfg.certifications,
                  notificationEmail: tcCfg.notificationEmail ?? null,
                }),
              });
              const json = await r.json();
              if (!r.ok) { setTcError(json.error ?? "Save failed"); }
              else { setTcCfg(json); setTcSaved(true); setTimeout(() => setTcSaved(false), 2500); }
            } catch { setTcError("Network error — could not save"); }
            finally { setTcSaving(false); }
          }

          function tcToggleSection(key: string) {
            if (!tcCfg) return;
            setTcCfg((c: any) => ({ ...c, visibleSections: { ...c.visibleSections, [key]: !c.visibleSections?.[key] } }));
          }

          const SECTION_LABELS: Record<string, string> = {
            grcScore: "GRC Score Ring", frameworks: "Framework Compliance Bars",
            controls: "Control Counts", evidence: "Evidence Freshness",
            certifications: "Certification Badges", aiQa: "AI Security Q&A Widget",
            requestAccess: "Request Access Button",
          };

          function loadRequests() {
            setTcReqLoading(true);
            fetch(`${tcApiBase}/trust-center/access-requests`, { headers: tcAuthHdr() })
              .then(r => r.json())
              .then(d => { setTcRequests(Array.isArray(d) ? d : []); setTcReqLoading(false); })
              .catch(() => setTcReqLoading(false));
          }

          async function handleRequestAction(id: number, status: "approved" | "denied") {
            setTcReqActioning(id);
            try {
              const r = await fetch(`${tcApiBase}/trust-center/access-requests/${id}`, {
                method: "PUT",
                headers: tcAuthHdr(),
                body: JSON.stringify({ status }),
              });
              if (r.ok) {
                const updated = await r.json();
                setTcRequests(prev => prev.map(req => req.id === id ? updated : req));
              }
            } catch { /* silent */ }
            finally { setTcReqActioning(null); }
          }

          const embedSnippet = tcCfg?.slug ? `<iframe src="${tcPublicUrl()}" width="100%" height="800" frameborder="0" title="Trust Center" style="border-radius:12px"></iframe>` : "";

          return (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              {/* Header */}
              <div style={card({ padding:"20px 24px", background:"linear-gradient(135deg,rgba(30,58,95,0.4),rgba(6,95,70,0.15))", border:"1px solid rgba(59,130,246,0.2)" })}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:800, color:NAV, marginBottom:4 }}>🌐 Public Trust Center</div>
                    <div style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:500 }}>
                      A branded, public-facing page that shows your live compliance posture to customers and prospects — no login required.
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {tcCfg?.published
                      ? <span style={{ fontSize:10, fontWeight:800, color:EME, background:"rgba(34,197,94,0.08)", border:"1px solid #A7F3D0", borderRadius:5, padding:"3px 10px" }}>● PUBLISHED</span>
                      : <span style={{ fontSize:10, fontWeight:800, color:"#6B7280", background:"rgba(107,114,128,0.08)", border:"1px solid rgba(107,114,128,0.2)", borderRadius:5, padding:"3px 10px" }}>● UNPUBLISHED</span>
                    }
                    {tcCfg?.slug && tcCfg?.published && (
                      <button onClick={() => window.open(tcPublicUrl(), "_blank")} style={{ padding:"6px 14px", borderRadius:7, border:"1px solid #93C5FD", background:"rgba(147,197,253,0.08)", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>
                        Preview ↗
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {tcLoading && <div style={{ fontSize:12, color:"var(--muted-foreground)", textAlign:"center" as const, padding:"40px 0" }}>Loading Trust Center config…</div>}
              {tcError  && <div style={{ fontSize:12, color:RED, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(252,165,165,0.2)", borderRadius:8, padding:"10px 14px" }}>{tcError}</div>}

              {tcCfg && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                  {/* ── Left column: settings ───────────────────────────────── */}
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* Publish toggle */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Publication Status</div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:"var(--foreground)" }}>Public Trust Center</div>
                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>When enabled, anyone with the link can view this page</div>
                        </div>
                        <button
                          onClick={() => setTcCfg((c: any) => ({ ...c, published: !c.published }))}
                          style={{
                            width:48, height:26, borderRadius:13, border:"none", cursor:"pointer",
                            background: tcCfg.published ? EME : "var(--border)",
                            position:"relative" as const, transition:"background 0.2s", flexShrink:0,
                          }}
                        >
                          <div style={{ position:"absolute" as const, top:3, left: tcCfg.published ? 24 : 4, width:20, height:20, borderRadius:"50%", background:  "var(--card)", transition:"left 0.2s" }}/>
                        </button>
                      </div>
                    </div>

                    {/* Branding */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Branding</div>
                      {[
                        { label:"Page Title", key:"displayName", placeholder:"Acme Corp Trust Center" },
                        { label:"Tagline", key:"tagline", placeholder:"Our commitment to security and compliance" },
                        { label:"Slug (URL path)", key:"slug", placeholder:"acme-corp" },
                        { label:"Logo URL", key:"logoUrl", placeholder:"https://…/logo.png" },
                      ].map(f => (
                        <div key={f.key} style={{ marginBottom:12 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{f.label}</div>
                          <input
                            value={tcCfg[f.key] ?? ""}
                            onChange={e => setTcCfg((c: any) => ({ ...c, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }}
                          />
                        </div>
                      ))}
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Accent Color</div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <input type="color" value={tcCfg.accentColor ?? "#1E3A5F"} onChange={e => setTcCfg((c: any) => ({ ...c, accentColor: e.target.value }))}
                            style={{ width:36, height:36, borderRadius:7, border:"1px solid var(--border)", cursor:"pointer", background:"none", padding:2 }}/>
                          <input value={tcCfg.accentColor ?? "#1E3A5F"} onChange={e => setTcCfg((c: any) => ({ ...c, accentColor: e.target.value }))}
                            style={{ flex:1, background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"'JetBrains Mono',monospace", outline:"none" }}/>
                        </div>
                      </div>
                    </div>

                    {/* Visible sections */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Visible Sections</div>
                      {Object.entries(SECTION_LABELS).map(([key, label]) => {
                        const on = tcCfg.visibleSections?.[key] !== false;
                        return (
                          <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                            <span style={{ fontSize:12, color:"var(--foreground)" }}>{label}</span>
                            <button onClick={() => tcToggleSection(key)} style={{
                              width:40, height:22, borderRadius:11, border:"none", cursor:"pointer",
                              background: on ? EME : "var(--border)", position:"relative" as const, transition:"background 0.2s", flexShrink:0,
                            }}>
                              <div style={{ position:"absolute" as const, top:2, left: on ? 20 : 2, width:18, height:18, borderRadius:"50%", background:  "var(--card)", transition:"left 0.2s" }}/>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Certifications */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:8 }}>Certification Badges</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12 }}>One badge per line. Leave empty to show defaults.</div>
                      <textarea
                        value={(tcCfg.certifications as string[] ?? []).join("\n")}
                        onChange={e => setTcCfg((c: any) => ({ ...c, certifications: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean) }))}
                        rows={5}
                        placeholder={"SOC 2 Type II\nISO 27001:2022\nGDPR Compliant"}
                        style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"8px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none", resize:"vertical" as const }}
                      />
                    </div>

                    {/* Notifications */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:6 }}>Access Request Notifications</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12, lineHeight:1.5 }}>
                        When a visitor submits an access request, we'll send an email to this address so your team can follow up promptly.
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Notification Email</div>
                      <input
                        type="email"
                        value={tcCfg.notificationEmail ?? ""}
                        onChange={e => setTcCfg((c: any) => ({ ...c, notificationEmail: e.target.value }))}
                        placeholder="security@yourcompany.com"
                        style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"inherit", outline:"none" }}
                      />
                      <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:6 }}>Leave blank to disable email notifications.</div>
                    </div>

                    {/* Custom Domain */}
                    {(() => {
                      const domStatus: string = tcCfg.customDomainStatus ?? "unverified";
                      const statusColor = domStatus==="active" ? EME : domStatus==="failed" ? RED : AMB;
                      const statusBg    = domStatus==="active" ? "rgba(34,197,94,0.08)" : domStatus==="failed" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)";
                      const statusBd    = domStatus==="active" ? "#A7F3D0" : domStatus==="failed" ? "#FECACA" : "#FDE68A";
                      const statusLabel = domStatus==="active" ? "● ACTIVE" : domStatus==="failed" ? "✕ FAILED" : "○ UNVERIFIED";

                      async function verifyDomain() {
                        setTcDomainVerifying(true);
                        setTcDomainVerifyMsg(null);
                        try {
                          const r = await fetch(`${tcApiBase}/trust-center/verify-domain`, { method:"POST", headers: tcAuthHdr() });
                          const j = await r.json() as any;
                          if (!r.ok) { setTcDomainVerifyMsg(`Error: ${j.error ?? "Verification failed"}`); }
                          else {
                            setTcCfg((c: any) => ({ ...c, customDomainStatus: j.status, ...j.config }));
                            if (j.status === "active") { setTcDomainVerifyMsg("✓ Domain verified! CNAME is correctly configured."); }
                            else { setTcDomainVerifyMsg(`CNAME not found. Expected a CNAME pointing to trust.aigo-x.com. Records found: ${j.cnameRecords?.join(", ") || "none"}`); }
                          }
                        } catch { setTcDomainVerifyMsg("Network error during verification."); }
                        finally { setTcDomainVerifying(false); }
                      }

                      return (
                        <div style={card({ padding:"18px 20px" })}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Custom Domain</div>
                            {tcCfg.customDomain && (
                              <span style={{ fontSize:9, fontWeight:800, color:statusColor, background:statusBg, border:`1px solid ${statusBd}`, borderRadius:4, padding:"2px 8px" }}>{statusLabel}</span>
                            )}
                          </div>

                          <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:12, lineHeight:1.5 }}>
                            Host your Trust Center at your own domain (e.g. <span style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--foreground)" }}>trust.acmecorp.com</span>). Enter the domain and add a CNAME record in your DNS provider.
                          </div>

                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Custom Domain</div>
                            <input
                              value={tcCfg.customDomain ?? ""}
                              onChange={e => setTcCfg((c: any) => ({ ...c, customDomain: e.target.value, customDomainStatus: "unverified" }))}
                              placeholder="trust.acmecorp.com"
                              style={{ width:"100%", background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"var(--foreground)", fontFamily:"'JetBrains Mono',monospace", outline:"none" }}
                            />
                          </div>

                          {tcCfg.customDomain && (
                            <div style={{ background:"rgb(9,12,18)", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.5px" }}>Required DNS Record</div>
                              <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto 1fr", gap:"6px 12px", alignItems:"center" }}>
                                {[
                                  ["Type", "CNAME"],
                                  ["Name", tcCfg.customDomain],
                                  ["Target", "trust.aigo-x.com"],
                                  ["TTL", "3600"],
                                ].map(([label, val]) => (
                                  <>
                                    <span key={`lbl-${label}`} style={{ fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" as const }}>{label}</span>
                                    <span key={`val-${label}`} style={{ fontSize:11, fontWeight:600, color:EME, fontFamily:"'JetBrains Mono',monospace", wordBreak:"break-all" as const }}>{val}</span>
                                  </>
                                ))}
                              </div>
                            </div>
                          )}

                          {tcDomainVerifyMsg && (
                            <div style={{ fontSize:11, color: tcDomainVerifyMsg.startsWith("✓") ? EME : RED, background: tcDomainVerifyMsg.startsWith("✓") ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border:`1px solid ${tcDomainVerifyMsg.startsWith("✓") ? "#A7F3D0" : "#FECACA"}`, borderRadius:7, padding:"8px 12px", marginBottom:10, lineHeight:1.5 }}>
                              {tcDomainVerifyMsg}
                            </div>
                          )}

                          <button
                            onClick={verifyDomain}
                            disabled={!tcCfg.customDomain || tcDomainVerifying}
                            style={{ padding:"7px 16px", borderRadius:7, border:"1px solid #93C5FD", background:"rgba(147,197,253,0.08)", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:(!tcCfg.customDomain||tcDomainVerifying)?"default":"pointer", fontFamily:"inherit", opacity:(!tcCfg.customDomain||tcDomainVerifying)?0.5:1 }}
                          >
                            {tcDomainVerifying ? "Checking DNS…" : "Verify DNS"}
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── Right column: share + preview ───────────────────────── */}
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* Share link */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Share Link</div>
                      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                        <input readOnly value={tcCfg.published ? tcPublicUrl() : "Publish the page to get a shareable link"} style={{ flex:1, background:"var(--input)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:11, color:"var(--muted-foreground)", fontFamily:"inherit", outline:"none" }}/>
                        {tcCfg.published && (
                          <button onClick={() => { navigator.clipboard.writeText(tcPublicUrl()); setTcCopied(true); setTimeout(() => setTcCopied(false), 2000); }}
                            style={{ padding:"6px 14px", borderRadius:7, border:"1px solid var(--border)", background:"var(--card)", fontSize:11, fontWeight:700, color:"var(--foreground)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const }}>
                            {tcCopied ? "Copied!" : "Copy"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Embed snippet */}
                    <div style={card({ padding:"18px 20px" })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:8 }}>Embed Snippet</div>
                      <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:10 }}>Drop this iframe into your website to embed the Trust Center</div>
                      <textarea
                        readOnly
                        value={embedSnippet || "Publish the page to get an embed snippet"}
                        rows={4}
                        style={{ width:"100%", background:"rgb(9,12,18)", border:"1px solid var(--border)", borderRadius:7, padding:"8px 10px", fontSize:11, color: embedSnippet ? EME : "var(--muted-foreground)", fontFamily:"'JetBrains Mono',monospace", outline:"none", resize:"none" as const }}
                      />
                      {embedSnippet && (
                        <button onClick={() => navigator.clipboard.writeText(embedSnippet)} style={{ marginTop:8, padding:"6px 14px", borderRadius:7, border:"1px solid var(--border)", background:"var(--card)", fontSize:11, fontWeight:700, color:"var(--foreground)", cursor:"pointer", fontFamily:"inherit" }}>
                          Copy Snippet
                        </button>
                      )}
                    </div>

                    {/* Live mini-preview */}
                    <div style={card({ padding:"18px 20px", flex:1 })}>
                      <div style={{ fontSize:13, fontWeight:700, color:NAV, marginBottom:14 }}>Page Preview</div>
                      <div style={{ background:"#0A0F1E", borderRadius:10, padding:"20px 18px", minHeight:200 }}>
                        {/* Header */}
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
                          <div style={{ width:28, height:28, borderRadius:7, background:tcCfg.accentColor ?? NAV, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🛡</div>
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color:"white" }}>{tcCfg.displayName || "Your Trust Center"}</div>
                            {tcCfg.tagline && <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", marginTop:1 }}>{tcCfg.tagline}</div>}
                          </div>
                          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background: tcCfg.published ? "#34D399" : "#6B7280" }}/>
                            <span style={{ fontSize:8, fontWeight:700, color: tcCfg.published ? "#34D399" : "#6B7280" }}>{tcCfg.published ? "LIVE" : "DRAFT"}</span>
                          </div>
                        </div>
                        {/* Score stub */}
                        {tcCfg.visibleSections?.grcScore !== false && (
                          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, padding:"12px 14px", background:`${tcCfg.accentColor ?? NAV}18`, borderRadius:8, border:`1px solid ${tcCfg.accentColor ?? NAV}30` }}>
                            <div style={{ width:44, height:44, borderRadius:"50%", border:`3px solid ${tcCfg.accentColor ?? NAV}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <span style={{ fontSize:13, fontWeight:800, color:tcCfg.accentColor ?? NAV, fontFamily:"'JetBrains Mono',monospace" }}>—</span>
                            </div>
                            <div>
                              <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.7)" }}>Overall GRC Posture</div>
                              <div style={{ fontSize:8, color:"rgba(255,255,255,0.3)", marginTop:2 }}>Live score shown to visitors</div>
                            </div>
                          </div>
                        )}
                        {/* Section badges */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {Object.entries(SECTION_LABELS).map(([key, label]) =>
                            tcCfg.visibleSections?.[key] !== false ? (
                              <span key={key} style={{ fontSize:8, fontWeight:700, color:EME, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:4, padding:"2px 7px" }}>✓ {label}</span>
                            ) : (
                              <span key={key} style={{ fontSize:8, fontWeight:700, color:"#6B7280", background:"rgba(107,114,128,0.06)", border:"1px solid rgba(107,114,128,0.12)", borderRadius:4, padding:"2px 7px" }}>✗ {label}</span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Access Requests panel */}
              {tcCfg && (() => {
                if (tcRequests.length === 0 && !tcReqLoading) { loadRequests(); }
                const filtered = tcReqFilter === "all" ? tcRequests : tcRequests.filter(r => r.status === tcReqFilter);
                const pending = tcRequests.filter(r => r.status === "pending").length;
                return (
                  <div style={card({ padding:"18px 20px" })}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:NAV }}>Access Requests</div>
                        {pending > 0 && (
                          <span style={{ fontSize:9, fontWeight:800, color:"white", background:AMB, borderRadius:10, padding:"2px 8px" }}>{pending} pending</span>
                        )}
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        {(["all","pending","approved","denied"] as const).map(f => (
                          <button key={f} onClick={() => setTcReqFilter(f)} style={{
                            padding:"4px 10px", borderRadius:6, border:"1px solid var(--border)",
                            background: tcReqFilter === f ? NAV : "var(--card)",
                            color: tcReqFilter === f ? "white" : "var(--muted-foreground)",
                            fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textTransform:"capitalize",
                          }}>{f}</button>
                        ))}
                        <button onClick={loadRequests} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>↻</button>
                      </div>
                    </div>

                    {tcReqLoading && <div style={{ fontSize:12, color:"var(--muted-foreground)", textAlign:"center", padding:"20px 0" }}>Loading…</div>}

                    {!tcReqLoading && filtered.length === 0 && (
                      <div style={{ fontSize:12, color:"var(--muted-foreground)", textAlign:"center", padding:"20px 0", background:"var(--input)", borderRadius:8 }}>
                        No {tcReqFilter !== "all" ? tcReqFilter : ""} requests yet.
                      </div>
                    )}

                    {!tcReqLoading && filtered.length > 0 && (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {filtered.map((req: any) => {
                          const statusColor = req.status === "approved" ? EME : req.status === "denied" ? RED : AMB;
                          const statusBg    = req.status === "approved" ? "rgba(34,197,94,0.08)" : req.status === "denied" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)";
                          const statusBd    = req.status === "approved" ? "#A7F3D0" : req.status === "denied" ? "#FECACA" : "#FDE68A";
                          return (
                            <div key={req.id} style={{ padding:"12px 14px", background:"var(--input)", borderRadius:8, border:"1px solid var(--border)" }}>
                              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>{req.name}</span>
                                    <span style={{ fontSize:9, fontWeight:800, color:statusColor, background:statusBg, border:`1px solid ${statusBd}`, borderRadius:4, padding:"2px 7px", textTransform:"uppercase" }}>{req.status}</span>
                                  </div>
                                  <div style={{ fontSize:11, color:BLU, marginBottom: req.message ? 4 : 0 }}>{req.email}</div>
                                  {req.message && <div style={{ fontSize:11, color:"var(--muted-foreground)", fontStyle:"italic", lineHeight:1.5 }}>"{req.message}"</div>}
                                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>{new Date(req.createdAt).toLocaleString()}</div>
                                </div>
                                {req.status === "pending" && (
                                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                                    <button
                                      onClick={() => handleRequestAction(req.id, "approved")}
                                      disabled={tcReqActioning === req.id}
                                      style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #A7F3D0", background:"rgba(34,197,94,0.08)", fontSize:11, fontWeight:700, color:EME, cursor:"pointer", fontFamily:"inherit", opacity:tcReqActioning === req.id ? 0.5 : 1 }}
                                    >✓ Approve</button>
                                    <button
                                      onClick={() => handleRequestAction(req.id, "denied")}
                                      disabled={tcReqActioning === req.id}
                                      style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #FECACA", background:"rgba(239,68,68,0.06)", fontSize:11, fontWeight:700, color:RED, cursor:"pointer", fontFamily:"inherit", opacity:tcReqActioning === req.id ? 0.5 : 1 }}
                                    >✕ Deny</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Save button */}
              {tcCfg && (
                <button onClick={saveTc} disabled={tcSaving} style={{
                  padding:"11px 0", borderRadius:9, border:"none",
                  background: tcSaved ? EME : tcCfg.accentColor ?? NAV,
                  color:"white", fontWeight:700, fontSize:13, cursor:tcSaving?"default":"pointer",
                  fontFamily:"inherit", opacity:tcSaving?0.7:1, transition:"background 0.2s",
                }}>
                  {tcSaving ? "Saving…" : tcSaved ? "✓ Saved!" : "Save Trust Center Settings"}
                </button>
              )}
            </div>
          );
        })()}

        {/* ══════════════ SSO & DIRECTORY ══════════════ */}
        {(tab==="sso-provider" || tab==="sso-groupmap" || tab==="sso-audit") && (
          <SsoPanelRoot tab={tab} apiBase={apiBase().replace(/\/$/, "")} authHdr={() => ({ Authorization: `Bearer ${localStorage.getItem("grc_token") ?? ""}`, "Content-Type": "application/json" })} />
        )}

        {/* ══════════════ RISK SCORING (ERMS-FR-065) ══════════════ */}
        {tab==="scoring-matrix" && <RiskScoringPanel />}

        {/* ══════════════ DOCUMENTATION ══════════════ */}
        {(tab==="release-notes" || tab==="admin-guide" || tab==="sops") && (
          <SettingsDocumentation subTab={tab} />
        )}

        {/* ══════════════ WEB EMBED PACKAGE ══════════════ */}
        {tab==="embed-package" && <EmbedPackagePanel />}

        {/* ══════════════ BILLING ══════════════ */}
        {tab==="billing" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", borderRadius:14, padding:"24px 28px", color:  "var(--card)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1px", opacity:0.7, textTransform:"uppercase" as const, marginBottom:6 }}>Current Plan</div>
                  <div style={{ fontSize:28, fontWeight:800 }}>Enterprise</div>
                  <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>50 seats · All modules · AI vCISO · TPRM · CAASM</div>
                </div>
                <div style={{ textAlign:"right" as const }}><div style={{ fontSize:32, fontWeight:800 }}>$1,299</div><div style={{ fontSize:12, opacity:0.7 }}>per month</div></div>
              </div>
              <div style={{ marginTop:20, padding:"12px 16px", background:"var(--secondary)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:12, opacity:0.8 }}>Renewal date: January 15, 2026</span>
                <button style={{ background:"var(--card)", color:NAV, border:"none", borderRadius:6, padding:"6px 14px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Manage Billing</button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              {([
                { label:"Seats Used",       value:"48 / 50", sub:"2 seats available",      color:NAV },
                { label:"Storage Used",     value:"4.2 GB",  sub:"of 100 GB included",     color:EME },
                { label:"API Calls (Month)",value:"1.2M",    sub:"of 10M included",         color:"var(--foreground)" },
              ]).map(k => (
                <div key={k.label} style={card({ padding:"16px 20px" })}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:6 }}>{k.label}</div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      {deployOpen && <AgentDeployDrawer onClose={() => setDeployOpen(false)} />}
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import IntegrationsHub from "@/components/IntegrationsHub";
import SettingsDocumentation from "@/pages/SettingsDocumentation";
import { useOrg } from "@/context/OrgContext";
import { SubNav, ModuleHeader } from "@/components/SubNav";
import { useLocation } from "wouter";
import { allAgents, extendedUsers, userRoles, assetGroups, allAssets, type Agent, type GRCUser, type UserRole, type AssetGroup, type Asset } from "@/lib/grc-data";
import { CATALOG, CATEGORIES, OS_CAPABILITIES, type ConnDef } from "@/lib/agent-catalog";

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
    const api   = base.replace(/grc-platform\/?$/, "api");
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
  return base.replace(/grc-platform\/?$/, "api");
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
  const d = status==="online"||status==="connected"?"#A7F3D0":status==="warning"||status==="partial"?"#FDE68A":status==="offline"||status==="error"||status==="stale"?"#FECACA":"rgba(255,255,255,0.1)";
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
    <div style={{ width:40, height:22, borderRadius:11, background:enabled?"linear-gradient(135deg,#1E3A5F,#065F46)":"rgba(255,255,255,0.1)", position:"relative", cursor:"pointer", flexShrink:0 }}>
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
function LiveAgentDetail({ agent, onClose }: { agent:LiveAgent; onClose:() => void }) {
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
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:EME }}>{agent.telemetry.assetsDiscovered.toLocaleString()}</div>
            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>Assets Discovered</div>
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
  return base.replace(/grc-platform\/?$/, "api");
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
  const apiBase = base.replace(/grc-platform\/?$/, "api");
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
function BrowserExtPanel() {
  const [beExts, setBeExts] = useState<any[]>([]);
  const [beEvts, setBeEvts] = useState<any[]>([]);
  const [beStat, setBeStat] = useState<any>({ count:0, activeCount:0, aiToolCount24h:0, shadowItCount24h:0, policyViolations24h:0, managedCount:0 });
  const [beLoad, setBeLoad] = useState(true);

  const base    = (import.meta as { env: Record<string,string> }).env["BASE_URL"] ?? "/grc-platform/";
  const apiBase = base.replace(/grc-platform\/?$/, "api");
  const hdrs    = () => ({ Authorization:`Bearer ${localStorage.getItem("grc_token")??""}`, "Content-Type":"application/json" });

  const fetchAll = () => {
    setBeLoad(true);
    Promise.all([
      fetch(`${apiBase}browser-agent/extensions`, { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${apiBase}browser-agent/events?limit=100`, { headers:hdrs() }).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(`${apiBase}browser-agent/status`, { headers:hdrs() }).then(r=>r.ok?r.json():{}).catch(()=>({})),
    ]).then(([exts,evts,stat])=>{ setBeExts(exts||[]); setBeEvts(evts||[]); setBeStat(stat||{}); }).finally(()=>setBeLoad(false));
  };
  useEffect(()=>{ fetchAll(); }, []);

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
        <div style={{ marginBottom:14, padding:"10px 14px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.18)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", lineHeight:1.6 }}>
          <b style={{ color:"#93C5FD" }}>Enterprise distribution only.</b> The AIGO-X browser agent is not published to public browser stores — it is distributed directly to your devices via GPO, Intune, or manual load. Download the package below and follow the README instructions.
        </div>

        {/* Download extension package buttons */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
          {([
            { name:"Chrome",  icon:"bi-browser-chrome",  color:"#4285F4", browser:"chrome",  badge:"v2.4.1", note:"Manifest V3 · MV3",   steps:["Open chrome://extensions","Enable Developer mode","Click Load unpacked","Select unzipped folder"] },
            { name:"Edge",    icon:"bi-browser-edge",    color:"#0078D4", browser:"edge",    badge:"v2.4.1", note:"Manifest V3 · MV3",   steps:["Open edge://extensions","Enable Developer mode","Click Load unpacked","Select unzipped folder"] },
            { name:"Firefox", icon:"bi-browser-firefox", color:"#FF7139", browser:"firefox", badge:"v2.4.1", note:"Manifest V2 · MV2",   steps:["Open about:debugging","Click Load Temporary Add-on","Select manifest.json","Permanent: use XPI"] },
          ] as {name:string;icon:string;color:string;browser:string;badge:string;note:string;steps:string[]}[]).map(b => {
            const doDownload = async () => {
              try {
                const res = await fetch(`${apiBase.replace(/\/$/, "")}/browser-extension/download?browser=${b.browser}`, { headers: hdrs() });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href     = url;
                a.download = `aigo-x-browser-agent-v2.4.1-${b.browser}.zip`;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              } catch (e) { alert(`Download failed: ${e}`); }
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
          <div style={{ fontSize:14, fontWeight:800, color:NAV }}>Browser Extension Fleet Management</div>
          <div style={{ fontSize:12, color:"var(--muted-foreground)", marginTop:2 }}>Monitor and manage enrolled browser extensions across your fleet</div>
        </div>
        <button onClick={fetchAll} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", fontSize:12, fontWeight:600, color:"var(--muted-foreground)", cursor:"pointer", fontFamily:"inherit" }}>
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
                  const [tbg,tbd,tc]=typeMap[e.type as string]??["rgba(255,255,255,0.06)","rgba(255,255,255,0.15)","var(--muted-foreground)"];
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
          <button onClick={()=>{ const cfg=JSON.stringify({ apiBase:`${window.location.origin}${(import.meta.env.BASE_URL??"/grc-platform/").replace(/\/$/,"")}/api`, enforced:true, logAiTools:true, logShadowIt:true, blockAiTools:false, blockShadowIt:false },null,2); navigator.clipboard?.writeText(cfg).then(()=>alert("Config JSON copied to clipboard!")); }}
            style={{ background:"rgba(147,197,253,0.12)", border:"1px solid rgba(147,197,253,0.3)", borderRadius:8, padding:"8px 16px", fontSize:11, fontWeight:700, color:"#93C5FD", cursor:"pointer", fontFamily:"inherit" }}>
            <i className="bi bi-clipboard" style={{ marginRight:6 }} />Copy Managed Config JSON
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

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function Settings() {
  const [, navigate] = useLocation();
  const { orgName: currentOrg, viewTenantId } = useOrg();
  const orgDomain    = viewTenantId === 2 ? "globex.com"  : viewTenantId === 3 ? "initech.com"  : "acme.com";
  const orgTenantRef = viewTenantId === 2 ? "TEN-GLOBEX-002" : viewTenantId === 3 ? "TEN-INITECH-003" : "TEN-ACME-001";
  const eUsers  = (viewTenantId === 1 ? extendedUsers : []) as typeof extendedUsers;
  const eAssets = (viewTenantId === 1 ? allAssets      : []) as typeof allAssets;
  // ── existing state
  const [tab, setTab]                               = useState("profile");
  const [section, setSection]                       = useState("general");
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

  // ── new hub state
  const [selectedLiveAgent, setSelectedLiveAgent]   = useState<LiveAgent|null>(null);
  const [catFilter, setCatFilter]                   = useState("All");
  const [intFilter, setIntFilter]                   = useState("All");
  const [connSearch, setConnSearch]                 = useState("");
  const [whDir, setWhDir]                           = useState<"all"|"inbound"|"outbound">("all");
  const [expandedLog, setExpandedLog]               = useState<string|null>(null);

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
  const liveAssets = useMemo(() =>
    caasmRaw.length > 0
      ? caasmRaw.map((a: any) => ({
          id:             String(a.id),
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
        }))
      : eAssets.map(a => ({
          id: a.id, name: a.name, type: a.type, platform: a.platform,
          criticality: a.criticality as "Critical"|"High"|"Medium"|"Low",
          environment: a.environment, owner: a.owner,
          ip: a.ipAddress ?? "—", riskScore: a.riskScore, openFindings: a.openFindings,
          dataSensitivity: a.dataSensitivity, status: a.status, tags: a.tags,
        }))
  , [caasmRaw]);

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
    { key:"agents",       label:"Agents",          icon:"⬡",
      subs:[{ key:"download", label:"Download" },{ key:"agents", label:"Policy", count:allAgents.length, dot:allAgents.some(a=>a.status==="offline")?RED:allAgents.some(a=>a.status==="warning")?AMB:undefined },{ key:"capabilities", label:"Capabilities" },{ key:"agent-tokens", label:"Agent Tokens" },{ key:"browser-extension", label:"Browser Extension" }] },
    { key:"assets",       label:"Assets",          icon:"🖥",
      subs:[{ key:"assets", label:"Devices", count:liveAssets.length },{ key:"assetgroups", label:"Groups", count:assetGroups.length }] },
    { key:"integrations", label:"Integrations",    icon:"⇌",
      subs:[{ key:"connected", label:"Connected", count:connectedCount||undefined },{ key:"marketplace", label:"Marketplace" },{ key:"webhooks", label:"Webhooks", count:webhooks.length||undefined },{ key:"pipeline", label:"Pipeline" }] },
    { key:"portals",      label:"Portals",         icon:"⊞",
      subs:[{ key:"portals-list", label:"Portals", count:portals.length || 5 }] },
    { key:"trust-center", label:"Trust Center",    icon:"🌐",
      subs:[{ key:"trust-center-cfg", label:"Configuration" }] },
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
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"rgb(9,12,18)", overflow:"hidden" }}>
      <ModuleHeader
        title="Settings"
        description="General · User Management · Agents · Assets · Integrations · Documentation"
      />
      {/* Section nav */}
      <div style={{ display:"flex", gap:2, padding:"0 20px", background:"rgb(9,12,18)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
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
      <div style={{ display:"flex", gap:4, padding:"8px 20px", background:"var(--card)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
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
                <button key={s} onClick={()=>setAgentStatusFilter(s)} style={{ padding:"4px 12px", borderRadius:6, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", background:agentStatusFilter===s?NAV:  "var(--card)", color:agentStatusFilter===s?"white":"#6B7280", borderColor:agentStatusFilter===s?NAV:"rgba(255,255,255,0.1)", textTransform:"capitalize" as const }}>{s}</button>
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
                      { label:"Windows (Endpoint)", feeds:["complyops","assetops","secops","serviceops"] },
                      { label:"Linux (Server)",     feeds:["complyops","assetops","secops","serviceops"] },
                      { label:"macOS (Workstation)",feeds:["complyops","assetops","secops"] },
                      { label:"Mobile (MDM Bridge)",feeds:["complyops","assetops","serviceops"] },
                      { label:"Cloud (CSPM Agent)", feeds:["assetops","dataops","secops"] },
                    ] as {label:string;feeds:string[]}[]).map((row, i) => (
                      <tr key={row.label} style={{ borderBottom:"1px solid var(--border)", background: i%2===0?"transparent":"rgba(255,255,255,0.015)" }}>
                        <td style={{ padding:"8px 12px", fontWeight:700, color:"var(--foreground)" }}>{row.label}</td>
                        {["complyops","assetops","dataops","secops","serviceops"].map(m => (
                          <td key={m} style={{ padding:"8px 12px", textAlign:"center" as const }}>
                            {row.feeds.includes(m)
                              ? <span style={{ display:"inline-block", width:18, height:18, borderRadius:4, background:"rgba(34,197,94,0.12)", border:"1px solid #A7F3D066", fontSize:11, lineHeight:"18px", color:EME }}>✓</span>
                              : <span style={{ display:"inline-block", width:18, height:18, borderRadius:4, background:"transparent", border:"1px solid rgba(255,255,255,0.08)", fontSize:11, lineHeight:"18px", color:"var(--muted-foreground)" }}>—</span>
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
            {/* Assets table */}
            <div style={card({ padding:0, overflow:"hidden" })}>
              <div style={{ overflowX:"auto" as const }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #F3F4F6", background:"#F9FAFB" }}>
                      {["ID","Asset Name","Type","Environment","Criticality","Data Sensitivity","Owner","Risk","Findings","Status",""].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"#9CA3AF", fontWeight:700, fontSize:10, textTransform:"uppercase" as const, letterSpacing:"0.5px", whiteSpace:"nowrap" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(a => (
                      <tr key={a.id} style={{ borderBottom:"1px solid #F9FAFB", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="#F9FAFB")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>navigate(`/settings/assets/${a.id}`)}>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#9CA3AF" }}>{a.id}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <div style={{ fontWeight:700, color:NAV }}>{a.name}</div>
                          <div style={{ fontSize:10, color:"#9CA3AF", marginTop:2 }}>{a.platform}</div>
                        </td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{a.type}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:9, fontWeight:700, color:a.environment==="Production"?RED:a.environment==="Corporate"?AMB:BLU, background:a.environment==="Production"?"#FEF2F2":a.environment==="Corporate"?"#FFFBEB":"#EFF6FF", border:`1px solid ${a.environment==="Production"?"#FECACA":a.environment==="Corporate"?"#FDE68A":"#BFDBFE"}`, borderRadius:4, padding:"2px 6px" }}>{a.environment}</span>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:9, fontWeight:800, color:impColor(a.criticality), background:impBg(a.criticality), border:`1px solid ${impBd(a.criticality)}`, borderRadius:4, padding:"2px 6px" }}>{a.criticality}</span>
                        </td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{a.dataSensitivity}</td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{a.owner}</td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:12, color:riskColor(a.riskScore) }}>{a.riskScore}</span>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:11, fontWeight:700, color:a.openFindings>5?RED:a.openFindings>0?AMB:EME }}>{a.openFindings}</span>
                        </td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontSize:9, fontWeight:800, color:a.status==="active"?EME:RED, background:a.status==="active"?"#ECFDF5":"#FEF2F2", border:`1px solid ${a.status==="active"?"#A7F3D0":"#FECACA"}`, borderRadius:4, padding:"2px 6px" }}>{a.status.toUpperCase()}</span>
                        </td>
                        <td style={{ padding:"10px 14px" }}><span style={{ fontSize:11, color:BLU, fontWeight:700 }}>View →</span></td>
                      </tr>
                    ))}
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
                <button key={c} onClick={()=>setGroupCatFilter(c)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:groupCatFilter===c?NAV:  "var(--card)", color:groupCatFilter===c?"white":"#6B7280", borderColor:groupCatFilter===c?NAV:"rgba(255,255,255,0.1)", flexShrink:0 }}>{c}</button>
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
                <button key={d} onClick={()=>setUserDeptFilter(d)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:userDeptFilter===d?NAV:  "var(--card)", color:userDeptFilter===d?"white":"#6B7280", borderColor:userDeptFilter===d?NAV:"rgba(255,255,255,0.1)", flexShrink:0 }}>{d}</button>
              ))}
              <button style={{ marginLeft:"auto", background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"6px 14px", fontSize:11, fontWeight:700, color:  "var(--card)", cursor:"pointer", fontFamily:"inherit" }}>+ Invite User</button>
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
              <button style={{ background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", borderRadius:8, padding:"7px 16px", fontSize:11, fontWeight:700, color:"var(--card)", cursor:"pointer", fontFamily:"inherit" }}>+ New Group</button>
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
                        <div style={{ width:18, height:18, borderRadius:4, background:cap.supported?"rgba(34,197,94,0.08)":"var(--card)", border:`1px solid ${cap.supported?"#A7F3D0":"rgba(255,255,255,0.1)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:1, color:cap.supported?EME:"var(--muted-foreground)" }}>
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
                  style={{ width:"100%", background:"var(--card)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"7px 12px 7px 32px", fontSize:11, color:NAV, outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }}
                />
              </div>
              {/* Category pills */}
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const, alignItems:"center" }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={()=>setCatFilter(cat)} style={{ background:catFilter===cat?NAV:"var(--card)", border:`1px solid ${catFilter===cat?NAV:"rgba(255,255,255,0.1)"}`, borderRadius:6, padding:"3px 9px", fontSize:10, fontWeight:700, color:catFilter===cat?"white":"#6B7280", cursor:"pointer", fontFamily:"inherit" }}>
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
                              <div style={{ width:34, height:34, borderRadius:8, background:"var(--border)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
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
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9.5, paddingTop:6, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
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
                  <button key={d} onClick={()=>setWhDir(d)} style={{ background:whDir===d?NAV:  "var(--card)", border:`1px solid ${whDir===d?NAV:"rgba(255,255,255,0.1)"}`, borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:700, color:whDir===d?"white":"#6B7280", cursor:"pointer", fontFamily:"inherit" }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <SCard title="Alert Preferences">
              <Toggle label="Critical risk alerts"          enabled={true}  sub="Immediate notification via email + Slack"/>
              <Toggle label="High risk alerts"              enabled={true}  sub="Notification within 1 hour"/>
              <Toggle label="Medium risk alerts"            enabled={false} sub="Daily digest"/>
              <Toggle label="Compliance deadline reminders" enabled={true}  sub="7 days and 1 day before deadline"/>
              <Toggle label="DSAR SLA warnings"             enabled={true}  sub="3 days before SLA breach"/>
              <Toggle label="Audit schedule reminders"      enabled={true}  sub="14 days before scheduled audit"/>
            </SCard>
            <SCard title="Report Delivery">
              <Toggle label="AI vCISO daily digest"         enabled={false} sub="Summary of AI insights"/>
              <Toggle label="Weekly risk summary email"     enabled={true}  sub="Every Monday 9am"/>
              <Toggle label="Monthly compliance report"     enabled={true}  sub="First Monday of the month"/>
              <Toggle label="Slack integration alerts"      enabled={true}  sub="#grc-alerts channel"/>
              <div style={{ marginTop:8 }}><Field label="Alert Email Address" value="security@acme.com"/></div>
            </SCard>
          </div>
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
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, paddingBottom:12, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
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
              <div style={{ marginTop:20, padding:"12px 16px", background:"rgba(255,255,255,0.12)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
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
    </div>
  );
}

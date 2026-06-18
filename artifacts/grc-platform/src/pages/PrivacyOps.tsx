// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { useOrg } from "@/context/OrgContext";
import { useLicense } from "@/context/LicenseContext";
import { LockedModule } from "@/components/LockedModule";
import { useDsars, usePrivacyRopa, usePrivacyDpias, usePrivacyNotices, usePrivacyConsent, usePrivacyDpas, usePrivacyRegs, usePrivacyScore } from "@/hooks/useGrcApi";
import { SubNav, ModuleHeader, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { getStoredToken } from "@/lib/auth-utils";
import WorkflowPipeline, { PRIVACY_DSAR_WF } from "@/components/WorkflowPipeline";

// ── Design tokens ───────────────────────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const RED = "#F87171";
const AMB = "#FCD34D";
const BLU = "#60A5FA";
const PRP = "#A78BFA";
const CYN = "#22D3EE";
const PNK = "#F472B6";

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.40)", ...extra,
});

function KpiCard({ label, value, sub, color = NAV, icon, alert, onClick }: any) {
  return (
    <div onClick={onClick}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(147,197,253,0.35)"; } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLElement).style.borderColor = alert ? RED : "rgba(255,255,255,0.1)"; } : undefined}
      style={card({ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderColor: alert ? RED : "rgba(255,255,255,0.1)", cursor: onClick ? "pointer" : undefined })}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color, letterSpacing: "-0.5px", fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ScoreGaugeSVG({ value, max = 100, size = 100 }: { value: number; max?: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size * 0.52;
  const pct = value / max;
  const arcLen = Math.PI * r;
  const color = value >= 75 ? EME : value >= 55 ? AMB : RED;
  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
      <path d={`M${cx-r},${cy} A${r},${r} 0 0 1 ${cx+r},${cy}`} stroke="rgba(255,255,255,0.07)" strokeWidth={size*0.1} fill="none" strokeLinecap="round" />
      <path d={`M${cx-r},${cy} A${r},${r} 0 0 1 ${cx+r},${cy}`} stroke={color} strokeWidth={size*0.1} fill="none" strokeLinecap="round"
        strokeDasharray={`${pct*arcLen} ${arcLen}`} />
      <text x={cx} y={cy-2} textAnchor="middle" fontSize={size*0.19} fontWeight={900} fill={color} fontFamily="JetBrains Mono,monospace">{value}</text>
      <text x={cx} y={cy+size*0.1} textAnchor="middle" fontSize={size*0.09} fill="rgba(148,163,184,0.6)">/{max}</text>
    </svg>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 28, textAlign: "right", fontFamily: "monospace" }}>{pct}%</span>
    </div>
  );
}

function Chip({ label, color = NAV }: { label: string; color?: string }) {
  return <span style={{ fontSize: 9, fontWeight: 700, background: `${color}18`, border: `1px solid ${color}33`, borderRadius: 4, padding: "2px 6px", color, whiteSpace: "nowrap" }}>{label}</span>;
}

// ── Status helpers ──────────────────────────────────────────────────────────
const sc: Record<string, { bg: string; color: string; border: string }> = {
  compliant:      { bg:"rgba(52,211,153,0.08)",  color: EME, border:"rgba(52,211,153,0.3)"  },
  "in-progress":  { bg:"rgba(96,165,250,0.10)",  color: BLU, border:"rgba(96,165,250,0.3)"  },
  partial:        { bg:"rgba(252,211,77,0.08)",  color: AMB, border:"rgba(252,211,77,0.3)"  },
  gap:            { bg:"rgba(248,113,113,0.08)", color: RED, border:"rgba(248,113,113,0.3)" },
  na:             { bg:"rgba(148,163,184,0.06)", color:"var(--muted-foreground)", border:"rgba(148,163,184,0.2)" },
  published:      { bg:"rgba(52,211,153,0.08)",  color: EME, border:"rgba(52,211,153,0.3)"  },
  draft:          { bg:"rgba(148,163,184,0.06)", color:"var(--muted-foreground)", border:"rgba(148,163,184,0.2)" },
  review:         { bg:"rgba(252,211,77,0.08)",  color: AMB, border:"rgba(252,211,77,0.3)"  },
  approved:       { bg:"rgba(52,211,153,0.08)",  color: EME, border:"rgba(52,211,153,0.3)"  },
  active:         { bg:"rgba(52,211,153,0.08)",  color: EME, border:"rgba(52,211,153,0.3)"  },
  expired:        { bg:"rgba(248,113,113,0.08)", color: RED, border:"rgba(248,113,113,0.3)" },
  "expiring-soon":{ bg:"rgba(252,211,77,0.08)",  color: AMB, border:"rgba(252,211,77,0.3)"  },
  contained:      { bg:"rgba(252,211,77,0.08)",  color: AMB, border:"rgba(252,211,77,0.3)"  },
  closed:         { bg:"rgba(52,211,153,0.08)",  color: EME, border:"rgba(52,211,153,0.3)"  },
  notified:       { bg:"rgba(96,165,250,0.10)",  color: BLU, border:"rgba(96,165,250,0.3)"  },
  investigating:  { bg:"rgba(248,113,113,0.08)", color: RED, border:"rgba(248,113,113,0.3)" },
  open:           { bg:"rgba(248,113,113,0.08)", color: RED, border:"rgba(248,113,113,0.3)" },
};
function StatusBadge({ s }: { s: string }) {
  const ss = sc[s?.toLowerCase()] ?? sc.na;
  return <span style={{ ...ss, borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, border: `1px solid ${ss.border}`, whiteSpace: "nowrap" }}>{s}</span>;
}
const regColor: Record<string,string> = { GDPR:"#1D4ED8",CCPA:"#D97706",LGPD:"#065F46",PDPA:"#7C3AED",PDPL:"#0891B2",DPDP:"#DC2626",NIS2:"#0891B2",HIPAA:"#DC2626",COPPA:"#F59E0B" };

// ══════════════════════════════════════════════════════════════════════════════
// ── SEED DATA ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── RoPA (25+ records) ──────────────────────────────────────────────────────
const _ropa: any[] = [];

// ── DPIA (10+ records) ──────────────────────────────────────────────────────
const _dpias: any[] = [];
const dpiaSteps = [
  { step:1, title:"Describe the processing",           guidance:"Document what data is processed, by whom, why, and how." },
  { step:2, title:"Assess necessity & proportionality",guidance:"Is the processing limited to what is necessary? Are less-intrusive alternatives available?" },
  { step:3, title:"Identify & assess risks",           guidance:"Identify risks to individuals. Consider likelihood and severity." },
  { step:4, title:"Identify mitigation measures",      guidance:"What technical and organisational measures will reduce identified risks?" },
  { step:5, title:"DPO consultation",                  guidance:"Consult the DPO and record their advice." },
  { step:6, title:"Sign-off & approval",               guidance:"CISO and DPO sign off. Record residual risk acceptance." },
];

// ── Privacy Notices (12+ records) ───────────────────────────────────────────
const _notices: any[] = [];

// ── DSARs — 247 total (20 shown in table, rest in aggregated stats) ─────────
const _dsars: any[] = [];
const dsarStats = { total:0, open:0, overdue:0, completedThisMonth:0, avgDaysLeft:0, slaCompliance:0 };

// ── Consent Analytics (aggregated — 5,847 records) ──────────────────────────
const consentStats = { total:0, active:0, expired:0, withdrawn:0, byChannel:[], byJurisdiction:[], byPurpose:[], abTests:[] };

// ── DPA Tracker (40+ vendors) ───────────────────────────────────────────────
const _dpas: any[] = [];
const dpaStats = {
  total: _dpas.length,
  active: _dpas.filter(d=>d.status==="active").length,
  expiringSoon: _dpas.filter(d=>d.status==="expiring-soon").length,
  expired: _dpas.filter(d=>d.status==="expired").length,
  missingSccs: _dpas.filter(d=>!d.dpo).length,
};

// ── Regulatory Tracker (150+ regulations) ───────────────────────────────────
const _regs: any[] = [];
const regStats = {
  total: _regs.length,
  compliant: _regs.filter(r=>r.status==="compliant").length,
  partial: _regs.filter(r=>r.status==="partial").length,
  gap: _regs.filter(r=>r.status==="gap").length,
  upcoming: _regs.filter(r=>r.deadline!=="Ongoing" && r.deadline>new Date().toISOString().slice(0,10)).length,
};

// ── Breach Management ────────────────────────────────────────────────────────
const _breaches: any[] = [];
const breachKpis = { totalBreaches:0, openInvestigations:0, avgResponseHours:0, dpaNotifications:0, affectedTotal:0, slaCompliance:0 };
const breachTimeline72h = { elapsed:0, total:72 };

// ── Cookie Compliance ────────────────────────────────────────────────────────
const _cookies: any[] = [];
const cookieStats = {
  total: _cookies.length, firstParty: _cookies.filter(c=>c.party==="1st").length,
  thirdParty: _cookies.filter(c=>c.party==="3rd").length,
  marketing: _cookies.filter(c=>c.type==="Marketing").length,
  analytics: _cookies.filter(c=>c.type==="Analytics").length,
  functional: _cookies.filter(c=>c.type==="Functional").length,
  necessary: _cookies.filter(c=>c.type==="Strictly Necessary").length,
  iabNonCompliant: _cookies.filter(c=>!c.iabCompliant).length,
  optInRate: 0,
};
const cookieBannerPerf: any[] = [];

// ── Cross-Border Transfer Hub ─────────────────────────────────────────────────
const _transfers: any[] = [];
const transferStats = {
  total: _transfers.length, active: _transfers.filter(t=>t.status==="active").length,
  underReview: _transfers.filter(t=>t.status==="review").length,
  blocked: _transfers.filter(t=>t.status==="blocked").length,
  adequacy: _transfers.filter(t=>t.mechanism.includes("Adequacy")).length,
  sccs: _transfers.filter(t=>t.mechanism.includes("SCCs")).length,
  bcr: 0,
  derogation: _transfers.filter(t=>t.mechanism==="Derogation").length,
};
const adequacyCountries = ["UK","Switzerland","Japan","Canada","Israel","New Zealand","South Korea","Argentina","Uruguay","Andorra","Faroe Islands","Guernsey","Isle of Man","Jersey","Monaco"];

// ── AI Data Governance ────────────────────────────────────────────────────────
const _aiModels: any[] = [];
const aiStats = { total:0, approved:0, underReview:0, gap:0, shadowAI:0, autoDec:0, personalDataUse:0 };

// ── Children's Privacy ────────────────────────────────────────────────────────
const _childApps: any[] = [];
const childrenStats = { appsAudited:0, coppaCompliant:0, gdpr8Compliant:0, aadcCompliant:0, gaps:0, parentalConsentRate:0 };

// ── Vendor Privacy Assessment ─────────────────────────────────────────────────
const _vendors: any[] = [];
const vendorStats = {
  total: _vendors.length, approved: _vendors.filter(v=>v.status==="approved").length,
  inRemediation: _vendors.filter(v=>v.status==="remediation").length,
  gap: _vendors.filter(v=>v.status==="gap").length,
  breachHistory: _vendors.filter(v=>v.breachHistory>0).length,
  avgScore: _vendors.length > 0 ? Math.round(_vendors.reduce((s,v)=>s+v.score,0)/_vendors.length) : 0,
};
const maturityDimensions: any[] = [];
const iso31700: any[] = [];

// ── Employee Privacy ─────────────────────────────────────────────────────────
const _empActivities: any[] = [];
const empStats = { total:0, compliant:0, gap:0, partial:0, monitoringActivities:0, worksCouncilNeeded:0 };

// ── Global Privacy Health Score ───────────────────────────────────────────────
const PRIVACY_SCORE = 0;
const PRIVACY_SCORE_TREND: number[] = [];

// ══════════════════════════════════════════════════════════════════════════════
// ── DSR Fulfilment Pipeline Component ────────────────────────────────────────
function DsrFulfilmentPipeline({ dsarId, dsar, connectors }: { dsarId: string; dsar?: any; connectors: any[] }) {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dsarId) return;
    setLoading(true);
    const tok = getStoredToken();
    fetch(`/api/privacy/dsr-pipeline/${encodeURIComponent(dsarId)}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : { stores: [] })
      .then(d => { setStores(Array.isArray(d.stores) ? d.stores : []); setLoading(false); })
      .catch(() => { setStores([]); setLoading(false); });
  }, [dsarId]);

  const total = stores.length;
  const completed = stores.filter(s => s.status === "completed" || s.status === "not-found").length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statusCfg: Record<string, { color: string; label: string; icon: string }> = {
    completed:    { color: EME,       label: "Completed ✓", icon: "✅" },
    "in-progress":{ color: AMB,       label: "In Progress", icon: "⏳" },
    "not-found":  { color: "#64748B", label: "Not Found",   icon: "—"  },
    pending:      { color: "#64748B", label: "Pending",     icon: "◷"  },
  };

  // Derive stage statuses from pipeline store data + DSAR object
  const anyNonPending   = stores.some(s => s.status !== "pending");
  const anyActioned     = stores.some(s => s.status === "completed" || s.status === "not-found" || s.status === "in-progress");
  const anyCompleted    = stores.some(s => s.status === "completed" || s.status === "not-found");
  const allCompleted    = total > 0 && stores.every(s => s.status === "completed" || s.status === "not-found");
  const isClosed        = dsar?.status === "completed" || dsar?.status === "closed";

  const firstActionDate = stores.filter(s=>s.actionedAt).map(s=>s.actionedAt).sort()[0] || "";
  const lastActionDate  = stores.filter(s=>s.actionedAt).map(s=>s.actionedAt).sort().pop() || "";

  const STAGES: { label: string; icon: string; done: boolean; ts: string; desc: string }[] = [
    { label:"Identified",  icon:"📬", done:true,         ts: dsar?.received || "",    desc:"DSAR received and registered in the system" },
    { label:"Located",     icon:"🔍", done:anyNonPending, ts: dsar?.received || "",   desc:"Data stores scanned — subjects located across connected systems" },
    { label:"Actioned",    icon:"⚙", done:anyActioned,   ts: firstActionDate,         desc:"Deletion, export, or rectification actioned in connected stores" },
    { label:"Verified",    icon:"✅", done:allCompleted,  ts: lastActionDate,          desc:"All stores completed or confirmed no data found" },
    { label:"Closed",      icon:"🔒", done:isClosed,      ts: dsar?.due || "",         desc:"DSAR closed and response delivered to subject" },
  ];

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10, background: "rgba(147,197,253,0.04)", border: "1px solid rgba(147,197,253,0.15)" }}>

      {/* ── 5-Stage Tracker ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: NAV, marginBottom: 12 }}>📋 Fulfilment Stages</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
          {/* Connector line */}
          <div style={{ position: "absolute", top: 13, left: "10%", right: "10%", height: 2, background: "rgba(255,255,255,0.08)", zIndex: 0 }}/>
          {STAGES.map((stage, i) => {
            const clr = stage.done ? (stage.label === "Closed" ? EME : NAV) : "rgba(100,116,139,0.5)";
            return (
              <div key={stage.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
                {/* Circle */}
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: stage.done ? clr : "rgba(100,116,139,0.15)", border: `2px solid ${stage.done ? clr : "rgba(100,116,139,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, marginBottom: 6, transition: "background 0.3s" }}>
                  {stage.done ? stage.icon : <span style={{ fontSize: 9, color: "rgba(100,116,139,0.6)", fontWeight: 700 }}>{i + 1}</span>}
                </div>
                <div style={{ fontSize: 9, fontWeight: 800, color: stage.done ? clr : "rgba(100,116,139,0.6)", textAlign: "center", marginBottom: 2 }}>{stage.label}</div>
                {stage.ts && stage.done && (
                  <div style={{ fontSize: 7, color: "var(--muted-foreground)", textAlign: "center", fontFamily: "monospace" }}>{stage.ts}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: NAV }}>🔄 Per-Store Status — {total} Data Stores</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>{completed}/{total} stores completed</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: progress === 100 ? EME : progress > 60 ? AMB : RED }}>{progress}%</span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${progress}%`, height: "100%", background: progress === 100 ? EME : NAV, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(148,163,184,0.5)", fontSize: 11 }}>Loading pipeline…</div>
      ) : stores.length === 0 ? (
        <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(148,163,184,0.5)", fontSize: 11 }}>No pipeline data — run automated scan to discover stores</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {stores.map((s: any) => {
            const cfg = statusCfg[s.status] || statusCfg.pending;
            const conn = connectors.find((c:any) => c.connectorId === s.connectorId);
            const displayName = s.connectorName || conn?.name || s.connectorId;
            return (
              <div key={`${s.connectorId}-${s.dsarId || "x"}`} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${cfg.color}33`, background: `${cfg.color}06` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{conn?.icon || "🗄"}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>{cfg.icon} {cfg.label}</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--foreground)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                {s.actionedAt && (
                  <div style={{ fontSize: 8, color: "var(--muted-foreground)", marginBottom: 2 }}>{s.actionedAt}</div>
                )}
                {s.recordsFound > 0 && (
                  <div style={{ fontSize: 8, fontFamily: "monospace", color: s.recordsFound > 5000 ? RED : AMB, fontWeight: 700, marginBottom: 2 }}>{s.recordsFound.toLocaleString()} records</div>
                )}
                {s.notes && (
                  <div style={{ fontSize: 7, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.4, borderTop: "1px solid var(--border)", paddingTop: 4 }}>{s.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DSAR normalizer — maps raw ApiDsar into the enriched shape the page uses ──
function normalizeDsar(d: any, idx: number) {
  const today = new Date();
  const dueDate = d.due ? new Date(d.due) : new Date(today.getTime() + (30 - idx) * 86400000);
  const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  const typeJurMap: Record<string,string> = { erasure:"EU", access:"US", portability:"EU", rectification:"EU", restriction:"UK", objection:"EU" };
  const typeRegMap: Record<string,string> = { erasure:"GDPR", access:"CCPA", portability:"GDPR", rectification:"GDPR", restriction:"UK GDPR", objection:"GDPR" };
  const t = (d.type || "access").toLowerCase();
  const dueDateStr = d.due ? d.due.slice(0,10) : dueDate.toISOString().slice(0,10);
  const assignedTo = (d as any).assigned || (d as any).assignee || "Privacy Team";
  return {
    id: d.dsarId || `DS-${String(d.id).padStart(4,"0")}`,
    subject: d.subject || "Data Subject",
    email: d.email || "—",
    type: d.type || "Access",
    status: d.status || "pending",
    received: d.received ? d.received.slice(0,10) : today.toISOString().slice(0,10),
    due: dueDateStr,        // keep original field name the UI reads
    deadline: dueDateStr,   // alias — both names present for forward/backward compat
    daysLeft,
    regulation: (d as any).regulation || typeRegMap[t] || "GDPR",
    jurisdiction: (d as any).jurisdiction || typeJurMap[t] || "EU",
    assigned: assignedTo,   // UI may read either
    assignee: assignedTo,   // alias — both present
    risk: daysLeft < 7 ? "High" : daysLeft < 14 ? "Medium" : "Low",
  };
}

export default function PrivacyOps() {
  const { isModuleLicensed, isSubModuleLicensed } = useLicense();
  const { viewTenantId } = useOrg();

  // ── Live API hooks — all domains; seed arrays used as fallback when API is empty/erroring ──
  const { data: apiDsars }       = useDsars();
  const { data: apiRopa }        = usePrivacyRopa();
  const { data: apiDpias }       = usePrivacyDpias();
  const { data: apiNotices }     = usePrivacyNotices();
  const { data: apiConsent }     = usePrivacyConsent();
  const { data: apiDpas }        = usePrivacyDpas();
  const { data: apiRegs }        = usePrivacyRegs();
  const { data: privacyScoreData } = usePrivacyScore();

  const [tab, setTab] = useState("overview");
  const [dsars, setDsars] = useState([]);
  const [selectedDsar, setSelectedDsar] = useState<any>(null);
  const [selectedDpia, setSelectedDpia] = useState<any>(null);
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [selectedDpa, setSelectedDpa] = useState<any>(null);
  const [selectedBreach, setSelectedBreach] = useState<any>(null);
  const [selectedRopa, setSelectedRopa] = useState<any>(null);
  const [ropaFilter, setRopaFilter] = useState("All");
  const [dsarRegFilter, setDsarRegFilter] = useState("All");
  const [consentPurposeFilter, setConsentPurposeFilter] = useState("All");
  const [cookieTypeFilter, setCookieTypeFilter] = useState("All");
  const [transferMechFilter, setTransferMechFilter] = useState("All");
  const [vendorTierFilter, setVendorTierFilter] = useState("All");
  const [timerSec, setTimerSec] = useState(0);

  // ── Extra privacy data — fetched from API ────────────────────────────────────
  const [_breaches,      _setBreaches]      = useState<any[]>([]);
  const [_cookies,       _setCookies]       = useState<any[]>([]);
  const [_transfers,     _setTransfers]     = useState<any[]>([]);
  const [_aiModels,      _setAiModels]      = useState<any[]>([]);
  const [_childApps,     _setChildApps]     = useState<any[]>([]);
  const [_vendors,       _setVendors]       = useState<any[]>([]);
  const [_empActivities, _setEmpActivities] = useState<any[]>([]);

  // ── Stats objects — fetched from API (shadow module-level stubs) ─────────────
  const [consentStats,      setConsentStats]      = useState<any>({ total:0, active:0, expired:0, withdrawn:0, byChannel:[], byJurisdiction:[], byPurpose:[], abTests:[] });
  const [breachKpis,        setBreachKpis]        = useState<any>({ totalBreaches:0, openInvestigations:0, avgResponseHours:0, dpaNotifications:0, affectedTotal:0, slaCompliance:0 });
  const [breachTimeline72h, setBreachTimeline72h] = useState<any>({ elapsed:0, total:72 });
  const [cookieBannerPerf,  setCookieBannerPerf]  = useState<any[]>([]);
  const [iso31700,          setIso31700]          = useState<any[]>([]);
  const [empStats,          setEmpStats]          = useState<any>({ total:0, compliant:0, gap:0, partial:0, monitoringActivities:0, worksCouncilNeeded:0 });
  const [aiStats,           setAiStats]           = useState<any>({ total:0, approved:0, underReview:0, gap:0, shadowAI:0, autoDec:0, personalDataUse:0 });
  const [childrenStats,     setChildrenStats]     = useState<any>({ appsAudited:0, coppaCompliant:0, gdpr8Compliant:0, aadcCompliant:0, gaps:0, parentalConsentRate:0 });
  const [maturityDimensions,setMaturityDimensions]= useState<any[]>([]);
  const [PRIVACY_SCORE,     SET_PRIVACY_SCORE]    = useState<number>(0);
  const [PRIVACY_SCORE_TREND, SET_PRIVACY_SCORE_TREND] = useState<number[]>([]);
  const [_scoreSubScores,   _setScoreSubScores]   = useState<{dsar:number;dpia:number;consent:number;breach:number}|null>(null);
  const [dsarStats,         setDsarStats]         = useState<any>({ total:0, open:0, overdue:0, completedThisMonth:0, avgDaysLeft:0, slaCompliance:0 });
  const [dsrConnectors,     setDsrConnectors]     = useState<any[]>([]);
  const [dsrPipeline,       setDsrPipeline]       = useState<any[]>([]);
  const [dsrConnView,       setDsrConnView]       = useState(false);

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    const fetchArr = (url: string, setter: (d: any[]) => void) =>
      fetch(url, { headers: H }).then(r => r.ok ? r.json() : []).then((d: any[]) => Array.isArray(d) && d.length > 0 && setter(d)).catch(() => {});
    const fetchObj = (url: string, setter: (d: any) => void) =>
      fetch(url, { headers: H }).then(r => r.ok ? r.json() : null).then((d: any) => d && setter(d)).catch(() => {});
    fetchArr("/api/privacy/breaches",            _setBreaches);
    fetchArr("/api/privacy/cookies",             _setCookies);
    fetchArr("/api/privacy/transfers",           _setTransfers);
    fetchArr("/api/privacy/ai-models",           _setAiModels);
    fetchArr("/api/privacy/child-apps",          _setChildApps);
    fetchArr("/api/privacy/vendors",             _setVendors);
    fetchArr("/api/privacy/employee-activities", _setEmpActivities);
    fetchArr("/api/privacy/dsr-connectors",      setDsrConnectors);
    fetchObj("/api/privacy/consent-stats",   setConsentStats);
    fetchObj("/api/privacy/breach-kpis",     (d: any) => { if (d.kpis) setBreachKpis(d.kpis); if (d.timeline) setBreachTimeline72h(d.timeline); });
    fetchArr("/api/privacy/cookie-perf",     setCookieBannerPerf);
    fetchArr("/api/privacy/iso31700",        setIso31700);
    fetchObj("/api/privacy/emp-stats",       setEmpStats);
    fetchObj("/api/privacy/ai-stats",        setAiStats);
    fetchObj("/api/privacy/children-stats",  setChildrenStats);
    fetchArr("/api/privacy/maturity",        setMaturityDimensions);
    fetch("/api/privacy/dsars", { headers: H as any }).then(r => r.ok ? r.json() : []).then((d: any[]) => {
      if (Array.isArray(d) && d.length > 0) {
        setDsarStats({ total: d.length, open: d.filter((x:any) => x.status !== "Completed").length, overdue: d.filter((x:any) => x.daysLeft < 0).length, completedThisMonth: d.filter((x:any) => x.status === "Completed").length, avgDaysLeft: Math.round(d.reduce((s:number, x:any) => s + (x.daysLeft ?? 0), 0) / d.length), slaCompliance: Math.round((d.filter((x:any) => x.daysLeft >= 0).length / d.length) * 100) });
      }
    }).catch(() => {});
  }, []);

  // ── Sync privacy score from React Query hook ─────────────────────────────────
  useEffect(() => {
    if (!privacyScoreData) return;
    if (typeof privacyScoreData.score === "number") SET_PRIVACY_SCORE(privacyScoreData.score);
    if (Array.isArray(privacyScoreData.trend) && privacyScoreData.trend.length > 0) SET_PRIVACY_SCORE_TREND(privacyScoreData.trend);
    if (privacyScoreData.subScores) _setScoreSubScores(privacyScoreData.subScores);
  }, [privacyScoreData]);

  // ── Merge live API data with seed fallback for each domain ──────────────────
  // Each domain: use API data when available and non-empty; fall back to seed.
  const ropa    = useMemo(() => Array.isArray(apiRopa)    && apiRopa.length    > 0 ? apiRopa    : _ropa,    [apiRopa]);
  const dpias   = useMemo(() => Array.isArray(apiDpias)   && apiDpias.length   > 0 ? apiDpias   : _dpias,   [apiDpias]);
  const notices = useMemo(() => Array.isArray(apiNotices) && apiNotices.length > 0 ? apiNotices : _notices, [apiNotices]);
  const dpas    = useMemo(() => Array.isArray(apiDpas)    && apiDpas.length    > 0 ? apiDpas    : _dpas,    [apiDpas]);
  const regs    = useMemo(() => Array.isArray(apiRegs)    && apiRegs.length    > 0 ? apiRegs    : _regs,    [apiRegs]);

  // Derived stats from live data (or seed fallback)
  const liveDpaStats = useMemo(() => ({
    total: dpas.length,
    // seed uses "active"; some API variants may say "signed" — accept both
    active: dpas.filter((d: any) => d.status === "active" || d.status === "signed").length,
    // seed uses "expiring-soon"; fallback also checks "expiring" for API variants
    expiring: dpas.filter((d: any) => d.status === "expiring-soon" || d.status === "expiring" || d.status === "review").length,
    expired: dpas.filter((d: any) => d.status === "expired").length,
    pending: dpas.filter((d: any) => d.status === "pending").length,
    // detect SCCs via mechanism field (seed uses "SCCs", "Standard Contractual Clauses", "SCCs + BCRs")
    withSCCs: dpas.filter((d: any) => {
      const m = String(d.mechanism || "").toLowerCase();
      return m.includes("scc") || m.includes("standard contractual") || d.includesSCCs || d.sccs;
    }).length,
  }), [dpas]);

  const liveRegStats = useMemo(() => ({
    total: regs.length,
    // seed uses "compliant", "partial", "gap", "upcoming"; not "active"/"in-force"
    active: regs.filter((r: any) => r.status === "compliant" || r.status === "active" || r.status === "in-force").length,
    gap: regs.filter((r: any) => r.status === "gap" || r.status === "partial" || (r.pct !== undefined && r.pct < 70)).length,
    upcoming: regs.filter((r: any) => r.status === "upcoming" || r.status === "pending" ||
      (r.deadline && r.deadline !== "Ongoing" && r.deadline > new Date().toISOString().slice(0,10))).length,
    monitoring: regs.filter((r: any) => r.status === "monitoring").length,
  }), [regs]);

  // 72-hour countdown for active breach — live h:m:s derived from event timestamp
  useEffect(() => {
    const iv = setInterval(() => setTimerSec(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const breachElapsed = breachTimeline72h.elapsed;
  // Compute true remaining time: seed elapsed hours + live running seconds
  const _totalElapsedSecs = breachElapsed * 3600 + timerSec;
  const _remainingSecs = Math.max(0, breachTimeline72h.total * 3600 - _totalElapsedSecs);
  const breachRH = Math.floor(_remainingSecs / 3600);
  const breachRM = Math.floor((_remainingSecs % 3600) / 60);
  const breachRS = _remainingSecs % 60;

  // ── DSAR: always consume API data, normalizing into the enriched UI shape ───
  useEffect(() => {
    if (!Array.isArray(apiDsars) || apiDsars.length === 0) return;
    // Normalize every record regardless of whether enriched fields are present.
    // normalizeDsar() derives daysLeft from `due`, and safely defaults regulation/jurisdiction.
    setDsars(apiDsars.map(normalizeDsar) as any);
  }, [apiDsars]);

  const filteredRopa = useMemo(() => ropaFilter === "All" ? ropa : ropa.filter((r: any) => r.risk === ropaFilter || r.status === ropaFilter.toLowerCase()), [ropaFilter, ropa]);
  const filteredDsars = useMemo(() => dsarRegFilter === "All" ? dsars : dsars.filter(d => d.regulation === dsarRegFilter), [dsarRegFilter, dsars]);
  const filteredCookies = useMemo(() => cookieTypeFilter === "All" ? _cookies : _cookies.filter(c => c.type === cookieTypeFilter), [cookieTypeFilter]);
  const filteredTransfers = useMemo(() => transferMechFilter === "All" ? _transfers : _transfers.filter(t => t.mechanism.includes(transferMechFilter)), [transferMechFilter]);
  const filteredVendors = useMemo(() => vendorTierFilter === "All" ? _vendors : _vendors.filter(v => v.tier === vendorTierFilter), [vendorTierFilter]);

  const TABS = [
    { key:"overview",   label:"Overview",           count:0 },
    { key:"ropa",       label:"RoPA",               count:ropa.length,           dot:RED },
    { key:"dpia",       label:"PIA / DPIA",         count:dpias.filter((d:any)=>d.status!=="approved").length, dot:AMB },
    { key:"notices",    label:"Privacy Notices",    count:notices.filter((n:any)=>!n.dpoApproved).length, dot:AMB },
    { key:"dsars",      label:"DSAR Management",    count:dsarStats.open,        dot:RED },
    { key:"consent",    label:"Consent",            count:consentStats.expired,  dot:AMB },
    { key:"dpas",       label:"DPA Tracker",        count:liveDpaStats.total,    dot:NAV },
    { key:"regs",       label:"Regulatory",         count:liveRegStats.total,    dot:NAV },
    { key:"breach",     label:"Breach Management",  count:breachKpis.openInvestigations, dot:RED },
    { key:"cookie",     label:"Cookie Compliance",  count:cookieStats.iabNonCompliant, dot:AMB },
    { key:"transfers",  label:"Transfer Hub",       count:transferStats.underReview, dot:AMB },
    { key:"ai",         label:"AI Data Gov",        count:aiStats.shadowAI,     dot:RED },
    { key:"children",   label:"Children's Privacy", count:childrenStats.gaps,   dot:RED },
    { key:"vendor",     label:"Vendor Privacy",     count:vendorStats.gap,       dot:RED },
    { key:"maturity",   label:"Privacy Maturity",   count:0 },
    { key:"employee",   label:"Employee Privacy",   count:empStats.gap + empStats.partial, dot:AMB },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <ModuleHeader
        title="PrivacyOps — GDPR · CCPA · LGPD · PDPA · DPDP · COPPA · 150+ Regulations"
        description={`${ropa.length} RoPA · ${dpias.length} DPIAs · ${dsarStats.total} DSARs · ${liveRegStats.total} Regulations · Breach · Cookie · AI Gov · Children's · Maturity`}
        badge={{ label:`Privacy Score: ${PRIVACY_SCORE}/100`, color: PRIVACY_SCORE >= 75 ? EME : AMB, bg:"rgba(252,211,77,0.08)" }}
        action={{ label:"📋 Export Privacy Report", onClick:()=>{} }}
        secondAction={{ label:"🤖 AI Privacy Brief", onClick:()=>{} }}
      />
      <SubNav tabs={TABS} active={tab} onSelect={setTab} />
      <AICopilotBar module="privacyops" liveInsights={privacyScoreData?.insights} />
      <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* Top row — score + KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
              {/* Score gauge */}
              <div style={card({ padding:"16px 20px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" })}>
                <div style={{ fontSize:9, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4 }}>Global Privacy Health Score</div>
                <ScoreGaugeSVG value={PRIVACY_SCORE} size={140} />
                {/* Sub-scores breakdown */}
                {_scoreSubScores && (
                  <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:4, marginTop:10 }}>
                    {([
                      ["DSAR SLA",        _scoreSubScores.dsar,    BLU],
                      ["DPIA Coverage",   _scoreSubScores.dpia,    AMB],
                      ["Consent Freshness",_scoreSubScores.consent, CYN],
                      ["Breach Response", _scoreSubScores.breach,  _scoreSubScores.breach < 70 ? RED : EME],
                    ] as [string, number, string][]).map(([label, val, col]) => (
                      <div key={label}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                          <span style={{ fontSize:8, color:"var(--muted-foreground)" }}>{label}</span>
                          <span style={{ fontSize:8, fontWeight:700, color:col, fontFamily:"monospace" }}>{val}%</span>
                        </div>
                        <MiniBar value={val} max={100} color={col} />
                      </div>
                    ))}
                  </div>
                )}
                {PRIVACY_SCORE_TREND.length > 1 && (
                  <div style={{ marginTop:8, fontSize:10, color:EME, fontWeight:700 }}>
                    {PRIVACY_SCORE_TREND[PRIVACY_SCORE_TREND.length-1] >= PRIVACY_SCORE_TREND[0] ? "↑" : "↓"} {Math.abs(PRIVACY_SCORE_TREND[PRIVACY_SCORE_TREND.length-1] - PRIVACY_SCORE_TREND[0])} pts (30 days)
                  </div>
                )}
              </div>
              {/* KPI grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                <KpiCard label="Open DSARs"         value={dsarStats.open}                     sub="Across 9 jurisdictions" color={AMB}  icon="📥" onClick={()=>setTab("dsars")} />
                <KpiCard label="SLA Compliance"     value={`${dsarStats.slaCompliance}%`}      sub="DSAR response rate"     color={EME}  icon="⏱" />
                <KpiCard label="Active DPIAs"       value={dpias.filter((d:any)=>d.status!=="approved").length} sub="Threshold met"  color={BLU}  icon="📋" onClick={()=>setTab("dpia")} />
                <KpiCard label="Overdue DSARs"      value={dsarStats.overdue}                  sub="SLA breached"           color={RED}  icon="🔴" alert onClick={()=>setTab("dsars")} />
                <KpiCard label="RoPA Records"       value={ropa.length}                        sub={`${ropa.filter((r:any)=>r.risk==="Critical"||r.risk==="High").length} high-risk activities`} color={PRP} icon="📑" onClick={()=>setTab("ropa")} />
                <KpiCard label="Consent Records"    value={consentStats.total.toLocaleString()} sub={`${consentStats.expired} expired`}  color={CYN}  icon="✅" onClick={()=>setTab("consent")} />
                <KpiCard label="DPA Coverage"       value={`${liveDpaStats.total} DPAs`}       sub={`${liveDpaStats.expired} expired`}  color={NAV}  icon="📜" onClick={()=>setTab("dpas")} />
                <KpiCard label="Open Breaches"      value={breachKpis.openInvestigations}      sub="72h SLA countdown active"color={RED} icon="🚨" alert onClick={()=>setTab("breach")} />
              </div>
            </div>

            {/* AI Copilot Insights — live from scoring engine */}
            <div style={card({ padding:"14px 18px" })}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV }}>🤖 AI Privacy Insights — Live Risk Alerts</div>
                <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Computed from live DSAR · DPIA · RoPA · DPA data</div>
              </div>
              {(() => {
                const liveIns = privacyScoreData?.insights ?? [];
                if (liveIns.length === 0) {
                  return (
                    <div style={{ textAlign:"center", padding:"16px 0", color:"rgba(148,163,184,0.6)", fontSize:12 }}>
                      Add privacy data (DSARs, DPIAs, RoPA) to generate AI-powered risk alerts
                    </div>
                  );
                }
                const iconMap = (txt: string) => txt.toLowerCase().includes("dsar") ? { icon:"🚨", color:RED, tab:"dsars" } : txt.toLowerCase().includes("dpia") ? { icon:"⚠️", color:AMB, tab:"dpia" } : txt.toLowerCase().includes("dpa") ? { icon:"📜", color:NAV, tab:"dpas" } : txt.toLowerCase().includes("notic") ? { icon:"📄", color:CYN, tab:"notices" } : txt.toLowerCase().includes("ropa") ? { icon:"📑", color:PRP, tab:"ropa" } : { icon:"✅", color:EME, tab:"overview" };
                return (
                  <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(liveIns.length, 3)},1fr)`, gap:10 }}>
                    {liveIns.map((ins: string, idx: number) => {
                      const { icon, color, tab: insTab } = iconMap(ins);
                      const firstDot = ins.indexOf(" — ");
                      const title = firstDot > 0 ? ins.slice(0, firstDot) : ins.slice(0, 40);
                      const body = firstDot > 0 ? ins.slice(firstDot + 3) : ins;
                      return (
                        <div key={idx} style={{ padding:"12px 14px", borderRadius:8, border:`1px solid ${color}33`, background:`${color}08`, cursor:"pointer" }} onClick={()=>setTab(insTab)}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                            <span style={{ fontSize:14 }}>{icon}</span>
                            <span style={{ fontSize:11, fontWeight:800, color }}>{title}</span>
                          </div>
                          <div style={{ fontSize:10, color:"var(--foreground)", lineHeight:1.5, marginBottom:8 }}>{body}</div>
                          <button onClick={e=>{e.stopPropagation();setTab(insTab);}} style={{ fontSize:10, fontWeight:700, color, background:`${color}15`, border:`1px solid ${color}33`, borderRadius:5, padding:"3px 10px", cursor:"pointer" }}>
                            {insTab === "overview" ? "View Score →" : `Review ${insTab.toUpperCase().replace("DSARS","DSARs")} →`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* DSAR SLA Gauge Row */}
            <div style={card({ padding:"14px 18px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>⏱ DSAR SLA Performance Dashboard</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12, alignItems:"end" }}>
                {dsars.length === 0 ? (
                  <div style={{ gridColumn:"span 6", textAlign:"center", padding:"20px 0", color:"rgba(148,163,184,0.6)", fontSize:12 }}>
                    No DSAR records — SLA performance will appear once requests are received
                  </div>
                ) : (() => {
                  const slaColors = [BLU,AMB,EME,PRP,CYN,RED];
                  const byType: Record<string,{total:number,onTime:number}> = {};
                  dsars.forEach((d:any) => {
                    const k = d.type ?? "Other";
                    if (!byType[k]) byType[k] = { total:0, onTime:0 };
                    byType[k].total++;
                    if ((d.daysLeft ?? 0) >= 0) byType[k].onTime++;
                  });
                  return Object.entries(byType).slice(0,6).map(([label, s], i) => {
                    const pct = Math.round((s.onTime / s.total) * 100);
                    const col = slaColors[i % slaColors.length];
                    return (
                      <div key={label} style={{ textAlign:"center" }}>
                        <svg viewBox="0 0 80 50" style={{ width:80, height:50, display:"block", margin:"0 auto" }}>
                          <path d="M10,45 A30,30 0 0,1 70,45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" strokeLinecap="round" />
                          <path d="M10,45 A30,30 0 0,1 70,45" fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
                            strokeDasharray={`${(pct/100)*94.25} 94.25`} opacity={0.85} />
                          <text x="40" y="40" textAnchor="middle" fill={col} fontSize="11" fontWeight="900">{pct}%</text>
                        </svg>
                        <div style={{ fontSize:9, fontWeight:800, color:"var(--foreground)", marginTop:2 }}>{label}</div>
                        <div style={{ fontSize:8, color:"var(--muted-foreground)" }}>{s.total} request{s.total!==1?"s":""}</div>
                        <div style={{ marginTop:4, height:4, borderRadius:2, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:pct>=85?EME:pct>=65?AMB:RED, borderRadius:2 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Regulation coverage + DSAR by jurisdiction + consent trend */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              {/* Regulation status */}
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Regulation Coverage ({regStats.total} Laws)</div>
                {[["Compliant",regStats.compliant,EME],["Partial",regStats.partial,AMB],["Gap",regStats.gap,RED]].map(([l,v,c])=>(
                  <div key={String(l)} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:10, color:"var(--foreground)", fontWeight:700 }}>{l}</span>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:c, fontWeight:800 }}>{v}</span>
                    </div>
                    <MiniBar value={Number(v)} max={regStats.total} color={String(c)} />
                  </div>
                ))}
                <div style={{ marginTop:10, display:"flex", gap:4, flexWrap:"wrap" }}>
                  {["GDPR","CCPA","LGPD","PDPA","DPDP","PIPL","APPI","COPPA","HIPAA"].map(r=>(
                    <Chip key={r} label={r} color={regColor[r]??NAV} />
                  ))}
                  <Chip label={`+${regStats.total - 9} more`} color="var(--muted-foreground)" />
                </div>
              </div>

              {/* DSAR by jurisdiction */}
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>DSARs by Jurisdiction ({dsarStats.total} total)</div>
                {dsars.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"16px 0", color:"rgba(148,163,184,0.6)", fontSize:12 }}>No DSARs yet</div>
                ) : (() => {
                  const jColors = [BLU,AMB,EME,PRP,CYN,PNK,RED,"var(--muted-foreground)"];
                  const counts: Record<string,number> = {};
                  dsars.forEach((d:any) => { const k = d.type ?? "Other"; counts[k] = (counts[k]||0)+1; });
                  const total = dsars.length;
                  return Object.entries(counts).map(([j,v],i) => (
                    <div key={j} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <span style={{ fontSize:10, color:"var(--foreground)", fontWeight:600 }}>{j}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:80, height:5, borderRadius:3, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                          <div style={{ width:`${(v/total)*100}%`, height:"100%", background:jColors[i%jColors.length] as string, borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:10, fontFamily:"monospace", color:jColors[i%jColors.length] as string, fontWeight:700, minWidth:20, textAlign:"right" }}>{v}</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {/* Consent opt-in rates */}
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Consent Opt-In Rate by Purpose</div>
                {consentStats.byPurpose.map(p=>(
                  <div key={p.purpose} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:10, color:"var(--foreground)", fontWeight:600 }}>{p.purpose}</span>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:p.rate>=60?EME:p.rate>=45?AMB:RED, fontWeight:800 }}>{p.rate}%</span>
                    </div>
                    <MiniBar value={p.rate} max={100} color={p.rate>=60?EME:p.rate>=45?AMB:RED} />
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming deadlines */}
            <div style={card({ padding:"14px 18px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>📅 Upcoming Privacy Obligations — Next 90 Days</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {[
                  { reg:"PDPL (SA)",  deadline:"2024-09-14", type:"Full Compliance",         urgency:"Critical", daysLeft:89 },
                  { reg:"DPDP (IN)",  deadline:"2024-09-01", type:"Consent Framework",        urgency:"Critical", daysLeft:76 },
                  { reg:"NIS2",       deadline:"2024-10-17", type:"Cybersecurity Measures",   urgency:"High",     daysLeft:122 },
                  { reg:"AADC/KOSA",  deadline:"2025-01-01", type:"Children's Age-Gating",    urgency:"High",     daysLeft:199 },
                ].map(d=>(
                  <div key={d.reg} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${d.urgency==="Critical"?RED+"44":AMB+"44"}`, background:d.urgency==="Critical"?"rgba(248,113,113,0.05)":"rgba(252,211,77,0.05)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <Chip label={d.reg} color={regColor[d.reg.split(" ")[0]]??NAV} />
                      <span style={{ fontSize:9, fontWeight:700, color:d.urgency==="Critical"?RED:AMB }}>{d.urgency}</span>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", marginBottom:2 }}>{d.type}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>Deadline: {d.deadline}</div>
                    <div style={{ marginTop:6, fontSize:11, fontWeight:800, color:d.daysLeft<90?RED:AMB, fontFamily:"monospace" }}>{d.daysLeft} days</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── RoPA ──────────────────────────────────────────────────────────── */}
        {tab === "ropa" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total Activities"    value={ropa.length}                                          sub="Article 30 records"       color={NAV} icon="📑" />
              <KpiCard label="DPO Reviewed"        value={ropa.filter((r:any)=>r.dpoReviewed).length}           sub="Signed off"               color={EME} icon="✓" />
              <KpiCard label="DPIA Required"       value={ropa.filter((r:any)=>r.dpia).length}                  sub="Threshold assessment met" color={AMB} icon="📋" />
              <KpiCard label="High / Critical Risk" value={ropa.filter((r:any)=>r.risk==="High"||r.risk==="Critical").length} sub="Need priority review" color={RED} icon="⚠" />
              <KpiCard label="Pending DPO Review"  value={ropa.filter((r:any)=>!r.dpoReviewed).length}          sub="Awaiting sign-off"        color={RED} icon="🔏" alert />
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {["All","Critical","High","Medium","Low","compliant","partial","gap"].map(f=>(
                <button key={f} onClick={()=>setRopaFilter(f)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:ropaFilter===f?"rgba(147,197,253,0.15)":"transparent", color:ropaFilter===f?NAV:"var(--muted-foreground)", borderColor:ropaFilter===f?NAV:"var(--border)" }}>{f}</button>
              ))}
              <span style={{ marginLeft:"auto", fontSize:11, color:"var(--muted-foreground)" }}>{filteredRopa.length} records</span>
            </div>
            <TableShell
              cols={["ID","Processing Activity","Legal Basis","Data Subjects","Data Categories","Countries","Retention","Risk","DPIA","DPO","Status"]}
              rows={filteredRopa.map(r=>[
                <Mono>{r.id}</Mono>,
                <div><div style={{ fontWeight:700, color:NAV, fontSize:11 }}>{r.activity}</div><div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{r.controller} / {r.processor}</div></div>,
                <Chip label={r.legalBasis} color={BLU} />,
                <span style={{ fontSize:10 }}>{r.dataSubjects}</span>,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", maxWidth:160 }}>{(r.categories as string[]).slice(0,3).map(c=><Chip key={c} label={c} color={PRP} />)}{r.categories.length>3&&<Chip label={`+${r.categories.length-3}`} color="var(--muted-foreground)" />}</div>,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>{(r.countries as string[]).slice(0,2).map(c=><Chip key={c} label={c} color={CYN} />)}</div>,
                <Mono style={{ fontSize:9 }}>{r.retention}</Mono>,
                <SevBadge label={r.risk} />,
                r.dpia ? <span style={{ color:AMB, fontWeight:700, fontSize:11 }}>✓ Required</span> : <span style={{ color:"var(--muted-foreground)", fontSize:10 }}>N/A</span>,
                r.dpoReviewed ? <span style={{ color:EME, fontWeight:700 }}>✓</span> : <span style={{ color:RED, fontWeight:700 }}>✗</span>,
                <StatusBadge s={r.status} />,
              ])}
              onRowClick={i=>setSelectedRopa(filteredRopa[i]===selectedRopa?null:filteredRopa[i])}
            />
            {selectedRopa && (
              <div style={card({ padding:20 })}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{selectedRopa.activity}</div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{selectedRopa.id} · Controller: {selectedRopa.controller} · Processor: {selectedRopa.processor}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <SevBadge label={selectedRopa.risk} />
                    <StatusBadge s={selectedRopa.status} />
                    <button onClick={()=>setSelectedRopa(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--muted-foreground)" }}>×</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[["Purpose",selectedRopa.purpose],["Legal Basis",selectedRopa.legalBasis],["Data Subjects",selectedRopa.dataSubjects],["Retention",selectedRopa.retention],["Countries",(selectedRopa.countries as string[]).join(", ")],["DPIA Required",selectedRopa.dpia?"Yes":"No"],["DPO Reviewed",selectedRopa.dpoReviewed?"Yes":"Pending"],["Next Review",selectedRopa.nextReview]].map(([k,v])=>(
                    <div key={String(k)} style={{ background:"var(--input)", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:4, textTransform:"uppercase" }}>{k}</div>
                      <div style={{ fontSize:11, color:"var(--foreground)", fontWeight:600 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, display:"flex", gap:8 }}>
                  <div><div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" }}>Data Categories</div><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{(selectedRopa.categories as string[]).map(c=><Chip key={c} label={c} color={PRP} />)}</div></div>
                </div>
                <div style={{ marginTop:12, display:"flex", gap:8 }}>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:NAV, border:"none", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>Export Art.30 PDF</button>
                  {selectedRopa.dpia && <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:`1px solid ${AMB}`, color:AMB, fontSize:11, fontWeight:700, cursor:"pointer" }}>Start DPIA →</button>}
                  <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:"1px solid var(--border)", color:"var(--foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>Request DPO Review</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PIA / DPIA ────────────────────────────────────────────────────── */}
        {tab === "dpia" && (
          !isSubModuleLicensed("privacyops","priv.dpia") ? <LockedModule moduleKey="dpia" /> : <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total DPIAs"    value={dpias.length}                                              sub="All assessments"       color={NAV} icon="📋" />
              <KpiCard label="Approved"       value={dpias.filter((d:any)=>d.status==="approved").length}    sub="DPO signed off"        color={EME} icon="✓" />
              <KpiCard label="In Progress"    value={dpias.filter((d:any)=>d.status==="in-progress").length} sub="Active workflows"      color={BLU} icon="⚙" />
              <KpiCard label="Draft"          value={dpias.filter((d:any)=>d.status==="draft").length}       sub="Not yet started"       color={AMB} icon="✏" />
              <KpiCard label="Critical Risk"  value={dpias.filter((d:any)=>d.risk==="Critical").length}      sub="Immediate DPIA required" color={RED} icon="⚠" alert />
            </div>
            <div style={{ display:"flex", gap:16 }}>
              <div style={{ width:300, flexShrink:0, display:"flex", flexDirection:"column", gap:8 }}>
                {dpias.map((d:any)=>(
                  <div key={d.id} onClick={()=>setSelectedDpia(selectedDpia?.id===d.id?null:d)}
                    style={card({ padding:12, cursor:"pointer", borderColor:selectedDpia?.id===d.id?NAV:"rgba(255,255,255,0.1)", borderWidth:selectedDpia?.id===d.id?2:1 })}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <Mono style={{ fontSize:9 }}>{d.id}</Mono>
                      <div style={{ display:"flex", gap:4 }}>
                        <SevBadge label={d.risk} />
                        <StatusBadge s={d.status} />
                      </div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:4, lineHeight:1.3 }}>{d.name}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:6 }}>{d.owner} · {d.updated}</div>
                    {/* Progress bar */}
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, height:4, borderRadius:2, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                        <div style={{ width:`${(d.stepsComplete/d.totalSteps)*100}%`, height:"100%", borderRadius:2, background:d.status==="approved"?EME:d.status==="in-progress"?AMB:RED }} />
                      </div>
                      <span style={{ fontSize:9, fontFamily:"monospace", color:"var(--muted-foreground)" }}>{d.stepsComplete}/{d.totalSteps}</span>
                    </div>
                  </div>
                ))}
              </div>
              {selectedDpia ? (
                <div style={{ flex:1 }}>
                  <div style={card({ padding:"14px 18px", marginBottom:12 })}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{selectedDpia.name}</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{selectedDpia.id} · Owner: {selectedDpia.owner} · Updated: {selectedDpia.updated}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <SevBadge label={selectedDpia.risk} />
                        <StatusBadge s={selectedDpia.status} />
                        <button onClick={()=>setSelectedDpia(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--muted-foreground)" }}>×</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {dpiaSteps.map((step,i)=>{
                      const done = i < selectedDpia.stepsComplete;
                      const active = i === selectedDpia.stepsComplete && selectedDpia.status === "in-progress";
                      const clr = done ? EME : active ? AMB : "rgba(255,255,255,0.2)";
                      return (
                        <div key={step.step} style={{ display:"flex", gap:0 }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:44, flexShrink:0 }}>
                            <div style={{ width:30, height:30, borderRadius:"50%", background:done?"rgba(52,211,153,0.12)":active?"rgba(252,211,77,0.12)":"var(--card)", border:`2px solid ${clr}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:clr }}>
                              {done?"✓":step.step}
                            </div>
                            {i < dpiaSteps.length-1 && <div style={{ width:2, flex:1, background:done?EME+"44":"rgba(255,255,255,0.08)", minHeight:14 }} />}
                          </div>
                          <div style={card({ flex:1, padding:"10px 14px", marginBottom:i<dpiaSteps.length-1?6:0, borderLeft:`3px solid ${clr}` })}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                              <span style={{ fontWeight:800, color:NAV, fontSize:11 }}>Step {step.step}: {step.title}</span>
                              <StatusBadge s={done?"approved":active?"in-progress":"draft"} />
                            </div>
                            <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{step.guidance}</div>
                            {active && <div style={{ marginTop:6, fontSize:10, color:AMB, fontWeight:700 }}>⚠ Action required — assign to responsible party</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop:12, display:"flex", gap:8 }}>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:AMB, border:"none", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>Update Progress</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:`1px solid ${EME}`, color:EME, fontSize:11, fontWeight:700, cursor:"pointer" }}>Submit for DPO Review</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:"1px solid var(--border)", color:"var(--foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>Export DPIA PDF</button>
                  </div>
                </div>
              ) : (
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted-foreground)", fontSize:13 }}>← Select a DPIA to view step-by-step workflow</div>
              )}
            </div>

            {/* DPIA Residual Risk Heat Map */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:6 }}>🔥 Residual Risk Heat Map — All DPIAs</div>
              <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:12 }}>Inherent vs. residual risk after controls applied. Axes: Likelihood (1–5) × Impact (1–5). Size = data subjects affected.</div>
              <div style={{ position:"relative" }}>
                {/* Grid backdrop */}
                <svg viewBox="0 0 520 320" style={{ width:"100%", height:240, display:"block" }}>
                  {/* Background grid */}
                  {[1,2,3,4,5].map(row=>[1,2,3,4,5].map(col=>{
                    const x=(col-1)*90+50; const y=(5-row)*52+20;
                    const heat=row+col;
                    const bg=heat>=9?"rgba(248,113,113,0.18)":heat>=7?"rgba(252,211,77,0.14)":"rgba(52,211,153,0.10)";
                    return <rect key={`${row}-${col}`} x={x} y={y} width={88} height={50} rx={4} fill={bg} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
                  }))}
                  {/* Axis labels - Impact */}
                  {[1,2,3,4,5].map(i=><text key={i} x={(i-1)*90+94} y={295} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={8}>{i}</text>)}
                  <text x={270} y={312} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={8}>Impact →</text>
                  {/* Axis labels - Likelihood */}
                  {[1,2,3,4,5].map(i=><text key={i} x={38} y={(5-i)*52+50} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={8}>{i}</text>)}
                  <text x={14} y={155} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={8} transform="rotate(-90,14,155)">Likelihood →</text>
                  {/* DPIA Bubbles — inherent (hollow) vs residual (filled) */}
                  {dpias.map((d:any,i:number)=>{
                    const inh={likelihood:[4,3,5,4,3,4,5,3,4,3][i%10]||3,impact:[4,5,4,3,5,4,5,3,4,4][i%10]||3};
                    const res={likelihood:Math.max(1,inh.likelihood-1),impact:Math.max(1,inh.impact-1)};
                    const ix=(inh.impact-1)*90+94; const iy=(5-inh.likelihood)*52+46;
                    const rx=(res.impact-1)*90+94;  const ry=(5-res.likelihood)*52+46;
                    const col=d.risk==="Critical"?RED:d.risk==="High"?AMB:d.risk==="Medium"?BLU:EME;
                    const r=d.status==="approved"?7:9;
                    return (
                      <g key={d.id}>
                        <circle cx={ix} cy={iy} r={r+2} fill="none" stroke={col} strokeWidth={1.2} strokeDasharray="3,2" opacity={0.6} />
                        <circle cx={rx} cy={ry} r={r} fill={col+"33"} stroke={col} strokeWidth={1.5} />
                        <text x={rx} y={ry+3} textAnchor="middle" fill={col} fontSize={5} fontWeight={800}>{String(d.id).replace("DPIA-","")}</text>
                      </g>
                    );
                  })}
                  {/* Legend */}
                  <circle cx={340} cy={290} r={5} fill="none" stroke="#94A3B8" strokeWidth={1} strokeDasharray="2,1" /><text x={348} y={293} fill="#94A3B8" fontSize={7}>Inherent</text>
                  <circle cx={395} cy={290} r={5} fill="#94A3B833" stroke="#94A3B8" strokeWidth={1} /><text x={403} y={293} fill="#94A3B8" fontSize={7}>Residual</text>
                  <circle cx={450} cy={290} r={5} fill={RED+"33"} stroke={RED} strokeWidth={1} /><text x={458} y={293} fill={RED} fontSize={7}>Critical</text>
                  <circle cx={495} cy={290} r={5} fill={AMB+"33"} stroke={AMB} strokeWidth={1} /><text x={503} y={293} fill={AMB} fontSize={7}>High</text>
                </svg>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <div style={{ flex:1, padding:"8px 12px", borderRadius:6, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)" }}>
                  <div style={{ fontSize:8, fontWeight:800, color:RED, marginBottom:2 }}>CRITICAL RESIDUAL RISK</div>
                  <div style={{ fontSize:10, color:"var(--foreground)" }}>{dpias.filter((d:any)=>d.risk==="Critical").length} DPIAs require immediate DPO escalation and additional technical safeguards before processing can continue.</div>
                </div>
                <div style={{ flex:1, padding:"8px 12px", borderRadius:6, background:"rgba(252,211,77,0.08)", border:"1px solid rgba(252,211,77,0.2)" }}>
                  <div style={{ fontSize:8, fontWeight:800, color:AMB, marginBottom:2 }}>DPO SIGN-OFF REQUIRED</div>
                  <div style={{ fontSize:10, color:"var(--foreground)" }}>{dpias.filter((d:any)=>d.status!=="approved").length} DPIAs pending DPO review. Sign-off required by GDPR Art.35(2) prior to processing commencement.</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Privacy Notices ─────────────────────────────────────────────────── */}
        {tab === "notices" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total Notices"   value={notices.length}                                       sub="All channels/jurisdictions" color={NAV} icon="📄" />
              <KpiCard label="Published"       value={notices.filter((n:any)=>n.status==="published").length} sub="Live to users"          color={EME} icon="🌐" />
              <KpiCard label="Draft"           value={notices.filter((n:any)=>n.status==="draft").length}   sub="Pending approval"         color={AMB} icon="✏" />
              <KpiCard label="Under Review"    value={notices.filter((n:any)=>n.status==="review").length}  sub="Awaiting DPO"             color={BLU} icon="🔍" />
              <KpiCard label="DPO Approval Needed" value={notices.filter((n:any)=>!n.dpoApproved).length} sub="Action required"           color={RED} icon="⚠" alert />
            </div>
            <div style={{ display:"flex", gap:16 }}>
              <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:8 }}>
                {notices.map((n:any)=>(
                  <div key={n.id} onClick={()=>setSelectedNotice(selectedNotice?.id===n.id?null:n)}
                    style={card({ padding:12, cursor:"pointer", borderColor:selectedNotice?.id===n.id?NAV:"rgba(255,255,255,0.1)" })}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <Mono style={{ fontSize:9 }}>{n.id}</Mono>
                      <StatusBadge s={n.status} />
                    </div>
                    <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:4, lineHeight:1.3 }}>{n.name}</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:5 }}>{n.channel} · v{n.version} · Readability: {n.readabilityScore}/100</div>
                    <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                      {(n.languages as string[]).map(l=><Chip key={l} label={l} color={CYN} />)}
                    </div>
                    <div style={{ marginTop:6, fontSize:9, color:n.dpoApproved?EME:RED, fontWeight:700 }}>{n.dpoApproved?"✓ DPO Approved":"✗ Awaiting DPO"}</div>
                  </div>
                ))}
              </div>
              {selectedNotice ? (
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={card({ padding:"14px 20px" })}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{selectedNotice.name}</div>
                        <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{selectedNotice.id} · v{selectedNotice.version} · {selectedNotice.channel}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        {selectedNotice.dpoApproved?<Chip label="DPO Approved" color={EME} />:<Chip label="DPO Approval Needed" color={RED} />}
                        <button onClick={()=>setSelectedNotice(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--muted-foreground)" }}>×</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                    <div style={card({ padding:14 })}>
                      <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:8 }}>Readability Score</div>
                      <div style={{ fontSize:28, fontWeight:900, color:selectedNotice.readabilityScore>=75?EME:selectedNotice.readabilityScore>=60?AMB:RED, fontFamily:"monospace" }}>{selectedNotice.readabilityScore}<span style={{ fontSize:14, fontWeight:400, color:"var(--muted-foreground)" }}>/100</span></div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:4 }}>Flesch-Kincaid score. Target: 75+</div>
                    </div>
                    <div style={card({ padding:14 })}>
                      <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:8 }}>Languages</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {(selectedNotice.languages as string[]).map(l=><Chip key={l} label={l} color={CYN} />)}
                      </div>
                      <button style={{ marginTop:8, fontSize:10, fontWeight:700, color:BLU, background:`${BLU}12`, border:`1px solid ${BLU}33`, borderRadius:5, padding:"3px 8px", cursor:"pointer" }}>+ Request Translation</button>
                    </div>
                    <div style={card({ padding:14 })}>
                      <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:8 }}>Status & Actions</div>
                      <StatusBadge s={selectedNotice.status} />
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                        <button style={{ fontSize:10, fontWeight:700, color:EME, background:`${EME}12`, border:`1px solid ${EME}33`, borderRadius:5, padding:"4px 8px", cursor:"pointer" }}>Request DPO Approval</button>
                        <button style={{ fontSize:10, fontWeight:700, color:NAV, background:`${NAV}12`, border:`1px solid ${NAV}33`, borderRadius:5, padding:"4px 8px", cursor:"pointer" }}>Publish to Portal</button>
                        <button style={{ fontSize:10, fontWeight:700, color:AMB, background:`${AMB}12`, border:`1px solid ${AMB}33`, borderRadius:5, padding:"4px 8px", cursor:"pointer" }}>Auto-Translate (AI)</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--muted-foreground)", fontSize:13 }}>← Select a notice to view details</div>
              )}
            </div>
          </>
        )}

        {/* ── DSAR Management ──────────────────────────────────────────────── */}
        {tab === "dsars" && (
          !isSubModuleLicensed("privacyops","priv.dsr") ? <LockedModule moduleKey="priv.dsr" /> : <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              <KpiCard label="Total DSARs"      value={dsarStats.total}             sub="All jurisdictions"    color={NAV} icon="📥" />
              <KpiCard label="Open"             value={dsarStats.open}              sub="Active requests"      color={AMB} icon="⚙" />
              <KpiCard label="Overdue"          value={dsarStats.overdue}           sub="SLA breached"         color={RED} icon="🔴" alert />
              <KpiCard label="Completed (30d)"  value={dsarStats.completedThisMonth}sub="Last 30 days"         color={EME} icon="✓" />
              <KpiCard label="SLA Compliance"   value={`${dsarStats.slaCompliance}%`}sub="On-time response rate"color={EME} icon="⏱" />
              <KpiCard label="Avg Days Left"    value={dsarStats.avgDaysLeft}       sub="Open requests avg"    color={BLU} icon="📅" />
            </div>
            {/* Regulation filter */}
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>REGULATION:</span>
              {["All","GDPR","CCPA","LGPD","PDPA","DPDP","PDPL","APPI","PIPL"].map(r=>(
                <button key={r} onClick={()=>setDsarRegFilter(r)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:dsarRegFilter===r?`${regColor[r]??NAV}22`:"transparent", color:dsarRegFilter===r?regColor[r]??NAV:"var(--muted-foreground)", borderColor:dsarRegFilter===r?regColor[r]??NAV:"var(--border)" }}>{r}</button>
              ))}
              <span style={{ marginLeft:"auto", fontSize:10, color:"var(--muted-foreground)" }}>Showing {filteredDsars.length} of {dsarStats.total} total</span>
            </div>
            <TableShell
              cols={["DSAR ID","Type","Data Subject","Jurisdiction","Regulation","Received","Due","Status","Assignee","SLA"]}
              rows={filteredDsars.map(d=>{
                const slaColor = d.daysLeft<0?RED:d.daysLeft<=7?AMB:EME;
                return [
                  <Mono>{d.id}</Mono>,
                  <span style={{ fontSize:9, fontWeight:800, color:"#000", background:d.type==="Erasure"?RED:d.type==="Access"?BLU:d.type==="Portability"?EME:AMB, borderRadius:3, padding:"1px 6px" }}>{d.type}</span>,
                  <span style={{ fontWeight:700, color:NAV, fontSize:10 }}>{d.subject}</span>,
                  <Chip label={d.jurisdiction} color={CYN} />,
                  <Chip label={d.regulation} color={regColor[d.regulation]??NAV} />,
                  <Mono style={{ fontSize:9 }}>{d.received}</Mono>,
                  <Mono style={{ fontSize:9, color:d.daysLeft<0?RED:"var(--foreground)" }}>{d.due}</Mono>,
                  <StatusBadge s={d.status} />,
                  <span style={{ fontSize:10 }}>{d.assignee}</span>,
                  <span style={{ fontSize:10, fontWeight:800, color:slaColor, fontFamily:"monospace" }}>{d.daysLeft<0?`${Math.abs(d.daysLeft)}d OVERDUE`:d.daysLeft===0?"Done":`${d.daysLeft}d`}</span>,
                ];
              })}
              onRowClick={i=>setSelectedDsar(filteredDsars[i]===selectedDsar?null:filteredDsars[i])}
            />
            {selectedDsar && (
              <div style={card({ padding:20 })}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{selectedDsar.id} — {selectedDsar.type} Request</div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>{selectedDsar.subject} · {selectedDsar.regulation} · {selectedDsar.jurisdiction}</div>
                  </div>
                  <button onClick={()=>setSelectedDsar(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--muted-foreground)" }}>×</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
                  {[["Received",selectedDsar.received],["Due",selectedDsar.due],["Assignee",selectedDsar.assignee],["Jurisdiction",selectedDsar.jurisdiction]].map(([k,v])=>(
                    <div key={String(k)} style={{ background:"var(--input)", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:3, textTransform:"uppercase" }}>{k}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--foreground)" }}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* DSR Fulfilment Stage Tracker + per-store pipeline */}
                <DsrFulfilmentPipeline dsarId={selectedDsar.id} dsar={selectedDsar} connectors={dsrConnectors} />

                <div style={{ marginTop:12, display:"flex", gap:8 }}>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:NAV, border:"none", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>🤖 Draft AI Response</button>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:EME, border:"none", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>Mark Completed</button>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:`1px solid ${NAV}`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>Export PDF Package</button>
                </div>
              </div>
            )}

            {/* DSR Connectors Grid */}
            <div style={card({ padding:"14px 18px" })}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV }}>🔌 DSR Data Source Connectors ({dsrConnectors.length} configured)</div>
                <div style={{ display:"flex", gap:8 }}>
                  {[["All",dsrConnectors.length],["Connected",dsrConnectors.filter(c=>c.status==="connected").length],["Warning",dsrConnectors.filter(c=>c.status==="warning").length],["Disconnected",dsrConnectors.filter(c=>c.status==="disconnected").length]].map(([lbl,cnt])=>(
                    <div key={String(lbl)} style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:700 }}>
                      <span style={{ marginRight:4, color:lbl==="Connected"?EME:lbl==="Warning"?AMB:lbl==="Disconnected"?RED:"var(--muted-foreground)", fontWeight:800 }}>{cnt}</span>{lbl}
                    </div>
                  ))}
                </div>
              </div>
              {dsrConnectors.length === 0 ? (
                <div style={{ textAlign:"center", padding:"30px 0", color:"rgba(148,163,184,0.5)", fontSize:12 }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>🔌</div>
                  No connectors configured — connect your HR, CRM, cloud storage, email, and database systems to automate DSAR fulfilment
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                  {dsrConnectors.map((c:any) => {
                    const stClr = c.status==="connected"?EME:c.status==="warning"?AMB:RED;
                    const stDot = c.status==="connected"?"●":c.status==="warning"?"●":"○";
                    return (
                      <div key={c.connectorId} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${stClr}33`, background:`${stClr}06`, position:"relative" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                          <div style={{ fontSize:22 }}>{c.icon}</div>
                          <span style={{ fontSize:9, fontWeight:800, color:stClr }}>{stDot} {c.status}</span>
                        </div>
                        <div style={{ fontSize:11, fontWeight:800, color:"var(--foreground)", marginBottom:2 }}>{c.name}</div>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:8 }}>{c.type?.toUpperCase()}</div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Subjects</span>
                          <span style={{ fontSize:9, fontFamily:"monospace", color:NAV, fontWeight:700 }}>{(c.subjectCount||0).toLocaleString()}</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Avg Fulfil</span>
                          <span style={{ fontSize:9, fontFamily:"monospace", color:c.avgFulfillDays>5?RED:c.avgFulfillDays>3?AMB:EME, fontWeight:700 }}>{c.avgFulfillDays}d</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Last Scan</span>
                          <span style={{ fontSize:9, fontFamily:"monospace", color:"var(--muted-foreground)" }}>{c.lastScan}</span>
                        </div>
                        {c.notes && (
                          <div style={{ fontSize:8, color:"var(--muted-foreground)", lineHeight:1.4, borderTop:"1px solid var(--border)", paddingTop:6 }}>{c.notes}</div>
                        )}
                        {c.status !== "connected" && (
                          <button style={{ marginTop:8, width:"100%", padding:"5px", borderRadius:6, border:`1px solid ${stClr}`, background:"transparent", color:stClr, fontSize:9, fontWeight:800, cursor:"pointer" }}>
                            {c.status==="disconnected"?"🔌 Reconnect":"⚙ Fix Issue"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Consent ───────────────────────────────────────────────────────── */}
        {tab === "consent" && (
          !isSubModuleLicensed("privacyops","priv.consent") ? <LockedModule moduleKey="priv.consent" /> : <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total Records"  value={consentStats.total.toLocaleString()} sub="Across all channels"   color={NAV} icon="✅" />
              <KpiCard label="Active"         value={consentStats.active.toLocaleString()}  sub="Valid consents"        color={EME} icon="✓" />
              <KpiCard label="Expired"        value={consentStats.expired.toLocaleString()} sub="Require re-consent"    color={AMB} icon="⏰" alert />
              <KpiCard label="Withdrawn"      value={consentStats.withdrawn}         sub="Opted out"             color={RED} icon="✗" />
              <KpiCard label="Opt-In Rate"    value={`${consentStats.total > 0 ? Math.round((consentStats.active / consentStats.total) * 100) : 0}%`} sub="Global average" color={CYN} icon="📊" />
            </div>
            {/* Analytics grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Opt-In Rate by Jurisdiction</div>
                {consentStats.byJurisdiction.map(j=>(
                  <div key={j.j} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:10, fontWeight:600 }}>{j.j}</span>
                      <span style={{ fontSize:10, fontFamily:"monospace", color:j.optIn>=70?EME:j.optIn>=55?AMB:RED, fontWeight:800 }}>{j.optIn}%</span>
                    </div>
                    <MiniBar value={j.optIn} max={100} color={j.optIn>=70?EME:j.optIn>=55?AMB:RED} />
                  </div>
                ))}
              </div>
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Consent by Channel</div>
                {consentStats.byChannel.map(ch=>(
                  <div key={ch.ch} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>{ch.ch}</div>
                    <div style={{ display:"flex", gap:3 }}>
                      {[["Active",ch.active,EME],["Expired",ch.expired,AMB],["Withdrawn",ch.withdrawn,RED]].map(([l,v,c])=>(
                        <div key={String(l)} style={{ flex:v, padding:"3px 0", background:String(c), borderRadius:2, minWidth:3 }} title={`${l}: ${v}`} />
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:3 }}>
                      {[["Active",ch.active,EME],["Expired",ch.expired,AMB],["Withdrawn",ch.withdrawn,RED]].map(([l,v,c])=>(
                        <span key={String(l)} style={{ fontSize:8, color:String(c) }}>{l}: {v}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={card({ padding:"14px 16px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>A/B Banner Tests</div>
                {consentStats.abTests.map(t=>(
                  <div key={t.id} style={{ padding:"10px 12px", borderRadius:8, border:"1px solid var(--border)", marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:10, fontWeight:700 }}>{t.name}</span>
                      <StatusBadge s={t.status} />
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <div style={{ flex:t.blueRate, height:8, background:BLU, borderRadius:"3px 0 0 3px" }} />
                      <div style={{ flex:t.greenRate, height:8, background:EME, borderRadius:"0 3px 3px 0" }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                      <span style={{ fontSize:9, color:BLU }}>A: {t.blueRate}%</span>
                      <span style={{ fontSize:9, color:EME }}>B: {t.greenRate}%</span>
                    </div>
                    {t.winner && <div style={{ fontSize:9, color:EME, fontWeight:700, marginTop:3 }}>Winner: {t.winner}</div>}
                  </div>
                ))}
              </div>
            </div>
            {/* Purpose opt-in rates */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Opt-In Rate by Processing Purpose</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                {consentStats.byPurpose.map(p=>(
                  <div key={p.purpose} style={{ textAlign:"center", padding:"12px 8px", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:24, fontWeight:900, color:p.rate>=60?EME:p.rate>=45?AMB:RED, fontFamily:"monospace" }}>{p.rate}%</div>
                    <div style={{ fontSize:10, color:"var(--foreground)", fontWeight:600, marginTop:4 }}>{p.purpose}</div>
                    <MiniBar value={p.rate} max={100} color={p.rate>=60?EME:p.rate>=45?AMB:RED} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── DPA Tracker ──────────────────────────────────────────────────── */}
        {tab === "dpas" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total DPAs"     value={liveDpaStats.total}          sub="All vendor agreements"  color={NAV} icon="📜" />
              <KpiCard label="Active"         value={liveDpaStats.active}         sub="In force"               color={EME} icon="✓" />
              <KpiCard label="Expiring Soon"  value={liveDpaStats.expiring}       sub="< 90 days"              color={AMB} icon="⏰" alert />
              <KpiCard label="Expired"        value={liveDpaStats.expired}        sub="Renew immediately"      color={RED} icon="⚠" alert />
              <KpiCard label="With SCCs"      value={liveDpaStats.withSCCs}       sub="SCCs/transfer mechanism"color={BLU} icon="🔒" />
            </div>
            <TableShell
              cols={["ID","Vendor","Country","Purpose","Signed","Expiry","Mechanism","Risk","DPO","Status"]}
              rows={dpas.map((d:any)=>[
                <Mono>{d.id}</Mono>,
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{d.vendor}</span>,
                <Chip label={d.country} color={CYN} />,
                <span style={{ fontSize:10, color:"var(--muted-foreground)", maxWidth:120, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.purpose}</span>,
                <Mono style={{ fontSize:9 }}>{d.signed}</Mono>,
                <Mono style={{ fontSize:9, color:d.status==="expired"?RED:d.status==="expiring-soon"?AMB:"var(--foreground)" }}>{d.expiry}</Mono>,
                <Chip label={d.mechanism} color={BLU} />,
                <SevBadge label={d.risk} />,
                d.dpo?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:RED, fontWeight:700 }}>✗</span>,
                <StatusBadge s={d.status} />,
              ])}
            />
          </>
        )}

        {/* ── Regulatory Tracker ─────────────────────────────────────────────── */}
        {tab === "regs" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Regulations Tracked" value={liveRegStats.total}     sub="150+ global privacy laws" color={NAV} icon="🌍" />
              <KpiCard label="Compliant"            value={liveRegStats.active}    sub="Active / In force"        color={EME} icon="✓" />
              <KpiCard label="Gap / Review"         value={liveRegStats.gap}       sub="Gaps identified"          color={AMB} icon="◎" />
              <KpiCard label="Action Required"      value={liveRegStats.gap}       sub="Action required"          color={RED} icon="⚠" alert />
              <KpiCard label="Upcoming Deadlines"   value={liveRegStats.upcoming}  sub="Next 180 days"            color={AMB} icon="📅" alert />
            </div>
            <TableShell
              cols={["Regulation","Jurisdiction","Category","Obligations","Status","Coverage","Deadline","Owner"]}
              rows={regs.map((r:any)=>[
                <span style={{ fontSize:11, fontWeight:800, color:regColor[r.reg]??NAV }}>{r.reg}</span>,
                <Chip label={r.jurisdiction} color={CYN} />,
                <Chip label={r.category} color={PRP} />,
                <span style={{ fontFamily:"monospace", fontSize:10, color:NAV, fontWeight:700 }}>{r.oblCount}</span>,
                <StatusBadge s={r.status} />,
                <div style={{ width:90 }}><MiniBar value={r.pct} max={100} color={r.pct>=75?EME:r.pct>=50?AMB:RED} /></div>,
                <Mono style={{ fontSize:9, color:r.deadline==="Ongoing"?"var(--muted-foreground)":AMB }}>{r.deadline}</Mono>,
                <span style={{ fontSize:10 }}>{r.owner}</span>,
              ])}
            />
          </>
        )}

        {/* ── Breach Management ──────────────────────────────────────────────── */}
        {tab === "breach" && (
          !isSubModuleLicensed("privacyops","priv.incidents") ? <LockedModule moduleKey="priv.incidents" /> : <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              <KpiCard label="Total Breaches"     value={breachKpis.totalBreaches}   sub="All incidents"          color={NAV} icon="🔒" />
              <KpiCard label="Open Investigations" value={breachKpis.openInvestigations} sub="Active now"          color={RED} icon="🚨" alert />
              <KpiCard label="Avg Response Time"  value={`${breachKpis.avgResponseHours}h`} sub="Avg to notify DPA"   color={AMB} icon="⏱" />
              <KpiCard label="DPA Notifications"  value={breachKpis.dpaNotifications} sub="Submitted to regulators"color={BLU} icon="📮" />
              <KpiCard label="Data Subjects Affected" value={breachKpis.affectedTotal.toLocaleString()} sub="Total across all breaches" color={RED} icon="👤" />
              <KpiCard label="72h SLA Rate"       value={`${breachKpis.slaCompliance}%`} sub="On-time notifications" color={EME} icon="⚡" />
            </div>

            {/* Active 72h countdown */}
            {_breaches.find(b=>b.status==="investigating") && (
              <div style={{ padding:"14px 18px", borderRadius:12, border:`2px solid ${RED}44`, background:`${RED}08`, display:"flex", alignItems:"center", gap:20 }}>
                <div style={{ flexShrink:0 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:RED, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4 }}>⏱ 72-Hour DPA Notification Countdown — BR-003</div>
                  <div style={{ fontSize:28, fontWeight:900, color:RED, fontFamily:"'JetBrains Mono',monospace" }}>{String(breachRH).padStart(2,"0")}:{String(breachRM).padStart(2,"0")}:{String(breachRS).padStart(2,"0")}</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>Hours:Mins:Secs remaining · {breachElapsed}h elapsed</div>
                </div>
                <div style={{ flex:1, height:12, borderRadius:6, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                  <div style={{ width:`${(breachElapsed/72)*100}%`, height:"100%", borderRadius:6, background:RED }} />
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", marginBottom:4 }}>Insider Data Theft — Sales DB</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:6 }}>4,120 data subjects affected · ICO must be notified by deadline</div>
                  <button style={{ padding:"6px 14px", borderRadius:7, background:RED, border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>Notify ICO Now</button>
                </div>
              </div>
            )}

            {/* Breach registry */}
            <TableShell
              cols={["ID","Breach Title","Severity","Status","Discovered","Affected","Categories","Regulators","72h SLA","Root Cause"]}
              rows={_breaches.map(b=>[
                <Mono>{b.id}</Mono>,
                <span style={{ fontSize:11, fontWeight:700, color:NAV }}>{b.title}</span>,
                <SevBadge label={b.severity} />,
                <StatusBadge s={b.status} />,
                <Mono style={{ fontSize:9 }}>{b.discoveredAt}</Mono>,
                <span style={{ fontFamily:"monospace", fontSize:10, color:b.affected>50000?RED:AMB, fontWeight:700 }}>{b.affected.toLocaleString()}</span>,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", maxWidth:120 }}>{(b.categories as string[]).map(c=><Chip key={c} label={c} color={PRP} />)}</div>,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", maxWidth:100 }}>{(b.regulators as string[]).map(r=><Chip key={r} label={r} color={BLU} />)}</div>,
                b.notified72h?<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✓ Met</span>:<span style={{ color:RED, fontWeight:700, fontSize:10 }}>✗ Missed</span>,
                <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{b.rootCause}</span>,
              ])}
              onRowClick={i=>setSelectedBreach(_breaches[i]===selectedBreach?null:_breaches[i])}
            />
            {selectedBreach && (
              <div style={card({ padding:20 })}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:NAV }}>{selectedBreach.id}: {selectedBreach.title}</div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:2 }}>Discovered: {selectedBreach.discoveredAt} · Lead Counsel: {selectedBreach.leadCounsel}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <SevBadge label={selectedBreach.severity} />
                    <StatusBadge s={selectedBreach.status} />
                    <button onClick={()=>setSelectedBreach(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--muted-foreground)" }}>×</button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                  {[["Root Cause",selectedBreach.rootCause],["Remediation",selectedBreach.remediation],["Regulatory Notification",selectedBreach.timeline]].map(([k,v])=>(
                    <div key={String(k)} style={{ background:"var(--input)", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:4, textTransform:"uppercase" }}>{k}</div>
                      <div style={{ fontSize:11, color:"var(--foreground)" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, display:"flex", gap:8 }}>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:RED, border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>File Regulatory Notification</button>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:`1px solid ${NAV}`, color:NAV, fontSize:11, fontWeight:700, cursor:"pointer" }}>Export Incident Report</button>
                  <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:"1px solid var(--border)", color:"var(--foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>Notify Affected Subjects</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Cookie Compliance ───────────────────────────────────────────────── */}
        {tab === "cookie" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
              <KpiCard label="Cookies Scanned" value={cookieStats.total}           sub="First & third party"   color={NAV} icon="🍪" />
              <KpiCard label="Third-Party"     value={cookieStats.thirdParty}      sub="Tracking / marketing"  color={AMB} icon="🔗" />
              <KpiCard label="Marketing"       value={cookieStats.marketing}        sub="Require consent"       color={PRP} icon="📢" />
              <KpiCard label="IAB Non-Compliant" value={cookieStats.iabNonCompliant} sub="TCF 2.2 violation"  color={RED} icon="⚠" alert />
              <KpiCard label="Global Opt-In Rate" value={`${cookieStats.optInRate}%`} sub="Consent banner avg" color={EME} icon="✅" />
              <KpiCard label="Analytics"       value={cookieStats.analytics}        sub="Performance tracking"  color={BLU} icon="📊" />
            </div>
            {/* Type filter */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>TYPE:</span>
              {["All","Strictly Necessary","Analytics","Marketing","Functional"].map(t=>(
                <button key={t} onClick={()=>setCookieTypeFilter(t)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:cookieTypeFilter===t?"rgba(147,197,253,0.15)":"transparent", color:cookieTypeFilter===t?NAV:"var(--muted-foreground)", borderColor:cookieTypeFilter===t?NAV:"var(--border)" }}>{t}</button>
              ))}
            </div>
            <TableShell
              cols={["Cookie Name","Domain","Type","Party","SameSite","HttpOnly","Expiry","TCF Vendor","IAB TCF 2.2","Purpose"]}
              rows={filteredCookies.map(c=>[
                <Mono style={{ color:c.iabCompliant?"var(--foreground)":RED }}>{c.name}</Mono>,
                <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{c.domain}</span>,
                <Chip label={c.type} color={c.type==="Marketing"?PRP:c.type==="Analytics"?BLU:c.type==="Strictly Necessary"?EME:NAV} />,
                <span style={{ fontSize:9, fontWeight:700, color:c.party==="3rd"?AMB:EME }}>{c.party}</span>,
                <Chip label={c.samesite} color={c.samesite==="None"?RED:c.samesite==="Strict"?EME:AMB} />,
                c.httpOnly?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:RED, fontWeight:700 }}>✗</span>,
                <span style={{ fontSize:9, fontFamily:"monospace" }}>{c.expiry}</span>,
                <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{c.tcfVendor??"N/A"}</span>,
                c.iabCompliant?<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✓ Compliant</span>:<span style={{ color:RED, fontWeight:700, fontSize:10 }}>✗ Non-Compliant</span>,
                <span style={{ fontSize:9, color:"var(--muted-foreground)", maxWidth:140, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.purpose}</span>,
              ])}
            />
            {/* Cookie Policy Auto-Generator */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>🍪 Cookie Policy Auto-Generator</div>
              <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:12 }}>Select jurisdictions to generate a jurisdiction-specific cookie notice. The generator applies IAB TCF 2.2, ePrivacy Directive, GDPR Art.13, CCPA §1798.135, and LGPD Art.8 requirements automatically.</div>
              <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"flex-start" }}>
                <div style={{ minWidth:260 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" }}>Target Jurisdictions</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {[["EU/EEA (GDPR)",true],["United Kingdom (UK GDPR)",true],["California (CCPA/CPRA)",true],["Brazil (LGPD)",false],["Canada (PIPEDA)",false],["Japan (APPI)",false],["Singapore (PDPA)",false],["India (DPDP)",false]].map(([j,sel])=>(
                      <div key={String(j)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:9, fontWeight:700, cursor:"pointer", background:sel?"rgba(147,197,253,0.15)":"transparent", color:sel?NAV:"var(--muted-foreground)", borderColor:sel?NAV:"var(--border)" }}>{String(j)}</div>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth:200 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" }}>Policy Options</div>
                  {[["Include IAB TCF 2.2 Vendor List","checked"],["Add Opt-Out Links per Jurisdiction","checked"],["Include Do-Not-Sell (CCPA)","checked"],["Add Cookie Lifetime Table","unchecked"],["Include Processing Purposes","checked"]].map(([o,c])=>(
                    <div key={String(o)} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                      <div style={{ width:12, height:12, borderRadius:2, border:`1.5px solid ${c==="checked"?NAV:"var(--border)"}`, background:c==="checked"?"rgba(147,197,253,0.15)":"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {c==="checked" && <span style={{ fontSize:8, color:NAV, fontWeight:900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize:9, color:"var(--foreground)" }}>{String(o)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:9, fontWeight:800, color:"var(--muted-foreground)", marginBottom:6, textTransform:"uppercase" }}>Generated Policy Preview</div>
                  <div style={{ background:"var(--input)", borderRadius:8, padding:"10px 12px", fontSize:9, color:"var(--foreground)", lineHeight:1.6, fontFamily:"monospace", maxHeight:130, overflow:"auto" }}>
                    <strong>COOKIE NOTICE</strong> (EU/EEA · UK · California)<br/>
                    Last updated: {new Date().toLocaleDateString()}<br/><br/>
                    We use cookies to enhance your experience. Under GDPR Art.6 and UK GDPR, you have the right to consent or object to each purpose. Under CCPA §1798.135, California residents may opt out of the sale or sharing of personal information via cookies.<br/><br/>
                    <strong>Categories:</strong> Strictly Necessary (no consent required) · Analytics (consent required EU/UK) · Marketing (consent required EU/UK/CA) · Functional (consent required EU/UK).<br/><br/>
                    <strong>IAB TCF 2.2:</strong> We use the IAB Transparency &amp; Consent Framework. Vendor list available at iabeurope.eu.
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:NAV, border:"none", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>⬇ Export .docx</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:`1px solid ${EME}`, color:EME, fontSize:11, fontWeight:700, cursor:"pointer" }}>🌐 Publish to Website</button>
                    <button style={{ padding:"7px 14px", borderRadius:7, background:"transparent", border:"1px solid var(--border)", color:"var(--foreground)", fontSize:11, fontWeight:700, cursor:"pointer" }}>📋 Copy HTML</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Banner performance by jurisdiction */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Consent Banner Performance by Jurisdiction</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                {cookieBannerPerf.map(p=>(
                  <div key={p.jurisdiction} style={{ textAlign:"center", padding:"12px 8px", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:p.optIn>=70?EME:p.optIn>=55?AMB:RED, fontFamily:"monospace" }}>{p.optIn}%</div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--foreground)", margin:"4px 0" }}>Opt-In · {p.jurisdiction}</div>
                    <div style={{ display:"flex", gap:2, height:6, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ flex:p.optIn, background:EME }} />
                      <div style={{ flex:p.optOut, background:RED }} />
                      <div style={{ flex:p.dismissed, background:"rgba(255,255,255,0.15)" }} />
                    </div>
                    <div style={{ fontSize:8, color:"var(--muted-foreground)", marginTop:3 }}>Out:{p.optOut}% Dismissed:{p.dismissed}%</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Cross-Border Transfer Hub ──────────────────────────────────────── */}
        {tab === "transfers" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Total Transfers" value={transferStats.total}       sub="All mechanisms"         color={NAV} icon="🌍" />
              <KpiCard label="Active"          value={transferStats.active}      sub="Operational"            color={EME} icon="✓" />
              <KpiCard label="Under Review"    value={transferStats.underReview} sub="TIA pending"            color={AMB} icon="🔍" alert />
              <KpiCard label="Blocked"         value={transferStats.blocked}     sub="High risk — suspended"  color={RED} icon="🚫" alert />
              <KpiCard label="SCC (2021)"      value={transferStats.sccs}        sub="Updated SCCs in use"    color={BLU} icon="📋" />
            </div>
            {/* Adequacy countries */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>EU Adequacy Decisions — {adequacyCountries.length} Approved Countries</div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {adequacyCountries.map(c=><Chip key={c} label={c} color={EME} />)}
                <Chip label="USA (DPF)" color={BLU} />
                <Chip label="⚠ China — No Adequacy" color={RED} />
                <Chip label="⚠ Russia — No Adequacy" color={RED} />
              </div>
            </div>
            {/* Adequacy Map — simplified SVG world map with adequacy decisions */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:6 }}>🌍 EU Adequacy Decision Map</div>
              <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:10 }}>Countries with EU adequacy decisions (green) allow free data flows. All others require transfer mechanisms (SCCs, BCRs, derogations).</div>
              <svg viewBox="0 0 800 300" style={{ width:"100%", height:200, display:"block" }}>
                {/* Simplified world map background */}
                <rect width="800" height="300" fill="rgba(30,41,59,0.4)" rx="8" />
                {/* Europe */}
                <ellipse cx="390" cy="110" rx="55" ry="40" fill="#22D3EE22" stroke="#22D3EE44" strokeWidth="0.5" />
                <text x="390" y="108" textAnchor="middle" fill="#22D3EE" fontSize="7" fontWeight="700">EU/EEA (Lawful origin)</text>
                {/* Adequacy countries — green */}
                {[["UK",330,95],["CH",375,118],["NO",385,88],["IS",350,78],["LI",380,120],["AD",372,130],["NZ",720,240],["AU",680,230],["CA",145,110],["IL",445,135],["JP",700,130],["UY",200,240],["AR",195,260],["KR",680,150]].map(([c,x,y])=>(
                  <g key={String(c)}>
                    <circle cx={Number(x)} cy={Number(y)} r="10" fill="#22D3EE22" stroke="#22D3EE" strokeWidth="1.2" />
                    <text x={Number(x)} y={Number(y)+3} textAnchor="middle" fill="#22D3EE" fontSize="6" fontWeight="800">{String(c)}</text>
                  </g>
                ))}
                {/* USA — DPF */}
                <g><ellipse cx="155" cy="130" rx="32" ry="18" fill="#60A5FA22" stroke="#60A5FA" strokeWidth="1.2" /><text x="155" y="128" textAnchor="middle" fill="#60A5FA" fontSize="6" fontWeight="800">USA</text><text x="155" y="136" textAnchor="middle" fill="#60A5FA" fontSize="5">(DPF only)</text></g>
                {/* No adequacy — red dots */}
                {[["CN",640,130],["RU",530,95],["IN",580,155],["BR",210,210],["SG",655,185],["AE",490,155]].map(([c,x,y])=>(
                  <g key={String(c)}>
                    <circle cx={Number(x)} cy={Number(y)} r="9" fill="#F8717122" stroke="#F87171" strokeWidth="1" />
                    <text x={Number(x)} y={Number(y)+3} textAnchor="middle" fill="#F87171" fontSize="6" fontWeight="700">{String(c)}</text>
                  </g>
                ))}
                {/* Legend */}
                <circle cx="20" cy="280" r="5" fill="#22D3EE44" stroke="#22D3EE" strokeWidth="1" /><text x="28" y="283" fill="#22D3EE" fontSize="7">Adequacy decision</text>
                <circle cx="115" cy="280" r="5" fill="#60A5FA44" stroke="#60A5FA" strokeWidth="1" /><text x="123" y="283" fill="#60A5FA" fontSize="7">Partial (DPF)</text>
                <circle cx="185" cy="280" r="5" fill="#F8717122" stroke="#F87171" strokeWidth="1" /><text x="193" y="283" fill="#F87171" fontSize="7">No adequacy — SCCs required</text>
              </svg>
            </div>

            {/* Schrems II Checklist */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:8 }}>⚖️ Schrems II TIA Checklist Workflow</div>
              <div style={{ fontSize:9, color:"var(--muted-foreground)", marginBottom:10 }}>Transfer Impact Assessment (TIA) required for all EU→third-country transfers post-Schrems II ruling (CJEU C-311/18). Complete for each non-adequacy destination.</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {[
                  { step:1, title:"Identify Transfer",       done:true,  desc:"Map data flow, sender, recipient, third country" },
                  { step:2, title:"Verify Legal Basis",      done:true,  desc:"SCC, BCR, derogation or adequacy decision" },
                  { step:3, title:"Assess Destination Law",  done:true,  desc:"Evaluate surveillance laws (§702 FISA, EO 12333)" },
                  { step:4, title:"Identify Supplemental",   done:false, desc:"Technical (encryption, pseudonymisation) + contractual measures" },
                  { step:5, title:"Implement Measures",      done:false, desc:"Deploy supplemental safeguards before resuming transfer" },
                  { step:6, title:"Document & Review",       done:false, desc:"Record TIA, schedule annual review, notify DPA if needed" },
                  { step:7, title:"DPA Notification",        done:false, desc:"Suspend transfer if adequate protection not achievable" },
                  { step:8, title:"Ongoing Monitoring",      done:false, desc:"Monitor destination country law changes quarterly" },
                ].map(s=>(
                  <div key={s.step} style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${s.done?EME+"55":NAV+"22"}`, background:s.done?"rgba(52,211,153,0.05)":"var(--card)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:8, fontWeight:700, color:"var(--muted-foreground)" }}>Step {s.step}</span>
                      <span style={{ fontSize:8, fontWeight:900, color:s.done?EME:AMB }}>{s.done?"✓ Done":"Pending"}</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:800, color:s.done?EME:NAV, marginBottom:3 }}>{s.title}</div>
                    <div style={{ fontSize:8, color:"var(--muted-foreground)", lineHeight:1.4 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mechanism filter */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>MECHANISM:</span>
              {["All","SCCs","Adequacy","UK IDTA","BCR","Derogation"].map(m=>(
                <button key={m} onClick={()=>setTransferMechFilter(m)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:transferMechFilter===m?"rgba(147,197,253,0.15)":"transparent", color:transferMechFilter===m?NAV:"var(--muted-foreground)", borderColor:transferMechFilter===m?NAV:"var(--border)" }}>{m}</button>
              ))}
            </div>
            <TableShell
              cols={["ID","From","To","Vendor","Mechanism","Data Types","Risk","TIA Status","Schrems II","Status"]}
              rows={filteredTransfers.map(t=>[
                <Mono>{t.id}</Mono>,
                <Chip label={t.from} color={BLU} />,
                <Chip label={t.to} color={CYN} />,
                <span style={{ fontSize:10, fontWeight:700, color:NAV }}>{t.vendor}</span>,
                <Chip label={t.mechanism} color={t.mechanism.includes("SCCs")?BLU:t.mechanism==="Adequacy"?EME:t.mechanism==="BCR"?PRP:AMB} />,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", maxWidth:110 }}>{(t.dataTypes as string[]).map(d=><Chip key={d} label={d} color={PRP} />)}</div>,
                <SevBadge label={t.risk} />,
                <StatusBadge s={t.tia==="Completed"?"compliant":t.tia==="Pending"?"partial":t.tia==="In Review"?"in-progress":"gap"} />,
                t.schrems2?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:RED, fontWeight:700 }}>✗</span>,
                <StatusBadge s={t.status} />,
              ])}
            />
          </>
        )}

        {/* ── AI Data Governance ────────────────────────────────────────────── */}
        {tab === "ai" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="AI Models"          value={aiStats.total}          sub="In inventory"           color={NAV} icon="🤖" />
              <KpiCard label="Approved"           value={aiStats.approved}       sub="Privacy-cleared"        color={EME} icon="✓" />
              <KpiCard label="Shadow AI"          value={aiStats.shadowAI}       sub="Unapproved tools"       color={RED} icon="👻" alert />
              <KpiCard label="Auto-Decision (Art.22)" value={aiStats.autoDec}   sub="GDPR safeguards req'd"  color={AMB} icon="⚡" alert />
              <KpiCard label="Personal Data Use"  value={aiStats.personalDataUse}sub="Models using PII"       color={AMB} icon="👤" />
            </div>
            <TableShell
              cols={["Model ID","AI Model","Vendor","Purpose","Uses Personal Data","Auto-Decision","Art.22","Bias Risk","Shadow AI","Status"]}
              rows={_aiModels.map(m=>[
                <Mono>{m.id}</Mono>,
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{m.name}</span>,
                <Chip label={m.vendor} color={BLU} />,
                <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{m.purpose}</span>,
                m.personalData?<span style={{ color:AMB, fontWeight:700 }}>✓ Yes</span>:<span style={{ color:EME, fontWeight:700 }}>✗ No</span>,
                m.autoDec?<span style={{ color:RED, fontWeight:700 }}>✓ Yes</span>:<span style={{ color:EME, fontWeight:700 }}>✗ No</span>,
                m.gdprArt22?<span style={{ color:RED, fontWeight:700 }}>Required</span>:<span style={{ color:"var(--muted-foreground)", fontWeight:700 }}>N/A</span>,
                <SevBadge label={m.bias} />,
                m.shadowAI?<span style={{ color:RED, fontWeight:800, fontSize:10 }}>👻 Shadow</span>:<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✓ Approved</span>,
                <StatusBadge s={m.status==="approved"?"compliant":m.status==="review"?"in-progress":m.status==="gap"?"gap":m.status==="shadow"?"open":"draft"} />,
              ])}
            />
            {/* Art. 22 safeguard checklist */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>GDPR Art. 22 — Automated Decision-Making Safeguards ({aiStats.autoDec} Models)</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                {[
                  ["Human review mechanism in place",true],
                  ["Data subject informed of auto-decision",false],
                  ["Opt-out option provided to data subjects",false],
                  ["Meaningful information on logic provided",false],
                  ["DPO consulted on all Art.22 models",false],
                  ["Model explainability documentation",true],
                  ["DPIA completed for each auto-decision model",false],
                  ["Bias testing and fairness audit conducted",false],
                ].map(([l,done])=>(
                  <div key={String(l)} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:7, border:`1px solid ${done?"rgba(52,211,153,0.2)":"rgba(248,113,113,0.2)"}`, background:done?"rgba(52,211,153,0.04)":"rgba(248,113,113,0.04)" }}>
                    <span style={{ fontSize:14, color:done?EME:RED }}>{done?"✓":"✗"}</span>
                    <span style={{ fontSize:11, color:"var(--foreground)" }}>{l}</span>
                    {!done && <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, color:RED }}>Action Required</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Children's Privacy ────────────────────────────────────────────── */}
        {tab === "children" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Apps Audited"       value={childrenStats.appsAudited}          sub="Under children's privacy" color={NAV} icon="🧒" />
              <KpiCard label="COPPA Compliant"    value={childrenStats.coppaCompliant}        sub="USA federal requirement"  color={EME} icon="✓" />
              <KpiCard label="GDPR Art.8 Compliant" value={childrenStats.gdpr8Compliant}     sub="Age verification in place" color={EME} icon="✓" />
              <KpiCard label="AADC Compliant"     value={childrenStats.aadcCompliant}         sub="UK Age Design Code"       color={AMB} icon="◎" alert />
              <KpiCard label="Critical Gaps"      value={childrenStats.gaps}                  sub="No age-gating"           color={RED} icon="⚠" alert />
            </div>
            <TableShell
              cols={["App","Platform","Age Range","COPPA","GDPR Art.8","AADC","Age Verification","Parental Consent","Age-Gating","Status"]}
              rows={_childApps.map(a=>[
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{a.name}</span>,
                <Chip label={a.platform} color={BLU} />,
                <Chip label={a.ageRange} color={PRP} />,
                a.coppa?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:"var(--muted-foreground)", fontWeight:700 }}>N/A</span>,
                a.gdpr8?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:"var(--muted-foreground)", fontWeight:700 }}>N/A</span>,
                a.aadc?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:RED, fontWeight:700 }}>✗</span>,
                <span style={{ fontSize:9, color:"var(--foreground)" }}>{a.ageVerification}</span>,
                <span style={{ fontSize:9, color:"var(--foreground)" }}>{a.parentalConsent}</span>,
                <StatusBadge s={a.gating==="full"?"compliant":a.gating==="partial"?"partial":"gap"} />,
                <StatusBadge s={a.status} />,
              ])}
            />
            {/* Upcoming deadlines */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:RED, marginBottom:10 }}>⚠ Upcoming Children's Privacy Obligations</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                {[
                  { reg:"COPPA (USA)",         deadline:"Ongoing",    obligation:"Verifiable parental consent for <13. No targeting. Annual DSAR handling.", daysLeft:0 },
                  { reg:"AADC (UK)",            deadline:"2024-09-01", obligation:"Age-appropriate design — disable data sharing by default for users under 18.", daysLeft:77 },
                  { reg:"KOSA (USA — Draft)",   deadline:"2025-01-01", obligation:"Duty of care for minors — restrict addictive features, targeted advertising.", daysLeft:199 },
                ].map(d=>(
                  <div key={d.reg} style={{ padding:"12px 14px", borderRadius:8, border:`1px solid ${d.daysLeft<90?RED+"44":AMB+"44"}`, background:d.daysLeft<90?"rgba(248,113,113,0.05)":"rgba(252,211,77,0.05)" }}>
                    <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:4 }}>{d.reg}</div>
                    <div style={{ fontSize:9, color:"var(--foreground)", lineHeight:1.5, marginBottom:6 }}>{d.obligation}</div>
                    <div style={{ fontSize:9, fontWeight:700, color:d.daysLeft===0?"var(--muted-foreground)":d.daysLeft<90?RED:AMB }}>Deadline: {d.deadline}{d.daysLeft>0?` — ${d.daysLeft} days`:""}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Vendor Privacy Assessment ─────────────────────────────────────── */}
        {tab === "vendor" && (
          !isSubModuleLicensed("privacyops","priv.vendors") ? <LockedModule moduleKey="priv.vendors" /> : <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Vendors Assessed"  value={vendorStats.total}       sub="Privacy due diligence"  color={NAV} icon="🏢" />
              <KpiCard label="Approved"          value={vendorStats.approved}    sub="Privacy-cleared"        color={EME} icon="✓" />
              <KpiCard label="Remediation"       value={vendorStats.inRemediation}sub="Issues being fixed"    color={AMB} icon="⚙" />
              <KpiCard label="Gap"               value={vendorStats.gap}         sub="High-risk vendors"      color={RED} icon="⚠" alert />
              <KpiCard label="Avg Privacy Score" value={vendorStats.avgScore}    sub="/100"                   color={BLU} icon="📊" />
            </div>
            {/* Tier filter */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>TIER:</span>
              {["All","Critical","High","Medium","Low"].map(t=>(
                <button key={t} onClick={()=>setVendorTierFilter(t)} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer", background:vendorTierFilter===t?"rgba(147,197,253,0.15)":"transparent", color:vendorTierFilter===t?NAV:"var(--muted-foreground)", borderColor:vendorTierFilter===t?NAV:"var(--border)" }}>{t}</button>
              ))}
            </div>
            <TableShell
              cols={["ID","Vendor","Category","Privacy Score","Tier","Last Assessed","Breach History","Sub-Processors","DPA","Sends to AI","Status"]}
              rows={filteredVendors.map(v=>[
                <Mono>{v.id}</Mono>,
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{v.vendor}</span>,
                <Chip label={v.category} color={PRP} />,
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:900, color:v.score>=80?EME:v.score>=60?AMB:RED, fontFamily:"monospace" }}>{v.score}</span>
                  <div style={{ width:50, height:5, borderRadius:3, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
                    <div style={{ width:`${v.score}%`, height:"100%", background:v.score>=80?EME:v.score>=60?AMB:RED }} />
                  </div>
                </div>,
                <SevBadge label={v.tier} />,
                <Mono style={{ fontSize:9 }}>{v.lastAssessed}</Mono>,
                v.breachHistory>0?<span style={{ color:RED, fontWeight:800, fontSize:10 }}>⚠ {v.breachHistory}</span>:<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✓ Clean</span>,
                <span style={{ fontFamily:"monospace", fontSize:10 }}>{v.subProcessors}</span>,
                v.dpaInPlace?<span style={{ color:EME, fontWeight:700 }}>✓</span>:<span style={{ color:RED, fontWeight:700 }}>✗</span>,
                v.dataSentToAI?<span style={{ color:AMB, fontWeight:700, fontSize:10 }}>⚠ Yes</span>:<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✗ No</span>,
                <StatusBadge s={v.status} />,
              ])}
            />
          </>
        )}

        {/* ── Privacy Maturity Model ─────────────────────────────────────────── */}
        {tab === "maturity" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              {maturityDimensions.map(d=>(
                <KpiCard key={d.id} label={d.label} value={`${d.current}/5`} sub={`Target: ${d.target} · Industry: ${d.industry}`} color={d.current>=4?EME:d.current>=3?AMB:RED} icon="📊" />
              ))}
            </div>
            {/* Maturity radar (SVG) */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={card({ padding:"16px 20px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:14 }}>NIST Privacy Framework Maturity Radar</div>
                <svg viewBox="0 0 300 300" style={{ width:"100%", maxWidth:300, margin:"0 auto", display:"block" }}>
                  {/* Background circles */}
                  {[1,2,3,4,5].map(level=>(
                    <polygon key={level} points={maturityDimensions.map((_,i)=>{
                      const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                      const r = (level/5)*110;
                      return `${150+r*Math.cos(angle)},${150+r*Math.sin(angle)}`;
                    }).join(" ")} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                  ))}
                  {/* Industry average */}
                  <polygon points={maturityDimensions.map((d,i)=>{
                    const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                    const r = (d.industry/5)*110;
                    return `${150+r*Math.cos(angle)},${150+r*Math.sin(angle)}`;
                  }).join(" ")} fill="rgba(96,165,250,0.08)" stroke={BLU} strokeWidth={1} strokeDasharray="4 3" />
                  {/* Current */}
                  <polygon points={maturityDimensions.map((d,i)=>{
                    const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                    const r = (d.current/5)*110;
                    return `${150+r*Math.cos(angle)},${150+r*Math.sin(angle)}`;
                  }).join(" ")} fill="rgba(52,211,153,0.12)" stroke={EME} strokeWidth={2} />
                  {/* Target */}
                  <polygon points={maturityDimensions.map((d,i)=>{
                    const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                    const r = (d.target/5)*110;
                    return `${150+r*Math.cos(angle)},${150+r*Math.sin(angle)}`;
                  }).join(" ")} fill="none" stroke={AMB} strokeWidth={1} strokeDasharray="6 3" />
                  {/* Labels */}
                  {maturityDimensions.map((d,i)=>{
                    const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                    const r = 130;
                    return <text key={d.id} x={150+r*Math.cos(angle)} y={150+r*Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={700} fill={NAV}>{d.label}</text>;
                  })}
                  {/* Dots */}
                  {maturityDimensions.map((d,i)=>{
                    const angle = (i/maturityDimensions.length)*2*Math.PI - Math.PI/2;
                    const r = (d.current/5)*110;
                    return <circle key={d.id} cx={150+r*Math.cos(angle)} cy={150+r*Math.sin(angle)} r={5} fill={EME} stroke="var(--card)" strokeWidth={2} />;
                  })}
                </svg>
                <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:8 }}>
                  {[[EME,"Current"],[AMB,"Target"],[BLU,"Industry Avg"]].map(([c,l])=>(
                    <div key={String(l)} style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <div style={{ width:12, height:2, background:String(c), borderRadius:1 }} />
                      <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* ISO 31700 readiness */}
              <div style={card({ padding:"16px 20px" })}>
                <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>ISO 31700 — Privacy by Design Readiness</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {iso31700.map(c=>(
                    <div key={c.ctrl} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px", borderRadius:7, border:`1px solid ${c.status==="compliant"?EME+"33":c.status==="partial"?AMB+"33":RED+"33"}`, background:c.status==="compliant"?`${EME}08`:c.status==="partial"?`${AMB}06`:`${RED}06` }}>
                      <span style={{ fontSize:10, color:"var(--foreground)" }}>{c.ctrl}</span>
                      <StatusBadge s={c.status} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Improvement recommendations */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>🤖 AI-Recommended Next Steps by Dimension</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                {maturityDimensions.map(d=>(
                  <div key={d.id} style={{ padding:"10px 12px", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:10, fontWeight:800, color:NAV, marginBottom:4 }}>{d.label}</div>
                    <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:900, color:d.current>=4?EME:d.current>=3?AMB:RED, fontFamily:"monospace" }}>{d.current}</span>
                      <span style={{ fontSize:9, color:"var(--muted-foreground)", alignSelf:"flex-end" }}>→ {d.target}</span>
                    </div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", lineHeight:1.4 }}>{d.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Employee Privacy ──────────────────────────────────────────────── */}
        {tab === "employee" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <KpiCard label="Workforce Activities" value={empStats.total}       sub="Processing activities"   color={NAV} icon="👤" />
              <KpiCard label="Compliant"            value={empStats.compliant}   sub="All controls in place"  color={EME} icon="✓" />
              <KpiCard label="Partial"              value={empStats.partial}     sub="Controls gaps"          color={AMB} icon="◎" />
              <KpiCard label="Gap"                  value={empStats.gap}         sub="Action required"        color={RED} icon="⚠" alert />
              <KpiCard label="Works Council Needed" value={empStats.worksCouncilNeeded} sub="Consent/consultation req'd" color={AMB} icon="🏛" />
            </div>
            <TableShell
              cols={["ID","Activity","Data Types","System","Retention","Legal Basis","Works Council","Monitoring","Status"]}
              rows={_empActivities.map(e=>[
                <Mono>{e.id}</Mono>,
                <span style={{ fontWeight:700, color:NAV, fontSize:11 }}>{e.activity}</span>,
                <div style={{ display:"flex", gap:2, flexWrap:"wrap", maxWidth:160 }}>{(e.dataTypes as string[]).slice(0,3).map(t=><Chip key={t} label={t} color={PRP} />)}</div>,
                <Chip label={e.system} color={CYN} />,
                <span style={{ fontSize:9, fontFamily:"monospace" }}>{e.retention}</span>,
                <Chip label={e.legalBasis} color={BLU} />,
                e.worksCouncil?<span style={{ color:AMB, fontWeight:700, fontSize:10 }}>✓ Required</span>:<span style={{ color:"var(--muted-foreground)", fontSize:10 }}>N/A</span>,
                e.monitoring?<span style={{ color:AMB, fontWeight:700, fontSize:10 }}>⚠ Active</span>:<span style={{ color:EME, fontWeight:700, fontSize:10 }}>✗ No</span>,
                <StatusBadge s={e.status} />,
              ])}
            />
            {/* Monitoring policy checklist */}
            <div style={card({ padding:"14px 16px" })}>
              <div style={{ fontSize:11, fontWeight:800, color:NAV, marginBottom:10 }}>Employee Monitoring Policy Checklist</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                {[
                  ["Monitoring policy published to all employees",true],
                  ["Works council / union formally notified",false],
                  ["DPIA completed for all monitoring activities",false],
                  ["Purpose limitation documented per monitoring activity",true],
                  ["Data minimisation controls in place",true],
                  ["Retention periods defined and enforced",true],
                  ["Employee rights notices issued",false],
                  ["Monitoring data access restricted to authorised roles",true],
                  ["Annual review schedule established",false],
                  ["AI/automated monitoring explicitly disclosed",false],
                ].map(([l,done])=>(
                  <div key={String(l)} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:7, border:`1px solid ${done?EME+"33":RED+"33"}`, background:done?`${EME}06`:`${RED}06` }}>
                    <span style={{ fontSize:14, color:done?EME:RED }}>{done?"✓":"✗"}</span>
                    <span style={{ fontSize:10, color:"var(--foreground)" }}>{l}</span>
                    {!done && <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, color:RED, whiteSpace:"nowrap" }}>Action Required</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

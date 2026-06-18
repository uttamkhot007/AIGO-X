// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { SubNav, ModuleHeader, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { Drawer, Field, DrawerSection, AiInsightBox } from "@/components/Drawer";
import { useOrg } from "@/context/OrgContext";

const BLU = "rgb(147,197,253)";
const EME = "#34D399";
const AMB = "#FBBF24";
const RED = "#F87171";
const PRP = "#C084FC";
const TEA = "#2DD4BF";
const ORG = "#FB923C";
const CARD = "var(--card)";

function apiUrl(p: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base.replace("/grc-platform", "")}/api${p}`;
}
function tok() { return localStorage.getItem("grc_token") ?? ""; }
function H() { return { Authorization: `Bearer ${tok()}` }; }
function riskColor(s: number) { if (s >= 80) return RED; if (s >= 60) return AMB; if (s >= 40) return ORG; return EME; }
function riskLabel(s: number) { if (s >= 80) return "Critical"; if (s >= 60) return "High"; if (s >= 40) return "Medium"; return "Low"; }
function sevColor(s: string) { const m: Record<string,string> = { Critical:RED, High:ORG, Medium:AMB, Low:EME }; return m[s] ?? BLU; }
function threatLabel(t: string) { const m: Record<string,string> = { prompt_injection:"Prompt Injection", adversarial_input:"Adversarial Input", model_theft:"Model Theft", data_poisoning:"Data Poisoning", model_inversion:"Model Inversion", jailbreak:"Jailbreak" }; return m[t] ?? t; }
function threatIcon(t: string) { const m: Record<string,string> = { prompt_injection:"💉", adversarial_input:"⚡", model_theft:"🔓", data_poisoning:"☠", model_inversion:"🔍", jailbreak:"🔐" }; return m[t] ?? "⚠"; }
function typeColor(t: string) { const m: Record<string,string> = { prompt_injection:RED, adversarial_input:AMB, model_theft:ORG, data_poisoning:RED, model_inversion:PRP, jailbreak:AMB, ALL:BLU }; return m[t] ?? BLU; }
function approvalStyle(a: string) {
  if (a === "approved") return { bg:"rgba(52,211,153,0.08)", color:EME, border:"1px solid rgba(52,211,153,0.25)" };
  if (a === "shadow")   return { bg:"rgba(251,191,36,0.08)",  color:AMB, border:"1px solid rgba(251,191,36,0.25)" };
  if (a === "blocked")  return { bg:"rgba(248,113,113,0.08)", color:RED, border:"1px solid rgba(248,113,113,0.25)" };
  return { bg:"rgba(147,197,253,0.08)", color:BLU, border:"1px solid rgba(147,197,253,0.25)" };
}
function statusStyle(s: string) {
  if (s === "open")          return { bg:"rgba(248,113,113,0.08)", color:RED, border:"1px solid rgba(248,113,113,0.25)" };
  if (s === "investigating") return { bg:"rgba(251,191,36,0.08)",  color:AMB, border:"1px solid rgba(251,191,36,0.25)" };
  if (s === "mitigated")     return { bg:"rgba(52,211,153,0.08)",  color:EME, border:"1px solid rgba(52,211,153,0.25)" };
  if (s === "false_positive") return { bg:"rgba(147,197,253,0.08)", color:BLU, border:"1px solid rgba(147,197,253,0.25)" };
  return { bg:"rgba(147,197,253,0.08)", color:BLU, border:"1px solid rgba(147,197,253,0.25)" };
}

function Chip({ label, style }: { label:string; style?:any }) {
  return <span style={{ fontSize:10, fontWeight:700, borderRadius:4, padding:"2px 7px", textTransform:"uppercase", ...style }}>{label}</span>;
}
function StatusChip({ status }: { status:string }) {
  const s = statusStyle(status);
  return <Chip label={status.replace("_"," ")} style={{ background:s.bg, color:s.color, border:s.border }} />;
}
function ApprovalChip({ approved }: { approved:string }) {
  const s = approvalStyle(approved);
  return <Chip label={approved} style={{ background:s.bg, color:s.color, border:s.border }} />;
}
function SevChip({ severity }: { severity:string }) {
  const c = sevColor(severity);
  return <Chip label={severity} style={{ background:`${c}15`, color:c, border:`1px solid ${c}40` }} />;
}

function ClickKpi({ label, value, sub, color, icon, onClick }: any) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:CARD, border:`1px solid ${hov&&onClick?color+"44":"var(--border)"}`, borderRadius:12,
        padding:"16px 18px", boxShadow:"0 2px 12px rgba(0,0,0,0.4)",
        cursor:onClick?"pointer":"default", transition:"all 0.15s", transform:hov&&onClick?"translateY(-1px)":"none" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
        <span style={{ fontSize:16 }}>{icon}</span>
      </div>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:24, fontWeight:800, color }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>{sub}</div>}
      {onClick && <div style={{ fontSize:9, color:hov?color:"transparent", marginTop:6, fontWeight:600, transition:"color 0.15s" }}>Click to explore →</div>}
    </div>
  );
}

function FilterBtn({ label, active, color, count, onClick }: any) {
  return (
    <button onClick={onClick} style={{ background:active?`${color}18`:"transparent", color:active?color:"var(--muted-foreground)", border:`1px solid ${active?color+"40":"var(--border)"}`, borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}>
      {label}{count!=null && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>{count}</span>}
    </button>
  );
}

function Bar({ pct, color, onClick }: { pct:number; color:string; onClick?:()=>void }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ height:6, borderRadius:3, background:"var(--input)", overflow:"hidden", cursor:onClick?"pointer":"default", position:"relative" }}
      onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${color}60,${color})`, borderRadius:3, transition:"width 0.3s, opacity 0.15s", opacity:hov?0.85:1 }}/>
    </div>
  );
}

// ── Compliance framework data ──────────────────────────────────────────────────
const COMPLIANCE_FWS = [
  { id:"euaiact", name:"EU AI Act", color:BLU, pct:62, deadline:"Aug 2026", icon:"🇪🇺", articles:18, total:29,
    status:"In Progress",
    summary:"Regulation establishing harmonised rules for AI systems in the EU. High-risk AI systems require conformity assessments, technical documentation, and human oversight.",
    gaps:["Conformity assessment not completed for Fraud Detection Engine (high-risk)","HR Resume Screener lacks required human oversight documentation","GPT-4o Chatbot missing technical documentation per Annex IV","No designated EU Authorised Representative appointed"],
    categories:[
      { name:"Risk Classification & Categorisation", pct:80, controls:8, gap:2, reqs:["AI system inventory complete","Risk tiers assigned","Prohibited use cases screened"] },
      { name:"High-Risk AI System Requirements",     pct:55, controls:11,gap:5, reqs:["Technical documentation (Annex IV)","Conformity assessment","Registration in EU database","Post-market monitoring plan"] },
      { name:"Transparency & Explainability",         pct:71, controls:7, gap:2, reqs:["User disclosure for AI-generated content","Decision explainability for automated decisions","Chatbot AI disclosure"] },
      { name:"Human Oversight Mechanisms",            pct:65, controls:6, gap:2, reqs:["Override capability on all high-risk systems","Human review for HR screening","Audit trail completeness"] },
      { name:"Data Governance & Quality",             pct:58, controls:8, gap:3, reqs:["Training data bias assessment","Data quality framework","Sensitive category handling","GDPR alignment for AI training"] },
      { name:"Technical Documentation",               pct:73, controls:5, gap:1, reqs:["System architecture docs","Performance metrics baseline","Change management logs"] },
      { name:"Conformity Assessment",                 pct:40, controls:5, gap:3, reqs:["Internal conformity assessment completed","Notified body assessment (if required)","CE marking process"] },
    ]
  },
  { id:"nistrmf", name:"NIST AI RMF", color:EME, pct:74, deadline:"Sep 2026", icon:"🏛", articles:45, total:61,
    status:"On Track",
    summary:"NIST AI Risk Management Framework for designing, developing, deploying and using AI systems that are trustworthy, responsible and minimize AI risks.",
    gaps:["MANAGE function: no formal AI incident response runbooks","MEASURE: bias testing not yet automated","AI governance committee charter not ratified"],
    categories:[
      { name:"GOVERN — Policies & Accountability",   pct:82, controls:12, gap:2, reqs:["AI governance committee","Roles and responsibilities defined","AI ethics policy published"] },
      { name:"MAP — Context & Risk Identification",   pct:78, controls:9,  gap:2, reqs:["AI use case catalogue","Stakeholder impact analysis","Threat modelling completed"] },
      { name:"MEASURE — Risk Analysis & Metrics",     pct:70, controls:8,  gap:2, reqs:["Bias and fairness testing","Performance monitoring KPIs","Third-party audit schedule"] },
      { name:"MANAGE — Risk Treatment & Response",    pct:65, controls:7,  gap:2, reqs:["AI incident response plan","Remediation tracking","Escalation procedures"] },
      { name:"Trustworthy AI Characteristics",        pct:74, controls:6,  gap:1, reqs:["Explainability documentation","Fairness assessment","Safety validation"] },
      { name:"AI Lifecycle Management",               pct:77, controls:9,  gap:2, reqs:["Model versioning controls","Decommission procedures","Retraining governance"] },
    ]
  },
  { id:"iso42001", name:"ISO 42001", color:PRP, pct:58, deadline:"Oct 2026", icon:"📜", articles:27, total:46,
    status:"At Risk",
    summary:"International standard for AI management systems. Provides requirements and guidance for establishing, implementing, maintaining and continually improving an AIMS.",
    gaps:["No certified AIMS in place","Management review of AI objectives overdue","Internal AIMS audit not scheduled","Supplier AI risk assessments incomplete"],
    categories:[
      { name:"Leadership & AI Policy",                pct:75, controls:5,  gap:1, reqs:["Top management commitment","AI policy published","Roles assigned"] },
      { name:"AI System Planning & Objectives",       pct:60, controls:6,  gap:2, reqs:["AI objectives documented","Planning for objectives","Resource allocation"] },
      { name:"AI Risk & Impact Assessment",           pct:55, controls:7,  gap:3, reqs:["AIMS risk assessment","AI impact assessment","Treatment plan"] },
      { name:"Operational Controls",                  pct:48, controls:8,  gap:4, reqs:["AI system development controls","Data management","Supplier management","Deployment controls"] },
      { name:"Performance Evaluation",                pct:52, controls:5,  gap:2, reqs:["Monitoring and measurement","Internal audit","Management review"] },
      { name:"Continual Improvement",                 pct:45, controls:6,  gap:3, reqs:["Nonconformity management","Corrective actions","Improvement planning"] },
    ]
  },
  { id:"owaspllm", name:"OWASP LLM Top 10", color:AMB, pct:81, deadline:"Ongoing", icon:"🔟", articles:8, total:10,
    status:"Good",
    summary:"OWASP top 10 security risks specific to Large Language Model applications — covering prompt injection, insecure output handling, training data poisoning and more.",
    gaps:["LLM01: Prompt injection controls partially deployed — 3 models still unprotected","LLM09: Overreliance — no user confidence calibration messaging"],
    categories:[
      { name:"LLM01: Prompt Injection",               pct:72, controls:4, gap:1, reqs:["Input validation on all LLM endpoints","Indirect injection protection","System prompt hardening"] },
      { name:"LLM02: Insecure Output Handling",        pct:85, controls:3, gap:0, reqs:["Output sanitisation","Content filtering","Response schema validation"] },
      { name:"LLM03: Training Data Poisoning",         pct:78, controls:3, gap:1, reqs:["Training data provenance","Anomaly detection on uploads","Periodic data integrity checks"] },
      { name:"LLM04: Model Denial of Service",         pct:90, controls:2, gap:0, reqs:["Rate limiting","Resource quota enforcement"] },
      { name:"LLM05: Supply Chain Vulnerabilities",    pct:82, controls:3, gap:1, reqs:["Model provenance verification","Dependency scanning","Third-party model vetting"] },
      { name:"LLM06: Sensitive Information Disclosure",pct:88, controls:3, gap:0, reqs:["DLP on model outputs","PII masking","Data minimisation in prompts"] },
      { name:"LLM07: Insecure Plugin Design",          pct:79, controls:2, gap:0, reqs:["Plugin permission scoping","OAuth for plugin auth"] },
      { name:"LLM08: Excessive Agency",                pct:76, controls:2, gap:1, reqs:["Minimal privilege for agents","Human approval for high-impact actions"] },
      { name:"LLM09: Overreliance",                    pct:71, controls:2, gap:1, reqs:["AI confidence scores surfaced to users","Human-in-the-loop for critical decisions"] },
      { name:"LLM10: Model Theft",                     pct:82, controls:2, gap:0, reqs:["Query rate limiting","API authentication","Watermarking"] },
    ]
  },
];

const SCAN_FINDINGS: Record<string, string[]> = {
  "SCN-001":["Indirect prompt injection via PDF upload — attacker can override system prompt","Missing rate-limit on inference endpoint — susceptible to model extraction","Output contains raw PII from conversation history without redaction"],
  "SCN-002":["High-severity adversarial input: PR description can hijack review outcome"],
  "SCN-003":["Adversarial input bypasses 3 fraud detection rules in combination","Model inversion attack surface — outputs reveal training-set boundary conditions","Missing output randomisation — deterministic responses aid extraction","No query-rate throttle — 50K/day extraction feasible","Training data bias detected in high-value transaction segment"],
  "SCN-005":["Batch resume upload endpoint lacks anomaly detection — poisoning vector","Resume ranking explainability missing — EU AI Act high-risk requirement","Bias metric: gender-coded language in top 20% ranked resumes","Protected characteristic leakage in ranking scores"],
  "SCN-006":["Medium: model outputs sentiment scores without confidence interval — overreliance risk"],
  "SCN-007":["Demand forecast model leaks supplier pricing signals in error messages","Inventory optimisation outputs expose warehouse location metadata"],
  "SCN-008":["Supply-chain risk: model weights loaded from unauthenticated S3 bucket"],
  "SCN-010":["High: confidentiality clause suppression via hidden text injection","Medium: contract risk score not explained — explainability gap"],
};

export default function AISecOps() {
  const { viewTenantId } = useOrg();
  const [tab, setTab] = useState("dashboard");
  const [models,  setModels]  = useState<any[]>([]);
  const [threats, setThreats] = useState<any[]>([]);
  const [apps,    setApps]    = useState<any[]>([]);
  const [scans,   setScans]   = useState<any[]>([]);
  const [posture, setPosture] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // Drawers
  const [selModel,    setSelModel]    = useState<any>(null);
  const [selThreat,   setSelThreat]   = useState<any>(null);
  const [selApp,      setSelApp]      = useState<any>(null);
  const [selScan,     setSelScan]     = useState<any>(null);
  const [selCompFw,   setSelCompFw]   = useState<any>(null);
  const [selCompCat,  setSelCompCat]  = useState<any>(null);

  // Filters — model
  const [mTypeF,    setMTypeF]    = useState("ALL");
  const [mApprF,    setMApprF]    = useState("ALL");
  const [mRiskF,    setMRiskF]    = useState("ALL");
  // Filters — threat
  const [tTypeF,    setTTypeF]    = useState("ALL");
  const [tSevF,     setTSevF]     = useState("ALL");
  const [tStatF,    setTStatF]    = useState("ALL");
  // Filters — app
  const [aApprF,    setAApprF]    = useState("ALL");
  const [aRiskF,    setARiskF]    = useState("ALL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mR, tR, aR, sR, pR] = await Promise.all([
        fetch(apiUrl("/aisecops/models"),  { headers: H() }),
        fetch(apiUrl("/aisecops/threats"), { headers: H() }),
        fetch(apiUrl("/aisecops/apps"),    { headers: H() }),
        fetch(apiUrl("/aisecops/scans"),   { headers: H() }),
        fetch(apiUrl("/aisecops/posture"), { headers: H() }),
      ]);
      if (mR.ok) setModels(await mR.json());
      if (tR.ok) setThreats(await tR.json());
      if (aR.ok) setApps(await aR.json());
      if (sR.ok) setScans(await sR.json());
      if (pR.ok) setPosture(await pR.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateThreat = async (threatId: string, status: string) => {
    await fetch(apiUrl(`/aisecops/threats/${threatId}`), { method:"PATCH", headers:{...H(),"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
    setThreats(prev => prev.map(t => t.threatId === threatId ? { ...t, status } : t));
    if (selThreat?.threatId === threatId) setSelThreat((p:any) => ({ ...p, status }));
  };

  const updateApp = async (appId: string, approved: string) => {
    await fetch(apiUrl(`/aisecops/apps/${appId}`), { method:"PATCH", headers:{...H(),"Content-Type":"application/json"}, body:JSON.stringify({ approved }) });
    setApps(prev => prev.map(a => a.appId === appId ? { ...a, approved } : a));
    if (selApp?.appId === appId) setSelApp((p:any) => ({ ...p, approved }));
  };

  const updateModel = async (modelId: string, approved: string) => {
    await fetch(apiUrl(`/aisecops/models/${modelId}`), { method:"PATCH", headers:{...H(),"Content-Type":"application/json"}, body:JSON.stringify({ approved }) });
    setModels(prev => prev.map(m => m.modelId === modelId ? { ...m, approved } : m));
    if (selModel?.modelId === modelId) setSelModel((p:any) => ({ ...p, approved }));
  };

  // Derived
  const openThreats    = threats.filter(t => t.status === "open" || t.status === "investigating");
  const shadowApps     = apps.filter(a => a.approved === "shadow");
  const highRiskModels = models.filter(m => m.riskScore >= 70);
  const critThreats    = threats.filter(t => t.severity === "Critical");

  // Navigate + pre-filter helpers
  const goThreats  = (tType="ALL", tSev="ALL", tStat="ALL") => { setTTypeF(tType); setTSevF(tSev); setTStatF(tStat); setTab("threats"); };
  const goModels   = (mType="ALL", mAppr="ALL", mRisk="ALL") => { setMTypeF(mType); setMApprF(mAppr); setMRiskF(mRisk); setTab("models"); };
  const goAccess   = (aAppr="ALL") => { setAApprF(aAppr); setTab("access"); };

  // Filtered lists
  const filteredModels = models.filter(m =>
    (mTypeF === "ALL" || m.type      === mTypeF) &&
    (mApprF === "ALL" || m.approved  === mApprF) &&
    (mRiskF === "ALL" || (mRiskF === "critical" ? m.riskScore>=80 : mRiskF === "high" ? m.riskScore>=60&&m.riskScore<80 : mRiskF === "medium" ? m.riskScore>=40&&m.riskScore<60 : m.riskScore<40))
  );

  const filteredThreats = threats.filter(t =>
    (tTypeF === "ALL" || t.type     === tTypeF) &&
    (tSevF  === "ALL" || t.severity === tSevF)  &&
    (tStatF === "ALL" || t.status   === tStatF)
  );

  const filteredApps = apps.filter(a =>
    (aApprF === "ALL" || a.approved  === aApprF) &&
    (aRiskF === "ALL" || a.riskLevel === aRiskF)
  );

  const tabs = [
    { key:"dashboard",  label:"Dashboard",                                                          dot:EME },
    { key:"models",     label:"Model Inventory",  count:models.length,                              dot:highRiskModels.length>0?RED:undefined },
    { key:"threats",    label:"Threat Detection", count:openThreats.length,                         dot:RED },
    { key:"access",     label:"AI Access",        count:shadowApps.length,                          dot:AMB },
    { key:"posture",    label:"AI Posture",                                                          dot:BLU },
    { key:"compliance", label:"AI Compliance",                                                       dot:EME },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", background:"rgb(9,12,18)" }}>
      <ModuleHeader
        title="AISecOps — AI Security Operations"
        description="Model Inventory · Threat Detection · AI Access · Posture · EU AI Act · NIST AI RMF"
        action={{ label:"+ Add Model", onClick:()=>setTab("models") }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />
      <AICopilotBar module="aisecops" />
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* ══════════════ DASHBOARD ══════════════ */}
        {tab === "dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Row 1: Score gauge + 6 KPI cards */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16 }}>
              {/* Gauge */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"20px 16px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:12 }}>AI Security Score</div>
                <svg width="160" height="96" viewBox="0 0 160 96" style={{ overflow:"visible" }}>
                  <defs><linearGradient id="aiSecGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F87171"/><stop offset="50%" stopColor="#FBBF24"/><stop offset="100%" stopColor="#34D399"/>
                  </linearGradient></defs>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="var(--input)" strokeWidth="10" strokeLinecap="round"/>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="url(#aiSecGrad)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${((posture.posture??65)/100)*195} 195`}/>
                  <text x="80" y="80" textAnchor="middle" style={{ fontSize:28, fontWeight:800, fill:riskColor(100-(posture.posture??65)), fontFamily:"'JetBrains Mono', monospace" }}>{posture.posture??65}</text>
                  <text x="80" y="94" textAnchor="middle" style={{ fontSize:9, fill:"var(--muted-foreground)" }}>/ 100</text>
                </svg>
                <div style={{ fontSize:10, color:AMB, fontWeight:700, marginTop:2 }}>Needs Attention</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:14, width:"100%" }}>
                  {[
                    { l:"Models",   v:String(posture.totalModels??models.length??12), c:BLU },
                    { l:"High Risk",v:String(posture.highRiskModels??highRiskModels.length??4), c:RED },
                    { l:"Threats",  v:String(posture.openThreats??openThreats.length??9),  c:AMB },
                    { l:"Shadow AI",v:String(shadowApps.length), c:ORG },
                  ].map(m=>(
                    <div key={m.l} style={{ background:"var(--secondary)", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.v}</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 6 KPI cards */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                <ClickKpi label="Open Threats"      value={String(openThreats.length)}                                   sub={`${critThreats.length} critical`}                                   color={RED} icon="🎯" onClick={()=>goThreats("ALL","ALL","open")} />
                <ClickKpi label="AI Models"         value={String(models.length)}                                        sub={`${highRiskModels.length} high/critical risk`}                      color={BLU} icon="🤖" onClick={()=>goModels()} />
                <ClickKpi label="Shadow AI Apps"    value={String(shadowApps.length)}                                    sub={`${apps.filter(a=>a.approved==="shadow"&&a.dlpEvents>0).length} with DLP events`} color={AMB} icon="👤" onClick={()=>goAccess("shadow")} />
                <ClickKpi label="Prompt Injections" value={String(threats.filter(t=>t.type==="prompt_injection").length)} sub={`${threats.filter(t=>t.type==="prompt_injection"&&t.status==="open").length} open`}   color={RED} icon="💉" onClick={()=>goThreats("prompt_injection")} />
                <ClickKpi label="Jailbreaks"        value={String(threats.filter(t=>t.type==="jailbreak").length)}       sub={`${threats.filter(t=>t.type==="jailbreak"&&t.status==="mitigated").length} mitigated`} color={ORG} icon="🔐" onClick={()=>goThreats("jailbreak")} />
                <ClickKpi label="DLP Events"        value={String(apps.reduce((s,a)=>s+a.dlpEvents,0))}                 sub={`${apps.filter(a=>a.dlpEvents>10).length} apps over threshold`}     color={PRP} icon="🔒" onClick={()=>goAccess()} />
              </div>
            </div>

            {/* Row 2: Threat breakdown | Model risk distribution | Shadow AI */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>

              {/* Threat breakdown — bars are clickable */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:RED, marginBottom:4 }}>Threat Breakdown by Type</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click a type to drill into Threat Detection</div>
                {[
                  { type:"prompt_injection", label:"Prompt Injection", icon:"💉" },
                  { type:"jailbreak",        label:"Jailbreak",        icon:"🔐" },
                  { type:"model_theft",      label:"Model Theft",      icon:"🔓" },
                  { type:"adversarial_input",label:"Adversarial Input",icon:"⚡" },
                  { type:"data_poisoning",   label:"Data Poisoning",   icon:"☠" },
                  { type:"model_inversion",  label:"Model Inversion",  icon:"🔍" },
                ].map(tt => {
                  const count = threats.filter(t=>t.type===tt.type).length;
                  const maxC  = Math.max(...["prompt_injection","jailbreak","model_theft","adversarial_input","data_poisoning","model_inversion"].map(ty=>threats.filter(t=>t.type===ty).length),1);
                  const pct   = count>0 ? Math.round((count/maxC)*100) : 0;
                  const c     = typeColor(tt.type);
                  return (
                    <div key={tt.type} style={{ marginBottom:10, cursor:"pointer", borderRadius:6, padding:"4px 6px", transition:"background 0.15s" }}
                      onClick={()=>goThreats(tt.type)}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:12 }}>{tt.icon}</span>
                          <span style={{ fontWeight:600, color:"var(--foreground)" }}>{tt.label}</span>
                        </span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:c }}>{count}</span>
                      </div>
                      <Bar pct={pct} color={c} onClick={()=>goThreats(tt.type)} />
                    </div>
                  );
                })}
              </div>

              {/* Model risk distribution — top risk models are clickable */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:AMB, marginBottom:4 }}>Model Risk Distribution</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click a band to filter Model Inventory</div>
                {[
                  { label:"Critical (80–100)", color:RED, key:"critical", filter:(m:any)=>m.riskScore>=80 },
                  { label:"High (60–79)",      color:AMB, key:"high",     filter:(m:any)=>m.riskScore>=60&&m.riskScore<80 },
                  { label:"Medium (40–59)",    color:ORG, key:"medium",   filter:(m:any)=>m.riskScore>=40&&m.riskScore<60 },
                  { label:"Low (0–39)",        color:EME, key:"low",      filter:(m:any)=>m.riskScore<40 },
                ].map(band => {
                  const cnt = models.filter(band.filter).length;
                  const pct = models.length>0 ? Math.round((cnt/models.length)*100) : 0;
                  return (
                    <div key={band.label} style={{ marginBottom:12, cursor:"pointer" }} onClick={()=>goModels("ALL","ALL",band.key)}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:4 }}>
                        <span style={{ fontWeight:600, color:"var(--foreground)" }}>{band.label}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:band.color }}>{cnt} <span style={{ color:"var(--muted-foreground)", fontWeight:400 }}>({pct}%)</span></span>
                      </div>
                      <Bar pct={pct} color={band.color} onClick={()=>goModels("ALL","ALL",band.key)} />
                    </div>
                  );
                })}
                <div style={{ borderTop:"1px solid var(--border)", marginTop:4, paddingTop:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>Top Risk Models — click to inspect</div>
                  {models.slice(0,4).map(m=>(
                    <div key={m.modelId} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:10, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                      onClick={()=>setSelModel(m)}>
                      <span style={{ color:"var(--foreground)", flex:1 }}>{m.name}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:riskColor(m.riskScore), marginLeft:8 }}>{m.riskScore}</span>
                      <span style={{ fontSize:9, color:"var(--muted-foreground)", marginLeft:6 }}>↗</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shadow AI / Access summary */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:ORG, marginBottom:4 }}>AI Access & Shadow AI</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click a status band to filter AI Access</div>
                {[
                  { label:"Approved",  key:"approved", count:apps.filter(a=>a.approved==="approved").length, color:EME },
                  { label:"Shadow AI", key:"shadow",   count:apps.filter(a=>a.approved==="shadow").length,   color:AMB },
                  { label:"Blocked",   key:"blocked",  count:apps.filter(a=>a.approved==="blocked").length,  color:RED },
                ].map(s => {
                  const total = apps.length || 1;
                  const pct   = Math.round((s.count/total)*100);
                  return (
                    <div key={s.label} style={{ marginBottom:14, cursor:"pointer" }} onClick={()=>goAccess(s.key)}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:4 }}>
                        <span style={{ fontWeight:600, color:"var(--foreground)" }}>{s.label}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s.color }}>{s.count}</span>
                      </div>
                      <Bar pct={pct} color={s.color} onClick={()=>goAccess(s.key)} />
                    </div>
                  );
                })}
                <div style={{ borderTop:"1px solid var(--border)", marginTop:4, paddingTop:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:RED, marginBottom:8 }}>⚠ High-Risk Shadow Apps</div>
                  {apps.filter(a=>a.approved==="shadow"&&(a.riskLevel==="High"||a.riskLevel==="Critical")).slice(0,4).map(a=>(
                    <div key={a.appId} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:10, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                      onClick={()=>setSelApp(a)}>
                      <span style={{ color:"var(--foreground)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</span>
                      <span style={{ fontWeight:700, color:sevColor(a.riskLevel), marginLeft:8, flexShrink:0 }}>{a.riskLevel}</span>
                      <span style={{ fontSize:9, color:"var(--muted-foreground)", marginLeft:6 }}>↗</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Active Threats list + Compliance posture */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

              {/* Active threats — each row clickable */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:RED }}>Active AI Threats</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <span style={{ background:"rgba(248,113,113,0.08)", color:RED, border:"1px solid rgba(248,113,113,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{openThreats.length} active</span>
                    <span style={{ background:"rgba(248,113,113,0.08)", color:RED, border:"1px solid rgba(248,113,113,0.2)", borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{critThreats.length} critical</span>
                  </div>
                </div>
                {openThreats.slice(0,6).map(t=>(
                  <div key={t.threatId} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 8px", marginBottom:2, borderRadius:6, cursor:"pointer", border:"1px solid transparent", transition:"all 0.15s" }}
                    onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(248,113,113,0.05)"}
                    onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}
                    onClick={()=>setSelThreat(t)}>
                    <span style={{ fontSize:14, flexShrink:0 }}>{threatIcon(t.type)}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"var(--foreground)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.modelName}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{threatLabel(t.type)} · {t.detectedAt?.slice(0,10)}</div>
                    </div>
                    <SevChip severity={t.severity} />
                    <StatusChip status={t.status} />
                  </div>
                ))}
                <button onClick={()=>goThreats()} style={{ marginTop:10, width:"100%", background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:6, padding:"6px 12px", fontSize:11, fontWeight:700, color:RED, cursor:"pointer", fontFamily:"inherit" }}>
                  View All {threats.length} Threats →
                </button>
              </div>

              {/* Compliance — each framework row clickable */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:12, fontWeight:800, color:EME, marginBottom:4 }}>AI Regulatory Compliance</div>
                <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click any framework for control-level detail</div>
                {COMPLIANCE_FWS.map(fw=>(
                  <div key={fw.id} style={{ marginBottom:13, cursor:"pointer", borderRadius:6, padding:"4px 6px", transition:"background 0.15s" }}
                    onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(255,255,255,0.03)"}
                    onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}
                    onClick={()=>{ setSelCompFw(fw); setTab("compliance"); }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:10, marginBottom:4 }}>
                      <span style={{ fontWeight:700, color:"var(--foreground)", display:"flex", alignItems:"center", gap:5 }}>
                        <span>{fw.icon}</span>{fw.name}
                      </span>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ color:fw.pct>=70?EME:fw.pct>=50?AMB:RED, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{fw.pct}%</span>
                        <span style={{ color:"var(--muted-foreground)", fontSize:9 }}>({fw.articles}/{fw.total})</span>
                        <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>↗</span>
                      </div>
                    </div>
                    <Bar pct={fw.pct} color={fw.color} />
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"var(--muted-foreground)", marginTop:2 }}>
                      <span style={{ color:fw.status==="At Risk"?RED:fw.status==="Good"?EME:AMB }}>{fw.status}</span>
                      <span>{fw.deadline}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ MODEL INVENTORY ══════════════ */}
        {tab === "models" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <ClickKpi label="Total Models"  value={String(models.length)}                                              sub="AI/ML models tracked"          color={BLU} icon="🤖" onClick={()=>{ setMTypeF("ALL"); setMApprF("ALL"); setMRiskF("ALL"); }} />
              <ClickKpi label="High Risk"     value={String(models.filter(m=>m.riskScore>=70).length)}                  sub="Risk score ≥ 70"               color={RED} icon="⚠"  onClick={()=>setMRiskF(mRiskF==="high"?"ALL":"high")} />
              <ClickKpi label="Unscanned"     value={String(models.filter(m=>!m.lastScanned).length)}                   sub="Never scanned"                 color={AMB} icon="🔍" onClick={()=>{}} />
              <ClickKpi label="Unapproved"    value={String(models.filter(m=>m.approved==="pending").length)}           sub="Pending approval"              color={ORG} icon="⏳" onClick={()=>setMApprF(mApprF==="pending"?"ALL":"pending")} />
              <ClickKpi label="Total Vulns"   value={String(models.reduce((s,m)=>s+m.vulnerabilities,0))}               sub="Across all models"             color={PRP} icon="🐛" onClick={()=>setMRiskF(mRiskF==="critical"?"ALL":"critical")} />
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>TYPE:</span>
              {["ALL","LLM","ML","GenAI","Classifier","Embedding"].map(t=>(
                <FilterBtn key={t} label={t} active={mTypeF===t} color={BLU} count={t==="ALL"?null:models.filter(m=>m.type===t).length} onClick={()=>setMTypeF(t)} />
              ))}
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)", marginLeft:8 }}>APPROVAL:</span>
              {["ALL","approved","pending","shadow","blocked"].map(a=>(
                <FilterBtn key={a} label={a==="ALL"?"All":a} active={mApprF===a} color={approvalStyle(a).color} count={a==="ALL"?null:models.filter(m=>m.approved===a).length} onClick={()=>setMApprF(a)} />
              ))}
              {loading && <span style={{ fontSize:10, color:"var(--muted-foreground)", marginLeft:8 }}>↻ syncing…</span>}
            </div>
            <TableShell
              cols={["Model ID","Name","Type","Provider","Deployment","Risk Score","Data Class","Approved","Last Scanned","Vulns"]}
              rows={filteredModels.map(m=>[
                <Mono>{m.modelId}</Mono>,
                <span style={{ fontWeight:700, color:"var(--foreground)", fontSize:12 }}>{m.name}</span>,
                <Chip label={m.type} style={{ background:`${BLU}12`, color:BLU, border:`1px solid ${BLU}30` }}/>,
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{m.provider}</span>,
                <Chip label={m.deployment} style={{ background:"rgba(255,255,255,0.04)", color:"var(--muted-foreground)", border:"1px solid var(--border)" }}/>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:riskColor(m.riskScore), fontSize:13 }}>{m.riskScore}</span>,
                <Chip label={m.dataClass} style={{ background:"rgba(147,197,253,0.08)", color:BLU, border:`1px solid ${BLU}30` }}/>,
                <ApprovalChip approved={m.approved}/>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:m.lastScanned?"var(--muted-foreground)":RED }}>{m.lastScanned||"Never"}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:m.vulnerabilities>0?RED:EME }}>{m.vulnerabilities}</span>,
              ])}
              onRowClick={i=>setSelModel(filteredModels[i])}
            />
            {filteredModels.length===0 && <div style={{ textAlign:"center", color:"var(--muted-foreground)", fontSize:11, padding:24 }}>No models match current filters — <button onClick={()=>{setMTypeF("ALL");setMApprF("ALL");setMRiskF("ALL");}} style={{ background:"none",border:"none",color:BLU,cursor:"pointer",fontFamily:"inherit",fontSize:11 }}>clear filters</button></div>}
          </>
        )}

        {/* ══════════════ THREAT DETECTION ══════════════ */}
        {tab === "threats" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <ClickKpi label="Open Threats"      value={String(threats.filter(t=>t.status==="open").length)}          sub="Requiring immediate action"    color={RED} icon="🚨" onClick={()=>setTStatF(tStatF==="open"?"ALL":"open")} />
              <ClickKpi label="Investigating"     value={String(threats.filter(t=>t.status==="investigating").length)} sub="Under active analysis"         color={AMB} icon="🔬" onClick={()=>setTStatF(tStatF==="investigating"?"ALL":"investigating")} />
              <ClickKpi label="Critical Severity" value={String(threats.filter(t=>t.severity==="Critical").length)}   sub="Immediate response needed"     color={RED} icon="⚡" onClick={()=>setTSevF(tSevF==="Critical"?"ALL":"Critical")} />
              <ClickKpi label="High Severity"     value={String(threats.filter(t=>t.severity==="High").length)}       sub="Escalation required"           color={ORG} icon="🔥" onClick={()=>setTSevF(tSevF==="High"?"ALL":"High")} />
              <ClickKpi label="Mitigated"         value={String(threats.filter(t=>t.status==="mitigated").length)}    sub="All time resolved"             color={EME} icon="✅" onClick={()=>setTStatF(tStatF==="mitigated"?"ALL":"mitigated")} />
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>TYPE:</span>
              {[["ALL","All"],["prompt_injection","Prompt Injection"],["jailbreak","Jailbreak"],["model_theft","Model Theft"],["adversarial_input","Adversarial"],["data_poisoning","Data Poisoning"],["model_inversion","Model Inversion"]].map(([v,l])=>(
                <FilterBtn key={v} label={l} active={tTypeF===v} color={typeColor(v)} count={v==="ALL"?null:threats.filter(t=>t.type===v).length} onClick={()=>setTTypeF(v)} />
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>SEV:</span>
              {["ALL","Critical","High","Medium","Low"].map(s=>(
                <FilterBtn key={s} label={s} active={tSevF===s} color={sevColor(s==="ALL"?"Low":s)} count={s==="ALL"?null:threats.filter(t=>t.severity===s).length} onClick={()=>setTSevF(s)} />
              ))}
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)", marginLeft:8 }}>STATUS:</span>
              {["ALL","open","investigating","mitigated","false_positive"].map(s=>(
                <FilterBtn key={s} label={s==="ALL"?"All":s.replace("_"," ")} active={tStatF===s} color={statusStyle(s).color} count={s==="ALL"?null:threats.filter(t=>t.status===s).length} onClick={()=>setTStatF(s)} />
              ))}
              {(tTypeF!=="ALL"||tSevF!=="ALL"||tStatF!=="ALL") && <button onClick={()=>{setTTypeF("ALL");setTSevF("ALL");setTStatF("ALL");}} style={{ marginLeft:8,background:"rgba(147,197,253,0.08)",border:`1px solid ${BLU}30`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,color:BLU,cursor:"pointer",fontFamily:"inherit" }}>Clear</button>}
            </div>
            <TableShell
              cols={["ID","Type","Severity","Model","Description","Confidence","Source","Detected","Status"]}
              rows={filteredThreats.map(t=>[
                <Mono>{t.threatId}</Mono>,
                <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:14 }}>{threatIcon(t.type)}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:typeColor(t.type) }}>{threatLabel(t.type)}</span>
                </span>,
                <SevChip severity={t.severity}/>,
                <span style={{ fontSize:11, color:"var(--foreground)", fontWeight:600 }}>{t.modelName}</span>,
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{t.description?.slice(0,85)}…</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:t.confidence>=90?RED:t.confidence>=75?AMB:EME }}>{t.confidence}%</span>,
                <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>{t.source}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{t.detectedAt?.slice(0,10)||"—"}</span>,
                <StatusChip status={t.status}/>,
              ])}
              onRowClick={i=>setSelThreat(filteredThreats[i])}
            />
            {filteredThreats.length===0 && <div style={{ textAlign:"center",color:"var(--muted-foreground)",fontSize:11,padding:24 }}>No threats match — <button onClick={()=>{setTTypeF("ALL");setTSevF("ALL");setTStatF("ALL");}} style={{ background:"none",border:"none",color:BLU,cursor:"pointer",fontFamily:"inherit",fontSize:11 }}>clear filters</button></div>}
          </>
        )}

        {/* ══════════════ AI ACCESS ══════════════ */}
        {tab === "access" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
              <ClickKpi label="Total AI Apps"    value={String(apps.length)}                                                    sub="Discovered across org"         color={BLU} icon="📱" onClick={()=>setAApprF("ALL")} />
              <ClickKpi label="Approved"         value={String(apps.filter(a=>a.approved==="approved").length)}                 sub="Sanctioned AI tools"           color={EME} icon="✅" onClick={()=>setAApprF(aApprF==="approved"?"ALL":"approved")} />
              <ClickKpi label="Shadow AI"        value={String(apps.filter(a=>a.approved==="shadow").length)}                   sub="Unauthorized AI tools"         color={AMB} icon="👤" onClick={()=>setAApprF(aApprF==="shadow"?"ALL":"shadow")} />
              <ClickKpi label="Blocked"          value={String(apps.filter(a=>a.approved==="blocked").length)}                  sub="Policy violation"              color={RED} icon="🚫" onClick={()=>setAApprF(aApprF==="blocked"?"ALL":"blocked")} />
              <ClickKpi label="Total DLP Events" value={String(apps.reduce((s,a)=>s+a.dlpEvents,0))}                           sub={`${apps.filter(a=>a.dlpEvents>10).length} apps over threshold`} color={PRP} icon="🔒" onClick={()=>setARiskF("ALL")} />
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>STATUS:</span>
              {["ALL","approved","shadow","blocked"].map(s=>(
                <FilterBtn key={s} label={s==="ALL"?"All":s.charAt(0).toUpperCase()+s.slice(1)} active={aApprF===s} color={approvalStyle(s).color} count={s==="ALL"?null:apps.filter(a=>a.approved===s).length} onClick={()=>setAApprF(s)} />
              ))}
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)", marginLeft:8 }}>RISK:</span>
              {["ALL","Critical","High","Medium","Low"].map(r=>(
                <FilterBtn key={r} label={r} active={aRiskF===r} color={sevColor(r==="ALL"?"Low":r)} count={r==="ALL"?null:apps.filter(a=>a.riskLevel===r).length} onClick={()=>setARiskF(r)} />
              ))}
              {(aApprF!=="ALL"||aRiskF!=="ALL") && <button onClick={()=>{setAApprF("ALL");setARiskF("ALL");}} style={{ marginLeft:8,background:"rgba(147,197,253,0.08)",border:`1px solid ${BLU}30`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,color:BLU,cursor:"pointer",fontFamily:"inherit" }}>Clear</button>}
            </div>
            <TableShell
              cols={["App","Category","Vendor","Users","Depts","Monthly Reqs","DLP Events","Risk","Data Class","Status","Actions"]}
              rows={filteredApps.map(a=>[
                <span style={{ fontWeight:700, color:"var(--foreground)", fontSize:12 }}>{a.name}</span>,
                <Chip label={a.category} style={{ background:"rgba(147,197,253,0.08)", color:BLU, border:`1px solid ${BLU}30` }}/>,
                <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{a.vendor}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:BLU }}>{(a.userCount||0).toLocaleString()}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{a.deptCount}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--muted-foreground)" }}>{(a.monthlyReqs||0).toLocaleString()}</span>,
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:800, color:a.dlpEvents>10?RED:a.dlpEvents>0?AMB:EME }}>{a.dlpEvents}</span>,
                <Chip label={a.riskLevel} style={{ background:`${sevColor(a.riskLevel)}15`, color:sevColor(a.riskLevel), border:`1px solid ${sevColor(a.riskLevel)}40` }}/>,
                <Chip label={a.dataClass} style={{ background:"rgba(192,132,252,0.08)", color:PRP, border:`1px solid ${PRP}30` }}/>,
                <ApprovalChip approved={a.approved}/>,
                <div style={{ display:"flex", gap:4 }}>
                  {a.approved!=="approved" && a.approved!=="blocked" && (
                    <button onClick={e=>{e.stopPropagation();updateApp(a.appId,"approved");}} style={{ fontSize:9,padding:"2px 8px",borderRadius:4,border:`1px solid ${EME}40`,background:`${EME}10`,color:EME,cursor:"pointer",fontFamily:"inherit",fontWeight:700 }}>Approve</button>
                  )}
                  {a.approved==="approved" && (
                    <button onClick={e=>{e.stopPropagation();updateApp(a.appId,"shadow");}} style={{ fontSize:9,padding:"2px 8px",borderRadius:4,border:`1px solid ${AMB}40`,background:`${AMB}10`,color:AMB,cursor:"pointer",fontFamily:"inherit",fontWeight:700 }}>Revoke</button>
                  )}
                  {a.approved!=="blocked" && (
                    <button onClick={e=>{e.stopPropagation();updateApp(a.appId,"blocked");}} style={{ fontSize:9,padding:"2px 8px",borderRadius:4,border:`1px solid ${RED}40`,background:`${RED}10`,color:RED,cursor:"pointer",fontFamily:"inherit",fontWeight:700 }}>Block</button>
                  )}
                </div>,
              ])}
              onRowClick={i=>setSelApp(filteredApps[i])}
            />
          </>
        )}

        {/* ══════════════ AI POSTURE ══════════════ */}
        {tab === "posture" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:16, marginBottom:4 }}>
              {/* Score gauge */}
              <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"20px 16px", display:"flex", flexDirection:"column", alignItems:"center", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>AI Posture Score</div>
                <svg width="160" height="96" viewBox="0 0 160 96" style={{ overflow:"visible" }}>
                  <defs><linearGradient id="postGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F87171"/><stop offset="50%" stopColor="#FBBF24"/><stop offset="100%" stopColor="#34D399"/>
                  </linearGradient></defs>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="var(--input)" strokeWidth="10" strokeLinecap="round"/>
                  <path d="M 18 86 A 62 62 0 0 1 142 86" fill="none" stroke="url(#postGrad)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${((posture.posture??65)/100)*195} 195`}/>
                  <text x="80" y="80" textAnchor="middle" style={{ fontSize:28, fontWeight:800, fill:AMB, fontFamily:"'JetBrains Mono',monospace" }}>{posture.posture??65}</text>
                  <text x="80" y="94" textAnchor="middle" style={{ fontSize:9, fill:"var(--muted-foreground)" }}>/ 100</text>
                </svg>
                <div style={{ fontSize:10, color:AMB, fontWeight:700, marginTop:2 }}>Needs Improvement</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:14, width:"100%" }}>
                  {[
                    { l:"Avg Risk Score",   v:String(posture.avgRisk??58),       c:AMB },
                    { l:"Scanned Models",   v:String(posture.scannedModels??11), c:BLU },
                    { l:"Critical Scans",  v:String(posture.criticalScans??1),  c:RED },
                    { l:"Total Scans",     v:String(posture.totalScans??11),    c:EME },
                  ].map(m=>(
                    <div key={m.l} style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
                      <span style={{ color:"var(--muted-foreground)" }}>{m.l}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:m.c }}>{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vulnerability bars — each clickable to open model drawer */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                  <div style={{ fontSize:12, fontWeight:800, color:BLU, marginBottom:4 }}>Vulnerabilities by Model</div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click any model to inspect full detail</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 20px" }}>
                    {models.filter(m=>m.vulnerabilities>0).sort((a,b)=>b.vulnerabilities-a.vulnerabilities).map(m=>(
                      <div key={m.modelId} style={{ marginBottom:10, cursor:"pointer", borderRadius:6, padding:"4px 6px", transition:"background 0.15s" }}
                        onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(255,255,255,0.03)"}
                        onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}
                        onClick={()=>setSelModel(m)}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                          <span style={{ fontWeight:600, color:"var(--foreground)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:riskColor(m.riskScore), marginLeft:8, flexShrink:0 }}>{m.vulnerabilities}v · {m.riskScore}r</span>
                        </div>
                        <Bar pct={(m.vulnerabilities/8)*100} color={riskColor(m.riskScore)} onClick={()=>setSelModel(m)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scan history — each row clickable */}
            <div style={{ background:CARD, border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:BLU, marginBottom:4 }}>AI Model Scan History</div>
              <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:14 }}>Click any scan to view full findings report</div>
              <TableShell
                cols={["Scan ID","Model","Scan Type","Result","Findings","Critical","High","Medium","Duration","Scanned At"]}
                rows={scans.map(s=>[
                  <Mono>{s.scanId}</Mono>,
                  <span style={{ fontWeight:600, color:"var(--foreground)", fontSize:11 }}>{s.modelName}</span>,
                  <Chip label={s.scanType} style={{ background:"rgba(147,197,253,0.08)", color:BLU, border:`1px solid ${BLU}30` }}/>,
                  <Chip label={s.result} style={{ background:s.result==="clean"?`${EME}10`:s.result==="critical"?`${RED}10`:`${AMB}10`, color:s.result==="clean"?EME:s.result==="critical"?RED:AMB, border:`1px solid ${s.result==="clean"?EME:s.result==="critical"?RED:AMB}30` }}/>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s.findings>0?AMB:EME }}>{s.findings}</span>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s.critical>0?RED:"var(--muted-foreground)" }}>{s.critical}</span>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s.high>0?ORG:"var(--muted-foreground)" }}>{s.high}</span>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)" }}>{s.medium}</span>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{s.duration}s</span>,
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{s.scannedAt?.slice(0,10)||"—"}</span>,
                ])}
                onRowClick={i=>setSelScan(scans[i])}
              />
            </div>
          </>
        )}

        {/* ══════════════ AI COMPLIANCE ══════════════ */}
        {tab === "compliance" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {COMPLIANCE_FWS.map(fw=>(
                <ClickKpi key={fw.id} label={fw.name} value={`${fw.pct}%`} sub={`Target: ${fw.deadline} · ${fw.articles}/${fw.total} controls`} color={fw.pct>=70?EME:fw.pct>=50?AMB:RED} icon={fw.icon} onClick={()=>setSelCompFw(selCompFw?.id===fw.id?null:fw)} />
              ))}
            </div>

            {/* Framework detail panel — expands inline when a card is clicked */}
            {selCompFw && (
              <div style={{ background:CARD, border:`1px solid ${selCompFw.color}33`, borderRadius:12, padding:"20px 24px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:selCompFw.color, display:"flex", alignItems:"center", gap:8 }}>
                      <span>{selCompFw.icon}</span>{selCompFw.name}
                      <Chip label={selCompFw.status} style={{ background:`${selCompFw.pct>=70?EME:selCompFw.pct>=50?AMB:RED}15`, color:selCompFw.pct>=70?EME:selCompFw.pct>=50?AMB:RED, border:`1px solid ${selCompFw.pct>=70?EME:selCompFw.pct>=50?AMB:RED}30` }}/>
                    </div>
                    <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:4, maxWidth:700 }}>{selCompFw.summary}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, marginLeft:24 }}>
                    <div style={{ fontSize:32, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:selCompFw.pct>=70?EME:selCompFw.pct>=50?AMB:RED }}>{selCompFw.pct}%</div>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>overall · {selCompFw.articles}/{selCompFw.total} controls</div>
                  </div>
                </div>

                {/* Gaps */}
                {selCompFw.gaps.length > 0 && (
                  <div style={{ padding:"12px 14px", borderRadius:8, background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.2)", marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:RED, marginBottom:8 }}>⚠ Open Gaps ({selCompFw.gaps.length})</div>
                    {selCompFw.gaps.map((g:string,i:number)=>(
                      <div key={i} style={{ fontSize:11, color:"var(--foreground)", marginBottom:4 }}>· {g}</div>
                    ))}
                  </div>
                )}

                {/* Category breakdown — each row clickable */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 20px" }}>
                  {selCompFw.categories.map((cat:any)=>(
                    <div key={cat.name} style={{ borderRadius:8, padding:"10px 12px", border:`1px solid ${selCompCat?.name===cat.name?selCompFw.color+"44":"rgba(255,255,255,0.07)"}`, background:selCompCat?.name===cat.name?`${selCompFw.color}08`:"transparent", cursor:"pointer", transition:"all 0.15s" }}
                      onClick={()=>setSelCompCat(selCompCat?.name===cat.name?null:{...cat, fwColor:selCompFw.color, fwName:selCompFw.name})}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, marginBottom:6 }}>
                        <span style={{ fontWeight:600, color:"var(--foreground)", flex:1, marginRight:8 }}>{cat.name}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:cat.pct>=70?EME:cat.pct>=50?AMB:RED }}>{cat.pct}%</span>
                          {cat.gap>0 && <span style={{ fontSize:9, fontWeight:700, color:RED, background:"rgba(248,113,113,0.1)", borderRadius:3, padding:"1px 5px" }}>{cat.gap} gap{cat.gap>1?"s":""}</span>}
                        </div>
                      </div>
                      <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:4 }}>
                        <div style={{ height:"100%", width:`${cat.pct}%`, background:cat.pct>=70?EME:cat.pct>=50?AMB:RED, borderRadius:3, transition:"width 0.3s" }}/>
                      </div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{cat.controls} controls · click for requirements</div>
                    </div>
                  ))}
                </div>

                {/* Selected category requirements */}
                {selCompCat && (
                  <div style={{ marginTop:16, padding:"14px 16px", borderRadius:8, background:`${selCompCat.fwColor}08`, border:`1px solid ${selCompCat.fwColor}33` }}>
                    <div style={{ fontSize:12, fontWeight:800, color:selCompCat.fwColor, marginBottom:10 }}>{selCompCat.name} — Requirements</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {selCompCat.reqs.map((r:string,i:number)=>(
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11 }}>
                          <span style={{ color:i < (selCompCat.controls - selCompCat.gap) ? EME : RED, marginTop:1, flexShrink:0 }}>{i < (selCompCat.controls - selCompCat.gap) ? "✓" : "✗"}</span>
                          <span style={{ color:"var(--foreground)" }}>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All 4 frameworks side by side */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {COMPLIANCE_FWS.map(fw=>(
                <div key={fw.id} style={{ background:CARD, border:`1px solid ${selCompFw?.id===fw.id?fw.color+"44":"var(--border)"}`, borderRadius:12, padding:"20px", boxShadow:"0 2px 16px rgba(0,0,0,0.45)", cursor:"pointer", transition:"border-color 0.15s" }}
                  onClick={()=>{ setSelCompFw(selCompFw?.id===fw.id?null:fw); setSelCompCat(null); }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:fw.color, display:"flex", alignItems:"center", gap:6 }}><span>{fw.icon}</span>{fw.name}</div>
                      <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:2 }}>Target: {fw.deadline} · {fw.gaps.length} gap{fw.gaps.length!==1?"s":""}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:28, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:fw.pct>=70?EME:fw.pct>=50?AMB:RED }}>{fw.pct}%</div>
                      <div style={{ fontSize:9, color:"var(--muted-foreground)" }}>{fw.articles}/{fw.total} controls</div>
                    </div>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"var(--input)", overflow:"hidden", marginBottom:16 }}>
                    <div style={{ height:"100%", width:`${fw.pct}%`, background:`linear-gradient(90deg,${fw.color}60,${fw.color})`, borderRadius:3 }}/>
                  </div>
                  {fw.categories.map(c=>(
                    <div key={c.name} style={{ marginBottom:7, cursor:"pointer" }}
                      onClick={e=>{ e.stopPropagation(); setSelCompFw(fw); setSelCompCat({...c, fwColor:fw.color, fwName:fw.name}); window.scrollTo({top:0,behavior:"smooth"}); }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:2 }}>
                        <span style={{ color:"var(--muted-foreground)", flex:1, marginRight:6 }}>{c.name}</span>
                        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                          {c.gap>0 && <span style={{ fontSize:9, color:RED }}>▲{c.gap}</span>}
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:c.pct>=70?EME:c.pct>=50?AMB:RED }}>{c.pct}%</span>
                        </div>
                      </div>
                      <div style={{ height:3, borderRadius:2, background:"var(--input)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${c.pct}%`, background:c.pct>=70?EME:c.pct>=50?AMB:RED, borderRadius:2 }}/>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ──────────────────── MODEL DETAIL DRAWER ──────────────────── */}
      {selModel && (
        <Drawer title={selModel.name} subtitle={`${selModel.type} · ${selModel.provider} · ${selModel.version||"—"}`} onClose={()=>setSelModel(null)}>
          <DrawerSection title="Identity & Classification">
            <Field label="Model ID"       value={<Mono>{selModel.modelId}</Mono>} />
            <Field label="Type"           value={<Chip label={selModel.type} style={{ background:`${BLU}12`, color:BLU, border:`1px solid ${BLU}30` }}/>} />
            <Field label="Provider"       value={selModel.provider} />
            <Field label="Version"        value={selModel.version||"—"} />
            <Field label="Owner"          value={selModel.owner} />
            <Field label="Use Case"       value={selModel.useCase} />
            <Field label="Deployment"     value={selModel.deployment} />
            <Field label="Environment"    value={selModel.environment} />
            <Field label="Data Class"     value={<Chip label={selModel.dataClass} style={{ background:"rgba(147,197,253,0.08)", color:BLU, border:`1px solid ${BLU}30` }}/>} />
          </DrawerSection>

          <DrawerSection title="Risk Profile">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
              {[
                { l:"Risk Score",      v:selModel.riskScore, display:String(selModel.riskScore)+"/100", c:riskColor(selModel.riskScore) },
                { l:"Risk Level",      v:null, display:riskLabel(selModel.riskScore), c:riskColor(selModel.riskScore) },
                { l:"Vulnerabilities", v:selModel.vulnerabilities, display:String(selModel.vulnerabilities), c:selModel.vulnerabilities>0?RED:EME },
                { l:"Approval",        v:null, display:selModel.approved, c:approvalStyle(selModel.approved).color },
              ].map(m=>(
                <div key={m.l} style={{ textAlign:"center", padding:"10px 8px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.display}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>{m.l}</div>
                </div>
              ))}
            </div>
            <Field label="Last Scanned" value={<span style={{ fontFamily:"monospace", color:selModel.lastScanned?undefined:RED }}>{selModel.lastScanned||"Never scanned"}</span>} />
          </DrawerSection>

          <DrawerSection title={`Related Threats (${threats.filter(t=>t.modelId===selModel.modelId).length})`}>
            {threats.filter(t=>t.modelId===selModel.modelId).length===0
              ? <div style={{ fontSize:11, color:"var(--muted-foreground)", padding:"8px 0" }}>No threats detected for this model</div>
              : threats.filter(t=>t.modelId===selModel.modelId).map(t=>(
                <div key={t.threatId} style={{ padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer" }}
                  onClick={()=>{ setSelModel(null); setTimeout(()=>setSelThreat(t),150); }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:14 }}>{threatIcon(t.type)}</span>
                    <span style={{ fontWeight:700, fontSize:11, color:typeColor(t.type) }}>{threatLabel(t.type)}</span>
                    <SevChip severity={t.severity}/>
                    <StatusChip status={t.status}/>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", marginLeft:"auto" }}>click to open →</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>{t.description?.slice(0,130)}…</div>
                </div>
              ))
            }
          </DrawerSection>

          <DrawerSection title={`Scan History (${scans.filter(s=>s.modelId===selModel.modelId).length})`}>
            {scans.filter(s=>s.modelId===selModel.modelId).length===0
              ? <div style={{ fontSize:11, color:RED, padding:"8px 0" }}>⚠ No scans on record — model has never been scanned</div>
              : scans.filter(s=>s.modelId===selModel.modelId).map(s=>(
                <div key={s.scanId} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer", fontSize:11 }}
                  onClick={()=>{ setSelModel(null); setTimeout(()=>setSelScan(s),150); }}>
                  <span style={{ color:"var(--muted-foreground)" }}><Mono>{s.scanId}</Mono> · {s.scanType}</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <Chip label={s.result} style={{ background:s.result==="clean"?`${EME}10`:s.result==="critical"?`${RED}10`:`${AMB}10`, color:s.result==="clean"?EME:s.result==="critical"?RED:AMB, border:"none" }}/>
                    <span style={{ fontFamily:"monospace", color:"var(--muted-foreground)" }}>{s.scannedAt?.slice(0,10)}</span>
                  </div>
                </div>
              ))
            }
          </DrawerSection>

          <div style={{ marginBottom:8 }}>
            {selModel.approved !== "approved" && (
              <button onClick={()=>updateModel(selModel.modelId,"approved")} style={{ width:"100%", marginBottom:8, padding:"9px 14px", background:`${EME}10`, border:`1px solid ${EME}40`, borderRadius:8, color:EME, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 }}>
                ✓ Approve Model
              </button>
            )}
            {selModel.approved !== "blocked" && (
              <button onClick={()=>updateModel(selModel.modelId,"blocked")} style={{ width:"100%", padding:"9px 14px", background:`${RED}10`, border:`1px solid ${RED}40`, borderRadius:8, color:RED, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 }}>
                ✗ Block / Suspend Model
              </button>
            )}
          </div>

          <AiInsightBox prompt={`Security analysis for AI model: "${selModel.name}" (${selModel.type}, provider: ${selModel.provider}, version: ${selModel.version||"unknown"}). Risk score: ${selModel.riskScore}/100 (${riskLabel(selModel.riskScore)}). Data classification: ${selModel.dataClass}. ${selModel.vulnerabilities} known vulnerabilities. Deployment: ${selModel.deployment}/${selModel.environment}. Owner: ${selModel.owner}. Use case: ${selModel.useCase}. Current threats: ${threats.filter(t=>t.modelId===selModel.modelId).map(t=>threatLabel(t.type)+" ("+t.severity+")").join(", ")||"none detected"}. Provide specific security hardening recommendations, data governance concerns, and regulatory compliance implications (EU AI Act, NIST AI RMF).`}/>
        </Drawer>
      )}

      {/* ──────────────────── THREAT DETAIL DRAWER ──────────────────── */}
      {selThreat && (
        <Drawer title={`${threatIcon(selThreat.type)} ${threatLabel(selThreat.type)}`} subtitle={`${selThreat.threatId} · ${selThreat.severity} · ${selThreat.modelName}`} onClose={()=>setSelThreat(null)}>
          <DrawerSection title="Threat Classification">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
              <div style={{ textAlign:"center", padding:"10px 8px", background:`${typeColor(selThreat.type)}08`, borderRadius:8, border:`1px solid ${typeColor(selThreat.type)}30` }}>
                <div style={{ fontSize:22, marginBottom:2 }}>{threatIcon(selThreat.type)}</div>
                <div style={{ fontSize:11, fontWeight:700, color:typeColor(selThreat.type) }}>{threatLabel(selThreat.type)}</div>
              </div>
              <div style={{ textAlign:"center", padding:"10px 8px", background:`${sevColor(selThreat.severity)}08`, borderRadius:8, border:`1px solid ${sevColor(selThreat.severity)}30` }}>
                <div style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:sevColor(selThreat.severity), marginBottom:2 }}>{selThreat.confidence}%</div>
                <div style={{ fontSize:11, fontWeight:700, color:sevColor(selThreat.severity) }}>Confidence · {selThreat.severity}</div>
              </div>
            </div>
            <Field label="Threat ID"   value={<Mono>{selThreat.threatId}</Mono>} />
            <Field label="Status"      value={<StatusChip status={selThreat.status}/>} />
            <Field label="Target Model" value={selThreat.modelName} />
            <Field label="Source"      value={selThreat.source} />
            <Field label="Detected"    value={selThreat.detectedAt} />
            {selThreat.mitigatedAt && <Field label="Mitigated" value={selThreat.mitigatedAt} />}
          </DrawerSection>

          <DrawerSection title="Attack Description">
            <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6, padding:"4px 0" }}>{selThreat.description}</div>
          </DrawerSection>

          {selThreat.inputSample && (
            <DrawerSection title="Input Sample / Evidence">
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:ORG, background:"rgba(251,146,60,0.06)", border:"1px solid rgba(251,146,60,0.2)", borderRadius:8, padding:"10px 12px", lineHeight:1.5, wordBreak:"break-all" }}>
                {selThreat.inputSample}
              </div>
            </DrawerSection>
          )}

          <DrawerSection title="Response Actions">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:4 }}>
              {[
                { label:"Mitigate",       status:"mitigated",     color:EME, icon:"✓", disabled:selThreat.status==="mitigated" },
                { label:"Investigate",    status:"investigating", color:AMB, icon:"🔬", disabled:selThreat.status==="investigating" },
                { label:"False Positive", status:"false_positive",color:BLU, icon:"✗", disabled:selThreat.status==="false_positive" },
              ].map(action=>(
                <button key={action.status} disabled={action.disabled} onClick={()=>updateThreat(selThreat.threatId, action.status)}
                  style={{ padding:"8px 6px", background:action.disabled?`${action.color}08`:`${action.color}10`, border:`1px solid ${action.color}${action.disabled?"20":"40"}`, borderRadius:8, color:action.disabled?`${action.color}60`:action.color, cursor:action.disabled?"not-allowed":"pointer", fontFamily:"inherit", fontWeight:700, fontSize:11 }}>
                  {action.icon} {action.label}
                </button>
              ))}
            </div>
          </DrawerSection>

          <AiInsightBox prompt={`AI security threat analysis: A ${selThreat.severity}-severity ${threatLabel(selThreat.type)} attack was detected on "${selThreat.modelName}" (ID: ${selThreat.threatId}). Source: ${selThreat.source}. Confidence: ${selThreat.confidence}%. Current status: ${selThreat.status}. Attack description: ${selThreat.description}. Provide: 1) Root cause analysis, 2) Immediate containment steps, 3) Longer-term hardening recommendations, 4) Similar attack patterns to watch for, 5) MITRE ATLAS technique mapping if applicable.`}/>
        </Drawer>
      )}

      {/* ──────────────────── APP DETAIL DRAWER ──────────────────── */}
      {selApp && (
        <Drawer title={selApp.name} subtitle={`${selApp.category} · ${selApp.vendor}`} onClose={()=>setSelApp(null)}>
          <DrawerSection title="App Overview">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:4 }}>
              {[
                { l:"Users",       v:(selApp.userCount||0).toLocaleString(), c:BLU },
                { l:"Departments", v:String(selApp.deptCount),               c:PRP },
                { l:"DLP Events",  v:String(selApp.dlpEvents),               c:selApp.dlpEvents>10?RED:selApp.dlpEvents>0?AMB:EME },
              ].map(m=>(
                <div key={m.l} style={{ textAlign:"center", padding:"10px 8px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.v}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>{m.l}</div>
                </div>
              ))}
            </div>
            <Field label="App ID"        value={<Mono>{selApp.appId}</Mono>} />
            <Field label="Category"      value={selApp.category} />
            <Field label="Vendor"        value={selApp.vendor} />
            <Field label="Risk Level"    value={<Chip label={selApp.riskLevel} style={{ background:`${sevColor(selApp.riskLevel)}15`, color:sevColor(selApp.riskLevel), border:`1px solid ${sevColor(selApp.riskLevel)}40` }}/>} />
            <Field label="Data Class"    value={selApp.dataClass} />
            <Field label="Status"        value={<ApprovalChip approved={selApp.approved}/>} />
            <Field label="Monthly Reqs"  value={(selApp.monthlyReqs||0).toLocaleString()} />
          </DrawerSection>

          <DrawerSection title="Data Exposure">
            <div style={{ padding:"10px 12px", borderRadius:8, background:selApp.dataClass==="restricted"?"rgba(248,113,113,0.06)":"rgba(251,191,36,0.06)", border:`1px solid ${selApp.dataClass==="restricted"?"rgba(248,113,113,0.2)":"rgba(251,191,36,0.2)"}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:selApp.dataClass==="restricted"?RED:AMB, marginBottom:6 }}>Data Shared with this App</div>
              <div style={{ fontSize:11, color:"var(--foreground)", lineHeight:1.6 }}>{selApp.dataShared}</div>
            </div>
          </DrawerSection>

          <DrawerSection title="Governance Actions">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {selApp.approved!=="approved" && <button onClick={()=>updateApp(selApp.appId,"approved")} style={{ padding:"9px 14px", background:`${EME}10`, border:`1px solid ${EME}40`, borderRadius:8, color:EME, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 }}>✓ Approve</button>}
              {selApp.approved==="approved" && <button onClick={()=>updateApp(selApp.appId,"shadow")} style={{ padding:"9px 14px", background:`${AMB}10`, border:`1px solid ${AMB}40`, borderRadius:8, color:AMB, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 }}>↺ Revoke Approval</button>}
              {selApp.approved!=="blocked" && <button onClick={()=>updateApp(selApp.appId,"blocked")} style={{ padding:"9px 14px", background:`${RED}10`, border:`1px solid ${RED}40`, borderRadius:8, color:RED, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 }}>✗ Block App</button>}
            </div>
          </DrawerSection>

          <AiInsightBox prompt={`AI application governance analysis for: "${selApp.name}" (${selApp.category}, vendor: ${selApp.vendor}). Current status: ${selApp.approved}. Risk level: ${selApp.riskLevel}. Data classification: ${selApp.dataClass}. User count: ${selApp.userCount||0} across ${selApp.deptCount} departments. Monthly API requests: ${(selApp.monthlyReqs||0).toLocaleString()}. DLP events: ${selApp.dlpEvents}. Data shared: ${selApp.dataShared}. Provide: 1) Data exposure risk assessment, 2) GDPR/data sovereignty concerns, 3) Recommended DLP controls, 4) Business justification evaluation, 5) Governance policy recommendation (approve/restrict/block with conditions).`}/>
        </Drawer>
      )}

      {/* ──────────────────── SCAN DETAIL DRAWER ──────────────────── */}
      {selScan && (
        <Drawer title={`Scan Report — ${selScan.scanId}`} subtitle={`${selScan.modelName} · ${selScan.scanType} scan`} onClose={()=>setSelScan(null)}>
          <DrawerSection title="Scan Summary">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:4 }}>
              {[
                { l:"Result",   v:selScan.result,                display:selScan.result.toUpperCase(), c:selScan.result==="clean"?EME:selScan.result==="critical"?RED:AMB },
                { l:"Findings", v:selScan.findings,              display:String(selScan.findings),     c:selScan.findings>0?AMB:EME },
                { l:"Critical", v:selScan.critical,              display:String(selScan.critical),     c:selScan.critical>0?RED:"var(--muted-foreground)" },
                { l:"Duration", v:selScan.duration,              display:selScan.duration+"s",         c:BLU },
              ].map(m=>(
                <div key={m.l} style={{ textAlign:"center", padding:"10px 8px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:m.c }}>{m.display}</div>
                  <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>{m.l}</div>
                </div>
              ))}
            </div>
            <Field label="Scan ID"   value={<Mono>{selScan.scanId}</Mono>} />
            <Field label="Model"     value={selScan.modelName} />
            <Field label="Scan Type" value={<Chip label={selScan.scanType} style={{ background:"rgba(147,197,253,0.08)", color:BLU, border:`1px solid ${BLU}30` }}/>} />
            <Field label="Scanned"   value={selScan.scannedAt?.replace("T"," ").slice(0,19)||"—"} />
            <Field label="High"      value={<span style={{ fontFamily:"monospace", color:selScan.high>0?ORG:"var(--muted-foreground)" }}>{selScan.high}</span>} />
            <Field label="Medium"    value={<span style={{ fontFamily:"monospace", color:"var(--muted-foreground)" }}>{selScan.medium}</span>} />
          </DrawerSection>

          {(SCAN_FINDINGS[selScan.scanId]||[]).length > 0 && (
            <DrawerSection title={`Finding Details (${(SCAN_FINDINGS[selScan.scanId]||[]).length})`}>
              {(SCAN_FINDINGS[selScan.scanId]||[]).map((f:string, i:number)=>{
                const isCritical = f.toLowerCase().startsWith("adversarial")||f.toLowerCase().includes("critical")||f.toLowerCase().includes("extraction");
                const isHigh     = f.toLowerCase().includes("high")||f.toLowerCase().includes("injection")||f.toLowerCase().includes("inversion");
                const c          = isCritical ? RED : isHigh ? ORG : AMB;
                return (
                  <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize:9, fontWeight:700, color:c, background:`${c}15`, borderRadius:3, padding:"2px 5px", alignSelf:"flex-start", flexShrink:0, marginTop:1, fontFamily:"monospace" }}>
                      {isCritical?"CRIT":isHigh?"HIGH":"MED"}
                    </span>
                    <span style={{ fontSize:11, color:"var(--foreground)", flex:1, lineHeight:1.5 }}>{f}</span>
                  </div>
                );
              })}
            </DrawerSection>
          )}

          {selScan.result === "clean" && (
            <div style={{ padding:"12px 14px", borderRadius:8, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.2)", marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:EME, marginBottom:4 }}>✓ Clean Scan Result</div>
              <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>No security findings detected during this scan. Recommend scheduling next full scan within 30 days.</div>
            </div>
          )}

          <AiInsightBox prompt={`AI model security scan analysis for: "${selScan.modelName}". Scan type: ${selScan.scanType}. Result: ${selScan.result}. Total findings: ${selScan.findings} (Critical: ${selScan.critical}, High: ${selScan.high}, Medium: ${selScan.medium}). Scan duration: ${selScan.duration}s. ${SCAN_FINDINGS[selScan.scanId]?.length ? "Specific findings: "+SCAN_FINDINGS[selScan.scanId].join("; ") : "No specific findings available."} Provide: 1) Prioritized remediation plan for findings, 2) Which findings require immediate action vs. scheduled fix, 3) Recommended follow-up scan type and timeline, 4) OWASP LLM Top 10 mapping for any findings.`}/>
        </Drawer>
      )}

    </div>
  );
}

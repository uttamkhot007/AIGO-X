// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { useRisks } from "@/hooks/useGrcApi";
import { useOrg } from "@/context/OrgContext";
import WorkflowPipeline, { RISK_MGMT_WF } from "@/components/WorkflowPipeline";
import { Drawer, Field, DrawerSection, DrawerBadge } from "@/components/Drawer";
import { AICopilotBar } from "@/components/AICopilotBar";
import { OwnerPickerModal, RiskLevelModal, EvidenceUploadModal } from "@/components/QuickEditModals";
import RiskRegisterTemplates, { type RiskTemplate } from "./RiskRegisterTemplates";
import Questionnaires from "@/pages/Questionnaires";

// ── Existing data (unchanged) ──────────────────────────────────────────────────
const tprmVendors: any[] = [];

const appetite: any[] = [];

const treatments: any[] = [];

const trtT = { Mitigate: { bg: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" }, Transfer: { bg: "rgba(34,197,94,0.08)", color: "#065F46", border: "#A7F3D0" }, Accept: { bg: "rgba(245,158,11,0.06)", color: "#92400E", border: "#FDE68A" }, Avoid: { bg: "rgba(239,68,68,0.06)", color: "#991B1B", border: "#FECACA" } } as Record<string, { bg: string; color: string; border: string }>;

// ── Heat map helpers (positions computed inside component) ────────────────────

function cellBg(l: number, i: number): string {
  const score = l * i;
  if (score >= 16) return "#FEE2E2";
  if (score >= 10) return "rgba(245,158,11,0.10)";
  if (score >= 5)  return "rgba(34,197,94,0.08)";
  return "rgba(34,197,94,0.08)";
}
function cellBorder(l: number, i: number): string {
  const score = l * i;
  if (score >= 16) return "#FECACA";
  if (score >= 10) return "#FDE68A";
  if (score >= 5)  return "#A7F3D0";
  return "#BBF7D0";
}
function dotColor(sev: string): string {
  const m: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#1E3A5F", Low: "#059669" };
  return m[sev] ?? "var(--muted-foreground)";
}

export default function RiskOps() {
  const [, navigate] = useLocation();
  const { viewTenantId } = useOrg();
  const [tab, setTab] = useState("overview");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [selectedCellRisks, setSelectedCellRisks] = useState<string[] | null>(null);
  const [selRisk, setSelRisk] = useState<any>(null);
  const [selVendor, setSelVendor] = useState<typeof tprmVendors[0] | null>(null);
  const [selTreatment, setSelTreatment] = useState<typeof treatments[0] | null>(null);

  const { data: apiRisksData } = useRisks();
  const [dbRisks, setDbRisks] = useState<any[]>([]);
  const [dbVendors, setDbVendors] = useState<typeof tprmVendors>([]);
  const [dbAppetite, setDbAppetite] = useState<typeof appetite>([]);
  const [dbTreatments, setDbTreatments] = useState<typeof treatments>([]);

  useEffect(() => {
    if (apiRisksData && apiRisksData.length > 0 && dbRisks.length === 0) {
      setDbRisks(apiRisksData.map((r: any) => ({ ...r, id: r.riskId ?? r.id })));
    }
  }, [apiRisksData]);

  const blankRisk = { name:"", category:"Cybersecurity", severity:"High", description:"", score:"70", owner:"", ownerFull:"" };
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...blankRisk });
  const [creating,   setCreating]   = useState(false);
  const cf = (field: string, value: string) => setCreateForm(f => ({ ...f, [field]: value }));

  const blankEditRisk = { name:"", category:"Cybersecurity", severity:"High" as const, description:"", score:"70", owner:"", ownerFull:"" };
  const [showEditRisk, setShowEditRisk] = useState(false);
  const [editRiskForm, setEditRiskForm] = useState({ ...blankEditRisk });
  const [editRiskTarget, setEditRiskTarget] = useState<{id:string;name:string} | null>(null);
  const [savingRisk, setSavingRisk] = useState(false);
  const [enrichingRisk, setEnrichingRisk] = useState<string|null>(null);
  const [confirmDelRisk, setConfirmDelRisk] = useState<{id:string;name:string} | null>(null);
  const [scoringRisks, setScoringRisks] = useState(false);
  const [scoreResults, setScoreResults] = useState<{updated:number;results:Array<{riskId:string;name:string;prevScore:number;newScore:number;prevSeverity:string;newSeverity:string;rationale:string}>;summary:string;scoredAt:string}|null>(null);
  const [showScoreResults, setShowScoreResults] = useState(false);
  const [playbookRisk, setPlaybookRisk] = useState<{name:string;severity:string;category:string;description?:string} | null>(null);
  const [playbookContent, setPlaybookContent] = useState("");
  const [playbookStreaming, setPlaybookStreaming] = useState(false);
  const [deletingRisk, setDeletingRisk] = useState(false);
  const ef = (field: string, value: string) => setEditRiskForm(f => ({ ...f, [field]: value }));
  const [riskSevFilter, setRiskSevFilter] = useState("All");

  const [showImport,     setShowImport]     = useState(false);
  const [importTab,      setImportTab]      = useState<"github"|"file">("github");
  const [importGhRepo,   setImportGhRepo]   = useState("aigo-x/GRC");
  const [importGhBranch, setImportGhBranch] = useState("main");
  const [importGhToken,  setImportGhToken]  = useState("");
  const [importGhStatus, setImportGhStatus] = useState<"idle"|"loading"|"success"|"error">("idle");
  const [importGhFiles,  setImportGhFiles]  = useState<{name:string;path:string;url:string}[]>([]);
  const [importGhErr,    setImportGhErr]    = useState("");
  const [importFileStatus, setImportFileStatus] = useState<"idle"|"parsed"|"error">("idle");
  const [importFileErr,  setImportFileErr]  = useState("");
  const [importFileCount,setImportFileCount]= useState(0);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [registerSubTab,  setRegisterSubTab]  = useState<"my-register"|"templates"|"appetite"|"treatments">("my-register");
  const [tprmSubTab,      setTprmSubTab]      = useState<"vendors"|"questionnaires">("vendors");
  const [activeTemplate,  setActiveTemplate]  = useState<RiskTemplate | null>(null);
  const actBtn: React.CSSProperties = { background:"var(--secondary)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, width:24, height:24, cursor:"pointer", fontSize:11, display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit", flexShrink:0, lineHeight:1, padding:0, color:"rgba(148,163,184,0.8)" };
  const [ownerPickR, setOwnerPickR] = useState<{type:string;id:string|number;name:string;owner:string}|null>(null);
  const [riskPickR,  setRiskPickR]  = useState<{type:string;id:string|number;name:string;level:string;field:string}|null>(null);
  const [evidPickR,  setEvidPickR]  = useState<{type:string;id:string|number;name:string}|null>(null);
  const afterOwnerSaveR = (type:string, id:string|number, v:string) => {
    if (type==="risk")        setDbRisks(prev=>prev.map(r=>(r.riskId??r.id)===id?{...r,owner:v,ownerFull:v}:r));
    else if (type==="vendor") setDbVendors((prev:any[])=>prev.map(v2=>v2.id===id?{...v2,owner:v}:v2));
  };
  const afterRiskSaveR = (type:string, id:string|number, v:string, field:string) => {
    if (type==="risk")        setDbRisks(prev=>prev.map(r=>(r.riskId??r.id)===id?{...r,[field]:v}:r));
    else if (type==="vendor") setDbVendors((prev:any[])=>prev.map(v2=>v2.id===id?{...v2,[field]:v}:v2));
  };

  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const H: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch("/api/risks/vendors",    { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && d.length > 0 && setDbVendors(d)).catch(() => {});
    fetch("/api/risks/appetite",   { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && d.length > 0 && setDbAppetite(d)).catch(() => {});
    fetch("/api/risks/treatments", { headers: H }).then(r => r.json()).then(d => Array.isArray(d) && d.length > 0 && setDbTreatments(d)).catch(() => {});
  }, []);

  const lRisks      = dbRisks;
  const lVendors    = dbVendors.length   > 0 ? dbVendors    : tprmVendors;
  const lAppetite   = dbAppetite.length  > 0 ? dbAppetite   : appetite;
  const lTreatments = dbTreatments.length> 0 ? dbTreatments : treatments;

  const tabs = [
    { key: "overview",  label: "Overview" },
    { key: "register",  label: "Risks",    count: lRisks.length, dot: "#DC2626" },
    { key: "tprm",      label: "TPRM",     count: lVendors.length },
    { key: "heatmap",   label: "Heat Map", dot: "#DC2626" },
    { key: "workflow",  label: "⚡ Workflow", dot: "#6366F1" },
  ];

  const criticalRisks    = lRisks.filter(r => r.severity === "Critical").length;
  const highRisks        = lRisks.filter(r => r.severity === "High").length;
  const openTreatments   = lTreatments.filter(t => t.status !== "completed").length;
  const appetiteBreaches = lAppetite.filter(a => a.breached).length;
  const trtByType        = ["Mitigate","Transfer","Accept","Avoid"].map(t => ({ type: t, count: lTreatments.filter(tr => tr.type === t).length }));

  // ── Heat map positions: derived from live risk data ────────────────────────
  const riskPositions = useMemo(() => {
    const pos: Record<string, { l: number; i: number }> = {};
    const impactMap: Record<string, number> = { Critical: 5, High: 4, Medium: 3, Low: 2, Informational: 1 };
    lRisks.forEach((r: any) => {
      const i = impactMap[r.severity] ?? 3;
      const score = Number(r.score) || 0;
      const l = score >= 8 ? 5 : score >= 6 ? 4 : score >= 4 ? 3 : score >= 2 ? 2 : 1;
      pos[r.id] = { l, i };
    });
    return pos;
  }, [lRisks]);

  // Risks to show in heat map detail (filtered by selected cell)
  const heatMapRisks = selectedCellRisks
    ? lRisks.filter(r => selectedCellRisks.includes(r.id))
    : lRisks;

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setCreating(true);
    try {
      const res = await fetch("/api/risks", {
        method: "POST", headers: H,
        body: JSON.stringify({
          name: createForm.name, category: createForm.category,
          severity: createForm.severity, description: createForm.description,
          score: Number(createForm.score) || 50,
          owner: createForm.owner,
          ownerFull: createForm.ownerFull || createForm.owner,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setDbRisks(prev => [{ ...d, id: d.riskId ?? d.id }, ...prev]);
        setShowCreate(false);
        setCreateForm({ ...blankRisk });
      }
    } catch (_) {}
    setCreating(false);
  };

  const openEditRisk = (r: any) => {
    const id = r.riskId ?? r.id;
    setEditRiskTarget({ id, name: r.name });
    setEditRiskForm({ name:r.name, category:r.category??"Cybersecurity", severity:r.severity??"High", description:r.description??"", score:String(r.score??70), owner:r.owner??"", ownerFull:r.ownerFull??r.owner??"" });
    setShowEditRisk(true);
  };

  const handleSaveRisk = async () => {
    if (!editRiskTarget || !editRiskForm.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setSavingRisk(true);
    try {
      const body = { name:editRiskForm.name, category:editRiskForm.category, severity:editRiskForm.severity, description:editRiskForm.description, score:Number(editRiskForm.score)||50, owner:editRiskForm.owner, ownerFull:editRiskForm.ownerFull||editRiskForm.owner };
      const res = await fetch(`/api/risks/${editRiskTarget.id}`, { method:"PATCH", headers:H, body:JSON.stringify(body) });
      if (res.ok) {
        setDbRisks(prev => { const base=prev; return base.map((r:any)=>(r.riskId??r.id)===editRiskTarget.id?{...r,...body}:r); });
        setShowEditRisk(false); setEditRiskTarget(null);
      }
    } catch (_) {}
    setSavingRisk(false);
  };

  const handleDeleteRisk = async () => {
    if (!confirmDelRisk) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization:`Bearer ${token}` } : {};
    setDeletingRisk(true);
    try {
      const res = await fetch(`/api/risks/${confirmDelRisk.id}`, { method:"DELETE", headers:H });
      if (res.ok || res.status===204) {
        setDbRisks(prev => { const base=prev; return base.filter((r:any)=>(r.riskId??r.id)!==confirmDelRisk.id); });
        setConfirmDelRisk(null);
      }
    } catch (_) {}
    setDeletingRisk(false);
  };

  const handleGeneratePlaybook = async (risk: {name:string;severity:string;category:string;description?:string}) => {
    setPlaybookRisk(risk);
    setPlaybookContent("");
    setPlaybookStreaming(true);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const res = await fetch("/api/ai/vciso/playbook", {
        method: "POST",
        headers: H,
        body: JSON.stringify({ riskName: risk.name, severity: risk.severity, category: risk.category, description: risk.description }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (d.content) { full += d.content; setPlaybookContent(full); }
            } catch { /* skip */ }
          }
        }
      }
    } catch (_) {
      setPlaybookContent("Error generating playbook. Please try again.");
    } finally {
      setPlaybookStreaming(false);
    }
  };

  const handleEnrichRisk = async (id: string, name: string, category: string) => {
    setEnrichingRisk(id);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const res = await fetch("/api/governance/enrich", { method:"POST", headers:H, body:JSON.stringify({ type:"risk", id, name, category }) });
      if (res.ok) {
        const d = await res.json();
        setDbRisks(prev => { const base=prev; return base.map((r:any)=>(r.riskId??r.id)===id?{...r,description:d.description||r.description,aiInsights:d.insights||r.aiInsights}:r); });
      }
    } catch (_) {}
    setEnrichingRisk(null);
  };

  const handleScoreWithAI = async () => {
    setScoringRisks(true);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    try {
      const res = await fetch("/api/ai/vciso/score-risks", { method:"POST", headers:H });
      if (res.ok) {
        const d = await res.json();
        setScoreResults(d);
        setShowScoreResults(true);
        if (d.results && d.results.length > 0) {
          setDbRisks(prev => prev.map((r:any) => {
            const update = d.results.find((u:any) => u.riskId === (r.riskId ?? r.id));
            if (!update) return r;
            return { ...r, score: update.newScore, severity: update.newSeverity, aiScoreSource: "vciso-ai" };
          }));
        }
      }
    } catch (_) {}
    setScoringRisks(false);
  };

  const normSev = (s:string) => { const m:Record<string,string>={critical:"Critical",high:"High",medium:"Medium",low:"Low",info:"Low"}; return m[s.toLowerCase()]||"Medium"; };

  function splitCsvLine(line:string):string[] {
    const out:string[]=[]; let cur=""; let inQ=false;
    for(const ch of line){ if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){out.push(cur.trim());cur="";}else{cur+=ch;} }
    out.push(cur.trim()); return out;
  }

  function parseRisksFromCsv(text:string):any[] {
    const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l);
    if(lines.length<2) return [];
    const headers=splitCsvLine(lines[0]!).map(h=>h.replace(/^"|"$/g,""));
    return lines.slice(1).map((line,i)=>{
      const vals=splitCsvLine(line).map(v=>v.replace(/^"|"$/g,""));
      const o:Record<string,string>={};
      headers.forEach((h,j)=>{ o[h]=vals[j]??""; });
      const id=o.id||o.riskId||o["Risk ID"]||o["ID"]||`IMP-${String(i+1).padStart(3,"0")}`;
      return { id, riskId:id,
        name: o.name||o["Risk Name"]||o.Name||`Imported Risk ${i+1}`,
        category: o.category||o.Category||"Operational",
        severity: normSev(o.severity||o.Severity||"Medium"),
        score: parseInt(o.score||o.Score||"50")||50,
        owner: o.owner||o.Owner||"Unknown",
        ownerFull: o.ownerFull||o["Owner Full"]||o.owner||o.Owner||"Unknown",
        status: o.status||o.Status||"open",
        trend: o.trend||o.Trend||"stable",
        description: o.description||o.Description||"",
        aiInsights:[], };
    }).filter(r=>r.name);
  }

  function parseRisksFromJson(text:string):any[] {
    try {
      const data=JSON.parse(text);
      const arr=Array.isArray(data)?data:(data.risks||data.data||[]);
      return arr.map((r:any,i:number)=>{
        const id=r.id||r.riskId||r["Risk ID"]||`IMP-${String(i+1).padStart(3,"0")}`;
        return { id, riskId:id,
          name: r.name||r["Risk Name"]||`Imported Risk ${i+1}`,
          category: r.category||"Operational",
          severity: normSev(r.severity||"Medium"),
          score: parseInt(r.score||"50")||50,
          owner: r.owner||"Unknown",
          ownerFull: r.ownerFull||r.owner||"Unknown",
          status: r.status||"open",
          trend: r.trend||"stable",
          description: r.description||"",
          aiInsights:[], };
      });
    } catch { return []; }
  }

  function exportRegisterCsv() {
    const risks = riskSevFilter === "All" ? lRisks : lRisks.filter((r:any) => r.severity === riskSevFilter);
    let headers: string[];
    let rows: string[][];
    if (activeTemplate) {
      headers = activeTemplate.columns.map(c => c.label);
      rows = risks.map((r:any) => activeTemplate!.columns.map(c => {
        const fieldMap: Record<string,string> = {
          riskId:"id", riskScore:"score", riskLevel:"severity", riskDesc:"description",
          name:"name", category:"category", severity:"severity", score:"score",
          owner:"ownerFull", status:"status", trend:"trend", description:"description",
        };
        const val = r[c.key] ?? r[fieldMap[c.key] ?? ""] ?? "";
        return `"${String(val).replace(/"/g,'""')}"`;
      }));
    } else {
      headers = ["Risk ID","Risk Name","Category","Severity","Score","Owner","Status","Trend","Description"];
      rows = risks.map((r:any) => [
        `"${r.id||""}"`,
        `"${(r.name||"").replace(/"/g,'""')}"`,
        `"${r.category||""}"`,
        `"${r.severity||""}"`,
        `"${r.score||""}"`,
        `"${(r.ownerFull||r.owner||"").replace(/"/g,'""')}"`,
        `"${r.status||""}"`,
        `"${r.trend||""}"`,
        `"${(r.description||"").replace(/"/g,'""')}"`,
      ]);
    }
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const suffix = activeTemplate ? `-${activeTemplate.id}` : "";
    a.href = url;
    a.download = `risk-register${suffix}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fetchGhContents = async () => {
    setImportGhStatus("loading"); setImportGhFiles([]); setImportGhErr("");
    try {
      const headers:Record<string,string>={ Accept:"application/vnd.github.v3+json" };
      if(importGhToken) headers.Authorization=`token ${importGhToken}`;
      const res=await fetch(`https://api.github.com/repos/${importGhRepo}/git/trees/${importGhBranch}?recursive=1`,{headers});
      if(!res.ok){
        const msg=res.status===404
          ?`Repository "${importGhRepo}" not found or is private. Add a Personal Access Token below if the repo is private.`
          :res.status===403?"GitHub API rate-limited. Add a Personal Access Token below."
          :`GitHub API error ${res.status}: ${res.statusText}`;
        setImportGhErr(msg); setImportGhStatus("error"); return;
      }
      const data=await res.json();
      const files=(data.tree||[]).filter((t:any)=>t.type==="blob"&&/\.(csv|json)$/i.test(t.path));
      if(files.length===0){ setImportGhErr("No CSV or JSON files found in this repository."); setImportGhStatus("error"); return; }
      setImportGhFiles(files.map((f:any)=>({name:f.path.split("/").pop()||f.path, path:f.path, url:`https://raw.githubusercontent.com/${importGhRepo}/${importGhBranch}/${f.path}`})));
      setImportGhStatus("success");
    } catch { setImportGhErr("Network error reaching GitHub API."); setImportGhStatus("error"); }
  };

  const importFromGhFile = async (url:string, name:string) => {
    try {
      const headers:Record<string,string>={};
      if(importGhToken) headers.Authorization=`token ${importGhToken}`;
      const res=await fetch(url,{headers});
      const text=await res.text();
      const risks=name.endsWith(".json")?parseRisksFromJson(text):parseRisksFromCsv(text);
      if(risks.length===0){ setImportGhErr("No valid risk records found in file."); return; }
      setDbRisks(prev=>{ const base=prev; return [...risks,...base]; });
      setShowImport(false); setImportGhStatus("idle"); setImportGhFiles([]);
    } catch { setImportGhErr("Failed to fetch or parse file from GitHub."); }
  };

  const handleImportFile = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    setImportFileStatus("idle"); setImportFileErr("");
    try {
      const text=await file.text();
      const risks=file.name.endsWith(".json")?parseRisksFromJson(text):parseRisksFromCsv(text);
      if(risks.length===0){ setImportFileStatus("error"); setImportFileErr("No valid risk records found. Ensure columns include: id, name, category, severity, score, owner, status."); return; }
      setDbRisks(prev=>{ const base=prev; return [...risks,...base]; });
      setImportFileCount(risks.length); setImportFileStatus("parsed");
      setTimeout(()=>{ setShowImport(false); setImportFileStatus("idle"); },1800);
    } catch { setImportFileStatus("error"); setImportFileErr("Could not read file. Ensure it is a valid CSV or JSON file."); }
    e.target.value="";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ModuleHeader
        title="RiskOps — Risk Management"
        description="Risks · TPRM · Questionnaires · Risk Appetite · Treatment Plans · Heat Map"
        action={{ label: "+ New Risk", onClick: () => setShowCreate(true) }}
      />
      <SubNav tabs={tabs} active={tab} onSelect={setTab} />
      <AICopilotBar module="riskops" />
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              {([
                { label: "Total Risks",       value: String(lRisks.length),     sub: "Across all domains",             color: "rgb(147,197,253)", onSelect: () => { setTab("register"); setRiskSevFilter("All"); } },
                { label: "Critical",          value: String(criticalRisks),    sub: "Requires immediate action",      color: "#DC2626",           onSelect: () => { setTab("register"); setRiskSevFilter("Critical"); } },
                { label: "High",              value: String(highRisks),        sub: "Elevated priority",              color: "#D97706",           onSelect: () => { setTab("register"); setRiskSevFilter("High"); } },
                { label: "Open Treatments",   value: String(openTreatments),   sub: `${lTreatments.length - openTreatments} completed`, color: "#4338CA", onSelect: () => { setTab("register"); setRegisterSubTab("treatments"); } },
                { label: "Appetite Breaches", value: String(appetiteBreaches), sub: `${lAppetite.length - appetiteBreaches} within threshold`, color: appetiteBreaches > 0 ? "#DC2626" : "#065F46", onSelect: () => { setTab("register"); setRegisterSubTab("appetite"); } },
                { label: "TPRM Reviews",      value: `${lVendors.filter(v => v.status === "in-review" || v.status === "in-progress").length}`, sub: "Vendors under review", color: "#0891B2", onSelect: () => setTab("tprm") },
              ] as { label: string; value: string; sub: string; color: string; onSelect: () => void }[]).map(k => (
                <div key={k.label} onClick={k.onSelect} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color, marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Middle row: Mini Heatmap | Treatment breakdown | Appetite */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Mini 5×5 heatmap */}
              <div onClick={() => setTab("heatmap")} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Risk Heat Map</div>
                <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                  {[5,4,3,2,1].map(l => (
                    <div key={l} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: "var(--muted-foreground)", width: 8, textAlign: "right", flexShrink: 0 }}>{l}</span>
                      {[1,2,3,4,5].map(i => {
                        const risky = Object.entries(riskPositions).filter(([,pos]) => pos.l === l && pos.i === i);
                        return (
                          <div key={i} style={{ flex: 1, height: 32, borderRadius: 5, background: cellBg(l, i), border: `1px solid ${cellBorder(l, i)}`, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap" as const, gap: 2, padding: 2 }}>
                            {risky.map(([id]) => {
                              const r = lRisks.find(r => r.id === id);
                              return r ? <div key={id} title={r.name} style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(r.severity), flexShrink: 0 }} /> : null;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 4, paddingLeft: 12 }}>
                    {[1,2,3,4,5].map(i => <span key={i} style={{ flex: 1, fontSize: 9, color: "var(--muted-foreground)", textAlign: "center" }}>{i}</span>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 10 }}>
                  {(["Critical","High","Medium","Low"] as const).map(s => (
                    <span key={s} style={{ display: "flex", alignItems: "center", gap: 3, color: "#6B7280" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(s), display: "inline-block" }} />{s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Treatment breakdown */}
              <div onClick={() => { setTab("register"); setRegisterSubTab("treatments"); }} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Treatment Distribution</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {trtByType.map(t => {
                    const st = trtT[t.type] ?? trtT["Mitigate"]!;
                    const pct = lTreatments.length > 0 ? Math.round((t.count / lTreatments.length) * 100) : 0;
                    return (
                      <div key={t.type}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: st.color }}>{t.type}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--muted-foreground)" }}>{t.count} · {pct}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--input)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 4, background: st.color, width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>Treatment Status</div>
                {([
                  { label: "In Progress", count: lTreatments.filter(t => t.status === "in-progress").length, color: "#D97706", bg: "rgba(245,158,11,0.06)" },
                  { label: "Open",        count: lTreatments.filter(t => t.status === "open").length,        color: "#DC2626", bg: "rgba(239,68,68,0.06)" },
                  { label: "Completed",   count: lTreatments.filter(t => t.status === "completed").length,   color: "#065F46", bg: "rgba(34,197,94,0.08)" },
                ] as { label: string; count: number; color: string; bg: string }[]).map(s => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: s.bg, borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 14, color: s.color }}>{s.count}</span>
                  </div>
                ))}
              </div>

              {/* Appetite breaches */}
              <div onClick={() => { setTab("register"); setRegisterSubTab("appetite"); }} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(147,197,253,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>Risk Appetite Status</div>
                  {appetiteBreaches > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(239,68,68,0.06)", color: "#DC2626", border: "1px solid rgba(252,165,165,0.25)", borderRadius: 4, padding: "2px 7px" }}>⚠ {appetiteBreaches} breach{appetiteBreaches !== 1 ? "es" : ""}</span>}
                </div>
                {lAppetite.map(a => (
                  <div key={a.domain} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--foreground)" }}>{a.domain}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: a.breached ? "#DC2626" : "#065F46" }}>{a.current}</span>
                        <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>/ {a.threshold}</span>
                        {a.breached && <span style={{ fontSize: 9, fontWeight: 700, color: "#DC2626" }}>BREACH</span>}
                      </div>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: "var(--input)", overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: a.breached ? "#DC2626" : "#065F46", width: `${Math.min(100, (a.current / 10) * 100)}%` }} />
                      <div style={{ position: "absolute", top: 0, left: `${(a.threshold / 10) * 100}%`, width: 2, height: "100%", background: "#1E3A5F" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top risks */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Top Risks by Score</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {lRisks.slice().sort((a, b) => b.score - a.score).slice(0, 6).map((r, idx) => (
                  <div key={r.id} onClick={() => { setSelRisk(r); setTab("register"); }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(147,197,253,0.05)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F9F8F6", cursor: "pointer" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "var(--muted-foreground)", width: 20, flexShrink: 0 }}>#{idx + 1}</span>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(r.severity), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "rgb(147,197,253)" }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{r.category}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 13, color: r.severity === "Critical" ? "#DC2626" : r.severity === "High" ? "#D97706" : "var(--foreground)" }}>{r.score}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, background: r.status === "open" ? "rgba(239,68,68,0.06)" : r.status === "accepted" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.06)", color: r.status === "open" ? "#991B1B" : r.status === "accepted" ? "#065F46" : "#92400E", borderRadius: 4, padding: "2px 7px", textTransform: "uppercase" as const, flexShrink: 0 }}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Risk Analytics Row ─────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

              {/* Risk Trend — 12 months */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 4 }}>Risk Count Trend — 12 Months</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 12 }}>Total open risks by month</div>
                {(()=>{
                  const data = [22,25,23,28,31,29,27,30,34,31,28,lRisks.length||26];
                  const mon = ["J","A","S","O","N","D","J","F","M","A","M","J"];
                  const maxV = Math.max(...data), minV = Math.min(...data), rng = maxV-minV||1;
                  const W=220, H=70, pad=6;
                  const usableW = W-pad*2;
                  const pts = data.map((v,i)=>`${pad+(i/(data.length-1))*usableW},${H-pad-((v-minV)/rng)*(H-pad*2)}`).join(" ");
                  const areaPath = `M${pad},${H} L${pts.split(" ").join(" L")} L${pad+usableW},${H} Z`;
                  return (
                    <div>
                      <svg width="100%" height={H+20} viewBox={`0 0 ${W} ${H+20}`} preserveAspectRatio="none">
                        <path d={areaPath} fill="rgba(147,197,253,0.07)"/>
                        <polyline points={pts} fill="none" stroke="rgb(147,197,253)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        {data.map((v,i)=>{
                          const cx=pad+(i/(data.length-1))*usableW;
                          const cy=H-pad-((v-minV)/rng)*(H-pad*2);
                          const isLast=i===data.length-1;
                          return <circle key={i} cx={cx} cy={cy} r={isLast?3.5:2} fill={isLast?"rgb(147,197,253)":"rgba(147,197,253,0.6)"} stroke={isLast?"var(--card)":"none"} strokeWidth="1.5"/>;
                        })}
                        {mon.map((m,i)=>{
                          const cx=pad+(i/(mon.length-1))*usableW;
                          return <text key={i} x={cx} y={H+16} textAnchor="middle" style={{ fontSize:8, fill:"var(--muted-foreground)" }}>{m}</text>;
                        })}
                      </svg>
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:10 }}>
                        <span style={{ color:"var(--muted-foreground)" }}>Min: <span style={{ fontWeight:700, color:"#34D399" }}>{minV}</span></span>
                        <span style={{ color:"var(--muted-foreground)" }}>Now: <span style={{ fontWeight:700, color:"rgb(147,197,253)" }}>{data[data.length-1]}</span></span>
                        <span style={{ color:"var(--muted-foreground)" }}>Peak: <span style={{ fontWeight:700, color:"#F87171" }}>{maxV}</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Risk by Domain */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 4 }}>Risk by Domain</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 14 }}>Open risks distributed across domains</div>
                {(()=>{
                  const domains = ["Cyber", "Operational", "Compliance", "Third-Party", "Financial", "Strategic"];
                  const domainColors = ["#F87171","#FCD34D","#60A5FA","#C4B5FD","#34D399","#2DD4BF"];
                  const counts = domains.map(d => lRisks.filter(r => r.category === d || r.domain === d).length);
                  const fallback = [6,5,4,4,3,3];
                  const vals = counts.every(c=>c===0) ? fallback : counts;
                  const total = vals.reduce((s,v)=>s+v,0)||1;
                  return domains.map((d,i)=>{
                    const pct = Math.round((vals[i]/total)*100);
                    return (
                      <div key={d} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
                          <span style={{ fontWeight:600, color:"var(--foreground)" }}>{d}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:domainColors[i] }}>{vals[i]} <span style={{ color:"var(--muted-foreground)", fontWeight:400 }}>({pct}%)</span></span>
                        </div>
                        <div style={{ height:7, borderRadius:4, background:"var(--input)", overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${domainColors[i]}70,${domainColors[i]})`, borderRadius:4 }}/>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* KRI — Key Risk Indicators */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "rgb(147,197,253)", marginBottom: 4 }}>Key Risk Indicators</div>
                <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 14 }}>Current vs threshold · month-over-month delta</div>
                {[
                  { kri:"Critical Risks",        current:criticalRisks,                                           threshold:5,  color:"#DC2626", unit:"" },
                  { kri:"Overdue Treatments",     current:lTreatments.filter(t=>t.status==="open").length,         threshold:10, color:"#D97706", unit:"" },
                  { kri:"Appetite Breaches",      current:appetiteBreaches,                                        threshold:2,  color:"#DC2626", unit:"" },
                  { kri:"TPRM Reviews Pending",   current:lVendors.filter(v=>v.status==="in-review").length,       threshold:8,  color:"#0891B2", unit:"" },
                  { kri:"Risk Score (Avg)",        current:lRisks.length>0?Math.round(lRisks.reduce((s,r)=>s+(r.score||0),0)/lRisks.length):0, threshold:50, color:"#6B7280", unit:"" },
                ].map(k=>{
                  const breached = k.current > k.threshold;
                  const pct = Math.min(100, Math.round((k.current/k.threshold)*100));
                  return (
                    <div key={k.kri} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:4 }}>
                        <span style={{ fontWeight:600, color:"var(--foreground)" }}>{k.kri}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:breached?"#DC2626":"#065F46" }}>{k.current}</span>
                          <span style={{ fontSize:9, color:"var(--muted-foreground)" }}>/ {k.threshold}</span>
                          {breached && <span style={{ fontSize:8, fontWeight:800, color:"#DC2626", background:"rgba(239,68,68,0.08)", borderRadius:3, padding:"1px 4px" }}>BREACH</span>}
                        </div>
                      </div>
                      <div style={{ height:5, borderRadius:3, background:"var(--input)", overflow:"hidden", position:"relative" as const }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:breached?"#DC2626":"#065F46", borderRadius:3 }}/>
                        <div style={{ position:"absolute" as const, top:0, left:"100%", width:1, height:"100%", background:"rgba(30,58,95,0.8)" }}/>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}

        {/* ── RISK REGISTER ────────────────────────────────────────────────── */}
        {tab === "register" && (
          <>
            {/* Sub-navigation */}
            <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:12 }}>
              {([
                { key:"my-register", label:"My Risks",          icon:"📊" },
                { key:"templates",   label:"Templates",          icon:"📋" },
                { key:"appetite",    label:"Risk Appetite",      icon:"🎯" },
                { key:"treatments",  label:"Treatment Plans",    icon:"🛠️" },
              ] as const).map(sub => (
                <button key={sub.key} onClick={() => setRegisterSubTab(sub.key)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 20px", border:"none", borderRadius:"6px 6px 0 0", background:registerSubTab===sub.key?"rgba(147,197,253,0.10)":"transparent", color:registerSubTab===sub.key?"rgb(147,197,253)":"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderBottom:registerSubTab===sub.key?"2px solid rgb(147,197,253)":"2px solid transparent", whiteSpace:"nowrap" as const }}>
                  <span>{sub.icon}</span>{sub.label}
                </button>
              ))}
            </div>

            {/* ── My Risk Register ── */}
            {registerSubTab === "my-register" && (
            <>
            {/* Active template banner */}
            {activeTemplate && (
              <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(147,197,253,0.07)", border:"1px solid rgba(147,197,253,0.22)", borderRadius:8, padding:"8px 14px", marginBottom:6 }}>
                <span style={{ fontSize:9, background:"rgba(147,197,253,0.15)", color:"rgb(147,197,253)", border:"1px solid rgba(147,197,253,0.3)", borderRadius:4, padding:"2px 8px", fontWeight:800, letterSpacing:"0.5px" }}>TEMPLATE ACTIVE</span>
                <span style={{ fontSize:12, color:"var(--foreground)", fontWeight:700 }}>{activeTemplate.name}</span>
                <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>· Export will use {activeTemplate.columns.length} template columns</span>
                <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                  <button onClick={() => setRegisterSubTab("templates")} style={{ fontSize:10, fontWeight:700, color:"rgb(147,197,253)", background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:4, padding:"3px 9px", cursor:"pointer", fontFamily:"inherit" }}>Change Template</button>
                  <button onClick={() => setActiveTemplate(null)} style={{ fontSize:10, fontWeight:700, color:"#F87171", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:4, padding:"3px 9px", cursor:"pointer", fontFamily:"inherit" }}>Clear</button>
                </div>
              </div>
            )}
            {/* Import / Export toolbar */}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginBottom:-4, flexWrap:"wrap" as const }}>
              <input type="file" ref={importFileRef} style={{display:"none"}} accept=".csv,.json"
                onChange={handleImportFile}/>
              <button onClick={exportRegisterCsv}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid rgba(34,197,94,0.35)", background:"rgba(34,197,94,0.08)", color:"#34D399", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                ↓ Export CSV{activeTemplate ? ` (${activeTemplate.standard})` : ""}
              </button>
              <button onClick={()=>{ setShowImport(true); setImportTab("github"); setImportGhStatus("idle"); setImportGhErr(""); setImportGhFiles([]); }}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid rgba(99,102,241,0.35)", background:"rgba(99,102,241,0.08)", color:"#A5B4FC", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                ⬆ Import Register
              </button>
              <button onClick={handleScoreWithAI} disabled={scoringRisks}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid rgba(167,139,250,0.45)", background: scoringRisks ? "rgba(167,139,250,0.04)" : "rgba(167,139,250,0.10)", color: scoringRisks ? "rgba(167,139,250,0.45)" : "#C4B5FD", fontSize:11, fontWeight:700, cursor: scoringRisks ? "not-allowed" : "pointer", fontFamily:"inherit", transition:"all 0.2s" }}>
                {scoringRisks ? <><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Scoring…</> : <>✦ Re-score with AI</>}
              </button>
              {scoreResults && (
                <button onClick={() => setShowScoreResults(true)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid rgba(167,139,250,0.3)", background:"rgba(167,139,250,0.06)", color:"rgba(196,181,253,0.75)", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  ↗ Last Results ({scoreResults.updated})
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Open Risks",   value: lRisks.filter(r => r.status === "open").length, color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
                { label: "Critical",     value: lRisks.filter(r => r.severity === "Critical").length, color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
                { label: "High",         value: lRisks.filter(r => r.severity === "High").length, color: "#D97706", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
                { label: "In Treatment", value: lRisks.filter(r => r.status === "in-progress").length, color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              {(["All","Critical","High","Medium","Low"] as const).map(s => (
                <button key={s} onClick={() => setRiskSevFilter(s)}
                  style={{ padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", background:"none", fontFamily:"inherit",
                    border:`1.5px solid ${riskSevFilter===s?(s==="Critical"?"rgba(239,68,68,0.6)":s==="High"?"rgba(245,158,11,0.6)":s==="Medium"?"rgba(245,158,11,0.4)":s==="Low"?"rgba(34,197,94,0.5)":"rgba(99,179,237,0.55)"):"rgba(148,163,184,0.22)"}`,
                    color:riskSevFilter===s?(s==="Critical"?"#F87171":s==="High"?"#FBBF24":s==="Medium"?"#FCD34D":s==="Low"?"#34D399":"rgb(147,197,253)"):"rgba(148,163,184,0.75)" }}>
                  {s}
                </button>
              ))}
              {riskSevFilter !== "All" && (
                <button onClick={() => setRiskSevFilter("All")}
                  style={{ padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#F87171", fontFamily:"inherit" }}>
                  ✕ Clear
                </button>
              )}
            </div>
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", padding:0 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--card)" }}>
                    {["Risk ID","Risk Name","Category","Severity","Score","Owner","Status","Trend",""].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(riskSevFilter === "All" ? lRisks : lRisks.filter(r => r.severity === riskSevFilter)).map(r => {
                    const rid = r.riskId ?? r.id;
                    return (
                      <tr key={rid} style={{ borderBottom:"1px solid var(--border)", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="var(--secondary)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>navigate(`/riskops/risks/${r.id}`)}>
                        <td style={{ padding:"10px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{r.id}</td>
                        <td style={{ padding:"10px 14px", fontWeight:600, color:"rgb(147,197,253)", fontSize:12 }}>{r.name}</td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"#6B7280" }}>{r.category}</td>
                        <td style={{ padding:"10px 14px" }}><SevBadge label={r.severity}/></td>
                        <td style={{ padding:"10px 14px" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:r.severity==="Critical"?"#991B1B":r.severity==="High"?"#92400E":"var(--foreground)" }}>{r.score}</span>
                          {r.aiScoreSource && <span title="Score set by AI vCISO" style={{ marginLeft:5, fontSize:9, background:"rgba(167,139,250,0.15)", color:"#C4B5FD", border:"1px solid rgba(167,139,250,0.3)", borderRadius:3, padding:"1px 4px", fontWeight:700, letterSpacing:"0.3px" }}>AI</span>}
                        </td>
                        <td style={{ padding:"10px 14px", fontSize:11, color:"var(--muted-foreground)" }}>{r.ownerFull}</td>
                        <td style={{ padding:"10px 14px" }}><Badge label={r.status}/></td>
                        <td style={{ padding:"10px 14px" }}><span style={{ color:r.trend==="down"?"#065F46":r.trend==="up"?"#DC2626":"var(--muted-foreground)", fontWeight:700 }}>{r.trend==="down"?"▼ Decreasing":r.trend==="up"?"▲ Increasing":"— Stable"}</span></td>
                        <td style={{ padding:"8px 14px", whiteSpace:"nowrap" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", gap:3 }}>
                            <button title="Edit" onClick={()=>openEditRisk(r)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                            <button title="AI Enrich" onClick={()=>handleEnrichRisk(rid,r.name,r.category)} disabled={enrichingRisk===rid} style={{...actBtn,color:enrichingRisk===rid?"rgba(99,102,241,0.4)":"#818CF8"}}>{enrichingRisk===rid?"⟳":"✦"}</button>
                            <button title="Generate Playbook" onClick={()=>handleGeneratePlaybook({name:r.name,severity:r.severity??'High',category:r.category??'Security',description:r.description})} style={{...actBtn,color:"#34D399"}}>▶</button>
                            <button title="Delete" onClick={()=>setConfirmDelRisk({id:rid,name:r.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                            <button title="Assign Owner" onClick={()=>setOwnerPickR({type:"risk",id:rid,name:r.name,owner:r.ownerFull??r.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                            <button title="Set Severity" onClick={()=>setRiskPickR({type:"risk",id:rid,name:r.name,level:r.severity??"Medium",field:"severity"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                            <button title="Upload Evidence" onClick={()=>setEvidPickR({type:"risk",id:rid,name:r.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
            )}

            {/* ── Risk Register Templates sub-tab ── */}
            {registerSubTab === "templates" && (
              <RiskRegisterTemplates
                onUseTemplate={t => { setActiveTemplate(t); setRegisterSubTab("my-register"); }}
                activeTemplateId={activeTemplate?.id}
              />
            )}

            {/* ── Risk Appetite sub-tab ── */}
            {registerSubTab === "appetite" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {appetiteBreaches > 0 && (
                  <div style={{ background: "linear-gradient(135deg, #FFFBEB, #FEF2F2)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ background: "#B45309", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0 }}>APPETITE BREACH</div>
                    <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{appetiteBreaches} risk domain{appetiteBreaches !== 1 ? "s" : ""} {appetiteBreaches === 1 ? "is" : "are"} currently exceeding appetite thresholds. Executive review required.</span>
                  </div>
                )}
                {lAppetite.map(a => (
                  <div key={a.domain} style={{ background: "var(--card)", border: `1px solid ${a.breached ? "#FECACA" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "14px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>{a.domain}</span>
                        <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#6B7280" }}>Appetite: {a.appetite}</span>
                        {a.breached && <span style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(252,165,165,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#991B1B" }}>⚠ Breached</span>}
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Threshold: <strong style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{a.threshold}</strong></span>
                        <span style={{ fontSize: 11, color: a.breached ? "#991B1B" : "#065F46", fontWeight: 700 }}>Current: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{a.current}</strong></span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: "var(--input)", borderRadius: 4, position: "relative" }}>
                      <div style={{ position: "absolute", top: -3, left: `${(a.threshold / 10) * 100}%`, width: 2, height: 14, background: "#1E3A5F", borderRadius: 1 }} />
                      <div style={{ height: "100%", width: `${(a.current / 10) * 100}%`, background: a.breached ? "#EF4444" : "#10B981", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Treatment Plans sub-tab ── */}
            {registerSubTab === "treatments" && (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <TableShell
                    onRowClick={i => setSelTreatment(lTreatments[i] === selTreatment ? null : lTreatments[i])}
                    cols={["ID", "Linked Risk", "Treatment Name", "Type", "Owner", "Due Date", "Priority", "Status"]}
                    rows={lTreatments.map(t => [
                      <Mono>{t.id}</Mono>,
                      <Mono>{t.risk}</Mono>,
                      <span style={{ fontWeight: 600, color: "rgb(147,197,253)", fontSize: 12 }}>{t.name}</span>,
                      <span style={{ background: trtT[t.type]?.bg, color: trtT[t.type]?.color, border: `1px solid ${trtT[t.type]?.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{t.type}</span>,
                      t.owner,
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t.dueDate}</span>,
                      <SevBadge label={t.priority} />,
                      <Badge label={t.status} />,
                    ])}
                  />
                </div>
                {selTreatment && (
                  <div style={{ width: 300, flexShrink: 0 }}>
                    <div style={{ background: "var(--card)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(147,197,253,0.06)" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "rgb(147,197,253)" }}>{selTreatment.id}</div>
                          <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>Linked: {selTreatment.risk}</div>
                        </div>
                        <button onClick={() => setSelTreatment(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--muted-foreground)" }}>×</button>
                      </div>
                      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.4 }}>{selTreatment.name}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                          <span style={{ background: trtT[selTreatment.type]?.bg, color: trtT[selTreatment.type]?.color, border: `1px solid ${trtT[selTreatment.type]?.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{selTreatment.type}</span>
                          <SevBadge label={selTreatment.priority} />
                          <Badge label={selTreatment.status} />
                        </div>
                        {[
                          ["Owner",    selTreatment.owner],
                          ["Due Date", selTreatment.dueDate],
                          ["Type",     selTreatment.type],
                          ["Priority", selTreatment.priority],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                            <span style={{ color: "var(--muted-foreground)" }}>{k}</span>
                            <span style={{ fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                        {selTreatment.description && (
                          <div style={{ marginTop: 4, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 5 }}>📋 DESCRIPTION</div>
                            <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{selTreatment.description}</div>
                          </div>
                        )}
                        <button onClick={() => setSelTreatment(null)} style={{ marginTop: 4, padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(147,197,253,0.25)", background: "rgba(147,197,253,0.08)", color: "rgb(147,197,253)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Update Treatment →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── TPRM ──────────────────────────────────────────────────────────── */}
        {tab === "tprm" && (
          <>
            {/* TPRM Sub-navigation */}
            <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:12 }}>
              {([
                { key:"vendors",        label:"Vendors",        icon:"🏢" },
                { key:"questionnaires", label:"Questionnaires", icon:"📋" },
              ] as const).map(sub => (
                <button key={sub.key} onClick={() => setTprmSubTab(sub.key)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 20px", border:"none", borderRadius:"6px 6px 0 0", background:tprmSubTab===sub.key?"rgba(147,197,253,0.10)":"transparent", color:tprmSubTab===sub.key?"rgb(147,197,253)":"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderBottom:tprmSubTab===sub.key?"2px solid rgb(147,197,253)":"2px solid transparent", whiteSpace:"nowrap" as const }}>
                  <span>{sub.icon}</span>{sub.label}
                </button>
              ))}
            </div>

            {/* ── Vendors sub-tab ── */}
            {tprmSubTab === "vendors" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Total Vendors", value: lVendors.length, color: "rgb(147,197,253)", bg: "rgba(59,130,246,0.12)", border: "#BFDBFE" },
                    { label: "Tier 1 (Critical)", value: lVendors.filter(v => v.tier === 1).length, color: "#991B1B", bg: "rgba(239,68,68,0.06)", border: "#FECACA" },
                    { label: "Approved", value: lVendors.filter(v => v.status === "approved").length, color: "#065F46", bg: "rgba(34,197,94,0.08)", border: "#A7F3D0" },
                    { label: "Under Review", value: lVendors.filter(v => v.status !== "approved").length, color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "var(--card)", border: `1px solid ${k.border}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: k.color, opacity: 0.7, borderRadius: "12px 12px 0 0" }} />
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                <TableShell
                  onRowClick={i => navigate(`/riskops/vendors/${lVendors[i].vendorId ?? lVendors[i].id}`)}
                  cols={["ID", "Vendor", "Tier", "Category", "Risk Score", "Status", "Last Assessed", "Next Due", "Critical", ""]}
                  rows={lVendors.map(v => [
                    <Mono>{v.vendorId ?? v.id}</Mono>,
                    <span style={{ fontWeight: 700, color: "rgb(147,197,253)" }}>{v.name}</span>,
                    <span style={{ background: v.tier === 1 ? "rgba(239,68,68,0.06)" : v.tier === 2 ? "rgba(245,158,11,0.06)" : "var(--border)", color: v.tier === 1 ? "#991B1B" : v.tier === 2 ? "#92400E" : "#6B7280", border: `1px solid ${v.tier === 1 ? "#FECACA" : v.tier === 2 ? "#FDE68A" : "rgba(255,255,255,0.1)"}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Tier {v.tier}</span>,
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{v.category}</span>,
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 5, background: "var(--input)", borderRadius: 3, minWidth: 60 }}><div style={{ height: "100%", width: `${v.score}%`, background: v.score >= 80 ? "#10B981" : v.score >= 60 ? "#D97706" : "#EF4444", borderRadius: 3 }} /></div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 11, color: v.score >= 80 ? "#065F46" : v.score >= 60 ? "#92400E" : "#991B1B" }}>{v.score}</span>
                    </div>,
                    <Badge label={v.status} />,
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{v.lastAssessed}</span>,
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{v.nextDue}</span>,
                    v.critical ? <span style={{ background: "rgba(239,68,68,0.06)", color: "#991B1B", border: "1px solid rgba(252,165,165,0.25)", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>Yes</span> : <span style={{ color: "#D1D5DB" }}>—</span>,
                    <div onClick={e=>e.stopPropagation()} style={{ display:"flex", gap:3 }}>
                      <button title="Assign Owner" onClick={()=>setOwnerPickR({type:"vendor",id:v.id,name:v.name,owner:(v as any).owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                      <button title="Set Risk Tier" onClick={()=>setRiskPickR({type:"vendor",id:v.id,name:v.name,level:String(v.tier??"Low"),field:"riskTier"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                      <button title="Upload Evidence" onClick={()=>setEvidPickR({type:"vendor",id:v.id,name:v.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                    </div>,
                  ])}
                />
              </>
            )}

            {/* ── Questionnaires sub-tab ── */}
            {tprmSubTab === "questionnaires" && (
              <div style={{ flex: 1, minHeight: 0, margin: "-16px -24px" }}>
                <Questionnaires />
              </div>
            )}
          </>
        )}

        {/* ── HEAT MAP (new) ─────────────────────────────────────────────────── */}
        {tab === "heatmap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
              {[["#FEE2E2","#FECACA","Critical (16–25)"],["rgba(245,158,11,0.10)","#FDE68A","High (10–15)"],["rgba(34,197,94,0.08)","#A7F3D0","Medium (5–9)"],["rgba(34,197,94,0.08)","#BBF7D0","Low (1–4)"]].map(([bg,bdr,label]) => (
                <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 14, height: 14, background: bg as string, border: `1px solid ${bdr as string}`, borderRadius: 3 }} />
                  <span style={{ fontSize: 10, color: "#6B7280" }}>{label}</span>
                </div>
              ))}
              {selectedCellRisks && (
                <button onClick={() => setSelectedCellRisks(null)} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "var(--foreground)" }}>Clear filter ×</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              {/* The 5×5 heat map grid */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 16 }}>Risk Heat Map — Likelihood × Impact</div>

                {/* Y-axis label */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 20 }}>
                    <span style={{ fontSize: 9, color: "var(--muted-foreground)", writingMode: "vertical-rl", transform: "rotate(180deg)", textTransform: "uppercase", letterSpacing: 1 }}>Likelihood →</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    {/* Rows: likelihood 5 (top) to 1 (bottom) */}
                    {[5,4,3,2,1].map(l => (
                      <div key={l} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 12, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{l}</div>
                        {[1,2,3,4,5].map(i => {
                          const cellKey = `${l}-${i}`;
                          const cellRisks = lRisks.filter(r => {
                            const pos = riskPositions[r.id];
                            return pos && pos.l === l && pos.i === i;
                          });
                          const isHovered = hoveredCell === cellKey;
                          const isSelected = selectedCellRisks !== null && cellRisks.length > 0 && cellRisks.every(r => selectedCellRisks.includes(r.id));
                          return (
                            <div
                              key={i}
                              onMouseEnter={() => setHoveredCell(cellKey)}
                              onMouseLeave={() => setHoveredCell(null)}
                              onClick={() => {
                                if (cellRisks.length > 0) {
                                  setSelectedCellRisks(isSelected ? null : cellRisks.map(r => r.id));
                                }
                              }}
                              style={{
                                flex: 1, aspectRatio: "1", background: cellBg(l, i), border: `1.5px solid ${isHovered || isSelected ? "#1E3A5F" : cellBorder(l, i)}`,
                                borderRadius: 8, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center",
                                gap: 3, padding: 4, cursor: cellRisks.length > 0 ? "pointer" : "default",
                                boxShadow: isHovered ? "0 0 0 2px #1E3A5F44" : "none",
                                transition: "box-shadow 0.12s",
                                position: "relative",
                              }}
                            >
                              {cellRisks.slice(0, 6).map(r => (
                                <div key={r.id} style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor(r.severity), border: "1.5px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", flexShrink: 0 }} title={`${r.id}: ${r.name}`} />
                              ))}
                              {/* Count badge — always visible when risks exist */}
                              {cellRisks.length > 0 && (
                                <div style={{ position: "absolute", top: 3, right: 4, fontSize: 9, fontWeight: 800, lineHeight: 1, color: dotColor(cellRisks[0].severity), letterSpacing: "-0.3px" }}>
                                  {cellRisks.length}
                                </div>
                              )}
                              {/* Score label on hover when empty */}
                              {isHovered && cellRisks.length === 0 && (
                                <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{l * i}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* X-axis labels */}
                    <div style={{ display: "flex", gap: 6, marginTop: 4, paddingLeft: 18 }}>
                      {[1,2,3,4,5].map(i => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{i}</div>)}
                    </div>
                    <div style={{ textAlign: "center", fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>← Impact →</div>
                  </div>
                </div>

                {/* Legend for severity dots */}
                <div style={{ display: "flex", gap: 12, marginTop: 14, justifyContent: "center" }}>
                  {[["Critical","#DC2626"],["High","#D97706"],["Medium","#1E3A5F"],["Low","#059669"]].map(([sev,color]) => (
                    <div key={sev} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color as string }} />
                      <span style={{ fontSize: 10, color: "#6B7280" }}>{sev}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk detail panel */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 12 }}>
                  {selectedCellRisks ? `Filtered: ${selectedCellRisks.length} risk(s) in selected cell` : "All Risks — click a cell to filter"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {heatMapRisks.map(r => {
                    const pos = riskPositions[r.id];
                    const sevColors: Record<string, [string, string]> = {
                      Critical: ["rgba(239,68,68,0.06)", "#991B1B"], High: ["rgba(245,158,11,0.06)", "#92400E"],
                      Medium: ["rgba(59,130,246,0.12)", "#1E3A5F"], Low: ["rgba(34,197,94,0.08)", "#065F46"],
                    };
                    const [bg, col] = sevColors[r.severity] ?? ["var(--border)","var(--foreground)"];
                    return (
                      <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", background: bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <div>
                            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", marginRight: 8 }}>{r.id}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)" }}>{r.name}</span>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: col, background: "var(--card)", borderRadius: 4, padding: "1px 7px", border: `1px solid ${col}44`, flexShrink: 0 }}>{r.severity}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>
                          <span>Score: <strong style={{ color: "var(--foreground)" }}>{r.score}</strong></span>
                          {pos && <span>L:{pos.l} × I:{pos.i}</span>}
                          <span>Owner: {r.ownerFull}</span>
                          <span style={{ color: r.trend === "down" ? "#065F46" : r.trend === "up" ? "#DC2626" : "var(--muted-foreground)", fontWeight: 700 }}>{r.trend === "down" ? "▼" : r.trend === "up" ? "▲" : "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Risk cascade flow */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.40)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 14 }}>Risk Cascade Relationships</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { from: "RK-2041", to: "RK-2039", rel: "amplifies",  desc: "Cloud misconfiguration exposes privileged credentials" },
                  { from: "RK-2039", to: "RK-2037", rel: "compounds",  desc: "Compromised admin accounts ease unpatched server exploitation" },
                  { from: "RK-2035", to: "RK-2033", rel: "triggers",   desc: "Missing DPA may block DSAR fulfilment and cause SLA breach" },
                  { from: "RK-2031", to: "RK-2029", rel: "amplifies",  desc: "Stale firewall rules may not catch certificate-based attacks" },
                ].map((c, idx) => {
                  const relColors: Record<string, [string, string]> = {
                    amplifies: ["rgba(245,158,11,0.06)","#D97706"], triggers: ["rgba(239,68,68,0.06)","#DC2626"], compounds: ["#EEF2FF","#4338CA"],
                  };
                  const [bg, col] = relColors[c.rel] ?? ["var(--border)","var(--foreground)"];
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${col}33`, borderRadius: 8, padding: "10px 14px", background: bg }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#DC2626", background: "rgba(239,68,68,0.06)", borderRadius: 4, padding: "2px 8px" }}>{c.from}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: col, background: "var(--card)", border: `1px solid ${col}44`, borderRadius: 4, padding: "1px 8px" }}>{c.rel}</span>
                      <span style={{ fontSize: 14 }}>→</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#D97706", background: "rgba(245,158,11,0.06)", borderRadius: 4, padding: "2px 8px" }}>{c.to}</span>
                      <span style={{ fontSize: 11, color: "#6B7280", flex: 1 }}>{c.desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "workflow" && (
          <WorkflowPipeline workflows={[RISK_MGMT_WF]} />
        )}

      </div>

      {/* ── Create Risk Drawer ─────────────────────────────────────────── */}
      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateForm({ ...blankRisk }); }}
        title="New Risk"
        subtitle="Register a new risk in the risk register"
        width={520}
        headerColor="#7F1D1D"
      >
        {(() => {
          const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4, display:"block" };
          const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" };
          const ta:  React.CSSProperties = { ...inp, minHeight:72, resize:"vertical" };
          const row: React.CSSProperties = { marginBottom:16 };
          const grid2: React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 };
          return (
            <div>
              <div style={row}>
                <label style={lbl}>Risk Name *</label>
                <input style={inp} value={createForm.name} onChange={e => cf("name", e.target.value)} placeholder="e.g. Unpatched critical CVE in production API" autoFocus/>
              </div>
              <div style={grid2}>
                <div><label style={lbl}>Category</label>
                  <select style={inp} value={createForm.category} onChange={e => cf("category", e.target.value)}>
                    {["Cybersecurity","Data Privacy","Compliance","Operational","Third Party","Financial","Reputational","Legal / Regulatory"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Severity</label>
                  <select style={inp} value={createForm.severity} onChange={e => cf("severity", e.target.value)}>
                    {["Critical","High","Medium","Low"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={row}>
                <label style={lbl}>Description</label>
                <textarea style={ta} value={createForm.description} onChange={e => cf("description", e.target.value)} placeholder="Describe the risk, potential impact, and context…"/>
              </div>
              <div style={grid2}>
                <div><label style={lbl}>Risk Score (0–100)</label><input style={inp} type="number" min={0} max={100} value={createForm.score} onChange={e => cf("score", e.target.value)}/></div>
                <div><label style={lbl}>Owner (short name)</label><input style={inp} value={createForm.owner} onChange={e => cf("owner", e.target.value)} placeholder="e.g. A. Kim"/></div>
              </div>
              <div style={row}>
                <label style={lbl}>Owner Full Name</label>
                <input style={inp} value={createForm.ownerFull} onChange={e => cf("ownerFull", e.target.value)} placeholder="e.g. Alex Kim"/>
              </div>
              <div style={{ marginTop:8, display:"flex", gap:10 }}>
                <button onClick={handleCreate} disabled={creating||!createForm.name.trim()} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:creating||!createForm.name.trim()?"rgba(127,29,29,0.35)":"linear-gradient(135deg,#7F1D1D,#991B1B)", color:"white", fontSize:13, fontWeight:700, cursor:creating||!createForm.name.trim()?"not-allowed":"pointer", fontFamily:"inherit", transition:"background 0.2s" }}>
                  {creating ? "Registering…" : "Register Risk"}
                </button>
                <button onClick={() => { setShowCreate(false); setCreateForm({ ...blankRisk }); }} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Risk Edit Drawer ──────────────────────────────────────────────── */}
      <Drawer open={showEditRisk} onClose={()=>{setShowEditRisk(false);setEditRiskTarget(null);}} title="Edit Risk" subtitle="Update risk register entry" width={480} headerColor="#7F1D1D">
        {(() => {
          const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4, display:"block" };
          const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" };
          const ta:  React.CSSProperties = { ...inp, minHeight:80, resize:"vertical" };
          const row: React.CSSProperties = { marginBottom:16 };
          const g2:  React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 };
          return (
            <div>
              <div style={row}><label style={lbl}>Risk Name *</label><input style={inp} value={editRiskForm.name} onChange={e=>ef("name",e.target.value)} autoFocus/></div>
              <div style={g2}>
                <div><label style={lbl}>Category</label>
                  <select style={inp} value={editRiskForm.category} onChange={e=>ef("category",e.target.value)}>
                    {["Cybersecurity","Data Privacy","Operational","Financial","Compliance","Vendor","Reputational","Strategic"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Severity</label>
                  <select style={inp} value={editRiskForm.severity} onChange={e=>ef("severity",e.target.value)}>
                    {["Critical","High","Medium","Low"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={g2}>
                <div><label style={lbl}>Owner</label><input style={inp} value={editRiskForm.owner} onChange={e=>ef("owner",e.target.value)} placeholder="e.g. Alex Kim"/></div>
                <div><label style={lbl}>Risk Score (0–100)</label><input style={inp} type="number" min={0} max={100} value={editRiskForm.score} onChange={e=>ef("score",e.target.value)}/></div>
              </div>
              <div style={row}><label style={lbl}>Description</label><textarea style={ta} value={editRiskForm.description} onChange={e=>ef("description",e.target.value)}/></div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={handleSaveRisk} disabled={savingRisk||!editRiskForm.name.trim()} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:savingRisk||!editRiskForm.name.trim()?"rgba(127,29,29,0.35)":"linear-gradient(135deg,#7F1D1D,#991B1B)", color:"white", fontSize:13, fontWeight:700, cursor:savingRisk||!editRiskForm.name.trim()?"not-allowed":"pointer", fontFamily:"inherit" }}>
                  {savingRisk?"Saving…":"Save Changes"}
                </button>
                <button onClick={()=>{setShowEditRisk(false);setEditRiskTarget(null);}} style={{ padding:"10px 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Import Risk Register Modal ────────────────────────────────────── */}
      {showImport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={()=>setShowImport(false)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:14, padding:"28px 32px", width:560, maxHeight:"80vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.7)" }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, fontWeight:800, color:"#A5B4FC", marginBottom:4 }}>Import Risk Register</div>
            <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:18 }}>Load risks from a GitHub repository or upload a local file (CSV / JSON).</div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:2, marginBottom:20, borderBottom:"1px solid var(--border)", paddingBottom:0 }}>
              {(["github","file"] as const).map(t=>(
                <button key={t} onClick={()=>setImportTab(t)}
                  style={{ padding:"7px 18px", borderRadius:"6px 6px 0 0", border:"none", background:importTab===t?"rgba(99,102,241,0.15)":"transparent", color:importTab===t?"#A5B4FC":"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderBottom:importTab===t?"2px solid #6366F1":"none" }}>
                  {t==="github"?"🐙 GitHub Repo":"📂 Upload File"}
                </button>
              ))}
            </div>

            {/* GitHub tab */}
            {importTab==="github" && (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:4 }}>Repository (owner/repo)</div>
                    <input value={importGhRepo} onChange={e=>setImportGhRepo(e.target.value)} placeholder="aigo-x/GRC"
                      style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:4 }}>Branch</div>
                    <input value={importGhBranch} onChange={e=>setImportGhBranch(e.target.value)} placeholder="main"
                      style={{ width:90, padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}/>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:4 }}>Personal Access Token (for private repos)</div>
                  <input type="password" value={importGhToken} onChange={e=>setImportGhToken(e.target.value)} placeholder="ghp_… (optional for public repos)"
                    style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
                </div>
                <button onClick={fetchGhContents} disabled={importGhStatus==="loading"}
                  style={{ padding:"9px 20px", borderRadius:7, border:"none", background:importGhStatus==="loading"?"rgba(99,102,241,0.3)":"#4F46E5", color:"white", fontSize:12, fontWeight:700, cursor:importGhStatus==="loading"?"not-allowed":"pointer", fontFamily:"inherit", marginBottom:14 }}>
                  {importGhStatus==="loading"?"Connecting…":"Browse Repository"}
                </button>
                {importGhErr && (
                  <div style={{ padding:"10px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, fontSize:11, color:"#FCA5A5", lineHeight:1.6, marginBottom:12 }}>
                    ⚠ {importGhErr}
                  </div>
                )}
                {importGhStatus==="success" && importGhFiles.length>0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--muted-foreground)", marginBottom:8 }}>Files found — click to import:</div>
                    {importGhFiles.map(f=>(
                      <div key={f.path} onClick={()=>importFromGhFile(f.url, f.name)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:7, border:"1px solid rgba(99,102,241,0.25)", background:"rgba(99,102,241,0.06)", cursor:"pointer", marginBottom:6 }}
                        onMouseEnter={e=>(e.currentTarget.style.background="rgba(99,102,241,0.14)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="rgba(99,102,241,0.06)")}>
                        <span style={{ fontSize:13 }}>{f.name.endsWith(".csv")?"📊":"📋"}</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:"rgb(165,180,252)" }}>{f.name}</div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)" }}>{f.path}</div>
                        </div>
                        <span style={{ marginLeft:"auto", fontSize:10, color:"var(--muted-foreground)" }}>Click to import →</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* File upload tab */}
            {importTab==="file" && (
              <div>
                <div onClick={()=>importFileRef.current?.click()}
                  style={{ border:"2px dashed rgba(99,102,241,0.35)", borderRadius:10, padding:"32px 20px", textAlign:"center", cursor:"pointer", background:"rgba(99,102,241,0.04)", marginBottom:14 }}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(99,102,241,0.7)")}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(99,102,241,0.35)")}>
                  <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#A5B4FC", marginBottom:4 }}>Click to upload risk register</div>
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Supports CSV and JSON · Headers are auto-mapped</div>
                </div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:8 }}>
                  Expected CSV columns: <span style={{ fontFamily:"monospace", color:"rgb(165,180,252)" }}>id, name, category, severity, score, owner, status, description</span>
                </div>
                {importFileStatus==="parsed" && (
                  <div style={{ padding:"10px 12px", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:7, fontSize:12, color:"#6EE7B7" }}>
                    ✓ {importFileCount} risks imported successfully
                  </div>
                )}
                {importFileStatus==="error" && (
                  <div style={{ padding:"10px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, fontSize:11, color:"#FCA5A5", lineHeight:1.6 }}>
                    ⚠ {importFileErr}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop:16, borderTop:"1px solid var(--border)", paddingTop:14 }}>
              <button onClick={()=>setShowImport(false)}
                style={{ padding:"8px 18px", borderRadius:7, border:"1px solid rgba(255,255,255,0.1)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Risk Confirm Delete Dialog ─────────────────────────────────────── */}
      {confirmDelRisk && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setConfirmDelRisk(null)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, padding:"28px 32px", width:400, boxShadow:"0 8px 40px rgba(0,0,0,0.6)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:800, color:"#F87171", marginBottom:8 }}>Delete Risk?</div>
            <div style={{ fontSize:12, color:"rgba(148,163,184,0.8)", marginBottom:24 }}>
              <strong style={{ color:"var(--foreground)" }}>"{confirmDelRisk.name}"</strong> will be permanently removed from the risk register.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleDeleteRisk} disabled={deletingRisk} style={{ flex:1, padding:"9px", borderRadius:8, border:"none", background:"#991B1B", color:"white", fontSize:13, fontWeight:700, cursor:deletingRisk?"not-allowed":"pointer", fontFamily:"inherit" }}>
                {deletingRisk?"Deleting…":"Yes, Delete"}
              </button>
              <button onClick={()=>setConfirmDelRisk(null)} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {ownerPickR && <OwnerPickerModal open={true} objectType={ownerPickR.type} objectId={ownerPickR.id} objectName={ownerPickR.name} currentOwner={ownerPickR.owner} onClose={()=>setOwnerPickR(null)} onSaved={v=>afterOwnerSaveR(ownerPickR.type,ownerPickR.id,v)} />}
      {riskPickR  && <RiskLevelModal  open={true} objectType={riskPickR.type}  objectId={riskPickR.id}  objectName={riskPickR.name}  currentLevel={riskPickR.level} fieldName={riskPickR.field} onClose={()=>setRiskPickR(null)}  onSaved={v=>afterRiskSaveR(riskPickR.type,riskPickR.id,v,riskPickR.field)} />}
      {evidPickR  && <EvidenceUploadModal open={true} objectType={evidPickR.type} objectId={String(evidPickR.id)} objectName={evidPickR.name} onClose={()=>setEvidPickR(null)} onSaved={()=>setEvidPickR(null)} />}

      {/* ── AI Score Results Modal ──────────────────────────────────────────── */}
      {showScoreResults && scoreResults && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
          onClick={()=>setShowScoreResults(false)}>
          <div style={{ background:"var(--card)", border:"1px solid rgba(167,139,250,0.35)", borderRadius:16, width:780, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 32px 80px rgba(0,0,0,0.85)" }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:"18px 24px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:11, color:"#C4B5FD", fontWeight:700, marginBottom:2 }}>✦ AI vCISO — Risk Scoring Complete</div>
                <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)" }}>{scoreResults.updated} Risk{scoreResults.updated !== 1 ? "s" : ""} Re-scored</div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginTop:3 }}>Scored at {new Date(scoreResults.scoredAt).toLocaleString()} · Source: FAIR model + ISO 27001 / NIST CSF</div>
              </div>
              <button onClick={()=>setShowScoreResults(false)} style={{ border:"none", background:"transparent", color:"var(--muted-foreground)", fontSize:18, cursor:"pointer", padding:4 }}>✕</button>
            </div>
            {/* Summary */}
            {scoreResults.summary && (
              <div style={{ margin:"14px 24px 0", background:"rgba(167,139,250,0.07)", border:"1px solid rgba(167,139,250,0.22)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"var(--foreground)", lineHeight:1.6, flexShrink:0 }}>
                <span style={{ fontWeight:700, color:"#C4B5FD", marginRight:6 }}>Posture:</span>{scoreResults.summary}
              </div>
            )}
            {/* Results table */}
            <div style={{ overflowY:"auto", flex:1, padding:"14px 24px 20px" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Risk ID","Risk Name","Prev Score","New Score","Severity Change","Rationale"].map(h => (
                      <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:"var(--muted-foreground)", fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scoreResults.results.map(r => {
                    const scoreUp = r.newScore > r.prevScore;
                    const scoreDown = r.newScore < r.prevScore;
                    const sevChanged = r.newSeverity !== r.prevSeverity;
                    const sevColors: Record<string,string> = { Critical:"#F87171", High:"#FBBF24", Medium:"#FCD34D", Low:"#34D399" };
                    return (
                      <tr key={r.riskId} style={{ borderBottom:"1px solid var(--border)" }}>
                        <td style={{ padding:"9px 10px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"var(--muted-foreground)" }}>{r.riskId}</td>
                        <td style={{ padding:"9px 10px", fontWeight:600, color:"rgb(147,197,253)", fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</td>
                        <td style={{ padding:"9px 10px", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"var(--muted-foreground)" }}>{r.prevScore}</td>
                        <td style={{ padding:"9px 10px" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color: scoreUp ? "#F87171" : scoreDown ? "#34D399" : "var(--foreground)" }}>{r.newScore}</span>
                          <span style={{ marginLeft:4, fontSize:10, color: scoreUp ? "#F87171" : scoreDown ? "#34D399" : "var(--muted-foreground)", fontWeight:700 }}>
                            {scoreUp ? `▲ +${r.newScore - r.prevScore}` : scoreDown ? `▼ ${r.newScore - r.prevScore}` : "—"}
                          </span>
                        </td>
                        <td style={{ padding:"9px 10px" }}>
                          {sevChanged ? (
                            <span style={{ fontSize:10, fontWeight:700 }}>
                              <span style={{ color:"var(--muted-foreground)" }}>{r.prevSeverity}</span>
                              <span style={{ color:"var(--muted-foreground)", margin:"0 4px" }}>→</span>
                              <span style={{ color: sevColors[r.newSeverity] ?? "var(--foreground)" }}>{r.newSeverity}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize:10, color: sevColors[r.newSeverity] ?? "var(--foreground)", fontWeight:700 }}>{r.newSeverity}</span>
                          )}
                        </td>
                        <td style={{ padding:"9px 10px", fontSize:11, color:"var(--muted-foreground)", lineHeight:1.5, maxWidth:220 }}>{r.rationale}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:"12px 24px 16px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"flex-end", flexShrink:0 }}>
              <button onClick={()=>setShowScoreResults(false)} style={{ padding:"8px 20px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Playbook Modal ───────────────────────────────────────────── */}
      {playbookRisk && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
          onClick={e=>{ if(e.target===e.currentTarget&&!playbookStreaming){ setPlaybookRisk(null); setPlaybookContent(""); } }}>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:16, width:720, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 32px 80px rgba(0,0,0,0.8)", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            <div style={{ padding:"18px 24px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:11, color:"#34D399", fontWeight:700, marginBottom:2 }}>◆ AI vCISO — Remediation Playbook</div>
                <div style={{ fontSize:16, fontWeight:800, color:"var(--foreground)", lineHeight:1.3 }}>{playbookRisk.name}</div>
                <div style={{ display:"flex", gap:8, marginTop:6 }}>
                  <span style={{ background:"rgba(239,68,68,0.08)", border:"1px solid #FECACA", color:"#991B1B", borderRadius:4, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{playbookRisk.severity}</span>
                  <span style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:4, padding:"1px 8px", fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>{playbookRisk.category}</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {!playbookStreaming && playbookContent && (
                  <button onClick={()=>{ navigator.clipboard?.writeText(playbookContent); }}
                    style={{ border:"1px solid var(--border)", background:"var(--card)", borderRadius:8, padding:"6px 12px", fontSize:11, fontWeight:700, color:"var(--foreground)", cursor:"pointer", fontFamily:"inherit" }}>
                    Copy
                  </button>
                )}
                <button onClick={()=>{ if(!playbookStreaming){ setPlaybookRisk(null); setPlaybookContent(""); } }}
                  style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:8, width:28, height:28, cursor:playbookStreaming?"not-allowed":"pointer", color:"var(--muted-foreground)", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
              {playbookStreaming && !playbookContent && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted-foreground)" }}>
                  <div style={{ fontSize:20, marginBottom:10 }}>◆</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1E3A5F" }}>Generating remediation playbook…</div>
                  <div style={{ fontSize:11, marginTop:4 }}>AI is creating step-by-step instructions tailored to this risk</div>
                </div>
              )}
              {playbookContent && (
                <div style={{ fontSize:13, lineHeight:1.8, color:"var(--foreground)", fontFamily:"inherit" }}>
                  {playbookContent.split(/^(#{1,3} .+)$/m).map((part, i) => {
                    if (/^#{1,3} /.test(part)) {
                      const level=(part.match(/^(#{1,3})/)||[])[1]?.length??1;
                      const txt=part.replace(/^#{1,3} /,"");
                      return <div key={i} style={{ fontSize:level===1?15:level===2?13.5:12.5, fontWeight:800, color:"#1E3A5F", marginTop:level===1?0:14, marginBottom:6, paddingBottom:level===1?8:0, borderBottom:level===1?"1px solid var(--border)":"none" }}>{txt}</div>;
                    }
                    return <span key={i} style={{ whiteSpace:"pre-wrap" }}>{part}</span>;
                  })}
                  {playbookStreaming && <span style={{ display:"inline-block", width:8, height:14, background:"#1E3A5F", borderRadius:2, animation:"pulse 1s infinite", verticalAlign:"middle", marginLeft:2 }} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

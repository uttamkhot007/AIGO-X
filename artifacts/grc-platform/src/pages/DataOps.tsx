// @ts-nocheck
import { useState, useMemo, useEffect, useRef } from "react";
import { useOrg } from "@/context/OrgContext";
import { useLicense } from "@/context/LicenseContext";
import { LockedModule } from "@/components/LockedModule";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { AICopilotBar } from "@/components/AICopilotBar";
import { getStoredToken } from "@/lib/auth-utils";
import { ReactFlow, Background, Controls, MiniMap, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Design tokens (project standard) ───────────────────────────────────────────
const NAV = "#93C5FD";
const EME = "#34D399";
const RED = "#F87171";
const AMB = "#FCD34D";
const BLU = "#60A5FA";
const PRP = "#A78BFA";
const CYN = "#22D3EE";
const PNK = "#F472B6";

const card = (extra = {}) => ({
  background:"var(--card)", borderRadius:12, border:"1px solid var(--border)",
  boxShadow:"0 2px 12px rgba(0,0,0,0.40)", ...extra,
});

function KpiCard({ label, value, sub, color=NAV, icon, alert, onClick }) {
  return (
    <div onClick={onClick} style={card({ padding:"14px 16px", display:"flex", alignItems:"center", gap:12,
      borderColor:alert?RED:"rgba(255,255,255,0.1)", cursor:onClick?"pointer":undefined })}>
      <div style={{ width:36, height:36, borderRadius:9, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:20, fontWeight:800, color, letterSpacing:"-0.5px" }}>{value}</div>
        <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>{label}</div>
        {sub && <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Chip({ label, color=NAV }) {
  return <span style={{ fontSize:9, fontWeight:700, color, background:`${color}18`, border:`1px solid ${color}33`, borderRadius:4, padding:"1px 5px", whiteSpace:"nowrap" }}>{label}</span>;
}

function RiskBar({ value }) {
  const c = value>=90?RED:value>=70?AMB:value>=50?BLU:EME;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:64, height:5, borderRadius:3, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
        <div style={{ width:`${value}%`, height:"100%", background:c, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:10, fontWeight:800, color:c, fontFamily:"monospace", minWidth:24 }}>{value}</span>
    </div>
  );
}

const riskBg  = r => r>=90?"rgba(248,113,113,0.08)":r>=70?"rgba(252,211,77,0.08)":r>=50?"rgba(96,165,250,0.08)":"rgba(52,211,153,0.08)";
const riskClr = r => r>=90?RED:r>=70?AMB:r>=50?BLU:EME;
const riskLbl = r => r>=90?"Critical":r>=70?"High":r>=50?"Medium":"Low";
const platformIcon = { AWS:"☁", GCP:"🔷", Azure:"🔵", SaaS:"🌐", OnPrem:"🖥", Snowflake:"❄" };

// ── 80+ Data Stores ────────────────────────────────────────────────────────────
const _dataStores = [];

// ── 80+ Classification Findings ────────────────────────────────────────────────
const _clsFindings = [];

// ── 50+ Over-Permission Alerts ─────────────────────────────────────────────────
const _overPermAlerts = [];

// ── 22 Lineage Nodes ───────────────────────────────────────────────────────────
const _lineageNodes = [];
const _lineageEdges = [];

// ── Shadow Data (loaded from API) ─────────────────────────────────────────────
const _shadowStores: any[] = [];
const _dlpPolicies: any[] = [];
const _damEvents: any[] = [];
const _encryptionMatrix: any[] = [];
const _residencyData: any[] = [];
const _aiDatasets: any[] = [];
const _anomalies: any[] = [];
const _catalog: any[] = [];

// (static arrays removed — data served from API)

// ── Heatmap helpers ────────────────────────────────────────────────────────────
const SENSITIVITY_TYPES = ["PII","PHI","PCI","Credentials","Biometric","Financial","Legal","Biometric"];
function heatColor(val) {
  if (val===0)      return { bg:"rgb(23,30,42)",             color:"#D1D5DB" };
  if (val<1000)     return { bg:"rgba(252,211,77,0.08)",     color:AMB };
  if (val<50000)    return { bg:"rgba(248,113,113,0.08)",    color:RED };
  return              { bg:"rgba(127,29,29,0.85)",           color:"var(--card)" };
}

// ── Sensitivity / type color maps ──────────────────────────────────────────────
const sensitivityColor = {
  Restricted:  { bg:"rgba(248,113,113,0.08)",  color:RED, border:"#FECACA" },
  Confidential:{ bg:"rgba(252,211,77,0.08)",   color:AMB, border:"#FDE68A" },
  Internal:    { bg:"rgba(96,165,250,0.12)",   color:BLU, border:"#BFDBFE" },
  Public:      { bg:"rgba(52,211,153,0.08)",   color:EME, border:"#A7F3D0" },
};
const typeColor = { source:"rgba(96,165,250,0.12)", pipeline:"rgba(167,139,250,0.12)", transform:"rgba(52,211,153,0.08)", destination:"rgba(248,113,113,0.08)", api:"rgba(252,211,77,0.08)" };
const typeBorder = { source:BLU, pipeline:PRP, transform:EME, destination:RED, api:AMB };

// ── Derived module-level stats ─────────────────────────────────────────────────
const totalSensitiveRecords = _clsFindings.reduce((s,f)=>s+f.records,0);

// ── Build lineage graph helper ─────────────────────────────────────────────────
function buildLineageGraph(selectedNode, showPii, nodes, edges) {
  const rfNodes = nodes.map(n => {
    const isSelected = n.id===selectedNode;
    const isConnected = selectedNode ? edges.some(e=>(e.s===selectedNode&&e.t===n.id)||(e.t===selectedNode&&e.s===n.id)) : false;
    const sc = sensitivityColor[n.sensitivity] ?? sensitivityColor.Internal;
    return {
      id:n.id, position:{x:n.x, y:n.y},
      style:{ background:sc.bg, border:`2px solid ${isSelected?RED:isConnected?AMB:sc.border}`, borderRadius:10, padding:"8px 12px", width:170,
        boxShadow:isSelected?`0 0 12px ${RED}44`:"0 2px 6px rgba(0,0,0,0.08)",
        fontFamily:"inherit", opacity:selectedNode&&!isSelected&&!isConnected?0.35:1 },
      data:{ label:(
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:8,fontWeight:800,color:"var(--card)",background:typeBorder[n.type]??NAV,borderRadius:3,padding:"1px 4px"}}>{n.type?.toUpperCase()}</span>
            <span style={{fontSize:8,color:"#6B7280"}}>{n.platform}</span>
          </div>
          <div style={{fontSize:10,fontWeight:800,color:NAV,lineHeight:1.3,whiteSpace:"pre-wrap"}}>{n.label}</div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap",marginTop:2}}>
            {n.dataTypes?.map(t=><span key={t} style={{fontSize:7,fontWeight:700,color:sc.color,background:"var(--card)",border:`1px solid ${sc.border}`,borderRadius:2,padding:"1px 3px"}}>{t}</span>)}
          </div>
          <div style={{fontSize:7,fontWeight:700,color:sc.color}}>{n.sensitivity}</div>
        </div>
      )},
    };
  });
  const rfEdges = edges.map(e => {
    const isActive = selectedNode?(e.s===selectedNode||e.t===selectedNode):true;
    const isPiiHighlight = showPii && e.pii;
    const edgeColor = !e.encrypted?RED:isPiiHighlight?AMB:EME;
    return {
      id:e.id, source:e.s, target:e.t,
      style:{stroke:edgeColor,strokeWidth:!e.encrypted?2.5:isPiiHighlight?2:1.5,opacity:selectedNode&&!isActive?0.08:1},
      markerEnd:{type:MarkerType.ArrowClosed,color:edgeColor,width:12,height:12},
      label:e.label, animated:!e.encrypted,
      labelStyle:{fontSize:8,fontWeight:700,fill:edgeColor,fontFamily:"inherit"},
      labelBgStyle:{fill:"white",fillOpacity:0.85},
    };
  });
  return {nodes:rfNodes,edges:rfEdges};
}

// ── Overview 12-week risk trend data ───────────────────────────────────────────
const _riskTrend: any[] = [];

// ── Heatmap grid ───────────────────────────────────────────────────────────────
const HEAT_TYPES = ["PII","PHI","PCI","Credentials","Biometric","Financial","Legal"];
const heatmapGrid = _dataStores.slice(0,18).map(s => {
  const hasClass = (t) => s.classifications.some(c=>c.toLowerCase().includes(t.toLowerCase()));
  return {
    store:s.name, platform:s.platform,
    PII:       hasClass("PII")         ? Math.floor(s.sensitive * 0.6)   : 0,
    PHI:       hasClass("PHI")         ? Math.floor(s.sensitive * 0.4)   : 0,
    PCI:       hasClass("PCI")         ? Math.floor(s.sensitive * 0.45)  : 0,
    Credentials:hasClass("Credentials")? Math.floor(s.sensitive * 0.1)   : 0,
    Biometric: hasClass("Biometric")   ? Math.floor(s.sensitive * 0.35)  : 0,
    Financial: hasClass("Financial")   ? Math.floor(s.sensitive * 0.5)   : 0,
    Legal:     hasClass("Legal")       ? Math.floor(s.sensitive * 0.3)   : 0,
  };
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function DataOps() {
  const { isModuleLicensed, isSubModuleLicensed } = useLicense();
  const { viewTenantId } = useOrg();
  const [dataStores, setDataStores]         = useState([]);
  const [clsFindings, setClsFindings]       = useState([]);
  const [lineageNodes, setLineageNodes]     = useState([]);
  const [lineageEdges, setLineageEdges]     = useState([]);
  const [overPermAlerts, setOverPermAlerts] = useState([]);
  const [dspmStats, setDspmStats]           = useState<any>(null);
  const [tab, setTab]                       = useState("overview");

  // ── Live API integration — seed data as fallback ────────────────────────────
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    const h = { Authorization:`Bearer ${token}` };
    const get = (path) => fetch(path,{headers:h}).then(r=>r.ok?r.json():null).catch(()=>null);
    Promise.all([
      get("/api/dspm/stores"),
      get("/api/dspm/findings"),
      get("/api/dspm/lineage"),
      get("/api/dspm/over-permission"),
      get("/api/dspm/stats"),
    ]).then(([stores, findings, lineage, overPerm, stats]) => {
      if (Array.isArray(stores) && stores.length>0) {
        setDataStores(stores.map(s=>({
          id:s.id, name:s.name, type:s.type, platform:s.platform, env:s.environment??s.env,
          region:s.region, owner:s.owner, lastScan:s.lastScan, scanStatus:s.scanStatus,
          total:s.totalFiles??s.total??0, sensitive:s.sensitiveFiles??s.sensitive??0,
          encrypted:s.encryptedAtRest??s.encrypted, public:s.publiclyAccessible??s.public,
          risk:s.riskScore??s.risk??50, classifications:s.classifications??[],
        })));
      }
      if (Array.isArray(findings) && findings.length>0) {
        setClsFindings(findings.map(f=>({
          id:f.id, store:f.storeName??f.store, type:f.findingType??f.type, subType:f.subType,
          confidence:f.confidence, records:f.recordCount??f.records??0,
          severity:f.severity, regulatory:f.regulatoryImpact??f.regulatory??[],
          encrypted:f.encrypted, masked:f.masked, status:f.status,
          detected:f.firstDetected??f.detected, sladays:f.slaDaysRemaining??f.sladays??7,
        })));
      }
      if (lineage?.nodes && Array.isArray(lineage.nodes) && lineage.nodes.length>0) {
        const xByType={source:0,pipeline:300,transform:560,destination:820,api:1080};
        const countsByType={};
        const seedById=Object.fromEntries(_lineageNodes.map(n=>[n.id,n]));
        setLineageNodes(lineage.nodes.map(n=>{
          const seed=seedById[n.id];
          const t=n.type??"source";
          countsByType[t]=(countsByType[t]??0)+1;
          return { id:n.id, label:n.label, type:n.type, platform:n.platform, sensitivity:n.sensitivity, dataTypes:n.dataTypes??[], x:seed?.x??(xByType[t]??0), y:seed?.y??((countsByType[t]-1)*160) };
        }));
      }
      if (lineage?.edges && Array.isArray(lineage.edges) && lineage.edges.length>0) {
        setLineageEdges(lineage.edges.map(e=>({id:e.id,s:e.source??e.s,t:e.target??e.t,label:e.label,pii:e.piiFlows??e.pii,encrypted:e.encrypted})));
      }
      if (Array.isArray(overPerm) && overPerm.length>0) {
        setOverPermAlerts(overPerm.map(a=>({
          id:a.id, store:a.storeName??a.store, user:a.userId??a.user, role:a.role,
          access:a.accessLevel??a.access, sensitivity:a.sensitivity, lastUsed:a.lastUsed,
          days:a.idleDays??a.days??0, severity:a.severity, status:a.status,
          recommendation:a.recommendation??a.aiRecommendation??"Review access permissions",
        })));
      }
      if (stats && typeof stats.totalStores === "number") setDspmStats(stats);
    });
  }, [viewTenantId]);

  // ── Shadow/DLP/DAM data — from new API endpoints ─────────────────────────────
  const [_shadowStores,     _setShadowStores]     = useState<any[]>([]);
  const [_dlpPolicies,      _setDlpPolicies]      = useState<any[]>([]);
  const [_damEvents,        _setDamEvents]        = useState<any[]>([]);
  const [_encryptionMatrix, _setEncryptionMatrix] = useState<any[]>([]);
  const [_residencyData,    _setResidencyData]    = useState<any[]>([]);
  const [_aiDatasets,       _setAiDatasets]       = useState<any[]>([]);
  const [_anomalies,        _setAnomalies]        = useState<any[]>([]);
  const [_catalog,          _setCatalog]          = useState<any[]>([]);
  const [riskTrend,         setRiskTrend]         = useState<any[]>([]);
  const [typeDistrib,       setTypeDistrib]       = useState<any[]>([]);
  const [accessEvents,      setAccessEvents]      = useState<any[]>([]);
  const [overAccessAlerts,  setOverAccessAlerts]  = useState<any[]>([]);
  const [selectedAccessEvent, setSelectedAccessEvent] = useState<any>(null);
  const [accessFilter,      setAccessFilter]      = useState("All");
  const [accessHeatmap,     setAccessHeatmap]     = useState<any>(null);
  const [heatmapStoreId,    setHeatmapStoreId]    = useState("");

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const H = { Authorization: `Bearer ${tok}` };
    const fetchArr = (url: string, setter: (d: any[]) => void) =>
      fetch(url, { headers: H }).then(r=>r.ok?r.json():[]).then((d:any[])=>Array.isArray(d)&&d.length>0&&setter(d)).catch(()=>{});
    const fetchObj = (url: string, setter: (d: any) => void) =>
      fetch(url, { headers: H }).then(r=>r.ok?r.json():null).then((d:any)=>d&&setter(d)).catch(()=>{});
    fetchArr("/api/dspm/shadow-stores",       _setShadowStores);
    fetchArr("/api/dspm/dlp-policies",        _setDlpPolicies);
    fetchArr("/api/dspm/dam-events",          _setDamEvents);
    fetchArr("/api/dspm/encryption-matrix",   _setEncryptionMatrix);
    fetchArr("/api/dspm/residency",           _setResidencyData);
    fetchArr("/api/dspm/ai-datasets",         _setAiDatasets);
    fetchArr("/api/dspm/anomalies",           _setAnomalies);
    fetchArr("/api/dspm/catalog",             _setCatalog);
    fetchArr("/api/dspm/risk-trend",          setRiskTrend);
    fetchArr("/api/dspm/type-distribution",   setTypeDistrib);
    fetchArr("/api/dspm/access-events",       setAccessEvents);
    fetchArr("/api/dspm/over-access-alerts",  setOverAccessAlerts);
    fetchObj("/api/dspm/access-heatmap",      setAccessHeatmap);
  }, []);

  // Re-fetch heatmap when the per-store filter changes
  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    const url = heatmapStoreId
      ? `/api/dspm/access-heatmap?storeId=${encodeURIComponent(heatmapStoreId)}`
      : "/api/dspm/access-heatmap";
    fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setAccessHeatmap(d))
      .catch(() => {});
  }, [heatmapStoreId]);

  // ── Tab filters & state ─────────────────────────────────────────────────────
  const [selectedStore, setSelectedStore]   = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [selectedLineageNode, setSelectedLineageNode] = useState(null);
  const [showPiiHighlight, setShowPiiHighlight] = useState(false);
  const [findingTypeFilter, setFindingTypeFilter]   = useState("All");
  const [findingStatusFilter, setFindingStatusFilter] = useState("All");
  const [storeCloudFilter, setStoreCloudFilter] = useState("All");
  const [storeRiskFilter, setStoreRiskFilter]   = useState("All");
  const [catalogSearch, setCatalogSearch]     = useState("");
  const [catalogDomain, setCatalogDomain]     = useState("All");
  const [catalogClass, setCatalogClass]       = useState("All");
  const [catalogPage, setCatalogPage]         = useState(0);
  const [storeShowAll, setStoreShowAll]       = useState(false);
  const [findingShowAll, setFindingShowAll]   = useState(false);
  const [damShowAll, setDamShowAll]           = useState(false);
  const [selectedPolicy, setSelectedPolicy]   = useState(null);
  const [selectedCatalogAsset, setSelectedCatalogAsset] = useState(null);
  const [policyEnabled, setPolicyEnabled]     = useState<Record<string,boolean>>({});
  useEffect(() => {
    if (_dlpPolicies.length > 0)
      setPolicyEnabled(Object.fromEntries(_dlpPolicies.map(p=>[p.id, p.status==="active"])));
  }, [_dlpPolicies]);
  const CATALOG_PAGE_SIZE = 25;

  // Derived
  const filteredStores = useMemo(() => {
    let s = dataStores;
    if (storeCloudFilter!=="All") s=s.filter(x=>x.platform===storeCloudFilter);
    if (storeRiskFilter==="Critical") s=s.filter(x=>x.risk>=90);
    else if (storeRiskFilter==="High") s=s.filter(x=>x.risk>=70&&x.risk<90);
    else if (storeRiskFilter==="Unencrypted") s=s.filter(x=>!x.encrypted);
    return s;
  }, [dataStores, storeCloudFilter, storeRiskFilter]);

  const filteredFindings = useMemo(() => {
    let f = clsFindings;
    if (findingTypeFilter!=="All") f=f.filter(x=>x.type===findingTypeFilter);
    if (findingStatusFilter!=="All") f=f.filter(x=>x.status===findingStatusFilter);
    return f;
  }, [clsFindings, findingTypeFilter, findingStatusFilter]);

  const filteredCatalog = useMemo(() => {
    let c = _catalog;
    if (catalogSearch) c=c.filter(x=>x.name.includes(catalogSearch.toLowerCase())||x.domain.toLowerCase().includes(catalogSearch.toLowerCase()));
    if (catalogDomain!=="All") c=c.filter(x=>x.domain===catalogDomain);
    if (catalogClass!=="All") c=c.filter(x=>x.classification.includes(catalogClass));
    return c;
  }, [catalogSearch, catalogDomain, catalogClass]);
  const catalogPage_ = Math.min(catalogPage, Math.floor((filteredCatalog.length-1)/CATALOG_PAGE_SIZE));
  const pagedCatalog = filteredCatalog.slice(catalogPage_*CATALOG_PAGE_SIZE, (catalogPage_+1)*CATALOG_PAGE_SIZE);

  const { nodes:lgNodes, edges:lgEdges } = useMemo(() =>
    buildLineageGraph(selectedLineageNode, showPiiHighlight, lineageNodes, lineageEdges),
    [selectedLineageNode, showPiiHighlight, lineageNodes, lineageEdges]
  );

  // Overview derived stats
  const encryptionGaps = _encryptionMatrix.filter(e=>!e.atRest||!e.inTransit).length;
  const residencyViolations = _residencyData.filter(r=>r.status==="violation").length;

  const TABS = [
    { key:"overview",   label:"Overview",           count:0 },
    { key:"stores",     label:"Data Stores",         count:dataStores.filter(s=>s.risk>=90).length,        dot:RED },
    { key:"heatmap",    label:"Sensitivity Heatmap", count:clsFindings.filter(f=>f.severity==="Critical").length, dot:RED },
    { key:"lineage",    label:"Data Lineage",         count:lineageEdges.filter(e=>!e.encrypted).length,    dot:RED },
    { key:"findings",   label:"Classification",       count:clsFindings.filter(f=>f.status==="open"&&f.severity==="Critical").length, dot:RED },
    { key:"overperm",   label:"Over-Permission",      count:overPermAlerts.filter(a=>a.severity==="Critical"&&a.status!=="resolved").length, dot:RED },
    { key:"shadow",     label:"Shadow Data",          count:_shadowStores.filter(s=>s.risk==="Critical").length, dot:RED },
    { key:"policy",     label:"Policy Engine",        count:_dlpPolicies.filter(p=>p.status==="tuning").length, dot:AMB },
    { key:"dam",        label:"DAM",                  count:_damEvents.filter(e=>e.anomaly&&e.risk==="Critical").length, dot:RED },
    { key:"encryption", label:"Encryption",           count:encryptionGaps, dot:RED },
    { key:"residency",  label:"Data Residency",       count:residencyViolations, dot:RED },
    { key:"aipipeline", label:"AI Pipelines",         count:_aiDatasets.filter(d=>d.shadow||d.status==="gap").length, dot:RED },
    { key:"anomaly",    label:"Anomaly Detection",    count:_anomalies.filter(a=>a.investigationStatus==="open").length, dot:RED },
    { key:"catalog",    label:"Data Catalog",         count:0 },
    { key:"access-analytics", label:"Access Analytics", count:accessEvents.filter(e=>e.anomalous).length, dot:RED },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <ModuleHeader
        title="DataOps — DSPM · DLP · Data Lineage · Encryption · Residency · AI Governance"
        description={`${dataStores.length} stores · ${(totalSensitiveRecords/1e6).toFixed(1)}M sensitive records · ${clsFindings.filter(f=>f.severity==="Critical").length} critical findings · ${_dlpPolicies.length} DLP policies · ${_catalog.length} cataloged assets`}
        badge={{ label:`DSPM Score: ${dspmStats?.score ?? 0}/100`, color:AMB, bg:"rgba(252,211,77,0.08)" }}
        action={{ label:"📋 Export DSPM Report", onClick:()=>{} }}
        secondAction={{ label:"🤖 AI Data Risk Brief", onClick:()=>{} }}
      />
      <SubNav tabs={TABS} active={tab} onSelect={setTab} />
      <AICopilotBar module="dataops" />
      <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab==="overview" && (
          <>
            {/* Top KPI row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12}}>
              <KpiCard label="Data Stores"           value={String(dspmStats?.totalStores ?? dataStores.length)}                                                                                sub="Registered + scanning"        color={NAV} icon="🗄" onClick={()=>setTab("stores")} />
              <KpiCard label="Sensitive Data Volume"  value={dspmStats ? `${(dspmStats.totalSensitiveFiles/1e6).toFixed(1)}M` : `${(totalSensitiveRecords/1e6).toFixed(1)}M`}                     sub="Est. sensitive records"       color={RED} icon="🔍" alert onClick={()=>setTab("heatmap")} />
              <KpiCard label="Policy Violations"      value={String(dspmStats?.openFindings ?? clsFindings.filter(f=>f.status==="open").length)}                                                   sub="Active DLP violations"        color={RED} icon="⚠" alert onClick={()=>setTab("policy")} />
              <KpiCard label="Encryption Gaps"        value={encryptionGaps} sub="At-rest or in-transit unenc" color={RED} icon="🔓" alert onClick={()=>setTab("encryption")} />
              <KpiCard label="Anomalies (7d)"         value={String(dspmStats?.unscannedStores ?? _anomalies.length)}                                                                              sub="ML-detected behavioural"      color={AMB} icon="🚨" onClick={()=>setTab("anomaly")} />
              <KpiCard label="Shadow Data Stores"     value={_shadowStores.length} sub="Unmanaged discovered"  color={RED} icon="👻" alert onClick={()=>setTab("shadow")} />
            </div>

            {/* Risk trend + donut + top-5 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 240px 320px",gap:16}}>
              {/* 12-week risk trend sparkline */}
              <div style={card({padding:"16px 20px"})}>
                <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:12}}>📈 DSPM Risk Score Trend — 12 Weeks</div>
                <svg viewBox="0 0 520 100" style={{width:"100%",height:100}}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NAV} stopOpacity="0.3"/>
                      <stop offset="100%" stopColor={NAV} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[20,40,60,80,100].map(y=>(
                    <line key={y} x1={30} x2={510} y1={100-y} y2={100-y} stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
                  ))}
                  {/* Y axis labels */}
                  {[20,40,60,80,100].map(y=>(
                    <text key={y} x={26} y={104-y} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={7}>{y}</text>
                  ))}
                  {/* Area */}
                  {riskTrend.length > 0 && <polyline
                    points={riskTrend.map((p,i)=>`${40+i*43},${100-p.score}`).join(" ")}
                    fill="none" stroke={NAV} strokeWidth={2.5} strokeLinejoin="round"/>}
                  {/* Dots */}
                  {riskTrend.map((p,i)=>(
                    <g key={p.week}>
                      <circle cx={40+i*43} cy={100-p.score} r={3.5} fill={NAV}/>
                      <text x={40+i*43} y={114} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={7}>{p.week}</text>
                    </g>
                  ))}
                  {/* Current score annotation */}
                  {riskTrend.length > 0 && <text x={40+(riskTrend.length-1)*43} y={100-riskTrend[riskTrend.length-1].score-10} textAnchor="middle" fill={EME} fontSize={9} fontWeight="800">{riskTrend[riskTrend.length-1].score} ↑</text>}
                </svg>
                <div style={{marginTop:8,display:"flex",gap:16,flexWrap:"wrap"}}>
                  {(()=>{
                    const last = riskTrend.length>0 ? riskTrend[riskTrend.length-1].score : 0;
                    const first = riskTrend.length>0 ? riskTrend[0].score : 0;
                    const peak = riskTrend.length>0 ? Math.max(...riskTrend.map(p=>p.score)) : 0;
                    const peakWeek = riskTrend.length>0 ? riskTrend.reduce((a,b)=>a.score>b.score?a:b,{score:-Infinity,week:""}).week : "";
                    const avg = riskTrend.length>0 ? Math.round(riskTrend.reduce((s,p)=>s+p.score,0)/riskTrend.length) : 0;
                    return [["Trend",riskTrend.length>0?`↑ +${last-first} pts (${riskTrend.length} wks)`:"-",EME],["Peak",peak?`${peak} (${peakWeek})`:"-",NAV],["Avg",avg||"-",AMB],["Critical Stores",dataStores.filter(s=>s.risk>=90).length,RED]];
                  })().map(([l,v,c])=>(
                    <div key={String(l)} style={{textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Data type donut */}
              <div style={card({padding:"16px 20px",display:"flex",flexDirection:"column",alignItems:"center"})}>
                <div style={{fontSize:10,fontWeight:800,color:NAV,marginBottom:8}}>DATA TYPE DISTRIBUTION</div>
                <svg viewBox="0 0 120 120" width={120} height={120}>
                  {(()=>{
                    const TYPE_COLORS: Record<string,string> = {PII:RED,Financial:AMB,PCI:PRP,PHI:"#F472B6",Credentials:CYN,Biometric:BLU,Legal:EME};
                    const slices = typeDistrib.map((d:any)=>({...d, color: TYPE_COLORS[d.label]??NAV}));
                    let cumPct=0;
                    return slices.map(sl=>{
                      const startAngle=cumPct/100*2*Math.PI-Math.PI/2;
                      cumPct+=sl.pct;
                      const endAngle=cumPct/100*2*Math.PI-Math.PI/2;
                      const r=50,cx=60,cy=60;
                      const x1=cx+r*Math.cos(startAngle),y1=cy+r*Math.sin(startAngle);
                      const x2=cx+r*Math.cos(endAngle),  y2=cy+r*Math.sin(endAngle);
                      const large=sl.pct>50?1:0;
                      return <path key={sl.label} d={`M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`} fill={sl.color} opacity={0.85}/>;
                    });
                  })()}
                  <circle cx={60} cy={60} r={28} fill="var(--card)"/>
                  <text x={60} y={57} textAnchor="middle" fill={NAV} fontSize={11} fontWeight="800">{typeDistrib.length > 0 ? typeDistrib.reduce((s:number,d:any)=>s+d.pct,0)+"%" : "—"}</text>
                  <text x={60} y={68} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7}>{typeDistrib.length > 0 ? "coverage" : "no data"}</text>
                </svg>
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3,width:"100%"}}>
                  {typeDistrib.length === 0 ? (
                    <div style={{textAlign:"center",fontSize:9,color:"rgba(148,163,184,0.6)",padding:"8px 0"}}>No distribution data</div>
                  ) : typeDistrib.map((d:any)=>{
                    const TYPE_COLORS_LEG: Record<string,string> = {PII:RED,Financial:AMB,PCI:PRP,PHI:"#F472B6",Credentials:CYN,Biometric:BLU,Legal:EME};
                    const c = TYPE_COLORS_LEG[d.label] ?? NAV;
                    return (
                      <div key={d.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <div style={{width:7,height:7,borderRadius:2,background:c}}/>
                          <span style={{fontSize:9,color:"var(--foreground)"}}>{d.label}</span>
                        </div>
                        <span style={{fontSize:9,fontWeight:800,color:c,fontFamily:"monospace"}}>{d.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Top 5 at-risk stores */}
              <div style={card({padding:"16px 20px"})}>
                <div style={{fontSize:10,fontWeight:800,color:RED,marginBottom:10}}>🔴 TOP 5 AT-RISK STORES</div>
                {[...dataStores].sort((a,b)=>b.risk-a.risk).slice(0,5).map((s,i)=>(
                  <div key={s.id} onClick={()=>{setTab("stores");setSelectedStore(s);}}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)",cursor:"pointer"}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:riskBg(s.risk),color:riskClr(s.risk),display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:NAV,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{s.type} · {s.platform} · {s.region}</div>
                    </div>
                    <RiskBar value={s.risk}/>
                  </div>
                ))}
                <button onClick={()=>setTab("stores")} style={{marginTop:10,width:"100%",padding:"6px 0",borderRadius:6,background:"transparent",border:`1px solid ${NAV}33`,color:NAV,fontSize:10,fontWeight:700,cursor:"pointer"}}>View All {dataStores.length} Stores →</button>
              </div>
            </div>

            {/* AI insights */}
            <div style={card({padding:"14px 18px"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:10}}>🤖 AI Data Security Insights</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  { icon:"🚨",color:RED,title:"Critical: Unencrypted PHI Training Data",body:`${_dataStores.filter(s=>!s.encrypted&&s.classifications.includes("PHI")).length} stores contain unencrypted PHI used in ML training pipelines. HIPAA §164.312(a)(2)(iv) requires encryption. Immediate remediation required.`,tab:"encryption" },
                  { icon:"⚠️",color:AMB,title:`Shadow Data: ${_shadowStores.length} Unmanaged Stores Found`,body:`Agentless API scan discovered ${_shadowStores.length} unmanaged data stores across AWS, Azure, GCP, and SaaS. ${_shadowStores.filter(s=>s.risk==="Critical").length} are classified Critical risk. Register or delete within 72 hours.`,tab:"shadow" },
                  { icon:"🔍",color:CYN,title:`Former Employee Access: ${overPermAlerts.length} Active Accounts`,body:`${overPermAlerts.length} offboarded employees still have active database credentials. Identity federation deprovision failure detected. Emergency access revocation recommended.`,tab:"overperm" },
                ].map(ins=>(
                  <div key={ins.title} onClick={()=>setTab(ins.tab)} style={{padding:"12px 14px",borderRadius:8,background:`${ins.color}08`,border:`1px solid ${ins.color}22`,cursor:"pointer"}}>
                    <div style={{fontSize:10,fontWeight:800,color:ins.color,marginBottom:6}}>{ins.icon} {ins.title}</div>
                    <div style={{fontSize:10,color:"var(--foreground)",lineHeight:1.5}}>{ins.body}</div>
                    <div style={{marginTop:8,fontSize:10,color:ins.color,fontWeight:700}}>Investigate →</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Module stats grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              <KpiCard label="Critical Findings"    value={clsFindings.filter(f=>f.severity==="Critical").length} sub="Need immediate action" color={RED} icon="🔴" alert />
              <KpiCard label="DLP Policy Hits (24h)" value="847"                                                  sub="Across 32 active policies"color={AMB} icon="🛡" />
              <KpiCard label="Data Residency Issues" value={residencyViolations}                                   sub="Cross-border violations"  color={RED} icon="🌍" alert />
              <KpiCard label="Cataloged Assets"      value={_catalog.length.toLocaleString()}                     sub="Searchable data assets"   color={EME} icon="📚" />
            </div>
          </>
        )}

        {/* ── DATA STORES ──────────────────────────────────────────────────── */}
        {tab==="stores" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Total Stores"    value={dataStores.length}                                           sub="All platforms"           color={NAV} icon="🗄" />
              <KpiCard label="Critical Risk"   value={dataStores.filter(s=>s.risk>=90).length}                    sub="Risk score ≥ 90"          color={RED} icon="🔴" alert />
              <KpiCard label="Unencrypted"     value={dataStores.filter(s=>!s.encrypted).length}                   sub="At-rest encryption missing"color={RED} icon="🔓" alert />
              <KpiCard label="Publicly Accessible" value={dataStores.filter(s=>s.public).length}                  sub="Public endpoints"         color={RED} icon="⚠" alert />
              <KpiCard label="Stale Scans"     value={dataStores.filter(s=>s.scanStatus==="stale").length}         sub="> 7 days since scan"      color={AMB} icon="⏰" />
            </div>
            {/* Filters */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,fontWeight:700,color:"var(--muted-foreground)"}}>CLOUD:</span>
              {["All","AWS","Azure","GCP","Snowflake","SaaS","OnPrem"].map(f=>(
                <button key={f} onClick={()=>setStoreCloudFilter(f)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid",fontSize:10,fontWeight:700,cursor:"pointer",background:storeCloudFilter===f?NAV:"transparent",color:storeCloudFilter===f?"#000":"var(--muted-foreground)",borderColor:storeCloudFilter===f?NAV:"var(--border)"}}>{f}</button>
              ))}
              <span style={{borderLeft:"1px solid var(--border)",height:18}}/>
              <span style={{fontSize:10,fontWeight:700,color:"var(--muted-foreground)"}}>RISK:</span>
              {["All","Critical","High","Unencrypted"].map(f=>(
                <button key={f} onClick={()=>setStoreRiskFilter(f)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid",fontSize:10,fontWeight:700,cursor:"pointer",background:storeRiskFilter===f?RED:"transparent",color:storeRiskFilter===f?"#000":"var(--muted-foreground)",borderColor:storeRiskFilter===f?RED:"var(--border)"}}>{f}</button>
              ))}
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--muted-foreground)"}}>{filteredStores.length} stores</span>
            </div>
            <div style={{display:"flex",gap:16}}>
              <div style={{flex:1}}>
                <TableShell
                  cols={["ID","Store","Type","Platform","Region","Sensitive Records","Enc","Public","Risk Score","Status"]}
                  rows={(storeShowAll?filteredStores:filteredStores.slice(0,40)).map(s=>[
                    <Mono>{s.id}</Mono>,
                    <div>
                      <div style={{fontWeight:700,color:NAV,fontSize:11}}>{s.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{s.env} · {s.owner}</div>
                    </div>,
                    <Chip label={s.type} color={BLU}/>,
                    <span style={{fontSize:10}}>{platformIcon[s.platform]||"⬡"} {s.platform}</span>,
                    <Mono style={{fontSize:9}}>{s.region}</Mono>,
                    <span style={{fontWeight:800,color:s.sensitive>0?RED:"var(--muted-foreground)",fontSize:11,fontFamily:"monospace"}}>{s.sensitive.toLocaleString()}</span>,
                    s.encrypted?<span style={{color:EME,fontWeight:700}}>✓</span>:<span style={{color:RED,fontWeight:700}}>✗</span>,
                    s.public?<span style={{color:RED,fontWeight:700}}>⚠</span>:<span style={{color:"var(--muted-foreground)"}}>—</span>,
                    <RiskBar value={s.risk}/>,
                    <Badge label={s.scanStatus}/>,
                  ])}
                  onRowClick={i=>{const s=(storeShowAll?filteredStores:filteredStores.slice(0,40))[i];setSelectedStore(s===selectedStore?null:s);}}
                />
                {filteredStores.length > 40 && (
                  <div style={{textAlign:"center",marginTop:8}}>
                    <button onClick={()=>setStoreShowAll(v=>!v)} style={{padding:"6px 18px",borderRadius:6,border:`1px solid ${NAV}44`,background:`${NAV}12`,color:NAV,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                      {storeShowAll?`▲ Show Top 40`:`▼ Show All ${filteredStores.length} Stores`}
                    </button>
                  </div>
                )}
              </div>
              {selectedStore && (
                <div style={{width:300,flexShrink:0,...card({padding:0,height:"fit-content",overflow:"hidden"})}}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,color:NAV}}>{selectedStore.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{selectedStore.type} · {selectedStore.platform}</div>
                    </div>
                    <button onClick={()=>setSelectedStore(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--muted-foreground)"}}>×</button>
                  </div>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    {[["Owner",selectedStore.owner],["Region",selectedStore.region],["Environment",selectedStore.env],["Total Records",selectedStore.total.toLocaleString()],["Sensitive Records",selectedStore.sensitive.toLocaleString()],["Last Scan",selectedStore.lastScan],["Scan Status",selectedStore.scanStatus]].map(([k,v])=>(
                      <div key={String(k)} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:11}}>
                        <span style={{color:"var(--muted-foreground)"}}>{k}</span>
                        <span style={{fontWeight:700,color:String(k)==="Sensitive Records"&&selectedStore.sensitive>0?RED:NAV}}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>SECURITY STATUS</div>
                    {[["Encrypted at Rest",selectedStore.encrypted?"✓ Yes":"✗ No",!selectedStore.encrypted],
                      ["Publicly Accessible",selectedStore.public?"⚠ Yes":"No",selectedStore.public],
                      ["Risk Score",`${selectedStore.risk}/100`,selectedStore.risk>=80]].map(([k,v,warn])=>(
                      <div key={String(k)} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:11}}>
                        <span style={{color:"var(--muted-foreground)"}}>{String(k)}</span>
                        <span style={{fontWeight:700,color:warn?RED:EME}}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>DATA CLASSIFICATIONS</div>
                    {selectedStore.classifications.length>0
                      ?<div style={{display:"flex",flexWrap:"wrap",gap:4}}>{selectedStore.classifications.map(c=><Chip key={c} label={c} color={RED}/>)}</div>
                      :<div style={{fontSize:10,color:"var(--muted-foreground)"}}>No scan data — dark data risk</div>
                    }
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:AMB,marginBottom:6}}>🤖 AI RECOMMENDATION</div>
                    <div style={{fontSize:10,color:"var(--foreground)",lineHeight:1.5}}>
                      {!selectedStore.encrypted?"Enable encryption at rest immediately. Sensitive records are exposed. Apply AWS KMS/Azure KV key policy and rotate existing credentials.":
                       selectedStore.public?"Remove public access policy. Apply bucket ACL/RBAC restriction. Enable VPC endpoint if cross-account access needed.":
                       selectedStore.risk>=90?"Critical risk score. Review IAM permissions, enable CloudTrail, apply SCPs. Consider data masking for test environments.":
                       "Store is within acceptable risk parameters. Maintain quarterly access reviews and ensure encryption key rotation policy is active."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── SENSITIVITY HEATMAP ───────────────────────────────────────────── */}
        {tab==="heatmap" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              <KpiCard label="Sensitive Records"  value={(totalSensitiveRecords/1e6).toFixed(1)+"M"} sub="Across all stores" color={RED} icon="🔍" alert />
              <KpiCard label="PII Records"        value={clsFindings.filter(f=>f.type==="PII").reduce((s,f)=>s+f.records,0).toLocaleString()} sub="Personal data"  color={RED} icon="👤" />
              <KpiCard label="Health / PHI"       value={clsFindings.filter(f=>f.type==="PHI").reduce((s,f)=>s+f.records,0).toLocaleString()} sub="Medical data"   color={PNK} icon="🏥" />
              <KpiCard label="Credentials"        value={clsFindings.filter(f=>f.type==="Credentials").reduce((s,f)=>s+f.records,0).toLocaleString()} sub="Secrets exposed" color={AMB} icon="🔑" />
            </div>
            <div style={card({padding:24,overflowX:"auto"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:16}}>SENSITIVITY HEATMAP — Records by Store × Data Type</div>
              <div style={{marginBottom:12,display:"flex",gap:12}}>
                {[["None","var(--card)"],["< 1K",AMB],["1K–50K",RED],["50K+","rgba(127,29,29,0.85)"]].map(([l,c])=>(
                  <div key={String(l)} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:12,height:12,borderRadius:3,background:String(c)}}/>
                    <span style={{fontSize:10,color:"var(--muted-foreground)"}}>{l}</span>
                  </div>
                ))}
              </div>
              <table style={{borderCollapse:"collapse",width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"var(--muted-foreground)",minWidth:200}}>Data Store</th>
                    {HEAT_TYPES.map(t=><th key={t} style={{padding:"8px 12px",textAlign:"center",fontSize:10,fontWeight:700,color:"var(--foreground)",minWidth:80}}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {heatmapGrid.map(row=>(
                    <tr key={row.store}>
                      <td style={{padding:"7px 12px",fontWeight:700,color:NAV,fontSize:11,borderRight:"2px solid rgba(255,255,255,0.1)",whiteSpace:"nowrap"}}>
                        <div>{row.store}</div>
                        <div style={{fontSize:9,color:"var(--muted-foreground)",fontWeight:400}}>{row.platform}</div>
                      </td>
                      {HEAT_TYPES.map(t=>{
                        const val=(row)[t]??0;
                        const {bg,color}=heatColor(val);
                        return (
                          <td key={t} style={{padding:"7px 12px",textAlign:"center",background:bg,border:"1px solid var(--border)"}}>
                            <span style={{fontSize:10,fontWeight:700,color}}>{val>0?val.toLocaleString():"—"}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card({padding:16,background:"rgba(248,113,113,0.06)",borderColor:RED})}>
              <div style={{fontSize:10,fontWeight:800,color:RED,marginBottom:8}}>⚠ HIGHEST RISK CONCENTRATIONS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {clsFindings.filter(f=>f.severity==="Critical").slice(0,4).map(f=>(
                  <div key={f.id} style={card({padding:"10px 12px"})}>
                    <div style={{fontSize:8,fontWeight:800,color:RED,marginBottom:3}}>CRITICAL · {f.type}</div>
                    <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:2}}>{f.subType}</div>
                    <div style={{fontSize:9,color:"var(--muted-foreground)",marginBottom:3}}>{f.store}</div>
                    <div style={{fontSize:12,fontWeight:800,color:RED,fontFamily:"monospace"}}>{f.records.toLocaleString()} records</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── DATA LINEAGE ─────────────────────────────────────────────────── */}
        {tab==="lineage" && (
          !isSubModuleLicensed("dataops","data.lineage") ? <LockedModule moduleKey="datalineage" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Pipeline Nodes"    value={lineageNodes.length}                              sub="Sources, pipelines, destinations" color={NAV} icon="⬡" />
              <KpiCard label="Data Flows"         value={lineageEdges.length}                             sub="Total lineage edges"              color={BLU} icon="→" />
              <KpiCard label="PII Flows"          value={lineageEdges.filter(e=>e.pii).length}           sub="Personal data in transit"         color={AMB} icon="👤" />
              <KpiCard label="Unencrypted Flows"  value={lineageEdges.filter(e=>!e.encrypted).length}    sub="High-risk transfers"              color={RED} icon="⚠" alert />
              <KpiCard label="ML Pipelines"       value={lineageNodes.filter(n=>n.type==="pipeline").length} sub="Active data pipelines"         color={PRP} icon="🤖" />
            </div>
            <div style={card({padding:"10px 16px",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"})}>
              <span style={{fontSize:10,fontWeight:800,color:NAV}}>LEGEND</span>
              {[["Source",BLU],["Pipeline",PRP],["Transform",EME],["Destination",RED],["API/Sink",AMB]].map(([l,c])=>(
                <div key={String(l)} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:10,height:10,borderRadius:2,background:c}}/>
                  <span style={{fontSize:10,color:"var(--foreground)"}}>{l}</span>
                </div>
              ))}
              <span style={{borderLeft:"1px solid var(--border)",height:16}}/>
              {[["Unencrypted",RED],["PII Flow",AMB],["Safe",EME]].map(([l,c])=>(
                <div key={String(l)} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:20,height:2,background:c}}/>
                  <span style={{fontSize:10,color:"var(--foreground)"}}>{l}</span>
                </div>
              ))}
              <button onClick={()=>setShowPiiHighlight(v=>!v)} style={{marginLeft:"auto",padding:"5px 12px",borderRadius:6,border:`1px solid ${showPiiHighlight?RED:"var(--border)"}`,background:showPiiHighlight?`${RED}18`:"transparent",color:showPiiHighlight?RED:"var(--muted-foreground)",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                {showPiiHighlight?"🔴 PII Highlight ON":"👁 Highlight PII Flows"}
              </button>
            </div>
            <div style={{height:580,borderRadius:12,overflow:"hidden",border:"1px solid var(--border)"}}>
              <ReactFlow nodes={lgNodes} edges={lgEdges} fitView
                onNodeClick={(_e,n)=>setSelectedLineageNode(selectedLineageNode===n.id?null:n.id)}
                proOptions={{hideAttribution:true}} style={{background:"var(--card)"}}>
                <Background gap={24} size={1} color="rgba(255,255,255,0.1)"/>
                <Controls/>
                <MiniMap nodeColor={n=>{const nd=lineageNodes.find(x=>x.id===n.id);return sensitivityColor[nd?.sensitivity??"Internal"]?.color??NAV;}} style={{background:"var(--card)",border:"1px solid var(--border)"}}/>
              </ReactFlow>
            </div>
            {selectedLineageNode && (()=>{
              const nd=lineageNodes.find(n=>n.id===selectedLineageNode);
              if (!nd) return null;
              const connected=lineageEdges.filter(e=>e.s===nd.id||e.t===nd.id);
              return (
                <div style={card({padding:16})}>
                  <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:800,color:NAV,marginBottom:4}}>{nd.label.replace("\n"," — ")}</div>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <Chip label={nd.type?.toUpperCase()} color={typeBorder[nd.type]??NAV}/>
                        <Chip label={nd.sensitivity} color={(sensitivityColor[nd.sensitivity]?.color??BLU)}/>
                        <Chip label={nd.platform} color={CYN}/>
                      </div>
                      <div style={{fontSize:10,color:"var(--muted-foreground)"}}>{connected.length} connections · Types: {nd.dataTypes?.join(", ")}</div>
                    </div>
                    <div style={{display:"flex",gap:20}}>
                      <div>
                        <div style={{fontSize:9,fontWeight:800,color:EME,marginBottom:5}}>INCOMING</div>
                        {connected.filter(e=>e.t===nd.id).map(e=>{const src=lineageNodes.find(n=>n.id===e.s);return <div key={e.id} style={{fontSize:10,color:"var(--foreground)",marginBottom:3}}>← {src?.label.split("\n")[0]}</div>;})}
                        {!connected.filter(e=>e.t===nd.id).length && <div style={{fontSize:10,color:"var(--muted-foreground)"}}>Source node</div>}
                      </div>
                      <div>
                        <div style={{fontSize:9,fontWeight:800,color:RED,marginBottom:5}}>OUTGOING</div>
                        {connected.filter(e=>e.s===nd.id).map(e=>{const dst=lineageNodes.find(n=>n.id===e.t);const warn=!e.encrypted?"⚠ ":"";return <div key={e.id} style={{fontSize:10,color:!e.encrypted?RED:"var(--foreground)",marginBottom:3}}>{warn}→ {dst?.label.split("\n")[0]}</div>;})}
                        {!connected.filter(e=>e.s===nd.id).length && <div style={{fontSize:10,color:"var(--muted-foreground)"}}>Sink node</div>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── CLASSIFICATION FINDINGS ───────────────────────────────────────── */}
        {tab==="findings" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Total Findings"    value={clsFindings.length}                                              sub="Across all stores"       color={NAV} icon="🔍" />
              <KpiCard label="Critical"          value={clsFindings.filter(f=>f.severity==="Critical").length}           sub="Immediate action"         color={RED} icon="🔴" alert />
              <KpiCard label="Total Records"     value={(totalSensitiveRecords/1e6).toFixed(1)+"M"}                     sub="Sensitive records found"  color={RED} icon="📊" />
              <KpiCard label="Unencrypted"       value={clsFindings.filter(f=>!f.encrypted).length}                     sub="Not encrypted at rest"    color={RED} icon="🔓" alert />
              <KpiCard label="SLA Overdue"       value={clsFindings.filter(f=>f.sladays<=0&&f.status==="open").length}  sub="Remediation past deadline"color={RED} icon="⏰" alert />
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,fontWeight:700,color:"var(--muted-foreground)"}}>TYPE:</span>
              {["All","PII","PHI","PCI","Credentials","Biometric","Financial","Legal","HR"].map(t=>(
                <button key={t} onClick={()=>setFindingTypeFilter(t)} style={{padding:"4px 9px",borderRadius:6,border:"1px solid",fontSize:10,fontWeight:700,cursor:"pointer",background:findingTypeFilter===t?RED:"transparent",color:findingTypeFilter===t?"#000":"var(--muted-foreground)",borderColor:findingTypeFilter===t?RED:"var(--border)"}}>{t}</button>
              ))}
              <span style={{borderLeft:"1px solid var(--border)",height:18}}/>
              {["All","open","in-progress","resolved"].map(s=>(
                <button key={s} onClick={()=>setFindingStatusFilter(s)} style={{padding:"4px 9px",borderRadius:6,border:"1px solid",fontSize:10,fontWeight:700,cursor:"pointer",background:findingStatusFilter===s?NAV:"transparent",color:findingStatusFilter===s?"#000":"var(--muted-foreground)",borderColor:findingStatusFilter===s?NAV:"var(--border)",textTransform:"capitalize"}}>{s}</button>
              ))}
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--muted-foreground)"}}>{filteredFindings.length} findings</span>
            </div>
            <TableShell
              cols={["ID","Store","Type","Sub-Type","Records","SLA","Enc","Masked","Regulatory","Severity","Status"]}
              rows={(findingShowAll?filteredFindings:filteredFindings.slice(0,50)).map(f=>[
                <Mono>{f.id}</Mono>,
                <span style={{fontWeight:700,color:NAV,fontSize:11}}>{f.store}</span>,
                <Chip label={f.type} color={RED}/>,
                <span style={{fontSize:10}}>{f.subType}</span>,
                <span style={{fontWeight:800,color:RED,fontFamily:"monospace",fontSize:11}}>{f.records>0?f.records.toLocaleString():"Stream"}</span>,
                <span style={{fontSize:10,fontWeight:700,color:f.sladays<=0?RED:f.sladays<=2?AMB:EME}}>{f.sladays<=0?"⚠ Overdue":`${f.sladays}d`}</span>,
                f.encrypted?<span style={{color:EME,fontWeight:700}}>✓</span>:<span style={{color:RED,fontWeight:700}}>✗</span>,
                f.masked?<span style={{color:EME,fontWeight:700}}>✓</span>:<span style={{color:AMB,fontWeight:700}}>✗</span>,
                <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{f.regulatory.slice(0,2).map(r=><Chip key={r} label={r} color={BLU}/>)}</div>,
                <SevBadge label={f.severity}/>,
                <Badge label={f.status}/>,
              ])}
              bulkActions={[
                {label:"Bulk Suppress",icon:"⊘",danger:false,onClick:()=>{}},
                {label:"Assign",icon:"→",danger:false,onClick:()=>{}},
                {label:"Export",icon:"↓",danger:false,onClick:()=>{}},
              ]}
            />
            {filteredFindings.length > 50 && (
              <div style={{textAlign:"center",marginTop:8}}>
                <button onClick={()=>setFindingShowAll(v=>!v)} style={{padding:"6px 18px",borderRadius:6,border:`1px solid ${NAV}44`,background:`${NAV}12`,color:NAV,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {findingShowAll?`▲ Show Top 50`:`▼ Show All ${filteredFindings.length} Findings`}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── OVER-PERMISSION ALERTS ────────────────────────────────────────── */}
        {tab==="overperm" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Total Alerts"     value={overPermAlerts.length}                                               sub="Over-privileged access"     color={NAV} icon="👁" />
              <KpiCard label="Critical"         value={overPermAlerts.filter(a=>a.severity==="Critical").length}             sub="Immediate revocation"        color={RED} icon="🔴" alert />
              <KpiCard label="Former Employees" value={overPermAlerts.filter(a=>a.role==="Former Employee").length}          sub="Active offboarded accounts"  color={RED} icon="🚪" alert />
              <KpiCard label="Contractors"      value={overPermAlerts.filter(a=>(a.role||"").includes("Contractor")||(a.role||"").includes("External")).length} sub="Third-party access" color={AMB} icon="🤝" />
              <KpiCard label="Idle > 90 days"   value={overPermAlerts.filter(a=>a.days>90).length}                          sub="Unused stale access"         color={AMB} icon="🕸" />
            </div>
            <TableShell
              cols={["ID","Store","User","Role","Access Level","Sensitivity","Last Used","Idle Days","Severity","Status","Action"]}
              rows={overPermAlerts.map(a=>[
                <Mono>{a.id}</Mono>,
                <span style={{fontSize:10,fontWeight:700,color:NAV}}>{a.store}</span>,
                <span style={{fontSize:10}}>{a.user}</span>,
                <Chip label={a.role} color={PRP}/>,
                <Chip label={a.access} color={a.access==="Admin"?RED:a.access==="Read/Write"?AMB:BLU}/>,
                <Chip label={a.sensitivity} color={a.sensitivity==="Restricted"?RED:a.sensitivity==="Confidential"?AMB:BLU}/>,
                <Mono style={{fontSize:9}}>{a.lastUsed}</Mono>,
                <span style={{fontWeight:800,color:a.days>90?RED:a.days>30?AMB:EME,fontFamily:"monospace",fontSize:11}}>{a.days}d</span>,
                <SevBadge label={a.severity}/>,
                <Badge label={a.status}/>,
                <button onClick={e=>{e.stopPropagation();}} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${RED}55`,background:`${RED}12`,color:RED,fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Create Ticket</button>,
              ])}
              bulkActions={[
                {label:"Bulk Revoke",icon:"⊘",danger:true,onClick:()=>{}},
                {label:"Assign Review",icon:"→",danger:false,onClick:()=>{}},
              ]}
            />
          </>
        )}

        {/* ── SHADOW DATA DISCOVERY ─────────────────────────────────────────── */}
        {tab==="shadow" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Shadow Stores Found"   value={_shadowStores.length}                                             sub="Unmanaged data discovered"    color={RED} icon="👻" alert />
              <KpiCard label="Critical Risk"         value={_shadowStores.filter(s=>s.risk==="Critical").length}              sub="Immediate action required"    color={RED} icon="🔴" alert />
              <KpiCard label="Unencrypted"           value={_shadowStores.filter(s=>["github-data-dump","localhost-mongo-legacy","jupyter-notebook-server"].includes(s.name)).length} sub="No encryption detected" color={RED} icon="🔓" alert />
              <KpiCard label="Public / Internet-facing" value={_shadowStores.filter(s=>s.action==="Quarantine").length}      sub="Quarantine recommended"       color={RED} icon="⚠" />
              <KpiCard label="Scan Coverage"         value="71%"                                                              sub="Cloud accounts fully scanned" color={AMB} icon="🔍" />
            </div>
            {/* Scan coverage gauge */}
            <div style={card({padding:"14px 18px"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:8}}>📡 Scan Coverage by Cloud — Agentless API + Network Fingerprint + DLP Endpoint</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12}}>
                {[["AWS","84%",EME],["Azure","79%",BLU],["GCP","91%",NAV],["Snowflake","62%",CYN],["SaaS","48%",AMB],["OnPrem","38%",RED]].map(([cloud,pct,color])=>(
                  <div key={cloud} style={card({padding:"12px 14px",textAlign:"center"})}>
                    <div style={{fontSize:11,fontWeight:800,color,marginBottom:6}}>{cloud}</div>
                    <div style={{width:"100%",height:6,borderRadius:3,background:"rgba(255,255,255,0.08)",overflow:"hidden",marginBottom:6}}>
                      <div style={{width:pct,height:"100%",background:color,borderRadius:3}}/>
                    </div>
                    <div style={{fontSize:14,fontWeight:900,color,fontFamily:"monospace"}}>{pct}</div>
                    <div style={{fontSize:8,color:"var(--muted-foreground)"}}>accounts scanned</div>
                  </div>
                ))}
              </div>
            </div>
            <TableShell
              cols={["ID","Store Name","Discovery Method","Cloud","Region","Owner","Est. Sensitivity","Est. Size","Days Unmanaged","Recommended Action","Risk"]}
              rows={_shadowStores.map(s=>[
                <Mono>{s.id}</Mono>,
                <div>
                  <div style={{fontWeight:700,color:NAV,fontSize:11}}>{s.name}</div>
                  <div style={{fontSize:9,color:"var(--muted-foreground)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.reason}</div>
                </div>,
                <Chip label={s.method} color={BLU}/>,
                <span style={{fontSize:10}}>{platformIcon[s.cloud]||"⬡"} {s.cloud}</span>,
                <Mono style={{fontSize:9}}>{s.region}</Mono>,
                <span style={{fontSize:10}}>{s.owner}</span>,
                <Chip label={s.estSensitivity} color={s.estSensitivity==="Critical"?RED:s.estSensitivity==="High"?AMB:BLU}/>,
                <Mono style={{fontSize:9}}>{s.estSize}</Mono>,
                <span style={{fontWeight:800,fontFamily:"monospace",fontSize:11,color:s.daysUnmanaged>180?RED:s.daysUnmanaged>60?AMB:EME}}>{s.daysUnmanaged}d</span>,
                <div style={{display:"flex",gap:4}}>
                  <Chip label={s.action} color={s.action==="Quarantine"||s.action==="Delete"?RED:s.action==="Register"?EME:AMB}/>
                </div>,
                <SevBadge label={s.risk==="Critical"?"Critical":s.risk==="High"?"High":"Medium"}/>,
              ])}
              bulkActions={[
                {label:"Register Assets",icon:"✓",danger:false,onClick:()=>{}},
                {label:"Schedule Deletion",icon:"✕",danger:true,onClick:()=>{}},
                {label:"Quarantine",icon:"⊘",danger:true,onClick:()=>{}},
              ]}
            />
          </>
        )}

        {/* ── POLICY ENGINE (DLP) ───────────────────────────────────────────── */}
        {tab==="policy" && (
          !isSubModuleLicensed("dataops","data.dlp") ? <LockedModule moduleKey="dlp" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="DLP Policies"      value={_dlpPolicies.length}                                     sub="Active rules"              color={NAV} icon="🛡" />
              <KpiCard label="Active"            value={_dlpPolicies.filter(p=>p.status==="active").length}     sub="Enforcing"                 color={EME} icon="✓" />
              <KpiCard label="Tuning Required"   value={_dlpPolicies.filter(p=>p.status==="tuning").length}     sub="High false-positive rate"  color={AMB} icon="⚙" />
              <KpiCard label="Block Actions"     value={_dlpPolicies.filter(p=>p.action.includes("Block")).length} sub="Hard block policies"    color={RED} icon="⊘" alert />
              <KpiCard label="Policy Hits (24h)" value="847"                                                     sub="Triggered events today"   color={RED} icon="⚡" alert />
            </div>
            {/* Hit trend sparkline */}
            <div style={card({padding:"14px 18px"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:8}}>📊 Top Policy Hit Rate — Last 30 Days</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {_dlpPolicies.slice(0,8).map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:10,fontWeight:700,color:NAV,minWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                    <div style={{flex:1,height:14,borderRadius:7,background:"rgba(255,255,255,0.06)",overflow:"hidden",position:"relative"}}>
                      <div style={{width:`${Math.min(100,p.hitRate*2)}%`,height:"100%",background:p.hitRate>100?RED:p.hitRate>40?AMB:EME,borderRadius:7}}/>
                    </div>
                    <span style={{fontSize:10,fontWeight:800,fontFamily:"monospace",minWidth:30,color:p.hitRate>100?RED:p.hitRate>40?AMB:EME}}>{p.hitRate}</span>
                    <span style={{fontSize:9,color:"var(--muted-foreground)",minWidth:50}}>FP: {p.fpRate}%</span>
                    <Chip label={p.action} color={p.action.includes("Block")?RED:AMB}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <div style={{flex:1}}>
                <TableShell
                  cols={["ID","Policy Name","Type","Classifier","Action","Coverage","Hit Rate","FP Rate","Enabled","Status"]}
                  rows={_dlpPolicies.map(p=>[
                    <Mono>{p.id}</Mono>,
                    <div>
                      <div style={{fontWeight:700,color:NAV,fontSize:11}}>{p.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{p.coverage}</div>
                    </div>,
                    <Chip label={p.type} color={PRP}/>,
                    <span style={{fontSize:9,color:"var(--muted-foreground)",maxWidth:140,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.classifier}</span>,
                    <Chip label={p.action} color={p.action.includes("Block")?RED:p.action.includes("Quarantine")?AMB:BLU}/>,
                    <Chip label={p.coverage} color={CYN}/>,
                    <span style={{fontWeight:800,fontFamily:"monospace",fontSize:11,color:p.hitRate>100?RED:p.hitRate>40?AMB:EME}}>{p.hitRate}/day</span>,
                    <span style={{fontWeight:700,fontSize:10,color:p.fpRate>25?RED:p.fpRate>15?AMB:EME}}>{p.fpRate}%</span>,
                    <button onClick={ev=>{ev.stopPropagation();setPolicyEnabled(prev=>({...prev,[p.id]:!prev[p.id]}));}}
                      style={{padding:"3px 10px",borderRadius:12,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                        background:policyEnabled[p.id]?`${EME}22`:`${RED}22`,color:policyEnabled[p.id]?EME:RED,
                        outline:`1px solid ${policyEnabled[p.id]?EME:RED}44`,minWidth:56}}>
                      {policyEnabled[p.id]?"● ON":"○ OFF"}
                    </button>,
                    <Badge label={p.status}/>,
                  ])}
                  onRowClick={i=>setSelectedPolicy(_dlpPolicies[i]===selectedPolicy?null:_dlpPolicies[i])}
                  bulkActions={[
                    {label:"Enable",icon:"✓",danger:false,onClick:()=>{}},
                    {label:"Disable",icon:"✕",danger:true,onClick:()=>{}},
                    {label:"Export Rules",icon:"↓",danger:false,onClick:()=>{}},
                  ]}
                />
              </div>
              {selectedPolicy && (
                <div style={{width:320,flexShrink:0,...card({padding:0,height:"fit-content",overflow:"hidden"})}}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,color:NAV}}>{selectedPolicy.id}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{selectedPolicy.type} · {selectedPolicy.coverage}</div>
                    </div>
                    <button onClick={()=>setSelectedPolicy(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--muted-foreground)"}}>×</button>
                  </div>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>POLICY DETAILS</div>
                    {[["Name",selectedPolicy.name],["Action",selectedPolicy.action],["FP Rate",`${selectedPolicy.fpRate}%`],["Hit Rate",`${selectedPolicy.hitRate}/day`],["Status",selectedPolicy.status]].map(([k,v])=>(
                      <div key={String(k)} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:10}}>
                        <span style={{color:"var(--muted-foreground)"}}>{k}</span>
                        <span style={{fontWeight:700,color:NAV,maxWidth:160,textAlign:"right",wordBreak:"break-word"}}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:8}}>⚙ RULE / CONDITION EDITOR</div>
                    <div style={{fontSize:10,fontWeight:700,color:NAV,marginBottom:4}}>Classifier</div>
                    <div style={{background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"8px 10px",fontFamily:"monospace",fontSize:9,color:EME,lineHeight:1.6,marginBottom:8}}>
                      {selectedPolicy.classifier}
                    </div>
                    <div style={{fontSize:10,fontWeight:700,color:NAV,marginBottom:4}}>Trigger Condition</div>
                    <div style={{background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"8px 10px",fontFamily:"monospace",fontSize:9,color:AMB,lineHeight:1.6,marginBottom:8}}>
                      {selectedPolicy.type==="Threshold"?`count(matches) > threshold`:`match_confidence >= 0.85\ncontext_window = 50\nmin_occurrences = 1`}
                    </div>
                    <div style={{fontSize:10,fontWeight:700,color:NAV,marginBottom:4}}>FP Suppression Rules</div>
                    <div style={{background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"8px 10px",fontFamily:"monospace",fontSize:9,color:CYN,lineHeight:1.6}}>
                      {`exclude_paths: ["/tmp/*", "/test/*"]\nexclude_users: ["SA-*"]\nmin_risk_score: 40`}
                    </div>
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:8}}>ENABLE / DISABLE</div>
                    <button onClick={()=>setPolicyEnabled(prev=>({...prev,[selectedPolicy.id]:!prev[selectedPolicy.id]}))}
                      style={{width:"100%",padding:"8px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:800,fontSize:11,
                        background:policyEnabled[selectedPolicy.id]?`${RED}22`:`${EME}22`,
                        color:policyEnabled[selectedPolicy.id]?RED:EME,
                        outline:`1px solid ${policyEnabled[selectedPolicy.id]?RED:EME}44`}}>
                      {policyEnabled[selectedPolicy.id]?"⊘ Disable Policy":"✓ Enable Policy"}
                    </button>
                    <button style={{width:"100%",padding:"8px",borderRadius:7,border:`1px solid ${AMB}44`,cursor:"pointer",fontWeight:700,fontSize:11,background:`${AMB}12`,color:AMB,marginTop:6}}>
                      ⬇ Export Rule Definition
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── DATABASE ACTIVITY MONITORING ──────────────────────────────────── */}
        {tab==="dam" && (
          !isSubModuleLicensed("dataops","data.dlp") ? <LockedModule moduleKey="dlp" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Events (24h)"       value={_damEvents.length}                                           sub="Total DB events logged"       color={NAV} icon="📋" />
              <KpiCard label="Anomalies Flagged"  value={_damEvents.filter(e=>e.anomaly).length}                      sub="ML behaviour deviation"       color={RED} icon="🚨" alert />
              <KpiCard label="After-Hours Access" value={_damEvents.filter(e=>e.offhours).length}                     sub="Outside business hours"       color={AMB} icon="🌙" />
              <KpiCard label="Mass Exports"       value={_damEvents.filter(e=>e.qtype==="SELECT"&&e.rows>100000).length} sub="> 100K rows in single query" color={RED} icon="📤" alert />
              <KpiCard label="New Geos"           value={_damEvents.filter(e=>["CN","NG","KR","SG"].includes(e.geo)).length} sub="Access from new countries" color={RED} icon="🌍" alert />
            </div>
            {/* User behaviour baseline summary */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={card({padding:"14px 18px"})}>
                <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:10}}>👤 User Behaviour Baseline</div>
                {[
                  ["Normal Query Window","08:00 – 18:00 UTC",false],
                  ["Avg Queries / User / Day",`${Math.round(_damEvents.length/new Set(_damEvents.map(e=>e.user)).size)} queries`,false],
                  ["Typical Row Access","< 50,000 rows",false],
                  ["Baseline Geo Locations","US · EU · UK",false],
                  ["After-Hours Anomalies",`${_damEvents.filter(e=>e.offhours&&e.anomaly).length} flagged`,true],
                  ["Avg Anomaly Score",`${Math.round(_damEvents.filter(e=>e.anomaly).reduce((s,e)=>s+e.score,0)/Math.max(1,_damEvents.filter(e=>e.anomaly).length))}/100`,true],
                ].map(([k,v,warn])=>(
                  <div key={String(k)} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:10}}>
                    <span style={{color:"var(--muted-foreground)"}}>{k}</span>
                    <span style={{fontWeight:700,color:warn?AMB:EME}}>{String(v)}</span>
                  </div>
                ))}
              </div>
              {/* After-hours access heatmap (24h × access count) */}
              <div style={card({padding:"14px 18px"})}>
                <div style={{fontSize:11,fontWeight:800,color:AMB,marginBottom:10}}>🌙 After-Hours Access Heatmap — 24h</div>
                <div style={{fontSize:9,color:"var(--muted-foreground)",marginBottom:8}}>Events by hour of day (all events vs flagged after-hours)</div>
                <svg viewBox="0 0 480 80" style={{width:"100%",height:80}}>
                  {Array.from({length:24},(_,h)=>{
                    const total=_damEvents.filter(e=>{const ts=e.timestamp||"";const hr=parseInt(ts.slice(11,13)||String(h));return hr===h;}).length;
                    const afterHours=h<8||h>=18;
                    const barH=Math.max(2,Math.min(60,total*8));
                    const clr=afterHours?(total>2?RED:AMB):BLU;
                    const x=h*20+2;
                    return (
                      <g key={h}>
                        <rect x={x} y={70-barH} width={16} height={barH} rx={2} fill={clr} opacity={0.7}/>
                        <text x={x+8} y={78} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={5}>{h}</text>
                      </g>
                    );
                  })}
                  <line x1={160} y1={0} x2={160} y2={70} stroke={AMB} strokeWidth={1} strokeDasharray="3,2" opacity={0.6}/>
                  <line x1={360} y1={0} x2={360} y2={70} stroke={AMB} strokeWidth={1} strokeDasharray="3,2" opacity={0.6}/>
                  <text x={80} y={8} fill={BLU} fontSize={6} textAnchor="middle">Business Hours</text>
                  <text x={420} y={8} fill={AMB} fontSize={6} textAnchor="middle">After Hours</text>
                </svg>
              </div>
            </div>
            {/* Top 5 anomalous users */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={card({padding:"14px 18px"})}>
                <div style={{fontSize:11,fontWeight:800,color:RED,marginBottom:10}}>🔴 Top 5 Anomalous Users</div>
                {Object.entries(_damEvents.filter(e=>e.anomaly).reduce((acc,e)=>{acc[e.user]=(acc[e.user]||0)+1;return acc;},{}))
                  .sort((a,b)=>b[1]-a[1]).slice(0,5).map(([user,count])=>(
                  <div key={user} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--foreground)"}}>{user}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:80,height:5,borderRadius:3,background:"rgba(255,255,255,0.08)"}}>
                        <div style={{width:`${Math.min(100,count/15*100)}%`,height:"100%",background:RED,borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:10,fontWeight:800,color:RED,fontFamily:"monospace",minWidth:20}}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={card({padding:"14px 18px"})}>
                <div style={{fontSize:11,fontWeight:800,color:AMB,marginBottom:10}}>📊 Query Type Distribution</div>
                {["SELECT","INSERT","UPDATE","DELETE","READ","WRITE"].map(qt=>{
                  const cnt=_damEvents.filter(e=>e.qtype===qt).length;
                  const max=_damEvents.length;
                  const clr=qt==="DELETE"?RED:qt==="UPDATE"?AMB:qt==="SELECT"||qt==="READ"?BLU:EME;
                  return (
                    <div key={qt} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                      <span style={{fontSize:10,fontWeight:700,color:clr,minWidth:50}}>{qt}</span>
                      <div style={{flex:1,height:10,borderRadius:5,background:"rgba(255,255,255,0.06)"}}>
                        <div style={{width:`${cnt/max*100}%`,height:"100%",background:clr,borderRadius:5}}/>
                      </div>
                      <span style={{fontSize:10,fontWeight:800,fontFamily:"monospace",minWidth:24,color:clr}}>{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <TableShell
              cols={["Event ID","User","Database","Query Type","Rows Affected","Anomaly Type","Risk Score","Off-Hours","Geo","Session","Severity"]}
              rows={(damShowAll?_damEvents:_damEvents.slice(0,50)).map(e=>[
                <Mono>{e.id}</Mono>,
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:NAV}}>{e.user}</div>
                  <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{e.timestamp}</div>
                </div>,
                <span style={{fontSize:10,fontWeight:700,color:"var(--foreground)"}}>{e.db}</span>,
                <Chip label={e.qtype} color={e.qtype==="DELETE"?RED:e.qtype==="UPDATE"?AMB:BLU}/>,
                <span style={{fontWeight:800,fontFamily:"monospace",fontSize:10,color:e.rows>100000?RED:e.rows>10000?AMB:"var(--foreground)"}}>{e.rows>0?e.rows.toLocaleString():"Stream"}</span>,
                <span style={{fontSize:10,color:e.anomaly?RED:"var(--muted-foreground)"}}>{e.atype}</span>,
                <span style={{fontWeight:800,fontFamily:"monospace",fontSize:11,color:e.score>=90?RED:e.score>=70?AMB:EME}}>{e.score}</span>,
                e.offhours?<span style={{color:AMB,fontWeight:700}}>🌙 Yes</span>:<span style={{color:"var(--muted-foreground)"}}>—</span>,
                <Chip label={e.geo} color={["CN","NG","KR"].includes(e.geo)?RED:CYN}/>,
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <Mono style={{fontSize:8}}>{e.session}</Mono>
                  <button onClick={ev=>{ev.stopPropagation();alert(`Session Recording: ${e.session}\nUser: ${e.user}\nDB: ${e.db}\nStart: ${e.timestamp}\nDuration: ${2+Math.floor(e.score/20)}m ${e.score%60}s\nQueries: ${1+Math.floor(e.rows/100000)}\nStatus: ${e.anomaly?"⚠ Flagged":"OK"}`);}} style={{padding:"2px 5px",borderRadius:4,border:`1px solid ${NAV}44`,background:`${NAV}12`,color:NAV,fontSize:8,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>▶ View</button>
                </div>,
                <SevBadge label={e.risk}/>,
              ])}
              bulkActions={[
                {label:"Create Incident",icon:"🚨",danger:false,onClick:()=>{}},
                {label:"Suspend User",icon:"⊘",danger:true,onClick:()=>{}},
              ]}
            />
            {_damEvents.length > 50 && (
              <div style={{textAlign:"center",marginTop:8}}>
                <button onClick={()=>setDamShowAll(v=>!v)} style={{padding:"6px 18px",borderRadius:6,border:`1px solid ${NAV}44`,background:`${NAV}12`,color:NAV,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {damShowAll?`▲ Show Top 50`:`▼ Show All ${_damEvents.length} Events`}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── ENCRYPTION POSTURE ────────────────────────────────────────────── */}
        {tab==="encryption" && (
          !isSubModuleLicensed("dataops","data.encryption") ? <LockedModule moduleKey="encryption" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Stores Audited"       value={_encryptionMatrix.length}                                          sub="Encryption posture review"      color={NAV} icon="🔒" />
              <KpiCard label="At-Rest Gaps"         value={_encryptionMatrix.filter(e=>!e.atRest).length}                     sub="Unencrypted at rest"             color={RED} icon="🔓" alert />
              <KpiCard label="In-Transit Gaps"      value={_encryptionMatrix.filter(e=>!e.inTransit).length}                  sub="Unencrypted in transit"          color={RED} icon="📡" alert />
              <KpiCard label="Key Rotation Off"     value={_encryptionMatrix.filter(e=>!e.rotationEnabled).length}            sub="No automatic key rotation"       color={AMB} icon="🔑" />
              <KpiCard label="Cert Expiring < 90d"  value={_encryptionMatrix.filter(e=>e.certExpiry&&e.certExpiry!=="Expired"&&new Date(e.certExpiry)<new Date("2026-09-15")).length} sub="SSL cert renewal needed" color={AMB} icon="📜" />
            </div>
            {/* KMS coverage donut */}
            <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:16}}>
              <div style={card({padding:"16px 20px",display:"flex",flexDirection:"column",alignItems:"center"})}>
                <div style={{fontSize:10,fontWeight:800,color:NAV,marginBottom:8}}>KMS COVERAGE</div>
                <svg viewBox="0 0 120 120" width={120} height={120}>
                  {(()=>{
                    const kms=[
                      {label:"AWS KMS",pct:36,color:AMB},
                      {label:"Azure KV",pct:22,color:BLU},
                      {label:"GCP KMS",pct:18,color:NAV},
                      {label:"HashiCorp",pct:8,color:PRP},
                      {label:"HSM",pct:7,color:CYN},
                      {label:"None",pct:9,color:RED},
                    ];
                    let cum=0;
                    return kms.map(k=>{
                      const sa=cum/100*2*Math.PI-Math.PI/2; cum+=k.pct;
                      const ea=cum/100*2*Math.PI-Math.PI/2;
                      const r=50,cx=60,cy=60;
                      const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa);
                      const x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
                      return <path key={k.label} d={`M${cx},${cy} L${x1},${y1} A${r},${r},0,${k.pct>50?1:0},1,${x2},${y2} Z`} fill={k.color} opacity={0.85}/>;
                    });
                  })()}
                  <circle cx={60} cy={60} r={28} fill="var(--card)"/>
                  <text x={60} y={57} textAnchor="middle" fill={EME} fontSize={9} fontWeight="800">91%</text>
                  <text x={60} y={68} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={7}>KMS covered</text>
                </svg>
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3,width:"100%"}}>
                  {[["AWS KMS",36,AMB],["Azure KV",22,BLU],["GCP KMS",18,NAV],["None",9,RED]].map(([l,p,c])=>(
                    <div key={String(l)} style={{display:"flex",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:7,height:7,borderRadius:2,background:c}}/><span style={{fontSize:9}}>{l}</span></div>
                      <span style={{fontSize:9,fontWeight:800,color:c,fontFamily:"monospace"}}>{p}%</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Encryption matrix */}
              <div style={card({overflow:"hidden"})}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"var(--input)",borderBottom:"1px solid var(--border)"}}>
                      {["Data Store","At Rest","In Transit","Key Mgmt","Key Age (days)","Auto Rotate","Cert Expiry","Status"].map(c=>(
                        <th key={c} style={{textAlign:"left",padding:"9px 12px",color:"var(--muted-foreground)",fontWeight:700,fontSize:10,textTransform:"uppercase"}}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {_encryptionMatrix.map(e=>(
                      <tr key={e.store} style={{borderBottom:"1px solid rgba(255,255,255,0.05)",background:e.status==="critical"?"rgba(248,113,113,0.06)":e.status==="warning"?"rgba(252,211,77,0.06)":"transparent"}}>
                        <td style={{padding:"9px 12px",fontWeight:700,color:NAV,fontSize:11}}>{e.store}</td>
                        <td style={{padding:"9px 12px",textAlign:"center"}}>{e.atRest?<span style={{color:EME,fontWeight:800}}>✓</span>:<span style={{color:RED,fontWeight:800}}>✗</span>}</td>
                        <td style={{padding:"9px 12px",textAlign:"center"}}>{e.inTransit?<span style={{color:EME,fontWeight:800}}>✓</span>:<span style={{color:RED,fontWeight:800}}>✗</span>}</td>
                        <td style={{padding:"9px 12px"}}><Chip label={e.keyMgmt} color={e.keyMgmt==="None"?RED:BLU}/></td>
                        <td style={{padding:"9px 12px",fontFamily:"monospace",fontSize:10,color:!e.keyAge?RED:e.keyAge>180?AMB:EME}}>{e.keyAge??"-"}</td>
                        <td style={{padding:"9px 12px",textAlign:"center"}}>{e.rotationEnabled?<span style={{color:EME,fontWeight:700}}>✓</span>:<span style={{color:RED,fontWeight:700}}>✗</span>}</td>
                        <td style={{padding:"9px 12px",fontSize:10,fontFamily:"monospace",color:e.certExpiry==="Expired"?RED:e.certExpiry<"2026-09-15"?AMB:"var(--foreground)"}}>{e.certExpiry}</td>
                        <td style={{padding:"9px 12px"}}><Badge label={e.status}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Remediation queue */}
            <div style={card({padding:"14px 18px",background:"rgba(248,113,113,0.06)",borderColor:RED})}>
              <div style={{fontSize:11,fontWeight:800,color:RED,marginBottom:8}}>🔒 Encryption Gap Remediation Queue — Sorted by Sensitivity</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {_encryptionMatrix.filter(e=>e.status==="critical").slice(0,6).map(e=>(
                  <div key={e.store} style={card({padding:"10px 12px"})}>
                    <div style={{fontSize:10,fontWeight:800,color:NAV}}>{e.store}</div>
                    <div style={{display:"flex",gap:4,marginTop:4}}>
                      {!e.atRest&&<Chip label="No at-rest enc" color={RED}/>}
                      {!e.inTransit&&<Chip label="No in-transit enc" color={RED}/>}
                      {!e.rotationEnabled&&<Chip label="No key rotation" color={AMB}/>}
                    </div>
                    <button style={{marginTop:8,width:"100%",padding:"5px 0",borderRadius:5,background:RED,border:"none",color:"#000",fontSize:10,fontWeight:700,cursor:"pointer"}}>Create Remediation Task</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── DATA RESIDENCY & SOVEREIGNTY ─────────────────────────────────── */}
        {tab==="residency" && (
          !isSubModuleLicensed("dataops","data.residency") ? <LockedModule moduleKey="residency" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Stores Mapped"       value={_residencyData.length}                                            sub="Residency requirements mapped"  color={NAV} icon="🌍" />
              <KpiCard label="Violations"          value={_residencyData.filter(r=>r.status==="violation").length}           sub="Cross-border non-compliance"    color={RED} icon="⚠" alert />
              <KpiCard label="Warnings"            value={_residencyData.filter(r=>r.status==="warning").length}             sub="Partial compliance risk"        color={AMB} icon="⚡" />
              <KpiCard label="GDPR Art.44 Covered" value={_residencyData.filter(r=>r.regulation.includes("GDPR")).length}   sub="GDPR-scoped stores"             color={BLU} icon="🇪🇺" />
              <KpiCard label="Compliant"           value={_residencyData.filter(r=>r.status==="compliant").length}           sub="Full residency compliance"      color={EME} icon="✓" />
            </div>
            {/* SVG world map with residency dots */}
            <div style={card({padding:"16px 20px"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:8}}>🌍 DATA RESIDENCY MAP — Store Locations & Cross-Border Flows</div>
              <svg viewBox="0 0 800 360" style={{width:"100%",height:220,display:"block"}}>
                {/* Simple world rectangle */}
                <rect x={0} y={0} width={800} height={360} fill="rgba(30,40,60,0.6)" rx={8}/>
                {/* Continent blobs */}
                <ellipse cx={170} cy={140} rx={90} ry={70} fill="rgba(255,255,255,0.04)"/>{/* Americas */}
                <ellipse cx={380} cy={140} rx={80} ry={60} fill="rgba(255,255,255,0.04)"/>{/* Europe */}
                <ellipse cx={530} cy={160} rx={100} ry={65} fill="rgba(255,255,255,0.04)"/>{/* Asia */}
                <ellipse cx={420} cy={240} rx={60} ry={45} fill="rgba(255,255,255,0.04)"/>{/* Africa */}
                <ellipse cx={680} cy={220} rx={50} ry={35} fill="rgba(255,255,255,0.04)"/>{/* Australia */}
                {/* Region dots */}
                {[
                  {region:"eu-west-1",x:345,y:120,stores:["customers-db-prod"],status:"compliant"},
                  {region:"uksouth",x:330,y:100,stores:["hr-records-primary"],status:"compliant"},
                  {region:"us-east-1",x:170,y:130,stores:["analytics-datalake","redshift-dw-prod"],status:"violation"},
                  {region:"europe-west1",x:365,y:130,stores:["payments-db-prod"],status:"compliant"},
                  {region:"eastus",x:180,y:140,stores:["finance-archive-2024"],status:"warning"},
                  {region:"KSA-DC1",x:520,y:165,stores:["biometrics-access-db"],status:"compliant"},
                  {region:"Chicago-DC1",x:155,y:135,stores:["teradata-legacy-dw"],status:"compliant"},
                  {region:"London-DC1",x:333,y:108,stores:["oracle-erp-prod"],status:"compliant"},
                  {region:"europe-west4",x:358,y:118,stores:["bigquery-ml-training"],status:"compliant"},
                  {region:"Dublin-DC1",x:320,y:112,stores:["mssql-insurance-claims"],status:"compliant"},
                  {region:"Dubai-DC1",x:513,y:168,stores:["oracle-rac-supply-chain"],status:"compliant"},
                  {region:"asia-east1",x:670,y:175,stores:["gcs-backup-asia"],status:"compliant"},
                ].map(loc=>{
                  const clr=loc.status==="violation"?RED:loc.status==="warning"?AMB:EME;
                  return (
                    <g key={loc.region}>
                      <circle cx={loc.x} cy={loc.y} r={8} fill={`${clr}33`} stroke={clr} strokeWidth={1.5}/>
                      <circle cx={loc.x} cy={loc.y} r={3} fill={clr}/>
                      <text x={loc.x} y={loc.y-12} textAnchor="middle" fill={clr} fontSize={7} fontWeight="700">{loc.region}</text>
                    </g>
                  );
                })}
                {/* Cross-border violation arcs */}
                {[
                  {x1:345,y1:120,x2:170,y2:130,label:"analytics-datalake → us-east-1 ⚠"},
                  {x1:345,y1:120,x2:180,y2:140,label:"azure-synapse → eastus ⚠"},
                ].map((arc,i)=>(
                  <g key={i}>
                    <path d={`M${arc.x1},${arc.y1} Q${(arc.x1+arc.x2)/2},${Math.min(arc.y1,arc.y2)-40} ${arc.x2},${arc.y2}`} fill="none" stroke={RED} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7}/>
                  </g>
                ))}
                {/* Legend */}
                <circle cx={20} cy={340} r={5} fill={EME} opacity={0.8}/><text x={28} y={343} fill="rgba(255,255,255,0.6)" fontSize={8}>Compliant</text>
                <circle cx={80} cy={340} r={5} fill={AMB} opacity={0.8}/><text x={88} y={343} fill="rgba(255,255,255,0.6)" fontSize={8}>Warning</text>
                <circle cx={135} cy={340} r={5} fill={RED} opacity={0.8}/><text x={143} y={343} fill="rgba(255,255,255,0.6)" fontSize={8}>Violation</text>
                <line x1={200} y1={338} x2={220} y2={338} stroke={RED} strokeWidth={1.5} strokeDasharray="4,3"/><text x={224} y={343} fill="rgba(255,255,255,0.6)" fontSize={8}>Cross-border violation</text>
              </svg>
            </div>
            <TableShell
              cols={["Store","Required Residency","Actual Location","Cloud","Regulation","Status","Violations"]}
              rows={_residencyData.map(r=>[
                <span style={{fontWeight:700,color:NAV,fontSize:11}}>{r.store}</span>,
                <Chip label={r.required} color={BLU}/>,
                <Mono style={{fontSize:9}}>{r.actual}</Mono>,
                <span style={{fontSize:10}}>{platformIcon[r.cloud]||"⬡"} {r.cloud}</span>,
                <Chip label={r.regulation} color={PRP}/>,
                <Badge label={r.status}/>,
                <span style={{fontWeight:800,fontFamily:"monospace",fontSize:11,color:r.violations>0?RED:EME}}>{r.violations}</span>,
              ])}
            />
          </>
        )}

        {/* ── AI PIPELINE GOVERNANCE ────────────────────────────────────────── */}
        {tab==="aipipeline" && (
          !isSubModuleLicensed("dataops","data.dspm") ? <LockedModule moduleKey="dspm" /> : <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="AI Datasets"       value={_aiDatasets.length}                                              sub="Training dataset registry"      color={NAV} icon="🤖" />
              <KpiCard label="GDPR Art.22 Flags" value={_aiDatasets.filter(d=>d.gdprArt22).length}                      sub="Automated decision models"      color={RED} icon="⚖" alert />
              <KpiCard label="Shadow AI"         value={_aiDatasets.filter(d=>d.shadow).length}                         sub="Unapproved AI tools detected"   color={RED} icon="👻" alert />
              <KpiCard label="DPO Gaps"          value={_aiDatasets.filter(d=>d.sensitivePII&&!d.dpoReviewed).length}   sub="PII datasets without DPO sign-off" color={AMB} icon="🔏" />
              <KpiCard label="PII Exposure"      value={_aiDatasets.filter(d=>d.sensitivePII).length}                   sub="Datasets using personal data"   color={AMB} icon="👤" />
            </div>
            <div style={card({padding:"14px 18px"})}>
              <div style={{fontSize:11,fontWeight:800,color:RED,marginBottom:8}}>⚠ AI GOVERNANCE RISK SUMMARY</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {color:RED,icon:"⚖",title:`${_aiDatasets.filter(d=>d.gdprArt22&&d.status!=="approved").length} Art.22 Models Without DPIA`,body:"Models making automated decisions without a completed DPIA violate GDPR Art.35. Subject to supervisory authority investigation."},
                  {color:AMB,icon:"👻",title:`${_aiDatasets.filter(d=>d.shadow).length} Shadow AI Tools Detected`,body:"Employees using unapproved AI tools (ChatGPT, Midjourney, Perplexity) to process customer/legal data outside approved DPA scope."},
                  {color:PNK,icon:"🏥",title:`${_aiDatasets.filter(d=>d.sensitivePHI).length} Datasets Contain PHI`,body:"Health data used in ML training without HIPAA BAA or Art.9 GDPR special category explicit consent. Immediate review required."},
                ].map(a=>(
                  <div key={a.title} style={{padding:"12px 14px",borderRadius:8,background:`${a.color}08`,border:`1px solid ${a.color}22`}}>
                    <div style={{fontSize:10,fontWeight:800,color:a.color,marginBottom:4}}>{a.icon} {a.title}</div>
                    <div style={{fontSize:10,color:"var(--foreground)",lineHeight:1.5}}>{a.body}</div>
                  </div>
                ))}
              </div>
            </div>
            <TableShell
              cols={["ID","Dataset","Purpose","Records","PII","PHI","Art.22","Shadow","DPO Reviewed","Status"]}
              rows={_aiDatasets.map(d=>[
                <Mono>{d.id}</Mono>,
                <div>
                  <div style={{fontWeight:700,color:NAV,fontSize:11}}>{d.name}</div>
                  <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{d.purpose}</div>
                </div>,
                <span style={{fontSize:9,color:"var(--muted-foreground)"}}>{d.purpose}</span>,
                <span style={{fontFamily:"monospace",fontSize:10,fontWeight:700,color:d.recordCount>0?NAV:"var(--muted-foreground)"}}>{d.recordCount>0?d.recordCount.toLocaleString():"N/A"}</span>,
                d.sensitivePII?<span style={{color:RED,fontWeight:700}}>⚠ Yes</span>:<span style={{color:"var(--muted-foreground)"}}>No</span>,
                d.sensitivePHI?<span style={{color:PNK,fontWeight:700}}>⚠ Yes</span>:<span style={{color:"var(--muted-foreground)"}}>No</span>,
                d.gdprArt22?<span style={{color:RED,fontWeight:700}}>⚠ Required</span>:<span style={{color:"var(--muted-foreground)"}}>N/A</span>,
                d.shadow?<span style={{color:RED,fontWeight:800}}>🚨 Shadow</span>:<span style={{color:EME}}>—</span>,
                d.dpoReviewed?<span style={{color:EME,fontWeight:700}}>✓</span>:<span style={{color:RED,fontWeight:700}}>✗ Needed</span>,
                <Badge label={d.status}/>,
              ])}
            />
          </>
        )}

        {/* ── ANOMALY DETECTION ─────────────────────────────────────────────── */}
        {tab==="anomaly" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Anomalies (30d)"    value={_anomalies.length}                                               sub="ML-detected events"             color={NAV} icon="🔬" />
              <KpiCard label="Open Investigations" value={_anomalies.filter(a=>a.investigationStatus==="open").length}    sub="Pending triage"                 color={RED} icon="🚨" alert />
              <KpiCard label="Auto-Blocked"        value={_anomalies.filter(a=>a.action==="auto-blocked").length}          sub="Policy auto-remediated"         color={EME} icon="⊘" />
              <KpiCard label="Critical Score ≥ 90" value={_anomalies.filter(a=>a.score>=90).length}                       sub="Highest confidence anomalies"   color={RED} icon="🔴" alert />
              <KpiCard label="Former Employees"    value={_anomalies.filter(a=>a.type.includes("Former")).length}          sub="Offboarded user activity"       color={RED} icon="🚪" alert />
            </div>
            {/* 30-day trend */}
            <div style={card({padding:"14px 18px"})}>
              <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:8}}>📊 30-Day Anomaly Trend</div>
              <svg viewBox="0 0 720 60" style={{width:"100%",height:60}}>
                {Array.from({length:30},(_,i)=>{
                  const cnt=Math.floor(Math.random()*5+1);
                  const h=cnt*8;
                  const clr=cnt>=4?RED:cnt>=3?AMB:EME;
                  return <g key={i}>
                    <rect x={i*24+2} y={60-h} width={20} height={h} fill={clr} opacity={0.7} rx={2}/>
                    {i%5===0&&<text x={i*24+12} y={72} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={7}>D{30-i}</text>}
                  </g>;
                })}
              </svg>
            </div>
            <TableShell
              cols={["ID","User","Data Store","Anomaly Type","Geo","ML Score","Severity","Timestamp","Status","Action"]}
              rows={_anomalies.map(a=>[
                <Mono>{a.id}</Mono>,
                <span style={{fontSize:10,fontWeight:700,color:NAV}}>{a.user}</span>,
                <span style={{fontSize:10}}>{a.store}</span>,
                <span style={{fontSize:10,fontWeight:700,color:a.severity==="Critical"?RED:a.severity==="High"?AMB:"var(--foreground)"}}>{a.type}</span>,
                <Chip label={a.geo} color={["CN","NG","KR","SG"].includes(a.geo)?RED:CYN}/>,
                <span style={{fontWeight:900,fontFamily:"monospace",fontSize:12,color:a.score>=90?RED:a.score>=70?AMB:EME}}>{a.score}</span>,
                <SevBadge label={a.severity}/>,
                <Mono style={{fontSize:9}}>{a.timestamp}</Mono>,
                <Badge label={a.investigationStatus}/>,
                <div style={{display:"flex",gap:4}}>
                  {a.action==="auto-blocked"?<Chip label="Auto-Blocked" color={EME}/>:(
                    <button onClick={e=>{e.stopPropagation();}} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${RED}55`,background:`${RED}12`,color:RED,fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Create Incident</button>
                  )}
                </div>,
              ])}
              bulkActions={[
                {label:"Mark FP",icon:"✓",danger:false,onClick:()=>{}},
                {label:"Escalate",icon:"↑",danger:false,onClick:()=>{}},
                {label:"Suspend Users",icon:"⊘",danger:true,onClick:()=>{}},
              ]}
            />
          </>
        )}

        {/* ── DATA CATALOG ─────────────────────────────────────────────────── */}
        {tab==="catalog" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Total Assets"      value={_catalog.length.toLocaleString()}                                  sub="Cataloged data assets"          color={NAV} icon="📚" />
              <KpiCard label="High Sensitivity"  value={_catalog.filter(a=>a.sensitivity==="Restricted").length}           sub="Restricted access required"     color={RED} icon="🔒" />
              <KpiCard label="PII Assets"        value={_catalog.filter(a=>a.classification.includes("PII")).length}       sub="Personal data assets"           color={RED} icon="👤" alert />
              <KpiCard label="Quality ≥ 90"      value={_catalog.filter(a=>a.qualityScore>=90).length}                    sub="High data quality score"        color={EME} icon="⭐" />
              <KpiCard label="Domains"           value={new Set(_catalog.map(a=>a.domain)).size}                          sub="Business data domains"          color={BLU} icon="🗂" />
            </div>
            {/* Search and filters */}
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <input
                placeholder="Search by name or domain..."
                value={catalogSearch}
                onChange={e=>{ setCatalogSearch(e.target.value); setCatalogPage(0); }}
                style={{flex:1,minWidth:200,padding:"7px 12px",borderRadius:7,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:11,fontFamily:"inherit"}}
              />
              <select value={catalogDomain} onChange={e=>{setCatalogDomain(e.target.value);setCatalogPage(0);}} style={{padding:"7px 12px",borderRadius:7,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:11,fontFamily:"inherit"}}>
                <option value="All">All Domains</option>
                {[...new Set(_catalogBases.map(b=>b.domain))].map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={catalogClass} onChange={e=>{setCatalogClass(e.target.value);setCatalogPage(0);}} style={{padding:"7px 12px",borderRadius:7,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:11,fontFamily:"inherit"}}>
                <option value="All">All Classifications</option>
                {["PII","PCI","PHI","Financial","Credentials","Biometric","Legal","IP"].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{fontSize:10,color:"var(--muted-foreground)"}}>{filteredCatalog.length.toLocaleString()} assets · Page {catalogPage_+1}/{Math.ceil(filteredCatalog.length/CATALOG_PAGE_SIZE)}</span>
            </div>
            {/* Business glossary */}
            <div style={card({padding:"12px 16px"})}>
              <div style={{fontSize:10,fontWeight:800,color:NAV,marginBottom:8}}>📖 Business Glossary</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["PII","Any data that identifies an individual — GDPR Art.4(1)"],["PHI","Protected Health Information — HIPAA covered entity"],["PCI","Payment Card Industry data — Card numbers, CVV, PAN"],["PII+PHI","Combined personal + health — highest sensitivity tier"],["Credentials","Secrets, API keys, passwords, tokens, certificates"],["Biometric","Fingerprints, facial geometry, voice prints — Art.9 GDPR"],["Legal","Contracts, NDAs, litigation hold, regulatory filings"],["Financial","Revenue, payroll, P&L, bank accounts, card data"]].map(([term,def])=>(
                  <div key={term} title={def} style={{padding:"4px 10px",borderRadius:5,background:`${BLU}12`,border:`1px solid ${BLU}22`,cursor:"help"}}>
                    <span style={{fontSize:9,fontWeight:700,color:BLU}}>{term}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <div style={{flex:1,minWidth:0}}>
                <TableShell
                  cols={["ID","Asset Name","Domain","Cloud","Owner","Classification","Sensitivity","Quality","Type","Last Updated","Access"]}
                  rows={pagedCatalog.map(a=>[
                    <Mono style={{fontSize:9}}>{a.id}</Mono>,
                    <span style={{fontSize:10,fontWeight:700,color:NAV}}>{a.name}</span>,
                    <Chip label={a.domain} color={PRP}/>,
                    <span style={{fontSize:10}}>{platformIcon[a.cloud]||"⬡"} {a.cloud}</span>,
                    <span style={{fontSize:10}}>{a.owner}</span>,
                    <Chip label={a.classification} color={a.classification.includes("PII")||a.classification.includes("PHI")||a.classification.includes("PCI")?RED:BLU}/>,
                    <Chip label={a.sensitivity} color={a.sensitivity==="Restricted"?RED:a.sensitivity==="Confidential"?AMB:BLU}/>,
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.08)"}}>
                        <div style={{width:`${a.qualityScore}%`,height:"100%",background:a.qualityScore>=90?EME:a.qualityScore>=75?AMB:RED,borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:9,fontFamily:"monospace",color:a.qualityScore>=90?EME:a.qualityScore>=75?AMB:RED}}>{a.qualityScore}</span>
                    </div>,
                    <Chip label={a.type} color={CYN}/>,
                    <Mono style={{fontSize:9}}>{a.lastUpdated}</Mono>,
                    <Chip label={a.access} color={a.access==="restricted"?RED:a.access==="team"?AMB:BLU}/>,
                  ])}
                  onRowClick={i=>{const a=pagedCatalog[i];setSelectedCatalogAsset(a===selectedCatalogAsset?null:a);}}
                  bulkActions={[
                    {label:"Request Access",icon:"→",danger:false,onClick:()=>{}},
                    {label:"Export CSV",icon:"↓",danger:false,onClick:()=>{}},
                  ]}
                />
                {/* Pagination */}
                <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8}}>
                  <button onClick={()=>setCatalogPage(p=>Math.max(0,p-1))} disabled={catalogPage_===0} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:catalogPage_===0?"var(--input)":"transparent",color:catalogPage_===0?"var(--muted-foreground)":NAV,fontSize:11,fontWeight:700,cursor:catalogPage_===0?"default":"pointer"}}>← Prev</button>
                  {Array.from({length:Math.min(5,Math.ceil(filteredCatalog.length/CATALOG_PAGE_SIZE))},(_,i)=>{
                    const p = Math.max(0, Math.min(catalogPage_-2+i, Math.ceil(filteredCatalog.length/CATALOG_PAGE_SIZE)-1));
                    return <button key={i} onClick={()=>setCatalogPage(p)} style={{padding:"6px 12px",borderRadius:6,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",background:catalogPage_===p?NAV:"transparent",color:catalogPage_===p?"#000":NAV,borderColor:NAV}}>{p+1}</button>;
                  })}
                  <button onClick={()=>setCatalogPage(p=>Math.min(Math.ceil(filteredCatalog.length/CATALOG_PAGE_SIZE)-1,p+1))} disabled={catalogPage_>=Math.ceil(filteredCatalog.length/CATALOG_PAGE_SIZE)-1} style={{padding:"6px 14px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:NAV,fontSize:11,fontWeight:700,cursor:"pointer"}}>Next →</button>
                </div>
              </div>
              {/* Asset detail panel */}
              {selectedCatalogAsset && (
                <div style={{width:320,flexShrink:0,...card({padding:0,height:"fit-content",overflow:"hidden"})}}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,color:NAV}}>{selectedCatalogAsset.name}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{selectedCatalogAsset.domain} · {selectedCatalogAsset.cloud}</div>
                    </div>
                    <button onClick={()=>setSelectedCatalogAsset(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--muted-foreground)"}}>×</button>
                  </div>
                  {/* Metadata */}
                  <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>ASSET DETAILS</div>
                    {[["ID",selectedCatalogAsset.id],["Owner",selectedCatalogAsset.owner],["Type",selectedCatalogAsset.type],["Classification",selectedCatalogAsset.classification],["Sensitivity",selectedCatalogAsset.sensitivity],["Quality Score",`${selectedCatalogAsset.qualityScore}/100`],["Last Updated",selectedCatalogAsset.lastUpdated],["Access Level",selectedCatalogAsset.access]].map(([k,v])=>(
                      <div key={String(k)} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:10}}>
                        <span style={{color:"var(--muted-foreground)"}}>{k}</span>
                        <span style={{fontWeight:700,color:String(k)==="Sensitivity"&&(String(v)==="Restricted"||String(v)==="Confidential")?RED:NAV,maxWidth:160,textAlign:"right"}}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Data type breakdown */}
                  <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>📊 DATA TYPE BREAKDOWN</div>
                    {(()=>{
                      const types=[["Structured Records","60%",BLU],["Semi-Structured","20%",CYN],["Unstructured Text","10%",PRP],["Binary / Media","10%",PNK]];
                      return types.map(([label,pct,clr])=>(
                        <div key={label} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                          <span style={{fontSize:9,color:"var(--muted-foreground)",minWidth:120}}>{label}</span>
                          <div style={{flex:1,height:6,borderRadius:3,background:"rgba(255,255,255,0.07)"}}>
                            <div style={{width:pct,height:"100%",background:clr,borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:9,fontFamily:"monospace",color:clr,minWidth:28,textAlign:"right"}}>{pct}</span>
                        </div>
                      ));
                    })()}
                  </div>
                  {/* Lineage preview */}
                  <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:6}}>🔗 LINEAGE PREVIEW</div>
                    <svg viewBox="0 0 280 64" style={{width:"100%",height:64}}>
                      {/* upstream */}
                      <rect x={2} y={22} width={72} height={20} rx={4} fill={`${BLU}22`} stroke={BLU} strokeWidth={0.8}/>
                      <text x={38} y={34} textAnchor="middle" fill={BLU} fontSize={7} fontWeight="700">Source DB</text>
                      <line x1={74} y1={32} x2={100} y2={32} stroke="rgba(255,255,255,0.3)" strokeWidth={1} markerEnd="url(#arr)"/>
                      {/* current asset */}
                      <rect x={100} y={16} width={80} height={32} rx={5} fill={`${NAV}22`} stroke={NAV} strokeWidth={1.2}/>
                      <text x={140} y={30} textAnchor="middle" fill={NAV} fontSize={7} fontWeight="800">{selectedCatalogAsset.name.slice(0,14)}</text>
                      <text x={140} y={40} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={5}>{selectedCatalogAsset.classification}</text>
                      <line x1={180} y1={32} x2={206} y2={32} stroke="rgba(255,255,255,0.3)" strokeWidth={1}/>
                      {/* downstream */}
                      <rect x={206} y={22} width={72} height={20} rx={4} fill={`${EME}22`} stroke={EME} strokeWidth={0.8}/>
                      <text x={242} y={34} textAnchor="middle" fill={EME} fontSize={7} fontWeight="700">Analytics DW</text>
                    </svg>
                    <div style={{fontSize:9,color:"var(--muted-foreground)",marginTop:4}}>1 upstream source · 1 downstream consumer · 0 cross-border hops</div>
                  </div>
                  {/* Access request form */}
                  <div style={{padding:"10px 16px"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:8}}>📋 REQUEST ACCESS</div>
                    <select style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:10,fontFamily:"inherit",marginBottom:6}}>
                      <option>Read Only</option>
                      <option>Read + Write</option>
                      <option>Full Access</option>
                    </select>
                    <textarea placeholder="Business justification..." rows={2} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:10,fontFamily:"inherit",resize:"vertical",marginBottom:6,boxSizing:"border-box"}}/>
                    <button style={{width:"100%",padding:"7px",borderRadius:6,border:"none",background:NAV,color:"#000",fontWeight:800,fontSize:11,cursor:"pointer"}}>
                      → Submit Access Request
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ACCESS ANALYTICS ─────────────────────────────────────────────────── */}
        {tab==="access-analytics" && (
          <>
            {/* KPI row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
              <KpiCard label="Total Events (7d)"    value={accessEvents.length}                                       sub="All access activity"           color={NAV} icon="📋" />
              <KpiCard label="Anomalous Events"     value={accessEvents.filter(e=>e.anomalous).length}                sub="Outside baseline behaviour"    color={RED} icon="🚨" alert />
              <KpiCard label="Open Alerts"          value={overAccessAlerts.filter(a=>a.status==="open").length}      sub="Over-access / policy breach"   color={RED} icon="⚠"  alert />
              <KpiCard label="Critical Risk Events" value={accessEvents.filter(e=>e.riskLevel==="Critical").length}   sub="Require immediate review"      color={RED} icon="🔴" alert />
              <KpiCard label="Unique Identities"    value={new Set(accessEvents.map(e=>e.userId)).size}               sub="Distinct users / services"     color={NAV} icon="👤" />
            </div>

            {/* Filter bar */}
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:10,fontWeight:700,color:"var(--muted-foreground)"}}>RISK LEVEL:</span>
              {["All","Critical","High","Medium","Low"].map(f=>(
                <button key={f} onClick={()=>setAccessFilter(f)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid",fontSize:10,fontWeight:700,cursor:"pointer",
                  background:accessFilter===f?`${f==="Critical"?RED:f==="High"?AMB:f==="Medium"?BLU:NAV}22`:"transparent",
                  color:accessFilter===f?(f==="Critical"?RED:f==="High"?AMB:f==="Medium"?BLU:NAV):"var(--muted-foreground)",
                  borderColor:accessFilter===f?(f==="Critical"?RED:f==="High"?AMB:f==="Medium"?BLU:NAV):"var(--border)"}}>{f}</button>
              ))}
              <label style={{display:"flex",alignItems:"center",gap:4,marginLeft:8,fontSize:10,fontWeight:700,color:"var(--muted-foreground)",cursor:"pointer"}}>
                <input type="checkbox" checked={accessFilter==="anomalous"} onChange={e=>setAccessFilter(e.target.checked?"anomalous":"All")} style={{accentColor:RED}}/>
                Anomalous Only
              </label>
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--muted-foreground)"}}>
                {(()=>{
                  let ev=accessEvents;
                  if(accessFilter==="anomalous") ev=ev.filter(e=>e.anomalous);
                  else if(accessFilter!=="All") ev=ev.filter(e=>e.riskLevel===accessFilter);
                  return `${ev.length} of ${accessEvents.length} events`;
                })()}
              </span>
            </div>

            {/* Access Event Table */}
            <TableShell
              cols={["Event","User / Service","Role","Action","Data Store","Data Types","Records","Sensitivity","Risk","Time","Location"]}
              rows={(()=>{
                let ev=accessEvents;
                if(accessFilter==="anomalous") ev=ev.filter(e=>e.anomalous);
                else if(accessFilter!=="All") ev=ev.filter(e=>e.riskLevel===accessFilter);
                return ev.map(e=>{
                  const rClr=e.riskLevel==="Critical"?RED:e.riskLevel==="High"?AMB:e.riskLevel==="Medium"?BLU:EME;
                  return [
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      {e.anomalous && <span style={{color:RED,fontWeight:900,fontSize:11}}>⚡</span>}
                      <Mono style={{fontSize:9}}>{e.eventId}</Mono>
                    </div>,
                    <div>
                      <div style={{fontWeight:700,color:NAV,fontSize:10}}>{e.userName}</div>
                      <div style={{fontSize:9,color:"var(--muted-foreground)"}}>{e.userId} · {e.userDept}</div>
                    </div>,
                    <Chip label={e.userRole} color={e.userRole==="Contractor"?AMB:e.userRole==="Service"?CYN:NAV}/>,
                    <span style={{fontSize:10,fontWeight:700,color:e.action?.includes("EXPORT")||e.action?.includes("BULK")?RED:NAV}}>{e.action}</span>,
                    <span style={{fontSize:10,fontWeight:600}}>{e.storeName}</span>,
                    <div style={{display:"flex",gap:2,flexWrap:"wrap",maxWidth:140}}>
                      {(Array.isArray(e.dataTypes)?e.dataTypes:[]).slice(0,2).map(t=><Chip key={t} label={t} color={t==="PII"||t==="PHI"||t==="SSN"||t==="PCI"?RED:t==="Financial"?AMB:BLU}/>)}
                      {(Array.isArray(e.dataTypes)?e.dataTypes:[]).length>2&&<Chip label={`+${(Array.isArray(e.dataTypes)?e.dataTypes:[]).length-2}`} color="var(--muted-foreground)"/>}
                    </div>,
                    <span style={{fontSize:10,fontFamily:"monospace",color:e.recordCount>10000?RED:e.recordCount>1000?AMB:NAV}}>{(e.recordCount||0).toLocaleString()}</span>,
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${e.sensitivity==="Restricted"?RED:e.sensitivity==="Confidential"?AMB:BLU}18`,color:e.sensitivity==="Restricted"?RED:e.sensitivity==="Confidential"?AMB:BLU,border:`1px solid ${e.sensitivity==="Restricted"?RED:e.sensitivity==="Confidential"?AMB:BLU}33`}}>{e.sensitivity}</span>,
                    <span style={{fontSize:10,fontWeight:800,color:rClr}}>{e.riskLevel}</span>,
                    <Mono style={{fontSize:9}}>{String(e.occurredAt||"").slice(0,16)}</Mono>,
                    <span style={{fontSize:9,color:"var(--muted-foreground)"}}>{e.location}</span>,
                  ];
                });
              })()}
              onRowClick={i=>{
                let ev=accessEvents;
                if(accessFilter==="anomalous") ev=ev.filter(e=>e.anomalous);
                else if(accessFilter!=="All") ev=ev.filter(e=>e.riskLevel===accessFilter);
                const clicked=ev[i];
                setSelectedAccessEvent(clicked===selectedAccessEvent?null:clicked);
              }}
            />

            {/* Access Event Detail — Modal Overlay */}
            {selectedAccessEvent && (
              <div
                style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
                onClick={e=>{if(e.target===e.currentTarget)setSelectedAccessEvent(null);}}
                onKeyDown={(e:any)=>{if(e.key==="Escape")setSelectedAccessEvent(null);}}
                tabIndex={-1}
              >
                <div style={{...card({padding:28}),maxWidth:820,width:"100%",maxHeight:"85vh",overflowY:"auto",position:"relative"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        {selectedAccessEvent.anomalous && (
                          <span style={{fontSize:11,fontWeight:800,color:RED,background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:5,padding:"3px 10px"}}>⚡ ANOMALOUS</span>
                        )}
                        <Mono style={{fontSize:9,color:"var(--muted-foreground)"}}>{selectedAccessEvent.eventId}</Mono>
                      </div>
                      <div style={{fontSize:16,fontWeight:800,color:NAV,marginBottom:3}}>{selectedAccessEvent.userName} → {selectedAccessEvent.storeName}</div>
                      <div style={{fontSize:11,color:"var(--muted-foreground)"}}>{selectedAccessEvent.action} · {String(selectedAccessEvent.occurredAt||"").slice(0,16)} · {selectedAccessEvent.location}</div>
                    </div>
                    <button
                      onClick={()=>setSelectedAccessEvent(null)}
                      style={{background:"rgba(255,255,255,0.08)",border:"1px solid var(--border)",cursor:"pointer",fontSize:16,color:"var(--muted-foreground)",width:30,height:30,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
                    >×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                    {[
                      ["Identity",   selectedAccessEvent.userId],
                      ["Role",       selectedAccessEvent.userRole],
                      ["Department", selectedAccessEvent.userDept],
                      ["Source IP",  selectedAccessEvent.srcIp],
                      ["Location",   selectedAccessEvent.location],
                      ["Data Store", selectedAccessEvent.storeName],
                      ["Sensitivity",selectedAccessEvent.sensitivity],
                      ["Records",    (selectedAccessEvent.recordCount||0).toLocaleString()],
                    ].map(([k,v])=>(
                      <div key={String(k)} style={{background:"var(--input)",borderRadius:8,padding:"10px 12px"}}>
                        <div style={{fontSize:9,fontWeight:800,color:"var(--muted-foreground)",marginBottom:3,textTransform:"uppercase"}}>{k}</div>
                        <div style={{fontSize:11,fontWeight:700,color:
                          (k==="Sensitivity"&&(v==="Restricted"||v==="Confidential"))?RED:
                          (k==="Source IP"&&String(v||"").startsWith("203"))?RED:NAV}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                    {(Array.isArray(selectedAccessEvent.dataTypes)?selectedAccessEvent.dataTypes:[]).map(t=>(
                      <Chip key={t} label={t} color={t==="PII"||t==="PHI"||t==="SSN"||t==="PCI"?RED:t==="Financial"?AMB:BLU}/>
                    ))}
                  </div>
                  {selectedAccessEvent.riskAnnotation && (
                    <div style={{padding:"12px 14px",borderRadius:8,background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.2)",marginBottom:16}}>
                      <div style={{fontSize:9,fontWeight:800,color:RED,marginBottom:4,textTransform:"uppercase"}}>🔍 Risk Annotation</div>
                      <div style={{fontSize:11,color:"var(--foreground)",lineHeight:1.7}}>{selectedAccessEvent.riskAnnotation}</div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,paddingTop:4,borderTop:"1px solid var(--border)"}}>
                    <button style={{padding:"8px 16px",borderRadius:7,background:RED,border:"none",color:"#000",fontSize:11,fontWeight:800,cursor:"pointer"}}>🚨 Create Incident</button>
                    <button style={{padding:"8px 16px",borderRadius:7,background:"transparent",border:`1px solid ${AMB}`,color:AMB,fontSize:11,fontWeight:700,cursor:"pointer"}}>📋 Request Justification</button>
                    <button style={{padding:"8px 16px",borderRadius:7,background:"transparent",border:`1px solid ${NAV}`,color:NAV,fontSize:11,fontWeight:700,cursor:"pointer"}}>🔒 Revoke Access</button>
                    <button onClick={()=>setSelectedAccessEvent(null)} style={{padding:"8px 16px",borderRadius:7,background:"transparent",border:"1px solid var(--border)",color:"var(--muted-foreground)",fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>Close</button>
                  </div>
                </div>
              </div>
            )}

            {/* Over-Access Alerts + Heatmap row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:16}}>
              {/* Over-Access Alerts */}
              <div style={card({padding:"14px 16px"})}>
                <div style={{fontSize:11,fontWeight:800,color:RED,marginBottom:12}}>
                  ⚠ Over-Access Alerts — Identity Risk ({overAccessAlerts.filter(a=>a.status==="open").length} Open)
                </div>
                {overAccessAlerts.length===0 ? (
                  <div style={{textAlign:"center",padding:"20px 0",color:"rgba(148,163,184,0.5)",fontSize:12}}>
                    No over-access alerts detected — all identities within normal baseline
                  </div>
                ) : overAccessAlerts.map(a=>{
                  const sClr=a.severity==="Critical"?RED:a.severity==="High"?AMB:BLU;
                  const statusClr=a.status==="open"?RED:a.status==="investigating"?AMB:EME;
                  return (
                    <div key={a.alertId} style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${sClr}33`,background:`${sClr}06`,marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                            <Mono style={{fontSize:9,color:"var(--muted-foreground)"}}>{a.alertId}</Mono>
                            <Chip label={a.severity} color={sClr}/>
                            <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:3,background:`${statusClr}18`,color:statusClr,border:`1px solid ${statusClr}33`}}>{a.status}</span>
                          </div>
                          <div style={{fontSize:11,fontWeight:700,color:NAV,marginBottom:2}}>{a.alertType}</div>
                          <div style={{fontSize:9,color:"var(--muted-foreground)",marginBottom:4}}>{a.userName} · {a.storeName} · {String(a.detectedAt||"").slice(0,16)}</div>
                          <div style={{fontSize:10,color:"var(--foreground)",lineHeight:1.5}}>{a.description}</div>
                        </div>
                      </div>
                      {a.baselineCount>0 && (
                        <div style={{marginTop:6}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                            <span style={{fontSize:9,color:"var(--muted-foreground)"}}>Volume vs Baseline</span>
                            <span style={{fontSize:9,fontFamily:"monospace",color:sClr,fontWeight:800}}>
                              {(a.accessCount||0).toLocaleString()} vs {(a.baselineCount||0).toLocaleString()} ({Math.round((a.accessCount||1)/(a.baselineCount||1))}×)
                            </span>
                          </div>
                          <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
                            <div style={{width:`${Math.min(100,Math.round(((a.accessCount||1)/Math.max(a.accessCount||1,(a.baselineCount||1)*3))*100))}%`,height:"100%",background:sClr,borderRadius:3}}/>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Access Heatmap + Top Stores */}
              <div style={card({padding:"14px 16px"})}>
                <div style={{fontSize:11,fontWeight:800,color:NAV,marginBottom:8}}>🗓 Access Heatmap — Day × Hour</div>
                {/* Per-store selector */}
                {accessHeatmap?.stores && accessHeatmap.stores.length > 0 && (
                  <div style={{marginBottom:10}}>
                    <select
                      value={heatmapStoreId}
                      onChange={e=>setHeatmapStoreId(e.target.value)}
                      style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input)",color:"var(--foreground)",fontSize:9,fontWeight:600,cursor:"pointer"}}
                    >
                      <option value="">All Stores (global view)</option>
                      {(accessHeatmap.stores as {id:string;name:string}[]).map(s=>(
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {accessHeatmap ? (
                  <>
                    <div style={{display:"flex",gap:2,marginBottom:4,paddingLeft:30}}>
                      {Array.from({length:24},(_,h)=>(
                        <div key={h} style={{flex:1,fontSize:7,color:"var(--muted-foreground)",textAlign:"center",fontFamily:"monospace"}}>{h%6===0?String(h):""}</div>
                      ))}
                    </div>
                    {(accessHeatmap.days||["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map((day,di)=>(
                      <div key={day} style={{display:"flex",gap:2,marginBottom:2,alignItems:"center"}}>
                        <div style={{width:28,fontSize:8,fontWeight:700,color:"var(--muted-foreground)",flexShrink:0}}>{day}</div>
                        {(accessHeatmap.grid?.[di]||new Array(24).fill(0)).map((cnt,hi)=>{
                          const allVals=(accessHeatmap.grid||[]).flat();
                          const mx=Math.max(...allVals,1);
                          const intensity=cnt/mx;
                          const bg=intensity===0?"rgba(255,255,255,0.04)":intensity<0.3?`rgba(96,165,250,${0.2+intensity*0.5})`:`rgba(248,113,113,${0.2+intensity*0.75})`;
                          return (
                            <div key={hi} title={`${day} ${String(hi).padStart(2,"0")}:00 — ${cnt} events`}
                              style={{flex:1,height:14,borderRadius:2,background:bg,cursor:"default"}}/>
                          );
                        })}
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"flex-end",gap:4,marginTop:8,alignItems:"center"}}>
                      <span style={{fontSize:7,color:"var(--muted-foreground)"}}>Low</span>
                      {[0.15,0.3,0.5,0.7,1.0].map(v=>(
                        <div key={v} style={{width:10,height:8,borderRadius:2,background:`rgba(248,113,113,${v})`}}/>
                      ))}
                      <span style={{fontSize:7,color:"var(--muted-foreground)"}}>High</span>
                    </div>
                  </>
                ) : (
                  <div style={{textAlign:"center",padding:"28px 0",color:"rgba(148,163,184,0.4)",fontSize:12}}>Loading heatmap…</div>
                )}

                <div style={{marginTop:14,borderTop:"1px solid var(--border)",paddingTop:12}}>
                  <div style={{fontSize:10,fontWeight:800,color:NAV,marginBottom:2}}>Top 10 Most Accessed Sensitive Stores</div>
                  <div style={{fontSize:8,color:"var(--muted-foreground)",marginBottom:8}}>Restricted / Confidential / PII / PHI / PCI / SSN data types</div>
                  {(()=>{
                    const SENSITIVE_TYPES=new Set(["PII","PHI","PCI","SSN","Financial","Biometric","Health"]);
                    const SENSITIVE_SENS=new Set(["Restricted","Confidential"]);
                    // Filter to only events touching sensitive stores
                    const sensitiveEvents=accessEvents.filter(e=>
                      SENSITIVE_SENS.has(e.sensitivity)||
                      (Array.isArray(e.dataTypes)&&e.dataTypes.some((t:string)=>SENSITIVE_TYPES.has(t)))
                    );
                    const counts:Record<string,{cnt:number;sensitivity:string}>={};
                    sensitiveEvents.forEach(e=>{
                      if(!counts[e.storeName]) counts[e.storeName]={cnt:0,sensitivity:e.sensitivity};
                      counts[e.storeName].cnt++;
                    });
                    const sorted=Object.entries(counts).sort(([,a],[,b])=>b.cnt-a.cnt).slice(0,10);
                    const mx=sorted[0]?sorted[0][1].cnt:1;
                    return sorted.map(([nm,{cnt,sensitivity}])=>{
                      const barClr=sensitivity==="Restricted"?RED:sensitivity==="Confidential"?AMB:NAV;
                      return (
                        <div key={nm} style={{marginBottom:5}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                            <span style={{fontSize:8,color:"var(--foreground)",fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nm}</span>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <span style={{fontSize:7,padding:"1px 4px",borderRadius:3,background:`${barClr}18`,color:barClr,border:`1px solid ${barClr}33`,fontWeight:800}}>{sensitivity}</span>
                              <span style={{fontSize:9,fontFamily:"monospace",color:barClr,fontWeight:700}}>{cnt}</span>
                            </div>
                          </div>
                          <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.07)",overflow:"hidden"}}>
                            <div style={{width:`${(cnt/mx)*100}%`,height:"100%",background:barClr,borderRadius:2}}/>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

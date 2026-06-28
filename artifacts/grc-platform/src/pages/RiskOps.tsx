// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { SubNav, ModuleHeader, Badge, SevBadge, TableShell, Mono } from "@/components/SubNav";
import { useRisks } from "@/hooks/useGrcApi";
import { useOrg } from "@/context/OrgContext";
import WorkflowPipeline, { RISK_MGMT_WF } from "@/components/WorkflowPipeline";
import { Drawer, Field, DrawerSection, DrawerBadge } from "@/components/Drawer";
import { AICopilotBar } from "@/components/AICopilotBar";
import { OwnerPickerModal, RiskLevelModal, EvidenceUploadModal } from "@/components/QuickEditModals";
import RiskRegisterTemplates, { type RiskTemplate } from "./RiskRegisterTemplates";
import Questionnaires from "@/pages/Questionnaires";
import { SmartTable } from "@/components/SmartTable";
import { AppModal, AppModalBody, AppModalFooter } from "@/components/ui/app-modal";
import { WizardModal, type WizardStepDef } from "@/components/ui/wizard-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

// MED-F-031: canonical risk-category taxonomy, shared by create + edit drawers
// (previously the two dropdowns had different lists, so editing could set a
// category not creatable and vice-versa).
const RISK_CATEGORIES = [
  "Cybersecurity", "Data Privacy", "Compliance", "Operational",
  "Third Party", "Financial", "Reputational", "Legal / Regulatory",
  "Vendor", "Strategic",
] as const;

/**
 * Persist imported risks via POST /api/risks, returning the created rows and a
 * count of failures (duplicate names, invalid scores, network). (HIGH-F-016:
 * previously imports were client-side only — setDbRisks without any POST — so
 * they vanished on reload and weren't tenant-shared.)
 */
// FIX: return named failure list (name + reason) instead of an opaque count so
// users know exactly WHICH risks were skipped and WHY (duplicate / invalid / network).
async function persistImportedRisks(risks: any[]): Promise<{ created: any[]; failedItems: { name: string; reason: string }[] }> {
  const token = localStorage.getItem("grc_token") ?? "";
  const created: any[] = [];
  const failedItems: { name: string; reason: string }[] = [];
  for (const r of risks) {
    const rName = String(r.name ?? "").trim();
    try {
      const res = await fetch("/api/risks", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          severity: r.severity ?? "Medium",
          name: rName,
          category: r.category ?? "Cybersecurity",
          description: r.description ?? "",
          score: Number(r.score) || 50,
          owner: r.owner ?? "",
          ownerFull: r.ownerFull ?? r.owner ?? "",
        }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => null);
        if (d) created.push(d);
        else failedItems.push({ name: rName, reason: "server returned no data" });
      } else {
        const errBody = await res.json().catch(() => ({}));
        const reason = res.status === 409
          ? "duplicate name — already exists"
          : res.status === 400
          ? `invalid data: ${errBody?.error ?? "unknown"}`
          : `HTTP ${res.status}`;
        failedItems.push({ name: rName, reason });
      }
    } catch {
      failedItems.push({ name: rName, reason: "network error" });
    }
  }
  return { created, failedItems };
}

// ── ASRY description parser (mirrors RiskProfile.parseAsry) ──────────────────
function parseAsryDesc(desc: string) {
  const g = (key: string) => {
    const m = desc.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Za-z]|$)`, "s"));
    return m ? m[1].trim() : "";
  };
  return {
    asset: g("Asset"), custodian: g("Custodian"), location: g("Location"),
    c: g("C"), iVal: g("I"), a: g("A"),
    vulnerability: g("Vulnerability"), probability: g("Probability"), impact: g("Impact"),
    riskScore: g("RiskScore"), controls: g("Controls"), iso27001: g("ISO27001"),
    residualProb: g("ResidualProb"), residualImpact: g("ResidualImpact"),
    residualScore: g("ResidualScore"), recommendedAction: g("RecommendedAction"),
    mgmtResponse: g("MgmtResponse"), department: g("Department"),
    targetDate: g("TargetDate"), mitigationProgress: g("MitigationProgress") || "0",
  };
}

// ── AIGO-X Intelligence recommendation engine ────────────────────────────────
function generateAigoRecs(category: string, severity: string, c: string, iVal: string, a: string, controls: string, vulnerability: string) {
  const recs: { icon: string; priority: "Critical"|"High"|"Medium"|"Advisory"; title: string; detail: string; framework?: string }[] = [];
  const sevHigh = severity === "Critical" || severity === "High";
  const cNum = Number(c)||0, iNum = Number(iVal)||0, aNum = Number(a)||0;

  if (sevHigh) recs.push({ icon:"🚨", priority:"Critical", title:"CISO Escalation Required", detail:`${severity} risks must reach CISO awareness within 24 hours per ISO 27001 A.5.24. Document decision and response timeline.`, framework:"ISO 27001 A.5.24" });

  const catMap: Record<string, { icon:string; title:string; detail:string; framework:string }[]> = {
    "Cybersecurity": [
      { icon:"🛡️", title:"Deploy Endpoint Detection & Response", detail:"Ensure CrowdStrike, SentinelOne or Defender for Endpoint is active on all hosts in scope. Check EDR telemetry for this threat.", framework:"NIST CSF: Detect DE.CM-4" },
      { icon:"🔄", title:"Emergency Patch Cycle", detail:"Trigger an out-of-band patch assessment. Critical CVEs must be patched within 72 hours on internet-facing systems per SLA.", framework:"ISO 27001 A.8.8" },
      { icon:"🔐", title:"Privileged Access Review", detail:"Audit all privileged accounts with access to affected assets. Enforce MFA and apply least-privilege within 48 hours.", framework:"CIS Control 5" },
    ],
    "Data Privacy": [
      { icon:"📋", title:"DPIA May Be Required", detail:"If this risk involves processing of personal data, complete a Data Protection Impact Assessment before remediation changes go live.", framework:"GDPR Art. 35" },
      { icon:"🗄️", title:"Data Minimisation Audit", detail:"Review data retention schedules for assets in scope. Delete or anonymise data no longer needed for its original purpose.", framework:"GDPR Art. 5(1)(e)" },
      { icon:"📣", title:"Breach Notification Readiness", detail:"Confirm your 72-hour notification procedure to the DPA is documented and the DPO is informed of this risk.", framework:"GDPR Art. 33" },
    ],
    "Compliance": [
      { icon:"📑", title:"Gap Analysis Against Framework", detail:"Map this risk to the relevant control domain and document the exact gap. Use your framework gap register to track closure.", framework:"ISO 27001 A.5.36" },
      { icon:"⚖️", title:"Legal / Regulatory Review", detail:"Engage your legal team to confirm whether this risk creates reportable obligations to regulators or contractual counterparties.", framework:"ISO 27001 A.5.31" },
    ],
    "Operational": [
      { icon:"📦", title:"Business Continuity Plan Review", detail:"Verify this risk is covered by your BCP/DRP. Confirm RTO and RPO targets are achievable given the current exposure.", framework:"ISO 22301 §8.4" },
      { icon:"🧪", title:"Tabletop Exercise", detail:"Run a tabletop exercise with impacted teams to test response readiness for this specific operational risk scenario.", framework:"NIST SP 800-84" },
    ],
    "Third Party": [
      { icon:"📝", title:"Vendor Risk Assessment Due", detail:"Issue an updated security questionnaire to the third party. Include evidence requests for pen-test, SOC 2 or ISO cert.", framework:"ISO 27001 A.5.19" },
      { icon:"⚖️", title:"Contract DPA / SLA Review", detail:"Confirm breach notification clauses, liability limits and data processing obligations are current in the vendor contract.", framework:"ISO 27001 A.5.20" },
    ],
    "Financial": [
      { icon:"💰", title:"Quantify Financial Exposure", detail:"Estimate annualised loss expectancy (ALE = ARO × SLE). This supports risk transfer (cyber insurance) decision-making.", framework:"FAIR Model" },
      { icon:"🏦", title:"Insurance Coverage Check", detail:"Confirm cyber insurance policy covers this risk category and the exposure amount. Update insurer if material change.", framework:"ISO 27001 A.5.36" },
    ],
  };
  const catRecs = catMap[category] ?? catMap["Cybersecurity"];
  recs.push(...catRecs.slice(0, 2).map(r => ({ ...r, priority: "High" as const })));

  if (cNum >= 4) recs.push({ icon:"🔒", priority:"High", title:"Data Classification & Encryption", detail:`Confidentiality rating C:${cNum}/5 — ensure data at rest and in transit is encrypted (AES-256/TLS 1.3). Apply data classification labels.`, framework:"ISO 27001 A.8.24" });
  if (iNum >= 4) recs.push({ icon:"✏️", priority:"High", title:"Integrity Controls & Change Management", detail:`Integrity rating I:${iNum}/5 — implement file integrity monitoring and enforce change management on affected systems.`, framework:"ISO 27001 A.8.9" });
  if (aNum >= 4) recs.push({ icon:"⚡", priority:"Medium", title:"Redundancy & Failover Validation", detail:`Availability rating A:${aNum}/5 — validate failover procedures, review HA config and confirm backup restoration tests are current.`, framework:"ISO 22301 §8.4" });

  const hasEdr    = /edr|crowdstrike|sentinel|defender|endpoint/i.test(controls);
  const hasMfa    = /mfa|2fa|totp|yubikey|authenticat/i.test(controls);
  const hasFirewall = /firewall|ngfw|palo alto|fortinet|checkpoint/i.test(controls);
  if (!hasEdr)     recs.push({ icon:"🖥️", priority:"Advisory", title:"EDR Not Documented", detail:"No Endpoint Detection & Response tool is recorded in existing controls. Document your EDR solution or deploy one if absent.", framework:"CIS Control 13" });
  if (!hasMfa)     recs.push({ icon:"🔑", priority:"Advisory", title:"MFA Status Unknown", detail:"Multi-Factor Authentication is not mentioned in existing controls. Confirm MFA is enforced on all accounts with access to affected assets.", framework:"CIS Control 6.3" });
  if (!hasFirewall && category === "Cybersecurity") recs.push({ icon:"🧱", priority:"Advisory", title:"Firewall Controls Not Documented", detail:"No perimeter firewall is recorded. Document NGFW/WAF rules covering this risk surface.", framework:"CIS Control 12" });

  if (!vulnerability.trim()) recs.push({ icon:"📝", priority:"Advisory", title:"Vulnerability Details Missing", detail:"Complete the Vulnerability/Weakness field. Detailed descriptions improve AI risk scoring accuracy and audit traceability.", framework:"ISO 27001 A.5.36" });

  return recs.slice(0, 7);
}

export default function RiskOps() {
  const [, navigate] = useLocation();
  const { viewTenantId } = useOrg();
  const [tab, setTab] = useState("overview");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [selectedCellRisks, setSelectedCellRisks] = useState<string[] | null>(null);
  const [selRisk, setSelRisk] = useState<any>(null);
  const [selVendor, setSelVendor] = useState<typeof tprmVendors[0] | null>(null);
  const [selTreatment, setSelTreatment] = useState<any>(null);

  // ── Treatment CRUD state ────────────────────────────────────────────────────
  const [showTrtModal,  setShowTrtModal]  = useState(false);
  const [trtEditTarget, setTrtEditTarget] = useState<any>(null); // null = create, object = edit
  const [trtSaving,     setTrtSaving]     = useState(false);
  const [trtDeleting,   setTrtDeleting]   = useState(false);
  const [trtErr,        setTrtErr]        = useState("");
  const [trtForm,       setTrtForm]       = useState({ riskId:"", name:"", type:"Mitigate", owner:"", dueDate:"", priority:"High", status:"open", notes:"" });

  // ── Appetite inline edit state ───────────────────────────────────────────────
  const [editingAppetite,   setEditingAppetite]   = useState<number|null>(null);
  const [appetiteEditVals,  setAppetiteEditVals]  = useState<{threshold:number;current:number}>({ threshold:0, current:0 });
  const [appetiteSaving,    setAppetiteSaving]    = useState(false);

  const { data: apiRisksData } = useRisks();
  const qc = useQueryClient(); // MED-F-027: invalidate ["risks"] after server writes so RiskProfile isn't stale
  const [dbRisks, setDbRisks] = useState<any[]>([]);
  const [dbCascades, setDbCascades] = useState<any[]>([]); // LOW-F-010: real cascade data from API
  const [dbVendors, setDbVendors] = useState<typeof tprmVendors>([]);
  const [dbAppetite, setDbAppetite] = useState<typeof appetite>([]);
  const [dbTreatments, setDbTreatments] = useState<typeof treatments>([]);

  useEffect(() => {
    if (apiRisksData && apiRisksData.length > 0 && dbRisks.length === 0) {
      setDbRisks(apiRisksData.map((r: any) => ({ ...r, _dbId: r.id, id: r.riskId ?? r.id })));
    }
  }, [apiRisksData]);

  // LOW-F-010: fetch real cascade data from the API.
  useEffect(() => {
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization:`Bearer ${token}` } : {};
    fetch("/api/risks/cascades", { headers: H })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d) && d.length > 0) setDbCascades(d); })
      .catch(() => {});
  }, []);

  const blankRisk = { name:"", category:"Cybersecurity", severity:"High", description:"", score:"70", owner:"", ownerFull:"" };
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...blankRisk });
  const [extraFields, setExtraFields] = useState<Record<string,string>>({});
  const [creating,   setCreating]   = useState(false);
  const cf = (field: string, value: string) => setCreateForm(f => ({ ...f, [field]: value }));

  // ── Risk creation wizard ──────────────────────────────────────────────────
  const RISK_WIZARD_STEPS: WizardStepDef[] = [
    { id:"identity",   title:"Core Identity",       icon:"🎯", subtitle:"Risk name, category, severity and ownership" },
    { id:"asset",      title:"Asset Context",        icon:"🏢", subtitle:"Affected assets, custodian and location" },
    { id:"cia",        title:"CIA Ratings",          icon:"🔐", subtitle:"Confidentiality, Integrity and Availability (1–5 each)" },
    { id:"assessment", title:"Risk Assessment",      icon:"⚠️", subtitle:"Vulnerability details, probability and impact scores" },
    { id:"controls",   title:"Controls",             icon:"🛡️", subtitle:"Existing controls and ISO 27001:2022 references" },
    { id:"treatment",  title:"Residual & Treatment", icon:"💊", subtitle:"Residual scores, recommended action and management response" },
  ];
  const blankWf = {
    name:"", category:"Cybersecurity", severity:"High", score:"50", owner:"", ownerFull:"",
    asset:"", custodian:"", location:"",
    c:"", iVal:"", a:"",
    vulnerability:"", probability:"", impact:"", riskScore:"",
    controls:"", iso27001:"",
    residualProb:"", residualImpact:"", residualScore:"",
    recommendedAction:"", mgmtResponse:"",
  };
  type WfType = typeof blankWf;
  const [wizStep, setWizStep] = useState(0);
  const [wf, setWf] = useState<WfType>({ ...blankWf });
  const wu = (k: keyof WfType) => (v: string) => setWf(p => ({ ...p, [k]: v }));
  const wizCanNext = [
    wf.name.trim() !== "" && wf.owner.trim() !== "",
    true,
    true,
    wf.vulnerability.trim() !== "",
    true,
    true,
  ][wizStep] ?? true;

  const blankEditRisk = {
    name:"", category:"Cybersecurity", severity:"High" as const, score:"70", status:"identified",
    owner:"", ownerFull:"", department:"",
    asset:"", custodian:"", location:"",
    c:"", iVal:"", a:"",
    vulnerability:"", probability:"", impact:"", riskScore:"",
    controls:"", iso27001:"",
    residualProb:"", residualImpact:"", residualScore:"",
    recommendedAction:"", mgmtResponse:"",
    targetDate:"", mitigationProgress:"0",
  };
  const [showEditRisk, setShowEditRisk] = useState(false);
  const [editRiskForm, setEditRiskForm] = useState({ ...blankEditRisk });
  const [editRiskTarget, setEditRiskTarget] = useState<{id:string;name:string} | null>(null);
  const [savingRisk, setSavingRisk] = useState(false);
  const [enrichingRisk, setEnrichingRisk] = useState<string|null>(null);
  const [confirmDelRisk, setConfirmDelRisk] = useState<{id:string;name:string} | null>(null);
  const [confirmDelBulk, setConfirmDelBulk] = useState<{ids:string[];count:number} | null>(null);
  const [delError, setDelError] = useState("");
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
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [vendorCreateForm, setVendorCreateForm] = useState({ name:"", category:"", contact:"", tier:"2", critical:false });
  const [vendorCreateSaving, setVendorCreateSaving] = useState(false);
  const [vendorCreateError, setVendorCreateError] = useState("");
  const [activeTemplate,  setActiveTemplate]  = useState<RiskTemplate | null>(null);
  const actBtn: React.CSSProperties = { background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:5, width:24, height:24, cursor:"pointer", fontSize:11, display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit", flexShrink:0, lineHeight:1, padding:0, color:"rgba(148,163,184,0.8)" };
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
      const score = Math.max(0, Math.min(100, Number(r.score) || 0));
      // HIGH-F-014: likelihood bands for a 0–100 score (quintiles).
      // Previously thresholds 8/6/4/2 assumed a 1–10 scale, so nearly every
      // risk (score >= 8) collapsed into the max-likelihood column.
      const l = score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1;
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
          severity: createForm.severity,
          description: [
            createForm.description,
            Object.entries(extraFields).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(" | "),
          ].filter(Boolean).join("\n"),
          score: Number(createForm.score) || 50,
          owner: createForm.owner,
          ownerFull: createForm.ownerFull || createForm.owner,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setDbRisks(prev => [{ ...d, _dbId: d.id, id: d.riskId ?? d.id }, ...prev]);
        qc.invalidateQueries({ queryKey: ["risks"] }); // MED-F-027
        setShowCreate(false);
        setCreateForm({ ...blankRisk });
        setExtraFields({});
      }
    } catch (_) {}
    setCreating(false);
  };

  const handleCreateWizard = async () => {
    if (!wf.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setCreating(true);
    try {
      const cNum = Math.max(1, Number(wf.c) || 1);
      const iNum = Math.max(1, Number(wf.iVal) || 1);
      const aNum = Math.max(1, Number(wf.a) || 1);
      const pNum = Math.max(1, Number(wf.probability) || 1);
      const impNum = Math.max(1, Number(wf.impact) || 1);
      const resP = Math.max(1, Number(wf.residualProb) || 1);
      const resI = Math.max(1, Number(wf.residualImpact) || 1);
      const hasCia = wf.c && wf.iVal && wf.a && wf.probability && wf.impact;
      const computedCia = cNum * iNum * aNum;
      const computedInherent = computedCia * pNum * impNum;
      const computedResidual = computedCia * resP * resI;
      const computedScore = hasCia
        ? Math.min(100, Math.round(computedInherent / 3125 * 100))
        : Math.min(100, Math.max(0, Number(wf.score) || 50));
      const desc = [
        wf.asset          && `Asset: ${wf.asset}`,
        wf.vulnerability  && `Vulnerability: ${wf.vulnerability}`,
        wf.controls       && `Controls: ${wf.controls}`,
        wf.iso27001       && `ISO27001: ${wf.iso27001}`,
        wf.probability    && `Probability: ${wf.probability}`,
        wf.impact         && `Impact: ${wf.impact}`,
        hasCia            && `RiskScore: ${computedInherent}`,
        wf.residualProb   && `ResidualProb: ${wf.residualProb}`,
        wf.residualImpact && `ResidualImpact: ${wf.residualImpact}`,
        hasCia            && `ResidualScore: ${computedResidual}`,
        wf.recommendedAction && `RecommendedAction: ${wf.recommendedAction}`,
        wf.mgmtResponse   && `MgmtResponse: ${wf.mgmtResponse}`,
        wf.custodian      && `Custodian: ${wf.custodian}`,
        wf.location       && `Location: ${wf.location}`,
        hasCia            && `CIAScore: ${computedCia}`,
        wf.c              && `C: ${wf.c}`,
        wf.iVal           && `I: ${wf.iVal}`,
        wf.a              && `A: ${wf.a}`,
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/risks", {
        method: "POST", headers: H,
        body: JSON.stringify({
          name: wf.name.trim(), category: wf.category, severity: wf.severity,
          description: desc,
          score: computedScore,
          cVal: cNum, iVal: iNum, aVal: aNum,
          probability: pNum, impactVal: impNum,
          residualProbability: resP, residualImpact: resI,
          owner: wf.owner.trim(), ownerFull: wf.ownerFull || wf.owner,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setDbRisks(prev => [{ ...d, _dbId: d.id, id: d.riskId ?? d.id }, ...prev]);
        qc.invalidateQueries({ queryKey: ["risks"] });
        setShowCreate(false);
        setWf({ ...blankWf });
        setWizStep(0);
      }
    } catch (_) {}
    setCreating(false);
  };

  const openEditRisk = (r: any) => {
    const id = r.riskId ?? r.id;
    setEditRiskTarget({ id, name: r.name });
    const p = parseAsryDesc(r.description ?? "");
    setEditRiskForm({
      name: r.name ?? "",
      category: r.category ?? "Cybersecurity",
      severity: r.severity ?? "High",
      score: String(r.score ?? 70),
      status: r.status ?? "identified",
      owner: r.owner ?? "",
      ownerFull: r.ownerFull ?? r.owner ?? "",
      department: p.department,
      asset: p.asset,
      custodian: p.custodian,
      location: p.location,
      c: (r.cVal > 0 ? String(r.cVal) : p.c),
      iVal: (r.iVal > 0 ? String(r.iVal) : p.iVal),
      a: (r.aVal > 0 ? String(r.aVal) : p.a),
      vulnerability: p.vulnerability,
      probability: (r.probability > 0 ? String(r.probability) : p.probability),
      impact: (r.impactVal > 0 ? String(r.impactVal) : p.impact),
      riskScore: (r.inherentScore > 0 ? String(r.inherentScore) : p.riskScore),
      controls: p.controls,
      iso27001: p.iso27001,
      residualProb: (r.residualProbability > 0 ? String(r.residualProbability) : p.residualProb),
      residualImpact: (r.residualImpact > 0 ? String(r.residualImpact) : p.residualImpact),
      residualScore: (r.residualScoreVal > 0 ? String(r.residualScoreVal) : p.residualScore),
      recommendedAction: p.recommendedAction,
      mgmtResponse: p.mgmtResponse,
      targetDate: p.targetDate,
      mitigationProgress: p.mitigationProgress || "0",
    });
    setShowEditRisk(true);
  };

  const handleSaveRisk = async () => {
    if (!editRiskTarget || !editRiskForm.name.trim()) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    setSavingRisk(true);
    try {
      const ef = editRiskForm;
      const eCNum = Math.max(1, Number(ef.c) || 1);
      const eINum = Math.max(1, Number(ef.iVal) || 1);
      const eANum = Math.max(1, Number(ef.a) || 1);
      const ePNum = Math.max(1, Number(ef.probability) || 1);
      const eImpNum = Math.max(1, Number(ef.impact) || 1);
      const eResP = Math.max(1, Number(ef.residualProb) || 1);
      const eResI = Math.max(1, Number(ef.residualImpact) || 1);
      const eHasCia = ef.c && ef.iVal && ef.a && ef.probability && ef.impact;
      const eComputedCia = eCNum * eINum * eANum;
      const eComputedInherent = eComputedCia * ePNum * eImpNum;
      const eComputedResidual = eComputedCia * eResP * eResI;
      const eComputedScore = eHasCia
        ? Math.min(100, Math.round(eComputedInherent / 3125 * 100))
        : Math.min(100, Math.max(0, Number(ef.score) || 50));
      const desc = [
        ef.department       && `Department: ${ef.department}`,
        ef.asset            && `Asset: ${ef.asset}`,
        ef.vulnerability    && `Vulnerability: ${ef.vulnerability}`,
        ef.controls         && `Controls: ${ef.controls}`,
        ef.iso27001         && `ISO27001: ${ef.iso27001}`,
        ef.probability      && `Probability: ${ef.probability}`,
        ef.impact           && `Impact: ${ef.impact}`,
        eHasCia             && `RiskScore: ${eComputedInherent}`,
        ef.residualProb     && `ResidualProb: ${ef.residualProb}`,
        ef.residualImpact   && `ResidualImpact: ${ef.residualImpact}`,
        eHasCia             && `ResidualScore: ${eComputedResidual}`,
        ef.recommendedAction && `RecommendedAction: ${ef.recommendedAction}`,
        ef.mgmtResponse     && `MgmtResponse: ${ef.mgmtResponse}`,
        ef.custodian        && `Custodian: ${ef.custodian}`,
        ef.location         && `Location: ${ef.location}`,
        eHasCia             && `CIAScore: ${eComputedCia}`,
        ef.c                && `C: ${ef.c}`,
        ef.iVal             && `I: ${ef.iVal}`,
        ef.a                && `A: ${ef.a}`,
        ef.targetDate       && `TargetDate: ${ef.targetDate}`,
        Number(ef.mitigationProgress) > 0 && `MitigationProgress: ${ef.mitigationProgress}`,
      ].filter(Boolean).join("\n");
      const body = {
        name: ef.name, category: ef.category, severity: ef.severity,
        description: desc, score: eComputedScore,
        cVal: eCNum, iVal: eINum, aVal: eANum,
        probability: ePNum, impactVal: eImpNum,
        residualProbability: eResP, residualImpact: eResI,
        owner: ef.owner, ownerFull: ef.ownerFull||ef.owner,
        status: ef.status,
      };
      const res = await fetch(`/api/risks/${editRiskTarget.id}`, { method:"PATCH", headers:H, body:JSON.stringify(body) });
      if (res.ok) {
        setDbRisks(prev => prev.map((r:any)=>(r.riskId??r.id)===editRiskTarget.id?{...r,...body}:r));
        qc.invalidateQueries({ queryKey: ["risks"] });
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
      const riskRow = dbRisks.find(r => String(r.riskId ?? r.id) === confirmDelRisk.id || String(r._dbId ?? r.id) === confirmDelRisk.id);
      const apiId = riskRow?._dbId ?? confirmDelRisk.id;
      const res = await fetch(`/api/risks/${apiId}`, { method:"DELETE", headers:H });
      if (res.ok || res.status===204) {
        setDbRisks(prev => { const base=prev; return base.filter((r:any)=>(r.riskId??r.id)!==confirmDelRisk.id); });
        qc.invalidateQueries({ queryKey: ["risks"] }); // MED-F-027
        setConfirmDelRisk(null);
      } else {
        // MED-F-026: surface the failure instead of silent catch.
        setDelError(`Failed to delete (HTTP ${res.status}).`);
      }
    } catch (_) { setDelError("Network error deleting risk."); }
    setDeletingRisk(false);
  };

  // MED-F-025: bulk delete — delete every selected id (was ids.slice(0,1)).
  const [deletingBulk, setDeletingBulk] = useState(false);
  const handleConfirmBulkDel = async () => {
    if (!confirmDelBulk) return;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization:`Bearer ${token}` } : {};
    setDeletingBulk(true);
    try {
      const removed: string[] = [];
      await Promise.all(confirmDelBulk.ids.map(async id => {
        try {
          const riskRow = dbRisks.find(r => String(r.riskId ?? r.id) === id || String(r._dbId ?? r.id) === id);
          const apiId = riskRow?._dbId ?? id;
          const res = await fetch(`/api/risks/${apiId}`, { method:"DELETE", headers:H });
          if (res.ok || res.status===204) removed.push(id);
        } catch { /* skip this one */ }
      }));
      if (removed.length > 0) {
        setDbRisks(prev => prev.filter((r:any) => !removed.includes(String(r.riskId ?? r.id))));
      qc.invalidateQueries({ queryKey: ["risks"] }); // MED-F-027
      }
      const failedCount = confirmDelBulk.ids.length - removed.length;
      setDelError(failedCount > 0 ? `${removed.length} deleted, ${failedCount} failed.` : "");
      setConfirmDelBulk(null);
    } catch { setDelError("Network error during bulk delete."); }
    setDeletingBulk(false);
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
        qc.invalidateQueries({ queryKey: ["risks"] }); // MED-F-027
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

  // ── Treatment CRUD handlers ──────────────────────────────────────────────────
  const openAddTreatment = () => {
    setTrtEditTarget(null);
    setTrtForm({ riskId:"", name:"", type:"Mitigate", owner:"", dueDate:"", priority:"High", status:"pending", notes:"" });
    setTrtErr(""); setShowTrtModal(true);
  };
  const openEditTreatment = (t: any) => {
    setTrtEditTarget(t);
    setTrtForm({ riskId: t.riskId??"", name: t.name??"", type: t.type??"Mitigate", owner: t.owner??"", dueDate: t.dueDate??"", priority: t.priority??"High", status: t.status??"pending", notes: t.notes??"" });
    setTrtErr(""); setShowTrtModal(true);
  };
  const handleSaveTreatment = async () => {
    if (!trtForm.name.trim()) { setTrtErr("Treatment name is required."); return; }
    const tok = localStorage.getItem("grc_token") ?? "";
    const H = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
    setTrtSaving(true); setTrtErr("");
    try {
      let res: Response;
      if (trtEditTarget) {
        res = await fetch(`/api/risks/treatments/${trtEditTarget.id}`, { method:"PATCH", headers:H, body:JSON.stringify(trtForm) });
      } else {
        res = await fetch("/api/risks/treatments", { method:"POST", headers:H, body:JSON.stringify(trtForm) });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setTrtErr(d.error ?? `Failed (HTTP ${res.status})`); return; }
      if (trtEditTarget) {
        setDbTreatments(prev => prev.map((t:any) => t.id === d.id ? d : t));
        if (selTreatment?.id === d.id) setSelTreatment(d);
      } else {
        setDbTreatments(prev => [...prev, d]);
      }
      setShowTrtModal(false);
    } catch { setTrtErr("Network error — please try again."); }
    finally { setTrtSaving(false); }
  };
  const handleDeleteTreatment = async (t: any) => {
    const tok = localStorage.getItem("grc_token") ?? "";
    setTrtDeleting(true);
    try {
      const res = await fetch(`/api/risks/treatments/${t.id}`, { method:"DELETE", headers:{ Authorization:`Bearer ${tok}` } });
      if (res.ok || res.status === 204) {
        setDbTreatments(prev => prev.filter((x:any) => x.id !== t.id));
        if (selTreatment?.id === t.id) setSelTreatment(null);
      }
    } catch { /* silent */ }
    finally { setTrtDeleting(false); }
  };

  // ── Appetite inline-edit handlers ────────────────────────────────────────────
  const handleSaveAppetite = async (id: number) => {
    const tok = localStorage.getItem("grc_token") ?? "";
    setAppetiteSaving(true);
    try {
      const res = await fetch(`/api/risks/appetite/${id}`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${tok}`, "Content-Type":"application/json" },
        body: JSON.stringify({ threshold: appetiteEditVals.threshold, current: appetiteEditVals.current }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d) {
        setDbAppetite(prev => prev.map((a:any) => a.id === id ? d : a));
      }
    } catch { /* silent */ }
    finally { setAppetiteSaving(false); setEditingAppetite(null); }
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
        status: o.status||o.Status||"identified",
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
          status: r.status||"identified",
          trend: r.trend||"stable",
          description: r.description||"",
          aiInsights:[], };
      });
    } catch { return []; }
  }

  // ── World-class multi-sheet Risk Register export (Big4 styled) ─────────
  function exportRegister(format: "csv" | "xlsx") {
    const risks = riskSevFilter === "All" ? lRisks : lRisks.filter((r:any) => r.severity === riskSevFilter);
    const suffix = activeTemplate ? `-${activeTemplate.id}` : "";
    const dateStr = new Date().toISOString().slice(0, 10);

    const getDesc = (desc: string, key: string) => {
      const m = desc?.match(new RegExp(`^${key}:\\s*(.*)`, "mi"));
      return m ? m[1].trim() : "";
    };
    const getCIA = (sev: string) => {
      if (sev === "Critical") return { c:3, i:3, a:3 };
      if (sev === "High")     return { c:3, i:3, a:2 };
      if (sev === "Medium")   return { c:2, i:2, a:2 };
      return { c:1, i:2, a:1 };
    };
    const getPI = (sev: string) => {
      if (sev === "Critical") return { prob:3, impact:3 };
      if (sev === "High")     return { prob:3, impact:2 };
      if (sev === "Medium")   return { prob:2, impact:2 };
      return { prob:1, impact:2 };
    };
    const riskRating = (score: number) =>
      score >= 18 ? "CRITICAL" : score >= 12 ? "HIGH" : score >= 6 ? "MEDIUM" : "LOW";
    const mgmtResp = (r: any, desc: string) =>
      getDesc(desc, "MgmtResponse") ||
      (r.status === "accepted"   ? "Risk Accepted by Management"       :
       r.status === "treating"   ? "Risk Mitigation in Progress"        :
       r.status === "assessing"  ? "Risk Under Assessment"              :
       r.status === "identified" ? "Risk Identified – Pending Decision" : "");

    // Build flat row list — every threat gets its OWN sequential S.No
    const rows = risks.map((r: any, idx: number) => {
      const desc = r.description || "";
      const cia  = getCIA(r.severity);
      const pi   = getPI(r.severity);
      const ciaScore  = cia.c * cia.i * cia.a;
      const riskScore = ciaScore * pi.prob * pi.impact;
      const resProb   = Math.max(1, pi.prob - 1);
      const resImpact = Math.max(1, pi.impact - 1);
      const resScore  = ciaScore * resProb * resImpact;
      const asset =
        getDesc(desc, "Asset") ||
        (Array.isArray(r.linkedAssets) && r.linkedAssets.length > 0 ? r.linkedAssets[0].name : "") ||
        (r.linkedAsset?.name || "") || r.category || "General";
      const linkedCtrlNames = Array.isArray(r.linkedControls)
        ? r.linkedControls.map((c: any) => c.name || c.id).filter(Boolean).join(", ") : "";
      return {
        sno: idx + 1, id: r.id || r.riskId || "",
        asset, category: r.category || "", owner: r.ownerFull || r.owner || "",
        custodian: getDesc(desc, "Custodian"), location: getDesc(desc, "Location"),
        c: cia.c, i: cia.i, a: cia.a, ciaScore,
        threat: r.name || "",
        vulnerability: getDesc(desc, "Vulnerability") || desc.slice(0, 120),
        prob: pi.prob, impact: pi.impact, riskScore,
        controls: getDesc(desc, "Controls") || linkedCtrlNames,
        iso27001: getDesc(desc, "ISO27001") || "",
        resProb, resImpact, resScore,
        recAction: getDesc(desc, "RecommendedAction") || "",
        mgmt: mgmtResp(r, desc),
        severity: r.severity || "Low", status: r.status || "", trend: r.trend || "",
      };
    });
    const total = rows.length;

    // ── CSV: flat 22-column export ───────────────────────────────────────
    if (format === "csv") {
      const CSV_H = ["S.No","Assets/Process","Category","Owner","Custodian","Location","C","I","A","CIA Score","Threat / Risk","Vulnerability","Probability","Impact","Risk Score","Existing Controls","Controls From ISO 27001:2022","Residual Probability","Residual Impact","Residual Risk Score","Risk Rating","Recommended Action","Management Response"];
      const aoa = [CSV_H, ...rows.map(r => [r.sno,r.asset,r.category,r.owner,r.custodian,r.location,r.c,r.i,r.a,r.ciaScore,r.threat,r.vulnerability,r.prob,r.impact,r.riskScore,r.controls,r.iso27001,r.resProb,r.resImpact,r.resScore,riskRating(r.riskScore),r.recAction,r.mgmt])];
      const csv = aoa.map(row => row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href=url; a.download=`risk-register${suffix}-${dateStr}.csv`; a.click(); URL.revokeObjectURL(url);
      return;
    }

    // ── XLSX: 8-sheet Big4-quality styled workbook ───────────────────────
    const XS = XLSXStyle;
    const wb = XS.utils.book_new();
    const mks = (w: number[]) => w.map(wch=>({wch}));

    // ── Style engine ────────────────────────────────────────────────────
    const C = { navy:"1E3A5F", blue:"2B579A", accent:"4472C4", ltBlue:"EBF3FB", white:"FFFFFF",
                critical:"C00000", high:"E26B0A", medium:"FFC000", low:"375623",
                heatCrit:"FF0000", heatHigh:"FF8C00", heatMed:"FFD700", heatLow:"92D050", heatNone:"F2F2F2",
                sepBg:"D6E4F0", gray:"F5F5F5", dkGray:"595959" };
    const bdr = (rgb="D9D9D9") => ({top:{style:"thin",color:{rgb}},bottom:{style:"thin",color:{rgb}},left:{style:"thin",color:{rgb}},right:{style:"thin",color:{rgb}}});
    const thkBdr = () => ({top:{style:"medium",color:{rgb:C.navy}},bottom:{style:"medium",color:{rgb:C.navy}},left:{style:"medium",color:{rgb:C.navy}},right:{style:"medium",color:{rgb:C.navy}}});
    const fnt = (sz=10,bold=false,rgb="000000") => ({name:"Calibri",sz,bold,color:{rgb}});
    const aln = (h="left",v="center",wrap=false) => ({horizontal:h,vertical:v,wrapText:wrap});

    const sTitleWide = () => ({font:fnt(18,true,C.white),fill:{fgColor:{rgb:C.navy}},alignment:aln("center","center")});
    const sSubtitle  = () => ({font:fnt(10,false,C.white), fill:{fgColor:{rgb:C.blue}}, alignment:aln("left","center")});
    const sSecHdr    = () => ({font:fnt(11,true,C.white),  fill:{fgColor:{rgb:C.blue}}, alignment:aln("left","center"), border:bdr(C.blue)});
    const sColHdr    = (h="center") => ({font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.accent}},alignment:aln(h,"center",true),border:bdr("5B9BD5")});
    const sData      = (odd=false,h="left",wrap=true) => ({font:fnt(10),fill:{fgColor:{rgb:odd?C.ltBlue:C.white}},alignment:aln(h,"top",wrap),border:bdr()});
    const sNum       = (odd=false) => ({font:fnt(10),fill:{fgColor:{rgb:odd?C.ltBlue:C.white}},alignment:aln("center","top"),border:bdr()});
    const sBlankRow  = (bg=C.white) => ({font:fnt(10),fill:{fgColor:{rgb:bg}},border:bdr(bg)});
    const ratingS    = (rating:string,odd=false) => {
      const m:Record<string,any> = {
        CRITICAL:{font:fnt(10,true,C.white), fill:{fgColor:{rgb:C.critical}},alignment:aln("center","center"),border:bdr("9C0006")},
        HIGH:    {font:fnt(10,true,C.white), fill:{fgColor:{rgb:C.high}},    alignment:aln("center","center"),border:bdr("9C4100")},
        MEDIUM:  {font:fnt(10,true,"7F4C00"),fill:{fgColor:{rgb:C.medium}},  alignment:aln("center","center"),border:bdr("BF8F00")},
        LOW:     {font:fnt(10,true,C.white), fill:{fgColor:{rgb:C.low}},     alignment:aln("center","center"),border:bdr("255E1A")},
      };
      return m[rating]||sData(odd,"center",false);
    };
    // Apply style to one cell
    const sc = (ws:any,r:number,c:number,s:any) => {
      const ref=XS.utils.encode_cell({r,c});
      if(!ws[ref]) ws[ref]={v:"",t:"s"};
      ws[ref].s=s;
    };
    // Apply same style across a row span
    const sr = (ws:any,row:number,c0:number,c1:number,s:any) => { for(let c=c0;c<=c1;c++) sc(ws,row,c,s); };
    // Style data rows with alternating colors, with optional special column treatment
    const styleDataRows = (ws:any,r0:number,rN:number,c0:number,c1:number,
                            opts:{ratingCols?:number[],numCols?:number[]}={}) => {
      const {ratingCols=[],numCols=[]} = opts;
      for(let r=r0;r<=rN;r++){
        const odd=(r-r0)%2===1;
        for(let c=c0;c<=c1;c++){
          const ref=XS.utils.encode_cell({r,c});
          const val=ws[ref]?.v;
          if(ratingCols.includes(c)&&typeof val==="string"&&["CRITICAL","HIGH","MEDIUM","LOW"].includes(val)){ws[ref].s=ratingS(val,odd);continue;}
          if(numCols.includes(c)){if(!ws[ref]) sc(ws,r,c,sNum(odd));else ws[ref].s=sNum(odd);continue;}
          if(!ws[ref]){sc(ws,r,c,sData(odd));continue;}
          ws[ref].s = typeof val==="number" ? sNum(odd) : sData(odd,"left",true);
        }
      }
    };

    // Aggregates
    const critical = rows.filter(r=>r.severity==="Critical").length;
    const high     = rows.filter(r=>r.severity==="High").length;
    const medium   = rows.filter(r=>r.severity==="Medium").length;
    const low      = rows.filter(r=>r.severity==="Low").length;
    const avgScore = total>0 ? Math.round(rows.reduce((s,r)=>s+r.riskScore,0)/total) : 0;
    const avgResScore = total>0 ? Math.round(rows.reduce((s,r)=>s+r.resScore,0)/total) : 0;
    const maxScore = rows.reduce((m,r)=>Math.max(m,r.riskScore),0);
    const openRisks = rows.filter(r=>r.status!=="accepted"&&r.status!=="closed").length;
    const inTreatment = rows.filter(r=>r.status==="treating").length;
    const catMap = new Map<string,{count:number,totalScore:number,maxScore:number}>();
    rows.forEach(r=>{const e=catMap.get(r.category)||{count:0,totalScore:0,maxScore:0};e.count++;e.totalScore+=r.riskScore;e.maxScore=Math.max(e.maxScore,r.riskScore);catMap.set(r.category,e);});
    const catRows = [...catMap.entries()].sort((a,b)=>b[1].count-a[1].count);
    const top10 = [...rows].sort((a,b)=>b.riskScore-a.riskScore).slice(0,10);
    const pct = (n:number) => total>0?`${Math.round(n/total*100)}%`:"0%";

    // ── SHEET 1: Executive Dashboard ────────────────────────────────────
    const NC = 11; // number of dashboard columns (0..10)
    const dash: any[][] = [
      ["IT RISK ASSESSMENT — EXECUTIVE DASHBOARD","","","","","","","","","",""],
      [`Organisation: Acme Corporation  |  Generated: ${dateStr}  |  Platform: AIGO-X GRC`,"","","","","","","","","",""],
      ["","","","","","","","","","",""],
      ["KEY RISK INDICATORS (KRI)","","","","","","","","","",""],
      ["Total Risks","Critical","High","Medium","Low","Open Risks","In Treatment","Avg Inherent Score","Avg Residual Score","Max Risk Score",""],
      [total, critical, high, medium, low, openRisks, inTreatment, avgScore, avgResScore, maxScore, ""],
      ["","","","","","","","","","",""],
      ["RISK DISTRIBUTION BY CATEGORY","","","","","","","","","",""],
      ["Category","Risk Count","Avg Score","Max Score","% of Total","Overall Rating","","","","",""],
      ...catRows.map(([cat,e])=>[ cat, e.count, Math.round(e.totalScore/e.count), e.maxScore, pct(e.count), riskRating(e.maxScore),"","","","",""]),
      ["","","","","","","","","","",""],
      ["TOP 10 RISKS BY INHERENT RISK SCORE","","","","","","","","","",""],
      ["Rank","Risk ID","Threat / Risk Name","Category","Asset / Process","Prob","Impact","CIA","Inherent Score","Residual Score","Rating"],
      ...top10.map((r,i)=>[i+1, r.id, r.threat, r.category, r.asset, r.prob, r.impact, r.ciaScore, r.riskScore, r.resScore, riskRating(r.riskScore)]),
      ["","","","","","","","","","",""],
      ["RISK STATUS BREAKDOWN","","","","","","","","","",""],
      ["Status","Count","% of Total","","","","","","","",""],
      ...["identified","assessing","treating","accepted","closed"].map(s=>{const cnt=rows.filter(r=>r.status===s).length;return[s.charAt(0).toUpperCase()+s.slice(1),cnt,pct(cnt),"","","","","","","",""];}),
      ["","","","","","","","","","",""],
      ["RISK SEVERITY SUMMARY","","","","","","","","","",""],
      ["Rating","Score Range","Count","% of Total","Required Action","","","","","",""],
      ["CRITICAL","≥ 18",     rows.filter(r=>r.riskScore>=18).length,   pct(rows.filter(r=>r.riskScore>=18).length),   "Immediate mitigation — Executive escalation","","","","","",""],
      ["HIGH",    "12 – 17",  rows.filter(r=>r.riskScore>=12&&r.riskScore<18).length, pct(rows.filter(r=>r.riskScore>=12&&r.riskScore<18).length), "Mitigation plan required within 30 days","","","","","",""],
      ["MEDIUM",  "6 – 11",   rows.filter(r=>r.riskScore>=6&&r.riskScore<12).length,  pct(rows.filter(r=>r.riskScore>=6&&r.riskScore<12).length),  "Monitor & improve controls — 90-day review","","","","","",""],
      ["LOW",     "< 6",      rows.filter(r=>r.riskScore<6).length,      pct(rows.filter(r=>r.riskScore<6).length),      "Accept with suitable controls — annual review","","","","","",""],
      ["","","","","","","","","","",""],
      ["WORKBOOK NAVIGATION","","","","","","","","","",""],
      ["Sheet","Contents","","","","","","","","",""],
      ["📋 IT Risk Assessment Sheet","Full 23-column register — every threat is a separate numbered row","","","","","","","","",""],
      ["🔥 Risk Heat Map","5×5 probability × impact matrix with colour-coded risk zones","","","","","","","","",""],
      ["🛡️ Risk Treatment Plan","Treatment strategy, owners, target dates and ISO 27001:2022 controls","","","","","","","","",""],
      ["📈 Risk Exposure Profile","Inherent vs Residual matrix and control effectiveness %","","","","","","","","",""],
      ["📖 Assessment Guidelines","CIA rating scale, probability/impact methodology, 10-step process","","","","","","","","",""],
      ["🗂️ Threat Catalogue","47 categorised threats aligned to ISO 27001:2022 & NIST SP 800-30","","","","","","","","",""],
      ["📝 Change History","Document version and revision history","","","","","","","","",""],
    ];
    const wsDash = XS.utils.aoa_to_sheet(dash);
    wsDash["!cols"] = mks([28,12,36,18,28,8,8,8,13,13,10]);
    wsDash["!rows"] = [{hpt:28},{hpt:18},{hpt:6},{hpt:20},{hpt:14},{hpt:32}];
    // Title & subtitle (merged across NC cols)
    wsDash["!merges"] = [
      {s:{r:0,c:0},e:{r:0,c:NC}}, {s:{r:1,c:0},e:{r:1,c:NC}}, {s:{r:2,c:0},e:{r:2,c:NC}},
    ];
    sr(wsDash,0,0,NC,sTitleWide()); sr(wsDash,1,0,NC,sSubtitle()); sr(wsDash,2,0,NC,{fill:{fgColor:{rgb:C.navy}}});
    // KRI section
    sr(wsDash,3,0,NC,sSecHdr());
    sr(wsDash,4,0,9,sColHdr()); sc(wsDash,4,10,sBlankRow(C.white));
    // KPI value row — color-code each KPI cell
    const kpiColors = [C.accent, C.critical, C.high, "BF8F00", C.low, C.blue, C.blue, "1F6B75", "1F6B75", C.navy];
    kpiColors.forEach((bg,c)=>{
      sc(wsDash,5,c,{font:fnt(18,true,C.white),fill:{fgColor:{rgb:bg}},alignment:aln("center","center"),border:bdr(bg)});
    });
    sc(wsDash,5,10,sBlankRow(C.white));
    sr(wsDash,6,0,NC,sBlankRow(C.gray));
    // Category section
    sr(wsDash,7,0,NC,sSecHdr());
    sr(wsDash,8,0,5,sColHdr()); sr(wsDash,8,6,NC,sBlankRow(C.white));
    const catDataStart=9, catDataEnd=9+catRows.length-1;
    styleDataRows(wsDash,catDataStart,Math.max(catDataStart,catDataEnd),0,NC,{ratingCols:[5]});
    sr(wsDash,catDataEnd+1,0,NC,sBlankRow(C.gray));
    // Top-10 section
    const top10TitleRow=catDataEnd+2, top10HdrRow=catDataEnd+3, top10DataStart=catDataEnd+4, top10DataEnd=top10DataStart+Math.min(10,top10.length)-1;
    sr(wsDash,top10TitleRow,0,NC,sSecHdr());
    sr(wsDash,top10HdrRow,0,NC,sColHdr());
    styleDataRows(wsDash,top10DataStart,Math.max(top10DataStart,top10DataEnd),0,NC,{ratingCols:[10],numCols:[0,5,6,7,8,9]});
    const afterTop10=top10DataEnd+1;
    sr(wsDash,afterTop10,0,NC,sBlankRow(C.gray));
    // Status section
    const statTitleRow=afterTop10+1, statHdrRow=afterTop10+2, statDataStart=afterTop10+3, statDataEnd=statDataStart+4;
    sr(wsDash,statTitleRow,0,NC,sSecHdr()); sr(wsDash,statHdrRow,0,2,sColHdr()); sr(wsDash,statHdrRow,3,NC,sBlankRow(C.white));
    styleDataRows(wsDash,statDataStart,statDataEnd,0,NC,{numCols:[1]});
    sr(wsDash,statDataEnd+1,0,NC,sBlankRow(C.gray));
    // Severity section
    const sevTitleRow=statDataEnd+2, sevHdrRow=statDataEnd+3, sevDataStart=statDataEnd+4;
    sr(wsDash,sevTitleRow,0,NC,sSecHdr()); sr(wsDash,sevHdrRow,0,4,sColHdr()); sr(wsDash,sevHdrRow,5,NC,sBlankRow(C.white));
    [sevDataStart,sevDataStart+1,sevDataStart+2,sevDataStart+3].forEach((r,i)=>{
      const bg=[C.critical,C.high,C.medium,C.low][i];
      const fg=i===2?"7F4C00":C.white;
      sc(wsDash,r,0,{font:fnt(10,true,fg),fill:{fgColor:{rgb:bg}},alignment:aln("center","center"),border:bdr(bg)});
      sr(wsDash,r,1,NC,sData((i%2===1),"left",true));
    });
    XS.utils.book_append_sheet(wb, wsDash, "📊 Executive Dashboard");

    // ── SHEET 2: IT Risk Assessment Sheet ────────────────────────────────
    const MAIN_H = ["S.No","Assets/Process","Category","Owner","Custodian","Location","C","I","A","CIA Score","Threat / Risk","Vulnerability","Probability","Impact","Risk Score","Risk Rating","Existing Controls","Controls From ISO 27001:2022","Residual Probability","Residual Impact","Residual Risk Score","Recommended Action","Management Response"];
    const mainAoa = [MAIN_H,...rows.map(r=>[r.sno,r.asset,r.category,r.owner,r.custodian,r.location,r.c,r.i,r.a,r.ciaScore,r.threat,r.vulnerability,r.prob,r.impact,r.riskScore,riskRating(r.riskScore),r.controls,r.iso27001,r.resProb,r.resImpact,r.resScore,r.recAction,r.mgmt])];
    const wsMain = XS.utils.aoa_to_sheet(mainAoa);
    wsMain["!cols"] = mks([7,38,14,18,13,12,4,4,4,9,30,35,10,8,11,10,40,18,12,12,14,25,28]);
    wsMain["!freeze"] = {xSplit:0,ySplit:1};
    // Header row: navy with white bold text
    sr(wsMain,0,0,MAIN_H.length-1,sColHdr("left"));
    // Data rows with rating coloring
    styleDataRows(wsMain,1,rows.length,0,MAIN_H.length-1,{ratingCols:[15,21],numCols:[0,6,7,8,9,12,13,14,18,19,20]});
    XS.utils.book_append_sheet(wb, wsMain, "📋 IT Risk Assessment Sheet");

    // ── SHEET 3: Risk Heat Map ────────────────────────────────────────────
    const hg: number[][] = Array.from({length:5},()=>[0,0,0,0,0]);
    const map5 = (v:number) => v===3?4:v===2?2:0;
    rows.forEach(r=>{ const pi=map5(r.prob); const ii=map5(r.impact); if(pi<5&&ii<5) hg[pi]![ii]!++; });
    const hmLabels = ["Rare (1)","Unlikely (2)","Possible (3)","Likely (4)","Almost Certain (5)"];
    const impLabels = ["Insignificant (1)","Minor (2)","Moderate (3)","Major (4)","Catastrophic (5)"];
    // Heat zone color: prob×impact → zone colour (5x5 standard risk matrix)
    const heatZone = (pi:number,ii:number) => {
      const score=(pi+1)*(ii+1); // 1..25
      if(score>=16) return C.heatCrit;
      if(score>=9)  return C.heatHigh;
      if(score>=4)  return C.heatMed;
      return C.heatLow;
    };
    const heatAoa: any[][] = [
      ["RISK HEAT MAP — Probability × Impact Matrix","","","","","",""],
      [`Generated: ${dateStr}  |  Total Risks: ${total}  |  See counts in each zone cell`,"","","","","",""],
      ["","","","","","",""],
      ["","IMPACT →","","","","",""],
      ["PROBABILITY ↓",...impLabels,"ROW TOTAL"],
      ...[4,3,2,1,0].map(pi=>{const vals=[0,1,2,3,4].map(ii=>hg[pi]![ii]??0);return[hmLabels[pi],...vals,vals.reduce((s,v)=>s+v,0)];}),
      ["COL TOTAL",...[0,1,2,3,4].map(ii=>hg.reduce((s,row)=>s+(row[ii]??0),0)),total],
      ["","","","","","",""],
      ["RISK COUNTS BY RATING","","","","","",""],
      ["Rating","Score Range","Count","% of Total","Action","",""],
      ["■ CRITICAL","≥ 18",     rows.filter(r=>r.riskScore>=18).length,  pct(rows.filter(r=>r.riskScore>=18).length),  "Immediate escalation","",""],
      ["■ HIGH",    "12 – 17",  rows.filter(r=>r.riskScore>=12&&r.riskScore<18).length,pct(rows.filter(r=>r.riskScore>=12&&r.riskScore<18).length),"Formal treatment plan within 30 days","",""],
      ["■ MEDIUM",  "6 – 11",   rows.filter(r=>r.riskScore>=6&&r.riskScore<12).length, pct(rows.filter(r=>r.riskScore>=6&&r.riskScore<12).length), "Management review within 90 days","",""],
      ["■ LOW",     "< 6",      rows.filter(r=>r.riskScore<6).length,     pct(rows.filter(r=>r.riskScore<6).length),     "Accept — maintain controls","",""],
      ["","","","","","",""],
      ["TOP RISKS IN THIS HEAT MAP","","","","","",""],
      ["S.No","Threat / Risk","Asset / Process","Probability","Impact","Risk Score","Rating"],
      ...top10.map(r=>[r.sno,r.threat,r.asset,r.prob,r.impact,r.riskScore,riskRating(r.riskScore)]),
    ];
    const wsHeat = XS.utils.aoa_to_sheet(heatAoa);
    wsHeat["!cols"] = mks([22,18,14,14,12,12,14]);
    wsHeat["!merges"] = [{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}];
    sr(wsHeat,0,0,6,sTitleWide()); sr(wsHeat,1,0,6,sSubtitle()); sr(wsHeat,2,0,6,sBlankRow(C.navy));
    // "IMPACT →" label row
    sr(wsHeat,3,0,6,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.blue}},alignment:aln("center","center")});
    // Header row (PROBABILITY ↓ + impact labels + ROW TOTAL)
    sr(wsHeat,4,0,6,sColHdr());
    // Matrix data rows — color each cell by zone
    [4,3,2,1,0].forEach((pi,rowOffset)=>{
      const r=5+rowOffset;
      sc(wsHeat,r,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.blue}},alignment:aln("left","center"),border:bdr(C.blue)});
      [0,1,2,3,4].forEach(ii=>{
        const c=1+ii;
        const cnt=hg[pi]![ii]??0;
        const bg=heatZone(pi,ii);
        const textRgb=(bg===C.heatMed)?"000000":C.white;
        sc(wsHeat,r,c,{font:fnt(14,cnt>0,textRgb),fill:{fgColor:{rgb:bg}},alignment:aln("center","center"),border:{top:{style:"medium",color:{rgb:"FFFFFF"}},bottom:{style:"medium",color:{rgb:"FFFFFF"}},left:{style:"medium",color:{rgb:"FFFFFF"}},right:{style:"medium",color:{rgb:"FFFFFF"}}}});
      });
      const rowTotal=hg[pi]!.reduce((s,v)=>s+v,0);
      sc(wsHeat,r,6,{font:fnt(10,rowTotal>0,C.navy),fill:{fgColor:{rgb:C.ltBlue}},alignment:aln("center","center"),border:bdr()});
    });
    // COL TOTAL row
    sr(wsHeat,10,0,6,{font:fnt(10,true,C.navy),fill:{fgColor:{rgb:C.ltBlue}},alignment:aln("center","center"),border:bdr(C.accent)});
    sc(wsHeat,10,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.accent}},alignment:aln("left","center"),border:bdr(C.accent)});
    sr(wsHeat,11,0,6,sBlankRow(C.gray));
    // Rating counts section
    sr(wsHeat,12,0,6,sSecHdr()); sr(wsHeat,13,0,4,sColHdr()); sr(wsHeat,13,5,6,sBlankRow(C.white));
    const ratColors=[C.critical,C.high,C.medium,C.low];
    [14,15,16,17].forEach((r,i)=>{const bg=ratColors[i];const fg=i===2?"7F4C00":C.white;sc(wsHeat,r,0,{font:fnt(10,true,fg),fill:{fgColor:{rgb:bg}},alignment:aln("center","center"),border:bdr(bg)});sr(wsHeat,r,1,6,sData(i%2===1));});
    sr(wsHeat,18,0,6,sBlankRow(C.gray));
    // Top risks section
    sr(wsHeat,19,0,6,sSecHdr()); sr(wsHeat,20,0,6,sColHdr());
    styleDataRows(wsHeat,21,21+Math.min(top10.length,10)-1,0,6,{ratingCols:[6],numCols:[0,3,4,5]});
    XS.utils.book_append_sheet(wb, wsHeat, "🔥 Risk Heat Map");

    // ── SHEET 4: Risk Treatment Plan ──────────────────────────────────────
    const treatH = ["S.No","Risk ID","Threat / Risk Name","Category","Asset / Process","Inherent Score","Rating","Residual Score","Residual Rating","Treatment Strategy","Control Owner","Target Date","Treatment Status","ISO 27001:2022 Ref","Recommended Controls / Notes"];
    const treatAoa = [treatH,...rows.map((r,i)=>{
      const strat = r.status==="accepted"?"Accept":r.status==="treating"?"Mitigate":r.riskScore>=18?"Mitigate (Urgent)":r.riskScore>=12?"Mitigate / Transfer":"Accept / Monitor";
      const tstat = r.status==="accepted"?"Accepted":r.status==="treating"?"In Progress":r.status==="assessing"?"Under Assessment":"Pending";
      return [i+1,r.id,r.threat,r.category,r.asset,r.riskScore,riskRating(r.riskScore),r.resScore,riskRating(r.resScore),strat,r.owner,"",tstat,r.iso27001,r.recAction||r.mgmt];
    })];
    const wsTreat = XS.utils.aoa_to_sheet(treatAoa);
    wsTreat["!cols"] = mks([7,10,30,14,28,13,10,13,13,20,18,14,16,18,40]);
    wsTreat["!freeze"] = {xSplit:0,ySplit:1};
    sr(wsTreat,0,0,treatH.length-1,sColHdr("left"));
    styleDataRows(wsTreat,1,treatAoa.length-1,0,treatH.length-1,{ratingCols:[6,8],numCols:[0,5,7]});
    XS.utils.book_append_sheet(wb, wsTreat, "🛡️ Risk Treatment Plan");

    // ── SHEET 5: Risk Exposure Profile ────────────────────────────────────
    const exG: number[][] = Array.from({length:3},()=>[0,0,0]);
    const rsG: number[][] = Array.from({length:3},()=>[0,0,0]);
    rows.forEach(r=>{
      const pi=r.prob-1,ii=r.impact-1,rpi=r.resProb-1,rii=r.resImpact-1;
      if(pi>=0&&pi<3&&ii>=0&&ii<3) exG[pi]![ii]!++;
      if(rpi>=0&&rpi<3&&rii>=0&&rii<3) rsG[rpi]![rii]!++;
    });
    const expLabels3 = ["Low (1)","Medium (2)","High (3)"];
    const scoreReduction = rows.reduce((s,r)=>s+r.riskScore,0)>0?Math.round((1-rows.reduce((s,r)=>s+r.resScore,0)/rows.reduce((s,r)=>s+r.riskScore,0))*100):0;
    const profAoa: any[][] = [
      ["RISK EXPOSURE PROFILE — Pre-Controls vs Post-Controls","","","",""],
      [`Generated: ${dateStr}  |  Methodology: CIA × Probability × Impact`,"","","",""],
      ["","","","",""],
      ["INHERENT RISK MATRIX (Before Controls)","","","",""],
      ["Probability \\ Impact",...expLabels3,"Row Total"],
      ...[2,1,0].map(pi=>{const label=expLabels3[pi]!+" Prob";const vals=[0,1,2].map(ii=>exG[pi]![ii]??0);return[label,...vals,vals.reduce((s,v)=>s+v,0)];}),
      ["Col Total",...[0,1,2].map(ii=>exG.reduce((s,r)=>s+(r[ii]??0),0)),total],
      ["","","","",""],
      ["RESIDUAL RISK MATRIX (After Controls)","","","",""],
      ["Probability \\ Impact",...expLabels3,"Row Total"],
      ...[2,1,0].map(pi=>{const label=expLabels3[pi]!+" Prob";const vals=[0,1,2].map(ii=>rsG[pi]![ii]??0);return[label,...vals,vals.reduce((s,v)=>s+v,0)];}),
      ["Col Total",...[0,1,2].map(ii=>rsG.reduce((s,r)=>s+(r[ii]??0),0)),total],
      ["","","","",""],
      ["CONTROL EFFECTIVENESS METRICS","","","",""],
      ["Metric","Value","Description","",""],
      ["Total Risks",total,"All risks in scope","",""],
      ["Avg Inherent Risk Score",avgScore,"CIA × P × I before controls","",""],
      ["Avg Residual Risk Score",avgResScore,"CIA × P × I after controls","",""],
      ["Score Reduction",`${scoreReduction}%`,"Overall control effectiveness","",""],
      ["Risks with Controls Cited",rows.filter(r=>r.controls).length,"Risks with documented existing controls","",""],
      ["ISO 27001 Controls Cited",rows.filter(r=>r.iso27001).length,"Risks referencing ISO 27001:2022 clauses","",""],
      ["Risks Accepted",rows.filter(r=>r.status==="accepted").length,"Formally accepted by management","",""],
      ["Risks In Treatment",inTreatment,"Active mitigation underway","",""],
    ];
    const wsProf = XS.utils.aoa_to_sheet(profAoa);
    wsProf["!cols"] = mks([26,16,16,16,14]);
    wsProf["!merges"] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}];
    sr(wsProf,0,0,4,sTitleWide()); sr(wsProf,1,0,4,sSubtitle()); sr(wsProf,2,0,4,sBlankRow(C.navy));
    // Inherent matrix
    sr(wsProf,3,0,4,sSecHdr()); sr(wsProf,4,0,4,sColHdr());
    [[5,C.critical],[6,"BF8F00"],[7,C.low]].forEach(([r,bg])=>{ // high/med/low prob rows
      sc(wsProf,r as number,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.blue}},alignment:aln("left","center"),border:bdr(C.blue)});
      [1,2,3].forEach(c=>sc(wsProf,r as number,c,{font:fnt(12,true,C.navy),fill:{fgColor:{rgb:C.ltBlue}},alignment:aln("center","center"),border:bdr(C.accent)}));
      sc(wsProf,r as number,4,{font:fnt(10,true,C.navy),fill:{fgColor:{rgb:C.gray}},alignment:aln("center","center"),border:bdr()});
    });
    sr(wsProf,8,0,4,{font:fnt(10,true,C.navy),fill:{fgColor:{rgb:C.ltBlue}},alignment:aln("center","center"),border:bdr(C.accent)});
    sc(wsProf,8,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.accent}},alignment:aln("left","center"),border:bdr(C.accent)});
    sr(wsProf,9,0,4,sBlankRow(C.gray));
    // Residual matrix
    sr(wsProf,10,0,4,sSecHdr()); sr(wsProf,11,0,4,sColHdr());
    [12,13,14].forEach((r,i)=>{
      sc(wsProf,r,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.blue}},alignment:aln("left","center"),border:bdr(C.blue)});
      [1,2,3].forEach(c=>sc(wsProf,r,c,{font:fnt(12,true,C.low),fill:{fgColor:{rgb:"EBF7E8"}},alignment:aln("center","center"),border:bdr(C.low)}));
      sc(wsProf,r,4,{font:fnt(10,true,C.navy),fill:{fgColor:{rgb:C.gray}},alignment:aln("center","center"),border:bdr()});
    });
    sr(wsProf,15,0,4,{font:fnt(10,true,C.navy),fill:{fgColor:{rgb:"EBF7E8"}},alignment:aln("center","center"),border:bdr(C.low)});
    sc(wsProf,15,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:C.low}},alignment:aln("left","center"),border:bdr(C.low)});
    sr(wsProf,16,0,4,sBlankRow(C.gray));
    // Metrics section
    sr(wsProf,17,0,4,sSecHdr()); sr(wsProf,18,0,2,sColHdr()); sr(wsProf,18,3,4,sBlankRow(C.white));
    for(let r=19;r<=26;r++){
      const odd=(r-19)%2===1;
      sc(wsProf,r,0,sData(odd,"left",true));
      sc(wsProf,r,1,{font:fnt(11,true,C.navy),fill:{fgColor:{rgb:odd?C.ltBlue:C.white}},alignment:aln("center","center"),border:bdr()});
      sc(wsProf,r,2,sData(odd,"left",true)); sr(wsProf,r,3,4,sBlankRow(odd?C.ltBlue:C.white));
    }
    XS.utils.book_append_sheet(wb, wsProf, "📈 Risk Exposure Profile");

    // ── SHEET 6: Risk Assessment Guidelines ───────────────────────────────
    const guideAoa: any[][] = [
      ["RISK ASSESSMENT GUIDELINES","","","",""],
      ["Methodology: CIA (Confidentiality × Integrity × Availability) × Probability × Impact","","","",""],
      ["Reference Standards: ISO 27001:2022 · NIST SP 800-30 · ISO 31000","","","",""],
      ["","","","",""],
      ["PROBABILITY SCALE","","","",""],
      ["Value","Level","Description","Frequency Indicator",""],
      [3,"High",   "POSSIBLE — likely to occur at some time",   "Active threat intelligence; observed in sector",""],
      [2,"Medium", "UNLIKELY — could happen but not expected",  "Theoretical; credible but not imminent",""],
      [1,"Low",    "RARE — only in exceptional circumstances",  "Historical only; no current indicators",""],
      ["","","","",""],
      ["IMPACT / SEVERITY SCALE","","","",""],
      ["Value","Level","Description","Business Effect",""],
      [3,"High",   "Severe adverse effect on operations/assets/individuals",   "Significant financial loss, regulatory action, reputational damage",""],
      [2,"Medium", "Serious adverse effect on operations/assets/individuals",  "Moderate disruption, recoverable within days",""],
      [1,"Low",    "Limited adverse effect on operations/assets/individuals",  "Minor inconvenience, negligible business impact",""],
      ["","","","",""],
      ["CIA ASSET RATING SCALE","","","",""],
      ["Rating","Confidentiality","Integrity","Availability",""],
      [3,"Severe/catastrophic harm from unauthorized disclosure","Severe/catastrophic harm from modification/destruction","Severe/catastrophic harm from disruption of access",""],
      [2,"Serious harm from unauthorized disclosure",          "Serious harm from modification/destruction",          "Serious harm from disruption of access",""],
      [1,"Limited harm from unauthorized disclosure",          "Limited harm from modification/destruction",          "Limited harm from disruption of access",""],
      ["","","","",""],
      ["RISK SCORE FORMULAE","","","",""],
      ["Formula","Calculation","","",""],
      ["CIA Score",  "Confidentiality × Integrity × Availability   (range: 1–27)","","",""],
      ["Risk Score", "CIA Score × Probability × Impact             (range: 1–243)","","",""],
      ["Residual",   "CIA Score × Residual Probability × Residual Impact","","",""],
      ["","","","",""],
      ["RISK RATING CATEGORISATION","","","",""],
      ["Rating","Score Range","Acceptability","Required Action","Review Frequency"],
      ["CRITICAL","≥ 18",    "Unacceptable — Immediate action required",  "Executive escalation; plan within 7 days","Monthly"],
      ["HIGH",    "12 – 17", "Unacceptable unless no other method viable","Senior management; plan within 30 days","Quarterly"],
      ["MEDIUM",  "6 – 11",  "Acceptable with high-level controls",       "Management review within 90 days","Semi-annually"],
      ["LOW",     "< 6",     "Acceptable with suitable controls",          "Accept; maintain existing controls","Annually"],
      ["","","","",""],
      ["10-STEP RISK ASSESSMENT PROCESS","","","",""],
      ["Step","Activity","Description","Output",""],
      [1,"Asset Identification",    "Identify all information assets, processes and systems in scope","Asset inventory",""],
      [2,"CIA Rating",              "Rate each asset: Confidentiality, Integrity, Availability (1-3)","CIA Score per asset",""],
      [3,"Threat Identification",   "Identify applicable threats using Threat Catalogue","Threat list per asset",""],
      [4,"Vulnerability Assessment","Identify vulnerabilities that could be exploited by each threat","Vulnerability list",""],
      [5,"Inherent Risk Scoring",   "Calculate: CIA Score × Probability × Impact","Inherent Risk Score",""],
      [6,"Control Identification",  "Document controls and map to ISO 27001:2022 clauses","Controls register",""],
      [7,"Residual Risk Scoring",   "Re-score probability and impact after applying controls","Residual Risk Score",""],
      [8,"Treatment Decision",      "Accept / Mitigate / Transfer / Avoid — with management sign-off","Treatment plan",""],
      [9,"Risk Register Update",    "Record in IT Risk Assessment Sheet with owner, target date","Updated register",""],
      [10,"Periodic Review",        "Review annually or upon significant change","Review minutes",""],
    ];
    const wsGuide = XS.utils.aoa_to_sheet(guideAoa);
    wsGuide["!cols"] = mks([10,22,54,44,14]);
    wsGuide["!merges"] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}}];
    sr(wsGuide,0,0,4,sTitleWide()); sr(wsGuide,1,0,4,sSubtitle()); sr(wsGuide,2,0,4,sSubtitle()); sr(wsGuide,3,0,4,sBlankRow(C.navy));
    const guideSections:number[] = [4,10,16,22,28,35];
    const guideHdrs:number[] = [5,11,17,23,29,36];
    guideSections.forEach(r=>sr(wsGuide,r,0,4,sSecHdr()));
    guideHdrs.forEach(r=>sr(wsGuide,r,0,4,sColHdr("left")));
    // Style data cells in each table
    [[6,8],[12,14],[18,20],[24,26],[30,33],[37,46]].forEach(([s,e])=>{
      for(let r=s;r<=e;r++){
        const odd=(r-s)%2===1;
        const ratingRow=["CRITICAL","HIGH","MEDIUM","LOW"].includes(String(wsGuide[XS.utils.encode_cell({r,c:0})]?.v));
        if(ratingRow){
          const rat=String(wsGuide[XS.utils.encode_cell({r,c:0})]?.v);
          sc(wsGuide,r,0,ratingS(rat,false));
          sr(wsGuide,r,1,4,sData(odd,"left",true));
        } else { sr(wsGuide,r,0,4,sData(odd,"left",true)); sc(wsGuide,r,0,{...sData(odd,"center",false),font:fnt(10,true,C.navy)}); }
      }
    });
    XS.utils.book_append_sheet(wb, wsGuide, "📖 Assessment Guidelines");

    // ── SHEET 7: Threat Catalogue ─────────────────────────────────────────
    const threats: [string,string][] = [
      ["External Attacks","Distributing computer viruses / malware / ransomware"],
      ["External Attacks","Distributing SPAM or phishing campaigns"],
      ["External Attacks","Introducing Trojan horses / spyware / keyloggers"],
      ["External Attacks","Malicious network probes or port scanning"],
      ["External Attacks","Denial of Service (DoS / DDoS) attacks"],
      ["External Attacks","Spoofing user identities or IP addresses"],
      ["External Attacks","Social engineering / vishing / smishing"],
      ["External Attacks","Hacking into systems or applications"],
      ["External Attacks","Password cracking / credential stuffing / brute force"],
      ["External Attacks","Web application attacks (SQL Injection, XSS, CSRF)"],
      ["External Attacks","Man-in-the-Middle (MitM) interception / eavesdropping"],
      ["External Attacks","Advanced Persistent Threats (APT) / nation-state actors"],
      ["External Attacks","Supply chain / third-party software compromise"],
      ["External Attacks","Zero-day exploit against unpatched systems"],
      ["Human Error","IT/network staff configuration mistakes"],
      ["Human Error","User mistakes — accidental data deletion or disclosure"],
      ["Human Error","Misconfigured cloud storage or SaaS services"],
      ["Human Error","Improper patch or change management"],
      ["Human Error","Failure to follow security policies or procedures"],
      ["Internal Misuse","Downloading or sending inappropriate / unlawful content"],
      ["Internal Misuse","Installing unauthorised software or tools"],
      ["Internal Misuse","Changing software or configurations without authorisation"],
      ["Internal Misuse","Disclosing confidential business or personal information"],
      ["Internal Misuse","Gaining unauthorised access to systems or sensitive data"],
      ["Internal Misuse","Disclosing authentication credentials to third parties"],
      ["Internal Misuse","Misusing systems to commit fraud or financial crime"],
      ["Internal Misuse","Sabotage or deliberate disruption of IT services"],
      ["Malfunctions","Malfunction of computer or network hardware"],
      ["Malfunctions","Malfunction of third-party business application software"],
      ["Malfunctions","Malfunction of in-house developed application"],
      ["Malfunctions","Operating system or middleware failure"],
      ["Service Interruption","Loss or damage of communications links or internet service"],
      ["Service Interruption","Loss of power / UPS failure / environmental controls failure"],
      ["Service Interruption","System overload or resource exhaustion"],
      ["Service Interruption","Damage to or loss of computer / data centre facilities"],
      ["Service Interruption","Natural disasters — flood, fire, earthquake, storm"],
      ["Theft","Theft of portable computers, tablets or storage devices"],
      ["Theft","Theft of IT network or server equipment"],
      ["Theft","Theft of proprietary or confidential business information"],
      ["Theft","Theft of authentication credentials via phishing"],
      ["Theft","Identity theft or executive impersonation"],
      ["Change-related","Unforeseen effects of software changes or patches"],
      ["Change-related","Unforeseen effects of infrastructure or network upgrades"],
      ["Change-related","Unforeseen effects of business process re-engineering"],
      ["Change-related","Unforeseen effects of organisational restructuring"],
      ["Compliance & Legal","Failure to comply with data protection law (GDPR, PDPA, CCPA)"],
      ["Compliance & Legal","Non-compliance with ISO 27001:2022 / NIST / CIS controls"],
      ["Compliance & Legal","Contractual breach — third-party SLA or data processing failure"],
    ];
    // Assign each category a distinct accent colour
    const catColorMap:Record<string,string> = {
      "External Attacks":C.critical,"Human Error":"8B4513","Internal Misuse":C.high,
      "Malfunctions":"5B6A7E","Service Interruption":"1F6B75","Theft":"6A0DAD","Change-related":"BF8F00","Compliance & Legal":C.low,
    };
    const thrAoa: any[][] = [
      ["THREAT CATALOGUE — IT Risk Assessment","",""],
      [`Reference: ISO 27001:2022, NIST SP 800-30, OWASP Top 10  |  Generated: ${dateStr}`,"",""],
      ["","",""],
      ["#","Threat Category","Threat Description"],
      ...threats.map((t,i)=>[i+1,t[0],t[1]]),
    ];
    const wsThr = XS.utils.aoa_to_sheet(thrAoa);
    wsThr["!cols"] = mks([5,22,62]);
    wsThr["!merges"] = [{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:1,c:0},e:{r:1,c:2}}];
    sr(wsThr,0,0,2,sTitleWide()); sr(wsThr,1,0,2,sSubtitle()); sr(wsThr,2,0,2,sBlankRow(C.navy));
    sr(wsThr,3,0,2,sColHdr("left"));
    threats.forEach(([cat,_],i)=>{
      const r=4+i; const odd=i%2===1;
      const bg=catColorMap[cat]||C.accent;
      sc(wsThr,r,0,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:bg}},alignment:aln("center","center"),border:bdr(bg)});
      sc(wsThr,r,1,{font:fnt(10,true,C.white),fill:{fgColor:{rgb:bg}},alignment:aln("left","center"),border:bdr(bg)});
      sc(wsThr,r,2,sData(odd,"left",true));
    });
    XS.utils.book_append_sheet(wb, wsThr, "🗂️ Threat Catalogue");

    // ── SHEET 8: Change History ────────────────────────────────────────────
    const changeAoa: any[][] = [
      ["CHANGE HISTORY — IT Risk Register","","","",""],
      ["","","","",""],
      ["Version","Date","Change Description","Prepared By","Reviewed / Approved By"],
      ["1.0", dateStr, `Initial export — ${total} risks from AIGO-X GRC Platform`, "AIGO-X GRC", "Risk Manager"],
    ];
    const wsChg = XS.utils.aoa_to_sheet(changeAoa);
    wsChg["!cols"] = mks([10,14,55,22,24]);
    wsChg["!merges"] = [{s:{r:0,c:0},e:{r:0,c:4}}];
    sr(wsChg,0,0,4,sTitleWide()); sr(wsChg,1,0,4,sBlankRow(C.navy)); sr(wsChg,2,0,4,sColHdr("left"));
    sr(wsChg,3,0,4,sData(false,"left",true));
    XS.utils.book_append_sheet(wb, wsChg, "📝 Change History");

    XS.writeFile(wb, `IT-Risk-Register-${dateStr}.xlsx`);
  }

  // Legacy shim — keeps any existing callers working
  function exportRegisterCsv() { exportRegister("csv"); }

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
      // HIGH-F-016: persist imported risks via POST /api/risks (was client-only).
      const { created, failedItems } = await persistImportedRisks(risks);
      setDbRisks(prev => [...created, ...prev]);
      setShowImport(false); setImportGhStatus(failedItems.length > 0 ? "error" : "idle"); setImportGhFiles([]);
      if (failedItems.length > 0) {
        const details = failedItems.map(f => `• ${f.name} (${f.reason})`).join("\n");
        setImportGhErr(`${created.length} imported, ${failedItems.length} skipped:\n${details}`);
      }
    } catch { setImportGhErr("Failed to fetch or parse file from GitHub."); }
  };

  const handleImportFile = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    setImportFileStatus("idle"); setImportFileErr("");
    try {
      const fname = file.name.toLowerCase();
      let risks: any[] = [];

      if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

        // ── Smart sheet selection ───────────────────────────────────────────
        // Prefer sheets whose name matches "IT Risk Assessment Sheet" or any
        // "risk assessment / risk register" pattern; fall back to first sheet.
        const pickSheet = (names: string[]) =>
          names.find(n => /it risk assessment/i.test(n)) ??
          names.find(n => /risk\s*(assessment|register)/i.test(n)) ??
          names.find(n => /risk/i.test(n)) ??
          names[0];
        const sheetName = pickSheet(wb.SheetNames);
        const ws = wb.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // ── Find header row ────────────────────────────────────────────────
        // The header row has "Threat" (or "Risk Name") at column K (index 10)
        // and "S.No" (or "S.no") at column A (index 0).
        // FIX: search up to 15 rows (was 6) — some XLSX files have title/logo
        // sections that push the header beyond row 6, causing hdrIdx to stay 0
        // and the parser to read intro rows as data, silently dropping real risks.
        let hdrIdx = 0;
        let threatCol = 10; // default col K (0-indexed); FIX: detect actual column
        for (let i = 0; i < Math.min(15, rawRows.length); i++) {
          const colA = String(rawRows[i][0] ?? "").toLowerCase().replace(/\s/g,"");
          // FIX: scan all columns in this row for "threat" / "risk name" keyword
          // instead of assuming it is always column K. Merged cells in Excel can
          // shift column indices, causing the threat text to land in a different index.
          let foundThreatCol = -1;
          for (let c = 0; c < rawRows[i].length; c++) {
            const cell = String(rawRows[i][c] ?? "").toLowerCase().trim();
            if (cell === "threat" || cell === "risk name" || cell === "riskname" || cell === "risk description") {
              foundThreatCol = c; break;
            }
          }
          if (colA === "s.no" || colA === "sno" || foundThreatCol >= 0) {
            hdrIdx = i;
            if (foundThreatCol >= 0) threatCol = foundThreatCol;
            break;
          }
        }

        // ── ASRY multi-row parser ──────────────────────────────────────────
        // Each asset (S.No row) has multiple threat sub-rows beneath it.
        // Child rows inherit the parent's asset metadata.
        const FOOTER = /^(reviewed\s+by|approved\s+by|signatures?|name\s*:|title\s*:|date\s*:|prepared\s+by|comments?)\s*:?$/i;
        const normSev = (s: number) => s >= 300 ? "Critical" : s >= 100 ? "High" : s >= 30 ? "Medium" : "Low";

        // Track skipped rows for diagnostics
        let skippedCount = 0;
        let ctx: Record<string,any> = {};
        for (let i = hdrIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          const sno = String(row[0] ?? "").trim();
          // FIX: use detected threatCol instead of hardcoded col K (index 10).
          // Also try col 10 as fallback so files with slight column shifts still work.
          const threat = (String(row[threatCol] ?? "").replace(/\s+/g, " ").trim())
                      || (threatCol !== 10 ? String(row[10] ?? "").replace(/\s+/g, " ").trim() : "");

          // Skip blank threat cells and document-footer rows
          if (!threat || FOOTER.test(threat)) { skippedCount++; continue; }

          // When S.No is present this is a parent asset row — update context
          if (sno !== "" && !isNaN(Number(sno))) {
            ctx = {
              sno:      sno,
              asset:    String(row[1] ?? "").replace(/\s+/g," ").trim(),
              category: String(row[2] ?? "").trim() || "Cybersecurity",
              owner:    String(row[3] ?? "").trim() || "IT Dept",
              custodian:String(row[4] ?? "").trim(),
              location: String(row[5] ?? "").trim(),
              c: row[6], iVal: row[7], a: row[8],
              ciaScore: Number(row[9]) || 0,
            };
          }

          const vulnerability     = String(row[11] ?? "").replace(/\s+/g," ").trim();
          const probability       = Number(row[12]) || 0;
          const impact            = Number(row[13]) || 0;
          const riskScore         = Number(row[14]) || 0;
          const existingControls  = String(row[15] ?? "").replace(/\s+/g," ").trim();
          const iso27001          = String(row[16] ?? "").replace(/\s+/g," ").trim();
          const residualProb      = Number(row[17]) || 0;
          const residualImpact    = Number(row[18]) || 0;
          const residualScore     = Number(row[19]) || 0;
          const recommendedAction = String(row[20] ?? "").replace(/\s+/g," ").trim();
          const mgmtResponse      = String(row[21] ?? "").replace(/\s+/g," ").trim();

          const severity = normSev(riskScore);
          // Normalize to 0-100 using sqrt scale (preserves spread)
          const score = Math.min(100, Math.max(1, Math.round(Math.sqrt(riskScore) * 3.5)));

          const status = /accept/i.test(mgmtResponse) ? "accepted"
                       : /mitigat|implement|progress/i.test(mgmtResponse) ? "in-progress"
                       : "open";

          // Encode ASRY-specific fields into structured description
          // so the export can reconstruct the original column layout.
          const descParts = [
            ctx.asset        ? `Asset: ${ctx.asset}` : "",
            vulnerability    ? `Vulnerability: ${vulnerability}` : "",
            existingControls ? `Controls: ${existingControls}` : "",
            iso27001         ? `ISO27001: ${iso27001}` : "",
            probability      ? `Probability: ${probability}` : "",
            impact           ? `Impact: ${impact}` : "",
            riskScore        ? `RiskScore: ${riskScore}` : "",
            residualProb     ? `ResidualProb: ${residualProb}` : "",
            residualImpact   ? `ResidualImpact: ${residualImpact}` : "",
            residualScore    ? `ResidualScore: ${residualScore}` : "",
            recommendedAction? `RecommendedAction: ${recommendedAction}` : "",
            mgmtResponse     ? `MgmtResponse: ${mgmtResponse}` : "",
            ctx.custodian    ? `Custodian: ${ctx.custodian}` : "",
            ctx.location     ? `Location: ${ctx.location}` : "",
            ctx.ciaScore     ? `CIAScore: ${ctx.ciaScore}` : "",
          ].filter(Boolean).join("\n");

          risks.push({
            name:     threat,
            category: ctx.category || "Cybersecurity",
            severity,
            description: descParts,
            score,
            owner:    ctx.owner || "IT Dept",
            ownerFull:ctx.owner || "IT Dept",
            status,
          });
        }

      } else if (fname.endsWith(".json")) {
        risks = parseRisksFromJson(await file.text());
      } else {
        // CSV / generic flat format with flexible header mapping
        const text = await file.text();
        const fRisks = parseRisksFromCsv(text);
        if (fRisks.length > 0) {
          risks = fRisks;
        } else {
          // Try as xlsx-style flat (object-per-row)
          const wb2 = XLSX.read(await file.arrayBuffer(), { type: "array" });
          const ws2 = wb2.Sheets[wb2.SheetNames[0]];
          const objRows: Record<string,any>[] = XLSX.utils.sheet_to_json(ws2, { defval: "" });
          const norm = (s: string) => String(s).toLowerCase().replace(/[\s_\-]+/g, "");
          const normSev2 = (s: string) => { const v=s.toLowerCase(); return v.includes("crit")?"Critical":v.includes("high")?"High":v.includes("med")?"Medium":"Low"; };
          risks = objRows.map((row,idx) => {
            const get = (keys: string[]) => { for (const k of Object.keys(row)) { if (keys.some(t=>norm(k)===t||norm(k).includes(t))) return String(row[k]??"").trim(); } return ""; };
            return {
              name:        get(["name","riskname","risktitle","threat","title"]) || `Imported Risk ${idx+1}`,
              category:    get(["category","type","domain"]) || "Cybersecurity",
              severity:    normSev2(get(["severity","level","rating"])||"medium"),
              description: get(["description","notes","detail","remarks","vulnerability"]),
              score:       Math.min(100, Math.max(0, Number(get(["score","riskscore"]))||50)),
              owner:       get(["owner","assignee","riskowner"]),
              ownerFull:   get(["ownerfull","ownerfullname"]),
              status:      get(["status"])||"identified",
            };
          }).filter(r => r.name);
        }
      }

      if (risks.length === 0) {
        setImportFileStatus("error");
        setImportFileErr("No valid risk records found. For XLSX: ensure the file has an 'IT Risk Assessment Sheet' with Threat (col K). For CSV: include name, category, severity, score, owner columns.");
        return;
      }
      const { created, failedItems } = await persistImportedRisks(risks);
      setDbRisks(prev => [...created.map((d:any) => ({ ...d, _dbId: d.id, id: d.riskId ?? d.id })), ...prev]);
      setImportFileCount(created.length);
      const hasIssues = failedItems.length > 0 || skippedCount > 0;
      setImportFileStatus(hasIssues ? "error" : "parsed");
      if (hasIssues) {
        const parts: string[] = [];
        if (created.length > 0) parts.push(`${created.length} risks imported successfully.`);
        if (failedItems.length > 0) {
          parts.push(`${failedItems.length} rejected by server:`);
          parts.push(...failedItems.map(f => `  • ${f.name} (${f.reason})`));
        }
        if (skippedCount > 0) {
          parts.push(`${skippedCount} XLSX rows skipped (blank threat cell or footer row — check column alignment).`);
        }
        setImportFileErr(parts.join("\n"));
      }
      setTimeout(()=>{ setShowImport(false); setImportFileStatus("idle"); },1800);
    } catch (err) {
      setImportFileStatus("error");
      setImportFileErr("Could not read file. Ensure it is a valid XLSX, CSV, or JSON file.");
    }
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
                { label: "TPRM Reviews",      value: `${lVendors.filter(v => v.status === "review").length}`, sub: "Vendors under review", color: "#0891B2", onSelect: () => setTab("tprm") },
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
                          <div key={i} style={{ flex: 1, height: 32, borderRadius: 5, background: cellBg(l, i), border: `1px solid ${cellBorder(l, i)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, overflow: "hidden" }}>
                            {(() => {
                              const sevOrder = ["Critical","High","Medium","Low","Informational"];
                              const risks = risky.map(([id]) => lRisks.find((r:any) => r.id === id)).filter(Boolean) as any[];
                              if (!risks.length) return null;
                              const top = [...risks].sort((a:any,b:any) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))[0];
                              return (<>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor(top.severity), border: "1px solid rgba(255,255,255,0.45)", flexShrink: 0 }} />
                                <span style={{ fontSize: 8, fontWeight: 800, color: dotColor(top.severity), lineHeight: 1 }}>{risks.length}</span>
                              </>);
                            })()}
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
                    <span key={s} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--muted-foreground)" }}>
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
                  { label: "Pending",     count: lTreatments.filter(t => t.status === "pending").length,     color: "#DC2626", bg: "rgba(239,68,68,0.06)" },
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
                {lRisks.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).slice(0, 6).map((r, idx) => (
                  <div key={r.id} onClick={() => { setSelRisk(r); setTab("register"); }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(147,197,253,0.05)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F9F8F6", cursor: "pointer" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "var(--muted-foreground)", width: 20, flexShrink: 0 }}>#{idx + 1}</span>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(r.severity), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "rgb(147,197,253)" }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{r.category}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 13, color: r.severity === "Critical" ? "#DC2626" : r.severity === "High" ? "#D97706" : "var(--foreground)" }}>{r.score}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, background: r.status === "identified" ? "rgba(239,68,68,0.06)" : r.status === "accepted" ? "rgba(34,197,94,0.08)" : r.status === "closed" ? "rgba(107,114,128,0.08)" : "rgba(245,158,11,0.06)", color: r.status === "identified" ? "#991B1B" : r.status === "accepted" ? "#065F46" : r.status === "closed" ? "#4B5563" : "#92400E", borderRadius: 4, padding: "2px 7px", textTransform: "uppercase" as const, flexShrink: 0 }}>{r.status}</span>
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
                  // MED-F-021: previously 11 of 12 points were fabricated (only the
                  // last was live). There is no server-side monthly history endpoint,
                  // so the chart now shows the real current count as an honest flat
                  // trend with an explicit note, rather than misleading mock history.
                  const current = lRisks.length;
                  const data = new Array(12).fill(current);
                  const mon = ["J","A","S","O","N","D","J","F","M","A","M","J"];
                  const maxV = Math.max(...data, 1), minV = Math.min(...data, 0), rng = maxV-minV||1;
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
                      <div style={{ marginTop:4, fontSize:9, color:"var(--muted-foreground)", fontStyle:"italic" }}>
                        Showing current count ({current} open). Monthly history requires a server-side history endpoint (not yet wired).
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
                  // MED-F-022: previously fell back to a fabricated [6,5,4,4,3,3] when
                  // all real counts were 0 — falsely implying 25 open risks on an empty
                  // tenant. Now shows the real counts (zeros) honestly.
                  const vals = counts;
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
                  { kri:"Overdue Treatments",     current:lTreatments.filter(t=>t.status==="pending").length,      threshold:10, color:"#D97706", unit:"" },
                  { kri:"Appetite Breaches",      current:appetiteBreaches,                                        threshold:2,  color:"#DC2626", unit:"" },
                  { kri:"TPRM Reviews Pending",   current:lVendors.filter(v=>v.status==="review").length,       threshold:8,  color:"#0891B2", unit:"" },
                  { kri:"Risk Score (Avg)",        current:lRisks.length>0?Math.round(lRisks.reduce((s,r)=>s+(r.score||0),0)/lRisks.length):0, threshold:50, color:"var(--muted-foreground)", unit:"" },
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
              <input type="file" ref={importFileRef} style={{display:"none"}} accept=".csv,.json,.xlsx,.xls"
                onChange={handleImportFile}/>
              <button onClick={() => exportRegister("csv")}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid #22c55e", background:"linear-gradient(135deg,#14532d,#166534)", color:"#86efac", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>
                ↓ Export CSV
              </button>
              <button onClick={() => exportRegister("xlsx")}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid #10b981", background:"linear-gradient(135deg,#065f46,#047857)", color:"#6ee7b7", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>
                ↓ Export XLSX
              </button>
              <button onClick={()=>{ setShowImport(true); setImportTab("github"); setImportGhStatus("idle"); setImportGhErr(""); setImportGhFiles([]); }}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border:"1px solid #6366f1", background:"linear-gradient(135deg,#1e1b4b,#312e81)", color:"#c7d2fe", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>
                ⬆ Import Register
              </button>
              <button onClick={handleScoreWithAI} disabled={scoringRisks}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:7, border: scoringRisks ? "1px solid rgba(167,139,250,0.3)" : "1px solid #a855f7", background: scoringRisks ? "rgba(88,28,135,0.2)" : "linear-gradient(135deg,#3b0764,#581c87)", color: scoringRisks ? "rgba(196,181,253,0.45)" : "#e9d5ff", fontSize:11, fontWeight:700, cursor: scoringRisks ? "not-allowed" : "pointer", fontFamily:"inherit", transition:"all 0.2s", boxShadow: scoringRisks ? "none" : "0 2px 8px rgba(0,0,0,0.4)" }}>
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
                { label: "Open Risks",   value: lRisks.filter(r => r.status !== "accepted" && r.status !== "closed").length, color: "#92400E", bg: "rgba(245,158,11,0.06)", border: "#FDE68A" },
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
            <SmartTable
              rows={riskSevFilter === "All" ? lRisks : lRisks.filter(r => r.severity === riskSevFilter)}
              idField="id"
              accentColor="rgb(147,197,253)"
              onCreate={() => setShowCreate(true)}
              createLabel="+ New Risk"
              onDelete={(ids) => {
                // MED-F-025: previously ids.slice(0,1) — only the first selected
                // risk was deleted. Now bulk-delete every selected id (one confirm).
                if (ids.length <= 1) {
                  const id = ids[0]; const r = lRisks.find(x=>(x.riskId??x.id)===id);
                  if (r) setConfirmDelRisk({id:String(id),name:r.name});
                } else {
                  setConfirmDelBulk({ ids: ids.map(String), count: ids.length });
                }
              }}
              onEnrich={(ids) => ids.forEach(id => { const r = lRisks.find(x=>(x.riskId??x.id)===id); if(r) handleEnrichRisk(String(id),r.name,r.category); })}
              onRowClick={r => navigate(`/riskops/risks/${r.id}`)}
              emptyMessage="No risks match the current filters."
              extraBulkActions={[{
                label:"Generate Playbook", icon:"▶", color:"#34D399", bg:"rgba(52,211,153,0.1)", border:"rgba(52,211,153,0.3)",
                onClick:(ids) => { const r = lRisks.find(x=>(x.riskId??x.id)===ids[0]); if(r) handleGeneratePlaybook({name:r.name,severity:r.severity??"High",category:r.category??"Security",description:r.description}); }
              }]}
              columns={[
                { key:"id", label:"Risk ID", filterType:"text", minWidth:90,
                  render:r => <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"var(--muted-foreground)" }}>{r.id}</span> },
                { key:"name", label:"Risk Name", filterType:"text", minWidth:180,
                  render:r => <span style={{ fontWeight:600, color:"rgb(147,197,253)", fontSize:12 }}>{r.name}</span> },
                { key:"category", label:"Category", filterType:"select",
                  options:[...new Set(lRisks.map(r=>r.category))].filter(Boolean).sort() as string[],
                  render:r => <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{r.category}</span> },
                { key:"severity", label:"Severity", filterType:"select",
                  options:["Critical","High","Medium","Low"],
                  render:r => <SevBadge label={r.severity}/> },
                { key:"score", label:"Score", sortable:true, minWidth:70,
                  render:r => <span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:r.severity==="Critical"?"#991B1B":r.severity==="High"?"#92400E":"var(--foreground)" }}>{r.score}</span>
                    {r.aiScoreSource && <span title="Score set by AI vCISO" style={{ marginLeft:5, fontSize:9, background:"rgba(167,139,250,0.15)", color:"#C4B5FD", border:"1px solid rgba(167,139,250,0.3)", borderRadius:3, padding:"1px 4px", fontWeight:700 }}>AI</span>}
                  </span> },
                { key:"ownerFull", label:"Owner", filterType:"text",
                  render:r => <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>{r.ownerFull}</span> },
                { key:"status", label:"Status", filterType:"select",
                  options:["open","in-progress","closed","accepted"],
                  render:r => <Badge label={r.status}/> },
                { key:"trend", label:"Trend", filterType:"select",
                  options:["up","stable","down"],
                  render:r => <span style={{ color:r.trend==="down"?"#065F46":r.trend==="up"?"#DC2626":"var(--muted-foreground)", fontWeight:700, fontSize:11 }}>{r.trend==="down"?"▼ Decreasing":r.trend==="up"?"▲ Increasing":"— Stable"}</span> },
                { key:"_actions", label:"", filterType:"none", sortable:false, width:168,
                  render:r => { const rid = r.riskId??r.id; return <div style={{ display:"flex", gap:3 }} onClick={e=>e.stopPropagation()}>
                    <button title="Edit" onClick={()=>openEditRisk(r)} style={{...actBtn,color:"rgb(147,197,253)"}}>✏</button>
                    <button title="AI Enrich" onClick={()=>handleEnrichRisk(rid,r.name,r.category)} disabled={enrichingRisk===rid} style={{...actBtn,color:enrichingRisk===rid?"rgba(99,102,241,0.4)":"#818CF8"}}>{enrichingRisk===rid?"⟳":"✦"}</button>
                    <button title="Generate Playbook" onClick={()=>handleGeneratePlaybook({name:r.name,severity:r.severity??"High",category:r.category??"Security",description:r.description})} style={{...actBtn,color:"#34D399"}}>▶</button>
                    <button title="Delete" onClick={()=>setConfirmDelRisk({id:rid,name:r.name})} style={{...actBtn,color:"#F87171"}}>✕</button>
                    <button title="Assign Owner" onClick={()=>setOwnerPickR({type:"risk",id:rid,name:r.name,owner:r.ownerFull??r.owner??""})} style={{...actBtn,color:"#C4B5FD"}}>◉</button>
                    <button title="Set Severity" onClick={()=>setRiskPickR({type:"risk",id:rid,name:r.name,level:r.severity??"Medium",field:"severity"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
                    <button title="Upload Evidence" onClick={()=>setEvidPickR({type:"risk",id:rid,name:r.name})} style={{...actBtn,color:"#34D399"}}>⊕</button>
                  </div>; } },
              ]}
            />
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
                {lAppetite.map(a => {
                  const isEditing = editingAppetite === a.id;
                  return (
                  <div key={a.domain} style={{ background: "var(--card)", border: `1px solid ${a.breached ? "#FECACA" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "14px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(147,197,253)" }}>{a.domain}</span>
                        <span style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)" }}>Appetite: {a.appetite}</span>
                        {a.breached && <span style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(252,165,165,0.25)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#991B1B" }}>⚠ Breached</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {isEditing ? (
                          <>
                            <label style={{ fontSize: 11, color: "var(--muted-foreground)", display:"flex", alignItems:"center", gap:4 }}>
                              Threshold:
                              <input type="number" min={0} max={10} value={appetiteEditVals.threshold}
                                onChange={e => setAppetiteEditVals(v => ({ ...v, threshold: Number(e.target.value) }))}
                                style={{ width:48, padding:"2px 6px", borderRadius:4, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontFamily:"'JetBrains Mono',monospace", fontSize:12 }} />
                            </label>
                            <label style={{ fontSize: 11, color: "var(--muted-foreground)", display:"flex", alignItems:"center", gap:4 }}>
                              Current:
                              <input type="number" min={0} max={10} value={appetiteEditVals.current}
                                onChange={e => setAppetiteEditVals(v => ({ ...v, current: Number(e.target.value) }))}
                                style={{ width:48, padding:"2px 6px", borderRadius:4, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontFamily:"'JetBrains Mono',monospace", fontSize:12 }} />
                            </label>
                            <button disabled={appetiteSaving} onClick={() => handleSaveAppetite(a.id)}
                              style={{ padding:"3px 10px", borderRadius:4, border:"1px solid rgba(16,185,129,0.4)", background:"rgba(16,185,129,0.1)", color:"#10B981", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                              {appetiteSaving ? "…" : "Save"}
                            </button>
                            <button onClick={() => setEditingAppetite(null)}
                              style={{ padding:"3px 8px", borderRadius:4, border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"var(--muted-foreground)", fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Threshold: <strong style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{a.threshold}</strong></span>
                            <span style={{ fontSize: 11, color: a.breached ? "#991B1B" : "#065F46", fontWeight: 700 }}>Current: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{a.current}</strong></span>
                            <button onClick={() => { setEditingAppetite(a.id); setAppetiteEditVals({ threshold: a.threshold, current: a.current }); }}
                              style={{ padding:"2px 7px", borderRadius:4, border:"1px solid rgba(147,197,253,0.2)", background:"rgba(147,197,253,0.06)", color:"rgb(147,197,253)", fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>
                              ✏ Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ height: 8, background: "var(--input)", borderRadius: 4, position: "relative" }}>
                      <div style={{ position: "absolute", top: -3, left: `${(a.threshold / 10) * 100}%`, width: 2, height: 14, background: "#1E3A5F", borderRadius: 1 }} />
                      <div style={{ height: "100%", width: `${(a.current / 10) * 100}%`, background: a.breached ? "#EF4444" : "#10B981", borderRadius: 4 }} />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* ── Treatment Plans sub-tab ── */}
            {registerSubTab === "treatments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={openAddTreatment}
                    style={{ padding: "6px 16px", borderRadius: 7, border: "1px solid rgba(147,197,253,0.3)", background: "rgba(147,197,253,0.08)", color: "rgb(147,197,253)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    + Add Treatment
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <TableShell
                      onRowClick={i => setSelTreatment(lTreatments[i] === selTreatment ? null : lTreatments[i])}
                      cols={["ID", "Linked Risk", "Treatment Name", "Type", "Owner", "Due Date", "Priority", "Status"]}
                      rows={lTreatments.map(t => [
                        <Mono>{t.treatmentId ?? t.id}</Mono>,
                        <Mono>{t.riskId ?? t.risk ?? "—"}</Mono>,
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
                            <div style={{ fontSize: 12, fontWeight: 800, color: "rgb(147,197,253)" }}>{selTreatment.treatmentId ?? selTreatment.id}</div>
                            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>Linked: {selTreatment.riskId ?? selTreatment.risk ?? "—"}</div>
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
                          {selTreatment.notes && (
                            <div style={{ marginTop: 4, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 8 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "rgb(147,197,253)", marginBottom: 5 }}>📋 NOTES</div>
                              <div style={{ fontSize: 11, color: "var(--foreground)", lineHeight: 1.5 }}>{selTreatment.notes}</div>
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={() => openEditTreatment(selTreatment)}
                              style={{ flex: 1, padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(147,197,253,0.25)", background: "rgba(147,197,253,0.08)", color: "rgb(147,197,253)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              ✏ Edit
                            </button>
                            <button disabled={trtDeleting} onClick={() => handleDeleteTreatment(selTreatment)}
                              style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              {trtDeleting ? "…" : "🗑"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TPRM ──────────────────────────────────────────────────────────── */}
        {tab === "tprm" && (
          <>
            {/* TPRM Sub-navigation */}
            <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:12, alignItems:"flex-end" }}>
              {([
                { key:"vendors",        label:"Vendors",        icon:"🏢" },
                { key:"questionnaires", label:"Questionnaires", icon:"📋" },
              ] as const).map(sub => (
                <button key={sub.key} onClick={() => setTprmSubTab(sub.key)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 20px", border:"none", borderRadius:"6px 6px 0 0", background:tprmSubTab===sub.key?"rgba(147,197,253,0.10)":"transparent", color:tprmSubTab===sub.key?"rgb(147,197,253)":"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", borderBottom:tprmSubTab===sub.key?"2px solid rgb(147,197,253)":"2px solid transparent", whiteSpace:"nowrap" as const }}>
                  <span>{sub.icon}</span>{sub.label}
                </button>
              ))}
              <button onClick={()=>{ setShowVendorCreate(true); setVendorCreateError(""); setVendorCreateForm({ name:"", category:"", contact:"", tier:"2", critical:false }); }} style={{ marginLeft:"auto", padding:"6px 12px", borderRadius:6, background:"linear-gradient(135deg,#1E3A5F,#065F46)", border:"none", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", marginBottom:4 }}>+ New Vendor</button>
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
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{v.category}</span>,
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
                      <button title="Set Risk Tier" onClick={()=>setRiskPickR({type:"vendor",id:v.id,name:v.name,level:String(v.tier??"Low"),/* MED-F-030: riskTier not a DB column — use riskScore. */ field:"riskScore"})} style={{...actBtn,color:"#FCD34D"}}>▲</button>
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
        {showVendorCreate && (
          <AppModal
            open={showVendorCreate}
            onOpenChange={(o) => { if (!o) setShowVendorCreate(false); }}
            title="New Vendor"
            size="md"
          >
            <AppModalBody className="space-y-2.5">
              <div>
                <Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vendor Name *</Label>
                <Input value={vendorCreateForm.name} onChange={e=>setVendorCreateForm(s=>({...s,name:e.target.value}))} placeholder="Acme Cloud Inc." />
              </div>
              <div>
                <Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Category</Label>
                <Input value={vendorCreateForm.category} onChange={e=>setVendorCreateForm(s=>({...s,category:e.target.value}))} placeholder="Cloud Infrastructure" />
              </div>
              <div>
                <Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contact Email</Label>
                <Input type="email" value={vendorCreateForm.contact} onChange={e=>setVendorCreateForm(s=>({...s,contact:e.target.value}))} placeholder="security@acme.com" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tier</Label>
                  <select value={vendorCreateForm.tier} onChange={e=>setVendorCreateForm(s=>({...s,tier:e.target.value}))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option value="1">1 — Critical</option><option value="2">2 — High</option><option value="3">3 — Standard</option>
                  </select>
                </div>
                <div className="flex flex-1 items-end">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs"><input type="checkbox" checked={vendorCreateForm.critical} onChange={e=>setVendorCreateForm(s=>({...s,critical:e.target.checked}))} /> Critical</label>
                </div>
              </div>
              {vendorCreateError && <p className="px-2.5 py-1.5 text-xs text-destructive">{vendorCreateError}</p>}
            </AppModalBody>
            <AppModalFooter>
              <Button variant="outline" onClick={()=>setShowVendorCreate(false)}>Cancel</Button>
              <Button disabled={vendorCreateSaving||!vendorCreateForm.name.trim()} onClick={async()=>{ setVendorCreateSaving(true); setVendorCreateError(""); try { const c=vendorCreateForm.contact.trim(); if(c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)){ setVendorCreateError("Contact email format is invalid."); setVendorCreateSaving(false); return; } const res=await fetch("/api/risks/vendors",{method:"POST",headers:{Authorization:`Bearer ${localStorage.getItem("grc_token")??""}`,"Content-Type":"application/json"},body:JSON.stringify({name:vendorCreateForm.name.trim(),category:vendorCreateForm.category.trim()||"Other",contact:c,tier:Number(vendorCreateForm.tier),critical:vendorCreateForm.critical,status:"review",score:50})}); const d=await res.json().catch(()=>({})); if(!res.ok){setVendorCreateError(d.error??`Failed (HTTP ${res.status})`);return;} setDbVendors(p=>[d,...p]); setShowVendorCreate(false);}catch{setVendorCreateError("Network error");}finally{setVendorCreateSaving(false);} }}>{vendorCreateSaving?"Creating…":"Create Vendor"}</Button>
            </AppModalFooter>
          </AppModal>
        )}

        {/* ── HEAT MAP (new) ─────────────────────────────────────────────────── */}
        {tab === "heatmap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
              {[["#FEE2E2","#FECACA","Critical (16–25)"],["rgba(245,158,11,0.10)","#FDE68A","High (10–15)"],["rgba(34,197,94,0.08)","#A7F3D0","Medium (5–9)"],["rgba(34,197,94,0.08)","#BBF7D0","Low (1–4)"]].map(([bg,bdr,label]) => (
                <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 14, height: 14, background: bg as string, border: `1px solid ${bdr as string}`, borderRadius: 3 }} />
                  <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{label}</span>
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
                                flex: 1, aspectRatio: "1", background: cellBg(l, i), border: `1.5px solid ${isHovered || isSelected ? "#60A5FA" : cellBorder(l, i)}`,
                                borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                gap: 2, cursor: cellRisks.length > 0 ? "pointer" : "default",
                                boxShadow: isHovered ? "0 0 0 2px rgba(96,165,250,0.25)" : isSelected ? "0 0 0 2px rgba(96,165,250,0.4)" : "none",
                                transition: "box-shadow 0.12s, border-color 0.12s",
                                position: "relative", overflow: "hidden",
                              }}
                            >
                              {(() => {
                                if (cellRisks.length === 0) {
                                  return isHovered ? <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 700 }}>{l * i}</span> : null;
                                }
                                const sevOrder = ["Critical","High","Medium","Low","Informational"];
                                const top = [...cellRisks].sort((a:any,b:any) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity))[0];
                                const col = dotColor(top.severity);
                                return (<>
                                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: col, border: "1.5px solid rgba(255,255,255,0.55)", boxShadow: `0 0 4px ${col}66`, flexShrink: 0 }} title={`${cellRisks.length} risk(s) — most severe: ${top.severity}`} />
                                  <span style={{ fontSize: 10, fontWeight: 800, color: col, lineHeight: 1, letterSpacing: "-0.5px" }}>{cellRisks.length}</span>
                                </>);
                              })()}
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
                      <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{sev}</span>
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
                  {lRisks.length === 0
                    ? <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "24px 0", textAlign: "center" }}>No risks yet. Create a risk to see it on the heatmap.</div>
                    : heatMapRisks.map(r => {
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
                        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, flexWrap:"wrap" as const }}>
                          <span>Score: <strong style={{ color: "var(--foreground)" }}>{r.score}</strong></span>
                          {r.ciaScore > 0 && <span style={{ color:"rgb(147,197,253)" }}>CIA: <strong>{r.ciaScore}</strong></span>}
                          {r.inherentScore > 0 && <span style={{ color:"rgb(245,158,11)" }}>Inherent: <strong>{r.inherentScore}</strong></span>}
                          {r.residualScoreVal > 0 && <span style={{ color:"rgb(52,211,153)" }}>Residual: <strong>{r.residualScoreVal}</strong></span>}
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
                {(dbCascades.length > 0 ? dbCascades : [
                  { from: "RK-2041", to: "RK-2039", rel: "amplifies",  desc: "Cloud misconfiguration exposes privileged credentials" },
                  { from: "RK-2039", to: "RK-2037", rel: "compounds",  desc: "Compromised admin accounts ease unpatched server exploitation" },
                  { from: "RK-2035", to: "RK-2033", rel: "triggers",   desc: "Missing DPA may block DSAR fulfilment and cause SLA breach" },
                  { from: "RK-2031", to: "RK-2029", rel: "amplifies",  desc: "Stale firewall rules may not catch certificate-based attacks" },
                ]).map((c: any, idx: number) => {
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
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", flex: 1 }}>{c.desc}</span>
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

      {/* ── Create Risk Wizard ─────────────────────────────────────────── */}
      <WizardModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setWf({ ...blankWf }); setWizStep(0); }}
        title="Register New Risk"
        subtitle="Complete all steps to register a fully-documented risk"
        entityIcon="⚠️"
        accentColor="#991B1B"
        steps={RISK_WIZARD_STEPS}
        step={wizStep}
        onStepBack={() => setWizStep(s => Math.max(0, s - 1))}
        onStepNext={() => setWizStep(s => Math.min(RISK_WIZARD_STEPS.length - 1, s + 1))}
        onFinish={handleCreateWizard}
        finishing={creating}
        finishLabel="Register Risk"
        canNext={wizCanNext}
      >
        {(() => {
          const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:4, display:"block" };
          const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box" as const, outline:"none" };
          const ta:  React.CSSProperties = { ...inp, minHeight:80, resize:"vertical" as const };
          const row: React.CSSProperties = { marginBottom:14 };
          const g2:  React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 };
          const g3:  React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 };
          const hint: React.CSSProperties = { padding:"10px 12px", background:"rgba(147,197,253,0.05)", border:"1px solid rgba(147,197,253,0.15)", borderRadius:8, fontSize:11, color:"var(--muted-foreground)", marginBottom:16 };

          /* Step 0 — Core Identity */
          if (wizStep === 0) return (
            <div>
              <div style={row}>
                <label style={lbl}>Risk / Threat Name *</label>
                <input style={inp} value={wf.name} onChange={e => wu("name")(e.target.value)}
                  placeholder="e.g. Unpatched critical CVE in production API" autoFocus/>
              </div>
              <div style={g2}>
                <div>
                  <label style={lbl}>Category</label>
                  <select style={inp} value={wf.category} onChange={e => wu("category")(e.target.value)}>
                    {RISK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Severity</label>
                  <div style={{ display:"flex", gap:4, marginTop:4 }}>
                    {(["Critical","High","Medium","Low"]).map(s => (
                      <button key={s} onClick={() => wu("severity")(s)}
                        style={{ flex:1, padding:"6px 0", borderRadius:6, border:`1px solid ${wf.severity===s?"#991B1B":"var(--border)"}`, background:wf.severity===s?"rgba(153,27,27,0.18)":"transparent", color:wf.severity===s?"#FCA5A5":"var(--muted-foreground)", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={g2}>
                <div>
                  <label style={lbl}>Risk Score (0–100)</label>
                  <div style={{ padding:"10px 14px", borderRadius:8, border:"1px solid rgba(147,197,253,0.25)", background:"rgba(147,197,253,0.04)", fontSize:11, color:"var(--muted-foreground)" }}>
                    Auto-computed as <strong style={{ color:"rgb(147,197,253)", fontFamily:"monospace" }}>C × I × A × P × Impact</strong> on step 2 &amp; 3
                  </div>
                </div>
                <div>
                  <label style={lbl}>Initial Status</label>
                  <select style={inp} value={wf.name ? "open" : "open"} onChange={() => {}}>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="accepted">Accepted</option>
                  </select>
                </div>
              </div>
              <div style={g2}>
                <div>
                  <label style={lbl}>Owner (Short Name) *</label>
                  <input style={inp} value={wf.owner} onChange={e => wu("owner")(e.target.value)} placeholder="e.g. A. Kim"/>
                </div>
                <div>
                  <label style={lbl}>Owner Full Name</label>
                  <input style={inp} value={wf.ownerFull} onChange={e => wu("ownerFull")(e.target.value)} placeholder="e.g. Alex Kim"/>
                </div>
              </div>
            </div>
          );

          /* Step 1 — Asset Context */
          if (wizStep === 1) return (
            <div>
              <div style={hint}>
                💡 Identify the asset or business process this risk affects. All fields optional but improve XLSX export quality.
              </div>
              <div style={row}>
                <label style={lbl}>Assets / Business Process</label>
                <input style={inp} value={wf.asset} onChange={e => wu("asset")(e.target.value)}
                  placeholder="e.g. IT Asset Management (Desktop, Laptops, Servers)"/>
              </div>
              <div style={g2}>
                <div>
                  <label style={lbl}>Asset Custodian</label>
                  <input style={inp} value={wf.custodian} onChange={e => wu("custodian")(e.target.value)} placeholder="e.g. IT Dept, Security Team"/>
                </div>
                <div>
                  <label style={lbl}>Location / Zone</label>
                  <input style={inp} value={wf.location} onChange={e => wu("location")(e.target.value)} placeholder="e.g. Fixed, Mobile, Cloud, On-premises"/>
                </div>
              </div>
            </div>
          );

          /* Step 2 — CIA Ratings */
          if (wizStep === 2) {
            const ciaScore = [wf.c, wf.iVal, wf.a].every(v => v && !isNaN(Number(v)))
              ? String(Number(wf.c) * Number(wf.iVal) * Number(wf.a)) : "—";
            return (
              <div>
                <div style={hint}>
                  💡 Rate each dimension 1–5 (1 = minimal, 5 = critical). CIA Score = C × I × A (max 125). All fields optional.
                </div>
                <div style={g3}>
                  <div>
                    <label style={lbl}>C — Confidentiality</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.c} onChange={e => wu("c")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>Data disclosure risk</div>
                  </div>
                  <div>
                    <label style={lbl}>I — Integrity</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.iVal} onChange={e => wu("iVal")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>Data tampering risk</div>
                  </div>
                  <div>
                    <label style={lbl}>A — Availability</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.a} onChange={e => wu("a")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:10, color:"var(--muted-foreground)", marginTop:4 }}>Downtime / outage risk</div>
                  </div>
                </div>
                <div style={row}>
                  <label style={lbl}>CIA Score (C × I × A — auto-computed)</label>
                  <div style={{ padding:"14px 16px", borderRadius:8, border:"1px solid rgba(147,197,253,0.3)", background:"rgba(147,197,253,0.05)", fontSize:28, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:"rgb(147,197,253)", textAlign:"center" as const }}>
                    {ciaScore}
                  </div>
                </div>
              </div>
            );
          }

          /* Step 3 — Risk Assessment */
          if (wizStep === 3) {
            const asCia = [wf.c, wf.iVal, wf.a].every(v => v && !isNaN(Number(v)))
              ? Number(wf.c) * Number(wf.iVal) * Number(wf.a) : null;
            const asPnum = Number(wf.probability) || 0;
            const asInum = Number(wf.impact) || 0;
            const asInherent = asCia && asPnum && asInum ? asCia * asPnum * asInum : null;
            const asNorm = asInherent ? Math.min(100, Math.round(asInherent / 3125 * 100)) : null;
            return (
              <div>
                <div style={row}>
                  <label style={lbl}>Vulnerability / Weakness *</label>
                  <textarea style={{ ...ta, minHeight:100 }} value={wf.vulnerability} onChange={e => wu("vulnerability")(e.target.value)}
                    placeholder="Describe the specific weakness, gap or vulnerability that exposes the asset to this threat. Be specific — this drives AI risk scoring." autoFocus/>
                </div>
                <div style={g3}>
                  <div>
                    <label style={lbl}>Probability (1–5)</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.probability} onChange={e => wu("probability")(e.target.value)} placeholder="1=Rare, 5=Certain"/>
                  </div>
                  <div>
                    <label style={lbl}>Impact (1–5)</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.impact} onChange={e => wu("impact")(e.target.value)} placeholder="1=Minor, 5=Critical"/>
                  </div>
                  <div>
                    <label style={lbl}>Inherent Risk Score</label>
                    <div style={{ padding:"14px 16px", borderRadius:8, border:`1px solid ${asInherent ? "rgba(245,158,11,0.4)" : "var(--border)"}`, background: asInherent ? "rgba(245,158,11,0.06)" : "rgba(0,0,0,0.15)", textAlign:"center" as const }}>
                      {asInherent
                        ? <><span style={{ fontFamily:"monospace", fontWeight:800, fontSize:22, color:"rgb(245,158,11)" }}>{asInherent}</span><span style={{ fontSize:10, color:"var(--muted-foreground)", display:"block" }}>{asCia} × {asPnum} × {asInum} → {asNorm}/100</span></>
                        : <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Fill C/I/A + P + Impact</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          /* Step 4 — Controls */
          if (wizStep === 4) return (
            <div>
              <div style={{ ...hint, borderColor:"rgba(52,211,153,0.2)", background:"rgba(52,211,153,0.04)" }}>
                🛡️ Document controls already in place. ISO 27001:2022 control IDs e.g. A.8.8, A.5.9 (comma or newline separated).
              </div>
              <div style={row}>
                <label style={lbl}>Existing Controls</label>
                <textarea style={{ ...ta, minHeight:90 }} value={wf.controls} onChange={e => wu("controls")(e.target.value)}
                  placeholder="e.g. Crowdstrike EDR, Palo Alto NGFW, MFA on all privileged accounts, monthly patch cycle…"/>
              </div>
              <div style={row}>
                <label style={lbl}>ISO 27001:2022 Control References</label>
                <textarea style={ta} value={wf.iso27001} onChange={e => wu("iso27001")(e.target.value)}
                  placeholder="e.g. A.8.8 (Vulnerability Mgmt), A.8.5 (Privileged Access), A.5.9 (Asset Inventory)"/>
              </div>
            </div>
          );

          /* Step 5 — Residual & Treatment */
          if (wizStep === 5) {
            const resCia = [wf.c, wf.iVal, wf.a].every(v => v && !isNaN(Number(v)))
              ? Number(wf.c) * Number(wf.iVal) * Number(wf.a) : null;
            const resRp = Number(wf.residualProb) || 0;
            const resRi = Number(wf.residualImpact) || 0;
            const resInherent = resCia && resRp && resRi ? resCia * resRp * resRi : null;
            const resNorm = resInherent ? Math.min(100, Math.round(resInherent / 3125 * 100)) : null;
            return (
              <div>
                <div style={g3}>
                  <div>
                    <label style={lbl}>Residual Probability</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.residualProb} onChange={e => wu("residualProb")(e.target.value)} placeholder="1–5"/>
                  </div>
                  <div>
                    <label style={lbl}>Residual Impact</label>
                    <input style={inp} type="number" min={1} max={5} value={wf.residualImpact} onChange={e => wu("residualImpact")(e.target.value)} placeholder="1–5"/>
                  </div>
                  <div>
                    <label style={lbl}>Residual Risk Score</label>
                    <div style={{ padding:"14px 16px", borderRadius:8, border:`1px solid ${resInherent ? "rgba(52,211,153,0.4)" : "var(--border)"}`, background: resInherent ? "rgba(52,211,153,0.06)" : "rgba(0,0,0,0.15)", textAlign:"center" as const }}>
                      {resInherent
                        ? <><span style={{ fontFamily:"monospace", fontWeight:800, fontSize:22, color:"rgb(52,211,153)" }}>{resInherent}</span><span style={{ fontSize:10, color:"var(--muted-foreground)", display:"block" }}>{resCia} × {resRp} × {resRi} → {resNorm}/100</span></>
                        : <span style={{ fontSize:11, color:"var(--muted-foreground)" }}>Fill C/I/A + Residual P + I</span>}
                    </div>
                  </div>
                </div>
                <div style={row}>
                  <label style={lbl}>Recommended Action / Treatment Plan</label>
                  <textarea style={ta} value={wf.recommendedAction} onChange={e => wu("recommendedAction")(e.target.value)}
                    placeholder="e.g. Deploy endpoint detection, enforce patch within 30 days, isolate affected systems, escalate to CISO…"/>
                </div>
                <div style={row}>
                  <label style={lbl}>Management Response</label>
                  <textarea style={{ ...ta, minHeight:60 }} value={wf.mgmtResponse} onChange={e => wu("mgmtResponse")(e.target.value)}
                    placeholder="e.g. Risk accepted by Management, Mitigate within Q3, Transfer to insurance provider…"/>
                </div>
                {/* Summary preview */}
                <div style={{ padding:"12px 14px", borderRadius:8, background:"var(--secondary)", border:"1px solid var(--border)" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:10 }}>📋 Risk Summary Preview</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                    {[
                      { l:"Name",        v:wf.name||"—" },
                      { l:"Category",    v:wf.category },
                      { l:"Severity",    v:wf.severity },
                      { l:"Score",       v:wf.score||"—" },
                      { l:"Owner",       v:wf.owner||"—" },
                      { l:"Asset",       v:wf.asset||"—" },
                    ].map(x => (
                      <div key={x.l}>
                        <div style={{ fontSize:9, color:"var(--muted-foreground)", fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{x.l}</div>
                        <div style={{ fontSize:11, color:"var(--foreground)", fontWeight:600, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })()}
      </WizardModal>

      {/* ── Risk Detail / Edit Modal ─────────────────────────────────────── */}
      {showEditRisk && (() => {
        const F = editRiskForm;
        const up = (k: string) => (v: string) => setEditRiskForm(p => ({ ...p, [k]: v }));
        const lbl: React.CSSProperties = { fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:4, display:"block" };
        const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", boxSizing:"border-box" as const, outline:"none" };
        const ta:  React.CSSProperties = { ...inp, minHeight:72, resize:"vertical" as const };
        const row: React.CSSProperties = { marginBottom:14 };
        const g2:  React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 };
        const g3:  React.CSSProperties = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 };
        const sec: React.CSSProperties = { fontSize:10, fontWeight:800, color:"rgba(147,197,253,0.7)", letterSpacing:"0.8px", textTransform:"uppercase" as const, marginBottom:10, paddingBottom:6, borderBottom:"1px solid var(--border)", marginTop:20 };

        const sevCols: Record<string,[string,string]> = {
          Critical:["#991B1B","#FCA5A5"], High:["#92400E","#FDE68A"],
          Medium:["#1E3A5F","rgb(147,197,253)"], Low:["#065F46","#A7F3D0"],
        };
        const [sevBg, sevFg] = sevCols[F.severity] ?? ["var(--border)","var(--foreground)"];

        const ciaScore = F.c && F.iVal && F.a
          ? Number(F.c)*Number(F.iVal)*Number(F.a) : null;

        // Time-to-close calculations
        const today = new Date(); today.setHours(0,0,0,0);
        const targetD = F.targetDate ? new Date(F.targetDate) : null;
        const daysLeft = targetD ? Math.ceil((targetD.getTime()-today.getTime())/(1000*86400)) : null;
        const pct = Math.min(100, Math.max(0, Number(F.mitigationProgress)||0));
        const daysColor = daysLeft === null ? "var(--muted-foreground)" : daysLeft < 0 ? "#DC2626" : daysLeft <= 7 ? "#D97706" : "#059669";

        // AIGO-X recommendations (live, updates as user edits fields)
        const aigoRecs = generateAigoRecs(F.category, F.severity, F.c, F.iVal, F.a, F.controls, F.vulnerability);
        const priColors: Record<string,[string,string]> = {
          Critical:["rgba(220,38,38,0.12)","#DC2626"],
          High:["rgba(217,119,6,0.1)","#D97706"],
          Medium:["rgba(59,130,246,0.08)","rgb(147,197,253)"],
          Advisory:["rgba(52,211,153,0.06)","#34D399"],
        };

        return (
          <AppModal open onClose={()=>{setShowEditRisk(false);setEditRiskTarget(null);}} size="2xl">
            {/* ── Header ── */}
            <div style={{ padding:"18px 24px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:"#FCA5A5", background:"rgba(153,27,27,0.15)", borderRadius:4, padding:"2px 8px", border:"1px solid rgba(153,27,27,0.3)", flexShrink:0 }}>
                    {editRiskTarget?.id ?? "—"}
                  </span>
                  <span style={{ fontSize:11, fontWeight:700, color:sevFg, background:`${sevBg}22`, borderRadius:4, padding:"2px 10px", border:`1px solid ${sevBg}55`, flexShrink:0 }}>
                    {F.severity}
                  </span>
                  <span style={{ fontSize:11, color:"var(--muted-foreground)", background:"var(--secondary)", borderRadius:4, padding:"2px 8px", border:"1px solid var(--border)", flexShrink:0 }}>
                    {F.category}
                  </span>
                </div>
                <div style={{ fontSize:16, fontWeight:700, color:"var(--foreground)", lineHeight:1.3 }}>{F.name || "Risk Detail"}</div>
              </div>
              <button onClick={()=>{setShowEditRisk(false);setEditRiskTarget(null);}} style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--muted-foreground)", fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"inherit" }}>✕</button>
            </div>

            {/* ── Body: 2-column layout ── */}
            <div style={{ display:"flex", height:"calc(min(80vh,660px) - 130px)", overflow:"hidden" }}>

              {/* Left — scrollable full-detail form */}
              <div style={{ flex:"0 0 58%", overflowY:"auto", padding:"18px 20px 24px", borderRight:"1px solid var(--border)" }}>

                {/* Identity */}
                <div style={sec}>🎯 Identity</div>
                <div style={row}><label style={lbl}>Risk / Threat Name *</label><input style={inp} value={F.name} onChange={e=>up("name")(e.target.value)} autoFocus/></div>
                <div style={g2}>
                  <div><label style={lbl}>Category</label>
                    <select style={inp} value={F.category} onChange={e=>up("category")(e.target.value)}>
                      {RISK_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Status</label>
                    <select style={inp} value={F.status} onChange={e=>up("status")(e.target.value)}>
                      {["open","in-progress","accepted","closed","transferred"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1).replace("-"," ")}</option>)}
                    </select>
                  </div>
                </div>
                <div style={g2}>
                  <div><label style={lbl}>Severity</label>
                    <div style={{ display:"flex", gap:4, marginTop:2 }}>
                      {["Critical","High","Medium","Low"].map(s=>{
                        const [bg,fg]=sevCols[s]??["var(--border)","var(--foreground)"];
                        return <button key={s} onClick={()=>up("severity")(s)} style={{ flex:1, padding:"5px 0", borderRadius:5, border:`1px solid ${F.severity===s?bg:"var(--border)"}`, background:F.severity===s?`${bg}22`:"transparent", color:F.severity===s?fg:"var(--muted-foreground)", fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{s}</button>;
                      })}
                    </div>
                  </div>
                  <div><label style={lbl}>Risk Score (0–100)</label><input style={inp} type="number" min={0} max={100} value={F.score} onChange={e=>up("score")(e.target.value)}/></div>
                </div>

                {/* Ownership */}
                <div style={sec}>👤 Ownership</div>
                <div style={g2}>
                  <div><label style={lbl}>Owner (Short)</label><input style={inp} value={F.owner} onChange={e=>up("owner")(e.target.value)} placeholder="e.g. A. Kim"/></div>
                  <div><label style={lbl}>Owner Full Name</label><input style={inp} value={F.ownerFull} onChange={e=>up("ownerFull")(e.target.value)} placeholder="e.g. Alex Kim"/></div>
                </div>
                <div style={row}><label style={lbl}>Department / Business Unit</label><input style={inp} value={F.department} onChange={e=>up("department")(e.target.value)} placeholder="e.g. IT Security, Finance, Legal"/></div>

                {/* Asset Context */}
                <div style={sec}>🏢 Asset Context</div>
                <div style={row}><label style={lbl}>Assets / Business Process</label><input style={inp} value={F.asset} onChange={e=>up("asset")(e.target.value)} placeholder="e.g. IT Asset Management, Production API, HR System"/></div>
                <div style={g2}>
                  <div><label style={lbl}>Asset Custodian</label><input style={inp} value={F.custodian} onChange={e=>up("custodian")(e.target.value)} placeholder="e.g. IT Dept"/></div>
                  <div><label style={lbl}>Location / Zone</label><input style={inp} value={F.location} onChange={e=>up("location")(e.target.value)} placeholder="e.g. Cloud, On-Prem, Mobile"/></div>
                </div>

                {/* CIA Ratings */}
                <div style={sec}>🔐 CIA Ratings</div>
                <div style={g3}>
                  <div>
                    <label style={lbl}>C — Confidentiality</label>
                    <input style={inp} type="number" min={1} max={5} value={F.c} onChange={e=>up("c")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>Data disclosure</div>
                  </div>
                  <div>
                    <label style={lbl}>I — Integrity</label>
                    <input style={inp} type="number" min={1} max={5} value={F.iVal} onChange={e=>up("iVal")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>Data tampering</div>
                  </div>
                  <div>
                    <label style={lbl}>A — Availability</label>
                    <input style={inp} type="number" min={1} max={5} value={F.a} onChange={e=>up("a")(e.target.value)} placeholder="1–5"/>
                    <div style={{ fontSize:9, color:"var(--muted-foreground)", marginTop:3 }}>Downtime risk</div>
                  </div>
                </div>
                {ciaScore !== null && (
                  <div style={{ ...row, display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:8, border:"1px solid rgba(147,197,253,0.25)", background:"rgba(147,197,253,0.04)" }}>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)", fontWeight:700 }}>CIA SCORE (C×I×A)</span>
                    <span style={{ fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:"rgb(147,197,253)" }}>{ciaScore}</span>
                    <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>/ 125 max</span>
                  </div>
                )}

                {/* Assessment */}
                <div style={sec}>⚠️ Risk Assessment</div>
                <div style={row}><label style={lbl}>Vulnerability / Weakness</label><textarea style={ta} value={F.vulnerability} onChange={e=>up("vulnerability")(e.target.value)} placeholder="Describe the specific weakness or gap exposing this asset to the threat…"/></div>
                <div style={g3}>
                  <div><label style={lbl}>Probability (1–5)</label><input style={inp} type="number" min={1} max={5} value={F.probability} onChange={e=>up("probability")(e.target.value)} placeholder="1=Rare"/></div>
                  <div><label style={lbl}>Impact (1–5)</label><input style={inp} type="number" min={1} max={5} value={F.impact} onChange={e=>up("impact")(e.target.value)} placeholder="1=Minor"/></div>
                  <div>
                    <label style={lbl}>Inherent Score</label>
                    <input style={inp} type="number" value={F.riskScore} onChange={e=>up("riskScore")(e.target.value)}
                      placeholder={F.probability&&F.impact?String(Number(F.probability)*Number(F.impact)):"P×I"}/>
                  </div>
                </div>

                {/* Controls */}
                <div style={sec}>🛡️ Existing Controls</div>
                <div style={row}><label style={lbl}>Controls in Place</label><textarea style={ta} value={F.controls} onChange={e=>up("controls")(e.target.value)} placeholder="e.g. CrowdStrike EDR, Palo Alto NGFW, MFA on privileged accounts, monthly patch cycle…"/></div>
                <div style={row}><label style={lbl}>ISO 27001:2022 References</label><textarea style={{ ...ta, minHeight:52 }} value={F.iso27001} onChange={e=>up("iso27001")(e.target.value)} placeholder="e.g. A.8.8 Vulnerability Mgmt, A.8.5 Privileged Access, A.5.9 Asset Inventory"/></div>

                {/* Treatment */}
                <div style={sec}>💊 Residual Risk & Treatment</div>
                <div style={g3}>
                  <div><label style={lbl}>Residual Prob</label><input style={inp} type="number" min={1} max={5} value={F.residualProb} onChange={e=>up("residualProb")(e.target.value)} placeholder="1–5"/></div>
                  <div><label style={lbl}>Residual Impact</label><input style={inp} type="number" min={1} max={5} value={F.residualImpact} onChange={e=>up("residualImpact")(e.target.value)} placeholder="1–5"/></div>
                  <div><label style={lbl}>Residual Score</label><input style={inp} type="number" value={F.residualScore} onChange={e=>up("residualScore")(e.target.value)} placeholder="1–25"/></div>
                </div>
                <div style={row}><label style={lbl}>Recommended Action / Treatment Plan</label><textarea style={ta} value={F.recommendedAction} onChange={e=>up("recommendedAction")(e.target.value)} placeholder="e.g. Deploy EDR, enforce patch within 30 days, isolate affected systems, escalate to CISO…"/></div>
                <div style={row}><label style={lbl}>Management Response</label><textarea style={{ ...ta, minHeight:52 }} value={F.mgmtResponse} onChange={e=>up("mgmtResponse")(e.target.value)} placeholder="e.g. Risk accepted by Management, Mitigate within Q3, Transfer to insurance…"/></div>
              </div>

              {/* Right — AIGO-X Intelligence + Time Tracking */}
              <div style={{ flex:"0 0 42%", overflowY:"auto", padding:"18px 20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* ── Time to Close Tracker ── */}
                <div style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", letterSpacing:"0.7px", textTransform:"uppercase" as const, marginBottom:12 }}>⏱ Time-to-Close Tracker</div>

                  <div style={{ marginBottom:10 }}>
                    <label style={lbl}>Target Mitigation Date</label>
                    <input style={inp} type="date" value={F.targetDate} onChange={e=>up("targetDate")(e.target.value)}/>
                  </div>

                  {targetD && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:10, color:"var(--muted-foreground)" }}>Status:</span>
                      <span style={{ fontSize:11, fontWeight:700, color:daysColor, background:`${daysColor}18`, borderRadius:4, padding:"2px 8px", border:`1px solid ${daysColor}44` }}>
                        {daysLeft !== null && daysLeft < 0 ? `⚠ ${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "📅 Due today" : `${daysLeft}d remaining`}
                      </span>
                      {daysLeft !== null && daysLeft < 0 && <span style={{ fontSize:10, color:"#DC2626", fontWeight:600 }}>ESCALATE</span>}
                    </div>
                  )}

                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <label style={lbl}>Mitigation Progress</label>
                      <span style={{ fontSize:12, fontWeight:700, color: pct>=80?"#059669":pct>=40?"#D97706":"#DC2626" }}>{pct}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={pct}
                      onChange={e=>up("mitigationProgress")(e.target.value)}
                      style={{ width:"100%", accentColor: pct>=80?"#059669":pct>=40?"#D97706":"#DC2626", cursor:"pointer" }}/>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                      <div style={{ height:6, borderRadius:3, background:`linear-gradient(90deg, ${pct>=80?"#059669":pct>=40?"#D97706":"#DC2626"} ${pct}%, var(--border) ${pct}%)`, flex:1, marginTop:2 }}/>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:9, color:"var(--muted-foreground)" }}>
                      <span>Identified</span><span>In Progress</span><span>Resolved</span>
                    </div>
                  </div>
                </div>

                {/* ── AIGO-X Intelligence ── */}
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:"rgb(147,197,253)", letterSpacing:"0.7px", textTransform:"uppercase" as const }}>✦ AIGO-X Intelligence</div>
                    <div style={{ flex:1, height:1, background:"rgba(147,197,253,0.2)" }}/>
                    <span style={{ fontSize:9, color:"var(--muted-foreground)", background:"rgba(147,197,253,0.06)", borderRadius:3, padding:"1px 6px", border:"1px solid rgba(147,197,253,0.15)" }}>LIVE</span>
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted-foreground)", marginBottom:10 }}>AI-powered recommendations updating as you edit. {aigoRecs.length} actions identified.</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {aigoRecs.map((r, i) => {
                      const [bg, fc] = priColors[r.priority] ?? ["var(--secondary)","var(--foreground)"];
                      return (
                        <div key={i} style={{ border:`1px solid ${fc}33`, borderRadius:8, padding:"10px 12px", background:bg }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                            <span style={{ fontSize:14, lineHeight:1 }}>{r.icon}</span>
                            <span style={{ fontSize:11, fontWeight:700, color:"var(--foreground)", flex:1, lineHeight:1.3 }}>{r.title}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:fc, background:`${fc}22`, borderRadius:3, padding:"1px 6px", border:`1px solid ${fc}44`, flexShrink:0, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>{r.priority}</span>
                          </div>
                          <div style={{ fontSize:10, color:"var(--muted-foreground)", lineHeight:1.55 }}>{r.detail}</div>
                          {r.framework && (
                            <div style={{ marginTop:5, display:"inline-flex", alignItems:"center", gap:4 }}>
                              <span style={{ fontSize:9, color:"rgba(147,197,253,0.6)", fontWeight:600 }}>📎 {r.framework}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ padding:"14px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>{setShowEditRisk(false);setEditRiskTarget(null);}} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              <button onClick={handleSaveRisk} disabled={savingRisk||!F.name.trim()} style={{ padding:"9px 24px", borderRadius:8, border:"none", background:savingRisk||!F.name.trim()?"rgba(127,29,29,0.35)":"linear-gradient(135deg,#7F1D1D,#991B1B)", color:"white", fontSize:13, fontWeight:700, cursor:savingRisk||!F.name.trim()?"not-allowed":"pointer", fontFamily:"inherit", minWidth:130 }}>
                {savingRisk ? "Saving…" : "💾 Save Changes"}
              </button>
            </div>
          </AppModal>
        );
      })()}

      {/* ── Import Risk Register Modal ────────────────────────────────────── */}
      {showImport && (
        <AppModal
          open={showImport}
          onOpenChange={(o) => { if (!o) setShowImport(false); }}
          title="Import Risk Register"
          description="Load risks from a GitHub repository or upload a local file (CSV / JSON)."
          size="lg"
        >
          <AppModalBody>
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
                      style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:4 }}>Branch</div>
                    <input value={importGhBranch} onChange={e=>setImportGhBranch(e.target.value)} placeholder="main"
                      style={{ width:90, padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" }}/>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", letterSpacing:"0.4px", textTransform:"uppercase", marginBottom:4 }}>Personal Access Token (for private repos)</div>
                  <input type="password" value={importGhToken} onChange={e=>setImportGhToken(e.target.value)} placeholder="ghp_… (optional for public repos)"
                    style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
                </div>
                <button onClick={fetchGhContents} disabled={importGhStatus==="loading"}
                  style={{ padding:"9px 20px", borderRadius:7, border:"none", background:importGhStatus==="loading"?"rgba(99,102,241,0.3)":"#4F46E5", color:"white", fontSize:12, fontWeight:700, cursor:importGhStatus==="loading"?"not-allowed":"pointer", fontFamily:"inherit", marginBottom:14 }}>
                  {importGhStatus==="loading"?"Connecting…":"Browse Repository"}
                </button>
                {importGhErr && (
                  <div style={{ padding:"10px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, fontSize:11, color:"#FCA5A5", lineHeight:1.6, marginBottom:12, maxHeight:180, overflowY:"auto" }}>
                    {importGhErr.split("\n").map((line, i) => (
                      <div key={i} style={{ whiteSpace:"pre-wrap" }}>{i === 0 ? `⚠ ${line}` : line}</div>
                    ))}
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
                  <div style={{ fontSize:11, color:"var(--muted-foreground)" }}>Supports XLSX, CSV, JSON · Headers are auto-mapped</div>
                </div>
                <div style={{ fontSize:11, color:"var(--muted-foreground)", marginBottom:8 }}>
                  <strong style={{ color:"rgb(165,180,252)" }}>XLSX (ASRY format):</strong> auto-detects "IT Risk Assessment Sheet" — col K (Threat) = risk name, inherits asset context from S.No rows.
                  <br/>
                  <strong style={{ color:"rgb(165,180,252)" }}>CSV:</strong> <span style={{ fontFamily:"monospace" }}>name, category, severity, score, owner, status, description</span>
                </div>
                {importFileStatus==="parsed" && (
                  <div style={{ padding:"10px 12px", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:7, fontSize:12, color:"#6EE7B7" }}>
                    ✓ {importFileCount} risks imported successfully
                  </div>
                )}
                {importFileStatus==="error" && (
                  <div style={{ padding:"10px 12px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:7, fontSize:11, color:"#FCA5A5", lineHeight:1.6, maxHeight:220, overflowY:"auto" }}>
                    {importFileErr.split("\n").map((line, i) => (
                      <div key={i} style={{ whiteSpace:"pre-wrap" }}>{i === 0 ? `⚠ ${line}` : line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={()=>setShowImport(false)}>Close</Button>
          </AppModalFooter>
        </AppModal>
      )}

      {/* ── Risk Confirm Delete Dialog ─────────────────────────────────────── */}
      {confirmDelRisk && (
        <AppModal
          open={!!confirmDelRisk}
          onOpenChange={(o) => { if (!o) setConfirmDelRisk(null); }}
          title="Delete Risk?"
          description={<><strong className="text-foreground">"{confirmDelRisk.name}"</strong> will be permanently removed from the risk register.</>}
          size="sm"
          alert
        >
          <AppModalFooter>
            <Button variant="outline" onClick={() => setConfirmDelRisk(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRisk} disabled={deletingRisk}>{deletingRisk ? "Deleting…" : "Yes, Delete"}</Button>
          </AppModalFooter>
        </AppModal>
      )}

      {/* ── Bulk Confirm Delete Dialog (MED-F-025) ─────────────────────────── */}
      {confirmDelBulk && (
        <AppModal
          open={!!confirmDelBulk}
          onOpenChange={(o) => { if (!o) setConfirmDelBulk(null); }}
          title={`Delete ${confirmDelBulk.count} risks?`}
          description={<><strong className="text-foreground">{confirmDelBulk.count} selected risks</strong> will be permanently removed from the risk register.</>}
          size="sm"
          alert
        >
          <AppModalFooter>
            <Button variant="outline" onClick={() => setConfirmDelBulk(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmBulkDel} disabled={deletingBulk}>{deletingBulk ? "Deleting…" : `Yes, Delete ${confirmDelBulk.count}`}</Button>
          </AppModalFooter>
        </AppModal>
      )}

      {/* ── Delete error toast (MED-F-026) ──────────────────────────────────── */}
      {delError && (
        <div onClick={()=>setDelError("")} style={{ position:"fixed", bottom:18, right:18, zIndex:10000, background:"#7F1D1D", color:"#fff", padding:"10px 16px", borderRadius:8, fontSize:12, fontWeight:600, boxShadow:"0 6px 24px rgba(0,0,0,0.4)", cursor:"pointer" }}>{delError}</div>
      )}

      {ownerPickR && <OwnerPickerModal open={true} objectType={ownerPickR.type} objectId={ownerPickR.id} objectName={ownerPickR.name} currentOwner={ownerPickR.owner} onClose={()=>setOwnerPickR(null)} onSaved={v=>afterOwnerSaveR(ownerPickR.type,ownerPickR.id,v)} />}
      {riskPickR  && <RiskLevelModal  open={true} objectType={riskPickR.type}  objectId={riskPickR.id}  objectName={riskPickR.name}  currentLevel={riskPickR.level} fieldName={riskPickR.field} onClose={()=>setRiskPickR(null)}  onSaved={v=>afterRiskSaveR(riskPickR.type,riskPickR.id,v,riskPickR.field)} />}
      {evidPickR  && <EvidenceUploadModal open={true} objectType={evidPickR.type} objectId={String(evidPickR.id)} objectName={evidPickR.name} onClose={()=>setEvidPickR(null)} onSaved={()=>setEvidPickR(null)} />}

      {/* ── AI Score Results Modal ──────────────────────────────────────────── */}
      {showScoreResults && scoreResults && (
        <AppModal
          open={showScoreResults && !!scoreResults}
          onOpenChange={(o) => { if (!o) setShowScoreResults(false); }}
          title={`${scoreResults.updated} Risk${scoreResults.updated !== 1 ? "s" : ""} Re-scored`}
          description={`✦ AI vCISO — Risk Scoring Complete · Scored at ${new Date(scoreResults.scoredAt).toLocaleString()} · Source: FAIR model + ISO 27001 / NIST CSF`}
          size="2xl"
        >
          <AppModalBody>
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
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={()=>setShowScoreResults(false)}>Close</Button>
          </AppModalFooter>
        </AppModal>
      )}

      {/* ── Add / Edit Treatment Modal ──────────────────────────────────── */}
      {showTrtModal && (
        <AppModal open={showTrtModal} onOpenChange={o => { if (!o && !trtSaving) setShowTrtModal(false); }}
          title={trtEditTarget ? "Edit Treatment" : "Add Treatment"}
          description={trtEditTarget ? `Editing ${trtEditTarget.treatmentId ?? trtEditTarget.id}` : "Create a new treatment plan linked to a risk"}
          size="lg">
          <AppModalBody>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {trtErr && <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid #FECACA", borderRadius:7, padding:"8px 12px", fontSize:11, color:"#991B1B", fontWeight:600 }}>{trtErr}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Risk ID *</span>
                  <input value={trtForm.riskId} onChange={e => setTrtForm(f => ({ ...f, riskId: e.target.value }))}
                    placeholder="RK-XXXXXX"
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, fontFamily:"'JetBrains Mono',monospace" }} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Treatment Name *</span>
                  <input value={trtForm.name} onChange={e => setTrtForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Patch critical vulnerabilities"
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Type</span>
                  <select value={trtForm.type} onChange={e => setTrtForm(f => ({ ...f, type: e.target.value }))}
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }}>
                    {["Mitigate","Transfer","Accept","Avoid"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Owner</span>
                  <input value={trtForm.owner} onChange={e => setTrtForm(f => ({ ...f, owner: e.target.value }))}
                    placeholder="e.g. Sarah Chen"
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Due Date</span>
                  <input type="date" value={trtForm.dueDate} onChange={e => setTrtForm(f => ({ ...f, dueDate: e.target.value }))}
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }} />
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Priority</span>
                  <select value={trtForm.priority} onChange={e => setTrtForm(f => ({ ...f, priority: e.target.value }))}
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }}>
                    {["Critical","High","Medium","Low"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Status</span>
                  <select value={trtForm.status} onChange={e => setTrtForm(f => ({ ...f, status: e.target.value }))}
                    style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12 }}>
                    {["open","in-progress","completed"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"var(--muted-foreground)" }}>Notes</span>
                <textarea value={trtForm.notes} onChange={e => setTrtForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  placeholder="Optional notes about this treatment…"
                  style={{ padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input)", color:"var(--foreground)", fontSize:12, resize:"vertical", fontFamily:"inherit" }} />
              </label>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setShowTrtModal(false)}>Cancel</Button>
            <Button disabled={trtSaving} onClick={handleSaveTreatment}>
              {trtSaving ? "Saving…" : trtEditTarget ? "Save Changes" : "Add Treatment"}
            </Button>
          </AppModalFooter>
        </AppModal>
      )}

      {/* ── AI Playbook Modal ───────────────────────────────────────────── */}
      {playbookRisk && (
        <AppModal
          open={!!playbookRisk}
          onOpenChange={(o) => { if (!o && !playbookStreaming) { setPlaybookRisk(null); setPlaybookContent(""); } }}
          title={playbookRisk.name}
          description="◆ AI vCISO — Remediation Playbook"
          size="2xl"
        >
          <AppModalBody>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <span style={{ background:"rgba(239,68,68,0.08)", border:"1px solid #FECACA", color:"#991B1B", borderRadius:4, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{playbookRisk.severity}</span>
                <span style={{ background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:4, padding:"1px 8px", fontSize:10, fontWeight:700, color:"var(--muted-foreground)" }}>{playbookRisk.category}</span>
              </div>
              {playbookStreaming && !playbookContent && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"var(--muted-foreground)" }}>
                  <div style={{ fontSize:20, marginBottom:10 }}>◆</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--foreground)" }}>Generating remediation playbook…</div>
                  <div style={{ fontSize:11, marginTop:4 }}>AI is creating step-by-step instructions tailored to this risk</div>
                </div>
              )}
              {playbookContent && (
                <div style={{ fontSize:13, lineHeight:1.8, color:"var(--foreground)", fontFamily:"inherit" }}>
                  {playbookContent.split(/^(#{1,3} .+)$/m).map((part, i) => {
                    if (/^#{1,3} /.test(part)) {
                      const level=(part.match(/^(#{1,3})/)||[])[1]?.length??1;
                      const txt=part.replace(/^#{1,3} /,"");
                      return <div key={i} style={{ fontSize:level===1?15:level===2?13.5:12.5, fontWeight:800, color:"var(--foreground)", marginTop:level===1?0:14, marginBottom:6, paddingBottom:level===1?8:0, borderBottom:level===1?"1px solid var(--border)":"none" }}>{txt}</div>;
                    }
                    return <span key={i} style={{ whiteSpace:"pre-wrap" }}>{part}</span>;
                  })}
                  {playbookStreaming && <span style={{ display:"inline-block", width:8, height:14, background:"var(--foreground)", borderRadius:2, animation:"pulse 1s infinite", verticalAlign:"middle", marginLeft:2 }} />}
                </div>
              )}
          </AppModalBody>
          <AppModalFooter>
            {!playbookStreaming && playbookContent && (
              <Button variant="outline" onClick={()=>{ navigator.clipboard?.writeText(playbookContent); }}>Copy</Button>
            )}
          </AppModalFooter>
        </AppModal>
      )}
    </div>
  );
}

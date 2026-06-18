import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ObjectProfilePage } from "@/components/ObjectProfilePage";
import { useRisks } from "@/hooks/useGrcApi";

const BASE_API = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/grc-platform", "");
const api = (p: string) => `${BASE_API}/api${p}`;

const NAV = "#1E3A5F", EME = "#065F46", AMB = "#D97706", RED = "#DC2626", BLU = "#1D4ED8";
const D = {
  text:"var(--foreground)", muted:"rgb(148,163,184)", dim:"var(--muted-foreground)",
  accent:"rgb(147,197,253)", green:"rgb(52,211,153)", amber:"rgb(251,191,36)",
  red:"rgb(248,113,113)", bg:"var(--secondary)", border:"var(--border)",
};
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background:D.bg, border:`1px solid ${D.border}`, borderRadius:12, padding:"18px 20px", ...extra,
});

function KV({ k, v }: { k:string; v:string|number }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}`, fontSize:12 }}>
      <span style={{ color:D.muted }}>{k}</span>
      <span style={{ color:D.text, fontWeight:600 }}>{v}</span>
    </div>
  );
}

function ProfileNotFound({ label, id, backHref }: { label: string; id: string; backHref: string }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding:"60px 32px", textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:16, opacity:0.5 }}>🔍</div>
      <div style={{ fontSize:20, fontWeight:800, color:"var(--foreground)", marginBottom:10 }}>{label} not found</div>
      <code style={{ fontSize:12, color:D.muted, background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 12px", display:"inline-block", marginBottom:16 }}>{id}</code>
      <div style={{ fontSize:13, color:D.muted, marginBottom:28, maxWidth:380, lineHeight:1.7 }}>
        This record could not be located. It may have been removed, or you may not have permission to view it.
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button
          onClick={() => navigate(backHref)}
          style={{ padding:"10px 24px", borderRadius:8, border:"1px solid rgba(147,197,253,0.35)", background:"rgba(147,197,253,0.08)", color:"rgb(147,197,253)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
        >
          ← Go back
        </button>
        <button
          onClick={() => window.history.back()}
          style={{ padding:"10px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >
          Browser back
        </button>
      </div>
    </div>
  );
}

// ── Treatment plan options ────────────────────────────────────────────────────
interface TreatmentOption { strategy:string; description:string; effort:"Low"|"Medium"|"High"; timeframe:string; selected:boolean; color:string }

function treatmentOptions(severity:string, category:string): TreatmentOption[] {
  const isCritHigh = severity==="Critical"||severity==="High";
  return [
    { strategy:"Mitigate",  description:isCritHigh?`Implement compensating controls to reduce likelihood and impact. Priority remediation required — assign dedicated task force for ${category} controls.`:`Apply standard controls to reduce risk to within acceptable appetite. Review existing ${category} controls for coverage gaps.`, effort:isCritHigh?"High":"Medium", timeframe:isCritHigh?"30 days":"90 days", selected:isCritHigh, color:EME },
    { strategy:"Transfer",  description:`Shift financial exposure via cyber insurance, managed security service, or contractual risk transfer to a qualified third party with relevant expertise in ${category} risk.`, effort:"Medium", timeframe:"60 days", selected:severity==="High"&&category==="Cloud", color:BLU },
    { strategy:"Accept",    description:`Document residual risk with formal acceptance from CISO${severity==="Critical"?" and Board":""}. Record acceptance rationale, expiry date (max 12 months) and compensating controls.`, effort:"Low", timeframe:"Immediate", selected:severity==="Low"||severity==="Medium", color:AMB },
    { strategy:"Avoid",     description:`Eliminate the risk-generating activity or technology. Evaluate whether the business benefit justifies the risk exposure, or whether an alternative approach achieves the same objective.`, effort:"High", timeframe:"Varies", selected:false, color:RED },
  ];
}

// ── Linked controls by risk category ──────────────────────────────────────────
const CATEGORY_CONTROLS: Record<string,{id:string;name:string;status:string;effectiveness:number}[]> = {
  "Access Control": [
    {id:"CTL-001",name:"Multi-Factor Authentication",status:"implemented",effectiveness:88},
    {id:"CTL-002",name:"Privileged Access Management",status:"implemented",effectiveness:82},
    {id:"CTL-006",name:"Access Certification",status:"partial",effectiveness:65},
    {id:"CTL-013",name:"Identity Governance",status:"partial",effectiveness:60},
  ],
  "Cloud Security": [
    {id:"CTL-015",name:"Cloud Security Posture Management",status:"partial",effectiveness:55},
    {id:"CTL-004",name:"Data Encryption at Rest",status:"implemented",effectiveness:90},
    {id:"CTL-011",name:"Network Segmentation",status:"partial",effectiveness:62},
  ],
  "Vulnerability Management": [
    {id:"CTL-003",name:"Vulnerability Scanning",status:"partial",effectiveness:78},
    {id:"CTL-014",name:"Penetration Testing",status:"implemented",effectiveness:85},
    {id:"CTL-007",name:"Endpoint Detection & Response",status:"implemented",effectiveness:88},
  ],
  "Compliance": [
    {id:"CTL-005",name:"SIEM",status:"partial",effectiveness:70},
    {id:"CTL-008",name:"Change Management Controls",status:"implemented",effectiveness:80},
  ],
  "Data Protection": [
    {id:"CTL-004",name:"Data Encryption at Rest",status:"implemented",effectiveness:90},
    {id:"CTL-009",name:"Data Loss Prevention",status:"partial",effectiveness:62},
    {id:"CTL-012",name:"Security Awareness Training",status:"partial",effectiveness:65},
  ],
  "Operational": [
    {id:"CTL-008",name:"Change Management Controls",status:"implemented",effectiveness:80},
    {id:"CTL-010",name:"Backup & Recovery",status:"partial",effectiveness:68},
    {id:"CTL-005",name:"SIEM",status:"partial",effectiveness:70},
  ],
};

// ── Threat vectors by category ────────────────────────────────────────────────
const THREAT_VECTORS: Record<string,{vector:string;likelihood:number;technique:string}[]> = {
  "Access Control":          [{vector:"Credential Theft",likelihood:75,technique:"Phishing / Credential Stuffing"},{vector:"Privilege Escalation",likelihood:55,technique:"Misconfigurations / CVE Exploitation"},{vector:"Insider Threat",likelihood:35,technique:"Excessive Access / Data Exfiltration"}],
  "Cloud Security":          [{vector:"Misconfiguration Exploitation",likelihood:80,technique:"Public Bucket / Open API"},{vector:"IAM Privilege Abuse",likelihood:60,technique:"Over-Permissive Roles"},{vector:"Supply Chain Compromise",likelihood:45,technique:"Malicious Dependency / Build Pipeline"}],
  "Vulnerability Management":[{vector:"Known CVE Exploitation",likelihood:70,technique:"N-day / Zero-day"},{vector:"Unpatched System Attack",likelihood:65,technique:"Automated Scanning / Mass Exploitation"},{vector:"Container Escape",likelihood:40,technique:"Kernel Exploit"}],
  "Compliance":              [{vector:"Regulatory Non-Compliance",likelihood:60,technique:"Process / Control Gap"},{vector:"Audit Failure",likelihood:50,technique:"Missing Evidence / Control Deficiency"},{vector:"Data Breach",likelihood:45,technique:"Technical Control Failure"}],
  "Data Protection":         [{vector:"Data Exfiltration",likelihood:65,technique:"Malware / Insider / Phishing"},{vector:"Unauthorised Access",likelihood:70,technique:"Credential Compromise"},{vector:"Ransomware",likelihood:55,technique:"Phishing / RDP Brute Force"}],
  "Operational":             [{vector:"System Outage",likelihood:50,technique:"Change-induced / Infrastructure Failure"},{vector:"Service Disruption",likelihood:45,technique:"DDoS / Capacity Exhaustion"},{vector:"Data Loss",likelihood:40,technique:"Backup Failure / Ransomware"}],
};

function TreatmentCard({ severity, category }: { severity:string; category:string }) {
  const options = treatmentOptions(severity, category);
  const [selected, setSelected] = useState<string>(options.find(o=>o.selected)?.strategy??"Mitigate");
  const active = options.find(o=>o.strategy===selected)!;
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Risk Treatment Plan</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:14 }}>
        {options.map(o=>(
          <button key={o.strategy} onClick={()=>setSelected(o.strategy)} style={{
            padding:"8px 6px", borderRadius:7, border:`2px solid ${selected===o.strategy?o.color:"var(--border)"}`,
            background:selected===o.strategy?`${o.color}18`:"transparent", color:selected===o.strategy?o.color:D.muted,
            fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textAlign:"center" as const,
          }}>
            {o.strategy==="Mitigate"?"⬇":o.strategy==="Transfer"?"↔":o.strategy==="Accept"?"✓":"✗"} {o.strategy}
          </button>
        ))}
      </div>
      <div style={{ padding:"12px 14px", background:"var(--secondary)", borderRadius:8, border:`1px solid ${active.color}33` }}>
        <div style={{ fontSize:12, color:D.text, lineHeight:1.7, marginBottom:10 }}>{active.description}</div>
        <div style={{ display:"flex", gap:16 }}>
          <div><span style={{ fontSize:10, color:D.muted }}>Effort: </span><span style={{ fontSize:11, color:active.color, fontWeight:700 }}>{active.effort}</span></div>
          <div><span style={{ fontSize:10, color:D.muted }}>Timeframe: </span><span style={{ fontSize:11, color:active.color, fontWeight:700 }}>{active.timeframe}</span></div>
        </div>
      </div>
      <div style={{ marginTop:12, padding:"8px 10px", background:"rgba(30,58,95,0.2)", borderRadius:6, fontSize:11, color:D.muted }}>
        Treatment plan requires CISO sign-off and tracking in the risk register. Review effectiveness quarterly.
      </div>
    </div>
  );
}

function LinkedControlsCard({ category }: { category:string }) {
  const ctls = CATEGORY_CONTROLS[category] ?? CATEGORY_CONTROLS["Operational"];
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Linked Controls</div>
      {ctls.map((c,i)=>{
        const stC = c.status==="implemented"?EME:AMB;
        const effC = c.effectiveness>=80?EME:c.effectiveness>=60?AMB:RED;
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<ctls.length-1?`1px solid ${D.border}`:"none" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:stC, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{c.name}</div>
              <div style={{ fontSize:10, color:D.muted }}>{c.id} · {c.status}</div>
            </div>
            <div style={{ textAlign:"right" as const }}>
              <div style={{ fontSize:11, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:effC }}>{c.effectiveness}%</div>
              <div style={{ fontSize:9, color:D.muted }}>effectiveness</div>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop:10, fontSize:10, color:D.dim }}>
        Overall control coverage: {Math.round(ctls.reduce((s,c)=>s+c.effectiveness,0)/ctls.length)}% average effectiveness
      </div>
    </div>
  );
}

function ThreatVectorsCard({ category }: { category:string }) {
  const vectors = THREAT_VECTORS[category] ?? THREAT_VECTORS["Operational"];
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Threat Vectors</div>
      {vectors.map((v,i)=>{
        const col = v.likelihood>=70?RED:v.likelihood>=50?AMB:EME;
        return (
          <div key={i} style={{ marginBottom:i<vectors.length-1?12:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
              <div>
                <span style={{ color:D.text, fontWeight:600 }}>{v.vector}</span>
                <div style={{ fontSize:10, color:D.muted, marginTop:1 }}>{v.technique}</div>
              </div>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", color:col, fontWeight:800, fontSize:12, whiteSpace:"nowrap" as const, marginLeft:10, paddingTop:2 }}>{v.likelihood}%</span>
            </div>
            <div style={{ height:5, background:"var(--secondary)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${v.likelihood}%`, background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:3 }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── TPRM vendor data ──────────────────────────────────────────────────────────
const tprmVendors = [
  { id:"VND-001",name:"Accenture Cloud",tier:1,category:"Cloud Infrastructure",contact:"j.smith@accenture.com",score:82,status:"approved",lastAssessed:"2024-01-15",nextDue:"2025-01-15",critical:true,description:"Primary cloud infrastructure partner providing managed cloud services, DevOps tooling and 24/7 NOC support." },
  { id:"VND-002",name:"OpenAI",tier:1,category:"AI/ML Services",contact:"vendor@openai.com",score:68,status:"in-review",lastAssessed:"2024-02-20",nextDue:"2024-08-20",critical:true,description:"AI model provider — GPT-4o used for AI vCISO, document analysis and automated compliance gap detection." },
  { id:"VND-003",name:"Salesforce",tier:2,category:"CRM / SaaS",contact:"security@sf.com",score:91,status:"approved",lastAssessed:"2023-11-01",nextDue:"2024-11-01",critical:false,description:"Customer relationship management platform. EU data residency configured, DPA in place." },
  { id:"VND-004",name:"AWS",tier:1,category:"Cloud Infrastructure",contact:"aws-security@amazon.com",score:95,status:"approved",lastAssessed:"2024-03-01",nextDue:"2025-03-01",critical:true,description:"Primary cloud provider for production infrastructure. ISO 27001, SOC 2 Type II, FedRAMP certified." },
  { id:"VND-005",name:"Stripe",tier:2,category:"Payment Processing",contact:"security@stripe.com",score:88,status:"approved",lastAssessed:"2023-09-15",nextDue:"2024-09-15",critical:true,description:"Payment processor. PCI DSS Level 1 certified. Processes all card transactions for the platform." },
  { id:"VND-006",name:"DataBricks",tier:2,category:"Data Analytics",contact:"security@databricks.com",score:74,status:"in-progress",lastAssessed:"—",nextDue:"2024-07-01",critical:false,description:"Data analytics and ML platform. Initial risk assessment in progress — DPA pending signature." },
  { id:"VND-007",name:"Zoom",tier:3,category:"Communication",contact:"security@zoom.us",score:79,status:"approved",lastAssessed:"2023-12-10",nextDue:"2024-12-10",critical:false,description:"Video conferencing platform. No personal data sharing beyond meeting metadata and recordings." },
];

interface DnsRecord {
  status: "found" | "missing" | "error";
  record?: string | null;
  policy?: string;
  rua?: string | null;
  selectors?: { selector: string; record: string }[];
  records?: { exchange: string; priority: number }[];
}
interface DnsResult {
  domain: string;
  checkedAt: string;
  spf: DnsRecord;
  dmarc: DnsRecord;
  dkim: DnsRecord;
  mx: DnsRecord;
  bimi: DnsRecord;
  mtaSts: DnsRecord;
  tlsRpt: DnsRecord;
}

function dnsScore(d: DnsResult): number {
  let s = 0;
  if (d.spf?.status === "found") s += 20;
  if (d.dmarc?.status === "found") {
    s += 20;
    const p = d.dmarc.policy ?? "none";
    if (p === "reject") s += 15;
    else if (p === "quarantine") s += 8;
  }
  if (d.dkim?.status === "found") s += 20;
  if (d.mx?.status === "found") s += 10;
  if (d.bimi?.status === "found") s += 5;
  if (d.mtaSts?.status === "found") s += 5;
  if (d.tlsRpt?.status === "found") s += 5;
  return Math.min(100, s);
}

function StatusPill({ status, label }: { status: "found"|"missing"|"error"|"warn"; label?: string }) {
  const cfg = {
    found:   { bg:"rgba(52,211,153,0.12)", color:"#34D399", border:"rgba(52,211,153,0.3)",  icon:"✓", text: label ?? "PASS" },
    warn:    { bg:"rgba(251,191,36,0.12)",  color:"#FCD34D", border:"rgba(251,191,36,0.3)",  icon:"⚠", text: label ?? "WARN" },
    missing: { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.3)", icon:"✗", text: label ?? "MISSING" },
    error:   { bg:"rgba(248,113,113,0.12)", color:"#F87171", border:"rgba(248,113,113,0.3)", icon:"✗", text: label ?? "ERROR" },
  }[status];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:4, border:`1px solid ${cfg.border}`, background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", whiteSpace:"nowrap" as const }}>
      {cfg.icon} {cfg.text}
    </span>
  );
}

export default function RiskProfile() {
  const [location] = useLocation();
  const { data: apiRisks, isLoading: apiLoading } = useRisks();
  const [dnsData, setDnsData] = useState<DnsResult | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);

  // API vendor fallback (for vendors not in static list)
  const [apiVendor, setApiVendor]           = useState<any | null>(null);
  const [apiVendorLoading, setApiVendorLoading] = useState(false);

  // Questionnaire assignment state
  const [vendorQuestionnaires, setVendorQuestionnaires] = useState<any[]>([]);
  const [allQuestionnaires, setAllQuestionnaires] = useState<any[]>([]);
  const [assignModal, setAssignModal] = useState(false);
  const [assigningQId, setAssigningQId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const riskMatch    = location.match(/^\/riskops\/risks\/(.+)$/);
  const vendorMatch  = location.match(/^\/riskops\/vendors\/(.+)$/);
  const vulnMatch    = location.match(/^\/riskops\/vulnerabilities\/(.+)$/);
  const requestMatch = location.match(/^\/servicedesk\/requests\/(.+)$/);

  useEffect(() => {
    if (!vendorMatch) return;
    const vendorId = vendorMatch[1]!;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
    setDnsData(null); setDnsError(null); setDnsLoading(true);
    fetch(`/api/risks/vendors/${vendorId}/dns`, { headers: H })
      .then(r => r.json())
      .then(d => { if (d && d.domain) setDnsData(d as DnsResult); else setDnsError("DNS lookup failed"); })
      .catch(() => setDnsError("DNS lookup unavailable"))
      .finally(() => setDnsLoading(false));
  }, [location]);

  // Fetch vendor from API when not found in static list
  useEffect(() => {
    if (!vendorMatch) return;
    const id = vendorMatch[1]!;
    if (tprmVendors.find(v => v.id === id)) { setApiVendor(null); return; }
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
    setApiVendor(null); setApiVendorLoading(true);
    fetch(api("/risks/vendors"), { headers: H })
      .then(r => r.json())
      .then((d: any[]) => {
        if (!Array.isArray(d)) return;
        const found = d.find(v => (v.vendorId ?? String(v.id)) === id);
        if (found) setApiVendor({
          id:           found.vendorId ?? String(found.id),
          name:         found.name ?? found.vendorName ?? id,
          tier:         Number(found.tier) || 2,
          category:     found.category ?? found.vendorCategory ?? "Technology",
          contact:      found.contactEmail ?? found.contact ?? "—",
          score:        Number(found.riskScore ?? found.score) || 70,
          status:       found.status ?? "approved",
          lastAssessed: (found.lastAssessedAt ?? found.lastAssessed ?? "—").slice(0,10),
          nextDue:      (found.nextDueAt ?? found.nextDue ?? "—").slice(0,10),
          critical:     Boolean(found.isCritical ?? found.critical),
          description:  found.description ?? `${found.name ?? id} is a vendor under active management.`,
        });
      })
      .catch(() => {})
      .finally(() => setApiVendorLoading(false));
  }, [location]);

  // Fetch questionnaires assigned to this vendor
  useEffect(() => {
    if (!vendorMatch) return;
    const vendorId = vendorMatch[1]!;
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(api("/questionnaires"), { headers: H })
      .then(r => r.json())
      .then((qs: any[]) => {
        const list = Array.isArray(qs) ? qs : [];
        setAllQuestionnaires(list);
        setVendorQuestionnaires(list.filter(q => q.recipient === vendorId));
      })
      .catch(() => {});
  }, [location]);

  async function assignQuestionnaire(qId: string, vendorId: string) {
    setAssigning(true);
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    await fetch(api(`/questionnaires/${qId}`), {
      method: "PATCH", headers: H,
      body: JSON.stringify({ recipient: vendorId }),
    });
    const qs: any[] = await fetch(api("/questionnaires"), { headers: H }).then(r => r.json()).catch(() => []);
    const list = Array.isArray(qs) ? qs : [];
    setAllQuestionnaires(list);
    setVendorQuestionnaires(list.filter(q => q.recipient === vendorId));
    setAssigning(false);
    setAssignModal(false);
    setAssigningQId(null);
  }

  async function unassignQuestionnaire(qId: string) {
    const token = localStorage.getItem("grc_token");
    const H: Record<string,string> = { "Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {}) };
    await fetch(api(`/questionnaires/${qId}`), {
      method: "PATCH", headers: H,
      body: JSON.stringify({ recipient: "" }),
    });
    setVendorQuestionnaires(prev => prev.filter(q => q.id !== qId));
  }


  if (riskMatch) {
    const id = riskMatch[1]!;
    const apiRaw = (apiRisks ?? []).find((r:any) => (r.riskId ?? String(r.id)) === id);
    const risk = apiRaw ? {
      id:          apiRaw.riskId ?? String(apiRaw.id),
      name:        apiRaw.name,
      severity:    apiRaw.severity  ?? "Medium",
      score:       Number(apiRaw.score) ?? 10,
      status:      apiRaw.status    ?? "open",
      category:    apiRaw.category  ?? "Security",
      ownerFull:   apiRaw.ownerFull ?? apiRaw.owner ?? "Security Team",
      trend:       apiRaw.trend     ?? "stable",
      updated:     apiRaw.updatedAt ?? "",
      created:     apiRaw.createdAt ?? "",
      description: apiRaw.description ?? "",
    } : null;
    if (!risk) {
      if (apiLoading) return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:12 }}>
          <div style={{ fontSize:14, color:D.muted }}>Loading risk {id}…</div>
        </div>
      );
      return <ProfileNotFound label="Risk" id={id} backHref="/riskops" />;
    }
    const sevColor = risk.severity==="Critical"?RED:risk.severity==="High"?AMB:BLU;
    const statusOk = risk.status==="accepted"||risk.status==="closed";
    const inherentScore = Math.round(risk.score*5);
    const residualScore = Math.max(10, inherentScore-20);

    const aiInsights = [
      `📊 Risk Summary: ${risk.name} — ${risk.severity} (score ${risk.score}/25). Category: ${risk.category}. Status: ${risk.status.toUpperCase()}. Owner: ${risk.ownerFull}.`,
      `📈 Trend: ${risk.trend==="up"?"⬆ Worsening — treatment escalation required":risk.trend==="down"?"⬇ Improving — current controls effective, maintain cadence":"— Stable — maintain monitoring frequency"}. Last updated: ${risk.updated}.`,
      `🛡️ Control Effectiveness: Linked controls provide estimated ${Math.round(((inherentScore-residualScore)/inherentScore)*100)}% risk reduction. Review ${CATEGORY_CONTROLS[risk.category]?.[0]?.name??"primary controls"} for coverage gaps.`,
      risk.status==="open"?`🔴 Action Required: Risk is open with no accepted treatment. Assign treatment plan within 5 business days per risk management policy.`:`✅ Treatment status: ${risk.status} — continue monitoring residual risk against appetite.`,
      `📋 Recommendation: ${risk.severity==="Critical"?`Immediate escalation to CISO and Board. Emergency treatment plan required.`:risk.severity==="High"?`Assign dedicated owner and weekly tracking cadence. Review compensating controls.`:`Monthly review cycle appropriate. Ensure treatment plan milestones are on track.`}`,
    ];

    return (
      <ObjectProfilePage
        hero={{ id:risk.id, name:risk.name, type:risk.category, owner:risk.ownerFull, status:risk.status, statusOk, modified:risk.updated, extra:[{label:"Severity",value:risk.severity},{label:"Score",value:String(risk.score)},{label:"Trend",value:risk.trend==="up"?"⬆ Rising":risk.trend==="down"?"⬇ Falling":"— Stable"}] }}
        breadcrumbs={[{label:"RiskOps",href:"/riskops"},{label:"Risk Register",href:"/riskops"},{label:risk.id}]}
        onBack="/riskops"
        aiObjectType="risk" aiObjectId={risk.id} aiFallback={aiInsights}
        riskSection={{ inherent:inherentScore, residual:residualScore, impact:sevColor===RED?90:sevColor===AMB?70:50, trend:risk.trend as "flat"|"up"|"down"|undefined }}
        description={risk.description}
        timeline={[
          {actor:risk.ownerFull,action:`Risk created in register`,ts:risk.created},
          {actor:risk.ownerFull,action:`Risk updated — status: ${risk.status}`,ts:risk.updated},
        ]}
      >
        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Risk Details</div>
          <KV k="Risk ID" v={risk.id}/>
          <KV k="Severity" v={risk.severity}/>
          <KV k="Risk Score" v={`${risk.score}/25`}/>
          <KV k="Category" v={risk.category}/>
          <KV k="Status" v={risk.status.toUpperCase()}/>
          <KV k="Owner" v={risk.ownerFull}/>
          <KV k="Trend" v={risk.trend==="up"?"⬆ Worsening":risk.trend==="down"?"⬇ Improving":"— Stable"}/>
          <KV k="Created" v={risk.created}/>
          <KV k="Last Updated" v={risk.updated}/>
          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <div style={{ flex:1, padding:"10px", background:"var(--secondary)", borderRadius:6, border:`1px solid ${D.border}`, textAlign:"center" as const }}>
              <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:inherentScore>=80?RED:inherentScore>=60?AMB:D.accent }}>{inherentScore}</div>
              <div style={{ fontSize:10, color:D.muted, marginTop:2 }}>Inherent Risk</div>
            </div>
            <div style={{ flex:1, padding:"10px", background:"var(--secondary)", borderRadius:6, border:`1px solid ${D.border}`, textAlign:"center" as const }}>
              <div style={{ fontSize:20, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:residualScore>=60?AMB:D.green }}>{residualScore}</div>
              <div style={{ fontSize:10, color:D.muted, marginTop:2 }}>Residual Risk</div>
            </div>
          </div>
        </div>
        <TreatmentCard severity={risk.severity} category={risk.category}/>
        <ThreatVectorsCard category={risk.category}/>
        <LinkedControlsCard category={risk.category}/>
      </ObjectProfilePage>
    );
  }

  if (vendorMatch) {
    const id = vendorMatch[1]!;
    const vendor = tprmVendors.find(v=>v.id===id) ?? apiVendor;
    if (!vendor) {
      if (apiVendorLoading) return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:12 }}>
          <div style={{ fontSize:28, animation:"spin 1.5s linear infinite" }}>⚙️</div>
          <div style={{ fontSize:14, color:D.muted }}>Loading vendor {id}…</div>
        </div>
      );
      return <ProfileNotFound label="Vendor" id={id} backHref="/riskops" />;
    }
    const scoreColor = vendor.score>=80?EME:vendor.score>=60?AMB:RED;
    const inherent = Math.round((100-vendor.score)*0.8);

    const aiInsights = [
      `📊 Vendor Summary: ${vendor.name} (${vendor.id}) — Tier ${vendor.tier}, ${vendor.category}. Risk Score: ${vendor.score}/100. Status: ${vendor.status.toUpperCase()}.`,
      `${vendor.score>=80?"✅ Low risk — vendor demonstrates strong security controls. Maintain annual assessment cadence.":vendor.score>=60?"⚠️ Medium risk — monitor vendor security posture. Quarterly check-ins recommended.":"🔴 High risk — immediate security review required. Consider contingency plan."}`,
      `📅 Last assessed: ${vendor.lastAssessed}. Next due: ${vendor.nextDue}.`,
      vendor.critical?`🔴 Critical vendor — SLA verification, DPA review and business continuity assessment required at each annual review.`:`ℹ️ Non-critical vendor — standard annual assessment cadence appropriate. No DPA required unless data sharing is introduced.`,
      `📋 AI Recommendation: ${vendor.score>=80?`Maintain existing assessment frequency. Consider elevating to preferred vendor status if score exceeds 90.`:`Enhance monitoring frequency and request updated security evidence. Evaluate alternative vendors as contingency.`}`,
    ];

    return (
      <ObjectProfilePage
        hero={{ id:vendor.id, name:vendor.name, type:vendor.category, owner:"Vendor Manager", status:vendor.status, statusOk:vendor.status==="approved", extra:[{label:"Tier",value:String(vendor.tier)},{label:"Score",value:String(vendor.score)},{label:"Critical",value:vendor.critical?"Yes":"No"}] }}
        breadcrumbs={[{label:"RiskOps",href:"/riskops"},{label:"TPRM",href:"/riskops"},{label:vendor.id}]}
        onBack="/riskops"
        aiObjectType="vendor" aiObjectId={vendor.id} aiFallback={aiInsights}
        riskSection={{ inherent, residual:Math.max(5,inherent-15) }}
        description={vendor.description}
        timeline={[
          {actor:"Vendor Manager",action:`Risk assessment completed`,ts:vendor.lastAssessed},
          {actor:"System",action:`Next assessment due`,ts:vendor.nextDue},
        ]}
      >
        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Vendor Details</div>
          <KV k="Vendor ID" v={vendor.id}/>
          <KV k="Tier" v={`Tier ${vendor.tier}`}/>
          <KV k="Category" v={vendor.category}/>
          <KV k="Contact" v={vendor.contact}/>
          <KV k="Status" v={vendor.status.toUpperCase()}/>
          <KV k="Last Assessed" v={vendor.lastAssessed}/>
          <KV k="Next Due" v={vendor.nextDue}/>
          <KV k="Critical Vendor" v={vendor.critical?"Yes":"No"}/>
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, color:D.muted, marginBottom:6, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Risk Score</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, height:9, background:"var(--secondary)", borderRadius:5, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${vendor.score}%`, background:`linear-gradient(90deg,${scoreColor}88,${scoreColor})`, borderRadius:5 }}/>
              </div>
              <span style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:scoreColor, minWidth:32 }}>{vendor.score}</span>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:12, fontSize:10, color:D.muted }}>
              <span style={{ color:EME }}>● ≥80 Low</span>
              <span style={{ color:AMB }}>● 60-79 Medium</span>
              <span style={{ color:RED }}>● &lt;60 High</span>
            </div>
          </div>
        </div>
        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Assessment Requirements</div>
          {[
            { label:"Security Questionnaire (SIG)", required:true, complete:vendor.score>=70, note:vendor.tier===1?"Full SIG required":"SIG Lite" },
            { label:"SOC 2 / ISO 27001 Certificate", required:vendor.critical, complete:vendor.score>=80, note:"Valid within 12 months" },
            { label:"Data Processing Agreement", required:vendor.critical, complete:vendor.status==="approved", note:"GDPR Art. 28 obligation" },
            { label:"Business Continuity Evidence", required:vendor.tier===1, complete:vendor.tier===1&&vendor.score>=75, note:"Recovery capability" },
            { label:"Penetration Test Summary", required:vendor.tier<=2, complete:vendor.score>=80, note:"Annual external test" },
          ].map((req,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:i<4?`1px solid ${D.border}`:"none" }}>
              <span style={{ fontSize:14, color:req.complete?D.green:req.required?D.red:D.muted }}>{req.complete?"✓":req.required?"✗":"○"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{req.label}</div>
                <div style={{ fontSize:10, color:D.muted }}>{req.note}{!req.required?" — Optional":""}</div>
              </div>
              {req.required && <span style={{ fontSize:10, color:req.complete?D.green:D.red, fontWeight:700 }}>{req.complete?"✓ Met":"Required"}</span>}
            </div>
          ))}
        </div>

        {/* ── Questionnaire Assignment Card ────────────────────────────── */}
        <div style={card()}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent }}>📋 Assigned Questionnaires</div>
            <button
              onClick={() => setAssignModal(true)}
              style={{ background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, color:D.accent, cursor:"pointer", fontFamily:"inherit" }}
            >
              + Assign
            </button>
          </div>
          {vendorQuestionnaires.length === 0 ? (
            <div style={{ fontSize:11, color:D.muted, padding:"10px 0" }}>No questionnaires assigned. Click "+ Assign" to send one to this vendor.</div>
          ) : vendorQuestionnaires.map((q:any) => {
            const sc = q.status==="completed"?EME:q.status==="in-progress"?BLU:AMB;
            return (
              <div key={q.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${D.border}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:D.text }}>{q.name}</div>
                  <div style={{ fontSize:10, color:D.muted, marginTop:2 }}>{q.type} · Due {q.dueDate}</div>
                  <div style={{ marginTop:5, height:4, background:"var(--secondary)", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${q.progress??0}%`, background:sc, borderRadius:2 }}/>
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"flex-end", gap:4 }}>
                  <span style={{ background:`${sc}18`, color:sc, border:`1px solid ${sc}33`, borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700 }}>{q.status?.toUpperCase()}</span>
                  <span style={{ fontSize:10, color:D.muted }}>{q.progress??0}%</span>
                </div>
                <button onClick={()=>unassignQuestionnaire(q.id)} title="Unassign" style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:5, width:22, height:22, cursor:"pointer", fontSize:10, color:D.red, fontFamily:"inherit", padding:0, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* ── Assign Questionnaire Modal ───────────────────────────────── */}
        {assignModal && (
          <div style={{ position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setAssignModal(false)}>
            <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:14, padding:"22px 24px", width:460, maxHeight:"70vh", overflow:"auto" }} onClick={e=>e.stopPropagation()}>
              <div style={{ fontSize:14, fontWeight:700, color:D.accent, marginBottom:16 }}>Assign Questionnaire to {vendor.name}</div>
              {allQuestionnaires.filter((q:any)=>q.recipient!==vendor.id).length===0 ? (
                <div style={{ fontSize:12, color:D.muted }}>No unassigned questionnaires available. Create one in the TPRM → Questionnaires tab.</div>
              ) : allQuestionnaires.filter((q:any)=>q.recipient!==vendor.id).map((q:any) => (
                <div key={q.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${D.border}`, cursor:"pointer" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="rgba(147,197,253,0.04)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                  onClick={()=>{ setAssigningQId(q.id); assignQuestionnaire(q.id, vendor.id); }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:D.text }}>{q.name}</div>
                    <div style={{ fontSize:10, color:D.muted }}>{q.type} · {q.questionCount} questions · Due {q.dueDate}</div>
                  </div>
                  {assigningQId===q.id && assigning ? (
                    <span style={{ fontSize:10, color:D.muted }}>Assigning…</span>
                  ) : (
                    <button style={{ background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:5, padding:"4px 10px", fontSize:11, fontWeight:700, color:D.accent, cursor:"pointer", fontFamily:"inherit" }}>Assign</button>
                  )}
                </div>
              ))}
              <button onClick={()=>setAssignModal(false)} style={{ marginTop:14, width:"100%", background:"var(--secondary)", border:"1px solid var(--border)", borderRadius:7, padding:"8px 0", fontSize:12, color:D.muted, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Email Security / DNS Card ─────────────────────────────────── */}
        <div style={card()}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:14 }}>✉</span>
              <div style={{ fontSize:12, fontWeight:700, color:D.accent }}>Email Security (DNS)</div>
            </div>
            {dnsData && !dnsLoading && (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {(() => {
                  const sc = dnsScore(dnsData);
                  const col = sc>=80?EME:sc>=50?AMB:RED;
                  return (
                    <>
                      <div style={{ fontSize:10, color:D.muted }}>Posture Score</div>
                      <span style={{ fontSize:18, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:col }}>{sc}</span>
                      <span style={{ fontSize:10, color:D.muted }}>/100</span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {dnsLoading && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"16px 0", color:D.muted, fontSize:12 }}>
              <span style={{ animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</span>
              Querying live DNS records for <span style={{ fontFamily:"'JetBrains Mono',monospace", color:D.accent }}>{vendor.contact.split("@")[1]}</span>…
            </div>
          )}

          {dnsError && !dnsLoading && (
            <div style={{ padding:"12px 14px", background:"rgba(248,113,113,0.06)", borderRadius:8, border:"1px solid rgba(248,113,113,0.2)", fontSize:11, color:D.red }}>{dnsError}</div>
          )}

          {dnsData && !dnsLoading && (() => {
            const domain = dnsData.domain;
            const dmarcPolicy = dnsData.dmarc?.policy ?? "none";
            const dmarcStatus = dnsData.dmarc?.status === "found"
              ? (dmarcPolicy === "reject" ? "found" : dmarcPolicy === "quarantine" ? "warn" : "warn")
              : "missing";

            const rows: { key: string; label: string; desc: string; node: React.ReactNode; detail?: string; extra?: React.ReactNode }[] = [
              {
                key:"spf", label:"SPF", desc:"Sender Policy Framework — authorises sending mail servers",
                node: <StatusPill status={dnsData.spf?.status === "found" ? "found" : "missing"} />,
                detail: dnsData.spf?.record ? String(dnsData.spf.record) : undefined,
              },
              {
                key:"dmarc", label:"DMARC", desc:`Domain-based Message Auth — policy: ${dmarcPolicy.toUpperCase()}`,
                node: (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <StatusPill status={dmarcStatus as "found"|"warn"|"missing"} label={dnsData.dmarc?.status==="found"?`p=${dmarcPolicy}`:"MISSING"} />
                    {dnsData.dmarc?.rua && <span style={{ fontSize:10, color:D.muted }}>RUA: {String(dnsData.dmarc.rua).slice(0,40)}</span>}
                  </div>
                ),
                detail: dnsData.dmarc?.record ? String(dnsData.dmarc.record) : undefined,
              },
              {
                key:"dkim", label:"DKIM", desc:"DomainKeys Identified Mail — cryptographic signature",
                node: (
                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
                    <StatusPill status={dnsData.dkim?.status === "found" ? "found" : "missing"} />
                    {dnsData.dkim?.selectors && dnsData.dkim.selectors.length > 0 && (
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" as const }}>
                        {dnsData.dkim.selectors.map(s => (
                          <span key={s.selector} style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", background:"rgba(147,197,253,0.1)", color:D.accent, border:"1px solid rgba(147,197,253,0.2)", borderRadius:3, padding:"1px 5px" }}>{s.selector}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key:"mx", label:"MX Records", desc:"Mail exchanger — incoming mail routing",
                node: <StatusPill status={dnsData.mx?.status === "found" ? "found" : "missing"} label={dnsData.mx?.records?.length ? `${dnsData.mx.records.length} record${dnsData.mx.records.length>1?"s":""}` : "MISSING"} />,
                extra: dnsData.mx?.records && dnsData.mx.records.length > 0 ? (
                  <div style={{ marginTop:6, display:"flex", flexDirection:"column" as const, gap:3 }}>
                    {dnsData.mx.records.map((r,i) => (
                      <div key={i} style={{ display:"flex", gap:8, fontSize:10, fontFamily:"'JetBrains Mono',monospace" }}>
                        <span style={{ color:D.muted, minWidth:28, textAlign:"right" as const }}>{r.priority}</span>
                        <span style={{ color:D.text }}>{r.exchange}</span>
                      </div>
                    ))}
                  </div>
                ) : undefined,
              },
              {
                key:"bimi", label:"BIMI", desc:"Brand Indicators for Message Identification — logo in inbox",
                node: <StatusPill status={dnsData.bimi?.status === "found" ? "found" : "missing"} label={dnsData.bimi?.status==="found"?"ENABLED":"NOT SET"} />,
              },
              {
                key:"mtaSts", label:"MTA-STS", desc:"Mail Transfer Agent Strict Transport Security",
                node: <StatusPill status={dnsData.mtaSts?.status === "found" ? "found" : "missing"} label={dnsData.mtaSts?.status==="found"?"ENABLED":"NOT SET"} />,
              },
              {
                key:"tlsRpt", label:"TLS-RPT", desc:"SMTP TLS Reporting — transport layer failure reports",
                node: <StatusPill status={dnsData.tlsRpt?.status === "found" ? "found" : "missing"} label={dnsData.tlsRpt?.status==="found"?"ENABLED":"NOT SET"} />,
              },
            ];

            return (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12, padding:"6px 10px", background:"rgba(147,197,253,0.06)", borderRadius:6, border:"1px solid rgba(147,197,253,0.15)" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.accent }}>🌐 {domain}</span>
                  <span style={{ fontSize:10, color:D.muted }}>— live lookup · {new Date(dnsData.checkedAt).toLocaleTimeString()}</span>
                </div>
                {rows.map((row, i) => (
                  <div key={row.key} style={{ padding:"10px 0", borderBottom: i < rows.length-1 ? `1px solid ${D.border}` : "none" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:D.text, fontFamily:"'JetBrains Mono',monospace" }}>{row.label}</span>
                          <span style={{ fontSize:10, color:D.muted }}>{row.desc}</span>
                        </div>
                        {row.detail && (
                          <div style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", color:"rgba(148,163,184,0.7)", background:"rgba(0,0,0,0.2)", borderRadius:4, padding:"4px 8px", marginTop:4, overflowX:"auto" as const, whiteSpace:"pre-wrap" as const, wordBreak:"break-all" as const, maxHeight:54, overflow:"hidden" }}>
                            {String(row.detail).length > 200 ? String(row.detail).slice(0,200) + "…" : String(row.detail)}
                          </div>
                        )}
                        {row.extra}
                      </div>
                      <div style={{ flexShrink:0 }}>{row.node}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:12, padding:"8px 12px", background: dnsScore(dnsData)>=80?"rgba(52,211,153,0.06)":dnsScore(dnsData)>=50?"rgba(252,211,77,0.06)":"rgba(248,113,113,0.06)", borderRadius:6, border:`1px solid ${dnsScore(dnsData)>=80?"rgba(52,211,153,0.2)":dnsScore(dnsData)>=50?"rgba(252,211,77,0.2)":"rgba(248,113,113,0.2)"}`, fontSize:11, color:D.muted, lineHeight:1.5 }}>
                  {dnsScore(dnsData)>=80 ? "✅ Strong email security posture — SPF, DMARC and DKIM are all configured. Vendor demonstrates good email authentication hygiene." :
                   dnsScore(dnsData)>=50 ? "⚠️ Partial email security — some controls are missing or DMARC policy is not enforced. Request vendor remediation before next assessment." :
                   "🔴 Weak email security posture — critical email authentication records are missing. Vendor domain is vulnerable to spoofing and phishing. Escalate as a TPRM risk."}
                </div>
              </>
            );
          })()}
        </div>
      </ObjectProfilePage>
    );
  }

  if (vulnMatch) {
    const id = vulnMatch[1]!;
    return (
      <ObjectProfilePage
        hero={{ id, name:`Vulnerability ${id}`, type:"Vulnerability", owner:"Security Team", status:"open", statusOk:false }}
        breadcrumbs={[{label:"RiskOps",href:"/riskops"},{label:"Vulnerabilities"},{label:id}]}
        onBack="/riskops"
        aiObjectType="vulnerability" aiObjectId={id}
        riskSection={{ inherent:70 }}
        description="Vulnerability profile with CVSS scoring, asset impact analysis, exploitation context and remediation guidance."
      >
        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:10 }}>Vulnerability Data</div>
          <div style={{ fontSize:11, color:D.muted, lineHeight:1.7 }}>Full CVSS scoring, affected assets, exploit availability and patch guidance load from the CAASM/CSPM modules when connected to live data feeds (Tenable, Qualys, or Wiz).</div>
        </div>
      </ObjectProfilePage>
    );
  }

  if (requestMatch) {
    const id = requestMatch[1]!;
    return (
      <ObjectProfilePage
        hero={{ id, name:`Service Request ${id}`, type:"Service Request", owner:"Service Desk", status:"open", statusOk:false }}
        breadcrumbs={[{label:"Service Desk",href:"/service-desk"},{label:"Requests",href:"/service-desk"},{label:id}]}
        onBack="/service-desk"
        aiObjectType="servicerequest" aiObjectId={id}
        riskSection={{ inherent:30 }}
        description="Service request detail — tracks request lifecycle, approvals, fulfilment, and linked GRC objects."
      >
        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:10 }}>Request Details</div>
          <KV k="Request ID" v={id}/>
          <KV k="Module" v="Service Desk"/>
          <KV k="Status" v="Open"/>
          <div style={{ marginTop:12, fontSize:11, color:D.muted, lineHeight:1.7 }}>Full request history, approvals and linked GRC objects load when connected to live service desk data.</div>
        </div>
      </ObjectProfilePage>
    );
  }

  return <div style={{ padding:32, color:D.muted }}>Not found.</div>;
}

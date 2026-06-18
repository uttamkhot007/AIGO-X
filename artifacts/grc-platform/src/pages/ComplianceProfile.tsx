import { useState } from "react";
import { useLocation } from "wouter";
import { ObjectProfilePage } from "@/components/ObjectProfilePage";
import { allFrameworks } from "@/lib/grc-data";

const NAV = "#1E3A5F", EME = "#065F46", AMB = "#D97706", BLU = "#1D4ED8", RED = "#DC2626";
const D = {
  text:"var(--foreground)", muted:"rgb(148,163,184)", dim:"var(--muted-foreground)",
  accent:"rgb(147,197,253)", green:"rgb(52,211,153)", amber:"rgb(251,191,36)",
  red:"rgb(248,113,113)", bg:"var(--secondary)", border:"var(--border)",
};
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background:D.bg, border:`1px solid ${D.border}`, borderRadius:12, padding:"18px 20px", ...extra,
});

// ── Controls data ─────────────────────────────────────────────────────────────
interface Control {
  id:string; name:string; ccf:string; frameworks:string[];
  status:"implemented"|"partial"|"planned"|"not-started";
  owner:string; evidence:number; risk:"Low"|"Medium"|"High"|"Critical";
  description:string; category:string;
  aiInsights:string[];
}

const controls: Control[] = [
  { id:"CTL-001",name:"Multi-Factor Authentication",ccf:"CCF-IAM-01",frameworks:["ISO 27001 A.9.4","SOC 2 CC6.1","NIST AC-7","CIS 6.3"],status:"implemented",owner:"Alex Kim",evidence:6,risk:"Low",category:"IAM",description:"Enforce MFA for all user and privileged accounts across all authentication pathways including SSO, VPN, and direct application logins.",aiInsights:["22 privileged accounts without MFA detected — immediate enrolment required.","Self-service MFA enrolment rate: 82% — automated push notifications would close the gap.","AI: Biometric fallback option would reduce support tickets by estimated 35%."] },
  { id:"CTL-002",name:"Privileged Access Management",ccf:"CCF-IAM-02",frameworks:["ISO 27001 A.9.2","SOC 2 CC6.3","CIS 5.4","NIST AC-6"],status:"implemented",owner:"Alex Kim",evidence:4,risk:"Low",category:"IAM",description:"Control and monitor all privileged access through a PAM solution with session recording, JIT provisioning and credential vaulting.",aiInsights:["JIT access adoption: 45% — 55% of privileged access still uses standing/persistent access.","PAM session recording: 84% coverage — 3 legacy systems excluded.","AI: Automated privilege escalation analysis would identify 90% of standing access that can be converted to JIT."] },
  { id:"CTL-003",name:"Vulnerability Scanning",ccf:"CCF-VM-01",frameworks:["ISO 27001 A.12.6","SOC 2 CC7.1","NIST RA-5","CIS 7.1"],status:"partial",owner:"Sarah Chen",evidence:2,risk:"Medium",category:"Security",description:"Continuous vulnerability scanning across all network and cloud assets with risk-based prioritisation and SLA-bound remediation tracking.",aiInsights:["Scan coverage: 94% — 6% blind spots in OT/ICS network segments.","3 Critical CVEs breached 15-day SLA: CVE-2024-1086, CVE-2023-44487, CVE-2024-21762.","AI: Runtime SBOM integration would surface 23 additional transitive dependency CVEs not currently detected."] },
  { id:"CTL-004",name:"Data Encryption at Rest",ccf:"CCF-DATA-01",frameworks:["ISO 27001 A.10.1","PCI DSS 3.4","HIPAA §164.312","GDPR Art.32"],status:"implemented",owner:"Emma Wilson",evidence:8,risk:"Low",category:"Data",description:"AES-256 encryption at rest for all Confidential and Restricted data stores including databases, file storage and backup media.",aiInsights:["5% of backup data remains unencrypted — pre-2022 archive media requires remediation.","Key rotation: last completed 18 months ago; policy mandates annual — overdue.","AI: Automated key rotation scheduling would eliminate manual calendar-based tracking."] },
  { id:"CTL-005",name:"Security Information & Event Management",ccf:"CCF-MON-01",frameworks:["ISO 27001 A.12.4","SOC 2 CC7.2","NIST SI-4","PCI DSS 10.5"],status:"partial",owner:"Sarah Chen",evidence:3,risk:"Medium",category:"Security",description:"Centralised SIEM collecting logs from all critical assets with correlation rules, alert triage and threat detection use cases.",aiInsights:["340 unreviewed medium-severity alerts older than 7 days — analyst capacity constraint.","Log retention: 73% of systems configured for 12 months; 27% below policy minimum.","AI: ML-based alert triage would auto-close 42% of false positives, reducing analyst workload significantly."] },
  { id:"CTL-006",name:"Access Certification",ccf:"CCF-IAM-03",frameworks:["ISO 27001 A.9.2","SOC 2 CC6.2","NIST AC-2","CIS 6.2"],status:"partial",owner:"Marcus Johnson",evidence:2,risk:"Medium",category:"IAM",description:"Quarterly access certification campaigns covering all user and service accounts, with automated revocation processing.",aiInsights:["Access certification completion: 78% — 22% of accounts not certified in current campaign.","43 orphaned accounts active after employee departure (>30 days post-offboarding).","AI: Risk-based certification focusing on 15% highest-risk accounts would reduce effort by 60%."] },
  { id:"CTL-007",name:"Endpoint Detection & Response",ccf:"CCF-EP-01",frameworks:["ISO 27001 A.12.2","SOC 2 CC6.8","CIS 10.1","NIST SI-3"],status:"implemented",owner:"Alex Kim",evidence:5,risk:"Low",category:"Security",description:"EDR agent deployed on all endpoints providing real-time threat detection, behavioural analysis and automated response.",aiInsights:["EDR coverage: 91% — 9% without agent (primarily IoT and legacy systems).","Full-disk encryption: 88% compliance — 12% unencrypted endpoints.","AI: USB control policy enforcement gap: 22% of devices allow unrestricted USB use."] },
  { id:"CTL-008",name:"Change Management Controls",ccf:"CCF-ITSM-01",frameworks:["ISO 27001 A.12.1","SOC 2 CC8.1","ITIL 4","NIST CM-3"],status:"implemented",owner:"Ryan Johnson",evidence:4,risk:"Low",category:"ITSM",description:"CAB-governed change approval process with risk assessment, rollback procedures and post-implementation review.",aiInsights:["Emergency change rate: 18% vs. 5% target — insufficient capacity planning.","3 changes in last quarter caused production incidents.","AI: Automated change conflict detection would reduce change-related incidents by estimated 67%."] },
  { id:"CTL-009",name:"Data Loss Prevention",ccf:"CCF-DATA-02",frameworks:["GDPR Art.32","ISO 27001 A.8.2","SOC 2 CC6.7","PCI DSS 12.3"],status:"partial",owner:"Emma Wilson",evidence:3,risk:"High",category:"Data",description:"DLP controls across endpoint, email and cloud channels to prevent unauthorised exfiltration of sensitive data.",aiInsights:["DLP policy violation rate: 127 events in last 30 days — 14 classified as intentional exfiltration.","Email DLP coverage: 95% — cloud storage DLP: 62% (Teams, SharePoint partially covered).","AI: 4 users with >3 high-severity DLP events in 90 days — HR escalation recommended."] },
  { id:"CTL-010",name:"Backup & Recovery Controls",ccf:"CCF-BCP-01",frameworks:["ISO 27001 A.12.3","SOC 2 A1.2","ISO 22301","NIST CP-9"],status:"partial",owner:"David Chen",evidence:3,risk:"Medium",category:"BCP",description:"Automated backup schedules, integrity verification, offsite replication and tested recovery procedures for all critical systems.",aiInsights:["Last DR test: 6.2h actual RTO vs. 4h target — restoration bottleneck at Step 4.","Immutable backup coverage: 60% — 40% of critical systems lack ransomware-proof backup.","AI: Automated restoration orchestration with IaC would reduce RTO by estimated 35%."] },
  { id:"CTL-011",name:"Network Segmentation",ccf:"CCF-NET-01",frameworks:["ISO 27001 A.13.1","PCI DSS 1.3","CIS 12.2","NIST SC-7"],status:"partial",owner:"Alex Kim",evidence:2,risk:"High",category:"Security",description:"Network zones defined and enforced via firewalls, VLANs and microsegmentation to contain lateral movement.",aiInsights:["Zone segmentation violations: 2 active CORP_NET→OT_ZONE violations.","DMZ firewall ruleset: 23 stale rules not reviewed in 18+ months.","IPv6 not covered in network security policy — dual-stack deployment creating risk."] },
  { id:"CTL-012",name:"Security Awareness Training",ccf:"CCF-HR-01",frameworks:["ISO 27001 A.7.2","SOC 2 CC1.4","NIST AT-2","NIS2 Art.21"],status:"partial",owner:"Maria Santos",evidence:2,risk:"Medium",category:"HR",description:"Annual mandatory security awareness training for all personnel with role-based modules for high-risk roles.",aiInsights:["Completion rate: 87% — 54 users (Sales and Operations) not completed annual cycle.","Phishing click rate: 22% vs. 5% target — targeted training campaign needed.","AI: Role-based training for developers and privileged users not implemented."] },
  { id:"CTL-013",name:"Identity Governance",ccf:"CCF-IAM-04",frameworks:["ISO 27001 A.9.1","SOC 2 CC6.2","NIST IA-2","CIS 6.1"],status:"partial",owner:"Marcus Johnson",evidence:2,risk:"High",category:"IAM",description:"IGA platform enforcing identity lifecycle management, role-based access, access certification and orphaned account detection.",aiInsights:["Orphaned accounts: 43 accounts active >30 days post-departure.","Machine identity management: 312 service accounts without owners.","AI: IGA integration with HR system would automate 72% of provisioning requests."] },
  { id:"CTL-014",name:"Penetration Testing",ccf:"CCF-AT-01",frameworks:["ISO 27001 A.12.6","SOC 2 CC7.1","PCI DSS 11.3","NIST CA-8"],status:"implemented",owner:"Sarah Chen",evidence:6,risk:"Low",category:"Security",description:"Annual external penetration tests and continuous internal red team exercises for all internet-facing systems and critical internal assets.",aiInsights:["Last external pen test: 3 months ago — no critical findings open.","Internal red team exercise: 12 months ago — scheduling next exercise.","AI: Continuous automated red team simulation would identify new attack paths within hours of system changes."] },
  { id:"CTL-015",name:"Cloud Security Posture Management",ccf:"CCF-CLOUD-01",frameworks:["ISO 27001 A.12.1","CIS Benchmarks","NIST CSF","CSA CCM"],status:"partial",owner:"Clara Kim",evidence:3,risk:"High",category:"Cloud",description:"CSPM tool continuously monitoring cloud configurations across AWS, Azure and GCP for security misconfigurations and policy violations.",aiInsights:["710 active CSPM findings — critical: 3 public S3 buckets, 2 misconfigured IAM roles.","Auto-remediation: 0% implemented — immediate priority for low-risk drift patterns.","AI: Drift prediction model would identify configuration risks before they become findings."] },
];

function KV({ k, v }: { k:string; v:string|number }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}`, fontSize:12 }}>
      <span style={{ color:D.muted }}>{k}</span>
      <span style={{ color:D.text, fontWeight:600 }}>{v}</span>
    </div>
  );
}

function RingChart({ pct, color, size=72 }: { pct:number; color:string; size?:number }) {
  const r=(size-10)/2, circ=2*Math.PI*r, dash=(pct/100)*circ, cx=size/2;
  return (
    <div style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth="9"/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position:"absolute", textAlign:"center" }}>
        <div style={{ fontSize:14, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color }}>{pct}%</div>
      </div>
    </div>
  );
}

const gapData = [
  { framework:"ISO 27001", total:114, implemented:89, partial:18, notStarted:7,  pct:78 },
  { framework:"SOC 2",     total:64,  implemented:52, partial:9,  notStarted:3,  pct:81 },
  { framework:"GDPR",      total:25,  implemented:17, partial:6,  notStarted:2,  pct:68 },
  { framework:"HIPAA",     total:45,  implemented:38, partial:5,  notStarted:2,  pct:84 },
  { framework:"NIS2",      total:21,  implemented:8,  partial:7,  notStarted:6,  pct:38 },
  { framework:"PCI DSS",   total:78,  implemented:61, partial:11, notStarted:6,  pct:78 },
];

// ── Domain breakdown data ──────────────────────────────────────────────────────
const DOMAIN_BREAKDOWN: Record<string,{domain:string;implemented:number;total:number}[]> = {
  ISO27001:    [{domain:"Access Control (A.9)",implemented:11,total:14},{domain:"Cryptography (A.10)",implemented:2,total:2},{domain:"Physical (A.11)",implemented:9,total:15},{domain:"Operations (A.12)",implemented:14,total:18},{domain:"Communications (A.13)",implemented:7,total:9},{domain:"Supplier Relations (A.15)",implemented:5,total:8}],
  SOC2T2:      [{domain:"Security (CC)",implemented:38,total:42},{domain:"Availability (A)",implemented:5,total:6},{domain:"Confidentiality (C)",implemented:7,total:8},{domain:"Processing Integrity (PI)",implemented:3,total:5},{domain:"Privacy (P)",implemented:4,total:7}],
  GDPR:        [{domain:"Lawful Basis & Consent",implemented:8,total:9},{domain:"Data Subject Rights",implemented:6,total:8},{domain:"Security & Breach",implemented:5,total:7},{domain:"DPO & Accountability",implemented:3,total:4}],
  NISTCSF2:    [{domain:"Govern",implemented:15,total:18},{domain:"Identify",implemented:18,total:22},{domain:"Protect",implemented:24,total:30},{domain:"Detect",implemented:14,total:18},{domain:"Respond",implemented:10,total:14},{domain:"Recover",implemented:7,total:10}],
  PCIDSS4:     [{domain:"Network Controls",implemented:28,total:35},{domain:"Cardholder Data",implemented:22,total:28},{domain:"Vulnerability Mgmt",implemented:14,total:18},{domain:"Access Control",implemented:19,total:24},{domain:"Monitoring",implemented:18,total:22},{domain:"Security Policy",implemented:12,total:15}],
  CISCTRL:     [{domain:"Inventory & Control",implemented:12,total:16},{domain:"Data Protection",implemented:9,total:12},{domain:"Secure Config",implemented:14,total:18},{domain:"Vulnerability Mgmt",implemented:11,total:15},{domain:"Access Control",implemented:15,total:18},{domain:"Incident Response",implemented:8,total:10}],
};

function DomainBreakdown({ fwId, fwName }: { fwId:string; fwName:string }) {
  const domains = DOMAIN_BREAKDOWN[fwId] ?? DOMAIN_BREAKDOWN[Object.keys(DOMAIN_BREAKDOWN).find(k=>fwName.toLowerCase().includes(k.toLowerCase()))||""]  ?? [];
  if (!domains.length) return null;
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Domain Breakdown</div>
      {domains.map(d=>{
        const pct = Math.round((d.implemented/d.total)*100);
        const col = pct>=80?EME:pct>=60?BLU:pct>=40?AMB:RED;
        return (
          <div key={d.domain} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
              <span style={{ color:D.text }}>{d.domain}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", color:col, fontWeight:700, fontSize:11 }}>{d.implemented}/{d.total} · {pct}%</span>
            </div>
            <div style={{ height:6, background:"var(--secondary)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:3 }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ title, fields, onSave, onClose }: {
  title:string;
  fields:{key:string;label:string;value:string;type?:string;options?:string[]}[];
  onSave:(vals:Record<string,string>)=>void;
  onClose:()=>void;
}) {
  const [vals, setVals] = useState<Record<string,string>>(Object.fromEntries(fields.map(f=>[f.key,f.value])));
  const inp: React.CSSProperties = { width:"100%", padding:"9px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"var(--card)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:14, padding:"28px 32px", width:480, boxShadow:"0 8px 40px rgba(0,0,0,0.7)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:15, fontWeight:800, color:"rgb(147,197,253)", marginBottom:20 }}>{title}</div>
        {fields.map(f=>(
          <div key={f.key} style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:6 }}>{f.label}</div>
            {f.options ? (
              <select value={vals[f.key]??""} onChange={e=>setVals(v=>({...v,[f.key]:e.target.value}))} style={inp}>
                {f.options.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type??"text"} value={vals[f.key]??""} onChange={e=>setVals(v=>({...v,[f.key]:e.target.value}))} style={inp}/>
            )}
          </div>
        ))}
        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={()=>onSave(vals)} style={{ flex:1, padding:"10px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#1E3A5F,#065F46)", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Save Changes</button>
          <button onClick={onClose} style={{ padding:"10px 18px", borderRadius:8, border:"1px solid var(--border)", background:"var(--card)", color:"var(--muted-foreground)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ComplianceNotFound({ label, id, backHref }: { label: string; id: string; backHref: string }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding:"60px 32px", textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:16, opacity:0.5 }}>🔍</div>
      <div style={{ fontSize:20, fontWeight:800, color:"var(--foreground)", marginBottom:10 }}>{label} not found</div>
      <code style={{ fontSize:12, color:"#9CA3AF", background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 12px", display:"inline-block", marginBottom:16 }}>{id}</code>
      <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:28, maxWidth:380, lineHeight:1.7 }}>
        This record could not be located. It may have been removed, or you may not have permission to view it.
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button
          onClick={() => navigate(backHref)}
          style={{ padding:"10px 24px", borderRadius:8, border:"1px solid rgba(147,197,253,0.35)", background:"rgba(147,197,253,0.08)", color:"rgb(147,197,253)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
        >← Go back</button>
        <button
          onClick={() => window.history.back()}
          style={{ padding:"10px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Browser back</button>
      </div>
    </div>
  );
}

export default function ComplianceProfile() {
  const [location] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [activeCtlTab, setActiveCtlTab] = useState("overview");
  const fwMatch  = location.match(/^\/complianceops\/frameworks\/(.+)$/);
  const ctlMatch = location.match(/^\/complianceops\/controls\/(.+)$/);

  if (fwMatch) {
    const id = fwMatch[1]!;
    const fw = allFrameworks.find(f=>f.id===id);
    if (!fw) return <ComplianceNotFound label="Framework" id={id} backHref="/complianceops" />;
    const pctColor = fw.pct>=80?EME:fw.pct>=60?AMB:fw.pct>0?RED:"#9CA3AF";
    const gap = gapData.find(g=>fw.name.toLowerCase().includes(g.framework.toLowerCase().slice(0,6)));
    const aiInsights = [
      `📊 ${fw.name} compliance is at ${fw.pct}% — ${fw.pct>=75?"on track for certification renewal":"gap analysis required to achieve certification readiness"}.`,
      `${fw.controls>0?`${fw.controls} controls defined`:"Control count pending"} — align with CCF for unified evidence collection across mapped frameworks.`,
      `⚠️ Category: ${fw.category} · Region: ${fw.region} · Published: ${fw.year} — ${new Date().getFullYear()-fw.year>3?"consider updating to latest version":"currently current version"}.`,
      `📅 Next review date: ${fw.nextReview}. Owner: ${fw.owner}. Risk Score: ${fw.riskScore}/100 (${fw.impact} impact).`,
      fw.pct<60?`🔴 Low compliance posture — initiate immediate gap assessment and develop a remediation roadmap with milestones.`:`🟢 ${fw.pct>=80?"Strong posture — focus on evidence quality and maintaining coverage.":"Moderate posture — prioritise partial controls for full implementation."}`,
    ];
    return (
      <>
        {editOpen && (
          <EditModal
            title={`Update Framework — ${fw.name}`}
            fields={[
              { key:"owner",      label:"Framework Owner", value:fw.owner, type:"text" },
              { key:"nextReview", label:"Next Review",     value:fw.nextReview, type:"date" },
              { key:"status",     label:"Status",          value:fw.status, options:["active","available","planned"] },
            ]}
            onSave={()=>setEditOpen(false)}
            onClose={()=>setEditOpen(false)}
          />
        )}
        <ObjectProfilePage
          hero={{ id:fw.id, name:fw.name, type:fw.category, owner:fw.owner, status:fw.status, statusOk:fw.status==="active", modified:fw.nextReview, extra:[{label:"Region",value:fw.region},{label:"Year",value:String(fw.year)},{label:"Impact",value:fw.impact}] }}
          breadcrumbs={[{label:"ComplianceOps",href:"/complianceops"},{label:"Frameworks",href:"/complianceops"},{label:fw.id}]}
          onBack="/complianceops"
          aiObjectType="framework" aiObjectId={fw.id} aiFallback={aiInsights}
          riskSection={{ inherent:fw.riskScore, residual:Math.max(0,fw.riskScore-Math.round(fw.pct/5)), impact:fw.impact==="Critical"?90:fw.impact==="High"?70:fw.impact==="Medium"?50:30 }}
          description={fw.description}
          related={fw.tags.slice(0,5).map(t=>({id:t,label:t,type:"Tag",route:"/complianceops"}))}
        >
          <div style={{ ...card(), display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>setEditOpen(true)} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid rgba(147,197,253,0.3)", background:"rgba(147,197,253,0.08)", color:"rgb(147,197,253)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✏ Update Framework</button>
          </div>
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Compliance Posture</div>
            <div style={{ display:"flex", alignItems:"center", gap:24 }}>
              <RingChart pct={fw.pct} color={pctColor} size={88}/>
              <div style={{ flex:1 }}>
                {gap ? (
                  <>
                    <div style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                        <span style={{ color:D.text }}>Controls implemented</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", color:EME, fontWeight:700 }}>{gap.implemented}/{gap.total}</span>
                      </div>
                      <div style={{ height:7, borderRadius:4, background:"var(--secondary)", overflow:"hidden", display:"flex" }}>
                        <div style={{ height:"100%", background:EME,  width:`${Math.round((gap.implemented/gap.total)*100)}%` }}/>
                        <div style={{ height:"100%", background:"rgba(251,191,36,0.7)", width:`${Math.round((gap.partial/gap.total)*100)}%` }}/>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:14, fontSize:11 }}>
                      <span style={{ color:D.green }}>● {gap.implemented} implemented</span>
                      <span style={{ color:D.amber }}>● {gap.partial} partial</span>
                      <span style={{ color:D.red }}>● {gap.notStarted} gap</span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize:11, color:D.muted }}>{fw.controls>0?`${fw.controls} controls in scope`:"Detailed control mapping available via CCF"}</div>
                )}
              </div>
            </div>
          </div>
          <DomainBreakdown fwId={fw.id} fwName={fw.name}/>
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Framework Metadata</div>
            <KV k="Category" v={fw.category}/>
            <KV k="Region" v={fw.region}/>
            <KV k="Publication Year" v={fw.year}/>
            {fw.controls>0 && <KV k="Total Controls" v={fw.controls}/>}
            <KV k="Status" v={fw.status}/>
            <KV k="Compliance %" v={`${fw.pct}%`}/>
            <KV k="Risk Score" v={`${fw.riskScore}/100`}/>
            <KV k="Next Review" v={fw.nextReview}/>
            <KV k="Owner" v={fw.owner}/>
          </div>
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Framework Tags</div>
            <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
              {fw.tags.map(t=>(
                <span key={t} style={{ fontSize:11, fontWeight:600, color:"rgb(147,197,253)", background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:6, padding:"3px 8px" }}>{t}</span>
              ))}
            </div>
          </div>
        </ObjectProfilePage>
      </>
    );
  }

  if (ctlMatch) {
    const id = ctlMatch[1]!;
    const ctl = controls.find(c=>c.id===id);
    if (!ctl) return <ComplianceNotFound label="Control" id={id} backHref="/complianceops" />;

    function h(s:string):number { let v=0; for(const ch of s) v=((v<<5)-v+ch.charCodeAt(0))>>>0; return v; }
    const implScore   = ctl.status==="implemented"?98:ctl.status==="partial"?62:ctl.status==="planned"?28:10;
    const assessScore = 55+(h(ctl.id+"assess")%40);
    const evidScore   = ctl.evidence>=6?82:ctl.evidence>=4?70:ctl.evidence>=2?56:38;
    const fwScore     = Math.round(ctl.frameworks.reduce((s,fw)=>s+(55+(h(ctl.id+fw)%40)),0)/Math.max(ctl.frameworks.length,1));
    const composite   = Math.round(0.30*implScore+0.30*assessScore+0.15*evidScore+0.25*fwScore);
    const compColor   = composite>=80?"#34D399":composite>=65?"#FBBF24":"#F87171";
    const stC         = ctl.status==="implemented"?"#34D399":ctl.status==="partial"?"#FBBF24":ctl.status==="planned"?"rgb(147,197,253)":"#F87171";

    const reviewerMap:Record<string,string> = { IAM:"Internal Auditor", Security:"Security Assurance Lead", Data:"Data Protection Officer", ITSM:"IT Governance Lead", BCP:"Business Continuity Lead", HR:"HR Compliance Officer", Cloud:"Cloud Security Lead" };
    const reviewer  = reviewerMap[ctl.category]??"Internal Auditor";
    const lastReview= ctl.status==="implemented"?"01-Jun-2026":ctl.status==="partial"?"15-Mar-2026":"20-Jan-2026";
    const fwLabel   = (ctl.frameworks[0]??"ISO 27001").replace(/\s+A\.\d+(\.\d+)?/,"").replace(/\s+(CC|AC|RA|SI|AT|CA|CM|CP|IA|SA)\-\d+/,"");
    const domain    = ctl.category==="IAM"?"Identity & Access":ctl.category==="Security"?"Cybersecurity":ctl.category==="Data"?"Data Protection":ctl.category==="ITSM"?"IT Service Mgmt":ctl.category==="BCP"?"Business Continuity":ctl.category==="HR"?"Human Resources":ctl.category==="Cloud"?"Cloud Security":ctl.category;

    const objectiveMap:Record<string,string> = {
      "CTL-001":"Ensure all user and privileged accounts are protected by MFA across every authentication pathway, reducing the risk of account compromise from credential theft or brute force attacks.",
      "CTL-002":"Establish centralised control over all privileged accounts through PAM tooling with JIT provisioning, session recording, and automated credential rotation, minimising standing access risk.",
      "CTL-003":"Continuously identify and prioritise vulnerabilities across all assets with SLA-bound remediation tracking, reducing the window of exploitability for known vulnerabilities.",
      "CTL-004":"Protect confidentiality of data at rest by applying AES-256 encryption to all Confidential and Restricted data stores, backup media, and removable storage.",
      "CTL-005":"Provide centralised security event visibility across all critical systems, enabling timely detection and response to threats through correlation rules and analyst-driven alert triage.",
      "CTL-006":"Maintain appropriate access rights by conducting regular access reviews and certifications for all accounts, ensuring timely revocation of orphaned or excess permissions.",
      "CTL-007":"Detect and respond to endpoint threats in real time through behavioural analysis, automated containment, and forensic investigation capability on all managed devices.",
      "CTL-008":"Reduce risk from infrastructure changes through a governed approval process with risk assessment, testing, rollback planning, and post-implementation review.",
      "CTL-009":"Prevent unauthorised exfiltration of sensitive data by detecting and blocking policy violations across email, endpoint, and cloud channels.",
      "CTL-010":"Ensure business-critical systems can be recovered within agreed RTOs/RPOs through automated backups, integrity verification, offsite replication, and regularly tested recovery procedures.",
      "CTL-011":"Contain lateral movement and limit the blast radius of breaches through enforceable network zone boundaries, DMZ controls, and microsegmentation.",
      "CTL-012":"Build a security-aware workforce capable of recognising and responding to threats by delivering role-appropriate security training and measuring effectiveness through simulated attacks.",
      "CTL-013":"Enforce identity lifecycle management across all accounts to prevent orphaned access, ensure least-privilege, and support automated provisioning and de-provisioning.",
      "CTL-014":"Identify exploitable vulnerabilities through adversarial testing of all internet-facing systems and critical internal assets on an annual or continuous basis.",
      "CTL-015":"Continuously detect and remediate cloud configuration drift and misconfigurations across multi-cloud environments to maintain a hardened security posture.",
    };
    const controlObjective = objectiveMap[ctl.id]??`Ensure ${ctl.name} is operating effectively across all applicable systems and processes, providing appropriate assurance against relevant risks and framework requirements.`;

    const evidenceItems = [
      { type:"Screenshot",  name:`${ctl.name} — Configuration Evidence`,      date:"15-Mar-2026", quality:"Accepted",     size:"1.2 MB" },
      { type:"Log Export",  name:`${ctl.name} — Audit Log Sample`,            date:"20-Feb-2026", quality:"Accepted",     size:"4.8 MB" },
      { type:"Policy Doc",  name:"Linked Policy Document v2.1",               date:"10-Jan-2026", quality:"Accepted",     size:"256 KB" },
      { type:"Report",      name:`${ctl.name} — Test Results Q1 2026`,        date:"01-Mar-2026", quality:"Accepted",     size:"890 KB" },
      { type:"Screenshot",  name:`${ctl.name} — Dashboard View`,              date:"20-Mar-2026", quality:"Under Review", size:"780 KB" },
      { type:"Certificate", name:"Third-Party Certification — Vendor Audit",  date:"01-Feb-2026", quality:"Accepted",     size:"340 KB" },
      { type:"Report",      name:`${ctl.name} — Penetration Test Finding`,    date:"14-Apr-2026", quality:"Under Review", size:"1.1 MB" },
      { type:"Policy Doc",  name:`Procedure SOP — ${ctl.name}`,               date:"05-Dec-2025", quality:"Accepted",     size:"128 KB" },
    ].slice(0,ctl.evidence);

    const findings = ctl.status==="implemented"?[
      { id:`FND-${h(ctl.id+"f1")%900+100}`, title:"Minor documentation gap identified in evidence collection process",severity:"Low",   status:"Closed",      date:"15-Feb-2026" },
      { id:`FND-${h(ctl.id+"f2")%900+100}`, title:"Periodic review cadence not formally documented in runbook",     severity:"Info",  status:"Closed",      date:"10-Jan-2026" },
    ]:ctl.status==="partial"?[
      { id:`FND-${h(ctl.id+"f1")%900+100}`, title:"Coverage gap — control not applied to 3 legacy systems",          severity:"Medium",status:"Open",         date:"01-Apr-2026" },
      { id:`FND-${h(ctl.id+"f2")%900+100}`, title:"Evidence quality below threshold — missing test results",         severity:"Medium",status:"In Progress",  date:"15-Mar-2026" },
      { id:`FND-${h(ctl.id+"f3")%900+100}`, title:"Configuration drift detected — baseline deviations unresolved",   severity:"High",  status:"Open",         date:"20-Mar-2026" },
    ]:[
      { id:`FND-${h(ctl.id+"f1")%900+100}`, title:"Control not yet implemented — no evidence of operation",          severity:"High",  status:"Open",         date:"20-Jan-2026" },
      { id:`FND-${h(ctl.id+"f2")%900+100}`, title:"No documented implementation plan or owner assigned",             severity:"Medium",status:"Open",         date:"20-Jan-2026" },
    ];

    const capas = ctl.status==="partial"?[
      { id:`CAPA-${h(ctl.id+"c1")%900+100}`, title:`Extend ${ctl.name} coverage to all remaining in-scope systems`, due:"30-Jun-2026", owner:ctl.owner, status:"In Progress", priority:"High" },
      { id:`CAPA-${h(ctl.id+"c2")%900+100}`, title:"Collect and submit missing evidence items for audit readiness",  due:"15-Jun-2026", owner:reviewer,  status:"Open",       priority:"Medium" },
    ]:ctl.status==="implemented"?[
      { id:`CAPA-${h(ctl.id+"c1")%900+100}`, title:"Update runbook to reflect current process and evidence requirements", due:"01-Jul-2026", owner:ctl.owner, status:"Open", priority:"Low" },
    ]:[
      { id:`CAPA-${h(ctl.id+"c1")%900+100}`, title:`Develop and approve implementation plan for ${ctl.name}`,       due:"31-Jul-2026", owner:ctl.owner,          status:"Open", priority:"High" },
      { id:`CAPA-${h(ctl.id+"c2")%900+100}`, title:"Assign technical lead and establish milestone schedule",        due:"15-Jun-2026", owner:"Security Governance", status:"Open", priority:"High" },
    ];

    const TABS = ["Overview","Applicability","Implementation","Assessment","Evidence","Assets","Risks","Policies","Procedures","Incidents","Exceptions","Vendors","AI Systems","Findings","CAPA","Monitoring"];
    const sL: React.CSSProperties = { fontSize:10, fontWeight:700, color:D.muted, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:10 };
    const bT: React.CSSProperties = { fontSize:13, color:D.text, lineHeight:1.7, margin:0 };

    function ScoreBar({ label, score, weight, color }: { label:string; score:number; weight:number; color:string }) {
      return (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
            <span style={{ fontSize:12, color:D.text }}>{label}</span>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:10, color:D.muted }}>Weight {weight}%</span>
              <span style={{ fontSize:13, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color }}>{score}%</span>
            </div>
          </div>
          <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.07)", overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${score}%`, background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:4 }}/>
          </div>
        </div>
      );
    }

    function DonutScore({ size=100, pct, color }: { size?:number; pct:number; color:string }) {
      const r=(size-12)/2, circ=2*Math.PI*r, dash=(pct/100)*circ, cx=size/2;
      return (
        <div style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
          <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10"/>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${circ-dash}`} strokeLinecap="round"/>
          </svg>
          <div style={{ position:"absolute", textAlign:"center" }}>
            <div style={{ fontSize:size>=100?18:14, fontWeight:900, fontFamily:"'JetBrains Mono',monospace", color, lineHeight:1 }}>{pct}%</div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight:"100vh", background:"var(--background)", paddingBottom:64 }}>

        {/* HEADER */}
        <div style={{ background:"var(--card)", borderBottom:`1px solid ${D.border}`, padding:"20px 32px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:D.muted, marginBottom:16 }}>
            <button onClick={()=>window.history.back()} style={{ background:"none", border:"none", color:D.muted, cursor:"pointer", fontFamily:"inherit", fontSize:12, padding:0 }}>← Back</button>
            <span>/</span>
            <span style={{ color:D.accent, cursor:"pointer" }} onClick={()=>window.location.href="/complianceops"}>ComplianceOps</span>
            <span>/</span><span>Controls</span>
            <span>/</span><span style={{ color:D.text, fontWeight:600 }}>{ctl.id}</span>
          </div>

          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:24, paddingBottom:20 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6, marginBottom:12 }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#94A3B8", background:"rgba(148,163,184,0.12)", border:"1px solid rgba(148,163,184,0.25)", borderRadius:5, padding:"2px 9px" }}>{ctl.id}</span>
                <span style={{ fontSize:11, fontWeight:700, color:"rgb(147,197,253)", background:"rgba(147,197,253,0.1)", border:"1px solid rgba(147,197,253,0.25)", borderRadius:5, padding:"2px 9px" }}>{fwLabel}</span>
                <span style={{ fontSize:11, fontWeight:700, color:"#34D399", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:5, padding:"2px 9px" }}>{ctl.category}</span>
              </div>
              <h1 style={{ fontSize:24, fontWeight:800, color:D.text, margin:"0 0 8px", lineHeight:1.2 }}>{ctl.name}</h1>
              <p style={{ fontSize:13, color:D.muted, margin:0, maxWidth:640, lineHeight:1.6 }}>{ctl.description}</p>
            </div>
            <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:8, minWidth:140 }}>
              <div style={{ fontSize:9, fontWeight:700, color:D.muted, letterSpacing:"1px", textTransform:"uppercase" as const }}>Composite Score</div>
              <DonutScore pct={composite} color={compColor} size={104}/>
              <span style={{ fontSize:11, fontWeight:700, color:stC, background:`${stC}1A`, border:`1px solid ${stC}44`, borderRadius:5, padding:"3px 10px" }}>{ctl.status.toUpperCase()}</span>
              <span style={{ fontSize:11, color:D.muted }}>Risk: <span style={{ color:ctl.risk==="Critical"?"#F87171":ctl.risk==="High"?"#FB923C":ctl.risk==="Medium"?"#FBBF24":"#34D399", fontWeight:700 }}>{ctl.risk}</span></span>
            </div>
          </div>

          {/* Metadata bar */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", borderTop:`1px solid ${D.border}` }}>
            {[
              { label:"Owner",       value:ctl.owner },
              { label:"Reviewer",    value:reviewer },
              { label:"Framework",   value:fwLabel },
              { label:"Domain",      value:domain },
              { label:"Last Review", value:lastReview },
              { label:"Evidence",    value:`${ctl.evidence} items` },
            ].map((m,i)=>(
              <div key={m.label} style={{ padding:"12px 16px", borderRight:i<5?`1px solid ${D.border}`:"none" }}>
                <div style={{ fontSize:9, fontWeight:700, color:D.muted, textTransform:"uppercase" as const, letterSpacing:"0.8px", marginBottom:4 }}>{m.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:D.text }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Tab nav */}
          <div style={{ display:"flex", overflowX:"auto" as const, scrollbarWidth:"none" as const }}>
            {TABS.map(tab=>(
              <button key={tab} onClick={()=>setActiveCtlTab(tab.toLowerCase())}
                style={{ padding:"12px 16px", background:"none", border:"none", borderBottom:activeCtlTab===tab.toLowerCase()?`2px solid rgb(147,197,253)`:"2px solid transparent", color:activeCtlTab===tab.toLowerCase()?"rgb(147,197,253)":D.muted, fontSize:12, fontWeight:activeCtlTab===tab.toLowerCase()?700:400, cursor:"pointer", whiteSpace:"nowrap" as const, fontFamily:"inherit" }}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* TAB CONTENT */}
        <div style={{ padding:"24px 32px" }}>

          {activeCtlTab==="overview" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:24, alignItems:"start" }}>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Control Description</div>
                  <p style={bT}>{ctl.description}</p>
                  <div style={{ marginTop:20 }}>
                    <div style={sL}>Control Objective</div>
                    <p style={{ ...bT, color:D.muted }}>{controlObjective}</p>
                  </div>
                </div>
                <div style={card()}>
                  <div style={sL}>Framework Alignment</div>
                  {ctl.frameworks.map(fw=>{
                    const pct=55+(h(ctl.id+fw)%40);
                    const col=pct>=80?"#34D399":pct>=65?"rgb(147,197,253)":pct>=50?"#FBBF24":"#F87171";
                    return (
                      <div key={fw} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
                          <span style={{ color:D.text }}>{fw}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", color:col, fontWeight:700 }}>{pct}%</span>
                        </div>
                        <div style={{ height:7, background:"rgba(255,255,255,0.07)", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:4 }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={card()}>
                  <div style={sL}>AI Insights</div>
                  {ctl.aiInsights.map((ins,i)=>(
                    <div key={i} style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:i<ctl.aiInsights.length-1?`1px solid ${D.border}`:"none" }}>
                      <div style={{ width:20, height:20, borderRadius:4, background:"rgba(147,197,253,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:1 }}>✦</div>
                      <div style={{ fontSize:12, color:D.muted, lineHeight:1.6 }}>{ins}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Control Scoring Model</div>
                  <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:24, padding:"8px 0" }}>
                    <DonutScore pct={composite} color={compColor} size={100}/>
                    <div>
                      <div style={{ fontSize:26, fontWeight:900, color:D.text, lineHeight:1 }}>{composite}%</div>
                      <div style={{ fontSize:11, color:D.muted, marginTop:4 }}>Composite Score</div>
                      <span style={{ fontSize:10, fontWeight:700, color:stC, background:`${stC}1A`, border:`1px solid ${stC}44`, borderRadius:4, padding:"2px 8px", marginTop:6, display:"inline-block" }}>{ctl.status.toUpperCase()}</span>
                    </div>
                  </div>
                  <ScoreBar label="Implementation Score" score={implScore}   weight={30} color={implScore>=80?"#34D399":implScore>=55?"#FBBF24":"#F87171"}/>
                  <ScoreBar label="Assessment Score"     score={assessScore} weight={30} color={assessScore>=80?"#34D399":assessScore>=55?"#FBBF24":"#F87171"}/>
                  <ScoreBar label="Evidence Score"       score={evidScore}   weight={15} color={evidScore>=75?"#34D399":evidScore>=55?"#FBBF24":"#F87171"}/>
                  <ScoreBar label="Framework Alignment"  score={fwScore}     weight={25} color={fwScore>=80?"#34D399":fwScore>=55?"#FBBF24":"#F87171"}/>
                </div>
                <div style={card()}>
                  <div style={sL}>Control Metadata</div>
                  <KV k="Control ID"     v={ctl.id}/>
                  <KV k="CCF Reference"  v={ctl.ccf}/>
                  <KV k="Category"       v={ctl.category}/>
                  <KV k="Owner"          v={ctl.owner}/>
                  <KV k="Reviewer"       v={reviewer}/>
                  <KV k="Risk Level"     v={ctl.risk}/>
                  <KV k="Last Review"    v={lastReview}/>
                  <KV k="Evidence Items" v={ctl.evidence}/>
                  <KV k="Frameworks"     v={ctl.frameworks.length}/>
                </div>
              </div>
            </div>
          )}

          {activeCtlTab==="applicability" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Scope Statement</div>
                  <p style={bT}>This control applies to all systems, applications, and personnel within the organisation's security perimeter that interact with {ctl.category==="IAM"?"user credentials or identity systems":ctl.category==="Data"?"confidential or restricted data":ctl.category==="Security"?"security-relevant infrastructure":ctl.category==="Cloud"?"cloud-hosted workloads and services":"in-scope operational systems"}.</p>
                </div>
                <div style={card()}>
                  <div style={sL}>In-Scope Systems</div>
                  {["Corporate Active Directory","Cloud Identity Provider (Okta)","VPN Gateway","Production SaaS Applications","Developer Toolchain (GitHub, CI/CD)"].map((sys,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<4?`1px solid ${D.border}`:"none" }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#34D399", flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:D.text }}>{sys}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Exclusions</div>
                  {["Legacy OT/ICS systems (separate baseline applies)","Air-gapped R&D lab environments (exemption EXC-003)","Non-networked endpoints (paper-based processes)"].map((ex,i)=>(
                    <div key={i} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                      <span style={{ color:"#F87171", fontWeight:700 }}>✕</span>
                      <span style={{ fontSize:12, color:D.muted }}>{ex}</span>
                    </div>
                  ))}
                </div>
                <div style={card()}>
                  <div style={sL}>Applicability Conditions</div>
                  <KV k="Applicable Roles"    v="All Users, Privileged Accounts"/>
                  <KV k="Environments"        v="Production, Staging, UAT"/>
                  <KV k="Data Classification" v="Confidential, Restricted"/>
                  <KV k="Regulation Trigger"  v={ctl.frameworks[0]??"-"}/>
                  <KV k="Last Scoping Review" v={lastReview}/>
                </div>
              </div>
            </div>
          )}

          {activeCtlTab==="implementation" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Implementation Approach</div>
                  <p style={bT}>{ctl.description} The implementation follows a phased approach aligned to the CCF reference architecture, with technical controls deployed in priority order based on risk exposure.</p>
                </div>
                <div style={card()}>
                  <div style={sL}>Implementation Milestones</div>
                  {[
                    { ms:"Design & architecture review",        date:"Jan 2026", done:ctl.status!=="not-started" },
                    { ms:"Pilot deployment — low-risk systems", date:"Feb 2026", done:ctl.status==="implemented"||ctl.status==="partial" },
                    { ms:"Full rollout — all in-scope systems",  date:"Apr 2026", done:ctl.status==="implemented", inprog:ctl.status==="partial" },
                    { ms:"Evidence collection & testing",       date:"May 2026", done:ctl.status==="implemented" },
                    { ms:"Certification-ready evidence review",  date:"Jun 2026", done:ctl.status==="implemented" },
                  ].map((m,i)=>{
                    const st=m.done?"Complete":m.inprog?"In Progress":"Pending";
                    const col=st==="Complete"?"#34D399":st==="In Progress"?"#FBBF24":"#94A3B8";
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:i<4?`1px solid ${D.border}`:"none" }}>
                        <div style={{ width:18, height:18, borderRadius:"50%", background:`${col}22`, border:`1.5px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, flexShrink:0, color:col }}>{st==="Complete"?"✓":st==="In Progress"?"●":"○"}</div>
                        <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text }}>{m.ms}</div><div style={{ fontSize:10, color:D.muted }}>{m.date}</div></div>
                        <span style={{ fontSize:10, fontWeight:700, color:col }}>{st}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Status Metrics</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                    {[
                      { label:"Overall Progress", value:implScore+"%",  color:implScore>=80?"#34D399":"#FBBF24" },
                      { label:"Systems Covered",  value:ctl.status==="implemented"?"100%":ctl.status==="partial"?"60%":"5%", color:"rgb(147,197,253)" },
                      { label:"Evidence Quality", value:evidScore+"%",  color:evidScore>=75?"#34D399":"#FBBF24" },
                      { label:"Open Issues",       value:ctl.status==="implemented"?"0":ctl.status==="partial"?"3":"5", color:ctl.status==="implemented"?"#34D399":"#F87171" },
                    ].map(m=>(
                      <div key={m.label} style={{ padding:"12px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:`1px solid ${D.border}`, textAlign:"center" }}>
                        <div style={{ fontSize:22, fontWeight:900, fontFamily:"'JetBrains Mono',monospace", color:m.color }}>{m.value}</div>
                        <div style={{ fontSize:10, color:D.muted, marginTop:3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <KV k="Implementation Owner" v={ctl.owner}/>
                  <KV k="Technical Reviewer"   v={reviewer}/>
                  <KV k="Start Date"           v="15-Jan-2026"/>
                  <KV k="Target Complete"      v={ctl.status==="implemented"?"01-Jun-2026":"30-Sep-2026"}/>
                </div>
              </div>
            </div>
          )}

          {activeCtlTab==="assessment" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
              <div style={{ display:"flex", flexDirection:"column" as const, gap:20 }}>
                <div style={card()}>
                  <div style={sL}>Last Assessment Summary</div>
                  <KV k="Assessment Date"     v={lastReview}/>
                  <KV k="Assessor"            v={reviewer}/>
                  <KV k="Methodology"         v="Design & Operating Effectiveness"/>
                  <KV k="Overall Result"      v={ctl.status==="implemented"?"EFFECTIVE":ctl.status==="partial"?"PARTIALLY EFFECTIVE":"NOT ASSESSED"}/>
                  <KV k="Design Effective"    v={ctl.status!=="not-started"?"Yes":"N/A"}/>
                  <KV k="Operating Effective" v={ctl.status==="implemented"?"Yes":"Partial"}/>
                  <KV k="Next Assessment"     v="01-Sep-2026"/>
                </div>
                <div style={card()}>
                  <div style={sL}>Test Procedures</div>
                  {[
                    { step:"Inspect configuration documentation and approval records",         result:ctl.status!=="not-started"?"Pass":"N/A" },
                    { step:"Select sample of 25 accounts/events and verify control operation", result:ctl.status==="implemented"?"Pass":ctl.status==="partial"?"Partial":"N/A" },
                    { step:"Review exception log and confirm exceptions are authorised",       result:ctl.status==="implemented"?"Pass":"Not Tested" },
                    { step:"Verify monitoring alerts and escalation procedures are active",    result:ctl.status==="implemented"?"Pass":ctl.status==="partial"?"Partial":"Not Tested" },
                  ].map((t,i)=>(
                    <div key={i} style={{ display:"flex", gap:12, padding:"9px 0", borderBottom:i<3?`1px solid ${D.border}`:"none" }}>
                      <div style={{ flex:1, fontSize:12, color:D.text }}>{t.step}</div>
                      <span style={{ fontSize:10, fontWeight:700, flexShrink:0, color:t.result==="Pass"?"#34D399":t.result==="Partial"?"#FBBF24":"#94A3B8" }}>{t.result}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card()}>
                <div style={sL}>Assessment Score Breakdown</div>
                <ScoreBar label="Design Effectiveness"    score={Math.min(100,assessScore+5)} weight={40} color={assessScore>=75?"#34D399":"#FBBF24"}/>
                <ScoreBar label="Operating Effectiveness" score={Math.max(30,assessScore-8)}  weight={40} color={assessScore>=75?"#34D399":"#FBBF24"}/>
                <ScoreBar label="Documentation Quality"   score={Math.min(100,assessScore+2)} weight={20} color={assessScore>=75?"#34D399":"#FBBF24"}/>
              </div>
            </div>
          )}

          {activeCtlTab==="evidence" && (
            <div style={card()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={sL}>Evidence Repository</div>
                <span style={{ fontSize:11, color:D.muted }}>{ctl.evidence} items · {evidenceItems.filter(e=>e.quality==="Accepted").length} accepted</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"120px 110px 80px 1fr 120px 80px" }}>
                {["Type","Date","Size","Name","Quality",""].map((hd,i)=>(
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:D.muted, textTransform:"uppercase" as const, letterSpacing:"0.5px", padding:"8px 12px", borderBottom:`1px solid ${D.border}`, background:"rgba(255,255,255,0.02)" }}>{hd}</div>
                ))}
                {evidenceItems.map((e,i)=>(
                  <div key={i} style={{ display:"contents" }}>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}`, fontSize:11, color:D.muted, fontWeight:600 }}>{e.type}</div>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}`, fontSize:11, color:D.muted }}>{e.date}</div>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}`, fontSize:11, color:D.muted }}>{e.size}</div>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}`, fontSize:12, color:D.text, fontWeight:600 }}>{e.name}</div>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}` }}>
                      <span style={{ fontSize:10, fontWeight:700, color:e.quality==="Accepted"?"#34D399":"#FBBF24", background:e.quality==="Accepted"?"rgba(52,211,153,0.1)":"rgba(251,191,36,0.1)", border:`1px solid ${e.quality==="Accepted"?"rgba(52,211,153,0.3)":"rgba(251,191,36,0.3)"}`, borderRadius:4, padding:"2px 8px" }}>{e.quality}</span>
                    </div>
                    <div style={{ padding:"12px", borderBottom:`1px solid ${D.border}` }}>
                      <button style={{ fontSize:10, color:"rgb(147,197,253)", background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:4, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" }}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeCtlTab==="assets" && (
            <div style={card()}>
              <div style={sL}>Linked IT Assets</div>
              {[
                { id:"AST-001", name:"Corporate Active Directory", type:"Directory Service", criticality:"Critical", owner:"IT Operations" },
                { id:"AST-004", name:"Okta Identity Platform",     type:"IAM Platform",     criticality:"Critical", owner:"Security Ops" },
                { id:"AST-012", name:"VPN Gateway Cluster",        type:"Network Device",   criticality:"High",     owner:"Network Ops" },
                { id:"AST-019", name:"HR Information System",      type:"Application",      criticality:"High",     owner:"HR IT" },
                { id:"AST-027", name:"Customer Portal (web)",      type:"Web Application",  criticality:"Critical", owner:"Product Eng" },
              ].map((a,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:i<4?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:70 }}>{a.id}</span>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{a.name}</div><div style={{ fontSize:10, color:D.muted }}>{a.type} · Owner: {a.owner}</div></div>
                  <span style={{ fontSize:10, fontWeight:700, color:a.criticality==="Critical"?"#F87171":a.criticality==="High"?"#FBBF24":"#34D399" }}>{a.criticality}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="risks" && (
            <div style={card()}>
              <div style={sL}>Linked Risks</div>
              {[
                { id:`RK-${h(ctl.id+"r1")%900+100}`, name:`${ctl.category} — Unauthorised access risk`,    likelihood:"Medium", impact:"High",   status:"Mitigated" },
                { id:`RK-${h(ctl.id+"r2")%900+100}`, name:`${ctl.category} — Compliance exposure risk`,    likelihood:"Low",    impact:"High",   status:"Mitigated" },
                { id:`RK-${h(ctl.id+"r3")%900+100}`, name:`${ctl.category} — Operational continuity risk`, likelihood:"Low",    impact:"Medium", status:"Accepted"  },
              ].map((r,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:90 }}>{r.id}</span>
                  <div style={{ flex:1, fontSize:12, color:D.text }}>{r.name}</div>
                  <span style={{ fontSize:10, color:"#FBBF24" }}>L:{r.likelihood}</span>
                  <span style={{ fontSize:10, color:"#F87171" }}>I:{r.impact}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:r.status==="Mitigated"?"#34D399":"rgb(147,197,253)", background:r.status==="Mitigated"?"rgba(52,211,153,0.1)":"rgba(147,197,253,0.1)", border:`1px solid ${r.status==="Mitigated"?"rgba(52,211,153,0.3)":"rgba(147,197,253,0.3)"}`, borderRadius:4, padding:"2px 8px" }}>{r.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="policies" && (
            <div style={card()}>
              <div style={sL}>Governing Policies</div>
              {[
                { id:`POL-${h(ctl.id+"p1")%90+10}`, name:`Information Security Policy — ${ctl.category} Domain`, version:"v3.1", owner:ctl.owner, status:"Active" },
                { id:`POL-${h(ctl.id+"p2")%90+10}`, name:`${ctl.name} Control Standard`,                         version:"v1.4", owner:reviewer,  status:"Active" },
                { id:`POL-${h(ctl.id+"p3")%90+10}`, name:`${ctl.category} Risk Acceptance Policy`,               version:"v2.0", owner:"CISO",     status:"Active" },
              ].map((p,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:70 }}>{p.id}</span>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{p.name}</div><div style={{ fontSize:10, color:D.muted }}>{p.version} · Owner: {p.owner}</div></div>
                  <span style={{ fontSize:10, fontWeight:700, color:"#34D399", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.3)", borderRadius:4, padding:"2px 8px" }}>{p.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="procedures" && (
            <div style={card()}>
              <div style={sL}>Linked Procedures & SOPs</div>
              {[
                { id:`SOP-${h(ctl.id+"s1")%90+10}`, name:`${ctl.name} — Operating Procedure`,          type:"SOP",   rev:"Rev 4", owner:ctl.owner, lastRev:"01-Mar-2026" },
                { id:`SOP-${h(ctl.id+"s2")%90+10}`, name:`${ctl.name} — Exception Handling Process`,  type:"WI",    rev:"Rev 2", owner:reviewer,  lastRev:"15-Jan-2026" },
                { id:`SOP-${h(ctl.id+"s3")%90+10}`, name:`${ctl.name} — Monitoring & Review Runbook`, type:"Guide", rev:"Rev 1", owner:ctl.owner, lastRev:"10-Feb-2026" },
              ].map((s,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:80 }}>{s.id}</span>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{s.name}</div><div style={{ fontSize:10, color:D.muted }}>{s.type} · {s.rev} · Last reviewed: {s.lastRev}</div></div>
                  <span style={{ fontSize:10, color:"rgb(147,197,253)", fontWeight:600 }}>{s.owner}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="incidents" && (
            <div style={card()}>
              <div style={sL}>Related Incidents</div>
              {(ctl.status==="implemented"?[
                { id:`INC-${h(ctl.id+"i1")%900+100}`, title:`Minor ${ctl.category} alert — investigated, no breach confirmed`, severity:"Low",      date:"10-Apr-2026", status:"Closed"   },
              ]:ctl.status==="partial"?[
                { id:`INC-${h(ctl.id+"i1")%900+100}`, title:`${ctl.category} control gap exploited — partial data exposure`,   severity:"Medium",   date:"20-Mar-2026", status:"Resolved" },
                { id:`INC-${h(ctl.id+"i2")%900+100}`, title:"Unauthorised access attempt — blocked by compensating control",  severity:"High",     date:"05-Feb-2026", status:"Closed"   },
              ]:[
                { id:`INC-${h(ctl.id+"i1")%900+100}`, title:`${ctl.category} control not operating — no detection capability`,severity:"Critical", date:"15-Jan-2026", status:"Open"     },
              ]).map((inc,i,arr)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<arr.length-1?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:80 }}>{inc.id}</span>
                  <div style={{ flex:1, fontSize:12, color:D.text }}>{inc.title}</div>
                  <span style={{ fontSize:10, color:D.muted }}>{inc.date}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:inc.severity==="Critical"?"#F87171":inc.severity==="High"?"#FB923C":inc.severity==="Medium"?"#FBBF24":"#34D399" }}>{inc.severity}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:inc.status==="Open"?"#F87171":inc.status==="Resolved"?"#FBBF24":"#34D399" }}>{inc.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="exceptions" && (
            <div style={card()}>
              <div style={sL}>Control Exceptions</div>
              {ctl.status==="implemented"?(
                <div style={{ fontSize:12, color:D.muted, padding:"20px 0" }}>No active exceptions — control is fully implemented across all in-scope systems.</div>
              ):[
                { id:`EXC-${h(ctl.id+"e1")%90+10}`, system:"Legacy ERP (pre-2018 deployment)", reason:"Vendor limitation — upgrade scheduled Q3 2026",             expiry:"30-Sep-2026", owner:ctl.owner, treatment:"Accepted" },
                { id:`EXC-${h(ctl.id+"e2")%90+10}`, system:"OT/ICS Segment B",                  reason:"Operational disruption risk — mitigating controls in place", expiry:"31-Dec-2026", owner:reviewer,  treatment:"Mitigated" },
              ].map((e,i)=>(
                <div key={i} style={{ padding:"14px", borderRadius:8, background:"rgba(248,113,113,0.05)", border:"1px solid rgba(248,113,113,0.2)", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#F87171" }}>{e.id}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:"#FBBF24" }}>Expires: {e.expiry}</span>
                  </div>
                  <div style={{ fontSize:12, color:D.text, fontWeight:600, marginBottom:4 }}>{e.system}</div>
                  <div style={{ fontSize:11, color:D.muted, marginBottom:8 }}>{e.reason}</div>
                  <div style={{ display:"flex", gap:16, fontSize:10, color:D.muted }}>
                    <span>Owner: <span style={{ color:D.text }}>{e.owner}</span></span>
                    <span>Treatment: <span style={{ color:"#34D399" }}>{e.treatment}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="vendors" && (
            <div style={card()}>
              <div style={sL}>Vendor Assessments</div>
              {[
                { vendor:"Okta Inc.",   service:"Identity Provider",     tier:"Critical", assessed:"01-Mar-2026", score:94, status:"Approved" },
                { vendor:"CrowdStrike", service:"EDR Platform",          tier:"High",     assessed:"15-Feb-2026", score:88, status:"Approved" },
                { vendor:"AWS",         service:"Cloud Infrastructure",  tier:"Critical", assessed:"01-Apr-2026", score:91, status:"Approved" },
              ].map((v,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{v.vendor}</div><div style={{ fontSize:10, color:D.muted }}>{v.service} · Tier: {v.tier} · Assessed: {v.assessed}</div></div>
                  <span style={{ fontSize:16, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:v.score>=90?"#34D399":"#FBBF24" }}>{v.score}%</span>
                  <span style={{ fontSize:10, fontWeight:700, color:"#34D399", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.3)", borderRadius:4, padding:"2px 8px" }}>{v.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="ai systems" && (
            <div style={card()}>
              <div style={sL}>AI & ML Systems in Scope</div>
              {[
                { name:"Adaptive Access Policy Engine", vendor:"In-house",   type:"Classification",  risk:"High",   status:"Compliant"     },
                { name:"Anomaly Detection (UEBA)",       vendor:"Splunk UBA", type:"ML Model",        risk:"Medium", status:"Compliant"     },
                { name:"Automated Threat Scoring",       vendor:"In-house",   type:"Scoring Engine",  risk:"Medium", status:"Under Review"  },
              ].map((a,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<2?`1px solid ${D.border}`:"none" }}>
                  <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text, fontWeight:600 }}>{a.name}</div><div style={{ fontSize:10, color:D.muted }}>{a.vendor} · {a.type} · Risk: {a.risk}</div></div>
                  <span style={{ fontSize:10, fontWeight:700, color:a.status==="Compliant"?"#34D399":"#FBBF24", background:a.status==="Compliant"?"rgba(52,211,153,0.1)":"rgba(251,191,36,0.1)", border:`1px solid ${a.status==="Compliant"?"rgba(52,211,153,0.3)":"rgba(251,191,36,0.3)"}`, borderRadius:4, padding:"2px 8px" }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="findings" && (
            <div style={card()}>
              <div style={sL}>Audit Findings</div>
              {findings.map((f,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<findings.length-1?`1px solid ${D.border}`:"none" }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted, minWidth:90 }}>{f.id}</span>
                  <div style={{ flex:1, fontSize:12, color:D.text }}>{f.title}</div>
                  <span style={{ fontSize:10, color:D.muted }}>{f.date}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:f.severity==="High"?"#F87171":f.severity==="Medium"?"#FBBF24":f.severity==="Low"?"#34D399":"rgb(147,197,253)" }}>{f.severity}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:f.status==="Open"?"#F87171":f.status==="In Progress"?"#FBBF24":"#34D399", background:f.status==="Open"?"rgba(248,113,113,0.1)":f.status==="In Progress"?"rgba(251,191,36,0.1)":"rgba(52,211,153,0.1)", border:`1px solid ${f.status==="Open"?"rgba(248,113,113,0.3)":f.status==="In Progress"?"rgba(251,191,36,0.3)":"rgba(52,211,153,0.3)"}`, borderRadius:4, padding:"2px 8px" }}>{f.status}</span>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="capa" && (
            <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
              {capas.map((c,i)=>(
                <div key={i} style={card()}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:D.muted }}>{c.id}</span>
                    <div style={{ display:"flex", gap:8 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:c.priority==="High"?"#F87171":"#FBBF24" }}>{c.priority} Priority</span>
                      <span style={{ fontSize:10, fontWeight:700, color:c.status==="In Progress"?"#FBBF24":c.status==="Open"?"#F87171":"#34D399", background:c.status==="In Progress"?"rgba(251,191,36,0.1)":c.status==="Open"?"rgba(248,113,113,0.1)":"rgba(52,211,153,0.1)", border:`1px solid ${c.status==="In Progress"?"rgba(251,191,36,0.3)":c.status==="Open"?"rgba(248,113,113,0.3)":"rgba(52,211,153,0.3)"}`, borderRadius:4, padding:"2px 8px" }}>{c.status}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:13, color:D.text, fontWeight:600, marginBottom:8 }}>{c.title}</div>
                  <div style={{ display:"flex", gap:20, fontSize:11, color:D.muted }}>
                    <span>Owner: <span style={{ color:D.text }}>{c.owner}</span></span>
                    <span>Due: <span style={{ color:"#FBBF24" }}>{c.due}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeCtlTab==="monitoring" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, alignItems:"start" }}>
              <div style={card()}>
                <div style={sL}>Key Performance Indicators</div>
                {[
                  { kpi:"Control Coverage",       value:ctl.status==="implemented"?"100%":"60%",   target:"100%",     on:ctl.status==="implemented" },
                  { kpi:"Evidence Completeness",  value:evidScore+"%",                             target:"90%",      on:evidScore>=90 },
                  { kpi:"Assessment Frequency",   value:"Quarterly",                               target:"Quarterly",on:true },
                  { kpi:"Exception Rate",         value:ctl.status==="implemented"?"0%":"8%",      target:"<5%",      on:ctl.status==="implemented" },
                  { kpi:"Finding Resolution SLA", value:ctl.status==="implemented"?"98%":"72%",    target:"95%",      on:ctl.status==="implemented" },
                ].map((k,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:i<4?`1px solid ${D.border}`:"none" }}>
                    <div style={{ flex:1 }}><div style={{ fontSize:12, color:D.text }}>{k.kpi}</div><div style={{ fontSize:10, color:D.muted }}>Target: {k.target}</div></div>
                    <span style={{ fontSize:15, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:k.on?"#34D399":"#F87171" }}>{k.value}</span>
                    <span style={{ fontSize:9, fontWeight:700, color:k.on?"#34D399":"#F87171" }}>{k.on?"On Target":"Below"}</span>
                  </div>
                ))}
              </div>
              <div style={card()}>
                <div style={sL}>Monitoring Schedule</div>
                <KV k="Continuous Monitoring" v={ctl.status==="implemented"?"Active":"Not Configured"}/>
                <KV k="Automated Alerting"    v={ctl.status==="implemented"?"Enabled":"Pending"}/>
                <KV k="Review Frequency"      v="Quarterly"/>
                <KV k="Last Dashboard Review" v={lastReview}/>
                <KV k="Next Scheduled Review" v="01-Sep-2026"/>
                <KV k="Monitoring Owner"      v={ctl.owner}/>
                <KV k="Escalation Contact"    v={reviewer}/>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  return <div style={{ padding:32, color:D.muted }}>Not found.</div>;
}

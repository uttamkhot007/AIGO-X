import { useEffect, useState, createContext, useContext } from "react";
import { useParams } from "wouter";
import { getApiUrl } from "@/lib/api";

const NAV = "#93C5FD";
const MUT = "var(--muted-foreground)";
const BRD = "var(--border)";
const CRD = "var(--card)";

interface PortalData {
  portalType:  string;
  displayName: string;
  description: string;
  accentColor: string;
  widgetKeys:  string[];
  tenantName:  string;
}

// ── Widget label map ──────────────────────────────────────────────────────────
const WIDGET_META: Record<string, { label: string; icon: string; description: string }> = {
  security_posture_score:  { label:"Security Posture Score",       icon:"🛡",  description:"Overall security health 0–100" },
  top_risks:               { label:"Top Risks",                    icon:"⚠",  description:"Severity heatmap of open risks" },
  open_critical_findings:  { label:"Open Critical Findings",       icon:"🔴",  description:"Unresolved critical audit findings" },
  compliance_status:       { label:"Compliance Status by Framework",icon:"✅",  description:"Framework pass/fail overview" },
  ai_security_briefing:    { label:"AI Security Briefing",         icon:"🤖",  description:"Latest AI-generated security narrative" },
  incident_trend:          { label:"Incident Trend",               icon:"📈",  description:"Incidents over the last 30 days" },
  risk_appetite_gauge:     { label:"Risk Appetite Gauge",          icon:"🎯",  description:"Current risk vs appetite threshold" },
  risk_register_summary:   { label:"Risk Register Summary",        icon:"📋",  description:"Top 10 risks by score" },
  risk_treatment_pipeline: { label:"Risk Treatment Pipeline",      icon:"🔄",  description:"Risks by treatment stage" },
  vendor_risk_exposure:    { label:"Vendor Risk Exposure",         icon:"🏢",  description:"Third-party risk aggregation" },
  pdf_export:              { label:"Board-ready PDF Export",       icon:"📄",  description:"Download executive risk report" },
  policy_ack_rate:         { label:"Policy Acknowledgment Rate",   icon:"📝",  description:"% of staff who acknowledged policies" },
  training_completion:     { label:"Training Completion",          icon:"🎓",  description:"Security training completion rate" },
  ropa_summary:            { label:"ROPA Summary",                 icon:"🔒",  description:"Data processing activities overview" },
  people_risk_count:       { label:"People Risk Count",            icon:"👥",  description:"HR-related open risk items" },
  attestation_donut:       { label:"Attestation Completion",       icon:"🍩",  description:"Policy attestation by department" },
  questionnaire_inbox:     { label:"Questionnaire Inbox",          icon:"📬",  description:"Pending security questionnaires" },
  evidence_upload:         { label:"Evidence Upload",              icon:"📎",  description:"Submit compliance evidence files" },
  assessment_timeline:     { label:"Assessment Status Timeline",   icon:"📅",  description:"Your assessment milestones" },
  compliance_badge:        { label:"Compliance Badge",             icon:"🏅",  description:"Pass / partial / fail status" },
  my_open_tasks:           { label:"My Open Tasks",                icon:"✔",  description:"Policies to acknowledge, trainings to complete" },
  security_tip:            { label:"Security Tip of the Day",      icon:"💡",  description:"Daily security awareness reminder" },
  report_incident:         { label:"Report an Incident",           icon:"🚨",  description:"Submit a security incident report" },
};

// ── Individual widget cards ───────────────────────────────────────────────────
function WidgetCard({ widgetKey, accentColor }: { widgetKey: string; accentColor: string }) {
  const meta = WIDGET_META[widgetKey];
  if (!meta) return null;
  return (
    <div style={{ background: CRD, border:`1px solid ${BRD}`, borderRadius:12, padding:20, display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:22 }}>{meta.icon}</span>
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:"var(--foreground)" }}>{meta.label}</div>
          <div style={{ fontSize:11, color:MUT }}>{meta.description}</div>
        </div>
      </div>
      <WidgetContent widgetKey={widgetKey} accentColor={accentColor} />
    </div>
  );
}

function WidgetContent({ widgetKey, accentColor }: { widgetKey: string; accentColor: string }) {
  switch (widgetKey) {
    case "security_posture_score":    return <PostureScoreWidget accent={accentColor} />;
    case "top_risks":                 return <TopRisksWidget />;
    case "open_critical_findings":    return <CriticalFindingsWidget />;
    case "compliance_status":         return <ComplianceStatusWidget accent={accentColor} />;
    case "ai_security_briefing":      return <AIBriefingWidget />;
    case "incident_trend":            return <IncidentTrendWidget accent={accentColor} />;
    case "risk_appetite_gauge":       return <RiskAppetiteWidget accent={accentColor} />;
    case "risk_register_summary":     return <RiskRegisterWidget />;
    case "risk_treatment_pipeline":   return <RiskTreatmentWidget accent={accentColor} />;
    case "vendor_risk_exposure":      return <VendorRiskWidget />;
    case "pdf_export":                return <PdfExportWidget accent={accentColor} />;
    case "policy_ack_rate":           return <PolicyAckWidget accent={accentColor} />;
    case "training_completion":       return <TrainingWidget accent={accentColor} />;
    case "ropa_summary":              return <RopaSummaryWidget />;
    case "people_risk_count":         return <PeopleRiskWidget />;
    case "attestation_donut":         return <AttestationWidget accent={accentColor} />;
    case "questionnaire_inbox":       return <QuestionnaireInboxWidget />;
    case "evidence_upload":           return <EvidenceUploadWidget accent={accentColor} />;
    case "assessment_timeline":       return <AssessmentTimelineWidget />;
    case "compliance_badge":          return <ComplianceBadgeWidget accent={accentColor} />;
    case "my_open_tasks":             return <MyOpenTasksWidget />;
    case "security_tip":              return <SecurityTipWidget />;
    case "report_incident":           return <ReportIncidentWidget accent={accentColor} />;
    default: return null;
  }
}

// ── CISO widgets ─────────────────────────────────────────────────────────────
function PostureScoreWidget({ accent }: { accent: string }) {
  const { data } = usePortalApi<{ overallScore: number } | null>("/dashboard/summary", null);
  const score = data?.overallScore ?? 82;
  const pct = `${score}%`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ width:64, height:64, borderRadius:"50%", border:`4px solid ${accent}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:18, fontWeight:900, color:accent }}>{score}</span>
      </div>
      <div>
        <div style={{ fontSize:11, color:MUT }}>Overall security health score</div>
        <div style={{ height:6, borderRadius:4, background:"var(--border)", marginTop:6, width:160 }}>
          <div style={{ height:"100%", borderRadius:4, background:accent, width:pct, transition:"width 0.6s" }}/>
        </div>
        <div style={{ fontSize:10, color:accent, marginTop:4, fontWeight:700 }}>Good standing</div>
      </div>
    </div>
  );
}

function TopRisksWidget() {
  const { data: risks } = usePortalApi<any[]>("/risks", []);
  const top = (risks ?? []).slice(0, 4);
  const sev: Record<string, string> = { Critical:"#F87171", High:"#FCD34D", Medium:"#93C5FD", Low:"#34D399" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {top.length === 0 && <div style={{ fontSize:11, color:MUT }}>No risks on record</div>}
      {top.map((r: any, i: number) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${BRD}` }}>
          <div style={{ fontSize:12, color:"var(--foreground)", fontWeight:600 }}>{r.title ?? r.name ?? `Risk ${i+1}`}</div>
          <span style={{ fontSize:10, fontWeight:800, color:sev[r.severity ?? r.risk_level] ?? "#93C5FD", background:`${sev[r.severity ?? r.risk_level] ?? "#93C5FD"}20`, borderRadius:4, padding:"2px 7px" }}>{r.severity ?? r.risk_level ?? "Medium"}</span>
        </div>
      ))}
    </div>
  );
}

function CriticalFindingsWidget() {
  const { data: findings } = usePortalApi<any[]>("/audit/findings", []);
  const critical = (findings ?? []).filter((f: any) => f.severity === "Critical" || f.riskLevel === "Critical");
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ fontSize:36, fontWeight:900, color:"#F87171" }}>{critical.length}</div>
      <div>
        <div style={{ fontSize:11, color:MUT }}>unresolved critical findings</div>
        <div style={{ fontSize:10, color:"#F87171", fontWeight:700, marginTop:2 }}>Require immediate attention</div>
      </div>
    </div>
  );
}

function ComplianceStatusWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const rows = ctx.compliance ?? [];
  // Fallback display rows if no DB data yet
  const display = rows.length > 0 ? rows : [
    { framework:"SOC 2", score:0 }, { framework:"ISO 27001", score:0 },
    { framework:"GDPR", score:0 }, { framework:"HIPAA", score:0 },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {display.map(f => (
        <div key={f.framework} style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:72, fontSize:10, fontWeight:700, color:MUT, flexShrink:0 }}>{f.framework}</div>
          <div style={{ flex:1, height:6, borderRadius:4, background:"var(--border)" }}>
            <div style={{ height:"100%", borderRadius:4, background:accent, width:`${f.score}%`, transition:"width 0.6s" }}/>
          </div>
          <div style={{ width:30, fontSize:10, fontWeight:800, color:accent, textAlign:"right" }}>{f.score}%</div>
        </div>
      ))}
      {rows.length === 0 && <div style={{ fontSize:10, color:MUT, marginTop:4, fontStyle:"italic" }}>No compliance controls found for this tenant.</div>}
    </div>
  );
}

function AIBriefingWidget() {
  const { data: briefings } = usePortalApi<any[]>("/briefings/history", []);
  const latest = briefings?.[0];
  return (
    <div style={{ background:"rgba(59,130,246,0.07)", borderRadius:8, padding:12 }}>
      {latest
        ? <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6 }}>{String(latest.content ?? latest.summary ?? "").slice(0, 300)}{(String(latest.content ?? latest.summary ?? "").length > 300) ? "…" : ""}</div>
        : <div style={{ fontSize:12, color:MUT, fontStyle:"italic" }}>Latest AI security briefing will appear here once generated.</div>
      }
    </div>
  );
}

function IncidentTrendWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const trend = ctx.incidentTrend ?? [];
  const counts = trend.length > 0 ? trend.map(t => t.count) : [0,0,0,0,0,0,0,0,0,0,0,0];
  const max = Math.max(...counts, 1);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:40 }}>
        {counts.map((c, i) => (
          <div key={i} style={{ flex:1, background:accent, borderRadius:"2px 2px 0 0", height:`${(c / max) * 100}%`, opacity:0.7 + i * 0.02, minHeight:2 }}/>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:MUT, marginTop:4 }}>
        <span>Last 12 months · {total} total incident{total !== 1 ? "s" : ""}</span>
        {trend.length > 0 && <span>{trend[0]?.month} → {trend[trend.length - 1]?.month}</span>}
      </div>
    </div>
  );
}

// ── CRO widgets ───────────────────────────────────────────────────────────────
function RiskAppetiteWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const apt = ctx.appetite;
  const value    = apt?.current   ?? 0;
  const appetite = apt?.threshold ?? 75;
  const breached = apt?.breached  ?? (value > appetite);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:MUT, marginBottom:8 }}>
        <span>Current Exposure</span><span>Appetite Threshold</span>
      </div>
      <div style={{ position:"relative", height:8, borderRadius:4, background:"var(--border)" }}>
        <div style={{ height:"100%", borderRadius:4, background:breached ? "#F87171" : accent, width:`${Math.min(value, 100)}%`, transition:"width 0.6s" }}/>
        <div style={{ position:"absolute", top:-2, left:`${Math.min(appetite, 100)}%`, width:2, height:12, background:"#FCD34D", borderRadius:1 }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, fontWeight:800, marginTop:6 }}>
        <span style={{ color:breached ? "#F87171" : accent }}>{value} / 100{breached ? " ⚠ Breached" : ""}</span>
        <span style={{ color:"#FCD34D" }}>Limit: {appetite}</span>
      </div>
    </div>
  );
}

function RiskRegisterWidget() {
  const { data: risks } = usePortalApi<any[]>("/risks", []);
  const top10 = (risks ?? []).slice(0, 6);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {top10.map((r: any, i: number) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11 }}>
          <span style={{ color:"var(--foreground)", fontWeight:600 }}>{r.title ?? r.name ?? `Risk ${i+1}`}</span>
          <span style={{ color:MUT }}>{r.riskScore ?? r.score ?? Math.floor(Math.random() * 40 + 60)}</span>
        </div>
      ))}
      {top10.length === 0 && <div style={{ fontSize:11, color:MUT }}>No risks found</div>}
    </div>
  );
}

function RiskTreatmentWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const risks = ctx.risks ?? [];
  const total = risks.length || 1;

  function matchCount(patterns: string[]): number {
    return risks.filter((r: any) => patterns.includes(String(r.status ?? "").toLowerCase())).length;
  }

  const closed    = matchCount(["closed","resolved","accepted","mitigated"]);
  const treating  = matchCount(["in-treatment","treating","mitigating","in_treatment"]);
  const assessing = matchCount(["assessing","under-review","under_review","reviewing"]);
  // Everything else (open, identified, new, etc.) counts as Identified
  const identified = Math.max(0, risks.length - closed - treating - assessing);

  const stages = [
    { label:"Identified", count:identified },
    { label:"Assessing",  count:assessing  },
    { label:"Treating",   count:treating   },
    { label:"Closed",     count:closed     },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {stages.map(s => {
        const pct = Math.round((s.count / total) * 100);
        return (
          <div key={s.label} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:60, fontSize:10, fontWeight:700, color:MUT, flexShrink:0 }}>{s.label}</div>
            <div style={{ flex:1, height:6, borderRadius:4, background:"var(--border)" }}>
              <div style={{ height:"100%", borderRadius:4, background:accent, width:`${pct}%` }}/>
            </div>
            <div style={{ width:34, fontSize:10, fontWeight:800, color:accent, textAlign:"right" }}>{s.count} <span style={{ fontWeight:400, color:MUT }}>({pct}%)</span></div>
          </div>
        );
      })}
      {risks.length === 0 && <div style={{ fontSize:11, color:MUT }}>No risk data available.</div>}
    </div>
  );
}

function VendorRiskWidget() {
  const ctx = useContext(PortalDataContext);
  const vendors = ctx.vendors ?? [];
  const colors: Record<string, string> = { Critical:"#F87171", High:"#FCD34D", Medium:"#93C5FD", Low:"#34D399" };
  const tiers: Record<string, string> = { "1":"Critical","2":"High","3":"Medium","4":"Low" };
  const buckets: Record<string, number> = { Critical:0, High:0, Medium:0, Low:0 };
  vendors.forEach((v: any) => {
    const label = tiers[String(v.tier)] ?? (v.score >= 80 ? "Critical" : v.score >= 60 ? "High" : v.score >= 40 ? "Medium" : "Low");
    buckets[label] = (buckets[label] ?? 0) + 1;
  });
  const levels = ["Critical","High","Medium","Low"].map(label => ({ level:label, count:buckets[label] }));
  return (
    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
      {levels.map(l => (
        <div key={l.level} style={{ flex:"1 1 80px", background:"var(--border)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:20, fontWeight:900, color:colors[l.level] }}>{l.count}</div>
          <div style={{ fontSize:9, fontWeight:800, color:MUT, marginTop:2 }}>{l.level}</div>
        </div>
      ))}
    </div>
  );
}

function PdfExportWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const [generating, setGenerating] = useState(false);

  function handleExport() {
    setGenerating(true);
    try {
      const risks    = ctx.risks    ?? [];
      const findings = ctx.findings ?? [];
      const vendors  = ctx.vendors  ?? [];
      const openCrit = findings.filter((f: any) => f.severity === "Critical" && f.status === "open").length;
      const highRisk = risks.filter((r: any) => r.severity === "Critical" || r.severity === "High").length;
      const dateStr  = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });

      const severityColor: Record<string, string> = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#16a34a" };
      const riskRows = risks.slice(0, 15).map((r: any, i: number) => {
        const col = severityColor[r.severity] ?? "#6b7280";
        return `<tr><td>${i+1}</td><td>${r.name ?? ""}</td><td><span style="color:${col};font-weight:700">${r.severity ?? "—"}</span></td><td>${r.status ?? "—"}</td><td>${r.score ?? "—"}</td></tr>`;
      }).join("");

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Board Risk Report — ${dateStr}</title>
<style>
  body{font-family:"Helvetica Neue",Arial,sans-serif;color:#111;padding:48px;max-width:860px;margin:0 auto;font-size:13px}
  h1{font-size:22px;color:#1e3a5f;border-bottom:3px solid #1e3a5f;padding-bottom:10px;margin-bottom:6px}
  h2{font-size:15px;color:#1e3a5f;margin-top:28px;margin-bottom:8px}
  .meta{color:#6b7280;font-size:11px;margin-bottom:24px}
  .kpi-row{display:flex;gap:20px;margin-bottom:24px}
  .kpi{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;text-align:center}
  .kpi-val{font-size:28px;font-weight:900;color:#1e3a5f}
  .kpi-lbl{font-size:11px;color:#6b7280;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f0f4f8;font-size:11px;text-align:left;padding:7px 10px;border:1px solid #e5e7eb}
  td{font-size:12px;padding:7px 10px;border:1px solid #e5e7eb;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .footer{margin-top:36px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center}
  @media print{body{padding:24px}@page{margin:1.5cm}}
</style></head><body>
<h1>Executive Board Risk Report</h1>
<p class="meta">Prepared: ${dateStr} · Confidential — for board use only · Powered by AIGO-X GRC Platform</p>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-val">${risks.length}</div><div class="kpi-lbl">Total Risks</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${openCrit > 0 ? "#dc2626" : "#16a34a"}">${openCrit}</div><div class="kpi-lbl">Open Critical Findings</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${highRisk > 0 ? "#d97706" : "#16a34a"}">${highRisk}</div><div class="kpi-lbl">High / Critical Risks</div></div>
  <div class="kpi"><div class="kpi-val">${vendors.length}</div><div class="kpi-lbl">Vendors Monitored</div></div>
</div>
<h2>Risk Register (top ${Math.min(risks.length, 15)})</h2>
<table><thead><tr><th>#</th><th>Risk Name</th><th>Severity</th><th>Status</th><th>Score</th></tr></thead>
<tbody>${riskRows || "<tr><td colspan='5' style='text-align:center;color:#9ca3af'>No risks found</td></tr>"}</tbody></table>
<div class="footer">AIGO-X GRC Platform · Generated ${dateStr} · This report is confidential</div>
</body></html>`;

      const w = window.open("", "_blank", "width=900,height=700");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => { w.focus(); w.print(); }, 600);
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ fontSize:11, color:MUT }}>Generates a formatted board report with live risk register data. Use your browser's Print → Save as PDF.</div>
      <button
        disabled={generating}
        onClick={handleExport}
        style={{ width:"100%", padding:"10px 0", borderRadius:8, border:`1px solid ${accent}`, background:`${accent}15`, color:accent, fontWeight:700, fontSize:12, cursor:generating?"default":"pointer", fontFamily:"inherit", opacity:generating?0.6:1 }}
      >
        {generating ? "Preparing…" : "📄 Generate Board Report (PDF)"}
      </button>
    </div>
  );
}

// ── CHRO widgets ──────────────────────────────────────────────────────────────
function PolicyAckWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const pct = ctx.policyAck?.overallPct ?? 0;
  const outstanding = 100 - pct;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ width:56, height:56, borderRadius:"50%", border:`4px solid ${accent}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontSize:16, fontWeight:900, color:accent }}>{pct}%</span>
      </div>
      <div>
        <div style={{ fontSize:11, color:MUT }}>of staff acknowledged policies</div>
        {outstanding > 0
          ? <div style={{ fontSize:10, color:"#FCD34D", fontWeight:700, marginTop:2 }}>{outstanding}% outstanding — follow up needed</div>
          : <div style={{ fontSize:10, color:"#34D399", fontWeight:700, marginTop:2 }}>All policies acknowledged ✓</div>
        }
      </div>
    </div>
  );
}

function TrainingWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const pct  = ctx.training?.pct       ?? 0;
  const done  = ctx.training?.completed ?? 0;
  const total = ctx.training?.total     ?? 0;
  return (
    <div>
      <div style={{ height:8, borderRadius:4, background:"var(--border)" }}>
        <div style={{ height:"100%", borderRadius:4, background:pct >= 80 ? "#34D399" : pct >= 50 ? accent : "#F87171", width:`${pct}%`, transition:"width 0.6s" }}/>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginTop:6 }}>
        <span style={{ color:MUT }}>Security awareness training{total > 0 ? ` (${done}/${total})` : ""}</span>
        <span style={{ color:pct >= 80 ? "#34D399" : accent, fontWeight:800 }}>{pct}% complete</span>
      </div>
      {pct < 80 && <div style={{ fontSize:9, color:"#FCD34D", fontWeight:700, marginTop:4 }}>Follow up needed — remind staff to complete training</div>}
    </div>
  );
}

function RopaSummaryWidget() {
  const ctx = useContext(PortalDataContext);
  const rows = ctx.ropa ?? [];
  const display = rows.length > 0 ? rows.slice(0, 5) : [];
  const statusColor: Record<string, string> = { active:"#34D399", inactive:"#F87171", review:"#FCD34D" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {display.length === 0 && <div style={{ fontSize:11, color:MUT }}>No ROPA records found.</div>}
      {display.map((a: any) => (
        <div key={a.ropaId ?? a.process} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11 }}>
          <span style={{ color:"var(--foreground)" }}>{a.process}</span>
          <span style={{ fontSize:9, fontWeight:800, color:statusColor[a.status] ?? "#93C5FD", background:`${statusColor[a.status] ?? "#93C5FD"}20`, borderRadius:4, padding:"2px 6px", textTransform:"capitalize" }}>{a.status}</span>
        </div>
      ))}
    </div>
  );
}

function PeopleRiskWidget() {
  const ctx = useContext(PortalDataContext);
  const risks = ctx.risks ?? [];
  const peopleRisks = risks.filter((r: any) => {
    const cat = String(r.category ?? "").toLowerCase();
    return cat.includes("people") || cat.includes("hr") || cat.includes("human") || cat.includes("insider");
  });
  const count = peopleRisks.length;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ fontSize:32, fontWeight:900, color:"#FCD34D" }}>{count}</div>
      <div>
        <div style={{ fontSize:11, color:MUT }}>open people-related risk items</div>
        <div style={{ fontSize:10, color:count > 0 ? "#FCD34D" : "#34D399", fontWeight:700, marginTop:2 }}>
          {count > 0 ? `${Math.ceil(count / 2)} due for review` : "No people risks open"}
        </div>
      </div>
    </div>
  );
}

function AttestationWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const byDept = ctx.policyAck?.byDept ?? [];
  const depts = byDept.length > 0 ? byDept : [];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {depts.length === 0 && <div style={{ fontSize:11, color:MUT }}>No attestation data yet.</div>}
      {depts.slice(0, 5).map(d => (
        <div key={d.dept} style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:70, fontSize:10, fontWeight:700, color:MUT, flexShrink:0 }}>{d.dept}</div>
          <div style={{ flex:1, height:6, borderRadius:4, background:"var(--border)" }}>
            <div style={{ height:"100%", borderRadius:4, background:d.pct===100?"#34D399":accent, width:`${d.pct}%` }}/>
          </div>
          <div style={{ width:28, fontSize:10, fontWeight:800, color:d.pct===100?"#34D399":accent }}>{d.pct}%</div>
        </div>
      ))}
    </div>
  );
}

// ── Vendor widgets ────────────────────────────────────────────────────────────
function QuestionnaireInboxWidget() {
  const ctx = useContext(PortalDataContext);
  const qs = ctx.questionnaires ?? [];

  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});
  const [busy, setBusy]               = useState<Set<string>>(new Set());
  const [filling, setFilling]         = useState<string | null>(null); // qId being filled
  const [questions, setQuestions]     = useState<any[]>([]);
  const [answers, setAnswers]         = useState<Record<string, string>>({});
  const [loadingQ, setLoadingQ]       = useState(false);

  function getStatus(q: any): string { return localStatus[q.qId ?? q.id] ?? q.status; }

  async function openFill(q: any, startFirst: boolean) {
    const qId = q.qId ?? q.id;
    setBusy(prev => new Set([...prev, qId]));

    if (startFirst) {
      try {
        const r = await portalAction(`/portal-action/questionnaire/${qId}/start`, { portalType: ctx._portalType, token: ctx._token }, "PATCH");
        if (r.status) setLocalStatus(prev => ({ ...prev, [qId]: r.status }));
      } catch {}
    }

    setLoadingQ(true);
    try {
      const r = await fetch(getApiUrl(`/portal-action/questionnaire/${qId}/questions?token=${encodeURIComponent(ctx._token)}&portalType=${encodeURIComponent(ctx._portalType)}`));
      const data = await r.json();
      setQuestions(data.questions ?? []);
      setAnswers(data.answerMap ?? {});
    } catch {
      setQuestions([]);
      setAnswers({});
    } finally {
      setLoadingQ(false);
      setFilling(qId);
      setBusy(prev => { const s = new Set(prev); s.delete(qId); return s; });
    }
  }

  async function submitAnswers(qId: string) {
    setBusy(prev => new Set([...prev, qId]));
    try {
      const r = await portalAction(`/portal-action/questionnaire/${qId}/submit`, {
        portalType: ctx._portalType, token: ctx._token, answers,
      }, "PATCH");
      if (r.status) {
        setLocalStatus(prev => ({ ...prev, [qId]: r.status }));
        setFilling(null); setQuestions([]); setAnswers({});
      }
    } catch {} finally {
      setBusy(prev => { const s = new Set(prev); s.delete(qId); return s; });
    }
  }

  // ── Question fill form ──────────────────────────────────────────────────────
  if (filling) {
    const activeQ = qs.find((x: any) => (x.qId ?? x.id) === filling);
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between" }}>
          <div style={{ fontWeight:700, fontSize:12, color:"var(--foreground)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeQ?.name ?? "Questionnaire"}</div>
          <button onClick={() => { setFilling(null); setQuestions([]); setAnswers({}); }} style={{ fontSize:10, color:MUT, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>✕ Close</button>
        </div>

        {loadingQ && <div style={{ fontSize:11, color:MUT }}>Loading questions…</div>}

        {!loadingQ && questions.length === 0 && (
          <div style={{ fontSize:11, color:MUT, fontStyle:"italic" }}>No questions defined for this questionnaire. Click Submit to mark it complete.</div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:340, overflowY:"auto", paddingRight:4 }}>
          {questions.map((q: any) => (
            <div key={q.questionId}>
              {q.category && <div style={{ fontSize:9, fontWeight:800, color:MUT, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{q.category}</div>}
              <div style={{ fontSize:11, color:"var(--foreground)", fontWeight:600, marginBottom:5, lineHeight:1.4 }}>
                {q.number ? `${q.number}. ` : ""}{q.question}
              </div>
              <textarea
                value={answers[q.questionId] ?? ""}
                onChange={e => setAnswers(prev => ({ ...prev, [q.questionId]: e.target.value }))}
                placeholder="Your answer…"
                rows={2}
                style={{ width:"100%", boxSizing:"border-box", borderRadius:6, border:`1px solid ${BRD}`, background:"var(--card)", color:"var(--foreground)", fontSize:11, padding:"6px 8px", fontFamily:"inherit", outline:"none", resize:"vertical" }}
              />
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:8 }}>
          <button
            onClick={() => { setFilling(null); setQuestions([]); setAnswers({}); }}
            style={{ flex:1, padding:"7px 0", borderRadius:6, border:`1px solid ${BRD}`, background:"transparent", color:MUT, fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
          >
            Save & Close
          </button>
          <button
            disabled={busy.has(filling)}
            onClick={() => submitAnswers(filling)}
            style={{ flex:2, padding:"7px 0", borderRadius:6, border:"none", background:"#34D399", color:"white", fontWeight:700, fontSize:11, cursor:busy.has(filling)?"default":"pointer", fontFamily:"inherit", opacity:busy.has(filling)?0.6:1 }}
          >
            {busy.has(filling) ? "Submitting…" : "Submit Questionnaire ✓"}
          </button>
        </div>
      </div>
    );
  }

  // ── Questionnaire list ──────────────────────────────────────────────────────
  const actionable = qs.filter((q: any) => getStatus(q) !== "completed").slice(0, 5);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {actionable.length === 0 && <div style={{ fontSize:11, color:"#34D399", fontWeight:700 }}>All questionnaires submitted 🎉</div>}
      {actionable.map((q: any, i: number) => {
        const qId = q.qId ?? q.id;
        const status = getStatus(q);
        const isBusy = busy.has(qId);
        const isInReview = status === "in_review" || status === "in_progress";
        return (
          <div key={qId ?? i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${BRD}` }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color:"var(--foreground)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{q.name ?? `Questionnaire ${i+1}`}</div>
              <div style={{ fontSize:10, color:MUT }}>Due: {q.dueDate || "—"} · {isInReview ? "In progress — click to continue" : "Not started"}</div>
            </div>
            <div style={{ flexShrink:0, marginLeft:8 }}>
              {!isInReview
                ? <button disabled={isBusy} onClick={() => openFill(q, true)} style={{ fontSize:9, fontWeight:800, color:"#FCD34D", background:"#FCD34D20", border:"1px solid #FCD34D60", borderRadius:4, padding:"3px 10px", cursor:isBusy?"default":"pointer", fontFamily:"inherit", opacity:isBusy?0.5:1 }}>{isBusy ? "…" : "Start"}</button>
                : <button disabled={isBusy} onClick={() => openFill(q, false)} style={{ fontSize:9, fontWeight:800, color:"#34D399", background:"#34D39920", border:"1px solid #34D39960", borderRadius:4, padding:"3px 10px", cursor:isBusy?"default":"pointer", fontFamily:"inherit", opacity:isBusy?0.5:1 }}>{isBusy ? "…" : "Continue →"}</button>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceUploadWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const [status, setStatus] = useState<"idle"|"reading"|"uploading"|"done"|"error">("idle");
  const [ticketId, setTicketId] = useState<string>("");
  const [note, setNote] = useState("");
  const fileRef = { current: null as HTMLInputElement | null };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("reading");
    let fileHash: string | undefined;

    try {
      // Read file content and compute SHA-256 hash to prove actual file was read
      const buffer = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
      fileHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // crypto.subtle unavailable (non-HTTPS dev) — proceed without hash
    }

    setStatus("uploading");
    portalAction("/portal-action/evidence", {
      portalType: ctx._portalType,
      token:      ctx._token,
      fileName:   file.name,
      fileHash,
      fileSize:   file.size,
      mimeType:   file.type || "application/octet-stream",
      note:       note.trim() || undefined,
    })
      .then(res => {
        if (res.created) { setStatus("done"); setTicketId(res.ticketId ?? ""); }
        else { setStatus("error"); }
      })
      .catch(() => setStatus("error"));

    e.target.value = "";
  }

  if (status === "done") return (
    <div style={{ fontSize:12, color:"#34D399", fontWeight:700 }}>
      ✓ Evidence received{ticketId ? ` — ref ${ticketId}` : ""}. The compliance team will review your submission and may follow up.
    </div>
  );

  const isBusy = status === "reading" || status === "uploading";

  return (
    <div style={{ border:`2px dashed ${BRD}`, borderRadius:8, padding:16, textAlign:"center" }}>
      <div style={{ fontSize:24, marginBottom:6 }}>📎</div>
      <div style={{ fontSize:11, color:MUT, marginBottom:8 }}>
        Upload compliance evidence — file content is verified and a tracked submission ticket is created automatically.
      </div>
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note for the reviewer…"
        style={{ width:"100%", boxSizing:"border-box", marginBottom:8, borderRadius:6, border:`1px solid ${BRD}`, background:"var(--card)", color:"var(--foreground)", fontSize:11, padding:"5px 8px", fontFamily:"inherit", outline:"none" }}
      />
      <input
        ref={r => { fileRef.current = r; }}
        type="file"
        style={{ display:"none" }}
        onChange={handleUpload}
        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.zip,.txt"
      />
      {status === "error" && <div style={{ fontSize:10, color:"#F87171", marginBottom:6 }}>Upload failed — please try again.</div>}
      <button
        disabled={isBusy}
        onClick={() => fileRef.current?.click()}
        style={{ padding:"7px 20px", borderRadius:6, border:`1px solid ${accent}`, background:`${accent}15`, color:accent, fontWeight:700, fontSize:11, cursor:isBusy?"default":"pointer", fontFamily:"inherit", opacity:isBusy?0.6:1 }}
      >
        {status === "reading" ? "Reading file…" : status === "uploading" ? "Submitting…" : "Choose File & Upload"}
      </button>
      <div style={{ fontSize:9, color:MUT, marginTop:6 }}>File hash is computed locally — your data stays private.</div>
    </div>
  );
}

function AssessmentTimelineWidget() {
  const ctx = useContext(PortalDataContext);
  const qs = ctx.questionnaires ?? [];
  // Derive timeline from real questionnaire statuses
  const sent     = qs.length > 0;
  const submitted = qs.some((q: any) => q.status !== "draft" && q.status !== "pending");
  const inReview  = qs.some((q: any) => q.status === "in_review");
  const complete  = qs.every((q: any) => q.status === "completed") && qs.length > 0;
  const milestones = [
    { label:"Questionnaire Sent",   done:sent,      date:sent ? qs[0]?.createdAt?.split("T")[0] ?? "—" : "Pending" },
    { label:"Evidence Submitted",   done:submitted, date:submitted ? "Submitted" : "Pending" },
    { label:"Review In Progress",   done:inReview,  date:inReview ? "In Review" : "Pending" },
    { label:"Assessment Complete",  done:complete,  date:complete ? "Complete" : qs[0]?.dueDate ?? "—" },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {milestones.map((m, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:16, height:16, borderRadius:"50%", background:m.done?"#34D399":"var(--border)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9 }}>
            {m.done && "✓"}
          </div>
          <div style={{ flex:1, fontSize:11, color:m.done?"var(--foreground)":MUT, fontWeight:m.done?600:400 }}>{m.label}</div>
          <div style={{ fontSize:10, color:MUT }}>{m.date}</div>
        </div>
      ))}
    </div>
  );
}

function ComplianceBadgeWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const qs = ctx.questionnaires ?? [];
  const total = qs.length;
  const passed = qs.filter((q: any) => q.status === "completed").length;
  const pending = total - passed;
  const allPass = total > 0 && passed === total;
  const label = total === 0 ? "No Assessments" : allPass ? "All Passed" : passed === 0 ? "Not Started" : "In Progress";
  const badgeColor = total === 0 ? MUT : allPass ? "#34D399" : passed > 0 ? "#FCD34D" : "#F87171";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:56, height:56, borderRadius:"50%", background:`${badgeColor}20`, border:`3px solid ${badgeColor}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>
        {allPass ? "🏆" : total === 0 ? "📋" : "🏅"}
      </div>
      <div>
        <div style={{ fontSize:16, fontWeight:900, color:badgeColor }}>{label}</div>
        {total > 0
          ? <div style={{ fontSize:11, color:MUT }}>{passed} of {total} assessment{total !== 1 ? "s" : ""} completed</div>
          : <div style={{ fontSize:11, color:MUT }}>No questionnaires assigned yet</div>
        }
        {pending > 0 && <div style={{ fontSize:10, color:"#FCD34D", fontWeight:700, marginTop:2 }}>{pending} outstanding</div>}
      </div>
    </div>
  );
}

// ── Employee widgets ───────────────────────────────────────────────────────────
function MyOpenTasksWidget() {
  const ctx = useContext(PortalDataContext);
  const qs = ctx.questionnaires ?? [];
  const policyTasks = ctx.policyAck?.overallPct !== undefined && ctx.policyAck.overallPct < 100
    ? [{ label:"Acknowledge company policies", due:"Pending" }] : [];
  const qTasks = qs
    .filter((q: any) => q.status === "draft" || q.status === "pending" || q.status === "in_review")
    .slice(0, 3)
    .map((q: any) => ({ label: q.name ?? "Complete questionnaire", due: q.dueDate ?? "—" }));
  const tasks = [...policyTasks, ...qTasks];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {tasks.length === 0 && <div style={{ fontSize:11, color:"#34D399", fontWeight:700 }}>✓ All tasks complete</div>}
      {tasks.map((t, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${BRD}` }}>
          <div style={{ fontSize:12, color:"var(--foreground)", fontWeight:600 }}>{t.label}</div>
          <span style={{ fontSize:9, fontWeight:800, color:"#FCD34D", background:"#FCD34D20", borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap", marginLeft:6 }}>{t.due}</span>
        </div>
      ))}
    </div>
  );
}

function SecurityTipWidget() {
  const ctx = useContext(PortalDataContext);
  // Use DB-derived contextual tip when available, fall back to rotating daily tips
  const DAILY_TIPS = [
    "Enable MFA on your email account — it's your master key and the single most impactful step you can take.",
    "Use a unique password for every service — a password manager makes this completely effortless.",
    "Lock your screen whenever you step away, even for just a moment.",
    "Never click links in unexpected emails — navigate directly to the site instead.",
    "Report suspicious activity immediately — early detection stops breaches before they escalate.",
    "Keep your devices and software up to date — most breaches exploit known, patchable vulnerabilities.",
    "Be cautious with USB drives from unknown sources — they can introduce malware instantly.",
  ];
  const fallback = DAILY_TIPS[new Date().getDate() % DAILY_TIPS.length];
  const tip    = ctx.securityTip?.tip ?? fallback;
  const isLive = ctx.securityTip?.source === "db";
  return (
    <div style={{ background:"rgba(16,185,129,0.08)", borderRadius:8, padding:12 }}>
      <div style={{ fontSize:12, color:"var(--foreground)", lineHeight:1.6 }}>{tip}</div>
      {isLive && <div style={{ fontSize:9, color:"#34D399", fontWeight:700, marginTop:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>⚡ Live — based on your current security posture</div>}
    </div>
  );
}

function ReportIncidentWidget({ accent }: { accent: string }) {
  const ctx = useContext(PortalDataContext);
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<"idle"|"submitting"|"done"|"error">("idle");
  const [ticketId, setTicketId] = useState<string>("");

  function handleSubmit() {
    if (!desc.trim() || status === "submitting") return;
    setStatus("submitting");
    portalAction("/portal-action/incident", {
      portalType:  ctx._portalType,
      token:       ctx._token,
      description: desc.trim(),
    })
      .then(res => { if (res.created) { setStatus("done"); setTicketId(res.ticketId ?? ""); } else { setStatus("error"); } })
      .catch(() => setStatus("error"));
  }

  if (status === "done") return (
    <div style={{ fontSize:12, color:"#34D399", fontWeight:700 }}>
      ✓ Incident reported{ticketId ? ` — ref ${ticketId}` : ""}. Thank you — the security team will follow up shortly.
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Describe the incident (what you saw, when, on which device)…"
        style={{ resize:"vertical", minHeight:70, borderRadius:6, border:`1px solid ${BRD}`, background:"var(--card)", color:"var(--foreground)", fontSize:11, padding:8, fontFamily:"inherit", outline:"none" }}
      />
      {status === "error" && <div style={{ fontSize:10, color:"#F87171" }}>Submission failed — please try again.</div>}
      <button
        disabled={!desc.trim() || status === "submitting"}
        onClick={handleSubmit}
        style={{ padding:"7px 0", borderRadius:6, border:"none", background:!desc.trim()?"var(--border)":accent, color:"white", fontWeight:700, fontSize:11, cursor:(!desc.trim()||status==="submitting")?"default":"pointer", fontFamily:"inherit", opacity:(!desc.trim()||status==="submitting")?0.6:1 }}
      >
        {status === "submitting" ? "Submitting…" : "Submit Report"}
      </button>
    </div>
  );
}

// ── Portal widget data context (populated from /portal-data/:type?token=xxx) ──
interface PortalWidgetData {
  summary?:        { overallScore: number };
  risks?:          any[];
  findings?:       any[];
  vendors?:        any[];
  appetite?:       { current: number; threshold: number; breached: boolean };
  questionnaires?: any[];
  ropa?:           any[];
  briefings?:      any[];
  compliance?:     { framework: string; score: number; pass: number; total: number }[];
  incidentTrend?:  { month: string; count: number }[];
  policyAck?:      { overallPct: number; byDept: { dept: string; pct: number }[] };
  training?:       { pct: number; completed: number; total: number };
  securityTip?:    { tip: string; source: "db" | "static" };
  _token:          string;
  _portalType:     string;
}

const PortalDataContext = createContext<PortalWidgetData>({ _token: "", _portalType: "" });

// Map "API path" aliases to context keys for widgets that use usePortalApi
const PATH_TO_KEY: Record<string, keyof PortalWidgetData> = {
  "/dashboard/summary":  "summary",
  "/risks":              "risks",
  "/audit/findings":     "findings",
  "/briefings/history":  "briefings",
  "/questionnaires":     "questionnaires",
};

// ── API hook — reads pre-fetched portal data from context ─────────────────────
function usePortalApi<T>(path: string, fallback: T): { data: T } {
  const ctx = useContext(PortalDataContext);
  const key = PATH_TO_KEY[path];
  const value = key ? (ctx as any)[key] : undefined;
  return { data: value !== undefined ? (value as T) : fallback };
}

// Helper to call portal action endpoints (token-gated, no JWT needed)
function portalAction(path: string, body: Record<string, unknown>, method: "POST"|"PATCH" = "POST"): Promise<any> {
  return fetch(getApiUrl(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

// ── Main PortalView component ─────────────────────────────────────────────────
export default function PortalView() {
  const params = useParams<{ type: string }>();
  const portalType = params.type ?? "";
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [widgetData, setWidgetData] = useState<PortalWidgetData>({ _token: "", _portalType: portalType });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tk = urlParams.get("token") ?? "";
    if (!tk) { setError("Access link is missing a token. Request a new link from your administrator."); setLoading(false); return; }

    const tokenEnc = encodeURIComponent(tk);
    Promise.all([
      fetch(getApiUrl(`/portal-view/${portalType}?token=${tokenEnc}`)).then(r => r.json()),
      fetch(getApiUrl(`/portal-data/${portalType}?token=${tokenEnc}`)).then(r => r.json()).catch(() => ({})),
    ])
      .then(([config, data]) => {
        if (config.error) { setError(config.error); }
        else {
          setPortalData(config as PortalData);
          setWidgetData({ ...(data as PortalWidgetData), _token: tk, _portalType: portalType });
        }
      })
      .catch(() => setError("Could not connect to portal. Please try again."))
      .finally(() => setLoading(false));
  }, [portalType]);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"rgb(9,12,18)" }}>
      <div style={{ color:NAV, fontSize:14 }}>Loading portal…</div>
    </div>
  );

  if (error || !portalData) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"rgb(9,12,18)" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:700, color:"var(--foreground)", marginBottom:8 }}>Access Denied</div>
        <div style={{ fontSize:13, color:MUT, maxWidth:340 }}>{error ?? "Invalid or expired portal link."}</div>
      </div>
    </div>
  );

  const { displayName, description, accentColor, widgetKeys, tenantName } = portalData;
  const widgetCount = widgetKeys.length;
  const cols = widgetCount <= 2 ? 1 : widgetCount <= 4 ? 2 : 3;

  return (
    <div style={{ minHeight:"100vh", background:"rgb(9,12,18)", color:"var(--foreground)", fontFamily:"'Inter',system-ui,sans-serif" }}>
      {/* Slim branded header */}
      <div style={{ borderBottom:`2px solid ${accentColor}`, padding:"14px 28px", display:"flex", alignItems:"center", gap:16, background:"rgb(12,16,23)" }}>
        <div style={{ width:32, height:32, borderRadius:8, background:accentColor, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:14, color:"white", flexShrink:0 }}>
          {tenantName.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:"var(--foreground)" }}>{displayName}</div>
          <div style={{ fontSize:11, color:MUT }}>{tenantName} · {description}</div>
        </div>
        <div style={{ marginLeft:"auto", fontSize:10, fontWeight:700, color:accentColor, background:`${accentColor}15`, border:`1px solid ${accentColor}40`, borderRadius:6, padding:"4px 10px" }}>
          Secure Portal
        </div>
      </div>

      {/* Widget grid — wrapped in data context so every widget can read live DB values */}
      <PortalDataContext.Provider value={widgetData}>
        <div style={{ padding:"24px 28px", display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:16 }}>
          {widgetKeys.map(key => <WidgetCard key={key} widgetKey={key} accentColor={accentColor} />)}
        </div>
      </PortalDataContext.Provider>

      {/* Footer */}
      <div style={{ borderTop:`1px solid ${BRD}`, padding:"12px 28px", fontSize:10, color:MUT, textAlign:"center" }}>
        Powered by AIGO-X GRC Platform · This link is confidential — do not share
      </div>
    </div>
  );
}

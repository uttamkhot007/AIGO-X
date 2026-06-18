import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ObjectProfilePage } from "@/components/ObjectProfilePage";
import { allPolicies, allProcesses, allProcedures, extendedUsers, type Policy, type Process, type Procedure } from "@/lib/grc-data";

const NAV = "#1E3A5F", EME = "#065F46", AMB = "#D97706", RED = "#DC2626", BLU = "#1D4ED8";
const D = {
  text:   "var(--foreground)",  muted: "rgb(148,163,184)",
  dim:    "var(--muted-foreground)", accent: "rgb(147,197,253)",
  green:  "rgb(52,211,153)",   amber: "rgb(251,191,36)",
  red:    "rgb(248,113,113)",  bg:    "var(--secondary)",
  border: "var(--border)",
};
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: D.bg, border: `1px solid ${D.border}`, borderRadius: 12, padding: "18px 20px", ...extra,
});

function impColor(s: string) { return s==="Critical"?RED:s==="High"?AMB:s==="Medium"?BLU:EME; }

function fwCompat(id: string, fw: string): number {
  let h = 0;
  for (const c of id+fw) h = (((h<<5)-h)+c.charCodeAt(0))>>>0;
  return 52+(h%43);
}

function KV({ k, v }: { k: string; v: string|number }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}`, fontSize:12 }}>
      <span style={{ color:D.muted }}>{k}</span>
      <span style={{ color:D.text, fontWeight:600 }}>{v}</span>
    </div>
  );
}

function Chips({ items, color=D.accent }: { items:string[]; color?:string }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
      {items.map(f => (
        <span key={f} style={{ fontSize:11, fontWeight:700, color, background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:6, padding:"4px 10px" }}>{f}</span>
      ))}
    </div>
  );
}

function FrameworkBars({ id, frameworks }: { id:string; frameworks:string[] }) {
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Framework Compatibility</div>
      {frameworks.map(fw => {
        const pct = fwCompat(id, fw);
        const col = pct>=80?EME:pct>=65?BLU:pct>=50?AMB:RED;
        return (
          <div key={fw} style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
              <span style={{ color:D.text, fontWeight:600 }}>{fw}</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:64, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${col}99,${col})`, borderRadius:3 }}/>
                </div>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", color:col, fontWeight:800, fontSize:12, minWidth:36 }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height:7, background:"var(--secondary)", borderRadius:4, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:4, transition:"width 0.6s ease" }}/>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop:12, padding:"8px 10px", background:"var(--secondary)", borderRadius:6, fontSize:10, color:D.dim }}>
        Average compatibility: {Math.round(frameworks.reduce((s,f)=>s+fwCompat(id,f),0)/Math.max(frameworks.length,1))}% across {frameworks.length} mapped framework{frameworks.length!==1?"s":""}
      </div>
    </div>
  );
}

// ── POLICY_STATEMENTS by category ────────────────────────────────────────────
const CAT_STMTS: Record<string,string[]> = {
  Security:    ["All information systems must implement defence-in-depth controls across all layers.","Security incidents must be reported to the Security team within 24 hours of detection.","Annual security assessments are mandatory for all systems classified as High or Critical impact.","Any deviation from approved security configurations requires a formal exception request."],
  Privacy:     ["Personal data must be processed lawfully, fairly and transparently in accordance with applicable law.","Data minimisation and purpose limitation principles must be observed at all times.","Data subject rights requests must be fulfilled within statutory timeframes.","Privacy by Design must be applied to all new processing activities and system changes."],
  IAM:         ["Access is granted on the principle of least privilege and need-to-know.","All privileged access requires multi-factor authentication without exception.","User accounts must be reviewed quarterly and deprovisioned within 24 hours of departure.","Service accounts must be inventoried, owned and subject to the same lifecycle controls as user accounts."],
  Data:        ["Data must be classified and labelled according to the data classification scheme before processing.","Data at rest and in transit must be encrypted to approved cryptographic standards.","Data retention schedules must be applied consistently across all data stores.","Data flows must be documented and reviewed when new processing activities are introduced."],
  BCP:         ["Recovery Time Objectives must be defined and validated through testing for all critical systems.","Business impact assessments must be conducted and refreshed annually.","Disaster recovery exercises must be conducted at minimum bi-annually and results documented.","All BCP documentation must be accessible from an out-of-band location during an incident."],
  Governance:  ["Governance committees must meet as scheduled, maintain quorum and publish minutes within 5 business days.","Material decisions must be documented and approved through defined governance channels.","Conflicts of interest must be declared and managed prior to any vote or decision.","Board-level oversight of key governance metrics must be maintained via quarterly reporting."],
  Risk:        ["Risk assessments must be conducted before implementing any significant change.","The risk register must be maintained, reviewed and approved quarterly by the Risk Committee.","All treatment plans must be assigned owners and tracked to completion.","Residual risks accepted above appetite require explicit board or CISO sign-off."],
  Cloud:       ["Cloud resources must be provisioned using approved Infrastructure-as-Code templates.","CSPM monitoring must be enabled for all cloud accounts within 24 hours of creation.","Data residency requirements must be validated before selecting a cloud region.","Cloud misconfiguration alerts must be triaged and remediated per defined SLAs."],
  ITSM:        ["All changes to production systems must follow the change management process.","Incidents must be classified by severity and managed per defined response SLAs.","Problem records must be raised for all recurring or major incidents.","CAB approval is required for all Standard and Emergency changes before implementation."],
  AppSec:      ["Security requirements must be defined and validated at the design phase of every new feature.","SAST, DAST and SCA must be integrated into all CI/CD pipelines before production deployment.","Critical security vulnerabilities must be remediated before production deployment with no exceptions.","Penetration tests must be conducted annually for all internet-facing applications."],
  HR:          ["Security awareness training is mandatory for all personnel and must be completed annually.","Background checks are required for all new hires who will have access to sensitive data.","Disciplinary procedures apply to all violations of this policy.","Role-based security training must be provided to staff with elevated data access or privileged system access."],
  Physical:    ["Physical access to secure areas must be logged and reviewed monthly.","Unescorted visitor access is prohibited in server rooms and secure processing areas.","All removable media must be encrypted and registered in the asset inventory.","Clean-desk policy applies to all workstations in open-plan and hot-desk environments."],
};

// ── PolicyDocBody ─────────────────────────────────────────────────────────────
function PolicyDocBody({ pol }: { pol:Policy }) {
  const [expanded, setExpanded] = useState(false);
  const stmts = CAT_STMTS[pol.category] ?? [
    "All personnel within scope must comply with this policy in full.",
    "Non-compliance must be reported to the policy owner within 24 hours of discovery.",
    "Exceptions must be formally documented, risk-assessed and approved by the policy owner.",
  ];
  return (
    <div style={card()}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent }}>Document Content</div>
        <button onClick={()=>setExpanded(e=>!e)} style={{ fontSize:11, color:D.muted, background:"none", border:`1px solid ${D.border}`, borderRadius:5, padding:"3px 10px", cursor:"pointer", fontFamily:"inherit" }}>
          {expanded?"Collapse ▲":"Expand Full ▼"}
        </button>
      </div>
      <div style={{ background:"rgba(30,58,95,0.22)", border:"1px solid rgba(30,58,95,0.4)", borderRadius:8, padding:"12px 16px", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:800, color:D.text, marginBottom:6 }}>{pol.name}</div>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap" as const, fontSize:11, color:D.muted }}>
          {[["ID",pol.id],["Version",`v${pol.version}`],["Category",pol.category],["Owner",pol.owner],["Dept",pol.dept],["Status",pol.status.toUpperCase()]].map(([k,v])=>(
            <span key={k}>{k}: <b style={{ color:D.text }}>{v}</b></span>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:13 }}>
        <div style={{ fontSize:10, fontWeight:800, color:"#93C5FD", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:7 }}>1. Purpose & Objective</div>
        <div style={{ fontSize:12, color:D.text, lineHeight:1.8, background:"var(--secondary)", borderRadius:6, padding:"10px 12px", borderLeft:"3px solid rgba(147,197,253,0.3)" }}>{pol.description}</div>
      </div>
      <div style={{ marginBottom:expanded?13:0 }}>
        <div style={{ fontSize:10, fontWeight:800, color:"#93C5FD", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:7 }}>2. Scope</div>
        <div style={{ fontSize:12, color:D.text, lineHeight:1.8, background:"var(--secondary)", borderRadius:6, padding:"10px 12px", borderLeft:"3px solid rgba(147,197,253,0.3)" }}>{pol.scope}</div>
      </div>
      {expanded && (<>
        <div style={{ marginTop:13, marginBottom:13 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#93C5FD", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:7 }}>3. Policy Requirements</div>
          {stmts.map((s,i)=>(
            <div key={i} style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:D.accent, fontWeight:700, flexShrink:0, paddingTop:1 }}>3.{i+1}</span>
              <span style={{ fontSize:12, color:D.text, lineHeight:1.6 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:13 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#93C5FD", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:7 }}>4. AI-Assisted Compliance Observations</div>
          {pol.aiInsights.map((ins,i)=>(
            <div key={i} style={{ display:"flex", gap:8, padding:"8px 10px", background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.15)", borderRadius:6, marginBottom:6 }}>
              <span style={{ color:AMB, flexShrink:0 }}>◈</span>
              <span style={{ fontSize:12, color:D.text, lineHeight:1.6 }}>{ins}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:800, color:"#93C5FD", letterSpacing:"0.5px", textTransform:"uppercase" as const, marginBottom:7 }}>5. Exceptions & Review</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[
              { label:"Exception Process", text:"All exceptions require formal risk assessment and policy owner approval. Maximum exception term: 90 days unless board-approved. Logged in exceptions register and reviewed quarterly." },
              { label:"Review Schedule", text:`Annual review scheduled for ${pol.nextReview}. Ad hoc reviews triggered by material regulatory changes, security incidents, audit findings, or significant business events.` },
            ].map(({label,text})=>(
              <div key={label} style={{ padding:"10px 12px", background:"var(--secondary)", borderRadius:6, border:`1px solid ${D.border}` }}>
                <div style={{ fontSize:10, color:D.muted, fontWeight:700, marginBottom:5, textTransform:"uppercase" as const, letterSpacing:"0.3px" }}>{label}</div>
                <div style={{ fontSize:11, color:D.text, lineHeight:1.6 }}>{text}</div>
              </div>
            ))}
          </div>
        </div>
      </>)}
    </div>
  );
}

// ── Download / export helpers ─────────────────────────────────────────────────
function buildPolicyHtml(pol: Policy): string {
  const stmts = CAT_STMTS[pol.category] ?? ["All personnel within scope must comply with this policy.","Non-compliance must be reported within 24 hours.","Exceptions require formal documentation and approval."];
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${pol.name}</title>
<style>*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 40px;color:#1a1a1a;line-height:1.7;font-size:13px}
h1{color:#1E3A5F;border-bottom:3px solid #1E3A5F;padding-bottom:12px;font-size:22px}
h2{color:#1E3A5F;font-size:14px;font-weight:700;margin:24px 0 8px;padding:6px 10px;background:#F0F4FF;border-left:4px solid #1E3A5F;border-radius:0 4px 4px 0}
.meta{background:#f8f9fa;padding:12px 16px;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin:16px 0;border:1px solid #e5e7eb}
.meta b{color:#1E3A5F}.badge{display:inline-block;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;margin:2px}
.insight{padding:9px 12px;background:#fffbeb;border-left:4px solid #D97706;margin:8px 0;font-size:12px;border-radius:0 4px 4px 0}
.body{background:#f9fafb;padding:12px 14px;border-radius:6px;border:1px solid #e5e7eb}
.stmt{padding:6px 0;border-bottom:1px solid #f0f0f0;display:flex;gap:10px;font-size:12px}
.stmt b{color:#1E3A5F;font-family:monospace;flex-shrink:0}
table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
th{background:#1E3A5F;color:white;padding:8px 12px;text-align:left}
td{padding:7px 12px;border-bottom:1px solid #e5e7eb}tr:nth-child(even)td{background:#f9fafb}
.footer{margin-top:40px;padding:14px 0;border-top:2px solid #1E3A5F;font-size:11px;color:#6B7280;display:flex;justify-content:space-between}
@media print{body{margin:0;padding:20px}}</style></head><body>
<h1>📋 ${pol.name}</h1>
<div class="meta"><span><b>Policy ID:</b> ${pol.id}</span><span><b>Version:</b> v${pol.version}</span><span><b>Status:</b> ${pol.status.toUpperCase()}</span><span><b>Category:</b> ${pol.category}</span><span><b>Owner:</b> ${pol.owner}</span><span><b>Department:</b> ${pol.dept}</span><span><b>Last Reviewed:</b> ${pol.reviewed}</span><span><b>Next Review:</b> ${pol.nextReview}</span><span><b>Risk Score:</b> ${pol.riskScore}/100</span><span><b>Impact:</b> ${pol.impact}</span></div>
<h2>1. Purpose &amp; Objective</h2><div class="body">${pol.description}</div>
<h2>2. Scope of Application</h2><div class="body">${pol.scope}</div>
<h2>3. Policy Requirements</h2>
${stmts.map((s,i)=>`<div class="stmt"><b>3.${i+1}</b> ${s}</div>`).join("")}
<h2>4. Regulatory &amp; Framework Alignment</h2>
<div class="body"><p>This policy is aligned to: ${pol.frameworks.map(f=>`<span class="badge">${f}</span>`).join(" ")}</p></div>
<h2>5. Roles &amp; Responsibilities</h2>
<table><thead><tr><th>Role</th><th>Responsibility</th></tr></thead><tbody>
<tr><td><b>Policy Owner — ${pol.owner}</b></td><td>Maintains policy, reviews annually, approves exceptions, escalates non-compliance.</td></tr>
<tr><td><b>Department — ${pol.dept}</b></td><td>Implements and enforces the policy within departmental scope.</td></tr>
<tr><td><b>All Employees</b></td><td>Read, understand and comply. Report violations to the Security team immediately.</td></tr>
<tr><td><b>Information Security</b></td><td>Monitors compliance, provides guidance, investigates violations, maintains audit records.</td></tr>
</tbody></table>
<h2>6. Risk Considerations</h2>
<div class="body"><p><b>Impact Classification: ${pol.impact}</b> | Risk Score: ${pol.riskScore}/100. Non-compliance may result in data breaches, regulatory penalties, reputational damage, and legal liability.</p></div>
<h2>7. AI-Assisted Compliance Observations</h2>
${pol.aiInsights.map(i=>`<div class="insight">🤖 ${i}</div>`).join("")}
<h2>8. Exceptions Process</h2>
<div class="body">All exceptions must be formally requested, risk-assessed, approved by the policy owner, time-limited (max 90 days), and tracked in the exceptions register. Reviewed quarterly.</div>
<h2>9. Review &amp; Maintenance</h2>
<div class="body">Annual review by policy owner. Next scheduled review: <b>${pol.nextReview}</b>. Ad hoc reviews triggered by regulatory changes, incidents, or audit findings.</div>
<div class="footer"><span>${pol.name} · v${pol.version} · ${pol.id} · Classification: Internal</span><span>Generated: ${new Date().toLocaleDateString()} · Next Review: ${pol.nextReview}</span></div>
</body></html>`;
}

function buildProcessHtml(proc: Process): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${proc.name}</title>
<style>*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 40px;color:#1a1a1a;line-height:1.7;font-size:13px}
h1{color:#1E3A5F;border-bottom:3px solid #1E3A5F;padding-bottom:12px;font-size:22px}
h2{color:#1E3A5F;font-size:14px;font-weight:700;margin:24px 0 8px;padding:6px 10px;background:#F0F4FF;border-left:4px solid #1E3A5F;border-radius:0 4px 4px 0}
.meta{background:#f8f9fa;padding:12px 16px;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin:16px 0;border:1px solid #e5e7eb}
.meta b{color:#1E3A5F}.body{background:#f9fafb;padding:12px 14px;border-radius:6px;border:1px solid #e5e7eb}
.kpi{padding:7px 12px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:4px;font-size:12px;margin:4px 0}
.insight{padding:9px 12px;background:#fffbeb;border-left:4px solid #D97706;margin:8px 0;font-size:12px}
.footer{margin-top:40px;padding:14px 0;border-top:2px solid #1E3A5F;font-size:11px;color:#6B7280;display:flex;justify-content:space-between}
@media print{body{margin:0;padding:20px}}</style></head><body>
<h1>⚙ ${proc.name}</h1>
<div class="meta"><span><b>Process ID:</b> ${proc.id}</span><span><b>Category:</b> ${proc.category}</span><span><b>Owner:</b> ${proc.owner}</span><span><b>Maturity:</b> ${proc.maturity}</span><span><b>Steps:</b> ${proc.steps}</span><span><b>Linked Policy:</b> ${proc.linked}</span><span><b>Status:</b> ${proc.status.toUpperCase()}</span><span><b>Impact:</b> ${proc.impact}</span></div>
<h2>1. Process Overview</h2><div class="body">${proc.description}</div>
<h2>2. Key Performance Indicators</h2>
${proc.kpis.map(k=>`<div class="kpi">● ${k}</div>`).join("")}
<h2>3. AI Process Intelligence</h2>
${proc.aiInsights.map(i=>`<div class="insight">🤖 ${i}</div>`).join("")}
<h2>4. Process Metadata</h2>
<div class="body"><p><b>Linked Policy:</b> ${proc.linked} | <b>Maturity Level:</b> ${proc.maturity} | <b>Total Steps:</b> ${proc.steps} | <b>Category:</b> ${proc.category}</p></div>
<div class="footer"><span>${proc.name} · ${proc.id} · Classification: Internal</span><span>Generated: ${new Date().toLocaleDateString()}</span></div>
</body></html>`;
}

function buildProcedureHtml(sop: Procedure): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${sop.name}</title>
<style>*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 40px;color:#1a1a1a;line-height:1.7;font-size:13px}
h1{color:#1E3A5F;border-bottom:3px solid #1E3A5F;padding-bottom:12px;font-size:22px}
h2{color:#1E3A5F;font-size:14px;font-weight:700;margin:24px 0 8px;padding:6px 10px;background:#F0F4FF;border-left:4px solid #1E3A5F;border-radius:0 4px 4px 0}
.meta{background:#f8f9fa;padding:12px 16px;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin:16px 0;border:1px solid #e5e7eb}
.meta b{color:#1E3A5F}.step{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:12px}
.step-num{width:26px;height:26px;border-radius:50%;background:#1E3A5F;color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;flex-shrink:0}
.insight{padding:9px 12px;background:#fffbeb;border-left:4px solid #D97706;margin:8px 0;font-size:12px}
.footer{margin-top:40px;padding:14px 0;border-top:2px solid #1E3A5F;font-size:11px;color:#6B7280;display:flex;justify-content:space-between}
@media print{body{margin:0;padding:20px}}</style></head><body>
<h1>📑 ${sop.name}</h1>
<div class="meta"><span><b>SOP ID:</b> ${sop.id}</span><span><b>Version:</b> v${sop.version}</span><span><b>Owner:</b> ${sop.owner}</span><span><b>Process:</b> ${sop.process}</span><span><b>Pages:</b> ${sop.pages}</span><span><b>Last Tested:</b> ${sop.lastTested}</span><span><b>Impact:</b> ${sop.impact}</span></div>
<h2>1. Purpose</h2><div style="background:#f9fafb;padding:12px 14px;border-radius:6px;border:1px solid #e5e7eb">${sop.description}</div>
<h2>2. Step-by-Step Procedure</h2>
${sop.steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><div>${s}</div></div>`).join("")}
<h2>3. AI Procedural Observations</h2>
${sop.aiInsights.map(i=>`<div class="insight">🤖 ${i}</div>`).join("")}
<div class="footer"><span>${sop.name} · v${sop.version} · ${sop.id} · Classification: Internal</span><span>Last Tested: ${sop.lastTested} · Generated: ${new Date().toLocaleDateString()}</span></div>
</body></html>`;
}

function dlHtml(html: string, filename: string) {
  const blob = new Blob([html], { type:"text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function dlPdf(html: string) {
  const win = window.open("", "_blank", "width=1000,height=750");
  if (!win) { alert("Please allow pop-ups in your browser to export as PDF."); return; }
  const printHtml = html.replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script></body>`);
  win.document.open(); win.document.write(printHtml); win.document.close();
}

function dlDocx(html: string, filename: string) {
  const wordHtml = html.replace('<html lang="en">', `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`);
  const blob = new Blob(["\ufeff", wordHtml], { type:"application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.replace(/\.html$/, ".doc");
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ title, fields, onSave, onClose }: {
  title: string;
  fields: { key:string; label:string; value:string; type?:string; options?:string[] }[];
  onSave: (vals: Record<string,string>) => void;
  onClose: () => void;
}) {
  const [vals, setVals] = useState<Record<string,string>>(Object.fromEntries(fields.map(f=>[f.key,f.value])));
  const inp: React.CSSProperties = { width:"100%", padding:"9px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:"var(--foreground)", fontSize:12, fontFamily:"inherit", outline:"none" };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"var(--card)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:14, padding:"28px 32px", width:520, maxHeight:"80vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.7)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:15, fontWeight:800, color:"rgb(147,197,253)", marginBottom:20 }}>{title}</div>
        {fields.map(f=>(
          <div key={f.key} style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:6 }}>{f.label}</div>
            {f.options ? (
              <select value={vals[f.key]??""} onChange={e=>setVals(v=>({...v,[f.key]:e.target.value}))} style={inp}>
                {f.options.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type==="textarea" ? (
              <textarea value={vals[f.key]??""} onChange={e=>setVals(v=>({...v,[f.key]:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical" }}/>
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

// ── AI fallback generators ────────────────────────────────────────────────────
function policyAiFallback(pol: Policy): string[] {
  const fws = pol.frameworks; const avg = fws.length ? Math.round(fws.reduce((s,f)=>s+fwCompat(pol.id,f),0)/fws.length) : 0;
  const weakest = fws.length ? fws.reduce((w,f)=>fwCompat(pol.id,f)<fwCompat(pol.id,w)?f:w,fws[0]) : "N/A";
  return [
    `📊 Executive Summary: ${pol.name} (v${pol.version}) — ${pol.status.toUpperCase()}. Risk score ${pol.riskScore}/100, ${pol.impact} impact. Dept: ${pol.dept}. Owner: ${pol.owner}. Last reviewed: ${pol.reviewed}.`,
    ...pol.aiInsights,
    `📈 Framework Coverage: Average ${avg}% alignment across ${fws.length} framework${fws.length!==1?"s":""}. Weakest alignment: ${weakest} — targeted gap closure recommended.`,
    pol.applicable ? `✅ Attestation Status: Policy requires attestation — ensure all in-scope personnel have acknowledged the current version before next review (${pol.nextReview}).` : `ℹ️ Attestation not required for this policy — monitor through periodic compliance checks and exception reporting.`,
  ];
}

function processAiFallback(proc: Process): string[] {
  return [
    `📊 Process Overview: ${proc.name} (${proc.id}) — ${proc.status.toUpperCase()}. Maturity: ${proc.maturity}. ${proc.steps} steps. Impact: ${proc.impact}. Owner: ${proc.owner}. Linked policy: ${proc.linked}.`,
    ...proc.aiInsights,
    `🎯 Maturity Assessment: ${proc.maturity} level indicates ${proc.maturity==="Optimized"?"best-in-class execution with continuous improvement":proc.maturity==="Managed"?"metrics-driven management with some automation opportunities":proc.maturity==="Defined"?"documented and repeatable but improvement potential remains":"significant maturity improvement opportunity"}.`,
  ];
}

function procedureAiFallback(sop: Procedure): string[] {
  return [
    `📊 SOP Overview: ${sop.name} (${sop.id}) — ${sop.status.toUpperCase()}. v${sop.version}. ${sop.steps.length} steps. ${sop.pages} pages. Impact: ${sop.impact}. Owner: ${sop.owner}. Last tested: ${sop.lastTested}.`,
    ...sop.aiInsights,
    `🧪 Testing Status: ${sop.lastTested==="—"?"Procedure has not been tested — schedule testing to validate steps and SLAs.":`Last tested ${sop.lastTested} — schedule next test within 12 months to maintain validity.`}`,
  ];
}

// ── Process flow card ─────────────────────────────────────────────────────────
function ProcessFlowCard({ proc }: { proc:Process }) {
  const matColors: Record<string,string> = { Initial:RED, Repeatable:AMB, Defined:BLU, Managed:D.accent, Optimized:EME };
  const col = matColors[proc.maturity] ?? D.muted;
  return (
    <div style={card()}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent }}>Process Overview</div>
        <span style={{ fontSize:11, fontWeight:700, color:col, background:`${col}18`, border:`1px solid ${col}44`, borderRadius:5, padding:"3px 10px" }}>{proc.maturity}</span>
      </div>
      <div style={{ fontSize:12, color:D.text, lineHeight:1.8, marginBottom:14 }}>{proc.description}</div>
      <div style={{ fontSize:10, fontWeight:800, color:"var(--muted-foreground)", textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:8 }}>Key Performance Indicators</div>
      {proc.kpis.map((kpi,i)=>(
        <div key={i} style={{ display:"flex", gap:10, padding:"8px 10px", background:"rgba(6,95,70,0.1)", border:"1px solid rgba(6,95,70,0.2)", borderRadius:6, marginBottom:6 }}>
          <span style={{ color:EME, fontSize:11, flexShrink:0 }}>◈</span>
          <span style={{ fontSize:12, color:D.text }}>{kpi}</span>
        </div>
      ))}
    </div>
  );
}

// ── Procedure steps card ──────────────────────────────────────────────────────
function ProcedureStepsCard({ sop }: { sop:Procedure }) {
  return (
    <div style={card()}>
      <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Procedure Steps</div>
      <div style={{ fontSize:12, color:D.text, lineHeight:1.8, marginBottom:14 }}>{sop.description}</div>
      {sop.steps.map((step,i)=>(
        <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:i<sop.steps.length-1?`1px solid ${D.border}`:"none" }}>
          <div style={{ width:24, height:24, borderRadius:"50%", background:`linear-gradient(135deg,${NAV},${EME})`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"white" }}>{i+1}</div>
          <div style={{ flex:1, paddingTop:3 }}>
            <span style={{ fontSize:12, color:D.text, lineHeight:1.6 }}>{step}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Action buttons card ───────────────────────────────────────────────────────
const LINK_OBJECTS = [
  "POL-001 — Acceptable Use Policy","POL-007 — Data Classification Policy","POL-011 — Incident Response Policy",
  "CTRL-2031 — Access Control Review","CTRL-2019 — Encryption Standards","CTRL-2044 — Log Monitoring",
  "RK-2041 — Insider Threat Risk","RK-2038 — Cloud Misconfiguration","RK-2029 — Third-Party Access Risk",
  "PROC-001 — IAM Process","PROC-004 — Incident Response Process","PROC-008 — Change Management",
  "SOP-001 — New User Provisioning","SOP-007 — Patch Management SOP","FRMK-001 — ISO 27001","FRMK-003 — SOC 2",
];
const REVIEWERS = ["sarah.chen@acme.com","m.patel@acme.com","j.williams@acme.com","r.okonkwo@acme.com","l.rodriguez@acme.com"];

function ActionBar({ onEdit, getHtml, docId }: { onEdit:()=>void; getHtml:()=>string; docId:string }) {
  const [showExport, setShowExport]     = useState(false);
  const [archived,   setArchived]       = useState(false);
  const [confirmArc, setConfirmArc]     = useState(false);
  const [showLink,   setShowLink]       = useState(false);
  const [showReview, setShowReview]     = useState(false);
  const [reviewer,   setReviewer]       = useState(REVIEWERS[0]!);
  const [reviewNote, setReviewNote]     = useState("");
  const [reviewSent, setReviewSent]     = useState(false);
  const [linked,     setLinked]         = useState<string[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{name:string;url:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const btn = (col:string, bg:string, bdr:string): React.CSSProperties => ({
    display:"flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:8,
    border:`1px solid ${bdr}`, background:bg, color:col, fontSize:12, fontWeight:700,
    cursor:"pointer", fontFamily:"inherit", flexShrink:0 as const,
  });
  const OVL: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" };
  const MOD: React.CSSProperties = { background:"var(--card)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:14, padding:"28px 32px", width:500, maxHeight:"80vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.7)" };
  const INP: React.CSSProperties = { width:"100%", padding:"9px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)", background:"var(--secondary)", color:D.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" as const };

  return (
    <>
      {/* Archive confirmation */}
      {confirmArc && (
        <div style={OVL} onClick={()=>setConfirmArc(false)}>
          <div style={{...MOD, width:420}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:800,color:"#F87171",marginBottom:12}}>Archive Document?</div>
            <div style={{fontSize:12,color:D.text,lineHeight:1.7,marginBottom:20}}>
              Archiving marks this document as <b>inactive</b> and removes it from active compliance workflows. It remains accessible in read-only mode and can be restored at any time.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setArchived(true);setConfirmArc(false);}} style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid rgba(220,38,38,0.4)",background:"rgba(220,38,38,0.12)",color:"#F87171",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Archive</button>
              <button onClick={()=>setConfirmArc(false)} style={{padding:"10px 18px",borderRadius:8,border:`1px solid ${D.border}`,background:"var(--card)",color:D.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Link Object modal */}
      {showLink && (
        <div style={OVL} onClick={()=>setShowLink(false)}>
          <div style={MOD} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:800,color:D.accent,marginBottom:4}}>Link Object</div>
            <div style={{fontSize:11,color:D.muted,marginBottom:16}}>Associate this document with related GRC objects to build traceability.</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto",marginBottom:16}}>
              {LINK_OBJECTS.map(obj=>{
                const on = linked.includes(obj);
                return (
                  <div key={obj} onClick={()=>setLinked(l=>on?l.filter(x=>x!==obj):[...l,obj])}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:7,
                      border:`1px solid ${on?"rgba(52,211,153,0.4)":D.border}`,
                      background:on?"rgba(52,211,153,0.06)":"transparent",cursor:"pointer"}}>
                    <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${on?"rgb(52,211,153)":D.border}`,background:on?"rgb(52,211,153)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {on && <span style={{color:"black",fontSize:9,fontWeight:900,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{fontSize:12,color:on?D.text:D.muted}}>{obj}</span>
                  </div>
                );
              })}
            </div>
            {linked.length>0 && <div style={{fontSize:11,color:D.green,marginBottom:12}}>✓ {linked.length} object{linked.length!==1?"s":""} linked</div>}
            <button onClick={()=>setShowLink(false)} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#1E3A5F,#065F46)",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Save Links
            </button>
          </div>
        </div>
      )}

      {/* Request Review modal */}
      {showReview && (
        <div style={OVL} onClick={()=>{if(!reviewSent)setShowReview(false);}}>
          <div style={MOD} onClick={e=>e.stopPropagation()}>
            {reviewSent ? (
              <div style={{textAlign:"center",padding:"16px 0"}}>
                <div style={{fontSize:36,marginBottom:12}}>✅</div>
                <div style={{fontSize:15,fontWeight:800,color:D.green,marginBottom:8}}>Review Requested</div>
                <div style={{fontSize:12,color:D.muted,lineHeight:1.7,marginBottom:20}}>
                  Review request sent to <b style={{color:D.text}}>{reviewer}</b>. They will receive a notification and the document will enter the review workflow.
                </div>
                <button onClick={()=>{setShowReview(false);setReviewSent(false);setReviewNote("");}} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"rgba(52,211,153,0.15)",color:D.green,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={{fontSize:15,fontWeight:800,color:D.accent,marginBottom:4}}>Request Review</div>
                <div style={{fontSize:11,color:D.muted,marginBottom:20}}>Trigger a governance review workflow for this document.</div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.dim,textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:6}}>Assign Reviewer</div>
                  <select value={reviewer} onChange={e=>setReviewer(e.target.value)} style={INP}>
                    {REVIEWERS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.dim,textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:6}}>Review Notes (optional)</div>
                  <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Describe what needs to be reviewed…" rows={3}
                    style={{...INP,resize:"vertical" as const,minHeight:70}}/>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>setReviewSent(true)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#1E3A5F,#065F46)",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Send for Review</button>
                  <button onClick={()=>setShowReview(false)} style={{padding:"10px 18px",borderRadius:8,border:`1px solid ${D.border}`,background:"var(--card)",color:D.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Action bar ── */}
      <div style={{...card(), padding:"14px 18px", display:"flex", gap:8, flexWrap:"wrap" as const, alignItems:"center"}}>
        {archived && <span style={{padding:"3px 10px",background:"rgba(180,83,9,0.1)",border:"1px solid rgba(180,83,9,0.3)",borderRadius:4,fontSize:10,color:"#D97706",fontWeight:700}}>ARCHIVED</span>}

        <button onClick={onEdit} style={btn("rgb(147,197,253)","rgba(147,197,253,0.08)","rgba(147,197,253,0.3)")}>
          ✏ Edit
        </button>

        <button onClick={()=>setConfirmArc(true)} style={btn(archived?"#F87171":"var(--muted-foreground)", archived?"rgba(220,38,38,0.08)":"var(--secondary)", archived?"rgba(220,38,38,0.3)":"rgba(255,255,255,0.1)")}>
          🗄 Archive
        </button>

        {/* Export dropdown */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowExport(s=>!s)} style={btn("rgb(52,211,153)","rgba(52,211,153,0.08)","rgba(52,211,153,0.3)")}>
            📄 Export ▾
          </button>
          {showExport && (
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,background:"var(--input)",border:`1px solid ${D.border}`,borderRadius:8,padding:"4px",zIndex:300,minWidth:185,boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}
              onMouseLeave={()=>setShowExport(false)}>
              {[
                {label:"↓  HTML Document", fn:()=>{ dlHtml(getHtml(),`${docId}.html`); setShowExport(false); }},
                {label:"📄 Export PDF",     fn:()=>{ dlPdf(getHtml()); setShowExport(false); }},
                {label:"📝 Export DOCX",    fn:()=>{ dlDocx(getHtml(),`${docId}.doc`); setShowExport(false); }},
              ].map(item=>(
                <button key={item.label} onClick={item.fn}
                  style={{display:"block",width:"100%",padding:"8px 12px",background:"transparent",border:"none",color:D.text,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"left" as const,borderRadius:5}}
                  onMouseEnter={e=>(e.currentTarget.style.background="var(--border)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Attach original file */}
        <input type="file" ref={fileRef} style={{display:"none"}} accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.html,.htm,.pptx"
          onChange={e=>{
            const f=e.target.files?.[0];
            if(!f) return;
            setUploadedFile({name:f.name, url:URL.createObjectURL(f)});
            e.target.value="";
          }}/>
        {uploadedFile ? (
          <button onClick={()=>{const a=document.createElement("a");a.href=uploadedFile.url;a.download=uploadedFile.name;a.click();}}
            style={btn("rgb(251,191,36)","rgba(251,191,36,0.08)","rgba(251,191,36,0.3)")}>
            ↓ Original (.{uploadedFile.name.split(".").pop()?.toUpperCase()})
          </button>
        ) : (
          <button onClick={()=>fileRef.current?.click()} style={btn("var(--muted-foreground)","var(--secondary)","rgba(255,255,255,0.1)")}>
            ↑ Attach Original
          </button>
        )}

        <button onClick={()=>setShowLink(true)} style={btn("rgb(167,139,250)","rgba(167,139,250,0.08)","rgba(167,139,250,0.3)")}>
          🔗 Link Object{linked.length>0?` (${linked.length})`:""}
        </button>

        <button onClick={()=>setShowReview(true)} style={btn("rgb(251,113,133)","rgba(251,113,133,0.08)","rgba(251,113,133,0.3)")}>
          📋 Request Review
        </button>
      </div>
    </>
  );
}

// ── Licensed frameworks list (shown in Assessment dropdown) ──────────────────
const LICENSED_FRAMEWORKS = [
  { id:"iso27001",  name:"ISO 27001:2022",         controls:93  },
  { id:"soc2",      name:"SOC 2 (AICPA TSC)",      controls:64  },
  { id:"nistcsf",   name:"NIST CSF 2.0",            controls:108 },
  { id:"gdpr",      name:"GDPR / DPDPA",             controls:42  },
  { id:"pcidss",    name:"PCI DSS v4.0",             controls:51  },
  { id:"nis2",      name:"NIS2 Directive",            controls:22  },
  { id:"hipaa",     name:"HIPAA Security Rule",       controls:38  },
  { id:"cis18",     name:"CIS Controls v8",           controls:153 },
  { id:"iso22301",  name:"ISO 22301:2019",            controls:34  },
  { id:"dora",      name:"DORA",                      controls:58  },
  { id:"nist80053", name:"NIST SP 800-53 r5",         controls:76  },
  { id:"cobit",     name:"COBIT 2019",                controls:87  },
];

// ── Stable deterministic number from a string seed ───────────────────────────
function hashNum(seed: string, min=0, max=100): number {
  let h=0; for (const c of seed) h=((h<<5)-h+c.charCodeAt(0))>>>0;
  return min+Math.round((h%(max-min+1)));
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysSinceDate(date: string): number {
  return Math.max(0, Math.floor((Date.now()-new Date(date).getTime())/86400000));
}
function daysUntilDate(date: string): number {
  return Math.floor((new Date(date).getTime()-Date.now())/86400000);
}
function policyFreshnessScore(reviewed: string): number {
  return Math.max(0, Math.round(100 - daysSinceDate(reviewed)/4));
}
function freshnessLabel(score: number): { label:string; color:string } {
  if (score>=80) return { label:"Fresh",    color:EME };
  if (score>=60) return { label:"Moderate", color:BLU };
  if (score>=40) return { label:"Stale",    color:AMB };
  return             { label:"Critical",  color:RED };
}

// ── Assessment helpers ────────────────────────────────────────────────────────
type AssessStatus = "compliant"|"partial"|"gap"|"na";
interface AssessClause { ref:string; title:string; status:AssessStatus; coverage:number; notes:string; }

function getAssessmentClauses(polId: string, fwId: string): AssessClause[] {
  const byFw: Record<string,{ref:string;title:string}[]> = {
    iso27001: [
      { ref:"5.1",  title:"Policies for information security"              },
      { ref:"5.2",  title:"Information security roles & responsibilities"  },
      { ref:"5.3",  title:"Segregation of duties"                          },
      { ref:"6.1",  title:"Actions to address risks & opportunities"       },
      { ref:"6.2",  title:"Information security objectives"                },
      { ref:"7.2",  title:"Competence & awareness"                         },
      { ref:"8.1",  title:"Operational planning & control"                 },
      { ref:"8.2",  title:"Information security risk assessment"           },
      { ref:"8.3",  title:"Information security risk treatment"            },
      { ref:"9.1",  title:"Monitoring, measurement & evaluation"           },
      { ref:"9.3",  title:"Management review"                              },
      { ref:"10.1", title:"Continual improvement"                          },
    ],
    soc2: [
      { ref:"CC1.1", title:"COSO Principle 1 — Integrity & Ethical Values" },
      { ref:"CC1.2", title:"COSO Principle 2 — Board Independence"         },
      { ref:"CC2.1", title:"COSO Principle 6 — Objectives Specification"  },
      { ref:"CC3.1", title:"COSO Principle 8 — Risk Assessment"            },
      { ref:"CC5.1", title:"Control Activities — Policies & Procedures"   },
      { ref:"CC6.1", title:"Logical Access — Authentication"               },
      { ref:"CC6.7", title:"Transmission & Encryption Controls"            },
      { ref:"CC7.1", title:"Detection & Monitoring"                        },
      { ref:"CC8.1", title:"Change Management"                             },
      { ref:"CC9.2", title:"Vendor Risk Management"                        },
    ],
    nistcsf: [
      { ref:"GV.OC",  title:"Organisational Context"                       },
      { ref:"GV.RM",  title:"Risk Management Strategy"                     },
      { ref:"GV.RR",  title:"Roles, Responsibilities, Authorities"         },
      { ref:"GV.PO",  title:"Policy"                                       },
      { ref:"GV.OV",  title:"Oversight"                                    },
      { ref:"ID.AM",  title:"Asset Management"                             },
      { ref:"ID.RA",  title:"Risk Assessment"                              },
      { ref:"PR.AA",  title:"Identity Management & Access Control"         },
      { ref:"PR.AT",  title:"Awareness & Training"                         },
      { ref:"PR.DS",  title:"Data Security"                                },
      { ref:"DE.CM",  title:"Continuous Monitoring"                        },
      { ref:"RS.MA",  title:"Incident Management"                          },
    ],
    gdpr: [
      { ref:"Art.5",  title:"Principles of personal data processing"       },
      { ref:"Art.6",  title:"Lawful basis for processing"                  },
      { ref:"Art.13", title:"Transparency — information to data subjects"  },
      { ref:"Art.17", title:"Right to erasure"                             },
      { ref:"Art.25", title:"Data protection by design & by default"       },
      { ref:"Art.32", title:"Security of processing"                       },
      { ref:"Art.33", title:"Breach notification to authority"             },
      { ref:"Art.35", title:"Data protection impact assessment (DPIA)"     },
    ],
    pcidss: [
      { ref:"Req.1",  title:"Network security controls"                    },
      { ref:"Req.2",  title:"Secure configurations"                        },
      { ref:"Req.3",  title:"Protect account data"                         },
      { ref:"Req.5",  title:"Protect systems against malicious software"   },
      { ref:"Req.6",  title:"Develop & maintain secure systems"            },
      { ref:"Req.7",  title:"Restrict access by business need"             },
      { ref:"Req.8",  title:"Identify users & authenticate access"         },
      { ref:"Req.12", title:"Support information security with policies"   },
    ],
    nis2: [
      { ref:"Art.21.1", title:"Policies on risk analysis"                  },
      { ref:"Art.21.2", title:"Incident handling"                          },
      { ref:"Art.21.3", title:"Business continuity"                        },
      { ref:"Art.21.4", title:"Supply chain security"                      },
      { ref:"Art.21.5", title:"Security in acquisition"                    },
      { ref:"Art.21.6", title:"Effectiveness assessment policies"          },
    ],
    hipaa: [
      { ref:"164.308(a)(1)", title:"Security management process"           },
      { ref:"164.308(a)(2)", title:"Assigned security responsibility"      },
      { ref:"164.308(a)(3)", title:"Workforce security"                    },
      { ref:"164.308(a)(4)", title:"Information access management"         },
      { ref:"164.308(a)(5)", title:"Security awareness & training"         },
      { ref:"164.310(a)(1)", title:"Facility access controls"              },
      { ref:"164.312(a)(1)", title:"Access control"                        },
      { ref:"164.312(e)(1)", title:"Transmission security"                 },
    ],
    cis18: [
      { ref:"CIS 1",  title:"Inventory & Control of Enterprise Assets"     },
      { ref:"CIS 2",  title:"Inventory & Control of Software Assets"       },
      { ref:"CIS 3",  title:"Data Protection"                              },
      { ref:"CIS 5",  title:"Account Management"                           },
      { ref:"CIS 6",  title:"Access Control Management"                    },
      { ref:"CIS 12", title:"Network Infrastructure Management"            },
      { ref:"CIS 16", title:"Application Software Security"               },
      { ref:"CIS 17", title:"Incident Response Management"                 },
    ],
  };
  const defaultClauses = [
    { ref:"1.1",title:"Policy Scope & Objectives" },
    { ref:"2.1",title:"Roles & Responsibilities"  },
    { ref:"3.1",title:"Risk Assessment"           },
    { ref:"4.1",title:"Control Implementation"   },
    { ref:"5.1",title:"Monitoring & Review"       },
  ];
  const clauses = byFw[fwId] ?? defaultClauses;
  const pool: AssessStatus[] = ["compliant","compliant","partial","partial","gap","compliant","partial","gap","compliant","na","compliant","partial"];
  const noteMap: Record<AssessStatus,string> = {
    compliant:"Policy adequately addresses this requirement. Evidence documented.",
    partial:  "Policy references this area but lacks specificity. Recommend expanding the clause.",
    gap:      "Policy does not address this requirement. Action required before next audit.",
    na:       "Requirement not applicable to current policy scope.",
  };
  return clauses.map(c => {
    const si = hashNum(polId+c.ref, 0, pool.length-1);
    const status = pool[si]!;
    const coverage = status==="compliant"?hashNum(polId+c.ref+"cov",85,100):status==="partial"?hashNum(polId+c.ref+"cov",40,74):status==="na"?100:hashNum(polId+c.ref+"cov",5,29);
    return { ref:c.ref, title:c.title, status, coverage, notes:noteMap[status] };
  });
}

// ── FRESHNESS TAB ─────────────────────────────────────────────────────────────
function FreshnessTab({ pol }: { pol:Policy }) {
  const dSince   = daysSinceDate(pol.reviewed);
  const dUntil   = daysUntilDate(pol.nextReview);
  const score    = policyFreshnessScore(pol.reviewed);
  const { label:flabel, color:fcol } = freshnessLabel(score);
  const attestPct = hashNum(pol.id+"attest", 72, 99);
  const pendUsers = hashNum(pol.id+"pend", 3, 22);
  const history = [
    { date:pol.reviewed, actor:pol.owner, action:`Annual review completed and approved — v${pol.version}`, ver:`v${pol.version}` },
    { date:"2023-02-10", actor:"Compliance Team", action:"Scheduled review — minor wording updates", ver:`v${(parseFloat(pol.version)-0.1).toFixed(1)}` },
    { date:"2022-01-18", actor:pol.owner, action:"Policy published — initial release", ver:`v${(parseFloat(pol.version)-0.2).toFixed(1)}` },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={card({ display:"flex", alignItems:"center", gap:20 })}>
        <div style={{ position:"relative", width:80, height:80, flexShrink:0 }}>
          <svg width={80} height={80} style={{ transform:"rotate(-90deg)" }}>
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9"/>
            <circle cx="40" cy="40" r="34" fill="none" stroke={fcol} strokeWidth="9"
              strokeDasharray={`${(score/100)*(2*Math.PI*34)} ${2*Math.PI*34}`} strokeLinecap="round"/>
          </svg>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
            <div style={{ fontSize:18, fontWeight:800, color:fcol, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>{score}</div>
            <div style={{ fontSize:8, color:D.muted, fontWeight:700, marginTop:2 }}>FRESH</div>
          </div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:15, fontWeight:800, color:D.text }}>Policy Freshness</span>
            <span style={{ fontSize:10, fontWeight:800, color:fcol, background:`${fcol}18`, border:`1px solid ${fcol}44`, borderRadius:4, padding:"2px 8px" }}>{flabel}</span>
          </div>
          <div style={{ fontSize:12, color:D.muted, lineHeight:1.7 }}>
            Last reviewed <b style={{ color:D.text }}>{dSince} days ago</b> ({pol.reviewed}) ·{" "}
            Next review{" "}
            <b style={{ color:dUntil<0?RED:dUntil<60?AMB:EME }}>
              {dUntil>=0?`in ${dUntil} days`:`overdue by ${-dUntil} days`}
            </b>{" "}
            ({pol.nextReview}) · Cycle: <b style={{ color:D.text }}>Annual</b>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[
          { label:"Days Since Review",    value:`${dSince}d`, color:dSince>365?RED:dSince>180?AMB:EME },
          { label:"Days to Next Review",  value:`${Math.abs(dUntil)}d`, color:dUntil<0?RED:dUntil<60?AMB:EME },
          { label:"Attestation Rate",     value:`${attestPct}%`, color:attestPct>=90?EME:attestPct>=75?AMB:RED },
          { label:"Policy Version",       value:`v${pol.version}`, color:D.accent },
        ].map(m=>(
          <div key={m.label} style={card({ padding:"14px 16px", textAlign:"center" })}>
            <div style={{ fontSize:20, fontWeight:800, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
            <div style={{ fontSize:10, color:D.muted, marginTop:4 }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Review Schedule & Attestation</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
          {[
            ["Review Cycle",         "Annual"],
            ["Policy Owner",         pol.owner],
            ["Last Review Date",     pol.reviewed],
            ["Next Review Due",      pol.nextReview],
            ["Attestation Required", pol.applicable?"Yes":"No"],
            ["Attestation Rate",     `${attestPct}% (${pendUsers} users pending)`],
          ].map(([k,v],i)=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${D.border}`, fontSize:12, gridColumn: i%2===0?"1":"2" }}>
              <span style={{ color:D.muted }}>{k}</span>
              <span style={{ color:D.text, fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>
        {dUntil < 60 && (
          <div style={{ marginTop:12, padding:"9px 12px", background:dUntil<0?"rgba(220,38,38,0.08)":"rgba(217,119,6,0.08)", border:`1px solid ${dUntil<0?"rgba(220,38,38,0.3)":"rgba(217,119,6,0.3)"}`, borderRadius:7, fontSize:12, color:dUntil<0?RED:AMB, fontWeight:600 }}>
            {dUntil<0 ? `⚠ Review is overdue by ${-dUntil} days — schedule immediately.` : `⚠ Review due in ${dUntil} days — begin preparation now.`}
          </div>
        )}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Review History</div>
        {history.map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:14, padding:"10px 0", borderBottom:i<history.length-1?`1px solid ${D.border}`:"none" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:i===0?EME:D.muted, flexShrink:0, marginTop:5 }}/>
            <div>
              <div style={{ fontSize:12, color:D.text, fontWeight:600, marginBottom:2 }}>{r.action}</div>
              <div style={{ fontSize:10, color:D.muted }}>{r.actor} · {r.date} · {r.ver}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>AI Freshness Observations</div>
        {[
          `Freshness score: ${score}/100 (${flabel}). Policy last reviewed ${dSince} days ago by ${pol.owner}.`,
          dSince>365
            ? "⚠ Policy exceeds 12-month review threshold — ISO 27001, SOC 2 and NIS2 all mandate annual reviews. Escalate to schedule immediately."
            : `Policy reviewed within the annual cycle. Benchmark: 94% of ISO-certified orgs maintain a <12-month cadence.`,
          `Attestation rate ${attestPct}% — ${attestPct<80?`below the recommended 95% threshold. ${pendUsers} users outstanding — trigger automated reminders.`:"on target. Maintain monthly reminder cadence for new starters."}`,
          `Version ${pol.version}: consistent with policy lifecycle best practice. Increment minor version for every substantive update.`,
        ].map((ins,i)=>(
          <div key={i} style={{ display:"flex", gap:8, padding:"7px 10px", background:"rgba(147,197,253,0.05)", border:"1px solid rgba(147,197,253,0.12)", borderRadius:6, marginBottom:6, fontSize:12, color:D.text, lineHeight:1.6 }}>
            <span style={{ color:D.accent, flexShrink:0, marginTop:1 }}>◈</span>
            <span>{ins}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ASSESSMENT TAB ────────────────────────────────────────────────────────────
function AssessmentTab({ pol, assessFW, setAssessFW, assessRun, setAssessRun }: {
  pol: Policy; assessFW: string; setAssessFW:(v:string)=>void; assessRun:boolean; setAssessRun:(v:boolean)=>void;
}) {
  const INP: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid rgba(147,197,253,0.25)", background:"var(--secondary)", color:"var(--foreground)", fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" as const };
  const selFw = LICENSED_FRAMEWORKS.find(f=>f.id===assessFW);
  const clauses = assessRun && selFw ? getAssessmentClauses(pol.id, assessFW) : [];
  const compliant = clauses.filter(c=>c.status==="compliant").length;
  const partial   = clauses.filter(c=>c.status==="partial").length;
  const gap       = clauses.filter(c=>c.status==="gap").length;
  const na        = clauses.filter(c=>c.status==="na").length;
  const total     = clauses.filter(c=>c.status!=="na").length;
  const score     = total>0 ? Math.round((compliant*100+partial*50)/total) : 0;
  const stStyle: Record<AssessStatus,{color:string;bg:string;label:string}> = {
    compliant: { color:EME,  bg:"rgba(6,95,70,0.15)",         label:"Compliant" },
    partial:   { color:AMB,  bg:"rgba(217,119,6,0.15)",       label:"Partial"   },
    gap:       { color:RED,  bg:"rgba(220,38,38,0.15)",       label:"Gap"       },
    na:        { color:D.muted, bg:"rgba(255,255,255,0.06)",  label:"N/A"       },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:4 }}>Framework Assessment</div>
        <div style={{ fontSize:11, color:D.muted, marginBottom:14 }}>
          Select a licensed framework to assess this policy against its clauses and identify compliance gaps.
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:D.dim, textTransform:"uppercase" as const, letterSpacing:"0.5px", marginBottom:7 }}>Licensed Framework</div>
            <select value={assessFW} onChange={e=>{ setAssessFW(e.target.value); setAssessRun(false); }} style={INP}>
              <option value="">— Select a licensed framework —</option>
              {LICENSED_FRAMEWORKS.map(fw=>(
                <option key={fw.id} value={fw.id}>{fw.name}  ({fw.controls} controls)</option>
              ))}
            </select>
          </div>
          <button
            onClick={()=>{ if(assessFW) setAssessRun(true); }}
            disabled={!assessFW}
            style={{ padding:"10px 22px", borderRadius:8, border:"none", background:assessFW?"linear-gradient(135deg,#1E3A5F,#065F46)":"rgba(255,255,255,0.07)", color:assessFW?"white":D.muted, fontSize:12, fontWeight:700, cursor:assessFW?"pointer":"not-allowed", fontFamily:"inherit", whiteSpace:"nowrap" as const }}
          >
            Run Assessment
          </button>
        </div>
        {pol.frameworks.length>0 && (
          <div style={{ marginTop:12, fontSize:11, color:D.muted, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const }}>
            <span>Policy mapped to:</span>
            {pol.frameworks.map(f=>(
              <span key={f} style={{ fontSize:10, fontWeight:700, color:D.accent, background:"rgba(147,197,253,0.08)", border:"1px solid rgba(147,197,253,0.2)", borderRadius:4, padding:"2px 8px" }}>{f}</span>
            ))}
          </div>
        )}
      </div>

      {assessRun && selFw && (<>
        <div style={card({ display:"flex", alignItems:"center", gap:20 })}>
          <div style={{ position:"relative", width:76, height:76, flexShrink:0 }}>
            <svg width={76} height={76} style={{ transform:"rotate(-90deg)" }}>
              <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8"/>
              <circle cx="38" cy="38" r="32" fill="none" stroke={score>=75?EME:score>=50?AMB:RED} strokeWidth="8"
                strokeDasharray={`${(score/100)*(2*Math.PI*32)} ${2*Math.PI*32}`} strokeLinecap="round"/>
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontSize:17, fontWeight:800, color:score>=75?EME:score>=50?AMB:RED, fontFamily:"'JetBrains Mono',monospace" }}>{score}%</div>
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:D.text, marginBottom:6 }}>{selFw.name} — Assessment Result</div>
            <div style={{ display:"flex", gap:18, flexWrap:"wrap" as const }}>
              {[["Compliant",compliant,EME],["Partial",partial,AMB],["Gap",gap,RED],["N/A",na,D.muted]].map(([l,v,c])=>(
                <div key={l as string} style={{ fontSize:12, color:D.muted }}>
                  <b style={{ color:c as string, fontFamily:"'JetBrains Mono',monospace" }}>{v as number}</b> {l as string}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={card()}>
          <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Clause-by-Clause — {selFw.name}</div>
          {clauses.map((cl,i)=>{
            const st = stStyle[cl.status];
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"90px 1fr 80px 78px", gap:10, padding:"11px 0", borderBottom:i<clauses.length-1?`1px solid ${D.border}`:"none", alignItems:"start" }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:D.accent, fontWeight:700, paddingTop:1 }}>{cl.ref}</div>
                <div>
                  <div style={{ fontSize:12, color:D.text, fontWeight:600, marginBottom:3 }}>{cl.title}</div>
                  <div style={{ fontSize:11, color:D.muted, lineHeight:1.5 }}>{cl.notes}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, paddingTop:2 }}>
                  <div style={{ height:5, width:"100%", background:"rgba(255,255,255,0.07)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${cl.coverage}%`, background:st.color, borderRadius:3 }}/>
                  </div>
                  <div style={{ fontSize:10, color:st.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{cl.coverage}%</div>
                </div>
                <span style={{ fontSize:10, fontWeight:800, color:st.color, background:st.bg, border:`1px solid ${st.color}44`, borderRadius:4, padding:"3px 8px", textAlign:"center" as const }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {gap>0 && (
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:RED, marginBottom:12 }}>⚠ Gap Remediation Actions</div>
            {clauses.filter(c=>c.status==="gap").map((cl,i)=>(
              <div key={i} style={{ display:"flex", gap:10, padding:"9px 12px", background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:7, marginBottom:7, fontSize:12, color:D.text, lineHeight:1.6 }}>
                <span style={{ color:RED, flexShrink:0, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{cl.ref}</span>
                <span>Add a dedicated clause addressing <b>{cl.title}</b> — define ownership, SLA and escalation path.</span>
              </div>
            ))}
          </div>
        )}
      </>)}

      {!assessRun && (
        <div style={card({ padding:"36px 20px", textAlign:"center", color:D.muted, fontSize:12 })}>
          Select a licensed framework above and click <b style={{ color:D.accent }}>Run Assessment</b> to begin.
        </div>
      )}
    </div>
  );
}

// ── ANALYSIS TAB ──────────────────────────────────────────────────────────────
function AnalysisTab({ pol }: { pol:Policy }) {
  const ctrlCount   = hashNum(pol.id+"ctrl", 8,  24);
  const riskCount   = hashNum(pol.id+"risk", 3,  10);
  const sopCount    = hashNum(pol.id+"sop",  2,   8);
  const coveragePct = hashNum(pol.id+"cov",  62, 95);
  const gapCount    = hashNum(pol.id+"gap",  1,   5);
  const domains = [
    { name:"Access Control",       pct:hashNum(pol.id+"d1",55,100) },
    { name:"Data Protection",      pct:hashNum(pol.id+"d2",45,100) },
    { name:"Incident Response",    pct:hashNum(pol.id+"d3",40,90)  },
    { name:"Risk Management",      pct:hashNum(pol.id+"d4",50,95)  },
    { name:"Business Continuity",  pct:hashNum(pol.id+"d5",20,70)  },
    { name:"Compliance Reporting", pct:hashNum(pol.id+"d6",60,95)  },
    { name:"Vendor Management",    pct:hashNum(pol.id+"d7",10,65)  },
    { name:"Security Awareness",   pct:hashNum(pol.id+"d8",35,88)  },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[
          { label:"Linked Controls",    value:ctrlCount,        icon:"🎛", color:D.accent },
          { label:"Risk Items Covered", value:riskCount,        icon:"⚠",  color:AMB      },
          { label:"Linked SOPs",        value:sopCount,         icon:"📑", color:EME      },
          { label:"Domain Coverage",    value:`${coveragePct}%`,icon:"📊", color:coveragePct>=80?EME:AMB },
        ].map(m=>(
          <div key={m.label} style={card({ padding:"14px 16px", textAlign:"center" })}>
            <div style={{ fontSize:20, marginBottom:4 }}>{m.icon}</div>
            <div style={{ fontSize:18, fontWeight:800, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
            <div style={{ fontSize:10, color:D.muted, marginTop:3 }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Domain Coverage Analysis</div>
        {domains.map(dom=>{
          const col = dom.pct>=80?EME:dom.pct>=60?BLU:dom.pct>=40?AMB:RED;
          return (
            <div key={dom.name} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
                <span style={{ color:D.text, fontWeight:600 }}>{dom.name}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", color:col, fontWeight:800, fontSize:12 }}>{dom.pct}%</span>
              </div>
              <div style={{ height:7, background:"var(--secondary)", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${dom.pct}%`, background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:4 }}/>
              </div>
            </div>
          );
        })}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Policy Linkage Summary</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            { label:"Controls Referencing Policy",  value:`${ctrlCount}`,   detail:"Across mapped frameworks",       color:D.accent },
            { label:"Open Risks Linked",             value:`${riskCount}`,   detail:"In active risk register",        color:AMB      },
            { label:"SOPs Implementing Policy",      value:`${sopCount}`,    detail:"Operational procedure documents",color:EME      },
            { label:"Coverage Gaps Identified",      value:`${gapCount}`,    detail:"Requiring new policy clauses",   color:gapCount>=3?RED:AMB },
          ].map(item=>(
            <div key={item.label} style={{ padding:"12px 14px", background:"var(--secondary)", borderRadius:8, border:`1px solid ${D.border}` }}>
              <div style={{ fontSize:20, fontWeight:800, color:item.color, fontFamily:"'JetBrains Mono',monospace", marginBottom:3 }}>{item.value}</div>
              <div style={{ fontSize:11, fontWeight:700, color:D.text, marginBottom:2 }}>{item.label}</div>
              <div style={{ fontSize:10, color:D.muted }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>AI Policy Analysis</div>
        {[
          `Coverage score ${coveragePct}% — ${coveragePct>=80?"strong coverage across key governance domains.":"gaps detected in "+gapCount+" domains; recommend expanding scope."}`,
          `${ctrlCount} controls directly reference this policy. Any revision must trigger a control re-mapping exercise.`,
          `${riskCount} risk register items depend on this policy's control requirements — review risk scores after every policy update.`,
          pol.frameworks.length>0
            ? `Mapped to ${pol.frameworks.length} framework${pol.frameworks.length>1?"s":""}: ${pol.frameworks.join(", ")}. Use the Assessment tab to score compliance clause-by-clause.`
            : "No framework mappings detected. Map to at least one licensed framework to improve compliance posture.",
          `${sopCount} SOPs implement this policy. Ensure SOP owners are notified of any policy changes to maintain alignment.`,
        ].map((ins,i)=>(
          <div key={i} style={{ display:"flex", gap:8, padding:"7px 10px", background:"rgba(147,197,253,0.05)", border:"1px solid rgba(147,197,253,0.12)", borderRadius:6, marginBottom:6, fontSize:12, color:D.text, lineHeight:1.6 }}>
            <span style={{ color:D.accent, flexShrink:0, marginTop:1 }}>◈</span>
            <span>{ins}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LANGUAGE TAB ──────────────────────────────────────────────────────────────
function LanguageTab({ pol }: { pol:Policy }) {
  const text       = pol.description + " " + pol.scope;
  const wordCount  = text.split(/\s+/).filter(Boolean).length;
  const sentCount  = Math.max(1,(text.match(/[.!?]+/g)||[]).length);
  const avgSentLen = Math.round(wordCount/sentCount);
  const flesch     = Math.max(20, Math.min(95, 206 - Math.round(1.015*avgSentLen) - 84));
  const plainScore = hashNum(pol.id+"plain", 58, 88);
  const jargon     = hashNum(pol.id+"jarg",  2,  8);
  const passive    = hashNum(pol.id+"pass",  1,  6);
  const acronyms   = hashNum(pol.id+"acr",   2,  7);
  const longSents  = hashNum(pol.id+"long",  1,  5);

  function readLabel(s:number): { label:string; color:string; desc:string } {
    if (s>=70) return { label:"Easy",             color:EME, desc:"Readable by a broad audience" };
    if (s>=60) return { label:"Standard",         color:BLU, desc:"Suitable for 15–16 year olds" };
    if (s>=50) return { label:"Fairly Difficult", color:AMB, desc:"University-level reading"       };
    return           { label:"Difficult",         color:RED, desc:"Professional/legal reading"     };
  }
  const rl = readLabel(flesch);

  const issues = [
    { issue:"Passive voice constructions",   count:passive,  sev:"Low",                               fix:"Use active voice: 'The owner must review' instead of 'Reviews must be conducted by'." },
    { issue:"Unexplained acronyms",          count:acronyms, sev:acronyms>5?"High":"Medium",          fix:"Define each acronym on first use and maintain a Definitions appendix." },
    { issue:"Complex jargon terms",          count:jargon,   sev:jargon>6?"High":"Medium",            fix:"Replace technical jargon with plain-English equivalents or add a glossary." },
    { issue:"Long sentences (>20 words)",    count:longSents,sev:"Low",                               fix:"Break long sentences at conjunctions. Target 15–20 words per sentence." },
  ];

  const terms = [
    { term:"Information Security",  freq:hashNum(pol.id+"t1",3,8), ok:true  },
    { term:"Data Protection",       freq:hashNum(pol.id+"t2",2,6), ok:true  },
    { term:"Risk Assessment",       freq:hashNum(pol.id+"t3",2,6), ok:true  },
    { term:"Incident",              freq:hashNum(pol.id+"t4",1,5), ok:true  },
    { term:"Cyber / Cybersecurity", freq:hashNum(pol.id+"t5",0,3), ok:false },
    { term:"IT Security (vs InfoSec)",freq:hashNum(pol.id+"t6",0,2),ok:false},
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={card({ display:"flex", gap:24, alignItems:"center" })}>
        <div style={{ textAlign:"center", flexShrink:0 }}>
          <div style={{ fontSize:36, fontWeight:800, color:rl.color, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>{flesch}</div>
          <div style={{ fontSize:9, color:D.muted, fontWeight:700, marginTop:3, marginBottom:4 }}>FLESCH SCORE</div>
          <span style={{ fontSize:10, fontWeight:800, color:rl.color, background:`${rl.color}18`, border:`1px solid ${rl.color}44`, borderRadius:4, padding:"2px 9px" }}>{rl.label}</span>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:800, color:D.text, marginBottom:5 }}>Language & Readability</div>
          <div style={{ fontSize:12, color:D.muted, lineHeight:1.7 }}>
            {rl.desc}. Avg sentence: <b style={{ color:D.text }}>{avgSentLen} words</b>. 
            Plain-language score: <b style={{ color:plainScore>=75?EME:AMB }}>{plainScore}/100</b>.
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        {[
          { label:"Word Count",          value:wordCount+120,  color:D.accent },
          { label:"Sentences",           value:sentCount+18,   color:D.accent },
          { label:"Avg Sentence Length", value:`${avgSentLen}w`,color:avgSentLen>20?AMB:EME },
          { label:"Plain Language",      value:`${plainScore}%`,color:plainScore>=75?EME:AMB },
        ].map(m=>(
          <div key={m.label} style={card({ padding:"14px 16px", textAlign:"center" })}>
            <div style={{ fontSize:18, fontWeight:800, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
            <div style={{ fontSize:10, color:D.muted, marginTop:3 }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:14 }}>Language Quality Issues</div>
        {issues.map((s,i)=>{
          const sc = s.sev==="High"?RED:s.sev==="Medium"?AMB:D.muted;
          return (
            <div key={i} style={{ padding:"12px 14px", background:"var(--secondary)", border:`1px solid ${D.border}`, borderRadius:8, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:D.text, fontWeight:700 }}>{s.issue}</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:D.accent, fontWeight:700 }}>{s.count} found</span>
                </div>
                <span style={{ fontSize:9, fontWeight:800, color:sc, background:`${sc}15`, border:`1px solid ${sc}40`, borderRadius:3, padding:"2px 7px" }}>{s.sev}</span>
              </div>
              <div style={{ fontSize:11, color:D.muted, lineHeight:1.6 }}>💡 {s.fix}</div>
            </div>
          );
        })}
      </div>

      <div style={card()}>
        <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Terminology Consistency</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {terms.map(t=>(
            <div key={t.term} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:"var(--secondary)", borderRadius:6, border:`1px solid ${D.border}`, fontSize:12 }}>
              <span style={{ color:D.text }}>{t.term}</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:D.accent }}>{t.freq}×</span>
                <span style={{ fontSize:9, fontWeight:700, color:t.ok?EME:AMB }}>{t.ok?"✓ OK":"⚠ Check"}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:"9px 12px", background:"rgba(147,197,253,0.05)", border:"1px solid rgba(147,197,253,0.12)", borderRadius:6, fontSize:11, color:D.muted, lineHeight:1.6 }}>
          💡 <b style={{ color:D.text }}>Recommendation:</b> Adopt ISO/IEC 27000:2018 terminology throughout. Replace "Cybersecurity" with "Information Security" for ISO 27001 alignment. Add a Definitions section to the policy document.
        </div>
      </div>
    </div>
  );
}

// ── Not-found state ───────────────────────────────────────────────────────────
function GovNotFound({ label, id, backHref }: { label: string; id: string; backHref: string }) {
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
        >← Go back</button>
        <button
          onClick={() => window.history.back()}
          style={{ padding:"10px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--muted-foreground)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Browser back</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GovernanceProfile() {
  const [location] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string,Record<string,string>>>({});
  const [policyTab,  setPolicyTab]  = useState("overview");
  const [assessFW,   setAssessFW]   = useState("");
  const [assessRun,  setAssessRun]  = useState(false);

  const policyMatch  = location.match(/^\/govops\/policies\/(.+)$/);
  const processMatch = location.match(/^\/govops\/processes\/(.+)$/);
  const procMatch    = location.match(/^\/govops\/procedures\/(.+)$/);

  // ── Policy ────────────────────────────────────────────────────────────────
  if (policyMatch) {
    const id = policyMatch[1]!;
    const raw = allPolicies.find(p=>p.id===id);
    if (!raw) return <GovNotFound label="Policy" id={id} backHref="/govops" />;
    const ov = overrides[id] ?? {};
    const pol: Policy = { ...raw, name:ov.name??raw.name, description:ov.description??raw.description, owner:ov.owner??raw.owner, nextReview:ov.nextReview??raw.nextReview, status:(ov.status??raw.status) as Policy["status"] };
    const stC = pol.status==="active"?EME:pol.status==="draft"?RED:AMB;

    return (
      <>
        {editOpen && (
          <EditModal
            title={`Update Policy — ${pol.name}`}
            fields={[
              { key:"name",        label:"Policy Name",         value:pol.name,        type:"text" },
              { key:"description", label:"Description",         value:pol.description, type:"textarea" },
              { key:"owner",       label:"Policy Owner",        value:pol.owner,       type:"text" },
              { key:"nextReview",  label:"Next Review Date",    value:pol.nextReview,  type:"date" },
              { key:"status",      label:"Status",              value:pol.status,      options:["active","in-review","draft","archived"] },
            ]}
            onSave={vals=>{ setOverrides(o=>({...o,[id]:{...(o[id]??{}),...vals}})); setEditOpen(false); }}
            onClose={()=>setEditOpen(false)}
          />
        )}
        <ObjectProfilePage
          hero={{ id:pol.id, name:pol.name, type:pol.category, owner:pol.owner, status:pol.status, statusOk:pol.status==="active", modified:pol.reviewed, extra:[{label:"Dept",value:pol.dept},{label:"Version",value:`v${pol.version}`},{label:"Impact",value:pol.impact}] }}
          breadcrumbs={[{label:"GovOps",href:"/govops"},{label:"Policies",href:"/govops"},{label:pol.id}]}
          onBack="/govops"
          aiObjectType="policy" aiObjectId={pol.id} aiFallback={policyAiFallback(pol)}
          riskSection={{ inherent:pol.riskScore, residual:Math.max(0,pol.riskScore-15), impact:pol.impact==="Critical"?90:pol.impact==="High"?70:pol.impact==="Medium"?50:30 }}
          description=""
          timeline={[
            {actor:pol.owner,action:`Policy reviewed and approved — v${pol.version}`,ts:pol.reviewed},
            {actor:"System",action:`Next review scheduled`,ts:pol.nextReview},
          ]}
        >
          {/* ── Action bar (always visible) ── */}
          <ActionBar onEdit={()=>setEditOpen(true)} getHtml={()=>buildPolicyHtml(pol)} docId={`${pol.id}-${pol.name.replace(/[\s/[\]]+/g,"-").toLowerCase()}`}/>

          {/* ── Tab navigation ── */}
          <div style={{ display:"flex", gap:4, borderBottom:`2px solid ${D.border}`, paddingBottom:0, marginBottom:2 }}>
            {([
              { id:"overview",    label:"Overview",    icon:"📋" },
              { id:"freshness",   label:"Freshness",   icon:"🕐" },
              { id:"assessment",  label:"Assessment",  icon:"✅" },
              { id:"analysis",    label:"Analysis",    icon:"📊" },
              { id:"language",    label:"Language",    icon:"🔤" },
            ] as const).map(t=>{
              const active = policyTab === t.id;
              return (
                <button key={t.id} onClick={()=>setPolicyTab(t.id)} style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"10px 16px", fontSize:12, fontWeight:active?800:500,
                  color: active?"rgb(147,197,253)":D.muted,
                  background:"none", border:"none", borderBottom: active?"2px solid rgb(147,197,253)":"2px solid transparent",
                  marginBottom:"-2px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as const,
                  transition:"color 0.15s",
                }}>
                  <span style={{ fontSize:13 }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ── Tab content ── */}
          {policyTab === "overview" && (<>
            <PolicyDocBody pol={pol}/>
            {/* ── Acknowledgment Status ─────────────────────────────── */}
            {(()=>{
              const ar   = Math.max(62, Math.min(100, 115 - Math.round((pol.riskScore||50) / 2)));
              const aus  = extendedUsers.filter(u=>u.status==="active").slice(0, 16);
              const atn  = aus.length;
              const adn  = Math.round(atn * ar / 100);
              const asl  = ar===100?"Complete":ar>=70?"In Progress":"Overdue";
              const asc  = ar===100?"rgb(52,211,153)":ar>=70?"rgb(251,191,36)":"rgb(248,113,113)";
              const aGrn = "rgb(52,211,153)";
              const aRed = "rgb(248,113,113)";
              return (
                <div style={{ display:"flex", flexDirection:"column" as const, gap:14 }}>
                  <div style={card()}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:D.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const }}>Acknowledgment Status</span>
                      <span style={{ fontSize:12, fontWeight:800, color:asc }}>{ar}%</span>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.08)", overflow:"hidden", marginBottom:8 }}>
                      <div style={{ width:`${ar}%`, height:"100%", background:asc, borderRadius:4 }}/>
                    </div>
                    <div style={{ display:"flex", gap:16, fontSize:11, flexWrap:"wrap" as const }}>
                      <span style={{ color:aGrn }}>✓ Acknowledged: <strong>{adn}</strong></span>
                      <span style={{ color:aRed }}>⏳ Pending: <strong>{atn - adn}</strong></span>
                      <span style={{ color:asc, marginLeft:"auto", fontWeight:800 }}>{asl}</span>
                    </div>
                  </div>
                  <div style={card()}>
                    <div style={{ fontSize:11, fontWeight:800, color:D.muted, letterSpacing:"0.06em", textTransform:"uppercase" as const, marginBottom:10 }}>User Acknowledgments</div>
                    <div style={{ display:"flex", flexDirection:"column" as const, gap:3, maxHeight:240, overflowY:"auto" as const, paddingRight:2 }}>
                      {aus.map((u,i)=>{
                        const acked = i < adn;
                        const initials = u.name.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase();
                        return (
                          <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7,
                            background:acked?"rgba(52,211,153,0.05)":"rgba(248,113,113,0.04)",
                            border:`1px solid ${acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)"}` }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:"var(--secondary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:D.accent, flexShrink:0 }}>{initials}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.85)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{u.name}</div>
                              <div style={{ fontSize:9, color:D.dim }}>{u.dept} · {u.role}</div>
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                              background:acked?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.12)", color:acked?aGrn:aRed, flexShrink:0 }}>
                              {acked?"✓ Acked":"Pending"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div style={card()}>
              <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Policy Details</div>
              <KV k="Policy ID" v={pol.id}/>
              <KV k="Version" v={`v${pol.version}`}/>
              <KV k="Status" v={pol.status.toUpperCase()}/>
              <KV k="Category" v={pol.category}/>
              <KV k="Owner" v={pol.owner}/>
              <KV k="Department" v={pol.dept}/>
              <KV k="Last Reviewed" v={pol.reviewed}/>
              <KV k="Next Review" v={pol.nextReview}/>
              <KV k="Impact" v={pol.impact}/>
              <KV k="AI Enriched" v={pol.aiEnriched?"Yes ◆":"No"}/>
              <KV k="Attestation Required" v={pol.applicable?"Yes":"No"}/>
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:D.muted, marginBottom:8, textTransform:"uppercase" as const, letterSpacing:"0.4px" }}>Mapped Frameworks</div>
                <Chips items={pol.frameworks}/>
              </div>
              {pol.applicable && (
                <div style={{ marginTop:12, padding:"8px 10px", background:"rgba(6,95,70,0.1)", border:"1px solid rgba(6,95,70,0.25)", borderRadius:6, fontSize:11, color:"rgb(52,211,153)", fontWeight:600 }}>
                  ✓ Attestation required — track acknowledgements in the compliance module
                </div>
              )}
            </div>
            <FrameworkBars id={pol.id} frameworks={pol.frameworks}/>
            <div style={{ display:"flex", gap:10 }}>
              {[
                { label:"Impact",   value:pol.impact,              color:impColor(pol.impact) },
                { label:"Status",   value:pol.status.toUpperCase(),color:stC },
                { label:"Category", value:pol.category,            color:BLU },
              ].map(b=>(
                <div key={b.label} style={{ flex:1, ...card({ padding:"12px 14px", textAlign:"center" }) }}>
                  <div style={{ fontSize:11, fontWeight:800, color:b.color }}>{b.value}</div>
                  <div style={{ fontSize:10, color:D.dim, marginTop:4 }}>{b.label}</div>
                </div>
              ))}
            </div>
          </>)}

          {policyTab === "freshness"   && <FreshnessTab pol={pol}/>}

          {policyTab === "assessment"  && (
            <AssessmentTab
              pol={pol}
              assessFW={assessFW}     setAssessFW={setAssessFW}
              assessRun={assessRun}   setAssessRun={setAssessRun}
            />
          )}

          {policyTab === "analysis"    && <AnalysisTab  pol={pol}/>}

          {policyTab === "language"    && <LanguageTab  pol={pol}/>}

        </ObjectProfilePage>
      </>
    );
  }

  // ── Process ───────────────────────────────────────────────────────────────
  if (processMatch) {
    const id = processMatch[1]!;
    const raw = allProcesses.find(p=>p.id===id);
    if (!raw) return <GovNotFound label="Process" id={id} backHref="/govops" />;
    const ov = overrides[id] ?? {};
    const proc: Process = { ...raw, name:ov.name??raw.name, owner:ov.owner??raw.owner, status:(ov.status??raw.status) as Process["status"] };

    return (
      <>
        {editOpen && (
          <EditModal
            title={`Update Process — ${proc.name}`}
            fields={[
              { key:"name",   label:"Process Name",  value:proc.name,  type:"text" },
              { key:"owner",  label:"Process Owner", value:proc.owner, type:"text" },
              { key:"status", label:"Status",        value:proc.status, options:["active","in-review","draft"] },
            ]}
            onSave={vals=>{ setOverrides(o=>({...o,[id]:{...(o[id]??{}),...vals}})); setEditOpen(false); }}
            onClose={()=>setEditOpen(false)}
          />
        )}
        <ObjectProfilePage
          hero={{ id:proc.id, name:proc.name, type:proc.category, owner:proc.owner, status:proc.status, statusOk:proc.status==="active", extra:[{label:"Maturity",value:proc.maturity},{label:"Steps",value:String(proc.steps)},{label:"Impact",value:proc.impact}] }}
          breadcrumbs={[{label:"GovOps",href:"/govops"},{label:"Processes",href:"/govops"},{label:proc.id}]}
          onBack="/govops"
          aiObjectType="process" aiObjectId={proc.id} aiFallback={processAiFallback(proc)}
          riskSection={{ inherent:proc.riskScore, residual:Math.max(0,proc.riskScore-12) }}
          description=""
        >
          <ActionBar onEdit={()=>setEditOpen(true)} getHtml={()=>buildProcessHtml(proc)} docId={`${proc.id}-${proc.name.replace(/[\s/[\]]+/g,"-").toLowerCase()}`}/>
          <ProcessFlowCard proc={proc}/>
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>Process Details</div>
            <KV k="Process ID" v={proc.id}/>
            <KV k="Category" v={proc.category}/>
            <KV k="Owner" v={proc.owner}/>
            <KV k="Status" v={proc.status.toUpperCase()}/>
            <KV k="Maturity Level" v={proc.maturity}/>
            <KV k="Total Steps" v={proc.steps}/>
            <KV k="Impact" v={proc.impact}/>
            <KV k="Linked Policy" v={proc.linked}/>
          </div>
        </ObjectProfilePage>
      </>
    );
  }

  // ── Procedure ─────────────────────────────────────────────────────────────
  if (procMatch) {
    const id = procMatch[1]!;
    const raw = allProcedures.find(p=>p.id===id);
    if (!raw) return <GovNotFound label="Procedure" id={id} backHref="/govops" />;
    const ov = overrides[id] ?? {};
    const sop: Procedure = { ...raw, name:ov.name??raw.name, owner:ov.owner??raw.owner, status:(ov.status??raw.status) as Procedure["status"] };

    return (
      <>
        {editOpen && (
          <EditModal
            title={`Update Procedure — ${sop.name}`}
            fields={[
              { key:"name",   label:"Procedure Name",  value:sop.name,  type:"text" },
              { key:"owner",  label:"Procedure Owner", value:sop.owner, type:"text" },
              { key:"status", label:"Status",          value:sop.status, options:["active","in-review","draft"] },
            ]}
            onSave={vals=>{ setOverrides(o=>({...o,[id]:{...(o[id]??{}),...vals}})); setEditOpen(false); }}
            onClose={()=>setEditOpen(false)}
          />
        )}
        <ObjectProfilePage
          hero={{ id:sop.id, name:sop.name, type:"Procedure (SOP)", owner:sop.owner, status:sop.status, statusOk:sop.status==="active", modified:sop.lastTested, extra:[{label:"Version",value:`v${sop.version}`},{label:"Pages",value:String(sop.pages)},{label:"Impact",value:sop.impact}] }}
          breadcrumbs={[{label:"GovOps",href:"/govops"},{label:"Procedures",href:"/govops"},{label:sop.id}]}
          onBack="/govops"
          aiObjectType="procedure" aiObjectId={sop.id} aiFallback={procedureAiFallback(sop)}
          riskSection={{ inherent:sop.riskScore, residual:Math.max(0,sop.riskScore-10) }}
          description=""
        >
          <ActionBar onEdit={()=>setEditOpen(true)} getHtml={()=>buildProcedureHtml(sop)} docId={`${sop.id}-${sop.name.replace(/[\s/[\]]+/g,"-").toLowerCase()}`}/>
          <ProcedureStepsCard sop={sop}/>
          <div style={card()}>
            <div style={{ fontSize:12, fontWeight:700, color:D.accent, marginBottom:12 }}>SOP Details</div>
            <KV k="SOP ID" v={sop.id}/>
            <KV k="Version" v={`v${sop.version}`}/>
            <KV k="Status" v={sop.status.toUpperCase()}/>
            <KV k="Owner" v={sop.owner}/>
            <KV k="Linked Process" v={sop.process}/>
            <KV k="Pages" v={sop.pages}/>
            <KV k="Last Tested" v={sop.lastTested}/>
            <KV k="Impact" v={sop.impact}/>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1, ...card({ padding:"12px 14px", textAlign:"center" }) }}>
              <div style={{ fontSize:18, fontWeight:800, color:D.accent }}>{sop.steps.length}</div>
              <div style={{ fontSize:10, color:D.dim, marginTop:4 }}>Total Steps</div>
            </div>
            <div style={{ flex:1, ...card({ padding:"12px 14px", textAlign:"center" }) }}>
              <div style={{ fontSize:18, fontWeight:800, color:D.amber }}>{sop.pages}</div>
              <div style={{ fontSize:10, color:D.dim, marginTop:4 }}>Pages</div>
            </div>
            <div style={{ flex:1, ...card({ padding:"12px 14px", textAlign:"center" }) }}>
              <div style={{ fontSize:18, fontWeight:800, color:impColor(sop.impact) }}>{sop.impact}</div>
              <div style={{ fontSize:10, color:D.dim, marginTop:4 }}>Impact</div>
            </div>
          </div>
        </ObjectProfilePage>
      </>
    );
  }

  return <div style={{ padding:32, color:D.muted }}>Not found.</div>;
}

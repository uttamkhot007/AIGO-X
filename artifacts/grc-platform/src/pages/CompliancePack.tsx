// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/context/ThemeContext";
import { COMPLIANCE_PACKS, getCompliancePack } from "@/lib/compliance-packs";
import type { CompliancePack as CPType } from "@/lib/compliance-packs";

// ── Colours ───────────────────────────────────────────────────────────────────
const TABS = [
  { id:"overview",    label:"Overview",         icon:"🏠" },
  { id:"implement",   label:"Implementation",   icon:"🗺" },
  { id:"policies",    label:"Policy Library",   icon:"📋" },
  { id:"controls",    label:"Controls & SOPs",  icon:"⚙️" },
  { id:"checklist",   label:"Audit Checklist",  icon:"✅" },
  { id:"evidence",    label:"Evidence Req.",    icon:"🗂" },
  { id:"gap",         label:"Gap Assessment",   icon:"📊" },
  { id:"soa",         label:"SOA / RACI",       icon:"📑" },
  { id:"timeline",    label:"Timeline",         icon:"📅" },
  { id:"documents",   label:"Documents",        icon:"📁" },
];

function mkT(isDark: boolean) {
  return {
    bg:      isDark ? "var(--card)"          : "#ffffff",
    bg2:     isDark ? "var(--input)"          : "#F8FAFC",
    bg3:     isDark ? "var(--secondary)"          : "#EFF6FF",
    card:    isDark ? "var(--secondary)" : "rgba(0,0,0,0.025)",
    border:  isDark ? "var(--border)" : "rgba(0,0,0,0.08)",
    border2: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    text:    isDark ? "var(--foreground)"       : "rgb(15,23,42)",
    muted:   isDark ? "rgb(148,163,184)"       : "rgb(100,116,139)",
    accent:  isDark ? "rgb(147,197,253)"       : "rgb(37,99,235)",
    green:   isDark ? "rgb(52,211,153)"        : "rgb(5,150,105)",
    amber:   isDark ? "rgb(251,191,36)"        : "rgb(217,119,6)",
    red:     isDark ? "rgb(248,113,113)"       : "rgb(220,38,38)",
  };
}

function pill(color: string, bg: string, text: string) {
  return <span style={{ background: bg, color, border:`1px solid ${color}33`, borderRadius:4, fontSize:10, fontWeight:700, padding:"2px 8px", letterSpacing:"0.4px" }}>{text}</span>;
}

function SectionTitle({ children, T }: { children: string; T: ReturnType<typeof mkT> }) {
  return <div style={{ fontSize:13, fontWeight:800, color:T.accent, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.5px" }}>{children}</div>;
}

function Card({ children, T, style={} }: { children: React.ReactNode; T: ReturnType<typeof mkT>; style?: React.CSSProperties }) {
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:"18px 20px", ...style }}>
      {children}
    </div>
  );
}

// ── Pack selector card on the list page ───────────────────────────────────────
function PackCard({ pack, onClick, T }: { pack: CPType; onClick: ()=>void; T: ReturnType<typeof mkT> }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ background: hover ? T.bg3 : T.card, border:`1px solid ${hover ? pack.color+"66" : T.border}`, borderRadius:14, padding:"20px 22px", cursor:"pointer", transition:"all 0.15s", position:"relative", overflow:"hidden" }}
    >
      <div style={{ position:"absolute", top:0, left:0, width:4, height:"100%", background:pack.color, borderRadius:"14px 0 0 14px" }}/>
      <div style={{ paddingLeft:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:10, fontWeight:700, color:pack.color, textTransform:"uppercase", letterSpacing:"0.6px" }}>{pack.category}</span>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T.muted, background:T.card, border:`1px solid ${T.border}`, borderRadius:6, padding:"2px 8px", display:"flex", alignItems:"center", gap:4 }}>
              <span>{pack.flag}</span><span style={{ fontSize:10 }}>{pack.region}</span>
            </span>
            <span style={{ fontSize:9, color:T.muted }}>{pack.version}</span>
          </div>
        </div>
        <div style={{ fontSize:16, fontWeight:800, color:T.text, marginBottom:4 }}>{pack.shortName}</div>
        <div style={{ fontSize:11, color:T.muted, marginBottom:12, lineHeight:1.5 }}>{pack.tagline}</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:T.muted }}>🛡 {pack.controlCount} controls</span>
          <span style={{ fontSize:10, color:T.muted }}>📋 {pack.policyCount} policies</span>
          <span style={{ fontSize:10, color:T.muted }}>⏱ {pack.totalWeeks} weeks</span>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      {/* Certification path */}
      <Card T={T} style={{ gridColumn:"1 / -1" }}>
        <SectionTitle T={T}>Certification / Compliance Path</SectionTitle>
        <div style={{ display:"flex", gap:0, overflowX:"auto", paddingBottom:4 }}>
          {pack.certificationStages.map((s, i) => (
            <div key={s.stage} style={{ flex:1, minWidth:140, display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
              {i < pack.certificationStages.length - 1 && (
                <div style={{ position:"absolute", top:18, left:"50%", width:"100%", height:2, background:`linear-gradient(90deg, ${pack.color}55, ${pack.color}11)`, zIndex:0 }}/>
              )}
              <div style={{ width:36, height:36, borderRadius:"50%", background:`${pack.color}22`, border:`2px solid ${pack.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:pack.color, position:"relative", zIndex:1 }}>{s.stage}</div>
              <div style={{ fontSize:11, fontWeight:700, color:T.text, marginTop:8, textAlign:"center", lineHeight:1.3 }}>{s.title}</div>
              <div style={{ fontSize:10, color:T.muted, textAlign:"center", marginTop:2 }}>{s.duration}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Key stats */}
      <Card T={T}>
        <SectionTitle T={T}>Pack Summary</SectionTitle>
        {[
          ["Framework", pack.name],
          ["Version", pack.version],
          ["Category", pack.category],
          ["Certification Body", pack.certBody.split("(")[0].trim()],
          ["Implementation Duration", `${pack.totalWeeks} weeks`],
          ["Controls in Scope", String(pack.controlCount)],
          ["Required Policies", String(pack.policyCount)],
          ["Procedures / SOPs", String(pack.procedures.length)],
          ["Core Registers", String(pack.registers.length)],
        ].map(([k,v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${T.border}`, fontSize:12 }}>
            <span style={{ color:T.muted }}>{k}</span>
            <span style={{ color:T.text, fontWeight:600 }}>{v}</span>
          </div>
        ))}
      </Card>

      {/* Cert types */}
      <Card T={T}>
        <SectionTitle T={T}>Audit Types</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          {pack.certTypes.map((c,i) => (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 12px", background:T.bg2, borderRadius:8, fontSize:12 }}>
              <span style={{ color:pack.color, marginTop:1 }}>▸</span>
              <span style={{ color:T.text }}>{c}</span>
            </div>
          ))}
        </div>
        <SectionTitle T={T}>Core Registers</SectionTitle>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {pack.registers.map(r => (
            <span key={r} style={{ fontSize:10, padding:"4px 10px", borderRadius:20, background:T.bg3, border:`1px solid ${T.border}`, color:T.text }}>{r}</span>
          ))}
        </div>
      </Card>

      {/* Automation highlights */}
      <Card T={T} style={{ gridColumn:"1 / -1" }}>
        <SectionTitle T={T}>Automation Capabilities</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:12 }}>
          {pack.automations.map(a => (
            <div key={a.title} style={{ background:T.bg2, borderRadius:10, padding:"12px 14px", border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.accent, marginBottom:6 }}>⚡ {a.title}</div>
              <div style={{ fontSize:11, color:T.muted, marginBottom:8, lineHeight:1.5 }}>{a.description}</div>
              <div style={{ fontSize:10, color:T.green }}>↳ {a.output}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Implementation Tab ────────────────────────────────────────────────────────
function ImplementTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const [open, setOpen] = useState<number>(1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {pack.phases.map(ph => (
        <div key={ph.phase} style={{ border:`1px solid ${open===ph.phase ? pack.color+"55" : T.border}`, borderRadius:12, overflow:"hidden" }}>
          <div
            onClick={() => setOpen(open===ph.phase ? 0 : ph.phase)}
            style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", cursor:"pointer", background: open===ph.phase ? `${pack.color}11` : T.card }}
          >
            <div style={{ width:32, height:32, borderRadius:"50%", background:`${pack.color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{ph.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:T.text }}>Phase {ph.phase} — {ph.title}</div>
              <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{ph.weeks}</div>
            </div>
            <span style={{ color:T.muted, fontSize:14 }}>{open===ph.phase ? "▲" : "▼"}</span>
          </div>
          {open===ph.phase && (
            <div style={{ padding:"16px 18px 18px", borderTop:`1px solid ${T.border}` }}>
              <div style={{ fontSize:12, color:T.muted, marginBottom:16, lineHeight:1.6 }}>{ph.description}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.4px" }}>Tasks</div>
                  {ph.tasks.map((t, i) => (
                    <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:`${pack.color}22`, border:`1px solid ${pack.color}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:pack.color, flexShrink:0, marginTop:1 }}>{i+1}</div>
                      <div>
                        <div style={{ fontSize:12, color:T.text, lineHeight:1.5 }}>{t.task}</div>
                        {t.automation && <div style={{ fontSize:10, color:T.green, marginTop:2 }}>⚡ {t.automation}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.4px" }}>Deliverables</div>
                  {ph.deliverables.map((d, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ color:T.green, fontSize:12 }}>✓</span>
                      <span style={{ fontSize:12, color:T.text }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Policy Library Tab ────────────────────────────────────────────────────────
function PoliciesTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const mandatory = pack.policies.filter(p => p.mandatory);
  const optional  = pack.policies.filter(p => !p.mandatory);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <Card T={T}>
        <SectionTitle T={T}>Mandatory Policies ({mandatory.length})</SectionTitle>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {mandatory.map(p => (
            <div key={p.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
              <div style={{ width:36, flexShrink:0, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.muted, paddingTop:2 }}>{p.id}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{p.name}</span>
                  {pill(pack.color, `${pack.color}15`, "MANDATORY")}
                </div>
                <div style={{ fontSize:11, color:T.muted, marginBottom:4, lineHeight:1.5 }}>{p.description}</div>
                <div style={{ fontSize:10, color:T.muted }}>Owner: <span style={{ color:T.text }}>{p.owner}</span></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {optional.length > 0 && (
        <Card T={T}>
          <SectionTitle T={T}>Additional Policies ({optional.length})</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {optional.map(p => (
              <div key={p.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
                <div style={{ width:36, flexShrink:0, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.muted, paddingTop:2 }}>{p.id}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{p.name}</span>
                    {pill("#9CA3AF", "#9CA3AF15", "RECOMMENDED")}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{p.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Controls & SOPs Tab ───────────────────────────────────────────────────────
function ControlsTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const [openSop, setOpenSop] = useState<string|null>(null);
  const categories = Array.from(new Set(pack.procedures.map(p => p.category)));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {categories.map(cat => (
        <Card key={cat} T={T}>
          <SectionTitle T={T}>{cat}</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {pack.procedures.filter(p=>p.category===cat).map(sop => (
              <div key={sop.id} style={{ border:`1px solid ${openSop===sop.id ? pack.color+"55" : T.border}`, borderRadius:10, overflow:"hidden" }}>
                <div
                  onClick={() => setOpenSop(openSop===sop.id ? null : sop.id)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", cursor:"pointer", background: openSop===sop.id ? `${pack.color}11` : T.bg2 }}
                >
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.muted, flexShrink:0 }}>{sop.id}</span>
                  <span style={{ flex:1, fontSize:13, fontWeight:700, color:T.text }}>{sop.name}</span>
                  <span style={{ color:T.muted, fontSize:12 }}>{openSop===sop.id ? "▲" : "▼"}</span>
                </div>
                {openSop===sop.id && (
                  <div style={{ padding:"12px 14px 14px", borderTop:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:12, color:T.muted, marginBottom:12, lineHeight:1.6 }}>{sop.description}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:T.accent, marginBottom:8, textTransform:"uppercase" }}>Step-by-Step Procedure</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                      {sop.steps.map((step, i) => (
                        <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background:`${pack.color}22`, border:`1px solid ${pack.color}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:pack.color, flexShrink:0, fontFamily:"'JetBrains Mono',monospace" }}>{i+1}</div>
                          <div style={{ fontSize:12, color:T.text, lineHeight:1.6, paddingTop:2 }}>{step}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Audit Checklist Tab ───────────────────────────────────────────────────────
function ChecklistTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setChecked(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });
  const all = pack.auditChecklist.flatMap(d => d.items);
  const done = all.filter((_,i) => checked.has(`${i}`)).length;
  const pct = Math.round((done/all.length)*100);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Progress bar */}
      <Card T={T}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:T.text }}>Checklist Progress</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:800, color: pct===100 ? T.green : T.accent }}>{done}/{all.length} — {pct}%</span>
        </div>
        <div style={{ height:8, background:T.bg3, borderRadius:4, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${pack.color}88,${pack.color})`, borderRadius:4, transition:"width 0.3s" }}/>
        </div>
      </Card>
      {pack.auditChecklist.map(dom => {
        const base = pack.auditChecklist.flatMap(d=>d.items).indexOf(dom.items[0]);
        return (
          <Card key={dom.domain} T={T}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <span style={{ fontSize:18 }}>{dom.icon}</span>
              <SectionTitle T={T}>{dom.domain}</SectionTitle>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {dom.items.map((item, i) => {
                const globalIdx = pack.auditChecklist.slice(0, pack.auditChecklist.indexOf(dom)).flatMap(d=>d.items).length + i;
                const key = String(globalIdx);
                const isChecked = checked.has(key);
                return (
                  <div key={i}
                    onClick={() => toggle(key)}
                    style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:8, cursor:"pointer", background: isChecked ? `${T.green}11` : T.bg2, border:`1px solid ${isChecked ? T.green+"44" : T.border}`, transition:"all 0.15s" }}
                  >
                    <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${isChecked ? T.green : T.border}`, background: isChecked ? T.green : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                      {isChecked && <span style={{ color:"#fff", fontSize:11 }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, color: isChecked ? T.muted : T.text, textDecoration: isChecked ? "line-through" : "none", lineHeight:1.5 }}>{item.item}</div>
                      {item.evidence && <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>📎 {item.evidence}</div>}
                    </div>
                    {item.required && <span style={{ fontSize:9, color:"#EF4444", fontWeight:700, flexShrink:0 }}>REQUIRED</span>}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Evidence Requirements Tab ─────────────────────────────────────────────────
function EvidenceTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {pack.evidenceRequirements.map(ev => (
        <Card key={ev.control} T={T}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:800, color:T.text }}>{ev.control}</div>
            <span style={{ fontSize:10, padding:"3px 10px", borderRadius:20, background:`${pack.color}22`, color:pack.color, fontWeight:700 }}>{ev.frequency}</span>
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:6 }}>Evidence Type</div>
          <div style={{ fontSize:12, color:T.text, marginBottom:12 }}>{ev.evidenceType}</div>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:8 }}>Required Examples</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {ev.examples.map((ex, i) => (
              <div key={i} style={{ display:"flex", gap:8, padding:"7px 10px", background:T.bg2, borderRadius:8, fontSize:12 }}>
                <span style={{ color:pack.color }}>📎</span>
                <span style={{ color:T.text }}>{ex}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Gap Assessment Tab ────────────────────────────────────────────────────────
function GapTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const [answers, setAnswers] = useState<Record<string,"yes"|"partial"|"no"|null>>({});
  const setAnswer = (id: string, v: "yes"|"partial"|"no") => setAnswers(prev => ({ ...prev, [id]: v }));
  const allQ = pack.gapQuestionnaire.flatMap(s => s.questions);
  const answered = allQ.filter(q => answers[q.id] != null);
  const score = answered.reduce((sum, q) => {
    const v = answers[q.id];
    return sum + (v==="yes" ? q.weight : v==="partial" ? q.weight * 0.5 : 0);
  }, 0);
  const maxScore = allQ.reduce((s,q) => s + q.weight, 0);
  const pct = maxScore ? Math.round((score/maxScore)*100) : 0;
  const readiness = pct>=80 ? { label:"Certification Ready", color:"#10B981" } : pct>=60 ? { label:"Mostly Ready", color:"#F59E0B" } : pct>=40 ? { label:"Partially Ready", color:"#F97316" } : { label:"Significant Gaps", color:"#EF4444" };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Score card */}
      <Card T={T}>
        <div style={{ display:"flex", alignItems:"center", gap:24 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:42, fontWeight:900, fontFamily:"'JetBrains Mono',monospace", color:readiness.color }}>{pct}%</div>
            <div style={{ fontSize:11, color:readiness.color, fontWeight:700 }}>{readiness.label}</div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
              <span style={{ color:T.muted }}>Readiness Score</span>
              <span style={{ color:T.text, fontWeight:700 }}>{answered.length}/{allQ.length} answered</span>
            </div>
            <div style={{ height:12, background:T.bg3, borderRadius:6, overflow:"hidden", marginBottom:8 }}>
              <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${readiness.color}88,${readiness.color})`, borderRadius:6, transition:"width 0.3s" }}/>
            </div>
            <div style={{ fontSize:11, color:T.muted }}>Answer all questions to see your complete gap profile. Partial = 50% credit.</div>
          </div>
        </div>
      </Card>
      {/* Questions */}
      {pack.gapQuestionnaire.map(section => (
        <Card key={section.section} T={T}>
          <SectionTitle T={T}>{section.section}</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {section.questions.map(q => (
              <div key={q.id} style={{ padding:"12px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:12, color:T.text, marginBottom:10, lineHeight:1.5 }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.muted, marginRight:8 }}>{q.id}</span>
                  {q.question}
                  <span style={{ fontSize:10, color:T.muted, marginLeft:8 }}>(weight: {q.weight})</span>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {(["yes","partial","no"] as const).map(opt => {
                    const color = opt==="yes" ? T.green : opt==="partial" ? T.amber : T.red;
                    const active = answers[q.id]===opt;
                    return (
                      <button key={opt} onClick={() => setAnswer(q.id, opt)} style={{ padding:"5px 14px", borderRadius:6, border:`1px solid ${active ? color : T.border}`, background: active ? `${color}22` : T.card, color: active ? color : T.muted, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textTransform:"capitalize" }}>
                        {opt==="yes"?"✅ Yes":opt==="partial"?"⚠️ Partial":"❌ No"}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── SOA / RACI Tab ────────────────────────────────────────────────────────────
function SoaRaciTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const [view, setView] = useState<"soa"|"raci">("soa");
  const hasSoa = pack.soa && pack.soa.length > 0;
  const statusColor = (s: string) => s==="implemented" ? T.green : s==="partial" ? T.amber : s==="not-applicable" ? T.muted : T.red;
  const statusLabel = (s: string) => s==="implemented" ? "✅ Implemented" : s==="partial" ? "⚠️ Partial" : s==="not-applicable" ? "— N/A" : "🔴 Planned";
  const annexGroups = hasSoa ? Array.from(new Set(pack.soa!.map(c=>c.annex))) : [];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:8 }}>
        {(hasSoa ? ["soa","raci"] as const : ["raci"] as const).map(v => (
          <button key={v} onClick={()=>setView(v)} style={{ padding:"7px 18px", borderRadius:8, border:`1px solid ${view===v ? pack.color : T.border}`, background: view===v ? `${pack.color}22` : T.card, color: view===v ? pack.color : T.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {v==="soa" ? "📑 Statement of Applicability (SOA)" : "👥 RACI Matrix"}
          </button>
        ))}
      </div>

      {view==="soa" && hasSoa && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Card T={T}>
            <div style={{ display:"flex", gap:16, marginBottom:4 }}>
              {[["✅ Implemented", T.green], ["⚠️ Partial", T.amber], ["🔴 Planned", T.red], ["— N/A", T.muted]].map(([l,c]) => (
                <span key={l} style={{ fontSize:11, color:c as string, fontWeight:600 }}>{l as string}</span>
              ))}
            </div>
          </Card>
          {annexGroups.map(annex => (
            <Card key={annex} T={T}>
              <SectionTitle T={T}>{annex}</SectionTitle>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                      <th style={{ textAlign:"left", padding:"6px 8px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase", width:70 }}>Control ID</th>
                      <th style={{ textAlign:"left", padding:"6px 8px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>Control Name</th>
                      <th style={{ textAlign:"center", padding:"6px 8px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase", width:80 }}>Applicable</th>
                      <th style={{ textAlign:"left", padding:"6px 8px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase", width:120 }}>Status</th>
                      <th style={{ textAlign:"left", padding:"6px 8px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>Justification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.soa!.filter(c=>c.annex===annex).map(c => (
                      <tr key={c.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"8px 8px", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.muted }}>{c.id}</td>
                        <td style={{ padding:"8px 8px", color:T.text }}>{c.name}</td>
                        <td style={{ padding:"8px 8px", textAlign:"center" }}><span style={{ fontSize:14 }}>{c.applicable ? "✅" : "❌"}</span></td>
                        <td style={{ padding:"8px 8px", color:statusColor(c.implStatus), fontSize:11, fontWeight:600 }}>{statusLabel(c.implStatus)}</td>
                        <td style={{ padding:"8px 8px", color:T.muted, fontSize:11 }}>{c.justification}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {view==="raci" && (
        <Card T={T}>
          <SectionTitle T={T}>RACI Matrix</SectionTitle>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                  <th style={{ textAlign:"left", padding:"8px 10px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase" }}>Activity</th>
                  {["Responsible","Accountable","Consulted","Informed"].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:T.muted, fontWeight:700, fontSize:10, textTransform:"uppercase", minWidth:100 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pack.raciMatrix.map((r, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${T.border}`, background: i%2===0 ? "transparent" : T.bg2 }}>
                    <td style={{ padding:"9px 10px", color:T.text, fontWeight:600 }}>{r.activity}</td>
                    <td style={{ padding:"9px 10px", color:T.green }}>{r.responsible}</td>
                    <td style={{ padding:"9px 10px", color:T.accent }}>{r.accountable}</td>
                    <td style={{ padding:"9px 10px", color:T.muted, fontSize:11 }}>{r.consulted}</td>
                    <td style={{ padding:"9px 10px", color:T.muted, fontSize:11 }}>{r.informed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex", gap:16, marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`, fontSize:11 }}>
            <span style={{ color:T.green }}>● Responsible — Does the work</span>
            <span style={{ color:T.accent }}>● Accountable — Owns the outcome</span>
            <span style={{ color:T.muted }}>○ Consulted — Provides input &nbsp; | &nbsp; ○ Informed — Kept up to date</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Timeline Tab ──────────────────────────────────────────────────────────────
function TimelineTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const phases = Array.from(new Set(pack.timeline.map(w => w.phase)));
  const phaseColors: Record<string,string> = {};
  phases.forEach((p, i) => {
    const colors = [pack.color,"#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4"];
    phaseColors[p] = colors[i % colors.length]!;
  });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <Card T={T}>
        <SectionTitle T={T}>Implementation Timeline — {pack.totalWeeks} Weeks</SectionTitle>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
          {phases.map(p => (
            <span key={p} style={{ fontSize:10, padding:"3px 10px", borderRadius:20, background:`${phaseColors[p]}22`, border:`1px solid ${phaseColors[p]}55`, color:phaseColors[p] }}>{p}</span>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {pack.timeline.map((w, i) => (
            <div key={i} style={{ display:"flex", gap:0, alignItems:"stretch" }}>
              {/* Timeline connector */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:32, flexShrink:0 }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background:phaseColors[w.phase]!, border:`2px solid ${phaseColors[w.phase]}`, marginTop:16, flexShrink:0 }}/>
                {i < pack.timeline.length - 1 && <div style={{ width:2, flex:1, background:`${phaseColors[w.phase]}33`, minHeight:24 }}/>}
              </div>
              {/* Content */}
              <div style={{ flex:1, padding:"12px 14px 16px 8px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:phaseColors[w.phase], fontWeight:700, minWidth:50 }}>{w.week}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{w.label}</span>
                  <span style={{ fontSize:9, padding:"2px 8px", borderRadius:20, background:`${phaseColors[w.phase]}15`, color:phaseColors[w.phase], fontWeight:700, letterSpacing:"0.3px" }}>{w.phase}</span>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {w.milestones.map((m, j) => (
                    <span key={j} style={{ fontSize:11, color:T.text, padding:"4px 10px", background:T.bg2, borderRadius:20, border:`1px solid ${T.border}` }}>🏁 {m}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ pack, T }: { pack: CPType; T: ReturnType<typeof mkT> }) {
  const typeIcon: Record<string, string> = {
    policy:"📋", charter:"📜", register:"🗂", report:"📊", plan:"🗺", form:"📝", procedure:"⚙️", assessment:"📊", checklist:"✅",
  };
  const required = pack.documents.filter(d => d.required);
  const optional = pack.documents.filter(d => !d.required);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <Card T={T}>
        <SectionTitle T={T}>Required Documents ({required.length})</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:10 }}>
          {required.map(doc => (
            <div key={doc.name} style={{ padding:"12px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{typeIcon[doc.type] ?? "📄"}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:2 }}>{doc.name}</div>
                  <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, background:`${pack.color}15`, color:pack.color, fontWeight:700, textTransform:"uppercase" }}>{doc.type}</span>
                </div>
              </div>
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{doc.description}</div>
            </div>
          ))}
        </div>
      </Card>
      {optional.length > 0 && (
        <Card T={T}>
          <SectionTitle T={T}>Optional / Recommended ({optional.length})</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:10 }}>
            {optional.map(doc => (
              <div key={doc.name} style={{ padding:"12px 14px", background:T.bg2, borderRadius:10, border:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:18 }}>{typeIcon[doc.type] ?? "📄"}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:2 }}>{doc.name}</div>
                    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, background:"#9CA3AF15", color:"#9CA3AF", fontWeight:700, textTransform:"uppercase" }}>{doc.type}</span>
                  </div>
                </div>
                <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{doc.description}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Main CompliancePack page ───────────────────────────────────────────────────
export default function CompliancePack() {
  const [location, navigate] = useLocation();
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const T = mkT(isDark);

  // Route: /complianceops/packs/:id or /complianceops/packs (list)
  const match = location.match(/^\/complianceops\/packs\/(.+)$/);
  const activeId = match ? match[1] : null;
  const pack = activeId ? getCompliancePack(activeId) : null;

  const [tab, setTab] = useState("overview");

  // ── Pack list page ────────────────────────────────────────────────────────
  if (!activeId) {
    return (
      <div style={{ minHeight:"100vh", background:T.bg, padding:"28px 32px" }}>
        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, fontSize:12, color:T.muted }}>
            <span onClick={() => navigate("/complianceops")} style={{ cursor:"pointer", color:T.accent }}>ComplianceOps</span>
            <span>›</span>
            <span>Compliance Packs</span>
          </div>
          <div style={{ fontSize:24, fontWeight:900, color:T.text, marginBottom:6 }}>Compliance Packs</div>
          <div style={{ fontSize:13, color:T.muted, maxWidth:640 }}>
            Enterprise-grade compliance implementation kits — from planning to certification. Each pack contains policies, controls, SOPs, audit checklists, evidence requirements, gap assessments, RACI matrices, timelines, and SOA.
          </div>
        </div>

        {/* Pack grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:16 }}>
          {COMPLIANCE_PACKS.map(p => (
            <PackCard key={p.id} pack={p} T={T} onClick={() => navigate(`/complianceops/packs/${p.id}`)} />
          ))}
        </div>

        {/* What's inside banner */}
        <div style={{ marginTop:32, background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontSize:13, fontWeight:800, color:T.accent, marginBottom:12 }}>What's inside each Compliance Pack</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:10 }}>
            {[
              ["🗺","Implementation Guide","Phase-by-phase roadmap with tasks and automation hints"],
              ["📋","Policy Library","All mandatory and recommended policies with owner mapping"],
              ["⚙️","Controls & SOPs","Step-by-step operating procedures for every domain"],
              ["✅","Audit Checklist","Interactive People / Process / Technology checklist"],
              ["🗂","Evidence Requirements","What evidence to collect for each control domain"],
              ["📊","Gap Assessment","Weighted readiness questionnaire with live scoring"],
              ["📑","SOA / RACI","Statement of Applicability + complete RACI matrix"],
              ["📅","Timeline","Week-by-week implementation Gantt with milestones"],
              ["📁","Document Library","All required forms, templates, and sample documents"],
              ["⚡","Automations","AI-assisted evidence collection and auto-generation capabilities"],
            ].map(([icon,title,desc]) => (
              <div key={title} style={{ display:"flex", gap:8, padding:"8px 0" }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{title}</div>
                  <div style={{ fontSize:10, color:T.muted, lineHeight:1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Pack not found ────────────────────────────────────────────────────────
  if (!pack) {
    return (
      <div style={{ padding:32, color:T.muted }}>
        Compliance Pack "{activeId}" not found. <span onClick={() => navigate("/complianceops/packs")} style={{ color:T.accent, cursor:"pointer" }}>← Back to packs</span>
      </div>
    );
  }

  // ── Pack detail page ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:T.bg }}>
      {/* Hero header */}
      <div style={{ background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:"20px 32px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, fontSize:12, color:T.muted }}>
          <span onClick={() => navigate("/complianceops")} style={{ cursor:"pointer", color:T.accent }}>ComplianceOps</span>
          <span>›</span>
          <span onClick={() => navigate("/complianceops/packs")} style={{ cursor:"pointer", color:T.accent }}>Compliance Packs</span>
          <span>›</span>
          <span>{pack.shortName}</span>
        </div>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:`${pack.color}22`, border:`2px solid ${pack.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
              {pack.category==="AI Governance" ? "🤖" : pack.category==="Regulatory" ? "🏛" : "🛡"}
            </div>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:9, fontWeight:700, color:pack.color, textTransform:"uppercase", letterSpacing:"0.8px", padding:"2px 8px", borderRadius:4, background:`${pack.color}22`, border:`1px solid ${pack.color}44` }}>{pack.category}</span>
                <span style={{ fontSize:9, color:T.muted }}>v{pack.version}</span>
              </div>
              <div style={{ fontSize:22, fontWeight:900, color:T.text }}>{pack.name}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>{pack.tagline}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:24, alignItems:"center" }}>
            {[
              [pack.controlCount, "Controls"],
              [pack.policyCount, "Policies"],
              [`${pack.totalWeeks}w`, "Duration"],
            ].map(([v,l]) => (
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:900, color:pack.color, fontFamily:"'JetBrains Mono',monospace" }}>{v}</div>
                <div style={{ fontSize:10, color:T.muted }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex", gap:0, overflowX:"auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"10px 16px", border:"none", borderBottom: tab===t.id ? `2px solid ${pack.color}` : "2px solid transparent", background:"transparent", color: tab===t.id ? pack.color : T.muted, fontSize:12, fontWeight: tab===t.id ? 700 : 500, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", transition:"color 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding:"24px 32px", maxWidth:1200 }}>
        {tab==="overview"  && <OverviewTab   pack={pack} T={T} />}
        {tab==="implement" && <ImplementTab  pack={pack} T={T} />}
        {tab==="policies"  && <PoliciesTab   pack={pack} T={T} />}
        {tab==="controls"  && <ControlsTab   pack={pack} T={T} />}
        {tab==="checklist" && <ChecklistTab  pack={pack} T={T} />}
        {tab==="evidence"  && <EvidenceTab   pack={pack} T={T} />}
        {tab==="gap"       && <GapTab        pack={pack} T={T} />}
        {tab==="soa"       && <SoaRaciTab    pack={pack} T={T} />}
        {tab==="timeline"  && <TimelineTab   pack={pack} T={T} />}
        {tab==="documents" && <DocumentsTab  pack={pack} T={T} />}
      </div>
    </div>
  );
}
